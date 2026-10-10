/*
 * NoSponsor – content script.
 *
 * Non rimuove mai nodi dal DOM: marca gli elementi con la classe .nsp-hit e
 * lascia al CSS (content.css) il compito di evidenziarli, comprimerli o
 * nasconderli. Così i siti costruiti con React/Vue non si rompono e il cambio
 * di modalità dal popup è istantaneo, senza riscansionare la pagina.
 */
(() => {
  if (window.__nspLoaded) return;
  window.__nspLoaded = true;

  const DEFAULTS = { mode: 'highlight', generic: true, disabledHosts: [] };
  const HOST = location.hostname.replace(/^www\./, '');
  const SITE = self.NSP_SITES.find((s) => s.match.test(location.hostname)) || null;
  const MAX_CONTAINER_TEXT = 15000; // oltre, il "contenitore" è quasi certamente la pagina intera
  const FORBIDDEN = 'html, body, main, [role="main"], #search, #rso, #rcnt, #center_col, #a-page';

  let settings = { ...DEFAULTS };

  // ---------------------------------------------------------------- utilità

  const ZERO_WIDTH = /[​-‍⁠﻿­]/g;
  const EDGE_PUNCT = /^[\s·•|:\-–—()[\]]+|[\s·•|:\-–—()[\]]+$/g;

  function norm(text) {
    return (text || '')
      .replace(ZERO_WIDTH, '')
      .replace(/\s+/g, ' ')
      .toLowerCase()
      .replace(EDGE_PUNCT, '');
  }

  function labelMatch(text, labels) {
    const t = norm(text);
    if (!t || t.length > 80) return false;
    return labels.some((l) => (l.endsWith('*') ? t.startsWith(l.slice(0, -1)) : t === l));
  }

  function config() {
    if (SITE) return SITE;
    return settings.generic ? self.NSP_GENERIC : null;
  }

  // Un elemento è visibile se né lui né i suoi antenati (fino a `stop`)
  // sono nascosti con i trucchi tipici dell'offuscamento.
  function isVisible(el, stop) {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.visibility === 'collapse') return false;
      if (parseFloat(cs.opacity) === 0 || parseFloat(cs.fontSize) === 0) return false;
      if (cs.position === 'absolute' && (parseFloat(cs.width) <= 1 || parseFloat(cs.height) <= 1) && cs.overflow === 'hidden') return false;
      if (n === stop) break;
    }
    return true;
  }

  // Testo realmente visibile, ricostruito nell'ordine in cui appare a schermo
  // (gestisce lettere nascoste e riordinate con flex `order`).
  function visibleText(el) {
    const parts = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let tn = walker.nextNode(); tn; tn = walker.nextNode()) {
      if (!tn.nodeValue.trim()) continue;
      if (!isVisible(tn.parentElement, el)) continue;
      range.selectNodeContents(tn);
      const r = range.getBoundingClientRect();
      if (r.width < 0.5 || r.height < 0.5) continue;
      parts.push({ t: tn.nodeValue, x: r.left, y: Math.round(r.top / 6) });
    }
    parts.sort((a, b) => a.y - b.y || a.x - b.x);
    return parts.map((p) => p.t).join('');
  }

  function queryAll(root, sel) {
    const out = [];
    if (root.matches?.(sel)) out.push(root);
    root.querySelectorAll?.(sel).forEach((e) => out.push(e));
    return out;
  }

  function findContainer(el, cfg) {
    for (const sel of cfg.container) {
      const c = el.closest(sel);
      if (!c || c.matches(FORBIDDEN)) continue;
      if ((c.textContent || '').length > MAX_CONTAINER_TEXT) continue;
      return c;
    }
    return null;
  }

  // --------------------------------------------------------------- marcatura

  function mark(el, reason) {
    if (!el || el.nodeType !== 1) return;
    if (el.tagName === 'IFRAME' || el.tagName === 'IMG') el = el.parentElement;
    if (!el || el.matches(FORBIDDEN)) return;
    if (el.closest('.nsp-hit')) return; // già coperto da un antenato
    el.querySelectorAll('.nsp-hit').forEach(unmark); // l'antenato assorbe i figli
    el.classList.add('nsp-hit');
    el.dataset.nspReason = reason;
    if (getComputedStyle(el).position === 'static') el.classList.add('nsp-rel');
    updateInset(el);
  }

  // Il bordo sta 6px fuori dal blocco e il badge sporge sopra di ~16px:
  // se un antenato con overflow li taglierebbe, uso la variante interna.
  function updateInset(el) {
    const r = el.getBoundingClientRect();
    let clipped = r.left < 10 || r.top + window.scrollY < 18;
    for (let n = el.parentElement, i = 0; !clipped && n && n !== document.body && i < 10; n = n.parentElement, i++) {
      const cs = getComputedStyle(n);
      if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
      const p = n.getBoundingClientRect();
      clipped = r.left - p.left < 10 || p.right - r.right < 10 || r.top - p.top < 18 || p.bottom - r.bottom < 10;
    }
    el.classList.toggle('nsp-inset', clipped);
  }

  function unmark(el) {
    el.classList.remove('nsp-hit', 'nsp-rel', 'nsp-open', 'nsp-inset');
    delete el.dataset.nspReason;
  }

  function unmarkAll() {
    document.querySelectorAll('.nsp-hit').forEach(unmark);
  }

  // ------------------------------------------------------------------ scan

  function scopesFor(root, cfg) {
    const scopes = cfg.scope ? [...document.querySelectorAll(cfg.scope)] : [];
    if (!scopes.length) return [root];
    const out = new Set();
    for (const s of scopes) {
      if (s.contains(root)) out.add(root);
      else if (root.contains(s)) out.add(s);
    }
    return [...out];
  }

  function scan(root = document.body) {
    const cfg = config();
    if (!cfg || !root || !root.isConnected) return;

    // 1. selettori noti
    for (const entry of [...cfg.selectors, ...self.NSP_AD_SELECTORS]) {
      const [sel, up] = Array.isArray(entry) ? entry : [entry];
      for (const el of queryAll(root, sel)) {
        mark(up ? el.closest(up) || el : el, `${cfg.id} · ${sel}`);
      }
    }

    // 2. etichette testuali
    for (const target of scopesFor(root, cfg)) {
      scanLabels(target, cfg);
    }
  }

  function hitLabel(labelEl, cfg, how) {
    const c = findContainer(labelEl, cfg);
    if (c) mark(c, `${cfg.id} · ${how}`);
  }

  function scanLabels(target, cfg) {
    // 2a. nodi di testo brevi
    const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => {
        const len = n.nodeValue.length;
        return len > 0 && len <= 80 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    for (let tn = walker.nextNode(); tn; tn = walker.nextNode()) {
      const el = tn.parentElement;
      if (!el || el.closest('.nsp-hit, script, style, noscript, textarea')) continue;
      const text = labelMatch(tn.nodeValue, cfg.labels)
        ? tn.nodeValue
        : (el.textContent.length <= 80 && labelMatch(el.textContent, cfg.labels) ? el.textContent : null);
      if (!text) continue;
      // Sui siti offuscati un'etichetta "vera" nascosta non conta.
      if (cfg.obfuscated && !isVisible(el, document.body)) continue;
      hitLabel(el, cfg, `etichetta "${norm(text)}"`);
    }

    // 2b. aria-label
    for (const el of queryAll(target, '[aria-label]')) {
      if (el.closest('.nsp-hit')) continue;
      if (labelMatch(el.getAttribute('aria-label'), cfg.labels)) hitLabel(el, cfg, 'aria-label');
    }

    if (!cfg.obfuscated) return;

    // 2c. aria-labelledby che punta a un'etichetta altrove nella pagina
    for (const el of queryAll(target, '[aria-labelledby]')) {
      if (el.closest('.nsp-hit')) continue;
      const text = el.getAttribute('aria-labelledby').split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent || '').join(' ');
      if (labelMatch(text, cfg.labels)) hitLabel(el, cfg, 'aria-labelledby');
    }

    // 2d. etichette spezzate lettera per lettera
    for (const el of queryAll(target, 'span, div')) {
      if (el.children.length < 4 || el.closest('.nsp-hit')) continue;
      const raw = el.textContent.replace(/\s/g, '');
      if (raw.length < 4 || raw.length > 80) continue;
      if (![...el.children].every((c) => c.children.length === 0 && c.textContent.length <= 3)) continue;
      const text = visibleText(el);
      if (labelMatch(text, cfg.labels)) hitLabel(el, cfg, `etichetta offuscata "${norm(text)}"`);
    }
  }

  // ---------------------------------------------------------- contatore

  let reportTimer = 0;
  let lastCount = -1;

  function count() {
    return document.querySelectorAll('.nsp-hit').length;
  }

  function report() {
    clearTimeout(reportTimer);
    reportTimer = setTimeout(() => {
      const n = count();
      if (n === lastCount) return;
      lastCount = n;
      try {
        chrome.runtime.sendMessage({ type: 'nsp-count', n }).catch(() => {});
      } catch (_) {
        /* estensione ricaricata: il contesto non è più valido */
      }
    }, 250);
  }

  // ---------------------------------------------------------- impostazioni

  function enabledHere() {
    return !settings.disabledHosts.includes(HOST) && !!config();
  }

  function applyMode() {
    document.documentElement.dataset.nspMode = enabledHere() ? settings.mode : 'off';
  }

  chrome.storage.sync.get(DEFAULTS, (stored) => {
    settings = { ...DEFAULTS, ...stored };
    applyMode();
    fullScan();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    for (const [k, { newValue }] of Object.entries(changes)) settings[k] = newValue ?? DEFAULTS[k];
    if ('generic' in changes && !SITE) {
      settings.generic ? fullScan() : (unmarkAll(), report());
    }
    applyMode();
  });

  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg?.type === 'nsp-get') {
      reply({ n: count(), host: HOST, site: SITE?.name || null });
    }
  });

  // In modalità "comprimi" un clic sul blocco lo riapre (senza seguire link).
  document.addEventListener('click', (e) => {
    if (document.documentElement.dataset.nspMode !== 'collapse') return;
    const hit = e.target.closest?.('.nsp-hit:not(.nsp-open)');
    if (!hit) return;
    e.preventDefault();
    e.stopPropagation();
    hit.classList.add('nsp-open');
  }, true);

  // ------------------------------------------------------ pagine dinamiche

  function fullScan() {
    scan(document.body);
    document.querySelectorAll('.nsp-hit').forEach(updateInset); // il layout può essere cambiato
    report();
  }

  const pending = new Set();
  let flushTimer = 0;

  function flush() {
    flushTimer = 0;
    const roots = [...pending].filter((n) => n.isConnected);
    pending.clear();
    // tieni solo le radici più esterne
    const top = roots.filter((r) => !roots.some((o) => o !== r && o.contains(r)));
    top.forEach((r) => scan(r));
    report();
  }

  new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const n of m.addedNodes) {
        if (n.nodeType === 1) pending.add(n);
        else if (n.nodeType === 3 && n.parentElement) pending.add(n.parentElement);
      }
    }
    if (pending.size && !flushTimer) flushTimer = setTimeout(flush, 150);
  }).observe(document.documentElement, { childList: true, subtree: true });

  // Alcuni siti "idratano" il markup cambiando attributi dopo il caricamento:
  // un paio di passate complete in ritardo coprono quei casi.
  setTimeout(fullScan, 1500);
  setTimeout(fullScan, 4000);
})();

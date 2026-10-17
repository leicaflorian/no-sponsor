/*
 * NoSponsor – content script.
 *
 * Never removes nodes from the DOM: it marks elements with the .nsp-hit class and
 * leaves it to the CSS (style.css) to highlight, collapse or hide them. This way
 * sites built with React/Vue don't break and switching mode from the popup is
 * instant, without rescanning the page.
 */
import { browser } from 'wxt/browser';
import { count, unmarkAll, updateInset } from '../../engine/marker';
import { scan } from '../../engine/scan';
import { findSite, GENERIC } from '../../rules/detectors';
import type { Detector } from '../../rules/types';
import type { CountMessage, PageInfo } from '../../shared/messages';
import { DEFAULTS, type Settings } from '../../shared/settings';
import './style.css';

declare global {
  interface Window {
    __nspLoaded?: boolean;
  }
}

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  runAt: 'document_idle',
  cssInjectionMode: 'manifest',
  // No WXT window.postMessage to the page on startup (0.1.0 didn't do it:
  // anti-adblock scripts could use it to detect the extension).
  noScriptStartedPostMessage: true,
  main() {
    if (window.__nspLoaded) return;
    window.__nspLoaded = true;

    const HOST = location.hostname.replace(/^www\./, '');
    const SITE = findSite(location.hostname);

    let settings: Settings = { ...DEFAULTS };

    function config(): Detector | null {
      if (SITE) return SITE;
      return settings.generic ? GENERIC : null;
    }

    // ---------------------------------------------------------- counter

    let reportTimer: ReturnType<typeof setTimeout> | undefined;
    let lastCount = -1;

    function report(): void {
      clearTimeout(reportTimer);
      reportTimer = setTimeout(() => {
        const n = count();
        if (n === lastCount) return;
        lastCount = n;
        try {
          const msg: CountMessage = { type: 'nsp-count', n };
          browser.runtime.sendMessage(msg).catch(() => {});
        } catch {
          /* extension reloaded: the context is no longer valid */
        }
      }, 250);
    }

    // ---------------------------------------------------------- settings

    function enabledHere(): boolean {
      return !settings.disabledHosts.includes(HOST) && !!config();
    }

    function applyMode(): void {
      document.documentElement.dataset['nspMode'] = enabledHere() ? settings.mode : 'off';
    }

    browser.storage.sync.get({ ...DEFAULTS }, (stored) => {
      settings = { ...DEFAULTS, ...(stored as Partial<Settings>) };
      applyMode();
      fullScan();
    });

    browser.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync') return;
      // As in 0.1.0, every changed key is copied, including unknown ones.
      const s = settings as unknown as Record<string, unknown>;
      const d = DEFAULTS as unknown as Record<string, unknown>;
      for (const [k, { newValue }] of Object.entries(changes)) s[k] = newValue ?? d[k];
      if ('generic' in changes && !SITE) {
        if (settings.generic) fullScan();
        else {
          unmarkAll();
          report();
        }
      }
      applyMode();
    });

    browser.runtime.onMessage.addListener((msg: unknown, _sender, reply) => {
      if ((msg as { type?: unknown } | null)?.type === 'nsp-get') {
        const info: PageInfo = { n: count(), host: HOST, site: SITE?.name || null };
        reply(info);
      }
    });

    // In "collapse" mode a click on the block reopens it (without following links).
    document.addEventListener(
      'click',
      (e) => {
        if (document.documentElement.dataset['nspMode'] !== 'collapse') return;
        const hit = (e.target as Element | null)?.closest?.('.nsp-hit:not(.nsp-open)');
        if (!hit) return;
        e.preventDefault();
        e.stopPropagation();
        hit.classList.add('nsp-open');
      },
      true,
    );

    // ------------------------------------------------------ dynamic pages

    function fullScan(): void {
      scan(document.body, config());
      document.querySelectorAll('.nsp-hit').forEach(updateInset); // the layout may have changed
      report();
    }

    const pending = new Set<Element>();
    let flushTimer: ReturnType<typeof setTimeout> | 0 = 0;

    function flush(): void {
      flushTimer = 0;
      const roots = [...pending].filter((n) => n.isConnected);
      pending.clear();
      // keep only the outermost roots
      const top = roots.filter((r) => !roots.some((o) => o !== r && o.contains(r)));
      top.forEach((r) => scan(r, config()));
      report();
    }

    new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const n of m.addedNodes) {
          if (n.nodeType === 1) pending.add(n as Element);
          else if (n.nodeType === 3 && n.parentElement) pending.add(n.parentElement);
        }
      }
      if (pending.size && !flushTimer) flushTimer = setTimeout(flush, 150);
    }).observe(document.documentElement, { childList: true, subtree: true });

    // Some sites "hydrate" the markup by changing attributes after load:
    // a couple of late full passes cover those cases.
    setTimeout(fullScan, 1500);
    setTimeout(fullScan, 4000);
  },
});

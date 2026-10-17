// Scanning: known selectors and text labels (1:1 port of 0.1.0).
// Only change in shape: `scan` receives the detector instead of calling config().
import { AD_SELECTORS } from '../rules/detectors';
import type { Detector } from '../rules/types';
import { findContainer } from './container';
import { mark } from './marker';
import { labelMatch, norm } from './text';
import { isVisible, visibleText } from './visibility';

export function queryAll(root: Element, sel: string): Element[] {
  const out: Element[] = [];
  if (root.matches?.(sel)) out.push(root);
  root.querySelectorAll?.(sel).forEach((e) => out.push(e));
  return out;
}

// Media that fill an ad slot without any text.
const MEDIA = 'img, picture, svg, video, canvas, iframe, object, embed';

// An ad slot left empty (Google keeps #tads/#bottomads in the page even with no ads):
// marking it would only show an empty banner.
export function hasContent(el: Element): boolean {
  return !!(el.textContent ?? '').trim() || !!el.querySelector(MEDIA);
}

export function scopesFor(root: Element, cfg: Detector): Element[] {
  const scopes = cfg.scope ? [...document.querySelectorAll(cfg.scope)] : [];
  if (!scopes.length) return [root];
  const out = new Set<Element>();
  for (const s of scopes) {
    if (s.contains(root)) out.add(root);
    else if (root.contains(s)) out.add(s);
  }
  return [...out];
}

export function scan(root: Element | null, cfg: Detector | null): void {
  if (!cfg || !root || !root.isConnected) return;

  // 1. known selectors
  for (const entry of [...cfg.selectors, ...AD_SELECTORS]) {
    const [sel, up] = Array.isArray(entry) ? entry : [entry];
    const found = queryAll(root, sel);
    // content added to a slot that was empty at the last scan
    const slot = root.parentElement?.closest(sel);
    if (slot) found.push(slot);
    for (const el of found) {
      const target = up ? el.closest(up) || el : el;
      if (hasContent(target)) mark(target, `${cfg.id} · ${sel}`);
    }
  }

  // 2. text labels
  for (const target of scopesFor(root, cfg)) {
    scanLabels(target, cfg);
  }
}

function hitLabel(labelEl: Element, cfg: Detector, how: string): void {
  const c = findContainer(labelEl, cfg);
  if (c) mark(c, `${cfg.id} · ${how}`);
}

export function scanLabels(target: Element, cfg: Detector): void {
  // 2a. short text nodes
  const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => {
      const len = (n.nodeValue ?? '').length;
      return len > 0 && len <= 80 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  for (let tn = walker.nextNode(); tn; tn = walker.nextNode()) {
    const el = tn.parentElement;
    if (!el || el.closest('.nsp-hit, script, style, noscript, textarea')) continue;
    const value = tn.nodeValue ?? '';
    const elText = el.textContent ?? '';
    const text = labelMatch(value, cfg.labels)
      ? value
      : elText.length <= 80 && labelMatch(elText, cfg.labels)
        ? elText
        : null;
    if (!text) continue;
    // On obfuscated sites a "real" label that is hidden does not count.
    if (cfg.obfuscated && !isVisible(el, document.body)) continue;
    hitLabel(el, cfg, `etichetta "${norm(text)}"`);
  }

  // 2b. aria-label
  for (const el of queryAll(target, '[aria-label]')) {
    if (el.closest('.nsp-hit')) continue;
    if (labelMatch(el.getAttribute('aria-label'), cfg.labels)) hitLabel(el, cfg, 'aria-label');
  }

  if (!cfg.obfuscated) return;

  // 2c. aria-labelledby pointing to a label elsewhere on the page
  for (const el of queryAll(target, '[aria-labelledby]')) {
    if (el.closest('.nsp-hit')) continue;
    const text = (el.getAttribute('aria-labelledby') ?? '')
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent || '')
      .join(' ');
    if (labelMatch(text, cfg.labels)) hitLabel(el, cfg, 'aria-labelledby');
  }

  // 2d. labels split letter by letter
  for (const el of queryAll(target, 'span, div')) {
    if (el.children.length < 4 || el.closest('.nsp-hit')) continue;
    const raw = (el.textContent ?? '').replace(/\s/g, '');
    if (raw.length < 4 || raw.length > 80) continue;
    if (![...el.children].every((c) => c.children.length === 0 && (c.textContent ?? '').length <= 3)) continue;
    const text = visibleText(el);
    if (labelMatch(text, cfg.labels)) hitLabel(el, cfg, `etichetta offuscata "${norm(text)}"`);
  }
}

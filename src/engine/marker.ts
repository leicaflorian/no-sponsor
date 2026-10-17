// Marking of sponsored elements (1:1 port of 0.1.0).
// Never removes nodes from the DOM: adds the .nsp-hit class and leaves the rest to CSS.
import { FORBIDDEN } from './container';

export function mark(el: Element | null, reason: string): void {
  if (!el || el.nodeType !== 1) return;
  if (el.tagName === 'IFRAME' || el.tagName === 'IMG') el = el.parentElement;
  if (!el || el.matches(FORBIDDEN)) return;
  if (el.closest('.nsp-hit')) return; // already covered by an ancestor
  el.querySelectorAll('.nsp-hit').forEach(unmark); // the ancestor absorbs its children
  el.classList.add('nsp-hit');
  (el as HTMLElement).dataset['nspReason'] = reason;
  if (getComputedStyle(el).position === 'static') el.classList.add('nsp-rel');
  updateInset(el);
}

// The border sits 6px outside the block and the badge sticks out ~16px above it:
// if an ancestor with overflow would clip them, or they would run over a neighbour, use the inset variant.
export function updateInset(el: Element): void {
  const r = el.getBoundingClientRect();
  let clipped = r.left < 10 || r.top + window.scrollY < 18 || crowded(el, r);
  for (let n = el.parentElement, i = 0; !clipped && n && n !== document.body && i < 10; n = n.parentElement, i++) {
    const cs = getComputedStyle(n);
    if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
    const p = n.getBoundingClientRect();
    clipped = r.left - p.left < 10 || p.right - r.right < 10 || r.top - p.top < 18 || p.bottom - r.bottom < 10;
  }
  el.classList.toggle('nsp-inset', clipped);
}

// True if an element next to the block (e.g. the next card in a grid) is within reach of the border or badge.
// Looks at the siblings of the block and of its ancestors, up to the first ancestor that leaves room around it:
// whatever lies outside that ancestor is farther away than the border.
// A block with no width or height (its content overflows it) gives no measure to judge by.
function crowded(el: Element, r: DOMRect): boolean {
  if (!r.width || !r.height) return false;
  for (let n: Element = el, i = 0; n.parentElement && n.parentElement !== document.body && i < 10; i++) {
    for (const s of n.parentElement.children) if (s !== n && near(r, s.getBoundingClientRect())) return true;
    n = n.parentElement;
    const p = n.getBoundingClientRect();
    if (r.left - p.left >= 10 && p.right - r.right >= 10 && r.top - p.top >= 18 && p.bottom - r.bottom >= 10) break;
  }
  return false;
}

// `s` sits beside, above or below `r` (not on top of it) and closer than the border reaches.
function near(r: DOMRect, s: DOMRect): boolean {
  if (!s.width || !s.height) return false;
  const gapX = Math.max(s.left - r.right, r.left - s.right);
  const gapY = Math.max(s.top - r.bottom, r.top - s.bottom);
  if (gapX < 0 && gapY >= 0) return gapY < (s.bottom <= r.top ? 18 : 10);
  if (gapY < 0 && gapX >= 0) return gapX < 10;
  return false;
}

export function unmark(el: Element): void {
  el.classList.remove('nsp-hit', 'nsp-rel', 'nsp-open', 'nsp-inset');
  delete (el as HTMLElement).dataset['nspReason'];
}

export function unmarkAll(): void {
  document.querySelectorAll('.nsp-hit').forEach(unmark);
}

export function count(): number {
  return document.querySelectorAll('.nsp-hit').length;
}

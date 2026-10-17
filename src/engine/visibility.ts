// Element visibility and visible text (1:1 port of 0.1.0).

// An element is visible if neither it nor its ancestors (up to `stop`)
// are hidden with the typical obfuscation tricks.
export function isVisible(el: Element, stop?: Element | null): boolean {
  for (let n: Element | null = el; n && n.nodeType === 1; n = n.parentElement) {
    const cs = getComputedStyle(n);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.visibility === 'collapse') return false;
    if (parseFloat(cs.opacity) === 0 || parseFloat(cs.fontSize) === 0) return false;
    if (
      cs.position === 'absolute' &&
      (parseFloat(cs.width) <= 1 || parseFloat(cs.height) <= 1) &&
      cs.overflow === 'hidden'
    )
      return false;
    if (n === stop) break;
  }
  return true;
}

// Text that is actually visible, rebuilt in the order it appears on screen
// (handles hidden letters and letters reordered with flex `order`).
export function visibleText(el: Element): string {
  const parts: { t: string; x: number; y: number }[] = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let tn = walker.nextNode(); tn; tn = walker.nextNode()) {
    const value = tn.nodeValue ?? '';
    if (!value.trim()) continue;
    if (!isVisible(tn.parentElement as Element, el)) continue;
    range.selectNodeContents(tn);
    const r = range.getBoundingClientRect();
    if (r.width < 0.5 || r.height < 0.5) continue;
    parts.push({ t: value, x: r.left, y: Math.round(r.top / 6) });
  }
  parts.sort((a, b) => a.y - b.y || a.x - b.x);
  return parts.map((p) => p.t).join('');
}

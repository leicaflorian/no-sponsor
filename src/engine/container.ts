// Finding the container of a sponsored element (1:1 port of 0.1.0).
import type { Detector } from '../rules/types';

export const MAX_CONTAINER_TEXT = 15000; // beyond this, the "container" is almost certainly the whole page
export const FORBIDDEN = 'html, body, main, [role="main"], #search, #rso, #rcnt, #center_col, #a-page';

export function findContainer(el: Element, cfg: Detector): Element | null {
  for (const sel of cfg.container) {
    const c = el.closest(sel);
    if (!c || c.matches(FORBIDDEN)) continue;
    if ((c.textContent || '').length > MAX_CONTAINER_TEXT) continue;
    return c;
  }
  return null;
}

// Finding the container of a sponsored element (1:1 port of 0.1.0).
import type { Detector } from '../rules/types';

export const MAX_CONTAINER_TEXT = 15000; // beyond this, the "container" is almost certainly the whole page
// The YouTube player has a class with "card" in it and holds the ad's "Sponsorizzato" label:
// marking it would hide the video and the Skip button.
// The Prime Video player (`dv-web-player-*`, `.atvwebplayersdk-player-container`) shows the ad's
// "Pubblicità" label while the ad plays: same reason, it must never be the container.
// The Netflix player (`[data-uia="player"]`) and its page (`.watch-video`) show the ad's "Pubblicità" label too:
// nothing inside the Netflix watch page (player, pause-ad screen) is ever marked, see NETFLIX_WATCH below.
export const FORBIDDEN =
  'html, body, main, [role="main"], #search, #rso, #rcnt, #center_col, #a-page, #movie_player, .html5-video-player, [id^="dv-web-player"], .atvwebplayersdk-player-container, [data-uia="player"], .watch-video';

const NETFLIX_WATCH = '[data-uia="player"], .watch-video';

export function findContainer(el: Element, cfg: Detector): Element | null {
  for (const sel of cfg.container) {
    const c = el.closest(sel);
    if (!c || c.matches(FORBIDDEN)) continue;
    if (c.closest(NETFLIX_WATCH)) return null;
    if ((c.textContent || '').length > MAX_CONTAINER_TEXT) continue;
    return c;
  }
  return null;
}

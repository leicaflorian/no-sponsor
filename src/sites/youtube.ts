// YouTube: while an ad plays (`ad-showing` on the player) the video is muted and played at 16x, and the remaining
// time (at that speed) is written on the player; the CSS (html[data-nsp-yt="on"]) blacks out the video and shows
// that time. Never seeks: currentTime is easier for YouTube to notice than the speed.
// Clicking Skip from a script does nothing: YouTube ignores clicks that are not trusted (1.0.6, removed in 1.0.8).

import { Veil, startVeil, type VeilSite } from './ad-veil';

export { RESTORE_DELAY_MS, TICK_MS, AD_RATE, USER_INPUT_MS, formatRemaining } from './ad-veil';

export const YOUTUBE: VeilSite = {
  player: '.html5-video-player',
  flag: 'nspYt',
  matches: ({ hostname }) => /(^|\.)youtube\.com$/.test(hostname),
  inAd: (player) => player.classList.contains('ad-showing'),
  video: (player) => player.querySelector('video'),
  adSecondsLeft: (_player, video) => video.duration - video.currentTime,
};

export class AdVeil extends Veil {
  constructor(player: HTMLElement) {
    super(player, YOUTUBE);
  }
}

// Veils every player on the page, including those YouTube creates later.
export function startYouTube(isEnabled: () => boolean): { refresh(): void; stop(): void } {
  return startVeil(YOUTUBE, isEnabled);
}

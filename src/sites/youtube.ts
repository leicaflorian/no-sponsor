// YouTube: while an ad plays (`ad-showing` on the player) the video is muted and, after the first VEIL_DELAY_MS of a
// break (muted, visible and at its speed: an ad hidden from its first frame gets the ad blocker warning), played at
// AD_RATE while the CSS (html[data-nsp-yt="on"]) blacks it out and shows the remaining time written on the player.
// AD_RATE is 2x, not the 16x of the other sites: at 16x and at 8x YouTube showed its ad blocker warning, at normal
// speed it did not (owner's tests, 16/11/2026). Never seeks.
// Clicking Skip from a script does nothing: YouTube ignores clicks that are not trusted (1.0.6, removed in 1.0.8).

import { Veil, startVeil, type VeilSite } from './ad-veil';

export { RESTORE_DELAY_MS, TICK_MS, USER_INPUT_MS, formatRemaining } from './ad-veil';

export const VEIL_DELAY_MS = 2000;
export const AD_RATE = 2;

export const YOUTUBE: VeilSite = {
  player: '.html5-video-player',
  flag: 'nspYt',
  matches: ({ hostname }) => /(^|\.)youtube\.com$/.test(hostname),
  inAd: (player) => player.classList.contains('ad-showing'),
  video: (player) => player.querySelector('video'),
  adSecondsLeft: (_player, video) => video.duration - video.currentTime,
  veilDelayMs: VEIL_DELAY_MS,
  adRate: AD_RATE,
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

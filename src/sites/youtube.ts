// YouTube: while an ad plays (`ad-showing` on the player) the video is muted and played at AD_RATE, and the CSS
// (html[data-nsp-yt="on"]) blacks it out and shows the remaining time written on the player.
// AD_RATE is 2x, not the 16x of the other sites: at 16x and at 8x YouTube showed its ad blocker warning, at normal
// speed and at 2x it did not (owner's tests, 16/11/2026). From 16 to 19/11/2026 the first 2 s of a break also played
// visible (VeilSite.veilDelayMs); dropped to try whether 2x alone is enough. Never seeks.
// Clicking Skip from a script does nothing: YouTube ignores clicks that are not trusted (1.0.6, removed in 1.0.8).

import { Veil, startVeil, type VeilSite } from './ad-veil';

export { RESTORE_DELAY_MS, TICK_MS, USER_INPUT_MS, formatRemaining } from './ad-veil';

export const AD_RATE = 2;

export const YOUTUBE: VeilSite = {
  player: '.html5-video-player',
  flag: 'nspYt',
  matches: ({ hostname }) => /(^|\.)youtube\.com$/.test(hostname),
  inAd: (player) => player.classList.contains('ad-showing'),
  video: (player) => player.querySelector('video'),
  adSecondsLeft: (_player, video) => video.duration - video.currentTime,
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

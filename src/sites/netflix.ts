// Netflix: while an ad plays (its info block is on the player) the video is muted and played at 16x, and the
// remaining time (at that speed) is written on the player; the CSS (html[data-nsp-nf="on"]) blacks out the video
// and shows that time. The recording showed that the ad is stitched into the same <video> as the content
// (currentTime restarts and runs through the ad, then the episode continues in the same element, so duration is of
// no use), that the countdown is whole seconds ("15" ... "0"), that it follows the video's time (it freezes on
// pause), and that Netflix leaves mute, volume and speed alone during the ad.

import type { VeilSite } from './ad-veil';
import { parseClock } from './primevideo';

// Whole seconds ("15") or a clock ("1:05"); NaN for anything else.
export function parseAdSeconds(text: string | null | undefined): number {
  const t = (text ?? '').trim();
  return /^\d+$/.test(t) ? Number(t) : parseClock(t);
}

export const NETFLIX: VeilSite = {
  player: '[data-uia="player"]',
  flag: 'nspNf',
  restoreRateAtOnce: true,
  matches: ({ hostname }) => /(^|\.)netflix\.com$/.test(hostname),
  inAd: (player) => player.querySelector('[data-uia="ads-info-container"]') !== null,
  video: (player) => player.querySelector('[data-uia="video-canvas"] video'),
  adSecondsLeft: (player) => parseAdSeconds(player.querySelector('[data-uia="ads-info-time"]')?.textContent),
};

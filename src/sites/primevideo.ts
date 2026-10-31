// Prime Video: while an ad plays (its countdown timer is on the player) the video is muted and played at 16x, and
// the remaining time (at that speed) is written on the player; the CSS (html[data-nsp-pv="on"]) blacks out the video
// and shows that time. The recordings showed that the ad is stitched into the same <video> as the episode
// (currentTime keeps running and duration covers the whole episode plus the ads, so duration is of no use), that the
// on-screen timer follows the video's time (it freezes on pause), and that Prime Video leaves mute and speed alone
// during the ad.

import type { VeilSite } from './ad-veil';

// Seconds of `m:ss` or `h:mm:ss` (the fields after the first are two digits); NaN for anything else.
export function parseClock(text: string | null | undefined): number {
  const m = /^(\d+)(?::(\d{2}))?:(\d{2})$/.exec((text ?? '').trim());
  if (!m) return NaN;
  const [, first, middle, last] = m;
  return middle === undefined
    ? Number(first) * 60 + Number(last)
    : Number(first) * 3600 + Number(middle) * 60 + Number(last);
}

const TIMER = '.atvwebplayersdk-ad-timer-remaining-time';

export const PRIME_VIDEO: VeilSite = {
  player: '[id^="dv-web-player"]',
  flag: 'nspPv',
  restoreRateAtOnce: true,
  matches: ({ hostname, pathname }) =>
    /(^|\.)primevideo\.com$/.test(hostname) ||
    (/(^|\.)amazon\.[a-z]{2,3}(\.[a-z]{2})?$/.test(hostname) && /\/gp\/video(\/|$)/.test(pathname)),
  inAd: (player) => player.querySelector(TIMER) !== null,
  video: (player) => player.querySelector('.atvwebplayersdk-video-surface video'),
  adSecondsLeft: (player) => parseClock(player.querySelector(TIMER)?.textContent),
};

// YouTube: while an ad plays (`ad-showing` on the player) the video is muted, the remaining time is written
// on the player and Skip is clicked as soon as it shows; the CSS (html[data-nsp-yt="on"]) blacks out the video
// and shows that time. Only reads currentTime/duration: never seeks or changes speed.

import { isVisible } from '../engine/visibility';

export const RESTORE_DELAY_MS = 300; // two ads in a row can drop `ad-showing` for an instant
export const TICK_MS = 500;
export const USER_INPUT_MS = 1000; // an unmute this soon after a click or key press is the user's

const PLAYER = '.html5-video-player';
const INPUTS = ['pointerdown', 'keydown'] as const;
const SKIP = '.ytp-skip-ad-button, .ytp-ad-skip-button-modern, .ytp-ad-skip-button';

// Seconds as m:ss, rounded up; null when unknown (the ad has not loaded yet).
export function formatRemaining(seconds: number): string | null {
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  const s = Math.ceil(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export class AdVeil {
  private video: HTMLVideoElement | null = null;
  private mutedByUs = false;
  private tick: ReturnType<typeof setInterval> | undefined;
  private restore: ReturnType<typeof setTimeout> | undefined;
  private lastInput = -Infinity;
  private skipped = new WeakSet<Element>();

  constructor(private readonly player: HTMLElement) {}

  sync(enabled: boolean): void {
    const inAd = enabled && this.player.classList.contains('ad-showing');
    if (inAd && !this.video) this.start();
    else if (!inAd && this.video) this.stop(enabled ? RESTORE_DELAY_MS : 0);
    else if (!enabled && this.restore !== undefined) this.unmuteNow();
  }

  dispose(): void {
    if (this.video) this.stop(0);
    else if (this.restore !== undefined) this.unmuteNow();
  }

  private start(): void {
    const video = this.player.querySelector('video');
    if (!video) return;
    this.video = video;
    if (this.restore !== undefined) {
      // Back-to-back ads: still the same break, the audio stays as it is.
      clearTimeout(this.restore);
      this.restore = undefined;
    } else if (!video.muted) {
      video.muted = true;
      this.mutedByUs = true;
    }
    video.addEventListener('volumechange', this.onVolume);
    for (const type of INPUTS) window.addEventListener(type, this.onInput, true);
    this.update();
    this.tick = setInterval(this.update, TICK_MS);
  }

  private stop(delay: number): void {
    this.video?.removeEventListener('volumechange', this.onVolume);
    for (const type of INPUTS) window.removeEventListener(type, this.onInput, true);
    clearInterval(this.tick);
    this.tick = undefined;
    delete this.player.dataset['nspRemaining'];
    const video = this.video;
    this.video = null;
    if (!this.mutedByUs || !video) return;
    if (delay) this.restore = setTimeout(() => this.unmute(video), delay);
    else this.unmute(video);
  }

  private unmuteNow(): void {
    clearTimeout(this.restore);
    this.restore = undefined;
    const video = this.player.querySelector('video');
    if (video) this.unmute(video);
  }

  private unmute(video: HTMLVideoElement): void {
    this.restore = undefined;
    if (this.mutedByUs) video.muted = false;
    this.mutedByUs = false;
  }

  private onInput = (): void => {
    this.lastInput = Date.now();
  };

  // The user turned the audio back on during the ad: leave it on until the next break.
  // Without a recent click or key press it was YouTube's player, which applies its own audio state
  // when it loads the ad: mute again.
  private onVolume = (): void => {
    const video = this.video;
    if (!video || video.muted || !this.mutedByUs) return;
    if (Date.now() - this.lastInput <= USER_INPUT_MS) this.mutedByUs = false;
    else video.muted = true;
  };

  private update = (): void => {
    if (this.video && this.player.querySelector('video') !== this.video) {
      // YouTube swapped the <video> during the break: give the old one its audio back, mute the new one.
      this.stop(0);
      this.start();
      return;
    }
    this.skip();
    const v = this.video;
    const t = v ? formatRemaining(v.duration - v.currentTime) : null;
    if (t) this.player.dataset['nspRemaining'] = t;
    else delete this.player.dataset['nspRemaining'];
  };

  // Skip is in the DOM, hidden, during the countdown that precedes it: click it once it shows.
  private skip(): void {
    for (const button of this.player.querySelectorAll<HTMLElement>(SKIP)) {
      if (this.skipped.has(button) || !isVisible(button, this.player)) continue;
      this.skipped.add(button);
      button.click();
    }
  }
}

// Veils every player on the page, including those YouTube creates later.
export function startYouTube(isEnabled: () => boolean): { refresh(): void; stop(): void } {
  const veils = new Map<Element, AdVeil>();

  function sync(player: Element): void {
    let veil = veils.get(player);
    if (!veil) veils.set(player, (veil = new AdVeil(player as HTMLElement)));
    veil.sync(isEnabled());
  }

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'attributes') {
        if ((m.target as Element).matches(PLAYER)) sync(m.target as Element);
        continue;
      }
      for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        const el = n as Element;
        if (el.matches(PLAYER)) sync(el);
        el.querySelectorAll(PLAYER).forEach(sync);
      }
    }
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class'],
  });

  // Leaving during an ad: unmute first, so that YouTube cannot keep the muted state for the next video.
  const dispose = () => veils.forEach((v) => v.dispose());
  window.addEventListener('pagehide', dispose);

  document.querySelectorAll(PLAYER).forEach(sync);
  return {
    refresh: () => document.querySelectorAll(PLAYER).forEach(sync),
    stop: () => {
      observer.disconnect();
      window.removeEventListener('pagehide', dispose);
      dispose();
      veils.clear();
    },
  };
}

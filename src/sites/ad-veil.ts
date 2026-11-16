// Ad veil shared by the sites: while an ad plays the video is muted and played at 16x (or the site's adRate), and
// the remaining time (at that speed) is written on the player; the CSS (html[data-nsp-yt="on"] /
// html[data-nsp-pv="on"] / html[data-nsp-nf="on"]) blacks out the video and shows that time. Never seeks:
// currentTime is easier for a site to notice than the speed.

export const RESTORE_DELAY_MS = 300; // two ads in a row can drop `ad-showing` for an instant
export const TICK_MS = 500;
export const AD_RATE = 16; // the highest speed Chrome plays; a site can ask for less (VeilSite.adRate)
export const USER_INPUT_MS = 1000; // an unmute this soon after a click or key press is the user's

const INPUTS = ['pointerdown', 'keydown'] as const;

// Seconds as m:ss, rounded up; null when unknown (the ad has not loaded yet).
export function formatRemaining(seconds: number): string | null {
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  const s = Math.ceil(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export interface VeilSite {
  player: string; // CSS selector of a player
  flag: 'nspYt' | 'nspPv' | 'nspNf'; // dataset key on <html> read by the CSS
  matches(loc: { hostname: string; pathname: string }): boolean;
  inAd(player: HTMLElement): boolean;
  video(player: HTMLElement): HTMLVideoElement | null;
  adSecondsLeft(player: HTMLElement, video: HTMLVideoElement): number; // ad seconds (not real ones); NaN when unknown
  // The ad is in the same <video> as the content: give the speed back as soon as the ad ends, not after the delay.
  restoreRateAtOnce?: boolean;
  // At the start of a break the ad plays muted, visible and at its speed for this long before the veil (and the
  // speed-up, if any): an ad hidden or sped up from its first frame is how the site spots an ad blocker.
  veilDelayMs?: number;
  adRate?: number | null; // the speed of the ad; AD_RATE when not given, null to leave the speed alone
}

export class Veil {
  private video: HTMLVideoElement | null = null;
  private mutedByUs = false;
  private rateBefore: number | null = null; // the speed to give back, when the extension changed it
  private tick: ReturnType<typeof setInterval> | undefined;
  private restore: ReturnType<typeof setTimeout> | undefined;
  private veilTimer: ReturnType<typeof setTimeout> | undefined;
  private lastInput = -Infinity;
  private inBreak = false; // the current break is already counted; cleared only when the ad is really gone

  constructor(
    private readonly player: HTMLElement,
    private readonly site: VeilSite,
    private readonly onAdStart?: () => void,
  ) {}

  private get rate(): number | null {
    return this.site.adRate === undefined ? AD_RATE : this.site.adRate;
  }

  sync(enabled: boolean): void {
    const inAd = enabled && this.site.inAd(this.player);
    if (enabled && !inAd) this.inBreak = false;
    if (inAd && !this.video) this.start();
    else if (!inAd && this.video) this.stop(enabled ? RESTORE_DELAY_MS : 0);
    else if (!enabled && this.restore !== undefined) this.restoreNow();
  }

  dispose(): void {
    if (this.video) this.stop(0);
    else if (this.restore !== undefined) this.restoreNow();
  }

  private start(countBreak = true): void {
    const video = this.site.video(this.player);
    if (!video) return;
    this.video = video;
    let wait = 0;
    if (this.restore !== undefined) {
      // Back-to-back ads: still the same break, audio and speed stay as they are.
      clearTimeout(this.restore);
      this.restore = undefined;
      this.inBreak = true;
    } else {
      if (countBreak && !this.inBreak) this.onAdStart?.(); // a fresh break (not the end of a pending restore)
      this.inBreak = true;
      if (!video.muted) {
        video.muted = true;
        this.mutedByUs = true;
      }
      if (this.rate !== null && video.playbackRate !== this.rate) this.rateBefore = video.playbackRate;
      if (countBreak) wait = this.site.veilDelayMs ?? 0;
    }
    video.addEventListener('volumechange', this.onVolume);
    for (const type of INPUTS) window.addEventListener(type, this.onInput, true);
    if (wait) {
      this.player.dataset['nspWaiting'] = ''; // the CSS leaves the video visible
      this.veilTimer = setTimeout(this.cover, wait);
    } else this.cover();
  }

  private cover = (): void => {
    this.veilTimer = undefined;
    delete this.player.dataset['nspWaiting'];
    const video = this.video;
    if (!video) return;
    if (this.rate !== null) {
      video.playbackRate = this.rate;
      video.addEventListener('ratechange', this.onRate);
    }
    this.update();
    this.tick = setInterval(this.update, TICK_MS);
  };

  private stop(delay: number): void {
    this.video?.removeEventListener('volumechange', this.onVolume);
    this.video?.removeEventListener('ratechange', this.onRate);
    for (const type of INPUTS) window.removeEventListener(type, this.onInput, true);
    clearInterval(this.tick);
    this.tick = undefined;
    clearTimeout(this.veilTimer);
    this.veilTimer = undefined;
    delete this.player.dataset['nspWaiting'];
    delete this.player.dataset['nspRemaining'];
    const video = this.video;
    this.video = null;
    if (!video || (!this.mutedByUs && this.rateBefore === null)) return;
    if (delay && this.site.restoreRateAtOnce && this.rateBefore !== null && video.playbackRate === this.rate) {
      video.playbackRate = this.rateBefore; // rateBefore stays: a timer that comes back within the delay is the same break
    }
    if (delay) this.restore = setTimeout(() => this.restoreVideo(video), delay);
    else this.restoreVideo(video);
  }

  private restoreNow(): void {
    clearTimeout(this.restore);
    this.restore = undefined;
    const video = this.site.video(this.player);
    if (video) this.restoreVideo(video);
  }

  // Gives back what the extension changed. A speed the site set after the ad (its own, for the real video) stays.
  private restoreVideo(video: HTMLVideoElement): void {
    this.restore = undefined;
    if (this.mutedByUs) video.muted = false;
    this.mutedByUs = false;
    if (this.rateBefore !== null && video.playbackRate === this.rate) video.playbackRate = this.rateBefore;
    this.rateBefore = null;
  }

  private onInput = (): void => {
    this.lastInput = Date.now();
  };

  // The user turned the audio back on during the ad: leave it on until the next break.
  // Without a recent click or key press it was the site's player, which applies its own audio state
  // when it loads the ad: mute again.
  private onVolume = (): void => {
    const video = this.video;
    if (!video || video.muted || !this.mutedByUs) return;
    if (Date.now() - this.lastInput <= USER_INPUT_MS) this.mutedByUs = false;
    else video.muted = true;
  };

  // The player sets its own speed when it loads the ad: back to the ad speed until the ad ends.
  private onRate = (): void => {
    if (this.rate !== null && this.video && this.video.playbackRate !== this.rate) this.video.playbackRate = this.rate;
  };

  private update = (): void => {
    if (this.video && this.site.video(this.player) !== this.video) {
      // The site swapped the <video> during the break: give the old one its audio back, mute the new one.
      this.stop(0);
      this.start(false); // same break, not a new one
      return;
    }
    const v = this.video;
    // Loading a stream resets the speed to the default without a `ratechange`.
    if (this.rate !== null && v && v.playbackRate !== this.rate) v.playbackRate = this.rate;
    const t = v ? formatRemaining(this.site.adSecondsLeft(this.player, v) / (v.playbackRate || 1)) : null;
    if (t) this.player.dataset['nspRemaining'] = t;
    else delete this.player.dataset['nspRemaining'];
  };
}

// Veils every player on the page, including those the site creates later.
export function startVeil(
  site: VeilSite,
  isEnabled: () => boolean,
  onAdStart?: () => void,
): { refresh(): void; stop(): void } {
  const veils = new Map<Element, Veil>();

  function sync(player: Element): void {
    let veil = veils.get(player);
    if (!veil) veils.set(player, (veil = new Veil(player as HTMLElement, site, onAdStart)));
    veil.sync(isEnabled());
  }

  const observer = new MutationObserver((mutations) => {
    const players = new Set<Element>();
    for (const m of mutations) {
      if (m.type === 'attributes') {
        if ((m.target as Element).matches(site.player)) players.add(m.target as Element);
        continue;
      }
      // A node that appears or goes away inside a player (the ad is a node on some sites, not a class).
      const host = (m.target as Element).closest?.(site.player);
      if (host) players.add(host);
      for (const n of m.removedNodes) {
        if (n.nodeType !== 1) continue;
        const el = n as Element;
        for (const [p, v] of veils) {
          if (!p.isConnected && (p === el || el.contains(p))) {
            v.dispose();
            veils.delete(p);
          }
        }
      }
      for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        const el = n as Element;
        if (el.matches(site.player)) players.add(el);
        el.querySelectorAll(site.player).forEach((p) => players.add(p));
      }
    }
    players.forEach(sync);
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class'],
  });

  // Leaving during an ad: unmute first, so that the site cannot keep the muted state for the next video.
  const dispose = () => veils.forEach((v) => v.dispose());
  window.addEventListener('pagehide', dispose);

  document.querySelectorAll(site.player).forEach(sync);
  return {
    refresh: () => document.querySelectorAll(site.player).forEach(sync),
    stop: () => {
      observer.disconnect();
      window.removeEventListener('pagehide', dispose);
      dispose();
      veils.clear();
    },
  };
}

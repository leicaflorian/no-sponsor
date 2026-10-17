import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdVeil, formatRemaining, RESTORE_DELAY_MS, startYouTube, TICK_MS } from '../../src/sites/youtube';

function setup() {
  document.body.innerHTML = '<div id="movie_player" class="html5-video-player"><video></video></div>';
  const player = document.getElementById('movie_player') as HTMLElement;
  const video = player.querySelector('video') as HTMLVideoElement;
  return { player, video };
}

// Duration and position of the video (happy-dom does not play media).
function setTime(video: HTMLVideoElement, duration: number, currentTime: number) {
  Object.defineProperty(video, 'duration', { configurable: true, get: () => duration });
  Object.defineProperty(video, 'currentTime', { configurable: true, get: () => currentTime });
}

// The user clicks the speaker icon.
function userSetsMuted(video: HTMLVideoElement, muted: boolean) {
  video.muted = muted;
  video.dispatchEvent(new Event('volumechange'));
}

function ad(veil: AdVeil, player: HTMLElement, on: boolean, enabled = true) {
  player.classList.toggle('ad-showing', on);
  veil.sync(enabled);
}

describe('formatRemaining', () => {
  it.each([
    [5, '0:05'],
    [4.2, '0:05'],
    [62, '1:02'],
    [0, '0:00'],
  ])('%s seconds -> %s', (s, out) => {
    expect(formatRemaining(s)).toBe(out);
  });

  it.each([NaN, Infinity, -1])('%s -> null', (s) => {
    expect(formatRemaining(s)).toBeNull();
  });
});

describe('AdVeil', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('mutes the video when the ad starts and restores it after the delay', () => {
    const { player, video } = setup();
    const veil = new AdVeil(player);
    ad(veil, player, true);
    expect(video.muted).toBe(true);
    ad(veil, player, false);
    vi.advanceTimersByTime(RESTORE_DELAY_MS - 1);
    expect(video.muted).toBe(true);
    vi.advanceTimersByTime(1);
    expect(video.muted).toBe(false);
  });

  it('leaves the audio off if the user had muted it', () => {
    const { player, video } = setup();
    video.muted = true;
    const veil = new AdVeil(player);
    ad(veil, player, true);
    ad(veil, player, false);
    vi.advanceTimersByTime(RESTORE_DELAY_MS);
    expect(video.muted).toBe(true);
  });

  it('does not mute again after the user unmutes during the ad', () => {
    const { player, video } = setup();
    const veil = new AdVeil(player);
    ad(veil, player, true);
    userSetsMuted(video, false);
    vi.advanceTimersByTime(TICK_MS);
    veil.sync(true);
    expect(video.muted).toBe(false);
    ad(veil, player, false);
    vi.advanceTimersByTime(RESTORE_DELAY_MS);
    expect(video.muted).toBe(false);
  });

  it('mutes again at the next ad after the user unmuted one', () => {
    const { player, video } = setup();
    const veil = new AdVeil(player);
    ad(veil, player, true);
    userSetsMuted(video, false);
    ad(veil, player, false);
    vi.advanceTimersByTime(RESTORE_DELAY_MS);
    ad(veil, player, true);
    expect(video.muted).toBe(true);
  });

  it('treats two back-to-back ads as one break', () => {
    const { player, video } = setup();
    const veil = new AdVeil(player);
    ad(veil, player, true);
    ad(veil, player, false);
    vi.advanceTimersByTime(RESTORE_DELAY_MS - 100);
    ad(veil, player, true);
    vi.advanceTimersByTime(RESTORE_DELAY_MS);
    expect(video.muted).toBe(true);
    ad(veil, player, false);
    vi.advanceTimersByTime(RESTORE_DELAY_MS);
    expect(video.muted).toBe(false);
  });

  it('writes the remaining time and removes it at the end', () => {
    const { player, video } = setup();
    setTime(video, 20, 7.5);
    const veil = new AdVeil(player);
    ad(veil, player, true);
    expect(player.dataset['nspRemaining']).toBe('0:13');
    setTime(video, 20, 15);
    vi.advanceTimersByTime(TICK_MS);
    expect(player.dataset['nspRemaining']).toBe('0:05');
    ad(veil, player, false);
    expect(player.hasAttribute('data-nsp-remaining')).toBe(false);
  });

  it('writes nothing while the duration is unknown', () => {
    const { player, video } = setup();
    setTime(video, NaN, 0);
    const veil = new AdVeil(player);
    ad(veil, player, true);
    vi.advanceTimersByTime(TICK_MS);
    expect(player.hasAttribute('data-nsp-remaining')).toBe(false);
  });

  it('turns off at once when the site is disabled', () => {
    const { player, video } = setup();
    setTime(video, 20, 5);
    const veil = new AdVeil(player);
    ad(veil, player, true);
    veil.sync(false);
    expect(video.muted).toBe(false);
    expect(player.hasAttribute('data-nsp-remaining')).toBe(false);
  });

  it('does nothing while the site is disabled', () => {
    const { player, video } = setup();
    const veil = new AdVeil(player);
    ad(veil, player, true, false);
    expect(video.muted).toBe(false);
  });

  it('follows a new <video> that YouTube swaps in during the break', () => {
    const { player, video } = setup();
    const veil = new AdVeil(player);
    ad(veil, player, true);
    const next = document.createElement('video');
    video.replaceWith(next);
    vi.advanceTimersByTime(TICK_MS);
    expect(next.muted).toBe(true);
    ad(veil, player, false);
    vi.advanceTimersByTime(RESTORE_DELAY_MS);
    expect(next.muted).toBe(false);
  });
});

describe('startYouTube', () => {
  let yt: ReturnType<typeof startYouTube> | undefined;
  afterEach(() => yt?.stop());

  it('picks up a player added later', async () => {
    document.body.innerHTML = '';
    yt = startYouTube(() => true);
    const { player, video } = setup();
    await Promise.resolve();
    player.classList.add('ad-showing');
    await new Promise((r) => setTimeout(r, 0));
    expect(video.muted).toBe(true);
  });

  it('applies a settings change through refresh()', async () => {
    const { player, video } = setup();
    let enabled = false;
    yt = startYouTube(() => enabled);
    player.classList.add('ad-showing');
    await new Promise((r) => setTimeout(r, 0));
    expect(video.muted).toBe(false);
    enabled = true;
    yt.refresh();
    expect(video.muted).toBe(true);
  });

  it('gives the audio back when the page goes away during an ad', async () => {
    const { player, video } = setup();
    yt = startYouTube(() => true);
    player.classList.add('ad-showing');
    await new Promise((r) => setTimeout(r, 0));
    window.dispatchEvent(new Event('pagehide'));
    expect(video.muted).toBe(false);
  });

  it('stop() gives the audio back', async () => {
    const { player, video } = setup();
    yt = startYouTube(() => true);
    player.classList.add('ad-showing');
    await new Promise((r) => setTimeout(r, 0));
    yt.stop();
    yt = undefined;
    expect(video.muted).toBe(false);
  });
});

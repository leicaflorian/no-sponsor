import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AD_RATE, RESTORE_DELAY_MS, TICK_MS, Veil, startVeil } from '../../src/sites/ad-veil';
import { PRIME_VIDEO, parseClock } from '../../src/sites/primevideo';

function setup() {
  document.body.innerHTML = `
    <video id="preview"></video>
    <div id="dv-web-player">
      <div><div class="atvwebplayersdk-video-surface"><div><video></video></div></div></div>
      <div class="atvwebplayersdk-player-container"><div id="overlay"></div></div>
    </div>`;
  const player = document.getElementById('dv-web-player') as HTMLElement;
  const video = player.querySelector('video') as HTMLVideoElement;
  const preview = document.getElementById('preview') as HTMLVideoElement;
  return { player, video, preview };
}

function addTimer(text: string) {
  const ad = document.createElement('div');
  ad.id = 'ad';
  ad.innerHTML = `<span>Pubblicità</span><span class="atvwebplayersdk-ad-timer-remaining-time">${text}</span>`;
  document.getElementById('overlay')!.appendChild(ad);
}

function removeTimer() {
  document.getElementById('ad')?.remove();
}

describe('parseClock', () => {
  it.each([
    ['1:40', 100],
    ['0:08', 8],
    [' 0:38 ', 38],
    ['1:02:03', 3723],
  ])('%s -> %s', (text, seconds) => {
    expect(parseClock(text)).toBe(seconds);
  });

  it.each(['', null, undefined, 'abc', '1:2'])('%s -> NaN', (text) => {
    expect(parseClock(text)).toBeNaN();
  });
});

describe('PRIME_VIDEO.matches', () => {
  it.each([
    ['www.primevideo.com', '/detail/X', true],
    ['www.amazon.it', '/gp/video/detail/X', true],
    ['www.amazon.co.uk', '/gp/video', true],
    ['www.amazon.it', '/dp/B0X', false],
    ['www.youtube.com', '/watch', false],
  ])('%s %s -> %s', (hostname, pathname, expected) => {
    expect(PRIME_VIDEO.matches({ hostname, pathname })).toBe(expected);
  });
});

describe('Veil on Prime Video', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('mutes the content video and plays it at 16x when the ad timer appears', () => {
    const { player, video } = setup();
    const veil = new Veil(player, PRIME_VIDEO);
    addTimer('1:40');
    veil.sync(true);
    expect(video.muted).toBe(true);
    expect(video.playbackRate).toBe(AD_RATE);
  });

  it('leaves videos outside the player alone', () => {
    const { player, preview } = setup();
    const veil = new Veil(player, PRIME_VIDEO);
    addTimer('1:40');
    veil.sync(true);
    expect(preview.muted).toBe(false);
    expect(preview.playbackRate).toBe(1);
  });

  it('restores audio and speed after the timer disappears', () => {
    const { player, video } = setup();
    const veil = new Veil(player, PRIME_VIDEO);
    addTimer('1:40');
    veil.sync(true);
    removeTimer();
    veil.sync(true);
    vi.advanceTimersByTime(RESTORE_DELAY_MS);
    expect(video.muted).toBe(false);
    expect(video.playbackRate).toBe(1);
  });

  it('restores the speed at once when the timer disappears, the audio after the delay', () => {
    const { player, video } = setup();
    const veil = new Veil(player, PRIME_VIDEO);
    addTimer('1:40');
    veil.sync(true);
    removeTimer();
    veil.sync(true);
    expect(video.playbackRate).toBe(1);
    expect(video.muted).toBe(true);
    vi.advanceTimersByTime(RESTORE_DELAY_MS);
    expect(video.muted).toBe(false);
    expect(video.playbackRate).toBe(1);
  });

  it('goes back to 16x when the timer reappears within the delay', () => {
    const { player, video } = setup();
    const veil = new Veil(player, PRIME_VIDEO);
    video.playbackRate = 1.5;
    addTimer('1:40');
    veil.sync(true);
    removeTimer();
    veil.sync(true);
    expect(video.playbackRate).toBe(1.5);
    addTimer('0:30');
    veil.sync(true);
    expect(video.playbackRate).toBe(AD_RATE);
    expect(video.muted).toBe(true);
    removeTimer();
    veil.sync(true);
    vi.advanceTimersByTime(RESTORE_DELAY_MS);
    expect(video.playbackRate).toBe(1.5);
    expect(video.muted).toBe(false);
  });

  it('puts the speed back to 16x on the next tick when a stream reload resets it silently', () => {
    const { player, video } = setup();
    const veil = new Veil(player, PRIME_VIDEO);
    addTimer('1:40');
    veil.sync(true);
    video.playbackRate = 1;
    vi.advanceTimersByTime(TICK_MS);
    expect(video.playbackRate).toBe(AD_RATE);
  });

  it('treats a timer that vanishes for an instant as one break', () => {
    const { player, video } = setup();
    const veil = new Veil(player, PRIME_VIDEO);
    addTimer('1:40');
    veil.sync(true);
    removeTimer();
    veil.sync(true);
    vi.advanceTimersByTime(RESTORE_DELAY_MS - 100);
    expect(video.muted).toBe(true);
    addTimer('0:30');
    veil.sync(true);
    vi.advanceTimersByTime(RESTORE_DELAY_MS * 2);
    expect(video.muted).toBe(true);
    expect(video.playbackRate).toBe(AD_RATE);
  });

  it('writes the remaining time from the ad timer at the real speed', () => {
    const { player } = setup();
    const veil = new Veil(player, PRIME_VIDEO);
    addTimer('1:40');
    veil.sync(true);
    expect(player.dataset['nspRemaining']).toBe('0:07');
    removeTimer();
    veil.sync(true);
    addTimer('0:38');
    veil.sync(true);
    expect(player.dataset['nspRemaining']).toBe('0:03');
  });

  it('writes nothing when the timer is unreadable', () => {
    const { player, video } = setup();
    const veil = new Veil(player, PRIME_VIDEO);
    addTimer('');
    veil.sync(true);
    expect(player.dataset['nspRemaining']).toBeUndefined();
    expect(video.muted).toBe(true);
  });

  it('starts on an ad that is there before playback', () => {
    const { player, video } = setup();
    expect(video.paused).toBe(true);
    addTimer('1:40');
    const veil = new Veil(player, PRIME_VIDEO);
    veil.sync(true);
    expect(video.muted).toBe(true);
    expect(video.playbackRate).toBe(AD_RATE);
  });
});

describe('startVeil on Prime Video', () => {
  let veil: ReturnType<typeof startVeil> | undefined;
  afterEach(() => veil?.stop());

  it('picks up the ad timer added inside an existing player', async () => {
    const { video } = setup();
    veil = startVeil(PRIME_VIDEO, () => true);
    addTimer('1:40');
    await new Promise((r) => setTimeout(r, 0));
    expect(video.muted).toBe(true);
  });

  it('picks up a player added later with the ad already on', async () => {
    document.body.innerHTML = '';
    veil = startVeil(PRIME_VIDEO, () => true);
    document.body.innerHTML = `
      <div id="dv-web-player-2">
        <div class="atvwebplayersdk-video-surface"><video></video></div>
        <div class="atvwebplayersdk-player-container"><div id="overlay"></div></div>
      </div>`;
    addTimer('1:40');
    await new Promise((r) => setTimeout(r, 0));
    expect(document.querySelector('video')!.muted).toBe(true);
  });

  it('picks up a timer that is already there when the video is added to the player', async () => {
    document.body.innerHTML = `
      <div id="dv-web-player">
        <div class="atvwebplayersdk-player-container"><div id="overlay"></div></div>
      </div>`;
    addTimer('1:40');
    veil = startVeil(PRIME_VIDEO, () => true);
    const surface = document.createElement('div');
    surface.className = 'atvwebplayersdk-video-surface';
    surface.innerHTML = '<video></video>';
    document.getElementById('dv-web-player')!.appendChild(surface);
    await new Promise((r) => setTimeout(r, 0));
    const video = document.querySelector('video')!;
    expect(video.muted).toBe(true);
    expect(video.playbackRate).toBe(AD_RATE);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AD_RATE, RESTORE_DELAY_MS, TICK_MS, Veil, startVeil } from '../../src/sites/ad-veil';
import { NETFLIX, parseAdSeconds } from '../../src/sites/netflix';

function setup() {
  document.body.innerHTML = `
    <video id="preview"></video>
    <div data-uia="watch-video" class="watch-video">
      <div data-uia="player">
        <div data-uia="video-canvas"><div><div><video></video></div></div></div>
        <div id="overlay"></div>
      </div>
    </div>`;
  const player = document.querySelector('[data-uia="player"]') as HTMLElement;
  const video = player.querySelector('video') as HTMLVideoElement;
  const preview = document.getElementById('preview') as HTMLVideoElement;
  return { player, video, preview };
}

function addAd(text: string) {
  const ad = document.createElement('div');
  ad.id = 'ad';
  ad.setAttribute('data-uia', 'ads-info-container');
  ad.innerHTML = `<div><span data-uia="ads-info-text">Pubblicità</span><span data-uia="ads-info-time">${text}</span></div>`;
  document.getElementById('overlay')!.appendChild(ad);
}

function removeAd() {
  document.getElementById('ad')?.remove();
}

describe('parseAdSeconds', () => {
  it.each([
    ['15', 15],
    [' 0 ', 0],
    ['1:05', 65],
  ])('%s -> %s', (text, seconds) => {
    expect(parseAdSeconds(text)).toBe(seconds);
  });

  it.each(['', null, undefined, 'abc', '1:2', '-3'])('%s -> NaN', (text) => {
    expect(parseAdSeconds(text)).toBeNaN();
  });
});

describe('NETFLIX.matches', () => {
  it.each([
    ['www.netflix.com', '/watch/81943170', true],
    ['www.netflix.com', '/browse', true],
    ['netflix.com.example.org', '/watch/1', false],
    ['www.youtube.com', '/watch', false],
  ])('%s %s -> %s', (hostname, pathname, expected) => {
    expect(NETFLIX.matches({ hostname, pathname })).toBe(expected);
  });
});

describe('Veil on Netflix', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('mutes the content video and plays it at 16x when the ad block appears', () => {
    const { player, video } = setup();
    const veil = new Veil(player, NETFLIX);
    addAd('15');
    veil.sync(true);
    expect(video.muted).toBe(true);
    expect(video.playbackRate).toBe(AD_RATE);
  });

  it('leaves videos outside the player alone', () => {
    const { player, preview } = setup();
    const veil = new Veil(player, NETFLIX);
    addAd('15');
    veil.sync(true);
    expect(preview.muted).toBe(false);
    expect(preview.playbackRate).toBe(1);
  });

  it('restores the speed at once and the audio after the delay', () => {
    const { player, video } = setup();
    const veil = new Veil(player, NETFLIX);
    addAd('15');
    veil.sync(true);
    removeAd();
    veil.sync(true);
    expect(video.playbackRate).toBe(1);
    expect(video.muted).toBe(true);
    vi.advanceTimersByTime(RESTORE_DELAY_MS);
    expect(video.muted).toBe(false);
  });

  it('writes the remaining time from the ad seconds at the real speed', () => {
    const { player } = setup();
    const veil = new Veil(player, NETFLIX);
    addAd('15');
    veil.sync(true);
    expect(player.dataset['nspRemaining']).toBe('0:01');
    removeAd();
    veil.sync(true);
    addAd('1:05');
    veil.sync(true);
    expect(player.dataset['nspRemaining']).toBe('0:05');
  });

  it('writes nothing when the seconds are unreadable', () => {
    const { player, video } = setup();
    const veil = new Veil(player, NETFLIX);
    addAd('');
    veil.sync(true);
    expect(player.dataset['nspRemaining']).toBeUndefined();
    expect(video.muted).toBe(true);
  });

  it('counts one break per ad block', () => {
    const { player } = setup();
    const onAdStart = vi.fn();
    const veil = new Veil(player, NETFLIX, onAdStart);
    addAd('15');
    veil.sync(true);
    expect(onAdStart).toHaveBeenCalledTimes(1);
    removeAd();
    veil.sync(true);
    vi.advanceTimersByTime(RESTORE_DELAY_MS - 100);
    addAd('10');
    veil.sync(true);
    expect(onAdStart).toHaveBeenCalledTimes(1);
  });
});

describe('startVeil on Netflix', () => {
  let veil: ReturnType<typeof startVeil> | undefined;
  afterEach(() => veil?.stop());

  it('picks up the ad block added inside an existing player', async () => {
    const { video } = setup();
    veil = startVeil(NETFLIX, () => true);
    addAd('15');
    await new Promise((r) => setTimeout(r, 0));
    expect(video.muted).toBe(true);
  });

  it('picks up a player added later with the ad already on', async () => {
    document.body.innerHTML = '';
    veil = startVeil(NETFLIX, () => true);
    document.body.innerHTML = `
      <div class="watch-video">
        <div data-uia="player">
          <div data-uia="video-canvas"><video></video></div>
          <div id="overlay"></div>
        </div>
      </div>`;
    addAd('15');
    await new Promise((r) => setTimeout(r, 0));
    expect(document.querySelector('video')!.muted).toBe(true);
  });

  it('veils a video added after the ad block', async () => {
    document.body.innerHTML = `
      <div class="watch-video">
        <div data-uia="player"><div id="overlay"></div></div>
      </div>`;
    addAd('15');
    veil = startVeil(NETFLIX, () => true);
    const canvas = document.createElement('div');
    canvas.setAttribute('data-uia', 'video-canvas');
    canvas.innerHTML = '<video></video>';
    document.querySelector('[data-uia="player"]')!.appendChild(canvas);
    await new Promise((r) => setTimeout(r, 0));
    const video = document.querySelector('video')!;
    expect(video.muted).toBe(true);
    expect(video.playbackRate).toBe(AD_RATE);
  });

  it('disposes the veil of a player that leaves the page', async () => {
    const { player, video } = setup();
    addAd('15');
    veil = startVeil(NETFLIX, () => true);
    expect(video.playbackRate).toBe(AD_RATE);
    player.remove();
    await new Promise((r) => setTimeout(r, 0));
    // dispose() unmutes and restores the speed; a still-running veil would force 16x again on the next tick
    expect(video.muted).toBe(false);
    video.playbackRate = 1;
    await new Promise((r) => setTimeout(r, TICK_MS + 100));
    expect(video.playbackRate).toBe(1);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RESTORE_DELAY_MS, TICK_MS, Veil, startVeil } from '../../src/sites/ad-veil';
import { PRIME_VIDEO } from '../../src/sites/primevideo';
import { YOUTUBE } from '../../src/sites/youtube';

function youtubePlayer(withVideo = true) {
  document.body.innerHTML = `<div id="movie_player" class="html5-video-player">${withVideo ? '<video></video>' : ''}</div>`;
  return document.getElementById('movie_player') as HTMLElement;
}

function ad(veil: Veil, player: HTMLElement, on: boolean, enabled = true) {
  player.classList.toggle('ad-showing', on);
  veil.sync(enabled);
}

function primePlayer() {
  document.body.innerHTML = `
    <div id="dv-web-player">
      <div><div class="atvwebplayersdk-video-surface"><div><video></video></div></div></div>
      <div class="atvwebplayersdk-player-container"><div id="overlay"></div></div>
    </div>`;
  return document.getElementById('dv-web-player') as HTMLElement;
}

function addTimer() {
  const el = document.createElement('div');
  el.id = 'ad';
  el.innerHTML = '<span class="atvwebplayersdk-ad-timer-remaining-time">0:30</span>';
  document.getElementById('overlay')!.appendChild(el);
}

describe('Veil onAdStart', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('calls onAdStart once when an ad starts', () => {
    const player = youtubePlayer();
    const onAdStart = vi.fn();
    const veil = new Veil(player, YOUTUBE, onAdStart);
    ad(veil, player, true);
    expect(onAdStart).toHaveBeenCalledTimes(1);
    veil.dispose();
  });

  it('counts back-to-back ads as one break', () => {
    const player = youtubePlayer();
    const onAdStart = vi.fn();
    const veil = new Veil(player, YOUTUBE, onAdStart);
    ad(veil, player, true);
    ad(veil, player, false);
    vi.advanceTimersByTime(RESTORE_DELAY_MS - 1);
    ad(veil, player, true);
    expect(onAdStart).toHaveBeenCalledTimes(1);
    ad(veil, player, false);
    vi.advanceTimersByTime(RESTORE_DELAY_MS);
    ad(veil, player, true);
    expect(onAdStart).toHaveBeenCalledTimes(2);
    veil.dispose();
  });

  it('counts a Prime Video break once even if the timer flickers', () => {
    const player = primePlayer();
    const onAdStart = vi.fn();
    const veil = new Veil(player, PRIME_VIDEO, onAdStart);
    addTimer();
    veil.sync(true);
    document.getElementById('ad')?.remove();
    veil.sync(true);
    vi.advanceTimersByTime(RESTORE_DELAY_MS - 1);
    addTimer();
    veil.sync(true);
    expect(onAdStart).toHaveBeenCalledTimes(1);
    veil.dispose();
  });

  it('does not count while the site is off', () => {
    const player = youtubePlayer();
    const onAdStart = vi.fn();
    const veil = new Veil(player, YOUTUBE, onAdStart);
    ad(veil, player, true, false);
    expect(onAdStart).not.toHaveBeenCalled();
    veil.sync(true);
    expect(onAdStart).toHaveBeenCalledTimes(1);
    veil.dispose();
  });

  it('does not count a video swap as a new break', () => {
    const player = youtubePlayer();
    const onAdStart = vi.fn();
    const veil = new Veil(player, YOUTUBE, onAdStart);
    ad(veil, player, true);
    player.querySelector('video')!.replaceWith(document.createElement('video'));
    vi.advanceTimersByTime(TICK_MS);
    expect(onAdStart).toHaveBeenCalledTimes(1);
    veil.dispose();
  });

  it('does not count a video removed and added back as a new break', () => {
    const player = youtubePlayer();
    const onAdStart = vi.fn();
    const veil = new Veil(player, YOUTUBE, onAdStart);
    ad(veil, player, true);
    player.querySelector('video')!.remove();
    vi.advanceTimersByTime(TICK_MS);
    player.appendChild(document.createElement('video'));
    veil.sync(true);
    expect(onAdStart).toHaveBeenCalledTimes(1);
    veil.dispose();
  });

  it('does not count a site toggled off and on during the same ad', () => {
    const player = youtubePlayer();
    const onAdStart = vi.fn();
    const veil = new Veil(player, YOUTUBE, onAdStart);
    ad(veil, player, true);
    veil.sync(false);
    veil.sync(true);
    expect(onAdStart).toHaveBeenCalledTimes(1);
    ad(veil, player, false);
    vi.advanceTimersByTime(RESTORE_DELAY_MS);
    ad(veil, player, true);
    expect(onAdStart).toHaveBeenCalledTimes(2);
    veil.dispose();
  });

  it('does not count when the player has no video', () => {
    const player = youtubePlayer(false);
    const onAdStart = vi.fn();
    const veil = new Veil(player, YOUTUBE, onAdStart);
    ad(veil, player, true);
    expect(onAdStart).not.toHaveBeenCalled();
    veil.dispose();
  });
});

describe('startVeil', () => {
  it('startVeil passes onAdStart to every player', () => {
    document.body.innerHTML = `
      <div class="html5-video-player ad-showing"><video></video></div>
      <div class="html5-video-player ad-showing"><video></video></div>`;
    const onAdStart = vi.fn();
    const veil = startVeil(YOUTUBE, () => true, onAdStart);
    expect(onAdStart).toHaveBeenCalledTimes(2);
    veil.stop();
  });
});

import { describe, expect, it } from 'vitest';
import { findContainer } from '../../src/engine/container';
import type { Detector } from '../../src/rules/types';

const cfg: Detector = { id: 't', name: 't', selectors: [], labels: [], container: ['.card', 'li'] };

describe('findContainer', () => {
  it('list order wins, not proximity', () => {
    document.body.innerHTML = '<div class="card" id="c"><ul><li><span id="el">x</span></li></ul></div>';
    expect(findContainer(document.getElementById('el') as Element, cfg)?.id).toBe('c');
  });

  it('skips a container matching FORBIDDEN and moves on to the next', () => {
    document.body.innerHTML = '<main class="card"><ul><li id="l"><span id="el">x</span></li></ul></main>';
    expect(findContainer(document.getElementById('el') as Element, cfg)?.id).toBe('l');
  });

  it('skips a container with more than 15,000 characters of text', () => {
    document.body.innerHTML = `<div class="card">${'a'.repeat(15001)}<ul><li id="l"><span id="el">x</span></li></ul></div>`;
    expect(findContainer(document.getElementById('el') as Element, cfg)?.id).toBe('l');
  });

  it('returns null when no container is found', () => {
    document.body.innerHTML = '<div><span id="el">x</span></div>';
    expect(findContainer(document.getElementById('el') as Element, cfg)).toBeNull();
  });

  it('never picks the YouTube player as container', () => {
    // The player has a class containing "card" (ytp-cards-teaser-dismissible) and holds the ad's "Sponsorizzato".
    document.body.innerHTML =
      '<div id="movie_player" class="html5-video-player ytp-cards-teaser-dismissible"><span id="el">Sponsorizzato</span></div>';
    const yt: Detector = { ...cfg, container: ['[class*="card" i]'] };
    expect(findContainer(document.getElementById('el') as Element, yt)).toBeNull();
  });

  it('never picks the Prime Video player as container', () => {
    document.body.innerHTML =
      '<div id="dv-web-player-2"><div class="atvwebplayersdk-player-container"><div><span id="el">Pubblicità</span></div></div></div>';
    const pv: Detector = { ...cfg, container: ['.atvwebplayersdk-player-container', '[id^="dv-web-player"]'] };
    expect(findContainer(document.getElementById('el') as Element, pv)).toBeNull();
  });

  it('never picks the Netflix player as container', () => {
    document.body.innerHTML =
      '<div class="watch-video"><div data-uia="player"><div><span id="el">Pubblicità</span></div></div></div>';
    const nf: Detector = { ...cfg, container: ['[data-uia="player"]', '.watch-video'] };
    expect(findContainer(document.getElementById('el') as Element, nf)).toBeNull();
  });

  it.each([
    ['pause-ad inside .watch-video', '<div class="watch-video"><div data-uia="pause-ad">%</div></div>'],
    ['the player', '<div data-uia="player">%</div>'],
  ])('returns null for a label inside the Netflix watch page (%s)', (_name, wrap) => {
    document.body.innerHTML = wrap.replace(
      '%',
      '<ul><li><div class="card"><span id="el">Pubblicità</span></div></li></ul>',
    );
    expect(findContainer(document.getElementById('el') as Element, cfg)).toBeNull();
  });
});

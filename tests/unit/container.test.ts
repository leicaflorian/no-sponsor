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
});

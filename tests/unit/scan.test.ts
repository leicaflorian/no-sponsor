import { beforeEach, describe, expect, it } from 'vitest';
import { scan } from '../../src/engine/scan';
import { GENERIC, SITES } from '../../src/rules/detectors';
import type { Detector } from '../../src/rules/types';

function site(id: string): Detector {
  const s = SITES.find((d) => d.id === id);
  if (!s) throw new Error(`detector ${id} missing`);
  return s;
}

const hits = () => [...document.querySelectorAll<HTMLElement>('.nsp-hit')];

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('scan', () => {
  it('Google: a label inside #rcnt marks the .MjjYud result', () => {
    document.body.innerHTML =
      '<div id="rcnt"><div class="MjjYud" id="r"><span>Sponsorizzato</span><a href="#">Negozio</a></div></div>';
    scan(document.body, site('google'));
    const r = document.getElementById('r') as HTMLElement;
    expect(r.classList.contains('nsp-hit')).toBe(true);
    expect(r.dataset['nspReason']).toBe('google · etichetta "sponsorizzato"');
    expect(hits()).toHaveLength(1);
  });

  it('Subito: "In evidenza" marks the li', () => {
    // 0.1.0: known false positive, known issue, to be fixed in Phase 1 (containers)
    document.body.innerHTML = '<ul><li id="l"><a>In evidenza</a></li></ul>';
    scan(document.body, site('subito'));
    const l = document.getElementById('l') as HTMLElement;
    expect(l.classList.contains('nsp-hit')).toBe(true);
    expect(l.dataset['nspReason']).toBe('subito · etichetta "in evidenza"');
  });

  it('selectors: div-gpt-ad with GENERIC', () => {
    document.body.innerHTML = '<div id="div-gpt-ad-1"></div>';
    scan(document.body, GENERIC);
    const ad = document.getElementById('div-gpt-ad-1') as HTMLElement;
    expect(ad.classList.contains('nsp-hit')).toBe(true);
    expect(ad.dataset['nspReason']).toBe('generic · [id^="div-gpt-ad"]');
  });

  it('Amazon: sp-sponsored-result marks the result that contains it', () => {
    document.body.innerHTML =
      '<div data-component-type="s-search-result" id="res"><div data-component-type="sp-sponsored-result"></div></div>';
    scan(document.body, site('amazon'));
    const res = document.getElementById('res') as HTMLElement;
    expect(res.classList.contains('nsp-hit')).toBe(true);
    expect(res.dataset['nspReason']).toBe('amazon · [data-component-type="sp-sponsored-result"]');
    expect(hits()).toHaveLength(1);
  });

  it('an ancestor marked after its children absorbs their marks', () => {
    // [data-google-query-id] comes before [id^="div-gpt-ad"] in AD_SELECTORS: the child is marked first.
    document.body.innerHTML = '<div id="div-gpt-ad-2"><div data-google-query-id="q" id="child"></div></div>';
    scan(document.body, GENERIC);
    expect(hits().map((el) => el.id)).toEqual(['div-gpt-ad-2']);
    const child = document.getElementById('child') as HTMLElement;
    expect(child.dataset['nspReason']).toBeUndefined();
  });

  it('without a detector nothing is marked', () => {
    document.body.innerHTML = '<div id="div-gpt-ad-3"></div><ul><li><a>Sponsorizzato</a></li></ul>';
    scan(document.body, null);
    expect(hits()).toHaveLength(0);
  });
});

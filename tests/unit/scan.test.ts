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
    document.body.innerHTML = '<div id="div-gpt-ad-1"><iframe></iframe></div>';
    scan(document.body, GENERIC);
    const ad = document.getElementById('div-gpt-ad-1') as HTMLElement;
    expect(ad.classList.contains('nsp-hit')).toBe(true);
    expect(ad.dataset['nspReason']).toBe('generic · [id^="div-gpt-ad"]');
  });

  describe('empty ad slots', () => {
    // Google leaves #tads/#tadsb/#bottomads in the page even when there are no ads,
    // holding only empty placeholder divs: marking them shows an empty banner.
    const emptySlot = (id: string) =>
      `<div id="${id}"><div class="GUyUUb" data-hb="t"><div></div></div><div class="GUyUUb" data-hb="b"><div> </div></div></div>`;

    it('Google: empty #tads, #tadsb and #bottomads are not marked', () => {
      document.body.innerHTML = `${emptySlot('tads')}<div id="bottomads">${emptySlot('tadsb')}</div>`;
      scan(document.body, site('google'));
      expect(hits()).toHaveLength(0);
    });

    it('Google: #tads with an ad in it is marked', () => {
      document.body.innerHTML = '<div id="tads"><div class="GUyUUb"><a href="#">Negozio</a></div></div>';
      scan(document.body, site('google'));
      expect(hits().map((el) => el.id)).toEqual(['tads']);
    });

    it('an empty slot is marked once content is added to it', () => {
      document.body.innerHTML = emptySlot('bottomads');
      const slot = document.getElementById('bottomads') as HTMLElement;
      scan(document.body, site('google'));
      expect(hits()).toHaveLength(0);
      // what the MutationObserver does: scan only the added node
      const ad = document.createElement('div');
      ad.innerHTML = '<a href="#">Negozio</a>';
      slot.firstElementChild?.appendChild(ad);
      scan(ad, site('google'));
      expect(hits().map((el) => el.id)).toEqual(['bottomads']);
    });

    it('a slot holding only an iframe or an image counts as filled', () => {
      document.body.innerHTML = '<div id="div-gpt-ad-4"><iframe></iframe></div><ins class="adsbygoogle" id="ins"><img></ins>';
      scan(document.body, GENERIC);
      expect(hits().map((el) => el.id)).toEqual(['div-gpt-ad-4', 'ins']);
    });

    it('an empty GPT slot is not marked', () => {
      document.body.innerHTML = '<div id="div-gpt-ad-5"></div>';
      scan(document.body, GENERIC);
      expect(hits()).toHaveLength(0);
    });
  });

  it('Amazon: sp-sponsored-result marks the result that contains it', () => {
    document.body.innerHTML =
      '<div data-component-type="s-search-result" id="res"><div data-component-type="sp-sponsored-result"></div><h2>Prodotto</h2></div>';
    scan(document.body, site('amazon'));
    const res = document.getElementById('res') as HTMLElement;
    expect(res.classList.contains('nsp-hit')).toBe(true);
    expect(res.dataset['nspReason']).toBe('amazon · [data-component-type="sp-sponsored-result"]');
    expect(hits()).toHaveLength(1);
  });

  describe('Amazon home cards (inside a .celwidget too large to be a container)', () => {
    // Markup reduced from the owner's personalised home (class names as Amazon renders them).
    const filler = `<p>${'x'.repeat(16000)}</p>`;
    const label = '<div class="adFeedbackMainComponent_1"><span>Sponsorizzato</span></div>';
    const widgetCard = (id: string, sponsored: boolean) =>
      `<div class="a-cardui _npack-asin-card_style_mosaic-card__1C-_R" id="${id}">` +
      `<div class="a-cardui-header">${sponsored ? `<div class="hybrid-widget-sponsored-label">${label}</div>` : ''}` +
      '<h2>Continua esplorazione</h2></div><div class="a-cardui-body">prodotti</div></div>';
    const tile = (id: string, sponsored: boolean) =>
      `<div class="a-section _npack-asin-card_style_asin-container__EaHh8" id="${id}">` +
      `${sponsored ? `<div class="hybrid-sponsored-label">${label}</div>` : ''}<span>20% di sconto</span></div>`;
    const page = (inner: string) => `<div id="a-page"><div class="celwidget">${inner}${filler}</div></div>`;

    it('a label in the card header marks the whole card', () => {
      document.body.innerHTML = page(widgetCard('card', true) + widgetCard('other', false));
      scan(document.body, site('amazon'));
      expect(hits().map((el) => el.id)).toEqual(['card']);
      expect(hits()[0]?.dataset['nspReason']).toBe('amazon · etichetta "sponsorizzato"');
    });

    it('a label on a single product marks only that product, not its card', () => {
      document.body.innerHTML = page(
        `<div class="a-cardui" id="card"><div class="a-cardui-body">${tile('tile', true)}${tile('plain', false)}</div></div>`,
      );
      scan(document.body, site('amazon'));
      expect(hits().map((el) => el.id)).toEqual(['tile']);
    });

    it('a widget label in a gwm window-pane card marks the whole card', () => {
      // The gwm tiles have no asin-container class: the label reaches the enclosing .a-cardui.
      document.body.innerHTML = page(
        '<div class="a-cardui" id="pane"><div class="a-cardui-body _gwm-asin-tile_style_windowPaneContainer__3s9TI">' +
          `<div class="_gwm-asin-tile_style_windowPaneSponsoredBadgeContainer__3LwvE"><div class="hybrid-widget-sponsored-label">${label}</div></div>` +
          '<span>Per te</span></div></div>' +
          widgetCard('other', false),
      );
      scan(document.body, site('amazon'));
      expect(hits().map((el) => el.id)).toEqual(['pane']);
    });
  });

  it('an ancestor marked after its children absorbs their marks', () => {
    // [data-google-query-id] comes before [id^="div-gpt-ad"] in AD_SELECTORS: the child is marked first.
    document.body.innerHTML = '<div id="div-gpt-ad-2"><div data-google-query-id="q" id="child"><iframe></iframe></div></div>';
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

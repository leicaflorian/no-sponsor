import { afterEach, describe, expect, it, vi } from 'vitest';
import { isVisible } from '../../src/engine/visibility';

const BASE: Record<string, string> = {
  display: 'block',
  visibility: 'visible',
  opacity: '1',
  fontSize: '16px',
  position: 'static',
  width: 'auto',
  height: 'auto',
  overflow: 'visible',
};

// Replaces getComputedStyle: styles not specified are "visible".
function mockStyles(map: Map<Element, Record<string, string>>) {
  vi.spyOn(window, 'getComputedStyle').mockImplementation(
    (el: Element) => ({ ...BASE, ...(map.get(el) ?? {}) }) as unknown as CSSStyleDeclaration,
  );
}

function setup() {
  document.body.innerHTML = '<div id="outer"><div id="mid"><span id="el">x</span></div></div>';
  const q = (id: string) => document.getElementById(id) as HTMLElement;
  return { outer: q('outer'), mid: q('mid'), el: q('el') };
}

afterEach(() => vi.restoreAllMocks());

describe('isVisible', () => {
  it('is visible without tricks', () => {
    const { el } = setup();
    mockStyles(new Map());
    expect(isVisible(el)).toBe(true);
  });

  it.each([
    ['display: none', { display: 'none' }],
    ['visibility: hidden', { visibility: 'hidden' }],
    ['visibility: collapse', { visibility: 'collapse' }],
    ['opacity: 0', { opacity: '0' }],
    ['font-size: 0px', { fontSize: '0px' }],
    ['absolute 1px overflow hidden', { position: 'absolute', width: '1px', overflow: 'hidden' }],
  ])('is hidden with %s', (_n, style) => {
    const { el } = setup();
    mockStyles(new Map([[el, style]]));
    expect(isVisible(el)).toBe(false);
  });

  it('is hidden with display: none on an ancestor', () => {
    const { el, outer } = setup();
    mockStyles(new Map([[outer, { display: 'none' }]]));
    expect(isVisible(el)).toBe(false);
  });

  it('is visible with absolute and 1px but overflow visible', () => {
    const { el } = setup();
    mockStyles(new Map([[el, { position: 'absolute', width: '1px', overflow: 'visible' }]]));
    expect(isVisible(el)).toBe(true);
  });

  it('is visible if the hidden ancestor is above stop', () => {
    const { el, mid, outer } = setup();
    mockStyles(new Map([[outer, { display: 'none' }]]));
    expect(isVisible(el, mid)).toBe(true);
  });
});

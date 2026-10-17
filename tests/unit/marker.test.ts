import { afterEach, describe, expect, it, vi } from 'vitest';
import { updateInset } from '../../src/engine/marker';

type Box = { left: number; top: number; width: number; height: number };

// Replaces layout: each element gets the given box (others are empty) and overflow is visible.
function mockLayout(boxes: Map<Element, Box>) {
  vi.spyOn(window, 'getComputedStyle').mockImplementation(
    () => ({ overflowX: 'visible', overflowY: 'visible' }) as unknown as CSSStyleDeclaration,
  );
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const b = boxes.get(this) ?? { left: 0, top: 0, width: 0, height: 0 };
    return { ...b, right: b.left + b.width, bottom: b.top + b.height, x: b.left, y: b.top } as DOMRect;
  });
}

// A grid row of three cards inside a wide container, far from the page edges.
function setup() {
  document.body.innerHTML = '<div id="grid"><div id="a"></div><div id="b"></div><div id="c"></div></div>';
  const q = (id: string) => document.getElementById(id) as HTMLElement;
  return { grid: q('grid'), a: q('a'), b: q('b'), c: q('c') };
}

afterEach(() => vi.restoreAllMocks());

describe('updateInset', () => {
  it('keeps the outer border when there is room around the block', () => {
    const { grid, a, b, c } = setup();
    mockLayout(
      new Map([
        [grid, { left: 50, top: 100, width: 1000, height: 400 }],
        [a, { left: 100, top: 150, width: 250, height: 300 }],
        [b, { left: 400, top: 150, width: 250, height: 300 }],
        [c, { left: 700, top: 150, width: 250, height: 300 }],
      ]),
    );
    updateInset(b);
    expect(b.classList.contains('nsp-inset')).toBe(false);
  });

  it('moves the border inside when a sibling touches the block (Amazon results grid)', () => {
    const { grid, a, b, c } = setup();
    mockLayout(
      new Map([
        [grid, { left: 50, top: 100, width: 1000, height: 400 }],
        [a, { left: 100, top: 150, width: 250, height: 300 }],
        [b, { left: 350, top: 150, width: 250, height: 300 }],
        [c, { left: 700, top: 150, width: 250, height: 300 }],
      ]),
    );
    updateInset(b);
    expect(b.classList.contains('nsp-inset')).toBe(true);
  });

  it('moves the border inside when the next row is closer than the border', () => {
    const { grid, a, b, c } = setup();
    mockLayout(
      new Map([
        [grid, { left: 50, top: 100, width: 1000, height: 800 }],
        [a, { left: 100, top: 150, width: 250, height: 300 }],
        [b, { left: 400, top: 150, width: 250, height: 300 }],
        [c, { left: 400, top: 458, width: 250, height: 300 }],
      ]),
    );
    updateInset(b);
    expect(b.classList.contains('nsp-inset')).toBe(true);
  });

  it('looks at the neighbours of a wrapper with the same box as the block', () => {
    document.body.innerHTML = '<div id="grid"><div id="a"></div><div id="wrap"><div id="b"></div></div></div>';
    const q = (id: string) => document.getElementById(id) as HTMLElement;
    mockLayout(
      new Map([
        [q('grid'), { left: 50, top: 100, width: 1000, height: 400 }],
        [q('a'), { left: 100, top: 150, width: 250, height: 300 }],
        [q('wrap'), { left: 352, top: 150, width: 250, height: 300 }],
        [q('b'), { left: 352, top: 150, width: 250, height: 300 }],
      ]),
    );
    updateInset(q('b'));
    expect(q('b').classList.contains('nsp-inset')).toBe(true);
  });

  it('does not judge neighbours for a block with no height (content overflowing it)', () => {
    const { grid, a, b } = setup();
    mockLayout(
      new Map([
        [grid, { left: 50, top: 100, width: 1000, height: 400 }],
        [a, { left: 400, top: 154, width: 250, height: 300 }],
        [b, { left: 400, top: 150, width: 250, height: 0 }],
      ]),
    );
    updateInset(b);
    expect(b.classList.contains('nsp-inset')).toBe(false);
  });

  it('ignores a sibling laid over the block', () => {
    const { grid, a, b } = setup();
    mockLayout(
      new Map([
        [grid, { left: 50, top: 100, width: 1000, height: 400 }],
        [a, { left: 420, top: 160, width: 50, height: 50 }],
        [b, { left: 400, top: 150, width: 250, height: 300 }],
      ]),
    );
    updateInset(b);
    expect(b.classList.contains('nsp-inset')).toBe(false);
  });
});

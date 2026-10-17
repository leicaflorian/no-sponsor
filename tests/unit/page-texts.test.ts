import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeI18n, setUILanguage } from './browser-i18n';

vi.mock('wxt/browser', () => ({ browser: { i18n: fakeI18n } }));

const { applyPageTexts, watchPageTexts } = await import('../../src/shared/page-texts');

describe('applyPageTexts', () => {
  let root: HTMLElement;
  const prop = (name: string) => root.style.getPropertyValue(name);

  beforeEach(() => {
    root = document.createElement('html');
    setUILanguage('it');
  });

  it('writes the three texts on html', () => {
    applyPageTexts(root);
    expect(prop('--nsp-t-collapsed')).toBe('"Contenuto sponsorizzato · clicca per mostrare"');
    expect(prop('--nsp-t-ad-before')).toBe('"Annuncio · mancano"');
    expect(prop('--nsp-t-ad-after')).toBe('""');
  });

  it('writes the English texts', () => {
    setUILanguage('en');
    applyPageTexts(root);
    expect(prop('--nsp-t-collapsed')).toBe('"Sponsored content · click to show"');
    expect(prop('--nsp-t-ad-before')).toBe('"Ad ·"');
    expect(prop('--nsp-t-ad-after')).toBe('"left"');
  });

  it('does not touch the style when nothing changed', async () => {
    applyPageTexts(root);
    const records: MutationRecord[] = [];
    const observer = new MutationObserver((r) => records.push(...r));
    observer.observe(root, { attributes: true });
    applyPageTexts(root);
    await new Promise((r) => setTimeout(r, 0));
    observer.disconnect();
    expect(records).toHaveLength(0);
  });

  it('restores the texts after the site rewrites the html style', () => {
    applyPageTexts(root);
    root.setAttribute('style', 'overflow: hidden');
    applyPageTexts(root);
    expect(prop('--nsp-t-collapsed')).toBe('"Contenuto sponsorizzato · clicca per mostrare"');
    expect(root.style.overflow).toBe('hidden');
  });

  it('restores the texts when the site clears the html style without adding nodes', async () => {
    applyPageTexts(root);
    const observer = watchPageTexts(root);
    root.removeAttribute('style');
    await new Promise((r) => setTimeout(r, 0));
    observer.disconnect();
    expect(prop('--nsp-t-collapsed')).toBe('"Contenuto sponsorizzato · clicca per mostrare"');
  });
});

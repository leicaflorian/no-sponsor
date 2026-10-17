import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeI18n, LOCALES, overrideGetMessage, readMessages, setUILanguage } from './browser-i18n';

vi.mock('wxt/browser', () => ({ browser: { i18n: fakeI18n } }));

const { cssString, t, uiLang } = await import('../../src/shared/i18n');

const placeholders = (text: string) => [...text.matchAll(/\$[A-Za-z0-9_]+\$/g)].map((m) => m[0]).sort();

describe('messages.json', () => {
  const en = readMessages('en');
  const it_ = readMessages('it');

  it('en and it have the same keys', () => {
    expect(Object.keys(it_).sort()).toEqual(Object.keys(en).sort());
  });

  it('en and it have the same placeholders', () => {
    for (const key of Object.keys(en)) {
      expect(placeholders(it_[key]?.message ?? ''), key).toEqual(placeholders(en[key]!.message));
      expect(Object.keys(it_[key]?.placeholders ?? {}).sort(), key).toEqual(
        Object.keys(en[key]!.placeholders ?? {}).sort(),
      );
    }
  });

  it('every message has a description', () => {
    for (const [key, m] of Object.entries(en)) expect(m.description, key).toBeTruthy();
  });

  it('no message is empty', () => {
    for (const locale of LOCALES) {
      for (const [key, m] of Object.entries(readMessages(locale))) {
        if (locale === 'it' && key === 'pageAdAfter') continue; // empty on purpose, see MAY_BE_EMPTY
        expect(m.message, `${locale}/${key}`).not.toBe('');
      }
    }
  });
});

describe('t', () => {
  beforeEach(() => setUILanguage('en'));

  it('returns the Italian text', () => {
    setUILanguage('it');
    expect(t('popupModeHighlight')).toBe('Evidenzia');
    expect(t('popupDetector', 'Amazon')).toBe('Rilevatore: Amazon');
  });

  it('returns the English text', () => {
    expect(t('popupModeHighlight')).toBe('Highlight');
    expect(t('popupDetector', 'Amazon')).toBe('Detector: Amazon');
  });

  it('keeps a text that may be empty empty', () => {
    setUILanguage('it');
    expect(t('pageAdAfter')).toBe('');
  });

  it('falls back to the key', () => {
    overrideGetMessage(() => '');
    expect(t('popupModeHighlight')).toBe('popupModeHighlight');
  });
});

describe('cssString', () => {
  it('quotes the text', () => {
    expect(cssString('Ad · left')).toBe('"Ad · left"');
  });

  it('escapes quotes and backslashes', () => {
    expect(cssString('a "b" \\ c')).toBe('"a \\"b\\" \\\\ c"');
  });
});

describe('uiLang', () => {
  it('is the language of the texts, not of the browser UI', () => {
    // Chrome for Testing has no Italian UI: getUILanguage says en-US while the texts are Italian.
    setUILanguage('it');
    const uiLanguage = vi.spyOn(fakeI18n, 'getUILanguage').mockReturnValue('en-US');
    expect(uiLang()).toBe('it');
    uiLanguage.mockRestore();
  });

  it.each([
    ['it', 'it'],
    ['it-CH', 'it'],
    ['en-GB', 'en'],
    ['de', 'en'],
  ])('%s -> %s', (browserLang, expected) => {
    setUILanguage(browserLang);
    expect(uiLang()).toBe(expected);
  });
});

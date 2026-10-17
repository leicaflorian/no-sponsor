// UI texts, from public/_locales/<lang>/messages.json in the browser's language
// (Italian or English, English for every other language).
import { browser } from 'wxt/browser';
import type en from '../../public/_locales/en/messages.json';

export type MessageKey = keyof typeof en;

// Texts that are empty on purpose in some language ("Annuncio · mancano 0:12": nothing after the time).
const MAY_BE_EMPTY: ReadonlySet<MessageKey> = new Set(['pageAdAfter']);

// The key itself when the text is missing, so a gap shows instead of an empty label.
export function t(key: MessageKey, ...subs: string[]): string {
  const text = browser.i18n.getMessage(key, subs);
  return text || MAY_BE_EMPTY.has(key) ? text : key;
}

// A CSS string literal, for texts passed to the stylesheet through custom properties.
export function cssString(text: string): string {
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

// Language of the texts shown, from the locale file the browser picked. Not getUILanguage(): the
// browser can pick the Italian texts while its own UI is in another language.
export function uiLang(): 'it' | 'en' {
  return t('locale') === 'it' ? 'it' : 'en';
}

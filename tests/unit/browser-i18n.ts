// Stand-in for browser.i18n in unit tests: reads the real public/_locales files and
// resolves placeholders the way Chrome does ($NAME$ -> "$1" -> first substitution).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type Message = { message: string; description?: string; placeholders?: Record<string, { content: string }> };
export type Messages = Record<string, Message>;

export const LOCALES = ['en', 'it'] as const;

export function readMessages(locale: string): Messages {
  return JSON.parse(
    readFileSync(join(__dirname, '../../public/_locales', locale, 'messages.json'), 'utf8'),
  ) as Messages;
}

let uiLanguage = 'en';
let override: ((key: string) => string) | null = null;

export function setUILanguage(lang: string): void {
  uiLanguage = lang;
  override = null;
}

// Makes getMessage return what `fn` says, e.g. '' for a missing message.
export function overrideGetMessage(fn: (key: string) => string): void {
  override = fn;
}

export const fakeI18n = {
  getUILanguage: () => uiLanguage,
  getMessage(key: string, subs?: string | string[]): string {
    if (override) return override(key);
    const locale = uiLanguage.toLowerCase().startsWith('it') ? 'it' : 'en';
    const m = readMessages(locale)[key];
    if (!m) return '';
    const args = subs === undefined ? [] : Array.isArray(subs) ? subs : [subs];
    return m.message.replace(/\$([A-Za-z0-9_]+)\$/g, (_, name: string) => {
      const content = m.placeholders?.[name.toLowerCase()]?.content ?? '';
      return content.replace(/\$(\d)/g, (_s, i: string) => args[Number(i) - 1] ?? '');
    });
  },
};

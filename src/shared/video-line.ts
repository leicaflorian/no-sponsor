// Popup line under the counter: how many of the items are veiled video ads.
import type { MessageKey } from './i18n';
import type { PageInfo } from './messages';

// The text of the line, or null when it must stay hidden.
export function videoLine(page: PageInfo | null, tr: (key: MessageKey, ...subs: string[]) => string): string | null {
  if (!page || page.video <= 0) return null;
  return tr(page.video === 1 ? 'popupVideoOne' : 'popupVideoMany', String(page.video));
}

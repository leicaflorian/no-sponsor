import { browser } from 'wxt/browser';
import type { CountMessage } from '../shared/messages';

export default defineBackground(() => {
  // Shows on the icon the number of sponsored items found in the tab.
  browser.runtime.onMessage.addListener((msg: unknown, sender) => {
    const m = msg as CountMessage | null;
    if (m?.type !== 'nsp-count' || !sender.tab?.id) return;
    const tabId = sender.tab.id;
    browser.action.setBadgeText({ tabId, text: m.n > 0 ? String(m.n) : '' });
    browser.action.setBadgeBackgroundColor({ tabId, color: '#d97706' });
    browser.action.setBadgeTextColor?.({ tabId, color: '#ffffff' });
  });
});

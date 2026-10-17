// Texts shown on pages by the content script's CSS (content: var(...)), which cannot call
// browser.i18n: they are written as custom properties on <html>, already quoted.
import { cssString, t, type MessageKey } from './i18n';

export const PAGE_TEXT_VARS: Record<string, MessageKey> = {
  '--nsp-t-collapsed': 'pageCollapsed',
  '--nsp-t-ad-before': 'pageAdBefore',
  '--nsp-t-ad-after': 'pageAdAfter',
};

// Writes only what differs, so the page's own observers see no mutation when nothing changed;
// called again when the site may have rewritten the style attribute of <html>.
export function applyPageTexts(root: HTMLElement): void {
  for (const [name, key] of Object.entries(PAGE_TEXT_VARS)) {
    const value = cssString(t(key));
    if (root.style.getPropertyValue(name) !== value) root.style.setProperty(name, value);
  }
}

// Re-applies the texts when the site rewrites the style attribute of <html> (e.g. when a
// modal closes): the content script's observer only sees added nodes. No loop: applyPageTexts
// writes only what differs.
export function watchPageTexts(root: HTMLElement): MutationObserver {
  const observer = new MutationObserver(() => applyPageTexts(root));
  observer.observe(root, { attributes: true, attributeFilter: ['style'] });
  return observer;
}

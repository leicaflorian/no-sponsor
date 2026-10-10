// Mostra sull'icona il numero di contenuti sponsorizzati trovati nella scheda.
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type !== 'nsp-count' || !sender.tab?.id) return;
  const tabId = sender.tab.id;
  chrome.action.setBadgeText({ tabId, text: msg.n > 0 ? String(msg.n) : '' });
  chrome.action.setBadgeBackgroundColor({ tabId, color: '#d97706' });
  chrome.action.setBadgeTextColor?.({ tabId, color: '#ffffff' });
});

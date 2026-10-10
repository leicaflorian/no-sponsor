const DEFAULTS = { mode: 'highlight', generic: true, disabledHosts: [] };
const $ = (id) => document.getElementById(id);

let settings = { ...DEFAULTS };
let page = null; // { n, host, site } dal content script

function render() {
  document.querySelectorAll('.segmented button').forEach((b) => {
    b.setAttribute('aria-checked', String(b.dataset.mode === settings.mode));
  });
  $('generic').checked = settings.generic;

  if (!page) {
    $('count').textContent = '–';
    $('countLabel').textContent = 'Nessuna analisi';
    $('detector').textContent = 'Pagina non supportata o da ricaricare';
    $('host').textContent = 'questo sito';
    $('siteEnabled').disabled = true;
    return;
  }

  const off = settings.disabledHosts.includes(page.host);
  $('count').textContent = page.n;
  $('countLabel').textContent = page.n === 1 ? 'contenuto sponsorizzato' : 'contenuti sponsorizzati';
  $('detector').textContent = page.site
    ? `Rilevatore: ${page.site}`
    : settings.generic ? 'Rilevamento generico' : 'Sito non supportato';
  $('host').textContent = page.host;
  $('siteEnabled').disabled = false;
  $('siteEnabled').checked = !off;
  $('note').textContent = off ? 'Disattivato su questo sito: i contenuti vengono contati ma non modificati.' : '';
}

function save(patch) {
  settings = { ...settings, ...patch };
  chrome.storage.sync.set(patch);
  render();
}

async function refreshCount(tabId) {
  try {
    page = await chrome.tabs.sendMessage(tabId, { type: 'nsp-get' });
  } catch (_) {
    page = null; // chrome://, Web Store, o scheda aperta prima dell'installazione
  }
  render();
}

async function init() {
  settings = { ...DEFAULTS, ...(await chrome.storage.sync.get(DEFAULTS)) };
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  render();
  if (tab?.id) {
    await refreshCount(tab.id);
    // il conteggio cambia se si passa da/verso il rilevamento generico
    chrome.storage.onChanged.addListener(() => setTimeout(() => refreshCount(tab.id), 400));
  }

  document.querySelectorAll('.segmented button').forEach((b) => {
    b.addEventListener('click', () => save({ mode: b.dataset.mode }));
  });

  $('generic').addEventListener('change', (e) => save({ generic: e.target.checked }));

  $('siteEnabled').addEventListener('change', (e) => {
    if (!page) return;
    const set = new Set(settings.disabledHosts);
    e.target.checked ? set.delete(page.host) : set.add(page.host);
    save({ disabledHosts: [...set] });
  });
}

init();

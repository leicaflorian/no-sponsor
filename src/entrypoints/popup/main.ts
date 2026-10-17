import { browser } from 'wxt/browser';
import type { GetMessage, PageInfo } from '../../shared/messages';
import { t, uiLang, type MessageKey } from '../../shared/i18n';
import { buildReportUrl } from '../../shared/report';
import { DEFAULTS, type Mode, type Settings } from '../../shared/settings';

const $ = (id: string) => document.getElementById(id) as HTMLElement;
const $input = (id: string) => document.getElementById(id) as HTMLInputElement;

let settings: Settings = { ...DEFAULTS };
let page: PageInfo | null = null; // { n, host, site } from the content script

function render(): void {
  document.querySelectorAll<HTMLButtonElement>('.segmented button').forEach((b) => {
    b.setAttribute('aria-checked', String(b.dataset['mode'] === settings.mode));
  });
  $input('generic').checked = settings.generic;

  if (!page) {
    $('count').textContent = '–';
    $('countLabel').textContent = t('popupNoScan');
    $('detector').textContent = t('popupNoScanHint');
    $('host').textContent = t('popupThisSite');
    $input('siteEnabled').disabled = true;
    return;
  }

  const off = settings.disabledHosts.includes(page.host);
  $('count').textContent = String(page.n);
  $('countLabel').textContent = t(page.n === 1 ? 'popupCountOne' : 'popupCountMany');
  $('detector').textContent = page.site
    ? t('popupDetector', page.site)
    : settings.generic
      ? t('popupGeneric')
      : t('popupUnsupported');
  $('host').textContent = page.host;
  $input('siteEnabled').disabled = false;
  $input('siteEnabled').checked = !off;
  $('note').textContent = off ? t('popupOffHere') : '';
}

function save(patch: Partial<Settings>): void {
  settings = { ...settings, ...patch };
  browser.storage.sync.set(patch);
  render();
}

async function refreshCount(tabId: number): Promise<void> {
  try {
    const msg: GetMessage = { type: 'nsp-get' };
    page = (await browser.tabs.sendMessage(tabId, msg)) as PageInfo | null;
  } catch {
    page = null; // chrome://, Web Store, or a tab opened before the installation
  }
  render();
}

// Fixed texts of index.html, marked with data-i18n (text) and data-i18n-aria-label.
function translate(root: ParentNode): void {
  document.documentElement.lang = uiLang();
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset['i18n'] as MessageKey);
  });
  root.querySelectorAll<HTMLElement>('[data-i18n-aria-label]').forEach((el) => {
    el.setAttribute('aria-label', t(el.dataset['i18nAriaLabel'] as MessageKey));
  });
}

async function init(): Promise<void> {
  translate(document);
  settings = { ...DEFAULTS, ...((await browser.storage.sync.get(DEFAULTS)) as Partial<Settings>) };
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  render();
  const tabId = tab?.id;
  if (tabId) {
    await refreshCount(tabId);
    // the count changes when switching to/from generic detection
    browser.storage.onChanged.addListener(() => setTimeout(() => refreshCount(tabId), 400));
  }

  document.querySelectorAll<HTMLButtonElement>('.segmented button').forEach((b) => {
    b.addEventListener('click', () => save({ mode: b.dataset['mode'] as Mode }));
  });

  $input('generic').addEventListener('change', (e) => save({ generic: (e.target as HTMLInputElement).checked }));

  $input('siteEnabled').addEventListener('change', (e) => {
    if (!page) return;
    const set = new Set(settings.disabledHosts);
    if ((e.target as HTMLInputElement).checked) set.delete(page.host);
    else set.add(page.host);
    save({ disabledHosts: [...set] });
  });

  $('report').addEventListener('click', (e) => {
    e.preventDefault();
    const version = browser.runtime.getManifest().version;
    browser.tabs.create({ url: buildReportUrl(settings, page, version, t) });
    window.close();
  });
}

init();

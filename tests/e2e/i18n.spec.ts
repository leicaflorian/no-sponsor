import { expect, test, type BrowserContext, type Page, type Worker } from '@playwright/test';
import { launch, openFixture, popupUrl, setSettings, type Lang } from './harness';

// Texts in the browser's language arrived in 1.0.8: nothing to compare with 0.1.0.
test.skip(process.env['NSP_EXT'] === 'legacy', 'Italian/English UI is newer than 0.1.0');

const TEXTS = {
  it: {
    collapsed: 'Contenuto sponsorizzato · clicca per mostrare',
    adBefore: 'Annuncio · mancano',
    modes: ['Evidenzia', 'Comprimi', 'Nascondi'],
    noScan: 'Nessuna analisi',
    report: 'Segnala un problema',
  },
  en: {
    collapsed: 'Sponsored content · click to show',
    adBefore: 'Ad ·',
    modes: ['Highlight', 'Collapse', 'Hide'],
    noScan: 'Not scanned',
    report: 'Report a problem',
  },
};

let context: BrowserContext;
let sw: Worker;

test.afterEach(async () => {
  await context.close();
});

const afterContent = (page: Page, selector: string) =>
  page.evaluate((sel) => getComputedStyle(document.querySelector(sel) as Element, '::after').content, selector);

const openPopup = async () => {
  const popup = await context.newPage();
  await popup.goto(popupUrl(sw));
  await expect(popup.locator('#countLabel')).not.toBeEmpty();
  return popup;
};

for (const lang of ['it', 'en'] as const) {
  const texts = TEXTS[lang];

  test(`collapsed bar in ${lang}`, async () => {
    ({ context, sw } = await launch(lang));
    const page = await openFixture(context, 'ebay', 'ricerca');
    await setSettings(sw, { mode: 'collapse' });
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset['nspMode'])).toBe('collapse');
    expect(await afterContent(page, '.nsp-hit')).toBe(`"${texts.collapsed}"`);
  });

  test(`YouTube ad veil in ${lang}`, async () => {
    ({ context, sw } = await launch(lang));
    const page = await openFixture(context, 'youtube', 'annuncio');
    await page.waitForFunction(() => (document.querySelector('video') as HTMLVideoElement).readyState >= 1);
    await page.evaluate(() => document.querySelector('#movie_player')?.classList.add('ad-showing'));
    await expect.poll(() => afterContent(page, '#movie_player')).toContain(texts.adBefore);
    const label = await afterContent(page, '#movie_player');
    expect(label).toMatch(lang === 'en' ? /^"Ad · \d+:\d\d left"$/ : /^"Annuncio · mancano \d+:\d\d "$/);
  });

  test(`popup in ${lang}`, async () => {
    ({ context, sw } = await launch(lang));
    const popup = await openPopup();
    expect(await popup.evaluate(() => document.documentElement.lang)).toBe(lang);
    await expect(popup.locator('.segmented button')).toHaveText(texts.modes);
    await expect(popup.locator('#countLabel')).toHaveText(texts.noScan);
    await expect(popup.locator('#report')).toHaveText(texts.report);
  });
}

test('other languages fall back to English', async () => {
  ({ context, sw } = await launch('de' satisfies Lang));
  const popup = await openPopup();
  expect(await popup.evaluate(() => document.documentElement.lang)).toBe('en');
  await expect(popup.locator('.segmented button')).toHaveText(TEXTS.en.modes);
});

// Saves a real page as a cleaned-up fixture (no scripts, no images, CSS inlined in the page).
// Usage: npm run snapshot -- <site> <page> <url> [--manual] [--headed]
// NSP_CHANNEL=chrome uses the installed Chrome instead of Playwright's Chromium.
import { chromium } from '@playwright/test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
// Standard ad slots: iframes inside these containers are kept (empty) in the fixture.
import { AD_SELECTORS } from '../src/rules/detectors';

// Elements where Amazon writes the delivery location (derived from the IP): the text and
// the aria-label are replaced with a fixed value, so the recorder's location is not saved.
const LOCATION_SELECTORS = [
  '#glow-ingress-line1',
  '#glow-ingress-line2',
  '#contextualIngressPtLabel_deliveryShortLine',
  '#contextualIngressPtLink',
];
const NEUTRAL_LOCATION = 'Consegna a Roma 00100';

const CONSENT_TEXTS = ['Accetta tutto', 'Accetta', 'Accetto', 'Accept all', 'Rifiuta tutto'];

const args = process.argv.slice(2);
const manual = args.includes('--manual');
const headed = args.includes('--headed');
const [site, name, url] = args.filter((a) => !a.startsWith('--'));
if (!site || !name || !url) {
  console.error('Usage: npm run snapshot -- <site> <page> <url> [--manual] [--headed]');
  process.exit(1);
}

const profile = mkdtempSync(join(tmpdir(), 'nsp-snapshot-'));
const context = await chromium.launchPersistentContext(profile, {
  headless: !(manual || headed),
  viewport: { width: 1280, height: 900 },
  locale: 'it-IT',
  ...(process.env['NSP_CHANNEL'] ? { channel: process.env['NSP_CHANNEL'] } : {}),
});
try {
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForLoadState('load', { timeout: 30_000 }).catch(() => {});

  if (manual) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    await rl.question('Solve the captcha/consent in the window, then press Enter... ');
    rl.close();
  } else {
    for (const text of CONSENT_TEXTS) {
      const btn = page
        .getByRole('button', { name: text, exact: true })
        .or(page.locator(`button:has-text("${text}")`))
        .first();
      if (await btn.isVisible({ timeout: 1500 }).catch(() => false)) {
        await btn.click({ timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(1000);
        break;
      }
    }
  }

  // Scrolls to the bottom to load lazy content, then back to the top.
  for (let i = 0; i < 20; i++) {
    const done = await page.evaluate(() => {
      window.scrollBy(0, 800);
      return window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
    });
    await page.waitForTimeout(300);
    if (done) break;
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);

  // External stylesheets: downloaded on the Node side (cross-origin ones cannot be read from the CSSOM).
  const hrefs = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel~="stylesheet"]')).map((l) => l.href),
  );
  const sheets: Record<string, string> = {};
  for (const href of new Set(hrefs)) {
    try {
      const res = await page.request.get(href);
      if (res.ok()) sheets[href] = await res.text();
    } catch {
      /* stylesheet not downloadable: the link is removed anyway */
    }
  }

  const finalUrl = page.url();
  const html = await page.evaluate(
    ({ adSelectors, sheets, locationSelectors, neutralLocation }) => {
      const adSlot = adSelectors.join(',');
      // Delivery location: does nothing on pages without these elements.
      document.querySelectorAll(locationSelectors.join(',')).forEach((el) => {
        if (el.hasAttribute('aria-label')) el.setAttribute('aria-label', neutralLocation);
        if (el.children.length === 0) el.textContent = neutralLocation;
      });
      // Google's footer shows the postcode derived from the IP ("35018 - Dal tuo indirizzo IP").
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!/^\s*\d{5}\s*$/.test(n.nodeValue ?? '')) continue;
        const around = n.parentElement?.parentElement?.textContent ?? '';
        if (/indirizzo IP|IP address/i.test(around)) n.nodeValue = '00100';
      }
      document.querySelectorAll('script, noscript, base').forEach((e) => e.remove());
      document.querySelectorAll('iframe').forEach((f) => {
        if (f.closest(adSlot)) {
          f.removeAttribute('src');
          f.removeAttribute('srcdoc');
        } else f.remove();
      });
      document.querySelectorAll('*').forEach((el) => {
        for (const a of Array.from(el.attributes)) if (/^on/i.test(a.name)) el.removeAttribute(a.name);
      });
      document.querySelectorAll('img, source, video, picture').forEach((el) => {
        for (const a of ['src', 'srcset', 'data-src', 'data-srcset', 'poster']) el.removeAttribute(a);
        if (el instanceof HTMLImageElement) el.setAttribute('src', '');
      });
      document.querySelectorAll<HTMLLinkElement>('link[rel~="stylesheet"]').forEach((l) => {
        const css = sheets[l.href];
        if (css !== undefined) {
          const style = document.createElement('style');
          if (l.media) style.media = l.media;
          style.textContent = css;
          l.replaceWith(style);
        } else l.remove();
      });
      // The encoding may come only from the HTTP header: write it into the page.
      document.querySelectorAll('meta[charset], meta[http-equiv="Content-Type" i]').forEach((m) => m.remove());
      const charset = document.createElement('meta');
      charset.setAttribute('charset', 'utf-8');
      document.head.prepend(charset);
      return '<!doctype html>\n' + document.documentElement.outerHTML;
    },
    { adSelectors: AD_SELECTORS, sheets, locationSelectors: LOCATION_SELECTORS, neutralLocation: NEUTRAL_LOCATION },
  );

  const dir = join('tests', 'fixtures', site);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${name}.html`), html);
  writeFileSync(
    join(dir, `${name}.meta.json`),
    JSON.stringify({ url: finalUrl, savedAt: new Date().toISOString(), snapshotVersion: 1 }, null, 2) + '\n',
  );
  console.log(`Saved ${site}/${name}: ${(html.length / 1024).toFixed(0)} KB, final url ${finalUrl}`);
  // Local results (e.g. Google's local pack) follow the recorder's location and are not
  // scrubbed automatically: list what looks like an address so it can be neutralized by hand.
  const addresses = [...new Set((html.match(/\b\d{5}[ +][A-Z][\w'.]+/g) ?? []).map((a) => a.replace('+', ' ')))];
  if (addresses.length) console.warn(`Check these possible addresses before committing: ${addresses.join(', ')}`);
} finally {
  await context.close();
  rmSync(profile, { recursive: true, force: true });
}

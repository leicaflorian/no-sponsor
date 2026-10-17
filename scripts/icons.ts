// Renders scripts/icon.svg into the PNG icons in public/icon/.
// Usage: npm run icons
// The toolbar sizes fill the whole square; the 128 px icon keeps the artwork in 96 px with
// 16 px of transparent padding, as the Chrome Web Store asks.
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';

const SIZES: { size: number; padding: number }[] = [
  { size: 16, padding: 0 },
  { size: 32, padding: 0 },
  { size: 48, padding: 0 },
  { size: 128, padding: 16 },
];

const svg = readFileSync('scripts/icon.svg', 'utf8');
const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  for (const { size, padding } of SIZES) {
    const art = size - 2 * padding;
    await page.setContent(
      `<div id="icon" style="width:${size}px;height:${size}px;padding:${padding}px;box-sizing:border-box">` +
        `<img src="${src}" width="${art}" height="${art}" style="display:block"></div>`,
    );
    await page.locator('#icon img').evaluate((img: HTMLImageElement) => img.decode());
    writeFileSync(`public/icon/${size}.png`, await page.locator('#icon').screenshot({ omitBackground: true }));
    console.log(`public/icon/${size}.png`);
  }
} finally {
  await browser.close();
}

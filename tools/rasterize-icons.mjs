// Renders public/icons/icon.svg into Android launcher PNGs (android/res/mipmap-*/ic_launcher.png).
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node22/lib/node_modules/playwright'); }
const svg = readFileSync(new URL('../public/icons/icon.svg', import.meta.url), 'utf8');
const sizes = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const browser = await playwright.chromium.launch();
for (const [density, px] of Object.entries(sizes)) {
  const page = await browser.newPage({ viewport: { width: px, height: px } });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${px}" height="${px}" `)}</body></html>`);
  const dir = new URL(`../android/res/mipmap-${density}/`, import.meta.url);
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: new URL('ic_launcher.png', dir).pathname, omitBackground: true });
  await page.close();
}
await browser.close();
console.log('icons ok');

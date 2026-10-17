// Renders public/icons/icon.svg into Android launcher PNGs (android/res/mipmap-*/ic_launcher.png) and the PWA icons:
// 192/512 «any» (Android install), a separate 512 «maskable» with the glyph in the 80 % safe zone, 180 opaque for iOS.
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
// PWA icons (public/icons, copied to dist/ by tools/build.mjs).
const GRADIENT = 'linear-gradient(135deg, #1d2d66, #3a1f5f)';
const web = [
  { file: 'icon-192.png', px: 192, scale: 1, bg: 'transparent' },
  { file: 'icon-512.png', px: 512, scale: 1, bg: 'transparent' },
  { file: 'icon-maskable-512.png', px: 512, scale: 0.8, bg: GRADIENT },   // safe zone: a circle of 80 % diameter
  { file: 'icon-180.png', px: 180, scale: 0.86, bg: GRADIENT },           // iOS home screen: opaque, iOS rounds it
];
for (const { file, px, scale, bg } of web) {
  const page = await browser.newPage({ viewport: { width: px, height: px } });
  const inner = Math.round(px * scale), pad = Math.round((px - inner) / 2);
  await page.setContent(`<html><body style="margin:0;width:${px}px;height:${px}px;background:${bg}"><div style="padding:${pad}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div></body></html>`);
  await page.screenshot({ path: new URL(`../public/icons/${file}`, import.meta.url).pathname, omitBackground: bg === 'transparent' });
  await page.close();
}
await browser.close();
console.log('icons ok');

import { chromium } from 'playwright';
import path from 'path';
import { mkdir } from 'fs/promises';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'screenshots-ui-readability', 'post-fix');
const LS = { theme: 'light', disruptionFirstRunDone: '1', disrupturePersona: 'kantor', locationPromptSkipped: '1' };

async function setup(page, theme = 'light') {
  await page.addInitScript((l) => {
    for (const [k, v] of Object.entries(l)) localStorage.setItem(k, v);
  }, { ...LS, theme });
}

async function load(page) {
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
}

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true });

const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await setup(page, 'light');
await load(page);
await page.locator('header').screenshot({ path: path.join(OUT, 'desktop-1440-light-header.png') });
await page.getByRole('button', { name: 'Map display' }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(OUT, 'desktop-1440-light-layer-panel.png') });
await page.locator('header button[title="More"]').click();
await page.waitForTimeout(300);
await page.getByRole('button', { name: 'About' }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: path.join(OUT, 'desktop-1440-light-about-modal.png') });
await ctx.close();

const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
const p2 = await ctx2.newPage();
await setup(p2, 'light');
await load(p2);
await p2.getByRole('button', { name: 'ALERTS' }).click();
await p2.waitForTimeout(800);
await p2.screenshot({ path: path.join(OUT, 'phone-390-light-alerts.png') });
await ctx2.close();

await browser.close();
console.log('post-fix screenshots saved to', OUT);

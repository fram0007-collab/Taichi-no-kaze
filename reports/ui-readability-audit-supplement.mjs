/** Supplemental captures for audit gaps */
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'screenshots-ui-readability');
const BASE = 'http://localhost:5173';
const LS = { theme: 'light', disruptionFirstRunDone: '1', disrupturePersona: 'kantor', locationPromptSkipped: '1' };

async function setup(page, theme = 'light') {
  await page.addInitScript((l) => { for (const [k,v] of Object.entries(l)) localStorage.setItem(k,v); }, { ...LS, theme });
}

async function load(page) {
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2500);
}

async function closeOverlays(page) {
  await page.locator('.fixed.inset-0').click({ position: { x: 5, y: 5 }, force: true }).catch(() => {});
  await page.waitForTimeout(400);
}

async function run() {
  const browser = await chromium.launch({ headless: true });

  // Desktop dark theme baseline
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await setup(page, 'dark');
    await load(page);
    await page.evaluate(() => {
      localStorage.setItem('theme', 'dark');
      document.documentElement.classList.add('dark-mode');
      document.documentElement.classList.remove('light-mode');
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(OUT, 'desktop-1440-dark-home.png') });
    await page.locator('header').screenshot({ path: path.join(OUT, 'desktop-1440-dark-header.png') });
    const layers = page.getByRole('button', { name: 'Map display' });
    await layers.click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, 'desktop-1440-dark-layer-panel.png') });
    const cb = page.locator('.glass-panel input[type="checkbox"]').first();
    if (await cb.count()) { await cb.click(); await page.waitForTimeout(300); }
    await page.screenshot({ path: path.join(OUT, 'desktop-1440-dark-layer-panel-inactive.png') });
    await ctx.close();
  }

  // Desktop light: notifications, dashboard, bottom sheet
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await setup(page, 'light');
    await load(page);
    await page.locator('header button[title="Notification preferences"]').click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUT, 'desktop-1440-light-notifications-modal.png') });
    await closeOverlays(page);
    await page.locator('header button[title="More"]').click();
    await page.getByRole('button', { name: 'Overview' }).click();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(OUT, 'desktop-1440-light-dashboard-overlay.png') });
    await closeOverlays(page);
    const md = page.getByRole('button', { name: 'More details' }).first();
    if (await md.isVisible({ timeout: 3000 }).catch(() => false)) {
      await md.click();
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(OUT, 'desktop-1440-light-bottom-sheet.png') });
    }
    await page.locator('header button[title="More"]').click();
    await page.getByRole('button', { name: 'About' }).click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, 'desktop-1440-dark-about-modal.png').replace('dark', 'light') });
    await ctx.close();
  }

  // Desktop dark about modal
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await setup(page, 'dark');
    await load(page);
    await page.evaluate(() => { localStorage.setItem('theme','dark'); document.documentElement.classList.add('dark-mode'); document.documentElement.classList.remove('light-mode'); });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.locator('header button[title="More"]').click();
    await page.getByRole('button', { name: 'About' }).click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, 'desktop-1440-dark-about-modal.png') });
    await ctx.close();
  }

  // Evacuation + bottom sheet on mobile
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
    const page = await ctx.newPage();
    await setup(page, 'light');
    await load(page);
    await page.getByRole('button', { name: 'ALERTS' }).click();
    await page.waitForTimeout(800);
    const sr = page.getByRole('button', { name: /Safe route/i }).first();
    if (await sr.isVisible({ timeout: 3000 }).catch(() => false)) {
      await sr.click();
      await page.waitForTimeout(1200);
      await page.getByRole('button', { name: 'Map', exact: true }).click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: path.join(OUT, 'phone-390-light-evacuation-panel.png') });
      const md = page.getByRole('button', { name: 'More details' }).first();
      if (await md.isVisible({ timeout: 2000 }).catch(() => false)) {
        await md.click();
        await page.waitForTimeout(800);
        await page.screenshot({ path: path.join(OUT, 'phone-390-light-evacuation-under-bottom-sheet.png') });
      }
    }
    await ctx.close();
  }

  await browser.close();
  console.log('Supplemental captures done.');
}

run();

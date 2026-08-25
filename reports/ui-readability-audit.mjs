/**
 * One-off UI readability audit screenshot runner.
 * Usage: node reports/ui-readability-audit.mjs
 */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'screenshots-ui-readability');
const BASE = 'http://localhost:5173';
const JAKARTA = { latitude: -6.2088, longitude: 106.8456 };

const RETURNING_LS = {
  theme: 'light',
  disruptionFirstRunDone: '1',
  disrupturePersona: 'kantor',
  locationPromptSkipped: '1',
};

async function shot(page, name) {
  const file = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

async function setupReturning(page, theme = 'light') {
  await page.addInitScript((ls) => {
    for (const [k, v] of Object.entries(ls)) localStorage.setItem(k, v);
  }, { ...RETURNING_LS, theme });
}

async function waitForApp(page) {
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('header', { timeout: 30000 });
  await page.waitForTimeout(2500);
}

async function setTheme(page, theme) {
  await page.evaluate((t) => {
    localStorage.setItem('theme', t);
    const root = document.documentElement;
    if (t === 'light') {
      root.classList.add('light-mode');
      root.classList.remove('dark-mode');
    } else {
      root.classList.add('dark-mode');
      root.classList.remove('light-mode');
    }
  }, theme);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
}

async function desktopLightDark(browser) {
  for (const theme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await setupReturning(page, theme);
    await waitForApp(page);
    if (theme === 'dark') await setTheme(page, 'dark');

    await shot(page, `desktop-1440-${theme}-home`);
    // Header crop for BUG-01
    const header = page.locator('header');
    if (await header.count()) {
      await header.screenshot({ path: path.join(OUT_DIR, `desktop-1440-${theme}-header.png`) });
    }

    // Sidebar visible on desktop
    await shot(page, `desktop-1440-${theme}-map-sidebar`);

    // Layer panel
    const layersBtn = page.getByRole('button', { name: 'Map display' });
    if (await layersBtn.isVisible()) {
      await layersBtn.click();
      await page.waitForTimeout(500);
      await shot(page, `desktop-1440-${theme}-layer-panel`);
      // Toggle off a layer for inactive label check
      const checkboxes = page.locator('.glass-panel input[type="checkbox"]');
      if (await checkboxes.count() > 0) {
        await checkboxes.first().click();
        await page.waitForTimeout(300);
        await shot(page, `desktop-1440-${theme}-layer-panel-inactive`);
      }
    }

    // More menu -> About
    const moreBtn = page.locator('header button[title="More"]');
    if (await moreBtn.isVisible()) {
      await moreBtn.click();
      await page.waitForTimeout(300);
      await page.getByRole('button', { name: 'About' }).click();
      await page.waitForTimeout(500);
      await shot(page, `desktop-1440-${theme}-about-modal`);
      await page.locator('.fixed.inset-0.z-\\[9999\\]').click({ position: { x: 8, y: 8 }, force: true });
      await page.waitForTimeout(500);
    }

    // Emergency help
    await page.locator('header button[title="Call emergency services"]').click();
    await page.waitForTimeout(500);
    await shot(page, `desktop-1440-${theme}-emergency-modal`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);

    // Notifications
    const alertsBtn = page.locator('header button[title="Notification preferences"]');
    if (await alertsBtn.isVisible()) {
      await alertsBtn.click();
      await page.waitForTimeout(500);
      await shot(page, `desktop-1440-${theme}-notifications-modal`);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
    }

    // Dashboard overlay
    await moreBtn.click();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'Overview' }).click();
    await page.waitForTimeout(1500);
    await shot(page, `desktop-1440-${theme}-dashboard-overlay`);
    await page.locator('[data-tour="dashboard-trigger"]').isVisible().catch(() => false);
    const dashClose = page.locator('button').filter({ has: page.locator('svg.lucide-x, svg') }).first();
    await dashClose.click({ timeout: 3000 }).catch(() => page.keyboard.press('Escape'));
    await page.waitForTimeout(500);

    // Select first alert in sidebar if present
    const moreDetails = page.getByRole('button', { name: /More details/i }).first();
    if (await moreDetails.isVisible({ timeout: 3000 }).catch(() => false)) {
      await moreDetails.click();
      await page.waitForTimeout(800);
      await shot(page, `desktop-1440-${theme}-bottom-sheet`);
    }

    await ctx.close();
  }
}

async function mobileLightDark(browser) {
  for (const theme of ['light', 'dark']) {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
    });
    const page = await ctx.newPage();
    await setupReturning(page, theme);
    await waitForApp(page);
    if (theme === 'dark') await setTheme(page, 'dark');

    await shot(page, `phone-390-${theme}-map`);
    await page.locator('header').screenshot({ path: path.join(OUT_DIR, `phone-390-${theme}-header.png`) });

    // Alerts tab
    await page.getByRole('button', { name: 'ALERTS' }).click();
    await page.waitForTimeout(800);
    await shot(page, `phone-390-${theme}-alerts`);

    // Settings tab
    await page.getByRole('button', { name: 'SETTINGS' }).click();
    await page.waitForTimeout(500);
    await shot(page, `phone-390-${theme}-settings`);

    // Go tab
    await page.getByRole('button', { name: 'GO' }).click();
    await page.waitForTimeout(500);
    await shot(page, `phone-390-${theme}-navigate`);

    await ctx.close();
  }
}

async function geolocationBanner(browser) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    geolocation: JAKARTA,
    permissions: ['geolocation'],
  });
  const page = await ctx.newPage();
  await setupReturning(page, 'light');
  await waitForApp(page);
  // Allow location if prompt shows
  const allowBtn = page.getByRole('button', { name: /allow|use my location|enable/i });
  if (await allowBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await allowBtn.click();
    await page.waitForTimeout(2000);
  }
  await page.waitForTimeout(3000);
  await shot(page, 'desktop-1440-light-near-me-map');
  // Crop bottom-left for all-clear banner
  const mapArea = page.locator('.leaflet-container');
  if (await mapArea.count()) {
    const box = await mapArea.boundingBox();
    if (box) {
      await page.screenshot({
        path: path.join(OUT_DIR, 'desktop-1440-light-all-clear-banner.png'),
        clip: { x: box.x, y: box.y + box.height - 200, width: 400, height: 200 },
      });
    }
  }
  await ctx.close();
}

async function firstRunTour(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    localStorage.clear();
  });
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(4000);
  await shot(page, 'desktop-1440-light-first-run-tour');
  await ctx.close();

  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const page2 = await ctx2.newPage();
  await page2.addInitScript(() => localStorage.clear());
  await page2.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
  await page2.waitForTimeout(4000);
  await shot(page2, 'phone-390-light-first-run-tour');
  await ctx2.close();
}

async function personaPicker(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    localStorage.setItem('disruptionFirstRunDone', '1');
    localStorage.removeItem('disrupturePersona');
    localStorage.setItem('theme', 'light');
  });
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(4000);
  await shot(page, 'desktop-1440-light-persona-picker');
  await ctx.close();
}

async function adminPage(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2000);
  await shot(page, 'desktop-1440-dark-admin-login');
  await ctx.close();
}

async function tourReplay(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await setupReturning(page, 'light');
  await waitForApp(page);
  await page.locator('header button[title="More"]').click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Guide' }).click();
  await page.waitForTimeout(800);
  await shot(page, 'desktop-1440-light-tour-replay');
  await ctx.close();
}

async function evacuationStacking(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const page = await ctx.newPage();
  await setupReturning(page, 'light');
  await waitForApp(page);
  // Open alerts and trigger safe route / evacuation
  await page.getByRole('button', { name: 'ALERTS' }).click();
  await page.waitForTimeout(800);
  const safeRoute = page.getByRole('button', { name: /Safe route/i }).first();
  if (await safeRoute.isVisible({ timeout: 3000 }).catch(() => false)) {
    await safeRoute.click();
    await page.waitForTimeout(1000);
    await page.getByRole('button', { name: 'MAP' }).click();
    await page.waitForTimeout(1500);
    await shot(page, 'phone-390-light-evacuation-panel');
    // Open zone detail via More details on map if bottom sheet not open
    const moreDetails = page.getByRole('button', { name: /More details/i }).first();
    if (await moreDetails.isVisible({ timeout: 2000 }).catch(() => false)) {
      await moreDetails.click();
      await page.waitForTimeout(800);
      await shot(page, 'phone-390-light-evacuation-under-bottom-sheet');
    }
  }
  await ctx.close();
}

async function mobileHelpModal(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const page = await ctx.newPage();
  await setupReturning(page, 'light');
  await waitForApp(page);
  await page.locator('header button[title="Call emergency services"]').click();
  await page.waitForTimeout(500);
  await shot(page, 'phone-390-light-emergency-modal');
  await ctx.close();
}

async function tabletViewport(browser) {
  const ctx = await browser.newContext({ viewport: { width: 768, height: 1024 } });
  const page = await ctx.newPage();
  await setupReturning(page, 'light');
  await waitForApp(page);
  await shot(page, 'tablet-768-light-home');
  await ctx.close();
}

async function focusVisibility(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await setupReturning(page, 'light');
  await waitForApp(page);
  // Tab through header controls
  for (let i = 0; i < 6; i++) await page.keyboard.press('Tab');
  await page.waitForTimeout(300);
  await shot(page, 'desktop-1440-light-keyboard-focus');
  await ctx.close();
}

async function measureContrast() {
  // WCAG contrast helper
  function luminance(r, g, b) {
    const [rs, gs, bs] = [r, g, b].map((c) => {
      c /= 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  }
  function contrast(hex1, hex2) {
    const parse = (h) => {
      const n = h.replace('#', '');
      return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
    };
    const l1 = luminance(...parse(hex1));
    const l2 = luminance(...parse(hex2));
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  }
  return {
    bug01: { pair: 'slate-100 on white', ratio: contrast('#F1F5F9', '#FFFFFF'), note: 'Header gradient start' },
    bug02: { pair: 'white on glass white', ratio: contrast('#FFFFFF', '#FFFFFF'), note: 'text-white on light glass-panel' },
    bug03: { pair: 'slate-300 on brand-elevated', ratio: contrast('#CBD5E1', '#151D30'), note: 'About modal dark tokens' },
    bug03_light: { pair: 'slate-300 on light override', ratio: contrast('#CBD5E1', '#F1F5F9'), note: 'If light override applies' },
    bug04: { pair: 'slate-600 on glass dark', ratio: contrast('#475569', '#151D30'), note: 'Inactive layer label' },
    bug07: { pair: 'yellow-500 on yellow-5%', ratio: contrast('#EAB308', '#FFFBEB'), note: 'Medium alert badge approx' },
    bug09: { pair: 'slate-500 on slate-800', ratio: contrast('#64748B', '#1E293B'), note: 'Crowd meter muted' },
  };
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });

  const tasks = [
    ['desktopLightDark', desktopLightDark],
    ['mobileLightDark', mobileLightDark],
    ['geolocationBanner', geolocationBanner],
    ['firstRunTour', firstRunTour],
    ['personaPicker', personaPicker],
    ['adminPage', adminPage],
    ['tourReplay', tourReplay],
    ['evacuationStacking', evacuationStacking],
    ['mobileHelpModal', mobileHelpModal],
    ['tabletViewport', tabletViewport],
    ['focusVisibility', focusVisibility],
  ];

  const log = [];
  for (const [name, fn] of tasks) {
    try {
      console.log(`Running ${name}...`);
      await fn(browser);
      log.push({ task: name, status: 'ok' });
    } catch (e) {
      console.error(`${name} failed:`, e.message);
      log.push({ task: name, status: 'fail', error: e.message });
    }
  }

  const contrasts = await measureContrast();
  await writeFile(
    path.join(OUT_DIR, 'audit-meta.json'),
    JSON.stringify({ log, contrasts, capturedAt: new Date().toISOString() }, null, 2)
  );

  await browser.close();
  console.log('Audit capture complete.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

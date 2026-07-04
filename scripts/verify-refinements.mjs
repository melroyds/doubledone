// One-off verification for the tester-refinement features, against the running dev
// server (8081): routine edit with tick survival + the nudge UI, and "Done on…".
// Deliberately throwaway-style but kept in scripts/ for the next manual QA pass.
import { existsSync } from 'node:fs';

import { chromium } from 'playwright-core';

const BASE = 'http://localhost:8081';
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);

const DAY = 86400000;
const now = Date.now();
const results = [];
const ok = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? '  ✓' : '  ✗ FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

async function newSeededPage(browser, seed) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-AU' });
  await ctx.addInitScript((s) => {
    for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v);
  }, {
    'doubledone.onboarded.v1': 'yes',
    'doubledone.settings.v1': JSON.stringify({ theme: 'light', textSize: 'default', motion: 'reduce' }),
    ...seed,
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => ok('page error', false, String(e).slice(0, 120)));
  return { ctx, page };
}

async function longPress(page, locator) {
  const box = await locator.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(750);
  await page.mouse.up();
}

async function verifyDoneOn(browser) {
  console.log('· Done on…');
  const tasks = [
    { id: 'v1', title: 'Water the plants', done: false, createdAt: now - 3 * DAY, updatedAt: now - 3 * DAY },
    { id: 'v2', title: 'Take the bins out', done: false, createdAt: now - DAY, updatedAt: now - DAY },
  ];
  const { ctx, page } = await newSeededPage(browser, { 'doubledone.tasks.v1': JSON.stringify(tasks) });
  await page.goto(`${BASE}/today`, { waitUntil: 'domcontentloaded' });
  await page.getByText('Water the plants').first().waitFor({ timeout: 60000 });

  await longPress(page, page.getByText('Water the plants').first());
  const doneOn = page.getByText('Done on…', { exact: true }).first();
  const entered = await doneOn.isVisible().catch(() => false);
  ok('long-press opens select bar with Done on…', entered);
  if (!entered) return ctx.close();

  await doneOn.click();
  await page.getByText('Which day did you do it?').waitFor({ timeout: 5000 });
  ok('picker modal opens with the title', true);

  // click yesterday via its computed a11y label (the DatePicker labels cells with toLocaleDateString)
  const clicked = await page.evaluate(() => {
    const y = new Date();
    y.setDate(y.getDate() - 1);
    const want = y.getDate();
    // day cells are buttons whose visible text is the bare day number inside the picker card
    const nodes = [...document.querySelectorAll('[role="button"]')];
    const cell = nodes.find((n) => n.textContent?.trim() === String(want) && !n.getAttribute('aria-disabled'));
    if (!cell) return false;
    cell.click();
    return true;
  });
  ok('picked yesterday in the picker', clicked);
  await page.waitForTimeout(600);

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('doubledone.tasks.v1') || '[]'));
  const t1 = stored.find((x) => x.id === 'v1');
  const yNoon = (() => { const d = new Date(); d.setDate(d.getDate() - 1); d.setHours(12, 0, 0, 0); return d.getTime(); })();
  ok('task completed', Boolean(t1?.done));
  ok('completedAt = yesterday local noon', t1?.completedAt === yNoon, `got ${t1?.completedAt}, want ${yNoon}`);
  const affirmShown = await page.getByText(/Recorded for/).first().isVisible().catch(() => false);
  ok('quiet affirm shows ("Recorded for …")', affirmShown);
  const gone = !(await page.locator('text="Water the plants"').first().isVisible().catch(() => false));
  ok('task left the open list', gone);
  await ctx.close();
}

async function verifyRoutines(browser) {
  console.log('· Routine edit + nudge');
  const { ctx, page } = await newSeededPage(browser, {});
  await page.goto(`${BASE}/routines`, { waitUntil: 'domcontentloaded' });
  await page.getByText('Routines').first().waitFor({ timeout: 60000 });

  // create: open the form, fill name + steps, save
  await page.getByText('New routine', { exact: false }).first().click().catch(async () => {
    await page.getByText(/new/i).first().click();
  });
  const inputs = page.locator('input, textarea');
  await inputs.first().fill('Evening wind-down');
  await page.locator('textarea').last().fill('Lay out clothes\nPack the bag\nBrush teeth');
  await page.getByText('A gentle nudge').first().waitFor({ timeout: 5000 });
  ok('nudge block renders in the form', true);
  await page.getByRole('button', { name: /^Add routine$|^Add$/ }).last().click().catch(async () => {
    await page.getByText(/^Add/).last().click();
  });
  await page.getByText('Lay out clothes').first().waitFor({ timeout: 5000 });
  ok('routine created with 3 steps', true);

  // tick a step, then edit: add a 4th step
  await page.getByText('Pack the bag').first().click();
  await page.waitForTimeout(300);
  await page.getByText('Edit', { exact: true }).first().click();
  const stepsBox = page.locator('textarea').last();
  const current = await stepsBox.inputValue();
  ok('edit prefills the steps', current.includes('Pack the bag'), current.slice(0, 50));
  await stepsBox.fill(`${current}\nDim the lights`);
  await page.getByText('Save changes', { exact: true }).first().click();
  await page.getByText('Dim the lights').first().waitFor({ timeout: 5000 });
  ok('edited routine shows the new step', true);

  const routines = await page.evaluate(() => JSON.parse(localStorage.getItem('doubledone.routines.v1') || '[]'));
  const r = routines[0];
  const packStep = r?.steps.find((s) => s.title === 'Pack the bag');
  const todayIso = new Date().toISOString().slice(0, 10);
  const doneToday = r?.done?.[todayIso] ?? r?.done ?? {};
  const stillTicked = packStep && JSON.stringify(doneToday).includes(packStep.id);
  ok('ticked step SURVIVED the edit (id preserved)', Boolean(stillTicked), `steps=${r?.steps.length}`);
  ok('4 steps after edit', r?.steps.length === 4);
  await ctx.close();
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
try {
  await verifyDoneOn(browser);
  await verifyRoutines(browser);
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.pass);
console.log(failed.length ? `\n${failed.length} FAILURES` : '\nall checks passed');
process.exit(failed.length ? 1 : 0);

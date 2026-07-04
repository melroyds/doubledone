// One-off verification of PROPOSE -> EDIT -> ACCEPT in the Break-it-down review.
// Makes exactly ONE live /decompose call (the deployed Worker), then edits a step,
// removes a step, accepts, and asserts the edited title landed in storage.
import { existsSync } from 'node:fs';

import { chromium } from 'playwright-core';

const BASE = 'http://localhost:8081';
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
const results = [];
const ok = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? '  ✓' : '  ✗ FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-AU' });
  await ctx.addInitScript(() => {
    localStorage.setItem('doubledone.onboarded.v1', 'yes');
    localStorage.setItem('doubledone.settings.v1', JSON.stringify({ theme: 'light', textSize: 'default', motion: 'reduce' }));
    localStorage.setItem('doubledone.holdhint.v1', 'seen');
    localStorage.setItem(
      'doubledone.tasks.v1',
      JSON.stringify([{ id: 'e1', title: 'Plan a small birthday dinner', done: false, createdAt: Date.now() - 86400000, updatedAt: Date.now() }]),
    );
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/today`, { waitUntil: 'domcontentloaded' });
  await page.getByText('Plan a small birthday dinner').first().waitFor({ timeout: 60000 });

  // long-press into select mode, then Break down
  const row = page.getByText('Plan a small birthday dinner').first();
  const box = await row.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(750);
  await page.mouse.up();
  await page.getByText('Break down', { exact: true }).first().click();

  // the questions step (no AI cost): pick presets, submit
  await page.getByText('A few quick questions').waitFor({ timeout: 10000 });
  ok('questions modal opens', true);
  await page.getByText('Today', { exact: true }).last().click().catch(() => {});
  await page.getByText('Same day', { exact: true }).first().click().catch(() => {});
  // the modal's primary submit ('Break it down', the actions.breakItDown label)
  await page.getByText('Break it down', { exact: true }).last().click();

  // ONE live AI call happens here
  await page.getByText("Here's the plan").waitFor({ timeout: 90000 });
  ok('plan arrives (one live AI call)', true);
  await page.waitForTimeout(400);

  const stepTitles = await page.evaluate(() =>
    [...document.querySelectorAll('[aria-label^="Edit step:"]')].map((n) => n.getAttribute('aria-label').replace('Edit step: ', '')),
  );
  ok(`review lists ${stepTitles.length} editable steps`, stepTitles.length >= 2, stepTitles.join(' | ').slice(0, 100));
  if (stepTitles.length < 2) throw new Error('need at least 2 steps to verify');

  // EDIT the first step's title
  await page.locator('[aria-label^="Edit step:"]').first().click();
  const input = page.locator('input[aria-label="Step text"], textarea[aria-label="Step text"]').first();
  await input.waitFor({ timeout: 5000 });
  ok('tap swaps the title for an input', true);
  await input.fill('Call the venue and book a table');
  await input.press('Enter');
  await page.waitForTimeout(300);

  // REMOVE the second ORIGINAL step, targeted by its own aria-label (no index math)
  const removedTitle = stepTitles[1];
  await page.locator(`[aria-label="Remove step: ${removedTitle}"]`).first().click();
  const survivorsAfter = await page.evaluate(() =>
    [...document.querySelectorAll('[aria-label^="Edit step:"]')].map((n) => n.getAttribute('aria-label').replace('Edit step: ', '')),
  );
  ok('a step was removed (row count dropped)', survivorsAfter.length === stepTitles.length - 1, `now ${survivorsAfter.length}`);

  // ACCEPT with the edited titles
  const addBtn = page.getByText(/^Add \d+ task/).first();
  const addLabel = await addBtn.textContent();
  await addBtn.click();
  await page.waitForTimeout(800);

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('doubledone.tasks.v1') || '[]'));
  const titles = stored.map((t) => t.title);
  const editedLanded = titles.some((t) => t.includes('Call the venue and book a table'));
  ok('the EDITED title landed in storage', editedLanded, titles.filter((t) => t.includes('venue')).join(' | '));
  const removedGone = !titles.some((t) => t.includes(removedTitle) && !t.includes('Call the venue'));
  ok('a removed step did not mint a task', removedGone, `removed: "${removedTitle.slice(0, 40)}" | add said: ${addLabel}`);
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.pass);
console.log(failed.length ? `\n${failed.length} FAILURES` : '\nall checks passed');
process.exit(failed.length ? 1 : 0);

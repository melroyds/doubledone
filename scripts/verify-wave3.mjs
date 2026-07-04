// One-off verification of the wave-3 refinements against the dev server (8081):
// skip-today for recurring, the drawer's edit/remove+undo, routine save hints +
// minute-level nudge entry, the inverted Done on…, and the un-losable AI review
// (one live /decompose call). Kept in scripts/ for the next manual QA pass.
import { existsSync } from 'node:fs';

import { chromium } from 'playwright-core';

const BASE = 'http://localhost:8081';
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
const DAY = 86400000;
const now = Date.now();
const results = [];
const ok = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? '  ✓' : '  ✗ FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

async function seeded(browser, tasks, extra = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-AU' });
  await ctx.addInitScript((s) => {
    for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v);
  }, {
    'doubledone.onboarded.v1': 'yes',
    'doubledone.holdhint.v1': 'seen',
    'doubledone.settings.v1': JSON.stringify({ theme: 'light', textSize: 'default', motion: 'reduce' }),
    'doubledone.tasks.v1': JSON.stringify(tasks),
    ...extra,
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => ok('page error', false, String(e).slice(0, 100)));
  return { ctx, page };
}

async function longPress(page, locator) {
  const box = await locator.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(750);
  await page.mouse.up();
}

const tasksIn = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('doubledone.tasks.v1') || '[]'));
const todayIso = new Date(now - (new Date(now).getTimezoneOffset() * 0)).toISOString().slice(0, 10);

async function verifySkipToday(browser) {
  console.log('· Skip-today for recurring');
  const iso = (d) => new Date(now - d * DAY).toISOString().slice(0, 10);
  const tasks = [
    { id: 'r1', title: 'Water the cat bowl', done: false, recurrence: { kind: 'daily', start: iso(5) }, createdAt: now - 5 * DAY, updatedAt: now - DAY },
    { id: 'o1', title: 'Post the letter', done: false, createdAt: now - DAY, updatedAt: now - DAY },
  ];
  const { ctx, page } = await seeded(browser, tasks);
  await page.goto(`${BASE}/today`, { waitUntil: 'domcontentloaded' });
  await page.getByText('Water the cat bowl').first().waitFor({ timeout: 60000 });

  await longPress(page, page.getByText('Water the cat bowl').first());
  await page.getByText('Remove', { exact: true }).first().click();
  await page.waitForTimeout(500);
  ok('skip affirm shows', await page.getByText(/Skipped just for today/).first().isVisible().catch(() => false));
  let stored = await tasksIn(page);
  const r1 = stored.find((t) => t.id === 'r1');
  ok('series NOT tombstoned', !r1.deletedAt);
  ok('today added to skippedDates', Array.isArray(r1.skippedDates) && r1.skippedDates.length === 1);
  // The title legitimately remains in the Repeating DRAWER (it manages the series). Before the
  // skip the title renders twice (Today row + drawer); after, exactly once (drawer only).
  const titleCount = await page.evaluate(() => {
    let n = 0;
    const walk = (node) => {
      if (node.nodeType === 3 && node.textContent.includes('Water the cat bowl')) n++;
      for (const c of node.childNodes) walk(c);
    };
    walk(document.body);
    return n;
  });
  ok('recurring row gone from Today (drawer copy only)', titleCount === 1, `title appears ${titleCount}x`);

  await longPress(page, page.getByText('Post the letter').first());
  await page.getByText('Remove', { exact: true }).first().click();
  await page.waitForTimeout(500);
  stored = await tasksIn(page);
  ok('one-off still tombstones', Boolean(stored.find((t) => t.id === 'o1').deletedAt));
  await ctx.close();
}

async function verifyDrawer(browser) {
  console.log('· Repeating drawer: edit + remove/undo');
  const iso5 = new Date(now - 5 * DAY).toISOString().slice(0, 10);
  const tasks = [{ id: 'r2', title: 'Take the vitamins', done: false, recurrence: { kind: 'daily', start: iso5 }, createdAt: now - 5 * DAY, updatedAt: now - DAY }];
  const { ctx, page } = await seeded(browser, tasks);
  await page.goto(`${BASE}/today`, { waitUntil: 'domcontentloaded' });
  await page.getByText('Take the vitamins').first().waitFor({ timeout: 60000 });
  // The drawer's rows are in the page; if its Edit is not yet visible, open the drawer via a
  // direct DOM click ('Repeating' label) - Playwright's hit-test trips on the RN-web sheet
  // overlay that real pointers route through fine (the known preview-tooling gotcha).
  if (!(await page.getByText('Edit', { exact: true }).first().isVisible().catch(() => false))) {
    await page.evaluate(() => {
      const el = [...document.querySelectorAll('div')].find((n) => n.textContent === 'Repeating' && n.children.length === 0);
      el?.click();
    });
    await page.waitForTimeout(600);
  }
  await page.getByText('Edit', { exact: true }).first().click().catch(async () => {
    await page.evaluate(() => {
      const el = [...document.querySelectorAll('div')].find((n) => n.textContent === 'Edit' && n.children.length === 0);
      el?.click();
    });
  });
  await page.getByText('Edit repeating task').waitFor({ timeout: 5000 });
  ok('edit sheet opens', true);
  const title = page.locator('input').first();
  await title.fill('Take the vitamins with food');
  await page.getByText('Save changes', { exact: true }).first().click();
  await page.waitForTimeout(500);
  let stored = await tasksIn(page);
  ok('series title edited', stored[0].title === 'Take the vitamins with food', stored[0].title);

  // The drawer sits under the Today scroll in Playwright's hit-test (the known RN-web z-order
  // quirk; real pointers route fine) - drive its Remove and Undo by direct DOM click.
  const domClickLastLeaf = (text) =>
    page.evaluate((want) => {
      const leaves = [...document.querySelectorAll('div')].filter((n) => n.textContent === want && n.children.length === 0);
      leaves.at(-1)?.click();
      return leaves.length;
    }, text);
  await domClickLastLeaf('Remove');
  await page.waitForTimeout(400);
  ok('undo bar shows', await page.getByText('Repeating task removed.').first().isVisible().catch(() => false));
  stored = await tasksIn(page);
  ok('series tombstoned from drawer', Boolean(stored[0].deletedAt));
  await domClickLastLeaf('Undo');
  await page.waitForTimeout(400);
  stored = await tasksIn(page);
  ok('undo restores the series', !stored[0].deletedAt);
  await ctx.close();
}

async function verifyRoutineHints(browser) {
  console.log('· Routine save hints + minute entry');
  const { ctx, page } = await seeded(browser, []);
  await page.goto(`${BASE}/routines`, { waitUntil: 'domcontentloaded' });
  await page.getByText('Routines').first().waitFor({ timeout: 60000 });
  await page.getByText(/New routine|New/).first().click();
  // save with nothing: the name hint must appear (the app answers every tap)
  await page.getByRole('button', { name: /^Add routine$|^Add$/ }).last().click().catch(async () => page.getByText(/^Add/).last().click());
  ok('empty-name hint shows', await page.getByText('Give it a name first, anything works.').first().isVisible().catch(() => false));
  await page.locator('input').first().fill('Evening');
  ok('hint clears on typing', !(await page.getByText('Give it a name first').first().isVisible().catch(() => false)));
  await page.getByRole('button', { name: /^Add routine$|^Add$/ }).last().click().catch(async () => page.getByText(/^Add/).last().click());
  ok('empty-steps hint shows', await page.getByText('Add at least one step, one line is plenty.').first().isVisible().catch(() => false));
  await page.locator('textarea').last().fill('Lay out clothes');
  // minute-level nudge: turn it on, open the entry, set 20:47
  const onPill = page.getByText('On', { exact: true }).first();
  if (await onPill.isVisible().catch(() => false)) await onPill.click();
  else await page.getByText(/8:00|9:00|20:00|around/).first().click().catch(() => {});
  await page.locator('[aria-label="Set the nudge time"]').first().click().catch(() => {});
  const hourIn = page.locator('[aria-label="Hour"]').first();
  if (await hourIn.isVisible().catch(() => false)) {
    await hourIn.fill('20');
    await page.locator('[aria-label="Minutes"]').first().fill('47');
    await page.locator('[aria-label="Minutes"]').first().blur().catch(() => {});
    await page.waitForTimeout(300);
    ok('live line reads "around 8:47 pm"', await page.getByText(/around 8:47/).first().isVisible().catch(() => false));
    ok('24h teaching hint visible', await page.getByText(/24-hour time/).first().isVisible().catch(() => false));
  } else {
    ok('minute entry reachable', false, 'time entry did not open');
  }
  await ctx.close();
}

async function verifyDoneOnInversion(browser) {
  console.log('· Done on… inversion');
  const tasks = [
    { id: 'd1', title: 'Send the invoice', done: false, createdAt: now - 3 * DAY, updatedAt: now - DAY },
    { id: 'd2', title: 'Book the dentist', done: false, createdAt: now - DAY, updatedAt: now - DAY },
  ];
  const { ctx, page } = await seeded(browser, tasks);
  await page.goto(`${BASE}/today`, { waitUntil: 'domcontentloaded' });
  await page.getByText('Send the invoice').first().waitFor({ timeout: 60000 });

  // an OPEN selected task must NOT offer Done on…
  await longPress(page, page.getByText('Book the dentist').first());
  ok('open task: no Done on…', !(await page.getByText('Done on…', { exact: true }).first().isVisible().catch(() => false)));
  await page.keyboard.press('Escape').catch(() => {});
  await page.getByText(/Close|Cancel/, { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(300);

  // complete, then hold: Done on… replaces the pointless Done
  await page.getByText('Send the invoice').first().click(); // tap done (today)
  await page.waitForTimeout(400);
  await longPress(page, page.getByText('Send the invoice').first());
  const doneOn = page.getByText('Done on…', { exact: true }).first();
  ok('completed task: Done on… offered', await doneOn.isVisible().catch(() => false));
  await doneOn.click();
  await page.getByText('Which day did you do it?').waitFor({ timeout: 5000 });
  await page.evaluate(() => {
    const y = new Date(); y.setDate(y.getDate() - 1);
    const cell = [...document.querySelectorAll('[role="button"]')].find((n) => n.textContent?.trim() === String(y.getDate()) && !n.getAttribute('aria-disabled'));
    cell?.click();
  });
  await page.waitForTimeout(500);
  const stored = await tasksIn(page);
  const d1 = stored.find((t) => t.id === 'd1');
  const yNoon = (() => { const d = new Date(); d.setDate(d.getDate() - 1); d.setHours(12, 0, 0, 0); return d.getTime(); })();
  ok('re-attributed to yesterday noon', d1.completedAt === yNoon, `got ${d1.completedAt}`);
  ok('warm affirm shows', await page.getByText(/Lookback tells it true/).first().isVisible().catch(() => false));
  await ctx.close();
}

async function verifyUnlosableReview(browser) {
  console.log('· Un-losable AI review (one live call)');
  const tasks = [{ id: 'b1', title: 'Organise the garage properly', done: false, createdAt: now - DAY, updatedAt: now - DAY }];
  const { ctx, page } = await seeded(browser, tasks);
  await page.goto(`${BASE}/today`, { waitUntil: 'domcontentloaded' });
  await page.getByText('Organise the garage properly').first().waitFor({ timeout: 60000 });
  await longPress(page, page.getByText('Organise the garage properly').first());
  await page.getByText('Break down', { exact: true }).first().click();
  await page.getByText('A few quick questions').waitFor({ timeout: 10000 });
  await page.getByText('Same day', { exact: true }).first().click().catch(() => {});
  await page.getByText('Break it down', { exact: true }).last().click();
  await page.getByText("Here's the plan").waitFor({ timeout: 90000 });
  ok('plan arrives', true);

  // the un-losable test: tap the backdrop (top-left corner, outside the card)
  await page.mouse.click(8, 60);
  await page.waitForTimeout(400);
  ok('backdrop tap does NOT destroy the plan', await page.getByText("Here's the plan").first().isVisible().catch(() => false));

  // edit a title, then tap blank card space: the edit must COMMIT, not vanish
  await page.locator('[aria-label^="Edit step:"]').first().click();
  const input = page.locator('input[aria-label="Step text"], textarea[aria-label="Step text"]').first();
  await input.waitFor({ timeout: 5000 });
  await input.fill('Sort one shelf only');
  await page.getByText("Here's the plan").first().click(); // blank-ish card tap
  await page.waitForTimeout(400);
  ok('stray tap commits the edit', await page.getByText('Sort one shelf only').first().isVisible().catch(() => false));

  // phases, if the AI returned them, are editable; otherwise structural note
  const phaseHeader = await page.getByText('Then, as you get there').first().isVisible().catch(() => false);
  if (phaseHeader) {
    const phaseEdits = await page.locator('[aria-label^="Edit step:"]').count();
    ok('later phases present and editable rows exist', phaseEdits > 0, `${phaseEdits} editable rows total`);
  } else {
    console.log('  · (single-phase plan returned; phase editing verified structurally by the agent, not E2E)');
  }

  // the explicit calm exit still works and the task is untouched
  await page.getByText('Not now', { exact: true }).first().click();
  await page.waitForTimeout(400);
  const stored = await tasksIn(page);
  ok('Not now exits; task unchanged', stored.length === 1 && !stored[0].done && !stored[0].deletedAt);
  await ctx.close();
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
try {
  await verifySkipToday(browser);
  await verifyDrawer(browser);
  await verifyRoutineHints(browser);
  await verifyDoneOnInversion(browser);
  await verifyUnlosableReview(browser);
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.pass);
console.log(failed.length ? `\n${failed.length} FAILURES` : '\nall checks passed');
process.exit(failed.length ? 1 : 0);

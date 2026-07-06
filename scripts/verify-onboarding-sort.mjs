// One-off verification: the onboarding's "Sort for me" lands EVERYTHING on Today
// (one live /triage call), with the teaching line and no Later leak.
import { existsSync } from 'node:fs';

import { chromium } from 'playwright-core';

const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
const results = [];
const ok = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? '  ✓' : '  ✗ FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

// The bait: one obviously-today line, one the AI will want to defer, one neutral.
const LINES = ["Reply to Sam's message", 'Plan the big holiday someday next year', 'Pay the rent'];

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-AU' });
  const page = await ctx.newPage();
  await page.goto('http://localhost:8081/welcome', { waitUntil: 'domcontentloaded' });
  await page.getByText('A calmer kind of to-do').first().waitFor({ timeout: 90000 });

  // walk the intro until the capture input appears (the primary label changes per step)
  for (let i = 0; i < 8; i++) {
    if (await page.locator('textarea').first().isVisible().catch(() => false)) break;
    const primary = page.getByRole('button').last();
    await primary.click().catch(() => {});
    await page.waitForTimeout(400);
  }
  const input = page.locator('textarea').first();
  ok('reached the capture step', await input.isVisible().catch(() => false));
  await input.fill(LINES.join('\n'));
  await page.getByText('Sort for me', { exact: true }).last().click();

  // one live /triage call
  await page.getByText("Here's today, sized to be doable.").waitFor({ timeout: 60000 });
  ok('reveal arrives (one live AI call)', true);

  const body = await page.evaluate(() => document.body.innerText);
  ok('count line says ALL 3 for today', body.includes('3 for today.'), body.match(/\d+ for today\./)?.[0] ?? 'no count line');
  for (const line of LINES) ok(`"${line.slice(0, 24)}…" visible on the reveal`, body.includes(line));
  ok('teaching line shows', body.includes('Everything starts on today. Move anything to tomorrow, or later, whenever you like.'));
  ok('no Later leak', !body.includes('waiting calmly') && !/Later ·/.test(body));
  await ctx.close();
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.pass);
console.log(failed.length ? `\n${failed.length} FAILURES` : '\nall checks passed');
process.exit(failed.length ? 1 : 0);

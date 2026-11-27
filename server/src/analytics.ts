// The Analytics Centre (backlog #41): one token-gated, read-only, server-rendered page
// answering the owner's four questions from data D1 ALREADY holds — money (entitlements,
// trials), AI usage + spend vs the monthly cap (ai_calls), the moat's flywheel health
// (decompositions offered vs outcomes reported), and scrapbooks made. No client changes,
// no new storage, no third-party analytics: the privacy spine stays intact because this
// page only aggregates what the product already records.
//
// Auth is the same shared-secret posture as the RevenueCat webhook: an ANALYTICS_TOKEN
// Worker secret, accepted from the Authorization header OR a ?token= query param. The
// query param is deliberate: the owner bookmarks this on a phone, and a browser cannot
// set headers on a bookmark. It is a read-only page for one person; rotating the token
// is one `wrangler secret put` away. 503 when unconfigured, so an undeployed secret can
// never mean an open page.

import { ACTIVE_EVENTS } from './events';
import { modelCostUsd, projectMonthEnd } from './monitor';

type D1Like = {
  prepare(sql: string): {
    bind(...args: unknown[]): { all<T>(): Promise<{ results: T[] }>; first<T>(): Promise<T | null> };
    all<T>(): Promise<{ results: T[] }>;
    first<T>(): Promise<T | null>;
  };
};

export type AnalyticsEnv = {
  DB?: D1Like;
  ANALYTICS_TOKEN?: string;
  ANTHROPIC_MONTHLY_CAP_USD?: string;
  // The UTC day (YYYY-MM-DD) every platform was counting new installs: the later of the days the iOS and Android builds
  // carrying the count went live. The web counts from its merge, the phones only from their store builds, so until this
  // names that day the week-six estimate would read low and stays hidden. A plain var in wrangler.jsonc.
  ACTIVE_COUNT_FROM?: string;
};

export type PremiumRow = { store: string; status: string | null; cancelling: number; n: number };
export type DayRow = { day: string; calls: number; errors: number };
export type EndpointRow = { endpoint: string; n: number };
export type ModelTokens = { model: string; in_tok: number; out_tok: number };
export type AppEventRow = { event: string; n: number };

// Active devices (2026-11-27, the client's lib/active; the names live in events.ts). Four bare names, each sent once per
// device per its own period (very rarely twice, when an answer is lost and the device sends it again), so a day's
// day.opened is that day's distinct devices and a week's week.opened that week's. No id ties them.
const ACTIVE_SET: ReadonlySet<string> = new Set(ACTIVE_EVENTS);
const ACTIVE_IN = ACTIVE_EVENTS.map((e) => `'${e}'`).join(',');

export type ActiveCountRow = { day: string; event: string; n: number };
/** One day or one week of the counts: devices that opened the app, new installs, and sixth-week returns. */
export type ActiveLine = { key: string; opened: number; fresh: number; six: number };
export type ActiveSummary = {
  days: ActiveLine[]; // the last 14 UTC days, today first, a quiet day as zeros
  weeks: ActiveLine[]; // the last 8 UTC weeks by their Monday, this week first
  weekSix: { returns: number; cohort: number } | null; // null until the count has run long enough to estimate it
  // Why weekSix is null: 'from' while ACTIVE_COUNT_FROM is unset, 'history' while the counts are too young.
  weekSixWait: 'from' | 'history' | null;
};

export type AnalyticsData = {
  premium: PremiumRow[];
  trialsActive: number;
  days: DayRow[]; // last 28 days, newest first
  endpoints7d: EndpointRow[];
  spendMtdUsd: number;
  spendProjectedUsd: number;
  capUsd: number;
  decomposOffered: number; // all-time decompositions with a flywheel id
  decomposWithOutcome: number; // of those, how many reported >= 1 completed step
  stepsReported: number; // total outcome rows (each = a step completion event)
  medianDaysToFirstStep: number | null;
  scrapbooksAllTime: number;
  scrapbooks28d: number;
  settleOpens: number; // all-time entries to the breathing room (the app-event beacon)
  settleOpens28d: number;
  appEvents28d: AppEventRow[]; // every beaconed event, last 28 days (future events appear on their own)
  active: ActiveSummary | null; // null when the counts cannot be read
  generatedAt: string;
};

// --- pure aggregation helpers ----------------------------------------------

/** Month-to-date spend from per-model token sums (reuses the monitor's price table). */
export function mtdSpend(rows: ModelTokens[]): number {
  return rows.reduce((s, r) => s + modelCostUsd(r.model, r.in_tok || 0, r.out_tok || 0), 0);
}

/** The flywheel's one-line health: of the decompositions offered, how many came back
 *  with at least one finished step. Divide-by-zero reads as 0, never NaN. */
export function flywheelRate(offered: number, withOutcome: number): number {
  return offered > 0 ? withOutcome / offered : 0;
}

const DAY_MS = 86_400_000;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const dayMs = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** The Monday that starts the UTC week of a YYYY-MM-DD day. */
export function mondayOf(iso: string): string {
  const ms = dayMs(iso);
  return isoDay(ms - ((new Date(ms).getUTCDay() + 6) % 7) * DAY_MS);
}

/** The sixth week opens 35 days after a device's first open, so its returns are set against new devices 35 days back. */
export const WEEK_SIX_SHIFT_DAYS = 35;
/** ...and closes 41 days after it, so a return on a given day can come from a first open 35 to 41 days earlier. */
const WEEK_SIX_LAST_DAY = 41;
const WEEK_SIX_WINDOW_DAYS = 28;

/**
 * Fold the active-device counts into the page's days, weeks and week-six estimate. Pure. `today` is the UTC day the
 * page is drawn on, and `firstDay` the first day any of the four names arrived (null if none ever has).
 *
 * `allFrom` is ACTIVE_COUNT_FROM: the day every platform began counting new installs. A week's opened figure is
 * week.opened summed over its days (each device sends it once a week), NEVER the days
 * added up, which would count a device once for every day it opened. The week-six estimate cannot follow one cohort,
 * because no id joins a device.new to its later return, so it sets the sixth-week returns of the last 28 complete days
 * against the new devices of the 28 days that ended 35 days earlier, when the sixth week opens. That is close while the
 * number of new devices holds steady and leans while it grows or shrinks. It stays null until the counts reach back 69
 * days, to the earliest first open whose sixth week can land in the returns window: opened sooner, its first weeks
 * would miss the returns of devices that started just before the count, which never send one, and read low. The same
 * holds for each platform, and the phones start counting new installs weeks after the web, so the 69 days run from
 * the later of the first count and `allFrom`, and nothing is estimated while `allFrom` is unknown.
 */
export function summariseActive(rows: ActiveCountRow[], today: string, firstDay: string | null, allFrom: string | null = null): ActiveSummary {
  const byDay = new Map<string, { opened: number; week: number; fresh: number; six: number }>();
  for (const r of rows) {
    if (!ACTIVE_SET.has(r.event)) continue;
    const e = byDay.get(r.day) ?? { opened: 0, week: 0, fresh: 0, six: 0 };
    const n = Number(r.n) || 0;
    if (r.event === 'day.opened') e.opened += n;
    else if (r.event === 'week.opened') e.week += n;
    else if (r.event === 'device.new') e.fresh += n;
    else e.six += n;
    byDay.set(r.day, e);
  }
  const t = dayMs(today);
  const days: ActiveLine[] = Array.from({ length: 14 }, (_, i) => {
    const key = isoDay(t - i * DAY_MS);
    const e = byDay.get(key);
    return { key, opened: e?.opened ?? 0, fresh: e?.fresh ?? 0, six: e?.six ?? 0 };
  });
  const monday = dayMs(mondayOf(today));
  const weeks: ActiveLine[] = Array.from({ length: 8 }, (_, i) => {
    const start = monday - i * 7 * DAY_MS;
    const line: ActiveLine = { key: isoDay(start), opened: 0, fresh: 0, six: 0 };
    for (let k = 0; k < 7; k++) {
      const e = byDay.get(isoDay(start + k * DAY_MS));
      if (!e) continue;
      line.opened += e.week;
      line.fresh += e.fresh;
      line.six += e.six;
    }
    return line;
  });
  const returnsFrom = t - WEEK_SIX_WINDOW_DAYS * DAY_MS;
  const returnsTo = t - DAY_MS;
  const cohortFrom = returnsFrom - WEEK_SIX_SHIFT_DAYS * DAY_MS;
  const cohortTo = returnsTo - WEEK_SIX_SHIFT_DAYS * DAY_MS;
  let weekSix: ActiveSummary['weekSix'] = null;
  let weekSixWait: ActiveSummary['weekSixWait'] = null;
  const fromMs = allFrom !== null && ISO_DAY.test(allFrom) ? dayMs(allFrom) : NaN;
  if (!Number.isFinite(fromMs)) {
    weekSixWait = 'from';
  } else if (firstDay === null || Math.max(dayMs(firstDay), fromMs) > returnsFrom - WEEK_SIX_LAST_DAY * DAY_MS) {
    weekSixWait = 'history';
  } else {
    let returns = 0;
    let cohort = 0;
    for (const [day, e] of byDay) {
      const ms = dayMs(day);
      if (ms >= returnsFrom && ms <= returnsTo) returns += e.six;
      if (ms >= cohortFrom && ms <= cohortTo) cohort += e.fresh;
    }
    weekSix = { returns, cohort };
  }
  return { days, weeks, weekSix, weekSixWait };
}

/** The first UTC day the active-device rows must reach back to: the weeks table's oldest Monday or the start of the
 *  week-six estimate's cohort window, whichever is older. */
export function activeCutoff(today: string): string {
  const weeksFrom = dayMs(mondayOf(today)) - 7 * 7 * DAY_MS;
  const cohortFrom = dayMs(today) - (WEEK_SIX_WINDOW_DAYS + WEEK_SIX_SHIFT_DAYS) * DAY_MS;
  return isoDay(Math.min(weeksFrom, cohortFrom));
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const pct = (x: number) => `${Math.round(x * 100)}%`;
const usd = (x: number) => `$${x.toFixed(2)}`;

/** The Active devices section. Devices, not people, and the page says so. */
export function renderActive(a: ActiveSummary | null): string {
  if (!a) return '<h2>Active devices</h2>\n<div class="sub">The counts could not be read just now.</div>';
  const [today, yesterday] = a.days;
  const [thisWeek, lastWeek] = a.weeks;
  const row = (l: ActiveLine) =>
    `<tr><td>${esc(l.key)}</td><td class="num">${l.opened}</td><td class="num">${l.fresh}</td><td class="num">${l.six}</td></tr>`;
  const head = (first: string) =>
    `<tr><th>${first}</th><th class="num">opened</th><th class="num">new</th><th class="num">week six</th></tr>`;
  let six: string;
  if (!a.weekSix) {
    six =
      a.weekSixWait === 'from'
        ? 'Week six: waiting for ACTIVE_COUNT_FROM, the day the phones began counting new installs (when their first store builds with the count went live). The estimate starts about ten weeks after it.'
        : 'Week six: not enough history yet. The estimate needs about ten weeks of counts from every platform.';
  } else if (a.weekSix.cohort === 0) six = 'Week six: no new devices in the matching four weeks yet.';
  else {
    six = `Week six: about ${pct(a.weekSix.returns / a.weekSix.cohort)} (${a.weekSix.returns} of ${a.weekSix.cohort}). The last four weeks of sixth-week returns, set against the new devices of the four weeks that ended five weeks earlier. An estimate from counts: close while new devices hold steady, leaning while they grow or shrink.`;
  }
  return `<h2>Active devices</h2>
<div class="big">${yesterday.opened} yesterday</div>
<div class="sub">${today.opened} so far today · ${thisWeek.opened} this week so far · ${lastWeek.opened} last week</div>
<table>${head('week of')}${a.weeks.map(row).join('')}</table>
<div class="sub">${esc(six)}</div>
<table>${head('day')}${a.days.map(row).join('')}</table>
<div class="sub">Devices, not people: a phone and a laptop are two, and a phone restored from its own backup stays the same device. Days and weeks run on UTC, and a week counts each device once however many days it opened, bar the rare count sent twice when its answer was lost on the way back. A store's own test devices count as new and never return: each Android build sent to a testing track adds a few, and each App Review one. The web counts from 1.10.9, the phones from their first store build that carries the count.</div>`;
}

/** Render the whole page. Pure: data in, HTML out, so the shape is unit-testable.
 *  Dusk colours, no JavaScript, tables that read on a phone. */
export function renderAnalyticsHtml(d: AnalyticsData): string {
  const premiumTotal = d.premium.reduce((s, r) => s + r.n, 0);
  const premiumRows = d.premium
    .map(
      (r) =>
        `<tr><td>${esc(r.store)}</td><td>${esc(r.status ?? '-')}</td><td>${r.cancelling ? 'ending at period end' : 'renewing'}</td><td class="num">${r.n}</td></tr>`,
    )
    .join('');
  const dayRows = d.days
    .map((r) => `<tr><td>${esc(r.day)}</td><td class="num">${r.calls}</td><td class="num">${r.errors || 0}</td></tr>`)
    .join('');
  const epRows = d.endpoints7d.map((r) => `<tr><td>${esc(r.endpoint)}</td><td class="num">${r.n}</td></tr>`).join('');
  const overCap = d.spendProjectedUsd > d.capUsd;
  const otherEvents = d.appEvents28d.filter((r) => !ACTIVE_SET.has(r.event));
  return `<!doctype html><html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>DoubleDone · Analytics Centre</title>
<style>
  body { font-family: Georgia, serif; background: #FAF6F1; color: #2B2722; margin: 0; padding: 24px; max-width: 720px; margin-inline: auto; }
  h1 { font-weight: 500; font-size: 28px; margin: 0 0 4px; } h2 { font-size: 15px; letter-spacing: 1.4px; text-transform: uppercase; color: #946475; margin: 32px 0 8px; }
  .sub { color: #7A7066; font-size: 14px; margin-bottom: 8px; }
  table { border-collapse: collapse; width: 100%; font-size: 14px; background: #FFFFFF; border: 1px solid #ECE4D8; border-radius: 8px; }
  td, th { padding: 8px 12px; border-bottom: 1px solid #ECE4D8; text-align: left; } tr:last-child td { border-bottom: 0; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .big { font-size: 34px; font-weight: 500; } .warn { color: #A1554C; } .ok { color: #526546; }
  footer { color: #8A7F73; font-size: 12px; margin-top: 40px; }
</style></head><body>
<h1>Analytics Centre</h1>
<div class="sub">Generated ${esc(d.generatedAt)} · read-only · aggregates only, nothing here identifies a user beyond their entitlement row</div>

<h2>Money</h2>
<div class="big">${premiumTotal} premium</div>
<div class="sub">${d.trialsActive} active trial${d.trialsActive === 1 ? '' : 's'}</div>
<table><tr><th>store</th><th>status</th><th>renewal</th><th class="num">n</th></tr>${premiumRows || '<tr><td colspan="4">none yet</td></tr>'}</table>
${renderActive(d.active)}

<h2>AI spend</h2>
<div class="big ${overCap ? 'warn' : 'ok'}">${usd(d.spendMtdUsd)} this month</div>
<div class="sub">projected ${usd(d.spendProjectedUsd)} of the ${usd(d.capUsd)} cap${overCap ? ' — projection exceeds the cap' : ''}</div>
<table><tr><th>endpoint (7 days)</th><th class="num">calls</th></tr>${epRows || '<tr><td colspan="2">quiet week</td></tr>'}</table>

<h2>The moat</h2>
<div class="big">${pct(flywheelRate(d.decomposOffered, d.decomposWithOutcome))}</div>
<div class="sub">${d.decomposWithOutcome} of ${d.decomposOffered} decompositions ever offered came back with a finished step · ${d.stepsReported} step completions reported${d.medianDaysToFirstStep != null ? ` · median ${d.medianDaysToFirstStep} day${d.medianDaysToFirstStep === 1 ? '' : 's'} to the first one` : ''}</div>

<h2>Scrapbooks</h2>
<div class="big">${d.scrapbooksAllTime}</div>
<div class="sub">keepsakes ever made · ${d.scrapbooks28d} in the last 28 days</div>

<h2>The room</h2>
<div class="big">${d.settleOpens}</div>
<div class="sub">times Settle was entered · ${d.settleOpens28d} in the last 28 days · counts only, never durations</div>
${otherEvents.length ? `<table><tr><th>event (28 days)</th><th class="num">n</th></tr>${otherEvents.map((r) => `<tr><td>${esc(r.event)}</td><td class="num">${r.n}</td></tr>`).join('')}</table>` : ''}

<h2>AI calls by day (28 days)</h2>
<table><tr><th>day</th><th class="num">calls</th><th class="num">errors</th></tr>${dayRows || '<tr><td colspan="3">none yet</td></tr>'}</table>

<footer>DoubleDone Analytics Centre · token-gated · Stripe and RevenueCat dashboards remain the deep-dive for money; this page is the morning glance.</footer>
</body></html>`;
}

// --- the handler ------------------------------------------------------------

/** GET /admin/analytics?token=… — gather, render, never cache. */
export async function handleAnalytics(request: Request, env: AnalyticsEnv, nowMs: number): Promise<Response> {
  if (!env.ANALYTICS_TOKEN) return new Response('analytics not configured', { status: 503 });
  const url = new URL(request.url);
  const given = url.searchParams.get('token') ?? (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (given !== env.ANALYTICS_TOKEN) return new Response('unauthorized', { status: 401 });
  if (!env.DB) return new Response('no database bound', { status: 503 });

  const now = new Date(nowMs);
  const nowISO = now.toISOString();
  const monthStart = `${nowISO.slice(0, 7)}-01`;
  const cutoff28 = new Date(nowMs - 28 * 86_400_000).toISOString().slice(0, 10);
  const cutoff7 = new Date(nowMs - 7 * 86_400_000).toISOString().slice(0, 10);

  const premium = (
    await env.DB.prepare(
      "SELECT COALESCE(source,'stripe') AS store, status, cancel_at_period_end AS cancelling, COUNT(*) AS n FROM entitlements WHERE premium = 1 GROUP BY 1,2,3 ORDER BY 1,2",
    ).all<PremiumRow>()
  ).results;
  const trials = await env.DB.prepare('SELECT COUNT(*) AS n FROM trials WHERE expires_at > ?1')
    .bind(Math.floor(nowMs / 1000))
    .first<{ n: number }>();
  const days = (
    await env.DB.prepare(
      'SELECT substr(created_at,1,10) AS day, COUNT(*) AS calls, SUM(CASE ok WHEN 1 THEN 0 ELSE 1 END) AS errors FROM ai_calls WHERE created_at >= ?1 GROUP BY 1 ORDER BY 1 DESC',
    )
      .bind(cutoff28)
      .all<DayRow>()
  ).results;
  const endpoints7d = (
    await env.DB.prepare('SELECT endpoint, COUNT(*) AS n FROM ai_calls WHERE created_at >= ?1 GROUP BY 1 ORDER BY n DESC')
      .bind(cutoff7)
      .all<EndpointRow>()
  ).results;
  const tokens = (
    await env.DB.prepare(
      'SELECT model, SUM(COALESCE(input_tokens,0)) AS in_tok, SUM(COALESCE(output_tokens,0)) AS out_tok FROM ai_calls WHERE created_at >= ?1 GROUP BY 1',
    )
      .bind(monthStart)
      .all<ModelTokens>()
  ).results;
  // An offered decomposition IS a row that got a flywheel id, whatever its endpoint is
  // called this month: the flow renamed decompose -> plan and the endpoint-name filter
  // made the page read 0 offered against 17 returned, an impossible flywheel (the second
  // launch-day miscount, 2026-08-01). Counting by the id can never break on a rename.
  const offered = await env.DB.prepare('SELECT COUNT(*) AS n FROM ai_calls WHERE corr_id IS NOT NULL').first<{
    n: number;
  }>();
  const withOutcome = await env.DB.prepare(
    "SELECT COUNT(DISTINCT o.corr_id) AS n FROM outcomes o JOIN ai_calls a ON a.corr_id = o.corr_id",
  ).first<{ n: number }>();
  const steps = await env.DB.prepare('SELECT COUNT(*) AS n FROM outcomes').first<{ n: number }>();
  const median = await env.DB.prepare(
    'SELECT days_elapsed AS d FROM (SELECT MIN(days_elapsed) AS days_elapsed FROM outcomes GROUP BY corr_id) ORDER BY d LIMIT 1 OFFSET (SELECT (COUNT(DISTINCT corr_id) - 1) / 2 FROM outcomes)',
  ).first<{ d: number }>();
  // Count keepsakes from ai_calls, the table that has ALWAYS recorded a generation
  // (endpoint 'scrapbook', one row per keepsake). scrapbook_log is only the per-IP abuse
  // backstop and postdates the first weeks of scrapbooks, so counting it read as zero
  // for a user who had 14 (the 2026-08-01 launch-day bug).
  const scrapbooks = await env.DB.prepare(
    "SELECT COUNT(*) AS n, SUM(CASE WHEN created_at >= ?1 THEN 1 ELSE 0 END) AS recent FROM ai_calls WHERE endpoint = 'scrapbook' AND ok = 1",
  )
    .bind(cutoff28)
    .first<{ n: number; recent: number }>();

  // The app-event beacon (app_event_counts, one counter per day per name). Defensive: the table may not
  // exist yet on a Worker deployed before the schema was applied, and a missing count
  // must never 500 the whole page.
  let settle: { n: number; recent: number } | null = null;
  let appEvents28d: AppEventRow[] = [];
  try {
    settle = await env.DB.prepare(
      "SELECT COALESCE(SUM(n), 0) AS n, COALESCE(SUM(CASE WHEN day >= ?1 THEN n ELSE 0 END), 0) AS recent FROM app_event_counts WHERE event = 'settle.opened'",
    )
      .bind(cutoff28)
      .first<{ n: number; recent: number }>();
    appEvents28d = (
      await env.DB.prepare('SELECT event, SUM(n) AS n FROM app_event_counts WHERE day >= ?1 GROUP BY 1 ORDER BY n DESC')
        .bind(cutoff28)
        .all<AppEventRow>()
    ).results;
  } catch {
    // table not applied yet: render zeros rather than a broken page
  }
  // Active devices: their own read, so a failure here only blanks this section.
  let active: ActiveSummary | null = null;
  try {
    const today = nowISO.slice(0, 10);
    const rows = (
      await env.DB.prepare(
        `SELECT day, event, SUM(n) AS n FROM app_event_counts WHERE day >= ?1 AND event IN (${ACTIVE_IN}) GROUP BY day, event`,
      )
        .bind(activeCutoff(today))
        .all<ActiveCountRow>()
    ).results;
    const first = await env.DB.prepare(`SELECT MIN(day) AS first FROM app_event_counts WHERE event IN (${ACTIVE_IN})`).first<{
      first: string | null;
    }>();
    active = summariseActive(rows, today, first?.first ?? null, env.ACTIVE_COUNT_FROM ?? null);
  } catch {
    // leave the section saying it could not read the counts
  }

  const spendMtdUsd = mtdSpend(tokens);
  const capUsd = Number(env.ANTHROPIC_MONTHLY_CAP_USD ?? '25') || 25;
  const daysInMonth = new Date(now.getUTCFullYear(), now.getUTCMonth() + 1, 0).getUTCDate();

  const html = renderAnalyticsHtml({
    premium,
    trialsActive: trials?.n ?? 0,
    days,
    endpoints7d,
    spendMtdUsd,
    spendProjectedUsd: projectMonthEnd(spendMtdUsd, now.getUTCDate(), daysInMonth),
    capUsd,
    decomposOffered: offered?.n ?? 0,
    decomposWithOutcome: withOutcome?.n ?? 0,
    stepsReported: steps?.n ?? 0,
    medianDaysToFirstStep: median?.d ?? null,
    scrapbooksAllTime: scrapbooks?.n ?? 0,
    scrapbooks28d: scrapbooks?.recent ?? 0,
    settleOpens: settle?.n ?? 0,
    settleOpens28d: settle?.recent ?? 0,
    appEvents28d,
    active,
    generatedAt: nowISO.slice(0, 16).replace('T', ' ') + ' UTC',
  });
  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' },
  });
}

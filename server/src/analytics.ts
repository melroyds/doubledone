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
};

export type PremiumRow = { store: string; status: string | null; cancelling: number; n: number };
export type DayRow = { day: string; calls: number; errors: number };
export type EndpointRow = { endpoint: string; n: number };
export type ModelTokens = { model: string; in_tok: number; out_tok: number };

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
  scrapbooks28d: number;
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

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const pct = (x: number) => `${Math.round(x * 100)}%`;
const usd = (x: number) => `$${x.toFixed(2)}`;

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

<h2>AI spend</h2>
<div class="big ${overCap ? 'warn' : 'ok'}">${usd(d.spendMtdUsd)} this month</div>
<div class="sub">projected ${usd(d.spendProjectedUsd)} of the ${usd(d.capUsd)} cap${overCap ? ' — projection exceeds the cap' : ''}</div>
<table><tr><th>endpoint (7 days)</th><th class="num">calls</th></tr>${epRows || '<tr><td colspan="2">quiet week</td></tr>'}</table>

<h2>The moat</h2>
<div class="big">${pct(flywheelRate(d.decomposOffered, d.decomposWithOutcome))}</div>
<div class="sub">${d.decomposWithOutcome} of ${d.decomposOffered} decompositions ever offered came back with a finished step · ${d.stepsReported} step completions reported${d.medianDaysToFirstStep != null ? ` · median ${d.medianDaysToFirstStep} day${d.medianDaysToFirstStep === 1 ? '' : 's'} to the first one` : ''}</div>

<h2>Scrapbooks</h2>
<div class="big">${d.scrapbooks28d}</div>
<div class="sub">keepsakes made in the last 28 days</div>

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
  const offered = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM ai_calls WHERE endpoint = 'decompose' AND corr_id IS NOT NULL",
  ).first<{ n: number }>();
  const withOutcome = await env.DB.prepare(
    "SELECT COUNT(DISTINCT o.corr_id) AS n FROM outcomes o JOIN ai_calls a ON a.corr_id = o.corr_id",
  ).first<{ n: number }>();
  const steps = await env.DB.prepare('SELECT COUNT(*) AS n FROM outcomes').first<{ n: number }>();
  const median = await env.DB.prepare(
    'SELECT days_elapsed AS d FROM (SELECT MIN(days_elapsed) AS days_elapsed FROM outcomes GROUP BY corr_id) ORDER BY d LIMIT 1 OFFSET (SELECT (COUNT(DISTINCT corr_id) - 1) / 2 FROM outcomes)',
  ).first<{ d: number }>();
  const scrapbooks = await env.DB.prepare('SELECT COUNT(*) AS n FROM scrapbook_log WHERE created_at >= ?1')
    .bind(nowMs - 28 * 86_400_000)
    .first<{ n: number }>();

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
    scrapbooks28d: scrapbooks?.n ?? 0,
    generatedAt: nowISO.slice(0, 16).replace('T', ' ') + ' UTC',
  });
  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' },
  });
}

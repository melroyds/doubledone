// The launch control centre. An hourly health sweep that rides the existing cron and
// emails the owner ONLY when something needs a look, plus a once-a-day digest (the
// pulse, and a soft proof the cron + email path is alive), plus a dead-man's-switch
// ping to an external watcher so that silence provably means healthy rather than
// "the alarm itself died". It reuses the proven SEND_EMAIL + FEEDBACK_TO path (see
// /feedback in index.ts).
//
// Privacy by construction: every alarm carries counts, endpoints, error strings and
// dollar amounts ONLY. It never reads ai_calls.input/output (the task text the user
// typed), never a raw IP, never a user_id. The alert email is a new way data leaves
// the pseudonymous store, so it is kept deliberately information-poor.
//
// Posture mirrors telemetry.ts / push.ts: the pure pieces (pricing, the threshold
// logic, the email bodies, the dedup window) are exported and unit-tested; the sweep
// that touches D1 + email is best-effort and fails OPEN so it can never break the app
// or the daily nudge it shares the cron tick with.
import type { D1LikeDatabase } from './telemetry';

export type MonitorEnv = {
  DB?: D1LikeDatabase;
  SEND_EMAIL?: { send(message: unknown): Promise<unknown> };
  FEEDBACK_TO?: string;
  ANTHROPIC_MONTHLY_CAP_USD?: string; // the hard Anthropic cap in dollars; a non-secret var (default 25)
  HEARTBEAT_URL?: string; // the dead-man's-switch ping URL (Healthchecks.io etc.); a Worker secret, optional
};

// --- pricing (pure) --------------------------------------------------------

// USD per 1M tokens (input, output) by model family. Anthropic list prices: Haiku 4.5
// $1/$5, Sonnet 4.6 $3/$15, Opus 4.x $15/$75. Matched by substring so a model-id bump
// (claude-haiku-4-5 -> ...-4-6) keeps costing correctly without an edit here.
const PRICING: { match: string; in: number; out: number }[] = [
  { match: 'opus', in: 15, out: 75 },
  { match: 'sonnet', in: 3, out: 15 },
  { match: 'haiku', in: 1, out: 5 },
];

/** Dollar cost of one model's token usage. Unknown models cost 0 (conservative: better
 *  to under-count an unrecognised model than cry wolf, and the volume alarm still bites). */
export function modelCostUsd(model: string, inTok: number, outTok: number): number {
  const p = PRICING.find((x) => model.toLowerCase().includes(x.match));
  if (!p) return 0;
  return (inTok * p.in + outTok * p.out) / 1_000_000;
}

/** Total dollar spend across per-model token sums. */
export function spendUsd(rows: { model: string; in_tok: number; out_tok: number }[]): number {
  return rows.reduce((s, r) => s + modelCostUsd(r.model, r.in_tok || 0, r.out_tok || 0), 0);
}

/** Linear month-end projection from month-to-date spend. Catches a launch-day spike on
 *  day 2 before it burns the month, even while the absolute total is still low. */
export function projectMonthEnd(mtdUsd: number, dayOfMonth: number, daysInMonth: number): number {
  if (dayOfMonth <= 0) return mtdUsd;
  return (mtdUsd / dayOfMonth) * daysInMonth;
}

// --- thresholds (one place to tune after the first real traffic) -----------

export const THRESHOLDS = {
  spendBandFraction: 0.5, // first spend alarm at 50% of the cap (escalating detail in the message)
  errorAbsFloor: 5, // >= 5 errors in an hour AND ...
  errorRate: 0.3, // ... > 30% of the hour's calls failing (a low floor + a ratio, so 2 calls failing is not 100%)
  errorHard: 10, // OR >= 10 errors in an hour regardless of rate
  scrapbookDailyBudget: 30, // global images/day guard (the Workers AI free-tier neuron wall the dollar query cannot see)
  scrapbookAbusePerIp: 16, // 80% of the per-IP 20/24h backstop, so pressure is heard before the cap bites
  volumePerHour: 150, // AI calls in one hour, well above launch-normal
  dedupHours: 6, // suppress a repeat of the same alarm kind within this window (no crying wolf)
};

const DIGEST_HOUR_UTC = 20; // ~06:00 Melbourne (AEST): the daily pulse lands before the day starts

// --- alarm evaluation (pure) -----------------------------------------------

export type Metric = {
  capUsd: number;
  mtdUsd: number;
  projectedUsd: number;
  callsLastHour: number;
  errorsLastHour: number;
  errorByEndpoint: { endpoint: string; errors: number }[];
  recentErrors: string[]; // truncated error STRINGS (e.g. "upstream 529"); never user content
  topEndpointsLastHour: { endpoint: string; calls: number }[];
  scrapbookToday: number;
  scrapbookMaxPerIp: number;
};

export type Alarm = { kind: string; title: string; detail: string };

/** The launch-critical alarm set. Returns one Alarm per tripped concern (deduped + sent
 *  by the caller). Pure: given the metrics, the alarms are deterministic. */
export function evaluateAlarms(m: Metric): Alarm[] {
  const out: Alarm[] = [];

  const pct = m.capUsd > 0 ? Math.round((m.mtdUsd / m.capUsd) * 100) : 0;
  if (m.mtdUsd >= m.capUsd * THRESHOLDS.spendBandFraction || m.projectedUsd > m.capUsd) {
    out.push({
      kind: 'spend',
      title: `AI spend at ${pct}% of the $${m.capUsd.toFixed(0)} cap`,
      detail:
        `Month-to-date: $${m.mtdUsd.toFixed(2)} of $${m.capUsd.toFixed(2)} (${pct}%). ` +
        `Projected month-end at the current pace: $${m.projectedUsd.toFixed(2)}. ` +
        `The cap is a kill switch: hitting it makes every AI route fail.`,
    });
  }

  const rate = m.callsLastHour > 0 ? m.errorsLastHour / m.callsLastHour : 0;
  if (m.errorsLastHour >= THRESHOLDS.errorHard || (m.errorsLastHour >= THRESHOLDS.errorAbsFloor && rate > THRESHOLDS.errorRate)) {
    const byEp = m.errorByEndpoint.map((e) => `${e.endpoint} ${e.errors}`).join(', ') || '(unknown)';
    const sample = m.recentErrors.slice(0, 3).join(' | ') || '(no detail)';
    out.push({
      kind: 'error',
      title: `${m.errorsLastHour} AI error${m.errorsLastHour === 1 ? '' : 's'} in the last hour`,
      detail: `${m.errorsLastHour} of ${m.callsLastHour} calls failed (${Math.round(rate * 100)}%). By endpoint: ${byEp}. Recent: ${sample}.`,
    });
  }

  if (m.scrapbookToday >= THRESHOLDS.scrapbookDailyBudget) {
    out.push({
      kind: 'scrapbook-budget',
      title: `${m.scrapbookToday} scrapbook images today`,
      detail:
        `Global scrapbook generations today: ${m.scrapbookToday} (guard at ${THRESHOLDS.scrapbookDailyBudget}). ` +
        `Approaching the Workers AI free-tier daily budget; images may start failing or tip into paid neurons.`,
    });
  }

  if (m.scrapbookMaxPerIp >= THRESHOLDS.scrapbookAbusePerIp) {
    out.push({
      kind: 'scrapbook-abuse',
      title: 'One source near the scrapbook cap',
      detail: `A single client reached ${m.scrapbookMaxPerIp} scrapbook generations in 24h (per-IP cap is 20). Possible scripted abuse draining the shared budget.`,
    });
  }

  if (m.callsLastHour >= THRESHOLDS.volumePerHour) {
    const top = m.topEndpointsLastHour.map((e) => `${e.endpoint} ${e.calls}`).join(', ') || '(none)';
    out.push({
      kind: 'volume',
      title: `${m.callsLastHour} AI calls in the last hour`,
      detail: `Well above launch-normal. By endpoint: ${top}. Watch the spend alarm; a Sonnet-heavy spike costs far more than a Haiku one.`,
    });
  }

  return out;
}

// --- email bodies (pure) ---------------------------------------------------

/** The alert email body. Built only from Alarm objects, which carry safe fields by
 *  construction, so this can never contain task text, a raw IP, or a user id. */
export function buildAlertBody(alarms: Alarm[], nowISO: string): string {
  return [
    'DoubleDone control centre — something needs a look.',
    '',
    ...alarms.flatMap((a) => [`* ${a.title}`, `  ${a.detail}`, '']),
    `Checked ${nowISO} UTC. Run "npm run stats" for the full picture.`,
    'Information-poor by design: counts, endpoints and error strings only, never task text or IPs.',
  ].join('\n');
}

export type Digest = {
  capUsd: number;
  mtdUsd: number;
  callsToday: number;
  errorsToday: number;
  premiumNow: number;
  trialsActive: number;
  newPremiumToday: number;
  scrapbookToday: number;
  reminders: number;
  topEndpoints: { endpoint: string; calls: number }[];
};

/** The once-a-day pulse. Its arrival is itself the proof that the cron + email path lives. */
export function buildDigestBody(d: Digest, nowISO: string): string {
  const pct = d.capUsd > 0 ? Math.round((d.mtdUsd / d.capUsd) * 100) : 0;
  const top = d.topEndpoints.slice(0, 5).map((e) => `  ${e.endpoint}: ${e.calls}`).join('\n') || '  (none yet)';
  return [
    `DoubleDone daily pulse — ${nowISO.slice(0, 10)}`,
    '',
    `AI calls today: ${d.callsToday}  (errors: ${d.errorsToday})`,
    `AI spend month-to-date: $${d.mtdUsd.toFixed(2)} of $${d.capUsd.toFixed(2)} (${pct}%)`,
    `Premium now: ${d.premiumNow}   Trials active: ${d.trialsActive}   New premium today: ${d.newPremiumToday}`,
    `Scrapbooks today: ${d.scrapbookToday}   Reminder subscriptions: ${d.reminders}`,
    '',
    'Most-used today:',
    top,
    '',
    'All alarms armed. This pulse arriving means the alarm path is alive.',
  ].join('\n');
}

// --- RFC 5322 builder (pure; mirrors feedback.ts) --------------------------

function base64Utf8(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/(.{76})/g, '$1\r\n');
}

export interface OwnerEmailParts {
  from: string;
  to: string;
  subject: string;
  body: string;
  uuid: string;
  date: string;
}

/** A complete text/plain message for the send_email binding. uuid + date are passed in
 *  (not read from globals) so this stays pure and unit-testable, like buildFeedbackEmail. */
export function buildOwnerEmail(p: OwnerEmailParts): string {
  return [
    `From: DoubleDone control centre <${p.from}>`,
    `To: ${p.to}`,
    `Subject: ${p.subject}`,
    `Message-ID: <${p.uuid}@doubledone.app>`,
    `Date: ${p.date}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="utf-8"',
    'Content-Transfer-Encoding: base64',
    '',
    base64Utf8(p.body),
  ].join('\r\n');
}

/** Suppress a repeat of the same alarm kind within the dedup window. Pure. */
export function suppressed(lastMs: number | null, nowMs: number, windowHours: number): boolean {
  if (lastMs == null) return false;
  return nowMs - lastMs < windowHours * 3_600_000;
}

// --- the sweep (impure, best-effort, fails OPEN) ---------------------------

const FROM = 'feedback@doubledone.app'; // the proven send_email sender (verified path), reused so alerts deliver

async function sendOwnerEmail(env: MonitorEnv, subject: string, body: string): Promise<void> {
  if (!env.SEND_EMAIL || !env.FEEDBACK_TO) return;
  const raw = buildOwnerEmail({ from: FROM, to: env.FEEDBACK_TO, subject, body, uuid: crypto.randomUUID(), date: new Date().toUTCString() });
  const { EmailMessage } = (await import('cloudflare:email')) as { EmailMessage: new (from: string, to: string, raw: string) => unknown };
  await env.SEND_EMAIL.send(new EmailMessage(FROM, env.FEEDBACK_TO, raw));
}

/** Most-recent send time for an alarm kind, or null. Fails OPEN (null) so a dedup-store
 *  error never suppresses a real alarm. */
async function lastAlert(db: D1LikeDatabase, kind: string): Promise<number | null> {
  try {
    const row = await db.prepare('SELECT MAX(created_at) AS last FROM alerts_sent WHERE kind = ?1').bind(kind).first<{ last: number | null }>();
    return typeof row?.last === 'number' ? row.last : null;
  } catch {
    return null;
  }
}

async function recordAlert(db: D1LikeDatabase, kind: string, nowMs: number): Promise<void> {
  try {
    await db.prepare('INSERT INTO alerts_sent (kind, created_at) VALUES (?1, ?2)').bind(kind, nowMs).run();
  } catch {
    // best effort: a missed dedup record only risks one extra alert next tick
  }
}

async function gatherMetrics(db: D1LikeDatabase, capUsd: number, now: Date): Promise<Metric> {
  const spendRows = (
    await db
      .prepare(
        "SELECT model, COALESCE(SUM(input_tokens),0) AS in_tok, COALESCE(SUM(output_tokens),0) AS out_tok " +
          "FROM ai_calls WHERE created_at >= date('now','start of month') GROUP BY model",
      )
      .all<{ model: string; in_tok: number; out_tok: number }>()
  ).results;
  const mtdUsd = spendUsd(spendRows);
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const projectedUsd = projectMonthEnd(mtdUsd, now.getUTCDate(), daysInMonth);

  const hour = await db
    .prepare("SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN ok=0 THEN 1 ELSE 0 END),0) AS errors FROM ai_calls WHERE created_at >= datetime('now','-1 hour')")
    .first<{ total: number; errors: number }>();

  const errByEp = (
    await db
      .prepare("SELECT endpoint, COUNT(*) AS errors FROM ai_calls WHERE ok=0 AND created_at >= datetime('now','-1 hour') GROUP BY endpoint ORDER BY errors DESC")
      .all<{ endpoint: string; errors: number }>()
  ).results;
  const recent = (
    await db
      .prepare("SELECT substr(COALESCE(error,''),1,80) AS error FROM ai_calls WHERE ok=0 AND created_at >= datetime('now','-1 hour') ORDER BY created_at DESC LIMIT 3")
      .all<{ error: string }>()
  ).results;
  const topEp = (
    await db
      .prepare("SELECT endpoint, COUNT(*) AS calls FROM ai_calls WHERE created_at >= datetime('now','-1 hour') GROUP BY endpoint ORDER BY calls DESC LIMIT 5")
      .all<{ endpoint: string; calls: number }>()
  ).results;

  const startOfDayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const sbToday = await db.prepare('SELECT COUNT(*) AS imgs FROM scrapbook_log WHERE created_at >= ?1').bind(startOfDayMs).first<{ imgs: number }>();
  const sbMax = await db
    .prepare('SELECT COALESCE(MAX(n),0) AS mx FROM (SELECT COUNT(*) AS n FROM scrapbook_log WHERE created_at >= ?1 GROUP BY ip)')
    .bind(now.getTime() - 86_400_000)
    .first<{ mx: number }>();

  return {
    capUsd,
    mtdUsd,
    projectedUsd,
    callsLastHour: Number(hour?.total ?? 0),
    errorsLastHour: Number(hour?.errors ?? 0),
    errorByEndpoint: errByEp.map((r) => ({ endpoint: String(r.endpoint), errors: Number(r.errors) })),
    recentErrors: recent.map((r) => String(r.error)).filter(Boolean),
    topEndpointsLastHour: topEp.map((r) => ({ endpoint: String(r.endpoint), calls: Number(r.calls) })),
    scrapbookToday: Number(sbToday?.imgs ?? 0),
    scrapbookMaxPerIp: Number(sbMax?.mx ?? 0),
  };
}

async function gatherDigest(db: D1LikeDatabase, capUsd: number, now: Date): Promise<Digest> {
  const spendRows = (
    await db
      .prepare(
        "SELECT model, COALESCE(SUM(input_tokens),0) AS in_tok, COALESCE(SUM(output_tokens),0) AS out_tok " +
          "FROM ai_calls WHERE created_at >= date('now','start of month') GROUP BY model",
      )
      .all<{ model: string; in_tok: number; out_tok: number }>()
  ).results;
  const today = await db
    .prepare("SELECT COUNT(*) AS calls, COALESCE(SUM(CASE WHEN ok=0 THEN 1 ELSE 0 END),0) AS errors FROM ai_calls WHERE created_at >= date('now')")
    .first<{ calls: number; errors: number }>();
  const premium = await db.prepare('SELECT COALESCE(SUM(premium),0) AS n FROM entitlements').first<{ n: number }>();
  const trials = await db.prepare("SELECT COUNT(*) AS n FROM trials WHERE expires_at > strftime('%s','now')").first<{ n: number }>();
  const newPrem = await db.prepare("SELECT COUNT(*) AS n FROM entitlements WHERE premium=1 AND date(started_at) = date('now')").first<{ n: number }>();
  const startOfDayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const sb = await db.prepare('SELECT COUNT(*) AS n FROM scrapbook_log WHERE created_at >= ?1').bind(startOfDayMs).first<{ n: number }>();
  const reminders = await db.prepare('SELECT COUNT(*) AS n FROM push_subs').first<{ n: number }>();
  const topEp = (
    await db
      .prepare("SELECT endpoint, COUNT(*) AS calls FROM ai_calls WHERE created_at >= date('now') GROUP BY endpoint ORDER BY calls DESC LIMIT 5")
      .all<{ endpoint: string; calls: number }>()
  ).results;

  return {
    capUsd,
    mtdUsd: spendUsd(spendRows),
    callsToday: Number(today?.calls ?? 0),
    errorsToday: Number(today?.errors ?? 0),
    premiumNow: Number(premium?.n ?? 0),
    trialsActive: Number(trials?.n ?? 0),
    newPremiumToday: Number(newPrem?.n ?? 0),
    scrapbookToday: Number(sb?.n ?? 0),
    reminders: Number(reminders?.n ?? 0),
    topEndpoints: topEp.map((r) => ({ endpoint: String(r.endpoint), calls: Number(r.calls) })),
  };
}

/** The cron body: ping the dead-man's-switch, sweep D1 for trouble and email on a breach,
 *  and once a day send the pulse. Shares the hourly tick with sendDailyNudges. Every step
 *  is isolated so a failure in one never blocks another or the app. */
export async function runMonitor(env: MonitorEnv, nowMs: number): Promise<void> {
  // The heartbeat fires FIRST and unconditionally, so the external watcher sees a live
  // cron even if D1 or email is down. That is the whole point of the dead-man's-switch.
  try {
    if (env.HEARTBEAT_URL) await fetch(env.HEARTBEAT_URL, { method: 'GET' });
  } catch {
    // best effort
  }

  if (!env.DB || !env.SEND_EMAIL || !env.FEEDBACK_TO) return;
  const db = env.DB;
  const now = new Date(nowMs);
  const capUsd = Number(env.ANTHROPIC_MONTHLY_CAP_USD ?? '25') || 25;

  // Ensure the dedup table exists even before the migration is applied (idempotent).
  try {
    await db.prepare('CREATE TABLE IF NOT EXISTS alerts_sent (kind TEXT NOT NULL, created_at INTEGER NOT NULL)').run();
  } catch {
    // fall through; lastAlert fails open if this could not run
  }

  // --- alarms ---
  try {
    const metric = await gatherMetrics(db, capUsd, now);
    const fresh: Alarm[] = [];
    for (const a of evaluateAlarms(metric)) {
      if (!suppressed(await lastAlert(db, a.kind), nowMs, THRESHOLDS.dedupHours)) fresh.push(a);
    }
    if (fresh.length) {
      const subject = fresh.length === 1 ? `[DoubleDone] ${fresh[0].title}` : `[DoubleDone] ${fresh.length} alerts need a look`;
      await sendOwnerEmail(env, subject, buildAlertBody(fresh, now.toISOString()));
      for (const a of fresh) await recordAlert(db, a.kind, nowMs);
    }
  } catch {
    // best effort: the sweep must never break the app or the daily nudge
  }

  // --- daily digest, once per day, deduped ---
  try {
    if (now.getUTCHours() === DIGEST_HOUR_UTC && !suppressed(await lastAlert(db, 'digest'), nowMs, 12)) {
      const digest = await gatherDigest(db, capUsd, now);
      await sendOwnerEmail(env, `[DoubleDone] daily pulse`, buildDigestBody(digest, now.toISOString()));
      await recordAlert(db, 'digest', nowMs);
    }
  } catch {
    // best effort
  }
}

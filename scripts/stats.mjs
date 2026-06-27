// A quick live dashboard over the D1 telemetry. Read-only. Run from the repo root:
//   npm run stats
// Pulls the moat / product numbers (AI usage, premium, trials, reminders) straight from the
// doubledone-telemetry D1, so you can eyeball the live state without the Cloudflare dashboard.
import { execSync } from 'node:child_process';

const QUERIES = [
  [
    'Overview',
    "SELECT (SELECT COUNT(*) FROM ai_calls) AS ai_calls, (SELECT COUNT(*) FROM ai_calls WHERE ok=0) AS errors, " +
      "(SELECT COUNT(*) FROM ai_calls WHERE created_at >= date('now')) AS today, " +
      "(SELECT COALESCE(SUM(premium),0) FROM entitlements) AS premium_now, " +
      '(SELECT COUNT(*) FROM trials) AS trials, (SELECT COUNT(*) FROM push_subs) AS reminders, ' +
      '(SELECT COUNT(*) FROM scrapbook_log) AS scrapbooks_24h',
  ],
  [
    'AI calls by feature',
    'SELECT endpoint, COUNT(*) AS calls, SUM(CASE WHEN ok=0 THEN 1 ELSE 0 END) AS errors ' +
      'FROM ai_calls GROUP BY endpoint ORDER BY calls DESC',
  ],
  [
    'Last 7 days',
    "SELECT date(created_at) AS day, COUNT(*) AS calls FROM ai_calls WHERE created_at >= date('now','-6 days') GROUP BY day ORDER BY day",
  ],
  [
    'Premium by status',
    "SELECT COALESCE(status,'(none)') AS status, COUNT(*) AS n FROM entitlements GROUP BY status ORDER BY n DESC",
  ],
  [
    'Recent errors (last 5)',
    "SELECT endpoint, substr(COALESCE(error,''),1,50) AS error, created_at FROM ai_calls WHERE ok=0 ORDER BY created_at DESC LIMIT 5",
  ],
];

function query(sql) {
  const cmd = `npm exec -w server -- wrangler d1 execute doubledone-telemetry --remote --json --command "${sql.replace(/"/g, '\\"')}"`;
  const out = execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 20 * 1024 * 1024 });
  const i = out.indexOf('[');
  if (i < 0) return [];
  return JSON.parse(out.slice(i))[0]?.results ?? [];
}

function table(rows) {
  if (!rows.length) return '  (none)';
  const cols = Object.keys(rows[0]);
  const w = cols.map((c) => Math.max(c.length, ...rows.map((r) => String(r[c] ?? '').length)));
  const line = (vals) => '  ' + vals.map((v, i) => String(v ?? '').padEnd(w[i])).join('   ');
  return [line(cols), line(w.map((n) => '-'.repeat(n))), ...rows.map((r) => line(cols.map((c) => r[c])))].join('\n');
}

console.log(`\nDoubleDone live stats  ·  ${new Date().toISOString()}\n`);
for (const [title, sql] of QUERIES) {
  console.log(`▸ ${title}`);
  try {
    console.log(table(query(sql)));
  } catch (e) {
    console.log('  (query failed:', e.message, ')');
  }
  console.log('');
}

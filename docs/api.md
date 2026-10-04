# DoubleDone REST API

A small public REST API over your own DoubleDone tasks. It lives on the same Cloudflare Worker
as the app's AI backend and the [MCP server](mcp.md), at `https://api.doubledone.app`.

It acts only as **you**. Every call carries your own DoubleDone token, the Worker verifies it,
and the database's row-level security then scopes the call to exactly your rows. The Worker
holds no elevated database key, so nothing here can reach anyone else's data.

It is a create, read, update and delete surface with three read modes (search, look-ahead and
Today) and repeat cadences. The repeat vocabulary and the cadence maths are the same code the
[MCP server](mcp.md) uses, so a repeating task made here, by an AI agent or in the app has the
same shape. The AI actions (Break it down) are on the MCP surface only. This API has none.

| | |
|---|---|
| Base URL | `https://api.doubledone.app/api/v1` |
| Interactive docs (Swagger UI) | [`/api/v1/docs`](https://api.doubledone.app/api/v1/docs) |
| OpenAPI 3.1 spec | [`/api/v1/openapi.json`](https://api.doubledone.app/api/v1/openapi.json), `info.version` **1.2.3** |
| Auth | `Authorization: Bearer <your DoubleDone token>` on every task call |
| Format | JSON in, JSON out. Errors are `{ "error": "<plain message>" }` |
| CORS | Open to any origin (the token is the auth, not the origin) |
| Source | [`server/src/api.ts`](../server/src/api.ts), [`server/src/openapi.ts`](../server/src/openapi.ts), [`server/src/cadence.ts`](../server/src/cadence.ts) |

The docs page and the spec need no token. The task endpoints do.

---

## Auth: your token

Send your DoubleDone token as a bearer token: `Authorization: Bearer <token>`.

**Where to get it.** In the app, signed in: **Settings → AI → AI agent access (MCP) → Copy my
token**. It is the same token the MCP server's pasted-token path uses.

**What it is.** Your Supabase access token, the one your signed-in app session uses. It lasts
about an hour, then you copy a fresh one. It is your own session, not a key limited to this API,
so treat it like a password for that hour and keep it out of shared code and logs.

**How it is checked.** Before any call reaches your data, the Worker verifies the token's
signature against Supabase's published keys, its issuer and its expiry
([`server/src/verify.ts`](../server/src/verify.ts)). A missing, expired or forged token is a
`401` with a plain message telling you to re-copy it, never a `502`. The check fails closed: if
the Worker briefly cannot reach the key set, a good token gets the same `401`, and a retry a
moment later usually clears it.

**Revoking.** There is no early revoke for a copied token. Signing out ends the session's
refresh tokens, not an access token already copied, so a copied token keeps working until it
expires. (Settings' **Disconnect AI connectors** ends OAuth connector access. It does not touch
a copied token.)

---

## Endpoints

| Method | Path | Does | Success |
|---|---|---|---|
| `GET` | `/tasks` | List your tasks. One read mode per call: `?q`, `?upcoming` or `?today` (see [Reading](#reading-get-tasks)). | `200 { "tasks": [ … ] }` |
| `POST` | `/tasks` | Create a task. | `201 { "task": … }` |
| `GET` | `/tasks/{id}` | Get one task. | `200 { "task": … }` |
| `PATCH` | `/tasks/{id}` | Change a task's title, done, due day or repeat. | `200 { "task": … }` |
| `DELETE` | `/tasks/{id}` | Remove a task (a soft delete). | `204`, no body |

Every path above is relative to the base URL, so the full collection URL is
`https://api.doubledone.app/api/v1/tasks`.

---

## The task object

```json
{
  "id": "api-mgd4w7z1-k2p9qd",
  "title": "Water the plants",
  "done": false,
  "due": null,
  "recurrence": { "kind": "weekly", "weekdays": [1, 3, 5], "start": "2026-10-05" },
  "repeats": "Mon, Wed, Fri",
  "createdAt": "2026-10-05T01:12:09.412+00:00",
  "completedAt": null
}
```

| Field | Type | Meaning |
|---|---|---|
| `id` | string | Treat it as opaque. Tasks made through this API start `api-`, tasks made by an agent start `mcp-`, and the app makes its own. |
| `title` | string | The task's words. |
| `done` | boolean | Whether a **one-off** is finished. A repeating task is ticked one day at a time, so its `done` stays `false` (see [Repeats and `done`](#repeats-and-done)). |
| `due` | string or null | `YYYY-MM-DD` for a dated one-off. `null` means undated, which the app shows on Today. In an `upcoming` listing only, a repeating task carries the day it next lands here. |
| `recurrence` | object or null | The stored repeat rule, or `null` for a one-off. See [Recurrence](#recurrence). |
| `repeats` | string or null | A short English summary of the rule, such as `"every day"`, `"Mon, Wed, Fri"`, `"every 3 days"` or `"every month on the 1st"`. `null` for a one-off. |
| `createdAt` | string | When the task was made. |
| `completedAt` | string or null | When a one-off was finished, or `null`. |

A task is **never both dated and recurring**. It has a `due` day, or a `recurrence`, or
neither. (The one exception is the `upcoming` listing described below, where a repeat's next
day is shown in `due` for convenience. Nothing is stored that way.)

Those eight fields are the whole shape. See [What this API does not expose](#what-this-api-does-not-expose)
for what is left out on purpose.

---

## Reading: `GET /tasks`

`GET /tasks` picks **one** read mode from the query string. When more than one is given, the
first match wins in this order: `q`, then `upcoming`, then `today`, then the plain list.

| Query | Returns | Order |
|---|---|---|
| `?q=<text>` | Your **open** tasks whose title contains the text, ignoring case. At most 50. An empty `?q=` returns your first 50 open tasks. | Oldest first |
| `?upcoming=<days>` | A look-ahead window: your open one-offs dated **after today** up to and including today plus `days`, and the **next occurrence** of each repeating task inside that window. `days` is rounded down and clamped to 1 to 30. A value that is not a number uses 7. A bare `?upcoming` with no value counts as 0, so it looks one day ahead. | By date |
| `?today=true` | Open one-offs that are undated or due today or earlier. Repeating tasks are **not** included here (the MCP `list_today` tool does include them). Only the exact value `true` turns this on. | Oldest first |
| *(none)* | Every task you have that is not deleted: open and finished, one-off and repeating. | Oldest first |

"Open" means not finished and not removed. The search, look-ahead and Today modes also leave out
the hidden umbrella of a broken-down task, because the app hides it behind its steps until they
are done.

More on `upcoming`:

- The window starts **tomorrow**. Tasks due today belong to `?today=true`.
- A repeat that is already ticked or skipped for its next day shows the occurrence after that,
  if one falls inside the window. A repeat with no occurrence in the window is left out.
- Each repeat in the result carries that next day in `due`, alongside its `recurrence`.

---

## Creating: `POST /tasks`

```json
{ "title": "Book the dentist" }
{ "title": "Renew the rego", "due": "2026-10-20" }
{ "title": "Water the plants", "repeat": { "kind": "weekly", "weekdays": [1, 3, 5] } }
```

| Field | Required | Rules |
|---|---|---|
| `title` | yes | A non-empty string. Leading and trailing spaces are trimmed. |
| `due` | no | A `YYYY-MM-DD` day for a one-off. A day of today or earlier shows on Today, as in the app. Only the shape is checked here (unlike `day` on an update), so send a real calendar day. |
| `repeat` | no | A repeat rule (see [Recurrence](#recurrence)). |

Send `due` **or** `repeat`, never both (that is a `400`). With neither, the task is undated,
which puts it on your Today in the app. New tasks always start open. Answers `201` with the
created task.

---

## Updating: `PATCH /tasks/{id}`

Send any of these. At least one is required.

| Field | Rules |
|---|---|
| `title` | A non-empty string, trimmed. |
| `done` | A JSON boolean (`true` or `false`, not a string). |
| `day` | With `done` only: the `YYYY-MM-DD` day to tick or un-tick on a repeating task. It must be a real calendar day (`2026-02-30` is refused). Defaults to the UTC day. |
| `due` | A `YYYY-MM-DD` day, or `null` to clear the date. Setting a day stops any repeat. As on create, only the shape is checked. |
| `repeat` | A repeat rule, or `null` to stop repeating. Setting a rule clears the due day. |

`due` and `repeat` both non-null in one call is a `400`, because each one clears the other.
Answers `200` with the task as it now stands, or `404` if there is no such task.

### Repeats and `done`

The app ticks a repeating task one day at a time and never closes the series, and this API does
the same:

- **`done: true` on a repeating task** ticks it for one day, in the same per-day record the app
  writes, and leaves the series running. The returned task still shows `done: false` with its
  `repeats` summary. The day is the **UTC** calendar day unless you send `day`, so if you know
  the person's local date, send it.
- **`done: false` on a repeating task** un-ticks that day **on the server only**. A device that
  has already synced the tick brings it back on its next open, because the app keeps ticks on
  purpose.
- **A one-off** closes with `done: true` (stamping `completedAt`) and reopens with `done: false`
  (clearing it).
- A `done` write reads the task first and judges it by its shape **after** your change. So
  `{ "done": true, "repeat": null }` stops the repeat and closes the one-off it becomes.
- Completing never ends a repeat. To stop one, send `"repeat": null`.
- Skipping a day of a repeat is something only the app does. This API can see that a day was
  skipped (it shapes `upcoming`) but cannot skip one.

---

## Deleting: `DELETE /tasks/{id}`

A soft delete. The row is tombstoned (its `deleted_at` is set), the same way the app removes a
task, so the removal syncs to your other devices instead of leaving a ghost behind. Answers
`204` with no body. It answers `204` even when the id matches nothing, so a repeated delete is
harmless. A removed task no longer appears in any listing and `GET /tasks/{id}` answers `404`.

---

## Recurrence

You send a `repeat` rule. The API stores and returns a normalised `recurrence`, plus the English
`repeats` summary.

```json
{ "kind": "daily" }
{ "kind": "weekly", "weekdays": [1, 3, 5] }
{ "kind": "every_n_days", "days": 3, "start": "2026-10-10" }
{ "kind": "monthly", "day": 1 }
```

| `repeat.kind` | Fields you send | Stored and returned as | Summary |
|---|---|---|---|
| `daily` | `start` (optional) | `{ "kind": "daily", "start": "…" }` | `every day` |
| `weekly` | `weekdays` (required: a non-empty list of whole numbers, `0` = Sunday to `6` = Saturday), `start` (optional) | `{ "kind": "weekly", "weekdays": […], "start": "…" }` | `Mon, Wed, Fri` (all seven days reads `every day`) |
| `every_n_days` | `days` (required: a whole number, 1 or more), `start` (optional) | `{ "kind": "interval", "days": 3, "anchor": "…" }` | `every 3 days` (every 1 day reads `every day`) |
| `monthly` | `day` (optional, 1 to 31), `start` (optional) | `{ "kind": "monthly", "day": 1, "start": "…" }` | `every month on the 1st` |

- **`start`** is a `YYYY-MM-DD` day the repeat begins on, and defaults to today (UTC). A daily,
  weekly or monthly repeat is not due before its start.
- **`every_n_days`** counts from its anchor, which is `start`, or today when there is none. It
  comes back as `kind: "interval"` with that `anchor`, so translate it back to `every_n_days`
  before sending it again.
- **`monthly`** defaults its `day` to the day of the month of `start`, or of today when there is
  no `start`. A month with no such day uses its **last** day, so "the 31st" is the 28th (or 29th)
  in February and the 30th in April. It clamps rather than skips, because the months a skip
  would quietly drop are exactly the ones a rent or a bill cannot afford to miss.
- An unknown `kind`, an empty `weekdays`, a `days` below 1, a `day` outside 1 to 31 or an
  unreadable `start` is a calm `400`.

One function, `buildRecurrence` in [`server/src/cadence.ts`](../server/src/cadence.ts),
translates every rule, for this API and for the MCP server alike, and it mirrors the app's own
repeat shapes. That is why a repeat made anywhere looks the same everywhere.

---

## Days and time zones

Every "today" on this API is the **UTC** calendar day at the moment of the call. That covers
`?today=true`, the start of the `upcoming` window, the default `start` of a new repeat, a
monthly repeat's default day, and the default day of a tick.

In Melbourne that means the API's "today" is still yesterday's date until 10 am, or 11 am during
daylight saving. Where the person's local date matters, pass it: `day` on a tick, `start` on a
repeat, `due` on a one-off.

---

## Errors

Every error from the task endpoints is JSON, `{ "error": "<plain message>" }`, with the open CORS
headers, so a browser integration can read it. Malformed input is always a `400`, never a `500`
and never a leaked upstream status.

| Status | When |
|---|---|
| `400` | The body is not valid JSON, a field breaks the rules above (an empty or missing title, a badly shaped `due`, an unreadable `repeat`, `due` and `repeat` together, a `day` that is not a real calendar day, a `day` without `done`, nothing to update), or a task id in the path will not decode. |
| `401` | No bearer token, a token that fails verification (expired, forged or otherwise invalid), or Supabase refusing the token. The message says to re-copy it from Settings. |
| `404` | No such task, or a task you have removed. Also an unknown path: under `/api/v1` after the token check, and any other `/api/` path with `not found (use /api/v1)`. |
| `405` | A method the path does not support. |
| `413` | A declared request size over 2,000,000 bytes. This one is plain text, sent by the Worker before the API runs. |
| `500` | Something went wrong on our side. Still JSON with CORS. Try again in a moment. |
| `502` | Supabase itself failed (anything other than refusing the token), or a create came back with no row. |

---

## Limits

- **Request size.** A request declaring more than 2,000,000 bytes is refused with a `413`.
- **Search** returns at most 50 tasks.
- **Look-ahead** is 1 to 30 days.
- **No pagination parameter.** A list comes back as a single response, in the order shown in
  [Reading](#reading-get-tasks).
- **Rate limits.** The Worker sets no per-call rate limit on these endpoints. Please poll no more
  often than your integration needs.

---

## What this API does not expose

The API reads and writes only your own rows in your own task list, and returns only the eight
fields above. Left out on purpose:

- **Where you left off.** The one-line note you keep on a task in the app (new in 1.8.0) is never
  returned here, and it cannot be written here. Every read names its columns and that note is not
  among them. It stays in the app and your own synced account, and is never copied onto a shared
  list.
- **Shared lists (Ours).** The API never reads or writes a shared list, so your partner's list and
  words are out of its reach. A task you have brought from Ours onto your own Today is a row in
  your own list, so it appears here like any other task you own, without its link to the shared
  list.
- **Anyone else's data.** Your verified token plus row-level security scopes every call to your
  account, and the Worker holds no key that could do otherwise.
- **The app's working detail.** Pins, "a lot" marks, parts tracked on a task, effort estimates,
  the bookkeeping behind a broken-down, tiny or combined task, per-day tick and skip lists, your
  user id and internal timestamps. (The tick and skip lists are read to shape `upcoming`, never
  returned.)
- **The rest of the app.** Routines, rhythms, scrapbooks, settings, Premium and billing are not
  on this API.
- **AI.** No endpoint here calls a model. Break it down for agents is the MCP `break_down` tool.

---

## Examples

```bash
TOKEN="<paste your token>"
BASE="https://api.doubledone.app/api/v1"

# Today's open one-offs (undated, due today or earlier)
curl -s "$BASE/tasks?today=true" -H "Authorization: Bearer $TOKEN"

# Search your open tasks
curl -s "$BASE/tasks?q=dentist" -H "Authorization: Bearer $TOKEN"

# The next 14 days: future one-offs plus each repeat's next occurrence
curl -s "$BASE/tasks?upcoming=14" -H "Authorization: Bearer $TOKEN"

# Add one (undated, so it shows on Today in the app)
curl -s -X POST "$BASE/tasks" -H "Authorization: Bearer $TOKEN" \
  -H "content-type: application/json" -d '{"title":"Book the dentist"}'

# Add one for a set day
curl -s -X POST "$BASE/tasks" -H "Authorization: Bearer $TOKEN" \
  -H "content-type: application/json" -d '{"title":"Renew the rego","due":"2026-10-20"}'

# Add a repeating one (Monday, Wednesday and Friday)
curl -s -X POST "$BASE/tasks" -H "Authorization: Bearer $TOKEN" \
  -H "content-type: application/json" \
  -d '{"title":"Water the plants","repeat":{"kind":"weekly","weekdays":[1,3,5]}}'

# Rent on the 31st, which lands on the last day of shorter months
curl -s -X POST "$BASE/tasks" -H "Authorization: Bearer $TOKEN" \
  -H "content-type: application/json" \
  -d '{"title":"Pay the rent","repeat":{"kind":"monthly","day":31}}'

# Finish a one-off
curl -s -X PATCH "$BASE/tasks/<id>" -H "Authorization: Bearer $TOKEN" \
  -H "content-type: application/json" -d '{"done":true}'

# Tick a repeat for the person's local date
curl -s -X PATCH "$BASE/tasks/<id>" -H "Authorization: Bearer $TOKEN" \
  -H "content-type: application/json" -d '{"done":true,"day":"2026-10-06"}'

# Turn a dated task into a daily repeat (this clears its due day)
curl -s -X PATCH "$BASE/tasks/<id>" -H "Authorization: Bearer $TOKEN" \
  -H "content-type: application/json" -d '{"repeat":{"kind":"daily"}}'

# Stop a repeat
curl -s -X PATCH "$BASE/tasks/<id>" -H "Authorization: Bearer $TOKEN" \
  -H "content-type: application/json" -d '{"repeat":null}'

# Remove one
curl -s -X DELETE "$BASE/tasks/<id>" -H "Authorization: Bearer $TOKEN"
```

---

## Where the code lives

| File | What it holds |
|---|---|
| [`server/src/api.ts`](../server/src/api.ts) | The routes, body checks, read modes and the task shape |
| [`server/src/openapi.ts`](../server/src/openapi.ts) | The OpenAPI 3.1 spec and the Swagger UI page |
| [`server/src/cadence.ts`](../server/src/cadence.ts) | `buildRecurrence`, the due-today maths and the per-day tick, shared with MCP |
| [`server/src/verify.ts`](../server/src/verify.ts) | Token verification |
| [`server/src/index.ts`](../server/src/index.ts) | Routing on the Worker, including the request-size ceiling |
| [`server/src/api.test.ts`](../server/src/api.test.ts) | The unit tests for the routes, body checks, read modes and task shape |
| [`server/src/cadence.test.ts`](../server/src/cadence.test.ts) | The unit tests for the shared cadence maths |

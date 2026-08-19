# DoubleDone REST API

A small public REST API over your DoubleDone tasks, on the same Cloudflare Worker as
the AI backend and the [MCP server](mcp.md). It holds no elevated key and acts only as
**you**: every call carries your own DoubleDone token, and the database's row-level
security scopes it to exactly your rows.

It is a token-authenticated CRUD-plus-query surface: create, read, update and delete your
own tasks, search them, look ahead over the coming days, and set repeat cadences. The repeat
vocabulary and recurrence math are shared verbatim with the [MCP server](mcp.md), so a
repeating task made by the API, an AI agent, or the app is indistinguishable. The AI actions
(the Break-it-down engine) live on the MCP surface, not here.

## Base URL

```
https://api.doubledone.app/api/v1
```

## Browse it

- **Interactive docs (Swagger UI):** [`/api/v1/docs`](https://api.doubledone.app/api/v1/docs)
- **OpenAPI 3.1 spec (version 1.2.0):** [`/api/v1/openapi.json`](https://api.doubledone.app/api/v1/openapi.json)

## Auth: your token

Send your DoubleDone token as a bearer token: `Authorization: Bearer <token>`. It is your
Supabase access token, the same one the MCP server uses. Get it in the app:
**Settings → AI agent access (MCP) → Copy my token** (you must be signed in). It refreshes
about hourly; re-copy it if calls start returning `401`.

The docs surfaces (`/docs`, `/openapi.json`) need no token. The task endpoints do.

## Endpoints

| Method | Path | Does |
|---|---|---|
| `GET` | `/tasks` | List your tasks. Supports `?q`, `?upcoming`, `?today` (see [Read modes](#read-modes)). |
| `POST` | `/tasks` | Create a task. Body: `{ "title": "…", "due"?: "YYYY-MM-DD" \| "repeat"?: { … } }`. |
| `GET` | `/tasks/{id}` | Get one task. |
| `PATCH` | `/tasks/{id}` | Update. Body: any of `{ "title", "done", "due", "repeat" }`. |
| `DELETE` | `/tasks/{id}` | Delete (a soft delete; the row is tombstoned). |

Single-task responses are wrapped as `{ "task": … }`; list responses as `{ "tasks": [ … ] }`.

A task looks like:

```json
{
  "id": "…",
  "title": "Buy milk",
  "done": false,
  "due": null,
  "recurrence": null,
  "repeats": null,
  "createdAt": "…",
  "completedAt": null
}
```

`recurrence` is the normalised repeat rule (or `null` for a one-off) and `repeats` is a short
human summary of it (e.g. `"every day"`, `"Mon, Wed, Fri"`, `"every 3 days"`, or `null`). A task
is **never both dated and recurring**: it has a `due` day, or a `recurrence`, or neither.

## Read modes

`GET /tasks` picks one read mode from the query string. When more than one is supplied the
precedence is `q`, then `upcoming`, then `today`, then a plain list:

| Query | Returns |
|---|---|
| `?q=<text>` | Case-insensitive substring search over the titles of your **open** tasks. |
| `?upcoming=<days>` | A look-ahead window of 1 to 30 days (default 7): your future one-off tasks plus the **next occurrence** of each repeating task, in date order. Each returned task carries the day it next lands in `due`. |
| `?today=true` | The app's Today view: open, non-recurring tasks due today or undated (the decomposed-task umbrella the app hides is excluded, so it matches Today exactly). |
| *(none)* | Your full list of open and dated tasks. |

## Recurrence

A task can repeat instead of having a single due day. On **create** (`POST`) and **update**
(`PATCH`) you pass a `repeat` object; the API returns the normalised `recurrence` plus the
`repeats` summary. Setting a `due` day clears any repeat and setting a `repeat` clears the due
day, so the two never coexist. Either can be cleared with `null` on a `PATCH`.

```json
{ "kind": "daily" }
{ "kind": "weekly", "weekdays": [1, 3, 5] }
{ "kind": "every_n_days", "days": 3, "start": "2026-07-10" }
{ "kind": "monthly", "day": 1 }
```

- **`daily`** — every day.
- **`weekly`** — on the given `weekdays` (`0` = Sunday … `6` = Saturday, non-empty).
- **`every_n_days`** — every `days` days, optionally anchored from `start` (defaults to today).
- **`monthly`** — on `day` of the month (`1`–`31`, defaults to the day of creation). A month with
  no such day uses its **last** day, so "the 31st" is the 28th in February and the 30th in April.
  It clamps rather than skipping: the months a skip would silently drop are exactly the ones a rent
  or a bill cannot afford to miss.

This repeat vocabulary, the UTC-calendar-day basis, and the recurrence math are **shared
verbatim with the [MCP server](mcp.md)** (the one `buildRecurrence` cadence engine), so a
repeating task created by an AI agent, by the app, or by this API is indistinguishable.

## Examples

```bash
TOKEN="<paste your token>"
BASE="https://api.doubledone.app/api/v1"

# Today's open tasks
curl -s "$BASE/tasks?today=true" -H "Authorization: Bearer $TOKEN"

# Search open tasks by keyword
curl -s "$BASE/tasks?q=dentist" -H "Authorization: Bearer $TOKEN"

# The next 14 days (future one-offs plus each repeat's next occurrence)
curl -s "$BASE/tasks?upcoming=14" -H "Authorization: Bearer $TOKEN"

# Add one (lands on today)
curl -s -X POST "$BASE/tasks" -H "Authorization: Bearer $TOKEN" \
  -H "content-type: application/json" -d '{"title":"Book the dentist"}'

# Add a repeating one (every Monday, Wednesday, Friday)
curl -s -X POST "$BASE/tasks" -H "Authorization: Bearer $TOKEN" \
  -H "content-type: application/json" \
  -d '{"title":"Water the plants","repeat":{"kind":"weekly","weekdays":[1,3,5]}}'

# Complete it
curl -s -X PATCH "$BASE/tasks/<id>" -H "Authorization: Bearer $TOKEN" \
  -H "content-type: application/json" -d '{"done":true}'

# Turn a dated task into a daily repeat (this clears its due day)
curl -s -X PATCH "$BASE/tasks/<id>" -H "Authorization: Bearer $TOKEN" \
  -H "content-type: application/json" -d '{"repeat":{"kind":"daily"}}'
```

## Notes and limits

- **No elevated key.** The Worker holds only the public anon key; your token does the
  authorising, and RLS scopes every call to your account. Nothing here can read or write
  anyone else's data.
- **Token expiry.** The token is a Supabase access token and refreshes about hourly. A
  long-lived, revocable API-key system is a planned enhancement, designed so the Worker
  still never holds an elevated key.
- **Soft delete.** `DELETE` tombstones the row (`deleted_at`), consistent with the app's
  sync model, so a deletion propagates instead of leaving a ghost on another device.
- **CORS open.** The API allows any origin: the bearer token is the auth, not the origin.
- **Calm errors.** Malformed input (a bad date, an unreadable `repeat`, `due` and `repeat`
  together) is always answered with a `400` and a plain message, never a `500` or a leaked
  upstream status.
- **CRUD plus query.** Tasks only, with create / read / update / delete plus the `q`,
  `upcoming`, and `today` read modes. AI actions (the Break-it-down engine) are **MCP-only by
  design**; this REST surface stays CRUD + query. Pagination and richer filters are deferred.

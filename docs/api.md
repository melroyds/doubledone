# DoubleDone REST API

A small public REST API over your DoubleDone tasks, on the same Cloudflare Worker as
the AI backend and the [MCP server](mcp.md). It holds no elevated key and acts only as
**you**: every call carries your own DoubleDone token, and the database's row-level
security scopes it to exactly your rows.

## Base URL

```
https://doubledone-ai.melroy-a02.workers.dev/api/v1
```

## Browse it

- **Interactive docs (Swagger UI):** [`/api/v1/docs`](https://doubledone-ai.melroy-a02.workers.dev/api/v1/docs)
- **OpenAPI 3.1 spec:** [`/api/v1/openapi.json`](https://doubledone-ai.melroy-a02.workers.dev/api/v1/openapi.json)

## Auth: your token

Send your DoubleDone token as a bearer token: `Authorization: Bearer <token>`. It is your
Supabase access token, the same one the MCP server uses. Get it in the app:
**Settings → AI agent access (MCP) → Copy my token** (you must be signed in). It refreshes
about hourly; re-copy it if calls start returning `401`.

The docs surfaces (`/docs`, `/openapi.json`) need no token. The task endpoints do.

## Endpoints

| Method | Path | Does |
|---|---|---|
| `GET` | `/tasks` | List your tasks. `?today=true` narrows to open, due-today-or-undated. |
| `POST` | `/tasks` | Create a task. Body: `{ "title": "…", "due"?: "YYYY-MM-DD" }`. |
| `GET` | `/tasks/{id}` | Get one task. |
| `PATCH` | `/tasks/{id}` | Update. Body: any of `{ "title", "done", "due" }`. |
| `DELETE` | `/tasks/{id}` | Delete (a soft delete; the row is tombstoned). |

A task looks like:

```json
{ "id": "…", "title": "Buy milk", "done": false, "due": null, "createdAt": "…", "completedAt": null }
```

## Examples

```bash
TOKEN="<paste your token>"
BASE="https://doubledone-ai.melroy-a02.workers.dev/api/v1"

# Today's open tasks
curl -s "$BASE/tasks?today=true" -H "Authorization: Bearer $TOKEN"

# Add one
curl -s -X POST "$BASE/tasks" -H "Authorization: Bearer $TOKEN" \
  -H "content-type: application/json" -d '{"title":"Book the dentist"}'

# Complete it
curl -s -X PATCH "$BASE/tasks/<id>" -H "Authorization: Bearer $TOKEN" \
  -H "content-type: application/json" -d '{"done":true}'
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
- **One resource for now.** Tasks only. Recurring-task cadence and richer querying
  (pagination, filters) are deferred.

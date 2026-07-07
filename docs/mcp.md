# DoubleDone MCP server

A small remote [MCP](https://modelcontextprotocol.io) server so an AI agent can manage
your DoubleDone tasks: add them, see today's, tick them off. It runs on the same
Cloudflare Worker as the AI backend, holds **no elevated key**, and acts only as **you**.

There are two ways to connect, by how much your client can do:

- **Sign in with a URL (recommended).** For connector UIs like **claude.ai / Claude
  Cowork** and **ChatGPT** (Developer Mode): paste one URL, sign in with your email code,
  done. This is the OAuth path.
- **Paste a token.** For developer clients that send a custom header, **Claude Code**,
  **Claude Desktop**, **Cursor**, the **MCP Inspector**. This is the original path and
  still works unchanged.

## Endpoint

```
https://api.doubledone.app/mcp
```

Transport: MCP Streamable HTTP (JSON-RPC 2.0 over a single POST).

---

## Connect with a URL (claude.ai / Cowork / ChatGPT)

You need an existing DoubleDone account. If you have never signed in, open the app once
and sign in with your email first, a connector is not a place to make a new account.

### claude.ai / Claude Cowork

1. **Settings → Connectors → Add custom connector.**
2. Name it `DoubleDone`, URL `https://api.doubledone.app/mcp`.
3. Claude discovers it needs sign-in and opens a small DoubleDone page. Enter your account
   email, then the 6-digit code it sends you.
4. A consent screen tells you exactly what the connector may do (add, list, complete your
   tasks, nothing else) and **where access is sent**. Click **Allow**.
5. Ask Claude to *"add 'book the dentist' to my DoubleDone"* or *"what's on my DoubleDone
   today."*

### ChatGPT

1. Enable **Settings → Connectors → Advanced → Developer mode**.
2. **Add a connector**, URL `https://api.doubledone.app/mcp`, auth **OAuth**.
3. The same DoubleDone sign-in page appears: email → 6-digit code → **Allow**.
4. In a chat, add the connector and ask it to add or list your tasks.

No token to copy, and nothing to re-paste every hour, the connection refreshes itself.

---

## Connect with a token (Claude Code / Desktop / Cursor / Inspector)

Developer clients can send an `Authorization` header, so they use your own token directly,
no sign-in page.

Get your token in the app: **Settings → AI agent access (MCP) → Copy my token** (you must
be signed in). It refreshes about hourly; re-copy it if your agent stops connecting.

**Claude Code** (one line):

```
claude mcp add --transport http doubledone https://api.doubledone.app/mcp \
  --header "Authorization: Bearer YOUR_TOKEN_HERE"
```

**Claude Desktop** talks to stdio servers, so bridge with
[`mcp-remote`](https://www.npmjs.com/package/mcp-remote). Edit
`claude_desktop_config.json` (Settings → Developer → Edit Config):

```json
{
  "mcpServers": {
    "doubledone": {
      "command": "npx",
      "args": [
        "-y", "mcp-remote", "https://api.doubledone.app/mcp",
        "--header", "Authorization: Bearer YOUR_TOKEN_HERE"
      ]
    }
  }
}
```

**MCP Inspector** (`npx @modelcontextprotocol/inspector`): Transport = **Streamable
HTTP**, URL = the endpoint above. For the token tools add a header
`Authorization: Bearer <your token>`. Discovery works with no header.

---

## Tools

| Tool | Arguments | Does |
|---|---|---|
| `add_task` | `title` (string); optional `due` (`YYYY-MM-DD`) **or** `repeat` (object), not both | Adds a task. By default it lands on today. `due` schedules a one-off for a future day; `repeat` makes it recur (`daily`, `weekly` with `weekdays` 0–6, or `every_n_days` with `days`, plus an optional `start`). |
| `list_today` | none | Lists what's open on your Today, each with its id: one-off tasks (undated or due today or earlier) plus any repeating task due today that you haven't done or skipped yet. |
| `list_upcoming` | optional `days` (1–30, default 7) | Looks ahead: your future-dated tasks and the next occurrence of each repeat within the window, in date order, each with its id. Read-only. |
| `complete_task` | `id` (string, from `list_today`) | Marks that task done. |
| `update_task` | `id` (string); any of `title`, `due` (or `null`), `repeat` (or `null`) | Changes a task. Setting `due` clears any repeat and vice versa; `null` clears a field. At least one change is required. |
| `delete_task` | `id` (string) | Removes a task. It is tombstoned (recoverable and syncs), never hard-deleted. |
| `break_down` | `task` (string); optional `context` (string), `steps` (2–10) | **Proposes** small, ordered, time-boxed steps for a dreaded task. It adds nothing: the agent shows the steps, and only once you agree does it call `add_task` per step. This is the one tool that spends a little AI time, so it is rate-limited per user. |
| `search` | `query` (string) | Searches your open tasks by keyword (for ChatGPT Deep Research). Read-only. |
| `fetch` | `id` (string, from `search`) | Fetches one task's detail (for ChatGPT Deep Research). Read-only. |

`search` and `fetch` complete OpenAI's Deep Research connector contract; the rest are the
everyday task tools an agent uses to capture, look ahead over, and manage your day.

> **Miss path is deliberate.** `search` returns the well-formed empty shape (`{results:[]}`)
> on an upstream blip so Deep Research does not choke, and `fetch` returns a well-formed empty
> document (`{id, title:'Not found', text:'This task is no longer available.', url}`) rather
> than an off-contract `{error}` object when an id no longer resolves. Both keep every response
> shape-valid; the trade-off is that a transient outage reads the same as "no matching tasks."

---

## Security model

The design is the same on both connect paths: **the server never holds a key that can
reach your data.** Every task call is made with *your own* Supabase session, so the
database's row-level security scopes it to exactly your rows. The server cannot see or
touch anyone else's tasks, and cannot act as an admin.

- **Token path:** the bearer you paste *is* your session token; the server proxies each
  call with it.
- **OAuth path:** signing in hands the server a custody of your session (your rotating
  Supabase refresh token, held **AES-GCM-encrypted**, never in plaintext, never in logs).
  It mints short-lived access tokens as needed, still under your RLS.
- **OAuth uses S256 PKCE** (required, a request without it is rejected) and the standard
  discovery metadata (RFC 8414 / RFC 9728), so compliant clients connect automatically.
- **The consent screen shows where access goes.** A connector's display name is not
  trusted on its own, the page also shows the host your grant will be sent to, so a
  look-alike name cannot quietly redirect your access elsewhere.

### Disconnecting

- **Token path:** your token expires hourly on its own; to cut it sooner, sign out in the
  app (which rotates the session).
- **OAuth path:** **Settings → AI agent access (MCP) → Disconnect AI connectors** deletes
  the server's custody of your session immediately, the next tool call fails and the
  connector must sign in again. (Removing the connector in Claude/ChatGPT also stops it
  from its end.)

---

## Notes and limits

- **Existing accounts only for the URL path.** The sign-in page will not create an
  account; sign in once in the app first.
- **Recurring tasks are included.** `list_today` shows a repeating task on the day it is
  due, once, and hides it after you tick or skip it that day, so the agent sees the same
  Today you do. The cadence (daily / chosen weekdays / every-N-days) is evaluated in the
  Worker, the same math the app uses, so an agent-created repeat behaves identically to one
  you make in the app.
- **Propose, then accept.** `break_down` never writes. It returns the steps and reminds you
  nothing was added yet; adding them is a separate, explicit `add_task` per step once you say
  yes. Nothing here shames a backlog or deletes anything for real (delete is a recoverable
  tombstone), in keeping with the app's spine.
- **Mirrors what you see.** A task you have broken down hides behind its steps in the app
  (its umbrella goes quiet until the steps are done). `list_today` hides that umbrella too,
  so an agent sees the same Today you do, the steps to act on, not the parent.
- **No elevated key.** The server holds the public anon key only; your token (or your
  OAuth-custodied session) does the authorising. Nothing here can read or write another
  account's data.
- **Calm by default.** Tool replies are short and plain ("Added …", "Marked it done.
  Nice.", "Nothing on today. Enjoy the quiet."), in keeping with the app.

# DoubleDone MCP server

A small remote [MCP](https://modelcontextprotocol.io) server, so an AI assistant can look after
your DoubleDone tasks with you: add them, see today's, look ahead, tick them off, and break a
dreaded task into small steps. It runs on the same Cloudflare Worker as the app's AI backend and
the [REST API](api.md), holds no elevated database key, and acts only as **you**.

> **MCP or REST?** This surface is for AI assistants, and it is the only one with the AI
> **Break it down** tool. For plain programmatic access to the same tasks (create, read, update,
> delete, search, look-ahead and repeats) there is the [REST API](api.md). Both use the same
> cadence code, so a repeating task has the same shape whichever one made it.

| | |
|---|---|
| Endpoint | `https://api.doubledone.app/mcp` |
| Transport | MCP Streamable HTTP, JSON mode: JSON-RPC 2.0, one POST per message, one JSON reply |
| Protocol version | `2025-06-18` (the server echoes the version a client asks for) |
| Server | `{ "name": "doubledone", "version": "1.0.0" }` |
| Tools | Nine: `add_task`, `list_today`, `list_upcoming`, `complete_task`, `update_task`, `delete_task`, `break_down`, `search`, `fetch` |
| Auth | Sign in with a URL (OAuth 2.1 with S256 PKCE), or paste your own token |
| Price | Every tool is free. None needs Premium. |
| Source | [`server/src/mcp.ts`](../server/src/mcp.ts), [`server/src/oauth.ts`](../server/src/oauth.ts), [`server/src/mcp-grants.ts`](../server/src/mcp-grants.ts) |

There are two ways to connect, depending on what your client can do:

- **Sign in with a URL (recommended).** For connector screens such as **claude.ai**, **Claude
  Cowork** and **ChatGPT**: paste one URL, sign in with a code from your email, allow it, done.
  This is the OAuth path, and it keeps itself refreshed.
- **Paste a token.** For developer clients that can send their own header: **Claude Code**,
  **Claude Desktop** (through a small bridge), **Cursor** and the **MCP Inspector**. This is the
  original path and still works unchanged. The token lasts about an hour.

---

## Connect with a URL (claude.ai, Cowork, ChatGPT)

You need an existing DoubleDone account. If you have never signed in, open the app once and sign
in with your email first. A connector is not a place to make a new account.

### claude.ai and Claude Cowork

1. Open **Settings → Connectors → Add custom connector**.
2. Name it `DoubleDone`, with the URL `https://api.doubledone.app/mcp`.
3. Claude finds that it needs to sign in and opens a small DoubleDone page. Enter your account
   email, then the 6-digit code it sends you.
4. A consent screen says exactly what the connector may do (add, see, change, complete, remove,
   break down and search your tasks, acting as you) and **which host your access will be sent
   to**. Click **Allow**.
5. Ask Claude to *"add 'book the dentist' to my DoubleDone"* or *"what's on my DoubleDone
   today?"*

### ChatGPT

1. Turn on **Settings → Connectors → Advanced → Developer mode**. (ChatGPT moves these menus from
   time to time, so the names may differ slightly.)
2. **Add a connector** with the URL `https://api.doubledone.app/mcp` and auth set to **OAuth**.
3. The same DoubleDone sign-in page appears: email, then the 6-digit code, then **Allow**.
4. In a chat, add the connector and ask it to add or list your tasks. ChatGPT's Deep Research
   uses the `search` and `fetch` tools.

There is no token to copy and nothing to re-paste every hour. The connection refreshes itself.

### Any other OAuth-capable client

A client that speaks Streamable HTTP and OAuth 2.1 can use the same URL. The server publishes
the standard discovery documents and supports dynamic client registration, so a compliant client
finds its own way to the sign-in page. See [How the URL sign-in works](#how-the-url-sign-in-works).

---

## Connect with a token (Claude Code, Claude Desktop, Cursor, Inspector)

Developer clients can send an `Authorization` header, so they use your own token directly, with
no sign-in page.

**Get your token.** In the app, signed in: **Settings → AI → AI agent access (MCP) → Copy my
token**. It lasts about an hour. If your agent stops connecting, copy a fresh one.

**Claude Code** (one command):

```
claude mcp add --transport http doubledone https://api.doubledone.app/mcp \
  --header "Authorization: Bearer YOUR_TOKEN_HERE"
```

**Claude Desktop** talks to local (stdio) servers, so bridge with
[`mcp-remote`](https://www.npmjs.com/package/mcp-remote). Edit `claude_desktop_config.json`
(**Settings → Developer → Edit Config**):

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

**Cursor** uses the same URL and the same header. Add it to `.cursor/mcp.json` in a project, or
`~/.cursor/mcp.json` for every project:

```json
{
  "mcpServers": {
    "doubledone": {
      "url": "https://api.doubledone.app/mcp",
      "headers": { "Authorization": "Bearer YOUR_TOKEN_HERE" }
    }
  }
}
```

**MCP Inspector** (`npx @modelcontextprotocol/inspector`): set the transport to **Streamable
HTTP** and the URL to the endpoint above. Add the header `Authorization: Bearer <your token>`
**before connecting**. The server answers any request with no bearer at all with a `401` (that
`401` is how the OAuth sign-in starts), so even discovery needs the header.

**Anything else** that speaks Streamable HTTP and can send a custom header works the same way.
To try it by hand:

```bash
curl -s https://api.doubledone.app/mcp \
  -H "Authorization: Bearer $TOKEN" -H "content-type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_today","arguments":{}}}'
```

---

## Tools

| Tool | Arguments | Does |
|---|---|---|
| `add_task` | `title`, plus an optional `due` **or** `repeat` (not both) | Adds a task. |
| `list_today` | none | Lists what is open on your Today, each with its id. |
| `list_upcoming` | optional `days` (1 to 30, default 7) | Looks ahead over the coming days. Read-only. |
| `complete_task` | `id`, plus an optional `day` | Marks a task done. A repeat is ticked for one day. |
| `update_task` | `id`, plus any of `title`, `due`, `repeat`, `done` (with an optional `day`) | Changes a task. |
| `delete_task` | `id` | Removes a task as a soft delete, never a hard one. |
| `break_down` | `task`, plus an optional `context` and `steps` (2 to 10) | **Proposes** small steps for a dreaded task. Adds nothing. |
| `search` | `query` | Searches your open tasks (for ChatGPT Deep Research). Read-only. |
| `fetch` | `id` | Fetches one task (for ChatGPT Deep Research). Read-only. |

Replies are short, plain sentences in keeping with the app, such as "Added …", "Marked it done.
Nice." and "Nothing on today. Enjoy the quiet." Ids are opaque strings. Tasks made through MCP
start `mcp-`.

### `add_task`

- `title` (required): the task's words, trimmed, not empty.
- `due` (optional): a real calendar day, `YYYY-MM-DD`, for a one-off. A day of today or earlier
  shows on Today, as in the app.
- `repeat` (optional): a repeat rule (see [Recurrence](#recurrence)).
- With neither, the task is undated, which puts it on your Today.

Replies `Added "Book the dentist" to today.`, `Added "Renew the rego" for 2026-10-20.` or
`Added "Water the plants", repeating.`

### `list_today`

Your open one-offs that are undated or due today or earlier, plus each repeating task that is
due today and not yet ticked or skipped today, marked `(repeats)`. One line per task, oldest
first, each ending in its id in square brackets, ready for `complete_task`. The hidden umbrella
of a broken-down task is left out, so an agent sees the steps to act on, as you do in the app.

### `list_upcoming`

Your open one-offs dated **after today**, up to and including today plus `days`, and the next
occurrence of each repeat inside that window, in date order. Each line names the task, the day it
lands and its id. A repeat already ticked or skipped for its next day shows the one after, if it
falls in the window. `days` is a whole number from 1 to 30, defaulting to 7. At most 40 lines are
shown, then "…and N more."

### `complete_task`

- `id` (required): from `list_today`, `list_upcoming` or `search`.
- `day` (optional): a real calendar day, `YYYY-MM-DD`. Used only for a repeat.

A one-off closes ("Marked it done. Nice."). A **repeating** task is ticked for one day and comes
back on its next day ("Ticked for 2026-10-06. It repeats, so it will be back on its next
day."). Completing never closes a repeat. To stop one, use `update_task` with `repeat: null`.
The day defaults to the **UTC** calendar day and the reply always names it, so an agent that
knows your local date can pass `day` next time. Ticking the same day of a repeat twice says it
was already ticked and changes nothing.

### `update_task`

- `id` (required).
- `title`: a new, non-empty title.
- `due`: a real calendar day, `YYYY-MM-DD`, or `null` to clear the date. Setting a day stops any
  repeat.
- `repeat`: a repeat rule, or `null` to stop repeating. Setting a rule clears the due day.
- `done`: `true` ticks it (a repeat for one day), `false` reopens a one-off or un-ticks a day on a
  repeat.
- `day`: with `done`, the day to tick or un-tick on a repeat. Defaults to the UTC day.

At least one change is required. Field changes land first, and then `done` is applied to the
task as it now stands, so `{ "repeat": null, "done": true }` stops the repeat and closes the
one-off it becomes. An un-tick on a repeat holds **on the server only**: a device that already
synced the tick brings it back on its next open, because the app keeps ticks on purpose. Replies
"Updated.", or a tick, reopen or un-tick reply when `done` is involved.

### `delete_task`

Removes a task by setting its tombstone, the same soft delete the app uses, so the removal syncs
to your devices and nothing is destroyed. Replies "Removed."

### `break_down`

- `task` (required): the dreaded or vague task, up to 2,000 characters.
- `context` (optional): anything that would help, such as a constraint or how far along it is, up
  to 2,000 characters.
- `steps` (optional): a whole number from 2 to 10, a hint at how many steps you would like.

It asks Claude for 3 to 6 short steps in the order you would actually do them, each starting
with a verb, with a first step of about two minutes and an honest estimate in minutes for each.
`steps` nudges that count without overriding it. Unlike the app's Break it down, it asks no
qualifying questions first, so use `context` for anything that matters.

It **only proposes**. The reply lists the steps and ends "Nothing's been added yet. Say the word
and I'll add these." The tool's description tells the agent to show them to you and to call
`add_task` for each step only once you agree. This is the one tool that spends AI time, so it carries the limits in
[Limits and cost guards](#limits-and-cost-guards). As with the app's own AI features, the task
text goes to Anthropic's Claude to write the steps, and a copy of it is kept in DoubleDone's
AI-call log without your account, name or network address (your `context` and the steps
themselves are not kept there). See the [privacy policy](https://doubledone.app/privacy).

### `search` and `fetch`

These two complete OpenAI's Deep Research connector contract, and any client may use them.

- **`search`** takes `query` and matches it, ignoring case, against the titles of your open
  tasks, up to 20 results, oldest first. An empty query returns your first 20 open tasks. The
  reply's text is JSON: `{"results":[{"id":"…","title":"…","url":"https://doubledone.app"}]}`.
- **`fetch`** takes an `id` and looks up that task, whatever its state. The reply's text is JSON:
  `{"id":"…","title":"…","text":"…","url":"https://doubledone.app"}`, where `text` is the title
  followed by a short status: `on today`, `due YYYY-MM-DD`, `repeats` or `done`.

> **The miss path is deliberate.** `search` returns the well-formed empty shape
> (`{"results":[]}`) when the lookup fails, so Deep Research does not choke. `fetch`
> returns a well-formed empty document (`{"id":"…","title":"Not found","text":"This task is no
> longer available.","url":"https://doubledone.app"}`) rather than an off-contract error object
> when an id does not resolve. Every reply stays shape-valid. The trade-off is that a brief
> outage reads the same as "no matching tasks".

---

## Recurrence

`add_task` and `update_task` take the same `repeat` rule as the REST API:

```json
{ "kind": "daily" }
{ "kind": "weekly", "weekdays": [1, 3, 5] }
{ "kind": "every_n_days", "days": 3, "start": "2026-10-10" }
{ "kind": "monthly", "day": 1 }
```

- `weekly` needs a non-empty `weekdays` list, `0` = Sunday to `6` = Saturday.
- `every_n_days` needs `days`, a whole number of 1 or more, counted from `start` (or today).
- `monthly` takes an optional `day` from 1 to 31, defaulting to the day of the month of `start`,
  or of today. A month with no such day uses its **last** day, so a monthly task is never
  skipped.
- `start` is an optional `YYYY-MM-DD` day the repeat begins, defaulting to today (UTC).

An unreadable rule gets a calm error reply naming the kinds it accepts. One function,
`buildRecurrence` in [`server/src/cadence.ts`](../server/src/cadence.ts), translates every rule
for both surfaces, and the Worker decides "is it due today" with the same maths the app uses. So a
repeat an agent makes behaves exactly like one you make in the app. The full table, including the
stored shape, is in the [REST API's Recurrence section](api.md#recurrence).

---

## Days and time zones

The server's "today" is the **UTC** calendar day at the moment of the call. That covers
`list_today`, the start of the `list_upcoming` window, a repeat's default start and a tick's
default day. In Melbourne it is still yesterday's date until 10 am, or 11 am during daylight
saving. An agent that knows your local date should pass it as `day` when ticking a repeat, and the
tick replies always name the day used, so a wrong guess is visible.

---

## Replies and errors

- **A tool that cannot do what was asked** answers with a normal tool result marked
  `isError: true` and one plain sentence: a missing title, a bad date, a task that cannot be
  found, a limit reached, or a brief outage ("Could not add it just now. Try again.").
- **An expired or invalid pasted token** gets an `isError` result saying so and pointing to
  Settings to copy a fresh one. (A pasted string that is not shaped like a token at all is
  treated as a URL-connection token, so it gets the `401` below instead.)
- **A URL connection the server cannot turn into a live session** (after you disconnect, after
  Supabase refuses the stored session, or for a moment while a refresh cannot get through) gets
  HTTP `401` with `error="invalid_token"` and a `WWW-Authenticate` header pointing at the resource
  metadata, so the connector re-authorises rather than stalling.
- **JSON-RPC errors** are kept for protocol problems: `-32700` for a body that is not JSON,
  `-32601` for an unknown method, `-32603` if the server is not configured.

---

## Limits and cost guards

| What | Limit | Applies to |
|---|---|---|
| `break_down` per person | 20 calls in each clock hour (UTC) | Both connect paths |
| `break_down` per network address | 30 a minute, counted separately from the app's own AI features | Pasted-token path |
| `break_down` input | `task` and `context` up to 2,000 characters each | Both |
| Sign-in codes | 5 code requests a minute per network address | The URL sign-in page |
| Request size | A declared request over 2,000,000 bytes is refused with `413` | Everything |
| Every other tool | No limit set by the Worker | Both |

The `break_down` checks all run before any AI is called. A call counts against the hourly limit
once it passes the size and per-address checks. If the counter cannot be read, `break_down`
refuses rather than spend without a working limit. A refusal reads "Let's pause breaking things
down for a bit. Try again shortly." and is marked `isError`, so an agent loop stops instead of
calling again.

---

## Security model

The design is the same on both paths: **the server never holds a key that can reach your data
on its own.** Every task call is made with your own Supabase session, so the database's row-level
security scopes it to exactly your rows. The server cannot see or touch anyone else's tasks, and
cannot act as an admin.

- **Verified before every tool call.** Before any tool runs, the Worker verifies the Supabase
  token's signature against Supabase's published keys, its issuer and its expiry
  ([`server/src/verify.ts`](../server/src/verify.ts)). Decoding a token without checking it never
  decides who is asking.
- **Token path.** The bearer you paste *is* your session's access token, and the server makes each
  call with it.
- **URL path.** Signing in hands the server custody of your session (below). The connector itself
  only ever holds the sign-in service's own tokens, never your Supabase session.

### How the URL sign-in works

1. A connector calls `/mcp` with no token and gets a `401` whose `WWW-Authenticate` header points
   at the protected-resource metadata
   (`https://api.doubledone.app/.well-known/oauth-protected-resource/mcp`).
2. It reads the authorisation server metadata
   (`https://api.doubledone.app/.well-known/oauth-authorization-server`) and registers itself at
   `/register` (dynamic client registration).
3. It sends you to `/authorize`. A request without an S256 PKCE code challenge is refused there,
   with `invalid_request` sent back to the connector. The implicit flow and plain PKCE are off.
   The one scope is `tasks`.
4. **Email.** You enter your DoubleDone email. A code is sent only to an existing account, and the
   page moves on to the code screen whatever the answer, so it cannot be used to find out whether
   someone uses DoubleDone. Codes are limited to 5 a minute per network address.
5. **Code.** You enter the code, which Supabase checks.
6. **Consent.** The page names the connector, says what it may do, and shows **the host your
   access will be sent to**. A connector's display name is not trusted on its own, so a
   look-alike name cannot quietly send your access elsewhere. Between the code and your click, the
   new session rides the page encrypted, and it is good for 10 minutes. **Cancel** sends
   `access_denied` back to the connector and signs out the session made for it (that one only, so
   your app stays signed in). **Allow** verifies the session again before anything is issued.
7. The connector exchanges its code at `/token` with its PKCE verifier and then calls `/mcp` with
   its own token.

### What the server keeps for a URL connection

One row per connection in the Worker's database (`mcp_grants`,
[`server/src/mcp-grants.ts`](../server/src/mcp-grants.ts)):

- your account id and email address,
- your rotating Supabase refresh token, **encrypted** with AES-GCM under a 256-bit key held as a
  Worker secret, with a fresh IV each time (never stored in plain text, never logged),
- a cached short-lived access token, kept as it is so not every call needs a refresh, and when it
  expires.

When a call arrives and the cached token has less than a minute left, the Worker refreshes the
session first. If Supabase rejects the refresh as dead (a `401`, `403` or `404`), or the stored
token will not decrypt, the connection is marked dead and the connector is told to sign in again. A brief failure (a network blip, an outage) never marks a
connection dead: that call is refused and the next one tries again. When a connector signs in
again under the same client registration, its earlier connection is retired.

### Disconnecting

- **URL path.** **Settings → AI → AI agent access (MCP) → Disconnect AI connectors** deletes the
  server's custody of every connector session you have, at once. The next tool call fails and the
  connector must sign in again. Removing the connector in Claude or ChatGPT also stops it from
  their side. Under the hood this is `POST /mcp/disconnect` with your own token, which answers
  `{ "ok": true, "disconnected": <number removed> }`.
- **Token path.** A copied token works until it expires, about an hour. There is no early revoke:
  signing out ends the session's refresh tokens, not an access token already copied, and
  Disconnect AI connectors does not touch it. Treat a copied token like a password for that hour.

---

## What MCP does not expose

The tools read and write only your own rows in your own task list. Left out on purpose:

- **Where you left off.** The one-line note you keep on a task in the app (new in 1.8.0) is never
  returned to an agent and cannot be written by one. Every read names its columns and that note is
  not among them, and every reply is built only from titles, ids, days, fixed wording and, for
  `break_down`, the steps it proposes.
- **Shared lists (Ours).** No tool reads or writes a shared list, so your partner's list and words
  are out of reach. A task you have brought from Ours onto your own Today is a row in your own
  list, so an agent sees it like any other task you own.
- **Anyone else's data.** Your verified session plus row-level security scopes every call to your
  account.
- **The app's working detail.** Pins, "a lot" marks, parts tracked on a task, effort estimates,
  the bookkeeping behind a broken-down, tiny or combined task, and per-day tick and skip lists
  stay in the app. (The tick and skip lists are read to decide what is due, never shown.)
- **The rest of the app.** Routines, rhythms, scrapbooks, settings, Premium and billing are not on
  this server. Skipping a day of a repeat is app-only too.
- **AI steps added without a yes.** `break_down` never writes. Its steps reach your list only if
  the agent then calls `add_task` for them. Delete is a soft tombstone, so nothing here
  shames a backlog or deletes anything for real, in keeping with the app.

---

## Protocol details

| Method | Behaviour |
|---|---|
| `initialize` | Returns `protocolVersion` (yours if you sent one, else `2025-06-18`), `capabilities: { tools: {} }` and the server info, plus a fresh `Mcp-Session-Id` header. The server is stateless: the id is not stored, any id you echo back is accepted, and the bearer token is the only auth. |
| `tools/list` | The nine tools with their JSON Schemas. |
| `tools/call` | Verifies the token, then runs the tool. |
| `ping` | Returns `{}`. |
| `notifications/*` | `202` with no body. |

- Only `POST` carries messages (plus `OPTIONS` for preflight). Anything else answers `405`. There
  is no server-sent-events stream: every reply is a single JSON response.
- Every request needs a bearer. With none, the answer is the `401` that starts the URL sign-in.
- CORS is open to any origin, with `Mcp-Session-Id` exposed so a browser client (claude.ai on the
  web) can hold the session. The token is the auth, not the origin.

---

## Where the code lives

| File | What it holds |
|---|---|
| [`server/src/mcp.ts`](../server/src/mcp.ts) | The JSON-RPC handler, the nine tools, replies and the `break_down` limits |
| [`server/src/oauth.ts`](../server/src/oauth.ts) | The URL sign-in: the provider setup, the email, code and consent pages, PKCE, and `/mcp/disconnect` |
| [`server/src/mcp-grants.ts`](../server/src/mcp-grants.ts) | Encrypted session custody and refresh |
| [`server/src/cadence.ts`](../server/src/cadence.ts) | `buildRecurrence`, the due-today maths and the per-day tick, shared with the REST API |
| [`server/src/verify.ts`](../server/src/verify.ts) | Token verification |
| [`server/src/decompose.ts`](../server/src/decompose.ts) | The step-writing prompt `break_down` uses |
| [`server/src/index.ts`](../server/src/index.ts) | How `/mcp` is routed between the two connect paths |

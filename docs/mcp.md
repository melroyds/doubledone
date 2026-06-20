# DoubleDone MCP server

A small remote [MCP](https://modelcontextprotocol.io) server so an AI agent (Claude
Desktop, the MCP Inspector, anything that speaks MCP) can manage your DoubleDone
tasks: add them, see today's, tick them off. It runs on the same Cloudflare Worker
as the AI backend, holds no elevated key, and acts only as **you**.

## Endpoint

```
https://doubledone-ai.melroy-a02.workers.dev/mcp
```

Transport: MCP Streamable HTTP (JSON-RPC 2.0 over a single POST).

## Auth: your token

Every task call carries a bearer token: your own Supabase access token. The server
proxies each call to the database **with that token**, so row-level security scopes
it to exactly your rows. The server can never see or touch anyone else's tasks.

Get your token in the app: **Settings → AI agent access (MCP) → Copy my token**
(you must be signed in). It refreshes about hourly; re-copy it if your agent stops
connecting. Discovery (listing the tools) needs no token; acting on tasks does.

## Tools

| Tool | Arguments | Does |
|---|---|---|
| `add_task` | `title` (string) | Adds a one-off task to your today list. |
| `list_today` | none | Lists your open, non-future, non-recurring tasks, each with its id. |
| `complete_task` | `id` (string, from `list_today`) | Marks that task done. |

## Connect Claude Desktop

Claude Desktop talks to stdio MCP servers, so bridge to this HTTP one with
[`mcp-remote`](https://www.npmjs.com/package/mcp-remote). Edit your
`claude_desktop_config.json` (Settings → Developer → Edit Config):

```json
{
  "mcpServers": {
    "doubledone": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://doubledone-ai.melroy-a02.workers.dev/mcp",
        "--header",
        "Authorization: Bearer YOUR_TOKEN_HERE"
      ]
    }
  }
}
```

Paste your token in place of `YOUR_TOKEN_HERE`, restart Claude Desktop, and ask it to
"add "book the dentist" to my DoubleDone" or "what's on my DoubleDone today."

## Try it without a client (MCP Inspector)

```
npx @modelcontextprotocol/inspector
```

In the Inspector: Transport = **Streamable HTTP**, URL = the endpoint above. Add a
header `Authorization: Bearer <your token>` for the task tools. `initialize` and
`tools/list` work with no header; `tools/call` needs the token.

## Notes and limits

- **One-offs for now.** `list_today` returns one-off tasks (open, due today or
  undated). Recurring tasks need cadence logic the database query can't express, so
  v1 leaves them to the app. A later version can surface today's recurrences.
- **No elevated key.** The server holds the public anon key only; your token does the
  authorising. Nothing here can read or write another account's data.
- **Calm by default.** Tool replies are short and plain ("Added …", "Marked it done.
  Nice.", "Nothing on today. Enjoy the quiet."), in keeping with the app.

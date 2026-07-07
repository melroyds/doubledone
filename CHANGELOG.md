# Changelog

All notable changes to this project are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) ·
versioning: [SemVer](https://semver.org/).

> Add an entry under `[Unreleased]` with every feature/fix. On release, move them
> into a dated, versioned section.

## [Unreleased]

_Post-v1 work lands here._

## [1.1.0] - 2026-07-07

_The agent + developer surface reaches parity: the public REST API is now a Swagger-documented CRUD-plus-query surface, and the MCP server grows to nine OAuth-capable tools. Both share one cadence engine, so a repeating task made by an agent, a script, or the app is indistinguishable in shape._

### Added
- **REST API brought to parity** (`/api/v1`, **OpenAPI 3.1**, version 1.1.0) with a browsable **Swagger UI** at `/api/v1/docs`. Token-authenticated CRUD-plus-query over a user's own tasks, scoped entirely by Supabase RLS through the user's own access token (no elevated key). A task now carries a normalised `recurrence` object (or null) and a plain-English `repeats` summary (or null); a task is never both dated and recurring. `POST /tasks` defaults to today and optionally takes a future due day **or** a repeat rule (daily, weekly with weekdays, or every-N-days), never both; `PATCH /tasks/{id}` updates title / done / due / repeat, where setting a due day clears any repeat and vice versa, and either clears with `null`. `GET /tasks` supports three read modes in precedence order: `q` substring search over open tasks, an `upcoming` look-ahead window (1–30 days, default 7), and the app's `today` view.
- **MCP server expanded to nine tools**: `add_task` (with optional due date and repeat cadence), `list_today`, `list_upcoming`, `complete_task`, `update_task`, `delete_task`, `break_down` (the propose-only Break-it-down engine, per-user hourly rate cap before any spend), plus `search` and `fetch` (the OpenAI Deep Research connector contract).
- **OAuth 2.1 for the MCP server**, chosen by bearer shape alongside the existing pasted-JWT path: sign-in-with-a-URL for claude.ai / Cowork / ChatGPT, S256 PKCE required, the user's rotating refresh token AES-GCM-encrypted in D1, and an immediate Disconnect kill switch.

### Changed
- The REST API, the MCP server and the app now share the **same cadence engine** (`buildRecurrence`) and repeat vocabulary on a UTC-calendar-day basis, so a repeating task is identical in shape whichever surface created it.

### Fixed
- Malformed REST input is always answered with a calm `400`, never a `500` or a leaked upstream status.

## [1.0.0] - 2026-06-26

_Live and commercial: DoubleDone shipped to web and Android with real paying Stripe subscribers, a launch control centre, and the full ADHD product seam._

### Added
- **The core loop**: friction-free brain-dump, a Today sized to be doable, tap-to-finish with a soft sage check, gentle close-the-day, and push-a-task-to-tomorrow.
- **AI: Break it down** (the phased planner): three qualifying questions, then a review-and-accept plan; long-horizon tasks return a roadmap and only phase one is broken into steps now. Haiku clarify, Sonnet decompose; dates computed on-device.
- **AI: Sort for me** (triage, Haiku) and **Strategise** (Sonnet) to re-spread an over-full day, always propose-then-accept.
- **Slices** (track a task in parts) and **recurring tasks** (daily / weekly / every-N) with a Repeating drawer. No streaks.
- **The Lookback**: an interactive month calendar of what you finished each day, with a warmer mark for a long-dreaded "big win".
- **The AI scrapbook**: turn a finished week into a calm still-life keepsake (Cloudflare Workers AI), the objects evoking the tasks, with the week's finished tasks listed beneath.
- **Cloud sync (opt-in)**: passwordless email-OTP sign-in, last-write-wins sync, soft-delete tombstones, anonymous→account migration. Local-first throughout.
- **MCP server** (`/mcp`): a stateless bearer-token Model Context Protocol server so AI agents can add, list and complete tasks under the user's own RLS.
- **Comfort & access**: light / dark / system theme (Dusk palette), text size, reduce-motion, native fonts (Newsreader + Atkinson Hyperlegible), an accessibility pass, and an opt-in daily reminder.
- **Multi-language** AI replies (English, Italian, Spanish, French).
- **Privacy policy** (in-app + public URL) and **account + data deletion**.
- **The moat**: pseudonymous AI-call telemetry, instrumented from day one.
- **Premium** (Stripe, live): A$5/mo or A$50/yr with a 30-day card-free trial, gating the AI scrapbook, photo-to-tasks OCR, Plan my day, Chart a course, Lookback insights, pinning, and the six non-default themes; a signature-verified webhook writes the entitlement to Cloudflare D1.
- **The launch control centre**: an hourly health sweep emailing the owner on spend / error / abuse breaches, a daily pulse, a dead-man's-switch heartbeat, and Stripe dispute / refund / failed-payment alerts.
- **The ADHD product seam**: Make-it-tiny, the silent-parent breakdown chain, the low-capacity day, the evening wind-down, and Routines (no streak, by data shape).
- **Talk-to-capture** (web Speech), the **public REST API + OpenAPI**, a full **UI design pass** and a marketing landing, the guided **first-run**, **data export**, and **in-app feedback**.
- **i18n foundation**: a typed `t()` layer with English live and Italian / French / Spanish draft catalogs.
- **Terms of Service + refund policy** (in-app + public URL), alongside the privacy policy.
- **End-to-end manual test suite** (`docs/qa/`): 104 cases, fillable `.xlsx` + readable `.md`.
- Initial golden-path scaffold (Inspector, tiered CI, playbook, doc tiers).

### Changed
- Moat telemetry moved from a Supabase table to **Cloudflare D1** (Worker-bound).

### Security
- **AI endpoints locked down**: CORS allowlist + Origin gate + per-IP rate limit.
- **No public telemetry write path**: telemetry is a Worker-bound Cloudflare D1 database (previously a Supabase table written with the public anon key).
- The Anthropic key is isolated to the Worker; the MCP server holds no elevated key (it acts only with the user's own token, under RLS).

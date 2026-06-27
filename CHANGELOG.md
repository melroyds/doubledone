# Changelog

All notable changes to this project are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) ·
versioning: [SemVer](https://semver.org/).

> Add an entry under `[Unreleased]` with every feature/fix. On release, move them
> into a dated, versioned section.

## [Unreleased]

_Post-v1 work lands here._

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

# Changelog

All notable changes to this project are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) ·
versioning: [SemVer](https://semver.org/).

> Add an entry under `[Unreleased]` with every feature/fix. On release, move them
> into a dated, versioned section.

## [Unreleased]

_Post-v1 work lands here._

## [1.2.0] - 2026-07-12

_The Android production release, versionCode 11 (git tag `android-v11`, code-frozen from `d983bbf`), with web deployed from the same code. Rhythms grow up (minutes-granular cadence, fixed times, and exact-alarm delivery that actually arrives on time), the Quiet interface and energy matching land, keepsakes share as a proper page and follow the account, and text shared from any app becomes one calm capture line._

### Added
- **Rhythms** (free): gentle recurring self-care nudges ("some water" every 2 hours, meds at 8 and 8) built as an extension of Routines. Interval cadence on a curated ladder from every 30 minutes to every 12 hours inside an active-hours window, or fixed clock times (up to 8, the meds shape), one-tap Water / Stand / Meds presets plus a fully editable custom form, and pause / resume. Never-shame is structural: the model stores no count, no streak and no history, so there is nothing to break.
- **Exact alarms on Android**: `SCHEDULE_EXACT_ALARM` declared, the real fix for nudges that only fired on app-open (expo-notifications silently falls back to inexact alarms that Doze defers when the permission is absent). Android 12+ gets a calm "Allow alarms & reminders" door (the toggle ships off on Android 14+) that re-arms every schedule the moment the user returns from the toggle; Rhythms get their own HIGH-importance channel (a heads-up peek, tunable alone in system settings); a once-per-app-open resilience sweep quietly re-schedules everything from stored config; and the nudge-health line is one calm sentence, "Next nudge around {time}.", updating in place after any change (deliberately no count).
- **The Quiet interface** (premium): a borderless appearance where nothing looks like a button and the app reads as calm text on paper. Same layout, same features; covers the whole Today surface (rows, capture line, header, the day's load, held-state, coachmark, close-the-day) plus the Settings toggle; derives from the active palette so it is correct on all seven colour themes; the held-state reaches every Standard capability, including a "Select more" door into the bulk actions.
- **Energy matching** (freemium): "What fits right now?" inside Focus mode's picker. One calm question (running low / somewhere in between / feeling good), Haiku picks one task from today's open list with a short warm line, and "Start with this" opens Focus on it. Propose-only, never a reorder. Free gets 15 picks a calendar month, metered locally with gentle reminders at 10 and 5 left; a use is spent only on a successful pick; premium is unlimited.
- **Share-to-capture**: share text into DoubleDone from any app, via the Android share sheet (expo-share-intent) or the installed web app (a PWA `share_target`). Both paths land on the same inbound rule, and the shared text is cleaned to one calm line (the words kept, links and highlight fragments dropped) before seeding the capture box. Nothing is ever auto-added; the user confirms.
- **The keepsake shares as a page**: the scrapbook share is exactly one jpeg with its caption and a small "DoubleDone · Week of {date}" line baked into the pixels (a cream band under the picture), so a receiving app can never strip the context. Native snapshots a hidden page card (react-native-view-shot); web composites the identical page on a canvas. Raw task titles still never leave the device, and it is still never a link.
- **Scrapbooks follow the account**: a `scrapbooks` Supabase table (RLS, per-week last-write-wins by creation time) syncs R2-backed keepsakes across devices, riding behind the task sync and internally caught so it can never fail it. Legacy device-local keepsakes from before R2 persistence stay where they were made.
- **The "big" mark follows the account**: a new nullable Supabase column with plain last-write-wins, plus a one-time tie-seed on first sync so no existing mark is lost.

### Changed
- The energy-matching entry moved from a standalone Today button into Focus mode's "Which one?" picker: choosing what to focus on is the moment the question makes sense, and Today loses a competing button.
- The paywall, onboarding, and the "You're Premium" panel caught up with the release: Quiet, the seven colour themes, and unlimited energy matching are now pitched everywhere Premium is explained, in all four languages.
- The R2 keepsake-image route now sends CORS (`access-control-allow-origin: *`), which the web page-composite fetch requires.

### Fixed
- Sharing into the app on a cold start no longer loses the text: the parked share now seeds the capture box at the exact moment it mounts (a callback ref), however late that is.
- "Share this keepsake" works on Android for R2-persisted images: the native path assumed data:-URL keepsakes only, so an https keepsake reported "Sharing isn't available here"; https images now download to cache and share the same jpeg.
- Toggling Quiet on Android no longer clips task-row bottoms after a Standard → Quiet → Standard round trip (Today remounts on an appearance change, forcing a fresh native layout).
- MCP `list_today` now includes recurring tasks due today, so an agent sees the same Today the app shows.
- Sync: `updatedAt` is monotonic, so an app-side delete or edit can never lose last-write-wins to the MCP Worker's clock; and the cloud sync waits for the local store to load, so a premature sync can never wipe un-pushed deletions.

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

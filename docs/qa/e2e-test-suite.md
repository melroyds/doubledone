# DoubleDone, end-to-end test suite

The readable copy of the manual QA pass. The fillable version with a Result dropdown is `DoubleDone-E2E-Test-Suite.xlsx` (same content, generated from `scripts/gen-test-suite.py`).

**Priorities:** P1 must pass before launch, P2 important polish, P3 edge / nice.


## Capture

| ID | Pri | Platform | Test | Steps | Expected |
|---|---|---|---|---|---|
| CAP-01 | P1 | Both | Add a single task | On Today, tap the capture box, type 'Buy milk', submit. | The task appears in Today immediately. No reload needed. |
| CAP-02 | P1 | Both | Brain-dump several tasks | Enter several tasks in a row (e.g. 5 quick ones). | Each becomes its own task in order. None lost or merged. |
| CAP-03 | P2 | Both | One-off future date ('Date...' chip) | Capture a task, choose the 'Date...' chip, pick a date next week, save. | Task is scheduled for that date and does NOT show in Today until then. |
| CAP-04 | P2 | Both | Schedule chips (Today / Tomorrow / etc.) | Capture a task and pick each schedule chip in turn. | Task lands on the chosen day. Today shows only today's. |
| CAP-05 | P3 | Both | Empty / whitespace capture | Submit an empty box, then a box of only spaces. | Nothing is added. No error, no blank row. |
| CAP-06 | P3 | Both | Very long title | Capture a task with a very long title (a full sentence+). | Wraps or truncates gracefully. No layout break or overflow. |

## Today

| ID | Pri | Platform | Test | Steps | Expected |
|---|---|---|---|---|---|
| TOD-01 | P1 | Both | Complete a task | Tap a task's done control on Today. | Marked done with calm feedback. No shame language anywhere. |
| TOD-02 | P1 | Both | Today is sized to be doable | Add many tasks across days; look at Today. | Today shows today's achievable set, not the entire backlog. |
| TOD-03 | P1 | Both | Push a task to tomorrow | Use the Tomorrow action on a task in Today. | Leaves Today and appears tomorrow. No guilt framing. |
| TOD-04 | P1 | Both | Close the day -> rested state | Tap 'Close the day', read the wrap, then tap 'Goodnight'. | Wrap celebrates what you finished (zero guilt, unfinished never shamed). After Goodnight, Today becomes a calm 'You've closed today' rested screen with the task list + capture hidden. Survives reload. |
| TOD-04b | P2 | Both | Reopen a closed day | From the rested screen, tap 'Reopen today'. | Returns to the normal Today with all tasks intact. (A new calendar day also auto-clears the closed state.) |
| TOD-05 | P2 | Both | Undo a completion | Complete a task, then undo it (toggle back). | Returns to open cleanly. Counts/Lookback stay consistent. |
| TOD-06 | P1 | Both | Persistence across restart | Add tasks, fully close the app/tab, reopen. | Tasks are still there (local-first). Nothing lost. |

## AI decompose

| ID | Pri | Platform | Test | Steps | Expected |
|---|---|---|---|---|---|
| AI-01 | P1 | Both | Break down a dreaded task | Capture 'Do my taxes', tap Break it down, answer any clarifying questions. | Returns small atomic steps and drops them into Today. |
| AI-02 | P2 | Both | Time estimate shows | On the breakdown review, look for the pace/time estimate. | A sensible total estimate is shown (the crowd/pace estimate). |
| AI-03 | P2 | Both | AI egress disclosure at point of use | Open the Break-it-down questions modal. | A calm one-liner discloses the text is sent to an AI and kept anonymously. |
| AI-04 | P2 | Both | Friendly error state | Turn off wifi (or block the AI URL), then Break it down. | A calm friendly error. No raw HTTP/stack. App stays usable. |

## AI triage

| ID | Pri | Platform | Test | Steps | Expected |
|---|---|---|---|---|---|
| AI-05 | P2 | Both | Sort-for-me (triage + discoverability) | In the brain-dump, type 2+ things, one per line. After one line a hint should nudge 'put each on its own line'; at two lines 'Break it down' becomes 'Sort for me'. Run it. | Hint is visible at one line, so Sort is discoverable. Sort returns a sensible ordering/grouping onto Today. Calm, never scolding. |

## AI strategise

| ID | Pri | Platform | Test | Steps | Expected |
|---|---|---|---|---|---|
| AI-06 | P2 | Both | Strategise (chart a course) | When the list feels heavy, run Strategise. | Returns a weighted, ordered plan of action. No overwhelm. |

## Lookback

| ID | Pri | Platform | Test | Steps | Expected |
|---|---|---|---|---|---|
| LB-01 | P1 | Both | Open the calendar | Open the Lookback. Browse to different days/months. | A real Gregorian calendar. Navigation works, no crash. |
| LB-02 | P1 | Both | Completed tasks show on their day | Complete a task today, open the Lookback on today. | The completed task is listed under today. |
| LB-03 | P2 | Both | Old dreaded task is celebrated | Complete a task that is old or high-complexity; view it in the Lookback. | Marked 'a big one' / weighted celebration. Never shamed for being old. |
| LB-04 | P2 | Both | Scheduled tasks show on the calendar | Defer a task to tomorrow (or use 'Date...'), then open the Lookback and tap that future day. | The future day shows an outline marker; tapping it lists the task under 'Scheduled'. |

## Scrapbook

| ID | Pri | Platform | Test | Steps | Expected |
|---|---|---|---|---|---|
| SB-01 | P1 | Web | Make a scrapbook | In a week with completions, tap 'Make a scrapbook'. | Loading shimmer, then a still-life image + caption in the polaroid. |
| SB-02 | P1 | Both | Image surfaces the tasks | Look at the generated image/caption for a known week. | Objects evoke the actual tasks (e.g. laundry -> folded linen). No text in image. |
| SB-03 | P1 | Both | Finished list + 'a big one' | Below the polaroid, read the 'This week you finished' list. | All week's completed titles listed; big wins marked 'a big one'. |
| SB-04 | P2 | Both | Invite state | Open a week that has completions but no scrapbook yet. | Dashed frame + mauve '+', 'Turn this week into a keepsake', and the finished list still shows. |
| SB-05 | P2 | Web | Free-tier limit is graceful | Generate a few scrapbooks in one day (free tier ~1-2/day). | When exhausted, a calm wait/error. No crash, the holder stays intact. |
| SB-06 | P2 | Both | Scrapbook persists | Make a scrapbook, restart the app. | It is still there (device-local). |

## Auth & sync

| ID | Pri | Platform | Test | Steps | Expected |
|---|---|---|---|---|---|
| AUTH-01 | P1 | Both | Email sign-in (OTP) | Sign in, enter your email, get the 6-digit code from your inbox, verify. | Signed in. Settings shows 'Synced to <your email>'. (This emails your inbox.) |
| AUTH-02 | P1 | Both | Local tasks migrate on first sign-in | Have some local tasks, then sign in for the first time. | Local tasks sync into the account. None lost or duplicated. |
| AUTH-03 | P1 | Both | Sync across two devices | Sign in on web and the Android build. Add a task on one. | It appears on the other after sync. |
| AUTH-04 | P2 | Both | Last-write-wins, no dupes | Complete / edit the same task on both devices close together. | State converges. No duplicate rows, no flip-flop. |
| AUTH-05 | P2 | Both | Sign out | Sign out from Settings. | Returns to local/anonymous. No account data left visible. |
| AUTH-06 | P2 | Both | Offline then online | Go offline, add/complete tasks, then reconnect. | Changes sync up on reconnect. Nothing lost. |

## Account deletion

| ID | Pri | Platform | Test | Steps | Expected |
|---|---|---|---|---|---|
| DEL-00 | P1 | Setup | PREREQ: create the delete function | Run the delete_account() function from supabase/schema.sql once in the Supabase SQL editor. | Function created. (One-time setup; cannot be rolled back.) |
| DEL-01 | P1 | Both | Delete account + data | Settings -> Delete account and data -> confirm. (Use a throwaway account first.) | Account and synced data are gone. Returns to a clean, signed-out Today. |
| DEL-02 | P1 | Both | Originating device is wiped | On the device you deleted from, look at Today and the Lookback. | Nothing of the account remains locally. |
| DEL-03 | P3 | Both | Known limit: second device | On a second signed-in device after deletion, observe behaviour. | It keeps local data until its next sync fails auth (documented limitation). |

## MCP

| ID | Pri | Platform | Test | Steps | Expected |
|---|---|---|---|---|---|
| MCP-00 | P1 | Both | PREREQ: copy your token | Sign in, Settings -> AI agent access (MCP) -> Copy my token. | Token copied (web) / shown selectable. Server URL visible. |
| MCP-01 | P1 | Desktop | Connect a client | Add the /mcp server to Claude Desktop via mcp-remote + your token (see docs/mcp.md). | Client connects. Lists 3 tools: add_task, list_today, complete_task. |
| MCP-02 | P1 | Desktop | add_task round-trip | Ask the agent: add 'book the dentist' to my DoubleDone. | Task appears in your Today (web/app) after sync. |
| MCP-03 | P1 | Desktop | list_today | Ask the agent: what's on my DoubleDone today? | Returns your open tasks, each with an id. |
| MCP-04 | P1 | Desktop | complete_task | Ask the agent to complete one of the listed tasks by id. | Marked done; reflects in the app after sync. |
| MCP-05 | P2 | Inspector | No-token gate | In the MCP Inspector, call a tool WITHOUT the Authorization header. | Calm 'Not connected' result (isError). Nothing in your account changes. |
| MCP-06 | P2 | Desktop | Expired token re-copy | Use a token older than ~1 hour, then re-copy a fresh one. | Stale token fails cleanly; fresh token works. No data exposed. |

## Settings

| ID | Pri | Platform | Test | Steps | Expected |
|---|---|---|---|---|---|
| SET-01 | P1 | Both | Theme light / dark / system | Switch theme between Light, Dark, and System. | Applies immediately. Dusk palette correct in both; System follows the OS. |
| SET-02 | P2 | Both | Text size small / default / large | Change text size across all three. | App scales. No clipping or broken layout at large. |
| SET-03 | P2 | Both | Motion -> Reduce | Set Motion to Reduce. | Gentle fades and scrolling titles stop. |
| SET-04 | P2 | Both | Privacy & data link | Tap 'Privacy & data' in Settings. | Opens the privacy screen. |

## Accessibility

| ID | Pri | Platform | Test | Steps | Expected |
|---|---|---|---|---|---|
| A11Y-01 | P2 | Android | Screen reader (TalkBack) | Enable TalkBack, navigate Today and capture. | Controls are labelled. Dates read in a friendly way. |
| A11Y-02 | P2 | Both | Touch targets | Tap the small controls (done, chips, actions) with a thumb. | Comfortable to hit. No fiddly mis-taps (hitSlop adequate). |
| A11Y-03 | P3 | Both | Large text does not clip | Set text size Large and walk every screen. | Nothing important truncated or overlapping. |

## Visual

| ID | Pri | Platform | Test | Steps | Expected |
|---|---|---|---|---|---|
| VIS-01 | P1 | Android | Native fonts render | On the Android build, look at headers and body text. | Serif (Newsreader) headers, Atkinson body, correct bold weights. |
| VIS-02 | P2 | Android | Dark palette on device | Switch to Dark on the Android build. | Dusk dark, comfortable contrast, no harsh pure-black/white. |
| VIS-03 | P2 | Android | Bold body text renders | Find bold body text (e.g. emphasised labels) on Android. | Bold reads as truly bold (the bodyBold fix), not faux/again-regular. |

## Reminders

| ID | Pri | Platform | Test | Steps | Expected |
|---|---|---|---|---|---|
| REM-01 | P1 | Android | Daily reminder fires | Set up the daily reminder; wait for its time (or trigger the channel). | A calm notification arrives at the right time. |
| REM-02 | P2 | Android | Reminder channel present | Android Settings -> Apps -> DoubleDone -> Notifications. | A DoubleDone reminder channel exists and is controllable. |

## Privacy

| ID | Pri | Platform | Test | Steps | Expected |
|---|---|---|---|---|---|
| PRV-01 | P1 | Both | Privacy policy reachable | Visit doubledone.app/privacy (and via Settings). | Loads, plain-English, matches the privacy posture. |

## Deploy

| ID | Pri | Platform | Test | Steps | Expected |
|---|---|---|---|---|---|
| DEP-01 | P1 | Web | Web loads + deep links | Open doubledone.app, then hard-load /privacy and /sign-in directly. | App loads; deep links resolve (SPA fallback), no 404. |
| DEP-02 | P1 | Android | Android APK installs + launches | Sideload the latest APK and open it. | Installs and runs. Core loop works. |
| DEP-03 | P2 | Both | Local-first offline | Use core features (add/complete) with no network. | Works offline; syncs later when signed in. |

## Premium

| ID | Pri | Platform | Test | Steps | Expected |
|---|---|---|---|---|---|
| PREM-00 | P1 | Setup | PREREQ: Stripe test keys + webhook | Set STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET as Worker secrets; register the /stripe-webhook URL in the Stripe sandbox. | Worker deployed with the keys; webhook endpoint registered and reachable. |
| PREM-01 | P1 | Both | Paywall renders | Open Settings -> DoubleDone Premium. | The calm 'Keep every week' pitch, the A$5/mo price, the 1 -> 2 -> 4 tenure tiers. |
| PREM-02 | P1 | Both | Free monthly gate routes to the paywall | As a free user who already made a scrapbook this month, tap 'Make a scrapbook'. | Routed to the Premium paywall, calm, never a shaming message. |
| PREM-03 | P1 | Web | Checkout with a test card | Signed in, tap Go Premium, pay with Stripe test card 4242 4242 4242 4242 (any future expiry, any CVC). | Stripe Checkout opens, payment succeeds, returns to /premium?status=success. |
| PREM-04 | P1 | Both | Entitlement flips to premium | After the test checkout, reopen Premium and the Lookback. | Premium shows active; the scrapbook is no longer monthly-gated (now weekly). |
| PREM-05 | P2 | Both | Premium weekly wait stays calm | As premium, make this week's allowance of scrapbooks, then try one more. | A calm 'next ready in N days' message, never a paywall. |
| PREM-06 | P2 | Worker | Webhook rejects a bad signature | POST a forged event to /stripe-webhook with no valid Stripe-Signature. | 400 bad signature; no entitlement change. |
| PREM-07 | P1 | Web | Webhook delivery succeeds (Stripe side) | After the test checkout, open the Stripe event destination's delivery log. | The checkout/subscription events show 'delivered' with a 200 from the Worker. |
| PREM-08 | P1 | Web | Manage subscription opens the billing portal | As premium: /premium -> Manage subscription. | Redirects to the Stripe Billing Portal (cancel / update card / invoices). |
| PREM-09 | P1 | Web | Cancel reverts to free | In the portal, cancel immediately, then return to the app. | Entitlement flips to free; the scrapbook is monthly-gated again; tenure (started_at) is preserved. |
| PREM-10 | P2 | Web | Premium screen shows the renew / cancel date | As premium, open /premium; then schedule a cancel-at-period-end in the portal and reopen. | Reads 'Renews <date>' when active, and 'Premium until <date>, then free' when a cancel is scheduled. |

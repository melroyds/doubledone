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
| CAP-07 | P2 | Web | Talk-to-capture: speak a brain-dump (web) | On the web app in Chrome / Edge / Safari, tap the '🎤 Speak' button under the capture box and allow the mic. Say a few tasks, pausing between each, then tap 'Listening… tap to stop'. | Each spoken phrase lands on its own line; two or more lines surface 'Sort for me', which sorts them as normal. The browser does the speech-to-text (no audio reaches our servers), so only text leaves the device, and only if you Sort. Tapping stop returns the button to 'Speak' and keeps the captured lines. |
| CAP-08 | P3 | Both | Talk-to-capture hides where unsupported | Open the web app in Firefox (no Web Speech API), and separately open the Android app. | The '🎤 Speak' button is simply absent (no error, no setting) on Firefox and on native Android, where the Gboard keyboard mic already dictates into the box. |
| CAP-09 | P2 | Both | Tidy a run-on or rambly line into tasks (AI) | Type or speak a single long line, either several things ('buy milk and walk the dog and email Sarah') or one rambly thought ('I feel like I want to do something fun'), then tap 'Tidy this into tasks'. | The line is replaced by clean task(s) in your own words, nothing invented or reordered. A run-on becomes several lines (and 'Sort for me' appears); a single rambly thought becomes one tidy task ('do something fun'). On failure it degrades calmly ('Couldn't tidy that just now'), text kept. Works on web and Android. Needs the Worker deployed with /split. |

## Today

| ID | Pri | Platform | Test | Steps | Expected |
|---|---|---|---|---|---|
| TOD-01 | P1 | Both | Complete a task | Tap a task's done control on Today. | Marked done with calm feedback. No shame language anywhere. |
| TOD-02 | P1 | Both | Today is sized to be doable | Add many tasks across days; look at Today. | Today shows today's achievable set, not the entire backlog. |
| TOD-03 | P1 | Both | Push a task to tomorrow | Use the Tomorrow action on a task in Today. | Leaves Today and appears tomorrow. No guilt framing. |
| TOD-04 | P1 | Both | Close the day -> rested state | Tap 'Close the day', read the wrap, optionally type a final win in 'Anything else you did?', then tap 'Goodnight'. | Wrap celebrates what you finished (zero guilt, unfinished never shamed). Any text in 'Anything else you did?' is logged as a completed task. After Goodnight, Today becomes a calm 'You've closed today' rested screen with the task list + capture hidden. Survives reload. |
| TOD-04b | P2 | Both | Reopen a closed day | From the rested screen, tap 'Reopen today'. | Returns to the normal Today with all tasks intact. (A new calendar day also auto-clears the closed state.) |
| TOD-05 | P2 | Both | Undo a completion | Complete a task, then undo it (toggle back). | Returns to open cleanly. Counts/Lookback stay consistent. |
| TOD-06 | P1 | Both | Persistence across restart | Add tasks, fully close the app/tab, reopen. | Tasks are still there (local-first). Nothing lost. |
| TOD-07 | P2 | Both | Tap-and-hold a task -> selection | Press and hold a task. It enters selection with that task already ticked and the action bar appears. | With one selected the bar offers Done / Tomorrow / Move to... / Break down / Remove (Break down is single-task only); Remove is the brick 'danger' colour. There is no separate long-press menu any more. |
| TOD-08 | P2 | Both | Shame-free re-entry after a gap | Simulate not opening the app for 4+ days (set localStorage 'doubledone.lastopen.v1' to a date 5+ days ago), then reload Today. | A calm 'Welcome back, the past is fine, here's just today' card appears above Today, never '47 overdue'. 'Start fresh' dismisses it; reopening same-day does not re-show it. |
| TOD-09 | P2 | Both | Log an off-list thing you did | Tap '+ I also did that' (beneath the task list), type something you did, then Add it. | It appears checked on Today and in the Lookback for today, counted as a completion, never as an unfinished task. |
| TOD-10 | P2 | Both | Focus mode: pick-and-go | Tap 'Focus on one thing' (the prominent entry above the list). On 'Which one?' pick a task; try 'Done' (complete), 'Choose another' (back to the list), and Exit. | Full-screen single task, everything else hidden. Done completes it and returns to 'Which one?'; Choose another returns without completing; Exit closes. When none left: 'That's everything for now.' |
| TOD-11 | P3 | Both | Weight-of-today gauge | Add a few tasks and watch the slim gauge under 'Just today'. | A calm bar + warm label ('A gentle day. Room to breathe.' up to ~4, then 'A full day, but doable.', then 'A lot on. Be gentle with yourself.') reflects the count of unfinished one-offs, honest, never alarming, hidden on a clear day. |
| TOD-12 | P2 | Both | Multi-select bulk actions | Tap-and-hold a task to enter selection, tap more to add them (or 'Select all'), then use the bar: Done / Tomorrow / Move to... / Remove. Cancel exits. | Rows become checkboxes, the count updates, 'Break down' hides once more than one is selected, the bulk action applies to all at once and exits select mode. |
| TOD-13 | P2 | Both | Move selected tasks to a chosen day | Tap-and-hold to select one or more tasks, tap 'Move to...', then pick 'This weekend', 'Next week', or a calendar day. | Selected one-offs move to that date and wait in the Later list until then (recurring tasks are left alone); select mode exits. |
| TOD-14 | P2 | Both | Low-capacity day (gentle recalibration) | Under the weight gauge, tap 'Low on energy? Make it a low day'. | The gauge recalibrates to a gentler capacity (the same task count reads as fuller) and the label gives permission ('A low day. A couple of things is plenty.', up to 'Just pick one, the rest waits.'). A brief affirmation shows. The backlog is untouched, nothing is deferred or shamed. The toggle reads 'Back to a normal day' to undo, and the state self-clears at midnight (per-day, never a setting). |
| TOD-15 | P3 | Both | Evening wind-down nudge | Open the app in the evening (after 6pm) with the day not yet closed. | A calm line appears above 'Close the day' ('Evening's here. Close the day when you're ready, even a little counts.'), inviting the closing ritual. It is in-app only (no notification), never shaming, and absent during the day. |
| TOD-16 | P2 | Both | Rooms pill, phase greeting, soft cards (Today reborn) | Look at the Today header and the line under 'Today'. Tap the 'Rooms' pill, then a room. Open the app at different times of day. | The header shows the date plus one 'Rooms' pill (three dots and a label), never the old four-link row that wrapped on narrow phones. Tapping Rooms opens a calm bottom sheet listing Repeating, Routines, Lookback, Settings (each with a one-line hint); tap one to go, tap the scrim to close. The greeting under 'Today' changes with the clock: 'Good morning/afternoon. Just today.', 'Winding down. Just today.' in the evening, a restful line late at night. Task rows sit on a soft shadow, floating a hair above the living background. |
| TOD-17 | P2 | Both | Bring a Later task forward to today | Schedule a task for a future day (capture with 'Date...', or push one to Tomorrow) so it sits in the 'Later' list. Tap the 'Bring to today' link under it. | The task moves out of Later and into Today immediately (its due becomes today). The link disappears once it is in Today. No shame framing, just a quiet pull-forward, the mirror of pushing to tomorrow. |
| TOD-18 | P3 | Both | Secondary actions read as tappable (not labels) | Look at the quiet text actions: 'Done adding' (open the capture drawer), 'Sync across devices' and the daily-reminder line (Today footer), 'Select all' (in select mode), and the low-day toggle. | Each is underlined, so it clearly reads as a tappable link rather than an inert label, while staying calm (soft ink, no mauve). Primary actions stay buttons. Plain labels (the rotating ethos, dates) are never underlined. |

## Visual

| ID | Pri | Platform | Test | Steps | Expected |
|---|---|---|---|---|---|
| VIS-01 | P2 | Both | The living background (Today's signature, calm, reduced-motion aware) | Open Today at different times of day, on light and dark. Turn on Reduce Motion (in Settings or the OS) and watch the Today background. Then move to Routines, Lookback, Settings. | On Today, a soft time-of-day gradient (dawn / day / dusk / night) with a warm top glow and a softer lower pool sits behind the screen. It only ever shows in the margins: cards and rows stay on near-opaque surfaces, so text is always full-contrast, never washed out. With Reduce Motion on, the colour still resolves to the time of day but the drift stops. The other screens (Routines, Lookback, Settings, etc.) sit on a solid, calm Dusk background, with no grey flash. |

## Today

| ID | Pri | Platform | Test | Steps | Expected |
|---|---|---|---|---|---|
| OCD-01 | P2 | Both | Done is done (completion affirmation) | Complete any task: tap a Today task, or select tasks and tap Done. | A brief, consistent calm line appears near the capture ('Done is done. Recorded.') and clears itself after a few seconds. It is the SAME line every time (never a rotating or variable reward), reduce-motion safe, and never shaming. |
| OCD-02 | P2 | Both | Good enough (release a stuck-perfected task) | On Today, long-press a task to select it, then tap 'Good enough'. On a Later task, long-press it and tap 'Good enough' in the menu. | The task completes with a gentler line ('Good enough is done. Let it go.'). The action only appears for an incomplete one-off. It is permission to release, never a nag. |

## Routines

| ID | Pri | Platform | Test | Steps | Expected |
|---|---|---|---|---|---|
| RTN-01 | P2 | Both | Create and run a routine | From the Today header tap Routines, then + New routine. Name it (e.g. Morning), pick Morning / Evening / Anytime, type a few steps one per line, tap Add routine. Then tick some steps. | The routine appears grouped under its time-of-day with an 'N of M' progress. Tapping a step marks it done for today (a sage tick and a strike-through) and updates the count. Calm, with no streak and no celebration pressure. |
| RTN-02 | P2 | Both | A routine is fresh tomorrow (never a streak) | Tick some routine steps today, then advance the device clock to tomorrow and reopen Routines. | Every step is un-ticked again and the progress is back to 0 of M. There is NO streak count, no 'you missed it', and no chain to break: yesterday simply falls away with no guilt (the never-shame spine). |
| RTN-03 | P3 | Both | Remove a routine (recoverable) | On a routine card tap Remove, then optionally tap Undo. | The routine is removed with a brief 'Routine removed. Undo' banner, not a confirmation dialog. Tapping Undo within a few seconds restores it, otherwise it stays gone. Recoverable, never a confirm gauntlet. |

## Haptics

| ID | Pri | Platform | Test | Steps | Expected |
|---|---|---|---|---|---|
| HAP-01 | P3 | Android | Earned-moment haptics fire (Android) | On a physical Android device with a haptic motor: complete a single task; clear the whole day; close the day with Goodnight; break a dreaded task into steps; and (premium) reveal a scrapbook. | Soft tap on a single completion; a fuller success buzz when the day clears; a warm soft tap on Goodnight; a light tap when steps land; a success flourish when the scrapbook image appears. Nothing buzzes on plain taps, navigation, capture, or any error. |
| HAP-02 | P2 | Android | Reduced motion silences haptics | Set Settings -> Motion -> Reduce (or enable the OS reduce-motion), then complete a task and close the day. | No haptic fires for any cue while motion is reduced (the accessibility guarantee). The Motion hint states Reduce also stops the buzz. |

## Android

| ID | Pri | Platform | Test | Steps | Expected |
|---|---|---|---|---|---|
| AND-01 | P3 | Android | Screen stays awake in Focus mode | On an Android device, open Focus (Focus on one thing) and leave the screen untouched past the usual sleep timeout. | The screen stays on while Focus is open, and returns to normal sleep behaviour once Focus is closed. |
| AND-02 | P3 | Android | System bars match the theme | On Android, switch the in-app theme (Settings) between light and dark, including a case where the app theme differs from the system theme. Watch the status bar and the bottom navigation bar. | Status-bar and navigation-bar icons stay legible against the app background in both themes; no white flash on launch or overscroll. |
| AND-03 | P2 | Android | Launcher long-press shortcuts | On Android, long-press the DoubleDone home-screen icon. Tap 'Brain dump'; relaunch and tap 'Focus on one thing'. Try both from a cold start and with the app backgrounded. | 'Brain dump' opens the app with the capture box focused and ready to type. 'Focus on one thing' opens directly in Focus mode. |
| AND-04 | P2 | Android | Share text into DoubleDone | On Android, from another app (a browser, notes, a chat) use the system Share sheet and pick DoubleDone. Try sharing a line of text, and a URL. | DoubleDone opens with the shared text (or URL) already in the capture box on Today, focused and ready to add. Adding it makes a normal task; nothing is sent anywhere until you do. |
| AND-05 | P2 | Android | Home-screen Today widget | On Android, long-press the home screen and add the 'DoubleDone: Today' widget. Check it with tasks left, with all done, and after closing the day. Complete a task in the app and watch the widget. Tap the widget. | The widget shows today's top unfinished titles (or a calm 'All done for today.' / 'Nothing for today yet.'), in light or dark to match the device. It refreshes within a moment of a change in the app (and at least every 30 minutes). Tapping it opens DoubleDone. |
| AND-06 | P2 | Android | Remind me in X hours (per-task nudge) | On Android, tap-and-hold a today task, tap 'Remind me', pick a preset (e.g. 'In 1 hour'). Check the row indicator. Then complete (or remove, or push to tomorrow) the task before the nudge fires. Separately, open 'Remind me' after 9pm. | A local notification fires at the chosen time (the task as the title, 'Whenever you are ready.' as the body); the row shows a small bell + time. Completing / removing / deferring the task cancels the pending nudge (no poke about a handled task). After 9pm the late presets are hidden. Web does not show 'Remind me'. |

## Web

| ID | Pri | Platform | Test | Steps | Expected |
|---|---|---|---|---|---|
| WEB-01 | P2 | Web | Daily reminder via web push | On the deployed web app (PC or Android Chrome) with VAPID configured, turn the daily reminder on (the 'Turn on daily reminder' action in the Today footer, or Settings > Daily reminder) and allow notifications. Check around your daily hour (the hourly cron can be run manually to verify without waiting). | Toggling on registers a service worker and subscribes the browser; a calm 'Your today is here when you are ready.' notification arrives around the daily hour, and tapping it opens the app. Toggling off unsubscribes. The push carries no task content. The toggle is hidden when VAPID is unconfigured. |

## Onboarding

| ID | Pri | Platform | Test | Steps | Expected |
|---|---|---|---|---|---|
| ONB-01 | P1 | Both | Guided welcome on first run (6-screen) | On a fresh install (or after clearing 'doubledone.onboarded.v1'), open the app. Walk Begin -> type a few lines -> Sort it for me -> This looks right -> Got it -> Almost there -> Open Today. Try Back to a previous screen, and separately try Skip. | Today redirects to the welcome exactly once: a 6-screen sequence with a quiet 6-dot progress, Skip on every screen but the last, and Back (top-left) from screen 2 on with the typed text intact. The dump is triaged into a doable Today (some pushed to later, any big one flagged 'Looks big, break it down?'); the safety-net and 'what you keep' screens follow as calm info; Open Today saves the tasks and opens Today. Skip, or an empty Sort, leaves immediately, saving whatever was revealed. Never reappears once done. If the AI is slow or offline, everything lands on Today, nothing lost. |
| ONB-02 | P2 | Both | Replay the welcome from Settings (non-destructive) | With tasks already on Today, open Settings -> 'See the welcome again'. Walk Begin -> dump a couple of lines -> Sort it for me -> This looks right -> through to Open Today. | The welcome replays identically (all 6 screens), but the new tasks MERGE into the existing list (nothing overwritten) and the onboarded flag is untouched. Skipping returns to Today with no change. |

## AI decompose

| ID | Pri | Platform | Test | Steps | Expected |
|---|---|---|---|---|---|
| AI-01 | P1 | Both | Break down a dreaded task | Capture 'Do my taxes', tap Break it down, answer any clarifying questions. | Returns small atomic steps and drops them into Today. |
| AI-02 | P2 | Both | Time estimate shows | On the breakdown review, look for the pace/time estimate. | A sensible total estimate is shown (the crowd/pace estimate). |
| AI-03 | P2 | Both | AI egress disclosure at point of use | Open the Break-it-down questions modal. | A calm one-liner discloses the text is sent to an AI and kept anonymously. |
| AI-04 | P2 | Both | Friendly error state | Turn off wifi (or block the AI URL), then Break it down. | A calm friendly error. No raw HTTP/stack. App stays usable. |
| AI-07 | P2 | Both | Breakdown keeps the real task as a silent parent (chain) | Break down a task (e.g. 'Plan the party'), then complete all of its steps, in any order. | The original task disappears from Today and Later (it becomes a silent parent, not clutter beside its steps). When the last step is done, the real task completes on its own with the held 'you finished the whole thing' bloom (see AI-09) and lands in the Lookback as the finished real task. Multi-phase: finishing a milestone's steps cascades up to the root. |
| AI-08 | P2 | Both | Make it tiny keeps the real task (open parent), no pile-up | On a dreaded task choose 'Make it tiny' and do the 2-minute version. Then shrink the same task again to confirm pebbles do not accumulate. | The dreaded task disappears and a 2-minute starter takes its place on Today, carrying an 'A tiny step toward X' eyebrow so the real task stays visible. Completing the starter does NOT mark the big task done: the spent starter is retired (no clutter) and the real task reappears with a warm nudge ('You started, that's the hard part. X is back when you're ready.'). Shrinking the same task repeatedly never piles up duplicate pebbles, only one is open at a time. Make it tiny again for the next step, or just complete the task. |
| AI-09 | P2 | Both | Whole-task finish raises the held bloom (scaled) | Finish the LAST step of a broken-down task. Try it on a long-lingering or chunky task, and separately on a small same-day one. Then repeat with Reduce Motion on. | A warm radial bloom rises over a dimming scrim: 'You finished the whole thing', the task name in Newsreader italic, and a warm context line ('... since you first wrote it down. N small steps. All done.'). It holds longer and blooms larger for a long-dreaded or chunky task than for a quick same-day one. A tap dismisses it early, otherwise it auto-settles. Never confetti, points, or a number on screen. With Reduce Motion on, the held title and warm colour still show, only the movement is removed. |

## AI triage

| ID | Pri | Platform | Test | Steps | Expected |
|---|---|---|---|---|---|
| AI-05 | P2 | Both | Sort-for-me (triage + feedback) | In the brain-dump type a MIXED pile, one per line (a couple of quick things, one that can wait, one big/vague). At one line a hint nudges 'one per line'; at two, 'Break it down' becomes 'Sort for me'. Run it. | Shows a summary line ('Sorted: N for today, M for tomorrow, K to break down.'). Quick items stay on Today, can-waits move to tomorrow, big ones get an inline 'Looks big, break it down?' prompt. Calm, never scolding. |

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
| DEL-02 | P1 | Both | Originating device is wiped | On the device you deleted from, look at Today, the Lookback calendar, the scrapbook, and any routines. | Nothing of the account remains locally: no tasks, an empty Lookback, no scrapbook, no routines. Only display prefs (theme, text size) persist. |
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
| SET-05 | P2 | Both | Export your data | In Settings -> Your data, tap 'Export your data' (works with no account). | Web downloads a doubledone-export-<date>.json with your tasks + completions; native opens the share sheet. Tombstones excluded, completion data kept. |
| SET-06 | P2 | Both | Send feedback in-app | In Settings, tap 'Send feedback', type a note, tap Send. | An inline box opens (no mail client, no leaving the app). Send shows 'Sending...' then a calm 'Thank you. It is on its way.', and the note arrives at the support inbox. On failure it shows a calm retry with the typed text kept. Needs the Worker deployed with /feedback + the FEEDBACK_TO secret set. |

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

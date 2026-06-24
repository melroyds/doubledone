#!/usr/bin/env python
"""Generate the DoubleDone end-to-end manual test suite.

Single source of truth for the manual QA pass. Emits:
  - docs/qa/DoubleDone-E2E-Test-Suite.xlsx   (fillable: Result dropdown + Findings + Date)
  - docs/qa/e2e-test-suite.md                (readable / diffable in git)

Run:  python scripts/gen-test-suite.py
Deps: openpyxl  (python -m pip install openpyxl)

Edit CASES below to change the suite, then re-run. The .xlsx is a TEMPLATE: copy
it before a run, or fill it in place and keep your copy outside git.
"""

from __future__ import annotations

import os

from openpyxl import Workbook
from openpyxl.formatting.rule import CellIsRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

# Dusk palette, so the sheet feels like the app.
ACCENT = "9B6A7D"
INK = "2B2722"
LINE = "ECE4D8"
BG = "FAF6F1"
PASS_FILL = "DDEAD0"
FAIL_FILL = "F2D7DE"
BLOCK_FILL = "F4E7C9"

# Each case: (id, area, priority, test, steps, expected, platform)
CASES = [
    # --- Capture & brain-dump -------------------------------------------------
    ("CAP-01", "Capture", "P1", "Add a single task",
     "On Today, tap the capture box, type 'Buy milk', submit.",
     "The task appears in Today immediately. No reload needed.", "Both"),
    ("CAP-02", "Capture", "P1", "Brain-dump several tasks",
     "Enter several tasks in a row (e.g. 5 quick ones).",
     "Each becomes its own task in order. None lost or merged.", "Both"),
    ("CAP-03", "Capture", "P2", "One-off future date ('Date...' chip)",
     "Capture a task, choose the 'Date...' chip, pick a date next week, save.",
     "Task is scheduled for that date and does NOT show in Today until then.", "Both"),
    ("CAP-04", "Capture", "P2", "Schedule chips (Today / Tomorrow / etc.)",
     "Capture a task and pick each schedule chip in turn.",
     "Task lands on the chosen day. Today shows only today's.", "Both"),
    ("CAP-05", "Capture", "P3", "Empty / whitespace capture",
     "Submit an empty box, then a box of only spaces.",
     "Nothing is added. No error, no blank row.", "Both"),
    ("CAP-06", "Capture", "P3", "Very long title",
     "Capture a task with a very long title (a full sentence+).",
     "Wraps or truncates gracefully. No layout break or overflow.", "Both"),
    ("CAP-07", "Capture", "P2", "Talk-to-capture: speak a brain-dump (web)",
     "On the web app in Chrome / Edge / Safari, tap the '🎤 Speak' button under the capture box and allow the mic. Say a few tasks, pausing between each, then tap 'Listening… tap to stop'.",
     "Each spoken phrase lands on its own line; two or more lines surface 'Sort for me', which sorts them as normal. The browser does the speech-to-text (no audio reaches our servers), so only text leaves the device, and only if you Sort. Tapping stop returns the button to 'Speak' and keeps the captured lines.", "Web"),
    ("CAP-08", "Capture", "P3", "Talk-to-capture hides where unsupported",
     "Open the web app in Firefox (no Web Speech API), and separately open the Android app.",
     "The '🎤 Speak' button is simply absent (no error, no setting) on Firefox and on native Android, where the Gboard keyboard mic already dictates into the box.", "Both"),
    ("CAP-09", "Capture", "P2", "Tidy a run-on or rambly line into tasks (AI)",
     "Type or speak a single long line, either several things ('buy milk and walk the dog and email Sarah') or one rambly thought ('I feel like I want to do something fun'), then tap 'Tidy this into tasks'.",
     "The line is replaced by clean task(s) in your own words, nothing invented or reordered. A run-on becomes several lines (and 'Sort for me' appears); a single rambly thought becomes one tidy task ('do something fun'). On failure it degrades calmly ('Couldn't tidy that just now'), text kept. Works on web and Android. Needs the Worker deployed with /split.", "Both"),

    # --- Today & the daily loop ----------------------------------------------
    ("TOD-01", "Today", "P1", "Complete a task",
     "Tap a task's done control on Today.",
     "Marked done with calm feedback. No shame language anywhere.", "Both"),
    ("TOD-02", "Today", "P1", "Today is sized to be doable",
     "Add many tasks across days; look at Today.",
     "Today shows today's achievable set, not the entire backlog.", "Both"),
    ("TOD-03", "Today", "P1", "Push a task to tomorrow",
     "Use the Tomorrow action on a task in Today.",
     "Leaves Today and appears tomorrow. No guilt framing.", "Both"),
    ("TOD-04", "Today", "P1", "Close the day -> rested state",
     "Tap 'Close the day', read the wrap, optionally type a final win in 'Anything else you did?', then tap 'Goodnight'.",
     "Wrap celebrates what you finished (zero guilt, unfinished never shamed). Any text in 'Anything else you did?' is logged as a completed task. After Goodnight, Today becomes a calm 'You've closed today' rested screen with the task list + capture hidden. Survives reload.", "Both"),
    ("TOD-04b", "Today", "P2", "Reopen a closed day",
     "From the rested screen, tap 'Reopen today'.",
     "Returns to the normal Today with all tasks intact. (A new calendar day also auto-clears the closed state.)", "Both"),
    ("TOD-05", "Today", "P2", "Undo a completion",
     "Complete a task, then undo it (toggle back).",
     "Returns to open cleanly. Counts/Lookback stay consistent.", "Both"),
    ("TOD-06", "Today", "P1", "Persistence across restart",
     "Add tasks, fully close the app/tab, reopen.",
     "Tasks are still there (local-first). Nothing lost.", "Both"),
    ("TOD-07", "Today", "P2", "Tap-and-hold a task -> selection",
     "Press and hold a task. It enters selection with that task already ticked and the action bar appears.",
     "With one selected the bar offers Done / Tomorrow / Move to... / Break down / Remove (Break down is single-task only); Remove is the brick 'danger' colour. There is no separate long-press menu any more.", "Both"),
    ("TOD-08", "Today", "P2", "Shame-free re-entry after a gap",
     "Simulate not opening the app for 4+ days (set localStorage 'doubledone.lastopen.v1' to a date 5+ days ago), then reload Today.",
     "A calm 'Welcome back, the past is fine, here's just today' card appears above Today, never '47 overdue'. 'Start fresh' dismisses it; reopening same-day does not re-show it.", "Both"),
    ("TOD-09", "Today", "P2", "Log an off-list thing you did",
     "Tap '+ I also did that' (beneath the task list), type something you did, then Add it.",
     "It appears checked on Today and in the Lookback for today, counted as a completion, never as an unfinished task.", "Both"),
    ("TOD-10", "Today", "P2", "Focus mode: pick-and-go",
     "Tap 'Focus on one thing' (the prominent entry above the list). On 'Which one?' pick a task; try 'Done' (complete), 'Choose another' (back to the list), and Exit.",
     "Full-screen single task, everything else hidden. Done completes it and returns to 'Which one?'; Choose another returns without completing; Exit closes. When none left: 'That's everything for now.'", "Both"),
    ("TOD-11", "Today", "P3", "Weight-of-today gauge",
     "Add a few tasks and watch the slim gauge under 'Just today'.",
     "A calm bar + warm label ('A gentle day. Room to breathe.' up to ~4, then 'A full day, but doable.', then 'A lot on. Be gentle with yourself.') reflects the count of unfinished one-offs, honest, never alarming, hidden on a clear day.", "Both"),
    ("TOD-12", "Today", "P2", "Multi-select bulk actions",
     "Tap-and-hold a task to enter selection, tap more to add them (or 'Select all'), then use the bar: Done / Tomorrow / Move to... / Remove. Cancel exits.",
     "Rows become checkboxes, the count updates, 'Break down' hides once more than one is selected, the bulk action applies to all at once and exits select mode.", "Both"),
    ("TOD-13", "Today", "P2", "Move selected tasks to a chosen day",
     "Tap-and-hold to select one or more tasks, tap 'Move to...', then pick 'This weekend', 'Next week', or a calendar day.",
     "Selected one-offs move to that date and wait in the Later list until then (recurring tasks are left alone); select mode exits.", "Both"),
    ("TOD-14", "Today", "P2", "Low-capacity day (gentle recalibration)",
     "Under the weight gauge, tap 'Low on energy? Make it a low day'.",
     "The gauge recalibrates to a gentler capacity (the same task count reads as fuller) and the label gives permission ('A low day. A couple of things is plenty.', up to 'Just pick one, the rest waits.'). A brief affirmation shows. The backlog is untouched, nothing is deferred or shamed. The toggle reads 'Back to a normal day' to undo, and the state self-clears at midnight (per-day, never a setting).", "Both"),
    ("TOD-15", "Today", "P3", "Evening wind-down nudge",
     "Open the app in the evening (after 6pm) with the day not yet closed.",
     "A calm line appears above 'Close the day' ('Evening's here. Close the day when you're ready, even a little counts.'), inviting the closing ritual. It is in-app only (no notification), never shaming, and absent during the day.", "Both"),
    ("TOD-16", "Today", "P2", "Rooms pill, phase greeting, soft cards (Today reborn)",
     "Look at the Today header and the line under 'Today'. Tap the 'Rooms' pill, then a room. Open the app at different times of day.",
     "The header shows the date plus one 'Rooms' pill (three dots and a label), never the old four-link row that wrapped on narrow phones. Tapping Rooms opens a calm bottom sheet listing Repeating, Routines, Lookback, Settings (each with a one-line hint); tap one to go, tap the scrim to close. The greeting under 'Today' changes with the clock: 'Good morning/afternoon. Just today.', 'Winding down. Just today.' in the evening, a restful line late at night. Task rows sit on a soft shadow, floating a hair above the living background.", "Both"),
    ("TOD-17", "Today", "P2", "Pull a Later task forward to today (select + Move to)",
     "Schedule a task for a future day (capture with 'Date...', or push one to Tomorrow) so it sits in the 'Later' list. Tap-and-hold it to select it, tap 'Move to...', then pick 'Today'.",
     "The Later task is long-press selectable exactly like a Today task (same action bar appears). 'Move to...' offers Today alongside This weekend / Next week / a calendar day. Picking Today moves it into Today (its due becomes today) and out of Later. No shame framing, the mirror of pushing to tomorrow, through the same consistent path.", "Both"),
    ("TOD-18", "Today", "P3", "Secondary actions read as tappable (not labels)",
     "Look at the quiet text actions: 'Done adding' (open the capture drawer), 'Sync across devices' and the daily-reminder line (Today footer), 'Select all' (in select mode), and the low-day toggle.",
     "Each is underlined, so it clearly reads as a tappable link rather than an inert label, while staying calm (soft ink, no mauve). Primary actions stay buttons. Plain labels (the rotating ethos, dates) are never underlined.", "Both"),
    ("TOD-19", "Today", "P2", "Long titles wrap and stay fully visible (incl. with a reminder)",
     "Add a task with a very long title. Set a reminder on it (tap-and-hold, Remind me). Look at the row, and at the same task in select mode. Try it on web and on Android.",
     "The long title wraps onto up to three lines and stays fully visible, including when a reminder bell shares the row (it never collapses to a blank line). It behaves identically with or without the reminder, in select mode, and on both platforms. No scrolling, just a calm static wrap.", "Both"),
    ("VIS-01", "Visual", "P2", "The living background (Today's signature, calm, reduced-motion aware)",
     "Open Today at different times of day, on light and dark. Turn on Reduce Motion (in Settings or the OS) and watch the Today background. Then move to Routines, Lookback, Settings.",
     "On Today, a soft time-of-day gradient (dawn / day / dusk / night) with a warm top glow and a softer lower pool sits behind the screen. It only ever shows in the margins: cards and rows stay on near-opaque surfaces, so text is always full-contrast, never washed out. With Reduce Motion on, the colour still resolves to the time of day but the drift stops. The other screens (Routines, Lookback, Settings, etc.) sit on a solid, calm Dusk background, with no grey flash.", "Both"),

    # --- OCD reassurance (Cluster A) -----------------------------------------
    ("OCD-01", "Today", "P2", "Done is done (completion affirmation)",
     "Complete any task: tap a Today task, or select tasks and tap Done.",
     "A brief, consistent calm line appears near the capture ('Done is done. Recorded.') and clears itself after a few seconds. It is the SAME line every time (never a rotating or variable reward), reduce-motion safe, and never shaming.", "Both"),
    ("OCD-02", "Today", "P2", "Good enough (release a stuck-perfected task)",
     "On Today, long-press a task to select it, then tap 'Good enough'. On a Later task, long-press it and tap 'Good enough' in the menu.",
     "The task completes with a gentler line ('Good enough is done. Let it go.'). The action only appears for an incomplete one-off. It is permission to release, never a nag.", "Both"),

    # --- Routines (Cluster D) ------------------------------------------------
    ("RTN-01", "Routines", "P2", "Create and run a routine",
     "From the Today header tap Routines, then + New routine. Name it (e.g. Morning), pick Morning / Evening / Anytime, type a few steps one per line, tap Add routine. Then tick some steps.",
     "The routine appears grouped under its time-of-day with an 'N of M' progress. Tapping a step marks it done for today (a sage tick and a strike-through) and updates the count. Calm, with no streak and no celebration pressure.", "Both"),
    ("RTN-02", "Routines", "P2", "A routine is fresh tomorrow (never a streak)",
     "Tick some routine steps today, then advance the device clock to tomorrow and reopen Routines.",
     "Every step is un-ticked again and the progress is back to 0 of M. There is NO streak count, no 'you missed it', and no chain to break: yesterday simply falls away with no guilt (the never-shame spine).", "Both"),
    ("RTN-03", "Routines", "P3", "Remove a routine (recoverable)",
     "On a routine card tap Remove, then optionally tap Undo.",
     "The routine is removed with a brief 'Routine removed. Undo' banner, not a confirmation dialog. Tapping Undo within a few seconds restores it, otherwise it stays gone. Recoverable, never a confirm gauntlet.", "Both"),

    # --- Haptics (Android device only) ---------------------------------------
    ("HAP-01", "Haptics", "P3", "Earned-moment haptics fire (Android)",
     "On a physical Android device with a haptic motor: complete a single task; clear the whole day; close the day with Goodnight; break a dreaded task into steps; and (premium) reveal a scrapbook.",
     "Soft tap on a single completion; a fuller success buzz when the day clears; a warm soft tap on Goodnight; a light tap when steps land; a success flourish when the scrapbook image appears. Nothing buzzes on plain taps, navigation, capture, or any error.", "Android"),
    ("HAP-02", "Haptics", "P2", "Reduced motion silences haptics",
     "Set Settings -> Motion -> Reduce (or enable the OS reduce-motion), then complete a task and close the day.",
     "No haptic fires for any cue while motion is reduced (the accessibility guarantee). The Motion hint states Reduce also stops the buzz.", "Android"),

    # --- Android native polish (device only) ---------------------------------
    ("AND-01", "Android", "P3", "Screen stays awake in Focus mode",
     "On an Android device, open Focus (Focus on one thing) and leave the screen untouched past the usual sleep timeout.",
     "The screen stays on while Focus is open, and returns to normal sleep behaviour once Focus is closed.", "Android"),
    ("AND-02", "Android", "P3", "System bars match the theme",
     "On Android, switch the in-app theme (Settings) between light and dark, including a case where the app theme differs from the system theme. Watch the status bar and the bottom navigation bar.",
     "Status-bar and navigation-bar icons stay legible against the app background in both themes; no white flash on launch or overscroll.", "Android"),
    ("AND-03", "Android", "P2", "Launcher long-press shortcuts",
     "On Android, long-press the DoubleDone home-screen icon. Tap 'Brain dump'; relaunch and tap 'Focus on one thing'. Try both from a cold start and with the app backgrounded.",
     "'Brain dump' opens the app with the capture box focused and ready to type. 'Focus on one thing' opens directly in Focus mode.", "Android"),
    ("AND-04", "Android", "P2", "Share text into DoubleDone",
     "On Android, from another app (a browser, notes, a chat) use the system Share sheet and pick DoubleDone. Try sharing a line of text, and a URL.",
     "DoubleDone opens with the shared text (or URL) already in the capture box on Today, focused and ready to add. Adding it makes a normal task; nothing is sent anywhere until you do.", "Android"),
    ("AND-05", "Android", "P2", "Home-screen Today widget",
     "On Android, long-press the home screen and add the 'DoubleDone: Today' widget. Check it with tasks left, with all done, and after closing the day. Complete a task in the app and watch the widget. Tap the widget.",
     "The widget shows today's top unfinished titles (or a calm 'All done for today.' / 'Nothing for today yet.'), in light or dark to match the device. It refreshes within a moment of a change in the app (and at least every 30 minutes). Tapping it opens DoubleDone.", "Android"),
    ("AND-06", "Android", "P2", "Remind me in X hours (per-task nudge)",
     "On Android, tap-and-hold a today task, tap 'Remind me', pick the temporary 'In 2 minutes (test)' preset. Lock the screen and wait. Then set another and let its time pass WITHOUT completing the task. Separately, complete / remove / push-to-tomorrow a task with a pending nudge, and open 'Remind me' after 9pm. NOTE: if nothing fires, confirm Settings -> Apps -> DoubleDone -> Battery is not 'Restricted' (Samsung One UI throttles alarms).",
     "The notification reliably FIRES at the chosen time as a heads-up (the task as the title, 'Whenever you are ready.' as the body), even with the screen off, via an exact alarm. The row shows a small bell + time. Once the time has passed the bell clears on its own (on the next open or app resume) even if the task is still open. Completing / removing / deferring cancels a pending nudge (no poke about a handled task). After 9pm the late presets are hidden. Web does not show 'Remind me'.", "Android"),

    # --- Web push (deployed; needs VAPID configured) -------------------------
    ("WEB-01", "Web", "P2", "Daily reminder via web push",
     "On the deployed web app (PC or Android Chrome) with VAPID configured, turn the daily reminder on (the 'Turn on daily reminder' action in the Today footer, or Settings > Daily reminder) and allow notifications. Check around your daily hour (the hourly cron can be run manually to verify without waiting).",
     "Toggling on registers a service worker and subscribes the browser; a calm 'Your today is here when you are ready.' notification arrives around the daily hour, and tapping it opens the app. Toggling off unsubscribes. The push carries no task content. The toggle is hidden when VAPID is unconfigured.", "Web"),

    # --- Onboarding: the one-time guided welcome ------------------------------
    ("ONB-01", "Onboarding", "P1", "Guided welcome on first run (6-screen)",
     "On a fresh install (or after clearing 'doubledone.onboarded.v1'), open the app. Walk Begin -> type a few lines -> Sort it for me -> This looks right -> Got it -> Almost there -> Open Today. Try Back to a previous screen, and separately try Skip.",
     "Today redirects to the welcome exactly once: a 6-screen sequence with a quiet 6-dot progress, Skip on every screen but the last, and Back (top-left) from screen 2 on with the typed text intact. The dump is triaged into a doable Today (some pushed to later, any big one flagged 'Looks big, break it down?'); the safety-net and 'what you keep' screens follow as calm info; Open Today saves the tasks and opens Today. Skip, or an empty Sort, leaves immediately, saving whatever was revealed. Never reappears once done. If the AI is slow or offline, everything lands on Today, nothing lost.", "Both"),
    ("ONB-02", "Onboarding", "P2", "Replay the welcome from Settings (non-destructive)",
     "With tasks already on Today, open Settings -> 'See the welcome again'. Walk Begin -> dump a couple of lines -> Sort it for me -> This looks right -> through to Open Today.",
     "The welcome replays identically (all 6 screens), but the new tasks MERGE into the existing list (nothing overwritten) and the onboarded flag is untouched. Skipping returns to Today with no change.", "Both"),

    # --- AI: Bite the Elephant (decompose) -----------------------------------
    ("AI-01", "AI decompose", "P1", "Break down a dreaded task",
     "Capture 'Do my taxes', tap Break it down, answer any clarifying questions.",
     "Returns small atomic steps and drops them into Today.", "Both"),
    ("AI-02", "AI decompose", "P2", "Time estimate shows",
     "On the breakdown review, look for the pace/time estimate.",
     "A sensible total estimate is shown (the crowd/pace estimate).", "Both"),
    ("AI-03", "AI decompose", "P2", "AI egress disclosure at point of use",
     "Open the Break-it-down questions modal.",
     "A calm one-liner discloses the text is sent to an AI and kept anonymously.", "Both"),
    ("AI-04", "AI decompose", "P2", "Friendly error state",
     "Turn off wifi (or block the AI URL), then Break it down.",
     "A calm friendly error. No raw HTTP/stack. App stays usable.", "Both"),
    ("AI-07", "AI decompose", "P2", "Breakdown keeps the real task as a silent parent (chain)",
     "Break down a task (e.g. 'Plan the party'), then complete all of its steps, in any order.",
     "The original task disappears from Today and Later (it becomes a silent parent, not clutter beside its steps). When the last step is done, the real task completes on its own with the held 'you finished the whole thing' bloom (see AI-09) and lands in the Lookback as the finished real task. Multi-phase: finishing a milestone's steps cascades up to the root.", "Both"),
    ("AI-08", "AI decompose", "P2", "Make it tiny keeps the real task (open parent), no pile-up",
     "On a dreaded task choose 'Make it tiny' and do the 2-minute version. Then shrink the same task again to confirm pebbles do not accumulate.",
     "The dreaded task disappears and a 2-minute starter takes its place on Today, carrying an 'A tiny step toward X' eyebrow so the real task stays visible. Completing the starter does NOT mark the big task done: the spent starter is retired (no clutter) and the real task reappears with a warm nudge ('You started, that's the hard part. X is back when you're ready.'). Shrinking the same task repeatedly never piles up duplicate pebbles, only one is open at a time. Make it tiny again for the next step, or just complete the task.", "Both"),
    ("AI-09", "AI decompose", "P2", "Whole-task finish raises the held bloom (scaled)",
     "Finish the LAST step of a broken-down task. Try it on a long-lingering or chunky task, and separately on a small same-day one. Then repeat with Reduce Motion on.",
     "A warm radial bloom rises over a dimming scrim: 'You finished the whole thing', the task name in Newsreader italic, and a warm context line ('... since you first wrote it down. N small steps. All done.'). It holds longer and blooms larger for a long-dreaded or chunky task than for a quick same-day one. A tap dismisses it early, otherwise it auto-settles. Never confetti, points, or a number on screen. On Android the dimmed scrim is clean, with NO vertical pillar or banding behind it (the SVG background pools are disabled on Android, where they mis-render at large size). With Reduce Motion on, the held title and warm colour still show, only the movement is removed.", "Both"),

    # --- AI: Sort-for-me & Strategise ----------------------------------------
    ("AI-05", "AI triage", "P2", "Sort-for-me (triage + feedback)",
     "In the brain-dump type a MIXED pile, one per line (a couple of quick things, one that can wait, one big/vague). At one line a hint nudges 'one per line'; at two, 'Break it down' becomes 'Sort for me'. Run it.",
     "Shows a summary line ('Sorted: N for today, M for tomorrow, K to break down.'). Quick items stay on Today, can-waits move to tomorrow, big ones get an inline 'Looks big, break it down?' prompt. Calm, never scolding.", "Both"),
    ("AI-06", "AI strategise", "P2", "Strategise (chart a course)",
     "When the list feels heavy, run Strategise.",
     "Returns a weighted, ordered plan of action. No overwhelm.", "Both"),

    # --- Lookback -------------------------------------------------------------
    ("LB-01", "Lookback", "P1", "Open the calendar",
     "Open the Lookback. Browse to different days/months.",
     "A real Gregorian calendar. Navigation works, no crash.", "Both"),
    ("LB-02", "Lookback", "P1", "Completed tasks show on their day",
     "Complete a task today, open the Lookback on today.",
     "The completed task is listed under today.", "Both"),
    ("LB-03", "Lookback", "P2", "Old dreaded task is celebrated",
     "Complete a task that is old or high-complexity; view it in the Lookback.",
     "Marked 'a big one' / weighted celebration. Never shamed for being old.", "Both"),
    ("LB-04", "Lookback", "P2", "Scheduled tasks show on the calendar",
     "Defer a task to tomorrow (or use 'Date...'), then open the Lookback and tap that future day.",
     "The future day shows an outline marker; tapping it lists the task under 'Scheduled'.", "Both"),

    # --- Scrapbook ------------------------------------------------------------
    ("SB-01", "Scrapbook", "P1", "Make a scrapbook",
     "In a week with completions, tap 'Make a scrapbook'.",
     "Loading shimmer, then a still-life image + caption in the polaroid.", "Web"),
    ("SB-02", "Scrapbook", "P1", "Image surfaces the tasks",
     "Look at the generated image/caption for a known week.",
     "Objects evoke the actual tasks (e.g. laundry -> folded linen). No text in image.", "Both"),
    ("SB-03", "Scrapbook", "P1", "Finished list + 'a big one'",
     "Below the polaroid, read the 'This week you finished' list.",
     "All week's completed titles listed; big wins marked 'a big one'.", "Both"),
    ("SB-04", "Scrapbook", "P2", "Invite state",
     "Open a week that has completions but no scrapbook yet.",
     "Dashed frame + mauve '+', 'Turn this week into a keepsake', and the finished list still shows.", "Both"),
    ("SB-05", "Scrapbook", "P2", "Free-tier limit is graceful",
     "Generate a few scrapbooks in one day (free tier ~1-2/day).",
     "When exhausted, a calm wait/error. No crash, the holder stays intact.", "Web"),
    ("SB-06", "Scrapbook", "P2", "Scrapbook persists",
     "Make a scrapbook, restart the app.",
     "It is still there (device-local).", "Both"),

    # --- Auth & sync ----------------------------------------------------------
    ("AUTH-01", "Auth & sync", "P1", "Email sign-in (OTP)",
     "Sign in, enter your email, get the 6-digit code from your inbox, verify.",
     "Signed in. Settings shows 'Synced to <your email>'. (This emails your inbox.)", "Both"),
    ("AUTH-02", "Auth & sync", "P1", "Local tasks migrate on first sign-in",
     "Have some local tasks, then sign in for the first time.",
     "Local tasks sync into the account. None lost or duplicated.", "Both"),
    ("AUTH-03", "Auth & sync", "P1", "Sync across two devices",
     "Sign in on web and the Android build. Add a task on one.",
     "It appears on the other after sync.", "Both"),
    ("AUTH-04", "Auth & sync", "P2", "Last-write-wins, no dupes",
     "Complete / edit the same task on both devices close together.",
     "State converges. No duplicate rows, no flip-flop.", "Both"),
    ("AUTH-05", "Auth & sync", "P2", "Sign out",
     "Sign out from Settings.",
     "Returns to local/anonymous. No account data left visible.", "Both"),
    ("AUTH-06", "Auth & sync", "P2", "Offline then online",
     "Go offline, add/complete tasks, then reconnect.",
     "Changes sync up on reconnect. Nothing lost.", "Both"),

    # --- Account deletion -----------------------------------------------------
    ("DEL-00", "Account deletion", "P1", "PREREQ: create the delete function",
     "Run the delete_account() function from supabase/schema.sql once in the Supabase SQL editor.",
     "Function created. (One-time setup; cannot be rolled back.)", "Setup"),
    ("DEL-01", "Account deletion", "P1", "Delete account + data",
     "Settings -> Delete account and data -> confirm. (Use a throwaway account first.)",
     "Account and synced data are gone. Returns to a clean, signed-out Today.", "Both"),
    ("DEL-02", "Account deletion", "P1", "Originating device is wiped",
     "On the device you deleted from, look at Today, the Lookback calendar, the scrapbook, and any routines.",
     "Nothing of the account remains locally: no tasks, an empty Lookback, no scrapbook, no routines. Only display prefs (theme, text size) persist.", "Both"),
    ("DEL-03", "Account deletion", "P3", "Known limit: second device",
     "On a second signed-in device after deletion, observe behaviour.",
     "It keeps local data until its next sync fails auth (documented limitation).", "Both"),

    # --- MCP server -----------------------------------------------------------
    ("MCP-00", "MCP", "P1", "PREREQ: copy your token",
     "Sign in, Settings -> AI agent access (MCP) -> Copy my token.",
     "Token copied (web) / shown selectable. Server URL visible.", "Both"),
    ("MCP-01", "MCP", "P1", "Connect a client",
     "Add the /mcp server to Claude Desktop via mcp-remote + your token (see docs/mcp.md).",
     "Client connects. Lists 3 tools: add_task, list_today, complete_task.", "Desktop"),
    ("MCP-02", "MCP", "P1", "add_task round-trip",
     "Ask the agent: add 'book the dentist' to my DoubleDone.",
     "Task appears in your Today (web/app) after sync.", "Desktop"),
    ("MCP-03", "MCP", "P1", "list_today",
     "Ask the agent: what's on my DoubleDone today?",
     "Returns your open tasks, each with an id.", "Desktop"),
    ("MCP-04", "MCP", "P1", "complete_task",
     "Ask the agent to complete one of the listed tasks by id.",
     "Marked done; reflects in the app after sync.", "Desktop"),
    ("MCP-05", "MCP", "P2", "No-token gate",
     "In the MCP Inspector, call a tool WITHOUT the Authorization header.",
     "Calm 'Not connected' result (isError). Nothing in your account changes.", "Inspector"),
    ("MCP-06", "MCP", "P2", "Expired token re-copy",
     "Use a token older than ~1 hour, then re-copy a fresh one.",
     "Stale token fails cleanly; fresh token works. No data exposed.", "Desktop"),

    # --- Settings & comfort ---------------------------------------------------
    ("SET-01", "Settings", "P1", "Theme light / dark / system",
     "Switch theme between Light, Dark, and System.",
     "Applies immediately. Dusk palette correct in both; System follows the OS.", "Both"),
    ("SET-02", "Settings", "P2", "Text size small / default / large",
     "Change text size across all three.",
     "App scales. No clipping or broken layout at large.", "Both"),
    ("SET-03", "Settings", "P2", "Motion -> Reduce",
     "Set Motion to Reduce.",
     "Gentle fades and scrolling titles stop.", "Both"),
    ("SET-04", "Settings", "P2", "Privacy & data link",
     "Tap 'Privacy & data' in Settings.",
     "Opens the privacy screen.", "Both"),
    ("SET-05", "Settings", "P2", "Export your data",
     "In Settings -> Your data, tap 'Export your data' (works with no account).",
     "Web downloads a doubledone-export-<date>.json with your tasks + completions; native opens the share sheet. Tombstones excluded, completion data kept.", "Both"),
    ("SET-06", "Settings", "P2", "Send feedback in-app",
     "In Settings, tap 'Send feedback', type a note, tap Send.",
     "An inline box opens (no mail client, no leaving the app). Send shows 'Sending...' then a calm 'Thank you. It is on its way.', and the note arrives at the support inbox. On failure it shows a calm retry with the typed text kept. Needs the Worker deployed with /feedback + the FEEDBACK_TO secret set.", "Both"),

    # --- Accessibility --------------------------------------------------------
    ("A11Y-01", "Accessibility", "P2", "Screen reader (TalkBack)",
     "Enable TalkBack, navigate Today and capture.",
     "Controls are labelled. Dates read in a friendly way.", "Android"),
    ("A11Y-02", "Accessibility", "P2", "Touch targets",
     "Tap the small controls (done, chips, actions) with a thumb.",
     "Comfortable to hit. No fiddly mis-taps (hitSlop adequate).", "Both"),
    ("A11Y-03", "Accessibility", "P3", "Large text does not clip",
     "Set text size Large and walk every screen.",
     "Nothing important truncated or overlapping.", "Both"),

    # --- Theming / visual on device ------------------------------------------
    ("VIS-01", "Visual", "P1", "Native fonts render",
     "On the Android build, look at headers and body text.",
     "Serif (Newsreader) headers, Atkinson body, correct bold weights.", "Android"),
    ("VIS-02", "Visual", "P2", "Dark palette on device",
     "Switch to Dark on the Android build.",
     "Dusk dark, comfortable contrast, no harsh pure-black/white.", "Android"),
    ("VIS-03", "Visual", "P2", "Bold body text renders",
     "Find bold body text (e.g. emphasised labels) on Android.",
     "Bold reads as truly bold (the bodyBold fix), not faux/again-regular.", "Android"),

    # --- Reminders (Android) --------------------------------------------------
    ("REM-01", "Reminders", "P1", "Daily reminder fires",
     "Set up the daily reminder; wait for its time (or trigger the channel).",
     "A calm notification arrives at the right time.", "Android"),
    ("REM-02", "Reminders", "P2", "Reminder channel present",
     "Android Settings -> Apps -> DoubleDone -> Notifications.",
     "A DoubleDone reminder channel exists and is controllable.", "Android"),

    # --- Privacy --------------------------------------------------------------
    ("PRV-01", "Privacy", "P1", "Privacy policy reachable",
     "Visit doubledone.app/privacy (and via Settings).",
     "Loads, plain-English, matches the privacy posture.", "Both"),

    # --- Cross-platform / deploy ---------------------------------------------
    ("DEP-01", "Deploy", "P1", "Web loads + deep links",
     "Open doubledone.app, then hard-load /privacy and /sign-in directly.",
     "App loads; deep links resolve (SPA fallback), no 404.", "Web"),
    ("DEP-02", "Deploy", "P1", "Android APK installs + launches",
     "Sideload the latest APK and open it.",
     "Installs and runs. Core loop works.", "Android"),
    ("DEP-03", "Deploy", "P2", "Local-first offline",
     "Use core features (add/complete) with no network.",
     "Works offline; syncs later when signed in.", "Both"),

    # --- Premium (Stripe, test mode) -----------------------------------------
    ("PREM-00", "Premium", "P1", "PREREQ: Stripe test keys + webhook",
     "Set STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET as Worker secrets; register the /stripe-webhook URL in the Stripe sandbox.",
     "Worker deployed with the keys; webhook endpoint registered and reachable.", "Setup"),
    ("PREM-01", "Premium", "P1", "Paywall renders",
     "Open Settings -> DoubleDone Premium.",
     "The calm 'Keep every week' pitch, the A$5/mo price, the 1 -> 2 -> 4 tenure tiers.", "Both"),
    ("PREM-02", "Premium", "P1", "Free monthly gate routes to the paywall",
     "As a free user who already made a scrapbook this month, tap 'Make a scrapbook'.",
     "Routed to the Premium paywall, calm, never a shaming message.", "Both"),
    ("PREM-03", "Premium", "P1", "Checkout with a test card",
     "Signed in, tap Go Premium, pay with Stripe test card 4242 4242 4242 4242 (any future expiry, any CVC).",
     "Stripe Checkout opens, payment succeeds, returns to /premium?status=success.", "Web"),
    ("PREM-04", "Premium", "P1", "Entitlement flips to premium",
     "After the test checkout, reopen Premium and the Lookback.",
     "Premium shows active; the scrapbook is no longer monthly-gated (now weekly).", "Both"),
    ("PREM-05", "Premium", "P2", "Premium weekly wait stays calm",
     "As premium, make this week's allowance of scrapbooks, then try one more.",
     "A calm 'next ready in N days' message, never a paywall.", "Both"),
    ("PREM-06", "Premium", "P2", "Webhook rejects a bad signature",
     "POST a forged event to /stripe-webhook with no valid Stripe-Signature.",
     "400 bad signature; no entitlement change.", "Worker"),
    ("PREM-07", "Premium", "P1", "Webhook delivery succeeds (Stripe side)",
     "After the test checkout, open the Stripe event destination's delivery log.",
     "The checkout/subscription events show 'delivered' with a 200 from the Worker.", "Web"),
    ("PREM-08", "Premium", "P1", "Manage subscription opens the billing portal",
     "As premium: /premium -> Manage subscription.",
     "Redirects to the Stripe Billing Portal (cancel / update card / invoices).", "Web"),
    ("PREM-09", "Premium", "P1", "Cancel reverts to free",
     "In the portal, cancel immediately, then return to the app.",
     "Entitlement flips to free; the scrapbook is monthly-gated again; tenure (started_at) is preserved.", "Web"),
    ("PREM-10", "Premium", "P2", "Premium screen shows the renew / cancel date",
     "As premium, open /premium; then schedule a cancel-at-period-end in the portal and reopen.",
     "Reads 'Renews <date>' when active, and 'Premium until <date>, then free' when a cancel is scheduled.", "Web"),
]

HEADERS = ["ID", "Area", "Priority", "Test", "Steps", "Expected result",
           "Platform", "Result", "Findings", "Date"]
WIDTHS = [9, 16, 8, 26, 46, 40, 13, 12, 34, 12]
WRAP_COLS = {4, 5, 6, 9}  # 1-based: Test, Steps, Expected, Findings


def style_header_cell(c):
    c.fill = PatternFill("solid", fgColor=ACCENT)
    c.font = Font(color="FFFFFF", bold=True, size=11)
    c.alignment = Alignment(vertical="center", horizontal="left")


def build_xlsx(path: str) -> None:
    wb = Workbook()

    # --- Intro sheet ---------------------------------------------------------
    intro = wb.active
    intro.title = "Read me"
    intro.sheet_view.showGridLines = False
    intro.column_dimensions["A"].width = 22
    intro.column_dimensions["B"].width = 70

    def line(row, label, value="", bold_label=True, big=False):
        a = intro.cell(row=row, column=1, value=label)
        a.font = Font(bold=bold_label, size=16 if big else 11, color=ACCENT if big else INK)
        a.alignment = Alignment(vertical="top", wrap_text=True)
        b = intro.cell(row=row, column=2, value=value)
        b.font = Font(size=16 if big else 11, color=INK)
        b.alignment = Alignment(vertical="top", wrap_text=True)
        return row + 1

    r = 1
    r = line(r, "DoubleDone", "End-to-end manual test suite", big=True)
    r += 1
    r = line(r, "What this is",
             "The manual QA pass for things only a human on real devices and a real account can verify. "
             "Work the 'Test Suite' tab top to bottom (or filter by Priority). For each row, do the Steps, "
             "compare to the Expected result, set Result from the dropdown, and write what you saw in Findings.")
    r += 1
    r = line(r, "Priorities",
             "P1 = must pass before any public launch.  P2 = important polish.  P3 = edge / nice-to-have.")
    r = line(r, "Result values",
             "Pass  /  Fail  /  Blocked (could not run, e.g. setup missing)  /  Not run.")
    r = line(r, "Tip",
             "Send me the Fails and their Findings and I'll fix them. The Summary tab tallies your results.")
    r += 1
    r = line(r, "— Environment (fill in) —", "")
    r = line(r, "Tester", "")
    r = line(r, "Date started", "")
    r = line(r, "Web URL", "https://doubledone.app")
    r = line(r, "Worker version", "9af9acc1 (or newer)")
    r = line(r, "Commit under test", "c65aa2e (or newer)")
    r = line(r, "Browser + version", "")
    r = line(r, "Android device + OS", "")
    r = line(r, "APK build", "")
    r += 1
    r = line(r, "Note on prerequisites",
             "Some rows need one-time setup first: DEL-00 (create the delete_account function in Supabase), "
             "AUTH-01 (sign in), MCP-00/01 (copy token + connect a client), DEP-02 (sideload the APK). "
             "Do those before the rows that depend on them.")

    # --- Test Suite sheet ----------------------------------------------------
    ws = wb.create_sheet("Test Suite")
    ws.sheet_view.showGridLines = False
    thin = Side(style="thin", color=LINE)
    border = Border(left=thin, right=thin, top=thin, bottom=thin)

    for i, h in enumerate(HEADERS, start=1):
        c = ws.cell(row=1, column=i, value=h)
        style_header_cell(c)
        c.border = border
        ws.column_dimensions[get_column_letter(i)].width = WIDTHS[i - 1]

    for ri, case in enumerate(CASES, start=2):
        cid, area, prio, test, steps, expected, platform = case
        values = [cid, area, prio, test, steps, expected, platform, "", "", ""]
        for ci, v in enumerate(values, start=1):
            c = ws.cell(row=ri, column=ci, value=v)
            c.border = border
            c.alignment = Alignment(vertical="top", wrap_text=ci in WRAP_COLS)
            if ci == 1:
                c.font = Font(bold=True, color=INK)
            if ci == 3:  # priority colour
                c.font = Font(bold=True,
                              color={"P1": "9B2D3B", "P2": "8A6D1F", "P3": "6B6B6B"}.get(prio, INK))

    last = len(CASES) + 1

    # Result dropdown + colour rules.
    dv = DataValidation(type="list", formula1='"Pass,Fail,Blocked,Not run"', allow_blank=True)
    dv.error = "Pick Pass, Fail, Blocked or Not run."
    dv.prompt = "Pass / Fail / Blocked / Not run"
    ws.add_data_validation(dv)
    dv.add(f"H2:H{last}")
    for value, fill in (("Pass", PASS_FILL), ("Fail", FAIL_FILL), ("Blocked", BLOCK_FILL)):
        ws.conditional_formatting.add(
            f"H2:H{last}",
            CellIsRule(operator="equal", formula=[f'"{value}"'],
                       fill=PatternFill("solid", fgColor=fill)))

    ws.freeze_panes = "A2"
    ws.auto_filter.ref = f"A1:J{last}"

    # --- Summary sheet -------------------------------------------------------
    s = wb.create_sheet("Summary")
    s.sheet_view.showGridLines = False
    s.column_dimensions["A"].width = 18
    s.column_dimensions["B"].width = 12
    rng = f"'Test Suite'!$H$2:$H${last}"
    s.cell(row=1, column=1, value="Results").font = Font(bold=True, size=14, color=ACCENT)
    rows = [
        ("Total cases", str(len(CASES))),
        ("Pass", f'=COUNTIF({rng},"Pass")'),
        ("Fail", f'=COUNTIF({rng},"Fail")'),
        ("Blocked", f'=COUNTIF({rng},"Blocked")'),
        ("Not run", f'=COUNTIF({rng},"Not run")'),
        ("Unmarked", f'={len(CASES)}-COUNTA({rng})'),
    ]
    for i, (label, val) in enumerate(rows, start=2):
        s.cell(row=i, column=1, value=label).font = Font(bold=label in ("Total cases",), color=INK)
        s.cell(row=i, column=2, value=val)
    s.cell(row=9, column=1, value="P1 cases").font = Font(bold=True, color=INK)
    s.cell(row=9, column=2, value=f'=COUNTIF(\'Test Suite\'!$C$2:$C${last},"P1")')
    s.cell(row=10, column=1, value="P1 passed").font = Font(color=INK)
    s.cell(row=10, column=2,
           value=f'=COUNTIFS(\'Test Suite\'!$C$2:$C${last},"P1",\'Test Suite\'!$H$2:$H${last},"Pass")')

    os.makedirs(os.path.dirname(path), exist_ok=True)
    wb.save(path)


def build_md(path: str) -> None:
    lines = [
        "# DoubleDone, end-to-end test suite",
        "",
        "The readable copy of the manual QA pass. The fillable version with a Result "
        "dropdown is `DoubleDone-E2E-Test-Suite.xlsx` (same content, generated from "
        "`scripts/gen-test-suite.py`).",
        "",
        "**Priorities:** P1 must pass before launch, P2 important polish, P3 edge / nice.",
        "",
    ]
    area = None
    for cid, a, prio, test, steps, expected, platform in CASES:
        if a != area:
            area = a
            lines += ["", f"## {area}", ""]
            lines += ["| ID | Pri | Platform | Test | Steps | Expected |",
                      "|---|---|---|---|---|---|"]
        lines.append(f"| {cid} | {prio} | {platform} | {test} | {steps} | {expected} |")
    lines.append("")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))


if __name__ == "__main__":
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    xlsx = os.path.join(here, "docs", "qa", "DoubleDone-E2E-Test-Suite.xlsx")
    md = os.path.join(here, "docs", "qa", "e2e-test-suite.md")
    build_xlsx(xlsx)
    build_md(md)
    print(f"wrote {xlsx}")
    print(f"wrote {md}")
    print(f"{len(CASES)} cases")

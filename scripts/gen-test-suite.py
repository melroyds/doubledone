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
    ("TOD-04", "Today", "P2", "Close the day gently",
     "Complete / close out the day.",
     "Gentle close, zero guilt. Unfinished tasks are not shamed.", "Both"),
    ("TOD-05", "Today", "P2", "Undo a completion",
     "Complete a task, then undo it (toggle back).",
     "Returns to open cleanly. Counts/Lookback stay consistent.", "Both"),
    ("TOD-06", "Today", "P1", "Persistence across restart",
     "Add tasks, fully close the app/tab, reopen.",
     "Tasks are still there (local-first). Nothing lost.", "Both"),

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

    # --- AI: Sort-for-me & Strategise ----------------------------------------
    ("AI-05", "AI triage", "P2", "Sort-for-me (triage)",
     "With several tasks present, run Sort-for-me / triage.",
     "Sensible ordering/grouping. Calm, never scolding.", "Both"),
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
     "On the device you deleted from, look at Today and the Lookback.",
     "Nothing of the account remains locally.", "Both"),
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

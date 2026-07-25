# Claude Design prompt — DoubleDone: the action architecture of the Today screen

Review and redesign **where the day-shaping controls live** on DoubleDone's Today screen. This is a placement and hierarchy problem, not a restyling exercise. The buttons look fine. Their arrangement encodes the wrong model of a day.

## The product

DoubleDone is a calm, never-shame daily to-do app for adults with ADHD, autism, the AuDHD overlap and OCD. The spine: **today is finite and achievable.** The home screen is Today, sized to be doable, and everything else exists to protect the person from the overwhelm of the full list.

Brand is "Dusk": **Newsreader** (a warm literary serif) for headings, **Atkinson Hyperlegible** for body, a soft **mauve → honey** accent, warm off-white by default with a full dark mode, and a living time-of-day background that drifts from dawn through night. The tone is quiet and reassuring. Never a nag, never a streak, never a badge.

## The five controls in scope

| Control | What it is for | When in the day |
|---|---|---|
| **Add** (capture) | Put something into the app | Constantly, reflexively, many times a day |
| **Plan my day** | AI orders today's tasks into a calm sequence, after asking about energy, work-day-or-off, and indoors-or-out | Start of day |
| **Focus on one thing** | Full-screen single task, everything else hidden | Mid-day, when overwhelmed |
| **Lighten today** | AI re-spreads an over-full day across later days | Mid-day, when it is too much |
| **Close the day** | The gentle end-of-day ritual: what got done, zero guilt, goodnight | End of day |

## Where they sit today (the actual current layout, top to bottom)

1. Rooms header pills
2. The weight-of-today gauge
3. **Focus on one thing** — above the list
4. A one-time hold-hint coachmark
5. **The task list**
6. Then, stacked below the list, in this order: a "Today's looking full" line → **Lighten today** → **Plan my day** → an evening wind-down line → **Close the day**
7. **Add** — docked in a footer, always visible

## The three problems to solve

**1. The day runs backwards down the page.** Reading top to bottom you get a mid-day tool, then the list, then the start-of-day tool, then the end-of-day tool. "Plan my day" is a thing you reach for before you begin, and it is the second-to-last control on the screen. Whatever the fix, the arrangement should not contradict the shape of a day.

**2. "Close the day" is buried, and it is the emotional payoff.** On a long day the person scrolls the entire list, then past a nudge line, past Lighten today, past Plan my day, past a wind-down line, to reach it. A real user has already reported it feels buried. Closing the day gently is the ritual this whole product builds toward; it should not be the hardest thing on the screen to reach. **But do not simply promote it.** An always-prominent "Close the day" at 10am reads as the app asking the person to give up, which is the opposite of the intent.

**3. The deepest one: the action layer reshapes itself constantly.** Every control except Add appears conditionally. Focus needs at least one spreadable task; Plan my day needs AI on and two or more tasks; Lighten today additionally needs the day to be judged heavy. So a person with one task sees a different screen from a person with two, who sees a different screen from a person with six, and the controls slide up and down the page as their siblings appear and vanish.

This app explicitly serves autistic users, and **"autism needs predictability"** is a stated product guardrail. Right now the action layer is the least predictable part of the screen. Muscle memory can never form. This is the problem most worth solving, and it is not visible in any single screenshot, which is why it has survived this long.

## The insight to design against

There are **two classes of control here being rendered as one flat pile**:

- **Capture** is constant, reflexive, and used many times a day. It is correctly docked and always in the same place.
- **The four day-shaping tools** are occasional, deliberate, used once or twice a day, and each is tied to a *moment* in the day.

The current design treats all five as "buttons on the Today screen." The redesign should decide whether the four day-shaping tools are one system with one home, or genuinely four separate things, and commit to that answer.

## Principles that make or break it (honour all seven)

1. **Never shame the backlog.** Nothing may imply the person is behind, slow, or failing. No counts of what is undone, no urgency, no red.
2. **Predictable beats clever.** A control that is always in the same place, even when unavailable, beats one that appears at the perfect moment. If you propose surfacing things contextually, you must show what stops it feeling like the app rearranged itself behind the person's back.
3. **Calm over dense.** Whitespace is the material. Fewer visible things, not more.
4. **Propose, never impose.** Every AI action is propose-then-accept. Demand avoidance is real.
5. **No new settings.** The answer is never "let the user configure it."
6. **One-handed, thumb-reachable.** Frequent and forgiving actions belong low; anything hard to undo belongs out of the reflex path.
7. **Screen-reader and shaky-hand navigable.** No drag, no long-press as the only route, generous targets.

## Directions to explore (pick three genuinely different ones)

Do not just restack the same buttons. Consider at least:

- **A stable home for the day tools.** One consistent place holding the same four, always, with unavailable ones present but quiet rather than absent. Directly answers problem 3. Show what the quiet-unavailable state looks like so it never reads as broken or locked.
- **Time-of-day surfacing.** The app already knows the hour, drives its background from it, and already shows an evening wind-down line. The right tool could meet the person at the right moment. This is the most elegant and the most dangerous: show explicitly how you keep it predictable.
- **Split by rhythm rather than by type.** Add stays docked. The day tools get one entry point. "Close the day" is treated as a ritual rather than a tool, because it is the only one that ends something.
- Anything better you see. The framing above is the current understanding, not a constraint.

## Screens to produce (mobile, in both dark and light Dusk)

For each direction:
1. Today at rest, **a short day (2 tasks)** — the state where most controls currently vanish
2. Today at rest, **a long day (12+ tasks, scrolled to the bottom)** — where Close the day is buried
3. Today **mid-morning** and **mid-evening**, if the direction is time-aware
4. The day-tools surface open or expanded, if the direction introduces one

## What this is NOT

- Not a hamburger menu, a tab bar, or a floating-action-button cluster
- Not a restyle: the visual language is settled, the arrangement is the question
- Not more surface. If a direction adds a screen, it must remove something.
- No badges, counts, streaks, percentages, or progress rings
- Not a settings-based answer

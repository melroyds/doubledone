# Claude Design prompt: DoubleDone, "Where you left off" (one free line per task)

*For Claude Design. Written 2026-10-04. A task can now carry one line of the user's own words, the handhold for next time, with the day it was written. Almost everything about what it is has been decided. This round is about how it looks and feels on four surfaces that already exist, without adding a single action.*

**Attached:** `held-card-light.png` and `held-card-dark.png` (a one-off task's card, open), `rename-light.png` and `rename-dark.png` (the same card with the title editor open, keyboard up, on a phone), `focus-light.png` and `focus-dark.png` (Focus on a plain one-off task), `focus-stepped-light.png` (Focus on a task tracked in steps, so "Step 2 of 5" shows), `today-rows-light.png` and `today-rows-dark.png` (Today with a pinned row, a "big" row, a reminder time, a repeating row and a held row in one frame), `held-card-quiet-light.png`, `held-card-quiet-dark.png`, `today-quiet-light.png` and `today-quiet-dark.png` (the same in Quiet), `affirm-light.png` (any confirmation floating above the capture pill, for example after Pin) and `german-glossary.md`. The screenshot harness makes only the light held card (as `held-card.png`) and a plain Today in light and dark, which has none of the pinned, "big", reminder or held rows. Everything else, including every Focus, rename, Quiet and dark held-card shot, is captured by hand. No German or stress-size shot exists, so both are described below.

## The product

DoubleDone is a calm to-do app that never shames. It is for adults with ADHD, autism, the AuDHD overlap and OCD, and it is live on web, iOS and Android. The spine: **today is finite and achievable**. The rule: **remove friction, never add a setting**. The brand is "Dusk": Newsreader serif headings, Atkinson Hyperlegible body, warm paper, a full dark mode and one mauve accent used sparingly. Seven colour themes, each light and dark, so 14 palettes. A free **Quiet** appearance strips the chrome. Five languages (en, de, es, fr, it), and German and French run long. The whole daily loop is free. Premium is optional extras, and nothing in this round touches it.

## Why now

On 4 October the founder asked for a Premium sub-system of date-stamped notes on tasks, "just like a project tracker". A six-lens adversarial review took it apart and found the real job underneath. Coming back to a dreaded task that runs over days (the insurance claim, the GP referral, the Centrelink form, the tax return) means rebuilding it from memory: who you spoke to, the reference number, what you are waiting on. That rebuild is what makes a task dreaded twice. It also leaves the OCD "did I already call them?" loop with no written answer.

The review's answer is one free line per task, overwritten, with one plain date. The founder approved it the same day: "One free line per task is great." The full trail, a Premium layer and anything AI are parked behind evidence. Design the line, nothing more.

## The surfaces today, top to bottom

All figures are from the code. Spacing tokens: `spacing.half` 2, `one` 4, `two` 8, `three` 12, `four` 16, `five` 24, `six` 32, `seven` 48. Radius: `sm` 8, `md` 14, `lg` 20. Borders: `hair` 1, `thin` 1.5, `thick` 2. Every font size is multiplied by the text-size setting (0.92, 1, or 1.18 for Large).

### 1. A Today row

- **Shell (Standard).** A card on `surfaceCard` (surface at 92% in light, 86% in dark, over the living sky), padding 16 all round, radius 14, a 1 hairline in `line`, and a soft shadow. A one-off task gets a 2 border in `repeat` (periwinkle). A pinned task gets a 2 border in `accent` and an `accentSoft` fill. A held task gets a 1 hairline in `accent`.
- **Shell (Quiet).** No card. Minimum 48 tall, 16 vertical padding, 2 horizontal, and a bottom hairline of ink at 5% (6% in dark). The text sits straight on the living sky.
- **The content line, left to right, gap 16.** The 26 check circle. The "big" chip (11pt bold `accent` on an `accentSoft` pill, plain accent text in Quiet). The title (17/23 Atkinson, `ink`, one line, it marquees when too long). Then the marks: "· Ours" (13pt `inkFaint`) on your copy of a shared row, "just added" (11pt bold), a reminder time (13pt bold `accent`), the repeat mark ↻ (18pt bold `repeat`, `inkSoft` in Quiet) and, **always last at the far right**, the pin. The pin is a filled 24-grid SVG path drawn at 16 x scale in `accent`.
- **The second line slot.** TaskRow already has a prop called `note`, and it is **not this feature**. It is a computed status line the app writes, used for the shared rows' cadence line and "No longer on Ours". It renders at 13pt `inkFaint`, 4 below the title, indented 40 to clear the check, and is folded into the row's spoken label. The user's line never goes in this slot.
- **A held row** adds an in-cell line: an 8x8 accent dot, "I'm holding this one" (13pt `inkSoft`) and "Let it go" (13pt bold `accent`).
- **Other row shapes the mark must live in:** a task tracked in steps (title plus "2 / 5" in 14pt bold `repeat`, a 4-tall progress bar, "Hold to adjust" at 11pt `inkFaint`, and no other marks today), a tiny step (an eyebrow "A tiny step toward · {parent}" above the title, and no marks at all today), and a row AI flagged as too big (a "Looks big, break it down?" link under it in 14pt bold `accent`).
- **Spoken label.** Built in this order: title (or "{title}, pinned as today's one thing"), ", marked as a big task", ", repeating", ", reminder at {time}", ", holding you to this", ", from your shared list" (your "· Ours" copy), ", just added", then the computed `note`, then the reason a row cannot be ticked, if there is one. The stepped row and the tiny step have their own labels ("{title}, 2 of 5 done, tap to advance, hold to adjust" and "{title}, a tiny step toward {parent}").
- **Press.** The row dims to 0.7 (`PRESSED_OPACITY`). Long-press is 400ms.

### 2. The held card (an open one-off task)

Long-press a row and it expands in place into the task's own card. Nothing else on screen moves. Same shell as the row, with a `line` border, a column with gap 2. Top to bottom:

1. **Title**, 22/28 Newsreader 600 (`subheading`), `ink`, padding 8 horizontal and 4 below, at most two lines. A faint underline in `inkFaint` is the whole "tap to edit" affordance. A stepped task shows "2 / 5" beside it (15/20 bold, `inkSoft`, or `accent` when it taps into the steps editor).
2. **"Break down"**, the hero (the feature is called Break it down, the card's label is "Break down"): filled `accent` with an `onAccent` label in light (white, except Honey's dark ink), an `accentSoft` tint with an `accent` label in dark, no fill in Quiet. Radius 8. Sub-label "into small steps".
3. **Make it tiny** · "the first step".
4. **Move to…**
5. **Mark as a lot** · "weight".
6. **The rail**, "↑ Move up | ↓ Move down", one hairline-bordered control 44 tall. The only act-and-stay control. An edge dims in place.
7. **More ▾** in `accent`. The fold, indented 16, fixed order: Share to Ours (only when a shared list exists), Remind me (native only), Hold me to it · "keeps at it, kindly" (native only), Pin ✦ · "holds the top". **Four rows, a soft ceiling, and it is full.**
8. **The shelf**, the card's floor: a faint band flush to the bottom edge, at least 52 tall (a hairline and 44 in Quiet), holding Close (bold `accent`), Select several (`inkSoft`) and Remove (`danger`).

Every action row is at least 44 tall, padding 4 by 8, label 15/20 bold `ink`, sub-label 13pt `inkSoft` right-aligned. In Quiet the card sits on `quiet.pressWash` (`accentSoft` at 78%, 85% in dark) with a transparent border.

**Motion.** The card rises over 180ms with a 4 settle. The fold fades in over 160ms. Reduced motion is a designed state: a single 90ms dissolve, nothing moves.

**The accretion rule** (decision log, 22 Aug 2026): the card's visible surface is frozen (title, hero, Make it tiny, Move to, Mark as a lot, rail, More, shelf). Every new action enters through the fold, and the fold holds four. The review's call is that showing the line under the title bends the frozen surface for **content, not an action**: words that belong to the task, and no new control, row or door. The editor's second field is part of the same bend, because it exists only while the title editor is open. The review was explicit that this bend is not a quiet exception. It stands on the founder's explicit yes, recorded in the decision log, so design on the assumption that it holds and stay strictly inside it. If your design needs the line anywhere but directly under the title, or needs anything on the card that acts, that is outside the bend: say so in the README rather than doing it.

**The done card** is deliberately minimal: a tick and the title (not editable), "Done on…", the italic "Done is done." and the shelf.

### 3. The title editor (rename)

Tap the title and it becomes a text field in the same 22/28 serif with a 1 hairline in `accent` under it. It auto-focuses, the return key says "done", and it is a single-line field with no length limit. **It saves on submit and on blur, and either one closes the editor.** An empty or unchanged title is a no-op. Rename is deliberately not act-and-dismiss: the card stays open. No confirmation line is shown, because the changed title is its own feedback. Spoken: the title button is "Edit the title: {title}", the field is "The task title".

The same editor serves the Later rows on Today, repeating rows on Today, and the rows in the Ours room. The second field must appear only where the line is allowed (see the states).

### 4. Focus ("Just this one")

A full-screen modal that fades in over Today, on plain paper (no sky). The content is centred in a scroll view padded 32. The body is at most 440 wide, centred text, gap 16.

- "Exit" at the top left (15pt bold `inkSoft`, 48 from the top, 24 in).
- The eyebrow "JUST THIS ONE" (12/16 bold, tracking 0.5, `accent`, upper case).
- The title, 30/38 Newsreader 600, `ink`, tracking -0.3.
- "Step 2 of 5" for a stepped task (16pt `inkSoft`).
- The actions, gap 32, 16 above: "Choose another" (16pt bold `inkSoft`) and the filled "Done" button.

Focus opens from the day tools ("Focus on one thing"), from a held row's "I'm holding this one" line, from "Start with this" in "What fits right now?", and from the app's launcher shortcut. It opens on the pinned task, else the held task, else the only open task, else it asks "Which one?". **It only ever offers today's open one-off tasks**, so it never shows a repeating, done or future task. Today Focus holds no text field at all.

### 5. Where a confirmation lands today

The affirm line floats just above the capture pill on Today: 14pt bold `doneText`, centred, on a `surfaceCard` card with radius 20, cleared after 3.5 seconds. Examples: "Pinned. Your one thing for today." and "Marked as a lot. The day knows it's heavier." After a tick it shows one line from a rotating pool of eight, such as "Done is done. Recorded.", "Filed. You can stop checking it now." and "One thing lighter." Ticking Done inside Focus shows nothing. It hides in select mode, on a closed day and while the capture sheet is open. **Focus covers it completely**, so today nothing confirmed inside Focus can be seen there.

## What we know

- **Nothing the user writes lives on a task except its title.** The Task type has no such field. The review's read, not measured: context gets crammed into titles, which is part of why the row's title marquees.
- **It travels like the title.** The line syncs as part of its task, and the last write wins, exactly as a rename does. There is no conflict, merge or "edited on another device" state to design.
- **The one duration the app shows is on a finished task.** When a long-dreaded task is finished, the celebration can say "A week since you first wrote it down." It never appears on an open task. This line obeys the same law: on an open task, never a duration, never an age.
- **The two writing doors are quiet ones.** Over 35 days, across all users including the founder's own testing: `task.renamed` 10, `card.more` 16, `task.reordered` 56, `breakdown.started` 2. The review did not count Focus opens. So the title editor is a door few people open today. That is a known cost of "no new action", accepted on purpose.
- **The word "note" is taken twice in code**: TaskRow's computed `note` line, and `closeNote`, Close the day's "Anything else you did?" box, which logs a finished task. The user-facing words here are "Where you left off". In code the field is `leftOff` or similar, never `note`.
- **The date helpers that exist go relative near today.** `friendlyDate` says "Tomorrow" and `relativeDay` says "today" and "yesterday". This line always shows the calendar date, so it needs a plain `Intl.DateTimeFormat` call (weekday short, day, month short), which is Hermes-safe. `Intl.RelativeTimeFormat` crashed two Android releases at launch, so it is out regardless.
- **What the formatter prints for 30 September 2026** (Node's ICU, the device region tag decides): en-AU "Wed, 30 Sept", en-US "Wed, Sep 30", de-DE "Mi., 30. Sept.", fr-FR "mer. 30 sept.", es-ES "mié, 30 sept", es-MX "mié 30 de sep", it-IT "mer 30 set". iOS and Android can differ in punctuation, so design for the longest. The review's own examples said "Tue 30 Sep". 30 September 2026 is a Wednesday, so use real dates in your frames.
- **Two mark lineages exist.** `PinMark` is a filled path. `Mark.tsx` is a thin-line family (stroke 2, round caps and joins, a 24 grid, Feather or Lucide lineage) holding the mic and camera. The text glyphs on the row are ↻ and the "big" chip.
- **The PinMark lesson.** The first held-row mark was a flag character that the iOS font silently did not draw. A drawn SVG path cannot fail that way. The new mark is an SVG, never an emoji or a font glyph.
- **Inside the editor, blur closes everything.** With a second field under the title, moving the cursor from title to line blurs the title, which today saves and closes the editor. That has to be designed, not discovered.
- **Translation traps already in the catalogues.** One line in the tick's pool, "Done is done. Recorded.", ends "Notiert." in German, "C'est noté." in French, "Quedó anotado." in Spanish and "Segnato." in Italian. A literal "Noted." would repeat the tick's word in German, French and Spanish, and the natural Italian for it, "Segnato.", is the tick's word too. The settle screen already says "Today is where you left it." (de "Heute ist noch da, wo du es gelassen hast.", es "Hoy está donde lo dejaste.", fr "Aujourd'hui est là où tu l'as laissé.", it "Oggi è dove l'avevi lasciato."), a voice precedent close to this one. It dodges gender because its participle agrees with "today", not with the user. The natural French and Italian for "where you left off" do not: "là où tu t'es arrêté" and "dove eri rimasto" take être and essere, so the participle agrees with the user's gender, and the app does not know it.

## Decided, do not reopen

These are the review's decisions, approved on 4 October. Design within them. If one breaks your design, say so in the README rather than working around it.

1. **Free forever.** Read, write, edit, clear and export, whatever the Premium state. No ✦, no dimmed state, no paywall line.
2. **One line per task, overwritten, never added to.** Not a log, a trail or a history. No "Earlier", no "see all", no edit history, nothing that shows it changed.
3. **Plain text, capped at about 280 characters.** The field just stops at the cap. No error and no counter. No formatting, title, checklist, tag, photo or voice memo.
4. **One date: the calendar day the line was last written.** Absolute, no time of day. Never "ago", "today", "yesterday", "last updated", a duration or a count. **Never on the Today row.** The date and the mark look exactly the same whether the line was written today or two months ago: no fading, warming or any other treatment that changes with age.
5. **Which tasks.** One-off personal tasks, including each step of a broken-down task and a tiny step, since each is an ordinary one-off. A task you break down keeps its own line on its silent parent, which Today hides until its last step completes it, so in this round that line is out of sight (showing it on the steps is Tier 2, below). A Make-it-tiny parent keeps its line and brings it back when it returns. **Never on Ours shared rows, repeating tasks, Routines or Rhythms.**
6. **Written only in doors that already exist**: a second "Where you left off" field in the held card's title editor, and in Focus. No new action, no new card row, no fifth fold row.
7. **Read** in Focus under the title, as "Where you left off: Called, ref 4471, ring back Thu · Wed, 30 Sept", and faintly under the title on the held card, **only when a line exists**.
8. **On Today, one faint drawn SVG mark** on a row that has a line. No count, no text, no second line, no date. The row's spoken label gains ", has a note".
9. **No prompt, ever.** Not after a tick, at Close the day, in Capture, on the bedtime prompt, or after Break it down or Make it tiny.
10. **The placeholder** is "Where you left off, for next time". **On save**, the same calm line every time: "Noted." (in English).
11. **No Setting** of any kind.
12. **Never sent to any AI feature**, including Break it down, Make it tiny, Sort, Plan my day, What fits right now, Lighten, Combine's name suggestion, the weekly reflection and the scrapbook. No "use my note too" option anywhere. **Never on the REST API or MCP.**
13. **Existing flows keep it.** Combine carries it onto the combined task. Break it down keeps it on the silent parent. Remove keeps it through Undo.
14. **It never crosses to Ours, in either direction.** Share to Ours puts a copy of the task on the shared list without the line, and the line stays on your own task. "Bring to my Today" (in the room) and "Take this on today" (on Today's due-today strip) make your copy without one.
15. **Export includes it. Account deletion removes it.**
16. **Telemetry is event names only**, never a word of the text.
17. **Nothing that gathers lines in one place**: no Notes room, timeline, list or Calendar dot. A line never exists without its task, and it goes when the task goes.

## The states

| State | Today row | Held card | Title editor | Focus |
|---|---|---|---|---|
| One-off, no line | unchanged | unchanged, nothing new on it | title, plus an empty second field showing the placeholder | the empty state with the placeholder (Focus is a writing door) |
| One-off with a short line | the mark | the line and its date, faint, under the title | both fields filled | "Where you left off:", the line, the date |
| A line at the 280 cap | the mark | yours to clamp, but the whole line must be readable somewhere | the full line | the full line |
| A line written today | the mark | today's calendar date, never the word "today" | | same |
| Pinned, held, "big", stepped, tiny step, "Looks big, break it down?" row | the mark joins the existing marks, pin still last. The stepped row and the tiny step carry no marks today, so the mark would be the first there | | | stepped: the line and "Step 2 of 5" together |
| A step of a broken-down task | the step's own mark, if the step has its own line | its own line | its own second field | its own line. The parent's line is Tier 2, not this round |
| A Make-it-tiny parent that comes back | its line comes back with it, unchanged | same | same | same |
| Focus's "Which one?" list | | | | titles only, as today. No line, because a list of lines is the gathering the review ruled out |
| Combine, when two or more of the chosen tasks have a line | not settled. Only one line can survive. Flag it, do not solve it | | | |
| A long title that marquees | the mark must survive it | | | |
| A Later (future) row on Today | same row and card component, so treat it the same | same | same | never in Focus |
| Repeating task | no mark | no line | no second field | never in Focus |
| Ours shared row (the room and the "due today" strip) | no mark | no line | no second field, even though the room has the title editor | never in Focus |
| Your "· Ours" copy (a personal task brought from the shared list) | not settled by the review. Draw no example | | | |
| Done task | not settled. The done card has no editor and is minimal on purpose. Flag it, do not solve it, and draw the done card and a done row unchanged | | | never in Focus |
| Select mode | yours to propose (the "big" chip stays in select mode because the bulk bar acts on it, nothing acts on the line) | | | |
| Saving a changed line | | "Noted." | | "Noted.", somewhere visible inside Focus |
| Renaming the title only | | silent, as today | | |
| Clearing the line | the mark goes | the line goes | | back to the placeholder |
| A one-off with a line later made repeating | not settled. Flag it, do not solve it | | | |

## The tensions

1. **Two fields, one blur.** Today the editor saves and closes on blur. Design how focus moves between title and line (does return on the title go to the line?), when each saves, and when "Noted." fires. A title-only rename stays silent.
2. **Faint versus legible.** "Faint" is the review's word, and `inkFaint` cannot carry text. See the contrast tables. Faintness has to come from size, weight, position and quiet, not from a colour that fails.
3. **Findable without an action.** The line is reached by tapping the title or opening Focus. On the card it appears only when a line exists, so an empty card says nothing. Do not solve this with a button, a "new" dot, a coach mark or a prompt. The spoken label of the title button is a legitimate place to say the line is there. Focus is the one place an empty field shows, because it is a writing door. It stays a quiet place to write, never a question: the same faint field every time, never appearing, moving or changing because of anything the user just did, and never after Done.
4. **Content that is not a control.** On the card the line must read as part of the task, not as a sixth row. If tapping it opens the editor (tap the thing to change the thing, the title precedent), it needs a 44 target and must still not look like an action.
5. **A date on an open task.** One calendar date is information. Make sure it never reads as "how long ago". It sits faint, after the words, never leading.
6. **Card height.** The card can already open taller than the space under a low row. A 280-character line under a two-line serif title adds height before the hero. Decide the clamp and where the rest is read.
7. **A crowded first line on the row.** The mark joins up to five others. It must not look like an unread or attention badge, and must not be confused with ↻, the held dot or the pin.
8. **"Noted." inside Focus.** Today's confirmation lives behind the Focus modal. Focus needs its own calm place for it, the same words, the same 3.5 seconds or less, never a toast that covers the task.
9. **Words in five languages.** Find a "Noted." that does not reuse the tick's word ("Notiert", "noté", "anotado", "Segnato"). Find gender-neutral French and Italian for "Where you left off". German follows the glossary, warm "du", and stays a draft pending native review.
10. **The keyboard.** The card sits inside the scrolling list, not at the bottom, but a low row's editor can still open under the keyboard. On web, an opening card scrolls itself into view, and the page resizes for the keyboard. Native has no scroll-into-view and Android edge-to-edge ignores resize. Give the editor and Focus a keyboard plan and say it out loud.

## Principles

Never shame: no counts, no durations, no red, and nothing that changes as a line gets older. The line is a handhold, so it must never read as evidence of how long a task has sat there. Today stays finite: the line adds no text, no number, no date and no second line to a Today row, and nothing on Today lists, counts or surfaces lines. All Today gains is one faint mark, and the row stays the height it is. Predictable beats clever: "Noted." is the same every time. Calm over dense, whitespace is the material. Propose, never impose: the app never asks for a line. No new settings. One-handed and thumb-reachable. Screen-reader and shaky-hand navigable. Tap the thing to change the thing. A handhold for next time, not a status report: the words steer what people write, so no "update", "status", "log" or "progress" anywhere, and no "Notes" heading. If the line needs a pointer, a tooltip or a "new" dot to be found, it failed.

## Hard constraints

1. **Five languages, nothing truncates.** Give every new string in en, de, es, fr and it, with headroom. Labels wrap, never clip.
2. **The stress case** is Large text (1.18) times the phone's own 200% text, in German, 320 wide. Nothing caps the phone's scale. Show the card with a line, the editor and Focus there.
3. **Contrast.** The line and its date are 13 to 15pt, which is normal text under WCAG, so they need 4.5:1. The mark is a meaningful graphic, so it needs 3:1. Figures below are on the card face (approximated as the opaque `surface`), on paper (`bg`) for Focus, and on the Quiet held-card wash (approximated over paper). Dusk light `inkSoft` on paper is 4.5001, a pass with no margin at all, so in Focus any tint or wash behind it fails.

   | Palette | `inkFaint` card | `inkFaint` paper | `inkSoft` card | `inkSoft` paper | `inkSoft` Quiet held wash |
   |---|---|---|---|---|---|
   | Dusk light | 3.92 | 3.64 | 4.84 | 4.50 | 4.10 |
   | Sage light | 2.69 | 2.45 | 5.10 | 4.65 | 4.35 |
   | Slate light | 2.64 | 2.40 | 5.03 | 4.56 | 4.30 |
   | Heather light | 2.74 | 2.47 | 5.24 | 4.71 | 4.39 |
   | Fog light | 2.69 | 2.43 | 5.11 | 4.62 | 4.38 |
   | Honey light | 2.65 | 2.45 | 5.28 | 4.89 | 4.60 |
   | Rose light | 2.61 | 2.39 | 5.28 | 4.83 | 4.48 |
   | Dusk dark | 3.31 | 3.62 | 6.09 | 6.66 | 5.36 |
   | Sage dark | 3.52 | 3.94 | 6.58 | 7.36 | 5.85 |
   | Slate dark | 3.58 | 3.99 | 6.58 | 7.33 | 5.73 |
   | Heather dark | 3.45 | 3.77 | 6.42 | 7.01 | 5.82 |
   | Fog dark | 3.57 | 3.96 | 6.52 | 7.22 | 5.62 |
   | Honey dark | 3.46 | 3.77 | 6.15 | 6.70 | 5.59 |
   | Rose dark | 3.29 | 3.53 | 6.31 | 6.78 | 5.57 |

   What that means. `inkFaint` fails 4.5:1 for text in all 14 palettes, and fails even 3:1 for a mark in six of seven light palettes. `inkSoft` passes as text on the Standard card and on paper everywhere, but fails 4.5:1 on the Quiet held-card wash in six of seven light palettes. In Quiet a resting row has no card, so the mark sits on the living sky, a gradient shared by every theme that shifts through four times of day (twelve light stops, lightest `#FAF4EC`, darkest `#D7D2E3`). On the sky, ignoring its drifting light pools, `inkFaint` is 1.77 to 3.58 in light, and `inkSoft` is 3.28 to 4.83 in light and 5.75 to 8.19 in dark. So `inkSoft` clears 3:1 for a mark on every stop, and `ink` clears 9.9 or more. Use `ink` or `inkSoft`, or prove your choice in all 14 palettes, both appearances.
4. **Quiet** is borderless. Anything that needs an outline to read as a field or a control fails there. Design the line, the editor and the mark fully for Quiet.
5. **Screen readers.** The mark is hidden from the reader because the label says it (", has a note"). Give its place in the row label order, and the label for the stepped and tiny-step rows too, which build their own. Give the second field's spoken name, the title button's label if it changes, how the line and date read on the card and in Focus, the focus order in the editor and in Focus, and how "Noted." is announced. Show a visible keyboard focus state for the web.
6. **Shaky thumbs.** Every target is at least 44 tall. The second field must not sit so close to the title that a tap meant for one lands on the other.
7. **React Native primitives only.** View, Text, Pressable, TextInput, react-native-svg, opacity and transform animation. No blur, no backdrop filter, no gradient.
8. **The mark** is a drawn SVG on a 24 grid, scales with the text size (as the pin does at 16 x scale), and is never colour-only. The pin stays last at the far right.
9. **Motion.** New elements arrive with the card's own rise or Focus's own fade and never animate on their own. Give each the reduced-motion variant (the card's is a 90ms dissolve). Name each new control's press state (0.7).
10. **The cap is silent.** At about 280 characters the field stops taking input. No counter, no message, no colour change.

## Where you have room

The what is decided. The how is yours in four places. Explore at least two genuinely different directions for the first and third, then recommend one.

- **The editor.** One editor, two stacked fields, title then line. Or the line field under a hairline that only appears once the editor is open. Or anything better. Solve the blur, the return key and the save.
- **The line on the card.** Where exactly under the title, the clamp, where the date sits, and whether tapping it opens the editor on the line.
- **The mark.** The glyph (thin-line from the `Mark.tsx` family, or filled like the pin), its size, colour per appearance, and its place among the marks. A handhold, a bookmark, a folded corner, your call, but nothing that reads as "unread".
- **Focus.** Where the line sits relative to the title and "Step 2 of 5", what the empty state looks like, how writing works in a centred layout with the keyboard up, and where "Noted." lands. Leave room for one more line later (below).

## Screens to produce (390x844, Dusk light and dark, unless noted)

1. The held card, no line, to prove nothing changed.
2. The held card with a short line ("Called, ref 4471, ring back Thu") and its date.
3. The held card with a line at the 280 cap.
4. The title editor open: the empty second field with its placeholder, then filled. Keyboard up, on a row low in the list, at iOS (47 top, 34 bottom) and Android (status bar plus navigation bar) heights.
5. Focus with a line. Focus on a stepped task with a line. Focus with no line (the placeholder). Focus editing the line, keyboard up.
6. "Noted." on Today after saving from the card, and inside Focus.
7. Today rows with the mark: plain, pinned, held, "big", stepped, a tiny step, the "break it down?" row and a long title that marquees, beside a repeating row with no mark.
8. Quiet, light and dark: the row, the card with a line, the editor, Focus.
9. Large text (1.18) at 390.
10. The stress case (1.18 x 200%, German, 320 wide): the card with a line, the editor, Focus.
11. French at the default size: the card with a line, the editor, Focus.
12. One light theme where `inkFaint` is weakest (Slate or Rose), showing the line and the mark still pass.
13. Press and web keyboard-focus states on every new control. Reduced motion.

## Not this round, but leave room

- **Tier 2, next.** A broken-down task's line (kept on its silent parent) shows on each of its steps in Focus, and in the Make-it-tiny resurfacing line ("You started, that's the hard part. {parentTitle} is back when you're ready."). A finished task's line shows on its Calendar row, finished tasks only. Focus must take one more line later without a redesign.
- **Tier 3, parked behind evidence.** A dated trail, "Catch me up", an undated standing line on repeating tasks, an opt-in "Use my note too" in Break it down, REST and MCP exposure. Do not draw them and do not leave a hook for them, such as an "Earlier" link.

## Deliver

A zip whose README is the contract:

- layout and spacing on the live tokens by name (`spacing.*`, `radius.*`, `border.*`, `ink`, `inkSoft`, `inkFaint`, `accent`, `accentSoft`, `surfaceCard`, `line`, `quiet.*`, the type steps `subheading`, `label`, `caption`, `eyebrow`)
- every new string in all five languages: the placeholder, the Focus label, "Noted.", ", has a note", the second field's spoken name, any changed title-button label, and how the line and date are spoken on the card and in Focus
- the date rule with an example per locale, and why it never goes relative
- the mark: its SVG path on a 24 grid, size, colour per appearance and scheme, and its place in the row's marks
- the editor's behaviour: focus order between the fields, the return key, the save trigger, when "Noted." fires and when it stays silent, what clearing does, the cap
- the keyboard plan for the editor and Focus, per platform
- motion, with the reduced-motion variant
- accessibility: focus order and spoken labels per state, announcements, and the contrast figure for every visible new string and the mark in all 14 palettes, both appearances
- the field's code name (`leftOff` or similar, never `note`)
- every state you were told to flag (the "· Ours" copy, the done card, a line on a task later made repeating, Combine with two lines), each with the question it raises and no answer drawn
- what was left out on purpose, and why

## What this is NOT

- Not a notes feature, a trail, a log, a history or a thread. No "Earlier", "see all" or edit history.
- Not a project tool. No projects, statuses, tags, folders, formatting, titles on lines or checklists inside them.
- Never a line without a task. Nothing stands alone, and the line goes when its task goes.
- Not a new action. No "Add a note" button, no sixth row on the card, no fifth row in the fold.
- Not text on the Today row. No second line, no date and no count on the row, ever.
- Not in Capture, Close the day, the bedtime prompt or after a tick. No prompt anywhere.
- Not Premium. No ✦, no dimmed state, no paywall, nothing on the Premium page.
- Not on Ours shared rows, repeating tasks, Routines or Rhythms.
- Not a Calendar, Lookback, Notes room or timeline surface.
- Not AI. Nothing reads the line, and nothing offers to.
- Not a Setting.
- No relative time, "last updated", "N days" or "since". No character counter and no error at the cap.
- No staleness of any kind: no nudge about an old line, no fading or warming as it ages, and no count of lines anywhere, including Your patterns.
- No emoji or font glyph for the mark. No "new" dot, badge or coach mark.
- Not a redesign of the held card, the row, Focus, the rename editor or the confirmation line. Change only what the line needs.

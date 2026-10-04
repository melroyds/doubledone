# Handoff: "Where you left off" (one free line per task)

The design for the line on its four existing surfaces: the Today row's mark, the held card, the title editor and Focus. No new action, row, door, screen or setting. **This README is the contract.** Where it and the board disagree, the README wins.

**Files.** `DoubleDone Where You Left Off.html`: the board (open in a browser; pan and zoom). Sections A to D are the directions with a recommendation each; Screens 1 to 14 follow the brief's list.

**Sources.** The brief (4 Oct 2026), its attached screenshots, and the theme tokens in `themes.json` (all 14 palettes). The code folder could not be reached while this was made, so every code figure is the brief's. Existing translated labels drawn in the German and French frames are best-known approximations; the live catalogue wins.

## The calls

1. **Mark: M1, the dog-ear.** A page with its corner turned down and one line on it. Over M2 (a bookmark reads as "saved", the pin's job) and M3 (a folded card corner; Quiet has no card).
2. **Editor: E1, stacked under the title.** Over E2 (an inset index card that restyles every rename and puts inkSoft on bg at 4.50 in Dusk light).
3. **Card: L1, mark-led annotation** under the title. Over L2 (a plain subtitle that loses its tie to the Today mark and gets its date cut when it clamps).
4. **Focus: F1, the slip.** Over F2 (bare on paper, everything at 4.50 in Dusk light).
5. **One colour rule.** The line is always *written* on `surface` (the Standard card face, the Quiet slip, the Focus slip), where `inkSoft` clears 4.84:1 or better in all 14 palettes. The *resting* line on the Quiet card sits on `quiet.pressWash`, so it uses `ink`.
6. **"Noted." is the existing affirm line**, in its existing place, and inside Focus at the same height.

All of it stays inside the bend recorded on 4 Oct: the line sits directly under the title, and the only thing on the card that responds to a tap is the line itself, which opens the existing editor (tap the thing to change the thing).

## Data

```ts
type LeftOff = { text: string; writtenOn: string }; // writtenOn: 'YYYY-MM-DD', the device's local calendar day
// on Task
leftOff?: LeftOff | null;
```

- Code names `leftOff` and `writtenOn`. Never `note` (taken by TaskRow's computed line and by `closeNote`).
- **Eligible:** personal one-off tasks, including each step of a broken-down task, a tiny step, and Later rows. **Never:** Ours shared rows, repeating tasks, Routines, Rhythms. Your "· Ours" copy is eligible (decision 3).
- **Write:** trim; replace newlines and tabs with single spaces (pasted text included); `maxLength={280}` stops input silently; empty after trim sets `leftOff = null`.
- `writtenOn` changes only when `text` changes. Unchanged text is a no-op, silent, with no write.
- Travels with its task: syncs as part of the task, last write wins, like a rename. Combine keeps the most recently written line (decision 4), Break it down keeps it on the silent parent, Make it tiny's parent keeps it and brings it back, Remove keeps it through Undo.
- Never crosses to Ours in either direction: Share to Ours, Bring to my Today and Take this on today all copy without it.
- Export includes it. Account deletion removes it. Never sent to any AI feature, the REST API or MCP.
- Telemetry, names only, no properties, never a word of the text: `leftoff.saved.card`, `leftoff.saved.focus`, `leftoff.cleared`.

## 1. The Today row: the mark

- **Path** (24 grid, `fill="none"`, `strokeWidth={2}`, round caps and joins), the `Mark.tsx` thin-line family:
  - `M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z` (the page, corner cut)
  - `M14 3v3a2 2 0 0 0 2 2h3` (the turned-down corner)
  - `M9 14h6` (the one line)
- **Size** 16 × text scale, exactly as PinMark. **Colour** `inkSoft` in every palette, both appearances (it clears 3:1 on the card, on a pinned row's `accentSoft`, on the Quiet wash and on every light sky stop; see Contrast). A react-native-svg path, never an emoji or a font glyph.
- **Place:** first in the marks cluster, directly after the title, then "just added", the reminder time, ↻ and the pin, **always last**. It never meets ↻ (repeating rows are ineligible).
- Stepped row: before "2 / 5" (the first mark that row has ever carried). Tiny step: the right end of the title line. "Looks big, break it down?" row: the first line, the link unchanged.
- **Marquee:** the mark lives outside the marquee's clip, so a scrolling title never covers it.
- **Row height unchanged.** No second line, no text, no date, no count. It does not change with the line's age. No animation, ever.
- **Select mode:** the mark stays, so the row keeps its shape when the mode changes.
- **Screen readers:** the mark is hidden (`importantForAccessibility="no-hide-descendants"` / `accessibilityElementsHidden`, `aria-hidden` on web). The row label gains ", has a note".
- **Label order:** title (or "{title}, pinned as today's one thing"), ", marked as a big task", **", has a note"**, ", repeating", ", reminder at {time}", ", holding you to this", ", from your shared list", ", just added", the computed `note`, the reason it cannot be ticked. The task's own properties first (big, its line), then schedule, then states.
- Stepped: "{title}, 2 of 5 done, has a note, tap to advance, hold to adjust" (inserted after the progress clause, before the instructions, in every locale). Tiny step: "{title}, a tiny step toward {parent}, has a note".

## 2. The held card: the line

Rendered only when `leftOff` exists. An empty card is unchanged: no label, no hint, no space held.

- **Place:** directly under the title, before the hero. A Pressable row: the mark (16 × scale, `inkSoft`), `spacing.two` gap, then a column of the words and the date (`spacing.half` between).
- **Spacing:** left inset `spacing.two` (aligned with the title's own 8), the title's existing 4 below it plus the column gap 2 above, `spacing.two` below before the hero. `minHeight: 44`.
- **Words:** 15/21 Atkinson regular (the `label` size at regular weight), `numberOfLines={2}`, tail ellipsis. **Date:** 13/18 (`caption`), alone on the next line, so a clamp can never cut it.
- **Colour:** Standard `inkSoft` for both. Quiet `ink` for both (on `quiet.pressWash`, `inkSoft` fails 4.5:1 in six of seven light palettes). Faintness comes from size, regular weight and position under a 22pt serif title.
- **Tap:** opens the title editor with the **line** field focused, cursor at the end. Press: opacity 0.7 (`PRESSED_OPACITY`). A mis-tap between title and line is harmless: both open the same editor.
- **The whole line** is read in Focus, in the editor, and always in the spoken label.
- **Spoken:** role button; label "{label}: {line}. {spokenDate}." e.g. "Where you left off: Called, ref 4471, ring back Thu. Wednesday 30 September."; hint "Edit it." Reading order: title, line, hero, the rest.
- **Title button label** (eligible tasks only, with or without a line): "Edit the title and where you left off: {title}". Ineligible tasks keep "Edit the title: {title}".

## 3. The title editor

**Anatomy (E1).** Title field (unchanged 22/28 serif), `spacing.three` (12) gap, then the line field, which sits exactly where the resting line sits, led by the same mark.

- Standard line field: `minHeight: 44`, multiline display, underline `border.hair` `line`, `border.thin` `accent` when focused. Text 15/21 `ink`; placeholder `inkSoft` (on the card face: passes everywhere).
- Quiet line field: a slip. `backgroundColor: surface`, `radius.sm`, padding `spacing.three` by `spacing.two`, `minHeight: 44`, no outline; focused: a `border.thin` `accent` ring. The fill is there because the placeholder needs `surface` to clear 4.5:1, and because Quiet cannot use an outline to say "field".
- **Only the focused field looks focused:** focused gets the thin accent underline (or ring), the other drops to a hairline in `line`. This changes the title field's resting underline from accent to `line` while its sibling is focused: the one change the second field forces on the rename editor.
- Second field's spoken name: "Where you left off". It shows only for eligible tasks. Repeating rows on Today and every row in the Ours room keep today's single-field editor.

**Focus order:** title field, line field, then the card's actions as today. **Return keys:** title `returnKeyType="next"` moves focus to the line; line `returnKeyType="done"`, `blurOnSubmit`, saves and closes.

**Saving.** The two fields are one group. A field's blur does not close the editor if focus went to its sibling:

```ts
onBlur = () => requestAnimationFrame(() => {
  if (titleRef.current?.isFocused() || lineRef.current?.isFocused()) return; // moved between fields
  saveTitle(); saveLine(); closeEditor();
});
```

- Title: empty or unchanged is a no-op, as today. A changed title saves silently, as today.
- Line: trimmed text differs and is non-empty: save, set `writtenOn` to today. Cleared: `leftOff = null`; the line and the Today mark go. Unchanged: nothing.
- **"Noted." fires** once, when the editor closes by itself (return/done key, a tap outside, the keyboard dismissed) **and** the line was saved with new words.
- **Silent:** title-only renames; an unchanged line; **clearing** (the vanishing line is the feedback, the same reasoning as a silent rename); and a save caused by pressing another action (Break down, Move to…, Close, Remove…), whose own feedback takes over.
- The card stays open after saving, as rename does.

## 4. Focus

**The slip (F1)**, under the title and under "Step 2 of 5" when stepped, above the actions. It inherits the column's `spacing.four` gap; the actions keep their own 16 above.

- `backgroundColor: surface`, `radius.md`, padding `spacing.three` by `spacing.four`, full column width (max 440), contents centred. Standard: `border.hair` `line`. Quiet: no border.
- **Filled:** the label (the mark at 14 × scale plus "Where you left off", 13/18 bold `inkSoft`), `spacing.two`, the words (17/24 `ink`, the full line, never clamped), `spacing.one`, the date (14/19 `inkSoft`).
- **Empty:** the placeholder only ("Where you left off, for next time", 17/24 `inkSoft`). No label, no question. The same slip on every visit, never appearing or changing because of anything just done, and never after Done.
- The words are a centred multiline TextInput (`maxLength={280}`, `returnKeyType="done"`, `blurOnSubmit`). Editing: a `border.thin` `accent` ring on the slip. The label appears at the moment a first line is saved, never mid-typing.
- **"Noted."** fires on done or a tap on empty paper with new words. It lands in the affirm line's own style at the height it holds on Today (centred, 96 above the bottom edge), never over the task. **Silent** when the save is caused by Done, Choose another or Exit: the screen is moving on.
- **Which one?** stays titles only. Focus only ever shows eligible tasks, so no Focus task lacks the slip.
- **A step of a broken-down task** (decision 2) shows the big task's line below its own slip, read-only: a hairline (`border.hair` `line`) with `spacing.three` above it, then "{bigTitle}: {line}" (title bold, words regular, 15/21 `ink`) and its own date (13/18 `ink`), centred on bare paper. No panel, no press state, not focusable as a control, so it can never be mistaken for the step's own field. It is always below the step's slip, so writing the step's line never moves it. Not on the steps' Today rows (the mark means the row's own line) and not on their held cards. A tiny step is unchanged.
- **Why `ink`, not `inkSoft`:** the big task's line sits on bare paper, where `inkSoft` is 4.50 in Dusk light, a pass with no margin. Hierarchy comes from weight and size instead.
- **Stale handhold, said plainly:** nothing can edit or clear the big task's line while its steps are open, so it can go out of date across a long breakdown. Its own date makes that visible without any age treatment. The fix is the Tier 2 item below (edit it from a step); the layout already has room for that, and for nothing more: at most two lines, never a third.

## 5. Strings, all five languages

All drafts. German follows the glossary (warm du) and the French, Spanish and Italian need native review.

| Key | en | de | es | fr | it |
|---|---|---|---|---|---|
| `leftOff.placeholder` | Where you left off, for next time | Wo du stehengeblieben bist, fürs nächste Mal | Dónde lo dejaste, para la próxima vez | Où tu en étais, pour la prochaine fois | A che punto eri, per la prossima volta |
| `leftOff.label` (Focus label, field's spoken name) | Where you left off | Wo du stehengeblieben bist | Dónde lo dejaste | Où tu en étais | A che punto eri |
| `leftOff.saved` | Noted. | Gemerkt. | Apuntado. | C’est gardé. | Preso nota. |
| `row.a11y.hasLeftOff` | , has a note | , mit Notiz | , con una nota | , avec une note | , con una nota |
| `card.a11y.editTitleAndLeftOff` | Edit the title and where you left off: {title} | Titel und Notiz bearbeiten: {title} | Editar el título y dónde lo dejaste: {title} | Modifier le titre et où tu en étais : {title} | Modifica il titolo e a che punto eri: {title} |
| `card.a11y.leftOffHint` | Edit it. | Bearbeiten. | Editar. | Modifier. | Modifica. |
| `focus.parentLeftOff` (visible) | {bigTitle}: {line} | {bigTitle}: {line} | {bigTitle}: {line} | {bigTitle} : {line} | {bigTitle}: {line} |
| `focus.a11y.parentLeftOff` | {bigTitle}. Where you left off: {line}. {date}. | {bigTitle}. Wo du stehengeblieben bist: {line}. {date}. | {bigTitle}. Dónde lo dejaste: {line}. {date}. | {bigTitle}. Où tu en étais : {line}. {date}. | {bigTitle}. A che punto eri: {line}. {date}. |

The visible attribution is the big task's title, bold, then the line, so the five locales share one shape and no slot sits mid-clause. Examples: "Do the tax return: receipts are in the blue folder", "Steuererklärung machen: Belege liegen im blauen Ordner", "Faire la déclaration d’impôts : les reçus sont dans le classeur bleu".

- **Spoken line:** `{label}: {line}. {spokenDate}.` (French: `{label} : {line}. {spokenDate}.`). Every slot sits at the end of its own sentence, never mid-clause.
- **"Noted." never reuses the tick's word:** the tick pool says Notiert / C’est noté / Quedó anotado / Segnato. Gemerkt, gardé, apuntado and preso nota are different words.
- **Gender:** "Où tu en étais" and "A che punto eri" avoid the participles in "là où tu t’es arrêté·e" and "dove eri rimasto·a", which would agree with the user. Spanish follows the settle screen's "donde lo dejaste", agreeing with the task.
- **Headroom:** German runs about 35% over English. Every string wraps; nothing is truncated; nothing is set on one line.

## 6. The date rule

```ts
const day = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); }; // local noon, DST-safe
const shown  = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short' });
const spoken = new Intl.DateTimeFormat(locale, { weekday: 'long',  day: 'numeric', month: 'long'  });
```

- Always the calendar date of the last write. No time, no "today", "yesterday", "ago", "last updated", duration or count. A line written today shows today's date (Sun, 4 Oct).
- **Why never relative:** a relative date is a measurement of time passing, and on an open task that reads as how long it has sat. `Intl.RelativeTimeFormat` also crashed two Android releases at launch. `friendlyDate` and `relativeDay` must not be used here.
- Shown, 30 Sept 2026: en-AU "Wed, 30 Sept", en-US "Wed, Sep 30", de-DE "Mi., 30. Sept.", fr-FR "mer. 30 sept.", es-ES "mié, 30 sept", es-MX "mié 30 de sep", it-IT "mer 30 set". Design for the longest; iOS and Android punctuation may differ.
- Spoken: "Wednesday 30 September", "Mittwoch, 30. September", "miércoles, 30 de septiembre", "mercredi 30 septembre", "mercoledì 30 settembre".
- Never on the Today row. Identical at any age: no fading, warming or restyling. (Year: flag 5.)

## 7. Keyboard plan

**Held-card editor.**
- iOS: on focus of either field, `measureInWindow` the focused field; with the frame from `keyboardWillShow` (or `Keyboard.metrics()` if already up), if `fieldBottom + spacing.four > windowHeight - keyboardHeight`, scroll Today's list by the difference (animated; not under reduced motion). Repeat when return moves focus to the line.
- Android edge-to-edge (resize is ignored): the same, from `keyboardDidShow`, plus a bottom content inset equal to the keyboard height while the editor is open, so a row near the end can scroll high enough.
- Web: the page resizes. Point the existing scroll-into-view at the focused field rather than the card.
- On close, remove the inset; never scroll back.

**Focus.** iOS: `KeyboardAvoidingView behavior="padding"` round the existing ScrollView; the column re-centres in the space above the keyboard. Android: pad the ScrollView by the keyboard height from `keyboardDidShow`, then `scrollTo` the slip. Web: the resize. Done and Choose another stay reachable by scrolling; the keyboard's done key ends editing.

## 8. Motion

| Element | Motion | Reduced motion |
|---|---|---|
| Card line | Part of the card: rises with it, 180ms, 4 settle | The card's 90ms dissolve |
| Second field | Appears with the title editor, same frame | Same |
| Focus slip | Arrives with Focus's fade | Focus's reduced variant |
| "Noted." | The affirm's existing fade, cleared after 3.5s | 90ms dissolve in and out |
| Mark | None, ever. Present when the row renders | Same |
| Press (line, slip) | Opacity 0.7, instant | Same |

## 9. Accessibility

- **Targets:** line block, line field and slip are all at least 44 tall. Title field to line field: 12 apart; give the title field `hitSlop={{ top: 6 }}` if its rendered height is under 44.
- **Focus order:** card: title, line, hero, rows, rail, More, shelf. Editor: title field, line field, then the card. Focus: Exit, title (heading), Step 2 of 5, the line field, the date, Choose another, Done.
- **Spoken:** row ", has a note" (order in §1); card line and title button (§2); field name "Where you left off", its value the words or the placeholder; Focus date read as the spoken long form after the field. The visible Focus label is hidden from readers (the field's name already says it).
- **Announcements:** "Noted." through `AccessibilityInfo.announceForAccessibility`, the affirm's existing path. Clearing is silent for everyone: the line leaves the reading order, the same feedback sighted users get.
- **Web keyboard focus:** a 2px `accent` ring, offset 2, on the line block and the slip. Text fields show focus through their own thin accent underline or ring; `outlineStyle: 'none'` on both fields so the title stops showing the browser's default outline (visible in rename-*.png) and matches its sibling.
- **Large text:** everything wraps, nothing clips, at Large × 200% in German at 320 (Screen 10). At a combined scale of 2 or more, two things keep German readable rather than chopped. Tighten the list inset (`spacing.five` to `spacing.three`) and the card padding (`spacing.four` to `spacing.two`). Hyphenate the title, the line and the action labels at syllables: `android_hyphenationFrequency="full"` on Android, `hyphens: auto` with the locale as `lang` on web. iOS Text has no hyphenation, so a long compound still breaks there without a hyphen. These touch the whole card, not just the line, so treat them as a large-text recommendation the line exposes, outside this round's bend if you prefer.

## 10. Contrast, computed

From `themes.json`. `surfaceCard` is approximated as opaque `surface` (as the brief does); `quiet.pressWash` is `accentSoft` at 78% over `bg` (85% in dark). Text needs 4.5:1, the mark 3:1. Sky: the lightest and darkest light stops (#FAF4EC, #D7D2E3); dark stops quoted from the brief.

| Palette | inkSoft on surface: card line, date, placeholders, slip label and date, mark on a card | ink on Quiet wash: resting Quiet line and date | ink on surface: field text, Focus words | inkSoft on Quiet wash: glyph, Quiet pinned and held rows (3:1) | inkSoft on accentSoft: mark on a pinned row (3:1) | inkSoft on the sky: Quiet row mark (3:1) |
|---|---|---|---|---|---|---|
| Dusk light | 4.84 | 12.60 | 14.83 | 4.11 | 4.01 | 3.28 |
| Dusk dark | 6.09 | 11.91 | 13.54 | 5.35 | 5.12 | 5.75 to 8.19 (brief) |
| Sage light | 5.10 | 12.45 | 14.62 | 4.35 | 4.26 | 3.46 |
| Sage dark | 6.58 | 11.78 | 13.18 | 5.88 | 5.62 | 5.75 to 8.19 (brief) |
| Slate light | 5.03 | 12.65 | 14.81 | 4.29 | 4.22 | 3.40 |
| Slate dark | 6.58 | 11.60 | 13.36 | 5.72 | 5.43 | 5.75 to 8.19 (brief) |
| Heather light | 5.24 | 12.48 | 14.87 | 4.40 | 4.31 | 3.55 |
| Heather dark | 6.42 | 12.17 | 13.44 | 5.81 | 5.59 | 5.75 to 8.19 (brief) |
| Fog light | 5.11 | 12.78 | 14.97 | 4.36 | 4.29 | 3.46 |
| Fog dark | 6.52 | 11.66 | 13.50 | 5.63 | 5.34 | 5.75 to 8.19 (brief) |
| Honey light | 5.28 | 12.96 | 14.85 | 4.60 | 4.52 | 3.57 |
| Honey dark | 6.15 | 12.29 | 13.57 | 5.57 | 5.36 | 5.75 to 8.19 (brief) |
| Rose light | 5.28 | 12.76 | 15.04 | 4.48 | 4.38 | 3.57 |
| Rose dark | 6.31 | 12.11 | 13.64 | 5.60 | 5.38 | 5.75 to 8.19 (brief) |

**Nothing fails.** Lowest: 4.84 (text on surface), 11.60 (Quiet line on wash), 4.11 and 4.01 (the mark on washes), 3.28 (the mark on the light sky). `inkFaint` is used by nothing in this design. "Noted." is the existing affirm component, unchanged.

## 11. Decided since the first pass (part of "Decided, do not reopen")

1. **The line on the held card.** Drawn: Screens 2, 3, 6, 8 to 12. Fits the design as is.
2. **The big task's line on its steps, in Focus only.** Drawn: S5-6 (both lines), S5-7 (its own field empty), S10-3 (German stress), S11-3 (French). See §4. It does not break the design. The one cost is the stale handhold, stated in §4.
3. **Your "· Ours" copy carries a line of its own, private to you.** Drawn: S7-O. The mark keeps its first place among the marks, so it sits between the title and "· Ours". A tick that closes both leaves the line on your copy only; a fresh copy of a repeating shared row starts with no line, and the old line stays on the finished copy.
4. **Combine keeps the most recently written line, with its own date.** Stated, not drawn: nothing about lines is shown or asked while combining. Text is never merged; the other lines leave with the folded tasks. When a combine folds away every remaining step of a broken-down task, the big task's line is a candidate.
5. **A one-off with a line later made repeating keeps it hidden.** Stated, not drawn (only the REST API or an agent can do it): no mark, line, field or Focus while repeating; still exported, never deleted; back unchanged, original date, if it becomes a one-off again.
6. **Finished tasks are unchanged.** Drawn: Screen 14 (done card and done rows, light and dark, exactly as today). The line stays on the task and in the export, and returns as it was if un-ticked.

**Where any of these breaks the design:** none do. Decision 3 makes the mark's place visible next to "· Ours", which reads fine; if "· Ours" should stay attached to the title, the rule becomes "the mark comes after "· Ours"", a one-line change.

**Still open, raised here:** should the date add the year when `writtenOn` is in a different calendar year? Without it, a line from 30 Sept 2025 reads as this year; with it, the format changes once a year passes. Frames show no year.

## 12. Left out on purpose

- **Anything on an empty card.** No label, dot or hint. The title's spoken label carries it for screen readers.
- **Expanding the line in place.** Tapping it opens the editor; Focus and the spoken label give the whole line. One response per tap.
- **"Noted." on clearing**, on title-only renames, and when another action caused the save.
- **Newlines.** One line means one line; pasted breaks become spaces.
- **A counter, message or colour change at 280.**
- **Relative time, time of day, and any treatment that tracks age.**
- **Lines in Focus's "Which one?" list,** and anywhere that gathers lines.
- **Any new focus style** beyond making the title field match the line field.
- **Hooks for Tier 3:** no "Earlier", no history, no AI option.

## 13. Still Tier 2: none drawn, room left

- A Make-it-tiny parent's line in its resurfacing line.
- Editing a big task's line from one of its steps (Focus has room for this line to become editable, nothing more).
- A finished task's line on its Calendar row.
- **Rejected directions:** M2, M3, E2, L2, F2 (reasons in The calls and on the board).

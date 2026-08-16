# Round three: five corrections to the When pack

*Paste into the same Claude Design conversation that produced the v2 boards. Written 2026-08-16 after
an adversarial review of that pack against the code.*

---

## Read this first

**The design is right. Keep it.** The zone that relabels itself from "A day" to "Starting" when a
rhythm goes live is the correct answer, it survived six independent attacks, and nothing below
questions it. Keep `requireRhythm` as one boolean on one component. Keep every refusal (no stop
button, no per-occurrence skip, no second sheet, no tooltip, no confirms, no overdue). Keep the
two-line summary rule of a dot-joined fragment plus a whole fixed sentence. Keep the door rename.
Keep A1, A2, A3 exactly as drawn.

**This asks for five corrections and five boards back** (A4, B2, B3, B4, C1). It is not a redesign
and should not be treated as one. Round two got the app right where round one got it wrong; what follows is the
remaining gap between the boards and the code.

---

## 1. The "Today" chip has no legal encoding, and this app has already been bitten by it

`scheduleFields` maps **both** `today` and `anytime` to "no scheduling fields". On a personal task
that is correct, because an undated personal task means today. **On a shared row it means the row
reaches nobody**, because placement requires an actual date string.

So a Today chip that goes the obvious route would look chosen, the button would read "Set · Today",
the summary would say "You'll both see it that day", and the row would silently appear on neither
person's day.

This exact bug already shipped once on the shared capture bar directly above this sheet, and the fix
is still in the code with a comment that reads almost like this paragraph. **On Ours, Today must
write a real date.**

**Also: `once(date)` does not exist.** The recurrence type has four variants and none of them carries
a date. A date is a separate field on the row. The save contract is:

```
onSave(title, { due?: string | null, recurrence?: Recurrence })
```

which is exactly the shape the app's existing scheduling helper already returns and the room already
consumes. One of `due` / `recurrence` is set, never both, and clearing one is `null`. Drop the word
`once` from the pack.

## 2. The sheet cannot currently see the row's date, so B2's date chip cannot exist yet

The sheet's props carry the title and the rhythm, and nothing else. It is seeded once per open. So
the fourth chip on B2, drawn as the row's own "Thu 20 Aug", has nothing to fill it from.

This is a one-prop fix, but the pack should say so: **`requireRhythm` is one of three new props, not
one.** The other two are the row's current date, and a way for the caller to say what the sheet may
emit.

## 3. B3 and C1 delete the only place a series' start is shown

The sheet **already renders the start date today**, as a labelled value you can tap ("Starting from
· Mon 4 Aug"). B3 and C1 replace that with four unselected chips and a sentence promising the start
is preserved.

For a weekly series that is a small loss. **For an "every 3 days" series it is the whole schedule**,
because the anchor is what decides which days those are, and the app only writes a start into the
rhythm's own summary when that start is in the future. So on a live series the actual start would
appear nowhere on screen, and the cheapest way to find out what it is becomes tapping a chip, which
re-phases the series for two people.

**Fix:** apply B2's own rule to the start zone. The fourth chip carries the seeded anchor and is
**selected**. Keep the "Keeps its current start unless you pick a new one" line only when there is no
seeded anchor to show.

## 4. B4's release should default to Anytime, not to the carried anchor

B4 releases the rhythm and offers the old anchor as the day. That anchor is usually in the **past**:
a bin-night weekly set in January carries a January date. A past date renders as a bare day with no
year and no marker (correctly, the app refuses overdue rendering), and a shared row with a past date
is placed on both Todays **from that day onward, with no end**.

So the most common release, ending a months-old repeat, would offer a day in May, promise "You'll
both see it that day", and on Set land on both people's Todays permanently.

The two defaults are not symmetric. Anytime costs nothing and is undoable. A stale date costs two
people their mornings. **Release defaults to Anytime selected, with the old anchor still offered as
an unselected chip so nothing is lost.** Summary: "The rhythm ends." then "Anytime" then "It stays on
the list."

## 5. A4 is wrong twice, and it is the brief's fault, not yours

The v2 prompt said an unreadable rhythm "must keep its route onto somebody's day". That was written
from memory and it is wrong about which route.

- **It does not fire onto anybody's Today.** The placement function returns false for an unreadable
  rhythm before it checks anything else, deliberately, because this build cannot know which days a
  newer build meant and a wrong day on a shared surface is a thing the other person has to puzzle
  over. So "it keeps its days" and "keeps firing onto both Todays on its days" are both false.
- **`Bring to my Today` DOES render on that row**, because an unreadable rhythm leaves the readable
  rhythm field empty and the row carries no date, which is exactly the condition the app uses to
  offer Bring. A4 draws no Bring. **It is that row's only route onto anybody's day**, so removing it
  strands the row completely.

**Worth noting, because it sharpens the lesson:** the app already ships the correct sentence. It
reads "On a rhythm this version can't read yet. It's safe, and it'll appear on its days after an
update." Future tense, accurate. The board replaced correct shipped copy with new copy that says the
opposite. So this is not a gap the design failed to fill, it is a true thing that was overwritten,
and the cause was one sentence in the brief.

**Fix:** redraw A4 with `Bring to my Today` present and leading, restore the shipped string verbatim
rather than cutting a new key, and delete the "keeps firing" sentence from the prose.

---

## Two smaller things to correct in the README

- The stated reason for retiring the `note` prop is that it claimed "on its day" when Anytime was
  about to be true. It never has: the shipped sheet cannot emit Anytime at all, so that note has been
  accurate on every save it could make. **Retiring it is still right**, because the state-aware
  summary is better. The reason is wrong, and it is round one's exact failure (describing the app
  from memory) surviving into round two.
- "The current value sits beside it, always" is the door's promise. Corrections 2 and 3 are both
  cases where the sheet breaks that promise. Make it hold on both surfaces, or drop "always".

## What to send back

Only the affected boards: **A4, B2, B3, B4, C1**, plus the corrected strings and save contract.
A1, A2, A3 and every refusal stand as drawn.

## Voice, unchanged

No em-dashes at all. Minimal semicolons. Calm, plain, no exclamation marks. Nothing clinical. Five
locales (en/de/es/fr/it), fragments and whole sentences only, never a sentence assembled around a
mid-clause slot.


---

# ACCEPTED. The design is settled. Build it.

*2026-08-16, after checking the v3 corrections pack against the code.*

All five corrections landed. Checked for new factual errors and found none:

- Every date and weekday pair on the board is correct (16 Aug Sun, 17 Aug Mon, 20 Aug Thu, 4 Aug Tue,
  13 Aug Thu, 6 Jan Tue). Six for six.
- The B3 fragment "Every Tuesday · from Tue 4 Aug" is not invented. It is the verbatim output of the
  shipped `repeat.fromDate` key, which is `'{base} · from {date}'`. The board reused an existing
  string shape rather than cutting a new one.
- It corrected only what was asked and declined to redraw A1 to A3.

**Per the stopping rule, this is the last design round.** Three build notes follow, so they are not
lost. They are implementation details, not another round.

## Build note 1: `describeRecurrence` will silently undo correction 3

The fragment for a repeating row must show the anchor **always**. `describeRecurrence` shows a start
only when it is in the FUTURE (`recurrence.ts:53`, `start > toISODate(today)`), because it was
written for the drawer, where a not-yet-active habit is the case worth surfacing.

So a build that reaches for `describeRecurrence` to make the fragment gets "Every Tuesday" for a live
series and drops the anchor, which is exactly the bug correction 3 exists to fix. Fixed in the design,
reintroduced in the code, and it would look right in every test written after the fact.

**The fragment builder passes the anchor itself.** Reuse `repeat.fromDate`, do not reuse
`describeRecurrence`.

## Build note 2: the commit button contradicts itself on the board

The board states the rule as `"Set · " + fragment`, and then writes the Today case as
**"Set · Today, Sun 16 Aug"** with a comma, while its own fragment for that case is
**"Today · Sun 16 Aug"** with a dot. Applying the stated rule gives "Set · Today · Sun 16 Aug".

Two dots in one button reads badly, which is presumably why the comma appeared. Pick one and write it
down, because as drawn this produces two catalog keys where one was intended. My preference: keep the
rule, and let the Today fragment be just "Today". The date is already on the chip, and the fixed
sentence beneath says "You'll both see it today."

## Build note 3: the unreadable string is a rewrite, not the restore that was asked for

The delta asked for the shipped string verbatim. The board wrote "It's safe. It will appear on its
days after an update." against the shipped `ours.repeatUnknown`, which reads "On a rhythm this version
can't read yet. It's safe, and it'll appear on its days after an update."

This is defensible: the leading clause moved onto the door's value line, and the row note and the held
card's reason are genuinely different slots. So a second key is legitimate. Just be deliberate about
it, and keep the two in step, rather than letting the room and the card drift into saying the same
thing two ways.

## Still open, and it is mine, not the design's

The extended sheet's **overflow** was never asked. `CadenceSheet` calls `<ModalCard>` with no `scroll`
and no `maxHeight` (`CadenceSheet.tsx:101`), and `ModalCard` supports both (`ModalCard.tsx:62`,
`:79-86`). B3 now stacks a title, two zone labels, seven chips, seven weekday toggles, a fragment, a
sentence and a button, and C1 adds a stepper row. At the largest accessible text size that overflows
with nothing to scroll.

I named this as the main reason to run round three and then left it out of the delta. It is a build
decision, taken on a device at the largest text size, with `BreakdownQuestions.tsx:60-61` as the
precedent for the scroll host.

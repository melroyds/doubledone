# Claude Design prompt, Ours round two — DRAFT

> **Not ready to send.** Two adversarial audits are still running: the Phase 3 engine audit (merge,
> sync, clock, cache) and the four per-language copy passes. Both can add constraints to the list
> below. Melroy's round-one Claude Design output also needs folding in, so that this brief says
> "here is what you already decided, here is what you have not seen" rather than starting over.
>
> Sections marked **[HOLD]** are waiting on one of those three inputs.

---

## What round one covered

Round one designed the pairing surface: the nine states from nothing-yet through to a closed list.
That is the door. **This round is the room**, plus the parts of the door that only make sense once
you can see inside.

Round one's handoff is kept at [`ours-design-round1.md`](ours-design-round1.md). Its four argued
positions, all accepted: **naming comes first** (purpose, then your name, then their email, so the
screen that can fail comes last, beside the code it binds); **waiting is not a screen** (a waiting
state is a read receipt by another name, folded into the code screen as one line); **leaving stays
visible** on every visit, because a hidden exit reads as a locked door and the threat model is
domestic; and **the word stays Ours**.

It also settled the Phase 3 held card with three cuts, which this round should treat as decided:
drop **Mark as a lot** (weight is private capacity language, and on a shared row it reads as
commentary on the other person's task), drop **Pin** (one person's premium must never reorder what
the other sees), and add exactly one action, **Bring to my Today**, the only bridge between the two
rooms.

And one rule this round must not break: **nothing ever animates because of the other person.** No
presence, no typing indicator, no pulse on join. You find things changed when you look, like a
kitchen table.

---

## The product, unchanged

DoubleDone is a calm, never-shame daily to-do app for adults with ADHD, autism, the AuDHD overlap
and OCD, live on web, the App Store and Google Play. The spine: **today is finite and achievable**.
The standing rule: **remove friction, never add a setting**. Brand is "Dusk": Newsreader serif for
headings, Atkinson Hyperlegible for body, soft mauve (#946475) with sage (#7E9B6B), honey (#C19A4F)
and periwinkle (#6E72A0) as rare notes, warm paper (#FAF6F1) with a full dark mode (#1B1917).

**Ours** is one shared list between exactly two people. Joined by a six-character code bound to one
email address. Named for its purpose. Nothing on it touches your Today unless you put it there.

---

## The laws, restated because this round is where they get tested

Round one's brief carried these and they have only got sharper, because two of them are now enforced
by the database rather than by intention.

1. **Nothing ever attributes a completed task to a person.** There is no column recording who ticked
   what; a per-person tally is *uncomputable*, not withheld. New since round one: a standing rule now
   also forbids per-person completion state that is merely *pending*. Mutual confirm, verify
   together, two-key done and sign-off are all refused by one line. Design nothing that implies any
   of it exists, now or later.
2. **Nothing counts, compares or scores.** No progress bar across two people. **No number on the
   Today door, ever**, because it is a number another person can change on the one screen whose
   promise is that today is finite.
3. **No email address or account identifier is ever shown to the other person.**
4. **Every pair is a sealed room.** Nothing renders how many lists someone is in, or with whom.
5. **The second seat did not necessarily choose this app.** Someone is being handed a productivity
   system by their partner. Everything they meet first must read as an invitation they may decline.
6. **Never shame the backlog**, doubled: a task sitting undone on a shared list must never look like
   a person letting someone down.

---

## What to design this round

### A. The shared list itself

The room round one built the door to. It reuses Today's grammar: the same rows, the same held card
minus the AI actions. Design what is DIFFERENT, and argue if you think the answer is "nothing".

1. **The list at rest.** A named list, two people, a handful of things. What tells you at a glance
   that this is shared without ever telling you who did what.
2. **A row that changed while you were not looking.** Your person ticked something, or removed
   something, or renamed it. This is the single most delicate frame in the feature: it has to be
   noticeable without being an activity feed, and it must name nobody.
3. **The held card, shared.** Same gestures as Today, minus Break-it-down and the other AI actions.
   What replaces them, if anything.
4. **Empty.** A brand new shared list with nothing on it, seen by two people who have just paired
   and do not yet know what this is for.

### B. The bridges between Ours and your Today

The mechanic that makes the whole thing safe: **nothing crosses without a person choosing it.**

5. **Pulling a shared task onto your Today.** The gesture, and what it leaves behind on the shared
   list. A pulled task is a copy that knows where it came from.
6. **Your tick closing the shared row**, and what that looks like from the other side.
7. **Their tick, when you had pulled it.** Your copy quietly goes away. It is never marked done,
   because work you did not do must never enter your Lookback. Design that disappearance so it reads
   as relief rather than loss.
8. **Sharing one of your own tasks to Ours**, from the personal held card.

### C. Repeating things, which is what makes a household list a household list

9. **A repeating shared row.** The bins, the meds, the recycling. Both people can tick it, either can
   un-tick it, and the app records only that the day was done, never by whom.
10. **Setting a cadence on Ours**, reusing the repeating drawer rather than a second surface.

### D. The guards, which are mostly emotional design

11. **"Recently removed."** A dimmed row with Restore, for seven days, naming nobody. The alternative
    is a thing vanishing from a list two people share, which reads as an accusation.
12. **A frozen list, in use.** Round one designed being told it is closed. This is living with it:
    reading it, taking things across one at a time, and the one irreversible button.
13. **The undo for "Delete this list for good".** It cannot be undone once the server is told, so the
    only honest version holds the deletion locally and commits when the window closes. Design that
    window. It is the app's one irreversible action and currently ships with only a warning line.

### E. The door on Today

14. **The quiet entry.** Reads as the list's name, or the app's own word for it. **No count.** It has
    to be findable without ever nagging someone who will never use it, on the screen this product
    protects most carefully.

---

## Things to argue with

- Whether the shared list should live behind a door at all, or as a section of Today. The
  architecture assumes a door; say if you think that is wrong, and what it costs.
- Whether "Recently removed" earns its space, or whether a tombstone should just be gone.
- Whether a changed row needs any marker at all, given that no marker can name a person.
- Round one kept the word **Ours** and argued it well (Together reads as a feature launch, The
  Shared List is clinical, Both is not a noun, and Us breaks in copy: "Us is closed"). Reopen only
  if this round finds a surface where it fails.

---

## What round one assumed that the build cannot do yet

Four of its decisions need server or seam work, not layout. They are listed here so this round knows
they are being built rather than quietly designed around.

1. **Editing your own chosen name on the resting screen (D7).** `pair_members` has a select policy
   and a delete-self policy and deliberately NO update policy, because that absence is what stops
   either person editing the other's row. So a self-rename after pairing is currently impossible.
   Needs a definer RPC scoped to `auth.uid()`, which preserves the control.
2. **"Kept with Alex, since June" (D7).** The date exists (`pair_members.joined_at`,
   `pairs.created_at`) but the membership read does not return it.
3. **"Put it away" (D8), which tucks and deletes nothing.** The build's current action is
   `forget_pair`, which is destructive and cannot be undone once the server is told. Round one is
   right and the build is wrong here, and its version removes the delayed-commit undo problem
   entirely. Open question from round one, still open: where a tucked-away closed list is
   retrievable from.
4. **The door on Today, plus a Menu entry (D10).** The build currently puts the door in Settings,
   which was a Phase 2 placeholder. Round one's shape (a hairline row after the day's list, before
   the tools card, no row at all when there is no shared list) is the target.

## Constraints from the build

Facts about what the system can and cannot do, so nothing here gets designed into a promise the
software cannot keep. Round one had three of these and used them well.

1. **The screen cannot know whether an outstanding invite code is still alive.** The invite table is
   closed to the client and the expiry is returned exactly once, at mint. After a reload, all the
   app knows is that nobody has joined. Round one's decision to fold waiting into the code screen is
   compatible with this; nothing may show a countdown or grey out a dead code.
2. **A shared task's title is capped at 500 characters, and the personal list has no cap.** So
   anything that copies a personal task onto Ours can meet a limit that has never existed anywhere
   else in the app. It truncates rather than failing, but the capture surface should show the ceiling
   honestly rather than let someone discover it.
3. **Deleting a list cannot be undone once the server is told.** Round one's "Put it away", which
   tucks and deletes nothing, is the right answer and supersedes the build's destructive action.
   Whatever irreversible action survives needs a delayed commit, not an undo toast, because a toast
   would be a lie.
4. **Nothing can ever attribute a completed task to a person, including a PENDING one.** Since round
   one this became a written rule: mutual confirm, verify together, two-key done and sign-off are all
   refused in advance. The reason is narrow and worth knowing, because it also rules out subtler
   things: any gate that works has to be visible to the server, and server-visible per-party state on
   a list of exactly two people is a per-person record. Design nothing that implies one could exist.
5. **A repeating shared row records only WHICH DAYS were done, never by whom, and either person can
   un-tick.** Un-ticking is load-bearing: it is the reason the finality affirmations are withheld on
   Ours, and it is the reason two-party confirmation was refused. It must be as easy as ticking.
6. **A cadence one person's app cannot read is possible**, because the other person may be on a newer
   build. That row is carried and never erased, but it cannot be scheduled. **Open, and worth your
   view:** on a shared surface, is it safer to show a row you cannot place on a day, or to hide it?
   Hiding it means one person sees it and the other does not, each certain the other deleted it.

### New states since round one, all from decisions made after it

7. **An archive of closed lists.** Round one's D8 assumed there is only ever one list. There can now
   be a live list and any number of frozen ones, and they stay readable, because "you can still read
   everything here" is promised in five languages and should stay true. Design the quiet read-only
   archive and how a closed list is reached from a live one.
8. **Resuming a frozen list, which is the handshake again.** One person mints a resume code, the
   other redeems it, and every word is still there. **Never unilateral**, and that is the design, not
   a limitation: leaving has to stay a door the other person cannot drag you back through. Two
   frames: offering to resume, and being asked to. The second is the delicate one, because it lands
   with someone who may not want to.
   One gift from the architecture: resuming does NOT ask for their email again, because both people
   are already members and the server knows. The sharpest edge in the original flow is absent here.
9. **Leaving a list nobody ever joined.** Someone starts a list to see what it is and changes their
   mind. Distinct from leaving a shared one, because there is no "both of you".
10. **A list that has been shut down for a report.** It reads exactly as closed, deliberately, and
    the copy is literally true for it. Nothing should distinguish it, or the screen becomes a way of
    telling someone they were reported.

**[HOLD: fill from the four language passes.]** Any string whose translation forced a shape change,
and anything where a locale needs more room than English.

---

## What this is NOT

- Not a collaboration tool. No comments, no mentions, no notifications about another person, no
  activity history, no "seen by".
- Not a family organiser. No calendars, no chores, no points, no rewards.
- Not social. No profiles, no avatars, no presence dots, no "last active".
- Not a funnel. No invite prompts on Today, no "invite your partner" nudges.
- Not gamified in any direction, least of all between two people who live together.

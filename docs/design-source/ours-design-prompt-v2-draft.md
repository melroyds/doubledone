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

**[HOLD: summarise round one's actual decisions here, from Melroy's zip, so this round extends
rather than re-litigates.]**

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
- Whether the word **Ours** survived round one. **[HOLD: what did round one conclude?]**

---

## Constraints from the build

**[HOLD: fill from the Phase 3 audit.]** Anything the audit turns up that changes what the interface
can truthfully claim goes here, in the same spirit as round one's three: the screen cannot know
whether an invite code is still alive, the email binding has an unrecoverable dead end, and deleting
a list cannot be undone once the server is told.

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

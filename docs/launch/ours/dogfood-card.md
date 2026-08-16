# Ours: the two-account test card

**A and B are two test accounts, not two people.** Sign up both with plus-addressing on your own
mailbox, so every code lands in one inbox and nobody has to be interrupted:

| Role | Sign in as | Where |
|---|---|---|
| **A** | `…+ourstest1@…` | a normal browser, or your iPhone |
| **B** | `…+ourstest2@…` | an incognito window, or the Android |

Plus-addressing works because both invite paths normalise an email with `lower(btrim(…))` and
nothing else, so the two tags are genuinely separate accounts to the database while both deliver to
you. **One live list per account** (`k_max_pairs := 1`), which is exactly why these are test accounts:
pairing your real account here would mean leaving the pair you actually use.

Work down in order. **Anything marked STOP is a do-not-continue.** Everything else, note it and keep
going.

> **Sections 1 to 4 are a solo evening.** Two browser windows side by side is a better rig than two
> phones for these, because you can watch both sides of a sync in the same moment rather than
> looking up from one screen to another.
>
> **Section 5 is the one that needs two real phones**, and it is the only part of this card that
> does. Two operating systems and two clocks against one list cannot be faked by two windows.

---

## 1. Getting paired

**1.1 — STOP if this fails.** A: Menu → Ours → create a list, name it something ordinary. Invite B's
address. B: join with the code.
*Both see the same empty list, with the same name.*

**1.2** Both: background the app, reopen.
*The list is still there, still named, on both.*

> The invite is bound to the address B actually signs in with. If join fails, that is almost
> certainly why, and A can mint a fresh code rather than debugging it.

---

## 2. The core loop

**2.1 — STOP if this fails.** B adds three things. A waits up to 15 seconds without touching
anything.
*All three appear on A.*

**2.2 — STOP if this fails.** A ticks one.
*It goes done on B within 15 seconds.*

**2.3** B un-ticks that same one.
*It goes un-done on A.*

**2.4** Tick a different row on both at the same moment.
*Both end up done on both. Neither undoes the other.*

**2.5 — the law.** Look hard at every row, on both.
*Nothing anywhere says who did anything. No initials, no avatar, no "done by", no count comparing
the two accounts. If you can find one, that is the most serious bug on this card.*

---

## 3. The day bridge (newest, and the riskiest)

**3.1 — STOP if this fails.** B makes a shared task repeat on today's weekday.
*It appears on BOTH Todays, under **DUE TODAY**, without either side fetching it.*

**3.2 — STOP if this fails.** A adds a shared task with the door left on **Anytime**.
*It is in the room, and NOWHERE on either Today. This is the rule that stops one person filling the
other's morning.*

**3.3** With rows showing under DUE TODAY, look at the weight gauge at the top of Today.
*It has not moved. Shared rows never count toward how heavy your day looks.*

**3.4** A ticks the row in the DUE TODAY strip.
*Done on B too. Nothing names anybody.*

**3.5** A: hold the DUE TODAY row → **Take this on today**.
*It leaves the strip and joins A's own list, tagged "· Ours". Holding it now gives the full card:
Break it down, Make it tiny, Steps, reorder.*

**3.6** A: Break it down on that taken-on row.
*The steps land on A's day only. B sees nothing new. The shared list is untouched.*

---

## 4. The things that actually broke

*Every one of these is a bug that happened during the build. They are the regression set.*

> **Confused by these? Use [section-4-steps.md](section-4-steps.md) instead.** Same tests, written as
> literal numbered steps with the setup spelled out, rather than as a summary that assumes you
> remember what broke.

**4.1 — the settle race.** A: background the app, reopen, and IMMEDIATELY tick something in the
DUE TODAY strip.
*It stays ticked. It must not un-tick itself a second or two later.*

**4.2 — the cold cache.** A: go offline (aeroplane mode, or DevTools → Network → Offline). Tick a row
A brought over. Go back online. Wait, then reload.
*The tick reaches B. It must not be silently lost.*

**4.3 — the vanishing row.** B ticks a row A has a copy of. A: background, return to Today.
*A's copy is STILL THERE, ticked, and shows up in A's Lookback. It must not disappear.*

**4.4 — removal is visible.** B removes a row from Ours that A holds a copy of. A: reopen Today.
*A's copy stays, and carries a faint line: "no longer on <list name>". Never anything naming B.*

**4.5 — the wash.** B changes a row while A is NOT looking (leave the room on A first). A opens the
room.
*That row is gently marked, the words are readable, and it fades after about eight seconds. Reopen:
the mark is gone. It must not return for the same change.*

**4.6 — your own edits.** A changes something in the room, then keeps looking at it.
*A's own change never washes. Only B's does. Then have B change that same row and check A DOES get
the mark: a row must be able to wash more than once.*

**4.7 — a repeat on its off day.** Look for the repeating row in the room on a day it is not due.
*It IS there, with its rhythm in words ("Every Thu"), and its checkbox is faded and inert. It must
not vanish, and it must not be tickable.*

**4.8 — the pile-up.** *(Fixed 2026-08-16, never tested on a device. The awkward one, because it
needs a day to pass.)* Give a shared row TODAY's date so it shows under DUE TODAY on both. Tick it.
Look at both Todays now, then again tomorrow morning.
*Today: still there on both, struck through, and still un-tickable. Tomorrow: gone from both.*

*Both halves matter. Before the fix it stayed forever, and that strip is excluded from the weight
gauge and the close-the-day count, so nothing would ever have cleared it. But a row that vanishes the
instant you touch it is worse, so check it is still there today first.*

*Do not want to wait a day? Move the clock forward a day, reopen, look, then set it back. Check the
other half too: an UNFINISHED row with a past date is still there tomorrow, and that is correct, not
a bug.*

---

## 5. Two phones, which has never been tested

**This is the only section that needs real devices.** Put A on the iPhone (TestFlight) and B on the
Android (closed testing), signed in as the same two test accounts.

**5.1** Do 2.1, 2.2 and 3.1 again, but always **iPhone first, Android second**, then the reverse.
*Same results both directions. This is the only test that exercises two different operating systems
against one list.*

**5.2 — clocks.** Check both phones show the same time to the minute. Then tick something late in the
evening on one and check the other tomorrow morning.
*It is done, dated correctly. A day-boundary mistake here is the worst class of bug this feature
has, because the two phones then disagree permanently.*

**5.3 — the keyboard.** On the Android, open the Ours capture and start typing.
*The Add button stays visible above the keyboard. This is the one thing no browser can prove.*

---

## 6. One I genuinely do not know the answer to

**6.1** Sign ONE account (A) in on two devices at once, say the browser and a phone. Change something
in Ours on one, then open Ours on the other.

*Does that row show the "changed since you looked" mark?*

I think it might. The record of "this edit was mine" is stored per DEVICE, so the second device has
no idea the first one did it. It breaks no law (the wording never names a person) but it could read
wrong: your own edit wearing the mark that means "the other person did something".

**Note it either way.** It is fixable, and it only shows up when one account is open in two places.

---

## If something fails

Add `?debug=1` to the URL on web, or note the exact words on screen. The debug panel deliberately
holds counts and ids only, never what anybody typed.

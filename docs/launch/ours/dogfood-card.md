# Ours: the two-person test card

**You on iPhone (TestFlight), her on Android (closed testing).** Cross-platform is the point: two
operating systems, two clocks, two people who are not coordinating with themselves. That last part
has never been true of this feature until now.

Work down in order. **Anything marked STOP is a do-not-continue.** Everything else, note it and keep
going.

Where a test names a device, **A = your iPhone, B = her Android.**

---

## 1. Getting paired

**1.1 — STOP if this fails.** A: Menu → Ours → create a list, name it something ordinary. Send her
the code. B: join with it.
*Both see the same empty list, with the same name.*

**1.2** Both of you: pull the app to background, reopen.
*The list is still there, still named, on both.*

> The invite needs the email address she actually signs in with. If join fails, that is almost
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

**2.4** Both of you tick a different row at the same moment.
*Both end up done on both. Neither undoes the other.*

**2.5 — the law.** Look hard at every row, both devices.
*Nothing anywhere says who did anything. No initials, no avatar, no "done by", no count comparing
the two of you. If you can find one, that is the most serious bug on this card.*

---

## 3. The day bridge (newest, and the riskiest)

**3.1 — STOP if this fails.** B makes a shared task repeat on today's weekday.
*It appears on BOTH Todays, under **DUE TODAY**, without either of you fetching it.*

**3.2 — STOP if this fails.** A adds a shared task with the door left on **Anytime**.
*It is in the room, and NOWHERE on either Today. This is the rule that stops her filling your
morning.*

**3.3** With rows showing under DUE TODAY, look at the weight gauge at the top of Today.
*It has not moved. Shared rows never count toward how heavy your day looks.*

**3.4** A ticks the row in the DUE TODAY strip.
*Done on B too. Nothing names anybody.*

**3.5** A: hold the DUE TODAY row → **Take this on today**.
*It leaves the strip and joins your own list, tagged "· Ours". Holding it now gives the full card:
Break it down, Make it tiny, Steps, reorder.*

**3.6** A: Break it down on that taken-on row.
*The steps land on YOUR day only. B sees nothing new. The shared list is untouched.*

---

## 4. The things that actually broke

*Every one of these is a bug that happened during the build. They are the regression set.*

**4.1 — the settle race.** A: background the app, reopen, and IMMEDIATELY tick something in the
DUE TODAY strip.
*It stays ticked. It must not un-tick itself a second or two later.*

**4.2 — the cold cache.** A: turn on aeroplane mode. Tick a row you brought over. Turn it off. Wait,
then reopen the app.
*The tick reaches B. It must not be silently lost.*

**4.3 — the vanishing row.** B ticks a row A has a copy of. A: background, return to Today.
*A's copy is STILL THERE, ticked, and shows up in A's Lookback. It must not disappear.*

**4.4 — removal is visible.** B removes a row from Ours that A holds a copy of. A: reopen Today.
*A's copy stays, and carries a faint line: "no longer on <list name>". Never "she removed it".*

**4.5 — the wash.** B changes a row while A is NOT looking. A opens the room.
*That row is gently marked, the words are readable, and it fades after about eight seconds. Reopen:
the mark is gone. It must not return for the same change.*

**4.6 — your own edits.** A changes something in the room, then keeps looking at it.
*Your own change never washes. Only hers does.*

**4.7 — a repeat on its off day.** Look for the repeating row in the room on a day it is not due.
*It IS there, with its rhythm in words, and its checkbox is inert saying "you can tick this on its
day". It must not vanish, and it must not be tickable.*

---

## 5. Cross-platform, which has never been tested

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

**6.1** You have two devices on ONE account (your iPhone and your Android). Make a change to Ours on
your **iPhone**, then open Ours on your **own Android**.

*Does that row show the "changed since you looked" mark?*

I think it might. The record of "this edit was mine" is stored per DEVICE, so your Android has no
idea your iPhone did it. It breaks no law (the wording never names a person) but it could read
wrong: your own edit wearing the mark that means "your person did something".

**Tell me either way.** It is fixable, and it only shows up when one person holds two phones, which
until tonight nobody did.

---

## If something fails

Add `?debug=1` to the URL on web, or tell me the exact words on screen. **Do not screenshot task
text you would not want quoted back** — the debug panel deliberately holds counts and ids only, never
what anybody typed.

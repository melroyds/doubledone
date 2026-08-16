# Ours: the run sheet

*The one to actually work through. 2026-08-16. Every task name here is EXACT and prefixed `DF-`, so
any of them can be found later by eye, by search in the app, or by `title like 'DF-%'` in the
Supabase table editor. Type them exactly, including the number.*

The ids (1.1, 4.3 and so on) are the same ids as [dogfood-card.md](dogfood-card.md), so a result
here maps straight back to what the test was for.

---

## Setup

| Role | Sign in as | Where |
|---|---|---|
| **A** | `…+ourstest1@…` | **Chrome**, normal window |
| **B** | `…+ourstest2@…` | **Edge**, normal window |

Both at **doubledone.app**, side by side on the one PC. Sections 1 to 4 are all here. Section 5 moves
to the two phones.

**Two different browsers, NOT one browser plus incognito.** Two reasons, and the first one decides it:

- **4.8 needs both sessions to still exist tomorrow.** An incognito window closed overnight loses its
  session and its cache, so B would come back signed out and empty, and you would be redoing setup to
  finish a test whose entire point is that a day passed.
- **4.2 goes offline and back.** That leans on the local cache behaving normally, and incognito is
  where storage behaves abnormally. A failure there would leave you unable to tell a real bug from a
  browser policy.

**Before you start:** on A, Menu → Ours. If A is already in a list, this is the wrong account. These
must be fresh test accounts, because one live list per account is the rule.

### Which surface runs which section

The phones are **one commit behind web**, and that commit is `sharedDueOn`, which decides what to
DRAW and writes nothing. So an old phone and today's web can be paired safely: they agree on every
byte in the database and disagree only about whether a ticked dated row is still drawn on Today.
Harmless, and it is the state every real user is in right now.

| Section | Where | Why |
|---|---|---|
| 1 to 4, except 4.8 | **Desktop browsers** | Identical on all three surfaces. Two windows side by side is the best rig. |
| **4.8** | **Web only** | This IS the fix. The phones do not have it and will fail it correctly. Do not run it there. |
| 5 | **The installed apps** | Two real OSes, two real clocks. Nothing in section 5 touches the fix. |
| 5.3b (new) | **A phone's browser** | See below. |

**Everything in 1 to 4 runs on one PC.** No second machine, no second network, no second clock. That
is precisely what section 5 exists to add, which is why it is the only part that needs real hardware.

**5.3b, five minutes, never tested by anyone.** The keyboard fix has two completely separate halves:
native uses a `Keyboard` listener feeding the footer, web uses `interactive-widget=resizes-content`
injected into the shipped HTML. A desktop browser cannot exercise the web half, because it has no
keyboard that covers the screen, and the native app runs the other half entirely. So: open
**doubledone.app in Chrome on the Android**, sign in as B, open the Ours capture, and type
`DF-18 mobile web keyboard`.
✅ The **ADD** button stays visible above the keyboard.
*If this fails, it is a real bug and only a phone's browser could have found it.*

---

## Results, fill in as you go

| Test | Task | P/F | Note if failed |
|---|---|---|---|
| 1.1 | pairing | | |
| 1.2 | pairing survives restart | | |
| 2.1 | `DF-01 milk` etc arrive | | |
| 2.2 | tick crosses | | |
| 2.3 | un-tick crosses | | |
| 2.4 | simultaneous ticks | | |
| **2.5** | **nothing names anybody** | | |
| 3.1 | `DF-04 bin night` reaches both | | |
| 3.2 | `DF-05 lightbulbs` reaches neither | | |
| 3.3 | gauge does not move | | |
| 3.4 | tick in the strip | | |
| 3.5 | take it on | | |
| 3.6 | break it down stays yours | | |
| 4.1 | settle race | | |
| 4.2 | offline tick | | |
| 4.3 | vanishing row | | |
| 4.4 | removal is visible | | |
| 4.5 | the wash | | |
| 4.6 | own edits never wash | | |
| 4.7 | repeat on its off day | | |
| 4.8 | the pile-up (**web only**, needs tomorrow) | | |
| 5.1 | two phones, both directions | | |
| 5.2 | clocks | | |
| 5.3 | keyboard, native app | | |
| 5.3b | keyboard, phone's browser | | |
| 6.1 | one account, two devices | | |

### How each screen refreshes, which changes what you wait for

**The room polls. Today does not.** The room looks again every 15 seconds while it is focused, the
app is active, and you have touched it in the last ten minutes. Today has no poll at all: it
refreshes when you navigate TO it, and on a warm resume (the tab going hidden, then visible).

That is deliberate, not a gap. Ours law three is *nothing moves because the other person acted; you
find things changed when you look.* Today is YOUR screen, so a poll rewriting it under you would
break that law. The room is where looking IS the activity.

**Consequence for this rig:** two windows side by side are both VISIBLE, so neither ever fires the
warm resume. So on Today, a shared change lands when you **navigate away and back** (Today → Ours →
Today) or reload. In the room, just wait.

Every step below says which screen to be on and what to do. Where it says *(look away and back)*,
that is not a workaround for a bug, it is how the screen is meant to work.

---

## 1. Getting paired

**1.1 — STOP if this fails.**
1. On **A**: Menu → Ours → create a list. Name it exactly **`DF House`**.
2. Invite `…+ourstest2@…`. Copy the 6-character code.
3. On **B**: Menu → Ours → join with that code.

✅ Both show an empty list called **DF House**.

**1.2**
1. Reload both tabs.

✅ Still there, still called DF House, on both.

---

## 2. The core loop

**2.1 — STOP if this fails.**
1. On **B**, add these three, one per line, in one go:
   - `DF-01 milk`
   - `DF-02 batteries`
   - `DF-03 gutter`
2. Do not touch **A**. Watch it for 15 seconds.

✅ All three appear on A by themselves, in that order.

**2.2 — STOP if this fails.** On **A**, tick `DF-01 milk`.
✅ Ticked on B within 15 seconds.

**2.3** On **B**, un-tick `DF-01 milk`.
✅ Un-ticked on A.

**2.4** Tick `DF-02 batteries` on A and `DF-03 gutter` on B at the same moment.
✅ Both end up ticked on both. Neither undoes the other.

**2.5 — the law. The most important test on this sheet.**
Read every row on both screens. Open a held card. Look at the list header.

✅ Nothing anywhere says who did anything. No initials, no avatar, no "done by", no count comparing
the two accounts.
❌ If you find one, stop and tell me. That is the most serious bug this feature can have.

---

## 3. The day bridge

**3.1 — STOP if this fails.**
1. On **B**, add `DF-04 bin night`.
2. Hold it → **Repeat…** → **Weekly** → tick **today's weekday** → commit.

✅ On both Todays under **DUE TODAY**. A is already on Today, so *look away and back* (Ours → Today)
to see it arrive. In the room it would have appeared on its own.

**3.2 — STOP if this fails.** On **A**, add `DF-05 lightbulbs` with the door left on **Anytime**.
✅ In the room on both. On **neither** Today, and no amount of looking away and back makes it appear. This is the rule that stops one person filling the
other's morning.

**3.3** Look at the weight gauge at the top of Today on A.
✅ It has not moved. Shared rows never count toward how heavy your day looks.

**3.4** On **A**, tick `DF-04 bin night` where it sits in the DUE TODAY strip. Then check **B**.
✅ Ticked on B. If B is sitting in the **room**, it lands on its own within 15 seconds. If B is on
**Today**, look away and back. Either way, nothing names anybody.

**3.5**
1. On **A**, add `DF-06 parcel` in the room, with the door set to **Today**.
2. It appears in A's DUE TODAY strip. Hold it → **Take this on today**.

✅ It leaves the strip and joins A's own list with a faint **· Ours** after the title. Holding it now
gives the full card: Break it down, Make it tiny, Steps, reorder.

**3.6** On **A**, Break it down on `DF-06 parcel`.
✅ The steps land on A's day only. B sees nothing new. The shared list is untouched.

---

## 4. The things that actually broke

*Every one of these is a real bug from the build. This is the regression set.*

**4.1 — the settle race.**
1. On **A**, add `DF-07 recycling` in the room, door set to **Today**.
2. Reload A's tab. **The moment** it loads, tick `DF-07 recycling` in the DUE TODAY strip.
3. Watch that tick for ten seconds. Touch nothing else.

✅ It stays ticked.
❌ It un-ticks itself after a second or two.

**4.2 — the cold cache.**
1. On **A**, add `DF-08 stamps` in the room, door on **Anytime**. Hold it → **Bring to my Today**.
2. Go offline on **A**: press **F12**, open the **Network** tab, and change the dropdown that reads
   **No throttling** to **Offline**. **Leave DevTools open**, because closing it resets the throttle
   and would silently undo this test rather than failing it visibly.
   *Simpler alternative: just turn off the machine's wifi. It takes B offline too, which does not
   matter here, and it is closer to what happens to a person on a train.*
3. Tick `DF-08 stamps` on A's Today.
4. Set that dropdown back to **No throttling** (or wifi back on). Wait 30 seconds. Reload A.
5. Look at **B**.

✅ `DF-08 stamps` is ticked on B.
❌ Still un-ticked on B and stays that way.

**4.3 — the vanishing row.**
1. On **A**, add `DF-09 vacuum bags`, door on **Anytime**. Hold → **Bring to my Today**. Leave it
   un-ticked.
2. On **B**, open the room and tick `DF-09 vacuum bags`.
3. Reload **A** and look at Today.

✅ The row is **still on A's Today**, now ticked. Menu → Lookback shows it too.
❌ It disappeared.

**4.4 — removal is visible.**
1. On **A**, add `DF-10 kitchen roll`, door on **Anytime**. Hold → **Bring to my Today**.
2. On **B**, hold `DF-10 kitchen roll` in the room → **Remove**.
3. Reload **A**, look at Today.

✅ A's copy is still there, with a small grey line under the title reading **"no longer on DF House"**.
❌ No line, or a line that names the other account.

**4.5 — the wash.**
1. On **A**, open the room, look at it, then **leave** (go to Today).
2. On **B**, hold `DF-02 batteries` → tap the title → change it to `DF-02 batteries AA` → save.
3. Wait 20 seconds. On **A**, open the room and start counting.

✅ That row looks slightly warmer than the others with a small line of words on it, and goes back to
normal by itself after about eight seconds.
4. Leave the room and come back.
✅ No mark. That change has been seen.
❌ The mark is back for the same change.

**4.6 — your own edits, both halves.**
1. On **A**, rename `DF-03 gutter` to `DF-03 gutter clean`. Stay in the room.

✅ No mark on the row you just changed.

2. Now on **B**, rename that same row to `DF-03 gutter clean out`.
3. On **A**, leave the room and come back.

✅ Now it **is** marked. *(This is the important half. A row must be able to wash more than once.)*

**4.7 — a repeat on its off day.**
1. On **A**, add `DF-11 water plants`. Hold → **Repeat…** → **Weekly** → pick a weekday that is
   **NOT today** → commit.
2. Stay in the room and look at that row.

✅ All three:
   - the row is **there**, it has not disappeared
   - underneath it reads its rhythm, like **"Every Thu"**
   - its circle is **faded**
3. Tap the circle anyway.
✅ Nothing happens.

**4.8 — the pile-up. WEB ONLY.** *(Fixed today. The store builds predate the fix, so running this on
a phone tests the old code and fails for the wrong reason. It reaches the phones at the next build.)*
1. On **A**, add `DF-12 recycling bin` in the room, door set to **Today**.
2. It appears under DUE TODAY on both. Tick it on either.
3. **Check now:** still on both Todays, struck through, and you can un-tick it.
4. **Tomorrow morning** (or move the clock forward a day and reload): look again.

✅ Now: still there on both. Tomorrow: **gone from both**.
❌ Still there tomorrow. That is the bug.

*Also check the other half: `DF-05 lightbulbs` has no date so it never appears, and any UNFINISHED
dated row is still there tomorrow. That second one is correct, not a bug.*

---

## 5. Two phones. The only section that needs real devices.

Sign **A** in on the iPhone (TestFlight) and **B** on the Android (closed testing), same two test
accounts.

**5.1**
1. On **B (Android)**, add `DF-13 phone test one`. Check it reaches the iPhone.
2. On **A (iPhone)**, add `DF-14 phone test two`. Check it reaches the Android.
3. On **A**, add `DF-15 phone repeat`, set it to repeat on today's weekday. Check it reaches both
   Todays.

✅ Same results in both directions.

**5.2 — clocks.** Check both phones show the same time to the minute. Late this evening, on one
phone, tick `DF-16 late tick` (add it first, dated today). Check the other phone tomorrow morning.
✅ Done, and dated correctly. *A day-boundary mistake here is the worst class of bug this feature has,
because the two phones then disagree permanently.*

**5.3 — the keyboard.** On the **Android**, open the Ours capture and type `DF-17 keyboard check`.
✅ The **ADD** button stays visible above the keyboard the whole time. *No browser can prove this one.*

---

## 6. The open question

**6.1** Sign **A** in on both the browser and a phone at the same time. On the browser, rename
`DF-01 milk` to `DF-01 milk 2L`. Then open Ours on the phone, still as A.

*Does that row show the "changed since you looked" mark?*

I think it might, and I do not know. The record of "this edit was mine" is stored per DEVICE, so the
phone has no idea the browser did it. It breaks no law (the wording never names anybody) but it could
read wrong: your own edit wearing the mark that means the other person did something.

**Note it either way.** It only shows up when one account is open in two places.

---

## When you are done

Every row is named `DF-…`, so:

- **In the app:** they are obvious on sight and easy to remove from the room.
- **In Supabase:** the table editor, `shared_tasks`, filter `title` `like` `DF-%` finds all of them.
- **Cleanup:** removing them from the room on either device is enough, and it exercises removal one
  more time. Do not delete rows in the dashboard; a tombstone is how the other device learns.

## What to send me

Just the results table, with a sentence for anything that failed. **2.5, 4.1, 4.3 and 4.8** are the
four I most want to hear about: 2.5 is the law, 4.1 and 4.3 both made finished work appear to vanish,
and 4.8 has never run anywhere.

If something looks wrong, add `?debug=1` to the URL and tell me what the panel says. It holds counts
and ids only, never what anybody typed.

# Ours: the launch post kit

Everything for announcing the shared list. Two posts, and the shots to hang them on.

**The one line under all of it:** every other shared list quietly turns into a scoreboard between two
people. This one cannot, because there is no field anywhere that says who did what.

---

## The screenshots

`01-onboarding.png` is generated and current (`npm run shots`). **The other three have to come off
your phone**, because every Ours screen needs a signed-in account with a real pair, and the
screenshot harness seeds `localStorage` rather than signing in. It cannot fake a partner.

Take these three on Android, in dark mode, with the list named something ordinary. Real content beats
staged content, but do a quick read for anything you would not want on the internet.

| File | Screen | What it has to show |
|---|---|---|
| `02-room.png` | The Ours list itself | Four or five rows, at least one repeating so its rhythm line shows. **The point of this shot is the absence of anything:** no avatars, no initials, no "done by", no progress bar. |
| `03-today-strip.png` | Today, scrolled to the strip | The **DUE TODAY · JUST US** heading with a row under it, and your own tasks above. This is the one that shows a shared thing arriving without either of you fetching it. |
| `04-capture.png` | The Ours capture, door open | The **Anytime · Today · Tomorrow · Pick a date** row. It shows the choice that keeps a shopping list out of your morning. |

**If you only take one, take `03`.** It carries the whole argument in one frame: your day, the shared
day, and no scoreboard anywhere.

**Crop the top:** your email is in the footer of Today.

---

## LinkedIn

*Personal, and a product-judgement piece. The audience is hiring product managers as much as friends,
so the interesting content is the decisions, especially the ones about what NOT to build.*

```
DoubleDone does double.

This one started somewhere unglamorous. My wife and I wanted a single list. Not just the
shopping, the things that actually matter to both of us, in one place, without either of us
having to remember to tell the other.

Every shared to-do app we tried turned into a scoreboard. Not deliberately. It just happens:
once an app records who ticked what, somebody eventually counts, and a list two people keep
becomes a quiet ledger of who is pulling their weight.

So Ours does not record it. There is no field anywhere that says who finished a thing. A done
thing is just done. Nothing counts, nothing compares, and nothing on your screen moves because
the other person did something. You find things changed when you look, like a kitchen table.

The harder decision was what a shared list is allowed to do to your day. If everything on it
landed on your Today, your partner could make your morning heavier without meaning to, which is
the exact overwhelm the app exists to prevent. So the rule is whether a thing has a day of its
own. Bin night on a Tuesday arrives on both our Todays on the day. Milk and batteries wait on
the list. Your day stays yours, and it stays finite.

It is free, like the rest of the daily loop.

What I keep coming back to is how much of this was deciding what not to build. No presence
dots. No "your partner is waiting on you". No teams, no third person. No streaks, still. For an
app built for people who find to-do apps overwhelming, most of the work is subtraction.

DoubleDone is at doubledone.app. Free, no account needed to start.
```

**If you want it shorter**, cut the fifth paragraph ("It is free") and fold "Free" into the last
line. The scoreboard paragraph and the day paragraph are the two that earn their place; everything
else is supporting.

---

## Facebook

*Warmer, funnier, no product-management vocabulary. Somebody should be able to read it in six seconds
and know whether it is for them.*

```
DoubleDone now does double.

One list, two people. For the house, the shopping, or the stuff you both keep meaning to sort
out and neither of you writes down.

The good bit: it never says who did what. No scoreboard, no "well, I did four things today". A
done thing is just done.

And it cannot make your day heavier. Anything with a day of its own, bin night on a Tuesday,
turns up on both your Todays on the day. Everything else waits quietly on the list, where it
belongs.

Free, because a shared shopping list you have to pay for is a bit rude.

doubledone.app
```

**Alternative opener if you want it cheekier:** "Feel like one list is too much for you? Good news,
now there are two of you."

---

## Before you post

- **Web only, for now.** doubledone.app has it the moment `ours` merges. Anyone on the Android or iOS
  app sees nothing until a new build ships. Worth knowing, because the first reply will be somebody
  saying they cannot find it.
- **Anyone can start a list** as of `supabase/ours-open.sql`. Before that, only hand-added addresses
  could, which would have made both posts an advert for a locked door.
- **Do not claim "no data records who did what".** `shared_tasks.created_by` exists server-side for
  abuse reports and is never shown. The honest and equally strong claim, used in both posts above, is
  that **nothing says who did what** and a finished thing is just finished.

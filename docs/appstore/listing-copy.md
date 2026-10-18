# App Store listing copy, paste-ready (English)

*Rewritten 2026-10-19 for 1.9.0 (store 1.9, slice 8). The 2026-08-16 rewrite never reached the store: on
2026-10-19 the live subtitle was still `A calmer kind of to-do list`, and the live description still carried an A$
price (shown on the US page beside Apple's own US$3.00), "colleagues", "your person cannot make your morning
heavier", "nothing you type leaves your device", seven colour themes as Premium, and a free month offered before
sign-in. All of that is gone below. Every count is measured by `node scripts/check-listings.mjs --appstore`, never
estimated, and CI runs that gate on every push.*

*The voice rules: calm, plain, no exclamation marks, no clinical claims (never "treatment", "therapy",
"symptoms"), and the promise is "the whole calm daily loop stays free forever". Every claim is checked against what
an iPhone actually runs: no widget (Android only), no Speak (the web only, `speech.ts` is a stub on phones), and no
mention of the web, Android, Google or a price. The four localisations (de, es-MX and es-ES, fr, it) are in
[listing-localised.md](listing-localised.md).*

## Before you paste

1. **Run the gate:** `node scripts/check-listings.mjs --appstore`. It fails on a cap, a recorded count that has
   drifted, a keyword that repeats the name or subtitle, a price, an Android-only or web-only feature, a lost
   medical line or URL, and every claim the code has proved false.
2. **In App Store Connect, read two things first:** App Information, then Primary Language, and the live Keywords
   field on the current version. The primary language decides which slot the second keyword set goes into (below).
   The keyword field in this file's previous version was never confirmed against ASC.
3. **Print each field from this file and diff what was sent.** Never retype a field.

## English, the primary listing (`en`)

**Name** (27 / 30)

```
DoubleDone: ADHD To-Do List
```

**Changed 2026-10-19 (Melroy's call 6).** `DoubleDone` alone spent 10 of 30 characters on a name nobody searches
yet, while every competitor puts the category or "ADHD" in its name, and the name is Apple's heaviest ranking field.
The phone's icon label does not change: it comes from `app.json` `name`, so the home screen still says DoubleDone.
**Pre-decided fallback** if Apple objects to "ADHD" in the name (guideline 2.3.7 or 1.4.1): `DoubleDone: Calm To-Do
List` with the subtitle `For ADHD. Nothing overdue.`, a metadata-only resubmit of the same build.

**Subtitle** (29 / 30)

```
Calm planner, nothing overdue
```

The second-heaviest field carries the promise nobody else makes, nothing is ever overdue, plus the one category
word the name lacks. "Calm" alone no longer sets DoubleDone apart (Tiimo, iPhone App of the Year 2025, now says "a
calm, doable day"), so it rides beside the promise rather than carrying it.

**Keywords** (100 / 100)

```
todo,task,manager,daily,organizer,routine,autism,audhd,ocd,neurodivergent,brain,dump,breakdown,focus
```

No word repeats the name or the subtitle (Apple combines words across all three fields within one localisation, so
a repeat is wasted), no spaces, singular forms, and the gate checks all of it. **Out on purpose:** `calm` (in the
subtitle, and as a bare word it mostly brings people looking for the Calm meditation app); `simple`; `habit`,
`streak`, `chores` and `reward`, which bring habit-tracker and chore-chart seekers, the product DoubleDone refuses
to be, so those installs churn and the reviews sting; competitor names (guideline 2.3.7); and clinical words
(`anxiety`, `therapy`, `treatment`, `symptom`). `shared`, `couples` and `household` moved to the second set below.

**Promotional text** (144 / 170)

```
A calm to-do list for ADHD, autism and OCD. Just today, sized to be doable, and nothing is ever overdue. The whole daily loop is free, for good.
```

Editable later without review, and not searched. It keeps the two phrases the field has always carried, so the
free-forever promise survives whenever this line turns over.

**Description** (3971 / 4000)

```
DoubleDone is a calm to-do list for adults with ADHD, autism, OCD and overwhelm.

The home screen is Today, and only Today. Not your whole backlog, not a wall of overdue guilt, just a day sized to be doable. Nothing is ever overdue here. It just waits.

When a task is too big to start, Break it down turns it into small steps, and ticking the last one finishes the real task. On a low day, tap Low and what counts as enough gently shrinks. When today gets loud, Settle is a quiet room with a breathing guide, always there and never earned. And the day closes gently, with zero guilt about what moved to tomorrow.

There are no streaks, no scores, and nothing that shames you. A task is never punished for existing. What you finish, you keep: your Calendar shows everything you actually did, including the old dreaded things you finally closed, because that deserves to be seen.

If you keep a list with somebody, Ours is one shared list between exactly two of you. Nothing on it says who did what, and nothing counts or compares, so it cannot become a scoreboard. A shared thing with a day on it, bin night on Tuesday, arrives on both your Todays by itself. Everything else, milk and batteries, stays on the shared list however long it gets, so your day stays yours. Tick it from either phone and it closes for both.

DoubleDone is made in Melbourne by Melroy. He built it for friends with ADHD and OCD, and for anyone whose list has ever felt like too much.

Free, forever:
- Today, sized to be doable
- Sort for me, a brain-dump shaped into your day
- Break it down, a dreaded task in small steps
- Make it tiny, a two-minute version when even small is too much
- A low day, when enough should mean less
- Lighten today, a too-full day eased, only when you say yes
- Focus on one thing, everything else out of sight
- Where you left off, one short line on any task for next time
- Combine, a few small tasks folded into one
- Settle, a quiet room with a breathing guide
- Quiet, a borderless look where nothing shouts
- Repeating tasks, routines and rhythms, with no streak to keep up
- Gentle reminders, and Hold me to it for a firmer nudge
- Close the day, and a shame-free return whenever you have been away
- Your Calendar, everything you finished, kept
- A free monthly AI scrapbook of your finished things
- Ours, one shared list for two, with a free sign-in
- Sync across your devices with an email code, no password

Premium, if you ever want more:
- Scan a photo of a list straight into tasks
- Pin today's one thing
- Six more calm colour themes
- A weekly AI scrapbook, growing the longer you stay
- Your patterns, gentle stats and a warm weekly reflection
- Chart a course, turn a goal into calm next steps
- Plan my day, a calm order for today
- Energy matching without limits, ask what fits anytime

DoubleDone Premium is an optional auto-renewable subscription, monthly or yearly, at the price the App Store shows you before you buy. It is charged to your Apple ID at confirmation of purchase and renews automatically until you cancel, which you can do any time in your Apple ID settings, up to a day before it renews. Once you sign in, you can also try Premium free for a month: no card, no charge, and it never turns into a subscription on its own.

Privacy, plainly: no ads, no advertising identifiers, no selling your data. You do not need an account, and your tasks live on your device unless you choose to sync or share a list. The AI features are on to start and only send what you use them on, to Anthropic's Claude. Scrapbook pictures are made with Cloudflare's AI models. One tap in Settings turns the AI off, and the rest of the app keeps working. The full policy is at https://doubledone.app/privacy

DoubleDone is not a medical device. It does not diagnose, treat, cure or prevent any condition, and it is not a substitute for professional care. For medical advice, talk to a health professional.

Terms of use: https://doubledone.app/terms
```

It ends with the Terms URL, which doubles as the EULA link. **Checked against the iPhone build on 2026-10-19**,
feature by feature (the landing page precedent):
- **Scan a photo of a list** is Premium and needs AI on. On an iPhone it opens an in-app viewfinder with a gallery
  fallback (`CameraCapture.tsx`, the `expo-camera` and `expo-image-picker` plugins and their permission strings in
  `app.json`). The titles it reads land in the capture panel to check before anything is added, which is what the
  paywall's own line ("straight into tasks") means: nobody types them.
- **Energy matching, ask what fits anytime.** The free tier has 15 picks a calendar month (`ENERGY_FREE_MONTHLY`),
  Premium has no limit, and the entry is "What fits right now?" inside Focus, shown with AI on.
- **The free monthly scrapbook is an AI feature.** Its card is hidden with AI off (`lookback.tsx`), so the list
  calls it an AI scrapbook and the privacy paragraph names Cloudflare, whose models draw the picture (and write the
  scene if Claude is down). It needs no sign-in.
- **The free month** only shows once you are signed in (`trialSlot`), hence "Once you sign in".
- **Hold me to it, Rhythms and per-task reminders** run in both phone apps. Quiet is free for everyone. Sort for me,
  Make it tiny, Lighten today and Combine hide with AI off (Break it down falls back to writing your own steps),
  which the privacy paragraph's "the rest of the app keeps working" does not contradict.
- **Left out because an iPhone does not have them:** the home-screen widget and Speak.

## The second English keyword set

Apple searches more than one localisation in most stores (industry observation, MobileAction, April 2026, not an
Apple statement): Australia searches English (U.K.) beside its own, and Germany, France, Italy, Spain and Mexico
search English (U.K.) as their second language. So a second English localisation with the same visible text is a
second 100-character keyword field. Its slot depends on the Primary Language you read in step 2:

| Primary Language | Add this localisation | Paste the keywords from |
|---|---|---|
| English (U.S.) or English (Australia) | English (U.K.) | `en-GB` below |
| English (U.K.) | English (Australia) | `en-AU` below |

Its name, subtitle, promotional text and description are the primary's, pasted unchanged, and so is the Privacy
Policy URL. The set is drafted once per slot so the paste is never improvised, and the gate holds the two
identical. Neither repeats a word from the primary's name, subtitle or keywords. `executive` and `function` are
parked (close to clinical language, in the Backlog).

### English (U.K.), the second keyword set (`en-GB`)

**Keywords** (100 / 100)

```
shared,couples,household,partner,checklist,reminder,organiser,overwhelm,gentle,steps,tiny,low,energy
```

### English (Australia), the second keyword set (`en-AU`)

**Keywords** (100 / 100)

```
shared,couples,household,partner,checklist,reminder,organiser,overwhelm,gentle,steps,tiny,low,energy
```

## What's New in This Version

Each version's notes live in `docs/release-notes/<version>.md`. Every App Store localisation has its own What's
New field and nothing inherits it, so each localisation in [listing-localised.md](listing-localised.md) (and the
second English one) needs its own paste.

## The other App Store Connect fields
- **Support URL:** `https://doubledone.app/support` (deploys with the support.html page)
- **Marketing URL:** `https://doubledone.app`
- **Privacy Policy URL:** `https://doubledone.app/privacy`, on every localisation (each has its own field).
- **Category:** Productivity. No secondary (deliberate: Health & Fitness invites medical
  scrutiny for no discovery gain).
- **Age rating questionnaire:** Apple replaced this in July 2026, and the answers are already saved
  against 1.3.0 (completed 2026-08-09). Do NOT re-answer from memory. Medical/wellness **No**;
  social-media capability **No** (no feed, no discovery, no amplification); user-generated content or
  user-to-user communication, if asked separately, **Yes** (two people write into one list);
  unrestricted web access **No**. Full reasoning in
  [../ours-store-compliance.md](../ours-store-compliance.md). Confirm the calculated rating still
  comes out 4+ before saving: a 13+ on a calm to-do app is a real cost.
- **EULA:** Apple's standard, plus the terms URL already at the end of the description.

## Screenshots (docs/appstore/, 1320x2868 JPEG, upload in this order)
1. welcome (the promise, best first impression)
2. today-light (the core)
3. ours-room (the shared list, which is what 1.3.x is FOR)
4. ours-when (setting a shared row's day, the thing 1.3.1 adds)
5. lookback-light (what you finish, you keep; the screen is called Calendar in the app)
6. today-dark
7. settle-light (the quiet room, the most distinctive screen in the app)
8. settings-light

**Eight since 2026-08-16.** Settle shipped on 1 August and was missing from every store listing for
a fortnight, because this repo has three screenshot generators and a new screen has to be added to
each by hand. Regenerate with `IOS=1 node scripts/screenshots.mjs` (needs `npm run dev` on :8081).
JPEG rather than PNG on purpose: JPEG carries no alpha channel, and App Store Connect rejects
transparency.

Apple surfaces the first three in search results, so the room sits third: promise, core, the new
thing. Before 1.3.1 there was no Ours shot in the set at all, which meant the listing for a release
about a shared list never showed one.

The Premium screen is deliberately not in the set: the web-rendered paywall shows the Stripe
line, and an App Store screenshot pointing at external purchase is a review flag.

---

## Where the Ours paragraph sits, and why

Between "There are no streaks, no scores, and nothing that shames you..." and "DoubleDone is made in Melbourne by
Melroy...". That seam is chosen, not convenient: the paragraph above it already says nothing keeps score for one
person, so Ours reads as "and that holds when there are two of you", which is an argument rather than a feature
announcement. It promises what the code does: a row with a day lands on both Todays, everything else waits on the
shared list "however long it gets", and it never claims your person cannot change your morning, because either of
you can give a shared row today's date.

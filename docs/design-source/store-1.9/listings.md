
# Items #3 (store keywords) and #6 (medical line): findings and drafts

I changed nothing in the repo. The drafts and the two checking scripts are in the scratchpad:
- `C:/Users/molte/AppData/Local/Temp/claude/C--Users-molte-Dropbox-Claude-Output-Product-Manager-Portfolio-DoubleDone/f22769e4-9c0a-44e4-a78a-01fb40b78a1a/scratchpad/drafts/appstore-desc-en.txt` (3,970 of 4,000)
- `.../drafts/play-full-en.txt` (3,832 of 4,000. It passes a copy of `check-listings.mjs`'s forbidden and protected rules. I also added a "free trial" ban, because Google gives "Try Premium free" as its own example of a violation.)
- `.../drafts/count.py` and `.../drafts/gate.mjs` count every field below.

## Summary
1. **Two of the docs do not match what is live.** I read both store pages on 2026-10-19:
   - The App Store subtitle is still `A calmer kind of to-do list`. `listing-copy.md` says it became `A to-do list, never overdue` on 2026-08-16.
   - The Play English short description is still `A calm to-do app for ADHD and overwhelm. Shows only today. AI optional.`, not the "Nothing is ever overdue" line the docs describe.
   - So the 2026-08-16 English rewrite never reached either store. The App Store keyword field in the doc is unconfirmed too. Read the live field in App Store Connect (ASC) before replacing it.
2. **The name field is the biggest keyword loss.** `DoubleDone` uses 10 of 30 characters, and the app has no brand searches yet (the store says it lacks enough ratings to show any). Every competitor puts the category or "ADHD" in its name.
3. **The App Store copy has no checking script.** `check-listings.mjs` only reads the Play docs. That is how the A$ price, "colleagues", "morning heavier" and the AI overclaim all survived on the App Store.
4. **App Store localisations: none.** ASC has only an English listing. See the next section.
5. **My picks:**
   - Name: `DoubleDone: ADHD To-Do List`
   - Subtitle: `Calm planner, nothing overdue`
   - A new 100-character keyword field (below)
   - Add de-DE, fr-FR, it-IT, es-MX and es-ES localisations in this version
   - The medical line goes into the App Store description, and a short "Not medical care" section goes into the Terms (needs your OK)

## Does the App Store listing have localisations beyond English?
**No. ASC holds one metadata localisation, in English.**
- **The docs:**
  - `docs/appstore/listing-copy.md` has English only.
  - `docs/ios-submission-prep.md:301` says "Only English is required... adding those localizations later is polish". It was never followed up.
  - Every `docs/release-notes/*.md` writes Apple's What's New in English only.
  - BUILD-PLAN Phase 5 ("Play + App Store German metadata") is still open.
- **The live pages:** the AU and US pages show the same English description. The US page shows "A$5.00" in the text while its in-app purchase list says **US$3.00 / US$30.00**.
- **Which English is primary is not written down anywhere.** Check App Information, then Primary Language. It decides which extra English localisation is worth adding (see the keyword section).
- **The live "Languages: English, French, Italian, Spanish" line comes from the app build, not from ASC listings.** It is generated from the `supportedLocales` list in `client/app.json`.
  - German is missing because `de` was added on 2026-10-05, after the live 1.8.0 build. This batch's build adds Deutsch to that line (test case I18N-02).
- **Result today:** a German, Spanish, French or Italian iPhone user reads an English listing, then the app opens in their language.
- **One wrong convention in the release-notes files.** They say "Apple takes What's New (English; the localised listings inherit it)". ASC localisations do not inherit What's New: each has its own field. It does not matter today, but it will be wrong the day localisations exist.

## Truth problems in today's listings (checked against the code, worst first)
| # | Claim | Where (live = checked on the store) | Why it is false | Fix |
|---|---|---|---|---|
| 1 | "A$5.00 a month, or A$50.00 a year" | App Store description, live in every country | Apple charges each country's own price. The US page shows US$3.00 / US$30.00 beside it. `ios-submission-prep.md` itself says no prices in the description | "at the price the App Store shows you before you buy" |
| 2 | "your person cannot make your morning heavier" | App Store description (live), Play en (live), es "tu persona no te carga la mañana" (live es-ES and es-419) | Your person can give a shared item today's date, and it lands on your Today. The landing truth check already corrected this | The landing line: "Everything else stays on the list, however long it gets, so your day stays yours" |
| 3 | Turning AI off means "nothing you type leaves your device" / "is sent anywhere" / "nothing leaves your device" / "The whole app keeps working, entirely on your device" | App Store (live), Play en (live). The four translations narrowed it to "no text leaves", which is still false | Sync, Ours, a connected AI assistant (over MCP), the feedback note and the feature-usage beacon all still run. Play's Data Safety form declares the beacon, so the listing contradicts the form | "The AI features are on to start and only send what you use them on. One tap in Settings turns them off, and the rest of the app keeps working" (landing `priv2`, which exists natively reviewed in all five languages) |
| 4 | "PRIVATE BY DEFAULT" heading | All five Play listings | The 2026-06-28 honesty decision keeps that phrase for AI-off only, and AI starts on | "ON YOUR DEVICE BY DEFAULT" (landing `privTitle`, all five languages) |
| 5 | "built with ADHD, autistic and OCD friends and colleagues in mind" | App Store (live) | Your call on 2026-10-18: friends, not colleagues | "DoubleDone is made in Melbourne by Melroy. He built it for friends with ADHD and OCD" (landing `founder`) |
| 6 | Spanish vosotros forms | es-ES (live), pasted into es-419 (live) | **Two lines, not the one the Backlog names:** "llega a **vuestros** dos Hoy" (localised doc :189) and "Los dos **iniciáis** sesión" (:191). Also in `docs/play-resubmission-walkthrough.md:170,172` and the historical `docs/launch/ours/play-release-notes.md:48` | "llega al Hoy de los dos" and "cada uno inicia sesión" (landing `m4Body` es) |
| 7 | "Nostro" as a name fragment | it-IT Play (heading "NOSTRO: …", "Nell'app si chiama La nostra lista", "Come la sincronizzazione, Nostro chiede…") | The 2026-10-18 rule: Ours is always its default name | "La nostra lista" everywhere |
| 8 | "Export your data" | Play, all five languages | Export covers your tasks and what you finished, not everything | Landing `priv4`, per language |
| 9 | "No third-party trackers" | Play, all five languages | Since 1.7.0, RevenueCat gets an install id and the account id on every Android phone (Data Safety marks Device IDs as Required). It is not an ad tracker, but a strict reviewer can read the line as contradicting the form | "No advertising identifiers or cross-app tracking" (landing `priv3`, all five languages) |
| 10 | "Lighten today re-spreads it" | App Store | It suggests one spread, and nothing moves until you say yes | Landing wording |
| 11 | "Seven calm colour themes" as Premium; "Pin the day's one thing" | App Store. The in-app paywall `featureThemes` also says seven | Dusk is free, so Premium adds six. Pin has one name per language | "Six more calm colour themes", "Pin today's one thing" |
| 12 | "try Premium free for a month" | App Store | The trial button is hidden until you sign in (`trialSlot` in `premium-ui.ts`) | "Once you sign in, you can also try…" |
| 13 | "Free, and unlike every shared list you have used" | Play en | A comparison nobody can check | Cut |
| 14 | Things left out (not false, but they undersell) | Both stores | Play names no Premium at all, although Android has sold it since 1.7.0. Neither store mentions Where you left off, Hold me to it, Routines and Rhythms, or a low day. Play skips the widget. "Never nagging" sits oddly beside Hold me to it | In the drafts |

**Two claims that must stay off the App Store:**
- **The widget.** Android has one, iOS does not.
- **Spoken capture.** `speech.ts` is a stub on phones, so the mic exists only on the web.

## Doc and process drift (the reason these keep coming back)
- **The es-419 Play listing has no source file.** The live es-419 text (3,326 characters) contains "dispositivo médico… afección médica", which appears in no repo file. Someone pasted text the checking script never saw.
- **There are two sources for the Play English short description.** The submission pack holds the live one, the localised doc holds one that never shipped, and the checking script passes both.
- **`listing-copy.md` miscounts its own description.** It says "~2,300 chars". It measures 3,878.
- **Out-of-date instructions:**
  - The localised doc's "Before pasting" step 1 says the gate fails on "a Premium section". That stopped being true with Path A.
  - The submission pack lists twelve free-form Play "Tags". Play takes at most five, picked from Google's own list under Store settings, then Manage tags. Pick to-do list, task management and planner style tags, never habit tracker.
- **Extra paste sources that carry the same flawed text:** `docs/play-resubmission-walkthrough.md` (no checking at all) and `docs/play-store-release.md` section 4 (checked only for selling).
- **One in-app string I spotted while searching:** `en.ts:1288` `handoffFineNoAi` says "nothing leaves your device". That is out of scope here, but it is the same overclaim the landing review fixed elsewhere.

## Keyword research: what competitors do (live store pages, 2026-10-19)
| App | App Store name | Subtitle | Notes |
|---|---|---|---|
| Tiimo (21K ratings, US) | Tiimo: To-Do List Planner | Schedule Structured Daily Task | Opens with "an AI planner that turns a brain dump into a calm, doable day", which is DoubleDone's own pitch |
| Tiimo DE | Tiimo - Daily to-do list | Aufgabenliste & ADHD Planer | Uses "ADHD", not "ADHS", and "Overwhelm" in German copy |
| Tiimo FR / ES / IT | To Do List Planner / Planificadora diaria / **Planner per l'adhd** | Structured Tasks Organizer / Organiza tu agenda / Organizza il tuo programma | The French one borrows a competitor's name, which is exactly what guideline 2.3.7 forbids |
| Llama Life | **ADHD Organizer: Llama Life** | Focus timer, habits, routines | Play: "ADHD daily routine planner and to-do list" |
| Structured (168K) | Structured: Daily Planner Todo | Visual Calendar & Organizer | |
| Todoist | Todoist: To-Do List & Calendar | Planner & reminders | |
| Goblin Tools (3K) | Goblin Tools | Smart tools for the neurospicy | |
| Finch (765K) | Finch: Self-Care Pet | Daily Journal & Habit Tracker | Health & Fitness category |

**What the research shows:**
- The head terms they all converge on: ADHD + to-do list / planner / organizer, daily planner, routine.
- Words in other languages:
  - German: ADHS and also ADHD, To-do-Liste, Aufgabenliste, Tagesplaner
  - Spanish: TDAH, lista de tareas, pendientes (Latin American), organizador, agenda
  - French: TDAH, liste de tâches, to-do, planificateur, agenda
  - Italian: ADHD (not the clinical DDAI), lista cose da fare, attività, promemoria, planner
- **Tiimo now uses "calm, doable day" and "brain dump" too.** Tiimo was iPhone App of the Year 2025, so "calm" alone no longer sets DoubleDone apart. "Nothing is ever overdue" and "never shames you" are lines nobody else uses. That is why the subtitle pick spends its room on that promise.
- **What I could not get:** search volumes, because the tools that have them are paid. The free way to check is Apple Search Ads' keyword popularity score (5 to 100) and Play Console's acquisition report by search term. Run both once this ships.

## Keyword strategy
**The rules:**
- Apple searches only the name, the subtitle and the keyword field (not the description or promo text). Words combine across those three within one localisation.
- So never repeat a word across them, put no spaces after commas, and leave out plurals.
- Play searches the title (30), the short description (80) and the full description (4,000), and gives weight to sensible repetition of the main terms.

### App Store, English (the only localisation today)
| Field | Draft | Count |
|---|---|---|
| Name | `DoubleDone: ADHD To-Do List` | 27/30 |
| Subtitle (pick) | `Calm planner, nothing overdue` | 29/30 |
| Subtitle (alternative) | `Daily planner for overwhelm` | 27/30 |
| Keywords | `todo,task,manager,daily,organizer,routine,autism,audhd,ocd,neurodivergent,brain,dump,breakdown,focus` | 100/100 |
| Promo text (not searched) | `A calm to-do list for ADHD, autism and OCD. Just today, sized to be doable, and nothing is ever overdue. The whole daily loop is free, for good.` | 144/170 |

- **The keyword field never repeats a word from the name or subtitle** (checked by script).
- **Out of the field:**
  - "shared, couples, household": they move to the en-GB keyword set below.
  - "calm": it is in the subtitle now, and the bare word mostly brings people looking for the Calm meditation app.
  - "simple", "habits", "chores": already ruled out in `listing-copy.md`, for the same churn reason.
- **The phone's icon label does not change.** It comes from `app.json` `name`, so the home screen still says DoubleDone.
- **Decided in advance, in case Apple objects to "ADHD" in the name** (guideline 2.3.7 or 1.4.1): fall back to `DoubleDone: Calm To-Do List` with the subtitle `For ADHD. Nothing overdue.` (26).
- **A risk to keep an eye on.** "planner" could bring people who want Structured-style time blocks. But Tiimo describes "planner" the way DoubleDone works: a brain dump turned into a doable day.

### New localisations for this version (Tier 2, drafts that need a native read)
- Screenshots fall back to the English set, so nothing is needed there.
- Each localisation needs its own description, promo text and What's New. Adapt the Play listings, which have already had a native review. Drop the Android-only lines (widget, Google Play) and add the Apple billing line and the terms URL.
- Spanish is neutral now, so one text serves both **es-MX** and **es-ES**. es-MX also covers Latin America, and the US store searches it as a second language.

| Locale | Name | Subtitle | Keywords |
|---|---|---|---|
| de-DE | `DoubleDone: ADHS To-do-Liste` (28) | `Ruhiger Tagesplaner, nur heute` (30) | `adhd,aufgaben,aufgabenliste,todo,autismus,zwangsstörung,neurodivergent,routine,erinnerung,planer` (96) |
| es-MX + es-ES | `DoubleDone: tareas para TDAH` (28) | `Solo hoy. Nada está atrasado.` (29) | `lista,pendientes,todo,planificador,organizador,autismo,toc,neurodivergente,rutina,recordatorio` (94) |
| fr-FR | `DoubleDone : liste de tâches` (28) | `Pour le TDAH. Rien en retard.` (29) | `todo,to-do,planificateur,agenda,organisation,autisme,toc,neuroatypique,routine,rappel,quotidien` (95) |
| it-IT | `DoubleDone: lista cose da fare` (30) | `Per l'ADHD. Niente in ritardo.` (30) | `adhd,attività,todo,planner,agenda,promemoria,autismo,doc,neurodivergente,routine,organizzazione` (95) |

- **Industry tables (MobileAction, April 2026) say Apple also searches a second language per country.** These come from observation, not from Apple:
  - Australia searches English (UK) as well.
  - Germany, France, Italy, Spain and Mexico all search English (UK) as their second language.
  - So an **English (UK) localisation** with the same visible text works as a second 100-character English keyword set in Australia, the UK and those five countries:
    `shared,couples,household,checklist,reminder,organiser,overwhelm,gentle,executive,function,steps,tiny` (100).
  - If the primary language turns out to be English (UK) already, add English (Australia) instead.
- "executive function" is close to clinical language, so keep it only in this hidden field (Tier 3, your call).

### Google Play
- **Title, all locales:** `DoubleDone: ADHD To-Do List` (27). Localised titles use the App Store names above.
- **English short description:** `A calm to-do list for ADHD, autism, OCD and overwhelm. Nothing is ever overdue.` (79/80). It mirrors the landing page's opening line and adds autism and OCD to the search terms.
- **Leave the four translated short descriptions alone.** They already lead with the audience and the promise, and they had a native review.
- **English full description:** draft below. The four translations get line fixes, listed after it.

## Draft rewrites

### App Store description (English, 3,970/4,000)
```
DoubleDone is a calm to-do list for adults with ADHD, autism, OCD and overwhelm.

The home screen is Today, and only Today. Not your whole backlog, not a wall of overdue guilt, just a day sized to be doable. Nothing is ever overdue here. It just waits.

When a task is too big to start, Break it down turns it into small steps, and ticking the last one finishes the real task. On a low day, tap Low and what counts as enough gently shrinks. When today gets loud, Settle is a quiet room with a breathing guide, always there and never earned. And the day closes gently, with zero guilt about what moved to tomorrow.

There are no streaks, no scores, and nothing that shames you. A task is never punished for existing. What you finish, you keep: your Calendar shows everything you actually did, including the old dreaded things you finally closed, because that deserves to be seen.

If you keep a list with somebody, Ours is one shared list between exactly two of you. Nothing on it says who did what, and nothing counts or compares, so it cannot become a scoreboard. A shared thing with a day on it, bin night on Tuesday, arrives on both your Todays by itself. Everything else, milk and batteries, stays on the shared list however long it gets, so your day stays yours. Tick it from either phone and it closes for both.

DoubleDone is made in Melbourne by Melroy. He built it for friends with ADHD and OCD, and for anyone whose list has ever felt like too much. Calm, predictable, and quiet by design.

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

DoubleDone Premium is an optional auto-renewable subscription, monthly or yearly, at the price the App Store shows you before you buy. It is charged to your Apple ID at confirmation of purchase and renews automatically until you cancel, which you can do any time in your Apple ID settings, up to a day before it renews. Once you sign in, you can also try Premium free for a month: no card, no charge, and it never turns into a subscription on its own. Everything in the free list stays free whether you subscribe or not.

Privacy, plainly: no ads, no advertising identifiers, no selling your data. You do not need an account, and your tasks live on your device unless you choose to sync or share a list. The AI features are on to start and only send what you use them on, to Anthropic's Claude. One tap in Settings turns them off, and the rest of the app keeps working. The full policy is at https://doubledone.app/privacy

DoubleDone is not a medical device. It does not diagnose, treat, cure or prevent any condition, and it is not a substitute for professional care.

Terms of use: https://doubledone.app/terms
```

### Play full description (English, 3,832/4,000)
```
Today is finite and achievable.

DoubleDone is a calm to-do list for adults with ADHD, autism, OCD and overwhelm. It shows you only what today needs, sized to be doable, and quietly keeps everything you finish. Nothing is ever overdue here. It just waits.

Most to-do apps hand you the whole list and call it motivation. For a lot of us, that is the overwhelm. DoubleDone gives you a calm home screen, a small day, and a to-do list that never shames you for a task simply existing.

MADE FOR
People with ADHD, autism, the AuDHD overlap, OCD, and anyone whose list has ever felt like too much. No streaks to break, no red, no guilt mechanics. DoubleDone is made in Melbourne by Melroy, who built it for friends with ADHD and OCD.

THE CALM CORE, FREE FOREVER
- Capture anything in seconds, and Sort for me shapes it into a doable day.
- See only today. Anything for another day waits calmly in Later.
- Break it down: a dreaded task in small steps. Tick the last one and the real task is done too.
- Make it tiny: a two-minute version, just to begin.
- A low day: tap Low, and what counts as enough gently shrinks.
- Lighten today: on a packed day it suggests moving a few things. Nothing moves until you say yes.
- Focus on one thing: one task on the screen, the rest out of sight.
- Where you left off: one short line on any task, for next time.
- Repeating tasks, routines and rhythms, with no streak to keep up.
- Gentle reminders, only the ones you ask for, and Hold me to it for a firmer nudge.
- Settle: a quiet room with a breathing guide, for when the day is loud.
- Close the day kindly. It honours what you did, never what you didn't.
- Calendar: everything you have actually finished, including the old task you dreaded for weeks. Your brain can't tell you that you did nothing.
- A free monthly scrapbook: a keepsake picture of what you finished.
- Today on your home screen, with the DoubleDone widget.

OURS: ONE SHARED LIST, WITH ONE OTHER PERSON
Free. Nothing on it says who did what, and nothing counts or compares, so it cannot become a scoreboard.

A shared thing with a day on it, bin night on Tuesday, arrives on both your Todays by itself. Everything else stays on the shared list however long it gets, so your day stays yours. Tick it from either phone and it closes for both.

You start it by reading somebody a six-character code, which only works for the email you invited. There is no feed, and nobody can reach you without that code. Either of you can leave whenever you like. Like sync, Ours needs only the email sign-in.

AI THAT HELPS, FULLY OPTIONAL
The AI features are on to start, and only send what you use them on: Sort for me shapes a brain-dump into your day, and Break it down turns a hard task into steps. One tap in Settings turns them off, and the rest of the app keeps working.

PREMIUM, IF YOU EVER WANT MORE
Optional extras through Google Play: Scan a list from a photo, Pin today's one thing, Plan my day, Chart a course, six more colour themes, a weekly scrapbook, Your patterns, and unlimited picks in What fits right now.

ON YOUR DEVICE BY DEFAULT
- Your tasks live on your device. No account needed to use the app.
- Optional sync across devices: an email and a one-time code, no password.
- What you use an AI feature on goes to Anthropic's Claude, which does not train on it. Scrapbook pictures are made with Cloudflare's AI models.
- No ads. No advertising identifiers or cross-app tracking. Nothing sold.
- Export your tasks and what you've finished, or delete your account, any time.

you're allowed to go slowly

DoubleDone is not a medical device. It does not diagnose, treat, cure or prevent any condition, and it is not a substitute for professional care. For medical advice, talk to a health professional.

Read the plain-English privacy policy at doubledone.app/privacy.
```
- **The Premium block names no price, no other way to pay, and no free month.** Mentioning the card-free month on Play would match Google's own example of a violation.
- **"which only works for the email you invited" is true.** `create_pair_invite` ties each code to a hashed email address.

### Line fixes for the other four Play listings
Take the replacement wording from the landing strings, which already had a native review and a truth check. The keys are in `client/src/lib/catalogs/<lang>.ts`. After editing, run `node scripts/check-listings.mjs` and get a native read.
- **All four:**
  - The "private by default" heading becomes `privTitle`.
  - The AI-off sentences become `priv2`.
  - The "no third-party trackers" bullet becomes `priv3`.
  - The "export your data" bullet becomes `priv4`.
  - Optionally add `founder` and a Premium line taken from `faqFreeA`, minus its free-month sentence.
- **es-ES:**
  - "llega a vuestros dos Hoy" becomes "llega al Hoy de los dos".
  - "Los dos iniciáis sesión" becomes "cada uno inicia sesión".
  - "así que tu persona no te carga la mañana" becomes "por larga que sea, para que tu día siga siendo tuyo".
  - Then paste the same text into **es-419**, replacing the unknown live text.
- **it-IT:** "NOSTRO: …", "Nell'app si chiama La nostra lista" and "Nostro chiede…" all become "La nostra lista".
- **de-DE:** the Backlog's "je nach zu viel" fix is due now. Change it together with the landing hero and footer, as the Backlog entry says.
- **fr-FR:** only the shared four. Its Ours lines are already true.

## #6 The medical line

**App Store description.** This is Play's live wording, verbatim. Put it after the privacy paragraph and before the Terms URL:
```
DoubleDone is not a medical device. It does not diagnose, treat, cure or prevent any condition, and it is not a substitute for professional care.
```
**Optional extra sentence (Tier 2):** "For medical advice, talk to a health professional." Google's Health apps policy text also asks apps to remind users to consult a professional. I put it in the Play English draft above. If you keep it, add it to the four translations, which need a native read.

**Terms clause (a draft, needs your OK because it is a legal page).**
- **Where it goes:** a new section after "Using DoubleDone", in both `client/public/terms.html` and `client/src/app/terms.tsx`. In the app file it goes outside the shop-specific branch, so every platform shows the same words.
- **Also:** bump "Last updated" on both. The legal pages stay in English.

> **Not medical care**
> DoubleDone is a to-do app. It is not a medical device, and it does not diagnose, treat, cure or prevent any condition. Nothing in it is medical, psychological or other professional advice, including the steps, plans and suggestions its AI features write, and it is not a substitute for care from a qualified health professional. Settle and its breathing guide are a quiet pause, not a treatment. For advice about your health, talk to a health professional. If you are in crisis or worried about your safety, call your local emergency number (000 in Australia).

- **Deliberately left out:** naming ADHD, autism or OCD next to "cure". To this audience that reads as calling autism something to be cured.
- **The last sentence is your call.** It adds no feature, but it does mention a crisis.
- **What carries the legal weight is the claims, not the disclaimer.** Under the Australian medical-device rules (TGA), what a product is "for" is judged from its claims and advertising. So keep "treatment", "therapy", "symptoms" and "ADHD management" out of every visible field.

## Tiers
- **Tier 1, this build:**
  - Truth fixes 1 to 7 on both stores.
  - English name, subtitle and keywords.
  - The medical line on the App Store.
  - The Terms clause, on your OK.
  - Read the live keyword field and the primary language in ASC first.
- **Tier 2:**
  - de, fr, it, es-MX and es-ES App Store localisations, plus the English (UK) keyword set.
  - Fixes 8 to 14.
  - Extend `check-listings.mjs` to cover `docs/appstore/listing-copy.md`: the 30/30/100/170/4000 caps, no Android, Google Play or web mention, no currency figure, the medical line present, and a list of banned phrases ("heavier", "colleagues", "nothing you type leaves", "Private by default").
  - Retire `play-resubmission-walkthrough.md` as a paste source.
- **Tier 3:** "executive function" and "neurospicy" as hidden keywords. Renaming the in-app purchase products, since Apple searches their names too.
- **Tier 4, never do:**
  - Competitor names in keywords (guideline 2.3.7).
  - "habit", "streak", "chores", "reward": they bring the wrong audience.
  - "anxiety", "therapy", "treatment" or "symptoms" in any field.
  - Stuffing English words into the es-MX keyword field to rank in the US.
  - Any trial wording on Play.
  - Ratings, awards or social proof.

## Next steps
1. In ASC, read the Primary Language and the live keyword field. That takes five minutes and decides whether the English (UK) keyword set is worth adding.
2. Approve the name and subtitle pick (or the alternative) and the Terms clause. I will then apply Tier 1 to the repo docs, run the checking script, and send you the paste-ready blocks.

## Sources
- [DoubleDone, App Store AU](https://apps.apple.com/au/app/doubledone/id6790136615), [App Store US](https://apps.apple.com/us/app/doubledone/id6790136615), [Google Play](https://play.google.com/store/apps/details?id=app.doubledone)
- [Tiimo US](https://apps.apple.com/us/app/id1480220328), [DE](https://apps.apple.com/de/app/id1480220328), [FR](https://apps.apple.com/fr/app/id1480220328), [ES](https://apps.apple.com/es/app/id1480220328), [IT](https://apps.apple.com/it/app/id1480220328)
- [Llama Life](https://apps.apple.com/us/app/adhd-organizer-llama-life/id6454469750), [Structured](https://apps.apple.com/us/app/id1499198946), [Goblin Tools](https://apps.apple.com/us/app/id6449003064), [Finch](https://apps.apple.com/us/app/id1528595748), [Todoist](https://apps.apple.com/us/app/todoist-to-do-list-task-list/id585829637)
- [MobileAction: App Store cross-localization (Apr 2026)](https://www.mobileaction.co/blog/app-store-cross-localization/)
- [Google Play: categories and tags](https://support.google.com/googleplay/android-developer/answer/113475), [Google Play Health apps policy](https://support.google.com/googleplay/android-developer/answer/13996367)
- Articles on non-English ADHD app searches: [ClickUp DE](https://clickup.com/de/blog/69407/adhd-apps), [ClickUp ES](https://clickup.com/es-ES/blog/69407/apps-para-el-tdah), [ClickUp FR](https://clickup.com/fr-FR/blog/69407/applications-pour-les-troubles-deficitaires-de-lattention), [ClickUp IT](https://clickup.com/it/blog/69407/app-per-ladhd)

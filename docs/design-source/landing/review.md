*Written 2026-10-18 by a four-lens research pass (feature inventory, page audit, competitor pages, audience and search), a synthesis, and a skeptic who checked it against the code. The skeptic's corrections follow the review and override it where they disagree.*

# DoubleDone landing page: design review

## The short answer

**Yes, show more features. You're right, but more features should mean more relief, not a longer list.**

- **How many:** go from 4 headed items and zero real screens to **14 headed items and 6 real screens**. About 14 more features get named in passing, inside sentences. There is no grid and no count anywhere.
- **Which ones:** the ones that answer a specific bad moment. Too big to start, too much today, too loud, sharing the load, and "did I really do it?". Those are Break it down with Make it tiny, the Low day with Lighten, Settle, Ours, and the Calendar with Done is done. Six small one-liners carry the rest: Just this one, Routines, Hold me to it, Rhythms, Where you left off, and the comfort settings.
- **The rule that picks them:** **everything on the page is free.** No Premium feature gets a section. That answers the paywall fear just by what the page leaves out, and it lets the trust block say "Everything on this page is free" and mean it.
- **The cost:** the page grows from about 4.2 phone screens to about 8. It gets longer, not denser. Every screen holds one idea, in one repeated pattern.

Right now the website is the thinnest of your three surfaces. Play lists 12 free features and the App Store 14, and both show 8 real screens. The web names about 5 features, all in text. That's backwards, because the web is the surface with the most room.

---

## The current page: keep and fix

| Keep | Fix |
|---|---|
| The audience is named in the first line | No real product on a phone's first screen. The drawn card starts at 687px, below the badges |
| "Free. No account needed. Your list stays on your device." sits right under the button | The drawn card shows the June design. Begin opens Today v3, so the visitor meets a different screen |
| "No streaks, no guilt, no red." on screen two | Step 1 leads with "The AI sorts it". The off switch is buried at the end of the longest FAQ answer |
| One column, two typefaces, one accent, no motion, no pop-ups, full dark mode | Repetition: trust line twice, badges twice, Begin twice, "finite and achievable" twice. The closing section is a second hero |
| Honest FAQ, checked against the code | The FAQ carries 59% of the words and is the only place sharing, reminders, sync and Premium appear |
| The "two of three done" card shows the word achievable instead of saying it | The title and H1 contain no search words. The meta description loses "ADHD" in a phone search result |
| Static, fast, crawlable, five languages before first paint | No provenance, and no "no ads, no trackers, nothing sold" |
| | On a phone, three calls to action look equal (Begin plus two "Also on" badges) |

---

## How many features, and at what weight

| Weight | Count | Which |
|---|---|---|
| Real screen plus its own heading | 6 | Close the day, Break it down with Make it tiny, Low day with Lighten today, Settle, Ours, the Calendar |
| Drawn, not photographed | 1 | Today (hero card: greeting, weight-of-day line, energy row) |
| A name and one line | 6 | Just this one, Routines and repeats, Hold me to it, Rhythms, Where you left off, Easy on the eyes |
| A plain fact inside a sentence | about 14 | Brain dump, the guided first run, Sort for me, AI off, the weight of today, Done is done, I also did that, bedtime capture, Welcome back, no account, sync, offline (phones), no ads, export and delete |

---

## The recommended page, top to bottom

### At a glance (390px wide)

| # | Section | Purpose | Visual | Height |
|---|---|---|---|---|
| 0 | Head | Search result and link card | og image | n/a |
| 1 | Header | Mark and name | none | ~56px |
| 2 | Hero | Who it's for, the belief, one action, a peek at the app | Drawn Today v3 card | ~880px |
| 3 | The promise | Never overdue, and coming back is safe | Quote set as type | ~320px |
| 4 | How a day goes | The whole loop, with an end | 1 real screen (rested) | ~780px |
| 5 | For the hard parts of a day | Relief moments | 4 real screens | ~2,000px |
| 6 | What you finish, you keep | Emotional payoff | 1 real screen (Calendar) | ~640px |
| 7 | Small things that help | The long tail, kept small | none | ~620px |
| 8 | Private by default | Honesty where others put award walls | none | ~480px |
| 9 | Questions | 7 closed rows | none | ~500px |
| 10 | Closing | One last invitation | none | ~220px |
| 11 | Footer | Links, languages, medical line | none | ~260px |
| | **Total** | | **6 real screens + 1 drawn** | **~6,800px, about 8 screens** |

All the visible copy comes to roughly 700 words, up from 337. Every block follows **one typographic pattern**: a mauve italic kicker, then a Newsreader heading, then a few words, then a picture. The hero already uses this shape, so the whole page reads as one system.

---

### 0. Head

| Field | Recommendation |
|---|---|
| Browser-tab title (55 chars) | `DoubleDone · A calm to-do list for ADHD, autism and OCD` |
| Meta description (141 chars) | `A calm to-do list for adults with ADHD, autism and OCD. It shows only what today needs, and nothing is ever overdue. Free, no account needed.` |
| og:title / og:description | Same as above |
| og image | New 1200x630, light: the Today v3 card, the kicker line and the wordmark. The current one shows neither the audience nor the product |
| Keep | Canonical, WebSite JSON-LD, no rating or SoftwareApplication schema |

The first 116 characters of the description hold the audience, what the app does and the promise, so a phone result that cuts off around 120 still lands. The title retires "a calmer kind of to-do", which the App Store subtitle already dropped in August.

### 1. Header

- **Purpose:** recognition only.
- **Content:** the double-tick mark and the DoubleDone wordmark. Cut the top padding so the hero starts higher.
- **Visual:** none. **Height:** ~56px.

### 2. Hero

- **Purpose:** in five seconds, say who it's for, what it believes, and what it looks like, with one clear action.
- **Content:**
  - **H1, line 1** (kicker style, mauve italic serif): *A calm to-do list for adults with ADHD, autism, OCD and overwhelm.*
  - **H1, line 2:** **Today is finite and achievable.**
  - **Sub (25 words):** If a to-do list has ever felt like too much, put it down here. DoubleDone shows only what today needs, and keeps everything you finish.
  - **Primary action:** on desktop, a mauve button reading **Start with today**. On iPhone and Android, that phone's store badge, with a quiet text link under it: *Or start in your browser* (see Decision 1).
  - **Trust line:** Free. No account needed. Your list stays on your device.
  - **The drawn Today card** (spec under "The hero, in detail").
  - **Caption under the card** (italic, small): *Everything else waits calmly in Later.*
  - **Desktop only, below the card:** Also on iPhone and Android, plus both badges. Phones never see the other platform's badge.
- **Visual:** the drawn card. No screenshot, no video.
- **Height:** ~880px. **Hard target:** the card's greeting and weight-of-day line sit inside the first 700px at 390 wide, so a real phone's first screen shows the product.

### 3. The promise

- **Purpose:** the line that sets DoubleDone apart, plus the answer to "I'll fall off it like every other app".
- **Content:**
  - **H2:** Nothing is ever overdue. It just waits.
  - No streaks, no red, no count of days. A task you didn't get to rolls to tomorrow, and nothing here will shame you for it.
  - Been away a while? Coming back looks like this:
  - *(set as a quiet card, in type)* "However long it's been, the past is fine. Nothing's overdue, nothing's lost."
- **Visual:** none. The promise is about something that's absent, and words show that best.
- **Height:** ~320px.

### 4. How a day goes

- **Purpose:** show the whole loop, so a visitor can see the day has an end. Flip the AI framing: the visitor does the work, AI is help they can take or leave, and the off switch sits right next to it.
- **Content:**
  - **H2:** How a day goes
  - **H3: Brain dump everything.** Type it or say it, one line per thing, in any order. Your first brain dump becomes your first Today, with no setup. Want help? Sort for me splits it into today, tomorrow and the ones to break down. Rather not use AI? Turn it off and sort it yourself.
  - **H3: Work through today, only today.** Today holds what fits in a day. Everything else waits quietly in Later. A calm line reads the day for you, like "A gentle day. Room to breathe.", never a number.
  - **H3: Close the day gently.** In the evening, Close the day honours what you did. Anything left rolls to tomorrow. Nothing is lost. Something on your mind for tomorrow? Add it here and let it go.
- **Visual:** one real crop after step 3: the rested screen, "You've closed today.", with the dusk art. The page's first real screen is a day at rest. That is the product's promise, and nothing else in the category looks like it.
- **Height:** ~780px.

### 5. For the hard parts of a day

- **Purpose:** the main feature section. Each block starts with the feeling, then names the feature in words people search for, then shows one real state.
- **Intro:**
  - **H2:** For the hard parts of a day
  - Some days are harder. These are here when you need them, and quiet when you don't.

| # | Kicker | H3 | Copy | Real screen | Height |
|---|---|---|---|---|---|
| 1 | When a task is too big to start | Break it into small first steps | Answer a question or two, and get small steps with a few minutes on each. Tick the last step and the real task is done too. Still too much? Make it tiny: one two-minute way in. | "Here's the plan" sheet for *Do my taxes* | ~500px |
| 2 | When there's too much for one day | Have a low day, or lighten it | Tap Low at the top of Today, and what counts as enough gently shrinks. On a packed day, Lighten today suggests what could move to later days. You choose. | Short crop of Today's top with Low selected: "A low day. A couple of things is plenty." | ~400px |
| 3 | When everything gets loud | Settle, a quiet room in the app | A soft shape breathes slowly, with a breathing guide if you want one. It's silent, and it's always free. One line says what you need to hear: the list will keep. | Settle | ~500px |
| 4 | When you share the load with someone | Ours: one list for two people | Anything with a day lands on both your Todays, like bin night. The rest stays on the list, so nobody can make your morning heavier. Nothing says who did what. Free, and you both sign in with an email code. | Ours, a dated shared item ("when") | ~500px |

- **Why these four:** they cover the most distinctive moments with the strongest visuals, and the search phrases match ("app to break down tasks adhd", "shared to-do list for couples").
  - Break it down is the most-searched need. The fact that ticking the last step finishes the real task is your edge over Goblin Tools.
  - The Low day works with no AI at all, which matters for the AI-wary half of the audience.
  - Settle is the screen nobody else has.
  - Ours has the most quotable lines the product owns.
- **Every block is identical:** kicker, H3, words, picture, in the same order. No zig-zag on desktop. Cap: four blocks. A new moment replaces one, it never makes five.

### 6. What you finish, you keep

- **Purpose:** the emotional payoff and the start of the moat. It currently gets 28 words and no picture.
- **Content:**
  - **H2:** What you finish, you keep.
  - Everything you finish lands in your Calendar, day by day, even the task you put off for weeks. It's there for when your brain says you did nothing.
  - Each tick also gets one calm line, like "Filed. You can stop checking it now." So you can.
  - Did something that was never on the list? Tap I also did that. It still counts.
- **Visual:** the Calendar of a finished week, with *Do my taxes* on the day it was done.
- **Why it's here:** the Done is done line is the OCD sentence no competitor writes.
- **Height:** ~640px.

### 7. Small things that help

- **Purpose:** carry the long tail without building a wall. Each item gets a name and one line, with a quiet dot as the bullet and no icons.
- **Content:**
  - **H2:** Small things that help
  - **Just this one.** Full screen, one task, everything else out of sight.
  - **Routines that start fresh.** Bins and bills come back on their day. Routines start clean each morning, with no streak.
  - **Hold me to it.** Pick one task and your phone reminds you, kindly, until it's done or you let it go.
  - **Rhythms.** Gentle phone nudges for water or meds. They never land on your list.
  - **Where you left off.** One line for the you who comes back: "Called, ref 4471, ring back Thu."
  - **Easy on the eyes.** Dark mode, bigger text, less motion, and a Quiet look that's just words on paper.
  - *Closing line:* On iPhone, Android and the web. Sign in with an email code to keep your phone and laptop in step. The phone apps work offline.
- **Visual:** none. **Cap:** six items. No "and much more", ever.
- **Height:** ~620px.

### 8. Private by default

- **Purpose:** where competitors put award walls, put checkable facts instead.
- **Content:**
  - **H2:** Private by default
  - No account needed. Your list stays on your device.
  - The AI is optional. One tap in Settings turns it off, and the app keeps working.
  - No ads. No third-party trackers. Nothing sold.
  - Everything on this page is free. Premium adds a few optional extras, and its free month needs no card, so there's nothing to cancel.
  - Download all your tasks any time. Delete your account and synced data in Settings.
  - *Founder note, small and set apart (see Decision 3):* DoubleDone is made in Melbourne by Melroy. He built it for friends and colleagues with ADHD and OCD, including people he has managed.
- **Visual:** none.
- **Before it ships:** confirm the card-free month is offered on iOS and Android as well as the web.
- **Height:** ~480px.

### 9. Questions

- **Purpose:** the detailed, anxious questions, answered yes or no first.
- **Content:** H2 "Questions", then **seven** closed rows, down from nine.
  - **Drop:** "What happens to unfinished tasks?" and "Can I share a list?". The page now answers both in plain view.
  - **Who is it for?** Add "adults" and "including the AuDHD overlap".
  - **Is it free?** Yes. Everything on this page is free, for good. Premium adds optional extras: Scan a list, Pin the day's one thing, Plan my day, Chart a course, six more colour themes, a weekly keepsake, Your patterns, and unlimited picks in What fits right now. Its free month needs sign-in but no card, and it ends on its own. *(The price follows Decision 2.)*
  - **Does the AI read my tasks?** Move the off switch into the first two sentences. Keep the Claude, Cloudflare and keepsake details.
  - **Where does it work?** On iPhone, Android and any modern browser. The phone apps work fully offline, and an open browser tab keeps going if the connection drops. Per-task reminders, Hold me to it and Rhythms arrive on your phone. Android also has a home-screen widget. It follows your device's language: English, German, Spanish, French or Italian.
  - **Keep as they are:** Do I need an account, Is it a medical device, How do I delete my data.
- **Rule:** the FAQ never grows back. A new question replaces an old one.
- **Height:** ~500px closed.

### 10. Closing

- **Content:** **When you're ready, start with today.** Then one action, with the same platform rule as the hero.
- **Drop:** the repeated trust line and the second badge row.
- **Height:** ~220px.

### 11. Footer

- **Content:**
  - Privacy · Terms · Support · For developers (the MCP and API docs live behind this link)
  - In English, Deutsch, Español, Français and Italiano.
  - DoubleDone is not a medical device.
  - The store trademark lines.
- **Drop:** "Today is finite and achievable." here (the H1 owns it) and the "Made for..." line (the hero sub already says it).
- **Height:** ~260px.

---

## Deliberately left off

| Feature | Why it stays off this page | Where it lives instead |
|---|---|---|
| Scrapbook keepsake, Share a keepsake | Your prettiest screen, but it's AI imagery. On the page it would read as an AI-art app to an AI-wary audience, and it sends the week's titles to the AI. It's a delight to find, not a reason to start | FAQ AI answer, the app |
| Your patterns and weekly reflection | Premium, and full of numbers, on a page about not counting | FAQ "Is it free?" |
| Scan, Pin, Plan my day, Chart a course, colour themes | Premium. The page features only free things | FAQ "Is it free?" |
| What fits right now | Metered (15 a month free). A limit on a calm page invites "what's the catch" | FAQ "Is it free?" |
| Tidy this into tasks | One AI shaper is enough to name. Sort for me covers it | The app |
| Combine, Move to, Move up / down, Track in steps, Mark as a lot, Done on, Tuck away, Long-press shortcuts, Right now | Mechanics you discover in use. Naming them turns the page into a manual | The app |
| Daily reminder, Remind me (per task) | The platform split makes them noisy. Hold me to it and Rhythms carry "gentle nudges" | FAQ "Where does it work?" |
| Android widget | One platform only, and naming it invites "where's the iPhone one?" | FAQ "Where does it work?" |
| Speak button, Share into DoubleDone | Platform-split. "Type it or say it" is true everywhere through dictation | FAQ, the app |
| The bloom | It's motion and can't be shown honestly in a still. It's also better as a surprise | The app |
| Undo, not "are you sure?" | Lovely, but it's a design trait, not a reason to start | The app |
| Living background and greeting | Shown in the hero card, not named | Hero card |
| MCP and REST API | Wrong audience | Footer "For developers" |

---

## The screenshot list

| # | Screen and state | Section | Light | Dark | Status |
|---|---|---|---|---|---|
| 1 | Close the day, rested: "You've closed today.", dusk art | How a day goes | yes | yes | New state for the harness |
| 2 | Break it down, "Here's the plan" for *Do my taxes*, four or five steps with minutes | Moment 1 | yes | yes | New state |
| 3 | Today, top region only, Energy set to Low: "A low day. A couple of things is plenty." | Moment 2 | yes | yes | New crop (today-light and today-dark exist at Normal) |
| 4 | Settle | Moment 3 | yes | yes | Exists: `settle-light`, `settle-dark` |
| 5 | Ours, a dated shared item ("bin night") | Moment 4 | yes | yes | `ours-when` exists in light. Dark is new (`ours-room-dark` is the fallback) |
| 6 | Calendar of a finished week, *Do my taxes* on its day | Payoff | yes | yes | `lookback-light` and `lookback-dark` exist. Reseed the tasks |
| 7 | og image 1200x630: Today card, kicker line, wordmark | Head | yes | n/a | New |

**Seed one cast everywhere:** *Call the pharmacy*, *Take the bins out*, *Reply to Sam's message*, *Do my taxes*. Taxes is the open task in the hero, gets broken down in Moment 1 and appears finished in the Calendar. Bins becomes bin night in Ours. The page tells one small story without saying it. Seeds must also set every render-gate flag, which is the onboarded-flag gotcha again.

**Format:**
- Raw harness captures, never the framed store slides. Those carry their own headlines and a device frame.
- WebP about 680px wide, 40 to 90 KB each.
- `<picture>` with a `prefers-color-scheme` source, width and height set, lazy-loaded, alt text in all five languages.
- Generate all five locales. French has no set yet, and an English screen on a German page is a small trust leak.
- Have `scripts/play-assets.mjs` also emit the web sizes, so one command refreshes both the stores and the site.
- The plan sheet's "Usually about N days" line can appear in the shot. Copy and alt text must never call it other people's data.

---

## The hero, in detail

**Keep a drawn card and redraw it to Today v3.** It costs zero image bytes above the fold, it's localised and in dark mode for free, screen readers get it as one labelled image, and its text can be crawled. A real screenshot wins everywhere below the hero. In the hero itself, the drawn card wins.

Parity spec:
- "Today" in Newsreader with its underline, and the greeting "Good morning. Just today."
- The weight bar and "A gentle day. Room to breathe."
- The Energy row, Low / Normal / High, with Normal selected. Moment 2 then shows the same row on Low, which makes a quiet before-and-after.
- Three bordered rows with mauve ticks: *Call the pharmacy* (done), *Take the bins out* (done), *Do my taxes* (open).
- The floating + pill.
- **Leave out:** Right now, the footer links and "+ I also did that". The card has to stay compact, about 320px.

**Order on a phone:** H1 (both lines), sub, primary action, trust line, then the card peeking with its greeting and gauge line above the fold. Badges for both platforms appear only on desktop, below the card.

**No hero video and no motion,** not even on Settle. Movement on this page only ever starts because the visitor tapped something.

---

## How it should feel on a phone

- **Like a short letter, not a brochure.** One idea per screen, and the page has an end, like the day.
- One 640px column on every screen size, with 16px gutters and no horizontal scroll. Body text is left-aligned throughout, including the payoff and closing, which are centred today.
- Atkinson body at 17 to 18px, line height about 1.5, sentences under 15 words, reading level kept around grade 4.
- The same block pattern everywhere, so the visitor learns the page once.
- One primary action per screen, full width, 52px tall.
- Nothing sticky, nothing pops up, no smart app banner, no cookie wall, no install prompt.
- Images keep their aspect ratio with no layout shift, and nothing loads above the fold except the badges. Dark mode stays complete, and the screenshots switch with the theme.

---

## What not to do

- **No feature grid, icon wall or multi-column layout.** A wall of features contradicts "today is finite" on the very page that sells it.
- **Never print a count:** features, users, tasks, ratings, "and much more".
- **No social proof you don't have.** No stars, testimonials, "loved by", "trusted by", press logos or rating markup. When real reviews arrive, one or two quotes go beside the promises, never instead of them.
- **No streak, score, badge or trophy imagery.**
- **No autoplay, carousel, parallax, scroll effects, "New" tags, countdowns or sale banners.**
- **No price table and no comparison table** on this page.
- **No lived-experience framing.** Never "built by one of us" or "by and for".
- **No clinical promises.** No "manage your ADHD", "treatment" or "medication adherence". Rhythms are reminders.
- **No truth traps.** Never write:
  - "works offline" without "the phone apps"
  - an iPhone widget
  - a Speak button on phones
  - Hold me to it or Rhythms on the web
  - "the same line every time", or a Good enough button
  - "people like you took N days"
  - "learns your patterns" or "gets smarter"
  - "your titles never leave your device"
  - "opt-in" data collection
  - "the AI never sees your tasks"
  - calendar sync
  - "unlimited AI"
  - native-reviewed translations
- **Don't market the scrapbook as an AI image generator.**
- **Don't chase "visual planner" or "visual schedule".** That's Tiimo's ground, and visitors who come for it will bounce.
- **No idioms.** "Bite the Elephant" and "Strategise" stay internal.

---

## When it gets built

- New copy goes into all five catalogues, marked as drafts pending native review.
- The title and meta change wherever they're set today: `landing-page.ts`, `scripts/inject-web-meta.mjs`, and the `+html.tsx` reference copy.
- It's a `feat`, so it needs a decision-log entry saying what was decided against: the grid, the price, the scrapbook.
- Add manual cases to `scripts/gen-test-suite.py` and regenerate, in the same commit. At minimum: the platform-aware action and the screenshots switching with the theme.
- A push to main is the deploy, so it waits for your weekend window and your word.

---

## Three decisions for you

**1. Where does a phone visitor end up: their app store, or the browser?**
- **My pick: the store for their phone,** with "Or start in your browser" underneath.
- **Why:** nudges, Hold me to it, Rhythms, full offline and the widget all live in the phone apps. A list started in a phone browser also stays in that browser unless they sign in, so a later install starts empty.
- **Cost:** installing is a heavier first step than one tap, and you'll see fewer web sessions to measure.
- **Rule either way:** one primary action per screen.

**2. Does a price appear on the page?**
- **My pick: no figure.** Name every Premium extra in "Is it free?" and say the free month needs no card.
- **Why:** A$5 is only the web price, and store visitors pay their own local price. A figure also makes a free product read like a trial. If the Play listing's website link points here, a fixed A$ figure revisits the 1.5.1 rejection.
- **Cost:** the "hidden costs" fear is only half answered.

**3. Does the founder line carry your name, and what exactly does it say?**
- **My pick: first name and city, naming ADHD and OCD only,** because that's what is true.
- **Why:** with zero reviews, provenance is the only honest stand-in, and a name is something a visitor can check.
- **Cost:** your name goes on a public consumer product while you're interviewing. I think that helps you.
- **Either way:** the App Store description says it was built with "ADHD, autistic and OCD friends and colleagues" in mind. Decide which version is true and make both surfaces say it.

---

## Stress-test: corrections that override the review above

- **[must]** The height budget is wrong, so the page would end up as the feature wall it says it avoids. Every capture is 390x844, which is about 2.16:1. At the 346px phone column one full screenshot is about 750px tall, and at the 640px desktop column it is about 1,385px. The review gives each moment block about 500px including the picture, which can't hold a full screen. With four full screens and two crops the page comes to about 9,000 to 10,000px, roughly 11 to 13 phone screens, not 8. For comparison, the current page measures 3,719px in English.
  - **Fix:** Make every picture a crop, not a full screen. Crop to the region that proves the line (the plan sheet's steps, the top of Ours, the Calendar grid plus the selected day), at about 4:5. Cap the displayed width at about 320px on desktop. Then recount the page height and cut moments until it really lands near 8 screens. Write the crop size into the spec so nobody ships a full-height phone image.
- **[must]** Two parts of the privacy section go further than the privacy policy allows. 'No third-party trackers' and 'Private by default' sit on a web page that loads Google Fonts. client/src/global.css line 5 runs @import fonts.googleapis.com, so every visitor's IP address goes to Google, and client/public/privacy.html never mentions it. On phones, the policy itself says RevenueCat receives a device identifier when the app opens, even if you never buy anything. The policy only supports 'No ads. No advertising identifiers and no cross-app tracking. No selling or sharing your data.' This matters most on the German page. In 2022 a Munich court awarded damages over exactly this kind of remote Google Fonts embedding.
  - **Fix:** Use the policy's own words: 'No ads. No advertising identifiers or cross-app tracking. Nothing sold.' Before saying anything stronger, self-host Newsreader and Atkinson Hyperlegible on the web. The .ttf files are already in client/assets/fonts. Then drop the @import, which also removes a render-blocking request above the fold. Make that a separate commit with a decision-log line.
- **[must]** The hard target for the first phone screen fails. I measured the live export at 390x844 with the fonts loaded. The drawn card's top sits at 722px in English, 761px in German and 780px in French. The German H1 runs to 3 lines and its sub to 5. The proposed hero adds height: the new kicker is longer (66 characters against 53, so 3 lines), and on phones a store badge plus an 'Or start in your browser' link replaces the 52px button. By my estimate the greeting and the weight-of-day line land at about 690 to 740px in English and about 800px in de and fr. Safari's visible area on a 390x844 iPhone is only about 660px. A 375x667 phone is worse.
  - **Fix:** Restructure the hero, don't just restyle it. On phones the order should be: kicker, H1, then a compact card (greeting, weight line, three rows, about 220px), then the action and the trust line. Alternatively, cut the sub to one sentence and the trust line to one line ('Free. No account. Stays on your device.'). Make the acceptance check concrete: greeting and weight line visible at 375x667 and 390x844 in en, de and fr, measured with the fonts loaded.
- **[must]** The founder note says he built it for colleagues with ADHD and OCD 'including people he has managed.' On a public page with his name on it, while he is interviewing, that clause narrows the group to a small, findable set of former direct reports. In effect it puts their health conditions on the open web. Once Google has crawled it, it is cached and hard to take back.
  - **Fix:** Drop the clause: 'DoubleDone is made in Melbourne by Melroy. He built it for friends and colleagues with ADHD and OCD.' That still matches CLAUDE.md, never implies 'one of us', and names nobody. Move the note out of the privacy facts block and into the closing or the footer, where a story belongs.
- **[should]** 'Rhythms. Gentle phone nudges for water or meds.' The one-tap meds preset was removed (decision-log 2026-09: only the Water suggestion remains). The app's own copy (routines.rhythmIntro) says 'like a glass of water or a stretch'. The app also tells Android users 'Nudges arriving late, or not at all?' (routines.batteryHint). Selling medication reminders from an app whose nudges can arrive late is exactly the 'medication adherence' framing the review bans in its own list. It also sits badly beside 'not a medical device' and Play's Health apps declaration.
  - **Fix:** Use the app's line: 'Rhythms. Gentle nudges through the day, like a glass of water or a stretch. They never land on your list.' Keep meds off the marketing page.
- **[should]** The review misreads where Begin goes. Begin goes to /today (app/index.tsx), and Today sends a first-time visitor to /welcome (today.tsx around line 583). So a fresh visitor meets the nine-step onboarding, not Today v3. Its first screen has a banner photo and the tagline 'A calmer kind of to-do.', the phrase the review is retiring. Its later steps (safetynet, keep, finished, shared, premium) teach the same features again. So after 8 or more screens of features, the visitor sits through the same tour a second time. welcome.tsx also states the opposite design rule in its header: 'curate, don't catalogue.'
  - **Fix:** Decide which surface does the teaching. If the landing shows the relief moments, trim the onboarding's safetynet, keep and shared steps (or the reverse). Either way, retire welcome.tagline along with the title so the first screen after Begin matches the page. Check the hero card's continuity against /welcome as well as Today v3.
- **[should]** The page still catalogues, just without a grid: 14 headed items plus about 14 named in passing makes about 28 named features. Two of the six long-tail items, Hold me to it and Rhythms, don't exist in the browser. today.tsx only wires onHold when Platform.OS !== 'web', and Rhythm nudges are native-only. Yet the desktop primary action sends people to the browser.
  - **Fix:** Cut section 7 to three items that work everywhere (Just this one, Routines and repeats, Where you left off), or drop it entirely and let onboarding and in-app discovery carry the rest. Move the phone-only items into the FAQ answer 'Where does it work?'.
- **[should]** Step 1 copy contradicts what the first run does. allOnToday (client/src/lib/triage.ts) deliberately puts the whole first dump on Today, with no tomorrow and no Later. 'Your first brain dump becomes your first Today... Sort for me splits it into today, tomorrow and the ones to break down' reads as if the first sort splits it. The current step1Body ('tucks the rest away') is already false on the first run, and the review didn't catch it.
  - **Fix:** 'Your first brain dump all lands on Today, nothing hidden. After that, Sort for me can split a dump into today, tomorrow and the ones to break down. Rather not use AI? Turn it off and sort it yourself.'
- **[should]** 'Today holds what fits in a day' claims a cap that doesn't exist. tasksForToday shows every undated task and every task due today or earlier. Only the weight line and Lighten today (which needs AI and a full day) respond to load.
  - **Fix:** 'Today holds only today. Anything with a later day waits quietly in Later, and if today gets full, Lighten today helps.'
- **[should]** The screenshot list is less ready than its 'exists' column says. (a) Every PNG in docs/screenshots and screenshots-de/es/it dates from 16 to 20 August. That's before Today v3 merged on 27 September, and they still show the old docked footer. (b) LOCALE runs keep English seed titles, so the German Today shot reads 'Drink a glass of water', the same trust leak the review warns about. (c) The harness doesn't pin the clock, so the greeting and the Right now slot change with the hour of capture. The Right now slot sits directly under the Energy row, and in the morning with AI on its occupant is Plan my day, which is Premium, inside the 'Low day' crop. (d) There is no AI fixture, so the 'Here's the plan' state needs live Sonnet calls on every run, across locales and themes, unless one is added. (e) ours-when is a 'When' date-picker modal over a dimmed list, not a dated shared item. (f) The Calendar shot includes the Scrapbook heading the review keeps off the page. (g) Playwright can't write WebP, and the repo has no encoder (only @resvg and jimp-compact). (h) play-assets.mjs is the tool that makes framed slides, which contradicts 'raw captures, never framed'. (i) 6 shots x 2 themes x 5 locales = 60 images to keep current.
  - **Fix:** Extend scripts/screenshots.mjs, not play-assets.mjs. Add page.clock.setFixedTime (playwright-core 1.61 has it) at about 14:00. Add per-locale seed casts. Add a page.route fixture for the break-down endpoint, modelled on stubSupabase. Crop by testID or clip. Use ours-room cropped to the top three rows. Seed doubledone.closed.v1 and doubledone.dayenergy.v1, plus the reminder, widget and scrapbook offer flags, for the rested and Low states, and pick a seed load that actually yields 'A low day. A couple of things is plenty.' Encode WebP with Chrome's canvas.toBlob('image/webp') inside the same run, or add sharp as a devDependency with a decision-log line. Cut to four shots so the set is 40 images, not 60.
- **[should]** Translation risk: about 700 words of new marketing copy, with four drafts per word, on a public page. Much of it already exists translated in the catalogues: welcome.safetyNet*, welcome.sharedLead2-4, welcome.keepLead1-3, closeDay.rollForward and bedtimePrompt, today.reentryBody, estimate.weight.lowLight, celebrate.affirmations.filed, routines.empty, routines.rhythmIntro, settle.aff3. Feature names also differ by locale: Ours is 'Unsere Liste' and 'Notre liste', while Settle stays 'Settle'. On top of that, only English is crawlable, because the other locales sit in inert <template> elements. Tuning de and fr H3s to 'words people search for' therefore buys nothing.
  - **Fix:** Build each block from existing keys first. Add new keys only for kickers and H3s, and always take feature names from the catalogue (actions.*, today.focusLabel, ours.defaultName), never hardcoded English. Write the H3s for meaning, with search wording in English only.
- **[should]** 'Private by default' sits next to 'The AI is optional', but AI is on by default (DEFAULT_SETTINGS aiEnabled: true in client/src/lib/settings.ts). The onboarding's primary button on the capture step is Sort for me, which sends the dump to Claude. The policy covers this with 'unless you choose an AI feature'. Even so, an AI-wary reader who finds out later will feel misled by the framing.
  - **Fix:** Say it plainly in the privacy block: 'Your list stays on your device. The AI helpers are on to start, and only send what you use them on. One tap in Settings turns them off, and the app keeps working.'
- **[should]** Page weight is multiplied by five and rides on every route. The landing is 44KB of the 57KB index.html (15KB gzipped), and the SPA fallback serves that file for /today and every deep link. Doubling the copy, plus <picture> markup and alt text in five languages, roughly doubles it for every returning user too.
  - **Fix:** Set a budget in the spec, for example index.html under about 30KB gzipped, and add a CI check next to the existing dd-landing grep in deploy-web.yml. Keep the alt text short.
- **[minor]** 'Everything on this page is free' appears on a page whose FAQ lists the Premium extras by name. The review also flags the repeated trust line, then repeats 'No account needed. Your list stays on your device.' in section 8 and says 'Everything on this page is free' twice.
  - **Fix:** Say 'Everything above is free' once, in section 8. Drop the repeated trust phrase from section 8 and let the hero own it.
- **[minor]** 'No streaks, no red, no count of days' is stated as a general promise, but finishing an old task shows a count ('Three weeks since you first wrote it down.', celebrate.linger), and Close the day says 'You finished 3 things today.' The current FAQ scopes the line to unfinished tasks, which is why it's true there.
  - **Fix:** 'No streaks, no red, and no count of days on anything you haven't done.'
- **[minor]** Small accuracy slips. (1) Settle 'One line says what you need to hear' when seven lines rotate, and only while the guide is off. (2) 'A Quiet look that's just words on paper' when Quiet covers Today only and other screens stay standard (docs/premium.md). (3) Decision 1 says nudges live only in the phone apps, but the web has the daily Web Push reminder. Only per-task nudges, Hold me to it and Rhythms are phone-only. (4) 'Answer a question or two' implies the questions are required.
  - **Fix:** (1) 'Quiet lines drift by, like: the list will keep.' (2) 'A Quiet look for Today.' (3) Say 'per-task nudges, Hold me to it and Rhythms'. (4) 'Answer a quick question if you like.'
- **[minor]** 'I also did that' is on probation. The privacy policy says it is counted 'only until we have decided whether it earns its place on Today'. Featuring it in the payoff section risks advertising something that may be removed.
  - **Fix:** Leave it out of the payoff section until the keep-or-cut call is made, or make the call first.
- **[minor]** The drawn hero card now includes Low/Normal/High pills and the floating + pill. On a role=img card those look tappable and do nothing. A dead tap is a small predictability break for an autistic visitor.
  - **Fix:** Either make the whole card a link to Begin, or draw the pills and the + in a flat, clearly decorative style (no border or shadow that says 'button').
- **[minor]** The build notes are off. TITLE and DESCRIPTION are hardcoded in scripts/inject-web-meta.mjs, and landing-page.ts holds no title. The catalogue's welcome.metaTitle and metaDescription are dead keys that nothing reads. 'For developers' has no page on doubledone.app to link to. The review's own copy also breaks its 'under 15 words' rule in several places (an 18-word Calendar line, an 18-word Premium line). Screenshots also freeze dates ('August 2026'), so the page ages.
  - **Fix:** Change the title and meta in inject-web-meta.mjs and +html.tsx, and either delete the dead catalogue keys or wire them up. Point 'For developers' at https://api.doubledone.app/api/v1/docs or drop it. Split the long sentences. Crop out the dates or regenerate the shots each release, with the clock pinned.

### Keep, as the skeptic verified

- The direction is right. Show more through four relief moments, each opening with the bad moment and then naming the feature. Melroy's instinct is sound, and the kicker, H3, words, picture pattern is the right way to scale it.
- Only free features get their own block, Premium is named only in the FAQ, and no price figure appears (Decision 2). I verified the card-free month is offered on iOS and Android too: trialSlot shows it whenever the user is signed in, and Android has its own trialNoCardPlain copy. So 'its free month needs no card' is true on all three surfaces.
- The truth-trap list is excellent, and I verified it line by line against the code. There's no Speak button on phones (privacy.html). Hold me to it and Rhythms are native-only (today.tsx, reminders.web.ts). 'Usually about N days' is derived from the decomposition, never crowd data (estimate.ts). The Good enough button is folded into the rotating affirmations (celebrate.ts). 'Unlimited AI' is held (premium.md). Keep the whole list.
- Everything it leaves off: the scrapbook, Your patterns, What fits right now, the Android widget, MCP and API, the bloom, the 'visual planner' search ground. Each one has a correct reason.
- The rules: no grid, no counts, no social proof, no rating or SoftwareApplication schema, no motion, nothing sticky, the FAQ never grows back, four moments maximum. These match landing-page.ts's existing WebSite-only JSON-LD decision.
- The drawn, localised, crawlable hero card instead of a screenshot. It costs zero image bytes, and dark mode and five languages come free.
- Store-first on phones with 'Or start in your browser' (Decision 1). The reason is real: a list started in a phone browser stays in that browser unless the user signs in.
- Showing the app's real lines instead of describing them: today.reentryBody, estimate.weight.lowLight, celebrate.affirmations.filed and closeDay.restedTitle all exist in all five catalogues.
- The verified product claims can stay as written. Ticking the last step completes the parent (today.ts, the silentParent cascade). Settle is free with no paywall. Ours is free, shared by two people, records nothing about who did what, and puts dated items on both Todays. Export, delete and AI-off are all in Settings.
- Founder line names ADHD and OCD only, and it flags that the App Store copy says 'autistic'. That discrepancy is real (docs/appstore/listing-copy.md line 96), so fix both surfaces together.
- The meta description gets the audience and the promise into the first 116 characters. It retires 'a calmer kind of to-do' and moves the AI off switch into the first two sentences of the FAQ answer.
- The copy follows the style rules: I found no em or en dashes and no semicolons in the proposed copy.

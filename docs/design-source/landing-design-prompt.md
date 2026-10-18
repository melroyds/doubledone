# Claude Design prompt: DoubleDone, the landing page (show what it does, calmly)

*For Claude Design. Written 2026-10-18. doubledone.app's landing page was rebuilt that day as static, crawlable HTML in five languages. It now needs a design: the founder asked whether it should present more of the features, and the answer is yes, as relief rather than as a list. A four-lens review and a skeptic have already settled most of the content. This round is the page's shape, rhythm and pictures.*

**Attached** (all captured 2026-10-18 at 390x844, scale 2):

- **The page as it is now**, live: `current-first-screen-en-light.png`, `current-first-screen-en-dark.png`, `current-first-screen-de-light.png` (German, the long case), and the full-length `current-full-en-light.png`, `current-full-en-dark.png`, `current-full-de-light.png`.
- **The app as it is now**, from the screenshot harness (`app/`), for the pictures you will crop:
  - **Today:** `today-light.png`, `today-dark.png` (Today v3: greeting, the weight line, Energy, Right now, bordered rows, the floating + pill), and `capture.png` (the brain dump).
  - **The Calendar:** `lookback-light.png`, `lookback-dark.png`.
  - **Settle:** `settle-light.png`, `settle-dark.png`.
  - **Ours, the shared list:** `ours-room.png`, `ours-room-dark.png`, `ours-when.png`.
  - **The first-run welcome:** `welcome.png`.
- **`review.md`**, the full design review and its stress-test. **The stress-test's corrections override the review where they disagree**, and they are folded into this brief.

Shots that do not exist yet: the Break it down plan sheet, Today with Energy on Low, and the rested Close-the-day screen. Draw them from the descriptions below. The harness will capture the real ones for the build.

## The product

DoubleDone is a calm to-do app that never shames. It is for adults with ADHD, autism, the AuDHD overlap and OCD, and it is live on web, iOS and Android, in English, German, Spanish, French and Italian (German and French run long). The spine: **today is finite and achievable**. The rule that cannot break: **never shame the backlog**. The whole daily loop is free. Premium is optional extras, and this page sells none of them.

**The brand is "Dusk":**
- **Type:** Newsreader for headings (serif, 500 and 600, plus italic 400 and 500) and Atkinson Hyperlegible for body (400 and 700). Both are self-hosted.
- **Light palette:**
  - surfaces: paper `#FAF6F1`, surface `#FFFFFF`, line `#ECE4D8`;
  - text: ink `#2B2722`, body ink `#5F564C`, soft ink `#6B6259`;
  - accents: mauve `#8D5D6F` (the landing's deepened accent, AA as text on paper), with white on mauve; sage done `#7E9B6B`, with `#21261F` on sage.
- **Dark palette:**
  - surfaces: paper `#1B1917`, surface `#252119`, line `#34302A`;
  - text: ink `#F2EBE0`, body `#D8CEC0`, soft `#C9C0B4`;
  - accents: mauve `#C68BA0`, with `#2B2722` on mauve; sage `#9DB98A`.
- **Spacing tokens:** 2, 4, 8, 12, 16, 24, 32, 48. **Radii:** 8, 14, 20.
- **The page today:** one 640px column, 22px side padding, no motion. Full dark mode follows the system.

## Why now

An outside website audit found that search could not see the site, and that the audience was named only at the bottom. Both are fixed: the page is now real HTML, the first line names the audience, and the browser tab says "DoubleDone · A calm to-do list for ADHD, autism and OCD".

What is still wrong is in the review: **the website is the thinnest of the three surfaces.** Play lists 12 free features and the App Store 14, each with 8 real screens. The website names about 5, all in text, with one drawn card showing the June design. The founder's instinct: show more. The review's answer: show more relief. **Organise the page around the hard moments of a day**, each answered by one feature and one real picture, in one repeated pattern, with an end.

## Already decided (do not reopen)

- **One primary action per screen.**
  - **On an iPhone** it is the App Store badge.
  - **On an Android phone** it is the Google Play badge.
  - Under either badge sits one quiet text link: **"Or start in your browser"**.
  - **On a laptop or tablet** it is a mauve **Begin** button, with "Also on iPhone and Android" and both badges, small, below the hero card.
  - **Never** show a phone the other platform's badge.
  - The page picks the version from the browser before it paints. Without JavaScript, or if it can't tell, it shows the laptop version, so every visitor still has a way in.
  - Why: reminders, Hold me to it, Rhythms, the widget and full offline are phone-app features, and a list started in a phone browser stays there unless the person signs in.
- **No price figure anywhere.** The Premium extras are named only in the question "Is it free?".
- **Everything the page features is free.** Say "Everything above is free" once, in the privacy block.
- **No email capture of any kind.** Email is only ever used to sign in.
- **No social proof:** no stars, no testimonials, no counts, no "loved by". There are no reviews yet, and the page never fakes any.
- **The founder line, exactly:** "DoubleDone is made in Melbourne by Melroy. He built it for friends with ADHD and OCD." It belongs in the closing or the footer, small, never as a headline. Never "built by one of us".
- **No motion.** No autoplay, carousel, parallax, scroll effects, sticky bars, pop-ups or install banners. Anything that moves starts only because the visitor tapped it.
- **One column at every width**, left-aligned body text, and the same block pattern every time: mauve italic kicker, then a Newsreader heading, then a few words, then a picture.

## The page, top to bottom

| # | Section | What it holds | Picture |
|---|---|---|---|
| 1 | Header | The double-tick mark and the wordmark, with less top padding than now | none |
| 2 | Hero | Who it's for, the belief, a peek at the app, then the one action and the trust line | The drawn Today card |
| 3 | The promise | "Nothing is ever overdue. It just waits." and coming back after a gap | Type only |
| 4 | How a day goes | The loop, with an end: brain dump, then Today, then Close the day | One crop: the rested Close-the-day screen |
| 5 | For the hard parts of a day | Four relief moments (below) | One crop each |
| 6 | What you finish, you keep | The Calendar, and the calm line each tick gets | One crop: a finished week |
| 7 | Small things that help | Three items that work everywhere | none |
| 8 | Private by default | Checkable facts, in the privacy policy's own words | none |
| 9 | Questions | Seven closed rows | none |
| 10 | Closing | One invitation, one action, the founder line | none |
| 11 | Footer | Links, the languages, the medical line, the store trademark lines | none |

### 2. The hero, the hard part

**The target that matters most:** on a 390x844 phone, the drawn card's greeting and weight line must show on the first screen, in English, German and French. Today the card starts at 722px in English, 761px in German and 780px in French, so a phone visitor never sees the product. This is a restructure, not a restyle.

- **Order on a phone:**
  1. The kicker: "A calm to-do list for adults with ADHD, autism, OCD and overwhelm."
  2. The H1: "Today is finite and achievable."
  3. The compact card, about 220px.
  4. The action.
  5. The trust line: "Free. No account needed. Your list stays on your device."
- **The kicker and the H1 are ONE h1** (two lines, two styles). The page has exactly one h1.
- **The sub-line is optional.** Cut it to one short sentence if it keeps the card above the fold, or drop it on phones only.
- **The card is drawn, not a screenshot.** That means zero image bytes, crawlable text, and dark mode and five languages for free.
  - **Draw it to Today v3** (see `today-light.png`): "Today" in Newsreader with its mauve underline, the greeting ("Good morning. Just today."), the weight bar with "A gentle day. Room to breathe.", the Energy row Low / Normal / High with Normal selected, and three bordered rows: "Call the pharmacy" and "Take the bins out" done (mauve tick), "Do my taxes" open.
  - **Leave out** Right now, the footer links, "+ I also did that" and the + pill.
  - **Draw the Energy pills flat and plainly decorative,** with no border, shadow or hover that says "button". The whole card is one labelled image. A control that looks tappable and does nothing breaks predictability for an autistic visitor.
- **Under the card,** one small italic caption: "Everything else waits calmly in Later."

### 3. The promise

- **H2:** "Nothing is ever overdue. It just waits."
- **Body:** "No streaks, no red, and no count of days on anything you haven't done. A task you didn't get to rolls to tomorrow, and nothing here will shame you for it."
- **Then:** "Been away a while? Coming back looks like this:"
- **Then a quiet card set in type**, the app's real line: "However long it's been, the past is fine. Nothing's overdue, nothing's lost."

### 4. How a day goes

Three short steps, each an H3 and two or three sentences:

- **Brain dump everything.** "Type it or say it, one line per thing, in any order. Your first brain dump all lands on Today, nothing hidden. After that, Sort for me can split a dump into today, tomorrow and the ones to break down. Rather not use AI? Turn it off and sort it yourself."
- **Work through today, only today.** "Today holds only today. Anything with a later day waits quietly in Later, and if today gets full, Lighten today helps. A calm line reads the day for you, never a number."
- **Close the day gently.** "In the evening, Close the day honours what you did. Anything left rolls to tomorrow. Nothing is lost."

**The picture, after step 3:** a crop of the rested screen, "You've closed today.", with the dusk art. It is the page's first real screen: a day at rest.

### 5. For the hard parts of a day

- **H2:** "For the hard parts of a day"
- **Intro:** "Some days are harder. These are here when you need them, and quiet when you don't."

Then **exactly four blocks, identical in pattern.** No zig-zag on desktop. A future moment replaces one, never makes five.

| Kicker | H3 | Words | Crop |
|---|---|---|---|
| When a task is too big to start | Break it into small first steps | Answer a question or two, and get small steps with a few minutes on each. Tick the last step and the real task is done too. Still too much? Make it tiny: one two-minute way in. | The "Here's the plan" sheet for "Do my taxes": four or five steps with minutes |
| When there's too much for one day | Have a low day, or lighten it | Tap Low at the top of Today, and what counts as enough gently shrinks. On a packed day, Lighten today suggests what could move to later days. You choose. | Today's top region with Low selected: "A low day. A couple of things is plenty." |
| When everything gets loud | Settle, a quiet room in the app | A soft shape breathes slowly, with a breathing guide if you want one. It's silent, and it's free. Quiet lines drift by, like: the list will keep. | Settle |
| When you share the load with someone | Ours: one list for two people | Anything with a day lands on both your Todays, like bin night. The rest stays on the list, so nobody can make your morning heavier. Nothing says who did what. Free, and you both sign in with an email code. | The top of Ours with a dated row |

### 6. What you finish, you keep

- **H2:** "What you finish, you keep."
- **Body:** "Everything you finish lands in your Calendar, day by day, even the task you put off for weeks. It's there for when your brain says you did nothing. Each tick also gets one calm line, like 'Filed. You can stop checking it now.' So you can."
- **The crop:** the Calendar of a finished week, with "Do my taxes" on the day it was done.
- **Do NOT feature "I also did that".** It is on probation.

### 7. Small things that help

Three items, a name and one line each, with a quiet dot for a bullet and no icons. **All three work on every platform.**
- **Just this one.** Full screen, one task, everything else out of sight.
- **Routines that start fresh.** Bins and bills come back on their day. Routines start clean each morning, with no streak.
- **Where you left off.** One line for the you who comes back: "Called, ref 4471, ring back Thu."

**Not here:** Hold me to it and Rhythms. They exist only in the phone apps, and the FAQ's "Where does it work?" names them. **No "and much more", ever.**

### 8. Private by default

These words are the privacy policy's. Do not strengthen them:
- "No account needed. Your list stays on your device."
- "The AI helpers are on to start, and only send what you use them on. One tap in Settings turns them off, and the app keeps working."
- "No ads. No advertising identifiers or cross-app tracking. Nothing sold."
- "Export everything any time. If you signed in, delete your account and synced data in Settings."
- "Everything above is free. Premium adds a few optional extras, and its free month needs no card."

### 9. Questions

Seven closed rows: **Who is it for, Is it free, Do I need an account, Does the AI read my tasks, Where does it work, Is it a medical device, How do I delete my data.**
- "What happens to unfinished tasks" and "Can I share a list" are dropped, because the page now answers both in plain view.
- **The rule:** the FAQ never grows. A new question replaces an old one.

### 10 and 11. Closing and footer

**The closing:** "When you're ready, start with today.", then the one action, with the same platform rule as the hero. Then the founder line, small. No second trust line and no second badge row.

**The footer:**
- **Links:** Privacy, Terms, Support, and For developers (to https://api.doubledone.app/api/v1/docs).
- **"In English, Deutsch, Español, Français and Italiano."**
- **"DoubleDone is not a medical device."**
- **The store trademark lines.**
- **Drop** "Today is finite and achievable." here, because the H1 owns it.

## Truth traps (never write these)

- **Offline:** "works offline" without "the phone apps".
- **Phone-only features on the web:**
  - a Speak button on phones;
  - an iPhone widget;
  - Hold me to it or Rhythms on the web.
- **Over-promises:**
  - "unlimited AI";
  - "learns your patterns";
  - "the AI never sees your tasks";
  - "your titles never leave your device";
  - "people like you took N days".
- **Clinical claims:**
  - "manage your ADHD";
  - "treatment";
  - medication reminders.
- **Missing or misdescribed features:**
  - calendar sync;
  - a Quiet look for anything but Today.
- **Lived experience:** any lived-experience framing.

## The pictures

- **Every picture is a crop, never a full phone screen.** Crop to the region that proves the line, at about 4:5. Cap the displayed width at about 320px on a wide screen.
- **Mark each crop's region on the full screen you took it from.** The build captures it at that region from the harness.
- **Every picture is a light and dark pair,** switched by the visitor's theme.
- **Alt text** in all five languages, short and literal.
- **No device frames** and no store-slide headlines.
- **One small story runs through the pictures, without saying it:**
  - "Do my taxes" is open in the hero, broken down in moment 1 and finished in the Calendar;
  - "Take the bins out" becomes bin night in Ours.

## Constraints

- **The page is static HTML.** Every word must be real, crawlable text, never text inside an image (the drawn card is HTML too). One h1, then h2 per section and h3 per block, in order.
- **Weight:** the HTML ships on every route of the app, so keep markup lean. Target under 30 KB gzipped for `index.html` (15 KB today), and lazy-load every picture below the hero.
- **Contrast:** every visible string clears WCAG AA (4.5:1) on its own background, in light and dark. The trademark fine print included.
- **Long languages:** design at German and French lengths, not English. At 320px wide nothing scrolls sideways.
- **Touch targets:** every link and control is at least 44px tall, with a visible focus ring (3px mauve, offset 3px). The questions are `<details>`, keyboard-ready with no script.
- **Reduced motion is not a variant,** because there is no motion.

## Screens to produce

- **The recommended page, full length, at 390 wide:** English light, English dark, German light.
- **The first phone screen (390x844) in English, German and French,** with the 844 fold drawn, proving the card shows.
- **The hero's action on an iPhone, on an Android phone and on a 1280-wide laptop,** side by side.
- **A 320-wide phone in German,** top to the end of section 5.
- **The four moment blocks at 1280 wide,** to prove the one-column pattern holds on a laptop.
- **Focus states** on the action, a question row and a footer link.
- **Each crop marked on its source screenshot.**

## Deliver

A zip whose README is the contract:
- **Layout and spacing** on the tokens above, by name.
- **Every string,** new and changed, in all five languages. **Reuse the app's own wording** where it exists (the review lists the catalogue keys), and take feature names from the app, never translated fresh.
- **The crop list:** for each picture, its source screen, the region, light and dark.
- **Accessibility:**
  - the heading order;
  - the drawn card's one spoken label;
  - the focus order;
  - the contrast figure for every visible text colour.
- **What you left out on purpose, and why.**

## What this is NOT

- **Not a feature grid,** an icon wall, a multi-column layout, a comparison table or a price table.
- **Not a gallery of the app.** Seven pictures, no more, and every one of them earns its place.
- **Not motion,** not video, not a scrolling phone, not a "watch how it works".
- **Not the scrapbook.** Its images are AI-made, and on this page they would read as an AI-art app to an AI-wary audience.
- **Not Premium,** beyond naming its extras in "Is it free?".
- **Not a new brand.** Same Dusk, same two typefaces, same one accent. No gradients beyond what the app's own art carries, no glow, no badges, no "New".
- **Not a change to the app's screens.** The welcome flow's own wording ("A calmer kind of to-do") will be brought in line separately.

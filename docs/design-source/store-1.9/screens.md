## Item #4: six captioned iOS screenshots. Plan, script changes, iPad answer

### Bottom line
- **Six slides, in this order:** Today, held card (Break down), Calendar, capture, Settle (dark), Ours. Apple shows the first three in search results, so those three carry the pitch: the promise, the moment you're stuck, the payoff.
- **Build it as a `STORE=ios` mode inside `scripts/play-assets.mjs`.** It reuses `slideHTML`/`renderExact` with iOS sizes, JPEG output and a bigger caption. It also takes the seeding fixes from `scripts/landing-shots.mjs`: pinned clock, translated sample tasks from the catalogue, a two-person Ours fixture, and a blocked AI host.
- **No iPad shots.** `client/app.json:12` has `"supportsTablet": false`, and Apple only asks for iPad shots "if your app supports iPadOS".
- **Two truth bugs are in the live listings now.** Fix both in this batch:
  - Both capture shots show a **Speak** button that no phone app has.
  - The Ours shot reads "Waiting for your person".

---

### Apple's rules today
Checked on developer.apple.com screenshot-specifications and the App Review Guidelines, 2026-10-19.

- **Formats and count:** .jpeg, .jpg or .png, no alpha. At least 1 and up to 10 per size. If the UI is the same across sizes, "you only need to provide screenshots for the highest required resolution" and App Store Connect scales them down.
- **Accepted iPhone sizes:**
  - Dynamic Island large: 1260x2736, 1290x2796, **1320x2868**
  - Face ID large (6.5"): **1284x2778**, 1242x2688. Its entry says "Required if app runs on iPhone and screenshots for iPhone with Dynamic Island (large display) aren't provided".
  - Dynamic Island medium: 1179x2556, **1206x2622**
- **Is 6.9-inch alone enough?** The table says yes. But the page's own header now says the required iPhone size is "At least one screenshot for iPhone with Dynamic Island (medium display)", which contradicts the table. App Store Connect also refused a 1320x2868 set on 2026-08-17 and asked for 6.5" sizes (decision log, "Three screenshot sizes"). So I wouldn't bet on one size.
  - **What I'd do:** render all three, 1320x2868, 1284x2778 and 1206x2622, from the same composite. That costs one extra render loop and no extra captures.
  - Upload the 1320x2868 set first, and fill whatever slot App Store Connect marks as required.
- **iPhone Duo (new):** 1398x2034 outer, 2007x2853 inner. Required "Starting in April 2027" for builds on the iOS 27.1 SDK or later. These are a much squarer shape and will need a second layout. Park it in the Backlog with that SDK as the trigger.
- **Guidelines that apply:**
  - **2.3.3:** shots must show the app in use, "not merely the title art". Text overlays are allowed. This is a second reason to drop the welcome shot.
  - **2.3.7:** no prices in screenshots.
  - **2.3.10:** no imagery of other platforms. A plain dark bezel reads as a generic, non-iPhone phone, so I recommend a frameless screen card instead.

---

### The six slides

| # | Screen (existing iOS shot) | Theme | Headline (authored line break shown as /) | Words | Why it is true (code) |
|---|---|---|---|---|---|
| 1 | Today, scrolled to the end (`today-light`) | light | Only today, / sized to feel possible. | 6 | Home is Today. The picture's gauge reads "A gentle day. Room to breathe." These are the same words as Play slide 2. |
| 2 | Held card on "Book the dentist" (`held-card`) | light | Too big? / Break it down. | 5 | Break down is on every held card, free. It gives an AI plan when AI is on, and the manual breakdown when AI is off (`client/src/app/today.tsx:2847`). |
| 3 | Calendar (`lookback-light`) | light | See everything / you actually did. | 5 | The Calendar is the always-free record of finished tasks (`lookback.tsx:520`). It echoes the screen's own subtitle, "For when your brain says you did nothing". |
| 4 | Capture panel with three lines typed (`capture`) | light | Empty your head / in one go. | 6 | The box takes many lines at once and offers "Add 3". |
| 5 | Settle (`settle`) | **dark** | A quiet room / for loud days. | 6 | Settle has no gate and is free (the listing says "always there and never earned"). |
| 6 | Ours room (`ours-room`) | light | One shared list. / Never a scoreboard. | 6 | Nothing on the list shows who did what or counts anything. Same words as on Play and Instagram. |

**Alternates, if you want one:**
1. "Just today. Nothing is ever overdue." It is true: `client/src/lib/today.ts:58-62` rolls an overdue one-off forward with no shaming. But it repeats the subtitle "A to-do list, never overdue", which sits directly above slide 1 in search. That's why I put it second.
2. "Stuck? Break it into steps."
3. "Everything you finish, you keep." (Play's wording)
4. "Get it out of your head."
5. "When today gets loud, breathe."
6. "Share a list, not a score."

**One claim I deliberately avoided:** "never the whole list". Every undated open task shows on Today, and future ones sit in a Later section below it (`today.tsx:3350`), so it isn't true.

**Why Settle is dark:** the light Settle shot is a cream screen on a cream slide and washes out. Dark gives the strip one visual beat and shows dark mode without spending a slot on `today-dark`.

**What I dropped:**
- **welcome:** title art under 2.3.3, and its words now live in the captions.
- **today-dark:** Settle covers dark mode.
- **ours-when:** a detail of Ours, not a benefit of its own.
- **settings-light:** not a benefit.
- **Stopping at six:** most shoppers never swipe past three or four, so a seventh slide buys little.

**The one ordering call I'd push on:** Ours at slot 3 would match the keywords `couples`, `shared` and `household`. I'd keep it at 6, because couples are the smaller audience and Ours needs a sign-in. Settle it later with a Product Page Optimization test rather than a guess. That runs without a new version.

**Stronger but AI-dependent option for slot 2:** the "Here's the plan" sheet from `landing-shots.mjs` (a stubbed plan of four short steps). It shows the result, not just the menu. It's true for default users (AI is on by default, `client/src/lib/settings.ts:33`), but an AI-off user never sees that sheet. The held card is true for everyone.

---

### Truth bugs in the current sets (fix in this batch)

1. **Speak is web-only, and both stores show it.**
   - `client/src/lib/speech.ts` returns false on native, and `client/src/components/BrainDump.tsx:730` only renders Speak when it's true. So iPhone and Android never show the button.
   - Yet `docs/appstore/capture.jpeg` (live on iOS) and `docs/play-store/phone/capture.png` (live on Play) both show it.
   - **Fix in the harness:** an init script that deletes `window.SpeechRecognition` and `window.webkitSpeechRecognition` before the app boots, so the web build draws the native panel.
   - Since this batch ships one version to both stores, regenerate Play's capture slide too.
2. **The Ours shot reads "Waiting for your person · Get a new code".** The fixture answers `pair_members` with one member. Use the two-member fixture from `landing-shots.mjs` (partner "Sam") so the room is joined.
3. **There's a blurred grey square in the bottom-left corner of `docs/appstore/ours-room.jpeg`**, about 30 to 130 px across and 2740 to 2860 px down. It looks like dev-server overlay left behind after the `#error-toast` hide. The new slides will make it obvious, so check the new raw captures for it.
4. **The dates are frozen at "Sunday 27 September" and "September 2026".** Pin the clock as `landing-shots.mjs` does.
5. **Same batch, but not screenshots:**
   - `docs/appstore/listing-copy.md` says "built with ADHD, autistic and OCD friends and colleagues in mind". That breaks the founder rule (friends, not colleagues).
   - Play's capture caption "Empty your head. One tap to add." stretches it: the + opens the box and Add is a second tap. Use "Empty your head in one go." on both stores.

---

### Script changes (`scripts/play-assets.mjs`, a `STORE=ios` mode, Play output unchanged when it's unset)

1. **Switch:** `const STORE = process.env.STORE === 'ios' ? 'ios' : 'play'`.
   - Keep it in this file. That follows the decision log's choice against a shared `scripts/` module, and adds a mode rather than a fourth generator.
2. **Raw capture size:** iOS captures at 440x956, scale 3, which is 1320x2868. Play stays at 412x892, scale 2. `RAW_RATIO` is derived from whichever applies.
   - One raw capture per shot and language feeds all three output sizes.
   - That makes the 6.5" `TODAY_FIT` workaround in `screenshots.mjs` unnecessary here.
3. **Output sizes:** `DEVICES` for iOS are `6.9` 1320x2868, `6.5` 1284x2778 and `6.3` 1206x2622.
   - Output goes to `docs/appstore/captioned/<size>/<locale>/01-today.jpeg` through `06-ours.jpeg`, numbered so file order is upload order.
   - **Never write to `docs/appstore/*.jpeg`.** `scripts/social-slides.mjs` reads those plain JPEGs as its source.
4. **`slideHTML` gets an iOS layout.** Everything is set as a proportion, so one template renders all three sizes:
   - **Caption:** about 7.5% of the slide width (around 99 px at 1320). It renders as two authored lines, one span per line as in `social-slides.mjs`, and starts about 7% from the top.
   - **Screen card:** about 76% of the slide height, with the width derived from the raw ratio (about 1003 px at 1320). That leaves about 150 px at the bottom.
   - **Card style:** frameless, with corner radius about 5.5% of the card width, a hairline border and the existing shadow. No bezel and no wordmark: the icon and name sit right above the shots in the listing.
   - **Background:** the same warm gradient, which is opaque.
5. **JPEG writer:** `renderExact` writes `type: 'jpeg', quality: 92` for iOS. Then it reads each file's JPEG size header (the FFC0 marker) and fails unless the size is exact. That is the decision log's rule: a file can be named right and sized wrong.
6. **Wrap guard:** port it from `social-slides.mjs` and make it **fail**, not warn. A wrapped line steals height from the screen card, and German will be the language that trips it.
7. **Caption gate:**
   - Every shot has a caption in every language.
   - Reject em and en dashes, "!", digits and currency (2.3.7), and the words Android, Google, Play and Stripe (2.3.10, and the Android payments rule if the captions are ever reused).
   - French must have a no-break space before ? ! : ;
8. **Raw-capture hardening, copied (not imported) from `landing-shots.mjs`:**
   - `timezoneId`, plus `page.clock.install` pinned at 14:00 on a fixed date.
   - **Settle uses the real clock.** The landing script found that a fake clock freezes the breathing on its first frame. Keep `motion: 'system'` and the 2.6 s delay.
   - `pinRandom`, and the `doubledone.reminderoffer.v1` seed.
   - The AI host blocked with `route.abort`, so a run never spends AI. `__DEV__` already stops usage beacons on `npm run dev`, but not on the production export, where the new speech fix would otherwise be the only safeguard.
   - The Speak fix from bug 1, and the two-member Ours fixture from bug 2.
   - The browser locale from `LOCALE_TAG`.
   - Waits by testID or by a catalogue string through the esbuild `translate` bundle, never by English `waitText`.
   - Sample tasks in each language from the catalogue's `landing.cast*` keys, plus the landing script's `OURS_ROWS` and `OTHER_DAYS`.
9. **Settle in dark:** shot 5 gets a dark raw capture. Nothing else changes.
10. **Docs, same commit:**
    - Rewrite the Screenshots section of `docs/appstore/listing-copy.md` with the new order, folder and run command.
    - Add a decision-log entry: this is a `feat(shots)` commit, so it records what was decided and what was rejected (bezel, iPad, welcome first, Ours third).
    - Add Backlog lines to `BUILD-PLAN.md` for iPhone Duo (trigger: the iOS 27.1 SDK), the localised App Store listings, and the Product Page Optimization test.
11. **Run:** `npm run dev`, then `STORE=ios node scripts/play-assets.mjs` in Git Bash. In PowerShell: `$env:STORE='ios'; node scripts/play-assets.mjs`. Set `LOCALES=en` while iterating.
12. **Before upload:** you look at all six at real phone size. A render passing the guards doesn't prove it looks right.

**Rough effort:** half a day to build, plus your visual pass.

---

### How localisation would work

- **Caption source:** `storeShots.*` keys in the five catalogues (`client/src/lib/catalogs/*.ts`), following the `landing.*` precedent.
  - That gets the existing parity tests and the native-review flow (`scripts/gen-i18n-review.py`) for free.
  - Feature words sit next to their catalogue names, so a translator is tied to them. "Break down" must match `breakdown.breakDown`, and Ours keeps its default name.
  - The cost is about 1 KB in the bundle.
  - The fallback, if you'd rather nothing ships to phones, is `docs/appstore/captions.json` with the gate in item 7.
- **Screens:** the localised versions get translated sample tasks and the app's own UI, so a German slide shows German tasks. This fixes the decision log's open note that the sample tasks were still English.
- **Language rules:**
  - **Spanish:** one neutral `es` set, uploaded to both Spanish (Mexico) and Spanish (Spain). Use tú imperatives: no vosotros, no voseo, no words specific to one region.
  - **French:** no-break spaces where required.
  - **German:** „…“ quotes, and the two authored lines are checked by the wrap guard.
  - **Italian:** proper accented letters throughout.
- **Prerequisite and phasing.** The repo has no Apple listing copy in any language but English: `listing-copy.md` is English-only, and the Apple What's New in `docs/release-notes/1.8.0.md` is English-only. So App Store Connect is most likely English-only, and localised shots would have nowhere to go until those localisations are created there.
  - Check App Store Connect's language picker first.
  - **Recommendation:** ship English in this build (it shows in every storefront), and do de/es/fr/it as a follow-on together with the App Store localisations (name, subtitle, keywords, description), each with a native read.

---

### Tiers
- **Tier 1 (this build):**
  - The English six at 6.9, 6.5 and 6.3.
  - The Speak, Ours and corner-smudge fixes.
  - Regenerate Play's capture slide with the Speak fix.
  - The `listing-copy.md` update.
  - In App Store Connect, delete the ten plain shots that carry over to the new version, then upload 01 to 06 in order.
- **Tier 2:** fix "colleagues" in the description (whichever item owns the copy), and use "in one go" in Play's caption.
- **Tier 3:** the localised sets plus the App Store localisations, and the Product Page Optimization test on Ours placement.
- **Tier 4 (skip):** captioned iPad shots (`docs/appstore/ipad-13/` stays as it is until a universal build), an app preview video, and the iPhone Duo layout before its trigger.

### Files referenced
- C:\Users\molte\Dropbox\Claude Output\Product Manager Portfolio\DoubleDone\scripts\play-assets.mjs
- C:\Users\molte\Dropbox\Claude Output\Product Manager Portfolio\DoubleDone\scripts\screenshots.mjs
- C:\Users\molte\Dropbox\Claude Output\Product Manager Portfolio\DoubleDone\scripts\landing-shots.mjs
- C:\Users\molte\Dropbox\Claude Output\Product Manager Portfolio\DoubleDone\scripts\social-slides.mjs
- C:\Users\molte\Dropbox\Claude Output\Product Manager Portfolio\DoubleDone\docs\appstore\listing-copy.md
- C:\Users\molte\Dropbox\Claude Output\Product Manager Portfolio\DoubleDone\docs\appstore\capture.jpeg (shows Speak)
- C:\Users\molte\Dropbox\Claude Output\Product Manager Portfolio\DoubleDone\docs\appstore\ours-room.jpeg (shows "Waiting for your person", and the corner smudge)
- C:\Users\molte\Dropbox\Claude Output\Product Manager Portfolio\DoubleDone\docs\play-store\phone\capture.png (shows Speak)
- C:\Users\molte\Dropbox\Claude Output\Product Manager Portfolio\DoubleDone\client\src\lib\speech.ts and C:\Users\molte\Dropbox\Claude Output\Product Manager Portfolio\DoubleDone\client\src\components\BrainDump.tsx (the Speak condition)
- C:\Users\molte\Dropbox\Claude Output\Product Manager Portfolio\DoubleDone\client\app.json (supportsTablet false)

Sources: [Apple screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/), [App Review Guidelines 2.3](https://developer.apple.com/app-store/review/guidelines/). Third-party 2026 guides ([appscreenshotstudio](https://appscreenshotstudio.com/blog/iphone-app-store-screenshot-sizes-2026-required-vs-optional), [Adalo](https://studio.adalo.com/blog/app-store-screenshot-sizes-2026)) still say 6.9-inch is the only required size, so they predate Apple's new page.

Nothing in the repo was changed.
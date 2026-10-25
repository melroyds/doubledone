# Claude Design prompt: DoubleDone, "A month on us" (a free month of Premium as thanks for a note)

*For Claude Design. Written 2026-10-25, then checked against the code by two reviewers the same day. Send Melroy a
note about the app and, if you are not already Premium, a month of Premium is on us, on iPhone, Android and the web
alike. Almost everything about how it works has been decided. This round is about how the offer looks on the front of
the app, the note it opens, the thank-you states, and how Premium looks while the month runs and after it ends.*

**Attached** (in `docs/design-source/feedback-month/`, captured from the web build at phone size, 390x844 at 2x, with
seeded tasks): `today-whats-new-light.png` and `today-whats-new-dark.png` (Today with the one-time What's New card, the
house pattern for an announcement), `today-plain-light.png` (Today with no card, where the new one would sit),
`settings-feedback-open-light.png` and `settings-feedback-open-dark.png` (Settings, the Help card with the feedback
form open). The Developer band under Help in the Settings shots ships in dev builds only: ignore it. No shot exists of
the Premium screen during a free month, of Quiet, of a non-Dusk palette, of German, of Large text or of a phone
keyboard, so all are described below.

## The product

DoubleDone is a calm to-do app that never shames. It is for adults with ADHD, autism, the AuDHD overlap and OCD, and
it is live on web, iOS and Android. The spine: **today is finite and achievable**. The rule: **remove friction, never
add a setting**. The brand is "Dusk": Newsreader serif headings, Atkinson Hyperlegible body, warm paper, a full dark
mode and one mauve accent used sparingly. Seven colour themes, each light and dark, so 14 palettes. A free **Quiet**
appearance strips the chrome. Five languages (en, de, es, fr, it), and German and French run long. The whole daily
loop is free. Premium is optional extras (Scan, Pin, six more themes, weekly scrapbooks, Your patterns, Chart a
course, Plan my day, energy picks without a limit).

## Why now

Melroy, who makes DoubleDone alone, wants to hear from the people using it. On 25 October he asked for "a REALLY bright
pop-up on the front of the app" offering a thank-you for feedback. Paying for a store review was ruled out: both stores
forbid rewarding reviews, and it is bought social proof. A launch modal was ruled out too, because it interrupts Today
before the person has seen their day, which is the exact overwhelm the app exists to prevent. Melroy agreed: "All good
with the pushback on really bright pop-up."

**So the brief's one real tension is this: design the loudest thing in the app that still does not interrupt.** He
wants it impossible to miss. The spine says it must sit in the flow, ask once, and get out of the way.

## What is decided (design on these, do not reopen them)

1. **One rule on every platform.** A note to Melroy brings a month of Premium, granted to the signed-in account on our
   server. iPhone, Android and web get the same taps. There is no code box of ours anywhere (Apple rejects code boxes
   that unlock features). If App Review ever rejects the iPhone grant, the pre-decided fallback is Apple's own offer
   code, and that gets its own design round. Do not design it now.
2. **Who can get it right now.** The server answers one question, "can this account get a month now?": signed in, not
   Premium from any source (paid, the existing card-free month, or a month already given), and no month given in the
   last **180 days**. Signed out counts as "yes" until sign-in proves otherwise. **Every offer surface (the Today card,
   the Settings line, the offer line inside the note) shows only when the answer is yes,** and only after a successful
   read of it. Nobody is ever shown a promise that is then not kept.
3. **People already paying** get their next payment moved 30 days later instead. That is **phase 2**, built after the
   rest, but design its states now so the set is complete (F below).
4. **The check.** It exists to stop spam, not to grade anyone.
   - **A floor that Send enforces, visible from the start.** While a month is on offer, a calm helper sits with the
     field ("A sentence or two is plenty") and Send stays dimmed until the note is at least about three words. The
     thresholds must let a short real note through in every language, a German compound and a two-word Italian note
     included. When no month is on offer, any note can be sent, as today.
   - **With AI on,** Claude (Anthropic's AI) reads a note from someone who can get the month, once, and stops only
     clear spam or a keyboard mash. Anything borderline passes, and a timeout or an error passes.
   - **With AI off,** nothing goes to Claude. The floor is the whole check.
   - **A note that does not pass gets the same "Sent, thank you." as anyone, and the app never says a note was not
     good enough.** For people with rejection sensitivity, being told your words did not count is the injury this app
     is built to avoid. Because of the floor, only spam ever reaches this.
   - **Every note reaches Melroy, whatever the check says. Only notes from someone who can get the month go to
     Claude.**
5. **Never tied to a review.** No word, link or moment in this feature mentions a rating, a review, stars or the store.
   The store's own rating card stays off until the given month ends (a stored date, not a session, because a phone app
   can live for days).
6. **Where the offer lives.**
   - **On Today, once.** A card at the top of the open day, a week after first open (for devices that already have the
     app, a week after the first launch of this build), only when the answer in item 2 is yes, and never in the same
     visit that another one-time card (re-entry, What's New, the hold hint) was on screen or was dismissed. It appears
     on the next open instead, so one card never spawns the next. Per device.
   - **In Settings, always** while the answer is yes: a quiet line with the existing "Send feedback" row. When the
     answer is no, the row is the plain "Send feedback" it is today.
7. **When the month ends,** one calm line says so, once per device. It fires only when a successful entitlement read
   shows the month's end date is in the past (the date is stored when the month starts and refreshed on each good
   read), never just because Premium reads as off, which a network blip can cause. Everything made during the month
   stays (a picked colour theme stays applied, an existing pin stays).
8. **Signed out.** The note can always be sent. Getting the month needs an account, so a signed-out person is offered
   sign-in (email and a 6-digit code, no password, which also syncs their tasks across devices) and can skip it and
   send anyway. The draft is saved to the device as it is typed and restored on return, the same never-lose-words rule
   as the capture panel. After sign-in, if the account cannot get a month, the offer line changes before Send to one
   that promises nothing ("Notes are always welcome.").
9. **What Melroy receives.** The note and the platform. The server uses the account only to grant the month, and the
   email to Melroy carries no address. (Whether there is a way to offer a 20-minute call is Melroy's call, pending. See
   H.)
10. **Not testimonials.** No note is ever quoted publicly, and there is no "may we quote you" anywhere. A quote from
    someone given a free month would be an incentivised testimonial.

### The Today card's life, as a table

| Event | What happens to the card |
|---|---|
| Not now | Retired for good on this device |
| Its button, then Send (any outcome) | Retired for good |
| Its button, then Cancel | The card comes back |
| A month given anywhere, any device | Not shown, because item 2 now answers no |
| Another one-time card on screen or dismissed this visit | Waits for the next open |
| The hold hint never dismissed | The card never shows. Accepted: the Settings line covers it |
| The entitlement read fails | Not shown this visit |

## The surfaces today

All figures are from the code. Spacing tokens: `spacing.half` 2, `one` 4, `two` 8, `three` 12, `four` 16, `five` 24,
`six` 32, `seven` 48. Radius: `sm` 8, `md` 14, `lg` 20, `pill` 999. Borders: `hair` 1, `thin` 1.5, `thick` 2.
`PRESSED_OPACITY` 0.7. Every font size is multiplied by the text-size setting (0.92, 1, or 1.18 for Large). Fonts:
`fonts.sans` is the Newsreader family. On the web the style's fontWeight picks 400, 500 or 600 (the Today heading and
the Settings section heads are 500, the Premium head 400). On iOS and Android only Newsreader 600 is loaded, so every
heading renders at 600 there. `fonts.body` is Atkinson Hyperlegible 400 and `fonts.bodyBold` is Atkinson 700. Only
those two Atkinson weights exist: a style that asks for 600 on `fonts.body` renders 700 on the web and 400 on Android,
so any new bold text uses `fonts.bodyBold`.

### 1. Today, top to bottom (an open day)

Scroll content: paddingTop safe area + 48, paddingHorizontal 24, maxWidth 560, centred. Behind it, the "living sky"
(a soft gradient that follows the time of day).

1. The top bar: the date (15pt `skyInk`) and the Menu pill.
2. **Re-entry card** ("Welcome back.") after 4 or more days away. The only card above the heading.
3. The heading "Today" (38/42 Newsreader) with its accent rule, then the greeting ("Good afternoon. Just today.",
   16pt `skyInk`, marginBottom 32).
4. The weight gauge and its line ("A gentle day. Room to breathe.").
5. ENERGY: Low, Normal, High pills.
6. The Right now card ("Focus on one thing").
7. **What's New**, then **the hold hint**, then the Remove undo bar. These sit directly above the first task row.
8. The task list (gap 8). Finished tasks stay in it by default, and only with Finished tasks set to tuck do they fold
   into "Done today · {count}". Then the empty or all-done note, "+ I also did that", Later (with its month folds), the
   "Due today · Ours" strip when a shared list has something due, the ethos line, and last the optional links ("Sync
   and sharing" when signed out, Today's only sign-in door, plus the daily-reminder toggle).
9. Outside the scroll: the floating **+** capture pill at the bottom centre, and the affirmation note that floats just
   above it ("Noted.", "Moved to Wednesday 4 November.").

**Nothing arbitrates the top cards today.** Re-entry, What's New and the hold hint can stack. The new card adds the
first rule (item 6). In the attached What's New shot, at default text in English, about one and a half task rows are
left above the fold.

### 2. The What's New card (the house pattern for a one-time announcement)

- Container (Standard): a row, `accentSoft` fill, `radius.md` 14, padding 12 vertical by 16 horizontal, gap 12,
  marginBottom 12. No border, no shadow. Quiet: no fill and no radius, padding 8 vertical by 2 horizontal, the words
  straight on the sky.
- Left column, gap 4: a title "WHAT'S NEW" (11pt `fonts.body` at fontWeight 600, so 700 on the web and 400 on
  Android, letterSpacing 1.2, uppercase, `inkSoft`), then lines at 14/20 Atkinson in `ink`.
- Right: "Got it" (14pt `fonts.bodyBold`, `accentText`), vertically centred against the whole block, hitSlop 8, no
  minimum height, no pressed style.
- No motion. It mounts and unmounts.
- Spoken: each Text separately, then a button "Got it" that does not say what it dismisses (a known weakness: do
  better here).

### 3. The re-entry card (the other one-time card)

`accentSoft` fill, `radius.lg` 20, padding 24, gap 12, marginBottom 24. Title "Welcome back." in `subheading` 22/28
Newsreader, body 16/24 Atkinson, and a `PrimaryButton` "See today". No Quiet branch.

### 4. The brightest thing the app already has: the Premium gradient

`settings-feedback-open-light.png` shows the Settings Premium card above Help. A diagonal `LinearGradient` with
`PREMIUM_GRADIENT` (`#8E5E72`, `#9E6479`, `#D6A77E` at stops 0, 0.88, 1: mauve into a warm gold corner), `radius.lg`
20, padding 24, gap 12, a shadow `#6E4A59` at 0.3 opacity, radius 16, offset y 8. Title "DoubleDone Premium" in
`type.heading` white, sub-line 14/20 white, a "›" cue in 18pt bold white. The same gradient fills the `PremiumButton`
on Chart a course and Reflect on this week. It was on Today once, as the "Plan my order" button, until the constant
frame retired it on 25 July 2026, and it has not been back.

### 5. `PrimaryButton`

`accent` fill, `radius.md` 14, padding 16 vertical by 24 horizontal, label `bodyStrong` 17/23 in `onAccent`, pressed
0.7, disabled 0.5. `onAccent` is white in light mode on six of the seven themes, and dark ink on Honey light (#2B2720)
and on every dark palette (Dusk dark #2B2722). Labels always read `onAccent`, never a hardcoded white.

### 6. The Help card in Settings (the feedback form today)

Settings is plain paper (`bg`, no sky). Cards are `surface`, `border.hair` in `line`, `radius.lg` 20, padding 2
vertical by 18 horizontal (Quiet: no fill, no border, paddingHorizontal 4). Card order: Comfort, Look, AI, Access &
data, the Premium gradient card, then **Help, the last card**: a feedback slot, a divider, then "See the welcome again".
Under Help only the footnote ("Saved to this device. Nothing here leaves it.") and the version line remain.

- **Closed:** a row "Send feedback" with "›" (16/22 Atkinson `ink`, minHeight 52).
- **Open:** a multiline field (minHeight 96, hairline `line`, `radius.md`, padding 12, 16pt `ink` on `surface`),
  placeholder "What is working, what is not, what you wish it did…", spoken "Your feedback". Under it a row, right
  aligned, gap 24: "Cancel" (15pt `inkSoft`) and a `PrimaryButton` "Send" (dimmed until there is text; "Sending…"
  while it goes).
- **Error:** "Could not send just now. Please try again." (13pt `accentText`) between the field and the buttons.
- **Sent:** the slot becomes one line, "Thank you. It is on its way." (15pt `fonts.bodyBold` in `doneText`).
- No motion anywhere. Nothing autofocuses. The draft lives in memory only, so leaving Settings loses it.
- **It already breaks the keyboard rule.** With Help the last card and nothing below it but two short lines, the
  phone keyboard covers the field and Send on Android, and iOS does not adjust either.
- Today the note travels with no identity at all: no account, no email, no reply address.
- On the same screen, three lines describe the AI. The AI card's status: "On. Break it down, Sort for me, and the
  keepsake scrapbook use AI, sending the text you choose to Claude to do its work." Its consent card: "Turning on AI
  sends the text you choose, a task to break down, a day to sort, to Anthropic's Claude to do its work. Nothing else
  goes to an AI." And the footnote above. All three become untrue once a note can go to Claude (G).

### 7. Premium during the existing card-free month

The app already has a card-free free month (once per account, "Try Premium free for a month" on web and iPhone,
"Start a free month of Premium" on Android). While it runs, the Premium screen's entitled panel shows:
- Head (24pt Newsreader, 400 on the web and 600 on phones): "Your free month ✓".
- Body (16/24 `inkSoft`): "Everything is unlocked: Scan, Pin, the colour themes, Chart a course, Plan my day, Your
  patterns, energy matching without limits, and 1 weekly scrapbook, more the longer you stay. Thank you for keeping
  DoubleDone independent."
- Status (15/22 `inkSoft`), web and iPhone: "Free until {date}, then back to the free monthly scrapbook. No charge,
  ever, unless you choose to keep it." Android: "Free until {date}, then the extras switch off on their own. Your
  tasks and everything else stay as they are. Nothing to cancel, no charge, ever."
- Foot (13/20 `inkSoft`): "The free monthly scrapbook is always yours."
- Web only: a Monthly / Annual toggle ("Monthly", "Annual · save 17%"), a price line ("A$5 / month. Cancel anytime.
  No ads, ever." or "A$50 / year, about two months free. Cancel anytime.") and a `PrimaryButton` "Go Premium to keep
  it", with spoken labels that name the dollar price. iPhone and Android: no control.
- Dates are written absolutely by the device's own date format ("24 Nov 2026", "Nov 24, 2026", "24. Nov. 2026").
- **Nowhere else in the app** (Today, Menu, Settings) shows that a month is running or when it ends, and **nothing
  marks its end at all.** The Settings Premium card reads "Active. Every extra is yours." for a free month and a paid
  one alike.

## What to design

Every state in light and dark, Standard and Quiet, at default and Large text, and in German for the longest strings.
Show at least one non-Dusk palette for the Today card: Honey, the one theme whose `onAccent` is dark ink in light mode
too.

**A. The Today card.** The loudest thing in the app that does not interrupt. You may reach for the Premium gradient
(item 4), which would bring it back to Today for the first time since July, or argue for something else. It must:
- sit in the flow at the top of the open day (where What's New sits, or above the heading where re-entry sits: your
  call, say why), never float, never cover a task, never dim the screen;
- keep the first task row fully visible at 390x844, Large text, German, so give it a maximum height;
- read in one glance: what you give (a note to Melroy), what you get (a month of Premium, on us), and that it ends by
  itself;
- carry two actions: one that opens the note (B), and "Not now", which retires the card (see the table);
- have no countdown, no "limited time", no "only today", no badge, no number of days, no confetti;
- have a proper spoken label: the whole card read as one sentence, and buttons that say what they do ("Not now,
  hide this offer");
- hold up in Quiet, where cards lose their fill. Decide whether this one keeps a fill in Quiet (re-entry never had a
  Quiet branch) and say why;
- have a motion design if it has one, with reduced motion as a designed state (a 90ms dissolve, nothing moves).

**B. The note.** Where does the card's button take you: the Settings form scrolled open, a new screen of its own, or an
in-place expansion of the card (exempt from the first-task rule, since the person chose to open it)? Choose and say
why. Constraints you must design around:
- **The keyboard rule.** On this stack nothing lifts bottom-anchored UI above the keyboard: Android is edge-to-edge
  and ignores resize, and the web relies on one viewport setting. An earlier panel that auto-focused its field popped
  the keyboard over its own buttons and buried them, and the Settings form is buried today. So: no bottom sheet that
  holds a focused field, and wherever the note lives, **the whole block from the field down to Send, the Claude line
  included, must sit above the keyboard**, or the layout puts the line and Send above or beside the field. Show a
  keyboard-up frame on Android and on iPhone for each surface the note appears on.
- The field, Send and Cancel, as today, plus a placeholder that helps someone who does not know what to say, and the
  floor's helper ("A sentence or two is plenty") while a month is on offer.
- **The lines above Send, by state.** Always visible before Send, in the app's existing egress style (12 to 14pt
  `inkSoft`, like "Your open tasks go to Claude to pick one. Nothing is added or changed."), never behind a tap,
  because sending is the permission:

  | State | Line |
  |---|---|
  | Signed in, a month on offer, AI on | "Claude, Anthropic's AI, reads it once to check it's a real note, then it goes to Melroy." |
  | Signed in, a month on offer, AI off | "It goes straight to Melroy." |
  | Signed in, no month on offer | "It goes straight to Melroy." |
  | Signed out | "It goes straight to Melroy." plus the offer line (next point) |

- **Signed out:** an offer line that a month is on us once you sign in, that an account also syncs your tasks, and a
  "Sign in" action. Send still works without it. Back from sign-in, the words are restored and the lines follow the
  table. If the account cannot get a month, the offer line becomes "Notes are always welcome." before Send. Show the
  return frame for each outcome: can get a month, cannot, already paying. The sign-in screen's own success line says
  "Taking you back to today." whatever screen it returns to, so give it a line for this context.
- Sending: the field locks, Send reads "Sending…".

**C. The outcomes,** in the note and in the Settings Help card alike. Each replaces the form with a short, warm
result. None celebrates loudly (no bloom, no confetti), and **C2 must look identical whatever the reason**:
- **C1, a month given:** for example "Thank you. Premium is on until 24 Nov 2026. It ends by itself, nothing to
  cancel." Premium is live the moment this shows. Optionally one quiet way to see what unlocked.
- **C2, sent with no month:** "Sent, thank you." For a note the check stopped (in practice only spam, because of the
  floor), and for anyone the offer was never shown to. Never reached by someone who saw an offer and wrote a real
  note.
- **C3, error:** the note is kept, and a calm try-again.

**D. Premium while the given month runs.** It is a new entitlement status of its own, not "trial" and not "comp".
- The entitled panel's head, status line and foot. Draft head: "A month on us ✓". It must say when it ends and that it
  ends by itself.
- **The control:** on the web, an offer to keep Premium whose billing starts only when the given month ends (nothing
  is taken away early), with the price line the Premium screen always shows on the web. On iPhone and Android, no
  control, and on Android never a price.
- Decide whether anything outside the Premium screen (the Settings Premium card, the Menu's Premium row) shows that the
  month is running, and if so, how quietly.

**E. The end.** One calm line, shown once per device, triggered as item 7 says. Where (the Today card slot under the
same one-card rule, the affirmation note, the Premium screen) is your call. Draft: "Your free month has ended.
Everything you made stays." It must not upsell in the same breath, never say "expired", and never sound like something
was taken away. It is the first end-of-month message the app has ever had, so it should work for the card-free month
too, and fire only when Premium actually goes off.

**F. Phase 2, someone already paying.** C1's siblings, by state:
- Renewing: "Thank you. You're already Premium, so your next payment moves to {date}." On iPhone Apple also emails its
  own confirmation, so the line promises nothing beyond the date.
- Set to cancel at the period end (no next payment): "Thank you. Premium now runs until {date}."
- A payment being retried: C2. Nothing moves until it clears.

**G. Settings.** The quiet line with "Send feedback" while a month is on offer (draft: "A note to Melroy, and a month
of Premium is on us"), the plain row when not, the Help card in each outcome state, and the three AI lines from item 6
rewritten so they stay true: the status and consent lines name the note check, and the footnote claims nothing about
leaving the device (for example "Your settings are saved to this device."). The privacy-policy line about Claude
reading notes is Melroy's to approve, separately.

**H. Pending Melroy's call: a way to offer a call.** The note arrives anonymous, so Melroy cannot reply. If he chooses
it, C1 and C2 carry one optional line, "Want to talk for 20 minutes? Pick a time", linking to his own booking page
outside the app, so the app collects nothing. Design it so it can be left out cleanly.

## Copy rules

- No em dashes, minimal semicolons, plain words.
- **The offer is a thank-you, never a wage.** "Real" and "earn" never appear on the Today card, the Settings line or
  the offer line. Only the Claude line says "a real note", and it names a check for a real note, never a good one.
  Draft card line: "Tell Melroy how it's going, and a month of Premium is on us."
- Never "trial" for this month (it is a thank-you, not a trial), never "expired", "unlock now", "claim", "limited",
  "hurry", "reward" or "points". No "if your feedback qualifies", no "useful feedback only", no "we'll check it" in
  the offer.
- Never a price figure on the card, in the note, in the outcomes or in E. D on the web shows the existing price line,
  as the Premium screen always does. On Android, never a price, and never "Try Premium free" (Google's own example of a
  violation). "A month of Premium" and "a month on us" are fine on every platform.
- Never "review", "rating", "stars", "rate us" or a store name.
- **Every end date is an absolute date from the device's date format** (the existing period label), never "in 3 weeks",
  "30 days left" or any counted number of days. A relative phrase would be the countdown this feature bans, and the
  APIs for it crash on Android's JavaScript engine.
- The voice is the app's: warm, brief, first names allowed ("it goes to Melroy"). German and French run about a third
  longer than English, so leave room.
- Five languages. Write the English. In the README, mark which platforms each string shows on, and put every string of
  this feature in one key group so a test can read it in all five catalogues and fail on a price, a trial word, a
  review or store word, or an urgency word. D's Android lines go through the existing Play-safe copy route.

## What it is NOT

- Not a modal, a pop-up, an overlay, a sheet over Today or anything that blocks the day.
- Not a contest, a leaderboard, a streak, a points system or a progress bar.
- Not a survey with questions or a star scale. One free-text note.
- Not a review prompt, and never in the same stretch as one (item 5).
- Not a new setting or a toggle. The offer has no "remind me later".
- Not a referral scheme or anything that asks for someone else's details.
- Not a way to collect an email. Email is only ever used to sign in.
- Not a source of testimonials. No note is ever quoted, and nothing asks to quote one.

## The iron rules a build will be checked against

1. Today is never interrupted: the card is in the flow, and at 390x844, Large text, German, the first task row is
   fully visible with the resting card showing.
2. No offer surface shows unless the server says this account can get a month now, after a successful read.
3. The card follows the table: once, a week after first open, never beside or straight after another one-time card,
   retired by Not now or any send from it.
4. C2 is pixel-identical whatever the reason, and nobody who saw an offer and wrote a real note ever reaches it.
5. No price (outside D on the web), review, rating, store, trial or urgency word anywhere in the feature, in any
   language, enforced by a test.
6. The line above Send matches the state table, Claude is named before Send whenever a note will go to it, and nothing
   goes to Claude when AI is off or no month is on offer.
7. The whole block from the field to Send sits above the keyboard on Android, iPhone and the web.
8. The draft survives leaving for sign-in and coming back.
9. The end line fires once, only when a good read shows the month's end has passed.
10. Every state works in Quiet, dark, Large text and German, and every control has a spoken label that says what it
    does.
11. Reduced motion is a designed state.

## What to hand back

A zip with: the frames for A to H in the variants above, a README that is the build spec (every size in the tokens
above, every string in English with its platforms, every spoken label, every state and what moves between them, and
the keyboard-up frames), and a short note on any decided item above you would push back on, with the reason. If a
choice needs a new token or a new component, name it and say why the existing ones do not do the job.

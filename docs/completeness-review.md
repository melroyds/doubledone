# DoubleDone: completeness review

*An audit of what the product should surface, sell, or explain but does not. Every gap below was confirmed against the code, not the spec. This is a "does the product communicate itself" review, not a "is the copy nice" review.*

---

## The read

The product is built. The build is good. What is missing is everything that connects a person to the build.

DoubleDone has a near-complete feature set sitting behind a discovery layer that barely exists. The single biggest theme across every gap, by a wide margin, is this: **the things that make DoubleDone DoubleDone are the things a user is least likely to find.** The never-shame spine, the founder-market fit, the ADHD-seam tools (Make-it-tiny, Break-it-down, Pin, Combine, Low day, Routines), the Lookback payoff, the reminder that fights the week-three cliff. All built, all real, all hidden behind an unlabelled "Menu" pill, an unexplained long-press, a footer link, or nothing at all.

For an audience defined by demand-avoidance and a refusal to fish for invisible gestures, hidden affordances are not a polish problem. They are a "the feature does not exist" problem. And for a product now taking real Stripe money, a mute front door (no landing page, no positioning, no meta description) means the funnel leaks before it starts.

The good news: almost none of this needs new features. It needs the product to say what it already is.

---

## Top 3 highest-leverage gaps

These three move activation, retention, and conversion respectively. Fix these first.

1. **The long-press is the only door to half the product, and nothing teaches it.** Break-it-down, Make-it-tiny, Pin, Combine, Remind-me, Move-to, Mark-as-a-lot, bulk actions: every one of them lives behind a hold gesture on a task row that has no caret, no hint, no coachmark, and no onboarding mention. An ADHD user staring at a dreaded task they typed themselves has no discoverable way to reach the one tool built to rescue them. This is the activation killer. (Discoverability + Orientation, several confirmed gaps collapse to this.)

2. **The web front door says nothing.** `doubledone.app` has a bare `<title>`, zero meta description, zero Open Graph or Twitter tags, and no landing page. Every share, every interview link, every search result, every social unfurl renders title-only. A prospective user or a hiring PM who pastes the link gets a blank app shell that boots into a skippable onboarding. For a commercialising product the top of the funnel is silent. This is the conversion-and-credibility killer.

3. **Nowhere user-facing names the audience or the never-shame promise.** ADHD, autism, AuDHD, OCD, "nothing is ever overdue," "what you finish, you keep": the entire differentiation lives in the spec and code comments and appears in ZERO rendered copy. A first-time visitor cannot tell DoubleDone apart from any minimalist to-do app at the exact moment they decide whether to trust it. The product enacts founder-market fit everywhere and states it nowhere. This is the positioning killer.

---

## Gaps by surface

### Onboarding (welcome.tsx)

Onboarding deliberately follows "curate, don't catalogue" and defers most features to in-context discovery. That instinct is right. The problem is that for several features, no in-context teacher exists, so deferral becomes silence.

- **Combine is advertised with no path to it.** Onboarding says "A few tasks that go together? You can combine them" but never says how (hold to select, pick two, tap Combine). Telling a detail-sensitive audience a feature exists then hiding the route reads as the app being unreliable. **Fix:** make the teaser actionable ("Hold two tasks that go together to combine them") or drop it until the hold is taught. Best paired with fixing the long-press gap. **Tier 2.**

- **Off-plan logging ("+ I also did that") is the direct answer to "my brain says I did nothing," and onboarding never mentions it.** The "keep" step sells the Lookback hard but only ever speaks of completing listed tasks. **Fix:** one line in the keep step: "Did something that was never on your list? Log it too, it still counts." **Tier 2.**

- **Routines and Repeating, the audience-fit pillars, are absent from onboarding entirely** and live only behind the "Menu" pill. **Fix:** one handoff line ("Routines and repeating tasks live in the Menu, top right") or a first-visit hint after a user first creates a Daily/Weekly task. **Tier 2.**

### Positioning / the sell

This is where the product is most undersold relative to how good it is.

- **No web landing page, no positioning metadata.** (Top-3 gap #2.) **Fix:** add `<meta name="description">` + OG + Twitter tags via an Expo `+html.tsx` (the dist file is a build artifact, do not edit it directly), using the one-line spine. Then add a real crawlable landing surface for first-touch visitors that states the spine, the loop, the never-shame promise, the audience, and one Begin CTA, the same way `privacy.html` is a static crawlable page. **Tier 1.**

- **The audience and never-shame promise appear in no user-facing copy.** (Top-3 gap #3.) **Fix:** one explicit line where a deciding user sees it (the welcome opener and/or the landing page): name that DoubleDone is built for ADHD, autism, AuDHD and OCD, and state the promise plainly ("Nothing is ever overdue. Nothing here will ever shame you for a task existing"). It is already the truth of the product. Say it. **Tier 1.**

- **A willing buyer has almost no path to the Premium offer.** After the one-shot welcome step, the only persistent door is a card pinned to the very bottom of Settings. The Menu has no Premium entry; Today has no Premium link. Conversion leans on accidental gate-bumps rather than on a motivated buyer being able to find the offer. **Fix:** add a calm, persistent Premium entry to the Menu (RoomsSheet), keeping the never-hard-sell posture. Make the offer discoverable to someone actively looking, not only trippable by accident. **Tier 2.**

### Empty & first-run states

- **The Lookback, the emotional payoff, opens to a triple-empty on a fresh account.** Default-selected day is today (empty), so a new user sees an empty calendar, "A quiet month so far," AND "Nothing logged this day" stacked together. The one warm "your weeks will gather here" line is locked inside the premium card, below the fold, exactly where a free first-run user never sees it. The feature built to fight "you did nothing" delivers that message on first look. **Fix:** a dedicated first-run state when the day map is entirely empty, one warm line in place of the stacked empties: "This is where everything you finish will gather. Nothing yet, and that's a fine place to start." **Tier 1.**

- **Onboarding sells the Lookback as the reason to return, then never says how to reach it.** It lives behind the three-dot "Menu" pill, which nothing in first-run connects to the promised payoff. A feature the user cannot find is, for retention, a feature that does not exist. **Fix:** a one-time dismissible pointer at the Menu pill on the first Today ("Your Lookback, routines and more live here") or a handoff line naming where the Lookback is found. One-shot, never recurring. **Tier 2.**

- **Routines empty state explains what a routine is but offers no example to add.** A blank name-plus-steps form is the highest-effort first action in the app, for the audience least suited to a blank slate. **Fix:** a tappable starter ("Try a Morning routine" prefilling sensible steps, editable before save). One example beats a paragraph for a task-initiation audience. **Tier 3.**

- **Routines never explains that ticks reset daily with no streak.** This stateless, no-history design is a core differentiator, but it is the opposite of how every other checklist app behaves. A user who ticks a routine and finds it fresh tomorrow may read it as a bug or data loss. **Fix:** one line at the empty state or first routine: "Tick what you do today. Tomorrow it starts fresh, no streaks to keep." Turns a confusing reset into an on-brand promise. **Tier 3.**

### Errors & edges

This cluster matters disproportionately because the failures all land on the exact moments this audience is most fragile: a denied permission, a paid-but-not-active screen, a flaky connection, a rejected sign-in code.

- **The daily reminder toggle silently springs back to Off when permission is denied or unsupported.** No explanation, no "blocked, re-enable here," no "this browser can't do it." A user who taps On, sees it flip back, and gets nothing concludes the feature is broken or that they failed. For an RSD audience an unexplained refusal reads as the app rejecting them, and they will not try again. The lib already knows the three distinct cases (denied, unsupported, fetch-failed) and collapses them into one bare `false`. **Fix:** return a small reason enum instead of a boolean, and show one calm line per case. **Tier 1** (this guards the one feature that fights the retention cliff).

- **After a successful payment, a lagging Stripe webhook strands the user on "Setting up your Premium" forever.** The success poll stops after ~20 seconds with no state change, no "taking longer than usual," no Refresh, no contact path. This is the single worst place to dead-end: a user who just paid real money, manufacturing the exact "did my money disappear" panic this audience is most sensitive to. **Fix:** on poll exhaustion set a flag that swaps copy to "This is taking longer than usual. Your payment went through, give it a minute, then tap Refresh," with a Refresh button and a feedback link. **Tier 1.**

- **There is no offline awareness anywhere.** Every AI feature shows the same generic "Could not X, try again" whether the cause is the model, a 500, a rate limit, or no internet. On a flaky connection a user taps Break-it-down, waits, gets "try again," taps again, with no signal that retrying is futile until they reconnect. That loop is precisely the friction-into-overwhelm spiral the product exists to prevent. **Fix:** detect offline (`navigator.onLine` on web, NetInfo on native) and swap the retry copy when offline: "You seem to be offline. This needs a connection, your tasks are safe here meanwhile." One shared helper across all the AI seams. **Tier 2.**

- **A signed-in sync failure shows "Synced to <email>" anyway.** Any non-account-gone failure (network, RLS, 5xx, expired token) is a swallowed `track('sync.failed')`, while the footer keeps affirming "Synced." A user signs in specifically to get tasks on another device, believes they are synced, switches devices, and discovers loss later. This is an affirmative false promise, not just a missing message. **Fix:** track the last-sync result in state; on a non-account-gone failure show "Saved on this device, couldn't reach your account just now, it'll catch up" instead of an unqualified "Synced." **Tier 2.**

- **Sign-in OTP collapses every send failure into "Check the address and try again."** Supabase rate-limits sends per address, but the rate-limit case is discarded with the rest, so a user whose email was fine is told to suspect their (correct) address. The code step also has no Resend control and no cooldown timer. **Fix:** inspect the error for 429/rate-limit and show "Just sent one, give it a minute." Add a Resend link on the code step with a short disabled cooldown. **Tier 2.**

- **"Copy my token" (MCP) does nothing when the session token is null.** The token refreshes ~hourly and the footnote tells users to re-copy when their agent stops connecting, so the expired case is the common one, and the button dead-ends there with no copy, no error, no "sign in again." **Fix:** on the null-token path show "Your session expired. Sign in again to get a fresh token" with a link to /sign-in. **Tier 3** (small audience, but a true dead-end at the expected moment).

### Feature discoverability

Most of these collapse into the long-press problem. Listed once, deduped.

- **The hold gesture is the sole entry to the entire multi-task toolbar plus per-task Pin / Remind / Make-it-tiny / Break-it-down / Combine, and nothing teaches it.** (Top-3 gap #1.) The only on-screen hint, "Tap tasks to select," renders AFTER the bar is already open, so it cannot teach the gesture that opens it. A user can run the app for weeks and never know Pin, Combine, or Remind exist. **Fix:** a one-time dismissible coachmark on first Today render ("Hold a task for more: pin it, set a reminder, combine, make it tiny"), keyed off a `doubledone.hold.hint.v1` flag. Cheapest alternative: a persistent faint helper line under the list. Either removes the accidental-discovery dependency without adding a setting. **Tier 1.** Note: the explicit "Select" button was deliberately removed in favour of the gesture; consider restoring a small always-visible "Select" affordance so the toolbar has a door that does not depend on knowing the hold.

- **The daily reminder is offered only as a faint footer link and a Settings pill, with no in-context prompt at the moment it matters.** It is the named lever against the week-three retention cliff and among the least surfaced controls. **Fix:** offer it once at a natural moment, ideally just after the first Close-the-day ("Want one gentle nudge a day to come back?"), gated by a one-time flag, so it surfaces when its value is concrete. **Tier 2.**

- **Low-capacity day is hidden on exactly the low-energy days it exists to serve.** Its only control lives inside the weight gauge, which renders only when there are open one-off tasks. On a calm, all-done, or recurring-only day it never shows, and onboarding never mentions it. **Fix:** surface it independently of the gauge (a small persistent affordance near the date header) or name it once in onboarding's honouring-the-day framing. **Tier 2.**

- **Cross-device sync is framed as a privacy caveat, not an available feature.** Surfaced only as a footer link and an onboarding line ("Nothing leaves your device unless you choose to sync"). A user is never clearly told they CAN sign in to keep tasks across phone and web, nor what they gain, and signed-out Settings offers no sync invitation at all. **Fix:** a brief positive sync mention in onboarding's handoff or keep step ("Want it on your phone and your laptop? Sign in to sync, always optional"), keeping the privacy reassurance. **Tier 3.**

- **Slices (manual "track it in steps") is bound to a transient capture-time condition, never taught, and unreachable after a task is created.** A useful manual-decomposition aid that overlaps confusingly with AI Break-it-down. Two un-disclosed decomposition paths dilute each other. **Fix:** decide whether to teach it or fold it into Break-it-down. If kept, make the capture hint unmissable. **Tier 3.**

### Orientation (within a screen)

- **Sliced rows have no visible undo.** The accessibility label says "tap to advance, hold to adjust," but the visible row shows only a check, title, "n/N," and a progress bar. A user who taps one slice too far is stranded, the "Undo a step" control sits behind an unsignalled long-press. The screen-reader user is told; the sighted user is not, an inversion of the usual accessibility gap, and a real distress point for an accuracy-fixated OCD-leaning user. **Fix:** a small visible "hold to adjust" cue or a subtle persistent "−" on the sliced row, restoring parity with the spoken hint. **Tier 3.**

- **The scrapbook's free monthly cap is sprung, not stated.** Tapping "Make a scrapbook" bounces a free user who already made one this month to /premium, discovered only after the tap, at the emotional-payoff moment where a paywall ambush stings most. **Fix:** state the free cadence up front on the invite card ("Your free keepsake for this month"), so the gate is expected, not sprung. **Tier 3.**

---

## What this audit caught that a copy-quality audit could not

A copy review reads what is on the screen and asks whether it is warm, clear, and on-brand. By that test DoubleDone scores well: every line that exists is calm and never-shame.

This audit asked a different question, and it is the one that actually moves the numbers: **is the thing that should be on the screen on the screen at all.** Almost everything here is an absence, not a defect. A copy pass cannot flag the meta description that was never written, the landing page that does not exist, the long-press that has no hint, the audience statement that lives only in a code comment, the first-run Lookback state that was never built, the reminder-denied branch that renders nothing, the "still setting up" screen with no escape. Each individual line in the app is fine. The product as a communicating system has holes, and holes are invisible to a reviewer who only grades the words that made it in.

The pattern underneath all of it: DoubleDone consistently *enacts* its principles (no streaks, gentle copy, never-shame mechanics) and consistently *fails to state* them. Enacting is necessary. For activation, retention, and conversion, it is not sufficient. The cheapest, highest-leverage work left on this product is not new features. It is making the product say, out loud and where people actually look, what it already quietly is.

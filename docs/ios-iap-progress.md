# iOS In-App Purchase, where we are

*Live progress note so nobody has to remember the state. Started 2026-07-15.*

## Decisions locked
- **Ship Apple IAP from iOS v1** (not the hide-everything path). Melroy: "15% of 0 is 0, I want a path to convert iOS users."
- **Parity pricing** on iOS (absorb Apple's 15%): monthly ~A$4.99, annual ~A$49.99, matching the Stripe price.
- **Sign in at the point of purchase** (not before), so the entitlement follows the user across web/Android/iOS. Everything else stays anonymous-first.
- Architecture (RevenueCat Path C): RevenueCat is **iOS StoreKit plumbing only**. Stripe stays the source of truth. A RevenueCat webhook writes Apple purchases into the existing D1 `entitlements` table. App User ID = Supabase user id.

## Done
- **Apple:** Paid Apps agreement, tax (ABN + GST + W-8BEN), banking, all Active. Small Business Program enrolled (15%), awaiting approval (blocks nothing).
- **App Store Connect subscription products created:** `app.doubledone.premium.monthly` and `app.doubledone.premium.annual`. Promo image done (docs/doubledone-premium-1024.png).
- **RevenueCat: FULLY SET UP (2026-07-15).** Project `DoubleDone`; iOS app (bundle `app.doubledone`); App Store connected (In-App Purchase key + App Store Connect API key + vendor number `94342932`); entitlement **`premium`**; both products (`app.doubledone.premium.monthly` / `.annual`, showing "Missing Metadata" which is normal until App Store review, both attached to `premium`); offering **`default`** ("DoubleDone Premium") with a `$rc_monthly` package -> Premium Monthly and a `$rc_annual` package -> Premium Annual, set current.
- **RevenueCat iOS SDK key captured** in `.env` as `EXPO_PUBLIC_RC_IOS_KEY` (the public `appl_…` key; placeholder in `.env.example`).

## Melroy's dashboard tasks: ALL DONE. From here it is code (Claude).

## RESOLVED 2026-07-17 (branch `held-state`, awaiting Melroy's device pass): long-press flipped the whole screen (iOS, 2026-07-15)

**The fix that shipped: A+.** One in-place held card, both appearances, carrying every single-task action (Remind me / Steps / Move to… now wired to the row's own id, which is what made plain "A" a regression). Grouped into four lines (when / size / weight / terminal-under-a-hairline) so 11 controls read as four chunks; measured at 375px, no line wraps. The select bar is demoted to genuinely-bulk (Done / Move to… / A lot / Combine / Remove). The jump dies at the root: a hold no longer changes modes, so the day-action blocks never unmount and the page never shortens. Full reasoning in `decision-log.md` (2026-07-17). The analysis below is KEPT deliberately: it is the record of why the obvious fix was the wrong one.

---

### The original analysis (kept: the wrong first diagnosis is the useful part)

**Symptom (Melroy, TestFlight):** "tapping and holding just forces the screen to the top... it seems very forced." Scroll down, long-press a task, the page jumps back to the top.

**Diagnosis (not primarily a scroll bug).** `onRowLongPress` in `today.tsx` branches on appearance:
- **Quiet** -> `setConfirmingId(id)`: reveals that row's inline held actions *in place*. Calm, no mode change.
- **Standard** (what Melroy runs) -> `enterSelectWith(id)`: flips the ENTIRE screen into multi-select. Rows become checkboxes, the action bar appears, other furniture hides, so the content height changes and the ScrollView clamps back to the top. The jump is a symptom; the mode-hijack is the cause.

**CORRECTION (2026-07-17), the first analysis had this backwards.** I claimed the coachmark ("Hold a task for more: pin it, **set a reminder**, break it down, or make it tiny") described the QUIET held-state. It does not. `openNudge()` operates on `onlyTask`, so **"Remind me" exists ONLY in select mode**, as do **Steps** and **Move to...**. The Quiet held-state has none of the three. So the coachmark describes **Standard's select-bar-with-one-task**, accurately, and Standard's behaviour is by design, not a mistake. Melroy approved "A" on my wrong premise; it was implemented, caught, and reverted before it shipped. **Option A as originally written is a REGRESSION**: it would push setting a reminder, editing Steps, and Move-to from one gesture to two (hold -> Select more -> action).

**The jump's real mechanism (confirmed).** Entering select mode hides two blocks in `today.tsx`: the "+ I also did that" button (~line 1619) and the ENTIRE `dayActions` cluster (~line 1664: the heavy nudge, Lighten today, Plan my day, Close the day). On a short page (Melroy had 2 tasks) the content then becomes shorter than the viewport, so the ScrollView clamps its offset to 0. The jump is a side effect of content legitimately disappearing, so there is no honest "just restore the scroll offset" fix; the offset no longer exists.

**The deeper thing Melroy's instinct caught.** There are TWO models for acting on ONE task: Standard borrows the bulk multi-select UI for single-task work (full actions, whole-screen takeover), while Quiet has an in-place held-state (calm, but missing Remind me / Steps / Move to). That inconsistency IS the "very forced" feeling. The gesture is per-row; the response is whole-screen.

**Options, re-ranked.**
- **A+ (Claude's rec, but a DESIGN INCREMENT, not a patch): one in-place held-state for both appearances**, carrying every single-task action including Remind me / Steps / Move to, with select mode demoted to genuinely-bulk work (2+) reached via "Select more". Fixes the jump at the root, kills the two-models split, and finally makes one gesture mean one thing. The design problem to solve first: the held-state already shows 8 actions; adding 3 more inline is overwhelm, which the spine forbids. Needs a real layout answer (compact wrap, or a small sheet anchored to the row), not a flag flip.
- **B: stop the jump only.** Would mean not hiding those blocks (clutter, and they are wrong in select mode) or reserving their height with a spacer (a hack that leaves a gap). Does not touch the "forced" feeling.
- **C: leave it.** It is an annoyance, not breakage, and everything works.

**Status (superseded 2026-07-17): A+ was built.** Melroy: "I want a real fix. Do that." See the RESOLVED note at the top of this section.

## Left for Claude (the code)
- `react-native-purchases` SDK in the client; App User ID = Supabase id; iOS paywall showing the two products + a "sign in to restore" path for existing Stripe subscribers.
- Worker route: RevenueCat webhook -> write Apple-sourced Premium into the D1 `entitlements` table (reuse the Stripe entitlement path).
- Tap-and-hold text-selection bug: **fix applied 2026-07-15, native verification pending on a TestFlight build.** Reported on the NATIVE TestFlight app (I first mis-diagnosed it as web-only; corrected). The task title (`MarqueeText`) carries no `selectable` prop, so by the RN rulebook it shouldn't select on native, yet it did, root cause unpinned. Applied the documented lever both places: `client/src/global.css` app-wide `user-select: none` + `-webkit-touch-callout: none` (web/iOS-Safari, verified), AND `selectable={false}` + `userSelect: 'none'` on the row texts in `MarqueeText.tsx` + `TaskRow.tsx` (native). Native can only be confirmed on device: TestFlight build queued for Melroy to test tonight. If it persists, it's the device build-loop, narrow further.
- App Privacy labels, review notes (draft already written), and the demo-account/OTP-for-reviewers solve (Supabase test OTP, the one real unknown).
- Then a dev build for sandbox testing, screenshots, submit for review. **EAS build only on Melroy's explicit ask.**

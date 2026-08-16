# Ours: two-party completion and shared reminders

*Verbatim decision from the adversarial panel of 2026-08-09. Five lenses (steelman, never-shame /
RSD, domestic threat model, what the system can actually do, and the actual users), then three
attackers pointed at the emerging consensus, one of whose brief was that refusing Melroy's own
feature request on ethical grounds he did not ask for is paternalism. Kept whole, including the
section where it says the panel was wrong.*

---

# Ours: two-party completion and shared reminders

## The verdict

**Proposal 1, two-party completion: Tier 4. Skip, and write the category rule into §11 so it cannot come back wearing a different name.**

**Proposal 2, shared reminders: Tier 2 for the outcome, in the form that costs almost nothing (each person arms their own nudge on their own pulled copy). Tier 3 for a `remind_at` column on the shared row, deferred with a trigger. Tier 4 for anything coordinated server side.**

---

## Proposal 1, the refusal

**The single load-bearing reason:** every version of the gate that actually *works* has to be visible to the server, and server-visible per-party completion state on a list of exactly two people is `done_by` with a clock bolted on, which is the one decision §11 says cannot be walked back once the rows exist.

That sentence is narrower than the one the panel gave you, and deliberately so. The clever local-only construction is real: `shared_tasks.pending_since timestamptz`, a time and not a person, exactly the `done_at` precedent at `ours.sql:124`. First tick arms it, a second tick from any device closes it, and each device remembers locally whether it was the one that armed it. Nothing accumulates, a database dump reveals nothing, and it passes the letter of §4.

It dies on your own cross-device sync. Arm a task on your phone, open the laptop, and the laptop holds no memory of arming, so it renders "your turn". You tap. The gate closes with one human and zero agreement, silently, on an ordinary Tuesday. Make that bit survive the second device and you have synced it, and a synced record of which of two people confirmed is the banned column. There is no third option.

**The second reason, product rather than architecture:** a gate turns inaction into a veto. An un-tick requires an act. Withholding requires nothing at all. Asleep, driving, phone dead, busy and angry all produce the same output on your screen, indefinitely, with no clearing path that is not itself a setting. For a rejection-sensitive nervous system the ambiguity *is* the payload, and no copy fixes it because the payload is the silence.

**"They should have freedom to select" makes it worse, not safer.** It is a per-pairing setting on a shared object, the product's first, on a surface where `rename_pair` already lets either member change a shared property unilaterally and silently. Who flips it, who flips it back, what happens to rows already pending. Every answer is either decorative or a negotiation the demand-avoidant second seat cannot open. Against "remove friction, never add a setting", it is the most expensive setting the product could add.

### What the need actually was, and how it is served

Two needs are tangled in the ask, and they have different answers.

**(a) "Ticked does not always mean done."** That is a definition-of-done problem, and this app is already best in class at it. The answer is decomposition, breaking the thing into steps small enough that "done" is unambiguous, not a countersignature on an ambiguous one. If per-task demand ever shows up in the field, the honest shape is a property of the **work** ("this one needs both of us", set at creation, changing nothing about completion), never a verdict on the worker and never a pairing-level toggle. Backlog with a trigger, not a build.

**(b) "Things change under me and I do not know."** Already scheduled and already yours: Phase 5's dimmed "Recently removed" with Restore, naming nobody, plus §12's change dot with its own trigger. Leave the dot deferred. Do not promote it now on the strength of this conversation, because that is exactly how a deferred item quietly dies.

Note what the architecture already conceded and never replaced: the finality affirmations are withheld on Ours *because* your person can un-tick. That gap is the thing you are feeling. Phase 5 closes it without any new state.

---

## Proposal 2, what to build

### Tier 2, lands with Phase 4, near-zero new code

- **What is stored:** nothing new anywhere. The reminder lives on your **personal** copy of the pulled task, as `nudgeAt` + `nudgeId` (`tasks.ts:36`), which already exist, are local-only, and are absent from `sync.ts`'s row mapping. No column on `shared_tasks`. No `user_id` in `push_subs`. No D1 row. No cron change.
- **Where it is scheduled:** on your own device, through the shipped `scheduleNudge` (`reminders.ts:218`). Native only, which is what per-task nudges already are. Say that honestly on web rather than papering over it, because Ours ships web first and a nudge that quietly fails to arrive is worse than none.
- **How both people get reminded:** both pull the row, each sets their own time. Two taps instead of one, and every reminder is self-imposed on both sides.
- **When the other person does it first:** Phase 4 already says their tick tombstones your copy. That tombstone must route through `clearNudgeIfAny` (`today.tsx:559`) in the same action, or you get buzzed at 7pm about a job your person finished at 5. Same for a shared removal, and for freeze on leave. Put it in the Phase 4 checklist wording and in the E2E case in the same commit.
- **What it must never do:** never write anything to `shared_tasks`. Never render to your person that you set one (a synced "they have a reminder on this" flag would smuggle Proposal 1's ledger in through the back door). Never appear as "remind them". Never be offered on a row you have not pulled.

**The honest shortfall, because you should hear it from me and not discover it:** this does not deliver "set it once and we both get it". And the person who most needs the reminder is the person least likely to set it, which is precisely the executive-function failure the whole product exists to treat. That is the real cost of my pick.

### Tier 3, the shared column, deferred with a trigger

**Trigger:** a dogfooding household reports a real miss on a real time-bound shared row.

Then it is `remind_at timestamptz` on `shared_tasks`, a time and never a person, LWW like every other field, with both devices arming locally from a row they already hold. Three preconditions, all checkable, all currently unmet:

1. **`server_now()` must be shipped first.** It is still an unchecked box in Phase 3. Until it lands, `stamp_shared_task_origin` clamps `updated_at` to `now() + 1 day`, so one write stamped a day ahead wins every last-write-wins comparison for 24 hours. Against a tombstone that is irritating. Against an alarm it means the person being buzzed cannot turn it off for a day, and every clear they attempt silently loses. None of the five lenses caught this, and on its own it is enough to keep the column parked.
2. **`remind_at` joins `deleted_at`'s exemption from the future-clamp**, or a reminder set for next Tuesday silently fires tomorrow.
3. **It must never re-bake the notification.** A shared time can change from the other phone, so the client has to re-arm on merge, and a naive re-arm rebuilds the notification content from the *current* title. Set something benign, let the other phone arm, then edit the title, and your words fire on their lock screen at your chosen hour. A personal nudge has no such path because you own both the words and the time.

Plus: no reminders on shared recurring rows, and Phase 6 must not inherit one silently. A repeating buzz on someone else's schedule that you cannot stop without raising it with them is the chore-nag machine the laws exist to prevent. That guard is an intention. A column is a construction. This project's standard is impossibility by construction, which is a third reason the column waits for demand.

### Tier 4, server coordination

Not taste, arithmetic. The cron holds no user token, `service_role` is a hard never, `push_subs` holds no `user_id` on purpose, today's push is payloadless on purpose (`push.ts:115`), and there is no APNs key and no FCM data path, so a server-coordinated reminder would reach browsers only and silently not reach the phone anyone actually carries.

Your instinct was not naive. The custody machinery does exist in `mcp_grants`, AES-GCM in D1, no elevated key. But it was bought with an explicit connect flow, a consent screen and a disconnect kill switch, for access the user initiated. Putting it on a timer means the backend holds standing read access to every household's private task text, forever, in the one feature whose threat model is domestic. And it buys nothing: the row already syncs to both phones. **Sync is the coordination.**

---

## Where the panel was wrong

The refusal of Proposal 1 survives. Most of the reasoning offered for it does not, and you would have worked that out eventually.

1. **The impossibility proof was overstated.** Four lenses claimed any per-party state at N=2 is inherently a per-person record. That is false as written, and a construction exists that passes the letter of §4. The true claim is the narrower one above, and I would rather hand you a smaller true thing than a bigger false one.
2. **The inference argument proves too much.** "At two people you can subtract" applies just as well to `done` and `done_at`, which shipped. §4 was rewritten precisely to stop promising otherwise, and then four lenses reached back for the retired maximalist version to refuse a feature.
3. **The threat model was applied selectively.** Either person can already silently un-tick your completed work, which is a unilateral reversal of another adult's account of their own labour. A partner-authored 500-character title already renders on your surface. And §1's "no `pairs.name` column, free text on a shared object is how a name field becomes a message channel" was traded away in Phase 2 for a capped, reportable name, correctly. If all of that is acceptable, "coercion lever" cannot be the whole argument against a symmetric confirm.
4. **The second-seat rule was stretched.** Its three named examples (assign it, show me if it's done, tell me when they finish) are all asymmetric: one person gains over the other at no cost to themselves. Two-party completion is symmetric and self-binding, which is structurally the opposite shape. The rule still applies, but on the narrow ground that this is a partner request with no first-seat demand behind it, not because it belongs to that family.
5. **One lens ruled all field evidence inadmissible in advance.** Half right. Absence of complaint from a happy household is weak evidence. But "no evidence can move me" is not a position I will hand you, because it means you can never be told you were right.
6. **Nobody proposed asking the actual second seat.** Roughly eight thousand words theorising about her autonomy, and she is reachable tonight.

---

## What is genuinely uncertain, and what settles it

**1. Whether the need is definition-of-done or awareness-of-change.** Ask both households one behavioural question at the end of the fortnight, not a leading one: *"tell me about the last time something on the list changed and you did not expect it, and what you did next."*

- "It vanished and I did not know" means the change surface, already planned in Phase 5.
- "We disagreed about whether it was done" means decomposition.
- "I needed her to confirm before I could stop checking" means do not build it under any circumstances. That is a reassurance loop with a person installed as the metering valve, and "Done is done. Recorded." exists to close that loop, not to hand someone else the key to it.

**2. The carer pairing.** Four lenses named it as the best argument against themselves, and "Looking after someone" is a shipped preset. It does not reopen the gate, because that preset is chosen unilaterally by whoever creates the list and can be changed silently by either member through `rename_pair`, so a mode keyed to it would be a coercion primitive with a friendly name. If real carer demand appears it earns its own name, its own threat model, and a both-hands-required enable. Never a toggle sitting one tap away in every household.

**3. Whether a shared time reads as help or as being told.** One household, one fortnight, one word. That is the only thing that promotes the `remind_at` column.

**What would NOT move me:** the dogfood fortnight going pleasantly. For a feature in this shape, a happy household will use anything charmingly for two weeks. Unprompted demand is signal. "It was lovely" is noise.

---

## Fix this before either proposal gets another hour

"Either person can un-tick" is the safety valve both proposals were judged against, and on repeating rows it is not currently true.

`reconcile()` at `client/src/lib/ours-merge.ts:90` unions `completedDates` from both sides unconditionally, and `mergeShared` then pushes the **reconciled** row at line 66. So removing today's date locally is restored by the next merge, and the removal never reaches the server at all. Deterministic for one person on one device, not a two-phone race. `ours-merge.test.ts` has sixteen cases and none of them un-tick a completed date, because the file was reviewed for "can a tick be lost", where "no, never, by construction" is also the defect.

Two shipped promises rest on it: Phase 5's "done rows stop rendering at the day boundary, **so un-tick works all day**", and §5's decision to withhold the finality affirmations on Ours *because* your person can un-tick. Both are currently half true, and the bins and the meds are exactly the class of row a household most needs to correct.

The fix is not dropping the union, which would lose ticks. It is a grow-only removed-dates set applied after the union, later stamp winning. Design it before Phase 6, and add the test.

---

## Two concrete next moves

1. **Write the category rule into §11 and the standing rules**, in the doc's own voice: *no per-person completion state, pending or final, in any shape, including on a device*. One line, and mutual confirm, verify together, two-key done and sign-off all get refused in a sentence instead of another eighty-agent panel.
2. **Fix the `completedDates` un-tick, with its test**, before Phase 5 ships the promise that rests on it.

The reminder line goes in the Backlog with its trigger, not into the plan. You were right about the outcome on Proposal 2 and wrong about the mechanism, which is the cheap way round. On Proposal 1 the instinct was sound and the shape was not available, and that is worth knowing before Phase 6 rather than after.
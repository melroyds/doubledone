# The Ours review record

*The verbatim synthesis from the adversarial architecture review, 2026-08-09. Six lenses
(never-shame/RSD, security, data & sync, product spine, the two requesting couples, and
cost/growth/compliance), 81 findings raised, 62 confirmed by refute-by-default verification,
88 agents. Kept whole because it cites file and line evidence throughout and is the reasoning
behind every amendment in `shared-lists.md`. That doc is the decision; this is the argument.*

---

# Ours: the amendment list

I read the draft against the live repo. The bones are right and one decision in it is load-bearing and survives everything: **separate tables, never a `space_id` on `tasks`.** Keep that. One word changes, because `tasks` does gain a nullable column below: it should read "`tasks`' *policies* are not touched."

Everything else below is the correction list. Roughly 45 verified findings collapse to 18 amendments, 8 of which change the shape of v1.

Before any of it: **answer §9 Q4 first.** Both couples, one conversation each, one specific question: *"read me the last ten things that went on your shared list, and tell me which of them repeat."* If more than half repeat, amendment 6 is mandatory. If almost none do, amendment 6 shrinks to two columns and no UI. You are about to spend real hours on a shape that one phone call decides.

---

## 1. What must change shape

| # | The draft says | It becomes | Why |
|---|---|---|---|
| 1 | `shared_tasks` carries `done_by` | **`done_by` is deleted** | §4 rule 3 says a tally must be "impossible to compute in the UI". The product's own standard, set by Rhythms, is *"not just the UI"* (`product-spec.md:102`). At two people the column buys zero privacy anyway (if it wasn't me it was you), so it costs the ban and returns nothing. |
| 2 | Unpair copies every shared task into both accounts | **Unpair freezes the list. Zero rows move.** | The copy is the single largest defect generator in the doc: id collisions that permanently brick sync, double-copies across two devices, undated rows flooding Today, a hostile partner's payload made permanent, and a bereaved user's dead partner's words dumped into their morning. Freezing deletes all of it at once. |
| 3 | Pull to my Today "makes a personal copy" | **A copy that keeps a one-way link home** | A detached copy means the work gets done on the copy while the shared row stays open forever. Ours can then only grow, and both people do the same job. This is the feature failing at the one thing it exists for. |
| 4 | The door reads `Ours · 3 waiting` | **The door reads `Ours`** | A live count of undone work that a second person can raise, permanently, on the screen whose entire promise is that today is finite. §4 bans "Sam added 3 things" as a guilt bomb and then ships the same payload as furniture you cannot swipe away. It also inverts the app's own word: every "waiting" string in `en.ts` carries "They are safe." |
| 5 | Clients read `pair_invites` and write `pair_members` under membership RLS | **Two SECURITY DEFINER RPCs. `pair_invites` has zero policies.** | As drawn it does not run and is not safe. A joiner is not yet a member, so no membership policy can find their invite. The obvious fix (`with check (user_id = auth.uid())` on `pair_members`) lets any account insert itself into any pair, which makes the code decorative and unpair revocable by one POST. And a membership policy *on* `pair_members` is Postgres 42P17. |
| 6 | `shared_tasks` has no recurrence | **Two nullable columns now** | Household logistics is mostly repeating. Bins, meds, feeds. Both requesting couples hit this in week one. Columns are free today and a migration against live couples' rows later is not. |
| 7 | Sync "on open, foreground, focus, pull-to-refresh" | **Add a poll while the screen is visible, and reconcile after every write** | All four triggers are transitions. None fires while two people are looking at the list at the same time, which is the only mode two people in one house ever use it in. The doc's own supermarket example is the case it does not cover. |
| 8 | Tier 1 has no compliance work | **Tier 1 gains the UGC kit** | Two accounts seeing each other's free text puts you under Apple 1.2 and Play's UGC policy. You have none of report, block, or a kill path. You were already rejected twice in July. A third guideline rejection blocks the whole release, not just the feature. |

---

## 2. The amendments, in order

### Phase A: free now, expensive after the first row exists

**A1. Delete `done_by`. Keep `done_at`.**
`done_at` is a time, not a person, and both LWW and the Tier 3 shared Lookback need it. Nothing in Tier 1 reads `done_by`. Tier 2's "Sam just finished this" is derivable client-side at N=2 without storing anything.

**A2. Rewrite §4 rules 2 and 3 to promise only what is true.**
At two people you cannot hide who has not done something. Every state change you did not make was made by the only other person. Promising otherwise is worse than not promising, because the promise is what breaks. Replace with:

> - No assignment, ever.
> - No stored per-person record of completion, so nothing can be counted or compared later, now or in a future feature.
> - No notification that creates an obligation.
> - No number on Today that another person can change.

And change "impossible to compute in the UI" to **"impossible to compute, because the data does not exist"**, citing the Rhythms precedent so the bar is inherited rather than re-argued in a later sprint.

**A3. Lock the final schema.**

```
pairs         id uuid pk · created_at · closed_at · disabled_at
pair_members  pair_id → pairs(id) on delete cascade
              user_id → auth.users(id) on delete cascade
              label text · joined_at
              primary key (pair_id, user_id)
pair_invites  code_hash · pair_id → pairs(id) on delete cascade
              created_by → auth.users(id) on delete cascade
              created_label text · expires_at · used_at
shared_tasks  id text · pair_id → pairs(id) on delete cascade
              title text not null check (char_length(title) between 1 and 500)
              done · done_at · recurrence jsonb · completed_dates jsonb
              created_by → auth.users(id) on delete set null
              created_at · updated_at · deleted_at
              primary key (pair_id, id)
```

Four things in there are deliberate and each closes a finding:

- **`created_by` is SET NULL, never cascade.** Cascade means one person deleting their account silently guts the other's living list. No action means erasure fails outright with a 23503. Set null keeps the words and removes the name. `delete_account()` then needs **no change at all**.
- **`pairs.name` is gone.** Free text on a shared object with no stated editor and no stated render site is how a name field becomes a message channel on someone's home screen. §6 already gets the surface name from the localised catalog.
- **`title` is capped in the schema, not the app.** A direct PostgREST call walks around a client-side limit. Mirror `maxLength={500}` on the input so an honest user never meets the error.
- **PK is `(pair_id, id)`**, so a residual id collision can never cross two households. Free because the table is unbuilt.

Plus one trigger, which is smaller and more robust than putting the logic in `delete_account()`: **`after delete on pair_members`, delete the pair when no members remain.** It then holds for every exit path (leave, remove, account deletion, a future third person) rather than only the one RPC someone remembered to update.

**A4. Two RPCs, both hardened exactly like the live `delete_account()`.**

- `create_pair_invite()` generates the code **server-side** from `gen_random_bytes` over the ambiguity-free alphabet, stores the hash only, returns the plaintext once. The client is never trusted for the entropy.
- `join_pair(code)` does everything in one transaction. The load-bearing detail: verify-and-consume is a **single** `update ... where used_at is null and expires_at > now() returning pair_id`. Select-then-update reopens single-use as a race. Then: refuse if the caller is already in a pair, refuse if the pair holds two, insert the membership, return. Idempotent if the caller is already a member, so a lost response never reads as "this code has been used."

Rate limiting lives **inside** `join_pair`: per account, plus a global hourly ceiling. Delete "per IP" from §2. Postgres cannot see an IP, and the promise as written has no enforcer anywhere in the architecture.

Policies:
```sql
-- one definer helper, used by pairs, pair_members AND shared_tasks
is_pair_member(p uuid) -- security definer, stable, set search_path = ''
```
- `pair_invites`: RLS on, **zero policies**. No client ever touches it. Same shape as `ai_calls` today.
- `pair_members`: select and delete via the helper and `user_id = auth.uid()` respectively. **No insert policy. No update policy.** That absence is the security control, not the secrecy of the pair id.
- `shared_tasks`: `using (public.is_pair_member(pair_id) and (select closed_at is null and disabled_at is null from pairs where id = pair_id))` for writes.

**A5. Kill the email disclosure. Use self-chosen labels.**
`auth.users` is not client-readable, so showing the creator's email needs a definer RPC that is, by construction, an email oracle for anyone holding a guessed code. And a mis-texted code (which this audience will hit constantly) hands a stranger a real identity before they decide anything.

Instead: A types a short name for themselves when minting the code (`created_label`), B types theirs on joining, both land on `pair_members.label`. Two text columns, pair-scoped, dead on unpair. Not a profiles table.

Then **collapse the preview into the join**. There is no pre-join lookup, so there is nothing to probe and every attempt is stamped. After joining: *"You're now sharing with Sam. Not them? Leave."* And the creator's Ours screen carries *"Sam joined · That wasn't who I meant"*, one tap to unpair and mint a fresh code. That also closes the one-sided handshake: as drawn, the creator could never learn who was in their own list.

Write the invariant into §4 beside the never-shame laws, because it is the same class of promise: **no user's email, phone number or account identifier is ever rendered to another user, in any surface, ever.**

---

### Phase B: two fixes to shipped code, worth doing this week whether or not Ours ever ships

**B1. Add randomness to `makeId()`.** One line.
```ts
return `t-${Date.now().toString(36)}-${addCounter.toString(36)}${rand}`;
```
`addCounter` restarts at 1 every session, so two of your *current* subscribers' devices minting their first task of a session in the same millisecond already collide on a global primary key. Keeping the counter preserves the within-device guarantee your existing 500-unique test proves. Ids are opaque `text`, so no migration, no back-compat, nothing user-visible.

**B2. Narrow `isAccountGone()`.** Roughly six lines.
Its docstring states the premise honestly: *"The only foreign key on the `tasks` table is user_id -> auth.users."* That premise dies the day `shared_tasks` exists. Today the function reads **any** 23503 as "your account is gone", and `today.tsx` responds by clearing tasks, purging R2 keepsakes, wiping local data and signing out. A partner unpairing while your phone pushes a queued shared row would destroy your own history.

Require the constraint name, which Postgres puts in the message:
```ts
if (e.code !== '23503') return false;
return /tasks_user_id_fkey/.test(`${e.message ?? ''} ${e.details ?? ''}`);
```
The failure asymmetry points the right way. Worst case now is a deleted account's second device keeps local data, which `decision-log.md:816` already documents as a limit. Worst case today is a live user losing their keepsakes forever. Update the docstring, update `sync.test.ts:22`, and add the regression case that names the threat (a `shared_tasks_created_by_fkey` violation must return **false**).

---

### Phase C: build-time architecture

**C1. Link the pulled copy. One nullable column on `tasks`: `shared_id text`.**
Same shape and treatment as the existing `parent_id`. Apply it to live Supabase **before** the client that sends it ships, per the `skipped_dates` and `big` precedent, because `taskToRow` emits every field unconditionally.

Four rules, all of them decisions rather than mechanics:

1. **The copy gets a fresh `makeId()` and a fresh `createdAt`.** Never the shared id (global PK collision, permanent sync brick). Never the shared `createdAt`, because `celebrate.ts` narrates *"Four months since you first wrote it down"* and `reward.ts`'s `isBigWin` reads it. What lingered is how long it has been *yours*.
2. **Pull is idempotent per person.** A second pull focuses the existing copy.
3. **Your tick closes the shared row.** One hop, the shape `completeAncestors` already proves.
4. **Their tick tombstones your copy. It does not mark it done.** This is the one that matters. Marking it done puts work you did not do into your Lookback, and the Lookback is the emotional payoff of the entire product. Tombstoning keeps the credit honest and makes the day shorter because someone helped.
5. **A shared removal never propagates into Today.** Nothing is ever removed from your Today by another hand.

**C2. Unpair freezes. Delete "unpair keeps copies" from Tier 1.**
`pairs.closed_at`. Reads stay allowed, writes are denied, both sides at once, symmetric, one calm line, no name and no reason. The list stays openable and frozen, and you take things from it one at a time with the pull gesture Tier 1 already ships, when you can face it.

Then one separate action on a frozen list, **"Remove this list"**, which deletes your own membership row. The A3 trigger cleans up the pair when the second person does the same.

This is the amendment that pays for itself. It deletes: unpair idempotency across two devices, deterministic copy ids, the Today flood, the hostile-payload permanence, "copy only what you wrote", and the bereavement dump. Six findings, one decision.

Fix the copy too. Drop "costs nothing" from §1 and §4. **"Leaving is one tap, and nothing is lost."**

**C3. Give both people one clock.**
`decision-log.md:303` already flagged this: *"Fine for one user across devices; revisit only if shared lists ever land."* Shared lists landed and the doc did not revisit. The schema deliberately has no `now()` trigger because the client is authoritative, which is safe for one owner and unsafe the moment a second account writes the same row. A phone six minutes fast wins every conflict forever, invisibly.

Two pieces, both small, neither touching `mergeTasks`:

- **`withMonotonicStamps` on the shared write path.** Free. Widen its signature to `<T extends { id: string; updatedAt: number }>` (it only touches those two fields) and import it. Any change you make to a row you have *seen* then beats that row regardless of whose clock wrote it. That is most real cases.
- **`server_now()`, a stable SQL function, read once per sync.** `skew = serverNow + rtt/2 - Date.now()`, cached, applied at `nowMs()` in `tasks.ts`, which is already the single mint point for every timestamp in the app. Roughly fifteen lines, fails open to `skew = 0`. It fixes personal cross-device and MCP-Worker skew in the same stroke.

Then rewrite §3's "the proven pair". It should say what was proven and under what conditions: LWW and tombstones were proven **single-writer**. Two clocks is the one thing personal sync never had to survive, so we remove the second clock rather than trusting it.

**C4. Make Ours actually live while you are looking at it.**
- Reconcile after **every** Ours write, not just push. Covers the supermarket, because the person at risk of double-buying is the person ticking things.
- Poll at 15s while the Ours screen is focused **and** AppState is active. Clear on blur and background. Hard-stop after ten idle minutes, resume on touch.
- Filter on `updated_at` only. **Never** `deleted_at is null`, or removals never propagate and a deleted item resurrects on the other phone.
- **No live timestamp and no "updated just now".** A relative timestamp on a shared list is a checking surface for the OCD segment. Show nothing while healthy, and one calm tappable line only when the last successful refresh is older than about sixty seconds.
- **No row moves under a thumb.** An incoming change never reorders or removes a row that is under an active press. On this surface a mis-tap is a mistrust event.
- Correct §3's factual error: RN-web's `RefreshControl` discards `onRefresh`, so pull-to-refresh is native-only. On web the poll *is* the refresh.

**C5. Name the local store, and gate the render on it.**
One key, `doubledone.ours.v1`, holding `{ pairId, tasks[] }` rather than a bare array. The `pairId` inside is what makes a stale cache self-detecting. **Ours renders the cache only when its `pairId` matches a membership the current session has confirmed**, so a shared tablet cannot show flatmate A's household list to flatmate B even if a wipe path is ever missed. Add the key to `wipeLocalData` and to its regression test **in the same commit that creates it**, and write down the standing rule: a new AsyncStorage key holding user content is not done until it is in that list and in that test.

State the offline answer explicitly in §3: yes, Ours is cached, adds and ticks queue locally. Do not copy `scrapbook-sync`'s swallow-everything catch, or a permanently failing push silently loses the user's own offline work.

**C6. Recurrence: two columns now, UI gated on Q4.**
Add `recurrence jsonb` and `completed_dates jsonb`. Render with the existing pure engine unchanged (`tasksForToday` is already `<T extends Scheduled>`, so it takes a structural type, not a personal `Task`). Reuse `reconcileConflict`'s grow-only union of `completedDates` in the shared merge, so two people ticking the bins from two phones converges instead of one tick being clobbered.

Hard constraint: `completed_dates` stays an **unattributed set of dates**. No per-occurrence attribution, ever, or the model itself becomes the chore ledger A2 just outlawed.

If Q4 says the couples' lists repeat, expose two cadences in the Ours capture UI (every day, chosen weekdays). If it says they do not, ship the columns and no UI.

**C7. Give Ours a day boundary and a removal trace.**
- **Done rows leave at the day boundary.** Straight parity with `tasksForToday`: a ticked shared row shows for the rest of that day so un-tick works all day, then it stops rendering. One predicate. This kills the certain, mechanical half of "Ours can only grow" and it is the whole fix for the shopping-list flavour.
- **Tombstones younger than seven days render dimmed under "Recently removed", with Restore.** Restore is `deleted_at = null, updated_at = now`, which is verbatim the existing `restoreSeries`. Nobody is named, so A2 holds. This answers the ambiguity that "Done is done. Recorded." exists to kill: *did I imagine adding it, did it not sync, or did they delete it?* Zero cost on the happy path, because it does not render when empty.
- **Do not fire the finality affirmations on Ours.** No *"Filed. You can stop checking it now."*, no *"Done is done. Recorded."* Use the plainer set. The app should only promise finality on a surface where it controls finality, and on Ours your person can un-tick.

---

### Phase D: before the first store binary containing Ours

**Ship Ours to web first.** Cloudflare Pages auto-deploys from `main`, no store review exists there, and the two couples can live on it for a fortnight. That answers Q4 with behaviour rather than opinion and it de-risks a review cycle. The kit below must land before the first AAB or IPA carrying Ours, not before the web deploy.

**D1. Report.** One quiet row on the Ours screen and in the held card, routing to the existing `POST /feedback` Worker route with `context: 'ours'` and the pair id. No new endpoint, no new secret, no moderation queue. This is the item Play names as the floor and Apple's second 1.2 bullet.

**D2. Block, which you already have, named honestly.** Unpair is the block. Put "Leave this list" on the Ours screen itself, not only in Settings, so it is one tap from the moment of harm. Expire the pair's outstanding invites in the same statement, or a stale unexpired code is a live re-entry ticket for 24 hours after someone leaves. One line of copy, in the voice `mcpDisconnect` already uses: *"They won't be able to add to your list again. Joining again would need a new code from you."*

**D3. Kill path.** `pairs.disabled_at`, one clause in the RLS predicate. You flip it by hand in the Supabase dashboard on a valid report. No service-role key, no moderation code, and "timely response" becomes thirty seconds from your phone.

**D4. Privacy policy, both files, same commit.** `client/src/app/privacy.tsx` and `client/public/privacy.html` currently say tasks are *"stored in rows only you can read"*. That is the sentence Google fetches during review, and it goes false on ship day. `play-store-release.md` already names Data Safety mismatch as a rejection cause. Add a short "If you share a list" section covering five facts: your person can read and change anything on Ours and nobody else can; you see who added a task and never who has not done what; leaving freezes the list for both of you and destroys nothing; a shared task you pull onto your Today becomes yours, so the AI features work on it; deleting your account removes your name from what you wrote, not the words themselves. Bump "Last updated" in both. Add the matching clause to `deleteConfirmBody` in five locales, or the copy lies for a version.

**D5. Terms paragraph** defining objectionable content and prohibiting directing it at another person through a shared list, plus the statement that a reported pair can be disabled. Play requires the definition and the acceptance, not just the buttons. `terms.tsx:41`'s AI-abuse sentence is the template.

**D6. Store forms, answered honestly in the same session.** Play IARC: user interaction and shares-user-content both become Yes, and expect the rating to move off 3+. Apple age rating: UGC and messaging capability become Yes. No new Data Safety row is needed (the existing "Other user content" row covers it, and user-directed transfer is exempt from "Shared"), but annotate that row so the next audit does not re-litigate it. Two lines in the App Review notes pointing at Report and Block, the same converts-risk-into-credit move `ios-submission-prep.md` already uses for the AI disclosure.

---

### Phase E: copy and framing, all free

**E1. Say what Ours does not do, at the door.** On the pairing confirmation and on the empty Ours state: *this list never puts anything on your Today, it does not keep score, and nobody is ever marked as behind.* That is the asymmetric consent the invitee needs, delivered where it can still change a decision. The second seat is often a demand-avoidant partner being handed a productivity system by their spouse, and if they churn they churn from DoubleDone entirely.

**E2. Say what Ours is not: a delivery channel.** *"Ours is a place you both look. It will not tell them, so if it matters today, say it out loud too."* A shared list with no delivery guarantee is worse than none, because the sender stops using the reliable channel. Then, at pairing, offer the **joiner** the existing daily reminder once, if they do not have it, out of the same one-ask-ever budget onboarding uses. That is the partner who installed as a favour and never saw the onboarding ask. It fires at their own hour, names nobody, and cannot be triggered by the sender.

**E3. Demote the growth-engine argument in §7 and add the rule it needs.** Reasons 2 and 3 carry the decision on their own. Reason 1 is a side effect, and `growth-plan.md` already refuses invite-nags forever, so nobody should be able to quote "growth engine" at a pairing prompt later. Add to §4:

> The second seat often belongs to someone who did not seek this product out. Their asks (assign it, show me if it's done, tell me when they finish) are honest and reasonable, and every one is on the Tier 4 list. A request from the second seat is a partner request. It is never counted as user demand.

Draft the warm refusal paragraph **now**, once, for store review replies and the support address, so the answer exists before the question does.

**E4. The shared Lookback ships free to both people, or not at all.** Delete the sentence in §7 that sells it as premium. Entitlements live in D1 and tasks in Supabase, so gating it means either cross-account entitlement plumbing that is modelled nowhere, or one partner paywalled out of the couple's own week. That is the same argument §7 already makes for not gating creation. Premium keeps "more than one shared list."

Record the Tier 3 rule now while it is cheap: **the shared week renders only when both people finished at least one thing in it**, the shape the scrapbook gate already uses. Otherwise the first surface in the product that supplies evidence *for* the brain's lie is the one built to refute it. A depressive fortnight where B did none of the 27 must not hand B a keepsake titled "This week, between you: 27 things."

**E5. Decision-log entries, in the same commits.** Three specifically, each recording what was decided *against*: (a) `created_by` is kept while `done_by` is dropped, and at N=2 that is a conscious trade of a residual ledger for clarity, not an oversight; (b) freeze-on-unpair over copy-on-unpair; (c) the answer to the 2026-06-18 open assumption at line 303, which has been dangling since the day it was written.

---

## 3. Deferred, with triggers

| Item | Trigger to pick it up |
|---|---|
| A change dot on the Today door | A couple reports missing a change. Then it is a **dot**, never a numeral, meaning "changed since you last opened Ours", clearing on any open, never appearing for your own writes, calm accent, never red. The `decision-log.md:404` calendar-dot precedent. |
| "Put Ours away" local pause toggle | A real user asks. With no number on the door it is furniture, and not opening a screen is already free. |
| Supabase Realtime | The poll is measurably insufficient after real use. It narrows the window, it does not change the merge. |
| `due` / a Later section on Ours | Q4's answer, or open-row accumulation observed in the two couples after a month. |
| `skipped_dates` and "every N days" on Ours | Someone asks. |
| A `done_changed_at` per-field completion merge | A real "my tick vanished" report survives C3. With a synced clock and monotonic stamps the residual is genuinely concurrent writes, which no timestamp scheme orders correctly. |
| Moving the join to the Worker with a pepper and a global D1 failure budget | Any sign of redeem abuse in logs. The per-account cap plus global hourly ceiling inside the RPC already makes online guessing cost an email-OTP account per five guesses against a ~1e9 space of single-use 24h codes. |
| A positive `auth.getUser()` confirmation before the destructive account-gone branch | Optional hardening. B2's constraint check already makes the fail direction safe. |
| Chunking `pushTasks`, or quarantining a 23505/42501 row instead of failing the whole batch | `sync.failed` telemetry shows either code. One bad row currently kills every push forever and reads to the user as a network hiccup. |
| Per-person removal vocabulary | Tier 2's third person. At that point "Stop sharing" stops being an eject. Solve it without roles. |

## 4. Refused, and written into Tier 4 so it is not re-litigated

Everything already there, plus:

- **Sender-initiated per-item pings.** Not a latency problem, a category error.
- **A per-user completion log**, in any form. It is the data shape that makes per-person stats possible, and it is the one decision here that cannot be walked back once the rows exist.
- **Content filtering of a couple's own words.** Machine-filtering a two-person private list censors people inside the calm surface, is not what Apple's first 1.2 bullet targets, and is itself a shame mechanic. Say so in the review notes rather than omitting it silently. Report plus block plus a published contact is the defensible posture for private paired content.
- **A block-list table.** Pairing is pull-based, and a permanent record of an ended relationship is its own liability.
- **A conflict-resolution dialog.** Asking an RSD-prone user to adjudicate against their partner is the exact shame vector §4 exists to prevent.
- **Per-item hide.** Divergent views break the only thing a two-person list is for.
- **Shared tasks over MCP and the REST API.** §9 Q3's own recommendation, confirmed. Keep `shared_id` out of the task shape there too.

---

## The one thing I would push back on hardest

The draft's §4 is written as six laws, and five of them are enforced by good intentions in a UI that does not exist yet. The Rhythms model earned its "no streak" promise by having nowhere to store a streak. Ours as drafted promises no tally and then ships the column that computes one, promises Today stays yours and then puts an externally-authored number on it, and promises leaving costs nothing while handing your ex a permanent copy of everything you wrote.

Fix those three in the data model and the laws become true by construction. That is the version worth building, and it is a smaller build than the draft, not a larger one.

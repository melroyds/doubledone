# Ours: the shared partner list

*Architecture v2, 2026-08-09. NOT BUILT. The v1 draft was attacked by a six-lens adversarial
panel (81 findings, 62 confirmed, 88 agents); the argument is kept verbatim in
[`shared-lists-review.md`](shared-lists-review.md), this is the decision. Melroy's naming
decision from the same evening is folded in. Nothing here is committed to code.*

**The panel's own headline, worth keeping at the top:** the bones survived, and the one
load-bearing decision (separate tables, never a `space_id` on `tasks`) survived everything.
But three of the six never-shame laws were enforced by good intentions in a UI that does not
exist yet. Fixed in the data model instead, they become true by construction, and **the build
gets smaller, not larger.**

---

## 0. The field answers

**One conversation with each couple, one question:** *"read me the last ten things that went
on your shared list, and tell me which of them repeat."* If more than half repeat, recurrence
is mandatory in v1. If almost none do, it collapses to two unused columns and no UI.

- **Couple 1 (the married couple, Melroy's own household), 2026-08-09: ANSWERED.** *"A shared
  list of things to do."* Tickable tasks, not a log, not timestamped events. The shape is
  Today's grammar applied to two people, which is the cheapest version and the one that
  distorts nothing. **Repeat ratio still outstanding.**
- **Couple 2 (the newborn parents): asked 2026-08-10.**

**What couple 1 being the founder's own household changes:** Ours ships to web first (Pages
auto-deploys, no store review) and is dogfooded by a real household for a fortnight before any
binary carries it. Every early defect in a feature this sensitive lands on the builder's own
kitchen table rather than a stranger's.

**If couple 2 wants a feed log rather than a list**, that is now a *comparison*, not a
requirement. Build the list, which is the thing the product already is, and treat timestamped
event logging as a separate question with its own answer. One couple asking for a different
shape does not get to bend the spine.

---

## 1. The naming

**The surface is "Ours."** Single evocative noun in the family the app already speaks (Today,
Lookback, Settle, Rhythms). It answers the only question a shared list raises, in four
letters, with no instruction. Rejected: "Shared" (a filing cabinet), "Family" (excludes
flatmates, carers, and the friend you're getting through a week with), anything with "Team"
in it (the trap the spec names).

Transcreated per locale, never calqued: **Nuestro** · **Ensemble** (fr, because "le nôtre" is
clunky) · **Nostro** · **Unser** / **Gemeinsam** (de, native call).

**The other human is "your person."** True for a spouse, co-parent, sibling, flatmate or
carer. Survives translation warm (tu persona · ta personne · la tua persona · **dein
Mensch**). **Never** member, owner, admin, assignee, role: the moment the app has roles it is
a workplace, and this audience will feel watched.

**Naming the list itself (Melroy, 2026-08-09).** At creation, offer a **pick-one, not a text
box**: *The shop · The house · The baby · Just us*, with "name it yourself" for those who want
it and a default of **Ours** if they tap past. A blank field at the moment two excited people
connect is a naming decision, and naming things is a classic ADHD stall point.

Three rules that keep it cheap:

- **The choice is cosmetic in v1.** It names the list and changes nothing else. The moment
  purpose changes the feature set, a feed log and a shopping list are two products.
- **The chosen name replaces "Ours" wherever the surface is named**, including the door on
  Today. So "Ours" is the *default name*, not a second label. One concept.
- **Instrument it.** The beacon counts which preset was picked: one word, anonymous, no
  content. In a month, real households tell us what this is for, and *that* is when a shape
  change earns its keep. Telemetry before traffic, applied before the feature ships.

The preset copy goes through the never-shame string audit at build time, in five locales. The
set is a quiet statement about which households we imagine, and "The baby" lands very
differently on a couple who have just lost one; a set that also fits a carer, a sick parent,
or two friends getting through a hard month costs nothing and excludes nobody.

**No `pairs.name` column.** Free text on a shared object, rendered on someone's home screen,
is how a name field becomes a message channel. The preset resolves to a catalog key; only a
self-chosen custom name is text, and it is capped and reportable like any other content.

---

## 2. Pairing

A **pairing code**, spoken aloud or texted, typed by the other. Chosen over email invites
because the dominant real case is two people in one house, it needs no deliverability, sends
no "you've been invited!" mail, and mirrors the sign-in code they already know.

1. **A** taps *Start a shared list*, picks a preset, types **a short name for themselves**,
   and sees a code, e.g. `K7M-P4Q`.
2. **B** types the code, types **their own short name**, and joins.
3. Both land on the same Ours. Symmetric from that moment: no owner, no admin.

Hardened by the panel:

- **The code is generated server-side** in `create_pair_invite()` from `gen_random_bytes`,
  over an alphabet with no ambiguous glyphs. The client is never trusted for entropy. Stored
  **hashed**, single-use, 24-hour expiry.
- **No email is ever shown.** `auth.users` is not client-readable, so a "who am I joining?"
  preview would need a definer RPC that is, by construction, an email oracle for anyone
  holding a guessed code, and a mis-texted code hands a stranger a real identity. Instead both
  people type a short self-chosen label at the moment of pairing, stored pair-scoped on
  `pair_members`, dead on unpair. Not a profiles table.
  > **Invariant, sitting beside the never-shame laws:** no user's email, phone number or
  > account identifier is ever rendered to another user, in any surface, ever.
- **No pre-join preview at all.** There is no lookup to probe, and every attempt is stamped.
  Confirmation moves *after* joining, both ways: B sees *"You're now sharing with Sam. Not
  them? Leave."*, and A sees *"Sam joined · That wasn't who I meant"*, one tap to unpair and
  mint a fresh code. That also closes a hole in the v1 draft, where the creator could never
  learn who was in their own list.
- **Rate limiting lives inside `join_pair`**, per account plus a global hourly ceiling. The
  draft's "per IP" is deleted: Postgres cannot see an IP, so it was a promise with no enforcer.

Sharing requires an account on both sides. The Ours screen for a signed-out user explains
exactly that, calmly, once, and says what stays true: your own tasks remain on your device.

---

## 3. The data model

**Separate tables. `tasks`' policies are not touched.** A mistake in a widened policy on
`tasks` exposes *personal* tasks, the one thing this product has promised never to leak. New
tables mean a mistake can only expose what was already shared with one chosen person.

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

Every unobvious choice closes a confirmed finding:

- **`done_by` is deleted.** The law says a tally must be impossible to compute; the app's own
  standard (set by Rhythms, `product-spec.md:102`) is that it must not exist *in the shape of
  the data*, not just the UI. At two people the column buys no privacy anyway (if it wasn't
  me it was you) and costs the promise. `done_at` stays: a time, not a person.
- **`created_by` is `on delete set null`.** Cascade guts the other person's living list when
  someone deletes their account; no-action makes erasure fail outright. Set null keeps the
  words and removes the name, and `delete_account()` then needs no change at all.
- **`title` is capped in the schema**, because a direct PostgREST call walks around a
  client-side limit. Mirror it on the input so an honest user never meets the error.
- **PK is `(pair_id, id)`**, so an id collision can never cross two households.
- **One trigger:** after delete on `pair_members`, delete the pair when no members remain. It
  holds for every exit path (leave, remove, account deletion, a future third person) rather
  than only the one function someone remembered to update.

**Access is two SECURITY DEFINER RPCs, hardened like the live `delete_account()`.** The
draft's client-side membership writes do not run *and* are not safe: a joiner is not yet a
member so no membership policy can find their invite, the obvious fix lets any account insert
itself into any pair, and a membership policy *on* `pair_members` is a Postgres 42P17 recursion
error.

- `pair_invites`: RLS on, **zero policies**. No client ever touches it, same posture as
  `ai_calls`.
- `pair_members`: select via a definer `is_pair_member()` helper, delete by self. **No insert
  policy, no update policy.** That absence is the security control.
- `shared_tasks`: membership *and* `closed_at is null and disabled_at is null`.
- `join_pair(code)` consumes the invite in a **single** `update … where used_at is null and
  expires_at > now() returning pair_id`. Select-then-update reopens single-use as a race.
  Idempotent for a caller who is already a member, so a lost response never reads as "this
  code has been used".

**Two clocks, not one.** LWW plus tombstones was proven **single-writer**; two accounts
writing one row is the case personal sync never had to survive, and a phone six minutes fast
would win every conflict forever, invisibly. So we remove the second clock rather than trust
it: `withMonotonicStamps` on the shared write path (free, its signature already fits), plus a
`server_now()` read once per sync to carry a cached skew into `nowMs()`, the single mint point
for every timestamp in the app. It fixes personal cross-device and MCP skew in the same stroke.
This finally answers the open assumption dangling at `decision-log.md:303`.

**Cadence:** every trigger in the draft was edge-triggered on a transition, so none of them
fire while two people are looking at the list at the same time, which is the only way two
people in one house ever use it. Add: reconcile after **every** write, and poll at 15s while
the Ours screen is focused *and* the app is active, stopping on blur, background, and after
ten idle minutes. Filter on `updated_at` only, never `deleted_at is null`, or removals never
propagate and deleted items resurrect. No live "updated just now" timestamp: a relative
timestamp on a shared list is a checking surface for the OCD segment. And no row ever moves
under an active press.

**Local store:** one key, `doubledone.ours.v1`, holding `{ pairId, tasks[] }`. Ours renders
the cache only when its `pairId` matches a membership the session has confirmed, so a shared
tablet cannot show one flatmate's list to another. The key joins `wipeLocalData` and its
regression test **in the same commit that creates it**.

---

## 4. The never-shame laws, rewritten to promise only what is true

At two people you cannot hide who has not done something: every change you did not make was
made by the only other person. Promising otherwise is worse than not promising, because the
promise is what breaks.

- **No assignment, ever.**
- **No stored per-person record of completion**, so nothing can be counted or compared later,
  now or in a future feature. Impossible to compute *because the data does not exist* (the
  Rhythms bar, inherited rather than re-argued).
- **No notification that creates an obligation.**
- **No number on Today that another person can change.**
- **Nothing crosses into your Today unless you pull it.**
- **Leaving is one tap, and nothing is lost.**

Plus one the panel earned:

> The second seat often belongs to someone who did not seek this product out. Their asks
> (assign it, show me if it's done, tell me when they finish) are honest and reasonable, and
> every one is on the Tier 4 list. **A request from the second seat is a partner request. It
> is never counted as user demand.**

---

## 5. The three shape changes that make the laws true

**The door reads `Ours`. No count.** A live number of undone work that a second person can
raise, sitting permanently on the screen whose entire promise is that today is finite, is the
same payload the laws ban in notification form, shipped as furniture you cannot dismiss. (It
also inverts the app's own vocabulary: every "waiting" string in the catalog carries "They are
safe.") A change *dot* is deferred with a trigger, never a numeral.

**Pull keeps a one-way link home.** A detached copy means the work gets done on the copy while
the shared row stays open forever, so Ours can only grow and both people do the same job,
which is the feature failing at the one thing it exists for. One nullable `shared_id` on
`tasks`, same shape as the existing `parent_id`, applied to live Supabase before the client
that sends it ships. Then:

1. The copy gets a fresh id and a fresh `createdAt`. Never the shared id (a global PK
   collision bricks sync permanently); never the shared `createdAt`, because the Lookback
   narrates *"four months since you first wrote it down"* and what lingered is how long it has
   been **yours**.
2. Pulling twice focuses the existing copy.
3. **Your** tick closes the shared row (one hop, the shape `completeAncestors` already proves).
4. **Their** tick tombstones your copy; it does **not** mark it done. Marking it done puts
   work you did not do into your Lookback, and the Lookback is the emotional payoff of the
   whole product. This way the credit stays honest and the day is shorter because someone
   helped.
5. A shared removal never removes anything from your Today. Nothing leaves your day by
   another hand.

**Unpair freezes. Zero rows move.** `pairs.closed_at`: reads stay, writes stop, both sides at
once, one calm line, no name and no reason. The list stays openable and frozen and you take
things from it one at a time, with the pull gesture Tier 1 already ships, when you can face
it. A separate "Remove this list" deletes your own membership; the trigger cleans up the pair
when the second person does the same.

This single decision deletes six confirmed defects at once: unpair idempotency across two
devices, deterministic copy ids, a flood of undated rows into Today, a hostile partner's
payload made permanent, "copy only what you wrote", and a bereaved user's dead partner's words
dumped into their morning.

**Ours also gets a floor**, or it grows forever by construction: done rows stop rendering at
the day boundary (straight parity with `tasksForToday`, so un-tick works all day), and
tombstones younger than seven days render dimmed under "Recently removed" with Restore, so
*did I imagine adding it, did it not sync, or did they delete it?* has an answer that names
nobody. And the finality affirmations ("Filed. You can stop checking it now.") do **not** fire
on Ours: the app should only promise finality on a surface where it controls finality, and
here your person can un-tick.

---

## 5a. One person, many people (Melroy's question, 2026-08-09)

*Can one user hold several shared lists, each with a different person? Your co-parent is not
your flatmate is not your sibling.*

**The schema already says yes, and the v1 UI says one.** `pair_members`' key is
`(pair_id, user_id)`, so a user may appear in many pairs and only never twice in the same one.
Everything downstream already respects that: `is_pair_member(pair_id)` takes an argument rather
than assuming one, `shared_tasks` is keyed by pair, the cleanup trigger fires per pair. Nothing
in the data model believes you have exactly one person.

The only thing stopping it is the guard in `join_pair`, "refuse if the caller is already in a
pair", which is a **policy**, not a structure. It ships as a named constant
(`MAX_PAIRS_PER_USER = 1`) so raising it later is changing a number rather than migrating.

**Why v1 still ships one.** The cost is not data, it is the surface. Several lists turn the
quiet door on Today into a *directory* of other people's surfaces, on the screen whose whole
promise is that today is finite; the Ours screen grows a switcher, which is navigation, which
is what this app spends its budget avoiding. Both requesting couples asked for exactly one
relationship, so a switcher today is hours spent on a hypothesis.

**Three things done now, while they are free** (the same "cheap today, expensive after the
first row" rule the panel applied):

1. **`shared_id` on `tasks` carries its pair.** `shared_tasks`' key is `(pair_id, id)`
   deliberately, so ids cannot collide across households, which means `shared_id` alone is
   ambiguous the moment a user is in two lists. Store `shared_pair_id` beside it. Two nullable
   columns instead of one. ("Practically unique is good enough" is exactly the assumption that
   produced the `makeId()` defect in §9.)
2. **The local cache is keyed by pair from day one**, `{ [pairId]: tasks[] }`, so the storage
   shape never needs migrating.
3. **The cap is a constant**, per above.

**One invariant, because RLS guarantees it but the UI could still leak it:** every pair is a
sealed room. Your person cannot tell that another list exists, how many you are in, or with
whom. Nothing renders a count of your lists to anyone but you.

**Not the same question as groups.** This is *many pairs of two*, a star with you at the
centre. A single list of three or more is a different product, and the schema would allow it
too (stop capping members at two), but the never-shame maths inverts: at two people "who did
not do it" is always inferable, which is why §4 was rewritten honestly; at three or more,
anonymity genuinely returns. Groups also invite the roles pressure §11 refuses. Later question,
separate answer.

**Premium keeps "more than one shared list."** That gates the user's own breadth, not their
person's access to the list they are already in, so it does not repeat the mistake the panel
caught with the shared Lookback in §8.

---

## 6. What to borrow from FamilyWall

FamilyWall ships a shared calendar, task assignment with roles, family chat, a location map,
photo albums, meal planning and shopping lists: a household operations centre for organised
families. DoubleDone is a calm surface for overwhelmed brains. **Borrow one thing: how fast
joining a household should be.** Refuse the rest, either as a different product (calendar,
chat, photos, location) or as actively hostile to this audience (assignment, roles,
per-person completion stats).

---

## 7. Where it lives

**One quiet line under Today**, in the shape the Settle wind-down line already proved, plus
the menu. **No tab bar**: bottom navigation to hold one feature would restructure the app and
tell every user Today is now one place among several, which is the opposite of the thesis.

The Ours screen is Today's grammar deliberately: same rows, same held card (minus the AI
actions in v1), same calm. Learning it costs nothing.

---

## 8. Free, and what premium keeps

**Free in v1**, on the two reasons that carry it: a paywall on one side stalls the couple at
the door, and gating creation means either mirroring entitlements across D1 and Supabase or
trusting a client check a direct call walks around. Good architecture avoids the problem
rather than policing it.

The growth-engine argument is demoted to a side effect on purpose, because the growth plan
already refuses invite-nags forever and nobody should be able to quote "growth engine" at a
pairing prompt later.

**The shared Lookback ships free to both people, or not at all** (gating it paywalls one
partner out of the couple's own week). Premium keeps **more than one shared list**.

Record the Tier 3 rule now while it is cheap: **the shared week renders only when both people
finished at least one thing in it**, the shape the scrapbook gate already uses. Otherwise a
depressive fortnight where one partner did none of the twenty-seven hands them a keepsake
titled "This week, between you: 27 things", and the first surface in the product to supply
evidence *for* the brain's lie is the one built to refute it.

---

## 9. Two fixes to shipped code, independent of Ours

Both verified in the live repo, both worth doing whether or not Ours is ever built.

**`makeId()` has no randomness.** `addCounter` restarts at 1 every session, so two devices
minting their first task of a session in the same millisecond produce the same global primary
key. Rare, real, and silent when it happens. One line adds entropy while keeping the
within-device guarantee the existing 500-unique test proves. Ids are opaque text: no
migration, nothing user-visible.

**`isAccountGone()` reads any 23503 as "your account is gone"**, and Today responds by
clearing tasks, purging keepsakes, wiping local data and signing out. Its docstring states the
premise honestly ("the only foreign key on the `tasks` table is user_id"), and that premise
dies the day `shared_tasks` exists. Not dangerous today; a landmine Ours would arm. Require
the constraint name in the message, update the docstring and test, and add the regression that
names the threat.

---

## 10. Before the first store binary containing Ours

Two accounts seeing each other's free text puts DoubleDone under Apple 1.2 and Play's UGC
policy, and there is currently none of report, block, or a kill path. After two guideline
rejections in July, a third would block the whole release, not just the feature.

- **Report:** one quiet row, routed to the existing `/feedback` Worker route with a context
  tag and the pair id. No new endpoint, no moderation queue.
- **Block:** unpair already is one. Put "Leave this list" on the Ours screen itself, not only
  in Settings, and expire the pair's outstanding invites in the same statement or a stale code
  is a live re-entry ticket for 24 hours.
- **Kill path:** `pairs.disabled_at`, one clause in the RLS predicate, flipped by hand in the
  dashboard. No service-role key, no moderation code, "timely response" becomes thirty seconds
  from a phone.
- **Privacy policy, both copies, same commit.** Today they say tasks are "stored in rows only
  you can read", which is the sentence Google fetches during review and it goes false on ship
  day. Add "If you share a list" covering five facts, bump both dates, and add the matching
  clause to the delete-account confirmation in five locales.
- **Terms paragraph** defining objectionable content and prohibiting directing it at another
  person through a shared list.
- **Store forms in the same session:** Play IARC and Apple age rating both gain user
  interaction and user-generated content (expect the rating to move off 3+); no new Data
  Safety row is needed but annotate the existing one; two lines in App Review notes pointing
  at Report and Block.

**Ship Ours to web first.** Pages auto-deploys, no store review exists there, and the two
couples can live on it for a fortnight. That answers the Q0 conversation with behaviour rather
than opinion and de-risks a review cycle. The compliance kit lands before the first AAB or
IPA, not before the web deploy.

**Refused, and machine-filtering is refused explicitly:** censoring a couple's own words
inside the calm surface is not what Apple's rule targets and is itself a shame mechanic. Say
so in the review notes rather than omitting it. Report plus block plus a published contact is
the defensible posture for private paired content.

---

## 11. Tier 4, refused forever

Assignment · roles · per-person stats · **a per-user completion log in any form** (the one
decision here that cannot be walked back once the rows exist) · chat · shared calendar ·
location · nagging · sender-initiated per-item pings · a conflict-resolution dialog (asking an
RSD-prone user to adjudicate against their partner is the exact vector the laws exist to
prevent) · per-item hide · a block-list table · content filtering of a couple's own words ·
shared tasks over MCP and the public API.

## 12. Deferred, with triggers

A change **dot** on the door (a couple reports missing a change; a dot, never a numeral) ·
"Put Ours away" (a real user asks) · Supabase Realtime (the poll proves insufficient) · `due`
and a Later section (Q0's answer, or observed accumulation) · a third person · per-field
completion merge (a real "my tick vanished" survives the clock fix) · moving join to the
Worker with a pepper (any sign of redeem abuse) · chunked pushes (telemetry shows a poisoned
batch).

## 13. Still open for Melroy

1. **The Q0 conversations** (§0), which gate recurrence and possibly the shape.
2. **The preset set**, as a values statement, in five locales.
3. Confirm free-v1 and shared-Lookback-free (§8).
4. Confirm shared tasks stay out of MCP and the REST API.

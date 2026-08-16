# Ours: the store compliance sheet

*The exact answers to give Apple and Google now that DoubleDone lets two people write into the same
list. Written down because these forms are filled in months apart, at speed, late at night, and a
wrong answer here is a rejection that costs a review cycle.*

**This gates a store BINARY, not the web deploy.**

> **The allowlist is GONE, and this sheet used to say otherwise.** Until 2026-08-16 the line above
> continued "Ours is also gated behind `ours_allowlist`, so until Melroy adds an address by hand, no
> store reviewer or user can reach the feature at all", and the App Review note below told Apple to
> email us for access. `supabase/ours-open.sql` dropped that table, and `python
> scripts/check-migrations.py` confirms it live (`ours_allowlist DROPPED — PGRST205`). Ours is open
> to every signed-in user. Telling a reviewer a feature is gated when it is not is a metadata
> inaccuracy under 2.3, and the likelier outcome is worse than a rejection: the reviewer emails
> asking to be enabled, and the submission sits idle for a cycle waiting on a reply about a table
> that no longer exists.

---

## What the stores require, and where it lives

Both Apple (Guideline 1.2, user-generated content) and Google Play (User Generated Content policy)
require the same four things of any app where one person's words reach another's screen.

| Requirement | Where it is, in DoubleDone |
|---|---|
| A method for **filtering** objectionable content | Not applicable, and say so: there is no public feed, no discovery, no strangers. A shared list is between two people who each accepted a one-time code, and neither can reach anybody else. |
| A mechanism to **report** offensive content | **Report this list**, on the Ours screen, under Leave. Posts the pair id (and nothing else) to the `/feedback` Worker route, which emails `FEEDBACK_TO`. |
| The ability to **block** abusive users | **Leave this list**, on the same screen. Instant, needs no reason, and closes the list for both people. There is no rejoin path without a fresh handshake from both sides. |
| A published way to **contact** the developer | The Contact section of the Terms, and the in-app feedback box in Settings. |
| Acting on reports within **24 hours** | Committed to in the Terms ("we aim to look at reports within 24 hours"), and enforced by the kill path below. |

## The kill path, which is what "acting" actually means

`public.pairs.disabled_at` is in the schema and is read by the RLS predicate. Setting it by hand in
the Supabase dashboard makes the list instantly read-only for both people, everywhere, with no
deploy and no app update:

```sql
update public.pairs set disabled_at = now() where id = '<pair id from the report email>';
```

The app renders a disabled list exactly as an ordinary closed one. **That identical rendering is
deliberate and must not be "improved":** any distinguishing mark would tell the reported person that
they had been reported, which is the thing most likely to put the reporter in danger.

To reverse it, set `disabled_at = null`.

---

## The Apple form (App Store Connect → App Information → Age Ratings)

**Apple replaced this questionnaire in July 2026**, so anything you remember from the last
submission is stale. The ratings are now 4+, 9+, **13+, 16+, 18+**, and there is a new first step
about in-app controls and capabilities. Answers become **required from September 2026** for any new
app or update, so this is due regardless of Ours.

**The question that decides everything: social media capability.** Apple defines it as *"the ability
to redistribute, amplify, or interact with user-generated content through a social feed or similar
discovery method."* Answering yes means a Social Media content descriptor on the listing, inclusion
in the Social Media **Time Allowance** category, and a **minimum rating of 13+**.

**DoubleDone answers NO, and the reasoning must survive a reviewer reading it:** there is no feed,
no discovery method, no amplification and no redistribution. Content reaches exactly one person, who
must already hold a six-character code AND sign in with the specific address it was minted for.
Nothing is public, nothing is browsable, and no user can reach a user they have not exchanged a code
with out-of-band.

**If a question asks plainly about user-generated content or communication between users, without
the feed/discovery framing, answer YES.** Two people writing into one list is exactly that, and
under-declaring is the failure that costs a review cycle. It is the *social media* framing
specifically that DoubleDone does not meet.

| Question type | Answer |
|---|---|
| In-app controls / capabilities (step 1) | Select nothing that DoubleDone does not have. There are no parental controls, no content filters, no age gate. |
| Social media capability | **No** (no feed, no discovery, no amplification) |
| User-generated content / user communication, if asked separately | **Yes** |
| Unrestricted web access | **No** |
| Violence, sexual content, profanity, horror, drugs, alcohol, gambling, contests, loot boxes | **None** |
| Medical or wellness topics | **No.** It is a to-do app. It is designed with ADHD and OCD in mind but makes no medical claim, gives no treatment information, and must not be declared as health content. |

**Check the calculated rating on the final step BEFORE saving.** If it comes out above 4+, stop and
work out which answer raised it rather than accepting it: a 13+ on a calm to-do app is a real cost.

**App Review notes** (paste into the review-notes box):

> DoubleDone lets a user optionally share ONE list with ONE other person, by reading them a
> six-character code. There is no feed, no discovery, no profiles, no public content, and no way to
> contact anyone you have not exchanged a code with out-of-band. Every shared list carries "Report
> this list", which reaches us directly and never notifies the other person, and "Leave this list",
> which closes it for both people immediately. We act on reports within 24 hours and can disable any
> list server-side, with no app update.
>
> HOW TO REACH IT. There is no allowlist, invitation or approval step, and nothing needs to be
> enabled by us. Open the app, tap the menu at the top right of Today, and choose Ours. Sign in if
> you have not: the review account is in App Review Information, and any other address you control
> also works, because accounts self-provision from a six-digit code sent by email. Then tap "Start a
> shared list", enter any second email address, and the app shows the six-character code to read to
> that person. To see the receiving side, sign in on a second device with the address you entered
> and choose "Join with a code". "Report this list" and "Leave this list" are both on that same
> Ours screen.
>
> DoubleDone is a to-do app. It is designed with ADHD, autistic and OCD users in mind and describes
> itself that way, but it makes no medical, diagnostic or treatment claim, offers no health
> information, and collects no health data.

*The old final paragraph promised a manual allowlisting step that no longer exists. See the warning
at the top of this file. The paragraph naming the review account is new: a reviewer who cannot get
in at all is the other way to lose a cycle, and telling them the accounts self-provision removes the
dependency on us entirely.*

## The Google Play form

**Where it actually is: Play Console → left sidebar → `Monitor and improve` → `App content` → Content
ratings.** Confirmed by Melroy 2026-08-09 after two wrong guesses. Google's own help pages still say
"Policy → App content", which is the OLD layout, and it is NOT under `Test and release` either. If
the sidebar has moved again, the reliable route is to take the app-dashboard URL and swap the last
path segment for `app-content`:
`https://play.google.com/console/u/0/developers/<devId>/app/<appId>/app-content`

Unlike Apple, Play lets you edit this ANY TIME. No new version, no release, no shell to create.

- **Content rating questionnaire → Social features / User-generated content: Yes.** Then:
  - Users can interact or exchange content: **Yes**
  - Users can share their location: **No**
  - Content is publicly visible by default: **No**
  - Users can be contacted by other users: **No** (a code must be exchanged out-of-band first)
- **Target audience:** unchanged, adults. No child-directed design.
- **Data safety:** unchanged. Task text was already declared as collected for app functionality and
  is still not shared with third parties and not used for advertising. **Nothing new to declare:** a
  shared task is stored in the same `shared_tasks` rows already covered, and the app records no
  authorship, so there is no new data type.

---

## The two questions a reviewer may ask, and the honest answers

**"How do you moderate content between users?"**
We do not pre-moderate, and we say so. There is no public surface to moderate: content only ever
reaches one specific person who accepted a code from the sender. Moderation is reactive, via the
report link, with a 24-hour target and a server-side kill switch.

**"Can a minor be contacted by a stranger?"**
No. There is no directory, no search, no suggestions, and no way to send anything to an address you
have not been given a code by. Joining requires the recipient to already hold a code AND to sign in
with the exact email address the code was minted for.

---

## Before the next store submission

- [x] Apple age rating: the July 2026 questionnaire, social media = No, done 2026-08-09 (needed an
      empty 1.3.0 in Prepare for Submission first: App Information is read-only with no editable
      version, and Apple no longer lets you delete the version afterwards. That is fine, it is the
      version Ours ships as.)
- [ ] Paste the App Review note above into the next submission
- [ ] Play content rating: interact/exchange = Yes, publicly visible = No
- [ ] Confirm `FEEDBACK_TO` is a mailbox actually being read (reports land there)
- [ ] Confirm the review account can be allowlisted on request

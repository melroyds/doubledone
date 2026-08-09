# Claude Design prompt — DoubleDone: Ours, a list two people keep

Design the surface where two people join their lists together, and the small screen that holds the
relationship between them. Not a team feature. A kitchen-table feature: a married couple, two new
parents at 3am, a person and whoever helps them, flatmates who keep forgetting the bins.

Two separate couples asked for this unprompted. It is the first thing in DoubleDone that another
human being can see.

## The product

DoubleDone is a calm, never-shame daily to-do app for adults with ADHD, autism, the AuDHD overlap
and OCD, live on web, the App Store and Google Play. The spine: **today is finite and achievable**.
The standing rule: **remove friction, never add a setting**. Brand is "Dusk": Newsreader serif for
headings, Atkinson Hyperlegible for body, a soft mauve (#946475) with sage (#7E9B6B), honey
(#C19A4F) and periwinkle (#6E72A0) as rare notes, warm paper (#FAF6F1) with a full dark mode
(#1B1917). Existing surfaces to stay congruent with: Today, the held card, the capture panel,
Settle, Settings, Sign-in.

## What Ours is (decided, do not redesign the model)

- **One shared list between exactly two people.** No third seat, no groups, no admin, no owner.
- **You join by code.** One person mints a six-character code (`K7M-P4Q`, never containing 0, 1, I,
  L or O, because it gets read aloud across a room), the other types it into their own phone. It
  works once, for a day, and only for the email address the first person named.
- **The list is named for its purpose**, agreed at creation: the shop, the house, looking after
  someone, just us, or type your own. Skipping the question is a first-class answer.
- **Each person types what the other sees them as.** A self-chosen short name, never an email
  address, never an account, never a photo.
- **Nothing on the shared list touches your Today unless you put it there.** This is the promise
  that makes it safe to accept an invitation from a spouse.
- **Leaving is one tap and takes nothing away.** The list freezes: both people can still read every
  word of it, nobody's rows move or vanish. It is a door, not a shredder.

## The laws this surface cannot break

These are enforced in the database, not just the interface, so a design that assumes otherwise
cannot be built. They exist because this audience is rejection-sensitive, and because the threat
model of a shared household list is domestic.

1. **Nothing ever attributes a completed task to a person.** There is no column recording who
   ticked what: a per-person tally is not withheld, it is *uncomputable*. Design nothing that
   implies one exists, now or later. No initials on a row, no "done by", no activity feed.
2. **Nothing counts, compares or scores.** No progress bar over two people. No "you've done 4, they
   have done 9". No badge on Today with a number another person can change.
3. **No email address, phone number or account identifier is ever shown to the other person.** The
   person who typed the address already knows it; the person who joined is never shown one.
4. **Every pair is a sealed room.** Nothing anywhere renders how many lists someone is in, or with
   whom, or whether they are in one at all.
5. **The second seat did not necessarily choose this app.** Someone is being handed a productivity
   system by their partner. Every screen they see first must read as an invitation they may decline
   without cost, never as an onboarding funnel.
6. **Never shame the backlog** still holds, doubled: a task sitting undone on a shared list must
   never look like a person letting someone down.

## The states to design (mobile, both dark and light Dusk)

The current build shows exactly one state at a time, because the alternative is a wall of options
this audience cannot read. Keep that discipline, or argue for something better.

1. **Nothing yet.** The one screen that explains what a shared list is without selling it. Two ways
   forward: start one, or join one someone gave you a code for.
2. **What is this list for?** The naming question, with its five answers. This is the screen that
   makes two people agree on one thing before they start filling it, so it should feel like a
   decision made together, not a form field.
3. **Who are you, and who is this for?** The self-chosen name and the one email address the code
   will be bound to. Two questions on a screen where the second one is the only sharp edge in the
   whole flow (get the address wrong and the code is useless), so it needs care rather than volume.
4. **The code.** The one thing on this surface a person reads out loud across a room, so it is the
   one thing allowed to be large. Plus: how it gets to the other person (share sheet, or copied),
   what a person does while nothing is happening yet, and how they recover from a typo'd address.
5. **Waiting.** Nobody has joined. This must not feel like a pending request or a read receipt.
   Nobody is being left hanging; the copy already says "you can close this". Design the calm of it.
6. **Someone is here now.** Two versions, and both need an unhurried way out for the person who has
   just realised this is not who they meant: *you* joined *their* list, and *they* joined *yours*.
7. **Sharing with someone.** The resting state, which is 99% of the life of this screen. The list's
   name, the person's chosen name, and a way to leave that is honest and unfrightening.
8. **The list is closed.** Someone left. Design what a person sees the first time they open this
   after being left. The copy has to be literally true, because they will check: everything is still
   readable, nothing was taken. This is the most emotionally loaded frame in DoubleDone.
9. **Joining with a code.** The other half of screen 1, for the person who was handed six
   characters and possibly no explanation.
10. **The door.** Where Ours lives in the app. Today gets a quiet entry (**no count on it, ever**);
    Settings has one now. Propose the shape of the Today door: it has to be findable without ever
    nagging someone who will never use it.

Also worth your attention: **the shared list itself** (phase 3, rows and all) should reuse Today's
grammar and the same held card minus the AI actions. If you have a strong view on where it must
differ, say so now rather than later.

## Things to argue with

The build is deliberately plain so it can be replaced. Push back on any of this:

- Whether the naming question comes first or last in the create flow.
- Whether "waiting" deserves its own screen at all, or should fold into the code screen.
- Whether leaving belongs on this screen or somewhere quieter.
- Whether the word **Ours** is right. It is the current default name and the current screen title.
  Alternatives considered and available to reopen: Together, Both, The Shared List, Us.

## What this is NOT

- Not a collaboration tool. No comments, no mentions, no notifications about another person, no
  activity history, no "seen by".
- Not a family organiser. No calendars, no chores, no points, no kids' chart, no rewards.
- Not social. No profiles, no avatars, no presence dots, no "last active".
- Not a funnel. No invite prompts on Today, no "invite your partner" nudges, no growth loop.
- Not gamified in any direction, especially not between two people who live together.

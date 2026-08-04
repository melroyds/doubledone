# DoubleDone growth plan

*Written 2026-08-03, the week after full launch (web + Play + App Store, v1.1.0). The operating
constraint: Melroy is employed, so the scarce resource is hours. The operating principle: ONE
channel at a time, measured by timing, pulled until it stops giving. The brand constraint: nothing
that shames, nags, or manufactures urgency, ever. A growth mechanic that betrays the calm spine
costs more users than it acquires in this community.*

*The immediate next action is always at the top of the current week.*

---

## The engine (why these and not others)

Three parts, assembled from what already exists:

1. **Findable**: app-store search is the #1 organic channel for a niche utility, and reviews are
   its biggest input. Both listings are days old with near-zero reviews.
2. **Spreadable**: the keepsake share is a built-in artifact people already send to friends; it
   must carry the app's name and address. Settle is a free hook people tell each other about.
3. **Seeded**: the ADHD/AuDHD/OCD audience gathers in named places (subreddits, newsletters,
   coaches, ADDitude) and actively swaps tool recommendations. Personal, honest seeding beats
   any ad spend at this scale.

**Decided against up front:** paid ads (LTV cannot feed the machine yet; revisit only with
retention proven and a known LTV), TikTok/Reels as a channel (a content grind in a medium that
is not Melroy's), referral give-a-month mechanics (needs infra and volume), and any streak,
badge, invite-nag, or FOMO mechanic (forever, not just for now).

---

## Week 0 (this week): product levers + baseline — Claude builds, Melroy approves

- [ ] **The calm review ask** (native, rides the next scheduled build, never burns one).
  One ask EVER, at an earned moment (after a keepsake is made, or a Lookback visit that shows
  finished things), copy in the house voice: "If DoubleDone is helping, a review helps others
  like you find it." Uses the platform in-app review sheet (expo-store-review), dismiss is
  forever, all four locales, E2E case. NEVER on launch, never after a bad moment (a cleared
  day, an error).
- [ ] **Keepsake attribution.** Audit the share path; ensure the shared page/image carries
  "made with DoubleDone · doubledone.app" quietly. Every share becomes a poster with an address.
- [ ] **Comp codes, the missing half.** The owner allowlist exists server-side; outreach needs
  the per-person 30-day grant (a one-time redeemable code). Small backend piece; unblocks Week 2.
- [ ] **Baseline snapshot** (so every later channel effect is visible by timing): Play installs,
  App Store units, Cloudflare web analytics uniques, premium count, Settle opens, AI calls/day.
  Recorded at the bottom of this file, updated Sundays.

## Week 1: the Reddit story — Melroy posts, Claude drafts

- [ ] One honest post in ONE community (first pick: r/adhdwomen if the rules allow builder
  posts that week, else r/ADHD's recommendation threads). The story: built it for people I
  work with and love; it never shames the backlog; the breathing room is free forever. No
  launch-speak, no feature list, no link spam; the link goes wherever the sub's rules put it.
- [ ] The REAL work: 48 hours of replying to every comment like a person.
- **Pre-decided calls:** >100 installs in the following 72h = repeat monthly, rotating
  communities (r/AutisticAdults, r/OCD, ADHD Discords, the big Facebook groups). <20 = the
  story needs rework before it is repeated anywhere; do not spray a weak story.

## Week 2: outreach — Claude researches, Melroy sends

- [ ] Claude researches ~10 CURRENTLY ACTIVE ADHD micro-influencers, newsletters, podcasts
  (the How to ADHD orbit, Extra Focus / Jesse J. Anderson, Dani Donovan, ADDitude's app
  coverage, ADHD coach networks), each with contact, angle, and why-them.
- [ ] Melroy sends 3-4 PERSONAL emails a week (15 minutes each, no template smell), comp code
  attached. One yes moves hundreds of installs.
- **Pre-decided call:** silence is normal; a 10-20% reply rate is good. Follow up once, gently,
  after a week. Never twice.

## Weeks 3-4: Product Hunt — prepared together, launched once

- [ ] Gate first (see The bucket check below). If retention holds:
- [ ] Claude preps the whole kit: tagline, gallery (the screenshot set exists), first-comment
  founder story, FAQ answers. Hook: Settle + never-shame, not the feature list.
- [ ] Melroy picks a weekday, launches, and spends 2-3 hours that evening replying.
- **Why PH at all:** one-shot spike, permanent backlink, "featured on" credibility for the
  store listings and the coach one-pager.

## Month 2 (Tier 2, in order, still one at a time)

1. **The coach channel.** ADHD coaches recommend tools to clients weekly. A calm one-pager +
   comp codes makes DoubleDone recommendable. Could quietly become the best channel; it is
   the only one with a compounding human in the loop.
2. **Show HN.** The ENGINEERING story (privacy architecture, the MCP server, the beacon's
   day-coarse timestamps): HN's exact taste, and a different audience than Reddit's.
3. **SEO comparison pages.** "DoubleDone vs Todoist for ADHD" is a real search with buying
   intent. Two or three honest pages on doubledone.app; the long game.

---

## The bucket check (the gate on all of it)

Before scaling ANY channel past its first test, and always before Product Hunt: look at
whether people who arrived are still opening the app in week two (Settle opens, AI calls/day,
Play's returning-user stats). **If the bucket leaks, acquisition is a treadmill: pause the
plan, find the leak, fix it, then resume.** Don't fight that signal.

## Measurement ritual

Sunday, five minutes, same six numbers appended to the log below: Play installs · App Store
units · web uniques · premium count · Settle opens (7d) · AI calls/day (7d avg). One channel
live at a time means timing IS attribution; no UTM archaeology needed at this scale.

## Baseline + weekly log

| Date | Play installs (total) | ASC units (total) | Web uniques (7d) | Premium | Settle opens (7d) | AI calls/day (7d) | Channel live |
|---|---|---|---|---|---|---|---|
| 2026-08-0x | _baseline TBD_ | | | | | | none |

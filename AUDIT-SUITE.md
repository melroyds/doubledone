# The App-Ready Audit Suite

> Companion to [PLAYBOOK.md](PLAYBOOK.md). The automated gate (the Inspector, CI, tests) proves the code
> **works**. This suite proves the app is **ready**: that it says what it is, holds under pressure,
> includes everyone, and reads well. It is a set of adversarial, multi-lens reviews you run before a
> launch (or before a redesign), each producing one tiered findings doc you then burn down.
>
> Stack-agnostic. Fork it into any repo alongside the Playbook. Distilled from ParkProof + DoubleDone.

---

## The one rule that makes them work

Every audit ends each lens with the instruction: **"re-check every finding with a skeptic before
including it."** That single line filters out false positives and stops the audit flagging your
*intentional* choices. Without it you get a noisy list you argue with; with it you get a punch-list you
act on. Keep it in every prompt. It is the whole difference between an audit that helps and one that
wastes an afternoon.

## When to run

- **Before a launch** — the app-ready gate: the Tier-1 set, minimum.
- **Before a redesign or rebuild** — audit before you rebuild (PLAYBOOK §1). Refine what is close,
  rebuild only what is genuinely broken.
- **As a periodic health check** on a live app.

Run each in its **own fresh session**, one review doc each (`docs/<name>-review.md`), **fix between**
audits, then re-run the heavy two (completeness, robustness) if you changed a lot. The two heavy audits
gain the most from a multi-agent adversarial run if you have one, but every prompt works single-session.

**Order:** secrets → completeness → robustness → accessibility → copy → (translation) → design →
case-study. Completeness and robustness first because they surface the most; the case-study last so it
describes the cleaned-up product.

## The discipline of stopping

You do **not** run all of them on every app. Tier 1 is the launch gate. Tier 2 runs when it applies. The
commercial tier runs only if you take money. Running an audit whose findings you will not act on is
motion, not progress. For a portfolio proof that just needs to demonstrate you *can* ship, Tier 1 plus
the case-study lifts it most for the least effort.

---

## The suite

### Tier 1 — the app-ready gate (run before any launch)
- **0. Secret + PII scan** — hardcoded keys, tokens, emails in source and git history.
- **1. Completeness (inverse-lens)** — what the product should surface, sell, or explain but does not.
- **2. Robustness + security (7-lens)** — data loss, auth, PII, cost, integrity, concurrency.
- **3. Accessibility** — touch targets, AA contrast (incl. dark), screen-reader, reduced motion.
- **4. Copy / microcopy (7-lens)** — voice, naming, leaked error strings, a terminology glossary.
- **5. The case-study / story** — is the narrative sharp, honest, and what a hiring PM probes.

### Tier 2 — run when it applies
- **6. Design / UI drift (8-lens)** — for anything visual: token drift, dark-mode contrast, duplication.
- **7. Translation review** — for anything localized: are the locales natural or machine-translated.

### Tier 3 — optional rigor
- **8. Cost across scales** — unit economics at 100 / 1k / 10k / 100k users.
- **9. Testing posture + manual E2E suite** — risk-targeted strategy plus a manual launch gate.

### Commercial tier — run only if you take money
- **10. Commercialisation** — pricing, the free-to-paid funnel, churn, GTM.
- **11. Store-readiness** — Play / App Store: data-safety form, current policy, listing, timeline.
- **12. The control centre** — spend / error / abuse monitoring, a daily pulse, money-event alerts.

---

## The prompts

Each is app-agnostic. Paste it into a fresh session in the target repo. Replace **`[APP]`** with one
paragraph describing the app: what it does, its stack, its audience, and any sensitive surfaces
(evidence chains, money, PII, localization). Let the agent read the codebase first.

### 0. Secret + PII scan
```
Run gitleaks across the FULL git history of this repo, not just the working tree, then grep source and
config for hardcoded secrets and personal data: API keys, cloud keys / ARNs, access tokens, private
endpoints, and any real personal email or name. For each hit: where (file:line, and whether it is also
in history), why it matters, and the fix (move to env or secret, rotate if real, redact). List anything
committed that should not be. Keep it 100, just the findings.
```

### 1. Completeness audit (inverse-lens, the standout)
```
Run a COMPLETENESS audit on [APP]. This is the INVERSE of a quality audit. Do not judge whether copy or
design is nice. Hunt for ABSENCE: what the product should surface, sell, or explain to a user but does
NOT. Confirm every gap against the actual code.

Six lenses, each an independent pass:
1. Onboarding and first contact: what a first-time user is never told.
2. Positioning and the sell: does any user-facing surface state what this is, who it is for, and why to
   trust it. Check the web front door (title, meta description, Open Graph, a real crawlable landing surface).
3. Empty and first-run states: what a brand-new user with no data sees on every screen.
4. Discoverability: features that exist but hide behind an unlabelled control or an untaught gesture.
5. Error and edge states: failures that happen silently or strand the user.
6. Trust and safety messaging: where the product does and does not explain what happens to the user's
   data, especially anything sensitive.

Produce docs/completeness-review.md. Open with the read (the biggest theme, a few sentences) and the top
3 highest-leverage gaps. Then gaps by surface, each with: what is missing, where (file:line), why it
matters, a concrete fix, and a tier (1 must, 2 should, 3 nice, 4 noted). Re-check each finding with a
skeptic. Keep it 100, no praise.
```

### 2. Robustness + security (7-lens)
```
Run a 7-lens adversarial robustness and security audit on [APP]. Seven lenses, each an independent pass:
1. Error handling: raw throws, stuck busy states, 500s instead of calm degradation.
2. Input validation: unbounded inputs, missing size or length caps, anything forwarded to a paid API, a
   signer, or storage uncapped.
3. Auth: every flow; any path granting access it should not; fail-open vs fail-closed.
4. Secrets and PII: hardcoded keys or emails; PII in logs or metadata; de-identification gaps.
5. Data integrity: anything that can silently lose or corrupt user data. If the app makes an integrity
   or tamper-proof claim, prove it actually holds and cannot be forged.
6. Cost and abuse: any paid route or unauthenticated endpoint; can a caller run up cost or storage.
7. Client concurrency: double-submit, races, load-modify-save with no guard.

Re-check every finding with a skeptic before including it. Produce docs/robustness-review.md,
severity-ranked (Critical, High, Medium, Low), each tagged clear-fix or needs-judgment, each with what,
where (file:line), the concrete failure path, and the fix. Open with a short honest read of the real
posture. No alarmism, no false comfort.
```

### 3. Accessibility
```
Run an accessibility audit on [APP]. Against the actual code:
1. Touch targets vs 44px / WCAG 2.5.5; fix with hitSlop or sizing, never a visual-only change.
2. Colour contrast vs WCAG AA, in BOTH light and dark mode (dark is where white-on-accent fails invisibly).
3. Screen reader: every control has role, label, and state; no nested buttons; decorative glyphs hidden.
4. Reduced motion: every animation honours prefers-reduced-motion / the OS flag with a static end-state.
5. Forms: labels, error association, focus order.
Produce docs/accessibility-review.md, tiered (1 real failure, 2 should, 3 polish), each with what, where
(file:line), the standard it breaks, and the fix. Filter intentional choices. Keep it 100.
```

### 4. Copy / microcopy (7-lens)
```
Run a 7-lens adversarial copy and microcopy audit on [APP]. Lenses: clarity, consistency, tone, register,
microcopy (buttons, errors, empty states), i18n-readiness (string assembly that breaks translation), and
punctuation. Re-check each finding with a skeptic so intentional choices survive. Produce
docs/copy-review.md with:
1. The voice in one line, inferred from the best existing copy.
2. A terminology glossary: one canonical term per concept, every deviating site (file:line).
3. Mechanical fixes, safe to apply: current then suggested, with file:line.
4. Voice and naming calls, tiered, left for you to decide, each with the trade-off.
Pay special attention to any raw system or platform error string that can leak onto a user-facing screen,
and to the highest-anxiety surfaces. Keep it 100.
```

### 5. Case-study / story
```
Act as a senior hiring PM reviewing [APP] as a portfolio piece, then sharpen its story. Read the code,
the README, and any existing case-study. Write docs/case-study.md answering crisply: what problem it
solves and for whom, the key product decisions and their trade-offs (what was chosen AND what was
deliberately not built), how it works at a glance, what it demonstrably signals about the builder, and
the honest limitations. Then a separate short list: the 5 things a hiring PM would probe or doubt, and
how the story should preempt each. No marketing voice, no praise of me. Keep it 100.
```

### 6. Design / UI drift (8-lens)
```
Run an 8-lens code-level design audit on [APP]. Lenses: colour (including dark-mode contrast on the
most-used buttons), type scale (splintered size literals), spacing, component duplication (copy-pasted
primitives that drifted), responsive (uncapped widths, small screens), accessibility, motion, and brand
consistency. Re-check each finding against the code with a second pass. Produce docs/design-review.md:
open with the read and the 3 highest-leverage moves (usually a token or shared component that dissolves
many items), then a stack-ranked burn-down order (live defects first, then high-leverage tokens and
components, then polish, then judgment calls), each tiered with file:line and the fix. Keep it 100.
```

### 7. Translation review
```
Run a translation-quality review on [APP], for each non-English locale it ships. Read the actual
translation files and assess as a native speaker would: natural or machine-translated, are the domain
terms correct, is the register consistent with the English, do strings overflow or break from variable
assembly. Produce docs/translations-review.md: a per-locale verdict (natural, acceptable, or visibly
machine), the specific wrong lines with suggested fixes, and a priority order. Flag any locale poor
enough to undermine trust. Note which locales still want a human native pass. Do not rubber-stamp.
```

### 8. Cost across scales
```
Model [APP]'s running cost at 100, 1k, 10k, and 100k monthly active users. State the assumptions
(requests per user, payload sizes, storage growth, any per-call paid API), give a per-tier monthly figure
and the dominant cost driver at each tier, and name the first thing that breaks or blows the budget as it
scales. Produce docs/cost-analysis.md. Honest ranges, not false precision.
```

### 9. Testing posture + manual E2E suite
```
Review [APP]'s test posture and produce two things. One: docs/testing.md, a risk-targeted strategy stating
what is worth unit-testing (the pure logic, the money math, the date/time math, any integrity chain) and
what is deliberately not tested and why. Two: docs/qa/e2e-test-suite.md, a manual launch-gate suite of
concrete cases (steps, expected result, P1/P2/P3, prerequisites) covering every user-facing flow. Flag the
highest-risk untested paths. Keep it 100.
```

### 10. Commercialisation (if you take money)
```
Run a commercialisation pass on [APP]: the pricing, the free-to-paid funnel, what is free vs paid and why,
the churn risks, and a realistic go-to-market. Into docs/commercialisation.md. Be honest about the weakest
link and what would actually have to be true for this to make money.
```

### 11. Store-readiness (if shipping to an app store)
```
Assess [APP] for [Play Store / App Store] submission. You MUST verify CURRENT store policies by web search
(these change often): the account / closed-testing rules, any generative-AI content policy, the target API
level, and external-payment rules. Then give the Data Safety / privacy-nutrition form answers cross-checked
line-by-line against the public privacy policy (a mismatch is an automatic rejection), and the store listing
(name, short and full description, screenshots shot-list, category). Produce docs/store-submission-pack.md
with a prioritized blockers list and a realistic timeline.
```

### 12. The control centre (if live + commercial)
```
Design a launch control centre for [APP]: an hourly health sweep that emails the owner only on breach
(spend vs a cap, an error spike, signs of abuse), a daily pulse, a dead-man's-switch heartbeat, and
money-event alerts (disputes, refunds, failed payments). Fail-open (a monitoring failure must never break
the app), privacy-poor by construction (no user content in alerts). Produce the implementation plus a
docs/operations.md runbook.
```

---

## The app-ready gate checklist

Before you call a launch done:

```
[ ] 0. Secrets + PII scan clean (working tree AND git history)
[ ] 1. Completeness review run, Tier-1 gaps closed
[ ] 2. Robustness + security review run, Critical/High closed
[ ] 3. Accessibility review run, real failures closed
[ ] 4. Copy review run, mechanical fixes applied
[ ] 5. Case-study written and honest
[ ] 6. (if visual) Design drift review run
[ ] 7. (if localized) Translation review run
[ ] (if commercial) Store-readiness + control centre in place
```

*Fork it, argue with it, delete the parts that don't fit. Make it yours. MIT.*

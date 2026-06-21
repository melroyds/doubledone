# Testing strategy

> Not a coverage-percentage game. A *risk-targeted* suite that defends the parts of the
> system that would actually hurt users if they broke.

## What we test, and why
Each row is here because a silent regression would cause user-visible harm. The cost of the
test is small; the cost of *not* having it is paid by a real user.

| Module | Why it's tested | Risk if it breaks |
|---|---|---|
| `lib/<time-math>` | DST / midnight-wrap / multi-day | wrong deadline shown to the user |
| `lib/<storage>` | quota recovery / eviction order | a "saved" thing silently vanishes |
| `lib/<distance>` | geo / ETA math | user sent to the wrong place |
| `lib/<api-client>` | request contract to your backend/AI | malformed request, wrong error code |
| `<ai-prompt>` | a regression test per shipped prompt fix | a fixed bug silently returns |

## What we deliberately DON'T test
- Component rendering details / snapshots, low signal, high churn.
- Live API / model calls, flaky, slow, costly. Mock the SDK; assert the request *shape*.
- Trivial getters, coverage-chasing is anti-portfolio.

## Running
```bash
npm test               # one-shot
npm run test:watch     # TDD mode
npm run test:coverage  # HTML report at coverage/index.html
```
CI runs `npm test` on every push (`.github/workflows/ci.yml`); the README badge reflects it.

## Manual end-to-end suite
The automated tests cover logic and the AI request contract. The things only a human on real devices and a real account can verify (sign-in, sync, account deletion, the MCP round-trip and the REST API, on-device fonts and reminders, the scrapbook, and the tap-driven seam flows like Make-it-tiny and Routines) live in a fillable suite at [`qa/`](qa): 104 cases tagged P1/P2/P3, generated from [`scripts/gen-test-suite.py`](../scripts/gen-test-suite.py). Every new user-facing feature adds its case there (a project rule in [`CLAUDE.md`](../CLAUDE.md)).

## Layout
Tests live next to source as `*.test.ts`. Co-location is deliberate: refactor `thing.ts` and
its test shows up in the same diff, one keystroke away.

## Philosophy in one paragraph
A test suite is a promise to future-you: *"if you change this, you'll be told if you broke a
thing the user cares about."* Anything more is overhead; anything less is theatre. Size it
to "the failure modes a senior engineer would worry about, plus a green CI badge."

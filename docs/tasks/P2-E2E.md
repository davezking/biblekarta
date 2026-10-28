---
id: P2-E2E
title: Phase 2 E2E tests
repo: site
phase: 2
sprint: 4
model: sonnet
review: auto
depends_on: [P2-S1-T1, P2-S1-T2, P2-S1-T3, P2-S1-T4, P2-S1-T5, P2-S2-T1, P2-S2-T2, P2-S2-T3, P2-S2-T4, P2-S2-T5, P2-S2-T6, P2-S3-T1, P2-S3-T2, P2-S3-T3, P2-S3-T4, P2-S3-T5, P2-S3-T6, P2-S3-T7, P2-S4-T1, P2-S4-T2, P2-S4-T3, P2-SEED]
parallel_group: S4-D
files: [e2e/phase-2/]
---

## Why this model / review tier
- **Model:** browser tests that follow a written script.
- **Review:** `auto`. The phase Opus review follows anyway.

## Context
- The demo script is `docs/phases/phase-2-demo.md`. **Write one test per demo step** (9 steps).
- Playwright runs `pnpm build && pnpm preview` with `BK_SEED=1`. There are two projects, `desktop` (1440×900) and `mobile` (Pixel 7) (`playwright.config.ts`). `e2e.yml` already runs `pnpm e2e` on PRs into `phase-*`.
- Scripture is the fixture book in forks, and the real 1–2 Kings when `SCRIPTURE_TOKEN` is present (`BK_SCRIPTURE=real`). **Never put Bible text in a test.** Compare the DOM with `wordSeparators(t)` computed from the served JSON at test time, as `e2e/phase-1/scripture-viewer.spec.ts` does.
- The performance check for step 3 already exists as `pnpm perf` (P2-S3-T7). Here, step 3 checks that the gestures work on mobile, not the frame times.

## Do this
1. In `e2e/phase-2/`, one spec per step:
   1. `chart-renders.spec.ts`: the vellum, the harag bands, the red title, the 9 streams in lane order, and the fork at 931.
   2. `zoom-ticks.spec.ts`: wheel-zoom on 850 BC → the year-level ticks, Ge'ez on top and Arabic on the bottom; a short reign gains its label.
   3. `mobile-gestures.spec.ts` (mobile project): pinch and swipe change the view horizontally, and a vertical swipe scrolls the page.
   4. `anchors.spec.ts`: lines at 853 and 841; tapping shows the label and source.
   5. `panel-dates.spec.ts`: tap Ahab → red outline; a side panel on desktop and a sheet on mobile; both date rows, the certainty chip, the How-known text.
   6. `verses.spec.ts`: a verified-book ref shows text equal to `wordSeparators(t)` with no ፡ next to punctuation; an unverified-book ref shows the not-ready message with no request for that book.
   7. `axis-switch.spec.ts`: traditional shows the undated count and keeps the selection; switching back restores the exact URL view.
   8. `minimap-lanes.spec.ts`: dragging the minimap window pans; hiding Assyria removes its lane.
   9. `share-url.spec.ts`: a copied URL restores the state in a new page; `/p/ahab/` opens focused with the panel; the raw HTML contains Ahab's name and dates.
2. **`e2e/phase-2/README.md`:** map each demo step to its spec.

## Acceptance criteria
- Every step in `docs/phases/phase-2-demo.md` has a passing test in both projects (or is marked mobile-only or desktop-only in the README, with the reason).
- The suite passes in CI (`e2e.yml`) on the `phase-2` branch.
- No Bible text appears in any spec or fixture.

## Tests to write or update
- The nine specs and the README above.

## How to test manually
1. Run `BK_SEED=1 pnpm e2e --grep phase-2` → all pass on desktop and mobile.

---
id: P1-E2E
title: Phase 1 E2E (site Playwright + scripture pipeline golden test)
repo: site + scripture
phase: 1
sprint: 3
model: sonnet
review: auto
depends_on: [P1-S1-T1, P1-S1-T2, P1-S1-T3, P1-S1-T4, P1-S1-T5, P1-S1-T6, P1-S1-T7, P1-S2-T1, P1-S2-T2, P1-S2-T3, P1-S2-T4, P1-S2-T5, P1-S2-T6, P1-S3-T1, P1-S3-T2, P1-S3-T3, P1-S3-T4, P1-S3-T5, P1-S3-T6, P1-S3-T7, P1-SEED]
parallel_group: S3-F
files: [e2e/phase-1/, playwright.config.ts, ../biblekarta-scripture/tools/tests/test_pipeline_e2e.py, ../biblekarta-scripture/tools/tests/fixtures/pipeline/]
---

## Why this model / review tier
- **Model:** browser tests plus a cross-tool pipeline test.
- **Review:** `auto`. The phase Opus review follows anyway.

## Context
- The demo script is `docs/phases/phase-1-demo.md`. **Write one test per demo step.**
- This task spans both repos: open one PR in each, and link them to each other.
- The site runs via `pnpm build && pnpm preview` with `BK_SEED=1`. Scripture comes from fixtures in CI forks, and from the real repo when `SCRIPTURE_TOKEN` exists.
- Playwright's Chromium is installed once locally (`pnpm exec playwright install chromium`); CI installs it in `e2e.yml`.

## Do this
1. **Site (`e2e/phase-1/`):**
   - `playground.spec.ts`: Ge'ez 950 → ፱፻፶; date −852 → "853 ዓ.ዓ."; ሐዋርያት → ሀዋርያት. (demo step 1)
   - `scripture-viewer.spec.ts`: `/dev/scripture/<book>/` renders chapters with Ge'ez numbers. For 3 verses, `textContent === wordSeparators(t)` from the JSON, and no ፡ appears next to ። ፣ ፤ ፥ ? !. Use the real book when `BK_SCRIPTURE=real`, otherwise the fixture book. (demo steps 6–7)
   - `prod-excludes-dev.spec.ts`: a production-style build has no `/dev/` routes, and refuses fixture scripture. (demo step 8)
   - `e2e/phase-1/README.md`: map each demo step to its test.
2. **Scripture repo (`tools/tests/test_pipeline_e2e.py`).** A golden pipeline test on a small real fixture: 3 chapters of HTML in `tools/tests/fixtures/pipeline/`, chosen to include an empty verse, a stray marker, a footnote and a merged verse. It runs:
   1. parse → clean (`--verify-reversible`) → flag (expected flags) → sample → workbook export
   2. programmatically fill the yellow cells with openpyxl (one Fix reviewed by a second name; one Fix unreviewed; one Split; a confirmed versification row)
   3. apply → finalize → verify

   Assert the final JSON, the checksums, the pending count, the split numbering, and that no ፡ is in the stored text. (demo steps 2–5)
3. Make sure `e2e.yml` (site) runs `pnpm e2e`, and the scripture repo's `ci.yml` runs pytest including this test.

## Acceptance criteria
- Every step in `docs/phases/phase-1-demo.md` has a passing test, mapped in the README.
- Both suites pass in their repos' CI.

## Tests to write or update
- The specs and the pipeline test above.

## How to test manually
1. Site: `pnpm e2e --grep phase-1` → all pass.
2. Scripture: `uv run --project tools pytest tools/tests/test_pipeline_e2e.py -q` → it passes.

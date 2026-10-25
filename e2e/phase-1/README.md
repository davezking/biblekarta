# Phase 1 end-to-end tests

One test per step of [`docs/phases/phase-1-demo.md`](../../docs/phases/phase-1-demo.md). The
browser tests are here (Playwright, `pnpm e2e --grep phase-1`, preview-style with `BK_SEED=1`).
The scripture pipeline runs in the private `biblekarta-scripture` repo
(`uv run --project tools pytest tools/tests/test_pipeline_e2e.py -q`); it uses three real
chapters, so it can't live in this public repo.

| Demo step | What it shows | Test |
|---|---|---|
| 1 | Playground: Ge'ez 950 → ፱፻፶, −852 → "853 ዓ.ዓ.", ሐዋርያት → ሀዋርያት | `e2e/phase-1/playground.spec.ts` |
| 2 | `bk parse` → `bk clean` → `bk clean --verify-reversible` | scripture `test_pipeline_e2e.py` (parse, clean, reversible); the full-Bible totals and the 17,595 count: `test_parse.py`, `test_clean.py` |
| 3 | `bk flag` → the round-1 breakdown | scripture `test_pipeline_e2e.py` (expected flags); the 436-row oracle: `test_flag.py` |
| 4 | `bk sample draw` → `bk workbook export` → the sheets | scripture `test_pipeline_e2e.py` (sample, export, sheet names, Spot check and Versification rows) |
| 5 | Filled rows → `bk apply`: unreviewed Fix pending, split numbering, ፡ rejected | scripture `test_pipeline_e2e.py` (fill with openpyxl, ፡ rejection, pending row, 3 John 1:14 → 14–15) |
| 6 | `bk finalize` → `bk verify` → a changed letter is named → `finalize` refuses an open book | scripture `test_pipeline_e2e.py` (golden book files, checksums, counts, tamper, refusal reasons, idempotence) |
| 7 | `/dev/scripture/<book>/`: red headings, Ge'ez numbers, Abyssinica, ፡ between words, none next to punctuation; separator samples | `e2e/phase-1/scripture-viewer.spec.ts` |
| 8 | `reports/verification.md`: books verified, progress per issue type, spot check, blockers | scripture `test_pipeline_e2e.py` (report after finalize); the tables: `test_report.py` |
| 9 | Production: no `/dev/` pages, no fixture text | `e2e/phase-1/prod-excludes-dev.spec.ts` (refuses fixture scripture; no `/dev/`, no seed) |

The viewer test uses the real text when the build has it (`BK_SCRIPTURE=real`, after
`scripts/fetch-scripture.sh` with `SCRIPTURE_TOKEN`): 1 Kings once it is verified, otherwise
the first verified book. Without the token it uses the fixture test book.

In CI, `.github/workflows/e2e.yml` runs these specs on every PR into `main` or `phase-*` and on
pushes to them (fork PRs use the fixture book). The scripture pipeline test runs in that repo's
`ci.yml` with the rest of its pytest suite.

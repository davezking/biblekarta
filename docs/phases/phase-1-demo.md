# Phase 1 demo: Foundation & verified scripture pipeline

**Preview URL:** _(fill in: https://phase-1.biblekarta.pages.dev)_
**Release tag:** v0.1-phase1 (site) · text-v1 (scripture)

## What's new in this phase
The Society's HTML Bible has been imported in full: 66 books, 1,189 chapters and 31,102 verses. It's been cleaned automatically, with every change logged and reversible, and the 436 problem verses are flagged in the same Excel workbook format the proofreaders already use. That workbook now also has a random spot-check, the anchor verses and a verse-numbering sheet. Corrections from the filled workbook are applied only after a second person reviews them. Finished books are frozen with checksums and appear on a preview page in the brana fonts, with ፡ between words. A report shows what's left before every book is verified.

## Demo script
1. Open `<preview>/dev/playground/`. Ge'ez 950 → ፱፻፶; date −852 → "853 ዓ.ዓ."; normalizer ሐዋርያት → ሀዋርያት. (FR-25, DR-7)
2. In `biblekarta-scripture`, run `uv run --project tools bk parse` → "66 books · 1189 chapters · 31102 verses". Then `bk clean` → "strip_leading_artifact: 17595". Then `bk clean --verify-reversible` → OK. (PRD §5.4 parsing, automatic cleaning)
3. Run `bk flag` → 436 flags, with the same breakdown as your round-1 workbook's Summary sheet. (PRD §5.4 targeted proofreading)
4. Run `bk sample draw --round 1`, then `bk workbook export --round 1`, and open `rounds/round-1.xlsx` → your familiar sheets, plus "Spot check" (~3% of the other verses) and "Versification" (Job 40, Ps 14, Song 7 and chapters to check). (PRD: spot-check 2–5%, versification mapping)
5. Fill in a few rows: a Fix reviewed by a second name, a Fix with no reviewer, and the Job 40:24 split. Run `bk apply --round 1 …` → the unreviewed row is pending, and the split becomes verses 24–32. Typing ፡ in a correction is rejected. (PRD: a second person reviews every changed verse)
6. Run `bk finalize --book 1ki`, then `bk verify` → OK. Change a letter in `scripture/books/1ki.json` → `bk verify` names the verse. Revert. Try `bk finalize --book jer` → refused, listing its open rows. (PRD: integrity, CI checksum test)
7. Open `<preview>/dev/scripture/1ki/` on a phone → red chapter headings, Ge'ez verse numbers, Abyssinica SIL, ፡ between words and none next to ፤ or ።. Open `/dev/scripture/separator-samples` next to the scan pages → the separators match the print, or note the differences for the reviewer. (FR-17, DR-2, R5)
8. Open `reports/verification.md` → books verified / 66, progress per issue type, spot-check error rates, and the blockers per book. (PRD risk #13)
9. Open the production URL → only the "under construction" page, with no `/dev/` pages and no fixture text. (Architecture §8)

## Known limitations
- There's no chart yet; that's Phase 2.
- `/dev/*` pages are preview-only proofing tools, not public features.
- Only verified books appear. The rest show "በዝግጅት ላይ" until their workbook rows are done.
- The ፡ rule shows a "pending review" badge until the reviewer approves it against the scan.
- Edition footnotes are stored but not shown (R6).
- The traditional-axis label "ከፍጥረት" is a placeholder (PRD risk #3).

## How to give feedback
Open a GitHub issue in `biblekarta` with the **Feedback** template (it's a public repo, so don't paste verse text), then run `/triage-feedback`. Scripture-text problems go in the next workbook round, not in issues.

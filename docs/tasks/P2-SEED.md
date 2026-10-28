---
id: P2-SEED
title: "Seed: fill every Phase 2 demo step"
repo: site
phase: 2
sprint: 4
model: haiku
review: auto
depends_on: [P2-S4-T3]
parallel_group: S4-C
files: [seed/, src/build/validate-content.test.ts]
---

## Why this model / review tier
- **Model:** transcribing values that already exist in the mockup, and checking the demo against the data.
- **Review:** `auto`.

## Context
- `seed/` (P1-SEED) already holds the Board 5 dataset: 9 streams, the kings and reigns, the prophets, the neighbours, 6 events, 2 anchors, 6 relationships and the `divided-kingdom` era. Every file has `"fixture": true`.
- **Rule (`CLAUDE.md`): never invent biblical data: no dates, reign lengths, names, references or verse text.** Unknown traditional dates use `method: "relative"`, `relative_text_am: "TBD"`. Only transcribe what is in `design-reference/board5-desktop.html`, or ask the owner.
- The demo script is `docs/phases/phase-2-demo.md`. Every step must have the data it needs.

## Do this
1. **Walk through the demo steps** on a seeded build and list what each needs. At least:
   - step 1: all 9 streams;
   - step 2: short reigns around 850 BC;
   - step 4: both anchors;
   - step 5: Ahab's dates and method;
   - step 6: one ref in a verified book (1–2 Kings) **and one ref in a book that isn't verified**;
   - step 8: the coming-soon eras in the minimap.
2. **Coming-soon eras:** add the eras from the Board 5 minimap, transcribed exactly in `order`: ፍጥረት, አባቶች, ዘፀአት, መሳፍንት, የነገሥታት ዘመን (the existing live `divided-kingdom`), ምርኮ, በኪዳናት መካከል, ወንጌላት, ሐዋርያት.
   - `status: "coming_soon"`, **no dates**, plain English names (Creation, Patriarchs, Exodus, Judges, Exile, Intertestamental, Gospels, Apostles).
   - Renumber `order` so `divided-kingdom` stays fifth.
3. **Fill the gaps** with values from the mockup only: the labels, Amharic names and years it prints. Examples: Elisha's approximate dates (848–797), Hazael c. 842, Shalmaneser III 859–824, and the refs printed there (1ki 16:31, 1ki 22, 1ki 14:25, 1ki 10).
4. **The step 6 unverified-book ref:** if no Board 5 item prints a reference outside 1–2 Kings, **stop and ask the owner** for one real reference to add (say which item it belongs to). Don't make one up.
5. Mark anything you couldn't fill in the PR, under "Demo gaps".

## Acceptance criteria
- `pnpm seed:check` passes, and every seed file has `"fixture": true`.
- No `*_traditional` date uses any method other than `relative`.
- Every value added can be pointed to in `board5-desktop.html` (cite it in the PR), or was given by the owner.
- Each demo step in `phase-2-demo.md` can be performed on the seeded preview.

## Tests to write or update
- Extend `validate-content.test.ts`: coming-soon eras have no dates, and the era `order`s are unique and contiguous.

## How to test manually
1. Run `pnpm seed:check` → 0 errors.
2. On the seeded preview, walk through `docs/phases/phase-2-demo.md` → every step has data (the minimap shows all nine eras, with eight of them coming soon).

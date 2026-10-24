---
id: P1-SEED
title: "Seed: Board 5 dataset"
repo: site
phase: 1
sprint: 3
model: haiku
review: auto
depends_on: [P1-S1-T2, P1-S3-T7]
parallel_group: S3-E
files: [seed/, package.json, src/build/validate-content.test.ts]
---

## Why this model / review tier
- **Model:** transcribing values that already exist in a reference file.
- **Review:** `auto`.

## Context
- Previews build with `BK_SEED=1`, and from Phase 2 the compiler overlays `seed/` onto `content/`.
- `design-reference/board5-desktop.html` is the approved mockup of about 1000–800 BC.
- **Rule (`CLAUDE.md`): seed data never contains invented verse text, dates or names.**
- References use the **scan's numbering**. For the 1–2 Kings refs below, the HTML and scan numbering are expected to match; if `scripture/versification.json` maps any of them, use the scan reference.

## Do this
1. **Create JSON files** in `seed/<collection>/`, every one with `"fixture": true`, **transcribing only what's in Board 5**:
   - **Streams and colors:** United Kingdom #9DB28A; Israel #E2B54F (fork 931 BC); Judah #DE9479 (fork 931 BC); Prophets ribbon #D8DFC0; Sidon #D9C39A; Ethiopia #8FB0C4; Aram #B7B9C9; Egypt #DCC08A; Assyria #93A487.
   - **Kings and reigns,** with the scholarly years and the Amharic names exactly as in the mockup:
     - David (… –970), Solomon 970–931
     - Israel: Jeroboam 931–910, Baasha (ባኦስ) 909–886, Omri (ዘንበሪ) 885–874, Ahab 874–853, Jehoram 852–841, Jehu 841–814, Jehoahaz 814–798
     - Judah: Rehoboam 931–913, Asa 911–870, Jehoshaphat 870–848, Jehoram (Judah), Athaliah, Joash 835–796
   - **Prophets:** Ahijah, Elijah, Elisha (approximate, 848–797).
   - **Neighbors:** Ethbaal (Sidon); Ben-Hadad and Hazael (Aram, c. 842); Shalmaneser III (859–824); Shishak.
   - **Events:** the temple c. 966, the split in 931, Shishak's invasion in 925, Qarqar in 853, Jehu's tribute in 841, and the Queen of Sheba's visit (approximate).
   - **Anchors:** Qarqar 853 (Kurkh Monolith) and Jehu's tribute 841 (Black Obelisk).
   - **Relationships:** Ethbaal parent of Jezebel; Ahab married Jezebel; Jehoshaphat allied with Ahab; Athaliah married Jehoram (Judah); Shishak war against Judah; the Queen of Sheba visited Solomon (`allied`, with the label from the mockup). Jezebel is a person with `importance: 3` and relative TBD dates.
   - **Refs as printed:** 1ki 16:29, 1ki 16:31, 1ki 22, 2ki 8:18, 1ki 14:25, 1ki 10.
   - **Traditional dates:** `method: "relative"`, `relative_text_am: "TBD"`. **Never invent traditional years.**
   - **One era:** `divided-kingdom`, live, from 1000 BC to 800 BC (astronomical −999 to −799), certainty `anchored`.
2. **`pnpm seed:check`** = `pnpm validate --dir seed`.

## Acceptance criteria
- `pnpm seed:check` passes, and every file has `"fixture": true`.
- No `*_traditional` date in `seed/` uses any method other than `relative`.

## Tests to write or update
- Extend `validate-content.test.ts` with "all seed files are fixtures, and no traditional years appear in seed".

## How to test manually
1. Run `pnpm seed:check` → 0 errors.
2. Open `seed/people/ahab.json` → 874–853 scholarly, the traditional date as TBD, and ref 1ki 16:29.

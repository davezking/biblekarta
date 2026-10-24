# Phase 3 demo: Editors & relationships

**Preview URL:** _(fill in: https://phase-3.biblekarta.pages.dev)_
**Release tag:** v0.3-phase3

## What's new in this phase
Editors can now add and correct people, events, dates and relationships in a web admin, without code. Every change needs a second person's approval before it reaches the public site, and an anchor correction flags every date derived from it. On the chart, selecting a person draws their family, marriages, alliances and wars as labeled lines with verse references. A relationship map shows the whole family at a glance.

## Demo script
1. Open `<preview>/admin/` and log in with GitHub → the Amharic-labeled collections appear. (FR-28)
2. Add a test king with a reign, two references and a marriage, then save and move it to "In review" → a PR appears, with its own preview URL commented by Cloudflare. (FR-29)
3. Open that CMS preview → the new king is on the chart. Validation errors, if any, are posted on the PR in Amharic. (FR-28)
4. Try to Publish without a second approval → GitHub refuses the merge (a code-owner review is required). Approve it from a second GitHub account, then Publish → `main` updates and production follows. (FR-29)
5. Change the Qarqar anchor from 853 to 854 in a PR → CI lists every dependent date and fails until they're re-confirmed. (FR-24)
6. On the chart, tap Ahab → the connectors appear: a double line to Jezebel, a red dashed line to Jehoshaphat, labels with references, and the unrelated items dimmed. (FR-11, FR-12, DR-8)
7. Select a person whose relative is off-screen → an edge chip shows the name. Tap it → the chart pans to that person. (PRD edge case)
8. In the panel, view the relationship list → grouped rows with mini figures. Tap "የግንኙነት ካርታ" → the family map, with parents above, spouses beside and allies below. (FR-13, FR-14)
9. Import the sample CSV with `pnpm import:csv --type people --file docs/import-templates/people.csv --dry-run` → a per-row report, and nothing is written. (Architecture R8)

## Known limitations
- This is a public repo, so editors' draft PRs and their GitHub names are visible (Architecture R8).
- Search, the English UI, offline use and share images come in Phase 4.
- The NT lanes come in Phase 5.

## How to give feedback
Open a GitHub issue using the **Feedback** template, then run `/triage-feedback`. For content-editor usability, ask a real editor to try steps 1–3 and note where they got stuck.

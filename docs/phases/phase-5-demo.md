# Phase 5 demo: New Testament, hardening & launch

**Preview URL:** _(fill in: https://phase-5.biblekarta.pages.dev)_
**Release tag:** v0.5-phase5 (production launch on biblekarta.com)

## What's new in this phase
The chart now runs from creation to about AD 100, adding the Life of Christ, the Apostles, and the Herodian and Roman rulers. Icon-style figures of Christ and the apostles appear only once the church reviewer has approved each design. The site has passed performance, accessibility and security checks. It has been used by beta testers, and it's ready to go live on biblekarta.com.

## Demo script
0. Open `reports/verification.md` in the scripture repo → 66/66 books verified, and `scripture.lock` points at the final `text-v<N>` tag. (PRD integrity)
1. Open the minimap → every era from ፍጥረት to ሐዋርያት in order. Unpopulated ones show "በቅርቡ". (PRD rollout)
2. Zoom to 4 BC–AD 30 → the NT lanes are readable, and the year labels cross correctly (… 1 ዓ.ዓ., 1 ዓ.ም. …). Anchor lines mark Pilate and the 15th year of Tiberius. (FR-6, FR-23)
3. Look at the NT figures in production → halo-only roundels until they're approved. On a preview with the approval flag on → the icon-style figures. (DR-9, PRD risk #2)
4. Open the intertestamental period → only context streams, with the explanation note. (PRD edge case)
5. Open `/admin/qa/` → the content-QA report with missing dates and references, linking to the CMS entries. (Architecture R8)
6. Block the tile requests in devtools → an inline lane message with retry. Open a bad URL → the brana 404 page. (PRD error handling)
7. Run `curl -I` on the preview → the CSP, HSTS and other headers are present. (Security)
8. With `PUBLIC_BETA=true`, check the banner and feedback link → it opens the feedback form, with the item id pre-filled from the panel. (PRD rollout)
9. Open biblekarta.com after launch → the production site, with no beta banner. The sitemap lists both locales. (PRD launch)

## Known limitations
- The 81-canon books, journey maps and poster export are Phase 6 (in the backlog).
- Content coverage depends on editors. The launch includes the importance 4–5 items (PRD risk #10).

## How to give feedback
During the beta: testers use the in-app feedback link. You: open a GitHub issue using the **Feedback** template and run `/triage-feedback`.

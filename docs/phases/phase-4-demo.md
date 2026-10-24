# Phase 4 demo: Search, language & offline

**Preview URL:** _(fill in: https://phase-4.biblekarta.pages.dev)_
**Release tag:** v0.4-phase4

## What's new in this phase
Readers can search in Amharic or English, with any spelling of the look-alike letters, and jump straight to a person. The interface switches to English while scripture stays in Amharic. A plain list view serves screen-reader users. The site keeps working offline for eras you've visited, and shared links show a branded preview image.

## Demo script
1. Type ኤል in the search box → ኤልያስ and ኤልሳዕ are suggested. Type ሀዋርያት and then ሐዋርያት → the same results. Type "ahab" → አክዓብ. (FR-25)
2. Choose a result → the chart pans and zooms to it, and its panel opens. (FR-26)
3. Open the era overview from the toolbar → the era cards with ranges and certainty labels. (FR-8)
4. Tap "አማ / EN" → the UI labels turn English, the verse text stays Amharic, and the URL moves to `/en/…`. (FR-27)
5. Open `/list/` with VoiceOver or NVDA → eras, streams and people under proper headings, each linking to the item page. (DR-13)
6. Tab into the chart and use the arrow keys to reach Ahab, then press Enter → his panel opens. (DR-13)
7. Visit an era, open two verses, go offline in devtools, and reload → the chart, that era and those verses still work. (PRD offline/PWA)
8. Paste `/p/ahab/` into Telegram or another link-preview checker → the preview card shows the figure, name and dates. (FR-10 sharing)
9. Share from the panel on a phone → the native share sheet opens. On desktop → "ሊንኩ ተቀድቷል". (Teacher persona)
10. Check the Lighthouse report in the CI artifacts → mobile LCP ≤ 3 s and accessibility ≥ 95. (Metrics: LCP)

## Known limitations
- Content beyond the demo eras depends on editor progress.
- The NT lanes and figures come in Phase 5.
- Analytics events only show after the production deploy.

## How to give feedback
Open a GitHub issue using the **Feedback** template, then run `/triage-feedback`.

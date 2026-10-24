# Phase 2 demo: Chart slice (the Divided Kingdom)

**Preview URL:** _(fill in: https://phase-2.biblekarta.pages.dev)_
**Release tag:** v0.2-phase2

## What's new in this phase
The approved Board 5 design is now a working chart. The era from David to Jehu flows as brana-style streams:
- the United Kingdom splits into Israel and Judah
- the prophets run in their own ribbon
- the neighboring nations appear alongside
- anchor dates are marked with red dashed lines

You can zoom from the whole era down to single years, switch between the scholarly and traditional axes, and tap any king to see both dates, how each date is known, and the exact verses for any book that has been verified, with ፡ between words as printed. Every person and event has its own shareable page.

## Demo script
1. Open the preview on a desktop → the vellum page, harag bands and red title, with the streams as in Board 5: the UK fork at 931, Israel above and Judah below, prophets on top, and Sidon, Ethiopia, Aram, Egypt and Assyria. (FR-1, FR-2, FR-5, DR-1…DR-6)
2. Scroll-zoom in on 850 BC → the ticks go from decades to single years, and short reigns gain labels as space allows. Ge'ez numerals are on top and Arabic on the bottom. (FR-4, FR-6, DR-7)
3. On a phone, pinch-zoom and swipe → the same scroll-like chart, smooth with no jank. (DR-12, NFR 60 fps)
4. Find the red dashed lines at 853 and 841 → tapping one shows "Qarqar — Kurkh Monolith" and "Jehu's tribute — Black Obelisk". (FR-23)
5. Tap Ahab → he's outlined in red, and a side panel opens (a bottom sheet on a phone). It shows his figure, "874–853 ዓ.ዓ." with a certainty chip, the traditional row ("TBD" via relative), and "እንዴት ታወቀ?", which explains the method. (FR-21, FR-22, DR-9)
6. In the panel, tap a reference from a verified book (1–2 Kings) → the exact verse text in Abyssinica, with ፡ between words, in the scan's verse numbering. A reference from a book not yet verified shows "ይህ መጽሐፍ በዝግጅት ላይ ነው". (FR-15, FR-16, FR-17)
7. Switch to ትውፊታዊ (traditional) → the view keeps Ahab in place, and items with no traditional date are counted, not shown. Switch back → you're at the same view. (FR-20)
8. Drag the minimap window → the chart pans. Hide Assyria in the lanes menu → the lanes below move up. (FR-7, FR-9)
9. Copy the URL, then open it in a new tab → you're at the same position, zoom and selection. Open `/p/ahab/` directly → the panel opens with the chart focused, and view-source shows Ahab's name and dates. (FR-10)

## Known limitations
- Only the Divided Kingdom era has data. Other eras show "coming soon" in the minimap.
- Traditional dates are "TBD" in the demo data until they're sourced (PRD risk #5).
- There's no relationship lines, search, CMS, English UI or offline support yet (Phases 3–4).
- The demo data is transcribed from the mockup and marked as a fixture. It isn't real content.

## How to give feedback
Open a GitHub issue using the **Feedback** template, attaching a screenshot and the URL (it includes the view position). Then run `/triage-feedback`. Also share the preview link with the church reviewer for comments on the design and naming conventions.

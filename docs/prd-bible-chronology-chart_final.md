# Ethiopian Bible Chronological Chart (Web App) — PRD

**Status:** In Review (v5.4: base text from the Society's HTML file)
**Product name / domain:** Bible Karta (የመጽሐፍ ቅዱስ ካርታ): **biblekarta.com** _(availability to be confirmed at registration)_
**Author:** [name]
**Last updated:** 2026-10-17 (Ethiopian calendar: Tikimt 7, 2019 E.C.)

**Change log**
- **v5.4:** The Society supplied a digital HTML Bible. It is now the base text, verified against the scan. Added cleaning rules, a targeted proofreading scope, versification mapping, ፡ generation, and the anchor-verse verification. OCR is reduced to filling gaps.
- **v5:** Full rewrite. Added the approved brana-style Adams design and the Relationship and Stream data entities. Added the zero-cost hosting stack (Cloudflare Pages, Git-based CMS). Bible Society of Ethiopia approval now in writing.
- **v4:** The Bible Society approved displaying verse text, unedited.
- **v2–v3:** The MVP became the full 66-book Bible, with the 81-book canon moved to Phase 2. Added the date provenance model.

---

## 1. Problem Statement & Background

Amharic speakers have no visual, interactive way to see the whole Bible as one connected history: who ruled when, which prophets spoke to which kings, how the families connect, and how Israel's story overlaps with Egypt, Assyria, and Ethiopia.

**Prior art.** Sebastian Adams' *Synchronological Chart* (1871) solved this for English readers with a long scroll of colored "streams" for nations, flowing side by side. It is Western, English-only, and print-only. It also uses Ussher's chronology (creation = 4004 BC), which differs from the Ethiopian tradition. That tradition counts 5,500 years from creation to Christ (*Amete Alem*).

**Why dates are hard.** The Bible gives relative durations, not calendar dates. Ages, reign lengths, and "in the Nth year of king X" statements cannot be turned into absolute dates on their own. The reasons:
- The kings' reigns include coregencies and differing counting methods.
- The Judges period has overlapping, ambiguous spans.
- Septuagint and Masoretic numbers disagree.
- There is no fixed starting point.

Every date therefore needs an external anchor (e.g., Assyrian records) or a named tradition behind it.

**Product.** A free, non-profit web app that presents the whole Bible as an Adams-style chart of flowing streams, drawn in the visual language of an Ethiopian *brana* manuscript:
- **Canon:** built on the 66-book Amharic Bible, the canon shared by Orthodox and Protestant readers. Phase 2 adds the books unique to the 81-book Ethiopian Orthodox canon.
- **Dates:** every event carries two dates, the Ethiopian traditional date and the modern scholarly date.
- **Scripture:** every event opens the exact verse text, displayed unedited with the Bible Society of Ethiopia's approval.

## 2. Goals & Success Metrics

**Primary goals**
1. An Amharic speaker can see where any biblical person, event, or book fits in the whole story within seconds.
2. Relationships are visible directly on the chart: family, marriage, alliance, conflict, and succession.
3. The Ethiopian traditional chronology is a first-class system, with scholarly dates shown for comparison.
4. The product feels unmistakably Ethiopian: a digital brana, not a translated Western chart.
5. The app runs at zero recurring cost apart from a domain name.

| Metric | Target _(assumption: placeholders until baseline exists)_ |
|---|---|
| Monthly active users, 6 months post-launch | 10,000 |
| Avg. session length | ≥ 4 min |
| Share of sessions opening at least one verse or detail panel | ≥ 40% |
| Search success (search → result click) | ≥ 70% |
| Mobile LCP on 3G | ≤ 3 s |
| Monthly hosting cost | $0 (domain excluded) |

**Non-goals for these metrics:** revenue, ads, and account sign-ups. The app has no accounts and no monetization.

## 3. User Stories / Personas

**Primary persona: general Amharic-speaking reader** (Orthodox or Protestant, mostly on mobile, variable bandwidth)
- As a reader, I want to scroll through Bible history as a flowing chart, so that I see how kingdoms rise, split, and fall.
- As a reader, I want to tap a king or prophet and read the exact verses, so that I go straight from the chart to scripture.
- As a reader, I want to see who was related to whom and who allied with or opposed whom, so that the stories connect.
- As a reader, I want to search in Amharic (e.g., ዳዊት, ኤልያስ, ጳውሎስ) and jump to that point.
- As a reader, I want to see the traditional Ethiopian date next to the scholarly date, so that I know where they agree and differ.
- As a reader, I want to see where Ethiopia appears in the biblical story, such as the Queen of Sheba and the Ethiopian eunuch.

**Secondary personas**
- **Sunday-school teacher:** wants to share a link to a specific era or person to use in a lesson.
- **Diaspora reader:** wants to switch the interface labels to English while keeping the Amharic text.
- **Content editor (internal):** wants to add and correct people, events, dates, and relationships, without code, through a review workflow.

## 4. Scope & Non-Goals

**In scope (MVP)**
- **Coverage:** the full 66-book Bible, from creation through the apostolic age (~AD 100). The intertestamental period shows historical context only.
- **Chart:** Adams-style streams chart in brana design, with zoom, pan, and level of detail (Section 5.3).
- **Lanes:**
  - Kingdom streams (United Kingdom, Israel, Judah)
  - Prophets
  - Neighboring nations (Egypt, Assyria, Babylon, Persia, Greece, Rome, Aram, Sidon)
  - Ethiopia
  - NT lanes (Life of Christ, Apostles & Early Church, Herodian rulers, Roman rulers)
- **Relationships:** drawn on the chart for the selected person, plus a dedicated relationship map view.
- **Dates:** dual chronology with date provenance.
- **Panels:** person and event detail panels with verse text, references, and explanations.
- **Overview:** a whole-Bible era overview and a minimap.
- **Search & sharing:** Amharic/English search and deep links.
- **Language:** an Amharic UI, with an English UI option.
- **Offline:** offline support (PWA).
- **Content tooling:** a Git-based CMS with a review workflow.
- **Phase 2 readiness:** a canon-aware data model.

**Out of scope (MVP)**
- **81-canon books** (Enoch, Jubilees, Meqabyan 1–3, Sirach, etc.) and the 66/81 switch: Phase 2.
- **Animated journey maps** (Exodus, Paul's journeys): Phase 2, because they need separate geodata work.
- **Accounts, bookmarks, notes:** these would require auth and backend cost.
- **Continuous Bible reader / reading plans:** verses are shown only in the context of chart items.
- **Printable poster export:** Phase 2.
- **Native mobile apps:** the PWA covers mobile.
- **Church history after ~AD 100:** possible future extension.

## 5. Requirements

### 5.1 Functional Requirements: Chart & Navigation

- **FR-1** The system SHALL render the timeline as horizontal flowing streams, one per polity (kingdom, nation, or group). Time runs left to right, as in the Adams chart.
- **FR-2** Streams SHALL support:
  - **Forks:** e.g., the United Kingdom splitting into Israel and Judah in 931 BC.
  - **Merges and endings:** e.g., Israel ending in 722 BC.
  - **Variable width over time:** width represents relative power or extent, from editor-set keyframes.
- **FR-3** Each reign SHALL appear inside its kingdom's stream as a segment bounded by thin dividers, with the ruler's name and reign years lettered inside.
- **FR-4** Reigns too short to hold a label SHALL show only their dividers at the current zoom. The label appears when zoomed in, or in a tooltip on hover or long-press.
- **FR-5** The prophets SHALL appear in a ribbon above the kingdom streams. Approximate spans are drawn with a dashed outline.
- **FR-6** Users SHALL be able to zoom from the whole-Bible view down to single-year resolution, and pan horizontally. This works with mouse, trackpad, and touch (pinch/swipe).
- **FR-7** A minimap of all eras SHALL show and control the visible window.
- **FR-8** An era overview screen SHALL list all eras with their date range and a certainty label (anchored / approximate / disputed / tradition-only).
- **FR-9** Users SHALL be able to show or hide individual lanes and streams.
- **FR-10** Every chart position and every item SHALL have a shareable URL.

### 5.2 Functional Requirements: People, Relationships, Scripture, Dates

**People & relationships**
- **FR-11** Selecting a person SHALL highlight their segment and draw their relationships directly on the chart, as connector lines to the related people. Each connector is labeled and cites a verse.
- **FR-12** Relationship types SHALL include:
  - parent/child
  - marriage
  - succession
  - alliance
  - opposition/rebuke
  - war/invasion
  - prophetic ministry to

  Each type has a distinct line style (Section 5.3).
- **FR-13** A relationship map view SHALL show a selected person's family and connections as a graph, with figures and labeled lines.
- **FR-14** The detail panel SHALL list the person's relationships, each with a mini figure, the relation, the name, and the reference.

**Scripture**
- **FR-15** Each person and event SHALL list scripture references (book, chapter, verse range), shown with Amharic book names.
- **FR-16** Tapping a reference SHALL show the exact verse text in the detail panel, without leaving the chart.
- **FR-17** Verse text SHALL be displayed exactly as in the Bible Society of Ethiopia's text: no edits, rewording, or abridging. The ፡ separators between words SHALL be kept as printed. Only styling may vary.
- **FR-18** Team-written explanations SHALL be visually separated from the verse text and labeled as written by the editors.
- **FR-19** The site SHALL show a credit naming the translation and the Bible Society of Ethiopia, worded as the Society approves.

**Dual chronology & provenance**
- **FR-20** Users SHALL be able to choose the primary axis: scholarly (BC/AD) or Ethiopian traditional (counted from creation).
- **FR-21** Every detail panel SHALL show both dates and a certainty label:
  - exact
  - approximate
  - range
  - disputed
  - tradition-only
- **FR-22** Each date SHALL record its method:
  - **Anchor:** fixed by external evidence, with the source stored.
  - **Derived:** calculated from an anchor plus biblical durations, with the anchor and verses stored.
  - **Traditional:** from a named Ethiopian source.
  - **Relative only:** e.g., "40 years after the Exodus." No calendar year is shown.
- **FR-23** Anchor dates SHALL be drawn on the chart as red dashed vertical lines. The panel SHALL explain in plain Amharic how each date is known.
- **FR-24** If an anchor is corrected, all dates derived from it SHALL be flagged for editor review.

**Search & language**
- **FR-25** Search SHALL match Amharic queries regardless of fidel variant spelling. For example, ሀ/ሐ/ኀ, ሰ/ሠ, አ/ዐ, and ጸ/ፀ are treated as equivalent.
- **FR-26** Selecting a result SHALL pan and zoom to the item and open its panel.
- **FR-27** Interface labels SHALL be switchable between Amharic (default) and English. Scripture is always shown in Amharic.

**Content management**
- **FR-28** Editors SHALL be able to edit people, events, reigns, streams, relationships, anchors, and notes in a CMS, without code.
- **FR-29** Every change SHALL go through draft → review → publish. A second person must approve before anything is published.
- **FR-30** Every book, person, event, and relationship SHALL carry a `canon` tag (`shared` or `ethiopian_81`). The MVP shows only `shared` content.

### 5.3 Design Requirements (approved direction: brana-style Adams chart)

The approved mockup is listed in the Appendix. The visual language is an Ethiopian brana manuscript applied to the Adams streams format.

**Visual identity**
- **DR-1 Vellum surface.** The page background SHALL be a warm parchment tone with subtle, uneven aging and darker edges. It SHALL NOT be a flat color. The MVP uses CSS gradients. A photographed brana texture MAY replace them later _(assumption: an original photo the team takes)_.
- **DR-2 Typography.**
  - **Abyssinica SIL** (traditional Ge'ez calligraphy) SHALL be used for chart text, titles, and verse text.
  - **Noto Sans Ethiopic** SHALL be used for UI controls such as search, buttons, and toggles.
  - Both fonts SHALL be self-hosted and subsetted.
- **DR-3 Rubrication (red and black ink).**
  - Titles, stream names, notes, and highlights SHALL use red ink (#8A1A12).
  - Body text SHALL use black ink (#1E1712).
  - Manuscript text SHALL NOT use bold. Emphasis is shown with red ink, as in brana.
- **DR-4 Scribal punctuation.** Titles and captions SHALL use the word separator ፡ and the sentence end ።, following scribal practice.
- **DR-5 Harag ornament.** Interlaced harag bands (yellow ground, red and green strands, black outlines) SHALL frame the page title and the top and bottom of the chart.

**Chart drawing**
- **DR-6 Pigment palette.** Streams SHALL use flat mineral-pigment fills with black ink outlines:

| Stream | Fill |
|---|---|
| United Kingdom | green #9DB28A |
| Israel | yellow #E2B54F |
| Judah | red-ochre #DE9479 |
| Ethiopia | blue #8FB0C4 |
| Egypt | sand #DCC08A |
| Assyria | sage #93A487 |
| Aram | gray-blue #B7B9C9 |
| Sidon | tan #D9C39A |
| Prophets | pale green #D8DFC0 / #B4C795 |

- **DR-7 Axis.**
  - A decade ruling grid SHALL run across the whole chart.
  - The top axis SHALL use Ge'ez numerals (e.g., ፲፻, ፱፻፶), with half-centuries in red.
  - The bottom axis SHALL use Arabic numerals.
- **DR-8 Line styles:**
  - parent/child: solid black
  - marriage: double black line
  - alliance: red dashed
  - war/invasion: solid black with an arrowhead
  - prophetic relationships: dashed
  - anchor dates: red dashed, full height

**Figures**
- **DR-9 Figure system.** A single reusable vector figure SHALL depict people in Ethiopian painting style: large almond eyes, flat color, black outlines. The kinds are:
  - king (crown)
  - queen (crown and veil)
  - prophet (hood, beard, yellow halo)
  - **NT phase:** icon-style figures for Christ and the apostles, in Ethiopian painting style with halos. The church reviewer approves each design before release.

  Further kinds may be added as needed. Figures are symbolic, not portraits. All are drawn from one component, so a style change applies everywhere.
- **DR-10 Figure placement.** Figures SHALL appear inside streams for major rulers and prophets, in detail panels, and in the relationship map. Figures are decorative (`aria-hidden`), because names are always shown as text.

**Responsive layouts**
- **DR-11 Desktop (≥ 1024 px).** The chart SHALL fill the width under a centered title cartouche and toolbar. Selecting a person opens a detail panel or page.
- **DR-12 Mobile (< 1024 px).** The same chart SHALL scroll horizontally like a scroll and support pinch-zoom. Details open in a bottom sheet. Touch targets are ≥ 44 px. The chart is not redesigned for mobile; it is the same scroll.

**Accessibility**
- **DR-13 Accessibility.**
  - All text on pigment fills SHALL meet a contrast ratio of at least 4.5:1.
  - Stream colors that must be told apart SHALL differ in lightness, not only hue.
  - The chart SHALL have an equivalent accessible list view (eras → people → events) for screen readers.

### 5.4 Technical Requirements

**Architecture: fully static, zero recurring cost**

| Layer | Choice | Why |
|---|---|---|
| Hosting | **Cloudflare Pages (free plan)** | Unlimited static bandwidth and requests. 500 builds/month and 20,000 files per site are ample. |
| App | **Vite + React + TypeScript**, static build | The chart runs in the browser, so no server is needed. |
| Chart rendering | **SVG**, rendered per era tile, with **d3-zoom** for pan/zoom and level-of-detail rules | Crisp vector art and Ethiopic text at any zoom. Text stays selectable and accessible. |
| Figures | SVG `<symbol>` set generated from the one figure component | One definition, reused thousands of times. |
| Content | JSON files in a **private GitHub repo** | Version history, no database cost. A private repo keeps the Bible text from being publicly downloadable as raw data. |
| CMS | **Decap CMS or Sveltia CMS** with editorial workflow | Free admin UI. Each edit becomes a pull request, which provides the review step (FR-29). |
| CI | **GitHub Actions** (free tier) | Validates data, runs the verse checksum test, triggers the Cloudflare build. |
| Search | **FlexSearch**, index built at build time, custom Amharic normalizer | Client-side, no search server. |
| Offline | **Workbox** service worker | Caches visited eras, fonts, and verses. |

Estimated running cost: **$0/month**, plus a domain at about $10–15/year.

**Data model (core entities)**

| Entity | Key fields |
|---|---|
| `Stream` | id, name_am, name_en, fill_color, parent_stream_id, fork_year, end_year, width_keyframes[] ({year, width 1–5}), lane_order, canon |
| `Person` | id, name_am, name_en, aliases[], figure_kind (king/queen/prophet/other), stream_id, birth/death (DateValue ×2), canon |
| `Reign` | id, person_id, stream_id, start/end (DateValue ×2), coregency_flag |
| `Event` | id, title_am, title_en, summary_am, summary_en, stream_id or lane_id, type (point/span), date_traditional, date_scholarly, importance 1–5 (drives level of detail), refs[], canon |
| `Relationship` | id, person_a_id, person_b_id, type (parent, married, succeeded, allied, opposed, war, prophesied_to), label_am, date (DateValue, optional), refs[], canon |
| `DateValue` | start, end, certainty, method (anchor/derived/traditional/relative), source_id, anchor_id, derivation_refs[] |
| `Anchor` | id, label, date, external_source, confidence, notes |
| `ScriptureRef` | book_id, chapter, verse_start, verse_end |
| `Book` | id, name_am, name_en, testament, canon, order_66, order_81, period_setting |
| `Source` | id, citation, kind (tradition/scholarly) |

**Date storage**
- **Traditional dates:** integer years counted from creation (AA 1 = creation).
- **Scholarly dates:** astronomical years (1 BC = 0), which avoids off-by-one errors.
- **Conversion:** conversions are pure, unit-tested functions. Amete Mihret = AA − 5500. Gregorian ≈ Amete Mihret + 7/8.
- **Ge'ez numerals:** numeral formatting is a tested utility.

**Scripture text**
- **Import:** the text is imported once into read-only JSON (one file per book, lazy-loaded).
- **Base text (decided): the Society's HTML Bible** (`am_new.zip`). This is the WordProject.org "Selassie" edition of the 1954 E.C. text: 66 books, 1,189 chapters, 31,102 verses, Unicode, one HTML file per chapter.
- **Authority: the Society's scanned Bible.** Wherever the HTML and the scan disagree, the scan wins. Wording checked so far (Gen 5, Gen 11, and all anchor verses) is identical.
- **Use of the file:** only the verse text is used. WordProject's site files, CSS/JS, audio links, and branding are not used. The credit follows the Society's approved wording.

**Parsing**
- Verses are taken from `<span class="verse" id="N">` markers.
- Quirk: each chapter's verse 1 marker is inside an HTML comment and must be restored.

**Automatic cleaning** (logged, reversible):
- Strip the leading "፤ " artifact (present on 17,595 verses).
- Remove stray footnote markers: trailing "a", "v", `*ፍ1*`, "[see v2]".
- Move edition footnotes out of verse text into a `footnote` field. Examples: "q ቍ@ 30፤ … የግእዝ መጽሐፍ …", and Gen 46:28, where a footnote overwrote the verse.
- Suggest, but do not auto-apply, fixes for old-font junk (Latin letters left from legacy-font conversion, mostly in Jeremiah). Usual mapping: KW→ቍ, kW→ኵ, gW→ጕ, D→ጵ, Do→ጶ. A proofreader confirms each fix against the scan.

**Targeted proofreading** (replaces full OCR):
- Fix the **436 automatically flagged verses** against the scan, using the proofreading workbook. The flags break down as:
  - 293 empty verses, either missing or moved into a neighbouring verse. Gen 31:33–55 (23 verses) is entirely missing.
  - 50 verses with old-font junk.
  - 24 verses with footnote text inside.
  - 9 merged verses.
  - 52 stray markers.
  - 7 verses with digits to check.
  - 1 typo.
- Verify every chronology verse and anchor verse against the scan (see Appendix).
- Spot-check 2–5% of the other verses at random against the scan. If the error rate exceeds 0.5%, widen the check book by book.
- A second person reviews every changed verse.
- OCR (Google Document AI / Cloud Vision, permitted by the agreement) is used only to transcribe missing passages, such as Gen 31:33–55.

**Edition presentation** (follows the printed scan, not the HTML):
- **Book order and names:** use the scan's order and names (see Appendix). The HTML uses the Protestant order and names such as ሚልክያ, ሰቆቃው, and 1ኛ … .
- **Versification:** the HTML is forced into English (KJV) numbering. For example, Job 40:25–32 is merged into 40:24, and Ps 14:7 contains [8]–[10]. A **versification mapping table** (HTML ref → scan ref) SHALL be built wherever the numbering differs. References in the app use the scan's numbering.
- **Word separators:** the HTML uses spaces. ፡ is generated at display time by a fixed rule: one ፡ between words, none next to ። ፣ ፤ ፥ or ?. The reviewer approves the rule against sample pages of the scan.

**Validation rules**
- Verse counts per chapter must match the scan's numbering.
- No Latin letters, and no digits except reviewed exceptions (e.g., 1 Sam 13:21).
- Only valid fidel and Ethiopic punctuation (፡ ። ፣ ፤ ፥ ?) are allowed.
- Fidel normalization must not be applied to stored text. It is for search only.

**Integrity**
- After proofreading, the cleaned text is frozen.
- A CI checksum test fails the build if any verse changes.
- Editors cannot change verse text in the CMS.

**Performance**
- **Initial JS budget:** ≤ 250 KB gzipped.
- **Era data tiles:** ≤ 100 KB each.
- **Fonts:** subsetted to Ethiopic plus basic Latin.
- **Frame rate:** 60 fps pan/zoom on mid-range Android.
- **Tile loading:** only era tiles near the viewport are rendered.

**Error handling & edge cases**
- **Undatable items:** items with no scholarly date are placed on the scholarly axis in a labeled "tradition-only" band.
- **Conflicting traditions:** when traditions conflict, the date is shown as a range, with the sources listed in the note.
- **Missing verse text:** if verse text fails to load, show the reference and a retry option.
- **Intertestamental gap:** the period between Malachi and Matthew shows only context streams, with a label explaining why.
- **Relationship to an off-screen person:** the connector ends in an arrow with the person's name, and tapping it pans to them.

**Security / compliance**
- **CMS:** login via GitHub, restricted to editors and reviewers.
- **Public site:** read-only and static.
- **Repository:** private (see the Content row in the architecture table).

**Dependencies**
- **Scripture text:** the Society's HTML Bible (base) and scanned Bible (authority); written approval received.
- **Chronology review:** a church/theology reviewer for the traditional chronology and the explanatory notes.
- **Data entry:** editors to populate content.

**Rollout**
- Private beta (Orthodox and Protestant testers), then public launch.
- Content is released era by era. Unpopulated eras show "coming soon."

## 6. Timeline / Milestones

_(All durations aspirational; no fixed deadline.)_

| Phase | Deliverable | Est. duration |
|---|---|---|
| 0 | Reviewer onboard; traditional sources chosen; HTML parsed and auto-cleaned; proofreading workbook issued | 1–2 weeks |
| 0b | Scripture verification: 436 flagged verses fixed against the scan, missing passages transcribed, anchor/chronology verses verified, random spot-check, versification mapping, second-person review (runs in parallel with phases 1–5) | 3–5 weeks _(estimate)_ |
| 1 | Design system: fonts, palette, harag bands, figure set, Ge'ez numerals, stream drawing primitives | 2–3 weeks |
| 2 | Data model, CMS with editorial workflow, date and numeral utilities with tests, CI | 3 weeks |
| 3 | Chart engine: streams with forks and width keyframes, reigns, level of detail, zoom/pan, minimap | 5–6 weeks |
| 4 | Detail panel, relationship connectors, relationship map, search, deep links, PWA | 4 weeks |
| 5 | OT content: Creation → Malachi, plus intertestamental context (in parallel with 2–4) | 8–10 weeks |
| 6 | NT content: Gospels → Revelation | 4–6 weeks |
| 7 | Private beta, then public launch | 3–4 weeks |
| **Phase 2** | 81-canon books + 66/81 switch; journey maps; poster export | — |

## 7. Open Questions & Risks

| # | Question / Risk | Owner | Impact |
|---|---|---|---|
| 1 | **Approval (resolved).** The Bible Society of Ethiopia's approval is in writing. Keep it on file. Before Phase 2, confirm whether it covers the 81-canon text, and whether it covers offline caching on devices if the agreement does not mention it. | Product lead | Low: resolved |
| 2 | **Depicting Christ and the apostles (decided).** Icon-style figures in Ethiopian painting style. The church reviewer approves each NT figure design before release. | Product lead + reviewer | Low |
| 3 | **Dating label conflict.** In everyday Amharic, ዓ.ዓ. already means "BC," but it is also the name of the traditional count from creation. A distinct label is needed for the traditional axis (e.g., "ከፍጥረት"). | Reviewer | Medium |
| 4 | **Genesis numbers (resolved; reviewer sign-off pending).** Read from the scan and confirmed in the HTML file: Flood = year 2,256 from creation; Abraham's birth = year 3,388 (see Appendix). Under the traditional 5,500-year count, about 2,112 years remain from Abraham to Christ. The reviewer approves the readings and the note on this edition's distinctive numbers (Nahor 109, Terah 100). | Content lead + reviewer | Low |
| 5 | Which sources define the traditional dates event by event? Candidates: *Bahire Hasab*, Abushaker, *andemta* commentaries. | Content/theology lead | High |
| 6 | Default scholarly choices for disputed dates. Proposed: Thiele for the kings, both early and late Exodus dates shown, Christ's birth as a range of ~6–4 BC. | Content lead | Medium |
| 7 | **Stream widths are editorial judgments.** Width encodes "power," which is subjective. Mitigation: a documented 1–5 scale, reviewed like any other content. | Content lead | Low |
| 8 | Risk: Abyssinica SIL has no bold weight. Mitigation: rubrication (DR-3) replaces bold. UI fonts carry the weights. | Design | Low |
| 9 | Risk: SVG performance with dense eras on low-end phones. Mitigation: era tiling and level of detail. If the target is missed, fall back to Canvas for the stream layer. | Engineering | Medium |
| 10 | Risk: full-Bible content volume is underestimated. Mitigation: launch with importance 4–5 items, then fill in detail after launch. | Project lead | Medium |
| 11 | Amharic spellings in the mockups (e.g., ወልደ አዴር, አዛሄል, ኤትበኣል, ሰልምናሶር) must be checked against the Society's text. | Content lead | Low |
| 12 | **Reference abbreviations.** The chart needs short forms for references (e.g., a short form for መጽሐፈ ነገሥት ቀዳማዊ 16፥29). The edition mixes ቀዳማዊ/ካልዕ (OT) with 1ኛ/2ኛ (NT). Define one abbreviation table, approved by the reviewer, to use in every short form. Full names appear in the detail panel. | Content lead + reviewer | Medium |
| 13 | **Source (decided).** The base is the Society's HTML Bible, and the authority is the Society's scan. Remaining risk: the quality of the unflagged verses is unknown until the random spot-check, and versification differences need a complete mapping table. Mitigation: widen the checks if the spot-check error rate exceeds 0.5%. | Product lead + Engineering | Medium |
| 14 | **Word separators (decided).** Verses are displayed with ፡ between words, exactly as printed in the scan. | — | Resolved |

## 8. Appendix

**Approved design mockups:** https://claude.ai/artifact/FLS1ZYh3cymwXCzDFL9iJh
- **Board 5:** brana-style Adams chart. **This is the approved direction.**
- **Boards 1–4:** earlier phone explorations (detail sheet, relationship map, era overview). Their layouts carry over, restyled to the brana design system.

**Candidate scholarly anchor points.** All need content-lead verification.

| Anchor | Approx. date | External source |
|---|---|---|
| Ahab at the Battle of Qarqar | 853 BC | Kurkh Monolith (Shalmaneser III) |
| Jehu pays tribute | 841 BC | Black Obelisk (Shalmaneser III) |
| Fall of Samaria | 722/721 BC | Assyrian records |
| Sennacherib's campaign against Hezekiah | 701 BC | Sennacherib's annals |
| Jerusalem captured, Jehoiachin exiled | March 597 BC | Babylonian Chronicle |
| Fall of Jerusalem | 587/586 BC | Babylonian records + Kings/Jeremiah |
| Cyrus takes Babylon | 539 BC | Nabonidus Chronicle, Cyrus Cylinder |
| Death of Herod the Great | ~4 BC (debated) | Josephus |
| 15th year of Tiberius (Luke 3:1) | AD 28/29 | Roman records |
| Pontius Pilate, governor of Judea | AD 26–36 | Josephus, Tacitus, Pilate Stone |
| Gallio, proconsul of Achaia (Acts 18:12) | AD 51/52 | Delphi inscription |
| Destruction of the Temple | AD 70 | Josephus, Roman records |

The Assyrian dates are themselves fixed by the eponym lists and the solar eclipse of 763 BC. Before about 900 BC, firm anchors are rare. Before Abraham, there are no scholarly dates.

**Anchor-verse verification** (HTML file checked; scan confirmation tracked in the proofreading workbook, sheet "Anchor verses"):
- **All anchor verses carry the expected numbers:**
  - Ahab: Asa's 38th year / 22 years (1 Kgs 16:29)
  - 3 years without war (1 Kgs 22:1)
  - Ahaziah: 17th / 2 years (1 Kgs 22:51)
  - Joram: 18th / 12 years (2 Kgs 3:1)
  - Jehu: 28 years (2 Kgs 10:36)
  - Samaria falls: Hoshea's 9th = Hezekiah's 6th (2 Kgs 17:6; 18:10)
  - Sennacherib: Hezekiah's 14th (2 Kgs 18:13; Isa 36:1)
  - Jehoiachin: 18 years old, 3 months, Nebuchadnezzar's 8th year (2 Kgs 24:8, 12)
  - 7th year, 3,023 people (Jer 52:28)
  - Jerusalem falls: Zedekiah's 11th; Nebuchadnezzar's 19th year, 5th month, 7th day (2 Kgs 25:2, 8); the 10th day in Jer 52:12
  - 18th year, 832 people (Jer 52:29)
  - Cyrus's 1st year (Ezra 1:1)
  - Darius the Mede aged 62 (Dan 5:31)
  - Tiberius's 15th year (Luke 3:1)
  - Jesus about 30 (Luke 3:23)
  - 1 year 6 months; Gallio (Acts 18:11–12)
- **Key intervals follow the Hebrew reading:**
  - **Exod 12:40:** 430 years "in the land of Egypt" only.
  - **1 Kgs 6:1:** **480** years from the Exodus to the Temple.

  So this edition is long (Septuagint-type) before Abraham, and Hebrew-type from the Exodus onward. The derivation engine must follow the edition's own numbers in each case.

**Candidate traditional sources (to verify with the reviewer):**
- *Bahire Hasab* (Ethiopian computus)
- Abushaker (Ibn al-Rahib)
- EOTC *andemta* commentaries
- *Kebra Nagast*, for the Ethiopia stream

**Book names and order of the Society's edition (66 books).** These were transcribed from the table of contents of the Society's scanned copy, and must be verified during import. The `Book` entity uses these as `name_am`, with `order_66` taken from this order.

| # | Amharic (as printed) | English |
|---|---|---|
| 1 | ኦሪት ዘፍጥረት | Genesis |
| 2 | ኦሪት ዘጸአት | Exodus |
| 3 | ኦሪት ዘሌዋውያን | Leviticus |
| 4 | ኦሪት ዘኍልቍ | Numbers |
| 5 | ኦሪት ዘዳግም | Deuteronomy |
| 6 | መጽሐፈ ኢያሱ ወልደ ነዌ | Joshua |
| 7 | መጽሐፈ መሳፍንት | Judges |
| 8 | መጽሐፈ ሩት | Ruth |
| 9 | መጽሐፈ ሳሙኤል ቀዳማዊ | 1 Samuel |
| 10 | መጽሐፈ ሳሙኤል ካልዕ | 2 Samuel |
| 11 | መጽሐፈ ነገሥት ቀዳማዊ | 1 Kings |
| 12 | መጽሐፈ ነገሥት ካልዕ | 2 Kings |
| 13 | መጽሐፈ ዜና መዋዕል ቀዳማዊ | 1 Chronicles |
| 14 | መጽሐፈ ዜና መዋዕል ካልዕ | 2 Chronicles |
| 15 | መጽሐፈ ዕዝራ | Ezra |
| 16 | መጽሐፈ ነህምያ | Nehemiah |
| 17 | መጽሐፈ አስቴር | Esther |
| 18 | መጽሐፈ ኢዮብ | Job |
| 19 | መዝሙረ ዳዊት | Psalms |
| 20 | መጽሐፈ ምሳሌ | Proverbs |
| 21 | መጽሐፈ መክብብ | Ecclesiastes |
| 22 | መኃልየ መኃልይ | Song of Solomon |
| 23 | ትንቢተ ኢሳይያስ | Isaiah |
| 24 | ትንቢተ ኤርምያስ | Jeremiah |
| 25 | ሰቆቃወ ኤርምያስ | Lamentations |
| 26 | ትንቢተ ሕዝቅኤል | Ezekiel |
| 27 | ትንቢተ ዳንኤል | Daniel |
| 28 | ትንቢተ ሆሴዕ | Hosea |
| 29 | ትንቢተ አሞጽ | Amos |
| 30 | ትንቢተ ሚክያስ | Micah |
| 31 | ትንቢተ ኢዩኤል | Joel |
| 32 | ትንቢተ አብድዩ | Obadiah |
| 33 | ትንቢተ ዮናስ | Jonah |
| 34 | ትንቢተ ናሆም | Nahum |
| 35 | ትንቢተ ዕንባቆም | Habakkuk |
| 36 | ትንቢተ ሶፎንያስ | Zephaniah |
| 37 | ትንቢተ ሐጌ | Haggai |
| 38 | ትንቢተ ዘካርያስ | Zechariah |
| 39 | ትንቢተ ሚልክያስ | Malachi |
| 40 | የማቴዎስ ወንጌል | Matthew |
| 41 | የማርቆስ ወንጌል | Mark |
| 42 | የሉቃስ ወንጌል | Luke |
| 43 | የዮሐንስ ወንጌል | John |
| 44 | የሐዋርያት ሥራ | Acts |
| 45 | ወደ ሮሜ ሰዎች | Romans |
| 46 | ወደ ቆሮንቶስ ሰዎች 1 | 1 Corinthians |
| 47 | ወደ ቆሮንቶስ ሰዎች 2 | 2 Corinthians |
| 48 | ወደ ገላትያ ሰዎች | Galatians |
| 49 | ወደ ኤፌሶን ሰዎች | Ephesians |
| 50 | ወደ ፊልጵስዩስ ሰዎች | Philippians |
| 51 | ወደ ቈላስይስ ሰዎች | Colossians |
| 52 | ወደ ተሰሎንቄ ሰዎች 1 | 1 Thessalonians |
| 53 | ወደ ተሰሎንቄ ሰዎች 2 | 2 Thessalonians |
| 54 | ወደ ጢሞቴዎስ 1 | 1 Timothy |
| 55 | ወደ ጢሞቴዎስ 2 | 2 Timothy |
| 56 | ወደ ቲቶ | Titus |
| 57 | ወደ ፊልሞና | Philemon |
| 58 | ወደ ዕብራውያን | Hebrews |
| 59 | የጴጥሮስ መልእክት 1 | 1 Peter |
| 60 | የጴጥሮስ መልእክት 2 | 2 Peter |
| 61 | የዮሐንስ መልእክት 1 | 1 John |
| 62 | የዮሐንስ መልእክት 2 | 2 John |
| 63 | የዮሐንስ መልእክት 3 | 3 John |
| 64 | የያዕቆብ መልእክት | James |
| 65 | የይሁዳ መልእክት | Jude |
| 66 | የዮሐንስ ራእይ | Revelation |

Notes on this edition:
- **Septuagint ordering.**
  - The Minor Prophets follow the Septuagint order: Hosea, Amos, Micah, Joel, Obadiah, Jonah, and so on.
  - The General Epistles follow the order Peter, John, James, Jude.
  - The app's book lists and "next book" navigation SHALL use this order, not the English Protestant order.
- **Numbering style.** OT pairs use ቀዳማዊ / ካልዕ. NT books put the number after the name (e.g., ወደ ቆሮንቶስ ሰዎች 1). Pauline letters are grouped under a heading, የጳውሎስ መልእክቶች.
- **The NT has its own page numbering,** starting again at 1.
- **Genesis 5 chronology, read from the Society's scan** _(to be double-checked by the reviewer)_. Ages are given as father's age at the son's birth / years lived after / total.

| Patriarch (verses) | Scan | Septuagint | Hebrew | Follows |
|---|---|---|---|---|
| Adam (5:3–5) | 230 / 700 / 930 | 230 / 700 / 930 | 130 / 800 / 930 | Septuagint |
| Seth (5:6–8) | 205 / 707 / 912 | 205 / 707 / 912 | 105 / 807 / 912 | Septuagint |
| Enosh (5:9–11) | 190 / 715 / 905 | 190 / 715 / 905 | 90 / 815 / 905 | Septuagint |
| Kenan (5:12–14) | 170 / 740 / 910 | 170 / 740 / 910 | 70 / 840 / 910 | Septuagint |
| Mahalalel (5:15–17) | 165 / 730 / 895 | 165 / 730 / 895 | 65 / 830 / 895 | Septuagint |
| Jared (5:18–20) | 162 / 800 / 962 | 162 / 800 / 962 | 162 / 800 / 962 | Both |
| Enoch (5:21–23) | 165 / 200 / 365 | 165 / 200 / 365 | 65 / 300 / 365 | Septuagint |
| Methuselah (5:25–27) | 187 / 782 / 969 | 167 / 802 / 969 (187 / 782 in some manuscripts) | 187 / 782 / 969 | Septuagint variant (= Hebrew) |
| Lamech (5:28–31) | 182 / 565 / 747 | 188 / 565 / 753 | 182 / 595 / 777 | Unique to this edition |
| Noah (5:32; 7:6) | 500 at sons' birth; 600 at the Flood | same | same | — |

**Result:** this edition gives **Creation → Noah's birth = 1,656 years** and **Creation → Flood = year 2,256**. For comparison, the Hebrew count puts the Flood at year 1,656, and the main Septuagint text at 2,242. This is a long, Septuagint-type count.

- **Genesis 11 chronology, read from the Society's scan and confirmed in the HTML file** (both agree). Ages are given as father's age at the son's birth / years lived after.

| Patriarch (verses) | Scan | Septuagint | Hebrew | Year from creation (scan) |
|---|---|---|---|---|
| Shem → Arphaxad (11:10–11) | 2 years after the Flood / 500 | same | same | Arphaxad born **2,258** |
| Arphaxad → Cainan (11:12–13) | 135 / 400 | 135 / 430 | 35 → Shelah (no Cainan) / 403 | Cainan born 2,393 |
| Cainan → Shelah (11:13) | 130 / 330 | 130 / 330 | — | Shelah born 2,523 |
| Shelah → Eber (11:14–15) | 130 / 330 | 130 / 330 | 30 / 403 | Eber born 2,653 |
| Eber → Peleg (11:16–17) | 134 / 430 | 134 / 370 | 34 / 430 | Peleg born 2,787 |
| Peleg → Reu (11:18–19) | 130 / 209 | 130 / 209 | 30 / 209 | Reu born 2,917 |
| Reu → Serug (11:20–21) | 132 / 207 | 132 / 207 | 32 / 207 | Serug born 3,049 |
| Serug → Nahor (11:22–23) | 130 / 200 | 130 / 200 | 30 / 200 | Nahor born 3,179 |
| Nahor → Terah (11:24–25) | **109** / 129 | 79 (179 in some manuscripts) / 129 | 29 / 119 | Terah born 3,288 |
| Terah → Abram (11:26, 32) | **100** / total 205 | 70 / 205 | 70 / 205 | **Abram born 3,388** |

**Result:** this edition places **Abraham's birth in year 3,388 from creation**. Under the traditional 5,500-year count, that leaves about **2,112 years from Abraham to Christ**, which roughly fits the scholarly placement of Abraham around 2000 BC.

Nahor 109 and Terah 100 are distinctive to this edition. Every other tradition gives Terah 70. The editorial note should mention this.

Cainan's lines sit inside Gen 11:13 rather than in an extra verse, so references must use the edition's own verse numbers.
- **The HTML file and the earlier online digital copy (kibret.wordpress.com)** both use the Protestant order and names. They appear to be the same digital text. The online copy is no longer needed: the Society's HTML file replaces it. Neither file's book order or names are used; the scan's are.

**Prior art:**
- Sebastian Adams, *Synchronological Chart of Universal History* (1871)
- Ussher, *Annals of the World*
- Thiele, *The Mysterious Numbers of the Hebrew Kings*

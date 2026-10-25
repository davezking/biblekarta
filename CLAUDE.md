# Bible Karta (site repo): Claude Code project memory

## Product
Bible Karta (biblekarta.com, የመጽሐፍ ቅዱስ ካርታ) is a free, non-profit web app. It shows the whole 66-book Bible as an Adams-style chart of flowing streams, drawn in Ethiopian brana manuscript style, for Amharic readers (mostly on mobile). Every item shows the Ethiopian traditional date and the scholarly date, and tapping an item shows the exact verse text from the Bible Society of Ethiopia's edition. Hosting cost must stay at $0. Full design: `architecture.md`.

## Repos
- **`biblekarta` (this repo, PUBLIC):** site code, content, seed, CMS, CI, and all task files.
- **`biblekarta-scripture` (PRIVATE, checked out at `../biblekarta-scripture`):** Bible text and the Python `bk` tools. Tasks with `repo: scripture` run there.
- **Never copy Bible text into this repo,** not even in tests, fixtures, issues or PR descriptions. `scripture-fixtures/` holds a non-scriptural test book only.

## Stack
- Astro 7 (static) + a React 19 chart island + SVG + d3-zoom. TypeScript strict. pnpm. Node 22 (≥ 22.23.4, which Astro 7 requires).
- Content: JSON, one file per entry, Zod (`src/lib/core/schema.ts`). Decap CMS at `/admin`.
- Tests: Vitest and Playwright (install the browser once: `pnpm exec playwright install chromium`).
- Hosting: Cloudflare Pages Git integration. Production = `main`; there's a preview per branch.

## Folders
```
content/            editor-managed JSON (CMS), one folder per collection
seed/               demo data for previews only (BK_SEED=1); every file has "fixture": true
scripture.lock      commit SHA of biblekarta-scripture that builds use
scripture-fixtures/ NON-scriptural test book + books-meta.json (forks / no token)
scripts/            fetch-scripture.sh, run-task.sh, parallel-group.sh
src/lib/core/       pure TS: schema, dates, geez, normalize, separators, refs, books, tokens
src/lib/layout/     pure TS: timescale, streams, lod, relmap
src/build/          validate-content, verify-scripture, copy-scripture, compile-data, og
src/components/     ui/ chart/ panel/ figures/ ornament/ scripture/ search/ dev/
src/pages/          routes; /dev/* is preview-only, excluded from production
src/i18n/           am.json, en.json
e2e/                Playwright, one folder per phase
docs/tasks/         one file per task   docs/phases/  phase demo scripts
```

## Commands
- **Install:** `pnpm i`
- **Fetch scripture:** `scripts/fetch-scripture.sh` (uses `SCRIPTURE_TOKEN` and `scripture.lock`, otherwise fixtures)
- **Dev:** `pnpm dev` (seeded: `BK_SEED=1 pnpm dev`)
- **Lint / type check / unit tests:** `pnpm lint` · `pnpm typecheck` · `pnpm test`
- **Content:** `pnpm validate` · `pnpm seed:check` · scripture: `pnpm verify:scripture`
- **E2E:** `pnpm e2e` · **Build:** `pnpm build` (`BK_SEED=1 pnpm build` for preview-style)

## Invariants (never break these)
- **Scripture is sacred data.**
  - Never edit, trim, normalize, re-space or "fix" verse text.
  - Stored text has single spaces between words and **never contains ፡**.
  - ፡ is added **only** at display time by `wordSeparators()` in `src/lib/core/separators.ts`.
  - Render verses as plain text nodes.
  - Copy book files byte-for-byte.
  - Only `status: "verified"` books are published.
- **Verse references use the scan's numbering** (the edition's own), never the HTML/KJV numbering.
- **Normalization (`normalizeAm`) is for search keys only.**
- **Years:** traditional = AA integers (creation = AA 1); scholarly = astronomical (1 BC = 0). Convert only via `dates.ts`. Only `timescale.ts` maps a year to x.
- **Never invent biblical data:** no dates, reign lengths, names, references or verse text. Unknown traditional dates use `method: "relative"`, `relative_text_am: "TBD"`.
- The MVP shows only `canon: "shared"`.
- `/dev/*`, `seed/` and fixture scripture must never reach a production build.
- User-facing strings go in `src/i18n/*.json`. Scripture is always Amharic, with `lang="am"`.
- **Public repo:** no secrets, no Bible text, and no `pull_request_target` workflows.

## Design rules
- **Inks:** black #1E1712, red #8A1A12. **Harag:** strand red #A52119, green #3F6B3A, yellow ground #E2B54F. **Vellum** #E9D8B4. Tokens live in `src/lib/core/tokens.ts` / `src/styles/tokens.css`.
- **Fonts:** Abyssinica SIL (`--font-manuscript`) for chart text, titles and verses; Noto Sans Ethiopic (`--font-ui`) for controls. No bold in manuscript text; emphasis is red ink.
- Touch targets ≥ 44 px. Text contrast ≥ 4.5:1. Figures are `aria-hidden`. Respect `prefers-reduced-motion`.
- **Chart:** no React re-render during pan/zoom gestures. One transformed geometry `<g>`; labels are re-placed on a throttled viewport.

## Conventions
- Pure functions in `src/lib/**`; side effects in `src/build/**`. Tests next to the code (`*.test.ts`).
- Small typed components, no UI library, tokens only.
- Commit message: `<TASK-ID>: <title>`.

## Branching
- `main` = the last approved phase, plus code-owner-approved content PRs. Production deploys from `main`.
- `phase-<N>` is branched from `main`; merge `main` in when content lands.
- `task/<TASK-ID>` is branched from `phase-<N>`; its PR into `phase-<N>` merges after the checks pass and the owner has ordered a Claude review.
- `cms/*` are Decap editor branches; their PRs into `main` need a code owner's approval.
- When a phase is approved, merge `phase-<N>` → `main` and tag `v0.<N>-phase<N>`.

## Tasks
Task files live in `docs/tasks/`. Always follow a task's acceptance criteria exactly, and do not edit files outside its `files` list without saying why in the PR. The `repo` field says which repo the task runs in. Run tasks with `/run-task <ID>` or `scripts/run-task.sh <ID>`. The loop is described in `docs/WORKFLOW.md`.

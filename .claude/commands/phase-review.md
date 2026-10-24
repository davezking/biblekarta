---
description: Opus review of a whole phase diff before client/owner sign-off
argument-hint: <PHASE-NUMBER>
---
Review phase $ARGUMENTS as a whole. Run this with Opus (`/model opus`).

1. Run `git fetch origin` and get the diff with `git diff origin/main...origin/phase-$ARGUMENTS`. If any task in this phase has `repo: scripture`, also review `../biblekarta-scripture`: `git -C ../biblekarta-scripture log --oneline` for that phase's task IDs, and their diffs. Also read:
   - `architecture.md` (sections 3–9, plus this phase's roadmap section)
   - every `docs/tasks/P$ARGUMENTS-*.md`
   - `docs/phases/phase-$ARGUMENTS-demo.md`
   - `CLAUDE.md`
2. Check for:
   - **Consistency across tasks:** duplicated helpers, conflicting conventions, components that reimplement existing ones.
   - **Invariants in `CLAUDE.md` (both repos):**
     - stored verse text never contains ፡ and is never transformed (፡ only via `wordSeparators()`)
     - references use the scan numbering via the versification map
     - cleaning is logged and reversible
     - every changed verse has a second reviewer
     - normalization is only for search
     - years only via `dates.ts`, and x only via `timescale.ts`
     - no invented biblical data
     - `/dev`, `seed` and fixture scripture are excluded from production
     - **no Bible text in the public repo**
   - **Security:** secrets, CSP, the OAuth worker, the promotion gate logic, CI permissions.
   - **Data model drift** against architecture §4 and `schema.ts` (and the CMS config, if present).
   - **Missing tests:** every acceptance criterion and demo step has a test.
   - **Performance budgets** and **accessibility** (DR-13).
   - **Dead code,** TODOs left behind, and stubs never filled.
3. Output the findings grouped as **must-fix / should-fix / nice-to-have**. Each finding gets the file:line, what's wrong and why it matters.
4. For each must-fix, draft a new task file in `docs/tasks/` with the next free ID in this phase (e.g. `P$ARGUMENTS-S<last>-T<next>`, or a suffix like `P$ARGUMENTS-S3-T4a`). Use the standard template, `review: opus` if security-related, otherwise `auto`. Show the drafts before writing them.

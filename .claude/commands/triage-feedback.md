---
description: Classify feedback into bugs, changes and new features, and draft the follow-ups
argument-hint: "[pasted comments | empty to read GitHub issues labeled feedback]"
---
Triage feedback for the current phase.

1. **Input.** Use the pasted text in `$ARGUMENTS` if there is any. Otherwise run `gh issue list --label feedback --state open --json number,title,body,url`.
2. **Find the current phase.** It's the highest `phase-<N>` branch not yet merged into `main` (`git branch -r --no-merged origin/main | grep phase-`).
3. **Classify each item** as one of:
   - **bug:** the product doesn't do what the PRD, a task's acceptance criteria or the phase demo script says.
   - **change:** the product works as specified, but the owner now wants it to behave differently.
   - **new-feature:** something not in the PRD.

   Also note items that are already listed under "Known limitations" in `docs/phases/phase-<N>-demo.md`, and propose closing them with a pointer to that list.
4. **Show the classification table first:** item, class, a one-line reason, and the affected task IDs. **Wait for confirmation.**
5. After confirmation:
   - **bug** → draft a fix task file in `docs/tasks/` for the current phase (next free ID, `review: auto` unless it touches scripture, auth or the gate). Show it, then write it.
   - **change** → append to `docs/prd-changelog.md` (date, the change, the source issue, the affected task IDs). Don't rewrite tasks; say that Change mode in the saas-architect skill should be used next.
   - **new-feature** → append to `docs/backlog.md` (date, a description, the source).
   - Comment on each source GitHub issue with its classification and the follow-up's location, and add the label `bug`, `change` or `backlog`.

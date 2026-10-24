---
description: Implement one task from docs/tasks and open a PR
argument-hint: <TASK-ID>
---
Implement the task in docs/tasks/$ARGUMENTS.md.

0. Read the task file. If its `repo` field is `scripture`, stop and say: "This is a scripture-repo task. Run it from ../biblekarta-scripture (`scripts/run-task.sh $ARGUMENTS` handles this)." If it's `site + scripture`, do the site part here and say that the scripture part must be run from `../biblekarta-scripture`.
1. Check that every task in `depends_on` is merged:
   - **Site tasks:** look in `origin/phase-<N>` (`git fetch origin && git log origin/phase-<N> --oneline | grep "<DEP-ID>:"`).
   - **Scripture tasks:** look in `../biblekarta-scripture` on `origin/main` (`git -C ../biblekarta-scripture log origin/main --oneline | grep "<DEP-ID>:"`).

   If one isn't merged, stop and say which.
2. Create the branch `task/$ARGUMENTS` from `origin/phase-<N>`.
3. Implement the task. Stay inside the task's `files` list unless it's unavoidable, and explain any exception in the PR. **Never put Bible text in this public repo.**
4. Write the listed tests. Run `pnpm lint && pnpm typecheck && pnpm test && pnpm validate && pnpm verify:scripture` until they all pass.
5. Commit with the message `$ARGUMENTS: <title>`, push, and run `gh pr create --base phase-<N>`. The PR body must contain:
   - a summary
   - the task's "How to test manually" steps (Cloudflare comments a preview URL for this branch)
   - the acceptance criteria as a checklist
   - risks, and any edits outside `files`
6. Add the label `review:auto` or `review:opus` from the task's `review` field.
7. If it's `review: auto`, run `gh pr merge --auto --squash --delete-branch`. It merges once CI and the Claude review check pass.
   If it's `review: opus`, stop and tell the user the PR is ready for a manual Opus review.

# Workflow: building Bible Karta with Claude Code

This is the one-page guide to the loop. The plan is in `architecture.md` (roadmap §11), and the tasks are in `docs/tasks/`.

## Two repos, side by side
```
~/code/biblekarta             (PUBLIC)  site, content, task files, this guide
~/code/biblekarta-scripture   (PRIVATE) Bible text + bk tools + workbook rounds
```
Every task file has a `repo:` field. `scripts/run-task.sh` runs a task in the right repo automatically.

## One-time setup
1. Create both repos on GitHub: `biblekarta` **public**, `biblekarta-scripture` **private**. Unpack `biblekarta/` and `biblekarta-scripture/` from the plan zip into them, and commit to `main`.
2. Put the Society's `am_new.zip` in `biblekarta-scripture/source/` and commit it (private repo only).
3. Create a fine-grained PAT, `SCRIPTURE_TOKEN`, with **Contents: read** on `biblekarta-scripture` only. Add it as an Actions secret in `biblekarta`, and as an encrypted env var in Cloudflare Pages (Preview + Production).
4. On your own machine, logged in to Claude Code with your Claude subscription, run `claude setup-token`. Add the token it prints as the Actions secret `CLAUDE_CODE_OAUTH_TOKEN` in **both** repos. PR reviews then use your subscription's usage limits instead of paid API credits. Until the secret is added, the `review` check skips the review with a notice and passes, so PRs aren't blocked; it starts reviewing as soon as the secret exists.
5. Follow `docs/deploy.md` (Cloudflare) and `docs/repo-rules.md` (rulesets + CODEOWNERS), both written by P1-S1-T1.
6. **Review Claude Code's permission settings before running headless.** `run-task.sh` uses `--permission-mode acceptEdits`. In each repo's `.claude/settings.json`, allow only what the loop needs (`pnpm *`, `uv run *`, `uv sync *`, `git *`, `gh pr *`, `gh label *`, `scripts/*`) and keep everything else on ask.

## 1. Start a phase (site repo)
```
git checkout main && git pull
git checkout -b phase-<N> main && git push -u origin phase-<N>
```
Cloudflare now builds `https://phase-<N>.biblekarta.pages.dev`. When content PRs land on `main`, run `git merge main` into `phase-<N>`.
Scripture tasks don't use phase branches: they go `task/<ID>` → `main` in the scripture repo.

## 2. Run the tasks, one parallel group at a time, in dependency order
- **One at a time:** `scripts/run-task.sh P1-S2-T1` (it picks the model and repo from the task file).
- **In parallel:** `scripts/parallel-group.sh 1 S1-B` prints one command per task, each in its own worktree in the right repo. Run each in a separate terminal.
- **Interactive:** `/model sonnet`, then `/run-task P1-S1-T2` inside the right repo.

## 3. Review and merge
- **Site, `review:auto`:** the PR auto-merges into `phase-<N>` once `web`, `tools` and `review` (Claude) pass. If Claude labels it `claude:changes`, fix it and push; auto-merge stays armed.
- **Scripture, `review:auto`:** `scripts/merge-when-green.sh <PR>` (in the scripture repo) waits for CI and the Claude label, then merges. Auto-merge isn't available on private repos on GitHub Free.
- **E2E:** the `e2e` workflow (Playwright, desktop and mobile) runs on every PR into `main` or `phase-<N>` and on pushes to them, so a phase's `P<N>-E2E` specs run on each task PR, not only at the end.
- **`review:opus` (either repo):** run `/model opus` and ask: "Review PR #<n> against docs/tasks/<ID>.md and CLAUDE.md". Fix the findings, then merge with a merge commit (never squash, so each `<TASK-ID>: <title>` commit stays in the history): `gh pr merge <n> --merge --delete-branch`.

## 4. Proofreading rounds (human work, alongside the build)
1. `bk workbook export --round <N>` → send `rounds/round-<N>.xlsx` to the proofreader.
2. The proofreader fills the yellow columns against the scan. A second person reviews every Fix, Transcribed, Split or Moved row (Status = Reviewed).
3. `bk apply --round <N> rounds/round-<N>.xlsx` → `bk sample escalate --round <N>` → `bk report`.
4. When a book has no blockers: `bk finalize --book <id>`, commit, tag `text-v<k>`, then open a PR in the site repo updating `scripture.lock` (code-owner approved).

## 5. Phase close-out (site repo)
1. All the phase's tasks are merged, and `P<N>-E2E` passes on `phase-<N>` (the `e2e` workflow, plus the scripture repo CI for scripture parts).
2. Run `/model opus`, then `/phase-review <N>`. Fix the must-fix findings as new tasks.
3. Walk through `docs/phases/phase-<N>-demo.md` on `https://phase-<N>.biblekarta.pages.dev`. Fill in the preview URL in the doc.
4. Share the preview URL and demo doc with whoever you want feedback from (e.g. the church reviewer for Phase 2).
5. File feedback as issues with the **Feedback** template (this repo is public, so keep sensitive notes out), then run `/triage-feedback`. Fix the bugs in this phase.
6. Sign off and release:
   ```
   gh pr create --base main --head phase-<N> --title "Phase <N>"   # CI must pass
   gh pr merge --merge
   git checkout main && git pull && git tag v0.<N>-phase<N> && git push --tags
   ```
   Production updates from `main`. Re-open any phase later with `git checkout v0.<N>-phase<N>`.
7. Ask the saas-architect skill to generate the next phase's task files, taking the feedback into account.

## Budgets
- **Actions:** unlimited on the public repo. The private repo's CI is small.
- **Cloudflare Pages:** 500 builds/month. The watch paths skip docs-only changes.

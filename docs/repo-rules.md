# Repo rules: rulesets, CODEOWNERS and repo options

These are free on a **public** repo, and they enforce the content review (FR-29) at merge time. Run the commands once, as a repo admin, with the `gh` CLI. Set the repo first:

```bash
export REPO=davezking/biblekarta
```

## 1. CODEOWNERS
`.github/CODEOWNERS` names **`@davezking`**, who is both the owner and the content reviewer:
- `/content/`: every editor's content PR needs the owner's approval, so it has two people (the editor and the owner).
- `/scripture.lock`, `/.github/`, `/workers/`, `/public/admin/`, `/src/build/verify-scripture.ts` and `/scripts/fetch-scripture.sh`: owner only.

The `tools` CI job fails if a `<OWNER>` or `<REVIEWER>` placeholder is ever left in the file. A code owner needs write access to the repo, or GitHub ignores the line.

**The one-reviewer trade-off.** GitHub never counts a PR author's own review. With one code owner, a PR *the owner* opens on a code-owned path can't be approved by anyone else, so the owner merges it through the admin bypass in `main-review` (below), only after CI passes. That means the owner's own content edits get no second person. When a second reviewer joins, add them to `/content/` and `/scripture.lock` in `CODEOWNERS`, and remove the bypass.

## 2. Rulesets on `main`
There are two rulesets, so that the checks can never be bypassed while the review can be (by the owner only):

- **`main-checks`:** a PR is required, `web` and `tools` must pass, and there's no force push or deletion. **No bypass**, for anyone.
- **`main-review`:** code-owner review is required. A PR with nothing code-owned (e.g. the owner's code PRs) needs no approval (`required_approving_review_count: 0`). The repository **admin** role may bypass it **only through a pull request** (`bypass_mode: "pull_request"`); editors are not admins and can't.

Delete any older `main` ruleset first (`gh api "repos/$REPO/rulesets" --jq '.[] | [.id, .name]'`, then `gh api -X DELETE "repos/$REPO/rulesets/<id>"`).

```bash
gh api -X POST "repos/$REPO/rulesets" --input - <<'JSON'
{
  "name": "main-checks",
  "target": "branch",
  "enforcement": "active",
  "bypass_actors": [],
  "conditions": { "ref_name": { "include": ["refs/heads/main"], "exclude": [] } },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 0,
        "require_code_owner_review": false,
        "dismiss_stale_reviews_on_push": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": false
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": false,
        "required_status_checks": [{ "context": "web" }, { "context": "tools" }]
      }
    }
  ]
}
JSON

gh api -X POST "repos/$REPO/rulesets" --input - <<'JSON'
{
  "name": "main-review",
  "target": "branch",
  "enforcement": "active",
  "bypass_actors": [
    { "actor_id": 5, "actor_type": "RepositoryRole", "bypass_mode": "pull_request" }
  ],
  "conditions": { "ref_name": { "include": ["refs/heads/main"], "exclude": [] } },
  "rules": [
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 0,
        "require_code_owner_review": true,
        "dismiss_stale_reviews_on_push": true,
        "require_last_push_approval": false,
        "required_review_thread_resolution": false
      }
    }
  ]
}
JSON
```

(`actor_id: 5` is GitHub's built-in **Admin** repository role.)

**Check it works:** a PR from a collaborator without admin rights that touches `content/` shows "Review required" until the owner approves; a PR with a red `web` or `tools` can't be merged by anyone.

## 3. Ruleset: `phase-*`
Requires a PR and the `web`, `tools` and `review` checks (`review` is the job in `.github/workflows/claude-review.yml`), and blocks force pushes. No human approval, so `review:auto` task PRs can auto-merge.

```bash
gh api -X POST "repos/$REPO/rulesets" --input - <<'JSON'
{
  "name": "phase-*",
  "target": "branch",
  "enforcement": "active",
  "bypass_actors": [],
  "conditions": { "ref_name": { "include": ["refs/heads/phase-*"], "exclude": [] } },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 0,
        "require_code_owner_review": false,
        "dismiss_stale_reviews_on_push": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": false
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": false,
        "required_status_checks": [
          { "context": "web" },
          { "context": "tools" },
          { "context": "review" }
        ]
      }
    }
  ]
}
JSON
```

Check both: `gh api "repos/$REPO/rulesets" --jq '.[].name'`.

## 4. Repo options

```bash
# Allow auto-merge, delete head branches after merge
gh api -X PATCH "repos/$REPO" -F allow_auto_merge=true -F delete_branch_on_merge=true

# Secret scanning + push protection
gh api -X PATCH "repos/$REPO" --input - <<'JSON'
{
  "security_and_analysis": {
    "secret_scanning": { "status": "enabled" },
    "secret_scanning_push_protection": { "status": "enabled" }
  }
}
JSON

# Dependabot alerts
gh api -X PUT "repos/$REPO/vulnerability-alerts"
```

The `phase-*` branch is created by hand at the start of each phase (`docs/WORKFLOW.md`); the ruleset applies to it automatically.

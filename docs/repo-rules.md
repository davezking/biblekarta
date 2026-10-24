# Repo rules: rulesets, CODEOWNERS and repo options

These are free on a **public** repo, and they enforce the content review (FR-29) at merge time. Run the commands once, as a repo admin, with the `gh` CLI. Set the repo first:

```bash
export REPO=<OWNER>/biblekarta
```

## 1. CODEOWNERS
`.github/CODEOWNERS` ships with the placeholders `@<OWNER>` and `@<REVIEWER>`. Replace them with real GitHub usernames (or `@org/team`) in a PR before creating the `main` ruleset:
- `<OWNER>`: you, the code owner. Owns `scripture.lock`, `.github/`, `workers/`, `public/admin/`, `src/build/verify-scripture.ts` and `scripts/fetch-scripture.sh`.
- `<REVIEWER>`: the church content reviewer. Co-owns `content/` with you.

Each code owner needs write access to the repo, or GitHub ignores the line.

## 2. Ruleset: `main`
Requires a PR and a code-owner review, the `web` and `tools` checks, and blocks force pushes. There's no bypass list, so admins follow it too.

```bash
gh api -X POST "repos/$REPO/rulesets" --input - <<'JSON'
{
  "name": "main",
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
        "required_approving_review_count": 1,
        "require_code_owner_review": true,
        "dismiss_stale_reviews_on_push": true,
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
```

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

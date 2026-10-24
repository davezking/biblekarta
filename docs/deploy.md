# Deploy: one-time Cloudflare Pages setup

Bible Karta is hosted on Cloudflare Pages (free tier) through its Git integration. `main` is production, and every other included branch gets a preview URL.

## 1. Create the Pages project
1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
2. Pick the **public** repo `biblekarta`. Never connect `biblekarta-scripture`.
3. Build settings:
   | Setting | Value |
   |---|---|
   | Framework preset | Astro |
   | Build command | `scripts/fetch-scripture.sh && pnpm build` |
   | Build output directory | `dist` |
   | Node version | `22` (env var `NODE_VERSION=22`; `.nvmrc` also says 22) |

## 2. Branches
- **Production branch:** `main`.
- **Preview branches:** *Custom branches*, include `phase-*`, `task/*` and `cms/*`. Exclude everything else.

## 3. Build watch paths
Settings → Builds → **Build watch paths**: include `*`, exclude `docs/**` and `design-reference/**`. Docs-only pushes then don't use any of the 500 builds a month.

## 4. Environment variables
| Variable | Preview | Production |
|---|---|---|
| `BK_SEED` | `1` | (unset) |
| `PUBLIC_BETA` | `true` | (unset) |
| `SCRIPTURE_TOKEN` | encrypted | encrypted |

`SCRIPTURE_TOKEN` is a fine-grained GitHub PAT with **Contents: read** on `biblekarta-scripture` only. Mark it **Encrypt**.

`BK_ALLOW_FIXTURE_SCRIPTURE` is a CI-only escape hatch. **Never set it in Cloudflare**, or production could ship the fixture test book.

## 5. GitHub repo settings (`biblekarta`)
- **Actions secrets:** `CLAUDE_CODE_OAUTH_TOKEN` (for the Claude PR review; from `claude setup-token`, uses your Claude subscription) and `SCRIPTURE_TOKEN` (the same PAT as above).
- **Labels:**
  ```
  gh label create review:auto  --color 0E8A16 --description "Claude review, auto-merge when green"
  gh label create review:opus  --color 5319E7 --description "Needs a manual Opus review"
  gh label create feedback     --color FBCA04 --description "Feedback from a phase demo"
  ```
- Rulesets, CODEOWNERS and repo options: see `docs/repo-rules.md`.

## 6. Check it
Push a `task/*` branch and open a PR. Cloudflare comments a preview URL, and the page shows "የመጽሐፍ ቅዱስ ካርታ".

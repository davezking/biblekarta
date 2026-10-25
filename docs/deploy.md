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

## 5. Scripture text in the build
`scripts/fetch-scripture.sh` runs before every build (Cloudflare and CI):
- **With `SCRIPTURE_TOKEN` and a commit SHA in `scripture.lock`:** it fetches exactly that commit of `biblekarta-scripture` into `.scripture/` and logs `using scripture <sha>`. The token reaches git only through a `GIT_ASKPASS` helper and is never printed.
- **Otherwise:** it uses `scripture-fixtures/` (a made-up test book) and logs `using scripture fixtures`.

The choice is written to `.scripture.env`, which `pnpm verify:scripture` and `pnpm build` read. The build copies the **verified** books byte-for-byte to `/data/scripture/<id>.json` and re-checks every verse against `checksums.json`.

**Production guard** (`src/build/copy-scripture.ts`): a production build (no `BK_SEED=1`) never ships the fixture test book.
- **No text release yet** (`scripture.lock` is `none`): it builds and publishes **no** scripture, so verses show "በዝግጅት ላይ".
- **A release is pinned but only the fixtures were fetched** (e.g. `SCRIPTURE_TOKEN` missing): the build **fails**.
- **Real text:** every published book must be the Society's edition (`BSE-1954-html+scan`), and the whole folder must pass `verify:scripture` (checksums, verse counts, text rules) before anything is copied.

**Releasing a new text version:**
1. In `biblekarta-scripture`, after `bk finalize` and a green `bk verify`: `git tag text-v<N> && git push origin text-v<N>`.
2. Get the commit: `git -C ../biblekarta-scripture rev-parse text-v<N>`.
3. Put that 40-character SHA in this repo's `scripture.lock` (it is `none` until text-v1 exists), in a PR a code owner approves.

## 6. GitHub repo settings (`biblekarta`)
- **Actions secret:** `SCRIPTURE_TOKEN` (the same PAT as above). No Claude token is needed: the owner orders PR reviews in a Claude Code session (`docs/WORKFLOW.md` §3).
- **Labels:**
  ```
  gh label create review:auto  --color 0E8A16 --description "Owner orders a Sonnet review before merging"
  gh label create review:opus  --color 5319E7 --description "Owner orders an Opus review before merging"
  gh label create feedback     --color FBCA04 --description "Feedback from a phase demo"
  ```
- Rulesets, CODEOWNERS and repo options: see `docs/repo-rules.md`.

## 7. Check it
Push a `task/*` branch and open a PR. Cloudflare comments a preview URL, and the page shows "የመጽሐፍ ቅዱስ ካርታ".

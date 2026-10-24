# Bible Karta · የመጽሐፍ ቅዱስ ካርታ

A free, non-profit web app ([biblekarta.com](https://biblekarta.com)) that shows the whole Bible as a chart of flowing streams, in Ethiopian manuscript style, for Amharic readers. See `architecture.md` for the design and `docs/WORKFLOW.md` for how it's built.

This repo is **public** and never contains Bible text. The text lives in the private `biblekarta-scripture` repo; without access, the site builds against `scripture-fixtures/` (a non-scriptural test book).

## Setup
Node 22 and pnpm (see `.nvmrc` and `packageManager`).

```
pnpm i
pnpm exec playwright install chromium   # once, for the E2E tests
scripts/fetch-scripture.sh              # fixtures until P1-S3-T5
pnpm dev                                # http://localhost:4321
```

## Commands
| | |
|---|---|
| `pnpm lint` · `pnpm typecheck` · `pnpm test` | ESLint + Prettier · astro check + tsc · Vitest |
| `pnpm validate` · `pnpm verify:scripture` | content validation · scripture integrity |
| `pnpm build` · `pnpm preview` | static build to `dist/` · serve it |
| `pnpm e2e` | Playwright (desktop + mobile) |

## Deploy
Cloudflare Pages: `docs/deploy.md`. Rulesets and CODEOWNERS: `docs/repo-rules.md`.

# Deployment

Every setting that decides what a deployment *is*, written down — because until this file existed
the answer lived in a dashboard, and a dashboard is not reviewable.

## The three hosts

| Host | What runs there | Deployed by | State |
|---|---|---|---|
| **`alpha.brain.dog`** | `apps/worker` with `apps/web`'s `build/` as its asset directory, built as **BrainDog Alpha** | Cloudflare Workers Builds `braindog-alpha`, on every push to `master` | live |
| **`app.brain.dog`** | the same two, built as production | Cloudflare Workers Builds `braindog-production`, on every push to `release` | live |
| **`brain.dog`** | `apps/site`, the marketing site | not wired yet | not live |

`wrangler.jsonc` holds both environments; `wrangler deploy --env alpha --dry-run` and
`--env production --dry-run` are what check them without deploying.

## Why Workers Builds and not a GitHub Action

**No API token passes through anybody.** Cloudflare's GitHub App builds from the repository and
mints its own short-lived build token; nothing is stored in GitHub secrets, nothing is copied into a
terminal, and there is no long-lived credential to rotate or leak. `deploy.yml` is written and
unlanded for exactly this reason — it needs `CLOUDFLARE_API_TOKEN` in a `production` environment,
and a workflow that fails on every merge is worse than one that is not there.

The cost is that the build configuration lives in Cloudflare's dashboard rather than in this
repository, which is what the rest of this file is for.

## `braindog-alpha` — the settings, verbatim

| Setting | Value |
|---|---|
| Repository | `actuallyhoss/BrainDog` |
| Production branch | `master` |
| Root directory | `/apps/worker` |
| Build command | `pnpm install --frozen-lockfile && BRAINDOG_ENV=alpha pnpm --filter @braindog/web build` |
| Deploy command | `npx wrangler deploy --env alpha` |
| Non-production branch command | `npx wrangler versions upload` |
| Build token | Cloudflare's own |

**`BRAINDOG_ENV=alpha` is the whole of the deployment's identity.** `apps/web/vite.config.ts` reads
it, refuses a value that is not a deployment, substitutes `__BRAINDOG_ENV__` as a literal, and
aliases `@braindog/skin/house.css` to `alpha.css`. Everything downstream follows from that one
variable: the accent, the `ALPHA` badge beside the mark, `· BrainDog Alpha` in the tab, and
`mark-alpha.svg` as the favicon. Drop it and the build is production wearing alpha's hostname —
which is the one confusion the whole environment mechanism exists to prevent.

A non-production branch uploads a **version** and does not deploy it, so a branch cannot take the
hostname. That is the setting that makes "builds for non-production branches" safe to leave on.

## Resources the deploy needs to already exist

`wrangler deploy` fails on a binding whose resource is missing, and says which. Both queues are
created:

- `braindog-ingress-alpha` — the alpha outbox
- `braindog-ingress` — production's, created ahead of the deployment that will need it

Durable Object migrations are in `wrangler.jsonc` and apply themselves on deploy.

## Checking a deployment without opening a browser

```
curl -s -o /dev/null -w '%{http_code}\n' https://alpha.brain.dog/          # 200, the shell
curl -s https://alpha.brain.dog/api/health                                  # a typed refusal, not a 500
```

The API answering `{"ok":false,"refusal":{"code":"UNAUTHORIZED","fix":"…"}}` with a 401 is the
correct healthy answer: a refusal is a value, and one arriving over the wire with its `fix` sentence
intact is the whole posture working end to end.

## `braindog-production` — the settings, verbatim

| Setting | Value |
|---|---|
| Repository | `actuallyhoss/BrainDog` |
| Production branch | **`release`** |
| Builds for non-production branches | **off** |
| Root directory | `/apps/worker` |
| Build command | `pnpm install --frozen-lockfile && pnpm --filter @braindog/web build` |
| Deploy command | `npx wrangler deploy --env production` |

**No `BRAINDOG_ENV`, and that absence is the setting.** Production is the absence of an environment
rather than one of them — `env.ts` fails to production, so a build that loses its `define` renders
the shipped product rather than a half-labelled alpha one, and there is nothing here to lose.

**A production deploy is a merge somebody makes**, not a push they forgot was a push: `release` only
moves forward from a `master` that has been green, and nothing else can reach it — non-production
branch builds are off, so a branch cannot take the hostname.

## What is not automated, and should be

- **The marketing site has no build project**, and `apps/site/wrangler.jsonc` is ready for one.
- **Nothing in CI runs `wrangler deploy --dry-run`**, so a binding removed from `wrangler.jsonc`
  fails at deploy time rather than at pull-request time.

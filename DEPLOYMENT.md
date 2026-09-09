# Deployment

Every setting that decides what a deployment *is*, written down — because until this file existed
the answer lived in a dashboard, and a dashboard is not reviewable.

## The hosts

One label per surface, with the environment in front of it.

| Host | What runs there | Deployed by | State |
|---|---|---|---|
| **`brain.dog`** | `apps/site`, the marketing site | `wrangler deploy --env production`, by hand for now | **live** |
| **`www.brain.dog`** | nothing: a 301 to the apex | a Redirect Rule, not a Worker | live |
| **`app.brain.dog`** | `apps/worker` with `apps/web`'s `build/` as its asset directory | Workers Builds `braindog-production`, on every push to `release` | live |
| **`mcp.brain.dog`** | reserved | nothing | not claimed |
| **`alpha.brain.dog`** | `apps/site`, the same bytes | `braindog-site-alpha`, deployed by hand for now | live |
| **`app.alpha.brain.dog`** | the record, built as **BrainDog Alpha** | Workers Builds `braindog-alpha`, on every push to `master` | live |
| **`mcp.alpha.brain.dog`** | reserved | nothing | not claimed |

`mcp.*` is deliberately unclaimed, and both names now resolve to nothing, which is the honest
answer for a service that is not built. `mcp.brain.dog` used to answer 525: a `*.brain.dog` CNAME
was claiming it, and every other name in the zone with it. A wildcard means no name is ever
unclaimed. It is gone.

The MCP transport is not built, and pointing that hostname at the Worker would answer an MCP
address with the app's shell. `apps/web`'s first-run screen does print
`claude mcp add --transport http braindog https://mcp.brain.dog`, which is a command nobody can run,
and that is a defect filed in `loop/BACKLOG.md` rather than a reason to claim the name.

**`brain.dog` was blocked on three A records, and they are gone.** The apex carried
`172.239.193.194`, `172.236.103.15` and `172.234.212.77`, all proxied, all pointing at an origin
that answered nothing, which is why the hostname returned 520. Cloudflare refuses to attach a Worker
to a hostname whose DNS it does not control, so those three had to go before
`wrangler deploy --env production` could claim it. Deleted 2026-09-09, values kept above so the
change is reversible. Mail was unaffected and was checked afterwards: the three MX records, the SPF
line and the DKIM key are all still there.

**The wildcard went in the same pass**, for the reason under `mcp.*` above: `*.brain.dog` was a
proxied CNAME to the apex, so every name in the zone resolved to whatever the apex was, and the one
name this document says must stay unclaimed was claimed by a record nobody wrote it for.

**`www` is a redirect and not a second copy of the site.** A Worker can hold several custom domains
and this one has no code, so it cannot redirect; serving the same three pages on two hostnames is
the duplicate-content problem `workers_dev: false` already exists to avoid. So `www.brain.dog` keeps
its proxied CNAME and a Redirect Rule sends `https://www.*` to `https://${1}` with a 301, query
string preserved, because a campaign parameter that survives the click is the whole point of one.

Measured after the change: `brain.dog` 200 serving `apps/site`, `/pricing` and `/changelog` 200,
an unknown path 404 rather than the shell, `www.brain.dog` 301 to the apex, `alpha.brain.dog`,
`app.brain.dog` and `app.alpha.brain.dog` all 200, both `mcp.*` names absent.

`wrangler.jsonc` holds both environments; `wrangler deploy --env alpha --dry-run` and
`--env production --dry-run` are what check them without deploying.

## What the zone does, beyond DNS

Three settings that are not records and are not in any file here, so they are written down for the
same reason the rest of this document exists.

| Setting | Where | State | Why |
|---|---|---|---|
| **Always Use HTTPS** | SSL/TLS, Edge Certificates | **on**, set 2026-09-09 | `http://brain.dog` served the full page with a 200 and no redirect. Every origin in this zone is a Worker and none of them redirects, so there is no loop to cause. |
| **www to apex** | Rules, Redirect Rules | on | `https://www.*` to `https://${1}`, 301, query string preserved. |
| **Block AI Bots** | AI Crawl Control | **on**, and it is not this repository's to change | See below. |

### Block AI Bots, and why it is left alone

Cloudflare's managed `robots.txt` disallows Amazonbot, Applebot-Extended, Bytespider, CCBot,
ClaudeBot, Claude-User, FacebookBot, Google-Extended, Google-CloudVertexBot, GPTBot and
meta-externalagent, and it overrides the `robots.txt` this repository ships in
`apps/site/static/`. That file is still worth having: it is what serves the day the managed one is
switched off, and it carries the sitemap.

**The split is defensible and one row of it is not.** Cloudflare separates AI Crawler, which is
training and bulk collection, from AI Assistant, which is one person asking an assistant a question
about your site. `ChatGPT-User` and `DuckAssistBot` are AI Assistant and are allowed;
`Claude-User`, which is the same thing for the same reason, is filed under AI Crawler and is
blocked. So a person asking ChatGPT what BrainDog is gets an answer and a person asking Claude does
not, on the marketing site of a product whose argument is that your agents can read your record.

It is one switch and it is a decision about training data as well as about assistants, which makes
it the owner's rather than this repository's. The per-crawler toggles cannot be used while the
zone-level setting is on: the dashboard says so in a tooltip on every row it governs.

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
curl -s -o /dev/null -w '%{http_code}\n' https://app.brain.dog/           # 200, the shell
curl -s https://app.brain.dog/api/health                                   # a typed refusal, not a 500
curl -s -H 'authorization: Bearer rec_0000000000000000000000000.x' https://app.brain.dog/api/boot
```

The API answering `{"ok":false,"refusal":{"code":"UNAUTHORIZED","fix":"…"}}` with a 401 is the
correct healthy answer: a refusal is a value, and one arriving over the wire with its `fix` sentence
intact is the whole posture working end to end.

**The third line is the one that used to lie.** A well-formed bearer for a record nobody has came
back `500 INTERNAL`, `not authorized: SQLITE_AUTH`, because `route()` asks the Directory whether the
address is one of ours before it addresses anything, and opening the Directory read
`PRAGMA user_version` unguarded on a platform whose SQLite authorizer refuses `PRAGMA`. The tenant
map was unreachable on this host and nothing said so, because the only way to reach that line is to
present a credential the host has never issued. The revision lives in a `dir_meta` row now.

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

- **The marketing site has no build project.** Both `alpha.brain.dog` and now `brain.dog` were
  deployed by hand, with `wrangler deploy --env alpha` and `--env production`. That is fine once and
  wrong as a habit: the site is then whatever somebody last pushed from a laptop, and the apex is the
  one hostname where that shows. Two projects are wanted, matching the Worker's pair.
- **The `www` redirect is a dashboard rule and is in no file here.** It is one Redirect Rule, and
  the rest of this document exists because a setting that lives only in a dashboard is a setting
  nobody can review. Its terms: `https://www.*` to `https://${1}`, 301, query string preserved.
- **Nothing in CI runs `wrangler deploy --dry-run`**, so a binding removed from `wrangler.jsonc`
  fails at deploy time rather than at pull-request time.

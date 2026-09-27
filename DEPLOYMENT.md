# Deployment

Every setting that decides what a deployment *is*, written down — because until this file existed
the answer lived in a dashboard, and a dashboard is not reviewable.

## The hosts

One label per surface, with the environment in front of it.

| Host | What runs there | Deployed by | State |
|---|---|---|---|
| **`brain.dog`** | `apps/site`, the marketing site; and the app, `apps/worker`, under `/app` and on its doors, handed over by the site's `APP` service binding | `wrangler deploy --env production`, by hand for now | **live** |
| **`www.brain.dog`** | nothing: a 301 to the apex | a Redirect Rule, not a Worker | live |
| **`app.brain.dog`** | `apps/worker` with `apps/web`'s `build/` as its asset directory, as the legacy host since push 4: a page load is a 308 to `brain.dog/app`, and `/api/*`, `/mcp` and `/in/*` are served where they stand | Workers Builds `braindog-production`, on every push to `release` | live, legacy |
| **`mcp.brain.dog`** | reserved | nothing | not claimed |
| **`alpha.brain.dog`** | `apps/site`, the same bytes; and alpha's app under `/app` and on its doors, through the alpha site's `APP` binding | `braindog-site-alpha`, deployed by hand for now | live |
| **`app.alpha.brain.dog`** | the record, built as **BrainDog Alpha**, as the legacy host since push 2, the same way | Workers Builds `braindog-alpha`, on every push to `master` | live, legacy |
| **`mcp.alpha.brain.dog`** | reserved | nothing | not claimed |

**The app lives on `brain.dog` since push 4 of the one-domain move** (`loop/research-one-domain-binding.md`
section 4, `loop/research-push-4.md`). The site keeps `brain.dog` as its Custom Domain and runs its
script first on the app's doors, which it hands to `braindog-production` through a service binding,
so no zone route is written. `PUBLIC_HOST` is `brain.dog`, so sign-in, the CSRF origin and the device
flow are all there; `app.brain.dog` stays the app Worker's Custom Domain for the tokens and `/in/`
addresses handed out on it, and a device start there is refused. Alpha is the same on its own names
since push 2.

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
curl -s -o /dev/null -w '%{http_code}\n' https://brain.dog/app/           # 200, the shell
curl -s https://brain.dog/healthz                                          # {"ok":true,"app":...}
curl -s https://brain.dog/api/health                                       # a typed refusal, not a 500
curl -s -H 'authorization: Bearer rec_0000000000000000000000000.x' https://brain.dog/api/boot
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

## Rolling back

`.github/workflows/deploy.yml` undoes a red deploy by itself when undoing it is safe, and holds when
it is not. What it does, in order:

1. **Before Deploy**, the step "Record what is live" saves the app's and the site's live version ids
   (`wrangler deployments status --json --env production`, in `apps/worker` and in `apps/site`) and
   the sha the live app was built from (the tail of `https://$DEPLOY_HOST/.well-known/braindog-build`)
   as `APP_PREVIOUS`, `SITE_PREVIOUS` and `LIVE_SHA`. Anything it cannot learn is left empty.
2. **After a red Parity or Smoke**, the step "Decide whether to roll back" runs
   `node apps/worker/scripts/rollback.mjs decide`, which reads `git diff --name-only` from `LIVE_SHA`
   to the deployed sha and prints one of two lines:
   - `ROLL`: the app goes back to `APP_PREVIOUS`, and after a red Smoke the site goes back to
     `SITE_PREVIOUS` too. After a red Parity the site was never deployed, so it is left alone. The
     next two steps run `wrangler rollback <version> --env production`.
   - `HOLD`: nothing is rolled back, and the line says why. It holds when a file under
     `packages/kernel/src/migrations/` changed (every record that opened on the new build has run
     the migration, and the build before refuses a record newer than it knows), when the
     `migrations` block of `apps/worker/wrangler.jsonc` changed (the version before does not carry
     the new Durable Object class), when `DIRECTORY_VERSION` in `packages/record/src/directory.ts`
     changed (an older Worker refuses the newer Directory, which serves every record), and when
     anything it needs is unknown.
3. **The run stays red either way.** A deploy that was undone is still a deploy that did not work.

**After a HOLD**, the bad version is live and the fix goes forward: a new branch, a pull request,
green checks, a merge. If a record itself is broken, restore it to the copy taken before the push
(Settings > Backups on that record), and writes since that copy are lost.

**By hand**, when the automatic step could not act (a version was not recorded, or `wrangler`
refused), find the version that served before and put it back:

```
cd apps/worker
pnpm exec wrangler deployments list --env production
pnpm exec wrangler rollback <version-id> --env production --message "<why>"
curl -s https://brain.dog/healthz                  # "app" names the sha you rolled back to
```

The same two commands in `apps/site` roll the marketing site back. Three things to know first:

- **Never after a kernel migration, a Durable Object class migration or a `DIRECTORY_VERSION`
  change**, for the reasons the HOLD line gives. Read `git diff --name-only <live sha> <bad sha>`
  before rolling back by hand.
- **`wrangler` asks before putting back a version whose secrets have changed since it was
  deployed**, and in a runner it answers yes by itself. If the old version cannot run with the
  secrets as they are now, say no and fix forward.
- **A hand rollback lasts until the next green `ci` on `master`**, because `deploy.yml` deploys the
  app and the site again from there. `git revert` of the bad commit is what keeps one.

**The signed-in half of Smoke** asks `boot` on one record with a read token, which is the only
question that sees a migration refusing real rows. It is off until the operator sets it up once:
make a record for it (for example `ops`), mint a read token on it with
`braindog token create --name smoke --scope read --host https://brain.dog/app/ops`, and store the token as the
GitHub secret `SMOKE_TOKEN` and the record's name as the variable `SMOKE_SLUG`. Unset, Smoke prints
that the half was skipped. A token that expires turns Smoke red with a 401 that names `SMOKE_TOKEN`,
and that red rolls the deploy back like any other, so mint the next token (`--days` sets how long it
lives) before this one lapses.

## Pushing a workflow

A workflow's changes reach production as one push. With a live record on production, every push
goes like this.

**Once, before the first push:**

1. Add a required reviewer to the `production` environment (the repository's Settings >
   Environments > production > Required reviewers), so no merge deploys without a press.
2. Run the restore drill once against last night's copy of the live record, so "restore from last
   night" below is known to work: `node apps/cli/scripts/restore-drill.mjs <night.brainl.age> --identity <file>`,
   with the identity file kept outside this repository.
3. Optionally, the canary record and `SMOKE_TOKEN` above.

**Every push:**

1. The workflow lands on a branch `finish/wN` as a pull request labelled `full-gates`. `ci.yml` and
   `gates.yml` run there, and the repair goes on until both are green. Nothing deploys from a branch.
2. If anything under `packages/kernel/src/migrations/` changed, rehearse it on last night's copy of
   the live record against the deployed sha, which is the tail of
   `curl -s https://brain.dog/.well-known/braindog-build`:
   `node apps/cli/scripts/migration-rehearsal.mjs <night.brainl.age> --identity <file> --deployed <sha>`.
   FAIL stops the merge.
3. Take a restore point: Settings > Backups > "Back up now" on the live record, and
   `braindog export -o <record>-<date>.brainl` on your own machine.
4. Merge. `ci` runs on `master`, `deploy.yml` waits for the reviewer's approval, then Deploy, Parity,
   the site, Smoke (with the signed-in half when it is set up).
5. **Red before anything irreversible** (no kernel migration, no Durable Object class migration, no
   `DIRECTORY_VERSION` change in the diff): the app, and the site after a red Smoke, go back to the
   recorded versions by themselves. **Red after one**: the run holds and says why; the fix goes
   forward on a new branch. If the live record itself is broken, restore it from Settings > Backups
   to the restore point of step 3.
6. For fifteen minutes, watch `pnpm exec wrangler tail --env production --format json` in
   `apps/worker` for lines with `"op":"crash"`, `"op":"refuse"` or `"op":"mail"`. Then open the
   live record on a phone and on a laptop: Home, Money, one write, one search, one sign-in.

## What is not automated, and should be

- **The marketing site has no build project.** Both `alpha.brain.dog` and now `brain.dog` were
  deployed by hand, with `wrangler deploy --env alpha` and `--env production`. That is fine once and
  wrong as a habit: the site is then whatever somebody last pushed from a laptop, and the apex is the
  one hostname where that shows. Two projects are wanted, matching the Worker's pair.
- **The `www` redirect is a dashboard rule and is in no file here.** It is one Redirect Rule, and
  the rest of this document exists because a setting that lives only in a dashboard is a setting
  nobody can review. Its terms: `https://www.*` to `https://${1}`, 301, query string preserved.

# Deployment

Every setting that decides what a deployment *is*, written down, because a setting that lives only in
a dashboard is a setting nobody can review. What an operator does to a running deployment (the nightly
walk, backups, restores, key rotation, incidents, deletion) is in
[docs/53-SPEC-OPERATIONS.md](docs/53-SPEC-OPERATIONS.md); this file is what the deployment is, what it
is configured with, and how a change reaches it.

## The hosts

One label per surface, with the environment in front of it.

| Host | What runs there | Deployed by | State |
|---|---|---|---|
| **`brain.dog`** | `apps/site`, the marketing site; and the app's old address, handed to `apps/worker` on the doors `run_worker_first` lists in `apps/site/wrangler.jsonc` by the site's `APP` service binding: a page load under `/app` is one 308 to the same page at the root of `app.brain.dog`, and `/api/*`, `/mcp` and `/in/*` are served where they stand | `.github/workflows/deploy.yml`, after a green `ci` on `master` and the reviewer's press | **live** |
| **`www.brain.dog`** | nothing: a 301 to the apex | a Redirect Rule, not a Worker | live |
| **`app.brain.dog`** | the production app Worker, `apps/worker` with `apps/web`'s `build/` as its asset directory; the app is at the root, a record at `app.brain.dog/<slug>` | the same `deploy.yml` run, since it is a Custom Domain of that Worker | **live** |
| **`mcp.brain.dog`** | reserved | nothing | not claimed |
| **`alpha.brain.dog`** | `apps/site`, the same bytes; and alpha's app's old address, handed over by the alpha site's `APP` binding the same way | `deploy.yml`'s alpha steps when the variable `DEPLOY_ALPHA` is `true`, otherwise by hand | live |
| **`app.alpha.brain.dog`** | alpha's app Worker, built as **BrainDog Alpha** | the same | live |
| **`mcp.alpha.brain.dog`** | reserved | nothing | not claimed |

**The app lives on `app.brain.dog`** (alpha: `app.alpha.brain.dog`), at its root: a record is
`https://app.brain.dog/<slug>`. It was under `/app` from the one-domain move until 29 Oct, and on this name since push
C. `PUBLIC_HOST` is `app.brain.dog`, so sign-in, the CSRF origin and the device flow are all there, and `LEGACY_HOSTS`
is `brain.dog`: the site keeps `brain.dog` as its Custom Domain and runs its script first on the app's doors and on
`/app`, which it hands to `braindog-production` through a service binding, so no zone route is written. A page load on
`brain.dog/app/...` or `app.brain.dog/app/...` is one 308 to `https://app.brain.dog/...`, the `/app` taken off and the
rest and the query kept (never two hops). A record's API under the old address, `/app/<slug>/api/*`, is still served
where it stands for a hosts file written before the move, and
`/api/*`, `/mcp` and `/in/*` on `brain.dog` are served and never redirected, so a token or an `/in/` address handed out
there keeps working for at least the 90 days a token lives and until every `/in/` address is re-minted. A device start on
`brain.dog` is refused and names `app.brain.dog`. Everybody signs in once more after the push, because a session cookie
belongs to the name that set it. Passkeys keep `RP_ID` `brain.dog`, so none is stranded. A self-host sets its own
`PUBLIC_HOST` and no `LEGACY_HOSTS`, and none of this reaches it.

`mcp.*` is deliberately unclaimed, and both names resolve to nothing. The MCP door is
`https://app.brain.dog/mcp`, a path on the app's own host like every other door, so there is no service
for a second name to point at. `mcp.brain.dog` used to answer 525: a `*.brain.dog` CNAME was claiming
it, and every other name in the zone with it. A wildcard means no name is ever unclaimed. It is gone.

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

`apps/worker/wrangler.jsonc` and `apps/site/wrangler.jsonc` each hold both environments. `ci`'s
`build` job dry-runs both production deploys on every push, with no Cloudflare token in its
environment, and `wrangler deploy --env alpha --dry-run` or `--env production --dry-run` checks one
by hand without deploying.

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
it the maintainer's rather than this repository's. The per-crawler toggles cannot be used while the
zone-level setting is on: the dashboard says so in a tooltip on every row it governs.

## How a change reaches production

**One route, and it is the steps of `.github/workflows/deploy.yml`.** They run either on GitHub, started
by hand from `master`, or from a maintainer's machine through `pnpm ship:deploy` (`tools/ship`), which
reads and runs the same steps and refuses unless HEAD is `origin/master` and a full local CI passed on
it. Nothing else deploys production: not a Workers Builds project, not a push to a branch. The route,
in order:

1. A change lands on `master` by a merged pull request (a workflow's changes come as one, labelled
   `full-gates`; "Pushing a workflow" below).
2. `ci` runs on the push to `master`. The deploy is then started by hand, and its job runs only when
   the ref is `master` in this repository.
3. The `deploy` job names the `production` environment, so it waits there for the required
   reviewer's press (below). Deploys queue one at a time and are never cancelled half way.
4. On the runner, in order: the shell is built; "Record
   what is live" saves the live version ids and sha for a rollback; Deploy (`wrangler deploy --env
   production --var BRAINDOG_BUILD:<id>`); Parity (`deploy-parity` against the live host); the
   marketing site is built and deployed; Smoke, with its signed-in half when `SMOKE_TOKEN` is set;
   the sandbox smoke, when `OPS_RECORD` is set.
5. A red Parity or Smoke rolls back what is safe to roll back and holds what is not ("Rolling back"
   below). Alpha follows last, only when `DEPLOY_ALPHA` is `true`, and its failure never turns the
   production run red.

**No Workers Builds.** Earlier revisions of this file described two Workers Builds projects,
`braindog-alpha` on `master` and `braindog-production` on `release`, deploying from Cloudflare's own
build token. They are not how anything deploys now, and a build project left connected would deploy
past `ci` and past the reviewer on its own branch. In the dashboard, Workers & Pages >
`braindog-production` and `braindog-alpha` > Settings > Build: the Git connection should read
**not connected**. If either still shows a repository, disconnect it. That check is the maintainer's,
because it cannot be read from this repository.

**`BRAINDOG_ENV=alpha` is the whole of alpha's identity.** `apps/web/vite.config.ts` reads it,
refuses a value that is not a deployment, substitutes `__BRAINDOG_ENV__` as a literal, and aliases
`@braindog/skin/house.css` to `alpha.css`: the accent, the `ALPHA` badge beside the mark,
`· BrainDog Alpha` in the tab, and `mark-alpha.svg` as the favicon. `deploy.yml`'s alpha steps set it
for alpha's two builds. Production is the absence of it: `env.ts` falls back to production, so a build
that loses its `define` renders the shipped product rather than a half-labelled alpha one.

## The reviewer

The `production` environment carries a required reviewer, so no merge deploys without a person
pressing Approve. It is set once: the repository's Settings > Environments > `production` > Required
reviewers, the maintainer's account, and "Prevent self-review" left off so a maintainer can approve
their own merge. Deployment branches: `master` only. The `deploy` job then shows "Waiting" until the press, and a run nobody approves within 30
days expires without deploying. The environment is also where `CLOUDFLARE_API_TOKEN` lives, so the
token reaches this one job and no other workflow.

## What the deploy reads from GitHub

| Name | Kind | Where | Meaning |
|---|---|---|---|
| `CLOUDFLARE_API_TOKEN` | secret | environment `production` | a token scoped to deploy Workers on the account and nothing else (12 §8) |
| `CLOUDFLARE_ACCOUNT_ID` | variable | repository | the account; empty, and `deploy` is skipped rather than red |
| `DEPLOY_HOST` | variable | repository | `app.brain.dog`, the host Parity and Smoke ask; empty, and `deploy` is skipped |
| `SMOKE_TOKEN` | secret | environment `production` | a token on the canary record, `propose` or above; unset, the signed-in half of Smoke and the sandbox smoke say they were skipped |
| `SMOKE_SLUG` | variable | repository | the canary record's slug, the same record `OPS_RECORD` names |
| `DEPLOY_ALPHA` | variable | repository | `true` deploys alpha after production; anything else leaves alpha alone |
| `IMAGE_PUSH` | variable | repository | `true` lets `image.yml` push the self-host image to ghcr.io |

## The Worker's secrets, variables and bindings

Every name the production Worker reads, and what it does when the name is unset. Variables live in
`env.production.vars` in `apps/worker/wrangler.jsonc`, so a change to one is a reviewed commit;
secrets never appear in any file and are put with `wrangler secret put <NAME> --env production` in
`apps/worker`, the value typed at the prompt and never as an argument. Every name is optional: an
unset one switches its feature off and says so, and none is under `secrets.required`, because that
key fails the first deploy of an environment while the secret is unset.

| Name | Kind | Unset means | Set means |
|---|---|---|---|
| `SESSION_SECRET` | secret | `/auth/methods` says `not-configured` and every other `/auth` route is 404 | 32 characters or more; every session, link and challenge hash is an HMAC under it, so a new value signs everybody out (53 §5.11 (c)) |
| `TOKENS_VALID_FROM` | secret | no cut-off | an ISO instant with its zone, such as `2026-09-25T12:00:00Z`; every token, device grant and operation grant made before it is refused `UNAUTHORIZED`. An unreadable value refuses every bearer and writes one `cut-off` line (53 §5.11 (c)) |
| `PROVISION_KEY` | secret | `/auth/provision`, `/auth/claim/mint` and `/auth/suspend` are 404 | the operator's bearer for those three doors, locked out on a wrong key like any other |
| `KEK` | secret, or a Secrets Store binding of the same name | `/api/vault/*` answers `NOT_IN_THIS_BUILD`, and `/auth/provision` refuses rather than make a keyless record | 32 bytes as 64 hex characters or base64url. During a rotation it holds two keys, the new one, a space, and the old one (53 §5.6). There is no `KEK_PREV` |
| `VAPID_PRIVATE` | secret | Web Push stays `pending` | the private half of `VAPID_PUBLIC` |
| `STRIPE_SECRET_KEY` | secret | every billing door answers `NOT_IN_THIS_BUILD` naming it | `sk_test_...` while `BILLING` is `test`, `sk_live_...` only once the owner says so |
| `STRIPE_WEBHOOK_SECRET` | secret | the webhook refuses | the `whsec_...` Stripe shows for the endpoint `https://app.brain.dog/account/billing/webhook` |
| `TURNSTILE_SECRET` | secret | sign-up runs on the Directory's lockouts alone | the secret half of `TURNSTILE_SITE_KEY`; `signup.start` checks the widget's answer with it |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | secrets | the sign-in page offers no Google, and Connect Google says it is not set up here | one Google OAuth web client for both: sign-in with Google (redirect `https://<PUBLIC_HOST>/auth/google/callback`) and Connect Google (redirect `https://<PUBLIC_HOST>/api/google/callback`, Gmail, Calendar and Contacts read only). Refresh tokens are sealed under each record's connector key, so `KEK` must be bound too |
| `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_KEY` | secrets | no push reaches the iPhone app; a browser's push is unaffected | all three: the key id Apple shows, the team (`MG86668Z52`) and the whole `AuthKey_<id>.p8` file |
| `BILLING` | variable | `''`: billing is off, sign-up says it is not open, nothing is charged or capped | `test` or `live`, and it must agree with `STRIPE_SECRET_KEY`'s prefix or every billing door refuses, naming both |
| `STRIPE_PRICE_HOSTED`, `STRIPE_PRICE_PLUS` | variables | that plan is not sold | the `price_...` of Hosted ($12 a month) and of Cloud Plus, from the same Stripe mode as the key |
| `TURNSTILE_SITE_KEY` | variable | no widget on the sign-up page | the public half of the Turnstile widget |
| `OPS_RECORD` | variable | the walk writes its summary nowhere, and the sandbox smoke is skipped | the operator's canary record id, `rec_...`: the night's note goes there (53 §5.1) |
| `AUTH_MAIL_FROM` | variable | no sign-in links, no sign-up, no invitation proof | the sender for sign-in mail, on a domain Email Service sends for; production is `hello@brain.dog` |
| `MAIL_FROM` | variable, not yet in `wrangler.jsonc` | notification and account mail goes from `AUTH_MAIL_FROM` | the sender for notification, lapse and account mail |
| `SUPPORT_ADDRESS` | variable, not yet in `wrangler.jsonc` | every mail's footer says to contact whoever runs this BrainDog | the address support mail reaches, named in every mail's footer |
| `OPERATOR_EMAILS` | variable | nobody is the operator by session; only `PROVISION_KEY` as a bearer opens `/account/ops/*` and the Kennel's review | the operator's own addresses, comma separated: signed in as one, the app shows Admin (`/admin`, applications, invites, codes, the review queue, the funnel, the people) and that session opens those doors with no key. There is no admin host |
| `OPS_ALERT_TO` | variable, production only | no mail on a `crash` or `refuse` line | where those lines are mailed, once a kind in 15 minutes ("Alerts" below) |
| `AGE_RECIPIENT` | variable | the walk refuses every record's copy and says why | the age recipient every nightly copy is sealed to; its identity lives outside Cloudflare (53 §8) |
| `PUBLIC_HOST`, `RP_ID`, `LEGACY_HOSTS` | variables | no cookie origin, no passkeys, no legacy host | `app.brain.dog`, `brain.dog`, `brain.dog` |
| `PROVISION_WITHOUT_KEYS` | variable | a record is never made without keys | `yes` lets `/auth/provision` make a keyless record on purpose |
| `VAPID_PUBLIC` | variable | no push | Web Push's public key, handed to every browser that subscribes |
| `SLASH_INCLUDED`, `SLASH_INCLUDED_MONTH_NEURONS`, `AI_GATEWAY` | variables | no included model | the included Slash model, one record's monthly ceiling in neurons, and the AI Gateway id |
| `BRAINDOG_BUILD` | variable, set by the deploy | the tuple's `app` is empty | `<date>+<sha>`, passed as `--var` by `deploy.yml` |
| `RECORD`, `DIRECTORY` | Durable Object bindings | (required) | the record and the Directory |
| `INGRESS` | queue `braindog-ingress` | (required) | the outbox doorbell |
| `BLOBS` | R2 bucket `braindog-blobs` | the nightly walk throws; files answer 501 | copies, files and final copies |
| `EMAIL` | `send_email` | no mail of any kind | Email Service |
| `AI`, `LOADER` | Workers AI; Worker Loader | no included model; no script runs ("no sandbox") | |
| `RL_READ`, `RL_WRITE` | `ratelimits` | no limit | 600 reads and 120 writes a minute per caller on `/api` and `/mcp` |
| `TELEMETRY` | Analytics Engine `braindog_telemetry`, drafted and commented | no telemetry | one point per request (see "Alerts") |

Alpha has the same names under `env.alpha`, with its own values and its own secrets, so a session or
a subscription made on one is refused by the other.

## The self-host's environment

The self-host reads its settings from its environment, usually an env file (53 §2.4). None is
required but the data directory.

| Name | Unset means | Set means |
|---|---|---|
| `BRAINDOG_DATA` | `/data` | the data directory |
| `BRAINDOG_KEK_FILE` | `<data>/kek`, made on first run | the root key file, 32 bytes, 0600. `<file>.prev` beside it during a rotation (53 §5.6) |
| `BRAINDOG_SESSION_SECRET` | the session key is derived from the key file, so a new key file signs everybody out | the session key, kept apart from the root key |
| `BRAINDOG_TOKENS_VALID_FROM` | no cut-off | as the Worker's `TOKENS_VALID_FROM` |
| `BRAINDOG_TOKEN` | no server key | a private single-user instance's owner bearer |
| `BRAINDOG_SMTP_URL`, `BRAINDOG_MAIL_FROM` | no mail: no sign-in links, no invitation proof, notification mail waits in the outbox | `smtps://user:pass@host:465`, or `smtp://...:587` with STARTTLS required, and the sender |
| `BRAINDOG_BACKUP_AT` | `03:20` | the UTC time of day the nightly copy falls due |
| `BRAINDOG_OUTBOUND` | `off`: plugins send no requests to other servers, and their scheduled actions are held | `on`: plugins may send them. The public plugin store has its own switch, `BRAINDOG_KENNEL` |
| `BRAINDOG_ORIGIN` | `http://localhost:<port>` | the public origin: sign-in links, the passkeys' relying party, the CSRF check |
| `BRAINDOG_HOST` | `127.0.0.1` without a token, `0.0.0.0` with one | the interface to listen on |
| `BRAINDOG_TRUST_PROXY` | the socket's address is the caller's | the proxies' addresses (best), or `1`: anything on loopback or a private network is a proxy, so the whole LAN is; the caller it wrote into `X-Forwarded-For` is counted. The header is ignored from any other peer |
| `PORT` | `8080` | |
| `BRAINDOG_OWNER` | first start with an empty data directory refuses, naming `init` | the owner's email: that start makes the record (`BRAINDOG_RECORD`, default `home`) and prints a one-time sign-in link |

`selfhost.env.example` at the repository root lists every name the self-host reads, each with a line on why, and
`apps/selfhost/README.md` is the stranger's walk from zero. `braindog backup <folder>` and `braindog restore <folder>`
are the self-host's carry-off copy and its way back.

## Resources the deploy needs to already exist

`wrangler deploy` fails on a binding whose resource is missing, and says which. Created:

- the queues `braindog-ingress-alpha` and `braindog-ingress`
- the R2 buckets `braindog-blobs-alpha` and `braindog-blobs`

Durable Object migrations are in `wrangler.jsonc` and apply themselves on deploy. A new class is
`new_sqlite_classes`, a rename `transferred_classes`, and never `deleted_classes`.

## Checking a deployment without opening a browser

```
curl -s -o /dev/null -w '%{http_code}\n' https://app.brain.dog/               # 200, the shell
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' -H 'Accept: text/html' https://brain.dog/app/signin?x=1      # 308 https://app.brain.dog/signin?x=1
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' -H 'Accept: text/html' https://app.brain.dog/app/signin?x=1  # 308 https://app.brain.dog/signin?x=1
curl -s https://app.brain.dog/healthz                                      # {"ok":true,"app":...,"format":...,"kernel":...,"primitives":...}
curl -s https://app.brain.dog/api/health                                       # a typed refusal, not a 500
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
curl -s https://app.brain.dog/healthz              # "app" names the sha you rolled back to
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

**The signed-in half of Smoke** asks `boot` on one record with a token, which is the only question
that sees a migration refusing real rows, and the sandbox smoke runs one script there, which is the
only witness that the Worker Loader is bound. Both are off until the operator sets up the canary
once: make a record for it (for example `ops`), put its `rec_...` id in `OPS_RECORD` in
`env.production.vars` (the nightly note goes there too), mint a token on it with
`braindog token create --name smoke --scope propose --host https://app.brain.dog/ops` (`propose`,
because the sandbox smoke's `scriptTry` refuses a read token), and store the token as the GitHub
secret `SMOKE_TOKEN` and the record's slug as the variable `SMOKE_SLUG`. Unset, each prints that it
was skipped. A token that expires turns Smoke red with a 401 that names `SMOKE_TOKEN`, and that red
rolls the deploy back like any other, so mint the next token (`--days` sets how long it lives)
before this one lapses.

## Pushing a workflow

A workflow's changes reach production as one push. With a live record on production, every push
goes like this.

**Once, before the first push:**

1. Add the required reviewer to the `production` environment ("The reviewer" above), so no merge
   deploys without a press.
2. Run the restore drill against last night's copy of the live record, so "restore from last night"
   below is known to work: `node apps/cli/scripts/restore-drill.mjs --record <rec_id> --directory
   --identity-cmd "<a command that prints the age identity>" --report https://app.brain.dog`, with
   `PROVISION_KEY` in that command's environment. It fetches the sealed copies with wrangler, opens and
   restores them in a temp folder, and posts the counts to `/account/ops/drill`, where the Directory
   keeps the host's last drill. After that it is monthly (`--print-timer` prints the launchd file),
   and every record's Settings > Backups reads "This host's last restore test", or "Never tested"
   until the first report lands (53 §5.1, §5.4).
3. Optionally, the canary record and `SMOKE_TOKEN` above.

**Every push:**

1. The change lands on a branch of its own as a pull request labelled `full-gates`. `ci.yml` and
   `gates.yml` run there, and it is fixed there until both are green. Nothing deploys from a branch.
2. If anything under `packages/kernel/src/migrations/` changed, rehearse it on last night's copy of
   the live record against the deployed sha, which is the tail of
   `curl -s https://app.brain.dog/.well-known/braindog-build`:
   `node apps/cli/scripts/migration-rehearsal.mjs <night.brainl.age> --identity <file> --deployed <sha>`.
   FAIL stops the merge.
3. Take a restore point: Settings > Backups > "Back up now" on the live record, and
   `braindog export -o <record>-<date>.brainl` on your own machine.
   The deploy also takes its own: the "Take a restore point" step of `deploy.yml` asks the Worker to open every record
   written in the last seven days, and to copy each when a migration changed. A missing `PROVISION_KEY` is red when a migration changed and "not run"
   otherwise. A 404 from that door before the deploy is "not run" either way, said as a warning when a migration
   changed, because the deploy that first ships the door has to be able to run; after the deploy the same 404 is red
   once a migration shipped. A walk that asked nobody is red while `SMOKE_SLUG` names the canary. Going back is proven monthly on the canary by `node apps/worker/scripts/go-back.mjs`, from
   `watch.yml`.
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

## Alerts

Every line the Worker writes is one JSON object with `op` first (`apps/worker/src/oplog.ts`), and
Workers Logs keeps them (`observability.enabled` in `apps/worker/wrangler.jsonc`). A line carries a
code, an id and a shape, never a value, so each alert below is a saved query over fields: in the
dashboard, Workers & Pages > `braindog-production` > Observability > Query Builder, set the
filters, pick the window, and save it under the alert's name. Eleven, and each names the runbook in
`docs/53-SPEC-OPERATIONS.md` that answers it.

| Alert | Filters | Fires when | Runbook |
|---|---|---|---|
| Crash | `op` = `crash` | any row in 15 min | find the `ref` the person was shown, read `where` and `error`; if it started with a deploy, "Rolling back" above; more than one door, 53 §5.11 |
| Migration refusal | `op` = `refuse` | any row in 15 min | 53 §5.3 |
| Failed snapshot | `op` = `walk`, `backup` = `failed` | any row | 53 §5.4 |
| Erasure open | `op` = `walk`, `erase_open` > 0 | any row: an `erase.r2` row pending longer than a day, dead, or done with its object still in the bucket | 53 §5.8 |
| Dead outbox row | `op` = `outbox`, `state` = `dead`, `kind` != `erase.r2` | 3 or more records in 24 h (a provider, not a customer) | 53 §5.15 |
| Connector paused | `op` = `outbox`, `kind` = `pull.fetch`, `http` in 401, 403 | 3 or more records on one `ingest` in 24 h: a provider changed | 53 §5.12 |
| KEK straggler | `op` = `walk.done`, `stragglers` > 0 | two nights in a row | 53 §5.6 |
| Model | `op` = `model` | any row in 15 min (mailed as BrainDog model) | read `raw`: one that names the model means the route table (`MODELS` in `apps/worker/src/inference.ts`), one that names the account or gateway means the provider's console; from the model-checks workflow, read `model-checks.json` in that run's artifacts |
| Night | `op` = `walk.done` with `backups_failed` > 0, or `op` = `walk`, `backup` = `failed` (mailed as BrainDog night) | the night's run | 53 §5.4 |
| Held alarm step | `op` = `alarm-step`, `held` = true (mailed as BrainDog step when the hold starts) | any row | a record's object was reset in the same alarm step two alarms in a row, so that step is skipped for six hours (`apps/worker/src/alarm-cuts.ts`); read the `cut` lines (`step`, `times`) and the `Record$` alarm events' CPU time beside them; `act:<script>` names the script whose calls into the record were running |
| Kept arrival | `op` = `door`, `waiting` = true or `gave_up` = true (mailed as BrainDog door after six failed tries, and on giving up) | any row | a webhook the record could not take was kept sealed in `BLOBS` under `held/wait/` and is sent again on a ladder to twelve hours (`apps/worker/src/held.ts`); `waiting` for hours means the record is refusing arrivals, so read its `Record$` errors; `gave_up` means the door will never take it (gone, off, too big, or sealed under a rotated `SESSION_SECRET`), and the request stays under `held/gave-up/` |

`erase.r2` has its own row rather than riding "Dead outbox row", because 53 §2.3 asked only for a
dead one, and a deletion that sits pending for days is the same broken promise to a person who
asked to be forgotten. The walk counts both in `erase_open` (`apps/worker/src/nightly.ts`).

**What mails you.** Cloudflare cannot mail on these lines for this account: Observability alerts
are not offered, and the zone is on the free plan, so there are no Health Checks. The Worker and the
site mail instead, both through the `EMAIL` (`send_email`) binding, to `OPS_ALERT_TO`
(`admin@brain.dog` in production only; unset is off). The other five are read by a person: the
morning check of 53 §5.1 step 5 opens each saved query, and a red row opens its runbook. The nightly
ones also reach the ops record, where the walk writes its summary as a note once `OPS_RECORD` is set.

- **Crash and migration refusal.** Every `op: crash` and `op: refuse` line also sends one plain
  mail (`opsAlert` in `apps/worker/src/mail.ts`): the op, the line's `ref`, `where`, `rec` and
  `code`, the build, and the runbook from the table above. Never the `error` sentence, which stays
  in the log. At most one per kind in 15 minutes, held per isolate and across isolates by one
  storage key per kind in the Directory (`alertDue`); if the Directory cannot be asked, the isolate's
  own window is the cap.
- **Uptime.** `apps/watchdog` is a Worker of its own (cron every five minutes, no route, no binding to the app), so it
  still runs when brain.dog's Workers do not. It asks the public names for the site's `/`, the app's `/`, `/healthz` (200 and `"ok":true`),
  `/mcp` with no token (the 401 carrying the OAuth `resource_metadata`) and `/signin`. The second failing run in a row
  mails "BrainDog is down" once, naming the probes, and the first clean run after it mails "BrainDog is up again". The
  count is kept in KV. Each probe's latency goes to the `braindog_probes` Analytics Engine dataset (name, ok, status,
  milliseconds) and to the log, with `slow` set over three seconds. Not deployed until its KV id is filled in
  (`apps/watchdog/wrangler.jsonc`).

Also set up in Notifications: "BrainDog: Cloudflare incident", major and critical incidents, to
admin@brain.dog. No Worker has a Workers Builds trigger; deploys go through the pipeline or by hand.

**Telemetry.** Off until you bind it (H5). `TELEMETRY` is drafted and commented in
`apps/worker/wrangler.jsonc`; uncommented, and with `SESSION_SECRET` set, the Worker writes one
Analytics Engine point per request to `braindog_telemetry` (`apps/worker/src/telemetry.ts`): which
door, which kind of client, the record method, the refusal code or the status class, the
milliseconds, and the record id hashed under a key that changes every month. Never a value; the
`telemetry-allowlist` gate holds the list. It is read with Analytics Engine's SQL API, and kept
three months.

## What is not automated, and should be

- **The `www` redirect is a dashboard rule and is in no file here.** It is one Redirect Rule, and
  the rest of this document exists because a setting that lives only in a dashboard is a setting
  nobody can review. Its terms: `https://www.*` to `https://${1}`, 301, query string preserved.
- **The Stripe endpoint is made in Stripe's dashboard.** Developers > Webhooks > Add endpoint,
  `https://app.brain.dog/account/billing/webhook` (an endpoint made earlier on `brain.dog` still works, because the doors there are served), in the same mode as `STRIPE_SECRET_KEY`; its signing
  secret is `STRIPE_WEBHOOK_SECRET`. One per mode and per environment.
- **The restore drill and the KEK rotation are a person's.** The Worker holds no age identity, so
  nothing but the monthly drill ever opens a production copy, and the walk cannot know when that
  last happened. The drill tells the host itself: `--report` posts its counts to `/account/ops/drill`,
  the Directory keeps the last one, `GET /account/drill` answers it to anyone signed in, and Settings >
  Backups draws it; with `OPS_RECORD` set it is also a `drill` note in the ops record (53 §5.1 step 5,
  §5.4). Until the first report every record reads "Never tested", in the fault tone.
- **`MAIL_FROM` and `SUPPORT_ADDRESS` are read and not yet set.** Both fall back as the table above
  says. Setting them is two lines in `env.production.vars`, and `SUPPORT_ADDRESS` needs a mailbox, or
  an Email Routing rule to one, before it is named in every letter.

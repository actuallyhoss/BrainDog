# tools/ship

CI and the production deploy, run on the owner's Mac instead of GitHub Actions. Every workflow in `.github/workflows`
now starts only by hand (`workflow_dispatch`), and its steps stay the reference: both commands read the commands they
run out of those files rather than keeping a copy.

## `pnpm ship:ci` (`node tools/ship/ci.mjs`)

Runs what `ci.yml` (test, gates, build), `gates.yml` and `selfhost.yml` run on Linux: the install, the four test legs
(typecheck, tests, docs tests), the web, site and CLI builds and the tests that read them, both wrangler dry runs, the
build job's tool suites, every gate one at a time (browser gates included), and the self-host from a clean clone in
plain and container form. Each step prints one line with pass or fail and its time. Nothing stops the run; the summary
names every red, and the exit code is 1 if any red was not excused.

- `--quick`: the typechecks, the tests of the workspaces touched since origin/master, and the gates that need no build.
- `--allow <gate>[,<gate>]`: a red gate named here is reported as excused, in the summary, and does not fail the run.
- `--list`: print the plan and run nothing.

Not run here, and said so on every run: the Windows leg, the outbound block around the self-host run (iptables and
`sg` are Linux), and the artifact and cache plumbing between `gates.yml`'s jobs.

A full run with nothing red, on a clean tree whose HEAD did not move, writes `.ship/pass.json` naming that HEAD.

## `pnpm ship:deploy` (`node tools/ship/deploy.mjs`)

**It signs the CLI before it publishes (`tools/ship/cli-sign.mjs`), with the login keychain item `braindog-cli-release` on this Mac.** With no
such item it refuses before its first step and says the one command to run (`node tools/ship/cli-key.mjs`, `apps/cli/README.md`), so nothing
is deployed. That stops the whole deploy and not just the CLI: going on without it would publish the site with no `/cli/` files. A key that
cannot be opened stops at the signing step, which comes before any write. A dry run asks only whether the item exists, and opens nothing.

Runs `deploy.yml`'s `deploy` job, step by step in its order. It refuses, with nothing deployed, when:

- the tree has changes;
- HEAD is not origin/master, locally and on the remote;
- `.ship/pass.json` does not name HEAD;
- `DEPLOY_HOST` or `CLOUDFLARE_ACCOUNT_ID` is unset (the shell's environment, else `gh variable get`);
- a secret is missing: `PROVISION_KEY` (env, else keychain `braindog-provision-key`), a Cloudflare credential
  (`CLOUDFLARE_API_TOKEN` in env or keychain `braindog-cloudflare-api-token`, else wrangler's own login), and
  `SMOKE_TOKEN` (keychain `braindog-smoke-token`) once a canary record is named;
- another deploy is running, or `deploy.yml` names something this file cannot fill.

No secret is printed, logged or written. What was live is kept in `.ship/live-before.env`, and the end of every run
prints the `rollback.mjs decide` and `wrangler rollback` lines that put it back. After a red Parity or Smoke the
rollback steps run as they do in the workflow.

A green deploy then asks production five things from outside (`tools/ship/after-deploy.mjs`), one plain line each:
health with the build held to HEAD, the kernel against this checkout's migrations, the sign-in page, the MCP door's
sign-in metadata, and the site. It needs no canary record (`OPS_RECORD`) and no key. A red line makes the exit 1 and
rolls nothing back. Run it alone any time: `node tools/ship/after-deploy.mjs [--sha <commit>] [--env alpha]`.

A green deploy then attaches the status page (or `BRAINDOG_STATUS_PAGE`) to the BrainDog
project (`things#21`, or `BRAINDOG_STATUS_ON`) as the next version of its "Status" visual, so the loop folder is not its
only copy. An unchanged page writes nothing, and a failed attach is said without turning the deploy red.

- `--dry-run`: every read and check, with each write (both deploys, the restore point copy, a rollback) printed
  instead of made; the deploys run wrangler's own `--dry-run` in their place.

## Logs

Everything goes under `.ship/` at the repository root, which git ignores: `.ship/logs/ci-<time>/` holds one log per
step and `summary.txt`; `.ship/logs/deploy-<time>/deploy.log` holds a deploy's whole output.

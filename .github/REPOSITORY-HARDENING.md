# Repository hardening — the settings a file cannot set

Everything in this repository that can be enforced by a file is enforced by a file: the gates, the
lockfile, the workflow permissions, `CODEOWNERS`. This is the remainder — the switches that live in
GitHub's settings and nowhere else, so they are invisible in a diff, survive no fork, and are exactly
the kind of control that is assumed to be on and is not.

Work down it once and tick as you go. Each row says where the switch is and what it stops.

Ordering is by what a compromise actually costs, not by GitHub's menu order.

---

## 1 · Reporting, before anything else

- [ ] **Private vulnerability reporting: on.** *Settings → Code security → Private vulnerability
      reporting.* Without it, `SECURITY.md`'s first instruction — "Security → Report a
      vulnerability" — points at a button that is not there, and the reporter's next move is a
      public issue containing a working exploit against a record holding credentials.
- [ ] **`SECURITY.md` detected.** *Settings → Code security* shows a green tick once the file is on
      the default branch. If it does not, the file is in the wrong place — root, `.github/` or
      `docs/`, and nowhere else.
- [ ] **Check `support@brain.dog` (security reports go there too) and `conduct@brain.dog`** are real addresses that
      reach a person, and check that a message to each arrives. A disclosure address that bounces is
      worse than no address, because the reporter believes they reported it.
- [x] **`OWNER` replaced in `.github/ISSUE_TEMPLATE/config.yml` and `.github/CODEOWNERS`** with
      `actuallyhoss`.

## 2 · The default branch

Use a **ruleset** (*Settings → Rules → Rulesets*) rather than the legacy branch-protection screen —
rulesets can be exported, they layer, and they say what they applied to.

Target: `master`. Enforcement: active.

- [ ] **Restrict deletions.**
- [ ] **Block force pushes.** The ledger argument the product makes about its own data applies to its
      history: `MAX(rowid)` is the record's version because there is one write path, and a repository
      whose history can be rewritten is making the weaker claim it criticises four comparable
      products for.
- [ ] **Require a pull request before merging**, with **1 approval**. One maintainer today means
      self-merge with the rule visible, which is not theatre — it is the rule already being in place
      when the second contributor arrives, rather than a change somebody has to argue for then.
- [ ] **Dismiss stale approvals when new commits are pushed.**
- [ ] **Require review from Code Owners.**
- [ ] **Require conversation resolution before merging.**
- [ ] **Require status checks to pass**, and require branches to be up to date first. Add each check
      by name as it starts reporting:
      - [ ] `test` (from `ci.yml`)
      - [ ] the gates job (from `gates.yml`, when it exists — today `ci.yml` runs `pnpm gates`)
      - [ ] `analyse (javascript-typescript)` and `analyse (actions)` (from `codeql.yml`)
      A check added to a workflow and never added here is a check that does not block anything.
- [ ] **Require signed commits.** Every commit on `master` verified. Sign with SSH if that is
      already set up — `gpg.format = ssh`, `user.signingkey` an allowed-signers key — and turn on
      `commit.gpgsign = true` so it is not a per-commit decision. Do this **before** the history
      rewrite, not after: signatures do not survive one, and a partially signed history is a rule
      nobody can enforce.
- [ ] **Block creations** off; **restrict updates** off. Feature branches are fine.
- [ ] **Do not add a bypass list.** Not even for the maintainer, and not "temporarily".

## 3 · Tags

- [ ] **Ruleset on `render-v*` and `cli-v*`.** Target: tags. Restrict deletions, block force pushes,
      restrict creation to the maintainer. `tag.yml` fires on these tags and publishes to npm
      with OIDC; a tag anybody can create is a publish anybody can trigger.

## 4 · Secrets

- [ ] **Secret scanning: on.**
- [ ] **Push protection: on.** This is the one that matters. It refuses the push rather than opening
      an alert after the credential is already in the history — and this repository's own rule is
      that a credential never goes in the record, which is a strange rule to keep in a tree that
      would accept one in a commit.
- [ ] **Push protection for contributors: on**, so a fork's pull request is held to it too.
- [ ] **Validity checks: on.** Tells you whether a leaked token is live, which is the difference
      between "rotate now" and "rotate when convenient".
- [ ] **Confirm no bypass reasons are permitted**, or if one is, that it requires a review.
- [ ] **Check the alert list is empty**, including for the history about to be rewritten. A rewrite
      is the one cheap moment to remove something; after it, removing a secret means another rewrite.

## 5 · Code scanning

- [ ] **CodeQL: advanced setup**, using `.github/workflows/codeql.yml` in this directory. Do **not**
      enable default setup as well — two configurations produce two sets of alerts over the same code
      and the duplicate set is the one nobody triages.
- [ ] **Pull request alerts on**, so a finding blocks the review rather than joining a list.
- [ ] Read the header of `codeql.yml` before enabling it. It records two deliberate deviations from
      `52 §8` — a sixth workflow, and the `security-events: write` permission that specification says
      nothing has. Amend `52 §8`, or delete the file. Do not leave it contradicting the spec silently.

## 6 · Dependencies

- [ ] **Dependabot alerts: on.**
- [ ] **Dependabot security updates: on.**
- [ ] **Dependabot version updates: on**, using `.github/dependabot.yml` in this directory.
- [ ] **Verify the `cooldown:` block parses.** *Insights → Dependency graph → Dependabot* shows a
      configuration error if it does not, and a rejected `dependabot.yml` disables the whole file
      rather than the offending key. If it is rejected, delete the block and rely on the weekly
      schedule.
- [ ] **Dependency graph: on** (it is a prerequisite for the two above).
- [ ] Understand what the cooldown is for: `minimumReleaseAge: 1440` in `pnpm-workspace.yaml` refuses
      to *resolve* a package under 24 hours old, and CI installs `--frozen-lockfile`, which does not
      resolve. Dependabot is therefore the one path by which a release under 24 hours old reaches a
      CI runner. **Do not merge a dependency pull request for a release published in the last 24
      hours**, whatever the cooldown key ends up doing.

## 7 · Actions

- [ ] **Allow select actions only.** *Settings → Actions → General → Actions permissions.* Allow
      actions created by GitHub, and add the exact list this repository uses:
      `pnpm/action-setup@*`, `github/codeql-action/*@*` and `docker/*@*` (the image workflow). The
      allow-list should equal the Actions row of `52 §8`.
- [x] **Pin third-party actions to a commit sha**, not a tag. Done in every workflow. A tag is mutable, and pinning to a
      major means a compromised release inside that major arrives silently. Dependabot's
      `github-actions` entry keeps the pins current; without pinning, it is keeping a moving target
      current, which is a different and weaker thing.
- [ ] **Default `GITHUB_TOKEN` permissions: read-only.** Every workflow declares what it needs; the
      default should grant nothing.
- [ ] **Workflows may not create or approve pull requests.**
- [ ] **Require approval for all outside collaborators** before a workflow runs on a fork's pull
      request. Without it, the first thing a stranger can do is run arbitrary code on a runner that
      can read repository state.
- [ ] **Fork pull requests get no secrets.** This is GitHub's default; confirm nothing has changed
      it, and confirm no workflow uses `pull_request_target`.
- [ ] **Actions off at the repository level until there is a reason to run them.** A workflow file disabled by name
      does not stop a new one: a fork's pull request can add a file and run it once approved. *Settings → Actions →
      General → Disable actions*, or `gh api -X PUT repos/<owner>/<repo>/actions/permissions -F enabled=false`. When they
      come back on, `ci.yml` and `codeql.yml` are the two a fork may reach, and `tools/gates/public-repo.mjs` holds what
      those may do.
- [ ] **Require actions pinned to a full commit sha** at the setting too, not only in the files.
- [ ] **Artifact and log retention: 30 days.** Screenshots are artefacts for a human, and a
      failure's screenshots stop being useful long before ninety days.

## 8 · The deploy

- [ ] **A `production` environment exists**, and `deploy.yml` names it.
- [ ] **Deployment branch policy: `master` only.**
- [ ] **Required reviewer on `production`.** One click before anything reaches customers' records.
- [ ] **No deploy secret on GitHub while deploys run from a machine.** A token nothing here reads is a token that can
      only leak. Delete it, and set it again the day a workflow deploys.
- [ ] **`CLOUDFLARE_API_TOKEN` is an *environment* secret on `production`**, not a repository secret.
      A repository secret is readable by any workflow that asks; an environment secret is readable by
      a job that named the environment and passed its rules.
- [ ] **The token is deploy-scoped** — Workers Scripts edit and nothing else. Not a global API key,
      not an account-wide token.
- [ ] **`CLOUDFLARE_ACCOUNT_ID` and `DEPLOY_HOST` are variables, not secrets.** An account id is not
      a credential, and storing it as one teaches people that the secret list is noise.
- [ ] **Two secrets in the repository, and no more** (`12 §8`, `52 §8`): the deploy token above, and
      the npm OIDC identity, which is not stored anywhere because it is minted per run. **There is no
      npm token.** If one appears in the secret list, something has gone wrong with trusted
      publishing and the fix is not to add a token.

## 9 · Publishing

- [ ] **Both names held on npm before the repository is public.** The README and the seed say `braindog` and
      `braindog-render` out loud, and a name nobody holds goes to whoever publishes first. Publish `0.0.0` from the
      maintainer's account, with two-factor on, then set trusted publishing.
- [ ] **npm trusted publishing configured** for `braindog-render` and `braindog`, bound to this
      repository and to `tag.yml`. Provenance is then automatic and needs no `--provenance` flag.
- [ ] **No classic npm token exists** on the maintainer's npm account. Delete any that do; a token
      that exists is a token that can be stolen, and trusted publishing means none is needed.
- [ ] **`tag.yml` has `id-token: write` and nothing else that writes.**

## 10 · The account, which is the real single point of failure

- [ ] **Two-factor on the maintainer's GitHub account**, with a passkey or a hardware key as the
      primary factor. Not SMS — `12 §9` refuses SMS 2FA for the product on the grounds that SIM swap
      is exactly the attack this data attracts, and the same argument applies to the account that can
      push to `master`.
- [ ] **Recovery codes stored offline**, in two places, one of them not the password manager that
      holds the GitHub password.
- [ ] **Same for npm and Cloudflare.**
- [ ] **Review the SSH and personal access tokens on the account.** Delete the ones you do not
      recognise and the ones you do not use.
- [ ] **The age identity that seals the nightly backups lives outside Cloudflare** — two copies in
      the password manager, and the Worker holds only `AGE_RECIPIENT` (`53 §5.4`, `53 §5.6`). Confirm
      this rather than assuming it, because it is the one key whose loss is unrecoverable and whose
      presence in the wrong place makes every backup readable.

## 11 · Repository surface

- [x] **Discussions: off** (`settings.expected.json`). `.github/ISSUE_TEMPLATE/config.yml` sends
      questions to `support@brain.dog` through brain.dog/support instead, so no link in it is dead.
- [ ] **Blank issues: off**, already set in `config.yml`. Confirm it took effect.
- [x] **Wiki: off** (`settings.expected.json`). The docs are `docs/` and brain.dog/docs; a second
      place for them would drift, and an open wiki is an easy place to put a plausible lie.
- [ ] **Projects: off** unless one is in use. An empty tab is a place people look for a roadmap that
      is actually in `docs/15-ROADMAP.md`.
- [ ] **Allow squash merging only**, and set the squash commit message to the pull request title
      alone. The house commit is one plain sentence with no body (`CONTRIBUTING.md`); a merge that
      concatenates six work-in-progress subjects breaks it.
- [ ] **Automatically delete head branches after merge.**
- [ ] **Confirm the licence is detected** as Apache-2.0, and that `packages/render/LICENSE` is
      detected separately as MIT.
- [ ] **About: the description is the README's first heading**, word for word, which is what
      `tools/watch/settings.mjs` checks every day. The website is `https://brain.dog`, and the topics
      say what a person would search for (MCP, agents, Claude, personal finance, self-hosted). Change
      the heading and the description together.
- [ ] **Social preview: upload the card.** *Settings → General → Social preview.* GitHub has no API
      for it, so it is a press. The image is 1280 × 640, the mark, the name and one line on the left
      and the seed's Money page on the right; never a picture of a real record.

## 12 · Worth doing, with a caveat

- [ ] **OpenSSF Scorecard action.** It reports on most of the rows above and publishes a badge. The
      caveat is real rather than pedantic: it is a seventh workflow and a further marketplace action
      against `52 §8`'s allow-list, it wants `id-token: write` to publish results, and several of its
      checks score this repository badly for things it does on purpose — no fuzzing, a small number
      of maintainers, packaging that is deliberately two packages and no more. **A score is not a
      security property.** Add it if you want the drift detection; do not chase the number.
- [ ] **A `graph`, `licence-closure` and `refusal-fixtures` gate in CI**, from `52 §3`. Not a GitHub
      setting, but the largest single gap between the specification's gate inventory and what
      currently runs, and `graph` is the one that keeps `packages/render` publishable under MIT.

---

## Deliberately not turned on

Stated so nobody adds them later thinking they were forgotten.

| Not on | Because |
|---|---|
| **A bug bounty** | `12 §9`: before there are users, a bounty is a support queue |
| **Required linear history** | squash-only merging already produces it, and the rule adds a second way for a merge to be refused with a different message |
| **Signed tags required** *in addition to* signed commits | the tag ruleset restricts who may create one, and the commit under it is signed. A second signature on the same object is ceremony |
| **A CLA bot** | one maintainer and no corporate contributions. The licence-by-path rule in `CONTRIBUTING.md` is the whole agreement, and a bot that gates every first-time contributor on a click is a cost paid now against a lawsuit nobody has threatened |
| **Branch protection on anything but `master` and the release tags** | there is no develop branch, and protecting feature branches protects nothing |

# Security

BrainDog holds money owed, renewal dates, and credentials. The trust argument is the product, so the
security model is written down in full and kept in the repository rather than summarised on a
marketing page: **[`docs/12-SECURITY.md`](docs/12-SECURITY.md)** is the model: the threat table, the
boundaries, the key hierarchy, and the list of things this project deliberately does not do.

This file is the *process*: what is supported, how to report a defect privately, what happens next,
and what counts as a security defect rather than a design decision you disagree with.

---

## Supported versions

The app has no semantic version and will not get one ([ADR-042](docs/16-DECISIONS.md)). It is a
hosted service and a self-hostable tree, and its version is a tuple. `GET /api/version` answers it
to a signed-in caller, `braindog --version` prints it for the command line, and
`GET /.well-known/braindog-build` answers the build part to anybody:

```
app <YYYY.MM.DD>+<sha7> · format <user_version> · kernel <migration> · primitives <n>
```

| What | Supported | Note |
|---|---|---|
| **BrainDog Cloud** | the currently deployed build, and only that | one deployment, one version; there is nothing to back-port to |
| **Self-host, from `master`** | the current `master` | fixes land on `master` and self-hosters pull. There is no LTS branch, and there will not be one until there is a release cadence to justify it |
| **Self-host, an older checkout** | no | tell us anyway if the defect still reproduces on `master` |
| **Self-host container image** | an image built from the current `master` | the image is built from `apps/selfhost/Dockerfile` and is not yet published to a registry; build it yourself |
| **The command line, from `brain.dog/cli`** | the build the site currently serves | the install line fetches the current build and checks its SHA-256; run it again to update |
| **`braindog`** (npm, Apache-2.0) | `0.1.x`, once published | the command line as an npm package. Nothing is published yet; until it is, the build `brain.dog/cli` serves is the supported one |
| **`braindog-render`** (npm, MIT) | `0.1.x`, once published | the renderer is a separate MIT package with no BrainDog dependency. Nothing is published yet |
| **`.brain` format** | `format 1` | the format revision bumps only when an older reader would *misread* a newer file ([`docs/03-DOG-FORMAT.md`](docs/03-DOG-FORMAT.md) §7) |

After a first publish, only the latest minor of each npm package gets fixes; an older minor is
answered with "update", because there is one maintainer and no back-port branch.

A fork is not supported. If you have changed the write path, the Keychain or either host, reproduce it
on unmodified `master` before reporting.

---

## Reporting a vulnerability

**Do not open a public issue, a discussion, or a pull request that demonstrates the defect.**

1. **Preferred: GitHub private vulnerability reporting.**
   [Report a vulnerability](https://github.com/actuallyhoss/BrainDog/security/advisories/new)
   (Repository → **Security** → **Report a vulnerability**). It gives us a private fork to fix in and an advisory to publish from, and it
   keeps the report attached to the code.
2. **Fallback: email `support@brain.dog`.** Use this if private reporting is unavailable to
   you, or if the defect is in the hosted service rather than in the source. Encrypt if you want to;
   ask for a key in a first message that contains no detail.

There is **no bug bounty and no paid reward**, and that is a stated position rather than an
oversight: [`docs/12-SECURITY.md`](docs/12-SECURITY.md) §9 says *"before there are users, a bounty is
a support queue."* Reports are credited in the advisory unless you ask not to be. If a bounty ever
starts, it will be announced here first.

### What to put in the report

The more of this you have, the faster it moves:

- The **version tuple** from `GET /api/version`, or the commit sha.
- **Which host**: Cloud, or a self-host, and if a self-host then the Node version and the `Sql`
  driver (`node:sqlite` or `better-sqlite3`).
- The **refusal code** if the record produced one. Codes are `UPPER_SNAKE` and enumerated
  ([ADR-057](docs/16-DECISIONS.md)); *which* code was raised, or which one should have been raised
  and was not, is often the whole finding.
- A **reproduction**: the call, the declaration, the pack, or the `.brainl` that triggers it. Please
  use synthetic data. The fixture rule is invented names, `.example` hosts, dates in 2030–2031, and
  no real credential.
- What you think the **impact** is, and what an attacker would need to already have.

### Where to test

**Test against your own self-host.** Self-hosting is free and complete by design
([`docs/01-ARCHITECTURE.md`](docs/01-ARCHITECTURE.md) §4), which means you can stand up the whole
product and attack it without touching anybody else's data. Do not test against BrainDog Cloud
beyond a record you own, and never against a record you were merely shared into.

---

## What happens, and when

One maintainer, so these are honest commitments rather than an SLA copied from a company with a rota:

| Stage | Target |
|---|---|
| Acknowledgement that a human has read it | **3 working days** |
| First assessment: in scope or not, severity, whether it reproduces | **10 working days** |
| A fix on `master`, or a dated plan with a reason if it will take longer | **90 days** |
| Advisory published, with credit | at the fix, or at 90 days, whichever is first |

If a defect is being actively exploited, say so in the first line of your report and the clocks above
stop applying: we will work it immediately and coordinate disclosure with you.

**Coordinated disclosure, 90 days.** If we have not shipped a fix or given you a dated plan within 90
days of acknowledgement, publish. We would rather you did than sit on it. If a fix ships sooner we
will ask you to hold until the advisory goes out, which is usually the same day.

Fixes go out as a GitHub Security Advisory. A CVE is requested where a self-hoster or a published
package is affected. A Cloud-only defect fixed by a deploy gets an advisory and no CVE, because
there is no version for anyone to pin against.

---

## Safe harbour

If you follow this policy, we will treat your research as authorised, will not pursue or support
legal action against you for it, and will say so if a third party asks. This is what we ask in
return:

- Act in **good faith** and stop as soon as you have a proof of concept. Do not pivot, do not
  persist, do not exfiltrate.
- **Do not access, modify or destroy data belonging to anybody else.** If you reach another record's
  data, that *is* the finding, so stop there and report it. There is no cross-record code path in the
  design, so one is a serious defect and does not need proving twice.
- **Do not degrade the service.** No load testing, no volumetric denial of service, no spam through
  an inbound email address or a webhook endpoint.
- **Do not social-engineer** anybody: a maintainer, a user, a support conversation, or a hosting
  provider. Support will never ask for a keychain password, and neither will we.
- Give us the **90 days** above before publishing.

Safe harbour covers the source, your own instances, and your own Cloud record. It does not extend to
Cloudflare, npm, GitHub or any other third party; report defects in their platforms to them.

---

## Scope

The classes below are the ones this design has actually reasoned about, so a report against one of
them lands somewhere useful. Each cites the section that owns it.

### 1 · Key handling and the Keychain (`12 §6`, [ADR-062](docs/16-DECISIONS.md))

The Keychain stores credentials, and the rule the design turns on is that **the record indexes what a
key opens, never the key**: encryption runs in the host, never in the record. In scope:

- The key hierarchy: root **KEK** → per-record **DEK** (wrapped, in `vault_key`) → **grant key** =
  `HKDF(DEK, grant_id)`. Anything that lets one level be derived from a level below it, or lets a
  wrapped key be unwrapped without the KEK.
- The **AAD binding**. A ciphertext moved to another record, another grant id or another version must
  fail to decrypt. `aad = utf8(record_id) ‖ 0x1F ‖ utf8(grant_id) ‖ 0x1F ‖ utf8(String(version))`;
  the wrapped DEK is bound to `utf8(record_id) ‖ 0x1F ‖ utf8(purpose)`. A missing or reordered
  binding is in scope even without a working decrypt behind it.
- The **passphrase re-wrap**. Enabling a keychain password must unwrap under the KEK, re-wrap under
  `PBKDF2-SHA-256, 600,000 iterations, 16-byte salt`, and **overwrite and zeroise the KEK-wrapped
  copy in the same transaction**. If both wrappings survive, either opens the DEK and the honesty
  table in `12 §7` becomes false. That is the exact bug class this section exists for, and it was in
  an earlier draft of the design.
- **Rotation**: the two slots (`KEK` / `KEK_PREV`), `kek_id` telling rows apart mid-walk, and a
  `WRONG_KEY` judged against `vault_key`'s own `kek_id` rather than guessed from the row.
- **Plaintext reaching a sink.** A credential in a log line, a telemetry blob, a push payload, a
  model prompt, an error message or a stack trace. `secret-grep` is meant to catch this statically; a
  path it cannot see is itself a finding.
- **Audit leakage.** A `grant.*` event whose `note` carries the grant's `label` or `opens`. The rule
  keys on `target_kind = 'grant'`, whatever the event kind. So is a Keychain screen that renders under
  screenshot mode, where the Keychain must be *absent*, not blurred.
- Anything that reads more than one grant per request, or reads one without writing `grant.read` and
  incrementing `opened`.

### 2 · The operation-grant and device-authorisation flow (`12 §3`, `12 §6.1`, [ADR-060](docs/16-DECISIONS.md))

There is **no admin token, ever**. VAULT is a browser session only. ADMIN is a browser session, or a
bearer carrying a single-use **operation grant** the owner approved for one named operation, which
dies in ten minutes and reaches exactly one method once. In scope:

- A bearer reaching VAULT, or reaching ADMIN without a grant. A token whose scope
  (`read` · `propose` · `write`) admits a method above it.
- An operation grant that is **reusable**, outlives its ten minutes, reaches a method other than the
  one approved, or is approved by anything but a browser session.
- **`reach` confusion**: the six values are `login` · `runner` · `export` · `import` · `pack` ·
  `token`; a grant minted for one that is accepted for another.
- The code ceremony: `code_hash = sha256(id ‖ ':' ‖ user_code)` salted by the long random poll id,
  the code never stored in clear, the device polling with the poll id and **never the code**, five
  attempts then `denied`, and a denied row that is kept.
- A plan-hash or file-hash mismatch accepted: an install approved by plan hash that applies a
  different plan, an export scope widened after approval, an import by file hash that accepts other
  bytes.
- The login lockout: it must **reserve the attempt before comparing** and **fail closed**: a
  reservation that returns no row is a `503`, not a pass.

### 3 · Export, import and signing integrity (`12 §8`, `03 §4–§5`, `33 §9`)

- A `.brainl` or `.brain` that **round-trips wrong**: a row, a counter or a `seq` that changes across
  export and import.
- The **signature**. What it covers, whether `verify` can be made to pass over altered content, and
  whether an import will accept an unsigned or mismatched manifest.
- The **`local` section leaking**. `token`, `device_grant`, `auth_fail`, `observation`, `job` and
  `job_event` must never travel. `vault_key` travels *sealed*; `grant` rows travel sealed by default,
  and `--redact-grants` must actually drop the ciphertext.
- An import that writes outside a transaction, or lets a crafted file reach the record with
  declarations or rows the plan did not name.
- Nightly backups: a night that fails silently instead of writing an `export` event with
  `note: 'failed: <reason>'` and opening a suggestion.

### 4 · The agent surface (`10`, `44`, [ADR-008](docs/16-DECISIONS.md), [ADR-010](docs/16-DECISIONS.md))

The record is an MCP server, so the agent surface is a first-class attack surface rather than an
afterthought.

- **A tool or resource that returns a secret.** There is no such tool: not scoped, *absent*. One
  that can be made to return `ciphertext`, a `hint` that is really the value, or a plaintext through
  an error path, is in scope.
- **Group reach over the transport.** Every route has a group; no INTERNAL method is routable; VAULT
  is cookie-only; ADMIN admits no token principal. `router-groups` asserts this; a route it cannot
  see is a finding.
- **Slash writing.** Slash has no write RPC by construction. Any path by which the assistant's object
  produces an `event` with `actor = 'slash'` and a writing kind is a serious defect.
- The **decision gate**. A proposal that becomes a decision without a person, a decision written
  without its mandatory reason, or a `decision` row that can be edited after the fact.
- **Prompt injection**, with a boundary. In scope: a path where untrusted content reaches the
  **tool-bearing** model directly rather than through the tool-less reader; a write whose provenance
  touches `inbox_raw` applied without human approval; a projection reaching a prompt without the
  redaction pass. Out of scope: "I persuaded the model to say something wrong" where every
  architectural control held, since that is a model property, and `12 §5` says plainly that no injection
  classifier is a control here.
- Rate limiting that can be bypassed per token or per record.

### 5 · Plugin installation (`04 §7`, `42`, [ADR-048](docs/16-DECISIONS.md))

A plugin (a pack, in the code) is data. The safety argument is an **enumeration**, so anything that adds an entry
to the "a pack CAN" column is a security defect by definition.

- **Any code execution reached from a declaration outside the script sandbox.** A plugin's scripts
  run in `packages/script`'s QuickJS sandbox on a self-host, and in a Worker of their own for each run
  on the Cloud, with only the calls they are handed; escaping either, or running code from any other
  declaration, is the top of this list.
- **Reach past what was approved.** A plugin's tools, commands, row actions, drawn views, notices,
  model asks and stored data are listed before it is installed, and it gets only what the owner
  approved. One of them running without that approval, a drawn view or an attached HTML page reaching
  the app's origin, its cookies or the network, or an agent starting a plugin's tools past the daily
  ceiling, is in scope.
- **The diff lying.** `installPack` must apply the plan `planPack` showed, and refuse a different
  one. An install that adds, changes or retires something the diff did not print, or writes a row
  that is not a declared `example` seed, is in scope.
- A pack **reading or writing a register it does not own**, deleting anything, generating rows past
  the `SPAWNS` ceiling, or generating a `secret` or a `file`.
- **`SECRET_IN_PACK`**: a key-shaped literal or a spelled `Authorization` header at any depth,
  getting past the refusal.
- **`REMOTE_ASSET`**: a font, image, script, iframe or link reaching a remote origin. A pack's only
  permitted outbound is a declared `source:`, or a script's call to a host its file names, each with a
  **literal origin, no placeholders**, and printed statically in the install diff.
- **Where updates come from.** A plugin made in a record or installed from GitHub taking the store's
  file of the same id as its update, a GitHub install that moves off the commit it was pinned to, a
  signature check that passes over altered bytes, or a store advisory that switches off a file that is
  not the store's own.
- Uninstall that **destroys rows** instead of retiring declarations.

### 6 · Cross-record isolation (`12 §2`)

One customer, one object, one SQLite file; there is no tenant column and no code that addresses two
records in one request. Any path that crosses that boundary (including an R2 key not prefixed
`rec_<id>/`, which leaks dedupe information about another tenant) is the highest-severity class
here.

### 7 · Application security (`12 §8`)

CSP (`style-src-attr 'unsafe-inline'` for the renderer's one custom property is the single named
exception), the one escape function, link safety, CSRF, and the asset store: type from bytes never
from the header, **SVG refused with `415`**, the 64-hex path regex that stops traversal, `nosniff`,
`sandbox`, the 2 MB cap checked twice, and `CHECKSUM_MISMATCH` on a client-named hash that does not
match the bytes. An attachment (a put that names its file) is typed from its bytes and then its name,
up to 25 MB; an SVG is shown only as a picture, and an HTML file is served inert and drawn only in its
own sandboxed frame.

### 8 · Dependencies

Runtime dependencies are enumerated and near-zero ([ADR-046](docs/16-DECISIONS.md)): `svelte` in the two
built apps, one YAML parser on the CLI and self-host paths ([ADR-063](docs/16-DECISIONS.md)), and QuickJS for
scripts (`@jitl/quickjs-ng-wasmfile-release-sync`, `quickjs-emscripten-core`). `tools/gates/public-repo.mjs` holds
the list.
An exploitable advisory in one of those, on a path that reaches production, is in scope. A transitive
**dev**-dependency advisory with no path to a shipped artefact is a dependency-update issue; open a
normal issue for it.

---

## Explicitly out of scope

These are decisions, documented with their reasoning. Disagreeing with one is welcome (open an issue
or a discussion), but it is not a vulnerability report.

| Not a vulnerability | Where it is decided |
|---|---|
| **The operator can read a Cloud record** when the keychain password is off. Stated plainly, in the product UI as well as the docs | `12 §7` |
| **Connector credentials stay readable to the operator even with the passphrase on**: a scheduled connector must decrypt with nobody present | `12 §7`, [ADR-052](docs/16-DECISIONS.md) |
| **"We cannot read it" is true after thirty days, not immediately**: PITR and sealed backups span the re-wrap | `12 §7` |
| **The record's rows are not end-to-end encrypted.** The server must query to render pages, run metrics and answer MCP; E2EE would make the record a blob store | `12 §9` |
| **A compromised host can read the root KEK.** Named as not defended, with the alternative and why it was refused | `12 §6` |
| **Guessing a six-digit device code.** The code is not the security; it proves the approver is looking at the device that asked. A *bypass of approval* is in scope; a brute-force argument against the code is not | `12 §6.1` |
| **A pack that misleads**: a plausibly named metric aggregating the wrong field. A semantics problem, not a sandbox problem | `04 §7` |
| **The `.brain` file is readable.** That is the point of the format; the grants inside it are what is encrypted | `03 §2`, `03 §5` |
| **No SOC 2, no bug bounty, no bring-your-own-KMS, no SMS 2FA** | `12 §9` |
| A self-host's own **TLS, reverse proxy, SMTP or filesystem permissions**. The host does not terminate TLS or receive SMTP by design | `49 §1` |
| **Volumetric denial of service**, or any finding whose impact is "enough traffic breaks it" | — |
| **Missing hardening headers, scanner output, or "best practice" findings with no demonstrated impact.** Show the exploit path | — |
| Social engineering, phishing a maintainer, physical access, or a compromised developer machine | — |
| Anything in a **fork** or a modified tree | — |

---

## For maintainers

The repository's own hardening (branch protection, required reviews, signed commits, secret
scanning, push protection) is a checklist in
[`.github/REPOSITORY-HARDENING.md`](.github/REPOSITORY-HARDENING.md). CI on pushes and pull requests
uses no secret at all. Secrets live in the `production` environment and reach only the workflows a
maintainer starts by hand from `master` (the deploy and the checks after it). Publishing to npm uses
OIDC trusted publishing in `tag.yml`, so there is no npm token and no long-lived publishing
credential in this repository (`12 §8`, `52 §8`).

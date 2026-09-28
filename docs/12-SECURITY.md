# 12 · Security

This record holds money owed, renewal dates, and credentials. The trust argument is the product,
and published source plus a complete free self-host is what makes the claim **checkable** rather
than promised.

---

## 1 · The threat model

| Adversary | Wants | Realistic? |
|---|---|---|
| A stranger with the inbound email address | to inject an instruction an agent follows | **yes.** The address is semi-public by design |
| A malicious pack author | to exfiltrate the record | yes, if packs could call out. They cannot |
| A compromised agent token | to read or write the record | **yes.** Tokens live on developer machines |
| Another BrainDog customer | to read this record | no cross-record code path exists |
| Us (the operator) | — | **we can read a Cloud record.** Stated plainly in §7 |
| Someone with a stolen `.brain` backup | credentials | gets ciphertext. §6 |
| A stolen R2 bucket | everything | gets `.brainl.age` ciphertext |
| A model provider | the contents of prompts | payload retention off at the gateway (`cf-aig-collect-log-payload: false`); self-host has no provider at all |

The two that deserve the most engineering are the first and the third, because they are the two
that will actually happen.

---

## 2 · Boundaries

**The object is the boundary.** One customer, one Durable Object, one SQLite file. There is no
tenant column, no shared table, and no query that could be made to cross records because there is
no code that addresses two records in one request.

This is stronger than a `WHERE tenant_id = ?` in a way worth stating: with a tenant column, the
isolation is a property of *every query being correct forever*. With an object per customer, the
isolation is a property of *the platform's addressing*. One is an invariant a human maintains; the
other is an invariant the runtime maintains.

**R2 keys are prefixed by record id, always.** Content-addressed keys in a shared bucket leak
whether another tenant already holds a given file: upload a PDF, observe a dedupe, learn
something. Keys are `rec_<id>/<sha256>` and dedupe is per-record only. This was found by reasoning
rather than by an incident, which is the only good way to find it.

---

## 3 · Authentication

| Principal | Mechanism |
|---|---|
| A person, browser | passkey (WebAuthn) primary; email magic link fallback. One session cookie, `__Host-bd_s` (`bd_s` on http at a loopback name, and none on any other http origin): an opaque 32-byte id, `HttpOnly`, `Secure`, `SameSite=Lax`, 30 days, rotated after a day of use with the replaced id honoured for sixty seconds. The record it opens is on its session row, so there is no second cookie |
| A person, second device | passkey on that device, or a magic link |
| An agent | bearer token, scoped `read` · `propose` · `write` — **there is no `admin` scope, ever**, and no standing token reaches ADMIN. VAULT is a browser session only. ADMIN is a browser session — or a bearer carrying an **operation grant**: from a browser session the owner approves *one named operation* (a pack install by plan hash, an export scope, an import by file hash, a token's creation or revocation) after seeing its summary; the approval is single-use, dies in ten minutes, is recorded as `device_grant.reach` and an `access.grant` event, and reaches exactly that one method once ([ADR-060](16-DECISIONS.md), amended; [48-SPEC-CLI](48-SPEC-CLI.md) §5.2; [45-SPEC-RECORD](45-SPEC-RECORD.md) §5.6). Revocable, shown once, last-used recorded |
| An MCP client | an agent token, made in the app, by the device grant, or by OAuth 2.1 with BrainDog as its own authorization server ([10-MCP](10-MCP.md) §2) |
| A shared link recipient | a signed, scoped, expiring token — the `share` principal kind of the one `CallContext`. Read-only, one page — `page(slug)` for one slug; `ctx.scope` is the link's projection, an empty ceiling ([20-COLLABORATION](20-COLLABORATION.md) §1); nothing else |
| A person, invited | the owner mints a single-use invitation link (24 h, bound to one address) — `invite`, an ADMIN method. The record stores only `sha256(secret)` and answers the link once; no host mails it, and the owner sends it. The link is `<origin>/app/invite#<token>` (under `/app` since push A of the one-domain move, and with no slug, because the token names its record), the fragment keeping the token out of logs, proxies and `Referer`; the page posts it to `POST /auth/invite`, which signs the invitee in — an address that can already sign in here signs in first — and calls `acceptInvite` — INTERNAL — with the Directory's verified person, and that writes the `member` rows and one `access.grant` event per register, as `system` ([20-COLLABORATION](20-COLLABORATION.md) §1) |
| **A machine the customer connected** — the tier-C runner | **the device grant of §6.1** with `reach = runner` (RFC 8628): six-digit code, owner approves in the browser, a 90-day bearer stored as `token_hash`, auto-deregistered after 14 silent days; the `runner` principal kind. It reaches the JOBS group's three runner methods — `claimJob` · `postJobEvent` · `readCancel` ([30-BLUEPRINT](30-BLUEPRINT.md) §5) — and, per job, a job bearer that `claimJob` mints as a `token` row: scope `propose` (which reads), labelled `job:<id>`, audience one job, expiring with the job ([46-SPEC-SLASH](46-SPEC-SLASH.md) §4.7). Never `write`. See [26-BYO-INTELLIGENCE](26-BYO-INTELLIGENCE.md) §2.3 |
| Inbound webhook | the URL is `/in/webhook/<rec_id>/<ingest-id>/<token>` — a random path token per ingest — and a declared `verify: { kind: hmac_sha256, header: X-Signature, grant: <label> }` ([25-CONNECTORS](25-CONNECTORS.md) §3.2) is checked in the host through the record's `ingestVerify`, since the record never decrypts ([51-SPEC-WORKER](51-SPEC-WORKER.md) §5.4); an unverified payload is stored `untriaged` and never matched |
| Inbound email | the per-record address is the capability; a DKIM/SPF pass is required to match, else the payload is quarantined `untriaged` |
| Self-host, single user | `BRAINDOG_TOKEN` for a private instance — owner level, everything; self-host single-user only — exchanged at `POST /auth/token` for a session, behind which passkeys are registered (ES256 and RS256, no attestation); the magic link waits for a mail transport on this host ([49-SPEC-SELFHOST](49-SPEC-SELFHOST.md) §5.10) |

> **One row above deserves a note, because an earlier draft made it different in kind.** That draft
> gave the connected machine a keypair it generated locally, with BrainDog holding only the public
> half — GitHub's runner design. It was dropped for one standard flow, the device grant of §6.1, and
> the property it bought survives: BrainDog stores the grant only as `token_hash`, exactly as it stores
> an agent token, so a complete theft of BrainDog's own database still impersonates no customer's
> machine. One flow to secure instead of two, and no keypair anywhere in this document.

**The routes are one table.** Every authentication path is a `/auth/*` route in [33-CONTRACTS](33-CONTRACTS.md) §4,
and the sign-in half is data: `AUTH_ROUTES` in `packages/host/src/auth.ts`, which both hosts answer through one
`serveAuth` and the `router-groups` gate reads. A route's path is its flow with the dots as slashes
(`POST /auth/passkey/assert`, `POST /auth/magic/redeem`), except the server key's exchange, which is
`POST /auth/token`. The device grant's two routes, `POST /auth/device` and `POST /auth/device/token`, are rows of
the same table, kept in `packages/host/src/device.ts`. The invitation's route, `POST /auth/invite`, is a row of the table too, kept in
`packages/host/src/invite.ts`. The record switch, `POST /auth/switch`, is a row too: a POST from a page on this origin and
never a GET, since a GET that moves a session is a link any page can make a browser follow; a slug that is not ASCII is
refused before it is lowered; and the record itself is asked whether the person is on it (`admits`), since the Directory's
list outlives a removal. Every refusal is the one 403, so it tells nobody which records exist. The operation grant's approval
(`/auth/device/approve`) is specified and not built, and keeps that path when it lands. A bearer on the wire is `<rec_id>.<secret>`; the record keeps only `sha256(secret)`, in `token.hash`
or `device_grant.token_hash`.
**Passkeys first, and no passwords at all.** A record holding credentials should not be protected
by a reusable secret that can be phished. WCAG 2.2's accessible-authentication criterion is
satisfied for free: a passkey requires no cognitive test, and paste is never blocked on the
fallback code field.

Every token records `last_used_at` and the surface it was used from, and the app lists them with
a revoke button. A credential you cannot see being used is a credential you cannot know is stolen.

---

## 4 · The record makes no outbound calls

Restated here because it is a security control and not only a correctness one.

Inference, webhooks out, email out and pack fetching happen in the Worker or in Slash's object.
The record object can be asked for data and can store data. It cannot speak.

Two problems solved by one line: `fetch()` inside a Durable Object breaks the input/output gates
and permits request interleaving (a correctness bug), **and** an object that cannot call out
cannot exfiltrate (a security property). When a correctness rule and a security rule want the same
constraint, take it.

*(Added September 22nd 2026 for scripts, DIRECTION §22.)* **A person's or an agent's script does not change this,
because the record never runs one.** A `script` declaration that is due writes one `script.run` outbox row, and a
host leases it and runs the source in a sandbox: QuickJS on a self-host, a Dynamic Worker the record's object loads
on the Cloud ([49-SPEC-SELFHOST](49-SPEC-SELFHOST.md) §5.23, [51-SPEC-WORKER](51-SPEC-WORKER.md) §5.19). The record
gets back a list of writes and applies them as any caller's. A trial of a draft (`script_try`) is the same sandbox
started by the host for one call, and the record hands it no write path at all. On the Cloud the sandbox's `fetch` does arrive at the
record's own object, which sends it from its host code through the same loop a scheduled action uses; the record
package's ports still have no `fetch`. What a script may do instead is carry what it reads to an origin it
declares, which is why the install diff says so in its own sentence ([25-CONNECTORS](25-CONNECTORS.md) §12); what
holds a running script in is §8, *A person's script*.

---

## 5 · Prompt injection and the lethal trifecta

The exploitable pattern is one shape: **private data + untrusted content + external
communication.** BrainDog has the first two structurally. The full design is in
[11-ASSISTANT](11-ASSISTANT.md) §7; the security-relevant summary:

| Control | Kind |
|---|---|
| Slash has no write RPC | architectural |
| Slash has no tool that returns a secret | architectural |
| Slash's only outbound call is the model | architectural |
| Untrusted content is read by a **tool-less** model; only its structured output reaches the tool-bearing one | architectural |
| A write whose provenance touches `inbox_raw` requires human approval | enforced by provenance, not heuristics |
| A redaction pass over every projection before it enters a prompt | **ours.** `secret` fields become their label; ciphertext never leaves the record |
| AI Gateway DLP as a tripwire on prompts and responses | defence in depth. **Flag and block only — it cannot redact**, so it catches a mistake rather than preventing one |
| Every proposal records what it read | audit |
| A model key kept in the vault opens only for the owner on a proof under fifteen minutes old, and each opening names who asked | procedural, the vault's own gate, in the host ([46-SPEC-SLASH](46-SPEC-SLASH.md) §5.9, §6.2 below) |

**No injection classifier is a control here.** ~95% accuracy at ~65 ms is a fine signal and a
useless gate on a record holding credentials. It goes in the audit log as a flag.

The UI layer matters as much as the model layer: untrusted content is visually marked as untrusted
wherever it appears, and a proposal derived from it says so at the point of approval. A human who
does not know they are approving a stranger's instruction is not a control either.

---

## 6 · The credential vault

The prior system's rule was *"the register indexes what a key OPENS, never the key."* That is a
good rule for a private tool and insufficient for a product: people will keep credentials
somewhere, and somewhere is currently a notes app. So BrainDog stores them, properly.

### The key hierarchy

```
  Cloud                                     Self-host
  ─────                                     ─────────
  Root KEK — Secrets Store or Worker secret  Root KEK — env var or a file with 0600
      │  (account-level; 100 secrets max,        │
      │   1 KB each — so it holds ONE key,       │
      │   never a key per customer)              │
      ▼                                          ▼
  Record DEK — AES-256, generated at record creation,
               wrapped by the KEK, stored wrapped in vault_key (purpose 'record')
      │
      ▼
  Grant key — HKDF(DEK, grant_id) — one key per credential,
              key-usage separation, NOT blast-radius containment:
              anyone holding the DEK derives them all. An earlier
              draft overclaimed this
      │
      ▼
  AES-256-GCM(plaintext, nonce, aad = record_id ‖ grant_id ‖ version)   -- ‖ is the byte 0x1F; exact below
```

**The vault cannot hold its own key.** The KEK, the owner's passkey and a self-host's `BRAINDOG_TOKEN` live
outside it by necessity: reading the vault needs them, so the safe cannot hold what opens it. The predecessor's
migration of 2026-09-02 moved exactly three things *out* of its secrets folder for this reason — the token that
opens the vault and two SSH keys, into `~/.ssh` with a config — and seventy-two values *in*, each verified
byte-identical while the original still existed, which was the last moment that proof was possible.

Secrets Store's **100-secret, 1 KB-per-secret** ceiling is precisely why the root key is one key
and per-record keys are wrapped and stored in the record. A design that put a key per customer in
Secrets Store would have hit a wall at customer 101.

The AAD binding matters: a ciphertext moved to another record or another grant id fails to
decrypt. Copying a blob between records yields nothing. **The bytes, once, here:**
`aad = utf8(record_id) ‖ 0x1F ‖ utf8(grant_id) ‖ 0x1F ‖ utf8(String(version))` — wherever this corpus
writes `‖` it means that byte. The wrapped DEK is bound the same way, to `utf8(record_id) ‖ 0x1F ‖
utf8(purpose)`; the grant key is HKDF-SHA-256 over the DEK with the grant id as `info`; nonces are 12
bytes; and everything crosses a wire as base64url. One rule for vault and connector grants alike,
byte-exact in [47-SPEC-CONNECT](47-SPEC-CONNECT.md) §4.6. **Sign-up generates all three keys** — the
record DEK, the connector DEK (§7) and the signing key ([03-DOG-FORMAT](03-DOG-FORMAT.md) §4).

**Where the wrapped keys live: `vault_key`**, one row per purpose — `record` (this DEK), `connector`
(the second DEK of §7) and `signing` (the record's Ed25519 export key,
[03-DOG-FORMAT](03-DOG-FORMAT.md) §4) — each with `wrapped`, `nonce`, `wrapped_by` (`kek` |
`passphrase`), `kek_id`, `salt` and `rewrapped_at`; exactly one wrapping per key
([30-BLUEPRINT](30-BLUEPRINT.md) §1). It travels in an export, sealed — a wrapped key is nothing without the
KEK, and a record restored from its own backup must be able to open its own vault (§8).

**Rotation is two slots.** The root key has a current slot and a previous one — `KEK` and `KEK_PREV`;
`rewrapKeys` re-wraps every `vault_key` row from the old to the new, `kek_id` tells the rows apart during
the walk, rotations are at least 30 days apart, and the previous slot is retired 30 days after the first
clean night. The age identity that seals the nightly backups lives outside Cloudflare altogether — the
Worker holds only the recipient half ([53-SPEC-OPERATIONS](53-SPEC-OPERATIONS.md) §5.6, §5.4).

**Where AES-GCM runs: the host — the Worker on Cloud, the Node process on a self-host — never the
record.** The record has no `KeyStore` port and never sees a plaintext credential ([ADR-062](16-DECISIONS.md)).
`openGrant` logs `grant.read`, increments `opened`, and returns **sealed material** — the one shape
`{ ciphertext, nonce, aad, kek_id, wrapped_dek }`, everywhere, base64url over the wire; the host unwraps
the DEK via `KeyStore`, derives the grant key by HKDF, decrypts, and returns plaintext to the browser once.
`bindGrant` is the mirror: the host encrypts, the record stores; it mints the grant id — `g_` + ULID — and
a `secret` field may hold only an id that exists. A connector's read is the same event by another door:
`sealedGrant` hands the host the same sealed shape for a pull, logs `grant.read` with actor `ingest:<id>`
and counts `opened` ([45-SPEC-RECORD](45-SPEC-RECORD.md) §5.4, [47-SPEC-CONNECT](47-SPEC-CONNECT.md) §5.1).

**And it hands back only what the connector key sealed.** `grant.sealed_under` records which of the two
data keys a row was sealed with, and `sealedGrant` refuses anything but `connector` as `OUT_OF_BOUNDS`.
Two reasons, and the second is the larger: pairing the connector DEK with bytes the record key sealed is a
decrypt that throws in the host with nothing naming the cause; and a credential somebody deposited to open
on a screen, with themselves present, is not one a scheduled run may have. `record` is the default, which
is what every row bound before migration 10 actually is. Re-sealing under the connector key is the only
thing that converts one, and it needs the plaintext, so it needs a person.
A `WRONG_KEY` is judged against `vault_key`'s own `kek_id`, never guessed from the row.

### The optional second factor

A record may set a **vault passphrase**, distinct from login.

> **An earlier draft said the DEK is then wrapped by `HKDF(passphrase)` "as well" — which does not
> provide the guarantee two tables in this document then claimed.** If the DEK is wrapped by the KEK
> *and* by the passphrase, **either wrapping opens it**, so the operator's KEK still decrypts the
> vault. The honesty table below would have been false.

**The mechanism, corrected: enabling a passphrase RE-WRAPS and destroys.** The DEK is unwrapped with
the KEK once, re-wrapped under a key derived by **PBKDF2-SHA-256, 600,000 iterations, a 16-byte salt** — WebCrypto has no
Argon2, and HKDF is not a passphrase KDF: an earlier draft's `HKDF(passphrase, salt)` would have left the
wrap in an exported backup brute-forceable at wire speed — and **the KEK-wrapped copy is overwritten
and zeroised in the same transaction.** From that point there is exactly one wrapping of the DEK and
the operator does not hold its key. Disabling the passphrase is the same operation in reverse and
requires the passphrase.

Decrypting any key a person deposited then requires the passphrase in-session. A connector's keys are
not among them: they are sealed under the connector DEK, which stays on the KEK because a scheduled run
has nobody there to type anything, so for those the answer to the first question below stays *yes*.

This is the honest trade, stated in the UI rather than in a whitepaper:

| Vault passphrase | We can read your credentials | You can lose them |
|---|---|---|
| off (default) | yes, technically | no |
| **on** | **no** | **yes, permanently** |

Default off, because a founder locking themselves out of their own hosting credentials is a more
likely disaster than us reading them. Offered prominently, with the consequence in the same
sentence as the switch.

*(Built September 26th 2026, `loop/finish/platform.md` §4.0 V.)* Two VAULT methods,
`setVaultPassphrase({ passphrase })` and `clearVaultPassphrase({ passphrase })`, held to rule 2's gate: an
owner in a browser, proved in the last fifteen minutes, and every token refused. Each host answers them
through `withVaultPassphrase` (`packages/host/src/passphrase.ts`), which takes the passphrase off the
arguments before the record is called and hands the record's method a step instead, so the record is
handed wrapped bytes and a salt and never the passphrase or a key. The details:

- **Only the record DEK moves** (`vault_key` purpose `record`). The connector DEK and the signing key
  stay on the KEK, so connector pulls and the signed nightly copy run as before. What stops is anything
  that opens a key a person deposited with nobody present: a scheduled call or a signed digest post that
  names such a key, and every agent's vault grant, which is told the vault is behind a passphrase.
- **The derivation** is PBKDF2-SHA-256 over the passphrase normalised to NFC, `PASSPHRASE_ITERATIONS`
  rounds and a fresh salt of `PASSPHRASE_SALT_BYTES` in `vault_key.salt`; the DEK is wrapped with
  AES-256-GCM under the derived key with the same additional data it has under the KEK,
  `record_id ‖ 0x1F ‖ "record"`. A new passphrase is at least `PASSPHRASE_LEAST` characters. Where the
  runtime refuses that many rounds in one call, the host computes the same PBKDF2 bytes one HMAC at a
  time, so a passphrase set on one host opens on the other.
- **One transaction, one wrapping.** The swap is a compare-and-set on the row's `wrapped_by` and its
  `nonce`, which every wrapping draws afresh: the KEK's wrapping is overwritten by the passphrase's in
  the statement that writes it, and a second change that landed first, even one that went off and back
  on again, is answered as a conflict. It writes one `grant.rotate` event on `vault_key:record`,
  field `wrapped_by`, from one wrapping to the other, and never the salt or the bytes. A root key
  rotation (`rewrapKeys`) leaves a passphrase row alone. Taking the passphrase off wraps the DEK under
  the root key the record's other keys are under while the host still holds it.
- **The key doors take it.** While the passphrase is on, `/api/keys/put` and `/api/keys/open` carry
  `passphrase` in their body; without it the answer is `REQUIRED_MISSING` at `passphrase`. The record's
  INTERNAL `unlockVault` puts rule 2's gate first and then calls the host's step, and the DEK that step
  opens stays in the host for the one request and is zero-filled after it.
- **A wrong passphrase is `WRONG_KEY` and is counted** before it is compared, in the record's own
  `auth_fail` under the limits sign-in keeps: `PASSPHRASE_TRIES` wrong ones in a window, then
  `RATE_LIMITED` with `Retry-After` for `PASSPHRASE_WAIT_MS`. Putting a passphrase on compares nothing
  and is not counted; taking it off and every key opened or put with it are.
- **Export, the nightly copy and a restore carry the passphrase's wrapping and its salt**, sealed, so a
  record restored from its own file opens with the same passphrase. What the passphrase cannot reach is
  a copy made before it was turned on: that copy still holds the wrapping the KEK opens, for as long as
  it is kept, and a statement cannot reach what the database engine keeps of a page it has freed.

### What a grant row holds

```
id           the grant id, `g_` + ULID, minted by `bindGrant` — the value a `secret` field stores
label        "Cloudflare — Quartz account"
opens        ref → register.services #12
kind         api_token | password | ssh_key | recovery_codes | note
ciphertext   BLOB      nonce        BLOB      -- the current version
prev_ciphertext BLOB   prev_nonce   BLOB      -- the one before it. Exactly two versions; the schema says so
version      1         kdf   wrapped_by   kek_id   scopes   bytes   hint
created_at   rotated_at   expires_at   rotate_every   revoked_at
stale_at               -- set on 401/403 by a connector run — 25 §9
opened       last_opened                     -- counters the screen draws; WHO read it is the grant.read event
```

The columns are the `grant` DDL in [30-BLUEPRINT](30-BLUEPRINT.md) §1, and nothing else. *An earlier
draft listed `last_read_at`/`last_read_by`; the reader is the actor on the `grant.read` event, and the
row keeps only the counters.*

`opens` is the field that makes this better than a password manager for this use case: the
credential is *attached to the thing it operates*, so the Domains page can say "this registrar
login" and the Services page can say "this API token", and the answer to "what is this account
FOR" is structural rather than remembered.

### Rules

1. **Every read is an event.** `grant.read` with the actor. A vault whose reads are not audited
   cannot answer "did anything get out".
2. **Reveal is deliberate**: a click, a re-auth if the session is over 15 minutes old, a 30-second
   auto-hide, and clipboard cleared after 60 seconds.
3. **No agent tool returns a secret.** Not scoped — absent. Agents see `label`, `opens`,
   `expires_at` and `rotate_every`, which is what they need to *tell you to rotate it*.
4. **Rotation is scheduled.** `rotate_every` puts a row in `schedule`. The record cannot rotate
   anything itself — it has no outbound calls — so it reminds you, with a link to the dashboard
   that can.
5. **Secrets never enter a log, a telemetry blob, a push payload or a model prompt.** Asserted by
   a test that greps every write path.
6. **Ciphertext stays ciphertext in exports.** `grant` rows travel sealed by default; `--redact-grants`
   drops them — [03-DOG-FORMAT](03-DOG-FORMAT.md) §5 and §8 below.
7. **The vault is its own RPC group.** `listGrants` · `openGrant` · `bindGrant` · `revokeGrant` are the
   VAULT group of [30-BLUEPRINT](30-BLUEPRINT.md) §5 — a browser session only; every token, whatever its
   scope, gets `403 NEEDS_BROWSER_SESSION`, and so does an operation grant — VAULT has no reach
   ([ADR-060](16-DECISIONS.md)).
8. **A connector grant is a JSON object of string fields**, its secret keys the closed set per
   `auth.kind` in [47-SPEC-CONNECT](47-SPEC-CONNECT.md) §4.5, and a declared `require_scopes` is
   **proven at bind**, never assumed. When a provider rotates a refresh token mid-run, connect re-seals
   it (version + 1) and the record stores it from the ack with one `grant.rotate` event — the previous
   version kept as `prev_ciphertext`.
9. **An agent's keys go through two doors, under a vault grant, except that a login token may add a new key.** `POST /api/vault/deposit`
   and `POST /api/vault/open` take as their bearer a device grant of reach `vault`, approved by a person for
   one project or for `*`, the keys of no project; 30 days for a project and 7 for `*`. The bearer is checked
   with `vaultGrant`, which never accepts a login token, and a key whose row's project is not the grant's
   scope is `403 FORBIDDEN`. A page is refused, whatever its origin. The host seals a deposit and opens a
   read with its `KeyStore`, as in rule 7's group; the record names the grant id, version and AAD and binds
   only sealed bytes, and the credentials row keeps its label, what it opens and its project. A read is
   rule 1's `grant.read`, signed by the run the caller names (`S12`) when one is live, and the value
   leaves in that one answer with `no-store`. On the command line, `braindog keys put` reads the value
   from stdin, never an argument, and `braindog keys exec` puts a key read back into the environment of the
   one command it runs, and never prints it. It never puts one in a variable that changes how that command runs,
   such as `PATH`, `NODE_OPTIONS` or `LD_PRELOAD`, and on Windows a batch file is started through `cmd.exe` with
   its arguments escaped and the key kept off that command line ([48-SPEC-CLI](48-SPEC-CLI.md) §8). This is not
   rule 3's agent tool: no MCP tool reaches either door.
   *(Added September 16th 2026: the owner's own two doors, which are a second pair and not a loosening of these.
   `POST /api/keys/put` and `POST /api/keys/open` take a browser session and an `Origin` the host answers for,
   refuse every bearer with `403 NEEDS_BROWSER_SESSION` including the self-host's server key, and refuse a request
   carrying no `Origin` at all, which is how they can take a cookie where rule 9's doors cannot. Behind them is the
   same host step: the `KeyStore` seals the value and the record is handed sealed bytes, through the same INTERNAL
   `depositGrant` and `openForGrant`. What decides whether the session may reach a key is rule 2's gate and not the
   door: an owner, no token, and a proof under fifteen minutes old; a person reaches every key the record holds,
   where a vault grant reaches only its own project's. A read is the same counted `grant.read`, signed by the
   person, and the value leaves in the same one answer with `no-store`. The Keys screen is the only caller:
   it puts a key in, replaces one row's value, and reveals one for thirty seconds, clearing the clipboard after
   sixty. `/api/vault/deposit` and `/api/vault/open` are unchanged and still refuse a page, whatever its origin.)*
   *(Amended September 25th 2026, `loop/finish/agents.md` C1: an agent may ADD a key with its login token, and only
   add one. `POST /api/vault/deposit` also takes `Authorization: Bearer <rec>.<token>`, a live token of scope `write`
   on the keys list, checked as every `/api` bearer is, and only when the bearer is not a vault grant. Its body is
   `{ label, opens, kind?, value }`; a `project` or a `credential` in it is `VALUE_MALFORMED`, because the key goes to
   the project the token's run is in, as the session ladder resolves it, or to no project when the run is in none. A
   label already within that reach is `403 FORBIDDEN`, whose sentence names the two ways a value is replaced: a vault
   grant for its project (`braindog login <host> --vault <project>`) or the owner on the Keys screen. So a login token that leaks can add a
   key and never swap one, and rotation keeps needing a vault grant or the owner. The host sets the record's
   `agentDeposit` flag on this path alone, never from a body; the answer is the one a grant's deposit gets, with
   `no-store`, the events are `grant.add` and `create`, signed by the run, and the row's origin reads
   `<agent> on <machine>, S<n>`. `POST /api/vault/open` still takes a vault grant and nothing else. `braindog keys put`
   sends the vault grant when one is held and the login otherwise, and `braindog tools scan` deposits through it.)*
   *(Added September 15th 2026, `loop/research-agent-path.md` step 18. `tools/gates/secret-grep.mjs` holds
   the value's shapes in the three files that may name it, and follows a call to a function in the same file
   whose return type names the brand.)*
   *(Added September 15th 2026, later the same day: the Worker's key store. `apps/worker/src/keys.ts` reads the
   root key only from the `KEK` binding, a Worker secret or a Secrets Store binding of that name, holding 32 bytes
   as 64 hex characters or base64url, with the self-host's fingerprint. Unbound, both doors check the grant and
   answer `NOT_IN_THIS_BUILD`, and `/auth/provision` REFUSES rather than making a record that can never hold a
   key. That is an amendment, made in the revision that added the guard: this paragraph used to say provisioning
   carried on without them. A record is given its keys once and the moment is the create, so a record made on an
   unbound deployment never gets them, and the only repair is to throw the Directory name away. A deployment that
   seals nothing says so with the var `PROVISION_WITHOUT_KEYS: yes`, which is read from the deployment rather than
   from the request because that is where `KEK` itself is decided, once, by the person who knows. Bound, provisioning wraps a new
   record's three keys, and the Worker seals and opens exactly as the self-host does: the record's `depositGrant`
   calls the Worker's `seal` back over RPC, so the Durable Object receives only sealed bytes. A record created
   before the binding answers "Keys need a record created after this host key store was bound, and this record is
   older than that." A bound value that is not 32 bytes is refused, never taken as unbound.)*


### 6.1 · The device-authorisation grant, and five refinements from the predecessor

The predecessor's vault landed on 2026-09-01 after an owner decision (SG24 → D39,
*encrypted-in-brain*) and answered every argument the original *"never a value"* rule had made — in
code rather than by dropping them. Five of its mechanisms were missing here.

**RFC 8628, the flow a television uses.** The device that wants in shows a six-digit code; the owner
approves it from a session that is already authenticated as him. It is the right shape because *the
thing asking is not the thing holding the identity* — a CLI on a VPS, an agent, a browser that has
never opened the vault all ask the same way.

> **The code is not the security.** Six digits is a million, with a ten-minute life
> (`DEVICE_CODE_EXPIRED` after it) and five attempts (`DEVICE_CODE_TRIES`). What the code proves is that the approver is **looking at the device that asked.**
> Guessing it does not get you in; it gets you a chance at being approved by somebody deciding whether
> they recognise the request.

| Rule | Why |
|---|---|
| The device polls with a **long random id, never the code** | conflating them makes polling a million-guess oracle |
| The code is stored **hashed, never in clear** — `code_hash = sha256(id ‖ ':' ‖ user_code)`, the long random poll id as its salt; the record has no `SESSION_SECRET` and depends on no host secret to check it ([45-SPEC-RECORD](45-SPEC-RECORD.md) §5.11) | a pending row is readable by anything that reads the database. *An earlier draft hashed it under the session secret* |
| **One row, two lives**: pending → approved → active | two tables would mean delete-and-reinsert at approval, and a crash between them loses the approval he just gave |
| Approval is **the owner's, from a sign-in proved in the last 15 minutes**. A bearer gets `403 NEEDS_BROWSER_SESSION` (it is authenticated, so it is forbidden, and the `401` rule in §8 stays true), and an older sign-in is asked to sign in again. The self-host's server key is proved on the request that presents it | an agent may not approve its own request, and an approval hands out a 90-day bearer that works from anywhere, so it asks what `openGrant` asks |
| **Starts are counted per address**: ten in 15 minutes, then `429` with `Retry-After` for 15 minutes, in the `auth_fail` table sign-in already counts in. A count that cannot be read refuses | a start costs nothing to send, and a list of codes nobody asked for hides the one somebody did |
| **The address to approve at is the host's own**: `verification_uri` is always on `<origin>`: `<origin>/app/<slug>/settings/agents` on the Cloud when the start named a slug, `<origin>/app/settings/agents` otherwise and on the self-host (since push A of the one-domain move, September 23rd 2026). A start that reached the host by another name, or that a page on another origin sent, is `403`, and the CLI refuses a `verification_uri` on another origin before it prints a digit | six digits typed into a page somebody else runs are an approval they can spend |
| **Neither route logs a code, a poll id or a bearer** | more people read a log than read the record |
| A wrong code bumps `tries` on *every* pending row; five → `denied` (`DEVICE_CODE_TRIES`). A malformed entry spends no try | a guesser cannot spread guesses across waiting requests to stay under the count, and a typo should not spend somebody else's enrolment |
| **The poll id is never shown.** A listing, an event and a revoke name a row by a handle, the first 16 hex of `sha256('device:' ‖ id)` | between approval and exchange, whoever holds the id can take the bearer |
| **A denied row is kept** | *"I said no to a request I did not make"* is the single most important line this table can produce |
| The grant is **revocable on its own**, without ending the session | it is a separate long-lived token, 90 days, stored as `token_hash`, because revocation is real. `expires` holds the code's ten minutes while pending and is rewritten when the poll exchanges an approved row (approved → active), once: a second poll is refused. A `login` exchange mints an ordinary `token` row through `createToken` (scope `write`, 90 days, the device's label, owned by the approver), so there is one bearer format and one verifier, and revoking the grant revokes that token. A device silent for 14 days, counted through its token for a login, is moved to `expired` by the hourly sweep and its token revoked |
| **And it is the tier-C runner's enrolment flow too** — [26-BYO-INTELLIGENCE](26-BYO-INTELLIGENCE.md) §2.3 had a bespoke one; there is now one — **and the operation grant's** (§3), **and the vault grant's**. The row's `reach` says which: `login` · `runner` · `export` · `import` · `pack` · `token` · `vault` — seven values since kernel migration 4. A `runner` exchange returns the 90-day bearer; an operation reach returns a bearer that keeps the code's ten minutes and is spent on one call; a `vault` reach carries `scope`, a project row id or `*`, and returns a bearer that opens that scope's keys for 30 days, or 7 for `*`, checked by `vaultGrant` and never by `verifyToken` | one flow to secure, and it is a standard |

Four more rows on the vault itself, each answering a specific way the earlier design would have
failed:

| Mechanism | Why |
|---|---|
| **`opened` and `last_opened` on the row, and the screen draws them** | one secret per request, no bulk read anywhere. *"A script that walked all thirty leaves thirty audit rows and thirty visible counters. The XSS is not prevented — it is made slow and loud, which is the honest claim."* |
| **`kek_id`** — a 72-bit fingerprint of the wrapping key | rotating the root key otherwise turns every row into a WebCrypto `OperationError`, *"which reads exactly like corruption on the one screen where 'the data is gone' and 'the key changed' need different answers."* A mismatch is `409 WRONG_KEY` |
| **Reveal is `openGrant`, an RPC in the VAULT group — never a readable address** | no URL, no history, no `Referer`. It returns sealed material and the host decrypts — the record never sees plaintext (§6, [ADR-062](16-DECISIONS.md)) |
| **`bytes` and `hint`** | *"a 3.2 KB env file"* against *"a 64-character token"* without opening anything — most of what the owner needs at a glance. Exactly two versions are kept — `ciphertext`/`nonce` and `prev_ciphertext`/`prev_nonce` — and the schema says so; there is no version table to prune |

**What is not defended, stated plainly:** a compromised host — on Cloud, the Worker — which can read the root key. The
alternative — end-to-end encryption — would mean no agent could ever read a secret and losing a
passkey loses the vault. The predecessor's owner chose the other trade knowingly, and the honesty table
in §7 says so.

### 6.2 · Where a key may go, and who may open it

*Added September 22nd 2026, for Slash's three tiers and for scripts, and revised the same day for wave thirty-seven,
checked against `packages/host/src/actions.ts`, `packages/host/src/script.ts`, `packages/host/src/script-try.ts`,
`packages/host/src/slash.ts`, `packages/kernel/src/script.ts` and both apps' `keyOpener` at `d23ac77d`.*

A key the vault holds leaves the host in one form only: an `authorization: Bearer` header on one request the host
makes, opened for that request after every check on it has passed, and dropped when the answer is back. Four paths
open one:

| Path | Opened by, and the `grant.read` signed as | Sent to | Checked first |
|---|---|---|---|
| a scheduled `call`, `poll` or `pull` ([25-CONNECTORS](25-CONNECTORS.md) §9) | the host's `keyOpener`, as `system`: nobody asked | the origin its declaration names | `sendAction`: `https:`, an origin an active declaration names, a host written as a literal private or local address refused, and on the self-host `pin` resolving the name and refusing a private address before the socket opens |
| a script's `ctx.fetch` | the same opener, as `system` | an origin in the script's `egress:`, and only the host the key's vault entry says it opens | in the sandbox, the origin, `https:`, no user name or password in the URL, the fetch count and a declared label; then `keyRefused`, the URL's host against the grant's `opens`; then `sendAction`'s checks again, over the script's own origins |
| a trial of a draft script (`script_try`, [25-CONNECTORS](25-CONNECTORS.md) §12) | the same opener, as `system`, and only when the caller is the owner signed in as a person | as a script's | as a script's. For any other caller, a token included, the record hands the host no vault, and a fetch naming a key is refused unsent |
| Slash ([46-SPEC-SLASH](46-SPEC-SLASH.md) §5.9) | the app's `keyOpener`, as the person who asked | `SLASH_ENDPOINT` | the vault's gate on the asker's own session: an owner, never a token, a proof under fifteen minutes old; for tier `b`, a live `api_token` grant that is not the one labelled `slash` |

1. **Neither the sandbox nor the model ever holds a key.** A script names a label and the host resolves it, by
   label or id, never a revoked grant, the newest first; Slash's package is handed an adapter whose key is asked
   for on the call.
2. **Every opening is rule 1's `grant.read`, and it names who caused it.** Before September 22nd every Slash opening
   was signed `system`, because both hosts' opener defaulted to it, so an owner reading the log could not tell her
   own asks from anybody else's. Slash's openings now carry the asker; `system` is what a run with nobody at the
   keyboard gets. A trial of a draft script is the one exception left: the owner asked for it, and its opening is
   still signed `system`, because both hosts hand it the scheduled runs' opener, which takes no actor.
3. **A key other people's asks would open goes through the vault's own gate.** Where Slash's included model is
   keyed from the vault (no operator key, and a live grant labelled `slash`, which on the Cloud is the only way it
   is keyed), a colleague is refused before any model is called, on a read as well as a propose. Measured before the
   gate: a colleague at `read` with a proof fifty minutes old read and proposed with 200, on three model calls on the
   owner's key.
4. **A script's key goes only to the host its vault entry opens** (`keyRefused`, the same function on both hosts).
   The grant's `opens` is read as a host name when it parses as one (`api.gold.test`, `api.gold.test:8443` and
   `https://api.gold.test/v1` all name `api.gold.test`) and compared with the fetched URL's host exactly, with no
   subdomain let in: `opens: stripe.com` does not open `api.stripe.com`. An `opens` that names no host, such as "the
   Bake test account", sends the key nowhere. A fetch that breaks this is `FORBIDDEN` and refuses the whole run,
   however the script handles it, as an undeclared key does. Measured before it, by the audit of wave thirty-five
   on the self-host runner: `goldapi`, whose row opens `api.gold.test`, was sent as a bearer to `collector.test`,
   because that origin was also in the script's `egress:` (`loop/research-batch-thirty-five-audit.md` §2;
   `apps/selfhost/test/script-key-egress.test.ts`).
5. **No script may name the vault's `slash` key**, whatever it opens, because on a host with no `SLASH_KEY` it is
   the key the included model answers everybody with, the same reason Slash refuses it as a tier `b` key. The kernel
   refuses it at install and before a trial (`scriptBody`, `FORBIDDEN` at `keys[i]`), and both hosts refuse a run
   that declares it before the sandbox starts (`slashDeclared`) or fetches with it under its grant id (`keyRefused`
   matches the label the lookup found).
6. **The answer is scrubbed of the key** before the sandbox or the record sees it, in the body and in every refusal
   sentence, and no response header is passed on, because a header is where a provider could echo the key and only
   the body is scrubbed. The scrub takes out every spelling `spellingsOf` names: the bytes as sent; JSON-escaped, as
   `JSON.stringify` writes it and with every `/` escaped as PHP's `json_encode` does by default; URL-encoded with
   upper-case and with lower-case hex; and base64, standard and URL-safe, at each of the three offsets the key can
   start at inside a longer encoded run, so `btoa('Bearer ' + key)` is caught as well as `btoa(key)`. Before it only
   the exact bytes were scrubbed, and a provider that echoed the header in any of the other spellings handed the key
   to the script, and from there to a row or the run's log (the same audit's §4).
7. **Redirects stay on the approved origin**, three at most, each hop checked again.

**What is not built.**

- **The install line does not say which host each key goes to.** A script names its origins and its keys as two
  lists, and `scriptEgress` (`packages/kernel/src/actions.ts`) joins them into one line (`CALLS OUT api.gold.test
  and collector.test · every 1h · key "goldapi"`). It cannot pair them, because the kernel's egress line does not
  see the vault. The pairing is enforced at the fetch (rule 4), so a key cannot reach the wrong host, but the owner
  approving the line is not told where it will go.
- **A key whose `opens` is not one of the script's `egress:` hosts is not refused at install.** Such a script
  installs, and every fetch with that key is then refused at run time, three refused runs pausing it. Nothing at
  install or in Decide compares the two, for the same reason: the check that sees the declaration does not see the
  vault.
- **A scheduled `call`, `poll` or `pull` does not read `opens` either.** Its declaration has one host and one grant,
  and its install line names both together, so the owner sees the pairing; but a key sent by an action is not
  compared with what its vault entry says it opens.
- **The scrub catches the spellings above and no others.** A key re-encoded another way (hex, `\u` escapes of
  ordinary characters, a hash of it) is not caught, and neither is a derived spelling shorter than eight characters,
  which only a key of five bytes or fewer has; the bytes as sent are always scrubbed, however short.
- **Slash's tier `b` key is sent to `SLASH_ENDPOINT`**, the endpoint the host's operator configured, whatever
  provider issued the key, and its `opens` is not read on that path. Choosing a host is trusting its operator with
  that address, and nothing in the tree checks it.

---

## 7 · What we can see, said plainly

For a product whose pitch is "your data", the operator's own access must be documented, not
implied.

| | Cloud | Self-host |
|---|---|---|
| Your rows | **we can read them** — the object runs on our account | no |
| Your credentials, vault passphrase **off** | **we could decrypt them** | no |
| Your credentials, vault passphrase **on** | no | no |
| Your prompts | payload retention off at the gateway — prompts and responses are not stored. Token counts and cost are, in Slash's `call` table ([46-SPEC-SLASH](46-SPEC-SLASH.md) §4.1), which holds no prompt text, because the budget needs them | no provider at all |
| Telemetry | counts and durations only; record id hashed with a monthly-rotating salt | none |

Operationally: access to a customer's record requires a named reason recorded in our own audit, follows
the diagnosis order of [53-SPEC-OPERATIONS](53-SPEC-OPERATIONS.md) §5.15 — the tuple, the refusal state,
`observation`, `event`, the `system` suggestions, and only then a row — and support never asks for a
vault passphrase. **The strongest available answer to "can you read
my data" is "self-host, and here is the complete build"** — which is what publishing the source and
D41 buy together, and why the self-host must never be a crippled tier. The licence is permissive, so
it is the *complete build* half of that sentence doing the work, not an obligation the licence puts
on anybody.

---


### Two rows this table was missing, and both make it less flattering

**1 · Connector credentials are not covered by the passphrase.**
[17-OPEN-QUESTIONS](17-OPEN-QUESTIONS.md) Q13 is **decided, (b)** — recorded as
[ADR-052](16-DECISIONS.md): a scheduled connector must decrypt a grant with nobody present, which a
passphrase-wrapped DEK forbids, so **connector grants only** live under a second, KEK-wrapped DEK — the
`connector` row of `vault_key` (§6). That means:

| | Passphrase off | Passphrase on |
|---|---|---|
| Your record's content | we can read it | we cannot |
| Your vault credentials | we can read them | **we cannot** |
| **Your connector credentials** | we can read them | **we can still read them** — read-scoped analytics keys, so the Worker can fetch while you sleep |

Q13 says it in one line: *"what must not happen is (b) silently."* This is the row that stops it
being silent, and the bind screen says the same thing in words at the moment the credential is
attached.

**2 · "We cannot read it" is true after thirty days, not immediately.**
Enabling the passphrase re-wraps the DEK and zeroises the KEK-wrapped copy in one transaction. But
the platform keeps **30 days of point-in-time recovery** ([01-ARCHITECTURE](01-ARCHITECTURE.md) §2)
and §8 ships **30 days of sealed backups** — both of which span the re-wrap. An operator who
restored to a bookmark from before it would hold a KEK-wrapped DEK again.

That is not a flaw to fix; a 30-day recovery window is why the product can survive a mistake, and
regulators accept backups being *beyond use* pending rotation. **It is a flaw to leave unstated in a
table whose whole purpose is to be believed.** The honest sentence is: *turning the passphrase on
removes our access going forward, and removes it from the backups thirty days later.*

---

## 8 · Application security

| Control | Note |
|---|---|
| Content Security Policy | no `unsafe-inline` for scripts or stylesheets, no third-party origins. Packs cannot load a remote asset, so the policy has nothing to allow. One named exception: `style-src-attr 'unsafe-inline'` for the renderer's single `--magnitude` custom property on a bar — an attribute value nothing content-controlled can reach; `style-src-elem` is nonce-based ([22-FRONTEND](22-FRONTEND.md) §7) |
| Output encoding | one renderer, one escape function, escaping applied before any markup exists so nothing downstream can un-escape |
| Link safety | `https:`, `mailto:`, anchors, same-origin paths only, `rel="noreferrer"` on the first two. Everything else renders as its literal text |
| CSRF | `SameSite=Lax`, plus the `Origin` check (or, where a browser sends no `Origin`, `Sec-Fetch-Site: same-origin`) on every cookie-authenticated non-GET and every `/auth` POST, which must also be `application/json`. The app is served with `frame-ancestors 'none'`. A self-host with no server key answers only to its own names: any other `Host` is an empty 421, so a page that rebinds its name to 127.0.0.1 cannot reach it |
| Rate limiting | per token and per IP at the Worker; per record at AI Gateway |
| Dependency surface | **a stated goal of near-zero runtime dependencies**, and the few are enumerated in [ADR-046](16-DECISIONS.md): `valibot` in `declare`, and one YAML parser, `yaml`, on the CLI and self-host paths only ([ADR-063](16-DECISIONS.md)). The prior system's Worker had no `package.json` at all, which is why it ran unmodified on plain Node — a supply-chain posture and a portability win from one decision |
| Secrets in CI | Cloudflare API tokens scoped to deploy only; no token in the repo, ever |
| Migrations | forward-only, checksummed, `--dry-run` first, `transferred_classes` never `deleted_classes`. A deploy carrying a kernel migration is never rolled back and never percentage-rolled; the canary is the ops record and recovery is fix-forward ([53-SPEC-OPERATIONS](53-SPEC-OPERATIONS.md) §5.3) |
| Backups | nightly `.brainl.age` to R2 under the record's own prefix, 30 days, ≤ 40 MiB per record, plus platform PITR at any point in 30 days. The age identity lives outside Cloudflare — two copies in the operator's password manager; the Worker holds only `AGE_RECIPIENT`. Drilled: restore monthly, KEK rotation quarterly for real, erasure quarterly on the ops record, self-host upgrade every release, parity every deploy ([53-SPEC-OPERATIONS](53-SPEC-OPERATIONS.md) §5.4, §9) |


### A person's script: the sandbox and its ceilings

*Added September 22nd 2026 for DIRECTION §22, and revised the same day for wave thirty-seven, checked against
`packages/script`, `packages/kernel/src/script-run.ts`, `packages/record/src/index.ts` and both hosts at
`d23ac77d`.* A script is somebody's code, so the argument is not that it is harmless but that
everything it can reach is enumerated and each limit is held outside it.

| Ceiling | Default | Most a declaration may ask | Held by |
|---|---|---|---|
| `cpu_ms` | 200 | 1,000 | self-host: time inside the interpreter and inside every host function it calls, asked of the clock at each entry and exit, because QuickJS's interrupt handler never runs during a host call or a native one. Measured before that: two hundred large writes answered clean at 6,777 ms against 200. Cloud: the platform's `cpuMs` on the loaded Worker |
| `fetches` | 5 | 20 | the sandbox's count on the self-host, the record's object on the Cloud; the platform's subrequest limit is not relied on |
| `wall_ms` | 15,000 | 30,000 | a deadline raced against the run, and on the self-host the interrupt handler as well. On the Cloud an answer that arrives after the deadline is refused `OUT_OF_BOUNDS` whoever won the race, because the race cannot end code that never awaits: locally a four-second busy loop under `wall_ms: 500` answered clean before this check. In production the platform's `cpuMs` ends such a loop sooner |
| `writes` | 200 | 1,000 | the sandbox as each is queued, the Cloud's object again when the answer comes back, and the record a third time before any is applied: never more than 1,000 in one run, whatever a declaration says, because the kernel installs any whole number there |
| source | 64 KB | the same | refused before the run starts |
| memory | 32 MB | the same | self-host: the `maximum` of a `WebAssembly.Memory` made for the run, since QuickJS's own limit let a hundred 1 MB strings through to 104,956,678 bytes. Cloud: the platform's; this host sets none |
| log | 8 KB | the same | cut in the sandbox and again by the record, on a character boundary |

A limit over its ceiling installs, because the kernel may not import the package that holds the numbers, and is
refused `OUT_OF_BOUNDS` when the run starts. What else is held:

- **The only way out is `ctx`.** On the self-host there is no `fetch`, `require`, `process` or `import` in the
  sandbox, and the `Function`-constructor escape reaches an empty global. On the Cloud a bare `fetch`, `connect()`
  and `new WebSocket(…)` reach nothing; the loaded Worker's only outbound is the record's own object.
- **Every refusal is sticky.** A script that catches a refused fetch or an over-limit write and returns normally is
  refused anyway, with no writes.
- **Reads never show a secret field and never filter on one.** Taking the field off the row was not enough: a
  filter using `starts` on a `secret` field read a grant id back one character at a time, measured on
  September 22nd and closed the same day. A script reads as `system` with its `reads:` as the ceiling.
- **Writes are a request, not a write.** The record checks each against `writes:` itself, then applies them through
  its ordinary write path as `script:<id>@v<n>`, in one savepoint, so one refusal takes back the rest.
- **A refused run is a run.** It is metered and never retried; three in a row of the installed version pause the
  script until the owner resumes it, in a browser.
- **Each run starts clean on both hosts.** The self-host starts a new QuickJS instance per run; the Cloud loads a new
  Worker per run with `env.LOADER.load`, so nothing a run leaves on `globalThis` or in module state reaches the next.
  Before that the Cloud cached one Worker per script version, and the audit of wave thirty-five measured a second
  run reading what the first had left there (`apps/worker/test/script-isolation.test.ts`).
- **What a script logged is shown only to whoever may read what it touched.** A run's `ctx.log` is kept on its
  event with the lists its version read and wrote, and `recentHistory` and `whatsNew` hand the log only to an owner
  in a browser who reads every one of those lists (`logOf`, `packages/record/src/index.ts`); everybody else sees the
  run, its outcome and its counts, and `--redacted--` for the log. A token, the owner's included, never reads it.
  Before that a member refused `list money` read a salary from a run's log line (the audit's §1).
- **A refused or failed run's note carries none of the script's words.** The note is on a line every whole-record
  reader sees, so it says only that the run did not finish and that its log says why; the reason, which can quote a
  thrown message or a list name the script made up, goes first in the guarded log (`finishScript`,
  `packages/record/test/script-refusal-note.test.ts`).
- **A trial writes nothing and opens a key only for the owner.** `script_try` runs a draft in the same sandbox, with
  the caller's own reads instead of `system`'s, since nobody approved the draft's `reads:`, and with no vault for any
  caller but the owner signed in as a person (§6.2). It is metered as a run on the plan's allowance.

The findings of `loop/research-batch-thirty-five-audit.md` about scripts (the log, the key's host, the `slash` key,
the scrub, module state and `wall_ms`) are closed as above and in §6.2. **What is still open** is §6.2's *What is
not built*: the install line does not say which host each key goes to, and a key whose `opens` is not among the
script's origins is refused only when the script runs. The Cloud's memory ceiling is the platform's, and no deploy
smoke has yet run a busy loop against the production `cpuMs`.

### Refusals that do not leak

Carried from the predecessor, where each was earned:

| | |
|---|---|
| A `401` says only `UNAUTHORIZED`; a `500` is bare | recon gets nothing |
| **No CORS, anywhere**; every JSON answer is `no-store` | — |
| The login lockout **reserves the attempt before comparing**, compares ten attempts and refuses the eleventh with a bare `429` and `Retry-After` for fifteen minutes, sticky, on a capped counter that forgets a first strike fifteen minutes old and that a success clears for its address; the address is the socket's, or behind a proxy named with `BRAINDOG_TRUST_PROXY=1` the last `X-Forwarded-For` entry; it is keyed four ways — `ip:` `email:` `mint:` `device:` — and **fails closed** — a reservation that returns no row is a `503`, not a pass. Device codes and share tokens are locked out on the record's own `auth_fail`, logins on the Directory's ([49-SPEC-SELFHOST](49-SPEC-SELFHOST.md) §5.5) | the magic-link fallback code is short-lived and guessable in principle; the lockout is what makes any code field acceptable |
| **Agent tokens bypass the lockout, deliberately** | *"an agent tripping the ten-strike IP block would lock Sam out of his own brain"* |
| Every sign-in failure is **one body**, `401 UNAUTHORIZED` "That did not sign you in.", whatever failed: a passkey, a link, the server key or a session. The reason is logged, not returned | the caller who deserves the reason is the owner, who reads the log |
| Passkey registration requires an authenticated session **in place of attestation** | *"behind the gate… is the security model in one line"* |
| **Two fleet-wide levers, both the host's**: the Directory's session, link and challenge hashes are HMAC-SHA-256 under the host's session key (`SESSION_SECRET` on the Worker; on a self-host, HKDF over the key file with the info `braindog/session`, or `BRAINDOG_SESSION_SECRET`), and `TOKENS_VALID_FROM` refuses anything minted before it | rotate one secret and every session is gone; set one date and every token is gone — an incident response that walks no rows ([53-SPEC-OPERATIONS](53-SPEC-OPERATIONS.md) §5.11) |
| **Fixtures carry no real data**: generated names, `.example` hosts, dates in 2030–2031, amounts under 10^7 minor, no ULID or hash on disk | a test corpus is the one copy of a record that is committed in clear ([40-SPEC-FIXTURES](40-SPEC-FIXTURES.md)) |

**An audit row is drawn on another screen.** The predecessor logged `Credential indexed: <name> — opens
<opens>` on the reasoning that an audit row is read in a briefing and should be useful — and that reasoning is
why it was wrong: audit rows are drawn on the activity screen, and the vault is the one screen that is
**absent, not blurred, under screenshot mode**, because an index that is merely smudged is an index still in
the page source. Latent while credentials were added by hand; a migration indexed thirty-five in one run and
the harness caught thirty-five `opens` sentences on a screen that should carry none. So: a `grant.*` event's
`note` carries the grant's id and `kind`, never its `label` or `opens` — the rule keys on `target_kind = 'grant'`,
whatever the event kind, and a `vault_key` re-wrap's note is `<purpose> <from> → <to>`, naming no grant; the
event's `refs` carry the id, so a reader entitled to the prose is one call from it. Three invariants of the vault screen are tests
([18-BUILD-TOOLKIT](18-BUILD-TOOLKIT.md) §6): a closed row draws no `opens`; opening a row opens exactly one;
no value control is drawn on a page with nothing expanded.

### The asset store

The rules for `file` and the `/a/<sha256>` route, all from the predecessor and all learned:

- **The writer cannot choose the key** — it is the content's SHA-256, so dedupe is per record and
  a stranger cannot overwrite.
- **Type from bytes, never from the header.** PNG, JPEG, WebP, GIF, AVIF, PDF. **SVG is refused with
  `415`**: an SVG is a script. A header that names a type other than the bytes' is refused too.
- Served with `nosniff`, `default-src 'none'; sandbox`, `private`, immutable, so a file opened as a page
  runs nothing and no shared cache keeps it.
- 2 MB, checked against `Content-Length` before reading and against the bytes as they arrive.
- **The route is `/api/files`, and it asks who you are** (OPS-20). The earlier `/a/<sha256>` was
  never forwarded by the site, and "the URL is the capability" made a hash seen once a key for
  ever. Now `PUT /api/files` takes a session cookie from the page's own origin, or a `write` bearer,
  and the server hashes what arrived and answers `{ sha256, mime, bytes }`; `GET
  /api/files/<sha256>` takes the same doors and anybody the record lets read. The app's `<img>`
  sends its cookie, so it needs no bearer. The 64-hex test stops traversal before a key or a path
  is built, and the key is always under the caller's own record (`rec_<id>/a/` on the Cloud,
  `<data>/<slug>/blobs/` on a self-host), so no hash reaches another record's file
  ([51-SPEC-WORKER](51-SPEC-WORKER.md) §5.5).
- **An erasure deletes the file, and so does deleting the record.** The kernel queues one
  `erase.r2` per file the subject's rows held; the host deletes that object, and the nightly walk
  puts back any that is still in the bucket. Deleting a record sweeps its `a/` prefix before its
  bytes go.

### The export, and what it leaves out

`export` excludes every table in the `local` section of `dog_section` — `token`, `device_grant`,
`auth_fail`, `observation`, `job`, `job_event` — and nothing else
([03-DOG-FORMAT](03-DOG-FORMAT.md) §3, [33-CONTRACTS](33-CONTRACTS.md) §9). **`grant` rows travel
sealed by default**, and so does the wrapped DEK in `vault_key` — which opens nothing without the root KEK, a
Worker secret that is never in any file — so a leaked export is
bytes. `--redact-grants` drops the ciphertext too. *An earlier draft said the export excludes every
vault table; that contradicted [03-DOG-FORMAT](03-DOG-FORMAT.md) §5's three export modes and rule 6
above, and it is withdrawn.* **A snapshot is not an export.** On a self-host a snapshot is a full copy
that keeps the six `local` tables and never leaves the host — disaster recovery; on Cloud the nightly
backup is an export, sealed, and it rides the **outbox**, which gives it the retry ladder and the visible
failure ([51-SPEC-WORKER](51-SPEC-WORKER.md) §5.12). The nightly walk flags `auditTruncated`, always
writes `latest`, records row counts in the object's metadata so *"it is backed up"* is checkable, and
**a failed night writes an
`export` event with `note: 'failed: <reason>'` and opens a `suggestion`** (*re-run the snapshot*) — the
visible item [09-ALARMS](09-ALARMS-AND-NOTIFICATIONS.md) §1 requires; `blocker` is not an event kind.
A backup that silently gave up is worse than none. Two routes exist for the owner: **snapshot now**,
and **list what is kept, with counts.**

---

## 9 · Deliberately not doing

| Not doing | Because |
|---|---|
| SOC 2 | a solo product with 80 subscribers does not need an auditor; it needs a checkable source tree. Revisit if an entity buyer appears — which is already a watched signal |
| End-to-end encryption of the whole record | the server must query to render pages, run metrics and answer MCP. E2EE would make the record a blob store and delete the product. The vault is encrypted; the rows are not, and this is stated |
| Bring-your-own-KMS | no customer has asked. It is an additive adapter later |
| A bug bounty | before there are users, a bounty is a support queue |
| 2FA via SMS | passkeys are better and simpler, and SIM swap is exactly the attack this data attracts |

---

*Next: [13-UI](13-UI.md) — the interface.*

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
| Someone with a stolen `.dog` backup | credentials | gets ciphertext. §6 |
| A stolen R2 bucket | everything | gets `.dogl.age` ciphertext |
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
| An MCP client | an agent token (Phase A ships tokens only); OAuth 2.1 (RFC 9728 metadata, RFC 9207 `iss`, CIMD) when BrainDog is its own authorization server — deferred, [33-CONTRACTS](33-CONTRACTS.md) §4 |
| A shared link recipient | a signed, scoped, expiring token — the `share` principal kind of the one `CallContext`. Read-only, one page — `page(slug)` for one slug; `ctx.scope` is the link's projection, an empty ceiling ([20-COLLABORATION](20-COLLABORATION.md) §1); nothing else |
| A person, invited | the owner mints a single-use invitation link (24 h, bound to one email) — `invite`, an ADMIN method; the invitee registers a passkey behind it; at `GET /auth/invite/<token>` the host calls `acceptInvite` — INTERNAL — with the Directory's verified person, and that writes the `member` rows and one `access.grant` event per register ([20-COLLABORATION](20-COLLABORATION.md) §1) |
| **A machine the customer connected** — the tier-C runner | **the device grant of §6.1** with `reach = runner` (RFC 8628): six-digit code, owner approves in the browser, a 90-day bearer stored as `token_hash`, auto-deregistered after 14 silent days; the `runner` principal kind. It reaches the JOBS group's three runner methods — `claimJob` · `postJobEvent` · `readCancel` ([30-BLUEPRINT](30-BLUEPRINT.md) §5) — and, per job, a job bearer that `claimJob` mints as a `token` row: scope `propose` (which reads), labelled `job:<id>`, audience one job, expiring with the job ([46-SPEC-SPARK](46-SPEC-SPARK.md) §4.7). Never `write`. See [26-BYO-INTELLIGENCE](26-BYO-INTELLIGENCE.md) §2.3 |
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
`POST /auth/token`. The device grant, the invitation and the record switch (`/auth/device`, `/auth/device/token`,
`/auth/device/approve`, `/auth/invite`, `/auth/switch`) are specified and not built, and keep those paths when
they land. A bearer on the wire is `<rec_id>.<secret>`; the record keeps only `sha256(secret)`, in `token.hash`
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

Inference, webhooks out, email out and pack fetching happen in the Worker or in Spark's object.
The record object can be asked for data and can store data. It cannot speak.

Two problems solved by one line: `fetch()` inside a Durable Object breaks the input/output gates
and permits request interleaving (a correctness bug), **and** an object that cannot call out
cannot exfiltrate (a security property). When a correctness rule and a security rule want the same
constraint, take it.

---

## 5 · Prompt injection and the lethal trifecta

The exploitable pattern is one shape: **private data + untrusted content + external
communication.** BrainDog has the first two structurally. The full design is in
[11-ASSISTANT](11-ASSISTANT.md) §7; the security-relevant summary:

| Control | Kind |
|---|---|
| Spark has no write RPC | architectural |
| Spark has no tool that returns a secret | architectural |
| Spark's only outbound call is the model | architectural |
| Untrusted content is read by a **tool-less** model; only its structured output reaches the tool-bearing one | architectural |
| A write whose provenance touches `inbox_raw` requires human approval | enforced by provenance, not heuristics |
| A redaction pass over every projection before it enters a prompt | **ours.** `secret` fields become their label; ciphertext never leaves the record |
| AI Gateway DLP as a tripwire on prompts and responses | defence in depth. **Flag and block only — it cannot redact**, so it catches a mistake rather than preventing one |
| Every proposal records what it read | audit |

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
  Root KEK — Cloudflare Secrets Store       Root KEK — env var or a file with 0600
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

Decrypting any key then requires the passphrase in-session.

This is the honest trade, stated in the UI rather than in a whitepaper:

| Vault passphrase | We can read your credentials | You can lose them |
|---|---|---|
| off (default) | yes, technically | no |
| **on** | **no** | **yes, permanently** |

Default off, because a founder locking themselves out of their own hosting credentials is a more
likely disaster than us reading them. Offered prominently, with the consequence in the same
sentence as the switch.

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
| Approval is **browser-session only** — a bearer gets `403 NEEDS_BROWSER_SESSION` (it is authenticated, so it is forbidden — and the `401` rule in §8 stays true) | an agent may not approve its own request |
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

---

## 7 · What we can see, said plainly

For a product whose pitch is "your data", the operator's own access must be documented, not
implied.

| | Cloud | Self-host |
|---|---|---|
| Your rows | **we can read them** — the object runs on our account | no |
| Your credentials, vault passphrase **off** | **we could decrypt them** | no |
| Your credentials, vault passphrase **on** | no | no |
| Your prompts | payload retention off at the gateway — prompts and responses are not stored. Token counts and cost are, in Spark's `call` table ([46-SPEC-SPARK](46-SPEC-SPARK.md) §4.1), which holds no prompt text, because the budget needs them | no provider at all |
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
| Backups | nightly `.dogl.age` to R2 under the record's own prefix, 30 days, ≤ 40 MiB per record, plus platform PITR at any point in 30 days. The age identity lives outside Cloudflare — two copies in the operator's password manager; the Worker holds only `AGE_RECIPIENT`. Drilled: restore monthly, KEK rotation quarterly for real, erasure quarterly on the ops record, self-host upgrade every release, parity every deploy ([53-SPEC-OPERATIONS](53-SPEC-OPERATIONS.md) §5.4, §9) |


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
- **Type from bytes, never from the header.** PNG, JPEG, WebP, GIF, AVIF. **SVG is refused with
  `415`** — an SVG is a script.
- Served with `nosniff`, `default-src 'none'; sandbox`, `noindex`, immutable. **The URL is the
  capability**: an `<img>` cannot send a bearer header, so the route is unauthenticated and the
  64-hex path regex is what stops traversal.
- 2 MB, checked against `Content-Length` before buffering and against the bytes after.
- **Uploads exist, and the client names the hash**: `PUT /a/<sha256>` with a session cookie or a `write`
  bearer; the server hashes what arrived and a mismatch is `CHECKSUM_MISMATCH`
  ([51-SPEC-WORKER](51-SPEC-WORKER.md) §5.5). *(An earlier draft had a store and no way in.)*

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

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
| An agent | bearer token, scoped `read` · `propose` · `write` — **there is no `admin` scope, ever**, and no standing token reaches ADMIN. KEYCHAIN is a browser session only. ADMIN is a browser session — or a bearer carrying an **operation grant**: from a browser session the owner approves *one named operation* (a pack install by plan hash, an export scope, an import by file hash, a token's creation or revocation) after seeing its summary; the approval is single-use, dies in ten minutes, is recorded as `device_grant.reach` and an `access.grant` event, and reaches exactly that one method once ([ADR-060](16-DECISIONS.md), amended; [48-SPEC-CLI](48-SPEC-CLI.md) §5.2; [45-SPEC-RECORD](45-SPEC-RECORD.md) §5.6). Revocable, shown once, last-used recorded |
| An MCP client | an agent token, made in the app, by the device grant, or by OAuth 2.1 with BrainDog as its own authorization server ([10-MCP](10-MCP.md) §2) |
| A shared link recipient | a signed, scoped, expiring token — the `share` principal kind of the one `CallContext`. Read-only, one page — `page(slug)` for one slug; `ctx.scope` is the link's projection, an empty ceiling ([20-COLLABORATION](20-COLLABORATION.md) §1); nothing else |
| A person, invited | the owner mints a single-use invitation link (24 h, bound to one address) — `invite`, an ADMIN method. The record stores only `sha256(secret)` and answers the link once; no host mails it, and the owner sends it. The link is `<origin>/invite#<token>` (at the root since 29 Oct, under `/app` from push A of the one-domain move until then, and with no slug, because the token names its record), the fragment keeping the token out of logs, proxies and `Referer`; the page posts it to `POST /auth/invite`, which signs the invitee in — an address that can already sign in here signs in first — and calls `acceptInvite` — INTERNAL — with the Directory's verified person, and that writes the `member` rows and one `access.grant` event per register, as `system` ([20-COLLABORATION](20-COLLABORATION.md) §1) |
| **A machine the customer connected** — the tier-C runner | **the device grant of §6.1** with `reach = runner` (RFC 8628): six-digit code, owner approves in the browser, a 90-day bearer stored as `token_hash`, auto-deregistered after 14 silent days; the `runner` principal kind. It reaches the JOBS group's three runner methods — `claimJob` · `postJobEvent` · `readCancel` ([30-BLUEPRINT](30-BLUEPRINT.md) §5) — and, per job, a job bearer that `claimJob` mints as a `token` row: scope `propose` (which reads), labelled `job:<id>`, audience one job, expiring with the job ([46-SPEC-SLASH](46-SPEC-SLASH.md) §4.7). Never `write`. See [26-BYO-INTELLIGENCE](26-BYO-INTELLIGENCE.md) §2.3 |
| Inbound webhook | the URL is `/in/webhook/<rec_id>/<ingest-id>/<token>` — a random path token per ingest — and a declared `verify: { kind: hmac_sha256, header: X-Signature, grant: <label> }` ([25-CONNECTORS](25-CONNECTORS.md) §3.2) is checked in the host through the record's `ingestVerify`, since the record never decrypts ([51-SPEC-WORKER](51-SPEC-WORKER.md) §5.4); an unverified payload is stored `untriaged` and never matched |
| Inbound email | the per-record address is the capability; a DKIM/SPF pass is required to match, else the payload is quarantined `untriaged`. A pass says the sender is who its `From:` says, and not that it is the bank, so a verified mail from an address nobody has said yes to writes nothing: it is one question per address, unless the pattern itself names that sender exactly (`senderToAsk`, `packages/kernel/src/ingest.ts`) |
| The same message again | Money only: the same words from the same sender within 30 days wait to be looked at and are not filed (`heardBefore`), though the bytes are new (a signed alert stays signed when sent on) or the row they made was deleted. New words are a new message, so a genuine alert sent to someone else and forwarded here is not stopped by this. |
| What a text at a door proves | The path token proves whoever posted holds that door's address, and nothing about who sent the text: a text has no sender this can read, so a spoofed one the Shortcut lets through files as read. What it can do is write a ledger row and the rows and questions the first-party rules work out from it. Nothing in BrainDog pays or moves money. |
| Self-host, single user | `BRAINDOG_TOKEN` for a private instance — owner level, everything; self-host single-user only — exchanged at `POST /auth/token` for a session, behind which passkeys are registered (ES256 and RS256, no attestation); the magic link and an invitation's mailbox proof work once `BRAINDOG_SMTP_URL` and `BRAINDOG_MAIL_FROM` name a submission server, over TLS or not at all, and are off without them ([49-SPEC-SELFHOST](49-SPEC-SELFHOST.md) §5.6, §5.20) |

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

**What sign-in became before a stranger could sign up** (*amended September 28th 2026 against the tree*):

- **User verification is required** in both passkey ceremonies and the flag is checked, so a key that does not
  verify its holder is refused; a security key with no PIN is one, and the mailed link is the way in for it.
- **A session lives 90 days from its last use and ends 180 days after its last proof** (`PROOF_LIFE`, `authed_at`), however often it was rotated. `/auth/sessions` lists
  every live session by a short reference, never its id, and `/auth/logout/all` ends the others or all of them.
- **Step-up**: registering or removing a passkey, `invite`, `createToken`, `restore`, `deleteRecord` and closing an
  account need a proof within 15 minutes, and answer `401` with reason `stale` or `NEEDS_BROWSER_SESSION` otherwise.
  Removing a passkey ends the person's other sessions, and adding or removing one mails them.
- **An invitation proves the mailbox**: an address that cannot already sign in is mailed a link, and only that link
  makes the person, accepts, and opens a session (`invite.prove`). A host with no mail says it cannot prove a new
  address and asks for one that can already sign in.
- **Sign-up** (`/auth/signup/start`, `verify`, `name`) is Cloud only, closed while `BILLING` is unset, locked out like
  every other door, and checks Turnstile with `TURNSTILE_SECRET` when it is set. A known address gets a sign-in link
  and the same `200 {}`, so the door tells nobody who has an account.
- **Sign in with Google** (`/auth/google/start`, `callback`) is Cloud only and off until both `GOOGLE_CLIENT_ID` and
  `GOOGLE_CLIENT_SECRET` are set. Google proves the address and nothing else: the Directory mints a sign-in link for
  it and the Worker spends it at once, so an address nobody has, a suspended person and the lockouts are all treated
  as the mailed link treats them. Only a verified `@gmail.com` address, or one on a domain Google hosts (`hd`), is
  taken. The state, the PKCE verifier and the nonce live in a ten-minute `__Host-` cookie, never in a row.
- **A self-host with a server key and no certificate is plain http on every interface.** Setting
  `BRAINDOG_SERVER_KEY` widens the bind to `::`, and nothing turns TLS on, so the key, bearers and the session cookie
  cross the network unencrypted, and `bd_s` at `localhost` is shared with every port on the machine. The start says so
  in one line (`plainLine` in `apps/selfhost/src/how.ts`); set `BRAINDOG_TLS_CERT` and `BRAINDOG_TLS_KEY`, serve it
  behind https on the same machine, or set `BRAINDOG_LISTEN=127.0.0.1`. In the Docker image the default compose file
  publishes the port on `127.0.0.1` only; `BRAINDOG_PUBLISH=0.0.0.0` is the explicit opt-in for the network, and the
  line then names it.
- **The token cut-off** is `TOKENS_VALID_FROM` (`BRAINDOG_TOKENS_VALID_FROM` on a self-host): every token, device grant
  and operation grant created before the instant is refused, and the owner's list shows them "ended by the operator".
- **Closing an account** is the person's own act (`POST /account/close`, the address typed, a sign-in within 15
  minutes), refused while they are the only owner of an open record; their passkeys, sessions, links and memberships
  go and the Directory forgets them. Every record they are on is stopped first, and the keys and machines they hold
  there are revoked, because a bearer is checked against the record's own tables and never asks the Directory; a record
  that cannot be reached refuses the close. **Suspending** one is the operator's (`POST /auth/suspend`, the operator
  key), which stops sign-in, ends every session and stops them on each record they are on, so their keys stop too.
  Letting them back in lifts that stop and no stop an owner made ([53-SPEC-OPERATIONS](53-SPEC-OPERATIONS.md) §5.16).
- **A keychain grant, a runner and a shape grant stand only while the owner who approved them is an owner.** Taken off,
  handed over or stopped, their machines stop with them (`APPROVER_STANDING`, `leaving-ends-bearers.test.ts`).

---

## 4 · The record makes no outbound calls

Restated here because it is a security control and not only a correctness one.

Inference, webhooks out, email out and pack fetching happen in the Worker or in Slash's object.
The record object can be asked for data and can store data. It cannot speak.

Two problems solved by one line: `fetch()` inside a Durable Object breaks the input/output gates
and permits request interleaving (a correctness bug), **and** an object that cannot call out
cannot exfiltrate (a security property). When a correctness rule and a security rule want the same
constraint, take it.

*(Added September 22nd 2026 for scripts.)* **A person's or an agent's script does not change this,
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
| A model key kept in the Keychain opens only for the owner on a proof under fifteen minutes old, and each opening names who asked | procedural, the Keychain's own gate, in the host ([46-SPEC-SLASH](46-SPEC-SLASH.md) §5.9, §6.2 below) |

**In a conversation, a read is marked by the row and a write is weighed against the person's sentence** (*5 November 2026,
`packages/mcp/src/slash-heard.ts`*). `search`, `open`, `list`, `today`, `waiting` and `changes` mark any row a run, a door, a
feed, a rule, a script or a colleague made or changed, between « » and for the model. A mark lasts as long as the words can be
read back: an answer that read one marks the conversation's next turns, whose model reads that answer again. On a marked
conversation a write lands at once only when the person's own sentence accounts for all of it: its row is one they named or
pointed at, and every value it sets is one they said. Anything else waits for a yes that shows what it would set. A write to
what steers agents and machines (skills, tools, learnings, profiles, what carries, keys) always waits, a message to an agent
waits on any mark, and `instructions` and a run's row are written only by `tell`. The evidence for this over holding every
write after a marked read is `packages/mcp/test/slash-marks.test.ts`: twelve "find it and change it" turns on rows an agent
made all land and all would have been held, and nine orders a row can carry are all held.

**No injection classifier is a control here.** ~95% accuracy at ~65 ms is a fine signal and a
useless gate on a record holding credentials. It goes in the audit log as a flag.

The UI layer matters as much as the model layer: untrusted content is visually marked as untrusted
wherever it appears, and a proposal derived from it says so at the point of approval. A human who
does not know they are approving a stranger's instruction is not a control either.

### 5.1 · A press on the decision card inside Claude or ChatGPT

Agents suggest and the person decides, and no token reaches `decide` (ADR-060). The decision card that BrainDog draws
inside Claude and ChatGPT can still answer a question, but only as the person's own press. It is off until the owner
turns on **Answer from inside chat apps** in Settings › Agents. While it is off, the card's buttons open BrainDog.

**Why a press counts.** The card and the model share one key, the chat app's. What tells them apart is what each one is
shown. The model reads a tool answer's text and its `structuredContent`. The card is also handed the answer's `_meta`,
which both apps keep from the model: MCP Apps gives the view the whole result, and ChatGPT puts `_meta` on
`window.openai.toolResponseMetadata` and never shows it to the model. Beside each decision card, the MCP door asks the
record for a one-time **answer grant** (`chatAnswerMint`, INTERNAL) and puts it in `_meta` only. The card's button sends
the grant back with the option the person pressed (`answer`). The grant is the press's only standing.

**Why the model cannot press.**

| Control | Kind |
|---|---|
| `answer` with no grant is refused at the door before the record is asked (`LEVEL_REQUIRED`), and the refusal tells the model to show the card | architectural |
| The grant is never in the text or the JSON the model reads, only in `_meta` | architectural |
| `answer` is listed for the card and hidden from the model (`_meta.ui.visibility: ["app"]`, `openai/visibility: private`). An app that shows it anyway shows a tool the model cannot use | defence in depth |
| A grant is sealed (AES-GCM, under a key the record instance draws and keeps in memory), so nobody can write one. It names the person, the key, the question, the options shown and a hash of the question's body and state | architectural |
| One press spends it. It lapses in fifteen minutes. A restart of the instance ends every grant | enforced in the record |
| It is minted only for a key that Claude or ChatGPT holds after the person signed in to it (`client_kind` `cimd` or `dcr`, at `claude.ai`, `claude.com`, `chatgpt.com` or `openai.com`). That key lives on the app's servers, and the model never holds it. A key on a machine (`device`, `key`) is never minted a grant, because an agent with a shell could read the key, ask for a grant itself and press | enforced in the record |
| The three record methods (`chatApp`, `chatAnswerMint`, `chatAnswer`) are INTERNAL: no `/api` route reaches them, so a key cannot ask for a grant except through the door that hides it. `answer` is listed only to a key a chat app holds | architectural |
| The person must own the record, and the switch must be on when the card is drawn and again when it is pressed | enforced in the record |
| Only a choice of options or a set of rows can be pressed. A pack, settings, an arrangement, a pattern or a change installs, and is answered in BrainDog | enforced in the record |
| The press runs the record's own `decide` as the person, with `pressedIn` set. `admin` and `vault` refuse `pressedIn`, so a press never installs, changes what runs unattended or opens a key | enforced in the record |
| An option that is hard to undo is pressed twice on the card, as in Decide | UI |
| Each decision keeps where it was pressed: a `note` on the decision, `field` `answered_in`, the app in `to_v`, and "Answered in Claude, on the card." in History | audit |

**What is trusted.** The chat app is trusted to keep `_meta` from the model and to draw the card only from the tool's
answer, which is what both apps specify. A person who connects an app at another address gets cards that link to
BrainDog. If an app were found to show `_meta` to its model, the remedy is to take its address off the list in
`packages/record/src/methods/chat-answer.ts` (`appOf`).

### 5.2 · An answer on the person's word

The owner decided on 27 October 2026 that an agent he tells to may close out a decision ([ADR-060](16-DECISIONS.md),
amended). An agent passes his words, quoted, as `said`: `instructions {answer, option, said}` answers a waiting
question, and `create` or `update` with `said` writes a change the ladder would have asked about
([44-SPEC-MCP](44-SPEC-MCP.md) §15.14). Unlike a press on the card, nothing proves the words are his: the agent says
they are. So the controls are about who may, what may never, and what is kept.

| Control | Kind |
|---|---|
| **Agents answer when you say so** (Settings › Agents, `agents.answer_on_word`) is on until the owner turns it off, and only an owner in a browser sets it. Off, every such call is refused, naming the switch | enforced in the record |
| Only a key whose person owns the record, and whose scope and settings row let it write. A run that read text from outside the record or somebody else's words (the ladder's `untrusted`: a row, an edit or a question by a door, a feed, a script, another person or another person's agent, `ownHand`) asks for the rest of it, his word or not, because that text could carry words he never said | enforced in the record |
| What a session is handed by `context` is only what its own person, the owner or the record wrote (`handedOwn`): somebody else's step, question, task or rule is left out and the briefing says there is something to read, and reading it marks the run. A rule of a colleague's agent is not read as a rule | enforced in the record |
| `said` must hold words. An empty one is refused at `said` | enforced in the record |
| A question the agent's own key asked is never answered by it, on any word: the person answers it in BrainDog, or the agent makes the change with `said` (which takes its question back) or withdraws it. Otherwise an agent could ask and then answer itself (audit 10k, AK2) | enforced in the record |
| A question somebody else opened (another person, a mail or feed, a project key, another person's agent) is answered in BrainDog only. However the question is signed (a person, a key, or the run a key opened), it is read back to the person behind it, and only the owner's own keys and the record's own automations pass | enforced in the record |
| No word reaches a key (a list of keys, or an automation that calls out with one) or an amount of money set on what is already there | enforced in the record |
| **The record cannot tell his words from words an agent made up, so no word lets anybody in or takes the record out** (5 November 2026, `NOT_ON_A_WORD`): a new key, a report key or an ingest address, letting a device in, an invitation or a share, removing somebody, an export, an import or a restore, a declaration, an add-on's install, arrangement or settings, and any question that would send things outside BrainDog. Measured before: a run that read nothing from outside, sending `said: "yes"`, minted a key and read its bearer. These take a press in BrainDog, or his own `agents.bypass`. A word stays enough for what stays in the record and Undo takes back | enforced in the record |
| The answer runs the record's own `decide` as the owner with `onWord` set. `admin` and `vault` refuse `onWord`, so erasing, deleting the record, the keychain, tokens, sharing and billing stay a browser session's. `decide` lets `onWord` alone accept what installs | enforced in the record |
| No agent widens what agents may do, on his word, while they act without asking, by a file or by going back: his two switches, Answer in chat turned on, a settings row and a yes to the offer of a rung stay his; a key his settings hold to part of the record makes no new key; a replacing import is held to the settings rows and members the record holds; a restore stops at his last change to any of it (`agentBehind`) | enforced in the record |
| A token still never calls `decide` itself | architectural |
| Each answer keeps his words and the run: the decision's reason, and a `note` on it, `field` `answered_on_word`, "Answered by S12 on Teodor's word: ..." in History and Activity. A write keeps them in its note | audit |
| Undo in BrainDog takes the answer back as any of his | recovery |

### 5.3 · Letting the owner's own agents act without asking

Settings › Agents has one switch for the owner, **Let your agents do everything without asking** (`agents.bypass`,
`bypassOf` in `packages/record`). Off, agents ask before deletes, money, keys, add-ons and settings, and after reading
anything somebody else wrote. On, the owner's own agents act without asking, money and outside reads included; each change
still names its agent and can be undone.

| Control | Kind |
|---|---|
| Only an owner, signed in to the app, sets it. `braindog bypass on` only opens the page; an agent cannot turn it on for itself | enforced in the record |
| It covers only the owner's own whole-record write tokens. A colleague's agents are never covered, and a colleague who Can decide cannot set it | enforced in the record |
| `NEVER_BYPASS` (`packages/record/src/index.ts`) holds, switch on or off: giving the ownership away (`handOver`), deleting the whole BrainDog (`deleteRecord`) and erasing a person (`erase`). Everything else his switch opens, since his word of 2 November, and it is the only thing that opens `NOT_ON_A_WORD` to an agent (5.2) | enforced in the record |
| Still a browser session's, as in 5.2: the Keychain and paying | enforced in the record |
| The switch's own lines (`apps/web/src/lib/agents/bypass.ts`) and the agent's May line (`BYPASS_SAYS`) say the same list | copy |

---

## 6 · The credential Keychain

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

**The Keychain cannot hold its own key.** The KEK, the owner's passkey and a self-host's `BRAINDOG_TOKEN` live
outside it by necessity: reading the Keychain needs them, so the safe cannot hold what opens it. The predecessor's
migration of 2026-09-02 moved exactly three things *out* of its secrets folder for this reason — the token that
opens the Keychain and two SSH keys, into `~/.ssh` with a config — and seventy-two values *in*, each verified
byte-identical while the original still existed, which was the last moment that proof was possible.

Secrets Store's **100-secret, 1 KB-per-secret** ceiling is precisely why the root key is one key
and per-record keys are wrapped and stored in the record. A design that put a key per customer in
Secrets Store would have hit a wall at customer 101.

The AAD binding matters: a ciphertext moved to another record or another grant id fails to
decrypt. Copying a blob between records yields nothing. **The bytes, once, here:**
`aad = utf8(record_id) ‖ 0x1F ‖ utf8(grant_id) ‖ 0x1F ‖ utf8(String(version))` — wherever this corpus
writes `‖` it means that byte. The wrapped DEK is bound the same way, to `utf8(record_id) ‖ 0x1F ‖
utf8(purpose)`; the grant key is HKDF-SHA-256 over the DEK with the grant id as `info`; nonces are 12
bytes; and everything crosses a wire as base64url. One rule for Keychain and connector grants alike,
byte-exact in [47-SPEC-CONNECT](47-SPEC-CONNECT.md) §4.6. **Sign-up generates all three keys** — the
record DEK, the connector DEK (§7) and the signing key ([03-DOG-FORMAT](03-DOG-FORMAT.md) §4).

**Where the wrapped keys live: `vault_key`**, one row per purpose — `record` (this DEK), `connector`
(the second DEK of §7) and `signing` (the record's Ed25519 export key,
[03-DOG-FORMAT](03-DOG-FORMAT.md) §4) — each with `wrapped`, `nonce`, `wrapped_by` (`kek` |
`passphrase`), `kek_id`, `salt` and `rewrapped_at`; exactly one wrapping per key
([30-BLUEPRINT](30-BLUEPRINT.md) §1). It travels in an export, sealed — a wrapped key is nothing without the
KEK, and a record restored from its own backup must be able to open its own Keychain (§8).

**Rotation is two slots.** The root key has a current slot and a previous one, both in the one `KEK` secret, the new key,
a space and the old one (`keyStoreOf` in `apps/worker/src/keys.ts`; no `KEK_PREV` is read by anything);
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

A record may set a **keychain password**, distinct from login.

> **An earlier draft said the DEK is then wrapped by `HKDF(passphrase)` "as well" — which does not
> provide the guarantee two tables in this document then claimed.** If the DEK is wrapped by the KEK
> *and* by the passphrase, **either wrapping opens it**, so the operator's KEK still decrypts the
> Keychain. The honesty table below would have been false.

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

| Keychain password | We can read your credentials | You can lose them |
|---|---|---|
| off (default) | yes, technically | no |
| **on** | **no** | **yes, permanently** |

Default off, because a founder locking themselves out of their own hosting credentials is a more
likely disaster than us reading them. Offered prominently, with the consequence in the same
sentence as the switch.

*(Built September 26th 2026.)* Two VAULT methods,
`setVaultPassphrase({ passphrase })` and `clearVaultPassphrase({ passphrase })`, held to rule 2's gate: an
owner in a browser, proved in the last fifteen minutes, and every token refused. Each host answers them
through `withVaultPassphrase` (`packages/host/src/passphrase.ts`), which takes the passphrase off the
arguments before the record is called and hands the record's method a step instead, so the record is
handed wrapped bytes and a salt and never the passphrase or a key. The details:

- **Only the record DEK moves** (`vault_key` purpose `record`). The connector DEK and the signing key
  stay on the KEK, so connector pulls and the signed nightly copy run as before. What stops is anything
  that opens a key a person deposited with nobody present: a scheduled call or a signed digest post that
  names such a key, and every agent's keychain access, which is told the Keychain is behind a passphrase.
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
label        "Cloudflare — main account"
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

1. **Every read is an event.** `grant.read` with the actor. A Keychain whose reads are not audited
   cannot answer "did anything get out".
2. **Reveal is deliberate**: a click, a re-auth if the session's last proof is older than the Keychain's
   lock window (15 minutes until the owner chooses 5 or 60, §6.3), a 30-second auto-hide, and clipboard
   cleared after 60 seconds.
3. **No agent tool returns a secret.** Not scoped — absent. Agents see `label`, `opens`,
   `expires_at` and `rotate_every`, which is what they need to *tell you to rotate it*.
4. **Rotation is scheduled.** `rotate_every` puts a row in `schedule`. The record cannot rotate
   anything itself — it has no outbound calls — so it reminds you, with a link to the dashboard
   that can.
5. **Secrets never enter a log, a telemetry blob, a push payload or a model prompt.** Asserted by
   a test that greps every write path. And a floor under every console line on both hosts (`log-floor.ts`), because
   the line that once carried a key's bytes to the logs named no key: it was a runtime's sentence quoting a pattern.
6. **Ciphertext stays ciphertext in exports.** `grant` rows travel sealed by default; `--redact-grants`
   drops them — [03-DOG-FORMAT](03-DOG-FORMAT.md) §5 and §8 below.
7. **The Keychain is its own RPC group.** `listGrants` · `openGrant` · `bindGrant` · `revokeGrant` are the
   KEYCHAIN group of [30-BLUEPRINT](30-BLUEPRINT.md) §5 — a browser session only; every token, whatever its
   scope, gets `403 NEEDS_BROWSER_SESSION`, and so does an operation grant — KEYCHAIN has no reach
   ([ADR-060](16-DECISIONS.md)).
8. **A connector grant is a JSON object of string fields**, its secret keys the closed set per
   `auth.kind` in [47-SPEC-CONNECT](47-SPEC-CONNECT.md) §4.5, and a declared `require_scopes` is
   **proven at bind**, never assumed. When a provider rotates a refresh token mid-run, connect re-seals
   it (version + 1) and the record stores it from the ack with one `grant.rotate` event — the previous
   version kept as `prev_ciphertext`.
9. **An agent's keys go through two doors, under keychain access, except that a login token may add a new key.** `POST /api/vault/deposit`
   and `POST /api/vault/open` take as their bearer a device grant of reach `vault`, approved by a person for
   one project or for `*`, the keys of no project; 30 days for a project and 7 for `*`. The bearer is checked
   with `vaultGrant`, which never accepts a login token, and a key whose row's project is not the grant's
   scope is `403 FORBIDDEN`. A page is refused, whatever its origin. The host seals a deposit and opens a
   read with its `KeyStore`, as in rule 7's group; the record names the grant id, version and AAD and binds
   only sealed bytes, and the credentials row keeps its label, what it opens and its project. A read is
   rule 1's `grant.read`, signed by the run the caller names (`S12`) when one is live, and the value
   leaves in that one answer with `no-store`. On the command line, `braindog keys put` reads the value
   from stdin, never an argument, and `braindog keys exec` puts a key read back into the environment of the
   one command it runs, and never prints it, and a BrainDog bearer in the shell's own environment is kept from that command. It never puts one in a variable that changes how that command runs,
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
   where keychain access reaches only its own project's. A read is the same counted `grant.read`, signed by the
   person, and the value leaves in the same one answer with `no-store`. The Keys screen is the only caller:
   it puts a key in, replaces one row's value, and reveals one for thirty seconds, clearing the clipboard after
   sixty. `/api/vault/deposit` and `/api/vault/open` are unchanged and still refuse a page, whatever its origin.)*
   *(Amended September 25th 2026: an agent may ADD a key with its login token, and only
   add one. `POST /api/vault/deposit` also takes `Authorization: Bearer <rec>.<token>`, a live token of scope `write`
   on the keys list, checked as every `/api` bearer is, and only when the bearer is not keychain access. Its body is
   `{ label, opens, kind?, value }`; a `project` or a `credential` in it is `VALUE_MALFORMED`, because the key goes to
   the project the token's run is in, as the session ladder resolves it, or to no project when the run is in none. A
   label already within that reach is `403 FORBIDDEN`, whose sentence names the two ways a value is replaced: a Keychain
   grant for its project (`braindog login <host> --keychain <project>`) or the owner on the Keys screen. So a login token that leaks can add a
   key and never swap one, and rotation keeps needing keychain access or the owner. The host sets the record's
   `agentDeposit` flag on this path alone, never from a body; the answer is the one a grant's deposit gets, with
   `no-store`, the events are `grant.add` and `create`, signed by the run, and the row's origin reads
   `<agent> on <machine>, S<n>`. `POST /api/vault/open` still takes keychain access and nothing else. `braindog keys put`
   sends the keychain access when one is held and the login otherwise, and `braindog tools scan` deposits through it.)*
   *(Added September 15th 2026. `tools/gates/secret-grep.mjs` holds
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

The predecessor's Keychain landed on 2026-09-01 after an owner decision (SG24 → D39,
*encrypted-in-brain*) and answered every argument the original *"never a value"* rule had made — in
code rather than by dropping them. Five of its mechanisms were missing here.

**RFC 8628, the flow a television uses.** The device that wants in shows a six-digit code; the owner
approves it from a session that is already authenticated as him. It is the right shape because *the
thing asking is not the thing holding the identity* — a CLI on a VPS, an agent, a browser that has
never opened the Keychain all ask the same way.

> **The code is not the security.** Six digits is a million, with a ten-minute life
> (`DEVICE_CODE_EXPIRED` after it) and five attempts (`DEVICE_CODE_TRIES`). What the code proves is that the approver is **looking at the device that asked.**
> Guessing it does not get you in; it gets you a chance at being approved by somebody deciding whether
> they recognise the request.

| Rule | Why |
|---|---|
| **Typing the code lets nothing in.** Six digits answer what is asking (`deviceLook`): the machine and client it says it is, what it could do, and for a keychain request which keys. Only Approve on that sheet lets it in (`deviceApprove`, with the handle the look answered) | a phisher who starts a grant and talks an owner into typing six digits got a keychain or a ninety-day key from that alone (RFC 8628 §5.4) |
| The device polls with a **long random id, never the code** | conflating them makes polling a million-guess oracle |
| The code is stored **hashed, never in clear** — `code_hash = sha256(id ‖ ':' ‖ user_code)`, the long random poll id as its salt; the record has no `SESSION_SECRET` and depends on no host secret to check it ([45-SPEC-RECORD](45-SPEC-RECORD.md) §5.11) | a pending row is readable by anything that reads the database. *An earlier draft hashed it under the session secret* |
| **One row, two lives**: pending → approved → active | two tables would mean delete-and-reinsert at approval, and a crash between them loses the approval he just gave |
| Approval is **the owner's, from a sign-in proved in the last 15 minutes**. A bearer gets `403 NEEDS_BROWSER_SESSION` (it is authenticated, so it is forbidden, and the `401` rule in §8 stays true), and an older sign-in is asked to sign in again. The self-host's server key is proved on the request that presents it | an agent may not approve its own request, and an approval hands out a 90-day bearer that works from anywhere, so it asks what `openGrant` asks |
| **Starts are counted per address**: ten in 15 minutes, then `429` with `Retry-After` for 15 minutes, in the `auth_fail` table sign-in already counts in. A count that cannot be read refuses | a start costs nothing to send, and a list of codes nobody asked for hides the one somebody did |
| **The address to approve at is the host's own**: `verification_uri` is always on `<origin>`: `<origin>/<slug>/connect/approve` on the Cloud when the start named a slug, `<origin>/connect/approve` otherwise and on the self-host (at the root since 29 Oct, and under `/app` from push A of the one-domain move, September 23rd 2026, until then, and on its own page rather than `/settings/agents` since October 2026, which still takes a code). A start that reached the host by another name, or that a page on another origin sent, is `403`, and the CLI refuses a `verification_uri` on another origin before it prints a digit | six digits typed into a page somebody else runs are an approval they can spend |
| **Neither route logs a code, a poll id or a bearer** | more people read a log than read the record |
| A wrong code bumps `tries` on *every* pending row; five → `denied` (`DEVICE_CODE_TRIES`). A malformed entry spends no try | a guesser cannot spread guesses across waiting requests to stay under the count, and a typo should not spend somebody else's enrolment |
| **The poll id is never shown.** A listing, an event and a revoke name a row by a handle, the first 16 hex of `sha256('device:' ‖ id)` | between approval and exchange, whoever holds the id can take the bearer |
| **A denied row is kept** | *"I said no to a request I did not make"* is the single most important line this table can produce |
| The grant is **revocable on its own**, without ending the session | it is a separate long-lived token, 90 days, stored as `token_hash`, because revocation is real. `expires` holds the code's ten minutes while pending and is rewritten when the poll exchanges an approved row (approved → active), once: a second poll is refused. A `login` exchange mints an ordinary `token` row through `createToken` (scope `write`, 90 days, the device's label, owned by the approver), so there is one bearer format and one verifier, and revoking the grant revokes that token. A device silent for 14 days, counted through its token for a login, is moved to `expired` by the hourly sweep and its token revoked |
| **And it is the tier-C runner's enrolment flow too** — [26-BYO-INTELLIGENCE](26-BYO-INTELLIGENCE.md) §2.3 had a bespoke one; there is now one — **and the operation grant's** (§3), **and the Keychain grant's**. The row's `reach` says which: `login` · `runner` · `export` · `import` · `pack` · `token` · `vault` — seven values since kernel migration 4. A `runner` exchange returns the 90-day bearer; an operation reach returns a bearer that keeps the code's ten minutes and is spent on one call; a `vault` reach carries `scope`, a project row id or `*`, and returns a bearer that opens that scope's keys for 30 days, or 7 for `*`, checked by `vaultGrant` and never by `verifyToken` | one flow to secure, and it is a standard |

**The `runner` reach, in use** *(added September 28th 2026)*. `braindog runner
enrol <host>` asks with `reach: 'runner'`, and the 90-day bearer it gets back is kept in the hosts file beside the
login, never in its place ([48-SPEC-CLI](48-SPEC-CLI.md) §5.13). That bearer reaches three doors and nothing else:
`claimJob`, `postJobEvent` and `readCancel` (`packages/record/src/jobs.ts`). The host builds the runner's principal from
the record's own device grant (`runnerContext` in `packages/host/src/jobs.ts`), never from anything the caller sent,
and every other guard in the record refuses a principal of that kind. Starting and cancelling a job are an owner's in
a browser, as ADMIN is, so no agent token starts one. Each claim mints the job its own bearer: an ordinary token of
scope `propose`, labelled `job:<id>`, for one day, the run's deadline, and revoked when the job ends. The runner hands
it to Claude Code only inside a `0600` `mcp.json` that reaches the record's `/mcp` on the enrolled host's origin, and
removes the file when the job ends. A kind that says `agent: codex` hands it to Codex in one variable of the child's
environment, `BRAINDOG_JOB_BEARER`, which the run's config names (`bearer_token_env_var`), never in an argument, and
replaces Codex's own servers for that run with the record's door alone. Codex's login (`auth.json`) is never read: Codex
uses it itself. A runner silent for 14 days is moved to `expired` by the hourly sweep, as a login
is. What a job may do on the machine is a `job.<id>` declaration the owner approved in Decide, and each machine pins
a kind by its SHA-256 before its first run, so a host that forged one could not run it on a machine that never allowed it.

*(Since kernel migration 44.)* A job may name the machine it runs on and the Claude Code profile it runs under, by
name. A claim says the runner's machine and its profiles by name and never by folder, and the record hands it only a
job placed nowhere or placed there. The runner alone turns a profile's name into a folder, from this machine's own
profiles, and refuses a job under a name no folder or two folders answer to, saying the name and never a folder, since
the wrong folder is another login. The profile changes whose subscription and settings the run uses, not what
it may do: the kind's tools, permission mode and pin hold under every profile, and `--strict-mcp-config` keeps the
profile's own MCP servers out of the run. A profile's name and a machine's name on a run are read only where runs are
already read; the Profiles add-on's lists stay personal.

Four more rows on the Keychain itself, each answering a specific way the earlier design would have
failed:

| Mechanism | Why |
|---|---|
| **`opened` and `last_opened` on the row, and the screen draws them** | one secret per request, no bulk read anywhere. *"A script that walked all thirty leaves thirty audit rows and thirty visible counters. The XSS is not prevented — it is made slow and loud, which is the honest claim."* |
| **`kek_id`** — a 72-bit fingerprint of the wrapping key | rotating the root key otherwise turns every row into a WebCrypto `OperationError`, *"which reads exactly like corruption on the one screen where 'the data is gone' and 'the key changed' need different answers."* A mismatch is `409 WRONG_KEY` |
| **Reveal is `openGrant`, an RPC in the KEYCHAIN group — never a readable address** | no URL, no history, no `Referer`. It returns sealed material and the host decrypts — the record never sees plaintext (§6, [ADR-062](16-DECISIONS.md)) |
| **`bytes` and `hint`** | *"a 3.2 KB env file"* against *"a 64-character token"* without opening anything — most of what the owner needs at a glance. Exactly two versions are kept — `ciphertext`/`nonce` and `prev_ciphertext`/`prev_nonce` — and the schema says so; there is no version table to prune |

**What is not defended, stated plainly:** a compromised host — on Cloud, the Worker — which can read the root key. The
alternative — end-to-end encryption — would mean no agent could ever read a secret and losing a
passkey loses the Keychain. The predecessor's owner chose the other trade knowingly, and the honesty table
in §7 says so.

### 6.2 · Where a key may go, and who may open it

*Added September 22nd 2026, for Slash's three tiers and for scripts, and revised the same day,
checked against `packages/host/src/actions.ts`, `packages/host/src/script.ts`, `packages/host/src/script-try.ts`,
`packages/host/src/slash.ts`, `packages/kernel/src/script.ts` and both apps' `keyOpener` at `d23ac77d`.*

A key the Keychain holds leaves the host in one form only: an `authorization: Bearer` header on one request the host
makes, opened for that request after every check on it has passed, and dropped when the answer is back. Four paths
open one:

| Path | Opened by, and the `grant.read` signed as | Sent to | Checked first |
|---|---|---|---|
| a scheduled `call`, `poll` or `pull` ([25-CONNECTORS](25-CONNECTORS.md) §9) | the host's `keyOpener`, as `system`: nobody asked | the origin its declaration names | `sendAction`: `https:`, an origin an active declaration names, a host written as a literal private or local address refused, and on the self-host `pin` resolving the name and refusing a private address before the socket opens |
| a script's `ctx.fetch` | the same opener, as `system` | an origin in the script's `egress:`, and only the host the key's Keychain entry says it opens | in the sandbox, the origin, `https:`, no user name or password in the URL, the fetch count and a declared label; then `keyRefused`, the URL's host against the grant's `opens`; then `sendAction`'s checks again, over the script's own origins |
| a trial of a draft script (`script_try`, [25-CONNECTORS](25-CONNECTORS.md) §12) | the same opener, as `system`, and only when the caller is the owner signed in as a person | as a script's | as a script's. For any other caller, a token included, the record hands the host no Keychain, and a fetch naming a key is refused unsent |
| Slash ([46-SPEC-SLASH](46-SPEC-SLASH.md) §5.9) | the app's `keyOpener`, as the person who asked | `SLASH_ENDPOINT` | the Keychain's gate on the asker's own session: an owner, never a token, a proof under fifteen minutes old; for tier `b`, a live `api_token` grant that is not the one labelled `slash` |

1. **Neither the sandbox nor the model ever holds a key.** A script names a label and the host resolves it, by
   label or id, never a revoked grant, the newest first; Slash's package is handed an adapter whose key is asked
   for on the call.
2. **Every opening is rule 1's `grant.read`, and it names who caused it.** Before September 22nd every Slash opening
   was signed `system`, because both hosts' opener defaulted to it, so an owner reading the log could not tell her
   own asks from anybody else's. Slash's openings now carry the asker; `system` is what a run with nobody at the
   keyboard gets. A trial of a draft script is the one exception left: the owner asked for it, and its opening is
   still signed `system`, because both hosts hand it the scheduled runs' opener, which takes no actor.
3. **A key other people's asks would open goes through the Keychain's own gate.** Where Slash's included model is
   keyed from the Keychain (no operator key, and a live grant labelled `slash`, which on the Cloud is the only way it
   is keyed), a colleague is refused before any model is called, on a read as well as a propose. Measured before the
   gate: a colleague at `read` with a proof fifty minutes old read and proposed with 200, on three model calls on the
   owner's key.
4. **A script's key goes only to the host its Keychain entry opens** (`keyRefused`, the same function on both hosts).
   The grant's `opens` is read as a host name when it parses as one (`api.gold.test`, `api.gold.test:8443` and
   `https://api.gold.test/v1` all name `api.gold.test`) and compared with the fetched URL's host exactly, with no
   subdomain let in: `opens: stripe.com` does not open `api.stripe.com`. An `opens` that names no host, such as "the
   shop's test account", sends the key nowhere. A fetch that breaks this is `FORBIDDEN` and refuses the whole run,
   however the script handles it, as an undeclared key does. Measured before it
   on the self-host runner: `goldapi`, whose row opens `api.gold.test`, was sent as a bearer to `collector.test`,
   because that origin was also in the script's `egress:` (`apps/selfhost/test/script-key-egress.test.ts`).
5. **No script may name the Keychain's `slash` key**, whatever it opens, because on a host with no `SLASH_KEY` it is
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
   to the script, and from there to a row or the run's log.
7. **Redirects stay on the approved origin**, three at most, each hop checked again.

**What is not built.**

- **The install line does not say which host each key goes to.** A script names its origins and its keys as two
  lists, and `scriptEgress` (`packages/kernel/src/actions.ts`) joins them into one line (`CALLS OUT api.gold.test
  and collector.test · every 1h · key "goldapi"`). It cannot pair them, because the kernel's egress line does not
  see the Keychain. The pairing is enforced at the fetch (rule 4), so a key cannot reach the wrong host, but the owner
  approving the line is not told where it will go.
- **A key whose `opens` is not one of the script's `egress:` hosts is not refused at install.** Such a script
  installs, and every fetch with that key is then refused at run time, three refused runs pausing it. Nothing at
  install or in Decide compares the two, for the same reason: the check that sees the declaration does not see the
  Keychain.
- **A scheduled `call`, `poll` or `pull`, and a connector that pages, hold a key to the host its entry names, and to nothing
  while the entry names none.** `sendAction` and the kernel's connector lease each refuse another host before the key is
  opened. An entry in words ("the shop's test account") is held to nothing until a press approves a line that sends it
  somewhere, and that press pins it (`pinHost`), through Decide's `change` and `pattern` and through an install alike.
- **The scrub catches the spellings above and no others.** A key re-encoded another way (hex, `\u` escapes of
  ordinary characters, a hash of it) is not caught, and neither is a derived spelling shorter than eight characters,
  which only a key of five bytes or fewer has; the bytes as sent are always scrubbed, however short.
- **Slash's tier `b` key is sent to `SLASH_ENDPOINT`**, the endpoint the host's operator configured, whatever
  provider issued the key, and its `opens` is not read on that path. Choosing a host is trusting its operator with
  that address, and nothing in the tree checks it.

### 6.3 · Keychain access: which machine may open which key, and the lock

*Added October 26th 2026 ([ADR-077](16-DECISIONS.md)), checked against `packages/kernel/src/keychain.ts`,
`packages/record/src/methods/keychain-access.ts`, `packages/record/src/identity.ts` and `apps/cli/src/keys.ts`.*

A Mac keychain asks before an app opens an item, and locks itself after a while. The Keychain does both.

**Per-key access.** Each key may say, for one machine or for every machine (`*`), one of three rules: `always`,
`ask` or `deny`. A machine is a keychain grant's handle, the one Settings lists. The machine's own rule wins over the
key's `*` rule. **No rule is `always`**, which is how every key opened before October 26th, so a key nobody set a rule
on, and every installed CLI and agent reading one, behaves exactly as before.

| Rule | An agent's keychain grant opening the key (`openForGrant`) |
|---|---|
| `always`, or no rule | opens, as it always did |
| `ask` | files one ask and tells the owner once (a time-sensitive notice naming the key by its spoken id and the machine by its name, never the key's label), then answers `403 KEY_ASKED` to that try and to every try while the ask waits. He answers **once** (the machine's next open goes through and spends it), **always** (the machine's rule for that key becomes `always`) or **deny** (the next open is `403 FORBIDDEN`, and the one after asks again). An ask runs out after ten minutes |
| `deny` | `403 FORBIDDEN` at `credential`, and nothing is asked |

- **Who sets it.** `keyAccess`, `setKeyAccess`, `keyAsks` and `answerKeyAsk` are KEYCHAIN: the owner in a browser,
  inside the lock window. No token reaches them, so an agent cannot set its own access or answer its own ask.
- **Who is never asked.** The owner in a browser, who is the one answering. A scheduled `call`, `poll` or `pull`, a
  script's fetch and a leased runner, which open through the host's `keyOpener` and `sealedGrant` with nobody at the
  keyboard to wait for: they keep the behaviour they had.
- **The CLI waits.** `braindog keys exec`, `headers` and `helper` print one line, "Waiting for you to allow
  <key> in BrainDog…", on a `KEY_ASKED`, and ask the same `/api/vault/open` door every three seconds for up to two
  minutes. Nothing new is sent, so every installed host answers it.
- **What is kept.** Migration 46's `key_access` and `key_ask`: credential row ids, machine handles, run ids, rules and
  times. Never a value, a label or what a key opens. Both `local`, so a copy of the record carries neither.

**The lock.** The Keychain's gate asks for a sign-in proved within the record's `lock_after`, five, fifteen or sixty
minutes (`setLockAfter`, KEYCHAIN); fifteen until the owner chooses, which was the fixed window before. **Lock now**
is `POST /auth/keychain/lock`, a sign-in route because what it changes is the session the Directory keeps: it moves
that session's last proof back past the longest window, so the next Keychain act in that browser asks for a sign-in,
and signing in again is the unlock. The session stays signed in for everything else; every other act that asks for a
recent sign-in (`FRESH`, §6.1) asks again too, as it would of a laptop left open for an hour.

**What is not built.** The screen's idle timer, which hides shown values and draws Locked after `lock_after` without a
request, is the web app's. A key's account (`account`, agents 1.23.0) is a plain text field and never secret.

---

## 7 · What we can see, said plainly

For a product whose pitch is "your data", the operator's own access must be documented, not
implied.

| | Cloud | Self-host |
|---|---|---|
| Your rows | **we can read them** — the object runs on our account | no |
| Your credentials, keychain password **off** | **we could decrypt them** | no |
| Your credentials, keychain password **on** | no | no |
| Your sealed files (Setup sync) | no: your machines seal them under a key we never hold, and the host keeps bytes it cannot open (§8) | no |
| Your prompts | payload retention off at the gateway — prompts and responses are not stored. Token counts and cost are, in Slash's `call` table ([46-SPEC-SLASH](46-SPEC-SLASH.md) §4.1), which holds no prompt text, because the budget needs them | no provider at all |
| Telemetry | off until the operator binds it; then one point per request: the door, the kind of client, the method, the refusal code or status class and the milliseconds, with the record id hashed under a key that changes every month, kept three months ([51-SPEC-WORKER](51-SPEC-WORKER.md) §5.18) | none |
| Our logs | one JSON line per event, carrying a code, an id and a shape, never a value, an address or a prompt: which door refused, which job failed, which letter did not go ([53-SPEC-OPERATIONS](53-SPEC-OPERATIONS.md) §2.3) | the container's own output, on your machine |
| Your account | your address, passkeys and sessions, in the Directory and in its nightly copies; closing the account removes them at once from the Directory and from the copies within 30 days | on your machine |
| Your card | Stripe holds it; we hold Stripe's customer and subscription ids and whether the record is paid | nothing to bill |

Operationally: access to a customer's record requires a named reason recorded in our own audit (a note
in the operator's own record, written before the read), follows the diagnosis order of
[53-SPEC-OPERATIONS](53-SPEC-OPERATIONS.md) §5.15 (the version tuple, the crash's reference, the refusal
state, the record's log lines, which hold no values, and only then, with the owner, its events and the
`system` suggestions), and support never asks for a keychain password. **The strongest available answer to "can you read
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
| Your Keychain credentials | we can read them | **we cannot** |
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
| The CLI's releases | signed at release with an ed25519 key that is only in the login keychain of the Mac that releases, never in the record's Keychain or on Cloudflare, so somebody who holds Cloudflare can serve a build and cannot sign one. The signature covers the sum, the build and the release's time; `braindog update` refuses an unsigned build, another key's, and one older than it is running unless asked with `--older`. Install scripts come from the site, so **the keys published in `apps/cli/README.md`, in the repository, are the check against somebody rewriting the site**; a person installing compares `PIN` with them. A lost key is in that README. With the owner's switch "Keep BrainDog's command line, hooks and skill up to date by itself" on (off until he turns it on, in a browser; no agent turns it on), a session's start runs that same update, held to the same checks, and never an older build (`apps/cli/src/upkeep.ts`). |
| Content Security Policy | no `unsafe-inline` for scripts or stylesheets, no third-party origins. Packs cannot load a remote asset, so the policy has nothing to allow. One named exception: `style-src-attr 'unsafe-inline'` for the renderer's single `--magnitude` custom property on a bar — an attribute value nothing content-controlled can reach; `style-src-elem` is nonce-based ([22-FRONTEND](22-FRONTEND.md) §7) |
| Page headers | every page of the app and the site sends HSTS for its own host (no `includeSubDomains`, one year), `Cross-Origin-Opener-Policy: same-origin`, a `Permissions-Policy` that asks for no camera, microphone or place, `nosniff`, `X-Frame-Options: DENY` and a referrer policy; the app's and the site's policies say `form-action 'self'`. The self-host sends all but HSTS, which is whoever runs it to say (`PAGE_HARDENING` in `apps/worker/src/route.ts`, `apps/selfhost/src/shell.ts`, `apps/site/static/_headers`) |
| A share into the app | a POST to `/add` is answered by the service worker, and any web page can send one, so what it keeps is held to PNG, JPEG, GIF, WebP, AVIF and HEIC by the type the form says, never SVG, and `~shared/<i>` is answered `default-src 'none'; sandbox`, `nosniff`, `no-store`. Nothing is sent until the person adds a line (`apps/web/src/lib/phone/share.ts`) |
| What a browser keeps | every ending of a session takes the local copy, the worker's copy with Today's picture, the shared photos and every key of `signed-out.ts`: a press anywhere, closing the account, a 401, access ended, the sign-in screen finding no session, and another person signing in with no sign-out between (`forgetLeaving`, `forgetLapsed` and `claimLocal`). What stays is the device's own: its look, nav and notifications. A browser that never goes online again cannot be told, so a person who loses a device while offline-readable has up to a week of copy on it, and its first open paints Today before any network answers |
| Output encoding | one renderer, one escape function, escaping applied before any markup exists so nothing downstream can un-escape |
| Link safety A link that leaves says its real host beside its words unless its words already say it (`linkNodes`), so `[Renew now](https://evil.example)` or `[Open in BrainDog](...)` cannot read as ours. The renderer cannot tell who wrote a sentence, so this is every link, the person's own too. | `https:`, `mailto:`, anchors, same-origin paths only, and a page's `Referrer-Policy: same-origin` on both hosts sends nothing off the host. Everything else renders as its literal text. Words that read as an address other than the one the link goes to are drawn as the real address (`linkMisleads`); and a link never fires without a press |
| CSRF | `SameSite=Lax`, plus the `Origin` check (or, where a browser sends no `Origin`, `Sec-Fetch-Site: same-origin`) on every cookie-authenticated non-GET and every `/auth` POST, which must also be `application/json`. The app is served with `frame-ancestors 'none'`. A self-host with no server key answers only to its own names: any other `Host` is an empty 421, so a page that rebinds its name to 127.0.0.1 cannot reach it |
| Rate limiting | per caller at the Worker, before the record is asked: the token, the person, or the address where nobody has said, 600 reads and 120 writes a minute on `/api` and `/mcp` (`RL_READ`, `RL_WRITE`), a `429 RATE_LIMITED` with `Retry-After` past them; `/auth` limited by address before the Directory is asked, on top of its lockouts; per record at AI Gateway. A limiter that throws opens the door and writes a `limit` line, because each record still checks its caller |
| Dependency surface | **a stated goal of near-zero runtime dependencies**, and the few are enumerated in [ADR-046](16-DECISIONS.md): `valibot` in `declare`, and one YAML parser, `yaml`, on the CLI and self-host paths only ([ADR-063](16-DECISIONS.md)). The prior system's Worker had no `package.json` at all, which is why it ran unmodified on plain Node — a supply-chain posture and a portability win from one decision |
| Secrets in CI | one Cloudflare API token, scoped to deploy Workers, held in the GitHub environment `production`, so only `deploy.yml`'s job reads it, and that job waits for a required reviewer's press; `ci` dry-runs both deploys with no token in its environment; no token in the repo, ever (`DEPLOYMENT.md`) |
| Logs | one JSON line per event through `op()` (`apps/worker/src/oplog.ts`): a code, an id and a shape, never a value, a prompt or a payload; anything shaped like an address is replaced and a string field cut at 300 characters before the line is written, so a caller who slips cannot publish a person's words. A 500 carries only a reference to its line |
| Migrations | forward-only, checksummed, `--dry-run` first, `transferred_classes` never `deleted_classes`. A deploy carrying a kernel migration is never rolled back and never percentage-rolled; the canary is the ops record and recovery is fix-forward ([53-SPEC-OPERATIONS](53-SPEC-OPERATIONS.md) §5.3) |
| Backups | nightly `.brainl.age` to R2 under the record's own prefix, the 30 newest kept, ≤ 40 MiB per record, and the Directory's own copy under `directory/snapshots/`, taken first; a kept copy is restored in place through the PITR bookmark it recorded, inside 30 days, with the record as it stood kept as a `before-restore` copy first. The age identity lives outside Cloudflare, in two copies in the operator's password manager; the Worker holds only `AGE_RECIPIENT`, so nothing on Cloudflare can open a copy. A self-host copy is signed, with a detached `.brain.sig` `braindog verify` checks. Drilled: restore monthly with `apps/cli/scripts/restore-drill.mjs`, its date read at the morning check; KEK rotation quarterly for real; erasure quarterly on the ops record; self-host upgrade every release; parity every deploy ([53-SPEC-OPERATIONS](53-SPEC-OPERATIONS.md) §5.1, §5.4, §9) |


### A person's script: the sandbox and its ceilings

*Added September 22nd 2026, and revised the same day, checked against
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
  Before that the Cloud cached one Worker per script version, and a second run was measured
  reading what the first had left there (`apps/worker/test/script-isolation.test.ts`).
- **What a script logged is shown only to whoever may read what it touched.** A run's `ctx.log` is kept on its
  event with the lists its version read and wrote, and `recentHistory` and `whatsNew` hand the log only to an owner
  in a browser who reads every one of those lists (`logOf`, `packages/record/src/index.ts`); everybody else sees the
  run, its outcome and its counts, and `--redacted--` for the log. A token, the owner's included, never reads it.
  Before that a member refused `list money` read a salary from a run's log line.
- **A refused or failed run's note carries none of the script's words.** The note is on a line every whole-record
  reader sees, so it says only that the run did not finish and that its log says why; the reason, which can quote a
  thrown message or a list name the script made up, goes first in the guarded log (`finishScript`,
  `packages/record/test/script-refusal-note.test.ts`).
- **A trial writes nothing and opens a key only for the owner.** `script_try` runs a draft in the same sandbox, with
  the caller's own reads instead of `system`'s, since nobody approved the draft's `reads:`, and with no Keychain for any
  caller but the owner signed in as a person (§6.2). It is metered as a run on the plan's allowance.

The findings of the scripts audit (the log, the key's host, the `slash` key,
the scrub, module state and `wall_ms`) are closed as above and in §6.2. **What is still open** is §6.2's *What is
not built*: the install line does not say which host each key goes to, and a key whose `opens` is not among the
script's origins is refused only when the script runs. The Cloud's memory ceiling is the platform's, and no deploy
smoke has yet run a busy loop against the production `cpuMs`.

### A drawn component: the frame and what crosses it

*Added October 22nd 2026, checked against `packages/render/src/drawn.ts`, `packages/kernel/src/kinds/drawn.ts`,
`packages/host/src/drawn-frame.ts` and `apps/web/src/lib/page/DrawnFrame.svelte`.* A `drawn` block is a small
component somebody wrote (a person, Slash, or an agent through `propose`), held as `code:` on the page's declaration.
The record never runs it. The app draws it in a frame, and the argument is the same as a script's: everything it can
reach is listed, and each limit is held outside it.

| Held | How |
|---|---|
| No origin of its own to use | `<iframe sandbox="allow-scripts">`, never `allow-same-origin`, `allow-popups`, `allow-forms` or `allow-top-navigation`. The frame's document sends `sandbox allow-scripts` in its own policy header too, so it has an opaque origin even if it is opened on its own in a tab: no cookie, no storage, no reach into the app |
| No network | the frame document's policy is `default-src 'none'`, with inline script and style, and `data:` pictures, fonts and media; `connect-src 'none'`, `form-action 'none'`, `base-uri 'none'`. The document written into it carries the same policy as a meta tag, so a host that served the frame without its header still holds it |
| Framed only by BrainDog | `frame-ancestors 'self'` and `X-Frame-Options: SAMEORIGIN` on the frame. The app's `frame-src` names `'self'` for it; every other page of the origin still sends `frame-ancestors 'none'`, so naming `'self'` frames nothing else |
| Nowhere to navigate to | a frame may be navigated to anything the page holding it may hold, and no policy of its own can stop that. So the app's `frame-src` names `'self'` and nothing else, bar Turnstile on sign-in and sign-up, which hold no frame of this kind: `location = 'https://evil…'`, a meta refresh and a `blob:` document are all refused by the page around it. A provider's player and an attached PDF stand inside the hosts' holding frame (`/drawn-frame/hold`), whose own `frame-src` names them, and which holds what its parent asks and no one else. Measured on 5 November with the providers and `blob:` in the page's list: a row left in an address to `www.google.com`, whose `/s2/favicons?domain=` fetches a name it is handed; a WKWebView's navigation delegate was asked about the same address, which on the desktop app opens the person's browser with no press; and a `blob:` document, which has no guard in it, sent the row to a TURN server. Same-origin navigation stays, and carries nothing off the origin |
| No peer connection | no engine enforces a policy on one: `connect-src` does not cover it, and `webrtc 'block'` is an unrecognised directive in Chromium. `DRAWN_GUARD`, written first into every document, takes the constructors away and removes any frame made after it before a task can run there, so a `srcdoc` frame's fresh constructors never run. It calls only what it took before the author's script ran, since replacing `Element.prototype.remove` or a getter on `MutationRecord.prototype` was measured to disarm it. A shadow root, where its watch cannot see, is refused |
| Not `srcdoc` | a `srcdoc` frame inherits the policy of the page around it, and the app's runs no inline script but its shell's own, so the component would never run; the fix is not to loosen the app's `script-src`. Both hosts answer `/drawn-frame` from code (`@braindog/host/drawn-frame`), before any path is read as a record's name |
| What goes in | one `draw` message, then new data and new themes, only from the page that holds it. The data is the block's rows as the record read them for this reader, through the same lens as every block, and only the fields its `columns:` name: the record cuts each row to them before it answers, and the app cuts them again (`drawnData`). The theme is the page's colour tokens, each value checked to be one that cannot end its declaration. Never a key, a token, a session or sharing |
| What comes out | two messages, counted only from the frame's own window: its height, clamped to 48 to 1,600 pixels, and a request to open a row, honoured only for a row the app handed it (`drawnAsk`). Anything else is dropped |
| Its code | at most 64 KB, and refused at install, in words, when it names an address off the page (a scheme and host, a protocol-relative `//`, a `url()` that is not inline data), imports a stylesheet or a module, holds a link, meta, frame, object or form tag, is a whole document, calls the network, uses storage, or reaches for the page around it. The frame's policy stops each of these anyway; the refusal is so its author hears it. An agent's component goes through `propose` and the same check, and nothing it proposes is drawn on a page until the owner keeps it |

The frame loads when it nears the screen, so a page holding one opens as fast as one without. **What is not built:**
a picture of the component drawn first, before it comes alive on touch; and the shelf
does not yet keep a drawn component's version and who made it beside it.

### A visual: a page a thing carries

*Added October 23rd 2026, checked against `packages/kernel/src/visual.ts`, `packages/record/src/methods/visuals.ts`,
`packages/render/src/visual.ts` and both hosts' `visuals.ts`.* A visual is a whole page (HTML with its style and script)
and the pictures it names, hung on a task, a project, a question or a decision by a person or an agent
(`attachVisual`, `braindog attach`, or `log` with `page`). It is drawn in the same frame as a drawn component, and
the argument is the same.

| Held | How |
|---|---|
| Where the bytes are | its page in the host's file store by its hash (`<record>/a/pages/` on the Cloud, `blobs/pages/` on a self-host), under the files' prefix and never at the files' door, which answers one path segment of 64 hex characters. Its pictures are files put through the file door first: 2 MB each, sniffed as PNG, JPEG, GIF, WebP or AVIF, never SVG. The record keeps only lines naming them by hash: a page at most 512 KB, 100 pictures and 20 MB a version, 512 MB of visuals a record |
| Who may hang one | what `log` asks of a task or a project (`append` on its list, a thing she may write, an agent's note floor), and what `propose` asks of a question or a decision. A thing she may not see is answered as one that is not there |
| Who settles a draft | a version handed in with `draft: true`, which is every version a token, a runner or BrainDog itself hands in unless it says `draft: false`, waits beside the one the visual stands at and never replaces it. Only a person keeps it, throws it away or asks again (`settleVisual`), with what hanging one asks of the thing; every token is refused `NEEDS_BROWSER_SESSION`, so an agent cannot keep its own draft |
| What goes in | the page, its pictures swapped for `data:` addresses the app read through the file door with its own sign-in (`visualDocument`), and the theme. Never a key, a token, a session, a row or an address of the record's |
| Its page | taken whole, its `<meta>` tags taken out, and refused in words when a tag's address or a `url()` names anything but inline data, a place on the page or one of its own pictures, when it holds a link, base, frame, object or form tag, or when its script calls the network, imports, uses storage or reaches for the page around it |

*(Added November 5th 2026.)* **An attached page** (a `.html` file or an artifact on a task, `/drawn-frame/file`) is written as it came, with no guard of ours inside it, so the frame document takes the peer connection away and removes frames it makes before it writes anything: no engine holds WebRTC to `connect-src`, and one named a TURN server and was sent UDP from under that policy.

The app's viewer (`apps/web/src/lib/visual/`) shows a visual closed as its first picture, read through the file door
as any picture is, or as a card with its title, and draws no frame until it is pressed. Open, it is this frame
(`sandbox="allow-scripts"`, the hosts' `/drawn-frame`), handed the document once after the frame says it is ready
from its own window; nothing the frame sends back is acted on, its height included, since the page scrolls inside it.

An attached page (a Claude artifact, any `.html` on a thing) is the frame at `/drawn-frame/file`, under a policy that lets
its libraries come from five script hosts and Google Fonts and `connect-src 'none'`. It sees no row, so what it could send
is who opened it and when. It is written with the same guard ahead of it (`attachedDocument`), after its doctype so it
draws as written, and with any declarative shadow root's attribute renamed, because the parser opens one with no call the
guard could refuse. **What holds and what does not:** a `GET` to one of those script hosts is still possible, with
anything in its address, and only that host's logs see it; the guard stops a peer connection in the page and in any frame
it makes, and a page in an engine that adds a new way of opening one is not stopped by a list of today's.

**What is not built:** erasing a person does not yet reach a page's bytes, only the lines that name them; and a version
carries no draft mark, so Keep, Try again and Throw away wait for one.

### Refusals that do not leak

Carried from the predecessor, where each was earned:

| | |
|---|---|
| A `401` says only `UNAUTHORIZED`; a `500` is bare | recon gets nothing |
| **No CORS, anywhere**; every JSON answer is `no-store` | — |
| The login lockout **reserves the attempt before comparing**, compares ten attempts and refuses the eleventh with a bare `429` and `Retry-After` for fifteen minutes, sticky, on a capped counter that forgets a first strike fifteen minutes old and that a success clears for its address; the address is the socket's, or, when the socket is a proxy `BRAINDOG_TRUST_PROXY` trusts (`1`: loopback or private; or a list), the caller it wrote into `X-Forwarded-For`, with the server key's strikes also counted against that peer under `1` or a list holding a range, holding it over 200 to one compare every two seconds (the rest a `429`) and never locking it; the server key's own lock holds wrong keys only, to one answer every two seconds, and the right key is compared first and always gets in, so a caller who writes the owner's address into the header cannot lock the owner out (RG14); it is keyed four ways — `ip:` `email:` `mint:` `device:` — and **fails closed** — a reservation that returns no row is a `503`, not a pass. Device codes and share tokens are locked out on the record's own `auth_fail`, logins on the Directory's ([49-SPEC-SELFHOST](49-SPEC-SELFHOST.md) §5.5) | the magic-link fallback code is short-lived and guessable in principle; the lockout is what makes any code field acceptable |
| **The server key's exchange (`/auth/token`) holds wrong keys only**: compared first, counted by the socket, and the right key always gets in, as at `/api` (RG14) | a place is a header behind a proxy, so anybody could name the owner's address and lock them out, or send a fresh one with each guess |
| **The operator's key at `/account/ops/*` and the Kennel's review doors**: ten wrong from one place, then `429` for fifteen minutes, counted in the Directory, cleared by the right key | those doors compared the key as often as anybody asked |
| **Agent tokens bypass the lockout, deliberately** | *"an agent tripping the ten-strike IP block would lock the owner out of his own record"* |
| Every sign-in failure is **one body**, `401 UNAUTHORIZED` "That did not sign you in.", whatever failed: a passkey, a link, the server key or a session. The reason is logged, not returned | the caller who deserves the reason is the owner, who reads the log |
| Passkey registration requires an authenticated session **in place of attestation** | *"behind the gate… is the security model in one line"* |
| **Two fleet-wide levers, both the host's**: the Directory's session, link and challenge hashes are HMAC-SHA-256 under the host's session key (`SESSION_SECRET` on the Worker; on a self-host, HKDF over the key file with the info `braindog/session`, or `BRAINDOG_SESSION_SECRET`), and `TOKENS_VALID_FROM` refuses anything minted before it | rotate one secret and every session is gone; set one date and every token is gone — an incident response that walks no rows ([53-SPEC-OPERATIONS](53-SPEC-OPERATIONS.md) §5.11) |
| **Fixtures carry no real data**: generated names, `.example` hosts, dates in 2030–2031, amounts under 10^7 minor, no ULID or hash on disk | a test corpus is the one copy of a record that is committed in clear ([40-SPEC-FIXTURES](40-SPEC-FIXTURES.md)) |
| **A read across the whole record goes through its reader's lens, line by line.** A feed, the questions waiting and decided, what went quiet and a digest shown on screen are drawn for one reader: each line, question and list is asked what `recentHistory`, `governance` and `list` ask of her (`seesFor` in `packages/record/src/index.ts`, `PageSees` in the kernel), so the owner's own lists (his runs, what he told them) and a personal list are left out of them for a Viewer or an Admin, and the rest is drawn. A digest's sections are held as their blocks are: what agents did and the questions to whoever a page draws them for, the runs and their steps to whoever reads the runs | a feed read for nobody in particular named a run's work and the owner's words to his agents to every reader of the record; and refusing the whole feed while any personal list was kept took Activity and Decide from every Admin |
| **Amounts written in text are hidden with the amounts.** Once any money field is hidden from a caller (a share's Hide amounts, or one naming the field), every amount written in the text she is answered is taken out with its currency kept, "Paid £… for clay", and so is one written with no currency mark ("Budget is 12k", "240 pounds", "2,500/month", "fee 90"), while dates, times, versions, phone numbers and counts of things stay, in a note, a title, a comment or a line of the log, by one wrapper round every record method (`sight.maskMoney`, read by the kernel's `maskMoneyText`). A text field holding such an amount is hers to read and not to change, so a save never writes "£…" over it. A search she makes for a figure finds a row, a count or a comment only where the figure is still in its words once those amounts are taken out (`maskedMatched` in `packages/kernel/src/fts.ts`), and asks nothing by meaning | hiding the field and leaving its value in the notes beside it hid nothing; and "923.47" typed into search named the row that said it |
| **His words to his agents go to his agents.** An instruction to whoever is next, any Claude or a task is handed only to a key that reads the instructions list; anybody else's agent is handed only what was sent to its own run by name, and marks nothing else seen (`toldTo`) | `context`, `attach`, `pulse` and `instructionsMine` handed a member's agent every broadcast whole, while `list` refused it the list |
| **Nobody is counted what they cannot open.** The rail's and Home's count of agents working is nought to a reader who may not read the runs, a Viewer or a guest of a project among them. The engine's readings, which count questions, folds and Slash's offers over every list, are refused to anybody who does not read the whole record; and a page version applied by an agent is signed "An agent" to whoever may not read the runs | "2 working" over an Agents place she cannot open is a count of the owner's own list; "Claude Code" under a version said which app he works with |
| **A colleague's automation runs as far as that colleague reaches, never as the owner.** A rule whose live version was put in by a person who is not an owner now (an owner moved down) reads and writes through their lens: a row they may not see does not start it, a field hidden from them is not on its row and cannot be written, every write is checked against the rows they may change on both sides of it, and it takes no step that reaches past those rows (a call, a script, a job, a question to Slash, a meet) and fills no figure. Once they reach nothing here it stops, "Stopped: Otto, who turned this on, can no longer reach this record." The maker is read off the rule's `declare` line, at every firing and every turn of a run (`makerOf` in `packages/kernel/src/index.ts`, `forRule` in `rules.ts`, `boundTo` in `flow.ts`) | a rule kept running with the owner's whole reach after the person who turned it on was moved down or removed |
| **The caller's context is capped on the hop to the record.** At most 32 KB (the largest template set takes under 8 KB); past it the Worker sends no context and the record answers "This is more than one person's sharing can hold. Ask an owner to join some of these shares." before it parses anything, and a share that would take somebody past it is refused at save (`CTX_HEADER_MOST` in `apps/worker/src/route.ts`, `SHARE_CTX_MOST` in `packages/record/src/methods/sharing.ts`) | the header had no size cap, and the record trusted whatever it carried |
| **A brief a model wrote is shown only through the lens it was written through.** The ticks gather facts as the whole record is read, and keep that lens beside the brief; anybody narrower, or with fields hidden, is answered the rules' cards, even when their facts happen to match (`briefLensOf` in `packages/record/src/brief-write.ts`) | a guest whose facts equalled the owner's was handed the owner's written brief |

**An audit row is drawn on another screen.** The predecessor logged `Credential indexed: <name> — opens
<opens>` on the reasoning that an audit row is read in a briefing and should be useful — and that reasoning is
why it was wrong: audit rows are drawn on the activity screen, and the Keychain is the one screen that is
**absent, not blurred, under screenshot mode**, because an index that is merely smudged is an index still in
the page source. Latent while credentials were added by hand; a migration indexed thirty-five in one run and
the harness caught thirty-five `opens` sentences on a screen that should carry none. So: a `grant.*` event's
`note` carries the grant's id and `kind`, never its `label` or `opens` — the rule keys on `target_kind = 'grant'`,
whatever the event kind, and a `vault_key` re-wrap's note is `<purpose> <from> → <to>`, naming no grant; the
event's `refs` carry the id, so a reader entitled to the prose is one call from it. Three invariants of the Keychain screen are tests
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
- **The route is `/api/files`, and it asks who you are.** The earlier `/a/<sha256>` was
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

### Sealed files

*(Built October 22nd 2026, for Setup sync.)* A store for bytes the host keeps and cannot read. The owner's machines
seal each file before it leaves them, and the record keeps it as it came.

- **The host never sees what is in them.** A file is sealed on the owner's machine with AES-256-GCM under a sync key of
  32 random bytes that only his machines hold, each in its own secret store, with the file's key as its additional
  data. The record checks a part's length and the whole file's SHA-256 and parses none of it. A copy of the sync key is
  kept as a sealed file too, under his sync passphrase (PBKDF2-SHA-256, 600,000 rounds, as the Keychain's passphrase), so a
  new machine can join; the passphrase and the key never leave his machines.
- **Symmetric on purpose, so the host cannot forge one.** With a public sealing key, anybody holding the public half, a
  host somebody broke into among them, could seal a file for his machines to place. With a key only his machines
  hold, a file the host made up does not open, and his machines place nothing that does not.
- **The owner's alone.** `sealedPut`, `sealedGet`, `sealedList` and `sealedDelete` are reached by his own session, his
  own key and the key `braindog login` makes for a machine. An Admin, a member, a share, a link, a runner, an app
  signed in through OAuth and its child keys, a key narrowed to less than him, a report key, a job's key, "See as" and
  an operation grant are refused, as a personal list refuses them. None is an MCP tool.
- **Kept where large bytes are kept, never where a page reads.** R2 at `rec_<id>/sealed/` on the Cloud,
  `<data>/<slug>/blobs/sealed/` on a self-host. A part is named by the hash of its key, the file's hash and its number,
  so no key a caller chose is ever a path or an object's name. The file door serves `a/<sha256>` and `blobs/<sha256>`
  and nothing else, and no block, source or page reads this store.
- **Its sizes.** A key is 1 to 200 characters of a to z, 0 to 9, dot, dash, underscore and slash, starting with a
  letter or a digit. A file is at most 25 MiB, in at most 8 parts of at most 4 MiB each; a part travels as base64 in a
  body of at most 6 MiB, the one `/api` body allowed past a mebibyte. Past any of these it is refused at `bytes` or
  `size`.
- **Whole only when it hashes right.** A file is whole once every part is here and, read back together, they hash to
  what each part said. Parts that hash to anything else are dropped and refused `CHECKSUM_MISMATCH`. Part 0 under
  another hash replaces the file and lets its parts go.
- **Counted against the record's storage.** On the Cloud each new part's bytes are counted against the record's day of
  bytes, the budget a file spends (`uploadDay`, 200 MiB), and past it a part is refused `RATE_LIMITED` with
  `Retry-After`. A self-host counts nothing: the disk is the owner's.
- **In the log by name, and to the owner only.** One line a file kept whole, `grant.add` or `grant.rotate` over an
  older file, and one a delete, `grant.revoke`, each on `sealed:<key>` and naming the key, its parts and its size,
  never a byte. Every feed and history anybody else reads leaves those kinds out.
- **In a copy by name, and the bytes stay with the host.** `sealed_file` travels in `data` with each file's hash, and
  which parts a host holds (`sealed_part`) is `local`. A record put back from a file on a host that holds no parts of
  them lists its sealed files as not whole, and the owner's machines put them again. Deleting the record deletes its
  sealed parts; a self-host's cold copy carries them with its files.

The honest trade, as the Keychain's passphrase has it:

| | We can read your sealed files | You can lose them |
|---|---|---|
| Setup sync | **no** | **yes**: lose the sync passphrase and every machine that holds the sync key, and the sync is gone |

**On the machine** ([48-SPEC-CLI](48-SPEC-CLI.md) §5.20). The command line holds its own lines, whatever the Carry list
says. It never reads, holds or moves an agent app's own login (Claude Code's keychain item and login file, the claude.ai
login, Codex's login file), and never lists or reads a session transcript, so auto memory, which sits beside them,
waits on the owner's yes. The sync key sits in each machine's own secret store (the Keychain, Credential Manager or the
secret service) and is handed to it on standard input, never on a command line; a Keychain item of tool sign-ins too
long for one line of `security -i` goes on `security`'s own command line for the moment it runs, as ccenv writes the
same item. A program a pull would place is shown whole and asked about at a terminal, and pinned by the hash of its
bytes and mode, so a changed one is asked about again. What a thing is, whether it runs and where it goes are sealed in the
bundle's manifest: Carry can ask for more care than the sealing machine did and never less, and a place that is not the sealed
one waits for a yes at a terminal. A skill whose text runs something (`` !`command` ``, a fenced `!` block, `hooks` or
`allowed-tools` in its front matter) is a program too, written only after a yes at `braindog skills sync` and pinned by its
hash. Tool sign-ins move and are never shared: they are placed only
from a machine that has been retired. The verbs call the record as the machine's own login, never as an agent app's
token. What leaves a machine in the clear is names, sizes, counts, times and hashes; what a file holds is only ever in
the sealed bytes.

### The export, and what it leaves out

`export` excludes every table in the `local` section of `dog_section` — `token`, `device_grant`,
`auth_fail`, `observation`, `job`, `job_event` — and nothing else
([03-DOG-FORMAT](03-DOG-FORMAT.md) §3, [33-CONTRACTS](33-CONTRACTS.md) §9). **`grant` rows travel
sealed by default**, and so does the wrapped DEK in `vault_key` — which opens nothing without the root KEK, a
Worker secret that is never in any file — so a leaked export is
bytes. `--redact-grants` drops the ciphertext too. **Sealed files travel by name**: `sealed_file` carries each one's key,
parts, size and hash, and its bytes stay with the host that holds them (Sealed files, above). *An earlier draft said the export excludes every
Keychain table; that contradicted [03-DOG-FORMAT](03-DOG-FORMAT.md) §5's three export modes and rule 6
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
| End-to-end encryption of the whole record | the server must query to render pages, run metrics and answer MCP. E2EE would make the record a blob store and delete the product. The Keychain is encrypted; the rows are not, and this is stated |
| Bring-your-own-KMS | no customer has asked. It is an additive adapter later |
| A bug bounty | before there are users, a bounty is a support queue |
| 2FA via SMS | passkeys are better and simpler, and SIM swap is exactly the attack this data attracts |

---

*Next: [13-UI](13-UI.md) — the interface.*

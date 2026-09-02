# 26 · Your account, your key, your machine

> *"Make it so you can connect Spark to your own Claude account / key / machine that runs Claude,
> so it runs more efficient and at lower cost."*

Three things were named, and they are three genuinely different architectures with three different
cost curves, three different security models and — for one of them — a terms-of-service question
that had to be answered from the actual clauses rather than assumed.

All figures retrieved **2026-09-01**.

---

## 1 · The three tiers

| | **A · the record's own hands** | **B · your key** | **C · your machine** |
|---|---|---|---|
| Runs in | the Worker, Workers AI | the Worker, your provider | your computer, your Claude Code |
| Model | `glm-5.3-flash`, `llama-3.2-1b` | anything you pay for | the best available |
| Who pays per token | **BrainDog** | **you, to the provider** | **nobody** |
| Works when the laptop is closed | ✅ | ✅ | ❌ |
| Works with no account anywhere | ✅ | ❌ | ❌ |
| Cost per 1,000 turns | **$0.90** | $8.60 *(Sonnet 5, warm cache)* | **$0.00** |
| Its job | triage, extraction, digests, embeddings | **the phone** | **the desk** |

### The assumption this inverts

"Bring your own machine" sounds like the premium tier that should handle everything. It cannot
handle the case the owner actually named:

> **On the go is precisely when the laptop is closed.**

So the on-the-go tier is **B**, not C. Your key, called from the Worker, answers from a phone in a
taxi at Claude quality, and costs BrainDog nothing. **C is the desk tier** — the month of ingest,
the reconciliation across forty rows, the long write-up. That is where the flat subscription you
have already bought stops being idle capacity.

### The cost table, computed rather than asserted

A **turn** is 4,000 input tokens of record context and 600 out. *Warm* means a 3,000-token stable
prefix served from cache.

| Tier | Model | $/turn | $/1,000 turns |
|---|---|---|---|
| A | `granite-4.0-h-micro` | 0.000135 | **$0.14** |
| A | `llama-3.2-1b` | 0.000229 | **$0.23** |
| A | **`glm-5.3-flash`** | 0.000900 | **$0.90** |
| A | `deepseek-v4-flash` *(the earlier default)* | 0.002552 | **$2.55** |
| B | Haiku 4.5, warm | 0.004300 | **$4.30** |
| B | **Sonnet 5, warm** | 0.008600 | **$8.60** |
| B | Sonnet 5, batch | 0.007000 | **$7.00** |
| B | Opus 5, warm | 0.021500 | **$21.50** |
| **C** | Opus 5 / Sonnet 5 on your subscription | **0.00** | **$0.00** |
| C | *what it costs BrainDog to carry* | ≈ 0.0000002 | **≈ $0.0002** |

**Tier A is 5–100× cheaper than tier B and gives a materially worse answer.** That is the whole
argument in one row, and it is why the owner is right that Claude is the better tool.

**Where tier C pays for itself, amortised honestly.** The marginal token cost is genuinely zero,
but the seat is not free, and quoting only the marginal number is the kind of accounting this
document exists to avoid. A real Claude Code turn against the MCP surface carries a system prompt,
tool definitions and history — roughly 10k cached + 4k fresh + 600 out, about **$0.040 a turn** on
Opus 5.

| Reading | Max 5× ($100/mo) | Max 20× ($200/mo) |
|---|---|---|
| Marginal cost of one more BrainDog turn | **$0.00** | **$0.00** |
| If BrainDog is 10% of that seat's use, at 300 turns/month | $0.033/turn · **$33/1k** | $0.067/turn · **$67/1k** |
| The same turns on the API, Opus 5 warm cache | $21.50/1k | $21.50/1k |

**The marginal reading is the right one, and here is why rather than by assertion:** the
subscription was bought for other reasons and its capacity is otherwise idle. But the fully-loaded
row is in the table so that nobody builds a pricing page on the word "free."

> **And a framing risk worth naming before somebody writes the landing page.** *"Get Claude for
> free with BrainDog"* is selling somebody else's subscription capacity as your feature, even
> though every mechanical clause in §3 is satisfied. The safe framing — and the one Anthropic
> itself uses for bring-your-own-cloud — is **"connect your own Claude."**

Two dated pricing notes that will need re-checking:

- **Sonnet 5 is $2 / $10** and Anthropic's docs state the increase to $3/$15 *"on September 1,
  2026 will not occur."* That is today's date. Re-verify before this number goes anywhere public.
- **Claude 4.7+ uses a new tokenizer producing ~30% more tokens for the same text.** Any
  per-token comparison across that boundary understates the newer models by about a third.

> **⚠️ Anthropic publishes no numeric usage allowance for Pro or Max.** Three official pages were
> checked; all give multipliers (1× / 5× / 20×) and *"we may limit your usage in other ways … at
> our discretion."* Third-party trackers circulate specific message counts. **They are unverified
> and must never appear in a BrainDog pricing page, a cost model, or a support answer.**

---

## 2 · Tier C, architected

### 2.1 · The precedent, and it is Anthropic's own

Five systems solve exactly this problem — give work to a machine behind NAT. GitHub Actions
self-hosted runners, GitLab Runner, Buildkite, CircleCI, and — most usefully — **Anthropic's own
self-hosted environments and Remote Control**, the second of which is available on Pro and Max.

The invariant, unanimous and explicit in all five:

> **Outbound-only HTTPS. The service never connects into your network.**

Anthropic's runner documentation, verbatim: *"the traffic to Anthropic, queue polling, the
session's event stream, and model inference, is outbound HTTPS to `api.anthropic.com` … Anthropic
never connects into your network."* And *"each poll refreshes the lease and doubles as the
heartbeat. If the runner stops polling for about 60 seconds, the server requeues the session."*

**What is *not* the invariant, contrary to the obvious reading:** long polling. GitLab's default is
a **3-second short poll**; Buildkite has moved to streaming with polling as fallback; GitHub holds
~50 s; Anthropic holds 10 s. The generalisation is *outbound-initiated pull with a tunable hold*,
not any particular hold.

Three ideas worth taking outright:

| From | Idea |
|---|---|
| **GitHub** | **BrainDog stores nothing that can impersonate a customer's machine.** GitHub buys it with a runner-generated keypair and a public-key upload; BrainDog buys the same property with the device grant's `token_hash` ([12-SECURITY](12-SECURITY.md) §6.1) — a stolen control-plane database impersonates no one, and there is one standard flow instead of a bespoke keypair ceremony. *An earlier draft copied the keypair itself* |
| **Anthropic** | Three credential tiers — pool → agent → job — with the job credential expiring in hours, not months |
| **GitHub / Anthropic** | The lease **is** the heartbeat, at 60 s. Do *not* copy GitLab, which couples the lease to log upload and has its 30-minute client send interval exactly equal to its 30-minute server reclaim threshold — an undocumented race |

And one thing to add that **none of the four CI vendors documents: an idempotency key.** None of
them automatically re-executes a job whose agent died mid-run; they push it to the pipeline author
as a retry policy. BrainDog cannot dodge it, because its jobs have side effects on somebody's
business record.

### 2.2 · The transport, and the number that decides it

| | Long-poll HTTP | **Hibernatable WebSocket → DO** | Queues pull consumer | Cloudflare Tunnel |
|---|---|---|---|---|
| Latency to deliver | ≤ the hold window | **instant** | ≤ poll interval | instant |
| Message cap | Worker limits | **32 MiB received** | **128 KB** | HTTP |
| **Idle cost per customer per month** | **≈ $4.05** if held in a DO | **$0** | 3 ops/message | unverified |
| Per-tenant credential | ✅ | ✅ | ❌ **account-scoped** | tunnel token |
| Cross-tenant blast radius | none | none | ⚠️ **a Queues token can read other queues in the account** | tunnel-scoped |
| Needs a listening service on the laptop | no | no | no | **yes** |
| Self-host parity | ✅ — **the only self-host transport** | Cloud only; no `ws` dependency | ❌ | ❌ |

**The decisive arithmetic.** Durable Objects bill **$12.50 per million GB-s**. A connection held
open *inside a DO* keeps that object resident: 30 days × 86,400 s × 0.125 GB = **324,000 GB-s ≈
$4.05 per customer per month** — one customer consuming 81% of the account's entire included
allowance, against a $12 price and a $0.55 cost target. **It destroys the margin.**

A **hibernatable** WebSocket costs nothing while idle. Cloudflare's documentation is explicit:
*"Billable Duration (GB-s) charges do not accrue during hibernation."* Two hundred jobs a month
with a few messages each is well under a hundred billable requests — **under a hundredth of a cent
per customer per month.** `setWebSocketAutoResponse` handles ping/pong **without waking the
object**, so liveness is free too.

> ### Decision: hibernatable WebSocket to a Durable Object, as a doorbell. Long-poll on a *plain Worker* as the degraded fallback — and the only transport on a self-host, where the hold runs in the host process and wall time costs nothing. Not Queues. Not Tunnel.

Queues is disqualified on security, not cost: its pull consumer needs an **account-scoped** API
token with `queues#read`/`queues#write`, and there is no per-queue scope. A cross-tenant read is one
misconfiguration away, which contradicts [12-SECURITY](12-SECURITY.md) §2's whole argument that
isolation should be a platform invariant rather than a human's carefulness. Tunnel is disqualified
structurally: it needs a daemon **and** a listening service on the customer's machine, and it has
no self-hosted equivalent.

**Where it lives: on the Spark object.** Spark already makes outbound calls, already holds no write
RPC, and already returns proposals. It becomes the dispatcher for both tier A and tier C — named
methods, dispatched by name over `/api/spark/<method>`, not a generic `dispatch`
([46-SPEC-SPARK](46-SPEC-SPARK.md) §2) — and the record object still makes no outbound calls. The
socket it holds is a **doorbell**: one frame, `{ t: 'job', id }`, that ends a runner's wait early;
every claim is `claimJob` over HTTP, and Spark holds no lease state and no alarm
([51-SPEC-WORKER](51-SPEC-WORKER.md) §5.15). The third Durable Object class, `Directory`, holds
identity — people, passkeys, sessions, the slug → `rec_id` map — never a job
([ADR-061](16-DECISIONS.md), [01-ARCHITECTURE](01-ARCHITECTURE.md) §3). *An earlier draft said "not a
third class" when there were two; a runner still adds no class of its own.*

### 2.3 · Enrolment — the device grant, not a bespoke flow

Enrolment **is** the vault's device-authorisation grant ([12-SECURITY](12-SECURITY.md) §6.1, RFC 8628).
One flow to secure, and it is a standard.

1. *Connect this machine* → `braindog runner enroll` calls `POST /auth/device` with
   `reach: 'runner'`, prints the **six-digit code** and polls `POST /auth/device/token` with its long
   random id, never the code ([33-CONTRACTS](33-CONTRACTS.md) §4). The code lives **ten minutes**
   (`DEVICE_CODE_EXPIRED`) and survives **five** wrong tries (`DEVICE_CODE_TRIES`); a wrong code bumps
   `tries` on every pending row.
2. The owner approves the code at the `verification_uri` — Settings → agents — from a browser session
   that is already authenticated as him; a bearer gets `403 NEEDS_BROWSER_SESSION`. The row goes
   `pending → approved → active`; a denied row is kept.
3. The poll exchanges the approved row for a **90-day device grant**, stored as `token_hash` and shown
   once. A runner is a principal kind of its own — `principal = { kind: 'runner', id, name }`, built
   only from a verified device grant, never a top-level field ([33-CONTRACTS](33-CONTRACTS.md) §2). It
   appears in the same list as agent tokens, with `last_used_at` and a revoke button, and is
   **auto-deregistered after 14 silent days**.
4. Per job, a **job-scoped MCP bearer**, minted by `claimJob` in its own transaction as a `token` row
   — scope `propose` (the ladder gives it `read`), label `job:<id>`, audience one job, `expires_at`
   the job's expiry, revoked at `end` ([12-SECURITY](12-SECURITY.md) §3;
   [45-SPEC-RECORD](45-SPEC-RECORD.md) §5.5). Never `write`. Never the customer's long-lived token.

> **An earlier draft had the runner generate a keypair locally, upload only the public key, and sign a
> client assertion per connection, behind a ~15-minute enrolment code.** It was dropped for the device
> grant: the property it bought — a stolen control-plane database impersonates no machine — survives,
> because BrainDog holds only the hash; and there is one flow to secure instead of two.

**Two platform ceilings that shape this, and both are cheap to design around and expensive to
discover:**

| | |
|---|---|
| `serializeAttachment` caps at **16,384 bytes** per connection | enough for `{ runner_id, record_id }` — a doorbell needs nothing more. Job bodies and leases live in the kernel's `job` and `job_event` tables ([30-BLUEPRINT](30-BLUEPRINT.md) §1) — four kinds, nine statuses, `local` section so they never travel in an export. Designing a fat attachment first and finding this second is a rewrite |
| `setWebSocketAutoResponse("ping","pong")` answers **without waking the object** | so liveness costs nothing at all, and `getWebSocketAutoResponseTimestamp()` reads the last one. This is what lets the heartbeat be free rather than a per-minute wake-up billed against duration |

### 2.4 · What goes wrong, and what happens

| Failure | Handling |
|---|---|
| **Laptop closed** | Socket drops. The job stays queued and unleased. The UI says *your machine is offline* and offers tier A or B **now**. Queued beyond 24 h → cancelled **with a notice**, never silently |
| **Two machines connected** | A **job** locks to one runner, not the reverse — the claim is one statement, and the loser is told it got nothing. No `preferred` machine is built |
| **Job half-done** | The lease is **separate from the result upload** — the GitLab lesson. `readCancel` renews it: 60 s, called every 20 s while a child runs. A lost job is re-claimed **once**, inside the claim statement, and expiry is swept inside `claimJob` too; Spark holds no lease state and no alarm ([46-SPEC-SPARK](46-SPEC-SPARK.md) §4.7; [45-SPEC-RECORD](45-SPEC-RECORD.md) §5.5). Liveness rides on auto-response, so the check is free |
| **Duplicate delivery** | Every job carries a stable `job_id` that a requeue keeps — **the idempotency key all four CI vendors omitted.** First result wins; the rest are discarded, and the `suggestion` row is written idempotently on `job_id` |
| **Network breaks WebSockets** | A 20-second long poll — `claimJob { wait: 20 }` — on a **plain Worker**, where wall time is not billed. Degraded, and labelled as such |
| **Runner silent 14 days** | Auto-deregistered, and the customer is told. A stale machine should not sit in a token list forever |

---

## 3 · The terms of service, answered from the clauses

**It is permitted, and Anthropic has written the rule down explicitly** — in a way that also states
precisely what BrainDog must never do. From *Claude Code — Legal and compliance*:

> *"Customers may not pay for, resell, or intermediate Claude usage on their end users' behalf.
> **Each end user must authenticate with their own Anthropic API key, Claude subscription plan
> credentials, or 3P inference provider credential.**"*
>
> *"Anthropic does not permit third-party developers to offer Claude.ai login into their own
> applications, or to route requests through Free, Pro, or Max plan credentials on behalf of their
> users. Moreover, **developers may not collect, store, or intermediate Claude.ai credentials or
> session tokens** — sign-in to a Claude account must complete through Anthropic's own flow."*
>
> *"**Nor does it prevent an end user from signing in to the unmodified Claude Code binary with
> their own Claude subscription.**"*

That last sentence is the permission, and it is unambiguous. The supporting boundary is the
Consumer Terms' §3(7), which bans automated access *"except when you are accessing our Services via
an Anthropic API Key **or where we otherwise explicitly permit it**"* — and Anthropic explicitly
permits it: `claude setup-token` issues a one-year OAuth token that *"can only make model
requests"*, and Anthropic's own GitHub Actions documentation tells people to put it in **their own**
repository secrets.

> ### The line
> **The credential is issued to the human, held by the human, and used on the human's own machine
> for the human's own work. BrainDog may describe the work. It may never touch the credential, the
> seat, or the billing relationship.**

| BrainDog must never | Clause |
|---|---|
| Hold, store, proxy or transiently see a Claude subscription credential or session token | *"may not collect, store, or intermediate"* |
| Offer "Sign in with Claude" | *"must complete through Anthropic's own flow"* |
| Route two customers' work through one machine or one seat | *"each end user must authenticate with their own"* |
| Pool, batch or resell subscription capacity in any form | *"may not pay for, resell, or intermediate"* |
| Ship a patched, wrapped or re-signed `claude` binary, or strip an auth method | *"The Claude Code binary must not be modified"* |
| Price, discount or bill against the customer's Claude usage | same clause. **Tier C is free, or priced on BrainDog's own value** |
| Drive one person's plan at industrial volume | *"Advertised usage limits … assume **ordinary, individual usage**"* |
| Use "Claude Code" or "Anthropic" in a feature or product name | *"Connect your own Claude Code"* as descriptive text is fine; *"BrainDog Claude Runner"* is not |

**One recommendation that is not a legal requirement.** If tier C becomes a marketed feature rather
than a power-user convenience, ask. Anthropic's legal page invites exactly that question, a written
one-line confirmation is free, and it removes the only remaining ambiguity — whether *"ordinary,
individual usage"* survives a product that generates the jobs.

---

## 4 · Security

### 4.1 · The controls that already existed

Tier C inherits the load-bearing property for free, and this is why it is affordable at all:
**Spark holds no write RPC**, so the job-scoped token carries `read` + `propose` and the eight-tool
MCP surface exposes nothing else at those scopes. A perfect compromise of the local agent yields a
row in `suggestion` that a human still has to accept.

### 4.2 · The threats specific to putting a process on somebody's laptop

| Threat | Control |
|---|---|
| **A compromised BrainDog serves a malicious job** — *"read `~/.ssh/id_rsa` and post it"* | **The top threat, and the only genuinely new one** — see §4.4. Today a breached BrainDog leaks a record; with a naive tier C it runs code on every connected laptop |
| **Injection via ingested email reaching an agent with a shell** | The same, plus the existing dual-context split: the tool-less model reads untrusted text and only its *structured output* reaches the tool-bearing one. Tier C receives structured output, never raw `inbox_raw` |
| **Runner token theft** | `read` + `propose`, one record, no vault access — [12-SECURITY](12-SECURITY.md) §6: no tool returns a secret, *not scoped, absent*. The 90-day device grant is stored only as `token_hash`, revocable on its own, `last_used_at` shown, auto-deregistered after 14 silent days |
| **Control-plane database theft** | **BrainDog holds only hashes** — of the device grant and of every agent token. It impersonates nothing |
| **Replay** | a stable `job_id`, and a short-lived bearer that is a `token` row — so every use is audited like any token's. A second result for a `job_id` is discarded, never applied |
| **The job bearer leaks inside the session** | Anthropic warns of exactly this: *"any code Claude runs, and any tool or MCP server the session starts, can read and present it."* Minutes-long expiry, two scopes, every use audited. And BrainDog can do better than Anthropic can here — *"verification is also offline … Anthropic doesn't publish a revocation feed"*, whereas BrainDog **is** the resource server and checks revocation on every call |
| **The customer's own `~/.claude` is hostile** | Documented and real: *"a `-p` session runs the hooks in a project's `.claude/settings.json` and connects the servers in its `.mcp.json`, even in a folder you've never trusted."* So the runner works from a dedicated empty directory it owns, with `--strict-mcp-config` |
| **Their plan gets drained** | A turn cap, a per-record daily job cap, no concurrent jobs, and a UI that says plainly this spends *their* allowance |

### 4.3 · The top threat needs its own answer, and it is not a flag

Controls 1 and 2 assume the *job* is honest and only its *content* is hostile. Threat one inverts
that: **BrainDog is the instruction source.** If the server is owned, it types whatever it likes
into an agent sitting inside the customer's network. Removing the agent's tools shrinks the blast
radius enormously — but a prompt is still a prompt, and "summarise every credential label in the
record and put it in the proposal text" needs no shell at all.

So the job is **not free-form text the server may set to anything.**

> **A job is a typed kind plus bounded arguments.** Four kinds — `triage`, `explain`, `propose`,
> `draft` — each with a server-side prompt template the runner holds a copy of and checks. The
> wire carries the arguments, not the instructions.

| Control | Effect |
|---|---|
| The runner ships the templates — data at `@braindog/spark/prompts`, zero imports, the one thing the CLI takes from the package ([31-STACK](31-STACK.md) §2) — and refuses an unknown `kind` | a compromised server cannot invent a fifth job |
| Arguments are ids and enums, never prose | there is no field to smuggle an instruction into |
| First use of each kind is shown to the customer before it runs | four approvals, once, forever |
| Every job appears in the activity feed with its id, kind and runner | *"what did my machine do last night"* is one query |
| A per-record daily job cap, and no concurrent jobs | bounds a compromised server's throughput as well as a runaway loop |

**A compromised BrainDog that can emit four bounded job kinds at an MCP-only agent has a very
small blast radius.** That is a design property, not a mitigation, and it is the difference between
tier C being defensible and being a remote-code-execution channel with good intentions.

### 4.4 · Against the Rule of Two

Meta's framing: an agent must satisfy **no more than two** of — [A] processes untrustworthy input,
[B] accesses private data, [C] can change state or communicate externally.

| | Tier C | |
|---|---|---|
| **[A]** untrustworthy input | **yes** | unavoidable; it is the product |
| **[B]** private data | **yes** | unavoidable; it is the product |
| **[C]** changes state / communicates out | **no** | `propose` only, no write RPC, no shell, no fetch, no filesystem, one MCP endpoint |

**Two of three. It passes without needing the human-in-the-loop escape hatch** — and it keeps the
gate anyway.

> **Note what would break it:** giving the runner `write` scope, allowing Bash *"just to read a
> file"*, or leaving the local Claude its web-fetch tool. Each turns on [C] on its own. **The
> design is one flag away from being wrong, so the flags belong in a test, not a README.**

---

## 5 · How the customer's Claude is actually told what to do

It is not a new protocol. **The MCP surface in [10-MCP](10-MCP.md) is the whole interface**, and
the runner is a thin poller that shells out to the published binary.

### The gotcha that will cost somebody a day

> **Do not use `--bare`.** *"In bare mode, Claude Code never reads OAuth credentials or the system
> keychain,"* and *"bare mode does not read `CLAUDE_CODE_OAUTH_TOKEN`."* Bare mode is the natural
> instinct for a scripted invocation and it **silently breaks subscription authentication**, which
> is the entire point of tier C. Harden with `--restricted` instead.

### The invocation

```
claude --restricted -p "$PROMPT"
  --output-format stream-json --json-schema "$RESULT_SCHEMA"
  --strict-mcp-config --mcp-config "$MCP_JSON"
  --allowedTools "mcp__braindog__record_index,…,mcp__braindog__propose"
  --permission-mode dontAsk --max-turns 12
  --disable-slash-commands
```

The final `result` line is validated against the schema; every other line is distilled into one
`job_event` — `start · say · think · tool · out · limit · note · end · error` — as the runner
refinements below describe. *An earlier draft asked for `--output-format json`, a single result, while
the same section consumed a stream.* `--no-session-persistence` is not passed — it would defeat the
`--resume <session>` below — and `--allowedTools` takes the prefixed `mcp__braindog__*` names the
claim returns, filtered to that prefix before they reach the flag ([48-SPEC-CLI](48-SPEC-CLI.md) §5.13;
[44-SPEC-MCP](44-SPEC-MCP.md) §12).

Run from an empty BrainDog-owned working directory, never the customer's repo. `--restricted` is
doing the real work — `dontAsk` still permits the read-only command set.

> **`--restricted` requires Claude Code v2.1.248 or later. The runner checks `claude --version` at
> enrolment and at every job, and refuses to run below it** — rather than silently falling back to
> an agent with a shell. A security control that degrades quietly is not a security control.

Two more mechanics worth writing down because they are easy to get wrong:

| | |
|---|---|
| **Interruption** | `claude -p` on `SIGTERM` exits **143**, leaves the turn unfinished and records no result. The runner traps it, posts `interrupted` with the `job_id`, and exits. The server requeues once, then surfaces it |
| **Tool output ceiling** | MCP tool output is capped at **25,000 tokens** by default, with a warning at 10,000 — comfortably above [10-MCP](10-MCP.md) §4's 2,000-token page target, so no page needs to change. Worth knowing before somebody raises a limit that was never the binding one |

> **To verify against the installed version before this becomes a security control:** the exact
> interaction of `--restricted` with the `--tools` presets. The documentation describes it only
> partially, and a control that is 90% understood is not a control.

### Five refinements from a runner that shipped

The predecessor built exactly this on 2026-09-01 — a systemd service on a VPS that polls, claims,
runs `claude -p --output-format stream-json` and posts events back. Its design notes correct five
things in the section below.

| Refinement | Why |
|---|---|
| **`--resume <session>` for follow-ups** | *"the single most valuable column"*: a job may name the Claude session it continues, so *"now do the other half"* does not start from nothing |
| **The runner distils; it does not relay** | measured: a trivial two-turn job emitted ~12 KB across nine stream-json events — a 3 KB `init` enumerating every tool, a full `usage` object on every message. The runner translates each line into one small event with a `kind` — `start · say · think · tool · out · limit · note · end · error` — and truncates tool output. *"What is kept is what a person reads; what is dropped is the parts that are the same every time."* |
| **A per-job `seq` high-water mark on the parent row** | a poll answers *"is there anything new"* from **one indexed read**, and fetches events only when there are. That is the difference between a 700 ms poll costing one lookup and costing a range scan |
| **`cancel` is a flag, never a delete** | *"a job that was stopped is a job he will want to see the transcript of — that is usually WHY it was stopped."* The runner reads the flag through `readCancel` — which also renews its lease — and kills the child |
| **`LOST` is deliberately not a status** | a row claimed and never finished stays `claimed` with an old `claimed_at`, and the *list* decides what to call it. *"A status the runner can never write is a status that lies when the runner dies mid-job"* |

And four mechanics. **The claim is always `claimJob` over HTTP. On Cloud the socket is a doorbell that
ends the wait early; on a self-host there is no socket and the runner long-polls only —
`claimJob { wait: 20 }`, `wait` in the body** ([48-SPEC-CLI](48-SPEC-CLI.md) §5.13;
[33-CONTRACTS](33-CONTRACTS.md) §11): the Worker holds the request, checks every 1.5 s and answers the moment something is
queued. The predecessor measured the change on 2026-09-02 — claim latency fell from 15.4 s to under 1.5 s
*and* requests fell from 2,880–43,200 a day by tier to about 4,300, flat, which is unusual enough to state:
long-polling improved both halves of the trade at once. Twenty seconds, not thirty, because a connection
held to the edge of a platform limit is cut somewhere nobody is looking; an `AbortController` at wait + 10 s,
because `fetch` has no timeout of its own and a far end that vanishes without closing the socket would hang
the loop for ever with the box idle and jobs queueing behind it; and a held request costs no CPU — the
Workers limit is processor time, not wall clock, and `await` on a timer is neither. **`idle_ms` is still
answered**, so a runner behind a proxy that cannot carry twenty seconds degrades to the old backoff
(1.5 s → 30 s) rather than hammering; the runner's device grant reaches **exactly the JOBS group's three runner methods — `claimJob` · `postJobEvent` · `readCancel` ([30-BLUEPRINT](30-BLUEPRINT.md) §5) — and cannot create, cancel or list a job**, while every MCP token is refused the whole job surface with a reason;
`repo` is **a name, never a path** — the runner resolves it against its own root and refuses a slash
or a dot-dot, because the column is written by a browser; and the child runs as a **dedicated unix
user with tokenless git remotes**, under a systemd unit hardened with `ProtectSystem=strict`,
`ProtectHome=read-only` and write access to its own tree only — defence in depth behind `--restricted` and
`--permission-mode dontAsk`.
The runner never passes `--dangerously-skip-permissions`, which would turn on [C] in §4.4 by itself.

**Enrolment is the vault's device-authorisation grant**, not a bespoke flow — [12-SECURITY](12-SECURITY.md)
§6.1. One flow to secure, and it is a standard.

### The job, and what comes back

The job carries an id, a lease (`lease_until`) and an expiry, a kind with its bounded arguments, a
model, a turn cap, the MCP config, the allowed tool list, and a result schema — the `job` row of
[30-BLUEPRINT](30-BLUEPRINT.md) §1. **The work itself lands over MCP, not over
the socket** — Claude calls `propose` directly, so suggestions are already rows before the job
finishes. That is why the transport carries only a job and a receipt, and why it costs nothing.

`status` is one of `queued` · `claimed` · `ok` · `needs_decision` · `refused` · `limit` · `error` ·
`interrupted` · `cancelled` — nine, the `job.status` CHECK; *lost* is derived by the list from a stale
`claimed_at`, never stored. *An earlier draft listed five and used four more.*

Three details worth writing down:

1. **A decision must never be answered locally.** The gate returns `input_required`; in `dontAsk`
   the local agent cannot answer a question, which is **correct** — the human is not at the laptop.
   The runner returns `needs_decision` and BrainDog surfaces the choice in its own UI.
   *Spark never decides, and neither does the laptop.*
2. **The cost figures Claude Code returns are client-side estimates**, and on a subscription they
   are meaningless as money. Display them as **effort**, never as a bill.
3. **Stream the progress.** The event stream lets the UI say *your machine is working* with a turn
   count, rather than showing a spinner for forty seconds.

---

## 6 · The recommendation, including what to cut

### Does tier A survive at all, given Claude is better?

**Against it:** it costs BrainDog real money for the worst output in the product, and it carries a
long tail — routing, evals, a neuron budget with a UI, gateway DLP and guardrail configuration,
degradation messaging. And its budget buys **≈78** conversational turns a month at the shape [08-METRICS](08-METRICS-AND-ANALYTICS.md) §6 models — about two a day — which is not a chat
assistant so much as a chat assistant that runs out.

**For it, and these are not small:**

1. **Deterministic machine work must run when nobody is there.** Triage at 3am, extraction,
   digest prose, embeddings. A laptop is asleep; a customer may have no key. `bge-m3` embeddings
   have no cheap equivalent, and [11-ASSISTANT](11-ASSISTANT.md) §5 puts them inside the record
   deliberately.
2. **B and C both presuppose an Anthropic account.** This buyer is a solo founder at $12/month.
   A product whose assistant is dark until you go and buy something else has a dead first session.
3. **Self-host parity.** The adapter that makes tier A work is the adapter that makes Ollama work.
   Deleting the tier does not delete the code.

### The verdict: split tier A, keep the machine half, cut the chat half from v1

| | Ships | When — [ADR-030](16-DECISIONS.md) | Role |
|---|---|---|---|
| **A-minimal** | **1st** | Phase A. The §1b base of [15-ROADMAP](15-ROADMAP.md) ships no intelligence at all | Triage, extraction, digest prose, embeddings. Small models, no conversation. The record works unattended |
| **B — your key** | **2nd** | with the conversational surface — Spark's palette mode arrives with tier B, not before | The default conversation, **and the phone.** Claude quality, BrainDog pays nothing |
| **C — your machine** | **3rd** | last | The desk. Heavy work, best model, no per-token cost anywhere |
| A-conversational | fallback | with tier B | Labelled honestly: *this is the small model — add a key or connect your machine.* Never silently substituted |

**Why B before C, and it is not close.** B is days: the vault exists, the inference adapter already
takes any OpenAI-compatible endpoint, and Anthropic is a config row and a request shape — per ask,
the host opens the grant under the asker's browser session, decrypts in the Worker, hands Spark a
per-call `Inference` adapter and writes one `grant.read` event; the package never holds the key
([46-SPEC-SPARK](46-SPEC-SPARK.md) §5.9). C is
weeks: enrolment over the device grant, a WebSocket dispatcher with leases and requeue, a
cross-platform runner, an installer, an offline UX, a revocation UI, and a distributed-systems test
suite. **Prove people want Claude-grade answers before building the tier that makes them free.**

### Cut, each with the reason

| Cut | Because |
|---|---|
| Tier A conversation as the **default** | the worst answer in the product, on a budget that runs out |
| **Queues pull consumer** | no per-queue token scope; a cross-tenant read is one misconfiguration away |
| **Cloudflare Tunnel** | a daemon *and* a listener on the customer's machine, no self-host equivalent, and it solves a problem an outbound socket already solved |
| **Long-poll as the Cloud primary** | ≈$4.05/customer/month held in a DO — a third of the price of the product. On a self-host it is the only transport, and free |
| `--bare` | silently breaks subscription auth |
| A Durable Object class for the runner | Spark already has the shape and the right prohibitions; the three classes are `Record`, `Spark` and `Directory` ([ADR-061](16-DECISIONS.md)), and the runner is not a fourth |
| **Any path where BrainDog holds a Claude credential** | explicitly prohibited, enforceable *"without prior notice"*, and independently the worst security decision on the table |

---

> ### **Tier A is the record's own hands, and should stay small. Tier B is the phone. Tier C is the desk. BrainDog never holds the key, never holds the seat, and never writes the row — it points, and something better does the work.**

---

*Next: [12-SECURITY](12-SECURITY.md) for the vault the customer's key lives in, and
[25-CONNECTORS](25-CONNECTORS.md) for the other thing that needs one.*

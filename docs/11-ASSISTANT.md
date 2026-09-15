# 11 · Spark — the assistant

This document covers the **engine**: the name, what it may do, model routing, retrieval, and cost.
Its **interface** is in [13-UI](13-UI.md).

---

## 1 · The name, and the decision that overrode a recommendation

> ### **Spark**

**An earlier draft renamed this to Pointer, and the owner has since reaffirmed Spark twice.**
That is the decision, and this section records the trade honestly rather than re-arguing it.

**What the rename was for.** GitHub Spark is Microsoft's; Google shipped Gemini Spark in 2026. The
prior record's note was *"the assistant gets a dog's name. 'Spark' cannot travel."* The cost is
real and it is entirely in **discoverability**: nobody will ever find BrainDog by searching for
"Spark AI", and the phrase in a changelog or a support thread resolves to somebody else's product.

**Why that cost is affordable.** It is a *feature* name inside a product, not the product name —
which is the level at which coexistence is the norm rather than the exception. The expensive
register check was already done for **BrainDog** itself and came back empty in every class at
USPTO, EUIPO and UK IPO. Nobody types a feature name into a search engine to find the product it
lives in; they type the product name, which is clear.

**What is kept from the rename, because it was the better half of the idea.** The Pointer argument
was never really about the word — it was about compressing the governance thesis into the name.
That sentence survives intact and is worth more than the word was:

> **Spark never decides. It points at what does.**

**What must not happen:** *"Spark"* used alone in a title, a repository name, an npm package or a
domain. It is always **BrainDog Spark** on first use in any public surface, which is the standard
way a colliding feature name is made unambiguous. Recorded as
[Q8](17-OPEN-QUESTIONS.md) with a cheap register check across classes 9 and 42 still outstanding.

---

## 1b · What Spark is *for*, which is narrower than "an assistant"

This is the sentence the whole design now follows from:

> **Spark is what manages the record when you are on the go. Claude is the better tool, and the
> product's job is to get out of its way.**

That is a positioning, not a limitation, and it resolves an argument the documents were having
with themselves. [23-ASSISTANT-UI](23-ASSISTANT-UI.md) recommended not shipping an assistant in v1
at all, on good evidence. The resolution is that **there is no single assistant to ship or cut** —
there are three sources of intelligence behind one interface, and they ship at different times:

| | Runs | Model | Ships |
|---|---|---|---|
| **Spark, on the record's own hands** | Workers AI, in the Worker | small, fast, cheap | **first** — the record must work unattended at 3am |
| **Spark, on your key** | Workers AI *or* your Anthropic key, in the Worker | whatever you pay for | **second** — and this is the phone |
| **Spark, on your machine** | your own Claude Code, on your own subscription | the best available | **third** — and this is the desk |

**The staging is [ADR-030](16-DECISIONS.md), and it is narrower than the table reads.** The §1b base
in [15-ROADMAP](15-ROADMAP.md) ships **no** in-app model call — the ingest-pattern proposal there is
the customer's own agent over MCP. Phase A ships **tier A-minimal**: triage, extraction, digest prose
and embeddings on small models, no conversational surface. Conversation arrives with **tier B**, your
key; tier C, your machine, is last. A chat surface is added only when a Cloud customer with MCP
configured asks for it, and that ask is instrumented — [17-OPEN-QUESTIONS](17-OPEN-QUESTIONS.md) Q2
is answered there.

**One correction to the obvious reading, and it inverts a natural assumption.** "Connect your own
machine" sounds like the premium tier that should serve every case. It cannot serve *this* one:
**on the go is exactly when the laptop is closed.** The mobile tier is your **key**, called from
the Worker, which works from a phone in a taxi and costs BrainDog nothing. Your machine is the
**desk** tier — the month of ingest, the reconciliation, the long write-up.

Full architecture, costs, the terms-of-service position and the runner protocol:
**[26-BYO-INTELLIGENCE](26-BYO-INTELLIGENCE.md)**.

---

## 2 · What Spark may and may not do

| May | May not |
|---|---|
| Read a narrow projection of the record | **write anything, ever** |
| Search — FTS5 and vectors | read a `grant` secret. There is no tool for it |
| Propose typed rows for approval | make an outbound call other than to the configured model |
| Propose an `ingest:` pattern from examples | choose between options it presented |
| Draft prose and blocks | send an email, move money, or delete |
| Explain a figure by naming its source rows | act on a schedule without a human having approved the rule |

The enforcement is architectural, not a prompt instruction: **Spark runs in a separate Durable
Object with no write RPC.** There is no write path to compromise. A perfect jailbreak of the model
yields a proposal, and a proposal is a row in `suggestion` that a human has to accept — filed once,
by `record.propose`; an `infer.*` ack carries a tier-A result back and files nothing itself
([46-SPEC-SPARK](46-SPEC-SPARK.md) §5; [45-SPEC-RECORD](45-SPEC-RECORD.md) §5). A write from a
`spark` principal is `FORBIDDEN` at the record's first step ([30-BLUEPRINT](30-BLUEPRINT.md) §3).
Spark's own storage is two tables, `settings` and `call` — no conversation table, no retrieval
cache; the drafted predicate sits on the `call` row and nothing accumulates
([46-SPEC-SPARK](46-SPEC-SPARK.md) §4.1). Its refusals are one family of five codes —
`PROPOSAL_UNCITED` `PROPOSAL_NO_ROWS` `PROPOSAL_SCHEMA` `PREDICTION_UNMEASURABLE`
`SPARK_BUDGET_SPENT` — each with a fixture ([30-BLUEPRINT](30-BLUEPRINT.md) §6).

This is the single most important design decision about the assistant, and it is worth the
inconvenience it causes.

---

## 3 · Model routing by job

One model for everything is a 50× cost error in either direction — too dear for classification,
too weak for conversation. Prices from Workers AI, read 2026-08-31, at $0.011 per 1,000 neurons.

| Job | Model | Why | $/M in | $/M out |
|---|---|---|---|---|
| Triage: is this raw payload a known shape? | `llama-3.2-1b` | binary-ish classification with a 1.5k prompt; the `shape` itself is deterministic — channel, sender domain, digit-blanked subject — and the model contributes `kind` and `actionable` only ([46-SPEC-SPARK](46-SPEC-SPARK.md) §5) | 0.027 | 0.201 |
| Extraction proposal from 3 examples | **`glm-5.3-flash`** | needs to reason over structure and emit YAML | **0.150** | **0.500** |
| Conversation and proposals | **`glm-5.3-flash`** | schema-constrained structured output over a projection, and the cheapest model that is good enough to talk to | **0.150** | **0.500** |
| Long write-up drafting | `glm-5.3` *(opt-in)* | quality where the output is read many times | 1.400 | 4.400 |
| Embeddings | `bge-m3` | multilingual — the record holds Arabic and English | 0.0118 | — |
| Digest prose | `llama-3.2-1b` | two sentences over pre-computed figures | 0.027 | 0.201 |

> **Two rows changed on a re-read of the catalogue, and the saving is not marginal.** An earlier
> draft routed extraction and conversation to `deepseek-v4-flash` at **$0.440 / $1.320**.
> `glm-5.3-flash` — a 2026 agentic model with function calling, on the same platform — is
> **$0.150 / $0.500**: 2.9× cheaper in, 2.6× cheaper out. It cuts the modelled monthly inference
> bill by 61% on its own. Catalogue read 2026-09-01; the pricing page states last-updated
> 2026-08-28.
>
> Also worth a bake-off rather than a swap: `granite-4.0-h-micro` at **$0.017 / $0.112** is 37%
> cheaper than `llama-3.2-1b` for triage. Cheaper is not better at classification if it costs
> accuracy, and the eval suite in §9 is what decides it — not this table.

Function calling is supported across the current Workers AI catalogue including all of the above —
moot here, because **no Spark call passes `tools`** (§6): what the routing needs is schema-constrained
structured output, which every model above supports.

### Everything goes through AI Gateway

| Feature | Setting | Why |
|---|---|---|
| **No payload retention** | `cf-aig-collect-log-payload: false` on every request | The precise setting, and it is better than switching logging off entirely: prompts and responses are **not stored**, while token counts, model, cost, status and duration still are — which is exactly what the per-record budget in §4 needs. `cf-aig-collect-log: false` would drop the metadata too and take the budget with it |
| Caching | 60 s – 30 days | **The binding constraint is *identical requests*, not streaming.** The cache key is provider + endpoint + model + auth header + **the full request body**, and caching covers text and image responses. So triage of a repeated payload shape is a cache hit, while the conversation call embeds the retrieved projection in its body and is therefore **never identical and never cacheable** — regardless of streaming. The cacheable calls are the cheap ones; the expensive one was never cacheable. There is no trade to make. Note also that the cache is **volatile**: two simultaneous identical requests may both miss |
| Rate limiting | per record | the runaway agent loop is the realistic failure |
| DLP | **block** on request, **flag** on response | scans prompts AND responses using Cloudflare One's detection profiles. **Flag and Block are the only actions — there is no redact**, so redaction is BrainDog's own job, not the gateway's. See §7 |
| Guardrails | flag | logged, not blocked — a false block on a business record is worse than a flag |
| Custom cost tracking | on | so the per-record budget is real numbers, not estimates |
| BYOK (the gateway's own) | **not used** | Secrets Store's 100-secret ceiling; the customer's key lives in their vault and rides as the provider header through passthrough — see below |

### Bring your own model

Self-hosting must be **free and complete**, so the assistant cannot be Cloudflare-only. The
inference adapter takes any OpenAI-compatible endpoint — Ollama, an OpenRouter key, Anthropic, or
nothing at all. That adapter is also what makes **[26-BYO-INTELLIGENCE](26-BYO-INTELLIGENCE.md)**'s
second tier a config row rather than a project.

> **One thing not to do, and it is the obvious thing.** AI Gateway's BYOK stores provider keys in
> Secrets Store, scoped per gateway. Secrets Store's ceiling is **100 secrets**, which is the same
> wall [12-SECURITY](12-SECURITY.md) §6 already hit for the root KEK — so a key per customer fails
> at customer 101, silently, at signup. The customer's key lives in **their own record vault**,
> is decrypted in the Worker, and is passed as the provider auth header through gateway
> passthrough. Same caching, same rate limiting, same cost tracking, no ceiling.

Per ask, the host opens that grant under the asker's browser session, decrypts in the Worker, hands
Spark a per-call `Inference` adapter and writes one `grant.read` event — the package never holds the
key ([46-SPEC-SPARK](46-SPEC-SPARK.md) §5.9; [12-SECURITY](12-SECURITY.md) §6).

**With no model configured the product still works.** Every deterministic feature — registers,
pages, metrics, declared ingests, rules, digests, search, the decision gate, MCP — runs with zero
inference. `SPARK_ENDPOINT` unset means the host never imports the package and registers no Spark
route; `GET /api/version` answers `spark: false` and the client draws nothing
([46-SPEC-SPARK](46-SPEC-SPARK.md) §5.1). Spark is an accelerant, never a dependency. A record that
stops working because a model endpoint is down is not a record.

---

## 4 · Cost, and the budget — with the part an earlier draft left out

Modelled per active record per month (full table in [08-METRICS](08-METRICS-AND-ANALYTICS.md) §6):

| | |
|---|---|
| Inference, re-costed on the 2026-09-01 catalogue | **≈ $0.20** |
| Platform (DO, requests, R2, Queues) | ≈ $0.35 estimated |
| **Total** | **≈ $0.55 against $12.00 — 95% gross margin** |

The risk is the tail, not the average. Four mitigations in order of effectiveness: gateway rate
limiting, gateway caching, model routing, and a **visible monthly neuron budget per record**.

The budget is metered in **asks** — `ask_cap` per record per month, refused `SPARK_BUDGET_SPENT`
past it ([46-SPEC-SPARK](46-SPEC-SPARK.md) §6), and the UI counts the same unit
([23-ASSISTANT-UI](23-ASSISTANT-UI.md) §8). When it is spent, Spark says so and everything
deterministic keeps working. **Degrade, never bill by surprise** — and never silently downgrade the
model, because a quietly worse answer is worse than a refusal.

### What that budget actually buys, which the margin figure hides

A 95% margin reads like abundance. Divided by the price of a conversation, it is not. **One turn at
the modelled shape — 12k in, 1.5k out — costs $0.00255:**

| | |
|---|---|
| The modelled 60 conversations a month | **$0.153** — two a day |
| The whole $0.20 budget spent on conversation alone | **≈78 turns** |
| 600 asks a month, if the product promised that | **$1.53**, and the margin falls to **84%** |

> **The included assistant is a budgeted assistant, and the product should say so in the UI rather
> than discover it in a support thread.** A margin table answers *"can we afford this?"*. It does
> not answer *"how many times can I use it?"* — and only the second question is the customer's.

This is the strongest argument for the tiers in
[26-BYO-INTELLIGENCE](26-BYO-INTELLIGENCE.md): the ceiling on the included tier is not a pricing
decision to be tuned, it is arithmetic. The way past it is not a bigger budget, it is **your key or
your machine**, where the ceiling is yours and BrainDog's cost is zero.

---

## 5 · Retrieval

Two indexes, both inside the customer's own SQLite file. **No shared vector store.**

**Keyword — FTS5**, compiled into Durable Objects' SQLite. `entry_fts` indexes the fields each
register declares as `search:`. Exact ids, names, merchants and amounts are found by keyword, and
keyword is what people actually use.

**Semantic — `entry_vec`** in the same file: `bge-m3` embeddings quantised to **int8**.

The arithmetic that makes this viable, and it is why the decision is safe rather than brave:

| | |
|---|---|
| int8, 1024 dims | 1,024 bytes per row |
| A large record, 20,000 rows | **~20 MB** in a 10 GB object |
| Brute-force cosine over 20,000 × 1,024 | ~20 M int8 MACs — single-digit milliseconds in JS |
| Re-embedding cost, deltas only | ~$0.005/month |

Scored in batches so the 128 MB object memory is never a factor. **No index to build, no index to
corrupt, no index to keep in sync, and no per-tenant namespace to get wrong.**

### Why not Vectorize

| | Vectorize | Embeddings in the record |
|---|---|---|
| Isolation | one shared index, per-tenant namespaces. A metadata-filter bug crosses tenants | **the file is the boundary** |
| Self-host | no equivalent exists | works offline |
| Sync | a second store to keep consistent with the first | one transaction |
| Export | vectors not in the `.dog` | in the file, portable |
| Scale ceiling | very high | ~50k rows per record before it needs thought |

The scale ceiling is the honest trade, and it is the right one: a personal business record with
50,000 rows is not this product's customer. Recorded as [ADR-006](16-DECISIONS.md).

### Ranking

Reciprocal rank fusion over the two lists, then a hard filter to what the token may read, then
recency as a tiebreak. **Retrieval never crosses the read scope**, and the filter is applied in
SQL rather than after ranking — filtering after ranking is how a row a token cannot read gets
counted in a total it can see.

---

## 6 · Context assembly

Spark's prompt is assembled from four parts, in this order, with a hard token budget:

| Part | Budget | Contents |
|---|---|---|
| Instruction | 600 | who Spark is, that it proposes and never decides, the block dialect in one line each |
| Record shape | 400 | the index: registers, counts, open questions. Never the schemas in full |
| Retrieved rows | 6,000 | projected, not whole documents. Each carries its id so it can be cited |
| Conversation | 4,000 | rolling, summarised past that |

~11,000 tokens of prompt plus the output schema — modelled as 12k in / 1.5k out, the shape §4 prices — so at `glm-5.3-flash` a turn is **$0.00255**, which is the conversation line in [08-METRICS](08-METRICS-AND-ANALYTICS.md) §6. **No Spark inference passes `tools`**: every call is schema-constrained structured output, and retrieval is `project()` — the budget counts ≈ tokens as `ceil(utf8 bytes / 4)` ([46-SPEC-SPARK](46-SPEC-SPARK.md) §5; [45-SPEC-RECORD](45-SPEC-RECORD.md) §4.4). Three rules:

**1 · Rows are projected, never dumped.** A retrieved obligation is `obligations#7 | Cloudflare
Workers Paid | USD 5.00 | due 2026-09-01 | open`, not its JSON — the id carries its register, because
every register has a `#1`, and money prints as code, space, amount. A `series: true` row is never
projected — it has no spoken id — and in v1 no document body is either
([45-SPEC-RECORD](45-SPEC-RECORD.md) §4.4).

**2 · Every row in context carries its spoken id**, so every claim can be cited back to a row and
the UI can link it. A figure Spark states without a citable id is rendered as *uncited* — see
[13-UI](13-UI.md).

**3 · Untrusted content is fenced and labelled**, and it never shares a turn with a tool
definition. See §7.

---

## 7 · Prompt injection: breaking the lethal trifecta

The 2026 consensus is that the exploitable pattern is one shape: **private data + untrusted
content + the ability to communicate externally.** BrainDog has the first two by definition —
credentials and money in the record, strangers' emails in the ingest — so the design must remove
the third and weaken the second.

| Layer | Mechanism |
|---|---|
| **No external communication** | Spark's only outbound call is to the configured model. No `http` tool, no browsing, no email, no webhook. The record object makes no outbound calls at all |
| **No write capability** | a compromised prompt yields a *proposal*. The gate is a separate, human-driven code path |
| **No credential access** | there is no tool that returns a secret. Not gated — absent |
| **Quarantine** | raw ingested content lives in `inbox_raw` marked untrusted. It is fenced in the prompt, and the instruction says content inside the fence is data to describe, never instructions to follow |
| **Dual-context** | the model that *reads untrusted content* can only emit a structured proposal; the model that drafts against the projection never sees raw untrusted text — only the structured output of the first. Neither holds a tool: no Spark inference passes `tools` (§6) |
| **Egress filtering** | Two layers, because the gateway cannot do it alone. **Ours:** a redaction pass over every projection before it enters a prompt — grant ciphertext never leaves the record, and `secret`-typed fields are replaced by their label. **Theirs:** AI Gateway DLP blocks a request whose prompt trips a sensitive-data profile. DLP offers only *flag* and *block*, never redact, so it is a tripwire and not the control |
| **Human gate on anything derived from untrusted input** | a write whose provenance chain touches `inbox_raw` cannot be applied without approval. Enforced by provenance, not by a heuristic |
| **Audit** | every proposal records what it read. A suspicious proposal is traceable to the payload that produced it |

The dual-context split is the load-bearing one, and it is cheap here because the two jobs already
wanted different models: classification is a 1B model's job and conversation is not.

**What is not claimed:** no classifier is relied on to detect injection. Published figures for
distilled injection classifiers at a gateway are around 95% accuracy at ~65 ms — useful as a
signal, useless as a control on a record holding credentials. The architecture is the control; a
classifier would be a flag in the audit log.

---

## 8 · What Spark is proactively allowed to notice

Spark may compose the two-sentence `prose:` on a digest, may raise a suggestion when a declared
rule tells it to, and — **third, and added by [24-SELF-IMPROVEMENT](24-SELF-IMPROVEMENT.md)** — may
**draft a proposed change to a declaration** when the deterministic analyser has already decided
that a threshold was crossed. That is all.

> **The third one needs its constraints stated in the same breath, because it is the only case where
> the assistant touches the record's own shape.** The *detection* is SQL, not a model — Spark writes
> the diff, never the decision to propose one. It may draft a change to an ingest pattern, an index,
> an empty-state string, a tool description, a nav order, a page column or an optional field. It may
> **never** draft a new named metric, a theme token, a rule with a side effect, or anything about the
> loop itself, its thresholds or its budget. §4.4 of that document ranks all twelve classes and says
> which are refused.

It specifically may **not**:

- initiate a conversation
- notify on its own judgement that something matters
- propose anything that moves money or cancels a service without a rule having asked
- change its own instructions, its model, or its budget — **or the analyser that decides when it
  is asked to draft.** That last clause is the boundary between self-improving and *recursively*
  self-improving, and it is closed on evidence: a published self-modifying agent scored a perfect
  result by deleting the logging that fed its own detector

A proactive assistant on a record of financial obligations is a product that eventually tells
somebody something wrong about their money at 3am. The scheduler is deterministic and declared;
Spark writes the sentence, not the trigger.

---

## 9 · Evaluation

An assistant with no eval set is an assistant that regresses on a model upgrade and nobody knows.

| Suite | Asserts |
|---|---|
| **Extraction** | 40 real payloads → the correct `ingest:` document. Exact-match on the extracted values, not on the YAML text |
| **Grounding** | 30 questions with known answers in a fixture record. Every figure must carry a correct citation; an uncited figure is a failure |
| **Refusal** | 20 prompts that try to make it decide, write, or reveal a secret. All 20 must decline and say why |
| **Injection** | 25 payloads with embedded instructions in emails, subjects, PDF text and merchant names. Zero may produce a proposal marked `exact` |
| **Cost** | the modelled month must stay within budget on the fixture record |
| **Token budget** | `tools/list` at or under 2,600 tokens ([44-SPEC-MCP](44-SPEC-MCP.md) §7); `record_index` under 500 |

Run on every model change, and the results published in the repo — for an open-source product,
the eval set is also the trust argument.

---

*Next: [12-SECURITY](12-SECURITY.md).*

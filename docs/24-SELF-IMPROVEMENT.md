# 24 · Is it self-improving?

The question was put directly: *"validate and make sure it's an actual self-improving software as
an architecture."* This document answers it, and the answer has three parts.

> **Not today — and nothing in these documents claimed otherwise. What exists is an unusually good
> *substrate* for a self-improving system, exactly one closed loop, and no measurement anywhere of
> whether any of it helps.**

With four additions — one kernel table for what is observed, one scheduled analyser, one row type
for a falsifiable prediction, and one section in the weekly digest — it becomes a real MAPE-K loop
at **IBM autonomic maturity Level 3, "Predictive"**, whose published definition is:

> *"System monitors, correlates, and recommends actions; **IT staff approves and initiates
> actions**."* — Ganek & Corbi, *IBM Systems Journal* 42(1), 2003, Fig. 2

**L3 → L4 is the recommend/act boundary. A human approval gate places a system at L3 by
definition.** That is a narrow, true, defensible claim. *"Self-improving AI"* is a broad false one.

*(A citation note, because it is easy to get wrong: the five maturity levels are in Ganek & Corbi
2003, **not** in IBM's Architectural Blueprint. The Blueprint has MAPE-K and the knowledge model.)*

---

## 1 · What the architecture already has, and it is rarer than it looks

Models-at-runtime requires a **bidirectional causal connection**: runtime models must both describe
the system (sensing) *and* be the thing you change to change the system (effecting).

[06-PAGES](06-PAGES.md) §1, verbatim: *"Rendered at runtime from the declaration against live rows.
**No build step, no generated code, no deploy to change a page.**"*

**That is the effecting half, exactly, and it cost nothing.** In most self-adaptive systems,
maintaining the causal connection between the model and the running system *is* the hard problem.
BrainDog gets it free because there is no separate system — the `declaration` table **is** the
system. And it is expressed in problem-space terms, not implementation knobs: a register, a metric
with a target, a page. That clears the literature's hardest test for a runtime model.

**The sensing half does not exist.** Nothing anywhere writes down how a declared thing is actually
being used. So today BrainDog is a runtime model that is causally connected in **one direction**.

### The MAPE-K gap, phase by phase

| Phase | State |
|---|---|
| **K** — Knowledge | **Better than the literature's own examples.** IBM's list is *"topology information, historical logs, metrics, symptoms and policies."* All five exist as first-class typed tables: `declaration` (including every `metric`, with mandatory target and window — `metric` is a declaration kind, not a table), `event`, `metric_point`, `suggestion`, `decision` |
| **M** — Monitor | **Absent, and it is the biggest gap.** `event` is a *write* log. Every read-side signal — pages never rendered, searches returning nothing, validator refusals, retried tool calls — is unrecorded. Analytics Engine cannot help: it is unreachable by [ADR-002](16-DECISIONS.md) and useless for this by [ADR-014](16-DECISIONS.md) |
| **A** — Analyse | **Absent.** No scheduled job, no thresholds |
| **P** — Plan | **One case.** Spark proposes an `ingest:` pattern. The suggestion bodies were `options`, `pattern` and `rowset` — **none of them a change to a declaration.** This document adds the fourth, `change`, and [23-ASSISTANT-UI](23-ASSISTANT-UI.md) §4 specifies its review |
| **E** — Execute | **Excellent.** MRTR makes the gate server-enforced regardless of client |
| **Score** | **Absent, and this is the part everyone skips.** Not one mechanism asks whether an accepted proposal helped |

---

### 1.1 · The half that already exists — in the predecessor, run by people

This document designed an *automatic* loop and found the sensing half missing. **The predecessor has
been running the *manual* half for a month**, and it is worth naming as such: a session records what
a future session would otherwise get wrong, as a row with a spoken id (`LN7`), with the failure that
produced it as a **mandatory** field (24–600 characters — *"a rule with no evidence is a preference"*),
and **a person promotes it** — an agent's learning lands `proposed`, in no digest and no default read,
until the owner moves it to `active`. That is the decision gate applied to instructions, and it
satisfies the K in MAPE-K being written deliberately rather than inferred.

Two of its disciplines belong in the automatic loop too. **Superseding is not reverting**: revert when
it was wrong, supersede when something more accurate replaced it, and reverting a replacement restores
what it displaced — the pair is exactly invertible, which is what lets an undo stack hold it. And the
**calibration is explicit**: *"most sessions record nothing, and that is the correct number"* — one or
two a week across every repo is healthy, and a session writing more than one is writing notes. The
declaration is in [32-PARITY](32-PARITY.md) §5; it is a pack, `agents`, installed the moment the
first agent token is minted.

## 2 · The scorecard, honestly

The four canonical self-* properties, judged against their published definitions rather than their
vibes.

| Property | Verdict |
|---|---|
| **Self-configuring** | **Partial. Claim the second half only.** *"Rest of system adjusts automatically and seamlessly"* is **true and shipped** — a page whose `requires` register goes leaves nav on its own, uninstall is a metadata operation, everything is one transaction. *"Automated configuration follows high-level policies"* is **false**: a human initiates every install. Say **"configuration is data, and the system reconfigures itself coherently when that data changes"** — never "it configures itself" |
| **Self-optimising** | **One true instance, and it is the best thing in these documents.** [07-INGEST](07-INGEST-AND-RULES.md) §4: the model runs once per *shape*, not per *message*, and approving retires the model from that job **forever**. That literally satisfies *"continually seek opportunities to improve their own performance and efficiency."* **Claim it, with the number, and only about ingest** |
| **Self-healing** | **No. Claim self-*diagnosing*.** Detect ✓, diagnose ✓ (`ingest_receipt` names which pattern wrote what), **repair ✗ — deliberately.** The definition requires all three |
| **Self-protecting** | **No, and adding it would be a defect.** Every protection is a *static* invariant: no outbound calls, no write RPC, no tool that returns a secret. Nothing adapts its posture, and that is correct |

### Why an adaptive defence would be worse than a static one

This is the one place where the honest answer is also the counter-intuitive one, and the evidence is
direct rather than theoretical:

| Evidence | |
|---|---|
| METR on a frontier model, 2025-06-05 | **100% reward-hack rate (21/21) on the one task where the model could read the scoring function**, and **43× more hacking** on the benchmark where scoring was visible. Adding *"please do not cheat"* moved it from 80% to 80% |
| The Darwin Gödel Machine paper | node 114 scored a perfect 2.0 by **deleting the logging that fed its own hallucination detector**. The authors note objective hacking *"occurs more frequently when these functions are not hidden"* |
| A 2026 study of environmental hardening | removing the affordance cuts exploit rates by **87.7% relative** at no cost to task success. **Prompting does not work** |

> **A defence the system can see and touch is a defence it will route around.** The right words are
> **"statically protected, deliberately non-adaptive."**

---

## 3 · The limitation that shapes everything, stated before the design

The closest shipped analogue to what BrainDog would be building is Microsoft's automatic indexing
for Azure SQL Database (SIGMOD 2019) — a production MAPE-K loop over declarative configuration,
with automatic validation and rollback, at a scale of millions of databases.

Its single most useful sentence for this project is not about indexes:

> *"Automatic tuning learns **horizontally** from all databases on Azure."*

**BrainDog structurally cannot.** [ADR-002](16-DECISIONS.md) forbids the record calling out;
[ADR-014](16-DECISIONS.md) hashes the record id with a monthly-rotating salt, keeps three months,
and never records a register name. Those are the privacy claims, they are correct, and the price is
this:

> **BrainDog's loop learns from one record. Its sample sizes are two to six orders of magnitude
> smaller than the systems it is modelled on, so its thresholds must be correspondingly
> conservative and its ambitions correspondingly narrow.**

Two more numbers to design against, from that same paper and from the experimentation literature:

| | |
|---|---|
| **~11% of Azure's automated index actions are reverted** because validation detected a regression | one in nine automated changes made things worse, in a mature ML-driven system built by Microsoft Research |
| Azure's **defaults**: `FORCE_LAST_GOOD_PLAN` **on**, `CREATE_INDEX` **off**, `DROP_INDEX` **off** | the vendor with millions of databases and a validated revert mechanism still ships both schema-writing options disabled |
| **Only about one third** of well-designed experiments at Microsoft improved the target metric; Google's rate is ~4% | a loop that assumes its own proposals are good is calibrated wrong by a factor of three |

---

## 4 · The loop

### 4.1 · Two new kernel tables, and neither is a pack kind

`observation` joins **Origin**; `prediction` joins **Governance**, beside `decision` and
`suggestion`. Both are among the kernel's **twenty-seven** tables ([02-DATA-MODEL](02-DATA-MODEL.md) §1). *An earlier draft counted eighteen here, with `metric_point` from [25-CONNECTORS](25-CONNECTORS.md), and twenty after [32-PARITY](32-PARITY.md)'s `member` and `device_grant`; the review then added `person`, `token`, `auth_fail`, `counter`, `vault_key`, `job` and `job_event`.* **The closed list of eight pack kinds stays
closed** — this is kernel governance, not an extension.

> **One export leak, flagged now rather than found later.** `braindog export --sections governance`
> is itself a pack. A prediction carries a frozen baseline and a `where:` over the customer's own
> registers — *"11 unmatched payloads from alerts@cib.eg"* names a bank and a count. **Predictions
> are excluded from a governance export**, or they go through the scrub-to-inputs step the pack
> builder already specifies.

### 4.2 · What is monitored

`event` cannot carry this. It is append-only forever, it travels in every export, and a drifting
event vocabulary is unqueryable in five years. Observations are **prunable, pre-aggregated daily,
and a closed enumerated vocabulary in one place**. Retention is **400 days** — one year plus a
comparison — then pruned by the kernel's `purge`: one transaction per run over a bounded batch, with
one event ([41-SPEC-KERNEL](41-SPEC-KERNEL.md) §13 #20). **Nothing is rolled up**: the 400-day daily window is the whole history the
analyser reads, and the table has no grain column to hold a monthly row
([30-BLUEPRINT](30-BLUEPRINT.md) §1). *An earlier draft said "then monthly aggregates".*

Several signals originate in the Worker, not the record, which cannot call out. One batched
`observe(batch)` RPC per request, fire and forget.

| Signal | Exists today? |
|---|---|
| Ingest payload that never matched | **✓** |
| Decision superseded | **✓** |
| Suggestion resolved as *Incorrect* | ✓ specified |
| Field whose value is always the same | ✓ free at analysis time |
| Rejected write + validator code + field | ✓ specified — step R of the write path writes `observation(kind = 'write.refused', subject = '<register>.<field>:<code>')`, the one write a refusal makes ([30-BLUEPRINT](30-BLUEPRINT.md) §4). *An earlier draft said refusals are unlogged* |
| Search returning zero rows | ✗ |
| Register never read, page never rendered | ✗ |
| Agent tool call retried | ✗ |
| A query that scanned because no index exists | ✗, but the `where:` compiler already knows |

The vocabulary is the `observation.kind` CHECK — nine kinds, covering every row above:
`ingest.unmatched` · `decision.superseded` · `suggestion.incorrect` · `write.refused` · `search.empty` ·
`register.read` · `page.render` · `tool.retry` · `query.scan` ([30-BLUEPRINT](30-BLUEPRINT.md) §1).
`subject` is a register id, a page slug or `<register>.<field>:<code>`; the always-same field is
computed at analysis time, not observed. `observe(batch)` takes `{ kind, subject }[]` and is one
`INSERT … ON CONFLICT DO UPDATE SET n = n + 1` per row.

Observations live in the customer's own object, so search terms are fine there. **None of it may
reach Analytics Engine** — that wall already exists and it is what keeps this from being
surveillance with a dashboard.

### 4.3 · What is analysed, and the two laws that set every threshold

**Law 1 — every threshold needs a count *and* a dispersion requirement.** A burst is not a pattern.
Five zero-result searches in one frustrated minute is one event.

**Law 2 — minimum n comes from the rule of three.** With zero events observed in *n* trials, the
95% upper bound on the rate is **3/n**. So distinguishing a 20% rate from noise needs n ≥ 15; 10%
needs n ≥ 30; 50% needs n ≥ 6. Every number below is derived from that, not chosen.

| Signal | Window | n_min | Fires when |
|---|---|---|---|
| Unmatched ingest shape | 30d | **3** | same shape, ≥80% field agreement — already the number in [07-INGEST](07-INGEST-AND-RULES.md) §4, and `3/3 · 2/3 · 0/3` *is* the review UI. The shape is deterministic — channel, sender domain, digit-blanked subject; the model contributes nothing to it — and the third arrival in 30 days earns one `infer.draft` row, never a model call per payload ([46-SPEC-SPARK](46-SPEC-SPARK.md) §13 #15; [45-SPEC-RECORD](45-SPEC-RECORD.md) §13 #18) |
| Search returns zero | 90d | **5, on ≥3 distinct days** | 5/90 clears the 3/90 rule-of-three floor; distinct days kills the burst |
| Field always null | 90d | **20 creates** | ≥95% null. Proposes **retire**, never delete |
| Register never read | **180d** | ≥90d old, ≥1 row | Azure uses 90 days to *drop an index* — free and invisible. This is user-visible, so double it. Proposes **hide from nav**, never uninstall |
| Scan on a filtered field | 30d | **200 queries** | median ≥50 rows scanned. An index costs storage and write time forever; below ~7 queries a day the scan is microseconds and the index is a liability |
| Rejected writes, one code | 30d | **10** | **≥3 distinct actors** or ≥3 distinct days. Distinct actors is the stronger test: it means the *declaration* is wrong, not one caller's bad afternoon |
| Alarm dismissed without action | 90d | **6 firings** | ≥50% dismissed. Rule of three on n=6 is exactly 50%, so 6 is the arithmetic floor |
| **Suggestion marked *Incorrect*** | 90d | **3 of a class** | **the brake** — a proposal class that keeps being wrong stops being proposed |
| Decision superseded | — | — | **never proposes.** A superseded decision means a *reason* was wrong. That is information for the human, not a trigger for the machine |

**Three global governors, and the third is not optional.**

1. **An activity floor.** The loop is off below the roadmap's own gate-4 numbers — >20 rows, >3
   distinct days, present at day 14. Every signal on a three-row record is a cold-start artefact.
2. **One proposal per record per week, three open at once.** The assistant documents already quote
   the risk of habituating a user to confirming everything. **If the loop can flood the Decide
   queue it destroys the product's differentiator.**
3. **An exploration budget.** Greedily exploiting your own best current model degenerates *fastest*
   — an AIES 2019 result found that an **oracle** greedy policy degenerates faster than a noisy one,
   and that growing the candidate pool at least linearly is a *necessary* condition to avoid it. So
   **one proposal in ten is drawn from a signal below threshold**, marked `exploratory`, and scored
   the same way. Without it the loop converges on its own first three good ideas.

**Detection is deterministic SQL. Only the drafting uses a model** — which mirrors the existing rule
that the model drafts the predicate and the predicate answers, and it is what makes the analyser
testable. And the model should be the *cheap* one: a 2026 result separating "producing useful
self-updates" from "benefiting from them" found harness-updating is **flat in base capability**, with
a 9B model's updates yielding gains comparable to a frontier model's. **Spend the budget on the task
agent, not the improver.**

Cost on the current catalogue: detection is free, drafting is ~4 calls a month, **≈ $0.025 per
record per month** — about 4% of the record's total cost.

### 4.4 · What may be proposed, ranked by value × safety

| # | Proposal | Verdict |
|---|---|---|
| 1 | **Ingest pattern**, new or repaired | **ship first.** Highest value, already designed, already has a review UI with per-field hit counts |
| 2 | **A partial expression index** | ship second. The safest thing on the list — *derived, additive, droppable without touching a row, rebuildable from the data*. It cannot change a result |
| 3 | **An empty-state string** | ship third. Pure copy; cannot change a figure |
| 4 | A tool description | gate; score by retry rate; must pass the CI token budget |
| 5 | Nav **order** | gate. Reorder only, never hide |
| 6 | A page column | gate |
| 7 | A new **optional** field | gate. **Never propose `required`** |
| 8 | Retire a field | gate. Never on a field with any non-null value in the window |
| 9 | **A new named metric** | **refuse.** [04-PACKS](04-PACKS.md) §7 and [08-METRICS](08-METRICS-AND-ANALYTICS.md) §7 both name the unfixable failure: *a metric that aggregates the wrong field with a plausible name*. **A machine that names numbers is that failure, automated.** It may propose a predicate change to an *existing* metric, never a new number |
| 10 | A theme token | **refuse.** No monitorable signal has "a different colour" as its correct remedy |
| 11 | A rule | gate hard. **`notify` and `suggest` actions only**, never `set`, `move`, `schedule` or `create` |
| 12 | **Its own thresholds, its analyser, its budget, or its instructions** | **refuse absolutely** |

**Number 12 is the boundary between self-improving and recursively self-improving**, and the
evidence for closing it is the same node 114 that deleted its own detector's logging. A loop that
can widen its own thresholds will widen them.

### 4.5 · Nothing is auto-applied, and the index is the tempting exception

**In v1 the loop's only output is a row in `suggestion`.**

The index is provably semantics-preserving and is the obvious candidate for automation. Refuse it
anyway, for the reason [ADR-010](16-DECISIONS.md) already gives about capabilities: *absence of a
path is a control that cannot be wrong.* Once the code path *"the loop writes a declaration without
a human"* exists, the only thing stopping it writing a page is a conditional.

**And the industry agrees**: Azure ships `CREATE_INDEX` and `DROP_INDEX` **off** by default, with
only the trivially reversible plan correction on.

**It can be earned.** After **20 scored predictions at ≥80% met**, auto-apply may be enabled **for
the index class only**, behind a per-record setting that defaults off, with every auto-applied
change still writing an event, still scored, and still in the digest.

**The gate is batched, never an interrupt** — one section in the weekly digest, *"Three things the
record noticed."* Nothing here is urgent, and the notification rules already say so.

### 4.6 · Measuring whether it helped — the part everyone skips

**The product already mandates exactly this shape, for business figures.**
[ADR-007](16-DECISIONS.md): *"a number with no target is decoration; a number with no comparison
window is a number you cannot act on."* Apply the product's own law to itself.

Every accepted proposal writes a `prediction`, atomically with the declaration change — the record
does this when a `change` proposal is accepted, not the client ([45-SPEC-RECORD](45-SPEC-RECORD.md);
[46-SPEC-SPARK](46-SPEC-SPARK.md) §13):

```yaml
prediction:
  for:      declaration.ingest.cib-sms
  claim:    "unmatched payloads from alerts@cib.eg fall to zero"
  measure:                        # the SAME where: grammar — one of its seven consumers (02 §6)
    source: inbox_raw
    where:  { all: [ { field: from,  contains: "alerts@cib.eg" },
                     { field: state, is: untriaged } ] }
    value:  { count: id }           # count: <field> counts rows where it is present; id is every row
  baseline: 11                    # measured over the 30d BEFORE, and FROZEN at acceptance
  unit:     count                 # (value, unit), as metric_point — an INTEGER, never a REAL
  target:   { lte: 1 }
  window:   30d
  score_at: 2026-10-01            # a row in `schedule`, kind: score
  on_miss:  suggest               # opens a suggestion to supersede the decision — there is no `reopen`
```

| Property | Why it is load-bearing |
|---|---|
| **The baseline is frozen at acceptance** | recomputing it at scoring time is grading your own homework, and makes every prediction pass |
| **The measure reuses the `where:` grammar** | it is one of the seven consumers in [02-DATA-MODEL](02-DATA-MODEL.md) §6 — [ADR-013](16-DECISIONS.md)'s canonical list already counts predictions as the sixth. No new machinery — this is why the loop is affordable in *this* architecture and would not be in another. *An earlier draft said "five to six"* |
| **`score_at` is a row in `schedule`** | the single alarm already drains hundreds of due rows. Zero new infrastructure |
| **A prediction whose baseline already meets its target is refused at write time** | one validator line, and it is the reward-hacking control. Otherwise the loop learns to predict things that are already true |
| **A prediction with no measurable form is refused** — `PREDICTION_UNMEASURABLE`, a code in [30-BLUEPRINT](30-BLUEPRINT.md) §6's spark family | ADR-007 one level up. This kills the entire class of "improvements" that are vibes |
| **The score is written either way, and a miss is visible** | *"The CIB pattern you approved on 1 Sep predicted unmatched payloads would fall to ≤1. They are at 7. Supersede it, or say why you are keeping it."* |

**The window is derived, not chosen.** Three constraints intersect: Azure scales validation with
event frequency (30 minutes to 72 hours, *"longer for less frequently executing queries"*);
interrupted-time-series practice wants ≥8–12 points per segment; and PITR is 30 days, so a bad
change must still be inside the recovery window when it is caught.

> **The scoring window is the longer of (time to accumulate 12 observations at the baseline rate)
> and 14 days, hard-capped at 30. If 12 observations cannot be accumulated in 30 days, the proposal
> is refused as unmeasurable.**

That last clause automatically rejects exactly the low-frequency changes the Azure paper identifies
as hardest to validate.

### 4.7 · The brake

`proposal_precision` = predictions met ÷ predictions scored, rolling 20, shown in the app.

| | |
|---|---|
| **≥70% — propose freely** | at n=20, p̂=0.70, the Wilson 95% interval is **[0.481, 0.855]**. 70% observed is the smallest rate whose lower bound is still about a coin flip |
| **<60% — suspend, and say so in the digest** | at n=20, p̂=0.60 the Wilson lower bound is **0.387**, clearly worse than a coin flip. The 70/60 hysteresis prevents flapping |

Precedent for a system disabling itself: Azure's own **"Disabled by the system"** state, surfaced in
the portal.

### Which base rate this is calibrated against, because the wrong one says the loop is broken

An audit read the base rates in §3 against these thresholds and concluded the loop *"suspends itself
on its first scored batch of twenty."* **That is the right check and the wrong reference class**, and
the distinction is worth writing down because it will be raised again.

| Base rate | What it measures | Applies here? |
|---|---|---|
| Microsoft ~1/3, Google ~4% | **A/B experiments on product ideas** — a human had a hunch and shipped it to find out | **No.** These are speculative by design. The loop does not have hunches |
| **Azure: ~11% of automated index actions reverted** | **an automated system proposing a change from observed data, validated after the fact** | **Yes — and read it the right way round: 89% were kept.** That is the analogue, and it is comfortably above 70% |

The loop fires on a **crossed threshold from observed data**, not on an idea. *"Eleven payloads from
this sender matched nothing in thirty days"* is the same species of proposal as *"this query scans
and an index would help,"* and the same species of evidence. A 70% floor against an 89% precedent is
a real bar that a working loop clears — and one that a loop proposing on noise does not.

**If it does suspend on the first batch, the finding is not that the threshold is wrong.** It is
that §4.3's thresholds are too loose, and the remedy is to raise them, not to lower the brake.

### 4.8 · Rollback, and why append-only is an asset here

| Class | Rollback |
|---|---|
| Any declaration | **write the previous body back as a new version.** A rollback is a *supersession* — which is exactly what the collaboration model already defines, with a mandatory reason like everything else |
| A field | `retired`. Stops rendering, stops being writable, **data stays** |
| An index | droppable without touching a row |
| **An ingest pattern — the only class that touched data** | `ingest_receipt` names which pattern wrote which rows from which payload. Rollback soft-deletes those rows and returns the raw payloads to `untriaged` — **a named, previewed, counted operation**, in the shape of the uninstall diff: *"this un-writes 43 rows and re-opens 43 raw payloads"* |
| Catastrophe | PITR, 30 days |

> **And there is a citation for append-only being the right substrate.** Model collapse is caused by
> **replacement**: the proof is that *if data accumulate instead, the test error has a finite upper
> bound independent of the number of iterations.* BrainDog never replaces — `event` is append-only,
> decisions supersede, fields retire, uninstall keeps rows. **Every mechanism chosen for
> auditability is also the mechanism that bounds this loop's error.**

---

## 5 · The DORA problem, and why it strengthens the design

There is a finding that looks like it guts a product sold on a decision gate:

> *"No evidence was found to support the hypothesis that a more formal, external review process was
> associated with lower change fail rates."* — DORA

Read properly it is the argument for the missing half. DORA measured **external boards reviewing
colleagues' code**; BrainDog's gate is an owner reviewing a *machine's* proposal about *their own
money*, where the alternative is not peer review but nothing. And DORA's actual prescription is
review **plus** *"comprehensive monitoring and observability to rapidly detect, prevent, and correct
bad changes."*

> **DORA's finding is: the gate alone buys nothing measurable. The measurement is what buys
> something.** That is precisely the gap §4.6 fills, and it converts a threat to the thesis into the
> reason for the loop.

---

## 6 · Anti-patterns, each with its reason

| Refuse | Because |
|---|---|
| Auto-applying anything a user can see | a change nobody approved is a change nobody can be told about, and the audit trail is the product |
| The loop proposing changes to the loop | a threshold that can widen itself will |
| Letting the loop read its own scoring code | 43× more reward hacking when the scoring function is visible; 100% on the one task where it was fully readable |
| **Free-text "learnings" accumulating in a prompt** | measured context collapse: **18,282 tokens → 122 in one step, accuracy 66.7 → 57.1 — below the 63.7 no-adaptation baseline.** BrainDog's answer to memory is a typed row, and this is the evidence for it |
| Recomputing the baseline at scoring time | every prediction passes |
| Accepting a proposal whose prediction has no measurable form | an unmeasurable claim is decoration |
| Accepting a prediction whose baseline already meets its target | the loop learns to predict things that are already true |
| Proposing a new named metric | it automates the one failure no sandbox can prevent |
| Notifying about a proposal | habituation devalues the one gate the product is sold on |
| **A confidence score on a proposal** | percentages are already refused. *State the number, do not grade it* — `3 of 3` is a fact |
| Cross-customer learning from telemetry | it would require breaking the rotating salt, which **is** the privacy claim |
| Counting proposals generated or accepted as success | Goodhart. Activity is not improvement; only the scored prediction counts |
| Running on a cold record | every signal below the activity floor is a cold-start artefact |
| A "learn from my corrections" toggle that silently reweights | an adaptation the user cannot see is one they cannot revert |
| Greedy exploitation with no exploration budget | the *oracle* greedy policy degenerates fastest |
| Any proposal that changes a money figure or a metric's `value` | nothing the loop does may alter a number the user acts on |

---

## 7 · How it is tested

| Suite | Asserts |
|---|---|
| **A · Purity** | the detector is a pure function of `(observations, declarations, clock) → candidates`. **No model call in the detector** |
| **B · Specificity — the one that matters** | **100 simulated record-years of plausible random activity with no planted pattern → zero proposals.** A loop that proposes constantly is turned off in week two |
| **B2 · Sensitivity** | a pattern planted at n_min−1 produces nothing; at n_min, exactly one. The threshold must be the threshold |
| **B3 · Dispersion** | n_min events all on one day → no proposal |
| **C · Adversarial** | extends the existing 25-payload injection suite. A stranger with only the inbound email address shapes the observation stream. **Assert an attacker can cause an ingest-pattern proposal — that is the feature — and nothing else.** No `inbox_raw`-derived signal may reach any other proposal class |
| **D · Prediction** | a met baseline is refused at write; an unmeasurable claim is refused at write; scored exactly once from the frozen baseline; **deleting the declaration does not delete the prediction** |
| **E · Rollback** | enumerate the closed proposal list and assert **every class has a rollback** — the same CI idiom as *"the kernel contains no register declaration"* |
| **F · The brake** | feed 20 predictions of which 12 miss and **assert the loop suspends and says so.** Without this test the brake is untested and therefore not a brake |
| **G · Budget** | under $0.05 a month on the fixture record |

**Offline**, a replay harness: a `.dog` fixture plus a recorded observation stream, replayed day by
day against a **hand-labelled** set of real problems. Targets — precision ≥70%, recall ≥50%, median
time-to-detect ≤30 days, ≤1 proposal per record-month, **zero on null records**. The labelling is
the expensive part and it is unavoidable. And the fixture is one person's record, so precision
measured on it is not a population estimate; the detector must never be tuned on the same fixture it
is scored on.

**Live**, it is not an A/B test — you cannot run a record against itself simultaneously. It is
**N-of-1 / interrupted time series**, which is a real methodology with reporting standards. Three
disciplines:

1. **Score once, at `score_at`. Never peek.** Continuous monitoring at a nominal 5% gives a real
   **26.1%** false-positive rate. A fixed date falls out of the `schedule` table for free.
2. **Prefer the low-variance measure** — count unmatched payloads, not "time saved." Azure chose
   logical CPU over wall-clock duration for exactly this reason.
3. **Two-sided test sets only.** A famous "GPT-4 got worse at primes" result collapsed because the
   test set contained **only primes**; adding composites inverted the conclusion.

**And one borrowed from SRE practice:** if the brake never fires, everyone quietly starts assuming
it cannot. **Exercise the suspension deliberately once a quarter on the ops record — there is no
staging environment ([53-SPEC-OPERATIONS](53-SPEC-OPERATIONS.md) §13 #14)**, or it will be
discovered broken the first time it is needed.

---

## 8 · What this costs, and when it is built

| # | Thing | Nominal | At the corpus's own ×2.4 correction |
|---|---|---|---|
| 1 | `observation` + closed vocabulary + the batched RPC | 2d | ~5d |
| 2 | The `analyse` schedule kind: SQL detector + cheap-model drafter | 3d | ~7d |
| 3 | `prediction`, frozen baseline, the `score` job, the digest miss | 2d | ~5d |
| 4 | A fourth suggestion body — **`change`**: a declaration diff with its prediction | 2d | ~5d |
| | **Total** | **9d** | **≈22d** |

**This is Phase C, gated on gate 4.** A self-improving loop on a record nobody uses is the purest
possible waste, and gate 4 is the *is anyone using it* gate.

---

## 9 · The claim to ship

> ### **BrainDog is a system whose configuration is data — so it can observe its own use, propose a change to itself in the same language a human would write, and be scored on whether the change helped. A person decides every time.**

Every clause is buildable and falsifiable.

**Claims to refuse:** *"self-improving AI"* · *"the software rewrites itself"* · *"recursively
self-improving"* · *"self-healing"* · and the tempting one, ***"it gets smarter the more you use
it"*** — which is nearly true for the ingest loop and false for everything else, and the first
support ticket kills it.

---

*Next: [25-CONNECTORS](25-CONNECTORS.md) — attaching the record to the things it is about.*

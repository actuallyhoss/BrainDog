# 15 · Roadmap

Re-costed from zero, because [00-README](00-README.md) withdrew the reuse the prior plan rested
on. These are working-day estimates for **one developer with AI assistance**, and they are
deliberately not optimistic.

---

## 1 · The honest total — revised after an adversarial re-cost

**The first version of this document said 115 working days. That number was wrong, and the way it
was wrong matters more than the number.** An adversarial feasibility review of the whole document
set found two defects in it, and both are structural rather than arithmetic.

### Defect 1 · Roughly 88–125 days of described work had no line item

[21-AUTHORING](21-AUTHORING.md) is the largest document in this set. It specifies **six major
authoring tools** — the page builder, the query builder, the register editor, the ingest pattern
builder, the pack builder, and the dialect editor beyond its Tier 1 textarea. **Not one of them
appeared in any stage below.** Nor did eight settings areas, the audit screen, the entry peek
drawer, saved views, the three pack screens, or generated forms.

| Unfunded, and specified in detail | Days |
|---|---|
| The page builder | 20–28 |
| The query builder (4 surfaces, 7 call sites, the grammar-enumeration CI test) | 18–25 |
| The register editor (incl. the type-change conversion preview) | 10–14 |
| The ingest pattern builder (select-to-anchor, cross-sample scoring, holding tray) | 12–16 |
| The pack builder (diff-to-baseline, scrub-to-inputs, install-into-scratch validation) | 10–14 |
| The dialect editor beyond Tier 1 | +6–10 |
| Spine screens not named in A5 | 12–18 |
| **Total unfunded** | **88–125** — 20+18+10+12+10+6+12 = 88 · 28+25+14+16+14+10+18 = 125 |

*An earlier draft printed this total as ≈90–130 and then used the rounded figure as an exact addend,
so every sum below it was 2–6 days above what the table supports. The rows are unchanged; the sums
now come from the rows.*

### Defect 2 · The stage estimates were about 2.4× optimistic

The review re-costed every stage. The largest single miss: **A5, "the app, native", at 12 days** —
against the twenty-three surfaces and eight settings areas in
[19-INTERFACE](19-INTERFACE.md) §2. Honest: 35–45. And the frontend document's 29-day build order
was read as confirmation of A5+B3+B4's 27; it is not, and [22-FRONTEND](22-FRONTEND.md) §11 now
says so.

### So the real numbers

| | Days | Calendar at 4 productive days in 9 (162 productive days a year) |
|---|---|---|
| **As originally claimed** | 115 | ~8.5 months |
| **The described stages, re-costed** | 248–317 — 246 + 2 · 315 + 2, the 2 being `packages/host` (§1b) | ~1.5–2.0 years |
| **Plus the unfunded authoring tier** | 336–442 — 248 + 88 = 336 · 317 + 125 = 442 | ≈2.1–2.7 years |
| **Plus the scope added on 2026-09-01 and the parity trace of 2026-09-02** | **≈488–645** — 336 + 152 = 488 · 442 + 203 = 645 | **≈3.0–4.0 years** |

*The calendar column is every Days cell divided by 162 — 365 × 4⁄9. An earlier draft printed
9.5 months · 1.8–2.3 · 2.6–3.4 · 3.7–4.9 years, which no single divisor reproduces; the header
said one rate and the cells used three.*


### The 2026-09-01 additions and the 2026-09-02 parity trace, costed rather than absorbed

A round of validation added real scope. Listing it rather than letting it disappear into the
existing ranges, because **the failure this document already documents is exactly that: described
work with no line item.**

| Addition | Days | Where |
|---|---|---|
| The data-model corrections — `file`, `quantity`, `transitions:`, `group_by`/`bucket`, the closed `ratio`, `immutable_when:`, `series: true`, bounded `create`, promoted `state` | 14–20 | [27-VERTICALS](27-VERTICALS.md) |
| **Retroactive erasure** across every store that can name a person, with tests | 5–7 | [02-DATA-MODEL](02-DATA-MODEL.md) §10 — a correctness fix, not a feature |
| The `outbox` and its lease/drain semantics | 3–4 | [01-ARCHITECTURE](01-ARCHITECTURE.md) §2 |
| **Pull connectors**: the `fetch:` block, five paginators, `expect:`, eight kernel auth kinds, `probe:`, `metric_point`, the Sources screen | **26–34** | [25-CONNECTORS](25-CONNECTORS.md) |
| **Tier B** — bring your own key | 4–6 | [26-BYO-INTELLIGENCE](26-BYO-INTELLIGENCE.md) |
| **Tier C** — the runner, enrolment by the device grant (no keypair), the WebSocket dispatcher, leases, requeue, a cross-platform binary, an offline UX | **18–26** | same |
| The theme generator and the sixteen-check validator | 8–12 | [28-THEMING](28-THEMING.md) |
| Emergent pages: six triggers, header derivation, the conflict rules | 6–9 | [29-EMERGENT-PAGES](29-EMERGENT-PAGES.md) |
| The self-improvement loop | **22** | [24-SELF-IMPROVEMENT](24-SELF-IMPROVEMENT.md) — Phase C, gated on gate 4 |
| *Sub-total — the 2026-09-01 validation round* | *≈106–140* | 14+5+3+26+4+18+8+6+22 = 106 · 20+7+4+34+6+26+12+9+22 = 140 |
| **Parity with the predecessor** — the kernel `session` register, `member.seen_at` (the read mark), `boot`, the device grant and Keychain refinements, fourteen data-model additions, the completed dialect, the `agents`, `work`, `portfolio` and `people` packs, money's `running`/`pairs`/`snapshot`/forecast, screenshot mode | **46–63** | [32-PARITY](32-PARITY.md) §11 |
| **Total** | **≈152–203** — 106 + 46 = 152 · 140 + 63 = 203 | 336 + 152 = **488** · 442 + 203 = **645** |

*An earlier draft printed 148–198 and 488/643: the parity row was 42–58 because the `portfolio`
and `people` packs had no line — the exact defect Defect 1 describes — and the base it was added
to was the rounded 340–445 rather than the table's then 334–440 (336–442 since iteration 2, below).*

*Iteration 2 of the specification loop added one package, `@braindog/host` — the route table, the
status mapping and the request context both hosts share ([ADR-064](16-DECISIONS.md)) — at ≈2 days,
as its own row in the §1b shape that builds the hosts. Every total above carries it: 246 → 248,
334 → 336, 486 → 488, and the upper bounds likewise. The same defect as Defect 1, caught this time
before the sum was quoted.*

> **None of this changes the recommendation in §1b.** It makes it stronger: the shape one person can
> actually ship is still *the record and nothing declarative*, and everything above is either inside
> that (erasure, the outbox, the data-model corrections — **≈22–31 days, and they are corrections
> rather than features**) or firmly outside it.
>
> **The one item worth pulling forward is tier B**, at 4–6 days, because it is the only thing on the
> list that makes the assistant good rather than merely present, and the Keychain it needs already
> exists.

> **That is not a plan. It is a research programme with a price tag, and it should be read as
> one.**

### And the tripwire that proves it

§8 of this document sets a stop condition: *"Phase A slips past 90 working days → the estimate was
wrong by 80%, which means the design is wrong somewhere."* Phase A as described is honestly ~122
days. **The plan contains a tripwire its own scope guarantees will fire** — at day 90, with Phase A
three-quarters built, which is the most expensive possible place to learn the number was wrong.

---

## 1b · The largest version one person can actually ship

**The record, and nothing declarative.** No pack format, no page engine, no themes-as-data, no
authoring tier, no assistant.

| Contents | Days |
|---|---|
| The kernel: 27 tables, ids, money, time, provenance, the outbox, the `where:` grammar, FTS5, per-field audit redaction, the `file` type and store (no viewer) | 26–32 |
| Foundations: repo, CI, the four token gates, the storage adapter + conformance suite | 9–12 |
| The record object, the Worker, magic-link auth, agent tokens, the CLI, `.brain` export | 20–26 |
| `@braindog/host` — the route table, `httpStatus`, the request context and `serveApi`, written once for the Worker and the self-host ([ADR-064](16-DECISIONS.md)) | 2 |
| MCP: sixteen tools, resources, the token budget in CI | 8–12 |
| Native screens per register + the spine + the Keychain + the decide queue | 20–26 |
| Alarms, `schedule`, reminders, one hard-coded weekly digest | 8–10 |
| Cloud: Stripe, signup, backups, the inbound endpoint, inbound email | 12–15 |
| Stage 0 — the renderer, MIT, alone. Outside the record; keep only if gates 1a–1d are still wanted | +10, not in the total |
| **Total** | **≈105–135** — 26+9+20+2+8+20+8+12 = 105 · 32+12+26+2+12+26+10+15 = 135 |

*The total excludes stage 0. With it, the shape is 115–145. An earlier draft said 103–133 and
113–143; the two days are `@braindog/host`, added in iteration 2.*

> ### The cut list double-counted, and the honest floor is higher
>
> **An earlier draft said "call it ~70–85 if the cut list below is taken in full." That was wrong,
> and wrong in the flattering direction.** The cut list totals **155–203 days saved** — 136–173 in
> the first table below and 19–30 in the second — more than the base it was being subtracted from,
> which is the arithmetic tell. *(A still earlier draft said 177–234; the rows never added to that,
> and the argument survives at 155 > 135.)* The cause: **most of the list is already excluded from
> the 105–135 above.** That base has no authoring tier, no Slash, no
> themes-as-data, no collaboration, no declared metric or digest kinds, and magic-link rather than
> passkeys. Cutting them again is subtracting them twice.
>
> The table below is therefore split. Only the second group is a real subtraction:
>
> | | Days |
> |---|---|
> | Base — the record and nothing declarative | **105–135** |
> | Less the cuts genuinely still inside it | **−19 to −30** |
> | **Floor** | **≈86–105** |

The cut list, split into what is already gone and what can still go:

**Already excluded from the 105–135 — listed so nobody subtracts them a second time:**

| Already gone | Would have saved | What is lost |
|---|---|---|
| **The entire authoring tier.** Declarations are edited as **text** — the error-recovering parser plus the visible fence, which is [21-AUTHORING](21-AUTHORING.md) §7's own Tier 1 and [22-FRONTEND](22-FRONTEND.md) §8's own recommendation (*"Ship the textarea"*) | **80–100** | the R2–R4 ladder, *"why an amateur cannot produce something ugly"*, and gate 5's plausibility |
| **Slash entirely.** Per [ADR-030](16-DECISIONS.md) the §1b shape ships no intelligence at all; Phase A ships tier A-minimal (triage, extraction, digest prose, embeddings — no conversation) and the conversational surface waits for tier B. The ingest proposal loop is the *hardest* AI job in the product (structured YAML synthesis from three untrusted samples), and the record's own agent can do it over MCP | **20–26** | *"'Write a parser' becomes 'forward three texts and approve a suggestion'"* — the best sentence in the pitch |
| **Themes as a pack kind**, the sixteen-check install gate, the theme editor, the runtime token sanitiser. Ship two first-party themes in both schemes, gated once in CI. **Keep** the 3-layer token ladder and the four CI colour gates | **14–18** | the cheapest Kennel artefact |
| **Collaboration in full.** One person, one record. **Keep per-field audit redaction** — it changes what a backup contains | **12–15** | the $29 tier, shared pages as a distribution instrument, and the `decide` level |
| **Declared `metric` and `digest` kinds.** Hard-code three metrics and one digest. **Keep `target` and `window` as required arguments** — the rule is right and free | **10–14** | pack-shipped analytics |

**Still inside the base, and therefore genuinely available:**

| Further cut | Saves | What is lost |
|---|---|---|
| **The vector index** (`entry_vec`, `near`, RRF) | **6–10** | semantic search — **and it removes the `where:` planner's second execution mode**, the single biggest simplification available |
| **MRTR.** Ship the gate as `propose` → suggestion → human decides in the app or CLI. The write still stays refused until decided, so the gate still holds server-side | **5–8** | the *"protocol-native"* claim. Add it when a client supports it |
| Virtualisation above 2,000 rows, `.brain.age` sealed backups, `.brain` signing — the three parts of the miscellany that the base actually contains | **8–12** | small individually |
| **Total genuinely available** | **19–30** | |

*(Passkeys, offline, the RTL mirroring matrix, `day` precision and the Kennel are in neither
group: the base never had them. Attachments are no longer on this list — the `file` type and its
store are in the kernel row above, with no viewer. **Keep logical-properties-only as a lint rule** regardless —
it costs nothing and a later RTL port costs weeks.)*

**The cold start is the real cost of cutting packs**, and [06-PAGES](06-PAGES.md) §4 calls the pack
system *"the mitigation for the highest-ranked death."* But **three of the four** cold-start
mechanisms in [19-INTERFACE](19-INTERFACE.md) §6 need **no pack format at all** — one seeded example
row per register, the dismissible Home preview, and the one that is almost free:

*(An earlier draft counted four of five and led with "a capture as the first screen." That mechanism
has since been deleted at source: it depended on Slash, which this same plan cuts.)*

> *"Or from any session: `read my brain, then add every domain I own with its renewal date`"*

**That is the cold-start answer, it costs a string per register, and it needs no pack format, no
page engine and no Kennel.** The expensive idea had a cheap version and this document did not
notice until it was audited.

---

## 2 · Stage 0 — the renderer, alone, first

**10 days. Ships before anything else exists.**

A standalone **MIT** library: the fenced dialect parser, the eight layout primitives, the sixteen
block kinds, the token contract, and a test suite. No BrainDog coupling of any kind — it takes
text and tokens and returns markup. Published as `braindog-render` (root: `parse` · `toHTML` ·
`render` · `KINDS` · `PRIMITIVES` · `PRIMITIVES_VERSION` — no `expand`, since kinds expansion is
`declare`'s) and `braindog-render/svelte` — [31-STACK](31-STACK.md) §2; the grammar it implements is
[34-GRAMMARS](34-GRAMMARS.md) §2. The suite's budgets — parse and render time, output against input,
the bundle — are asserted, and every number lives in `tools/gates/budgets.json` rather than here
([36-SPEC-RENDER](36-SPEC-RENDER.md) §13 D20; [52-SPEC-TESTING-AND-CI](52-SPEC-TESTING-AND-CI.md)
§13 D1).

| Why first | |
|---|---|
| It is gate 1's instrument | but **not as a download count** — see §5. It carries gates 1a–1d: dependent packages, outside issues, and non-publish-day downloads sustained over four weeks |
| It is useful to people who will never buy BrainDog | which is what makes it get installed |
| It is the riskiest thing to get wrong later | the dialect is a public contract the moment an agent writes it |
| It de-risks the aesthetic | the blocks are most of what the product looks like |

**Apache-2.0 for the app, MIT for the renderer** ([ADR-016](16-DECISIONS.md)). This library is the
distribution instrument, and MIT asks nothing at all of whoever embeds it, which is the whole point
of shipping it first.

The clean-room cost is real: the prior plan extracted 528 lines plus 1,043 lines of existing tests
in 2.5 days. Writing and testing it from nothing is 10. The tests are most of why anybody would
trust it, so they are not the place to save time.

---

## 3 · Phase A — a sellable hosted record

**50 days as first estimated; ≈122 after the §1 re-cost. No packs, no page engine, no declared
anything.** Native screens over a fixed set of registers. This is the smallest thing that tests the
price, and the price is the open question.

*The Days column is the original estimate — 5+12+10+5+12+6 = 50. §1 re-costs this phase at ≈122;
the re-costed total for every described stage is §1's 248–317.*

| # | Stage | Days | Contents |
|---|---|---|---|
| A1 | Foundations | 5 | repo, CI, the token system and its four guards, the nine port interfaces, `.brain` header, migration runner |
| A2 | The kernel | 12 | the 27 kernel tables, ids, money, time, provenance, **the `where:` compiler**, FTS5 wiring |
| A3 | Record object + API + auth | 10 | the Durable Object, `@braindog/host` — the route table and request context both hosts share — then the Worker and the self-host, passkeys, agent tokens, the CLI |
| A4 | MCP | 5 | the sixteen tools, resources, prompts, the token budget in CI, **MRTR decision gate** |
| A5 | The app, native | 12 | shell, nav, register lists, entry detail, command palette, search, the decide queue, the Keychain |
| A6 | Cloud | 6 | Stripe, signup, backups, the inbound endpoint, email |

The stages follow the package order of [31-STACK](31-STACK.md) §2: `record` before `mcp`, because the
MCP handler wraps the record's type and is tested against a stub of it, and `@braindog/host` last
among the packages, before the apps that import it ([ADR-064](16-DECISIONS.md)).

### The checkpoint, and it is a real decision point

At the end of Phase A (~132 working days including stage 0 at the re-costed rate — ~60 as first
estimated; ≈9.5 months calendar at 162 productive days a year) there is:

- a hosted, paid, multi-tenant typed business record
- with MCP, a CLI, a web app, a credential Keychain, a decision gate, search, digests and reminders
- self-hostable, complete, free
- **and no platform at all**

**Phase B is spent only when gate 2 passes — ten subscribers still paying at day 30. Gates 1a–1d
are a stop signal, not a go signal: if all four miss, do not build Phase B even if gate 2 passes**
([ADR-031](16-DECISIONS.md)). If the renderer has picked up no dependents and no outside issues,
the platform is 62–63 days spent on mechanism for an audience that is not there — and the prior
research is explicit that *wherever the mechanism is the product, it dies.* *(An earlier draft made
gate 1a–1d the gate that authorised spending; §5 below had already moved that to gate 2, and the two
sections disagreed.)*

**Do not read a raw download number as the answer.** §5 measures why: one `npm publish` adds ~264
downloads from mirrors alone, and the median new solo renderer in this category sits at ~240/week at
three months. A download count would have said "yes" to a package with no users and "no" to a
working one.

### Why `where:` is in A2 and not later

It is used by the seven consumers in [02-DATA-MODEL](02-DATA-MODEL.md) §6. Building it once, early,
is the two-day saving on the Firefly III precedent — and building it *late* means seven consumers
each grew their own predicate first. This is the single most expensive thing to reorder in the whole plan.

---

## 4 · Phase B — the platform

**62–63 days** — 8+4+5+10+9+7+8+8+3 = 62, or 63 at B8's upper bound. An earlier draft said 55
while its own table added to 61; B8 then rose from 7 to 8–9 on
[20-COLLABORATION](20-COLLABORATION.md) §10's own costing. The order is constrained and the
constraints are not preferences.

*The Days column is the original estimate. Re-costed, this phase is ≈126–195 — §1's 248–317 less
Phase A's ≈122.*

| # | Stage | Days | Why here |
|---|---|---|---|
| B1 | **The pack format** | 8 | **foundational: it changes the data model, so nothing declarative can precede it** |
| B2 | **Core AS packs** | 4 | `money-core`, `estate`, `people` — the `agents`, `work` and `portfolio` packs are costed in §1's parity row; six first-party packs in all ([32-PARITY](32-PARITY.md) §5). If the first registers are special-cased the pack API is half-built forever — VS Code ships its own languages as extensions for this reason |
| B3 | Themes | 5 | the cheapest pack format, so it proves the format at the lowest stakes. Includes the contrast gate and the theme editor |
| B4 | The page engine | 10 | pages as rows, nav as rows, onboarding as pack selection, every empty state |
| B5 | Ingest + rules | 9 | the raw inbox, declared patterns, the proposal loop |
| B6 | Metrics + digests | 7 | declarative, on the same `where:` |
| B7 | Slash, conversational (tier B first) | 8 | gated on [ADR-030](16-DECISIONS.md)'s instrumented ask; last of the engine work, because everything it proposes must already exist |
| B8 | Collaboration 1–3 | 8–9 | shared links, a second login, comments on decisions — [20-COLLABORATION](20-COLLABORATION.md) §10 costs it at ~8.25; the audit-redaction half-day is already in §1b's kernel |
| B9 | The Kennel | 3 | **last, and never before gate 2 — with gates 1a–1d not all missed ([ADR-031](16-DECISIONS.md))** |

### Two ordering rules that must not be broken

**Pack format before anything declarative.** It changes the data model. A page engine built first
would be rebuilt.

**The Kennel last.** A marketplace with no users is a directory of one person's files.

### And one exception to the "Kennel last" rule

The **`braindog` Agent Skill** ships in Phase A, not B9. It is one file, it is not a marketplace,
and it is the cheapest distribution experiment available — into an ecosystem measured at
279,970★ / 172,776★ / 74,139★ on 2026-08-31. See
[14-KENNEL](14-KENNEL-AND-COMMUNITY.md) §6.

---

## 5 · The gates

Instrumented **before** the first public commit, not after.

| Gate | Measure | By | Tests |
|---|---|---|---|
| **1** | ~~500 npm downloads, week ending 2026-11-30~~ → **replaced. See below** | — | **the original gate cannot distinguish success from failure in either direction** |
| **2** | 10 subscribers still paying at day 30 | **2027-02-28** | the price. A one-time sale is a purchase; a subscription is only real if it survives a month |
| **3** | monthly churn under **5%** | ongoing | **the number that decides it.** Above it, MRR cannot compound |
| **4** | ≥3 records not the owner's: >20 rows, >3 distinct days, present at day 14 | 3 months post-launch | whether it is a product at all. Not stars, not installs, not a Show HN score |
| **5** | **5 packs by somebody who is not the owner** | 6 months post-platform | whether the PLATFORM is real. Zero means the declaration kinds are one person's shape |

### Gate 1 was broken, and it was the gate that gated spending

**This is the most consequential correction in this document.** An adversarial market check measured
the instrument, and npm's own operative public statement on download counts says the rest:

> *"npm's download stats are **naïve by design**… the number includes **automated build servers**,
> **downloads by mirrors**, **robots that download every package for analysis**."*
>
> *"**Only if your package is getting > 50 downloads/day can you be sure you're seeing signal
> instead of noise.**"*
>
> *"You will also get **a burst of downloads whenever you publish a new package or a version of that
> package, because all the mirrors will download it.**"*

**50/day is 350/week. The gate was 500/week — 71/day, or 1.43× npm's own stated noise floor.**

It fails in both directions at once:

| | Measured |
|---|---|
| **Can a product with zero users pass it?** | **Yes.** Pooled across 59 publish days in 13 packages: **302.5 downloads on a publish day against 38.6 on other days — +264 excess per publish, from mirrors alone.** Seven baseline days plus one `npm version patch && npm publish` clears 500 with no humans. Proof by existence: a package created 2026-08-22 with **exactly one version ever published**, one maintainer, no audience → **1,205 downloads in week one.** 15 of 26 measured new renderers exceeded 500 in week one and most collapsed to double digits by week four |
| **Can a working product fail it?** | **Yes.** Against **new solo-maintainer** renderers rather than mature incumbents, **not one in the measured cohort was above 500/week at three months. Median week 13 ≈ 240.** One genuinely good solo package took **seven months** to cross 500. The gate is ~2× the category's honest baseline |
| **Does passing predict revenue?** | **No.** `ccusage` runs at ~170× the gate and earns about **$124/month** — a figure already in this record's own blockers |
| **Is a single week even stable?** | **No.** Across 436 package-weeks in 16 small renderers, **33.9% exceeded 500** for packages whose true baseline is 80–150. And on 2026-08-14 the registry returned **0 downloads for every package queried** — one such gap inside the measurement week erases ~14% of the count for reasons unrelated to the product |

**So the ten days that build the gate's instrument produce a number that cannot be acted on.**

### The replacement, and all four resist publishing

| Gate 1 (new) | Measure | Why it cannot be gamed by a publish |
|---|---|---|
| **1a** | **≥3 dependent packages** by other people (`registry.npmjs.org/-/v1/search?text=depends:braindog-render`) | a mirror does not add a dependency |
| **1b** | **≥5 issues or PRs opened by non-authors** | a robot does not open an issue |
| **1c** | **≥150/week on non-publish days only** | subtracts the +264 burst by construction |
| **1d** | **above 1c for four consecutive weeks with zero publishes** | removes both the burst and the single-week coin flip |

All four are free to compute, none was in the plan, and together they answer the question the
original gate was asked to answer.

### And the Show HN attribution does not survive measurement either

On the day one comparable recorded an 854-download *"Show HN spike"*, its author **published six
versions**. At +264 excess per publish, **the publish burst alone accounts for the whole spike** —
the post's marginal contribution is not distinguishable from zero. Meanwhile the genuinely
*successful* post in the same category (202 points, 26 comments) produced **no measurable npm
adoption at all**, because it shipped via GitHub and never became a dependency.

Two calibration points on what winning that lottery buys: at #1 for a day, one well-known indie
developer got **one paying customer**; another front-page post produced **~10 signups**. P(≥100
points) measures at **1.68%**.

**And the artefact is nine years stable:** in 2017 a maintainer reported *"as soon as I push a new
release suddenly it gets about 200-300 downloads."* The 2026 pooled figure is 302.5. Same number,
nine years apart. This is not a new distortion.

---

Stage 0 is still worth building — the renderer is the aesthetic risk and the dialect is a public
contract — but **it is no longer the thing that decides whether to spend Phase B.** Gate 2 is, and
gate 2 measures paying customers.

**Gate 2 is now the gate that gates spending** — ten subscribers still paying at day 30. It is the only gate in the set that measures the thing being sold. Gates 1a–1d keep a veto: if all four miss, Phase B is not built even when gate 2 passes. Recorded as [ADR-031](16-DECISIONS.md); §3, B9 and [14-KENNEL](14-KENNEL-AND-COMMUNITY.md) §2 follow it.

### Two free watches

| Watch | If it fires |
|---|---|
| A model vendor ships a **typed, user-owned, exportable** store | the schema advantage collapses. Today theirs is path-addressed text capped at 100 kB a file, and that cap is the entire gap |
| A competitor charges for the **record** rather than the compute | contested from inside the niche. Every one of them meters compute today; not one sells a record |

---

## 6 · Phase C — the additive future scope

Everything here is **additive**: it fits the declaration kinds, the one grammar and the pack format
without changing them. That is the test for whether something belongs in this list at all.

> **And the test rejected something, which is how you know it is a real test.**
> [25-CONNECTORS](25-CONNECTORS.md) does not pass it. Pull connectors fit the declaration kinds — `ingest`
> gains a `fetch:` block — and they fit the grammar. But they **change the pack format's security
> enumeration**: [04-PACKS](04-PACKS.md) §7's *"a pack cannot make an outbound call of any kind"*
> becomes false, and an enumeration with an exception is a weaker argument than one without.
>
> So the test stands and connectors are marked as what they are: **the one item in this document
> that is not purely additive, admitted deliberately, with the row it costs named in both places.**
> The same goes for the two kernel tables in [24-SELF-IMPROVEMENT](24-SELF-IMPROVEMENT.md) — those
> *are* additive to the pack format, which is why they were allowed to be kernel rather than a new
> kind.

> **And what connectors cost is metered, from the first run (2026-09-15, [ADR-069](16-DECISIONS.md)).**
> Every scheduled fetch, call and poll is counted per record in the Directory, outside the record: runs,
> requests, bytes, run time and failures, by day, project and action. A record's allowance is its
> plan's, in `PLAN_TABLE` (`packages/record/src/plans.ts`, which the Directory's `ALLOWANCE` reads): on
> Free 1,000 runs, 10,000 requests, 0.1 GB fetched and 5 hours of run time a month, with 20 Slash
> credits and 3 agents, at $0; on Cloud 15,000 runs, 150,000 requests, 1 GB and 50 hours, with 80
> credits and 15 agents, at $12 a month; and on Cloud Plus five times Cloud, 75,000 runs, 750,000
> requests, 5 GB and 250 hours, with 400 credits and 75 agents, at $29 a month. No plan is sold by the
> year. These are the owner's figures and the defaults taken for him, his to change with
> a word. At the limit an action waits for the next month and says so in one sentence, and an
> automation's run that has not started waits with it. A self-host is counted and never limited.
> Changing a figure starts in `PLAN_TABLE`, and the site's copy of its rows (`apps/site/src/lib/plans.ts`),
> this paragraph and ADR-071 change with it in the same change, or `plans.test.ts` and
> `packages/record/test/plans-docs.test.ts` go red. The
> price does not change with use, and the month-24 case above assumes no overage.

| Scope | Shape | Why it is additive |
|---|---|---|
| **Pull connectors** | `ingest` + `fetch:` | **NOT purely additive — see above.** ~53% of 609 real connectors are expressible, ~71% within the declarative tier, 64% of the endpoints this buyer uses — the ceiling is measured, and it depends on which population you mean |
| **The self-improvement loop** | two kernel tables, one schedule kind | additive to the pack format; gated on gate 4 |
| More block kinds | packs | the primitive layer exists for this |
| More field types | a kernel migration | a closed list can be extended once, deliberately, with a validator |
| Paid packs | Stripe Connect on the Kennel | only when a pack author asks. Tax, refunds and moderation are a company |
| Real-time co-editing (tier 4) | CRDT over the DO's WebSockets | ~15–20d plus permanent maintenance. Not this year, and the DO is already the right coordination point |
| Bring-your-own KMS | an adapter | the key hierarchy already has a KEK seam |
| Mobile app | the same API | the web app is already a client of the agent API |
| A second record per customer | a second object | the addressing already supports it; billing does not |
| Team tier beyond 5 | permissions per register | the model in [20-COLLABORATION](20-COLLABORATION.md) §1 is capability-based per register to allow this |
| Non-Cloudflare hosting | the nine ports ([31-STACK](31-STACK.md) §5) | the seam is designed, not retrofitted |
| Public "record pages" | tier-1 shared links, generalised | already the distribution instrument |
| Arabic UI | RTL is in scope from A5 | logical properties from the first stylesheet, not a later port |

### And what is on the do-not-build list, each with its reason

| Never | Because |
|---|---|
| A tenant column | nine spoken id sequences. The second customer's first task would be #4,732 |
| A plugin system that runs user code | a table survives a shared Worker; an `eval` does not. **This is not a limit on the platform — it is what makes it possible.** User code never runs inside the record's own object, whatever else is decided. A person's script is user content, and whether BrainDog may run it in a hosted sandbox was the owner's open decision at the time |
| A double-entry accounting rewrite | 25–40d to reach parity with what Actual Budget and Firefly III give away, and the best-funded attempt archived at 54,315★ |
| A port of the prior `analytics.js` | keep the ~80-line metric model, delete the other 906 |
| Arbitrary SQL anywhere | an `eval` by another name. **This is what refuses PostHog's HogQL query API** — its own docs call it *"effectively a wrapper around ClickHouse SQL"*, and a shareable connector file would carry it |
| A connector that fans out over a **fetched** list | it is 47% of real Airbyte connectors and it is still refused: host N+1 would come from response N, so the install diff could not name every host it will call |
| A `poll:` state machine — create, poll, download | three requests, a termination condition and often a second host. That is a workflow DSL, and it is where Ansible and CloudFormation each crossed the line without noticing. The refusal is of a workflow DSL *inside a connector file*. The owner's direction asks for an automations layer (trigger, steps, action), which is its own declared thing with its own caps and its own install diff, not a connector that grew a state machine |
| A bank connector | the format handles it in five minutes; **the credential does not exist.** UK open banking has no self-serve path at all since GoCardless closed signups, and unattended access is capped at four calls a day *by law* |
| A shared vector index | breaks self-host parity and the isolation proof |
| Templating the native screens on principle | two tiers instead, and the engine earns them one at a time |

---

## 7 · The three deaths, and where each is addressed

| Death | Rank | Addressed by |
|---|---|---|
| **Cold start** — the record is empty on day one, so it only helps the person who already filled it | likeliest | packs as onboarding ([06-PAGES](06-PAGES.md) §4), one worked example per pack, and the ingest proposal loop. `throughline` is this exact architecture at 21★ |
| **Distribution, not product** | predicts revenue better than any property of the software | stage 0 shipping alone, the skill, shared pages as landing pages, ingest patterns as long-tail search |
| **Churn, not acquisition** | specific to the subscription | gate 3 at 5%. A leaky bucket cannot be filled. The retention mechanisms are the digest, the reminders and the Keychain — the three things you would miss |

---

## 8 · What would make me stop

Recorded now, while it is cheap to be honest.

| Signal | Read |
|---|---|
| Gate 1a–1d all miss — no dependents, no outside issues, non-publish-day downloads under 150 | distribution does not exist. Do not build Phase B — this is the veto in [ADR-031](16-DECISIONS.md); passing them never authorises spending, gate 2 does. **A raw download count is not a valid stop signal** — see §5 |
| Phase A ships and no record but the owner's reaches 20 rows in 3 months | the cold start won. The packs are the last idea; if they also fail, stop |
| A vendor ships a typed exportable store | the schema advantage is gone. Reassess the whole thesis, not the roadmap |
| Churn above 8% at 10 subscribers | the product is not retained. Fix retention before acquisition, or stop |
| Phase A slips past 90 working days | the estimate was wrong by 80%, which means the design is wrong somewhere. Find it before continuing |

---

*Next: [16-DECISIONS](16-DECISIONS.md).*

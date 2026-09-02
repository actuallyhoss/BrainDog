# 18 · Build toolkit

The skills, repos and references to build this with. Star counts read from the GitHub API on
**2026-08-31**, and **re-pulled on 2026-09-01 after a second audit challenged them as implausible.**

**They are correct, and the benchmark that settles it is the one neither audit reached for:**

| Repo | Stars, `gh api` 2026-09-01 |
|---|---|
| `obra/superpowers` | **280,069** |
| `n8n-io/n8n` | 202,976 |
| **`microsoft/vscode`** | **190,103** |
| `anthropics/skills` | 172,809 |

Yes — **`obra/superpowers` is above VS Code, and `anthropics/skills` is within 10% of it.** That is
the fact that reads as impossible, and it is true. Stating it with VS Code beside it is the cheapest
way to stop it being re-challenged a third time, because the objection is always *"nothing is that
big"* and the answer is *"this is how big the thing you are comparing it to is."*

The first audit's target was wrong in a different way: it paired these against *"n8n at 150k★"*, a
figure inherited from the prior record and **stale**. Corrected at source. The general lesson is
worth keeping: **a number that disagrees with its neighbour is worth re-reading, and the wrong one is
not always the newer one.**

---

## 1 · The skills ecosystem, measured

| Repo | Stars | Forks | What it is |
|---|---|---|---|
| `obra/superpowers` | **280,069** | 25,091 | An agentic skills framework and development methodology |
| `anthropics/skills` | **172,809** | 20,523 | The official Agent Skills collection, including the skill-creator |
| `ComposioHQ/awesome-claude-skills` | **74,158** | 8,493 | A curated index of community skills |
| `cloudflare/skills` | **2,750** | 266 | A vendor teaching agents to build on its own platform |

Two conclusions, and the second is strategic rather than practical:

1. **The ecosystem is large enough to be a real dependency and a real distribution channel.** A
   curated index at 74k★ is a shelf worth being on.
2. **`cloudflare/skills` is the exact template for BrainDog's own play** — see
   [14-KENNEL](14-KENNEL-AND-COMMUNITY.md) §6. A vendor ships a skill that teaches agents to use
   its product; every session that loads it carries the product's vocabulary. That is one file, and
   it belongs in Phase A.

---

## 2 · Which skills to use for which stage

| Stage | Skill | For |
|---|---|---|
| A1 foundations | `cloudflare`, `wrangler`, `workers-best-practices` | bindings, config schema, deploy, and the anti-patterns (floating promises, global state, streaming) |
| A2 kernel | `durable-objects` | the SQL API, alarms, PITR, and the concurrency model that ADR-002 rests on |
| A3 record + API | `cloudflare` → `references/durable-objects`, `references/workers` | the limits table. **Trust the live docs over any reference file** — that skill says so itself |
| A4 MCP | `claude-api` | the Messages API, tool definitions, token counting. **Read it before writing any tool schema** |
| A5 app | `ui-ux-pro-max`, `web-design-guidelines`, `frontend-design`, `dataviz` | the interface. See §4 for the honest assessment of each |
| A6 cloud | `cloudflare-email-service`, `turnstile-spin` | inbound email and the signup form's bot problem |
| B5 ingest | `cloudflare` → `references/workflows`, `references/queues` | durable execution and the front door |
| B7 Spark | `agents-sdk`, `claude-api`, `cloudflare` → `references/ai-gateway`, `references/workers-ai` | model routing and cost. **Read the live gateway docs, not the reference file** — see §3 |
| throughout | `web-perf` | measuring LCP/INP/CLS rather than asserting them |
| throughout | `code-review`, `simplify` | the diff, before it is committed |

### And the one to ignore

`sandbox-sdk`. It is the right tool for executing untrusted code, and BrainDog's governing rule is
that **no untrusted code is ever executed**. If a stage ever seems to need it, that is the signal
that a pack has been designed as a script.

---

## 3 · The Cloudflare skill's own instruction, which matters here

> *"Your knowledge of Cloudflare APIs, types, limits, and pricing may be outdated. **Prefer
> retrieval over pre-training.** When a reference file and the docs disagree, trust the docs."*

This was load-bearing during this research pass, four times:

- The bundled `workers-ai/gotchas.md` says function calling is limited to `llama-3.1-*` and
  `mistral-7b`. The live model catalogue on 2026-08-31 lists **~19 models** with tool support,
  including every model this design routes to. Designing against the reference file would have
  produced the wrong model choices.
- The `durable-objects` reference and the live docs agree on the limits that matter, and those
  limits changed three design decisions — the 64-field register cap; text search split into
  full-text `matches` on FTS5 and substring `contains` on `instr()`, never `LIKE`, because workerd
  caps a LIKE pattern at 50 bytes ([ADR-013](16-DECISIONS.md); an earlier draft had `contains`
  compiling to FTS5); and the entire single-alarm schedule pattern.

- Its `ai-gateway` reference lists DLP actions as *"Flag, Block, or **Redact**"*. The live docs offer
  **flag and block only** — there is no redact. Designing against the reference file would have made
  BrainDog's redaction requirement look like a platform feature it must instead build itself.
- The same file asserts caching *"Does NOT work with streaming."* **That claim appears nowhere in
  Cloudflare's documentation** — checked against the caching page and `ai-gateway/llms-full.txt` on
  2026-08-31. The real constraint is *identical requests*, which is a different and more useful fact.

**Three errors, one reference file, all caught by reading the source.** That is the strongest
possible argument for the skill's own instruction — and it is why every numeric limit and every
capability claim in these documents was read from the live docs on 2026-08-31 and dated.

---

## 4 · An honest assessment of the design skills

Recorded because a toolkit document that lists tools without saying how well they worked is not
useful.

| Skill | What it gave | What it did not |
|---|---|---|
| `ui-ux-pro-max` | The product-type convergence was genuinely useful: BrainDog matches **Financial Dashboard** and **Analytics Dashboard**, which both resolve to *Dark Mode (OLED) + Data-Dense Dashboard*, secondary *Minimalism & Swiss Style* and *Accessible & Ethical*, palette focus *"dark bg + red/green alerts + trust blue"*. Also a usable pre-delivery checklist and 119 UX guidelines | `--design-system` returned an **FAQ/Documentation Landing** pattern for a dense record app — off-target, and the skill's own contract says to retry narrower and say so, which is what happened. Its palette and typography output (slate + JetBrains Mono + IBM Plex Sans) is a generic developer-tool default, not a design |
| `web-design-guidelines` | A compliance checklist worth running before shipping any screen | Not a design system |
| `dataviz` | Directly applicable to [08-METRICS](08-METRICS-AND-ANALYTICS.md) §3 — form heuristics, palette validation, the rule that colour alone may never carry meaning | — |
| `frontend-design` | Aesthetic direction, for avoiding a templated look | — |
| `apple-design` family | The strongest material on motion (spring physics, interruptibility), materials and accessibility tactics. Use `apple-design-motion` and `apple-design-tactics` specifically | Its OS-surface guidance is for native apps, not this |
| `design-system` | Three-layer token architecture, which is exactly the ladder in [05-BLOCKS](05-BLOCKS-AND-THEMES.md) §6 | — |

**Conclusion:** use these for *validation and checklists*, not for the design. The visual system in
[13-UI](13-UI.md) is derived from the product's own constraints — dense typed rows, a 72-character
reading measure, intent-only theming, a contrast gate — and then checked against these.

---

## 5 · Runtime dependencies: the target is near zero

A stated goal, and it is both a supply-chain posture and a portability one.

The prior comparable system's Worker had **no `package.json` and no npm dependencies at all**,
which is precisely why it ran unmodified on plain Node under a 28-line SQLite shim — self-hosting
was *tested rather than estimated*, with all 27 migrations applied and 12 of 12 routes returning
200. That property is worth more than any convenience library.

| Layer | Allowed | Notes |
|---|---|---|
| The record object | **zero** runtime dependencies | it is SQL and JSON |
| The Worker | zero, ideally | signing and crypto come from WebCrypto |
| Web Push | one, zero-dep | **`@pushforge/builder@2.0.5`** — MIT, genuinely zero dependencies. *(An earlier draft called it `pushforge`, which **does not exist on npm**. A dependency named from memory is a dependency nobody checked.)* |
| Age encryption (`.dog.age`) | **six** | `age-encryption@0.3.1` is one direct dependency and **five transitive `@noble`/`@scure` packages**. Counting it as one was the kind of arithmetic this table exists to prevent |
| The app | Svelte 5 + SvelteKit 2, and as little else as possible | settled in [22-FRONTEND](22-FRONTEND.md) §2 and [ADR-045](16-DECISIONS.md) |
| Dev only | vite · wrangler · vitest · playwright · axe-core — **every version is pinned in [31-STACK](31-STACK.md) §3**, which owns them; none is repeated here | not shipped |

**Every runtime dependency is a decision recorded in [ADR-046](16-DECISIONS.md), not a
convenience** — that ADR enumerates the two permitted packages above and makes any third a new ADR.

---

## 6 · CI, from day one

Not added later. Several of these exist because the equivalent guards caught real, shipped bugs in
a comparable codebase.

| Check | Catches |
|---|---|
| No colour or font-size literal outside the token file | the slow drift that ends with 1,854 global rules nobody can attribute |
| No component styles a class it does not own | a rule aimed at a class passed into a component, which the compiler prunes — and a control silently loses its chevron |
| Every `var(--x)` resolves | a token-shaped name that never read a token |
| A width query never changes a control's **size** | a laptop window getting phone chrome. Width may change layout; only the pointer may change size |
| The elevation ladder only rises, in both themes | a shadow invisible in one theme |
| Contrast gate over every shipped theme | a theme that ships unreadable |
| **Rendered-box measurement in a real browser** | the class of layout bug that is invisible in source. Most recently: a grid using `auto-fit` produced **7 tracks for 3 items**, leaving a 550 px empty slab — correct in every selector, wrong on screen |
| MCP token budgets | `tools/list` over 1,800 tokens |
| Telemetry blob allowlist | a field value reaching Analytics Engine |
| Secret-in-log grep | a credential in a log, a push payload, or a prompt |
| `.dog` round-trip | export → import → export must produce an identical **canonical logical dump** — rows by primary key, columns in declared order, NULLs normalised ([03-DOG-FORMAT](03-DOG-FORMAT.md) §3, [33-CONTRACTS](33-CONTRACTS.md) §9); never raw bytes, because three runtimes run three SQLite versions and page layout is not portable. An earlier draft said byte-identical |
| Kernel contains no declarations — except `register.session` ([02-DATA-MODEL](02-DATA-MODEL.md) §1), the one named exception | the core silently stopping being packs |
| Pack install/uninstall leaves rows intact | the contract in [04-PACKS](04-PACKS.md) §4 |
| Deployed shell matches the build, byte for byte — after `wrangler deploy`, fetch `/` and `/_app/version.json` from the live host and compare their SHA-256 to `build/` | a green deploy serving a stale asset. This has happened before, three times in a row, with a fresh version id each time |
| **Targets are designed at 44 × 44 CSS px (SC 2.5.5 AAA, by choice — SC 2.5.8 AA's 24 × 24 is the legal floor) through an invisible hit box; CI measures every control under a coarse pointer, counting `::before`/`::after`, and fails below 43.5 × 43.5 on either axis.** | a chevron drawn as a 20 px glyph inside a 44 px box, where the pseudo-element is the hit target |
| **Every child of a row shares a vertical centre within 1.5 px** | a control sitting 3 px low reads as belonging to the row below — the measurement behind *"controls do not sit on rows being read"* |
| **Every field is exactly one height per pointer size** | *"a width query never changes a control's size"*, as a number rather than a rule |
| **No class declared in a stylesheet that nothing emits** — a report, not a gate | four of eight design reviews independently found rules for UI deleted months earlier: a whole card design, a `@keyframes` animating nothing. They read as live, and they are what somebody edits by mistake. Counts a dashed class reachable by prefix (`"s-" + state` builds `.s-live`); 377 candidates → 26 |
| **No media rule is beaten by a later copy of itself** | THE recurring cascade fault: a rule inside `@media` loses to an identical bare selector written later. Found eight live instances the first time it ran, four of them in a `min-width` block whose base rules were written *below* it and had never applied at any width |
| Every positive `z-index` is a `var(--z-*)`; every icon size literal is one of four names | a number matches no rule and the SVG grows to its container |
| **Screenshot mode: layout byte-identical off → on, and pixel readback** | element boxes and page height must not move; redacted digits re-photographed as `0` and as `8` must be identical |
| **A check that can pass on the degraded branch tests nothing** | the predecessor's harness asserted `childElementCount > 0` on a screen whose data fetch was stubbed to fail — the error path rendered a subtree, the check was green, and 64 rows went a design-review round unlooked-at. **Assert on something that can only be true if the real branch ran**: `rows ≥ 4`, a mark per row, zero inline comboboxes |
| **A regression test carries the old wrong number** | the predecessor's money audit produced 45 findings and one test per claim, each recording the figure that was wrong — `-E£48,000.27`, `−94%`, `×4`. A regression test that asserts the right value without naming the wrong one cannot tell a reviewer what it protects |
| INP p75 ≤ 100 ms on the target phone, gated on LoAF `blockingDuration` | [13-UI](13-UI.md) §9, [22-FRONTEND](22-FRONTEND.md) §9 — an app that feels like it is running underwater |
| `outline: none` anywhere in first-party CSS | [13-UI](13-UI.md) §7 — a focus ring a theme cannot remove and a component must not |
| The `role="grid"` keyboard contract, as a checklist | [13-UI](13-UI.md) §7, [19-INTERFACE](19-INTERFACE.md) §4 — a half-implemented grid is worse than a table |
| No physical CSS property (`property-disallowed-list`) | [13-UI](13-UI.md) §8, [22-FRONTEND](22-FRONTEND.md) §7 — Arabic is a requirement, not a hypothetical |
| The spring ends at exactly 1 and peaks ≤ 1.05 | [13-UI](13-UI.md) §9 — a spring settling at 0.998 leaves a one-pixel gap on every panel forever |
| The identifier type role never co-occurs with a display size | [13-UI](13-UI.md) §3.2 — mono for identity, tabular-proportional for quantity |
| Every semantic colour token has a `pairs.json` entry | [22-FRONTEND](22-FRONTEND.md) §7 — the contrast gate runs over declared pairs, not all pairs |
| Bundle budgets: JS ≤ 30 KB, CSS ≤ 12 KB, fonts ≤ 45 KB, HTML ≤ 25 KB brotli/gzip; the editor chunk unreachable from the entry chunk | [22-FRONTEND](22-FRONTEND.md) §9 — a size budget that only warns is a size budget that is exceeded |
| No icon component accepts a `color` prop | [22-FRONTEND](22-FRONTEND.md) §9 — a colour-writing component by another name |
| Header and body cell widths equal, exactly | [22-FRONTEND](22-FRONTEND.md) §10 — a 4 px stagger invisible in source |
| Every gate runs over 8 fixtures × 4 widths × 2 schemes × 2 directions | [22-FRONTEND](22-FRONTEND.md) §10 — 128 configurations |
| Every plot's list twin holds every event the plot draws | [19-INTERFACE](19-INTERFACE.md) §4 — the list is the essential, the plot is the view |
| The no-model build passes every e2e suite (`SPARK_ENDPOINT` unset) | [23-ASSISTANT-UI](23-ASSISTANT-UI.md) §8 — Spark is absent, not disabled |
| The shipped high-contrast theme passes all sixteen checks | [28-THEMING](28-THEMING.md) §4.5 — if it fails, the validator is wrong |
| Every refusal code has a fixture that produces it | [30-BLUEPRINT](30-BLUEPRINT.md) §6 — a code with no fixture fails CI |
| **A decorative enhancement is never the only thing drawing a state** | `requestAnimationFrame` does not run in a hidden tab, so anything measured in one — a sliding pill, a nav offset — never happens while occluded. The selected control paints its own background until the pill is in place, and the worst case degrades to the previous design rather than to nothing |
| **Vault screen**: a closed row draws no `opens`; opening a row opens exactly one; no value control is drawn with nothing expanded; the screen is absent, not blurred, under screenshot mode | [12-SECURITY](12-SECURITY.md) §8 |
| **No `grant.*` event note contains `label` or `opens`** — a grep over every fixture's events | 12 §8, [20-COLLABORATION](20-COLLABORATION.md) §8 |
| **Job view**: one row per tool call; a fold names both lengths (*2,000 of 41,812 characters*); a one-line result is not folded; `after=` is monotonic and reaches a non-zero value; events received after the panel closes > before; nothing polls when nothing is live | [23-ASSISTANT-UI](23-ASSISTANT-UI.md) §3.1 |
| **A draft survives its screen loading**: type, then release the gated load; the typed text is still there | [22-FRONTEND](22-FRONTEND.md) §7 |
| **Harness constants come from one module** — a port or a host literal in an e2e file is a failure | 22 §7 |

That last one is worth naming as a principle:

> **Any step whose failure mode is silence gets checked against the thing itself, never against
> the tool's opinion of it.**

Which of these is a zero-dependency script under `tools/gates/<name>.mjs` and which is a Playwright
spec against a rendered box is the inventory in [33-CONTRACTS](33-CONTRACTS.md) §8; the conformance
suite that makes the self-host adapter a peer of the Durable Object's is §3 there.

---

## 7 · Reference material, by subsystem

| Subsystem | Primary source |
|---|---|
| Durable Objects, SQL, alarms, PITR | `developers.cloudflare.com/durable-objects/api/sqlite-storage-api/` |
| Workers AI models and tool support | `developers.cloudflare.com/workers-ai/models/` |
| Neuron pricing | `developers.cloudflare.com/workers-ai/platform/pricing/` |
| AI Gateway: caching, DLP, ZDR, BYOK | `developers.cloudflare.com/ai-gateway/` |
| Analytics Engine limits and SQL | `developers.cloudflare.com/analytics/analytics-engine/` |
| Inbound email in Workers | `developers.cloudflare.com/email-service/` |
| Secrets Store (100 secrets, 1 KB each) | `developers.cloudflare.com/secrets-store/integrations/workers/` |
| MCP 2026-07-28 spec | `blog.modelcontextprotocol.io/posts/2026-07-28/` |
| SQLite as an application file format | `sqlite.org/appfileformat.html`, `sqlite.org/fileformat2.html` |
| The Obsidian precedent | `github.com/obsidianmd/obsidian-releases` — `community-plugins.json` (7,145), `community-css-themes.json` (719) |
| WCAG 2.2 | `w3.org/TR/WCAG22/` |

---

*Back to [00-README](00-README.md).*

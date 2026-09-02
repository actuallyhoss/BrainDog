# 14 · The Kennel, and community

Distribution is the binding constraint. The record's own strongest finding is that **distribution
predicts revenue better than any property of the software** — every comparable above $30k/mo
belongs to somebody with a pre-existing audience, and BrainDog has none.

So this document is about distribution, and the marketplace is one instrument in it.

---

## 1 · The Kennel is an index, not a platform

> **A pack is a file, so the marketplace is an index over files.** — [ADR-047](16-DECISIONS.md)

The precedent, measured on 2026-08-31:

| | |
|---|---|
| Obsidian community **plugins** | **7,145** |
| Obsidian community **themes** | **719** |
| The entire mechanism | **two JSON files in one public GitHub repo, submitted by pull request** |

That is the best-in-class extension ecosystem in personal-knowledge tooling, and its
infrastructure is two JSON files. Homebrew's taps are the same shape. There is no reason to build
more than this, and several reasons not to.

```json
// kennel/packs.json
{
  "id": "freelancer-uk",
  "name": "Freelancer (UK)",
  "author": "someone",
  "repo": "https://github.com/someone/braindog-freelancer-uk",
  "manifest": "https://raw.githubusercontent.com/.../freelancer-uk.pack.yaml",
  "provides": ["register.invoices", "register.clients", "page.invoicing", "metric.unpaid-90d"],
  "requires": { "format": 1, "primitives": 1, "packs": { "money-core": "^1" } },
  "summary": "Invoices, clients, and UK statutory late-payment interest."
}
```

| Property | How |
|---|---|
| Submission | a pull request adding one object |
| Review | one person, plus a **schema check in CI** that installs the pack into a throwaway record and asserts it validates |
| Trust | packs are readable text and the diff is shown before it applies — including every host a declared `source:` will call ([ADR-025](16-DECISIONS.md)). Plus install counts and attribution |
| Install | URL, git ref, or paste. **The index is a convenience, never a gate** — nothing is trapped behind approval |
| Hosting | GitHub Pages. Cost: zero |

### Refused, each with the reason

| Refused | Because |
|---|---|
| **Paid packs in v1** | tax, VAT, refunds, chargebacks and moderation are a company, not a feature. Revisit only when a pack author asks |
| Running a pack's code | there is none to run |
| Remote assets in packs | an image URL is an exfiltration channel with a record id in the query string |
| Ratings and reviews | a five-star system over twelve packs is theatre. Install counts and the diff |
| A submission portal | a pull request is a submission portal that already exists and already has identity |

---

## 2 · The sequencing rule, and it is hard to obey

> **The Kennel cannot precede the pack format, and must not precede gate 2 — ten subscribers still
> paying at day 30 — with gates 1a–1d not all missed ([ADR-031](16-DECISIONS.md)).** *(An earlier
> draft said gate 1; the roadmap moved the spending gate to gate 2 and this sentence did not follow.)*

A marketplace with no users is a directory of one person's files, and building it early is how a
record becomes *mechanism*. The prior research names this as the structural finding that killed
eleven positionings: **wherever the mechanism is the product, it dies.**

The answer BrainDog gives: the mechanism is not what is sold — **the hosting is**, and packs are a
distribution channel. If that stops being true, this is a framework, and frameworks in this niche
monetise at zero (n8n at 203k★, priced at zero to an individual).

The gate that measures it: **5 packs by somebody who is not Sam.** Zero at six months means the
eight kinds are one person's shape, not a general one.

---

## 3 · The three things worth sharing, in order of cheapness

| Order | Thing | Why this order |
|---|---|---|
| 1 | **Themes** | a token document — the cheapest thing anybody will ever share, so it proves the format at the lowest stakes |
| 2 | **Ingest patterns** | the **highest-value** ones: everybody's bank is different and nobody wants to write a parser. One per bank, one per invoice sender |
| 3 | **Register + page packs** | a whole way of working: freelancer, studio, agency, landlord |

Ingest patterns are the ones that will actually drive adoption, and the reason is the loop in
[07-INGEST](07-INGEST-AND-RULES.md) §4: a user forwards three texts, approves a proposal, and now
holds a file that solves the same problem for everybody with that bank. **The product generates
its own marketplace inventory as a side effect of being used.** No other kind does that.

---

## 4 · Community

Community is not a forum. It is the set of places a person can get unstuck and be seen.

| Surface | Where | Job | Cost |
|---|---|---|---|
| **GitHub Issues** | the repo | bugs, and the only place that promises a response | free |
| **GitHub Discussions** | the repo | "how do I model X", pack ideas, show-and-tell. Searchable by Google, unlike Discord | free |
| **The Kennel repo** | separate | pack submissions and their review conversation | free |
| **A changelog** | `brain.dog/changelog` | the single highest-leverage community artefact for a solo product: proof of life | a file |
| Discord | later, if asked | real-time support is a commitment to be present. **Do not open one until there is somebody to talk to** | a real cost |

### Two community features inside the product

**1 · Show-and-tell is a pack.** "Here is how I model my landlord business" is a `.pack.yaml` in
a Discussions post. The community's artefacts are the product's extension format — that is the
whole design paying off.

**2 · A shared read-only link doubles as a landing page.** Tier 1 collaboration (a signed token
per page) is also distribution: every page somebody shares with their accountant is a page a
stranger sees, rendered by BrainDog, with a footer. One day of work serving two purposes, and it
attacks the actual bottleneck.

### Refused

| Refused | Because |
|---|---|
| A forum we host | a support obligation and a spam surface, before there are users |
| In-app social — profiles, follows, feeds | this is a private business record. The instinct to socialise it is wrong |
| Public pack comments | Discussions already exists and is indexed by Google |
| A Discord before launch | an empty Discord is worse than none, and a busy one is a job |

---

## 5 · Distribution, in order of expected return

The gates are in [15-ROADMAP](15-ROADMAP.md); this is the plan they measure.

| # | Instrument | Cost | Why it could work |
|---|---|---|---|
| 1 | **The renderer, as a standalone MIT library on npm** | in scope for stage 0 | Gate 1 tests distribution and nothing else — and it is **no longer a download count**, because a raw npm count cannot distinguish a working product from a publish burst ([15-ROADMAP](15-ROADMAP.md) §5). A self-contained block renderer with a real test suite is useful to people who will never buy BrainDog |
| 2 | **A `braindog` Agent Skill** | one file | see §6. The cheapest experiment available and it is not in the prior plan |
| 3 | **An MCP server directory listing** | an afternoon | the buyer is already looking for MCP servers |
| 4 | Shared pages as landing pages | in scope for tier 1 | organic, and it compounds with use |
| 5 | The changelog, and building in public | ongoing | the only instrument that works without an audience, by slowly creating one |
| 6 | Ingest patterns per bank, published | a side effect of use | long-tail search: *"HSBC Egypt SMS parser"* is a query with no good answer today |
| 7 | Show HN, once | a day | one shot, with a working hosted demo. **And measured expectations:** P(≥100 points) ≈ **1.68%**; at #1 for a day one well-known indie developer got **one paying customer**, another front-page post ~10 signups. The most successful post in this exact category produced **no measurable npm adoption at all** |

**Not doing:** paid acquisition. The record's own arithmetic — 80 subscribers at $12 is $960/mo —
does not support a CAC, and every comparable above $30k/mo got there on an existing audience
rather than on ads.

---

## 6 · Packs and skills are the same artefact shape

The most useful strategic find in this research pass, and it is not in the prior record.

A BrainDog pack is: a **declarative text file** describing capability, installed from a **URL or
git ref**, indexed in a **public repo**, where **no code runs**, reviewed by **schema check**.

A Claude Agent Skill is: a **declarative text file** describing capability, installed from a
**URL or git ref**, indexed in a **public repo**, where **no code runs**, reviewed by **schema
check**.

Measured on 2026-08-31:

| Repo | Stars | Note |
|---|---|---|
| `obra/superpowers` | **279,970** | a community skills framework |
| `anthropics/skills` | **172,776** | the official collection |
| `ComposioHQ/awesome-claude-skills` | **74,139** | a curated list |
| `cloudflare/skills` | **2,749** | a vendor teaching agents to build on its platform |

Three conclusions:

1. **There is a proven appetite for exactly this artefact shape**, at a scale the Obsidian
   ecosystem took a decade to approach. The pack format is not a novel bet on user behaviour.
2. **BrainDog's buyer is already in that ecosystem** — they are a person running several agents,
   which is the definition of a skills-repo visitor.
3. **`cloudflare/skills` is the template for the play**: a vendor ships a skill that teaches
   agents to use its product. A `braindog` skill teaches an agent to file a renewal, propose an
   ingest pattern, and open a decision — and every session that loads it is a session that has
   BrainDog's vocabulary in its context.

That is a distribution experiment costing one file, testable before any of the platform exists,
and it belongs in Phase A rather than in B9 ([15-ROADMAP](15-ROADMAP.md) §4).

---

*Next: [15-ROADMAP](15-ROADMAP.md).*

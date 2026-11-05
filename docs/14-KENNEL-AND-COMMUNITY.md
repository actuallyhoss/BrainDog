# 14 · The Kennel, and community

Distribution is the binding constraint. The record's own strongest finding is that **distribution
predicts revenue better than any property of the software** — every comparable above $30k/mo
belongs to somebody with a pre-existing audience, and BrainDog has none.

So this document is about distribution, and the marketplace is one instrument in it.

---

## 1 · The Kennel is an index over files, with a door to publish through

> **A pack is a file, so the marketplace is an index over files.** [ADR-047](16-DECISIONS.md)

That stays true, and it is why the Kennel is small. The best extension ecosystems in this kind of tool are
an index and the files it points at (Obsidian's community plugins are two JSON files in one public
repository; Homebrew's taps are the same shape), and BrainDog's catalogue format was already that: an
`index.json` over immutable files, each version held to its checksum and, when its author signed it, to
their key.

What changed is who can add to the index. It was a folder bundled into each web build from this
repository's `packs/`, so nobody but a committer could publish, and a new version waited for a deploy.
The Kennel is the same index served by the app itself, with a door anybody can submit through and the
operator's review between that door and the listing.

### What it is

| | |
|---|---|
| Where | `/api/kennel/v1/` on every host: `app.brain.dog/api/kennel/v1/` on the Cloud, and the same paths on a self-host. It sits under `/api/*`, which the site already forwards to the app, so it needed no DNS and no new route |
| What it answers | `index.json` (the catalogue format, unchanged), each published file at `packs/<id>/<version>.pack.json` or `usecases/<id>/<version>.usecase.json`, the `.preview.json` beside it, and `counts.json`. Every read is public, to every origin, and a published file is served as immutable |
| The index | BrainDog's own catalogue, bundled with the deployed build, then everything listed from outside. An id the bundled catalogue holds, or that BrainDog's built-in modules and use cases install under, is BrainDog's: no submission may take it |
| Storage | the Cloud's existing R2 bucket, under `kennel/`: the Kennel's index, the review file, the trusted publishers, the counts, and the files. No table, no migration, no new binding |
| Publishing | `POST submit` with the file. The publisher is the author's key when the file is signed (the Ed25519 signature a catalogue already verifies), or the person signed in to BrainDog on that host. An id belongs to whoever published it first: a later version comes from the same person, or is signed by the same key or one it rotated to. In the app, `/packs/share` publishes a use case and a page's "Share as a template" publishes a pack of that page alone, both as the signed-in person (`apps/web/src/lib/market/publish.ts`, `template.ts`). From a terminal, `braindog pack publish --kennel` and `braindog usecase publish --kennel`, signed with `--sign <key file>` or sent as the machine's sign-in (`apps/cli/src/kennel.ts`) |
| Checks | the door a record installs through (size, credentials, shape, block kinds), a title, no manifest key outside `MANIFEST_KEYS`, versions that only move forward and are bumped as far as what they change, a daily limit per publisher, and a ceiling on how many wait at once. The record itself stays lenient about manifest keys; the Kennel is where a key nothing reads is refused by name |
| Review | a submission from a publisher the operator has not trusted waits, and the operator lists it or refuses it with a reason. `GET review` lists what waits, and `GET review?kind=&id=&version=` answers one waiting file whole, so every script's source is read before it is listed. A listed version says when it was reviewed, and may carry a preview of its pages the operator made, never one its author drew. The operator reviews in the app's Admin page, signed in as an address in `OPERATOR_EMAILS`, or from a terminal with `braindog kennel review` and `PROVISION_KEY` in the environment, which installs the waiting file in a scratch record first, so every refusal a record would give is seen before it is listed (`apps/cli/src/kennel.ts`). With no `PROVISION_KEY`, the review doors answer `NOT_IN_THIS_BUILD` |
| Counts | `counts.json` says how many hosted records have each listing on, keyed `<kind>:<id>`, for listed entries only, rounded down by `roundCount` with nothing under ten, written once a night by the walk (`writeCounts` in `apps/worker/src/kennel.ts`, the per-record step in `apps/worker/src/nightly.ts`). A self-host is never counted. As built, the Worker's nightly call does not yet hand the walk its per-record step or the counts write (`apps/worker/src/index.ts`), so the file answers an empty tally and nothing shows a count until it does |
| Yanking | a version's key, its publisher or the operator takes a version back with a reason. It stays downloadable by its exact version, so a record that holds it keeps working, and a reader never offers it again |
| A self-host | answers the same paths from its own catalogue folder first and the public Kennel second (`BRAINDOG_KENNEL`, `off` for none), keeping the public index for `KENNEL_KEEP_MS`. With the Kennel off or unreachable, its folder answers alone. It takes no submissions itself |
| Install | still URL, git ref, file or paste. **The index is a convenience, never a gate**: every install is the record's own plan, approved by its owner, whatever it came from |

The rules are one module, `packages/declare/src/kennel.ts`, which `apps/worker/src/kennel.ts` and
`apps/selfhost/src/kennel.ts` only read from and write to.

A read answers the file itself. A write, and each of the operator's review doors, answers in the envelope
every `/api` answer uses: `{ ok: true, value }`, where a submission's value is `{ state, kind, id, version }`,
or `{ ok: false, refusal }`. On the Cloud every write first spends the caller's address from the same
per-minute write budget the record doors use, before its body is read.

### The default the owner has not yet ruled on

[ADR-031](16-DECISIONS.md) put the Kennel after gate 2, and ADR-047 described it as pull requests to a
public repository. The Kennel as built follows this default until the
owner rules:

- **Now, not after gate 2**, because the product asks for a registry and for publishing your own packs.
- **A publish door, not pull requests.** The index format is the same either way, so only the door would
  change if the owner prefers pull requests.
- **Anyone with an author key or a BrainDog account may submit, and nothing from outside is listed until
  the operator has looked at it**, except from a publisher the operator has said is trusted. The operator
  reviews with the key the Cloud already has for provisioning (`PROVISION_KEY`).
- **No Kennel signing key.** Authors sign with their own keys and the operator's listing says it was
  reviewed, so no single lost key forges every pack.
- **Scripts in a pack from outside are allowed.** They run in the sandbox on the installing record's
  allowance, every calls-out line is approved at install, and the operator reads the source at review.
- **A self-host reads the public Kennel** unless `BRAINDOG_KENNEL=off`.

### Refused, each with the reason

| Refused | Because |
|---|---|
| **Paid packs in v1** | tax, VAT, refunds, chargebacks and moderation are a company, not a feature. Revisit only when a pack author asks |
| Remote assets in packs | an image URL is an exfiltration channel with a record id in the query string |
| Ratings and reviews | a star system over a handful of packs is theatre. Install counts, rounded down as `roundCount` says them, and the plan's diff instead |

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

The gate that measures it: **5 packs by somebody who is not the owner.** Zero at six months means the
declaration kinds (`KINDS` in `packages/kernel/src/declare.ts`, [04-PACKS](04-PACKS.md) §1) are one
person's shape, not a general one.

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
| **The Kennel** | `app.brain.dog/api/kennel/v1/` (§1) | pack submissions and the operator's review; the conversation about one belongs in an issue | free |
| **A changelog** | `brain.dog/changelog` | the single highest-leverage community artefact for a solo product: proof of life | a file |
| Discord | later, if asked | real-time support is a commitment to be present. **Do not open one until there is somebody to talk to** | a real cost |

### Two community features inside the product

**1 · Show-and-tell is a pack.** "Here is how I model my landlord business" is a `.pack.yaml` in
a Kennel submission. The community's artefacts are the product's extension format — that is the
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
| Public pack comments | GitHub Issues already exist and are indexed by Google |
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

*(Amended September 28th 2026, as built: packs are indexed by the Kennel (§1) rather than a public
repository, and a pack may carry a `script`, which runs in a host's sandbox and never in the record,
with every host it calls out to approved at install ([04-PACKS](04-PACKS.md) §1). The artefact shape
the comparison rests on is unchanged.)*

---

*Next: [15-ROADMAP](15-ROADMAP.md).*

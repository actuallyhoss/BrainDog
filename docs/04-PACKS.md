# 04 · Packs

The spine. Everything modular in BrainDog is an instance of this one format, including the parts
we ship ourselves.

> **Extensions are DATA. Where data is not enough, the extension is an AGENT — never a script.**

A table survives a shared Worker; an `eval` does not. So nothing a user or a pack author writes
is ever executed. Anything needing real computation is an agent with a skill and a schedule —
which is what this product is already about.

---

## 1 · The eight kinds, and the list is CLOSED

| Kind | Is | Declares |
|---|---|---|
| `register` | a typed collection | fields, validation, search, title |
| `page` | a declared screen | slug, nav, sources, blocks |
| `block` | a visual kind | a primitive, `accepts:`, and a body of primitive nodes — [05-BLOCKS-AND-THEMES](05-BLOCKS-AND-THEMES.md) §1 |
| `ingest` | something arriving from outside | webhook / email / **pull** / paste / api — the five channels of [30-BLUEPRINT](30-BLUEPRINT.md) §1 — then match, extract, writes. The pull half is [25-CONNECTORS](25-CONNECTORS.md) |
| `rule` | when X, do Y | a `register:`, a `when:` in the `where:` grammar, a `priority:`, and a closed-list action |
| `metric` | a derived number | source, predicate, aggregation, format, **target**, window |
| `theme` | token values only | colour roles, scales, density — never CSS |
| `digest` | scheduled output | schedule, sections (each `as:` a kind, `omit_when_empty:` to drop an empty one), channel |

A ninth kind means a ninth schema, a ninth validator and a ninth way to be insecure. **If it does
not fit these eight, it is an agent.**

The closure is load-bearing rather than tidy: the security argument in §7 is an *enumeration*,
and an enumeration only works over a finite list.

---

## 2 · A pack is a file

```yaml
# money-core.pack.yaml
pack: money-core
version: 1.4.0
author: braindog
license: MIT
summary: Accounts, obligations, installments and FX. The money a business owes and is owed.

requires:
  format: 1               # the .dog format revision these declarations need — PRAGMA user_version
  primitives: 1           # compared against PRIMITIVES_VERSION; never an app version — the app has no semver
  packs:
    people: "^1"          # ref fields point at people.entry

provides:
  - register.accounts
  - register.obligations
  - register.installments
  - register.fx
  - page.money
  - metric.due-30d
  - metric.owed-total
  - rule.installment-due-soon
  - digest.money-weekly

declarations:
  - register: accounts
    fields: [ ... ]
  - page: money
    nav: { section: Money, order: 10, icon: money }
    blocks: [ ... ]
```

One file, or a directory of files with one manifest. It is text, so it diffs, reviews, and can be
pasted into a chat window. The YAML is read by one parser — `yaml`, the accepted dependency of
[ADR-063](16-DECISIONS.md) — in one subpath, `@braindog/declare/yaml`, and never inside the record
([42-SPEC-DECLARE](42-SPEC-DECLARE.md) §5.1). `parsePack(files) → Pack | Refusal[]` is the way in;
`lint(pack, installed)` is §5's checks; `checksum(body)` is the SHA-256 below — three names, and
[42-SPEC-DECLARE](42-SPEC-DECLARE.md) §2 owns them.

### The manifest, key by key

Every key, typed. The install-time schema check in §5 validates against this table, so a manifest
key that is not here is refused by name.

| Key | Type | Required |
|---|---|---|
| `pack` | the pack id — `^[a-z][a-z0-9-]{1,63}$` ([34-GRAMMARS](34-GRAMMARS.md) §4), globally unique in the Kennel | required |
| `version` | semver | required |
| `summary` | string, ≤ 140 characters | required |
| `author` | string | required |
| `license` | an SPDX identifier | required |
| `declarations` | a list of one or more, each one of the eight kinds | required |
| `requires` | `{ format: <int>, primitives: <int>, packs: { <pack id>: <semver range> } }` — the `.dog` format revision and the `PRIMITIVES_VERSION` the declarations need, and the packs they depend on. **Never an app version: the app has no semver** ([31-STACK](31-STACK.md) §6) | optional |
| `seeds` | `[{ register, fields, note? }]` — the example rows: at most one per register, own registers only, no `ref`/`secret`/`file` values; marked by the value `example` in the register's declared `tags` field, applied through the write path with `cascade = false`, and counted on their own line in the diff (§3) — [42-SPEC-DECLARE](42-SPEC-DECLARE.md) §5.5 | optional |
| `provides` | **derived** — the `kind.id` of every declaration. It may be written out for a reader, and if it is, it must equal the derived list — `PROVIDES_MISMATCH` otherwise | derived |

*(Amended September 15th 2026 for modularity: the manifest gains one more optional key, `config:`, a
closed subset of field types (no `ref`, `secret` or `file`) that a pack declares and an owner fills
at `/packs/<id>`, read back through `{{config:<key>}}`. `loop/research-modular.md` §1.3 has the shape
and why the subset stays narrow.)*

`requires` on the manifest is a map. `requires` on a `page` declaration is a list of `register.<id>`
([06-PAGES](06-PAGES.md) §1.1). The two never appear on the same object. *An earlier draft's manifest
carried `braindog: ">=0.4 <2"`, a range against a version number the app does not have.*

`note` is legal on every declaration, field, block, section and action — a reader's comment the
validator keeps and never interprets ([42-SPEC-DECLARE](42-SPEC-DECLARE.md) §13 D15).

The pack's checksum — `pack.checksum` in the kernel's `pack` table — is the SHA-256 of the RFC 8785
(JCS) form of manifest plus declarations, after YAML → JSON ([34-GRAMMARS](34-GRAMMARS.md) §5).

### `provides` is `kind.id`, and that is what makes conflict detectable

Two packs both providing `register.obligations` collide, and the installer can say so **before
touching anything** — naming both packs and the exact id. No half-installed state, ever.

---

## 3 · Install

```
$ braindog pack install https://kennel.brain.dog/p/freelancer-uk
```

```
  freelancer-uk 2.1.0 by @someone            MIT
  requires format 1 · primitives 1           you have 1 · 1    ok
  requires packs: money-core ^1              installed 1.4.0   ok

  ADDS      register.invoices        11 fields
            register.clients          6 fields
            page.invoicing           4 blocks, nav → Money/20
            metric.unpaid-90d        target: 0, window: 90d
            rule.invoice-overdue     when overdue >14d → notify + tag
            ingest.stripe-payout     webhook, writes register.invoices
  CHANGES   nav order of page.money  10 → 12    shown, not applied — your nav is yours
  CONFLICTS none
  SEEDS     2 example rows, marked `example`, clearable in one action
  SPAWNS    rule.invoice-overdue creates 0 rows. No generator in this pack.
  TOUCHES   nothing you have written. 0 rows read, 0 of YOUR rows written.

  Apply?  [y/N]
```

Four properties of that screen, each deliberate:

1. **The diff is shown before it applies.** A pack is readable text, so a truthful diff is
   possible — this is the entire trust model, and it is why packs may not contain code. You
   cannot diff a binary's intentions.
2. **Row counts are stated, and seeds are counted separately.** A pack physically cannot *read* a
   row at install time, so "0 rows read" is a guarantee. But a pack **does** write its worked
   example rows — [06-PAGES](06-PAGES.md) §4 calls that example *"the difference between a record
   somebody fills in and a record somebody abandons"*, and it is a named mitigation for the
   likeliest cause of death. An earlier draft claimed "0 rows written" while three other documents
   required seeding, which made the trust screen untrue. **Seeds get their own line, are marked
   `example`, and are clearable in one undoable action.**
3. **Everything is one transaction, and the plan is a separate call.** The screen is the `Diff`
   that `planPack(pack)` returns — `adds · changes · conflicts · seeds · spawns · calls_out · touches` —
   computed against the live record and never applied. `y` is `installPack(pack, planHash)`, one
   `transactionSync()` over the declaration writes; if the record changed since the plan it is
   refused with `PLAN_STALE` and the diff is re-run. `planHash` is
   `<record_version>.<sha256hex(jcs({ pack: checksum, base }))>`: the integer half is the kernel's
   `planVersion`, whose compare-and-swap inside `installDeclarations` is the staleness check, and the
   hash half catches a pack edited between plan and install, which no version can see
   ([42-SPEC-DECLARE](42-SPEC-DECLARE.md) §5.4, [41-SPEC-KERNEL](41-SPEC-KERNEL.md) §5.6). The
   kernel writes the `pack` row and the install events in that same batch. A declaration already
   present with an identical checksum — `/start` installs one by `setDeclaration` — is *already
   present, unchanged*: neither a change nor a conflict. A validation failure at declaration 6 of 7
   leaves nothing behind. Both methods are ADMIN — a browser session, or a bearer carrying a
   single-use **operation grant** for exactly this install, approved in the browser after seeing
   this diff ([30-BLUEPRINT](30-BLUEPRINT.md) §5, §10; [ADR-060](16-DECISIONS.md)).
4. **Nav changes are surfaced — and then refused.** The commonest way an extension ecosystem
   degrades a product is by quietly rearranging the navigation, so a pack does not get to. An
   update that would move an existing page's `nav` is **shown and ignored**
   ([19-INTERFACE](19-INTERFACE.md) §3, [ADR-024](16-DECISIONS.md)). An earlier draft's diff printed
   `CHANGES nav order` as though it landed. **A pack may place a page it owns; it may never move
   yours.**

### Sources, in order of trust and none of them privileged

| Source | Example |
|---|---|
| Kennel index | `braindog pack install freelancer-uk` |
| Any URL | `braindog pack install https://…/x.pack.yaml` |
| Git ref | `braindog pack install git:owner/repo@v2` |
| Paste | paste the text into the installer — *CLI: later* ([48-SPEC-CLI](48-SPEC-CLI.md) §10) |
| Local file | `braindog pack install ./my.pack.yaml` |

The Kennel is a **convenience, never a gate**. Nothing is trapped behind approval, which is the
single most important property Obsidian's ecosystem has and a curated app store does not.

---

## 4 · Uninstall

> **Declarations belong to the pack. Rows belong to you.**

Uninstalling **retires** the declarations and keeps every row ever created under them. *Retires*,
not removes: `declaration.retired = 1` and one `uninstall` event — a row in that table is never
deleted, and a new version of a declaration sets `superseded_at` on the prior row in the same
transaction ([30-BLUEPRINT](30-BLUEPRINT.md) §1). The `pack` row itself goes, and the pack's index
families are dropped, in that same transaction — the declarations stay, retired
([42-SPEC-DECLARE](42-SPEC-DECLARE.md) §5.6, [41-SPEC-KERNEL](41-SPEC-KERNEL.md) §5.6). *An earlier
draft said "removes".* The rows under them become *orphaned*: not rendered, still exported, still
searchable by id, and re-adopted automatically if the pack is reinstalled.

```
  RETIRES   6 declarations
  KEEPS     412 rows in register.invoices, 38 in register.clients
            They stop being shown. They are in every export.
            Reinstalling freelancer-uk adopts them again.
  DELETES   nothing of yours
```

This is only possible because of the one-table decision in
[02-DATA-MODEL](02-DATA-MODEL.md) §1. A pack that created real tables could only be uninstalled
by dropping them.

> **Amended September 15th 2026 for modularity: disable is not uninstall.** Uninstall retires a
> pack's declarations and drops the `pack` row itself. A pack can now also be **disabled**: the same
> retiring, without dropping the row, so it stays listed at `/packs`, greyed, with its version and
> config intact, and **enable** reinstates it with no new plan or diff, because nothing about its
> shape changed while it was off. Disabling a pack another active pack's `requires` still names is
> refused, naming the dependents, the same way an install names a conflict before it applies.
> `loop/research-modular.md` §1.2 and §1.5 have the mechanism.
>
> **Built September 15th 2026.** `pack.disabled_at` is migration 3. Disabling writes one `retire`
> event aimed at the pack, listing the declarations that went off, and enabling brings back exactly
> those, each as a new version with the same checksum, over the same rows. A pack leaned on by
> another active pack, through a field's `to:`, a page's `requires` or its manifest's
> `requires.packs`, is refused `PACK_REQUIRED`, and `alsoDisable` names the dependents to turn off in
> the same transaction. The pack holding the `scopes:` register is refused `SCOPES_IN_USE` while any
> field left on still points at its projects. An install or upgrade of a disabled pack is refused
> `PACK_DISABLED`. Disabling or enabling a pack already in that state changes nothing and says so.
> A write to a disabled register is `REGISTER_UNKNOWN`, as for any register that is not active.

---

## 5 · Validation

Every kind is schema-checked at install. A refusal **names the field that was wrong** and what
was expected — the failure mode to avoid is a valid-looking pack that half-loads.

| Code | Check | Refusal |
|---|---|---|
| `KIND_UNKNOWN` | Unknown kind | `declarations[3]: kind 'widget' is not one of the eight` |
| `FIELD_TYPE_UNKNOWN` | Unknown field type | `register.invoices.fields[4].type 'currency' — did you mean 'money'?` |
| `FIELDS_OVER_CAP` | Fields per register > 64 | `register.wide: 71 fields. The ceiling is 64 — a register with more than that is a database, not a register.` |
| `INDEXES_OVER_CAP` | Fields with `index` or `unique` > 8 — `key:` is one index and is not counted | `register.invoices: 11 indexed fields; the ceiling is 8` |
| `PATTERN_OVER_CAP` | `starts`/`ends` pattern > 40 bytes | `rule.x.when — the 'starts' pattern is 63 bytes. The cap is 40. Use 'matches', which searches the full-text index instead.` |
| `METRIC_NEEDS_TARGET_OR_WINDOW` | A metric with no `target` or no `window` | `metric.unpaid: a number with no target is decoration; a number with no comparison window cannot be acted on` |
| `MIXED_CURRENCY` | Mixed-currency aggregation | `metric.total: sums register.obligations.amount across 3 currencies. Name an fx source and date, or scope the predicate to one currency` |
| `CONTRAST_FLOOR` | A theme failing contrast | `theme.midnight — the pair (faint on s3) is 3.61:1. Body text needs 4.5:1. Lighten faint to at least #8E9C96, or use it only above 24px.` |
| `REQUIRED_ON_POPULATED` | `required` field added to a populated register | `register.obligations.vat is required and 412 rows lack it. Ship a default or a fill rule` |
| `ID_RENAMED` | Id changed on an existing declaration | `register.obligations → register.bills renames a spoken id. #125 in a note would stop resolving` |
| `COLOUR_OUTSIDE_THEME` | A colour anywhere outside a theme | `block.invoice-card sets 'colour: #E11D48'. A block names intent — good, warn, bad, info — and the theme names appearance.` |
| `DEPENDENCY_UNRESOLVED` | Unresolvable dependency | `requires packs.people ^1 — not installed. Install people first, or use --with-deps` |
| `CREATE_UNBOUNDED` | A `create` rule with no `bound:` | `rule.expand-size-run: create has no bound. A generator with no ceiling fills the record` |
| `CREATE_OVER_BOUND` | A `create` whose declared cardinality exceeds its bound | `rule.expand-size-run: sizes (8) × colours (12) = 96 exceeds bound 60` |
| `CREATE_FOREIGN_REGISTER` | A `create` into a register another pack owns | `rule.x writes register.invoices, declared by freelancer-uk. A pack generates only into its own registers` |
| `TRANSITION_ILLEGAL` | A `move` along a transition the enum forbids | `rule.close-early: state cannot move draft → void. Legal from draft: posted` |
| `GROUP_BY_TWICE` | Two `group_by` on one metric | `metric.spend: group_by takes one field. Two dimensions is a report generator` |
| `GROUP_BY_CARDINALITY` | A `group_by` over an unbounded or oversized domain | `metric.by-client: group_by client has 412 possible values; the ceiling is 50` |
| `RATIO_MIXED_SOURCE` | A `ratio` whose operands read different rows | `metric.roas: both operands must share one source and one predicate` |
| `RATIO_MIXED_CURRENCY` | A `ratio` of two different currencies | `metric.roas: revenue is USD, spend is EGP. Name an fx source, or scope the predicate to one currency` |
| `QUANTITY_MIXED_UNIT` | A `quantity` aggregation across units | `metric.fabric: sums consumption across m, cm and g. Scope the predicate to one unit` |
| `STATE_NOT_ENUM` | `state` declared as anything but an enum | `register.x.state: state is a reserved id and is always an enum` |
| `FORMAT_OUT_OF_RANGE` | `requires.format` above this record's | `requires format 2; this record is format 1. Update BrainDog` |
| `PRIMITIVES_OUT_OF_RANGE` | `requires.primitives` above this record's | `requires primitives 2; this record renders primitives 1. Update BrainDog, or ask the author for a primitives-1 build` |
| `BAND_EDGES_MISMATCH` | A `band` whose edges do not fit the field's `values` | `register.leads.tier: band has 3 edges and 5 values. n edges need n+1 values` |
| `SERIES_HAS_NO_TEXT` | A text operator over a `series: true` register | `metric.spend.where: 'contains' over register.campaign_day, which is series: true. A series has no text` |
| `REQUIRED_WHEN_OP_UNSUPPORTED` | A `required_when:` leaf with an operator that cannot be evaluated on the row being written | `register.leads.tier_why.required_when: 'matches' needs the index, not a row. Use is, in, gt, before, empty, present, has…` |
| `PREDICATE_CYCLE` | A named predicate that reaches itself | `register.invoices.predicates.overdue references unpaid, which references overdue` |
| `SEQ_PREFIX_TAKEN` | A `seq_prefix` another installed register uses | `register.leads: seq_prefix 'LN' is taken by register.learnings. D, SG and S are the kernel's` |
| `SEARCH_FIELD_TYPE` | A `search:` field of a type the index cannot take | `register.invoices.search names amount, which is money. search: takes text, document, enum, url, email and list<text>` |
| `FIELD_TYPE_CHANGED` | A field's type changed on a register with rows | `register.obligations.amount: text → money changes a type. Retire the field and add a new one` |
| `PROVIDES_MISMATCH` | `provides` written out and not equal to the declarations | `provides lists register.fx; no declaration provides it` |
| `PLAN_STALE` | The record changed between `planPack` and `installPack` | `the record changed since this plan was made — 2 declarations differ. Plan again` |
| `PACK_MALFORMED` | Not a well-formed pack — a YAML fault, or two kinds or two ids on one declaration | `money-core.pack.yaml#14:3: this declaration names both 'register' and 'page'. One kind per declaration` |
| `PROVIDES_CONFLICT` | An id another installed pack provides | `register.obligations is provided by money-core 1.4.0. Two packs cannot provide one id` |
| `REMOTE_ASSET` | Anything fetched from elsewhere — a URL, `url(`, `data:`, `<script` — in any pack string, a theme value included | `page.money.blocks[2].body: 'https://cdn.example/logo.png' — a pack loads nothing from elsewhere; an image URL is a callback with the record id in it` |
| `SECRET_IN_PACK` | A credential-shaped literal, a spelled `Authorization` header, or a `secret`/`file` seed value | `ingest.stripe-ledger.fetch.headers.Authorization: a pack names a grant, never a key. Remove 'sk_live_…' and bind it in the vault` |
| `WOULD_ORPHAN` | An install whose `retires` would leave rows under a retired register | `freelancer-uk 2.1.0 → 2.0.0 retires register.clients; 38 rows would be orphaned. Uninstall instead, or keep 2.1.0` |
| `THEME_VALUE_INVALID` | A theme value only the colour parser can refuse — a colour outside the grammar, an alpha, an achromatic seed | `theme.midnight.seed.accent 'oklch(0.62 0.01 262)' is almost grey; there is no hue to build from` |
| `INTENT_INSEPARABLE` | Two intents under ΔE 10 after dichromat simulation ([28-THEMING](28-THEMING.md) §4.3) | `theme.midnight — good and bad are ΔE 6.2 apart to a deuteranope. Four intents need at least 10. Move one hue, or lower the chroma of the other` |
| `THEME_LADDER_ORDER` | A surface or elevation ladder out of order | `theme.midnight.roles.light.s2 is darker than s1. The ladder only goes up` |

Forty-one codes — the thirty-three an earlier draft counted and the eight beneath `PLAN_STALE`, the last
three of them the theme's — `UPPER_SNAKE`, each with a fixture that produces it. The one table every code
lives in is [30-BLUEPRINT](30-BLUEPRINT.md) §6, which counts a hundred and twelve across nine families; the
grammar's own codes (`VIA_TWICE`, `CONTAINS_TOO_LONG`, …, and the three that guard an ingest's extractor
forms — [07-INGEST](07-INGEST-AND-RULES.md) §3) are [34-GRAMMARS](34-GRAMMARS.md) §1. *An earlier draft of this table had no code column, and the last
row compared a `braindog` version the app does not have.* A dialect fault is never one of these — a
document is not parsed at write; it degrades at render ([05-BLOCKS-AND-THEMES](05-BLOCKS-AND-THEMES.md) §3).

### Versioning

Semver, with ranges resolved at install and **pinned in `pack`**. A range is the `Range` grammar of
[42-SPEC-DECLARE](42-SPEC-DECLARE.md) §4.2 — comparators joined by spaces, no `||`, no `x` — and a
prerelease orders per SemVer 2.0 §11. A pack that cannot run says so rather than half-loading.
Upgrades show the same diff as installs, and any install — downgrade or upgrade — whose `retires`
would leave rows under a retired register is refused `WOULD_ORPHAN`, naming how many; uninstall (§4)
remains the way to orphan on purpose. There is no `--force` in v1; when one arrives (*CLI: later*,
[48-SPEC-CLI](48-SPEC-CLI.md) §10) it lifts this one refusal and nothing else
([42-SPEC-DECLARE](42-SPEC-DECLARE.md) §13 D17).

There is no automatic pack updating. An extension ecosystem that silently updates is an
ecosystem that can silently change what a page says about your money.

### Changing a field on a register that has rows

| Change | What happens |
|---|---|
| Remove a field | `retired: true` on the field. It stops rendering and stops being writable; the data stays in `fields`. A retired field may not be `required`, `index`, `unique`, or named in `search:` or `mobile:` |
| Change a field's type | **refused in v1** — `FIELD_TYPE_CHANGED`: retire the field and add a new one. The conversion preview in [21-AUTHORING](21-AUTHORING.md) §5 is authoring-tier scope, and it is what this refusal is waiting for |
| Drop `index: true` | the index is dropped in the same transaction |
| Add `required` to a populated register | refused — `REQUIRED_ON_POPULATED`, above |
| Rename an id | refused — `ID_RENAMED`, above. Ids are stable forever, and there is no alias key |

---

## 6 · The discipline that decides whether this is real or theatre

> **Ship the core AS packs.**

`agents` · `work` · `portfolio` · `money-core` · `estate` (domains + services) · `people` — **six**,
and [32-PARITY](32-PARITY.md) §5 lists what each carries. *An earlier draft named four and counted
`skills` among them; `skills` is a register inside `agents`, not a pack.*

If the first registers are special-cased, the pack API is half-built forever. VS Code ships its
own languages as extensions for exactly this reason, and it is the difference between a platform
and a product with a plugin folder.

The measurable form of this rule, which belongs in CI rather than in a code review:

```
test: the kernel contains no declaration of any of the eight kinds
      — except register.session, the one named exception (02-DATA-MODEL §1), whose rows are the agents
test: uninstalling every pack leaves a record with a working nav and zero active declarations (retired rows stay — §4)
test: every shipped pack round-trips through export → import → export to an identical canonical logical dump (33-CONTRACTS §9)
```

### And the split that keeps quality while getting modularity

Not everything becomes declarative on principle. Two tiers, identical in nav:

| Tier | Is | Which |
|---|---|---|
| `authored` | declared, a row, editable in the app | everything new |
| `native` | code | the handful of screens where craft beats configuration |

**The migration rule: a native page becomes authored only when the authored one is provably as
good.** Never a rewrite on principle. The engine earns pages one at a time, and the first two it
must earn are pages that *do not exist yet* — that way the engine is proved on a real need
rather than by re-drawing something that already works. See [06-PAGES](06-PAGES.md) §6.

---

## 7 · The attack surface, enumerated because it is small enough to enumerate

| A pack CAN | A pack CANNOT |
|---|---|
| declare a register | run code — there is no interpreter to reach |
| draw a page from declared blocks | make an outbound call **except a declared `source:`** — see below |
| match text and extract typed fields | read a register it did not declare or require |
| set theme tokens | load a remote asset — font, image, script, iframe (`REMOTE_ASSET`) |
| schedule a digest | write a colour, a font or a spacing value |
| open a suggestion | write any row except a declared `example` seed, which is counted on its own line in the diff |
| tag, move, notify, set a field via a rule | delete anything |
| declare a **bounded** `create` rule, whose ceiling is shown as `SPAWNS` in the diff | generate an unbounded number of rows, generate into a register it does not own, or generate a `secret` or a `file` |
| | escalate: no pack grants another pack a capability |
| | carry a credential — a key-shaped literal, or a spelled `Authorization` header (`SECRET_IN_PACK`; [25-CONNECTORS](25-CONNECTORS.md) §7) |

> ### The one row this table lost, and it is the most expensive change in the corpus
>
> An earlier draft said flatly: **a pack cannot make an outbound call of any kind.** That was the
> single strongest line in the security argument, because the argument is an *enumeration* and this
> removed an entry from it. [25-CONNECTORS](25-CONNECTORS.md) spends it, deliberately, to answer
> *"attach the record to your projects and read analytics."*
>
> **What is bought back, and it has to be worth the row:**
>
> | | |
> |---|---|
> | `base:` is a **literal origin with no placeholders** | 20% of Airbyte's sampled connectors interpolate their host from user config. That is SSRF, shipped, in one fifth of a real ecosystem |
> | The install diff prints **every host, statically** | `CALLS OUT api.stripe.com · every 24h · grant "stripe-read" · scopes balance_transaction_source_read` |
> | A preflight is limited to **exactly one**, so the host list stays finite | with chaining, host N+1 comes from response N — and a diff saying *"then a host derived from the previous response"* is not something anyone can approve |
> | Credentials are **proven read-only at bind time**, not hoped | one authenticated probe per grant; a connector whose `require_scopes` is not a subset is refused |
> | The response is **untrusted content** and lands in `inbox_raw` | so §5 of [12-SECURITY](12-SECURITY.md) applies to it unchanged |
>
> **The worst a malicious pack achieves is still a misleading page — plus one scheduled GET to a
> host named on the screen you approved.**

Links inside pack-supplied text are constrained to `https:`, `mailto:`, anchors and same-origin
paths. A remote asset is an exfiltration channel — an image URL in a page is a callback with the
record id in the query string — so there are none.

**The worst a malicious pack achieves is a misleading page — plus, if it declares a `source:`, one
scheduled GET to a host printed on the screen you approved.** Both are shown by the diff before it
applies, and uninstalling reverses both without data loss.

### The one thing packs cannot protect against, stated plainly

A pack can *mislead*. `metric.profit` could aggregate the wrong field with a plausible name and
a page could present it confidently. No amount of sandboxing prevents this, because it is not a
code-execution problem — it is a *semantics* problem. The mitigations are: the diff names every
declaration, a metric must state its target and window, and a figure renders with its source
path visible on hover. See [08-METRICS](08-METRICS-AND-ANALYTICS.md) §7.

---

## 8 · Packs and skills are the same distribution shape

Worth recording because it is the most useful thing found in this research pass and it is not in
the prior record.

A BrainDog pack is a YAML file describing capability, installed from a URL or a git ref, indexed
in a public repo, and no code runs. **A Claude Agent Skill is a Markdown file describing
capability, installed from a URL or a git ref, indexed in a public repo, and no code runs.**

Measured on 2026-08-31:

| Repo | Stars |
|---|---|
| `obra/superpowers` | 279,970 |
| `anthropics/skills` | 172,776 |
| `ComposioHQ/awesome-claude-skills` | 74,139 |
| `cloudflare/skills` | 2,749 |

Gate 1 tests distribution and nothing else. The skills ecosystem is a distribution channel with
a demonstrated appetite for exactly this artefact shape, it is where BrainDog's buyer already
is, and shipping a `braindog` skill costs a file. That is a cheaper distribution experiment than
anything in the prior plan. See [14-KENNEL](14-KENNEL-AND-COMMUNITY.md) §6 and
[18-BUILD-TOOLKIT](18-BUILD-TOOLKIT.md).

---

*Next: [05-BLOCKS-AND-THEMES](05-BLOCKS-AND-THEMES.md) — what an agent reaches for when it has
something to show.*

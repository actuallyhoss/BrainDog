# 32 · Parity with the brain

> *"Trace the current features that exist within the sam brain, especially the ones implemented
> recently. I need to make sure that ALL of these features are obtainable within BrainDog."*

The brain is the working predecessor: a Cloudflare Worker of 7,780 lines, 32 migrations, 85 route
shapes, a 22-tool MCP server with a refusal list, a 752-line agent contract with eleven reference
files, ~50 Svelte screens, 27 browser harnesses, and 120 commits of recorded reasoning. Every one of
its features was traced to its mechanism — the route, the table, the derivation, the test — and
mapped onto BrainDog. **Traced on 2026-09-02 from `C:\Tools\legacy` at `14fe0d7`**, including the
vault and job runner that landed on 2026-09-01 and are not yet in the brain's own skill — and **re-checked
against `2451e4f`**, the five commits that followed the same day (§2.4).

The method mattered more than the list: a feature was only counted as *obtainable* if a specific
BrainDog mechanism produces it. **Where none did, this document adds the mechanism** and says so.

---

## 1 · The verdict

| | Count | What it means |
|---|---|---|
| Brain features traced | **~190** | routes, tools, screens, derivations, rules, harnesses |
| Already obtainable in BrainDog as designed | ~105 | a register, a page, a rule, a metric, or a kernel table already covers it |
| Obtainable **after additions made in this pass** | ~60 | fourteen data-model additions, nine kernel tables added across the trace and this review — `member`, `device_grant`, `person`, `token`, `auth_fail`, `counter`, `vault_key`, `job`, `job_event` — one kernel register, a dialect extension. *(An earlier draft said "two kernel tables" and named neither.)* |
| Stays **native code** in a first-party pack | ~18 | parsers, crypto, the forecast simulation, the runner, provider adapters |
| **Not carried, deliberately** | 7 | §7 — each with the reason |

> **The shape of the gaps was the finding.** They were not scattered. Nearly every one was a case
> where the brain *derives* something the record does not store — a running balance, a payday from a
> frequency, a tier from four judgements, a session's staleness — and BrainDog's declarative model
> had no primitive for a *row-level derivation*. Adding one closed most of the list.

---

## 2 · The concept crosswalk

Every noun the brain's contract defines, and where it lives in BrainDog. **Kernel** means every record
has it. **Pack** means a first-party pack declares it and a new user does not see it until installed
(or until the trigger in §8 fires).

| Brain | Brain id | BrainDog | Where |
|---|---|---|---|
| The document (`db`) with `rev` | — | the record; row-level writes, no whole-document CAS | kernel |
| Entity (product / project) | `bake` | `register.entities` — fields below | **pack: portfolio** |
| Portfolio lane `earn·ship·explore·maintain·retired` | — | `enum`, with `transitions:`; `retired` is a state, **there is no delete** | pack: portfolio |
| Status `live·building·ready·blocked·raw·parked·retired` | — | `enum` — **the brain's live data already drifts** (`designed`, `researched`, `idea` appear in rows but not the contract); an enum makes drift a refusal | pack: portfolio |
| Outlook `{rev12:[low,base,high], confidence, ceiling}` | — | `list<money>` of three + `enum` + `document` | pack: portfolio |
| `plan[]` — the ordered queue, position is priority | — | `register.plan_steps` with `ref: entity`, `order: int`, optional `ref: task` \| `ref: track` | pack: portfolio |
| Track — a named line of work inside a project | `bake:ugc` | `register.tracks`, `ref: entity`, `transitions:` over `idea·planned·building·shipped·parked·cut`, `target: day`, `doc: document` | **pack: work** |
| Task, two lanes | `#125` | `register.tasks`; the lane is **`for: person\|agent`** — not `lane`, see §7 | pack: work |
| Tier composed from four judgements | — | four `int` fields + **`derive:`** — §3 | pack: work |
| `tier_why` required when tier is set | — | **`required_when:`** — §3 | pack: work |
| Follow-up (`parent`, one level, inherits, cascades) | — | `ref: tasks` + a `rule` with `via:` — §5 | pack: work |
| Calendar event — only dates somebody else fixed | `EV3` | `register.dates`, `kind: enum`, `repeat:`; a move is `update` with a new `day` (the brain's `shift_days` is the client's arithmetic); the brain's *delete returns the row and its index so undo puts back the same one* is unnecessary here — a delete is `deleted_at` and `restore` puts the row back where it was | pack: work |
| Suggestion → decision | `SG23`, `D41` | `suggestion` / `decision` kernel tables, MRTR gate — [ADR-009](16-DECISIONS.md) | kernel ✓ |
| Suggestion **defer** `{until, why}` and cost-of-delay ranking | — | two columns added to `suggestion`; the ranking is a saved-view sort | kernel — §2.1 |
| Learning — the manual half of self-improvement | `LN7` | `register.learnings`, **proposed → active by a person** | **pack: agents** — §5 |
| **Session — the shared context window** | `S42` | **the kernel's one register** — §2.1 | **kernel** |
| Audit event | — | `event`, closed vocabulary | kernel ✓ |
| Skills register (what you can invoke) | — | `register.skills` | pack: agents |
| Credentials register (what a key opens, never the key) | — | `register.credentials` + `secret` fields → the vault | pack: agents + kernel vault |
| Vault value, per-device grant | — | kernel vault + **device-authorisation grant** — §2.2 | kernel |
| Service / metric split | — | `register.services` + `metric_point` series | pack: estate ✓ |
| Domain register | — | `register.domains` | pack: estate ✓ |
| Money: accounts · txn · categories · rules · income · recurring · installments · assets · fx · snapshots · inbox · company | — | `money-core` registers, with the additions in §3 | pack: money |
| Mark + project colour | — | **`identity:` on a register** — §4.4 | kernel option |
| Live numbers (analytics) | — | connectors → `metric_point` with **series kinds** — §3 | pack + kernel |
| For You / read mark | — | **`member.seen_at` (the read mark), monotonic** — §2.1 | kernel |
| Write-up (`doc`) with blocks and `{{path}}` | — | `document` field + the dialect — §4 | kernel ✓ |
| Evidence tags | — | **added** — §4.3 | kernel dialect |
| Mirror (git-diffable snapshot) | — | `braindog export --mirror` → `.dog` + rendered markdown | CLI |
| Job (remote Claude run) | — | tier C — §6 | kernel `job` and `job_event` tables ([30-BLUEPRINT](30-BLUEPRINT.md) §1), native runner |

### 2.1 · Kernel changes this forced

**The kernel's one register: `session`.** The brain's most-used coordination feature had no
counterpart. Every agent write in the brain resolves to a session or **auto-opens one** — attribution
is never optional — and the SessionEnd hook deliberately never marks `done`, because *"a session
ending says the terminal closed, not that the work finished."*

BrainDog gets it as the same kind of acknowledged exception as the promoted `state` column: the
kernel declares **exactly one register, `session`**, because it is the one register whose rows *are*
the agents. That means `S42` is a spoken id for free, `list`/`get`/`update` work with no ninth MCP
tool, `record_index` shows who is live, and the CI rule *"the kernel contains no register
declaration"* gains one named exception with its reason.

```yaml
register: session            # declared by the KERNEL — the only one
seq_prefix: "S"
fields:
  - { id: client_id, type: text, unique: true }     # the agent runtime's own id, for re-attach
  - { id: title,     type: text }
  - { id: repo,      type: text, index: true }
  - { id: host,      type: text }
  - { id: state,     type: enum, values: [active, idle, handoff, done, abandoned], default: active,
      transitions: { active: {to: [idle, handoff, done, abandoned]}, idle: {to: [active, done, abandoned]},
                     handoff: {to: [active, done]} } }
  - { id: next,      type: text }                    # THE one next step. "carry on" is not resumable
  - { id: tried,     type: list, of: {type: text} }  # dead ends — the highest-value field
  - { id: notes,     type: list, of: {type: text} }  # reasoning, not the diff
  - { id: last_seen, type: instant }                 # a plain instant the KERNEL writes at step 6 on every write from this session — not a derivation
```

*(An earlier draft wrote `last_seen` as `derive: { touched_by: self }` — a combinator the closed list
of seven does not contain — and left `active → abandoned` out of the transitions, so the sweep's own
write would have been refused at step 5.)*

| Rule | Mechanism |
|---|---|
| **Staleness is derived, never stored** | `stale` = `last_seen` older than 45 minutes; computed at read. A session that crashes never gets to mark itself dead |
| Death is written at 12 hours | a scheduled sweep — a `schedule` row of kind `purge`, hourly, run by `system` — moves `active`/`idle` past 12 h to `abandoned`. **`list` never writes** |
| **Every agent write resolves to a session** | the ladder from the brain: a named id that exists → heartbeat; a named id that does not exist → discarded; the client id → re-attach; a live session on the same host and repo → adopt; else **open one** with `source: auto`. Never for a browser |
| `event.actor` becomes the session | `S42`, not `agent:claude`. The actor grammar in [30-BLUEPRINT](30-BLUEPRINT.md) §3 gains the shape |
| Two sessions in one working tree | `record_index` returns `same_repo: [S47]` and the hook prints the warning verbatim: *"Two sessions in one working tree overwrite each other. Coordinate or stop."* |
| The hook, not a habit | SessionStart and SessionEnd hooks ship **with the skill**, user-scoped, and exit 0 on every failure — *"a brain that is unreachable is an inconvenience"* |

**`member.seen_at` — the read mark: one per person, monotonic, outside the record's rows.** The
brain stores it as `MAX(seen)` so a late device cannot move it back, and **not** in the document, so
a read is never a compare-and-swap write. BrainDog: a column on the kernel `member` table —
materialised here for the first time; [20-COLLABORATION](20-COLLABORATION.md) §1 described the
table and no DDL had it — updated with `MAX` by `markRead({ upTo })`, and `whatsNew(cursor)` defaults
to it. That is *For You* — *"what happened while you were not looking"*
— as a kernel read rather than a screen.

**`boot` joins READ+.** The brain's first screen is one call: the lean document, tasks, the read mark,
and the ≤60 audit rows since it. BrainDog's `boot()` returns the index, the live sessions, open
suggestions, and `whatsNew` — **one round trip to a useful first paint**.

**`suggestion` gains `defer_until` and `defer_why`.** The brain's Decide screen has a third verb
between decide and dismiss, and open questions are ranked by a capped cost of delay. Two columns, one
sort.

### 2.2 · The vault, brought up to the brain's standard

[12-SECURITY](12-SECURITY.md) §6 had envelope encryption and AAD binding. The brain's vault, built
2026-09-01 after an owner decision (SG24 → D39, *encrypted-in-brain*), has five things it did not:

| Brain mechanism | Why it matters | Now in BrainDog |
|---|---|---|
| **RFC 8628 device-authorisation grant** — a device shows a six-digit code, the owner approves it from a session that is already his | *"the thing asking is not the thing holding the identity"* — a CLI on a VPS, an agent, a browser that has never opened the vault all ask the same way. **The code is not the security**; it proves the approver is looking at the device that asked | §6.1 of [12-SECURITY](12-SECURITY.md) and the `device_grant` kernel table, [30-BLUEPRINT](30-BLUEPRINT.md) §1; **and it is the enrolment flow for the tier-C runner** — a 90-day bearer stored as `token_hash`, no keypair — which had its own bespoke one |
| **`opened` and `last_opened` on the row** | one secret per request, every read counted **and visible**. *"The XSS is not prevented — it is made slow and loud, which is the honest claim"* | the `grant` table gains both; the Vault screen draws them |
| **`kek_id`** — a fingerprint of the key that wrapped the row | without it, rotating the root key turns every row into a WebCrypto error that reads exactly like corruption, *"on the one screen where 'the data is gone' and 'the key changed' need different answers"* | `grant.kek_id`; a mismatch is `409 WRONG_KEY`, never *corrupt* |
| **Reveal is a `POST`, never a `GET`** | no URL, no history, no `Referer` | the RPC is `openGrant(id)` in the VAULT group — a browser session only, every token refused with `403 NEEDS_BROWSER_SESSION`; it returns sealed material and **the Worker decrypts, the record never sees plaintext** ([ADR-062](16-DECISIONS.md)). There is no readable address |
| `bytes` and `hint` on the row | *"a 3.2 KB env file"* versus *"a 64-character token"* without opening anything — most of what the owner needs at a glance | two columns |
| A denied grant request is **kept** | *"I said no to a request I did not make"* is the single most important line the table can produce | `status: denied` rows are never purged |

### 2.3 · Refusals that do not leak, and one that refuses to repair

Carried from the brain's worker and MCP layer into [30-BLUEPRINT](30-BLUEPRINT.md) §6:

- A `401` says only `unauthorized`. A `500` is bare. No CORS anywhere. Every JSON answer is `no-store`.
- **The login lockout is sticky, reservation-before-compare, and fails closed** — and **agent tokens bypass it deliberately**, so an agent tripping the ten-strike block cannot lock the owner out of his own record.
- **`guardText`: refuse a JSON-quoted string and a string with literal `\n` and no real newline.** Two such writes corrupted the brain's record on 2026-08-30 and were invisible on read-back. *"It refuses rather than repairing."*
- The asset store: content-addressed, type sniffed **from bytes never from the header**, **SVG refused (415)**, 2 MB, `default-src 'none'; sandbox`, `noindex`, the URL is the capability. All now the rules for `file` and `/a/<sha256>`.
- The export excludes `auth_fail` — and every other `dog_section = 'local'` table: `token`, `device_grant`, `observation`, `job`, `job_event` — while `grant` rows and the KEK-wrapped `vault_key` travel **sealed** by default and `--redact-grants` drops the ciphertext ([03-DOG-FORMAT](03-DOG-FORMAT.md) §5). It flags `auditTruncated`, always writes `latest`, and a failed snapshot writes an `export` event with `note: 'failed: <reason>'` and opens a suggestion to re-run it — *"a backup that silently gave up is worse than none."* *(An earlier draft said the export excluded the vault and wrote a `blocker` event; `blocker` is not an event kind and the vault's ciphertext is what the format carries.)*

---

### 2.4 · The five commits after the trace

The brain did not stop when the trace was taken. Each commit between `14fe0d7` and `2451e4f` was read and
placed; nothing in them needed a new mechanism, and four of them carried a lesson worth a rule.

| Commit | What landed in the brain | Where it lives here |
|---|---|---|
| `f32ffb6` | `.secrets` retired: 72 credentials into the vault, verified byte-identical before deletion; three things moved *out* because the vault cannot hold its own key; an audit-note leak found by the harness (`opens` prose on the activity screen); seven harness assertions rewritten to where the property now lives; the runner live under a hardened systemd unit | [12-SECURITY](12-SECURITY.md) §6 and §8 · [20-COLLABORATION](20-COLLABORATION.md) §8 · [26-BYO-INTELLIGENCE](26-BYO-INTELLIGENCE.md) §5 · [18-BUILD-TOOLKIT](18-BUILD-TOOLKIT.md) §6 |
| `46334fd` | Spark's second mode — a live job transcript with five properties that beat the terminal, `?after=` high-water polling, leave-and-return, `Esc` back-then-out | [23-ASSISTANT-UI](23-ASSISTANT-UI.md) §3.1 · [19-INTERFACE](19-INTERFACE.md) §4 |
| `d75939a` | the claim long-polls: 15.4 s → under 1.5 s *and* 43,200 → ≈4,300 requests a day; twenty seconds not thirty; an abort at wait + 10; `idle_ms` kept for a runner that cannot hold a connection | [26-BYO-INTELLIGENCE](26-BYO-INTELLIGENCE.md) §5 · [33-CONTRACTS](33-CONTRACTS.md) §11 |
| `04c714b` | two money-audit findings: the forecast joined net worth to liquid cash and was right by coincidence; a draft wiped by its own screen finishing loading; and *assert on the code shape, never on the file* | [08-METRICS](08-METRICS-AND-ANALYTICS.md) §3 · [22-FRONTEND](22-FRONTEND.md) §7 · §10 below |
| `2451e4f` | an e2e file defaulted to a dev-server port copied from a scratch file | [22-FRONTEND](22-FRONTEND.md) §7 · 18 §6 |

## 3 · The data-model additions

Fourteen, each traced to the brain feature that needed it. All are keys inside declarations that
already exist; none is a new kind, a new tool or a new table except where marked.

| Addition | Brain feature it carries | Shape |
|---|---|---|
| **`derive:`** — a row-level derived field | tier from four judgements; `currency` from the account; the plan's countdown | `{ id: score, type: int, derive: { sum: [rev, unblock, clock, cheap] } }` · `{ id: tier, type: enum, values: [low, medium, high, urgent], derive: { band: { of: score, edges: [40, 60, 80] } } }` — `band` maps *n* edges onto the field's own *n+1* `values:` · `{ id: currency, derive: { via: account, field: currency } }`. **Never stored**, computed at read and inlined by the compiler in a `where:`; not indexable, and says so — **with one exception:** a derived field carrying `unique: true` is materialised into `fields` at step 6 so the partial unique index has an expression to cover, the only stored derivation ([ADR-027](16-DECISIONS.md)). The seven combinators of [02-DATA-MODEL](02-DATA-MODEL.md) §5 — `sum diff product ratio band via normalise` — row-scoped only. Kernel-written fields (`session.last_seen`, the identity `hue`) are not derivations |
| **`required_when:`** | *"Never set a tier without `tier_why`"* — prose only in the brain | `{ id: tier_why, type: text, required_when: { field: tier, present: true } }` — one `where:` leaf, evaluated against the row being written. **Not an eighth consumer**: it borrows the leaf syntax and never compiles to SQL — [02-DATA-MODEL](02-DATA-MODEL.md) §5 |
| **`unique: true`** on a field | learning fingerprint → `409 ALREADY_KNOWN`; `session.client_id` | a partial unique index; the refusal names the existing row's spoken id |
| **`immutable: true`** on a field | a transaction's currency; an entity's id | set once, refused thereafter with the reason |
| **`by:` on a transition** | learning `proposed → active` is `HUMAN_ONLY`; deciding is the owner's | `transitions: { proposed: { to: [active], by: decide } }` — a person level from [20-COLLABORATION](20-COLLABORATION.md) §1. **Generalises the brain's two hard-coded routes into a declaration** |
| **`delete: refuse_while_referenced`** on a register | an account with transactions → `409, archive instead`; a transaction that settles an instalment | a reverse-reference check at delete, naming the count and the register. `ref` stays soft everywhere else |
| **`repeat:` gains `bymonthday: [15, -1]` and `workday: previous\|next\|none`** | *"a salary paid twice a month has DAYS"* — the 15th and the last day, moved back to Friday off a weekend; monthly clamped to month end | RRULE cannot say the weekend shift; one post-rule can |
| **`pairs:`** on a register | transfer detection — two rows, same \|amount\|, opposite sign, different account, within 4 days, paired **once** | `pairs: { on: [currency, abs(amount)], opposite: amount, across: account, within: 4d, mark: moved }`. Rows are **marked, never hidden**. A bounded self-join the kernel implements, because every ledger needs it and a `where:` cannot say it |
| **`running`** aggregation | the runway walk; a plan's `after_minor` countdown | `value: { running: { sum: amount }, from: opening_balance, stop: { lt: 0 } }` over an `order:` — a cumulative reducer with an optional stop condition, returning the first row that crosses. `from:` is a literal or a field on the source rows, never a metric; `order:` is the walk order |
| **`trend`** aggregation | the measured revenue forecast | series-only. Log-linear fit, **significance-gated** (\|t\| ≥ 2.1, n ≥ 6) → compound growth with a band, or *flat*; a projection capped at 10× **with the cap reported** |
| **`snapshot: { grain: day, into: series.<id> }`** on a metric | net-worth history | its own schedule kind, `snapshot`; materialises the metric into `metric_point` nightly: **overwrite yesterday** (a Friday text can land Saturday), backfill fills gaps only, today appended live and flagged, `missing` counted |
| **FX as-of in a metric** | *"converted at each day's own rate"* | `value: { sum: { product: [amount, { lookup: fx, by: currency, as_of: day }] } }` — the `fx` register's fields are `currency base rate as_of source`; nearest rate **on or before**, else forward with `forward: true`, else **excluded**. §3.1 |
| **`compare:` comparability gate** | `−94%` in green, the morning after a guard shipped — one row against nine | a delta renders only when the window spans ≥ 7 days, both windows have rows, and the prior has ≥ half the current's count. Otherwise nothing, never a percentage |
| **Bucket semantics** for `group_by: month` | a month of only transfers is *empty*, not zero; the first month is *partial*; bars walk the **contiguous run** | `empty` (nothing after exclusions), `partial` (unfinished, or the ledger began inside it), `full`; averages over `full` only; leading zeros trimmed as *"data starts here"* |

### 3.1 · Refuse to guess, but do not refuse the total

BrainDog refused mixed-currency sums **at install**. The brain does something better at **runtime**:
convert every row it can, **list** every one it cannot, and make the total wear **"≥"**. A metric
with an FX source now does exactly that — `noRate: [{ amount, currency }]` is part of the result (money is always `{ amount, currency }`, never a `minor` key), the
figure is prefixed, and the note reads *"No rate for AED — those rows are left out."* The install
refusal stays for a metric with **no** FX source. **A wrong total is worse than a partial one; a
partial one that pretends to be whole is worst.**

### 3.2 · The rule engine, made precise

[07-INGEST](07-INGEST-AND-RULES.md) §6 had rules without a precedence policy. The brain's is
**priority ascending → longest pattern → id**, so specificity wins by construction (`UBER EATS` beats
`UBER` at equal priority) and nobody has to remember to set a number. Three more things it has:

| | |
|---|---|
| **A direction guard** | a rule pointing at an income category is skipped on a debit — expressible as a `when:` clause, but the pack ships it |
| **`hits`** | how many rows a rule has filed, and *never* for one that has not — drawn as a `warn` |
| **Dry run with win/loss attribution** | `braindog rule test` returned matches; it now returns `won`, `lost`, and **`takenBy: {rule: n}`** — which existing rule already claims the rows this one would. A candidate rule is ranked among the real ones with the id it *would* get, so it loses the tiebreak honestly |
| **`braindog rule apply --dry`** | re-run every rule over rows a field is still empty on — the brain's bulk recategorise. **No undo by design**; the dry run is the undo |

And one rule that generalises past money: **a field set by a person is never overwritten by a rule
or a connector re-sync.** The brain's `pinned` column is this for one table. In BrainDog it is the
write path checking `event.actor` on the field's last write — a person's `set` beats a rule's `tag`
and a connector's upsert, everywhere, by construction.

---

## 4 · The dialect, completed

[05-BLOCKS](05-BLOCKS-AND-THEMES.md) had `{{path}}` and sixteen block kinds. The brain's renderer has
been used for a month and its rules were learned from that use — **a census of 7,138 rendered lines:
`spec` 194, `note bad` 43, `note warn` 28, `stat` 23, `bar` 20, `chips` 19, `steps` 18.** `spec` is
the workhorse, and nothing in BrainDog's writing guide said so.

### 4.1 · The `{{path}}` grammar, which was never written down

| Names | Example |
|---|---|
| a field on this row | `{{status}}` `{{effortDays}}` |
| a metric | `{{due-30d}}` |
| a row by spoken id, then a field | `{{tasks#125.state}}` — the register is required, because every register has a `#1` |
| a row by spoken id, then a nested path | `{{entities#3.revenue.monthly}}` — `bake` is that row's `title`, not its id, and a bare row id is not a form |
| a **count**, never the contents | `{{tasks.count}}` `{{tasks.open}}` — `register.count`, or `register.<state value>` for the rows in that state |
| the whole record | `{{portfolio.revenue}}` — a metric with `source: *` |

Four rules from the brain's month of use, now BrainDog's:

1. **A path that names nothing renders as the path, marked** — never blank, never `undefined`, **never a zero.** *"A product that earns nothing and a product nobody measured are not the same product."*
2. **Long fields are unavailable** — `document` and `note` are arguments, not figures; a paragraph interpolated mid-sentence is a worse lie than a stale number.
3. **Formatting is decided for you**: money as money, a rate as a level, billions with a suffix, a status with its glyph. Do not wrap a path in `**`.
4. **Code spans are lifted first**, so a literal `{{…}}` from another system survives in backticks.

### 4.2 · Typed interpolations — eight

The brain has ten, four of which are the same thing for four registers. BrainDog has spoken ids on
every register, so those four collapse into one:

`{{date:2026-09-26}}` (ahead; **links to the calendar**) · `{{day:2026-04-10}}` (behind; no link) ·
`{{until:…}}` · `{{ago:…}}` · `{{money:129900 EGP}}` (minor units — renders `EGP 1,299.00`) ·
`{{quantity:1.4 m}}` · `{{pct:-46.3}}` · `{{ref:tasks#241}}` (any row, by spoken id — links)

**Eight, counted.** *"Use `date:` for anything ahead and `day:` for anything behind"* — a future date
raises *what else is happening then*, which is why only the forward one links. **A percentage
carries no colour, on purpose** — down is not bad; a fall in churn is the work succeeding. **The
argument is a literal or a path**: `{{until:2026-09-26}}` and `{{until:renews}}`, `{{money:cost}}`,
`{{ref:parent}}` — a literal starts with a digit or `-`, a path with a letter. An argument that does
not parse renders as the author's text, marked unresolved. The two forms cannot collide: a path has
no colon. *(An earlier draft wrote `{{money:1299 EGP}}` rendering `EGP 1,299` — major units, against
the one money rule the whole record keeps.)*

### 4.3 · Evidence tags

`{verified}` · `{inferred}` · `{estimate}` · `{unknown}`, each with an optional source —
`{verified: Ministry of Labour Decree 2026}`. Inline, so they work inside a blocker, a reason, a
list item. A source runs to the first `}` and may not contain `|` or `}`; a source that is a row in
the record is written as a citation, `{verified: {{ref:decisions#41}}}`, so it links. **`{unknown}` is the one that carries weight: it is not a weak claim, it is a hole, and a
hole is a task somebody has to close** — so it renders as an affordance, the same rule as the
uncategorised row in §4.5.

### 4.4 · Identity: a mark and one accent per thing

The brain's rule is *"colour means which project, everywhere in this app"* — one accent per entity,
generated in OKLCH and validated as distinct in both themes, **never hand-picked**, and never the only
signal: the name always sits beside it. [13-UI](13-UI.md) closes intent colours at four and
[28-THEMING](28-THEMING.md) refuses per-page themes. **Identity is a third axis, not a fifth intent
and not a theme**, and it needs saying:

```yaml
register: entities
identity: { mark: mark, accent: hue }    # a register may declare its rows HAVE an identity
fields:
  - { id: mark, type: enum, values: [...the glyph library...] }
  - { id: hue,  type: int, immutable: true }   # generated by the KERNEL at create (ADR-028) — never derived, never picked
```

| An accent may colour | An accent may never colour |
|---|---|
| the row's mark, chip and avatar; its calendar dot; its series on a chart | text, an intent, a surface, a border that carries meaning |

The generator is the theme validator's: every accent is checked ≥ 3:1 against every surface **and**
pairwise distinct under all three dichromat simulations, or it is regenerated. A retired row is
achromatic. And the glyph library is the theme's, not the pack's — 122 glyphs in the brain, thirteen
of which are refused *as marks* because they are controls.

### 4.5 · Renderer rules learned in production

| Rule | Why |
|---|---|
| `stat` is capped at **six** | *"a seventh tile is a table"* |
| A `chips` row needs a number **and** a word, or it is dropped | an icon alone is a rebus; a colour alone is unreadable to a tenth of readers |
| The columns of a chip do not move; an empty field is left empty | shifting left is how a tone lands in the value slot |
| A `bar` row whose value is not a number keeps its words and **loses its bar** | a bar at zero claims the value *is* zero |
| A `bar` whose rows name paths is a live chart; one whose rows are typed numbers is a snapshot, **so it carries dates** | the whole reason `{{path}}` exists |
| A `note` heading is a **kicker** — two or three words, small caps | the sentence goes in the body |
| Tone aliases: `earn→good` `danger→bad` `accent→info` `risk→warn` | an author who reaches for a role name gets the intent, not a refusal |
| The fence scan is **flat** — a fence inside a `note` ends the note | one parser, no nesting, nothing to escape |
| **A hole is a task, not a value** | the uncategorised row sits **last, in `warn` (its tone column is `hole`, a `bar`-only tone), outside the bar scale, and is the only row that is a button** — it opens the ledger filtered to exactly those rows. Sorted by size it would set the scale and make every real category a one-pixel stub, *"the chart unreadable because of the thing it reports"* |
| The registers of writing are five, and each has a different constraint | a reply in a terminal (no renderer, answer first, a table the moment two things are compared) · a task note (a phone, weeks later, full markdown) · an option body (comparable without reading both — same headings, same order) · a write-up (length allowed, structure not optional, **open with `chips` or `stat` so the page answers itself before he scrolls**) · an audit note (one sentence, **never formatted**) |

### 4.6 · The write-up skeleton, as actually used

Worth writing down because it is the shape the corpus converged on rather than the one anybody
designed: a `chips` line at the very top with `{{path}}` values · `# Name` and a status line ·
numbered `## N · Title` sections **each opening with a block and then prose** · for research,
`## What is not verified` and `## Sources` · a `## Log` of dated lines at the end · and settled things
marked so nobody re-runs them — *"Settled by research, do not run it again."*

---

## 5 · The first-party packs that carry the brain

Six first-party packs in all — `agents · work · portfolio · money-core · estate · people`. Five carry
brain features; `people` is the counterparty register the money packs refer to, and it is listed so
the count is stated once and does not drift.

| Pack | Registers | Installed when |
|---|---|---|
| **`agents`** | `learnings` · `skills` · `credentials` | **the first agent token is minted** — §8 |
| **`work`** | `tasks` · `tracks` · `dates` | the first `create` into any of them, or by choice |
| **`portfolio`** | `entities` · `plan_steps` | by choice; the shape the brain is |
| **`money-core`** | as [02-DATA-MODEL](02-DATA-MODEL.md) §3, plus `income` · `recurring` · `installments` · `assets` · `snapshots` · `company` | by choice |
| **`estate`** | `services` · `domains` | by choice |
| **`people`** | the counterparties every other pack refers to — `money-core` requires it ([04-PACKS](04-PACKS.md) §2) | when a pack that requires it installs, or by choice |

### The `agents` pack, and why learnings are the half of self-improvement already working

[24-SELF-IMPROVEMENT](24-SELF-IMPROVEMENT.md) designed an *automatic* loop and found the sensing
half missing. **The brain has been running the *manual* half for a month**: a session records what
a future session would otherwise get wrong, as a row with an id, with the failure that produced it
as a mandatory field, and **a human promotes it** — agent-written learnings land `proposed`, in no
digest and no default read, until the owner moves them to `active`. That is the decision gate applied
to instructions.

```yaml
register: learnings
seq_prefix: "LN"
fields:
  - { id: kind,    type: enum, values: [method, fact], required: true }
  - { id: lesson,  type: text, required: true, min: 12, max: 400 }
  - { id: because, type: text, required: true, min: 24, max: 600 }   # THE FAILURE THAT PRODUCED IT
  - { id: scope,   type: ref, register: entities }                    # empty = global
  - { id: topic,   type: text, index: true }
  - { id: fingerprint, type: text, unique: true, derive: { normalise: lesson } }   # → 409 ALREADY_KNOWN; the one derived field that IS stored, because unique: needs an index — ADR-027
  - { id: supersedes, type: ref, register: learnings }
  - { id: state,   type: enum, values: [proposed, active, superseded, reverted], default: proposed,
      transitions: { proposed:   { to: [active], by: decide },
                     active:     { to: [reverted, superseded], requires: [why] },
                     superseded: { to: [active], by: decide } } }   # reverting a replacement restores this
  - { id: why,     type: text, min: 24 }
immutable_when: { field: state, in: [reverted] }    # a reverted learning is frozen; a superseded one can come back
```

*(An earlier draft locked `superseded` rows, which made the "exactly invertible" pair below
impossible — restoring a superseded learning is a state move on a row the lock had frozen.)*

Three rules the brain enforces that the declaration carries: **superseding is not reverting** —
revert when it was wrong, supersede when something more accurate replaced it, and reverting a
replacement restores what it displaced, so the pair is exactly invertible; the read is ordered
**method before fact, global before scoped, newest within each**, forty by default with `truncated`
set honestly; and the four-part test for whether something qualifies — *changes what a session does ·
generalises · a session without it would get it WRONG, not merely slower · has no other home* — is
the MCP resource's description, because it is the thing agents most often get wrong. **Calibration:
most sessions record nothing, and that is the correct number.**

### The follow-up cascade, as a rule with `via:`

*"Ticking a parent ticks its open follow-ups. Reopening does not bring them back."* Both fall out of
one rule on the child register and no reverse rule:

```yaml
rule: parent-closed
register: tasks
when: { all: [ { via: parent, field: state, is: done }, { field: state, is: open } ] }   # via: names the hop, field: the far side
then: [ { move: done } ]
once_per: [entry, parent]
```

Inheritance — a child takes its parent's project, lane and track — is `derive: { via: parent, field:
entity }` with an override allowed. **One level only** is the brain's *re-point to the grandparent*
rule: a `ref` to a row that itself has a parent is rewritten at write, not refused.

---

## 6 · What stays native, and why each one does

[04-PACKS](04-PACKS.md) §6 allows a native tier where craft beats configuration. These are the
brain's features that land there, each with the reason it is not a declaration:

| Native | Why not data |
|---|---|
| **The forecast** — instalments + generated paydays + prorated spending → a line with a first crossing, three knobs, full-screen | it *is* declarable as a closed `forecast` block — `open: metric, events: [...], horizon:` — listed in [08-METRICS](08-METRICS-AND-ANALYTICS.md) §3 as a post-v1 kind that arrives with the money pack, not one of the sixteen. But the plot (stems packed ≥ 90 units apart, scrub by nearest **day** not index, tap keeps the readout and only a mouse leaving clears it, `role="img"` with a one-sentence label) is a renderer, and it is code once |
| The SMS parser's three bank formats | **mostly declarable** — `after/before/between/money/date/enum/text` express all three. What is native: the **skip list** (refunds, PINs, everything else → silent skip *with a reason*), routing `kind × currency → account` with **review on a miss**, and the **fuzzy ledger dedupe** — same account, amount, currency, day ±1, description prefix — which a `where:` cannot say |
| Company sync (Mercury, Stripe) | [25-CONNECTORS](25-CONNECTORS.md) covers the fetch. Native: **per-provider partial failure** (a Mercury outage keeps the last Mercury rows), Stripe's available/pending/in-transit kept apart, and the ordered regex table over counterparty + description |
| The logo proxy | the merchant name **never leaves the Worker**; four icon sources raced; bytes sniffed; a generic-icon hash blocklist. Money-specific, and it is the one exception to *"nothing loads from another server"* |
| Vault crypto, passkeys, the doors | as [12-SECURITY](12-SECURITY.md) |
| The runner | as [26-BYO-INTELLIGENCE](26-BYO-INTELLIGENCE.md), **now with the brain's five refinements**: `--resume <session>` for follow-ups (*"the single most valuable column"*), a distilled event transcript with nine kinds (`start say think tool out limit note end error`), a per-job `seq` high-water mark so a poll is one indexed read, a `cancel` **flag never a delete** (a stopped job is one you want the transcript of), and **`LOST` is deliberately not a status** — *"a status the runner can never write is a status that lies when the runner dies mid-job"*; the list route derives it from a stale `claimed_at`. The statuses are nine — `queued claimed ok needs_decision refused limit error interrupted cancelled` — and the kinds a closed four, `triage · explain · propose · draft`, that the runner's own templates check (26 §4.3); both are `CHECK`s on the kernel `job` table. The runner **distils rather than relays**: a trivial two-turn job emits ~12 KB of stream-json, most of it constant |
| Screenshot mode | §9 |
| The analytics adapters | two vendors' endpoints. The **model** — the series kind (`gauge · flow · cumulative · unique · fact`, declared on the ingest as `writes: { series, kind }`, never a `metric_point` column), the compare window, the partial bucket, the trend — is now declarative |

---

## 7 · Not carried, deliberately

| Brain | Why BrainDog does not |
|---|---|
| The whole-document `PUT /api/db` with `rev` | BrainDog writes rows. The brain's `mergeDocs` — *a lean read that writes back must not delete the write-ups it was not sent* — is a bug class that does not exist without a document write. The *principle* survives: a partial read never becomes a destructive write |
| `lane` meaning two things | the brain uses one word for what a product *is* and who must *do* a task. BrainDog's packs say `lane` for the portfolio and **`for`** for the task |
| Discord as the only door; a 4-digit PIN | passkeys and a magic link, [ADR-011](16-DECISIONS.md). The lockout logic and the agent-token bypass are kept |
| `cycles` | removed from the brain by D12 and still in its empty-document shape. There is no such register |
| The spreadsheet import | one-time; the brain's own contract says *never again* |
| Silently dropping unmatched ingest | the brain drops noise because *"a review queue that is mostly noise stops being read"*. BrainDog **keeps every raw payload** and reconciles the two positions: **kept, not shown.** The pattern loop fires only on three same-shape payloads; the inbox is a fold at the foot of a page, not a queue |
| Player copy — the estate's standard for strings a stranger reads | out of scope: it is about Discord bots. One rule is borrowed for every refusal in [13-UI](13-UI.md) §6: **what happened, then what to do now, in that order; never blame, never apologise, never expose an internal name** |

---

## 8 · No bloat: what a new user sees

The brain has ~190 features and its owner wanted every one. **A new user should see almost none of
them**, and the design already has the mechanism — [29-EMERGENT-PAGES](29-EMERGENT-PAGES.md).

| Day one, empty record | Sees |
|---|---|
| Nav | Home · Decide · Inbox. The spine, and nothing else |
| Registers | none. **Zero.** The first row in a register proposes its page |
| Packs | none installed. Pack selection is the *second* screen, optional forever |
| Sessions | the register exists in the kernel and has **no page and no nav entry until an agent connects** |
| The `agents` pack | **installs itself when the first agent token is minted** — learnings, skills and credentials appear the moment there is an agent to use them, and not before |
| Money, estate, portfolio | each one screen when its pack is installed, and its emergent pages after that |
| Themes | one. The picker appears at the second theme |
| Spark | absent without a model; present as a palette row with one line otherwise |

**The rule that makes this hold:** a capability appears when its *trigger* fires, not when the
product could support it. The brain grew to 190 features because one person needed them; BrainDog
can carry the same 190 and show a stranger six.

---

## 9 · Accessibility: the brain's measured bar

The brain's app is used by one person on a phone twenty times a day, and its rules came from that.
They are checked against BrainDog's, and three change it.

| Brain rule, and how it is enforced | BrainDog |
|---|---|
| **Every control ≥ 43.5 × 43.5 under a coarse pointer, counting `::before`/`::after` hit boxes** — the specimen check, in CI | the one sentence every document now uses: *Targets are designed at 44 × 44 CSS px (SC 2.5.5 AAA, by choice — SC 2.5.8 AA's 24 × 24 is the legal floor) through an invisible hit box; CI measures every control under a coarse pointer, counting `::before`/`::after`, and fails below 43.5 × 43.5 on either axis.* **The pseudo-element clause is new** and it is the one that catches a chevron drawn as a 20 px glyph inside a 44 px box that is not the hit target |
| **Every child of a row shares a vertical centre within 1.5 px** | new. It is the assertion behind *"controls do not sit on rows being read"* |
| **Every field is exactly one height per pointer size** | [05-BLOCKS](05-BLOCKS-AND-THEMES.md) §6's *"a width query never changes a control's size"*, made a measurement |
| **Contrast ≥ 5.4:1 measured, both themes — *"do not fix it"*** | BrainDog's gate is 4.5 AA. The brain's is higher and it is right: at 14.5 px body on a phone in daylight, 4.5 is the floor and 5.4 is what reads. The house theme targets **≥ 5.4 for `ink` and `ink2`**, and the gate stays at AA |
| **Do not raise the type scale** — a fixed eight-step scale, 12 → 34 px, rejected twice when raised | new as a *rule*: *"if a screen is hard to read, the fault is in what it says and how it is arranged. Use weight, colour and space."* The scale is a token; changing it is a theme, not a fix |
| Screenshot mode — **everything blurs unless the app can prove it wrote the words**; the allow-list is *provenance, not pattern* | new — §9.1 |
| `role="status"` for block failures, one `alert` for the aggregate; `aria-busy` on skeletons; save state **not** announced (a gap the trace found) | [19-INTERFACE](19-INTERFACE.md) §6 has the first two; the third is fixed here: saved/reloaded reach a polite live region |
| A decorative enhancement is never the only thing drawing a state (rAF does not run in a hidden tab) | new rule in [22-FRONTEND](22-FRONTEND.md) §7 |
| Open and close are not symmetric — a panel opens in 280 ms (`--d-enter`) and closes in 160 (`--d-exit`); opening is watched, closing is decided | [13-UI](13-UI.md) §9 has the 300 ms ceiling and the tokens; **the asymmetry is new**. *(An earlier draft quoted the brain's 400/350, which is above the ceiling.)* |

### 9.1 · Screenshot mode

A privacy mode the brain built for sharing a screen: under `html[data-shot]`, every figure and every
string the record holds is plated and blurred; chrome stays legible. Two properties make it real
rather than cosmetic, and both are tests:

1. **The allow-list is provenance.** Only literals a developer typed into source are legible. A
   label built by concatenation at runtime blurs — which is why a toggle's two states are two full
   literals. A pattern-based redaction would have let *"GREEN MARKET"* through as a placeholder, and
   once did.
2. **Layout is byte-identical off → on**, asserted by element boxes and page height, and **pixel
   readback** proves redacted digits re-photographed as `0` and as `8` are identical.

BrainDog carries it as a kernel-level display mode with the same two tests, because a record holding
credentials and money will be shown to somebody over a shoulder.

---

## 10 · Defects in the brain, not to inherit

The trace found these in the brain itself. They are recorded so the successor does not reproduce
them by copying.

| Defect | Lesson for BrainDog |
|---|---|
| The skill lags the code by ~48 hours; two `SKILL.md` copies drift; the learnings table exists *partly to route around it* | **the contract is generated from the schema.** [10-MCP](10-MCP.md) §7 already says the schema beats the prose; this is why |
| Entity `status` and `lane` are unvalidated; the live data drifts | enums |
| `/api/capability` exists *"for the SessionStart briefing"* and **nothing calls it** | a route with no caller fails the *every route has a verdict* test |
| The mirror omits services, domains, learnings, skills and credentials | `export --mirror` renders every register or it is not a mirror |
| `/api/import` bypasses the compare-and-swap | there is no import that bypasses **validation**: `import` goes only into an empty record (`IMPORT_NOT_EMPTY`), verifies the signature and manifest, refuses a newer `user_version`, rebuilds `entry_fts` and writes one `import` event — [33-CONTRACTS](33-CONTRACTS.md) §9. It is not the write path, because `event` rows arrive with their actors intact |
| A bare `/` opens Work; the contract says For You. No shortcut reaches For You. A help sheet says five destinations; six are drawn | the nav is rows, the shortcuts are derived from the rows, and a test asserts the help sheet matches |
| Two empty states pass words as HTML attributes and render a glyph and nothing | the `Empty` primitive takes one shape, and the parser refuses an unknown prop |
| The save-state dot is `aria-hidden` — saving and saved are never announced | §9 |
| "Match the system" is unreachable once a theme is chosen — the only UI offers the *opposite* of system | a three-way segment, not a toggle |
| A track's "Read it full-screen" opens an empty reader — the caller passes `src`, the reader reads `body` | a primitive's props are a type, and a stray prop is a compile error |
| Screenshot mode's words stay in the DOM — *documented as not a privacy boundary* | carried with the same honesty: it is a **display** mode for a shoulder, not a redaction of the payload |
| A stale harness (`capability.mjs`) contradicts the rebuilt Vault and is green because it is not in CI | **every harness is in CI or is deleted** |
| `.rain.ps1` in three places — a `\b` eaten by an escape | the docs are linted for their own commands |
| Root scratch files not covered by `.gitignore` | `_*` and `__*` prefixes are ignored from commit one |
| The forecast line joined net worth to liquid cash and was right only because nothing illiquid had a snapshot yet | **one measure across the join**, and a derivation lives in a metric where a test can reach it, never in markup — [08-METRICS](08-METRICS-AND-ANALYTICS.md) §3 |
| A transaction draft was wiped by its own screen finishing loading | a form is seeded on a transition, never on a dependency; a default fills only the empty case — [22-FRONTEND](22-FRONTEND.md) §7 |
| `POST /api/credentials` logged an `opens` sentence that the activity screen then drew | a `grant.*` event note carries id and kind, never label or opens — [12-SECURITY](12-SECURITY.md) §8 |
| An e2e file defaulted to a dev port copied from a scratch file; four patch scripts asserted on a whole file and one hid a runtime fault | harness constants come from one module; assert on the code shape — 22 §7, [18-BUILD-TOOLKIT](18-BUILD-TOOLKIT.md) §6 |

---

## 11 · What this costs

| | Days |
|---|---|
| Kernel: `session` register, `member.seen_at`, `boot`, suggestion defer, vault refinements, refusal hardening | 6–9 |
| Data model: the fourteen additions in §3 | 12–16 |
| Dialect: path grammar, eight typed kinds, evidence tags, identity, renderer rules | 5–7 |
| The `agents`, `work`, `portfolio` and `people` packs | 10–13 |
| Money additions: running, pairs, snapshot, FX as-of, the forecast block | 10–14 |
| Screenshot mode | 3–4 |
| **Total** | **≈46–63** — 6+12+5+10+10+3 = 46 · 9+16+7+13+14+4 = 63 |

*An earlier draft said 42–58, with the packs row at 6–8 and no line for `portfolio` or `people` —
the exact defect [15-ROADMAP](15-ROADMAP.md) §1 Defect 1 describes, reproduced in the document that
was meant to fix it.*

Added to [15-ROADMAP](15-ROADMAP.md) §1 as its own line. **None of it changes §1b**: the record and
nothing declarative still ships first, and every item here is either a correction to the kernel or
lands in a pack a new user never sees.

---

*Next: [15-ROADMAP](15-ROADMAP.md) for where these land, and [30-BLUEPRINT](30-BLUEPRINT.md) §1 for
the `session` DDL.*

# 25 · Connectors — attaching the record to your projects

> *"…that it can be dynamically attached to your projects, read analytics data, all that stuff, all
> dynamically."*

Today's ingest is **push-only**: email, webhook, paste, API — four of the five channels in
[30-BLUEPRINT](30-BLUEPRINT.md) §1. This is the other direction — BrainDog
reaching out on a schedule, authenticating, and writing typed rows.

Every API fact below was fetched or **live-probed on 2026-09-01**.

---

## 1 · The bug this starts from

[07-INGEST](07-INGEST-AND-RULES.md) §1 lists **five** channels — `inbox_raw.channel` is
`email | webhook | pull | paste | api` — and one of them is `pull — a scheduled fetch of something you
already own`. [04-PACKS](04-PACKS.md) §1 repeats it. *An earlier draft of all three called the channel
`cron`; the kernel's word is `pull` — schedule kind `pull`, outbox kind `pull.fetch`, event kind `pull`.*

**It is specified nowhere.** No URL, no auth, no pagination, no cursor, no error policy. Exactly the
same class of defect as the `series` chart that was advertised with no way to feed it: a capability
that exists as a table row.

So this is not a new kind. **`ingest` gains a `fetch:` block when `channel: pull`, and the eight
pack kinds stay eight.**

*(Revised September 22nd 2026. A connector is still not a new kind. The kinds grew for other reasons: `script`, a
person's or an agent's code, joined them in kernel migration 12, and `job` since; `KINDS` in
`packages/kernel/src/declare.ts` is the list. §12 says how a script stands beside a connector, and why neither
replaces the other.)*

### But the price is real, and it is not the schema

> **[04-PACKS](04-PACKS.md) §7's best row — *"a pack CANNOT make an outbound call of any kind"* —
> becomes false.**

That row is load-bearing: the security argument is an *enumeration*, and this removes an entry from
it. What is bought back is a line in the install diff (§7 rule 9). Say it out loud in the doc rather
than letting a reader find it.

---

## 2 · The declarative ceiling, measured rather than guessed

A declarative connector format has exactly two failure modes: it becomes a programming language in
YAML, or it cannot express real APIs. **The question is where the line actually falls, and it is
answerable** — Airbyte has 609 source connectors in public git.

Read at commit `604ae70`, 24,190 tree entries, plus a random 60-manifest sample (seed 7, 3.36 MB of
YAML parsed):

| | |
|---|---|
| `manifest.yaml`, **zero** custom Python | **74.7%** (455) |
| manifest + custom Python | 12.8% |
| Pure Python | 12.5% |

That 74.7% looks like a mandate for declarative connectors. It is not, until you ask what the YAML
needs:

| Inside the pure-declarative tier | |
|---|---|
| Substitution only | **49%** |
| + date/time macros | **71%** |
| Needs a **real expression language** — booleans, `if`/`else`, arithmetic, filters | **29%** |

**And the single most useful number in this research:**

> **206 of 214 macro uses — 96% — are date and time handling.**
>
> Airbyte needs an expression language mostly because **its cursor is a string the author formats
> themselves.** Ship a *typed* incremental window with declared formats and the demand evaporates.

That is the one design lever, and everything in §3 follows from it.

### Three measurements that hurt

| Measurement | Value | Consequence |
|---|---|---|
| `SubstreamPartitionRouter` — fan-out over a **fetched** list | **47%** (28/60) | *"list projects, then for each, fetch X"* is nearly half of real connectors. **This format refuses it** — §5.3 |
| `url_base` interpolated from user config | **20%** (12/60) | including Airbyte's own PostHog connector. **A user-supplied host is the SSRF hole, shipped, in one fifth of connectors** |
| Manifest size | median **26 KB** | **These are generated artifacts, not hand-written files.** The premise needs adjusting: declarative connectors are *readable and diffable*, not *typed into a text editor by a user* |

---

## 3 · The declaration

### 3.1 · Substitution, never evaluation

**Five placeholders, closed** — `{since}` · `{until}` · `{page}` · `{probe.<name>}` ·
`{grant.<name>}`. The first two are the window edges, computed **by the kernel**; `{page}` is the
paginator's next value; `{probe.<name>}` is one named value from the single preflight; and
`{grant.<name>}` is a *non-secret* field on the bound credential — an account id, a property id, a
region, never a key.

**Five formats, closed:** `:date` · `:instant` · `:epoch_s` · `:epoch_ms` · `:int`.

**No operators, no functions, no arithmetic, no conditionals, no filters.** Every value is either a
literal the declaration wrote or a named value the kernel computed. Response paths are **one grammar**,
[43-SPEC-EXTRACT](43-SPEC-EXTRACT.md) §4.4's: literal keys, `[n]`, `[-1]`, `[]` at most once, at most
sixteen segments, own properties only; `select` returns a list, and the same grammar serves `read`,
`probe.read`, `expect` and `page.from`. A brace group that matches no placeholder is literal text, so a
GraphQL body survives ([42-SPEC-DECLARE](42-SPEC-DECLARE.md) §4.2). That covered **every** response shape
in this research.

For contrast: Airbyte has 17 interpolation variables, ~14 macros, and full Jinja including
`predicate: "{{ 'code' in response }}"`. §2 measures what that costs them.

### 3.2 · The grammar

```yaml
ingest: stripe-ledger
channel: pull                           # the kernel's word — never cron
fetch:
  base: https://api.stripe.com          # a literal origin. NO placeholders, ever — §7 rule 4
  path: /v1/balance_transactions
  auth:
    kind: bearer                        # a closed kernel list of eight — §5.2
    grant: stripe-read                  # a vault label, never a literal
    require_scopes: [balance_transaction_source_read]   # proven at bind time — §7 rule 6
  headers: { Stripe-Version: "2026-08-26.dahlia" }      # Authorization is RESERVED — §7 rule 2
  query:
    limit: 100
    "created[gte]": "{since:epoch_s}"
    "created[lt]":  "{until:epoch_s}"
    "expand[]": [data.source]           # an ARRAY value repeats the key

  schedule: { every: 24h, at: "04:10", tz: record, jitter: auto }

  probe: { path: /v1/account, read: { default_currency: settings.default_currency } }   # exactly one, no chaining — §5.3
  # for_each: [acct_live, acct_test]      # NOT v1 — deferred with conditional, on_error.backoff, on_error.pause_after; §5.3, §6

  window:                               # the typed cursor. THIS is what kills the macros.
    grain: day
    start: 2026-01-01
    lookback: 2d                        # re-ask, because late rows exist
    max_span: 31d

  source_retention: 90d                 # what the PROVIDER keeps. Drives a refusal — §6

  page:
    kind: cursor_param                  # cursor_param | offset | page_number | link_header | keyset | none
    param: starting_after
    from: data[-1].id
    more: { path: has_more, is: true }

  expect:                               # §5.1 — assert the server did what you asked
    - { path: object, is: list }

  # conditional: etag                   # NOT v1 — a 304 is a no-op, not a failure, when it returns
  read: { format: json, rows: data }    # json csv xml html_table text — 43 §5.5
                                        # csv takes delimiter: (default ,) and html_table takes table: (1-based, default 1)
  limits: { response_bytes: 2000000, rows_per_run: 5000, max_pages: 40, timeout: 6s }   # the first two are extraction's caps — 43 §13 D16

  on_error:
    error_when: [{ status_in: [429, 500, 502, 503, 504] }]   # retry
    fatal_when: [{ status_in: [400, 401, 403, 404] }]        # stop and notify
    # backoff: …                        # NOT v1 — the ladder is the schedule's, 09 §1, and is not declared here
    honour: retry_after                 # a HINT — not every provider sends it
    # pause_after: 3                    # NOT v1

map:
  at:     { path: created, type: instant, from: epoch_s }
  amount: { path: [amount, currency], type: money, minor: true }
  kind:   { path: type, type: enum, values: [charge, payment, refund, payout], other: other }

writes: { register: ledger, confidence: exact }   # or: writes: { series: <id>, kind: gauge, unit?: count, scale?: 1 } → §8; kind: gauge | flow | cumulative | unique | fact — 08 §3
dedupe: [id]                              # a field list (exact), or { near: { on, day, prefix } } — 07 §2
on_conflict: update
```

`type:` values are the **existing register field types** minus five — `ref`, `file`, `secret`, `quantity`
and `list` cannot be mapped from a response — and no new type system; `from: epoch_s | epoch_ms` reads an
epoch into a `day` or `instant`; `currency:` names the code for a money read from a single path, where the
two-path form reads the code out of the response; `format:` names a `day`'s token layout, default
`YYYY-MM-DD`; and an entry may state a value outright as `{ value: <literal> }` or take the arrival's own
instant as `{ arrived: true }` ([43-SPEC-EXTRACT](43-SPEC-EXTRACT.md) §4.5). There is no `scale:`: a
multiplier was cited here for a key §4.5 never defined and `map.ts` never read, and a documented key
nothing implements is the silence this corpus exists to prevent. The whole `fetch:` block follows
[47-SPEC-CONNECT](47-SPEC-CONNECT.md) §4.1 key for key, and `declare`'s schema encodes it verbatim
([42-SPEC-DECLARE](42-SPEC-DECLARE.md) §4.7). Four keys the example once carried are **not in v1** —
`for_each`, `conditional`, `on_error.backoff`, `on_error.pause_after` — and are refused as unknown keys;
`limits.timeout` and `limits.max_pages` are in. *They return when a connector needs them*: `for_each` with
a sixth placeholder, `{each}`, that nothing can yet name ([47-SPEC-CONNECT](47-SPEC-CONNECT.md) §13 D7).
`read.format` is one of the five of [34-GRAMMARS](34-GRAMMARS.md) §6 — `json` (the default under a
`fetch:`), `csv`, `xml`, `html_table`, `text` — and all five readers have landed
([43-SPEC-EXTRACT](43-SPEC-EXTRACT.md) §5.5). Two keys belong to one reader each: `read.delimiter`
(default `,`, `csv` only) and `read.table` (1-based, default 1, `html_table` only). The two
`limits` caps are extraction's own — 2,000,000 bytes and 5,000 rows — and a page over either is kept raw in
`review` ([43-SPEC-EXTRACT](43-SPEC-EXTRACT.md) §13 D16).

The window is arithmetic, not a string the author formats: `since = max(start, watermark − lookback)`,
`until = min(since + max_span, end of the current grain)`, half-open; after a complete run
`watermark = min(until, start of the current grain)`, so today is re-asked until it ends
([47-SPEC-CONNECT](47-SPEC-CONNECT.md) §13 D11). Connect calls `extract(decl, raw, ctx)` **once per page**,
and `ctx` carries no currency table of its own: the exponent comes from the kernel's `exponentOf`
([02-DATA-MODEL](02-DATA-MODEL.md) §3 rule 1), and `extract` owns only a
symbol → code map ([02-DATA-MODEL](02-DATA-MODEL.md) §3). Dedupe and `on_conflict` are the record's, inside
`applyPull`: an exact `dedupe: [id]` matches every named field (lint requires `index: true` on each), a
`near` dedupe runs [43-SPEC-EXTRACT](43-SPEC-EXTRACT.md) §5.7's window query, and a hit goes by
`on_conflict` — `update` re-enters the write path, `skip` is counted, `new` creates
([47-SPEC-CONNECT](47-SPEC-CONNECT.md) §13 D3).

A `channel: webhook` ingest carries `verify:` where a pull carries `fetch:` —
`verify: { kind: hmac_sha256, header: X-Signature, grant: <label> }` — or relies on the URL's random path
token; an unverified payload is stored `untriaged` and never matched ([12-SECURITY](12-SECURITY.md) §3).
`grant:` is a vault label here too, never a literal.

### 3.3 · `call` and `poll`, the scheduled actions

*(Added September 15th 2026.)* Two more channels sit beside `pull` inside the
same `ingest` kind. A **`call`** posts to an endpoint on a schedule. A **`poll`** fetches an endpoint on a
schedule and acts through a rule only when the answer changes. Both are smaller than a `pull`: one literal
address, one key and one interval.

```yaml
ingest: balance
channel: poll
url: https://api.example.test/v1/balance?since={since:date}   # a literal https origin; {since} and {until} only after it
grant: example read                     # the key's vault label, never the key
every: 1h                               # fifteen minutes at least, or the provider's floor
floor: 1h                               # optional: the provider's own floor, when it is higher
project: studio                         # optional: the scope its usage is metered under; absent is global
extract: { amount: { after: "balance " } }
writes: { register: balances }          # required on a poll, or a change could reach no rule
```

```yaml
ingest: ping
channel: call
url: https://hooks.example.test/in
grant: hook key
every: 15m
body: { text: "Summary up to {until:date}" }   # JSON, 8 KB at most; string leaves substituted, nothing evaluated
```

| Key | `call` | `poll` | Rule |
|---|---|---|---|
| `url` | required | required | starts `https://`; the host is written out in full, with no brace, `$`, `@`, `%` or space in it |
| `grant` | required | required | a vault label of at most 40 characters |
| `every` | required | required | at least fifteen minutes, and at least `floor:` when one is declared |
| `body` | optional | refused | an object of at most 8 KB; each string leaf may use `{since}` and `{until}` |
| `writes.register` | optional | required | the ingest pipeline's own `extract:` or `map:`, and `writes:` |

A `poll` whose endpoint answers JSON reads it with `map:` in place of `extract:` (43 §4.5): one field per path,
with `{ value: ... }` for what the declaration states and `{ arrived: true }` for when the answer came. A founder's
project polled for its numbers is one such poll per measure, writing a datapoint
(`packages/seed/src/usecases/founder-poll.ts`).

Substitution is §3.1's with fewer names. `{since}` and `{until}` are the only placeholders a scheduled action
has values for, with the formats `date`, `instant`, `epoch_s` and `epoch_ms`. `{since}` is the last successful
run, or one interval ago before there was one. `{page}`, `{probe.<name>}`, `{grant.<name>}` and `${` are
refused. Any other brace group is literal text. A value is substituted only after the origin, so it can never
become part of the host.

The install diff prints one line for each, the same line a `pull` prints:

```
CALLS OUT api.example.test · every 1h · grant "example read"
```

**Every scheduled `call` carries `Idempotency-Key: <outbox id>`.** The value is the id of the outbox row the run
was leased from, so it is the same on every rung of the retry ladder and the same again when a lease is reclaimed
from a process that stopped mid-run: one intended call has one key, however many times it is sent. A new interval
is a new row, so it is a new key, which is a new call and should be. Only a `call` carries the header; a `poll` and
a `pull` are GETs with nothing to duplicate. **Delivery is at least once, and the header is a request rather than a
guarantee: a provider that ignores it can be called twice for one intended call, and the record cannot tell that it
was.** A call whose answer never arrives is the one case where the record does not know whether the request landed,
so its run event says exactly that instead of claiming the retry is free. The wrapper is `idempotentCalls` in
`@braindog/host/actions`, which both hosts run.

Five refusals, raised at install by the kernel's declaration check and counted in
[30-BLUEPRINT](30-BLUEPRINT.md) §6's connector family:

| Code | When |
|---|---|
| `ACTION_NOT_HTTPS` | `url:` is not an `https://` address |
| `ACTION_HOST_COMPUTED` | the host is not written out in full: a placeholder, a user name, or anything computed |
| `ACTION_GRANT_MISSING` | no key is named by its vault label |
| `ACTION_INTERVAL_TOO_SHORT` | `every:` is under fifteen minutes or under the declared `floor:`. A `pull` under the floor answers this code too |
| `ACTION_EVALUATES` | the address or a body leaf computes rather than substitutes |

How they run is §9 and [09-ALARMS](09-ALARMS-AND-NOTIFICATIONS.md) §1.

---

## 4 · What nine real APIs did to it

| API | Verdict |
|---|---|
| **npm downloads** | ✅ clean — **and it invented `expect:`** |
| **GitHub traffic** | ✅ clean — and it forced a *scheduling* refusal |
| **Stripe** | ✅ clean — two small additions |
| **Cloudflare GraphQL** | ⚠️ **the first real break — four holes** |
| **Plausible** | ✅ clean, needs a JSON body |
| **PostHog** | ⚠️ / ❌ — two different verdicts from one product |
| **GA4** | ⚠️ the body is trivial; **the auth is the break** |
| **Sentry** | ✅ clean, with one trap that loops forever |
| **Vercel / Netlify** | ⚠️ / ❌ — Netlify is refused |

### The five that changed the design

**npm silently clamps.** Requested `2024-01-01:2026-08-27`; the response said `"start":"2025-02-27"`
— exactly eighteen months, **HTTP 200, no warning**. No status-code error policy catches that. It is
the reason `expect:` exists.

**Sentry's cursor never disappears.** Verbatim: *"cursors will **always** be returned for both a
previous and a next page, even if there are no results on these pages… We return a
`results="[true|false]"` indicator."* A connector using the near-universal *"follow `rel=next` until
it is gone"* **loops forever.** So `link_header` paging requires a `stop_when` keyed on a link
*parameter*, not on link presence.

**GitHub's Link header carries an opaque base64 cursor**, not a page number — constructing `?page=N+1`
breaks. And traffic data is kept **14 days**, which forces a validator rule: refuse `every:` coarser
than half `source_retention`, with *"the source keeps 14 days; polling every 30 days loses data."*

**Cloudflare GraphQL breaks four ways at once**: HTTP **200 carrying `errors`**; **two different
error envelopes from one endpoint** (Cloudflare's v4 `{"success":false…}` on auth failure, GraphQL's
`{"data":null,"errors":[…]}` on a query error); retention that is **no longer statically knowable**
— the docs page now 404s and the Limits page directs you to a runtime `settings` node; and a request
body that is **an opaque query-language blob** the validator cannot lint or bound.

> That last one deserves its name: it is the same shape as the *"arbitrary SQL — an `eval` by
> another name"* that [02-DATA-MODEL](02-DATA-MODEL.md) §6 refuses. **It survives only because the
> schema has no usable Mutation and the token is read-only. The format is not what makes it safe —
> the token is.** Mitigation: the install diff prints the whole query text.

**GA4 has no API-key path at all.** Every method says *"Requires one of the following OAuth
scopes."* Either a service account — download a **PEM private key**, sign an RS256 JWT, exchange it
hourly — or the user OAuth flow, which for a sensitive scope means verification review, a verified
domain, a hosted privacy policy, a demo video, **refresh tokens that expire in 7 days while the app
is in Testing**, and a **100-user lifetime cap** that *"cannot be reset or changed."*

### Two refusals

**PostHog's HogQL query API** is, in PostHog's own words, *"effectively a wrapper around ClickHouse
SQL."* A shareable connector file would carry arbitrary SQL — already on the do-not-build list.
**PostHog Endpoints (beta) is the declarative answer**: the SQL is saved server-side, and the
connector sends a name and variables. PostHog's own guidance agrees — *"We strongly discourage Query
API usage and will eventually charge for it."*

**Netlify's deploys endpoint has no date filter of any kind**, so incremental sync becomes
client-side stateful logic rather than a parameter. And it has **no scope mechanism at all** — the
PAT is the whole account, including `DELETE /sites/{id}`. Refused.

---

## 5 · The three primitives

### 5.1 · `expect:` — because servers lie quietly

**Five verified instances, four distinct failure modes, every one returning HTTP 200:**

| Instance | Failure mode |
|---|---|
| npm clamps 18 months, silently | the server returns a **different window** than requested |
| GoCardless: OpenAPI says `maximum 730`, runtime enforces **180** (and 90 in the UK) | **the contract disagrees with the runtime** |
| Plausible resolves dates in the *site's* timezone, with no request-level override; and has an undocumented **60 req / 10 s** burst limit found only in source | the server applies a **semantic the request did not specify** |
| GA4 sampling and thresholding, visible only in `metadata.*` | the server **suppresses or estimates rows** invisibly |
| Sentry's always-present cursor | the **stop condition is somewhere clients ignore** |

```yaml
expect:
  - { path: start, eq: "{since:date}" }
  - { path: metadata.subjectToThresholding, is_not: true }
  - { path: query.date_range[0], starts: "{since:date}", on_fail: warn }
```

Operators: `eq`/`ne` · `is`/`is_not` · `present`/`absent` · `contains`/`starts`/`ends` (capped at 40
bytes, the same cap as the `where:` grammar) · `len_lte`/`len_gte`. `is`/`is_not` compare a bare literal
with no substitution — `is: list` is the string `"list"`; `eq`/`ne` substitute placeholders first —
`eq: "{since:date}"` is npm's clamp check ([47-SPEC-CONNECT](47-SPEC-CONNECT.md) §13 D10). **No
combinators, no nesting.** A
list is implicitly `all` — the moment `expect:` gets an `any:` it is a predicate language, and this
is an assertion about *someone else's* response, so it should stay dumber than the one about your
own rows.

| `on_fail` | |
|---|---|
| `warn` | write, flag the run, badge every chart fed by the series |
| **`review` — the default** | **do not write, and do not advance the cursor** |
| `fail` | as `review`, and count toward backoff |

> **"Do not advance the cursor" is the load-bearing half.** A failed assertion that still moves the
> watermark silently skips that window **forever** — strictly worse than the bug it was added to
> catch.

### 5.2 · `auth.kind` is kernel code, not declaration

> **An auth kind is kernel code if it (a) touches crypto, (b) writes back to the vault, or (c)
> chooses a header name. All eight hit at least one.**

`none` · `bearer` · `basic` · `header` · `query_param` · `oauth2_refresh` · `jwt_rs256` · `aws_sigv4`

Eight, closed, and every one of them is code in `connect` — *kernel code* here means code, never a
declaration ([47-SPEC-CONNECT](47-SPEC-CONNECT.md) §4.5). `aws_sigv4` follows the AWS IAM User Guide's
*Create a signed AWS API request* (the 2024 revision), and its test vector is the guide's published
example ([47-SPEC-CONNECT](47-SPEC-CONNECT.md) §13 D2).

| Reason | Why it disqualifies a declaration on its own |
|---|---|
| **crypto** | a declaration that can construct a signature can construct **arbitrary signed assertions** with the user's private key — the same PEM that signs a GA4 token assertion signs anything, with any audience. And expressing HMAC or base64 in YAML needs functions, which is the expression language by the back door |
| **vault write** | [12-SECURITY](12-SECURITY.md) §6 rule 3 is *"no agent tool returns a secret — not scoped, absent."* A declaration that can write a rotated refresh token has vault write capability, and the blast radius is every credential under the same DEK |
| **header choice** | it could write a secret into `Referer` or a header a proxy logs — or set `Authorization` from a literal, putting `sk_live_…` in a file destined for the Kennel |

**`jwt_rs256` earns its place by having two customers, not one.** GA4 signs
`{iss: <sa-email>, scope, aud: oauth2.googleapis.com/token}` and **exchanges** it; Enable Banking
signs `{iss: enablebanking.com, aud: api.enablebanking.com, kid: <appId>}` and **presents** it
directly. Same signer, two `mode:` values, one kernel implementation.

The one vault write a connector ever causes is the rotated refresh token of `oauth2_refresh`, and even
that is not the declaration's and not connect's to store: connect re-seals it (`seal`, version + 1) and
the **record** stores it from the ack's `result.rotated_grant` with one `grant.rotate` event
([47-SPEC-CONNECT](47-SPEC-CONNECT.md) §13 D5; [12-SECURITY](12-SECURITY.md) §6).

*Named and deliberately not built:* a ninth kind, `claim_once` — SimpleFIN's one-time token
exchange. It needs a state transition *and* a vault write, so it is legitimately kernel work, and it
has exactly one customer in a product §4 recommends not building.

### 5.3 · `probe:` — exactly one, and no chaining

Four cases wanted a preflight. One is real: **Cloudflare**, whose per-account retention used to be a
docs page and is now a runtime value. One is absorbed by `jwt_rs256`. Two belong to banking.

Why exactly one:

| | |
|---|---|
| **The install diff must name every host, statically** | one probe means the diff prints a complete finite list. **With chaining, host N+1 comes from response N** — which is the SSRF hole in a different costume, and a diff saying *"…then a host derived from the previous response"* is not something anyone can approve |
| **Termination by construction** | one probe terminates. *k* probes need a depth limit, and a depth limit is a number someone files an issue to raise. **Two is the number that starts the argument; one is the number that ends it** |
| **Failure surface** | *k* probes is *k* backoff ladders and *k* partial states to reconcile against a watermark |
| **Empirically sufficient** | nothing in nine real APIs needed two |

**What this gives up, and it must be written as a refusal rather than an omission:** fan-out over a
*fetched* list — *"list projects, then for each, fetch X"* — which is **47% of sampled real
connectors.** A reader who hits it while writing their third connector will assume it was an
oversight and ask for it.

Fan-out over a **declared literal** list is permissible in principle, because the diff can print it —
but it is **deferred, not in v1**: `for_each` needs a sixth placeholder, `{each}`, that nothing can yet
name, so `declare` refuses the key as unknown until a connector needs it
([47-SPEC-CONNECT](47-SPEC-CONNECT.md) §13 D7). When it lands, the line is the diff's:

```yaml
for_each: [braindog-render, braindog-cli]                # later — the diff names both published packages — 31 §6
# for_each: { path: data[].id }                            # ❌ refused, always — a target from a response
```

---

## 6 · The grade, and where the line goes

Counted by **endpoint**, because two of the nine products split — PostHog gives one clean answer and
one refusal, and Vercel passes where Netlify is refused.

| | Count |
|---|---|
| ✅ Base format, no additions — npm, GitHub, Stripe, Plausible, PostHog Endpoints, Sentry, Vercel | **7** |
| ⚠️ Bounded additions — Cloudflare GraphQL | 1 |
| ⚠️ A kernel auth kind — GA4, Enable Banking | 2 |
| ❌ Refused on principle — PostHog HogQL, Netlify | 2 |
| ❌ Cannot be data at all — any bank, anything with a browser consent step | — |
| **Total endpoints** | **12** |

*(The `poll:` cases — PostHog async, Stripe Reports, Sigma — are alternate paths to endpoints
already counted, not extra ones. Counting them separately is what produced the next paragraph's
error.)*

> **An earlier draft printed a table summing to 17 against nine APIs, and quoted "≈64% clean."
> Neither number survives its own arithmetic.** On the endpoint reading it is **7 / 2 / 2 out of
> 11 = 64% / 18% / 18%**, which is where the percentages came from — the counts had drifted away
> from them.

**And the deeper problem is the denominator, which is worth stating rather than patching.** Nine
hand-picked APIs is not a sample of anything; it is a list of the APIs this product's buyer happens
to use. It cannot support a percentage to two significant figures.

So the claim is stated over two populations, and **neither is called "two-thirds" on its own:**

| Population | Expressible | Evidence of |
|---|---|---|
| **609 real Airbyte connectors**, measured | **53%** catalogue-wide · **71%** within the pure-declarative tier | the honest number for *"any API"* |
| **11 endpoints this buyer actually uses**, hand-picked | **64%** | the honest number for *"the APIs a BrainDog customer connects"* — a biased sample, by construction |

> ### Roughly two-thirds within a declaratively-tractable catalogue; about half across everything real.

An earlier draft compressed both into *"two estimates converging on two-thirds."* **53% is thirteen
points below two-thirds, and calling that convergence was rounding in the flattering direction.**

| Take | Refuse |
|---|---|
| `expect:` — one path, one operator, one literal | **`poll:`** — create → poll → download is three requests, a termination condition and often a *second host*. That is a workflow DSL |
| `error_when` on a body path | any `any:`/`all:` nesting inside `expect:` — the moment it nests it is a predicate language |
| `keyset` and `link_header` paging | chained probes |
| `probe:`, exactly one | fan-out over a fetched list |
| *deferred:* `for_each:` over a literal list — needs the `{each}` placeholder; returns when a connector needs it (§5.3) | **an interpolated `base:`** — 20% of Airbyte connectors do it, and it is the SSRF hole |

> That boundary is precisely where Ansible, GitHub Actions expressions and CloudFormation each
> crossed without noticing. **Write it into the doc as a refusal with the reason attached, or it
> will be argued away one issue at a time.**

### The fallback, and it creates no new capability

**`mode: agent`.** The declaration says *what* it wants — register or series, field map, schedule,
which grant — and not *how*. On schedule it opens a suggestion:

```
  SG31  npm downloads for 2026-08-25 … 2026-08-31 are due
        series npm.braindog-render.downloads · day, count
        No connector can express this source. Fetch it and propose rows.
```

The user's own agent fetches it and calls `propose`. **Every invariant survives**: the record still
makes no outbound call, Slash still has no write path, the human still approves, and BrainDog's
egress surface does not grow by one byte. This is *"where data is not enough, the extension is an
agent"* taken literally — and it is the only version that costs nothing architecturally. `mode: agent` is
a key on the ingest, not a convention: it forbids `fetch:` and `map:`, requires `schedule` and `writes`,
and when its `pull` row fires the record opens the suggestion and writes no outbox row
([42-SPEC-DECLARE](42-SPEC-DECLARE.md) §4.7; [45-SPEC-RECORD](45-SPEC-RECORD.md) §5.9).

A second tier — a Worker-side model with one `http_get` tool restricted to the declared origin — is
possible, Cloud-only, `confidence: proposed` never `exact`. **Do not build it until a real connector
has failed tier 1 twice.**

*(Revised September 22nd 2026. There is now a third way past the ceiling, and it is not the model tier above: a
person's or an agent's own script, which fetches, reshapes and writes rows through the record's own write path, run
in a sandbox BrainDog hosts or anywhere outside that pushes in through a door or the API (§12). It does create
capability, which is why it is its own kind with its own egress line and its own ceilings rather than a
connector.)*

---

## 7 · OAuth, credentials and security

### The finding that reframes OAuth: you can mostly refuse to have the problem

**Seven of nine targets ship a static, scopeable, genuinely read-only API key** — Cloudflare, Stripe
(`rk_` restricted keys, per-resource), GitHub (fine-grained PAT), Plausible (**read-only by
default**), PostHog (scoped `phx_`), Sentry, and npm (none needed). Only GA4 forces OAuth. Vercel's
scope is *which project*, not *which verb*; Netlify has none.

### What the comparable projects do, and it is unanimous

| Project | Self-hosted |
|---|---|
| **Home Assistant** | *"Users create their own credentials with the cloud provider, often acting as an application developer."* Cloud account linking is the Nabu Casa paid path |
| **n8n** | custom OAuth2 in the console; managed OAuth is *"available for n8n Cloud users only"* |
| **Airbyte** | *"In Self-Managed Airbyte, for security reasons, you must configure your own client credentials."* |
| **Grafana** | `client_id` and `client_secret` must be yours. No shared app anywhere |
| **OSS finance** | Firefly III, Actual Budget and `we-promise/sure` all take per-instance credentials. **None ships a shared secret** |
| **rclone** — the one counter-example | shipped a shared `client_id`, and ***"This shared client_id is being retired and will stop working during 2026"*** because the provider rate-limits per client id |

**Five independent precedents against one counter-example, and the counter-example is being retired
this year for exactly the predicted reason: every new self-hoster degrades every existing one.**

So: **prefer the API key and refuse OAuth where a key exists** — that removes a broker, a redirect, a
refresh loop and a secret from the build. **Never ship a client secret in published source.** Where OAuth
is unavoidable, take Home Assistant's two-path model: a Cloud broker at a distinct hostname that
holds only the client secret and never sees the record, and a self-host path where the user
registers their own app. **Complete, not crippled** — the same asymmetry
[07-INGEST](07-INGEST-AND-RULES.md) already sells.

### Nine rules, each with the failure it prevents

| # | Rule | Prevents |
|---|---|---|
| 1 | `auth.kind` is the closed kernel list. A declaration names a kind and a grant, and never builds a signature | a YAML file that constructs credentials can leak them |
| 2 | **`Authorization` is a reserved header a declaration may not spell** — `SECRET_IN_PACK` | `headers: { Authorization: "Bearer sk_live_…" }` in a file shared to the Kennel. **This will happen** |
| 3 | The validator refuses any literal matching a known key prefix — `sk_live_`, `rk_live_`, `ghp_`, `github_pat_`, `phx_`, `vcp_`, `xoxb-` — the same `SECRET_IN_PACK` | the same mistake from the other direction. Cheap, and it catches the real one |
| 4 | **`base:` is a literal `https://` origin with no placeholders.** Placeholders live in `path` and `query` only, percent-encoded, with `..`, `//`, `@` refused **at install**; what install cannot see is `PULL_ORIGIN_REFUSED` at run time | SSRF — **and it is not theoretical: 20% of sampled Airbyte connectors interpolate their host** |
| 5 | Resolve-and-refuse private address space, and `redirect: "manual"` by default, re-validating any followed URL — **including Link-header cursors** — against the allowlisted origin; a miss is `PULL_ORIGIN_REFUSED`. *Built for scheduled actions, September 15th 2026.* The self-host resolves the host before it connects and refuses the name when any address it gives is unspecified, loopback, private (10/8, 172.16/12, 192.168/16), link-local (169.254/16, fe80::/10), unique-local (fc00::/7), carrier-grade NAT (100.64/10), multicast, reserved (240/4), or an IPv6 form carrying one of those. It then connects to the address it checked, so a second lookup cannot swap it, and checks every redirect hop the same way. A refused address pauses nothing: the run's event records one failure in one sentence. The Worker refuses a host written as a literal private address and resolves no name, because Cloudflare does not route a Worker's `fetch` to a private address ([51-SPEC-WORKER](51-SPEC-WORKER.md) §8) | `302 → http://169.254.169.254/`. On Cloudflare the blast radius is small; **on the self-hosted Node build `localhost:3000` is right there** |
| 6 | **Prove the scope at bind time.** One *authenticated* probe per grant — `proveScopes` — Stripe 403s naming the permission, GitHub returns `X-Accepted-GitHub-Permissions`, Cloudflare has a verify endpoint. Refuse a connector whose `require_scopes` is not a subset; the proven set is stored in `grant.scopes`. A grant's plaintext is a JSON object of string fields whose keys, per `auth.kind`, are a closed set ([47-SPEC-CONNECT](47-SPEC-CONNECT.md) §4.6, §13 D15) | attaching a full-access key to a read-only connector. Where scope is not machine-readable, the bind screen says it in words: **"this token can also delete your sites"** |
| 7 | Three caps — bytes (2 MB), rows per run, pages per run | **2 MB is not arbitrary**: it is the row/BLOB ceiling, so a larger body could not be stored anyway |
| 8 | The response body is untrusted content and lands in `inbox_raw` — one row per page, `channel = pull`. A page that passed keeps `sha256`, headers and byte count, and its body for thirty days (the re-triage window of [24-SELF-IMPROVEMENT](24-SELF-IMPROVEMENT.md) §4.8), then `body = NULL`; a page in `review` keeps its body ([47-SPEC-CONNECT](47-SPEC-CONNECT.md) §13 D12) | [12-SECURITY](12-SECURITY.md) §5 then applies unchanged — a provider feeding instructions into a prompt |
| 9 | **The install diff prints the egress** — `CALLS OUT api.stripe.com · every 24h · grant "stripe-read" · scopes …`. Both hosts for a preflight. **The whole query text** for an opaque body | this is the whole trust model. §1's lost row is what you spend; this line is what you buy |

---

## 8 · Where the numbers land: `metric_point`

**Row arithmetic first, to remove it from the argument:** 20 connectors × 5 series × 365 days ≈
**36,500 rows a year** at ~120 bytes ≈ **4.4 MB/year**. A century fits in half a gigabyte against a
10 GB ceiling. **Anyone arguing from size is arguing from the wrong number.**

The decisive argument is **`event` pollution.** GitHub revises today's clone count all day, npm's
last day is partial, GA4 reprocesses for 48 hours. Twenty connectors upserting today's point hourly
is **~480 audit rows a day of machine noise** into an append-only log whose entire purpose is
answering *"what happened to that."*

Three more: `seq` is *"the number a human says"* and nobody says *"npm downloads #1,247"*; `entry_fts`
and `entry_vec` would index and embed 36,500 rows of integers for nothing; and a time series burns
two of a register's eight indexed-field slots in a register with no other reason to exist.

```sql
metric_point (
  series   TEXT NOT NULL,      -- 'npm.braindog-render.downloads'
  grain    TEXT NOT NULL,      -- day | hour | month
  at       TEXT NOT NULL,
  value    INTEGER NOT NULL,   -- ALWAYS an integer. minor units for money, raw count otherwise
  unit     TEXT NOT NULL,      -- 'count' | 'ms' | 'bytes' | 'money.USD' | 'pct.bp'
  n        INTEGER,            -- sample count behind an average; NULL otherwise
  source   TEXT NOT NULL,      -- the ingest id that wrote it
  wrote_at TEXT NOT NULL,
  PRIMARY KEY (series, grain, at)
) WITHOUT ROWID;
```

| Decision | Why |
|---|---|
| **The primary key *is* the upsert** | revision is one `INSERT … ON CONFLICT DO UPDATE`. No dedupe logic, no `deleted_at`, no audit spam |
| `WITHOUT ROWID` | for a narrow row the data lives in the index B-tree: about half the storage, and a range scan is one seek |
| **`value` is INTEGER, never REAL** | the same rule as money, for the same reason. An average is `(value, n)`, divided at display |
| **A missing day has no row** | [08-METRICS](08-METRICS-AND-ANALYTICS.md) §3 already requires *"a missing measurement is missing, drawn as a gap, never as a zero. A zero is a claim."* **The absence of a row is the gap** — never backfill zeros, because a connector outage must stay visible |
| **One `event` per run, not per point** | `actor: ingest:npm-downloads`, `note: "31 points, 2026-08-01…2026-08-31"` |

A `metric:` gains `series.<id>` as a second legal `source:`, with `value: last | sum | avg | delta |
min | max | trend` ([08-METRICS](08-METRICS-AND-ANALYTICS.md) §3). The series' *kind* — `gauge | flow |
cumulative | unique | fact` — lives on the declaring `ingest` as `writes: { series, kind, unit?, scale? }`
(§3.2), never as a `metric_point` column: `unit` is one of `count · ms · bytes · money.<CUR> · pct.bp` and
fills the column above; `scale` is an integer multiplier on the mapped value, rounding half away from zero.
Both reducers read the kind — connect's at write (`flow` sums, the four others take the latest,
`n`-weighted when `n` is mapped) and the evaluator's at read ([47-SPEC-CONNECT](47-SPEC-CONNECT.md) §4.7,
§13 D13; [08-METRICS](08-METRICS-AND-ANALYTICS.md) §3). **`target` and `window` stay mandatory** — a number
that arrived from someone else's API is exactly the kind that most needs to state what good looks like.

---

## 9 · Twenty connectors against one alarm

**The alarm was never the problem.** Twenty connectors are twenty rows in `schedule`, and the alarm
is `MIN(due_at)`. **The egress is the problem, and the `outbox` in
[01-ARCHITECTURE](01-ARCHITECTURE.md) §2 already solves it:** `kind: pull.fetch`. A `pull` row has three
states, `pending · firing · paused`, and its first `due_at` at install is `now`: the first run happens on
install. A fire (`firePull`, `packages/kernel/src/pull.ts`) writes one outbox row carrying the ingest, the
cursor it last saw and the id of the key it sends, and nothing more. The key is the one the connector's
`fetch.auth.grant` names, or its top-level `grant` when the auth block names none, by label or id; the fire
writes the id, because the vault opens a key only for a job that names it by id.

The host's pass leases the row, and the record's `prepareAction` opens the sealed key under that lease
(`sealedGrant`), reads the connector's cursor and slot off its schedule row, and hands the host a `Paged`.
The host's `pagedRunner` (`packages/host/src/connector.ts`) runs it through `runPull(job, deps)`, which
unwraps the connector DEK with `KeyStore`, writes each page through the record's `applyPage` and **acks
itself**. `deps` is `{ http, keys, clock, record, extract, currencies, lookup }`, and `record` is
connect's `RecordApi`, a slice of the record (`applyPull · ackOutbox`), so connect never sees a key at rest and the
record never makes the call ([47-SPEC-CONNECT](47-SPEC-CONNECT.md) §5.1; [45-SPEC-RECORD](45-SPEC-RECORD.md)
§5.11).

**The ack finishes the run.** `finishPull` (`packages/kernel/src/pull.ts`), called from the `pull.fetch`
branch of `ack()` in `packages/kernel/src/outbox.ts` and inside the ack's transaction, reads what the runner
carried back:

| The run ended | What the record writes |
|---|---|
| `ok`, or `review` | the cursor the run ended on (a review hands back the one it started from, so nothing moves past the page a person has to see), the slot it counted to, and the next `due_at` the ack carries: the next slot plus the jitter below |
| `partial` (`max_pages` or `rows_per_run` reached with pages left) | the half-read window and the page it stopped on, and a `due_at` `RESUME_MS` away (`packages/connect/src/run.ts`), so the next alarm resumes it |
| `failed` | the cursor only. The outbox's `retry` ladder runs it again, no sooner than the provider's `Retry-After` |
| `paused` | the row paused, the key stale, the owner told (the table below) |

The cursor and the slot are what the next `prepareAction` hands the runner, so a windowed connector moves
one window further on each run, and each slot is counted from the last one rather than from whenever the
alarm rang. A `due_at` moves only a row that is still `pending`: one somebody paused, or whose declaration
was retired, while its run was out stays as they left it. **A refresh token the provider rotated** is
resealed by the runner at the grant's next version and stored as that version whatever the run's outcome,
because it is the only credential that still works. A host that acks with no finish on it (a row released
unrun, a job whose declaration has gone) finishes the job and writes none of this. Three additions:

| Addition | Why |
|---|---|
| **Jitter is mandatory and deterministic** | twenty connectors declaring `every: 1h` become due at the same instant → one wake → twenty runs in one Worker invocation. At `max_pages: 50` that is **1,000 subrequests: exactly the Workers Paid ceiling, and 20× the Free ceiling of 50.** Derive it from `hash(record_id ‖ ingest_id)` so it is **stable**: random jitter makes *"why was there a gap at 04:00"* unanswerable. The offset falls in a window of `every / 10` clamped to 30 s–15 min, and **the record and connect compute it with the same arithmetic**: FNV-1a over `record_id ‖ 0x1F ‖ ingest_id` (`jitterMs`, `packages/kernel/src/pull.ts`, and connect's copy, `jitterMs`, `packages/connect/src/when.ts`). Every next run is counted from the last slot, not from when the alarm rang (`packages/kernel/src/slot.ts`), and `call`, `poll` and the retry ladder take the same arithmetic over more names: the pack and the action, or the job's kind and id (`actionJitterMs`, `packages/kernel/src/actions.ts`). A paged run that ends `ok` or `review` counts its next slot from the last slot and adds that offset, and the record writes the `due_at` its ack carries over the one the fire set ([47-SPEC-CONNECT](47-SPEC-CONNECT.md) §4.8) |
| **The Worker runs a bounded batch** | at most `ALARM_RUNS` runs an alarm (`apps/worker/src/actions.ts`), each reserving two subrequests for every page it may fetch plus its tail before it starts (`reserveFor`, `packages/kernel/src/actions.ts`), from one budget of `SUBREQUESTS` per invocation (`packages/host/src/actions.ts`). A run that would not fit goes back unrun and the alarm rings again. Jitter prevents the pile-up; the budget survives jitter being wrong |
| **A minimum interval, refused at install** | 15 minutes, or any declared provider floor. Banks are hard-floored at **6 hours by law** — SCA-RTS Art 36(5), *"no more than four times in a 24-hour period"* |

**The runner for `pull`, `call` and `poll`, as built September 15th 2026.** The kernel's `runActions(execute)`
claims the due rows of the three kinds, leases up to five `pull.fetch` jobs, and hands each request to an
executor the host passes in, so the record never makes the call. The request names its key by id and label,
and the host opens it outside the record. The jitter is `actionJitterMs(record, pack, action, every)`, this
section's window with the pack added to what is hashed, so two packs that declare the same action name land
apart. Every run writes one `pull` event with its usage. A `pull` that names one address is one request,
read through the ingest pipeline's `extract:` or `map:`; one whose `fetch:` says how to page or where its
rows are is a connector, and the same pass hands it to the connector runner above rather than sending it.
**The alarm runs these.** The Worker runs the pass from the record's own alarm, after the drain (`#act`,
`apps/worker/src/index.ts`), and the self-host runs it on its tick (`apps/selfhost/src/server.ts`).

### What the user sees

| Failure | Behaviour |
|---|---|
| **401/403** | **never retried.** The run ends `paused` (`PULL_AUTH_REJECTED`), and its ack sets `grant.stale_at` on the key the job sent, sets the connector's `schedule` row `state = 'paused'`, and tells the owner once through the urgent notification path, naming the connector and the key's label; a host that wired no notification path keeps the sentence as a `note` event. `resumeAction` is the only way it starts again |
| **429** | the `retry` ladder, and `Retry-After` is honoured **when present**: the retry waits for the later of its rung and that instant, held to the ladder's six-hour bound. Another `error_when` status honours it only when the declaration says `on_error.honour: retry_after`. GitHub sends it, **Stripe does not document it**, **Cloudflare puts the delay in the message body**, **Sentry publishes no numbers at all**, so the backoff is the real mechanism |
| **A provider 500s for a day** | the `retry` ladder of [09-ALARMS](09-ALARMS-AND-NOTIFICATIONS.md) §1 (`backoffMs`, doubling minutes to a six-hour bound), and `dead` when a job reaches `CEILING` failures (`packages/kernel/src/outbox.ts`), which opens one `change` suggestion asking whether to retry it or change what produces it. The connector is not paused: while a job is out or on the ladder its row fires no second one, and once a job is dead the row's next turn queues a fresh one |
| **One provider of several fails** | **only the providers that answered are replaced.** The predecessor's company ledger keeps the last Mercury rows through a Mercury outage rather than blanking them beside live Stripe rows — a partial refresh is not an empty one |
| **A re-sync meets a row a person edited** | the person's field wins. `event.actor` on the field's last write decides, so a hand-set category survives every sync — the predecessor's `pinned` column, generalised in [07-INGEST](07-INGEST-AND-RULES.md) §6 |
| **`expect:` fails** | do not write, **do not advance the cursor**, keep the raw response, raise one item naming assertion, expected and actual |

### Seven refusals, one family

Every way a run can end short has a code, and the seven are the *connector* family of
[30-BLUEPRINT](30-BLUEPRINT.md) §6 — new with this document, each with a fixture, each carrying the `fix`
sentence the screen below prints ([47-SPEC-CONNECT](47-SPEC-CONNECT.md) §6):

| Code | When |
|---|---|
| `PULL_AUTH_REJECTED` | the provider answered 401 or 403 — to the token step, the probe or a page. The row is `paused`, never retried |
| `PULL_PROVIDER_UNAVAILABLE` | an `error_when` status, a timeout, the network — the `retry` ladder |
| `PULL_REQUEST_REFUSED` | a `fatal_when` or an unlisted non-2xx, a body over `response_bytes`, a non-ASCII header, an unknown placeholder |
| `PULL_EXPECT_FAILED` | an `expect:` or `more:` test failed with `on_fail: review` or `fail` — nothing written, the cursor not moved |
| `PULL_SHAPE_MISMATCH` | an unparseable body, `read.rows` not a list, a missing `probe.read` or `page.from`, a repeated cursor |
| `PULL_ORIGIN_REFUSED` | a 3xx, a URL or `Link` off `base`, a `..`, or the `Http` port's private-range refusal — §7 rules 4 and 5 at run time |
| `PULL_LEASE_EDGE` | the loop stopped at the lease edge with pages left, or `applyPull` found the lease no longer this runner's |

```
  npm-downloads          ok        last 05:02 · 7 points · next 05:02 tomorrow
  stripe-ledger          failing   3 tries · 429 since 02:00 · next 08:00
  github-traffic         paused    401 at 06:11 — the token "GitHub read" was rejected
                                   [Reconnect]   [Retry now]
```

> **And the thing that matters more than any of it:** every chart fed by a stale series **shows a gap
> and a stale badge**. A dashboard that keeps yesterday's number on screen as if it were today's is
> the failure that actually costs somebody money.

---

## 10 · Banking: do not build it

The format handles a bank API fine — `date_from`/`date_to`, `booked[]`/`pending[]`, Berlin Group
PSD2, a five-minute connector. **Everything around it is the problem.**

| Region | Can a self-hoster get a credential? |
|---|---|
| **EEA** | ✅ **Enable Banking free restricted mode.** Its ToS (2026-01-09) is *"solely for evaluation purposes or **for the personal use of private individuals**"* and forbids *"accessing account information that does not belong to the Control Panel user."* **That clause bans the SaaS shape and permits the self-hosted shape, in writing** |
| **US / Canada** | ✅ **SimpleFIN** — the *user* signs up, pays their own **$15/yr**, and hands the app a one-time token. No developer registration at all. Also **Plaid Trial** (2026-04-15), 10 items, personal use |
| **UK** | ❌ **unsolved.** Enable Banking has no GB coverage. SimpleFIN is US/CA. **GoCardless Bank Account Data closed to new signups around July 2025** — the pricing page 404s and the signup page says so. TrueLayer: *"Unless you are regulated as an AISP, you cannot build a custom flow."* What remains is Starling's personal token and Monzo's own-account access — two banks, not a solution |

**Two regulatory limits break a scheduler outright**, and they are law rather than vendor policy:
four unattended calls per account per 24 hours (SCA-RTS Art 36(5)), and — in the UK only — **consent
reconfirmed to the provider every 90 days** (FCA 2021/45, in force 2022-03-26), which bites
*specifically* on unattended access. The EU equivalent is 180 days, so **EU consent lasts twice as
long as UK consent.**

> **Recommendation: ship CSV/OFX paste and keep the existing `hsbc-sms` email pattern**, which
> already solves the actual job — *knowing what left the account*. If it is ever built, the shape to
> copy is `we-promise/sure`: a per-household app id and PEM, encrypted at rest.

*(Revised September 22nd 2026. Ship paste as a door, because a door is a
primitive. An HSBC SMS pattern is one owner's use case: it belongs in a shared pack a person
chooses to install, or in their own script or agent writing through the API, and not in the code.
Measured on that date, `packages/seed` still ships a `bank-from-out-sms` ingest, which is the first
thing §22 names to move out.)*

*(For the record, since it was researched: a UK **RAISP** costs **£1,130**, has a three-month
statutory decision window, requires **zero initial capital**, and — surprisingly — **a sole trader
can be one**. Cheaper still is being a registered agent of a principal AISP. None of that changes
the recommendation.)*

### 10.1 · What Money does instead: cash rolled forward from what the record knows

*(Written September 28th 2026, from what the code does: `packages/seed/src/modules/money.ts` and
[08-METRICS-AND-ANALYTICS](08-METRICS-AND-ANALYTICS.md), `value: { rolled }`.)*

There is still no bank connection, and Money does not wait for one. **Cash now** is rolled forward
from whatever the record has been told. Each liquid account starts from the newest thing anybody said
it held: its own balance on its `as_of` day, a row of `balances` (a balance check), or a transaction
that printed the balance after it (`balance_after`), whichever is latest. Every cleared transaction
dated after that day is then added, money in plus and money out minus, and a transfer counts because
it moves cash between accounts. The figure says the oldest day it started from ("as of 3 Sep"), so a
stale account shows as stale rather than as wrong. One arithmetic serves the whole figure, the figure
for each book, and the runway and the thirty days in and out that are walked from it.

So each way money reaches the record makes the figure better, and none of them is a bank API:

- **Typed**: a transaction or a balance check written by hand, on the page or in the palette.
- **Counted**: the `count-cash` add-on keeps what is actually in a cash box or an account as a
  balance check, and writes the difference from what the record thought into the ledger.
- **Read from a message, through a door**: `card-alerts` reads a card alert forwarded by mail or
  posted as a text message into a transaction, and `bank-hsbc-eg` reads one bank's alert mails and
  texts, each with the balance it prints, so every alert also restarts its account. These are add-ons
  a person chooses to install, as the revision above asks: the seed's `bank-from-out-sms` ingest is
  gone from `packages/seed`.
- **Pulled with a key the person holds**: `mercury` and `stripe` fetch balances and movements on a
  schedule through a key in the vault, where a provider offers one to its own customer.

**CSV and OFX paste, the recommendation above, is not built yet.** It would be one more door into
the same `transactions` list, and the roll above would read it with no change.

---

## 11 · What this changes elsewhere

| # | Document | Change |
|---|---|---|
| 1 | **[04-PACKS](04-PACKS.md) §7** | *"A pack CANNOT make an outbound call of any kind"* is now false. It becomes *"…except a declared `source:` whose origin is printed in the install diff and whose credential a human attached."* **Do not let a reader discover this** |
| 2 | **[15-ROADMAP](15-ROADMAP.md) §6** | its admission test — *"everything here is additive: it fits the declaration kinds, the one grammar and the pack format **without changing them**"* — **rejects this feature as written.** Connectors change the security enumeration. Amend the test or place connectors outside Phase C explicitly |
| 3 | [02-DATA-MODEL](02-DATA-MODEL.md) §1 | `metric_point` is a kernel table — done; the kernel is twenty-seven |
| 4 | [17-OPEN-QUESTIONS](17-OPEN-QUESTIONS.md) Q13 | **Answered (b), [ADR-052](16-DECISIONS.md):** connector grants live under a second, KEK-wrapped DEK — the `connector` row of `vault_key` — so the Worker can decrypt a grant unattended with the passphrase on; [12-SECURITY](12-SECURITY.md) §7 carries the row and the bind screen says it in words. *This document asked the question; it is no longer open* |
| 5 | [04-PACKS](04-PACKS.md) §1 and §7 | *Added September 22nd 2026.* A `script` is a kind of its own (`KINDS` in `packages/kernel/src/declare.ts`), and it calls out as an action does: its egress is a line in the install diff the owner approves (§12). 04 §1 already says so; the enumeration of §7 gains the script's line beside `source:` |

---

## 12 · Scripts beside connectors

*Added September 22nd 2026, and revised the same day, checked against
`packages/kernel/src/script.ts`, `script-run.ts`, `actions.ts` (`scriptEgress`), `packages/script`,
`packages/host/src/script.ts`, `packages/host/src/script-try.ts`, `packages/mcp/src/index.ts` and both hosts at
`d23ac77d`, and checked again on September 28th against the same files, `packages/kernel/src/ingest.ts` (the door)
and `packages/kernel/src/flow.ts` (the rule's step).*

The owner's rule of that day: BrainDog is the shell. The code ships
primitives, doors in and out, schedules, scripts, registers, pages, automations and the vault, and never a use case.
A currency rate or a message a payment provider posts is something a person or an agent builds on those. For this
document that settles three things.

**Never a script in the core.** No script ships in `packages/`: `packages/seed` declares none, and the two scripts
the MCP grammar shows (`usd-eur`, `payment-hook`, in `packages/mcp/grammars/script.ts`) are text served at
`braindog:grammar/script` for an agent writing one, installed only by that package's own test.

**A person's or an agent's script is record content.** It is a declaration of kind `script`, versioned,
attributable and retirable like every other kind, held in one record or in a pack somebody chooses to install. An
agent files it through `propose` as a `change`, and the owner accepts it in Decide, where its egress is printed and
approved like an action's. Every row it writes says `script:<id>@v<n>` wrote it. It runs hosted, in a sandbox
BrainDog meters per account (QuickJS on a self-host, [49-SPEC-SELFHOST](49-SPEC-SELFHOST.md) §5.23; a Dynamic Worker
on the Cloud, [51-SPEC-WORKER](51-SPEC-WORKER.md) §5.19), or anywhere outside, a Claude routine, a server, a cron,
pushing in through a door or the API with a token like any other client. Hosted is never required.

**A connector is still the first answer, and a script is the second.** Where the declaration of §3 can say it, it
should, because substitution cannot do anything it was not written to do. Where it cannot, a script can, at the cost
of being code:

| | A connector (`ingest`, `channel: pull`) | A script (`script`) |
|---|---|---|
| Is | a declaration: substitution, never evaluation (§3.1) | JavaScript whose default export is `run(ctx)`, 64 KB at most |
| Runs | on the host, the record never making the call | on the host in a sandbox, the record never running it: a fire writes one `script.run` outbox row and a host leases it |
| Calls out to | one literal `base:` origin | the literal `https://` origins in `egress:`, each written out in full; a path, a port the parser would drop or a placeholder is `ACTION_HOST_COMPUTED`, anything not `https://` is `ACTION_NOT_HTTPS` |
| Sends | one grant, by label | the vault labels in `keys:`, each only to the host its vault entry says it opens, checked at every fetch (`keyRefused`; a fetch elsewhere is `FORBIDDEN` and refuses the run). A key with no `egress:` to go to is refused at install, and so is the vault's `slash` key (`FORBIDDEN` at `keys[i]`) |
| Reads the record | no | the registers in `reads:`, with every secret field taken off and a filter on one refused |
| Writes | the rows its mapping makes, into one register or series | creates and updates into the registers in `writes:`, applied together after the run, all or none |
| Starts | on its schedule | on `runs.every`, no more often than every fifteen minutes (`ACTION_INTERVAL_TOO_SHORT`), first due at a jitter and not at once. A rule's `script` step starts one that says `runs.rule: true`, queuing the same `script.run` a clock does and going on without waiting (`startScript` in `kernel/src/flow.ts`), and every verified arrival at its `runs.door` queues one run with `input: { body, headers }` in the arrival's own transaction, at most `doorRunsPerDay()` a day (`startAtDoor` in `kernel/src/script.ts`, called from `arrive` in `kernel/src/ingest.ts`). A paused script is started by neither |
| The install diff says | `CALLS OUT <host> · every … · grant "…"` (§7 rule 9) | `CALLS OUT <hosts> · every … · key "…"`, and when it both reads and fetches, a second sentence: *"<id> reads <lists> and may send what it reads to <hosts>."* Reading and fetching together is the one way a script can carry the record out, and that sentence is the owner's one chance to see it |
| Ends short | the seven `PULL_*` codes (§9) | `PULL_ORIGIN_REFUSED`, `OUT_OF_BOUNDS`, `FORBIDDEN`, `DECLARATION_INVALID`, or the script's own throw with no code. The run's note says only that it did not finish; the reason goes in its log, which only an owner who reads every list the script touched is shown. Three refused runs in a row of the installed version pause it until the owner resumes it |
| Tried before it is proposed | not by `script_try`, which takes a script only | yes, on request: `script_try` runs the draft now in the same sandbox, answers the writes it would make, its log and any refusal, and writes and files nothing |

A changed script needs the owner's press again whenever its whole egress line or its read sentence changes
(`egressChanged`): a second origin, another key, a new trigger or an added read is a promise the owner has not seen.

**Trying a draft.** An agent asks for a trial on `propose` itself, with no tool of its own: a script change whose
body carries `"try": true`, or `"try": {"input": ...}` to hand it what a door would, beside `to`, is checked by the
kernel's `scriptBody` as an install would check it, run once in the host's sandbox, and answered as `script_try`
with `proposed: false`. Nothing is filed, so nobody is asked, and the agent sends the change again without `try`
once it works. A script change without `try` is filed and runs nothing. A trial's fetches are real and go through
the same send loop and key rule as a scheduled run's; it reads with the caller's own reads, not `system`'s; it opens
a key only when the caller is the owner signed in as a person, so over MCP, where every caller is a token, a fetch
naming a key is refused unsent and the script may catch that and go on; and it is counted on the plan's allowance
as a run. It runs on a self-host whose actions are on and on the Cloud where `LOADER` is bound; elsewhere it is
`NOT_IN_THIS_BUILD`, or on a Cloud with no `LOADER` a refusal that says there is no sandbox.

**What is not built, said here because this document is where a reader looks for egress.** A door starts a script
only on a verified arrival, and an unverified one starts nothing. The egress line joins every
origin and every key into one line, so it does not say which host a key goes to, because `scriptEgress` does not
see the vault; the key is held to its host at the fetch, not in the sentence the owner approves. And a key whose
`opens` is not one of the script's `egress:` hosts is not refused at install, only at each fetch, where three
refused runs pause the script ([12-SECURITY](12-SECURITY.md) §6.2).

---

*Next: [26-BYO-INTELLIGENCE](26-BYO-INTELLIGENCE.md) — the other thing that needs a credential.*

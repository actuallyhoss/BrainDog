# 09 · Alarms and notifications

A business record's whole job is to tell you a thing before it is too late. This document exists
because of one platform constraint:

> **A Durable Object has exactly ONE alarm.**

A customer with 40 domain renewals, 12 installment dates, a weekly digest and three rules that
schedule follow-ups needs hundreds of timers. They get one. Everything below follows from
resolving that.

---

## 1 · The single-alarm pattern

One alarm, one table, one invariant.

```sql
CREATE TABLE schedule (
  id TEXT PRIMARY KEY, due_at TEXT NOT NULL, kind TEXT NOT NULL,                 -- due_at: RFC 3339 UTC
  key TEXT NOT NULL, payload TEXT NOT NULL,                                      -- key: the once_per dedupe key; payload: json
  state TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,    -- state: pending | firing | done | failed
  UNIQUE (kind, key),
  CHECK (kind IN ('digest','reminder','rule','retry','purge','rotate','pull','analyse','score','snapshot'))
);
CREATE INDEX schedule_due ON schedule(state, due_at);
```

**Ten kinds, and the `CHECK` is the count** — the same DDL as [30-BLUEPRINT](30-BLUEPRINT.md) §1. *(An
earlier draft here listed six, had no `CHECK`, and left `attempts` nullable.)*

> **The invariant: the object's alarm is always set to `MIN(due_at) WHERE state='pending'`, or
> no alarm at all if that set is empty.**

`arm()` is `await scheduler.set(min)` — called **after** every write transaction that could have changed
that minimum, and idempotent: it reads the minimum, compares to the current alarm, and sets only on a
difference. It is an async storage operation on a Durable Object (`getAlarm()`/`setAlarm()` return
Promises), so it cannot sit inside `transactionSync`; it runs after the transaction commits and before
the outbox doorbell, still under the input gate ([30-BLUEPRINT](30-BLUEPRINT.md) §4, steps 11–12b).
Every path that inserts into `schedule` goes through one function, because a second insertion
path is how the invariant silently breaks and a renewal reminder never fires.

### The handler

```
alarm():
  ── transaction ──
  1. claim: UPDATE schedule SET state='firing' WHERE state='pending' AND due_at <= now LIMIT 100
  2. for each claimed row: dispatch by kind
  3. mark done, or failed with attempts+1 and a backoff due_at
  4. write outbox rows for every notification that must leave the object
  ── transaction ends ──
  5. arm(): await scheduler.set(MIN(due_at) WHERE state='pending')
  6. await scheduler.wake()     -- the outbox doorbell. Cloud: OUTBOX_Q.send({ record }); self-host: no-op.
                                -- The only I/O, and the last statement — 01 §2
```

Four properties, each earned:

**Claim before work, in one statement.** An alarm handler can be re-entered — the platform
guarantees delivery, not exactly-once. Claiming with a conditional `UPDATE` means a re-entry
finds nothing to do.

**Batch of 100.** The whole due set is not drained in one wake if it is huge; the handler
re-arms to `now` and wakes again. This keeps any single alarm invocation inside the CPU budget.

**Backoff on failure, capped.** `attempts` drives `due_at = now + min(2^attempts minutes, 6h)`,
and at 8 attempts the row goes `failed` and raises a *visible* item in the app. A notification
that silently gave up is worse than one that never existed.

**The outbox borrows this ladder and is never retried in place.** A delivery the Worker could not make
comes back as `ackOutbox(id, 'failed', err)`: the outbox row goes `failed` with `attempts + 1`, and a
`retry` row is inserted **here** — `kind = 'retry'`, `key = 'outbox:' || id`, `due_at = now +
min(2^attempts minutes, 6h)`. When it fires, the outbox row goes back to `pending` and the Worker leases
it again. When the retry row itself goes `failed` — at 8 attempts, the one ladder above — the outbox row goes
`dead` and a `suggestion` (`body_kind = 'change'`,
`opened_by = 'system'`) names the kind, the error and the payload. Retry policy lives in this one table;
the Worker never re-leases a failed row on a clock of its own. *(An earlier draft gave the outbox a
counter and a cap of its own, so one notification had two ladders; [30-BLUEPRINT](30-BLUEPRINT.md) §8
has the ack.)*

> **This is the row's retry, not the platform's, and they are not the same ladder.** Cloudflare
> retries a *throwing* `alarm()` itself — exponential backoff from a 2-second delay, up to 6
> retries (read 2026-09-01). That covers an alarm that crashed. It does not cover a notification
> whose delivery failed, because that alarm returned successfully. Both exist, they nest, and
> conflating them produces either a retry storm or a job that is never retried at all.

**Re-arm is the last *storage* statement, always — and the doorbell is the only thing after it.**
Including on the failure path. An alarm handler that throws before re-arming stops the customer's
entire schedule forever — the single worst bug this subsystem can have — so `arm()` sits in a
`finally`, and `scheduler.wake()` runs after it, after commit, because it is the one I/O the record
performs ([01-ARCHITECTURE](01-ARCHITECTURE.md) §2, ADR-021). *(An earlier draft made `arm()` the last
statement full stop, and its handler never wrote outbox rows or rang the bell.)*

### Deleting a record

**This changed under us, and the corpus repeated the old behaviour in two places.** Verified
2026-09-01:

> *"For Workers with compatibility date 2026-02-24 or later, `deleteAll()` also deletes any active
> alarm. For earlier compatibility dates, `deleteAll()` does not delete alarms — use `deleteAlarm()`
> separately, or enable the `delete_all_deletes_alarm` compatibility flag."*

So the two-step procedure is **no longer required** at a current compatibility date. It stays anyway,
because it costs one call and it is correct under both — but the *reason* is now belt-and-braces
rather than necessity, and the enforcement moves:

> **`compatibility_date >= 2026-02-24` is a CI assertion, not a sentence in a document.** A prose
> rule that survives the behaviour it describes is how a codebase accumulates rituals nobody can
> explain. The lint fails the build if the date regresses; the extra `deleteAlarm()` is then belt
> and braces rather than the load-bearing thing.

### Self-hosted

The same `schedule` table, drained by one `setTimeout` loop that re-computes its delay from
`MIN(due_at)`. Identical semantics, ~30 lines, and it is the `Scheduler` port —
`get() · set(atMs) · clear() · wake()` — one of the nine in [01-ARCHITECTURE](01-ARCHITECTURE.md) §4;
`wake()` is a no-op here because the outbox poller is in the same process.

---

## 2 · What gets scheduled

| Kind | Source | Example |
|---|---|---|
| `reminder` | a `day` field with a lead time declared on the register | "brain.dog renews in 30 days — $52.01" |
| `digest` | a `digest` declaration | the Monday morning brief |
| `rule` | a rule's `schedule:` action | "check this again in 2 weeks" |
| `retry` | a failed ingest or notification | exponential, capped |
| `purge` | a row soft-deleted 30 days ago; the hourly session sweep ([02-DATA-MODEL](02-DATA-MODEL.md) §1) | housekeeping |
| `rotate` | a credential's rotation interval | "this token is 11 months old" |
| `pull` | a connector's `fetch.schedule` — [25-CONNECTORS](25-CONNECTORS.md) §9 | fetch npm downloads at 04:10 |
| `analyse` | the self-improvement detector — [24-SELF-IMPROVEMENT](24-SELF-IMPROVEMENT.md) §4.3 | weekly |
| `score` | a prediction's `score_at` — [24-SELF-IMPROVEMENT](24-SELF-IMPROVEMENT.md) §4.6 | score D41's prediction on 1 Oct |
| `snapshot` | a metric's `snapshot:` — [08-METRICS](08-METRICS-AND-ANALYTICS.md) §2.6 | nightly, overwrite yesterday |

### Lead times are declared, not hard-coded

```yaml
- id: renews
  type: day
  remind: [-30d, -7d, -1d]
```

Three reminders from one field, deduped by `once_per: [entry, renews]`, and re-derived if the
date changes. **Changing a renewal date cancels the reminders for the old date** — an obvious
requirement that is easy to miss and produces the most annoying possible bug, so it is a named
test.

---

## 3 · Channels

| Channel | Cloud | Self-host | Good for |
|---|---|---|---|
| **In-app** | always | always | everything. The record's own inbox is the source of truth |
| **Web Push** | VAPID from the Worker | same | time-sensitive, one line, no content |
| **Email** | Cloudflare Email Service | your own SMTP | digests, anything with a table in it |
| **MCP** | a resource an agent polls | same | "what should I know" at the start of a session |
| **Webhook out** | POST to your URL | same | Slack, Discord, whatever you already read |

Two notes on mechanism:

**Web Push works from Workers** with a zero-dependency VAPID library (`@pushforge/builder@2.0.5`;
`web-push-browser` is the alternative) — no Node crypto shim needed. *(An earlier draft called it
`pushforge`, which does not exist on npm — [18-BUILD-TOOLKIT](18-BUILD-TOOLKIT.md) §5.)* The DO alarm fires, the Worker signs and posts
to the push service, the service worker shows the notification. Cloudflare's own Agents
documentation pairs an alarm with web push in exactly this shape.

**Push payloads carry no content.** A push says *"3 renewals need attention"* and a URL. The
detail is fetched by an authenticated client. A push payload passes through a third-party push
service, and this record holds money and credentials; putting an amount in a push notification is
a leak with a friendly UI on it.

---

## 4 · The notification contract

Every notification, on every channel, has these six fields and no others:

| Field | Rule |
|---|---|
| `tone` | `info` · `good` · `warn` · `bad` — intent, never a colour |
| `say` | one sentence, ≤ 120 characters, no jargon, interpolated from the record |
| `because` | the rule, ingest or field that produced it. Always present |
| `to` | a deep link to the row it is about |
| `key` | the dedupe key |
| `urgent` | `true` interrupts; the default, `false`, lands in the digest — §5 rule 2 |

Six, counted. There is no `channel` field: routing is §5's, by `urgent`, and a rule that wrote
`channel: digest` was naming a decision that is not its to make. *(An earlier draft said five and then
routed by a sixth.)*

`because` being mandatory is the difference between a notification you trust and one you
disable. *"brain.dog renews in 30 days — because rule.renewal-30d on register.domains"* can be
turned off at the source in one click, from the notification itself.

---

## 5 · The etiquette rules

Notification design is where good products become annoying, so these are rules rather than
guidelines.

**1 · `once_per` is mandatory on any rule that notifies.** Enforced by the validator. A reminder
that fires nightly until you act is a reminder you filter to a folder.

**2 · Batch by default; interrupt by exception.** Everything lands in the daily or weekly digest
unless it is explicitly `urgent`. Only three things are urgent by default: a payment failing, a
credential expiring inside 48 hours, and a domain expiring inside 7 days. Anything else a pack
marks urgent shows in the install diff as `interrupts you`.

**3 · Quiet hours, per record, on by default.** 22:00–08:00 in the record's timezone. A
non-urgent notification due inside quiet hours moves to the next opening. This is why the record
stores a timezone and why plain days render at noon UTC ([02-DATA-MODEL](02-DATA-MODEL.md) §4).

**4 · A digest with nothing in it is not sent.** "Nothing needs you this week" is worth saying at
most once a month, not weekly. Weekly nothing teaches you to stop opening it.

**5 · Nothing is proactive about money leaving.** The record can say *"this renews in 7 days"*. It
never says *"shall I cancel it"*, and there is no action in a notification that moves money or
deletes anything. See [11-ASSISTANT](11-ASSISTANT.md) §7.

**6 · An unread count is on the record, not on a page.** One number, in one place. A badge per
nav section is how a product trains people to ignore badges.

---

## 6 · Digests

```yaml
digest: money-weekly
schedule: { day: mon, at: "08:00", tz: record }
channels: [email, in-app]
sections:
  - { heading: Due this week,  source: metric.due-7d,   as: stat }
  - { heading: Overdue,        source: register.obligations,
      where: { all: [{ field: due, before: today }, { field: state, in: [open, part] }] },
      as: table, columns: [{ field: seq }, { field: what }, { field: amount }, { field: due }],
      omit_when_empty: true }
  - { heading: Renewals in 30 days, source: register.services,
      where: { field: renews, before: "+30d" },
      as: table, columns: [{ field: name }, { field: renews }, { field: cost }], omit_when_empty: true }
prose: spark            # optional: one sentence of context. omit for a figures-only digest
```

`omit_when_empty: true` drops a section with no rows rather than printing a heading over nothing. A
digest of five headings and no content is the fastest way to make a digest worthless. `as:` names one
of the sixteen block kinds ([05-BLOCKS](05-BLOCKS-AND-THEMES.md) §2) — `table` is the kind bound to a
`source:` with `columns:`, and a column is `{ field, label?, width?, align? }` ([06-PAGES](06-PAGES.md)
§1). *(An earlier draft wrote `empty: skip` — a keyword in a key that on a page block takes an
interpolatable string — and `as: list`, which is a primitive, not a kind.)*

`prose: spark` is the one place the assistant writes into a scheduled output, and it is capped
at two sentences, generated from the sections that are actually present, and clearly attributed.
It is opt-in. A digest that is all figures is a perfectly good digest, and it costs no neurons.

---

## 7 · What this subsystem must never do

| Never | Because |
|---|---|
| Fire an action that moves money, sends an email to a third party, or deletes | a scheduler with side effects on the outside world is a scheduler that needs an audit team |
| Notify from unmatched, untrusted ingested content without approval | that is a channel for a stranger to send you an instruction. [12-SECURITY](12-SECURITY.md) §5 |
| Retry a model call automatically | it bills twice for one payload. Retried by a person, from the raw inbox |
| Send more than one urgent interrupt per hour per record | a rate limit on interruption is a feature |
| Keep a `failed` row invisible | it surfaces in the app after the last attempt |

---

*Next: [10-MCP](10-MCP.md) — the agent surface.*

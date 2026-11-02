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
  state TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,    -- state: pending | firing | done | failed | paused
  UNIQUE (kind, key),
  CHECK (kind IN ('digest','reminder','rule','retry','purge','rotate','pull','analyse','score','snapshot'))
);
CREATE INDEX schedule_due ON schedule(state, due_at);
```

**Ten kinds, and the `CHECK` is the count** — the same DDL as [30-BLUEPRINT](30-BLUEPRINT.md) §1. *(An
earlier draft here listed six, had no `CHECK`, and left `attempts` nullable.)*

*(Amended September 15th 2026: the `CHECK` gains `call` and `poll` beside
`pull`, the outbound and watching halves of a scheduled action. The DDL above is migration 1's and stays
pinned. Migration 5, `0005_schedule_actions`, rebuilds the table with twelve kinds and copies every row.)*

**The scheduled actions' runner, built September 15th 2026.** One kernel function, `runActions(execute)`,
runs `pull`, `call` and `poll`. It claims their due rows through `drainSchedule`, limited to those three
kinds. Each fire queues one `pull.fetch` job naming the action, its channel and its key by id, unless a job
for the same action is still pending, leased or waiting on its retry. It then leases up to five jobs, turns
each into a request, hands the request to an executor the host passes in, and finishes each run in its own
transaction. The executor runs outside every transaction, so the kernel holds no network code and no lock
while somebody else's server answers. A 2xx re-arms at `now + every + jitter`, and the jitter is arithmetic
over the record, the pack and the action, never random. A `poll` hashes the answer and hands it to the ingest
pipeline only when the hash differs from the last one it kept, so its rule fires on a change and on nothing
else. A 429, a 5xx, a timeout or the network acks the job `failed` and walks the outbox ladder below. A 401
or a 403 is never retried: the row goes `paused`, the key is marked stale, an event records it, and the
owner is told through `notify`. Only `resumeAction`, an ADMIN method, starts it again. Every run writes one
`pull` event carrying `runs`, `requests`, `bytes`, `ms` and `failures`, scoped to the action's `project` or
to `global`.

**Both hosts run them** *(September 15th 2026)*. The self-host's timer does (below), and so does the Worker's
alarm: after the drain, `Record$.alarm` calls `runActions` with `apps/worker/src/actions.ts`, five runs an alarm
at most. Its rules are the self-host's, over `fetch`: https only, an origin an active declaration names,
same-origin redirects three at most, ten seconds, two megabytes, and the key opened from the Worker key store
only when `KEK` is bound. It resolves no name, because Cloudflare does not route a Worker's `fetch` to a private
address, and it refuses a host written as a literal private address. With `KEK` unbound, an action that names a
key sends nothing and its run event says so in one sentence. The kernel does not pause the action for that: it
runs again at its next interval and sends nothing again, until `KEK` is bound.

**The usage ledger.** Each run's usage is on its event, and both hosts also hand it to the Directory. Before a
run, the host asks `mayRun(record, action)`. A record on the hosted plan at its monthly allowance is held: the host
sends nothing, the kernel moves the action to the first of next month, and the event says so in one sentence.
After a pass, the host hands each metered run to `meter`, which counts a run's event once however often it is
reported. A self-host's records are on the `selfhost` plan, which has no allowance, so a self-host is never held.
`GET /account/usage?from=YYYY-MM-DD&to=YYYY-MM-DD` answers a signed-in person with what the records they own used.

`state` has **five** values — `pending` · `firing` · `done` · `failed` · `paused`. `paused` is a
connector's row after its credential was rejected or its ladder ran out (§2,
[25-CONNECTORS](25-CONNECTORS.md) §9); the claim below never takes it. The handler is one INTERNAL method
of the record, `drainSchedule` ([45-SPEC-RECORD](45-SPEC-RECORD.md) §5.9). *(An earlier draft counted four.)*

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
  6. await scheduler.wake()     -- the outbox doorbell. Cloud: OUTBOX_Q.send({ record }); self-host: kicks the poller.
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
comes back as `ackOutbox({ id, state: 'failed', error })`: the outbox row goes `failed` with `attempts + 1`,
and a `retry` row is inserted **here** — `kind = 'retry'`, `key = 'outbox:' || id`, `due_at = now +
min(2^attempts minutes, 6h)`. When it fires, the outbox row goes back to `pending` and the Worker leases
it again. **Retry rows never fail**; it is the **eighth `failed` ack** — the one ladder above, counted on the
outbox row — that makes the row `dead` and opens the dead-letter `suggestion`: `body_kind = 'change'`,
`opened_by = 'system'`, `from = { kind, error, attempts, payload: summary }`, `to = 'retry'`, and the one
question sentence of [45-SPEC-RECORD](45-SPEC-RECORD.md) §5.10. Retry policy lives in this one table;
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

The order is fixed and it is the runbook's: a `final` snapshot inside the record's prefix → `destroy()`
on `Record` (alarm, then storage) → `Slash`, when it has storage → the R2 prefix → `record.forget` in the
Directory. It runs at day 90 of a lapse, or when the owner asks — `deleteRecord` is an ADMIN method,
browser session, re-authenticated, the slug typed to confirm ([53-SPEC-OPERATIONS](53-SPEC-OPERATIONS.md)
§13 #17; [30-BLUEPRINT](30-BLUEPRINT.md) §5).

### Self-hosted

The same `schedule` table, drained by one `setTimeout` loop that re-computes its delay from
`MIN(due_at)`. Identical semantics, ~30 lines, and it is the `Scheduler` port —
`get() · set(atMs) · clear() · wake()` — one of the nine in [01-ARCHITECTURE](01-ARCHITECTURE.md) §4.
`wake()` is not a no-op here: it kicks the in-process outbox poller (`setImmediate`), whose 15-second tick
is also the belt for an abandoned lease ([49-SPEC-SELFHOST](49-SPEC-SELFHOST.md) §13 #5). *(An earlier
draft made it a no-op because the poller shares the process — sharing a process is not being woken.)*

**The timer runs the scheduled actions too** *(September 15th 2026)*. When `start` is given `actions`, which
`main.ts` always passes, every tick of the poller and every wake calls `runActions` with the self-host's
executor, `apps/selfhost/src/actions.ts`, and `pull.fetch` is kept out of the deliverer's lease. The executor
sends only to an https origin that an active declaration names, read again on every run. It follows a
redirect only to the same origin, three at most, and refuses one to any other host. It gives a run ten
seconds and reads at most two megabytes, counted as the answer streams. Before it connects, it resolves the host
and refuses it when any address it gives is unspecified, loopback, private, link-local, unique-local,
carrier-grade NAT, multicast or reserved, or an IPv6 form carrying one of those. It then connects to the address
it checked, so a second lookup cannot swap it, and checks every redirect hop the same way. A refused address
pauses nothing: the run's event records it as one failure, in one sentence. It opens the key by reference from
the key store for that one request and sends it as a bearer, and nothing it opens goes back to the record.

---

## 2 · What gets scheduled

| Kind | Source | Example |
|---|---|---|
| `reminder` | a `day` field with a lead time declared on the register | "brain.dog renews in 30 days — $52.01" |
| `digest` | a `digest` declaration | the Monday morning brief |
| `rule` | a rule's `schedule:` action — and the `once_per` marker of every rule that notifies or creates, under the table's `(kind, key)` unique index ([45-SPEC-RECORD](45-SPEC-RECORD.md) §5.7) | "check this again in 2 weeks" |
| `retry` | a failed ingest or notification | exponential, capped |
| `purge` | a row soft-deleted 30 days ago; the hourly session sweep ([02-DATA-MODEL](02-DATA-MODEL.md) §1) | housekeeping |
| `rotate` | a credential's rotation interval | "this token is 11 months old" |
| `pull` | a connector's `fetch.schedule` — [25-CONNECTORS](25-CONNECTORS.md) §9. Its states are `pending · firing · paused`: a fire sets `firing` and writes one `pull.fetch` outbox row carrying `{ ingest_id, declaration_version, grant_id }` and nothing more — connect fetches the sealed grant itself; the ack returns the row to `pending` with the next `due_at`; `dead`, or a rejected credential, sets `paused` plus one item; the first `due_at` at install is `now` ([47-SPEC-CONNECT](47-SPEC-CONNECT.md) §13 D8) | fetch npm downloads at 04:10 |
| `call` | an ingest's `channel: call`, an outbound POST on its `every:` ([25-CONNECTORS](25-CONNECTORS.md) §3.3). Armed at install and due now; a fire queues one `pull.fetch` job; a refused key pauses it until somebody resumes it | post a summary to a webhook every morning |
| `poll` | an ingest's `channel: poll`, a GET on its `every:` whose answer reaches its rule only when it changed ([25-CONNECTORS](25-CONNECTORS.md) §3.3) | watch a balance hourly |
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
test. Mechanically: the key is `<id>:<field>:<at>:<offset>` under the table's `(kind, key)` unique
index, so `ON CONFLICT DO NOTHING` *is* `once_per`; cancel is a key-range delete of the field's `pending`
rows; a `day` reminder is due at noon UTC; `repeat:` without `remind:` means offset `0`; the horizon is
400 days and at most 100 rows per field per write ([41-SPEC-KERNEL](41-SPEC-KERNEL.md) §13 #20).

---

## 3 · Channels

| Channel | Cloud | Self-host | Good for |
|---|---|---|---|
| **In-app** | always | always | everything. The `note` event on the row — by `rule:<id>`, `digest:<id>` or `system` — **is** the notification; there is no inbox table, and §5's one unread count is counted over those events ([45-SPEC-RECORD](45-SPEC-RECORD.md) §13 #17) |
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

**Push to a colleague (2 Nov).** `notify.push` rings the owner's subscriptions; a colleague's own phones are rung by
`kernel.tellColleague` (`personPushSubs`), kind `people`, when a row is handed to them, when a comment @mentions them
on a row, a question or a decision, and, for the inviter, when somebody joins from their invitation. The payload is
the same content-free shape, `{ sub, cause, open, kind }`, and the phone says only "Someone handed you something",
"Someone mentioned you in a comment" or "Someone you invited joined". It never rings the person who did it, nor anybody
who cannot see the row or question, once per cause, inside the record's quiet hours, at most six an hour per person,
and each person turns the kind off in Settings > Notifications. [20-COLLABORATION](20-COLLABORATION.md) §7 has the rest.

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
| `urgent` | `true` interrupts — the `note` event plus a `notify.push` and a `notify.email` outbox row, at most one interrupt per hour per record; the default, `false`, lands in the digest — §5 rule 2 |

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
unless it is explicitly `urgent`. The core knows only a row a rule marks `urgent`, and its one
default is the Keychain's own: a credential expiring inside 48 hours. Which other rows are urgent (a
payment failing, a domain expiring inside 7 days) is declared by whoever built that list, a person,
an agent or a pack, and anything a pack marks urgent shows in the install diff as `interrupts you`.
*(An earlier revision made a failed payment and an expiring domain core defaults. Those are one
owner's use cases, and use cases stay out of the core.)*

**3 · Quiet hours, per record, on by default.** 21:00–08:00 in the record's timezone (22:00 until October 14th 2026; a window an owner set is kept as set). A
non-urgent notification due inside quiet hours moves to the next opening. This is why the record
stores a timezone and why plain days render at noon UTC ([02-DATA-MODEL](02-DATA-MODEL.md) §4).
An owner sets them in Settings > Notifications: a start and an end, or off, kept in `record.quiet`
(migration 0020, where NULL reads as 21:00 to 08:00) and changed through `setQuietHours`, which logs
an `edit` event on the record. The window applies where a digest comes due: the `digest` schedule
handler runs nothing inside it and comes due again at its end. An urgent notice never waits (rule 2).

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
prose: slash            # optional: one sentence of context. omit for a figures-only digest
```

`omit_when_empty: true` drops a section with no rows rather than printing a heading over nothing. A
digest of five headings and no content is the fastest way to make a digest worthless. `as:` names one
of the forty-three block kinds ([05-BLOCKS](05-BLOCKS-AND-THEMES.md) §2): `table` is the kind bound to a
`source:` with `columns:`, and a column is `{ field, label?, width?, align? }` ([06-PAGES](06-PAGES.md)
§1). *(An earlier draft wrote `empty: skip` — a keyword in a key that on a page block takes an
interpolatable string — and `as: list`, which is a primitive, not a kind.)*

The keys are typed and closed: `schedule: { day?, at, tz? }` — weekly with `day`, daily without;
`channels`, one to five of `in-app · email · push · webhook · mcp`; `sections`, at most twelve; `prose`,
only ever `slash` ([42-SPEC-DECLARE](42-SPEC-DECLARE.md) §4.11). A `webhook` channel names where it posts —
`webhook: { url, grant? }`, an `https:` URL printed in the install diff's `CALLS OUT` line and the Keychain
label of the secret that signs the POST — because a URL a digest posts to is egress, and egress is declared
or it does not happen ([04-PACKS](04-PACKS.md) §7).

`prose: slash` is the one place the assistant writes into a scheduled output, and it is capped
at two sentences, generated from the sections that are actually present, and clearly attributed.
It is opt-in. A digest that is all figures is a perfectly good digest, and it costs no neurons.
Mechanically it is one `infer.prose` outbox row, and the digest finishes on the ack — a slow model never
holds the alarm ([45-SPEC-RECORD](45-SPEC-RECORD.md) §5.9).

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

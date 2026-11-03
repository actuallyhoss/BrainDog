# Scripts and calling out

When a rule's steps cannot say it, a pack carries a script: a function in JavaScript that the host runs in a sandbox, never inside the record. The sandbox holds nothing but `ctx`, and everything `ctx` can reach is named in the script's declaration, where the plan prints it before anything installs.

## A script's declaration

```code | Stripe's script, as the first-party pack declares it
{
  "script": "stripe",
  "title": "Stripe balance and payouts",
  "runs": { "every": "1h" },
  "egress": ["https://api.stripe.com"],
  "keys": ["stripe"],
  "reads": ["accounts"],
  "writes": ["accounts"],
  "limits": { "fetches": 3 },
  "source": "..."
}
```

- **`runs`** says when: `every` on a clock, `door` when a door receives something, or `rule: true` when a rule's step starts it.
- **`egress`** is every address it may call, each a bare `https://` origin: no path, no placeholder and nothing computed.
- **`keys`** are the Keychain keys it may send, by label. The script never holds a key: it names the label, and the host opens the key outside the sandbox.
- **`reads`** and **`writes`** are the lists it may read and write.
- **`limits`** asks for time, calls and writes (`cpu_ms`, `wall_ms`, `fetches`, `writes`). Without them a script gets 200 ms of CPU, 15 seconds in all, 5 calls out and 200 writes. The most a declaration may ask for is 1,000 ms of CPU, 30 seconds, 20 calls and 1,000 writes, and a declaration over that is refused rather than cut down.

The code lives twice in a pack's folder: as `<name>.js`, the file you edit, and as the `source` of the declaration, which is what a record runs. Open it with a comment that says what it does, in words a person deciding whether to install it can follow.

## What a script can do: `ctx`

```spec | ctx
ctx.input | what started it | a door's body and headers, the fields a rule copied, or null on a schedule
ctx.now() and ctx.tz | the time | the run's instant from the host clock, and the record's time zone
ctx.config | the pack's settings | defaults filled in, read at each run, frozen
ctx.record.list(list, where) | read rows | only lists in reads, filtered with a field and a test, such as state is open
ctx.record.get(id) | read one row | by its id, as items#12, only from lists in reads
ctx.write(list, fields) | add a row | only lists in writes
ctx.update(id, patch, version) | change a row | with the version it was read at, or none to write without comparing
ctx.fetch(url, { key }) | call out | only to an origin in egress, with a key named in keys
ctx.fold(text) | match a payee | a payee as a bank wrote it, as the name under it, or null; 1,000 a run and no more
ctx.cycle(day, line) | the next day a line is due | after day, as YYYY-MM-DD, worked out the way the forecast walks it, with line as { leg, fields, rest, anchorDay }, or null; 1,000 a run and no more
ctx.propose(question) | ask the owner | rows to make or change, or answers to pick, only about lists in writes; never applied until the owner accepts it; 20 a run
ctx.log(...) | say what happened | kept with the run, for the owner to read
```

A script's writes are queued and applied when it finishes, through the same path every other writer uses, so a list's rules and checks hold for them too. A script that throws writes nothing, and its message is kept with the run.

## Asking the owner: `ctx.propose`

Some things a script works out are not its to write: a key number for a project, a payee it thinks two bills share. It asks instead. `ctx.propose` files the same question an agent's `propose` files, a `rowset` of rows to make or change or `options` to pick from, and it waits in Needs you until the owner answers it.

```code | One question with the rows it would make
const said = await ctx.propose({
  question: 'Keep 2 key numbers for Kiln?',
  body_kind: 'rowset',
  body: { register: 'kpis', rows: [{ name: 'Revenue by month', thing: kiln.id, draft: true }] },
  cause: 'kpi-backfill:' + kiln.id,
});
```

- **Answered at once, in the record's words.** The question is tried against the record as it is asked, so the script reads `{ ok: true, value }` or the refusal it would get anywhere else, `{ ok: false, refusal: { code, fix, at } }`. `value.queued` is a new question, `value.joined` one already waiting with that cause, and `value.answered` one the owner answered before, which is not asked again.
- **Filed when the run finishes**, with its writes. A run that throws files none of its questions.
- **Only about what it may write.** Every list its rows name, and every row an answer would change, is one in `writes`. A script cannot propose a change to the record's lists, automations or plugins: that is a person's or an agent's to ask.
- **Never applied by itself.** Nothing a script proposes is written until the owner accepts it, and what accepting writes is signed by the owner.
- **Twenty questions a run.** A question that joins one waiting is not counted, so the next run files the rest. A run may call it 200 times in all.
- **Asked once.** Give a `cause`, a short key such as `kpi-backfill:<project>`, and a second run joins the open question rather than filing another.

```code | A script started by a rule, the first-party count-cash pack's pattern
{
  "rule": "count_cash",
  "name": "Write the difference of each count",
  "on": { "written": { "register": "cash_counts", "op": ["create"] } },
  "steps": [{ "script": { "id": "count_cash", "as": "queued" } }]
}
```

## Calling out

A pack reaches outside the record in three ways, and all three are printed in the plan as a `CALLS OUT` line, so the owner approves every host before it is called:

- **A script's `egress`**, as above.
- **An `ingest` on a schedule**: `pull` fetches something you own, `poll` fetches an address and acts only when the answer changed, and `call` posts to an address.
- **A rule's `call` step**, which posts to an address when the rule runs.

```code | braindog addon check on the first-party Stripe pack
Stripe 1.3.0 reads as an add-on: 0 lists, 0 pages and 0 example rows. Nothing was sent.
  By BrainDog, Apache-2.0.
  Installs first: money-core
  Adds lists: none; pages: none; rules: none
  Example rows: 0; suggests skills: none
  Calls out to: CALLS OUT api.stripe.com · every 1h · key "stripe" to the host its Keychain entry opens
  Refused in a scratch BrainDog: Add the key called "stripe" to the Keychain, then install. (REQUIRED_MISSING)
Stripe 1.3.0 would be refused by BrainDog, as said above.
```

The refusal on the last lines is the rule working: a pack that sends a key installs only when that key is already in the Keychain. A scratch BrainDog has an empty Keychain, so `check` says so for any pack that sends one.

The rules for an address are the same whichever way it is called:

- **Written out in full.** An `https://` origin with no placeholder, no user name and nothing computed, so the plan can print the host. An address that is not `https://` is refused.
- **No more often than every fifteen minutes**, or the provider's own higher floor.
- **A key by its label, never the key.** A pack that carries a credential anywhere, in a declaration, a setting or an example row, is refused.
- **Approved in the same press as the install.** A new or changed call-out is armed only when the owner approves its line, and an agent's install arrives as a proposal the owner accepts.

A call-out that is refused with a 401 or a 403 is not retried. It pauses, the owner is told, and it starts again only when somebody resumes it.

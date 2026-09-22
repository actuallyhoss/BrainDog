/**
 * What the checks of the automations runner (`94ba1ad8`) and section 4 of `loop/research-batch-thirty-two-audit.md`
 * left open, one test per finding.
 *
 * EACH TEST WAS RUN AGAINST THE CODE BEFORE ITS REPAIR AND FAILED ON THE LINE NAMED IN ITS COMMENT. Two of the five
 * repairs are refusals rather than wiring, because the start of a `metric` run and the hourly re-read of a rule about
 * time both belong in `index.ts`, which this change does not own. A body the record would install and never start is
 * the failure `flow-lint.ts`'s header names, so until the start lands the lint says so in a sentence.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, validateDeclaration, type Declaration, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 22, 12);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const OBLIGATIONS: Declaration = {
  id: 'register.obligations',
  kind: 'register',
  body: {
    id: 'obligations',
    name: 'Obligations',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'note', type: 'text' },
      { id: 'due', type: 'day' },
    ],
  } as never,
};

const PAID: Declaration = {
  id: 'register.paid',
  kind: 'register',
  body: { id: 'paid', name: 'Paid', title: 'merchant', fields: [{ id: 'merchant', type: 'text', required: true }] } as never,
};

/** A call a rule may start that posts a row: it sends a field of obligations. The lint suite's own fixture. */
const HOOK: Declaration = {
  id: 'ingest.post_invoice',
  kind: 'ingest',
  body: {
    ingest: 'post_invoice',
    channel: 'call',
    url: 'https://hooks.example.test/invoices',
    trigger: 'rule',
    grant: 'hook key',
    sends: ['obligations.what'],
  } as never,
};

/** A call that sends nothing: the GET of a price in `07 §6.2`, which a clock may start because it needs no row. */
const GOLD: Declaration = {
  id: 'ingest.gold_price',
  kind: 'ingest',
  body: { ingest: 'gold_price', channel: 'call', url: 'https://prices.example.test/gold', trigger: 'rule', grant: 'gold key' } as never,
};

/** Two doors: one whose arrivals write obligations and one whose arrivals write paid. */
const INVOICES: Declaration = {
  id: 'ingest.invoices',
  kind: 'ingest',
  body: { ingest: 'invoices', channel: 'webhook', writes: { register: 'obligations', confidence: 'exact' } } as never,
};
const BANK: Declaration = {
  id: 'ingest.bank',
  kind: 'ingest',
  body: { ingest: 'bank', channel: 'webhook', writes: { register: 'paid', confidence: 'exact' } } as never,
};

const METRIC: Declaration = { id: 'metric.cash_now', kind: 'metric', body: { metric: 'cash_now' } as never };

const rule = (body: Record<string, unknown>): Declaration => ({ id: `rule.${body.rule as string}`, kind: 'rule', body: body as never });
const known = new Map([OBLIGATIONS, PAID, HOOK, GOLD, INVOICES, BANK, METRIC].map((d) => [d.id, d.body as Record<string, never>]));
const lint = (decl: Declaration) => validateDeclaration(decl, known);

const why = (r: unknown): string => {
  const x = r as { ok: boolean; refusal?: { code: string; fix: string } };
  return x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`;
};
const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T };
  assert.ok(x.ok, why(r));
  return x.value;
};

async function withRuns(sql: NodeSql): Promise<void> {
  if (sql.one("SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = 'automation_run'")) return;
  const { default: ddl } = await import('../src/migrations/0011_automation_run.ts');
  sql.db.exec(ddl);
}

async function record(...decls: Declaration[]): Promise<{ k: Kernel; sql: NodeSql; clock: ReturnType<typeof fixedClock> }> {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  await withRuns(sql);
  const done = await k.install([OBLIGATIONS, ...decls]);
  assert.ok(done.ok, why(done));
  return { k, sql, clock };
}

type Run = { id: string; state: string; say: string | null };
const runs = (sql: NodeSql, of: string): Run[] => sql.all<Run>('SELECT id, state, say FROM automation_run WHERE rule = ? ORDER BY started_at, rowid', of);
const notes = (sql: NodeSql, actor: string): string[] =>
  sql.all<{ note: string }>("SELECT note FROM event WHERE kind = 'note' AND actor = ? ORDER BY rowid", actor).map((r) => r.note);

/* ── (a) a metric trigger ──────────────────────────────────────────────── */

test('A METRIC TRIGGER IS REFUSED WITH A SENTENCE until something starts it, and a wrong one is still told what is wrong', () => {
  /* MEASURED BEFORE THE REPAIR: this body linted clean against a record holding the metric, and nothing in the kernel
     reads `on.metric`. `onWritten`, `onArrival`, `onClock` and `automationRun` are the four starts there are, and each
     skips every trigger but its own, so the rule installed and was read by nothing for ever. */
  const crossing = rule({ rule: 'crossing', on: { metric: { id: 'cash_now', crosses: { lte: 0 } } }, steps: [{ notify: { say: 'Cash is out.' } }] });
  const said = lint(crossing);
  assert.equal(said?.code, 'NOT_IN_THIS_BUILD', 'a metric trigger installed with nothing to start it');
  assert.match(said?.fix ?? '', /metric/);
  assert.equal(validateDeclaration(crossing)?.code, 'NOT_IN_THIS_BUILD');
  /* The shape and the lookup still answer first, so the refusal a person reads is the one about what they wrote. */
  assert.equal(lint(rule({ rule: 'vague', on: { metric: { id: 'cash_now', crosses: 'lots' } }, steps: [{ stop: true }] }))?.code, 'DECLARATION_INVALID');
  assert.equal(lint(rule({ rule: 'ghost', on: { metric: { id: 'nobody', crosses: 'target' } }, steps: [{ stop: true }] }))?.code, 'DECLARATION_UNKNOWN');
});

/* ── (b) a run started by a delete ─────────────────────────────────────── */

test('A RUN STARTED BY A DELETE READS THE ROW AS IT WAS, and a step that would write to it fails with a sentence', async () => {
  /* MEASURED BEFORE THE REPAIR: the run started, `deps.entry` hid the deleted row, and the `if` below failed the run
     with "what is not a field" because the condition was read against the run's answers alone. With the `if` taken
     out, the note said "Gone: —", the hole `fill` writes for a path that reaches nothing. */
  const { k, sql } = await record(
    rule({
      rule: 'gone',
      on: { written: { register: 'obligations', op: ['delete'] } },
      once_per: ['what'],
      steps: [{ if: 'what is Rent', then: [{ notify: { say: 'Gone: {{trigger.row.what}}' } }] }],
    }),
    rule({ rule: 'mark', on: { written: { register: 'obligations', op: ['delete'] } }, steps: [{ set: { field: 'note', to: 'x' } }] }),
  );
  const row = value<{ id: string }>(k.create('obligations', { what: 'Rent' }, { actor: 'p_1' }));
  value(k.write('obligations', row.id, { deleted_at: 'now' }, { actor: 'p_1' }));
  await k.drain();

  assert.deepEqual(runs(sql, 'gone').map((r) => [r.state, r.say]), [['done', null]]);
  assert.deepEqual(notes(sql, 'rule:gone'), ['Gone: Rent']);
  const [mark] = runs(sql, 'mark');
  assert.equal(mark?.state, 'failed');
  assert.match(mark?.say ?? '', /deleted/, 'a write to a deleted row was not told that the row is deleted');
  assert.equal(k.get(row.id), null, 'a step brought the deleted row back');
  sql.close();
});

test('A RUN STARTED BY A DELETE HOLDS NO COPY OF THE ROW, so erasing what the row said leaves nothing of it in the run', async () => {
  /* MEASURED ON THE FIRST FORM OF THE REPAIR ABOVE: the run's trigger kept the whole deleted row, fields and all, in
     `automation_run.trigger`, and `eraseSubjects` does not read that table, so after an erasure of "Mara Quill" the
     name was still there for the ninety days `pruneRuns` keeps a finished run. The run now reads the row from the
     record, which the erasure tombstones in place. */
  const { k, sql } = await record(
    rule({
      rule: 'gone',
      on: { written: { register: 'obligations', op: ['delete'] } },
      once_per: ['what'],
      steps: [{ notify: { say: 'Gone: {{trigger.row.what}}' } }],
    }),
  );
  sql.exec("INSERT INTO person (id, email, name) VALUES ('p_owner', 'owner@studio.test', 'Olu Owner')");
  sql.exec("INSERT INTO member (person_id, register, level) VALUES ('p_owner', '*', 'owner')");
  const row = value<{ id: string }>(k.create('obligations', { what: 'Mara Quill', note: 'Rent' }, { actor: 'p_owner' }));
  value(k.write('obligations', row.id, { deleted_at: 'now' }, { actor: 'p_owner' }));
  await k.drain();
  assert.deepEqual(notes(sql, 'rule:gone'), ['Gone: Mara Quill'], 'the run did not read the deleted row');

  value(await k.erase({ subjects: ['Mara Quill'], basis: 'Article 17 request' }, 'p_owner'));
  const kept = sql.all<{ trigger: string }>("SELECT trigger FROM automation_run WHERE lower(trigger) LIKE '%quill%'");
  assert.deepEqual(kept, [], 'an erased name was left in a run of an automation');
  sql.close();
});

/* ── (c) a rule about time on the run path ─────────────────────────────── */

test('A RUN-PATH RULE ABOUT TIME IS REFUSED, since the hourly re-read only reads inline rules', async () => {
  /* MEASURED BEFORE THE REPAIR: this rule installed, a row due tomorrow was created, and after two days and a sweep by
     hand (`purge()`, which is `sweepRecord`, which calls `rulesAboutTime`) it had no run and no note. `rulesAboutTime`
     hands every rule to `applyRule`, which looks its register up by the top-level `register:`, and a run-path rule has
     none, so the refusal it got back was thrown away. The same words on an inline rule are swept and fire. */
  const { k, sql, clock } = await record();
  const on = { written: { register: 'obligations', op: ['create', 'update'] } };
  const late = rule({ rule: 'late', on, when: 'due before today', once_per: ['what'], steps: [{ set: { field: 'note', to: 'late' } }] });
  const done = await k.install([OBLIGATIONS, late]);
  assert.equal((done as { refusal?: { code: string } }).refusal?.code, 'NOT_IN_THIS_BUILD', 'a rule about time installed on the path nobody re-reads');
  assert.match((done as { refusal?: { fix: string } }).refusal?.fix ?? '', /today/);

  /* Without once_per the hourly re-read skips an inline rule too, so the run path is not refused for it. */
  const plain = rule({ rule: 'late', on, when: 'due before today', steps: [{ set: { field: 'note', to: 'late' } }] });
  assert.ok((await k.install([OBLIGATIONS, plain])).ok);

  /* And the inline rule it can be rewritten as is swept, which is the sentence's promise. */
  const inline = rule({ rule: 'late', register: 'obligations', when: 'due before today', once_per: ['what'], then: [{ set: { field: 'note', to: 'late' } }] });
  assert.ok((await k.install([OBLIGATIONS, inline])).ok);
  const row = value<{ id: string }>(k.create('obligations', { what: 'Rent', due: '2026-09-23' }, { actor: 'p_1' }));
  clock.advance(2 * DAY);
  k.purge();
  assert.equal(k.get(row.id)?.fields.note, 'late');
  sql.close();
});

/* ── (d) the bodies are parsed once per version ────────────────────────── */

test('THE INSTALLED AUTOMATIONS ARE PARSED ONCE PER VERSION, not on every write', async () => {
  /* MEASURED BEFORE THE REPAIR: `installed` ran `JSON.parse` over every active rule body on every write, whether or not
     any rule was on the run path, so two reads handed back two different objects for one unchanged declaration. */
  const { installed } = await import('../src/flow.ts');
  const { k, sql } = await record(
    rule({ rule: 'button', on: { manual: true }, steps: [{ notify: { say: 'one' } }] }),
    rule({ rule: 'inline', register: 'obligations', then: [{ tag: 'x' }] }),
  );
  const first = installed(sql);
  const second = installed(sql);
  assert.deepEqual(first.map((r) => r.id), ['button'], 'an inline rule was offered to the runner');
  assert.equal(second[0]!.body, first[0]!.body, 'an unchanged declaration was parsed again');

  value(await k.install([OBLIGATIONS, rule({ rule: 'button', on: { manual: true }, steps: [{ notify: { say: 'two' } }] })]));
  const third = installed(sql);
  assert.equal(third[0]!.version, first[0]!.version + 1);
  assert.deepEqual(third[0]!.body.steps, [{ notify: { say: 'two' } }], 'a new version was answered from the cache of the old one');

  /* A RETIRED RULE LEAVES THE LIST, cache or no cache. */
  sql.exec("UPDATE declaration SET retired = 1 WHERE id = 'rule.button' AND superseded_at IS NULL");
  assert.deepEqual(installed(sql), []);
  sql.close();
});

/* ── (e) a call step and run: agree ────────────────────────────────────── */

test('A CALL THAT SENDS A ROW NEEDS A ROW, from a call step and from run: alike, and a call that sends none does not', () => {
  /* MEASURED BEFORE THE REPAIR, the audit's four lines: `run:` on a clock was refused and the same call as a step
     installed on a clock, a button and an arrival. An arrival whose door writes obligations does bring an obligations
     row, and the price GET sends nothing, so those two install. */
  const step = (rule_: string, on: unknown, ingest: string) => rule({ rule: rule_, on, steps: [{ call: { ingest, as: 'out' } }] });
  const run = (rule_: string, on: unknown, ingest: string) => rule({ rule: rule_, on, once_per: ['what'], steps: [{ run: ingest }] });

  assert.equal(lint(run('hourly_run', { every: '1h' }, 'post_invoice'))?.code, 'DECLARATION_INVALID');
  assert.equal(lint(step('hourly', { every: '1h' }, 'post_invoice'))?.code, 'DECLARATION_INVALID', 'a clock posts a row it does not have');
  assert.equal(lint(step('button', { manual: true }, 'post_invoice'))?.code, 'DECLARATION_INVALID', 'a button posts a row it does not have');
  assert.equal(lint(step('landed', { arrival: {} }, 'post_invoice'))?.code, 'DECLARATION_INVALID', 'any arrival posts an obligations row');
  assert.equal(lint(step('banked', { arrival: { ingest: 'bank' } }, 'post_invoice'))?.code, 'DECLARATION_INVALID', 'a paid row was posted as an obligation');
  assert.equal(lint(run('landed_run', { arrival: {} }, 'post_invoice'))?.code, 'DECLARATION_INVALID', 'run: on any arrival posts an obligations row');

  assert.equal(lint(step('invoiced', { arrival: { ingest: 'invoices' } }, 'post_invoice')), null);
  assert.equal(lint(run('invoiced_run', { arrival: { ingest: 'invoices' } }, 'post_invoice')), null);
  assert.equal(lint(step('gold', { every: '1h' }, 'gold_price')), null);

  const said = lint(step('hourly', { every: '1h' }, 'post_invoice'));
  assert.match(said?.fix ?? '', /sends fields of obligations/);
});

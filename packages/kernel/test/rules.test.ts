/**
 * Rules: a declaration that says what happens when a row looks a certain way.
 *
 * A RULE IS A DOCUMENT, NOT CODE — which is the difference between a product whose behaviour a
 * person can read and one whose behaviour is in a repository they do not have. What is asserted here
 * is mostly the boundaries: a rule cannot go around the record's own rules, cannot start a second
 * pass with its own write, cannot set a field an earlier rule already set, and cannot notify twice
 * about one row.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fillTemplate, openRecord, orderRules, type Declaration, type DryRun, type Entry, type Kernel, type RuleDecl } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 5, 12);
const DAY = 86_400_000;

const OBLIGATIONS: Declaration = {
  id: 'register.obligations',
  kind: 'register',
  body: {
    id: 'obligations',
    name: 'Obligations',
    title: 'what',
    state: 'state',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'party', type: 'text', index: true },
      { id: 'amount', type: 'money' },
      { id: 'due', type: 'day', index: true },
      { id: 'chase', type: 'text' },
      { id: 'owner', type: 'ref', to: 'people' },
      { id: 'tags', type: 'list', of: 'text' },
      {
        id: 'state',
        type: 'enum',
        values: ['open', 'late', 'paid'],
        index: true,
        transitions: { open: { to: ['late', 'paid'] }, late: { to: ['paid'] }, paid: { to: [] } },
      },
    ],
  } as never,
};

const PEOPLE: Declaration = {
  id: 'register.people',
  kind: 'register',
  body: { id: 'people', name: 'People', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] } as never,
};

const rule = (body: Record<string, unknown>): Declaration => ({
  id: `rule.${body.rule as string}`,
  kind: 'rule',
  body: body as never,
});

const day = (offset: number) => new Date(NOW + offset * DAY).toISOString().slice(0, 10);

type Clockish = ReturnType<typeof fixedClock>;

async function record(...rules: Declaration[]): Promise<{ k: Kernel; sql: NodeSql; clock: Clockish }> {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  assert.ok((await k.install([OBLIGATIONS, PEOPLE, ...rules])).ok);
  return { k, sql, clock };
}

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const notes = (sql: NodeSql) => sql.all<{ actor: string; note: string }>("SELECT actor, note FROM event WHERE kind = 'note' ORDER BY rowid");

/* ── it fires ────────────────────────────────────────────────────────────── */

test('A RULE IS A DECLARATION, and the row it is about comes back as the rule left it', async () => {
  const { k, sql } = await record(
    rule({ rule: 'late', register: 'obligations', when: 'state is open, due before today', then: [{ move: 'late' }, { tag: 'chased' }] }),
  );

  const made = value<Entry>(k.create('obligations', { what: 'Invoice 41', due: day(-3), state: 'open' }, { actor: 'p_1' }));
  assert.equal(made.state, 'late', 'the caller was handed a row that is not what the record holds');
  assert.deepEqual(made.fields.tags, ['chased']);

  // The rule's write wears its own name, and shares the triggering write's batch.
  const events = sql.all<{ actor: string; kind: string; batch: string | null }>('SELECT actor, kind, batch FROM event ORDER BY rowid');
  assert.deepEqual(events.map((e) => e.actor), ['p_1', 'rule:late']);
  assert.equal(events[1]?.batch, events[0] ? sql.one<{ id: string }>('SELECT id FROM event ORDER BY rowid LIMIT 1')?.id : null);
  sql.close();
});

test('and a row the rule does not describe is left alone', async () => {
  const { k, sql } = await record(
    rule({ rule: 'late', register: 'obligations', when: 'state is open, due before today', then: [{ move: 'late' }] }),
  );
  const future = value<Entry>(k.create('obligations', { what: 'Later', due: day(30), state: 'open' }, { actor: 'p_1' }));
  assert.equal(future.state, 'open');
  sql.close();
});

/* ── it cannot go around the record ──────────────────────────────────────── */

test('A RULE ANSWERS TO THE TRANSITIONS THE REGISTER DECLARES, like anybody else', async () => {
  /* A rule is not a way around the record's rules; it is a caller like any other wearing its own
     name. `paid` declares no transitions out, so a rule that tries to move one is refused — and the
     triggering write is NOT undone by the refusal. */
  const { k, sql } = await record(
    rule({ rule: 'reopen', register: 'obligations', when: 'state is paid', then: [{ move: 'open' }] }),
  );
  const paid = value<Entry>(k.create('obligations', { what: 'Settled', due: day(-1), state: 'paid' }, { actor: 'p_1' }));
  assert.equal(paid.state, 'paid', 'a rule walked out of a terminal state');
  assert.ok(k.get('obligations#1'), 'the triggering write was undone by a rule refusing');
  sql.close();
});

test('ONE PASS, IN ORDER, AND EACH RULE SEES WHAT THE ONE BEFORE IT DID', async () => {
  /* Which is why `stop` exists and why the `set` precedence is per pass rather than per rule. It is
     a chain and not a loop: the order is fixed, every rule runs at most once, and a rule's own write
     starts no second pass — every product that allowed that grew a depth limit and then a graph
     explorer to explain the depth limit. */
  const { k, sql } = await record(
    rule({ rule: 'a', register: 'obligations', when: 'state is open', priority: 10, then: [{ move: 'late' }] }),
    rule({ rule: 'b', register: 'obligations', when: 'state is late', priority: 20, then: [{ tag: 'second' }] }),
  );
  const made = value<Entry>(k.create('obligations', { what: 'x', due: day(-1), state: 'open' }, { actor: 'p_1' }));
  assert.equal(made.state, 'late');
  assert.deepEqual(made.fields.tags, ['second'], 'the later rule did not see the earlier one’s work');

  /* AND IT IS BOUNDED. One write by the person and one by each rule — four events would mean a rule
     ran on a rule's write, which is the thing that cannot terminate. */
  const events = sql.all<{ actor: string }>('SELECT actor FROM event ORDER BY rowid').map((e) => e.actor);
  assert.deepEqual(events, ['p_1', 'rule:a', 'rule:b']);
  sql.close();
});

test('and a rule that would re-match its own change fires once, not forever', async () => {
  // `a` moves an open row to late; a rule ordered AFTER it that also matches `open` never sees one.
  const { k, sql } = await record(
    rule({ rule: 'a', register: 'obligations', when: 'state is open', priority: 10, then: [{ move: 'late' }] }),
    rule({ rule: 'z', register: 'obligations', when: 'state is open', priority: 20, then: [{ tag: 'again' }] }),
  );
  const made = value<Entry>(k.create('obligations', { what: 'x', due: day(-1), state: 'open' }, { actor: 'p_1' }));
  assert.equal(made.state, 'late');
  assert.equal(made.fields.tags, undefined, 'a rule matched a state its predecessor had already left');
  sql.close();
});

/* ── one `set` per field ─────────────────────────────────────────────────── */

test('TWO RULES SETTING ONE FIELD IS A DISAGREEMENT, and the FIRST one wins', async () => {
  /* Resolving it by running both leaves whichever ran last — an order nobody declared. Priority
     first, then the longest literal, so a specific rule beats a general one without being numbered. */
  const { k, sql } = await record(
    rule({ rule: 'general', register: 'obligations', when: 'state is open', then: [{ set: { field: 'chase', to: 'a letter' } }] }),
    rule({
      rule: 'specific',
      register: 'obligations',
      when: 'state is open, party is Halden Type Co',
      then: [{ set: { field: 'chase', to: 'a phone call' } }],
    }),
  );
  const made = value<Entry>(
    k.create('obligations', { what: 'x', party: 'Halden Type Co', due: day(-1), state: 'open' }, { actor: 'p_1' }),
  );
  assert.equal(made.fields.chase, 'a phone call', 'the general rule beat the specific one');
  sql.close();
});

test('and priority beats the literal, because that is what it is for', () => {
  const ordered = orderRules([
    { rule: 'b', register: 'r', then: [], when: 'party is a very long literal indeed' },
    { rule: 'a', register: 'r', then: [], when: 'x is y', priority: 10 },
    { rule: 'c', register: 'r', then: [], when: 'x is y' },
  ]);
  assert.deepEqual(ordered.map((r) => r.rule), ['a', 'b', 'c']);
});

/* ── once_per ────────────────────────────────────────────────────────────── */

test('A `notify` WITHOUT `once_per` IS REFUSED, because it would fire on every write of the row', async () => {
  const { k, sql } = await record(
    rule({ rule: 'shout', register: 'obligations', when: 'state is open', then: [{ notify: { say: 'look' } }] }),
  );
  value(k.create('obligations', { what: 'x', due: day(-1), state: 'open' }, { actor: 'p_1' }));
  assert.equal(notes(sql).length, 0, 'a rule notified on every write');
  sql.close();
});

test('and with one, it fires ONCE for the row however many times the row is written', async () => {
  const { k, sql } = await record(
    rule({
      rule: 'chase',
      register: 'obligations',
      when: 'state is open, due before today',
      once_per: ['entry'],
      then: [{ notify: { say: '{{what}} is {{ago:due}}' } }],
    }),
  );
  value(k.create('obligations', { what: 'Invoice 41', due: day(-3), state: 'open' }, { actor: 'p_1' }));
  value(k.update('obligations', 'obligations#1', { chase: 'a' }, { actor: 'p_1' }));
  value(k.update('obligations', 'obligations#1', { chase: 'b' }, { actor: 'p_1' }));

  const said = notes(sql);
  assert.equal(said.length, 1, `it notified ${said.length} times about one row`);
  assert.equal(said[0]?.actor, 'rule:chase');
  assert.equal(said[0]?.note, 'Invoice 41 is 3 days ago');

  // The marker is a schedule row, because that table already carries exactly-once as an index.
  assert.equal(sql.all("SELECT 1 FROM schedule WHERE kind = 'rule'").length, 1);
  sql.close();
});

test('a second row of the same register gets its own firing', async () => {
  const { k, sql } = await record(
    rule({
      rule: 'chase',
      register: 'obligations',
      when: 'state is open',
      once_per: ['entry'],
      then: [{ notify: { say: '{{what}}' } }],
    }),
  );
  value(k.create('obligations', { what: 'One', due: day(-1), state: 'open' }, { actor: 'p_1' }));
  value(k.create('obligations', { what: 'Two', due: day(-1), state: 'open' }, { actor: 'p_1' }));
  assert.deepEqual(notes(sql).map((n) => n.note), ['One', 'Two']);
  sql.close();
});

/* ── link ────────────────────────────────────────────────────────────────── */

test('`link` TAKES EXACTLY ONE MATCH OR NOTHING, because two is a question about which', async () => {
  const { k, sql } = await record(
    rule({
      rule: 'assign',
      register: 'obligations',
      when: 'state is open',
      then: [{ link: { field: 'owner', to: { register: 'people', by: 'name', value: '{{party}}' } } }],
    }),
  );
  value(k.create('people', { name: 'Halden' }, { actor: 'p_1' }));
  const one = value<Entry>(k.create('obligations', { what: 'x', party: 'Halden', due: day(1), state: 'open' }, { actor: 'p_1' }));
  assert.equal(one.fields.owner, k.get('people#1')?.id);

  // A second row bearing the name, and the link is skipped rather than guessing.
  value(k.create('people', { name: 'Halden' }, { actor: 'p_1' }));
  const two = value<Entry>(k.create('obligations', { what: 'y', party: 'Halden', due: day(1), state: 'open' }, { actor: 'p_1' }));
  assert.equal(two.fields.owner, undefined, 'a rule picked one of two rows bearing the name');

  // And a name no row bears is nothing, not a broken reference.
  const none = value<Entry>(k.create('obligations', { what: 'z', party: 'Nobody', due: day(1), state: 'open' }, { actor: 'p_1' }));
  assert.equal(none.fields.owner, undefined);
  sql.close();
});

/* ── the sentence a rule writes ──────────────────────────────────────────── */

test('THE SENTENCE IS THE ONE SOMEBODY READS IN SIX WEEKS, and a missing value is an em dash', () => {
  // A sentence with a hole in it reads as a bug; one with a dash reads as a fact.
  const row = {
    id: '01ABC',
    register: 'obligations',
    seq: 41,
    fields: { what: 'Invoice 41', amount: { amount: 480_000, currency: 'GBP' }, due: '2026-09-08', tags: ['a', 'b'] },
  } as never as Entry;

  assert.equal(fillTemplate('{{what}} is {{money:amount}}', row, NOW), 'Invoice 41 is GBP 4800.00');
  assert.equal(fillTemplate('{{id}}', row, NOW), 'obligations#41');
  assert.equal(fillTemplate('{{until:due}}', row, NOW), 'in 3 days');
  assert.equal(fillTemplate('{{tags}}', row, NOW), 'a, b');
  assert.equal(fillTemplate('{{party}}', row, NOW), '—');
  assert.equal(fillTemplate('{{amount}}', row, NOW), 'GBP 4800.00', 'money says its currency however it is asked for');
});

/* ── stop ────────────────────────────────────────────────────────────────── */

test('`stop` ENDS THE PASS, and the rule that said so still applies its own patch', async () => {
  const { k, sql } = await record(
    rule({ rule: 'a', register: 'obligations', when: 'state is open', priority: 10, then: [{ tag: 'first' }, { stop: true }] }),
    rule({ rule: 'b', register: 'obligations', when: 'state is open', priority: 20, then: [{ tag: 'second' }] }),
  );
  const made = value<Entry>(k.create('obligations', { what: 'x', due: day(1), state: 'open' }, { actor: 'p_1' }));
  assert.deepEqual(made.fields.tags, ['first']);
  sql.close();
});

/* ── a rule that cannot be read ──────────────────────────────────────────── */

test('A RULE WHOSE PREDICATE THE REGISTER CANNOT ANSWER FIRES ON NOTHING', async () => {
  /* The other direction — firing on everything — is what a broken predicate does when nobody checks
     it, and a rule that tags every row is a rule whose author will not find out for a month. */
  const { k, sql } = await record(
    rule({ rule: 'broken', register: 'obligations', when: 'colour is red', then: [{ tag: 'oops' }] }),
  );
  const made = value<Entry>(k.create('obligations', { what: 'x', due: day(1), state: 'open' }, { actor: 'p_1' }));
  assert.equal(made.fields.tags, undefined, 'a rule nobody can read tagged a row');
  sql.close();
});

test('and a record with no rules at all pays nothing for the pass', async () => {
  const { k, sql } = await record();
  const made = value<Entry>(k.create('obligations', { what: 'x', due: day(1), state: 'open' }, { actor: 'p_1' }));
  assert.equal(made.state, 'open');
  assert.equal(sql.all('SELECT 1 FROM event').length, 1, 'the pass wrote something on a record with no rules');
  sql.close();
});

/* ── what it would do ─────────────────────────────────────────── */

const CANDIDATE: RuleDecl = {
  rule: 'chase',
  register: 'obligations',
  when: 'state is open, due before today',
  then: [{ set: { field: 'chase', to: 'a letter' } }, { tag: 'late' }],
};

test('A DRY RUN SAYS WHAT A RULE WOULD DO, BEFORE ANYBODY TURNS IT ON', async () => {
  /* A rule changes rows while nobody is looking. The honest way to introduce one is to say "this
     matches three rows, wins on two, loses one to `already`" — and every product that ships rules
     without this ships a feature people are afraid of. */
  const { k, sql } = await record();
  value(k.create('obligations', { what: 'Late one', due: day(-3), state: 'open' }, { actor: 'p_1' }));
  value(k.create('obligations', { what: 'Late two', due: day(-1), state: 'open' }, { actor: 'p_1' }));
  value(k.create('obligations', { what: 'Not yet', due: day(30), state: 'open' }, { actor: 'p_1' }));

  const out = value<DryRun>(k.dryRun(CANDIDATE));
  assert.equal(out.rows, 3);
  assert.equal(out.matches, 2, 'the preview matched the rows the predicate does not');
  assert.equal(out.won, 2);
  assert.equal(out.lost, 0);
  assert.deepEqual(
    out.sample.map((s) => s.spoken),
    ['obligations#1', 'obligations#2'],
  );
  assert.deepEqual(out.sample[0]?.would, ['set chase to a letter', 'tag late']);

  /* AND NOTHING WAS WRITTEN. Not "the writes were skipped" — nothing here calls the write path at
     all, so there is no path by which a preview becomes a change. */
  assert.equal(k.get('obligations#1')?.fields.chase, undefined);
  assert.equal(sql.all('SELECT 1 FROM event').length, 3, 'the preview wrote an event');
  sql.close();
});

test('and it says WHICH RULE takes the rows it loses, which is the answer to "why did nothing happen"', async () => {
  const { k, sql } = await record(
    rule({
      rule: 'already',
      register: 'obligations',
      when: 'state is open, party is Halden Type Co',
      then: [{ set: { field: 'chase', to: 'a phone call' } }],
    }),
  );
  value(k.create('obligations', { what: 'a', party: 'Halden Type Co', due: day(-1), state: 'open' }, { actor: 'p_1' }));
  value(k.create('obligations', { what: 'b', party: 'Somebody else', due: day(-1), state: 'open' }, { actor: 'p_1' }));

  const out = value<DryRun>(k.dryRun(CANDIDATE));
  assert.equal(out.matches, 2);
  assert.equal(out.won, 1);
  assert.equal(out.lost, 1);
  assert.deepEqual(out.takenBy, { already: 1 });

  const lost = out.sample.find((s) => s.reason);
  assert.match(lost?.reason ?? '', /already sets chase first/);
  assert.deepEqual(lost?.would, [], 'a row it loses still shows what it would do');
  sql.close();
});

test('a preview of a CHANGE to a live rule ranks against the others, not against itself', async () => {
  // Previewing an edit is the common case, and a rule competing with its own old version would lose
  // every row to a rule that is about to stop existing.
  const { k, sql } = await record(
    rule({ rule: 'chase', register: 'obligations', when: 'state is open', then: [{ set: { field: 'chase', to: 'the old way' } }] }),
  );
  value(k.create('obligations', { what: 'a', due: day(-1), state: 'open' }, { actor: 'p_1' }));

  const out = value<DryRun>(k.dryRun(CANDIDATE));
  assert.equal(out.won, 1, 'the candidate lost to the version of itself it is replacing');
  assert.deepEqual(out.takenBy, {});
  sql.close();
});

test('and a row it has already fired on says so rather than counting as a win', async () => {
  const { k, sql } = await record(
    rule({
      rule: 'chase',
      register: 'obligations',
      when: 'state is open',
      once_per: ['entry'],
      then: [{ notify: { say: 'x' } }],
    }),
  );
  value(k.create('obligations', { what: 'a', due: day(-1), state: 'open' }, { actor: 'p_1' }));

  const out = value<DryRun>(
    k.dryRun({ rule: 'chase', register: 'obligations', when: 'state is open', once_per: ['entry'], then: [{ notify: { say: 'x' } }] }),
  );
  assert.equal(out.suppressed, 1);
  assert.match(out.sample[0]?.reason ?? '', /already fired/);
  sql.close();
});

test('A LINK THAT CANNOT BE MADE IS NAMED IN THE PREVIEW, because that is where somebody finds out', async () => {
  const { k, sql } = await record();
  value(k.create('obligations', { what: 'a', party: 'Nobody', due: day(-1), state: 'open' }, { actor: 'p_1' }));

  const out = value<DryRun>(
    k.dryRun({
      rule: 'assign',
      register: 'obligations',
      when: 'state is open',
      then: [{ link: { field: 'owner', to: { register: 'people', by: 'name', value: '{{party}}' } } }],
    }),
  );
  assert.match(out.sample[0]?.would[0] ?? '', /nothing bears that name/);
  sql.close();
});

test('a candidate the register cannot answer is refused rather than previewed as nothing', async () => {
  const { k, sql } = await record();
  const out = k.dryRun({ rule: 'x', register: 'obligations', when: 'colour is red', then: [{ tag: 'a' }] });
  assert.equal(out.ok, false);
  const other = k.dryRun({ rule: 'x', register: 'nothing', when: 'a is b', then: [] });
  assert.equal(other.ok, false);
  if (!other.ok) assert.equal(other.refusal.code, 'REGISTER_UNKNOWN');
  sql.close();
});

/* ── four ways a rule did the wrong thing quietly ───────────────────── */

const READINGS: Declaration = {
  id: 'register.readings',
  kind: 'register',
  body: {
    id: 'readings',
    name: 'Readings',
    series: true,
    title: 'what',
    fields: [
      { id: 'what', type: 'text' },
      { id: 'level', type: 'int' },
      { id: 'tags', type: 'list', of: 'text' },
    ],
  } as never,
};

test('A RULE ON A SERIES REGISTER EDITS THE ROW IT FIRED ON, and does not make a second one', async () => {
  /* A series row has no `<register>#<seq>` to be named by, and passing null asked the write path to
     CREATE — so the matched row was untouched and a junk row holding only the patch appeared beside
     it. `dryRun` said it had fired, which is how it stayed invisible. */
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok(
    (
      await k.install([
        READINGS,
        rule({ rule: 'hot', register: 'readings', when: { field: 'level', gt: 40 }, then: [{ tag: 'hot' }] }),
      ])
    ).ok,
  );

  const made = value<Entry>(k.create('readings', { what: 'temp', level: 42 }, { actor: 'p_1' }));
  const rows = sql.all<{ id: string; fields: string }>("SELECT id, fields FROM entry WHERE register = 'readings'");
  assert.equal(rows.length, 1, 'the rule created a second row instead of editing the one it fired on');
  assert.deepEqual(JSON.parse(rows[0]!.fields).tags, ['hot']);
  assert.equal(rows[0]!.id, made.id);
  sql.close();
});

test('A REFUSED RULE IS NOT MARKED AS FIRED, or it never runs again once the data is fixed', async () => {
  /* The marker went in before the write was attempted. A rule that did nothing was marked done for
     ever — and the preview then asserted "it has already fired for this row". */
  const { k, sql } = await record(
    rule({
      rule: 'deadline',
      register: 'obligations',
      when: 'state is open',
      once_per: ['entry'],
      then: [{ notify: { say: 'chase {{what}}' } }, { set: { field: 'due', to: 'not a day' } }],
    }),
  );
  const made = value<Entry>(k.create('obligations', { what: 'Invoice 41', state: 'open' }, { actor: 'p_1' }));
  assert.equal(made.fields.due, undefined);
  assert.equal(sql.all("SELECT 1 FROM schedule WHERE kind = 'rule'").length, 0, 'a rule that wrote nothing was marked as fired');

  // And it did not announce what it had not done.
  assert.deepEqual(notes(sql).filter((n) => n.actor === 'rule:deadline'), []);

  // Fix the rule, and it fires — which it could not do while the marker stood.
  const out = value<DryRun>(
    k.dryRun({ rule: 'deadline', register: 'obligations', when: 'state is open', once_per: ['entry'], then: [{ notify: { say: 'x' } }] }),
  );
  assert.equal(out.suppressed, 0);
  assert.equal(out.won, 1);
  sql.close();
});

test('THE ONCE_PER KEY CANNOT BE FORGED BY A COLON, and a row missing the field is its own key', async () => {
  /* `join(':')` made `(Acme, INV:2026)` and `(Acme:INV, 2026)` one key, and every row missing every
     named field shared the single key `chase::` — four rows, two notifications. */
  const { k, sql } = await record(
    rule({
      rule: 'chase',
      register: 'obligations',
      when: 'state is open',
      once_per: ['party', 'chase'],
      then: [{ notify: { say: 'chase {{what}}' } }],
    }),
  );
  const rows = [
    { what: 'A', party: 'Acme', chase: 'INV:2026' },
    { what: 'B', party: 'Acme:INV', chase: '2026' },
    { what: 'C' },
    { what: 'D' },
  ];
  for (const r of rows) value<Entry>(k.create('obligations', { ...r, state: 'open' }, { actor: 'p_1' }));

  assert.deepEqual(
    notes(sql).map((n) => n.note),
    ['chase A', 'chase B', 'chase C', 'chase D'],
  );

  // And the key still dedupes: the same pair twice is one notification.
  value<Entry>(k.create('obligations', { what: 'E', party: 'Acme', chase: 'INV:2026', state: 'open' }, { actor: 'p_1' }));
  assert.equal(notes(sql).length, 4);
  sql.close();
});

test('and the preview counts the collisions among the rows it is previewing', async () => {
  /* Three rows sharing a party is one notification. The preview promised three — wrong about the
     one feature it exists to explain. */
  const { k, sql } = await record();
  for (const what of ['x0', 'x1', 'x2'])
    value<Entry>(k.create('obligations', { what, party: 'Acme', state: 'open' }, { actor: 'p_1' }));

  const candidate: RuleDecl = {
    rule: 'chase',
    register: 'obligations',
    when: 'state is open',
    once_per: ['party'],
    then: [{ notify: { say: 'chase {{what}}' } }],
  } as RuleDecl;
  const out = value<DryRun>(k.dryRun(candidate));

  assert.equal(out.matches, 3);
  assert.equal(out.suppressed, 2);
  assert.deepEqual(out.sample.map((r) => r.would.length), [1, 0, 0]);
  assert.match(out.sample[1]?.reason ?? '', /an earlier row in this preview/);

  // And the pass agrees with the preview, which is the whole point of having one.
  assert.ok((await k.install([rule(candidate as never)])).ok);
  value<Entry>(k.create('obligations', { what: 'x3', party: 'Acme', state: 'open' }, { actor: 'p_1' }));
  assert.equal(notes(sql).length, 1);
  sql.close();
});

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

import { refused } from '@braindog/ports';

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

  /* THE RULE'S WRITE WEARS ITS OWN NAME, shares the triggering write's batch, and lands as ONE ROW
     PER CHANGED FIELD — a `state` because the register declares one, and a `tag` naming the value
     that arrived rather than an `edit` naming two arrays. */
  const events = sql.all<{ actor: string; kind: string; field: string | null; from_v: string | null; to_v: string | null; batch: string | null }>(
    'SELECT actor, kind, field, from_v, to_v, batch FROM event ORDER BY rowid',
  );
  assert.deepEqual(
    events.map((e) => `${e.actor}/${e.kind}/${e.field ?? '—'}`),
    ['p_1/create/—', 'rule:late/state/state', 'rule:late/tag/tags'],
  );
  assert.equal(events[1]?.from_v, '"open"');
  assert.equal(events[1]?.to_v, '"late"');
  assert.equal(events[2]?.to_v, '"chased"', 'the tag row does not name the tag');

  const trigger = sql.one<{ id: string }>('SELECT id FROM event ORDER BY rowid LIMIT 1')?.id;
  assert.equal(events[1]?.batch, trigger);
  assert.equal(events[2]?.batch, trigger, 'the two rows a rule wrote are not one batch');
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
  const { k, sql } = await record();
  const out = await k.install([
    rule({ rule: 'shout', register: 'obligations', when: 'state is open', then: [{ notify: { say: 'look' } }] }),
  ]);
  assert.equal(out.ok, false);
  assert.equal((out as { refusal: { at?: string } }).refusal.at, 'once_per');

  // And one that got in behind the linter still says nothing, rather than saying it every write.
  sql.exec(
    `INSERT INTO declaration (id, version, kind, pack_id, body, checksum, retired, superseded_at, created_at)
     VALUES ('rule.shout', 1, 'rule', NULL, ?, 'x', 0, NULL, ?)`,
    JSON.stringify({ rule: 'shout', register: 'obligations', when: 'state is open', then: [{ notify: { say: 'look' } }] }),
    new Date(NOW).toISOString(),
  );
  assert.ok((await k.install([])).ok);
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

test('A RULE WHOSE PREDICATE THE REGISTER CANNOT ANSWER IS REFUSED AT INSTALL', async () => {
  /* It fires on nothing, deliberately — the other direction, firing on everything, is what a broken
     predicate does when nobody checks it. But firing on nothing for ever, with no event and no
     refusal, is silence, and silence is the one failure this record does not accept anywhere else. */
  const { k, sql } = await record();
  const out = await k.install([rule({ rule: 'broken', register: 'obligations', when: 'colour is red', then: [{ tag: 'oops' }] })]);
  assert.equal(out.ok, false);
  assert.match((out as { refusal: { fix: string } }).refusal.fix, /rule\.broken cannot be read/);

  // A rule about a register nobody has is the same class of silence.
  const gone = await k.install([rule({ rule: 'nowhere', register: 'ghosts', when: 'state is open', then: [{ tag: 'x' }] })]);
  assert.equal(gone.ok, false);
  assert.equal((gone as { refusal: { code: string } }).refusal.code, 'REGISTER_UNKNOWN');

  // And a ref by name is not a declaration error: the row it names may be written tomorrow.
  assert.ok((await k.install([rule({ rule: 'mine', register: 'obligations', when: 'owner is Nobody Yet', then: [{ tag: 'x' }] })])).ok);
  sql.close();
});

test('and one that got in behind the linter still fires on nothing rather than on everything', async () => {
  // A `.brain` import writes declarations straight into the table, so the pass keeps its own guard.
  const { k, sql } = await record();
  sql.exec(
    `INSERT INTO declaration (id, version, kind, pack_id, body, checksum, retired, superseded_at, created_at)
     VALUES ('rule.broken', 1, 'rule', NULL, ?, 'x', 0, NULL, ?)`,
    JSON.stringify({ rule: 'broken', register: 'obligations', when: 'colour is red', then: [{ tag: 'oops' }] }),
    new Date(NOW).toISOString(),
  );
  assert.ok((await k.install([])).ok, 'reload');
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

test('A PREVIEW IS CLAMPED AT BOTH ENDS, and it was clamped at one', async () => {
  /* `Math.max(1, …)` stopped a limit of zero and let a limit of a billion through. The CALLER sends
     the rule and the ceiling together, and the loop behind them calls `entry(id)` and `matches` per
     row on a single-threaded object, so `{ limit: 1e9 }` is a scan of the whole register with a
     predicate the caller also wrote. `applyRule` has taken `Math.min(…, MOST)` since it was written;
     the read half took nothing.

     ASSERTED ON THE `LIMIT` THAT REACHES SQLITE rather than by making five thousand rows, because
     the number in the query IS the clamp: a test that counted rows would pass on a register too
     small to reach the ceiling, which is every register in every test in this file. */
  const sql = openSqlite();
  const seen: number[] = [];
  const watched: NodeSql = {
    ...sql,
    all: <T,>(text: string, ...params: unknown[]) => {
      if (/SELECT id FROM entry WHERE register = \? AND deleted_at IS NULL ORDER BY seq LIMIT \?/u.test(text))
        seen.push(Number(params[1]));
      return sql.all<T>(text, ...(params as never[]));
    },
  } as NodeSql;

  const k = await openRecord(watched, fixedClock(NOW));
  assert.ok((await k.install([OBLIGATIONS, PEOPLE])).ok);

  value<DryRun>(k.dryRun(CANDIDATE, 1e9));
  value<DryRun>(k.dryRun(CANDIDATE, 0));
  value<DryRun>(k.dryRun(CANDIDATE));
  assert.deepEqual(seen, [5000, 1, 5000], 'a preview read as many rows as the caller asked for');
  sql.close();
});

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
  assert.ok(refused(other));
  assert.equal(other.refusal.code, 'REGISTER_UNKNOWN');
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

/* ── one row becomes a matrix of rows ────────────────────────── */

const STYLES: Declaration = {
  id: 'register.styles',
  kind: 'register',
  body: {
    id: 'styles',
    name: 'Styles',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'sizes', type: 'list', of: 'text' },
      { id: 'colours', type: 'list', of: 'text' },
      { id: 'season', type: 'enum', values: ['aw26', 'ss27'] },
      { id: 'state', type: 'enum', values: ['draft', 'approved'], index: true },
    ],
  } as never,
};

const SKUS: Declaration = {
  id: 'register.skus',
  kind: 'register',
  body: {
    id: 'skus',
    name: 'SKUs',
    title: 'code',
    fields: [
      { id: 'code', type: 'text', required: true },
      { id: 'style', type: 'text' },
      { id: 'size', type: 'text' },
      { id: 'colour', type: 'text' },
      { id: 'state', type: 'enum', values: ['planned', 'live'] },
    ],
  } as never,
};

const EXPAND = (over: Record<string, unknown> = {}): Declaration =>
  rule({
    rule: 'expand-size-run',
    register: 'styles',
    when: 'state is approved',
    once_per: ['entry', 'state'],
    then: [
      {
        create: {
          register: 'skus',
          each: ['sizes', 'colours'],
          bound: 60,
          fields: { code: '{{name}} {{each.0}}/{{each.1}}', style: '{{id}}', size: '{{each.0}}', colour: '{{each.1}}', state: 'planned' },
        },
      },
    ],
    ...over,
  });

async function studio(...decls: Declaration[]): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok((await k.install([STYLES, SKUS, ...decls])).ok);
  return { k, sql };
}

test('A SIZE RUN IS A DECLARATION, and eight sizes by five colours is forty rows', async () => {
  /* The gap this closes is not small: a fashion style IS a size run by a colourway matrix, and
     before `create` the only way to make forty SKUs from one style was forty writes by hand. */
  const { k, sql } = await studio(EXPAND());
  value<Entry>(
    k.create(
      'styles',
      { name: 'Halden', sizes: ['XS', 'S', 'M', 'L'], colours: ['ink', 'bone', 'moss'], state: 'approved' },
      { actor: 'p_1' },
    ),
  );

  assert.equal(k.count('skus'), 12);
  assert.equal(k.get('skus#1')?.fields.code, 'Halden XS/ink');
  assert.equal(k.get('skus#1')?.fields.size, 'XS');
  assert.equal(k.get('skus#1')?.fields.colour, 'ink');
  assert.equal(k.get('skus#1')?.fields.state, 'planned');
  assert.equal(k.get('skus#1')?.fields.style, 'styles#1');

  // Every generated row wears the rule's name and shares the triggering write's batch, so "undo
  // this expansion" is one query rather than an archaeology of timestamps.
  const events = sql.all<{ actor: string; batch: string | null }>(
    "SELECT actor, batch FROM event WHERE kind = 'create' AND actor = 'rule:expand-size-run'",
  );
  assert.equal(events.length, 12);
  assert.equal(new Set(events.map((e) => e.batch)).size, 1, 'the expansion is not one batch');
  assert.equal(
    events[0]?.batch,
    sql.one<{ id: string }>("SELECT id FROM event WHERE actor = 'p_1' AND kind = 'create'")?.id,
    'the batch is not the triggering write',
  );
  sql.close();
});

test('and re-running it makes only the combinations that are new', async () => {
  /* The key is the RULE, not the register: the target is an ordinary register with no `key:` of its
     own, and an earlier draft would have duplicated forty SKUs on the second run. */
  const { k, sql } = await studio(EXPAND({ once_per: ['entry'] }));
  value<Entry>(k.create('styles', { name: 'Halden', sizes: ['XS', 'S'], colours: ['ink'], state: 'approved' }, { actor: 'p_1' }));
  assert.equal(k.count('skus'), 2);

  // The marker is per row, so clear it the way a person re-running the rule would.
  sql.exec("DELETE FROM schedule WHERE kind = 'rule'");
  value<Entry>(k.update('styles', 'styles#1', { colours: ['ink', 'bone'] }, { actor: 'p_1' }));

  assert.equal(k.count('skus'), 4, 'a re-run duplicated what was already there');
  assert.deepEqual(
    sql.all<{ code: string }>("SELECT json_extract(fields, '$.code') AS code FROM entry WHERE register = 'skus' ORDER BY seq").map((r) => r.code),
    ['Halden XS/ink', 'Halden S/ink', 'Halden XS/bone', 'Halden S/bone'],
  );
  sql.close();
});

test('A GENERATOR WITH NO CEILING IS REFUSED AT INSTALL, and again at run time', async () => {
  /* A generator with no ceiling is how a rules engine fills a ten-gigabyte object overnight. */
  const { k, sql } = await studio();

  for (const [over, at] of [
    [{ bound: 0 }, 'bound'],
    [{ bound: 501 }, 'bound'],
    [{ each: ['sizes', 'colours', 'season'] }, 'each'],
    [{ each: ['name'] }, 'each'],
    [{ each: ['nothing'] }, 'each'],
    [{ register: 'ghosts' }, 'register'],
  ] as const) {
    const decl = EXPAND();
    const then = (decl.body as { then: { create: Record<string, unknown> }[] }).then;
    Object.assign(then[0]!.create, over);
    const out = await k.install([decl]);
    assert.equal(out.ok, false, `${JSON.stringify(over)} installed`);
    assert.equal((out as { refusal: { at?: string } }).refusal.at, at);
  }

  /* AND A `create` WITH NO `bound:` AT ALL IS `CREATE_UNBOUNDED`, which is the code `04 §5`'s table
     gives it. `42 §4` step 13 puts it on ABSENCE specifically, "before the generic missing-key
     mapping" — so `bound: 0` and `bound: 501` above stay `OUT_OF_BOUNDS`, because a bound that is
     present and unusable is a value outside a range and that is what that code says. */
  const unbounded = EXPAND();
  delete (unbounded.body as { then: { create: Record<string, unknown> }[] }).then[0]!.create.bound;
  const none = await k.install([unbounded]);
  assert.equal(none.ok, false);
  assert.equal((none as { refusal: { code: string } }).refusal.code, 'CREATE_UNBOUNDED');
  assert.match((none as { refusal: { fix: string } }).refusal.fix, /no ceiling fills the record/u);

  /* AND A `create` THAT IS NOT AN OBJECT AT ALL INSTALLED CLEANLY AND FIRED ON NOTHING FOR EVER.
     `null`, a string and a number all fell through the same early return as "there is no create
     here", so the record accepted a rule whose whole purpose was written down and could never
     happen, and said nothing on the day it accepted it or on any day after. */
  for (const said of [null, 'obligations', 7] as const) {
    const wrong = EXPAND();
    (wrong.body as { then: { create: unknown }[] }).then[0]!.create = said;
    const out = await k.install([wrong]);
    assert.equal(out.ok, false, `create: ${JSON.stringify(said)} installed and would fire on nothing`);
    assert.equal((out as { refusal: { at?: string } }).refusal.at, 'then.create');
  }

  const zero = EXPAND();
  Object.assign((zero.body as { then: { create: Record<string, unknown> }[] }).then[0]!.create, { bound: 0 });
  assert.equal(((await k.install([zero])) as { refusal: { code: string } }).refusal.code, 'OUT_OF_BOUNDS');

  /* And a bound its own declared axes can exceed is wrong today rather than at the thousandth row.

     UNDER `04 §5`'s OWN CODE AND ITS OWN SENTENCE. This asserted `OUT_OF_BOUNDS`'s wording, which
     is the write path's code for a value outside a field's range — so the two correctly-coded
     checks in `declare.ts` were shadowed by this one, and `CREATE_OVER_BOUND` was a code the
     registry listed, a gate counted as emitted, and no caller could ever see. */
  const overrun = EXPAND();
  Object.assign((overrun.body as { then: { create: Record<string, unknown> }[] }).then[0]!.create, { each: ['season'], bound: 1 });
  const out = await k.install([overrun]);
  assert.equal(out.ok, false);
  assert.equal((out as { refusal: { code: string } }).refusal.code, 'CREATE_OVER_BOUND');
  assert.match((out as { refusal: { fix: string } }).refusal.fix, /season \(2\) = 2 exceeds bound 1/u);

  // A rule that creates and does not say once_per would run the generator on every write.
  const loose = EXPAND();
  delete (loose.body as Record<string, unknown>).once_per;
  assert.equal((await k.install([loose])).ok, false);
  sql.close();
});

test('A PACK GENERATES ONLY INTO ITS OWN REGISTERS, and the code for that had no emitter anywhere', async () => {
  /* `04 §5` names three create codes. `CREATE_UNBOUNDED` and `CREATE_OVER_BOUND` were raised under
     the write path's `OUT_OF_BOUNDS`; `CREATE_FOREIGN_REGISTER` was raised by nothing at all — the
     registry listed it, `30 §6` counted it, and a pack a stranger wrote could declare a rule that
     generated rows into a register belonging to a pack the record already trusted. The install diff
     would have shown `SPAWNS` against somebody else's data and named no owner.

     OWNERSHIP IS THE COLUMN AND NOT THE BODY. A pack cannot claim a register by writing a key into
     it, which is why `Owners` is read from `declaration.pack_id` rather than out of `Known`. */
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok((await k.install([{ ...STYLES, pack: 'studio' }, { ...SKUS, pack: 'studio' }])).ok);

  const trespass = { ...EXPAND(), pack: 'somebody-else' };
  const out = await k.install([trespass]);
  assert.equal(out.ok, false, 'a rule from another pack generated into studio-owned rows');
  assert.equal((out as { refusal: { code: string } }).refusal.code, 'CREATE_FOREIGN_REGISTER');
  assert.equal((out as { refusal: { at?: string } }).refusal.at, 'register');
  assert.match((out as { refusal: { fix: string } }).refusal.fix, /declared by studio/u);

  // Its own pack is fine, which is the whole of what a pack is allowed to do.
  assert.ok((await k.install([{ ...EXPAND(), pack: 'studio' }])).ok, 'a pack cannot write into itself');

  /* AND A REGISTER NOBODY OWNS IS NOT ANOTHER PACK'S. `04 §5`'s sentence reads "only into its own
     registers", which would also refuse this — a compatibility decision with a cost, and it is in
     the backlog under its own line rather than settled quietly by whoever wrote the check. */
  const plain = openSqlite();
  const k2 = await openRecord(plain, fixedClock(NOW));
  assert.ok((await k2.install([STYLES, SKUS])).ok);
  assert.ok((await k2.install([{ ...EXPAND(), pack: 'somebody-else' }])).ok, 'an unowned register is refused');
  plain.close();
  sql.close();
});

test('and at run time the whole expansion is refused rather than truncated', async () => {
  // Half a size run is worse than none: the missing SKUs look like sizes nobody stocks.
  const { k, sql } = await studio(EXPAND({ then: [{ create: { register: 'skus', each: ['sizes', 'colours'], bound: 3, fields: { code: '{{each.0}}{{each.1}}' } } }] }));
  value<Entry>(k.create('styles', { name: 'Halden', sizes: ['XS', 'S'], colours: ['ink', 'bone'], state: 'approved' }, { actor: 'p_1' }));
  assert.equal(k.count('skus'), 0, 'it wrote a partial matrix');
  sql.close();
});

test('AND A GENERATED ROW CANNOT GENERATE, which is what makes one step one step', async () => {
  const { k, sql } = await studio(
    EXPAND({ then: [{ create: { register: 'skus', each: ['sizes'], bound: 10, fields: { code: '{{each.0}}' } } }] }),
    rule({
      rule: 'onward',
      register: 'skus',
      when: 'state is planned',
      once_per: ['entry'],
      then: [{ create: { register: 'skus', bound: 5, fields: { code: 'runaway' } } }],
    }),
  );
  value<Entry>(k.create('styles', { name: 'Halden', sizes: ['XS', 'S'], state: 'approved' }, { actor: 'p_1' }));
  assert.equal(k.count('skus'), 2, 'a generated row started a second expansion');
  sql.close();
});

/* ── and the question a rule can ask ─────────────────────────── */

test('A RULE CAN ASK RATHER THAN ACT, and the question goes through the gate', async () => {
  /* The difference between a rule that files a row and a rule that raises a question is the
     difference between automation somebody trusts and automation somebody switches off. */
  const { k, sql } = await record(
    rule({
      rule: 'unusual',
      register: 'obligations',
      when: 'state is open',
      once_per: ['entry'],
      then: [{ suggest: { question: 'Is {{what}} really ours?', options: ['Yes, keep it', 'No, delete it'] } }],
    }),
  );
  value<Entry>(k.create('obligations', { what: 'Invoice 41', state: 'open' }, { actor: 'p_1' }));

  const open = value<Record<string, unknown>[]>(k.governance('suggestion'));
  assert.equal(open.length, 1);
  assert.equal(open[0]?.opened_by, 'rule:unusual');
  assert.equal((open[0]?.body as { options: { label: string }[] }).options.length, 2);
  assert.equal(
    sql.one<{ to_v: string }>("SELECT to_v FROM event WHERE kind = 'suggest'")?.to_v,
    'Is Invoice 41 really ours?',
    'the question was not filled from the row',
  );

  // And it changed nothing, which is the whole point of asking.
  assert.equal(k.get('obligations#1')?.fields.tags, undefined);

  // Once, however many times the row is written.
  value<Entry>(k.update('obligations', 'obligations#1', { party: 'Acme' }, { actor: 'p_1' }));
  assert.equal(value<unknown[]>(k.governance('suggestion')).length, 1);
  sql.close();
});

/* ── the bulk recategorise ────────────────────────────────── */

test('A RULE FIRES ON A WRITE, so a new one has never seen the rows written before it', async () => {
  /* Without a bulk apply, turning a rule on means editing four hundred rows by hand to make it fire.
     This is the predecessor's recategorise, and it is a separate verb for that reason. */
  const { k, sql } = await record();
  for (const what of ['a', 'b', 'c'])
    value<Entry>(k.create('obligations', { what, party: 'Acme', state: 'open' }, { actor: 'p_1' }));

  assert.ok((await k.install([rule({ rule: 'chase', register: 'obligations', when: 'state is open', then: [{ set: { field: 'chase', to: 'call {{party}}' } }] })])).ok);
  assert.equal(k.get('obligations#1')?.fields.chase, undefined, 'the rows written first were not touched');

  // The dry run first, because there is no undo.
  const dry = value<{ matched: number; applied: number; sample: { would: string[] }[] }>(k.applyRule('chase', { dry: true }));
  assert.equal(dry.matched, 3);
  assert.equal(dry.applied, 0, 'a dry run wrote something');
  assert.deepEqual(dry.sample[0]?.would, ['set chase to call Acme']);
  assert.equal(k.get('obligations#1')?.fields.chase, undefined);

  const done = value<{ matched: number; applied: number; kept: number }>(k.applyRule('chase'));
  assert.equal(done.applied, 3);
  assert.equal(k.get('obligations#1')?.fields.chase, 'call Acme');
  assert.equal(k.get('obligations#3')?.fields.chase, 'call Acme');
  sql.close();
});

test('AND IT ONLY FILLS GAPS, because somebody put the value that is already there', async () => {
  /* The write path says a mechanism may not overwrite what a person set, and a bulk apply that
     ignored that would be the one way round it. */
  const { k, sql } = await record();
  value<Entry>(k.create('obligations', { what: 'a', party: 'Acme', chase: 'already said', state: 'open' }, { actor: 'p_1' }));
  value<Entry>(k.create('obligations', { what: 'b', party: 'Acme', state: 'open' }, { actor: 'p_1' }));
  assert.ok((await k.install([rule({ rule: 'chase', register: 'obligations', when: 'state is open', then: [{ set: { field: 'chase', to: 'call {{party}}' } }] })])).ok);

  const out = value<{ matched: number; applied: number; kept: number }>(k.applyRule('chase'));
  assert.equal(out.kept, 1);
  assert.equal(out.applied, 1);
  assert.equal(k.get('obligations#1')?.fields.chase, 'already said');
  assert.equal(k.get('obligations#2')?.fields.chase, 'call Acme');
  sql.close();
});

test('and it is a page, not a `while` nobody can stop', async () => {
  const { k, sql } = await record();
  k.transaction(() => {
    for (let i = 0; i < 12; i++) k.create('obligations', { what: `x${i}`, party: 'Acme', state: 'open' }, { actor: 'p_1' });
  });
  assert.ok((await k.install([rule({ rule: 'chase', register: 'obligations', when: 'state is open', then: [{ set: { field: 'chase', to: 'call' } }] })])).ok);

  const first = value<{ matched: number; applied: number; remaining: number }>(k.applyRule('chase', { limit: 5 }));
  assert.equal(first.applied, 5);
  assert.equal(first.remaining, 7);

  const second = value<{ applied: number; remaining: number }>(k.applyRule('chase', { limit: 100 }));
  assert.equal(second.applied, 7, 'the second page did not pick up where the first left off');
  assert.equal(second.remaining, 0);

  assert.equal(value<{ matched: number }>(k.applyRule('chase')).matched, 0, 'a third run had something left to do');
  assert.equal(k.applyRule('nothing').ok, false);
  sql.close();
});

test('A RULE CAN COME BACK TO A ROW, which is 07 §6’s fourth shape', async () => {
  /* IT INSTALLED, MATCHED, AND WAS DROPPED. `RuleAction` did not carry `schedule` and the dispatch
     chain had no arm for it, so a rule declaring `{ schedule: { in: 14d, note: "check again" } }`
     fired, did nothing, and did not appear in `RulesOutcome.fired` — which is the one place somebody
     would look to find out whether it had. `rule` has meanwhile been one of the ten schedule kinds
     with nothing to write one and nothing to handle one. */
  const { k, sql, clock } = await record();
  value(
    await k.install([
      {
        id: 'rule.chase',
        kind: 'rule',
        body: {
          rule: 'chase',
          register: 'obligations',
          on: 'create',
          when: 'state is open',
          once_per: ['id'],
          then: [{ schedule: { in: '14d', note: 'chase {{what}} again' } }],
        },
      } as never,
    ]),
  );

  value(k.create('obligations', { what: 'Invoice 41', state: 'open' }, { actor: 'p_1' }));

  const armed = sql.one<{ key: string; due_at: string; payload: string; state: string }>(
    "SELECT key, due_at, payload, state FROM schedule WHERE kind = 'rule' AND payload LIKE '%chase Invoice 41%'",
  );
  assert.ok(armed, 'a rule that asked to come back was dropped');
  assert.equal(armed.state, 'pending');
  assert.equal(Date.parse(armed.due_at) - clock.now(), 14 * 86_400_000, 'it comes back at the wrong time');

  /* AND WHEN IT COMES BACK IT SAYS SO, against the row it was about. */
  clock.set(clock.now() + 15 * 86_400_000);
  await k.drain();
  const note = sql.one<{ note: string; actor: string }>("SELECT note, actor FROM event WHERE kind = 'note' ORDER BY rowid DESC LIMIT 1");
  assert.equal(note?.note, 'chase Invoice 41 again');
  assert.equal(note?.actor, 'rule:chase');
  assert.equal(
    sql.one<{ state: string }>("SELECT state FROM schedule WHERE kind = 'rule' AND key LIKE 'chase:%'")?.state,
    'done',
    'a one-shot came back twice',
  );
  sql.close();
});

test('AND A SPAN THIS RECORD CANNOT READ DOES NOT INSTALL', async () => {
  /* It would be dropped at fire time — and the row it was meant to chase is exactly the row somebody
     is trusting it to chase. */
  const { k, sql } = await record();
  const out = await k.install([
    {
      id: 'rule.vague',
      kind: 'rule',
      body: {
        rule: 'vague',
        register: 'obligations',
        on: 'create',
        when: 'state is open',
        once_per: ['id'],
        then: [{ schedule: { in: '2 weeks', note: 'x' } }],
      },
    } as never,
  ]);
  assert.equal(out.ok, false, 'a span nobody can read installed');
  assert.match((out as { refusal: { fix: string } }).refusal.fix, /write 14d/);
  sql.close();
});

/**
 * A FIGURE OVER WHO MADE A LIST'S ENTRIES (`events.<list>`). Who wrote each one has always been in the history
 * and no figure read it, so Money could not say "the bank add-on filed 6 today". The source counts the entries of one
 * list made in the figure's window, once each, and its groups say who made them: a person, an agent, a door's pattern
 * under its add-on's name, a rule, a script, or the record itself.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Kernel, type MetricDecl, type WriteContext } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 23, 12);
const DAY = 86_400_000;

const pattern = (ingest: string): Declaration => ({
  id: `ingest.${ingest}`,
  kind: 'ingest',
  body: { ingest, channel: 'poll', url: 'https://api.example.test/v1/moves', every: '1h', grant: 'example read', extract: { what: { after: 'paid ' } }, writes: { register: 'transactions' } } as never,
});

const SEED: Declaration[] = [
  { id: 'register.transactions', kind: 'register', body: { id: 'transactions', name: 'Ledger', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never },
  { id: 'register.notes', kind: 'register', body: { id: 'notes', name: 'Notes', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never },
  pattern('bank-card-used'),
  pattern('bank-ipn-in'),
];

const figure = (more: Record<string, unknown> = {}) =>
  ({
    metric: 'filed-30d',
    name: 'Filed, 30 days',
    source: 'events.transactions',
    value: { count: 'made' },
    format: 'int',
    target: { gte: 0 },
    window: '30d',
    compare: 'none',
    ...more,
  }) as unknown as MetricDecl;

const run = (client_id: string): WriteContext => ({
  actor: 'agent:claude',
  principal: { kind: 'token', token: 't_1' },
  session: { client_id, agent: 'claude', client: 'claude-code', repo: 'kiln' },
});

type Sqlite = ReturnType<typeof openSqlite>;

/** A record with a ledger, two patterns of one bank add-on, and a person with a name. */
const open = async (): Promise<{ sql: Sqlite; k: Kernel; add: (what: string, by: WriteContext | string, list?: string) => string }> => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const installed = await k.install(SEED);
  assert.ok(installed.ok, JSON.stringify(installed));
  sql.exec("INSERT INTO person (id, email, name) VALUES ('p_1', 'mara@example.test', 'Mara')");
  sql.exec("INSERT INTO pack (id, version, source, manifest, installed_at, checksum) VALUES ('bank-hsbc-eg', '1.0.0', 'local', ?, '2026-09-01T00:00:00.000Z', 'x')", JSON.stringify({ name: 'HSBC Egypt' }));
  sql.exec("UPDATE declaration SET pack_id = 'bank-hsbc-eg' WHERE kind = 'ingest'");
  const add = (what: string, by: WriteContext | string, list = 'transactions'): string => {
    const made = k.create(list, { what }, typeof by === 'string' ? { actor: by } : by);
    assert.ok(made.ok, `${what}: ${JSON.stringify(made)}`);
    return (made as { value: { id: string } }).value.id;
  };
  return { sql, k, add };
};

const read = (k: Kernel, more: Record<string, unknown> = {}) => {
  const got = k.metric(figure(more));
  assert.ok(got.ok, JSON.stringify(got));
  return got.value;
};

/** The parts as a test reads them: what a person is told, and how many. */
const said = (groups: readonly { key: string; label?: string; value: number | null }[] | undefined) =>
  (groups ?? []).map((g) => [g.key, g.label, g.value]);

test('THE ENTRIES MADE IN THE WINDOW ARE COUNTED, AND EACH PART SAYS WHO MADE THEM', async () => {
  const { sql, k, add } = await open();
  add('Typed by hand', 'p_1');
  add('Card at the grocer', 'ingest:bank-card-used');
  add('Card at the chemist', 'ingest:bank-card-used');
  add('Nadia paid on InstaPay', 'ingest:bank-ipn-in');
  add('Filed from an arrival', run('c1'));
  add('Filed from another', run('c2'));
  add('Tidied by a script', 'script:tidy-ledger@v2');
  add('Month closed', 'system');
  add('A note, which is another list', 'p_1', 'notes');
  assert.ok(k.backdate(NOW - 40 * DAY, () => k.create('transactions', { what: 'Before the window' }, { actor: 'p_1' })).ok);

  const got = read(k);
  assert.equal(got.value, 8);
  assert.equal(got.rows, 8);
  assert.equal(got.unit, null);
  assert.deepEqual(said(got.groups), [
    ['door:bank-hsbc-eg', 'HSBC Egypt', 3],
    ['agent:claude', 'Claude', 2],
    ['person:p_1', 'Mara', 1],
    ['record', 'BrainDog', 1],
    ['script:tidy-ledger', 'Tidy ledger', 1],
  ]);
  for (const g of got.groups ?? []) assert.deepEqual([g.rows, g.state], [g.value, 'full']);
  assert.doesNotMatch(JSON.stringify(said(got.groups).map((g) => g[1])), /p_1|S\d|ingest:|@v/u, 'a part is called by a name, never by a handle');
  assert.equal(got.met, true);
  sql.close();
});

test('A RULE THAT MAKES AN ENTRY IS NAMED AS A RULE, and the record own rules are the record', async () => {
  const { sql, k, add } = await open();
  add('Rent, from the repeating line', 'rule:repeat_rent');
  add('Carried by an update', 'rule:update');

  assert.deepEqual(said(read(k).groups), [
    ['record', 'BrainDog', 1],
    ['rule:repeat_rent', 'Repeat rent', 1],
  ]);
  sql.close();
});

test('AN ENTRY COUNTS ONCE, under whoever made it, whatever was done to it after', async () => {
  const { sql, k, add } = await open();
  add('Card at the grocer', 'ingest:bank-card-used');
  assert.ok(k.update('transactions', 'transactions#1', { what: 'Groceries' }, { actor: 'p_1' }).ok);
  assert.ok(k.update('transactions', 'transactions#1', { what: 'Groceries, Friday' }, run('c1')).ok);
  add('Deleted and brought back', 'p_1');
  assert.ok(k.update('transactions', 'transactions#2', { deleted_at: true } as never, { actor: 'p_1' }).ok);
  assert.ok(k.update('transactions', 'transactions#2', { deleted_at: null } as never, { actor: 'system' }).ok);
  add('Deleted for good', 'p_1');
  assert.ok(k.update('transactions', 'transactions#3', { deleted_at: true } as never, { actor: 'p_1' }).ok);

  const got = read(k);
  assert.equal(got.value, 2, 'two entries stand, and the edits and the restore made none');
  assert.deepEqual(said(got.groups), [
    ['door:bank-hsbc-eg', 'HSBC Egypt', 1],
    ['person:p_1', 'Mara', 1],
  ]);
  sql.close();
});

test('A WINDOW IS WHOLE DAYS ENDING TODAY: one day is today, and yesterday is not in it', async () => {
  const { sql, k, add } = await open();
  add('Card today', 'ingest:bank-card-used');
  assert.ok(k.backdate(NOW - 13 * 3_600_000, () => k.create('transactions', { what: 'Card last night' }, { actor: 'ingest:bank-card-used' })).ok);

  const today = read(k, { metric: 'filed-today', window: '1d' });
  assert.equal(today.value, 1);
  assert.equal(today.why, 'Ledger entries made today');
  const week = read(k, { window: '7d' });
  assert.equal(week.value, 2);
  assert.equal(week.why, 'Ledger entries made in the last 7 days');
  sql.close();
});

test('A WHERE NARROWS BY WHO: everything but a person is what was filed for you', async () => {
  const { sql, k, add } = await open();
  add('Typed by hand', 'p_1');
  add('Card at the grocer', 'ingest:bank-card-used');
  add('Filed from an arrival', run('c1'));
  add('Month closed', 'system');

  const sentence = read(k, { where: 'by is not person' });
  assert.equal(sentence.value, 3);
  assert.equal(sentence.held, 4, 'held is every entry made in the window, whoever made it');
  assert.deepEqual(said(sentence.groups).map((g) => g[0]), ['agent:claude', 'door:bank-hsbc-eg', 'record']);
  assert.equal(read(k, { where: { field: 'by', not: 'person' } }).value, 3, 'the structured form reads as the sentence does');
  assert.equal(read(k, { where: { field: 'by', in: ['door', 'agent'] } }).value, 2);
  assert.equal(read(k, { where: 'by is person' }).value, 1);

  const other = k.metric(figure({ where: 'what is Rent' }));
  assert.equal(other.ok, false, 'who made it is the one thing this source narrows by');
  assert.equal((other as { refusal: { code: string; at?: string } }).refusal.code, 'FIELD_UNKNOWN');
  sql.close();
});

test('NOTHING MADE IS NOUGHT WITH NO PARTS, and a target is read against it', async () => {
  const { sql, k } = await open();
  const got = read(k, { target: { gte: 1 } });
  assert.deepEqual([got.value, got.rows, got.held, got.groups, got.met], [0, 0, 0, [], false]);
  sql.close();
});

test('AN UNKNOWN LIST IS REFUSED BY NAME, and so is any reading of the source but the count of what was made', async () => {
  const { sql, k } = await open();
  const refused = (more: Record<string, unknown>) => {
    const got = k.metric(figure(more));
    assert.equal(got.ok, false, JSON.stringify(got));
    return (got as { refusal: { code: string; fix: string; at?: string } }).refusal;
  };

  const unknown = refused({ source: 'events.ledgerz' });
  assert.deepEqual([unknown.code, unknown.at], ['REGISTER_UNKNOWN', 'source']);
  assert.match(unknown.fix, /there is no list called ledgerz/u);

  const bare = refused({ source: 'events.' });
  assert.deepEqual([bare.code, bare.at], ['SOURCE_UNKNOWN', 'source']);
  assert.match(bare.fix, /events\.<list>/u);

  const summed = refused({ value: { sum: 'amount' } });
  assert.deepEqual([summed.code, summed.at], ['SOURCE_UNKNOWN', 'source']);
  assert.match(summed.fix, /\{ count: made \}/u);

  const bucketed = refused({ bucket: 'day' });
  assert.deepEqual([bucketed.code, bucketed.at], ['DECLARATION_INVALID', 'bucket']);
  assert.match(bucketed.fix, /leave bucket out/u);
  const grouped = refused({ group_by: 'what' });
  assert.deepEqual([grouped.code, grouped.at], ['DECLARATION_INVALID', 'group_by']);
  assert.match(grouped.fix, /leave group_by out, or write by/u);

  const hidden = k.metric(figure(), { reads: (list) => list !== 'transactions' });
  assert.equal(hidden.ok, false, 'a list the reader may not read is a list there is none of');
  assert.equal((hidden as { refusal: { code: string } }).refusal.code, 'REGISTER_UNKNOWN');

  for (const r of [unknown, bare, summed]) assert.doesNotMatch(r.fix, /—/u);
  sql.close();
});

test('A WORD NO READER HOLDS IS TOLD THAT events.<list> IS READ, and a figure over a list reads as it did', async () => {
  const { sql, k, add } = await open();
  add('Typed by hand', 'p_1');
  const wrong = k.metric(figure({ source: 'event.transactions' }));
  assert.equal(wrong.ok, false);
  assert.match((wrong as { refusal: { fix: string } }).refusal.fix, /events\.<list>/u);

  const counted = k.metric(figure({ source: 'register.transactions', value: { count: 'id' } }));
  assert.ok(counted.ok, JSON.stringify(counted));
  assert.deepEqual([counted.value.value, counted.value.groups], [1, undefined]);
  sql.close();
});

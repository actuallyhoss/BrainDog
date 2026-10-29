/**
 * The rulings of `docs/04-PACKS.md` §9 that the kernel holds, one test each, every name carrying its ruling's number.
 *
 * THE PAGE AND THIS FILE ARE KEPT TOGETHER BY `tools/gates/rulings.mjs`: a ruling on the page names the file that holds
 * it, and a test here names a ruling on the page. A ruling a later unit builds is a real test marked `todo` with that
 * unit, so the page cannot say "built" of it and the suite does not go red while it waits.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf, type Result } from '@braindog/ports';

import { readConfig, CONFIG_TYPES } from '../src/declare.ts';
import { projectedText } from '../src/fts.ts';
import { openRecord, validateDeclaration, type Declaration, type Entry, type EraseReport, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 12);
const HOUR = 3_600_000;
const BY = { actor: 'p_1' };

const value = <T>(r: Result<T>): T => {
  assert.ok(r.ok, fixOf(r));
  return r.value;
};
const codeOf = (r: Result<unknown>): string => (r.ok ? 'accepted' : 'refusal' in r ? r.refusal.code : 'conflict');

async function record(...batch: Declaration[]): Promise<{ k: Kernel; sql: NodeSql; clock: ReturnType<typeof fixedClock> }> {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  value(await k.install(batch));
  for (const pack of new Set(batch.map((d) => d.pack).filter((p): p is string => typeof p === 'string')))
    k.rememberPack({
      id: pack,
      version: '1.0.0',
      source: 'local',
      ref: null,
      manifest: JSON.stringify({ pack, version: '1.0.0', requires: { format: 1, primitives: 1, packs: {} } }),
      checksum: `sum-${pack}`,
    });
  return { k, sql, clock };
}

/* ── 294 · what configuring covers ───────────────────────────────────────── */

test('ruling 294: a setting is one of the nine types in code, a secret is a key\'s label, and never a reference or a file', () => {
  assert.deepEqual([...CONFIG_TYPES], ['text', 'enum', 'bool', 'money', 'day', 'duration', 'number', 'list', 'secret']);
  for (const type of CONFIG_TYPES) {
    const said = type === 'enum' ? { type, values: ['a', 'b'] } : { type };
    assert.ok(readConfig({ pick: said }).ok, `${type} was refused as a setting`);
  }
  for (const type of ['ref', 'file']) {
    const out = readConfig({ pick: { type } });
    assert.equal(codeOf(out), 'CONFIG_TYPE_UNSUPPORTED', `${type} was taken as a setting`);
    assert.match(fixOf(out), /A setting is text, enum, bool, money, day, duration, number, list or secret\./);
  }
});

/* ── 296 · Projects goes off only when nothing points at it ──────────────── */

const PROJECTS: Declaration = {
  id: 'register.things',
  kind: 'register',
  pack: 'portfolio',
  body: { id: 'things', name: 'Projects', title: 'name', scopes: { repos: 'repos' }, fields: [{ id: 'name', type: 'text', required: true }, { id: 'repos', type: 'list', of: 'text' }] },
} as never;
const TASKS: Declaration = {
  id: 'register.tasks',
  kind: 'register',
  body: { id: 'tasks', name: 'Tasks', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'thing', type: 'ref', to: 'things', index: true, scope: {} }] },
} as never;

test('ruling 296: Projects goes off only when no live field\'s scope points at it', async () => {
  const { k, sql } = await record(PROJECTS, TASKS);
  const refused = k.disablePack('portfolio', BY);
  assert.equal(codeOf(refused), 'SCOPES_IN_USE', 'Projects went off while Tasks still pointed at it');
  assert.ok(k.registers().has('things'));
  value(k.retire(['register.tasks']));
  assert.equal(value(k.disablePack('portfolio', BY)).changed, true, 'with nothing pointing at it, Projects still could not go off');
  sql.close();
});

/* ── 297 · a switched-off add-on's scheduled work stops at once ─────────── */

const OBLIGATIONS: Declaration = {
  id: 'register.obligations',
  kind: 'register',
  pack: 'chaser',
  body: { id: 'obligations', name: 'Obligations', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'note', type: 'text' }] },
} as never;
const CHASED: Declaration = {
  id: 'rule.chased',
  kind: 'rule',
  pack: 'chaser',
  body: {
    rule: 'chased',
    on: { written: { register: 'obligations', op: ['create'] } },
    once_per: ['entry'],
    steps: [{ wait: '1h' }, { set: { field: 'note', to: 'chased' } }, { notify: { say: 'Chased {{what}}' } }],
  },
} as never;

test('ruling 297: an add-on switched off stops its automations at once, and nothing is armed again until it is on', async () => {
  const { k, sql, clock } = await record(OBLIGATIONS, CHASED);
  const rent = value<Entry>(k.create('obligations', { what: 'Rent' }, BY));
  await k.drain();
  const run = () => sql.one<{ state: string; say: string | null }>("SELECT state, say FROM automation_run WHERE rule = 'chased'");
  assert.equal(run()?.state, 'waiting');

  value(k.disablePack('chaser', BY));
  assert.equal(run()?.state, 'cancelled', 'the run was still waiting under an add-on that was off');
  assert.match(run()?.say ?? '', /chaser was turned off/);
  const pending = () => sql.one("SELECT 1 AS x FROM schedule WHERE kind = 'rule' AND state = 'pending'");
  assert.equal(pending(), undefined, 'a wake stayed armed for an add-on that was off');

  /* ON AGAIN, THE CANCELLED RUN STAYS CANCELLED: nothing is refunded and nothing is re-armed for it. */
  value(await k.enablePack('chaser', BY));
  clock.advance(2 * HOUR);
  await k.drain();
  assert.equal(run()?.state, 'cancelled');
  assert.equal(k.get(rent.id)?.fields.note, undefined, 'the cancelled run wrote once the add-on came back');
  sql.close();
});

/* ── 304 · an add-on's own block kind ───────────────────────────────────── */

test('ruling 304: an add-on\'s block kind made of the six primitives is allowed, and code is refused', () => {
  const kind = (over: Record<string, unknown>): Declaration =>
    ({ id: 'block.tally', kind: 'block', pack: 'tally', body: { block: 'tally', title: 'Tally', primitive: 'panel', cells: 3, tone: true, minSpan: 4, purpose: 'figure', ...over } }) as never;
  for (const primitive of ['panel', 'grid', 'rows', 'proportional', 'inline', 'list'])
    assert.equal(validateDeclaration(kind({ primitive })), null, `a kind on ${primitive} was refused`);
  for (const [key, said] of [['code', 'return rows.map(draw)'], ['script', 'tally.js'], ['render', '<b>{{n}}</b>']] as const)
    assert.equal(validateDeclaration(kind({ [key]: said }))?.code, 'DECLARATION_INVALID', `a kind carrying ${key}: installed`);
  assert.equal(validateDeclaration(kind({ primitive: 'media' }))?.code, 'DECLARATION_INVALID', 'a kind on code the renderer holds installed');
});

/* ── 436 · a deleted thing's name ───────────────────────────────────────── */

const KILNS: Declaration = {
  id: 'register.kilns',
  kind: 'register',
  body: { id: 'kilns', name: 'Kilns', title: 'name', fields: [{ id: 'name', type: 'text', required: true, unique: true, search: true }] },
} as never;

test('ruling 436: a new thing may take a deleted thing\'s name, and it gets a new id', async () => {
  const { k, sql } = await record(KILNS);
  const first = value<Entry>(k.create('kilns', { name: 'Anagama' }, BY));
  assert.equal(codeOf(k.create('kilns', { name: 'Anagama' }, BY)), 'ALREADY_KNOWN', 'two live things shared a name');
  value(k.update('kilns', first.id, { deleted_at: true } as never, BY));

  const second = value<Entry>(k.create('kilns', { name: 'Anagama' }, BY));
  assert.notEqual(second.id, first.id, 'the new thing took the deleted one\'s id');
  assert.notEqual(second.seq, first.seq, 'the new thing took the deleted one\'s number');
  const kept = sql.one<{ fields: string; deleted_at: string | null }>('SELECT fields, deleted_at FROM entry WHERE id = ?', first.id);
  assert.ok(kept?.deleted_at, 'the deleted thing came back to life');
  assert.equal((JSON.parse(kept.fields) as { name: string }).name, 'Anagama', 'the deleted thing lost its own name');
  sql.close();
});

/* ── 437 · erasing a person ─────────────────────────────────────────────── */

const CONTACTS: Declaration = {
  id: 'register.contacts',
  kind: 'register',
  body: { id: 'contacts', name: 'Contacts', title: 'name', fields: [{ id: 'name', type: 'text', required: true, search: true }, { id: 'note', type: 'text' }] },
} as never;

/* ERASE.TS TAKES EVERY ROW THAT NAMES THEM OUT OF EVERY READ TODAY, so a payment whose note named her left the ledger and
   its balance with it. The change is one line of `erase.ts`, blocked to its owner; until it lands this test waits. */
test('ruling 437: erasing a person removes the values that name them and keeps the rows', async () => {
  const { k, sql } = await record(CONTACTS);
  const mara = value<Entry>(k.create('contacts', { name: 'Mara Quill', note: 'met at the fair' }, BY));
  const other = value<Entry>(k.create('contacts', { name: 'Ade Okafor', note: 'introduced by Mara Quill' }, BY));
  const before = k.count('contacts');
  value<EraseReport>(await k.erase({ subjects: ['Mara Quill'], basis: 'Article 17 request received 2026-10-09' }, 'p_1'));

  /* HER OWN ROW, WHOSE TITLE WAS HER NAME, leaves every read; the row that only mentioned her stays live. */
  assert.equal(k.count('contacts'), before - 1, 'a row that only mentioned her went with her');
  assert.equal((JSON.parse(sql.one<{ fields: string }>('SELECT fields FROM entry WHERE id = ?', mara.id)?.fields ?? '{}') as { name?: string }).name, '--erased--');
  assert.equal(k.get(other.id)?.fields.name, 'Ade Okafor', 'a value that does not name her was erased');
  assert.equal(k.get(other.id)?.fields.note, '--erased--', 'a value that names her stayed');
  sql.close();
});

/* ── 441 · what the search index holds ──────────────────────────────────── */

test('ruling 441: a title made only of money or a date is left out of the search index', async () => {
  const fields = (type: string) => [
    { id: 'at', type },
    { id: 'memo', type: 'text', search: true },
  ];
  assert.equal(projectedText(fields('money'), { at: { amount: 1200, currency: 'EGP' }, memo: 'Kiln rent' }, 'at'), 'Kiln rent');
  assert.equal(projectedText(fields('day'), { at: '2026-10-09', memo: 'Kiln rent' }, 'at'), 'Kiln rent');
  assert.equal(projectedText(fields('instant'), { at: '2026-10-09T12:00:00Z', memo: '' }, 'at'), '');
  /* A TEXT TITLE IS STILL ALWAYS IN, search: true or not, so a hit stays one a person can reach. */
  assert.equal(projectedText([{ id: 'name', type: 'text' }], { name: 'Kiln rent' }, 'name'), 'Kiln rent');

  const PAID: Declaration = {
    id: 'register.paid',
    kind: 'register',
    body: { id: 'paid', name: 'Paid', title: 'on', fields: [{ id: 'on', type: 'day', required: true }, { id: 'memo', type: 'text', search: true }] },
  } as never;
  const { k, sql } = await record(PAID);
  value(k.create('paid', { on: '2026-10-09', memo: 'Kiln rent' }, BY));
  assert.equal(k.search('2026').length, 0, 'a date title was found by its digits');
  assert.equal(k.search('Kiln').length, 1, 'the row was not found by its own words');
  sql.close();
});

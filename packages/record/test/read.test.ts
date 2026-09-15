/**
 * The three reads a first screen is drawn from: what changed since you last read, the whole log a page at a time, and
 * `boot`, which carries both of the first screen's lists and the counts on the rail.
 *
 * Every test here is about a caller seeing LESS. A log is the one read that names every register a record has, so a
 * log that forgot to ask what the caller may read would undo every filter `list` and `boot` already run.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type Boot, type CallContext, type HistoryPage, type WhatsNew } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 5, 12);

const OBLIGATIONS = {
  id: 'register.obligations',
  kind: 'register' as const,
  body: {
    id: 'obligations',
    name: 'Obligations',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'state', type: 'enum', values: ['open', 'paid'] },
    ],
  } as never,
};

const DIARY = {
  id: 'register.diary',
  kind: 'register' as const,
  body: { id: 'diary', name: 'Diary', title: 'body', fields: [{ id: 'body', type: 'text', required: true }] } as never,
};

async function record() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  assert.ok((await api.kernel.install([OBLIGATIONS, DIARY])).ok);
  assert.ok(
    api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok,
  );
  return { api, sql, clock };
}

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
/* A TOKEN HELD TO ONE PROJECT, which is how the host builds one: a record-wide level, a ceiling of named registers. */
const project: CallContext = { principal: { kind: 'token', id: 't_1', scope: 'read', person: 'p_1', level: 'owner' }, registers: ['obligations'] };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

test('WHAT IS NEW STARTS AT THE READ MARK, newest first, and `upTo` is what marks it all read', async () => {
  const { api, sql, clock } = await record();
  value(await api.create({ register: 'obligations', fields: { what: 'Seen already' } }, owner));
  value(await api.markRead(undefined, owner));
  clock.advance(60_000);
  value(await api.create({ register: 'obligations', fields: { what: 'Arrived later' } }, owner));
  clock.advance(60_000);
  value(await api.create({ register: 'obligations', fields: { what: 'Arrived last' } }, owner));

  const news = value<WhatsNew>(await api.whatsNew(undefined, owner));
  assert.deepEqual(
    news.events.map((e) => e.title),
    ['Arrived last', 'Arrived later'],
  );
  assert.equal(news.sinceCapped, false);
  assert.equal(news.upTo, news.events[0]?.rowid);
  assert.equal(news.events[0]?.register, 'obligations');
  assert.equal(news.events[0]?.seq, 3);

  value(await api.markRead({ upTo: news.upTo! }, owner));
  assert.deepEqual(value<WhatsNew>(await api.whatsNew(undefined, owner)).events, [], 'marking it read left it new');
  sql.close();
});

test('WHAT IS NEW STOPS AT SIXTY, says so, and a cursor reads from where it is told', async () => {
  const { api, sql } = await record();
  for (let i = 1; i <= 70; i += 1) value(await api.create({ register: 'obligations', fields: { what: `Row ${i}` } }, owner));

  const news = value<WhatsNew>(await api.whatsNew(undefined, owner));
  assert.equal(news.events.length, 60);
  assert.equal(news.sinceCapped, true);
  assert.equal(news.events[0]?.title, 'Row 70', 'the cap kept the oldest sixty, which is the wrong sixty');

  const newest = news.upTo!;
  const tail = value<WhatsNew>(await api.whatsNew({ cursor: newest - 9 }, owner));
  assert.equal(tail.events.length, 10);
  assert.equal(tail.sinceCapped, false);

  assert.equal((await api.whatsNew({ cursor: 0 }, owner)).ok, false, 'a cursor below the first event was taken');
  sql.close();
});

test('A TOKEN HELD TO ONE PROJECT SEES ITS LINES AND NO OTHER', async () => {
  const { api, sql } = await record();
  value(await api.create({ register: 'obligations', fields: { what: 'Invoice 41' } }, owner));
  value(await api.create({ register: 'diary', fields: { body: 'Payroll is late this month' } }, owner));
  /* A NIGHTLY BACKUP IS ABOUT THE RECORD AS A WHOLE, and it is the line a project token must not get. Written the way the
     nightly walk writes it, because no method a test can call writes a line with no target. */
  sql.exec(
    "INSERT INTO event (id, ts, actor, kind, target, target_kind, note) VALUES ('01JZ8QK3F7R2M9V4XN6TCB5HAE', ?, 'system', 'export', NULL, NULL, 'Nightly backup')",
    new Date(NOW).toISOString(),
  );
  value(await api.invite({ person: 'p_2', name: 'Bo', level: 'read' }, owner));
  const asked = value<{ id: string }>(
    await api.propose({ question: 'File the diary entry?', body_kind: 'rowset', body: { register: 'diary', rows: [{ body: 'x' }] } }, owner),
  );
  const ours = value<{ id: string }>(
    await api.propose({ question: 'File Invoice 42?', body_kind: 'rowset', body: { register: 'obligations', rows: [{ what: 'Invoice 42' }] } }, owner),
  );

  const all = value<HistoryPage>(await api.recentHistory({ limit: 200 }, owner)).events;
  const seen = value<HistoryPage>(await api.recentHistory({ limit: 200 }, project)).events;
  const news = value<WhatsNew>(await api.whatsNew(undefined, project)).events;
  assert.deepEqual(news, seen, 'the two reads disagree about what one caller may see');

  assert.ok(all.some((e) => e.register === 'diary'), 'the owner lost a line, so the test below proves nothing');
  assert.ok(seen.some((e) => e.title === 'Invoice 41'));
  assert.ok(!seen.some((e) => e.register === 'diary'), 'a row event outside the ceiling');
  assert.ok(!seen.some((e) => e.target === 'register.diary'), 'the declaration of a register outside the ceiling');
  assert.ok(all.some((e) => e.kind === 'export'), 'the owner lost the backup line');
  assert.ok(!seen.some((e) => e.kind === 'export'), 'a line about the whole record');
  assert.ok(!seen.some((e) => e.kind.startsWith('access.')), 'a line about who has access');
  assert.ok(seen.some((e) => e.title === 'File Invoice 42?'), `a question on its own register, ${ours.id}`);
  assert.ok(!seen.some((e) => e.title === 'File the diary entry?'), `a question about rows it may not read, ${asked.id}`);
  assert.ok(!JSON.stringify(seen).includes('Payroll'));
  sql.close();
});

test('THE LOG PAGES NEWEST FIRST, with no line twice and a null cursor only at the bottom', async () => {
  const { api, sql } = await record();
  for (let i = 1; i <= 8; i += 1) value(await api.create({ register: 'obligations', fields: { what: `Row ${i}` } }, owner));
  const whole = value<HistoryPage>(await api.recentHistory({ limit: 200 }, owner));
  assert.equal(whole.cursor, null);

  const pages: HistoryPage[] = [];
  let cursor: number | null = null;
  do {
    const page: HistoryPage = value<HistoryPage>(await api.recentHistory({ limit: 3, ...(cursor === null ? {} : { cursor }) }, owner));
    assert.ok(page.events.length <= 3);
    pages.push(page);
    cursor = page.cursor;
  } while (cursor !== null && pages.length < 50);

  const joined = pages.flatMap((p) => p.events.map((e) => e.rowid));
  assert.deepEqual(joined, whole.events.map((e) => e.rowid), 'the pages do not add up to the log');
  assert.equal(new Set(joined).size, joined.length);
  assert.ok(joined.every((r, i) => i === 0 || r < joined[i - 1]!), 'not newest first');

  assert.equal((await api.recentHistory({ limit: 1.5 }, owner)).ok, false);
  assert.equal(value<HistoryPage>(await api.recentHistory({ limit: 9_999 }, owner)).events.length, whole.events.length);
  sql.close();
});

test('SOMEBODY WHO MAY ONLY FILE ROWS DOES NOT READ THEM BACK THROUGH THE LOG', async () => {
  const { api, sql } = await record();
  value(await api.invite({ person: 'p_3', registers: { obligations: 'read', diary: 'append' } }, owner));
  value(await api.create({ register: 'diary', fields: { body: 'Kept from a filer' } }, owner));
  value(await api.create({ register: 'obligations', fields: { what: 'Invoice 41' } }, owner));
  const held = api.kernel.access('p_3')!;
  const filer: CallContext = { principal: { kind: 'person', id: 'p_3', level: held.level }, registers: held.registers ?? '*', levels: held.levels };

  const seen = value<HistoryPage>(await api.recentHistory(undefined, filer)).events;
  assert.ok(seen.some((e) => e.title === 'Invoice 41'));
  assert.ok(!seen.some((e) => e.register === 'diary'));
  sql.close();
});

test('BOOT CARRIES THE SHELL: the record, who is asking, the rail, the counts and what is new', async () => {
  const { api, sql } = await record();
  value(await api.invite({ person: 'p_2', name: 'Bo', level: 'read' }, owner));
  value(await api.create({ register: 'obligations', fields: { what: 'Invoice 41' } }, owner));
  value(await api.propose({ question: 'File Invoice 42?', body_kind: 'rowset', body: { register: 'obligations', rows: [{ what: 'Invoice 42' }] } }, owner));

  const bo: CallContext = { principal: { kind: 'person', id: 'p_2', level: 'read' } };
  const boot = value<Boot>(await api.boot(bo));
  assert.deepEqual(boot.record, { slug: 'the-studio', name: 'The Studio', locale: 'en' });
  assert.deepEqual(boot.me, { kind: 'person', person: 'p_2', name: 'Bo', level: 'read' });
  assert.equal(boot.counts.decide, 1);
  assert.equal(boot.counts.inbox, null, 'a reader was told how much waits in the inbox');
  assert.equal(value<Boot>(await api.boot(owner)).counts.inbox, 0);
  assert.deepEqual(boot.whatsNew, value<WhatsNew>(await api.whatsNew(undefined, bo)), 'boot and whatsNew disagree');
  sql.close();
});

test('A SCOPED BOOT NAMES NOTHING OUTSIDE ITS SCOPE, in any of its parts', async () => {
  const { api, sql } = await record();
  value(await api.create({ register: 'obligations', fields: { what: 'Invoice 41' } }, owner));
  value(await api.create({ register: 'diary', fields: { body: 'Payroll is late this month' } }, owner));
  value(await api.propose({ question: 'Pay the payroll?', body_kind: 'rowset', body: { register: 'diary', rows: [{ body: 'x' }] } }, owner));

  const said = JSON.stringify(value<Boot>(await api.boot(project)));
  assert.ok(said.includes('Invoice 41'), 'the scoped boot lost its own lines, so the rest proves nothing');
  for (const word of ['diary', 'Diary', 'Payroll', 'payroll']) assert.ok(!said.includes(word), `${word} left through boot`);
  assert.equal(value<Boot>(await api.boot(project)).counts.decide, 0);
  sql.close();
});

test('A CALLER WHO MAY READ NOTHING IS REFUSED ALL THREE', async () => {
  const { api, sql } = await record();
  const nobody: CallContext = { principal: { kind: 'person', id: 'p_9', level: null } };
  for (const r of [await api.whatsNew(undefined, nobody), await api.recentHistory(undefined, nobody), await api.boot(nobody)]) {
    assert.equal(r.ok, false, 'a caller with no level read the log');
  }
  sql.close();
});

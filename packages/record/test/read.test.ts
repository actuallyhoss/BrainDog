/**
 * The three reads a first screen is drawn from: what changed since you last read, the whole log a page at a time, and
 * `boot`, which carries both of the first screen's lists and the counts on the rail.
 *
 * Every test here is about a caller seeing LESS. A log is the one read that names every register a record has, so a
 * log that forgot to ask what the caller may read would undo every filter `list` and `boot` already run.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type Boot, type CallContext, type Cursor, type HistoryPage, type InboxPage, type WhatsNew } from '../src/index.ts';
import type { ArrivalSettled, Backlinks } from '@braindog/kernel';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { bootFilled, type Boot as ClientBoot } from '../../client/src/index.ts';

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

  /* A NUMBER, BECAUSE THE OWNER READS THE WHOLE RECORD: a caller held to named lists is handed `e.<id>` instead. */
  const newest = news.upTo as number;
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
  let cursor: Cursor | null = null;
  do {
    const page: HistoryPage = value<HistoryPage>(await api.recentHistory({ limit: 3, ...(cursor === null ? {} : { cursor }) }, owner));
    assert.ok(page.events.length <= 3);
    pages.push(page);
    cursor = page.cursor;
  } while (cursor !== null && pages.length < 50);

  const joined = pages.flatMap((p) => p.events.map((e) => e.rowid));
  assert.deepEqual(joined, whole.events.map((e) => e.rowid), 'the pages do not add up to the log');
  assert.equal(new Set(joined).size, joined.length);
  assert.ok(joined.every((r, i) => i === 0 || r! < joined[i - 1]!), 'not newest first');

  assert.equal((await api.recentHistory({ limit: 1.5 }, owner)).ok, false);
  assert.equal(value<HistoryPage>(await api.recentHistory({ limit: 9_999 }, owner)).events.length, whole.events.length);
  sql.close();
});

test("A COLLEAGUE SCOPED TO ONE LIST HAS A READ MARK, and the owner's People screen stops calling them a stranger", async () => {
  /**
   * `markRead` MOVED THE `'*'` ROW AND A SCOPED MEMBER HAS NONE. Somebody invited to one list holds
   * member rows for that list alone, so the mark landed nowhere and was read back as nothing: the
   * People screen told the owner that colleague had never opened the record however much they had
   * read, and `unreadFrom` answered them the first event the record ever held. The column is per
   * person and per register; the mark is about the person, so it moves on all of their rows.
   */
  const { api, sql } = await record();
  value(await api.invite({ person: 'p_9', name: 'Wren', registers: { obligations: 'read' } }, owner));
  value(await api.create({ register: 'obligations', fields: { what: 'Invoice 41' } }, owner));
  const held = api.kernel.access('p_9')!;
  const reader: CallContext = { principal: { kind: 'person', id: 'p_9', level: held.level }, registers: held.registers ?? '*', levels: held.levels };

  const before = api.kernel.members().find((m) => m.person_id === 'p_9');
  assert.equal(before?.seen_at ?? null, null, 'a colleague who has not read has no mark');

  const marked = value<{ seen_at: string | null }>(await api.markRead(undefined, reader));
  assert.ok(marked.seen_at, 'the mark landed nowhere for a scoped member');
  assert.ok(
    api.kernel.members().some((m) => m.person_id === 'p_9' && m.seen_at === marked.seen_at),
    'the People screen reads this column, and it is what said they had never opened the record',
  );
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
  /* NO HOME CURRENCY IS CHOSEN ON THIS RECORD, and the shell is told so rather than handed a guess. */
  assert.deepEqual(boot.record, { slug: 'the-studio', name: 'The Studio', locale: 'en', currency: null, money: [] });
  const { levels, ...me } = boot.me;
  assert.deepEqual(me, { kind: 'person', person: 'p_2', name: 'Bo', level: 'read', prefs: {} });
  /* AND THE LEVEL ON EACH LIST SHE HOLDS, her record-wide `read` on both (`me.levels`). */
  assert.equal(levels.obligations, 'read', 'boot did not say the level Bo holds on Obligations');
  assert.equal(levels.diary, 'read');
  assert.equal(boot.counts.decide, 1);
  assert.equal(boot.counts.inbox, null, 'a reader was told how much waits in the inbox');
  assert.equal(value<Boot>(await api.boot(owner)).counts.inbox, 0);
  /* AS THE CLIENT READS IT (`bootFilled`): `boot` leaves out what a line need not say again (`newsCut`), and a line that
     says a row was added carries none of its fields. */
  const said = value<WhatsNew>(await api.whatsNew(undefined, bo));
  const added = (e: WhatsNew['events'][number]) => (e.kind === 'create' && e.register !== null && e.title ? { ...e, to: null } : e);
  assert.deepEqual(bootFilled(boot as unknown as ClientBoot).whatsNew, { ...said, events: said.events.map(added) }, 'boot and whatsNew disagree');
  sql.close();
});

test('WHERE NOBODY CHOSE A CURRENCY, BOOT NAMES THE ONE ALL THE MONEY IS IN, never one of two and never from a list the caller cannot open', async () => {
  const { api, sql } = await record();
  const BILLS = {
    id: 'register.bills',
    kind: 'register' as const,
    body: { id: 'bills', name: 'Bills', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'amount', type: 'money' }] } as never,
  };
  assert.ok((await api.kernel.install([BILLS])).ok);
  const said = async (ctx: CallContext) => value<Boot>(await api.boot(ctx)).record?.currency;
  assert.equal(await said(owner), null, 'a record with no money names no currency');
  value(await api.create({ register: 'bills', fields: { what: 'Kiln rent', amount: { amount: 120_000, currency: 'GBP' } } }, owner));
  value(await api.create({ register: 'bills', fields: { what: 'Clay', amount: { amount: 4_500, currency: 'GBP' } } }, owner));
  assert.equal(await said(owner), 'GBP');
  value(await api.invite({ person: 'p_3', registers: { diary: 'read' } }, owner));
  const held = api.kernel.access('p_3')!;
  const diarist: CallContext = { principal: { kind: 'person', id: 'p_3', level: held.level }, registers: held.registers ?? '*', levels: held.levels };
  assert.equal(await said(diarist), null, 'the money on a list she cannot open named its currency');
  /* NOR A LIST HER GRANT NARROWS: the currency is read over every row, and some of them are held back from her. */
  const narrowed: CallContext = { ...owner, wheres: { bills: { field: 'what', op: 'eq', value: 'Clay' } } as never };
  assert.equal(await said(narrowed), null, 'the money on rows held back from her named its currency');
  value(await api.create({ register: 'bills', fields: { what: 'Glaze', amount: { amount: 3_000, currency: 'USD' } } }, owner));
  assert.equal(await said(owner), null, 'two currencies were chosen between');
  assert.deepEqual(value<Boot>(await api.boot(owner)).record?.money, ['GBP', 'USD']);
  sql.close();
});

test('A RECORD NOBODY NAMED STILL SAYS WHAT CURRENCY IT IS DRAWN IN, beside a `record` that stays null', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  assert.ok((await api.kernel.install([OBLIGATIONS, DIARY])).ok);
  const BILLS = {
    id: 'register.bills',
    kind: 'register' as const,
    body: { id: 'bills', name: 'Bills', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'amount', type: 'money' }] } as never,
  };
  assert.ok((await api.kernel.install([BILLS])).ok);
  value(await api.create({ register: 'bills', fields: { what: 'Kiln rent', amount: { amount: 120_000, currency: 'GBP' } } }, owner));
  const boot = value<Boot>(await api.boot(owner));
  assert.equal(boot.record, null, 'a record nobody named was given a name');
  assert.equal(boot.currency, 'GBP', 'the gates\' record wrote "£39 GBP" in every sentence for want of this');
  assert.deepEqual(boot.money, ['GBP']);
  /* AND A NAMED RECORD SAYS IT IN BOTH PLACES, the same. */
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  const named = value<Boot>(await api.boot(owner));
  assert.deepEqual([named.record?.currency, named.currency, named.money], ['GBP', 'GBP', ['GBP']]);
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

/** Five emails no rule claims, the oldest first, and the fourth dealt with, so the inbox holds four. */
async function inboxRecord() {
  const made = await record();
  const ids: string[] = [];
  for (const n of [1, 2, 3, 4, 5]) {
    const out = value<{ raw: string; state: string }>(
      made.api.kernel.arrive({ channel: 'email', headers: { From: `billing${n}@fenwick.example`, Subject: `Invoice ${n}` }, body: `Body ${n}`, sha256: `s${n}` }),
    );
    assert.equal(out.state, 'untriaged');
    ids.push(out.raw);
  }
  made.sql.exec("UPDATE inbox_raw SET state = 'ignored' WHERE id = ?", ids[3]!);
  return { ...made, ids };
}

test('THE INBOX IS WHAT ARRIVED AND NO RULE FILED, newest first, a page at a time, and the count on the rail agrees', async () => {
  const { api, sql } = await inboxRecord();
  const whole = value<InboxPage>(await api.inbox({ limit: 200 }, owner));
  assert.deepEqual(whole.arrivals.map((a) => a.subject), ['Invoice 5', 'Invoice 3', 'Invoice 2', 'Invoice 1'], 'newest first, and the dealt-with one left out');
  assert.equal(whole.cursor, null);
  assert.equal(value<Boot>(await api.boot(owner)).counts.inbox, whole.arrivals.length);

  const first = whole.arrivals[0]!;
  assert.equal(first.from, 'billing5@fenwick.example', 'the header a person reads, lower-cased on arrival');
  assert.equal(first.body, 'Body 5');
  assert.equal(first.channel, 'email');
  const said = JSON.stringify(whole);
  for (const kept of ['sha256', 'headers', '"s5"']) assert.ok(!said.includes(kept), `${kept} left the record through the inbox`);

  const pages: string[][] = [];
  let cursor: number | null = null;
  do {
    const page: InboxPage = value<InboxPage>(await api.inbox({ limit: 3, ...(cursor === null ? {} : { cursor }) }, owner));
    pages.push(page.arrivals.map((a) => a.id));
    cursor = page.cursor;
  } while (cursor !== null);
  assert.deepEqual(pages.flat(), whole.arrivals.map((a) => a.id), 'pages of three join to the whole inbox, no arrival twice');
  assert.equal(pages.length, 2);

  assert.equal((await api.inbox({ limit: 1.5 }, owner)).ok, false);
  const bad = await api.inbox({ cursor: 0 }, owner);
  assert.equal(bad.ok ? null : 'refusal' in bad ? bad.refusal.code : null, 'VALUE_MALFORMED');
  sql.close();
});

/* A RECORD-WIDE TOKEN HERE CARRIES NO `inbox` REACH. The one that does, and what it still may not do, is
   `inbox-grant.test.ts`. */
test('ONLY AN OWNER READS THE INBOX: a scoped token, a record-wide token without the inbox reach, a writer and a stranger are each refused FORBIDDEN', async () => {
  const { api, sql } = await inboxRecord();
  const token: CallContext = { principal: { kind: 'token', id: 't_2', scope: 'write', person: 'p_1', level: 'owner' } };
  const writer: CallContext = { principal: { kind: 'person', id: 'p_2', level: 'write' } };
  const nobody: CallContext = { principal: { kind: 'person', id: 'p_9', level: null } };
  const heldToPart: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, registers: ['obligations'] };
  for (const [who, ctx] of [['a scoped token', project], ['a record-wide token', token], ['a writer', writer], ['a stranger', nobody], ['an owner held to one register', heldToPart]] as const) {
    const out = await api.inbox(undefined, ctx);
    assert.equal(out.ok, false, `${who} read the inbox`);
    if (out.ok || !('refusal' in out)) continue;
    assert.equal(out.refusal.code, 'FORBIDDEN', `${who} was refused with ${out.refusal.code}`);
    assert.ok(out.refusal.fix.length > 20, `${who} was refused without a sentence`);
    assert.ok(!out.refusal.fix.includes('Invoice'), `${who} was told what the inbox holds`);
  }
  sql.close();
});

const codeOf = (r: { ok: boolean }): string | null =>
  r.ok ? null : 'refusal' in r ? (r as { refusal: { code: string } }).refusal.code : 'conflict';

test('FILING AN ARRIVAL IS A ROW WRITTEN LIKE ANY OTHER, and the arrival leaves the inbox in the same batch', async () => {
  const { api, sql, ids } = await inboxRecord();
  const filed = value<ArrivalSettled>(await api.fileArrival({ id: ids[4]!, register: 'obligations' }, owner));
  assert.equal(filed.state, 'matched');
  assert.equal(filed.already, false);
  assert.equal(filed.entry?.fields.what, 'Invoice 5', 'titled by the subject');

  const events = sql.all<{ kind: string; actor: string }>(
    "SELECT kind, actor FROM event WHERE batch = (SELECT batch FROM event WHERE target = ? AND kind = 'state')",
    `inbox_raw:${ids[4]}`,
  );
  assert.deepEqual(events.map((e) => e.kind).sort(), ['create', 'state'], 'the row and the arrival in one batch');
  assert.ok(events.every((e) => e.actor === 'p_1'), 'signed by who filed it');
  assert.deepEqual(value<InboxPage>(await api.inbox({}, owner)).arrivals.map((a) => a.subject), ['Invoice 3', 'Invoice 2', 'Invoice 1']);
  assert.equal(value<Boot>(await api.boot(owner)).counts.inbox, 3);

  const again = value<ArrivalSettled>(await api.fileArrival({ id: ids[4]!, register: 'diary' }, owner));
  assert.equal(again.already, true, 'filing it again is the same answer');
  assert.equal(again.entry?.id, filed.entry?.id);
  assert.equal(sql.all<{ id: string }>("SELECT id FROM event WHERE kind = 'create'").length, 1, 'and no second row');

  assert.equal(codeOf(await api.fileArrival({ id: ids[1]!, register: 'nothing' }, owner)) !== null, true);
  assert.equal(value<InboxPage>(await api.inbox({}, owner)).arrivals.length, 3, 'a refused row left the arrival waiting');

  const archived = value<ArrivalSettled>(await api.archiveArrival({ id: ids[2]! }, owner));
  assert.deepEqual([archived.state, archived.already, archived.entry], ['ignored', false, null]);
  assert.equal(value<ArrivalSettled>(await api.archiveArrival({ id: ids[2]! }, owner)).already, true);
  assert.equal(
    sql.all<{ id: string }>("SELECT id FROM event WHERE target = ? AND kind = 'state'", `inbox_raw:${ids[2]}`).length,
    1,
    'archiving twice is one event',
  );
  assert.equal(codeOf(await api.archiveArrival({ id: ids[4]! }, owner)), 'OUT_OF_BOUNDS', 'a filed arrival is not archived');
  assert.equal(codeOf(await api.fileArrival({ id: ids[2]!, register: 'obligations' }, owner)), 'OUT_OF_BOUNDS', 'an archived one is not filed');
  assert.equal(codeOf(await api.archiveArrival({ id: 'raw_nothing' }, owner)), 'OUT_OF_BOUNDS');
  assert.equal(codeOf(await api.fileArrival({ id: ids[1]! } as never, owner)), 'REQUIRED_MISSING');
  assert.equal(codeOf(await api.archiveArrival({ id: ids[1]!, register: 'diary' } as never, owner)), 'FIELD_UNKNOWN');
  sql.close();
});

test('ONLY AN OWNER IN A BROWSER FILES OR ARCHIVES AN ARRIVAL, and a refused caller moves nothing', async () => {
  const { api, sql, ids } = await inboxRecord();
  const token: CallContext = { principal: { kind: 'token', id: 't_2', scope: 'write', person: 'p_1', level: 'owner' } };
  const writer: CallContext = { principal: { kind: 'person', id: 'p_2', level: 'write' } };
  const heldToPart: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, registers: ['obligations'] };
  assert.equal(codeOf(await api.fileArrival({ id: ids[0]!, register: 'obligations' }, token)), 'NEEDS_BROWSER_SESSION');
  assert.equal(codeOf(await api.archiveArrival({ id: ids[0]! }, project)), 'NEEDS_BROWSER_SESSION');
  assert.notEqual(codeOf(await api.archiveArrival({ id: ids[0]! }, writer)), null, 'a writer archived an arrival');
  assert.equal(codeOf(await api.fileArrival({ id: ids[0]!, register: 'obligations' }, heldToPart)), 'FORBIDDEN');
  assert.equal(value<InboxPage>(await api.inbox({}, owner)).arrivals.length, 4);
  sql.close();
});

/**
 * WHAT POINTS AT ONE ROW. Three relations into `obligations`: two fields of one list, one field of
 * another, and a field on `mentions` that points at its own list, which is the only way a row can
 * come back as its own backlink.
 */
const MENTIONS = {
  id: 'register.mentions',
  kind: 'register' as const,
  body: {
    id: 'mentions',
    name: 'Mentions',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'about', type: 'ref', to: 'obligations' },
      { id: 'also', type: 'ref', to: 'obligations' },
      { id: 'parent', type: 'ref', to: 'mentions' },
    ],
  } as never,
};

const JOTTINGS = {
  id: 'register.jottings',
  kind: 'register' as const,
  body: {
    id: 'jottings',
    name: 'Jottings',
    title: 'body',
    fields: [
      { id: 'body', type: 'text', required: true },
      { id: 'about', type: 'ref', to: 'obligations' },
    ],
  } as never,
};

/** Invoice 41 with four rows naming it across three relations, and Invoice 42 with one. */
async function linkedRecord() {
  const made = await record();
  assert.ok((await made.api.kernel.install([OBLIGATIONS, DIARY, MENTIONS, JOTTINGS])).ok);
  value(await made.api.create({ register: 'obligations', fields: { what: 'Invoice 41' } }, owner));
  value(await made.api.create({ register: 'obligations', fields: { what: 'Invoice 42' } }, owner));
  value(await made.api.create({ register: 'mentions', fields: { what: 'Chased it', about: 'obligations#1' } }, owner));
  value(await made.api.create({ register: 'mentions', fields: { what: 'Chased again', about: 'obligations#1' } }, owner));
  value(await made.api.create({ register: 'mentions', fields: { what: 'Mentioned in passing', also: 'obligations#1' } }, owner));
  value(await made.api.create({ register: 'mentions', fields: { what: 'About the other one', about: 'obligations#2' } }, owner));
  value(await made.api.create({ register: 'jottings', fields: { body: 'Rang about it', about: 'obligations#1' } }, owner));
  return made;
}

const keysOf = (page: Backlinks): string[] => page.from.map((g) => `${g.register}.${g.field}`);
const titlesOf = (page: Backlinks): string[] =>
  page.from.flatMap((g) => g.rows.map((r) => String(r.fields.what ?? r.fields.body)));

test('WHAT POINTS AT ONE ROW IS GROUPED BY THE FIELD THAT POINTS, and an archived row points at nothing', async () => {
  const { api, sql } = await linkedRecord();
  const page = value<Backlinks>(await api.backlinks({ register: 'obligations', seq: 1 }, owner));
  assert.equal(page.to.register, 'obligations');
  assert.equal(page.to.seq, 1);
  assert.deepEqual(keysOf(page), ['jottings.about', 'mentions.about', 'mentions.also'], 'one group per field that points, lists in order');
  assert.deepEqual(page.from.map((g) => g.matched), [1, 2, 1]);
  assert.deepEqual(titlesOf(page), ['Rang about it', 'Chased again', 'Chased it', 'Mentioned in passing'], 'newest first inside each group');
  assert.equal(page.cursor, null);
  assert.ok(!JSON.stringify(page).includes('About the other one'), 'a row naming the other invoice came back');

  value(await api.update({ register: 'mentions', seq: 2, patch: { deleted_at: new Date(NOW).toISOString() } }, owner));
  const after = value<Backlinks>(await api.backlinks({ register: 'obligations', seq: 1 }, owner));
  assert.deepEqual(after.from.map((g) => g.matched), [1, 1, 1], 'an archived row was still counted');
  assert.ok(!titlesOf(after).includes('Chased again'), 'an archived row was still drawn');
  sql.close();
});

test('A ROW THAT POINTS AT ITSELF IS NOT ITS OWN BACKLINK', async () => {
  const { api, sql } = await linkedRecord();
  const own = value<{ seq: number }>(await api.create({ register: 'mentions', fields: { what: 'Threaded' } }, owner));
  value(await api.update({ register: 'mentions', seq: own.seq, patch: { parent: `mentions#${own.seq}` } }, owner));
  const self = value<Backlinks>(await api.backlinks({ register: 'mentions', seq: own.seq }, owner));
  assert.deepEqual(keysOf(self), [], 'the row came back pointing at itself');
  sql.close();
});

test('THE PAGES JOIN TO THE WHOLE, no row twice, and a drawn relation carries the walk into the next', async () => {
  const { api, sql } = await linkedRecord();
  const whole = titlesOf(value<Backlinks>(await api.backlinks({ register: 'obligations', seq: 1 }, owner)));
  assert.equal(whole.length, 4);

  const seen: string[] = [];
  let cursor: string | null = null;
  let rounds = 0;
  do {
    const page: Backlinks = value<Backlinks>(
      await api.backlinks({ register: 'obligations', seq: 1, limit: 1, ...(cursor === null ? {} : { cursor }) }, owner),
    );
    seen.push(...titlesOf(page));
    cursor = page.cursor;
    rounds += 1;
  } while (cursor !== null && rounds < 12);
  assert.equal(cursor, null, 'the walk never reached its end');
  assert.deepEqual(seen, whole, 'pages of one join to the whole answer, in the same order, no row twice');
  sql.close();
});

test('BACKLINKS ARE HELD TO WHAT THE CALLER MAY READ, on both the count and the rows', async () => {
  const { api, sql } = await linkedRecord();
  const heldToMentions: CallContext = {
    principal: { kind: 'token', id: 't_3', scope: 'read', person: 'p_1', level: 'owner' },
    registers: ['obligations', 'mentions'],
  };
  const held = value<Backlinks>(await api.backlinks({ register: 'obligations', seq: 1 }, heldToMentions));
  assert.deepEqual(keysOf(held), ['mentions.about', 'mentions.also'], 'a list this caller may not read was named');
  assert.ok(!JSON.stringify(held).includes('Rang about it'), 'a row from a list this caller may not read came through');

  assert.deepEqual(
    keysOf(value<Backlinks>(await api.backlinks({ register: 'obligations', seq: 1 }, project))),
    [],
    'a token held to one list saw the others',
  );

  const nobody: CallContext = { principal: { kind: 'person', id: 'p_9', level: null } };
  assert.equal(codeOf(await api.backlinks({ register: 'obligations', seq: 1 }, nobody)), 'FORBIDDEN');
  assert.equal(codeOf(await api.backlinks({ register: 'diary', seq: 1 }, project)), 'FORBIDDEN', 'a caller read backlinks into a list it may not read');
  sql.close();
});

test('A ROW THAT IS NOT THERE HAS NOTHING POINTING AT IT, and a number or a cursor that is not one is refused', async () => {
  const { api, sql } = await linkedRecord();
  const gone = value<Backlinks>(await api.backlinks({ register: 'obligations', seq: 99 }, owner));
  assert.deepEqual(gone.from, [], 'a row that is not there had backlinks');
  assert.equal(gone.to.seq, null);
  assert.equal(gone.cursor, null);

  assert.equal(codeOf(await api.backlinks({ register: 'obligations', seq: 0 }, owner)), 'VALUE_MALFORMED');
  assert.equal(codeOf(await api.backlinks({ register: 'obligations', seq: 1, cursor: 'nonsense' }, owner)), 'VALUE_MALFORMED');
  assert.equal(codeOf(await api.backlinks({ register: 'obligations', seq: 1, limit: 1.5 }, owner)), 'VALUE_MALFORMED');
  assert.equal(codeOf(await api.backlinks({ register: 'nope', seq: 1 }, owner)), 'REGISTER_UNKNOWN');
  sql.close();
});

test('BOOT IS ONE READ, so a write from another connection lands wholly before it or wholly after it', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'dog-boot-'));
  const file = join(dir, 'record.sqlite');

  const sql = openSqlite(file);
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  assert.ok((await api.kernel.install([OBLIGATIONS, DIARY])).ok);
  assert.ok(
    api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok,
  );
  value(await api.create({ register: 'obligations', fields: { what: 'Before' } }, owner));

  /* A SECOND CONNECTION TO THE SAME FILE, as a CLI beside a running self-host is. */
  const other = openSqlite(file);
  const second = await createRecordApi({ sql: other, clock: fixedClock(NOW + 60_000) });

  /* ITS WRITE LANDS THE MOMENT `boot` HAS COUNTED THE LIST AND BEFORE IT READS WHAT IS NEW. */
  const one = sql.one.bind(sql);
  let armed = true;
  sql.one = ((text: string, ...params: never[]) => {
    const out = one(text, ...params);
    /* A LIST IS NAMED BY ITS ID AS A LITERAL in the kernel's reads (`onList`), or by a placeholder when the id is not plain. */
    const counts = text.includes("count(*) AS n FROM entry WHERE register = 'obligations'") || (text.includes('count(*) AS n FROM entry WHERE register = ?') && params[0] === 'obligations');
    if (armed && counts) {
      armed = false;
      assert.ok(second.kernel.create('obligations', { what: 'During' }, { actor: 'p_1' }).ok);
    }
    return out;
  }) as typeof sql.one;

  const boot = value<Boot>(await api.boot(owner));
  assert.equal(armed, false, 'the write never ran');
  const counted = boot.registers.find((r) => r.id === 'obligations')?.count;
  const news = boot.whatsNew.events.filter((e) => e.register === 'obligations').length;
  assert.equal(counted, news, `boot counted ${counted} rows and told of ${news} created, from two different moments`);

  sql.close();
  other.close();
  rmSync(dir, { recursive: true, force: true });
});

test('THE DECIDE COUNT IS EVERY OPEN QUESTION, past two hundred, and what waits is not crowded out by what the caller cannot see', async () => {
  const { api, sql } = await record();
  value(await api.propose({ question: 'File Invoice 1?', body_kind: 'rowset', body: { register: 'obligations', rows: [{ what: 'Invoice 1' }] } }, owner));
  for (let i = 0; i < 205; i++)
    value(await api.propose({ question: `Note ${i}?`, body_kind: 'rowset', body: { register: 'diary', rows: [{ body: `Note ${i}` }] } }, owner));

  assert.equal(value<Boot>(await api.boot(owner)).counts.decide, 206, 'the rail stopped counting at a page');
  const scoped = value<Boot>(await api.boot(project));
  assert.equal(scoped.counts.decide, 1, 'a question the token may see went uncounted behind ones it may not');
  assert.equal(scoped.waiting.length, 1, 'the one question the token may see was crowded out of what waits');
  sql.close();
});

test('A PAGE OF GOVERNANCE IS FILLED FROM WHAT THE CALLER MAY SEE, not trimmed first and filtered after', async () => {
  const { api, sql } = await record();
  value(await api.propose({ question: 'File Invoice 1?', body_kind: 'rowset', body: { register: 'obligations', rows: [{ what: 'Invoice 1' }] } }, owner));
  for (let i = 0; i < 60; i++)
    value(await api.propose({ question: `Note ${i}?`, body_kind: 'rowset', body: { register: 'diary', rows: [{ body: `Note ${i}` }] } }, owner));

  const seen = value<Record<string, unknown>[]>(await api.governance({}, project));
  assert.equal(seen.length, 1, 'fifty rows the token may not see took the whole page');
  assert.equal(value<Record<string, unknown>[]>(await api.governance({ limit: 5 }, owner)).length, 5);
  assert.equal(value<Record<string, unknown>[]>(await api.governance({}, owner)).length, 50);
  sql.close();
});

test("THE PEOPLE LIST THAT NAMES THEM IS THE PEOPLE MODULE'S, not any list somebody called people", async () => {
  /* A shared use case on a record without the People module could declare a list with the id `people` and invite
     somebody to it, and `boot` read the id alone. Now the list must be owned by the first-party pack. */
  for (const [pack, named] of [['usecase-club', false], ['people', true]] as const) {
    const { api, sql } = await record();
    const list = { id: 'register.people', kind: 'register' as const, pack, body: { id: 'people', name: 'People', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] } as never };
    assert.ok((await api.kernel.install([list])).ok);
    value(await api.invite({ person: 'p_2', name: 'Bo', level: 'read' } as never, owner));
    value(await api.invite({ person: 'p_4', name: 'Di', registers: { people: 'read' } } as never, owner));
    const held = (id: string): CallContext => {
      const a = api.kernel.access(id)!;
      return { principal: { kind: 'person', id, level: a.level }, registers: a.registers ?? '*', levels: a.levels };
    };
    const namesOf = async (ctx: CallContext) => (value<Boot>(await api.boot(ctx)) as Boot & { names?: Record<string, string> }).names;
    assert.deepEqual(await namesOf(owner), { p_2: 'Bo', p_4: 'Di' }, pack);
    for (const id of ['p_2', 'p_4'])
      /* AND A NAMELESS OWNER IS SAID BY THE ROLE, to everybody but themselves. */
      assert.deepEqual(await namesOf(held(id)), named ? { p_1: 'The owner', p_2: 'Bo', p_4: 'Di' } : undefined, `${id} on a people list owned by ${pack}`);
    sql.close();
  }
});

test('BOOT NAMES WHO IS ON THE RECORD to the owner and to a member who may read People, and never an address', async () => {
  const { api, sql } = await record();
  const PEOPLE_LIST = { id: 'register.people', kind: 'register' as const, pack: 'people', body: { id: 'people', name: 'People', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] } as never };
  const namesOf = async (ctx: CallContext) => (value<Boot>(await api.boot(ctx)) as Boot & { names?: Record<string, string> }).names;
  value(await api.invite({ person: 'p_2', name: 'Bo', email: 'bo@example.com', level: 'read' } as never, owner));
  value(await api.invite({ person: 'p_3', name: 'Cy', registers: { obligations: 'read' } } as never, owner));
  const held = (id: string): CallContext => {
    const a = api.kernel.access(id)!;
    return { principal: { kind: 'person', id, level: a.level }, registers: a.registers ?? '*', levels: a.levels };
  };

  /* NO PEOPLE LIST: only the owner, who reads the membership list, is told. */
  assert.deepEqual(await namesOf(owner), { p_2: 'Bo', p_3: 'Cy' });
  assert.equal(await namesOf(held('p_2')), undefined, 'a reader was named the members on a record with no People list');

  assert.ok((await api.kernel.install([PEOPLE_LIST])).ok);
  value(await api.invite({ person: 'p_4', name: 'Di', registers: { people: 'read' } } as never, owner));
  assert.deepEqual(await namesOf(held('p_2')), { p_1: 'The owner', p_2: 'Bo', p_3: 'Cy', p_4: 'Di' }, 'a member who reads the whole record, People with it');
  assert.deepEqual(await namesOf(held('p_4')), { p_1: 'The owner', p_2: 'Bo', p_3: 'Cy', p_4: 'Di' }, 'a member invited to People');
  assert.equal(await namesOf(held('p_3')), undefined, 'a member held to Obligations was named everybody');
  assert.equal(await namesOf(project), undefined, 'a token held to one project was named everybody');
  assert.doesNotMatch(JSON.stringify(value<Boot>(await api.boot(held('p_2')))), /example\.com/u);
  sql.close();
});

/**
 * The record walks its own words in the night and keeps the answer (`lintTick`, `keepTextFaults`), and `textFaults` hands
 * it back: a screen that opens walks nothing, a write does not throw the answer away, and every walk is bounded by a
 * count under a clock that stands still, as a Worker's does.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { DAY, HOLDER, NIGHT, type TextFaultsRead } from '../src/methods/text-faults.ts';
import { keptRound, ROUND_HOLDER, ROUND_KEPT, type PageLintRound } from '../src/page-lint.ts';
import { openSqlite } from '../../kernel/test/sqlite.ts';

const T0 = Date.UTC(2026, 9, 14, 3);
const DAY_MS = 86_400_000;
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const narrow: CallContext = { principal: { kind: 'person', id: 'p_3', level: 'owner' }, registers: ['projects'] };

const decl = (kind: string, id: string, body: unknown) => ({ id: `${kind}.${id}`, kind, body }) as never;

const PROJECTS = decl('register', 'projects', {
  id: 'projects',
  name: 'Projects',
  title: 'name',
  fields: [{ id: 'name', type: 'text', required: true }, { id: 'note', type: 'document', label: 'Note' }],
});
const CONTACTS = decl('register', 'contacts', {
  id: 'contacts',
  name: 'Contacts',
  title: 'name',
  fields: [{ id: 'name', type: 'text', required: true }, { id: 'memo', type: 'document', label: 'Memo' }],
});
/** A page a person wrote that holds one typo. */
const page = (n: number) =>
  decl('page', `desk-${n}`, { page: `desk-${n}`, title: `Desk ${n}`, requires: ['register.projects'], blocks: [{ kind: 'note', heading: 'Lead', body: `We hold {{projects.cuont}} projects on desk ${n}.` }] });

async function record(pages = 2) {
  const sql = openSqlite();
  let at = T0;
  const api = await createRecordApi({ sql, clock: { now: () => at } });
  const put = await api.kernel.install([PROJECTS, CONTACTS, ...Array.from({ length: pages }, (_, i) => page(i + 1))]);
  assert.ok(put.ok, JSON.stringify(put));
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  return { sql, api, later: (ms: number) => void (at += ms) };
}

/* THE WORDS' WALK ALONE: the page lint's round (`printed`) is kept by the same night pass on its own day, and its tests are below. */
const read = async (api: Awaited<ReturnType<typeof record>>['api'], ctx: CallContext = owner): Promise<TextFaultsRead> => {
  const out = await api.textFaults({}, ctx);
  assert.ok(out.ok, JSON.stringify(out));
  const { printed: _printed, ...words } = out.value;
  return words;
};

const keptPref = (api: Awaited<ReturnType<typeof record>>['api']) => api.kernel.prefsOf(HOLDER)['kept'] as { at: number } | undefined;

test('BEFORE THE FIRST NIGHT the owner is told nothing and no time, and nothing is walked for it', async () => {
  const { sql, api } = await record();
  assert.deepEqual(await read(api), { count: 0, pages: 0, line: '', faults: [], truncated: false, computedAt: null });
  sql.close();
});

test('THE NIGHT PASS WALKS ONCE A DAY AND KEEPS IT, and a read hands it back with the time it was found', async () => {
  const { sql, api, later } = await record();
  assert.equal((await api.lintTick()).ran, true);
  const first = await read(api);
  assert.equal(first.pages, 2);
  assert.equal(first.computedAt, new Date(T0).toISOString());
  assert.match(first.line, /values? on 2 pages name nothing/);

  /* THE SAME DAY WALKS NOTHING: a sentinel put in the kept answer is still there after another tick. */
  api.kernel.setPref(HOLDER, 'kept', { at: T0 + 1, value: { count: 9, pages: 9, line: 'kept', faults: [], truncated: false } });
  await api.lintTick();
  assert.equal(keptPref(api)?.at, T0 + 1);
  assert.equal((await read(api)).line, 'kept');

  /* AND THE NEXT UTC DAY WALKS AGAIN. */
  later(DAY_MS);
  await api.lintTick();
  const next = await read(api);
  assert.equal(next.computedAt, new Date(T0 + DAY_MS).toISOString());
  assert.equal(next.pages, 2);
  sql.close();
});

test('A RECORD THE LINT RAN ON TODAY, UNDER A BUILD THAT KEPT NO WORDS, GETS ITS WALK ON THE NEXT ALARM', async () => {
  const { sql, api } = await record();
  api.kernel.setPref('braindog:signs', 'pages-clean.last', '2026-10-14');
  assert.deepEqual(await api.lintTick(), { ran: false, why: 'today' });
  assert.equal((await read(api)).pages, 2);
  sql.close();
});

test('A WALK THAT THROWS IS NOT TRIED AGAIN UNTIL TOMORROW, and the last answer stands', async () => {
  const { sql, api, later } = await record();
  await api.lintTick();
  const was = await read(api);
  later(DAY_MS);
  const walk = api.kernel.pageWalk;
  api.kernel.pageWalk = () => {
    throw new Error('the walk broke');
  };
  assert.equal((await api.lintTick()).ran, true, 'the night\'s other work is done');
  assert.deepEqual(await read(api), was);
  api.kernel.pageWalk = walk;
  await api.lintTick();
  assert.deepEqual(await read(api), was, 'tried once that day');
  later(DAY_MS);
  await api.lintTick();
  assert.equal((await read(api)).computedAt, new Date(T0 + 2 * DAY_MS).toISOString());
  sql.close();
});

test('EVERY WALK IS BOUNDED BY A COUNT UNDER A CLOCK THAT STANDS STILL: the night by pages, a narrow reader by a small budget', async () => {
  const { sql, api } = await record(NIGHT.pages + 30);
  await api.lintTick();
  const night = await read(api);
  assert.equal(night.pages, NIGHT.pages, 'a page past the round is not drawn');
  assert.equal(night.truncated, true);
  /* SHE IS NOT HANDED THE NIGHT'S ANSWER (it is not hers), and her own walk stops at its small count. */
  const day = await read(api, narrow);
  assert.equal(day.pages, DAY.pages);
  assert.equal(day.truncated, true);
  sql.close();
});

test('A NARROW READER\'S ROWS ARE COUNTED TOO: past the day\'s budget the walk stops and says so', async () => {
  const { sql, api } = await record(0);
  /* THE ONE PLACEHOLDER IS IN THE OLDEST ROW, which a list gives last: past the day's count. */
  const total = DAY.rows + 40;
  for (let i = 0; i < total; i++)
    assert.ok(api.kernel.create('projects', { name: `Row ${i}`, note: i === 0 ? 'See {{nope.x}}.' : 'Plain words.' } as never, { actor: 'p_1' }).ok);
  const day = await read(api, narrow);
  assert.equal(day.truncated, true);
  assert.equal(day.count, 0, 'the row past the count is not read');
  /* THE NIGHT READS THEM ALL: its budget is ten thousand rows. */
  await api.lintTick();
  const night = await read(api);
  assert.equal(night.count, 1);
  assert.equal(night.truncated, false);
  sql.close();
});

test('AN ERASURE PUTS THE KEPT FAULTS AWAY, because they name rows, and the next alarm walks again', async () => {
  const { sql, api } = await record(0);
  assert.ok(api.kernel.create('contacts', { name: 'Mara Quill', memo: 'See {{nope.x}}.' } as never, { actor: 'p_1' }).ok);
  await api.lintTick();
  assert.ok((await read(api)).faults.some((f) => f.where.row === 'Mara Quill'));
  const erased = (await api.erase({ subjects: ['Mara Quill'], basis: 'Article 17 request' }, owner)) as { ok: boolean };
  assert.ok(erased.ok, JSON.stringify(erased));
  assert.deepEqual(await read(api), { count: 0, pages: 0, line: '', faults: [], truncated: false, computedAt: null });
  await api.lintTick();
  const after = await read(api);
  assert.ok(after.computedAt !== null);
  assert.ok(!JSON.stringify(after).includes('Mara Quill'));
  sql.close();
});

/* ── the page lint's whole round (C39) ──────────────────────────────────── */

const printedOf = async (api: Awaited<ReturnType<typeof record>>['api'], ctx: CallContext = owner) => {
  const out = await api.textFaults({}, ctx);
  assert.ok(out.ok, JSON.stringify(out));
  return out.value.printed;
};

test('HEALTH IS HANDED EVERY FINDING OF THE NIGHT\'S PAGE LINT, not the sign\'s six', async () => {
  const { sql, api } = await record();
  assert.equal(await printedOf(api), undefined, 'nothing before the first round');
  await api.lintTick();
  const first = await printedOf(api);
  assert.ok(first, 'the night pass keeps its round');
  assert.equal(first.at, new Date(T0).toISOString());
  assert.equal(first.pages, 2);
  /* TWENTY FINDINGS ON FOURTEEN PAGES, as on his record: every one is handed back, each page with its address. */
  const round: PageLintRound = {
    findings: Array.from({ length: 20 }, (_, i) => ({ page: `Desk ${(i % 14) + 1}`, part: 'Lead', rule: 'no-reading' as const, said: `Shows a figure with no answer, number ${i + 1}.` })),
    pages: 14,
    unread: 0,
    withFindings: [],
    cells: 0,
    cut: [],
  };
  api.kernel.setPref(ROUND_HOLDER, ROUND_KEPT, keptRound(round, T0, (title) => (title === 'Desk 1' ? 'desk-1' : null)));
  const all = await printedOf(api);
  assert.equal(all?.findings.length, 20);
  assert.equal(all?.findings[0]?.slug, 'desk-1');
  assert.equal(all?.findings[1]?.slug, null);
  assert.equal(all?.findings[19]?.said, 'Shows a figure with no answer, number 20.');
  /* A READER HELD TO SOME LISTS IS NOT HANDED THE ROUND: it was read as the system, over every page. */
  assert.equal(await printedOf(api, narrow), undefined);
  sql.close();
});

test('AN ERASURE PUTS THE KEPT ROUND AWAY TOO, since a page made for a row is titled by it', async () => {
  const { sql, api } = await record(0);
  await api.lintTick();
  assert.ok(await printedOf(api));
  const erased = (await api.erase({ subjects: ['Nobody Here'], basis: 'Article 17 request' }, owner)) as { ok: boolean };
  assert.ok(erased.ok, JSON.stringify(erased));
  assert.equal(await printedOf(api), undefined);
  sql.close();
});

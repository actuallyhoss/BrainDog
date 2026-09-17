/**
 * The reads that stopped at a page: open questions past `boot`'s twenty, decisions past the newest two hundred, and a
 * page declared for a list past two hundred rows. Each test writes more than the cap and reads every row back, once.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type Boot, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 5, 12);

const DIARY = {
  id: 'register.diary',
  kind: 'register' as const,
  body: { id: 'diary', name: 'Diary', title: 'body', fields: [{ id: 'body', type: 'text', required: true }] } as never,
};

const PER_ENTRY = {
  id: 'page.entry',
  kind: 'page' as const,
  body: { page: 'entry', title: '{{body}}', for: { register: 'diary' }, requires: ['register.diary'], blocks: [{ kind: 'note', body: '{{body}}' }] } as never,
};

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

async function record(...decls: object[]) {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  assert.ok((await api.kernel.install([DIARY, ...(decls as never[])])).ok);
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  return { api, sql, clock };
}

const ask = (n: number) => ({
  question: `Question ${n}?`,
  body_kind: 'options' as const,
  body: { options: [{ id: 'yes', label: 'Yes', because: 'It is.' }, { id: 'no', label: 'No', because: 'It is not.' }] },
});

type Row = { id: string };

/** Every row of one governance read, a page at a time, following the cursor until a page comes back short. */
async function walk(api: Awaited<ReturnType<typeof record>>['api'], args: Record<string, unknown>, limit: number): Promise<string[]> {
  const ids: string[] = [];
  let cursor: string | undefined;
  for (let pages = 0; pages < 100; pages++) {
    const rows = value<Row[]>(await api.governance({ ...args, limit, ...(cursor ? { cursor } : {}) } as never, owner));
    ids.push(...rows.map((r) => r.id));
    if (rows.length < limit) return ids;
    cursor = rows.at(-1)!.id;
  }
  throw new Error('the walk did not end');
}

test('OPEN QUESTIONS PAST BOOT’S TWENTY are every one of them, a page at a time, newest first and each once', async () => {
  const { api, sql, clock } = await record();
  const made: string[] = [];
  for (let i = 0; i < 57; i++) {
    /* Half share an instant, so the order past the time is the order they were written in. */
    if (i % 2) clock.advance(1000);
    made.push(value<{ id: string }>(await api.propose(ask(i), owner)).id);
  }
  const boot = value<Boot>(await api.boot(owner));
  assert.equal(boot.waiting.length, 20);
  assert.equal(boot.counts.decide, 57);

  const ids = await walk(api, { status: 'open' }, 20);
  assert.equal(ids.length, 57);
  assert.equal(new Set(ids).size, 57, 'a question came twice');
  assert.deepEqual(ids, [...made].reverse(), 'newest first, and written order where the instant is shared');
  sql.close();
});

test('DECISIONS PAST THE NEWEST TWO HUNDRED are every one, and boot counts them all', async () => {
  const { api, sql, clock } = await record();
  for (let i = 0; i < 230; i++) {
    const id = value<{ id: string }>(await api.propose(ask(i), owner)).id;
    if (i % 3 === 0) clock.advance(1000);
    value(await api.decide({ id, decide: { option: 'yes', reason: `because ${i}` } }, owner));
  }
  assert.equal(value<Boot>(await api.boot(owner)).counts.decided, 230);
  const ids = await walk(api, { register: 'decision' }, 200);
  assert.equal(ids.length, 230);
  assert.equal(new Set(ids).size, 230, 'a decision came twice');
  sql.close();
});

test('A CURSOR THE REGISTER DOES NOT HOLD IS REFUSED, never read as the first page', async () => {
  const { api, sql } = await record();
  value(await api.propose(ask(1), owner));
  const out = (await api.governance({ status: 'open', cursor: 'SG999' }, owner)) as { ok: boolean; refusal?: { code: string } };
  assert.equal(out.ok, false);
  assert.equal(out.refusal?.code, 'VALUE_MALFORMED');
  sql.close();
});

test('A PAGE DECLARED FOR A LIST PAST TWO HUNDRED ROWS has a page for every row', async () => {
  const { api, sql } = await record(PER_ENTRY);
  for (let i = 0; i < 612; i++) assert.ok(api.kernel.create('diary', { body: `Entry ${i}` }, { actor: 'p_1' }).ok);
  const slugs = value<{ slug: string }[]>(await api.pages(owner)).map((p) => p.slug);
  const entries = slugs.filter((s) => s.startsWith('entry-'));
  assert.equal(entries.length, 612);
  assert.equal(new Set(entries).size, 612);
  const last = value<{ title: string }>(await api.page({ slug: 'entry-0' }, owner));
  assert.equal(last.title, 'Entry 0', 'the oldest row, past every page of two hundred, draws');
  sql.close();
});

test('BOOT NAMES THE ONE LIST A PAGE DRAWS, so the rail can put a saved view under it, and no list for a page over none', async () => {
  const VIEW = {
    id: 'page.diary-long',
    kind: 'page' as const,
    body: {
      page: 'diary-long',
      title: 'Long entries',
      nav: { section: 'Views', order: 900 },
      requires: ['register.diary'],
      blocks: [{ kind: 'table', span: 12, source: 'register.diary' }],
    } as never,
  };
  const PROSE = { id: 'page.about', kind: 'page' as const, body: { page: 'about', title: 'About', nav: { section: 'Work', order: 1 }, blocks: [{ kind: 'note', body: 'Hello.' }] } as never };
  const { api, sql } = await record(VIEW, PROSE);
  const pages = value<Boot>(await api.boot(owner)).pages;
  assert.equal(pages.find((p) => p.slug === 'diary-long')?.list, 'diary');
  assert.equal(pages.find((p) => p.slug === 'about')?.list, null);
  sql.close();
});

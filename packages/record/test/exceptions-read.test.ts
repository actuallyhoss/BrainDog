/**
 * `exceptions`: what stopped on this record, asked of the record in names (`src/methods/exceptions.ts`).
 *
 * A list that took something new day after day and then went quiet is said once, by the name its people call it and
 * the day it stopped, to whoever may read that list. It is read from what the record already holds, kept in no table,
 * and it is never a question on Decide.
 *
 * Through the real record, over the kernel's own detectors (`openExceptions`).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Refusal, Result } from '@braindog/ports';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const DAY = 86_400_000;
/** Tuesday 13 October 2026, noon. The numbers last arrived on the 9th. */
const NOW = Date.UTC(2026, 9, 13, 12);

/** The list is `figures` inside and Numbers to its people, so an answer that said the id would be caught. */
const NUMBERS = {
  id: 'register.figures',
  kind: 'register' as const,
  body: { id: 'figures', name: 'Numbers', title: 'label', fields: [{ id: 'label', type: 'text', required: true }, { id: 'value', type: 'int' }] } as never,
};

const THINGS = {
  id: 'register.things',
  kind: 'register' as const,
  body: { id: 'things', name: 'Projects', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] } as never,
};

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const reader: CallContext = { principal: { kind: 'person', id: 'p_2', level: 'read' } };
/** Somebody who reads Projects and nothing else: Numbers is not there for them. */
const shut: CallContext = { principal: { kind: 'person', id: 'p_3', level: 'read' }, registers: ['things'] };

type Seen = { kind: string; subject: string; said: string; since: string; row: { name: string; id: string } | null };
type Answer = { exceptions: Seen[] };
type Api = Awaited<ReturnType<typeof createRecordApi>>;

const refusal = (out: Result<unknown>) => (out as { refusal: Refusal }).refusal;
const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

/** Called through this so the file typechecks on a record that has not registered the method yet. */
const exceptions = (api: Api, ctx: CallContext, args: unknown = {}): Promise<Result<Answer>> => {
  const method = (api as unknown as { exceptions?: (a: unknown, c: CallContext) => Promise<Result<Answer>> }).exceptions;
  assert.equal(typeof method, 'function', 'exceptions is not registered in methods/index.ts');
  return method!(args, ctx);
};

/** A record made `daysOld` days before now, with both lists and nothing on them. */
async function record(daysOld: number) {
  const sql = openSqlite();
  const clock = fixedClock(NOW - daysOld * DAY);
  const api = await createRecordApi({ sql, clock });
  value(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }));
  value(await api.kernel.install([NUMBERS, THINGS] as never));
  const add = (register: string, fields: Record<string, unknown>) => value(api.kernel.create(register, fields as never, { actor: 'p_1' }));
  return { api, sql, clock, add };
}

/** Numbers took one a day for ten days, 30 September to 9 October, and none on the four days since. Projects took one, once. */
async function quiet() {
  const r = await record(20);
  for (let ago = 13; ago >= 4; ago -= 1) {
    r.clock.set(NOW - ago * DAY - 2 * 3_600_000);
    r.add('figures', { label: `Sessions, day ${14 - ago}`, value: 100 + ago });
    if (ago === 9) r.add('things', { name: 'Fanline' });
  }
  r.clock.set(NOW);
  return r;
}

test('NUMBERS THAT STOPPED ARE SAID ONCE, by the name of the list and the day they stopped, with no id and no raw time', async () => {
  const { api, sql } = await quiet();
  const out = value<Answer>(await exceptions(api, owner));
  assert.equal(out.exceptions.length, 1, JSON.stringify(out));
  const one = out.exceptions[0]!;
  assert.equal(one.kind, 'list');
  assert.equal(one.subject, 'Numbers');
  assert.equal(one.since, '9 October');
  assert.match(one.said, /Numbers/u);
  assert.match(one.said, /9 October/u);
  assert.match(one.said, /four days/u);
  assert.deepEqual(Object.keys(one).sort(), ['kind', 'said', 'since', 'subject', 'row'].sort());

  /* NAMES, and never what the record calls a thing inside: no id of any kind, no raw time, no dash a person reads. */
  const text = JSON.stringify(out);
  assert.doesNotMatch(text, /[0-9A-HJKMNP-TV-Z]{26}/u, 'an id was said');
  assert.doesNotMatch(text, /register\.|quiet:/u, 'the list was said by what it is called inside');
  assert.doesNotMatch([one.subject, one.said, one.since].join(' '), /figures|#/u, 'a handle was said in words a person reads');

  /* WHAT IT OPENS IS THE NEWEST OF THEM, by the name the list gives it, with its handle beside the name and nowhere else. */
  assert.deepEqual(one.row, { name: 'Sessions, day 10', id: 'figures#10' });
  assert.doesNotMatch(text, /\d{4}-\d{2}-\d{2}|T\d{2}:\d{2}/u, 'a raw time was said');
  assert.doesNotMatch(text, /—/u);
  sql.close();
});

test('A READ, AND NEVER A QUESTION: asking twice answers the same, and nothing is written or asked', async () => {
  const { api, sql } = await quiet();
  const count = () => [sql.one<{ n: number }>('SELECT count(*) AS n FROM event')!.n, sql.one<{ n: number }>('SELECT count(*) AS n FROM suggestion')!.n];
  const before = count();
  const first = value<Answer>(await exceptions(api, owner));
  assert.deepEqual(value<Answer>(await exceptions(api, owner)), first);
  assert.deepEqual(count(), before);
  assert.equal(sql.one<{ n: number }>('SELECT count(*) AS n FROM suggestion')!.n, 0, 'something that stopped was put on Decide');
  sql.close();
});

test('SOMEBODY WHO MAY NOT READ THE LIST IS ANSWERED WITHOUT IT, and somebody who may is answered as the owner is', async () => {
  const { api, sql } = await quiet();
  const mine = value<Answer>(await exceptions(api, owner));
  assert.deepEqual(value<Answer>(await exceptions(api, reader)), mine);
  const theirs = await exceptions(api, shut);
  assert.ok(theirs.ok, theirs.ok ? '' : refusal(theirs).fix);
  assert.deepEqual(value<Answer>(theirs), { exceptions: [] });
  assert.doesNotMatch(JSON.stringify(theirs), /Numbers/u);
  sql.close();
});

test('WHEN THE NUMBERS ARRIVE AGAIN IT IS GONE, with nothing to close', async () => {
  const { api, sql, add } = await quiet();
  assert.equal(value<Answer>(await exceptions(api, owner)).exceptions.length, 1);
  add('figures', { label: 'Sessions, today', value: 140 });
  assert.deepEqual(value<Answer>(await exceptions(api, owner)), { exceptions: [] });
  sql.close();
});

test('A FRESH RECORD ANSWERS AN EMPTY LIST, and a list nobody ever wrote to daily is not said to have stopped', async () => {
  const { api, sql, add } = await record(0);
  assert.deepEqual(value<Answer>(await exceptions(api, owner)), { exceptions: [] });
  add('things', { name: 'Fanline' });
  assert.deepEqual(value<Answer>(await exceptions(api, owner)), { exceptions: [] });
  sql.close();
});

test('SOMETHING OLDER THAN ITS PAGE ALLOWS IS SAID BY ITS OWN NAME, with the window the page declares and nothing hardcoded', async () => {
  const { api, sql, add } = await record(0);
  const RATES = { id: 'register.rates', kind: 'register' as const, body: { id: 'rates', name: 'Rates', title: 'pair', fields: [{ id: 'pair', type: 'text', required: true }, { id: 'as_of', type: 'day' }] } as never };
  const PAGE = { id: 'page.money', kind: 'page' as const, body: { page: 'money', title: 'Money', requires: ['register.rates'], blocks: [{ kind: 'cards', source: 'register.rates', columns: [{ field: 'pair' }, { field: 'as_of', as: 'when' }], stale: { field: 'as_of', after: '7d' }, empty: 'None.' }] } as never };
  value(await api.kernel.install([RATES, PAGE] as never));
  add('rates', { pair: 'Dollars to pounds', as_of: '2026-09-28' });
  add('rates', { pair: 'Euros to pounds', as_of: '2026-10-12' });

  const out = value<Answer>(await exceptions(api, owner));
  assert.equal(out.exceptions.length, 1, JSON.stringify(out));
  const one = out.exceptions[0]!;
  assert.equal(one.kind, 'stale');
  assert.equal(one.subject, 'Dollars to pounds');
  assert.equal(one.since, '28 September');
  assert.match(one.said, /Dollars to pounds in Rates is dated 28 September, 15 days ago\. Rates is kept no older than seven days\./u);
  assert.deepEqual(one.row, { name: 'Dollars to pounds', id: 'rates#1' });
  assert.doesNotMatch([one.subject, one.said, one.since].join(' '), /[0-9A-HJKMNP-TV-Z]{26}|\d{4}-\d{2}-\d{2}|#/u);

  /* A LIST WITH NO WINDOW DECLARED IS NEVER OUT OF DATE, and somebody the list is closed to is not told. */
  assert.deepEqual(value<Answer>(await exceptions(api, shut)), { exceptions: [] });
  sql.close();
});

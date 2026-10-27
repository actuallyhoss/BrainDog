/**
 * What went quiet, drawn as a block on a page, through the record: the kernel's `exceptions` source read by
 * the record's own `page`, for the owner and for somebody held from a list.
 *
 * THE BLOCK NAMES EVERY LIST, so it is drawn only for a reader of all of them. Somebody invited to one list is told so
 * in a sentence about the block, and is handed no row of it: not the quiet list's name, not the day it stopped.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 13, 12);

const NUMBERS = { id: 'register.figures', kind: 'register' as const, body: { id: 'figures', name: 'Numbers', title: 'label', fields: [{ id: 'label', type: 'text', required: true }, { id: 'value', type: 'int' }] } as never };
const THINGS = { id: 'register.things', kind: 'register' as const, body: { id: 'things', name: 'Projects', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] } as never };
const HEALTH = {
  id: 'page.health',
  kind: 'page' as const,
  body: { page: 'health', title: 'Health', nav: { section: 'Work', order: 10 }, blocks: [{ kind: 'table', heading: 'Gone quiet', span: 12, source: 'exceptions', empty: 'Nothing has gone quiet.' }] } as never,
};

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
/** Somebody who reads Projects and nothing else. */
const shut: CallContext = { principal: { kind: 'person', id: 'p_3', level: 'read' }, registers: ['things'] };

type Block = { source?: string; rows: { fields: Record<string, unknown> }[]; refusals: { code: string; fix: string }[] };
const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

test('THE BLOCK DRAWS WHAT WENT QUIET FOR A READER OF EVERY LIST, and somebody held from one is told why and handed none of it', async () => {
  const sql = openSqlite();
  const clock = fixedClock(NOW - 20 * DAY);
  const api = await createRecordApi({ sql, clock });
  value(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }));
  value(await api.kernel.install([NUMBERS, THINGS, HEALTH] as never));
  /* Numbers took one a day for ten days and none on the four since. */
  for (let ago = 13; ago >= 4; ago -= 1) {
    clock.set(NOW - ago * DAY - 2 * 3_600_000);
    value(api.kernel.create('figures', { label: `Sessions, day ${String(14 - ago)}`, value: 100 + ago } as never, { actor: 'p_1' }));
  }
  clock.set(NOW);

  const mine = value<{ blocks: Block[] }>(await api.page({ slug: 'health' }, owner)).blocks.find((b) => b.source === 'exceptions')!;
  assert.deepEqual(mine.refusals, []);
  assert.deepEqual(mine.rows.map((r) => r.fields['subject']), ['Numbers']);

  const theirs = await api.page({ slug: 'health' }, shut);
  const text = JSON.stringify(theirs);
  assert.doesNotMatch(text, /Numbers|Sessions|2026-10-09/u, 'somebody held from the list was told it went quiet');
  if (theirs.ok) {
    const held = value<{ blocks: Block[] }>(theirs).blocks.find((b) => b.source === 'exceptions');
    assert.deepEqual(held?.rows ?? [], []);
    assert.match(text, /What went quiet across this BrainDog is shown to people who can read all of it\./u);
  }
  sql.close();
});

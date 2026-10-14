/**
 * The search method's meaning (ENG-B18), wired through `RecordDeps.meaning`: with no `meaning`, or one that says no,
 * the hits are the words' hits exactly as before; with one that answers, a row that shares no word with the query is
 * fused in and marked `by: 'meaning'`, and the answer says how it searched. The host's `meaning` is a fake here: no
 * model is called.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Entry } from '@braindog/kernel';

import { createRecordApi, type CallContext } from '../src/index.ts';
import type { Meaning } from '../src/near.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 14, 12);
const MODEL = 'fake-concepts';
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

type Found = { hits: { seq: number; title: string; by?: 'meaning' }[]; meaning?: string };

/** A record with two notes, one about the car's insurance with a vector on the "car" axis, and `meaning` as given. */
async function record(meaning: Meaning | undefined) {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW), ...(meaning ? { meaning } : {}) });
  value(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }));
  value(
    await api.kernel.install([
      { id: 'register.notes', kind: 'register', body: { id: 'notes', name: 'Notes', title: 'subject', search: ['subject'], fields: [{ id: 'subject', type: 'text', required: true }] } },
    ] as never),
  );
  const add = (subject: string, vec: number[]) => {
    const row = value<Entry>(api.kernel.create('notes', { subject } as never, { actor: 'p_1' }));
    const v = Int8Array.from(vec);
    sql.exec(
      'INSERT OR REPLACE INTO entry_vec (id, register, dims, vec, model, built_at) VALUES (?, ?, ?, ?, ?, ?)',
      row.id,
      'notes',
      v.length,
      new Uint8Array(v.buffer, v.byteOffset, v.byteLength),
      MODEL,
      new Date(NOW).toISOString(),
    );
    return row;
  };
  add('Renew the car insurance', [90, 90, 0, 0]);
  add('Groceries: bread and milk', [0, 0, 90, 0]);
  return api;
}

const asked: string[] = [];
const near: Meaning = async (q) => {
  asked.push(q);
  return { ok: true, vector: { model: MODEL, dims: 4, vec: Int8Array.from([90, 90, 0, 0]) } };
};

test('NO MEANING IS TODAY: the words find nothing, and the answer says `none`', async () => {
  const api = await record(undefined);
  const found = value<Found>(await api.search({ q: 'vehicle cover' }, owner));
  assert.deepEqual(found.hits, []);
  assert.equal(found.meaning, 'none');
});

test('HIS SWITCH OFF IS THE WORDS ALONE: no hit by meaning, and the answer says `off`', async () => {
  const api = await record(async () => ({ ok: false, why: 'off' }));
  const found = value<Found>(await api.search({ q: 'vehicle cover' }, owner));
  assert.deepEqual(found.hits, []);
  assert.equal(found.meaning, 'off');
  const words = value<Found>(await api.search({ q: 'groceries' }, owner));
  assert.deepEqual(words.hits.map((h) => [h.title, h.by]), [['Groceries: bread and milk', undefined]]);
});

test('A MEANING THAT ANSWERS FUSES THE NEAREST ROW IN, marked `by: meaning`, and only the words that fell short ask it', async () => {
  asked.length = 0;
  const api = await record(near);
  const found = value<Found>(await api.search({ q: 'vehicle cover' }, owner));
  assert.deepEqual(found.hits.map((h) => [h.title, h.by]), [['Renew the car insurance', 'meaning']]);
  assert.equal(found.meaning, 'fused');
  assert.deepEqual(asked, ['vehicle cover']);
});

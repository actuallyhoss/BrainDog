/**
 * Search by meaning (`src/near.ts`): the rows nearest a query's own vector, and their fusion with the word hits.
 *
 * On a real record over `openSqlite`, with vectors planted in `entry_vec` by a fake concept embedder: one axis for a
 * car, one for insurance, one for food, so "vehicle cover" lies on the same line as "Renew the car insurance". No model
 * is called anywhere; the host's `Meaning` is a fake that answers that embedder's vector, or a no, or throws.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Entry } from '@braindog/kernel';

import { createRecordApi } from '../src/index.ts';
import { byMeaning, nearest, NEAR_WHEN_FEWER, type Meaning, type QueryVector } from '../src/near.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { COMPANIES } from '../../../fixtures/names.ts';

const NOW = Date.UTC(2026, 9, 14, 12);
const INSURER = COMPANIES[3];
const MODEL = 'fake-concepts';

const register = (id: string, name: string) => ({
  id: `register.${id}`,
  kind: 'register' as const,
  body: { id, name, title: 'subject', search: ['subject'], fields: [{ id: 'subject', type: 'text', required: true }] } as never,
});

/** The fake embedder's concepts, one axis each, and the words that mean them. */
const AXES: Record<string, number> = { car: 0, vehicle: 0, insurance: 1, cover: 1, bread: 2, groceries: 2, milk: 2 };

function embed(text: string, dims = 4): Int8Array {
  const v = new Int8Array(dims);
  for (const word of text.toLowerCase().split(/[^a-z]+/u)) {
    const at = AXES[word];
    if (at !== undefined && at < dims) v[at] = 90;
  }
  if (v.every((x) => x === 0)) v[dims - 1] = 90;
  return v;
}

const query = (q: string, dims = 4, model = MODEL): QueryVector => ({ model, dims, vec: embed(q, dims) });

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  value(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }));
  value(await api.kernel.install([register('notes', 'Notes'), register('private', 'Private')] as never));
  let built = 0;
  /** A row, and its vector planted as the hourly sweep would, each one built a minute after the last. */
  const add = (reg: string, subject: string, opts: { model?: string; dims?: number } = {}) => {
    const row = value<Entry>(api.kernel.create(reg, { subject } as never, { actor: 'p_1' }));
    const dims = opts.dims ?? 4;
    const v = embed(subject, dims);
    sql.exec(
      'INSERT OR REPLACE INTO entry_vec (id, register, dims, vec, model, built_at) VALUES (?, ?, ?, ?, ?, ?)',
      row.id,
      reg,
      dims,
      new Uint8Array(v.buffer, v.byteOffset, v.byteLength),
      opts.model ?? MODEL,
      new Date(NOW + 60_000 * built++).toISOString(),
    );
    return row;
  };
  return { api, sql, add };
}

async function garage() {
  const r = await record();
  const insurance = r.add('notes', `Renew the car insurance with ${INSURER}`);
  const wash = r.add('notes', 'Car wash on Saturday');
  const groceries = r.add('notes', 'Groceries: bread and milk');
  return { ...r, insurance, wash, groceries };
}

test('"VEHICLE COVER" PUTS THE CAR INSURANCE FIRST, though it shares no word with it, and an unrelated row under the floor is dropped', async () => {
  const { sql, insurance, wash } = await garage();
  const near = nearest(sql, query('vehicle cover'));
  assert.deepEqual(near.map((n) => n.id), [insurance.id, wash.id], 'the groceries are nothing like a vehicle cover and are under the floor');
  assert.ok((near[0]?.score ?? 0) > (near[1]?.score ?? 0));
  sql.close();
});

test('A ROW IN A LIST NOT GIVEN NEVER COMES BACK, and an empty list of lists answers nothing', async () => {
  const { sql, add, insurance } = await garage();
  const hidden = add('private', 'The car insurance claim');
  assert.ok(nearest(sql, query('vehicle cover')).some((n) => n.id === hidden.id), 'unscoped, the private row is near');
  const scoped = nearest(sql, query('vehicle cover'), { registers: ['notes'] });
  assert.equal(scoped.some((n) => n.id === hidden.id), false);
  assert.equal(scoped[0]?.id, insurance.id);
  assert.deepEqual(nearest(sql, query('vehicle cover'), { registers: [] }), []);
  sql.close();
});

test('A DELETED ROW NEVER COMES BACK, though its vector is still in the index', async () => {
  const { sql, insurance, wash } = await garage();
  sql.exec('UPDATE entry SET deleted_at = ? WHERE id = ?', new Date(NOW).toISOString(), insurance.id);
  assert.deepEqual(nearest(sql, query('vehicle cover')).map((n) => n.id), [wash.id]);
  sql.close();
});

test('A VECTOR OF ANOTHER MODEL OR ANOTHER WIDTH IS IGNORED', async () => {
  const { sql, add, insurance, wash } = await garage();
  const other = add('notes', 'Car insurance quote', { model: 'another-model' });
  const wide = add('notes', 'Vehicle insurance papers', { dims: 6 });
  const ids = nearest(sql, query('vehicle cover')).map((n) => n.id);
  assert.deepEqual(ids, [insurance.id, wash.id]);
  assert.equal(ids.includes(other.id) || ids.includes(wide.id), false);
  /* Asked in the other width, only the wide one answers. */
  assert.deepEqual(nearest(sql, query('vehicle cover', 6)).map((n) => n.id), [wide.id]);
  sql.close();
});

test('AT MOST `most` VECTORS ARE READ, NEWEST FIRST: with five of six read, the oldest is never scored', async () => {
  const { sql, add } = await record();
  const oldest = add('notes', 'Car insurance from last year');
  const rest = ['Car cover renewal', 'Vehicle insurance letter', 'Insurance for the car', 'Car insurance card', 'Cover note for the vehicle'].map((s) => add('notes', s));
  const all = nearest(sql, query('vehicle cover'), { take: 10 });
  assert.equal(all.length, 6);
  const five = nearest(sql, query('vehicle cover'), { most: 5, take: 10 }).map((n) => n.id);
  assert.equal(five.length, 5);
  assert.equal(five.includes(oldest.id), false);
  assert.deepEqual([...five].sort(), rest.map((r) => r.id).sort());
  /* Ties by id, so the answer is the same every time. */
  assert.deepEqual(five, [...five].sort());
  sql.close();
});

const fake = (answer: Awaited<ReturnType<Meaning>> | 'throw') => {
  const asked: string[] = [];
  const meaning: Meaning = async (q) => {
    asked.push(q);
    if (answer === 'throw') throw new Error('the model is out');
    return answer;
  };
  return { meaning, asked };
};

test('BYMEANING WITH NO WAY TO ASK answers `none` and exactly the hits rerank gave', async () => {
  const { api, sql } = await garage();
  const hits = api.kernel.searchMatched('saturday').hits;
  assert.equal(hits.length, 1);
  const out = await byMeaning(sql, undefined, 'saturday', hits, {});
  assert.equal(out.meaning, 'none');
  assert.deepEqual(out.hits, hits);
  sql.close();
});

test(`${NEAR_WHEN_FEWER} WORD HITS ANSWER \`words\`, and the model is never asked`, async () => {
  const { sql } = await garage();
  const hits = Array.from({ length: NEAR_WHEN_FEWER }, (_, i) => ({ id: `hit_${i}`, rank: -5 + i }));
  const { meaning, asked } = fake({ ok: true, vector: query('vehicle cover') });
  const out = await byMeaning(sql, meaning, 'vehicle cover', hits, {});
  assert.equal(out.meaning, 'words');
  assert.deepEqual(out.hits, hits);
  assert.deepEqual(asked, []);
  sql.close();
});

test('NO WORD HITS AND A VECTOR ANSWER `fused`, the car insurance first and marked as found by meaning', async () => {
  const { api, sql, insurance, wash } = await garage();
  const hits = api.kernel.searchMatched('vehicle cover').hits;
  assert.deepEqual(hits, [], 'before: the words alone find nothing');
  const { meaning, asked } = fake({ ok: true, vector: query('vehicle cover') });
  const out = await byMeaning(sql, meaning, 'vehicle cover', hits, {});
  assert.equal(out.meaning, 'fused');
  assert.deepEqual(asked, ['vehicle cover'], 'asked once');
  assert.deepEqual(out.hits, [
    { id: insurance.id, rank: 0, by: 'meaning' },
    { id: wash.id, rank: 0, by: 'meaning' },
  ]);
  /* Held to the lists given. */
  const none = await byMeaning(sql, meaning, 'vehicle cover', hits, { registers: ['private'] });
  assert.deepEqual(none, { hits: [], meaning: 'fused' });
  sql.close();
});

test('A NO FROM THE HOST ANSWERS ITS REASON with the hits unchanged, and a throw reads as `failed`', async () => {
  const { api, sql } = await garage();
  const hits = api.kernel.searchMatched('saturday').hits;
  for (const why of ['off', 'spent', 'failed'] as const) {
    const out = await byMeaning(sql, fake({ ok: false, why }).meaning, 'saturday', hits, {});
    assert.deepEqual(out, { hits, meaning: why });
  }
  assert.deepEqual(await byMeaning(sql, fake('throw').meaning, 'saturday', hits, {}), { hits, meaning: 'failed' });
  /* A vector whose values are not its stated width is no vector. */
  const bent = { ok: true as const, vector: { model: MODEL, dims: 8, vec: new Int8Array(4) } };
  assert.deepEqual(await byMeaning(sql, fake(bent).meaning, 'saturday', hits, {}), { hits, meaning: 'failed' });
  sql.close();
});

test('A ROW FOUND BOTH WAYS APPEARS ONCE, as its word hit with no `by`', async () => {
  const { api, sql, insurance, wash } = await garage();
  const hits = api.kernel.searchMatched('insurance').hits;
  assert.deepEqual(hits.map((h) => h.id), [insurance.id]);
  const out = await byMeaning(sql, fake({ ok: true, vector: query('vehicle cover') }).meaning, 'insurance', hits, {});
  assert.equal(out.meaning, 'fused');
  assert.deepEqual(out.hits.map((h) => h.id), [insurance.id, wash.id]);
  assert.deepEqual(out.hits[0], hits[0], 'the word hit itself, unmarked');
  assert.equal('by' in (out.hits[0] as object), false);
  assert.equal((out.hits[1] as { by?: string }).by, 'meaning');
  sql.close();
});

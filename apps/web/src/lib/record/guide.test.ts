/**
 * The New project guide's pages in the two engines: a real record made from a sentence, with an agent's work in it, and
 * this app's sample engine holding the same declarations and rows. The Guide, its Home and the page of the milestone
 * underway must draw the same blocks, figures and rows in both, and how far each milestone is must fill the same.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Kernel } from '@braindog/kernel';
import { NOW } from '@braindog/seed';
import { useCase } from '@braindog/seed/usecases';
import { carriedDocument, dayOf, formedFor } from '@braindog/seed/usecases/install';
import { linkExamples } from '@braindog/seed/usecases/links';

import { page, pages } from './fixtures/readers.ts';
import { ROWS } from './data.ts';
import { PAGES, REGISTERS } from './data.ts';
import { METRICS } from './declared.ts';
import { toSegments } from './blocks.ts';
import { blockOf } from './page-live.ts';
import { refMapOf, type RefMap } from './remote.ts';
import type { Entry } from './schema.ts';

type Sql = Parameters<typeof openRecord>[0];

function openSqlite(): Sql {
  const db = new DatabaseSync(':memory:');
  let depth = 0;
  return {
    exec: (text: string, ...params: unknown[]) => {
      if (params.length === 0) db.exec(text);
      else db.prepare(text).run(...(params as never[]));
    },
    all: (text: string, ...params: unknown[]) => db.prepare(text).all(...(params as never[])),
    one: (text: string, ...params: unknown[]) => db.prepare(text).get(...(params as never[])),
    transactionSync<T>(fn: () => T): T {
      if (depth > 0) return fn();
      db.exec('BEGIN');
      depth++;
      try {
        const value = fn();
        db.exec('COMMIT');
        return value;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      } finally {
        depth--;
      }
    },
  } as unknown as Sql;
}

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string; at?: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value;
};

type Row = { id: string; seq: number | null; fields: Record<string, unknown> };
const rows = (k: Kernel, register: string): Row[] => value<{ rows: Row[] }>(k.list({ register, limit: 200 })).rows;
const titled = (k: Kernel, register: string, field: string, title: string): Row => rows(k, register).find((r) => r.fields[field] === title)!;

const SAID = 'I want to start a podcast about local history';
const TODAY = dayOf(NOW);
const LISTS = ['milestones', 'steps', 'choices', 'resources'];

/** A guide record made from the sentence, with a person's and an agent's work in it. */
const kernel = (async () => {
  const k = await openRecord(openSqlite(), { now: () => NOW });
  const guide = useCase('guide')!;
  const doc = carriedDocument(guide, TODAY, SAID);
  const pack = value<Pack>(await normalise(doc, { kind: 'local' }));
  const state: Installed = { format: 1, primitives: 1, record_version: k.version(), packs: k.packs(), declarations: k.declarations() as Installed['declarations'], rows: k.census(), config: k.packSettings() };
  const diff = await plan(pack, state);
  const host: Host = {
    count: (register) => k.count(register),
    stage: (batch) => k.stageInstall(batch as never),
    transaction: (fn) => k.transaction(fn),
    reload: () => k.reload(),
    retire: (ids) => k.retire(ids),
    seed: (register, fields) => k.create(register, { ...fields, tags: ['example'] }, { actor: 'p_seed', cascade: false }) as never,
    remember: (row) => k.rememberPack(row),
    forget: (id) => k.forgetPack(id),
    claimed: (p) => k.packClaims(p),
  };
  value(await install(pack, diff, host, diff.planHash));
  await linkExamples(
    { rows: async (register) => rows(k, register), link: async (register, seq, field, spoken) => k.update(register, `${register}#${seq}`, { [field]: spoken }, { actor: 'p_owner' }).ok },
    'guide',
    { links: formedFor(guide, SAID)!.links },
  );
  const agent = { actor: 'agent:claude' };
  const listen = titled(k, 'steps', 'what', 'Listen to three shows like yours and note what works');
  value(k.update('steps', `steps#${listen.seq}`, { agent: 'claude', state: 'done' }, agent));
  const sentence = titled(k, 'steps', 'what', 'Write one sentence about the show and who will listen');
  value(k.update('steps', `steps#${sentence.seq}`, { state: 'blocked', waiting_on: 'A name for the show' }, { actor: 'p_owner' }));
  const format = titled(k, 'choices', 'question', 'Alone, with a co-host, or with guests?');
  value(k.update('choices', `choices#${format.seq}`, { state: 'made', picked: 'With a guest each episode', why: 'Guests bring listeners.' }, agent));
  return k;
})();

/** The sample engine holding what the record holds: its declarations, and its rows with each link as the row's number. */
async function sampleLikeRecord(k: Kernel): Promise<void> {
  for (const d of k.declarations() as { id: string; kind: string; body: string | Record<string, unknown> }[]) {
    const id = d.id.slice(d.id.indexOf('.') + 1);
    const body = (typeof d.body === 'string' ? JSON.parse(d.body) : d.body) as Record<string, unknown>;
    if (d.kind === 'register' && LISTS.includes(id)) (REGISTERS as Record<string, unknown>)[id] = { ...body, id };
    if (d.kind === 'metric' && id.startsWith('guide-')) (METRICS as Record<string, unknown>)[id] = { ...body, metric: id };
    if (d.kind === 'page' && (id === 'guide' || id === 'home-guide' || id === 'milestone')) (PAGES as Record<string, unknown>)[id] = { ...body, page: id };
  }
  const seqs = new Map(LISTS.flatMap((l) => rows(k, l).map((r) => [r.id, r.seq] as const)));
  for (const list of LISTS) {
    const refs = new Set((REGISTERS[list]!.fields as { id: string; type: string }[]).filter((f) => f.type === 'ref').map((f) => f.id));
    ROWS[list] = rows(k, list).map((r): Entry => ({
      seq: r.seq!,
      fields: Object.fromEntries(Object.entries(r.fields).map(([f, v]) => [f, refs.has(f) && typeof v === 'string' ? (seqs.get(v) ?? v) : v])) as Entry['fields'],
      version: 1,
      created: new Date(NOW).toISOString(),
      by: 'you',
    }));
  }
}

const digits = (v: unknown) => String(v ?? '').replace(/[^0-9-]/gu, '');
const titleOf = (fields: Record<string, unknown>) => String(fields.what ?? fields.question ?? fields.name ?? '');

type Answered = Parameters<typeof blockOf>[0] & { heading?: string; kind: string; drawn?: boolean; matched?: number; refusals?: unknown[]; rows?: Row[]; readings?: { reading?: { value?: unknown } }[] };

test('THE GUIDE, ITS HOME AND THE MILESTONE UNDERWAY DRAW THE SAME BLOCKS, FIGURES AND ROWS IN BOTH ENGINES', async () => {
  const k = await kernel;
  await sampleLikeRecord(k);
  const underway = (k.pages() as { slug: string }[]).map((p) => p.slug).find((s) => s.startsWith('say-what-the-show'));
  assert.ok(underway, 'the record has a page for the milestone underway');
  assert.ok(pages()[underway], `the sample has no /p/${underway}: ${Object.keys(pages()).filter((s) => s.startsWith('say')).join(', ')}`);

  const refs = new Map<string, RefMap>(LISTS.map((l) => [l, refMapOf(l, rows(k, l))]));
  for (const slug of ['guide', 'home-guide', underway]) {
    const record = value<{ blocks: Answered[] }>(k.page(slug)).blocks;
    const demo = page(slug)!;
    assert.equal(demo.blocks.length, record.length, slug);
    record.forEach((kb, i) => {
      const wb = demo.blocks[i]!;
      const at = `${slug}: ${String(kb.heading)}`;
      assert.deepEqual(kb.refusals ?? [], [], `${at}, the record: ${JSON.stringify(kb.refusals)}`);
      assert.deepEqual(wb.refusals, [], `${at}, the sample: ${wb.refusals.join('; ')}`);
      assert.equal(wb.drawn !== false, kb.drawn !== false, `${at}: drawn in one engine and not the other`);
      if (kb.drawn === false) return;
      if (kb.kind === 'stat') {
        assert.deepEqual(wb.metrics?.map((m) => digits(m.value)), (kb.readings ?? []).map((r) => digits(r.reading?.value)), at);
        return;
      }
      if (kb.kind === 'series') return;
      assert.equal(wb.total, kb.matched, `${at}: how many matched`);
      assert.deepEqual(wb.entries.map((e) => titleOf(e.fields)), (kb.rows ?? []).map((r) => titleOf(r.fields)), `${at}: the rows, in order`);
      if (kb.kind === 'progress') {
        const live = JSON.stringify(toSegments(blockOf(kb, refs, NOW)));
        const sample = JSON.stringify(toSegments(wb));
        assert.equal(sample, live, `${at}: each milestone fills the same`);
      }
    });
  }
});

test('HOW FAR EACH MILESTONE IS COUNTS A STEP DONE BY THE STATES THE LIST CALLS DONE', async () => {
  const k = await kernel;
  await sampleLikeRecord(k);
  const progress = page('guide')!.blocks.find((b) => b.heading === 'How far each milestone is')!;
  const said = JSON.stringify(toSegments(progress));
  /* THE FIRST MILESTONE HAS TWO STEPS, ONE DONE BY THE AGENT AND ONE BLOCKED; THE SECOND TWO, NEITHER DONE. */
  assert.match(said, /Say what the show is about and who will listen/u);
  assert.match(said, /"1"[^\]]*"2"|1 \| 2/u, said);
});

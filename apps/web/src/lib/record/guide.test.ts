/**
 * The New project guide's pages: a real record made from a sentence, with an agent's work in it, drawn the way a live
 * page draws the record's answer. The Guide, its Home and the page of the milestone underway must draw the blocks,
 * figures and rows the record answered, and how far each milestone is must count what the list calls done.
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

import './fixtures/fill.ts';
import { REGISTERS } from './held.ts';
import { toSegments } from './blocks.ts';
import { blockOf } from './page-live.ts';
import { refMapOf, type RefMap } from './remote.ts';

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

const digits = (v: unknown) => String(v ?? '').replace(/[^0-9-]/gu, '');
const titleOf = (fields: Record<string, unknown>) => String(fields.what ?? fields.question ?? fields.name ?? '');

type Answered = Parameters<typeof blockOf>[0] & { heading?: string; kind: string; drawn?: boolean; matched?: number; refusals?: unknown[]; rows?: Row[]; readings?: { reading?: { value?: unknown } }[] };

/**
 * ONE ENGINE NOW, AND THIS WAS TWO. The sample was a second engine in this app that these tests filled with the
 * record's declarations and rows and held to the record's answer. `fixtures/readers.ts` now asks a kernel seeded once
 * with the sample and never written to, so a guide record's pages cannot reach it and there is nothing second to hold
 * equal. What stays is the half a person sees: the record's answer for each page, drawn the way a live page draws it
 * (`page-live.ts`), refusing nothing and saying the same figures and rows the record answered.
 */
const drawnOf = (k: Kernel, slug: string): { record: Answered[]; drawn: ReturnType<typeof blockOf>[] } => {
  /* THE PAGE LEARNS THE LISTS IT DRAWS, as a live tab learns them from the record before drawing a block over one. */
  for (const d of k.declarations() as { id: string; kind: string; body: string | Record<string, unknown> }[]) {
    const id = d.id.slice(d.id.indexOf('.') + 1);
    if (d.kind !== 'register' || !LISTS.includes(id)) continue;
    const body = (typeof d.body === 'string' ? JSON.parse(d.body) : d.body) as Record<string, unknown>;
    (REGISTERS as Record<string, unknown>)[id] = { ...body, id };
  }
  const refs = new Map<string, RefMap>(LISTS.map((l) => [l, refMapOf(l, rows(k, l))]));
  const record = value<{ blocks: Answered[] }>(k.page(slug)).blocks;
  return { record, drawn: record.map((kb) => blockOf(kb, refs, NOW)) };
};

test('THE GUIDE, ITS HOME AND THE MILESTONE UNDERWAY DRAW THE BLOCKS, FIGURES AND ROWS THE RECORD ANSWERED', async () => {
  const k = await kernel;
  const underway = (k.pages() as { slug: string }[]).map((p) => p.slug).find((s) => s.startsWith('say-what-the-show'));
  assert.ok(underway, 'the record has a page for the milestone underway');

  for (const slug of ['guide', 'home-guide', underway]) {
    const { record, drawn } = drawnOf(k, slug);
    assert.ok(record.length > 0, `${slug} answered no block`);
    record.forEach((kb, i) => {
      const wb = drawn[i]!;
      const at = `${slug}: ${String(kb.heading)}`;
      assert.deepEqual(kb.refusals ?? [], [], `${at}, the record: ${JSON.stringify(kb.refusals)}`);
      assert.deepEqual(wb.refusals, [], `${at}, as drawn: ${wb.refusals.join('; ')}`);
      assert.equal(wb.drawn !== false, kb.drawn !== false, `${at}: the record drew it and the page did not, or the other way`);
      if (kb.drawn === false) return;
      if (kb.kind === 'stat') {
        assert.deepEqual(wb.metrics?.map((m) => digits(m.value)), (kb.readings ?? []).map((r) => digits(r.reading?.value)), at);
        return;
      }
      if (kb.kind === 'series') return;
      assert.equal(wb.total, kb.matched, `${at}: how many matched`);
      assert.deepEqual(wb.entries.map((e) => titleOf(e.fields)), (kb.rows ?? []).map((r) => titleOf(r.fields)), `${at}: the rows, in order`);
    });
  }
});

test('HOW FAR EACH MILESTONE IS COUNTS A STEP DONE BY THE STATES THE LIST CALLS DONE', async () => {
  const k = await kernel;
  const { record, drawn } = drawnOf(k, 'guide');
  const at = record.findIndex((b) => b.heading === 'How far each milestone is');
  assert.ok(at >= 0, 'the guide no longer draws how far each milestone is');
  const said = JSON.stringify(toSegments(drawn[at]!));
  /* THE FIRST MILESTONE HAS TWO STEPS, ONE DONE BY THE AGENT AND ONE BLOCKED; THE SECOND TWO, NEITHER DONE. */
  assert.match(said, /Say what the show is about and who will listen/u);
  assert.match(said, /"1"[^\]]*"2"|1 \| 2/u, said);
});

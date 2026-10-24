/**
 * A PROJECT'S KIND OFFERS ITS KEY NUMBERS AS DRAFTS (B27 of the 24 October scope; the KPI plan of 21 October, 2.7).
 *
 * Read on a fresh record with Projects as its pack document says it: setting a project's kind to client work starts
 * `script.kind_drafts`, which files one question with the four drafts the plan names for client work and writes no key
 * number; accepting it makes four drafts; a project that already holds a key number, or a second run, asks nothing new.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan as planOf, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Entry, type Kernel } from '@braindog/kernel';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { AUTOMATIONS, NOW, firstPartyDocument } from '../src/index.ts';
import { KIND_DRAFTS_RULE, KIND_DRAFTS_SCRIPT, kindDrafts } from '../src/modules/portfolio/kind-drafts.js';

type Fields = Record<string, unknown>;
const OWNER = { actor: 'p_1' };
const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string; at?: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value;
};
const hostFor = (k: Kernel): Host => ({
  count: (register) => k.count(register),
  stage: (batch) => k.stageInstall(batch as never),
  transaction: (fn) => k.transaction(fn),
  reload: () => k.reload(),
  retire: (ids) => k.retire(ids),
  seed: (register, fields) => k.create(register, { ...fields, tags: ['example'] }, { actor: 'p_seed', cascade: false }) as never,
  remember: (row) => k.rememberPack(row),
  forget: (id) => k.forgetPack(id),
  claimed: (pack) => k.packClaims(pack),
});

async function projects() {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const pack = value<Pack>(await normalise(firstPartyDocument('portfolio', { seeds: [] }) as never, { kind: 'local' }));
  const state: Installed = { format: 1, primitives: 1, record_version: k.version(), packs: k.packs(), declarations: k.declarations() as Installed['declarations'], rows: k.census() };
  const diff = await planOf(pack, state);
  value(await install(pack, diff, hostFor(k), diff.planHash));
  const ACTOR = `script:${String(KIND_DRAFTS_SCRIPT.script)}@v1`;
  const mod = (await import(`data:text/javascript,${encodeURIComponent(KIND_DRAFTS_SCRIPT.source as string)}`)) as { default: (c: unknown) => Promise<unknown> };
  const logs: string[] = [];
  const shaped = (e: Entry) => ({ id: e.id, register: e.register, seq: e.seq!, version: e.version, fields: e.fields });
  const run = (project: string) =>
    mod.default({
      input: { project },
      record: {
        get: async (said: string) => {
          const e = k.get(said);
          return e ? shaped(e) : null;
        },
        list: async (register: string, where?: unknown) => value<{ rows: Entry[] }>(k.list({ register, ...(where === undefined ? {} : { where: where as never }) })).rows.map(shaped),
      },
      update: () => assert.fail('the offer changes nothing'),
      propose: async (p: { question: string; body_kind: 'rowset'; body: Fields; cause: string }) => k.propose(p, ACTOR),
      log: (line: string) => void logs.push(line),
    });
  const queued = (): string[] => sql.all<{ payload: string }>("SELECT payload FROM outbox WHERE kind = 'script.run' ORDER BY rowid").map((r) => (JSON.parse(r.payload) as { script: string }).script);
  const open = () => value<{ id: string; body_kind: string; cause?: string | null }[]>(k.openSuggestions()).filter((q) => String(q.cause ?? '').startsWith('kpi-kind:'));
  return { k, run, queued, open, logs };
}

test('the rule and the script are Projects\' own and go into its document together', () => {
  assert.ok(AUTOMATIONS.includes(KIND_DRAFTS_RULE) && AUTOMATIONS.includes(KIND_DRAFTS_SCRIPT));
  const doc = firstPartyDocument('portfolio') as { declarations: Fields[] };
  assert.ok(doc.declarations.some((d) => d.rule === 'kind-offers-kpis') && doc.declarations.some((d) => d.script === 'kind_drafts'));
});

test('setting kind to client work on a project files one question with four drafts, and writes no key number', async () => {
  const p = await projects();
  const marlow = value<Entry>(p.k.create('things', { name: 'Marlow & Co', lane: 'earning' }, OWNER));
  await p.k.drain();
  assert.deepEqual(p.queued(), []);
  value(p.k.update('things', marlow.id, { kind: 'client' }, OWNER));
  await p.k.drain();
  assert.deepEqual(p.queued(), ['kind_drafts']);

  await p.run(marlow.id);
  const asked = p.open();
  assert.equal(asked.length, 1, p.logs.join(' | '));
  assert.equal(asked[0]!.body_kind, 'rowset');
  assert.equal(p.k.count('kpis'), 0);
  const filed = p.k.governanceRow('suggestion', asked[0]!.id) as unknown as { body: string | Fields };
  const body = (typeof filed.body === 'string' ? JSON.parse(filed.body) : filed.body) as { rows: Fields[] };
  assert.deepEqual(body.rows.map((r) => r.name), ['Billed a month', 'Still to come in', 'Hours used', 'Days to next invoice']);
  assert.ok(body.rows.every((r) => r.draft === true && r.thing === marlow.id));

  /* A SECOND RUN JOINS THE ONE WAITING. */
  await p.run(marlow.id);
  assert.equal(p.open().length, 1);

  /* ACCEPTED, THE FOUR ARE DRAFTS, and the project is offered nothing more. */
  value(p.k.decide(asked[0]!.id, { decide: { option: 'accept', reason: 'These.' } }, OWNER.actor));
  assert.equal(p.k.count('kpis'), 4);
  assert.ok(value<{ rows: Entry[] }>(p.k.list({ register: 'kpis' })).rows.every((e) => e.fields.draft === true));
  value(p.k.update('things', marlow.id, { kind: 'business' }, OWNER));
  await p.run(marlow.id);
  assert.equal(p.open().length, 0);
  assert.ok(p.logs.some((l) => l.includes('already has key numbers')), p.logs.join(' | '));
});

test('the decision: four a kind, the first leads, and none for a project with key numbers or no kind', () => {
  const project = (kind?: string) => ({ id: 'e_things_1', fields: { name: 'Kiln', ...(kind ? { kind } : {}) } });
  for (const kind of ['business', 'client', 'product', 'content']) {
    const out = kindDrafts(project(kind), []);
    assert.ok('body' in out, kind);
    assert.equal(out.body.rows.length, 4);
    assert.deepEqual(out.body.rows.map((r) => r.headline), [true, false, false, false]);
    assert.ok(out.question.length <= 280);
    assert.doesNotMatch(out.question, /\u2014/u);
  }
  assert.ok('nothing' in kindDrafts(project(), []));
  assert.ok('nothing' in kindDrafts(project('client'), [{ id: 'e_kpis_1', fields: { thing: 'e_things_1' } }]));
});

/**
 * A project other entries point at is not deleted out from under them (REC-C08 step 5, portfolio 1.16.0).
 *
 * `RETIRED` IS A STATE, THERE IS NO DELETE. Projects declared no delete rule, so a project a task, a bill or
 * a run named was deleted like anything else and left each of them pointing at nothing. Since 1.16.0 the list declares
 * `delete: refuse_while_referenced`, as Accounts does, and the kernel refuses the delete with a sentence that names the
 * lists still pointing at it and how many (`packages/kernel/src/referenced.ts`).
 *
 * DRIVEN THROUGH WHAT INSTALLS: Portfolio and Work as a fresh record is given them, with no example entries, then the
 * write path's own delete. Before 1.16.0 both deletes below went through.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Kernel } from '@braindog/kernel';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { NOW, REGISTERS, firstPartyDocument, firstPartyManifest } from '../src/index.ts';

const PERSON = { actor: 'p_1' };

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

const stateOf = (k: Kernel): Installed => ({
  format: 1,
  primitives: 1,
  record_version: k.version(),
  packs: k.packs(),
  declarations: k.declarations() as Installed['declarations'],
  rows: k.census(),
});

async function put(k: Kernel, doc: unknown): Promise<void> {
  const pack = value<Pack>(await normalise(doc, { kind: 'local' }));
  const diff = await plan(pack, stateOf(k));
  value(await install(pack, diff, hostFor(k), diff.planHash));
}

/** A fresh record holding Projects and Work, and nothing else: no People, no Money, no example entries. */
async function fresh(rule = true): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const lists = (id: 'portfolio' | 'work') => firstPartyManifest(id).provides.filter((p) => p.startsWith('register.')).map((p) => p.slice('register.'.length));
  const holds = [...lists('portfolio'), ...lists('work')];
  const portfolio = firstPartyDocument('portfolio', { seeds: [], holds }) as { declarations: Record<string, unknown>[] };
  /* WITHOUT THE RULE, as 1.15.0 declared Projects, to show the check below is what keeps the project. */
  const declarations = rule ? portfolio.declarations : portfolio.declarations.map(({ delete: _rule, ...d }) => d);
  await put(k, { ...portfolio, declarations });
  await put(k, firstPartyDocument('work', { seeds: [], holds }));
  return k;
}

const gone = (k: Kernel, spoken: string) => k.update('things', spoken, { deleted_at: true }, PERSON);

test('PROJECTS DECLARES THE RULE, in the module and in the document a record installs', () => {
  assert.equal(REGISTERS.things?.delete, 'refuse_while_referenced');
  const doc = firstPartyDocument('portfolio') as { declarations: Record<string, unknown>[] };
  assert.equal(doc.declarations.find((d) => d.register === 'things')?.delete, 'refuse_while_referenced');
});

test('A PROJECT WITH ONE TASK ON IT IS NOT DELETED, and the sentence names Tasks and how many', async () => {
  const k = await fresh();
  const project = value<{ seq: number }>(k.create('things', { name: 'Harbour', lane: 'building' }, PERSON));
  const spoken = `things#${project.seq}`;
  value(k.create('tasks', { what: 'Ship the first build', thing: spoken }, PERSON));

  const refused = gone(k, spoken);
  assert.equal(refused.ok, false, 'a project a task points at was deleted');
  const { code, fix } = (refused as { refusal: { code: string; fix: string } }).refusal;
  assert.equal(code, 'DELETE_WHILE_REFERENCED');
  assert.match(fix, /\b1 \w+ in Tasks\b/u, fix);
  assert.ok(!/things#|tasks#|[0-9A-HJKMNP-TV-Z]{26}/u.test(fix), `the sentence names an id: ${fix}`);
  assert.equal(k.get(spoken)?.fields.name, 'Harbour', 'the project is still there');
});

test('ONCE NOTHING POINTS AT IT, IT GOES, and it comes back', async () => {
  const k = await fresh();
  const project = value<{ seq: number }>(k.create('things', { name: 'Lantern', lane: 'parked' }, PERSON));
  const spoken = `things#${project.seq}`;
  const task = value<{ seq: number }>(k.create('tasks', { what: 'Write the brief', thing: spoken }, PERSON));
  assert.equal(gone(k, spoken).ok, false);

  /* THE TASK IS POINTED ELSEWHERE, so the project holds nothing up. */
  value(k.update('tasks', `tasks#${task.seq}`, { thing: null }, PERSON));
  value(gone(k, spoken));
  assert.equal(k.get(spoken) ?? null, null, 'the project was not deleted');

  /* A RESTORE IS NEVER ASKED ABOUT. */
  value(k.update('things', spoken, { deleted_at: null }, PERSON));
  assert.equal(k.get(spoken)?.fields.name, 'Lantern', 'the project did not come back');
});

test('A PROJECT NOTHING POINTS AT IS DELETED AS BEFORE', async () => {
  const k = await fresh();
  const project = value<{ seq: number }>(k.create('things', { name: 'Quiet one', lane: 'retired' }, PERSON));
  value(gone(k, `things#${project.seq}`));
});

test('WITHOUT THE RULE, AS BEFORE 1.16.0, the same delete goes through and leaves the task pointing at nothing', async () => {
  const k = await fresh(false);
  const project = value<{ seq: number }>(k.create('things', { name: 'Harbour', lane: 'building' }, PERSON));
  const spoken = `things#${project.seq}`;
  value(k.create('tasks', { what: 'Ship the first build', thing: spoken }, PERSON));
  value(gone(k, spoken));
});

/**
 * A number dated after today is not a number reported (founder-bound-66, audit 64 claim 7).
 *
 * The founder's four counts of numbers (`datapoints-7d`, `datapoints-30d`, `datapoints-reported` and
 * `project-numbers-7d`) end today, by Estate's own clause (`at before tomorrow`), as `service-numbers` has since
 * founder-numbers-edge-64. RED FIRST: without the clause the week counted two readings dated tomorrow and next year.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handedOf, install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Kernel } from '@braindog/kernel';
import { fixedClock, openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';
import { NOW, firstPartyManifest } from '../src/index.ts';
import { modulesFor, useCase } from '../src/usecases/index.ts';
import { carriedDocument, dayOf, moduleDocument } from '../src/usecases/install.ts';

const TODAY = dayOf(NOW);
const OWNER = { actor: 'p_1' };
const DAY = 86_400_000;
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
const sqlOf = new WeakMap<Kernel, NodeSql>();
const stateOf = (k: Kernel): Installed => ({
  format: 1, primitives: 1, record_version: k.version(), packs: k.packs(),
  declarations: k.declarations() as Installed['declarations'], rows: k.census(), config: k.packSettings(),
  handed: handedOf((sqlOf.get(k)?.all<{ manifest: string }>('SELECT manifest FROM pack') ?? []).map((r) => r.manifest)),
});
const held = (k: Kernel): string[] => (k.declarations() as { id: string; kind: string }[]).filter((d) => d.kind === 'register').map((d) => d.id.slice('register.'.length));
async function put(k: Kernel, doc: unknown): Promise<void> {
  const pack = value<Pack>(await normalise(doc, { kind: 'local' }));
  const diff = await plan(pack, stateOf(k));
  value(await install(pack, diff, hostFor(k), diff.planHash));
}
async function founder(): Promise<Kernel> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  sqlOf.set(k, sql);
  const u = useCase('founder')!;
  for (const m of modulesFor(u, ['people'])) {
    if (m === 'agents') continue;
    const holds = new Set([...held(k), ...firstPartyManifest(m as never).provides.flatMap((p) => (p.startsWith('register.') ? [p.slice(9)] : []))]);
    await put(k, moduleDocument(u, m, { today: TODAY, holds, examples: false }));
  }
  await put(k, carriedDocument(u, TODAY, null, { examples: false }));
  return k;
}
const figure = (k: Kernel, id: string): number | null => value<{ value: number | null }>(k.metric(k.metricDecl(id)!)).value;
type Drawn = { kind: string; heading?: string; drawn?: boolean; refusals?: unknown[]; readings?: { metric: string; reading: { value: unknown } | null }[] };

test('A NUMBER DATED AFTER TODAY IS NOT A NUMBER REPORTED: tomorrow and next year are left out of the week, the month, all of them, and a project', async () => {
  const k = await founder();
  const harbour = value<{ id: string }>(k.create('things', { name: 'Harbour', lane: 'building' }, OWNER));
  value(k.create('tasks', { what: 'Ship the first build', thing: harbour.id, state: 'open' }, OWNER));
  for (const d of [-1, -400])
    value(k.create('datapoints', { name: 'Sign-ups', value: 10, thing: harbour.id, source: 'reported', at: new Date(NOW - d * DAY).toISOString() }, OWNER));
  for (const id of ['datapoints-7d', 'datapoints-30d', 'datapoints-reported']) assert.equal(figure(k, id), 0, `${id} counts a reading dated after today`);
  const home = value<{ blocks: Drawn[] }>(k.page('home-founder')).blocks;
  assert.equal(home.find((b) => b.heading === 'Numbers this week' && b.drawn !== false), undefined, 'Numbers this week stands over no reading');
  const stands = () => {
    const page = (k.pages() as unknown as { slug: string; title: string }[]).find((p) => p.title === 'Harbour')!;
    const f = (value<{ blocks: Drawn[] }>(k.page(page.slug)).blocks.filter((b) => b.heading === 'Where it stands')).find((b) => b.kind === 'stat')!;
    return f.readings?.find((r) => r.metric.startsWith('project-numbers-7d'))?.reading?.value;
  };
  assert.equal(stands(), 0, 'the project counts a reading dated after today');
  /* TODAY'S STILL COUNTS, late in the day too. */
  value(k.create('datapoints', { name: 'Sign-ups', value: 11, thing: harbour.id, source: 'reported', at: new Date(NOW).toISOString() }, OWNER));
  for (const id of ['datapoints-7d', 'datapoints-30d', 'datapoints-reported']) assert.equal(figure(k, id), 1, id);
  assert.equal(stands(), 1);
});

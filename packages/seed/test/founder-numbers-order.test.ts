/**
 * Numbers opens newest first, by the moment each number is for (PGS-B06 job b).
 *
 * A LIST THAT NAMES NO ORDER CAME BACK NEWEST WRITTEN FIRST (`list-order.test.ts` in the kernel), so a feed polled
 * late, or a week of numbers typed in one sitting, opened Numbers on whatever was written last. The founder's use case
 * now declares `order` on `datapoints` by `at`, descending, the shape the Ledger declares on `on`.
 *
 * ON A FRESH FOUNDER RECORD MADE THE WAY ONBOARDING MAKES ONE (`founder-seen.test.ts`), with no examples, and three
 * numbers written out of the order of their moments.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Entry, type Kernel } from '@braindog/kernel';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { NOW, firstPartyDocument, firstPartyManifest } from '../src/index.ts';
import { modulesFor, useCase } from '../src/usecases/index.ts';
import { carriedDocument, dayOf, moduleDocument } from '../src/usecases/install.ts';

const TODAY = dayOf(NOW);
const DAY = 86_400_000;
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

const stateOf = (k: Kernel): Installed => ({
  format: 1,
  primitives: 1,
  record_version: k.version(),
  packs: k.packs(),
  declarations: k.declarations() as Installed['declarations'],
  rows: k.census(),
  config: k.packSettings(),
});

const held = (k: Kernel): string[] => (k.declarations() as { id: string; kind: string }[]).filter((d) => d.kind === 'register').map((d) => d.id.slice('register.'.length));

async function put(k: Kernel, doc: unknown): Promise<void> {
  const pack = value<Pack>(await normalise(doc, { kind: 'local' }));
  const diff = await plan(pack, stateOf(k));
  value(await install(pack, diff, hostFor(k), diff.planHash));
}

/** A fresh founder record with no examples, made module by module as onboarding makes it. */
async function founder(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const u = useCase('founder')!;
  for (const m of modulesFor(u, ['people', ...u.modules])) {
    if (m === 'agents') continue;
    const holds = new Set([...held(k), ...firstPartyManifest(m as never).provides.flatMap((p) => (p.startsWith('register.') ? [p.slice(9)] : []))]);
    await put(k, moduleDocument(u, m, { today: TODAY, holds, examples: false }));
  }
  await put(k, carriedDocument(u, TODAY, null, { examples: false }));
  return k;
}

const number = (k: Kernel, name: string, days: number): void =>
  void value(k.create('datapoints', { name, value: 10, source: 'reported', at: new Date(NOW + days * DAY).toISOString() }, OWNER));

const names = (k: Kernel, extra: Record<string, unknown> = {}): string[] =>
  value<{ rows: Entry[] }>(k.list({ register: 'datapoints', ...extra })).rows.map((r) => String(r.fields.name));

/* PORTFOLIO'S SINCE 1.19.0, which took Numbers over from the founder with its order. */
test('NUMBERS IS DECLARED NEWEST FIRST BY at, the shape the Ledger declares', () => {
  const decl = (firstPartyDocument('portfolio')!.declarations as Record<string, unknown>[]).find((d) => d.register === 'datapoints');
  assert.ok(decl, 'Projects holds no Numbers list');
  assert.deepEqual(decl.order, { field: 'at', dir: 'desc' });
  assert.ok((decl.fields as { id: string; type: string }[]).some((f) => f.id === 'at' && f.type === 'instant'), 'Numbers dates a number by `at`');
});

test('A FRESH FOUNDER RECORD LISTS THREE NUMBERS NEWEST FIRST BY THEIR MOMENT, not by the order they were written', async () => {
  const k = await founder();
  /* WRITTEN MIDDLE, OLDEST, NEWEST: newest written first would read Visitors, Sign-ups, Installs. */
  number(k, 'Installs', -3);
  number(k, 'Sign-ups', -10);
  number(k, 'Visitors', -1);
  assert.deepEqual(names(k), ['Visitors', 'Installs', 'Sign-ups']);
  /* AND AN EDIT DOES NOT MOVE ONE: the oldest number touched last stays last. */
  const oldest = value<{ rows: Entry[] }>(k.list({ register: 'datapoints' })).rows.at(-1)!;
  value(k.write('datapoints', oldest.id, { value: 12 }, OWNER));
  assert.deepEqual(names(k), ['Visitors', 'Installs', 'Sign-ups']);
});

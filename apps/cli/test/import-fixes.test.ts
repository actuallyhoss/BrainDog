/**
 * THREE THINGS THE IMPORT SAID OR WROTE THAT THE RECORD HAD MOVED PAST.
 *
 * - `loop/research-batch-sixty-one-audit.md` section 5: since money-core declared `pairs:` on `transactions`, the record
 *   marks a move between two of his accounts in one currency itself, and the import still told him every move arrives
 *   unmarked and to mark both legs by hand. What it cannot pair is a move between currencies, USD out of one account
 *   and EGP into another, because `abs(amount)` compares the currency with the size.
 * - Section 8, the import half: the project brief pack's fields stay on Projects after the pack is uninstalled
 *   (measured there as B2), and the import filled them whenever the list declared them, so every night took the
 *   one-liner, the plan and the blockers out of the note and put them in fields no page draws any more.
 * - `loop/research-m3-dynamic.md` B9: People 2.0.0 takes `registrar` off `role`, and the import wrote it as a word it
 *   knew. On a record whose list has not got it, that is `ENUM_VALUE_UNKNOWN` and the whole person is refused.
 *
 * THE RECORD IS `createRecordApi`, as in `test/import-values.test.ts`, because installing and uninstalling a pack and a
 * value landing by rule are the record's, not the bare kernel's. EVERY VALUE IS MADE UP.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { declarations, firstPartyDocument } from '@braindog/seed';

import { fixedClock, openSqlite } from '../../../packages/kernel/test/sqlite.ts';
import { createRecordApi, type CallContext } from '../../../packages/record/src/index.ts';
import { planLegacyTool } from '../src/legacy.ts';
import { applyPlan, type Door } from '../src/import.ts';
import { syntheticExport } from './legacy-export.ts';

const NOW = Date.UTC(2026, 8, 24, 12);
const TODAY = '2026-09-24';

/** The owner's own key at `write`, which is what `braindog login` holds and what the import writes with. */
const token: CallContext = {
  principal: { kind: 'token', id: 'tok_1', scope: 'write', person: 'p_1', level: 'owner' },
  session: { host: 'studio-mbp', repo: 'braindog', agent: 'claude' },
};
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

type Api = Awaited<ReturnType<typeof createRecordApi>>;
type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string } };

/** The importer's door onto the record, as the CLI's is onto a host, `packs` included, as `import.ts` wires it. */
const doorOf = (api: Api): Door => ({
  schema: (register) => api.schema({ register }, token),
  list: ({ register, limit, cursor }) => api.list({ register, ...(limit === undefined ? {} : { limit }), ...(cursor === undefined ? {} : { cursor }) }, token),
  create: (a) => api.create(a as never, token),
  update: (a) => api.update(a as never, token),
  governance: (a) => api.governance(a, token) as never,
  propose: (a) => api.propose(a as never, token) as never,
  packs: () => api.packs(token) as never,
});

/* ── section 5 · what the run says about a move between his own accounts ─────────────────────────────────────────── */

test('the run says the record pairs a move in one currency, and that a move between currencies is his to mark', () => {
  /* A LEDGER OF ONE ROW, because the sentence is said only when the export holds money that has moved. */
  const e = syntheticExport();
  (e.money as Record<string, unknown>).ledger = [{ id: 'T1', description: 'Card payment', day: '2026-09-20', amount_minor: -50_000, currency: 'EGP', account_id: 'cib' }];
  const p = planLegacyTool(e, TODAY);
  const line = p.changed.find((c) => /own accounts/u.test(c));
  assert.ok(line, `the run no longer says anything about a move between his accounts:\n${p.changed.join('\n')}`);
  assert.doesNotMatch(line, /the old tool does not mark one: mark both legs/u, 'the run still tells him to mark every move by hand');
  assert.match(line, /one currency/u, line);
  assert.match(line, /between two currencies/u, line);
  assert.match(line, /mark both legs/u, line);
});

/* ── section 8 · the brief's fields after the pack has gone ─────────────────────────────────────────────────────── */

const BRIEF = (): Record<string, unknown> => JSON.parse(readFileSync(new URL('../../../packs/project-brief/project-brief.pack.json', import.meta.url), 'utf8')) as Record<string, unknown>;

async function put(api: Api, doc: unknown): Promise<void> {
  const p = (await api.planPack({ doc, source: { kind: 'local' } } as never, owner)) as Out;
  assert.ok(p.ok, JSON.stringify(p));
  const diff = (p.value as { diff: { planHash: string; approve: unknown[] } }).diff;
  const done = (await api.installPack({ doc, source: { kind: 'local' }, planHash: diff.planHash, approve: diff.approve } as never, owner)) as Out;
  assert.ok(done.ok, JSON.stringify(done));
}

/** One project with a one-liner, a plan and a blocker, and nothing else, so the run asks for Projects alone. */
const oneProject = (): Record<string, unknown> => ({
  takenAt: '2026-09-24T06:00:00.000Z',
  rev: 9,
  db: { entities: [{ id: 'kiln', name: 'Kiln', lane: 'ship', oneLiner: 'A type foundry for small presses.', plan: ['Cut the italic'], blockers: ['The licence'] }] },
});

test('after the brief is uninstalled its fields are left alone, and the one-liner, plan and blockers go back into the note', async () => {
  const api = await createRecordApi({ sql: openSqlite(), clock: fixedClock(NOW) });
  await put(api, firstPartyDocument('portfolio'));
  await put(api, BRIEF());

  /* INSTALLED, THE BRIEF IS FILLED, which is the control: the second half below is not green for want of the pack. */
  const first = await applyPlan(planLegacyTool(oneProject(), TODAY), doorOf(api), { dryRun: false });
  assert.deepEqual(first.refused, []);
  const kiln = () => {
    const got = api.kernel.list({ register: 'things', limit: 50 });
    assert.ok(got.ok);
    return got.value.rows.find((r) => r.fields.name === 'Kiln')!;
  };
  assert.deepEqual(kiln().fields.blockers, ['The licence']);
  assert.doesNotMatch(String(kiln().fields.note ?? ''), /## Blockers/u);

  /* UNINSTALLED: the fields stay declared (the audit's B2), and the next night the old tool has a new blocker. */
  assert.ok(((await api.uninstallPack({ id: 'project-brief' } as never, owner)) as Out).ok);
  const later = oneProject();
  ((later.db as { entities: Record<string, unknown>[] }).entities[0]!).blockers = ['The printer'];
  const second = await applyPlan(planLegacyTool(later, TODAY), doorOf(api), { dryRun: false });
  assert.deepEqual(second.refused, []);
  assert.deepEqual(kiln().fields.blockers, ['The licence'], 'the import still fills a field no page draws since the brief left');
  const note = String(kiln().fields.note ?? '');
  for (const part of ['A type foundry for small presses.', '## Plan', '## Blockers\n\n- The printer']) assert.ok(note.includes(part), `the note lost ${part}:\n${note}`);
});

/**
 * SWITCHED OFF IS NOT HELD EITHER, and nothing above drove it: with `!p.disabled_at` taken out of `applyPlan`'s read of
 * the packs, every test in this file stayed green, the checker measured. A pack switched off keeps its fields and loses
 * its pages, which is the uninstalled case from the other side.
 */
test('while the brief is switched off its fields are left alone, and the blockers go back into the note', async () => {
  const api = await createRecordApi({ sql: openSqlite(), clock: fixedClock(NOW) });
  await put(api, firstPartyDocument('portfolio'));
  await put(api, BRIEF());
  assert.deepEqual((await applyPlan(planLegacyTool(oneProject(), TODAY), doorOf(api), { dryRun: false })).refused, []);
  assert.ok(((await api.disablePack({ id: 'project-brief' } as never, owner)) as Out).ok);
  const later = oneProject();
  ((later.db as { entities: Record<string, unknown>[] }).entities[0]!).blockers = ['The printer'];
  assert.deepEqual((await applyPlan(planLegacyTool(later, TODAY), doorOf(api), { dryRun: false })).refused, []);
  const got = api.kernel.list({ register: 'things', limit: 50 });
  assert.ok(got.ok);
  const kiln = got.value.rows.find((r) => r.fields.name === 'Kiln')!;
  assert.deepEqual(kiln.fields.blockers, ['The licence'], 'the import filled a field of a pack that is switched off');
  assert.ok(String(kiln.fields.note ?? '').includes('## Blockers\n\n- The printer'), String(kiln.fields.note));
});

/* ── M3 B9 · a registrar on a People list that has no such role ─────────────────────────────────────────────────── */

/**
 * People and Projects, with `registrar` among the roles or not. BOTH ARE BUILT AND NEITHER IS READ OFF THE SEED AS IT
 * STANDS, because B9 lands in `packages/seed` beside this file: the first run of the second half below took the seed's
 * People for the older list, met People 2.0.0 already in the tree, and proposed the role it was meant to find held.
 */
const lists = (registrar: boolean) =>
  declarations()
    .filter((d) => ['register.people', 'register.things'].includes(d.id))
    .map((d) => {
      if (d.id !== 'register.people') return d;
      const body = structuredClone(d.body) as { fields: { id: string; values?: string[] }[] };
      const role = body.fields.find((f) => f.id === 'role')!;
      role.values = [...role.values!.filter((v) => v !== 'registrar'), ...(registrar ? ['registrar'] : [])];
      return { ...d, body } as typeof d;
    });

test('his registrar arrives on a People list without the role, which the record grows by his own key', async () => {
  const api = await createRecordApi({ sql: openSqlite(), clock: fixedClock(NOW) });
  const put = await api.kernel.install(lists(false));
  assert.ok(put.ok, JSON.stringify(put));
  const exp = { takenAt: '2026-09-24T06:00:00.000Z', rev: 9, db: { people: [{ id: 'nord', name: 'Nordhaven Registry', role: 'registrar', email: 'support@nordhaven.example' }] } };
  const done = await applyPlan(planLegacyTool(exp, TODAY), doorOf(api), { dryRun: false });
  assert.deepEqual(done.refused, [], 'the person was refused over a role the list has not got');
  const got = api.kernel.list({ register: 'people', limit: 10 });
  assert.ok(got.ok);
  assert.deepEqual(got.value.rows.map((r) => [r.fields.name, r.fields.role]), [['Nordhaven Registry', 'registrar']]);
  assert.deepEqual(done.values?.added, ['registrar as a role in People']);

  /* AND ON A LIST THAT STILL HOLDS IT, a People before 2.0.0, it is written as it is and nothing is asked. */
  const old = await createRecordApi({ sql: openSqlite(), clock: fixedClock(NOW) });
  assert.ok((await old.kernel.install(lists(true))).ok);
  const kept = await applyPlan(planLegacyTool(exp, TODAY), doorOf(old), { dryRun: false });
  assert.deepEqual(kept.refused, []);
  assert.equal(kept.values, undefined, 'a role the list holds was proposed to it');
  const there = old.kernel.list({ register: 'people', limit: 10 });
  assert.ok(there.ok);
  assert.deepEqual(there.value.rows.map((r) => r.fields.role), ['registrar']);
});

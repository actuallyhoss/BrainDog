/**
 * WHAT HE DID IN HIS RECORD IS KEPT, AND WHAT HIS RECORD LACKS IS ASKED ONCE.
 *
 * Two tests the generic importer lost when it was made generic come back on the invented export: a row he deleted
 * here stays deleted when the same export is imported again, and the report says so (H.611, "import never resurrects
 * rows"). And money in two currencies on a record with no home currency is one question on Decide, filed before any
 * row is written, and never filed again on a later night.
 *
 * THE KERNEL ANSWERS, because what the record holds after the run is the fact. EVERY VALUE IS MADE UP.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { openRecord, type Kernel } from '@braindog/kernel';
import { declarations } from '@braindog/seed';

import { fixedClock, openSqlite } from '../../../packages/kernel/test/sqlite.ts';
import { TOOLS, mapAdapter, readMap, type Plan } from '../src/adapter.ts';
import { applyPlan, importCommand, said, type Door } from '../src/import.ts';
import { ACTOR, NOW, imported, tallybook } from './fixtures/tallybook/host.ts';

const now = () => new Date(NOW);
const utc = () => 0;
const fixture = (name: string) => readFileSync(fileURLToPath(new URL(`./fixtures/tallybook/${name}`, import.meta.url)), 'utf8');

test('A TASK DELETED HERE STAYS DELETED when the same export comes again, and the report says so', async (t) => {
  const { kernel, io, out, said: told } = await tallybook(t);
  assert.equal(await importCommand(['--map', 'sections.json', 'export.json'], io, undefined, now, utc), 0, [...told, ...out].join(' | '));
  const got = await kernel.list({ register: 'tasks', limit: 100 });
  assert.ok(got.ok);
  const kiln = got.value.rows.find((r) => r.fields.what === 'Book the kiln service');
  assert.ok(kiln, 'the kiln task did not arrive');
  const gone = await kernel.update('tasks', kiln.id, { deleted_at: new Date(NOW).toISOString() } as never, { actor: ACTOR });
  assert.ok(gone.ok, JSON.stringify(gone));

  out.length = 0;
  assert.equal(await importCommand(['--map', 'sections.json', 'export.json', '--dry-run'], io, undefined, now, utc), 0, [...told, ...out].join(' | '));
  assert.ok(out.some((l) => l.startsWith('Deleted in this BrainDog, so it would not be added again:') && l.includes('Book the kiln service')), out.join(' | '));

  out.length = 0;
  assert.equal(await importCommand(['--map', 'sections.json', 'export.json'], io, undefined, now, utc), 0, [...told, ...out].join(' | '));
  assert.deepEqual(await imported(kernel, 'tasks', 'what'), ['Renew the workshop lease', 'Send the October invoices'], 'the deleted task came back');
  assert.ok(out.includes('Tasks: 0 added, 0 updated, 2 unchanged.'), out.join(' | '));
  assert.ok(out.some((l) => l.startsWith('Deleted in this BrainDog, so not added again:') && l.includes('Book the kiln service')), out.join(' | '));
});

/** The invented export, planned by its map as `braindog import --map` plans it. */
function tallyPlan(): { plan: Plan; words: { source: string; map: ReturnType<typeof mapOf> } } {
  const map = mapOf(fixture('sections.json'));
  const adapter = mapAdapter(map);
  const read = adapter.read(fixture('export.json'));
  assert.ok(read.ok);
  return { plan: adapter.plan(read.value, { today: '2026-09-25', map: map.raw, tools: TOOLS }), words: { source: 'Tallybook', map } };
}
function mapOf(text: string) {
  const got = readMap(text, 'sections.json');
  assert.ok(got.ok, got.ok ? '' : got.fix);
  return got.value;
}

/** The kernel as a door, with Decide kept in memory and a home currency setting that holds `home`. */
async function record(t: { after: (fn: () => unknown) => void }, home: string | null) {
  const sql = openSqlite();
  t.after(() => sql.close());
  const kernel: Kernel = await openRecord(sql, fixedClock(NOW));
  const put = await kernel.install(declarations() as never);
  assert.ok(put.ok, put.ok ? '' : JSON.stringify(put));
  const happened: string[] = [];
  const filed: { question: string; body_kind: string; body: Record<string, unknown> }[] = [];
  let homeReads = 0;
  const door: Door = {
    schema: async (register) => {
      const decl = kernel.register(register);
      return decl ? { ok: true, value: decl } : { ok: false, refusal: { code: 'REGISTER_UNKNOWN', fix: `There is no register called ${register}.` } };
    },
    list: async ({ register, limit, cursor, deleted }) =>
      kernel.list({ register, ...(limit === undefined ? {} : { limit }), ...(cursor === undefined || cursor === null ? {} : { cursor }), includeDeleted: deleted === true } as never),
    create: async ({ register, fields }) => {
      happened.push(`write ${register}`);
      return kernel.create(register, fields as never, { actor: ACTOR });
    },
    update: async ({ register, seq, patch, version }) => kernel.update(register, `${register}#${String(seq)}`, patch as never, { actor: ACTOR, ...(version === undefined ? {} : { version }) }),
    governance: async () => ({ ok: true, value: filed.map((f, i) => ({ id: `s${String(i)}`, status: 'open', body: f.body })) }),
    propose: async (p) => {
      happened.push('ask');
      filed.push(p);
      return { ok: true, value: {} };
    },
    home: async () => {
      homeReads++;
      return { ok: true, value: { pack: 'money', currency: home } };
    },
  };
  return { kernel, door, happened, filed, homeReads: () => homeReads };
}

test('TWO CURRENCIES AND NO HOME CURRENCY: one question, asked before anything is written, and never again', async (t) => {
  const { kernel, door, happened, filed } = await record(t, null);
  const { plan, words } = tallyPlan();

  const first = await applyPlan(plan, door, { dryRun: false, words });
  assert.equal(filed.length, 1, `asked ${String(filed.length)} times`);
  assert.deepEqual(filed[0]!.body, { pack: 'money', values: { home_currency: 'EGP' }, from: 'tallybook:home-currency' });
  assert.equal(filed[0]!.body_kind, 'settings');
  assert.match(filed[0]!.question, /^Add up your money in EGP\? This import holds amounts in EGP and USD/u);
  assert.equal(happened[0], 'ask', `something was written before the question: ${happened.join(', ')}`);
  assert.ok(
    said(first, { dryRun: false, file: 'export.json' }).includes(
      'This import holds money in EGP and USD, and this BrainDog has no home currency to add it up in. Adding it up in EGP is asked on Decide; each amount keeps its own currency either way.',
    ),
  );
  /* EACH AMOUNT IS WRITTEN IN ITS OWN CURRENCY, and none is added to another. */
  const accounts = await kernel.list({ register: 'accounts', limit: 10 });
  assert.ok(accounts.ok);
  assert.deepEqual(accounts.value.rows.map((r) => r.fields.balance).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))), [
    { amount: 125050, currency: 'EGP' },
    { amount: 8000, currency: 'USD' },
  ]);

  const second = await applyPlan(plan, door, { dryRun: false, words });
  assert.equal(filed.length, 1, 'the second night asked again');
  assert.ok(said(second, { dryRun: false, file: 'export.json' }).includes('This import holds money in EGP and USD, and this BrainDog has no home currency to add it up in. Which one to add it up in was asked on Decide before.'));
});

test('A RECORD WITH A HOME CURRENCY, OR AN EXPORT IN ONE, IS ASKED NOTHING', async (t) => {
  const kept = await record(t, 'EGP');
  const { plan, words } = tallyPlan();
  const report = await applyPlan(plan, kept.door, { dryRun: false, words });
  assert.equal(kept.filed.length, 0);
  assert.equal(report.home, undefined);

  const one = await record(t, null);
  const egp: Plan = { ...plan, rows: plan.rows.filter((r) => !(r.register === 'accounts' && r.label === 'Dollar card')) };
  const alone = await applyPlan(egp, one.door, { dryRun: true, words });
  assert.equal(one.homeReads(), 0, 'the home currency was read for money in one currency');
  assert.equal(alone.home, undefined);
  assert.equal(one.filed.length, 0);
});

test('OVER THE HOST, A PACK HOLDING A HOME CURRENCY IS FOUND past one that declares it and holds none, so nothing is asked', async (t) => {
  const keeps = { config: { home_currency: { type: 'text' } } };
  const { io, out, said: told } = await tallybook(t, { 'aa-notes': { ...keeps, values: {} }, money: { ...keeps, values: { home_currency: 'egp' } } });
  assert.equal(await importCommand(['--map', 'sections.json', 'export.json', '--dry-run'], io, undefined, now, utc), 0, [...told, ...out].join(' | '));
  assert.ok(!out.some((l) => l.includes('home currency')), out.join(' | '));
});

test('OVER THE HOST, A RECORD WHOSE PACK KEEPS NO HOME CURRENCY YET IS ASKED, and a dry run says it would be', async (t) => {
  const { io, out, said: told } = await tallybook(t, { money: { config: { home_currency: { type: 'text' } }, values: { home_currency: null } } });
  assert.equal(await importCommand(['--map', 'sections.json', 'export.json', '--dry-run'], io, undefined, now, utc), 0, [...told, ...out].join(' | '));
  assert.ok(
    out.includes('This import holds money in EGP and USD, and this BrainDog has no home currency to add it up in. Adding it up in EGP would be asked on Decide; each amount keeps its own currency either way.'),
    out.join(' | '),
  );
});

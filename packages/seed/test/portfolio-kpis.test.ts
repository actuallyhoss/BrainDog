/**
 * Portfolio 1.19.0 declares each project's key numbers (the KPI plan of 21 October, K1-A).
 *
 * THE `kpis` LIST IS THE CONTRACT the kernel's ranking and the renderer's block are built on beside it, so its fields and
 * enum values are held here to `KPI_LIST`, the one constant both read. Portfolio takes Numbers (`datapoints`) over from the
 * founder use case under the same id and fields, which founder 3.0.0 hands it, so a record with Projects alone holds
 * readings, and a founder's readings survive the update. And the two figures over them read what they say.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { handedOf, install, normalise, normaliseUseCase, plan, useCasePack, type Host, type Installed, type Pack } from '@braindog/declare';
import { fill, openRecord, type Kernel, type MetricDecl } from '@braindog/kernel';
import { fixedClock, openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';

import { FIRST_PARTY_VERSIONS, NOW, firstPartyDocument, firstPartyManifest } from '../src/index.ts';
import { KPI_LIST, PORTFOLIO_REGISTERS, PROJECT_KINDS, SAMPLE_KPIS, SAMPLE_READINGS, THINGS } from '../src/modules/portfolio.ts';
import { modulesFor, useCase, useCaseDocument } from '../src/usecases/index.ts';
import { carriedDocument, dayOf, moduleDocument } from '../src/usecases/install.ts';

const TODAY = dayOf(NOW);
const OWNER = { actor: 'p_1' };
const DAY = 86_400_000;
type Body = Record<string, unknown>;
type Field = { id: string; type: string; values?: readonly string[]; default?: unknown; to?: string; required?: boolean };

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
const stateOf = (k: Kernel, coming: Record<string, string> = {}): Installed => ({
  format: 1, primitives: 1, record_version: k.version(), packs: k.packs(),
  declarations: k.declarations() as Installed['declarations'], rows: k.census(), config: k.packSettings(),
  /* WHICH LISTS A PACK WROTE BEFORE ANOTHER LAID A FIELD ON THEM, as the record's own plan reads it, so a module's next
     update over a list the founder extends keeps what was laid rather than reading the list as the record's own. */
  detached: Object.fromEntries(k.detached().map((d) => [d.id, { was: d.was, body: d.body }])),
  handed: { ...handedOf((sqlOf.get(k)?.all<{ manifest: string }>('SELECT manifest FROM pack') ?? []).map((r) => r.manifest)), ...coming },
});
/** The lists the packs laid: the kernel's own two (runs and what he told them) are on every record and are no pack's. */
const KERNEL_LISTS = ['register.session', 'register.instructions'];
const held = (k: Kernel): string[] =>
  (k.declarations() as { id: string; kind: string }[]).filter((d) => d.kind === 'register' && !KERNEL_LISTS.includes(d.id)).map((d) => d.id.slice('register.'.length));
const listsOf = (id: string): string[] => firstPartyManifest(id as never).provides.flatMap((p) => (p.startsWith('register.') ? [p.slice('register.'.length)] : []));
async function put(k: Kernel, doc: unknown, coming: Record<string, string> = {}): Promise<void> {
  const pack = value<Pack>(await normalise(doc, { kind: 'local' }));
  const diff = await plan(pack, stateOf(k, coming));
  assert.deepEqual(diff.conflicts, [], `${String((doc as Body).pack)} conflicts`);
  value(await install(pack, diff, hostFor(k), diff.planHash));
}
async function empty(): Promise<Kernel> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  sqlOf.set(k, sql);
  return k;
}
/* A FIGURE ASKED WITH ITS PARAMETER, `kpi-stale:Players`, is read filled, the first colon separating, as a page reads it. */
const reading = (k: Kernel, id: string): { value: unknown; met?: boolean | null } => {
  const at = id.indexOf(':');
  const decl = k.metricDecl(at < 0 ? id : id.slice(0, at))!;
  return value(k.metric(at < 0 ? decl : (fill(decl, null, id.slice(at + 1)) as MetricDecl)));
};
const fieldsOf = (k: Kernel, list: string): Field[] => {
  const d = (k.declarations() as { id: string; body: string | Body }[]).find((x) => x.id === `register.${list}`)!;
  return ((typeof d.body === 'string' ? JSON.parse(d.body) : d.body) as { fields: Field[] }).fields;
};

test('THE KEY NUMBERS LIST IS THE CONTRACT: every field and every enum value is KPI_LIST, and the defaults are its', () => {
  const kpis = PORTFOLIO_REGISTERS.kpis!;
  assert.equal(kpis.id, KPI_LIST.list);
  assert.equal(kpis.pack, 'portfolio');
  assert.deepEqual(kpis.fields.map((f) => f.id), [...KPI_LIST.fields]);
  const by = new Map(kpis.fields.map((f) => [f.id, f as unknown as Field]));
  for (const e of ['source', 'kind', 'good', 'every', 'today', 'state'] as const) {
    assert.equal(by.get(e)!.type, 'enum', e);
    assert.deepEqual([...by.get(e)!.values!], [...KPI_LIST[e]], e);
  }
  for (const [id, d] of Object.entries(KPI_LIST.defaults)) assert.equal(by.get(id)!.default, d, id);
  /* KIND IS WORKED OUT BY THE READER WHEN EMPTY, so it has no default to hide that it was never said. */
  assert.equal(by.get('kind')!.default, undefined);
  assert.deepEqual([by.get('thing')!.type, by.get('thing')!.to, by.get('thing')!.required], ['ref', 'things', true]);
  assert.deepEqual([by.get('target')!.type, by.get('target_amount')!.type, by.get('target_by')!.type], ['decimal', 'money', 'day']);
  assert.deepEqual([by.get('headline')!.type, by.get('draft')!.type, by.get('order')!.type], ['bool', 'bool', 'int']);
  assert.equal(KPI_LIST.readings, PORTFOLIO_REGISTERS.datapoints!.id);

  const kind = PORTFOLIO_REGISTERS.things!.fields.find((f) => f.id === 'kind')!;
  assert.deepEqual([kind.type, [...(kind.values ?? [])], kind.required ?? false], ['enum', [...PROJECT_KINDS], false]);
  assert.deepEqual([...PROJECT_KINDS], ['business', 'client', 'product', 'content']);
});

test('PORTFOLIO PROVIDES NUMBERS AND KEY NUMBERS, needs no other list, and founder 3.0.0 hands Numbers to it and lays its two links', () => {
  assert.equal(FIRST_PARTY_VERSIONS.portfolio, '1.32.0');
  const m = firstPartyManifest('portfolio');
  assert.deepEqual(m.requires, []);
  for (const id of ['register.datapoints', 'register.kpis', 'metric.kpis-held', 'metric.kpi-stale']) assert.ok(m.provides.includes(id), id);
  const doc = useCaseDocument('founder', TODAY) as { version: string; declarations: Body[]; hands: Record<string, string>; seeds?: Body[] };
  /* 3.1.0 SINCE 24 October (things, not rows): its project page is drawn for every project; Numbers is handed as 3.0.0 did.
     3.2.0 since its project page draws Portfolio 1.23.0's stages, and 3.3.0 since it declares the project's shape as
     blocks, and 3.4.0 since Last worked reads the runs too and the Dashboard says how old its numbers are, and 3.6.0
     beside Portfolio 1.27.0's Add a project box, and 3.7.0 since its project page draws the page of 27 October, and
     3.7.1 since its card's summary is one short line, and 3.8.0 since its page is Founder overview and the Dashboard
     says what went quiet with the way to fix the feed, and on to 3.10.0 with its count lines gone (62fb09138). */
  assert.equal(doc.version, '3.10.0');
  assert.equal(doc.hands['register.datapoints'], 'portfolio');
  assert.ok(!doc.declarations.some((d) => d.register === 'datapoints'), 'founder declares Numbers no more');
  assert.ok(!(doc.seeds ?? []).some((s) => s.register === 'datapoints'), 'and seeds no list it does not own');
  /* THE ORGANISATION AND THE SERVICE ARE THE FOUNDER'S, laid on Portfolio's list, and Portfolio declares neither. */
  const laid = (doc as { extends?: Record<string, { fields?: Field[] }> }).extends?.['register.datapoints']?.fields ?? [];
  assert.deepEqual(laid.map((f) => [f.id, f.to]), [['organisation', 'organisations'], ['about_service', 'services']]);
  assert.deepEqual(PORTFOLIO_REGISTERS.datapoints!.fields.filter((f) => f.type === 'ref').map((f) => f.id), ['thing']);
});

test('ON A RECORD WITH PROJECTS ALONE, a key number is kept with its defaults, its readings land, and the two figures say so', async () => {
  const k = await empty();
  await put(k, firstPartyDocument('portfolio', { holds: [] }));
  assert.deepEqual(held(k).sort(), ['datapoints', 'kpis', 'stages', 'things']);
  /* THE ORGANISATION AND THE SERVICE ARE LINKS, left out where the record holds neither. */
  assert.deepEqual(fieldsOf(k, 'datapoints').map((f) => f.id).filter((f) => f === 'organisation' || f === 'about_service'), []);

  const harbour = value<{ id: string }>(k.create('things', { name: 'Harbour', lane: 'earning', kind: 'product' }, OWNER));
  assert.equal(reading(k, 'kpis-held').value, 0);
  const kpi = value<{ id: string }>(k.create('kpis', { name: 'Daily active players', thing: harbour.id, measure: 'Players', every: '1d', unit: 'players' }, OWNER));
  const kept = k.get(kpi.id)!.fields as Body;
  assert.deepEqual(Object.fromEntries(Object.keys(KPI_LIST.defaults).map((f) => [f, kept[f]])), KPI_LIST.defaults);
  /* A DRAFT IS NOT KEPT, and a retired one is not either. */
  value(k.create('kpis', { name: 'Waitlist', thing: harbour.id, draft: true }, OWNER));
  value(k.create('kpis', { name: 'Old measure', thing: harbour.id, state: 'retired' }, OWNER));
  assert.equal(reading(k, 'kpis-held').value, 1);
  /* A VALUE OUTSIDE THE CONTRACT IS REFUSED. */
  assert.equal((k.create('kpis', { name: 'Odd', thing: harbour.id, today: 'always' }, OWNER) as { ok: boolean }).ok, false);

  /* NEVER READ, IT READS NOTHING; READ 23 DAYS AGO IT MISSES THE FOURTEEN; READ YESTERDAY IT MEETS THEM. */
  assert.equal(reading(k, 'kpi-stale:Players').value, null);
  value(k.create('datapoints', { name: 'Players', value: 120, thing: harbour.id, source: 'reported', at: new Date(NOW - 23 * DAY).toISOString() }, OWNER));
  const late = reading(k, 'kpi-stale:Players');
  assert.equal(late.value, 23);
  assert.equal(late.met, false);
  /* AN EXAMPLE AND A READING DATED AFTER TODAY ARE NOT READINGS. */
  value(k.create('datapoints', { name: 'Players', value: 1, thing: harbour.id, source: 'example', at: new Date(NOW - DAY).toISOString() }, OWNER));
  value(k.create('datapoints', { name: 'Players', value: 1, thing: harbour.id, source: 'reported', at: new Date(NOW + 3 * DAY).toISOString() }, OWNER));
  assert.equal(reading(k, 'kpi-stale:Players').value, 23);
  value(k.create('datapoints', { name: 'Players', value: 131, thing: harbour.id, source: 'reported', at: new Date(NOW - DAY).toISOString() }, OWNER));
  const fresh = reading(k, 'kpi-stale:Players');
  assert.equal(fresh.value, 1);
  assert.equal(fresh.met, true);
});

/**
 * A FOUNDER'S RECORD ON 2.7.0, AS IT SHIPPED (the catalogue's frozen file), over Portfolio as it was released, updated:
 * the hand is read before the modules are planned, as `planFile` reads it, so Portfolio 1.19.0 takes Numbers over,
 * founder 3.0.0 lets it go and lays its organisation and service back on it, and every reading is still there.
 */
test('A FOUNDER RECORD ON 2.7.0 UPDATES WITH EVERY READING KEPT, and Portfolio\'s next update keeps what the founder laid', async () => {
  const k = await empty();
  const u = useCase('founder')!;
  const shipped = value<typeof u>(normaliseUseCase(JSON.parse(readFileSync(new URL('../../../apps/web/static/catalogue/usecases/founder/2.7.0.usecase.json', import.meta.url), 'utf8'))));
  const released = JSON.parse(readFileSync(new URL('./fixtures/released/portfolio-1.16.0.json', import.meta.url), 'utf8')) as Body;
  await put(k, { ...released, seeds: [] });
  for (const m of modulesFor(u, ['people', ...u.modules])) {
    if (m === 'agents' || m === 'portfolio') continue;
    await put(k, moduleDocument(u, m, { today: TODAY, holds: new Set([...held(k), ...listsOf(m)]), examples: false }));
  }
  await put(k, { ...useCasePack(shipped)!, version: '2.7.0' });
  assert.ok(k.packClaims('usecase-founder').includes('register.datapoints'), 'on 2.7.0 Numbers is the founder\'s');

  const harbour = value<{ id: string }>(k.create('things', { name: 'Harbour', lane: 'earning' }, OWNER));
  for (let d = 0; d < 5; d += 1) value(k.create('datapoints', { name: 'Sign-ups', value: 10 + d, thing: harbour.id, source: 'reported', at: new Date(NOW - d * DAY).toISOString() }, OWNER));
  const before = k.count('datapoints');

  const coming = useCaseDocument('founder', TODAY) as Body & { hands: Record<string, string> };
  await put(k, moduleDocument(u, 'portfolio', { today: TODAY, holds: new Set([...held(k), ...listsOf('portfolio')]), examples: false }), coming.hands);
  await put(k, coming);

  assert.equal(k.count('datapoints'), before, 'every reading is kept');
  assert.ok(!k.packClaims('usecase-founder').includes('register.datapoints'), 'Numbers is no longer the founder\'s');
  assert.ok(held(k).includes('kpis'));
  /* THE ORGANISATION AND THE SERVICE STAY, laid by the founder, since this record holds People and Estate. */
  for (const f of ['organisation', 'about_service']) assert.ok(fieldsOf(k, 'datapoints').some((x) => x.id === f), f);
  assert.equal(reading(k, 'datapoints-7d').value, 5, 'the founder\'s own figures still read them');
  assert.equal(reading(k, 'service-numbers').value, 0, 'and its figure over the service it laid');
  assert.equal(reading(k, 'kpi-stale:Sign-ups').value, 0);

  /* AND PORTFOLIO'S NEXT UPDATE TAKES THE LIST BACK WITH WHAT THE FOUNDER LAID ON IT KEPT: Projects planned again over
     the record conflicts with nothing, and every reading and both laid fields are still there. */
  await put(k, moduleDocument(u, 'portfolio', { today: TODAY, holds: new Set(held(k)), examples: false }));
  assert.equal(k.count('datapoints'), before);
  for (const f of ['organisation', 'about_service']) assert.ok(fieldsOf(k, 'datapoints').some((x) => x.id === f), f);
});

/**
 * A FOUNDER RECORD MADE TODAY WITH ONLY WHAT IT STANDS ON (Projects and Money, `needs`), as the first run plans it: the
 * founder lays no link to a list the record does not hold, and the figure over the service goes with the field.
 */
test('A NEW FOUNDER RECORD WITH NO PEOPLE OR SERVICES TAKES THE USE CASE, with neither laid field and nothing over them', async () => {
  const k = await empty();
  const u = useCase('founder')!;
  for (const m of u.needs ?? []) await put(k, moduleDocument(u, m, { today: TODAY, holds: new Set([...held(k), ...listsOf(m)]), examples: false }));
  await put(k, carriedDocument(u, TODAY, null, { holds: new Set(held(k)), examples: false }));
  assert.deepEqual(fieldsOf(k, 'datapoints').map((f) => f.id).filter((f) => f === 'organisation' || f === 'about_service'), []);
  assert.equal(k.metricDecl('service-numbers'), null);
  assert.equal(reading(k, 'datapoints-held').value, 0);
});

/**
 * THE SAMPLE'S CLIENT LEADS WITH MONEY (the plan's 2.7, client work: billed a month first). Marlow & Co led its card with
 * its hours, the pin being the top of its numbers by Today's score; it now marks what it billed a month to lead, the hours
 * stay pinned to Today, and the twelve months add up to what its row says it earned in a year.
 */
test('MARLOW & CO LEADS WITH WHAT IT BILLED A MONTH, its hours still pinned to Today, its months adding up to its year', () => {
  const marlow = THINGS.findIndex((t) => t.name === 'Marlow & Co') + 1;
  const own = SAMPLE_KPIS.filter((k) => k.thing === marlow);
  const leads = own.filter((k) => k.headline === true);
  assert.deepEqual(
    leads.map((k) => [k.name, k.unit, k.kind]),
    [['Billed a month', 'GBP', 'flow']],
  );
  assert.equal(own.find((k) => k.name === 'Hours billed')?.today, 'pinned');
  const billed = SAMPLE_READINGS.filter((r) => r.thing === marlow && r.name === 'Billed a month');
  assert.equal(billed.length, 12);
  const year = billed.reduce((n, r) => n + (r.amount as { amount: number }).amount, 0);
  assert.equal(year, (THINGS[marlow - 1]!.revenue as { amount: number }).amount);
  /* EVERY PROJECT OF THE SAMPLE THAT KEEPS A NUMBER MARKS ONE TO LEAD, so no card leads by the pin. */
  for (const thing of new Set(SAMPLE_KPIS.map((k) => k.thing))) assert.equal(SAMPLE_KPIS.filter((k) => k.thing === thing && k.headline === true).length, 1, `project ${String(thing)}`);
});

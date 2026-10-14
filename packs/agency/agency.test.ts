/**
 * Agency: retainers and timesheets for a small agency, on top of People. A client is one of People's organisations and a
 * timesheet is one of People's people, so the add-on asks for People and nothing else; a timesheet's project waits for
 * Projects and is never asked for.
 *
 * THE MONDAY IS THE TEST. A month of invented rows goes in through the record's own calls, three clients, four people,
 * three retainers and forty timesheets, and the record is then asked what an agency lead asks on a Monday: each
 * retainer's hours used of the hours it bought this month, how much of what was worked was billed, and what the
 * retainers bring in a month. The answers are worked out here by hand from the same rows and held equal.
 *
 * RED FIRST, MEASURED: with no `agency.pack.json` this file failed at its first read, ENOENT. The first test asserts the
 * record does not already keep retainers, so a list somebody else declared would fail it rather than pass it.
 *
 * Every name here is invented.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { fixedClock, openSqlite, type NodeSql } from '../../packages/kernel/test/sqlite.ts';
import { createRecordApi, type CallContext } from '../../packages/record/src/index.ts';
import { firstPartyDocument } from '../../packages/seed/src/index.ts';

/* MONDAY 26 OCTOBER 2026 AT NINE, in a record kept in UTC: this month is the first to the twenty-sixth. */
const NOW = Date.UTC(2026, 9, 26, 9);
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

type Body = Record<string, unknown>;
type Refusal = { code: string; fix: string; at?: string };
type Out = { ok: boolean; value?: unknown; refusal?: Refusal };
const said = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};

type Api = Awaited<ReturnType<typeof createRecordApi>>;
type Waiting = { at: string; holds: string[] };
type Diff = { planHash: string; approve: unknown[]; waiting: Waiting[] };
type Group = { key: string; label?: string; value: number | null };
type Reading = { value: number | null; unit?: string | null; groups?: Group[]; refusals: Refusal[] };
type Drawn = { kind: string; heading?: string; rows?: { id: string; fields: Body }[]; readings?: { metric: string; reading: Reading }[]; cells?: Body[]; refusals: Refusal[] };
type Page = { slug: string; title: string; blocks: Drawn[] };

/** The file as it ships, read fresh each time so no test can hand the next one a copy it changed. */
const PACK_FILE = new URL('./agency.pack.json', import.meta.url);
const file = (): Body & { declarations: Body[] } => JSON.parse(readFileSync(PACK_FILE, 'utf8')) as never;

/** Projects' own list, which a timesheet may point at once the record keeps it. */
const PROJECTS = 'things';

const planOf = async (api: Api, doc: unknown): Promise<Out> => (await api.planPack({ doc, source: { kind: 'local' } } as never, owner)) as Out;

/** Plan and install with exactly what the plan asked to be approved. */
async function put(api: Api, doc: unknown): Promise<Diff> {
  const diff = said<{ diff: Diff }>(await planOf(api, doc)).diff;
  said(await api.installPack({ doc, source: { kind: 'local' }, planHash: diff.planHash, approve: diff.approve } as never, owner));
  return diff;
}

/** A fresh record, with People unless `people` is false, Projects when `projects` says so, and this add-on when `agency` does. */
async function record(opts: { people?: boolean; projects?: boolean; agency?: boolean } = {}): Promise<{ api: Api; sql: NodeSql; diff: Diff | null }> {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  said(
    await api.createRecord({
      id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD',
      slug: 'harbour',
      name: 'Harbour',
      tz: 'UTC',
      locale: 'en',
      owner: { id: 'p_1', email: 'mara@example.test', name: 'Mara' },
    }),
  );
  if (opts.projects) await put(api, firstPartyDocument('portfolio', { holds: [PROJECTS], seeds: [] }));
  /* PEOPLE AS THE RECORD WOULD BE GIVEN IT, its own two lists and Projects only when the record keeps Projects. */
  const holds = [...(opts.projects ? [PROJECTS] : []), 'people', 'organisations'];
  if (opts.people !== false) await put(api, firstPartyDocument('people', { holds, seeds: [] }));
  const diff = opts.agency === false ? null : await put(api, file());
  return { api, sql, diff };
}

const make = (api: Api, list: string, fields: Body): string => said<{ id: string }>(api.kernel.create(list, fields as never, { actor: 'p_1' })).id;

/* ── A month of invented rows ──────────────────────────────────────────────────────────────────── */

const CLIENTS = ['Harbour Lane Studio', 'Quince and Fold', 'Tidewater Mills'] as const;
const PEOPLE = ['Ines Marlow', 'Theo Brannagh', 'Odile Fenwick', 'Ravi Castellan'] as const;
/** Each retainer: its client, its fee in pence, the hours it buys, and how long each of its October entries is. */
const RETAINERS = [
  { name: 'Harbour Lane design', client: 0, fee: 300_000, bought: 20, rows: 15, hours: 1.5 },
  { name: 'Quince and Fold social', client: 1, fee: 150_000, bought: 10, rows: 12, hours: 0.75 },
  { name: 'Tidewater support', client: 2, fee: 100_000, bought: 8, rows: 9, hours: 1.25 },
] as const;
/** Four entries from the end of September on the first retainer, so "this month" has something to leave out. */
const SEPTEMBER = { retainer: 0, rows: 4, hours: 2 } as const;

type Sheet = { retainer: number; who: number; day: string; hours: number; kind: 'billable' | 'not_billable' };

/** The forty timesheets, every fifth one not billed, the people taking turns. */
function sheets(): Sheet[] {
  const out: Sheet[] = [];
  let n = 0;
  const add = (retainer: number, day: string, hours: number) => {
    out.push({ retainer, who: n % PEOPLE.length, day, hours, kind: n % 5 === 0 ? 'not_billable' : 'billable' });
    n += 1;
  };
  RETAINERS.forEach((r, at) => {
    for (let i = 0; i < r.rows; i += 1) add(at, `2026-10-${String(1 + ((i * 3 + at) % 23)).padStart(2, '0')}`, r.hours);
  });
  for (let i = 0; i < SEPTEMBER.rows; i += 1) add(SEPTEMBER.retainer, `2026-09-${27 + i}`, SEPTEMBER.hours);
  return out;
}

/** The month written through the record's own calls, and the ids each name was given. */
function month(api: Api): { orgs: string[]; people: string[]; retainers: string[]; rows: Sheet[] } {
  const orgs = CLIENTS.map((name) => make(api, 'organisations', { name, kind: 'client' }));
  const people = PEOPLE.map((name) => make(api, 'people', { name, role: 'collaborator' }));
  const retainers = RETAINERS.map((r) =>
    make(api, 'client_retainers', { name: r.name, org: orgs[r.client], fee: { amount: r.fee, currency: 'GBP' }, hours_bought: r.bought, renew: '2026-11-01', state: 'live' }),
  );
  const rows = sheets();
  rows.forEach((s, i) =>
    make(api, 'timesheets', { what: `Work item ${i + 1}`, who: people[s.who], deal: retainers[s.retainer], day: s.day, hours: s.hours, kind: s.kind }),
  );
  return { orgs, people, retainers, rows };
}

const october = (rows: readonly Sheet[]): Sheet[] => rows.filter((s) => s.day >= '2026-10-01');
const sum = (rows: readonly Sheet[]): number => rows.reduce((t, s) => t + s.hours, 0);
const metric = async (api: Api, id: string): Promise<Reading> => said<Reading>(await api.metric({ metric: id }, owner));
const pageOf = async (api: Api, slug: string): Promise<Page> => said<Page>(await api.page({ slug }, owner));

/* ── The tests ─────────────────────────────────────────────────────────────────────────────────── */

test('BEFORE THE ADD-ON: a record with People keeps no retainer and no timesheet', async () => {
  const { api, sql } = await record({ agency: false });
  for (const list of ['client_retainers', 'timesheets']) assert.equal(api.kernel.register(list), undefined, `${list} is already on the record`);
  const ids = api.kernel.declarations().map((d) => d.id);
  for (const id of ['page.clients', 'page.timesheets-week', 'page.retainer', 'metric.billed-share-month']) assert.ok(!ids.includes(id), `${id} is already on the record`);
  sql.close();
});

test('THE FILE IS agency 1.0.0 ON PEOPLE, data only: two lists, three pages, nine figures, no script and no example rows', () => {
  const doc = file() as Body & { requires: { packs: unknown }; declarations: Body[] };
  assert.deepEqual([doc.pack, doc.version, doc.author, doc.license], ['agency', '1.0.0', 'BrainDog', 'MIT']);
  assert.deepEqual(doc.requires.packs, { people: '>=3.3.0 <4.0.0' });
  assert.equal(doc.seeds, undefined, 'no example rows');
  const kinds = (k: string) => doc.declarations.filter((d) => k in d).map((d) => d[k]);
  assert.deepEqual(kinds('register'), ['client_retainers', 'timesheets']);
  assert.deepEqual(kinds('page'), ['clients', 'timesheets-week', 'retainer']);
  assert.equal(kinds('metric').length, 9);
  for (const k of ['script', 'rule', 'digest', 'job']) assert.deepEqual(kinds(k), [], `no ${k}`);
  const changes = String(doc.changes);
  assert.ok(changes.length <= 500 && !/[\r\n]/u.test(changes));
});

test('THE MONDAY: each retainer says its hours used of the hours it bought this month, and September is left out', async () => {
  const { api, sql } = await record();
  const { retainers, rows } = month(api);
  const clients = await pageOf(api, 'clients');
  for (const b of clients.blocks) assert.deepEqual(b.refusals, [], `${b.heading ?? b.kind} was refused`);
  const progress = clients.blocks.find((b) => b.kind === 'progress')!;
  assert.equal(progress.heading, 'Hours used this month');
  const used = new Map((progress.readings?.[0]?.reading.groups ?? []).map((g) => [g.key, g.value]));
  const drawn = (progress.rows ?? []).map((r) => [r.fields.name, r.fields.hours_bought, used.get(r.id) ?? null]);
  const byHand = RETAINERS.map((r, at) => [r.name, r.bought, sum(october(rows).filter((s) => s.retainer === at))]);
  assert.deepEqual(drawn, [...byHand].sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
  assert.deepEqual(byHand.map((r) => r[2]), [22.5, 9, 11.25], 'the first and the third are over, the second is under');
  assert.equal(sum(rows), 22.5 + 9 + 11.25 + 8, 'the September hours are in the record and not in the month');
  assert.equal(retainers.length, 3);
  sql.close();
});

test('THE MONDAY: hours billed over hours worked this month, overall and for each person', async () => {
  const { api, sql } = await record();
  const { people, rows } = month(api);
  const oct = october(rows);
  const billed = (r: readonly Sheet[]) => sum(r.filter((s) => s.kind === 'billable'));
  const share = await metric(api, 'billed-share-month');
  assert.deepEqual(share.refusals, []);
  assert.ok(Math.abs(share.value! - billed(oct) / sum(oct)) < 1e-9, `${share.value} is not ${billed(oct)} of ${sum(oct)}`);
  assert.ok(share.value! < 1 && share.value! > 0.7);
  /* A RATIO IS NOT READ IN PARTS IN THIS BUILD, so each person is two figures, what they billed and what they worked. */
  const parts = async (id: string) => new Map(((await metric(api, id)).groups ?? []).map((g) => [g.key, g.value]));
  const worked = await parts('hours-by-person-month');
  const charged = await parts('billed-hours-by-person-month');
  PEOPLE.forEach((name, at) => {
    const theirs = oct.filter((s) => s.who === at);
    assert.deepEqual([worked.get(people[at]!), charged.get(people[at]!)], [sum(theirs), billed(theirs)], name);
  });
  sql.close();
});

test('THE MONDAY: retainer income a month is the live fees in one currency, and an ended retainer is not in it', async () => {
  const { api, sql } = await record();
  const { retainers } = month(api);
  const income = await metric(api, 'retainer-income');
  assert.deepEqual([income.value, income.unit], [550_000, 'GBP']);
  said(api.kernel.update('client_retainers', retainers[1]!, { state: 'ended' } as never, { actor: 'p_1' }));
  assert.equal((await metric(api, 'retainer-income')).value, 400_000);
  sql.close();
});

test('THE PAGES: Clients leads with the income and the billed share, Timesheets with the week, and nothing is refused', async () => {
  const { api, sql } = await record();
  const { rows } = month(api);
  const clients = await pageOf(api, 'clients');
  assert.equal(clients.title, 'Clients');
  assert.deepEqual(clients.blocks.map((b) => b.kind), ['note', 'note', 'progress', 'table']);
  const week = await pageOf(api, 'timesheets-week');
  for (const b of week.blocks) assert.deepEqual(b.refusals, [], `${b.heading ?? b.kind} was refused`);
  const table = week.blocks.find((b) => b.kind === 'table')!;
  const inWeek = rows.filter((s) => s.day > '2026-10-18');
  assert.equal(table.rows?.length, inWeek.length);
  const listed = said<{ slug: string; title: string }[]>(await api.pages(owner));
  sql.close();
});

const fieldsOf = (api: Api, list: string): string[] => ((api.kernel.register(list) as unknown as { fields: { id: string }[] }).fields ?? []).map((f) => f.id);

test('A PAGE FOR EACH RETAINER: its hours used this month, and the month of its own timesheets', async () => {
  const { api, sql } = await record();
  const { rows } = month(api);
  const listed = said<{ slug: string; title: string; about?: { register: string } }[]>(await api.pages(owner));
  assert.deepEqual(
    listed.filter((p) => p.about?.register === 'client_retainers').map((p) => p.title),
    RETAINERS.map((r) => r.name),
  );
  const page = await pageOf(api, listed.find((p) => p.title === 'Tidewater support')!.slug);
  assert.equal(page.title, 'Tidewater support');
  for (const b of page.blocks) assert.deepEqual(b.refusals, [], `${b.heading ?? b.kind} was refused`);
  const theirs = october(rows).filter((s) => s.retainer === 2);
  const stat = page.blocks.find((b) => b.kind === 'stat')!;
  assert.equal(stat.readings?.[0]?.reading.value, sum(theirs));
  assert.equal(page.blocks.find((b) => b.kind === 'table')!.rows?.length, theirs.length);
  sql.close();
});

test('THE PROJECT LINK WAITS on a record without Projects, and is there to fill on one with it', async () => {
  const without = await record();
  assert.deepEqual(without.diff?.waiting, [{ at: `register.timesheets.fields[${fieldsOf(without.api, 'timesheets').length}]`, holds: [PROJECTS] }]);
  assert.ok(!fieldsOf(without.api, 'timesheets').includes('thing'), 'no project field on a record that keeps no projects');
  without.sql.close();

  const withP = await record({ projects: true });
  assert.deepEqual(withP.diff?.waiting, [], 'nothing waits once Projects is there');
  assert.ok(fieldsOf(withP.api, 'timesheets').includes('thing'));
  const { people, retainers } = month(withP.api);
  const launch = make(withP.api, PROJECTS, { name: 'Spring launch', lane: 'building' });
  const id = make(withP.api, 'timesheets', { what: 'Launch page copy', who: people[0], deal: retainers[0], day: '2026-10-26', hours: 2, kind: 'billable', thing: launch });
  assert.equal((withP.api.kernel.get(id) as unknown as { fields: Body }).fields.thing, launch);
  /* AND IT IS NEVER ASKED FOR: a timesheet with no project is kept just the same. */
  make(withP.api, 'timesheets', { what: 'Monthly report', who: people[1], deal: retainers[1], day: '2026-10-26', hours: 1, kind: 'not_billable' });
  withP.sql.close();
});

test('WITHOUT PEOPLE the add-on is refused before anything is written, with a sentence that says to install People first', async () => {
  const { api, sql } = await record({ people: false, agency: false });
  const plan = await planOf(api, file());
  assert.equal(plan.ok, false);
  assert.equal(plan.refusal?.code, 'REGISTER_UNRESOLVED');
  assert.match(plan.refusal!.fix, /Install people first/);
  assert.equal(api.kernel.register('client_retainers'), undefined);
  sql.close();
});

test('THE RENEWAL DAY IS A DEADLINE: a month, a week and the day before it, the record reminds', () => {
  const list = file().declarations.find((d) => d.register === 'client_retainers') as { fields: Body[] };
  const renews = list.fields.find((f) => f.id === 'renew')!;
  assert.deepEqual([renews.type, renews.deadline, renews.remind], ['day', true, ['-30d', '-7d', '0d']]);
});

/**
 * A plan's own page and its figures (REC-B12 jobs 3 and 4), one test an effect.
 *
 * ON A RECORD HOLDING MONEY AS ITS PACK DOCUMENT SAYS IT, as `money-plans.test.ts` measures the list: the three packs
 * installed with no example entries, a plan and its parts written as a person writes them, and the page read as the
 * app reads it (`k.page`). So a figure whose sentence the record refuses, or a block the page checker refuses, fails
 * here and not on a screen.
 *
 * THE PAGE AND ITS FIGURES ARE LAID IN HERE WHILE MONEY'S DOCUMENT DOES NOT YET NAME THEM (`withPlanPage`): putting
 * them in `figures/index.ts` and `pages/index.ts` is the integrator's. Once the document carries them, nothing is
 * added and this runs on the document alone.
 *
 * RED FIRST: with no `figures/plans.ts` or `pages/plan.ts` the file does not load.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan as planOf, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Entry, type Kernel } from '@braindog/kernel';
import { sayOf } from '@braindog/ports';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { NOW, firstPartyDocument } from '../src/index.ts';
import { PLAN_FIGURES, PLANS_FIGURES } from '../src/modules/money/figures/plans.ts';
import { MONEY_PLAN_PAGE } from '../src/modules/money/pages/plan.ts';

type Fields = Record<string, unknown>;
type Money = { amount: number; currency: string };
type Reading = { value: number | null; unit: string | null; rows: number; held?: number; groups?: { key: string; value: number | null }[] };
type Cell = { metric: string; label?: string; reading: Reading | null; refusal?: unknown };
type Block = {
  kind: string;
  heading?: string;
  body?: string;
  empty?: string;
  lead?: boolean;
  drawn?: boolean;
  matched?: number;
  rows?: Entry[];
  readings?: Cell[];
  columns?: { field: string; label?: string }[];
  refusals?: unknown[];
  wholeRead?: { total: number; of: number; rows: { label: string; value: number; of: number }[] };
};

const OWNER = { actor: 'p_1' };
const egp = (amount: number): Money => ({ amount, currency: 'EGP' });
/** A day as a figure holds it: whole days since 1970. */
const daysOf = (day: string): number => Date.parse(`${day}T00:00:00Z`) / 86_400_000;
const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T };
  assert.ok(x.ok, sayOf(r as never));
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

/** Money's document with the plan's figures and page in it, each added only while the document does not name it. */
const withPlanPage = (doc: unknown): unknown => {
  const d = doc as { declarations: Fields[] };
  const figures = [...Object.values(PLAN_FIGURES), ...Object.values(PLANS_FIGURES)].filter((f) => !d.declarations.some((x) => x.metric === f.metric));
  const pages = d.declarations.some((x) => x.page === MONEY_PLAN_PAGE.page) ? [] : [MONEY_PLAN_PAGE];
  return { ...d, declarations: [...d.declarations, ...figures, ...pages] };
};

/** A record holding money-core and what it points at, with no example entries. */
async function moneyCore(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  for (const id of ['portfolio', 'people', 'money-core'] as const) {
    const doc = firstPartyDocument(id, { seeds: [] });
    const pack = value<Pack>(await normalise((id === 'money-core' ? withPlanPage(doc) : doc) as never, { kind: 'local' }));
    const state: Installed = { format: 1, primitives: 1, record_version: k.version(), packs: k.packs(), declarations: k.declarations() as Installed['declarations'], rows: k.census() };
    const diff = await planOf(pack, state);
    value(await install(pack, diff, hostFor(k), diff.planHash));
  }
  return k;
}

const PART = 4_600_000;
/** The first of month `n` of 2027. */
const due = (n: number): string => `2027-${String(n).padStart(2, '0')}-01`;
/** A plan and its parts, one a month from January 2027, each E£46,000: `states[i]` is the status of part `i + 1`. */
function write(k: Kernel, name: string, states: string[]): void {
  value(k.create('plans', { name }, OWNER));
  states.forEach((state, i) =>
    value(k.create('installments', { what: `${name}, part ${i + 1}`, plan: name, number: i + 1, direction: 'out', amount: egp(PART), due: due(i + 1), state }, OWNER)),
  );
}
const SIX = ['paid', 'paid', 'open', 'open', 'open', 'open'];

/** The plan's page as the app reads it, found by the name a person reads and never by an address typed here. */
function pageOf(k: Kernel, name: string): Block[] {
  const listed = k.pages() as unknown as { slug: string; title: string; template: string | null }[];
  const found = listed.find((p) => p.template === MONEY_PLAN_PAGE.page && p.title === name);
  assert.ok(found, `${name} has a page of its own`);
  const blocks = value<{ blocks: Block[] }>(k.page(found.slug)).blocks;
  for (const b of blocks) assert.deepEqual(b.refusals ?? [], [], `${b.heading ?? b.kind} is read`);
  return blocks;
}
const drawn = (blocks: Block[]): Block[] => blocks.filter((b) => b.drawn !== false);
/** One figure of the page by the first word of its id, as a cell read it. */
function cellOf(blocks: Block[], id: string): Cell {
  const cell = drawn(blocks).flatMap((b) => b.readings ?? []).find((c) => c.metric.startsWith(`${id}:`));
  assert.ok(cell, `${id} is on the page`);
  assert.equal(cell.refusal, undefined, JSON.stringify(cell.refusal));
  return cell;
}
const read = (blocks: Block[], id: string): Reading => cellOf(blocks, id).reading!;
const tableOf = (blocks: Block[]): Block => blocks.find((b) => b.kind === 'table')!;

test('the page is one page a plan, under Money, and needs the list of plans', () => {
  assert.equal(MONEY_PLAN_PAGE.page, 'money-plan');
  assert.equal(MONEY_PLAN_PAGE.title, '{{name}}');
  assert.deepEqual(MONEY_PLAN_PAGE.for, { register: 'plans' });
  assert.equal((MONEY_PLAN_PAGE.nav as { section: string }).section, 'Money');
  assert.equal(MONEY_PLAN_PAGE.pack, 'money-core');
  const requires = MONEY_PLAN_PAGE.requires as string[];
  assert.ok(requires.includes('register.plans'), 'a record with no list of plans has no such page');
  assert.ok(requires.includes('register.installments'));
});

test('every figure of one plan is read once a plan, by the name its parts share', () => {
  assert.deepEqual(Object.keys(PLAN_FIGURES), ['plan-parts-paid', 'plan-parts', 'plan-paid', 'plan-left', 'plan-next-due', 'plan-last-due']);
  for (const [id, f] of Object.entries(PLAN_FIGURES)) {
    assert.equal(f.metric, id);
    assert.equal(f.source, 'register.installments');
    assert.match(String(f.where), /plan is \{\{it\}\}$/, id);
  }
  assert.deepEqual(Object.keys(PLANS_FIGURES), ['installments-paid-by-plan', 'installments-total-by-plan']);
});

test('a plan of six parts with two paid reads 2 of 6 paid, and left is its open parts added up', async () => {
  const k = await moneyCore();
  write(k, 'Flat', SIX);
  const blocks = pageOf(k, 'Flat');

  assert.deepEqual([read(blocks, 'plan-parts-paid').value, read(blocks, 'plan-parts').value], [2, 6]);
  assert.deepEqual([cellOf(blocks, 'plan-parts-paid').label, cellOf(blocks, 'plan-parts').label], ['Parts paid', 'Parts in all']);
  const left = read(blocks, 'plan-left');
  assert.deepEqual([left.value, left.unit, left.rows], [4 * PART, 'EGP', 4]);
  const paid = read(blocks, 'plan-paid');
  assert.deepEqual([paid.value, paid.unit], [2 * PART, 'EGP']);
  /* THE NEXT IS THE FIRST PART STILL OPEN, the third, and the last is the sixth. */
  assert.deepEqual([read(blocks, 'plan-next-due').value, read(blocks, 'plan-last-due').value], [daysOf(due(3)), daysOf(due(6))]);

  /* AND THE TRACK DRAWS THE SAME TWO OF SIX, one track, counted from the parts' own status. */
  const track = drawn(blocks).find((b) => b.kind === 'progress')!;
  assert.deepEqual(track.wholeRead, { rows: [{ label: 'Flat', rows: 6, value: 2, of: 6 }], total: 2, of: 6 });
  assert.equal(track.heading, 'Parts paid');
});

test('a cancelled part counts in neither side', async () => {
  const k = await moneyCore();
  write(k, 'Flat', ['paid', 'paid', 'open', 'cancelled', 'open', 'cancelled']);
  const blocks = pageOf(k, 'Flat');

  assert.deepEqual([read(blocks, 'plan-parts-paid').value, read(blocks, 'plan-parts').value], [2, 4]);
  assert.equal(read(blocks, 'plan-left').value, 2 * PART);
  assert.equal(read(blocks, 'plan-paid').value, 2 * PART);
  /* THE LAST PART IS THE LAST ONE THAT STANDS: the sixth is cancelled, so the plan ends on the fifth. */
  assert.equal(read(blocks, 'plan-last-due').value, daysOf(due(5)));
  assert.deepEqual([drawn(blocks).find((b) => b.kind === 'progress')!.wholeRead!.total, drawn(blocks).find((b) => b.kind === 'progress')!.wholeRead!.of], [2, 4]);
  /* IT IS STILL LISTED, under its own word, so nobody wonders where a part went. */
  assert.equal(tableOf(blocks).matched, 6);
});

test('one plan reads only its own parts', async () => {
  const k = await moneyCore();
  write(k, 'Flat', SIX);
  write(k, 'Car, the red one', ['paid', 'open', 'open']);
  const car = pageOf(k, 'Car, the red one');
  assert.deepEqual([read(car, 'plan-parts-paid').value, read(car, 'plan-parts').value, read(car, 'plan-left').value], [1, 3, 2 * PART]);
  assert.equal(tableOf(car).matched, 3);
  assert.equal(read(pageOf(k, 'Flat'), 'plan-parts').value, 6);

  /* AND MONEY'S TWO COUNTS SAY EVERY PLAN AT ONCE, one count a plan. */
  const by = (id: string) => Object.fromEntries((value<Reading>(k.metric(PLANS_FIGURES[id] as never)).groups ?? []).map((g) => [g.key, g.value]));
  assert.deepEqual(by('installments-paid-by-plan'), { Flat: 2, 'Car, the red one': 1 });
  assert.deepEqual(by('installments-total-by-plan'), { Flat: 6, 'Car, the red one': 3 });
});

/**
 * Money's own script that links a plan's parts and writes what is left after each, run as a host's sandbox runs it
 * until it has nothing more to write (`money-plans.test.ts` measures the script itself; here it is only what fills
 * the column the page draws). BY A PATH WORKED OUT HERE, because the script's `.d.ts` is not this job's.
 */
async function counted(k: Kernel): Promise<void> {
  const at = new URL('../src/modules/money/scripts/plans-from-names.js', import.meta.url).href;
  const { PLANS_FROM_NAMES_SCRIPT } = (await import(at)) as { PLANS_FROM_NAMES_SCRIPT: { source: string } };
  const mod = (await import(`data:text/javascript,${encodeURIComponent(PLANS_FROM_NAMES_SCRIPT.source)}`)) as { default: (c: unknown) => Promise<unknown> };
  const rowsOf = (register: string) => value<{ rows: Entry[] }>(k.list({ register, limit: 500 })).rows;
  const shaped = (e: Entry) => ({ id: e.id, seq: e.seq!, version: e.version, fields: e.fields });
  for (let runs = 0; runs < 6; runs++) {
    const todo: (() => void)[] = [];
    const out = await mod.default({
      input: {},
      tz: 'UTC',
      now: () => new Date(NOW).toISOString(),
      record: {
        get: async (spoken: string) => {
          const found = rowsOf(spoken.split('#')[0]!).find((e) => `${e.register}#${e.seq}` === spoken);
          return found ? shaped(found) : null;
        },
        list: async (register: string, where?: unknown) => value<{ rows: Entry[] }>(k.list({ register, ...(where === undefined ? {} : { where: where as never }) })).rows.map(shaped),
      },
      write: (register: string, fields: Fields) => void todo.push(() => void value(k.create(register, fields, OWNER))),
      update: (spoken: string, patch: Fields, version: number) =>
        void todo.push(() => {
          const register = spoken.split('#')[0]!;
          value(k.update(register, rowsOf(register).find((e) => `${register}#${e.seq}` === spoken)!.id, patch, { ...OWNER, version }));
        }),
      log: () => {},
    });
    for (const one of todo) one();
    if (out === null) return;
  }
  assert.fail('the script comes to rest');
}

test('the parts are listed with day, amount, status and what is left after each, and the last open part reads nought', async () => {
  const k = await moneyCore();
  write(k, 'Flat', SIX);
  await counted(k);
  const table = tableOf(pageOf(k, 'Flat'));

  assert.equal(table.heading, 'Parts');
  const fields = table.columns!.map((c) => c.field);
  for (const f of ['due', 'amount', 'state', 'left_after']) assert.ok(fields.includes(f), `${f} is a column`);
  assert.equal(table.columns!.find((c) => c.field === 'left_after')!.label, 'Left after');
  /* EVERY PART, THE EARLIEST FIRST, and no part of another plan. */
  const rows = table.rows!;
  assert.deepEqual(rows.map((r) => r.fields.due), [1, 2, 3, 4, 5, 6].map(due));
  assert.deepEqual(rows.map((r) => r.fields.state), SIX);
  assert.equal(rows.every((r) => (r.fields.amount as Money).amount === PART), true);
  /* AFTER THE THIRD, THE FIRST STILL OPEN, three are left; after the sixth, none. */
  assert.deepEqual(rows[2]!.fields.left_after, egp(3 * PART));
  assert.deepEqual(rows[5]!.fields.left_after, egp(0));
  /* WHAT IS LEFT AFTER THE FIRST OPEN PART AND THAT PART ARE WHAT THE PAGE SAYS IS LEFT. */
  assert.equal((rows[2]!.fields.left_after as Money).amount + PART, read(pageOf(k, 'Flat'), 'plan-left').value);
});

test('a plan with no parts says so in a sentence, and draws no figure about nothing', async () => {
  const k = await moneyCore();
  value(k.create('plans', { name: 'Desk' }, OWNER));
  const blocks = pageOf(k, 'Desk');
  const shown = drawn(blocks);

  const lead = shown.filter((b) => b.lead === true);
  assert.equal(lead.length, 1, 'one block leads');
  assert.equal(lead[0]!.kind, 'note');
  assert.match(lead[0]!.body!, /^No part of Desk is on Instalments yet\./);
  /* NO TILE OF FIGURES AND NO TRACK: a count of nought of nought and a day that is not there are a dash on a screen. */
  assert.deepEqual(shown.filter((b) => b.kind === 'stat' || b.kind === 'progress'), []);
  const table = tableOf(blocks);
  assert.equal(table.matched, 0);
  assert.match(table.empty!, /^[A-Z].*Desk.*\.$/, 'the empty list is a sentence that names the plan');
});

test('a plan with parts is led by its figures, and a plan all paid says no next part', async () => {
  const k = await moneyCore();
  write(k, 'Flat', SIX);
  write(k, 'Desk', ['paid', 'paid']);
  const lead = drawn(pageOf(k, 'Flat')).filter((b) => b.lead === true);
  assert.deepEqual(lead.map((b) => b.kind), ['stat']);
  /* THE SENTENCE'S FOUR FIGURES, IN THE SENTENCE'S ORDER: "2 of 6 paid. E£176,500 left, the last part on 1 Jun 2027." */
  assert.deepEqual(lead[0]!.readings!.map((c) => c.metric.split(':')[0]), ['plan-parts-paid', 'plan-parts', 'plan-left', 'plan-last-due']);

  const desk = drawn(pageOf(k, 'Desk'));
  assert.equal(desk.some((b) => b.heading === 'Next part'), false, 'nothing is next once every part is paid');
  assert.deepEqual([read(desk, 'plan-parts-paid').value, read(desk, 'plan-parts').value, read(desk, 'plan-paid').value], [2, 2, 2 * PART]);
});

test('nothing a person reads on the page is an id, a dash or a word about the list', () => {
  const blocks = MONEY_PLAN_PAGE.blocks as { heading?: string; body?: string; empty?: string; cells?: { label?: string }[]; columns?: { label?: string }[] }[];
  const copy = blocks.flatMap((b) => [b.heading, b.body, b.empty, ...(b.cells ?? []).map((c) => c.label), ...(b.columns ?? []).map((c) => c.label)]).filter((s): s is string => typeof s === 'string');
  assert.ok(copy.length > 6);
  for (const said of copy) {
    assert.doesNotMatch(said, /[—–]/, said);
    assert.doesNotMatch(said, /\b(row|rows|list item|entity|record)\b/i, said);
    assert.doesNotMatch(said, /\{\{(?!name\}\})/, `${said}: only the plan's name is filled`);
  }
  /* AND IT IS A SHORT PAGE: Money's own holds twenty-four blocks, and this adds none to it. */
  assert.ok(blocks.length <= 8);
});

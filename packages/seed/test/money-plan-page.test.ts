/**
 * A plan's own page and its figures, one test an effect.
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
import { PLAN_FIGURES, PLAN_PAGE_FIGURES, PLANS_FIGURES } from '../src/modules/money/figures/plans.ts';
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
  /** What the record answers for each `{{figure:plan}}` in the block's words, by the words in the braces. */
  values?: Record<string, unknown>;
  unnamed?: string[];
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
  const figures = [...Object.values(PLAN_FIGURES), ...Object.values(PLANS_FIGURES), ...Object.values(PLAN_PAGE_FIGURES)].filter((f) => !d.declarations.some((x) => x.metric === f.metric));
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
/** The sentence a plan with parts is led by, with the plan's name filled in and every figure of it still to be written. */
const sentenceOf = (name: string): string => `{{plan-parts-paid:${name}}} of {{plan-parts:${name}}} parts paid, the last due on {{plan-last-due:${name}}}.`;
/** The sentence a plan with every part paid is led by: the same count, nothing left in words, and the day it ended. */
const paidUpOf = (name: string): string => `{{plan-parts-paid:${name}}} of {{plan-parts:${name}}} parts paid, and nothing is left. The last was due on {{plan-last-due:${name}}}.`;
/** The lead as a person reads it: every figure in braces written as the record answered it, a day as its count of days. */
const wordsOf = (lead: Block): string =>
  lead.body!.replace(/\{\{([^{}]+)\}\}/g, (whole, key: string) => {
    const v = lead.values?.[key];
    return v === undefined ? whole : typeof v === 'object' && v !== null ? `${(v as Money).currency} ${(v as Money).amount}` : String(v);
  });
/** The block that leads the page, which is one block and no more. */
function leadOf(blocks: Block[]): Block {
  const lead = drawn(blocks).filter((b) => b.lead === true);
  assert.equal(lead.length, 1, 'one block leads');
  return lead[0]!;
}
/** One figure of the lead sentence as the record answered it, by the first word of its id. */
function said(blocks: Block[], id: string): unknown {
  const lead = leadOf(blocks);
  assert.deepEqual(lead.unnamed ?? [], [], 'every figure the sentence asks for is one the record has');
  const key = Object.keys(lead.values ?? {}).find((k) => k.startsWith(`${id}:`));
  assert.ok(key, `${id} is in the sentence, and has a value`);
  return lead.values![key];
}
/** A day in the sentence as whole days since 1970, whether the record answers it as that count or as the day written out. */
const dayOf = (v: unknown): number => (typeof v === 'string' ? daysOf(v) : (v as number));
const tableOf = (blocks: Block[]): Block => blocks.find((b) => b.kind === 'table')!;
/** A block of the page by its heading. */
const headed = (blocks: Block[], heading: string): Block => {
  const found = blocks.find((b) => b.heading === heading);
  assert.ok(found, `${heading} is on the page`);
  return found;
};
/**
 * The plan's track as the app reads it: each of its five figures by the plan's name, one group each, so a value is the
 * plan's own (`page-live.ts` draws the bar and the next part under it from these).
 */
function trackOf(blocks: Block[], name: string): { paid: unknown; parts: unknown; next: unknown; left: unknown; after: unknown } {
  const track = drawn(blocks).find((b) => b.kind === 'progress');
  assert.ok(track, 'the track is drawn');
  assert.equal(track.heading, 'Parts paid');
  const [paid, parts, next, left, after] = track.readings!.map((c) => {
    assert.equal(c.refusal, undefined, JSON.stringify(c.refusal));
    const groups = c.reading?.groups ?? [];
    assert.ok(groups.length <= 1, `${c.metric} reads one plan`);
    return groups.find((g) => g.key === name)?.value ?? null;
  });
  return { paid, parts, next, left, after };
}
/** The folded list of every part still to come: the one table with no heading, after the fold. */
const toComeOf = (blocks: Block[]): Block => blocks.find((b) => b.kind === 'table' && b.heading === undefined)!;

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
  assert.deepEqual(Object.keys(PLAN_FIGURES), [
    'plan-parts-paid',
    'plan-parts',
    'plan-paid',
    'plan-left',
    'plan-parts-open',
    'plan-next-due',
    'plan-last-due',
  ]);
  assert.deepEqual(Object.keys(PLAN_PAGE_FIGURES), [
    'plan-late',
    'plan-parts-cancelled',
    'plan-parts-paid-by-plan',
    'plan-parts-by-plan',
    'plan-next-due-by-plan',
    'plan-left-by-plan',
    'plan-after-next-by-plan',
    'plan-paid-by-quarter',
  ]);
  for (const [id, f] of Object.entries({ ...PLAN_FIGURES, ...PLAN_PAGE_FIGURES })) {
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

  /* THE SENTENCE'S COUNTS, answered for this plan: 2 of 6 parts paid, and what is left is the summary's. */
  assert.deepEqual([said(blocks, 'plan-parts-paid'), said(blocks, 'plan-parts')], [2, 6]);
  assert.deepEqual([read(blocks, 'plan-left').value, read(blocks, 'plan-left').unit], [4 * PART, 'EGP']);
  const paid = read(blocks, 'plan-paid');
  assert.deepEqual([paid.value, paid.unit], [2 * PART, 'EGP']);
  /* THE NEXT IS THE FIRST PART STILL OPEN, the third, and the last is the sixth. */
  const track = trackOf(blocks, 'Flat');
  assert.deepEqual([track.next, dayOf(said(blocks, 'plan-last-due'))], [daysOf(due(3)), daysOf(due(6))]);

  /* AND THE TRACK DRAWS THE SAME TWO OF SIX, one track, counted from the parts' own status, with what is left. */
  assert.deepEqual([track.paid, track.parts, track.left], [2, 6, 4 * PART]);
});

test('a cancelled part counts in neither side', async () => {
  const k = await moneyCore();
  write(k, 'Flat', ['paid', 'paid', 'open', 'cancelled', 'open', 'cancelled']);
  const blocks = pageOf(k, 'Flat');

  assert.deepEqual([said(blocks, 'plan-parts-paid'), said(blocks, 'plan-parts')], [2, 4]);
  assert.equal(read(blocks, 'plan-left').value, 2 * PART);
  assert.equal(read(blocks, 'plan-paid').value, 2 * PART);
  /* THE LAST PART IS THE LAST ONE THAT STANDS: the sixth is cancelled, so the plan ends on the fifth. */
  assert.equal(dayOf(said(blocks, 'plan-last-due')), daysOf(due(5)));
  assert.deepEqual([trackOf(blocks, 'Flat').paid, trackOf(blocks, 'Flat').parts], [2, 4]);
  /* IT IS STILL LISTED, under its own heading, so nobody wonders where a part went: two paid, two to come, two cancelled. */
  assert.deepEqual([headed(blocks, 'Paid').matched, toComeOf(blocks).matched, headed(drawn(blocks), 'Cancelled').matched], [2, 2, 2]);
});

test('one plan reads only its own parts', async () => {
  const k = await moneyCore();
  write(k, 'Flat', SIX);
  write(k, 'Car, the red one', ['paid', 'open', 'open']);
  const car = pageOf(k, 'Car, the red one');
  /* A NAME WITH A COMMA IN IT IS ONE PLAN, in the sentence as in the list. */
  assert.equal(leadOf(car).body, sentenceOf('Car, the red one'));
  assert.deepEqual([said(car, 'plan-parts-paid'), said(car, 'plan-parts'), read(car, 'plan-left').value], [1, 3, 2 * PART]);
  assert.deepEqual([headed(car, 'Paid').matched, headed(car, 'Upcoming').matched], [1, 2]);
  assert.equal(said(pageOf(k, 'Flat'), 'plan-parts'), 6);

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

test('the parts to come and the parts paid are listed apart, with what is left after each part to come', async () => {
  const k = await moneyCore();
  write(k, 'Flat', SIX);
  await counted(k);
  const blocks = pageOf(k, 'Flat');

  /* THE NEXT SIX TO TICK, THE EARLIEST FIRST: a todo, so a part is marked paid where it is read. */
  const upcoming = headed(blocks, 'Upcoming');
  assert.equal(upcoming.kind, 'todo');
  assert.deepEqual(upcoming.rows!.map((r) => r.fields.due), [3, 4, 5, 6].map(due));

  /* THE PARTS PAID, THE LATEST FIRST, with the day each was paid. */
  const paid = headed(blocks, 'Paid');
  assert.deepEqual(paid.rows!.map((r) => r.fields.due), [2, 1].map(due));
  for (const f of ['due', 'what', 'amount', 'settled']) assert.ok(paid.columns!.some((c) => c.field === f), `${f} is a column of Paid`);

  /* EVERY PART STILL TO COME, UNDER THE FOLD, with what is left after it; after the sixth, none. */
  const fold = blocks[blocks.indexOf(toComeOf(blocks)) - 1]!;
  assert.deepEqual([fold.kind, fold.heading], ['section', 'Every part still to come']);
  const rows = toComeOf(blocks).rows!;
  assert.equal(toComeOf(blocks).columns!.find((c) => c.field === 'left_after')!.label, 'Left after');
  assert.deepEqual(rows.map((r) => r.fields.due), [3, 4, 5, 6].map(due));
  assert.deepEqual(rows[0]!.fields.left_after, egp(3 * PART));
  assert.deepEqual(rows[3]!.fields.left_after, egp(0));
  /* WHAT IS LEFT AFTER THE FIRST OPEN PART AND THAT PART ARE WHAT THE PAGE SAYS IS LEFT. */
  assert.equal((rows[0]!.fields.left_after as Money).amount + PART, read(blocks, 'plan-left').value);
});

test('the summary says paid in, left and what is late, and the track the next part', async () => {
  const k = await moneyCore();
  /* THREE PARTS BEFORE THE CLOCK'S DAY, ONE PAID AND TWO NOT, AND THREE AFTER IT. */
  value(k.create('plans', { name: 'Flat' }, OWNER));
  const days = ['2026-05-01', '2026-07-01', '2026-08-01', '2026-10-01', '2026-11-01', '2026-12-01'];
  days.forEach((day, i) =>
    value(k.create('installments', { what: `Flat, part ${i + 1}`, plan: 'Flat', number: i + 1, direction: 'out', amount: egp(PART * (i + 1)), due: day, state: i === 0 ? 'paid' : 'open' }, OWNER)),
  );
  await counted(k);
  const blocks = pageOf(k, 'Flat');
  const stat = headed(drawn(blocks), 'Where it stands');
  assert.deepEqual(stat.readings!.map((c) => c.label), ['Paid', 'Left', 'Late']);
  assert.equal(drawn(blocks).filter((b) => b.heading === 'Where it stands').length, 1, 'one summary is drawn');
  assert.equal(read(blocks, 'plan-paid').value, PART);
  assert.equal(read(blocks, 'plan-left').value, PART * (2 + 3 + 4 + 5 + 6));
  /* THE NEXT IS THE EARLIEST STILL OPEN, the second, late already: its day, and its amount as what is left less what is
     left once it is paid, which the app says under the track. */
  const track = trackOf(blocks, 'Flat');
  assert.equal(track.next, daysOf('2026-07-01'));
  assert.equal((track.left as number) - (track.after as number), 2 * PART);
  /* LATE IS THE OPEN PARTS WHOSE DAY HAS GONE, held to nought, so it is drawn red. */
  assert.equal(read(blocks, 'plan-late').value, PART * (2 + 3));
  assert.deepEqual((cellOf(blocks, 'plan-late') as Cell & { target?: unknown }).target, { lte: 0 });
});

/* NO CHART OF WHAT WAS PAID IN ALL, SINCE money-core 3.34.0: Where it stands and its track say what is paid, so the
   chart said one figure a third time. The figure it read stays declared. */
test('no chart adds up what was paid each quarter: the summary and its track say what is paid', async () => {
  const k = await moneyCore();
  value(k.create('plans', { name: 'Flat' }, OWNER));
  const days = ['2025-11-01', '2026-02-01', '2026-03-01', '2026-08-01', '2026-11-01'];
  days.forEach((day, i) =>
    value(k.create('installments', { what: `Flat, part ${i + 1}`, plan: 'Flat', number: i + 1, direction: 'out', amount: egp(PART), due: day, state: i < 4 ? 'paid' : 'open' }, OWNER)),
  );
  const blocks = drawn(pageOf(k, 'Flat'));
  assert.equal(blocks.some((b) => b.kind === 'series'), false, 'a chart of what was paid in all is drawn');
  assert.equal((MONEY_PLAN_PAGE.blocks as { kind?: string }[]).some((b) => b.kind === 'series'), false);
  assert.ok('plan-paid-by-quarter' in PLAN_PAGE_FIGURES);
});

test('where the Property add-on holds the plan, the lead sends to it, and nothing here says its worth', () => {
  const leads = (MONEY_PLAN_PAGE.blocks as { lead?: boolean; says?: { when?: unknown; body: string }[] }[]).filter((b) => b.lead === true && b.says);
  assert.equal(leads.length, 2);
  for (const l of leads) {
    assert.deepEqual(l.says![0]!.when, { metric: 'property-value-of:{{name}}', empty: false });
    assert.match(l.says![0]!.body, /\[Property\]\(\/p\/properties\)/);
    assert.equal(l.says![0]!.body.startsWith(l.says![1]!.body), true, 'the same sentence, with the line to Property after it');
  }
  /* AND NO FIGURE OF PROPERTY'S IS DRAWN HERE: what a property is worth and the equity are its page's. */
  const named = JSON.stringify((MONEY_PLAN_PAGE.blocks as { cells?: unknown; series?: unknown }[]).map((b) => [b.cells, b.series]));
  assert.doesNotMatch(named, /property-/);
});

test('a plan with no parts says so in a sentence, and draws no figure about nothing', async () => {
  const k = await moneyCore();
  value(k.create('plans', { name: 'Desk' }, OWNER));
  const blocks = pageOf(k, 'Desk');
  const shown = drawn(blocks);

  const lead = shown.filter((b) => b.lead === true);
  assert.equal(lead.length, 1, 'one block leads');
  assert.equal(lead[0]!.kind, 'note');
  assert.match(lead[0]!.body!, /^No instalments for Desk yet\./);
  /* NO TILE OF FIGURES AND NO TRACK: a count of nought of nought and a day that is not there are a dash on a screen. */
  assert.deepEqual(shown.filter((b) => b.kind === 'stat' || b.kind === 'progress'), []);
  const table = tableOf(blocks);
  assert.equal(table.matched, 0);
  assert.match(table.empty!, /^[A-Z].*Desk.*\.$/, 'the empty list is a sentence that names the plan');
});

test('a plan with parts is led by one sentence, and a plan all paid says no next part', async () => {
  const k = await moneyCore();
  write(k, 'Flat', SIX);
  write(k, 'Desk', ['paid', 'paid']);
  const flat = pageOf(k, 'Flat');
  const lead = leadOf(flat);
  /* ONE LINE AND NOT FOUR FIGURES UNDER FOUR WORDS: "2 of 6 paid. E£176,500 left, the last part on 1 Jun 2027." */
  assert.equal(lead.kind, 'note');
  assert.equal(lead.body, sentenceOf('Flat'));
  /* EVERY FIGURE OF IT IS ANSWERED, by the words in its braces, so no brace is left for a person to read. */
  assert.deepEqual(Object.keys(lead.values ?? {}).sort(), ['plan-last-due:Flat', 'plan-parts-paid:Flat', 'plan-parts:Flat']);
  assert.deepEqual([said(flat, 'plan-parts-paid'), said(flat, 'plan-parts')], [2, 6]);
  assert.equal(dayOf(said(flat, 'plan-last-due')), daysOf('2027-06-01'));
  /* AND THE SENTENCE'S FIGURES ARE SAID ONCE: the summary under it holds the amounts and the next day. */
  const cells = drawn(flat).flatMap((b) => b.readings ?? []).map((c) => c.metric.split(':')[0]);
  /* NOTHING IS LATE, SO NO LATE IS DRAWN (MB3): a cell with nothing to say is left out, never "Late £0" with a tick. */
  assert.deepEqual(cells, ['plan-paid', 'plan-left', ...['parts-paid', 'parts', 'next-due', 'left', 'after-next'].map((f) => `plan-${f}-by-plan`)]);
  assert.equal(trackOf(flat, 'Flat').next, daysOf(due(3)));

  const desk = pageOf(k, 'Desk');
  assert.equal(trackOf(desk, 'Desk').next, null, 'nothing is next once every part is paid');
  /* ALL PAID IS LED BY ITS OWN SENTENCE, which asks for no amount left: no part is open, so nothing would be added up
     and the nought would have no currency to be written in. It still ends on the day the plan ended. */
  assert.equal(leadOf(desk).body, paidUpOf('Desk'));
  assert.deepEqual(Object.keys(leadOf(desk).values ?? {}).sort(), ['plan-last-due:Desk', 'plan-parts-paid:Desk', 'plan-parts:Desk']);
  assert.deepEqual([said(desk, 'plan-parts-paid'), said(desk, 'plan-parts'), read(desk, 'plan-paid').value], [2, 2, 2 * PART]);
  /* AND ITS SUMMARY SAYS PAID ALONE: nothing is left and nothing is late. */
  assert.deepEqual(headed(drawn(desk), 'Where it stands').readings!.map((c) => c.label), ['Paid']);
  assert.equal(dayOf(said(desk, 'plan-last-due')), daysOf(due(2)));
});

test('the lead is one of three sentences, by whether the plan has a part and whether one is open', async () => {
  const k = await moneyCore();
  write(k, 'Flat', SIX);
  write(k, 'Desk', ['paid', 'paid']);
  write(k, 'Car', ['open', 'open', 'open']);
  write(k, 'Boat', ['paid', 'cancelled']);
  value(k.create('plans', { name: 'Shed' }, OWNER));
  /* A day in the words, as the record answers it here and as it will once it answers a day as a day. */
  const day = (blocks: Block[]): string => String(said(blocks, 'plan-last-due'));

  /* A PART STILL OPEN: what is left is an amount in the parts' own currency, and the day is the day it will end. */
  const flat = pageOf(k, 'Flat');
  assert.equal(wordsOf(leadOf(flat)), `2 of 6 parts paid, the last due on ${day(flat)}.`);
  /* NONE PAID YET IS STILL A PLAN WITH A PART OPEN, and reads the same sentence from nought. */
  const car = pageOf(k, 'Car');
  assert.equal(leadOf(car).body, sentenceOf('Car'));
  assert.equal(wordsOf(leadOf(car)), `0 of 3 parts paid, the last due on ${day(car)}.`);

  /* EVERY PART PAID: nothing is left, in words, and no nought stands where an amount would. */
  const desk = pageOf(k, 'Desk');
  assert.equal(wordsOf(leadOf(desk)), `2 of 2 parts paid, and nothing is left. The last was due on ${day(desk)}.`);
  assert.doesNotMatch(wordsOf(leadOf(desk)), /\b0 left\b|\{\{/);
  /* A CANCELLED PART IS IN NEITHER SIDE HERE TOO: one paid and one cancelled is a plan all paid, of one part. */
  const boat = pageOf(k, 'Boat');
  assert.equal(wordsOf(leadOf(boat)), `1 of 1 parts paid, and nothing is left. The last was due on ${day(boat)}.`);
  assert.equal(dayOf(said(boat, 'plan-last-due')), daysOf(due(1)));

  /* AND NO PART AT ALL IS NEITHER: one sentence that says so, never "nothing is left" about a plan nobody has filled. */
  const shed = leadOf(pageOf(k, 'Shed'));
  assert.match(shed.body!, /^No instalments for Shed yet\./);
});

test('the two counts the lead waits on tell a plan all paid from a plan with a part open and from one with none', async () => {
  const k = await moneyCore();
  write(k, 'Flat', SIX);
  write(k, 'Desk', ['paid', 'paid']);
  const of = (id: string, name: string): Reading => value<Reading>(k.metric({ ...PLAN_FIGURES[id], where: String(PLAN_FIGURES[id]!.where).replace('{{it}}', name) } as never));

  /* PARTS THAT STAND, THEN PARTS STILL OPEN: 6 and 4 with a part open, 2 and 0 all paid, 0 and 0 with no part. */
  assert.deepEqual([of('plan-parts', 'Flat').value, of('plan-parts', 'Desk').value, of('plan-parts', 'Shed').value], [6, 2, 0]);
  assert.deepEqual([of('plan-parts-open', 'Flat').value, of('plan-parts-open', 'Desk').value, of('plan-parts-open', 'Shed').value], [4, 0, 0]);
});

test('all paid is two counts held together, and no share of the money is asked', () => {
  const leads = (MONEY_PLAN_PAGE.blocks as { lead?: boolean; when?: unknown }[]).filter((b) => b.lead === true).map((b) => b.when);
  /* NO PART, A PART OPEN, EVERY PART PAID. Counts only: a count is one number whatever currencies the parts are in,
     and is a number when the parts' amounts add up to nought, where a share of the money was neither. */
  assert.deepEqual(leads, [
    { metric: 'plan-parts:{{name}}', lt: 1 },
    { all: [{ metric: 'plan-parts:{{name}}', gte: 1 }, { metric: 'plan-parts-open:{{name}}', gte: 1 }] },
    { all: [{ metric: 'plan-parts:{{name}}', gte: 1 }, { metric: 'plan-parts-open:{{name}}', lt: 1 }] },
  ]);
  assert.equal('plan-share-left' in PLAN_FIGURES, false, 'the share is no longer a figure');
  assert.equal(Object.values(PLAN_FIGURES).some((f) => 'lookups' in f), false, 'and no figure of a plan reads by a table of factors');
});

test('a plan whose parts are all nought and all paid still says nothing is left', async () => {
  const k = await moneyCore();
  /* PARTS OF NOUGHT ARE PARTS: a deposit waived, a month free. Their amounts add up to nought, so a share of the
     money had nothing to divide by and the page was led by no sentence at all. */
  value(k.create('plans', { name: 'Gym' }, OWNER));
  for (const n of [1, 2]) value(k.create('installments', { what: `Gym, part ${n}`, plan: 'Gym', number: n, direction: 'out', amount: egp(0), due: due(n), state: 'paid' }, OWNER));
  const gym = pageOf(k, 'Gym');
  assert.equal(leadOf(gym).body, paidUpOf('Gym'));
  assert.deepEqual([said(gym, 'plan-parts-paid'), said(gym, 'plan-parts')], [2, 2]);
  assert.equal(dayOf(said(gym, 'plan-last-due')), daysOf(due(2)));
});

test('a plan in two currencies with one all paid and one open is led by the open sentence alone', async () => {
  const k = await moneyCore();
  const part = (plan: string, n: number, amount: Money, state: string): void =>
    void value(k.create('installments', { what: `${plan}, part ${n}`, plan, number: n, direction: 'out', amount, due: due(n), state }, OWNER));
  /* NO RATE IS ON THE RECORD, so nothing here is turned into one currency: dollars all paid, pounds still open. */
  value(k.create('plans', { name: 'Trip' }, OWNER));
  part('Trip', 1, { amount: 50_000, currency: 'USD' }, 'paid');
  part('Trip', 2, egp(PART), 'open');
  const trip = pageOf(k, 'Trip');
  /* ONE BLOCK LEADS (`leadOf` holds that), and it is the one about what is left, in the currency that is left. */
  assert.equal(leadOf(trip).body, sentenceOf('Trip'));
  assert.deepEqual([said(trip, 'plan-parts-paid'), said(trip, 'plan-parts')], [1, 2]);
  assert.deepEqual([read(trip, 'plan-left').value, read(trip, 'plan-left').unit], [PART, 'EGP']);

  /* AND BOTH CURRENCIES PAID IS ALL PAID, once and not once a currency. */
  value(k.create('plans', { name: 'Tour' }, OWNER));
  part('Tour', 1, { amount: 50_000, currency: 'USD' }, 'paid');
  part('Tour', 2, egp(PART), 'paid');
  const tour = pageOf(k, 'Tour');
  assert.equal(leadOf(tour).body, paidUpOf('Tour'));
  assert.deepEqual([said(tour, 'plan-parts-paid'), said(tour, 'plan-parts')], [2, 2]);
});

test('nothing a person reads on the page is an id, a dash or a word about the list', () => {
  const blocks = MONEY_PLAN_PAGE.blocks as { heading?: string; body?: string; says?: { body: string }[]; empty?: string; cells?: { label?: string }[]; columns?: { label?: string }[] }[];
  const copy = blocks
    .flatMap((b) => [b.heading, b.body, ...(b.says ?? []).map((l) => l.body), b.empty, ...(b.cells ?? []).map((c) => c.label), ...(b.columns ?? []).map((c) => c.label)])
    .filter((s): s is string => typeof s === 'string');
  assert.ok(copy.length > 6);
  for (const said of copy) {
    assert.doesNotMatch(said, /[—–]/, said);
    assert.doesNotMatch(said, /\b(row|rows|list item|entity|record)\b/i, said);
    /* ONLY THE PLAN'S NAME IS FILLED, alone or as the plan a figure of the plan is asked about. */
    assert.equal(said.replace(/\{\{plan-[a-z-]+:\{\{name\}\}\}\}/g, '').replace(/\{\{name\}\}/g, '').includes('{{'), false, said);
  }
  /* AND IT IS A SHORT PAGE, well inside the twenty-four blocks a page holds, and Money's own gains none from it. */
  assert.ok(blocks.length <= 12);
});

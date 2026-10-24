/**
 * A plan as a thing of its own (REC-B12 jobs 1 and 2), one test an effect.
 *
 * `plansFromNames` IS THE DECISION AND `run` IS THE SCRIPT ROUND IT, and both are measured, as `money-settle.test.ts`
 * measures `settle`: the decision on plain fields, and the script as a host's sandbox runs it, its declared `source`
 * imported as a module and handed a `ctx` that answers one page of fifty, newest first, and applies what the script
 * wrote only once the run is over. So a script that read one page of a plan of 120 parts fails here.
 *
 * RED FIRST: with no `lists/plans.ts` or `scripts/plans-from-names.js` the file does not load; with `plan_row` or
 * `left_after` off Instalments the test of the fields fails.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan as planOf, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Entry, type Kernel } from '@braindog/kernel';
import { sayOf } from '@braindog/ports';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { NOW, firstPartyDocument, gbp } from '../src/index.ts';
import { INSTALLMENTS_REGISTER } from '../src/modules/money/lists/installments.ts';
import { PLANS_REGISTER } from '../src/modules/money/lists/plans.ts';

type Fields = Record<string, unknown>;
type Row = { list: string; id: string; spoken: string; version: number; fields: Fields };
type Patch = { id: string; version: number; fields: Fields };
type Twins = { keep: Row; others: Row[] };
type Made = { plans: Fields[]; writes: Patch[]; waiting: number; twins: Twins[] };
type Ask = { cause: string; question: string; about: string[]; options: { id: string; label: string; because: string; patches?: Patch[] }[] };
type Script = {
  plansFromNames: (parts: Row[], plans: Row[]) => Made;
  twinsAsk: (twins: Twins[]) => Ask | null;
  PLANS_FROM_NAMES_SCRIPT: Record<string, unknown>;
};
/* BY A PATH WORKED OUT HERE AND NOT WRITTEN AS A LITERAL, because the script's `.d.ts` is the integrator's to add, and
   a literal import of a `.js` with none does not typecheck under strict. */
const at = new URL('../src/modules/money/scripts/plans-from-names.js', import.meta.url).href;
const { plansFromNames, twinsAsk, PLANS_FROM_NAMES_SCRIPT } = (await import(at)) as Script;

const usd = (minor: number) => ({ amount: minor, currency: 'USD' });
const row = (list: string, seq: number, fields: Fields): Row => ({ list, id: `e_${list}_${seq}`, spoken: `${list}#${seq}`, version: 3, fields });
/** One part of a plan: `n` is its number in the list and in the plan, and it falls due on the 1st of month `n` of 2027. */
const part = (plan: string, n: number, more: Fields = {}): Row =>
  row('installments', n, {
    what: `${plan}, part ${n}`,
    plan,
    number: n,
    direction: 'out',
    amount: gbp(10_000),
    due: `2027-${String(n).padStart(2, '0')}-01`,
    state: 'open',
    ...more,
  });
const planRow = (seq: number, name: string, more: Fields = {}): Row => row('plans', seq, { name, state: 'open', ...more });
const desk = (more: (n: number) => Fields = () => ({})) => [1, 2, 3].map((n) => part('Desk', n, more(n)));

/** What a result writes to one part, or nothing. */
const written = (out: Made, spoken: string): Fields | undefined => out.writes.find((w) => w.id === spoken)?.fields;
/** The rows as they stand once a result is written: each plan made gets the next number, each change its fields. */
const after = (parts: Row[], plans: Row[], out: Made): { parts: Row[]; plans: Row[] } => {
  const change = (r: Row): Row => {
    const w = out.writes.find((x) => x.id === r.spoken);
    return w ? { ...r, version: r.version + 1, fields: { ...r.fields, ...w.fields } } : r;
  };
  const made = out.plans.map((fields, i) => row('plans', plans.length + i + 1, fields));
  return { parts: parts.map(change), plans: [...plans.map(change), ...made] };
};

test('Plans holds a name, who, the account, a note and a status, and no amount', () => {
  assert.equal(PLANS_REGISTER.id, 'plans');
  assert.equal(PLANS_REGISTER.name, 'Plans');
  assert.equal(PLANS_REGISTER.pack, 'money-core');
  assert.equal(PLANS_REGISTER.title, 'name');
  assert.deepEqual(PLANS_REGISTER.fields.map((f) => f.id), ['name', 'party', 'account', 'note', 'state', 'one_with']);
  const field = (id: string) => PLANS_REGISTER.fields.find((f) => f.id === id) as Fields;
  assert.deepEqual(field('name'), { id: 'name', type: 'text', required: true, unique: true, search: true });
  assert.deepEqual([field('party').to, field('account').to], ['people', 'accounts']);
  assert.deepEqual(field('state').values, ['open', 'paid', 'cancelled']);
  assert.equal(field('state').default, 'open');
  assert.deepEqual([PLANS_REGISTER.state, PLANS_REGISTER.done], ['state', ['paid', 'cancelled']]);
  /* THE TOTAL IS THE SUM OF THE PARTS, so a plan that held an amount could disagree with them. */
  assert.equal(PLANS_REGISTER.fields.some((f) => f.type === 'money'), false);
  /* A PLAN ITS PARTS POINT AT IS NOT DELETED OUT FROM UNDER THEM. */
  assert.equal(PLANS_REGISTER.delete, 'refuse_while_referenced');
});

test('an instalment links to its plan and holds what is left after it, and the plan text stays', () => {
  const field = (id: string) => INSTALLMENTS_REGISTER.fields.find((f) => f.id === id) as Fields | undefined;
  assert.deepEqual(field('plan_row'), { id: 'plan_row', label: 'Part of', type: 'ref', to: 'plans' });
  assert.deepEqual(field('left_after'), { id: 'left_after', label: 'Left after', type: 'money' });
  assert.deepEqual(field('plan'), { id: 'plan', type: 'text', index: true, required: true, search: true });
  /* NEITHER IS INDEXED: the list stays one short of the eight a list may index. */
  assert.equal(INSTALLMENTS_REGISTER.fields.filter((f) => (f as Fields).index === true).length, 7);
});

test('each distinct plan text becomes one plan, named as the parts name it', () => {
  const parts = [part('Car', 5), ...desk(), part('Car', 4), part('desk', 6), part('  ', 7)];
  const out = plansFromNames(parts, []);
  /* IN THE ORDER THEIR FIRST PARTS WERE WRITTEN. A TEXT WRITTEN ANOTHER WAY IS THE SAME PLAN, named as its oldest part
     writes it (the audit of 25 October, Y1); a blank one is no plan. */
  assert.deepEqual(out.plans, [{ name: 'Desk', state: 'open' }, { name: 'Car', state: 'open' }]);
  /* A PLAN MADE IN THIS RUN HAS NO ID UNTIL THE RUN IS OVER, so its parts are linked by the next one. */
  assert.equal(out.waiting, 6);
  assert.equal(out.writes.some((w) => 'plan_row' in w.fields), false);
});

test('a plan is one plan whatever its capitals, accents and spaces, and its parts are linked to it', () => {
  const parts = [part('Kiln', 1), part('kiln', 2), part(' KILN  ', 3), part('Kíln', 4)];
  /* NO PLAN YET: one is made, named as the oldest part writes it, and no second beside it. */
  assert.deepEqual(plansFromNames(parts, []).plans, [{ name: 'Kiln', state: 'open' }]);
  /* A PLAN HERE: every part is its, and what is left counts all four. */
  const out = plansFromNames(parts, [planRow(1, 'kiln')]);
  assert.deepEqual(out.plans, []);
  assert.deepEqual([1, 2, 3, 4].map((n) => written(out, `installments#${n}`)?.plan_row), ['e_plans_1', 'e_plans_1', 'e_plans_1', 'e_plans_1']);
  assert.deepEqual(written(out, 'installments#1')?.left_after, gbp(30_000));
  /* A NAME WRITTEN WITH SPACES AT ITS ENDS IS MADE WITHOUT THEM. */
  assert.deepEqual(plansFromNames([part('  Big   Kiln ', 1)], []).plans, [{ name: 'Big Kiln', state: 'open' }]);
});

test('two plans already here under one name are a question: each keeps its own parts, and nothing new is made', () => {
  /* THE AUDIT'S CASE, with invented names: "Loft" holds part 1, and a second run made "loft" for parts 2 and 3. */
  const parts = [part('Loft', 1, { plan_row: 'e_plans_1' }), part('loft', 2, { plan_row: 'e_plans_2' }), part('loft', 3, { plan_row: 'e_plans_2' }), part('LOFT', 4)];
  const plans = [planRow(1, 'Loft'), planRow(2, 'loft')];
  const out = plansFromNames(parts, plans);
  assert.deepEqual(out.plans, [], 'no third plan for the part written LOFT');
  assert.equal(written(out, 'installments#4'), undefined, 'a part neither twin names waits for his answer');
  /* EACH STAYS WITH ITS OWN, as before: no part is moved from one twin to the other without his answer. */
  assert.equal(out.writes.some((w) => w.fields.plan_row !== undefined), false);
  assert.deepEqual(out.twins.map((t) => [t.keep.spoken, t.others.map((o) => o.spoken)]), [['plans#1', ['plans#2']]]);
});

test('the twins question names both plans, and its yes closes and links the second, and changes no part', () => {
  const loft = { keep: planRow(1, 'Loft'), others: [planRow(2, 'loft')] };
  const ask = twinsAsk([loft])!;
  assert.equal(ask.question, 'Loft and loft are one plan written two ways. Make them one plan?');
  assert.equal(ask.cause, 'plans.twins:1.2');
  assert.deepEqual(ask.about, ['Loft']);
  assert.deepEqual(ask.options.map((o) => [o.id, o.label]), [['one', 'Make them one'], ['apart', 'Keep them apart']]);
  assert.deepEqual(ask.options[0]!.patches, [{ id: 'plans#2', version: 3, fields: { one_with: 'e_plans_1', state: 'cancelled' } }]);
  assert.equal(ask.options[0]!.because, 'The parts of loft move to Loft, and loft is closed and kept, linked to Loft. Nothing is deleted.');
  assert.equal(ask.options[1]!.patches, undefined, 'keeping them apart changes nothing');
  /* TWO PAIRS ARE ONE QUESTION, and a plan already closed is linked and left closed. */
  const kiln = { keep: planRow(3, 'Kiln'), others: [planRow(4, 'kiln', { state: 'paid' })] };
  const both = twinsAsk([loft, kiln])!;
  assert.equal(both.question, 'Loft and Kiln are each one plan written more than one way (Loft and loft; Kiln and kiln). Make each one plan?');
  assert.equal(both.cause, 'plans.twins:1.2_3.4');
  assert.deepEqual(both.options[0]!.patches!.map((p) => p.fields), [{ one_with: 'e_plans_1', state: 'cancelled' }, { one_with: 'e_plans_3' }]);
  for (const words of [both.question, ...both.options.map((o) => o.because)]) assert.doesNotMatch(words, /#\d|e_[a-z]+_\d|one_with|—/);
  assert.equal(twinsAsk([]), null);
});

test('once the second plan is made one with the first, its parts move to the first and are counted with it', () => {
  const parts = [part('Loft', 1, { plan_row: 'e_plans_1' }), part('loft', 2, { plan_row: 'e_plans_2' }), part('loft', 3, { plan_row: 'e_plans_2' })];
  const plans = [planRow(1, 'Loft'), planRow(2, 'loft', { state: 'cancelled', one_with: 'e_plans_1' })];
  const out = plansFromNames(parts, plans);
  assert.deepEqual(out.twins, []);
  assert.deepEqual([2, 3].map((n) => written(out, `installments#${n}`)?.plan_row), ['e_plans_1', 'e_plans_1']);
  assert.deepEqual(written(out, 'installments#1')?.left_after, gbp(20_000));
  /* THE CLOSED SECOND PLAN IS LEFT AS IT IS: kept, closed, and never written by a count. */
  assert.equal(written(out, 'plans#2'), undefined);
  /* ONE THAT NAMES A PLAN NO LONGER HERE IS A PLAN AGAIN, so its parts are not left with nowhere to go. */
  const orphan = plansFromNames(parts.slice(1), [planRow(2, 'loft', { one_with: 'e_plans_9' })]);
  assert.deepEqual([orphan.plans, orphan.twins], [[], []]);
});

test('a new plan takes who and the account when every part that names one names the same', () => {
  const same = desk((n) => (n === 2 ? {} : { party: 'e_people_1', account: 'e_accounts_3' }));
  assert.deepEqual(plansFromNames(same, []).plans, [{ name: 'Desk', state: 'open', party: 'e_people_1', account: 'e_accounts_3' }]);
  const differ = desk((n) => ({ party: 'e_people_1', account: `e_accounts_${n}` }));
  assert.deepEqual(plansFromNames(differ, []).plans, [{ name: 'Desk', state: 'open', party: 'e_people_1' }]);
});

test('a plan that is already there is not made again, and its parts are linked to it', () => {
  const out = plansFromNames(desk(), [planRow(1, 'Desk')]);
  assert.deepEqual([out.plans, out.waiting], [[], 0]);
  for (const n of [1, 2, 3]) assert.equal(written(out, `installments#${n}`)?.plan_row, 'e_plans_1');
  /* AT THE VERSION EACH PART WAS READ AT, so a part edited since is refused and read again. */
  assert.deepEqual(out.writes.map((w) => w.version), [3, 3, 3]);
});

test('a part linked to another plan than its text names is linked to the one it names', () => {
  const out = plansFromNames(desk((n) => ({ plan_row: n === 1 ? 'e_plans_9' : 'e_plans_1' })), [planRow(1, 'Desk')]);
  assert.deepEqual(out.writes.filter((w) => 'plan_row' in w.fields).map((w) => [w.id, w.fields.plan_row]), [['installments#1', 'e_plans_1']]);
});

test('what is left after a part is the open parts due after it, and the last reads nought', () => {
  const out = plansFromNames(desk(), [planRow(1, 'Desk')]);
  assert.deepEqual([1, 2, 3].map((n) => written(out, `installments#${n}`)?.left_after), [gbp(20_000), gbp(10_000), gbp(0)]);
  /* THE PARTS ADD UP TO THE PLAN: the first part and what is left after it are the whole of it. */
  assert.equal(10_000 + (written(out, 'installments#1')!.left_after as { amount: number }).amount, 30_000);
});

test('a part that is paid or cancelled is not counted in what is left, and still says what is left after it', () => {
  for (const state of ['paid', 'cancelled']) {
    const out = plansFromNames(desk((n) => (n === 2 ? { state } : {})), [planRow(1, 'Desk')]);
    assert.deepEqual([1, 2, 3].map((n) => written(out, `installments#${n}`)?.left_after), [gbp(10_000), gbp(10_000), gbp(0)]);
  }
});

test('two currencies are never added: what is left is counted in the part\'s own', () => {
  const out = plansFromNames(desk((n) => (n === 2 ? { amount: usd(500) } : {})), [planRow(1, 'Desk')]);
  assert.deepEqual([1, 2, 3].map((n) => written(out, `installments#${n}`)?.left_after), [gbp(10_000), usd(0), gbp(0)]);
});

test('two parts due on one day are counted in the order of their numbers', () => {
  const out = plansFromNames(desk((n) => (n === 3 ? {} : { due: '2027-01-01' })).reverse(), [planRow(1, 'Desk')]);
  assert.deepEqual([1, 2, 3].map((n) => written(out, `installments#${n}`)?.left_after), [gbp(20_000), gbp(10_000), gbp(0)]);
});

test('a part with no amount or no day is linked, counted nowhere and told nothing about what is left', () => {
  const out = plansFromNames(desk((n) => (n === 2 ? { amount: undefined } : n === 3 ? { due: undefined } : {})), [planRow(1, 'Desk')]);
  assert.deepEqual(written(out, 'installments#1'), { plan_row: 'e_plans_1', left_after: gbp(0) });
  assert.deepEqual(written(out, 'installments#2'), { plan_row: 'e_plans_1' });
  assert.deepEqual(written(out, 'installments#3'), { plan_row: 'e_plans_1' });
});

test('run again on what it left, it makes nothing and changes nothing', () => {
  const parts = [...desk(), part('Car', 4, { state: 'paid' }), part('Car', 5)];
  const first = plansFromNames(parts, []);
  const one = after(parts, [], first);
  const second = plansFromNames(one.parts, one.plans);
  /* THE SECOND RUN ONLY LINKS: the plans are there now, and what is left was written by the first. */
  assert.deepEqual([second.plans, second.waiting], [[], 0]);
  assert.deepEqual(second.writes.map((w) => Object.keys(w.fields)), parts.map(() => ['plan_row']));
  const two = after(one.parts, one.plans, second);
  assert.deepEqual(plansFromNames(two.parts, two.plans), { plans: [], writes: [], waiting: 0, twins: [] });
  assert.deepEqual(two.plans.map((p) => p.fields.name), ['Desk', 'Car']);
});

test('a plan is paid once no part of it is open, and a plan that reads paid or cancelled is left as it is', () => {
  const paid = () => desk(() => ({ state: 'paid' }));
  assert.deepEqual(plansFromNames(paid(), []).plans, [{ name: 'Desk', state: 'paid' }]);
  assert.deepEqual(plansFromNames(desk(() => ({ state: 'cancelled' })), []).plans, [{ name: 'Desk', state: 'cancelled' }]);
  assert.deepEqual(written(plansFromNames(paid(), [planRow(1, 'Desk')]), 'plans#1'), { state: 'paid' });
  /* A CLOSED PLAN IS NOT OPENED BY A COUNT: he marked it paid with parts still open, and it stays paid. */
  assert.equal(written(plansFromNames(desk(), [planRow(1, 'Desk', { state: 'paid' })]), 'plans#1'), undefined);
  assert.equal(written(plansFromNames(desk((n) => (n === 1 ? { state: 'paid' } : {})), [planRow(1, 'Desk', { state: 'paid' })]), 'plans#1'), undefined);
  /* CANCELLED IS A PERSON'S WORD ABOUT THE PLAN, and no count of its parts takes it back. */
  assert.equal(written(plansFromNames(desk(), [planRow(1, 'Desk', { state: 'cancelled' })]), 'plans#1'), undefined);
  assert.equal(written(plansFromNames(desk(() => ({ state: 'cancelled' })), [planRow(1, 'Desk')]), 'plans#1'), undefined);
});

test('the script is Money\'s own, fetches nothing, runs each night and when a rule starts it', () => {
  assert.equal(PLANS_FROM_NAMES_SCRIPT.script, 'plans_from_names');
  assert.equal(PLANS_FROM_NAMES_SCRIPT.pack, 'money-core');
  assert.deepEqual([PLANS_FROM_NAMES_SCRIPT.egress, PLANS_FROM_NAMES_SCRIPT.keys], [[], []]);
  assert.deepEqual(PLANS_FROM_NAMES_SCRIPT.runs, { every: '1d', rule: true });
  assert.deepEqual(PLANS_FROM_NAMES_SCRIPT.reads, ['installments', 'plans']);
  assert.deepEqual(PLANS_FROM_NAMES_SCRIPT.writes, ['installments', 'plans']);
  /* PLANS THAT RUN FOR TEN YEARS ARE HUNDREDS OF PARTS, and the 200 writes a script gets unasked would take nights. */
  assert.deepEqual(PLANS_FROM_NAMES_SCRIPT.limits, { writes: 1000 });
  assert.match(PLANS_FROM_NAMES_SCRIPT.source as string, /function plansFromNames/);
});

/**
 * A record as a script meets it: `list` answers ONE PAGE OF FIFTY, the newest made first, `get` one row by its list and
 * number, and nothing the script writes is there until its run is over, when each change is held to the version it was
 * read at. The filter reads the few tests the script uses and refuses any other, so a filter the record would not
 * read is not passed over here.
 */
function recordOf(start: Row[]) {
  let rows = start;
  const seqOf = (r: Row) => Number(r.spoken.split('#')[1]);
  const matches = (r: Row, where: unknown): boolean => {
    if (where === undefined || where === null) return true;
    const w = where as { all?: unknown[]; field?: string; is?: unknown; lt?: number };
    if (w.all) return w.all.every((x) => matches(r, x));
    const held = w.field === 'seq' ? seqOf(r) : r.fields[w.field!];
    if ('is' in w) return held === w.is;
    if ('lt' in w) return typeof held === 'number' && held < w.lt!;
    /* AS THE RECORD READS IT: a word anywhere in the text, its capitals folded and nothing else. */
    const ascii = (s: string) => s.replace(/[A-Z]/g, (c) => c.toLowerCase());
    if ('contains' in w) return typeof held === 'string' && ascii(held).includes(ascii(String((w as { contains: unknown }).contains)));
    throw new Error(`a filter this record does not read: ${JSON.stringify(where)}`);
  };
  const shaped = (r: Row) => ({ id: r.id, seq: seqOf(r), version: r.version, fields: r.fields });
  let lists = 0;
  const run = async (input: Fields = {}) => {
    const updates: { spoken: string; patch: Fields; version: number }[] = [];
    const added: { list: string; fields: Fields }[] = [];
    const log: string[] = [];
    const ctx = {
      input,
      tz: 'UTC',
      now: () => '2026-10-13T09:00:00.000Z',
      record: {
        get: async (spoken: string) => {
          const found = rows.find((r) => r.spoken === spoken);
          return found ? shaped(found) : null;
        },
        list: async (list: string, where?: unknown) => {
          lists += 1;
          return rows.filter((r) => r.list === list && matches(r, where)).sort((a, b) => seqOf(b) - seqOf(a)).slice(0, 50).map(shaped);
        },
      },
      write: (list: string, fields: Fields) => void added.push({ list, fields }),
      update: (spoken: string, patch: Fields, version: number) => void updates.push({ spoken, patch, version }),
      log: (...words: string[]) => void log.push(words.join(' ')),
    };
    const mod = (await import(`data:text/javascript,${encodeURIComponent(PLANS_FROM_NAMES_SCRIPT.source as string)}`)) as { default: (c: typeof ctx) => Promise<unknown> };
    const out = await mod.default(ctx);
    for (const u of updates) {
      const old = rows.find((r) => r.spoken === u.spoken);
      assert.ok(old, `${u.spoken} is not in the record`);
      assert.equal(u.version, old.version, `${u.spoken} was written at a version it was not read at`);
      rows = rows.map((r) => (r === old ? { ...r, version: r.version + 1, fields: { ...r.fields, ...u.patch } } : r));
    }
    for (const a of added) rows = [...rows, row(a.list, rows.filter((r) => r.list === a.list).length + 1, a.fields)];
    return { out, updates, added, log };
  };
  return { run, rows: (list: string) => rows.filter((r) => r.list === list), lists: () => lists };
}

/** A flat paid monthly for ten years, January 2027 to December 2036, and a desk in three parts made after it. */
const TEN_YEARS = (): Row[] => {
  const flat = Array.from({ length: 120 }, (_, i) =>
    part('Flat', i + 1, { due: `${2027 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}-01`, amount: gbp(250_000) }),
  );
  return [...flat, ...[121, 122, 123].map((n) => part('Desk', n, { due: `2027-0${n - 120}-15` }))];
};

test('run on a record whose plans are only names, the script makes each plan, then links every part, then rests', async () => {
  const record = recordOf(TEN_YEARS());
  const first = await record.run();
  assert.deepEqual(first.added, [
    { list: 'plans', fields: { name: 'Flat', state: 'open' } },
    { list: 'plans', fields: { name: 'Desk', state: 'open' } },
  ]);
  /* EVERY PART OF A PLAN OF 120, which is more than two pages of a script's list. */
  assert.equal(first.updates.length, 123);
  assert.deepEqual(record.rows('installments').find((r) => r.spoken === 'installments#1')!.fields.left_after, gbp(119 * 250_000));
  assert.deepEqual(record.rows('installments').find((r) => r.spoken === 'installments#120')!.fields.left_after, gbp(0));

  const second = await record.run();
  assert.deepEqual([second.added, second.updates.length], [[], 123]);
  const idOf = (name: string) => record.rows('plans').find((p) => p.fields.name === name)!.id;
  for (const p of record.rows('installments')) assert.equal(p.fields.plan_row, idOf(String(p.fields.plan)), `${String(p.fields.what)} is linked to its own plan`);

  const third = await record.run();
  assert.deepEqual([third.out, third.added, third.updates, third.log], [null, [], [], []]);
});

test('what the script says names the plans and holds no id', async () => {
  const record = recordOf(TEN_YEARS());
  const said = [...(await record.run()).log, ...(await record.run()).log];
  assert.deepEqual(said, ['Made 2 plans, Flat and Desk, and counted what is left after 123 parts.', 'Linked 123 parts to their plans.']);
  for (const line of said) assert.doesNotMatch(line, /#\d|e_[a-z]+_\d|plan_row|left_after/);
});

test('handed one part by a rule, the script reads and writes that part\'s plan alone', async () => {
  const record = recordOf([...TEN_YEARS(), planRow(1, 'Flat'), planRow(2, 'Desk')]);
  const { out, updates } = await record.run({ id: 'e_installments_122', register: 'installments', seq: 122 });
  assert.deepEqual(updates.map((u) => u.spoken).sort(), ['installments#121', 'installments#122', 'installments#123']);
  assert.deepEqual(out, { plans: 0, parts: 3, more: false });
  /* ONE PAGE OF PARTS AND ONE OF PLANS, where the whole record is four. */
  assert.equal(record.lists(), 2);
  const gone = await record.run({ register: 'installments', seq: 999 });
  assert.deepEqual([gone.out, gone.updates, gone.log], [null, [], ['The part is no longer in the record, so no plan was counted.']]);
});

test('a plan closed by hand with parts still open stays closed night after night, and nothing is said', async () => {
  const record = recordOf([...desk((n) => ({ plan_row: 'e_plans_1', left_after: gbp((3 - n) * 10_000) })), planRow(1, 'Desk', { state: 'paid' })]);
  for (const night of [1, 2, 3]) {
    const { out, updates, added, log } = await record.run();
    assert.deepEqual([out, updates, added, log], [null, [], [], []], `night ${night}`);
  }
  assert.equal(record.rows('plans')[0]!.fields.state, 'paid');
  /* AND A PART WRITTEN UNDER IT DOES NOT OPEN IT EITHER, which is what a rule hands the script. */
  const handed = await record.run({ register: 'installments', seq: 2 });
  assert.deepEqual([handed.out, handed.updates], [null, []]);
});

test('handed the plan a run made, the script links that plan\'s parts and reads no other plan', async () => {
  const record = recordOf(TEN_YEARS());
  const first = await record.run({ register: 'installments', seq: 121 });
  assert.deepEqual(first.added, [{ list: 'plans', fields: { name: 'Desk', state: 'open' } }]);
  for (const p of record.rows('installments')) assert.equal(p.fields.plan_row, undefined, 'a plan made in a run has no id to link to yet');

  /* THE SECOND PASS, as a rule on Plans hands it: the plan by its list and number. */
  const before = record.lists();
  const second = await record.run({ id: 'e_plans_1', register: 'plans', seq: 1 });
  assert.deepEqual(second.updates.map((u) => [u.spoken, u.patch]).sort(), [121, 122, 123].map((n) => [`installments#${n}`, { plan_row: 'e_plans_1' }]));
  assert.deepEqual([second.out, second.log], [{ plans: 0, parts: 3, more: false }, ['Linked 3 parts to their plans.']]);
  assert.equal(record.lists() - before, 2, 'one page of parts and one of plans');
  assert.deepEqual((await record.run({ plan: 'plans#1' })).out, null, 'a third run writes nothing');

  const gone = await record.run({ register: 'plans', seq: 999 });
  assert.deepEqual([gone.out, gone.updates, gone.log], [null, [], ['The plan is no longer in the record, so no part was linked.']]);
});

test('handed a part written another way, the script links it to the plan and makes no second plan', async () => {
  const record = recordOf([part('Loft', 1, { plan_row: 'e_plans_1' }), part('loft', 2), planRow(1, 'Loft')]);
  const { out, added, updates } = await record.run({ register: 'installments', seq: 2 });
  assert.deepEqual(added, [], 'no plan "loft" beside "Loft"');
  assert.deepEqual(updates.find((u) => u.spoken === 'installments#2')?.patch.plan_row, 'e_plans_1');
  assert.equal((out as { ask?: unknown }).ask, undefined, 'a part\'s run asks nothing');
  /* A NAME WITH A LETTER BEYOND THE RECORD'S FOLDING READS EVERY PART, and still keeps only its own. */
  const accented = recordOf([part('Kíln', 1), part('kiln', 2), part('Loft', 3), planRow(1, 'Kiln')]);
  const handed = await accented.run({ register: 'installments', seq: 1 });
  assert.deepEqual(handed.updates.map((u) => u.spoken).sort(), ['installments#1', 'installments#2']);
});

test('the run over every plan asks once about twins, and a part\'s run never does', async () => {
  const record = recordOf([part('Loft', 1, { plan_row: 'e_plans_1', left_after: gbp(0) }), part('loft', 2, { plan_row: 'e_plans_2', left_after: gbp(0) }), planRow(1, 'Loft'), planRow(2, 'loft')]);
  const night = await record.run();
  assert.deepEqual([night.added, night.updates], [[], []]);
  const ask = (night.out as { ask: Ask }).ask;
  assert.equal(ask.cause, 'plans.twins:1.2');
  assert.deepEqual(ask.options[0]!.patches, [{ id: 'plans#2', version: 3, fields: { one_with: 'e_plans_1', state: 'cancelled' } }]);
  assert.equal(((await record.run({ register: 'installments', seq: 2 })).out as { ask?: unknown } | null)?.ask, undefined);
});

test('handed a plan no part names, the script writes nothing and says nothing', async () => {
  const record = recordOf([...desk(), planRow(1, 'Holiday')]);
  const { out, updates, added, log } = await record.run({ register: 'plans', seq: 1 });
  assert.deepEqual([out, updates, added, log], [null, [], [], []]);
});

test('a run stops short of the writes it may make and says the rest waits, and later runs finish', async () => {
  const many = Array.from({ length: 950 }, (_, i) => part(`Plan ${Math.floor(i / 95) + 1}`, i + 1, { due: `2027-01-${String((i % 28) + 1).padStart(2, '0')}` }));
  const record = recordOf(many);
  const first = await record.run();
  assert.equal(first.added.length + first.updates.length, 900);
  assert.deepEqual(first.out, { plans: 10, parts: 890, more: true });
  assert.match(first.log.at(-1)!, /The rest waits for the next run\.$/);
  let runs = 1;
  while ((await record.run()).out !== null) assert.ok(++runs < 6, 'the runs come to rest');
  assert.equal(record.rows('plans').length, 10);
  assert.equal(record.rows('installments').every((p) => typeof p.fields.plan_row === 'string' && p.fields.left_after !== undefined), true);
});

/**
 * ON A RECORD HOLDING MONEY AS ITS PACK DOCUMENT SAYS IT, so Plans is a list the record takes, the link and the figure
 * are fields Instalments holds, and the page after the first is asked for in a filter the record reads.
 *
 * PLANS IS LAID IN HERE WHILE MONEY'S DOCUMENT DOES NOT YET NAME IT, ahead of Instalments, which links to it. Once
 * the document carries the list itself, nothing is added and this runs on the document alone.
 */
const OWNER = { actor: 'p_1' };
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
const withPlans = (doc: unknown): unknown => {
  const d = doc as { declarations: Fields[] };
  if (d.declarations.some((x) => x.register === 'plans')) return doc;
  const { id, ...rest } = PLANS_REGISTER;
  const at = d.declarations.findIndex((x) => x.register === 'installments');
  return { ...d, declarations: [...d.declarations.slice(0, at), { register: id, ...rest }, ...d.declarations.slice(at)] };
};

test('on a record, a plan of sixty parts is made, linked and counted across two pages', async () => {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  for (const id of ['portfolio', 'people', 'money-core'] as const) {
    const doc = firstPartyDocument(id, { seeds: [] });
    const pack = value<Pack>(await normalise((id === 'money-core' ? withPlans(doc) : doc) as never, { kind: 'local' }));
    const state: Installed = { format: 1, primitives: 1, record_version: k.version(), packs: k.packs(), declarations: k.declarations() as Installed['declarations'], rows: k.census() };
    const diff = await planOf(pack, state);
    value(await install(pack, diff, hostFor(k), diff.planHash));
  }
  const rowsOf = (register: string) => value<{ rows: Entry[] }>(k.list({ register, limit: 500 })).rows;
  for (let i = 0; i < 60; i++) {
    const due = `${2027 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}-01`;
    value(k.create('installments', { what: `Flat, part ${i + 1}`, plan: 'Flat', number: i + 1, direction: 'out', amount: gbp(250_000), due, state: i < 2 ? 'paid' : 'open' }, OWNER));
  }

  const shaped = (e: Entry) => ({ id: e.id, seq: e.seq!, version: e.version, fields: e.fields });
  const run = async (input: Fields = {}) => {
    const todo: (() => void)[] = [];
    const ctx = {
      input,
      tz: 'UTC',
      now: () => '2026-10-13T09:00:00.000Z',
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
    };
    const mod = (await import(`data:text/javascript,${encodeURIComponent(PLANS_FROM_NAMES_SCRIPT.source as string)}`)) as { default: (c: typeof ctx) => Promise<unknown> };
    const out = await mod.default(ctx);
    for (const write of todo) write();
    return out;
  };

  assert.deepEqual(await run(), { plans: 1, parts: 60, more: false });
  assert.deepEqual(await run(), { plans: 0, parts: 60, more: false });
  assert.equal(await run(), null);

  const [flat] = rowsOf('plans');
  assert.deepEqual([rowsOf('plans').length, flat!.fields.name, flat!.fields.state], [1, 'Flat', 'open']);
  const parts = rowsOf('installments').sort((a, b) => Number(a.fields.number) - Number(b.fields.number));
  assert.equal(parts.every((p) => p.fields.plan_row === flat!.id), true);
  /* TWO PAID, SO 58 ARE OPEN: after the first part all 58 are left, after the third 57, after the last none. */
  assert.deepEqual([0, 2, 59].map((i) => parts[i]!.fields.left_after), [gbp(58 * 250_000), gbp(57 * 250_000), gbp(0)]);

  /* HANDED ONE PART, AS A RULE HANDS IT, the plan's parts are asked for by its text and a number at once, which is a
     filter the record has to read for the second page; and a plan whose last part is paid is paid. */
  const third = parts[2]!;
  value(k.update('installments', third.id, { state: 'paid' }, OWNER));
  assert.deepEqual(await run({ register: 'installments', seq: third.seq }), { plans: 0, parts: 2, more: false });
  const now = rowsOf('installments').sort((a, b) => Number(a.fields.number) - Number(b.fields.number));
  assert.deepEqual([0, 1, 2, 59].map((i) => now[i]!.fields.left_after), [gbp(57 * 250_000), gbp(57 * 250_000), gbp(57 * 250_000), gbp(0)]);
  assert.equal(await run({ register: 'installments', seq: third.seq }), null);

  /* A TEXT WITH A SPACE AFTER IT, OR IN OTHER CAPITALS, IS THE ONE PLAN, made once and found again by the next run, so
     it is never made twice, which a unique name would refuse and the whole run with it. */
  for (const plan of ['Desk ', 'desk']) value(k.create('installments', { what: `${plan}, part 1`, plan, number: 1, direction: 'out', amount: gbp(10_000), due: '2027-03-01', state: 'paid' }, OWNER));
  await run();
  await run();
  assert.equal(await run(), null);
  const made = rowsOf('plans').sort((a, b) => a.seq! - b.seq!);
  assert.deepEqual(made.map((p) => [p.fields.name, p.fields.state]), [['Flat', 'open'], ['Desk', 'paid']]);
  const fold = (v: unknown) => String(v).trim().toLowerCase();
  assert.equal(rowsOf('installments').every((p) => made.some((m) => m.id === p.fields.plan_row && fold(m.fields.name) === fold(p.fields.plan))), true);
});

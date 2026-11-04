/**
 * Three of Money's pages: Budgets, Reports and Payees (money-core 3.29.0), and the one question that offers budgets.
 *
 * WHAT IS HELD HERE. Each page opens on its line, holds no more than a page may, draws no more than six tiles before
 * its fold, and answers on the sample without a refusal. On a record of invented spending: Budgets sets each budget
 * against this month and names what no category holds; the offer is one question whose "Use these" writes the limits
 * and whose asking writes nothing; Reports and Payees narrow by the months and the payee picked.
 *
 * THE CLOCK IS 20 OCTOBER 2026. Every name and amount is invented.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Entry, type Kernel, type ScriptAnswer, type Scripted } from '@braindog/kernel';
import { sayOf } from '@braindog/ports';
import { openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';

import { NOW, automationDeclarations, declarations, installSeed, metricDeclarations, pageDeclarations } from '../src/index.ts';
import { MONEY_METRICS, MONEY_PAGES } from '../src/modules/money.ts';
import { BUDGET_PAGE_FIGURES } from '../src/modules/money/figures/budgets2.ts';
import { HEALTH_FIGURES } from '../src/modules/money/figures/health.ts';
import { PAYEE_FIGURES } from '../src/modules/money/figures/payees.ts';
import { OFFER_BUDGETS_SCRIPT, budgetOffer, roundUp } from '../src/modules/money/scripts/offer-budgets.js';

const OWNER = { actor: 'p_1' };
const DAY = 86_400_000;
/** Noon on 20 October 2026. */
const TODAY = Date.UTC(2026, 9, 20, 12);
const egp = (major: number) => ({ amount: Math.round(major * 100), currency: 'EGP' });

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T };
  assert.ok(x.ok, sayOf(r as never));
  return x.value;
};

type Block = { kind: string; heading?: string; icon?: string; lead?: boolean; fold?: boolean; body?: string; empty?: string; unset?: string; when?: unknown; cells?: { label?: string; note?: string }[] };
type Drawn = Block & { drawn?: boolean; refusals?: unknown[]; rows?: { fields: Record<string, unknown> }[]; matched?: number; values?: Record<string, unknown>; queue?: { question: string; options: { label: string }[] }[] };

const SLUGS = ['money-budgets', 'money-reports', 'money-payees'] as const;
const blocksOf = (slug: string): Block[] => MONEY_PAGES[slug]!.blocks as unknown as Block[];

test('EACH PAGE OPENS ON ITS LINE OR ITS TOTALS, holds no more than a page may, and stands six tiles at most before its fold', () => {
  for (const slug of SLUGS) {
    const blocks = blocksOf(slug);
    /* REPORTS OPENS ON ITS TOTALS SINCE money-core 3.38.4 (ceeaf6193), which say what its line said; the line is said only while nothing moved. */
    if (slug === 'money-reports') {
      assert.deepEqual([blocks[0]!.kind, blocks[0]!.heading], ['stat', 'Totals'], 'Reports does not open on its totals');
      assert.deepEqual(blocks.filter((b) => b.lead === true).map((b) => b.when), [{ metric: 'out-by-month', lt: 1 }], 'Reports says a line beside its totals');
    } else {
      assert.equal(blocks[0]!.kind, 'note', `${slug} does not open on a line`);
      assert.equal(blocks[0]!.lead, true, `${slug} does not open on a line`);
    }
    assert.ok(blocks.length <= 24, `${slug} declares ${blocks.length} blocks`);
    const fold = blocks.findIndex((b) => b.kind === 'section' && b.fold === true);
    /* THE BUDGETS BY PERIOD ARE ONE TILE (money-core 3.31.0): a week's and a year's draw only while such a budget is set,
       beside the month's, as one list of budgets cut by its period. */
    const period = (b: Block) => b.kind === 'progress' && /^This (week|year)'s budgets$/u.test(b.heading ?? '');
    /* AND A STAT DECLARED SEVERAL WAYS UNDER ONE HEADING IS ONE TILE: Reports' Health is drawn one of three ways (since
       money-core 3.34.0), by whether some cash is in another currency and whether the kept rate is below nought, and
       only one is ever drawn. */
    const seen = new Set<string>();
    const once = (b: Block): boolean => {
      if (b.kind !== 'stat' || b.heading === undefined) return true;
      if (seen.has(b.heading)) return false;
      seen.add(b.heading);
      return true;
    };
    const above = (fold < 0 ? blocks : blocks.slice(0, fold)).filter((b) => !b.lead && b.kind !== 'section' && !period(b)).filter(once);
    /* REPORTS STANDS SEVEN: the over-by-one `calm-pages.test.ts` holds, its totals and health over the month picked. */
    assert.ok(above.length <= (slug === 'money-reports' ? 7 : 6), `${slug} stands ${above.length} tiles before its fold`);
    for (const b of blocks) if (b.heading !== undefined) assert.match(String(b.icon), /^[a-z][a-z0-9-]*$/u, `${slug}: ${b.heading} wears no glyph`);
    const read = blocks.flatMap((b) => [b.heading, b.body, b.empty, b.unset, ...(b.cells ?? []).flatMap((c) => [c.label, c.note])]).filter((t): t is string => typeof t === 'string');
    assert.ok(read.length >= 10, `${slug} reads ${read.length} texts`);
    for (const t of read) assert.doesNotMatch(t, /\bowe[ds]?\b|\bowing\b/iu, `${slug} says "${t}"`);
  }
});

test('EVERY FIGURE A PAGE NAMES IS MONEY’S, and every page answers on the sample with no refusal', async () => {
  const named = new Set<string>();
  for (const slug of SLUGS)
    for (const b of blocksOf(slug)) {
      const s = b as Block & { source?: string; spent?: string; cells?: { metric?: string }[] };
      if (typeof s.source === 'string' && s.source.startsWith('metric.')) named.add(s.source.slice('metric.'.length));
      if (typeof s.spent === 'string') named.add(s.spent);
      for (const c of s.cells ?? []) if (c.metric) named.add(c.metric);
      for (const m of String(b.body ?? '').matchAll(/\{\{([a-z0-9-]+)/gu)) named.add(m[1]!);
      const when = b.when as { metric?: string } | undefined;
      if (when?.metric) named.add(when.metric);
    }
  /* BUT THE RECORD'S OWN COUNT OF QUESTIONS, which the offer is drawn on. */
  for (const id of named) if (!id.startsWith('questions-open:')) assert.ok(MONEY_METRICS[id], `${id} is no figure of Money's`);

  const k = await openRecord(openSqlite(), { now: () => NOW });
  value(await installSeed(k));
  for (const slug of SLUGS) {
    const page = value<{ blocks: Drawn[] }>(k.page(slug));
    for (const b of page.blocks) assert.deepEqual(b.refusals ?? [], [], `${slug}: ${b.heading ?? b.kind} is refused`);
    /* A LINE OR, ON REPORTS WITH MONEY MOVED, ONE TOTALS (ceeaf6193). */
    if (slug === 'money-reports') assert.equal(page.blocks.filter((b) => b.heading === 'Totals' && b.drawn !== false).length, 1, 'Reports draws other than one Totals');
    else assert.ok(page.blocks.some((b) => b.lead && b.drawn !== false), `${slug} draws no line`);
  }
});

test('A BUDGET IS OFFERED FROM LAST MONTH, rounded up to a step a person types, and never below what was spent', () => {
  assert.equal(roundUp(133_000, 2), 140_000);
  assert.equal(roundUp(422_900, 2), 450_000);
  assert.equal(roundUp(1_953_300, 2), 2_000_000);
  assert.equal(roundUp(811_200, 2), 900_000);
  assert.equal(roundUp(76_000, 2), 80_000);
  assert.equal(roundUp(200_000, 2), 200_000);
  for (const minor of [1, 99, 12_345, 987_654, 5_000_001]) assert.ok(roundUp(minor, 2) >= minor);

  const cat = (seq: number, name: string) => ({ id: `ent_${seq}`, spoken: `categories#${seq}`, version: 1, fields: { name } });
  const out = (category: string, amount: { amount: number; currency: string }) => ({ id: 'x', fields: { category, amount } });
  const ask = budgetOffer(
    [cat(1, 'Groceries'), cat(2, 'Outings'), cat(3, 'Travel'), cat(4, 'Books')],
    [out('ent_1', egp(4_229)), out('ent_2', egp(1_000)), out('ent_2', egp(950)), out('ent_3', egp(300)), out('ent_3', { amount: 2_000, currency: 'USD' })],
    'EGP',
    '2026-10',
    'September',
  )!;
  assert.equal(ask.cause, 'money.budgets.2026-10');
  assert.equal(ask.about, 'Budgets');
  assert.equal(ask.question, 'Use 2 monthly budgets, EGP 6,500 a month in all? Groceries EGP 4,500 and Outings EGP 2,000.');
  assert.deepEqual(ask.options.map((o) => o.label), ['Use these', 'Not now']);
  assert.match(ask.options[0]!.because, /1 spent in another currency is left for you to set/u);
  assert.deepEqual(ask.options[0]!.patches, [
    { id: 'categories#1', version: 1, fields: { budget: egp(4_500) } },
    { id: 'categories#2', version: 1, fields: { budget: egp(2_000) } },
  ]);
  assert.equal(ask.options[1]!.patches, undefined, 'Not now writes something');
  /* NOTHING SPENT ON A CATEGORY WITH NO BUDGET IS NOTHING TO OFFER. */
  assert.equal(budgetOffer([cat(4, 'Books')], [out('ent_1', egp(10))], 'EGP', '2026-10', 'September'), null);
});

/* ── a record of invented spending ─────────────────────────────────────── */

const shaped = (e: Entry) => ({ id: e.id, seq: e.seq!, version: e.version, fields: e.fields });

/** The script's source, run as a host's sandbox runs it, its ask handed back to the kernel. */
function sandbox(k: Kernel) {
  return async (s: Scripted): Promise<ScriptAnswer> => {
    const ctx = {
      input: s.scripted.input,
      today: () => new Date(TODAY).toISOString().slice(0, 10),
      now: () => new Date(TODAY).toISOString(),
      record: {
        list: async (register: string, where: unknown) => value<{ rows: Entry[] }>(k.list({ register, limit: 50, ...(where === undefined ? {} : { where: where as never }) })).rows.map(shaped),
        get: async (id: string) => {
          const e = k.get(id);
          return e ? shaped(e) : null;
        },
      },
      write: () => assert.fail('the offer writes a row'),
      update: () => assert.fail('the offer changes a row'),
      log: () => {},
    };
    const mod = (await import(`data:text/javascript,${encodeURIComponent(s.scripted.decl.source)}`)) as { default: (c: typeof ctx) => Promise<unknown> };
    const out = (await mod.default(ctx)) as { ask?: unknown } | null;
    return { writes: [], log: '', usage: { fetches: 0, bytes: 0, wall_ms: 1, cpu_ms: 1 }, ...(out && out.ask ? { ask: out.ask } : {}) } as ScriptAnswer;
  };
}

async function spending() {
  const sql: NodeSql = openSqlite();
  let now = TODAY;
  const k = await openRecord(sql, { now: () => now });
  value(
    await k.install([
      ...declarations(),
      ...metricDeclarations(),
      ...pageDeclarations(),
      ...automationDeclarations(),
      { id: 'script.offer_budgets', kind: 'script', body: OFFER_BUDGETS_SCRIPT as never },
    ]),
  );
  const make = (register: string, fields: Record<string, unknown>) => value<Entry>(k.create(register, fields, OWNER));
  const account = make('accounts', { name: 'Harbour Bank', kind: 'bank', balance: egp(90_000), as_of: '2026-09-01', state: 'open' });
  const groceries = make('categories', { name: 'Groceries', direction: 'out', state: 'live', icon: 'shopping-cart', colour: 'lime', budget: egp(5_000), budget_alert: 80 });
  const outings = make('categories', { name: 'Outings', direction: 'out', state: 'live', icon: 'utensils', colour: 'pink' });
  const pay = make('categories', { name: 'Pay', direction: 'in', state: 'live' });
  const line = (on: string, payee: string, amount: number, category: Entry | null, direction = 'out') =>
    make('transactions', { what: payee.toUpperCase(), payee, on, amount: egp(amount), direction, account: account.id, state: 'cleared', ...(category ? { category: category.id } : {}) });
  line('2026-09-04', 'Corner Market', 1_200, groceries);
  line('2026-09-12', 'Lantern Grill', 1_450, outings);
  line('2026-09-20', 'Lantern Grill', 880, outings);
  line('2026-09-28', 'Northfield Co', 40_000, pay, 'in');
  line('2026-10-03', 'Corner Market', 2_100, groceries);
  line('2026-10-09', 'Lantern Grill', 600, outings);
  line('2026-10-11', 'Seaside Hotel', 7_500, null);
  line('2026-10-15', 'Corner Market', 900, groceries);
  line('2026-10-16', 'Corner Market', 350, null);
  line('2026-10-01', 'Northfield Co', 40_000, pay, 'in');

  const execute = (async () => {
    throw new Error('the script fetches nothing');
  }) as never;
  const run = sandbox(k);
  const night = async () => {
    const due = sql.one<{ due_at: string }>("SELECT due_at FROM schedule WHERE kind = 'script' AND key = 'offer_budgets' AND state = 'pending'")?.due_at;
    now = Math.max(now + DAY, due === undefined ? 0 : Date.parse(due)) + 60_000;
    for (let i = 0; i < 3; i++) {
      await k.drain();
      await k.runActions(execute, { script: run, limit: 50 });
    }
  };
  const page = (slug: string, filter?: Record<string, string>) => value<{ blocks: Drawn[] }>((filter ? k.page(slug, filter) : k.page(slug))).blocks;
  const block = (slug: string, heading: string, filter?: Record<string, string>) => {
    const b = page(slug, filter).find((x) => x.heading === heading);
    assert.ok(b, `${slug} draws no ${heading}`);
    assert.deepEqual(b.refusals ?? [], [], `${heading} is refused`);
    return b;
  };
  return { k, sql, night, page, block, groceries, outings, account };
}

test('BUDGETS SETS EACH BUDGET AGAINST THIS MONTH, and names the money no category holds with the way to file it', async () => {
  const m = await spending();
  const lead = m.page('money-budgets').find((b) => b.lead && b.drawn !== false)!;
  /* AND THE MONTH SO FAR SINCE money-core 3.34.0, where a This month stat said the two figures under the bars. */
  assert.equal(lead.body, '{{budgets-total}} a month across {{budgets-set}} categories. {{spent-by-category-month}} spent this month, {{spent-last-month}} last month.');
  assert.equal(m.page('money-budgets').some((b) => b.heading === 'This month'), false, 'a This month stat says the line again');
  assert.deepEqual(lead.values?.['budgets-total'], egp(5_000));

  /* HEADED BY ITS PERIOD SINCE money-core 3.32.0: a monthly budget is under This month's budgets. */
  const each = m.block('money-budgets', "This month's budgets");
  assert.deepEqual(each.rows!.map((r) => [r.fields.name, r.fields.budget_alert]), [['Groceries', 80]]);

  const unfiled = m.page('money-budgets').find((b) => b.kind === 'note' && !b.lead && b.drawn !== false)!;
  assert.deepEqual([unfiled.values?.['unfiled-spent-month']], [egp(7_850)]);
  assert.match(String(unfiled.body), /\[File them\]\(\/r\/transactions\?f=category:is:empty/u);

  /* EVERY FIGURE THE THREE PAGES DECLARE READS, AND SAYS WHAT IT SHOULD. */
  const read = (id: string) => value<{ value: unknown }>(m.k.metric(MONEY_METRICS[id] as never)).value;
  for (const id of Object.keys({ ...BUDGET_PAGE_FIGURES, ...PAYEE_FIGURES, ...HEALTH_FIGURES })) read(id);
  assert.equal(read('budgets-unset'), 1);
  assert.equal(read('received-month'), 4_000_000);
  assert.equal(read('left-month'), 4_000_000 - 1_145_000);
  /* KEPT OVER 90 DAYS: EGP 80,000 in, EGP 14,980 out. */
  assert.ok(Math.abs((read('kept-share-90d') as number) - (80_000 - 14_980) / 80_000) < 1e-9);

  /* NO "NO BUDGET YET" TABLE SINCE money-core 3.32.0 (audit of 30 October, 22): Outings is counted by `budgets-unset`
     above, and the page draws no column of names for it. */
  assert.equal(m.page('money-budgets').some((b) => b.heading === 'No budget yet'), false);
});

test('THE OFFER IS ONE QUESTION, drawn on Budgets: asking writes nothing, and Use these writes the limits', async () => {
  const m = await spending();
  await m.night();
  assert.equal(m.k.get(m.outings.id)!.fields.budget ?? null, null, 'a budget was set before anybody answered');
  const open = value<{ id: string; cause?: string; body?: { options?: { id: string; label: string }[] } }[]>(m.k.governance('suggestion', { status: 'open' })).filter((q) =>
    (q.cause ?? '').startsWith('money.budgets.'),
  );
  assert.equal(open.length, 1, JSON.stringify(open));
  assert.equal(open[0]!.cause, 'money.budgets.2026-10');

  const offered = m.block('money-budgets', 'Offered budgets');
  assert.notEqual(offered.drawn, false, 'the offer is not drawn on Budgets');

  /* A SECOND NIGHT ASKS NOTHING MORE. */
  await m.night();
  assert.equal(value<{ cause?: string }[]>(m.k.governance('suggestion', { status: 'open' })).filter((q) => (q.cause ?? '').startsWith('money.budgets.')).length, 1);

  /* USE THESE: Outings spent EGP 2,330 in September, so EGP 2,500. Groceries keeps the budget it had. */
  const use = open[0]!.body!.options!.find((o) => o.label === 'Use these')!;
  value(m.k.decide(open[0]!.id, { decide: { option: use.id, reason: 'They look right.' } }, 'p_1'));
  await m.k.drain();
  assert.deepEqual(m.k.get(m.outings.id)!.fields.budget, egp(2_500));
  assert.deepEqual(m.k.get(m.groceries.id)!.fields.budget, egp(5_000));
});

test('REPORTS AND PAYEES NARROW BY WHAT IS PICKED: the months on Reports, one payee on Payees', async () => {
  const m = await spending();
  const split = m.block('money-reports', 'Spending by category', { months: 'this' });
  assert.ok(split.rows!.every((r) => String(r.fields.on) >= '2026-10-01'), 'a month before this one is in This month');
  /* AND WHAT IT ADDS UP IS THE SAME MONTH, not the thirteen the whole Ledger holds: a bar is drawn from one query (`wholeRead`), which the pick has to narrow too. */
  const parts = (b: Drawn) => (b as { wholeRead?: { rows: { rows: number }[] } }).wholeRead!.rows.reduce((n, r) => n + r.rows, 0);
  assert.equal(parts(split), split.rows!.length, 'This month adds up other months');
  assert.ok(parts(m.block('money-reports', 'Spending by category')) > parts(split), 'with no month picked it reads no more than this month, so this proves nothing');
  const last = m.block('money-reports', 'Spending by category', { months: 'last' });
  assert.ok(last.rows!.length > 0 && last.rows!.every((r) => String(r.fields.on) < '2026-10-01' && String(r.fields.on) >= '2026-09-01'));

  /* ONE PAYEE PICKED IS ONE BAR: what was paid, how many times and the day of the last (`tally:`, audit of 31 October). */
  const one = m.block('money-payees', 'Who you paid, 90 days', { payee: 'Lantern Grill' });
  const whole = (one as { wholeRead?: { rows: { label: unknown; rows: number; last?: string }[] } }).wholeRead!;
  assert.deepEqual(
    whole.rows.map((r) => [r.label, r.rows, r.last]),
    [['Lantern Grill', 3, '2026-10-09']],
  );
  /* EVERY PAYMENT NAMES SOMEBODY, SO NO LEAD ASKS TO NAME ANY (audit 2 B5): the bars are who was paid. */
  assert.equal(m.page('money-payees').some((b) => b.lead && b.drawn !== false), false);
});

test('PAYEES NAMES A LINE BY THE BANK WHERE NOBODY PUT A PAYEE ON IT, and asks to name only the lines with no name at all', async () => {
  const m = await spending();
  const on = m.account.id;
  for (const day of ['2026-10-02', '2026-10-05'])
    value(m.k.create('transactions', { what: 'PAPERHAUS SUPPLIES', counterparty_text: 'PAPERHAUS SUPPLIES', on: day, amount: egp(120), direction: 'out', account: on, state: 'cleared' }, OWNER));
  value(m.k.create('transactions', { what: 'HMRC VAT', on: '2026-10-06', amount: egp(500), direction: 'out', account: on, state: 'cleared' }, OWNER));
  const bars = (m.block('money-payees', 'Who you paid, 90 days') as { wholeRead?: { rows: { label: unknown; rows: number }[] } }).wholeRead!;
  assert.equal(bars.rows.find((r) => r.label === 'PAPERHAUS SUPPLIES')?.rows, 2, 'the bank-named lines are not one payee');
  assert.equal(bars.rows.find((r) => r.label === null)?.rows, 1, 'only the line with no name in either field is not named');
  const lead = m.page('money-payees').find((b) => b.lead && b.drawn !== false)!;
  assert.equal(lead.values?.['unnamed-paid-90d'], 1);
  assert.match(String(lead.body), /f=payee:is:empty&f=counterparty_text:is:empty/u);
});

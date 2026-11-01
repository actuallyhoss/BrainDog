/**
 * The page Filing rules and its figures, one test an effect.
 *
 * ON A RECORD HOLDING MONEY AS ITS PACK DOCUMENT SAYS IT, as `money-filing.test.ts` measures the list: the three packs
 * installed with no example entries, rules and entries written as a person writes them, the record's own step filing
 * each entry, and the page read as the app reads it (`k.page`). So a figure whose sentence the record refuses, or a block
 * the page checker refuses, fails here and not on a screen. The page's words go through the record's own copy check
 * (`lintAnswer`), which finds an id, a time or an em dash a person would read.
 *
 * RED FIRST: with no `pages/rules.ts` the file does not load.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Entry, type Kernel, type PageResult } from '@braindog/kernel';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { lintAnswer } from '../../record/src/page-lint.ts';

import { NOW, day, firstPartyDocument } from '../src/index.ts';
import { FILING_FIGURES } from '../src/modules/money/figures/filing.ts';
import { MONEY_PAGES } from '../src/modules/money/pages/index.ts';
import { MONEY_RULES_PAGE } from '../src/modules/money/pages/rules.ts';

type Result<T> = { ok: boolean; value: T; refusal?: { code: string; fix: string; at?: string } };
type Group = { key: string; label?: string; value: number | null };
type Reading = { value: number | null; groups?: Group[] };
type Block = {
  kind: string;
  heading?: string;
  body?: string;
  lead?: boolean;
  drawn?: boolean;
  rows?: Entry[];
  readings?: { metric: string; reading: Reading | null }[];
  values?: Record<string, unknown>;
  unnamed?: string[];
  refusals?: unknown[];
  /** A card's facts over a figure, one list a card in column order (`filing-rule-filed` on each rule's card). */
  facts?: unknown[][];
};

const OWNER = { actor: 'p_1' };
const value = <T>(r: unknown): T => {
  const x = r as Result<T>;
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

type Fresh = { k: Kernel; clock: ReturnType<typeof fixedClock>; outing: Entry; food: Entry; card: Entry };

/** A fresh record holding Money as its document says it, two categories for money out and one account in pounds. */
async function fresh(): Promise<Fresh> {
  const clock = fixedClock(NOW);
  const k = await openRecord(openSqlite(), clock);
  for (const id of ['portfolio', 'people', 'money-core']) {
    const pack = value<Pack>(await normalise(firstPartyDocument(id, { seeds: [] }), { kind: 'local' }));
    const state: Installed = { format: 1, primitives: 1, record_version: k.version(), packs: k.packs(), declarations: k.declarations() as Installed['declarations'], rows: k.census() };
    const diff = await plan(pack, state);
    value(await install(pack, diff, hostFor(k), diff.planHash));
  }
  const outing = value<Entry>(k.create('categories', { name: 'Outing', direction: 'out', state: 'live' }, OWNER));
  const food = value<Entry>(k.create('categories', { name: 'Food', direction: 'out', state: 'live' }, OWNER));
  const card = value<Entry>(k.create('accounts', { name: 'Card', kind: 'bank', balance: { amount: 100_000, currency: 'GBP' }, as_of: day(-1) }, OWNER));
  return { k, clock, outing, food, card };
}

const rule = (k: Kernel, fields: Record<string, unknown>): Entry => value<Entry>(k.create('filing_rules', fields, OWNER));
/** One cleared payment with no category, left for the record's step to file. */
const paid = (k: Kernel, card: Entry, bank: string, n: number): Entry =>
  value<Entry>(k.create('transactions', { on: day(-2), direction: 'out', amount: { amount: 1_250, currency: 'GBP' }, account: card.id, state: 'cleared', what: `Card purchase ${n}`, counterparty_text: bank }, OWNER));

/** The page as the app reads it, found by its title and never by an address typed here. */
function pageOf(k: Kernel): { page: PageResult; blocks: Block[] } {
  const listed = k.pages() as unknown as { slug: string; title: string }[];
  const found = listed.find((p) => p.title === 'Filing rules');
  assert.ok(found, 'Money has a page called Filing rules');
  const page = value<PageResult>(k.page(found.slug));
  const blocks = page.blocks as unknown as Block[];
  for (const b of blocks) assert.deepEqual(b.refusals ?? [], [], `${b.heading ?? b.kind} is read`);
  /* ITS WORDS ARE CLEAN: no id, no time, no em dash where a person reads them. */
  assert.deepEqual(lintAnswer(page, null), [], 'the page says nothing the copy check finds');
  return { page, blocks };
}
const drawn = (blocks: Block[]): Block[] => blocks.filter((b) => b.drawn !== false);
function leadOf(blocks: Block[]): Block {
  const lead = drawn(blocks).filter((b) => b.lead === true);
  assert.equal(lead.length, 1, 'one block leads');
  assert.deepEqual(lead[0]!.unnamed ?? [], [], 'every figure the sentence asks for is one the record has');
  return lead[0]!;
}
/** A figure read through the kernel as a page reads it. */
const figure = (k: Kernel, id: string): Reading => value<Reading>(k.metric(FILING_FIGURES[id] as never));

test('the page is under Money, after a plan, needs the two lists, and is last of the pages on the rail', () => {
  assert.equal(MONEY_RULES_PAGE.page, 'money-rules');
  assert.equal(MONEY_RULES_PAGE.title, 'Filing rules');
  assert.equal(MONEY_RULES_PAGE.pack, 'money-core');
  assert.deepEqual(MONEY_RULES_PAGE.nav, { section: 'Money', order: 40 });
  assert.equal(MONEY_RULES_PAGE.for, undefined, 'one page for the record, not one a rule');
  const requires = MONEY_RULES_PAGE.requires as string[];
  assert.ok(requires.includes('register.filing_rules'));
  assert.ok(requires.includes('register.transactions'));
  /* LAST UNDER MONEY BY ITS ORDER, SINCE money-core 3.29.0: the section's own pages are declared after it and listed
     before it, since a section lists its pages by `nav.order` and not by where they stand in the document. */
  const railed = Object.entries(MONEY_PAGES)
    .flatMap(([slug, page]) => ((n) => (n === undefined ? [] : [[slug, n.order] as const]))((page as { nav?: { order: number } }).nav))
    .sort((a, b) => a[1] - b[1]);
  assert.equal(railed.at(-1)?.[0], 'money-rules');
});

test('every figure of the page is a count, unjudged, and named to money-core', () => {
  for (const id of ['rule-filed', 'filed-by-rule-30d', 'rules-filing-30d', 'rules-filing']) {
    const f = FILING_FIGURES[id]!;
    assert.ok(f, `${id} is declared`);
    assert.equal(f.pack, 'money-core');
    assert.equal(f.source, 'register.transactions');
    assert.deepEqual(f.target, { gte: 0 }, `${id} is judged by nothing`);
    const v = f.value as Record<string, unknown>;
    assert.ok('count' in v || 'distinct' in v, `${id} adds no money`);
  }
  assert.equal(FILING_FIGURES['rule-filed']!.group_by, 'filed_by');
  assert.equal(FILING_FIGURES['filed-by-rule-30d']!.group_by, 'filed_by');
  /* AND THE TWO THE CARDS AND THE EMPTY LINE READ (audit of 31 October): one rule's count, filled by its spoken id, and
     how many rules there are. */
  for (const id of ['filing-rule-filed', 'filing-rules']) {
    const f = FILING_FIGURES[id]!;
    assert.equal(f.pack, 'money-core');
    assert.deepEqual(f.target, { gte: 0 });
    assert.ok('count' in (f.value as Record<string, unknown>));
  }
  assert.equal(FILING_FIGURES['filing-rule-filed']!.where, 'filed_by is {{it}}');
  assert.equal(FILING_FIGURES['filing-rules']!.source, 'register.filing_rules');
});

test('THE PAGE SHOWS SIX TILES OR FEWER: a lead is the line, and one of three is drawn', () => {
  const blocks = MONEY_RULES_PAGE.blocks as Block[];
  assert.ok(blocks.filter((b) => !b.lead).length <= 6);
  assert.deepEqual([blocks[0]!.kind, blocks[0]!.lead], ['note', true], 'the page opens on its line');
  for (const b of blocks) assert.doesNotMatch(`${b.heading ?? ''} ${b.body ?? ''}`, /—/u, 'no em dash');
});

test('ON A FRESH RECORD WITH TWO RULES AND FIVE FILED ENTRIES, the figures read 5 by their parts and the page draws both rules', async () => {
  const { k, outing, food, card } = await fresh();
  const talabat = rule(k, { match: 'Talabat', match_by: 'starts', direction: 'out', category: food.id });
  const cinema = rule(k, { match: 'VOX', match_by: 'contains', direction: 'out', category: outing.id });
  [1, 2, 3].forEach((n) => paid(k, card, 'TALABAT CAIRO', n));
  [4, 5].forEach((n) => paid(k, card, 'MAF VOX CINEMAS', n));
  /* AND ONE NO RULE FITS, which no part counts. */
  paid(k, card, 'FENWICK CLOUD', 6);

  const all = figure(k, 'rule-filed');
  assert.equal(all.value, 5);
  const parts = Object.fromEntries((all.groups ?? []).map((g) => [g.key, g.value]));
  assert.deepEqual(parts, { [talabat.id]: 3, [cinema.id]: 2 });
  /* EACH PART IS CALLED BY ITS RULE'S OWN TEXT, never its id. */
  assert.deepEqual((all.groups ?? []).map((g) => g.label).sort(), ['Talabat', 'VOX']);
  assert.equal(figure(k, 'filed-by-rule-30d').value, 5);
  assert.equal(figure(k, 'rules-filing-30d').value, 2);

  const { blocks } = pageOf(k);
  const lead = leadOf(blocks);
  assert.match(lead.body!, /rule\(s\) filed/u);
  assert.equal(lead.values?.['rules-filing-30d'], 2);
  assert.equal(lead.values?.['filed-by-rule-30d'], 5);

  /* A CARD A RULE, ITS TEXT AND WHERE IT FILES, SINCE money-core 3.34.0: "Lines filed 0" stood on every card under a
     line that says what the rules filed, and how a rule matches is on its own page. What each filed is the figure's
     parts, above. */
  const rules = drawn(blocks).find((b) => b.heading === 'Rules')!;
  assert.equal(rules.kind, 'cards');
  assert.deepEqual(rules.rows!.map((r) => r.fields.match).sort(), ['Talabat', 'VOX']);
  const declared = (MONEY_RULES_PAGE.blocks as { heading?: string; columns?: unknown }[]).find((b) => b.heading === 'Rules')!;
  assert.deepEqual(declared.columns, [
    { field: 'match', as: 'title' },
    { field: 'category', label: 'Files under', as: 'fact' },
  ]);
  /* AND WHAT THEY FILED LATELY, the lines the rules filed, newest first. */
  const lately = drawn(blocks).find((b) => b.heading === 'Filed lately')!;
  assert.equal(lately.rows!.length, 5);
  assert.ok(lately.rows!.every((r) => r.fields.filed_by === talabat.id || r.fields.filed_by === cinema.id));
});

test('A RULE SWITCHED OFF KEEPS ITS COUNT, and is listed apart from the rules that are on', async () => {
  const { k, food, card } = await fresh();
  const talabat = rule(k, { match: 'Talabat', match_by: 'starts', direction: 'out', category: food.id });
  [1, 2].forEach((n) => paid(k, card, 'TALABAT CAIRO', n));
  value(k.update('filing_rules', talabat.id, { state: 'off' }, OWNER));
  assert.equal(figure(k, 'rule-filed').value, 2);
  const { blocks } = pageOf(k);
  assert.equal(leadOf(blocks).values?.['filed-by-rule-30d'], 2);
  assert.equal(drawn(blocks).find((b) => b.heading === 'Rules'), undefined, 'no rule is on, so no card is drawn');
  assert.deepEqual(drawn(blocks).find((b) => b.heading === 'Switched off')!.rows!.map((r) => r.fields.match), ['Talabat']);
});

test('RULES THAT FILED BEFORE AND NOTHING LATELY SAY SO IN WORDS, never "0 rules filed 0"', async () => {
  const { k, clock, food, card } = await fresh();
  rule(k, { match: 'Talabat', match_by: 'starts', direction: 'out', category: food.id });
  [1, 2, 3].forEach((n) => paid(k, card, 'TALABAT CAIRO', n));
  /* FORTY DAYS ON: the three were made before the window, and still filed by the rule. */
  clock.advance(40 * 86_400_000);
  assert.equal(figure(k, 'filed-by-rule-30d').value, 0);
  const lead = leadOf(pageOf(k).blocks);
  assert.match(lead.body!, /^Nothing filed in 30 days\./u);
  assert.deepEqual([lead.values?.['rule-filed']], [3]);
});

test('WITH NO RULE, THE LEAD SAYS SO AND OFFERS ONE, and nothing else counts', async () => {
  const { k } = await fresh();
  assert.equal(figure(k, 'rule-filed').value, 0);
  const { blocks } = pageOf(k);
  assert.equal(leadOf(blocks).body, 'No filing rules yet. A rule puts a line under a category as it comes in. [Add a rule](/r/filing_rules?new=1)');
  assert.equal(drawn(blocks).find((b) => b.heading === 'Rules'), undefined);
  assert.equal(drawn(blocks).find((b) => b.heading === 'Filed lately'), undefined);
  assert.ok(drawn(blocks).length <= 7, 'six tiles or fewer beside the line');
});

test("A RULE THAT HAS FILED NOTHING SAYS SO, with its card, and the head's button adds another", async () => {
  const { k, food } = await fresh();
  rule(k, { match: 'Talabat', match_by: 'starts', direction: 'out', category: food.id });
  const { blocks } = pageOf(k);
  assert.equal(leadOf(blocks).body, 'No rule has filed a line yet.');
  const rules = drawn(blocks).find((b) => b.heading === 'Rules')!;
  assert.deepEqual(rules.rows!.map((r) => r.fields.match), ['Talabat']);
  /* ADD A RULE IS THE HEAD'S ONE BUTTON SINCE money-core 3.34.0, and no tile of its own under the rules. */
  assert.equal(drawn(blocks).some((b) => b.kind === 'note' && b.body === '[Add a rule](/r/filing_rules?new=1)'), false);
  assert.deepEqual((MONEY_RULES_PAGE as { header?: unknown }).header, { action: { verb: 'row.create', label: 'Add a rule' } });
});

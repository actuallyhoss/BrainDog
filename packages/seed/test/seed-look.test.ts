/**
 * What the look at a real record on 13 October found on Today, Money and Projects, held on a record built here.
 *
 * THREE FAULTS A PERSON SAW ON TODAY, each one a declaration. It listed a salary due four days earlier under Due this
 * week; drew Lapsing with a Cost column that was a dash on every line; and was titled Overview under a rail item that
 * said Today. Nothing here names a record: the founder is built the way onboarding builds one, and the rows are made up.
 *
 * AND ONE ON MONEY (fault F): with two books or more no block was the page's lead, so the app said its own filler under
 * the page's name. `page.money` declares 24 blocks, the ceiling (`BLOCK_CEILING`, kernel `declare.ts`), so the lead took
 * the place of the line for no balance typed (`parts/cross-check.ts`).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Kernel } from '@braindog/kernel';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { NOW, firstPartyManifest } from '../src/index.ts';
import { DUE_THIS_WEEK, DUE_WINDOW, LATE_MONEY, LATE_WINDOW } from '../src/modules/money/pages/shared.ts';
import { modulesFor, useCase } from '../src/usecases/index.ts';
import { carriedDocument, dayOf, moduleDocument } from '../src/usecases/install.ts';

const TODAY = dayOf(NOW);

/** A day as the record writes one, `n` days from the fixed today. */
const day = (n: number): string => dayOf(Date.parse(`${TODAY}T00:00:00Z`) + n * 86_400_000);

type Column = { field: string; label?: string };
type Block = { kind: string; heading?: string; source?: string; where?: string; columns?: Column[]; order?: unknown; when?: unknown };
type Drawn = Block & { drawn?: boolean; rows?: { fields: Record<string, unknown> }[]; refusals?: { code: string }[] };

type Declared = { page?: string; title?: string; metric?: string; where?: string; blocks?: Block[] };

/** What the founder use case declares, read off its pack. */
const declarations = (): Declared[] => (useCase('founder')!.pack?.declarations ?? []) as Declared[];

const home = (): Declared => {
  const page = declarations().find((d) => d.page === 'home-founder');
  assert.ok(page, 'the founder use case declares its own Home');
  return page;
};

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

/** A founder record made the way onboarding makes one, as `founder-home.test.ts` makes it, with no example rows. */
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

const OWNER = { actor: 'p_1' };

const drawnOn = (k: Kernel, page: string): Drawn[] => {
  const blocks = value<{ blocks: Drawn[] }>(k.page(page)).blocks;
  const refused = blocks.filter((b) => (b.refusals ?? []).length > 0).map((b) => `${b.heading ?? b.kind}: ${b.refusals!.map((r) => r.code).join(', ')}`);
  assert.deepEqual(refused, [], `${page} refused a block`);
  return blocks.filter((b) => b.drawn !== false);
};

const whats = (b: Drawn | undefined): unknown[] => (b?.rows ?? []).map((r) => r.fields.what);

test('THE WEEK AND WHAT IS LATE ARE TWO WINDOWS THAT MEET AT TODAY, declared once each and taken by name', () => {
  assert.equal(DUE_WINDOW, 'state is open or part, due after -1d, due before +8d');
  assert.equal(LATE_WINDOW, 'state is open or part, due before today');
  const blocks = home().blocks ?? [];
  const week = blocks.find((b) => b.heading === 'Due this week');
  const late = blocks.find((b) => b.heading === 'Late');
  assert.ok(week && late, `home-founder's headings are ${blocks.map((b) => b.heading).join(' ; ')}`);
  assert.equal(week.where, DUE_THIS_WEEK.where);
  assert.equal(late.where, LATE_MONEY.where);
  assert.deepEqual(late.columns, LATE_MONEY.columns, 'the Late table is Money\'s own block');
  assert.deepEqual(late.order, [{ field: 'due', dir: 'asc' }], 'the oldest first');
  assert.ok(blocks.indexOf(late) < blocks.indexOf(week), 'what is late is read before what is coming');
  /* THE COUNTS THE TWO TABLES ARE DRAWN ON read the same clauses as the tables. */
  const figure = (id: string): Declared | undefined => declarations().find((d) => d.metric === id);
  assert.equal(figure('due-this-week')?.where, DUE_WINDOW);
  assert.equal(figure('late-money')?.where, LATE_WINDOW);
  assert.deepEqual(week.when, { metric: 'due-this-week', gt: 0 });
  assert.deepEqual(late.when, { metric: 'late-money', gt: 0 });
});

test('A BILL FOUR DAYS LATE IS UNDER LATE AND NOT UNDER DUE THIS WEEK, and one due today is still this week', async () => {
  const k = await founder();
  const bill = (what: string, due: string, state = 'open', direction = 'owed_by_me') =>
    value(k.create('obligations', { what, direction, amount: { amount: 120_000, currency: 'GBP' }, due, state }, OWNER));
  bill('Harbour salary', day(-4), 'open', 'owed_to_me');
  bill('Older rent', day(-20), 'part');
  bill('Yesterday fee', day(-1));
  bill('Due today', day(0));
  bill('Due in a week', day(7));
  bill('Past the week', day(8));
  bill('Late and settled', day(-6), 'paid');

  const blocks = drawnOn(k, 'home-founder');
  const late = blocks.find((b) => b.heading === 'Late');
  const week = blocks.find((b) => b.heading === 'Due this week');
  assert.deepEqual(whats(late), ['Older rent', 'Harbour salary', 'Yesterday fee'], 'every open or part paid one whose day has passed, oldest first');
  assert.deepEqual(whats(week), ['Due today', 'Due in a week'], 'today to seven days on, and nothing whose day has passed');
});

test('WITH NOTHING LATE THERE IS NO LATE TABLE, and with only a late one there is no Due this week', async () => {
  const k = await founder();
  value(k.create('obligations', { what: 'Due soon', direction: 'owed_by_me', amount: { amount: 900, currency: 'GBP' }, due: day(2), state: 'open' }, OWNER));
  assert.equal(drawnOn(k, 'home-founder').some((b) => b.heading === 'Late'), false);

  const other = await founder();
  value(other.create('obligations', { what: 'Gone by', direction: 'owed_by_me', amount: { amount: 900, currency: 'GBP' }, due: day(-3), state: 'open' }, OWNER));
  const headings = drawnOn(other, 'home-founder').map((b) => b.heading);
  assert.ok(headings.includes('Late'), headings.join(' ; '));
  assert.equal(headings.includes('Due this week'), false, headings.join(' ; '));
});

test('LAPSING DECLARES NO COST COLUMN, and a service renewing ten months on is not under it', async () => {
  const lapsing = (home().blocks ?? []).find((b) => b.heading === 'Lapsing');
  assert.ok(lapsing);
  assert.deepEqual(lapsing.columns?.map((c) => c.field), ['name', 'renews']);

  /* NO COST ON ANY OF THEM, as on a record whose domains came in from a registrar. */
  const k = await founder();
  const domain = (name: string, renews: string) => value(k.create('services', { name, provider: 'Cove Domains', kind: 'domain', renews, cycle: 'yearly', state: 'lapsing' }, OWNER));
  domain('northwind.example', day(300));
  domain('northwind.dev', day(32));
  assert.equal(drawnOn(k, 'home-founder').some((b) => b.heading === 'Lapsing'), false, 'nothing lapses inside the month, so the tile is not drawn');
  domain('northwind.io', day(12));
  const drawn = drawnOn(k, 'home-founder').find((b) => b.heading === 'Lapsing');
  assert.deepEqual(drawn?.rows?.map((r) => r.fields.name), ['northwind.io']);
});

/* THE ADD-ON'S PAGE IS FOUNDER OVERVIEW SINCE founder 3.8.0 (round 1030): Today is the app's own board of widgets, so a
   second page called Today in the sidebar was two pages with one name. The voice still calls home Today. */
test('HOME IS CALLED TODAY in the voice, and the founder\'s own page Founder overview', () => {
  const u = useCase('founder')!;
  assert.notEqual((u as { voice?: { home?: string } }).voice?.home, 'Overview');
  assert.equal((u as { voice?: { home?: string } }).voice?.home, 'Today');
  assert.equal(home().title, 'Founder overview');
});

/* WHERE IT IS KEPT, SINCE money-core 3.29.0: how much there is is the hero's under the line, and every line ends on the
   part that is late, a sentence the app leaves out while none is. */
/* AND WHAT IS TO PAY ON THE CARD AFTER IT, since money-core 3.20.0, left out whole with no card that says it. */
/* AND SINCE money-core 3.33.0 (AF4) WHAT IS LATE LEADS ONLY WHILE IT IS: nothing is late here, so the card alone. */
const LATE = '{{card-to-pay}} to pay on the card, as of {{card-to-pay-on}}.';
test('MONEY WITH TWO BOOKS OPENS ON WHERE ITS MONEY IS KEPT, and with one book on how long it lasts', async () => {
  const k = await founder();
  type Lead = Drawn & { lead?: boolean; body?: string; values?: Record<string, unknown> };
  const leads = (): Lead[] => (drawnOn(k, 'money') as Lead[]).filter((b) => b.kind === 'note' && b.lead === true);
  const book = (name: string): string => value<{ id: string }>(k.create('books', { name }, OWNER)).id;
  const account = (name: string, bookId: string, currency: string) =>
    value(k.create('accounts', { name, kind: 'bank', book: bookId, balance: { amount: 250_000, currency }, as_of: day(-1) }, OWNER));

  const own = book('Household');
  account('Everyday', own, 'GBP');
  /* ONE ACCOUNT WITH MONEY ON IT AND NOTHING DUE LASTS THE YEAR, and since money-core 3.17.0 the line says so
     (`HEADLINE_LASTS`): one lead still, the line of what there is stepping aside for it. */
  assert.deepEqual(leads().map((b) => b.body), [`Lasts the year on what is due. ${LATE}`]);

  account('Studio dollars', book('Studio'), 'USD');
  const two = leads();
  /* KEPT IN HOW MANY BOOKS, SINCE money-core 3.34.0: it said how many accounts, and counted the books. */
  assert.deepEqual(two.map((b) => b.body), [`Kept in {{books-held}} books. ${LATE}`], 'one lead');
  /* NO CARD SAYS WHAT IS TO PAY ON IT: the sum reads nought and its day reads nothing, so the card's sentence goes whole. */
  assert.deepEqual(two[0]!.values, {
    'card-to-pay': 0,
    'books-held': 2,
  });
  /* AND THE PAGE IS STILL WITHIN WHAT A PAGE DECLARES. */
  assert.ok(value<{ blocks: unknown[] }>(k.page('money')).blocks.length <= 24);
});

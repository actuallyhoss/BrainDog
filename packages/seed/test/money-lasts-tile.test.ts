/**
 * Money says calmly how long the money lasts, and turns red only when the cash is below nought (REC-B07 jobs 7 and 8,
 * money-lasts-tile-100). "runway in info colour, danger only below zero" (HD.460).
 *
 * WHY. Money's side column had one tile over the day the money runs out, `tone: 'bad'` and drawn only while the walk
 * went under (`when: runway-days gte 0`). A record whose money lasts saw nothing there, and one whose money runs out
 * on what is due read the danger colour with thousands in the bank. Since money-core 3.17.0 Lasts is drawn calm while
 * Cash now is at or above nought, over the same figures, and Runs out keeps the danger colour for cash below it.
 *
 * RUNS OUT WAITS FOR A PLACE: Money declares twenty-four blocks, the most a page may, so it is declared beside Lasts
 * (`RUNS_OUT`) and placed once a block makes room. The pair is held here on a Money page that has made it.
 *
 * AND "LASTS PAST" WAITS ON THE RULES' LOOK: a figure with no value is a block that drew nothing to `compose.ts`
 * (`drewNothing`), which reads no `beyond`, so the look hides it. Held here as read and hidden by the look alone.
 *
 * TODAY IS 3 SEPTEMBER 2026 (`NOW`), so day(7) is 10 September.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Kernel } from '@braindog/kernel';
import { sayOf } from '@braindog/ports';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { BANKS } from '../../../fixtures/names.ts';
import { NOW, day, firstPartyDocument } from '../src/index.ts';
import { MONEY_PAGE } from '../src/modules/money/pages/money.ts';
import { LASTS, RUNS_OUT, RUNWAY } from '../src/modules/money/pages/parts/runway.ts';

const OWNER = { actor: 'p_test' };
const gbp = (amount: number) => ({ amount, currency: 'GBP' });
/** The most blocks a page declares (`BLOCK_CEILING` in `packages/kernel/src/declare.ts`). */
const CEILING = 24;

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

type Block = Record<string, unknown> & { kind: string; heading?: string };

/**
 * MONEY WITH ROOM FOR RUNS OUT: the page as it is, with Runs out straight after Lasts and the last block given up for
 * it, so it stays inside the ceiling. Which block makes room is the page's to choose; this only needs one to.
 */
const roomy = (blocks: readonly Block[]): Block[] => {
  /* MONEY PLACES IT ITSELF SINCE THE UI PASS OF 20 OCTOBER, and then there is nothing to make room for. */
  if (blocks.some((b) => b.heading === 'Runs out')) return [...blocks];
  const at = blocks.findIndex((b) => b.heading === 'Lasts');
  return [...blocks.slice(0, at + 1), ...(RUNS_OUT as Block[]), ...blocks.slice(at + 1)].slice(0, CEILING);
};

/** A record holding money-core and what it points at, with no example entries, and Money as it is or with room. */
async function fresh(room = false): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  for (const id of ['portfolio', 'people', 'money-core'] as const) {
    const doc = firstPartyDocument(id, { seeds: [] }) as { declarations: Record<string, unknown>[] };
    if (room && id === 'money-core')
      doc.declarations = doc.declarations.map((d) => (d.page === 'money' ? { ...d, blocks: roomy(d.blocks as Block[]) } : d));
    const pack = value<Pack>(await normalise(doc as never, { kind: 'local' }));
    const state: Installed = { format: 1, primitives: 1, record_version: k.version(), packs: k.packs(), declarations: k.declarations() as Installed['declarations'], rows: k.census(), config: k.packSettings() };
    const diff = await plan(pack, state);
    value(await install(pack, diff, hostFor(k), diff.planHash));
  }
  return k;
}

const make = (k: Kernel, register: string, fields: Record<string, unknown>): string => value<{ id: string }>(k.create(register, fields, OWNER)).id;

type Drawn = Block & { key?: string; drawn?: boolean; why?: string; tone?: string; refusals?: unknown[]; readings?: { metric: string; reading: { value: number | null; beyond?: unknown } | null }[] };
type Side = { tiles: Map<string, Drawn>; hidden: readonly string[] };
const side = (k: Kernel): Side => {
  const page = value<{ blocks: Drawn[]; look?: { hide?: string[] } }>(k.page('money'));
  const tiles = new Map(page.blocks.filter((b) => b.heading === 'Lasts' || b.heading === 'Runs out').map((b) => [b.heading!, b]));
  return { tiles, hidden: page.look?.hide ?? [] };
};
const shown = (b: Drawn | undefined): boolean => b !== undefined && b.drawn !== false;
/**
 * WHETHER A BLOCK'S `when:` HELD: one it turned off is answered before any figure is read (`pages.ts` `readBlock`), so
 * it carries no readings. Told apart from `drawn`, which the rules' look may also turn off afterwards.
 */
const read = (b: Drawn | undefined): boolean => b !== undefined && Array.isArray(b.readings);

/** A bank account holding `balance` today. */
const bank = (k: Kernel, balance: number): string => make(k, 'accounts', { name: `${BANKS[0]} current`, kind: 'bank', liquid: true, balance: gbp(balance), as_of: day(0) });

test("MONEY'S PAGE DECLARES BOTH: Lasts, calm, while there is cash, and Runs out, in the danger colour, while there is none", () => {
  const [lasts] = LASTS as Block[];
  const [runs] = RUNS_OUT as Block[];
  assert.deepEqual([lasts!.kind, lasts!.heading, lasts!.area, lasts!.tone], ['stat', 'Lasts', 'rail', undefined]);
  assert.deepEqual([runs!.kind, runs!.heading, runs!.area, runs!.tone], ['stat', 'Runs out', 'rail', 'bad']);
  /* THE SAME FIGURES BY THE SAME IDS: the day it runs out, with the days left under it. LASTS SAYS BESIDE IT HOW LONG
     THE CASH LASTS WITH NOTHING COMING IN (the UI pass of 20 October, money F3), which the line no longer says. */
  const due = { metric: 'runs-out-on', label: 'With what is due and expected', note: 'In {{runway-days}}' };
  assert.deepEqual(runs!.cells, [due]);
  /* ONE FIGURE AND THE SENTENCE THAT SAYS WHY, SINCE money-core 3.27.0: "Lasts past" a year away beside "79 days" was two
     answers with nothing saying what each assumed. The day the walk with what comes in runs out is its own sentence,
     said only while there is one. */
  assert.deepEqual(lasts!.cells, [
    {
      metric: 'lasts-no-income',
      label: 'With no money coming in',
      note: 'If all money in stopped, {{every-month-in.names}} too, it lasts to {{lasts-no-income.on}}, when {{lasts-no-income.because}} is due. With what comes in it still runs out on {{runs-out-on}}.',
    },
  ]);
  /* ONE OR THE OTHER, never both: at or above nought, and below it. Lasts waits for an account, as the accounts do. */
  assert.deepEqual(lasts!.when, { all: [{ metric: 'cash-accounts', gt: 0 }, { metric: 'cash-now', gte: 0 }] });
  assert.deepEqual(runs!.when, { metric: 'cash-now', lt: 0 });

  /* LASTS STANDS IN THE SIDE COLUMN ABOVE THE ACCOUNTS, where Runs out stood. */
  const blocks = MONEY_PAGE.blocks as readonly Block[];
  assert.deepEqual(blocks.filter((b) => b.area === 'rail').map((b) => b.heading)[0], 'Lasts');
  assert.ok(RUNWAY.every((b) => blocks.includes(b as never)), 'what runway.ts places is not on Money');
  /* AND RUNS OUT IS PLACED, OR THE PAGE HAS NO ROOM FOR IT. When this fails a block made room and nobody placed it. */
  const placed = RUNS_OUT.every((b) => blocks.includes(b as never));
  assert.ok(placed || blocks.length + RUNS_OUT.length > CEILING, 'Money has room for Runs out and does not place it');
});

test('CASH ABOVE NOUGHT THAT LASTS THE YEAR READS LASTS, calm, with how far the walk looked, and no Runs out', async () => {
  for (const room of [false, true]) {
    const k = await fresh(room);
    bank(k, 250_000);
    const { tiles, hidden } = side(k);
    const lasts = tiles.get('Lasts')!;
    assert.ok(read(lasts), `Lasts's when said no over cash above nought${room ? ' on a page with room' : ''}`);
    assert.equal(lasts.tone, undefined, 'money that lasts is drawn in a colour of warning');
    assert.deepEqual(lasts.refusals ?? [], []);
    const reading = lasts.readings?.[0]?.reading;
    assert.equal(reading?.value, null, 'the money never runs out, so there is no day');
    assert.ok(reading?.beyond, 'the reading says nothing of how far the walk looked, so the app cannot say "Lasts past"');
    /* DRAWN, OR HIDDEN BY THE RULES' LOOK ALONE: `compose.ts` `drewNothing` calls a figure with no value a block that
       drew nothing, and reads no `beyond` (a blocked line of this job). Never hidden by anything else. */
    assert.ok(shown(lasts) || hidden.includes(lasts.key!), `Lasts is not drawn, and the look did not hide it: ${String(lasts.why)}`);
    assert.ok(!read(tiles.get('Runs out')) && !shown(tiles.get('Runs out')), 'Runs out is read over cash above nought');
  }
});

test('CASH ABOVE NOUGHT THAT RUNS OUT ON WHAT IS DUE STILL READS LASTS, calm, with the day: the danger colour waits for no cash', async () => {
  for (const room of [false, true]) {
    const k = await fresh(room);
    bank(k, 120_000);
    make(k, 'recurring', { what: 'Rent', direction: 'out', amount: gbp(50_000), every: 'monthly', next_due: day(7), state: 'live' });
    const { tiles } = side(k);
    const lasts = tiles.get('Lasts');
    assert.ok(shown(lasts), 'Lasts is not drawn over cash that runs out on what is due');
    assert.equal(lasts!.tone, undefined, 'cash that runs out in two months is drawn in the danger colour');
    /* GBP 1,200.00 pays the rent on 10 September and 10 October and goes under on 10 November, 68 days on, and the
       sentence under the figure says that day and what falls due on it. Nothing comes in, so the walk with what comes
       in goes under the same day, and so does its sentence. */
    assert.equal(lasts!.readings?.[0]?.reading?.value, 68);
    const values = (lasts as { values?: Record<string, unknown> }).values ?? {};
    assert.equal(values['lasts-no-income.on'], day(68));
    assert.equal(values['lasts-no-income.because'], 'Rent');
    assert.equal(values['runs-out-on'], day(68));
    assert.equal(values['every-month-in.names'], undefined, 'nothing comes in, so no repeating money in is named');
    assert.ok(!read(tiles.get('Runs out')) && !shown(tiles.get('Runs out')));
  }
});

test('CASH BELOW NOUGHT IS THE REVERSE: Runs out, in the danger colour, on today, and no Lasts', async () => {
  for (const room of [false, true]) {
    const k = await fresh(room);
    bank(k, -40_000);
    make(k, 'recurring', { what: 'Rent', direction: 'out', amount: gbp(50_000), every: 'monthly', next_due: day(7), state: 'live' });
    const { tiles } = side(k);
    assert.ok(!read(tiles.get('Lasts')) && !shown(tiles.get('Lasts')), 'Lasts is read over cash below nought');
    /* MONEY AS IT IS PLACES RUNS OUT SINCE THE UI PASS OF 20 OCTOBER, so both pages draw it. */
    const runs = tiles.get('Runs out');
    assert.ok(shown(runs), 'Runs out is not drawn over cash below nought');
    assert.equal(runs!.tone, 'bad');
    /* THE WALK OPENS UNDER, so the day is today. */
    assert.equal(runs!.readings?.[0]?.reading?.value, Math.floor(NOW / 86_400_000));
  }
});

test('A RECORD WITH NO ACCOUNT READS NEITHER: a Cash now of nought held nowhere is not money that lasts', async () => {
  const { tiles } = side(await fresh(true));
  for (const heading of ['Lasts', 'Runs out']) assert.ok(!read(tiles.get(heading)) && !shown(tiles.get(heading)), `${heading} is read on a record with no account`);
});

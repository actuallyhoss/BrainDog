/**
 * Money says calmly how long the money lasts (money-lasts-tile-100). Since money-core 3.29.0 that is
 * two cells of the hero, With what is due and expected and With no money coming in, and no tile of their own. A cell
 * whose figure has no value is not drawn, so a record whose money lasts the year reads no day.
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
import { HERO } from '../src/modules/money/pages/parts/hero.ts';
import { LASTS_SAID, ON_WHAT_IS_DUE } from '../src/modules/money/pages/parts/runway.ts';

const OWNER = { actor: 'p_test' };
const gbp = (amount: number) => ({ amount, currency: 'GBP' });
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

/** A record holding money-core and what it points at, with no example entries, and Money as it is or with room. */
async function fresh(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  for (const id of ['portfolio', 'people', 'money-core'] as const) {
    const doc = firstPartyDocument(id, { seeds: [] }) as { declarations: Record<string, unknown>[] };
    const pack = value<Pack>(await normalise(doc as never, { kind: 'local' }));
    const state: Installed = { format: 1, primitives: 1, record_version: k.version(), packs: k.packs(), declarations: k.declarations() as Installed['declarations'], rows: k.census(), config: k.packSettings() };
    const diff = await plan(pack, state);
    value(await install(pack, diff, hostFor(k), diff.planHash));
  }
  return k;
}

const make = (k: Kernel, register: string, fields: Record<string, unknown>): string => value<{ id: string }>(k.create(register, fields, OWNER)).id;

type Cell = { metric: string; reading: { value: number | null; beyond?: unknown } | null };
type Drawn = Block & { key?: string; drawn?: boolean; why?: string; tone?: string; refusals?: unknown[]; readings?: Cell[]; values?: Record<string, unknown> };
/** The hero: the one lead stat Money draws, with its cells read. */
const hero = (k: Kernel): Drawn => value<{ blocks: Drawn[] }>(k.page('money')).blocks.find((b) => b.kind === 'stat' && b.lead === true)!;
const shown = (b: Drawn | undefined): boolean => b !== undefined && b.drawn !== false;
/**
 * WHETHER A BLOCK'S `when:` HELD: one it turned off is answered before any figure is read (`pages.ts` `readBlock`), so
 * it carries no readings.
 */
const read = (b: Drawn | undefined): boolean => b !== undefined && Array.isArray(b.readings);

/** A bank account holding `balance` today. */
const bank = (k: Kernel, balance: number): string => make(k, 'accounts', { name: `${BANKS[0]} current`, kind: 'bank', liquid: true, balance: gbp(balance), as_of: day(0) });

test('MONEY SAYS HOW LONG IT LASTS AS ONE LINE UNDER CASH NOW, the walk with what is due, once there is an account', () => {
  const [hero] = HERO as Block[];
  const cells = hero!.cells as { metric: string; note?: string }[];
  /* ONE ANSWER, BEFORE 3.33.0 SHIPPED (design pass 1 Nov, M23): "Lasts 30 Oct" beside "If nothing comes in 19 days" read
     as two answers to one question. The day and the days are Cash now's own line, and neither is a cell. */
  assert.match(cells[0]!.note ?? '', new RegExp(`^Lasts until \\{\\{${ON_WHAT_IS_DUE.metric}\\}\\} \\(\\{\\{runway-days\\}\\}\\)\\.`, 'u'));
  assert.ok(!cells.some((c) => c.metric === ON_WHAT_IS_DUE.metric || c.metric === LASTS_SAID.metric), 'how long it lasts is a cell again');
  assert.deepEqual(hero!.when, { metric: 'cash-accounts', gt: 0 });
  /* NO TILE OF THEIR OWN: nothing on the page is headed Lasts, and nothing sits in a side column. */
  const blocks = MONEY_PAGE.blocks as readonly Block[];
  assert.ok(blocks.includes(hero as never), 'the hero is not on Money');
  assert.deepEqual(blocks.filter((b) => b.heading === 'Lasts' || b.heading === 'Runs out' || b.area === 'rail'), []);
});

test('CASH ABOVE NOUGHT THAT LASTS THE YEAR READS NO DAY, and Cash now stands alone', async () => {
  const k = await fresh();
  bank(k, 250_000);
  const h = hero(k);
  assert.ok(read(h) && shown(h), 'the hero is not drawn over cash above nought');
  assert.equal(h.tone, undefined, 'money that lasts is drawn in a colour of warning');
  assert.deepEqual(h.refusals ?? [], []);
  /* A CELL WHOSE FIGURE HAS NO VALUE IS NOT DRAWN: no day it runs out, and the line says it lasts the year instead. */
  assert.deepEqual(h.readings?.map((c) => c.metric), ['cash-now']);
});

test('CASH ABOVE NOUGHT THAT RUNS OUT ON WHAT IS DUE READS THE DAY, calm: the danger colour waits for no cash', async () => {
  const k = await fresh();
  bank(k, 120_000);
  make(k, 'recurring', { what: 'Rent', direction: 'out', amount: gbp(50_000), every: 'monthly', next_due: day(7), state: 'live' });
  const h = hero(k);
  assert.ok(shown(h));
  assert.equal(h.tone, undefined, 'cash that runs out in two months is drawn in the danger colour');
  /* GBP 1,200.00 pays the rent on 10 September and 10 October and goes under on 10 November, 68 days on, and the
     line under Cash now says that day and how many days off it is ("Lasts until 10 Nov (68 days)"). */
  const values = h.values ?? {};
  assert.equal(values['runway-days'], 68);
  assert.ok(values['runs-out-on'] !== undefined, 'the line under Cash now has no day it lasts until');
});

test('CASH BELOW NOUGHT READS THE DAY IT RAN OUT AS TODAY', async () => {
  const k = await fresh();
  bank(k, -40_000);
  make(k, 'recurring', { what: 'Rent', direction: 'out', amount: gbp(50_000), every: 'monthly', next_due: day(7), state: 'live' });
  const h = hero(k);
  assert.ok(shown(h), 'the hero is not drawn over cash below nought');
  /* THE WALK OPENS UNDER, so the day is today. */
  assert.equal((h.values ?? {})['runs-out-on'], Math.floor(NOW / 86_400_000));
});

test('A RECORD WITH NO ACCOUNT DRAWS NO HERO: a Cash now of nought held nowhere is not money that lasts', async () => {
  const h = hero(await fresh());
  assert.ok(!read(h) && !shown(h), 'the hero is read on a record with no account');
});

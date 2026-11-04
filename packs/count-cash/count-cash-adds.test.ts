/**
 * Count the cash, seen on Money (1.4.0): with the pack installed, Money has a box to count the cash in while a
 * balance there is old, and the newest count says how far out the record was and what happened.
 *
 * BEFORE 1.4.0 NOTHING OF IT WAS ON MONEY. The pack compared a count against the rolled figure and filed the difference,
 * but it added no block anywhere, and Money's "What it holds today" took a balance check only, so a person who wanted
 * to count the box had to find the Cash counts list first. The two blocks are the pack's `adds`, read by the record's
 * own install path, so taking the pack out takes them off the page and leaves Money's own declaration as it was.
 *
 * WITH HEADS UP SINCE 1.4.1. 1.4.0 placed both after What it holds today, and the redesign took that box off
 * Money (Heads up's line on the oldest balance says Update balances instead), so an `after` naming it laid both at the
 * foot of the page, under Where it went. They follow Heads up now, a heading Money has kept since money-core 3.5.0, and
 * stand in the main column: inside Heads up's box where it is in the main column (3.16.0), and under the Ledger beside it
 * where it is in the side column (3.17.0), since a box never crosses columns.
 *
 * THE RECORD IS FRESH AND THE PACK IS THE FILE AS IT SHIPS, planned and installed the road a person takes from the app,
 * beside money-core and the modules it stands on. The script runs in QuickJS through the runner the self-host builds.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { readPackFile } from '../../packages/declare/src/catalogue.ts';
import { scriptReads, scriptRunner } from '../../packages/host/src/script.ts';
import { createRecordApi, type CallContext } from '../../packages/record/src/index.ts';
import { fixedClock, openSqlite } from '../../packages/kernel/test/sqlite.ts';
import { AMOUNT_SPACE, writeAmount } from '../../packages/render/src/money.ts';
import { fixOf } from '../../packages/ports/src/index.ts';
import { runInQuickJs } from '../../packages/script/src/quickjs.ts';
import { firstPartyDocument } from '../../packages/seed/src/index.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const NOW = Date.UTC(2026, 9, 15, 12);
const TODAY = '2026-10-15';

type Refusal = { code: string; fix: string; at?: string };
type Out = { ok: boolean; value?: unknown; refusal?: Refusal };
const said = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};

type Api = Awaited<ReturnType<typeof createRecordApi>>;
type Sql = ReturnType<typeof openSqlite>;
type Column = { field: string; label?: string; as?: string };
type Block = { kind: string; heading?: string; area?: string; added?: string; drawn?: boolean; why?: string; columns?: Column[]; rows: { id: string; fields: Record<string, unknown> }[]; refusals: unknown[] };
type Page = { title: string; blocks: Block[] };

/** The file as it ships, read fresh each time so no test can hand the next one a copy it changed. */
const TEXT = readFileSync(new URL('./count-cash.pack.json', import.meta.url), 'utf8');
const shipped = (): Record<string, unknown> => JSON.parse(TEXT) as Record<string, unknown>;

const COUNT = 'Count the cash';
/** The block on Money the three follow. */
const ANCHOR = 'Cash now does not add up';
const LAST = 'The last count';
const FILED = 'Filed as one entry in the Ledger.';

/** Plan and install with exactly what the plan asked to be approved. */
async function put(api: Api, doc: unknown): Promise<void> {
  const diff = said<{ diff: { planHash: string; approve: unknown[] } }>(await api.planPack({ doc, source: { kind: 'local' } } as never, owner)).diff;
  said(await api.installPack({ doc, source: { kind: 'local' }, planHash: diff.planHash, approve: diff.approve } as never, owner));
}

/** A fresh record holding money-core and the modules it stands on, and nothing else. */
async function fresh(): Promise<{ api: Api; sql: Sql; close: () => void }> {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  for (const id of ['portfolio', 'people', 'money-core']) await put(api, firstPartyDocument(id, { seeds: [] }));
  return { api, sql, close: () => sql.close() };
}

/** The pack's rule and script taken to the end the way a host takes them. Counting cash fetches nothing. */
async function settle(api: Api): Promise<void> {
  const refuse = async (): Promise<never> => {
    throw new Error('counting cash fetches nothing');
  };
  const run = scriptRunner({ run: runInQuickJs, send: refuse, pin: refuse, openKey: refuse, grantOf: () => null, reads: scriptReads(api), now: () => NOW } as never);
  for (let i = 0; i < 3; i++) {
    await api.kernel.drain();
    const ran = (await api.kernel.runActions(refuse as never, { script: run, limit: 50 })) as { refused: number; failed: number };
    assert.deepEqual([ran.refused, ran.failed], [0, 0], 'the count was refused or failed');
  }
}

const money = async (api: Api): Promise<Page> => said<Page>(await api.page({ slug: 'money' }, owner));
const headings = (page: Page): (string | undefined)[] => page.blocks.map((b) => b.heading);
const blockOf = (page: Page, heading: string): Block => {
  const b = page.blocks.find((x) => x.heading === heading);
  assert.ok(b, `Money has no block headed ${heading}: ${headings(page).join(', ')}`);
  return b;
};
/** The Ledger's entries, read off the record itself. */
const ledger = (sql: Sql): { what: string; direction: string; amount: { amount: number; currency: string }; account: string }[] =>
  sql.all<{ fields: string }>("SELECT fields FROM entry WHERE register = 'transactions' AND deleted_at IS NULL ORDER BY seq").map((r) => JSON.parse(r.fields));

test('3.0.5 ADDS TWO BLOCKS TO MONEY UNDER CASH NOW, IN THE MAIN COLUMN, and a way into the counter on Money and on an account, and the plan finds the pages on a record holding money-core', async () => {
  const file = await readPackFile(TEXT);
  assert.ok(file.ok, fixOf(file));
  assert.equal(file.value.pack.manifest.version, '3.0.5');
  const adds = shipped().adds as { page: string; after: string; block: { kind: string; heading: string; area?: string; when?: unknown; where?: string } }[];
  assert.deepEqual(
    adds.map((a) => [a.page, a.after, a.block.kind, a.block.heading, a.block.area]),
    [
      ['page.money', ANCHOR, 'capture', COUNT, 'main'],
      ['page.money', ANCHOR, 'cards', LAST, 'main'],
      ['page.money', ANCHOR, 'link', 'Count cash', 'main'],
      ['page.money-account', 'What moved', 'link', 'Count cash', undefined],
    ],
  );
  /* THE BOX IS DRAWN WHILE A BALANCE IS OLD, the same while as Money's own balance check beside it; the last count is
     drawn for a week after a count, since how far out it was is worth reading after the balance is current again, and
     Money holds only what is true now, so a count from last month is not kept there. */
  assert.deepEqual(adds[0]!.block.when, { metric: 'balances-stale', gt: 0 });
  assert.equal(adds[1]!.block.when, undefined);
  assert.equal(adds[1]!.block.where, 'on after -7d');
  const { api, close } = await fresh();
  const diff = said<{ diff: { page_adds?: { page: string; unresolved?: true; refusal?: Refusal }[] } }>(
    await api.planPack({ doc: shipped(), source: { kind: 'local' } } as never, owner),
  ).diff;
  assert.deepEqual(diff.page_adds?.map((a) => [a.page, a.unresolved ?? null, a.refusal ?? null]), [
    ['page.money', null, null],
    ['page.money', null, null],
    ['page.money', null, null],
    ['page.money-account', null, null],
  ]);
  close();
});

test('A COUNT ON MONEY: EGP 120,400.00 against a till rolled to EGP 119,900.00 reads Out by EGP 500.00, and the Ledger holds one entry', async () => {
  const { api, sql, close } = await fresh();
  const before = api.kernel.declarations().find((d) => d.id === 'page.money')!.body;
  await put(api, shipped());
  const till = said<{ id: string }>(
    await api.create({ register: 'accounts', fields: { name: 'Front till', kind: 'cash', balance: { amount: 11_990_000, currency: 'EGP' }, as_of: '2026-10-01', liquid: true } }, owner),
  );

  /* THE TILL WAS LAST SAID TO HOLD WHAT IT HOLDS TWO WEEKS AGO, so the box to count it in is on Money, under Cash now, by
     the line on the oldest balance, and no count has been written yet. AN ANCHOR THAT IS GONE PUTS THE BOX AT THE FOOT OF
     THE PAGE, under every list, which is what 3.0.4 did from money-core 3.34.0 (aaf8e24df), so it is read as a place. */
  const old = await money(api);
  const at = headings(old).indexOf(ANCHOR);
  assert.ok(at >= 0, `Money has no ${ANCHOR}: ${headings(old).join(', ')}`);
  assert.deepEqual(headings(old).slice(at + 1, at + 3), [COUNT, LAST]);
  assert.ok(headings(old).indexOf(COUNT) < headings(old).indexOf('Coming up'), 'the box fell under the lists');
  /* AND IN THE ONE COLUMN, SINCE money-core 3.29.0 gave Money's home no side column. The box keeps `area: main`, which
     a page with no rail reads as the page itself. */
  assert.ok(!old.blocks.some((b) => b.area === 'rail'), "Money's home has a side column again");
  assert.deepEqual([blockOf(old, ANCHOR).area, blockOf(old, COUNT).area, blockOf(old, LAST).area], [undefined, 'main', 'main']);
  const box = blockOf(old, COUNT);
  assert.deepEqual([box.added, box.drawn ?? true, box.refusals], ['count-cash', true, []]);
  /* AND THE LAST COUNT IS LEFT OUT WHILE THERE IS NONE, rather than a tile with nothing in it. */
  const none = blockOf(old, LAST);
  assert.deepEqual([none.rows, none.drawn], [[], false]);

  said(await api.create({ register: 'cash_counts', fields: { account: till.id, counted: { amount: 12_040_000, currency: 'EGP' }, on: TODAY } }, owner));
  await settle(api);

  /* ONE ENTRY IN THE LEDGER, the 500.00 nobody wrote down, coming in. */
  assert.deepEqual(
    ledger(sql).map((t) => [t.what, t.direction, t.amount.amount, t.amount.currency, t.account]),
    [['Cash count difference', 'in', 50_000, 'EGP', till.id]],
  );
  const last = blockOf(await money(api), LAST);
  assert.deepEqual(last.refusals, []);
  assert.equal(last.rows.length, 1);
  const count = last.rows[0]!.fields as { on: string; difference: { amount: number; currency: string }; said: string };
  assert.deepEqual([count.on, count.difference, count.said], [TODAY, { amount: 50_000, currency: 'EGP' }, FILED]);
  /* WHAT A PERSON READS: the column's label and the amount as every screen writes it. */
  const out = last.columns!.find((c) => c.field === 'difference')!;
  const written = writeAmount({ minor: count.difference.amount, currency: count.difference.currency }, 'EGP', 'exact')!.text;
  /* THE CODE AND THE FIGURE ARE HELD TOGETHER BY A SPACE THAT DOES NOT BREAK, as on every screen. */
  assert.equal(`${out.label} ${written}`, `Out by EGP${AMOUNT_SPACE}500.00`);

  /* TAKING THE PACK OUT TAKES BOTH BLOCKS OFF MONEY, and Money's own declaration was never written into. */
  said(await api.uninstallPack({ id: 'count-cash' } as never, owner));
  const after = headings(await money(api));
  assert.ok(!after.includes(COUNT) && !after.includes(LAST), `Money still holds a block of the pack: ${after.join(', ')}`);
  assert.equal(api.kernel.declarations().find((d) => d.id === 'page.money')!.body, before, 'the additions were written into Money\'s page');
  close();
});

test('A COUNT THAT AGREES FILES NOTHING AND SAYS NOTHING, so What happened never claims an entry the Ledger lacks', async () => {
  const { api, sql, close } = await fresh();
  await put(api, shipped());
  const till = said<{ id: string }>(
    await api.create({ register: 'accounts', fields: { name: 'Back till', kind: 'cash', balance: { amount: 2_500_000, currency: 'EGP' }, as_of: '2026-10-01', liquid: true } }, owner),
  );
  said(await api.create({ register: 'cash_counts', fields: { account: till.id, counted: { amount: 2_500_000, currency: 'EGP' }, on: TODAY } }, owner));
  await settle(api);
  assert.deepEqual(ledger(sql), []);
  const count = blockOf(await money(api), LAST).rows[0]!.fields;
  assert.deepEqual([count.difference, count.said ?? null], [{ amount: 0, currency: 'EGP' }, null]);
  close();
});

test('A COUNT OLDER THAN A WEEK LEAVES MONEY, so Money holds no old count, and Cash counts still keeps it', async () => {
  const { api, sql, close } = await fresh();
  await put(api, shipped());
  const till = said<{ id: string }>(
    await api.create({ register: 'accounts', fields: { name: 'Side till', kind: 'cash', balance: { amount: 800_000, currency: 'EGP' }, as_of: '2026-09-20', liquid: true } }, owner),
  );
  said(await api.create({ register: 'cash_counts', fields: { account: till.id, counted: { amount: 790_000, currency: 'EGP' }, on: '2026-10-02' } }, owner));
  await settle(api);
  assert.equal(ledger(sql).length, 1);
  const last = blockOf(await money(api), LAST);
  assert.deepEqual([last.rows, last.drawn], [[], false]);
  const kept = said<Page>(await api.page({ slug: 'cash-counts' }, owner)).blocks.find((b) => b.heading === 'Counts')!;
  assert.equal(kept.rows.length, 1);
  close();
});

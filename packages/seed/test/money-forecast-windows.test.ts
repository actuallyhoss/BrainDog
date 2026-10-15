/**
 * Cash ahead opens on the next ten weeks, on Money and on a book's page, with every longer length one press away
 * (REC-B08, its windows).
 *
 * WHAT WAS WRONG. Money's Cash ahead opened on three months and a book's on a whole year, so the first thing a person
 * saw of a book was a line twelve months long, most of it a plan nobody acts on yet. Ten weeks is the span a person acts
 * on: the next few pay days and the bills before them. The scope's default is taken while the owner's answer on the
 * window is not in: `horizon: 70`, the knob offering 70 days, three and six months, one, two and five years and to the
 * end, and a value axis fitted to the walk.
 *
 * ON A RECORD HOLDING MONEY AS ITS PACK DOCUMENT SAYS IT, with no example entries, and each page read as the app reads
 * it (`k.page`), so a length the page checker or the record refuses fails here and not on a screen.
 *
 * RED FIRST: against forecast.ts and book.ts before this change, Money opened on 90 and a book on 365.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Entry, type Kernel } from '@braindog/kernel';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { NOW, day, firstPartyDocument } from '../src/index.ts';
import { MONEY_PAGES } from '../src/modules/money.ts';
import { MONEY_BOOK_PAGE } from '../src/modules/money/pages/book.ts';

const OWNER = { actor: 'p_1' };
/** Ten weeks, then every longer length the knob offers. */
const WINDOWS = [70, 90, 180, 365, 730, 1825, 'last'];

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

type Ahead = { kind: string; heading?: string; horizon?: unknown; horizons?: unknown; axis?: unknown; refusals?: unknown[]; walk?: { horizon?: number; reach?: number } };

/** The Cash ahead a page declares. */
const declared = (page: string): Ahead => {
  const found = (MONEY_PAGES[page]!.blocks as Ahead[]).find((b) => b.kind === 'forecast' && b.heading === 'Cash ahead');
  assert.ok(found, `${page} declares no Cash ahead`);
  return found;
};

/** A fresh record holding Money, one book with an account in pounds and a bill due in a month. */
async function fresh(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  for (const id of ['portfolio', 'people', 'money-core']) {
    /* WHAT THE RECORD HOLDS SO FAR, so Money goes in as it does on a record without Estate: its walk over
       subscriptions is left out where no list holds them (`firstPartyDocument`'s `holds`). */
    const holds = k.declarations().flatMap((d) => (d.id.startsWith('register.') ? [d.id.slice('register.'.length)] : []));
    const pack = value<Pack>(await normalise(firstPartyDocument(id, { seeds: [], holds }), { kind: 'local' }));
    const state: Installed = { format: 1, primitives: 1, record_version: k.version(), packs: k.packs(), declarations: k.declarations() as Installed['declarations'], rows: k.census() };
    const diff = await plan(pack, state);
    value(await install(pack, diff, hostFor(k), diff.planHash));
  }
  const book = value<Entry>(k.create('books', { name: 'Studio' }, OWNER));
  value<Entry>(k.create('accounts', { name: 'Studio current', kind: 'bank', balance: { amount: 400_000, currency: 'GBP' }, as_of: day(-1), book: book.id }, OWNER));
  value<Entry>(k.create('obligations', { what: 'Studio rent', direction: 'owed_by_me', amount: { amount: 120_000, currency: 'GBP' }, due: day(30), state: 'open', book: book.id }, OWNER));
  return k;
}

/** The Cash ahead a page draws, read as the app reads it, by the page's slug. */
function drawn(k: Kernel, slug: string): Ahead {
  const blocks = value<{ blocks: Ahead[] }>(k.page(slug)).blocks;
  const ahead = blocks.find((b) => b.kind === 'forecast' && b.heading === 'Cash ahead');
  assert.ok(ahead, `${slug} draws no Cash ahead`);
  assert.deepEqual(ahead.refusals ?? [], [], `${slug}'s Cash ahead is read`);
  return ahead;
}

test('BOTH PAGES DECLARE TEN WEEKS FIRST, every longer length after it, and a fitted axis', () => {
  for (const page of ['money', MONEY_BOOK_PAGE.page]) {
    const ahead = declared(page);
    assert.equal(ahead.horizon, 70, `${page} opens on ten weeks`);
    assert.deepEqual(ahead.horizons, WINDOWS, `${page}'s knob offers ten weeks and every longer length`);
    assert.equal(ahead.axis, 'fit', `${page}'s axis fits the walk`);
  }
});

test('A FRESH RECORD INSTALLS THEM, and Money and a book both answer a walk that opens on 70 days', async () => {
  const k = await fresh();
  /* WHAT THE RECORD HOLDS, not only what the seed says: the page as installed opens on ten weeks. */
  for (const id of ['money', MONEY_BOOK_PAGE.page]) {
    const decl = k.declarations().find((d) => d.id === `page.${id}`);
    assert.ok(decl, `the record holds no ${id} page`);
    const ahead = (JSON.parse(decl.body) as { blocks: Ahead[] }).blocks.find((b) => b.kind === 'forecast' && b.heading === 'Cash ahead')!;
    assert.deepEqual([ahead.horizon, ahead.horizons, ahead.axis], [70, WINDOWS, 'fit'], `${id} as installed`);
  }

  const found = (k.pages() as unknown as { slug: string; title: string; template: string | null }[]).find((p) => p.template === MONEY_BOOK_PAGE.page && p.title === 'Studio');
  assert.ok(found, 'Studio has a page of its own');
  for (const slug of ['money', found.slug]) {
    const ahead = drawn(k, slug);
    assert.equal(ahead.walk?.horizon, 70, `${slug} opens on ten weeks`);
    /* THE LONGER LENGTHS STAY IN REACH: a load walks past the opening, and never past two years and a day unasked. */
    const reach = ahead.walk?.reach ?? 0;
    assert.ok(reach > 70 && reach <= 731, `${slug}'s walk reaches ${reach} days`);
  }
});

test('FIVE YEARS IS STILL ONE PRESS AWAY, and the walk still opens on ten weeks', async () => {
  const k = await fresh();
  const asked = drawn({ page: (slug: string) => k.page(slug, undefined, { walk: 1825 }) } as unknown as Kernel, 'money');
  assert.equal(asked.walk?.horizon, 70, 'it still opens on ten weeks');
  assert.ok((asked.walk?.reach ?? 0) >= 1825, `five years asked for walks ${String(asked.walk?.reach)} days`);
});

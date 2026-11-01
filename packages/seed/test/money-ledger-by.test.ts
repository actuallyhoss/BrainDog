/**
 * Who filed each line of the Ledger tile (`src/modules/money/pages/parts/ledger.ts`). Agents do the
 * legwork in view, and "per-row filed by a rule": a person clears their bank's messages into
 * the Ledger and Money says nothing of who filed them.
 *
 * THREE ENTRIES, MADE TODAY, on a record that installed money-core the way a person does: one a bank add-on's pattern
 * made and a filing rule then filed, one a person typed, and one the bank add-on made that no rule matched.
 *
 * WHAT IS HELD HERE, AND WHAT IS NOT YET:
 * - THE TILE'S WRITTEN LINE COUNTS THE DAY from the two figures over who made the Ledger's entries, which were installed
 *   and drawn nowhere. It says how many, and not yet who: a sentence reads a figure's count and never its parts by name.
 * - THE RECORD ALREADY HOLDS WHO FILED EACH LINE, and the tile's own answer carries it: the rule in `filed_by`, and who
 *   changed each line last beside the lines. Nothing words it on the line, because a timeline draws three cells and the
 *   Ledger's three are the day, the name and the amount.
 * - THE LAST TEST IS WHAT STANDS IN THE WAY, and it goes red the day any of it moves, so the line that says "Harbour
 *   Bank filed 2 today", the rule by its name on its line and "needs a look" are not forgotten.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Declaration, type Entry, type Kernel, type WriteContext } from '@braindog/kernel';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { KINDS } from '../../render/src/kinds.ts';

import { NOW, day, firstPartyDocument } from '../src/index.ts';
import { FILING_FIGURES } from '../src/modules/money/figures/filing.ts';
import { LEDGER, LEDGER_COLUMNS, LEDGER_LINES } from '../src/modules/money/pages/parts/ledger.ts';
import { LEDGER_LINE_COLUMNS } from '../src/modules/money/pages/ledger.ts';
import { MOVED_COLUMNS } from '../src/modules/money/pages/shared.ts';

const OWNER = { actor: 'p_1' };
/** A bank add-on's pattern, as the door signs what it files. */
const DOOR = { actor: 'ingest:bank-card-used' };

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

/** One pattern of a bank add-on that files onto the Ledger. The add-on is invented: no real bank is named here. */
const PATTERN: Declaration = {
  id: 'ingest.bank-card-used',
  kind: 'ingest',
  body: { ingest: 'bank-card-used', channel: 'poll', url: 'https://api.example.test/v1/moves', every: '1h', grant: 'example read', extract: { what: { after: 'paid ' } }, writes: { register: 'transactions' } } as never,
};

/** A page of one note, which asks a sentence for a figure's parts by name. Nothing ships it: it measures the grammar. */
const PROBE: Declaration = {
  id: 'page.ledger-probe',
  kind: 'page',
  body: { page: 'ledger-probe', title: 'Probe', blocks: [{ kind: 'note', body: '{{filed-today.names}} filed {{filed-today}} today.' }] } as never,
};

type Change = { by: string; who: string } | null;
type Tile = {
  heading?: string;
  drawn?: boolean;
  refusals: readonly unknown[];
  rows?: readonly Entry[];
  changes?: readonly Change[];
  values?: Record<string, unknown>;
  unnamed?: readonly string[];
};

type Sample = { k: Kernel; tile: () => Tile; talabat: Entry };

/**
 * A record holding money-core as the pack document says it, a person with a name, the Harbour Bank add-on with one
 * pattern, one category and one filing rule, and the three entries, all made today.
 */
async function sample(): Promise<Sample> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  for (const id of ['portfolio', 'people', 'money-core']) {
    const pack = value<Pack>(await normalise(firstPartyDocument(id, { seeds: [] }), { kind: 'local' }));
    const state: Installed = { format: 1, primitives: 1, record_version: k.version(), packs: k.packs(), declarations: k.declarations() as Installed['declarations'], rows: k.census() };
    const diff = await plan(pack, state);
    value(await install(pack, diff, hostFor(k), diff.planHash));
  }
  value(await k.install([PATTERN]));
  sql.exec("INSERT OR REPLACE INTO person (id, email, name) VALUES ('p_1', 'mara@example.test', 'Mara')");
  sql.exec("INSERT INTO pack (id, version, source, manifest, installed_at, checksum) VALUES ('bank-harbour', '1.0.0', 'local', ?, '2026-09-01T00:00:00.000Z', 'x')", JSON.stringify({ name: 'Harbour Bank' }));
  sql.exec("UPDATE declaration SET pack_id = 'bank-harbour' WHERE id = 'ingest.bank-card-used'");

  const account = value<Entry>(k.create('accounts', { name: 'Current', kind: 'bank', balance: { amount: 0, currency: 'GBP' }, as_of: day(-60) }, OWNER));
  const outing = value<Entry>(k.create('categories', { name: 'Outing', direction: 'out', state: 'live' }, OWNER));
  const talabat = value<Entry>(k.create('filing_rules', { match: 'Talabat', match_by: 'starts', direction: 'out', category: outing.id }, OWNER));
  let n = 0;
  const file = (what: string, by: WriteContext, more: Record<string, unknown> = {}): void => {
    value(k.create('transactions', { what, on: day(0), direction: 'out', amount: { amount: 1000 + ++n * 137, currency: 'GBP' }, account: account.id, state: 'cleared', ...more }, by));
  };
  file('Card at Talabat', DOOR, { counterparty_text: 'TALABAT CAIRO' });
  file('Coffee, typed by hand', OWNER, { category: outing.id });
  file('Card at the chemist', DOOR);

  const tile = (): Tile => {
    const found = value<{ blocks: Tile[] }>(k.page('money')).blocks.find((b) => b.heading === 'Ledger');
    assert.ok(found, 'Money draws no Ledger');
    return found;
  };
  return { k, tile, talabat };
}

/** One line of the tile by what the bank called it, with who changed it last. */
const line = (tile: Tile, what: string): { entry: Entry; change: Change } => {
  const at = (tile.rows ?? []).findIndex((r) => r.fields.what === what);
  assert.ok(at >= 0, `the Ledger draws no ${what}`);
  return { entry: tile.rows![at]!, change: tile.changes?.[at] ?? null };
};

test('THE TILE IS STILL SIX LINES OF THE LEDGER, with its own empty line', () => {
  assert.equal(LEDGER.length, 1, 'the Ledger is one tile: Money declares 24 blocks, the most a page holds');
  const tile = LEDGER[0]!;
  assert.deepEqual([tile.kind, tile.heading, tile.source, tile.where], ['timeline', 'Ledger', 'register.transactions', 'state is not void']);
  assert.equal(tile.limit, LEDGER_LINES);
  assert.equal(LEDGER_LINES, 6);
  assert.deepEqual(tile.columns, LEDGER_COLUMNS);
  assert.equal(tile.empty, 'Nothing has moved yet.');
});

test('THE WRITTEN LINE COUNTS THE DAY, from the two figures over who made the entries', async () => {
  const said = (LEDGER[0] as { body?: unknown }).body;
  assert.equal(typeof said, 'string', 'the Ledger tile has no written line');
  const text = String(said);
  /* ONE COUNT SINCE BATCH 6: "3 filed today. 2 filed for you in 30 days." read as two counts at odds, so the line says the day alone. */
  assert.ok(text.includes('{{filed-today}}'), 'the line does not read filed-today');
  assert.ok(!text.includes('filed-for-you-30d'), 'the line says a second count again');
  /* A LINE A PERSON READS: no dash, and none of the words that name the record's own parts. */
  assert.doesNotMatch(text, /[—–]/u);
  assert.doesNotMatch(text, /\b(rows?|entity|entities|list items?)\b/iu);

  const { tile } = await sample();
  const drawn = tile();
  assert.deepEqual(drawn.refusals, []);
  assert.notEqual(drawn.drawn, false);
  /* THREE WERE MADE TODAY, AND TWO OF THEM FOR HER: the bank add-on's two. The one a rule filed after is the bank
     add-on's still, because an entry counts once, under whoever made it. */
  assert.deepEqual(drawn.values, { 'filed-today': 3 });
  assert.equal(drawn.unnamed, undefined, 'the line asks for something the record does not have');
  const filled = text.replace(/\{\{([^{}]+)\}\}/gu, (_, path: string) => String(drawn.values?.[path.trim()]));
  assert.equal(filled, '3 came in today.');
});

test('THE LINE IS NO REASON TO DRAW AN EMPTY LEDGER: a record nothing has moved on draws no tile', async () => {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  for (const id of ['portfolio', 'people', 'money-core']) {
    const pack = value<Pack>(await normalise(firstPartyDocument(id, { seeds: [] }), { kind: 'local' }));
    const state: Installed = { format: 1, primitives: 1, record_version: k.version(), packs: k.packs(), declarations: k.declarations() as Installed['declarations'], rows: k.census() };
    const diff = await plan(pack, state);
    value(await install(pack, diff, hostFor(k), diff.planHash));
  }
  value(k.create('accounts', { name: 'Current', kind: 'bank', balance: { amount: 0, currency: 'GBP' }, as_of: day(-60) }, OWNER));
  const tile = value<{ blocks: Tile[] }>(k.page('money')).blocks.find((b) => b.heading === 'Ledger');
  assert.ok(tile, 'Money holds no Ledger');
  assert.deepEqual(tile.refusals, []);
  assert.equal(tile.drawn, false, 'a Ledger holding nothing is drawn for its written line alone');
});

test('THE RECORD HOLDS WHO FILED EACH LINE, and the tile hands it over beside its lines', async () => {
  const { k, tile, talabat } = await sample();
  const drawn = tile();
  assert.equal(drawn.rows?.length, 3);
  assert.equal(drawn.changes?.length, 3, 'who changed each line last is not beside the lines');

  /* A RULE FILED IT: the entry names the rule, and the rule has a name a person gave it. */
  const ruled = line(drawn, 'Card at Talabat');
  assert.equal(ruled.entry.fields.filed_by, talabat.id);
  assert.equal(k.get(talabat.id)?.fields.match, 'Talabat');
  assert.ok(ruled.entry.fields.category, 'the rule filed no category');
  assert.equal(ruled.change?.who, 'rule:txn-categorise');

  /* SHE TYPED IT: no rule is on it, and nothing changed it for her, which is what "you" is said from. */
  const typed = line(drawn, 'Coffee, typed by hand');
  assert.equal(typed.entry.fields.filed_by, undefined);
  assert.equal(typed.change, null);

  /* THE BANK ADD-ON MADE IT AND NO RULE MATCHED: no category and no rule, which is what "needs a look" is said from. */
  const loose = line(drawn, 'Card at the chemist');
  assert.equal(loose.entry.fields.filed_by, undefined);
  assert.equal(loose.entry.fields.category, undefined);
  assert.equal(loose.change?.who, DOOR.actor);
});

test('WHAT STANDS IN THE WAY of saying it on the line, each of which is not this file\'s', async () => {
  const { k, tile } = await sample();

  /* 1. A TIMELINE DRAWS SIX CELLS AND THE LEDGER'S ARE TAKEN: the day, the name and the amount, then the two halves of
        the quiet line and the chip, which are optional. A seventh column for who filed a line would never be drawn. */
  assert.equal(KINDS.timeline.cells, 6);
  assert.equal(MOVED_COLUMNS.length, KINDS.timeline.cells - (KINDS.timeline.optional ?? 0));
  assert.equal(LEDGER_LINE_COLUMNS.length, KINDS.timeline.cells);

  /* 2. THE NAMES ARE NOT BESIDE THE LINES. A line's rule is the rule's id, and who changed it is the door's or the
        rule's own handle, so a host has no name to write: not "Talabat" and not "Harbour Bank". */
  const drawn = tile();
  assert.doesNotMatch(JSON.stringify([drawn.rows, drawn.changes]), /"Talabat"|Harbour Bank/u);

  /* 3. A SENTENCE READS A FIGURE'S COUNT AND NEVER ITS PARTS BY NAME. The figure knows who: its parts say the bank
        add-on and the person by name. A line that asks for them gets the count alone. */
  const figure = value<{ groups?: { label?: string; value: number | null }[] }>(k.metric(FILING_FIGURES['filed-today'] as never));
  assert.deepEqual((figure.groups ?? []).map((g) => [g.label, g.value]), [['Harbour Bank', 2], ['Mara', 1]]);
  value(await k.install([PROBE]));
  const note = value<{ blocks: Tile[] }>(k.page('ledger-probe')).blocks[0]!;
  assert.deepEqual(note.values, { 'filed-today': 3 }, 'a sentence reads the parts of a figure over who made a list now: write the line that names them');
});

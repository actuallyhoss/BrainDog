/**
 * A block's own menu: every row it offers, the width it greys, and the one change each press makes to the page's look.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { LiveLook } from '../record/page-live.ts';
import { blockAt, changeBlock, changeWords, kindPatch, setBody, withPatch, withoutBlock } from '../record/page-write.ts';
import type { Fetch as ClientFetch, PageBody } from '../record/pages-live.ts';
import { copy } from '../copy.ts';
import type { RowWriter, Wrote } from '../record/rows-write.ts';
import type { Fields } from '../record/schema.ts';
import {
  actionsFor,
  editOf,
  hideBody,
  kpiActionsFor,
  kpiSaidOf,
  kpiWritesOf,
  laidAfter,
  laidOf,
  placeOf,
  runKpiWrites,
  saidOf,
  undoKpiWrites,
  words,
  type KpiHeld,
  type Laid,
  type MenuBlock,
} from './block-menu.ts';

const LATE: MenuBlock = { key: 'late', kind: 'todo', columns: 0, span: 12, name: 'Late', kindName: 'to-do list' };
const owner = { owner: true, area: null, first: false, last: false, hidden: false } as const;
const ids = (b: MenuBlock, at: Parameters<typeof actionsFor>[1]) => actionsFor(b, at).map((a) => a.id);

const laid = (...keys: string[]): Laid[] => keys.map((key) => ({ key, span: 12, drawn: true }));
const look = (over: Partial<LiveLook> = {}): LiveLook => ({
  page: null,
  basis: 'rules',
  lead: null,
  order: [],
  hide: [],
  headline: null,
  next: null,
  pinned: [],
  by: 'rule',
  kept: null,
  ...over,
});

test('THE ROWS IN ORDER: up, down, the five widths, Hide; and the other column only on a page that has one', () => {
  assert.deepEqual(ids(LATE, owner), ['up', 'down', 'width-12', 'width-8', 'width-6', 'width-4', 'width-3', 'hide']);
  assert.deepEqual(ids(LATE, { ...owner, area: 'main' }), ['up', 'down', 'rail', 'width-12', 'width-8', 'width-6', 'width-4', 'width-3', 'hide']);
  assert.deepEqual(ids(LATE, { ...owner, area: 'rail' }).slice(0, 3), ['up', 'down', 'main']);
  const rows = actionsFor(LATE, { ...owner, area: 'main' });
  assert.deepEqual(
    rows.map((a) => a.label),
    [words.up, words.down, words.rail, 'Whole', 'Two thirds', 'Half', 'Third', 'Quarter', words.hide],
  );
  assert.equal(actionsFor(LATE, { ...owner, area: 'rail' })[2]!.label, 'To the main column');
});

test('A MOVE WITH NOWHERE TO GO IS ABSENT, and a hidden block is offered Show', () => {
  assert.deepEqual(ids(LATE, { ...owner, first: true }).slice(0, 2), ['down', 'width-12']);
  assert.deepEqual(ids(LATE, { ...owner, last: true }).slice(0, 2), ['up', 'width-12']);
  assert.equal(ids(LATE, { ...owner, hidden: true }).at(-1), 'show');
});

test('A MEMBER IS OFFERED NOTHING, so no mark is drawn for one', () => {
  assert.deepEqual(actionsFor(LATE, { ...owner, owner: false }), []);
});

test('A WIDTH UNDER THE KIND\'S FLOOR IS THERE AND GREYED, with the reason; the width it has is marked', () => {
  const table: MenuBlock = { key: 'bills', kind: 'table', columns: 0, span: 6, name: 'Bills', kindName: 'table' };
  const rows = actionsFor(table, owner).filter((a) => a.span !== undefined);
  assert.deepEqual(rows.map((a) => a.span), [12, 8, 6, 4, 3]);
  assert.deepEqual(rows.filter((a) => a.disabled).map((a) => a.span), [4, 3]);
  assert.equal(rows.find((a) => a.span === 4)!.why, 'Too narrow for this table');
  assert.deepEqual(rows.filter((a) => a.current).map((a) => a.span), [6]);
  /* A FLOOR HANDED IN WINS: a table of five columns may only be whole. */
  const five = actionsFor(table, { ...owner, steps: [12] }).filter((a) => a.disabled).map((a) => a.span);
  assert.deepEqual(five, [8, 6, 4, 3]);
  assert.equal(editOf(rows.find((a) => a.span === 3)!, table, { laid: laid('bills') }), null, 'a greyed width changes nothing');
});

test('EACH PRESS IS ONE EDIT: the order, a width, a column, hidden', () => {
  const page = { laid: laid('cash', 'late', 'bills') };
  const pick = (id: string) => actionsFor(LATE, { ...owner, area: 'main' }).find((a) => a.id === id)!;
  assert.deepEqual(editOf(pick('up'), LATE, page), { order: ['late', 'cash', 'bills'] });
  assert.deepEqual(editOf(pick('down'), LATE, page), { order: ['cash', 'bills', 'late'] });
  assert.deepEqual(editOf(pick('width-6'), LATE, page), { span: 6 });
  assert.equal(editOf(pick('width-12'), LATE, page), null, 'the width it has is no change');
  assert.deepEqual(editOf(pick('rail'), LATE, page), { area: 'rail' });
  assert.deepEqual(editOf(pick('hide'), LATE, page), { hide: true });
  assert.deepEqual(editOf({ id: 'show', label: words.show }, LATE, page), { hide: false });
  assert.equal(editOf(pick('up'), { ...LATE, key: 'gone' }, page), null, 'a block the page does not lay');
});

test('A MOVE STEPS OVER THE OTHER COLUMN AND WHAT IS NOT DRAWN, and never past a heading', () => {
  const page: Laid[] = [
    { key: 'top', span: 12, drawn: true, kind: 'section' },
    { key: 'cash', span: 12, area: 'main', drawn: true },
    { key: 'side', span: 12, area: 'rail', drawn: true },
    { key: 'quiet', span: 12, area: 'main', drawn: false },
    { key: 'late', span: 12, area: 'main', drawn: true },
    { key: 'more', span: 12, drawn: true, kind: 'section' },
    { key: 'bills', span: 12, area: 'main', drawn: true },
  ];
  assert.deepEqual(editOf({ id: 'up', label: words.up }, LATE, { laid: page }), { order: ['top', 'late', 'cash', 'side', 'quiet', 'more', 'bills'] });
  assert.equal(editOf({ id: 'down', label: words.down }, LATE, { laid: page }), null);
  assert.deepEqual(placeOf(page, 'late', true), { first: false, last: true, area: 'main' });
  assert.deepEqual(placeOf(page, 'cash', true), { first: true, last: false, area: 'main' });
  assert.deepEqual(placeOf(page, 'side', true), { first: true, last: true, area: 'rail' });
  assert.equal(placeOf(page, 'late', false)!.area, null, 'no column to offer on a page with no side column');
});

test('THE PAGE AS LAID AFTER A PRESS is what the look is built from', () => {
  const page = laid('cash', 'late');
  assert.deepEqual(laidAfter(page, 'late', { order: ['late', 'cash'] }).map((l) => l.key), ['late', 'cash']);
  assert.equal(laidAfter(page, 'late', { span: 4 })[1]!.span, 4);
  assert.equal(laidAfter(page, 'late', { area: 'rail' })[1]!.area, 'rail');
  assert.equal(laidAfter(page, 'late', { span: 4 })[0]!.span, 12, 'the other blocks are as they were');
});

test('THE RECORD\'S ANSWER, LAID: keys a look may name, the width the board draws, the column on a page with one', () => {
  const blocks = [
    { kind: 'todo', key: 'late', span: 5 },
    { kind: 'table', key: 'bills', span: 2, columns: [1, 2, 3] },
    { kind: 'note', key: 'side', area: 'rail', drawn: false },
    { kind: 'note' },
  ];
  assert.deepEqual(laidOf(blocks, {}), [
    { key: 'late', span: 5, drawn: true, kind: 'todo' },
    { key: 'bills', span: 6, drawn: true, kind: 'table' },
    { key: 'side', span: 12, drawn: false, kind: 'note' },
  ]);
  assert.deepEqual(laidOf(blocks, { layout: { rail: 4 } }).map((l) => l.area), ['main', 'main', 'rail']);
});

test('HIDE IS THE LIVE LOOK PLUS ONE KEY: the owner\'s keeps all it held, the rules\' gives up its order and lines', () => {
  const own = look({ by: 'owner', order: ['cash', 'late'], hide: ['old'], pinned: ['cash', 'late'], headline: 'Cash is fine', lead: 'late' });
  const mine = hideBody('money', own, 'late', true);
  assert.equal(mine.look, 'money');
  assert.equal(mine.by, 'owner');
  assert.deepEqual(mine.hide, ['old', 'late']);
  assert.deepEqual(mine.pinned, ['cash'], 'a hidden block is pinned no longer');
  assert.deepEqual(mine.order, ['cash', 'late']);
  assert.equal(mine.lead, undefined, 'the block hidden leads no longer');
  assert.equal(mine.headline, 'Cash is fine');
  const rules = hideBody('money', look({ order: ['cash', 'late'], headline: 'Engine line', hide: ['old'] }), 'late', true);
  assert.deepEqual(rules.hide, ['late']);
  assert.equal(rules.order, undefined);
  assert.equal(rules.headline, undefined);
  assert.equal(hideBody('money', null, 'late', true).basis, 'pinned');
  assert.deepEqual(hideBody('money', own, 'old', false).hide ?? [], [], 'Show takes the key out again');
  assert.equal(hideBody('lists', look({ page: 'list-page' }), 'late', true).look, 'list-page', 'written under the page the look is laid over');
});

test('A HIDE KEEPS THE PERSON\'S OWN WIDTHS AND COLUMNS, and takes none from the rules', () => {
  const own = { ...look({ by: 'owner', order: ['late'] }), span: { late: 6 }, area: { late: 'main' } } as LiveLook;
  const mine = hideBody('money', own, 'cash', true);
  assert.deepEqual(mine.span, { late: 6 });
  assert.deepEqual(mine.area, { late: 'main' });
  const rules = hideBody('money', { ...look(), span: { late: 6 } } as LiveLook, 'cash', true);
  assert.equal(rules.span, undefined);
});

test('EACH PRESS SAYS WHAT IT DID, in the block\'s own name', () => {
  assert.equal(saidOf({ span: 6 }, 'Late'), 'Late is half the row.');
  assert.equal(saidOf({ span: 12 }, 'Late'), 'Late is the whole row.');
  assert.equal(saidOf({ span: 8 }, 'Late'), 'Late is two thirds of the row.');
  assert.equal(saidOf({ span: 3 }, 'Late'), 'Late is a quarter of the row.');
  assert.equal(saidOf({ area: 'rail' }, 'Late'), 'Late is in the side column.');
  assert.equal(saidOf({ area: 'main' }, 'Late'), 'Late is in the main column.');
  assert.equal(saidOf({ hide: true }, 'Late'), 'Late is hidden.');
  assert.equal(saidOf({ order: [] }, 'Late', 'down'), 'Late moved down.');
  assert.equal(saidOf({ order: [] }, '', 'up'), 'This block moved up.');
  for (const line of Object.values(words).map((w) => (typeof w === 'function' ? (w as (a: string, b: number) => string)('Late', 6) : w))) {
    assert.doesNotMatch(line, /—|\brow item\b|\bentity\b/u);
  }
});

test('THE MARK IS THE OWNER\'S, behind `?menu`, on a page that writes and is not being arranged, and loaded apart', async () => {
  const { readFile } = await import('node:fs/promises');
  const slot = await readFile(new URL('./BlockSlot.svelte', import.meta.url), 'utf8');
  const gate = slot.slice(slot.indexOf('const menuOn'), slot.indexOf(');', slot.indexOf('const menuOn')));
  for (const must of ['writes !== null', '!arranging', "searchParams.has('menu')", 'owner === true', 'menuSlug !== null']) assert.ok(gate.includes(must), must);
  assert.match(slot, /\{#if menuOn && writes && menuSlug\}[\s\S]*?import\('\.\/BlockMenu\.svelte'\)/u, 'by import(), never in the entry');
  assert.doesNotMatch(slot, /^\s*import BlockMenu/mu);
  const menu = await readFile(new URL('./BlockMenu.svelte', import.meta.url), 'utf8');
  assert.match(menu, /<Icon name="more" size="s" \/>/u);
  assert.match(menu, /lookOfArrangement\(/u);
  assert.match(menu, /writeLook\(/u);
});

/* ── Change to and Remove (PGS-B08 c, d) ─────────────────────────────────── */

const BILLS: MenuBlock = { key: 'bills', kind: 'table', columns: 2, span: 12, name: 'Bills', kindName: 'table' };
/* WHAT `kindsFor` ANSWERS FOR A TABLE OF NAMES AND NOTES, handed in as the menu is, so this needs no renderer. */
const TABLE_KINDS = ['cards', 'todo'];
const NAMES: Record<string, string> = { cards: 'Cards', todo: 'To-do list', table: 'Table' };
const kindName = (k: string) => NAMES[k] ?? k;

test('CHANGE TO ON HIS PAGE: the kinds by name after the widths, then Hide, then Remove', () => {
  const rows = actionsFor(BILLS, { ...owner, change: { mine: true, kinds: TABLE_KINDS, kindName } });
  assert.deepEqual(rows.map((a) => a.id).slice(-5), ['kind-cards', 'kind-todo', 'this', 'hide', 'remove']);
  assert.deepEqual(rows.filter((a) => a.kind).map((a) => a.label), ['Cards', 'To-do list']);
  assert.ok(!rows.some((a) => a.kind === 'table'), 'never the kind it is');
  assert.deepEqual(editOf(rows.find((a) => a.id === 'kind-cards')!, BILLS, { laid: laid('bills') }), { kind: 'cards' });
  assert.deepEqual(editOf(rows.find((a) => a.id === 'remove')!, BILLS, { laid: laid('bills') }), { remove: true });
  /* A KIND HANDED IN THAT IS THE BLOCK'S OWN IS LEFT OUT. */
  assert.ok(!actionsFor(BILLS, { ...owner, change: { mine: true, kinds: ['table', 'cards'] } }).some((a) => a.id === 'kind-table'));
});

test('NOT ON AN ADD-ON\'S PAGE: one greyed row says where Change to is, and nothing is removed', () => {
  const rows = actionsFor(BILLS, { ...owner, change: { mine: false, kinds: TABLE_KINDS, kindName } });
  const change = rows.find((a) => a.id === 'change')!;
  assert.equal(change.disabled, true);
  assert.equal(change.why, 'Change to is on pages you made');
  assert.ok(!rows.some((a) => a.id === 'remove' || a.kind !== undefined));
  assert.equal(editOf(change, BILLS, { laid: laid('bills') }), null, 'pressing it changes nothing');
  /* A PAGE NOT READ YET, AND THE MENU AS IT WAS, offer neither. */
  assert.deepEqual(ids(BILLS, { ...owner, change: { kinds: TABLE_KINDS } }), ids(BILLS, owner));
  assert.ok(!ids(BILLS, { ...owner, change: { mine: false, kinds: [] } }).includes('change'), 'a block that can become nothing else says nothing');
  assert.deepEqual(actionsFor(BILLS, { ...owner, owner: false, change: { mine: true, kinds: TABLE_KINDS } }), [], 'a member is offered none');
});

test('THE LINE OVER UNDO names the block and what it became', () => {
  assert.equal(saidOf({ kind: 'cards' }, 'Bills', 'kind-cards', 'Cards'), 'Bills is now cards.');
  assert.equal(saidOf({ kind: 'todo' }, 'Bills', 'kind-todo', 'To-do list'), 'Bills is now a to-do list.');
  assert.equal(saidOf({ kind: 'lines' }, 'Spent', 'kind-lines', 'Line over time'), 'Spent is now a line over time.');
  assert.equal(saidOf({ remove: true }, 'Bills', 'remove'), 'Bills is off the page.');
});

/* ── the page's write: a change of kind and a removal, with Undo ─────────── */

const BASE = 'http://record.test';
const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const STORED: PageBody = {
  page: 'money',
  title: 'Money',
  blocks: [
    { kind: 'stat', heading: 'Cash', cells: [] },
    { kind: 'table', key: 'bills', heading: 'Bills', source: 'register.bills', columns: [{ field: 'payee' }, { field: 'due' }], group: 'payee', about: 'payee' },
    { kind: 'cards', heading: 'Late', source: 'register.bills', columns: [{ field: 'payee' }, { field: 'due', as: 'when', metric: 'late' }], lead: true, fold: 4 },
  ],
};

/** A record holding one page: `arrangement` answers it with who signed it, and `setDeclaration` keeps what it is sent. */
function record(pack: string | null = null): { io: ClientFetch; held: () => PageBody; sets: unknown[] } {
  let body = structuredClone(STORED);
  let version = 3;
  const sets: unknown[] = [];
  const io: ClientFetch = async (input, init) => {
    const url = String(input);
    const sent = init?.body ? JSON.parse(String(init.body)) : {};
    if (url.includes('/api/arrangement')) return json(200, { ok: true, value: { id: 'page.money', version, pack, body } });
    if (url.includes('/api/setDeclaration')) {
      sets.push(sent);
      if (sent.version !== undefined && sent.version !== version) return json(409, { ok: false, conflict: true });
      body = sent.body;
      version += 1;
      return json(200, { ok: true, value: [{ id: 'page.money', version }] });
    }
    return json(404, { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'No such method.' } });
  };
  return { io, held: () => body, sets };
}

test('KIND GOES THROUGH ONLY TO A KIND kindsFor ALLOWED, and the keys the new kind cannot read come off with it', () => {
  const table = STORED.blocks[1]!;
  assert.equal(withPatch(table, { kind: 'cards' }).kind, 'table', 'the block editor never changes what a block is');
  assert.equal(withPatch(table, { kind: 'cards' }, ['cards', 'todo']).kind, 'cards');
  assert.equal(withPatch(table, { kind: 'board' }, ['cards', 'todo']).kind, 'table', 'a kind not offered is no change');
  assert.equal(kindPatch(table, 'board', ['cards', 'todo']), null);
  assert.equal(kindPatch(table, 'table', ['table']), null, 'what it already is');
  assert.deepEqual(kindPatch(table, 'todo', ['cards', 'todo']), { kind: 'todo', group: null, about: null });
  assert.deepEqual(kindPatch(table, 'cards', ['cards', 'todo']), { kind: 'cards' }, 'cards read a grouping and an about');
  const cards = STORED.blocks[2]!;
  const toTable = kindPatch(cards, 'table', ['table', 'todo'])!;
  assert.equal(toTable.lead, null);
  assert.equal(toTable.fold, null);
  assert.deepEqual(toTable.columns, [{ field: 'payee' }, { field: 'due' }], 'a card\'s roles are a card\'s only');
  assert.deepEqual(withPatch(cards, toTable, ['table', 'todo']), { kind: 'table', heading: 'Late', source: 'register.bills', columns: [{ field: 'payee' }, { field: 'due' }] });
});

test('THE BLOCK PRESSED IS FOUND BY ITS KEY, else by kind, list and heading, and never by a guess', () => {
  assert.equal(blockAt(STORED, { key: 'bills', kind: 'table' }), 1);
  assert.equal(blockAt(STORED, { key: 'a1b2c3', kind: 'cards', source: 'register.bills', heading: 'Late' }), 2, 'the record\'s own name for it');
  assert.equal(blockAt(STORED, { kind: 'cards', source: 'register.bills', heading: 'Early' }), null);
  const twice = { ...STORED, blocks: [...STORED.blocks, { ...STORED.blocks[2]! }] };
  assert.equal(blockAt(twice, { kind: 'cards', source: 'register.bills', heading: 'Late' }), null, 'two alike: neither is written');
  assert.equal(withoutBlock(STORED, 5), null);
  assert.deepEqual(withoutBlock(STORED, 0)?.blocks.map((b) => b.kind), ['table', 'cards']);
});

test('REMOVE GIVES THE PAGE WITHOUT THE BLOCK, and Undo puts it back', async () => {
  const { io, held } = record();
  const out = await changeBlock(BASE, 'money', { key: 'bills', kind: 'table' }, { remove: true }, io);
  assert.equal(out.from, 'written');
  assert.deepEqual(held().blocks.map((b) => b.heading), ['Cash', 'Late']);
  assert.equal(Object.keys(held())[0], 'page', 'the record reads a declaration by its first key');
  if (out.from !== 'written') return;
  const back = await setBody(BASE, out.before, io, out.version);
  assert.equal(back.from, 'written');
  assert.deepEqual(held(), STORED);
});

test('CHANGE TO WRITES THE NEW KIND, and Undo puts the block back as it was', async () => {
  const { io, held, sets } = record();
  const out = await changeBlock(BASE, 'money', { key: 'bills', kind: 'table' }, { kind: 'cards', kinds: TABLE_KINDS }, io);
  assert.equal(out.from, 'written');
  assert.equal(held().blocks[1]!.kind, 'cards');
  assert.equal((sets[0] as { version?: number }).version, 3, 'written at the version read');
  if (out.from === 'written') await setBody(BASE, out.before, io, out.version);
  assert.equal(held().blocks[1]!.kind, 'table');
  /* A KIND NOT OFFERED IS NOT WRITTEN. */
  sets.length = 0;
  assert.equal((await changeBlock(BASE, 'money', { key: 'bills', kind: 'table' }, { kind: 'board', kinds: TABLE_KINDS }, io)).from, 'refused');
  assert.equal(sets.length, 0);
});

test('AN ADD-ON\'S PAGE IS NEVER SET WHOLE from the menu: it would become his copy and stop taking updates', async () => {
  const { io, sets } = record('money-pack');
  const out = await changeBlock(BASE, 'money', { key: 'bills', kind: 'table' }, { remove: true }, io);
  assert.deepEqual(out, { from: 'refused', fix: changeWords.notYours });
  assert.equal(sets.length, 0);
  assert.doesNotMatch(changeWords.notYours, /—|\brow\b|\bentity\b/u);
});

/* ── a key number's own rows ─────────────────────────────────────────────────────────────────────────────────── */

const KILN = 'P01KILN';
const kpi = (seq: number, fields: Fields, version = 1): KpiHeld => ({ seq, version, fields: { name: `Number ${seq}`, thing: KILN, today: 'auto', headline: false, ...fields } });

/** A row writer over a few rows held in memory, compare-and-set as the record is: a stale version is turned down. */
function rows(held: KpiHeld[]) {
  const sent: { seq: number; patch: Fields; version: number | undefined }[] = [];
  let refuse: number | null = null;
  const writer: Pick<RowWriter, 'update'> = {
    async update(_list, seq, patch, version): Promise<Wrote> {
      sent.push({ seq, patch, version });
      const row = held.find((r) => r.seq === seq);
      if (!row || seq === refuse) return { ok: false, why: 'refused', fix: 'Not now.' };
      if (version !== row.version) return { ok: false, why: 'conflict', fix: 'Somebody changed it.', entry: null };
      row.fields = { ...row.fields, ...patch };
      row.version += 1;
      return { ok: true, entry: { seq, fields: row.fields, version: row.version, created: '', by: '' } };
    },
  };
  return { writer, sent, refuseOn: (seq: number) => (refuse = seq) };
}

test('A KEY NUMBER\'S MENU: the two ways it is not on Today, then Lead unless it leads', () => {
  const ids = (k: KpiHeld) => kpiActionsFor(k, true).map((a) => a.id);
  assert.deepEqual(ids(kpi(1, {})), ['kpi-pin', 'kpi-hide', 'kpi-lead']);
  assert.deepEqual(ids(kpi(1, { today: 'pinned' })), ['kpi-auto', 'kpi-hide', 'kpi-lead']);
  assert.deepEqual(ids(kpi(1, { today: 'hidden', headline: true })), ['kpi-pin', 'kpi-auto']);
  /* AN EMPTY `today` READS AUTO, as the record's default does. */
  assert.deepEqual(ids(kpi(1, { today: undefined as never })), ['kpi-pin', 'kpi-hide', 'kpi-lead']);
  assert.deepEqual(
    kpiActionsFor(kpi(1, {}), true).map((a) => a.label),
    ['Pin to Today', 'Hide from Today', 'Lead the card with this'],
  );
  assert.equal(kpiActionsFor(kpi(1, { today: 'pinned' }), true)[0]!.label, copy.kpiMenuAuto);
});

test('NOTHING IS OFFERED to a reader who may not write, nor on a suggestion, a stopped number or a deleted one', () => {
  assert.deepEqual(kpiActionsFor(kpi(1, {}), false), []);
  assert.deepEqual(kpiActionsFor(kpi(1, { draft: true }), true), []);
  assert.deepEqual(kpiActionsFor(kpi(1, { state: 'retired' }), true), []);
  assert.deepEqual(kpiActionsFor(kpi(1, { deleted_at: '2026-10-20T10:00:00Z' }), true), []);
});

test('SHOW AND HIDE SET ONE ROW\'S today AT ITS VERSION, and a press that changes nothing writes nothing', () => {
  const k = kpi(4, {}, 7);
  assert.deepEqual(kpiWritesOf('kpi-pin', k, []), [{ seq: 4, version: 7, patch: { today: 'pinned' }, undo: { today: 'auto' } }]);
  assert.deepEqual(kpiWritesOf('kpi-hide', k, []), [{ seq: 4, version: 7, patch: { today: 'hidden' }, undo: { today: 'auto' } }]);
  assert.deepEqual(kpiWritesOf('kpi-auto', kpi(4, { today: 'hidden' }, 2), []), [{ seq: 4, version: 2, patch: { today: 'auto' }, undo: { today: 'hidden' } }]);
  assert.deepEqual(kpiWritesOf('kpi-auto', k, []), []);
  assert.deepEqual(kpiWritesOf('kpi-pin', kpi(4, { today: 'pinned' }), []), []);
});

test('LEAD CLEARS THE PROJECT\'S OTHER LEADER FIRST, then takes it; another project\'s and a stopped one\'s are left be', () => {
  const mine = kpi(1, {}, 3);
  const leader = kpi(2, { headline: true }, 5);
  const plain = kpi(3, {});
  const elsewhere = kpi(4, { headline: true, thing: 'P02MARLOW' });
  const stopped = kpi(5, { headline: true, state: 'retired' });
  assert.deepEqual(kpiWritesOf('kpi-lead', mine, [mine, leader, plain, elsewhere, stopped]), [
    { seq: 2, version: 5, patch: { headline: false }, undo: { headline: true } },
    { seq: 1, version: 3, patch: { headline: true }, undo: { headline: false } },
  ]);
  assert.deepEqual(kpiWritesOf('kpi-lead', leader, [mine, leader]), [], 'the leader is already leading');
  /* A ROW THE WRITER HAS NAMED HOLDS ITS PROJECT AS A NUMBER, and the same project is the same number. */
  assert.equal(kpiWritesOf('kpi-lead', kpi(1, { thing: 1 }), [kpi(2, { thing: 1, headline: true })]).length, 2);
});

test('THE WRITES GO THROUGH THE ROW WRITER IN ORDER, and Undo puts each back at the version it was left at', async () => {
  const held = [kpi(1, {}, 3), kpi(2, { headline: true }, 5)];
  const { writer, sent } = rows(held);
  const out = await runKpiWrites(writer, 'key-numbers', kpiWritesOf('kpi-lead', held[0]!, held));
  assert.equal(out.ok, true);
  assert.deepEqual(sent.map((s) => [s.seq, s.version]), [[2, 5], [1, 3]], 'each at the version it was read at');
  assert.equal(held[0]!.fields.headline, true);
  assert.equal(held[1]!.fields.headline, false);
  assert.deepEqual(out.done, [{ seq: 2, version: 6, undo: { headline: true } }, { seq: 1, version: 4, undo: { headline: false } }]);
  assert.deepEqual(await undoKpiWrites(writer, 'key-numbers', out.done), { ok: true });
  assert.deepEqual(sent.slice(2).map((s) => [s.seq, s.version]), [[1, 4], [2, 6]], 'last first, at the versions the press left');
  assert.equal(held[0]!.fields.headline, false);
  assert.equal(held[1]!.fields.headline, true);
});

test('A ROW CHANGED SINCE IT WAS READ IS NOT WRITTEN OVER: the press stops there and says why', async () => {
  const held = [kpi(1, {}, 3), kpi(2, { headline: true }, 5)];
  const { writer, sent } = rows(held);
  const stale = { ...held[1]!, version: 4 };
  const out = await runKpiWrites(writer, 'key-numbers', kpiWritesOf('kpi-lead', held[0]!, [held[0]!, stale]));
  assert.deepEqual(out, { ok: false, fix: 'Somebody changed it.', done: [] });
  assert.equal(sent.length, 1, 'nothing after the stale row is sent');
  assert.equal(held[0]!.fields.headline, false, 'so no two numbers lead the card');
});

test('WHAT A PRESS SAYS names the number, and a number with no name is This number', () => {
  assert.equal(kpiSaidOf('kpi-pin', 'Players'), 'Players is on Today.');
  assert.equal(kpiSaidOf('kpi-hide', 'Players'), 'Players is off Today.');
  assert.equal(kpiSaidOf('kpi-auto', 'Players'), 'Today shows Players when it needs a look.');
  assert.equal(kpiSaidOf('kpi-lead', ' '), 'This number leads the card.');
  for (const a of ['kpi-pin', 'kpi-hide', 'kpi-auto', 'kpi-lead'] as const) assert.doesNotMatch(kpiSaidOf(a, 'Players'), /—|\bkpi\b|\bheadline\b/u);
});

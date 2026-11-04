/**
 * A declared page's writes: a moved card and a ticked task become one `update` of the row they came from, at the version
 * the page read, and the answer is written, the record's sentence, a conflict, or no record at all.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { Row } from 'braindog-render';

import './fixtures/fill.ts';
import { copy } from '../copy.ts';
import { REGISTERS } from './fixtures/sample.ts';
import type { Fetch as ClientFetch } from './pages-live.ts';
import { arrangedBody, declaredBlock, keepInPlace, movePatch, rowKey, saveArrangement, saveLayout, schemaOf, tickPatch, updateRow, type Fetch } from './page-write.ts';

const BASE = 'http://record.test';

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function host(answer: (() => Response) | null): { io: Fetch; sent: { url: string; init: RequestInit | undefined }[] } {
  const sent: { url: string; init: RequestInit | undefined }[] = [];
  const io: Fetch = async (url, init) => {
    sent.push({ url, init });
    if (!answer) throw new TypeError('fetch failed');
    return answer();
  };
  return { io, sent };
}

/* A register the sample declares with a state and terminal states, whichever it is. */
const withState = Object.values(REGISTERS).find((r) => r.state && (r.done?.length ?? 0) > 0 && r.fields.some((f) => f.id === r.state && (f.values?.length ?? 0) > 1));

test('a ticked task is its register state: the first terminal one, and back to the one a new row starts in', () => {
  assert.ok(withState, 'the sample declares no register with a state and terminal states');
  const field = withState.state!;
  const decl = withState.fields.find((f) => f.id === field)! as { values: readonly string[]; default?: unknown };
  const ref = { register: withState.id, seq: 1, version: 1 };
  assert.deepEqual(tickPatch(ref, true), { [field]: withState.done![0] });
  const started = typeof decl.default === 'string' && !withState.done!.includes(decl.default) ? decl.default : decl.values.find((v) => !withState.done!.includes(v));
  assert.deepEqual(tickPatch(ref, false), { [field]: started });
  assert.equal(tickPatch({ register: 'no-such-list', seq: 1, version: 1 }, true), null);
});

/**
 * UN-TICKING A TASK PUT IT IN LATER, WHICH IS NOT WHERE IT WAS. `tasks` declares its states `backlog` first, so that the
 * Board draws Later as its first column, and the tick went back to the first state that is not terminal. Run against
 * the sample before the repair, un-ticking `tasks#3` sent `{ state: 'backlog' }`: on work 1.6.0's Overview that is a
 * task ticked under Today by mistake which, un-ticked, leaves Today and the Open figure and comes back under Later. The
 * register already says where a task nobody placed belongs: its `default` is `open`, which is what a new task is and
 * so what a reopened one is.
 */
test('AN UN-TICKED TASK GOES BACK TO THE STATE A NEW ONE STARTS IN, and not to the first one the register lists', () => {
  const tasks = REGISTERS.tasks!;
  assert.equal(tasks.fields.find((f) => f.id === 'state')?.values?.[0], 'backlog', 'the sample no longer lists backlog first, so this does not bite');
  assert.deepEqual(tickPatch({ register: 'tasks', seq: 3, version: 1 }, false), { state: 'open' });

  /* A RECORD'S OWN DECLARATION IS READ THE SAME WAY, and one with no default, or a terminal one, falls back as before. */
  const shots = (dflt?: string) => ({
    state: 'stage',
    done: ['wrapped', 'cut'],
    fields: [{ id: 'stage', values: ['idea', 'to_shoot', 'wrapped', 'cut'], ...(dflt === undefined ? {} : { default: dflt }) }],
  });
  const ref = { register: 'shots', seq: 1, version: 1 };
  assert.deepEqual(tickPatch(ref, false, shots('to_shoot')), { stage: 'to_shoot' });
  assert.deepEqual(tickPatch(ref, false, shots()), { stage: 'idea' });
  assert.deepEqual(tickPatch(ref, false, shots('wrapped')), { stage: 'idea' }, 'a terminal default is not a way to reopen');
  assert.deepEqual(tickPatch(ref, false, shots('nowhere')), { stage: 'idea' }, 'a default the field does not declare is not a state');
});

test("a moved card's column goes back to the declared value", () => {
  assert.ok(withState);
  const field = withState.state!;
  const declared = withState.fields.find((f) => f.id === field)!.values!.find((v) => v.includes('_')) ?? withState.done![0]!;
  const drawn = declared.replaceAll('_', ' ').toUpperCase();
  assert.deepEqual(movePatch({ register: withState.id, seq: 1, version: 1 }, field, drawn), { [field]: declared });
});

test('A LIST THIS BUILD HAS NEVER HEARD OF IS TICKED AND MOVED BY THE STATES THE RECORD DECLARES FOR IT', async () => {
  const shots = {
    id: 'shots',
    state: 'stage',
    done: ['wrapped', 'cut'],
    fields: [{ id: 'stage', type: 'enum', values: ['to_shoot', 'in_edit', 'wrapped', 'cut'] }],
  };
  const ref = { register: 'shots', seq: 4, version: 2 };
  assert.equal(tickPatch(ref, true), null, 'the fixture is a register the built-in sample declares');
  assert.deepEqual(tickPatch(ref, true, shots), { stage: 'wrapped' });
  assert.deepEqual(tickPatch(ref, false, shots), { stage: 'to_shoot' });
  assert.deepEqual(movePatch(ref, 'stage', 'In edit', shots), { stage: 'in_edit' });

  let asked = 0;
  const io: ClientFetch = async (input) => {
    asked++;
    assert.ok(String(input).endsWith('/api/schema?register=shots'), String(input));
    return json(200, { ok: true, value: shots });
  };
  assert.deepEqual(await schemaOf('http://schema.test', 'shots', io), shots);
  assert.deepEqual(await schemaOf('http://schema.test', 'shots', io), shots);
  assert.equal(asked, 1, 'a register was asked for again on the next gesture');
  const refused: ClientFetch = async () => json(403, { ok: false, refusal: { code: 'FORBIDDEN', fix: 'No.' } });
  assert.equal(await schemaOf('http://schema.test', 'other', refused), null);
});

test('the change is one update of that row at the version the page read, with the session', async () => {
  const { io, sent } = host(() => json(200, { ok: true, value: { id: 'e_1', seq: 4, version: 9 } }));
  const out = await updateRow(BASE, { register: 'tasks', seq: 4, version: 8 }, { state: 'done' }, 'Send the invoice', io);
  assert.deepEqual(out, { from: 'written', version: 9 });
  assert.equal(sent[0]!.url, `${BASE}/api/update`);
  assert.equal(sent[0]!.init?.method, 'POST');
  assert.equal(sent[0]!.init?.credentials, 'same-origin');
  assert.deepEqual(JSON.parse(String(sent[0]!.init?.body)), { register: 'tasks', seq: 4, patch: { state: 'done' }, version: 8 });
});

test("a refusal is the record's sentence, and a row changed first is a conflict", async () => {
  const fix = 'done is not a state tasks can move to from dropped.';
  const refused = host(() => json(422, { ok: false, refusal: { code: 'TRANSITION_ILLEGAL', fix } }));
  assert.deepEqual(await updateRow(BASE, { register: 'tasks', seq: 4, version: 8 }, {}, 'Send the invoice', refused.io), { from: 'refused', fix });

  const moved = host(() => json(409, { ok: false, conflict: { current: {}, actor: 'p_2' } }));
  assert.deepEqual(await updateRow(BASE, { register: 'tasks', seq: 4, version: 8 }, {}, 'Send the invoice', moved.io), {
    from: 'conflict',
    fix: copy.pageRowConflict('Send the invoice'),
  });
});

test('no record is a calm sentence and never the error text', async () => {
  assert.deepEqual(await updateRow(BASE, { register: 'tasks', seq: 4, version: 8 }, {}, 'x', host(null).io), {
    from: 'unreachable',
    fix: copy.recordNotReached,
  });
});

/* ── arranging a page ─────────────────────────────────────────────────── */

const BODY = {
  page: 'money',
  title: 'Money',
  nav: { section: 'Work', order: 1 },
  blocks: [
    { kind: 'stat', span: 12, cells: ['owed'] },
    { kind: 'table', span: 12, source: 'register.obligations' },
    { kind: 'list', span: 6, source: 'register.tasks' },
  ],
};

test('AN ARRANGED BODY IS THE STORED ONE REORDERED AND RESIZED, with an added block declared where it was put', () => {
  const added = { kind: 'chips', source: 'register.obligations', columns: [{ field: 'state', label: 'State', width: 'minmax(8ch,1fr)', align: 'start' }], rows: [] };
  const out = arrangedBody(BODY, [{ i: 2, span: 12 }, { i: 3, span: 4 }, { i: 0, span: 6 }], [added]);
  assert.deepEqual(out, {
    page: 'money',
    title: 'Money',
    nav: { section: 'Work', order: 1 },
    blocks: [
      { kind: 'list', span: 12, source: 'register.tasks' },
      { kind: 'chips', span: 4, source: 'register.obligations', columns: [{ field: 'state', label: 'State' }] },
      { kind: 'stat', span: 6, cells: ['owed'] },
    ],
  });
  assert.equal(arrangedBody(BODY, [{ i: 9, span: 12 }], []), null, 'a place past both lists was written as a guess');
});

test('AN ARRANGED BODY WRITES THE COLUMN EACH BLOCK WAS MOVED TO, and leaves the rest of each block as the record holds it', () => {
  // THE RED: this wrote order and span only, so a block moved to the rail went back to the record in the main column.
  const laid = {
    page: 'desk',
    title: 'Desk',
    layout: { rail: 4 },
    blocks: [
      { kind: 'table', source: 'register.steps', span: 12 },
      { kind: 'note', body: 'Pinned.', area: 'rail', span: 12 },
      { kind: 'note', body: 'Said main.', area: 'main', span: 12 },
      { kind: 'note', body: 'Left alone.', area: 'rail', span: 12 },
    ],
  };
  const out = arrangedBody(
    laid,
    [
      { i: 0, span: 12, area: 'rail' },
      { i: 1, span: 12, area: 'main' },
      { i: 2, span: 12, area: 'main' },
      { i: 3, span: 12 },
    ],
    [],
  );
  assert.deepEqual(out?.blocks[0], { kind: 'table', source: 'register.steps', span: 12, area: 'rail' });
  // Main is what a block with no area already means, so a block moved back loses the key rather than gaining a second
  // spelling of the default.
  assert.deepEqual(out?.blocks[1], { kind: 'note', body: 'Pinned.', span: 12 });
  // A block whose column did not change is written as it was, `area: main` and all, and one placed with no column at all
  // (every block on a page with no rail) is where the record has it.
  assert.deepEqual(out?.blocks[2], laid.blocks[2]);
  assert.deepEqual(out?.blocks[3], laid.blocks[3]);
  assert.equal(out?.layout, laid.layout);
});

test('DONE READS THE STORED BODY, SETS IT WHOLE, and hands back the one before for undo', async () => {
  const sent: { url: string; body: unknown }[] = [];
  const io: ClientFetch = async (input, init) => {
    const url = String(input);
    sent.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
    if (url.includes('/api/page')) return json(200, { ok: true, value: { nav: BODY.nav, page: BODY.page, title: BODY.title, blocks: BODY.blocks.map((b) => ({ ...b, rows: [], drawn: true })) } });
    return json(200, { ok: true, value: { id: 'page.money' } });
  };
  const out = await saveArrangement(BASE, 'money', 3, [{ i: 1, span: 12 }, { i: 0, span: 12 }, { i: 2, span: 6 }], [], io);
  assert.equal(out.from, 'written');
  assert.deepEqual(out.from === 'written' && out.before.blocks.map((b) => b.kind), ['stat', 'table', 'list']);
  const set = sent.find((s) => s.url.endsWith('/api/setDeclaration'));
  assert.deepEqual((set?.body as { body: { blocks: { kind: string }[] } }).body.blocks.map((b) => b.kind), ['table', 'stat', 'list']);
  assert.ok(!JSON.stringify(set?.body).includes('drawn'), 'the answer was written back as the declaration');
  assert.equal(Object.keys((set?.body as { body: object }).body)[0], 'page', 'the record reads a declaration by its first key, and it was not page');

  /* A page that gained a block since it was drawn is not written over. */
  const moved = await saveArrangement(BASE, 'money', 2, [{ i: 0, span: 12 }], [], io);
  assert.deepEqual(moved, { from: 'refused', fix: copy.arrangeMoved });

  /* A template's answer is one row's expansion, and is never set: the stored template is, by block index. */
  const stored = { ...BODY, page: 'projects', for: { register: 'projects' }, blocks: BODY.blocks.map((b, n) => (n === 1 ? { ...b, where: 'client is {{client}}' } : b)) };
  const setTemplate: unknown[] = [];
  const template: ClientFetch = async (input, init) => {
    const url = String(input);
    if (url.includes('/api/page')) return json(200, { ok: true, value: { ...BODY, for: { register: 'projects' }, param: { register: 'projects', seq: 1, title: 'Kiln' } } });
    if (url.includes('/api/arrangement')) return json(200, { ok: true, value: { id: 'page.projects', version: 7, body: stored } });
    setTemplate.push(init?.body ? JSON.parse(String(init.body)) : null);
    return json(200, { ok: true, value: [{ id: 'page.projects', version: 8 }] });
  };
  const arranged = await saveArrangement(BASE, 'kiln', 3, [{ i: 1, span: 12 }, { i: 0, span: 12 }, { i: 2, span: 6 }], [], template);
  assert.deepEqual(arranged.from === 'written' && [arranged.template, arranged.version], ['projects', 8]);
  const written = (setTemplate[0] as { body: { page: string; blocks: { where?: string }[] }; version?: number } | undefined);
  assert.equal(written?.body.page, 'projects');
  assert.equal(written?.version, 7);
  assert.equal(written?.body.blocks[0]?.where, 'client is {{client}}', 'the template was written with one row filled into it');

  const refused: ClientFetch = async (url) =>
    String(url).includes('/api/page') ? json(200, { ok: true, value: BODY }) : json(403, { ok: false, refusal: { code: 'FORBIDDEN', fix: 'Only an owner or an admin sets a declaration.' } });
  assert.deepEqual(await saveArrangement(BASE, 'money', 3, [{ i: 0, span: 12 }], [], refused), { from: 'refused', fix: 'Only an owner or an admin sets a declaration.' });
});

test('DONE WRITES AGAINST THE VERSION THE SCREEN DREW, and a page arranged by somebody else meanwhile is not written over', async () => {
  const sent: { url: string; body: unknown }[] = [];
  let answer: unknown = { ok: true, value: [{ id: 'page.money', version: 5, changed: true }] };
  const io: ClientFetch = async (input, init) => {
    const url = String(input);
    sent.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
    if (url.includes('/api/page')) return json(200, { ok: true, value: { ...BODY, read_at: '2026-09-17T12:00:00.000Z', declared_version: 4 } });
    return json((answer as { ok: boolean }).ok ? 200 : 409, answer);
  };
  const out = await saveArrangement(BASE, 'money', 3, [{ i: 1, span: 12 }, { i: 0, span: 12 }, { i: 2, span: 6 }], [], io, 4);
  assert.deepEqual(out.from === 'written' && out.version, 5, 'the undo was not handed the version the write made');
  const set = sent.find((s) => s.url.endsWith('/api/setDeclaration'))?.body as { version?: number; body: object };
  assert.equal(set.version, 4);
  assert.ok(!('read_at' in set.body) && !('declared_version' in set.body), 'what the answer carried was written back as the declaration');

  /* Drawn at 3 and now at 4: somebody arranged it in between. Nothing is sent. */
  sent.length = 0;
  assert.deepEqual(await saveArrangement(BASE, 'money', 3, [{ i: 0, span: 12 }], [], io, 3), { from: 'refused', fix: copy.arrangeMoved });
  assert.equal(sent.filter((s) => s.url.endsWith('/api/setDeclaration')).length, 0);

  /* Moved between the read and the write: the record's conflict says the same. */
  answer = { ok: false, conflict: { version: 5, current: null, actor: 'in-app' } };
  assert.deepEqual(await saveArrangement(BASE, 'money', 3, [{ i: 0, span: 12 }], [], io, 4), { from: 'refused', fix: copy.arrangeMoved });
});

/* ── a ticked task and a moved card stay where they were ──────────────── */

const ROW = (seq: number, title: string, extra: Partial<Row> = {}): Row => ({ cells: [title], ref: { register: 'tasks', seq, version: 1 }, ...extra });

/**
 * THE ROW THE READER JUST TICKED WAS GONE BEFORE THEY COULD SEE THE TICK. `writeRow` read the page again after the
 * write, and a `todo` whose `where:` leaves out done rows answers without the row it just ticked: no mark, no receipt,
 * and nothing on screen to press. A count of the history found 13 of 85 human writes reversed within five seconds for
 * exactly this shape. Before the repair this file failed to import, because nothing exported `keepInPlace`.
 */
test('A TICKED TASK THE RE-READ LEAVES OUT IS DRAWN WHERE IT WAS, done', () => {
  const [a, b, c] = [ROW(1, 'a'), ROW(2, 'b'), ROW(3, 'c')];
  const out = keepInPlace([a, b, c], [a, c], new Map([[rowKey(b.ref!), { done: true, version: 2 }]]));
  assert.deepEqual(out.map((r) => r.cells[0]), ['a', 'b', 'c']);
  assert.equal(out[1]!.done, true, 'the held row came back without the tick it was held for');
  assert.equal(out[1]!.ref?.version, 2, 'a second tick on the held row would be sent at the version before the first');
});

test('A HELD ROW STILL IN THE ANSWER IS DRAWN FROM THE ANSWER, at the place it was found', () => {
  const [a, b, c] = [ROW(1, 'a'), ROW(2, 'b'), ROW(3, 'c')];
  /* The record answers newest write first, so the ticked row comes back at the head. */
  const now = ROW(2, 'b, renamed elsewhere', { done: true, ref: { register: 'tasks', seq: 2, version: 7 } });
  const out = keepInPlace([a, b, c], [now, a, c], new Map([[rowKey(b.ref!), { done: true, version: 2 }]]));
  assert.deepEqual(out, [a, now, c]);
});

const card = (seq: number, lane: string, version = 1): Row => ({ cells: [lane, `card ${seq}`], ref: { register: 'tasks', seq, version } });
const drawnAs = (rows: readonly Row[]) => rows.map((r) => r.cells.join(' '));

/**
 * A MOVED CARD PUT BACK AT ITS OLD INDEX REORDERED THE BOARD. A board's columns are the order its rows first name them
 * (`columnsOf` in `packages/render/src/board.ts`), so a card moved from Open to Done and spliced back at index 1 made
 * the columns read Open, Done, Doing, with the card at the head of Done. Measured against the first version of
 * `keepInPlace`: columns `[open, done, doing]` from a board that had read `[open, doing, done]` before and after.
 */
/**
 * A TICK IS DRAWN BEFORE IT IS SENT, and the page may read itself again while the write is out: the poll heard some other
 * change, or the write's own re-read has not come back. That answer was read before the tick, so it still says the row is
 * not done, and a hold that drew the answer's row drew the tick away under the reader's finger. A pending hold wears what
 * it holds over the answer's row; once the write is read back, the answer is the truth again.
 */
test('A PENDING HOLD WEARS ITS TICK AND ITS COLUMN over an answer read before the write, and a settled one does not', () => {
  const [a, b] = [ROW(1, 'a'), ROW(2, 'b')];
  const pending = keepInPlace([a, b], [a, b], new Map([[rowKey(b.ref!), { done: true, pending: true }]]));
  assert.equal(pending[1]!.done, true, 'the answer read before the tick drew the tick away');
  const settled = keepInPlace([a, b], [a, b], new Map([[rowKey(b.ref!), { done: true }]]));
  assert.equal(settled[1]!.done, undefined, 'a settled hold draws the row the record answered');
  const before = [card(1, 'Open'), card(2, 'Open'), card(3, 'Done')];
  const moved = keepInPlace(before, before, new Map([[rowKey(before[0]!.ref!), { to: 'Done', pending: true }]]));
  assert.deepEqual(drawnAs(moved), ['Open card 2', 'Done card 3', 'Done card 1'], 'the card is in its new column before the record has it');
});

test('A MOVED CARD WEARS ITS NEW COLUMN at the foot of it, and the board keeps its columns in their order', () => {
  const before = [card(1, 'Open'), card(2, 'Open'), card(3, 'Doing'), card(4, 'Done')];
  /* The record answers newest write first, so the moved card comes back at the head of its new column. */
  const out = keepInPlace(before, [before[0]!, before[2]!, card(2, 'Done', 2), before[3]!], new Map([[rowKey(before[1]!.ref!), { to: 'Done', version: 2 }]]));
  assert.deepEqual(drawnAs(out), ['Open card 1', 'Doing card 3', 'Done card 4', 'Done card 2']);
  /* A column this board never drew goes last, where `boardOrder` puts a value the enum does not declare. */
  const parked = keepInPlace(before, [before[0]!, before[2]!, before[3]!], new Map([[rowKey(before[1]!.ref!), { to: 'Parked' }]]));
  assert.deepEqual(drawnAs(parked), ['Open card 1', 'Doing card 3', 'Done card 4', 'Parked card 2']);
});

test('TWO CARDS THE ANSWER LEFT OUT land at the foot of their columns in the order they were found', () => {
  const before = [card(1, 'Open'), card(2, 'Open'), card(3, 'Doing'), card(4, 'Done')];
  const held = new Map([
    [rowKey(before[1]!.ref!), { to: 'Done', version: 3 }],
    [rowKey(before[0]!.ref!), { to: 'Doing', version: 4 }],
  ]);
  const out = keepInPlace(before, [before[2]!, before[3]!], held);
  assert.deepEqual(drawnAs(out), ['Doing card 3', 'Doing card 1', 'Done card 4', 'Done card 2']);
  assert.deepEqual(out.map((r) => r.ref?.version), [1, 4, 1, 3]);
});

test('A PLACE PAST THE END IS CLAMPED, and a hold on a row this block never drew leaves it alone', () => {
  const [a, b, c, d] = [ROW(1, 'a'), ROW(2, 'b'), ROW(3, 'c'), ROW(4, 'd')];
  assert.deepEqual(keepInPlace([a, b, c, d], [a], new Map([[rowKey(d.ref!), { done: true }]])).map((r) => r.cells[0]), ['a', 'd']);
  /* OLDEST HOLD FIRST, or two rows the answer both left out come back swapped. */
  const both = new Map([[rowKey(c.ref!), { done: true }], [rowKey(b.ref!), { done: true }]]);
  assert.deepEqual(keepInPlace([a, b, c], [], both).map((r) => r.cells[0]), ['b', 'c']);
  const loose = { cells: ['no ref'] };
  const after = [a, loose, c];
  assert.deepEqual(keepInPlace([a, b, c], after, new Map([['tasks#99', { done: true }]])), after);
  assert.deepEqual(keepInPlace([a, b, c], after, new Map()), after);
});

test('A WRITE THAT LANDS SAYS THE VERSION IT MADE, which is the version Put back is sent at', async () => {
  const { io } = host(() => json(200, { ok: true, value: { id: 'e_1', seq: 4, version: 9 } }));
  assert.deepEqual(await updateRow(BASE, { register: 'tasks', seq: 4, version: 8 }, { state: 'done' }, 'x', io), { from: 'written', version: 9 });
  const silent = host(() => json(200, { ok: true, value: {} }));
  assert.deepEqual(await updateRow(BASE, { register: 'tasks', seq: 4, version: 8 }, { state: 'done' }, 'x', silent.io), { from: 'written' });
});

/**
 * THE SCREEN HALF, swept from the source because it is a component. A live tick or move that lands is held in place and
 * answered by a receipt carrying its way back; before the repair `writeRow` pushed a toast only on a refusal and nothing
 * in the page's writes (`PageView.svelte` then, `page-writes.ts` since the reader was split) named `keepInPlace`.
 */
test('ON A LIVE PAGE THE ROWS GO THROUGH keepInPlace AND A LANDED WRITE PUSHES A RECEIPT WITH AN UNDO', () => {
  const view = readFileSync(fileURLToPath(new URL('../page/page-writes.ts', import.meta.url)), 'utf8');
  assert.match(view, /\.keepInPlace\(/);
  assert.match(view, /toasts\.push\(hold\.said\(m\.words, patch\), \{ intent: 'good', undo:/);
});

/* ── Done as the person's own look ─────────────────────────────────────────
   A page an add-on added a block to: the record stores two blocks and draws three, so the whole-body write refuses it
   by its count. Kept as a look by key, the page body is never sent. */

const GARDEN = {
  page: 'garden',
  title: 'Garden',
  blocks: [
    { kind: 'table', span: 12, source: 'register.beds' },
    { kind: 'list', span: 6, source: 'register.seeds' },
  ],
};

/* As drawn: the add-on's block (`frost`) third, moved to the top and made a third wide. */
const LAID = [
  { key: 'frost', kind: 'stat', span: 4, drawn: true },
  { key: 'beds', kind: 'table', span: 12, drawn: true },
  { key: 'seeds', kind: 'list', span: 6, drawn: true },
];

function gardenHost(look: () => Response): { io: ClientFetch; sets: { body: Record<string, unknown> }[]; reads: string[] } {
  const sets: { body: Record<string, unknown> }[] = [];
  const reads: string[] = [];
  const io: ClientFetch = async (input, init) => {
    const url = String(input);
    if (url.includes('/api/page')) {
      reads.push(url);
      return json(200, { ok: true, value: { ...GARDEN, blocks: GARDEN.blocks.map((b) => ({ ...b, rows: [], drawn: true })) } });
    }
    const sent = init?.body ? (JSON.parse(String(init.body)) as { body: Record<string, unknown> }) : { body: {} };
    sets.push(sent);
    return 'look' in sent.body ? look() : json(200, { ok: true, value: [{ id: 'page.garden', version: 3 }] });
  };
  return { io, sets, reads };
}

test("A PAGE HOLDING AN ADD-ON'S BLOCK IS ARRANGED AS THE PERSON'S LOOK: one look written, and no page body", async () => {
  const { io, sets, reads } = gardenHost(() => json(200, { ok: true, value: [{ id: 'look.garden', version: 1 }] }));
  const out = await saveLayout(BASE, 'garden', null, LAID, { drawn: 3, placed: [{ i: 2, span: 4 }, { i: 0, span: 12 }, { i: 1, span: 6 }] }, io);
  assert.deepEqual(out, { from: 'written', undo: { retire: 'garden' } });
  assert.equal(sets.length, 1);
  assert.equal(reads.length, 0, 'the stored page was read for a count the look does not need');
  const body = sets[0]!.body;
  assert.equal(Object.keys(body)[0], 'look');
  assert.equal(body.look, 'garden');
  assert.equal(body.by, 'owner');
  assert.deepEqual(body.order, ['frost', 'beds', 'seeds']);
  assert.deepEqual(body.span, { frost: 4, beds: 12, seeds: 6 });
  assert.equal('blocks' in body, false);
});

test('A RECORD OLDER THAN A LOOK’S WIDTHS IS WRITTEN THE OLD WAY, once, and says what that says', async () => {
  const older = () =>
    json(422, { ok: false, refusal: { code: 'DECLARATION_INVALID', fix: 'look.garden: span: is not a key a look has.', at: 'span' } });
  const { io, sets } = gardenHost(older);
  const out = await saveLayout(BASE, 'garden', null, LAID.slice(1).reverse(), { drawn: 2, placed: [{ i: 1, span: 6 }, { i: 0, span: 12 }] }, io);
  assert.equal(out.from, 'written');
  assert.ok(out.from === 'written' && 'before' in out, 'the fall back answers what the whole-body write answers');
  const bodies = sets.filter((s) => 'page' in s.body);
  assert.equal(bodies.length, 1);
  assert.deepEqual((bodies[0]!.body.blocks as { kind: string }[]).map((b) => b.kind), ['list', 'table']);

  /* With the add-on's block on it, the old way refuses as it always did, and nothing new is said. */
  const drawn = gardenHost(older);
  assert.deepEqual(await saveLayout(BASE, 'garden', null, LAID, { drawn: 3, placed: [{ i: 2, span: 4 }, { i: 0, span: 12 }, { i: 1, span: 6 }] }, drawn.io), {
    from: 'refused',
    fix: copy.arrangeMoved,
  });

  /* Any other refusal of the look is the record's own sentence, and nothing else is written. */
  const other = gardenHost(() => json(403, { ok: false, refusal: { code: 'FORBIDDEN', fix: 'Only an owner sets a look.' } }));
  assert.deepEqual(await saveLayout(BASE, 'garden', null, LAID, { drawn: 3, placed: [] }, other.io), { from: 'refused', fix: 'Only an owner sets a look.' });
  assert.equal(other.sets.length, 1);
});

test('a drawn block added while arranging is declared with its code and the height it starts at', () => {
  const block = declaredBlock({ kind: 'drawn', heading: 'Strip', source: 'register.bills', columns: [{ field: 'what', width: '1fr' }], code: '<p>x</p>', height: 320 });
  assert.deepEqual(block, { kind: 'drawn', heading: 'Strip', source: 'register.bills', columns: [{ field: 'what' }], code: '<p>x</p>', height: 320 });
});

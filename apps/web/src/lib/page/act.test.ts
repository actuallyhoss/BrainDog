/**
 * A declared action pressed through the page's one `act` (PGS-A12 jobs 7 and 8): held with its Undo, asked first where
 * it names a loss, refused in the record's own words with nothing left changed, and said and not run where this host
 * cannot carry it out.
 *
 * THE WRITES RUN FOR REAL over a `fetch` this file answers, as `page-writes.test.ts` does, and the sheet is a stub that
 * says yes or no, so what is checked is what the record is sent and what the page says.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Row } from 'braindog-render';

import type { LiveBlock } from '../record/page-live.ts';
import type { SheetAsk } from './act-sheet.ts';
import { heldNone, pageWrites, type Held } from './page-writes.ts';

const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const ORDERS = {
  id: 'orders',
  title: 'what',
  state: 'state',
  done: ['shipped'],
  fields: [
    { id: 'what', type: 'text' },
    { id: 'state', type: 'enum', values: ['new', 'packed', 'shipped'], default: 'new' },
  ],
};

const settle = async () => {
  for (let i = 0; i < 8; i++) await new Promise<void>((r) => setImmediate(r));
};

let bases = 0;

/**
 * A page with one checklist over `orders`, its writes, a sheet that answers `yes`, and a `fetch` that answers every write
 * with `reply` (the row written back by default) and keeps what each was sent.
 */
function page(reply?: (path: string, body: Record<string, unknown>) => Response) {
  const base = `https://act-${++bases}.test`;
  const rows: Row[] = [
    { cells: ['Blue jug'], done: false, ref: { register: 'orders', seq: 1, version: 3 } },
    { cells: ['Ash bowl'], done: false, ref: { register: 'orders', seq: 2, version: 1 } },
  ];
  const block = {
    kind: 'todo',
    register: 'orders',
    raw: 'rows',
    rows,
    columns: [],
    entries: [
      { seq: 1, version: 3, fields: { what: 'Blue jug', state: 'new' }, created: '', by: '' },
      { seq: 2, version: 1, fields: { what: 'Ash bowl', state: 'packed' }, created: '', by: '' },
    ],
  } as unknown as LiveBlock & { rows: Row[] };
  let held: Held = heldNone();
  const toasts: { text: string; intent?: string | undefined; undo?: (() => void) | undefined }[] = [];
  const sent: { path: string; body: Record<string, unknown> }[] = [];
  const asked: SheetAsk[] = [];
  const sheet = { yes: true };
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(url)).pathname;
    if (path === '/api/schema' || !init?.body) return json(200, { ok: true, value: ORDERS });
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    sent.push({ path, body });
    if (reply) return reply(path, body);
    const seq = typeof body.seq === 'number' ? body.seq : 9;
    return json(200, { ok: true, value: { seq, version: 4, fields: body.patch ?? body.fields ?? {}, created: '', by: '' } });
  }) as typeof fetch;
  const writes = pageWrites({
    slug: () => 'shop',
    now: () => Date.parse('2026-10-14T09:00:00Z'),
    blocks: () => [block],
    base: () => base,
    reread: async () => {},
    toasts: { push: (text, opts = {}) => (toasts.push({ text, ...opts }), toasts.length) },
    state: { get: () => held, set: (next) => (held = next) },
    sheet: async (ask) => (asked.push(ask), sheet.yes),
  });
  writes.forPage('shop');
  const on = { block, at: 0, before: rows };
  return { block, rows, writes, toasts, sent, asked, sheet, on, writesTo: (p: string) => sent.filter((s) => s.path === p) };
}

test('a held verb runs at once, offers its Undo, and the Undo writes back what the row held', async () => {
  const p = page();
  await p.writes.act({ verb: 'row.move', label: 'Pack it', args: { field: 'state' } }, p.rows[0], 'packed', p.on);
  await settle();
  assert.equal(p.asked.length, 0, 'a plain press asked first');
  assert.deepEqual(p.writesTo('/api/update').map((s) => s.body.patch), [{ state: 'packed' }]);
  const receipt = p.toasts.at(-1)!;
  assert.equal(receipt.text, 'Pack it: “Blue jug”.');
  assert.ok(receipt.undo, 'the receipt offered no Undo');
  receipt.undo!();
  await settle();
  assert.deepEqual(p.writesTo('/api/update').map((s) => s.body.patch), [{ state: 'packed' }, { state: 'new' }]);
});

test('a tick pressed as a declared verb is the tick write, and its Undo puts back the state the row held', async () => {
  const p = page();
  await p.writes.act({ verb: 'row.tick', label: 'Shipped', as: 'switch' }, p.rows[1], 'on', p.on);
  await settle();
  assert.deepEqual(p.writesTo('/api/update').map((s) => s.body.patch), [{ state: 'shipped' }]);
  /* THE TICK WRITE'S OWN RECEIPT AND UNDO: `packed`, which the row held, and not the list's first open state. */
  const receipt = p.toasts.at(-1)!;
  assert.ok(receipt.undo);
  receipt.undo!();
  await settle();
  assert.deepEqual(p.writesTo('/api/update').map((s) => s.body.patch), [{ state: 'shipped' }, { state: 'packed' }]);
});

test('a confirm verb runs only after the sheet says yes, and the sheet names the loss in its own sentence', async () => {
  const p = page();
  const archive = { verb: 'row.delete', label: 'Cancel order', hard: true, confirm: 'Cancel the Blue jug order for good?' };
  p.sheet.yes = false;
  await p.writes.act(archive, p.rows[0], undefined, p.on);
  await settle();
  assert.deepEqual(p.asked, [{ kind: 'confirm', label: 'Cancel order', said: 'Cancel the Blue jug order for good?' }]);
  assert.equal(p.sent.length, 0, 'a press said no to was sent');
  p.sheet.yes = true;
  await p.writes.act(archive, p.rows[0], undefined, p.on);
  await settle();
  const patch = p.writesTo('/api/update')[0]?.body.patch as Record<string, unknown> | undefined;
  assert.equal(typeof patch?.deleted_at, 'string', 'the yes did not delete');
});

test('a refused press says the record’s fix, offers no Undo, and leaves the row as it was', async () => {
  const p = page(() => json(200, { ok: false, refusal: { code: 'FORBIDDEN', fix: 'You can read orders but not change them.' } }));
  await p.writes.act({ verb: 'row.tick', label: 'Shipped' }, p.rows[0], true, p.on);
  await settle();
  assert.deepEqual(p.toasts.map((t) => [t.text, t.intent, Boolean(t.undo)]), [['You can read orders but not change them.', 'warn', false]]);
  assert.equal(p.writes.keptSegment(0, p.block, p.block).rows[0]!.done, false, 'a refused tick stayed ticked');
});

test('a question answered from a page is the option write, with its Undo', async () => {
  const p = page((path) => (path === '/api/decide' ? json(200, { ok: true, value: { decision: 'D4' } }) : json(200, { ok: true, value: {} })));
  await p.writes.act({ verb: 'suggestion.answer', label: 'Glaze it' }, { id: 'Q7', question: 'Which glaze first?' }, 'Celadon');
  await settle();
  assert.deepEqual(p.writesTo('/api/decide').map((s) => s.body), [{ id: 'Q7', decide: { option: 'Celadon' } }]);
  assert.equal(p.toasts.at(-1)?.text, 'Glaze it: “Which glaze first?”.');
  assert.ok(p.toasts.at(-1)?.undo);
});

test('a verb this host cannot carry out says what it would do and sends nothing, asking no sheet', async () => {
  const p = page();
  await p.writes.act({ verb: 'rule.from_arrivals', label: 'File them', hard: true }, undefined, undefined, p.on);
  await settle();
  assert.equal(p.sent.length, 0);
  assert.equal(p.asked.length, 0);
  assert.equal(p.toasts.length, 1);
  assert.match(p.toasts[0]!.text, /^Nothing was changed: File them cannot run on this page yet\. .*These are filed\./u);
});

test('a value shown once opens after the press lands, and a sign-in said no to runs nothing', async () => {
  const p = page();
  p.sheet.yes = false;
  await p.writes.act({ verb: 'row.update', label: 'Rename', args: { field: 'what' }, again: true }, p.rows[0], 'Tall jug', p.on);
  assert.deepEqual(p.asked.map((a) => a.kind), ['again']);
  assert.equal(p.sent.length, 0);
  p.sheet.yes = true;
  await p.writes.act({ verb: 'row.update', label: 'Rename', args: { field: 'what' }, again: true, once: true }, p.rows[0], 'Tall jug', p.on);
  await settle();
  /* SIGNED IN, THE SAME PRESS RUNS, and only then is the shown-once sheet opened. */
  assert.deepEqual(p.asked.map((a) => a.kind), ['again', 'again', 'once']);
  assert.deepEqual(p.writesTo('/api/update').map((s) => s.body.patch), [{ what: 'Tall jug' }]);
});

test('a value shown once is not opened over a refused write', async () => {
  const p = page(() => json(200, { ok: false, refusal: { code: 'FORBIDDEN', fix: 'You can read orders but not change them.' } }));
  await p.writes.act({ verb: 'row.update', label: 'Rename', args: { field: 'what' }, once: true }, p.rows[0], 'Tall jug', p.on);
  await settle();
  assert.deepEqual(p.asked, [], 'the shown-once sheet opened over a refusal');
  assert.equal(p.toasts.at(-1)?.text, 'You can read orders but not change them.');
});

test('an add that sends nothing to add writes no blank one', async () => {
  const p = page();
  await p.writes.act({ verb: 'row.create', label: 'Add an order' }, undefined, undefined, p.on);
  await settle();
  assert.equal(p.sent.length, 0);
  assert.equal(p.toasts.at(-1)?.text, 'This does not say what to add, so nothing was added.');
});

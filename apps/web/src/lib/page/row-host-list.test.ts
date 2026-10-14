/**
 * The row panel's host, made by a list screen (`listHost` in `row-host.svelte.ts`): which row is open is the address's
 * `?row=`, the open row walks the list in the order it is drawn, and nothing typed is thrown away by a walk.
 *
 * THE HOST AS A CLASS, WITH STAND-INS FOR WHAT A SCREEN HANDS IT: the list's rows, an address kept in a variable, and
 * toasts that are counted. No component is mounted and no record is written to.
 *
 * WHY THIS FILE COMPILES THE MODULE IT TESTS. The host's fields are runes, and a rune is a compiler macro with no
 * runtime binding, so a plain `node --test` import of a class that is then made fails with `$state is not defined`.
 * Same hook, same reason, as `lib/ui/toast.svelte.test.ts`. Compiled for the server a rune is a plain field: every
 * value below is right and none of it is reactive, which is the browser walk's to prove (`row-drawer.walk.mjs`).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import { compileModule } from 'svelte/compiler';

import '../record/fixtures/fill.ts';
import { ROWS } from '../record/fixtures/sample.ts';
import type { Entry } from '../record/schema.ts';

registerHooks({
  load(url, context, next) {
    if (url.endsWith('.svelte.ts')) {
      const filename = fileURLToPath(url);
      const { js } = compileModule(stripTypeScriptTypes(readFileSync(filename, 'utf8')), { generate: 'server', filename });
      return { format: 'module', source: js.code, shortCircuit: true };
    }
    return next(url, context);
  },
});

/* AFTER THE HOOK, AND THAT IS WHY IT IS DYNAMIC: a static import would load before the hook was registered. */
const { listHost, RowHost } = await import('./row-host.svelte.ts');

/** A list of the sample's with a few rows, and another beside it for the page-made host. */
const [LIST, OTHER] = Object.keys(ROWS).filter((k) => ROWS[k]!.length >= 4 && ROWS[k]!.length <= 6) as [string, string];

/** Five rows drawn out of number order, as a sorted list draws them. */
const DRAWN = [4, 2, 3, 1, 9];
const rowsOf = (seqs: readonly number[]): Entry[] => seqs.map((seq) => ({ ...ROWS[LIST]![0]!, seq, version: 1 }));

/** What a list screen hands the host, with the address in a variable and the rows replaceable. */
function screen(href: string, seqs: readonly number[] = DRAWN) {
  const s = {
    href,
    rows: rowsOf(seqs),
    writes: 0,
    said: [] as string[],
    get row() {
      return new URL(s.href).searchParams.get('row');
    },
  };
  const list = listHost({
    register: () => LIST,
    rows: () => s.rows,
    address: {
      read: () => new URL(s.href),
      write: (to: URL) => {
        s.writes += 1;
        s.href = to.href;
      },
    },
    base: () => 'https://record.example',
    now: () => Date.UTC(2026, 9, 14),
    reread: async () => {},
    toasts: { push: (m: string) => (s.said.push(m), 0) } as never,
    may: () => true,
    store: null,
  });
  return { s, list };
}

const AT = 'https://app.example/r/list?view=board&q=kiln#top';

test('open(seq) sets ?row= and close() clears it, every other part of the address kept', () => {
  const { s, list } = screen(AT);
  assert.equal(list.opened, null);
  assert.equal(list.open(3), true);
  assert.equal(s.href, 'https://app.example/r/list?view=board&q=kiln&row=3#top');
  assert.equal(list.opened, 3);
  assert.equal(list.host.panelOpen, true);
  assert.deepEqual(list.host.opened, { register: LIST, seq: 3 });
  list.close();
  assert.equal(s.href, AT);
  assert.equal(list.opened, null);
  assert.equal(list.host.panelOpen, false);
});

test('a row the list does not draw does not open, and the address is left as it was', () => {
  const { s, list } = screen(AT);
  assert.equal(list.open(77), false);
  assert.equal(s.href, AT);
  assert.equal(s.writes, 0);
});

test('a host made at an address that already holds ?row=3 is open on row 3', () => {
  const { s, list } = screen('https://app.example/r/list?row=3&view=board');
  assert.equal(list.opened, 3);
  assert.equal(list.host.panelOpen, true);
  assert.equal(s.writes, 0, 'the address already said so');
});

test('next() and previous() walk the drawn order and the open row follows, stopping at each end', () => {
  const { s, list } = screen(AT);
  assert.equal(list.next(), 'closed', 'nothing is open to walk from');
  list.open(4);
  assert.equal(list.previous(), 'end');
  assert.equal(list.opened, 4);
  const walked: (number | null)[] = [];
  for (let i = 0; i < 4; i += 1) {
    assert.equal(list.next(), 'moved');
    walked.push(list.opened);
    assert.equal(s.row, String(list.opened));
  }
  assert.deepEqual(walked, [2, 3, 1, 9]);
  assert.equal(list.next(), 'end');
  assert.equal(list.opened, 9);
  assert.equal(list.previous(), 'moved');
  assert.equal(list.opened, 1);
  assert.equal(s.row, '1');
});

test("while the panel holds something typed and not saved, next() does not move and answers 'unsaved'", () => {
  const { s, list } = screen(AT);
  list.open(2);
  list.host.dirty = true;
  assert.equal(list.next(), 'unsaved');
  assert.equal(list.previous(), 'unsaved');
  assert.equal(list.follow(1), 'unsaved');
  assert.equal(list.opened, 2);
  assert.equal(s.row, '2');
  assert.equal(list.host.dirty, true, 'what was typed is still there');
  list.host.dirty = false;
  assert.equal(list.next(), 'moved');
  assert.equal(list.opened, 3);
});

test('the list’s own cursor moving takes the open panel with it, and opens nothing where none is open', () => {
  const { s, list } = screen(AT);
  assert.equal(list.follow(3), 'closed');
  assert.equal(s.href, AT);
  list.open(4);
  assert.equal(list.follow(1), 'moved');
  assert.equal(s.row, '1');
});

test('a row that leaves the list (deleted, filtered out) closes the panel', () => {
  const { s, list } = screen(AT);
  list.open(3);
  s.rows = rowsOf([4, 2, 1, 9]);
  list.sync();
  assert.equal(list.host.panelOpen, false);
  assert.equal(list.opened, null);
  assert.equal(s.href, AT);
  /* AND A ROW STILL DRAWN STAYS OPEN when the list is read again around it. */
  list.open(2);
  s.rows = rowsOf([9, 2]);
  list.sync();
  assert.equal(list.opened, 2);
});

test('the panel closing by itself (its Save, its close) clears ?row= too', () => {
  const { s, list } = screen(AT);
  list.open(3);
  list.host.close();
  assert.equal(s.href, AT);
  list.open(2);
  list.host.save({ register: LIST, seq: 2 }, {}, 'Kiln');
  assert.equal(s.href, AT);
});

test('the address moved from outside (Back, a link) moves the panel, and never throws away what is typed', () => {
  const { s, list } = screen(AT);
  list.open(3);
  s.href = 'https://app.example/r/list?view=board&q=kiln&row=9#top';
  list.sync();
  assert.equal(list.opened, 9);
  s.href = AT;
  list.sync();
  assert.equal(list.host.panelOpen, false);
  /* A ROW NOT READ YET IS WAITED FOR: the address keeps it and the next read of the list opens it. */
  s.rows = [];
  s.href = 'https://app.example/r/list?row=2';
  list.sync();
  assert.equal(list.opened, null);
  assert.equal(s.row, '2');
  s.rows = rowsOf(DRAWN);
  list.sync();
  assert.equal(list.opened, 2);
  /* TYPED AND NOT SAVED: the panel stays and the address is put back on its row. */
  list.host.dirty = true;
  s.href = 'https://app.example/r/list?row=4';
  list.sync();
  assert.equal(list.opened, 2);
  assert.equal(s.row, '2');
});

test('an address written late is not read as the reader going back', () => {
  /* `goto` lands after the press: until it does the address still says the row before. */
  let href = 'https://app.example/r/list';
  const late: URL[] = [];
  const list = listHost({
    register: () => LIST,
    rows: () => rowsOf(DRAWN),
    address: { read: () => new URL(href), write: (to: URL) => void late.push(to) },
    base: () => 'https://record.example',
    now: () => 0,
    reread: async () => {},
    toasts: { push: () => 0 } as never,
    may: () => true,
    store: null,
  });
  list.open(3);
  list.sync();
  assert.equal(list.opened, 3, 'the panel closed on an address that had not caught up');
  href = late.at(-1)!.href;
  list.sync();
  assert.equal(list.opened, 3);
  list.close();
  list.sync();
  assert.equal(list.host.panelOpen, false, 'the panel opened again on the address it had just left');
});

test('a page-made host behaves exactly as before: it opens, follows and closes, and writes no address', () => {
  const blocks = [
    { register: LIST, entries: rowsOf([1, 2]) },
    { register: OTHER, entries: ROWS[OTHER]!.slice(0, 2) },
  ];
  const host = new RowHost({
    slug: () => 'a-page',
    base: () => 'https://record.example',
    blocks: () => blocks,
    now: () => 0,
    reread: async () => {},
    toasts: { push: () => 0 } as never,
    may: () => true,
    store: null,
  });
  host.forPage('a-page');
  assert.equal(host.open({ register: LIST, seq: 7 }), false, 'a row no block holds does not open');
  assert.equal(host.open({ register: LIST, seq: 1 }), true);
  host.follow({ register: OTHER, seq: ROWS[OTHER]![1]!.seq });
  assert.deepEqual(host.opened, { register: OTHER, seq: ROWS[OTHER]![1]!.seq }, 'the panel follows across the page’s lists');
  host.dirty = true;
  host.follow({ register: LIST, seq: 2 });
  assert.equal(host.opened?.register, OTHER, 'something typed holds the panel where it is');
  host.close();
  assert.equal(host.panelOpen, false);
  host.openChanges();
  assert.equal(host.changesOpen, true);
});

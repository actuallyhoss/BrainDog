/**
 * An `inputs` block's writes: after a pause, once, at the row's version, a refusal said beside its field, and the page
 * read again so the figures over the row answer what was typed.
 *
 * THE RED WAS THAT NONE OF IT EXISTED. The kernel answered an `inputs` block's row and types and the renderer drew the
 * boxes and handed every keystroke to `oninput`, and no host passed one: the page drew a spec of values nobody could
 * change. The first run of this file failed at its import, `inputs-write.ts` not found.
 *
 * THE LAST TEST GOES THROUGH THE RECORD, because a writer that passes against a stub proves only that it called the
 * stub: the patch is sent to the kernel's own `update`, and the page is read back through `blockOf` and `draw`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { openRecord, type Declaration } from '@braindog/kernel';
import type { Block, Row } from 'braindog-render';

import { copy } from '../copy.ts';
import { draw } from './blocks.ts';
import { REGISTERS } from './held.ts';
import { inputPatch, inputsWriter, keyOf, QUIET, type Clock } from './inputs-write.ts';
import { blockOf, resolverOf, type LiveBlock } from './page-live.ts';
import type { Wrote } from './rows-write.ts';
import type { Entry, FieldDecl, Fields } from './schema.ts';

/** A clock that only moves when the test says so. */
function fakeClock(): Clock & { advance: (ms: number) => void } {
  let now = 0;
  const due = new Map<number, { at: number; run: () => void }>();
  let next = 1;
  return {
    set: (run, ms) => {
      due.set(next, { at: now + ms, run });
      return next++;
    },
    clear: (handle) => void due.delete(handle as number),
    advance(ms) {
      now += ms;
      for (const [h, t] of [...due]) if (t.at <= now) (due.delete(h), t.run());
    },
  };
}

const settle = () => new Promise((r) => setImmediate(r));

const PRICE: FieldDecl = { id: 'price', type: 'money' };
const row = (field: string, type: string, value: string, version = 1): Row => ({ cells: [field, field, type, value], ref: { register: 'checks', seq: 1, version } });
const wrote = (version: number): Wrote => ({ ok: true, entry: { seq: 1, version, fields: {} } as unknown as Entry });

/** A writer over a stub, with every write it sent and every re-read it asked for. */
function harness(answer: (n: number) => Wrote = (n) => wrote(n + 2)) {
  const clock = fakeClock();
  const sent: { patch: Fields; version: number | undefined }[] = [];
  const said: ReadonlyMap<string, string>[] = [];
  let reads = 0;
  const w = inputsWriter({
    write: async (_register, _seq, patch, version) => (sent.push({ patch, version }), answer(sent.length - 1)),
    held: (_ref, field) => (field === 'price' ? { amount: 120000, currency: 'GBP' } : field === 'launched' ? false : 'sample'),
    reread: async () => void reads++,
    said: (s) => void said.push(s),
    clock,
  });
  return { w, clock, sent, said, reads: () => reads };
}

test('A FIELD IS WRITTEN ONCE, AFTER THE PAUSE, with what it says then: not a line in the history per keystroke', async () => {
  const h = harness();
  for (const typed of ['GBP 1,20', 'GBP 1,250', 'GBP 1,250.00']) {
    h.w.input(row('price', 'money', 'GBP 1,200.00'), typed);
    h.clock.advance(QUIET - 1);
  }
  await settle();
  assert.equal(h.sent.length, 0, 'nothing is sent while the field is still being typed into');
  h.clock.advance(1);
  await settle();
  assert.deepEqual(h.sent, [{ patch: { price: { amount: 125000, currency: 'GBP' } }, version: 1 }]);
  assert.equal(h.reads(), 1, 'the page is read again, so every figure over the row answers the new price');
});

test('THE FIGURE WRITTEN IS THE ONE TYPED, in the currency it is in, and the one the page opened on is no change', () => {
  /* THE BOX OPENS ON THE RECORD'S READING, and leaving it as it opened must send nothing: 120000 pence, GBP. */
  assert.deepEqual(inputPatch(PRICE, 'GBP 1,200.00', { amount: 120000, currency: 'GBP' }), { ok: true, patch: { price: { amount: 120000, currency: 'GBP' } } });
  assert.deepEqual(inputPatch(PRICE, '1250.5', { amount: 120000, currency: 'GBP' }), { ok: true, patch: { price: { amount: 125050, currency: 'GBP' } } });
  /* THE MINUS SIGN THE PAGE WRITES, and a code after the figure, are the same figure. */
  assert.deepEqual(inputPatch(PRICE, `GBP ${String.fromCharCode(0x2212)}50.00`, null), { ok: true, patch: { price: { amount: -5000, currency: 'GBP' } } });
  assert.deepEqual(inputPatch(PRICE, '1,000 JPY', { amount: 5, currency: 'GBP' }), { ok: true, patch: { price: { amount: 1000, currency: 'JPY' } } }, 'a code typed is the currency the figure is in');
  assert.deepEqual(inputPatch(PRICE, '', { amount: 5, currency: 'GBP' }), { ok: true, patch: { price: null } });
  /* WHAT THE RECORD WOULD REFUSE IS SAID IN THE ROW PAGE'S OWN WORDS, before anything is sent. */
  assert.deepEqual(inputPatch(PRICE, 'twelve', null), { ok: false, fix: copy.moneyShape });
  assert.deepEqual(inputPatch(PRICE, 'GBP 1.005', null), { ok: false, fix: copy.moneyPlaces(2) });
  assert.deepEqual(inputPatch({ id: 'launched', type: 'bool' }, 'true', false), { ok: true, patch: { launched: true } });
});

test('A REFUSAL IS SAID BESIDE ITS FIELD, and goes when that field is written', async () => {
  let refuse = true;
  const h = harness((n) => (refuse ? { ok: false, why: 'refused', fix: 'Stage is one of idea, sample or made.' } : wrote(n + 2)));
  const key = keyOf({ register: 'checks', seq: 1 }, 'price');

  h.w.input(row('price', 'money', 'GBP 1,200.00'), 'twelve');
  h.clock.advance(QUIET);
  await settle();
  assert.equal(h.sent.length, 0, 'a money the record would refuse is not sent');
  assert.equal(h.said.at(-1)?.get(key), copy.moneyShape);

  h.w.input(row('stage', 'enum:idea,sample,made', 'sample'), 'retired');
  h.clock.advance(QUIET);
  await settle();
  assert.equal(h.said.at(-1)?.get(keyOf({ register: 'checks', seq: 1 }, 'stage')), 'Stage is one of idea, sample or made.', "the record's own sentence");
  assert.equal(h.reads(), 0, 'a refused write reads nothing again, so the box keeps what was typed beside what is wrong with it');

  refuse = false;
  h.w.input(row('price', 'money', 'GBP 1,200.00'), 'GBP 1,300.00');
  h.clock.advance(QUIET);
  await settle();
  assert.equal(h.said.at(-1)?.has(key), false, 'the price is written, so nothing is said beside it');
});

test('TWO FIELDS OF ONE ROW ARE WRITTEN ONE AFTER THE OTHER, the second at the version the first made', async () => {
  const h = harness((n) => wrote(n + 2));
  h.w.input(row('price', 'money', 'GBP 1,200.00'), 'GBP 1,300.00');
  h.w.input(row('launched', 'bool', 'false'), 'true');
  await h.w.flush();
  assert.deepEqual(
    h.sent.map((s) => s.version),
    [1, 2],
    'the second write carries the version the first one made, not the stale one the page drew',
  );
});

test('A NUMBER TYPED BACK TO WHAT THE ROW HOLDS SENDS NOTHING, though the box hands it on as text', async () => {
  /* THE RED: `patchOf` gives an `int` or a `decimal` the text in the box, `"12"`, and the row holds the number 12, so
     `same` compared `"12"` with `12`, said they differed, and wrote the row's own value back: a line in its history
     saying the count went from 12 to 12, the thing the pause exists to prevent. */
  const clock = fakeClock();
  const sent: Fields[] = [];
  const w = inputsWriter({
    write: async (_register, _seq, patch) => (sent.push(patch), wrote(2)),
    held: (_ref, field) => (field === 'count' ? 12 : 1.5),
    reread: async () => undefined,
    said: () => undefined,
    clock,
  });
  w.input(row('count', 'int', '12'), '13');
  w.input(row('count', 'int', '12'), '12');
  w.input(row('rate', 'decimal', '1.5'), '1.50');
  clock.advance(QUIET);
  await settle();
  assert.deepEqual(sent, [], 'both fields say what their row already holds');
  w.input(row('count', 'int', '12'), '14');
  clock.advance(QUIET);
  await settle();
  assert.deepEqual(sent, [{ count: '14' }], 'and a real change is still written');
});

/* ── through the record ───────────────────────────────────────────────── */

type Sql = Parameters<typeof openRecord>[0];

function openSqlite(): Sql {
  const db = new DatabaseSync(':memory:');
  let depth = 0;
  return {
    exec: (text: string, ...params: unknown[]) => (params.length === 0 ? db.exec(text) : void db.prepare(text).run(...(params as never[]))),
    all: (text: string, ...params: unknown[]) => db.prepare(text).all(...(params as never[])),
    one: (text: string, ...params: unknown[]) => db.prepare(text).get(...(params as never[])),
    transactionSync<T>(fn: () => T): T {
      if (depth > 0) return fn();
      db.exec('BEGIN');
      depth++;
      try {
        const value = fn();
        db.exec('COMMIT');
        return value;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      } finally {
        depth--;
      }
    },
  } as unknown as Sql;
}

const CHECKS = {
  id: 'checks',
  name: 'Checks',
  one: 'check',
  title: 'name',
  fields: [
    { id: 'name', type: 'text', required: true },
    { id: 'price', type: 'money' },
  ],
};

test('THROUGH THE RECORD: the typed price is the row\'s, and the sentence over it says the new figure', async () => {
  const NOW = Date.UTC(2026, 8, 25, 12);
  const k = await openRecord(openSqlite(), { now: () => NOW });
  const decls: Declaration[] = [
    { id: 'register.checks', kind: 'register', body: CHECKS as never },
    { id: 'metric.price-now', kind: 'metric', body: { metric: 'price-now', name: 'Price', source: 'register.checks', value: { sum: 'price' }, format: 'money.GBP', target: { gte: 100000 }, window: '30d' } as never },
    {
      id: 'page.check',
      kind: 'page',
      body: {
        page: 'check',
        title: 'Check',
        requires: ['register.checks'],
        blocks: [
          { kind: 'inputs', heading: 'Check', register: 'checks', columns: [{ field: 'price' }] },
          { kind: 'note', heading: 'Verdict', body: 'Selling at {{price-now}}.' },
        ],
      } as never,
    },
  ];
  const installed = await k.install(decls);
  assert.ok(installed.ok, JSON.stringify(installed));
  assert.ok(k.create('checks', { name: 'Price check', price: { amount: 120000, currency: 'GBP' } }, { actor: 'p_1' }).ok);
  REGISTERS.checks = CHECKS as never;

  const read = (): LiveBlock[] => (k.page('check') as { value: { blocks: Record<string, unknown>[] } }).value.blocks.map((b) => blockOf(b as never, new Map(), NOW));
  let blocks = read();
  const fenced = (b: LiveBlock): Block => draw(b).segments.find((s): s is Block => s.type === 'block')!;

  const w = inputsWriter({
    write: async (register, seq, patch, version) => {
      const out = k.update(register, `${register}#${seq}`, patch as never, { actor: 'p_1', ...(version === undefined ? {} : { version }) }) as { ok: boolean; value?: { version: number }; refusal?: { fix: string } };
      return out.ok ? { ok: true, entry: { seq, version: out.value!.version, fields: {} } as unknown as Entry } : { ok: false, why: 'refused', fix: out.refusal?.fix ?? '' };
    },
    held: (_ref, field) => blocks[0]!.entries[0]?.fields[field],
    reread: async () => void (blocks = read()),
    said: () => undefined,
  });
  const price = fenced(blocks[0]!).rows[0]!;
  assert.deepEqual(price.cells.map((c) => c.trim()), ['price', 'Price', 'money', 'GBP 1,200.00']);

  w.input(price, 'GBP 1,250.00');
  await w.flush();

  /* THE ROW HOLDS WHAT WAS TYPED, IN MINOR UNITS WITH ITS CURRENCY, and the box opens on it at the new version. */
  assert.deepEqual(blocks[0]!.entries[0]?.fields.price, { amount: 125000, currency: 'GBP' });
  const again = fenced(blocks[0]!).rows[0]!;
  assert.equal(again.cells[3]?.trim(), 'GBP 1,250.00');
  assert.equal(again.ref?.version, 2);
  /* AND THE SENTENCE OVER THE SAME LIST READS THE NEW FIGURE, which is the whole of what the inputs are for. */
  /* A sentence says money whole, a table cell to the penny (dd6b3b9bf); the figure is the row's new one either way. */
  assert.equal(resolverOf(blocks[1]!.values)('price-now'), 'GBP 1,250');
});

/* ── money boxes: decimal commas, currencies and conflicts ─────────────────────────────────────────────────── */

const DINARS = {
  id: 'checks',
  name: 'Checks',
  one: 'check',
  title: 'name',
  fields: [
    { id: 'name', type: 'text', required: true },
    { id: 'price', type: 'money' },
    { id: 'cost', type: 'money' },
    { id: 'count', type: 'int' },
  ],
};

/**
 * An Egyptian record with one check on it, priced EGP 1,200.00 with no cost yet, and a writer that goes through the
 * kernel's own `update` and answers a stale write the way `rows-write.ts` `failed` does: a conflict carrying the row as
 * it now stands.
 */
async function egyptian(home: string | null) {
  const NOW = Date.UTC(2026, 8, 25, 12);
  const k = await openRecord(openSqlite(), { now: () => NOW });
  const installed = await k.install([
    { id: 'register.checks', kind: 'register', body: DINARS as never },
    {
      id: 'page.check',
      kind: 'page',
      body: { page: 'check', title: 'Check', requires: ['register.checks'], blocks: [{ kind: 'inputs', heading: 'Check', register: 'checks', columns: [{ field: 'price' }, { field: 'cost' }, { field: 'count' }] }] } as never,
    },
  ]);
  assert.ok(installed.ok, JSON.stringify(installed));
  assert.ok(k.create('checks', { name: 'Kiln', price: { amount: 120000, currency: 'EGP' }, count: 3 }, { actor: 'p_1' }).ok);
  REGISTERS.checks = DINARS as never;
  const read = (): LiveBlock[] => (k.page('check') as { value: { blocks: Record<string, unknown>[] } }).value.blocks.map((b) => blockOf(b as never, new Map(), NOW));
  let blocks = read();
  let said: ReadonlyMap<string, string> = new Map();
  const w = inputsWriter({
    write: async (register, seq, patch, version) => {
      const out = k.update(register, `${register}#${seq}`, patch as never, { actor: 'p_1', ...(version === undefined ? {} : { version }) }) as
        | { ok: true; value: { version: number } }
        | { ok: false; refusal?: { fix: string }; conflict?: { current: { seq: number; version: number; fields: Fields } } };
      if (out.ok) return { ok: true, entry: { seq, version: out.value.version, fields: {} } as unknown as Entry };
      if (out.conflict) return { ok: false, why: 'conflict', fix: `${register}#${seq} was changed somewhere else first.`, entry: out.conflict.current as unknown as Entry };
      return { ok: false, why: 'refused', fix: out.refusal?.fix ?? '' };
    },
    held: (_ref, field) => blocks[0]!.entries[0]?.fields[field],
    reread: async () => void (blocks = read()),
    said: (s) => void (said = s),
    home: () => home,
  });
  const box = (field: string): Row => draw(blocks[0]!).segments.find((s): s is Block => s.type === 'block')!.rows.find((r) => r.cells[0]!.trim() === field)!;
  const stored = () => (k.list({ register: 'checks' }) as { value: { rows: { fields: Fields; version: number }[] } }).value.rows[0]!;
  return { k, w, box, stored, said: () => said };
}

test('AN EMPTY MONEY BOX TAKES THE RECORD\'S HOME CURRENCY, and with none known it refuses rather than writing pounds', async () => {
  /* THE RED: on an EGP record a cost typed `1200` into its empty box was stored as GBP 1,200.00 beside a
     price in EGP. The chain ended `homeCurrency() ?? 'GBP'`, and the web's `homeCurrency()` reads `ROWS`, which nothing
     fills in a shipped build, so every empty money box on every record wrote pounds. */
  const egp = await egyptian('EGP');
  const cost = egp.box('cost');
  assert.equal(cost.cells[3]?.trim(), '', 'the box opens empty, so nothing on screen named a currency');
  egp.w.input(cost, '1200');
  await egp.w.flush();
  assert.deepEqual(egp.stored().fields.cost, { amount: 120000, currency: 'EGP' });

  /* NO CURRENCY KNOWN AT ALL IS A SENTENCE BESIDE THE BOX and nothing written: a guessed currency is a wrong figure. */
  const unknown = await egyptian(null);
  unknown.w.input(unknown.box('cost'), '1200');
  await unknown.w.flush();
  assert.equal(unknown.stored().fields.cost, undefined, 'nothing was written');
  assert.match(unknown.said().get(keyOf({ register: 'checks', seq: 1 }, 'cost')) ?? '', /USD 1200/u, 'the sentence says how to name the currency');

  const COST: FieldDecl = { id: 'cost', type: 'money' };
  /* THE ORDER: a code typed, then the row's own, then the field's declared currency, then the record's home. */
  assert.deepEqual(inputPatch(COST, '12', null, 'EGP'), { ok: true, patch: { cost: { amount: 1200, currency: 'EGP' } } });
  assert.deepEqual(inputPatch(COST, '12', { amount: 5, currency: 'USD' }, 'EGP'), { ok: true, patch: { cost: { amount: 1200, currency: 'USD' } } });
  assert.deepEqual(inputPatch({ ...COST, default: { amount: 0, currency: 'KWD' } }, '1.25', null, 'EGP'), { ok: true, patch: { cost: { amount: 1250, currency: 'KWD' } } });
  assert.deepEqual(inputPatch(COST, 'JPY 12', null, null), { ok: true, patch: { cost: { amount: 12, currency: 'JPY' } } });
  assert.equal(inputPatch(COST, '12', null, null).ok, false);
});

test('A COMMA ONLY GROUPS THOUSANDS, and any other comma is refused beside the box rather than read as a hundredfold figure', () => {
  /* THE RED: the money pattern took `[\d,]*` and then dropped every comma, so a decimal comma was read as a
     thousands separator: `1,20` was 120.00 where the person meant 1.20, and `,5` was 5.00. The rule now is the one the
     add-on settings' money box already keeps (`packs.ts` `valueOf`): commas in groups of three are the grouping the box
     opens on, `EGP 1,200.00`, and every other comma is a figure this cannot read without guessing. */
  const EGP = { amount: 100, currency: 'EGP' };
  for (const typed of ['1,20', '12,5', ',5', '1,2,3,4', '1.200,50', '1,2345', '12,34.5', '1,']) {
    const out = inputPatch(PRICE, typed, EGP);
    assert.equal(out.ok, false, `${typed} is refused`);
  }
  assert.deepEqual(inputPatch(PRICE, '1,250', EGP), { ok: true, patch: { price: { amount: 125000, currency: 'EGP' } } });
  assert.deepEqual(inputPatch(PRICE, 'EGP 1,234,567.50', EGP), { ok: true, patch: { price: { amount: 123456750, currency: 'EGP' } } });
  assert.deepEqual(inputPatch(PRICE, '12.5', EGP), { ok: true, patch: { price: { amount: 1250, currency: 'EGP' } } });
  assert.deepEqual(inputPatch(PRICE, '-1,000', EGP), { ok: true, patch: { price: { amount: -100000, currency: 'EGP' } } });
});

test('A CONFLICT KEEPS WHAT WAS TYPED: written at the new version when the field did not move, said beside it when it did', async () => {
  /* THE RED: the record refused the stale write correctly, and nothing sent the typed price again. Somebody
     else changed the row's count; the price typed at the old version was dropped, the box went on showing 1,250 and the
     record went on holding 1,200. */
  const moved = await egyptian('EGP');
  const price = moved.box('price');
  assert.ok(moved.k.update('checks', 'checks#1', { count: 9 } as never, { actor: 'p_2', version: 1 }).ok);
  moved.w.input(price, 'EGP 1,250.00');
  await moved.w.flush();
  assert.deepEqual(moved.stored().fields.price, { amount: 125000, currency: 'EGP' }, 'the price is written over the count somebody else changed');
  assert.equal(moved.stored().fields.count, 9, 'and their count is kept');
  assert.equal(moved.said().size, 0, 'nothing went wrong, so nothing is said');

  /* THE SAME FIELD CHANGED UNDERNEATH is two people's figures for one thing, and neither is thrown away in silence. */
  const both = await egyptian('EGP');
  const again = both.box('price');
  assert.ok(both.k.update('checks', 'checks#1', { price: { amount: 130000, currency: 'EGP' } } as never, { actor: 'p_2', version: 1 }).ok);
  both.w.input(again, 'EGP 1,250.00');
  await both.w.flush();
  assert.deepEqual(both.stored().fields.price, { amount: 130000, currency: 'EGP' }, 'the other figure is not written over');
  const sentence = both.said().get(keyOf({ register: 'checks', seq: 1 }, 'price')) ?? '';
  assert.match(sentence, /EGP 1,300\.00/u, 'the sentence says what the row holds now');
  assert.match(sentence, /EGP 1,250\.00/u, 'and what was typed, which is still the person\'s');
  /* AND IT DOES NOT SAY WHERE THE TYPED FIGURE IS NOW, because that depends on when the box was left, which this writer
     cannot see. Typed and left with Tab inside the pause, the box is pinned to the value it held when left, the conflict
     read back is a different value, and `shownIn` then shows the record's figure: the sentence said the typed one was
     "still in the box" while the box held the other person's (checked against `input-hold.ts`). */
  assert.doesNotMatch(sentence, /in the box/u, 'the sentence names the typed figure rather than claiming the box holds it');
});

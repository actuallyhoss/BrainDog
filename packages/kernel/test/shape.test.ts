/**
 * The shape copy, job 1: words, numbers and dates (PRF-A13, `area-proof-a.md` 2.5).
 *
 * What is asserted is what a gate drawing the copy needs to be true: a word keeps its length, case and script, and
 * stays the word it was everywhere it appears; a number keeps its sign and its digits, and a series keeps its order;
 * a date moves with every other date; the file keeps every table, every row and the length of every value, carries
 * its mark, and opens.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { checkBrainl, importBrainl } from '../src/brainl.ts';
import { SHAPE_MARK, Scrambler, isShape, shapeBrainl } from '../src/shape.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';
import { testSigner } from './signer.ts';

const KEY = new Uint8Array(32).fill(7);
const NOW = Date.UTC(2026, 8, 5, 12);
const s = new Scrambler(KEY);

test('A WORD BECOMES A MADE-UP WORD OF THE SAME LENGTH, CASE AND SCRIPT, AND THE SAME ONE EVERY TIME', () => {
  const made = s.word('Zorbex');
  assert.equal(made.length, 6);
  assert.notEqual(made.toLowerCase(), 'zorbex');
  assert.match(made, /^[A-Z][a-z]{5}$/);
  assert.equal(s.word('Zorbex'), made);
  assert.equal(s.word('zorbex'), made.toLowerCase(), 'the same word in another case is still the same word');
  assert.equal(s.word('ZORBEX'), made.toUpperCase());
  const arabic = s.word('القاهرة');
  assert.equal([...arabic].length, [...'القاهرة'].length);
  assert.match(arabic, /^\p{Script=Arabic}+$/u);
  assert.notEqual(arabic, 'القاهرة');
});

test('A NUMBER KEEPS ITS SIGN AND ITS DIGITS, AND A SERIES KEEPS ITS ORDER', () => {
  for (const n of [7, 42, 125000, -3150, 12.5, 0.07, -0.125, 99.99]) {
    const m = s.number(n);
    assert.equal(Math.sign(m), Math.sign(n), `${n}`);
    assert.equal(String(Math.abs(m)).length, String(Math.abs(n)).length, `${n} became ${m}`);
    assert.equal(s.number(n), m, 'the same number is the same number twice');
  }
  assert.equal(s.number(0), 0);
  const points = [1200, 1350, 1500, 1720, 2400, 3100, 5000];
  const shaped = points.map((p) => s.number(p, 'revenue'));
  for (let i = 1; i < shaped.length; i++) assert.ok(shaped[i]! >= shaped[i - 1]!, `the line keeps its shape: ${shaped}`);
  assert.ok(shaped.some((v, i) => v !== points[i]), 'a series is moved');
});

test('TWO NUMBERS NEVER BECOME ONE, SO NO GROUP OF DUPLICATES APPEARS THAT WAS NOT HIS', () => {
  for (const key of [KEY, new Uint8Array(32).map((_, i) => i * 31), new Uint8Array(32).fill(200)]) {
    const t = new Scrambler(key);
    for (const set of [[1, 2, 3, 4, 5, 6, 7, 8, 9], [10, 11, 12, 13, 98, 99], [0.1, 0.2, 0.3, 0.9], [1.5, 1.25, 9.99, 1.01], [-4, 4]]) {
      const out = set.map((n) => t.number(n));
      assert.equal(new Set(out).size, set.length, `${set} became ${out}`);
    }
    const small = [1, 2, 3, 4, 5].map((n) => t.number(n, 'count'));
    assert.equal(new Set(small).size, 5, `a series of small counts stays apart: ${small}`);
    const runs = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '07', '10', '11', '12'];
    const made = runs.map((r) => t.digits(r));
    assert.equal(new Set(made).size, runs.length, `${runs} became ${made}`);
    made.forEach((m, i) => assert.equal(m.length, runs[i]!.length));
    assert.equal(t.digits('0412')[0], '0', 'a leading zero stays a zero');
  }
});

test('EVERY DATE MOVES BY ONE OFFSET OF WHOLE WEEKS, AND A TIME OF DAY STAYS', () => {
  assert.ok(Number.isInteger(s.shiftDays / 7));
  assert.ok(s.shiftDays <= -28 && s.shiftDays >= -26 * 7);
  const day = s.date('2026-09-30')!;
  const instant = s.date('2026-09-30T14:05:09.120Z')!;
  assert.equal(instant, `${day}T14:05:09.120Z`);
  assert.equal((Date.parse(day) - Date.parse('2026-09-30')) / 86_400_000, s.shiftDays);
  assert.equal(new Date(day).getUTCDay(), new Date('2026-09-30').getUTCDay(), 'a Wednesday stays a Wednesday');
  assert.match(s.date('2026-09')!, /^\d{4}-\d{2}$/);
  const id = '01M1QDTV004FEDHSKYT9FTARNJ';
  const mapped = s.ulid(id);
  assert.match(mapped, /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/);
  assert.equal(s.ulid(id), mapped);
  assert.ok(mapped < s.ulid('01M1QDTV014FEDHSKYT9FTARNJ'), 'a later id stays later');
});

const OBLIGATIONS: Declaration = {
  id: 'register.obligations',
  kind: 'register',
  body: {
    id: 'obligations',
    name: 'Obligations',
    title: 'what',
    state: 'state',
    fields: [
      { id: 'what', type: 'text', required: true, search: true },
      { id: 'party', type: 'text', search: true },
      { id: 'amount', type: 'money', index: true },
      { id: 'due', type: 'day', index: true },
      { id: 'state', type: 'enum', values: ['open', 'paid'] },
    ],
  } as never,
};

async function filled(): Promise<{ k: Kernel; sql: NodeSql; lines: string[] }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW), { sign: testSigner() });
  assert.ok((await k.install([OBLIGATIONS])).ok);
  const rows = [
    ['Pay the Zorbex rent', 'Zorbex', 125000, '2026-09-30', 'open'],
    ['Quarlin retainer', 'Quarlin', 480000, '2026-10-15', 'paid'],
    ['Pay the Zorbex rent', 'Zorbex', 125000, '2026-10-30', 'open'],
  ] as const;
  for (const [what, party, amount, due, state] of rows) {
    const made = k.create('obligations', { what, party, amount: { amount, currency: 'EGP' }, due, state }, { actor: 'p_1' });
    assert.ok(made.ok, JSON.stringify(made));
  }
  const lines = (await k.export()) as { ok: true; value: string[] };
  return { k, sql, lines: lines.value };
}

/** The file's rows, by table, parsed. */
function rowsOf(lines: readonly string[]): Map<string, { columns: string[]; rows: unknown[][] }> {
  const out = new Map<string, { columns: string[]; rows: unknown[][] }>();
  let at: { columns: string[]; rows: unknown[][] } | null = null;
  for (const line of lines) {
    if (line.startsWith('#table ')) {
      const [name = '', cols = ''] = line.slice(7).split(' ');
      at = { columns: cols.split(','), rows: [] };
      out.set(name, at);
    } else if (!line.startsWith('#') && at) at.rows.push(JSON.parse(line) as unknown[]);
  }
  return out;
}

const cell = (t: { columns: string[]; rows: unknown[][] }, i: number, c: string): unknown => t.rows[i]![t.columns.indexOf(c)];

test('THE COPY KEEPS EVERY TABLE, EVERY ROW AND THE LENGTH OF EVERY VALUE, AND SAYS WHAT IT IS', async () => {
  const { sql, lines } = await filled();
  const shaped = await shapeBrainl(lines, { key: KEY, now: NOW });
  assert.equal(shaped[0], '#dogl 1');
  assert.equal(shaped[1], SHAPE_MARK);
  assert.ok(isShape(shaped));
  assert.ok(!isShape(lines));

  const before = rowsOf(lines);
  const after = rowsOf(shaped);
  assert.deepEqual([...after.keys()], [...before.keys()]);
  for (const [name, t] of before) {
    const u = after.get(name)!;
    if (name === 'dog_sig') assert.equal(u.rows.length, 0, 'a signature over the real values does not travel');
    else if (name === 'dog_meta') assert.equal(u.rows.length, t.rows.length + 2);
    else if (name === 'dog_manifest') continue;
    else {
      assert.equal(u.rows.length, t.rows.length, name);
      t.rows.forEach((row, i) =>
        row.forEach((v, j) => {
          if (typeof v === 'string') assert.equal(String(u.rows[i]![j]).length, v.length, `${name}.${t.columns[j]}: ${v}`);
        }),
      );
    }
  }
  const meta = after.get('dog_meta')!.rows;
  assert.ok(meta.some((r) => r[0] === 'shape' && r[1] === 'true'));
  sql.close();
});

test('HIS REGISTER IS THE SAME MADE-UP WORD EVERYWHERE, AND THE KERNEL’S OWN DECLARATION TRAVELS WHOLE', async () => {
  const { sql, lines } = await filled();
  const after = rowsOf(await shapeBrainl(lines, { key: KEY, now: NOW }));
  const decl = after.get('declaration')!;
  const own = decl.rows.findIndex((r) => String(r[0]).startsWith('register.') && r[3] !== 'kernel');
  const body = JSON.parse(String(cell(decl, own, 'body'))) as { id: string; fields: { id: string; values?: string[] }[] };
  assert.notEqual(body.id, 'obligations');
  assert.equal(cell(decl, own, 'id'), `register.${body.id}`);
  assert.equal(body.fields.find((f) => f.values)?.values?.length, 2);

  const entries = after.get('entry')!;
  const fields = entries.rows.map((_, i) => JSON.parse(String(cell(entries, i, 'fields'))) as Record<string, unknown>);
  for (let i = 0; i < entries.rows.length; i++) {
    assert.equal(cell(entries, i, 'register'), body.id);
    assert.deepEqual(Object.keys(fields[i]!), body.fields.map((f) => f.id), 'an entry’s keys are its register’s field ids');
    assert.ok(body.fields.find((f) => f.values)!.values!.includes(String(cell(entries, i, 'state'))), 'a state is one of its values');
  }
  assert.ok(after.get('counter')!.rows.some((r) => r[0] === `seq:${body.id}`));
  assert.deepEqual(fields[0], { ...fields[2], [body.fields[3]!.id]: fields[0]![body.fields[3]!.id] }, 'duplicates stay duplicates');
  const money = fields[0]![body.fields[2]!.id] as { amount: number; currency: string };
  assert.equal(money.currency, 'EGP');
  assert.notEqual(money.amount, 125000);

  const kernel = rowsOf(lines).get('declaration')!.rows.filter((r) => r[3] === 'kernel');
  assert.ok(kernel.length > 0);
  for (const row of kernel) assert.ok(decl.rows.some((r) => JSON.stringify(r) === JSON.stringify(row)));
  sql.close();
});

test('A PUBLISHED DECLARATION STAYS WHOLE, WITH ITS IDS AND STATES ON EVERY ENTRY', async () => {
  const { sql, lines } = await filled();
  const after = rowsOf(await shapeBrainl(lines, { key: KEY, now: NOW, published: [OBLIGATIONS] }));
  const entries = after.get('entry')!;
  assert.equal(cell(entries, 0, 'register'), 'obligations');
  assert.ok(['open', 'paid'].includes(String(cell(entries, 0, 'state'))));
  const fields = JSON.parse(String(cell(entries, 0, 'fields'))) as Record<string, unknown>;
  assert.deepEqual(Object.keys(fields), ['what', 'party', 'amount', 'due', 'state']);
  assert.notEqual(fields['party'], 'Zorbex');
  sql.close();
});

test('ITS MANIFEST MATCHES IT, SO THE ONE THING A CHECK REFUSES IS THE MISSING SIGNATURE, AND IT OPENS', async () => {
  const { sql, lines } = await filled();
  const shaped = await shapeBrainl(lines, { key: KEY, now: NOW });
  const checked = await checkBrainl(shaped);
  assert.equal(checked.ok, false);
  assert.equal(!checked.ok && checked.refusal.code, 'SIGNATURE_INVALID');

  const fresh = openSqlite();
  await openRecord(fresh, fixedClock(NOW), {});
  const opened = importBrainl(fresh, (fn) => fn(), shaped);
  assert.ok(opened.ok, JSON.stringify(opened));
  assert.equal(fresh.one<{ n: number }>('SELECT count(*) AS n FROM entry')?.n, 3);
  assert.equal(fresh.one<{ value: string }>("SELECT value FROM dog_meta WHERE key = 'shape'")?.value, 'true');
  fresh.close();
  sql.close();
});

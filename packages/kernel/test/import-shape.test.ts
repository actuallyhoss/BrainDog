/**
 * A shape copy is never put back as a record (PRF-A13 job 4): `importBrainl` refuses one unless it was asked for.
 *
 *   node --test packages/kernel/test/import-shape.test.ts
 *
 * THE FILE IS A REAL SHAPE COPY, made by `shapeBrainl` from a real export, so the refusal is tested on the bytes the
 * shape door hands out and not on a hand-made header. Each refusal test fails by itself when its line in `brainl.ts` is
 * taken out: the `shapeRefusal` call in `importBrainl` for the first two, the one at the top of `checkBrainl` for the
 * record's own import and the check's first assertion, the `isShape` guard on the skipped signature for the last.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration } from '../src/index.ts';
import { checkBrainl, importBrainl, shapeRefusal } from '../src/brainl.ts';
import { SHAPE_MARK, shapeBrainl } from '../src/shape.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';
import { testSigner } from './signer.ts';

const KEY = new Uint8Array(32).fill(11);
const NOW = Date.UTC(2026, 9, 9, 12);

const ORDERS: Declaration = {
  id: 'register.orders',
  kind: 'register',
  body: {
    id: 'orders',
    name: 'Orders',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true, search: true },
      { id: 'amount', type: 'money' },
    ],
  } as never,
};

/** A record with three orders, and its export. */
async function exported(): Promise<{ sql: NodeSql; lines: string[] }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW), { sign: testSigner() });
  assert.ok((await k.install([ORDERS])).ok);
  for (const [what, amount] of [['Blue mug', 900], ['Tall vase', 2400], ['Small plate', 450]] as const) {
    const made = k.create('orders', { what, amount: { amount, currency: 'EGP' } }, { actor: 'p_1' });
    assert.ok(made.ok, JSON.stringify(made));
  }
  const out = (await k.export()) as { ok: true; value: string[] };
  return { sql, lines: out.value };
}

async function empty(): Promise<NodeSql> {
  const sql = openSqlite();
  await openRecord(sql, fixedClock(NOW), {});
  return sql;
}

const entries = (sql: NodeSql) => sql.one<{ n: number }>('SELECT count(*) AS n FROM entry')?.n;

test('A SHAPE COPY IS REFUSED BY NAME, IN ONE SENTENCE, AND NOTHING IS WRITTEN', async () => {
  const { sql, lines } = await exported();
  const shaped = await shapeBrainl(lines, { key: KEY, now: NOW });
  assert.equal(shaped[1], SHAPE_MARK);
  const into = await empty();
  const before = entries(into);
  const out = importBrainl(into, (fn) => fn(), shaped);
  assert.equal(out.ok, false, 'a shape copy was put back as a record');
  assert.equal(!out.ok && out.refusal.code, 'IMPORT_SHAPE');
  const fix = !out.ok ? out.refusal.fix : '';
  assert.match(fix, /shape copy/u);
  assert.match(fix, /^[^.]+\.[^.]+\.$/u, 'two short sentences: what it is, and what to put back instead');
  assert.doesNotMatch(fix, /—|\brows?\b|01[0-9A-HJKMNP-TV-Z]{24}/u, 'no em dash, no "row", no id');
  assert.equal(entries(into), before, 'the refused file wrote nothing');
  into.close();
  sql.close();
});

test('A RECORD THAT ADOPTED A SHAPE COPY EXPORTS ONE, AND THAT EXPORT IS REFUSED TOO', async () => {
  const { sql, lines } = await exported();
  const shaped = await shapeBrainl(lines, { key: KEY, now: NOW });
  /* The mark line taken off: what is left is the `dog_meta` row a scratch record keeps, which `isShape` also reads. */
  const unmarked = shaped.filter((l) => l !== SHAPE_MARK);
  assert.ok(unmarked.some((l) => l === '["shape","true"]'));
  const into = await empty();
  const out = importBrainl(into, (fn) => fn(), unmarked);
  assert.equal(!out.ok && out.refusal.code, 'IMPORT_SHAPE');
  into.close();
  sql.close();
});

test('ASKED FOR, IT OPENS: the scratch record the look draws', async () => {
  const { sql, lines } = await exported();
  const shaped = await shapeBrainl(lines, { key: KEY, now: NOW });
  const into = await empty();
  const out = importBrainl(into, (fn) => fn(), shaped, { shape: true });
  assert.ok(out.ok, JSON.stringify(out));
  assert.equal(entries(into), 3);
  into.close();
  sql.close();
});

test('THE RECORD\'S OWN IMPORT ANSWERS A SHAPE COPY BY NAME, replace or not, and writes nothing', async () => {
  const { sql, lines } = await exported();
  const shaped = await shapeBrainl(lines, { key: KEY, now: NOW });
  const k = await openRecord(sql, fixedClock(NOW), {});
  const before = entries(sql);
  for (const replace of [false, true]) {
    const out = (await k.import(shaped, { replace })) as { ok: boolean; refusal?: { code: string } };
    assert.equal(out.ok, false, `a shape copy was put back over a real record (replace: ${replace})`);
    assert.equal(out.refusal?.code, 'IMPORT_SHAPE', 'a person told the file is unsigned goes looking for a key');
  }
  assert.equal(entries(sql), before, 'the real record kept every order');
  sql.close();
});

test('THE CONTROL: a real export is not a shape copy, and opens with nothing asked', async () => {
  const { sql, lines } = await exported();
  assert.equal(shapeRefusal(lines), null);
  const into = await empty();
  const out = importBrainl(into, (fn) => fn(), lines);
  assert.ok(out.ok, JSON.stringify(out));
  assert.equal(entries(into), 3);
  into.close();
  sql.close();
});

test('THE CHECK SKIPS THE SIGNATURE ONLY FOR A SHAPE COPY ASKED FOR, AND STILL READS ITS MANIFEST', async () => {
  const { sql, lines } = await exported();
  const shaped = await shapeBrainl(lines, { key: KEY, now: NOW });
  const refused = await checkBrainl(shaped);
  assert.equal(!refused.ok && refused.refusal.code, 'IMPORT_SHAPE', 'not asked for, a shape copy is refused by name and not as unsigned');
  assert.ok((await checkBrainl(shaped, { shape: true })).ok, 'asked for, a shape copy checks');

  /* A real export with its signature taken off is not let through by the same flag. */
  const unsigned = lines.filter((l, i) => !(i > 0 && lines[i - 1]!.startsWith('#table dog_sig ')) && !l.startsWith('#table dog_sig '));
  const bare = await checkBrainl(unsigned, { shape: true });
  assert.equal(!bare.ok && bare.refusal.code, 'SIGNATURE_INVALID');

  /* And a shape copy with one value changed is damaged, asked for or not. */
  const at = shaped.findIndex((l, i) => i > 0 && shaped[i - 1]!.startsWith('#table entry '));
  assert.ok(at > 0);
  const edited = [...shaped];
  edited[at] = edited[at]!.replace(/"[A-Za-z]{3,}/u, '"Zzzzz');
  assert.notEqual(edited[at], shaped[at]);
  const damaged = await checkBrainl(edited, { shape: true });
  assert.equal(!damaged.ok && damaged.refusal.code, 'CHECKSUM_MISMATCH');
  sql.close();
});

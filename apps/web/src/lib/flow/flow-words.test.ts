/**
 * The words the canvas compares a number in, held against the record that reads them.
 *
 * THE CANVAS SAID THE SENTENCE HAD NO WORD FOR "MORE THAN", AND IT HAS FIVE. `flow.ts` over `COMPARE` and the
 * inspector's header both said `packages/where/src/sentence.ts` read is, before, after, empty, set, has and lacks and
 * nothing that orders, so a condition over a number had to be the tree the "A number" builder writes. That was true
 * until `3187be5a` taught the sentence more than, at least, less than, at most and between, and false from then on.
 * Measured over the record's own `parseWhere` with an answer typed as the runner types
 * it: `rate is more than 70` over a decimal is `{ field: rate, gt: 70 }`, the very tree the builder files, and
 * `rate between 50 and 90` is `between`. Over an answer held as text the words fall back to an `is` of the whole
 * phrase, which answers false where the tree answers false too, so the two forms never disagree about a row.
 *
 * SO THE RECORD IS ASKED, NOT DESCRIBED. Every test the builder offers is said in the card's words by `sayCondition`,
 * and a real record lists rows by that sentence and by the tree it came from; the two lists have to be one list. Then
 * the canvas's own source is read, because the stale claim lived in comments no runtime test reaches, and the example
 * a person is shown where they write a condition in words has to use one of the words it was once said to lack.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

import { openRecord, type Declaration, type Kernel } from '@braindog/kernel';

import { ARGS, COMPARE, CONDITION_HINT, leafOf, leafTo, sayCondition } from './flow.ts';

const NOW = Date.UTC(2026, 8, 24, 12);
const HERE = fileURLToPath(new URL('.', import.meta.url));

/** The `sql` port over one in-memory SQLite, as `record/where-compare.test.ts` builds it. */
function openSqlite(): Parameters<typeof openRecord>[0] {
  const db = new DatabaseSync(':memory:');
  let depth = 0;
  const sql = {
    exec: (text: string, ...params: unknown[]) => {
      if (params.length === 0) db.exec(text);
      else db.prepare(text).run(...(params as never[]));
    },
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
  };
  return sql as unknown as Parameters<typeof openRecord>[0];
}

/* `per_gram` CARRIES AN UNDERSCORE ON PURPOSE. `sayCondition` says it as "per gram", and the sentence finds a field by
   its id with the underscores folded to spaces, so the card's words have to reach the field the tree names. */
const GOLD: Declaration = {
  id: 'register.gold',
  kind: 'register',
  body: { id: 'gold', name: 'Gold', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'per_gram', type: 'decimal' }] } as never,
};

const record = (async () => {
  const k = await openRecord(openSqlite(), { now: () => NOW });
  assert.ok((await k.install([GOLD])).ok);
  for (const [what, per_gram] of [['low', '40'], ['on the line', '70'], ['high', '100']] as const)
    assert.ok(k.create('gold', { what, per_gram }, { actor: 'p_1' }).ok, what);
  return k;
})();

/** The titles of the rows `where` admits, or the refusal the record gave. */
async function rows(where: unknown): Promise<string[] | string> {
  const k: Kernel = await record;
  const out = k.list({ register: 'gold', where: where as never, limit: 500 });
  if (!out.ok) return 'refusal' in out ? out.refusal.fix : 'a conflict';
  return out.value.rows.map((r) => String(r.fields.what)).sort();
}

test('EVERY TEST THE BUILDER OFFERS IS SAID IN WORDS THE RECORD READS AS THAT TEST, and they pick out the same rows', async () => {
  const seen = new Set<string>();
  for (const { op } of COMPARE) {
    const tree = leafTo('per_gram', op, 70);
    assert.deepEqual(leafOf(tree), { field: 'per_gram', op, value: 70 }, `${op}: the builder cannot edit what it filed`);
    const said = sayCondition(tree);
    const byTree = await rows(tree);
    const bySentence = await rows(said);
    assert.equal(typeof byTree, 'object', `${op}: the record refused the tree: ${String(byTree)}`);
    assert.deepEqual(bySentence, byTree, `"${said}" and ${JSON.stringify(tree)} drew different rows`);
    seen.add(JSON.stringify(byTree));
  }
  /* FIVE TESTS AT ONE VALUE OVER THREE ROWS DRAW FIVE DIFFERENT ANSWERS, one of them the row on the line alone. A record
     that read every sentence and every tree as nothing, or as everything, would agree with itself above and hand back
     one answer here, and the comparison would have proved nothing about the words. */
  assert.equal(seen.size, COMPARE.length, [...seen].join(' | '));
});

test('AND between, WHICH THE BUILDER DOES NOT OFFER, IS READ BY THE SAME RECORD', async () => {
  assert.deepEqual(await rows('per gram is between 50 and 90'), ['on the line']);
  assert.deepEqual(await rows('per gram between 50 and 90'), ['on the line']);
});

test('NOTHING THE CANVAS SHIPS SAYS THE SENTENCE CANNOT COMPARE', () => {
  const shipped = readdirSync(HERE).filter((f) => !f.endsWith('.test.ts') && /\.(ts|svelte)$/u.test(f));
  assert.ok(shipped.includes('flow.ts') && shipped.includes('Inspector.svelte'), shipped.join(', '));
  for (const file of shipped) {
    const text = readFileSync(`${HERE}${file}`, 'utf8').replace(/\s+/gu, ' ');
    /* `ok` AND NOT `doesNotMatch`, which prints the whole file as its `actual`. */
    assert.ok(!/no word for\s*["“]?more than/iu.test(text), `${file} still says the sentence has no word for more than`);
    assert.ok(!/exist only in the structured form/iu.test(text), `${file} still says the ordered tests exist only as a tree`);
  }
});

test('WHERE A CONDITION IS WRITTEN IN WORDS, THE EXAMPLE SHOWS A NUMBER COMPARED', () => {
  const ordered = /\b(more than|at least|less than|at most|between)\b/u;
  assert.match(CONDITION_HINT, ordered);
  const cond = ARGS.if.find((a) => a.kind === 'condition');
  assert.equal(cond?.hint, CONDITION_HINT, "a branch's condition shows the example");
});

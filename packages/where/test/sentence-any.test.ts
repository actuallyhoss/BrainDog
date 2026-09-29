/**
 * `, or` between conditions in the sentence form: the grammar's `any`, which no sentence could reach.
 *
 * THE TREE HAS HAD `{ any: [...] }` SINCE THE GRAMMAR WAS WRITTEN AND THE SENTENCE STOPPED AT ONE FIELD.
 * Probed with the ordered words already in place:
 * `state is open, or due before today` was refused `FIELD_UNKNOWN`, the words `or due` read as a field
 * name, and `state is open or due before today` was refused `ENUM_VALUE_UNKNOWN`, the words `due before
 * today` read as a state. `state is open or doing` already read as one field's `in`, so "open or
 * overdue", the question a list of bills is asked most after "open", could only be asked in JSON.
 *
 * A SENTENCE THAT SAYS BOTH `,` AND `, or` IS REFUSED rather than given a precedence, because a rule
 * about which binds tighter is one more thing a person has to learn before the filter means what it
 * says, and the refusal names both readings so the choice is theirs.
 *
 * THE PROOF RUNS AGAINST THE KERNEL, imported by path as `sentence-compare.test.ts` does, because a
 * `list` is where a page, a rule's `when:` and an agent's `where` are actually read.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { evaluate, parseWhere, type Predicate, type Schema } from '../src/index.ts';
import { openRecord, type Declaration, type Kernel } from '../../kernel/src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 23, 12);
const TODAY = '2026-09-23';

const BILLS: Schema = {
  register: 'bills',
  fields: {
    what: { type: 'text', label: 'Merchant' },
    state: { type: 'enum', values: ['open', 'doing', 'paid'] },
    n: { type: 'int' },
    due: { type: 'day', label: 'Due on' },
  },
};

const parse = (text: string) => parseWhere(text, BILLS, { nowMs: NOW, refByTitle: () => null });
const good = (text: string): Predicate | undefined => {
  const out = parse(text);
  assert.deepEqual(out.bad.map((b) => `${b.code}: ${b.fix}`), [], `${text} was refused`);
  return out.predicate;
};
const refused = (text: string) => {
  const out = parse(text);
  assert.equal(out.predicate, undefined, `${text} compiled to ${JSON.stringify(out.predicate)}`);
  assert.ok(out.bad.length > 0, `${text} was accepted`);
  return out.bad[0]!;
};

/* ── the words, and the tree they are ────────────────────────────────────── */

test('THE PROBE: `state is open, or due before today` is the grammar`s any over the two conditions', () => {
  assert.deepEqual(good('state is open, or due before today'), {
    any: [
      { field: 'state', is: 'open' },
      { field: 'due', before: TODAY },
    ],
  });
  /* IN ANY CASE, as `or` between one field's values already is, and with any run of spaces. */
  assert.deepEqual(good('state is open,  OR due before today'), good('state is open, or due before today'));
  /* THREE CONDITIONS ARE ONE `any` OF THREE, not an `any` inside an `any`. */
  assert.deepEqual(good('state is open, or due before today, or n at least 3'), {
    any: [{ field: 'state', is: 'open' }, { field: 'due', before: TODAY }, { field: 'n', gte: 3 }],
  });
});

test('AND ONE FIELD`S `or` IS STILL ITS `in`, and the comma alone is still `all`', () => {
  assert.deepEqual(good('state is open or doing'), { field: 'state', in: ['open', 'doing'] });
  assert.deepEqual(good('state is open, due before today'), {
    all: [
      { field: 'state', is: 'open' },
      { field: 'due', before: TODAY },
    ],
  });
  /* BOTH AT ONCE: one field's alternatives inside one condition of the or-group. */
  assert.deepEqual(good('state is open or doing, or n more than 5'), {
    any: [{ field: 'state', in: ['open', 'doing'] }, { field: 'n', gt: 5 }],
  });
});

test('A CONDITION THAT IS ITSELF A CONJUNCTION STAYS ONE, inside the or-group', () => {
  /* A RANGE OF DAYS IS ITS TWO ENDS (`sentence.ts` has why), so a disjunct can be an `all` of its own,
     and it has to stay one: flattened into the `any`, the two ends would each admit half the calendar. */
  assert.deepEqual(good('due between today and +7d, or state is doing'), {
    any: [{ all: [{ field: 'due', gte: TODAY }, { field: 'due', lte: '2026-09-30' }] }, { field: 'state', is: 'doing' }],
  });
});

test('A SENTENCE THAT SAYS BOTH `,` AND `, or` IS REFUSED, naming both readings', () => {
  const bad = refused('state is open, due before today, or n at least 3');
  assert.equal(bad.code, 'VALUE_MALFORMED');
  assert.equal(bad.at, 'where');
  /* THE TWO READINGS, spelled out, so nobody has to learn which one a precedence rule would pick. */
  assert.match(bad.fix, /\(state is open and due before today\) or n at least 3/);
  assert.match(bad.fix, /state is open and \(due before today or n at least 3\)/);
  /* AND THE OTHER ORDER, where the or comes first. */
  const other = refused('state is open, or due before today, n at least 3');
  assert.match(other.fix, /state is open or \(due before today and n at least 3\)/);
  assert.match(other.fix, /\(state is open or due before today\) and n at least 3/);
});

test('AN `or` WITH NOTHING AFTER IT ASKS FOR THE CONDITION, and each condition is refused on its own terms', () => {
  const bare = refused('state is open, or');
  assert.equal(bare.code, 'REQUIRED_MISSING');
  assert.match(bare.fix, /or what\?/);
  /* THE CONDITION AFTER `or` IS READ AS ANY OTHER, so its refusal is the one it would get alone. */
  assert.equal(refused('state is open, or due before banana').code, 'VALUE_MALFORMED');
  assert.equal(refused('state is open, or state is done').code, 'ENUM_VALUE_UNKNOWN');
  assert.equal(refused('state is open, or nothing is here').code, 'FIELD_UNKNOWN');
  /* AND BY THE LABEL, which is how a page prints its own filter back. */
  assert.deepEqual(good('state is open, or Due on before today'), {
    any: [
      { field: 'state', is: 'open' },
      { field: 'due', before: TODAY },
    ],
  });
});

/* ── against a real record ───────────────────────────────────────────────── */

const REGISTER: Declaration = {
  id: 'register.bills',
  kind: 'register',
  body: {
    id: 'bills',
    name: 'Bills',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'state', type: 'enum', values: ['open', 'doing', 'paid'] },
      { id: 'n', type: 'int' },
      { id: 'due', type: 'day' },
    ],
  } as never,
};

const ROWS = [
  { what: 'a', state: 'open', n: 1, due: '2026-10-20' },
  { what: 'b', state: 'paid', n: 3, due: '2026-09-01' },
  { what: 'c', state: 'paid', n: 8, due: '2026-10-01' },
  { what: 'd', state: 'doing', n: 5 },
  { what: 'e', state: 'open', due: '2026-09-10' },
];

async function seeded(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const out = await k.install([REGISTER]);
  assert.ok(out.ok, JSON.stringify(out));
  for (const fields of ROWS) assert.ok(k.create('bills', fields, { actor: 'p_1' }).ok);
  return k;
}

const listed = (k: Kernel, where: unknown): string => {
  const out = k.list({ register: 'bills', where: where as never, limit: 50 });
  if (!out.ok) return `refused ${'refusal' in out ? `${out.refusal.code}: ${out.refusal.fix}` : 'with a conflict'}`;
  return out.value.rows.map((r) => String(r.fields.what)).sort().join(' ');
};

test('THE PROBE, AS A KERNEL `list`: open or overdue is both halves and nothing else', async () => {
  const k = await seeded();
  /* a and e are open; b and e are due before the 23rd. The union is a, b, e; c and d are neither. */
  assert.equal(listed(k, 'state is open, or due before today'), 'a b e');
  assert.equal(listed(k, 'state is open, or due before today'), listed(k, { any: [{ field: 'state', is: 'open' }, { field: 'due', before: TODAY }] }));
  /* AND THE COMMA ALONE IS STILL THE INTERSECTION, which is e. */
  assert.equal(listed(k, 'state is open, due before today'), 'e');
  assert.match(listed(k, 'state is open, due before today, or n at least 3'), /^refused VALUE_MALFORMED: .*two ways/);
});

test('AND THE SQL AND THE EVALUATOR ADMIT THE SAME ROWS for every or-group the record answers', async () => {
  const k = await seeded();
  for (const sentence of [
    'state is open, or due before today',
    'state is doing, or n at least 8',
    'state is not open, or due after +7d',
    'due between today and +30d, or n at most 1',
    'due is empty, or state is paid',
    'what contains a, or what contains d, or n more than 7',
  ]) {
    const predicate = good(sentence)!;
    const byEvaluate = ROWS.filter((row) => evaluate(predicate, row, BILLS))
      .map((row) => row.what)
      .sort()
      .join(' ');
    assert.equal(listed(k, sentence), byEvaluate, sentence);
    assert.notEqual(byEvaluate, '', `${sentence} found nothing, so it proves nothing about rows`);
  }
});

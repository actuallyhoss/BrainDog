/**
 * `<field> contains <text>` in the sentence form, the one text test a person can say.
 *
 * THE JSON FORM HAS RUN IT ALL ALONG AND THE SENTENCE REFUSED IT. Measured at HEAD before this file
 * (`loop/research-living-in-it.md` §6): a rule `{ field: what, contains: UBER }` fired on
 * "UBER *TRIP 1234" in either case, and a list over a `document` field found its row, while
 * `parseWhere('what contains uber')` answered `MATCH_OP_UNSUPPORTED ... contains is not something a
 * filter can say`. A page's `where:`, the chip line and a sentence-form rule are all written in the
 * sentence form, so that refusal was the gap a person meets first: the filter a search box builds
 * every time could not be typed.
 *
 * THE PROOF RUNS AGAINST THE KERNEL AS WELL AS THE PARSER, because a leaf the parser emits and the
 * record then reads differently is two languages again. The kernel is imported by path from its own
 * tree, test to test, and `where` declares no dependency on it: `31 §2` keeps `where ⇏ kernel` for
 * source, and the graph gate reads `src/**` only.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { compile, evaluate, parseWhere, type Schema } from '../src/index.ts';
import { openRecord, type Declaration } from '../../kernel/src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 23, 12);

const SPEND: Schema = {
  register: 'spend',
  fields: {
    what: { type: 'text', label: 'Merchant' },
    note: { type: 'document' },
    state: { type: 'enum', values: ['open', 'owed_to_me'] },
    thing: { type: 'ref', to: 'things' } as never,
    tags: { type: 'list', of: 'text' } as never,
    amount: { type: 'money' },
    n: { type: 'int' },
    due: { type: 'day' },
  },
};

const deps = { nowMs: NOW, refByTitle: () => null };
const parse = (text: string) => parseWhere(text, SPEND, deps);
const good = (text: string) => {
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

/* ── the three sentences of §6 ───────────────────────────────────────────── */

test('§6\'S THREE SENTENCES COMPILE TO THE LEAF THE JSON FORM ALREADY RUNS', () => {
  /* One per JSON probe §6 measured green: the rule's `contains`, the same in capitals, and the list
     over a `document`. Each was `MATCH_OP_UNSUPPORTED` at HEAD. */
  assert.deepEqual(good('what contains uber'), { field: 'what', contains: 'uber' });
  assert.deepEqual(good('what contains "UBER *TRIP"'), { field: 'what', contains: 'UBER *TRIP' });
  assert.deepEqual(good('note contains uber'), { field: 'note', contains: 'uber' });

  /* AND BY THE LABEL, which is how a page prints its own filter back. */
  assert.deepEqual(good('Merchant contains uber'), { field: 'what', contains: 'uber' });
  /* A clause among clauses, ANDed on the comma like every other. */
  assert.deepEqual(good('what contains uber, state is open'), {
    all: [
      { field: 'what', contains: 'uber' },
      { field: 'state', is: 'open' },
    ],
  });
});

test('THE LEAF IT EMITS IS ONE THE COMPILER TAKES AND THE EVALUATOR ANSWERS, in either case', () => {
  const leaf = good('what contains uber')!;
  assert.deepEqual(compile(leaf, SPEND).bad, []);
  assert.equal(evaluate(leaf, { what: 'UBER *TRIP 1234' }, SPEND), true);
  assert.equal(evaluate(leaf, { what: 'Tesco Metro' }, SPEND), false);
});

/* ── against a real record ───────────────────────────────────────────────── */

const SPEND_REGISTER: Declaration = {
  id: 'register.spend',
  kind: 'register',
  body: {
    id: 'spend',
    name: 'Spend',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'note', type: 'document' },
      { id: 'tags', type: 'list', of: 'text' },
    ],
  } as never,
};

/* A RULE WRITTEN IN THE SENTENCE FORM, which is the one a person writes on a phone. */
const RIDES: Declaration = {
  id: 'rule.rides',
  kind: 'rule',
  body: { rule: 'rides', register: 'spend', when: 'what contains uber', then: [{ tag: 'ride' }] } as never,
};

test('A KERNEL `list` AND A RULE INSTALLED IN THE SENTENCE FORM BOTH READ IT', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const installed = await k.install([SPEND_REGISTER, RIDES]);
  assert.ok(installed.ok, JSON.stringify(installed));

  const made = (fields: Record<string, unknown>) => {
    const out = k.create('spend', fields, { actor: 'p_1' }) as { ok: boolean; value: { fields: { tags?: string[] } } };
    assert.ok(out.ok, JSON.stringify(out));
    return out.value.fields;
  };
  /* THE BANK'S OWN CAPITALS, against a rule written in lower case: the fold is the evaluator's. */
  assert.deepEqual(made({ what: 'UBER *TRIP 1234' }).tags, ['ride']);
  assert.equal(made({ what: 'Tesco Metro', note: 'split the uber home with Sam' }).tags, undefined);

  const listed = (where: string) => {
    const out = k.list({ register: 'spend', where }) as unknown as { ok: boolean; value: { rows: { fields: { what: string } }[] } };
    assert.ok(out.ok, `${where}: ${JSON.stringify(out)}`);
    return out.value.rows.map((r) => r.fields.what);
  };
  assert.deepEqual(listed('what contains uber'), ['UBER *TRIP 1234']);
  assert.deepEqual(listed('what contains "UBER *TRIP"'), ['UBER *TRIP 1234']);
  assert.deepEqual(listed('note contains uber'), ['Tesco Metro']);
  assert.deepEqual(listed('what contains lyft'), []);
  sql.close();
});

/* ── quoted and bare ─────────────────────────────────────────────────────── */

test('QUOTED TEXT IS TAKEN AS WRITTEN, and a phone\'s curly quotes are quotes', () => {
  /* The words a bare text would otherwise read as grammar. */
  assert.deepEqual(good('what contains "uber or lyft"'), { field: 'what', contains: 'uber or lyft' });
  assert.deepEqual(good('what contains "not paid"'), { field: 'what', contains: 'not paid' });
  /* THE SPACES INSIDE ARE KEPT, which is the one way to ask for a whole word. */
  assert.deepEqual(good('what contains " uber "'), { field: 'what', contains: ' uber ' });
  /* AND A RUN OF THEM IS KEPT AS A RUN, because a bank pads its descriptors. The line above passes
     from the words re-joined on one space as well; this one is what fails from them. */
  assert.deepEqual(good('what contains "UBER   *TRIP"'), { field: 'what', contains: 'UBER   *TRIP' });
  assert.deepEqual(good("what contains 'UBER *TRIP'"), { field: 'what', contains: 'UBER *TRIP' });
  /* iOS turns a typed " into “ and ” by default. Refusing them would refuse the phone. */
  assert.deepEqual(good('what contains “uber trip”'), { field: 'what', contains: 'uber trip' });
  assert.deepEqual(good('what contains ‘uber’'), { field: 'what', contains: 'uber' });
  /* AN APOSTROPHE INSIDE BARE TEXT IS PART OF IT, not a quote that never closed. */
  assert.deepEqual(good("what contains McDonald's"), { field: 'what', contains: "McDonald's" });
});

/* ── what it refuses, and why each would otherwise have matched nothing or everything ── */

test('A TYPE WHOSE COLUMN IS NOT THE WORDS IS REFUSED, and a list is pointed at `has`', () => {
  const list = refused('tags contains urgent');
  assert.equal(list.code, 'MATCH_OP_UNSUPPORTED');
  assert.match(list.fix, /has/);

  for (const text of ['n contains 3', 'due contains 2026', 'amount contains 10']) assert.equal(refused(text).code, 'MATCH_OP_UNSUPPORTED', text);

  /* A REF HOLDS A ROW ID and an enum holds `owed_to_me`, so the words a person types are not what
     `instr` would be handed: `thing contains Kiln` searched an id for four letters and
     `state contains owed to me` searched `owed_to_me` for spaces. Both matched nothing, for ever. */
  const ref = refused('thing contains Kiln');
  assert.equal(ref.code, 'MATCH_OP_UNSUPPORTED');
  assert.match(ref.fix, /\bis\b/);
  assert.equal(refused('state contains owed to me').code, 'MATCH_OP_UNSUPPORTED');
});

test('NOTHING TO LOOK FOR IS A REFUSAL, because an empty needle is in every row', () => {
  assert.equal(refused('what contains').code, 'REQUIRED_MISSING');
  assert.equal(refused('what contains ""').code, 'REQUIRED_MISSING');
});

test('A BARE `not` AND A BARE `or` ARE REFUSED RATHER THAN SEARCHED FOR', () => {
  /* `what contains not uber` read literally is the rows that say "not uber", which is the opposite of
     what somebody who wrote it meant. `is not` taught the reader the word. */
  const not = refused('what contains not uber');
  assert.equal(not.code, 'MATCH_OP_UNSUPPORTED');
  assert.match(not.fix, /quote/i);
  assert.equal(refused('what contains not').code, 'MATCH_OP_UNSUPPORTED');

  const or = refused('what contains uber or lyft');
  assert.equal(or.code, 'VALUE_MALFORMED');
  assert.match(or.fix, /quote/i);
});

test('A QUOTE THE COMMA CUT OPEN IS REFUSED, not searched for with its quote mark', () => {
  const cut = parse('what contains "Smith, J"');
  assert.equal(cut.predicate, undefined);
  assert.equal(cut.bad[0]?.code, 'VALUE_MALFORMED');
  assert.match(cut.bad[0]!.fix, /comma/);
});

test('THE REFUSAL FOR A VERB IT CANNOT READ NOW NAMES `contains`', () => {
  const said = refused('what resembles uber');
  assert.equal(said.code, 'MATCH_OP_UNSUPPORTED');
  assert.ok(said.allowed?.includes('contains'), JSON.stringify(said.allowed));
  assert.match(said.fix, /contains/);
  /* AND THE SENTENCE NAMES WHAT THE LIST NAMES. It wrote six words beside a list of seven, `on`
     missing, and a widening that edits one and not the other is how that gap was made. */
  assert.match(said.fix, /Write is, is not, before, after, on, has, lacks or contains\.$/);
});

/**
 * The palette, both passes.
 *
 * WHAT EACH GROUP IS ABOUT. The first is retrieval: which query this package sent, and what it
 * refused to send. The second is the citation rule as the palette applies it, which is the only
 * thing standing between a model's sentence and a suggestion in somebody's queue. The third is the
 * meter and the tiers, where the assertions are about money and about a key this package must
 * never be able to name.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { codeOf } from '@braindog/ports';

import { createSlash } from '../src/index.ts';
import { canned, fakeRecord, fixedClock, INDEX, NOW, OWNER, openSqlite, ROWS } from './double.ts';
import type { Projection } from '../src/index.ts';

const build = (index = INDEX, rows = ROWS) => {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const inference = canned();
  const record = fakeRecord(index, rows);
  const slash = createSlash({ sql, clock, inference, record });
  const calls = () =>
    sql.all<{ kind: string; status: string; code: string | null; tier: string; model: string; neurons: number; filed: string | null; question: string | null }>(
      'SELECT kind, status, code, tier, model, neurons, filed, question FROM slash_call ORDER BY rowid',
    );
  return { sql, clock, inference, record, slash, calls };
};

const PREDICATE = JSON.stringify({
  registers: ['obligations'],
  where: { all: [{ field: 'state', is: 'open' }] },
  q: null,
});

const options = (over: Record<string, unknown> = {}): string =>
  JSON.stringify({
    text: 'Two are open: {{ref:obligations#7}} and {{ref:obligations#8}}.',
    body_kind: 'options',
    body: {
      options: [
        { id: 'a', label: 'Pay the rent first', because: 'It is the larger, {{ref:obligations#7}}.', recommended: true },
        { id: 'b', label: 'Pay the accountant first', because: 'It is due later.' },
      ],
    },
    flagged: false,
    ...over,
  });

test('pass 1 asks for the index, then for the rows the drafted predicate names', async () => {
  const { slash, record, inference } = build();
  inference.say(PREDICATE);
  const out = await slash.read('what is still open', OWNER);

  assert.equal(out.ok, true);
  assert.deepEqual(record.projected[0], { registers: [], budget: { tokens: 400 } });
  assert.deepEqual(record.projected[1], {
    registers: ['obligations'],
    where: { all: [{ field: 'state', is: 'open' }] },
    budget: { tokens: 6000 },
  });
  assert.equal(inference.seen.length, 1);
});

test('the fold ends with the vault, read nothing, refused', async () => {
  const { slash, inference } = build();
  inference.say(PREDICATE);
  const out = await slash.read('what is still open', OWNER);
  const read = out.ok ? out.value.read : [];
  assert.deepEqual(read.at(-1), { register: 'grant', rows: 0, predicate: 'refused' });
  assert.deepEqual(read[0], {
    register: 'obligations',
    rows: 2,
    predicate: '{"all":[{"field":"state","is":"open"}]}',
  });
});

test('a model that names the vault has it dropped before the call, not refused after it', async () => {
  const { slash, record, inference } = build();
  inference.say(JSON.stringify({ registers: ['grant', 'obligations'], where: null, q: 'keys' }));
  await slash.read('what keys do I have', OWNER);
  for (const asked of record.projected) assert.equal(asked.registers.includes('grant'), false);
  assert.deepEqual(record.projected[1]?.registers, ['obligations']);
});

test('a predicate the grammar refuses costs the ask its filter and not its answer, with no retry', async () => {
  const { slash, record, inference, calls } = build();
  inference.say(JSON.stringify({ registers: ['obligations'], where: { all: [{ field: 'nope', is: 'x' }] }, q: 'rent' }));
  const out = await slash.read('what about the rent', OWNER);

  assert.equal(out.ok, true);
  assert.equal(out.ok ? out.value.predicate : 'set', null);
  assert.equal(record.projected[1]?.where, undefined);
  assert.equal(record.projected[1]?.q, 'rent');
  assert.equal(inference.seen.length, 1);
  assert.equal(calls()[0]?.status, 'ok');
});

test('a predicate fits the registers it fits, and the others are dropped rather than the filter', async () => {
  const { slash, record, inference } = build();
  inference.say(
    JSON.stringify({ registers: ['obligations', 'domains'], where: { all: [{ field: 'state', is: 'open' }] }, q: null }),
  );
  await slash.read('what is open', OWNER);
  assert.deepEqual(record.projected[1]?.registers, ['obligations']);
});

test('a model that did not answer is an error on the row and a keyword search for the person', async () => {
  const { slash, record, inference, calls } = build();
  inference.say(new Error('502 from the gateway'));
  const out = await slash.read('what is open', OWNER);
  assert.equal(out.ok, true);
  assert.equal(record.projected[1]?.q, 'what is open');
  assert.equal(calls()[0]?.status, 'error');
  assert.equal(calls()[0]?.code, 'UNREACHABLE');
});

test('a record with no registers answers nothing, and calls no model', async () => {
  const { slash, inference } = build({ registers: [], open_questions: [] }, []);
  const out = await slash.read('anything', OWNER);
  assert.equal(out.ok && out.value.rows.length, 0);
  assert.equal(inference.seen.length, 0);
});

test('an ask is one question and 400 bytes of it', async () => {
  const { slash, inference, calls } = build();
  inference.say(PREDICATE);
  await slash.read(`  ${'a'.repeat(900)}  `, OWNER);
  assert.equal(calls()[0]?.question?.length, 400);
  assert.equal(codeOf(await slash.read('   ', OWNER)), 'VALUE_MALFORMED');
});

test('tier a out of asks refuses before any model call', async () => {
  const { sql, slash, inference } = build();
  /* `read`, NOT `propose`: only `read` and `pattern` meter an ask now (`call.ts`'s `asksUsed`). */
  for (let i = 0; i < 80; i++)
    sql.exec(
      `INSERT INTO slash_call (id, ts, kind, tier, model, tokens_in, tokens_out, neurons, ms, status)
       VALUES (?, '2026-11-03T00:00:00.000Z', 'read', 'a', 'glm-5.3-flash', 1, 1, 1, 1, 'ok')`,
      `c${i}`,
    );
  const out = await slash.read('what is open', OWNER);
  assert.equal(codeOf(out), 'SLASH_BUDGET_SPENT');
  assert.equal(inference.seen.length, 0);
  assert.equal(codeOf(await slash.propose('what is open', OWNER)), 'SLASH_BUDGET_SPENT');
  assert.equal(inference.seen.length, 0);
});

test('zero rows means zero inference: the rows were the answer', async () => {
  const { slash, inference, record } = build(INDEX, []);
  inference.say(PREDICATE);
  const out = await slash.propose('what is open', OWNER);
  assert.equal(out.ok && out.value.body_kind, 'query');
  assert.deepEqual(out.ok ? out.value.verbs : [], ['edit', 'save', 'open']);
  /* One call, and it is the predicate draft. Nothing was asked to talk about an empty list. */
  assert.equal(inference.seen.length, 1);
  assert.equal(record.filed.length, 0);
});

test('pass 2 with an ask id re-projects the stored predicate and does not draft it again', async () => {
  const { slash, record, inference } = build();
  inference.say(PREDICATE);
  const first = await slash.read('what is still open', OWNER);
  const askId = first.ok ? first.value.ask_id : '';

  inference.say(options());
  const out = await slash.propose('what is still open', OWNER, undefined, askId);

  assert.equal(out.ok, true);
  assert.equal(inference.seen.length, 2);
  assert.equal(inference.seen[1]?.model, 'glm-5.3-flash');
  assert.deepEqual(record.projected[2], {
    registers: ['obligations'],
    where: { all: [{ field: 'state', is: 'open' }] },
    budget: { tokens: 6000 },
  });
});

test('a filed proposal is filed by Slash and never by the person who asked', async () => {
  const { slash, record, inference } = build();
  inference.say(PREDICATE);
  inference.say(options());
  const out = await slash.propose('what is still open', OWNER);

  assert.equal(out.ok && out.value.filed, 'SG1');
  assert.equal(record.filed.length, 1);
  assert.deepEqual(record.filed[0]?.ctx.principal, { kind: 'system', id: 'slash' });
  assert.equal(record.filed[0]?.body_kind, 'options');
});

test('a recommendation keeps its tick only when its reason names a row', async () => {
  const { slash, inference } = build();
  inference.say(PREDICATE);
  inference.say(options());
  const kept = await slash.propose('what is still open', OWNER);
  const first = kept.ok ? (kept.value.body['options'] as Record<string, unknown>[]) : [];
  assert.equal(first[0]?.['recommended'], true);

  inference.say(PREDICATE);
  inference.say(
    options({
      body: {
        options: [
          { id: 'a', label: 'Pay the rent first', because: 'It feels more urgent.', recommended: true },
          { id: 'b', label: 'Pay the accountant first', because: 'Later, {{ref:obligations#8}}.' },
        ],
      },
    }),
  );
  const cleared = await slash.propose('what is still open', OWNER);
  const second = cleared.ok ? (cleared.value.body['options'] as Record<string, unknown>[]) : [];
  assert.equal(second[0]?.['recommended'], false);
  assert.equal(cleared.ok && cleared.value.filed, 'SG2');
});

test('a rowset row with nothing behind it is dropped and counted, and the rest are filed with their sources beside them', async () => {
  const { slash, record, inference } = build();
  inference.say(PREDICATE);
  inference.say(
    JSON.stringify({
      text: 'Two rows follow from {{ref:obligations#7}}.',
      body_kind: 'rowset',
      body: {
        register: 'tasks',
        rows: [
          { fields: { what: 'Chase the rent' }, from: ['obligations#7'] },
          { fields: { what: 'Call the bank' }, from: ['obligations#99'] },
        ],
      },
      flagged: false,
    }),
  );
  const out = await slash.propose('what should I do', OWNER);

  assert.equal(out.ok, true);
  const body = record.filed[0]?.body as { rows: Record<string, unknown>[]; from: string[][]; dropped: number };
  /* THE ROW IS ITS FIELDS AND NOTHING ELSE, so accepting it writes no citation into the record. */
  assert.deepEqual(body.rows, [{ what: 'Chase the rent' }]);
  assert.deepEqual(body.from, [['obligations#7']]);
  assert.equal(body.dropped, 1);
});

test('a rowset row that carries a brace in a field is dropped, because accepting it would write the brace', async () => {
  const { slash, record, inference } = build();
  inference.say(PREDICATE);
  inference.say(
    JSON.stringify({
      text: 'Two rows follow from {{ref:obligations#7}}.',
      body_kind: 'rowset',
      body: {
        register: 'tasks',
        rows: [
          { fields: { what: 'Chase {{ref:obligations#7}}' }, from: ['obligations#7'] },
          { fields: { what: 'Chase the accountant' }, from: ['{{ref:obligations#8}}'] },
        ],
      },
      flagged: false,
    }),
  );
  const out = await slash.propose('what should I do', OWNER);

  assert.equal(out.ok, true);
  const body = record.filed[0]?.body as { rows: Record<string, unknown>[]; from: string[][]; dropped: number };
  assert.deepEqual(body.rows, [{ what: 'Chase the accountant' }]);
  assert.deepEqual(body.from, [['obligations#8']]);
  assert.equal(body.dropped, 1);
});

test('a digit the model typed refuses the whole proposal, and nothing is filed', async () => {
  const { slash, record, inference, calls } = build();
  inference.say(PREDICATE);
  inference.say(options({ text: 'There are 14 rows open.' }));
  const out = await slash.propose('what is still open', OWNER);

  assert.equal(codeOf(out), 'PROPOSAL_UNCITED');
  assert.equal(record.filed.length, 0);
  assert.equal(calls()[1]?.status, 'refused');
  assert.equal(calls()[1]?.code, 'PROPOSAL_UNCITED');
});

test('a body with no citation at all is not filed', async () => {
  const { slash, record, inference } = build();
  inference.say(PREDICATE);
  inference.say(
    options({
      text: 'Both of these are worth doing.',
      body: {
        options: [
          { id: 'a', label: 'Do it', because: 'It is worth doing.' },
          { id: 'b', label: 'Wait', because: 'Nothing presses.' },
        ],
      },
    }),
  );
  const out = await slash.propose('what is still open', OWNER);

  assert.equal(codeOf(out), 'PROPOSAL_NO_ROWS');
  assert.equal(record.filed.length, 0);
});

test('an option with no id is refused by its own schema, and nothing is filed', async () => {
  const { slash, record, inference, calls } = build();
  inference.say(PREDICATE);
  inference.say(
    options({
      body: {
        options: [
          { label: 'Pay the rent first', because: 'It is the larger, {{ref:obligations#7}}.' },
          { id: 'b', label: 'Pay the accountant first', because: 'It is due later.' },
        ],
      },
    }),
  );
  const out = await slash.propose('what is still open', OWNER);

  assert.equal(codeOf(out), 'PROPOSAL_SCHEMA');
  assert.equal(record.filed.length, 0);
  assert.equal(calls().find((c) => c.kind === 'propose')?.code, 'PROPOSAL_SCHEMA');
});

test('the model is named on every answer, and the fold travels with it', async () => {
  const { slash, inference } = build();
  inference.say(PREDICATE);
  inference.say(options());
  const out = await slash.propose('what is still open', OWNER);
  assert.equal(out.ok && out.value.model, 'glm-5.3-flash');
  assert.deepEqual(out.ok ? out.value.read.at(-1) : null, { register: 'grant', rows: 0, predicate: 'refused' });
});

test('tier b answers on the adapter the host handed in, and bills no neurons', async () => {
  const { slash, inference, calls } = build();
  slash.configure({ tier: 'b', model: 'claude-x', grant_id: 'g_01JRQ8Z0X1Y2Z3A4B5C6D7E8F9' }, OWNER);

  inference.say(PREDICATE);
  const first = await slash.read('what is still open', OWNER);
  const askId = first.ok ? first.value.ask_id : '';

  const byok = canned();
  byok.say(options(), { in: 3000, out: 400 });
  const out = await slash.propose('what is still open', OWNER, byok, askId);

  assert.equal(out.ok, true);
  assert.equal(byok.seen.length, 1);
  assert.equal(byok.seen[0]?.model, 'claude-x');
  /* The included model drafted the predicate on pass 1 and was not asked again on pass 2. */
  assert.equal(inference.seen.length, 1);
  const propose = calls().find((c) => c.kind === 'propose');
  assert.equal(propose?.tier, 'b');
  assert.equal(propose?.neurons, 0);
});

test('tier b with no open key is a sentence about the vault, and costs no call', async () => {
  const { slash, inference } = build();
  slash.configure({ tier: 'b', model: 'claude-x', grant_id: 'g_01JRQ8Z0X1Y2Z3A4B5C6D7E8F9' }, OWNER);
  inference.say(PREDICATE);
  const first = await slash.read('what is still open', OWNER);
  const askId = first.ok ? first.value.ask_id : '';

  const out = await slash.propose('what is still open', OWNER, undefined, askId);
  assert.equal(codeOf(out), 'FORBIDDEN');
  assert.equal(inference.seen.length, 1);
});

test('tier a bills neurons from the table and the provider usage', async () => {
  const { slash, inference, calls } = build();
  inference.say(PREDICATE, { in: 900, out: 40 });
  inference.say(options(), { in: 5000, out: 300 });
  await slash.propose('what is still open', OWNER);
  const propose = calls().find((c) => c.kind === 'propose');
  /* 5000 × 13,636 / 1e6 + 300 × 45,455 / 1e6, rounded: the `glm-5.3-flash` row of `08 §6`. */
  assert.equal(propose?.neurons, Math.round((5000 * 13636) / 1e6 + (300 * 45455) / 1e6));
});

test('no call this package makes carries a tool, and every one carries a schema', async () => {
  const { slash, inference } = build();
  inference.say(PREDICATE);
  inference.say(options());
  await slash.propose('what is still open', OWNER);

  assert.equal(inference.seen.length, 2);
  for (const call of inference.seen) {
    assert.equal(Object.hasOwn(call, 'tools'), false);
    assert.equal(typeof call.jsonSchema, 'object');
    assert.equal(call.messages[0]?.role, 'system');
    assert.equal(call.messages.length, 2);
  }
});

test('the rows the model reads are printed one to a line, with money spelled out', async () => {
  const { slash, inference } = build();
  inference.say(PREDICATE);
  inference.say(options());
  await slash.propose('what is still open', OWNER);
  const prompt = inference.seen[1]?.messages[1]?.content ?? '';
  assert.match(prompt, /obligations#7 \| Office rent \| what: Office rent · amount: EGP 5,005\.00 · due: 2026-11-04/u);
  /* AND THE OPEN COUNT IS STILL PRINTED WHERE THE PROJECTION CARRIED ONE. `indexLines` learned to omit the clause for a host
     bridging `project` over `list`, which cannot count non-terminal rows; nothing asserted the other half, so omitting it
     always left all 63 of this package's tests green. The record's own projection does know the figure. */
  assert.match(prompt, /obligations \(3 rows, 2 open\): what:text · amount:money · due:day · state:enum/u);
});

test('a projection too big for the prompt loses rows from the end, and the fold says so', async () => {
  const many: Projection['rows'] = [];
  for (let i = 1; i <= 400; i++)
    many.push({
      id: String(i),
      register: 'obligations',
      seq: i,
      spoken: `obligations#${i}`,
      summary: `A line of text long enough to matter, number ${i}, ${'x'.repeat(120)}`,
      fields: { what: `${'y'.repeat(120)}` },
    });
  const { slash, inference } = build(INDEX, many);
  inference.say(PREDICATE);
  inference.say(options());
  const out = await slash.propose('what is still open', OWNER);

  const prompt = inference.seen[1]?.messages[1]?.content ?? '';
  assert.equal(Math.ceil(new TextEncoder().encode(prompt).length / 3) < 12000, true);
  const kept = out.ok ? (out.value.read[0]?.rows ?? 0) : 0;
  assert.equal(kept > 0, true);
  assert.equal(kept < 400, true);
});

/**
 * The tool list is in every turn of every session, so it has a ceiling, and this is where it is
 * measured. `10-MCP` §4, `44-SPEC-MCP` §7.
 *
 * COUNTED THE WAY 44 §5.8 COUNTS. `tokenBudget` is its six-class run estimator, copied here unchanged,
 * run over the `tools/list` result exactly as `handle` returns it and serialised as a transport sends
 * it: compact JSON. That result carries the instructions too, so they are inside the figure, as they
 * are inside the turn.
 *
 * 2,600 AND NOT 44's 1,800. That ceiling was set for eight tools; the agent path needs fourteen,
 * because `context`, `handoff` and `meet` are what an agent does every session. A test and not a
 * gate, on purpose.
 *
 * AND THE CEILING IS THE ARBITER, WHICH IS WHY THE HEADROOM IS SMALL. Doc 44 §7 records 2,311 with
 * 289 to spare; this run measured 2,555 before `activity` was added, so the spare was 45 and the
 * doc's figure is stale. `activity` cost 117, so it was paid for out of four descriptions that
 * were saying something the schema beside them, or the instructions above them, already said. The
 * figure now is 2,565. A tool that cannot be paid for is a tool that does not go in.
 *
 * AND THE INSTRUCTIONS ARE STILL INSIDE THE FIGURE, THOUGH `tools/list` NO LONGER CARRIES THEM. They are sent once a
 * connection now, in `initialize` (`rpc.ts`), and a client puts them in every turn all the same, so the figure is the
 * list and the instructions added together. The titles every tool now carries, and the hints said on every write, were
 * paid for out of the input schemas: `propose.body`'s example lost its rowset `register`, `triage`'s three arguments that
 * only go with another lost their sentences, and `additionalProperties: false` went from all sixteen. It measured
 * 2,738 of 2,760 after, and 2,748 once `activity` took `everything`, which asks for the record's own bookkeeping back.
 *
 * 2,760, RAISED ONCE FOR `triage`, AND IT NEVER MOVES AGAIN. The list measured
 * 2,544 by this estimator before it, 56 under 2,600, and the tool could not be paid for out of descriptions three passes
 * had already cut: an agent given the inbox reach files or sets aside an arrival, which is a write of its own and rides
 * on no other tool's answer. Counted by hand with this estimator over the tool as `tools/list` serialises it, by
 * `44-SPEC-MCP` §5.8's rule: `triage` adds 172, and `log`'s `spoken` made optional, with the clause saying so, adds 4,
 * so the list is 2,720 of 2,760; the run's diagnostic below is the figure that holds. Everything added after it, in any
 * workflow, is paid out of the same 2,760 by cutting words elsewhere.
 *
 * `meet`'s five new parts (kind, keys, org, domain, role) and the instructions' line saying whom to meet were paid that
 * way: out of `meet`'s own examples, four descriptions that said a thing twice, and the opening line's list of what a
 * record holds. It measured 2,755 after, and 2,759 once `keys` said its items are text (Gemini refuses an array schema
 * without them), paid for by `handoff`'s `state` dropping a `type` its enum already says.
 *
 * `undo` AND THE HINTS WERE PAID FOR BY CUTTING COPY, AND THE CEILING STAYED AT 2,760 (the night of 19 to 20 October). `undo`
 * is the seventeenth tool and measured 123, the way back that every write's receipt now offers; and every read now says
 * `readOnlyHint` and `openWorldHint`, which a directory asks of each tool, 13 on each of nine reads. Together they took the
 * list and the instructions from 2,759 to 3,097. The owner's rule is that a budget is never raised, so the difference was
 * cut out of descriptions, schema property descriptions, the `format` argument listed on nine reads (the instructions
 * name it once), and the instructions' own words. No rule an agent follows went with them. The figure is measured below.
 *
 * `instructions` AND `context`'s ARGUMENTS WERE PAID FOR BY FOLDING, AND THE CEILING STAYED AT 2,760 (21 October, agents
 * and MCP plan §6.1, 12a). What he tells an agent from the app is a tool of its own (149 tokens as first drawn), and
 * `context` took `task` and `project`, `get` a name and `history`, `record_index` a register, `handoff` a task to
 * start and one to close: 2,880 with all of it. `schema` and `history` went into `record_index` and `get`, unlisted and
 * callable until `FOLDED_UNTIL`; arguments a bridge sends and no agent chooses (`context`'s `since` and `depth`,
 * `activity`'s `everything`, `instructions`' `seen` and `how`) are taken and not listed (`quiet`); and eleven
 * descriptions and two lines of the instructions said what they said in fewer words. It measured 2,739 after.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { handle, type Reply } from '../src/rpc.ts';
import { INSTRUCTIONS } from '../src/instructions.ts';
import { FOLDED, TEMPLATES, TOOLS, tools } from '../src/index.ts';
import { stub } from './stub.ts';
/* `44-SPEC-MCP` §5.8, verbatim: a run heuristic, biased above o200k_base, never below it on its calibration set. */
import { tokenBudget } from './tokens.ts';


const CEILING = 2_760;

const listed = async () => {
  const { surface } = stub();
  const reply = (await handle({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, surface, { who: 'agent' })) as Reply;
  assert.ok('result' in reply);
  /* `resultType` is the envelope a client reads and drops, so it is not part of what a turn pays for. */
  const { resultType: _envelope, ...paid } = reply.result as Record<string, unknown>;
  return paid;
};

test('the estimator is the one 44 §5.8 specifies, on its own worked examples', () => {
  /* 9 and not the 8 that 44's inline note says: the same section counts `_` as punctuation on
     purpose, so REGISTER is 4, the underscore 1 and UNKNOWN 4. The rule is kept and the note is wrong. */
  assert.equal(tokenBudget('REGISTER_UNKNOWN'), 9);
  assert.equal(tokenBudget('obligations'), 3);
  assert.equal(tokenBudget('3600000'), 3);
  assert.equal(tokenBudget(':{'), 1);
});

test(`tools/list and the instructions together are at or under ${CEILING} tokens`, async (t) => {
  const text = JSON.stringify(await listed());
  const tokens = tokenBudget(text) + tokenBudget(INSTRUCTIONS);
  t.diagnostic(`tools/list: ${tokenBudget(text)} tokens, ${text.length} bytes; instructions ${tokenBudget(INSTRUCTIONS)}; together ${tokens}`);
  assert.ok(tokens <= CEILING, `the tool list and the instructions are ${tokens} tokens, over the ${CEILING} every turn pays`);
});

test('THE FOLDED TOOLS ARE NOT LISTED, so they cost nothing, and every quiet argument is one no listed schema names', async () => {
  const names = ((await listed()) as { tools: { name: string }[] }).tools.map((t) => t.name);
  for (const folded of FOLDED) assert.ok(!names.includes(folded.name), `${folded.name} is listed again`);
  for (const tool of TOOLS) {
    const props = Object.keys((tool.input as { properties?: object }).properties ?? {});
    for (const q of tool.quiet ?? []) assert.ok(!props.includes(q), `${tool.name} lists ${q} and calls it quiet`);
  }
});

test('THE INSTRUCTIONS GO OUT ONCE A CONNECTION, in initialize, and not again with every tools/list', async () => {
  const result = (await listed()) as Record<string, unknown>;
  assert.equal(result.instructions, undefined, 'tools/list carried the instructions a second time');
  const { surface } = stub();
  const init = (await handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25' } }, surface, { who: 'agent' })) as Reply;
  assert.ok('result' in init);
  assert.equal((init.result as { instructions: string }).instructions, INSTRUCTIONS);
});

/**
 * THE FIRST 512 CHARACTERS STAND ALONE. Codex and ChatGPT treat only those as the part of a server's instructions that is
 * always read, and the ten rules this replaced put "an agent never decides" at character 564. So the three rules that
 * matter on every call are held inside them, each by the words that carry it.
 */
test('the first 512 characters of the instructions hold the three rules every call needs', () => {
  const first = INSTRUCTIONS.slice(0, 512);
  assert.match(first, /Call context first/, 'calling context first is not in the part every client reads');
  assert.match(first, /Suggest, and let the person decide in BrainDog/, 'suggesting and letting the person decide is not in it');
  assert.match(first, /propose/);
  assert.match(first, /short and plain, for a phone/, 'writing short and plain for a phone is not in it');
  /* AND IT ENDS ON A RULE, NOT HALFWAY THROUGH ONE: the third rule's line is whole inside the 512. */
  const third = INSTRUCTIONS.split('\n').find((l) => l.startsWith('3. ')) ?? '';
  assert.ok(INSTRUCTIONS.indexOf(third) + third.length <= 512, 'the third rule runs past character 512');
});

test('EVERY TOOL HAS A TITLE A PERSON READS, in plain words that name none of the system\'s own', () => {
  for (const tool of TOOLS) {
    assert.ok(tool.title.length >= 8 && tool.title.length <= 40, `${tool.name}'s title is ${JSON.stringify(tool.title)}`);
    assert.match(tool.title, /^[A-Z][a-z ]+$/u, `${tool.name}'s title is not plain words`);
    assert.doesNotMatch(tool.title, /\b(?:row|rows|list item|entity|register|record_index|propose)\b/iu, `${tool.name}'s title says the system's word`);
  }
});

/* 400 AND NOT 44's 300, which was set for eight shorter lines. The ten rules of §1.4 measure 352 here,
   which is the "about 270" the plan counted with o200k_base once this estimator's stated bias is
   allowed for. A ceiling of their own, so they cannot grow by quietly spending the tools' share. */
test('the instructions are at or under 400 tokens, and each tool description under 200', () => {
  assert.ok(tokenBudget(INSTRUCTIONS) <= 400, `the instructions are ${tokenBudget(INSTRUCTIONS)} tokens`);
  for (const tool of TOOLS) {
    const tokens = tokenBudget(tool.description);
    assert.ok(tokens < 200, `${tool.name} is ${tokens} tokens, and it is in every turn`);
  }
});

test('EVERY WORD AN AGENT READS IS PLAIN ASCII, with no dash standing in for a sentence break', async () => {
  /* The estimator under-counts a non-ASCII code point, and an em dash is the one that creeps in.
     Everything a client shows a model is checked: the tool list, the instructions, the resource
     descriptions and the templates. */
  const resources = await tools(stub().surface).resources({ who: 'agent' });
  for (const [what, text] of [
    ['tools/list', JSON.stringify(await listed())],
    ['resources', JSON.stringify(resources)],
    ['templates', JSON.stringify(TEMPLATES)],
  ] as const)
    assert.match(text, /^[\x20-\x7E]*$/, `${what} carries a character outside plain ASCII`);
  assert.match(INSTRUCTIONS, /^[\x20-\x7E\n]*$/);
});

test('money is said where it is written, with its currency\'s own decimals, not a hundred for every code', async () => {
  /* "Divide by 100" read JPY 129,900 as JPY 1,299 and KWD 1.500 as KWD 15.00, for every agent. The rule moved from the
     instructions to `create`'s fields, which `update`'s patch points at, when the instructions were cut to three rules. */
  const text = JSON.stringify(await listed());
  assert.doesNotMatch(`${INSTRUCTIONS}${text}`, /divide by 100/i);
  const fields = (TOOLS.find((t) => t.name === 'create')?.input as { properties: { fields: { description: string } } }).properties.fields.description;
  assert.match(fields, /minor units/);
  assert.match(fields, /JPY 0/);
  assert.match(fields, /KWD 3/);
  assert.match(String((TOOLS.find((t) => t.name === 'update')?.input as { properties: { patch: { description: string } } }).properties.patch.description), /As create takes fields/);
});

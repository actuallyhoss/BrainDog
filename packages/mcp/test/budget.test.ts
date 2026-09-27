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
 * because `context`, `handoff` and `meet` are what an agent does every session
 * (`loop/research-agent-path.md` §1.5). A test and not a gate, on purpose.
 *
 * AND THE CEILING IS THE ARBITER, WHICH IS WHY THE HEADROOM IS SMALL. Doc 44 §7 records 2,311 with
 * 289 to spare; this run measured 2,555 before `activity` was added, so the spare was 45 and the
 * doc's figure is stale. `activity` cost 117, so it was paid for out of four descriptions that
 * were saying something the schema beside them, or the instructions above them, already said. The
 * figure now is 2,565. A tool that cannot be paid for is a tool that does not go in.
 *
 * 2,760, RAISED ONCE FOR `triage`, AND IT NEVER MOVES AGAIN (`loop/finish/contracts.md` §6.1, X2). The list measured
 * 2,544 by this estimator before it, 56 under 2,600, and the tool could not be paid for out of descriptions three passes
 * had already cut: an agent given the inbox reach files or sets aside an arrival, which is a write of its own and rides
 * on no other tool's answer. Counted by hand with this estimator over the tool as `tools/list` serialises it, by
 * `44-SPEC-MCP` §5.8's rule: `triage` adds 172, and `log`'s `spoken` made optional, with the clause saying so, adds 4,
 * so the list is 2,720 of 2,760; the run's diagnostic below is the figure that holds. Everything added after it, in any
 * workflow, is paid out of the same 2,760 by cutting words elsewhere.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { handle, type Reply } from '../src/rpc.ts';
import { INSTRUCTIONS } from '../src/instructions.ts';
import { TEMPLATES, TOOLS, tools } from '../src/index.ts';
import { stub } from './stub.ts';

/** `44-SPEC-MCP` §5.8, verbatim: a run heuristic, biased above o200k_base, never below it on its calibration set. */
const RUN = /[A-Z]{2,}|[A-Za-z]+|[0-9]+|[!-\/:-@\[-`{-~]+|\n+|[^\x00-\x7F]/gu;
function tokenBudget(text: string): number {
  let n = 0;
  for (const [s] of text.matchAll(RUN)) {
    const c = s.charCodeAt(0);
    if (/^[A-Z]{2,}$/.test(s)) n += Math.ceil(s.length / 2);
    else if (/^[A-Za-z]/.test(s)) n += Math.ceil(s.length / 5);
    else if (c >= 48 && c <= 57) n += Math.ceil(s.length / 3);
    else if (s[0] === '\n') n += 1;
    else if (c > 127) n += 1;
    else n += Math.ceil(s.length / 3);
  }
  return n;
}

const CEILING = 2_760;

const listed = async () => {
  const { surface } = stub();
  const reply = (await handle({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, surface, { who: 'agent' })) as Reply;
  assert.ok('result' in reply);
  return reply.result;
};

test('the estimator is the one 44 §5.8 specifies, on its own worked examples', () => {
  /* 9 and not the 8 that 44's inline note says: the same section counts `_` as punctuation on
     purpose, so REGISTER is 4, the underscore 1 and UNKNOWN 4. The rule is kept and the note is wrong. */
  assert.equal(tokenBudget('REGISTER_UNKNOWN'), 9);
  assert.equal(tokenBudget('obligations'), 3);
  assert.equal(tokenBudget('3600000'), 3);
  assert.equal(tokenBudget(':{'), 1);
});

test(`tools/list, instructions included, is at or under ${CEILING} tokens`, async (t) => {
  const text = JSON.stringify(await listed());
  const tokens = tokenBudget(text);
  t.diagnostic(`tools/list: ${tokens} tokens, ${text.length} bytes; instructions ${tokenBudget(INSTRUCTIONS)}`);
  assert.ok(tokens <= CEILING, `the tool list is ${tokens} tokens, over the ${CEILING} every turn pays`);
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

test('the instructions give money its currency\'s own decimals, not a hundred for every code', () => {
  /* "Divide by 100" read JPY 129,900 as JPY 1,299 and KWD 1.500 as KWD 15.00, for every agent. */
  assert.doesNotMatch(INSTRUCTIONS, /divide by 100/i);
  assert.match(INSTRUCTIONS, /JPY 0/);
  assert.match(INSTRUCTIONS, /KWD 3/);
});

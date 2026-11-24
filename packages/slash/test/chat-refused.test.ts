/**
 * A refused call is mended once and never said (`chat.ts`), and the list tool takes the filter shape a model writes
 * (`whereShape` in `packages/mcp/src/slash-tools.ts`).
 *
 * MEASURED 24 NOVEMBER (the Slash audit, finding 8): asked "what tasks are still open there?" after "how is Kiln going?",
 * the model wrote `where: {"thing": {"is": ...}}`, the record refused it FIELD_UNKNOWN twice, and Slash told the person
 * "the search tool is having trouble filtering by project" though the project had open tasks.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { voicesFault } from '../src/chat.ts';
import { createSlash, type ChatEvent, type ChatTools, type Inference } from '../src/index.ts';
import { fakeRecord, fixedClock, NOW, OWNER, openSqlite } from './double.ts';
import { whereShape } from '../../mcp/src/slash-tools.ts';

/** A model that says each of `steps` in turn and keeps what it was asked. */
const scripted = (steps: readonly unknown[]): Inference & { asked: string[] } => {
  const asked: string[] = [];
  let n = 0;
  return {
    asked,
    complete: async (call) => {
      asked.push(call.messages.map((m) => m.content).join('\n'));
      return { text: JSON.stringify(steps[Math.min(n++, steps.length - 1)]), usage: { in: 10, out: 10 } };
    },
  };
};

const refusing: ChatTools = {
  list: [{ name: 'list', args: 'list, where?', about: 'Rows of one list' }],
  call: async () => ({ text: 'Refused, FIELD_UNKNOWN at field: A leaf needs a field, and undefined is not one.', refused: true }),
  apply: async () => ({ ok: true, value: { receipt: 'Done.' } }),
};

const turn = async (inference: Inference, tools: ChatTools) => {
  const slash = createSlash({ sql: openSqlite(), clock: fixedClock(NOW), inference, record: fakeRecord() });
  const events: ChatEvent[] = [];
  await slash.chat({ message: 'What tasks are still open there?' }, OWNER, tools, (e) => void events.push(e));
  return events.filter((e): e is ChatEvent & { type: 'delta' } => e.type === 'delta').map((e) => e.text).join('');
};

test('A REFUSED CALL GOES BACK ONCE TO BE MENDED, then to be answered around, and its fault is never said', async () => {
  const call = { tool: 'list', args: { list: 'tasks', where: { thing: { is: 'Kiln' } } } };
  const model = scripted([
    { calls: [call], say: '' },
    { calls: [call], say: '' },
    { calls: [], say: 'The search tool is having trouble filtering by project. Kiln has a type tester for the specimen page.' },
  ]);
  const said = await turn(model, refusing);
  assert.match(model.asked[1]!, /That call was refused, in the words above\. Mend it and make it once more\./u);
  assert.match(model.asked[2]!, /Refused again, so do not call list again\. Answer from what the other calls found/u);
  assert.doesNotMatch(said, /trouble|tool|FIELD_UNKNOWN/iu, said);
  assert.match(said, /Kiln has a type tester/u);
});

test('AN ANSWER THAT IS ONLY A TOOL\'S FAULT IS SAID AS NOTHING FOUND, plainly', async () => {
  const said = await turn(scripted([{ calls: [], say: 'Sorry, the lookup failed with FIELD_UNKNOWN.' }]), refusing);
  assert.equal(said, "I couldn't find that in the record.");
});

test('A FAULT IS TOLD FROM AN ORDINARY SENTENCE', () => {
  for (const s of ['The search tool is having trouble filtering by project.', 'I had trouble with the filter.', 'It answered VALUE_MALFORMED.']) assert.ok(voicesFault(s), s);
  for (const s of ['Kiln has three open tasks.', 'The invoice payment failed last week.', '{{ref:tasks#3}} is late.', 'Search found nothing for Priya.']) assert.ok(!voicesFault(s), s);
});

test('THE FILTER IN EITHER SHAPE: a map of field to test or to value is the record\'s leaf, several are all of them', () => {
  assert.deepEqual(whereShape({ thing: { is: 'Kiln' } }), { field: 'thing', is: 'Kiln' });
  assert.deepEqual(whereShape({ state: 'open', thing: 'things#1' }), { all: [{ field: 'state', is: 'open' }, { field: 'thing', is: 'things#1' }] });
  assert.deepEqual(whereShape({ state: ['open', 'later'] }), { field: 'state', in: ['open', 'later'] });
  assert.deepEqual(whereShape({ all: [{ thing: { is: 'Kiln' } }, { field: 'state', is: 'open' }] }), { all: [{ field: 'thing', is: 'Kiln' }, { field: 'state', is: 'open' }] });
  assert.deepEqual(whereShape({ field: 'state', is: 'open' }), { field: 'state', is: 'open' }, 'the record\'s own shape is left as it is');
  assert.deepEqual(whereShape([{ due: { before: 'today' } }]), { field: 'due', before: 'today' });
});

/**
 * Deep that declines or fails hands the turn to Slash's own model, with a plain note (`chat.ts`, `deepFellBack`).
 *
 * MEASURED 24 NOVEMBER (the Slash audit, finding 14): a decline ended the turn as "Deep declined to answer that one." with
 * no answer at all, though the included model could answer it.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { deepFellBack } from '../src/chat.ts';
import { createSlash, type ChatEvent, type ChatTools, type DeepInference, type Inference } from '../src/index.ts';
import { fakeRecord, fixedClock, NOW, OWNER, openSqlite } from './double.ts';

const tools: ChatTools = { list: [], call: async () => ({ text: '' }), apply: async () => ({ ok: true, value: { receipt: 'Done.' } }) };
const quick = (say: string): Inference & { asked: number } => {
  const m = { asked: 0, complete: async () => ((m.asked += 1), { text: JSON.stringify({ calls: [], say }), usage: { in: 10, out: 10 } }) };
  return m;
};
const usage = { in: 10, out: 10, cacheRead: 0, cacheWrite: 0 };
const declining: DeepInference = { turn: async () => ({ content: [], stop: 'refusal', usage, model: 'claude-sonnet-5-5' }) };
const throwing = (refused: number): DeepInference => ({
  turn: async () => {
    throw Object.assign(new Error('Anthropic answered with an error.'), { refused });
  },
});

const turn = async (inference: Inference, brain: DeepInference) => {
  const slash = createSlash({ sql: openSqlite(), clock: fixedClock(NOW), inference, record: fakeRecord() });
  const events: ChatEvent[] = [];
  await slash.chat({ message: 'How is Kiln going?', mode: 'deep' }, OWNER, tools, (e) => void events.push(e), undefined, { inference: brain });
  const said = events.filter((e): e is ChatEvent & { type: 'delta' } => e.type === 'delta').map((e) => e.text).join('');
  const errors = events.filter((e): e is ChatEvent & { type: 'error' } => e.type === 'error').map((e) => e.text);
  return { said, errors, events };
};

test('DEEP THAT DECLINES IS ANSWERED BY SLASH\'S OWN MODEL, with a plain note and no error', async () => {
  const model = quick('Kiln has two tasks open and the specimen page is next.');
  const { said, errors } = await turn(model, declining);
  assert.equal(model.asked, 1);
  assert.equal(said, "Kiln has two tasks open and the specimen page is next. (Deep declined this one, so Slash's own model answered it.)");
  assert.deepEqual(errors, []);
});

test('DEEP WHOSE CALL THREW IS ANSWERED THE SAME WAY, and a refused key still says what to mend', async () => {
  const down = await turn(quick('Kiln is on track.'), throwing(529));
  assert.equal(down.said, "Kiln is on track. (Deep couldn't answer just now, so Slash's own model answered this one.)");
  const key = await turn(quick('Kiln is on track.'), throwing(401));
  assert.match(key.said, /Anthropic refused your key for Deep, so Slash's own model answered this one\. Check the key in Keys\.\)$/u);
});

test('WHERE SLASH\'S OWN MODEL FAILS TOO, both are said as the error', async () => {
  const broken: Inference = { complete: async () => ({ text: 'not json', usage: { in: 1, out: 1 } }) };
  const { errors } = await turn(broken, declining);
  assert.equal(errors.length, 1);
  assert.match(errors[0]!, /^Deep declined to answer that one\. Slash's model /u);
});

test('THE NOTE NAMES WHAT DEEP DID', () => {
  assert.match(deepFellBack({ refused: true }), /^Deep declined this one/u);
  assert.match(deepFellBack({ thrown: new Error('x') }), /^Deep couldn't answer just now/u);
});

/**
 * The grammar is read once per tab, and a record with no such read says so in one line and offers nothing.
 *
 * Each case forgets what the last one held, as a new tab would.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OLDER, UNREAD, forgetGrammar, grammarNow, grammarOf, grammarState, held, loadGrammar, type GrammarState } from './grammar.ts';

const GRAMMAR = {
  triggers: [{ id: 'written', args: [{ name: 'register', type: 'text', required: true, from: 'list' }] }],
  steps: [
    { verb: 'notify', group: 'action', row: false, once: true, args: [{ name: 'say', type: 'text', required: true }] },
    { verb: 'meet', group: 'flow', row: false, once: false, args: [{ name: 'where', type: 'text', required: true }] },
  ],
  ceilings: { steps: 50, depth: 3, runsPerDay: 1000, vars: 64 },
};

test('A GRAMMAR IS READ ONCE FOR THE TAB, however many cards and menus ask for it at once', async () => {
  forgetGrammar();
  let asked = 0;
  const call = async (name: string) => {
    asked += 1;
    assert.equal(name, 'flowGrammar');
    return { ok: true, value: GRAMMAR };
  };
  const [a, b] = await Promise.all([loadGrammar(call), loadGrammar(call)]);
  await loadGrammar(call);
  assert.equal(asked, 1);
  assert.equal(a.state, 'ready');
  assert.equal(b, a);
  assert.deepEqual(held()?.steps.map((s) => s.verb), ['notify', 'meet']);
  assert.equal(held()?.ceilings.depth, 3);
});

test('A RECORD WITH NO SUCH METHOD GIVES THE ONE LINE, holds no grammar, and is not asked again', async () => {
  forgetGrammar();
  let asked = 0;
  const call = async () => {
    asked += 1;
    return { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'There is no method called flowGrammar.' } };
  };
  const out = await loadGrammar(call);
  assert.deepEqual(out, { state: 'older', say: OLDER });
  assert.equal(OLDER, 'This BrainDog is older than the app, so its automations open read only.');
  assert.equal(held(), null);
  await loadGrammar(call);
  assert.equal(asked, 1, 'the build cannot change under an open tab');
});

test('A HOST BUILT OVER A RECORD WITHOUT THE METHOD, or a client that throws for it, is the same older record', async () => {
  forgetGrammar();
  assert.equal((await loadGrammar(async () => ({ ok: false, refusal: { code: 'NOT_IN_THIS_BUILD', at: 'flowGrammar', fix: 'No.' } }))).state, 'older');
  forgetGrammar();
  const thrown = Object.assign(new Error('This BrainDog has no call named flowGrammar.'), { name: 'NO_SUCH_CALL' });
  assert.equal(
    (
      await loadGrammar(async () => {
        throw thrown;
      })
    ).state,
    'older',
  );
});

test('A READ THAT FAILED IS ITS OWN LINE, and is asked again on the next open', async () => {
  forgetGrammar();
  let asked = 0;
  const down = async () => {
    asked += 1;
    return { ok: false, refusal: { code: 'UNREACHABLE', fix: 'BrainDog could not be reached.' } };
  };
  assert.deepEqual(await loadGrammar(down), { state: 'unread', say: UNREAD });
  assert.equal((await loadGrammar(async () => ({ ok: true, value: GRAMMAR }))).state, 'ready');
  assert.equal(asked, 1);
});

test('AN ANSWER THAT IS NOT A GRAMMAR IS NOT HELD as an empty one', () => {
  assert.equal(grammarOf({ steps: [], triggers: [], ceilings: GRAMMAR.ceilings }), null);
  assert.equal(grammarOf({ steps: GRAMMAR.steps, triggers: [] }), null);
  assert.equal(grammarOf('<html>'), null);
  assert.deepEqual(grammarOf(GRAMMAR)?.triggers[0]?.args[0], { name: 'register', type: 'text', required: true, from: 'list' });
});

test('THE STORE SAYS WHERE THE READ STANDS at once and on each change', async () => {
  forgetGrammar();
  const seen: GrammarState['state'][] = [];
  const stop = grammarState.subscribe((s) => seen.push(s.state));
  await loadGrammar(async () => ({ ok: true, value: GRAMMAR }));
  stop();
  assert.deepEqual(seen, ['loading', 'ready']);
  assert.equal(grammarNow().state, 'ready');
});

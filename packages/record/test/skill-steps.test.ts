/**
 * A skill's steps come from what three runs alike wrote, each step quoted from one of them (`skill-steps.ts`).
 *
 * WHAT THE OWNER'S RECORD SHOWED: the one skill Slash offered said "Its steps are not written yet.", so what was offered
 * was a name. These hold the rule that replaced it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { stepsFrom, type Handoff } from '../src/skill-steps.ts';

const THREE: Handoff[] = [
  { run: 'S4', text: 'Typechecked with `pnpm --filter @kiln/books exec tsc --noEmit` first.\nThen `node --test test/ledger.test.ts` went green.' },
  { run: 'S7', text: 'Ran `pnpm --filter @kiln/books exec tsc --noEmit`. After that, `node --test test/ledger.test.ts` passed.' },
  { run: 'S9', text: '- `pnpm --filter @kiln/books exec tsc --noEmit`\n- `node --test test/ledger.test.ts`\nLeft the release notes.' },
];

test('THREE RUNS WITH THE SAME TWO COMMANDS give two steps, in the order first said, each quoted from the first run', () => {
  assert.deepEqual(stepsFrom(THREE), [
    'Typechecked with `pnpm --filter @kiln/books exec tsc --noEmit` first.',
    'Then `node --test test/ledger.test.ts` went green.',
  ]);
});

test('TWO RUNS ALIKE ARE NO SKILL: the same two commands in two handoffs answer null', () => {
  assert.equal(stepsFrom(THREE.slice(0, 2)), null);
  assert.equal(stepsFrom([]), null);
});

test('ONE RUN WRITING THREE HANDOFFS IS ONE RUN, and counts once', () => {
  assert.equal(stepsFrom(THREE.map((h) => ({ ...h, run: 'S4' }))), null);
});

test('A SENTENCE OR A BARE PATH SAID BY THREE RUNS IS A STEP; a remark of two words is not', () => {
  const said: Handoff[] = ['S1', 'S2', 'S3'].map((run, i) => ({
    run,
    text: `Done. Read docs/kiln/ledger.md before starting.\nCheck the totals against the printed statement.${i === 0 ? ' Odd one out here.' : ''}`,
  }));
  assert.deepEqual(stepsFrom(said), ['Read docs/kiln/ledger.md before starting.', 'Check the totals against the printed statement.']);
});

test('AT MOST `most` STEPS, and a quote holding what reads as a key is never one', () => {
  const lines = ['`kiln one --a`', '`kiln two --b`', '`kiln three --c`'].join('\n');
  const many: Handoff[] = ['S1', 'S2', 'S3'].map((run) => ({ run, text: lines }));
  assert.deepEqual(stepsFrom(many, 2), ['`kiln one --a`', '`kiln two --b`']);
  const keyed: Handoff[] = ['S1', 'S2', 'S3'].map((run) => ({ run, text: 'Called `curl -H "x: sk_' + 'live_4eC39HqLyjWDarjtT1zdp7dc" kiln.example`.' }));
  assert.equal(stepsFrom(keyed), null);
});

/**
 * Every billing state the Directory holds is written down where a lapse is decided and where it is run, and so is the
 * way back to Free.
 *
 *   node --test "docs/test/lapse-states.test.mjs"
 *
 * ADR-059 SAID NOTHING OF `comp` OR OF BACK TO FREE for two weeks after both were built: the code had moved and the two
 * documents a reader would open first still described three states and one way out. Nothing read the documents against
 * the code, so this does. The states are read from `packages/record/src/directory.ts` as text, because
 * `BILLING_STATES` is not exported, and a state added there without a word in both documents is red here.
 *
 * READ IN THE TWO SECTIONS, NOT THE WHOLE FILES: `16-DECISIONS.md` from ADR-059's heading to the next ADR, and
 * `53-SPEC-OPERATIONS.md` §5.10 to §5.11. A word elsewhere in either file is not the lapse written down.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', '..');
const read = (file) => readFileSync(join(ROOT, file), 'utf8');

/** The states, from `const BILLING_STATES = [...] as const;` in the Directory's own text. */
function billingStates() {
  const m = /const BILLING_STATES = \[([^\]]*)\] as const;/.exec(read('packages/record/src/directory.ts'));
  assert.ok(m, 'BILLING_STATES is not where this reads it, in packages/record/src/directory.ts');
  const states = [...m[1].matchAll(/'([a-z_]+)'/g)].map((s) => s[1]);
  assert.ok(states.length >= 4, `only ${states.length} billing states were read: ${states.join(', ')}`);
  return states;
}

/** The text from the line starting `from` to the next line starting `to`. */
function section(file, from, to) {
  const lines = read(file).split('\n');
  const start = lines.findIndex((l) => l.startsWith(from));
  assert.ok(start !== -1, `${file} has no line starting "${from}"`);
  const end = lines.findIndex((l, i) => i > start && l.startsWith(to));
  return lines.slice(start, end === -1 ? undefined : end).join('\n');
}

const SECTIONS = [
  { name: 'ADR-059 in docs/16-DECISIONS.md', text: () => section('docs/16-DECISIONS.md', '## ADR-059 ', '## ADR-') },
  { name: '§5.10 in docs/53-SPEC-OPERATIONS.md', text: () => section('docs/53-SPEC-OPERATIONS.md', '### 5.10 ', '### 5.11 ') },
];

for (const { name, text } of SECTIONS) {
  test(`${name} names every billing state and the way back to Free`, () => {
    const said = text();
    const missing = billingStates().filter((state) => !said.includes(`\`${state}\``));
    if (!/back to Free/i.test(said)) missing.push('back to Free');
    assert.deepEqual(missing, [], `${name} does not say: ${missing.join(', ')}`);
  });
}

test('the operations section names the command that makes the prices', () => {
  assert.ok(SECTIONS[1].text().includes('node tools/ops/stripe-setup.mjs'));
});

test('neither section uses an em dash in what this amendment wrote', () => {
  for (const { name, text } of SECTIONS) {
    const from = text().search(/October 15th 2026/);
    assert.ok(from !== -1, `${name} has no word of the October 15th amendment`);
    assert.ok(!text().slice(from).includes('—'), `${name} has an em dash after its October 15th amendment`);
  }
});

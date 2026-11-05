/**
 * What a trusted publisher's update may not slip past review, and code built from text however it reaches the builder.
 *
 * `reachAdded` decides whether a trusted publisher's version lists at once. Measured before the fix: a version adding a
 * notice, a model ask, an agent tool that changes rows, a command, a row action or a Today card came back `[]`, nothing
 * new, and listed with nobody looking. `unreadable` found `eval(` and `new Function(` and let the same call through written
 * around the name.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Reach } from '../src/catalogue.ts';
import { mergeIndexes } from '../src/kennel.ts';
import { reachAdded, unreadable } from '../src/kennel-review.ts';

const BASE: Reach = { modules: [], lists: [], pages: [], rules: [], examples: 0, skills: [], calls_out: [] };

test('WHAT AN ADD-ON MAY DO BEYOND ROWS IS WIDER REACH, and sends a trusted publisher to review', () => {
  const cases: Partial<Reach>[] = [
    { may: ['Tally may send you notifications, at most 20 a day.'] },
    { tools: [{ says: 'Reads the ledger', writes: false }] },
    { commands: ['Wipe the list'] },
    { row_actions: [{ list: 'register.tasks', title: 'Send it off' }] },
    { widgets: ['A card'] },
  ];
  for (const more of cases) assert.equal(reachAdded(BASE, { ...BASE, ...more }).length, 1, JSON.stringify(more));
  /* A TOOL THAT STARTS CHANGING ROWS IS NEW, though it says the same thing. */
  assert.equal(reachAdded({ ...BASE, tools: [{ says: 'Tidies', writes: false }] }, { ...BASE, tools: [{ says: 'Tidies', writes: true }] }).length, 1);
  /* AND THE SAME AGAIN IS NOTHING NEW. */
  for (const more of cases) assert.deepEqual(reachAdded({ ...BASE, ...more }, { ...BASE, ...more }), [], JSON.stringify(more));
});

test('CODE BUILT FROM TEXT IS REFUSED HOWEVER IT REACHES THE BUILDER', () => {
  for (const code of ['(0, eval)(text)', "globalThis['eval'](text)", '(() => {}).constructor(text)()', "(async function () {}).constructor('return 1')"]) assert.ok(unreadable(code, 'script'), code);
  for (const code of ['const evaluate = (a) => a;', 'row.constructor', 'export default async function run(ctx) { ctx.log("eval"); }']) assert.equal(unreadable(code, 'script'), null, code);
});

test('ONLY THE BUNDLED CATALOGUE IS BRAINDOG: an entry from the Kennel saying so is not, in what a record reads', () => {
  const claimed = { kind: 'pack', id: 'quiet-one', title: 'Quiet', summary: '', author: 'BrainDog', latest: '1.0.0', versions: [], categories: ['made-by-braindog', 'modules'], publisher: { kind: 'braindog', id: 'braindog', name: 'BrainDog' } } as never;
  const own = { ...(claimed as object), id: 'own-one' } as never;
  const merged = mergeIndexes({ format: 1, name: 'BrainDog', entries: [own] } as never, { format: 1, name: 'K', entries: [claimed] } as never);
  const forged = merged.entries.find((e) => e.id === 'quiet-one')!;
  assert.equal(forged.publisher, undefined);
  assert.deepEqual(forged.categories, ['modules']);
  assert.equal(merged.entries.find((e) => e.id === 'own-one')!.publisher?.kind, 'braindog');
});

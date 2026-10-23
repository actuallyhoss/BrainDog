/**
 * ⌘Z reaches an answer still waiting out its six seconds (fluid F15).
 *
 * A question's answer is held for its Undo before it is sent, so it is on the card's receipt and nowhere at the record:
 * ⌘Z found no toast and no batch and said "Nothing to undo." beside a receipt offering Undo. The card now puts its own way
 * back on the tab's history (`undo.ts`), and `undoNewest` runs it instead of asking the record for a batch.
 *
 * The rune modules `undo-replay.ts` reaches are compiled for the server as `toast.svelte.test.ts` does, which is enough for
 * what is held here: the order things are taken in and that the record is not asked for a thing it never had.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import { compileModule } from 'svelte/compiler';

registerHooks({
  /* KIT'S `$app/environment`, which only a build can resolve, is the one thing outside the repo that `live.svelte.ts` reads. */
  resolve(specifier, context, next) {
    if (specifier === '$app/environment') return { url: 'data:text/javascript,export const dev=false,browser=false,building=false', shortCircuit: true };
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith('.svelte.ts')) {
      const filename = fileURLToPath(url);
      const { js } = compileModule(stripTypeScriptTypes(readFileSync(filename, 'utf8')), { generate: 'server', filename });
      return { format: 'module', source: js.code, shortCircuit: true };
    }
    return next(url, context);
  },
});

const { history } = await import('./undo.ts');
const { undoNewest } = await import('./undo-replay.ts');

test('an answer held for its Undo is taken back by ⌘Z, once, newest first', async () => {
  const taken: string[] = [];
  history.push({ batch: 'held:one', said: '', local: () => void taken.push('one') });
  history.push({ batch: 'held:two', said: '', local: () => void taken.push('two') });
  assert.equal(await undoNewest(), true);
  assert.deepEqual(taken, ['two'], 'the newest first, and the record never asked');
  assert.equal(await undoNewest(), true);
  assert.deepEqual(taken, ['two', 'one']);
  assert.equal(await undoNewest(), false, 'then there is nothing to undo');
});

test('an answer whose card has let go of it is not taken back from here', async () => {
  const taken: string[] = [];
  history.push({ batch: 'held:sent', said: '', local: () => void taken.push('sent') });
  assert.equal(history.spend('held:sent'), true);
  assert.equal(await undoNewest(), false);
  assert.deepEqual(taken, []);
});

test('the card puts its answer on the history when it is held and lets go when it is sent or taken back', () => {
  const card = readFileSync(fileURLToPath(new URL('../decide/DecisionCard.svelte', import.meta.url)), 'utf8');
  assert.match(card, /history\.push\(\{ batch: mark, said: '', local: \(\) => void undo\(\) \}\);/u);
  assert.equal([...card.matchAll(/history\.spend\(mark\);/gu)].length, 2, 'once when it is sent, once when it is taken back');
});

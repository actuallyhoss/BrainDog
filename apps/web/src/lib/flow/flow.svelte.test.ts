/**
 * The canvas's draft, held to the one fact it reads from outside itself: whether this host answers Spark.
 *
 * THE MENU AND THE FAULTS READ THE SAME FLAG AT DIFFERENT TIMES. `StepMenu.svelte` offers Ask Spark from a `$derived`
 * over `page.data.spark`, which follows every layout load. `FlowDraft` took the flag as a boolean when the page was
 * built. The layout forgets a refused `/api/version` and asks again on the next navigation, and a move from one
 * automation to another keeps the same page instance, so after one failed first ask the menu offered Ask Spark while
 * every card of it was a fault saying this BrainDog has no model. So the draft now takes a function and reads it each
 * time the faults are asked for.
 *
 * COMPILED FOR THE SERVER, FOR `toast.svelte.test.ts`'s REASON: the fields are runes, and a rune has no runtime binding
 * until the compiler takes it away. What that leaves unproven is stated there and holds here too: the values below are
 * right, and nothing here shows that anything re-renders.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import { compileModule } from 'svelte/compiler';

registerHooks({
  load(url, context, next) {
    if (url.endsWith('.svelte.ts')) {
      const filename = fileURLToPath(url);
      const { js } = compileModule(stripTypeScriptTypes(readFileSync(filename, 'utf8')), { generate: 'server', filename });
      return { format: 'module', source: js.code, shortCircuit: true };
    }
    return next(url, context);
  },
});

/* AFTER THE HOOK, so the module loads through it. */
const { FlowDraft } = await import('./flow.svelte.ts');

const ASKS = { rule: 'asks', on: { manual: true }, steps: [{ ask_spark: { question: 'Go?', as: 'go' } }] };

test('THE DRAFT READS WHETHER THE HOST ANSWERS SPARK WHEN IT IS ASKED, not when the page was built', () => {
  /* MEASURED RED FIRST, with the boolean field: the function was kept as the flag, a function is truthy, and the card
     had no fault on a host with no model. Before that, with a boolean, a later `true` never reached the draft. */
  let spark = false;
  const flow = new FlowDraft({ spark: () => spark });
  flow.open('asks', ASKS as never, 1);
  assert.equal(flow.spark, false);
  assert.equal(flow.faults.length, 1, JSON.stringify(flow.faults));
  assert.match(flow.faults[0]!.say, /no model for Spark/u);

  /* THE SECOND `/api/version` ANSWERS, and the same draft now agrees with the menu that offered the step. */
  spark = true;
  assert.equal(flow.spark, true);
  assert.deepEqual(flow.faults, []);
});

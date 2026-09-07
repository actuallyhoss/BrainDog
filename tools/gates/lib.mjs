/**
 * The only code the gates share.
 *
 * A GATE THAT HOLDS ITS OWN NUMBER IS A NUMBER NOBODY REVIEWS. `52 §4`: every number a gate asserts
 * lives in `budgets.json`, and a gate holds no numeric literal that is not `0`, `1` or an index. The
 * reason is not tidiness — it is that a budget is a decision some design document made, and a
 * decision spread across ten scripts is one that gets quietly widened by whoever is in a hurry. In
 * one file, changing 30 KB to 40 KB is a diff a reviewer sees and asks about.
 *
 * A COUNT IS NEVER A BUDGET. `34 §6`: a count is read from the enumeration that owns it — the nine
 * outbox kinds are counted from `OUTBOX_KINDS`, never from a `9` written down here, because the
 * whole point of counting them is to catch the day somebody adds a tenth.
 *
 * KEYS BEGINNING `//` ARE COMMENTS. JSON has none, and the argument for each number belongs beside
 * it rather than in a document nobody opens when they are changing it. They are stripped here, so a
 * gate never sees one and `self-test`'s "every key is read" check never asks for one.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

/** `//`-prefixed keys are the file's comments. Recursive, because the sections carry their own. */
const stripComments = (v) =>
  Array.isArray(v) || v === null || typeof v !== 'object'
    ? v
    : Object.fromEntries(
        Object.entries(v)
          .filter(([k]) => !k.startsWith('//'))
          .map(([k, x]) => [k, stripComments(x)]),
      );

/**
 * Every number a gate asserts, frozen.
 *
 * FROZEN BECAUSE A GATE THAT ADJUSTED ITS OWN BUDGET WOULD BE A GATE THAT PASSES. It is one object
 * shared by every gate in a run, and `Object.freeze` is the difference between "shared" and
 * "shared and mutable", which is a bug that would show up as a gate passing on a Tuesday.
 */
const deepFreeze = (v) => {
  if (v === null || typeof v !== 'object') return v;
  for (const x of Object.values(v)) deepFreeze(x);
  return Object.freeze(v);
};

let cached;

/** @returns {Readonly<Record<string, Readonly<Record<string, number | number[]>>>>} */
export function budgets() {
  cached ??= deepFreeze(stripComments(JSON.parse(readFileSync(join(here, 'budgets.json'), 'utf8'))));
  return cached;
}

/**
 * One section, and a missing one is loud.
 *
 * A GATE READING AN ABSENT SECTION WOULD GET `undefined` AND COMPARE AGAINST IT, and every
 * comparison against `undefined` is false — so the gate would go green having asserted nothing,
 * which is the exact silence `self-test` exists to break. It throws instead.
 */
export function budget(section) {
  const all = budgets();
  const found = all[section];
  if (!found) throw new Error(`budgets.json has no "${section}" section, and a gate asked for it.`);
  return found;
}

/** Every key path in the file, `section.key`, for the check that nothing here is unread. */
export function keyPaths() {
  return Object.entries(budgets()).flatMap(([section, values]) =>
    Object.keys(values).map((key) => `${section}.${key}`),
  );
}

/**
 * Directories no gate walks into, and one list instead of seven.
 *
 * THERE WERE SEVEN, AND THEY HAD DRIFTED. `secret-grep` skipped four names, `stack` three,
 * `layout` three, `css-rules` and `colour-grep` their own supersets, and `routes` and
 * `no-declarations-in-kernel` skipped `node_modules` alone — so the same directory was source to
 * two gates and invisible to five, with nothing anywhere saying which answer was intended.
 *
 * WHAT IT COST, MEASURED: a subagent left a scratch script under `apps/web/.verify/` during an
 * audit, and `secret-grep` read `console.log('=== plain /r/obligations ===')` as a plaintext
 * reaching a log. One gate red, on a file nobody wrote to ship, in a directory five other gates
 * were already ignoring.
 *
 * A LEADING DOT MEANS TOOLING. `.svelte-kit` was already named by three of the seven and `.git` by
 * two, which is the rule those lists were groping towards; no source directory in this repository
 * begins with one, and every scratch, cache and editor directory does. The built outputs are named
 * because they do not.
 *
 * IT IS THE UNIVERSAL PART ONLY. A gate that also skips its own fixtures, or `docs/`, keeps saying
 * so at its own call site — those are statements about what that gate measures, not about what a
 * directory is.
 */
const BUILT = new Set(['node_modules', 'build', 'dist', 'shots']);
export const skipDir = (name) => name.startsWith('.') || BUILT.has(name);

/**
 * The only code the gates share.
 *
 * A GATE THAT HOLDS ITS OWN NUMBER IS A NUMBER NOBODY REVIEWS. `52 §4`: every number a gate asserts
 * lives in `budgets.json`, and a gate holds no numeric literal that is not `0`, `1` or an index. The
 * reason is not tidiness. A budget is a decision some design document made, and a
 * decision spread across ten scripts is one that gets quietly widened by whoever is in a hurry. In
 * one file, changing 30 KB to 40 KB is a diff a reviewer sees and asks about.
 *
 * A COUNT IS NEVER A BUDGET. `34 §6`: a count is read from the enumeration that owns it. The nine
 * outbox kinds are counted from `OUTBOX_KINDS`, never from a `9` written down here, because the
 * whole point of counting them is to catch the day somebody adds a tenth.
 *
 * KEYS BEGINNING `//` ARE COMMENTS. JSON has none, and the argument for each number belongs beside
 * it rather than in a document nobody opens when they are changing it. They are stripped here, so a
 * gate never sees one and `self-test`'s "every key is read" check never asks for one.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
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
 * comparison against `undefined` is false. So the gate would go green having asserted nothing,
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
 * `no-declarations-in-kernel` skipped `node_modules` alone. So the same directory was source to
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
 * so at its own call site. Those are statements about what that gate measures, not about what a
 * directory is.
 */
const BUILT = new Set(['node_modules', 'build', 'dist', 'shots']);

/**
 * AND A VARIANT BUILD IS A BUILD. `build-cloud/` is the same output for a different record, and the
 * moment it existed every grep gate started reading minified CSS as though it were a component.
 * `css-rules` reported fourteen colour literals in `Button.css`, which is the compiled form of rules
 * that name only tokens. A built directory is built whatever the record inside it is.
 */
export const skipDir = (name) => name.startsWith('.') || BUILT.has(name) || name.startsWith('build-');

/**
 * THE READINESS CONTRACT, AND WHY IT IS IN THE FILE THAT IMPORTS NO PLAYWRIGHT.
 *
 * Four gates open a browser, and all four decided a page was ready the same way:
 * `waitForSelector('#main *', { timeout: 5000 }).catch(() => {})`, copy-pasted at six sites, three
 * of which spelt the timeout as a bare literal against this file's own opening rule. It worked
 * because every screen computed its content synchronously, so the moment `#main` had one child it
 * had all of them.
 *
 * IT STOPS WORKING THE DAY A SCREEN FETCHES, AND IT STOPS WORKING SILENTLY. `#main *` is then
 * satisfied by a page heading or a section frame, and `.catch(() => {})` means that even total
 * failure of that weak signal is not a finding: `layout` would measure the rail and the tab bar over
 * 627 page-runs, print `0 finding(s)` and exit 0, while its own seeded negative kept passing because
 * the seed goes into `#main` whether or not any data arrived. `keys` is worse in kind: its verdict is
 * `document.body.innerHTML.length` before a keystroke against after, so a response landing between
 * those two lines counts a dead key as alive.
 *
 * THE CONTRACT. `<main id="main">` carries `data-screen`, with three values and one meaningful
 * absence. ABSENT is the only "still loading", and it is a FINDING once it outlasts the budget rather
 * than a swallowed catch. `ready` is a call that came back with something drawn from it. `empty` is a
 * designed empty state, which is a real screen with its own content contract and is measured
 * normally. `refused` is a refusal, which is a value in this codebase and never an exception.
 *
 * WHAT MAKES IT UNSATISFIABLE VACUOUSLY, and each of the three closes a hole the old wait left open:
 * the attribute is not written until a call has COMPLETED, so chrome alone carries none; absence past
 * the budget is a finding; and a run with no `ready` at all, or a `refused` on a route outside
 * `MAY_REFUSE`, is red. The wait carries a budget and its expiry is a value, so no gate can hang.
 *
 * IT LIVES HERE RATHER THAN IN A GATE OF ITS OWN, AND STILL IMPORTS NO PLAYWRIGHT. `settled` calls
 * three methods on the page it is handed. Every grep gate imports this file, and none of them should
 * pay for a browser in order to read a budget.
 */

/**
 * The addresses that are MEANT to refuse, named rather than described so they are one diff to review.
 *
 * Both are the not-found samples the sweeps already carry: `/nowhere` is an extra address on the
 * route lists of `layout` and `a11y`, and `/r/nope` is the route `a11y`'s `empty: not found`
 * scenario drives expecting `.empty[data-kind="error"]`. Everything ELSE refusing means the gate is
 * looking at a host that is not answering, and a whole sweep of error cards must not read as a pass.
 */
export const MAY_REFUSE = new Set(['/nowhere', '/r/nope']);

/** The attribute, spelt once. */
const SCREEN = 'data-screen';

/** The three settled values. A fourth is a contract violation, not a state to measure. */
const SETTLED = new Set(['ready', 'empty', 'refused']);

/**
 * What a page reports when the build it came from does not carry the contract at all.
 *
 * NOT A FOURTH VALUE OF THE CONTRACT. It is this helper saying which of two worlds the run is in, and
 * it exists because the gates have to be correct on both sides of the app change: the attribute is
 * rendered by `apps/web/src/routes/+layout.svelte`, which lands separately, and a gate that went red
 * over every route until it did would be a gate somebody switches off, while a gate that went green
 * would be the exact silence this contract is for. So a pre-contract build is measured the way it has
 * always been measured, the absence is said out loud once per run, and the timeout is a finding in
 * BOTH worlds.
 */
const UNCONTRACTED = 'uncontracted';

/**
 * Does the built app name the attribute anywhere.
 *
 * ASKED OF THE BUILD AND NOT OF A PAGE, because a page can fail to settle for a reason that has
 * nothing to do with whether the contract exists, and a probe that confused those two would answer
 * "the app does not emit it" about an app that emits it and is broken. Svelte compiles the attribute
 * name into the chunk as a string literal, the same way `data-rail` and `data-state` are already in
 * `build/_app/immutable/nodes/0.*.js`, so the question is decidable off disk and is not a race.
 */
function emitsContract(root) {
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (!skipDir(e.name)) stack.push(join(dir, e.name));
      } else if (/\.(js|html)$/.test(e.name) && readFileSync(join(dir, e.name), 'utf8').includes(SCREEN)) {
        return true;
      }
    }
  }
  return false;
}

/** Read in the page: the settled value, or `null` while the screen has not settled. */
const screenOf = () => document.querySelector('main#main')?.getAttribute('data-screen') ?? null;

/**
 * One gate's readiness, built once per run from the build it is about to measure.
 *
 * `gate` names the gate in the two sentences this prints, `timeoutMs` is `ready.settleTimeoutMs`
 * read by the caller the way every gate reads its own section, and `root` is the built app.
 *
 * THE MISSING CONTRACT IS ANNOUNCED FROM HERE RATHER THAN FROM THE CALLER, so a gate cannot acquire
 * the helper and forget to say that it measured less than it claims. There is no environment
 * variable in it: a switch that defaults to skipping is how a check stops being one.
 */
export function readiness(gate, timeoutMs, root) {
  /* A missing build is a different sentence, and each gate already prints its own before exiting 3. */
  const built = existsSync(root);
  const contract = built && emitsContract(root);
  if (built && !contract) {
    console.error(
      `  ${gate}: this build carries no \`${SCREEN}\`, so the readiness contract is not live and this\n` +
        `  run waited for \`#main\` to have a child instead, which is only sound while every screen\n` +
        `  draws synchronously. Absence of even that is a finding here. Until\n` +
        `  apps/web/src/routes/+layout.svelte renders <main id="main" ${SCREEN}={settled()}>, this\n` +
        `  gate cannot tell a drawn screen from a shell that has fetched nothing.`,
    );
  }

  let anyReady = false;

  return {
    /** Whether this run is holding the app to the contract. Read by the aggregate check. */
    contract,

    /**
     * What the screen settled into: `ready`, `empty`, `refused`, `uncontracted`, or `null`.
     *
     * `null` IS A FINDING AT EVERY CALL SITE, and that is the whole of this contract. The idiom it
     * replaces ended in `.catch(() => {})`, so a page that had rendered nothing was measured anyway
     * and the gate reported green over an empty document.
     *
     * `prerendered` is for a root that is not the record app: the marketing site is three prerendered
     * pages that make no call, so it has nothing to settle and is measured on the pre-contract signal
     * for ever. It is a statement about that root, not a way to opt a screen out.
     */
    async settled(page, prerendered = false) {
      const live = contract && !prerendered;
      const sel = live ? `main#main[${SCREEN}]` : `main#main[${SCREEN}], #main *`;
      const el = await page.waitForSelector(sel, { timeout: timeoutMs }).catch(() => null);
      if (!el) return null;
      const state = await page.evaluate(screenOf);
      if (state === 'ready') anyReady = true;
      return state ?? UNCONTRACTED;
    },

    /**
     * The one decision every call site makes, and the one sentence it prints.
     *
     * `where` is how the gate names this page-run; `route` is the address, so that the two addresses
     * meant to refuse can be told from every other one.
     */
    check(where, route, state) {
      if (state === null) return `${where}  never settled in ${timeoutMs}ms, so nothing on it was measured`;
      if (state === UNCONTRACTED) return null;
      if (!SETTLED.has(state))
        return `${where}  says ${SCREEN}="${state}", and the contract has exactly ready, empty and refused`;
      if (state === 'refused' && !MAY_REFUSE.has(route))
        return `${where}  refused, so what was measured is an error card and not the screen`;
      return null;
    },

    /**
     * The aggregate, which is the property a per-page check cannot hold.
     *
     * A host that answers nothing draws the error card on every route, and a record with nothing in
     * it draws the empty one. Both sweep cleanly page by page. A run that never once saw a screen
     * with the record on it has measured the product's chrome, and that is a red run rather than a
     * quiet one. Silent before the contract is live, because there is no `ready` to count yet.
     */
    nothingDrawn() {
      return contract && !anyReady
        ? `${gate}: no screen on this run settled into \`ready\`. Everything measured was an empty or` +
            ` a refused page, so this run asserts nothing about a screen with the record drawn on it.`
        : null;
    },
  };
}

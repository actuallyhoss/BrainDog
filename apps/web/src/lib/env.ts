/**
 * WHICH DEPLOYMENT THIS BUILD IS, and the only place in the app that asks.
 *
 * `vite.config.ts` substitutes a literal, so in the shipped build this is `''`, every `ENV ===`
 * below folds to `false`, and the alpha chrome is not in the bundle. There is no runtime switch:
 * the answer is gone by the time anything runs, and there is nothing to reach because there is
 * nothing there. That is the same argument `data.ts` makes for `BRAINDOG_VARIANT`, and the same
 * refusal - a `?env=` parameter would be a product surface nobody asked for, and one that lies.
 *
 * IT IS NOT `BRAINDOG_VARIANT`, AND THE TWO MUST NOT MERGE. A variant answers *which record this
 * build shows* and exists so a gate can reach the half of a screen the shipped seed cannot draw;
 * `svelte.config.js` sends every variant to `build-<variant>/` precisely so it never overwrites the
 * artefact that ships. An environment answers *which deployment this build is for*, and its output
 * has to be `build/`, because `build/` is the one directory both hosts serve (50 section 2.1).
 * Riding one on the other would make eight builds out of four, deploy alpha out of a directory
 * `tools/gates/lib.mjs` deliberately skips (`name.startsWith('build-')`), and put a deployment's
 * palette behind a flag whose whole documented purpose is a gate fixture.
 *
 * WHAT IT IS FOR. Two windows, one on the alpha record and one on the real one, look identical,
 * and the cost of confusing them is a row deleted from the wrong record. The palette says so in
 * colour (`packages/theme/src/environment.ts`), and this module is what says so in words - because
 * 13 section 2.3 rule 1 is that colour never carries meaning alone, and a deployment a reader
 * cannot see is worse than one nobody labelled.
 */

/**
 * The deployments this build can be for. `''` is production, and it is the absence of an
 * environment rather than one of them - which is why it is not in the list and why the shipped
 * build's chrome has nothing extra in it at all.
 *
 * THE SAME LIST AS `@braindog/theme`'s `ENVIRONMENTS`, and it is duplicated here on purpose. 50
 * section 1 admits `@braindog/theme` for one build script; the shell reaching into a package to
 * learn a one-word string would be a runtime import bought for nothing. `env.test.ts` imports both
 * and asserts they are the same list - which is what keeps them one list rather than the memory of
 * one, and is where 30 section 2's rule about closed lists lands at this size.
 */
export const ENVIRONMENTS = ['alpha'] as const;
export type Environment = (typeof ENVIRONMENTS)[number];

/**
 * The deployment, or `''`.
 *
 * FAIL TO PRODUCTION, NEVER TO ALPHA. An absent constant is `''`, so a build that loses its
 * `define` renders the shipped product rather than a half-labelled alpha one.
 *
 * AND THE VALUE IS NOT RE-VALIDATED HERE, DELIBERATELY. Checking `raw` against `ENVIRONMENTS` at
 * runtime reads well and costs the one property this whole mechanism is built on: `define`
 * substitutes a literal, `typeof '' === 'string' ? '' : ''` folds to `''`, `named` folds to `false`,
 * and every `{#if named}` in the app is removed from the bundle. A membership test on an array does
 * not fold, so the alpha chrome would ship to production and merely never draw. The check it
 * replaces happens earlier and better: `vite.config.ts` throws on an unknown `BRAINDOG_ENV` rather
 * than quietly building production out of it, so an unrecognised value never reaches this line.
 */
export const ENV = (typeof __BRAINDOG_ENV__ === 'string' ? __BRAINDOG_ENV__ : '') as '' | Environment;

/** Whether this build is for a deployment that has to announce itself. Folds to `false` in the shipped build. */
export const named = ENV !== '';

/**
 * Every flag this product has, what it is waiting for, and the day it stops being allowed to exist.
 *
 * A FLAG IS A DECISION THAT HAS NOT BEEN TAKEN, WRITTEN DOWN WHERE IT CAN BE COUNTED. That is the
 * whole of it, and everything below follows from refusing the two things it is not.
 *
 * IT IS NOT A WAY TO SHIP UNFINISHED WORK. `23 section 3.1` already settled that case in the other
 * direction: a capability with no model behind it is "not there - not greyed out". Unfinished code
 * behind a flag is unfinished code in the bundle - reachable by anyone who reads the chunk, counted
 * against the 30 KB entry budget (`50 section 7`), and invisible to `svelte-check` in the half that
 * is switched off. So the rule this file is built on is narrow and it is load-bearing:
 *
 *      A FLAG GUARDS FINISHED CODE WHOSE RELEASE IS NOT YET DECIDED.
 *      Unfinished code is an unmerged branch. It is never a flag.
 *
 * IT IS NOT A PREFERENCE. `pref.ts` is solved: eleven fields, a cookie the shell reads before first
 * paint, per device, the reader's own, and a `prefs` gate that goes red when one of them changes
 * nothing. A flag is not the reader's to set and does not survive as a fact about their browser; a
 * setting that a person can find and change is a preference and belongs there. The gate refuses a
 * flag whose name is also a `Pref` key, because that collision is how the two mechanisms become one
 * confused one.
 *
 * WHERE A FLAG LIVES: THE BUILD, AND ONLY THE BUILD, TODAY.
 *
 * `vite.config.ts` reads `FLAGS` below and `define`s the resolved set as a literal, exactly as it
 * does for `BRAINDOG_ENV`, so the constant folds away. Three homes were considered and two are refused, with the reasons written down because a
 * refusal nobody recorded gets re-proposed every quarter:
 *
 *   - A RECORD DECLARATION. This product's thesis is that everything is a declaration in a versioned
 *     record, and a release flag is the one thing that must not be. A record is restored from a
 *     `.brain` file onto a laptop months later (`kernel/src/members.ts`: the mirror "is the one that
 *     travels"), and it would arrive naming branches that no longer exist in any build. The record
 *     outlives the code by design; a flag has to die before the code does. What IS a declaration is a
 *     CAPABILITY - which packs already are - and the difference is lifetime, not shape. See the
 *     precedence note below for the one place the two meet.
 *   - A URL PARAMETER. Refused in the words `vite.config.ts` already uses for the same idea: "a
 *     `?variant=` parameter would be a product surface nobody asked for, and a `window.__seed` hook
 *     would be a dev door shipping to production."
 *
 * THE PRECEDENCE, WHEN THE SECOND HOME EXISTS. Layers narrow and never widen, which is `20 section
 * 1`'s projection invariant applied to the same problem: "a projection can only narrow. Never
 * widen." The build is the ceiling. A flag off at build has nothing that can turn it on - not a
 * record, not an owner, not a URL. A flag on at build may be turned OFF for one record by an
 * `owner`, once `setDeclaration` has a caller to reach and a `boot()` to deliver it in. It has
 * neither today, and `data/call.ts` says why a seam with no caller is not written: "a `call()` that
 * nothing calls would be the exact shape of thing this codebase keeps finding and deleting."
 *
 * SO: TURNING A FLAG ON IS A COMMIT. TURNING ONE OFF WILL BE `owner`, AND IS NOT BUILT.
 *
 * HOW A FLAG IS REMOVED. Delete the entry, delete the branch, delete the losing side's `copy` keys.
 * `dead-copy` catches the third if you forget it. `tools/gates/flags.mjs` catches the first two, and
 * it is red on the day `until` passes - so a flag cannot become permanent branching by inattention,
 * which is the only way it ever does.
 */

/**
 * One flag's declaration. Every field is there because a gate reads it or a reviewer does.
 *
 * `why` IS NOT DECORATION, and `dead-copy`'s allow-list is the precedent: "the `why` is not
 * decoration: it is the difference between a debt and a mistake, and the only thing that lets the
 * next reader tell them apart without re-deriving the whole surface."
 */
export type Flag = {
  /** What is undecided, in one sentence, in the house voice. What is off - where - what settles it. */
  why: string;
  /** A person. Not a team: a team does not delete a branch. */
  owner: string;
  /** The day it was added, ISO. */
  since: string;
  /** The day it stops being allowed to exist, ISO. The gate is red the day after. */
  until: string;
  /** Where the removal is tracked - a row address like `tasks#41`, or a URL. Never empty. */
  issue: string;
  /** Its value in the shipped build. The inverted build (`BRAINDOG_FLAGS=invert`) takes the other. */
  ship: boolean;
  /**
   * A literal that reaches the document only when the flag is ON.
   *
   * THE `prefs` GATE'S ARGUMENT, APPLIED TO A BRANCH. "A preference that changes nothing is a
   * control that lies" - and a flag whose two builds are identical is a branch that does nothing,
   * which is the same defect wearing different clothes. The gate greps this string in `build/` and
   * in `build-flags/` and is red unless it is in exactly one of them.
   *
   * `null` when the difference is not a string a grep can find - a threshold, an ordering, a
   * timeout. It is an excuse and the gate prints it, so the debt is a list somebody can shorten
   * rather than a silence.
   */
  proof: string | null;
};

/**
 * The list. It is expected to be short and it is expected to shrink.
 *
 * THE SHAPE IS `copy.ts`'S, and deliberately: `tools/gates/flags.mjs` parses this file as text, the
 * way every gate in this repository reads TypeScript, and a record keyed by name with one property
 * per line is the shape that parse can be trusted on. A gate that had to understand TypeScript would
 * be a second thing that can be wrong.
 */
export const FLAGS = {
  /**
   * EMPTY, AND THAT IS THE STATE THIS FILE SHOULD USUALLY BE IN.
   *
   * A worked example shipped here would be a flag read nowhere, which is the first thing
   * `tools/gates/flags.mjs` refuses — *"declared and read nowhere: a branch nobody takes"* — and it
   * refused the one that was here, on its first run, correctly. A mechanism that arrives with a
   * demonstration of the thing it forbids teaches the wrong lesson twice: once to whoever copies
   * the example, and once when the gate is read as noisy rather than right.
   *
   * The first entry goes in beside the first branch that needs one. `Flag`'s own fields say what it
   * must carry: why the code is finished but unreleased, who decides, the window, the issue that
   * closes when it goes, and the `proof` string that must reach exactly one of the two builds.
   */
} as const satisfies Record<string, Flag>;

export type FlagName = keyof typeof FLAGS;

/**
 * The set this build was compiled with, as a literal `vite.config.ts` substituted.
 *
 * A SPACE-SEPARATED STRING AND NOT A JSON ARRAY, for the same reason `__BRAINDOG_ENV__` is a
 * string: `define` replaces an identifier with source text, and a string literal is the one shape
 * that cannot be pulled apart into something that allocates on every read. It is split once, at
 * module load, into a `Set` - never matched as a substring, because `newImporter` contains
 * `newImport` and a substring match is a flag that turns itself on.
 */
const COMPILED = typeof __BRAINDOG_FLAGS__ === 'string' ? __BRAINDOG_FLAGS__ : '';

/**
 * FAIL CLOSED. An absent constant resolves every flag OFF, never on.
 *
 * `20 section 1` names the precedent and it is Retool's: "Retool blocks a query rather than running
 * it unfiltered when an embedded expression cannot be evaluated." A build that lost its `define`
 * ships the product as it was before any flag was added, which is a state somebody has reviewed.
 * The other direction ships every undecided thing at once, to everybody, silently.
 */
const ON = new Set(COMPILED.split(' ').filter(Boolean));

/**
 * What each flag is, in this build. Frozen, because a flag that can be assigned to is a flag whose
 * value depends on which module ran first.
 *
 * A PROPERTY READ AND NOT A FUNCTION CALL. `flags.recordAccent` is what the gate greps for, and a
 * call would let the name be computed - `flags(someVariable)` - which is a flag no gate can count
 * the call sites of and no reviewer can find by searching.
 */
export const flags: Readonly<Record<FlagName, boolean>> = Object.freeze(
  Object.fromEntries(Object.keys(FLAGS).map((name) => [name, ON.has(name)])) as Record<FlagName, boolean>,
);

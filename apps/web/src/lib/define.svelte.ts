/**
 * The load-bearing nouns, defined the first time you meet one, and never again.
 *
 * `19 §6` names eight — register, row, pack, page, block, tone, target, window — and is specific
 * about the shape: *"a definition the first time they appear on a screen — not a tooltip, not a
 * tour, not a glossary the user must find. One clause, in the sentence that needs it, and never
 * again."* Four of those five words are instructions about what NOT to build, which is why the rule
 * has survived three sessions unimplemented: every obvious mechanism is one of the four.
 *
 * WHAT WAS THERE. Five definitions, written into `first-run.ts`, imported by nothing —
 * `grep -rn defRow|defPack|defPage|defBlock|defTone` found them in that file and no other — under a
 * comment that stated the policy in the past tense. So `row`, `pack`, `page`, `block` and `tone`
 * each reached a screen and the sentence defining them rendered nowhere.
 *
 * WHICH WORDS ACTUALLY NEED IT, measured rather than assumed. A sweep of twenty-three routes for
 * each of the eight nouns as visible text:
 *
 *   list      every route (the rail's own section header)   undefined
 *   page      every route                                   undefined
 *   pack      every route                                   ALREADY DEFINED, on `/packs`
 *   row       eight routes                                  undefined
 *   block     one route (`/v/…`, "Bind as a block")         undefined
 *   register  one route (`/jobs/…`, "across 2 registers")   a SECOND WORD for `list`
 *   tone · target · window                                  never on screen at all
 *
 * So the set is four, not eight. `pack` is defined in place already — "A pack adds ready-made lists
 * and pages. Readable text; nothing runs." is the first line of `/packs` — and three of the eight
 * never reach a reader, which satisfies a rule about the first time a word appears on a screen. A
 * definition surface for a word nobody sees would be the glossary the rule forbids.
 *
 * ONCE PER DEVICE, IN THE COOKIE. "Never again" is a fact about a person, so it has to survive a
 * reload; `50 §4.7`'s preference set has no slot for it, and every other store this product has is
 * either the URL (which would put "have you read this" in a shareable address) or component state
 * (which forgets on navigation). The deviation is one key, and it is named here rather than
 * silently.
 *
 * IT IS SEEDED ONCE AND MUTATED SYNCHRONOUSLY. Two `Define`s for the same noun in one render pass
 * must not both teach — the second reads the set the first already wrote — so the guard cannot wait
 * for an effect. The cookie write is the part that is deferred.
 */

import * as pref from './pref.ts';

/** The four this build teaches. Closed, so a fifth is a decision rather than a call site. */
export const NOUNS = ['list', 'row', 'page', 'block'] as const;
export type Noun = (typeof NOUNS)[number];

/**
 * Read once, at module load, and not on every render.
 *
 * A `$derived` over `document.cookie` would re-read on every keystroke that touched it, and this
 * set changes at most four times in the life of an install.
 */
let seen = new Set<string>((pref.read().defined ?? []).filter((n): n is Noun => (NOUNS as readonly string[]).includes(n)));

/** Everything taught so far. Exported for the test, which is the only other caller. */
export const taught = (): Set<string> => new Set(seen);

/**
 * Should this noun be explained here?
 *
 * TRUE AT MOST ONCE PER NOUN, EVER, and the mark goes down in the same tick. A component that asked
 * and then rendered nothing would burn the one chance the noun gets.
 */
export function teach(noun: Noun): boolean {
  if (seen.has(noun)) return false;
  seen.add(noun);
  pref.write({ defined: [...seen] });
  return true;
}

/** Forget every definition. The test's reset, and what clearing the cookie already does. */
export function forget(): void {
  seen = new Set();
  pref.write({ defined: undefined });
}

/**
 * What a person at "Adds only" is told when they ask to read (`docs/20-COLLABORATION.md` §2, tier 0).
 *
 * THE SENTENCE EVERY LEVEL GETS IS A DEAD END AT THIS ONE. "This needs read, and you have append access. Ask an owner
 * to raise your access." is right for somebody at `read` asking to write: a higher rung exists and the owner can hand it
 * over. At `append` the missing read is the level's whole point (`LEVEL_REACH` in `index.ts`), so asking for it asks the
 * owner to undo his own invitation, and the one thing the level was made for, adding through an agent, goes unsaid. This
 * says that thing and where to do it.
 *
 * `LEVEL_REQUIRED`, AS BEFORE, because the code is what a caller branches on and the fact has not changed: the call
 * needs a level the caller does not hold. `at: 'level.append'` is what a screen branches on to draw the one button
 * under the sentence (Home's "Make your agent's key"), so the sentence is never matched as text.
 *
 * A PERSON ONLY. An agent's token at append is told the token's sentence, since it is already the agent.
 */

import type { Refusal } from '@braindog/ports';

/** The sentence. Plain, and it names the screen where the key is made. */
export const APPEND_READ_FIX =
  'You can add to this record and you cannot read it here. You add through an agent of your own. Make its key in Settings, under Agents.';

/** Where the refusal is about: the caller's level, which is `append`. A screen reads this, never the sentence. */
export const APPEND_READ_AT = 'level.append';

/** The refusal a person at "Adds only" gets for a read. A fresh object each time, so no caller can change another's. */
export const appendReadRefusal = (): Refusal => ({ code: 'LEVEL_REQUIRED', fix: APPEND_READ_FIX, at: APPEND_READ_AT });

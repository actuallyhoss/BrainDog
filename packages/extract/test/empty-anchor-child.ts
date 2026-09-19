/**
 * `{ after: '' }` over a short text, run in its own process.
 *
 * A REGRESSION HERE IS NOT A SLOW TEST, IT IS A HUNG ONE. `indexOf('')` is 0 at every index, so a walk
 * that advances past each hit by the literal's own length advances by ZERO over an empty literal — the
 * index never moves and the loop never ends, growing its output for as long as the process has heap
 * (`43 §4.3`, `§5.3` step 1). `extractors.test.ts` spawns this file with a timeout and kills it rather
 * than waiting on a promise no fix inside this process could ever resolve.
 */
import { fold, run, type RunCtx } from '../src/extractors.ts';

const ctx: RunCtx = { currencies: {}, lookup: () => [] };
const text = 'hello world';
const got = run({ after: '' }, text, fold(text), ctx, 'extract.f');
process.stdout.write(JSON.stringify(got));

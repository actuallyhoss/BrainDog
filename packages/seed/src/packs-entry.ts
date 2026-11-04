/**
 * `@braindog/seed/packs`: the first-party declarations the app ships, without the sample's names.
 *
 * THE ROOT IS THE SAMPLE. `@braindog/seed` exports `REGISTERS`, `ROWS`, `NOW` and `installSeed` beside the product's own
 * declarations, and `tools/gates/no-fixtures.mjs` refuses a shipped file that imports it. Four shipped files read it for
 * product and nothing else: `declared.ts` for the modules' figures, `packs.ts` for the documents Install sends,
 * Settings for the Agents pack, and the command's scratch record (`apps/cli/src/scratch.ts`, since 9 October, once the
 * gate read the command too), which installs `FIRST_PARTY` and the Agents pack from the same documents a real record
 * installs, and no sample. This is their door, and `test/packs-entry.test.ts` holds it to exactly what they read.
 *
 * WHAT IT DOES NOT YET DO IS KEEP THE SAMPLE'S ROWS OUT OF THE BUNDLE. `packs/first-party.ts` slices every document out
 * of `packDocument()` in `index.ts`, whose example seeds are the first row of each of the sample's lists, so loading
 * this file loads `index.ts`, and ES modules evaluate a dependency before the file that names it. Measured with
 * `pnpm --filter @braindog/web build`: the chunk holding `METRICS` still carries the sample's learnings
 * text, and building `METRICS` here from the four modules instead of re-exporting it changed no byte of any chunk. The
 * move from a namespace import of the root to this file took that chunk from 13.5 KB to 10.7 KB brotli, and all shipped
 * JavaScript from 512.3 KB to 499.4 KB. The rest is `first-party.ts` reading `index.ts`, which this file cannot change.
 *
 * SO A SCREEN THAT WANTS ONLY THE FIGURES, OR ONLY WHICH LISTS A MODULE BRINGS, HAS A DOOR OF ITS OWN that reaches none of
 * it: `@braindog/seed/packs/metrics` (`modules/metrics.ts`, the very `METRICS` exported here) and `@braindog/seed/packs/lists`
 * (`modules/lists.ts`). The app's first open reads those two and not this file.
 */

export { AGENTS_PACK, agentsPackDocument, type PackManifest } from './packs/agents.ts';
export { FIRST_PARTY, FIRST_PARTY_VERSIONS, firstPartyDocument, firstPartyManifest, type DocumentOptions, type FirstPartyId } from './packs/first-party.ts';
export { METRICS, SEED_WIDGETS } from './index.ts';

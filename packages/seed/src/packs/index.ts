/**
 * The packs a record can be offered that are not a use case: one import, rather than one per file.
 *
 * WHY A BARREL HERE AND NOT ONE MORE ENTRY IN `usecases/index.ts`. These are not use cases. A use
 * case is a record's shape (which modules it holds, which pages it opens on), and what is in this
 * directory is the other thing a person installs: a single declaration that connects the record to
 * an address. `rates-poll` and `mercury` are both one poll or one pull, approved once, and
 * `usecases/index.ts` re-exporting `ratesPollPack` was already the shape of that mistake: the web
 * app imports it from `@braindog/seed/packs/rates-poll` and the test imports it from
 * `../src/usecases/index.ts`, which is two names for one function.
 *
 * `agents.ts` AND `first-party.ts` ARE NOT HERE ON PURPOSE. Both are re-exported from
 * `../index.ts`, which is where a record's own packs belong; adding them would be a third place to
 * find `AGENTS_PACK` rather than a second.
 *
 * NOR ARE `bank-hsbc-eg.ts` AND `holdings.ts`, for a reason of reach rather than of kind. Both are
 * packs a person installs and not use cases, so by the paragraph above they belong here, but the
 * command line's import proposes both and can reach only `@braindog/seed` itself (the note below), so
 * they are re-exported from `../index.ts`, and listing them here too would be two places for one name.
 *
 * THIS FILE IS NOT REACHABLE AS `@braindog/seed/packs` YET, because that needs a row in the
 * package's `exports` map, and that file is not this run's to edit. Until it is, the import is the
 * relative one, and nothing else changes when the row lands.
 */

export { MERCURY_BASE, MERCURY_CURRENCY, MERCURY_VERSION, mercuryPack, type MercurySpec } from './mercury.ts';
export { ratesPollPack, type RatesSpec } from './rates-poll.ts';

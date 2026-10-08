/**
 * Invented people, projects, companies, banks and figures, for a test or a comment that needs a name.
 *
 *   import { PEOPLE, PROJECTS, BANKS, CARD_TAILS } from '../../../fixtures/names.ts';
 *
 * A TEST WRITTEN FROM A REAL RECORD CARRIES THAT RECORD INTO THE REPOSITORY. Most of the private names
 * `tools/gates/public-clean.mjs` still allows were copied from the owner's own rows into a test, because a real row was
 * the nearest one to hand. This is the nearer one: every value here is made up, and none is a real person, client,
 * project, bank, account or card. A new test takes its names from here, and the sweep of the old ones swaps theirs in.
 *
 * THE SHAPES ARE KEPT, NOT THE VALUES. A test about a real quirk (two people who share a first name, a company whose
 * name is also a person's, a card tail that starts with a zero) finds the quirk here with invented values, so the
 * test keeps its meaning when its names change. Each quirk is named where it is.
 *
 * NOT UNDER `fixtures/shapes/`, which holds record shapes for the gates. Plain constants, imported by relative path and
 * read by Node's own type stripping, as `corpus.ts` beside it is.
 */

/** A person: the name a row shows, the handle an agent knows them by, and an address at an invented domain. */
export interface Person {
  name: string;
  handle: string;
  email: string;
}

/**
 * The people. `PEOPLE[0]` is the record's owner in a test that needs one. Two of them share a first name (`Mara`), and
 * one goes by a single name, the two shapes a people list most often gets wrong.
 */
export const PEOPLE: readonly Person[] = [
  { name: 'Mara Lindqvist', handle: 'mara', email: 'mara@lindqvist.example' },
  { name: 'Mara Okafor', handle: 'mokafor', email: 'mara.okafor@brightwell.example' },
  { name: 'Teodor Vance', handle: 'teo', email: 'teo@vance-studio.example' },
  { name: 'Priya Raman', handle: 'priya', email: 'priya@saltmarsh.example' },
  { name: 'Joaquin Herrera', handle: 'jherrera', email: 'joaquin@pellucid.example' },
  { name: 'Ines Duarte', handle: 'ines', email: 'ines.duarte@orchardline.example' },
  { name: 'Wren', handle: 'wren', email: 'wren@thimble.example' },
  { name: 'Samuel Achterberg', handle: 'sam', email: 'sam@achterberg.example' },
];

/** The owner in a test that needs one: a person, never the real one. */
export const OWNER: Person = PEOPLE[0]!;

/**
 * The projects. Two are products, one is client work, one is parked, and one is named for a company (`Brightwell`) so a
 * test can tell a project from the company that shares its name.
 */
export const PROJECTS = ['Lanternfish', 'Copperleaf', 'Brightwell site', 'Quietcart', 'Oxbow'] as const;

/** The companies: clients, suppliers and the owner's own. `Brightwell` is a client and the name of a project. */
export const COMPANIES = ['Brightwell', 'Saltmarsh Labs', 'Pellucid Ltd', 'Orchardline', 'Thimble & Co', 'Vance Studio'] as const;

/** The banks. A bank message's layout is a shape worth testing; its sender is invented here. */
export const BANKS = ['Harbourline Bank', 'Cedar Mutual', 'Northgate Savings'] as const;

/**
 * Card tails: four digits, fixed, invented. `0418` starts with a zero, the tail a number parser drops a digit of.
 * No tail here is anyone's card.
 */
export const CARD_TAILS = ['0418', '7731', '5096', '2264'] as const;

/** Account numbers in the shape a statement prints them, masked as a bank masks them. */
export const ACCOUNTS = ['****0418', '****7731', 'XXXX-XXXX-5096'] as const;

/** Domains a test may name. `.example` is reserved (RFC 2606), so none of them can ever resolve to someone's site. */
export const DOMAINS = ['lanternfish.example', 'copperleaf.example', 'brightwell.example', 'quietcart.example'] as const;

/**
 * Figures, as the record holds money: integer minor units with a currency, never a float and never two currencies added.
 * Round enough to read in an assertion, odd enough not to be anybody's balance.
 */
export const FIGURES = {
  invoice: { amount: 1_250_00, currency: 'USD' },
  subscription: { amount: 19_00, currency: 'USD' },
  rent: { amount: 3_400_00, currency: 'EUR' },
  refund: { amount: 42_50, currency: 'GBP' },
  balance: { amount: 18_730_45, currency: 'USD' },
} as const;

/** Holdings, for a test about a portfolio: an invented instrument, a quantity and its price in minor units. */
export const HOLDINGS = [
  { instrument: 'Northgate Index Fund', quantity: 12, price: { amount: 104_20, currency: 'USD' } },
  { instrument: 'Saltmarsh Labs ordinary shares', quantity: 300, price: { amount: 3_15, currency: 'GBP' } },
] as const;

/** Machines an agent runs on, for a test that needs a host: never a real hostname. */
export const MACHINES = ['studio-desktop', 'travel-laptop', 'build-box'] as const;

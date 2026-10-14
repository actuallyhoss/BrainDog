/**
 * The budget's plan: how a month's background allowance is shared between the purposes that spend it
 * (`loop/scope/area-engine-a.md` 2.4, "The budget's plan", ENG-A10).
 *
 * ONE POOL WITH A FLOOR EACH, AND NO WALLS. The month was once cut by walls: so many for the page headlines and no
 * more, so many for reading who is who inside the rest. A wall stops a purpose while the month still has asks nobody
 * else is owed, and it lets the rest spend what another was owed. Here every purpose has a floor, a share of the cap it
 * may always spend, and past its floor it may spend what is left once the floors the others have not used yet are set
 * aside. So nobody is stopped while room is free, and nobody's floor is spent by somebody else.
 *
 * THE LAST ASK LEFT OVER GOES BY THE ORDER (`BUDGET_ORDER`). A purpose that has used its floor is in the running for
 * what is left over, and the last ask of it is kept for the first of those in the order.
 *
 * PURE: no clock, no ledger, no store. It is handed what each purpose spent and the cap, and answers a number. It takes
 * nothing from `infer.ts` but the purposes' names, so a purpose added there with `spends: 'background'` fails to
 * typecheck here until it is given a floor and a place in the order.
 */
import type { PURPOSES } from './infer.ts';

type Purposes = typeof PURPOSES;

/** The purposes that spend the background allowance, by name: every one `infer.ts` says spends `background`. */
export type BudgetPurpose = { [K in keyof Purposes]: Purposes[K]['spends'] extends 'background' ? K : never }[keyof Purposes];

/** What each purpose has spent this month. A purpose left out has spent nothing. */
export type BudgetSpent = Partial<Record<BudgetPurpose, number>>;

/** The cap the floors below are written against: they are shares of it, and `floorsOf` scales them to any other. */
export const BUDGET_FLOORS_OF = 60;

/**
 * Each purpose's floor in a month of `BUDGET_FLOORS_OF`. They add up to 36, so 24 of the 60 are nobody's until somebody
 * needs them. Embeddings have no floor: the index is built from what the others leave.
 */
const FLOORS: Record<BudgetPurpose, number> = { understand: 10, headline: 10, compose: 5, look: 4, prose: 4, pattern: 2, skill: 1, embed: 0 };

/** Who is first in line for what is left over, first to last. Every purpose once, which the `satisfies` below holds. */
export const BUDGET_ORDER = ['understand', 'headline', 'compose', 'look', 'prose', 'pattern', 'skill', 'embed'] as const satisfies readonly BudgetPurpose[];

/* A purpose with a floor and no place in the order would never be counted: this line fails to typecheck then. */
const everyPurposeIsOrdered: Exclude<BudgetPurpose, (typeof BUDGET_ORDER)[number]> extends never ? true : never = true;
void everyPurposeIsOrdered;

/** A cap as the plan reads it: a whole number, 0 or more. Anything else holds nothing. */
const capOf = (cap: number): number => (Number.isFinite(cap) && cap > 0 ? Math.floor(cap) : 0);

/** A count as the plan reads it: what cannot be read as a count of 0 or more is 0. */
const countOf = (n: number | undefined): number => (n !== undefined && Number.isFinite(n) && n > 0 ? n : 0);

/**
 * The floors of a month of `cap`, in proportion, a half rounded up as the meters have always rounded a share.
 *
 * THEY NEVER ADD UP TO MORE THAN THE CAP. The floors are 36 in 60, so 0.4 of any cap is nobody's, and rounding seven
 * floors adds 3.5 at the very most: from a cap of 9 that cannot pass it, and below 9 the test walks every cap.
 */
export function floorsOf(cap: number): Record<BudgetPurpose, number> {
  const whole = capOf(cap);
  const floors = { ...FLOORS };
  for (const purpose of BUDGET_ORDER) floors[purpose] = Math.round((whole * FLOORS[purpose]) / BUDGET_FLOORS_OF);
  return floors;
}

/** One pool of the plan: the purposes whose asks cannot be told apart, with their floors and their spends added up. */
type Pool = { rank: number; floor: number; spent: number; mine: boolean };

/**
 * How many asks `mine` may spend now, all its purposes together.
 *
 * `pooled` NAMES THE PURPOSES WHOSE ROWS CANNOT BE TOLD APART, each list one pool with one floor (the sum) and one spend
 * (the sum). A ledger that writes its digests, its patterns and its embeddings under one purpose would otherwise leave
 * the floors of the purposes it never names set aside for ever, spent by nobody. A purpose in no list is a pool alone. A
 * pool that holds any of `mine` is all `mine`'s: a share is whole pools.
 *
 * THE COUNT:
 *   - nothing once the month has spent its cap, floor or no floor, so the whole month never passes it;
 *   - else what is left of `mine`'s own floors, and what is left over once EVERY pool's unspent floor is set aside;
 *   - less one, kept for a pool earlier in the order that has used its own floor, when there is any left over at all;
 *   - and never more than the cap has left.
 */
export function leftOf(mine: readonly BudgetPurpose[], spent: BudgetSpent, cap: number, pooled: readonly (readonly BudgetPurpose[])[] = []): number {
  const whole = capOf(cap);
  const floors = floorsOf(whole);
  const pools: Pool[] = [];
  const poolOf = new Map<BudgetPurpose, Pool>();
  for (const list of pooled) {
    const pool: Pool = { rank: BUDGET_ORDER.length, floor: 0, spent: 0, mine: false };
    for (const purpose of list) if (!poolOf.has(purpose)) poolOf.set(purpose, pool);
    pools.push(pool);
  }
  BUDGET_ORDER.forEach((purpose, rank) => {
    let pool = poolOf.get(purpose);
    if (pool === undefined) pools.push((pool = { rank, floor: 0, spent: 0, mine: false }));
    pool.rank = Math.min(pool.rank, rank);
    pool.floor += floors[purpose];
    pool.spent += countOf(spent[purpose]);
    if (mine.includes(purpose)) pool.mine = true;
  });

  const total = pools.reduce((n, p) => n + p.spent, 0);
  if (total >= whole) return 0;
  const owed = (p: Pool): number => Math.max(0, p.floor - p.spent);
  const own = pools.filter((p) => p.mine);
  if (own.length === 0) return 0;
  const over = Math.max(0, whole - total - pools.reduce((n, p) => n + owed(p), 0));
  const first = Math.min(...own.map((p) => p.rank));
  /* THE LAST ASK LEFT OVER IS THE FIRST IN THE ORDER'S, of the pools in the running for it: those past their floors. */
  const kept = over > 0 && pools.some((p) => !p.mine && p.rank < first && p.spent >= p.floor) ? 1 : 0;
  return Math.max(0, Math.min(whole - total, own.reduce((n, p) => n + owed(p), 0) + over - kept));
}

/**
 * Whether `purpose` may spend one more ask of a month of `cap`, given what every purpose has spent of it.
 *
 * TRUE WHILE IT IS UNDER ITS FLOOR, whatever the others spent of what they were let; past its floor, true only while
 * something is left over after the unspent floors of the others (`leftOf`).
 */
export function maySpend(purpose: BudgetPurpose, spent: BudgetSpent, cap: number): boolean {
  return leftOf([purpose], spent, cap) > 0;
}

/**
 * The most `mine` could ever spend of a month of `cap`: all of it but the floors of everybody else. What a meter that
 * must name one figure for its share says (`model-jobs.ts` `backgroundMeter`).
 */
export function mostOf(mine: readonly BudgetPurpose[], cap: number, pooled: readonly (readonly BudgetPurpose[])[] = []): number {
  const whole = capOf(cap);
  const floors = floorsOf(whole);
  const held = new Set<BudgetPurpose>(mine);
  for (const list of pooled) if (list.some((p) => held.has(p))) for (const p of list) held.add(p);
  return whole - BUDGET_ORDER.reduce((n, p) => n + (held.has(p) ? 0 : floors[p]), 0);
}

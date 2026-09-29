/**
 * The seeded violation: two flags, one of them read nowhere.
 *
 * ONE VIOLATION, AND EVERYTHING ELSE VALID. `self-test` asserts the COUNT of lines naming the
 * seeded token, not only the colour - so `shipped` is here to prove the gate can tell a live flag
 * from a dead one. Both have a future `until`, a window inside the budget and a removal issue, so
 * the only thing wrong with this file is the thing it is for.
 */

export type Flag = {
  why: string;
  owner: string;
  since: string;
  until: string;
  issue: string;
  ship: boolean;
  proof: string | null;
};

export const FLAGS = {
  shipped: {
    why: 'The live one. It is read by Seeded.svelte, so the gate has something to be green about and the seeded count means what it says.',
    owner: 'studio',
    since: '2099-01-01',
    until: '2099-02-01',
    issue: 'tasks#1',
    ship: true,
    proof: null,
  },
  neverTaken: {
    why: 'The seeded one. Nothing reads it, so it is a branch nobody takes - which is what this fixture exists to make the gate say.',
    owner: 'studio',
    since: '2099-01-01',
    until: '2099-02-01',
    issue: 'tasks#2',
    ship: false,
    proof: null,
  },
} as const satisfies Record<string, Flag>;

export type FlagName = keyof typeof FLAGS;

export const flags: Readonly<Record<FlagName, boolean>> = Object.freeze({ shipped: true, neverTaken: false });

/** THE SEEDED DEFECT: an INTERNAL method routed from a file under routes/, which a gate reading only index.ts never sees. */
export const ROUTES: readonly Route[] = [
  { name: 'sealedGrant', group: 'READ+', writes: false, what: 'seeded' },
];

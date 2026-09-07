/**
 * The seeded violation: a sentence typed and rendered nowhere.
 *
 * `neverShown` is referenced by no other file in this fixture, and it is not on the gate's
 * allow-list, so the gate must name it and exit non-zero. `shown` is rendered by `Seeded.svelte`
 * beside it, which is what proves the gate can tell the two apart rather than reporting every key.
 */
export const copy = {
  shown: 'This one reaches a screen.',
  neverShown: 'This one was written, reviewed, shipped, and read by nobody.',
} as const;

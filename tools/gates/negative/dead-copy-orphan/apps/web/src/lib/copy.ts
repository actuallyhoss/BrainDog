/**
 * The seeded violation: a sentence whose only renderer is a component nothing mounts.
 *
 * This is the shape the gate could not see for as long as it existed, and it cost a real one:
 * `copy.alpha` — the word that tells the alpha deployment apart from the real record — was named
 * only by `EnvBadge.svelte`, and `EnvBadge` appeared nowhere else in the repository. A grep over
 * source said the sentence was rendered. Nothing rendered it.
 *
 * `shown` is reached through a route. `neverShown` is reached only by `Orphan.svelte`, which no
 * route imports — so the gate must name `neverShown` and only `neverShown`.
 */
export const copy = {
  shown: 'This one reaches a screen.',
  neverShown: 'This one is rendered by a component nothing mounts.',
} as const;

/* A stand-in for the refusal registry: a spread of families, each a list `docs-counts` counts. */
const FIRST = ['NOT_FOUND', 'FORBIDDEN'] as const;
const SECOND = ['CONFLICT'] as const;

export const REFUSAL_CODES = [...FIRST, ...SECOND] as const;

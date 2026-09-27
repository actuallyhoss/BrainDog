/* A stand-in for the renderer's table: `docs-counts` counts its top-level entries between these two markers. */
const TABLE = {
  note: { primitive: 'panel' },
} as const satisfies Record<string, unknown>;

export { TABLE };

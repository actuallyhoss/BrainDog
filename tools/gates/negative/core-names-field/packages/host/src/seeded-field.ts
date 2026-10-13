/* SEEDED: the host sorts by a field one add-on declares, written in camel case. */
export const order = (row: Record<string, string>): string => row['maturesOn'] ?? '';

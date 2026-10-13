/* SEEDED, twice: a branch on a list's id, and a kernel word addressed as the list it also is. */
export const isWork = (list: string): boolean => list === 'tasks';
export const held = (db: { register: Record<string, { count(): number }> }): number => db.register.lines.count();

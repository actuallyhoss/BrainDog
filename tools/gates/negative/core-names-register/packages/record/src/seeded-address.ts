/* SEEDED: a list addressed by its id in code, with no string around it. */
type Lists = { register: Record<string, { count(): number }> };
export const open = (db: Lists): number => db.register.tasks.count();

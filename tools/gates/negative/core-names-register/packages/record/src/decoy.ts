/* DECOYS, none a finding: `register.` before an id nothing declares, and a comment that says register.tasks. */
type Lists = { register: Record<string, { count(): number }> };
export const sessions = (db: Lists): number => db.register.session.count();
export const taskforce = (db: Lists): number => db.register.taskforce.count();

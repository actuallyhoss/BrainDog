/* CLEAN: a test plants an old clock on purpose. */
const now = Date.now();
const run = { fields: { last_seen: new Date(now - 16 * 60_000).toISOString() } };
console.assert(now - Date.parse(run.fields.last_seen) > 15 * 60_000);

/* CLEAN: the one clock may compare. */
export const WORKING_MS = 15 * 60_000;

export const presenceOf = (run: { fields: { last_seen?: string } }, nowMs: number): string =>
  Date.parse(String(run.fields.last_seen)) >= nowMs - WORKING_MS ? 'working' : 'quiet';

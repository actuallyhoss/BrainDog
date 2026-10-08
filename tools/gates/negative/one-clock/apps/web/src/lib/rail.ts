/* SEEDED: the rail works out "working" in its own words, with its own fifteen minutes. One finding, on the return. */
type Run = { fields: { state?: string; last_seen?: string } };

const QUIET_MS = 15 * 60_000;

export function workingCount(runs: readonly Run[], now: number): number {
  return runs.filter((r) => r.fields.state === 'active' && now - Date.parse(String(r.fields.last_seen)) < QUIET_MS).length;
}

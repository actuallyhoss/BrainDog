/* CLEAN: saying "8m ago", ordering by last seen and a day's edge compare nothing with the clock. A comment that says
   now - last_seen < QUIET_MS is a comment. */
type Run = { fields: { last_seen?: string } };

export const agoOf = (run: Run, now: number): string => `${Math.round((now - Date.parse(String(run.fields.last_seen))) / 60_000)}m ago`;

export function minutesSaid(run: Run): string {
  const mins = Math.round((Date.now() - Date.parse(String(run.fields.last_seen))) / 60_000);
  return `${mins}m ago`;
}

export const newestFirst = (runs: Run[]): Run[] => runs.sort((a, b) => String(b.fields.last_seen).localeCompare(String(a.fields.last_seen)));

export function heardToday(runs: readonly Run[], dayStart: number): Run[] {
  return runs.filter((r) => {
    const seen = Date.parse(String(r.fields.last_seen));
    return seen >= dayStart;
  });
}

// const late = now - Date.parse(run.fields.last_seen) > STALE_MS;

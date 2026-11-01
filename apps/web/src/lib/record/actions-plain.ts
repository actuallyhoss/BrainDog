/**
 * The scheduled actions' pure parts (`actions.ts` re-exports them): which belong to a project, and how often one runs.
 * In a file of their own so a declared page (`page/panels.ts`) and a list of scripts (`scripts.ts`) can ask them
 * without the actions' reader and words.
 */

import type { ActionRow } from './actions.ts';

/** The project a page is drawn for, as `forProject` matches an action to it: its row as a person says it, and its title. */
export type ForProject = { spoken: string; title: string };

/**
 * A project's actions, its own first and then the ones for every project.
 *
 * MATCHED BY THE ROW, as the record resolves the project an action's declaration names (`listActions`,
 * `project_row`): a declaration holds a row id, which is no name, so matching it against the project's title found
 * nothing and an action declared for a project showed on no page. An action the record could not resolve,
 * or one from a host that does not resolve, is matched by what it holds: the spoken id, or the name case-blind,
 * because a declaration typed `kiln` and a project called Kiln are the same project to a person.
 *
 * `null` is no project: Settings, ingest lists every action as its own, none of them faint.
 */
export function forProject(rows: readonly ActionRow[], project: ForProject | null): { own: ActionRow[]; everywhere: ActionRow[] } {
  const name = (r: ActionRow) => r.ingest;
  const by = (a: ActionRow, b: ActionRow) => name(a).localeCompare(name(b));
  if (project === null) return { own: [...rows].sort(by), everywhere: [] };
  const want = project;
  const fold = (s: string) => s.trim().toLowerCase();
  const mine = (r: ActionRow): boolean => {
    if (r.project_row) return r.project_row.spoken === want.spoken;
    return r.project !== null && (r.project === want.spoken || fold(r.project) === fold(want.title));
  };
  return {
    own: rows.filter(mine).sort(by),
    everywhere: rows.filter((r) => r.project === null || r.project === 'global').sort(by),
  };
}

/** `15m`, `1h`, `6h`, `1d` as a person says them. Anything else is printed as it was declared. */
export function often(every: string): string {
  const m = /^(\d+)\s*(m|h|d|w)$/u.exec(every.trim());
  if (!m) return every;
  const n = Number(m[1]);
  const unit = { m: 'minute', h: 'hour', d: 'day', w: 'week' }[m[2] as 'm' | 'h' | 'd' | 'w'];
  return n === 1 ? `every ${unit}` : `every ${n} ${unit}s`;
}

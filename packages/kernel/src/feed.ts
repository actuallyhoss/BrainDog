/**
 * What a new record's feed says about its own setting up: one line, not one line a row.
 *
 * A USE CASE ARRIVES WITH EXAMPLE ROWS, AND EACH ONE IS A WRITE. Installing Personal created forty rows and then linked a
 * run to its goal and a step to its project, one write each, so Home's "Since you last looked" opened on some fifty lines
 * of the record setting itself up, and a person's first real change sat under all of them. The log keeps every one of
 * those writes; what the feed says about them is a single line.
 *
 * A SETUP IS A RUN OF WRITES TO EXAMPLE ROWS AND THE INSTALLS THEY CAME WITH, next to each other in the log: a row
 * created carrying the `example` tag, a link set on an example row where there was none, and a pack installed. A run
 * with at least two example writes is said as one line of kind `setup`, which names the use case installed (or the
 * newest pack, or none) in `target` and how many example rows were added in `to`. Anything else in the log breaks the
 * run, so a person's own edit to an example row is never folded into it.
 *
 * THE CORE NAMES NO USE CASE. The line carries the pack id, and the host says it in its own words.
 */

/** The parts of a log line this reads. */
export type FeedLine = {
  kind: string;
  target: string | null;
  target_kind: string | null;
  field: string | null;
  from: unknown;
  to: unknown;
  register: string | null;
  seq: number | null;
  title: string | null;
};

/** The kind of the one line a setup is said as. */
export const SETUP_KIND = 'setup';

/** A use case's pack starts with this, as `declare` names it. */
const USE_CASE = 'usecase-';

const tagged = (to: unknown): boolean =>
  typeof to === 'object' && to !== null && Array.isArray((to as { tags?: unknown }).tags) && ((to as { tags: unknown[] }).tags).includes('example');

/**
 * Collapses setups as the log is walked newest first. `push` each line in order and emit what it answers; `flush` once
 * at the end. `isExample` answers whether the row a line is about carries the `example` tag, for a link, whose line
 * holds only the field that changed.
 */
export function setupCollapser<L extends FeedLine>(isExample: (line: L) => boolean): { push: (line: L) => L[]; flush: () => L[] } {
  let run: L[] = [];
  const role = (line: L): 'create' | 'link' | 'install' | null => {
    if (line.kind === 'install' && line.target_kind === 'pack') return 'install';
    if (line.register === null) return null;
    if (line.kind === 'create' && tagged(line.to)) return 'create';
    if (line.kind === 'edit' && (line.from === null || line.from === undefined || line.from === '') && isExample(line)) return 'link';
    return null;
  };
  const said = (): L[] => {
    const lines = run;
    run = [];
    const writes = lines.filter((l) => role(l) !== 'install');
    if (writes.length < 2) return lines;
    const installs = lines.filter((l) => role(l) === 'install');
    const base = installs.find((l) => (l.target ?? '').replace(/^pack:/u, '').startsWith(USE_CASE)) ?? installs[0] ?? lines[0]!;
    const created = lines.filter((l) => role(l) === 'create').length;
    return [
      {
        /* THE NEWEST LINE'S PLACE IN THE LOG, so a read mark taken from it covers the whole setup. */
        ...lines[0]!,
        kind: SETUP_KIND,
        target: installs.length > 0 ? base.target : null,
        target_kind: installs.length > 0 ? 'pack' : null,
        field: null,
        from: null,
        to: created,
        register: null,
        seq: null,
        title: null,
      },
    ];
  };
  return {
    push(line) {
      if (role(line) !== null) {
        run.push(line);
        return [];
      }
      return [...said(), line];
    },
    flush: said,
  };
}

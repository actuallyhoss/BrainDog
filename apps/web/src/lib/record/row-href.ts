/**
 * Where a row said by its spoken id opens: `{{ref:tasks#241}}` in a note, on a declared page and on a row's screen.
 *
 * ONE HELPER, BECAUSE THERE WERE TWO ANSWERS. A row's screen turned a spoken id into `/r/<list>/<n>` with a function of
 * its own, and a declared page handed the renderer no `link` at all, so the same words were a link on one screen and
 * plain text on the other. Both ask here now.
 *
 * THE ROW'S OWN PAGE WHERE ITS LIST MADE ONE. A list with a template (`for:` in `packages/kernel/src/pages.ts`) has one
 * page per row it takes, and that page is where a project is read: its work, its money, its notes. A slug is made from
 * the row's name, so it cannot be worked out from the spoken id: `boot` says which page is about which row (`about`),
 * and `learnRowPages` keeps that. A row the template left out, a list with no template, and a record that sent no
 * pages all open the row's screen, which every row has.
 *
 * AND WHERE A HOLE'S VALUE LIVES (`holePlace`, below), which is the same question asked of a path with no value.
 *
 * Record-relative, like every address the record writes: the caller's `href` puts it under the app (`$lib/at.ts`).
 */

import { METRICS } from './declared.ts';
import { REGISTERS } from './held.ts';
import { hrefFor } from './metrics.ts';

/** A page as `boot` lists it, as far as this file reads it: its slug and the row a template made it for. */
export type PageAbout = { slug: string; about?: { register: string; seq: number | null } | null | undefined };

/** A list and a row's number, from `tasks#241`. Nothing else is a spoken id: no path, no query, no address. */
export function spokenOf(spoken: string): { register: string; seq: number } | null {
  const m = /^([a-z][a-z0-9_]*)#([1-9]\d*)$/u.exec(spoken.trim());
  return m ? { register: m[1]!, seq: Number(m[2]) } : null;
}

const keyOf = (register: string, seq: number): string => `${register}#${seq}`;

/** Each row a template made a page for, by spoken id, to that page's slug. The first page about a row is its own. */
export function rowPagesOf(pages: readonly PageAbout[] | null | undefined): Map<string, string> {
  const out = new Map<string, string>();
  for (const p of pages ?? []) {
    if (!p.about || p.about.seq === null) continue;
    const key = keyOf(p.about.register, p.about.seq);
    if (!out.has(key)) out.set(key, p.slug);
  }
  return out;
}

/**
 * The address, from what it is handed: `held` says whether the tab holds a list, `pages` is `rowPagesOf`.
 * `null` for words that are not a spoken id and for a list the tab does not hold, and the renderer draws those plain.
 */
export function rowHrefIn(spoken: string, held: (register: string) => boolean, pages: ReadonlyMap<string, string>): string | null {
  const row = spokenOf(spoken);
  if (row === null || !held(row.register)) return null;
  const slug = pages.get(keyOf(row.register, row.seq));
  return slug === undefined ? `/r/${row.register}/${row.seq}` : `/p/${encodeURIComponent(slug)}`;
}

/* THE PAGES THE RECORD LAST SAID, kept as `learnMoney` keeps its currencies (`api.ts`): a shell over a refusal sends
   none, so the last record's pages are forgotten with it. */
let learnt: ReadonlyMap<string, string> = new Map();

/** `boot`'s pages, as the shell reads them. Called with nothing, every row opens on its screen. */
export const learnRowPages = (pages: readonly PageAbout[] | null | undefined): void => {
  learnt = rowPagesOf(pages);
};

/** Where a spoken id opens on the record this tab is on, or `null` where it names no row of a list the tab holds. */
export const rowHref = (spoken: string): string | null => rowHrefIn(spoken, (register) => REGISTERS[register] !== undefined, learnt);

/* ── a hole ──────────────────────────────────────────────────────────────── */

/** What `holePlaceIn` asks of the record: the lists and fields a tab holds, and where a figure's rows are. */
export type HoleAsk = {
  held: (register: string) => boolean;
  /** Whether a list declares a field of that id. */
  field: (register: string, field: string) => boolean;
  /** Where the rows a figure is worked out over are, or `null` for no such figure and for one that reads no list. */
  figure: (id: string) => string | null;
};

/**
 * Where the value a path names lives, for a path the record answered with nothing: the place a person goes to fill it.
 *
 * A HOLE IS A TASK, AND THE FIRST THING TO TRY IS THE PLACE ITSELF. `{{tasks#4.due}}` with no day is filled on that
 * task's screen, where its fields are written (its own page, where it has one, draws no field to fill). On a page drawn
 * for one row, `{{budget}}` is a field of that row. `{{owed}}` and `{{money.owed}}` are a figure, whose rows are one
 * address (`hrefFor`). `{{tasks.late}}` is the list. `null` for a path that names none of these, and the host then
 * offers to find it out.
 */
export function holePlaceIn(path: string, row: { register: string; seq: number } | null | undefined, ask: HoleAsk): string | null {
  const parts = path.trim().split('.');
  const head = parts[0] ?? '';
  const spoken = spokenOf(head);
  if (spoken !== null) return ask.held(spoken.register) ? `/r/${spoken.register}/${spoken.seq}` : null;
  if (row && ask.held(row.register) && ask.field(row.register, head)) return `/r/${row.register}/${row.seq}`;
  /* A FIGURE BY ITS OWN ID, THEN AS A MODULE SAYS IT (`<module>.<figure>`). A list is asked before the second, since
     `tasks.late` is a list and a state and no module is called what a list is. */
  const whole = ask.figure(path.trim()) ?? ask.figure(head);
  if (whole !== null) return whole;
  if (/^[a-z][a-z0-9_]*$/u.test(head) && ask.held(head)) return `/r/${head}`;
  return parts.length > 1 ? ask.figure(parts[1]!) : null;
}

/** `holePlaceIn` on the record this tab is on. `row` is the row a page is drawn for, where it is drawn for one. */
export const holePlace = (path: string, row?: { register: string; seq: number } | null): string | null =>
  holePlaceIn(path, row, {
    held: (register) => REGISTERS[register] !== undefined,
    field: (register, field) => REGISTERS[register]?.fields.some((f) => f.id === field) === true,
    figure: (id) => (Object.hasOwn(METRICS, id) && METRICS[id] ? hrefFor(METRICS[id]) : null),
  });

/**
 * The words around a hole, as the task it becomes says them: the sentence it sat in, on one line, with the dash a
 * missing value is drawn as taken out. Cut at a word where it runs past what a title holds.
 */
export function holeSentence(said: string | null | undefined, most = 160): string {
  const line = (said ?? '').replace(/[—–]/gu, ' ').replace(/\s+/gu, ' ').trim();
  if (line.length <= most) return line;
  const cut = line.slice(0, most);
  const at = cut.lastIndexOf(' ');
  return `${(at > most / 2 ? cut.slice(0, at) : cut).trimEnd()}…`;
}

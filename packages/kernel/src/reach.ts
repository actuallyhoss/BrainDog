/**
 * Which lists a declaration touches: the one walk the filing check and Decide both ask (`loop/research-decide-reach.md`).
 *
 * THERE WERE TWO COPIES, AND THEY DISAGREED. `listsNamed` in `govern.ts` was the filing check's and `listsIn` in the
 * record was Decide's, and each was patched one audit at a time (thirty-seven to forty, and wave forty-two's checker).
 * Measured over 32 proposals and five callers at `bccc7ea8`: the kernel refused a rule on Inbox under `register.inbox`
 * as reading a list called `trigger` (K4), and filed under that name a script reading Money, a script writing it, an
 * arrival rule on the payroll door, a clock rule, a script naming no list and a door that polls (N1, N2, N4, K8, K9,
 * K7), each of which the record then held from the member invited to Inbox alone. The record in turn marked every page,
 * door, figure and digest `whole` because its copy could not see a page's `sessions.live` or `working: true`, and that
 * over-held 22 of the 160 answers, among them a bundle under `register.inbox` carrying a page over Inbox alone (R1).
 *
 * ITS OWN FILE, IMPORTING NOTHING FROM `govern.ts` OR `pages.ts`. `pages.ts` reads `BODY_KINDS` from `govern.ts` as it
 * loads, which is why `listsNamed` said it could not be imported by the record's side; a module with neither import
 * has no cycle to trip.
 *
 * TWO SENTINELS AND NOT ONE. `ACROSS` is a read across the record (the log, the queue, the scheduled actions, a door
 * that calls out), which the record reads as `wholeRecord`, as the `ACROSS` check on a page block does. `ANY_LIST` is
 * something that may touch any list (a rule with no row, a script naming none, a figure nobody can place), which the
 * record reads as `readsEveryList`, as `automations` and `scripts` do. The first prototype had one sentinel read as
 * `readsEveryList`, and it over-held a member held to `append` on Money from a page with a log block and a polling
 * door that `page` and `actions` both show her. Neither value can be a list's id (`[a-z][a-z0-9_]*`), and that is
 * measured too: the research named the second one `any`, and a list called `any` installs, so a clock rule bundled
 * under `register.any` would have been read as about that list and filed.
 */

import { FIGURE } from './figure.ts';
import { rowRegisterOf } from './flow-lint.ts';
import type { FlowDecl } from './rules.ts';

/** A read across the whole record: the log, the queue, the scheduled actions, a door that calls out. */
export const ACROSS = '*';
/** Something that may touch any list: a rule with no row, a script that names none, a figure nothing places. */
export const ANY_LIST = '?';

/** What `touches` asks of the record, or of the bundle it is judging, to place what a body names by reference. */
export type Resolve = {
  /** Every body a figure's metric may have, as the caller reads it; an empty answer is a figure nothing resolves. */
  figure(id: string): unknown[];
  /** The body of `ingest.<id>`, for an arrival rule's row. */
  door(id: string): unknown;
  /** The fields of a list, for a template page's `{{field}}`. */
  fields(list: string): ReadonlySet<string>;
};

/** The lists a body names, `ACROSS` and `ANY_LIST` among them, and apart from them every figure nothing resolved. */
export type Touched = { lists: Set<string>; unknown: Set<string> };

const isMap = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

/** A register named in full, as a metric's `source`, a table's and a digest section's are. */
const LIST_REF = /^register\.([a-z][a-z0-9_]*)$/;
/** A page block's sources that are not a list and not a figure, and read no list outside what its legs name. */
const PAGE_SOURCES = new Set(['forecast.runway']);
/**
 * The names a rule's template fills from the run and not from a list: `{{trigger.row.what}}`, `{{vars.x}}`, `{{each.0}}`
 * and `{{metric.total}}`, every head `rules.ts`'s `SPELLED` fills besides the row's own `{{field}}`. Read as lists, the
 * kernel refused a rule on Inbox under `register.inbox` as reading `register.trigger` (K4), and a rule reading
 * `{{metric.x}}` was placed under a list called `metric`, so a member was held from it for no reason (62.4b). A figure
 * is still a read: the walk places it through its metric (`FIGURE` below), as it places a page's `{{inbox-count}}`.
 */
const RUN_SCOPE = new Set(['trigger', 'vars', 'each', 'metric']);
/** A door that fetches on its own clock or is called out to, which `actions` lists as a scheduled action. */
const CALLS_OUT = new Set(['pull', 'call', 'poll']);

type Kind = 'rule' | 'page' | 'figure' | 'other';

/**
 * Every list a body names, walked rather than read kind by kind, and every figure it reads that `resolve` cannot place.
 *
 * A LIST IS NAMED IN A DOZEN PLACES: a rule's `register`, a `create` or a `link` inside its `then`, an ingest's
 * `writes.register` or each leg of its route, a `lookup`, a cash walk's legs, a page's `for`. A `register` key or a
 * `register.<id>` string anywhere is a list, and so is `{{list.field}}` or `{{list#3.field}}` in prose.
 */
function walk(body: unknown, kind: Kind, resolve: Resolve, self?: string): Touched {
  const lists = new Set<string>();
  const unknown = new Set<string>();
  /* A METRIC'S OWN `metric:` KEY IS ITS NAME, NOT A READ. Walked as a figure it resolved only because the bundle or the
     record happened to hold the same metric, and a resolver that did not (a measure's, a test's) called it unknown. */
  const seen = new Set<string>(self === undefined ? [] : [self]);
  const page = kind === 'page';
  const forList = page && isMap(body) && isMap(body.for) && typeof body.for.register === 'string' ? body.for.register : null;
  const fields = forList === null ? new Set<string>() : resolve.fields(forList);
  const figure = (said: string): void => {
    /* THE FIRST COLON SEPARATES, as `pages.ts` reads a cell: `project-owed:C:\Repos` is one project's figure. */
    const at = said.indexOf(':');
    const id = at < 0 ? said : said.slice(0, at);
    if (seen.has(id)) return;
    seen.add(id);
    const found = resolve.figure(id).filter((m) => m !== undefined && m !== null);
    if (found.length === 0) unknown.add(id);
    for (const metric of found) visit(metric, undefined);
  };
  const visit = (node: unknown, key: string | undefined): void => {
    if (typeof node === 'string') {
      const ref = LIST_REF.exec(node);
      if (ref) lists.add(ref[1]!);
      else if (node.startsWith('metric.')) figure(node.slice('metric.'.length));
      else if (key === 'register') lists.add(node);
      else if (key === 'metric') figure(node);
      /* A FORECAST'S `late:` AND A SERIES LINE'S `then:` AND `each:` ARE FIGURES TOO, which a check reading only `metric`
         keys let through: a forecast whose late mark counted Diary was filed under `register.obligations`. */
      else if (page && (key === 'late' || key === 'then' || key === 'each')) figure(node);
      /* A PAGE SOURCE THAT IS NO LIST READS THE RUNS OR THE RECORD AS A WHOLE, as `pages.ts` names it. The record's copy
         lacked this line, and wave forty-two's checker handed a member held to `append` on Session the change declaring
         a page over `sessions.live` while `page` answered her `PAGE_UNKNOWN` for the same page. */
      else if (page && key === 'source' && !PAGE_SOURCES.has(node)) lists.add(node === 'sessions.live' ? 'session' : ACROSS);
      for (const m of node.matchAll(/\{\{\s*(?:[a-z]+:)?\s*([a-z][a-z0-9_]*)(?:#\d+)?\.[A-Za-z]/g))
        if (!(kind === 'rule' && RUN_SCOPE.has(m[1]!))) lists.add(m[1]!);
      /* A RULE'S `{{metric.cash-now}}` IS THE FIGURE, read by the run through `figureText`, so it touches the list the
         figure counts and not one called `metric`. A page has no such spelling: `pathOf` reads `metric.x` there as a
         state count of a list called `metric`, which is what the line above keeps it as. */
      if (kind === 'rule') for (const m of node.matchAll(FIGURE)) figure(m[2]!);
      /* A BARE `{{diary-count}}` IN A PAGE'S PROSE IS A FIGURE, as `pathOf` reads one. A code span is text and is skipped,
         as `pathsOf` skips it, and in a template a field of the row is the row's, and so is `{{spoken}}`: `fill` answers
         it with the row's spoken id before it reads a field or a metric, and `declare.ts` reserves the word as a field
         id. Read as a figure it refused the seed's own `page.skill` under `register.skills`. The record's copy read every
         one as a figure, and held a bundle carrying a template for Inbox from Inbox's readers (K3). */
      if (page)
        for (const m of node.replace(/`[^`]*`/g, ' ').matchAll(/\{\{\s*(?:[a-z]+:\s*)?([a-z][a-z0-9_-]*)\s*\}\}/g))
          if (!(forList !== null && (fields.has(m[1]!) || m[1] === 'spoken'))) figure(m[1]!);
      return;
    }
    if (Array.isArray(node)) {
      for (const n of node) visit(n, undefined);
      return;
    }
    if (!isMap(node)) return;
    /* A BLOCK THAT MARKS WHICH ROW HAS AN AGENT ON IT READS THE RUNS, as `registersOf` says. */
    if (page && node.working === true) lists.add('session');
    for (const [k, v] of Object.entries(node)) visit(v, k);
  };
  visit(body, undefined);
  return { lists, unknown };
}

/**
 * The lists the declaration `id` touches with `body`, by its kind, as the read of that kind would place it.
 *
 *   - `register.<id>`: its own id, and nothing else. A ref field's target is what `schema` already shows its readers.
 *   - `rule.<id>`: the list its row lives in (`rowRegisterOf`, the door read through `resolve`), or `ANY_LIST` when it
 *     has no row, as `automations` shows such a rule only to whoever reads every list; and every list the walk finds.
 *   - `script.<id>`: its `reads` and `writes`, or `ANY_LIST` when both are empty, as `scripts` places it. The source is
 *     not walked: the runtime holds a script to what it declares.
 *   - `ingest.<id>`: every list it writes, and `ACROSS` when it calls out, because `actions` refuses a door's host to
 *     anybody who does not read the whole record (K6: the gold door's `api.gold.example.test`).
 *   - `metric.<id>`, and a prediction's measure asked as `metric.`: the list its `source` names, or `ANY_LIST`.
 *   - a page, a digest, a theme, a block: every list and figure the walk finds.
 *
 * A body that is not a map names nothing.
 */
export function touches(id: string, body: unknown, resolve: Resolve): Touched {
  if (!isMap(body)) return { lists: new Set(), unknown: new Set() };
  if (id.startsWith('register.')) return { lists: new Set([id.slice('register.'.length)]), unknown: new Set() };
  if (id.startsWith('script.')) {
    const named = [body.reads, body.writes].flatMap((l) => (Array.isArray(l) ? l.filter((x): x is string => typeof x === 'string') : []));
    return { lists: new Set(named.length === 0 ? [ANY_LIST] : named), unknown: new Set() };
  }
  if (id.startsWith('rule.')) {
    const out = walk(body, 'rule', resolve);
    out.lists.add(rowRegisterOf(body as FlowDecl, (door) => resolve.door(door)) ?? ANY_LIST);
    return out;
  }
  const kind: Kind = id.startsWith('page.') ? 'page' : id.startsWith('metric.') ? 'figure' : 'other';
  const out = walk(body, kind, resolve, kind === 'figure' ? id.slice('metric.'.length) : undefined);
  if (id.startsWith('ingest.') && CALLS_OUT.has(String(body.channel))) out.lists.add(ACROSS);
  /* A FIGURE THAT NAMES NO LIST COUNTS SOMETHING NOBODY CAN PLACE, and a measure over `activity` is one. */
  if (kind === 'figure' && out.lists.size === 0 && out.unknown.size === 0) out.lists.add(ANY_LIST);
  return out;
}

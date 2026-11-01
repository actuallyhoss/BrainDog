/**
 * What an add-on asks to use of yours: every list, figure, page and record-wide view it reads or changes that is not its own, read from
 * the file as written, and the `uses` line in its manifest where its author says the same thing out loud.
 *
 * WHY A LIST AND NOT A TRUST LEVEL. A pack has no verb that reads a row (`index.ts`), so everything it can see is named
 * in a declaration: a page block's `source`, a figure's, a digest section's, a rule's `register`, a feed's
 * `writes.register`, a script's `reads` and `writes`, a field laid on a list through `extends`, a block added to a page
 * through `adds`. The kernel draws, runs and writes only what those name. So the places an add-on can reach ARE the ones
 * its file names, and this module reads them all, the way the plan does, and nothing else is needed to keep it out of
 * the rest: an add-on cannot read a place it did not name.
 *
 * DECLARED AS WELL AS DERIVED, for the stranger. `uses` in the manifest is the author saying it before anybody reads
 * the file, as declaration ids: `["register.transactions", "metric.cash-now", "page.project"]`. A file that says `uses`
 * is held to it wherever it is read (`normalise`): naming a place it did not list there is refused. The Kennel holds
 * every submission to it, with or without the key (`acceptSubmission`), so nothing from outside is listed with a reach
 * its author did not say. A first-party file in `packs/` may leave it out, and what it reaches is still the derived list
 * every screen draws.
 *
 * PURE AND LENIENT ON SHAPE: the raw file a browser holds, never the normalised pack, so the store can say it from the
 * file it verified. A declaration whose kind is not its first key, a value holding a `{{config:}}` placeholder, and the
 * kernel's own `session` list are passed over.
 */

import type { Refusal } from '@braindog/ports';

/** One place of yours an add-on uses: a list, a figure or a page, by its declaration id, and whether it changes it. */
export type Use = { id: string; kind: 'list' | 'figure' | 'page' | 'view'; writes: boolean };

/** The most places `uses` may name: past it a file is asking for the whole record, and is said to. */
export const USES_MOST = 64;

/** The kernel's own lists, which every record holds and no add-on declares. */
const KERNEL_LISTS: ReadonlySet<string> = new Set(['session']);
const LIST = /^[a-z][a-z0-9_]*$/u;
const REGISTER_ID = /^register\.([a-z][a-z0-9_]*)$/u;
const METRIC_ID = /^metric\.([a-z0-9][a-z0-9_-]*)$/u;
const PAGE_ID = /^page\.([a-z0-9][a-z0-9_-]*)$/u;
/**
 * A view of the whole record a block may draw from rather than one list: `activity`, `governance.open`,
 * `sessions.working`, `deadlines`. Each reaches across every list, so it is a place of its own, named as written.
 */
const VIEW_ID = /^(?!register\.|metric\.|page\.)[a-z][a-z_]*(?:\.[a-z_]+)?$/u;
/** Under these keys a list is written to, not only read. */
const WRITE_KEYS: ReadonlySet<string> = new Set(['writes', 'create']);
/** How deep the walk goes; a body deeper than this is the declaration lint's to refuse, not this one's to recurse into. */
const DEEPEST = 24;

type Map = Record<string, unknown>;
const isMap = (v: unknown): v is Map => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The declaration ids a file declares itself, by kind and name, from each declaration's first key. */
function ownIds(doc: Map): Set<string> {
  const own = new Set<string>();
  for (const d of Array.isArray(doc.declarations) ? doc.declarations : []) {
    if (!isMap(d)) continue;
    const kind = Object.keys(d)[0];
    const name = kind === undefined ? undefined : d[kind];
    if (kind !== undefined && typeof name === 'string') own.add(`${kind}.${name}`);
  }
  return own;
}

/**
 * Every place of yours the file uses that it does not declare itself, each once, a write winning over a read, in the
 * order the file first names them. `doc` is the add-on file as written (or a use case's `pack`); anything else uses
 * nothing.
 */
export function usesOf(doc: unknown): Use[] {
  if (!isMap(doc)) return [];
  const own = ownIds(doc);
  const found = new globalThis.Map<string, Use>();
  const note = (id: string, kind: Use['kind'], writes: boolean) => {
    if (own.has(id) || id.includes('{{')) return;
    if (kind === 'list' && KERNEL_LISTS.has(id.slice('register.'.length))) return;
    const had = found.get(id);
    if (had) had.writes ||= writes;
    else found.set(id, { id, kind, writes });
  };
  const list = (name: unknown, writes: boolean) => {
    if (typeof name !== 'string') return;
    const bare = name.replace(/^register\./u, '');
    if (LIST.test(bare)) note(`register.${bare}`, 'list', writes);
  };
  const walk = (v: unknown, writes: boolean, depth: number): void => {
    if (depth > DEEPEST) return;
    if (typeof v === 'string') {
      if (REGISTER_ID.test(v)) note(v, 'list', writes);
      else if (METRIC_ID.test(v)) note(v, 'figure', false);
      return;
    }
    if (Array.isArray(v)) {
      for (const x of v) walk(x, writes, depth + 1);
      return;
    }
    if (!isMap(v)) return;
    for (const [k, x] of Object.entries(v)) {
      const w = writes || WRITE_KEYS.has(k);
      /* A LIST NAMED BARE UNDER `register` (a rule's, a feed's target, a `create`, a page's `for`) OR A REF FIELD'S `to`. */
      if (k === 'register' || (k === 'to' && (v.type === 'ref' || (v.type === 'list' && v.of === 'ref')))) list(x, w);
      /* A BLOCK DRAWN FROM A VIEW OF THE WHOLE RECORD (the activity, the open questions, the live sessions). */
      if (k === 'source' && typeof x === 'string' && VIEW_ID.test(x)) note(x, 'view', false);
      walk(x, w, depth + 1);
    }
  };

  for (const d of Array.isArray(doc.declarations) ? doc.declarations : []) {
    if (!isMap(d)) continue;
    const [kind, ...rest] = Object.keys(d);
    if (kind === undefined) continue;
    /* A SCRIPT SAYS WHAT IT READS AND WRITES IN ITS HEADER, BARE, and the kernel holds every run to it. */
    if (kind === 'script') {
      for (const r of Array.isArray(d.reads) ? d.reads : []) list(r, false);
      for (const r of Array.isArray(d.writes) ? d.writes : []) list(r, true);
    }
    /* A RULE CHANGES THE ROWS OF THE LIST IT IS ABOUT. */
    if (kind === 'rule') list(d.register, true);
    for (const k of rest) {
      if (k === 'source' && kind === 'script') continue;
      if (kind === 'rule' && k === 'register') continue;
      walk(d[k], WRITE_KEYS.has(k), 1);
    }
  }
  /* FIELDS LAID ON A LIST OF YOURS CHANGE THAT LIST; A BLOCK ADDED TO A PAGE OF YOURS CHANGES THAT PAGE. */
  if (isMap(doc.extends)) for (const id of Object.keys(doc.extends)) list(id, true);
  for (const a of Array.isArray(doc.adds) ? doc.adds : []) {
    if (!isMap(a)) continue;
    if (typeof a.page === 'string' && PAGE_ID.test(a.page)) note(a.page, 'page', true);
    walk(a, false, 1);
  }
  walk(doc.widgets, false, 1);
  return [...found.values()];
}

/** What a file's `uses` line says, read: the ids it names, `null` when it says none, or why it cannot be read. */
export function usesSaid(doc: unknown): { ok: true; value: string[] | null } | { ok: false; refusal: Refusal } {
  if (!isMap(doc) || doc.uses === undefined) return { ok: true, value: null };
  const bad = (fix: string): { ok: false; refusal: Refusal } => ({ ok: false, refusal: { code: 'PACK_MALFORMED', fix, at: 'uses' } });
  if (!Array.isArray(doc.uses)) return bad('uses is a list of the places of yours this add-on reads or changes, such as ["register.transactions", "metric.cash-now"].');
  if (doc.uses.length > USES_MOST) return bad(`uses names ${doc.uses.length} places, and an add-on names at most ${USES_MOST}. Ask for fewer.`);
  const out: string[] = [];
  for (const u of doc.uses) {
    if (typeof u !== 'string' || !(REGISTER_ID.test(u) || METRIC_ID.test(u) || PAGE_ID.test(u) || VIEW_ID.test(u)))
      return bad('Each place in uses is a list, a figure, a page or a view by its id: register.<list>, metric.<figure>, page.<page>, or a view such as activity.');
    if (!out.includes(u)) out.push(u);
  }
  return { ok: true, value: out };
}

/**
 * Why a file may not be read as it asks: a place it uses that its `uses` line does not name, said by its id with the
 * line to add. `strict` holds a file that says no `uses` at all to an empty one, which is how the Kennel reads a
 * submission; otherwise a file that says none is not asked. `null` when it asks for everything it uses.
 */
export function usesFault(doc: unknown, strict = false): Refusal | null {
  const said = usesSaid(doc);
  if (!said.ok) return said.refusal;
  if (said.value === null && !strict) return null;
  const named = new Set(said.value ?? []);
  const missing = usesOf(doc).filter((u) => !named.has(u.id));
  if (missing.length === 0) return null;
  const ids = missing.map((u) => u.id);
  const first = ids.slice(0, 3).join(', ');
  const more = ids.length > 3 ? ` and ${ids.length - 3} more` : '';
  return {
    code: 'PACK_MALFORMED',
    fix: `This add-on uses ${first}${more} without asking. Name every place of yours it reads or changes in uses, so a person sees it before installing: "uses": ${JSON.stringify([...(said.value ?? []), ...ids])}.`,
    at: 'uses',
  };
}

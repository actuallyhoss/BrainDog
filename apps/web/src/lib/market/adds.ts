/**
 * "What it adds" on a listing's detail page, read from the document it would install: each list with its fields, each
 * page, each figure with its target and window, each rule as a sentence, and how many example rows come with it.
 *
 * READ FROM THE FILE, NEVER WRITTEN FOR THE PAGE, so the page cannot promise what installing does not do. The document is
 * the one the plan is read from: an add-on's verified file, a module's `packDocument`, or a use case's own pack.
 *
 * LENIENT, AS THE RECORD IS. A declaration this build does not know is left out rather than refused: the plan sheet is
 * where the record says what it will and will not take, and this is only the summary above it.
 */

import { words } from './words.ts';

type Body = Record<string, unknown>;

export type Adds = {
  lists: { id: string; name: string; fields: string[] }[];
  pages: { id: string; title: string }[];
  figures: { id: string; name: string; target: string | null; window: string | null }[];
  rules: string[];
  examples: number;
};

const isMap = (v: unknown): v is Body => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** The document's declarations wherever it keeps them: a pack's own, or a use case file's `pack`. */
function declarationsOf(doc: unknown): { declarations: Body[]; seeds: number } {
  const at = [doc, isMap(doc) ? doc.pack : null, isMap(doc) && isMap(doc.usecase) ? doc.usecase.pack : null].find((d) => isMap(d) && Array.isArray(d.declarations));
  if (!isMap(at)) return { declarations: [], seeds: 0 };
  return { declarations: (at.declarations as unknown[]).filter(isMap), seeds: Array.isArray(at.seeds) ? at.seeds.length : 0 };
}

/** A target said plainly: "at least 0", "at most 12", "exactly 3". */
function targetOf(t: unknown): string | null {
  if (!isMap(t)) return null;
  const said = [
    typeof t.gte === 'number' || typeof t.gte === 'string' ? words.atLeast(String(t.gte)) : null,
    typeof t.lte === 'number' || typeof t.lte === 'string' ? words.atMost(String(t.lte)) : null,
    typeof t.eq === 'number' || typeof t.eq === 'string' ? words.exactly(String(t.eq)) : null,
  ].filter((s): s is string => s !== null);
  return said.length > 0 ? said.join(', ') : null;
}

/** A window said plainly: `30d` is "over 30 days", `12w` "over 12 weeks". */
function windowOf(w: unknown): string | null {
  const m = /^(\d+)([dwmy])$/u.exec(str(w));
  return m ? words.over(Number(m[1]), m[2] as 'd' | 'w' | 'm' | 'y') : null;
}

/** What each list, page and figure is called, by id, with and without its `register.` prefix, for the plan sheet's words. */
export function namesOf(doc: unknown): Map<string, string> {
  const names = new Map<string, string>();
  for (const d of declarationsOf(doc).declarations) {
    if (typeof d.register === 'string') {
      const name = str(d.name) || d.register;
      names.set(d.register, name).set(`register.${d.register}`, name);
    } else if (typeof d.page === 'string') names.set(d.page, str(d.title) || d.page).set(`page.${d.page}`, str(d.title) || d.page);
    else if (typeof d.metric === 'string') names.set(d.metric, str(d.name) || d.metric).set(`metric.${d.metric}`, str(d.name) || d.metric);
  }
  return names;
}

/** A rule as a sentence: its own name when it has one, else what starts it. */
function ruleOf(d: Body, names: ReadonlyMap<string, string>): string {
  if (str(d.name) !== '') return str(d.name);
  const on = isMap(d.on) ? d.on : {};
  const written = isMap(on.written) ? on.written : null;
  if (written) return words.ruleWritten(names.get(str(written.register)) ?? str(written.register));
  if (on.schedule !== undefined || on.cron !== undefined || on.every !== undefined) return words.ruleScheduled;
  return words.ruleOther;
}

/** Everything a document adds, in the order it declares it. */
export function addsOf(doc: unknown): Adds {
  const { declarations, seeds } = declarationsOf(doc);
  const names = namesOf(doc);
  const out: Adds = { lists: [], pages: [], figures: [], rules: [], examples: seeds };
  for (const d of declarations) {
    if (typeof d.register === 'string') {
      const fields = Array.isArray(d.fields) ? d.fields.filter(isMap).map((f) => str(f.label) || str(f.id)).filter((f) => f !== '') : [];
      out.lists.push({ id: d.register, name: names.get(d.register) ?? d.register, fields });
    } else if (typeof d.page === 'string') out.pages.push({ id: d.page, title: names.get(d.page) ?? d.page });
    else if (typeof d.metric === 'string') out.figures.push({ id: d.metric, name: names.get(d.metric) ?? d.metric, target: targetOf(d.target), window: windowOf(d.window) });
    else if (typeof d.rule === 'string') out.rules.push(ruleOf(d, names));
  }
  return out;
}

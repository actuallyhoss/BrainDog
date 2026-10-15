/**
 * What a scheduled action writes, for the install's approval (SHL-C09: "An agent can propose a scheduled action: the
 * host, the interval, the key by reference, and what it writes", D0b.55 to D0b.59).
 *
 * THE LINE SAID WHERE AND HOW OFTEN AND NOT WHAT LANDS. `CALLS OUT <host> · every 1h · grant "<label>"` is the whole of
 * what a person approved, and it "does not show the measures or the paths" ([SET] 1.8): a poll filing five numbers on
 * one project read exactly as one filing one number everywhere. So the plan carries the list, the project and the
 * measures, and one sentence under the line, "Writes Numbers on Bake: revenue, customers, 3 more."
 *
 * NAMES, NEVER IDS. The list, the project and each field go through the `nameOf` the caller hands in, which answers a
 * list's id with its name, a project's row id with its title, and `<list>.<field>` with the field's label. A list or a
 * field it cannot name is said as written with its underscores read as spaces, and a project's row id as "another project".
 *
 * STATIC, FROM THE DECLARATION ALONE, as `egressOf` is: nothing here reads the record.
 */

/** The list an action files in, the project it files for, and the measures it fills, all by name. */
export type Writes = {
  list: string;
  /** The project's name, `everywhere` for an action that runs for the whole record, or `null` for a series. */
  project: string | 'everywhere' | null;
  /** Each measure a map names, or else each field it reads out of the answer, in the order declared. */
  measures: string[];
};

/** How many measures the sentence holds before it counts the rest. */
const SAID = 3;

/** A row id, bare or with its list (`projects#01J...`), which a person never reads. */
const ROW_ID = /^(?:[a-z][a-z0-9_]*#)?[0-9A-HJKMNP-TV-Z]{26}$/u;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);

/**
 * What a `pull`, `poll` or `call` body writes, or `null` when it writes nothing.
 *
 * A `call` OR A `poll` FILES ONLY WITH `writes` AND A MAPPING, an `extract` or a `map`, which is the kernel's own test
 * before it files an answer (`runActions`); without one the answer is handed on and kept nowhere. A `pull` files what its
 * connector reads, so its `writes` is enough.
 *
 * A MEASURE IS WHAT A MAP NAMES: a numbers list's map says which measure each entry is with a literal `name`
 * (`{ name: { value: 'Revenue' }, value: { path: 'data.mrr' } }`). A map entry that names none fills fields from the
 * answer, and those fields are what it writes, by label; so is every field an `extract` reads.
 */
export function writesOf(body: unknown, nameOf: (ref: string) => string | null): Writes | null {
  if (!isObject(body) || !isObject(body.writes)) return null;
  const channel = body.channel;
  if (channel !== 'pull' && channel !== 'poll' && channel !== 'call') return null;
  const mapped = body.map !== undefined || body.extract !== undefined;
  if (channel !== 'pull' && !mapped) return null;

  const named = (ref: string): string => text(nameOf(ref)) ?? ref.replace(/_/gu, ' ');
  const series = text(body.writes.series);
  if (series !== null) return { list: named(series), project: null, measures: [] };

  /* A LIST, OR THE LISTS A ROUTED PULL FILES INTO, each `to` entry naming one. */
  const register = body.writes.register;
  const ids = typeof register === 'string'
    ? [register]
    : isObject(register) && Array.isArray(register.to)
      ? register.to.flatMap((t) => (isObject(t) && typeof t.register === 'string' ? [t.register] : []))
      : [];
  const lists = [...new Set(ids.filter((id) => id !== ''))];
  if (lists.length === 0) return null;
  const list = lists.map(named).join(' and ');

  const field = (key: string): string => text(lists.length === 1 ? nameOf(`${lists[0]}.${key}`) : null) ?? key.replace(/_/gu, ' ');
  const measures: string[] = [];
  const entries = Array.isArray(body.map) ? body.map : isObject(body.map) ? [body.map] : [];
  for (const entry of entries) {
    if (!isObject(entry)) continue;
    const measure = isObject(entry.name) ? text(entry.name.value) : null;
    if (measure !== null) measures.push(measure);
    else for (const [key, m] of Object.entries(entry)) if (isObject(m) && m.path !== undefined) measures.push(field(key));
  }
  if (isObject(body.extract)) for (const key of Object.keys(body.extract)) measures.push(field(key));

  /* A PROJECT THE RECORD CANNOT NAME IS NEVER SAID BY ITS ROW ID: it is "another project", as the kernel's key line says. */
  const project = text(body.project);
  const where = project === null ? 'everywhere' : text(nameOf(project)) ?? (ROW_ID.test(project) ? 'another project' : project);
  return { list, project: where, measures: [...new Set(measures)] };
}

/**
 * The sentence under the call line: "Writes Numbers on Bake: revenue, customers, 3 more."
 *
 * AT MOST THREE ITEMS: up to three measures are named, and past three the first two are named and the rest counted, so
 * the sentence is never longer than a line on a phone and never says "1 more" in place of a name it had room for.
 */
export function writesLine(w: Writes): string {
  const where = w.project === null ? '' : w.project === 'everywhere' ? ' everywhere' : ` on ${w.project}`;
  if (w.measures.length === 0) return `Writes ${w.list}${where}.`;
  const said = w.measures.length <= SAID ? w.measures : [...w.measures.slice(0, SAID - 1), `${w.measures.length - (SAID - 1)} more`];
  return `Writes ${w.list}${where}: ${said.join(', ')}.`;
}

/**
 * The `nameOf` the plan hands `writesOf`: a list's name and a field's label from the pack's own declarations, then the
 * record's, and a project's title from the record's rows (`Installed.nameOf`).
 *
 * THE PACK FIRST, because a list it declares is named the way this version names it, which is what the person
 * installing it will see from then on.
 */
export function namerOf(
  declarations: readonly { kind: string; body: unknown }[],
  held: readonly { kind: string; body: string }[],
  rowName?: (ref: string) => string | null,
): (ref: string) => string | null {
  const lists = new Map<string, { name: string | null; labels: Map<string, string> }>();
  const learn = (body: unknown): void => {
    if (!isObject(body) || typeof body.id !== 'string' || lists.has(body.id)) return;
    const labels = new Map<string, string>();
    if (Array.isArray(body.fields))
      for (const f of body.fields) if (isObject(f) && typeof f.id === 'string' && text(f.label) !== null) labels.set(f.id, f.label as string);
    lists.set(body.id, { name: text(body.name), labels });
  };
  for (const d of declarations) if (d.kind === 'register') learn(d.body);
  for (const d of held)
    if (d.kind === 'register')
      try {
        learn(JSON.parse(d.body) as unknown);
      } catch {
        /* A BODY THAT WILL NOT PARSE NAMES NOTHING, and the ref is said as written. */
      }
  return (ref) => {
    const dot = ref.indexOf('.');
    if (dot > 0) {
      const label = lists.get(ref.slice(0, dot))?.labels.get(ref.slice(dot + 1));
      if (label !== undefined) return label;
    }
    return lists.get(ref)?.name ?? rowName?.(ref) ?? null;
  };
}

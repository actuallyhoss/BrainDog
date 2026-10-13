/**
 * WHAT ACCEPTING A QUESTION DOES, in one short line, from the body its proposer wrote.
 *
 * A queue's lead question is drawn whole (`pages.ts` `openBlock`), and the line a person needs under it is what the
 * yes changes: "Adds 3 to Tasks", "Turns off Money". The body already says it, so the line is read off the body the way
 * the cost band is (`weigh.ts`), never written by the proposer, who would describe their own proposal kindly.
 *
 * THE PERSON'S OWN NAMES, NEVER THE SYSTEM'S. A list is named by its `name` ("Tasks"), a pack by its own, and a page
 * by its title; nothing here says row, register or declaration. A name the record cannot find is the id with its
 * dashes and underscores read as spaces, which is still a word the person has seen in the address bar.
 *
 * LENIENT ABOUT THE BODY for the reason `costOf` is: it comes out of a column a build two versions old may have written,
 * and a line that throws is a queue that will not draw. A body it cannot read says nothing rather than something wrong.
 */

const obj = (v: unknown): Record<string, unknown> => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/**
 * How the line names the person's things: a list by its id, a pack by its id, and a row by where it is (`things#1`), as
 * its title. `null` when the record holds none.
 */
export type DoesNames = { list?: (id: string) => string | null; pack?: (id: string) => string | null; row?: (at: string) => string | null };

/** An id read as words: `usecase-student` is "Usecase student". */
const spoken = (id: string): string => {
  const words = id.replace(/[-_]+/gu, ' ').trim();
  return words === '' ? id : words[0]!.toUpperCase() + words.slice(1);
};

/** Two or three names said as a person says them: "Money and Work", "Money, Work and 2 more". */
const joined = (names: readonly string[]): string => {
  if (names.length <= 2) return names.join(' and ');
  return `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;
};

/** The first letter up, for a line made of clauses that each start lower. */
const capital = (text: string): string => (text === '' ? text : text[0]!.toUpperCase() + text.slice(1));

/** How the declarations a change replaces are named: a page by its title, a list by its name, anything else by its words. */
const WHAT: Readonly<Record<string, string>> = { page: 'page', metric: 'figure', rule: 'rule', ingest: 'way in', skill: 'skill' };

function declarationName(decl: Record<string, unknown>, names: DoesNames): string {
  const id = typeof decl.id === 'string' ? decl.id : '';
  const kind = id.split('.')[0] ?? '';
  const own = id.slice(kind.length + 1);
  const body = obj(decl.body);
  if (kind === 'register') return names.list?.(own) ?? (typeof body.name === 'string' && body.name.trim() !== '' ? body.name : spoken(own));
  const said = typeof body.title === 'string' && body.title.trim() !== '' ? body.title : typeof body.name === 'string' && body.name.trim() !== '' ? body.name : spoken(own);
  const what = WHAT[kind];
  return what === undefined ? said : `the ${said} ${what}`;
}

/**
 * "adds 3 to Tasks", "changes Kiln and Portage in Projects and adds 2", for the rows a rowset or an arrangement writes.
 *
 * THE ROWS IT CHANGES BY NAME, where every one of them has a title the record can find: Decide's lead card read "Changes
 * 2 in Projects." over a question that was about Kiln and Portage. A row it cannot name keeps the count, so the line
 * never names some and counts the rest as if that were all.
 */
function rowsSaid(rows: readonly unknown[], names: DoesNames, register?: string): string[] {
  const by = new Map<string, { adds: number; changes: number; named: (string | null)[] }>();
  for (const r of rows) {
    const row = obj(r);
    const list = register ?? (typeof row.register === 'string' ? row.register : '');
    const n = by.get(list) ?? { adds: 0, changes: 0, named: [] };
    if (typeof row.at === 'string') {
      n.changes += 1;
      n.named.push(names.row?.(row.at) ?? null);
    } else n.adds += 1;
    by.set(list, n);
  }
  return [...by].map(([list, n]) => {
    const name = list === '' ? 'your things' : (names.list?.(list) ?? spoken(list));
    const titled = n.named.filter((t): t is string => t !== null);
    const changed = titled.length === n.changes && n.changes > 0 ? joined([...new Set(titled)]) : String(n.changes);
    if (n.changes === 0) return `adds ${n.adds} to ${name}`;
    if (n.adds === 0) return `changes ${changed} in ${name}`;
    return `changes ${changed} in ${name} and adds ${n.adds}`;
  });
}

/** The packs an arrangement or a pack proposal turns on, off or adds, each a clause. */
function packsSaid(packs: Record<string, unknown>, names: DoesNames): string[] {
  const named = (ids: unknown): string[] => arr(ids).filter((i): i is string => typeof i === 'string').map((i) => names.pack?.(i) ?? spoken(i));
  const out: string[] = [];
  const install = named(packs.install);
  const enable = named(packs.enable);
  const disable = named(packs.disable);
  if (install.length) out.push(`adds ${joined(install)}`);
  if (enable.length) out.push(`turns on ${joined(enable)}`);
  if (disable.length) out.push(`turns off ${joined(disable)}`);
  return out;
}

/** "every hour", "every 15 minutes", from an interval as an action says it (`1h`, `15m`). One it cannot read is "on a schedule". */
const UNITS: Readonly<Record<string, string>> = { s: 'second', m: 'minute', h: 'hour', d: 'day', w: 'week' };
function everySaid(every: string): string {
  const m = /^(\d{1,4})([smhdw])$/u.exec(every.trim());
  if (!m || Number(m[1]) === 0) return 'on a schedule';
  const unit = UNITS[m[2]!]!;
  return Number(m[1]) === 1 ? `every ${unit}` : `every ${Number(m[1])} ${unit}s`;
}

/**
 * "Sends your key 'stripe' to api.stripe.com every hour.", one sentence for each action an install would arm, from the
 * plan's `calls_out` (`@braindog/declare`'s `Diff`) or a proposal's `egress` (`actions.ts` `Egress`).
 *
 * THE KEY BY ITS LABEL AND THE HOST, AND NOTHING ELSE THAT NAMES IT. The diff's own line reads `CALLS OUT <host> · every
 * 1h · grant "<label>"` and carries the action's id beside it; a person approving an install reads which of their keys
 * goes where and how often. The label is the plan's `grant` or the proposal's `key`, and a script's is its labels
 * joined with ", " (`scriptEgress`), which are said one by one. An action with no key sends none, and says "Calls".
 *
 * ONLY WHAT THE PRESS ARMS. An action the record already runs unchanged (`change: 'same'`) was approved before and is
 * left out, so a plan that calls nothing new says nothing. Two actions that read the same are said once.
 */
function callsSaid(calls: readonly unknown[]): string[] {
  const out: string[] = [];
  for (const c of calls) {
    const call = obj(c);
    if (call.change === 'same') continue;
    const every = typeof call.every === 'string' ? call.every.trim() : '';
    const ruled = call.trigger === 'rule' || call.trigger === 'both';
    if (every === '' && !ruled) continue;
    const label = typeof call.grant === 'string' ? call.grant : typeof call.key === 'string' ? call.key : '';
    const labels = label.split(',').map((l) => l.trim()).filter((l) => l !== '');
    const host = typeof call.host === 'string' && call.host.trim() !== '' ? call.host.trim() : 'an address it does not name';
    const day = typeof call.per_day === 'number' && call.per_day > 0 ? `up to ${call.per_day} times a day` : null;
    const often =
      every === ''
        ? `when a rule runs it${day ? `, ${day}` : ''}`
        : `${everySaid(every)}${ruled ? `, and ${day ? `${day} ` : ''}when a rule runs it` : ''}`;
    const what = labels.length === 0 ? `Calls ${host}` : `Sends your ${labels.length === 1 ? 'key' : 'keys'} ${joined(labels.map((l) => `'${l}'`))} to ${host}`;
    const line = `${what} ${often}.`;
    if (!out.includes(line)) out.push(line);
  }
  return out;
}

/** What a body says it calls: a plan's `calls_out`, or a proposal's `egress`. */
const callsIn = (b: Record<string, unknown>): unknown[] => (Array.isArray(b.calls_out) ? b.calls_out : arr(b.egress));

/**
 * What accepting a question of `kind` with `body` would do, as one line, or `''` when the body says nothing this can
 * read. A choice between options changes nothing but the record of what was chosen, and it says so. `install` takes a
 * plan's diff and says what the install would send out, or `''` when it arms nothing new.
 */
export function doesOf(kind: string, body: unknown, names: DoesNames = {}): string {
  const b = obj(body);
  switch (kind) {
    case 'options':
      return 'Records your choice and changes nothing else.';
    case 'rowset': {
      const register = typeof b.register === 'string' ? b.register : '';
      const said = rowsSaid(arr(b.rows), names, register);
      return said.length ? `${capital(said.join(', '))}.` : '';
    }
    case 'change': {
      const to = obj(b.to);
      const listed = Array.isArray(to.declarations) ? arr(to.declarations).map(obj) : [to];
      const named = listed.filter((d) => typeof d.id === 'string').map((d) => declarationName(d, names));
      if (named.length === 0) return '';
      return `${b.from === undefined || b.from === null ? 'Adds' : 'Changes'} ${joined(named)}.`;
    }
    case 'pack': {
      const verb = ['install', 'enable', 'disable'].find((v) => typeof b[v] === 'string');
      if (verb === undefined) return '';
      /* AN INSTALL THAT CALLS OUT SAYS SO AFTER WHAT IT ADDS, key by label and host. Turning a pack on or off arms nothing new. */
      const sends = verb === 'install' ? callsSaid(callsIn(b)) : [];
      return [`${capital(packsSaid({ [verb]: [b[verb]] }, names).join(', '))}.`, ...sends].join(' ');
    }
    /* A PLAN, as `planPack` answers it: only what it sends, since the sheet it is drawn on already says what it adds. */
    case 'install':
      return callsSaid(callsIn(b)).join(' ');
    case 'settings': {
      const values = Object.keys(obj(b.values));
      const pack = typeof b.pack === 'string' ? (names.pack?.(b.pack) ?? spoken(b.pack)) : null;
      if (values.length === 0) return '';
      return `Changes ${values.length === 1 ? 'one setting' : `${values.length} settings`}${pack ? ` of ${pack}` : ''}.`;
    }
    case 'pattern': {
      const ingest = obj(b.ingest);
      const id = typeof ingest.id === 'string' ? ingest.id.replace(/^ingest\./u, '') : '';
      return id ? `Files what arrives through ${spoken(id)} the way the examples show.` : 'Files what arrives the way the examples show.';
    }
    case 'arrange': {
      const parts = [...packsSaid(obj(b.packs), names)];
      const pages = arr(b.pages).length;
      if (pages) parts.push(pages === 1 ? 'lays out one page' : `lays out ${pages} pages`);
      const settings = arr(b.settings).length;
      if (settings) parts.push(settings === 1 ? 'changes one setting' : `changes ${settings} settings`);
      parts.push(...rowsSaid(arr(b.rows), names));
      return parts.length ? `${capital(parts.join(', '))}.` : '';
    }
    default:
      return '';
  }
}

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

import { moneyText } from './ingest.ts';

const obj = (v: unknown): Record<string, unknown> => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/**
 * How the line names the person's things: a list by its id, a pack by its id, and a row by where it is (`things#1`), as
 * its title, and a field of a list by the label the record shows for it. `null` when the record holds none.
 */
export type DoesNames = {
  list?: (id: string) => string | null;
  pack?: (id: string) => string | null;
  row?: (at: string) => string | null;
  field?: (list: string, field: string) => string | null;
  /**
   * What the entry at `at` holds in `field` now, as the record keeps it, and `null` when it holds nothing there.
   * `undefined` is "never say this one": a secret, a file, or an entry or a field the record does not hold. Without it
   * a change names its fields and says no value, so a line is never made of a value nobody checked may be said.
   */
  before?: (at: string, field: string) => unknown;
  /**
   * A value of `field` as a person reads it: a link by the title of what it points at, a choice by its label, and
   * `undefined` for one that cannot be said. Without it a value is said as it is held.
   */
  value?: (list: string, field: string, raw: unknown) => unknown;
};

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
 * "adds 3 to Tasks", "changes Kiln and Portage in Projects and adds 2", for the rows an arrangement writes across its
 * lists. A question about one list's entries says what each patch changes instead (`changesSaid`).
 *
 * THE ROWS IT CHANGES BY NAME, where every one of them has a title the record can find: Decide's lead card read "Changes
 * 2 in Projects." over a question that was about Kiln and Portage. A row it cannot name keeps the count, so the line
 * never names some and counts the rest as if that were all.
 */
function rowsSaid(rows: readonly unknown[], names: DoesNames): string[] {
  const by = new Map<string, { adds: number; changes: number; named: (string | null)[] }>();
  for (const r of rows) {
    const row = obj(r);
    const list = typeof row.register === 'string' ? row.register : '';
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

/** A text longer than this, or one of several lines, is said as what it gains and loses and never quoted. */
const SHORT = 80;
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/**
 * Where an entry is (`things#3`), anywhere in a text ("Fix tasks#8"), or a bare id: a handle, which a line never says.
 * It was held to the whole text, so a title that named an entry in passing was quoted with its handle (audit 79, claim 1).
 */
const HANDLE = /[\w.-]+#\d+|^[0-9A-HJKMNP-TV-Z]{26}$/u;
/** A text that holds an address somebody is written to, or that is a host's name and nothing else. */
const ADDRESS = /@|^(?:[a-z0-9-]+\.)+[a-z]{2,}$/iu;

/**
 * One short value as a person reads it, `null` for none, and `undefined` for one a line cannot say: a handle, a path or
 * an address, a text too long to quote, or a shape it does not know. Money is said in its own currency, a day as a day.
 *
 * A DAY WITH A TIME IS NOT SAID (audit 79, claim 2). An instant's day is whichever one the reader's zone puts it in,
 * and nothing here knows the zone: 22:30 in UTC on the 13th is the 14th in Cairo, and the calendar day cut off the
 * front said the 13th. So only a value held as a day is said as one, and the field of an instant is named alone.
 */
function shortSaid(v: unknown): string | null | undefined {
  if (v === null || v === '') return null;
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : undefined;
  if (typeof v === 'string') {
    const text = v.trim();
    if (text === '') return null;
    const day = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(text);
    if (day && MONTH_NAMES[Number(day[2]) - 1] !== undefined) return `${Number(day[3])} ${MONTH_NAMES[Number(day[2]) - 1]!} ${day[1]!}`;
    if (/^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2})?$/u.test(text)) return undefined;
    return text.length > SHORT || /[\n/\\]/u.test(text) || HANDLE.test(text) || ADDRESS.test(text) ? undefined : text;
  }
  const money = obj(v);
  if (Number.isInteger(money.amount) && typeof money.currency === 'string' && /^[A-Za-z]{3}$/u.test(money.currency)) return moneyText(money.amount as number, money.currency);
  return undefined;
}

/** How many of `now` were not in `was`, and how many of `was` are gone, each counted as often as it appears. */
function gained(was: readonly string[], now: readonly string[]): { adds: number; removes: number } {
  const left = new Map<string, number>();
  for (const w of was) left.set(w, (left.get(w) ?? 0) + 1);
  let adds = 0;
  for (const n of now) {
    const have = left.get(n) ?? 0;
    if (have > 0) left.set(n, have - 1);
    else adds += 1;
  }
  return { adds, removes: [...left.values()].reduce((sum, n) => sum + n, 0) };
}

/** "adds 2 lines to Text and removes 1", "removes 1 from The plan", or `null` when nothing is gained or lost. */
function gainSaid(label: string, was: readonly string[], now: readonly string[], unit: string): string | null {
  const { adds, removes } = gained(was, now);
  const of = (n: number): string => (unit === '' ? String(n) : `${n} ${unit}${n === 1 ? '' : 's'}`);
  if (adds > 0) return `adds ${of(adds)} to ${label}${removes > 0 ? ` and removes ${removes}` : ''}`;
  return removes > 0 ? `removes ${of(removes)} from ${label}` : null;
}

/** The lines of a text, without the space that trails each or the empty ones that end it. */
const linesOf = (text: string): string[] => {
  const lines = text.split(/\r?\n/u).map((l) => l.trimEnd());
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines;
};
const isLong = (v: unknown): v is string => typeof v === 'string' && (v.length > SHORT || v.includes('\n'));

/**
 * What one field of a patch does, as a clause: "changes Stage from Building to Live", "sets Stage to Live", "clears
 * Stage", "adds 2 lines to Text and removes 1". `null` when the line can name the field and nothing more, because
 * either value is one it cannot say or the two read alike.
 */
function fieldSaid(label: string, was: unknown, now: unknown): string | null {
  if (was === undefined || now === undefined || was === now) return null;
  if (Array.isArray(was) || Array.isArray(now)) {
    const each = (v: unknown): (string | null | undefined)[] => (Array.isArray(v) ? v : v === null || v === '' ? [] : [v]).map(shortSaid);
    const [a, b] = [each(was), each(now)];
    return a.includes(undefined) || b.includes(undefined) ? null : gainSaid(label, a.map(String), b.map(String), '');
  }
  if (isLong(was) || isLong(now)) {
    if (typeof now !== 'string' && now !== null) return null;
    if (typeof was !== 'string' && was !== null) return null;
    const [a, b] = [linesOf(was ?? ''), linesOf(now ?? '')];
    if (b.length === 0) return `clears ${label}`;
    return a.length <= 1 && b.length <= 1 ? `${a.length === 0 ? 'writes' : 'rewrites'} ${label}` : gainSaid(label, a, b, 'line');
  }
  const [a, b] = [shortSaid(was), shortSaid(now)];
  if (a === undefined || b === undefined || a === b) return null;
  if (b === null) return `clears ${label}`;
  return a === null ? `sets ${label} to ${b}` : `changes ${label} from ${a} to ${b}`;
}

/** A patch says this many fields in full; the rest are named after them, so the line stays one line. */
const IN_FULL = 3;
const count = (n: number): string => (n === 1 ? 'one' : String(n));

/**
 * "Changes Stage from Building to Live in Projects.", what the entries a question writes to one list gain, lose and
 * become, read off each patch and what the entry holds now (`DoesNames.before`).
 *
 * THE CHANGE, NEVER THE ENTRY. The question above the line already names it ("Change Kiln?"), and the line under it
 * read "Changes Kiln in Projects.", which said the entry twice and the change not at all. A field is said by the label
 * the record shows; a short value from what it was to what it becomes; a long text and a field that holds several by
 * how many they gain and lose; and a value that may not be said, or that the record was not asked for, by its field alone.
 *
 * SEVERAL ENTRIES SAY WHAT THEY SHARE: "sets Stage to Live on 3" where each is given the same value, and "changes Stage
 * on 3" where they are not, since a value from one of them would read as the value of all. A delete and a bring back
 * are their own words, and an entry added keeps "adds 2".
 */
function changesSaid(rows: readonly unknown[], names: DoesNames, list: string): string {
  const name = list === '' ? 'your things' : (names.list?.(list) ?? spoken(list));
  const label = (field: string): string => names.field?.(list, field) ?? spoken(field);
  const read = (field: string, raw: unknown): unknown => (raw === undefined || names.value === undefined ? raw : names.value(list, field, raw));
  let adds = 0;
  let deletes = 0;
  let restores = 0;
  const patched: { at: string; patch: Record<string, unknown> }[] = [];
  for (const r of rows) {
    const row = obj(r);
    if (typeof row.at !== 'string') adds += 1;
    else if (!Object.hasOwn(obj(row.patch), 'deleted_at')) patched.push({ at: row.at, patch: obj(row.patch) });
    else if (obj(row.patch).deleted_at === null) restores += 1;
    else deletes += 1;
  }
  const fields = [...new Set(patched.flatMap((p) => Object.keys(p.patch)))];
  const full: string[] = [];
  const bare: string[] = [];
  for (const field of fields) {
    /* WHAT EACH ENTRY WOULD HOLD, and what it holds now: one entry says both, several say only a value they all take.
       ONE ENTRY IS READ, WHICHEVER IT IS (audit 79, claim 3). What several entries held is never said, so reading it of
       each was a read for every entry and field on every draw of the queue: 2,500 for one question changing five
       fields of 500 entries. The one thing those reads decided is whether the field may be valued at all, a secret or
       a file, and that is the list's to say and the same for every entry of it, so the first is asked for all. */
    const sent = patched.every((p) => Object.hasOwn(p.patch, field));
    const was = sent ? read(field, names.before?.(patched[0]!.at, field)) : undefined;
    const now = patched.map((p) => read(field, p.patch[field]));
    const shared = was !== undefined && !now.includes(undefined) && now.every((v) => JSON.stringify(v) === JSON.stringify(now[0]));
    const emptied = now[0] === null || now[0] === '';
    const together = !shared || isLong(now[0]) || Array.isArray(now[0]) ? null : emptied ? `clears ${label(field)}` : fieldSaid(label(field), null, now[0]);
    const said = full.length >= IN_FULL ? null : patched.length === 1 ? fieldSaid(label(field), was, now[0]) : together;
    /* A FIELD IT CANNOT SAY MORE OF IS STILL NAMED, once, after the ones said in full: the patch sends it. */
    if (said !== null) full.push(said);
    else if (!bare.includes(label(field))) bare.push(label(field));
  }
  const parts: { whole: string; short: string }[] = [];
  if (patched.length > 0) {
    const clauses = [...full, ...(bare.length ? [`changes ${joined(bare)}`] : [])];
    const on = patched.length === 1 ? '' : ` on ${patched.length}`;
    const what = clauses.length ? `${clauses.join(', ')}${on}` : `changes ${patched.length}`;
    parts.push({ whole: `${what} in ${name}`, short: what });
  }
  if (deletes > 0) parts.push({ whole: `deletes ${count(deletes)} from ${name}`, short: `deletes ${count(deletes)}` });
  if (restores > 0) parts.push({ whole: `brings ${count(restores)} back to ${name}`, short: `brings ${count(restores)} back` });
  if (adds > 0) parts.push({ whole: `adds ${adds} to ${name}`, short: `adds ${adds}` });
  const [head, ...rest] = parts;
  if (head === undefined) return '';
  return rest.length === 0 ? head.whole : `${head.whole}${rest.length === 1 ? ' and ' : ', '}${listed(rest.map((p) => p.short))}`;
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

/** Every name said, none counted: "Amount", "Amount and Status", "Amount, Due on and Status". What leaves is never "2 more". */
const listed = (names: readonly string[]): string => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]!}`);

/**
 * "It sends Amount and Status of invoices.", the fields that leave with a call a rule runs, from the plan's `sends`
 * (each `<list>.<field>`), or `null` when it sends none. A field is said by the label the record shows and its list by
 * its name; one the record cannot name is its id read as words. Each list is said once, with every field of it.
 */
function fieldsSaid(sends: unknown, names: DoesNames): string | null {
  const by = new Map<string, string[]>();
  for (const s of arr(sends)) {
    if (typeof s !== 'string' || s.trim() === '') continue;
    const dot = s.indexOf('.');
    const list = dot < 0 ? '' : s.slice(0, dot).trim();
    const field = s.slice(dot + 1).trim();
    if (field === '') continue;
    const label = (list === '' ? null : names.field?.(list, field)) ?? spoken(field);
    const of = by.get(list) ?? [];
    if (!of.includes(label)) of.push(label);
    by.set(list, of);
  }
  if (by.size === 0) return null;
  const parts = [...by].map(([list, fields]) => (list === '' ? listed(fields) : `${listed(fields)} of ${names.list?.(list) ?? list.replace(/[-_]+/gu, ' ')}`));
  return `It sends ${parts.length === 2 ? parts.join(', and ') : listed(parts)}.`;
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
 * WHAT GOES WITH IT, AND THE CEILING. A call a rule runs carries fields of the entry that fired it (`sends`), and they
 * are said in one sentence after its own (`fieldsSaid`): the key and the host do not say that the amounts go too. Its
 * ceiling for a day is said whenever the body has one, with a clock or without.
 *
 * ONLY WHAT THE PRESS ARMS. An action the record already runs unchanged (`change: 'same'`) was approved before and is
 * left out, so a plan that calls nothing new says nothing. Two actions that read the same are said once.
 */
function callsSaid(calls: readonly unknown[], names: DoesNames = {}): string[] {
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
        : `${everySaid(every)}${ruled ? `, and ${day ? `${day} ` : ''}when a rule runs it` : day ? `, ${day}` : ''}`;
    const what = labels.length === 0 ? `Calls ${host}` : `Sends your ${labels.length === 1 ? 'key' : 'keys'} ${joined(labels.map((l) => `'${l}'`))} to ${host}`;
    const fields = fieldsSaid(call.sends, names);
    const line = `${what} ${often}.${fields ? ` ${fields}` : ''}`;
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
      const said = changesSaid(arr(b.rows), names, typeof b.register === 'string' ? b.register : '');
      return said === '' ? '' : `${capital(said)}.`;
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
      const sends = verb === 'install' ? callsSaid(callsIn(b), names) : [];
      return [`${capital(packsSaid({ [verb]: [b[verb]] }, names).join(', '))}.`, ...sends].join(' ');
    }
    /* A PLAN, as `planPack` answers it: only what it sends, since the sheet it is drawn on already says what it adds. */
    case 'install':
      return callsSaid(callsIn(b), names).join(' ');
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

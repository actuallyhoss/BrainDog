/**
 * Every answer as an agent reads it by default: plain labelled lines, names with a short handle beside them, money and
 * days as people say them, and a last line that says what is left and the exact call that reads it.
 *
 * WHAT IT IS FOR, MEASURED ON THE OWNER'S RECORD. The reads answered compact JSON: `list session` was 21 row ids and 21
 * instants in 9 KB, the default decisions read 18 KB with 50 person ids, a figure's groups were keyed by book ids, and
 * `get` of a row nobody can read answered the four bytes `null`. A model reading that either spends turns turning ids
 * back into names or repeats the ids to a person. The illustrative answer the agent research drew is the target:
 *
 *     Tasks · open · 3 of 41
 *     Renew crumb.gg domain (tasks#41) · due Fri 4 Oct · Sam
 *     38 more: list {"register":"tasks","where":{...},"cursor":"c_7Q..."}
 *
 * PURE. Everything a line needs that the answer does not carry, a list's declaration, a ref's words, who an actor is,
 * comes in a `Look` the tools build per answer from reads they already made (`index.ts`), so nothing here reads the
 * record and nothing here can say what the caller was not shown.
 *
 * AND NEVER AN ID ON ITS OWN. A row id, a person's id, a token's id and a null are what `answer-hygiene.test.ts` fails
 * a brief answer for. A handle travels only beside a name: `Kiln (things#1)`, `Claude Code (S42)`.
 */

import { callOf, clip, counted, day, gist, grouped, isCurrency, money, moneyIn, oneLine, runnerOf, ULID, when } from './words.ts';

/** One field as a register declares it, the keys a line reads and nothing else. */
export type Field = {
  id: string;
  type: string;
  label?: string;
  of?: string;
  to?: string;
  unit?: string;
  values?: readonly string[];
  labels?: Readonly<Record<string, string>>;
  deadline?: boolean;
  required?: boolean;
  retired?: boolean;
  default?: unknown;
  /** Where a row applies, on the one field that says it (`scope.ts`). */
  scope?: unknown;
};

/** A register as `schema` answers it, the keys a line reads. */
export type Decl = {
  id: string;
  name?: string;
  one?: string;
  title?: string;
  state?: string;
  mobile?: readonly string[];
  seq_prefix?: string;
  done?: readonly string[];
  hand?: Readonly<Record<string, string>>;
  finished?: string;
  fields: readonly Field[];
};

/** What a line needs that the answer does not say, filled by the tools from reads they already made. */
export type Look = {
  /** The record's clock where the answer read it, else this host's. */
  now: number;
  decl(register: string): Decl | undefined;
  /** A row's words by its spoken id, where this answer read them: a ref's target, or a row a log line is about. */
  title(spoken: string): string | undefined;
  /** Who a log line or a question is by, in words: a person's name, an agent with its run, a rule, BrainDog. */
  actor(by: string): string;
  /** Whom the record's questions wait on, by name where the record has one. */
  decider: string;
};

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** The kernel's own register of runs. Its rows carry a machine's name, a folder and two ids no person reads. */
const RUNS = 'session';
/** The run fields a line never says: ids, a folder, a host name, a remote and a commit. The host is said as a device. */
const RUN_INSIDES = new Set(['client_id', 'token_id', 'cwd', 'host', 'remote', 'head', 'project']);

/** A field's id as words, where the register gives it no label: `done_on` is `Done on`. */
const labelOf = (f: Field | undefined, id: string): string => {
  const said = f?.label ?? id.replace(/_/gu, ' ');
  return said.slice(0, 1).toUpperCase() + said.slice(1);
};

/** What a ref says: the row's words and its handle, the handle alone, or that it cannot be opened. */
function refSaid(value: unknown, look: Look): string | null {
  if (typeof value !== 'string' || value === '') return null;
  if (ULID.test(value)) return 'one you cannot open';
  const words = look.title(value);
  return words ? `${clip(words, 48)} (${value})` : value;
}

/**
 * One value as a line says it, or `null` for one it does not: an empty one, an object it cannot say, or a `false`.
 *
 * `room` is how long a text may run before it is cut, at a word.
 */
export function said(f: Field | undefined, value: unknown, look: Look, room = 60): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (Array.isArray(value)) {
    const of: Field | undefined = f ? { ...f, type: f.of ?? 'text' } : undefined;
    const items = value.map((v) => said(of, v, look, 40)).filter((v): v is string => v !== null);
    if (items.length === 0) return null;
    const shown = items.slice(0, 3).join(', ');
    return items.length > 3 ? `${shown} and ${String(items.length - 3)} more` : shown;
  }
  const amount = moneyIn(value);
  if (amount) return money(amount.amount, amount.currency);
  switch (f?.type) {
    case 'secret':
      return 'sealed';
    case 'day':
      return typeof value === 'string' ? day(value, look.now) : null;
    case 'instant':
      return typeof value === 'string' ? when(value, look.now) : null;
    case 'enum':
      return typeof value === 'string' ? (f.labels?.[value] ?? value) : null;
    case 'ref':
      return refSaid(value, look);
    case 'bool':
      return value === true ? 'yes' : 'no';
    case 'quantity':
      return isObject(value) && typeof value.value === 'number' && typeof value.unit === 'string' ? `${grouped(value.value)} ${value.unit}` : null;
    case 'duration':
      return typeof value === 'number' ? durationSaid(value, f.unit) : null;
    default:
  }
  if (typeof value === 'string') return ULID.test(value) ? 'one you cannot open' : clip(value, room);
  if (typeof value === 'number') return grouped(value);
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  return null;
}

/** Seconds in each unit a duration field may be shown in (`unit` on the field), largest first. */
const UNITS: readonly (readonly [unit: string, seconds: number, one: string])[] = [
  ['d', 86_400, 'day'],
  ['h', 3_600, 'hour'],
  ['m', 60, 'minute'],
  ['s', 1, 'second'],
];

/**
 * A duration, which the record keeps in whole seconds, in the unit its field is shown in: `0.2 days`, `45 minutes`.
 *
 * A FIELD'S `unit` IS HOW IT IS SHOWN, NOT HOW IT IS KEPT. A task's effort of a fifth of a day is 17,280 seconds, and
 * read as a number with its unit beside it that was "17,280d", forty-seven years. A field with no unit is said in the
 * largest unit it fills.
 */
export function durationSaid(seconds: number, unit: string | undefined): string {
  const [, size, one] = UNITS.find(([u]) => u === unit) ?? UNITS.find(([, s]) => Math.abs(seconds) >= s) ?? UNITS[3]!;
  const n = Math.round((seconds / size) * 10) / 10;
  return `${grouped(n)} ${n === 1 ? one : `${one}s`}`;
}

/** A row's words: its title field, else its first text, else nothing. */
export function titleOf(fields: Record<string, unknown> | undefined, decl: Decl | undefined): string {
  const f = fields ?? {};
  const named = decl?.title === undefined ? undefined : f[decl.title];
  if (typeof named === 'string' && named.trim() !== '' && !ULID.test(named)) return named;
  for (const [id, value] of Object.entries(f))
    if (typeof value === 'string' && value.trim() !== '' && !ULID.test(value) && !RUN_INSIDES.has(id) && !/^[a-z]+:\/\//u.test(value)) return value;
  return '';
}

/** `Words (handle)`, or the handle alone for a row with no words. */
export const named = (words: string, spoken: string, room = 80): string => (words ? `${clip(words, room)} (${spoken})` : spoken);

/** A row of an answer as the tools shape one: `compact` and `listed` in `index.ts`. */
export type Shaped = { spoken: string; version?: number; state?: string; fields?: Record<string, unknown>; deleted_at?: string; clipped?: boolean };

/**
 * One row on one line: its words and handle, then the short form a person reads on a phone.
 *
 * THE SHORT FORM IS THE REGISTER'S OWN, its `mobile` fields (`docs/42-SPEC-DECLARE.md` §4.4), so what a line says is
 * what the list's author chose for a card, and a list nobody declared that for says its words and state. A deadline,
 * an amount and the person who holds a row follow, because they are what a person acts on.
 */
export function rowLine(row: Shaped, register: string, look: Look): string {
  const decl = look.decl(register);
  const fields = row.fields ?? {};
  const head = named(titleOf(fields, decl), row.spoken);
  if (register === RUNS) return runLine(row, head, look);
  const byId = new Map((decl?.fields ?? []).map((f) => [f.id, f]));
  /* `amount` IS AN AMOUNT'S OWN LABEL, said only where the line carries two (below). */
  const parts: { said: string; amount?: string }[] = [];
  const seen = new Set([decl?.title, decl?.state]);
  const state = row.state ?? (decl?.state === undefined ? undefined : fields[decl.state]);
  if (typeof state === 'string') parts.push({ said: said(byId.get(decl?.state ?? ''), state, look) ?? state });
  const add = (id: string) => {
    if (seen.has(id) || parts.length >= 5) return;
    seen.add(id);
    const f = byId.get(id);
    if (f?.retired === true) return;
    /* A REF THE CALLER CANNOT NAME IS LEFT OFF A LINE, where it said "one you cannot open" on every row of a page. */
    if (typeof fields[id] === 'string' && ULID.test(fields[id])) return;
    const words = said(f, fields[id], look, 48);
    if (words === null || (f?.type === 'bool' && fields[id] !== true)) return;
    if (moneyIn(fields[id]) !== null) {
      parts.push({ said: words, amount: labelOf(f, id).toLowerCase() });
      return;
    }
    const labelled = f?.type === 'day' || f?.type === 'instant' || f?.type === 'int' || f?.type === 'decimal' || f?.type === 'bool';
    parts.push({ said: f?.type === 'bool' ? labelOf(f, id).toLowerCase() : labelled ? `${labelOf(f, id).toLowerCase()} ${words}` : words });
  };
  for (const id of decl?.mobile ?? []) add(id);
  for (const f of decl?.fields ?? []) if (f.type === 'day' && f.deadline === true) add(f.id);
  for (const f of decl?.fields ?? []) if (f.type === 'money') add(f.id);
  if (decl?.hand?.person !== undefined) add(decl.hand.person);
  if (row.deleted_at !== undefined) parts.push({ said: 'deleted' });
  /* TWO AMOUNTS ON ONE LINE SAY WHICH IS WHICH. A project's line read "GBP 18,400.00 · GBP 14,120.00", a year's
     earnings and the year before's, and nothing told an agent which to quote; one amount alone is the row's amount. */
  const amounts = parts.filter((p) => p.amount !== undefined).length;
  return [head, ...parts.map((p) => (amounts > 1 && p.amount !== undefined ? `${p.amount} ${p.said}` : p.said))].join(' · ');
}

/** A run on one line: what it is doing, the app and the machine as a person names them, its state and when it was heard from. */
function runLine(row: Shaped, head: string, look: Look): string {
  const f = row.fields ?? {};
  const state = row.state ?? (typeof f.state === 'string' ? f.state : undefined);
  const seen = typeof f.last_seen === 'string' ? `seen ${when(f.last_seen, look.now)}` : null;
  const repo = typeof f.repo === 'string' && f.repo !== '' ? `in ${f.repo}` : null;
  return [head, runnerOf(f), state, repo, seen].filter((p): p is string => typeof p === 'string' && p !== '').join(' · ');
}

/** The most a text field says on a `get`, where a list line says 48: a whole read is asked for, not glanced at. */
const WHOLE_TEXT = 1_000;

/**
 * One row, field by field: its words, handle, state and version on the first line, then `Label: value` for each field
 * it holds, in the order the register declares them.
 *
 * A LONG TEXT IS CUT AT A THOUSAND CHARACTERS AND SAYS HOW LONG IT IS, because a project's write-up measured 31,731
 * characters on the owner's record and one `get` of it was the whole of a turn's attention. `format: full` answers it
 * whole, which the cut line says.
 */
export function rowWhole(row: Shaped, register: string, look: Look): string[] {
  const decl = look.decl(register);
  const fields = row.fields ?? {};
  const byId = new Map((decl?.fields ?? []).map((f) => [f.id, f]));
  const state = row.state ?? (decl?.state === undefined ? undefined : fields[decl.state]);
  const top = [
    named(titleOf(fields, decl), row.spoken, 160),
    typeof state === 'string' ? (said(byId.get(decl?.state ?? ''), state, look) ?? state) : null,
    register === RUNS ? runnerOf(fields) : null,
    row.version === undefined ? null : `version ${String(row.version)}`,
    row.deleted_at === undefined ? null : 'deleted',
  ].filter((p): p is string => p !== null && p !== '');
  const lines = [top.join(' · ')];
  const order = [...(decl?.fields ?? []).map((f) => f.id), ...Object.keys(fields).filter((id) => !byId.has(id))];
  for (const id of new Set(order)) {
    if (id === decl?.title || id === decl?.state || (register === RUNS && (RUN_INSIDES.has(id) || id === 'agent'))) continue;
    const f = byId.get(id);
    if (f?.retired === true || !Object.hasOwn(fields, id)) continue;
    const value = fields[id];
    const text =
      typeof value !== 'string' ? null : f?.type === 'document' ? prose(value) : f === undefined || f.type === 'text' ? oneLine(value) : null;
    /* A DOCUMENT IS SAID AS PROSE AT ANY LENGTH, and any text past the room is cut and says how long it is. */
    if (text !== null && (f?.type === 'document' || text.length > WHOLE_TEXT)) {
      const whole = text.length > WHOLE_TEXT ? ` (${grouped(text.length)} characters; format full has all of it)` : '';
      if (text !== '') lines.push(`${labelOf(f, id)}: ${clip(text, WHOLE_TEXT)}${whole}`);
      continue;
    }
    const words = said(f, value, look, WHOLE_TEXT);
    if (words !== null) lines.push(`${labelOf(f, id)}: ${words}`);
  }
  return lines;
}

/**
 * A page's note as prose: its fenced blocks (chips, bars, specs) left out, its typed words said as they render, and no
 * heading marks. A project's note opened on three lines of chip syntax, so a brief `get` of it read as markup.
 */
export function prose(doc: string): string {
  const typed = (form: string, arg: string): string => {
    const m = /^(-?\d+)\s+([A-Z]{3})$/u.exec(arg.trim());
    if (form === 'money' && m) return money(Number(m[1]), m[2]!);
    return form === 'pct' ? `${arg.trim()}%` : arg.trim();
  };
  return oneLine(
    doc
      .replace(/^(```|~~~)[^\n]*\n[\s\S]*?(^\1[^\n]*$|(?![\s\S]))/gmu, ' ')
      .replace(/\{\{([a-z]+):([^}]*)\}\}/gu, (_, form: string, arg: string) => typed(form, arg))
      .replace(/^#{1,6}\s+/gmu, ''),
  );
}

/** A predicate as a header says it, where it can: `open`, `Project is Kiln`, or `filtered` for a tree it cannot. */
export function whereSaid(where: unknown, decl: Decl | undefined, look: Look): string | null {
  if (where === undefined || where === null) return null;
  if (typeof where === 'string') return clip(where, 60);
  if (!isObject(where)) return 'filtered';
  const byId = new Map((decl?.fields ?? []).map((f) => [f.id, f]));
  if (Array.isArray(where.all) || Array.isArray(where.any)) {
    const parts = ((where.all ?? where.any) as unknown[]).map((w) => whereSaid(w, decl, look));
    if (parts.some((p) => p === null || p === 'filtered')) return 'filtered';
    return clip(parts.join(Array.isArray(where.all) ? ', ' : ' or '), 80);
  }
  if (typeof where.field !== 'string') return 'filtered';
  const f = byId.get(where.field);
  const value = (v: unknown): string => (f?.type === 'ref' || f?.type === 'list' ? (refSaid(v, look) ?? String(v)) : (said(f, v, look, 30) ?? String(v)));
  const label = labelOf(f, where.field);
  if (where.is !== undefined) return where.field === decl?.state ? value(where.is) : `${label} is ${value(where.is)}`;
  if (where.not !== undefined) return `${label} is not ${value(where.not)}`;
  if (Array.isArray(where.in)) return `${label} is ${where.in.map(value).join(' or ')}`;
  if (Array.isArray(where.not_in)) return `${label} is not ${where.not_in.map(value).join(' or ')}`;
  if (where.empty === true) return `no ${label.toLowerCase()}`;
  if (where.present === true) return `with ${label.toLowerCase()}`;
  return 'filtered';
}

/** A list-like answer in the one envelope every list-like read shares (`index.ts`). */
export type Page = { rows: unknown[]; matched?: number; cursor?: string };

/** How many are shown, of how many: `3 of 41`, `41`, or `none`. */
const ofMatched = (shown: number, matched: number | undefined): string =>
  shown === 0 ? 'none' : matched !== undefined && matched > shown ? `${grouped(shown)} of ${grouped(matched)}` : grouped(shown);

/** The last line of a page that has more: how many are left when that is known, and the call that reads them. */
const moreLine = (tool: string, args: Record<string, unknown>, page: Page, firstPage: boolean): string | null => {
  if (page.cursor === undefined) return null;
  const next = callOf(tool, { ...args, cursor: page.cursor });
  const left = firstPage && page.matched !== undefined ? page.matched - page.rows.length : undefined;
  return left !== undefined && left > 0 ? `${grouped(left)} more: ${next}` : `More: ${next}`;
};

/** The arguments a closing line repeats: what narrowed the page, never `format` or the cursor it replaces. */
const kept = (args: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> =>
  Object.fromEntries(keys.filter((k) => args[k] !== undefined).map((k) => [k, args[k]]));

/** `list`: the list's name, what narrowed it and how many, one line a row, and what is left. */
export function listBrief(args: Record<string, unknown>, page: Page, look: Look): string {
  const register = String(args.register);
  const decl = look.decl(register);
  const head = [decl?.name ?? register, whereSaid(args.where, decl, look), ofMatched(page.rows.length, page.matched)].filter(Boolean).join(' · ');
  const lines = page.rows.map((r) => (isObject(r) && typeof r.spoken === 'string' ? rowLine(r as Shaped, register, look) : clip(JSON.stringify(r), 120)));
  const more = moreLine('list', kept(args, ['register', 'where', 'limit', 'fields']), page, args.cursor === undefined);
  return [head, ...lines, ...(more ? [more] : [])].join('\n');
}

/** `search`: what was asked, how many matched, each hit with the list it is in, and the call for the rest. */
export function searchBrief(args: Record<string, unknown>, page: Page, look: Look, most: number): string {
  /* THE WORDS ARE NOT SAID BACK. The caller has them, and an answer that repeats them carries a hidden row's title
     whenever that title is what was searched for, which is how `canary.test.ts` looks for a hidden row in every answer. */
  const head = `Search · ${page.rows.length === 0 ? 'nothing found' : `${ofMatched(page.rows.length, page.matched)} found`}`;
  const lines = page.rows.map((hit) => {
    if (!isObject(hit) || typeof hit.spoken !== 'string') return clip(JSON.stringify(hit), 120);
    const list = typeof hit.register === 'string' ? (look.decl(hit.register)?.name ?? hit.register) : null;
    return [named(typeof hit.title === 'string' ? hit.title : '', hit.spoken), list].filter(Boolean).join(' · ');
  });
  const left = (page.matched ?? 0) - page.rows.length;
  const more =
    left <= 0 ? null : page.rows.length >= most ? `${grouped(left)} more match: narrow the words.` : `${grouped(left)} more: ${callOf('search', { q: args.q, limit: most })}`;
  return [head, ...lines, ...(more ? [more] : [])].join('\n');
}

/** A log line's verb and what it moved, in words. */
export function eventSaid(e: Record<string, unknown>, decl: Decl | undefined, look: Look): string {
  const kind = typeof e.kind === 'string' ? e.kind : 'change';
  const f = typeof e.field === 'string' ? decl?.fields.find((x) => x.id === e.field) : undefined;
  const label = typeof e.field === 'string' ? labelOf(f, e.field) : '';
  const short = (v: unknown): string | null => {
    /* A REF'S NEW VALUE IS A ROW ID ON THE LOG, which says nothing a person can read, and not "one you cannot open". */
    if (f?.type === 'ref' || (f?.type === 'list' && f.of === 'ref') || (typeof v === 'string' && ULID.test(v))) return null;
    const words = said(f, v, look, 60);
    return words !== null && words.length <= 60 ? words : null;
  };
  const note = typeof e.note === 'string' && e.note !== '' ? clip(e.note, 120) : null;
  switch (kind) {
    case 'create':
      return note && !/^opened: /u.test(note) ? `added: ${note}` : 'added';
    case 'edit': {
      const to = short(e.to);
      return `changed ${label || 'a field'}${to ? ` to ${to}` : ''}`;
    }
    case 'state': {
      const to = typeof e.to === 'string' ? (f?.labels?.[e.to] ?? e.to) : null;
      return to ? `moved to ${to}${note ? `: ${note}` : ''}` : 'moved';
    }
    case 'note':
      return note ? `noted: ${note}` : 'noted';
    case 'tag':
      return `added ${clip(String(short(e.to) ?? 'a line'), 60)} to ${label || 'a list'}`;
    case 'untag':
      return `took ${clip(String(short(e.to) ?? 'a line'), 60)} off ${label || 'a list'}`;
    case 'delete':
      return note ? `deleted: ${note}` : 'deleted';
    case 'suggest': {
      const asked = typeof e.to === 'string' ? e.to : (note ?? (typeof e.title === 'string' ? e.title : ''));
      return asked ? `asked: ${clip(asked, 100)}` : 'asked a question';
    }
    case 'decide':
      return note ? `decided: ${note}` : 'decided';
    case 'resolve':
      return 'settled a question';
    case 'link':
      return `linked ${label || 'another entry'}`;
    default:
      return `${kind.replace(/[._]/gu, ' ')}${note ? `: ${note}` : ''}`;
  }
}

/** What a log line is about, in words, or `null` for the row a history is already about. */
function targetSaid(e: Record<string, unknown>, look: Look): string | null {
  if (typeof e.spoken === 'string') return named(typeof e.title === 'string' ? e.title : (look.title(e.spoken) ?? ''), e.spoken, 60);
  const target = typeof e.target === 'string' ? e.target : '';
  const kind = typeof e.target_kind === 'string' ? e.target_kind : target.split(':')[0] ?? '';
  const after = target.slice(target.indexOf(':') + 1);
  if ((kind === 'suggestion' || kind === 'decision' || kind === 'prediction') && /^[A-Z]{1,3}\d+$/u.test(after)) return after;
  if (kind === 'inbox_raw') return 'an arrival';
  if (kind === 'declaration') {
    const [what, id] = after.split('.');
    return id ? `the ${id} ${what === 'register' ? 'list' : what === 'metric' ? 'figure' : what === 'rule' ? 'automation' : (what ?? 'declaration')}` : null;
  }
  if (kind === 'member' || kind === 'person') return look.actor(after);
  if (kind.startsWith('grant') || kind === 'credential') return 'a key';
  if (kind === 'pack') return `the ${after} pack`;
  return kind ? kind.replace(/_/gu, ' ') : null;
}

/** One line of a history or of the log: when, who, and what they did, and to what when it is not the row in hand. */
export function eventLine(e: Record<string, unknown>, decl: Decl | undefined, look: Look, about: boolean): string {
  const at = typeof e.ts === 'string' ? when(e.ts, look.now) : '';
  const by = typeof e.actor === 'string' ? look.actor(e.actor) : 'someone on this record';
  const did = eventSaid(e, decl, look);
  const what = about ? targetSaid(e, look) : null;
  return [at, by, what && !did.includes(what) ? `${did} · ${what}` : did].filter(Boolean).join(' · ');
}

/** The most lines a history says before it folds its middle. */
const HISTORY_SHOWN = 20;

/** `history`: the row and how many changes, then each change oldest first, the middle folded past twenty. */
export function historyBrief(spoken: string, register: string | undefined, rowWords: string, page: Page, look: Look): string {
  const decl = register === undefined ? undefined : look.decl(register);
  const events = page.rows.filter(isObject);
  const head = `${named(rowWords, spoken)} · ${counted(events.length, 'change')}`;
  const lines = events.map((e) => eventLine(e, decl, look, false));
  if (lines.length <= HISTORY_SHOWN) return [head, ...lines].join('\n');
  const folded = lines.length - HISTORY_SHOWN;
  return [head, lines[0]!, `${grouped(folded)} more in between: ${callOf('history', { spoken, format: 'full' })}`, ...lines.slice(1 + folded)].join('\n');
}

/**
 * `activity`: the newest changes, one a line, a run's own bookkeeping folded into one line, and the call for the page below.
 *
 * `lists` IS EACH LINE'S LIST, in the page's order, because a line in the answer names its row by its spoken id alone,
 * and a field is said by the label its list gives it ("changed Project", not "changed Thing").
 */
export function activityBrief(args: Record<string, unknown>, page: Page, look: Look, lists: readonly (string | undefined)[] = []): string {
  const events = page.rows.filter(isObject);
  const listOf = new Map(events.map((e, i) => [e, typeof e.register === 'string' ? e.register : lists[i]]));
  const runs = events.filter((e) => typeof e.spoken === 'string' && /^S\d+$/u.test(e.spoken) && e.actor === e.spoken);
  const rest = events.filter((e) => !runs.includes(e));
  const head = events.length === 0 ? 'Nothing has changed yet.' : `Lately, newest first · ${counted(events.length, 'change')}`;
  const lines = rest.map((e) => {
    const list = listOf.get(e);
    return eventLine(e, list === undefined ? undefined : look.decl(list), look, true);
  });
  const n = runs.length;
  const whole = callOf('activity', { ...kept(args, ['limit', 'cursor', 'everything']), format: 'full' });
  const folded = n === 0 ? [] : [n === 1 ? `Left out: a change an agent run made to its own session. ${whole} has it.` : `Left out: ${grouped(n)} changes agent runs made to their own sessions. ${whole} has them.`];
  const more = moreLine('activity', kept(args, ['limit', 'everything']), page, false);
  return [head, ...lines, ...folded, ...(more ? [more] : [])].join('\n');
}

/**
 * Questions that read the same once their ids and case are set aside, as one entry with how many it stands for.
 *
 * THE OWNER'S QUEUE HELD THREE OF ONE QUESTION, two word for word, and the briefing printed each. They are still three
 * questions in the record and in the full answer; a brief answer says the first and how many more read like it.
 */
export function alike<T extends { question?: unknown; id?: unknown }>(rows: readonly T[]): { first: T; also: string[] }[] {
  const groups = new Map<string, { first: T; also: string[] }>();
  for (const row of rows) {
    const key = typeof row.question === 'string' ? gist(row.question) : '';
    const held = key === '' ? undefined : groups.get(key);
    if (held) held.also.push(String(row.id ?? ''));
    else groups.set(key === '' ? `#${String(groups.size)}` : key, { first: row, also: [] });
  }
  return [...groups.values()];
}

/** `governance`: one question or decision whole, or a page of them, each on a line with who and when. */
export function governanceBrief(args: Record<string, unknown>, value: unknown, look: Look): string {
  const register = typeof args.register === 'string' ? args.register : 'suggestion';
  if (isObject(value) && !Array.isArray(value.rows)) return governanceOne(value, look);
  const page = value as Page;
  const rows = page.rows.filter(isObject);
  const status = typeof args.status === 'string' ? args.status : 'open';
  const what =
    register === 'decision' ? 'Decisions' : register === 'prediction' ? 'Predictions' : status === 'open' ? `Waiting on ${look.decider}` : status === 'all' ? 'Questions' : 'Answered questions';
  const head = `${what} · ${ofMatched(rows.length, page.matched)}`;
  const lines =
    register === 'suggestion'
      ? alike(rows).map(({ first, also }) => {
          const id = String(first.id ?? '');
          const asked = typeof first.question === 'string' ? clip(first.question, 100) : '';
          const like = also.length === 0 ? '' : `, and ${also.length === 1 ? also[0]! : `${String(also.length)} more`} like it`;
          return [`${asked} (${id}${like})`, typeof first.opened_at === 'string' ? when(first.opened_at, look.now) : null, typeof first.opened_by === 'string' ? look.actor(first.opened_by) : null]
            .filter(Boolean)
            .join(' · ');
        })
      : rows.map((r) => {
          const asked = typeof r.question === 'string' ? clip(r.question, 90) : '';
          const by = typeof r.decided_by === 'string' ? look.actor(r.decided_by) : null;
          const at = typeof r.ts === 'string' ? when(r.ts, look.now) : null;
          const why = typeof r.reason === 'string' && r.reason.trim().length > 2 ? clip(r.reason, 60) : null;
          return [`${asked} (${String(r.id ?? '')})`, typeof r.answer === 'string' ? r.answer : null, by, at, why].filter(Boolean).join(' · ');
        });
  const more = moreLine('governance', kept(args, ['register', 'status', 'limit']), page, args.cursor === undefined);
  return [head, ...lines, ...(more ? [more] : [])].join('\n');
}

/** One question or decision, whole: what it asks, where it stands, its options, and where the person answers it. */
function governanceOne(row: Record<string, unknown>, look: Look): string {
  const id = String(row.id ?? '');
  const lines = [`${typeof row.question === 'string' ? clip(row.question, 200) : id} (${id})`];
  const status = typeof row.status === 'string' ? row.status : typeof row.answer === 'string' ? `decided ${row.answer}` : null;
  const by = typeof row.opened_by === 'string' ? `asked by ${look.actor(row.opened_by)}` : typeof row.decided_by === 'string' ? `by ${look.actor(row.decided_by)}` : null;
  const at = typeof row.opened_at === 'string' ? when(row.opened_at, look.now) : typeof row.ts === 'string' ? when(row.ts, look.now) : null;
  lines.push([status, by, at].filter(Boolean).join(' · '));
  const body = isObject(row.body) ? row.body : null;
  if (body && typeof body.about === 'string') lines.push(`About: ${refSaid(body.about, look) ?? body.about}`);
  if (body && Array.isArray(body.options))
    lines.push(
      `Options: ${body.options
        .filter(isObject)
        .map((o) => `${clip(String(o.label ?? o.id ?? ''), 50)} (${String(o.id ?? '')})${typeof o.because === 'string' && o.because ? `, ${clip(o.because, 60)}` : ''}`)
        .join(' · ')}`,
    );
  else if (body && Array.isArray(body.rows)) {
    const list = typeof body.register === 'string' ? (look.decl(body.register)?.name ?? body.register) : 'one list';
    lines.push(`Changes ${counted(body.rows.length, 'entry', 'entries')} in ${list}.`);
  }
  if (typeof row.reason === 'string' && row.reason.trim() !== '') lines.push(`Why: ${clip(row.reason, 200)}`);
  if (row.status === 'open') lines.push(`${sentence(look.decider)} decides in BrainDog.`);
  return lines.filter((l) => l !== '').join('\n');
}

/** Words that open a sentence, with a capital: "the owner" begins one as "The owner". */
const sentence = (words: string): string => words.slice(0, 1).toUpperCase() + words.slice(1);

/** A figure's value as a person reads it: money with its code, a count with its thousands, or each currency apart. */
export function readingSaid(reading: unknown): string | null {
  if (!isObject(reading)) return null;
  if (Array.isArray(reading.parts) && reading.parts.length > 0) {
    const parts = reading.parts.filter(isObject).map((p) => (typeof p.amount === 'number' && isCurrency(p.currency) ? money(p.amount, p.currency) : null));
    if (parts.every((p) => p !== null)) return `${parts.join(' and ')}, never added: there is no rate between them`;
  }
  if (typeof reading.value !== 'number') return reading.value === null ? 'no value yet' : null;
  if (isCurrency(reading.unit)) return money(reading.value, reading.unit);
  return `${grouped(reading.value)}${typeof reading.unit === 'string' && reading.unit !== '' ? ` ${reading.unit}` : ''}`;
}

/** The most groups a figure's brief answer names, one a line. */
export const GROUPS_SHOWN = 12;

/**
 * `get` of a figure: its name and value, when it was read as of, whether it meets its target, and each group by name.
 *
 * A GROUP KEYED BY A ROW'S ID IS NAMED BY THAT ROW, from `labels`, which the tool reads for the groups it shows: the
 * owner's cash figure was keyed by two book ids, and a line reading `01M3VMPS...` is a line nobody can act on.
 */
export function figureBrief(
  id: string,
  name: string | undefined,
  reading: Record<string, unknown>,
  look: Look,
  labels: ReadonlyMap<string, string> = new Map(),
): string {
  const value = readingSaid(reading);
  const top = [named(name ?? '', id), value, typeof reading.as_of === 'string' ? `as of ${day(reading.as_of, look.now)}` : null, reading.met === true ? 'meets its target' : reading.met === false ? 'misses its target' : null];
  const lines = [top.filter(Boolean).join(' · ')];
  const unit = typeof reading.unit === 'string' ? reading.unit : null;
  if (Array.isArray(reading.groups) && reading.groups.length > 0) {
    const groups = reading.groups.filter(isObject).slice(0, GROUPS_SHOWN);
    lines.push(
      ...groups.map((g) => {
        const key = typeof g.key === 'string' ? g.key : '';
        const label = typeof g.label === 'string' ? g.label : (labels.get(key) ?? (key !== '' && !ULID.test(key) ? key : 'one you cannot open'));
        const v = typeof g.value === 'number' ? (unit !== null && isCurrency(unit) ? money(g.value, unit) : grouped(g.value)) : null;
        return `${clip(label, 60)}${v === null ? '' : ` · ${v}`}`;
      }),
    );
    if (reading.groups.length > GROUPS_SHOWN) lines.push(`${grouped(reading.groups.length - GROUPS_SHOWN)} more groups: format full has them.`);
  }
  if (typeof reading.why === 'string' && reading.met === undefined && !/^no comparison/u.test(reading.why)) lines.push(clip(reading.why, 160));
  if (Array.isArray(reading.refusals) && reading.refusals.length > 0) lines.push(`${counted(reading.refusals.length, 'part')} could not be read.`);
  return lines.join('\n');
}

/** `record_index`: the record, each list by name with its handle and count, and the figures by id. */
export function indexBrief(value: Record<string, unknown>): string {
  const record = isObject(value.record) && typeof value.record.name === 'string' ? value.record.name : 'This record';
  const registers = Array.isArray(value.registers) ? value.registers.filter(isObject) : [];
  const figures = Array.isArray(value.figures) ? value.figures.filter((f): f is string => typeof f === 'string') : [];
  const lines = [`${record} · ${counted(registers.length, 'list')}${figures.length > 0 ? ` · ${counted(figures.length, 'figure')}` : ''}`];
  for (const r of registers) lines.push(`${String(r.name ?? r.id)} (${String(r.id)})${typeof r.count === 'number' ? ` · ${grouped(r.count)}` : ''}`);
  if (figures.length > 0) {
    const shown = figures.slice(0, 30);
    lines.push(`Figures, read with get: ${shown.join(', ')}${figures.length > shown.length ? `, and ${grouped(figures.length - shown.length)} more in format full` : ''}`);
  }
  return lines.join('\n');
}

/** `schema`: the list, then each field with its id, its label, its type and what it may take. */
export function schemaBrief(value: Record<string, unknown>): string {
  const fields = Array.isArray(value.fields) ? value.fields.filter(isObject) : [];
  const live = fields.filter((f) => f.retired !== true && typeof f.id === 'string');
  const head = [`${String(value.name ?? value.id ?? 'This list')} (${String(value.id ?? '')})`, counted(live.length, 'field'), typeof value.one === 'string' ? `each one is a ${value.one}` : null]
    .filter(Boolean)
    .join(' · ');
  const lines = live.map((f) => {
    const type = f.type === 'ref' ? `ref to ${String(f.to ?? 'a list')}` : f.type === 'list' ? `list of ${String(f.of ?? 'text')}${f.to ? ` in ${String(f.to)}` : ''}` : String(f.type ?? 'text');
    const values = Array.isArray(f.values)
      ? `: ${f.values.map((v) => (isObject(f.labels) && typeof f.labels[String(v)] === 'string' ? `${String(f.labels[String(v)])} (${String(v)})` : String(v))).join(', ')}`
      : '';
    const flags = [
      f.id === value.title ? 'the title' : null,
      f.id === value.state ? 'the state' : null,
      f.required === true ? 'required' : null,
      f.deadline === true ? 'a deadline' : null,
      f.default !== undefined && f.default !== null ? `default ${String(typeof f.default === 'object' ? JSON.stringify(f.default) : f.default)}` : null,
      typeof f.by === 'string' ? `set by ${f.by}` : null,
    ].filter(Boolean);
    return [String(f.id), typeof f.label === 'string' ? f.label : null, `${type}${values}`, ...flags].filter(Boolean).join(' · ');
  });
  return [head, ...lines].join('\n');
}

/** A refusal as an agent reads it: its code and where, the record's sentence, what is allowed, and the corrected call. */
export function refusalBrief(refusal: Record<string, unknown>): string {
  const code = typeof refusal.code === 'string' ? refusal.code : 'REFUSED';
  const at = typeof refusal.at === 'string' && refusal.at !== '' ? ` at ${refusal.at}` : '';
  const lines = [`Refused, ${code}${at}: ${typeof refusal.fix === 'string' ? oneLine(refusal.fix) : ''}`.trim()];
  if (Array.isArray(refusal.allowed) && refusal.allowed.length > 0) {
    const allowed = refusal.allowed.map(String);
    lines.push(`Allowed: ${allowed.slice(0, 24).join(', ')}${allowed.length > 24 ? `, and ${String(allowed.length - 24)} more` : ''}`);
  }
  if (typeof refusal.try === 'string') lines.push(`Try: ${refusal.try}`);
  if (typeof refusal.retry_after === 'number') lines.push(`Ask again in ${counted(refusal.retry_after, 'second')}.`);
  return lines.join('\n');
}

/** A write that arrived second: who wrote first, the row as it stands, and the version to send with the change again. */
export function conflictBrief(conflict: { version: number; actor: string; current: unknown }, register: string | undefined, look: Look): string {
  const current = isObject(conflict.current) ? (conflict.current as Shaped) : null;
  const lines = [`Not saved, VERSION_STALE: ${look.actor(conflict.actor)} changed it after you read it, and it is at version ${String(conflict.version)} now.`];
  if (current && typeof current.spoken === 'string' && register !== undefined) lines.push(`Now: ${rowLine(current, register, look)}`);
  lines.push(`Re-apply your change to it as it is now and send version ${String(conflict.version)}.`);
  return lines.join('\n');
}

/* ── what a write says it did ──────────────────────────────────────────── */

/**
 * `create` and `update`: the entry as it stands now on one line, and the version the next change sends.
 *
 * THE VERSION IS IN THE TEXT, because it is the one thing a model needs back from a write to make the next one, and
 * a client that never reads `structuredContent` would otherwise have to ask again.
 */
export function wroteBrief(verb: 'Added' | 'Changed', row: Shaped, register: string, look: Look): string {
  const version = row.version === undefined ? null : `version ${String(row.version)}`;
  if (row.deleted_at !== undefined) return [`Deleted ${named(titleOf(row.fields, look.decl(register)), row.spoken)}`, version].filter(Boolean).join(' · ');
  return [`${verb}: ${rowLine(row, register, look)}`, version].filter(Boolean).join(' · ');
}

/** `log`: where the note went, and the version it left the entry at. */
export function loggedBrief(spoken: string, words: string, version: unknown, deleted: boolean): string {
  return [`Noted on ${named(words, spoken)}`, typeof version === 'number' ? `version ${String(version)}` : null, deleted ? 'it was deleted, and the note is kept with it' : null]
    .filter(Boolean)
    .join(' · ');
}

/** `handoff`: the run as the next session will read it, its state, the step it leaves and how many dead ends. */
export function handoffBrief(run: Shaped): string {
  const f = run.fields ?? {};
  const state = run.state ?? (typeof f.state === 'string' ? f.state : null);
  const tried = Array.isArray(f.tried) ? f.tried.length : 0;
  return [
    `Kept on your run: ${named(typeof f.doing === 'string' ? f.doing : '', run.spoken)}`,
    state,
    typeof f.next === 'string' && f.next !== '' ? `next: ${clip(f.next, 160)}` : 'no next step',
    tried > 0 ? counted(tried, 'dead end') : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** `meet`: who it was, whether they were new, and whether they are now on the caller's project. */
export function metBrief(met: Record<string, unknown>, name: string, look: Look): string {
  const person = typeof met.person === 'string' ? met.person : '';
  const words = look.title(person) ?? name;
  const merge = typeof met.merge === 'string' && met.merge !== '' ? met.merge : null;
  return [
    `${met.created === true ? 'Added' : 'Matched'} ${named(words, person)}`,
    met.linked === true ? 'linked to your project' : null,
    merge ? `maybe the same person as ${named(look.title(merge) ?? '', merge)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** `triage`: what became of the arrival, by the entry it was filed as when it was filed. */
export function triagedBrief(settled: Record<string, unknown>, entry: Shaped | null, register: string | undefined, look: Look): string {
  const state = typeof settled.state === 'string' ? settled.state : 'settled';
  if (settled.already === true) return `That arrival was already ${state}, so nothing changed.`;
  if (entry && register !== undefined) return `Filed: ${rowLine(entry, register, look)} · version ${String(entry.version ?? 1)}`;
  return state === 'ignored' ? 'Set aside. It stays in the inbox under ignored.' : `The arrival is ${state} now.`;
}

/**
 * `propose`: the question as filed, whom it waits on, and where they answer it.
 *
 * THE PERSON DECIDES IN BRAINDOG, and the answer says so in the words an agent can pass on, with the link to the
 * question itself when the host serves the app somewhere.
 */
export function proposedBrief(filed: Record<string, unknown>, question: string, look: Look): string {
  const id = typeof filed.id === 'string' && filed.id !== '' ? ` (${filed.id})` : '';
  const at = typeof filed.decide === 'string' ? ` at ${filed.decide}` : '';
  return [`Asked ${look.decider}: ${clip(question, 160)}${id}`, `${sentence(look.decider)} decides in BrainDog${at}.`].join('\n');
}

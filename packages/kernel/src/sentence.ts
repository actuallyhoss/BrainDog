/**
 * An automation written as a sentence, turned into the body the record installs.
 *
 *     When a bill is due in 3 days, tell me.
 *     When a new task is added to Tasks where state is open, tag it urgent.
 *     When a card text from HSBC arrives at Bank texts, file it under Personal.
 *
 * THE RULE PARSER COMES FIRST AND IS PLAIN PATTERNS, NOT A MODEL. The common shapes are `when <row event> [in <list>]
 * [where <field> <op> <value>], <action>`, and a person who writes one should get the same body every time and pay
 * nothing for it. What the patterns cannot read is `{ ok: false, why }`, and only then may the caller ask a model.
 *
 * NAMES ARE LOOKED UP IN THE WORLD IT IS HANDED (`SentenceWorld`): the record's lists, their fields and its doors.
 * Nothing here knows a list by its id, so a record that calls its bills "Invoices" reads the same sentence the same way.
 *
 * `said` IS THE SENTENCE IN BRAINDOG'S WORDS, built from what was understood and not from what was typed, so the person
 * reads back what will happen; `replay` is what the caller needs to look the body over the last days of real rows.
 */

import type { FlowDecl } from './rules.ts';

export type SentenceField = { id: string; type: string; label?: string | undefined; values?: readonly string[] | undefined; labels?: Readonly<Record<string, string>> | undefined; to?: string | undefined };
export type SentenceList = {
  id: string;
  name: string;
  /** The singular, "bill" for Bills, when the list declares one. */
  one?: string | undefined;
  /** The field holding the row's title. */
  title?: string | undefined;
  /** The field the list mirrors onto its state, when it has a lifecycle. */
  state?: string | undefined;
  fields: readonly SentenceField[];
};
export type SentenceDoor = { id: string; name: string; register: string | null };
export type SentenceWorld = { lists: readonly SentenceList[]; doors: readonly SentenceDoor[] };

/** What the caller walks over the last days of real rows. `where` is the person's own filter, `''` when there is none. */
export type Replay =
  | { kind: 'written'; register: string; op: 'create' | 'update' | 'delete'; where: string }
  | { kind: 'time'; register: string; field: string; within: number; where: string }
  | { kind: 'arrival'; where: string };

export type Sentenced = { ok: true; body: FlowDecl & Record<string, unknown>; said: string; replay: Replay; notes: string[] } | { ok: false; why: string };

/** The fields of an arrival a `where` may name (`INBOX_RAW` in `@braindog/where`), in the words a person says them. */
const ARRIVAL_FIELDS: readonly SentenceField[] = [
  { id: 'from_name', type: 'text', label: 'sender' },
  { id: 'from_address', type: 'text', label: 'sender address' },
  { id: 'from_domain', type: 'text', label: 'sender domain' },
  { id: 'from', type: 'text' },
  { id: 'subject', type: 'text' },
  { id: 'body', type: 'text', label: 'text' },
  { id: 'to', type: 'text' },
  { id: 'channel', type: 'text' },
];

const fail = (why: string): { ok: false; why: string } => ({ ok: false, why });
const lower = (s: string): string => s.toLowerCase();
const cap = (s: string): string => (s === '' ? s : s[0]!.toUpperCase() + s.slice(1));
const ARTICLE = /^(?:a|an|the|any|each|every|one)\s+/i;

/** One sentence as typed: one line, straight quotes, no closing full stop. */
const clean = (raw: string): string =>
  raw
    .replace(/[‘’]/gu, "'")
    .replace(/[“”]/gu, '"')
    .replace(/\s+/gu, ' ')
    .trim()
    .replace(/[.!]+$/u, '')
    .trim();

/** A noun in the singular, enough for a list's name against what was said. */
function one(word: string): string {
  const w = lower(word.trim());
  if (/ies$/u.test(w)) return `${w.slice(0, -3)}y`;
  if (/(?:s|x|ch|sh)es$/u.test(w)) return w.slice(0, -2);
  if (/[^s]s$/u.test(w)) return w.slice(0, -1);
  return w;
}

const GENERIC = /^(?:row|entry|item|thing|record|something|anything|line)s?$/u;

/** The list a noun names, by its name, its singular or its id; the last word counts when the whole does not. `null` for none or two. */
function listFor(noun: string, lists: readonly SentenceList[]): SentenceList | 'many' | null {
  const said = one(noun);
  if (said === '') return null;
  const names = (l: SentenceList): string[] => [l.name, l.id, l.one ?? ''].filter((x) => x !== '').map(one);
  for (const pass of [(l: SentenceList) => names(l).includes(said), (l: SentenceList) => names(l).includes(one(said.split(' ').at(-1) ?? ''))]) {
    const found = lists.filter(pass);
    if (found.length === 1) return found[0]!;
    if (found.length > 1) return 'many';
  }
  return null;
}

const fieldWords = (f: SentenceField): string[] => [...new Set([lower(f.label ?? f.id.replace(/_/gu, ' ')), lower(f.id.replace(/_/gu, ' '))])];

/** A field by what a person calls it: whole first, then a field whose name holds the word. */
function fieldFor(fields: readonly SentenceField[], word: string, types?: readonly string[]): SentenceField | null {
  const w = lower(word.trim());
  const pool = types === undefined ? fields : fields.filter((f) => types.includes(f.type));
  const exact = pool.filter((f) => fieldWords(f).includes(w));
  if (exact.length === 1) return exact[0]!;
  const holding = pool.filter((f) => fieldWords(f).some((n) => n.includes(w) || w.includes(n)));
  return holding.length === 1 ? holding[0]! : null;
}

const DATES = ['day', 'instant'] as const;

/** The date a bare "due" means: a field called so, else the list's only date. */
function dueField(list: SentenceList, word: string): SentenceField | null {
  return fieldFor(list.fields, word, DATES) ?? (() => {
    const dates = list.fields.filter((f) => (DATES as readonly string[]).includes(f.type));
    return dates.length === 1 ? dates[0]! : null;
  })();
}

/* ── where ─────────────────────────────────────────────────────────── */

type Where = { when: string; said: string };

const OPS: [RegExp, string][] = [
  [/^is not empty\b/iu, 'is set'],
  [/^is not set\b/iu, 'is empty'],
  [/^(?:is empty|is blank|is missing|has no value)\b/iu, 'is empty'],
  [/^(?:is set|has a value)\b/iu, 'is set'],
  [/^(?:is not|isn't|is no|!=)\s+/iu, 'is not'],
  [/^(?:is before|before|is earlier than)\s+/iu, 'before'],
  [/^(?:is after|after|is later than)\s+/iu, 'after'],
  [/^(?:contains|includes|mentions|has the word)\s+/iu, 'contains'],
  [/^(?:has|holds)\s+/iu, 'has'],
  [/^(?:lacks|does not have|doesn't have)\s+/iu, 'lacks'],
  [/^(?:is|equals|=|are)\s+/iu, 'is'],
];

const unquote = (s: string): string => s.trim().replace(/^"(.*)"$/u, '$1');

/** `<field> <op> <value>` clauses joined by and, or a comma, or "or"; one joiner for the whole filter, as the grammar has it. */
function whereOf(text: string, fields: readonly SentenceField[]): Where | { why: string } {
  const startsField = (piece: string): boolean => fields.some((f) => fieldWords(f).some((n) => lower(piece).startsWith(`${n} `)));
  const pieces = text.split(/(\s+and\s+|\s+or\s+|,\s*)/iu);
  const clauses: string[] = [];
  const joiners: string[] = [];
  let at = pieces[0] ?? '';
  for (let i = 1; i < pieces.length; i += 2) {
    const sep = pieces[i]!;
    const next = pieces[i + 1] ?? '';
    if (startsField(next)) {
      clauses.push(at);
      joiners.push(lower(sep).replace(/[\s,]/gu, '') || 'and');
      at = next;
    } else at += sep + next;
  }
  clauses.push(at);
  if (new Set(joiners).size > 1) return { why: 'Use only "and" or only "or" between the conditions, not both.' };
  const out: string[] = [];
  const said: string[] = [];
  for (const clause of clauses) {
    const body = clause.trim();
    const f = [...fields].sort((a, b) => Math.max(...fieldWords(b).map((n) => n.length)) - Math.max(...fieldWords(a).map((n) => n.length))).find((x) => fieldWords(x).some((n) => lower(body).startsWith(`${n} `) || lower(body) === n));
    if (!f) return { why: `I could not find a field in "${body}". Name a field, then is, contains, before or after, then the value.` };
    const name = fieldWords(f).find((n) => lower(body).startsWith(n)) ?? f.id;
    const rest = body.slice(name.length).trim();
    const op = OPS.find(([re]) => re.test(rest));
    if (!op) return { why: `I do not know how to read "${body}". Use is, is not, contains, before, after, is empty or is set.` };
    const value = unquote(rest.replace(op[0], '').trim());
    const bare = op[1] === 'is empty' || op[1] === 'is set';
    if (!bare && value === '') return { why: `"${body}" needs a value after ${op[1]}.` };
    const typed = op[1] === 'contains' && /\s/u.test(value) ? `"${value}"` : value;
    out.push(bare ? `${f.id} ${op[1]}` : `${f.id} ${op[1]} ${typed}`);
    said.push(bare ? `${f.label ?? f.id.replace(/_/gu, ' ')} ${op[1]}` : `${f.label ?? f.id.replace(/_/gu, ' ')} ${op[1]} ${value}`);
  }
  const or = joiners[0] === 'or';
  return { when: out.join(or ? ', or ' : ', '), said: said.join(or ? ' or ' : ' and ') };
}

/* ── the trigger ───────────────────────────────────────────────────── */

type Trig = {
  kind: 'create' | 'update' | 'delete' | 'time' | 'arrival';
  list: SentenceList | null;
  door: SentenceDoor | null;
  on: Record<string, unknown> | null;
  when: string;
  once: string[];
  said: string;
  /** The row noun, "bill", for the words of an action. */
  noun: string;
  replay: Replay;
  inline: boolean;
};

const EVENT = {
  create: /^(?:new\s+)?(.+?)\s+(?:(?:is|are|gets?|was|were|has been|have been)\s+)?(?:added|created|made|logged|saved|recorded|entered|written)(?:\s+(?:to|in|into|on)\s+(?:the\s+)?(.+))?$/iu,
  update: /^(.+?)\s+(?:(?:is|are|gets?|was|were|has been)\s+)?(?:changed|updated|edited|changes|updates|edits)(?:\s+(?:in|on)\s+(?:the\s+)?(.+))?$/iu,
  delete: /^(.+?)\s+(?:(?:is|are|gets?|was|were|has been)\s+)?(?:deleted|removed|deletes)(?:\s+(?:from|in)\s+(?:the\s+)?(.+))?$/iu,
};
const ARRIVES = /^(.+?)\s+(?:arrives|arrived|comes in|comes through|lands|is received|is forwarded|turns up)(?:\s+(?:at|in|on|to|through|via)\s+(?:the\s+)?(.+))?$/iu;
const SPAN = /^(.+?)\s+(?:is\s+|are\s+)?(?:coming up\s+)?(?:in|within)\s+(\d{1,3})\s*(days?|weeks?|d|w)$/iu;
const DUE = /^(.+?)\s+(?:is\s+|are\s+|gets?\s+)?(due|overdue|late)(?:\s+(?:in|within|by)\s+(\d{1,3})\s*(days?|weeks?|d|w)|\s+(today|tomorrow))?$/iu;

function listOf(noun: string, named: string | undefined, world: SentenceWorld): SentenceList | { why: string } {
  for (const word of [named, noun]) {
    if (word === undefined || word.trim() === '' || (word === noun && GENERIC.test(one(noun)))) continue;
    const got = listFor(word.replace(ARTICLE, ''), world.lists);
    if (got === 'many') return { why: `More than one list could be "${word.trim()}". Name the list, such as "in ${world.lists[0]?.name ?? 'Tasks'}".` };
    if (got !== null) return got;
  }
  return { why: `I could not tell which list "${(named ?? noun).trim()}" is. Name it as it is called in the sidebar.` };
}

function triggerOf(text: string, world: SentenceWorld): Trig | { why: string } {
  let t = text;
  let whereText = '';
  const w = /\s+(?:where|whose|with|that has|which has)\s+(.+)$/iu.exec(t);
  if (w) {
    whereText = w[1]!;
    t = t.slice(0, w.index);
  }
  const bare = t.replace(ARTICLE, '').trim();

  /* A DATE COMING UP: due in 3 days, due today, overdue, renews within 2 weeks. */
  const days = (n: string, unit: string): number => Number(n) * (/^w/iu.test(unit) ? 7 : 1);
  let timed: { noun: string; fieldWord: string; within: number | null; late: boolean } | null = null;
  const due = DUE.exec(bare);
  if (due) {
    const late = lower(due[2]!) !== 'due';
    timed = { noun: due[1]!, fieldWord: 'due', late, within: late ? null : due[3] ? days(due[3], due[4]!) : due[5] && lower(due[5]) === 'tomorrow' ? 1 : 0 };
  } else {
    const span = SPAN.exec(bare);
    if (span) {
      const words = span[1]!.split(' ');
      for (let i = words.length - 1; i >= 1 && timed === null; i--) {
        const list = listFor(words.slice(0, i).join(' ').replace(ARTICLE, ''), world.lists);
        if (list !== null && list !== 'many' && fieldFor(list.fields, words.slice(i).join(' '), DATES)) timed = { noun: words.slice(0, i).join(' '), fieldWord: words.slice(i).join(' '), late: false, within: days(span[2]!, span[3]!) };
      }
    }
  }
  if (timed) {
    const list = listOf(timed.noun.replace(ARTICLE, ''), undefined, world);
    if ('why' in list) return list;
    const f = dueField(list, timed.fieldWord);
    if (!f) return { why: `${list.name} has no date I can read "${timed.fieldWord}" as. Name the date field, such as "${list.name === '' ? 'Due' : 'due'}".` };
    const name = f.label ?? f.id.replace(/_/gu, ' ');
    const extra = whereText === '' ? null : whereOf(whereText, list.fields);
    if (extra !== null && 'why' in extra) return extra;
    if (extra !== null && /, or /u.test(extra.when)) return { why: 'A date condition can only be joined to others with "and".' };
    const window = timed.late ? `${f.id} before today` : `${f.id} after yesterday, ${f.id} before +${(timed.within ?? 0) + 1}d`;
    const noun = list.one ?? one(list.name);
    const phrase = timed.late ? `${lower(name) === 'due' || lower(name) === 'due date' ? 'is overdue' : `${lower(name)} has passed`}` : timed.within === 0 ? `${lower(name) === 'due' || lower(name) === 'due date' ? 'is due' : `${lower(name)} is`} today` : `${lower(name) === 'due' || lower(name) === 'due date' ? 'is due' : `${lower(name)} is`} in ${timed.within} day${timed.within === 1 ? '' : 's'}`;
    return {
      kind: 'time', list, door: null, on: null, when: extra ? `${window}, ${extra.when}` : window, once: ['entry', f.id], noun,
      said: `When a ${noun} ${phrase}${extra ? ` and ${extra.said}` : ''}`, inline: true,
      replay: { kind: 'time', register: list.id, field: f.id, within: timed.late ? 0 : (timed.within ?? 0), where: extra?.when ?? '' },
    };
  }

  /* A ROW MADE, CHANGED OR REMOVED. */
  for (const op of ['create', 'update', 'delete'] as const) {
    const m = EVENT[op].exec(bare);
    if (!m) continue;
    const list = listOf(m[1]!, m[2], world);
    if ('why' in list) return list;
    const extra = whereText === '' ? null : whereOf(whereText, list.fields);
    if (extra !== null && 'why' in extra) return extra;
    const noun = list.one ?? one(list.name);
    const verb = op === 'create' ? `a new ${noun} is added to ${list.name}` : op === 'update' ? `a ${noun} is changed in ${list.name}` : `a ${noun} is deleted from ${list.name}`;
    return {
      kind: op, list, door: null, on: { written: { register: list.id, op: [op] } }, when: extra?.when ?? '', once: ['entry'], noun,
      said: `When ${verb}${extra ? ` and ${extra.said}` : ''}`, inline: false,
      replay: { kind: 'written', register: list.id, op, where: extra?.when ?? '' },
    };
  }

  /* SOMETHING ARRIVING, with the sender and the door when it says them. */
  const arrival = ARRIVES.exec(bare);
  if (arrival) {
    let subject = arrival[1]!;
    let sender = '';
    const from = /\s+from\s+(.+)$/iu.exec(subject);
    if (from) {
      sender = unquote(from[1]!);
      subject = subject.slice(0, from.index);
    }
    const doorWords = [arrival[2], subject].filter((x): x is string => x !== undefined).map((x) => x.replace(ARTICLE, ''));
    const doors = world.doors.filter((d) => doorWords.some((word) => one(d.name) === one(word) || one(d.id) === one(word)));
    const door = doors.length === 1 ? doors[0]! : null;
    if (sender !== '' && whereText !== '') return { why: 'Say who it is from, or what it contains, but not both in one sentence.' };
    const extra = whereText === '' ? null : whereOf(whereText, ARRIVAL_FIELDS);
    if (extra !== null && 'why' in extra) return extra;
    const when = sender !== '' ? [`from contains ${/\s/u.test(sender) ? `"${sender}"` : sender}`, `subject contains ${/\s/u.test(sender) ? `"${sender}"` : sender}`, `body contains ${/\s/u.test(sender) ? `"${sender}"` : sender}`].join(', or ') : (extra?.when ?? '');
    const list = door?.register ? (world.lists.find((l) => l.id === door.register) ?? null) : null;
    const noun = subject.replace(ARTICLE, '').trim() || 'message';
    return {
      kind: 'arrival', list, door, on: { arrival: door ? { ingest: door.id } : {} }, when, once: [], noun,
      said: `When a ${noun}${sender ? ` from ${sender}` : ''} arrives${door ? ` at ${door.name}` : ''}${extra ? ` and ${extra.said}` : ''}`, inline: false,
      replay: { kind: 'arrival', where: when },
    };
  }

  return { why: 'I can read "when a <thing> is added, changed or deleted", "when a <thing> is due in 3 days", and "when a <thing> arrives", each with an optional "where <field> is <value>".' };
}

/* ── the action ────────────────────────────────────────────────────── */

type Act = { steps: Record<string, unknown>[]; said: string; row: boolean; loud: boolean; note?: string };

const MARK_FIELDS = ['category', 'type', 'kind', 'label', 'bucket', 'folder', 'group', 'lane', 'status'];

/** The value a field takes for the words a person gave: an enum's id by its id or its label. */
function enumValue(f: SentenceField, said: string): string | null {
  const w = lower(said);
  const hit = (f.values ?? []).find((v) => lower(v) === w || lower(v.replace(/_/gu, ' ')) === w || lower(f.labels?.[v] ?? '') === w);
  return hit ?? null;
}

function fileUnder(value: string, list: SentenceList, world: SentenceWorld, verbSaid: string): Act | { why: string } {
  const fields = list.fields.filter((f) => f.type === 'enum' || f.type === 'ref');
  const named = fields.filter((f) => fieldWords(f).some((n) => MARK_FIELDS.includes(n)));
  const fitting = (named.length > 0 ? named : fields).filter((f) => f.type === 'ref' || enumValue(f, value) !== null);
  if (fitting.length !== 1)
    return { why: `I cannot tell which field of ${list.name} "${value}" goes in. Say it as "set <field> to ${value}".` };
  const f = fitting[0]!;
  const label = f.label ?? f.id.replace(/_/gu, ' ');
  const said = verbSaid === 'file' ? `file it under ${value}` : `set ${label} to ${value}`;
  if (f.type === 'enum') return { steps: [{ set: { field: f.id, to: enumValue(f, value)! } }], said, row: true, loud: false };
  const target = world.lists.find((l) => l.id === f.to);
  if (!target?.title) return { why: `${label} points at a list I cannot look names up in. Say it as "set ${label} to ${value}".` };
  return { steps: [{ link: { field: f.id, to: { register: target.id, by: target.title, value } } }], said, row: true, loud: false };
}

function actionOf(text: string, trig: Trig, world: SentenceWorld): Act | { why: string } {
  const t = text.trim();
  const list = trig.list;
  const title = list?.title;
  const remind = /^(?:remind me|tell me|notify me|let me know|alert me|ping me|warn me)(?:\s+(?:on|in|at)\s+(.+?))?(?:\s+(?:to|that|about)\s+(.+))?$/iu.exec(t);
  if (remind) {
    const text2 = remind[2] ? cap(unquote(remind[2])) : '';
    const about = title ? ` {{${title}}}` : '';
    const say =
      text2 !== '' ? text2
      : trig.kind === 'time' ? `${cap(trig.noun)}${about} ${/overdue|passed/u.test(trig.said) ? 'is overdue' : 'is coming up'}.`
      : trig.kind === 'create' ? `New ${trig.noun}${about}.`
      : trig.kind === 'update' ? `${cap(trig.noun)}${about} changed.`
      : trig.kind === 'delete' ? `A ${trig.noun} was deleted.`
      : `A ${trig.noun} arrived.`;
    const where = remind[1];
    return {
      steps: [{ notify: { say } }], said: 'tell me', row: false, loud: true,
      ...(where ? { note: `It tells you in your notices. It cannot put a reminder on ${where} yet.` } : {}),
    };
  }
  const tag = /^(tag|untag)\s+(?:it|this|them)?\s*(?:as|with)?\s*(.+)$/iu.exec(t);
  if (tag) {
    const name = unquote(tag[2]!);
    return { steps: [lower(tag[1]!) === 'tag' ? { tag: name } : { untag: name }], said: `${lower(tag[1]!)} it ${name}`, row: true, loud: false };
  }
  const note = /^(?:add a note|note)\s*:?\s*(.+)$/iu.exec(t);
  if (note) return { steps: [{ note: unquote(note[1]!) }], said: `add the note "${unquote(note[1]!)}"`, row: true, loud: false };
  const filing = /^(file|put|move|categori[sz]e|sort|label)\s+(?:it|this|them)?\s*(?:under|in|into|as|to)\s+(.+)$/iu.exec(t);
  const marking = /^mark\s+(?:it|this|them)\s+(?:as\s+)?(.+)$/iu.exec(t);
  if (filing || marking) {
    if (!list) return { why: 'To file a row I need to know its list. Say which door it arrives at, such as "at Bank texts".' };
    const value = unquote((filing ? filing[2] : marking![1])!);
    if (marking) {
      const f = list.state ? list.fields.find((x) => x.id === list.state) : undefined;
      const v = f ? enumValue(f, value) : null;
      if (f && v !== null) return { steps: [{ set: { field: f.id, to: v } }], said: `mark it ${value}`, row: true, loud: false };
    }
    return fileUnder(value, list, world, filing ? 'file' : 'set');
  }
  const set = /^set\s+(?:its\s+|the\s+)?(.+?)\s+to\s+(.+)$/iu.exec(t);
  if (set) {
    if (!list) return { why: 'To set a field I need to know its list. Say which door it arrives at, such as "at Bank texts".' };
    const f = fieldFor(list.fields, set[1]!);
    if (!f) return { why: `${list.name} has no field I can read "${set[1]}" as.` };
    const value = unquote(set[2]!);
    const label = f.label ?? f.id.replace(/_/gu, ' ');
    if (f.type === 'enum') {
      const v = enumValue(f, value);
      if (v === null) return { why: `${label} on ${list.name} is one of ${(f.values ?? []).join(', ')}, not "${value}".` };
      return { steps: [{ set: { field: f.id, to: v } }], said: `set ${label} to ${value}`, row: true, loud: false };
    }
    if (f.type === 'ref') return fileUnder(value, list, world, 'set');
    return { steps: [{ set: { field: f.id, to: value } }], said: `set ${label} to ${value}`, row: true, loud: false };
  }
  return { why: `I do not know how to "${t}" yet. I can tell you, tag, file or set a field, or add a note.` };
}

/** The pieces of the action half: split on "and" only where another verb follows, so a name with "and" in it stays whole. */
const VERBS = '(?:remind|tell|notify|let|alert|ping|warn|tag|untag|mark|set|file|move|put|add|note|label|categori[sz]e|sort)';
const splitActions = (text: string): string[] => text.split(new RegExp(`\\s*(?:,\\s*)?(?:and then|then|and)\\s+(?=${VERBS}\\b)|\\s*,\\s*(?=${VERBS}\\b)`, 'iu')).filter((x) => x.trim() !== '');

/* ── the whole sentence ────────────────────────────────────────────── */

/** The comma or "then" that ends the trigger: the first one outside quotes. */
function cut(text: string): [string, string] | null {
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '"') quoted = !quoted;
    if (quoted) continue;
    if (text[i] === ',') return [text.slice(0, i), text.slice(i + 1)];
    if (/^\s+then\s/iu.test(text.slice(i, i + 6))) return [text.slice(0, i), text.slice(i).replace(/^\s+then\s+/iu, '')];
  }
  return null;
}

export function parseSentence(raw: string, world: SentenceWorld, rule = 'sentence'): Sentenced {
  const text = clean(raw);
  const start = /^(?:when(?:ever)?|if|every time|each time|as soon as|once)\s+(.+)$/iu.exec(text);
  if (!start) return fail('Start with "When", say what happens, then a comma and what to do. For example: When a bill is due in 3 days, tell me.');
  const halves = cut(start[1]!);
  if (!halves || halves[0].trim() === '' || halves[1].trim() === '') return fail('Put a comma between what happens and what to do. For example: When a bill is due in 3 days, tell me.');
  const trig = triggerOf(halves[0].trim(), world);
  if ('why' in trig) return fail(trig.why);

  const acts: Act[] = [];
  for (const piece of splitActions(halves[1])) {
    const act = actionOf(piece, trig, world);
    if ('why' in act) return fail(act.why);
    acts.push(act);
  }
  if (acts.length === 0) return fail('Say what to do after the comma, such as "tell me" or "tag it urgent".');
  if (acts.some((a) => a.row) && trig.list === null && trig.kind !== 'arrival') return fail('I could not tell which list this is about.');
  if (acts.some((a) => a.row) && trig.list === null) return fail('To change the row it brings I need to know the list. Say which door it arrives at, such as "at Bank texts".');

  const steps = acts.flatMap((a) => a.steps);
  const said = `${trig.said}, ${acts.map((a) => a.said).join(' and ')}.`;
  const once = acts.some((a) => a.loud) ? trig.once : [];
  const body: FlowDecl & Record<string, unknown> = trig.inline
    ? { rule, name: said, register: trig.list!.id, ...(trig.when === '' ? {} : { when: trig.when }), then: steps as never, ...(once.length ? { once_per: once } : {}) }
    : { rule, name: said, on: trig.on as never, ...(trig.when === '' ? {} : { when: trig.when }), steps: steps as never, ...(once.length ? { once_per: once } : {}) };
  const notes = acts.flatMap((a) => (a.note ? [a.note] : []));
  if (trig.kind === 'update' || trig.kind === 'delete') notes.push(`It acts once for each ${trig.noun}, however often it changes.`);
  return { ok: true, body, said, replay: trig.replay, notes };
}

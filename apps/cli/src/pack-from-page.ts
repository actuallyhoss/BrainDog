/**
 * `braindog addon new <id> --from-page <file.dog>`: an add-on started from a page a person pulled.
 *
 * A PAGE FILE HOLDS THE PAGE AND NOTHING IT READS. `braindog page pull` writes the stored page body (`@braindog/dog`),
 * so a table names its list as `register.bills` and a stat cell its figure as `metric.bills-due`, and neither comes
 * with it. What the page reads is taken from `held`, the record's own declarations, when a caller has them (as
 * `exportPack` in `packages/record` reads them), and followed until nothing new is read: a figure's list, a script a
 * rule runs, and every automation that works on a list taken. A list nobody passed is made from what the page shows
 * of it, field by field, and said so. A figure, a script or an automation nobody passed cannot be made from a page,
 * so the page is refused naming the field that names it, and the fix.
 *
 * NOTHING OF THE AUTHOR'S GOES OUT, the owner's line, as `exportPack` holds it. Everything goes through `declare`'s
 * `scrubPack`, which turns a literal naming a row, a person, a project, an address or a link into a setting and drops a
 * key, a token, a door's address and a skill's text. Three things it cannot know from a page, done here: a note's words
 * are the author's prose, so a note says a line of ours instead; a filter's literal on a list's text field (a payee, a
 * client) is the author's too, so it is a setting; and a script's key labels name the author's vault, so each is
 * renamed for the script, in its source as well. Every setting goes out holding a stand-in, never the literal.
 *
 * THE FILE IS READ BACK THROUGH THE DOOR IT COMES IN BY (`normalise`), so a file this answers is one a record reads.
 * PURE: no I/O and no clock. Each line of `lines` is a sentence to show the person, about what was taken and why.
 */

import { normalise } from '@braindog/declare';
import { scrubPack, type ScrubNames } from '@braindog/declare/scrub';
import { parseDog } from '@braindog/dog';
import { FORMAT_VERSION } from '@braindog/kernel';
import { no, ok, type Result } from '@braindog/ports';
import { PRIMITIVES_VERSION } from 'braindog-render';

type Body = Record<string, unknown>;

export type FromPageOptions = {
  /** The add-on's title; the page's own title when absent. */
  title?: string | undefined;
  version?: string | undefined;
  author?: string | undefined;
  /** The record's own declarations, as the record holds them (`{ id, kind, body }`) or as a pack file writes them. */
  held?: readonly unknown[] | undefined;
};

/** The add-on document, and one sentence for each thing taken, made, renamed or left out. */
export type FromPage = { file: Body; lines: string[] };

/** One declaration by its address (`register.bills`), its kind and its body as a pack file writes it. */
type Decl = { id: string; kind: string; body: Body };

const PACK_ID = /^[a-z][a-z0-9-]{1,62}$/u;
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;
/** A declaration said by its address, wherever a value names one. */
const ADDRESS = /^(register|metric|script|rule|ingest)\.([a-z][a-z0-9_-]*)$/u;
/** The kinds an add-on made from a page carries, in the order the file lists them; the page comes last. */
const CARRIED = ['register', 'metric', 'script', 'rule', 'ingest'] as const;
/** Keys whose value names a declaration by its id alone. `then`, `each` and `late` name figures on a page's blocks. */
const BY_KEY: Readonly<Record<string, string>> = { register: 'register', metric: 'metric', script: 'script', rule: 'rule', ingest: 'ingest' };
const PAGE_FIGURE_KEYS = new Set(['then', 'each', 'late', 'figure']);
/** What each kind is called to a person. */
const WORDS: Readonly<Record<string, string>> = {
  register: 'the list',
  metric: 'the figure',
  script: 'the script',
  rule: 'the automation',
  ingest: 'the door',
  page: 'the page',
};
/** Keys a page body holds about where it came from on one record, which mean nothing on another. */
const RECORD_ONLY = ['pack', 'origin', 'derived_from', 'placed'];
/** The kinds whose words are the author's prose, and the keys they sit under. */
const PROSE_KINDS = new Set(['note', 'quote']);
const PROSE_KEYS = ['body', 'text'];
/** Fields every list has, which a list made from a page never declares. */
const KERNEL_FIELDS = new Set(['id', 'seq', 'changed', 'created', 'updated', 'version', 'spoken']);
/** The words a filter uses that name no value, as `scrub.ts` reads them. */
const NO_VALUE = new Set(['set', 'empty', 'unset', 'true', 'false', 'me', 'today', 'yesterday', 'tomorrow']);
/** A clause of a filter written as a sentence, as `scrub.ts` reads one: `field is value`, comma between. */
const CLAUSE = /(^|,)(\s*)([a-z][a-z0-9_]*)(\s+(?:is not|is|not)\s+)([^,]+)/gu;
/** Any clause's field: the first word of each part of a sentence. */
const CLAUSE_FIELD = /(?:^|,)\s*([a-z][a-z0-9_]*)\s+([a-z]+)/gu;
const LEAF_OPS = new Set(['is', 'not', 'in', 'not_in']);
const DAY_OPS = new Set(['before', 'after', 'within', 'since', 'until']);
const DAYISH = /^\d{4}-\d{2}-\d{2}$|^[+-]?\d+[dwmy]$/u;
const NUMBER = /^-?\d+(?:\.\d+)?$/u;
/** A single lower-case word, the shape of an enum's value. */
const WORD = /^[a-z][a-z0-9_]*$/u;
/** The field types a filter's literal is the author's own on, so it becomes a setting. */
const TEXTISH = new Set(['text', 'longtext', 'document', 'email', 'url', 'phone', 'person', 'ref', 'refs', 'list']);

/** What a note says in place of the author's words. */
export const NOTE_WORDS = 'What this page is for, in your own words.';
/** What a setting's note says to whoever installs the add-on, as `exportPack` says it. */
const STAND_IN_NOTE = 'An example to start from. Change it to one of yours.';
/** A person's handle in the shape the record writes one, naming nobody. */
const NOBODY = `p_${'0'.repeat(26)}`;

const isMap = (v: unknown): v is Body => typeof v === 'object' && v !== null && !Array.isArray(v);
const wordsOf = (id: string): string => {
  const words = id.replaceAll(/[-_]+/gu, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
};
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
/** "a, b and c". */
const listed = (xs: readonly string[]): string => (xs.length < 2 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/** What a declaration calls itself: its name, its title or its heading, else its id in words. */
function titleOf(d: Decl): string {
  for (const key of ['name', 'title', 'heading']) {
    const v = d.body[key];
    if (typeof v === 'string' && v.trim() !== '') return v.trim();
  }
  return wordsOf(d.id.slice(d.id.indexOf('.') + 1));
}

/** What a setting holds when the file is made, by what it names, never the author's literal (`exportPack`'s `standIn`). */
function standIn(names: ScrubNames | 'text', literal: string): string {
  if (names === 'row') {
    const list = /^([a-z][a-z0-9_]*)#/u.exec(literal.trim())?.[1];
    return list === undefined ? 'example' : `${list}#1`;
  }
  if (names === 'person') return NOBODY;
  if (names === 'address') return 'someone@example.com';
  if (names === 'link') return 'https://example.com';
  return 'example';
}

/* ── reading what was given ─────────────────────────────────────────── */

/** A body in a pack file's own shape: its kind first, naming it, as the record may store it under `id`. */
function asWritten(kind: string, body: Body): Body {
  const { [kind]: named, ...rest } = body;
  if (typeof named === 'string') return { [kind]: named, ...rest };
  const { id, ...others } = rest;
  return { [kind]: id, ...others };
}

/** The declarations a caller passed, by address. Anything that is not one of the carried kinds is passed over. */
function heldOf(given: readonly unknown[]): Map<string, Decl> {
  const out = new Map<string, Decl>();
  for (const entry of given) {
    if (!isMap(entry)) continue;
    let kind: string | undefined;
    let body: unknown;
    if (typeof entry.kind === 'string' && typeof entry.id === 'string' && entry.body !== undefined) {
      kind = entry.kind;
      body = entry.body;
      if (typeof body === 'string')
        try {
          body = JSON.parse(body);
        } catch {
          continue;
        }
    } else {
      kind = Object.keys(entry)[0];
      body = entry;
    }
    if (kind === undefined || !(CARRIED as readonly string[]).includes(kind) || !isMap(body)) continue;
    const written = asWritten(kind, body);
    if (typeof written[kind] !== 'string') continue;
    const id = `${kind}.${String(written[kind])}`;
    out.set(id, { id, kind, body: written });
  }
  return out;
}

/**
 * Every declaration one body reads, by address, with the first place it is named: a value that is an address (a block's
 * `source`, a page's `requires`, a figure's `source`), a key naming one by id (a stat cell's `metric`, a rule's
 * `register`, a step's `script`), a link field's `to`, and the lists a script reads and writes.
 */
function readsOf(kind: string, body: Body): Map<string, string> {
  const out = new Map<string, string>();
  const add = (id: string, at: string): void => void (out.has(id) || out.set(id, at));
  const walk = (node: unknown, at: string, top: boolean): void => {
    if (typeof node === 'string') return void (ADDRESS.test(node) && add(node, at));
    if (Array.isArray(node)) return node.forEach((n, i) => walk(n, `${at}.${i}`, false));
    if (!isMap(node)) return;
    for (const [k, v] of Object.entries(node)) {
      const here = at === '' ? k : `${at}.${k}`;
      if (top && k === kind) continue;
      const named = BY_KEY[k] ?? (kind === 'page' && PAGE_FIGURE_KEYS.has(k) ? 'metric' : undefined);
      if (typeof v === 'string' && named !== undefined && !v.includes('.') && v !== '') add(`${named}.${v}`, here);
      else if (k === 'script' && isMap(v) && typeof v.id === 'string') add(`script.${v.id}`, `${here}.id`);
      else if (k === 'to' && typeof v === 'string' && (node.type === 'ref' || node.type === 'refs' || node.of === 'ref')) add(`register.${v}`, here);
      else if (kind === 'script' && (k === 'reads' || k === 'writes') && Array.isArray(v))
        v.forEach((x, i) => typeof x === 'string' && WORD.test(x) && add(`register.${x}`, `${here}.${i}`));
      walk(v, here, false);
    }
  };
  walk(body, '', true);
  return out;
}

/** The page as it goes out: nothing about the record it was on, and a note's words replaced, each said. */
function pageOf(given: Body, lines: string[]): Body {
  const page: Body = {};
  for (const [k, v] of Object.entries(given)) if (!RECORD_ONLY.includes(k)) page[k] = v;
  if (!Array.isArray(page.blocks)) return page;
  let notes = 0;
  page.blocks = page.blocks.map((block: unknown) => {
    if (!isMap(block) || typeof block.kind !== 'string' || !PROSE_KINDS.has(block.kind)) return block;
    const out: Body = { ...block };
    for (const key of PROSE_KEYS)
      if (typeof out[key] === 'string' && out[key] !== '') {
        out[key] = NOTE_WORDS;
        notes += 1;
      }
    return out;
  });
  if (notes > 0)
    lines.push(
      `${notes === 1 ? 'A note' : `${notes} notes`} on the page held your own words, so ${notes === 1 ? 'it says' : 'each says'} "${NOTE_WORDS}" instead. Write the plugin's own.`,
    );
  return page;
}

/* ── a list made from what the page shows of it ─────────────────────── */

/** What a filter says about each field: the values it compares with, and whether it compares a day. */
type Seen = Map<string, { values: Set<string>; day: boolean; other: boolean }>;

/** The fields and the values a filter names, as a sentence (`state is open, due before today`) or a tree. */
function filterFields(where: unknown, seen: Seen): void {
  const note = (field: string, op: string, value: unknown): void => {
    if (KERNEL_FIELDS.has(field)) return;
    const one = seen.get(field) ?? { values: new Set<string>(), day: false, other: false };
    seen.set(field, one);
    if (DAY_OPS.has(op)) one.day = true;
    for (const v of Array.isArray(value) ? value : [value]) {
      if (typeof v !== 'string') continue;
      for (const part of v.split(/\s+or\s+/u).map((p) => p.trim())) {
        if (part === '' || part.includes('{{') || NO_VALUE.has(part)) continue;
        if (DAYISH.test(part)) one.day = true;
        else if (WORD.test(part)) one.values.add(part);
        else one.other = true;
      }
    }
  };
  if (typeof where === 'string') {
    for (const m of where.matchAll(CLAUSE_FIELD)) note(m[1]!, m[2]!, undefined);
    for (const m of where.matchAll(CLAUSE)) note(m[3]!, 'is', m[5]!.trim());
    return;
  }
  if (Array.isArray(where)) return where.forEach((w) => filterFields(w, seen));
  if (!isMap(where)) return;
  if (typeof where.field === 'string')
    for (const [op, v] of Object.entries(where)) if (op !== 'field') note(where.field, op, LEAF_OPS.has(op) ? v : undefined);
  for (const key of ['all', 'any', 'not']) if (where[key] !== undefined && typeof where[key] !== 'string') filterFields(where[key], seen);
}

/**
 * A list for a page that reads one nobody passed: every field the page shows or filters by, the first column its
 * title. A field a filter compares with single words only is a choice of those words; one compared with a day is a
 * day; every other field is text. `first` is the first list the page reads, which also takes the page's reader filters.
 */
function madeList(name: string, page: Body, first: boolean): Body {
  const order: string[] = [];
  const seen: Seen = new Map();
  const field = (f: unknown): void => void (typeof f === 'string' && WORD.test(f) && !KERNEL_FIELDS.has(f) && !order.includes(f) && order.push(f));
  const over = (b: Body): boolean => b.source === `register.${name}` || b.register === name;
  for (const block of Array.isArray(page.blocks) ? page.blocks : []) {
    if (!isMap(block) || !over(block)) continue;
    for (const key of ['columns', 'order'])
      for (const c of Array.isArray(block[key]) ? (block[key] as unknown[]) : []) field(isMap(c) ? c.field : c);
    if (isMap(block.stale)) field(block.stale.field);
    field(block.field);
    filterFields(block.where, seen);
    if (isMap(block.short)) filterFields(block.short.where, seen);
  }
  if (isMap(page.for) && page.for.register === name) filterFields(page.for.where, seen);
  if (first && Array.isArray(page.filters)) for (const f of page.filters) field(isMap(f) ? f.field : undefined);
  for (const f of seen.keys()) field(f);
  if (order.length === 0) order.push('name');
  const fields = order.map((id, i) => {
    const s = seen.get(id);
    if (i === 0) return { id, type: 'text', required: true };
    if (s?.day === true) return { id, type: 'day' };
    if (s !== undefined && s.values.size > 0 && !s.other) return { id, type: 'enum', values: [...s.values].sort() };
    return { id, type: 'text' };
  });
  return { register: name, name: wordsOf(name), title: order[0], fields };
}

/* ── what the scrub cannot know from a page ─────────────────────────── */

/** A script's key labels, each renamed for the script, in its source too: a label names a key in the author's vault. */
function ownKeys(d: Decl, lines: string[]): Decl {
  const keys = d.body.keys;
  if (!Array.isArray(keys) || keys.length === 0) return d;
  let source = typeof d.body.source === 'string' ? d.body.source : '';
  const base = d.id.slice('script.'.length).slice(0, 30);
  const renamed = keys.map((label, i) => {
    const plain = `${base}-key-${i + 1}`;
    if (typeof label === 'string' && label !== '') source = source.split(label).join(plain);
    return plain;
  });
  lines.push(
    `${cap(WORDS.script!)} ${titleOf(d)} opens ${keys.length === 1 ? 'a key' : `${keys.length} keys`}, and a key's name is yours, so ${keys.length === 1 ? 'it is' : 'they are'} called ${listed(renamed)} now. Whoever installs it puts their own key under that name.`,
  );
  return { ...d, body: { ...d.body, keys: renamed, ...(typeof d.body.source === 'string' ? { source } : {}) } };
}

/**
 * Each literal a filter compares a text field with, made a setting holding a stand-in: a payee, a client, a place. A
 * choice's own value, a day, a number and a word like `today` name nothing of the author's and stay. The scrub has
 * already made a row, a person and a project a setting, which reads `{{config:` and is passed over here.
 */
function textLiterals(declarations: Body[], config: Record<string, unknown>): { declarations: Body[]; made: string[] } {
  const fields = new Map<string, { type: string; values: Set<string> }>();
  for (const d of declarations)
    if (typeof d.register === 'string' && Array.isArray(d.fields))
      for (const f of d.fields)
        if (isMap(f) && typeof f.id === 'string')
          fields.set(f.id, { type: String(f.type ?? 'text'), values: new Set(Array.isArray(f.values) ? f.values.map(String) : []) });
  const made: string[] = [];
  const byLiteral = new Map<string, string>();
  const keep = (field: string, v: string): boolean => {
    if (v === '' || v.includes('{{') || NO_VALUE.has(v) || NUMBER.test(v) || DAYISH.test(v)) return true;
    const f = fields.get(field);
    if (f === undefined) return KERNEL_FIELDS.has(field);
    if (f.type === 'enum') return v.split(/\s+or\s+/u).every((p) => f.values.has(p.trim()));
    return !TEXTISH.has(f.type);
  };
  const placed = (field: string, raw: string): string => {
    const v = raw.trim();
    if (keep(field, v)) return raw;
    let key = byLiteral.get(v);
    if (key === undefined) {
      const base = field.replace(/^[^a-z]+/u, '').slice(0, 28) || 'value';
      key = base;
      for (let n = 2; key in config; n++) key = `${base}_${n}`;
      config[key] = { type: 'text', default: 'example', label: wordsOf(field), note: STAND_IN_NOTE };
      byLiteral.set(v, key);
      made.push(wordsOf(field).toLowerCase());
    }
    return `{{config:${key}}}`;
  };
  const tree = (node: unknown): unknown => {
    if (typeof node === 'string')
      return node.replace(CLAUSE, (all: string, lead: string, gap: string, field: string, verb: string, value: string) => {
        const out = placed(field, value.trim());
        return out === value.trim() ? all : `${lead}${gap}${field}${verb}${out}${value.slice(value.trimEnd().length)}`;
      });
    if (Array.isArray(node)) return node.map(tree);
    if (!isMap(node)) return node;
    const leaf = typeof node.field === 'string' ? node.field : null;
    const out: Body = {};
    for (const [k, v] of Object.entries(node))
      out[k] =
        leaf !== null && LEAF_OPS.has(k)
          ? Array.isArray(v)
            ? v.map((x) => (typeof x === 'string' ? placed(leaf, x) : x))
            : typeof v === 'string'
              ? placed(leaf, v)
              : v
          : ['all', 'any', 'not'].includes(k)
            ? tree(v)
            : v;
    return out;
  };
  /* EVERY FILTER, WHEREVER IT SITS: a block's `where` and `short.where`, a page's `for.where`, a figure's `where`, and an
     automation's `when`, which is a filter on its list. */
  const walk = (node: unknown, isRule: boolean): unknown => {
    if (Array.isArray(node)) return node.map((n) => walk(n, isRule));
    if (!isMap(node)) return node;
    const out: Body = {};
    for (const [k, v] of Object.entries(node)) out[k] = k === 'where' || k === 'filter' || (isRule && k === 'when') ? tree(v) : walk(v, isRule);
    return out;
  };
  return { declarations: declarations.map((d) => walk(d, typeof d.rule === 'string') as Body), made };
}

/* ── the add-on ─────────────────────────────────────────────────────── */

/**
 * The add-on document for `id` made from a page's `.dog` text, and a sentence for each thing in it that the person did
 * not write in the file: what was taken and why, what was made, what became a setting and what was left out. Refused,
 * in a sentence naming the field and the fix, when the file does not read, when the page reads nothing, or when it
 * names a figure, a script or an automation that was not passed in `held`.
 */
export async function packFromPage(id: string, dogText: string, options: FromPageOptions = {}): Promise<Result<FromPage>> {
  if (!PACK_ID.test(id)) return no('VALUE_MALFORMED', `${id} is not a plugin id. Write lower-case letters, digits and dashes, as in reading-club.`, { at: 'id' });
  const version = options.version ?? '1.0.0';
  if (!SEMVER.test(version)) return no('VALUE_MALFORMED', `${version} is not a version. Write one such as 1.0.0.`, { at: 'version' });
  const parsed = parseDog(dogText);
  if (!parsed.ok) return no('FILE_MALFORMED', `Line ${parsed.line} of the page file: ${parsed.fix}`, { at: `line ${parsed.line}` });

  const lines: string[] = [];
  const page = pageOf(parsed.value, lines);
  const pageTitle = typeof page.title === 'string' && page.title.trim() !== '' ? page.title.trim() : wordsOf(String(page.page));
  const reads = readsOf('page', page);
  if (![...reads.keys()].some((r) => r.startsWith('register.') || r.startsWith('metric.')))
    return no(
      'REGISTER_UNRESOLVED',
      `${pageTitle} reads no list and no figure, so a plugin made from it would hold nothing. Give a block a source such as register.<list>, then try again.`,
      { at: 'blocks' },
    );

  /* WHAT THE PAGE READS, followed until nothing new is read: what was passed comes along and is said, and a list nobody
     passed is made from the page. Anything else nobody passed is refused, because a page cannot say how it works. */
  const held = heldOf(options.held ?? []);
  const taken = new Map<string, Decl>();
  const made: string[] = [];
  const queue: { read: string; at: string; by: string }[] = [...reads].map(([read, at]) => ({ read, at, by: `the page ${pageTitle}` }));
  const follow = (d: Decl): void => {
    for (const [read, at] of readsOf(d.kind, d.body)) queue.push({ read, at: `${d.id}.${at}`, by: `${WORDS[d.kind]} ${titleOf(d)}` });
  };
  const drain = (): Result<null> => {
    for (let i = 0; i < queue.length; i++) {
      const { read, at, by } = queue[i]!;
      if (taken.has(read) || made.includes(read)) continue;
      const kind = read.slice(0, read.indexOf('.'));
      const mine = held.get(read);
      if (mine !== undefined) {
        taken.set(read, mine);
        lines.push(`Took ${WORDS[kind]} ${titleOf(mine)}, because ${by} reads it.`);
        follow(mine);
        continue;
      }
      if (kind === 'register') {
        made.push(read);
        continue;
      }
      const words = `${WORDS[kind]} ${wordsOf(read.slice(kind.length + 1))}`;
      return no(
        kind === 'metric' ? 'METRIC_UNKNOWN' : 'DECLARATION_UNKNOWN',
        `${at} names ${words}, and a page file does not say how ${kind === 'metric' ? 'it is counted' : 'it works'}. Make the plugin in the app with Share, A plugin from what you made, which brings it along, or take it out of the file.`,
        { at },
      );
    }
    return ok(null);
  };
  const first = drain();
  if (!first.ok) return first as Result<never>;

  /* EVERY AUTOMATION THAT WORKS ON A LIST TAKEN comes too, with what it runs: a list's automation is how the list behaves. */
  const lists = (): Set<string> => new Set([...taken.keys(), ...made].filter((r) => r.startsWith('register.')));
  for (const d of held.values()) {
    if (d.kind !== 'rule' || taken.has(d.id)) continue;
    const touched = [...readsOf('rule', d.body).keys()].flatMap((r) => [r, ...(r.startsWith('script.') && held.has(r) ? readsOf('script', held.get(r)!.body).keys() : [])]);
    const on = touched.find((r) => lists().has(r));
    if (on === undefined) continue;
    taken.set(d.id, d);
    lines.push(`Took ${WORDS.rule} ${titleOf(d)}, because it works on ${WORDS.register} ${titleOf(taken.get(on) ?? { id: on, kind: 'register', body: {} })}.`);
    follow(d);
    const more = drain();
    if (!more.ok) return more as Result<never>;
  }

  const firstList = [...reads.keys()].find((r) => r.startsWith('register.'));
  const madeBodies = made.map((read) => {
    const body = madeList(read.slice('register.'.length), page, read === firstList);
    const fields = (body.fields as { id: string }[]).map((f) => f.id);
    lines.push(
      `Made ${WORDS.register} ${String(body.name)} from what the page shows of it: ${listed(fields)}. A page does not say every field a list holds, so read them before you publish.`,
    );
    return body;
  });
  const carried = [...taken.values()].map((d) => (d.kind === 'script' ? ownKeys(d, lines) : d));
  const byKind = (kind: string): Body[] => carried.filter((d) => d.kind === kind).map((d) => d.body);
  const set: Body[] = [...byKind('register'), ...madeBodies, ...CARRIED.slice(1).flatMap((k) => byKind(k)), page];

  /* THROUGH THE SCRUB, then the text a filter compares, and every setting given a stand-in rather than the literal. */
  const scrubbed = scrubPack(set);
  if (!scrubbed.ok) return scrubbed as Result<never>;
  const clean = scrubbed.value;
  const config: Record<string, unknown> = {};
  const names = new Map(clean.settings.map((s) => [s.key, s]));
  for (const [key, setting] of Object.entries(clean.config)) {
    const s = names.get(key);
    config[key] = { ...(isMap(setting) ? setting : {}), default: standIn(s?.names ?? 'text', s?.value ?? ''), note: STAND_IN_NOTE };
  }
  const literal = textLiterals(clean.declarations, config);
  const settings = [...clean.settings.map((s) => s.label), ...literal.made];
  if (settings.length > 0)
    lines.push(
      settings.length === 1
        ? `One thing the page named of yours is a setting now: ${settings[0]}. It starts as an example, and whoever installs it picks their own.`
        : `${settings.length} things the page named of yours are settings now: ${listed([...new Set(settings)])}. Each starts as an example, and whoever installs it picks their own.`,
    );
  for (const why of new Set(clean.dropped.map((d) => d.why))) lines.push(`Left out: ${why}`);
  lines.push('Headings, labels and what an automation says are kept as you wrote them, so read them before you publish.');

  const title = options.title?.trim().replace(/\s+/gu, ' ') || pageTitle;
  const doc: Body = {
    pack: id,
    version,
    title,
    summary: `What ${title} adds, in one sentence.`,
    changes: 'The first version.',
    author: options.author ?? 'Your name',
    license: 'MIT',
    requires: { format: FORMAT_VERSION, primitives: PRIMITIVES_VERSION, packs: {} },
    ...(Object.keys(config).length > 0 ? { config } : {}),
    declarations: literal.declarations,
  };
  /* READ BACK THROUGH THE DOOR IT COMES IN BY, so a file a record would refuse is refused here, in the record's words. */
  const back = await normalise(doc, { kind: 'local' });
  if (!back.ok) return back as Result<never>;
  return ok({ file: doc, lines });
}

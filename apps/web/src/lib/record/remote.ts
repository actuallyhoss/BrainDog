/**
 * The register list's question in the record's grammar, and the record's answer in the app's.
 *
 * PURE, AND THAT IS WHY IT IS A FILE OF ITS OWN. The screen asks in the address's words: chips like
 * `state:in:open`, a search box, a column to order by. The record reads a `where` as a sentence or
 * as a tree, and answers with rows whose refs hold the target row's ULID. Everything that translates
 * between the two is here, with no network and no runes, so `remote.test.ts` can hold it against the
 * kernel itself over `node:sqlite`.
 *
 * THE CHIPS GO AS THE SENTENCE `whereOf` WRITES, and the record parses it (`sentenceOf`). The tree
 * is kept for the one question a sentence cannot put, the search box beside the chips (`whereFor`),
 * and for the readers that join a `where` with another under `all` (`treeOf`).
 *
 * THE DECLARATION IS READ FROM `REGISTERS`, which `learn` below fills from the record's answer to
 * `schema`, for the lists this build ships as well as for the ones it does not. The seed's copy was
 * the source here, pinned equal to the record's by `packages/seed/test/declarations.test.ts`, and
 * that pin holds for a fresh seed and for no record in which somebody has added a field since.
 *
 * TWO WRITES, BOTH TO `held.ts`, AND NOTHING ELSE HERE KEEPS STATE: `learn` keeps a list's declaration
 * and `refMapOf` keeps a walked list's row names, because the readers of those facts are spread over
 * the app and none of them is handed the answer they came from.
 */

import { KERNEL_FIELDS, parseWhere, quoteValue } from '@braindog/where';

import { identityOfRow, isRows, rowsFilter, whereOf, type Identity } from './api.ts';
import { FINISHED, leftOut, MONEY_HELD, REGISTERS, seqTitled, TITLES } from './held.ts';
import { searchable, terms } from './find.ts';
import type { Entry, Fields, Filter, RegisterDecl } from './schema.ts';
import { declaredValue, schemaOf } from './where.ts';
import { labels, relabelInto } from '../voice.ts';
import { survivorsOf } from './names.ts';
import { heldNow, holdsList, listsSettled } from './lists-held.ts';
import { learnFaces } from '../picture/pictures.svelte.ts';

/** One register's rows, by the ULID the record stores a ref as, and back again. */
export type RefMap = {
  seqOf: ReadonlyMap<string, number>;
  idOf: ReadonlyMap<number, string>;
  /** The name a person says for each row, from the register's own declared title. */
  titleOf: ReadonlyMap<number, string>;
  /** The mark and hue each row carries, for a register that declares an identity; empty for every other. */
  markOf: ReadonlyMap<number, Identity>;
  /** A category-like row's chip, its icon and colour in words (`shopping-cart pink`), for a register that declares both. */
  chipOf?: ReadonlyMap<number, string>;
};

/**
 * Every ref target's title, keyed `<register>#<seq>`: what a ref is DRAWN as on a live record.
 *
 * `marks` IS THE SAME WALK'S IDENTITIES, keyed alike. A ref into a register with an identity is drawn as a mark as
 * well as a name, and both have to come from the record, or a live row wears the sample's project beside its own.
 *
 * `ids` IS THE WALK'S ROW IDS, `<register> <id>` to the number, so the local copy can draw a logged create's ref, an id
 * in the log, as the number a row holds (`local.ts` `Lands.ids`).
 */
export type Names = ReadonlyMap<string, string> & { readonly chips?: ReadonlyMap<string, string>; readonly marks?: ReadonlyMap<string, Identity>; readonly ids?: ReadonlyMap<string, number> };

/** A `RefMap` for each register a ref field on the asked register points at. */
export type Refs = ReadonlyMap<string, RefMap>;

/** A `where` node: a leaf `{ field, <operator>: value }`, or a group `{ all | any: [...] }`. */
export type Tree = Record<string, unknown>;

/** A row as `list` hands it back, and only the keys read here. */
export type RecordRow = {
  id: string;
  seq: number | null;
  fields: Record<string, unknown>;
  /** The row's state, which the record answers beside its fields as well as in them. */
  state?: string | null;
  version: number;
  created_at: string;
  /** A page's answer cut a long text in it short (the kernel's `leanRows`); `get` answers the same row whole. */
  clipped?: true;
  /** Kept private by its maker, who is the one reading it; and, on `get`, whether the reader made it. */
  private?: true;
  mine?: true;
};

/**
 * The register one field points at, whether it holds ONE ref or a LIST of them.
 *
 * A `list<ref>` DECLARES `type: 'list', of: 'ref'`, AND EVERY WALK HERE ASKED ONLY ABOUT `type`. That
 * is one condition and it decided two things a live screen cannot work without, so both were wrong in
 * the same way: `targetsOf` never named the register a list of refs points at, and `entryOf` never
 * turned its elements into the numbers a person says.
 *
 * MEASURED ON A SEEDED SELF-HOST ON 127.0.0.1:5996, with the register screen's own refs:
 *
 *     /r/skills?f=because:has:4    asked the record {"field":"because","has":"4"}    0 rows, and the sample answers 2
 *
 * ONE ADDRESS AND NOT TWO, because `/r/people?f=projects:has:1` answers 0 rows whether this walk is
 * right or wrong: every seeded person holds `projects: null`, so that address proves nothing and was
 * dropped from this paragraph rather than left reading like a second symptom.
 *
 * `valueOf` below resolves a ref element to the target row's ULID out of that register's `RefMap`, and
 * `refsFor` in `data/record.ts` builds one map per `targetsOf` entry, so the one register the elements
 * had to resolve through was the one register never loaded. The element then went to the record as the
 * characters somebody typed, `json_each.value = '4'` matched nothing, and the grid came back empty,
 * which is the answer a filter gives when it is working. Three commits fixed a real half of this
 * feature each and none of them reached here, because all three were measured against the sample,
 * where `ROWS` holds the row numbers already.
 *
 * `remote.test.ts` DRIVES `because:has:4` AGAINST A REAL KERNEL AND PASSED THROUGHOUT, which is worth
 * saying because it is the reason this survived, and the reason is NOT that its map comes from the
 * seed's `ORDER`: `learnings` is not on `ORDER` at all, it is on `AGENTS_ORDER`. The one test over
 * this field puts `learnings` into the map BY HAND (`remote.test.ts:175`, whose own comment says why:
 * `skills` is not on `ORDER`'s walk either), so it loaded the register the screen never asked for.
 * The sweep beside it, over every element of every list, walks `ORDER` alone and reads its elements
 * off the sample's `ROWS`, so it never reached `skills`, and the one `list<ref>` on `ORDER` it did
 * reach, `people.projects`, holds no elements in the seed: that sweep asked about no list of refs at
 * all. A test that builds its own map cannot see a screen whose map is built by `targetsOf`.
 */
const refTargetOf = (f: { type?: string; of?: string; to?: string }): string | undefined =>
  f.to && (f.type === 'ref' || (f.type === 'list' && f.of === 'ref')) ? f.to : undefined;

/** The registers this one's refs point at, in declared order, each once. */
export function targetsOf(register: string): string[] {
  const out: string[] = [];
  for (const f of REGISTERS[register]?.fields ?? []) {
    const to = refTargetOf(f);
    if (to && !out.includes(to)) out.push(to);
  }
  return out;
}

/**
 * The fields of a list that point at a list this reader holds no names for, because the record refused it (a guest
 * shared Kiln's tasks may not read People). Their values arrive as row ids, and an id is never drawn, so the entry
 * leaves them out (`withoutUnread`).
 */
export function unreadRefs(register: string, refs: Refs): string[] {
  return (REGISTERS[register]?.fields ?? []).flatMap((f) => {
    const to = refTargetOf(f);
    return to !== undefined && !refs.has(to) ? [f.id] : [];
  });
}

/** An entry without the fields `unreadRefs` names. */
export function withoutUnread(entry: Entry, unread: readonly string[]): Entry {
  if (unread.length === 0 || !unread.some((k) => Object.hasOwn(entry.fields, k))) return entry;
  const fields: Fields = { ...entry.fields };
  for (const k of unread) delete fields[k];
  return { ...entry, fields };
}

/**
 * A register's rows as a `RefMap`. A row with no sequence has no number to be called by.
 *
 * AND THE NAME EACH NUMBER GOES BY, because that is what a ref is drawn as. `display` renders a ref
 * as the title of the row it points at, and the only titles it had were the built-in sample's — so a
 * live record drew the SAMPLE's name against this record's number, which is worse than drawing no
 * name at all, because it is a wrong name a reader has no reason to doubt. The walk that builds this
 * map already asks for every row of the target register, and every row carries its declared title,
 * so the name is here for nothing.
 *
 * A ROW WITH NO TITLE IS LEFT OUT rather than mapped to an empty string, and `display` then draws
 * `<list>#<number>`: a row somebody can go and open, instead of a blank where a name should be.
 *
 * AND THE NAMES ARE KEPT FOR THE TAB, in `held.ts`'s `TITLES`, because three readers of a ref by name have no map to be
 * handed: `where.ts` compiling `thing is Harbour Lane`, `declares` below, and the new-row form's picker. All three
 * read the sample's `ROWS`, so on a record they refused its own projects and offered the sample's (`no-sample-held.test.ts`).
 * The list is replaced whole, because every caller walks it to the end of its cursor; the one exception,
 * `decide/[id]/proposed.ts`, keeps what it had when a page is refused, and a name missing from a list cut short is a
 * ref drawn by its number until the next walk, never the sample's name.
 */
export function refMapOf(register: string, rows: readonly Pick<RecordRow, 'id' | 'seq' | 'fields'>[]): RefMap {
  const seqOf = new Map<string, number>();
  const idOf = new Map<number, string>();
  const titleOf = new Map<number, string>();
  const markOf = new Map<number, Identity>();
  const chipOf = new Map<number, string>();
  const chips = (REGISTERS[register]?.fields ?? []).some((f) => f.id === 'icon') && (REGISTERS[register]?.fields ?? []).some((f) => f.id === 'colour');
  const title = REGISTERS[register]?.title;
  /* WHICH OF THEM ARE FINISHED, by the list's own `state:` and `done:`, for the picker to leave out (`held.ts`): never
     for the state a new row starts in, so a cleared ledger entry stays and a void one goes (`leftOut`). */
  const state = REGISTERS[register]?.state;
  const done = leftOut(REGISTERS[register]);
  const over = new Set<number>();
  const money = (REGISTERS[register]?.fields ?? []).filter((f) => f.type === 'money').map((f) => f.id);
  const kept = new Map<number, Record<string, unknown>>();
  for (const r of rows) {
    if (r.seq === null) continue;
    seqOf.set(r.id, r.seq);
    idOf.set(r.seq, r.id);
    if (money.length > 0) kept.set(r.seq, Object.fromEntries(money.map((k) => [k, r.fields?.[k]])));
    const now = state === undefined ? undefined : r.fields?.[state];
    if (typeof now === 'string' && done.includes(now)) over.add(r.seq);
    const said = title === undefined ? undefined : r.fields?.[title];
    if (typeof said === 'string' && said !== '') titleOf.set(r.seq, said);
    const mark = identityOfRow(register, r.fields ?? {});
    if (mark) markOf.set(r.seq, mark);
    if (chips) {
      const words = [r.fields?.icon, r.fields?.colour].filter((w): w is string => typeof w === 'string' && w !== '').join(' ');
      if (words !== '') chipOf.set(r.seq, words);
    }
  }
  /* A ROW FOLDED INTO ANOTHER BY A MERGE IS THAT OTHER ROW wherever something still points at it (`names.ts`
     `survivorsOf`): the pointer reads as its number, so it is named, marked and opened as the row that stayed. Its own
     number keeps its own id, so a write naming it by number still names the row it means. */
  for (const [gone, kept] of survivorsOf(register, rows)) {
    const seq = seqOf.get(kept);
    const was = seqOf.get(gone);
    if (seq === undefined) continue;
    seqOf.set(gone, seq);
    if (was === undefined) continue;
    const name = titleOf.get(seq);
    if (name !== undefined) titleOf.set(was, name);
    const mark = markOf.get(seq);
    if (mark) markOf.set(was, mark);
  }
  TITLES.set(register, new Map([...idOf.keys()].map((seq) => [seq, titleOf.get(seq) ?? ''])));
  FINISHED.set(register, over);
  MONEY_HELD.set(register, kept);
  /* AND EACH PERSON'S PHOTO BY THEIR NAME, where the list keeps faces (`pictures.svelte.ts`): a face drawn by a name alone,
     who a question is from or who wrote a line, is drawn by it from now on. */
  learnFaces(register, rows);
  return { seqOf, idOf, titleOf, markOf, ...(chipOf.size > 0 ? { chipOf } : {}) };
}

/**
 * The titles behind a screen's refs, in the one shape `display` reads.
 *
 * ITS PRESENCE IS WHAT SAYS THE ROW CAME FROM A RECORD. A screen drawing the sample passes nothing
 * and `display` reads the sample's rows as it always did; a screen drawing a record passes this, and
 * it is then the only source of a ref's name. An empty map is a live answer too: it means the record
 * named none of them, not that the sample may be consulted.
 */
export function namesOf(refs: Refs): Names {
  const out = new Map<string, string>();
  const marks = new Map<string, Identity>();
  const ids = new Map<string, number>();
  const chips = new Map<string, string>();
  for (const [register, map] of refs) {
    for (const [seq, words] of map.chipOf ?? []) chips.set(`${register}#${seq}`, words);
    for (const [seq, title] of map.titleOf) out.set(`${register}#${seq}`, title);
    for (const [seq, mark] of map.markOf ?? []) marks.set(`${register}#${seq}`, mark);
    for (const [id, seq] of map.seqOf) ids.set(`${register} ${id}`, seq);
  }
  return withMarks(out, marks, ids, chips);
}

/* NOT ENUMERABLE, so a `Names` still compares and spreads as the map of titles it always was. */
const withMarks = (names: Map<string, string>, marks: ReadonlyMap<string, Identity>, ids?: ReadonlyMap<string, number>, chips?: ReadonlyMap<string, string>): Names => {
  if (chips && chips.size > 0) Object.defineProperty(names, 'chips', { value: chips, enumerable: false });
  Object.defineProperty(names, 'marks', { value: marks, enumerable: false });
  if (ids) Object.defineProperty(names, 'ids', { value: ids, enumerable: false });
  return names as Names;
};

/**
 * Two answers' names as one, the later winning: a list that loads a second page keeps the names the first one gave.
 * A `new Map` over both would keep the titles and drop the marks.
 */
export function joinNames(first: Names | null | undefined, next: Names): Names {
  const out = new Map([...(first ?? []), ...next]);
  const ids = first?.ids || next.ids ? new Map([...(first?.ids ?? []), ...(next.ids ?? [])]) : undefined;
  return withMarks(out, new Map([...(first?.marks ?? []), ...(next.marks ?? [])]), ids, new Map([...(first?.chips ?? []), ...(next.chips ?? [])]));
}

const norm = (v: string): string => v.toLowerCase().replace(/_/g, ' ').trim();

/** The words `where.ts` reads as a question about absence, and the operator each one is. */
const ABSENCE: Readonly<Record<string, 'empty' | 'present'>> = { empty: 'empty', set: 'present', present: 'present' };
const INVERSE = { empty: 'present', present: 'empty' } as const;

/**
 * The row of `register` a person named by its title, as the record named it when this tab last walked that list.
 *
 * IT READ THE SAMPLE'S ROWS, so `thing is Kiln` found the sample's project #1 and `valueOf` sent the record the ULID of
 * the record's own row #1, whatever that was called: a chip naming a project the record never held opened a real one.
 * `refs` is the walk this answer is being built from, and is read first; `TITLES` is every walk this tab has made.
 */
function titled(register: string, said: string, refs?: Refs): number | null {
  const same = (a: string, b: string): boolean => norm(a) === norm(b);
  for (const [seq, title] of refs?.get(register)?.titleOf ?? []) if (same(title, said)) return seq;
  return seqTitled(register, said, same);
}

/**
 * A value as the record stores it, from a value as the address carries it.
 *
 * AN ENUM IS ITS DECLARED SPELLING, because the address may carry the readable one (`owed to me`)
 * and the record holds `owed_to_me`. `declaredValue` is the same reconciliation the mock uses.
 *
 * A REF IS THE TARGET ROW'S ULID. A link says `thing:is:1`, because a link should not break when a
 * row is renamed, and a declared metric says `thing is Kiln`; the record stores neither. A value that
 * resolves to no row is passed through unchanged, so the record compares it and matches nothing,
 * which is what the mock answered for a row that does not exist.
 *
 * AND A LIST ASKS IN ITS ELEMENT TYPE, which is what `of` is for. `skills.because` is a `list<ref>`
 * into `learnings`: the sample holds the row numbers and the record holds the ULIDs, so
 * `because:has:4` asked the record for the text `4` and answered no rows, for ever, which is the
 * answer a filter gives when it is working. `remote.test.ts` asks the record itself for the two
 * skills the seed's own rows say cite learnings#4. The enum half of this is the same rule and the
 * seed declares no `list<enum>`, so nothing here measures it.
 */
function valueOf(register: string, field: string, said: string, refs: Refs): string {
  const f = REGISTERS[register]?.fields.find((x) => x.id === field);
  const type = f?.type === 'list' ? f.of : f?.type;
  if (type === 'enum') return declaredValue(register, field, said);
  if (type === 'ref' && f?.to) {
    const seq = /^\d+$/u.test(said) ? Number(said) : titled(f.to, said, refs);
    return (seq === null ? undefined : refs.get(f.to)?.idOf.get(seq)) ?? said;
  }
  return said;
}

/** Whether a field holds this word as one of its values, so it is a value and not a question. */
function declares(register: string, field: string, word: string): boolean {
  const f = REGISTERS[register]?.fields.find((x) => x.id === field);
  if (f?.type === 'enum') return (f.values ?? []).some((v) => norm(v) === word);
  if (f?.type === 'ref' && f.to) return titled(f.to, word) !== null;
  return false;
}

/** The six chip operators the sentence spells `more than`, `at least`, `less than`, `at most`, `between` and `contains`. */
const COMPARE = new Set(['gt', 'gte', 'lt', 'lte', 'between', 'contains']);

/**
 * A compare chip as the record's leaf, for the tree `treeOf` builds.
 *
 * THEY ALL FELL TO THE LAST LINE OF `leafOf` AND BECAME `is` once, and a money bound sent as the text
 * `GBP 2400` is refused `MONEY_LITERAL_NEEDS_CURRENCY`, since the record's tree takes
 * `{ amount, currency }`. So a number, a money or a quantity is read by the RECORD'S OWN PARSER,
 * `parseWhere`, over the one-clause sentence `whereOf` writes for the chip: the literal is the
 * record's, and no second reader of `GBP 2400.50` lives here.
 *
 * A DAY KEEPS ITS WORD (`today`, `+30d`), as `before` and `after` in `leafOf` do, because the record
 * resolves a word in a tree against its own clock, and a view saved with the word keeps meaning
 * today tomorrow. `due:between:today,+30d` goes over as its two ends under `all`, which is how the
 * record spells a range of days. A `contains` is its needle, which needs no reading at all.
 *
 * A CHIP THE PARSER REFUSES GOES OVER AS IT WAS TYPED, so the record refuses it in its own words
 * rather than this file quietly dropping the clause and opening a wider list than the chip says.
 */
function comparedLeaf(register: string, f: Filter): Tree {
  const typed: Tree = { field: f.field, [f.op]: f.op === 'between' ? f.values : (f.values[0] ?? '') };
  if (f.op === 'contains') return typed;
  const declared = REGISTERS[register]?.fields.find((x) => x.id === f.field)?.type;
  const type = declared ?? (Object.hasOwn(KERNEL_FIELDS, f.field) ? KERNEL_FIELDS[f.field] : undefined);
  if (type === 'day' || type === 'instant') {
    const [low, high] = f.values;
    if (f.op !== 'between') return typed;
    return low !== undefined && high !== undefined ? { all: [{ field: f.field, gte: low }, { field: f.field, lte: high }] } : typed;
  }
  /* THE CLOCK DECIDES NOTHING HERE: every dated field has gone over above as its word, so no day reaches the parser,
     and `nowMs` is only the argument `parseWhere` requires. */
  const read = parseWhere(whereOf([f]), schemaOf(register), { nowMs: Date.now() });
  return read.bad.length === 0 && read.predicate !== undefined ? (read.predicate as Tree) : typed;
}

/**
 * One chip, as one leaf.
 *
 * THE OPERATORS ARE `whereOf`'S, read the same way. `in` of one value is `is`, `not-in` of one is
 * `not`, `before` and `after` take their first value, and the six compare words go through
 * `comparedLeaf` above. Anything else is `is` with its first value, which is how `whereOf` reads an
 * operator it does not name.
 *
 * `not-on` IS `not` OF ITS FIRST VALUE, AND IT USED TO FALL TO THAT LAST LINE AND BECOME `is`.
 * `registerHref` mints it for `due is not today`, and `whereOf` reads it back as `is not`, so the
 * sample was right and a record drew the complement: measured on the seed, the sentence and the
 * sample drew all 40 obligations and the chip on a record drew none, because nothing is due today.
 *
 * A LONE WORD THE FIELD DOES NOT HOLD MAY BE THE QUESTION ABOUT ABSENCE: `is empty`, `is set`, and
 * their negations, in the order the record's parser checks them, declared values first.
 *
 * `has` AND `lacks` KEEP THEIR OWN WORDS, AND THEY USED TO FALL TO THE LAST LINE AND BECOME `is`.
 * Both engines refuse that by name, "repos is a list, which cannot be asked is", so the one chip
 * shape a list field can be asked in was the one shape that reached the sample and not the record:
 * measured over every element of every list in the seed, thirty questions where the sample answered
 * rows and the record answered a refusal. They are read here beside `before` and `after` rather than
 * below the question about absence, because their value is an element and not a word about the
 * field: `repos has empty` asks for an element spelled `empty`, which is what the sample's own
 * sentence asks for too.
 */
function leafOf(register: string, f: Filter, refs: Refs): Tree {
  const one = f.values[0] ?? '';
  if (COMPARE.has(f.op)) return comparedLeaf(register, f);
  if (f.op === 'before' || f.op === 'after') return { field: f.field, [f.op]: one };
  if (f.op === 'has' || f.op === 'lacks') return { field: f.field, [f.op]: valueOf(register, f.field, one, refs) };

  const negated = f.op === 'not-in' || f.op === 'not-on';
  const single = f.op !== 'in' && f.op !== 'not-in' ? true : f.values.length === 1;
  const absence = single ? ABSENCE[norm(one)] : undefined;
  if (absence && !declares(register, f.field, norm(one)))
    return { field: f.field, [negated ? INVERSE[absence] : absence]: true };

  const values = f.values.map((v) => valueOf(register, f.field, v, refs));
  const first = values[0] ?? '';
  if (f.op === 'not-on') return { field: f.field, not: first };
  if (f.op === 'in') return values.length === 1 ? { field: f.field, is: first } : { field: f.field, in: values };
  if (negated) return values.length === 1 ? { field: f.field, not: first } : { field: f.field, not_in: values };
  return { field: f.field, is: first };
}

/**
 * The entries a list is narrowed to by their numbers (`rowsFilter` in `api.ts`), as one leaf.
 *
 * NUMBERS AND NOT THE WORDS A CHIP CARRIES, since the number is a whole number in the record and a leaf is not parsed.
 * One number is still `in`, so the shape is one shape.
 *
 * NO NUMBERS IS NOBODY, AND AN EMPTY `in` IS A REFUSAL (`VALUE_MALFORMED`), so nobody is asked for as a number below
 * one, which no entry has: the list comes back empty and counted, rather than refused or, worse, whole.
 */
function numbersLeaf(f: Filter): Tree {
  const seqs = f.values.map(Number).filter((n) => Number.isInteger(n) && n > 0);
  return seqs.length === 0 ? { field: f.field, lt: 1 } : { field: f.field, in: seqs };
}

/**
 * The chips and the search box as one `where` tree, or `undefined` when nothing narrows the list.
 *
 * THE BOX IS A SUBSTRING TEST, AND THE MOCK'S IS A WORD PREFIX. Each word must appear in one of the
 * register's `search:` fields, as `contains`, which keeps the record's paging and its exact count.
 * A word found inside another word therefore matches here and did not in the mock, and
 * `remote.test.ts` pins the case. The words are `terms(q)`, the same folding the mock and the
 * record's full-text index use, so punctuation separates words on both sides.
 *
 * `join` IS THE ADDRESS WORD `join=any` (`joinOf` in `api.ts`), AND UNDER IT THE CHIPS ARE ONE
 * `any` GROUP. It was not read here, so an or-group's chips reached the record ANDed: measured on the
 * seed, `state is open, or due before today` admits other tasks than the two chips ANDed, and the
 * record drew the AND. The search box's words stay outside the group and ANDed with it, which is
 * what `applyFilters` does on the sample: it filters the chips' answer by the box afterwards.
 *
 * A TREE, AND NOT THE SENTENCE `sentenceOf` WRITES, FOR TWO KINDS OF READER. The box asks for each
 * word in ANY of several fields beside chips that are ANDed, and a sentence joins its conditions one
 * way or the other, never both. And a saved view (`views-live.ts`) or a bulk write (`rows-write.ts`)
 * joins this `where` with another under `all`, which a sentence cannot sit inside.
 */
export function treeOf(register: string, filters: readonly Filter[], q: string, refs: Refs, join?: 'any'): Tree | undefined {
  const chips: Tree[] = filters.filter((f) => !isRows(f)).map((f) => leafOf(register, f, refs));
  const nodes: Tree[] = join === 'any' && chips.length > 1 ? [{ any: chips }] : chips;
  /* THE ENTRIES NAMED BY NUMBER STAND OUTSIDE THE "or", as the search box's words do: they say which entries the list
     is of, and the chips narrow inside them however the chips are joined. */
  for (const f of filters) if (isRows(f)) nodes.unshift(numbersLeaf(f));
  const words = terms(q);
  if (words) {
    const fields = searchable(register);
    for (const word of words) nodes.push({ any: fields.map((f) => ({ field: f.id, contains: word })) });
  }
  if (nodes.length === 0) return undefined;
  return nodes.length === 1 ? nodes[0] : { all: nodes };
}

/**
 * The words the record reads without parsing, from the words an address carries: a ref as the target row's ULID.
 *
 * A REF IS THE ONE VALUE THE RECORD'S SENTENCE CANNOT READ AS A CHIP WRITES IT. A chip carries the row's number
 * (`thing:in:1`), because a link should not break when a row is renamed, and the record's parser reads a row id, a
 * spoken id and a name, never a bare number. So the number, or the name, becomes the ULID the walk behind this answer
 * found for it (`valueOf`), which the record reads first and exactly. Every other value goes as the chip spells it,
 * because the record reads a label, a declared value and a relative day itself.
 *
 * ONE VALUE IS QUOTED WHERE ITS BARE WORDS WOULD NOT READ BACK AS IT (`quoteValue`, the record's own rule): a text
 * holding a comma, an `or` or a leading `not` is one value to the record rather than two clauses or a negation. A lone
 * `empty`, `set` or `present` stays bare, so the record asks the field whether it declares the word before reading the
 * question about absence, in that order, as it does for a person typing it. Several values of one chip are joined by
 * `or` and cannot be quoted one by one, so they go bare, as `whereOf` writes them.
 */
function spokenFor(register: string, f: Filter, refs: Refs): Filter {
  const held = f.values.map((v) => valueOf(register, f.field, v, refs));
  const one = held.length === 1 ? held[0] : undefined;
  const quotes = f.op === 'in' || f.op === 'not-in' || f.op === 'is' || f.op === 'has' || f.op === 'lacks' || f.op === 'contains';
  if (one === undefined || !quotes || (f.op !== 'contains' && Object.hasOwn(ABSENCE, norm(one)))) return { ...f, values: held };
  return { ...f, values: [quoteValue(one)] };
}

/**
 * The chips as the sentence the record parses, or `undefined` when there is none.
 *
 * THE SENTENCE `whereOf` ALREADY WRITES, which is the one a link, a tile and a saved address already mean. The record
 * reads it with its own parser, so a chip means on this screen exactly what the same words mean in a page's `where:`,
 * a rule's `when:` and an agent's `list`; this file no longer turns a compare chip into a tree through a second reading
 * of the grammar. `join` is `join=any`, written as `, or` between the chips.
 */
export function sentenceOf(register: string, filters: readonly Filter[], refs: Refs, join?: 'any'): string | undefined {
  if (filters.length === 0) return undefined;
  return whereOf(filters.map((f) => spokenFor(register, f, refs)), join);
}

/**
 * The `where` the register list asks with: the chips' sentence, or the tree when the search box holds words.
 *
 * TWO SHAPES, BECAUSE THE RECORD TAKES ONE `where` AND THE BOX CANNOT BE SAID IN A SENTENCE: each of its words is looked
 * for in any of the list's searchable fields, beside chips that are ANDed (`treeOf` has the rest). With nothing in the
 * box, which is every link, tile and saved address, the chips go as words and the record parses them.
 */
export function whereFor(register: string, filters: readonly Filter[], q: string, refs: Refs, join?: 'any'): string | Tree | undefined {
  /* AND THE TREE WHEN THE LIST IS NARROWED TO ENTRIES BY NUMBER (the people held twice, `rowsFilter`): a sentence has no
     word for them, and they are ANDed with chips that may be joined by "or". */
  return terms(q) || filters.some(isRows) ? treeOf(register, filters, q, refs, join) : sentenceOf(register, filters, refs, join);
}

/** A call's answer as far as this file reads one: a value, or the record's refusal. */
type Called = { ok: true; value: unknown } | { ok: false; refusal?: { code: string; fix: string } };

/**
 * Who may be on the record twice, as the filter the list is asked with: the record's `heldTwice`, asked once.
 *
 * `call` IS THE CLIENT'S OWN, handed in so this is driven without a record. The answer is the numbers of the people the
 * `held-twice` figure counts; `null` is a record with no list of people, read as nobody.
 *
 * A REFUSAL IS HANDED BACK AS ONE AND NEVER AS EVERYONE. A list that drew every person under a line saying these are
 * the ones held twice would be wrong in the one way nobody could see.
 */
export async function rowsHeldTwice(
  call: (name: string, args: Record<string, unknown>) => Promise<Called>,
  register: string,
): Promise<{ ok: true; value: Filter } | { ok: false; refusal: { code: string; fix: string } }> {
  const out = await call('heldTwice', { register });
  if (!out.ok) return { ok: false, refusal: out.refusal ?? { code: 'UNREACHABLE', fix: 'Could not ask who is held twice. Try again.' } };
  const seqs = (out.value as { seqs?: unknown } | null)?.seqs;
  return { ok: true, value: rowsFilter(Array.isArray(seqs) ? seqs.filter((n): n is number => typeof n === 'number') : []) };
}

/**
 * One row, as the helpers on this screen read one.
 *
 * A REF BECOMES THE NUMBER A PERSON SAYS, because every helper that draws one (`display`,
 * `identityOf`, the sort) looks its target up by sequence. A ref whose target is not in the map
 * stays the ULID it arrived as, and draws as that id rather than as a wrong name.
 *
 * AND THE HALF OF THAT RULE ABOUT A LIST WAS NEVER APPLIED, for the reason `refTargetOf` above has the
 * measurement for: this read `f.type === 'ref'` alone, so a `list<ref>` element stayed the ULID the
 * column holds. `display` sends an array straight to `listLine`, which joins the elements with a comma
 * and never consults `names`, so four skills on the seeded record drew a cell of 26-character
 * identifiers where the sample drew two row numbers. It is the same defect as the filter's, seen from
 * the cell rather than from the bar: the chip a person gets is minted out of the element the cell holds.
 *
 * AN ELEMENT WHOSE TARGET IS NOT IN THE MAP KEEPS ITS ULID, one element at a time rather than the whole
 * list, which is the single-ref rule applied per element: a row pointing at one row the walk did not
 * reach still says the rest by number.
 *
 * `by` IS EMPTY BECAUSE `list` DOES NOT SAY. The row's history does, and nothing on the list reads it.
 *
 * A ROW A PAGE ANSWERED CUT SHORT SAYS SO HERE TOO, AND IT WAS DROPPED. The kernel cuts each text past 280 characters in
 * a page's rows and marks the row `clipped` (`leanRows`), and this copied the fields and nothing beside them, so the
 * docked panel opened a project's note on its first 280 characters and Save wrote those, plus the edit, over the whole
 * note. The mark rides on the entry, and every write worked out from a page's row reads it (`lib/page/clipped.ts`).
 *
 * AND SO DOES THE ROW'S ID, a handle never drawn: a byline's Undo tells this row's steps in the record's plan by it where
 * a step names no list and number (`lib/page/byline-undo.ts`), never by a title two rows can share.
 */
export function entryOf(register: string, row: RecordRow, refs: Refs): Entry {
  const decl = REGISTERS[register];
  const fields: Fields = {};
  for (const [key, value] of Object.entries(row.fields)) {
    const f = decl?.fields.find((x) => x.id === key);
    const to = f === undefined ? undefined : refTargetOf(f);
    const map = to === undefined ? undefined : refs.get(to);
    if (map && Array.isArray(value)) fields[key] = value.map((v) => (typeof v === 'string' ? (map.seqOf.get(v) ?? v) : v)) as Fields[string];
    else fields[key] = ((map && typeof value === 'string' ? map.seqOf.get(value) : undefined) ?? value) as Fields[string];
  }
  /* THE ROW'S STATE, WHERE ITS FIELDS LEFT IT OUT: the record answers it beside the fields too (`state`), and a read
     that asked for some fields only, or a copy kept from one, had no state to count, so the list said "16 open" over
     sixteen live rows (1 Nov). */
  const state = decl?.state;
  if (state && !(state in fields) && typeof row.state === 'string' && row.state !== '') fields[state] = row.state;
  const id = typeof row.id === 'string' && row.id !== '' ? { id: row.id } : {};
  return { ...id, seq: row.seq ?? 0, fields, version: row.version, created: row.created_at, by: '', ...(row.clipped === true ? { clipped: true as const } : {}), ...(row.private === true ? { private: true as const } : {}), ...(row.mine === true ? { mine: true as const } : {}) };
}

/** The sort in the address, as the record's `order`. */
export const orderOf = (
  sort: { field: string; dir: 'asc' | 'desc' } | undefined,
): { field: string; dir: 'asc' | 'desc' }[] | undefined => (sort ? [{ field: sort.field, dir: sort.dir }] : undefined);

/**
 * A register as the record declares it, with the two words and the card a screen draws always there.
 *
 * THE RECORD DOES NOT REQUIRE THEM. `one` and `mobile` are optional in a declaration, and a pack or a list somebody
 * made may leave both out; the list screen read `decl.one` straight into a sentence and threw, so a list the built-in
 * sample does not know never drew past its loading bars. The noun falls back to the name made singular, and the card to
 * the title and the next fields declared.
 */
export function declOf(raw: RegisterDecl): RegisterDecl {
  const name = typeof raw.name === 'string' && raw.name !== '' ? raw.name : raw.id;
  const one = typeof raw.one === 'string' && raw.one !== '' ? raw.one : name.toLowerCase().replace(/ies$/, 'y').replace(/([^s])s$/, '$1');
  const fields = Array.isArray(raw.fields) ? raw.fields : [];
  const others = fields.map((f) => f.id).filter((id) => id !== raw.title && id !== raw.state);
  const picked = [raw.title, raw.state ?? others[0], raw.state ? others[0] : others[1]].map((id) => id ?? raw.title) as [string, string, string];
  const mobile = Array.isArray(raw.mobile) && raw.mobile.length >= 3 ? (raw.mobile.slice(0, 3) as [string, string, string]) : picked;
  return { ...raw, name, one, fields, mobile };
}

/** The one call `learn` needs: the record's `schema`, answered the way the client answers it. */
export type SchemaCall = (register: string) => Promise<{ ok: boolean; value?: unknown }>;

/**
 * A list's declaration, as the record declares it now, kept where every helper reads one.
 *
 * A USE CASE'S OWN LISTS ARE DECLARED BY THE RECORD AND BY NO FILE HERE, so every helper that reads `REGISTERS` (a
 * group's name and icon, a column's label, a ref's target, a row's title) knew only the sample's lists. Search named a
 * course by its id and a row's page dropped what pointed at it from one. `page-live.ts` asks through here too.
 *
 * AND A LIST THE BUILD SHIPS IS ASKED ABOUT AS WELL, AND REPLACED BY THE ANSWER. This returned early for any list in the
 * bundle, on the reading that the seed's copy and the record's were pinned equal. They are equal only until somebody
 * adds a field, which is the ordinary case: an owner added `launched` to Projects on a real kernel, and
 * the row page, `RowForm` (both draw `readableFields`) and a page block over Projects went on drawing the bundle's
 * fifteen fields, the new one on no screen and `display` formatting its day as raw text (`field-write.test.ts`, three
 * red before this). The bundle is now what a tab draws before the record has answered, and what it keeps when there is
 * no record or the record will not say.
 *
 * RELABELLED AS IT IS KEPT, because the bundle's copies are relabelled in place at boot (`voice.ts` `relabelAll`) and the
 * record's answer carries the declaration's own words: kept bare, a team whose Projects are Clients read Projects again
 * on every screen after the first read. It goes in through `relabelInto`, which keeps the bare answer as the list's own
 * words, so the next boot relabels the learnt list and not the bundle's (`data/field-added.test.ts`).
 *
 * THE LAST ONE ASKED WINS, whenever the answers land. An add asks again with a fresh `asked` while a reader's older
 * question may still be out, and that older answer landing second put the list back as it was before the add.
 *
 * `asked` IS THE READER'S, so a list is asked once per tab rather than on every read. That costs one `schema` per list a
 * reader touches, where a bundled list used to cost none; a reader that has already asked answers from what it kept.
 */
const newest = new Map<string, number>();
/* THE NEWEST QUESTION'S OWN WAIT, by list (pages pass, 2 Nov): a reader whose older question lost to a newer one waits on
   the newer, so it never reads the list before any answer is kept. It returned as soon as its own answer was dropped,
   and the first read of Skills walked no list and named every project "A project". */
const newestHeld = new Map<string, Promise<void>>();
let questions = 0;
export function learn(schema: SchemaCall, register: string, asked: Map<string, Promise<void>>): Promise<void> {
  let held = asked.get(register);
  /* A LIST THE READER HOLDS NOTHING ON IS NOT ASKED ABOUT (`lists-held.ts`, collab pass 4): its declaration is refused
     them, and nothing of it is drawn. Not kept in `asked`, so a reader whose access is raised asks it on the next read.
     Asked at once where `boot` has said, as before, so the lists a screen learns in one turn still go as one read; where
     it is still out, once it lands. */
  if (!held && listsSettled() && !holdsList(register)) return Promise.resolve();
  if (!held) {
    const mine = ++questions;
    newest.set(register, mine);
    const ask = (): Promise<void> =>
      schema(register).then(
        (out) => {
          if (newest.get(register) !== mine) return newestHeld.get(register);
          const body = out.ok ? (out.value as { fields?: unknown } | null) : null;
          if (body && Array.isArray(body.fields)) relabelInto(REGISTERS, register, declOf({ ...(body as RegisterDecl), id: register }), labels());
        },
        () => undefined,
      );
    held = listsSettled() ? ask() : heldNow().then(() => (holdsList(register) ? ask() : undefined));
    asked.set(register, held);
    newestHeld.set(register, held);
  }
  return held;
}

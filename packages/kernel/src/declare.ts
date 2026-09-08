/**
 * Installing a declaration, which is how a record learns what it holds.
 *
 * A DECLARATION ROW IS NEVER EDITED. A new version is a NEW ROW, and the previous one is stamped
 * `superseded_at` in the same transaction. That is not bookkeeping: a `.dog` export replays the
 * declarations to rebuild the schema, and a row that was edited in place cannot say what the record
 * looked like when a two-year-old event was written. The history of the shape is as load-bearing as
 * the history of the rows.
 *
 * THE CHECKSUM IS OVER CANONICAL BYTES. Two declarations that differ only in key order are the same
 * declaration, and reinstalling one must not make a version — otherwise every deploy bumps every
 * register and the version number stops meaning anything.
 *
 * THE INDEXES ARE PART OF THE INSTALL. A field declared `index:` or `unique:` gets a partial index
 * over the same `json_extract` path the predicate compiles to — the same string, from the same
 * function, because if they differ the index is simply never used and the only symptom is that the
 * record got slow.
 */

import type { Refusal, Result, Sql } from '@braindog/ports';
import { no, ok } from '@braindog/ports';
import { jsonPath } from '@braindog/where';

import { FIELD_TYPES, type Json } from './coerce.ts';
import { instant } from './migrate.ts';
import { checkInterval, type PullDecl } from './pull.ts';
import { spanMs } from './vault.ts';

/**
 * `34-GRAMMARS` §4. Checked before an id is inlined into an index name or a JSON path.
 *
 * A DOUBLE UNDERSCORE IS NOT AN IDENTIFIER, and the reason is one line below: `__` is the separator
 * in an index name (`entry_i_<register>__<field>`), so a register called `a__b` makes
 * `entry_i_a__b__code` mean two different things — and the code that decides which of a register's
 * indexes to drop then drops somebody else's. A name that cannot be parsed back is a name that will
 * be parsed back wrongly.
 */
const IDENT = /^(?!.*__)[a-z][a-z0-9_]{0,31}$/;

export const KINDS = ['register', 'page', 'block', 'ingest', 'rule', 'metric', 'theme', 'digest'] as const;
export type DeclKind = (typeof KINDS)[number];

export type Declaration = {
  /** `register.obligations` — the kind and the id, which is the form a person says. */
  id: string;
  kind: DeclKind;
  body: Record<string, Json>;
  pack?: string | undefined;
};

/**
 * RFC 8785 canonical JSON, which is the whole of what a checksum needs.
 *
 * Keys sorted, no whitespace, and `JSON.stringify`'s own number and string escaping — which is
 * already RFC 8785's for every value this record can hold, because a field is coerced before it is
 * stored and the coercers do not produce a number JSON cannot round-trip.
 */
export function jcs(value: Json): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(jcs).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${jcs(value[k] as Json)}`).join(',')}}`;
}

const HEX = Array.from({ length: 256 }, (_, n) => n.toString(16).padStart(2, '0'));

export async function digest(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  let out = '';
  for (const byte of new Uint8Array(bytes)) out += HEX[byte];
  return out;
}

/** The index names of `34-GRAMMARS` §4: `__` separates the register from the field. */
export const indexName = (kind: 'i' | 'u' | 'k', register: string, field?: string, part?: string): string =>
  `entry_${kind}_${register}__${field ?? ''}${part ? `__${part}` : ''}`;

/** A money value is an object, so it takes TWO indexes: one per half. Likewise a quantity. */
const PARTS: Record<string, string[]> = { money: ['amount', 'currency'], quantity: ['value', 'unit'] };

type FieldLike = {
  id: string;
  type: string;
  of?: string;
  values?: unknown;
  index?: boolean;
  unique?: boolean;
  retired?: boolean;
};

/** `02 §5`'s caps table, and the sentence each one is there to make true. */
const FIELD_CEILING = 64;
const INDEX_CEILING = 8;

/** What the full-text index can take. `02 §1`, and `SEARCH_FIELD_TYPE` is the code for the rest. */
const SEARCHABLE = ['text', 'document', 'enum', 'url', 'email'] as const;

/**
 * The word another tool would have used for one of ours.
 *
 * `04 §5`'s worked example is *"`type 'currency'` — did you mean 'money'?"*, and `currency` is not
 * a near-miss for `money` by any string measure — a character-overlap heuristic answered `document`.
 * The resemblance is not lexical. It is that somebody arriving from a spreadsheet, an ORM or another
 * record tool brings THAT tool's vocabulary, and every name here is one of those: `string`,
 * `boolean`, `datetime`, `select`, `relation`, `attachment`. Guessing well means knowing what they
 * came from, not how many letters two words share.
 *
 * `10 §7` is the reason it is worth the table: the refusal teaches. A message that only says *not a
 * type* sends somebody to read a document; this one lets them fix the line they are looking at.
 */
const SPOKEN_AS: Record<string, string> = {
  currency: 'money', amount: 'money', price: 'money', cost: 'money',
  string: 'text', varchar: 'text', char: 'text', str: 'text', uuid: 'text',
  markdown: 'document', md: 'document', richtext: 'document', longtext: 'document', prose: 'document',
  integer: 'int', number: 'int', num: 'int', bigint: 'int', serial: 'int',
  float: 'decimal', double: 'decimal', numeric: 'decimal', real: 'decimal',
  date: 'day', dateonly: 'day',
  datetime: 'instant', timestamp: 'instant', time: 'instant', ts: 'instant',
  boolean: 'bool', checkbox: 'bool', toggle: 'bool',
  select: 'enum', choice: 'enum', option: 'enum', dropdown: 'enum', status: 'enum',
  relation: 'ref', link: 'url', foreign: 'ref', fk: 'ref', lookup: 'ref',
  attachment: 'file', image: 'file', photo: 'file', upload: 'file', blob: 'file',
  password: 'secret', token: 'secret', apikey: 'secret', credential: 'secret',
  object: 'json', map: 'json', dict: 'json',
  array: 'list', multi: 'list', tags: 'list',
  measure: 'quantity', unit: 'quantity', weight: 'quantity',
  interval: 'duration', elapsed: 'duration', seconds: 'duration',
  mail: 'email', 'e-mail': 'email', uri: 'url', href: 'url',
};

/** How many single-character edits apart two words are. Levenshtein, iterative, two rows. */
function distance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++)
      row[j] = Math.min(
        (previous[j] ?? 0) + 1,
        (row[j - 1] ?? 0) + 1,
        (previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    previous = row;
  }
  return previous[b.length] ?? 0;
}

/**
 * The nearest type to something that is not one, or `null` when nothing is near.
 *
 * The table first, because a name from another tool is a deliberate word and not a slip. Then edit
 * distance, for the slips: `mony`, `tex`, `instnt`. A third of the word is the ceiling — past that
 * the guess is noise, and a wrong suggestion is worse than none because it is followed.
 */
function nearest(said: string): string | null {
  const want = said.toLowerCase().replace(/[\s_]+/gu, '');
  const spoken = SPOKEN_AS[want];
  if (spoken !== undefined) return spoken;

  let best: string | null = null;
  let score = Number.POSITIVE_INFINITY;
  for (const type of FIELD_TYPES) {
    const n = distance(want, type);
    if (n < score) {
      score = n;
      best = type;
    }
  }
  return score <= Math.max(1, Math.floor(want.length / 3)) ? best : null;
}

/**
 * The `CREATE INDEX` statements a register declaration implies.
 *
 * Partial, on `deleted_at IS NULL`, because every read the product makes is of live rows and an
 * index over the deleted ones is pages nobody touches. The path comes from `jsonPath`, the same
 * function the compiler uses — if the two ever differ the index is never used, and the symptom is
 * that the record got slow, a year later, with nothing pointing at the cause.
 */
export function indexesFor(register: string, fields: readonly FieldLike[]): string[] {
  const out: string[] = [];
  for (const f of fields) {
    if (f.retired || (!f.index && !f.unique)) continue;
    const parts = PARTS[f.type] ?? [''];
    for (const part of parts) {
      const path = `${jsonPath(f.id)}${part ? `.${part}` : ''}`;
      const name = indexName(f.unique ? 'u' : 'i', register, f.id, part || undefined);
      const unique = f.unique && !part ? 'UNIQUE ' : '';
      out.push(
        `CREATE ${unique}INDEX IF NOT EXISTS ${name} ON entry (json_extract(fields, '${path}')) WHERE register = '${register}' AND deleted_at IS NULL`,
      );
    }
  }
  return out;
}

const bad = (code: string, fix: string, at?: string, allowed?: readonly string[]): Refusal => ({
  code,
  fix,
  ...(at === undefined ? {} : { at }),
  ...(allowed === undefined ? {} : { allowed }),
});

/**
 * What a declaration calls itself.
 *
 * A REGISTER SAYS `id`, A PAGE SAYS `page`, A METRIC SAYS `metric`, and all three are the same
 * field wearing the word a person would use in that document. Requiring `id` everywhere would mean
 * a page carrying its own name twice, and the copy that drifted would be the one nobody reads.
 */
export const ownId = (decl: Declaration): string =>
  String((decl.body.id as string | undefined) ?? (decl.body[decl.kind] as string | undefined) ?? '');

/** The five `09 §6` admits. Closed, and now actually used as one rather than exported and ignored. */
const CHANNELS = ['in-app', 'email', 'push', 'webhook', 'mcp'] as const;

/** At most twelve. A digest longer than that is a report, and nobody reads a report every Monday. */
const SECTION_CEILING = 12;

/**
 * A digest declaration, checked against `09 §6`.
 *
 * EVERY REFUSAL HERE IS ABOUT SOMETHING THAT WOULD OTHERWISE BE SILENT. A channel nobody delivers, a
 * webhook with nowhere to post, a `prose` value no host answers to — none of them throws, and each
 * one produces a digest that reports success and sends less than it says.
 */
function digestBody(decl: Declaration): Refusal | null {
  const body = decl.body as { channels?: unknown; sections?: unknown; prose?: unknown; webhook?: unknown };

  const channels = body.channels;
  if (!Array.isArray(channels) || channels.length === 0)
    return bad('DECLARATION_INVALID', `${decl.id} names no channel, so nothing it assembles would go anywhere.`, 'channels');
  if (channels.length > CHANNELS.length)
    return bad('DECLARATION_INVALID', `A digest has one to ${CHANNELS.length} channels, and ${decl.id} names ${channels.length}.`, 'channels');
  for (const c of channels)
    if (!(CHANNELS as readonly unknown[]).includes(c))
      return bad('DECLARATION_INVALID', `${String(c)} is not a channel.`, 'channels', CHANNELS as unknown as string[]);

  /* A URL A DIGEST POSTS TO IS EGRESS, AND EGRESS IS DECLARED OR IT DOES NOT HAPPEN (04 §7). The
     channel without the address installed cleanly and then posted nowhere, for ever. */
  if (channels.includes('webhook')) {
    const hook = body.webhook as { url?: unknown } | undefined;
    if (typeof hook?.url !== 'string' || !hook.url.startsWith('https://'))
      return bad(
        'DECLARATION_INVALID',
        `${decl.id} posts to a webhook and names no https address to post to. A URL a digest posts to is egress, and egress is declared.`,
        'webhook',
      );
  }

  if (body.sections !== undefined && (!Array.isArray(body.sections) || body.sections.length > SECTION_CEILING))
    return bad('DECLARATION_INVALID', `A digest carries at most ${SECTION_CEILING} sections.`, 'sections');

  /* `prose` IS ONLY EVER `spark` (42 §4.11). Anything else is a host nobody has, and the digest
     would wait behind a model that was never going to answer. */
  if (body.prose !== undefined && body.prose !== 'spark')
    return bad('DECLARATION_INVALID', `A digest's prose is written by spark or by nobody.`, 'prose', ['spark']);

  return null;
}

/** `08 §2`'s table, closed. A `format` outside these is a figure nothing knows how to draw. */
const FORMATS = ['int', 'decimal', 'pct', 'days', 'duration'] as const;

/** `08 §2`: `previous` · `year_ago` · `none`, and the default is `previous`. */
const COMPARE = ['previous', 'year_ago', 'none'] as const;

/** `08 §2.1`, and only ever beside a date `group_by`. */
const BUCKETS = ['day', 'week', 'month', 'quarter', 'year'] as const;

/**
 * A metric declaration, checked against `08 §2`.
 *
 * NOTHING CHECKED ONE. `validate` deep-checked a register, a digest, a connector and a rule, and
 * returned `null` for a metric — so every key in `08 §2`'s table was advisory. A metric with no
 * `target` installed and drew a number nobody could act on; a `format` of `money` with no currency
 * reached the renderer as an unresolved figure; `compare: 'last'` fell through the evaluator's
 * if-chain and silently compared against nothing.
 *
 * `08 §2` MARKS `target` AND `window` REQUIRED IN BOLD, and `04 §5` gives the reason as the
 * refusal's own sentence: *"a number with no target is decoration; a number with no comparison
 * window cannot be acted on."* That is the whole argument for this product having metrics rather
 * than counters, and it was enforced nowhere.
 */
function metricBody(decl: Declaration): Refusal | null {
  const body = decl.body as {
    source?: unknown;
    value?: unknown;
    format?: unknown;
    target?: unknown;
    window?: unknown;
    compare?: unknown;
    group_by?: unknown;
    bucket?: unknown;
  };
  const id = decl.id;

  /* `register.<id>` OR `series.<id>` (`08 §2`, `25 §8`). A bare register name is the commonest
     mistake and the evaluator reads it as neither. */
  if (typeof body.source !== 'string' || !/^(?:register|series)\.[a-z][a-z0-9_-]*$/u.test(body.source))
    return bad(
      'DECLARATION_INVALID',
      `${id} reads ${JSON.stringify(body.source ?? null)}; a metric's source is register.<id> or series.<id>.`,
      'source',
    );

  if (body.value === null || typeof body.value !== 'object')
    return bad('DECLARATION_INVALID', `${id} has no value, so there is nothing to compute.`, 'value');

  /* `money.<CUR>` CARRIES ITS CURRENCY. `02 §3` is why: a money figure without one is a bare
     number, and a bare number loses the one fact that makes a total mean anything. */
  const format = body.format;
  const money = typeof format === 'string' && /^money\.[A-Z]{3}$/u.test(format);
  if (!money && !(FORMATS as readonly unknown[]).includes(format))
    return bad(
      'DECLARATION_INVALID',
      `${id}'s format is ${JSON.stringify(format ?? null)}. A metric is money.<CUR>, ${FORMATS.join(', ')}.`,
      'format',
      [...FORMATS, 'money.<CUR>'],
    );

  /* `04 §5`'s own sentence, and `08 §2` marks both required in bold. */
  if (body.target === undefined || body.window === undefined)
    return bad(
      'METRIC_NEEDS_TARGET_OR_WINDOW',
      `${id}: a number with no target is decoration; a number with no comparison window cannot be acted on.`,
      body.target === undefined ? 'target' : 'window',
    );

  if (body.compare !== undefined && !(COMPARE as readonly unknown[]).includes(body.compare))
    return bad('DECLARATION_INVALID', `${String(body.compare)} is not a comparison.`, 'compare', COMPARE as unknown as string[]);

  /* ONE FIELD. `04 §5`: *"group_by takes one field. Two dimensions is a report generator"* — and
     `08 §2.1` is explicit that the second dimension is the line this product does not cross. */
  if (Array.isArray(body.group_by) && body.group_by.length > 1)
    return bad('GROUP_BY_TWICE', `${id}: group_by takes one field. Two dimensions is a report generator.`, 'group_by');
  if (body.group_by !== undefined && !Array.isArray(body.group_by) && typeof body.group_by !== 'string')
    return bad('DECLARATION_INVALID', `${id}'s group_by is a field name.`, 'group_by');

  /* A BUCKET WITHOUT A `group_by` BUCKETS NOTHING. `08 §2.1`: *"only with a date `group_by`"* —
     and the evaluator, handed one alone, returns the ungrouped figure with a bucket key nobody
     reads, which is a chart that draws one bar and looks like data. */
  if (body.bucket !== undefined) {
    if (!(BUCKETS as readonly unknown[]).includes(body.bucket))
      return bad('DECLARATION_INVALID', `${String(body.bucket)} is not a bucket.`, 'bucket', BUCKETS as unknown as string[]);
    if (body.group_by === undefined)
      return bad('DECLARATION_INVALID', `${id} buckets by ${String(body.bucket)} and groups by nothing.`, 'bucket');
  }

  return null;
}

/**
 * The sixteen drawn kinds, WRITTEN OUT here rather than imported, and the dependency graph is why.
 *
 * `packages/render` owns `KINDS` and is the authority (`05 §2`'s *"v1 kinds — sixteen"*), but the
 * kernel depends on `ports` and `where` and on nothing else — `31 §2` puts the renderer above it, so
 * importing the table would invert the layering and make the record unable to install a page without
 * a browser bundle in scope. The alternative to a copy is no check at all, and no check is what a
 * page has had: `readBlock` compares `block.kind` to nothing, so a block whose kind is a typo and has
 * no `source` comes back as `base` — no rows, no refusal, no mark on the page — and one WITH a source
 * comes back with rows filed under a kind the renderer cannot draw. A block that draws NOTHING and
 * says nothing is the exact silence `04 §1` calls the closure load-bearing for.
 *
 * A COPY THAT DRIFTS IS WORSE THAN NO COPY, so the count is stated where it can be wrong, and the
 * test asserts the sixteen install. A SEVENTEENTH KIND NEEDS NO EDIT HERE: `05 §2` says a new kind
 * arrives as a `block.<id>` declaration, which this list admits by prefix and checks as a document of
 * its own.
 */
const BLOCK_KINDS = [
  'note', 'quote', 'stat', 'bar', 'gauge', 'chips', 'spec', 'params',
  'todo', 'steps', 'timeline', 'board', 'code', 'tree', 'comparison', 'table',
] as const;

/** `06 §1.1`: at most 24 blocks, 1–16 `requires`, and the twelfths a `span` is measured in. */
const BLOCK_CEILING = 24;
const REQUIRES_CEILING = 16;
const SPAN_MAX = 12;
const LIMIT_MAX = 500;
const CELL_CEILING = 6;
const COLUMN_CEILING = 16;
const ORDER_CEILING = 3;

/** The four intent words `22 §7` admits, and the only path by which a tone reaches the DOM. */
const TONES = ['good', 'warn', 'bad', 'info'] as const;

/**
 * `42 §4.5`'s three source forms, plus the one the record computes.
 *
 * `forecast.runway` is not in `42 §4.5`'s table and is in `pages.ts`'s `COMPUTED` set, which is the
 * live authority — the money page ships a block sourced from it. A source list that refused the
 * record's own page would be a check written from the document with the product left out.
 */
const SOURCE = /^(?:register|metric)\.[a-z][a-z0-9_-]{0,31}$/u;
const BLOCK_SOURCE = /^block\.\d{1,2}$/u;
const COMPUTED_SOURCES = ['forecast.runway'] as const;

/** A metric id as a page says it: `project-owed:Kiln` is one document read about one project. */
const metricNamed = (said: string): string => said.split(':')[0] ?? '';
const METRIC_ID = /^[a-z][a-z0-9_-]{0,31}$/u;

const isInt = (n: unknown, lo: number, hi: number): boolean => typeof n === 'number' && Number.isInteger(n) && n >= lo && n <= hi;

const byteLength = (text: string): number => new TextEncoder().encode(text).length;

/**
 * What is already in the record, plus what is arriving with this declaration, by id.
 *
 * A DEPENDENCY IS A FACT ABOUT TWO DOCUMENTS, so it cannot be decided from one. The map carries
 * BODIES rather than ids because two checks need to read the other document rather than merely know
 * it exists: a page asks whether a register is there, and a `create` rule asks how many values the
 * field it crosses declares. Absent, every cross-declaration check is SKIPPED rather than failed —
 * `validate(decl)` on its own is still the pure, context-free check `validateDeclaration` exports,
 * and a caller that cannot say what is installed must not be told its page is broken.
 */
export type Known = ReadonlyMap<string, Record<string, Json>>;

/**
 * A page declaration, checked against `06 §1.1` and `42 §4.5`.
 *
 * NOTHING CHECKED ONE, and a page is the declaration with the most ways to be quietly wrong,
 * because every one of them renders. `readBlock` is written to never throw — *"everything a block
 * can get wrong comes back as a refusal ON THE BLOCK"* — which is right at render and is exactly why
 * the install-time check matters: the refusals it produces are seen by whoever OPENS the page, weeks
 * after the person who wrote it has gone. A kind that is not a kind is not even that: it takes the
 * "a block with no source is a written block" arm and draws nothing at all.
 *
 * A BLOCK HAS NO x, NO y AND NO HEIGHT. `06 §1.1` gives it an order in the list and a `span` in
 * twelfths, and that is the whole of its geometry — so the only numbers there are to check are the
 * span, the row limit and the counts, and all three are checkable from the document alone.
 */
function pageBody(decl: Declaration, installed?: Known): Refusal | null {
  const body = decl.body as {
    title?: unknown;
    nav?: unknown;
    requires?: unknown;
    blocks?: unknown;
    tone?: unknown;
  };
  const id = decl.id;

  if (typeof body.title !== 'string' || body.title.trim() === '')
    return bad('DECLARATION_INVALID', `${id} has no title, and a page is named on the screen before it is drawn.`, 'title');

  /* `06 §3`: *"pages can appear on their own; navigation cannot"* — a nav entry with no section is
     an item in no menu, and one with no order sorts against whatever the reader last wrote. Both
     install cleanly and both produce a page you can only reach by typing its slug. */
  if (body.nav !== undefined) {
    const nav = body.nav as { section?: unknown; order?: unknown };
    if (nav === null || typeof nav !== 'object')
      return bad('DECLARATION_INVALID', `${id}'s nav is a section and an order.`, 'nav');
    if (typeof nav.section !== 'string' || nav.section.trim() === '' || byteLength(nav.section) > 40)
      return bad('DECLARATION_INVALID', `${id} names ${JSON.stringify(nav.section ?? null)} as its nav section; a section is text of at most 40 bytes.`, 'nav');
    if (!isInt(nav.order, 0, 9999))
      return bad('DECLARATION_INVALID', `${id} sits at nav order ${JSON.stringify(nav.order ?? null)}; an order is a whole number from 0 to 9999.`, 'nav');
  }

  if (body.tone !== undefined && !(TONES as readonly unknown[]).includes(body.tone))
    return bad('DECLARATION_INVALID', `${String(body.tone)} is not an intent.`, 'tone', TONES as unknown as string[]);

  /* `06 §1.1`: *"a page cannot appear without its data"* — `requires` is what makes uninstalling a
     pack take its pages out of the nav with it. It is marked required there and is checked here only
     when it is written, because four page fixtures across `packages/record` and `packages/mcp` — files
     this one does not own — declare a page with no `requires` at all. The shape is checked, and the
     coverage rule below is checked against whatever it says. Making it REQUIRED is the next pass, and
     it is one line here and four in those two files. */
  const requires = body.requires;
  if (requires !== undefined) {
    if (!Array.isArray(requires) || requires.length === 0 || requires.length > REQUIRES_CEILING)
      return bad('DECLARATION_INVALID', `${id}'s requires is a list of one to ${REQUIRES_CEILING} registers.`, 'requires');
    for (const want of requires) {
      if (typeof want !== 'string' || !/^register\.[a-z][a-z0-9_-]{0,31}$/u.test(want))
        return bad('DECLARATION_INVALID', `${id} requires ${JSON.stringify(want)}, and a page requires register.<id>.`, 'requires');
      /* AND THE REGISTER IS THERE, WHICH IS THE ONLY HALF A DOCUMENT CANNOT ANSWER ALONE. `04 §5`
         gives this its own code and its own sentence — a page whose register never arrived is a nav
         entry that opens an empty screen, and `06 §1` says that is worse than no nav entry at all. */
      if (installed && !installed.has(want))
        return bad(
          'DEPENDENCY_UNRESOLVED',
          `${id} requires ${want} — not installed. Install the pack that declares it first, or use --with-deps.`,
          'requires',
        );
    }
  }
  const declared = new Set(Array.isArray(requires) ? (requires as string[]) : []);

  const blocks = body.blocks;
  if (!Array.isArray(blocks) || blocks.length === 0)
    return bad('DECLARATION_INVALID', `${id} declares no blocks, so opening it shows a heading and nothing under it.`, 'blocks');
  if (blocks.length > BLOCK_CEILING)
    return bad('DECLARATION_INVALID', `${id} declares ${blocks.length} blocks. The ceiling is ${BLOCK_CEILING} — a page longer than that is a report.`, 'blocks');

  for (const [i, raw] of blocks.entries()) {
    const block = raw as {
      kind?: unknown;
      span?: unknown;
      source?: unknown;
      limit?: unknown;
      cells?: unknown;
      columns?: unknown;
      order?: unknown;
      tone?: unknown;
      when?: unknown;
    };
    const at = `blocks[${i}]`;
    if (block === null || typeof block !== 'object')
      return bad('DECLARATION_INVALID', `${id}.${at} is not a block.`, at);

    /* THE CLOSED LIST, AND IT IS CLOSED FOR THE REASON `04 §1` GIVES: the security argument is an
       ENUMERATION, and an enumeration only works over a finite list. A pack may still invent a kind
       — as a `block.<id>` declaration, which is admitted here by prefix and checked as a document of
       its own. A bare word that is neither is a block that draws nothing. */
    if (block.kind !== undefined) {
      const kind = block.kind;
      const declaredKind = typeof kind === 'string' && /^block\.[a-z][a-z0-9_-]{0,31}$/u.test(kind);
      if (!declaredKind && !(BLOCK_KINDS as readonly unknown[]).includes(kind))
        return bad(
          'KIND_UNKNOWN',
          `${id}.${at}: kind ${JSON.stringify(kind ?? null)} is not one of the sixteen, and no block declares it.`,
          at,
          BLOCK_KINDS as unknown as string[],
        );
    }

    /* TWELFTHS, AND ONLY TWELFTHS. `06 §1.1` gives a block an order in the list and a width, and
       nothing else — no x, no y, no height. A span of 0 is a block with no width and a span of 13 is
       a row that wraps and leaves a hole; the size control refuses rather than clamping, because a
       declaration silently clamped is a number that never reached the screen (`21 §11`). */
    if (block.span !== undefined && !isInt(block.span, 1, SPAN_MAX))
      return bad(
        'OUT_OF_BOUNDS',
        `${id}.${at}: span ${JSON.stringify(block.span)} is not a width. A page is ${SPAN_MAX} columns, so a span is a whole number from 1 to ${SPAN_MAX}.`,
        at,
      );

    if (block.limit !== undefined && !isInt(block.limit, 0, LIMIT_MAX))
      return bad('OUT_OF_BOUNDS', `${id}.${at}: limit ${JSON.stringify(block.limit)} is not a row count from 0 to ${LIMIT_MAX}.`, at);

    if (block.tone !== undefined && !(TONES as readonly unknown[]).includes(block.tone))
      return bad('DECLARATION_INVALID', `${String(block.tone)} is not an intent.`, at, TONES as unknown as string[]);

    if (block.source !== undefined) {
      const source = block.source;
      if (
        typeof source !== 'string' ||
        !(SOURCE.test(source) || BLOCK_SOURCE.test(source) || (COMPUTED_SOURCES as readonly string[]).includes(source))
      )
        return bad(
          'DECLARATION_INVALID',
          `${id}.${at} reads ${JSON.stringify(source ?? null)}; a block's source is register.<id>, metric.<id> or block.<n>.`,
          at,
        );
      /* `42 §4.5`: *"every register any block reads must be here"*, and this is the half of
         `DEPENDENCY_UNRESOLVED` that needs no record at all. A block reading a register the page does
         not require is a page that survives the uninstall of the pack holding its rows — it stays in
         the nav and draws an empty table under a heading that promises one. */
      if (declared.size > 0 && source.startsWith('register.') && !declared.has(source))
        return bad(
          'DEPENDENCY_UNRESOLVED',
          `${id}.${at} reads ${source}, and ${id} does not require it. Every register a block reads is named in requires, or the page outlives its data.`,
          at,
          [...declared],
        );
    }

    if (block.cells !== undefined) {
      const cells = block.cells;
      if (!Array.isArray(cells) || cells.length === 0 || cells.length > CELL_CEILING)
        return bad('DECLARATION_INVALID', `${id}.${at} draws one to ${CELL_CEILING} figures.`, at);
      for (const cell of cells as { metric?: unknown }[]) {
        /* THE PARAMETER IS PART OF THE NAME AND NOT PART OF THE ID. `project-owed:Kiln` is one
           document read about one project (`pages.ts` splits on the FIRST colon), so the id being
           checked is the half before it. */
        if (typeof cell?.metric !== 'string' || !METRIC_ID.test(metricNamed(cell.metric)))
          return bad('DECLARATION_INVALID', `${id}.${at} names ${JSON.stringify(cell?.metric ?? null)} as a figure, and a figure is a metric id.`, at);
      }
    }

    /* A LEAF WITH `metric:` IN PLACE OF `field:` (`06 §1`), evaluated at render and never compiled.
       A `when:` naming nothing is a block that is either always drawn or never — and both of those
       are indistinguishable from the block working. */
    if (block.when !== undefined) {
      const when = block.when as { metric?: unknown };
      if (when === null || typeof when !== 'object' || typeof when.metric !== 'string' || !METRIC_ID.test(metricNamed(when.metric)))
        return bad('DECLARATION_INVALID', `${id}.${at}'s when is one leaf naming a metric.`, at);
    }

    if (block.columns !== undefined) {
      const columns = block.columns;
      if (!Array.isArray(columns) || columns.length === 0 || columns.length > COLUMN_CEILING)
        return bad('DECLARATION_INVALID', `${id}.${at} draws one to ${COLUMN_CEILING} columns.`, at);
      for (const column of columns as { field?: unknown }[])
        if (typeof column?.field !== 'string' || column.field === '')
          return bad('DECLARATION_INVALID', `${id}.${at} names ${JSON.stringify(column?.field ?? null)} as a column, and a column names a field.`, at);
    }

    if (block.order !== undefined) {
      const order = block.order;
      if (!Array.isArray(order) || order.length === 0 || order.length > ORDER_CEILING)
        return bad('DECLARATION_INVALID', `${id}.${at} sorts by one to ${ORDER_CEILING} fields.`, at);
      for (const term of order as { field?: unknown; dir?: unknown }[])
        if (typeof term?.field !== 'string' || (term.dir !== undefined && term.dir !== 'asc' && term.dir !== 'desc'))
          return bad('DECLARATION_INVALID', `${id}.${at} sorts by a field, ascending or descending.`, at, ['asc', 'desc']);
    }
  }

  return null;
}

/**
 * A theme declaration, checked against `28 §4` — the half a parser can answer.
 *
 * WHAT IS HERE IS THE CLOSURE, AND NOT THE PALETTE. `39 §6.2` splits the theme's refusals cleanly:
 * `THEME_VALUE_INVALID` is *"what only the colour parser sees — a colour outside the grammar, an
 * alpha, an achromatic seed"*, and it is raised at PARSE. `CONTRAST_FLOOR`, `INTENT_INSEPARABLE` and
 * `THEME_LADDER_ORDER` are raised by `build`, over a solved palette, after Brettel simulation and a
 * ΔE2000 in CIELAB — `@braindog/theme` is nine hundred lines of that and the kernel depends on
 * `ports` and `where` and nothing else. Half-solving a palette here to produce a contrast number
 * would be a second implementation of the one thing in this repository that must have exactly one:
 * a theme refused by one solver and admitted by another is a theme that is not portable, which
 * `28 §4.5` names as the entire reason a floor refuses rather than auto-corrects. THOSE THREE
 * CHECKS BELONG IN THE PASS THAT CALLS `build`, and `45 §5.6` already says the record makes that
 * call at plan and at install.
 *
 * THE ROLE NAMES ARE NOT CLOSED HERE, DELIBERATELY. `42 §4.10` lists twenty-two and
 * `@braindog/theme`'s own `Role` union has twenty-seven — `info`, `info-fill`, `accent-edge`,
 * `accent-hover` and `accent-press` were added when the house accent became the mark and `info`
 * stopped resolving to `accent`. Refusing a role from the stale list would refuse `info`, which the
 * shipped house theme itself emits. A list that is wrong in one of two places is worse than no list,
 * so this checks the SHAPE of `roles` and leaves the names to the package that owns them.
 */
function themeBody(decl: Declaration): Refusal | null {
  const body = decl.body as { seed?: unknown; roles?: unknown; scheme?: unknown; scale?: unknown; extends?: unknown };
  const id = decl.id;

  if (body.scheme !== undefined && !['light', 'dark', 'both'].includes(String(body.scheme)))
    return bad('THEME_VALUE_INVALID', `${id}.scheme is ${JSON.stringify(body.scheme)}; a theme is light, dark or both.`, `${id}.scheme`, ['light', 'dark', 'both']);

  const seed = body.seed as { accent?: unknown; neutral_hue?: unknown } | undefined;
  if (seed === undefined || seed === null || typeof seed !== 'object' || typeof seed.accent !== 'string')
    return bad('THEME_VALUE_INVALID', `${id} names no seed accent, and a theme is one colour in and a coherent palette out.`, `${id}.seed.accent`);

  const seedFault = colourFault(seed.accent, `${id}.seed.accent`);
  if (seedFault) return seedFault;

  /* `28 §3` STEP 0, AND IT IS THE ONE THE WHOLE GENERATOR STANDS ON. Below chroma 0.02 the hue angle
     is numerically unstable — two greys can be 180° apart — so every role solved from that hue is
     solved from a number that means nothing. `04 §5`'s own worked example is exactly this value:
     *"oklch(0.62 0.01 262) is almost grey; there is no hue to build from"*. */
  const grey = achromatic(seed.accent);
  if (grey)
    return bad(
      'THEME_VALUE_INVALID',
      `${id}.seed.accent ${JSON.stringify(seed.accent)} is almost grey; there is no hue to build from. Pick a colour with some chroma in it.`,
      `${id}.seed.accent`,
    );

  if (seed.neutral_hue !== undefined && seed.neutral_hue !== 'from-accent' && !isInt(seed.neutral_hue, 0, 360))
    return bad(
      'THEME_VALUE_INVALID',
      `${id}.seed.neutral_hue is ${JSON.stringify(seed.neutral_hue)}; a neutral hue is from-accent or a whole number of degrees from 0 to 360.`,
      `${id}.seed.neutral_hue`,
    );

  if (body.roles !== undefined) {
    const roles = body.roles as Record<string, unknown>;
    if (roles === null || typeof roles !== 'object' || Array.isArray(roles))
      return bad('THEME_VALUE_INVALID', `${id}.roles is a colour per role, per scheme.`, `${id}.roles`);
    for (const [scheme, map] of Object.entries(roles)) {
      if (scheme !== 'light' && scheme !== 'dark')
        return bad(
          'THEME_VALUE_INVALID',
          `${id}.roles.${scheme} is not a scheme; a theme overrides roles under light or under dark.`,
          `${id}.roles.${scheme}`,
          ['light', 'dark'],
        );
      if (map === null || typeof map !== 'object' || Array.isArray(map))
        return bad('THEME_VALUE_INVALID', `${id}.roles.${scheme} is a colour per role.`, `${id}.roles.${scheme}`);
      for (const [role, value] of Object.entries(map as Record<string, unknown>)) {
        if (typeof value !== 'string')
          return bad(
            'THEME_VALUE_INVALID',
            `${id}.roles.${scheme}.${role} is ${JSON.stringify(value)}, and a role holds a colour.`,
            `${id}.roles.${scheme}.${role}`,
          );
        const fault = colourFault(value, `${id}.roles.${scheme}.${role}`);
        if (fault) return fault;
      }
    }
  }

  const scale = body.scale as { space?: { base?: unknown }; radius?: Record<string, unknown>; density?: unknown } | undefined;
  if (scale !== undefined && scale !== null && typeof scale === 'object') {
    if (scale.density !== undefined && !['compact', 'comfortable', 'roomy'].includes(String(scale.density)))
      return bad(
        'THEME_VALUE_INVALID',
        `${id}.scale.density is ${JSON.stringify(scale.density)}; a density is compact, comfortable or roomy.`,
        `${id}.scale.density`,
        ['compact', 'comfortable', 'roomy'],
      );
    if (scale.space !== undefined && !isInt(scale.space?.base, 2, 8))
      return bad(
        'THEME_VALUE_INVALID',
        `${id}.scale.space.base is ${JSON.stringify(scale.space?.base ?? null)}; a spacing base is an integer from 2 to 8.`,
        `${id}.scale.space.base`,
      );
    for (const step of ['sm', 'md', 'lg'])
      if (scale.radius?.[step] !== undefined && !isInt(scale.radius[step], 0, 24))
        return bad(
          'THEME_VALUE_INVALID',
          `${id}.scale.radius.${step} is ${JSON.stringify(scale.radius[step])}; a radius is an integer from 0 to 24.`,
          `${id}.scale.radius.${step}`,
        );
  }

  return null;
}

/**
 * `28 §6`'s banned substrings. `url()` is an outbound request from a system designed to make none.
 *
 * `42 §4.10` gives these to `REMOTE_ASSET` rather than to the theme's own code, and `04 §5` is the
 * reason: it is *"the same refusal wherever in a pack it appears"* — an image URL in a page and a
 * `url(` in a token value are one attack, which is the record id arriving in somebody's access log.
 * `var(` is here for a different reason and it is not about the network: it lets a token escape into
 * another token's context, so a theme could make one role read another's value.
 */
const BANNED_IN_VALUE = ['url(', 'image(', 'element(', 'attr(', 'var(', '\\'] as const;

/** `#RGB`, `#RRGGBB` or `oklch(L C H)` — the whole of the dialect (`parseColour`, `28 §1`). */
const HEX_COLOUR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/u;
const OKLCH = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/iu;

/**
 * Why a theme value is not one, or `null`.
 *
 * ALPHA IS NAMED SEPARATELY BECAUSE IT IS THE ONE THAT LOOKS RIGHT. `#0B0D0CCC` parses everywhere
 * else in the industry, and here it is a role that is partly the surface underneath it — which means
 * every contrast number measured against that role is measured against a colour that is not what
 * ships. `28 §1` takes alpha out of the dialect for exactly that reason, and a refusal that only
 * said "not a colour" would send somebody looking for a typo in eight correct hex digits.
 */
function colourFault(value: string, at: string): Refusal | null {
  const said = value.trim();
  const lower = said.toLowerCase();
  for (const token of BANNED_IN_VALUE)
    if (lower.includes(token))
      return bad(
        'REMOTE_ASSET',
        `${at}: ${JSON.stringify(value)} contains ${JSON.stringify(token)}. A theme sets token values and loads nothing from elsewhere.`,
        at,
      );

  const alpha =
    /^#(?:[0-9a-fA-F]{4}|[0-9a-fA-F]{8})$/u.test(said) || /^(?:rgba|hsla)\(/iu.test(said) || (said.includes('/') && said.includes('('));
  if (alpha)
    return bad(
      'THEME_VALUE_INVALID',
      `${at}: ${JSON.stringify(value)} carries an alpha. A role is opaque, or every contrast measured against it is measured against a colour that never ships.`,
      at,
    );

  if (!HEX_COLOUR.test(said) && !OKLCH.test(said))
    return bad('THEME_VALUE_INVALID', `${at}: ${JSON.stringify(value)} is not a colour this dialect reads. Write #RRGGBB or oklch(L C H).`, at);
  return null;
}

/**
 * Whether a seed has no hue to build from.
 *
 * THE `oklch()` FORM CARRIES ITS OWN ANSWER — the chroma is the second number, so the check is the
 * comparison `28 §3` step 0 makes and nothing else. A HEX WHOSE THREE CHANNELS ARE EQUAL is grey by
 * construction and needs no conversion either. What is NOT decided here is the near-grey hex —
 * `#7F8081` is chroma 0.004 and reads as a colour — because deciding it needs sRGB → OKLCh, which is
 * `@braindog/theme`'s `rgbToLch` and which the kernel cannot import (`31 §2`). That one is caught
 * where the palette is solved, by the same threshold, with the same sentence.
 */
function achromatic(value: string): boolean {
  const said = value.trim();
  const oklch = OKLCH.exec(said);
  if (oklch) return Number(oklch[2]) < 0.02;
  if (!HEX_COLOUR.test(said)) return false;
  const h = said.slice(1);
  const [r, g, b] =
    h.length === 3 ? [h[0]! + h[0]!, h[1]! + h[1]!, h[2]! + h[2]!] : [h.slice(0, 2), h.slice(2, 4), h.slice(4, 6)];
  return r.toLowerCase() === g.toLowerCase() && g.toLowerCase() === b.toLowerCase();
}

/* ── an ingest ───────────────────────────────────────────────────────────── */

/** `30 §1`'s five channels, and the list is closed because `arrive` has an arm per channel. */
const CHANNELS_IN = ['email', 'webhook', 'pull', 'paste', 'api'] as const;

/**
 * The thirteen forms of `07 §3`: ten extractors and three combinators.
 *
 * COUNTED SEPARATELY IN THE DOCUMENT AND TOGETHER HERE, because what this check answers is *"is this
 * key a form"* and a combinator is one. `07 §3` records an earlier draft saying nine and enumerating
 * ten, which is the failure mode a stated count exists to catch — so the count is stated here too.
 */
const EXTRACTORS = [
  'after', 'before', 'between', 'money', 'date', 'text', 'int', 'decimal', 'enum', 'lookup',
  'first', 'nth', 'default',
] as const;

/** `42 §4.7`: what `inbox_raw` holds, and therefore everything a `match:` can be about. */
const MATCH_FIELDS = ['from', 'to', 'subject', 'body', 'channel', 'state', 'ts'] as const;

/** `43 §4.4`, closed: a key with an optional `[n]`, `[-1]` or `[]`, or a bare index. */
const PATH_SEGMENT = /^(?:[^.[\]\s]+(?:\[(?:\d+|-1|)\])?|\[(?:\d+|-1|)\])$/u;
const PATH_SEGMENT_CEILING = 16;

/**
 * An ingest declaration, checked against `07 §3`, `25 §3` and `42 §4.7`.
 *
 * A PATTERN IS DATA, AND DATA IS CHECKED WHERE IT IS WRITTEN. `ingest.ts` reads a form with
 * `'money' in form`, so an unknown key falls through every arm and `extract` returns `null` for that
 * field — which the write path then reports as a missing required field, on an arrival, days later,
 * naming the FIELD rather than the typo that caused it. The person who could fix it is the one who
 * wrote the declaration, and by then they are looking at somebody else's bank email.
 *
 * THE SAME SHAPE ON THE MATCH SIDE, AND WORSE: a `match:` naming a field `inbox_raw` does not have
 * compiles to a predicate over a path that is never non-null, so the pattern matches NOTHING. An
 * ingest that never fires and an ingest that fires correctly look identical from the outside until
 * somebody notices a month of arrivals sitting untriaged.
 */
function ingestBody(decl: Declaration): Refusal | null {
  const body = decl.body as { channel?: unknown; match?: unknown; extract?: unknown; map?: unknown; fetch?: unknown };
  const id = decl.id;

  if (typeof body.channel !== 'string' || !(CHANNELS_IN as readonly string[]).includes(body.channel))
    return bad(
      'DECLARATION_INVALID',
      `${id} arrives by ${JSON.stringify(body.channel ?? null)}, and there are five channels.`,
      'channel',
      CHANNELS_IN as unknown as string[],
    );

  /* THE TREE FORM ONLY. A `match:` may also be the sentence a person writes, and parsing one needs a
     `Schema` and a clock — `parseWhere`'s `SentenceDeps` — neither of which a context-free check
     has. The sentence form reaches `predicateOf` at install through the record's own read check,
     which raises `MATCH_FIELD_UNKNOWN`'s sibling for an unknown name; the tree form reached nothing. */
  const fault = matchFault(body.match, id, 'match');
  if (fault) return fault;

  if (body.extract !== undefined) {
    const extract = body.extract;
    if (extract === null || typeof extract !== 'object' || Array.isArray(extract))
      return bad('DECLARATION_INVALID', `${id}'s extract is one form per field.`, 'extract');
    for (const [field, form] of Object.entries(extract as Record<string, unknown>)) {
      const unknown = extractorFault(form, `${id}.extract.${field}`, 0);
      if (unknown) return unknown;
    }
  }

  /* `25 §3.1`'s paths, which become `select()` calls over somebody else's JSON. A path outside the
     grammar reaches nothing rather than throwing, so the mapped field is absent, the row is written
     without it, and the connector reports a successful page. */
  if (body.map !== undefined) {
    const map = body.map;
    if (map === null || typeof map !== 'object' || Array.isArray(map))
      return bad('DECLARATION_INVALID', `${id}'s map is one entry per field.`, 'map');
    for (const [field, entry] of Object.entries(map as Record<string, { path?: unknown }>)) {
      const paths = Array.isArray(entry?.path) ? entry.path : [entry?.path];
      for (const path of paths) {
        const wrong = pathFault(path, `${id}.map.${field}.path`);
        if (wrong) return wrong;
      }
    }
  }

  const fetch = body.fetch as
    | { read?: { rows?: unknown }; expect?: unknown; page?: { from?: unknown }; probe?: { read?: unknown } }
    | undefined;
  if (fetch !== undefined && fetch !== null && typeof fetch === 'object') {
    if (fetch.read?.rows !== undefined) {
      const wrong = pathFault(fetch.read.rows, `${id}.fetch.read.rows`);
      if (wrong) return wrong;
    }
    if (fetch.page?.from !== undefined) {
      const wrong = pathFault(fetch.page.from, `${id}.fetch.page.from`);
      if (wrong) return wrong;
    }
    for (const [name, path] of Object.entries((fetch.probe?.read ?? {}) as Record<string, unknown>)) {
      const wrong = pathFault(path, `${id}.fetch.probe.read.${name}`);
      if (wrong) return wrong;
    }
    if (Array.isArray(fetch.expect))
      for (const [i, term] of (fetch.expect as { path?: unknown }[]).entries()) {
        const wrong = pathFault(term?.path, `${id}.fetch.expect[${i}].path`);
        if (wrong) return wrong;
      }
  }

  /* A CONNECTOR'S INTERVAL, CHECKED WHERE IT IS WRITTEN. `checkInterval` has existed with no
     production caller, so `every: '1m'` against a bank installed cleanly — and 25 §9 puts the floor
     at install precisely because one enforced at fire time is one somebody finds out about after
     they have written the declaration and waited for the first run. */
  if (body.channel === 'pull') {
    const said = checkInterval(decl.body as unknown as PullDecl);
    if (!said.ok && 'refusal' in said) return bad('DECLARATION_INVALID', said.refusal.fix, said.refusal.at ?? 'every');
  }

  return null;
}

/** Every `field:` a `match:` names, against what `inbox_raw` actually holds. */
function matchFault(node: unknown, id: string, at: string): Refusal | null {
  if (node === null || typeof node !== 'object') return null;
  for (const group of ['all', 'any', 'none']) {
    const arm = (node as Record<string, unknown>)[group];
    if (Array.isArray(arm)) {
      for (const child of arm) {
        const fault = matchFault(child, id, at);
        if (fault) return fault;
      }
      return null;
    }
  }
  const field = (node as { field?: unknown }).field;
  if (typeof field === 'string' && !(MATCH_FIELDS as readonly string[]).includes(field))
    return bad(
      'MATCH_FIELD_UNKNOWN',
      `${id}.${at} is about ${field}, and an arrival holds ${MATCH_FIELDS.join(', ')}. Match on those, and read the rest with extract.`,
      at,
      MATCH_FIELDS as unknown as string[],
    );
  return null;
}

/** A form's own key, against the thirteen — and through a combinator, which holds forms. */
function extractorFault(form: unknown, at: string, depth: number): Refusal | null {
  if (form === null || typeof form !== 'object' || Array.isArray(form))
    return bad(
      'EXTRACTOR_UNKNOWN',
      `${at} is ${JSON.stringify(form ?? null)}, and an extractor is one object with one of the thirteen forms.`,
      at,
      EXTRACTORS as unknown as string[],
    );
  /* THREE DEEP, WHICH IS `42 §4.7`'s NESTING CEILING FOR `first`. A combinator that reaches itself
     is a walk that does not end, and this one runs over a pack a stranger wrote. */
  if (depth > 3) return bad('EXTRACTOR_UNKNOWN', `${at} nests combinators more than three deep.`, at);

  for (const key of Object.keys(form as Record<string, unknown>)) {
    if (key === 'note') continue;
    if (!(EXTRACTORS as readonly string[]).includes(key))
      return bad(
        'EXTRACTOR_UNKNOWN',
        `${at}: ${JSON.stringify(key)} is not one of the thirteen forms — ten extractors and three combinators.`,
        at,
        EXTRACTORS as unknown as string[],
      );
  }

  const held = form as { first?: unknown; nth?: { of?: unknown }; default?: { of?: unknown } };
  if (Array.isArray(held.first))
    for (const [i, inner] of held.first.entries()) {
      const fault = extractorFault(inner, `${at}.first[${i}]`, depth + 1);
      if (fault) return fault;
    }
  for (const [key, inner] of [['nth', held.nth?.of], ['default', held.default?.of]] as const)
    if (inner !== undefined) {
      const fault = extractorFault(inner, `${at}.${key}.of`, depth + 1);
      if (fault) return fault;
    }
  return null;
}

/** `43 §4.4`'s grammar, and its ceiling. An empty path is the root and is legal. */
function pathFault(path: unknown, at: string): Refusal | null {
  if (typeof path !== 'string')
    return bad('PATH_INVALID', `${at} is ${JSON.stringify(path ?? null)}, and a path is text.`, at);
  if (path === '') return null;
  const segments = path.split('.');
  if (segments.length > PATH_SEGMENT_CEILING)
    return bad('PATH_INVALID', `${at} has ${segments.length} segments, and the ceiling is ${PATH_SEGMENT_CEILING}.`, at);
  for (const segment of segments)
    if (!PATH_SEGMENT.test(segment))
      return bad(
        'PATH_INVALID',
        `${at}: ${JSON.stringify(segment)} is not a segment. A segment is a key with an optional [n], [-1] or [], and holds no dot, bracket or space.`,
        at,
      );
  /* `[]` MULTIPLIES, so two of them multiply twice — `42 §4.2` allows it at most once, and the
     reason is a response with two nested lists producing a row count nobody declared. */
  if ((path.match(/\[\]/gu) ?? []).length > 1)
    return bad('PATH_INVALID', `${at} says [] twice. A path expands one list, or the row count is whatever the response happened to hold.`, at);
  return null;
}

/* ── a rule ──────────────────────────────────────────────────────────────── */

/**
 * `04 §5`'s cap, measured on the ESCAPED pattern rather than on the literal.
 *
 * `where`'s compiler already refuses a `starts`/`ends` literal over forty bytes and calls it
 * `CONTAINS_TOO_LONG`, which is the raw measure — and the string that reaches SQLite is not the
 * literal. `starts` compiles to `LIKE`, and every `\`, `%` and `_` in the value is escaped on the way
 * in, so a forty-byte literal of `%%%…` is an eighty-byte pattern. One platform caps a `LIKE` pattern
 * at fifty bytes and the other at fifty thousand — which is the parity failure that comment exists to
 * name — so the measure has to be taken on what actually ships.
 */
const PATTERN_MAX = 40;
const escapeLike = (value: string): string => value.replace(/[\\%_]/gu, (c) => `\\${c}`);

/** Every `starts`/`ends` in a `when:`, measured as the `LIKE` pattern the compiler will build. */
function patternFault(node: unknown, id: string): Refusal | null {
  if (node === null || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const fault = patternFault(child, id);
      if (fault) return fault;
    }
    return null;
  }
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if ((key === 'starts' || key === 'ends') && typeof value === 'string') {
      const bytes = byteLength(escapeLike(value));
      if (bytes > PATTERN_MAX)
        return bad(
          'PATTERN_OVER_CAP',
          `${id}.when — the '${key}' pattern is ${bytes} bytes. The cap is ${PATTERN_MAX}. Use 'matches', which searches the full-text index instead.`,
          'when',
        );
    }
    const fault = patternFault(value, id);
    if (fault) return fault;
  }
  return null;
}

/**
 * What a `create` action may not declare.
 *
 * `04 §7` LETS A PACK GENERATE ROWS AND MAKES THE CEILING THE PRICE: *"declare a bounded `create`
 * rule, whose ceiling is shown as SPAWNS in the diff"*. A `create` with no `bound:` is that row of
 * the table with its condition deleted — and the diff cannot print `SPAWNS` for it, so the one screen
 * the whole trust model rests on would say nothing about the rule that fills the record.
 */
function createFault(id: string, action: { create?: unknown }, register: unknown, installed?: Known): Refusal | null {
  const spec = action.create as { register?: unknown; each?: unknown; bound?: unknown } | undefined;
  if (spec === undefined || spec === null || typeof spec !== 'object') return null;

  if (spec.bound === undefined)
    return bad('CREATE_UNBOUNDED', `${id}: create has no bound. A generator with no ceiling fills the record.`, 'bound');

  /* THE CARDINALITY IS IN THE OTHER DOCUMENT, and that is why this needs the batch. A rule crossing
     `sizes` and `colours` can only be measured against what the register declares those to hold — an
     `enum`'s `values` is a fact written down, so a bound its own axes can exceed is a bound that is
     wrong TODAY rather than at the thousandth row. A `list` has no declared length, so the product
     is unknowable and the check does not apply; multiplying by nothing for it would turn the check
     off for `enum × list`, where half of it is knowable. */
  const each = Array.isArray(spec.each) ? (spec.each as unknown[]) : [];
  if (each.length === 0 || !installed || typeof register !== 'string') return null;
  const from = installed.get(`register.${register}`);
  const fields = (from?.fields ?? []) as unknown as FieldLike[];
  if (!Array.isArray(fields)) return null;

  let product = 1;
  const counted: string[] = [];
  for (const axis of each) {
    const field = fields.find((f) => f?.id === axis);
    const values = field?.values;
    if (!Array.isArray(values) || values.length === 0) return null;
    product *= values.length;
    counted.push(`${String(axis)} (${values.length})`);
  }

  const bound = Number(spec.bound);
  if (Number.isFinite(bound) && product > bound)
    return bad('CREATE_OVER_BOUND', `${id}: ${counted.join(' × ')} = ${product} exceeds bound ${bound}.`, 'bound');
  return null;
}

/**
 * Check a declaration before it is installed, because an id becomes SQL.
 *
 * The register id and every field id are inlined into index names and `json_extract` paths — the one
 * place in this package where an identifier is not a bound parameter — so the grammar check is the
 * security boundary, not a tidiness rule.
 *
 * `installed` IS OPTIONAL AND ITS ABSENCE IS NOT A FAILURE. Two checks are about a pair of documents
 * rather than about one — a page's registers and a `create`'s axes — and a caller with no view of the
 * record must get the same answer it always got rather than a refusal it cannot act on.
 */
export function validate(decl: Declaration, installed?: Known): Refusal | null {
  /* `KIND_UNKNOWN` IS THE CODE `04 §5` GIVES THIS, and it was emitted by nothing while this line
     answered `DECLARATION_INVALID`. A registry entry no source file produces is a code a caller
     cannot handle and a fixture nobody can write — which is the whole subject of `30 §6`. */
  if (!KINDS.includes(decl.kind))
    return bad('KIND_UNKNOWN', `${decl.kind} is not one of the eight kinds of declaration.`, 'kind', KINDS);
  const own = ownId(decl);
  if (decl.id !== `${decl.kind}.${own}`)
    return bad(
      'DECLARATION_INVALID',
      `A declaration's id is its kind and its own id: ${decl.kind}.${String(own)}, not ${decl.id}.`,
      'id',
    );
  /**
    * A DIGEST'S KEYS ARE TYPED AND CLOSED (09 §6), AND NOTHING CHECKED THEM. `validate` deep-checked
    * registers and returned `null` for everything else — so `channels: ['mcp']` installed and then
    * fell through the send loop's if-chain with no `else`, and the schedule row was marked done and
    * re-armed while the receipt said it went. A `webhook` channel with no `webhook: { url }` did the
    * same. Both are the shape this codebase keeps producing: something complete-looking that reports
    * success and does nothing.
    */
  if (decl.kind === 'digest') return digestBody(decl);
  if (decl.kind === 'metric') return metricBody(decl);
  if (decl.kind === 'page') return pageBody(decl, installed);
  if (decl.kind === 'theme') return themeBody(decl);
  if (decl.kind === 'ingest') return ingestBody(decl);

  /* A `once_per` THAT IS NOT A LIST THROWS AT FIRE TIME, INSIDE A WRITE. `onceKey` calls `.map` on
     it, and nothing checked the shape — so `once_per: 'row'` installed cleanly and then made every
     write to that register raise a `TypeError` out of the rules pass, out of `create`, out of the
     transaction. A declaration's shape is checked where it lands or it is checked by a customer. */
  if (decl.kind === 'rule') {
    /* A PATTERN THAT REACHES A PLATFORM CEILING IS A PREDICATE THAT ANSWERS DIFFERENTLY IN TWO
       PLACES, which is the failure `where`'s own comment names and then measures on the wrong
       string. `04 §5` gives it a code of its own and a fix that is a different operator. */
    const over = patternFault((decl.body as { when?: unknown }).when, decl.id);
    if (over) return over;

    /* AND A SPAN THIS RECORD CANNOT READ IS REFUSED WHERE IT IS WRITTEN. `{ schedule: { in: '2 weeks'
       } }` would install and then be dropped at fire time — and the row it was meant to chase is
       exactly the row somebody is trusting it to chase. */
    for (const action of ((decl.body as { then?: unknown }).then ?? []) as { schedule?: { in?: unknown }; create?: unknown }[]) {
      if (!action || typeof action !== 'object') continue;
      if (action.schedule !== undefined) {
        const span = typeof action.schedule.in === 'string' ? spanMs(action.schedule.in) : null;
        if (span === null)
          return bad(
            'DECLARATION_INVALID',
            `${decl.id} schedules ${String(action.schedule.in)} ahead, and a span is a number and one of d, w, m or y — write 14d.`,
            'then',
          );
      }
      if ('create' in action) {
        const unbounded = createFault(decl.id, action, (decl.body as { register?: unknown }).register, installed);
        if (unbounded) return unbounded;
      }
    }

    const once = (decl.body as { once_per?: unknown }).once_per;
    if (once !== undefined && (!Array.isArray(once) || once.some((k) => typeof k !== 'string')))
      return bad('DECLARATION_INVALID', `A rule's once_per is a list of field names, and ${decl.id}'s is not.`, 'once_per');
    return null;
  }
  if (decl.kind !== 'register') return null;

  const id = own;
  if (typeof id !== 'string' || !IDENT.test(id))
    return bad(
      'DECLARATION_INVALID',
      `A register id is lower-case letters, digits and single underscores, starting with a letter. ${String(id)} is not.`,
      'id',
    );

  const fields = decl.body.fields;
  if (!Array.isArray(fields) || fields.length === 0)
    return bad('DECLARATION_INVALID', `${id} declares no fields, so it can hold nothing.`, 'fields');

  /* `02 §5`'s ceiling, and its own sentence for why: *"a register with more than that is a
     database, not a register."* Sixty-five installed clean, and every one of them became a control
     in a form, a line in an MCP schema and a term in a `json_extract` plan. */
  if (fields.length > FIELD_CEILING)
    return bad(
      'FIELDS_OVER_CAP',
      `${id} declares ${fields.length} fields. The ceiling is ${FIELD_CEILING} — a register with more than that is a database, not a register.`,
      'fields',
    );

  const seen = new Set<string>();
  for (const raw of fields) {
    const f = raw as unknown as FieldLike;
    /* THE UNDERSCORE IS CHECKED FIRST, and the order is the whole value of the branch: `_rule` fails
       the identifier grammar too, so testing that first made this message unreachable and handed
       back a regex where a sentence belongs. A test caught it, which is what tests on refusal
       wording are for. */
    if (typeof f?.id === 'string' && f.id.startsWith('_'))
      return bad('DECLARATION_INVALID', `${f.id} starts with an underscore, which the kernel keeps for itself.`, f.id);
    if (typeof f?.id !== 'string' || !IDENT.test(f.id))
      return bad(
        'DECLARATION_INVALID',
        `A field id is lower-case letters, digits and single underscores, starting with a letter. ${String(f?.id)} is not.`,
        'fields',
      );
    if (seen.has(f.id)) return bad('DECLARATION_INVALID', `${id} declares ${f.id} twice.`, f.id);
    seen.add(f.id);

    /**
     * A TYPE THAT IS NOT ONE, WHICH IS `04 §5`'s FIRST WORKED EXAMPLE and installed clean.
     *
     * `FieldType` was a TypeScript union and only that, so nothing checked it at the boundary this
     * package exists to guard — a pack is untyped text written by somebody else. `type: 'currency'`
     * reached `coerce`, fell through its switch, and the field then held whatever JSON arrived. A
     * field with no `type` at all did the same.
     */
    if (typeof f.type !== 'string' || !(FIELD_TYPES as readonly string[]).includes(f.type)) {
      const guess = typeof f.type === 'string' ? nearest(f.type) : null;
      return bad(
        'FIELD_TYPE_UNKNOWN',
        `${id}.${f.id}: type ${JSON.stringify(f.type ?? null)} is not one of the sixteen${guess ? ` — did you mean '${guess}'?` : '.'}`,
        f.id,
        FIELD_TYPES as unknown as string[],
      );
    }
    /* A `list<T>` CARRIES ITS ELEMENT TYPE, and `of: 'list'` is not one — a list of lists is a shape
       the write path has no coercion for and the `where:` compiler cannot index. */
    if (f.type === 'list' && (typeof f.of !== 'string' || f.of === 'list' || !(FIELD_TYPES as readonly string[]).includes(f.of)))
      return bad(
        'FIELD_TYPE_UNKNOWN',
        `${id}.${f.id} is a list and names ${JSON.stringify(f.of ?? null)} as what it holds.`,
        f.id,
        FIELD_TYPES.filter((t) => t !== 'list') as unknown as string[],
      );
    /* AN ENUM WITH NO VALUES IS A FIELD THAT REFUSES EVERYTHING. `02 §1`: an enum is *"a string in
       `values`"*, so with no `values` every write to it fails coercion — after the pack installed
       and the form drew a control with nothing in it. */
    if (f.type === 'enum' && (!Array.isArray(f.values) || f.values.length === 0))
      return bad('DECLARATION_INVALID', `${id}.${f.id} is an enum and lists no values, so nothing could ever be written to it.`, f.id);
  }

  /* `02 §5`: eight, *"each a partial expression index, which costs storage and write time"*. The
     table's own note: a series' `key:` is one index and is not counted. */
  const indexed = (fields as unknown as FieldLike[]).filter((f) => f.index === true || f.unique === true);
  if (indexed.length > INDEX_CEILING)
    return bad('INDEXES_OVER_CAP', `${id}: ${indexed.length} indexed fields; the ceiling is ${INDEX_CEILING}.`, 'fields');

  /* A `unique:` ON A PARTED TYPE WAS BUILT AS TWO PLAIN INDEXES. `money` and `quantity` are objects,
     so they index in two halves — and `f.unique && !part` is never true for either, which meant the
     UNIQUE came out of `indexesFor` as an ordinary index wearing the `entry_u_` name. The rule the
     declaration made was enforced nowhere, and the write path's clash check then bound the whole
     object as a parameter and threw a raw TypeError out of `create`, across the boundary this
     package promises nothing throws over. Refused at the declaration, where a sentence fits. */
  for (const raw of fields) {
    const f = raw as unknown as FieldLike;
    if (f.unique && PARTS[f.type])
      return bad(
        'DECLARATION_INVALID',
        `${id}.${f.id} is a ${f.type}, which the record stores in two halves — so it cannot be unique. Make a text field that carries what you mean by "the same one".`,
        f.id,
      );
  }

  const title = decl.body.title;
  if (typeof title !== 'string' || !seen.has(title))
    return bad('DECLARATION_INVALID', `${id} names ${String(title)} as its title, and has no such field.`, 'title', [...seen]);

  const state = decl.body.state;
  if (state !== undefined && (typeof state !== 'string' || !seen.has(state)))
    return bad('DECLARATION_INVALID', `${id} names ${String(state)} as its state, and has no such field.`, 'state', [...seen]);

  /* `state` IS ALWAYS AN ENUM (`02 §1`, `04 §5`). A `state:` naming a `text` field gives the
     register a lifecycle with no transitions the record can check, so every `move` in every rule
     against it is unenforceable — which is the one thing a state field is FOR. */
  if (typeof state === 'string') {
    const held = (fields as unknown as FieldLike[]).find((f) => f.id === state);
    if (held && held.type !== 'enum')
      return bad('STATE_NOT_ENUM', `${id}.${state}: state is a reserved id and is always an enum.`, state, ['enum']);
  }

  /* `search:` TAKES WHAT THE INDEX CAN TAKE. `02 §1` closes it at text, document, enum, url, email
     and `list<text>`; a `money` field named here produced an FTS column of `[object Object]` and a
     search that quietly matched nothing. */
  const search = decl.body.search;
  if (search !== undefined) {
    if (!Array.isArray(search))
      return bad('DECLARATION_INVALID', `${id}'s search is a list of field names.`, 'search');
    for (const name of search) {
      const f = (fields as unknown as FieldLike[]).find((x) => x.id === name);
      if (!f) return bad('DECLARATION_INVALID', `${id} searches ${String(name)}, and has no such field.`, 'search', [...seen]);
      const takes = (SEARCHABLE as readonly string[]).includes(f.type) || (f.type === 'list' && f.of === 'text');
      if (!takes)
        return bad(
          'SEARCH_FIELD_TYPE',
          `${id}'s search names ${f.id}, which is ${f.type}. search: takes text, document, enum, url, email and list<text>.`,
          f.id,
          [...SEARCHABLE, 'list<text>'],
        );
    }
  }

  return null;
}

/**
 * Which register an index name belongs to, or `null` when it is not one of ours.
 *
 * `entry_<kind>_<register>__<field>[__<part>]`, split on the SEPARATOR rather than trimmed by a
 * prefix — `__` is what divides the register from the field, and a register id may itself contain a
 * single underscore.
 */
export function registerOfIndex(name: string): string | null {
  const m = /^entry_[iuk]_(.*)$/.exec(name);
  if (!m?.[1]) return null;
  const at = m[1].indexOf('__');
  return at <= 0 ? null : m[1].slice(0, at);
}

/** Thrown inside the transaction so it rolls back, and turned into a refusal outside it. */
class UniqueClash extends Error {
  /** `<register>.<field>` — the first word of the message, which is where the caller should look. */
  get at(): string {
    return this.message.split(' ')[0] ?? '';
  }
}

export type Installed = { id: string; version: number; changed: boolean };

/**
 * Install a batch of declarations, in one transaction.
 *
 * A BATCH, because a page that names a register and the register itself must arrive together or the
 * record is briefly inconsistent — and "briefly" is however long the second call takes to fail.
 */
export async function installDeclarations(
  sql: Sql,
  now: number,
  batch: readonly Declaration[],
  transaction: <T>(fn: () => T) => T,
): Promise<Result<Installed[]>> {
  const staged = await stageDeclarations(batch, knownTo(sql, batch));
  /* PASSED THROUGH WHOLE. Rebuilding the envelope by hand dropped whichever arm the rebuild did
     not know about, and there are three of them now. */
  if (!staged.ok) return staged;
  return staged.value(sql, now, transaction);
}

/**
 * What this batch may name: the record's live declarations, and its own.
 *
 * ITS OWN IS THE HALF THAT MATTERS, and it is why a batch is a batch. `04 §2`'s worked pack declares
 * `register.invoices` and `page.invoicing` in one file — the page requires a register that is not
 * installed at the moment the page is checked, and resolving only against the record would refuse
 * every pack that ships a page with its data. The batch is the arriving record.
 *
 * READ BEFORE THE TRANSACTION OPENS, which is where the rest of the staging already happens: this is
 * a read of what is there, not part of the write, and putting it inside would make a caller that
 * opened its own transaction unable to join.
 */
function knownTo(sql: Sql, batch: readonly Declaration[]): Known {
  const known = new Map<string, Record<string, Json>>();
  for (const row of sql.all<{ id: string; body: string }>(
    'SELECT id, body FROM declaration WHERE superseded_at IS NULL AND retired = 0',
  ))
    try {
      known.set(row.id, JSON.parse(row.body) as Record<string, Json>);
    } catch {
      /* A ROW THIS PACKAGE CANNOT PARSE STILL EXISTS, and that is the fact the caller needs. An
         unparseable body is a bug somewhere else; refusing a page because of it would blame the
         page. */
      known.set(row.id, {});
    }
  for (const decl of batch) known.set(decl.id, decl.body);
  return known;
}

/**
 * Validate and hash a batch, and hand back the WRITE as a synchronous function.
 *
 * THE HASHING IS THE ONLY ASYNC PART, and separating it is what lets a caller put the write inside
 * a transaction it already opened. An install that hashes inside its own transaction cannot be
 * joined to anything — and a pack install that could not join them retired one declaration and
 * installed another from a call that returned a refusal.
 */
export async function stageDeclarations(
  batch: readonly Declaration[],
  known?: Known,
): Promise<Result<(sql: Sql, now: number, transaction: <T>(fn: () => T) => T) => Result<Installed[]>>> {
  for (const decl of batch) {
    const wrong = validate(decl, known);
    if (wrong) return { ok: false, refusal: wrong };
  }
  const sums = await Promise.all(batch.map((d) => digest(jcs(d.body))));
  return ok((sql, now, transaction) => applyDeclarations(sql, now, batch, sums, transaction));
}

function applyDeclarations(
  sql: Sql,
  now: number,
  batch: readonly Declaration[],
  sums: readonly string[],
  transaction: <T>(fn: () => T) => T,
): Result<Installed[]> {
  const at = instant(now);

  try {
    return install();
  } catch (e) {
    if (e instanceof UniqueClash)
      return no<Installed[]>('UNIQUE_VIOLATION', `${e.message} Fix them, then install again.`, { at: e.at });
    throw e;
  }

  function install(): Result<Installed[]> {
  return transaction(() => {
    const out: Installed[] = [];

    for (const [i, decl] of batch.entries()) {
      const checksum = sums[i]!;
      /* EVERY LIVE ROW, retired or not. Filtering `retired = 0` here meant a retired declaration was
         never stamped `superseded_at` when its successor arrived, so a register retired and then
         reinstalled had TWO rows claiming to be current — and a `.dog` replay, which rebuilds the
         schema by reading them, could not say which shape a two-year-old event was written under. */
      const active = sql.one<{ version: number; checksum: string; retired: number }>(
        'SELECT version, checksum, retired FROM declaration WHERE id = ? AND superseded_at IS NULL ORDER BY version DESC LIMIT 1',
        decl.id,
      );

      /* THE SAME BYTES ARE NOT A NEW VERSION. Otherwise every deploy bumps every register and the
         version number stops being a fact about the shape. */
      /* UNLESS THE ACTIVE ROW IS RETIRED. Reinstalling a retired declaration is how a register comes
         back, and its bytes are usually identical to the ones it went away with — so the same-bytes
         short-circuit would have returned `changed: false` and left it retired, with its indexes
         still gone. A version is the honest answer there: the shape has a new period of being live. */
      if (active && active.checksum === checksum && !active.retired) {
        out.push({ id: decl.id, version: active.version, changed: false });
        continue;
      }

      const version = (
        sql.one<{ v: number | null }>('SELECT MAX(version) AS v FROM declaration WHERE id = ?', decl.id)?.v ?? 0
      ) + 1;

      if (active)
        sql.exec('UPDATE declaration SET superseded_at = ? WHERE id = ? AND version = ?', at, decl.id, active.version);

      sql.exec(
        'INSERT INTO declaration (id, version, kind, pack_id, body, checksum, retired, superseded_at, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, NULL, ?)',
        decl.id,
        version,
        decl.kind,
        decl.pack ?? null,
        jcs(decl.body),
        checksum,
        at,
      );

      if (decl.kind === 'register') {
        /* `ownId`, NOT `body.id`. A register may say `register: obligations` as well as `id:` —
           `ownId` has admitted both since it was written and `validate` checks through it — and
           reading the one key here meant the documented form installed with an UNDEFINED register:
           no indexes, and a state mirror update bound to nothing. */
        const register = ownId(decl);
        const fields = (decl.body.fields ?? []) as unknown as FieldLike[];

        /* DROPPED BEFORE THEY ARE CREATED. `CREATE INDEX IF NOT EXISTS` alone meant an index
           outlived the declaration that asked for it: take `unique:` off a field and the unique
           index kept refusing duplicates, retire the field entirely and both its indexes stayed.
           The record enforced a rule the declaration no longer makes.

           THE NAME IS PARSED, NOT PREFIX-MATCHED. Two attempts at this were wrong in the same
           direction. `LIKE 'entry_i_a__%'` is wrong because `_` is a LIKE wildcard; matching the
           string prefix in TypeScript is wrong because `__` is also the separator — a register id
           may contain an underscore, so `entry_i_a__b__code` (register `a__b`, field `b__code`?
           no: register `a__b`) starts with register `a`'s prefix. Installing `a` dropped `a__b`'s
           indexes, and the unchanged-checksum short-circuit meant reinstalling `a__b` never put
           them back: a silent full scan nobody could connect to either install. */
        for (const row of sql.all<{ name: string }>(
          "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'entry'",
        ))
          if (registerOfIndex(row.name) === register) sql.exec(`DROP INDEX IF EXISTS ${row.name}`);

        /* A UNIQUE INDEX OVER ROWS THAT ALREADY CLASH is a refusal, not an exception. SQLite raises
           a constraint error at CREATE, which escaped `install` as a throw. */
        for (const f of fields) {
          if (!f.unique || f.retired) continue;
          const clash = sql.one<{ v: string; c: number }>(
            `SELECT json_extract(fields, '${jsonPath(f.id)}') AS v, count(*) AS c FROM entry WHERE register = ? AND deleted_at IS NULL AND v IS NOT NULL GROUP BY v HAVING c > 1 ORDER BY c DESC LIMIT 1`,
            register,
          );
          if (clash) throw new UniqueClash(`${register}.${f.id} cannot be unique: ${clash.c} rows already say ${JSON.stringify(clash.v)}.`);
        }

        for (const statement of indexesFor(register, fields)) sql.exec(statement);

        /* THE MIRROR IS RE-DERIVED, because `entry.state` is a copy of one field and a copy that is
           only written on write goes stale the moment the declaration names a different field. The
           index on `state` and a `where:` over the field itself would then answer differently, which
           is the worst kind of wrong: two readings of one record, both confident. */
        const stateField = typeof decl.body.state === 'string' ? decl.body.state : null;
        sql.exec(
          stateField
            ? `UPDATE entry SET state = json_extract(fields, '${jsonPath(stateField)}') WHERE register = ?`
            : 'UPDATE entry SET state = NULL WHERE register = ?',
          register,
        );
      }

      out.push({ id: decl.id, version, changed: true });
    }

    return ok(out);
  });
  }
}

/**
 * Retire a declaration: the row stays, and `retired` says it is no longer active.
 *
 * NOT A DELETE, and the reason is the same one that makes a new version a new row: an event written
 * two years ago is about a shape, and a record that cannot say what that shape was cannot read its
 * own history.
 */
export function retireDeclarations(sql: Sql, ids: readonly string[], transaction: <T>(fn: () => T) => T): Result<number> {
  return transaction(() => {
    let n = 0;
    for (const id of ids) {
      const hit = sql.one<{ version: number }>(
        'SELECT version FROM declaration WHERE id = ? AND superseded_at IS NULL AND retired = 0',
        id,
      );
      if (!hit) continue;
      sql.exec('UPDATE declaration SET retired = 1 WHERE id = ? AND version = ?', id, hit.version);
      /* AND ITS INDEXES GO WITH IT. A retired register whose unique index stayed behind went on
         refusing duplicates in a register that, as far as every reader is concerned, is not there —
         a refusal citing a rule nobody can look up. */
      if (id.startsWith('register.')) {
        const register = id.slice('register.'.length);
        for (const row of sql.all<{ name: string }>(
          "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'entry'",
        ))
          if (registerOfIndex(row.name) === register) sql.exec(`DROP INDEX IF EXISTS ${row.name}`);
      }
      n++;
    }
    return n === 0 && ids.length > 0
      ? no<number>('DECLARATION_UNKNOWN', `None of ${ids.join(', ')} is installed.`)
      : ok(n);
  });
}

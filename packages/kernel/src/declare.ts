/**
 * Installing a declaration, which is how a record learns what it holds.
 *
 * A DECLARATION ROW IS NEVER EDITED. A new version is a NEW ROW, and the previous one is stamped
 * `superseded_at` in the same transaction. That is not bookkeeping: a `.brain` export replays the
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

import { MEASURES_LISTED } from './measures.ts';
import type { Refusal, Result, Sql } from '@braindog/ports';
import { clash, no, ok } from '@braindog/ports';
import { compile, INBOX_RAW, INBOX_RAW_REFUSES, jsonPath, parseWhere, type Predicate } from '@braindog/where';

import { FIELD_TYPES, coerce, isAbsent, isCurrencyCode, looksLikeCredential, measure, range, type FieldDecl, type Json } from './coerce.ts';
import { jcs } from './jcs.ts';
import { instant } from './migrate.ts';
import { INSTRUCTIONS_BODY, SESSION_BODY } from './migrations/0044_seat.ts';
import { checkInterval, intervalMs, type PullDecl } from './pull.ts';
/* A SCHEDULED ACTION'S KEY AND CLOCK, read by the runner from the same lists this file checks against. */
import { ACTION_AUTH_KINDS, reservedKeyHeader } from './actions.ts';
import { timeOf } from './clock.ts';
/* A FIELD WORKED OUT AT READ: its rule, asked in `fieldRules`, and the test every other key here puts to a field it names. */
import { deriveFault, isDerived, shapeOf, sourcesOf, type DeriveField } from './derive.ts';
import { isZone } from './slot.ts';
import { scriptBody } from './script.ts';
/* A JOB KIND'S LINT, in the file that keeps the queue which reads it, so the kind the owner approves is the kind a
   runner is handed. */
import { jobBody } from './jobs.ts';
/* THE SCHEMA THE MATCHER RUNS AGAINST, so the names this file refuses and the names that fire are
   one list. See `MATCH_FIELDS`: they were two lists and they disagreed. A same-package edge, which
   `31 §2`'s order is not about. `DATE_FORMATS` used to come over it for the same reason — a
   `date:` form this file accepted was one `day` could read — and is gone with the list itself:
   the reader a record hands down reads the token set, so there is no shorter list to agree with. */
import { MAP_TYPES } from './map.ts';
/* THE LIST `arrive` ANSWERS BY, so a value this file lets through is one the kernel has an answer for. */
import { ON_CONFLICTS } from './ingest.ts';
import { STRIP_MOST } from './ingest.ts';
import { HOME_CURRENCY_SETTING, convertMinor, homeFrom, rateFor } from './fx.ts';
import { AGENT_ROLES, HOLDS, PARTS as ROLE_PARTS, aims, legacyShaped, plays, type RoleField, type RoleKey, type RoleList, type RoleName } from './roles.ts';
/* THE FUNCTION THE REMINDERS ARE DERIVED WITH, so an offset this file accepts is one `remindersFor`
   can read. A copy of its regular expression here would be a second list, and `MATCH_FIELDS` above
   is what two lists that disagree cost. */
import { BYDAY, FREQ, shiftFrom } from './schedule.ts';
import { pairsFault } from './pairs.ts';
/* THE VALUES `delete:` TAKES, from the file that keeps the rule, so the check and the reader hold one list. */
import { DELETE_RULES } from './referenced.ts';
import { spanMs } from './keychain.ts';
import { actionsOf, callFault, flowFault, sealedAs, subjectOf } from './flow-lint.ts';
import { boardFault, widgetFault } from './board.ts';
import { untilFault } from './until.ts';
import { BLOCK_INSTALLS, BLOCK_KEY, FILTER_OPTIONS_FEWEST, FILTER_OPTIONS_MOST, FILTER_CONTROLS, FILTER_TYPES, FILTERS_MOST, NAV_KEYS, PAGE_KEYS, PAGE_UNBUILT, actionsFault, feedSaysFault, forecastAxisFault, keyedBlocks, keysFor, kindsReading, kpisFault, noteSaysFault, unreadBlockKey, unreadPageKey, whenTreeFault, wrongKindKey } from './block-keys.ts';
import { LOOK_BASIS_BYTES, LOOK_BY, LOOK_GROUPS_MOST, LOOK_HEADLINE_BYTES, LOOK_KEYS, LOOK_KEYS_MOST, LOOK_NEXT_BYTES, lookPlacesFault, withoutHoles } from './compose.ts';
/* A GLYPH NAMED THAT THE RENDERER HAS NOT, refused with the nearest names it has (`glyph-names.ts`). */
import { glyphFault } from './glyph-names.ts';
/* A PAGE'S HEAD, checked by the file that reads it (`page-head.ts`). */
import { headerFault } from './page-head.ts';
/* THE KINDS THAT READ THEMSELVES, admitted into `BLOCK_KINDS` and asked to check their own blocks at install. */
import { BLOCK_KIND_MODULES, kindModule } from './kinds/index.ts';
/* THE PAGE WORDS THE INSTALL AND THE READ REFUSE IN ONE SENTENCE: a section's host panel, a path's short view and a roadmap's columns. */
import { panelFault, roadmapFault, shortFault } from './kinds/words.ts';
import type { FlowDecl } from './rules.ts';
import { alsoFault, linkFault } from './rule-link.ts';
/* THE FORMAT, THE WINDOW AND THE TWO FIGURES THAT ARE NOT A SUM, checked here by the same functions that read them. */
import { clockOf, isMoneyFormat, isRatioOf, isSumOf, kindOf, pastFault, sumOfFault, TREND_AHEAD_MOST, windowMs, type EvalContext, type MetricDecl, type SumOf } from './metrics.ts';
import { restatesFault } from './restates.ts';
import { WALKS, WALK_SOURCE, crosscheckFault, isCrosscheck, isRolled, rolledFault, walksToZero, type Rolled } from './money-figures.ts';
import { INDEX_CEILING } from './observe.ts';
import { SOURCE_MODULES, sourceModule } from './sources/index.ts';
import { DEADLINES_GROUP } from './sources/deadlines.ts';
import { cardFactFault } from './card-facts.ts';

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

/* `script` IS THE NINTH, and migration 12 rebuilds the CHECK that holds the database to this list. A person's or an
   agent's code, run by a host in a sandbox and never by the record (`script.ts`).
   `job` IS THE TENTH, and migration 18 rebuilds the same CHECK again: what one run of Claude Code on the owner's own
   machine may do, approved once in Decide and claimed from the record's queue by a runner (`jobs.ts`).
   `look` IS THE ELEVENTH: what a page leads with, its order, what it hides and its next action, laid
   over the page as it is read (`compose.ts`). The CHECK that holds the database to this list takes it in the migration
   after 23. */
export const KINDS = ['register', 'page', 'block', 'ingest', 'rule', 'metric', 'theme', 'digest', 'script', 'job', 'look'] as const;

/**
 * WHAT A FIGURE COUNTS OVER, BEFORE THE DOT: a list's rows (`register.<id>`), a series' points (`series.<id>`) or the
 * kernel's own log of what was written to a list (`events.<id>`). These are the kernel's words, so a reader that says
 * `events` names the log and nobody's list.
 */
export const METRIC_SOURCE_KINDS = ['register', 'series', 'events'] as const;
const METRIC_SOURCE = new RegExp(`^(?:${METRIC_SOURCE_KINDS.join('|')})\\.[a-z][a-z0-9_-]*$`, 'u');
export type DeclKind = (typeof KINDS)[number];

export type Declaration = {
  /** `register.obligations` — the kind and the id, which is the form a person says. */
  id: string;
  kind: DeclKind;
  body: Record<string, Json>;
  pack?: string | undefined;
};

/* RFC 8785 CANONICAL JSON IS `jcs.ts`'s, so a reader that only hashes a body does not carry the validator below. */
export { jcs };

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

/**
 * What the record stores as more than one value, and therefore cannot compare as one.
 *
 * SEPARATE FROM `PARTS`, BECAUSE THEY ANSWER DIFFERENT QUESTIONS. `PARTS` names the two types that
 * index in halves, which is about `indexesFor`. This names every type whose stored value is a JSON
 * object or array, which is about what the write path's clash check may bind as a SQLite parameter.
 * The `unique:` guard asked `PARTS` and so only ever covered two of the five.
 */
const COMPOSITE = new Set(['money', 'quantity', 'list', 'file', 'json']);

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

  /* `prose` IS ONLY EVER `slash` (42 §4.11). Anything else is a host nobody has, and the digest
     would wait behind a model that was never going to answer. */
  if (body.prose !== undefined && body.prose !== 'slash')
    return bad('DECLARATION_INVALID', `A digest's prose is written by Slash or by nobody.`, 'prose', ['slash']);

  return null;
}

/** `08 §2`'s table, closed. A `format` outside these is a figure nothing knows how to draw. */
/* `day` is a figure that IS a day, the earliest or latest of a day field or the day a walk goes under (`zero_on`),
   held as whole days since 1970. */
const FORMATS = ['int', 'decimal', 'pct', 'days', 'duration', 'day'] as const;

/** `08 §2`: `previous` · `year_ago` · `none`, and the default is `previous`. */
const COMPARE = ['previous', 'year_ago', 'none'] as const;

/** `08 §2.1`, and only ever beside a date `group_by`. */
const BUCKETS = ['day', 'week', 'month', 'quarter', 'year'] as const;

/** The last place a figure may take among the Home figures (`home: 1` to this). `figures.home` in `pages.ts` draws the first of them. */
const HOME_PLACE_MOST = 9;

/** The most legs one figure over the walk may name: each is a list read whole, up to the walk's own row cap. */
const WALK_LEGS_MOST = 12;

/**
 * What a running total adds up, and what it walks in order of, by field type. The sums are the types `metrics.ts`'s
 * `sum` reads as a number, less a yes or no: a length of time and a quantity add up as an `int` does.
 */
const RUNNING_SUMS: readonly string[] = ['money', 'int', 'decimal', 'duration', 'quantity'];
const RUNNING_ORDERS: readonly string[] = ['day', 'instant', 'int', 'decimal'];

/**
 * A RUNNING TOTAL'S OR A TREND'S OWN SHAPE, which needs no record to check.
 *
 * `running: { sum, order, until: { gte } }` and `trend: { of, ahead }` are the two shapes `metrics.ts` reads that name
 * their parts inside one object, so `valueFields` reads nothing out of them and every part went unasked. Each refusal
 * says the part and writes the shape out, because the author has the reference open and a word out of place in it.
 *
 * `ahead` IS BOUNDED HERE AND NOT BY THE READER. `trendOf` holds every bucket ahead at ten times the last full one, so
 * a trend asked a hundred buckets ahead is ninety of the same capped number, drawn as a forecast.
 */
function shapeFault(id: string, value: unknown, groupBy?: unknown): Refusal | null {
  const v = value as { running?: unknown; trend?: unknown };
  if (v.running !== undefined) {
    const r = v.running as { sum?: unknown; order?: unknown; until?: unknown } | null;
    const written = `running: { sum: <a money or number field>, order: <a day or number field> }`;
    if (r === null || typeof r !== 'object' || Array.isArray(r))
      return bad('VALUE_MALFORMED', `${id}'s running total names what it adds up and the order it walks in: ${written}.`, 'value');
    for (const part of ['sum', 'order'] as const)
      if (typeof r[part] !== 'string' || r[part] === '')
        return bad('VALUE_MALFORMED', `${id}'s running total has no ${part}, the field it ${part === 'sum' ? 'adds up' : 'walks in order of'}. Write ${written}.`, 'value');
    const until = r.until as Record<string, unknown> | null | undefined;
    if (until !== undefined && (until === null || typeof until !== 'object' || Array.isArray(until) || Object.keys(until).join() !== 'gte' || until.gte === null || until.gte === ''))
      return bad('VALUE_MALFORMED', `${id}'s running total stops at the first entry that reaches a line, written until: { gte: <n> }. Leave until out to add up to the end.`, 'value');
    /* ONE TOTAL, WALKED ONCE. Cut into parts it would be a total for each, and the reader answers one. */
    if (groupBy !== undefined)
      return bad('DECLARATION_INVALID', `${id} is a running total grouped by ${String(groupBy)}, and a running total is one number walked in one order. Leave group_by out, and narrow it with where.`, 'group_by');
  }
  /* A STREAK NAMES THE DAY EACH ENTRY FALLS ON AND WHAT IT COUNTS IN A ROW, both optional, and is one run, never cut. */
  const streak = (value as { streak?: unknown }).streak;
  if (streak !== undefined) {
    const k = streak as { on?: unknown; grain?: unknown } | null;
    const written = 'streak: { on: <a day or instant field>, grain: day or week }';
    if (k === null || typeof k !== 'object' || Array.isArray(k) || Object.keys(k).some((key) => key !== 'on' && key !== 'grain'))
      return bad('VALUE_MALFORMED', `${id}'s streak names the day each entry falls on and what it counts in a row: ${written}.`, 'value');
    if (k.on !== undefined && (typeof k.on !== 'string' || k.on === '')) return bad('VALUE_MALFORMED', `${id}'s streak names its day field by its id: ${written}.`, 'value');
    if (k.grain !== undefined && k.grain !== 'day' && k.grain !== 'week') return bad('VALUE_MALFORMED', `${id}'s streak counts days or weeks in a row: write grain: day or grain: week.`, 'value');
    if (groupBy !== undefined) return bad('DECLARATION_INVALID', `${id} is a streak grouped by ${String(groupBy)}, and a streak is one run of days. Leave group_by out, and narrow it with where.`, 'group_by');
  }
  if (v.trend !== undefined) {
    const t = v.trend as { of?: unknown; ahead?: unknown } | null;
    if (t === null || typeof t !== 'object' || Array.isArray(t) || typeof t.of !== 'string' || !METRIC_ID.test(t.of))
      return bad('VALUE_MALFORMED', `${id}'s trend has no of, the figure it is read from, named by its id: trend: { of: <a figure cut by month>, ahead: 3 }.`, 'value');
    if (Object.hasOwn(t, 'ahead') && !(Number.isInteger(t.ahead) && (t.ahead as number) >= 1 && (t.ahead as number) <= TREND_AHEAD_MOST))
      return bad('OUT_OF_BOUNDS', `${id}'s trend reads ${JSON.stringify(t.ahead ?? null)} ahead, and ahead is a whole number of buckets from 1 to ${TREND_AHEAD_MOST}. Write ahead: 3.`, 'value');
  }
  return null;
}

/** Every `{ lookup: name }` inside a metric's value, however deep the operand sits. */
function lookupsNamed(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) for (const v of value) lookupsNamed(v, out);
  else if (value !== null && typeof value === 'object')
    for (const [key, v] of Object.entries(value)) {
      if (key === 'lookup' && typeof v === 'string') out.add(v);
      else lookupsNamed(v, out);
    }
  return out;
}

/**
 * A metric declaration, checked against `08 §2`.
 *
 * NOTHING CHECKED ONE. `validate` deep-checked a register, a digest, a connector and a rule, and
 * returned `null` for a metric — so every key in `08 §2`'s table was advisory. A metric with no
 * `target` installed and drew a number nobody could act on; a `format` no renderer knew reached the
 * renderer as an unresolved figure; `compare: 'last'` fell through the evaluator's
 * if-chain and silently compared against nothing.
 *
 * `08 §2` MARKS `target` AND `window` REQUIRED IN BOLD, and `04 §5` gives the reason as the
 * refusal's own sentence: *"a number with no target is decoration; a number with no comparison
 * window cannot be acted on."* That is the whole argument for this product having metrics rather
 * than counters, and it was enforced nowhere.
 */
function metricBody(decl: Declaration, installed?: Known): Refusal | null {
  const body = decl.body as {
    source?: unknown;
    value?: unknown;
    format?: unknown;
    target?: unknown;
    window?: unknown;
    compare?: unknown;
    group_by?: unknown;
    bucket?: unknown;
    lookups?: unknown;
    within?: unknown;
    where?: unknown;
    legs?: unknown;
    opening?: unknown;
    home?: unknown;
    sellable?: unknown;
    vital?: unknown;
  };
  const id = decl.id;

  /* `register.<id>` OR `series.<id>` (`08 §2`, `25 §8`), OR THE WALK AHEAD, `forecast.runway` (`money-figures.ts`), OR
     THE AGENT DOOR'S OWN SIGNS, `record.door` (`built-in-figures.ts` readDoor, named by the figure's `sign`). A bare
     register name is the commonest mistake and the evaluator reads it as none of them. */
  if (
    typeof body.source !== 'string' ||
    (body.source !== WALK_SOURCE && body.source !== 'record.door' && !METRIC_SOURCE.test(body.source))
  )
    return bad(
      'DECLARATION_INVALID',
      `${id} reads ${JSON.stringify(body.source ?? null)}; a metric's source is ${METRIC_SOURCE_KINDS.map((k) => `${k}.<id>`).join(', ')}, ${WALK_SOURCE} or record.door.`,
      'source',
    );

  if (body.value === null || typeof body.value !== 'object')
    return bad('DECLARATION_INVALID', `${id} has no value, so there is nothing to compute.`, 'value');

  /**
   * A `within` IS THE READER'S KEY, AND A DOCUMENT THAT WRITES ONE BY HAND IS REFUSED HERE.
   *
   * `MetricDecl.within` in `metrics.ts` names this function as the place this belongs and calls its own
   * sentence *"a convention rather than an invariant"* until it does. Driven against this file before
   * the check existed: `{where: 'state is open', within: 'party is HMRC'}` installed with `validate`
   * answering `null`, because a metric body has no unknown-key check at all. Then the demo's own
   * `project-owed` body with its parameter written in by hand, `where: 'state is open, direction is
   * owed to me, thing is Kiln'` beside `within: 'thing is Kiln, thing is Tallow'`, read `rows: 3,
   * held: 0, value: 498000` with no refusal on either engine, and the browser's `tileOf` answered
   * `{"value":"GBP 4,980.00","note":"no more than GBP 10,000.00"}` with no `tone` and no `href`:
   * `news-live.ts` and `page-live.ts` both take `(held ?? rows) === 0` for a list nobody has written
   * to, so that is GBP 4,980.00 over three real rows with the verdict and the drill-in withheld and
   * nothing else on the screen disagreeing.
   *
   * REFUSED OUTRIGHT RATHER THAN ADMITTED ON A TEMPLATE, which was the other candidate. `fill` in
   * `pages.ts` is the only writer, and it writes the key on the COPY it hands the evaluator, so a
   * template carrying one in its stored body has it overwritten the moment it is read: measured,
   * `where: 'state is open, thing is {{it}}'` with `within: 'party is HMRC'` came back from `fill` as
   * `within: ' thing is Kiln'`. A key discarded on every read can only drift from what is counted.
   * Where it is NOT overwritten it is the hole itself: with the parameter inside an `any`, `scopeOf`
   * answers nothing, and the hand-written `within: 'party is HMRC'` survived `fill` intact, naming a
   * clause the filter never had. The third candidate, refusing a `within` that leaves `held` under
   * `rows`, cannot be decided here at all, because it needs the rows: `42 §5.3` files a check that
   * reads no installed state as class B, and class B is what this function is.
   */
  if (body.within !== undefined)
    return bad(
      'DECLARATION_INVALID',
      `${id} writes within, and within is the scope a parameter cut rather than a key a document carries: the reader derives it from where when it fills {{it}}. Write the clause in where.`,
      'within',
    );

  /* THE FACTOR TABLES TRAVEL IN THE BODY (`metrics.ts`, `MetricDecl.lookups`), so a figure that
     multiplies by one is refused here when it does not carry it. Installed without, it read
     `LOOKUP_UNKNOWN` on every record whose host had no table to hand in, which was all of them. */
  const tables = body.lookups;
  if (tables !== undefined) {
    if (tables === null || typeof tables !== 'object' || Array.isArray(tables))
      return bad('DECLARATION_INVALID', `${id}'s lookups are named tables: { per_year: { monthly: 12, yearly: 1 } }.`, 'lookups');
    const named = Object.entries(tables as Record<string, unknown>);
    if (named.length > 8) return bad('DECLARATION_INVALID', `${id} carries ${named.length} factor tables, and a figure reads at most 8.`, 'lookups');
    for (const [name, table] of named) {
      const rows = table !== null && typeof table === 'object' && !Array.isArray(table) ? Object.entries(table as Record<string, unknown>) : null;
      if (!/^[a-z][a-z0-9_]{0,31}$/u.test(name) || !rows || rows.length === 0 || rows.length > 64 || rows.some(([key, n]) => key.length > 64 || typeof n !== 'number' || !Number.isFinite(n)))
        return bad('DECLARATION_INVALID', `${id}'s lookup ${name} is a name, then up to 64 values each with a number as its factor.`, 'lookups');
    }
  }
  for (const name of lookupsNamed(body.value))
    if (!(tables !== null && typeof tables === 'object' && Object.hasOwn(tables, name)))
      return bad('LOOKUP_UNKNOWN', `${id} multiplies by ${name} and carries no table of that name. Add it under lookups.`, 'lookups');

  /**
   * AN OPERAND'S OWN `where:` OR `source:` WAS DROPPED, AND THE FIGURE CAME BACK AS THE OUTER ONE.
   *
   * `metrics.ts`'s `read` runs both halves of a ratio against ONE compiled predicate and one
   * parameter list, and `aggregationsOf`'s inner `flat` reads `Object.entries(agg)[0]` — the first
   * key only. So a second key on an operand is not seen by the evaluator and not seen here either.
   * Driven over three rows summing GBP 700 with `count: id` of 3:
   *
   *     ratio, operand carries its own where:   {"value":233.33333333333334,"rows":3,"refusals":[]}
   *     ratio, operand carries its own source:  {"value":233.33333333333334,"rows":3,"refusals":[]}
   *     ratio with no operand keys (control)    {"value":233.33333333333334,"rows":3,"refusals":[]}
   *
   * All three the same number. `where: { field: party, is: Halden }` selected one row of the three
   * and was discarded; `source: 'register.campaign_day'`, a different register entirely, was
   * discarded the same way. The author reads a figure they believe is scoped and it is not — which
   * is `metrics.ts`'s own worst case ("a figure of the right size in the wrong currency, with
   * nothing on the screen disagreeing with anything else on it") arrived at over the wrong rows.
   *
   * `42 §4.9` IS EXACT ABOUT THE TRIGGER: *"Depth one in either direction; a `where` or `source`
   * key inside an operand is `RATIO_MIXED_SOURCE`."* `42 §5.3·19` files it class B, so it needs no
   * installed state and belongs here rather than beside the evaluator. A `diff` is checked with the
   * ratio because `§4.9` defines one operand for both and `read` drops the key for both.
   */
  const combined = body.value as { ratio?: unknown; diff?: unknown };
  const pair = combined.ratio ?? combined.diff;
  if (pair !== null && typeof pair === 'object')
    for (const half of ['of', 'per'] as const) {
      const operand = (pair as Record<string, unknown>)[half];
      if (operand === null || typeof operand !== 'object') continue;
      if (Object.keys(operand).some((key) => key === 'where' || key === 'source'))
        return bad('RATIO_MIXED_SOURCE', `${id}: both operands must share one source and one predicate.`, 'value');
    }

  /* HOW LONG `past` WAITS IS READ HERE AS THE READER READS IT, so a `by` that is no number of days is refused once, at
     install, and not on every read of a figure that went in. */
  const waits = pastFault(body.value);
  if (waits !== null) return bad('VALUE_MALFORMED', `${id}: ${waits}.`, 'value');

  /* `money`, OR `money.<CUR>` FROM BEFORE A FIGURE COULD LEAVE ITS CURRENCY UNSAID. `02 §3` is why a money figure is
     never a bare number, and it is still not one: the currency is the record's home currency, else the one its rows are
     in, else one amount per currency (`metrics.ts` `evaluateMetric`). A pack cannot know which currency the record it
     lands on keeps, so a currency in its format was the pack author's and nobody else's. */
  const format = body.format;
  if (!isMoneyFormat(format) && !(FORMATS as readonly unknown[]).includes(format))
    return bad(
      'DECLARATION_INVALID',
      `${id}'s format is ${JSON.stringify(format ?? null)}. A metric is money, ${FORMATS.join(', ')}.`,
      'format',
      [...FORMATS, 'money', 'money.<CUR>'],
    );

  /* WHERE A FIGURE STANDS AMONG THE HOME FIGURES, AND WHETHER A FORECAST MAY SELL IT. A place is a
     whole number from 1 to 9 so two packs can interleave; `sellable` is `true` or absent, never `false`, so the one
     spelling means one thing. */
  if (body.home !== undefined && !(Number.isInteger(body.home) && (body.home as number) >= 1 && (body.home as number) <= HOME_PLACE_MOST))
    return bad('DECLARATION_INVALID', `${id}'s home is its place among the Home figures, a whole number from 1 to ${HOME_PLACE_MOST}.`, 'home');
  if (body.sellable !== undefined && body.sellable !== true)
    return bad('DECLARATION_INVALID', `${id}'s sellable is true, or left out.`, 'sellable', ['true']);

  /* CASH ROLLED FORWARD is read over a list of accounts, and its body names every field it reads. */
  const walks = body.source === WALK_SOURCE;
  /* A SUM OF FIGURES IS CHECKED AT INSTALL against what is installed, the one check the reader makes too (`metrics.ts`). */
  if (isSumOf(body.value) && installed !== undefined) {
    const self = String((decl.body as { metric?: unknown }).metric ?? id.replace(/^metric\./u, ''));
    const fault = sumOfFault(body.value, self, (part) => (installed.get(`metric.${part}`) as unknown as MetricDecl | undefined) ?? null);
    if (fault) return bad('DECLARATION_INVALID', `${id}: ${fault}`, 'value');
  }
  /* AND EACH HALF OF A SHARE OF FIGURES, the same check, since each is read as a sum (`readRatioOf`). */
  if (isRatioOf(body.value) && installed !== undefined) {
    const self = String((decl.body as { metric?: unknown }).metric ?? id.replace(/^metric\./u, ''));
    const r = (body.value as { ratio_of?: { of?: unknown; per?: unknown } }).ratio_of;
    for (const half of [r?.of, r?.per]) {
      const fault = Array.isArray(half)
        ? sumOfFault({ sum_of: half } as SumOf, self, (part) => (installed.get(`metric.${part}`) as unknown as MetricDecl | undefined) ?? null)
        : 'a share of figures names both halves, as ratio_of: { of: [{ metric: a }], per: [{ metric: b }] }';
      if (fault) return bad('DECLARATION_INVALID', `${id}: ${fault}`, 'value');
    }
  }
  if (isRolled(body.value)) {
    if (walks || !String(body.source).startsWith('register.'))
      return bad('DECLARATION_INVALID', `${id} rolls cash forward over a list of accounts, so its source is register.<id>.`, 'source');
    const fault = rolledFault((body.value as { rolled?: unknown }).rolled);
    if (fault) return bad('DECLARATION_INVALID', `${id}: ${fault}.`, 'value');
    if (body.bucket !== undefined)
      return bad('DECLARATION_INVALID', `${id} is grouped by a field of its accounts, never cut into buckets of days.`, 'bucket');
    /* THE OLDEST DAY IS HELD AS A NUMBER OF DAYS SINCE 1970, as a walk's zero_on is, so it is drawn as a day and nothing
       else is: as money it reads as twenty thousand of a currency, and money or a count drawn as a day is 1970. */
    const reads = (body.value as { rolled: Rolled }).rolled.read;
    if ((reads === 'as_of') !== (body.format === 'day'))
      return bad(
        'DECLARATION_INVALID',
        reads === 'as_of' ? `${id} names the day its oldest balance was stated, so its format is day.` : `${id} adds up money or counts, and only the day a balance was stated (read: as_of) has format: day.`,
        'format',
        reads === 'as_of' ? ['day'] : undefined,
      );
  }

  /* A FIGURE CHECKED AGAINST ITS OWN ENTRIES names the figure and its list of accounts, and has no rows of its own to
     filter or group. Money less the same money is money, in no one currency a format could fix. */
  if (isCrosscheck(body.value)) {
    const fault = crosscheckFault(body);
    if (fault) return bad('DECLARATION_INVALID', `${id}: ${fault}.`, body.where !== undefined ? 'where' : body.group_by !== undefined ? 'group_by' : body.bucket !== undefined ? 'bucket' : 'value');
    if (body.format !== 'money') return bad('DECLARATION_INVALID', `${id} is a difference of money in whichever currency it is out in, so its format is money.`, 'format', ['money']);
  }

  /* A FIGURE OVER THE WALK AHEAD reads the legs it names, and nothing a list-reading figure writes. */
  if (!walks && (body.legs !== undefined || body.opening !== undefined))
    return bad('DECLARATION_INVALID', `${id} names ${body.legs !== undefined ? 'legs' : 'an opening'}, which only a figure over ${WALK_SOURCE} walks.`, body.legs !== undefined ? 'legs' : 'opening');
  if (walks) {
    const v = body.value as { walk?: unknown; within?: unknown };
    if (!(WALKS as readonly unknown[]).includes(v.walk))
      return bad('DECLARATION_INVALID', `${id} is a figure over the walk, and its value is walk: ${WALKS.join(', ')}.`, 'value', [...WALKS]);
    if (v.within === undefined ? !walksToZero(v.walk) : typeof v.within !== 'string' || !windowMs(v.within))
      return bad('DECLARATION_INVALID', `${id} says how far ahead it adds up as within: 30d, 4w or 3m.`, 'value');
    for (const key of ['where', 'group_by'] as const)
      if (body[key] !== undefined) return bad('DECLARATION_INVALID', `${id} walks its legs, and each leg says which rows it reads; a figure over the walk has no ${key}.`, key);
    /* A WALK OF MONEY IN OR OUT MAY BE CUT INTO CALENDAR MONTHS (money-core 3.27.0), for the months ahead of a chart of
       what moved; the days until zero and the day of it are one crossing, with nothing to cut. */
    if (body.bucket !== undefined && (body.bucket !== 'month' || walksToZero(v.walk)))
      return bad(
        'DECLARATION_INVALID',
        walksToZero(v.walk) ? `${id} is one crossing of zero, with no months to cut it into; leave bucket out.` : `${id} walks money in or out, which is cut by calendar month only: bucket: month.`,
        'bucket',
        walksToZero(v.walk) ? undefined : ['month'],
      );
    const legs = body.legs;
    if (!Array.isArray(legs) || legs.length === 0 || legs.length > WALK_LEGS_MOST)
      return bad('DECLARATION_INVALID', `${id} names between 1 and ${WALK_LEGS_MOST} legs to walk.`, 'legs');
    for (const [i, leg] of legs.entries()) {
      const l = leg as Record<string, unknown> | null;
      if (l === null || typeof l !== 'object' || Array.isArray(l) || !['register', 'on', 'amount'].every((k) => typeof l[k] === 'string' && l[k] !== ''))
        return bad('DECLARATION_INVALID', `${id}'s leg ${i + 1} names the list it walks, the day each row moves on and its amount: register, on and amount.`, `legs[${i}]`);
    }
    /* AN OPENING MAY CARRY A PARAMETER AFTER THE FIRST COLON, as a stat cell's figure does: a walk read once a book
       opens from `book-cash:{{it}}`, and the reader fills it before it looks the figure up (`readWalk`). */
    const opening = body.opening as { metric?: unknown } | undefined;
    if (walksToZero(v.walk) ? typeof opening?.metric !== 'string' || !METRIC_ID.test(metricNamed(opening.metric)) || /:\s*$/u.test(opening.metric) : opening !== undefined)
      return bad(
        'DECLARATION_INVALID',
        walksToZero(v.walk)
          ? `${id} ${v.walk === 'zero_on' ? 'names the day the money runs out' : 'counts the days until the money runs out'} from what is held now: opening: { metric: <id> }, or <id>:{{it}} for a figure read once for each of something.`
          : `${id} adds up movements, and only the days until zero and the day of it walk from an opening.`,
        'opening',
      );
    /* THE ONE HOLE A FIGURE'S PARAMETER FILLS IS `{{it}}`. `book-cash:{{name}}` installed, and nothing fills a row's
       field into a figure, so every read was refused "ask for it by name", which is not the fault. A page's own
       opening is filled from its row and is checked where a page is. */
    const from = typeof opening?.metric === 'string' ? opening.metric : '';
    const stray = from.includes(':') ? /\{\{(?!it\}\})\w+\}\}/u.exec(from.slice(from.indexOf(':') + 1))?.[0] : undefined;
    if (stray !== undefined)
      return bad('DECLARATION_INVALID', `${id} opens from a figure read about ${stray}, and a figure's own parameter is spelled {{it}}. Write opening: { metric: ${metricNamed(from)}:{{it}} }.`, 'opening');
    /* THE DAY IS HELD AS A NUMBER OF DAYS SINCE 1970, so drawn as anything but a day it is a count near twenty thousand
       beside a heading about money, and a count or an amount drawn as a day is a date in 1970. */
    if ((v.walk === 'zero_on') !== (body.format === 'day'))
      return bad(
        'DECLARATION_INVALID',
        v.walk === 'zero_on' ? `${id} names a day, so its format is day.` : `${id} adds up money or counts days, and only the day the money runs out (walk: zero_on) has format: day.`,
        'format',
        v.walk === 'zero_on' ? ['day'] : undefined,
      );
  }

  /* A VITAL SIGN IS RED WHEN ITS READING MISSES ITS TARGET, so a figure with no bound to miss would read none forever
     while saying it watches something. Checked before the general rule, so the refusal says why a sign needs one. */
  if (body.vital !== undefined) {
    if (body.vital !== true) return bad('DECLARATION_INVALID', `${id}'s vital is true, or left out.`, 'vital', ['true']);
    const bound = body.target !== null && typeof body.target === 'object' && (Object.hasOwn(body.target, 'lte') || Object.hasOwn(body.target, 'gte'));
    if (!bound)
      return bad(
        'METRIC_NEEDS_TARGET_OR_WINDOW',
        `${id} is a vital sign, and a sign turns red when its reading misses its target. Give it one, target: { lte: <n> } or target: { gte: <n> }, or take vital out.`,
        'target',
      );
  }

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
    /* A WALK IS DATED BY ITS OWN STEPS, so it cuts by month with no field to group by (checked with the walk above). */
    if (body.group_by === undefined && body.source !== WALK_SOURCE)
      return bad('DECLARATION_INVALID', `${id} buckets by ${String(body.bucket)} and groups by nothing.`, 'bucket');
  }

  /* THE GROUPING IS READ (`metrics.ts`'s `groupsOf`), so a well-formed one installs. Whether the
     field is a date, and so whether it takes a bucket, is the evaluator's to say: it has the schema. */
  const shape = shapeFault(id, body.value, body.group_by);
  if (shape) return shape;
  if (installed === undefined) return null;
  return figureListsFault(id, body, installed) ?? metricFieldFault(id, body.source, body.value, body.group_by, installed) ?? shapeReadsFault(id, body.source, body.value, installed);
}

/**
 * WHAT A RUNNING TOTAL OR A TREND NAMES, ASKED OF THE RECORD.
 *
 * A running total over a name adds nothing up, and one walked in order of a name stops at a row no one would call
 * first. A trend is a line fitted to a figure's buckets (`trend.ts`), so a figure that is one number has no line: the
 * reader refuses it by name on every read, and this refuses it once, where the author can still change it. A list or
 * a figure the record does not hold is left to the checks that already name it, except the figure a trend is of,
 * which nothing else at install looks at.
 */
function shapeReadsFault(id: string, source: unknown, value: unknown, installed: Known): Refusal | null {
  const v = value as { running?: { sum: string; order: string }; trend?: { of: string } };
  if (v.running !== undefined && typeof source === 'string' && source.startsWith('register.')) {
    const register = source.slice('register.'.length);
    const fields = (listFields(installed, register) ?? []).filter((f) => (f as { retired?: unknown }).retired !== true);
    if (fields.length > 0)
      for (const [part, field, takes, kinds] of [
        ['adds up', v.running.sum, RUNNING_SUMS, 'money or a number'],
        ['walks in order of', v.running.order, RUNNING_ORDERS, 'a day or a number'],
      ] as const) {
        const could = fields.filter((f) => takes.includes(String(f.type))).map((f) => String(f.id));
        const held = fields.find((f) => f.id === field);
        if (held === undefined) return bad('FIELD_UNKNOWN', `${id}'s running total ${part} ${field}, and ${register} has no field called ${field}.`, 'value', could);
        if (!takes.includes(String(held.type)))
          return bad(
            'VALUE_MALFORMED',
            `${id}'s running total ${part} ${field}, which is ${String(held.type)}, and a running total ${part} ${kinds}.${could.length > 0 ? ` Name one of ${could.join(', ')}.` : ''}`,
            'value',
            could,
          );
      }
  }
  if (v.trend !== undefined) {
    const of = v.trend.of;
    if (`metric.${of}` === id) return bad('DECLARATION_INVALID', `${id} is a trend of itself. Name the figure it is read from: trend: { of: <a figure cut by month> }.`, 'value');
    const read = installed.get(`metric.${of}`);
    if (read === undefined) return bad('METRIC_UNKNOWN', `${id} is a trend of ${of}, and there is no metric called ${of}.`, 'value');
    if ((read.value as { trend?: unknown } | null)?.trend !== undefined)
      return bad('DECLARATION_INVALID', `${id} is a trend of ${of}, which is itself a trend. Name the figure ${of} is read from.`, 'value');
    if (read.bucket === undefined || read.group_by === undefined)
      return bad(
        'DECLARATION_INVALID',
        `${id} is a trend of ${of}, and ${of} is one number with no buckets to fit a line to. Cut ${of} by its day, group_by: <a day field> and bucket: month, or name a figure that is.`,
        'value',
      );
  }
  return null;
}

/** Every field a metric's value names, as `metrics.ts`'s `aggregationsOf` reads them: the first key of each aggregation. */
function valueFields(value: unknown): string[] {
  const flat = (agg: unknown): string[] => {
    if (agg === null || typeof agg !== 'object') return [];
    const operand = kindOf(agg)?.[1];
    if (typeof operand === 'string') return [operand];
    const p = (operand as { product?: unknown } | undefined)?.product;
    if (!Array.isArray(p) || typeof p[0] !== 'string') return [];
    const by = (p[1] as { by?: unknown } | undefined)?.by;
    return typeof by === 'string' ? [p[0], by] : [p[0]];
  };
  const v = value as { ratio?: { of?: unknown; per?: unknown }; diff?: { of?: unknown; per?: unknown } };
  const pair = v.ratio ?? v.diff;
  return pair !== undefined && pair !== null && typeof pair === 'object' ? [...flat(pair.of), ...flat(pair.per)] : flat(value);
}

/**
 * A FIGURE OVER A FIELD ITS REGISTER DOES NOT DECLARE INSTALLED CLEAN, and was refused on every read.
 *
 * Measured: `value: { sum: 'nosuch' }` went in through an ordinary install, and `metrics.ts`'s `evaluateMetric` then
 * answered `FIELD_UNKNOWN: ledger has no field called nosuch` on every page the figure sat on. `index.ts`'s install
 * check handed the field to `unaggregatableIn`, which looks up the field's TYPE, found none, and read "no type" as "no
 * objection". `group_by: 'nosuch'` went in the same way. The predicate was never part of this: a `where` naming an
 * undeclared field is already refused at install by `unreadWhere`, which reads the five record-owned fields too, so
 * this does not look at `where`.
 *
 * THE SAME RULE THE READER KEEPS, NO WIDER. `evaluateMetric` admits `id` in a value and nothing else the
 * record owns, and admits no record-owned field as a grouping but the two instants the record stamps, created_at and
 * updated_at (metrics.ts isStamped), so a `sum: 'created_at'` accepted
 * here would be the same defect with a better-sounding name. The code is `FIELD_UNKNOWN` because it
 * is the code the reader already gives this fact, and `30 §6`'s "one code, two moments" is the
 * argument for giving it the same one at install. A source whose register is not known is left to
 * the install check's `REGISTER_UNKNOWN`, and a `series.<id>` source has no fields to check.
 */
function metricFieldFault(id: string, source: unknown, value: unknown, groupBy: unknown, installed: Known): Refusal | null {
  if (typeof source !== 'string' || !source.startsWith('register.')) return null;
  const register = source.slice('register.'.length);
  const declared = fieldsOf(installed, register);
  if (declared === null) return null;
  /* A ROLLED FIGURE READS ITS ACCOUNTS' BALANCE AND DAY, which it names in `rolled` rather than as an aggregation. */
  const rolled = isRolled(value) ? (value as { rolled: { balance: string; as_of: string } }).rolled : null;
  for (const field of rolled ? [rolled.balance, rolled.as_of] : valueFields(value))
    /* AND THE AGE OF WHEN AN ENTRY WAS MADE OR LAST WRITTEN (stands-50): `{ age: updated_at }` reads the stamp every
       entry carries, which no list declares. */
    if (field !== 'id' && !declared.includes(field) && !((field === 'created_at' || field === 'updated_at') && (value as { age?: unknown } | null)?.age === field))
      return bad('FIELD_UNKNOWN', `${id} reads ${field}, and ${register} has no field called ${field}.`, 'value', ['id', ...declared]);
  if (typeof groupBy === 'string' && !declared.includes(groupBy) && groupBy !== 'created_at' && groupBy !== 'updated_at')
    return bad('FIELD_UNKNOWN', `${id} groups by ${groupBy}, and ${register} has no field called ${groupBy}.`, 'group_by', declared);
  /* A FIELD WORKED OUT AT READ IS NOT IN THE STORE A FIGURE ADDS UP, so a figure over it would read nothing on every
     row. A figure reads the fields it is made from instead. */
  const worked = derivedOf(installed, register);
  for (const field of [...(rolled ? [rolled.balance, rolled.as_of] : valueFields(value)), ...(typeof groupBy === 'string' ? [groupBy] : [])])
    if (worked.includes(field))
      return bad(
        'DECLARATION_INVALID',
        `${id} reads ${field}, which is worked out at read and never stored, so a figure cannot add it up; read the fields ${field} is made from.`,
        field === groupBy ? 'group_by' : 'value',
        declared.filter((d) => !worked.includes(d)),
      );
  return null;
}

/** The fields of a known register that are worked out at read: declaring `derive`, or carrying the kernel's flag. */
function derivedOf(installed: Known, register: string): string[] {
  const shape = installed.get(`register.${register}`);
  if (shape === undefined || !Array.isArray(shape.fields)) return [];
  return (shape.fields as { id?: unknown; derive?: unknown; derived?: unknown }[])
    .filter((f) => f !== null && typeof f === 'object' && isDerived(f) && typeof f.id === 'string')
    .map((f) => f.id as string);
}

/**
 * The fields a known register declares and has not retired, or `null` when it is not known or declares no fields.
 *
 * NOT A RETIRED FIELD, which stays in the body and is dropped by `index.ts`'s `schemaOf`, so the reader answers
 * `FIELD_UNKNOWN` for it. Counting it here let `sum: 'old'` install and then fail on its first read, as was measured.
 */
function fieldsOf(installed: Known, register: string): string[] | null {
  const shape = installed.get(`register.${register}`);
  if (shape === undefined || !Array.isArray(shape.fields)) return null;
  return (shape.fields as { id?: unknown; retired?: unknown }[])
    .filter((f) => f?.retired !== true)
    .map((f) => f?.id)
    .filter((f): f is string => typeof f === 'string');
}

/**
 * A ROLLED FIGURE OR A WALK NAMING A LIST OR A FIELD NOBODY DECLARED INSTALLED CLEAN, and was refused on every read.
 *
 * Both read lists beyond their `source` (`money-figures.ts`): a rolled figure reads its moves and every list that
 * restarts an account, and a walk reads the list each leg names. The rolled reader asks for every list and field before
 * it reads a row and refuses a missing one. The walk refuses a missing list, and reads a missing field as empty on every
 * row, which walks a cycle once, or counts every row as money out, without a word (`forecast.ts` `runway`). So this
 * asks for each at install, in the reader's own codes, and a figure that could never be read right is never installed.
 * Unlike a figure's `source`, nothing else at install looks at these lists, so an unknown one is refused here. A `where`
 * inside `moves` or a leg is a sentence, which this file cannot parse against its list: it is first read when the
 * figure is, and the install check in `index.ts` that parses a figure's own `where` (`unreadWhere`) is the place for it.
 */
function figureListsFault(id: string, body: { source?: unknown; value?: unknown; legs?: unknown; opening?: unknown }, installed: Known): Refusal | null {
  /* THE FIGURE A WALK OPENS FROM IS ASKED FOR THE SAME WAY, and one step deep as the reader takes it: a walk that opens
     from a walk is refused on every read, so it is refused here. */
  const said = (body.opening as { metric?: unknown } | undefined)?.metric;
  /* The figure itself, without the parameter an opening read once a book carries (`book-cash:{{it}}`). */
  const opens = typeof said === 'string' ? metricNamed(said) : undefined;
  if (body.source === WALK_SOURCE && typeof opens === 'string') {
    const opened = installed.get(`metric.${opens}`);
    if (opened === undefined) return bad('METRIC_UNKNOWN', `${id} walks from ${opens}, and there is no metric called ${opens}.`, 'opening');
    if (opened.source === WALK_SOURCE) return bad('DECLARATION_INVALID', `${id} walks from a figure of what is held, and ${opens} is itself a walk.`, 'opening');
  }
  /* THE FIGURE A CROSS-CHECK CHECKS IS ASKED FOR TOO, as the reader asks: cash rolled forward, the money itself, over
     the same list of accounts. One that checked anything else would be refused on every read. */
  if (isCrosscheck(body.value)) {
    const of = String((body.value as { crosscheck: { of: unknown } }).crosscheck.of);
    const checked = installed.get(`metric.${of}`);
    if (checked === undefined) return bad('METRIC_UNKNOWN', `${id} checks ${of}, and there is no metric called ${of}.`, 'value');
    if (!isRolled(checked.value) || (checked.value as { rolled?: { read?: unknown } }).rolled?.read !== undefined)
      return bad('DECLARATION_INVALID', `${id} checks cash rolled forward, and ${of} is not that money.`, 'value');
    if (checked.source !== body.source) return bad('DECLARATION_INVALID', `${id} checks ${of}, which adds up ${String(checked.source)}, so that is its source too.`, 'source', [String(checked.source)]);
  }
  const named: { register: string; fields: unknown[]; at: string }[] = [];
  if (isRolled(body.value)) {
    const rolled = (body.value as { rolled: Rolled }).rolled;
    named.push({ register: rolled.moves.register, fields: [rolled.moves.by, rolled.moves.on, rolled.moves.amount, rolled.moves.direction], at: 'value' });
    for (const check of rolled.checks ?? []) named.push({ register: check.register, fields: [check.by, check.balance, check.on], at: 'value' });
  }
  if (body.source === WALK_SOURCE && Array.isArray(body.legs))
    for (const [i, leg] of (body.legs as Record<string, unknown>[]).entries()) {
      const incoming = leg.incoming as { field?: unknown } | undefined;
      const every = leg.every as { field?: unknown } | undefined;
      named.push({ register: String(leg.register), fields: [leg.on, leg.amount, leg.ends, leg.group, incoming?.field, every?.field], at: `legs[${i}]` });
    }
  for (const { register, fields, at } of named) {
    if (!installed.has(`register.${register}`)) return bad('REGISTER_UNKNOWN', `${id} reads ${register}, and there is no register called ${register}.`, at);
    const declared = fieldsOf(installed, register) ?? [];
    for (const field of fields)
      if (typeof field === 'string' && !declared.includes(field))
        return bad('FIELD_UNKNOWN', `${id} reads ${field}, and ${register} has no field called ${field}.`, at, declared);
  }
  return null;
}

/**
 * The drawn kinds, WRITTEN OUT here rather than imported, and the dependency graph is why.
 *
 * `packages/render` owns `KINDS` and is the authority (`05 §2`), but the
 * kernel depends on `ports` and `where` and on nothing else — `31 §2` puts the renderer above it, so
 * importing the table would invert the layering and make the record unable to install a page without
 * a browser bundle in scope. The alternative to a copy is no check at all, and no check is what a
 * page has had: `readBlock` compares `block.kind` to nothing, so a block whose kind is a typo and has
 * no `source` comes back as `base` — no rows, no refusal, no mark on the page — and one WITH a source
 * comes back with rows filed under a kind the renderer cannot draw. A block that draws NOTHING and
 * says nothing is the exact silence `04 §1` calls the closure load-bearing for.
 *
 * A COPY THAT DRIFTS IS WORSE THAN NO COPY, AND A COUNT IN PROSE IS THE FIRST THING TO DRIFT. This list said "the
 * twenty" in two refusals and in this paragraph while holding twenty-eight, because every kind added since was added to
 * the array and not to the sentence. So neither says a number now, and the test walks the array rather than a list
 * typed out beside it. `cards`, `section`, `feed`, `diff`, `queue`, `capture` and `inputs` were added to the renderer's
 * table and then to this array by hand. A PACK'S OWN KIND, `block.<id>`, WAS ADMITTED HERE BY PREFIX and is refused
 * now: `05 §2` says one arrives as a `block` declaration, this build refuses every such declaration
 * `NOT_IN_THIS_BUILD`, and a page naming one installed and read its rows with nothing anywhere to draw them.
 *
 * A NEW KIND IS NOT WRITTEN INTO THE ARRAY: it is a module in the kernel's kind registry (`kinds/index.ts`), and every
 * name that registry holds is admitted here as it loads. The array is the kinds `pages.ts` reads itself, and it stays
 * as it is so nothing that already installs moves. A name in both is one kind.
 *
 * EXPORTED FOR THE RECORD'S SHARED-LINK TEST, which walks every kind a link may draw and asks that none sends an amount
 * on a link with money off (`packages/record/test/shared-page.test.ts`), so a kind added later is asked too.
 */
export const BLOCK_KINDS: readonly string[] = [
  ...new Set([
    'note', 'quote', 'stat', 'bar', 'gauge', 'chips', 'spec', 'params',
    'todo', 'steps', 'timeline', 'board', 'code', 'tree', 'comparison', 'table', 'cards', 'section', 'feed', 'diff',
    'sparkline', 'split', 'bridge', 'series', 'forecast', 'agents', 'lines', 'progress', 'queue', 'capture', 'roadmap', 'ring', 'heat',
    'inputs', 'kpis',
    ...Object.keys(BLOCK_KIND_MODULES),
  ]),
];

/** A register id as a block names one on its own, with no `register.` in front: the half `SOURCE` checks after the dot. */
const REGISTER_ID = /^[a-z][a-z0-9_-]{0,31}$/u;

/** A kind a pack declares, as a page names it: `block.` and the declaration's own id (`blockBody` below). */
const PACK_KIND = /^block\.[a-z][a-z0-9_-]{0,31}$/u;

/**
 * The primitives a pack's kind may draw on, `packages/render/src/kinds.ts`'s `PRIMITIVES` less two, copied for the reason
 * `BLOCK_KINDS` is. `table` is bound to a register and `media` to code the renderer holds, so a kind a pack invents on
 * either would be a declaration whose rows nothing can draw.
 */
const PACK_PRIMITIVES: readonly string[] = ['panel', 'grid', 'rows', 'proportional', 'inline', 'list'];

/** The add-block picker's groups, render's `KindSpec.purpose`, which a pack's kind is listed under. */
const PACK_PURPOSES: readonly string[] = ['say', 'figure', 'list', 'plan', 'media'];

/** A block declaration's own keys, closed as a page's are, so a misspelt key is named rather than read by nothing. */
const PACK_BLOCK_KEYS: readonly string[] = ['block', 'title', 'primitive', 'cells', 'optional', 'tone', 'rows', 'header', 'ordered', 'minSpan', 'purpose', 'note'];

/** The widest row a pack's kind takes, the most rows it may draw, and the longest title the picker shows. */
const PACK_CELLS_MAX = 8;
const PACK_ROWS_MAX = 200;
const PACK_TITLE_MAX = 60;

/**
 * A `block.<id>` declaration: a kind a pack invents, drawn by one of the renderer's primitives from the spec it declares.
 *
 * THE SPEC IS THE KIND, so every number in it is checked here and not at render. A `cells: 0` grid draws every row as
 * an arity fault, a `minSpan: 13` is a width no page has, and a purpose the picker does not group under hides the kind
 * from the one place a person would look for it. Each is refused with the key named, as a page's keys are, so the pack
 * author hears at install what a reader would otherwise be the first to hear.
 */
function blockBody(decl: Declaration): Refusal | null {
  const body = decl.body as Record<string, unknown>;
  const id = decl.id;
  for (const key of Object.keys(body))
    if (!PACK_BLOCK_KEYS.includes(key))
      return bad('DECLARATION_INVALID', `${id} declares ${key}:, which a block kind does not take.`, key, PACK_BLOCK_KEYS);

  const whole = (v: unknown, lo: number, hi: number): boolean => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;

  if (typeof body.title !== 'string' || body.title.trim() === '' || body.title.length > PACK_TITLE_MAX)
    return bad('DECLARATION_INVALID', `${id} needs a title of 1 to ${PACK_TITLE_MAX} characters, the name the add-block picker lists it by.`, 'title');
  if (typeof body.primitive !== 'string' || !PACK_PRIMITIVES.includes(body.primitive))
    return bad(
      'DECLARATION_INVALID',
      body.primitive === 'table' || body.primitive === 'media'
        ? `${id} draws on ${body.primitive}, whose kinds are bound to a register or to code this build holds. Use one of the six the others draw on.`
        : `${id}: primitive ${JSON.stringify(body.primitive ?? null)} is not one a pack's kind can draw on.`,
      'primitive',
      PACK_PRIMITIVES,
    );
  if (!whole(body.cells, 1, PACK_CELLS_MAX))
    return bad('DECLARATION_INVALID', `${id}: cells is how many cells a row takes, a whole number from 1 to ${PACK_CELLS_MAX}.`, 'cells');
  if (body.optional !== undefined && !whole(body.optional, 0, (body.cells as number) - 1))
    return bad('DECLARATION_INVALID', `${id}: optional is how many cells a row may leave off, a whole number below cells.`, 'optional');
  for (const flag of ['tone', 'header', 'ordered'] as const)
    if (body[flag] !== undefined && typeof body[flag] !== 'boolean')
      return bad('DECLARATION_INVALID', `${id}: ${flag} is true or false.`, flag);
  if (body.rows !== undefined && !whole(body.rows, 1, PACK_ROWS_MAX))
    return bad('DECLARATION_INVALID', `${id}: rows is the most rows the kind draws, a whole number from 1 to ${PACK_ROWS_MAX}.`, 'rows');
  if (!whole(body.minSpan, 1, 12))
    return bad('DECLARATION_INVALID', `${id}: minSpan is the narrowest the kind stays legible at, a whole number of twelfths from 1 to 12.`, 'minSpan');
  if (typeof body.purpose !== 'string' || !PACK_PURPOSES.includes(body.purpose))
    return bad('DECLARATION_INVALID', `${id}: purpose is the add-block picker's group the kind is listed under.`, 'purpose', PACK_PURPOSES);
  if (body.note !== undefined && typeof body.note !== 'string')
    return bad('DECLARATION_INVALID', `${id}: note is a sentence saying what the kind is for.`, 'note');
  return null;
}

/**
 * What a column is on a card, `packages/render/src/cards.ts`'s `CARD_ROLES`, copied for the reason
 * `BLOCK_KINDS` is. A card takes one of each role and up to three facts, as `cardFault` there says.
 */
/* `next` IS THE FIRST OPEN STEP UNDER THE CARD, a field of the list whose rows are its steps (`pages.ts` `nextsOf`), and
   `reply` is a field drawn under the card's title in a quieter voice, the second opinion under a note. */
const CARD_ROLES = ['title', 'figure', 'fact', 'trend', 'ring', 'who', 'when', 'mark', 'next', 'reply', 'hue', 'picture'] as const;
const CARD_FACTS = 3;
/* THE LINES A CARD DRAWS AS WORDS, the only ones `edit: true` may say a person types on in place (`render/src/card-edit.ts`).
   A figure, a trend, a ring, a hue, a picture or a mark is drawn from its value and never as the words it holds, and a
   person, a time or where a row applies is drawn with a face, a clock or a chip, so a box over any of them would install
   and type nothing a reader sees. A column with no role is a fact. */
const CARD_EDIT_ROLES: readonly string[] = ['title', 'fact', 'reply', 'next'];

/** The field types a list may be put in order by (`order: { field, dir }`). */
const LIST_ORDERS: readonly string[] = ['int', 'decimal', 'duration', 'day', 'instant', 'text'];

/** The field types a list of steps may be put in order by: lowest first. */
const ORDERS_STEPS: readonly string[] = ['int', 'number', 'decimal', 'day', 'instant', 'text'];

/** `42 §4.2`'s `Glyph`: a block's icon names one, whatever its kind. */
const GLYPH = /^[a-z][a-z0-9-]{0,31}$/u;

/** `06 §1.1`: at most 24 blocks, 1–16 `requires`, and the twelfths a `span` is measured in. */
const BLOCK_CEILING = 24;
const REQUIRES_CEILING = 16;
const SPAN_MAX = 12;
const RAIL_MIN = 3;
const RAIL_MAX = 5;
/** `06 §1.1`: a `feed`'s `first` is 1 to 50, and a `steps` block's short view is held to the same. */
const FIRST_MAX = 50;
const LIMIT_MAX = 500;
const CELL_CEILING = 6;
const COLUMN_CEILING = 16;
const ORDER_CEILING = 3;

/**
 * `42 §4.5`'s text ceilings, in bytes, and the row ceiling an authored block is held to.
 *
 * MEASURED IN BYTES, AS `nav.section` ALREADY IS. The ceiling is about what a record stores, sends
 * and draws, and a heading of eighty accented characters is not eighty bytes. A `label`'s forty is
 * the cell half of the same table.
 *
 * AUTHORED ROWS TAKE THE ROW CEILING A `limit` TAKES, because they are the same fact about the same
 * block: five hundred is the most rows this record draws from a register, and a block that writes
 * its rows out by hand does not get a longer page than one that reads them.
 */
const HEADING_BYTES = 80;
const EMPTY_BYTES = 200;
/* A BLOCK'S BODY, WHICH IS NOT THE ACTION'S `BODY_BYTES` BELOW. That one is `42 §4.7`'s 8 KB on
   what a scheduled call SENDS, and it is printed whole in the install diff; this is `42 §4.5`'s
   64 KB of prose a block DRAWS. Two ceilings, two bodies, named apart so neither is read for the
   other. */
const BLOCK_BODY_BYTES = 64 * 1024;
const LABEL_BYTES = 40;
const AUTHORED_CEILING = LIMIT_MAX;

/** The four intent words `22 §7` admits, and the only path by which a tone reaches the DOM. */
const TONES = ['good', 'warn', 'bad', 'info'] as const;

/**
 * `42 §4.5`'s three source forms, plus the one the record computes.
 *
 * `forecast.runway` is not in `42 §4.5`'s table and is in the sources registry (`sources/index.ts`,
 * `SOURCE_MODULES`), which is the live authority and the one place a computed source is named: the
 * closed list below reads its keys. The money page ships a block sourced from it. A source list that refused the
 * record's own page would be a check written from the document with the product left out.
 */
const SOURCE = /^(?:register\.[a-z][a-z0-9_-]{0,31}|metric\.[a-z][a-z0-9_-]{0,31}(?::\S.{0,199})?)$/u;
const BLOCK_SOURCE = /^block\.\d{1,2}$/u;

/**
 * Whether `source` is one this build knows how to read: a list, a figure, another block of the page, or a part of the
 * code that answers by name (`sourceModule`). The one test a block's `source` is held to at install, said on its own so
 * a reader of an old version of a page can tell a source since taken out of the code (`pageVersions` in the record).
 */
export const sourceKnown = (source: string): boolean =>
  SOURCE.test(source) || BLOCK_SOURCE.test(source) || sourceModule(source) !== undefined || HOST_SOURCE_NAMES.has(source);

/**
 * THE SOURCES THE HOST READS THAT THE KERNEL CANNOT (`PageDeps.hostSources`), by name, such as `lists` and `pages`:
 * admitted by the host that holds them (`admitHostSources`), so a page over one installs first try. A name of the code's
 * own, as `sourceModule` finds it, is never shadowed: the reader asks the host only for a name no registered source answers.
 */
const HOST_SOURCE_NAMES = new Set<string>();

/** Admit the names of the sources a host hands the page reader, so `sourceKnown` and the install know them. */
export function admitHostSources(names: Iterable<string>): void {
  for (const name of names) if (/^[a-z][a-z0-9_.-]{0,63}$/u.test(name)) HOST_SOURCE_NAMES.add(name);
}

/** A metric id as a page says it: `project-owed:Kiln` is one document read about one project. */
const metricNamed = (said: string): string => said.split(':')[0] ?? '';
const METRIC_ID = /^[a-z][a-z0-9_-]{0,31}$/u;
/** The comparisons a block's `when:` reads (`pages.ts` `drawnWhen`); `empty` is the test beside none of them. */
const WHEN_COMPARES = ['gt', 'gte', 'lt', 'lte', 'is', 'not'] as const;

/**
 * What is wrong with one leaf of a block's `when:`, as a sentence with its fix, or `null`. `said` is how the refusal
 * names it: "page.cash.blocks[0]'s when", and "…'s when all[1]" for a leaf inside an `all`.
 */
function whenLeafFault(leaf: unknown, said: string): string | null {
  const when = leaf as { metric?: unknown; empty?: unknown; beyond?: unknown } | null;
  if (when === null || typeof when !== 'object' || typeof when.metric !== 'string' || !METRIC_ID.test(metricNamed(when.metric))) return `${said} is one leaf naming a metric.`;
  const compares: string[] = WHEN_COMPARES.filter((k) => Object.hasOwn(when, k));
  /* `beyond:` IS THE ONE TEST A WALK THAT NEVER WENT UNDER MEETS (`money-figures.ts` `beyondOf`). Its reading has no
     value, so no comparison holds of it, and it is not `empty` on a record that holds money: "Your money lasts past
     20 Sep 2027" had no condition to be drawn under. `beyond: true` holds while the reading says how far it looked,
     `beyond: false` while it does not. It is the leaf's whole test, as `empty` is. */
  if (when.beyond !== undefined) {
    if (typeof when.beyond !== 'boolean') return `${said} has beyond: ${JSON.stringify(when.beyond)}, and beyond is true or false.`;
    const beside = [...compares, ...(when.empty !== undefined ? ['empty'] : [])];
    if (beside.length > 0)
      return `${said} says beyond and ${beside.join(' and ')}. A walk that never went under has no value to compare, so beyond is the whole test: { metric, beyond: true }. Two tests are two leaves: { all: [{ metric, beyond: true }, { metric, ... }] }.`;
  }
  /* `empty:` IS THE ONE TEST A FIGURE WITH NO VALUE MEETS. No comparison holds of a figure nobody has
     given a value, so "No balance has been typed yet" could not be said where the sentence about cash goes.
     `empty: true` holds while the figure has no value and no amount in any currency, `empty: false` once it has
     one. It is the leaf's whole test: beside a comparison one of the two would never be read. */
  if (when.empty !== undefined) {
    if (typeof when.empty !== 'boolean') return `${said} has empty: ${JSON.stringify(when.empty)}, and empty is true or false.`;
    if (compares.length > 0)
      return `${said} says empty and ${compares.join(' and ')}. A figure with no value meets no comparison, so empty is the whole test: { metric, empty: true }.`;
  }
  return null;
}

/**
 * What is wrong with a block's `when:`, or `null`: one leaf, or `all:` of two or more that must every one hold.
 *
 * A LEAF WITH `metric:` IN PLACE OF `field:` (`06 §1`), evaluated at render and never compiled. A `when:` naming
 * nothing is a block that is either always drawn or never, and both of those are indistinguishable from the block
 * working.
 *
 * all: OR any:, TWO LEVELS DEEP AT MOST (block-keys.ts whenTreeFault), each leaf checked here by whenLeafFault.
 */
function whenFault(when: unknown, said: string): string | null {
  return whenTreeFault(when, said, whenLeafFault);
}

/* ── a part that waits on what the record holds ──────────────────────────────────────────────────────── */

/**
 * `when: { holds: [...] }`: a part of an add-on that is there only while the record holds every list or role it names.
 *
 * THE PLAN RESOLVES IT, AND THE INSTALL NEVER SEES IT. `packages/declare`'s `resolveWhen` lays the add-on over what the
 * record holds and what the add-on brings, keeps each part whose names are all held, takes the rest out and says them in
 * the plan's `waiting`, and strips the key from every part it keeps. So a body this file stores never says it, and
 * `pages.ts`, which reads a block's `when:` as a figure's test (`drawnWhen`), never meets the second shape. `validate`
 * checks the shape where a part may say it and then reads the document as though every part were there.
 *
 * A NAME IS A LIST'S ID OR A ROLE A LIST PLAYS (`roles.ts`): `people` is held while the record has that list, and `meets`
 * while some list plays the people `meet` writes, whatever it is called.
 *
 * ONE THAT REACHES THE INSTALL WAS NEVER PLANNED (`unplannedHolds`), as a setting that reaches it was never filled, and it
 * is refused there rather than stored as a part that is always there.
 */
export const HOLDS_MOST = 8;
export const HOLDS_ROLES: readonly string[] = ['rates', 'meets', 'org'];
const HOLD_NAME = /^(?!.*__)[a-z][a-z0-9_]{0,31}$/u;

type Part = Record<string, unknown>;
const isPart = (v: unknown): v is Part => v !== null && typeof v === 'object' && !Array.isArray(v);

/** A `when:` in the holds shape: an object with `holds` in it. Any other `when:` is a figure's test or a rule's condition. */
export const isHolds = (when: unknown): when is { holds: unknown } => isPart(when) && Object.hasOwn(when, 'holds');

/**
 * Every place in one declaration's body a part may say `when: { holds }`, with where it is: `''` is the declaration
 * itself (not a rule's, whose `when:` is what it fires on), then a list's fields, its pairing clause and its roles, a
 * page's blocks with their columns and legs, and a figure's legs.
 */
export function holdingParts(kind: DeclKind, body: Part): { at: string; part: Part }[] {
  const out: { at: string; part: Part }[] = kind === 'rule' ? [] : [{ at: '', part: body }];
  const each = (key: string, of: Part, at: string): void => {
    const items = of[key];
    if (Array.isArray(items)) items.forEach((item, i) => isPart(item) && out.push({ at: `${at}${key}[${i}]`, part: item }));
  };
  if (kind === 'register') {
    each('fields', body, '');
    for (const key of ['pairs', ...HOLDS_ROLES]) if (isPart(body[key])) out.push({ at: key, part: body[key] as Part });
  }
  /* A PAGE'S READER FILTER MAY WAIT, as Work's filter by project waits for Projects (work-pack-file-90). */
  if (kind === 'page') each('filters', body, '');
  if (kind === 'page' && Array.isArray(body.blocks))
    body.blocks.forEach((block, i) => {
      if (!isPart(block)) return;
      out.push({ at: `blocks[${i}]`, part: block });
      each('columns', block, `blocks[${i}].`);
      each('legs', block, `blocks[${i}].`);
    });
  if (kind === 'metric') each('legs', body, '');
  return out;
}

/** The shape of every `when: { holds }` in a declaration, and the one part that may not wait: a required field. */
function holdsFault(decl: Declaration): Refusal | null {
  const body = decl.body as Part;
  if (decl.kind === 'rule' && isHolds(body.when))
    return bad('DECLARATION_INVALID', `${decl.id}'s when is what it fires on, so a rule cannot wait for a list this way. Put it in a plugin that requires the list.`, 'when');
  for (const { at, part } of holdingParts(decl.kind, body)) {
    const when = part.when;
    if (when === undefined) continue;
    const where = at === '' ? 'when' : `${at}.when`;
    const said = at === '' ? decl.id : `${decl.id}.${at}`;
    /* A BLOCK'S OTHER `when:` IS A FIGURE'S TEST, checked with the block. Nowhere else does a part read one. */
    if (!isHolds(when)) {
      if (decl.kind === 'page' && /^blocks\[\d+\]$/u.test(at)) continue;
      return bad('DECLARATION_INVALID', `${said}'s when is { holds: [people] }: the lists or roles this BrainDog must hold for it to be there.`, where);
    }
    const beside = Object.keys(when).filter((k) => k !== 'holds');
    if (beside.length > 0)
      return bad('DECLARATION_INVALID', `${said}'s when says ${beside.join(' and ')} beside holds. A part that waits says only what it waits for: { holds: [people] }.`, where);
    const names = when.holds;
    if (!Array.isArray(names) || names.length === 0 || names.length > HOLDS_MOST)
      return bad('DECLARATION_INVALID', `${said} waits for 1 to ${HOLDS_MOST} lists or roles, named in a list: when: { holds: [people] }.`, where);
    const wrong = names.find((n) => typeof n !== 'string' || !HOLD_NAME.test(n));
    if (wrong !== undefined)
      return bad('DECLARATION_INVALID', `${said} waits for ${JSON.stringify(wrong)}, which is not a list's id or a role a list plays (${HOLDS_ROLES.join(', ')}).`, where);
    if (new Set(names).size !== names.length) return bad('DECLARATION_INVALID', `${said} names one list twice in what it waits for.`, where);
    /* A REQUIRED FIELD CANNOT COME AND GO: a row written while it waits would be refused for a field it cannot see. */
    if (decl.kind === 'register' && at.startsWith('fields[') && (part.required === true || part.required_when !== undefined))
      return bad('DECLARATION_INVALID', `${said} is required and waits for ${(names as string[]).join(', ')}. A field that comes and goes is optional: take required out, or the when.`, where);
  }
  return null;
}

/** The declaration as `validate` reads the rest of it: every part there, and no `when: { holds }` on any of them. */
function withoutHolds(decl: Declaration): Declaration {
  if (!holdingParts(decl.kind, decl.body as Part).some(({ part }) => isHolds(part.when))) return decl;
  const body = structuredClone(decl.body) as Part;
  for (const { part } of holdingParts(decl.kind, body)) if (isHolds(part.when)) delete part.when;
  return { ...decl, body: body as Declaration['body'] };
}

/** The first `when: { holds }` in a batch about to be installed, which no plan resolved. */
export function unplannedHolds(batch: readonly Declaration[]): Refusal | null {
  for (const decl of batch)
    for (const { at, part } of holdingParts(decl.kind, decl.body as Part))
      if (isHolds(part.when))
        return bad(
          'DECLARATION_INVALID',
          `${at === '' ? decl.id : `${decl.id}.${at}`} waits for what this BrainDog holds, which is worked out when its plugin is planned. Install it as part of a plugin, or take the when out.`,
          at === '' ? `${decl.id}.when` : `${decl.id}.${at}.when`,
        );
  return null;
}

const isInt = (n: unknown, lo: number, hi: number): boolean => typeof n === 'number' && Number.isInteger(n) && n >= lo && n <= hi;

const byteLength = (text: string): number => new TextEncoder().encode(text).length;

/**
 * Why a text a reader sees is not one, or `null`.
 *
 * THE TEXTS ARE ONE CHECK BECAUSE THEY ARE ONE MISTAKE. A `heading`, an `empty` sentence, a `body`
 * and a cell's `label` are each drawn through a function that calls `replaceAll` on the value, so a
 * value that is not a string is a TypeError inside the page's own render rather than a block saying
 * it cannot be drawn. A block that throws takes every other block on the page with it, which is the
 * opposite of the per-block boundary `readBlock` is written to keep: *"everything a block can get
 * wrong comes back as a refusal ON THE BLOCK"*. The app narrows all four again on its own side,
 * because it reads JSON from a record and should not trust it whatever this file checks; what is
 * here is the only place the declaration can be refused BEFORE anybody's page is broken by it.
 *
 * AN EMPTY STRING IS REFUSED IN THE SAME WORDS AS A MISSING ONE, which is how `title` and
 * `nav.section` already read. A heading of no characters is a heading nobody sees, and whoever
 * wrote the key meant to say something in it.
 */
function textFault(value: unknown, ceiling: number, at: string, said: string, what: string): Refusal | null {
  if (typeof value !== 'string' || value.trim() === '')
    return bad('DECLARATION_INVALID', `${said} is ${JSON.stringify(value ?? null)}. ${what}`, at);
  const size = byteLength(value);
  if (size > ceiling)
    return bad('OUT_OF_BOUNDS', `${said} measures ${size} bytes, and the ceiling is ${ceiling}. Shorten it.`, at);
  return null;
}

/* ── a page's look ──────────────────────────────────────────────────────── */

/** What a look's lists are called in a sentence. */
const LOOK_LISTS = ['order', 'hide', 'pinned'] as const;

/**
 * A `look.<page>` declaration (`compose.ts`), checked against contract 17: `{ look, basis, by, lead?, order?, hide?,
 * headline?, next?: { row, text }, pinned? }`.
 *
 * WHAT IS CHECKED HERE IS THE LOOK ON ITS OWN AND AGAINST ITS PAGE'S DECLARATION. Each list names a key once; `hide`
 * never names the lead or a pinned block; `by: owner` is the record's own and never a pack's, since a pack writing one
 * would hold the owner's pins against him. The page must be installed when the record is known.
 *
 * A KEY THE PAGE'S OWN BLOCKS DO NOT HAVE IS LET THROUGH HERE, because another pack may add the block it names
 * (`page-adds.ts`) and the adds are in the packs' manifests, which no declaration carries. The read drops a key the page
 * does not have (`applyLook`), and a writer holding the page as read checks against it whole with `lookFault`.
 */
function lookBody(decl: Declaration, installed?: Known): Refusal | null {
  const body = decl.body as Record<string, unknown>;
  const id = decl.id;
  for (const key of Object.keys(body))
    if (!LOOK_KEYS.has(key))
      return bad('DECLARATION_INVALID', `${id}: ${key}: is not a key a look has. A look is { look, basis, by, lead, order, hide, headline, next, pinned, group, span, area }.`, key, [...LOOK_KEYS]);
  if (typeof body.look !== 'string' || !/^[a-z][a-z0-9_-]{0,63}$/u.test(body.look))
    return bad('DECLARATION_INVALID', `${id} names ${JSON.stringify(body.look ?? null)} as its page; a look names the page it is laid over by its id.`, 'look');
  if (!(LOOK_BY as readonly unknown[]).includes(body.by))
    return bad('DECLARATION_INVALID', `${id} says it was arranged by ${JSON.stringify(body.by ?? null)}; a look is by ${LOOK_BY.join(', ')}.`, 'by', [...LOOK_BY]);
  if (body.by === 'owner' && decl.pack !== undefined && decl.pack !== null)
    return bad('DECLARATION_INVALID', `${id} comes with ${decl.pack} and says the owner arranged it. A pack's look is by rule or by slash; only this BrainDog's own is by owner.`, 'by', ['rule', 'slash']);
  const basis = textFault(body.basis, LOOK_BASIS_BYTES, 'basis', `${id}'s basis`, 'It is what the look was composed from, so a writer knows when that moved.');
  if (basis) return basis;
  if (body.lead !== undefined && (typeof body.lead !== 'string' || !BLOCK_KEY.test(body.lead)))
    return bad('DECLARATION_INVALID', `${id} leads with ${JSON.stringify(body.lead)}; the lead is one block's key.`, 'lead');
  const lists: Partial<Record<(typeof LOOK_LISTS)[number], string[]>> = {};
  for (const name of LOOK_LISTS) {
    const list = body[name];
    if (list === undefined) continue;
    if (!Array.isArray(list) || list.length > LOOK_KEYS_MOST)
      return bad('DECLARATION_INVALID', `${id}'s ${name} is a list of at most ${LOOK_KEYS_MOST} block keys.`, name);
    for (const [i, key] of list.entries()) {
      if (typeof key !== 'string' || !BLOCK_KEY.test(key))
        return bad('DECLARATION_INVALID', `${id}'s ${name} names ${JSON.stringify(key)}, which is not a block's key.`, `${name}[${i}]`);
      if (list.indexOf(key) !== i) return bad('DECLARATION_INVALID', `${id}'s ${name} names ${key} twice. Keep one.`, `${name}[${i}]`);
    }
    lists[name] = list as string[];
  }
  const placed = lookPlacesFault(body, id);
  if (placed) return placed;
  const pinned = new Set(lists.pinned ?? []);
  for (const [i, key] of (lists.hide ?? []).entries()) {
    if (pinned.has(key)) return bad('DECLARATION_INVALID', `${id} pins ${key} and hides it. A pinned block stays drawn; take it out of hide.`, `hide[${i}]`);
    if (key === body.lead) return bad('DECLARATION_INVALID', `${id} leads with ${key} and hides it. Take it out of hide, or lead with another.`, `hide[${i}]`);
  }
  /* A GROUPING IS A MAP FROM A BLOCK'S KEY TO ONE FIELD OF THAT BLOCK'S LIST. Whether the field is one the list has is
     the read's to say (`applyLook`), since a look outlives the page it was written over. */
  if (body.group !== undefined) {
    const g = body.group;
    if (g === null || typeof g !== 'object' || Array.isArray(g) || Object.keys(g).length > LOOK_GROUPS_MOST)
      return bad('DECLARATION_INVALID', `${id}'s group is a map of at most ${LOOK_GROUPS_MOST} block keys, each to one field of that block's list.`, 'group');
    for (const [key, field] of Object.entries(g))
      if (!BLOCK_KEY.test(key) || typeof field !== 'string' || !/^[a-z][a-z0-9_]{0,63}$/u.test(field))
        return bad('DECLARATION_INVALID', `${id}'s group names ${JSON.stringify(field)} for ${key}; it is a block's key and one field of that block's list.`, `group.${key}`);
  }
  if (body.headline !== undefined) {
    const said = textFault(body.headline, LOOK_HEADLINE_BYTES, 'headline', `${id}'s headline`, 'It is the page\'s one line, in words.');
    if (said) return said;
    /* A NUMBER IS A HOLE, `{{figure id}}`, which the read fills from the page's own figures (`fillHoles`). Any other brace
       is a hole nobody fills, and a break or markup would be drawn as written, since the line is drawn as it is said. */
    if (/[\n\r{}[\]*`<>]/u.test(withoutHoles(body.headline as string)))
      return bad('DECLARATION_INVALID', `${id}'s headline is one plain line. A figure is written as a hole, {{its id}}, and the page fills it; take out any other brace, break or markup.`, 'headline');
  }
  if (body.next !== undefined) {
    const next = body.next as { row?: unknown; text?: unknown } | null;
    if (next === null || typeof next !== 'object' || Array.isArray(next) || Object.keys(next).some((k) => k !== 'row' && k !== 'text'))
      return bad('DECLARATION_INVALID', `${id}'s next is { row, text }: the row it is about, and what it says.`, 'next', ['row', 'text']);
    if (typeof next.row !== 'string' || !/^[^\s]{1,64}$/u.test(next.row))
      return bad('DECLARATION_INVALID', `${id}'s next names ${JSON.stringify(next.row ?? null)} as its row; it is one row of the page.`, 'next.row');
    const said = textFault(next.text, LOOK_NEXT_BYTES, 'next.text', `${id}'s next action`, 'It says what to do, in words.');
    if (said) return said;
  }
  if (installed && !installed.has(`page.${body.look}`))
    return bad('PAGE_UNKNOWN', `${id} is laid over ${body.look}, and there is no page called ${body.look}.`, 'look');
  return null;
}

/**
 * WHETHER A LOOK FITS A PAGE AS READ, for a writer holding the page whole (its adds laid in): the record before it
 * writes the model's look, and a host before it saves a pin. Every key it names is a key the page has; `hide` touches
 * no block that was refused or leads (`lead: true`, or the look's own lead), nor, for a look that is not the owner's,
 * a queue that holds a question (`applyLook` in `compose.ts` drops such a hide either way, and here the writer is
 * told); `next` names a row the page handed. `null` when it fits.
 *
 * `by` IS WHOSE LOOK IT IS. A caller checking the owner's own pin passes `by: 'owner'`, and the record's writer of
 * Slash's look passes `by: 'slash'`; a look that does not say is held as one that is not the owner's.
 */
export function lookFault(
  look: { by?: unknown; lead?: unknown; order?: unknown; hide?: unknown; pinned?: unknown; next?: unknown },
  blocks: readonly { key?: unknown; kind?: unknown; source?: unknown; drawn?: unknown; lead?: unknown; refusals?: readonly unknown[]; rows?: readonly { id?: unknown; register?: unknown; seq?: unknown; fields?: Record<string, unknown> }[]; queue?: readonly { id?: unknown }[] }[],
): Refusal | null {
  const keys = keyedBlocks(blocks).map((b) => b.key);
  const has = new Set(keys);
  const said = (v: unknown): string[] => (Array.isArray(v) ? v.filter((k): k is string => typeof k === 'string') : []);
  if (typeof look.lead === 'string' && !has.has(look.lead))
    return bad('DECLARATION_INVALID', `The look leads with ${look.lead}, and the page has no block of that key.`, 'lead', keys);
  for (const name of LOOK_LISTS)
    for (const [i, key] of said(look[name]).entries())
      if (!has.has(key)) return bad('DECLARATION_INVALID', `The look's ${name} names ${key}, and the page has no block of that key. A look only reorders, hides and pins what is there.`, `${name}[${i}]`, keys);
  for (const [i, key] of said(look.hide).entries()) {
    const b = blocks[keys.indexOf(key)]!;
    if ((b.refusals?.length ?? 0) > 0) return bad('DECLARATION_INVALID', `The look hides ${key}, which could not be drawn. A refused block stays, so the person sees what broke.`, `hide[${i}]`);
    if (b.lead === true) return bad('DECLARATION_INVALID', `The look hides ${key}, which leads the page. Take it out of hide.`, `hide[${i}]`);
    if (look.by !== 'owner' && (b.kind === 'queue' || b.source === 'governance.open') && b.drawn !== false && (b.queue?.length ?? 0) > 0)
      return bad('DECLARATION_INVALID', `The look hides ${key}, which holds questions waiting on the person. Take it out of hide.`, `hide[${i}]`);
  }
  const next = look.next as { row?: unknown } | undefined;
  if (next !== undefined && next !== null && typeof next.row === 'string') {
    const handles = new Set<string>();
    for (const b of blocks) {
      for (const r of b.rows ?? []) {
        if (typeof r.id === 'string') handles.add(r.id);
        if (typeof r.register === 'string' && typeof r.seq === 'number') handles.add(`${r.register}#${r.seq}`);
        if (typeof r.fields?.row === 'string') handles.add(r.fields.row);
      }
      for (const q of b.queue ?? []) if (typeof q.id === 'string') handles.add(q.id);
    }
    if (!handles.has(next.row)) return bad('DECLARATION_INVALID', `The look's next action is about ${next.row}, and the page did not hand that row.`, 'next.row');
  }
  return null;
}

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
 * Which pack declared each declaration, or `null` for the record's own.
 *
 * SEPARATE FROM `Known` BECAUSE IT IS A DIFFERENT FACT. `Known` is what a declaration SAYS, read
 * out of its body; this is who PUT IT THERE, which lives in a column and not in the body — a pack
 * cannot claim ownership of a register by writing a key into it, which is the whole reason the
 * column exists.
 */
export type Owners = ReadonlyMap<string, string | null>;

/**
 * A page's reader filters, `[{ field, control }]`, or why they are not.
 *
 * EVERY BLOCK HONOURS THEM (`21 §3.5`), so a filter is a field a person picks one value of: an enum, a link to another
 * list, a yes or no, or a word. A field none of the page's lists declares is refused when they are known, because a
 * strip of chips over nothing is a control that changes nothing; a field only some lists hold narrows the blocks over
 * those and leaves the rest as they are.
 */
function filtersFault(id: string, filters: unknown, requires: unknown, installed?: Known): Refusal | null {
  if (filters === undefined) return null;
  const shape = `${id}'s filters is a list of at most ${FILTERS_MOST}, each { field, control: ${FILTER_CONTROLS.join(' or ')} }, or { field, control, options } for options of its own.`;
  if (!Array.isArray(filters)) return bad('DECLARATION_INVALID', shape, 'filters');
  if (filters.length > FILTERS_MOST) return bad('OUT_OF_BOUNDS', `${id} declares ${filters.length} filters. ${shape}`, 'filters');
  const seen = new Set<string>();
  const lists = Array.isArray(requires) ? requires.filter((r): r is string => typeof r === 'string' && r.startsWith('register.')) : [];
  for (const [i, raw] of filters.entries()) {
    const at = `filters[${i}]`;
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return bad('DECLARATION_INVALID', shape, at);
    const f = raw as { field?: unknown; control?: unknown; options?: unknown; counts?: unknown };
    const stray = Object.keys(f).find((k) => k !== 'field' && k !== 'control' && k !== 'options' && k !== 'counts');
    if (stray !== undefined) return bad('DECLARATION_INVALID', `${id}.${at} has ${stray}:, and a filter is { field, control } or { field, control, options }, with counts: a sentence of the rows its chips count.`, at, ['field', 'control', 'options', 'counts']);
    /* ON A FILTER OF ITS OWN CHOICES TOO (recheck of 30 October, N7): Work's Yours and Agents counted the backlog with
       them and made 16 against the Open of 15 beside them. */
    if (f.counts !== undefined && (typeof f.counts !== 'string' || f.counts.trim() === ''))
      return bad('DECLARATION_INVALID', `${id}.${at}'s counts is a sentence of the rows its chips count, such as state is not backlog.`, at);
    if (typeof f.field !== 'string' || !/^[a-z][a-z0-9_]{0,63}$/u.test(f.field))
      return bad('DECLARATION_INVALID', `${id}.${at} names ${JSON.stringify(f.field ?? null)} as its field; a filter names one field of the page's lists.`, at);
    if (!(FILTER_CONTROLS as readonly unknown[]).includes(f.control))
      return bad('DECLARATION_INVALID', `${id}.${at}'s control is ${JSON.stringify(f.control ?? null)}; it is ${FILTER_CONTROLS.join(' or ')}.`, at, [...FILTER_CONTROLS]);
    if (seen.has(f.field)) return bad('DECLARATION_INVALID', `${id} filters on ${f.field} twice. Keep one.`, at);
    seen.add(f.field);
    /* A FILTER OF ITS OWN CHOICES (`options:`): each a word the address keeps, the name a person reads and the sentence
       of the rows it keeps, so a page can be narrowed by a question no one field answers ("Yours", "Agents"). Its
       `field` is then the word the address holds the choice under, and no list need declare it. */
    if (f.options !== undefined) {
      const optionsFault = filterOptionsFault(id, at, f.options);
      if (optionsFault) return optionsFault;
      continue;
    }
    if (!installed || lists.length === 0) continue;
    const typed = lists.flatMap((r) => {
      const fields = installed.get(r)?.fields;
      return Array.isArray(fields)
        ? (fields as { id?: unknown; type?: unknown; retired?: unknown }[]).filter((d) => d?.id === f.field && d.retired !== true).map((d) => String(d.type))
        : [];
    });
    if (typed.length === 0)
      return bad('FIELD_UNKNOWN', `${id} filters on ${f.field}, and none of the lists it requires has a field called ${f.field}.`, at);
    if (!typed.some((t) => FILTER_TYPES.has(t)))
      return bad(
        'DECLARATION_INVALID',
        `${id} filters on ${f.field}, which is ${typed[0]}. A filter picks one value of a field that is ${[...FILTER_TYPES].join(', ')}.`,
        at,
      );
  }
  return null;
}

/**
 * Why a filter's own `options` cannot be drawn, or `null`: from two to six, each `{ value, label, where }`, the value a
 * word an address keeps, the label the words a person reads, and `where` the sentence of the rows the choice keeps, read
 * against each list the page draws when it is chosen.
 */
function filterOptionsFault(id: string, at: string, options: unknown): Refusal | null {
  const shape = `${id}.${at}.options is a list of ${FILTER_OPTIONS_FEWEST} to ${FILTER_OPTIONS_MOST}, each { value, label, where }.`;
  if (!Array.isArray(options) || options.length < FILTER_OPTIONS_FEWEST || options.length > FILTER_OPTIONS_MOST)
    return bad('DECLARATION_INVALID', shape, `${at}.options`);
  const values = new Set<string>();
  for (const [n, raw] of options.entries()) {
    const where = `${at}.options[${n}]`;
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return bad('DECLARATION_INVALID', shape, where);
    const c = raw as { value?: unknown; label?: unknown; where?: unknown };
    const stray = Object.keys(c).find((k) => k !== 'value' && k !== 'label' && k !== 'where');
    if (stray !== undefined) return bad('DECLARATION_INVALID', `${id}.${where} has ${stray}:, and a choice is { value, label, where }.`, where, ['value', 'label', 'where']);
    if (typeof c.value !== 'string' || !/^[a-z][a-z0-9-]{0,31}$/u.test(c.value))
      return bad('DECLARATION_INVALID', `${id}.${where}'s value is ${JSON.stringify(c.value ?? null)}; it is a word an address keeps, such as yours.`, where);
    if (values.has(c.value)) return bad('DECLARATION_INVALID', `${id}.${at} offers ${c.value} twice. Keep one.`, where);
    values.add(c.value);
    if (typeof c.label !== 'string' || c.label.trim() === '' || c.label.length > 40)
      return bad('DECLARATION_INVALID', `${id}.${where}'s label is the words a person reads, 40 characters at most.`, where);
    if (typeof c.where !== 'string' || c.where.trim() === '')
      return bad('DECLARATION_INVALID', `${id}.${where}'s where is the sentence of the rows the choice keeps, such as "agent is empty".`, where);
  }
  return null;
}

/** How many cards a group shows before the rest fold, when a grouped `cards` block does not say, and the most it may. */
export const CARD_FOLD = 3;
export const CARD_FOLD_MOST = 50;

/**
 * Why a `cards` block's `group` or `fold` cannot be drawn, or `null`.
 *
 * A GROUP IS A LINK, A CHOICE OR THE STATE OF THE LIST THE ROWS ARE OVER, so each group has a name a person reads: the
 * row the link points at (tasks grouped by their project), or the label of the value. A text or a number would be a
 * heading a row long, and the filters already pick one value of those. Said for `cards` and for a `table`, as the read
 * says it again (`pages.ts` `rowGrouping`). The list is checked when the record knows it, as a filter's field is
 * (`filtersFault`). `fold` is a count of cards from 1 to `CARD_FOLD_MOST`, and only folds a group of cards.
 */
/** The fields of the list a block reads (`source: register.<id>`) or writes (`register:`), when that list is installed; else `null`. */
function blockListFields(block: Readonly<Record<string, unknown>>, installed?: Known): ReadonlySet<string> | null {
  const { source, register } = block;
  const list = typeof source === 'string' && source.startsWith('register.') ? source.slice('register.'.length) : typeof register === 'string' ? register : null;
  const shape = list === null ? undefined : installed?.get(`register.${list}`);
  if (shape === undefined || !Array.isArray(shape.fields)) return null;
  return new Set((shape.fields as { id?: unknown }[]).map((f) => f?.id).filter((f): f is string => typeof f === 'string'));
}

function cardGroupFault(id: string, at: string, block: Readonly<Record<string, unknown>>, installed?: Known): Refusal | null {
  const { group, fold, source } = block;
  const cards = block.kind !== 'table';
  const what = cards ? 'cards' : 'rows';
  if (cards && fold !== undefined && !isInt(fold, 1, CARD_FOLD_MOST))
    return bad('OUT_OF_BOUNDS', `${id}.${at}'s fold is ${JSON.stringify(fold)}; it is how many cards each group shows before the rest fold, from 1 to ${CARD_FOLD_MOST}.`, `${at}.fold`);
  if (group === undefined) {
    if (cards && fold !== undefined)
      return bad('DECLARATION_INVALID', `${id}.${at} folds its groups and draws none. Give it group: a link, a choice or the state of its list, or take fold: off.`, `${at}.fold`);
    return null;
  }
  if (typeof group !== 'string' || !/^[a-z][a-z0-9_]{0,63}$/u.test(group))
    return bad('DECLARATION_INVALID', `${id}.${at}'s group is ${JSON.stringify(group)}; it names one link, choice or the state of the list the ${what} are over.`, `${at}.group`);
  /* A TABLE OVER WHAT FALLS DUE GROUPS BY ITS ONE WORD, the stretch each day is in (`sources/deadlines.ts`). */
  if (!cards && source === 'deadlines') {
    if (group === DEADLINES_GROUP) return null;
    return bad('DECLARATION_INVALID', `${id}.${at} groups what falls due by ${group}; it groups by ${DEADLINES_GROUP}, the stretch each day is in.`, `${at}.group`, [DEADLINES_GROUP]);
  }
  const list = typeof source === 'string' && source.startsWith('register.') ? source.slice('register.'.length) : null;
  if (list === null)
    return bad('DECLARATION_INVALID', `${id}.${at} groups by ${group}, and only ${what} over a list are grouped: give it source: register.<id>.`, `${at}.group`);
  const shape = installed?.get(`register.${list}`);
  if (shape === undefined || !Array.isArray(shape.fields)) return null;
  const state = typeof shape.state === 'string' ? shape.state : null;
  const fields = (shape.fields as { id?: unknown; type?: unknown; retired?: unknown }[]).filter((f) => f?.retired !== true);
  const may = fields
    .filter((f) => typeof f.id === 'string' && (f.type === 'ref' || f.type === 'enum' || f.id === state))
    .map((f) => f.id as string);
  const field = fields.find((f) => f?.id === group);
  if (!field) return bad('FIELD_UNKNOWN', `${id}.${at} groups by ${group}, and ${list} has no field called ${group}.`, `${at}.group`, may);
  if (field.type !== 'ref' && field.type !== 'enum' && field.id !== state)
    return bad(
      'DECLARATION_INVALID',
      `${id}.${at} groups by ${group}, which is ${String(field.type)}. ${cards ? 'Cards' : 'Rows'} are grouped by a link to another list, a choice or the list's state, so each group has a name: ${may.length ? `${may.join(', ')} on ${list}` : `${list} has none`}.`,
      `${at}.group`,
      may,
    );
  return null;
}

/** The keys of a page's `for:`. */
const FOR_KEYS: readonly string[] = ['register', 'where', 'fleeting'];

/** A page's `for:` as `{ register, where?, fleeting? }`, or the refusal at `for` saying what it is instead. */
function forShapeFault(id: string, said: unknown): Refusal | null {
  if (said === undefined) return null;
  const shape = `${id}'s for: is { register: tasks }, the list the page is one per row of, with where: to narrow it and fleeting: true when its rows come and go.`;
  if (said === null || typeof said !== 'object' || Array.isArray(said)) return bad('DECLARATION_INVALID', shape, 'for', FOR_KEYS);
  const f = said as { register?: unknown; where?: unknown; fleeting?: unknown };
  const stray = Object.keys(f).find((k) => !FOR_KEYS.includes(k));
  if (stray !== undefined) return bad('DECLARATION_INVALID', `${id}'s for: has ${stray}:. ${shape}`, 'for', FOR_KEYS);
  if (typeof f.register !== 'string' || f.register.trim() === '') return bad('DECLARATION_INVALID', shape, 'for', FOR_KEYS);
  if (f.where !== undefined && typeof f.where !== 'string')
    return bad('DECLARATION_INVALID', `${id}'s for: where is ${JSON.stringify(f.where)}; it is a sentence, such as state is open.`, 'for', FOR_KEYS);
  if (f.fleeting !== undefined && typeof f.fleeting !== 'boolean')
    return bad('DECLARATION_INVALID', `${id}'s for: fleeting is ${JSON.stringify(f.fleeting)}; it is true or false.`, 'for', FOR_KEYS);
  return null;
}

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
    layout?: unknown;
    header?: unknown;
  };
  const id = decl.id;

  /* THE PAGE'S OWN KEYS ARE A CLOSED LIST, as `06 §1.1` always said they were: *"the install-time check refuses a key
     that is not in it, by name"*. Nothing did. Measured through a pack on a fresh record, `layout` and `tabs` installed,
     came back on the page's answer and were read by no host, so an author who wrote `tabs:` saw no tabs and no
     sentence saying why. The list is `block-keys.ts`'s, walked against every page `packages/seed` and `packs/` ship. */
  for (const key of Object.keys(body)) {
    if (PAGE_UNBUILT.has(key))
      return bad(
        'NOT_IN_THIS_BUILD',
        `${id} declares ${key}:, which the documents publish and this build draws nowhere. Take it off; the page's title is its header for now.`,
        key,
      );
    if (!PAGE_KEYS.has(key)) return bad('DECLARATION_INVALID', `${id}: ${unreadPageKey(key)}`, key, [...PAGE_KEYS]);
  }
  /* A HEAD OVER THE TITLE, checked by `page-head.ts`, the figures it counts against those installed. */
  if (body.header !== undefined) {
    const figures = installed ? new Set([...installed.keys()].filter((k) => k.startsWith('metric.')).map((k) => k.slice('metric.'.length))) : null;
    const fault = headerFault(body.header, { figures, fields: null });
    if (fault) return fault;
  }

  if (typeof body.title !== 'string' || body.title.trim() === '')
    return bad('DECLARATION_INVALID', `${id} has no title, and a page is named on the screen before it is drawn.`, 'title');

  /* `for:` MAKES THE PAGE ONE PER ROW of the list it names (`pages.ts`'s `PageDecl.for`). It installed whatever it said,
     so `for: tasks` or `for: { list: tasks }` was a page with no row behind it, and the reader met a blank where the row
     should lead. The shape is checked here; whether the list is installed is the template's own question, at reading. */
  const forFault = forShapeFault(id, (body as { for?: unknown }).for);
  if (forFault) return forFault;

  /* `list:` SENDS A LIST TO THIS PAGE: `/r/<list>` opens here, and the list's rows say where they are drawn. One list, by
     its id, and never on a template, which is one page a row and so no one list's page. Whether the list is installed is
     asked when the pages are read, as `for:`'s is, so a page whose list went stops being its page and nothing more. */
  const sent = (body as { list?: unknown }).list;
  if (sent !== undefined) {
    if (typeof sent !== 'string' || !/^[a-z][a-z0-9_]*$/u.test(sent))
      return bad('DECLARATION_INVALID', `${id}'s list: is the id of the list this page is the page of, such as datapoints.`, 'list');
    if ((body as { for?: unknown }).for !== undefined)
      return bad('DECLARATION_INVALID', `${id} is one page a row (for:), so it is no one list's page. Take list: off, or for:.`, 'list');
  }

  /* `06 §3`: *"pages can appear on their own; navigation cannot"* — a nav entry with no section is
     an item in no menu, and one with no order sorts against whatever the reader last wrote. Both
     install cleanly and both produce a page you can only reach by typing its slug. */
  if (body.nav !== undefined) {
    const nav = body.nav as { section?: unknown; order?: unknown; place?: unknown; tabs?: unknown; icon?: unknown };
    if (nav === null || typeof nav !== 'object')
      return bad('DECLARATION_INVALID', `${id}'s nav is a section and an order.`, 'nav');
    if (typeof nav.section !== 'string' || nav.section.trim() === '' || byteLength(nav.section) > 40)
      return bad('DECLARATION_INVALID', `${id} names ${JSON.stringify(nav.section ?? null)} as its nav section; a section is text of at most 40 bytes.`, 'nav');
    if (!isInt(nav.order, 0, 9999))
      return bad('DECLARATION_INVALID', `${id} sits at nav order ${JSON.stringify(nav.order ?? null)}; an order is a whole number from 0 to 9999.`, 'nav');
    /* `tabs: true` DRAWS THE SECTION'S PAGES AS A STRIP OF TABS over each of them. It installed before it was read, as
       any word under `nav` did, so a misspelt `tab: true` was a strip nobody would ever see. */
    const stray = Object.keys(nav).find((k) => !NAV_KEYS.has(k));
    if (stray !== undefined)
      return bad('DECLARATION_INVALID', `${id}'s nav has ${stray}:, and nav is { section, order, place, icon, tabs }. Tabs are tabs: true.`, 'nav', [...NAV_KEYS]);
    /* `place:` IS WHERE THE SECTION SITS ON THE RAIL, lowest first (`packages/record` `places.ts`). */
    if (nav.place !== undefined && !isInt(nav.place, 0, 9999))
      return bad('DECLARATION_INVALID', `${id}'s nav place is ${JSON.stringify(nav.place)}; a place is a whole number from 0 to 9999, lowest first on the rail.`, 'nav.place');
    if (nav.tabs !== undefined && typeof nav.tabs !== 'boolean')
      return bad('DECLARATION_INVALID', `${id}'s nav tabs is ${JSON.stringify(nav.tabs)}; it is true, to draw the pages of ${String(nav.section)} as tabs, or false.`, 'nav');
    if (nav.icon !== undefined && (typeof nav.icon !== 'string' || !GLYPH.test(nav.icon)))
      return bad('DECLARATION_INVALID', `${id}'s nav icon is a glyph name: lower-case letters, digits and dashes.`, 'nav');
    const navUnknown = typeof nav.icon === 'string' ? glyphFault(nav.icon) : null;
    if (navUnknown) return bad(navUnknown.code, `${id}'s nav: ${navUnknown.fix}`, 'nav.icon', navUnknown.allowed);
  }

  /* A MAIN COLUMN AND A SIDE RAIL, THE RAIL'S WIDTH IN TWELFTHS. Three to five, because a rail narrower than a quarter
     of the page holds no card and one wider than it is a second main column. `sticky` keeps the rail in view while the
     main column scrolls. A layout is not a page in a page (`06 §7`): the blocks are still one list in one order, and
     each says which of the two it sits in. */
  const layout = body.layout;
  if (layout !== undefined) {
    if (layout === null || typeof layout !== 'object' || Array.isArray(layout))
      return bad('DECLARATION_INVALID', `${id}'s layout is { rail: 4 }, the side rail's width in twelfths, and sticky: true to keep it in view.`, 'layout');
    const l = layout as { rail?: unknown; sticky?: unknown };
    const stray = Object.keys(l).find((k) => k !== 'rail' && k !== 'sticky');
    if (stray !== undefined)
      return bad('DECLARATION_INVALID', `${id}'s layout has ${stray}:, and a layout is { rail, sticky }. A block's width is its span:.`, 'layout', ['rail', 'sticky']);
    if (!isInt(l.rail, RAIL_MIN, RAIL_MAX))
      return bad(
        'OUT_OF_BOUNDS',
        `${id}'s layout rail is ${JSON.stringify(l.rail ?? null)}. The rail is ${RAIL_MIN}, 4 or ${RAIL_MAX} twelfths of the page, and the main column is the rest.`,
        'layout',
      );
    if (l.sticky !== undefined && typeof l.sticky !== 'boolean')
      return bad('DECLARATION_INVALID', `${id}'s layout sticky is ${JSON.stringify(l.sticky)}; it is true, to keep the rail in view, or false.`, 'layout');
  }

  if (body.tone !== undefined && !(TONES as readonly unknown[]).includes(body.tone))
    return bad('DECLARATION_INVALID', `${String(body.tone)} is not an intent.`, 'tone', TONES as unknown as string[]);

  /* A BOARD OF WIDGETS (`board.ts`): no rail, a key on every widget, at most sixteen, and the phone's own arrangement. */
  const boarded = boardFault(id, body as Record<string, unknown>);
  if (boarded) return boarded;

  const filtered = filtersFault(id, (body as { filters?: unknown }).filters, body.requires, installed);
  if (filtered) return filtered;

  /* `06 §1.1`: *"a page cannot appear without its data"* — `requires` is what makes uninstalling a
     pack take its pages out of the nav with it. It is marked required there and is checked here only
     when it is written, because four page fixtures across `packages/record` and `packages/mcp` — files
     this one does not own — declare a page with no `requires` at all. The shape is checked, and the
     coverage rule below is checked against whatever it says. Making it REQUIRED is the next pass, and
     it is one line here and four in those two files.

     ONLY THE SHAPE IS CHECKED HERE. Whether each want is actually installed is answered after the blocks below, not in
     this pass: a block naming a kind nobody installed is `KIND_UNKNOWN` (the rule "a page naming a kind nobody
     installed is refused at install, not drawn blank"), and that refusal is about the block, so it is owed to whoever
     is reading the refusal before a page-wide dependency that has nothing to do with which kind was typo'd. Checking
     availability this early made every page with both faults report the wrong one. */
  const requires = body.requires;
  if (requires !== undefined) {
    if (!Array.isArray(requires) || requires.length === 0 || requires.length > REQUIRES_CEILING)
      return bad('DECLARATION_INVALID', `${id}'s requires is a list of one to ${REQUIRES_CEILING} registers.`, 'requires');
    for (const want of requires) {
      if (typeof want !== 'string' || !/^register\.[a-z][a-z0-9_-]{0,31}$/u.test(want))
        return bad('DECLARATION_INVALID', `${id} requires ${JSON.stringify(want)}, and a page requires register.<id>.`, 'requires');
    }
  }
  const declared = new Set(Array.isArray(requires) ? (requires as string[]) : []);

  const blocks = body.blocks;
  if (!Array.isArray(blocks) || blocks.length === 0)
    return bad('DECLARATION_INVALID', `${id} declares no blocks, so opening it shows a heading and nothing under it.`, 'blocks');
  if (blocks.length > BLOCK_CEILING)
    return bad('DECLARATION_INVALID', `${id} declares ${blocks.length} blocks. The ceiling is ${BLOCK_CEILING}: a page longer than that is a report.`, 'blocks');

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
      fold?: unknown;
      most?: unknown;
      icon?: unknown;
      heading?: unknown;
      empty?: unknown;
      body?: unknown;
      target?: unknown;
      authored?: unknown;
      where?: unknown;
      register?: unknown;
    };
    const at = `blocks[${i}]`;
    if (block === null || typeof block !== 'object')
      return bad('DECLARATION_INVALID', `${id}.${at} is not a block.`, at);

    /* THE CLOSED LIST, AND IT IS CLOSED FOR THE REASON `04 §1` GIVES: the security argument is an
       ENUMERATION, and an enumeration only works over a finite list. A pack may still invent a kind
       — as a `block.<id>` declaration, which is admitted here by prefix and checked as a document of
       its own. A bare word that is neither is a block that draws nothing. */
    /**
     * AND IT IS REQUIRED, WHICH THIS CHECK READ AS OPTIONAL. `42 §4.5` and `06 §1.1` both mark it
     * required in their own tables, and a block arriving without one was admitted.
     *
     * WHAT A KINDLESS BLOCK DRAWS IS NOTHING, IN SILENCE, which is the same failure the closed list
     * above exists to end rather than a lesser one. `readBlock` compares `kind` to `stat`, to
     * `diff`, to `feed` and to the rest, matches none of them, and returns the base result: no rows,
     * no reading, no refusal, no mark on the page. The renderer then has nothing to look up, so what
     * a reader gets is a page with a hole in it and nothing anywhere saying why.
     */
    const kind = block.kind;
    if (kind === undefined)
      return bad(
        'KIND_UNKNOWN',
        `${id}.${at} names no kind, so nothing knows what to draw and the block comes back empty. Give it one this build draws, or a block.<id> this pack declares.`,
        at,
        BLOCK_KINDS as unknown as string[],
      );
    /* A PACK'S OWN KIND IS ADMITTED WHEN ITS DECLARATION IS INSTALLED, in this batch or before it, and refused by name
       when it is not. Admitted by prefix alone, a page naming `block.pad` installed and read its rows clean with nothing
       anywhere able to draw them: the "no rows, no refusal, no mark on the page" hole by another door. A caller that
       cannot say what is installed skips the check, as every other cross-declaration check here does. */
    const packKind = typeof kind === 'string' && PACK_KIND.test(kind);
    if (packKind && installed && !installed.has(kind as string))
      return bad(
        'KIND_UNKNOWN',
        `${id}.${at} draws ${kind as string}, and no installed pack declares it, so the page would open with a hole where the block should be. Install the pack that declares ${kind as string} first, or use a kind this build draws.`,
        at,
        [...BLOCK_KINDS, ...[...installed.keys()].filter((known) => PACK_KIND.test(known))],
      );
    if (!packKind && !(BLOCK_KINDS as readonly unknown[]).includes(kind))
      return bad(
        'KIND_UNKNOWN',
        `${id}.${at}: kind ${JSON.stringify(kind ?? null)} is not a kind this build draws, and no block declares it.`,
        at,
        BLOCK_KINDS as unknown as string[],
      );

    /* THE BLOCK'S KEYS ARE CLOSED HERE WHERE THE READ CLOSES THEM (`block-keys.ts`), so an author hears at install what
       a reader would otherwise be the first to hear. Before this, `size: 2` installed and was refused only when the page
       was opened, and `lead: true` on cards or `first: 3` on steps installed and read clean, read by nothing. A key only a
       read answers (`rows`, `next`, `types`) is refused here too: `{ kind: cards, next: what }` installed and drew
       nothing. The read still takes them, because a block that came out of a read may be read again. */
    for (const [key, value] of Object.entries(block)) {
      if (value === undefined) continue;
      if (!BLOCK_INSTALLS.has(key)) return bad('DECLARATION_INVALID', `${id}.${at}: ${unreadBlockKey(key)}`, `${at}.${key}`, keysFor(kind as string));
      const kinds = kindsReading(key);
      if (kinds && !kinds.includes(kind as string))
        return bad('DECLARATION_INVALID', `${id}.${at}: ${wrongKindKey(key, kind as string)}`, `${at}.${key}`, keysFor(kind as string));
    }

    /* A REGISTERED KIND CHECKS WHAT ONLY IT READS, here where the rest of its block is checked, and in the same sentence
       the read would give (`kinds/index.ts`). The module writes the sentence about the block; this puts the page and
       the block's place in front of it. */
    const kindFault = kindModule(kind as string)?.validate?.(block as Readonly<Record<string, unknown>>, { stage: 'install' }) ?? null;
    if (kindFault)
      return bad(kindFault.code, `${id}.${at}: ${kindFault.fix}`, kindFault.at === undefined ? at : `${at}.${kindFault.at}`, kindFault.allowed);

    /* A SECTION'S HOST PANEL IS ABOUT THE PAGE'S ROW, so it is refused on a page with no `for:`; a path's short view is
       a sentence and a label; and a roadmap over a list names the columns it places its rows by. The sentences are
       `kinds/words.ts`'s, which the read gives too. */
    const worded =
      panelFault((raw as { panel?: unknown }).panel, (body as { for?: unknown }).for !== undefined) ??
      shortFault((raw as { short?: unknown }).short) ??
      (kind === 'roadmap' ? roadmapFault(raw as Readonly<Record<string, unknown>>) : null);
    if (worded)
      return bad(worded.code, `${id}.${at}: ${worded.fix}`, worded.at === undefined ? at : `${at}.${worded.at}`, worded.allowed);

    /* WHICH OF THE PAGE'S TWO COLUMNS THE BLOCK SITS IN. A page with no `layout` has one column, so a block placed in its
       rail would be drawn where nothing says there is a rail. */
    const area = (raw as { area?: unknown }).area;
    if (area !== undefined) {
      if (area !== 'main' && area !== 'rail')
        return bad('DECLARATION_INVALID', `${id}.${at}'s area is ${JSON.stringify(area)}; a block sits in main or in rail.`, at, ['main', 'rail']);
      if (area === 'rail' && body.layout === undefined)
        return bad('DECLARATION_INVALID', `${id}.${at} sits in the rail, and ${id} declares no layout. Give the page layout: { rail: 4 }, or take area: off.`, at);
    }

    /* THE FLAGS THE NEW FORMS ARE TOLD BY, each a yes or a no, because a string here is a form drawn by accident:
       `lead: 'no'` is truthy wherever it is read. */
    for (const flag of ['lead', 'range', 'tiles', 'who', 'box', 'donut', 'tally'] as const) {
      const value = (raw as Record<string, unknown>)[flag];
      if (value !== undefined && typeof value !== 'boolean')
        return bad('DECLARATION_INVALID', `${id}.${at}'s ${flag} is ${JSON.stringify(value)}; it is true or false.`, at);
    }
    /* A BLOCK'S `key:` IS ITS NAME FOR THE ENGINE (`compose.ts`), so it has one shape and no two blocks of a page share
       it: a look that pins one of two blocks of one key would pin whichever the read reached first. */
    const key = (raw as { key?: unknown }).key;
    if (key !== undefined) {
      if (typeof key !== 'string' || !BLOCK_KEY.test(key))
        return bad(
          'DECLARATION_INVALID',
          `${id}.${at}'s key is ${JSON.stringify(key)}; a key is lower-case letters, digits, _ and -, starting with a letter, at most 48 of them.`,
          `${at}.key`,
        );
      if ((blocks as unknown[]).slice(0, i).some((b) => b !== null && typeof b === 'object' && (b as { key?: unknown }).key === key))
        return bad('DECLARATION_INVALID', `${id} names two blocks ${key}. Give each its own key, or take one off.`, `${at}.key`);
    }
    /* A FORECAST'S `headline:` SAYS WHAT THE PAGE'S OPENING LINE ALREADY SAYS OF IT, and the one thing it can say is when
       the money runs out. */
    const headline = (raw as { headline?: unknown }).headline;
    if (headline !== undefined && headline !== 'under')
      return bad('DECLARATION_INVALID', `${id}.${at}'s headline is ${JSON.stringify(headline)}; it is under, when the page's opening line says when the money runs out.`, at, ['under']);
    const first = (raw as { first?: unknown }).first;
    if (first !== undefined && !isInt(first, 1, FIRST_MAX))
      return bad('OUT_OF_BOUNDS', `${id}.${at}: first ${JSON.stringify(first)} is not a count of rows from 1 to ${FIRST_MAX}.`, at);
    /* A RANGE IS A BAND FROM A LOW TO A HIGH WITH WHAT WAS SPENT ON IT, so it names those four columns in that order: the
       drawer cannot tell which of three numbers is the low from anything but their places. */
    if ((raw as { range?: unknown }).range === true && (!Array.isArray(block.columns) || block.columns.length !== 4))
      return bad('DECLARATION_INVALID', `${id}.${at} draws its rows as ranges, so it names four columns: the label, what was spent, the low and the high.`, at);

    /* TWELFTHS, AND ONLY TWELFTHS. `06 §1.1` gives a block an order in the list and a width, and
       nothing else — no x, no y, no height. A span of 0 is a block with no width and a span of 13 is
       a row that wraps and leaves a hole; the size control refuses rather than clamping, because a
       declaration silently clamped is a number that never reached the screen (`21 §11`). */
    /* A WIDGET'S FRAME, only on a board and only a size its kind draws in (`board.ts`, `kinds/sizes.ts`). */
    const framed = widgetFault(id, at, raw as Record<string, unknown>, (body as { board?: unknown }).board === true);
    if (framed) return framed;

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

    /* THE THREE TEXTS A READER SEES, none of which was looked at. `42 §4.5` gives each a ceiling and
       this file forwarded all three unread, so `heading: 12` installed and then threw where the page
       was being drawn. Their REQUIRED-ness per kind is not decided here: `06 §1.1` marks `heading`
       required on a section, `body` on a note and `empty` on every source-bound block, and making
       any of the three required is a change to a population this file does not own, the same reason
       `requires` above is checked only when it is written. The shape is what the renderer breaks on,
       and the shape is what is checked. */
    for (const [key, value, ceiling, what] of [
      ['heading', block.heading, HEADING_BYTES, 'A heading is the words drawn over a block, and on a section it is the section itself.'],
      ['empty', block.empty, EMPTY_BYTES, 'An empty state is the sentence a reader gets when the block has no rows.'],
      ['body', block.body, BLOCK_BODY_BYTES, "A body is the block's own prose, in the dialect a note is written in."],
    ] as const) {
      if (value === undefined) continue;
      const fault = textFault(value, ceiling, at, `${id}.${at}'s ${key}`, what);
      if (fault) return fault;
    }

    /* A TARGET IS THE NUMBER A GAUGE DRAWS AGAINST, and it is on the declaration because there is
       nowhere else it could come from: a budget is a decision somebody made, not a figure in the
       rows. The renderer divides by it, so a word here is a proportion of a word; a negative one
       inverts the ladder that colours the bar, and a gauge is then worst where it is best. Zero is
       admitted because the renderer already answers for it, drawing an empty track rather than
       dividing, which is what it draws for a gauge with no target at all. */
    if (block.target !== undefined && (typeof block.target !== 'number' || !Number.isFinite(block.target) || block.target < 0))
      return bad(
        'DECLARATION_INVALID',
        `${id}.${at}'s target is ${JSON.stringify(block.target ?? null)}; a target is the number a gauge draws its value against, zero or above.`,
        at,
      );

    /**
     * A `where` IS A FILTER, WRITTEN AS A SENTENCE OR AS A TREE, and it was forwarded unread.
     *
     * `predicateOf` reads both forms, `06 §1.1` and `42 §4.5` call it a predicate, and the tree form
     * filters correctly at render, so both are admitted. Anything else is refused here because at
     * render it does not fail loudly; it fails in one of two silent directions, driven on a record:
     *
     *     table over a register, where: null, 0 or false    every row, the excluded ones included
     *     table over a register, where: '' or '   '          every row
     *     feed, actions, sessions.live: null, 0, false,
     *       12, true, [] or a tree the compiler refuses      no rows, no refusal, the empty state
     *
     * The first is `predicateOf` handing a falsy value back unrefused and the page's `list` wrapper
     * dropping a falsy `where` as though none were written. The second is `evaluate` answering
     * `false` for whatever `compile` refuses. A reader sees a filtered table that is not filtered, or
     * "Nothing yet." over rows that exist, and nothing on the page disagrees with either.
     *
     * A SENTENCE THAT SAYS NOTHING IS REFUSED TOO. The grammar reads an empty sentence as no filter,
     * which is right for a query string and wrong for a declaration: every row is what leaving the
     * key off already says, so a key written with nothing in it is a filter somebody meant to write.
     * Clauses are split on the comma exactly as `parseWhere` splits them, so `,,,` is refused here
     * for the reason the grammar refuses it at render.
     *
     * WHAT THE FILTER SAYS IS NOT CHECKED HERE, and cannot be. Every validator `where` exports needs
     * the register's `Schema` and a clock, this check has neither, and a template page's
     * `thing is {{name}}` is not a sentence until its row fills it. A field the register lacks is the
     * record's install lint to refuse, where the schema is.
     */
    if (block.where !== undefined) {
      const where = block.where;
      const tree = where !== null && typeof where === 'object' && !Array.isArray(where);
      if (!tree && typeof where !== 'string')
        return bad(
          'DECLARATION_INVALID',
          `${id}.${at}'s where is ${JSON.stringify(where ?? null)}; a filter is a sentence, such as state is open, or a predicate tree. For every row, take the key off.`,
          at,
        );
      if (typeof where === 'string' && where.split(',').every((clause) => clause.trim() === ''))
        return bad(
          'DECLARATION_INVALID',
          `${id}.${at}'s where is ${JSON.stringify(where)}, which says nothing a register can answer. Write the filter, such as state is open, or take the key off for every row.`,
          at,
        );
    }

    /* A `section`'s fold, and the icon any block may carry. Another kind carrying `fold` is refused above by
       `KEY_KINDS`; here only the shape is checked, because `fold: 'yes'` would draw a section shut by accident and an
       icon that names no glyph draws an empty well. */
    /* A FEED'S `group` AND `fold` ARE ONE WORD EACH (`day`, `run`), checked apart from a cards block's, which name a
       link field and a count, and from a section's, which is shut or not (`feedSaysFault`). */
    /* A BLOCK'S `until` IS THE LAST DAY IT SHOWS (`until.ts`), a real day or nothing. */
    const ended = untilFault(raw as Readonly<Record<string, unknown>>, `${id}.${at}`);
    if (ended) return bad('DECLARATION_INVALID', ended.fix, `${at}.${ended.at}`);
    const fed = kind === 'feed' ? feedSaysFault(raw as Readonly<Record<string, unknown>>, `${id}.${at}`) : null;
    if (fed) return bad('DECLARATION_INVALID', fed.fix, `${at}.${fed.at}`, fed.allowed);
    /* WHAT MAY BE PRESSED ON A BLOCK (`actions`, `row_actions`), checked as the read checks it (`block-keys.ts`
       `actionsFault`), against the fields of the list the block reads or writes when that list is installed. */
    const acted = actionsFault(raw as Readonly<Record<string, unknown>>, `${id}.${at}`, blockListFields(raw as Readonly<Record<string, unknown>>, installed));
    if (acted) return bad('DECLARATION_INVALID', acted.fix, `${at}.${acted.at}`, acted.allowed);
    /* A FORECAST'S `axis` IS ONE OF TWO WORDS (`forecastAxisFault`): a stray one would draw as fitted and say nothing. */
    const axised = kind === 'forecast' ? forecastAxisFault(raw as Readonly<Record<string, unknown>>, `${id}.${at}`) : null;
    if (axised) return bad('DECLARATION_INVALID', axised.fix, `${at}.${axised.at}`, axised.allowed);
    /* A `kpis` BLOCK SAYS WHAT IT IS FOR AND READS THE KEY NUMBERS (`kpisFault`), as the read checks it (`sources/kpis.ts`). */
    const kpied = kind === 'kpis' ? kpisFault(raw as Readonly<Record<string, unknown>>, `${id}.${at}`) : null;
    if (kpied) return bad('DECLARATION_INVALID', kpied.fix, `${at}.${kpied.at}`, kpied.allowed);
    /* A NOTE'S says: IS CHECKED AS THE READ CHECKS IT (block-keys.ts noteSaysFault), each sentence's when with this file's leaf check. */
    const sayed = kind === 'note' ? noteSaysFault(raw as Readonly<Record<string, unknown>>, `${id}.${at}`, whenLeafFault) : null;
    if (sayed) return bad('DECLARATION_INVALID', sayed.fix, `${at}.${sayed.at}`, sayed.allowed);
    if (kind !== 'cards' && kind !== 'feed' && block.fold !== undefined && typeof block.fold !== 'boolean')
      return bad('DECLARATION_INVALID', `${id}.${at}'s fold is true or false: whether the section starts shut.`, at);
    if ((kind === 'cards' || kind === 'series') && block.most !== undefined && !isInt(block.most, 1, 24))
      return bad('DECLARATION_INVALID', `${id}.${at}'s most is how many it shows before "Show all", a whole number from 1 to 24.`, `${at}.most`);
    /* A GROUPED `lines` BLOCK'S `most:` IS HOW MANY READINGS IT LISTS under the lines (`MEASURES_LISTED` at most). */
    if (kind === 'lines' && block.most !== undefined && !isInt(block.most, 1, MEASURES_LISTED))
      return bad('DECLARATION_INVALID', `${id}.${at}'s most is how many readings a grouped lines block lists, a whole number from 1 to ${MEASURES_LISTED}.`, `${at}.most`);
    const grouped = kind === 'cards' || kind === 'table' ? cardGroupFault(id, at, raw as Readonly<Record<string, unknown>>, installed) : null;
    if (grouped) return grouped;
    if (block.icon !== undefined && (typeof block.icon !== 'string' || !GLYPH.test(block.icon)))
      return bad('DECLARATION_INVALID', `${id}.${at}'s icon is a glyph name: lower-case letters, digits and dashes.`, at);
    const unknown = typeof block.icon === 'string' ? glyphFault(block.icon) : null;
    if (unknown) return bad(unknown.code, `${id}.${at}: ${unknown.fix}`, `${at}.icon`, unknown.allowed);

    /**
     * A `capture` IS BOUND BY `register:`, WHICH IS WHERE A NEW ROW GOES, and it reads nothing.
     *
     * The key is the list's own id rather than a `source:`, because a source is something a block
     * reads and a capture reads no row: a `source:` on one is a second block somebody meant to declare,
     * and admitting both would leave the page deciding which of the two the author meant. A register
     * the page does not require is the same outlived page `source:` is checked for below: a capture
     * line into a list that was uninstalled from under it.
     *
     * A CAPTURE WITH NO `register:` INSTALLS, AND ITS READ REFUSES IT (`pages.ts` `captureBlock`), which
     * is where a `diff` with no `row:` is refused too. Whether a key is required per kind is not decided
     * in this function, for the reason the three texts below give, and `declare.test.ts` holds that by
     * installing every kind bare: refusing it here went red there on the first run.
     */
    /* AN `inputs` BLOCK IS BOUND THE SAME WAY, for the same reason: it edits one row of `register:` and names its list by
       that key, so a `source:` beside it would be a second list. */
    if (kind === 'capture' && block.source !== undefined)
      return bad('DECLARATION_INVALID', `${id}.${at} is a capture and reads ${String(block.source)} as well. A capture writes into register: and reads nothing, so take the source off.`, at);
    if (kind === 'inputs' && block.source !== undefined)
      return bad('DECLARATION_INVALID', `${id}.${at} is inputs and reads ${String(block.source)} as well. Inputs edit one row of register:, so write register: ${String(block.source).replace(/^register\./u, '')} and take the source off.`, at);
    /* AND THE ROW IS NAMED BY `row:`, WHICH `06 §1.1` SAYS AND THE READ DOES. `where:` installed here and nothing read
       it: a block installed with `where: name is Two` drew row One, and typing into it wrote row One. Refused here, in
       the sentence the read refuses a hand-made block in. */
    if (kind === 'inputs' && block.where !== undefined)
      return bad('DECLARATION_INVALID', `${id}.${at} is inputs, which edit the one row that row: names and read no where:. Name the row with row:, such as row: ${typeof block.register === 'string' ? block.register : 'checks'}#2.`, at);
    if ((kind === 'capture' || kind === 'inputs' || kind === 'form') && block.register !== undefined) {
      if (typeof block.register !== 'string' || !REGISTER_ID.test(block.register))
        return bad('DECLARATION_INVALID', `${id}.${at}'s register is ${JSON.stringify(block.register)}; it is a register's id, such as tasks.`, at);
      if (declared.size > 0 && !declared.has(`register.${block.register}`))
        return bad(
          'DEPENDENCY_UNRESOLVED',
          `${id}.${at} ${kind === 'inputs' ? 'edits a row of' : 'adds rows to'} ${block.register}, and ${id} does not require register.${block.register}. Every register a block writes to is named in requires, or the page outlives its list.`,
          at,
          [...declared],
        );
    }

    if (block.source !== undefined) {
      const source = block.source;
      if (
        typeof source !== 'string' ||
        !sourceKnown(source)
      )
        return bad(
          'DECLARATION_INVALID',
          `${id}.${at} reads ${JSON.stringify(source ?? null)}; a block's source is register.<id>, metric.<id> (or metric.<id>:<parameter>) or block.<n>.`,
          at,
        );
      /* `42 §4.5`: *"every register any block reads must be here"*, and this is the half of
         `DEPENDENCY_UNRESOLVED` that needs no record at all. A block reading a register the page does
         not require is a page that survives the uninstall of the pack holding its rows — it stays in
         the nav and draws an empty table under a heading that promises one. */
      /* THE RUNS WORKING NOW ARE THE CLOCK'S TO CHOOSE AND TO ORDER, so a page cannot count another "working" under the
         same name. Refused here as `pages.ts` refuses it when read, so the page never installs to draw a refusal. */
      if (source === 'sessions.working' && (block.where !== undefined || (Array.isArray(block.order) && block.order.length > 0)))
        return bad(
          'DECLARATION_INVALID',
          block.where !== undefined
            ? `${id}.${at} reads sessions.working, which is every run working now, so it takes no where. Read sessions.live to choose among runs.`
            : `${id}.${at} reads sessions.working, which comes the most recently heard from first, so it takes no order.`,
          `${at}.${block.where !== undefined ? 'where' : 'order'}`,
        );
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
      for (const cell of cells as { metric?: unknown; label?: unknown }[]) {
        /* THE PARAMETER IS PART OF THE NAME AND NOT PART OF THE ID. `project-owed:Kiln` is one
           document read about one project (`pages.ts` splits on the FIRST colon), so the id being
           checked is the half before it. */
        if (typeof cell?.metric !== 'string' || !METRIC_ID.test(metricNamed(cell.metric)))
          return bad('DECLARATION_INVALID', `${id}.${at} names ${JSON.stringify(cell?.metric ?? null)} as a figure, and a figure is a metric id.`, at);
        /* AND THE LABEL, WHICH IS A SHAPE WITHOUT BEING REQUIRED. `42 §4.5` writes a cell as
           `{ metric, label }` and this checked only the metric, so `label: 12` reached the same
           escaping the three texts above go through and threw there. It stays OPTIONAL: a cell
           without one is drawn under the metric's own name, which is a word the reader can still
           act on, so there is nothing to refuse an author for. What is refused is a label that is
           not text at all. */
        /* A NOTE IS THE LINE UNDER A FIGURE, in place of its target, and may name other figures as {{id}}. */
        const note = (cell as { note?: unknown }).note;
        if (note !== undefined) {
          const said = textFault(note, EMPTY_BYTES, at, `${id}.${at}'s note for ${String(cell.metric)}`, 'A note is the line drawn under a figure.');
          if (said) return said;
        }
        if (cell.label === undefined) continue;
        const fault = textFault(cell.label, LABEL_BYTES, at, `${id}.${at}'s label for ${String(cell.metric)}`, 'A label is what a figure is called on the screen.');
        if (fault) return fault;
      }
    }

    /**
     * AUTHORED ROWS: the rows of a block nobody queries, and the key with the most ways to throw.
     *
     * A block is bound to a register or it is written out by hand, and the hand-written half is a
     * list of rows, each one a `cells` list with an optional tone. Every part of that was forwarded
     * unread: `authored: "two"` installed, and so did a row with no `cells` list at all, and both
     * are drawn by mapping over a list that is not there. That is the TypeError this whole pass is
     * about, and a row with no `cells` is the commonest shape of it because a row LOOKS complete
     * with a tone on it and nothing else.
     *
     * A ROW CEILING, because authored rows are rows: `limit` caps what a block draws from a register
     * at five hundred, and a block carrying its rows in the declaration is held to the same number.
     *
     * THE CELL COUNT PER ROW IS DELIBERATELY NOT CHECKED. `05 §2.1` is explicit that a row with more
     * cells than its kind takes degrades AT RENDER, with the block shown as it was written, and that
     * nothing is refused at write for it. Refusing here would contradict the document and would need
     * the renderer's per-kind arity table, which this package cannot import (`31 §2`).
     */
    if (block.authored !== undefined) {
      const authored = block.authored;
      if (!Array.isArray(authored) || authored.length === 0)
        return bad(
          'DECLARATION_INVALID',
          `${id}.${at}'s authored is ${JSON.stringify(authored ?? null)}; authored rows are a list, each row { cells: [text] }. Write the rows out, or take the key off.`,
          at,
        );
      if (authored.length > AUTHORED_CEILING)
        return bad('OUT_OF_BOUNDS', `${id}.${at} writes out ${authored.length} rows, and a block draws at most ${AUTHORED_CEILING}.`, at);

      /* A BLOCK DECLARING BOTH A SOURCE AND AUTHORED ROWS IS REFUSED RATHER THAN RESOLVED. Picking
         one would be a silent decision about where a block's content comes from, made on behalf of
         whoever wrote the declaration. The renderer already refuses it where it draws, in these
         words; refused here, the page never reaches a reader in that state at all. */
      if (block.source !== undefined)
        return bad(
          'DECLARATION_INVALID',
          `${id}.${at} reads ${String(block.source)} and writes its rows out as well. Keep one: source: reads a register, and authored: is written out by hand.`,
          at,
        );

      for (const row of authored as { cells?: unknown; tone?: unknown }[]) {
        if (row === null || typeof row !== 'object' || Array.isArray(row) || !Array.isArray(row.cells) || row.cells.length === 0)
          return bad(
            'DECLARATION_INVALID',
            `${id}.${at} has an authored row with no cells. Every row is { cells: [text] }, with at least one cell in it.`,
            at,
          );
        for (const cell of row.cells)
          if (typeof cell !== 'string')
            return bad('DECLARATION_INVALID', `${id}.${at} has an authored cell of ${JSON.stringify(cell ?? null)}, and a cell is text.`, at);
        if (row.tone !== undefined && !(TONES as readonly unknown[]).includes(row.tone))
          return bad(
            'DECLARATION_INVALID',
            `${id}.${at}: ${JSON.stringify(row.tone)} is not an intent on an authored row.`,
            at,
            TONES as unknown as string[],
          );
      }
    }

    /* A LEAF WITH `metric:` IN PLACE OF `field:` (`06 §1`), evaluated at render and never compiled.
       A `when:` naming nothing is a block that is either always drawn or never — and both of those
       are indistinguishable from the block working. */
    if (block.when !== undefined) {
      const fault = whenFault(block.when, `${id}.${at}'s when`);
      if (fault) return bad('DECLARATION_INVALID', fault, at);
    }

    if (block.columns !== undefined) {
      const columns = block.columns;
      if (!Array.isArray(columns) || columns.length === 0 || columns.length > COLUMN_CEILING)
        return bad('DECLARATION_INVALID', `${id}.${at} draws one to ${COLUMN_CEILING} columns.`, at);
      const roles = new Map<string, number>();
      for (const column of columns as { field?: unknown; or?: unknown; as?: unknown; metric?: unknown; edit?: unknown; kpi?: unknown }[]) {
        /* `kpi: headline` IS A CARD'S TREND READ FROM THE KEY NUMBER ITS PROJECT LEADS WITH (`pages.ts` `trendsOf`), the
           figure beside it drawn only on a card whose project keeps none. So it rides a trend column over a figure, and a
           `kpi:` anywhere else would install and draw nothing. */
        if (column !== null && typeof column === 'object' && column.kpi !== undefined) {
          if (column.kpi !== 'headline')
            return bad('DECLARATION_INVALID', `${id}.${at} gives a column kpi: ${JSON.stringify(column.kpi)}, and kpi reads the key number a project's card leads with. Write kpi: headline.`, at, ['headline']);
          if (block.kind !== 'cards' || column.as !== 'trend' || column.metric === undefined)
            return bad('DECLARATION_INVALID', `${id}.${at} gives a column kpi:, which only a card's trend over a figure reads: { metric, kpi: headline, as: trend } on a cards block.`, at);
        }
        /* A CARD'S FACT MAY NAME A FIGURE (`card-facts.ts`), asked first so a fact's edit: is refused in a fact's words.
           It counts in the same roles as the field facts, so figures and fields share CARD_FACTS. */
        if (column !== null && typeof column === 'object' && column.as === 'fact' && column.metric !== undefined) {
          const fault = cardFactFault(id, at, column, block.kind);
          if (fault) return bad('DECLARATION_INVALID', fault, at);
          const n = (roles.get('fact') ?? 0) + 1;
          roles.set('fact', n);
          if (n > CARD_FACTS) return bad('OUT_OF_BOUNDS', `${id}.${at} has ${n} columns as fact. A card takes one of each role, one figure among them, and at most ${CARD_FACTS} facts.`, at);
          continue;
        }
        /* `edit: true` IS A CARD'S LINE TYPED ON IN PLACE, written to the one field it draws, so it is a card's,
           it names that field alone, and it is a line drawn as words. Whether the field is text is the read's to say,
           where the list is in hand: a field that is not text draws as text, as on a reader who cannot write. */
        if (column !== null && typeof column === 'object' && column.edit !== undefined) {
          if (typeof column.edit !== 'boolean')
            return bad('DECLARATION_INVALID', `${id}.${at} gives a column edit: ${JSON.stringify(column.edit)}, and edit is true or false. Write edit: true.`, at);
          if (column.edit) {
            if (block.kind !== 'cards')
              return bad('DECLARATION_INVALID', `${id}.${at} is ${String(block.kind)} and gives a column edit: true, which only a card's line reads. Take edit: off, or draw the block as cards.`, at);
            if (column.metric !== undefined)
              return bad('DECLARATION_INVALID', `${id}.${at} gives a ${column.as === 'when' ? 'when' : 'trend'} column edit: true, and a ${column.as === 'when' ? 'when over a figure' : 'trend'} is a figure BrainDog works out, never typed. Take edit: off the ${column.as === 'when' ? 'when' : 'trend'}.`, at);
            if (column.or !== undefined)
              return bad('DECLARATION_INVALID', `${id}.${at} gives a column edit: true and an or:, so a line typed on could be either field. Take the or: off, or edit: off.`, at);
            if (typeof column.field !== 'string' || column.field === '')
              return bad('DECLARATION_INVALID', `${id}.${at} gives a column edit: true and no field, and a line typed on is written to the field it names. Name the field with field:.`, at);
            const role = column.as === undefined ? 'fact' : column.as;
            if (typeof role !== 'string' || !CARD_EDIT_ROLES.includes(role))
              return bad(
                'DECLARATION_INVALID',
                `${id}.${at} gives a column as ${JSON.stringify(column.as)} edit: true, and only a line drawn as words is typed on: ${CARD_EDIT_ROLES.join(', ')}. Take edit: off, or put it on one of those.`,
                at,
                CARD_EDIT_ROLES as string[],
              );
          }
        }
        /* A CARD'S TREND MAY NAME A FIGURE IN PLACE OF A FIELD, grouped by a date bucket and read once a card with
           `{{field}}` in its id filled from the card's row (`pages.ts` `trendsOf`). AND SO MAY ITS WHEN (W096,
           REC-C16): one number a card, the days since its project was worked on, read the same way (`whensOf`).
           Nothing else draws a figure in a column, so a `metric:` anywhere else would install and draw nothing. */
        if (column !== null && typeof column === 'object' && column.metric !== undefined) {
          if (block.kind !== 'cards' || (column.as !== 'trend' && column.as !== 'when'))
            return bad('DECLARATION_INVALID', `${id}.${at} gives a column a metric:, which only a card's fact, trend or when reads: { metric, as: fact, label }, { metric, as: trend } or { metric, as: when } on a cards block.`, at);
          if (column.field !== undefined)
            return bad('DECLARATION_INVALID', `${id}.${at} gives a column both a field and a metric. A trend column names the figure alone.`, at);
          if (column.or !== undefined)
            return bad('DECLARATION_INVALID', `${id}.${at} gives a trend column an or:, which is a second field to read. A trend column names the figure alone.`, at);
          if (typeof column.metric !== 'string' || !METRIC_ID.test(metricNamed(column.metric)))
            return bad('DECLARATION_INVALID', `${id}.${at}'s trend names a figure by its id, with {{field}} after a colon for a figure of each card, as project-done-by-week:{{name}}.`, at);
          const role = column.as;
          const n = (roles.get(role) ?? 0) + 1;
          roles.set(role, n);
          if (n > 1) return bad('OUT_OF_BOUNDS', `${id}.${at} has ${n} columns as ${role}. A card takes one of each role, one figure among them, and at most ${CARD_FACTS} facts.`, at);
          continue;
        }
        if (typeof column?.field !== 'string' || column.field === '')
          return bad('DECLARATION_INVALID', `${id}.${at} names ${JSON.stringify(column?.field ?? null)} as a column, and a column names a field.`, at);
        /* `or:` IS A SECOND FIELD, read where the first holds nothing (`pages.ts`), so it is a name as `field` is. Whether
           the list declares it is the read's to say, where the list is in hand. */
        if (column.or !== undefined && (typeof column.or !== 'string' || column.or === ''))
          return bad('DECLARATION_INVALID', `${id}.${at} names ${JSON.stringify(column.or ?? null)} as a column, and a column names a field.`, at);
        /* `as` IS A COLUMN'S ROLE ON A CARD, and only a `cards` block reads it. On any other kind it
           would install and draw nothing different, so it is refused there. */
        if (column.as === undefined) continue;
        /* EXCEPT `scope`, which the page layer fills with where the row applies, on any kind but a card. */
        if (column.as === 'scope' && block.kind !== 'cards') continue;
        /* AND `chip`, a timeline's sixth cell: the icon and colour of the row a link points at (a ledger line's category). */
        if (column.as === 'chip') {
          if (block.kind === 'timeline') continue;
          return bad('DECLARATION_INVALID', `${id}.${at} gives a column as chip, which draws a timeline row's mark, and ${String(block.kind)} draws none.`, at);
        }
        if (block.kind !== 'cards')
          return bad('DECLARATION_INVALID', `${id}.${at} gives a column as, which is its role on a card, and only a cards block reads it.`, at);
        /* ON A CARD, `scope` IS A FACT that says where the row applies, "Everywhere" for a row of no project. */
        const role = column.as === 'scope' ? 'fact' : column.as;
        if (typeof role !== 'string' || !(CARD_ROLES as readonly string[]).includes(role))
          return bad('ENUM_VALUE_UNKNOWN', `${id}.${at}: ${JSON.stringify(column.as)} is not a role on a card.`, at, CARD_ROLES);
        const n = (roles.get(role) ?? 0) + 1;
        roles.set(role, n);
        if (n > (role === 'fact' ? CARD_FACTS : 1))
          return bad(
            'OUT_OF_BOUNDS',
            `${id}.${at} has ${n} columns as ${role}. A card takes one of each role, one figure among them, and at most ${CARD_FACTS} facts.`,
            at,
          );
      }
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

  /* AND THE REGISTER IS THERE, WHICH IS THE ONLY HALF A DOCUMENT CANNOT ANSWER ALONE. `04 §5` gives
     this its own code and its own sentence: a page whose register never arrived is a nav entry that
     opens an empty screen, and `06 §1` says that is worse than no nav entry at all. Checked here,
     after every block, so a block-level fault (a bad kind, a bad key, an unresolved source) is what a
     reader hears first: the page-wide `requires` gap is real either way, but it is not the fault that
     was typed. */
  if (Array.isArray(requires) && installed) {
    for (const want of requires as string[]) {
      if (!installed.has(want))
        return bad(
          'DEPENDENCY_UNRESOLVED',
          `${id} requires ${want}: not installed. Install the pack that declares it first, or use --with-deps.`,
          'requires',
        );
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

/**
 * The seven channels an ingest declares: `30 §1`'s five, which `inbox_raw` holds, and `call` and `poll`,
 * the two scheduled actions (`07 §1`, amended). Closed, because `arrive` and the runner each have an arm
 * per channel. A `poll`'s answer arrives as `pull`, so the table's five stay five.
 */
const CHANNELS_IN = ['email', 'webhook', 'pull', 'paste', 'api', 'call', 'poll'] as const;

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

/** `43 §4.3`'s two ceilings on a combinator's arguments: `first` takes 2–8 forms, `nth` counts 1–64. */
const FIRST_ARMS = 8;
const NTH_CEILING = 64;

/**
 * `42 §4.7`: what `inbox_raw` holds, and therefore everything a `match:` can be about.
 *
 * READ OFF THE SCHEMA THE MATCHER ACTUALLY RUNS AGAINST, and it used to be a second copy typed
 * here. The two disagreed: this list published seven names and `ingest.ts`'s `ARRIVAL` declared
 * five, so `match: { field: state }` and `match: { field: ts }` installed cleanly and then never
 * fired, because `evaluate` answers false for what `compile` would refuse. An ingest that never
 * fires and an ingest that fires correctly look identical from the outside, which is that file's
 * own sentence about itself. A hand-kept list beside a schema is how they came to disagree, and
 * one list is the only arrangement under which they cannot again.
 */
const MATCH_FIELDS = Object.keys(INBOX_RAW.fields) as readonly string[];

/**
 * The operators `34 §1.9` refuses on this backend, whatever the field's type would otherwise take.
 *
 * THE FIELD AXIS WAS CHECKED AND THE OPERATOR AXIS WAS NOT, so `matches`, `has` and `lacks`
 * installed and never fired, and `starts` and `ends` installed and DID fire where the document
 * refuses them: wider than published in one direction and silent in the other. `38 §13` already
 * publishes the sentence a person should get, so this says it in those words.
 */
/* `INBOX_RAW_REFUSES`, and not a copy of it. See `MATCH_FIELDS` below for what the copy cost. */

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
/** `42 §4.7`'s dedupe row, as a shape. Field existence is the register's to answer; this is the name. */
function dedupeFault(dedupe: unknown, id: string): Refusal | null {
  if (dedupe === undefined || dedupe === null) return null;
  const at = 'dedupe';
  const wrong = (said: string) => bad('DECLARATION_INVALID', `${id}'s dedupe ${said}`, at);
  const names = (list: unknown, most: number, what: string): Refusal | null => {
    if (!Array.isArray(list) || list.length === 0 || list.length > most)
      return wrong(`${what} is 1 to ${most} field ids.`);
    const notOne = list.find((f) => typeof f !== 'string' || !IDENT.test(f));
    return notOne === undefined ? null : wrong(`names ${JSON.stringify(notOne)} as a field, and it is not one.`);
  };
  if (Array.isArray(dedupe)) return names(dedupe, 4, 'is a field list, which');
  if (typeof dedupe !== 'object') return wrong('is a field list, or { near: { on, day, prefix } }. 07 §2.');
  const near = (dedupe as { near?: unknown }).near;
  if (near === null || typeof near !== 'object') return wrong('is a field list, or { near: { on, day, prefix } }. 07 §2.');
  const { on, day, prefix } = near as { on?: unknown; day?: unknown; prefix?: unknown };
  const wrongOn = names(on, 4, "near.on, which");
  if (wrongOn) return wrongOn;
  if (typeof day !== 'string' || !IDENT.test(day)) return wrong(`dates rows by ${JSON.stringify(day ?? null)}, and it is not a field.`);
  if (prefix === undefined || prefix === null) return null;
  const { field, chars } = prefix as { field?: unknown; chars?: unknown };
  if (typeof field !== 'string' || !IDENT.test(field)) return wrong(`compares the prefix of ${JSON.stringify(field ?? null)}, and it is not a field.`);
  if (chars !== undefined && (typeof chars !== 'number' || !Number.isInteger(chars) || chars < 1 || chars > 64))
    return bad('OUT_OF_BOUNDS', `${id}'s dedupe compares 1 to 64 characters of ${field}.`, at);
  return null;
}

/**
 * `42 §4.7`'s `writes.register` when it is a table rather than a name — `43 §5.1` step 6.
 *
 * A `by` ID IS A FIELD, OR A MONEY FIELD'S CURRENCY, and nothing else reaches inside a value. The
 * rest is arithmetic a person gets wrong once and cannot see afterwards: a `when` that is shorter
 * or longer than `by` can never equal it, so the table is a table every row misses, and every
 * arrival lands in `review` with a reason about routing rather than about the typo.
 */
function routeFault(register: unknown, id: string): Refusal | null {
  if (typeof register === 'string') return IDENT.test(register) ? null : bad('DECLARATION_INVALID', `${id} writes to ${JSON.stringify(register)}, and it is not a register.`, 'writes.register');
  if (register === null || typeof register !== 'object')
    return bad('DECLARATION_INVALID', `${id} writes to a register, or to a table of them: { by, to }.`, 'writes.register');
  const { by, to } = register as { by?: unknown; to?: unknown };
  if (!Array.isArray(by) || by.length === 0 || by.length > ROUTE_BY_MOST)
    return bad('DECLARATION_INVALID', `${id}'s routing table routes on 1 to ${ROUTE_BY_MOST} fields.`, 'writes.register.by');
  const notOne = by.find((f) => typeof f !== 'string' || !(IDENT.test(f) || (f.endsWith('.currency') && IDENT.test(f.slice(0, -'.currency'.length)))));
  if (notOne !== undefined)
    return bad(
      'DECLARATION_INVALID',
      `${id}'s routing table routes on ${JSON.stringify(notOne)}, and a route reads a field or a money field's currency.`,
      'writes.register.by',
    );
  if (!Array.isArray(to) || to.length === 0 || to.length > ROUTE_TO_MOST)
    return bad('DECLARATION_INVALID', `${id}'s routing table has 1 to ${ROUTE_TO_MOST} rows.`, 'writes.register.to');
  for (const [i, row] of to.entries()) {
    const at = `writes.register.to[${i}]`;
    if (row === null || typeof row !== 'object' || Array.isArray(row)) return bad('DECLARATION_INVALID', `${id}'s ${at} is { when, register }.`, at);
    const { when, register: target } = row as { when?: unknown; register?: unknown };
    if (typeof target !== 'string' || !IDENT.test(target))
      return bad('DECLARATION_INVALID', `${id}'s ${at} sends its rows to ${JSON.stringify(target ?? null)}, and it is not a register.`, `${at}.register`);
    if (!Array.isArray(when) || when.length !== by.length)
      return bad(
        'DECLARATION_INVALID',
        `${id} routes on ${by.length} field${by.length === 1 ? '' : 's'} and ${at} answers with ${Array.isArray(when) ? when.length : 0}, so no row can ever equal it.`,
        `${at}.when`,
      );
    const notText = when.find((v) => typeof v !== 'string' || v === '' || v.length > ROUTE_VALUE_MOST);
    if (notText !== undefined)
      return bad('DECLARATION_INVALID', `${id}'s ${at} matches on a value that is not text of 1 to ${ROUTE_VALUE_MOST} characters.`, `${at}.when`);
  }
  return null;
}

/** `42 §4.7`'s routing table, bounded: fields routed on, rows in the table, and a value's length. */
const ROUTE_BY_MOST = 4;
const ROUTE_TO_MOST = 64;
const ROUTE_VALUE_MOST = 200;

/**
 * `writes.set`: field ids mapped to a fixed value, checked the same as `dedupe:` and a route's `by` (`IDENT`, the same
 * identifier a field id anywhere else must be), because this key becomes a row's field the same way an extracted one
 * does. The value itself is left as the pack wrote it: a `{{config:<key>}}` inside it is filled at install by
 * `fillConfig`, well before this ever runs, and a literal string needs no further shape here.
 */
function setFault(set: unknown, id: string): Refusal | null {
  if (set === undefined) return null;
  if (set === null || typeof set !== 'object' || Array.isArray(set))
    return bad('DECLARATION_INVALID', `${id}'s writes.set is a map of field ids to a fixed value.`, 'writes.set');
  for (const [field, value] of Object.entries(set)) {
    if (!IDENT.test(field))
      return bad('DECLARATION_INVALID', `${id}'s writes.set names ${JSON.stringify(field)} as a field, and it is not one.`, 'writes.set');
    if (typeof value !== 'string' || value.length > ROUTE_VALUE_MOST)
      return bad('DECLARATION_INVALID', `${id}'s writes.set.${field} is text of at most ${ROUTE_VALUE_MOST} characters.`, `writes.set.${field}`);
  }
  return null;
}

/** `42 §4.7`'s two caps on a skip list: how many rules, and how long a reason a person has to read. */
const SKIP_MOST = 16;
const SKIP_REASON_MOST = 120;

/**
 * `25 §3.2`'s `verify:` on a webhook ingest, the half of it that is built: `{ kind: path }`, a random segment in the URL.
 *
 * NOTHING READ THIS KEY, SO EVERY SPELLING OF IT INSTALLED. Measured against `validate` at `1c9bb0f0`:
 * `verify: { kind: path }` on an email ingest, `verify: { kind: hmac_sha256, header }` with no key behind it, a path
 * token written into the declaration itself, and the bare word `verify: path` were all answered `null`, and the record
 * answers `{ kind: 'none' }` for every webhook ingest whatever it carries. A person who wrote one had every reason to
 * believe the ingest was verified, and every arrival at it was stored `untriaged`, which is correct behaviour with
 * nothing to say why.
 *
 * ONLY A WEBHOOK, because it is the only channel whose door this record's host terminates with a URL a sender is given
 * (`packages/host/src/ingest.ts`). Mail is verified by the host's own DKIM check (`packages/host/src/dkim.ts`), and `pull`, `call`
 * and `poll` are fetched by the record itself, so a `verify:` on any of them would be a promise nothing keeps.
 *
 * A SIGNATURE NAMES ITS KEY BY THE KEYCHAIN LABEL, AND BY NOTHING ELSE. `hmac_sha256` was refused by name until a door
 * could open a key: nothing bound a grant to an ingest, so a declaration naming one installed and verified nothing,
 * which is the fault above. `ingestVerify` in `packages/record/src/index.ts` now finds the key the label names, the
 * host opens it and checks the raw body (`packages/host/src/ingest.ts`), and `stripe` and `github` are the same check
 * in the shapes those two senders sign. A label that looks like a key is refused for the token's reason below: a key
 * pasted into `key:` would be a credential in every export, plan and diff at once.
 *
 * `tolerance` IS STRIPE'S ALONE, because Stripe is the one sender here that signs the time along with the body. GitHub
 * signs the body and nothing else, and neither does a bare HMAC, so a tolerance on either would be a promise nothing
 * keeps. The same bytes sent again are one arrival whatever the window (`kernel.arrive` keys on their digest), so what
 * the window refuses is a body signed long ago and posted again with a new time nobody could have signed.
 *
 * AND THE TOKEN IS NEVER IN A DECLARATION. A declaration is exported, planned, diffed and shown to every agent that reads
 * `arrangement`, so a token written here would be a credential in all of those at once. `{ kind: path }` says a token is
 * wanted; the token itself is minted outside the declaration and shown once.
 *
 * WHY THE SHORTCUT GETS WEBHOOK TWINS OF THE `bank-*` PATTERNS AND NOT A CHANNEL LIST ON EACH. Either would work. The
 * list is the better grammar: one declaration per wording, read the same whichever way it arrived. It is also a change
 * to `07 §3`'s `channel:`, which is one word here, in `IngestDecl`, and in `arrive`'s `i.channel === arrival.channel`
 * (`ingest.ts`), and that makes it a `docs/07` row before it is code. A twin changes nothing anybody reads: it is one
 * more declaration of an existing shape, carrying this key.
 *
 * THE URL'S INGEST ID CHOOSES THE PATTERN AS WELL AS THE VERIFIER. When neither host handed the id to `arrive`, a
 * verified arrival was offered every webhook pattern; both hosts hand it now (`arrivalDoor` in
 * `apps/selfhost/src/server.ts`, the spread in the Worker's `arrivals()`, held by
 * `apps/worker/test/arrive-ingest-handoff.test.ts`), and `arrive` offers a named arrival its own ingest's pattern and
 * no other. So one twin's URL read one wording, and a phone posting six needed six URLs. `door:` (`doorFault` below) is
 * how several patterns share one: each names the twin whose URL it reads.
 */
function verifyFault(id: string, channel: string, verify: unknown): Refusal | null {
  if (verify === undefined) return null;
  if (channel !== 'webhook')
    return bad('DECLARATION_INVALID', `${id} arrives by ${channel}, and only a webhook is verified at its door. Take verify out, or declare channel: webhook.`, 'verify');
  const kind = verify !== null && typeof verify === 'object' && !Array.isArray(verify) ? (verify as { kind?: unknown }).kind : undefined;
  if ((SIGNED_KINDS as readonly unknown[]).includes(kind)) return signedFault(id, kind as string, verify as Record<string, unknown>);
  if (kind !== 'path')
    return bad('DECLARATION_INVALID', `${id}'s verify is { kind: path }, or a signature: { kind: hmac_sha256, stripe or github, key: <keychain label> }.`, 'verify', VERIFY_KINDS);
  const stray = Object.keys(verify as object).find((k) => k !== 'kind');
  if (stray === 'token')
    return bad('DECLARATION_INVALID', `${id}'s verify carries a token, and a token is never in a declaration: it is minted and shown once. Keep { kind: path }.`, 'verify');
  if (stray !== undefined) return bad('DECLARATION_INVALID', `${id}'s verify declares ${stray}, and { kind: path } takes nothing else.`, 'verify', ['kind']);
  return null;
}

/** The three signatures a webhook door checks over the raw body, beside the path token. */
const SIGNED_KINDS = ['hmac_sha256', 'stripe', 'github'] as const;

/** Every `verify.kind` there is, for the refusal's `allowed` list. */
const VERIFY_KINDS: readonly string[] = ['path', ...SIGNED_KINDS];

/** What a signed `verify:` may say. `tolerance` is refused below on anything but Stripe. */
const SIGNED_KEYS: readonly string[] = ['kind', 'header', 'key', 'tolerance'];

/** A header name as HTTP spells one. The host asks for it in any case, so the case written here does not matter. */
const HEADER_NAME = /^[A-Za-z0-9-]{1,64}$/u;

/** The keychain's own ceiling on a label (`depositGrant` in `packages/record/src/index.ts`), so any label it takes fits. */
const KEY_LABEL_MOST = 120;

/**
 * The widest window a Stripe door may ask for, in milliseconds: an hour, twelve times Stripe's own five minutes.
 *
 * A CEILING BECAUSE THE WINDOW IS THE WHOLE OF THE REPLAY DEFENCE. A body Stripe signed is good for as long as the
 * window says, and a declaration asking for a year would make every event Stripe ever sent a working post.
 */
const TOLERANCE_MOST_MS = 3_600_000;

/**
 * The fault in a signed `verify:`, or `null`: a key named by its keychain label, a header if the sender's is not the usual
 * one, and a tolerance on Stripe's alone. The label is checked for shape here and for presence at the door, where a
 * key nobody has added verifies nothing and every arrival is stored `untriaged` (`ingestVerify`).
 */
function signedFault(id: string, kind: string, verify: Record<string, unknown>): Refusal | null {
  const stray = Object.keys(verify).find((k) => !SIGNED_KEYS.includes(k));
  if (stray === 'token' || stray === 'secret')
    return bad('DECLARATION_INVALID', `${id}'s verify carries a ${stray}, and a secret is never in a declaration. Put it in the keychain and name it: key: <keychain label>.`, 'verify');
  if (stray !== undefined) return bad('DECLARATION_INVALID', `${id}'s verify declares ${stray}, and { kind: ${kind} } takes a key, a header and nothing else.`, 'verify', SIGNED_KEYS);
  const key = verify.key;
  if (typeof key !== 'string' || key.trim() === '')
    return bad('DECLARATION_INVALID', `${id}'s verify names no key. Add the signing secret to the keychain, then name it here: key: <keychain label>.`, 'verify');
  if (key.length > KEY_LABEL_MOST) return bad('DECLARATION_INVALID', `${id}'s verify key is a keychain label, at most ${KEY_LABEL_MOST} characters.`, 'verify');
  if (looksLikeCredential(key))
    return bad('DECLARATION_INVALID', `${id}'s verify key looks like the secret itself, and a secret is never in a declaration. Put it in the keychain and name it by its label.`, 'verify');
  if (verify.header !== undefined && (typeof verify.header !== 'string' || !HEADER_NAME.test(verify.header)))
    return bad('DECLARATION_INVALID', `${id}'s verify header is the name of the header the signature arrives in, such as X-Signature.`, 'verify');
  if (verify.tolerance === undefined) return null;
  if (kind !== 'stripe')
    return bad('DECLARATION_INVALID', `${id}'s verify is ${kind}, which signs no time, so a tolerance would check nothing. Take tolerance out.`, 'verify');
  const ms = typeof verify.tolerance === 'string' ? intervalMs(verify.tolerance) : null;
  if (ms === null || ms < 1_000 || ms > TOLERANCE_MOST_MS)
    return bad('DECLARATION_INVALID', `${id}'s verify tolerance is how far a signature's time may be from now, from 1s to 60m, such as 5m.`, 'verify');
  return null;
}

/**
 * `door:` on a webhook ingest: the id of another webhook ingest whose URL this pattern also reads (`IngestDecl.door`).
 *
 * NOTHING READS AN UNKNOWN KEY ON AN INGEST, SO A DOOR THAT COULD NEVER OPEN INSTALLED. Measured with this call taken
 * out, over the five cases `test/ingest-door.test.ts` refuses: `door: 'ghost'`, a door that is an email ingest, a door
 * on a webhook with no `verify:`, `door: 7`, and an email pattern naming a real door all installed clean. Each is a
 * pattern offered nothing for ever, and from outside it looks exactly like a wording that has not arrived yet.
 *
 * A DOOR IS AN INSTALLED WEBHOOK THAT TAKES A PATH TOKEN, because that is the only ingest a URL can name with a verdict
 * attached. Without `verify: { kind: path }` the record answers `none` for it (`ingestVerify`), every arrival there is
 * stored unverified, and no pattern at it is ever tried. The pattern naming it must be a webhook too: an email pattern
 * is offered mail, which names no ingest.
 *
 * WHETHER THE DOOR EXISTS IS A QUESTION ABOUT TWO DOCUMENTS, so it is asked only when `installed` is given, and the
 * batch counts as installed: a pack that ships the door and the patterns naming it in one call is not refused for the
 * order they are listed in. `validate(decl)` with no context checks the shape and nothing else, as `Known` says.
 */
function doorFault(id: string, channel: string, door: unknown, installed?: Known): Refusal | null {
  if (door === undefined) return null;
  if (typeof door !== 'string' || door === '')
    return bad('DECLARATION_INVALID', `${id}'s door is the id of a webhook ingest whose URL it reads, and ${JSON.stringify(door)} is not one.`, 'door');
  if (channel !== 'webhook')
    return bad('DECLARATION_INVALID', `${id} arrives by ${channel}, and only a webhook pattern is offered what arrives at a door. Take door out, or declare channel: webhook.`, 'door');
  if (installed === undefined) return null;
  const named = installed.get(`ingest.${door}`) as { channel?: unknown; verify?: { kind?: unknown }; match?: unknown } | undefined;
  if (named === undefined)
    return bad('DECLARATION_INVALID', `${id} names ${door} as its door, and no ingest ${door} is installed. Install it first, or in the same batch.`, 'door');
  if (named.channel !== 'webhook')
    return bad('DECLARATION_INVALID', `${id} names ${door} as its door, and ${door} arrives by ${String(named.channel)}: a door is a webhook's URL.`, 'door');
  if (named.verify?.kind !== 'path')
    return bad('DECLARATION_INVALID', `${id} names ${door} as its door, and ${door} takes no path token, so nothing arriving there is verified and no pattern is tried. Give ${door} verify: { kind: path }.`, 'door');
  /* A DOOR WITH NO `match:` TAKES EVERY ARRIVAL FIRST, so a pattern naming it is never offered one. `offered` in
     `ingest.ts` puts the door's own pattern ahead of the patterns naming it on purpose, and measured, a text only `b`
     asks for was filed by the door, rows one and two `1 0`, with the install silent. A wider phrase does the same to
     part of a twin's texts and is not refused: whether one phrase covers another cannot be read from the two
     declarations, and it stays the author's. */
  if (takesEvery(named.match))
    return bad('DECLARATION_INVALID', `${id} names ${door} as its door, and ${door} ${matchless(named.match)}, so it takes every arrival there before ${id} is asked. Give ${door} a match: on a field, or give ${id} a door of its own.`, 'door');
  return null;
}

/**
 * Whether a door's `match:` takes every arrival, which is the one case of "the door shadows its twins" the declaration
 * alone can answer.
 *
 * A `match:` THAT NAMES NO FIELD IS THE SAME ANSWER FOR EVERY ARRIVAL, whatever `ingest.ts` is handed. Checking only a
 * missing `match:` let a second spelling through: measured through `arrive` and `drain`, a door declared `{ all: [] }`
 * installed with a twin naming it and filed the twin's own text, rows one and two `1 0`, and `{ none: [] }` did the
 * same, because `evaluate` answers an empty group with `q !== 'any'`. `{ any: [] }` and `match: null` were measured
 * too, and filed that text through the twin, `0 1`: they match nothing, so the door files nothing and they are harmless
 * here.
 *
 * SO THE TREE IS FOLDED, AND NOT ONLY WHEN IT NAMES NO FIELD. The first version asked `evaluate` only of a tree with no
 * leaf in it, and `{ any: [{ all: [] }, { field: body, contains: paid }] }` compiled clean, answered true for an empty
 * arrival and for a text saying five of some currency were withdrawn alike, and installed with a twin naming it, as
 * measured. A group whose answer its constant children already settle is folded to that answer, the way `evaluate`
 * reads an empty group (`all` and `none` true, `any` false), and a leaf is unknown. Only a tree whose phrase decides is
 * the wider-phrase case `doorFault` leaves to the author. Fuzzed against `evaluate` over twenty thousand trees that
 * compile clean, the fold settled 7683 of them and disagreed with `evaluate` on none; the 51 it left open and
 * `evaluate` answered true for every sample text were a phrase beside its own `none`, which is logic over leaves and
 * not a fold.
 */
function takesEvery(match: unknown): boolean {
  if (match === undefined) return true;
  /* THE SAME PRECEDENCE AS `where`'s `childrenOf`, so a node carrying two quantifiers is read the way it is run.
     `undefined` is "the text decides"; a shape `compile` refuses never installs, so its answer here does not matter. */
  const settled = (node: unknown): boolean | undefined => {
    if (typeof node !== 'object' || node === null || Array.isArray(node)) return undefined;
    const [q, kids] = 'all' in node ? ['all', node.all] : 'any' in node ? ['any', node.any] : 'none' in node ? ['none', node.none] : [];
    if (q === undefined || !Array.isArray(kids)) return undefined;
    const said = kids.map(settled);
    const any = said.includes(true) ? true : said.every((s) => s === false) ? false : undefined;
    if (q === 'any') return any;
    if (q === 'none') return any === undefined ? undefined : !any;
    return said.includes(false) ? false : said.every((s) => s === true) ? true : undefined;
  };
  return settled(match) === true;
}

const matchless = (match: unknown): string => (match === undefined ? 'has no match:' : `matches ${JSON.stringify(match)}, which is true of every text`);

/**
 * The other side of `doorFault`: a webhook ingest that patterns name as their `door:` stays one they can read through.
 *
 * `doorFault` IS ASKED WHEN THE PATTERN IS INSTALLED, AND THE DOOR CAN CHANGE AFTERWARDS. Measured: the door
 * re-installed without `verify:` answered `ok`, and left its pattern installed under exactly the declaration
 * `doorFault` refuses, a door whose arrivals are stored unverified and never matched. So the door's new body is asked
 * the same three questions the pattern asked of it, against every pattern that will still name it once the batch lands:
 * the batch counts, so a pattern dropping its `door:` in the same call is not counted.
 *
 * RETIRING THE DOOR IS REFUSED IN `retireDeclarations`, NOT HERE. Tried first, the refusal stopped money-core's own
 * update: its plan handed `bank-ipn-in-sms`, which filed a row, to `bank-hsbc-eg` with its `door: bank-from-out-sms`,
 * and retired the door, which held no token and filed nothing. The plan now hands a door with the pattern naming it
 * (`packages/declare/test/door-follows-patterns.test.ts`), and with that in the tree the guard changed nothing
 * `bank-pack.test.ts` or `plan-handover-shown.test.ts` asserts, measured with every assertion made to log and carry on.
 * The one test it refused outright, `packages/record/test/ingest-verify-digest.test.ts`'s retire of
 * `bank-from-out-sms`, which five of the bank's patterns read, now retires a webhook no pattern names, as its neighbour
 * already did for a door re-installed without `verify:`. Without that plan change, this guard is the one that stopped
 * the update.
 *
 * ASKED AFTER EVERY DECLARATION OF THE BATCH HAS PASSED `validate` (`doorsKept`), NOT INSIDE IT. Asked from
 * `ingestBody`, a batch shipping a door with no token and a pattern naming it was answered at the door's `verify` before
 * the pattern's own `door` was reached, and `test/ingest-door.test.ts` holds the pattern's answer for that batch.
 */
function doorsKept(batch: readonly Declaration[], known: Known): Refusal | null {
  for (const decl of batch)
    if (decl.kind === 'ingest') {
      const fault = doorNamedFault(decl.id, decl.body as { channel?: unknown; verify?: unknown; match?: unknown }, known);
      if (fault) return fault;
    }
  return null;
}

function doorNamedFault(id: string, body: { channel?: unknown; verify?: unknown; match?: unknown }, installed?: Known): Refusal | null {
  if (installed === undefined || !id.startsWith('ingest.')) return null;
  const door = id.slice('ingest.'.length);
  const naming = [...installed].filter(([other, b]) => other !== id && other.startsWith('ingest.') && b.door === door).map(([other]) => other).sort();
  if (naming.length === 0) return null;
  const names = listed(naming);
  const reads = naming.length === 1 ? 'reads' : 'read';
  const out = `take door: ${door} out of ${names} in the same batch`;
  if (body.channel !== 'webhook')
    return bad('DECLARATION_INVALID', `${id} is the door ${names} ${reads}, and a door is a webhook's URL. Keep channel: webhook, or ${out}.`, 'channel');
  if ((body.verify as { kind?: unknown } | undefined)?.kind !== 'path')
    return bad('DECLARATION_INVALID', `${id} is the door ${names} ${reads}, and without verify: { kind: path } nothing arriving there is verified and no pattern is tried. Keep verify: { kind: path }, or ${out}.`, 'verify');
  if (takesEvery(body.match))
    return bad('DECLARATION_INVALID', `${id} is the door ${names} ${reads}, and it ${matchless(body.match)}, so it takes every arrival there before ${naming.length === 1 ? 'that pattern is' : 'those patterns are'} asked. Keep a match: on a field, or ${out}.`, 'match');
  return null;
}

function ingestBody(decl: Declaration, installed?: Known): Refusal | null {
  const body = decl.body as { channel?: unknown; match?: unknown; extract?: unknown; map?: unknown; fetch?: unknown; dedupe?: unknown; on_conflict?: unknown; skip?: unknown; writes?: unknown; verify?: unknown; door?: unknown };
  const id = decl.id;

  if (typeof body.channel !== 'string' || !(CHANNELS_IN as readonly string[]).includes(body.channel))
    return bad(
      'DECLARATION_INVALID',
      `${id} arrives by ${JSON.stringify(body.channel ?? null)}, and there are seven channels.`,
      'channel',
      CHANNELS_IN as unknown as string[],
    );

  const unverifiable = verifyFault(id, body.channel, body.verify);
  if (unverifiable) return unverifiable;

  const doorless = doorFault(id, body.channel, body.door, installed);
  if (doorless) return doorless;

  /* THE TREE FORM ONLY. A `match:` may also be the sentence a person writes, and parsing one needs a
     `Schema` and a clock — `parseWhere`'s `SentenceDeps` — neither of which a context-free check
     has. The sentence form reaches `predicateOf` at install through the record's own read check,
     which raises `MATCH_FIELD_UNKNOWN`'s sibling for an unknown name; the tree form reached nothing. */
  const fault = matchFault(body.match, id, 'match');
  if (fault) return fault;

  /**
   * AND THEN THE GRAMMAR ITSELF, over the whole predicate, because what installs has to be what fires.
   *
   * The two checks above are hand-written and they are the ones that teach: they name the operator, recite
   * the seven fields, and say to read the rest with `extract`. What they cannot do is answer for the rest
   * of the grammar, and `compile` already does. `{ field: channel, in: [email, imap] }` passes both of
   * them — `in` is a kept operator and `channel` is one of the seven — and `inbox_raw`'s `channel` is the
   * DDL's enum, so `imap` is a value no row can hold. It installed clean and matched nothing, for ever,
   * which is this file's oldest failure in a new place.
   *
   * ONE COMPILE, AT THE ROOT, over the same `INBOX_RAW` the kernel evaluates against a few files away. It
   * is not run per leaf: `compile` walks the tree itself, and calling it inside the recursion would report
   * the first leaf's refusal once per ancestor.
   */
  /* THE TREE FORM ONLY, for the reason the block above gives: a sentence is a legal `match:` and
     `compile` reads it as neither a group nor a leaf. The sentence form still reaches `predicateOf`
     through the record's own read check, which is where it gets a `Schema` and a clock, and it is
     therefore the one shape this check does not cover. Said here rather than left to be found. */
  if (body.match !== undefined && typeof body.match === 'object' && body.match !== null) {
    const refused = compile(body.match as Predicate, INBOX_RAW).bad[0];
    if (refused)
      return bad(refused.code, `${id}.match: ${refused.fix}`, refused.at ?? 'match', refused.allowed);
  }

  /**
   * `42 §4.7`'s `dedupe:` — 1 to 4 field ids, or the near form.
   *
   * A FIELD ID FROM A DECLARATION BECOMES SQL. `existingRow` builds `json_extract(fields, '$.<f>')`
   * out of these names, and `jsonPath` is what keeps that from being an injection — but `jsonPath`
   * THROWS, and this is the one place the name can still be refused to somebody who can fix it.
   * The check the key had under its old spelling came free from the register grammar; under the
   * spelling the schema documents, nothing read it at all, and an unreadable key installed clean.
   */
  const wrongKey = dedupeFault(body.dedupe, id);
  if (wrongKey) return wrongKey;

  /**
   * `07 §3`'s `on_conflict:`, one of `ON_CONFLICTS`, and nothing read it here. Measured: `bogus` installed clean and
   * then behaved as `new`, because `arrive` asks only whether the value is `skip`, `update` or `review`, so a misspelt
   * `skip` filed every resend as a second row and said nothing.
   *
   * AND `review` IS NOT A PULL'S. It holds one arrival for a person, and a pulled page is up to five hundred rows that
   * `fetched.ts` applies one by one, asking only for `skip` and `update`: declared on a pull it wrote the near match as a
   * second row, which is `new` under a name that promises the opposite.
   */
  if (body.on_conflict !== undefined && !(ON_CONFLICTS as readonly unknown[]).includes(body.on_conflict))
    return bad(
      'ENUM_VALUE_UNKNOWN',
      `${id}'s on_conflict is ${JSON.stringify(body.on_conflict)}, and it is skip, update, new or review.`,
      'on_conflict',
      [...ON_CONFLICTS],
    );
  if (body.on_conflict === 'review' && body.channel === 'pull')
    return bad(
      'DECLARATION_INVALID',
      `${id} is pulled a page at a time, and on_conflict: review holds one arrival for a person. Say skip or update, which a page applies row by row.`,
      'on_conflict',
    );

  /* `writes.register`, WHICH IS A NAME OR `07 §2`'s TABLE. A series ingest writes no register and
     is left to the block below, which is where `series:` is read. */
  const writes = body.writes as { register?: unknown; series?: unknown; set?: unknown } | undefined;
  if (writes !== undefined && writes !== null && typeof writes === 'object' && writes.series === undefined) {
    const wrongTarget = routeFault(writes.register, id);
    if (wrongTarget) return wrongTarget;
  }

  /* `writes.set` FILLS A FIXED VALUE ON EVERY ROW, keyed by field id the same way `dedupe:` is, and checked the same
     way for the same reason — an unchecked field id becomes SQL two files away (`existingRow`'s comment above
     `dedupeFault`), and a value that is not text could not be left out when a setting is empty without a second rule to
     read. */
  if (writes !== undefined && writes !== null && typeof writes === 'object') {
    const wrongSet = setFault(writes.set, id);
    if (wrongSet) return wrongSet;
  }

  /**
   * `42 §4.7`'s `skip:` — 1 to 16 of `{ when: predicate on inbox_raw, reason: text ≤ 120 }`.
   *
   * THE SAME COMPILE THE `match:` GETS, for the same reason, and it is the reason with teeth here:
   * a skip that never fires is invisible. A `match:` that matches nothing shows up as an inbox
   * filling with untriaged payloads; a `skip:` that reaches nothing shows up as refunds written as
   * charges, and the register looks ordinary. `{ field: kind, is: refund }` is that typo — `kind`
   * is not one of `34 §1.9`'s seven — and it installed clean.
   */
  if (body.skip !== undefined) {
    const list = body.skip;
    if (!Array.isArray(list) || list.length === 0 || list.length > SKIP_MOST)
      return bad('DECLARATION_INVALID', `${id}'s skip is 1 to ${SKIP_MOST} of { when, reason }.`, 'skip');
    for (const [i, rule] of list.entries()) {
      const at = `skip[${i}]`;
      if (rule === null || typeof rule !== 'object' || Array.isArray(rule))
        return bad('DECLARATION_INVALID', `${id}'s ${at} is { when, reason }.`, at);
      const { when, reason } = rule as { when?: unknown; reason?: unknown };
      if (typeof reason !== 'string' || reason.trim() === '' || reason.length > SKIP_REASON_MOST)
        return bad(
          'DECLARATION_INVALID',
          `${id}'s ${at} names no reason. A skipped arrival is one somebody will come looking for, and the reason is what they find.`,
          `${at}.reason`,
        );
      if (when === null || typeof when !== 'object')
        return bad('DECLARATION_INVALID', `${id}'s ${at} skips on nothing, so it would skip every arrival this pattern matches.`, `${at}.when`);
      /* THE HAND-WRITTEN CHECK FIRST, because it is the one that teaches: it names the operator and
         recites the seven fields, where `compile` answers `FIELD_UNKNOWN` and leaves the author to
         find the list. Same order as the `match:` above it. */
      const unknown = matchFault(when, id, `${at}.when`);
      if (unknown) return unknown;
      const refused = compile(when as Predicate, INBOX_RAW).bad[0];
      if (refused) return bad(refused.code, `${id}.${at}.when: ${refused.fix}`, refused.at ?? `${at}.when`, refused.allowed);
    }
  }

  if (body.extract !== undefined) {
    const extract = body.extract;
    if (extract === null || typeof extract !== 'object' || Array.isArray(extract))
      return bad('DECLARATION_INVALID', `${id}'s extract is one form per field.`, 'extract');
    for (const [field, form] of Object.entries(extract as Record<string, unknown>)) {
      /* THE FORM IS CHECKED WITHOUT ITS `strip:`, which is the field's and not the form's, and then the prefixes are. A
         `strip` inside a nested form is still an unknown key there, since only the field carries one. */
      const bare = withoutStrip(form);
      const unknown = extractorFault(bare, `${id}.extract.${field}`, 0);
      if (unknown) return unknown;
      const wrong = stripFault(form, bare, `${id}.extract.${field}`);
      if (wrong) return wrong;
    }
    const crossed = currencyOfFault(extract as Record<string, unknown>, id, installed);
    if (crossed) return crossed;
  }

  /* `25 §3.1`'s paths, which become `select()` calls over somebody else's JSON. A path outside the
     grammar reaches nothing rather than throwing, so the mapped field is absent, the row is written
     without it, and the connector reports a successful page. */
  if (body.map !== undefined) {
    /* A POLL MAY FILL SEVERAL ROWS FROM ONE ANSWER: a list of maps, one row each, so three numbers at one address are one
       request an interval and not three. Each map in the list is held to exactly what a single map is. */
    const maps: unknown[] = body.channel === 'poll' && Array.isArray(body.map) ? body.map : [body.map];
    if (body.channel === 'poll' && Array.isArray(body.map) && (maps.length === 0 || maps.length > POLL_MAPS_MOST))
      return bad('DECLARATION_INVALID', `${id}'s map is one map, or a list of 1 to ${POLL_MAPS_MOST} maps, each filling one row.`, 'map');
    if (body.extract !== undefined)
      return bad('DECLARATION_INVALID', `${id} carries both extract and map. Read text with extract, or a JSON answer with map, and not both.`, 'map');
    for (const [i, map] of maps.entries()) {
    const where = Array.isArray(body.map) ? `map[${i}]` : 'map';
    if (map === null || typeof map !== 'object' || Array.isArray(map))
      return bad('DECLARATION_INVALID', `${id}'s ${where} is one entry per field.`, where);
    /* A POLL'S MAP FILLS ONE ROW, and is held to `mappingFault` whole. A PULL'S is a connector's, whose `read.rows`
       may expand a list, so its paths keep the grammar check they had and a stated value or `arrived` is checked as one. */
    for (const [field, entry] of Object.entries(map as Record<string, { path?: unknown }>)) {
      const at = `${id}.${where}.${field}`;
      if (body.channel === 'poll' || entry === null || typeof entry !== 'object' || !('path' in entry)) {
        const wrong = mappingFault(entry, at);
        if (wrong) return wrong;
        continue;
      }
      const paths = Array.isArray(entry.path) ? entry.path : [entry.path];
      for (const path of paths) {
        const wrong = pathFault(path, `${at}.path`);
        if (wrong) return wrong;
      }
    }
    }
  }

  const fetch = body.fetch as
    | {
        base?: unknown;
        read?: Record<string, unknown>;
        expect?: unknown;
        page?: Record<string, unknown>;
        probe?: { read?: unknown };
        on_error?: Record<string, unknown>;
        window?: { end?: unknown } | null;
      }
    | undefined;
  if (fetch !== undefined && fetch !== null && typeof fetch === 'object') {
    /* THE ADDRESS A CONNECTOR MAY TALK TO, CHECKED WHERE IT IS WRITTEN. Both `Http` adapters carry
       a comment reading "Lint refuses a `base:` that is not `https://`" and treat a non-https URL
       arriving at run time as a fault in this repository rather than one of the four transport
       failures — and lint did not refuse it. A declaration is the one place this can be caught
       before a credential has been sealed against it. */
    if (typeof fetch.base !== 'string' || !FETCH_BASE.test(fetch.base))
      return bad(
        'ACTION_NOT_HTTPS',
        `${id} fetches from ${JSON.stringify(String(fetch.base).slice(0, 80))}, and a connector's base is an https:// host on its own. No path, no placeholder.`,
        'fetch.base',
      );
    const wrongRead = readFault(fetch, id);
    if (wrongRead) return wrongRead;
    /* `window.end` SAYS WHETHER THE PROVIDER'S RANGE INCLUDES ITS LAST DAY, which decides what `{until}` is written
       as (`47 §4.1`). A misspelling read as `exclusive` would ask an inclusive API for today on every run. */
    const end = fetch.window?.end;
    if (end !== undefined && end !== 'exclusive' && end !== 'inclusive')
      return bad('DECLARATION_INVALID', `${id}'s window.end is ${JSON.stringify(end)}: write inclusive when the provider's range includes its last day, or leave it out.`, `${id}.fetch.window.end`, ['exclusive', 'inclusive']);
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
    const said = intervalFault(decl.body as unknown as PullDecl);
    if (said) return said;
    const clocked = decl.body as { every?: unknown; at?: unknown; tz?: unknown; fetch?: { schedule?: unknown; page?: unknown; read?: unknown } | null };
    const fetched = clocked.fetch !== null && typeof clocked.fetch === 'object' ? clocked.fetch : undefined;
    const twice = scheduleFault(id, clocked, fetched?.schedule);
    if (twice) return twice;
    /* A ZONE ALONE MEANS SOMETHING ONLY TO A CONNECTOR THAT PAGES, whose window's days are counted in it (`prepareAction`
       hands it over as the run's zone). One request fills `{since}` and `{until}` with instants, which have no zone. */
    const paged = fetched !== undefined && (fetched.page !== undefined || fetched.read !== undefined);
    const clock = clockFault(id, clocked, { runs: true, zoneAlone: paged });
    if (clock) return clock;
  }

  if (body.channel === 'call' || body.channel === 'poll') return actionFault(decl, body.channel, installed);

  return null;
}

/* ── a scheduled action: `call` and `poll` ──────────────────────────────── */

/** What a `call` or a `poll` substitutes, and nothing else: the window's two edges (`25 §3.1`). */
const ACTION_PLACEHOLDERS = ['since', 'until'] as const;
/** The formats a time takes. `:int` is `25 §3.1`'s fifth, and it formats a page or a probe, never a time. */
const TIME_FORMATS = ['date', 'instant', 'epoch_s', 'epoch_ms'] as const;
/** The names `25 §3.1` closes over. A brace group that begins with one of these is a substitution or a refusal. */
const PLACEHOLDER_NAME = /^(since|until|page|row\.[A-Za-z0-9_]*|probe\.[A-Za-z0-9_]*|grant\.[A-Za-z0-9_]*)/;
/** `42 §4.7`'s ceiling on a fetch body, kept for a call's. */
const BODY_BYTES = 8_192;
/** What starts a `call`. Absent is `schedule`. */
const CALL_TRIGGERS = ['schedule', 'rule', 'both'] as const;
/** The most fields one call sends. Each is printed in the install diff. */
const SENDS_CEILING = 32;
/** The most rows one poll fills from one answer, one map each. */
export const POLL_MAPS_MOST = 20;
/**
 * `47 §4.1`'s `base:` — an origin and nothing else: `https`, a host, an optional port.
 *
 * NO PATH AND NO PLACEHOLDER, and both halves matter. `§8`'s whole origin check is `new URL(base)`
 * and a comparison, so a `base` carrying a path has that path silently dropped — the declaration
 * reads as though it pins `/v1` and pins only the host. A placeholder is worse: it reads as though
 * a grant field decides where the request goes, and nothing substitutes it.
 */
const FETCH_BASE = /^https:\/\/[a-z0-9.-]+(:[0-9]+)?$/u;

/** `<register>.<field>`, both in the identifier grammar. */
const SENDS_NAME = /^([a-z][a-z0-9_]{0,31})\.([a-z][a-z0-9_]{0,31})$/;

/**
 * One string a scheduled action sends, checked for substitution and nothing more.
 *
 * SUBSTITUTION, NEVER EVALUATION (`25 §3.1`). A brace group that names no placeholder is literal text,
 * so a GraphQL body survives; a brace group that names one is either exactly that placeholder, with an
 * optional format, or it is an expression and it is refused. `${…}` is refused wherever it is, because
 * it is the shape of a template language and nothing here is one.
 */
function substitutionFault(text: string, sent: ReadonlySet<string> | null = null): string | null {
  if (text.includes('${')) return `${JSON.stringify(text.slice(0, 60))} holds a \`\${…}\`, which is an expression. Write {since} or {until} and nothing else.`;
  for (const m of text.matchAll(/\{([^{}]*)\}/g)) {
    const inner = m[1] ?? '';
    const name = PLACEHOLDER_NAME.exec(inner)?.[1];
    if (name === undefined) continue;
    const rest = inner.slice(name.length);
    /* `{sinceX}` names no placeholder, so it is literal text like any other brace group. */
    if (/^[A-Za-z0-9_]/.test(rest)) continue;
    /* A ROW'S FIELD, ONLY IN A BODY AND ONLY ONE THE CALL SENDS. `sent` is `null` in an address, where no row's
       value may ever stand, and otherwise the fields `sends:` names. */
    if (name.startsWith('row.')) {
      const field = name.slice('row.'.length);
      if (sent === null) return `{${inner}} puts a row's field in the address. A row's fields go in the body, and only the ones sends: names.`;
      if (rest !== '' || !sent.has(field))
        return `{${inner}} is not a field this call sends. Write {row.<field>} for a field listed in sends:, with no format.`;
      continue;
    }
    if (!(ACTION_PLACEHOLDERS as readonly string[]).includes(name))
      return `{${inner}} has nothing to stand for on a scheduled action. Only {since} and {until} do.`;
    if (rest === '') continue;
    const format = rest.startsWith(':') ? rest.slice(1) : null;
    if (format === null || !(TIME_FORMATS as readonly string[]).includes(format))
      return `{${inner}} is not a substitution. Write {${name}}, or {${name}:date}, :instant, :epoch_s or :epoch_ms, with no operator.`;
  }
  return null;
}

/** Every string leaf of a call's body, with its path, so a refusal can say where. */
function stringLeaves(node: unknown, at: string, out: [string, string][] = []): [string, string][] {
  if (typeof node === 'string') out.push([at, node]);
  else if (Array.isArray(node)) node.forEach((v, i) => stringLeaves(v, `${at}[${i}]`, out));
  else if (node !== null && typeof node === 'object')
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) stringLeaves(v, `${at}.${k}`, out);
  return out;
}

/**
 * A `call` or a `poll`, checked where it is written.
 *
 * THE ORIGIN IS LITERAL AND HTTPS, because the install diff prints it and a host built from data is a
 * host nobody approved: `25 §7` rule 4, and the fifth of Airbyte's connectors that interpolate their
 * host. THE KEY IS NAMED, by its label, because the owner has to know which key leaves and to where.
 * THE INTERVAL IS AT LEAST FIFTEEN MINUTES, or the provider's own higher floor. AND THE BODY IS
 * SUBSTITUTION ONLY. Each has its own code, because each has its own fix.
 */
function actionFault(decl: Declaration, channel: 'call' | 'poll', installed?: Known): Refusal | null {
  const body = decl.body as {
    url?: unknown; grant?: unknown; every?: unknown; floor?: unknown; body?: unknown; project?: unknown;
    writes?: { register?: unknown }; trigger?: unknown; sends?: unknown; auth?: unknown; at?: unknown; tz?: unknown;
  };
  const id = decl.id;

  /* WHAT STARTS IT, AND WHAT LEAVES WITH IT. A poll has neither: it runs on its clock and sends no body. A call a rule
     runs has no clock, and sends only the fields `sends:` names, which the install diff prints. */
  if (channel === 'poll' && (body.trigger !== undefined || body.sends !== undefined))
    return bad('DECLARATION_INVALID', `${id} is a poll, which runs on its interval and sends no row, so it takes no trigger or sends.`, body.trigger !== undefined ? 'trigger' : 'sends');
  if (body.trigger !== undefined && !(CALL_TRIGGERS as readonly string[]).includes(body.trigger as string))
    return bad('DECLARATION_INVALID', `${String(body.trigger)} is not what starts a call.`, 'trigger', CALL_TRIGGERS as unknown as string[]);
  const trigger = (body.trigger ?? 'schedule') as (typeof CALL_TRIGGERS)[number];

  const sent = new Set<string>();
  if (body.sends !== undefined) {
    if (trigger === 'schedule')
      return bad('DECLARATION_INVALID', `${id} sends fields of a row, and only a rule has a row. Write trigger: rule or trigger: both.`, 'sends');
    if (!Array.isArray(body.sends) || body.sends.length === 0 || body.sends.length > SENDS_CEILING)
      return bad('DECLARATION_INVALID', `${id}'s sends is a list of one to ${SENDS_CEILING} fields, each written register.field.`, 'sends');
    let register: string | null = null;
    for (const [i, said] of (body.sends as unknown[]).entries()) {
      const at = `sends[${i}]`;
      const m = typeof said === 'string' ? SENDS_NAME.exec(said) : null;
      if (!m) return bad('DECLARATION_INVALID', `${id} sends ${JSON.stringify(said)}, and a field it sends is written register.field.`, at);
      const [, from, field] = m as unknown as [string, string, string];
      if (register !== null && from !== register)
        return bad('DECLARATION_INVALID', `${id} sends fields of ${register} and of ${from}, and a rule's row belongs to one register.`, at);
      register = from;
      sent.add(field);
      /* NEVER A SECRET OR A FILE. A key leaves the record only as the key the call names, by reference, and a file is
         not a field a call carries. Checked against the register when the record can see it. */
      if (installed === undefined) continue;
      const shape = installed.get(`register.${from}`);
      if (shape === undefined) return bad('REGISTER_UNKNOWN', `${id} sends ${said}, and there is no register called ${from}.`, at);
      const declared = (Array.isArray(shape.fields) ? shape.fields : []) as { id?: unknown; type?: unknown; of?: unknown }[];
      const f = declared.find((x) => x?.id === field);
      if (f === undefined) return bad('FIELD_UNKNOWN', `${id} sends ${said}, and ${from} has no field called ${field}.`, at);
      const kind = f.type === 'list' ? f.of : f.type;
      if (kind === 'secret' || kind === 'file')
        return bad('DECLARATION_INVALID', `${id} sends ${said}, which is a ${String(kind)}. A call never sends a secret or a file.`, at);
    }
  }

  if (typeof body.url !== 'string' || body.url === '')
    return bad('DECLARATION_INVALID', `${id} is a ${channel} and names no url. Write the whole https:// address it calls.`, 'url');

  if (!/^https:\/\//i.test(body.url))
    return bad('ACTION_NOT_HTTPS', `${id} calls ${JSON.stringify(body.url.slice(0, 80))}, and a scheduled action calls an https:// address only.`, 'url');

  /* THE AUTHORITY AS WRITTEN, up to the first character that ends it for a URL parser. A backslash ends
     it too, because the WHATWG parser reads one as a slash on https. */
  const authority = body.url.slice('https://'.length).split(/[/?#\\]/)[0] ?? '';
  /* CHECKED BEFORE `fillConfig` EVER RUNS, on the pack's own unfilled body: a host built from a setting is a host
     nobody approved (docs/04 §7), so `{{config:host}}` is refused here whether or not a value has been chosen, and
     never reaches the `new URL` parse below. */
  if (/\{\{\s*config\s*:/i.test(authority))
    return bad(
      'ACTION_HOST_COMPUTED',
      `${id}'s host reads a {{config:...}} setting, and a host is literal, with no placeholder: a setting fills the body, never the address.`,
      'url',
    );
  let parsed: URL | null = null;
  try {
    parsed = new URL(body.url);
  } catch {
    parsed = null;
  }
  const host = authority.toLowerCase().replace(/:443$/, '');
  if (authority === '' || /[{}$@%\s]/.test(authority) || parsed === null || parsed.host !== host)
    return bad(
      'ACTION_HOST_COMPUTED',
      `${id}'s host must be written out in full, with no placeholder, no user name and nothing computed, so the install diff can print it.`,
      'url',
    );

  const inUrl = substitutionFault(body.url.slice('https://'.length + authority.length));
  if (inUrl) return bad('ACTION_EVALUATES', inUrl, 'url');

  /* A POLL OF AN ADDRESS THAT NEEDS NO KEY SENDS NONE, so it names none: a public JSON answer is read as anybody reads
     it, and making the owner put a key in the keychain for it would be a key that opens nothing. A call always sends one,
     because it writes to somebody else's service. A key that is named is still held to its label's shape. */
  const keyless = channel === 'poll' && body.grant === undefined;
  if (!keyless && (typeof body.grant !== 'string' || body.grant.trim() === '' || body.grant.length > 40))
    return bad('ACTION_GRANT_MISSING', `${id} names no key. Write grant: and the label of the key in the keychain it sends.`, 'grant');
  const sending = authFault(id, body.auth, keyless);
  if (sending) return sending;

  /* A CALL ONLY A RULE RUNS HAS NO CLOCK, and one that wrote a clock anyway would read as running on it. */
  if (trigger === 'rule') {
    if (body.every !== undefined)
      return bad('DECLARATION_INVALID', `${id} runs only when a rule runs it, so it takes no every. Write trigger: both to run it on a clock as well.`, 'every');
  } else {
    if (typeof body.every !== 'string')
      return bad('ACTION_INTERVAL_TOO_SHORT', `${id} says no interval. Write every: 15m or longer.`, 'every');
    const interval = intervalFault({ ingest: String((decl.body as { ingest?: unknown }).ingest ?? id), every: body.every, ...(typeof body.floor === 'string' ? { floor: body.floor } : {}) });
    if (interval) return interval;
  }
  const clock = clockFault(id, body, { runs: trigger !== 'rule', zoneAlone: false });
  if (clock) return clock;

  if (body.project !== undefined && (typeof body.project !== 'string' || body.project === ''))
    return bad('DECLARATION_INVALID', `${id}'s project is the id of the project it runs for, or absent for all of this BrainDog.`, 'project');

  if (channel === 'poll') {
    if (body.body !== undefined) return bad('DECLARATION_INVALID', `${id} is a poll, and a poll sends no body.`, 'body');
    /* A POLL ACTS THROUGH A RULE, and a rule is about a register. An answer that changes and writes
       nowhere changes nothing anybody can see. */
    if (typeof body.writes?.register !== 'string')
      return bad('DECLARATION_INVALID', `${id} is a poll and writes to no register, so a changed answer would reach no rule.`, 'writes.register');
    /* EVERY FIELD IT MAPS IS ONE THE REGISTER HAS, checked when the record can see the register. A money measure on a
       Numbers list with no `amount` installed, ran `ok` and "the answer changed", and wrote no reading at all. */
    const shape = installed?.get(`register.${body.writes.register}`);
    const map = (decl.body as { map?: unknown }).map;
    if (shape !== undefined && map !== null && typeof map === 'object') {
      const fields = new Set(((Array.isArray(shape.fields) ? shape.fields : []) as { id?: unknown }[]).map((f) => f?.id));
      for (const [i, entry] of (Array.isArray(map) ? map : [map]).entries())
        for (const key of entry !== null && typeof entry === 'object' ? Object.keys(entry) : [])
          if (!fields.has(key))
            return bad('FIELD_UNKNOWN', `${id} maps ${key}, and ${body.writes.register} has no field called ${key}.`, Array.isArray(map) ? `map[${i}].${key}` : `map.${key}`);
    }
    return null;
  }

  if (body.body !== undefined) {
    if (body.body === null || typeof body.body !== 'object' || Array.isArray(body.body))
      return bad('DECLARATION_INVALID', `${id}'s body is one object, sent as JSON.`, 'body');
    if (new TextEncoder().encode(JSON.stringify(body.body)).length > BODY_BYTES)
      return bad('OUT_OF_BOUNDS', `${id}'s body is over 8 KB. A call's body is printed whole in the install diff.`, 'body');
    for (const [at, text] of stringLeaves(body.body, 'body')) {
      /* A scheduled run has no row, so `{row.x}` stands for nothing there; a run a rule starts has the fields it sends. */
      const wrong = substitutionFault(text, trigger === 'schedule' ? null : sent);
      if (wrong) return bad('ACTION_EVALUATES', wrong, at);
    }
  }
  return null;
}

/**
 * An interval, against the floor: a malformed one is a declaration fault, and one under the floor has its own code.
 *
 * THE SAME CODE FOR ALL THREE CHANNELS. A `pull` every minute and a `poll` every minute are one fact,
 * and the owner's rule is one sentence: fifteen minutes, or the provider's own higher floor.
 */
function intervalFault(decl: PullDecl): Refusal | null {
  const said = checkInterval(decl);
  if (said.ok || !('refusal' in said)) return null;
  return bad(
    said.refusal.code === 'OUT_OF_BOUNDS' ? 'ACTION_INTERVAL_TOO_SHORT' : 'DECLARATION_INVALID',
    said.refusal.fix,
    said.refusal.at ?? 'every',
  );
}

/** A query parameter a key may go in, as a form names one. */
const QUERY_NAME = /^[A-Za-z0-9_.~-]{1,64}$/u;

/** The words a person reaching for a secret would write inside `auth:`, each refused with the keychain's sentence. */
const AUTH_SECRETS: readonly string[] = ['token', 'secret', 'password', 'value', 'key'];

/**
 * How a `call` or a `poll` sends its key: `auth: { kind: header, name: X-Api-Key }`, `{ kind: query, name: api_key }`,
 * `{ kind: basic }`, or absent for a bearer, which is what a bare `grant:` has always meant.
 *
 * THE KEY ITSELF IS STILL NAMED BY `grant:` AND BY NOTHING HERE. `auth:` says only where it goes, so the install diff
 * that names the key names it once, and a secret written into `auth:` is refused with the keychain's sentence rather than
 * read as a name.
 *
 * A HEADER THE REQUEST SETS ITSELF IS REFUSED HERE, with the list connect's auth builder refuses again at run time
 * (`reservedKeyHeader`): `Authorization` is a bearer written the long way round, and `Cookie` or `Host` would be the
 * key steering the request rather than riding on it.
 */
function authFault(id: string, auth: unknown, keyless: boolean): Refusal | null {
  if (auth === undefined) return null;
  if (keyless) return bad('DECLARATION_INVALID', `${id} sends no key, so it takes no auth. Name the key with grant:, or take auth out.`, 'auth');
  const kinds = ACTION_AUTH_KINDS as readonly string[];
  if (auth === null || typeof auth !== 'object' || Array.isArray(auth))
    return bad('DECLARATION_INVALID', `${id}'s auth is { kind: bearer, header, query or basic }, with a name for a header or a query.`, 'auth', kinds);
  const said = auth as { kind?: unknown; name?: unknown };
  const stray = Object.keys(said).find((k) => k !== 'kind' && k !== 'name');
  if (stray !== undefined && AUTH_SECRETS.includes(stray))
    return bad('DECLARATION_INVALID', `${id}'s auth carries a ${stray}, and a secret is never in a declaration. Put it in the keychain and name it with grant:.`, `auth.${stray}`);
  if (stray === 'grant') return bad('DECLARATION_INVALID', `${id} names its key with grant: beside auth, not inside it.`, 'auth.grant');
  if (stray !== undefined) return bad('DECLARATION_INVALID', `${id}'s auth declares ${stray}, and auth takes a kind and a name and nothing else.`, `auth.${stray}`);
  if (typeof said.kind !== 'string' || !kinds.includes(said.kind))
    return bad('DECLARATION_INVALID', `${JSON.stringify(said.kind ?? null)} is not a way ${id} can send its key.`, 'auth.kind', kinds);
  if (said.kind !== 'header' && said.kind !== 'query') {
    if (said.name !== undefined)
      return bad('DECLARATION_INVALID', `${id} sends its key as ${said.kind}, which goes in no header or parameter of its own. Take name out.`, 'auth.name');
    return null;
  }
  const where = said.kind === 'header' ? 'header' : 'query parameter';
  if (typeof said.name !== 'string' || said.name === '')
    return bad('DECLARATION_INVALID', `${id} sends its key in a ${where} and does not say which. Write name: beside kind.`, 'auth.name');
  if (looksLikeCredential(said.name))
    return bad('DECLARATION_INVALID', `${id}'s auth name looks like the key itself, and a key is never in a declaration. Name the ${where} it goes in.`, 'auth.name');
  if (said.kind === 'header') {
    if (!HEADER_NAME.test(said.name))
      return bad('DECLARATION_INVALID', `${id}'s auth name is the name of the header the key goes in, such as X-Api-Key.`, 'auth.name');
    if (reservedKeyHeader(said.name))
      return bad('DECLARATION_INVALID', `${id} puts its key in ${said.name}, which the request sets itself. Use kind: bearer for Authorization, or name a header of the provider's own.`, 'auth.name');
    return null;
  }
  if (!QUERY_NAME.test(said.name))
    return bad('DECLARATION_INVALID', `${id}'s auth name is the query parameter the key goes in, such as api_key.`, 'auth.name');
  return null;
}

/**
 * `at:` and `tz:` on a scheduled action: the time of day each run belongs to, and the zone it is read in.
 *
 * A TIME OF DAY REPEATS ONLY ON WHOLE DAYS. `every: 6h` with `at: 07:00` names a time the next run cannot keep, so it is
 * refused rather than read as one of the two. A ZONE WITH NO TIME changes nothing about when a call or a poll runs,
 * which counts intervals, and is refused as a promise nothing keeps; a paged pull's window is counted in it, so it may
 * name one alone (`zoneAlone`). A ZONE THIS RUNTIME CANNOT READ is refused here and not found at the first run.
 */
function clockFault(id: string, body: { every?: unknown; at?: unknown; tz?: unknown }, o: { runs: boolean; zoneAlone: boolean }): Refusal | null {
  if (body.tz !== undefined) {
    if (typeof body.tz !== 'string' || body.tz === '' || body.tz.length > 64 || !isZone(body.tz))
      return bad('DECLARATION_INVALID', `${id}'s tz is the name of a time zone, such as Africa/Cairo or Europe/London.`, 'tz');
    if (body.at === undefined && !o.zoneAlone)
      return bad('DECLARATION_INVALID', `${id} names a zone and no time of day, so the zone changes nothing. Write at: beside it, such as 07:00, or take tz out.`, 'tz');
  }
  if (body.at === undefined) return null;
  if (!o.runs)
    return bad('DECLARATION_INVALID', `${id} runs only when a rule runs it, so it has no time of day. Write trigger: both to run it on a clock as well.`, 'at');
  if (timeOf(body.at) === null) return bad('DECLARATION_INVALID', `${id}'s at is a time of day from 00:00 to 23:59, such as 07:00.`, 'at');
  const every = typeof body.every === 'string' ? intervalMs(body.every) : null;
  if (every === null || every % DAY_MS !== 0)
    return bad('DECLARATION_INVALID', `${id} runs at ${String(body.at)} every ${String(body.every)}, and a time of day repeats only on whole days. Write every: 1d, 2d or 1w.`, 'every');
  return null;
}

/** A day, in the milliseconds `intervalMs` answers. */
const DAY_MS = 86_400_000;

/** What a connector's `fetch.schedule` may say (`25 §3.2`). */
const SCHEDULE_KEYS: readonly string[] = ['every', 'at', 'tz', 'jitter'];

/**
 * A connector's `fetch.schedule`, against the declaration's own `every` and `at`.
 *
 * ONE INTERVAL, WRITTEN ONCE. The record fires a pull from `every`, and the connector counted its next slot from
 * `fetch.schedule.every`, so a declaration that said `every: 1h` and `schedule: { every: 15m }` was floor-checked on one
 * and run on the other. `prepareAction` now hands the runner `every` as its schedule, and a `fetch.schedule` that says
 * anything else is refused here, so what the owner approved is the only interval there is.
 */
function scheduleFault(id: string, body: { every?: unknown; at?: unknown; tz?: unknown }, schedule: unknown): Refusal | null {
  if (schedule === undefined) return null;
  if (schedule === null || typeof schedule !== 'object' || Array.isArray(schedule))
    return bad('DECLARATION_INVALID', `${id}'s fetch.schedule is { every }, the same interval as every:. Write every: alone.`, 'fetch.schedule');
  const said = schedule as { every?: unknown; at?: unknown; tz?: unknown; jitter?: unknown };
  const stray = Object.keys(said).find((k) => !SCHEDULE_KEYS.includes(k));
  if (stray !== undefined)
    return bad('DECLARATION_INVALID', `${id}'s fetch.schedule declares ${stray}, and a schedule says every, at, tz: record and jitter: auto.`, `fetch.schedule.${stray}`, SCHEDULE_KEYS);
  /* `25 §3.2`'s TWO FIXED WORDS. The zone is the record's unless the action names its own at the top, and jitter is never
     off (`25 §9`), so each key has one value it may say. */
  if (said.tz !== undefined && (said.tz !== 'record' || body.tz !== undefined))
    return bad('DECLARATION_INVALID', `${id}'s fetch.schedule.tz is record, which is the zone when tz: names none. Name another zone once, as tz:.`, 'fetch.schedule.tz');
  if (said.jitter !== undefined && said.jitter !== 'auto')
    return bad('DECLARATION_INVALID', `${id}'s fetch.schedule.jitter is auto: a scheduled fetch is always spread, so it is never off.`, 'fetch.schedule.jitter');
  if (said.every !== undefined && said.every !== body.every)
    return bad(
      'DECLARATION_INVALID',
      `${id} says every ${String(body.every)} and fetch.schedule.every ${String(said.every)}, and they are one interval. Write it once, as every:.`,
      'fetch.schedule.every',
    );
  if (said.at !== undefined && said.at !== body.at)
    return bad('DECLARATION_INVALID', `${id} says at ${String(body.at)} and fetch.schedule.at ${String(said.at)}, and they are one time of day. Write it once, as at:.`, 'fetch.schedule.at');
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
  /* THE OPERATOR BEFORE THE FIELD, because an operator this backend cannot serve is wrong whatever
     field it is about, and naming the field first would send an author to check a name that is
     right. `MATCH_OP_UNSUPPORTED` is in the registry and `30 §6` names it "the one code for THIS
     TEST CANNOT APPLY HERE", listing the `inbox_raw` backend as its first case. */
  const said = INBOX_RAW_REFUSES.find((o) => o in (node as Record<string, unknown>));
  if (said)
    return bad(
      'MATCH_OP_UNSUPPORTED',
      `${id}.${at} uses ${said}, and an arrival takes is, not, in, not_in, gt, gte, lt, lte, before, after, between, contains, empty, present.`,
      at,
    );

  const field = (node as { field?: unknown }).field;
  if (typeof field === 'string' && !(MATCH_FIELDS as readonly string[]).includes(field))
    return bad(
      'MATCH_FIELD_UNKNOWN',
      `${id}.${at} is about ${field}, and an arrival holds ${MATCH_FIELDS.join(', ')}. Match on those, and read the rest with extract.`,
      at,
      [...MATCH_FIELDS],
    );
  return null;
}

/**
 * `43 §4.3`'s date tokens, longest first.
 *
 * LONGEST FIRST, so `YYYY` is one year and not two `YY`s, and `MMM` is `MM` then `M`: two month
 * tokens, which is `43 §9.3`'s own worked failure. Every other character is a literal, lower case
 * included, so `dd/mm/yyyy` holds no token at all.
 */
const DATE_TOKENS = [
  ['YYYY', 'year'],
  ['YY', 'year'],
  ['MM', 'month'],
  ['DD', 'day'],
  ['M', 'month'],
  ['D', 'day'],
] as const;

/** What is wrong with a date format under `43 §4.3`, as the end of a sentence, or `null`. */
function dateFormatFault(format: string): string | null {
  const held = { year: 0, month: 0, day: 0 };
  let i = 0;
  while (i < format.length) {
    const token = DATE_TOKENS.find(([t]) => format.startsWith(t, i));
    if (token === undefined) {
      i += 1;
      continue;
    }
    const [t, part] = token;
    held[part] += 1;
    i += t.length;
    /* A ONE-OR-TWO-DIGIT TOKEN RUN INTO ANOTHER NUMBER CANNOT BE SPLIT: `DMYYYY` over `1122026` is
       the first of December or the eleventh of February, and nothing in the text says which. */
    if (t.length === 1 && DATE_TOKENS.some(([next]) => format.startsWith(next, i)))
      return `runs ${t}, which is one or two digits, straight into another number, so nothing says where it ends`;
  }
  for (const part of ['year', 'month', 'day'] as const)
    if (held[part] !== 1) return held[part] === 0 ? `holds no ${part}` : `holds ${held[part]} ${part} tokens`;
  return null;
}

/** `42 §4.7`'s anchors: at most one per form, and none means the whole text. */
const ANCHORS = ['after', 'before', 'between'] as const;

/** `42 §4.7`'s form table, second column: what each extractor holds beside an anchor. */
const ARGUMENTS: Record<string, readonly string[]> = {
  text: [], money: ['currency'], date: ['format'], int: [], decimal: ['sep'], enum: ['map'], lookup: ['register', 'by', 'says', 'where', 'split'],
};

/** The longest noun a lookup's `says` may be: "card", "account", "wallet". It is said inside a question. */
const SAYS_MOST = 24;

/**
 * `42 §4.2`'s `Cur`, SPELLED ONCE. `mappingFault` tested it inline and a form needs the same test,
 * and a second copy of a three-character grammar is how the path grammar, `MATCH_FIELDS` and `Json`
 * each drifted. Upper case, because `Cur` is and `02 §3` is.
 *
 * AND THE GRAMMAR IS NOT THE CHECK. `34 §3` writes the currency as `iso4217`, not as three letters,
 * and this is the install-time twin of the write-path defect `coerce.ts` had: it validates a
 * connector's declared fallback currency rather than row data, so `currency: 'GPB'` installed
 * clean and then stamped a currency that does not exist onto every row the connector ever mapped.
 * `isCurrencyCode` is the same membership test the write path uses, from the same `Intl` list, so
 * the two doors into the record cannot disagree about what a currency is.
 */
const CUR = /^[A-Z]{3}$/u;
const isCur = (v: unknown): boolean => typeof v === 'string' && CUR.test(v) && isCurrencyCode(v);

const ENUM_LITERALS = 64;
const LITERAL_BYTES = 200;

const isLiteral = (v: unknown): boolean => typeof v === 'string' && v.length >= 1;

/** Every literal a form holds, with where it sits, so the byte ceiling is applied in one place. */
function* literalsOf(form: Record<string, unknown>): Generator<[string, string]> {
  const key = Object.keys(form).filter((k) => k !== 'note')[0];
  if (key === undefined) return;
  if (key === 'after' || key === 'before') {
    if (typeof form[key] === 'string') yield [key, form[key]];
    return;
  }
  if (key === 'between') {
    if (Array.isArray(form.between))
      for (const [i, v] of form.between.entries()) if (typeof v === 'string') yield [`between[${i}]`, v];
    return;
  }
  const body = form[key];
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return;
  const args = body as Record<string, unknown>;
  for (const a of ['after', 'before'] as const) if (typeof args[a] === 'string') yield [`${key}.${a}`, args[a]];
  if (Array.isArray(args.between))
    for (const [i, v] of args.between.entries()) if (typeof v === 'string') yield [`${key}.between[${i}]`, v];
  /* A MAP'S LITERALS POINT AT THE MAP, not at themselves: the one being refused is over 200 bytes
     long, and putting it in `at` puts it in every log line that carries the refusal. */
  if (key === 'enum' && args.map !== null && typeof args.map === 'object' && !Array.isArray(args.map))
    for (const l of Object.keys(args.map as Record<string, unknown>)) yield ['enum.map', l];
}

/** The forms whose value is the text they cut, which is all a `strip:` can take a prefix off. */
const TEXT_FORMS: readonly string[] = ['after', 'before', 'between', 'text'];

/** A field's form with its `strip:` left out, or the form as it came where it carries none. */
function withoutStrip(form: unknown): unknown {
  if (form === null || typeof form !== 'object' || Array.isArray(form) || !Object.hasOwn(form, 'strip')) return form;
  const copy: Record<string, unknown> = { ...(form as Record<string, unknown>) };
  delete copy.strip;
  return copy;
}

/** Whether every value `form` can yield is cut text: one of `TEXT_FORMS`, or a combinator holding only those. */
function readsText(form: unknown, depth: number): boolean {
  if (form === null || typeof form !== 'object' || Array.isArray(form) || depth > 3) return false;
  const held = form as Record<string, unknown>;
  const key = Object.keys(held).find((k) => k !== 'note');
  if (key === undefined) return false;
  if (TEXT_FORMS.includes(key)) return true;
  if (key === 'first') return Array.isArray(held.first) && held.first.length > 0 && held.first.every((arm) => readsText(arm, depth + 1));
  const inner = held[key];
  if ((key === 'nth' || key === 'default') && inner !== null && typeof inner === 'object')
    return readsText((inner as { of?: unknown }).of, depth + 1);
  return false;
}

/**
 * A field's `strip: [<prefix>, ...]`: 1 to `STRIP_MOST` prefixes, each no longer than an anchor (`LITERAL_BYTES`), beside
 * a form that reads text.
 *
 * BESIDE A TEXT FORM ONLY, because a prefix is taken off a name and nothing else here is one. An amount, a day or a
 * number is not text by the time it is read, and a `lookup` or an `enum` answers a row's id or a declared value, which a
 * prefix cut off would turn into a value nobody declared. Refused here, where the author reads it, rather than skipped at
 * every arrival.
 */
function stripFault(form: unknown, bare: unknown, at: string): Refusal | null {
  if (form === null || typeof form !== 'object' || Array.isArray(form) || !Object.hasOwn(form, 'strip')) return null;
  const strip = (form as { strip?: unknown }).strip;
  if (!Array.isArray(strip) || strip.length === 0 || strip.length > STRIP_MOST)
    return bad('DECLARATION_INVALID', `${at}'s strip is a list of 1 to ${STRIP_MOST} prefixes to take off the value, such as ["FAWRY*"].`, `${at}.strip`);
  for (const [i, prefix] of strip.entries()) {
    if (typeof prefix !== 'string' || prefix.trim() === '')
      return bad('DECLARATION_INVALID', `${at}.strip[${i}] is ${JSON.stringify(prefix ?? null)}, and a prefix is the text a value starts with.`, `${at}.strip[${i}]`);
    if (byteLength(prefix) > LITERAL_BYTES)
      return bad('OUT_OF_BOUNDS', `${at}.strip[${i}] is ${byteLength(prefix)} bytes, and a prefix is 1 to ${LITERAL_BYTES}.`, `${at}.strip[${i}]`);
  }
  if (!readsText(bare, 0))
    return bad(
      'DECLARATION_INVALID',
      `${at} strips a prefix from a value that is not text. Strip sits beside after, before, between or text, or a first, nth or default holding only those.`,
      `${at}.strip`,
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
        `${at}: ${JSON.stringify(key)} is not one of the thirteen forms, ten extractors and three combinators.`,
        at,
        EXTRACTORS as unknown as string[],
      );
  }

  /**
   * A `date:` FORMAT NOTHING COULD READ, AND IT READ AS "NO DATE HERE" ON EVERY ARRIVAL.
   *
   * The key was checked against the thirteen and the format was never looked at. `ingest.ts`'s
   * `day` looks a format up in a table of four and returns `null` for one it does not hold, which
   * is also what it returns for a text with no date in it. Driven against `validate` and `day`:
   *
   *     date { format: 'DD.MM.YYYY' }           ACCEPTED (null)
   *     date { format: 'dd/mm/yyyy' }           ACCEPTED (null)
   *     date {}                                 ACCEPTED (null)
   *     date { format: 42 }                     ACCEPTED (null)
   *     date { format: 'DD/MM' }                ACCEPTED (null)
   *     day("due 03.04.2026", "DD.MM.YYYY")  =  null
   *
   * So an author writing a date the ordinary European way installed a rule that matched arrivals,
   * wrote rows and left the date empty on every one of them for as long as the pack was installed,
   * with nothing refused and nothing logged.
   *
   * TWO ANSWERS, BECAUSE THEY ARE TWO FACTS. `43 §4.3` is a token grammar, and a format outside it
   * (no year, two months, a one-digit day run into the next number, no format at all) is
   * `DATE_FORMAT_INVALID`, which `43 §13 D13` has `42` raise at install. A format inside the grammar
   * that `day` does not tabulate is right and this build is behind: `DD.MM.YYYY` is one, and
   * `43 §9.3` reads `29.08.2026` with it. That is the answer `keyFault` gives a published key nothing
   * keeps, and it names the four this build does read.
   */
  if ('date' in form) {
    const format = (form as { date?: { format?: unknown } | null }).date?.format;
    const fault = typeof format === 'string' ? dateFormatFault(format) : format === undefined ? 'is missing' : 'is not text';
    if (fault !== null)
      return bad(
        'DATE_FORMAT_INVALID',
        `${at}.date's format ${typeof format === 'string' ? `${format} ` : ''}${fault}. Write it with one year, one month and one day token: YYYY or YY, MM or M, DD or D.`,
        `${at}.date.format`,
      );
    /* THIS REFUSED EVERY FORMAT THE GRAMMAR ADMITS AND THIS BUILD DID NOT READ, and it was right to while that was
       true: `NOT_IN_THIS_BUILD`, naming the four, saying *the repair is a deploy, not an edit*. It was the one refusal
       in the tree whose fix was a deploy, and it existed because `ingest.ts` held a second date grammar — four formats
       keyed by name — beside `@braindog/extract`'s, which reads the token set. A record now reaches that reader
       (`RecordOptions.dates`), so there is no build to be behind and no list to name. What is left here is
       `DATE_FORMAT_INVALID` above, which is about the format's own tokens and is the check `43 §6` actually specifies. */
  }

  /**
   * AND AN EXTRACTOR'S OWN ARGUMENTS, WHICH WENT THROUGH UNREAD TOO.
   *
   * `42 §4.7` already writes every rule below, in one paragraph, and says this schema is what
   * enforces it: *"A form (43 §4.3, whose keys this schema accepts exactly) is one object with one
   * key … `anchor` is at most one of after before between inside the form … a literal is 1-200
   * bytes."* The table was written and the schema accepted anything. Driven against `validate`,
   * every one of these installed clean:
   *
   *     {}                                   { money: {}, int: {} }      { after: 42 }
   *     { between: ['a'] }                   { text: { after, before } } { money: { sep } }
   *     { int: { sep } }                     { decimal: { sep: 'x' } }   { enum: {} }
   *     { lookup: { register } }             { decimal: { nonsense: 1 } }
   *     { money: { currency: 'NOTACODE' } }
   *
   * Each one matches arrivals, writes rows and leaves the field empty on every one — the silence
   * the `date.format` paragraph above describes at length, nine more forms over.
   */
  const named = Object.keys(form).filter((k) => k !== 'note');
  if (named.length !== 1)
    return bad(
      'EXTRACTOR_UNKNOWN',
      named.length === 0
        ? `${at} holds no form. One object with one of the thirteen keys reads the field; an empty one reads nothing, on every arrival.`
        : `${at} holds ${named.length} forms: ${named.join(', ')}. A form is one object with one key. Two ways of reading a field is first: [a, b].`,
      at,
    );

  const only = named[0] as string;
  const body = (form as Record<string, unknown>)[only];

  if (only === 'after' || only === 'before') {
    if (!isLiteral(body))
      return bad(
        'EXTRACTOR_UNKNOWN',
        `${at}.${only} is ${JSON.stringify(body ?? null)}, and an anchor is the text to look for: one character or more.`,
        `${at}.${only}`,
      );
  } else if (only === 'between') {
    if (!Array.isArray(body) || body.length !== 2 || !body.every(isLiteral))
      return bad(
        'EXTRACTOR_UNKNOWN',
        `${at}.between is ${JSON.stringify(body ?? null)}, and it takes two anchors: the one to start after and the one to stop before.`,
        `${at}.between`,
      );
  } else if (ARGUMENTS[only] !== undefined) {
    const takes = ARGUMENTS[only] as readonly string[];
    if (body === null || typeof body !== 'object' || Array.isArray(body))
      return bad(
        'EXTRACTOR_UNKNOWN',
        `${at}.${only} is ${JSON.stringify(body ?? null)}, and a form's arguments are an object: {} when it takes none.`,
        `${at}.${only}`,
      );
    const args = body as Record<string, unknown>;

    const legal = [...takes, ...ANCHORS];
    for (const k of Object.keys(args))
      if (!legal.includes(k))
        return bad(
          'EXTRACTOR_UNKNOWN',
          `${at}.${only} takes ${legal.join(', ')}, and ${JSON.stringify(k)} is none of them, so it would install and do nothing.`,
          `${at}.${only}`,
          legal,
        );

    /* AT MOST ONE ANCHOR — `42 §4.7`. Two is a slice, and a slice is `between`; taking both and
       applying one is a declaration that reads differently than it looks. */
    const anchors = ANCHORS.filter((a) => a in args);
    if (anchors.length > 1)
      return bad(
        'EXTRACTOR_UNKNOWN',
        `${at}.${only} narrows the text ${anchors.length} ways: ${anchors.join(' and ')}. An extractor takes at most one. between: [a, b] is how a slice takes both ends.`,
        `${at}.${only}`,
      );
    for (const a of ['after', 'before'] as const)
      if (a in args && !isLiteral(args[a]))
        return bad(
          'EXTRACTOR_UNKNOWN',
          `${at}.${only}.${a} is ${JSON.stringify(args[a] ?? null)}, and an anchor is the text to look for: one character or more.`,
          `${at}.${only}.${a}`,
        );
    if ('between' in args && (!Array.isArray(args.between) || args.between.length !== 2 || !args.between.every(isLiteral)))
      return bad(
        'EXTRACTOR_UNKNOWN',
        `${at}.${only}.between is ${JSON.stringify(args.between ?? null)}, and it takes two anchors: the one to start after and the one to stop before.`,
        `${at}.${only}.between`,
      );

    /* `sep` NAMES WHICH OF `.` AND `,` IS THE POINT, and anything else makes every separator group:
       the field reads 1250 where the message said 1.25, in whatever the register calls money. */
    if (only === 'decimal' && 'sep' in args && args.sep !== '.' && args.sep !== ',')
      return bad(
        'EXTRACTOR_UNKNOWN',
        `${at}.decimal's sep is ${JSON.stringify(args.sep ?? null)}, and it names which of . and , is the decimal point. The other one groups.`,
        `${at}.decimal.sep`,
        ['.', ','],
      );

    /* OR THE ACCOUNT'S OWN CURRENCY: `{ of: <field>, field: <the account's field> }`, read off the row another
       field of the pattern looked up. Which field that is, and that it is a lookup, is the pattern's to say and is asked
       where the whole extract is in hand (`currencyOfFault`). */
    if (only === 'money' && 'currency' in args && !isCur(args.currency) && !isCurrencyOf(args.currency))
      return bad(
        'EXTRACTOR_UNKNOWN',
        `${at}.money's currency is ${JSON.stringify(args.currency ?? null)}, and it is the code to fall back on when the text names none: an ISO 4217 code in upper case, USD or EUR, or { of: account, field: balance } for the currency of the account another field found.`,
        `${at}.money.currency`,
      );

    if (only === 'enum') {
      const map = args.map;
      if (map === null || typeof map !== 'object' || Array.isArray(map))
        return bad(
          'EXTRACTOR_UNKNOWN',
          `${at}.enum's map is ${map === undefined ? 'missing' : JSON.stringify(map)}, and the map is the whole of what an enum is: the literals to look for, and the value each one means.`,
          `${at}.enum.map`,
        );
      const spelt = Object.keys(map as Record<string, unknown>);
      if (spelt.length < 1 || spelt.length > ENUM_LITERALS)
        return bad(
          'EXTRACTOR_UNKNOWN',
          `${at}.enum's map holds ${spelt.length} literals, and it takes 1 to ${ENUM_LITERALS}.`,
          `${at}.enum.map`,
        );
    }

    if (only === 'lookup') {
      for (const k of ['register', 'by'] as const)
        if (!isLiteral(args[k]))
          return bad(
            'EXTRACTOR_UNKNOWN',
            `${at}.lookup's ${k} is ${JSON.stringify(args[k] ?? null)}. A lookup resolves a row by naming the register to look in and the field to match on.`,
            `${at}.lookup.${k}`,
          );
      const wrong = lookupKeysFault(args, at);
      if (wrong) return wrong;
    }
  }

  /* AND A LITERAL HAS A CEILING — `42 §4.7`, 1 to 200 bytes — under `OUT_OF_BOUNDS` and not
     `EXTRACTOR_UNKNOWN`, because the form is one of the thirteen and it is the size that is wrong;
     `34 §1.2`'s `contains` has the same ceiling under the same code. One pass over every literal
     the form holds, rather than a check inside each branch above, so a form cannot acquire a
     literal and miss the rule. */
  for (const [where, value] of literalsOf(form as Record<string, unknown>))
    if (byteLength(value) > LITERAL_BYTES)
      return bad(
        'OUT_OF_BOUNDS',
        `${at}.${where} is ${byteLength(value)} bytes, and an anchor is 1 to ${LITERAL_BYTES}. An anchor is the short run of text either side of the value, not the value.`,
        `${at}.${where}`,
      );

  const held = form as {
    first?: unknown;
    nth?: { n?: unknown; of?: unknown };
    default?: { value?: unknown; of?: unknown };
  };

  /* A COMBINATOR'S OWN ARGUMENTS, WHICH NOTHING CHECKED. The key was checked against the thirteen
     and the inner forms were walked, and everything between the two went through: `first: []` with
     no arms, `nth: { n: 0 }`, a `default` carrying no `value`. Each of those installs, matches, and
     reads nothing — which is the shape this whole function exists to stop, one level in.

     `EXTRACTOR_UNKNOWN` IS THE CODE, and it is the code the depth ceiling above already uses. Its
     row in `07 §3` reads "a key outside the thirteen", and a `first` with one arm is not the `first`
     form — the thirteen are shapes and not spellings. */
  if ('first' in form) {
    if (!Array.isArray(held.first) || held.first.length < 2 || held.first.length > FIRST_ARMS)
      return bad(
        'EXTRACTOR_UNKNOWN',
        `${at}.first takes 2 to ${FIRST_ARMS} forms, and this is ${Array.isArray(held.first) ? `${held.first.length}` : JSON.stringify(held.first ?? null)}. One way of reading a field is that form on its own.`,
        at,
      );
    for (const [i, inner] of held.first.entries()) {
      const fault = extractorFault(inner, `${at}.first[${i}]`, depth + 1);
      if (fault) return fault;
    }
  }

  if ('nth' in form) {
    const n = held.nth?.n;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > NTH_CEILING)
      return bad(
        'EXTRACTOR_UNKNOWN',
        `${at}.nth.n is ${JSON.stringify(n ?? null)}, and it counts candidates from 1 to ${NTH_CEILING}.`,
        at,
      );
  }

  /* A `default` WITH NO `value` IS NOT A DEFAULT. It is the one form whose whole purpose is to make
     a field optional, and without the key it makes it required again — silently, because the field
     then reads as missing exactly as it did before anybody wrote the fallback. */
  if ('default' in form && !(held.default !== null && typeof held.default === 'object' && 'value' in held.default))
    return bad(
      'EXTRACTOR_UNKNOWN',
      `${at}.default carries no value, and the value is the whole of what a default is. Every declared field is required; this is the only way to make one optional.`,
      at,
    );

  /* THE `of:` OF WHICHEVER COMBINATOR IS PRESENT, and only of one that is. The first version of
     this loop read `held.nth?.of` and `held.default?.of` unconditionally and refused an absent one
     — which is every plain form there is, so `{ money: … }` would have been refused as a `nth`
     carrying no `of`. Caught by the tests in the same commit; kept here because the shape of the
     mistake is the reason a check runs against real declarations before it is believed. */
  for (const key of ['nth', 'default'] as const) {
    if (!(key in form)) continue;
    const inner = held[key]?.of;
    if (inner === undefined)
      return bad(
        'EXTRACTOR_UNKNOWN',
        `${at}.${key} carries no of:, and a combinator reads a form rather than the payload.`,
        at,
      );
    const fault = extractorFault(inner, `${at}.${key}.of`, depth + 1);
    if (fault) return fault;
  }
  return null;
}

/** `43 §4.4`'s grammar, and its ceiling. An empty path is the root and is legal. */
/** What one `map:` entry may carry beside its `path` and `type`. */
const MAPPING_KEYS = new Set(['path', 'type', 'from', 'minor', 'currency', 'format', 'values', 'other', 'note']);

/** `currency: { of, field }`: the field of this pattern whose row the currency is read off, and that row's field. */
function isCurrencyOf(value: unknown): value is { of: string; field: string } {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return Object.keys(v).length === 2 && typeof v.of === 'string' && FIELD_ID_RE.test(v.of) && typeof v.field === 'string' && FIELD_ID_RE.test(v.field);
}

const FIELD_ID_RE = /^[a-z][a-z0-9_]{0,31}$/u;

/** How deep a form may nest, as `extractorFault` counts it: a walk over a declared form goes no deeper. */
const NESTING_CEILING = 3;

/**
 * A lookup's three optional keys: `says`, the noun its question uses for what the message printed; `where`, a
 * filter over the list; `split`, that the field holds several values parted by commas.
 *
 * EACH IS HELD TO ITS SHAPE HERE, and `where` to the list's fields where the batch says what they are
 * (`lookupWhereFault`): a filter that names no field of the list would install and then admit nothing, and every text
 * would wait for an account the lookup could never read.
 */
function lookupKeysFault(args: Record<string, unknown>, at: string): Refusal | null {
  if ('says' in args) {
    const says = args.says;
    if (typeof says !== 'string' || says.trim() === '' || says.length > SAYS_MOST || !/^[\p{L}][\p{L} '-]*$/u.test(says.trim()))
      return bad(
        'EXTRACTOR_UNKNOWN',
        `${at}.lookup's says is ${JSON.stringify(says ?? null)}, and it is the word its question uses for what the message printed, card or account: letters, at most ${SAYS_MOST}.`,
        `${at}.lookup.says`,
      );
  }
  if ('split' in args && typeof args.split !== 'boolean')
    return bad(
      'EXTRACTOR_UNKNOWN',
      `${at}.lookup's split is ${JSON.stringify(args.split ?? null)}, and it is true when the field may hold several values parted by commas, or false.`,
      `${at}.lookup.split`,
    );
  if ('where' in args) {
    const where = args.where;
    const sentence = typeof where === 'string' && where.trim() !== '' && where.length <= LITERAL_BYTES;
    if (!sentence && (where === null || typeof where !== 'object' || Array.isArray(where)))
      return bad(
        'EXTRACTOR_UNKNOWN',
        `${at}.lookup's where is ${JSON.stringify(where ?? null)}, and it is a filter over the list the lookup reads, such as kind is card.`,
        `${at}.lookup.where`,
      );
  }
  return null;
}

/** Every lookup a form holds, however deep, with the path a refusal names it by. */
function lookupsIn(form: unknown, at: string, depth = 0): { at: string; lookup: Record<string, unknown> }[] {
  if (form === null || typeof form !== 'object' || depth > NESTING_CEILING) return [];
  const f = form as Record<string, unknown>;
  if (f.lookup !== null && typeof f.lookup === 'object') return [{ at: `${at}.lookup`, lookup: f.lookup as Record<string, unknown> }];
  if (Array.isArray(f.first)) return f.first.flatMap((arm, i) => lookupsIn(arm, `${at}.first[${i}]`, depth + 1));
  const inner = (f.nth as { of?: unknown } | undefined)?.of ?? (f.default as { of?: unknown } | undefined)?.of;
  return inner === undefined ? [] : lookupsIn(inner, `${at}.${'nth' in f ? 'nth' : 'default'}.of`, depth + 1);
}

/** Every `currency: { of, field }` a form holds, however deep, with its path. */
function currenciesIn(form: unknown, at: string, depth = 0): { at: string; of: string; field: string }[] {
  if (form === null || typeof form !== 'object' || depth > NESTING_CEILING) return [];
  const f = form as Record<string, unknown>;
  const money = f.money as { currency?: unknown } | undefined;
  if (money !== null && typeof money === 'object') return isCurrencyOf(money.currency) ? [{ at: `${at}.money.currency`, ...money.currency }] : [];
  if (Array.isArray(f.first)) return f.first.flatMap((arm, i) => currenciesIn(arm, `${at}.first[${i}]`, depth + 1));
  const inner = (f.nth as { of?: unknown } | undefined)?.of ?? (f.default as { of?: unknown } | undefined)?.of;
  return inner === undefined ? [] : currenciesIn(inner, `${at}.${'nth' in f ? 'nth' : 'default'}.of`, depth + 1);
}

/**
 * A pattern's account-currency reads, against the rest of its extract: `of` names another field of it whose form is a
 * lookup, which is read first; and where the batch holds that lookup's list, `field` is one of its fields that holds a
 * currency (money, or a code as text). A currency read off a field that finds no row is no currency on every text.
 */
function currencyOfFault(extract: Record<string, unknown>, id: string, installed?: Known): Refusal | null {
  for (const [field, form] of Object.entries(extract)) {
    for (const c of currenciesIn(withoutStrip(form), `${id}.extract.${field}`)) {
      const looked = lookupsIn(withoutStrip(extract[c.of]), `${id}.extract.${c.of}`)[0];
      if (c.of === field || looked === undefined)
        return bad(
          'EXTRACTOR_UNKNOWN',
          `${c.at} reads the currency of the row ${c.of} finds, and ${c.of === field ? 'that is this field itself' : Object.hasOwn(extract, c.of) ? `${c.of} is not a lookup` : `${id} reads no field called ${c.of}`}. Name the field whose lookup finds the account.`,
          c.at,
        );
      const fields = listFields(installed, looked.lookup.register);
      const held = fields?.find((f) => f.id === c.field);
      if (fields !== null && (held === undefined || !['money', 'text', 'enum'].includes(String(held.type))))
        return bad(
          'EXTRACTOR_UNKNOWN',
          `${c.at} reads the currency in ${c.field} of ${String(looked.lookup.register)}, and ${held === undefined ? 'it has no such field' : `${c.field} is ${String(held.type)}, which holds no currency`}. Name its money field, such as balance.`,
          c.at,
        );
    }
    for (const l of lookupsIn(withoutStrip(form), `${id}.extract.${field}`)) {
      const wrong = lookupWhereFault(l.lookup, l.at, installed);
      if (wrong) return wrong;
    }
  }
  return null;
}

/** A list's declared fields as the batch or the record holds them, or `null` when neither says. */
function listFields(installed: Known | undefined, register: unknown): { id?: unknown; type?: unknown; values?: unknown; of?: unknown; to?: unknown }[] | null {
  if (installed === undefined || typeof register !== 'string') return null;
  const body = installed.get(`register.${register}`) as { fields?: unknown } | undefined;
  return body !== undefined && Array.isArray(body.fields) ? (body.fields as { id?: unknown; type?: unknown }[]) : null;
}

/** A lookup's `where`, compiled against its list's fields where they are known, so a filter that reads nothing is refused. */
function lookupWhereFault(lookup: Record<string, unknown>, at: string, installed?: Known): Refusal | null {
  if (lookup.where === undefined) return null;
  const fields = listFields(installed, lookup.register);
  if (fields === null) return null;
  const schema = {
    register: String(lookup.register),
    fields: Object.fromEntries(
      fields
        .filter((f) => typeof f.id === 'string')
        .map((f) => [
          f.id as string,
          {
            type: String(f.type),
            ...(Array.isArray(f.values) ? { values: f.values as string[] } : {}),
            ...(typeof f.of === 'string' ? { of: f.of } : {}),
            ...(typeof f.to === 'string' ? { to: f.to } : {}),
          },
        ]),
    ),
  };
  /* A SENTENCE IS READ AS A PAGE'S FILTER IS, with the instant only a relative day would need. */
  const said = typeof lookup.where === 'string' ? parseWhere(lookup.where, schema, { nowMs: 0 }) : { predicate: lookup.where as Predicate, bad: [] };
  const refused = said.bad[0] ?? compile(said.predicate, schema).bad[0];
  return refused ? bad(refused.code, `${at}.where: ${refused.fix}`, `${at}.where`, refused.allowed) : null;
}

/**
 * One `map:` entry (`map.ts`, `43 §4.5`): read from a path with a type, a `value` the declaration states, or
 * `arrived: true`. Anything else is refused here, because at arrival it would read nothing and say nothing.
 */
function mappingFault(entry: unknown, at: string): Refusal | null {
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry))
    return bad('DECLARATION_INVALID', `${at} is one object: { path, type }, { value } or { arrived: true }.`, at);
  const e = entry as Record<string, unknown>;
  const keys = Object.keys(e).filter((k) => k !== 'note');
  if ('value' in e) {
    if (keys.length !== 1) return bad('DECLARATION_INVALID', `${at} states a value, and a stated value takes no other key.`, at);
    return null;
  }
  if ('arrived' in e) {
    if (keys.length !== 1 || e.arrived !== true)
      return bad('DECLARATION_INVALID', `${at} is { arrived: true }, the instant the answer arrived, with no other key.`, at);
    return null;
  }
  if (!('path' in e)) return bad('DECLARATION_INVALID', `${at} names no path. Write { path, type }, { value } or { arrived: true }.`, at);
  const unknown = keys.find((k) => !MAPPING_KEYS.has(k));
  if (unknown !== undefined) return bad('DECLARATION_INVALID', `${at} has ${JSON.stringify(unknown)}, which a mapping does not take.`, `${at}.${unknown}`);
  if (typeof e.type !== 'string' || !(MAP_TYPES as readonly string[]).includes(e.type))
    return bad('DECLARATION_INVALID', `${at}'s type is ${JSON.stringify(e.type ?? null)}, and a mapped field is one of ${MAP_TYPES.join(', ')}.`, `${at}.type`, MAP_TYPES as unknown as string[]);
  const paths = Array.isArray(e.path) ? e.path : [e.path];
  if (Array.isArray(e.path) && (e.type !== 'money' || e.path.length !== 2))
    return bad('DECLARATION_INVALID', `${at} names two paths, and only money reads two: [amount, currency].`, `${at}.path`);
  for (const path of paths) {
    const wrong = pathFault(path, `${at}.path`);
    if (wrong) return wrong;
    if (typeof path === 'string' && path.includes('[]'))
      return bad('PATH_INVALID', `${at}.path says [], which reads every element, and a mapped field is one value. Name one: [0] or [-1].`, `${at}.path`);
  }
  if (e.from !== undefined && e.from !== 'epoch_s' && e.from !== 'epoch_ms')
    return bad('DECLARATION_INVALID', `${at}'s from is epoch_s or epoch_ms.`, `${at}.from`, ['epoch_s', 'epoch_ms']);

  /**
   * `format` WAS AN ACCEPTED KEY THAT NOTHING LOOKED AT, WHICH IS `extractorFault`'s `date:` DEFECT ONE
   * BLOCK OVER.
   *
   * `MAPPING_KEYS` admits `format` and this function checked `path`, `type`, `from`, a money currency
   * and an enum's values, so the format itself reached the write path unread. `map.ts` hands it to
   * `MapDeps.day`, and a reader answers `null` for a format it cannot compile, which is also what it
   * answers for a value with no date in it. So `{ path: 'x', type: 'day', format: 'banana' }` installed
   * clean, matched arrivals, wrote rows, and left the day empty on every one of them for as long as the
   * pack was installed, with nothing refused and nothing logged. `43 §13 D13` puts the check at install,
   * where the author is still looking at what they typed, and `dateFormatFault` is the reader the `date:`
   * extractor already uses. One grammar and not two: the whole point of that work was that a second date
   * reader drifts from the first, and a third would drift from both.
   *
   * AND `format` IS ONLY EVER READ ON A `day` THAT NAMES NO `from`. `43 §4.5` gives it to `day` alone:
   * `instant` reads RFC 3339 or an epoch through `from:`, and no other type in `MAP_TYPES` looks at it.
   * A `format` on a `money` or a `text` is a rule the author wrote, believed and never got, which is the
   * same silence one step out, and it is refused for the reason `readFault` refuses a `delimiter` on a
   * read that is not CSV: the author can see both keys at once and can see which has to go. A `day` that
   * names both is the sharper of the two, because `map.ts` takes the `from:` branch and returns before it
   * reads `format`, so the author wrote two ways to read one value and was told which won by nothing.
   */
  if (e.format !== undefined) {
    if (e.type !== 'day')
      return bad('DECLARATION_INVALID', `${at} is ${e.type} and says format, which only a day reads.`, `${at}.format`);
    if (e.from !== undefined)
      return bad('DECLARATION_INVALID', `${at} reads its day from ${String(e.from)}, so its format reads nothing. Keep one of the two.`, `${at}.format`);
    const fault = typeof e.format === 'string' ? dateFormatFault(e.format) : 'is not text';
    if (fault !== null)
      return bad(
        'DATE_FORMAT_INVALID',
        `${at}'s format ${typeof e.format === 'string' ? `${e.format} ` : ''}${fault}. Write it with one year, one month and one day token: YYYY or YY, MM or M, DD or D.`,
        `${at}.format`,
      );
  }

  if (e.type === 'money' && !Array.isArray(e.path) && !isCur(e.currency))
    return bad('DECLARATION_INVALID', `${at} is money, so it reads [amount, currency] or says currency: with an ISO 4217 code in upper case.`, `${at}.currency`);
  if (e.type === 'enum' && (!Array.isArray(e.values) || e.values.length === 0 || e.values.some((v) => typeof v !== 'string')))
    return bad('DECLARATION_INVALID', `${at} is an enum, so it lists its values.`, `${at}.values`);
  return null;
}

/** `42 §4.7`'s response formats, closed. */
const FETCH_FORMATS = ['json', 'csv', 'xml', 'html_table', 'text'] as const;

/** `42 §4.7`'s `delimiter`, closed. A tab is written as one character and not as `	`. */
const FETCH_DELIMITERS = [',', ';', '	'] as const;

/**
 * `fetch.read`, held to `42 §4.7`'s row — and to what the rest of the block can survive.
 *
 * TWO RULES AND NOT ONE. The first is the row itself: four keys, a closed format, a closed
 * delimiter, a whole table index. Until this existed only `rows` was checked, so
 * `read: { format: 'csv' }` installed clean against a runner that had no CSV reader and answered
 * every page *not JSON* — the `date.format` failure again, one block over.
 *
 * THE SECOND IS THAT A NON-JSON PAGE HAS NO DOCUMENT. `expect:`, an `on_error` condition with a
 * `path`, a `more:` and the two paginators that read the body (`cursor_param`, `keyset`) all reach
 * into a parsed response. A CSV page has rows and nothing else. Installed together they do not
 * fail loudly: the conditions never match, the `expect:`s never fire, and a cursor that is never
 * found reads as *the provider stopped sending one*, which is the end of the run. So a connector
 * declared in one of the four other formats would quietly fetch its first page for ever. It is
 * refused here, naming the key that has to go, because the author can see both of them at once.
 */
function readFault(
  fetch: { read?: Record<string, unknown>; expect?: unknown; page?: Record<string, unknown>; on_error?: Record<string, unknown> },
  id: string,
): Refusal | null {
  const read = fetch.read;
  if (read === undefined || read === null) return null;
  const at = `${id}.fetch.read`;
  if (typeof read !== 'object' || Array.isArray(read))
    return bad('DECLARATION_INVALID', `${at} is ${JSON.stringify(read)}, and a read is an object.`, at);

  for (const key of Object.keys(read))
    if (!['format', 'rows', 'delimiter', 'table'].includes(key))
      return bad('DECLARATION_INVALID', `${at} carries ${JSON.stringify(key)}, which a read does not take.`, at, [
        'format', 'rows', 'delimiter', 'table',
      ]);

  if (read.rows !== undefined) {
    const wrong = pathFault(read.rows, `${at}.rows`);
    if (wrong) return wrong;
  }

  const format = read.format ?? 'json';
  if (typeof format !== 'string' || !(FETCH_FORMATS as readonly string[]).includes(format))
    return bad('DECLARATION_INVALID', `${at}.format is ${JSON.stringify(read.format)}.`, `${at}.format`, FETCH_FORMATS);

  if (read.delimiter !== undefined) {
    if (format !== 'csv')
      return bad('DECLARATION_INVALID', `${at}.delimiter is for csv, and this read is ${format}.`, `${at}.delimiter`);
    if (typeof read.delimiter !== 'string' || !(FETCH_DELIMITERS as readonly string[]).includes(read.delimiter))
      return bad(
        'DECLARATION_INVALID',
        `${at}.delimiter is ${JSON.stringify(read.delimiter)}.`,
        `${at}.delimiter`,
        FETCH_DELIMITERS,
      );
  }

  if (read.table !== undefined) {
    if (format !== 'html_table')
      return bad('DECLARATION_INVALID', `${at}.table is for html_table, and this read is ${format}.`, `${at}.table`);
    if (typeof read.table !== 'number' || !Number.isInteger(read.table) || read.table < 0)
      return bad('OUT_OF_BOUNDS', `${at}.table is ${JSON.stringify(read.table)}, and a table index is 0 or more.`, `${at}.table`);
  }

  if (format === 'json') return null;

  const page = fetch.page ?? {};
  const conditions = [...((fetch.on_error?.error_when ?? []) as unknown[]), ...((fetch.on_error?.fatal_when ?? []) as unknown[])];
  const reads: [boolean, string][] = [
    [Array.isArray(fetch.expect) && fetch.expect.length > 0, 'expect'],
    [conditions.some((c) => typeof c === 'object' && c !== null && 'path' in c), 'on_error'],
    [page.kind === 'cursor_param' || page.kind === 'keyset', `page.kind ${JSON.stringify(page.kind)}`],
    [page.more !== undefined, 'page.more'],
  ];
  for (const [present, key] of reads)
    if (present)
      return bad(
        'DECLARATION_INVALID',
        `${id} reads ${format} pages and also declares ${key}, which reads the body as JSON. A ${format} page has rows and no document, so that ${key} would never match and the run would never end.`,
        `${id}.fetch.${key.split(' ')[0]}`,
      );

  return null;
}

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
          `${id}.when: the '${key}' pattern is ${bytes} bytes. The cap is ${PATTERN_MAX}. Use 'matches', which searches the full-text index instead.`,
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
function createFault(
  id: string,
  action: { create?: unknown },
  register: unknown,
  installed?: Known,
  owners?: Owners,
  ownPack?: string | null,
): Refusal | null {
  const spec = action.create as { register?: unknown; each?: unknown; bound?: unknown } | undefined;
  /* A RULE WITH NO `create` AT ALL IS NOT A CREATE, and there is nothing to fault. */
  if (spec === undefined) return null;
  /**
   * AND A `create` THAT IS NOT AN OBJECT IS A FAULT RATHER THAN AN ABSENCE.
   *
   * `null`, a string and a number all fell through the same `return null` as "no create here", so a
   * rule declaring `create: null` installed cleanly and then fired on nothing for ever: the record
   * accepted a rule whose whole purpose was written down and could never happen, and said nothing on
   * the day it was accepted or on any day after. That is the silence this file exists to break, one
   * key along from the codes below it.
   */
  if (spec === null || typeof spec !== 'object')
    return {
      code: 'DECLARATION_INVALID',
      fix: `${id} declares a create of ${JSON.stringify(spec)}, and a create names a register and what goes in it.`,
      at: 'then.create',
    };

  /**
   * `04 §5`'s THIRD CREATE CODE, WHICH HAD NO EMITTER ANYWHERE.
   *
   * *"A `create` into a register another pack owns — `rule.x writes register.invoices, declared by
   * freelancer-uk. A pack generates only into its own registers"*. The registry listed the code, the
   * table specified it, `30 §6` counted it, and nothing in this tree could raise it: a pack a
   * stranger wrote could declare a rule that generated rows into a register belonging to a pack the
   * record already trusted, and the install diff would show `SPAWNS` against somebody else's data.
   *
   * TWO NAMED PACKS THAT DIFFER, AND NOTHING ELSE. A rule the record itself declared has no pack and
   * is refused nothing — it is the record's own record. A pack creating into a register NOBODY owns
   * is the harder case and is deliberately allowed here: `04 §5`'s sentence reads "only into its own
   * registers", which would refuse a pack writing into the user's own register, and that is a
   * compatibility decision with a cost rather than a bug with a fix. It is left open on purpose rather
   * than settled quietly by whoever wrote this check.
   */
  if (typeof spec.register === 'string' && ownPack != null && owners) {
    const theirs = owners.get(`register.${spec.register}`);
    if (theirs != null && theirs !== ownPack)
      return bad(
        'CREATE_FOREIGN_REGISTER',
        `${id} writes register.${spec.register}, declared by ${theirs}. A pack generates only into its own registers.`,
        'register',
      );
  }

  if (spec.bound === undefined)
    return bad('CREATE_UNBOUNDED', `${id}: create has no bound. A generator with no ceiling fills your BrainDog.`, 'bound');

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
 * A REGISTER BODY'S KEYS, CLOSED, because the answer to a key nothing reads was silence.
 *
 * `validate` deep-checked `fields`, `title`, `state` and `search` and returned `null` for
 * everything else, so a register body was an open bag. Eleven keys the corpus publishes installed
 * without a word and then did nothing. The cost is not the missing feature, because much of this
 * product is honestly unbuilt; the cost is that the declaration was ACCEPTED. A bookkeeping pack
 * ships with a closed-period lock in its register body, the install diff shows the register, and
 * the lock is decoration. `02 §6.1`'s own sentence: *"it is not a missing feature, it is a missing
 * control, and it is the one an auditor asks about first."* It was reproduced against that
 * section's own worked `postings` register: a `posted` row was edited AND deleted, both accepted.
 *
 * SO THE KEYS ARE A LIST, THE LIST IS CLOSED, AND THERE ARE TWO ANSWERS RATHER THAN ONE.
 *
 *   published and read by nothing → `NOT_IN_THIS_BUILD`. The declaration is right and the build is
 *     behind, which is exactly what `metrics.ts` already answers for `group_by`, `median` and
 *     `trend`, and `30 §6` files that code beside `SCHEMA_NEWER` for the reason that fits here too:
 *     **the repair is a deploy, not an edit.** Telling an author that `immutable_when` is malformed
 *     sends them to check a spelling that is right.
 *   published nowhere → `DECLARATION_INVALID`. `feilds:` is a typo and `retry_after:` is an
 *     invention, and for both of those the repair IS an edit.
 *
 * THE LISTS BELOW ARE TESTED AGAINST `42 §4.4`, NOT REMEMBERED. A hand-typed list of keys goes
 * stale the day the documents add one, which is the failure this whole check exists to fix, made
 * again by the fix. So `declare.test.ts` parses that section's two tables and fails when a key in
 * either of them is in neither list here, and when a key here is in neither table and is not one of
 * the spellings named below.
 */

/**
 * Read by this build, so there is nothing to say about it.
 *
 * The first line is `42 §4.4`'s, and the second is the divergence between the document and the
 * code, written down rather than left to be rediscovered. A key built after them sits on a line of
 * its own, so two units adding one each never edit the same line:
 *
 *   `id`      the code's spelling of `register:`. `ownId` has admitted both since it was written.
 *   `state`   which field is mirrored onto `entry.state`. `02 §1` settles that `state` IS mirrored
 *             and never says which key names it; this build reads one, and `applyDeclarations`
 *             re-derives the column from it.
 *   `done`    the states that mean finished, which is how a row is drawn ticked.
 *   `finished` a day field the write path fills when a row enters a `done` state and empties when it leaves.
 *   `icon` · `holds`  the rail's glyph and the register's one line, both drawn by `apps/web`.
 *   `seq_prefix`  the letters a row's spoken id starts with, `S` for `S42`; `get` resolves it, and
 *             `validate` refuses one another register already speaks.
 *   `steps`   `{ of, done }`: its rows are steps of the row the `ref` field `of` points at, done when the `bool` field
 *             `done` is true; a card's ring over an empty field draws the share done (`steps.ts`).
 *   `scopes`  on the one register whose rows are projects, the fields listing their repositories
 *             and folders; `resolveProject` places a run by them.
 *   `rates` · `meets`  on the one register holding the rates a money figure converts by, and the one
 *             `meet` writes, each part naming the field that plays it (`roles.ts`, `roleBody` below).
 *   `org`     the one register `meet` writes organisations into, its parts named the same way (batch 17).
 *   `pairs`   `02 §5`'s transfer detection: the write path finds a row's other leg and marks both
 *             (`pairs.ts`). It once sat on the unbuilt list below, refused at install, so his
 *             ledger counted every move between two of his accounts as spend and as income.
 *   `delete`  `refuse_while_referenced`, the one value (`DELETE_RULES`, `referenced.ts`): the write path refuses to
 *             delete a row a live row still points at, naming the lists and how many rows. It once sat on the unbuilt
 *             list below, so an account with transactions deleted and left them pointing at nothing.
 *   `owner_only`  `true`, or left out: a colleague who adds across the whole record does not add here, and a grant
 *             naming the list still does (`guard` in `packages/record/src/index.ts`, `20 §1`). Keys and People are
 *             owner-only by their role, so neither declares it.
 *   `personal`  `true`, or left out: only the owner reads and writes its rows, in his own session or through his own
 *             key. No grant, share, link, child key or "See as" reaches it, even one naming it (`personalStop` in
 *             `packages/record/src/index.ts`, `coverOf` in `lens.ts`). A list playing `profiles` or `carry` declares it.
 *   `hand`    `{ person?, agent?, taken? }`: who holds a row, a person by a `ref` field and an agent by the `text` field
 *             it signs with, and the state a row moves to when an agent takes it (`HAND_PARTS`, `handFault` below).
 *             The app's "Hand to" reads it, and nothing in the kernel names the list that declares it.
 *   `once`    the fields an add-on plants and never patches: its own later write (`WriteContext.pack`) leaves them as
 *             a row holds them, and a person's edit is not narrowed (the write path in `index.ts`).
 *   `kept_by` `automations`, the one value: its rows are written by the record's own automations, never typed one by one,
 *             so the record offers it no page of its own (`emergent.ts` in `packages/record`). It refuses no write.
 *   `table`   the columns the list opens on, in order: a field, or `{ field, or?, label? }` (`tableFault` below). Read by the
 *             app's list table; left out, the app derives them from the title, the card and the state.
 *   `same`    `{ fields, within?, fold, keep? }`: what makes two of its rows the same thing, its text `fields` folded by
 *             `fold` (`text` or `exact`) within one value of `within`, its scope or a link; `keep` is which of two is
 *             kept, `oldest` unless it says `latest` or `sealed` (`sameFault` below, `entities.ts`'s `rowKeys`).
 *
 * `rates` AND `meets` ARE NOT IN `42 §4.4` YET, and `declare.test.ts` lists what the code admits that the document does
 * not publish. They landed in a change that did not include the document or that test.
 *
 * `pack:` IS ON THIS LIST AND IS NOT READ FROM THE BODY, and that is deliberate rather than an
 * oversight: ownership is `declaration.pack_id`, written from the declaration's own `pack` and read
 * back by `ownersTo` and `createFault`. The key is the same fact said twice, so a register carrying
 * it promises nothing this record fails to keep, which is the test for this list rather than
 * whether some line dereferences it.
 */
const REGISTER_KEYS = [
  'register', 'name', 'one', 'pack', 'series', 'fields', 'search', 'title', 'mobile', 'identity',
  'id', 'state', 'done', 'finished', 'icon', 'holds', 'seq_prefix', 'scopes', 'steps', 'rates', 'meets', 'org', 'pairs',
  'order',
  'table',
  'delete',
  'owner_only',
  'personal',
  'hand',
  'once',
  'same',
  'role',
  'fade',
  'restates',
  'kept_by',
] as const;

/**
 * Published by `42 §4.4`, read by nothing, and each one a rule the record would not keep.
 *
 *   `immutable_when`  `02 §6.1`'s closed-period lock and `30 §4`'s step 2 of the write path. The
 *                     string appears once in this tree, in a comment in `rules.ts` describing the
 *                     step that does not exist. `ROW_LOCKED` is registered and emitted by nothing.
 *   `key`             a series' idempotent upsert. `indexName` can spell `entry_k_<reg>` and no
 *                     caller ever asks it to, so re-fetching yesterday duplicates yesterday, which
 *                     is the single failure `02 §5` says `key:` exists to prevent.
 *   `predicates`      named predicates. `where` refuses the `{ predicate: … }` leaf outright, so
 *                     declaring one here installs a name no predicate can reach.
 */
const REGISTER_UNBUILT = ['key', 'predicates', 'immutable_when'] as const;

/**
 * The keys of a field's `repeat:` that `schedule.ts`'s walk reads, its `REPEAT_READ` said again.
 *
 * A COPY AND NOT AN IMPORT, because `GRAMMAR_VALUES` spreads it as this module loads, and `schedule.ts` reaches this
 * module through its own imports: imported, a process that loads `schedule.ts` first reads it before it is set.
 * `repeat-keys.test.ts` holds the two equal.
 */
const REPEAT_READ = ['freq', 'interval', 'count', 'until', 'workday', 'bymonthday', 'byday'] as const;

/**
 * The parts of a list's `hand:`: the `ref` field a person is handed a row by, the `text` field holding the name an
 * agent signs with, and the state a row moves to when an agent takes it.
 *
 * EITHER HOLDER MAY BE LEFT OUT, BUT NOT BOTH. Work's `owner` is a link that goes when the record has no People
 * (`LINKS` in `packages/seed/src/packs/first-party.ts`), and a list that hands only to agents is still handed.
 */
const HAND_PARTS = ['person', 'agent', 'taken'] as const;

/** The parts of `AGENT_ROLES` only a personal list may play: one person's profiles, and what carries between his machines. */
const PERSONAL_ROLES = ['profiles', 'carry'] as const;

/** The most columns a list's `table:` names: the nine fields a list opens on at most when the app derives them. */
const TABLE_MOST = 9;
/** The parts of one column of a list's `table:` written as an object. */
const TABLE_PARTS = ['field', 'or', 'label'] as const;
/** The most characters a column's own heading takes. */
const TABLE_LABEL_MOST = 40;
/** The most fields a column reads in turn where its own holds nothing. */
const TABLE_OR_MOST = 3;

/**
 * Why a list's `table:` would draw a column it cannot fill, or `null` when it can be read.
 *
 * EVERY COLUMN IS A LIVE FIELD OF THE LIST, its `or` too, each named once, because a column over a field the list does
 * not hold is a column of blanks on every row, and nothing would say why.
 */
function tableFault(id: string, fields: readonly { id?: unknown; retired?: unknown }[], table: unknown): Refusal | null {
  const live = fields.filter((f) => f.retired !== true).map((f) => String(f.id));
  const shape = `as [on, { field: payee, or: [counterparty_text, what], label: Payee }, amount]: one to ${TABLE_MOST} of ${id}'s fields, in the order they are drawn`;
  if (!Array.isArray(table) || table.length === 0 || table.length > TABLE_MOST)
    return bad('DECLARATION_INVALID', `${id}'s table names the columns it opens on. Say it ${shape}.`, 'table', live);
  const seen = new Set<string>();
  for (const [i, raw] of table.entries()) {
    const at = `table[${i}]`;
    const column: Record<string, unknown> | null = typeof raw === 'string' ? { field: raw } : isPart(raw) ? raw : null;
    if (column === null || Object.keys(column).some((k) => !(TABLE_PARTS as readonly string[]).includes(k)))
      return bad('DECLARATION_INVALID', `${id}'s ${at} is a field, or { field, or?, label? }. Say it ${shape}.`, at, TABLE_PARTS);
    const field = column.field;
    if (typeof field !== 'string' || !live.includes(field))
      return bad('FIELD_UNKNOWN', `${id}'s ${at} draws ${JSON.stringify(field ?? null)}, and ${id} has no such field to draw.`, at, live);
    /* `or` IS ONE FIELD OR UP TO THREE IN TURN, each read where every one before it holds nothing. */
    const ors = column.or === undefined ? [] : Array.isArray(column.or) ? column.or : [column.or];
    if (column.or !== undefined && (ors.length === 0 || ors.length > TABLE_OR_MOST))
      return bad('DECLARATION_INVALID', `${id}'s ${at} reads one field, or up to ${TABLE_OR_MOST} in turn, where ${field} holds nothing.`, `${at}.or`, live);
    for (const name of ors) {
      if (typeof name !== 'string' || !live.includes(name))
        return bad('FIELD_UNKNOWN', `${id}'s ${at} draws ${JSON.stringify(name ?? null)} where ${field} holds nothing, and ${id} has no such field to draw.`, `${at}.or`, live);
      if (name === field || ors.indexOf(name) !== ors.lastIndexOf(name))
        return bad('DECLARATION_INVALID', `${id}'s ${at} reads ${name} twice in turn. Name each field once, and not ${field} itself.`, `${at}.or`, live);
    }
    if (seen.has(field)) return bad('DECLARATION_INVALID', `${id}'s table draws ${field} twice.`, at, live);
    seen.add(field);
    const label = column.label;
    if (label !== undefined && (typeof label !== 'string' || label.trim() === '' || label.length > TABLE_LABEL_MOST))
      return bad('DECLARATION_INVALID', `${id}'s ${at} is headed by words of 1 to ${TABLE_LABEL_MOST} characters. ${JSON.stringify(label)} is not.`, `${at}.label`);
  }
  return null;
}

/** The parts of a list's `same:`, the two ways it compares a text (`identity-keys.ts`'s `sameFold`), and which row stays. */
const SAME_PARTS = ['fields', 'within', 'fold', 'keep'] as const;
const SAME_FOLDS = ['text', 'exact'] as const;
const SAME_KEEPS = ['oldest', 'latest', 'sealed'] as const;
/** The list keys that already say when two rows are one: people and organisations by their keys, projects by places. */
const KEEPS_OWN_KEYS = ['meets', 'org', 'scopes'] as const;

/**
 * Why a list's `same:` would key its rows by what they cannot hold, or `null` when it can be read.
 *
 * EVERY PART IS CHECKED HERE, AT INSTALL, because a key built from a field a row does not have is no key at all: every
 * row would answer to nothing, and the duplicates it was declared against would stay. `within` is where two rows must
 * both be to be one, so it is the list's scope or a link, never a text. `sealed` keeps the row holding a sealed value,
 * so a list with nothing to seal a value in cannot ask for it.
 */
function sameFault(id: string, body: Readonly<Record<string, unknown>>, fields: readonly (FieldLike & { scope?: unknown })[], same: unknown): Refusal | null {
  const shape = 'as { fields: [name], within: project, fold: text }: the text fields two rows share, where, and how they are compared';
  if (!isPart(same) || Object.keys(same).some((k) => !(SAME_PARTS as readonly string[]).includes(k)))
    return bad('DECLARATION_INVALID', `${id} says what makes two of its rows the same. Say it ${shape}.`, 'same', SAME_PARTS);
  const role = KEEPS_OWN_KEYS.find((k) => body[k] !== undefined);
  if (role !== undefined)
    return bad('DECLARATION_INVALID', `${id} declares ${role}:, which already says when two of its rows are one, so same: would be read by nothing. Take it out.`, 'same');
  const live = fields.filter((f) => f.retired !== true);
  const texts = live.filter((f) => f.type === 'text' && !isDerived(f as { derive?: unknown; derived?: unknown })).map((f) => f.id);
  const named = same.fields;
  if (!Array.isArray(named) || named.length === 0 || named.some((n) => typeof n !== 'string'))
    return bad('DECLARATION_INVALID', `${id}'s same names the fields two rows share as a list of its text fields, such as [name].`, 'same.fields', texts);
  for (const [i, name] of (named as string[]).entries()) {
    const field = fields.find((f) => f.id === name);
    if (field === undefined) return bad('FIELD_UNKNOWN', `${id}'s same names ${name}, and ${id} has no such field.`, `same.fields[${i}]`, texts);
    if (field.retired === true)
      return bad('DECLARATION_INVALID', `${id}'s same names ${name}, which is retired, so no row writes it. Name a live text field.`, `same.fields[${i}]`, texts);
    if (field.type !== 'text')
      return bad('DECLARATION_INVALID', `${id}'s same names ${name}, which is a ${field.type}, and two rows are the same by their text fields.`, `same.fields[${i}]`, texts);
    /* A FIELD WORKED OUT AT READ HAS NO STORED VALUE, and the key two rows are compared by is built from what is stored. */
    if (isDerived(field as { derive?: unknown; derived?: unknown }))
      return bad('DECLARATION_INVALID', `${id}'s same names ${name}, which is worked out at read and never stored, so two rows cannot be compared by it.`, `same.fields[${i}]`, texts);
    if ((named as string[]).indexOf(name) !== i)
      return bad('DECLARATION_INVALID', `${id}'s same names ${name} twice. Name each field once.`, `same.fields[${i}]`, texts);
  }
  const wheres = live.filter((f) => f.scope !== undefined || f.type === 'ref').map((f) => f.id);
  if (same.within !== undefined && (typeof same.within !== 'string' || !wheres.includes(same.within)))
    return bad(
      'DECLARATION_INVALID',
      `${id}'s same is within ${JSON.stringify(same.within)}, and that is ${id}'s scope or one of its links, such as project, or left out.`,
      'same.within',
      wheres,
    );
  if (!(SAME_FOLDS as readonly unknown[]).includes(same.fold))
    return bad('ENUM_VALUE_UNKNOWN', `${id}'s same compares by text or exact, and ${JSON.stringify(same.fold ?? null)} is neither.`, 'same.fold', SAME_FOLDS);
  if (same.keep !== undefined && !(SAME_KEEPS as readonly unknown[]).includes(same.keep))
    return bad(
      'ENUM_VALUE_UNKNOWN',
      `${id}'s same keeps the oldest, the latest or the sealed one of two rows, and ${JSON.stringify(same.keep)} is none of them.`,
      'same.keep',
      SAME_KEEPS,
    );
  if (same.keep === 'sealed' && !live.some((f) => sealedAs(f) !== null))
    return bad('DECLARATION_INVALID', `${id}'s same keeps the sealed one of two rows, and ${id} has no secret or file field to seal a value in.`, 'same.keep', ['oldest', 'latest']);
  return null;
}

/** Why a list's `once:` names what an add-on cannot plant, or `null` when it is a list of this list's own written fields. */
function onceFault(id: string, fields: readonly (FieldLike & { derived?: boolean; derive?: unknown })[], once: unknown): Refusal | null {
  const mine = fields.filter((f) => !isDerived(f)).map((f) => f.id);
  if (!Array.isArray(once) || once.some((o) => typeof o !== 'string'))
    return bad('DECLARATION_INVALID', `${id}'s once is a list of its own field ids, such as [name]: the fields a plugin plants and never changes after.`, 'once', mine);
  const at = (once as string[]).findIndex((o) => !mine.includes(o));
  if (at < 0) return null;
  const named = (once as string[])[at]!;
  return bad(
    'DECLARATION_INVALID',
    fields.some((f) => f.id === named)
      ? `${id}'s once names ${named}, which BrainDog works out itself, so no plugin writes it. Take it out of once.`
      : `${id}'s once names ${named}, and ${id} has no such field.`,
    `once[${at}]`,
    mine,
  );
}

/** Why a list's `hand:` would write what its fields cannot hold, or `null` when every part it names is there. */
function handFault(id: string, fields: readonly FieldLike[], state: unknown, hand: unknown): Refusal | null {
  const said = hand !== null && typeof hand === 'object' && !Array.isArray(hand) ? (hand as Record<string, unknown>) : null;
  const shape = `as { person: owner, agent: agent, taken: doing }, a link to a person, a text field and one of its states`;
  if (said === null || Object.keys(said).some((k) => !(HAND_PARTS as readonly string[]).includes(k)) || (said.person === undefined && said.agent === undefined))
    return bad('DECLARATION_INVALID', `${id} says who holds its rows. Say it ${shape}.`, 'hand', HAND_PARTS);
  const field = (part: string) => fields.find((f) => f.id === said[part]);
  if (said.person !== undefined && field('person')?.type !== 'ref')
    return bad(
      'DECLARATION_INVALID',
      `${id} hands a row to a person by ${JSON.stringify(said.person)}, and that is a link field of ${id} to the person, such as owner.`,
      'hand.person',
      fields.filter((f) => f.type === 'ref').map((f) => f.id),
    );
  if (said.agent !== undefined && field('agent')?.type !== 'text')
    return bad(
      'DECLARATION_INVALID',
      `${id} hands a row to an agent by ${JSON.stringify(said.agent)}, and that is a text field of ${id} holding the name the agent signs with.`,
      'hand.agent',
      fields.filter((f) => f.type === 'text').map((f) => f.id),
    );
  if (said.taken !== undefined) {
    /* A STATE THE LIST HAS, named by its value, so the row an agent takes shows as taken the way any other row does. */
    const declared = fields.find((f) => f.id === state)?.values;
    const values = Array.isArray(declared)
      ? (declared as unknown[]).map((v) => (typeof v === 'string' ? v : v !== null && typeof v === 'object' ? String((v as { id?: unknown }).id) : ''))
      : [];
    if (typeof said.taken !== 'string' || !values.includes(said.taken))
      return bad(
        'DECLARATION_INVALID',
        `${id} moves a row an agent takes to ${JSON.stringify(said.taken)}, and that is one of the states ${id} declares.`,
        'hand.taken',
        values,
      );
  }
  return null;
}

/**
 * The prefixes the kernel speaks. Governance numbers its decisions `D41` and its suggestions `SG23`,
 * and the session register's rows are `S42`. Each maps to what uses it, for the refusal's sentence.
 */
const KERNEL_PREFIXES: ReadonlyMap<string, string> = new Map([
  ['D', 'decisions'],
  ['SG', 'suggestions'],
  ['S', 'register.session'],
  ['IN', 'register.instructions'],
]);

/** `34 §4`'s grammar for a prefix other than `#`. */
const SEQ_PREFIX = /^[A-Z][A-Z0-9]{0,3}$/;

/**
 * Whether one spoken id could belong to both prefixes. Equal ones can, and so can `P` and `P2`,
 * because `P21` reads as either. `S` and `SG` cannot: `SG12` is never `S` and a number.
 */
function overlaps(a: string, b: string): boolean {
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return long.startsWith(short) && /^(?:[1-9][0-9]*)?$/.test(long.slice(short.length));
}

/**
 * Who already speaks a prefix this register's ids would collide with, or `null`.
 *
 * `installed` holds the record's active declarations with the batch laid over them, so a second
 * register in the same pack is found the same way as one already in the record.
 */
function prefixHolder(self: string, prefix: string, installed?: Known): { who: string; theirs: string } | null {
  for (const [theirs, who] of KERNEL_PREFIXES) if (who !== self && overlaps(theirs, prefix)) return { who, theirs };
  for (const [other, body] of installed ?? []) {
    const theirs = body.seq_prefix;
    if (other === self || !other.startsWith('register.') || typeof theirs !== 'string' || theirs === '#') continue;
    if (overlaps(theirs, prefix)) return { who: other, theirs };
  }
  return null;
}

/**
 * A field's keys, same two lists and same two questions.
 *
 * The divergences again, because they are the reason this could not be copied out of the document:
 *
 *   `to`        the code's spelling of a `ref`'s target. `coerce` reads `field.to` and the document
 *               writes `register:`, which is why `register:` is on the unbuilt list below: a `ref`
 *               declared the documented way resolves a spoken id against the WRONG register, and
 *               `coerce`'s own comment records that being found once already.
 *   `label`     the word a person reads, which the query grammar prints a `where:` back with.
 *   `search`    the FTS projection's flag. `fts.ts` reads `f.search`; the register-level `search:`
 *               list is checked here and drives nothing, which is a separate finding and not this
 *               one's to fix.
 *   `deadline` · `qualifies` · `unit`  which day a row is about, which field makes an amount
 *               readable, and how a `duration` is said. All three are drawn.
 *   `derived`   the kernel's own flag, which refuses a write and skips validation when it is set,
 *               and which `index.ts` sets on every field declaring `derive`. It rules out three
 *               keys that would ask a caller for the value: `default`, `required` and
 *               `required_when`, each refused by name in `fieldRules`, because the write path the
 *               three of them speak to never runs.
 *   `derive`    `02 §5`'s seven shapes, worked out at read and never stored (`derive.ts`). Its rule is
 *               `deriveFault`, asked in `fieldRules` with the linked list's fields for a `via`; the
 *               read path fills it through `derive-rows.ts`, and `where` refuses to filter or sort
 *               on it. The `unique: true` + `derive: { normalise }` fingerprint is not built: it
 *               needs a stored value, and `deriveFault` refuses `unique` beside `derive`.
 *   `hidden_from_agents`  the field's own bookkeeping (a mark, a hue, a draft flag): the short `get` and `list` answers an
 *               agent reads leave it out, while `format: full` and the app still carry it.
 *   `scope`     where a row applies; the write path holds a token to it, and `inScope` reads by it.
 *   `min` · `max`  bounds, in UTF-8 bytes on text and documents and by value on numbers.
 *   `required_when`  `{ field, is }`: required while another field of the row holds that value.
 *   `by`        `decide`: once the row is made, only an accepted proposal changes the field.
 *   `currency_from` · `currency_fixed`  a money field's code: taken from the account a link names when an amount
 *               comes without one, and never changed once a row holds it (`currencyKeysFault`).
 *   `when`      `{ holds: [people] }`: a field there only while the record holds those lists (`holdsFault`). The plan
 *               takes it out, so a stored field never says it.
 *   `parts_of`  a `json` field of parts, each a patch over its row, adding up to the money field it names
 *               (`partsKeysFault`, `row-parts.ts`): one payment over three categories.
 */
const FIELD_KEYS = [
  'id', 'type', 'of', 'values', 'required', 'index', 'unique', 'immutable', 'default', 'retired',
  'redact', 'transitions', 'remind', 'repeat', 'scope', 'min', 'max', 'required_when', 'by',
  'to', 'label', 'search', 'deadline', 'qualifies', 'unit', 'derived', 'derive', 'labels', 'currency_from', 'currency_fixed', 'when',
  'hidden_from_agents', 'parts_of',
] as const;

/**
 * Published on a field, read by nothing.
 *
 *   `register`       the documented spelling of `to:`, above.
 *   `note`           a field's own comment, carried nowhere.
 */
const FIELD_UNBUILT = ['register', 'note'] as const;

/** How long a value's label may be, in UTF-8 bytes: a word or two in a column, never a sentence. */
const VALUE_LABEL_BYTES = 64;

/**
 * What is wrong with an enum field's `labels:`, or null.
 *
 * A label is text, names a declared value, and does not read as any OTHER value or its label once
 * case and underscores are folded, because the query grammar accepts all three spellings and one word
 * must mean one value.
 */
function labelsFault(id: string, f: FieldLike, labels: unknown): Refusal | null {
  /* A `list<enum>` IS AN ENUM HERE FOR THE SAME REASON IT IS ONE WHERE `values` IS ENFORCED. This
     opened on `f.type !== 'enum'`, and once the `values` check learned to read through `of` the two
     halves of one field contradicted each other: the declaration was told its values were real and
     its labels were not. The labels are drawn from the same list by the same readers, so they are
     admitted by the same test. The membership loop below needs no change, because it reads `f.values`
     and never `f.type`: the values sit on the field whichever way the field reaches them. */
  if (f.type !== 'enum' && !(f.type === 'list' && f.of === 'enum'))
    return bad('DECLARATION_INVALID', `${id}.${f.id} is a ${f.type}, and labels: names the values of an enum.`, f.id);
  if (labels === null || typeof labels !== 'object' || Array.isArray(labels))
    return bad('DECLARATION_INVALID', `${id}.${f.id}'s labels are each value and the words a person reads for it, like { owed_to_me: Money in }.`, f.id);
  const values = Array.isArray(f.values) ? f.values.filter((v): v is string => typeof v === 'string') : [];
  const fold = (s: string) => s.replace(/_/g, ' ').trim().toLowerCase();
  const said = new Map<string, string>();
  for (const v of values) said.set(fold(v), v);
  for (const [value, label] of Object.entries(labels as Record<string, unknown>)) {
    if (!values.includes(value))
      return bad('ENUM_VALUE_UNKNOWN', `${id}.${f.id} labels ${value}, which is not one of its values: ${values.join(', ')}.`, f.id, [...values]);
    if (typeof label !== 'string' || label.trim() === '' || new TextEncoder().encode(label).length > VALUE_LABEL_BYTES)
      return bad('DECLARATION_INVALID', `${id}.${f.id}'s label for ${value} is a word or two of text, at most ${VALUE_LABEL_BYTES} bytes.`, f.id);
    const taken = said.get(fold(label));
    if (taken !== undefined && taken !== value)
      return bad('DECLARATION_INVALID', `${id}.${f.id}'s label for ${value} reads as ${taken}, so a filter saying it could mean either.`, f.id);
    said.set(fold(label), value);
  }
  return null;
}

/**
 * A transition's: where it goes, the fields a move out needs filled, and `by: decide` for a move
 * only an accepted proposal makes. The write path reads all three.
 */
const TRANSITION_KEYS = ['to', 'requires', 'by'] as const;
const TRANSITION_UNBUILT = [] as const;

/* ── the field rules the write path keeps: bounds, conditions, and who changes what ── */

/** What `min:` and `max:` bound in this build, and the ceilings a `max:` may lower and never raise. */
const BY_BYTES = ['text', 'document'];
const BY_VALUE = ['int', 'decimal', 'duration', 'money', 'quantity'];
const WHOLE = ['text', 'document', 'int', 'duration', 'money'];
const CEILING: Readonly<Record<string, number>> = { text: 16_384, document: 524_288 };
/** Given a size by `02 §5` and bounded by nothing here yet. */
const SIZED_UNBUILT = ['url', 'email', 'json', 'list'];

/**
 * `required_when:`'s operators. This build reads `is`; the rest of `02 §5`'s list is published and
 * unread, and the operators that search rather than compare are refused by the list's own code.
 */
const WHEN_READ = ['field', 'is'];
const WHEN_UNBUILT = ['not', 'in', 'not_in', 'gt', 'gte', 'lt', 'lte', 'before', 'after', 'between', 'empty', 'present', 'has', 'lacks'];
const WHEN_REFUSED = ['contains', 'matches', 'near', 'starts', 'ends', 'via'];
/** A condition compares one stored value, so the field it reads holds one. */
const WHEN_TYPES = ['text', 'enum', 'bool', 'int'];

/** Who changes a field or makes a move. `decide` is an accepted proposal, and the one word read. */
const BY = ['decide'];

/**
 * `currency_from` and `currency_fixed`, each on a money field only, and `currency_from` naming a link of this list and a
 * money field of the list that link points at. The target is checked where the batch or the record holds that list, as
 * `currencyOfFault` checks a pattern's; a list pointing at itself is checked against its own fields.
 *
 * ONE SENTENCE FOR EACH WAY TO BE WRONG, because each sends the author somewhere else: the field's type, the link, or
 * the field on the other list. Installed wrong, an amount sent with no code is refused on every write and nobody is
 * told the declaration is why.
 */
/**
 * `parts_of`, on a `json` field only, naming a money field of the same list, and on one field of a list at most: a row
 * is split one way, and its figures read it by those parts (`row-parts.ts`).
 */
function partsKeysFault(id: string, fields: readonly Record<string, unknown>[]): Refusal | null {
  const marked = fields.filter((f) => f.parts_of !== undefined);
  for (const f of marked) {
    const at = `${String(f.id)}.parts_of`;
    if (f.type !== 'json') return bad('DECLARATION_INVALID', `${id}.${String(f.id)} is a ${String(f.type)}, and parts_of is for a json field of parts.`, at);
    const of = fields.find((g) => g.id === f.parts_of);
    if (typeof f.parts_of !== 'string' || of === undefined || of.type !== 'money')
      return bad('DECLARATION_INVALID', `${id}.${String(f.id)}: parts_of names a money field of ${id}, the amount its parts add up to.`, at);
  }
  if (marked.length > 1) return bad('DECLARATION_INVALID', `${id} splits its rows one way: give parts_of to one field.`, `${String(marked[1]!.id)}.parts_of`);
  return null;
}

function currencyKeysFault(id: string, fields: readonly Record<string, unknown>[], installed?: Known): Refusal | null {
  const a = (type: unknown): string => `${/^[aeiou]/u.test(String(type)) ? 'an' : 'a'} ${String(type)}`;
  for (const f of fields) {
    const said = `${id}.${String(f.id)}`;
    const from = f.currency_from;
    const fixed = f.currency_fixed;
    if (from === undefined && fixed === undefined) continue;
    const key = from !== undefined ? 'currency_from' : 'currency_fixed';
    if (f.type !== 'money')
      return bad('DECLARATION_INVALID', `${said} is ${a(f.type)}, and ${key} is for a money field.`, `${String(f.id)}.${key}`);
    if (fixed !== undefined && fixed !== true)
      return bad('DECLARATION_INVALID', `${said}: currency_fixed is true or left out.`, `${String(f.id)}.currency_fixed`);
    if (from === undefined) continue;
    const at = `${String(f.id)}.currency_from`;
    const parts = typeof from === 'string' ? from.split('.') : [];
    if (parts.length !== 2 || !parts.every((p) => IDENT.test(p)))
      return bad('DECLARATION_INVALID', `${said}: currency_from names a link of ${id} and a money field of the list it points at, like account.balance.`, at);
    const [linkId, targetId] = parts as [string, string];
    const link = fields.find((g) => g.id === linkId);
    if (link === undefined || link.type !== 'ref' || typeof link.to !== 'string')
      return bad(
        'DECLARATION_INVALID',
        `${said} takes its currency from ${linkId}, and ${link === undefined ? `${id} has no field called ${linkId}` : `${linkId} is ${a(link.type)}, not a link to one entry`}.`,
        at,
      );
    const theirs = link.to === id ? fields : listFields(installed, link.to);
    if (theirs === null) continue;
    const target = theirs.find((g) => g.id === targetId);
    if (target === undefined || target.type !== 'money')
      return bad(
        'DECLARATION_INVALID',
        `${said} takes its currency from ${targetId} of ${link.to}, and ${target === undefined ? `${link.to} has no such field` : `${targetId} is ${a(target.type)}, which holds no currency`}.`,
        at,
      );
  }
  return null;
}

/**
 * A band into an enum gives each of the enum's values once: one edge fewer than its values, and the last value its
 * `else`. `deriveFault` already refuses a band word the enum has not got; this is the other half, a value no band
 * gives, which would install and never be read, or an edge past the last value that sorts into nothing new.
 */
function bandEdgesFault(f: Record<string, unknown>): Refusal | null {
  const got = shapeOf(f.derive);
  if (got?.shape !== 'band' || f.type !== 'enum' || !Array.isArray(f.values)) return null;
  const body = got.body as { steps: readonly { is?: unknown }[]; else?: unknown };
  const id = String(f.id);
  const n = f.values.length;
  if (body.steps.length !== n - 1 || body.else === undefined) {
    const has = `${body.steps.length} ${body.steps.length === 1 ? 'edge' : 'edges'}${body.else === undefined ? ' and no else' : ''}`;
    return bad(
      'DECLARATION_INVALID',
      `${id} sorts into its ${n} values, so its band has ${n - 1} ${n - 1 === 1 ? 'edge' : 'edges'}, one fewer than its values, and an else for the last; it has ${has}.`,
      `${id}.derive.band.steps`,
    );
  }
  /* THE RIGHT COUNT CAN STILL GIVE ONE VALUE TWICE AND ANOTHER NEVER, and the one never given installs and is never read. */
  const given = [...body.steps.map((s) => s.is), body.else];
  const missed = (f.values as unknown[]).find((v) => !given.includes(v));
  if (missed === undefined) return null;
  return bad('DECLARATION_INVALID', `${id}'s band never gives ${String(missed)}; give each of its values once, the last as its else.`, `${id}.derive.band.steps`);
}

/**
 * The rules on each field that the write path keeps, checked once every field is known, because a
 * condition and a move's `requires` name other fields of the register.
 *
 * A `secret` field is the keychain door's alone (`index.ts`'s `depositGrant`), so everything that would
 * put a value in it from anywhere else is refused here: `required` and `required_when`, which no
 * create could meet, and a `default`, which is a value no door wrote. It is never searched and never
 * a row's title, because it holds where a key is sealed and says nothing about the row.
 */
function fieldRules(id: string, fields: readonly Record<string, unknown>[], title: unknown, installed?: Known): Refusal | null {
  const byId = new Map(fields.map((f) => [String(f.id), f]));
  for (const f of fields) {
    const at = String(f.id);
    const said = `${id}.${at}`;
    const type = String(f.type);

    /* A FIELD DECLARING `derive` IS WORKED OUT AT READ, and `deriveFault` is its whole rule: the shape, the keys that
       cannot sit beside it, its sources and its type. A `via` is checked against the fields of the list its link
       points at, this list's own when it links to itself, and the batch's or the record's when they hold it; a list
       neither holds leaves the far field to the read, which derives null for a field that is not there. */
    if (f.derive !== undefined) {
      const link = shapeOf(f.derive)?.shape === 'via' ? fields.find((g) => g.id === sourcesOf(f.derive)[0]) : undefined;
      const theirs = link !== undefined && typeof link.to === 'string' ? (link.to === id ? fields : (listFields(installed, link.to) ?? undefined)) : undefined;
      const d = deriveFault(f as DeriveField, fields as DeriveField[], theirs as DeriveField[] | undefined);
      if (d) return d;
      const edges = bandEdgesFault(f);
      if (edges) return edges;
    }

    /* A DERIVED FIELD CANNOT ALSO BE ASKED FOR, and this is the same shape as `derived` beside a
       `default`, which this file already refuses: two instructions, one of which does nothing.

       IT IS DEAD RATHER THAN FATAL, WHICH IS WHY IT SURVIVED. `index.ts:2156` opens the required
       sweep with `if (f.retired || f.derived) continue;`, so a derived field marked required is
       skipped and every create installs and succeeds. Nothing refuses, nothing warns, and the key
       sits in the declaration reading like a rule the record keeps. The author wrote it because
       they believed the field had to be present, and the record will never tell them otherwise.

       SAME SENTENCE SHAPE AS `secret` BELOW, because it is the same fact about who writes the
       value: a create cannot supply it, so requiring it of a create says nothing. `required_when`
       is named alongside `required` for the reason it is named alongside it there, that the sweep
       which skips one skips the other, and a key that is conditionally dead is still dead. */
    if (f.derived === true && (f.required === true || f.required_when !== undefined))
      return bad(
        'DECLARATION_INVALID',
        `${said} is derived and ${f.required === true ? 'required' : 'required_when'}. BrainDog works out a derived field and refuses every write to it, so no create could supply it and the requirement is never read. Drop the requirement, or drop derived.`,
        at,
      );

    for (const key of ['min', 'max'] as const) {
      const n = f[key];
      if (n === undefined) continue;
      if (SIZED_UNBUILT.includes(type))
        return bad(
          'NOT_IN_THIS_BUILD',
          `${said} declares ${key} on a ${type}, which the documents publish and this build bounds nowhere, so it would install and be kept by nothing. The repair is a deploy, not an edit.`,
          at,
        );
      if (!BY_BYTES.includes(type) && !BY_VALUE.includes(type))
        return bad('DECLARATION_INVALID', `${said} is a ${type}, which has no length or value to bound. min and max are for text, documents and numbers.`, at);
      if (typeof n !== 'number' || !Number.isFinite(n) || (WHOLE.includes(type) && !Number.isInteger(n)) || (BY_BYTES.includes(type) && n < 0))
        return bad(
          'VALUE_MALFORMED',
          `${said}'s ${key} is ${JSON.stringify(n)}, and ${BY_BYTES.includes(type) ? 'a length is a whole number of bytes' : WHOLE.includes(type) ? `a bound on a ${type} is a whole number` : 'a bound is a number'}.`,
          at,
        );
    }
    const lo = f.min as number | undefined;
    const hi = f.max as number | undefined;
    if (lo !== undefined && hi !== undefined && lo > hi)
      return bad('OUT_OF_BOUNDS', `${said} takes at least ${lo} and at most ${hi}, and nothing is both.`, at);
    const ceiling = CEILING[type];
    if (ceiling !== undefined && hi !== undefined && hi > ceiling)
      return bad('OUT_OF_BOUNDS', `${said}'s max is ${hi} bytes, above a ${type}'s ceiling of ${ceiling}. A max lowers the ceiling and never raises it.`, at);
    /* A DEFAULT IS A VALUE THE RECORD WILL STORE, SO THE THING THAT STORES VALUES READS IT.
       `index.ts` runs every default through `coerce` when a row is created, so a `money` field
       defaulted to a bare number refuses every create that leaves it out. That is the net, and it
       catches the value at the wrong moment and tells the wrong person: the author of the
       declaration is the one who can fix it, and they are here. Same `coerce`, so the two moments
       cannot disagree about what the record can store.

       K2 FIRST. JSON null, the empty string and the empty list are one state, absent, and every
       type refuses all three as a value. A default that is absent is no default rather than a bad
       one, so there is nothing here to say about it. */
    if (f.default !== undefined && !isAbsent(f.default as Json)) {
      /* A LIST CARRIES ITS ELEMENT'S TYPE AND NOT ITS OWN. `list<money>` is a `list`, and reading
         `f.type` where the element's kind is wanted is the bug this file keeps finding. */
      const kind = type === 'list' ? String(f.of ?? 'text') : type;
      /* A DERIVED FIELD IS COMPUTED, AND THE WRITE PATH REFUSES EVERY WRITE TO IT. Its default is
         read by nobody: the author wrote two instructions and one of them does nothing. Before the
         value is looked at, because which of the two to delete is the only useful thing to say. */
      if (f.derived === true)
        return bad(
          'DECLARATION_INVALID',
          `${said} is derived and carries a default. BrainDog works out a derived field and refuses every write to it, so nothing ever reads the default. Drop the default, or drop derived.`,
          at,
        );
      /* TWO KINDS INSTALL CANNOT FULLY ANSWER FOR, and neither is waved through. A `secret` default
         is refused outright below, by the rule that only the keychain door writes one, so coercing it
         here would answer with the wrong sentence. A `ref` is coerced with a lookup that says every
         row exists, because whether `people#41` has been written yet is the create path's question
         and refusing it here would refuse a correct declaration; the shape and the declared
         register are answerable at install, and they are answered. */
      if (kind !== 'secret') {
        const held = coerce(f as unknown as FieldDecl, f.default, { refId: () => 'install' });
        if (!held.ok)
          return bad(held.refusal.code, `${said} has a default BrainDog cannot store. ${held.refusal.fix}`, at, held.refusal.allowed);
        /* MEMBERSHIP IS NOT COERCION. `coerce` reads an enum value as text and leaves the list to
           the write path, which is why a default naming a value the field has not got installed
           clean and then went into the row unread: the create path fills a default without ever
           reaching the check that would have caught it. */
        if (kind === 'enum') {
          const values = Array.isArray(f.values) ? (f.values as string[]) : [];
          const chosen = (Array.isArray(held.value) ? held.value : [held.value]).map(String);
          const unknown = chosen.find((v) => !values.includes(v));
          if (unknown !== undefined)
            return bad('ENUM_VALUE_UNKNOWN', `${said} defaults to ${unknown}, and the field has no such value.`, at, values);
        }
      }
    }

    /* A DEFAULT OUTSIDE ITS OWN BOUNDS refuses every create that leaves the field out, which is the
       one fact worth hearing at install rather than at the first write. */
    const size = f.default === undefined || (lo === undefined && hi === undefined) ? null : measure(type, f.default as Json);
    if (size !== null && ((lo !== undefined && size < lo) || (hi !== undefined && size > hi)))
      return bad('OUT_OF_BOUNDS', `${said}'s default measures ${size}, and the field takes ${range(lo, hi)}.`, at);

    const when = f.required_when;
    if (when !== undefined) {
      const where = `${at}.required_when`;
      if (when === null || typeof when !== 'object' || Array.isArray(when))
        return bad('DECLARATION_INVALID', `${said}'s required_when is { field, is }: the field to read, and the value that makes this one required.`, where, WHEN_READ);
      for (const key of Object.keys(when)) {
        if (WHEN_READ.includes(key)) continue;
        if (WHEN_REFUSED.includes(key))
          return bad(
            'REQUIRED_WHEN_OP_UNSUPPORTED',
            `${said}'s required_when uses ${key}, which searches rather than compares. A requirement is one comparison on the row: use is.`,
            where,
            WHEN_READ,
          );
        if (WHEN_UNBUILT.includes(key))
          return bad(
            'NOT_IN_THIS_BUILD',
            `${said}'s required_when uses ${key}, which the documents publish and this build reads nowhere; it reads is. The repair is a deploy, not an edit.`,
            where,
            WHEN_READ,
          );
        return bad('DECLARATION_INVALID', `${said}'s required_when declares ${key}, and there is no such key.`, where, WHEN_READ);
      }
      const { field, is } = when as { field?: unknown; is?: unknown };
      const target = typeof field === 'string' ? byId.get(field) : undefined;
      if (!target)
        return bad('FIELD_UNKNOWN', `${said} is required when ${String(field)} holds a value, and ${id} has no such field.`, where, [...byId.keys()]);
      if (target === f) return bad('DECLARATION_INVALID', `${said} is required when it holds a value itself, which says nothing.`, where);
      if (!WHEN_TYPES.includes(String(target.type)))
        return bad(
          'DECLARATION_INVALID',
          `${said} is required when ${String(field)} holds a value, and ${String(field)} is a ${String(target.type)}. required_when reads a text, an enum, a bool or an int.`,
          where,
          WHEN_TYPES,
        );
      if (is === undefined || is === null)
        return bad('DECLARATION_INVALID', `${said}'s required_when names ${String(field)} and no value for it to hold.`, where, WHEN_READ);
      const held = coerce(target as FieldDecl, is, {}, where);
      if (!held.ok) return held.refusal;
      const values = Array.isArray(target.values) ? (target.values as string[]) : [];
      if (target.type === 'enum' && !values.includes(String(held.value)))
        return bad('ENUM_VALUE_UNKNOWN', `${said} is required when ${String(field)} is ${String(is)}, and ${String(field)} has no such value.`, where, values);
    }

    if (f.by !== undefined && !BY.includes(String(f.by)))
      return bad('ENUM_VALUE_UNKNOWN', `${said} changes by ${JSON.stringify(f.by)}, and the one word is decide: an accepted proposal.`, at, BY);

    const moves = f.transitions;
    if (moves !== null && typeof moves === 'object')
      for (const [from, move] of Object.entries(moves as Record<string, { requires?: unknown; by?: unknown }>)) {
        const where = `${at}.transitions.${from}`;
        if (move.by !== undefined && !BY.includes(String(move.by)))
          return bad('ENUM_VALUE_UNKNOWN', `${said}: the move out of ${from} is made by ${JSON.stringify(move.by)}, and the one word is decide: an accepted proposal.`, where, BY);
        const needs = move.requires;
        if (needs === undefined) continue;
        if (!Array.isArray(needs) || needs.length === 0 || needs.some((n) => typeof n !== 'string'))
          return bad('DECLARATION_INVALID', `${said}: the move out of ${from} requires a list of field names, and this is not.`, where);
        const missing = (needs as string[]).find((n) => !byId.has(n));
        if (missing !== undefined)
          return bad('FIELD_UNKNOWN', `${said}: the move out of ${from} requires ${missing}, and ${id} has no such field.`, where, [...byId.keys()]);
      }

    const sealed = type === 'secret' || (type === 'list' && f.of === 'secret');
    if (!sealed) continue;
    if (type === 'list')
      return bad('DECLARATION_INVALID', `${said} is a list of secrets, and the keychain seals one key into one field. Declare a secret field for each key.`, at);
    if (f.required === true || f.required_when !== undefined)
      return bad('DECLARATION_INVALID', `${said} is a secret, which only the keychain door writes, so no create could supply it. Leave it optional.`, at);
    if (f.default !== undefined)
      return bad('DECLARATION_INVALID', `${said} is a secret, which only the keychain door writes, and a default would be a value no door wrote.`, at);
    if (f.search === true)
      return bad('SEARCH_FIELD_TYPE', `${said} is a secret, and search reads what a row says, never where its key is sealed.`, at, [...SEARCHABLE, 'list<text>']);
    if (title === f.id)
      return bad('DECLARATION_INVALID', `${id} names ${at} as its title, and a secret says where a key is sealed, not what the row is called.`, 'title');
  }
  return null;
}

/** `scope:`'s keys and their closed values (`42 §4.4`). */
const SCOPE_KEYS = ['widen', 'same', 'links'];
const WIDEN = ['any', 'person'];
const SAME = ['both', 'nearer'];

/**
 * A field's `scope:`: a `ref` to one project, or a list of them, pointing at the register whose rows
 * are projects.
 *
 * `widen` and `same` are about a row in one project and `links` is about a list of them, so each is
 * refused on the other shape rather than installed and kept by nothing. The target is checked only
 * when the caller says what is installed, as every check about two declarations is.
 */
function scopeBody(id: string, f: FieldLike, to: unknown, scope: unknown, installed?: Known): Refusal | null {
  const said = `${id}.${f.id}`;
  const at = `${f.id}.scope`;
  if (scope === null || typeof scope !== 'object' || Array.isArray(scope))
    return bad('DECLARATION_INVALID', `${said}'s scope is a body of widen, same and links, and this is not.`, at, SCOPE_KEYS);
  for (const key of Object.keys(scope))
    if (!SCOPE_KEYS.includes(key))
      return bad('DECLARATION_INVALID', `${said}'s scope declares ${key}, and there is no such key.`, at, SCOPE_KEYS);
  const { widen, same, links } = scope as Record<string, unknown>;
  if (widen !== undefined && !WIDEN.includes(String(widen)))
    return bad('ENUM_VALUE_UNKNOWN', `${said}: widen is any or person, and ${JSON.stringify(widen)} is neither.`, at, WIDEN);
  if (same !== undefined && !SAME.includes(String(same)))
    return bad('ENUM_VALUE_UNKNOWN', `${said}: same is both or nearer, and ${JSON.stringify(same)} is neither.`, at, SAME);
  if (links !== undefined && links !== true) return bad('DECLARATION_INVALID', `${said}: links is true or left out.`, at);

  const many = f.type === 'list' && f.of === 'ref';
  if (f.type !== 'ref' && !many)
    return bad('DECLARATION_INVALID', `${said} is a ${f.type}, and only a ref to a project, or a list of them, says where a row applies.`, at);
  if (many && (widen !== undefined || same !== undefined))
    return bad('DECLARATION_INVALID', `${said} is a list of projects, which takes links. widen and same are for a ref to one project.`, at);
  if (!many && links !== undefined)
    return bad('DECLARATION_INVALID', `${said} is a ref to one project, and links is for a list of them.`, at);
  if (typeof to !== 'string') return bad('DECLARATION_INVALID', `${said} names no register with to:, so it points at no project.`, at);

  if (!installed) return null;
  const home = [...installed].find(([other, body]) => other.startsWith('register.') && body.scopes !== undefined)?.[0];
  if (home === `register.${to}`) return null;
  return bad(
    'DECLARATION_INVALID',
    home
      ? `${said} points at ${to}, and the projects are the rows of ${home}, the register that declares scopes:.`
      : `${said} points at ${to}, and no register declares scopes:, so nothing says what a project is.`,
    at,
  );
}

/**
 * A register's `scopes:`, which makes its rows the projects.
 *
 * Each key names a `list` of `text` on this register. A series is refused, because its rows have no
 * spoken id for a run to carry, and so is a second register declaring it: two registers of projects
 * would give one folder two answers.
 */
function scopesBody(decl: Declaration, fields: readonly FieldLike[], scopes: unknown, installed?: Known): Refusal | null {
  const keys = ['repos', 'folders'];
  if (scopes === null || typeof scopes !== 'object' || Array.isArray(scopes) || Object.keys(scopes).length === 0)
    return bad(
      'DECLARATION_INVALID',
      `${decl.id}'s scopes names the fields listing a project's repositories and folders, as { repos, folders }, and this is not.`,
      'scopes',
      keys,
    );
  for (const [key, name] of Object.entries(scopes)) {
    if (!keys.includes(key)) return bad('DECLARATION_INVALID', `${decl.id}'s scopes declares ${key}, and there is no such key.`, 'scopes', keys);
    const held = fields.find((f) => f.id === name);
    if (!held)
      return bad('FIELD_UNKNOWN', `${decl.id}'s scopes names ${String(name)} for its ${key}, and there is no such field.`, 'scopes', fields.map((f) => f.id));
    if (held.type !== 'list' || held.of !== 'text')
      return bad('DECLARATION_INVALID', `${decl.id}.${held.id} lists a project's ${key}, so it is a list of text.`, held.id);
  }
  if (decl.body.series === true)
    return bad('DECLARATION_INVALID', `${decl.id} is a series, and a project needs a spoken id that a run can carry.`, 'scopes');
  for (const [other, body] of installed ?? [])
    if (other !== decl.id && other.startsWith('register.') && body.scopes !== undefined)
      return bad('DECLARATION_INVALID', `${other} already declares scopes:, and one register holds the projects.`, 'scopes');
  return null;
}

/**
 * A register's `rates:` or `meets:`, which makes it the list the kernel reads that role from (`roles.ts`).
 *
 * CHECKED AT INSTALL, NOT AT THE FIRST CALL. Before the keys, a `people` list missing a field `meet` writes installed
 * clean and the refusal reached the first agent that met somebody, weeks later and to nobody who could fix it. So every
 * part is named, each names a field of this list of a type that plays it, `merged_into` points at this list, and
 * `projects` at the list declaring `scopes:`, all before anything is written. The type refusal is `at` the field, as
 * `scopesBody`'s is, and says which part it was named for.
 *
 * ONE LIST HOLDS EACH ROLE, as one holds the projects: two rates lists give one pair two answers on one day, and two
 * people lists make one email two people. AND THE NAMED LIST COUNTS, while it is shaped like the role and declares no
 * key: otherwise a pack declaring `rates:` beside an older money pack's `fx` would move every figure onto the new list
 * and leave yesterday's rates unread, and the conversions that worked yesterday would say a pair was missing today. By
 * shape and not by name alone, because a list called `fx` of sound effects is not anybody's rates and must block
 * nothing (driven in `test/roles.test.ts`). The fix names the pack that owns the named list when the record knows it,
 * read from the record, so this file names no pack.
 */
function roleBody(key: RoleName, decl: Declaration, fields: readonly RoleField[], installed?: Known, owners?: Owners): Refusal | null {
  const id = decl.id;
  const self = String(ownId(decl));
  const parts = ROLE_PARTS[key];
  const names = parts.map((p) => p.part);
  const said = decl.body[key];
  const shape = `{ ${parts.map((p) => (p.optional ? `${p.part}?` : p.part)).join(', ')} }`;
  if (said === null || typeof said !== 'object' || Array.isArray(said))
    return bad('DECLARATION_INVALID', `${id}'s ${key} names the field playing each part, as ${shape}, and this is not.`, key, names);
  for (const part of Object.keys(said))
    if (!names.includes(part)) return bad('DECLARATION_INVALID', `${id}'s ${key} declares ${part}, and there is no such part.`, key, names);

  /* THE LIST DECLARING scopes:, from what is installed with the batch laid over it. Unknown without `installed`, and
     then `projects` is checked for its type alone, as `scopeBody` does. */
  const projects =
    installed === undefined
      ? undefined
      : ([...installed].find(([other, body]) => other.startsWith('register.') && body.scopes !== undefined)?.[0]?.slice('register.'.length) ?? null);
  /* ONE FIELD PLAYS ONE PART. Measured before this map: `meets: { met: handles, handles: handles }` installed clean and
     the first meet with a handle wrote the line saying where over the handle, and `rates:` naming `currency` for both
     codes installed clean and converted nothing, because every row's currency was its base. */
  const taken = new Map<string, string>();
  for (const part of parts) {
    const name = (said as Record<string, unknown>)[part.part];
    if (name === undefined) {
      if (part.optional) continue;
      return bad('DECLARATION_INVALID', `${id}'s ${key} names no field for ${part.part}, and every part but the optional ones is named: ${shape}.`, key, names);
    }
    const field = fields.find((f) => f.id === name);
    if (!field)
      return bad('FIELD_UNKNOWN', `${id}'s ${key} names ${String(name)} for its ${part.part}, and there is no such field.`, key, fields.map((f) => f.id));
    const first = taken.get(field.id);
    if (first !== undefined)
      return bad('DECLARATION_INVALID', `${id}.${field.id} plays ${first} in its ${key}, so it cannot play ${part.part} as well. Name another field for ${part.part}.`, field.id);
    taken.set(field.id, part.part);
    if (!plays(part, field))
      return bad('DECLARATION_INVALID', `${id}.${field.id} plays ${part.part} in its ${key}, so it is ${part.says}, and it is a ${field.type}.`, field.id);
    if (!aims(part, field, self, projects))
      return bad(
        'DECLARATION_INVALID',
        part.to === 'self'
          ? `${id}.${field.id} plays ${part.part} in its ${key}, so it points at ${self}, the list itself, and it points at ${String(field.to)}.`
          : projects === null
            ? `${id}.${field.id} plays ${part.part} in its ${key}, and no register declares scopes:, so nothing says what a project is.`
            : `${id}.${field.id} plays ${part.part} in its ${key}, so it points at ${projects}, the register that declares scopes:, and it points at ${String(field.to)}.`,
        field.id,
      );
  }

  for (const [other, body] of installed ?? []) {
    if (other === id || !other.startsWith('register.')) continue;
    if (body[key] !== undefined) return bad('DECLARATION_INVALID', `${other} already declares ${key}:, and one list holds ${HOLDS[key]}.`, key);
    const list = { ...(body as unknown as RoleList), id: other.slice('register.'.length) };
    if (legacyShaped(key, list)) {
      const pack = owners?.get(other) ?? null;
      return bad(
        'DECLARATION_INVALID',
        `${other} holds your ${HELD[key]} and declares no ${key}:, and one list holds ${HOLDS[key]}. ` +
          (pack === null
            ? `Declare ${key}: on ${list.id} instead, and keep ${HOLDS[key]} there.`
            : `Update ${pack}, which owns ${list.id}, to a version that declares ${key}: on it, and keep ${HOLDS[key]} there.`),
        key,
      );
    }
  }
  return null;
}

/** What a list holding a role holds, in one word, for `roleBody`'s sentence. */
const HELD: Readonly<Record<RoleName, string>> = { rates: 'rates', meets: 'people', org: 'organisations' };

/** What a keyless list shaped like a role would hold beside the list declaring it, for `keylessBeside`'s sentence. */
const UNREAD: Readonly<Record<RoleKey, string>> = { rates: 'rates no figure converts by', meets: 'people meet never finds' };

/**
 * `roleBody`'s question asked of the other list: a keyless `fx` or `people` shaped like the role, arriving where a list
 * already declares the key.
 *
 * WITHOUT THIS THE RULE HELD IN ONE INSTALL ORDER. `roleBody` runs only for a list declaring the key, so a list
 * declaring `rates:` and then a keyless `fx` of money-core's shape both installed (driven in
 * `test/roles-keyless-second.test.ts`). A rate written into `fx` was then read by nothing, and cash said the dollar
 * rate it needed was missing; and the declaring list's next update was refused by `roleBody`, telling its owner to
 * declare `rates:` on a list another pack owns. `meets:` then a People-shaped `people` did the same. Refused here, the
 * keyless list is the one told, which is the list that caused it. `legacyShaped` decides whether it would hold the
 * role, so an `fx` of sound effects still installs beside the rates.
 */
function keylessBeside(key: RoleKey, decl: Declaration, installed?: Known, owners?: Owners, held?: ReadonlySet<string>): Refusal | null {
  if (decl.kind !== 'register' || decl.body[key] !== undefined) return null;
  const self = String(ownId(decl));
  if (!legacyShaped(key, { ...(decl.body as unknown as RoleList), id: self })) return null;
  for (const [other, body] of installed ?? []) {
    if (other === decl.id || !other.startsWith('register.') || body[key] === undefined) continue;
    /* A LIST THE RECORD ALREADY HOLDS CANNOT BE INSTALLED UNDER ANOTHER ID. A record that took a keyless `fx` beside
       `rates` before this guard existed met it on `fx`'s next update, and was told to "install fx under another id", which
       nothing can do to a declaration that is there: an id is not renamed. What such a list can do is give its rows to
       the list that holds the role and go, by a retire when it is the owner's and by a version without it when a pack's,
       so that is the sentence (`test/roles-keyless-held.test.ts`). `held` is what the record held before the batch,
       since `installed` has the batch laid over it and cannot say. */
    /* AND ONLY WHEN THE DECLARING LIST WAS HELD TOO. With `fx` held alone and `rates` arriving in the same batch, `fx`
       first, this said "register.fx has sat beside register.rates ... since before", of a `rates` that was not there
       yet. The list that caused it is the arriving one, and its own check says so ("Declare rates: on fx instead"), so
       the pair is left to it (`test/lint-planned.test.ts`). */
    if (held?.has(decl.id) === true && !held.has(other)) continue;
    if (held?.has(decl.id) === true) {
      const pack = owners?.get(decl.id) ?? null;
      const home = other.slice('register.'.length);
      return bad(
        'DECLARATION_INVALID',
        `${decl.id} has sat beside ${other}, which holds ${HOLDS[key]}, since before one list was held to them, so it holds ${UNREAD[key]}, and this change keeps it there. Move its rows into ${home}, then ${
          pack === null ? `retire ${decl.id}` : `update ${pack} to a version that leaves ${self} out`
        }.`,
        'id',
      );
    }
    return bad(
      'DECLARATION_INVALID',
      `${other} already holds ${HOLDS[key]}, and a keyless ${self} shaped like them beside it would hold ${UNREAD[key]}. Install ${self} under another id, or keep ${HOLDS[key]} in ${other.slice('register.'.length)}.`,
      'id',
    );
  }
  return null;
}

/**
 * An hour offset, which is the one unit `remind:` admits and `where:` does not.
 *
 * WRITTEN OUT AND NOT IMPORTED, because there is nothing to import: `schedule.ts`'s grammar reads
 * `d w m` and has no arm for an hour at all. This names the unit in order to REFUSE it, so it is
 * not a second copy of a list that has to stay in step with a first — the list it must not drift
 * from is `offsetMs`, and that is called rather than copied.
 */
const HOUR_OFFSET = /^[+-]?\d{1,4}h$/u;

/**
 * `34 §4`'s reserved field ids, and the register that declares one is dead on arrival.
 *
 * The write path has enforced this since it was written (`RESERVED` in `index.ts`) and `validate`
 * enforced none of it, so the two halves disagreed and the register in between could be installed
 * and could then hold nothing. Reproduced with the likeliest field name an author will ever pick:
 * `register notes { title (text, required) }` installs clean, `create` WITH `title` is
 * `FIELD_UNKNOWN: title is the record's, not a field you may write`, and `create` without it is
 * `REQUIRED_MISSING`. There is a read-side cost too. `schemaOf` hands the compiler the declared
 * fields, so `{ field: seq, gt: 10 }` compiles to a JSON path that is `NULL` on every row, a filter
 * that matches nothing and whose negation matches everything.
 *
 * `FIELD_UNKNOWN` IS THE CODE AND IT IS NOT A NEW ONE. `34 §4` names it for exactly this fact, *"a
 * reserved or `_`-prefixed key arriving from the boundary is `FIELD_UNKNOWN`"*, and `30 §6` says
 * the write-path codes are raised at install too, *"for the same fact in a declaration's seed or
 * default … one code, two moments"*, listing `FIELD_UNKNOWN` first among the seven. So the
 * declaration answers what the write answers, in the same words, one moment earlier.
 *
 * `deleted_at` IS ON THIS LIST AND IS NOT IN THE WRITE PATH'S `RESERVED`, because the write path
 * reads `patch.deleted_at` as the delete verb rather than as a field. That is the same fact
 * arriving at a different door, and `34 §4` counts nine.
 */
const RESERVED_FIELD_IDS = [
  'id', 'seq', 'register', 'created_at', 'updated_at', 'deleted_at', 'version', 'spoken', 'title',
] as const;

/** What the lists above are, for the test that keeps them honest against `42 §4.4`. */
export const REGISTER_BODY_KEYS = {
  register: REGISTER_KEYS,
  registerUnbuilt: REGISTER_UNBUILT,
  field: FIELD_KEYS,
  fieldUnbuilt: FIELD_UNBUILT,
  transition: TRANSITION_KEYS,
  transitionUnbuilt: TRANSITION_UNBUILT,
  reserved: RESERVED_FIELD_IDS,
} as const;

/**
 * One key against the two lists. The refusal names the key, says it is not read, and says what is,
 * the `allowed` list being the third of those.
 *
 * THE CODES ARE WRITTEN OUT AS LITERALS IN TWO CALLS rather than chosen into one, because
 * `refusals.mjs` reads a literal handed to the constructor: behind a ternary the gate that counts
 * what this product emits sees nothing, which is how two codes came to be published in `30 §6` and
 * emitted by nothing.
 */
function keyFault(
  said: string,
  key: string,
  read: readonly string[],
  unbuilt: readonly string[],
  at: string,
): Refusal | null {
  if (read.includes(key)) return null;
  if (unbuilt.includes(key))
    return bad(
      'NOT_IN_THIS_BUILD',
      `${said} declares ${key}, which the documents publish and this build reads nowhere, so it would install and be kept by nothing. The repair is a deploy, not an edit.`,
      at,
      read,
    );
  return bad('DECLARATION_INVALID', `${said} declares ${key}, and there is no such key.`, at, read);
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
 *
 * `held` IS THE IDS THE RECORD HELD BEFORE THIS BATCH, which `installed` cannot say once the batch is laid over it. Only
 * `keylessBeside` reads it, to tell a list that is already there something it can do; absent, every list is read as
 * arriving, as it was.
 */
export function validate(decl: Declaration, installed?: Known, owners?: Owners, held?: ReadonlySet<string>): Refusal | null {
  /* `KIND_UNKNOWN` IS THE CODE `04 §5` GIVES THIS, and it was emitted by nothing while this line
     answered `DECLARATION_INVALID`. A registry entry no source file produces is a code a caller
     cannot handle and a fixture nobody can write — which is the whole subject of `30 §6`. */
  if (!KINDS.includes(decl.kind))
    return bad('KIND_UNKNOWN', `${decl.kind} is not one of the ${KINDS.length} kinds of declaration: ${KINDS.join(', ')}.`, 'kind', KINDS);
  const own = ownId(decl);
  if (decl.id !== `${decl.kind}.${own}`)
    return bad(
      'DECLARATION_INVALID',
      `A declaration's id is its kind and its own id: ${decl.kind}.${String(own)}, not ${decl.id}.`,
      'id',
    );
  /* A `{{config:<key>}}` IS FILLED WHERE A PACK IS PLANNED AND INSTALLED, and nowhere else. One that
     reaches here was never filled: a declaration installed outside a pack, or a key its pack does not
     declare. Stored as it is, it would be a rule reading the literal text of a placeholder. */
  const unfilled = configReads(decl.body)[0];
  if (unfilled !== undefined)
    return bad(
      'FIELD_UNKNOWN',
      `${decl.id} reads the setting ${unfilled.key}, and a setting is filled only when its pack is planned and installed with a value for it.`,
      unfilled.at,
    );
  /* A PART THAT WAITS (`when: { holds }`) IS CHECKED FOR ITS SHAPE, and the rest of the document is read as though every
     part were there: the plan, not this check, decides which of them a record gets. */
  const waits = holdsFault(decl);
  if (waits) return waits;
  decl = withoutHolds(decl);
  /* THE KERNEL'S REGISTER HAS ONE WRITER, its migrations (2, and 22 for the app a run is in). Every
     agent write resolves to a row of it, so a pack or a person declaring `register.session` would
     change what an agent is for the whole record. `PROVIDES_CONFLICT` is `30 §6`'s code for an id
     somebody else already provides, and the somebody here is the kernel, which seats it as
     `pack_id = 'kernel'`. The kernel's newest bytes are let through, because installing them writes only
     the row migration 22 wrote. Migration 2's are not: over 22's they would seat a register that keeps no
     app as a newer version. */
  if (decl.id === 'register.session' && (decl.pack !== 'kernel' || jcs(decl.body) !== SESSION_BODY))
    return bad(
      'PROVIDES_CONFLICT',
      "register.session is the kernel's own register, and no pack or person may declare it.",
      'register.session',
    );
  /* AND SO IS `register.instructions` (migrations 42 and 44), for the same reason: what he tells an agent has one writer. */
  if (decl.id === 'register.instructions' && (decl.pack !== 'kernel' || jcs(decl.body) !== INSTRUCTIONS_BODY))
    return bad(
      'PROVIDES_CONFLICT',
      "register.instructions is the kernel's own register, and no pack or person may declare it.",
      'register.instructions',
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
  if (decl.kind === 'metric') return metricBody(decl, installed);
  if (decl.kind === 'page') return pageBody(decl, installed);
  if (decl.kind === 'look') return lookBody(decl, installed);
  if (decl.kind === 'theme') return themeBody(decl);
  if (decl.kind === 'ingest') return ingestBody(decl, installed);
  if (decl.kind === 'script') return scriptBody(decl);
  /* A JOB KIND, whose every key is a promise the runner keeps or the record refuses (`jobs.ts`). */
  if (decl.kind === 'job') return jobBody(decl);

  /* A PACK'S OWN BLOCK KIND, drawn by one of the renderer's primitives from the spec it declares (`blockBody`). */
  if (decl.kind === 'block') return blockBody(decl);

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

    /* A LINK THAT FILTERS OR TAKES A FIELD THE LINKED LIST DOES NOT DECLARE (`rules.ts` `linkFault`). Compiled,
       such a filter matches nothing, so the rule installed and filed nothing for ever. A list not installed yet is not
       refused here: such a link has always linked nothing. */
    if (installed) {
      const linked = linkFault(
        (register) => {
          const fields = fieldsOf(installed, register);
          return fields === null ? null : ({ register, fields: Object.fromEntries(fields.map((f) => [f, {}])) } as never);
        },
        decl.body as never,
      );
      if (linked) return linked;
      /* AND A LINK'S `also` THAT IS NOT A REF TO THE LINKED LIST (`alsoFault`): it would hold an id nothing can open. Asked
         of the rule's own list, with each field's type and where it points, which the check above has no need of. */
      const also = alsoFault((register) => {
        const shape = installed.get(`register.${register}`);
        if (shape === undefined || !Array.isArray(shape.fields)) return null;
        const fields = (shape.fields as { id?: unknown; type?: unknown; to?: unknown; retired?: unknown }[])
          .filter((f) => f?.retired !== true && typeof f?.id === 'string')
          .map((f) => [f.id, { type: f.type, ...(typeof f.to === 'string' ? { to: f.to } : {}) }]);
        return { register, fields: Object.fromEntries(fields) } as never;
      }, decl.body as never);
      if (also) return also;
    }

    /* THE TRIGGER, THE STEPS AND THE PATH, in `flow-lint.ts`. A rule with `on: { every: 1h }` installed before this line
       existed and so did one with `every: 5m`, a `tag` on a clock tick, or no register and no trigger at all: nothing
       read `on:`, and the pass selects rules by `register`, so each was a declaration read by nothing. A rule that
       names only `register`, `when` and `then` meets one new check there, that the register is named. */
    const flowed = flowFault(decl.id, decl.body, installed);
    if (flowed) return flowed;
    const body = decl.body as FlowDecl;
    const subject = subjectOf(body);

    /* AND A SPAN THIS RECORD CANNOT READ IS REFUSED WHERE IT IS WRITTEN. `{ schedule: { in: '2 weeks'
       } }` would install and then be dropped at fire time — and the row it was meant to chase is
       exactly the row somebody is trusting it to chase. Every action is walked, `then`'s or a step's inside a branch. */
    const actions = actionsOf(body);
    for (const { action: raw, at } of actions) {
      const action = raw as { schedule?: { in?: unknown }; create?: unknown };
      if (action.schedule !== undefined) {
        const span = typeof action.schedule.in === 'string' ? spanMs(action.schedule.in) : null;
        if (span === null)
          return bad(
            'DECLARATION_INVALID',
            `${decl.id} schedules ${String(action.schedule.in)} ahead, and a span is a number and one of d, w, m or y. Write 14d.`,
            at.startsWith('then[') ? 'then' : at,
          );
      }
      if ('create' in action) {
        const unbounded = createFault(decl.id, action, subject ?? undefined, installed, owners, decl.pack ?? null);
        if (unbounded) return unbounded;
      }
    }

    const once = (decl.body as { once_per?: unknown }).once_per;
    if (once !== undefined && (!Array.isArray(once) || once.some((k) => typeof k !== 'string')))
      return bad('DECLARATION_INVALID', `A rule's once_per is a list of field names, and ${decl.id}'s is not.`, 'once_per');

    /* A RULE THAT RUNS A CALL NAMES ONE THE OWNER ALREADY APPROVED. The host, the key and the fields it sends are on
       the call, so the rule can reach nothing new; and it runs once per row, because a call on every write of a row
       is the same post sent again each time somebody fixes a typo. */
    for (const { action, at: where } of actions) {
      if (!('run' in action)) continue;
      const at = `${where}.run`;
      const run = action.run;
      const shape = callFault(decl.id, run, at, subject);
      if (shape) return shape;
      if (once === undefined)
        return bad('REQUIRED_MISSING', `${decl.id} runs ${String(run)} and declares no once_per, so it would send on every write of the row.`, 'once_per');
      const fault = callFault(decl.id, run, at, subject, installed);
      if (fault) return fault;
    }
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

  /* THE BODY'S KEYS BEFORE ITS FIELDS, and the order is worth a line: `feilds:` answered *"declares
     no fields, so it can hold nothing"*, which is true and is about the wrong thing. A misspelt key
     is a misspelt key, and the list of what a register takes is in `allowed` where a person and an
     agent can both read it. */
  for (const key of Object.keys(decl.body)) {
    const fault = keyFault(id, key, REGISTER_KEYS, REGISTER_UNBUILT, key);
    if (fault) return fault;
  }

  const fields = decl.body.fields;
  if (!Array.isArray(fields) || fields.length === 0)
    return bad('DECLARATION_INVALID', `${id} declares no fields, so it can hold nothing.`, 'fields');

  /* `02 §5`'s ceiling, and its own sentence for why: *"a register with more than that is a
     database, not a register."* Sixty-five installed clean, and every one of them became a control
     in a form, a line in an MCP schema and a term in a `json_extract` plan. */
  if (fields.length > FIELD_CEILING)
    return bad(
      'FIELDS_OVER_CAP',
      `${id} declares ${fields.length} fields. The ceiling is ${FIELD_CEILING}: a register with more than that is a database, not a register.`,
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
    /* A RESERVED ID IS A REGISTER THAT INSTALLS AND THEN HOLDS NOTHING, and the write path has
       always known it while this loop did not. Checked after the grammar so that `_rule` still gets
       the sentence about the underscore, and before the type so that `title` is answered as the
       record's own rather than sent off to check its type. */
    if ((RESERVED_FIELD_IDS as readonly string[]).includes(f.id))
      return bad(
        'FIELD_UNKNOWN',
        `${id}.${f.id}: ${f.id} is BrainDog's own, not a field a list may declare. It would install and then refuse every write to that field.`,
        f.id,
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
        `${id}.${f.id}: type ${JSON.stringify(f.type ?? null)} is not a field type BrainDog knows${guess ? `; did you mean '${guess}'?` : '.'}`,
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
       and the form drew a control with nothing in it.

       AND A `list<enum>` IS AN ENUM BY EVERY RULE THAT READS ONE. This branch tested `type === 'enum'`
       and nothing else, so `{ type: 'list', of: 'enum' }` with no `values` installed: `coerce.ts`'s
       `list` case coerces each element as a field of type `of`, and the write path checks membership
       against the same `values` the element type would have used. With none declared, the control drew
       empty and every write to it was refused, which is the defect above reached through `of`. The
       check is the element type's, so it is asked of the element type. */
    const enumeral = f.type === 'enum' || (f.type === 'list' && f.of === 'enum');
    if (enumeral && (!Array.isArray(f.values) || f.values.length === 0))
      return bad(
        'DECLARATION_INVALID',
        `${id}.${f.id} is ${f.type === 'list' ? 'a list of enum' : 'an enum'} and lists no values, so nothing could ever be written to it.`,
        f.id,
      );
    /* AND EACH VALUE IS TEXT, WHICH `mappingFault` HAS ALWAYS REQUIRED AND THIS COPY DID NOT. Both
       ends of the record compare an enum by string: `coerce`'s enum case refuses a value that is not
       one, and the write path's membership check compares `String(one)` against this list. So a value
       declared as the number `1` is reachable only by a caller who sends the text `"1"`, and never by
       one who sends the number the declaration showed them. One rule about an enum's values, spelled
       the same in both places, rather than two that disagree until somebody finds the other door. */
    if (enumeral && (f.values as readonly unknown[]).some((v) => typeof v !== 'string'))
      return bad('DECLARATION_INVALID', `${id}.${f.id} lists a value that is not text, and an enum is compared as text.`, f.id);
    /* AND NO VALUE IS SHAPED LIKE A KEY. A list grows at run time: an `add` of values lands by rule when the owner's
       key files it, and an import can propose a person's role and a service's kind straight from its source. Measured:
       `register.people v2` holding a GitHub token as a role, resolved by rule, and a declaration is versioned history,
       so the value would stay after any fix. Every version is checked here, so no door can add one. No `found`, because
       the value may be the key. */
    if (enumeral && (f.values as readonly string[]).some((v) => looksLikeCredential(v)))
      return bad(
        'DECLARATION_INVALID',
        `${id}.${f.id} lists a value that looks like a key, and a key never goes in a declaration. Deposit it in the keychain, and list what it opens instead.`,
        f.id,
      );

    /* `state` IS RESERVED WHETHER OR NOT THE BODY POINTS AT IT (`34 §4`, `02 §1`). This branch used
       to live below, behind `body.state` naming the field, so `{ id: state, type: text }` with no
       `state:` key installed as an ordinary field called `state`, and the column it is named after
       stayed NULL on every row of that register for ever. */
    if (f.id === 'state' && f.type !== 'enum')
      return bad('STATE_NOT_ENUM', `${id}.state: state is a reserved id and is always an enum.`, 'state', ['enum']);

    /* AND THE FIELD'S OWN KEYS, same two lists. A field is where `derive:` and `required_when:` sit,
       which are the two that read most like a rule and are kept by nothing at all. */
    for (const key of Object.keys(raw as object)) {
      const fault = keyFault(`${id}.${f.id}`, key, FIELD_KEYS, FIELD_UNBUILT, f.id);
      if (fault) return fault;
    }

    /* `labels:` NAMES VALUES THE ENUM DECLARES, and nothing else. A label for a value the enum does not
       hold is a word the screen never shows, and a label that reads as another value would make
       `direction is paid` mean two rows' worth of things. */
    const labels = (raw as { labels?: unknown }).labels;
    if (labels !== undefined) {
      const fault = labelsFault(id, f, labels);
      if (fault) return fault;
    }

    /* `scope:` IS WHAT THE WRITE PATH HOLDS A TOKEN TO, so its shape and its target are checked here
       rather than trusted there. */
    const scope = (raw as { scope?: unknown }).scope;
    if (scope !== undefined) {
      const fault = scopeBody(id, f, (raw as { to?: unknown }).to, scope, installed);
      if (fault) return fault;
    }

    /* A MOVE'S KEYS ARE CLOSED, and its `requires:` and `by:` are checked in `fieldRules` once every
       field of the register is known. */
    const moves = (raw as { transitions?: unknown }).transitions;
    if (moves !== undefined) {
      if (moves === null || typeof moves !== 'object' || Array.isArray(moves))
        return bad('DECLARATION_INVALID', `${id}.${f.id}'s transitions are a state and the moves out of it, and this is not.`, f.id);
      for (const [from, move] of Object.entries(moves as Record<string, unknown>)) {
        if (move === null || typeof move !== 'object' || Array.isArray(move))
          return bad('DECLARATION_INVALID', `${id}.${f.id}: the move out of ${from} is a body with a to: in it, and this is not.`, f.id);
        for (const key of Object.keys(move)) {
          const fault = keyFault(`${id}.${f.id}.transitions.${from}`, key, TRANSITION_KEYS, TRANSITION_UNBUILT, `${f.id}.transitions.${from}`);
          if (fault) return fault;
        }
      }
    }

    /**
     * A `remind:` NOBODY COULD READ, AND THE FIELD IT SITS ON.
     *
     * `remind` is on `FIELD_KEYS`, so a field carrying it passed `keyFault` and was let through;
     * its VALUE was validated nowhere, and the word appeared exactly once in this file. The
     * consumer is `schedule.ts`'s `remindersFor`, which calls `shiftFrom` per offset and `continue`s
     * on a `null` — so an offset the grammar cannot read derives no row and says nothing. Driven:
     *
     *     remindersFor remind:["-2h"] -> []
     *     declare: remind ["-2h","banana"] on a day -> ACCEPTED (null)
     *     declare: remind ["-1d"] on a text field   -> ACCEPTED (null)
     *
     * A field declaring *"remind me two hours before"* is decoration, and `banana` beside it is
     * accepted too, so the declaration had no floor at all.
     *
     * THREE ANSWERS, BECAUSE THEY ARE THREE FACTS. `02 §4` and `34 §1.4` both say an hour is legal
     * in `remind:` and nowhere else, and `02 §4` names the code for the half that is not: *"an hour
     * offset against a `day` field is `RELATIVE_UNIT_FOR_DAY` — raised by `declare` at install, on
     * the `remind:` key, not by the compiler"*, which is `30 §6:770`'s row naming its own producer.
     * A day has no time of day to count back from. On an `instant` an hour IS legal (`42 §4.2`'s
     * `Offset`, `42 §4.4`'s row) and `schedule.ts`'s grammar reads days, weeks and months only, so
     * the honest answer there is the one `keyFault` gives a published key nothing keeps. Anything
     * that is neither is `RELATIVE_LITERAL_UNKNOWN`, which is the code `metrics.ts` already uses
     * for a temporal literal the record cannot read.
     *
     * THE READABILITY TEST IS `shiftFrom` ITSELF rather than a copy of its regular expression, for
     * the reason the `ARRIVAL` import above gives: two lists that must agree and do not are how
     * `MATCH_FIELDS` came to refuse names that fire. `-30m` is thirty MONTHS and reads clean here,
     * because `m` is a calendar month in every temporal grammar this record has (`02 §4`,
     * `34 §1.4`, `42 §4.2`) and there is no minute unit to confuse it with.
     */
    const remind = (raw as { remind?: unknown }).remind;
    if (remind !== undefined) {
      if (!Array.isArray(remind) || remind.length === 0)
        return bad('DECLARATION_INVALID', `${id}.${f.id}'s remind is a list of offsets from the date, and this is not.`, `${f.id}.remind`);
      if (f.type !== 'day' && f.type !== 'instant')
        return bad(
          'DECLARATION_INVALID',
          `${id}.${f.id} is a ${f.type} and a reminder is derived from a date, so nothing would ever be armed.`,
          `${f.id}.remind`,
        );
      for (const said of remind) {
        const offset = typeof said === 'string' ? said.trim() : '';
        /* THE CONDITION IS HOISTED SO EACH CODE SITS AFTER ITS CONSTRUCTOR: `refusals.mjs` cannot
           cross a ternary whose condition holds a quote, and `f.type === 'day'` holds one. */
        const dated = f.type === 'day';
        if (HOUR_OFFSET.test(offset) && dated)
          return bad(
            'RELATIVE_UNIT_FOR_DAY',
            `${id}.${f.id} is a day and ${offset} counts in hours, and a day carries no time of day to count back from. Remind in days.`,
            `${f.id}.remind`,
          );
        if (HOUR_OFFSET.test(offset))
          return bad(
            'NOT_IN_THIS_BUILD',
            `${id}.${f.id} reminds at ${offset}, and an hour offset is published for an instant and read by this build nowhere, so it would install and arm nothing. The repair is a deploy, not an edit.`,
            `${f.id}.remind`,
          );
        /* THE EPOCH IS AN ARBITRARY ANCHOR AND THAT IS THE POINT: `shiftFrom` reads the OFFSET's
           grammar before it touches the date, so every anchor answers the same question, and this
           is the exact call `remindersFor` makes and the exact `null` it skips a reminder on. */
        if (shiftFrom(0, offset) === null)
          return bad(
            'RELATIVE_LITERAL_UNKNOWN',
            `${id}.${f.id} reminds at ${JSON.stringify(said)}; an offset is a sign, a number and d, w or m, so -7d is a week before.`,
            `${f.id}.remind`,
          );
      }
    }

    /**
     * A `repeat:` NOBODY COULD READ, AND IT WAS EVERY SPELLING THE DOCUMENTS USE.
     *
     * `repeat` is on `FIELD_KEYS`, so a field carrying one passed `keyFault` and was let through
     * unread: `validate` checked the key not at all. Its consumer is `schedule.ts`'s
     * `expandRepeat`, whose arms were spelled `day week month year` and whose chain ended in an
     * `else` meaning yearly, while `42 §4.4` closes the list at `daily weekly monthly yearly` and
     * `02 §4`'s own worked example is `repeat: { freq: weekly, byday: [TU, TH], count: 12 }`.
     * Driven from an anchor of 2026-09-08:
     *
     *     freq: week    ->  2026-09-08, 09-15, 09-22, 09-29
     *     freq: weekly  ->  2026-09-08, 2027-09-08
     *     freq: banana  ->  2026-09-08, 2027-09-08
     *
     * So a weekly standup written the way the specification writes it armed one reminder a year.
     * `schedule.ts` takes both spellings now and derives nothing from a word it does not know,
     * and this is what stops that word being installable in the first place. The refusal lands
     * only on the unknown one: refusing `weekly` would have been worse for the author than the
     * silence was for the reader.
     *
     * `FREQ` IS IMPORTED RATHER THAN COPIED, for the reason the `remind:` check above gives about
     * `shiftFrom`. Two lists that must agree and do not are the shape of the defect itself.
     */
    const repeat = (raw as { repeat?: unknown }).repeat;
    if (repeat !== undefined) {
      if (repeat === null || typeof repeat !== 'object' || Array.isArray(repeat))
        return bad(
          'DECLARATION_INVALID',
          `${id}.${f.id}'s repeat is a frequency and how often, and this is not.`,
          `${f.id}.repeat`,
        );
      if (f.type !== 'day' && f.type !== 'instant')
        return bad(
          'DECLARATION_INVALID',
          `${id}.${f.id} is a ${f.type} and a repeat steps a date, so nothing would ever be derived.`,
          `${f.id}.repeat`,
        );
      const freq = (repeat as { freq?: unknown }).freq;
      if (typeof freq !== 'string' || !Object.hasOwn(FREQ, freq))
        return bad(
          'DECLARATION_INVALID',
          `${id}.${f.id} repeats every ${typeof freq === 'string' ? freq : JSON.stringify(freq)}, and a frequency is daily, weekly, monthly or yearly.`,
          `${f.id}.repeat`,
        );
      /* AND EVERY OTHER KEY IS ONE THE WALK READS, which was checked for `freq` alone.
         `{ freq: monthly, bymonthday: [15, -1] }` installed and walked 09-15, 10-15, 11-15, never the last day;
         `{ freq: weekly, byday: [TU, TH] }` walked Tuesdays only; `colour: blue` installed beside them
         (`repeat-keys.test.ts`). A salary declared on two days that arms one is found out on the day it is missed, so
         the key is refused, named, until `expandRepeat` reads it. */
      const unread = Object.keys(repeat).find((k) => !(REPEAT_READ as readonly string[]).includes(k));
      if (unread !== undefined)
        return bad(
          'DECLARATION_INVALID',
          `${id}.${f.id}'s repeat says ${unread}, and this build walks a repeat by ${REPEAT_READ.join(', ')} only, so ${unread} would be ignored. Leave it out.`,
          `${f.id}.repeat.${unread}`,
          REPEAT_READ,
        );
      /* AND THE DAYS IT NAMES ARE DAYS: of the month 1 to 31 or counted back from the last, of the week by its two
         letters, each read only on the frequency it belongs to, and a workday that is previous, next or none. */
      const r = repeat as { bymonthday?: unknown; byday?: unknown; workday?: unknown };
      const md = r.bymonthday;
      if (md !== undefined && (!Array.isArray(md) || md.length === 0 || !md.every((d) => Number.isInteger(d) && ((d >= 1 && d <= 31) || (d >= -3 && d <= -1)))))
        return bad('DECLARATION_INVALID', `${id}.${f.id}'s repeat says bymonthday ${JSON.stringify(md)}, and a day of the month is 1 to 31, or -1 to -3 counted back from the last.`, `${f.id}.repeat.bymonthday`);
      if (md !== undefined && FREQ[freq] !== 'month')
        return bad('DECLARATION_INVALID', `${id}.${f.id}'s repeat says bymonthday on a ${freq} repeat, and days of the month are read for a monthly one only.`, `${f.id}.repeat.bymonthday`);
      const bd = r.byday;
      if (bd !== undefined && (!Array.isArray(bd) || bd.length === 0 || !bd.every((w) => typeof w === 'string' && Object.hasOwn(BYDAY, w.toUpperCase()))))
        return bad('DECLARATION_INVALID', `${id}.${f.id}'s repeat says byday ${JSON.stringify(bd)}, and a day of the week is one of ${Object.keys(BYDAY).join(', ')}.`, `${f.id}.repeat.byday`, Object.keys(BYDAY));
      if (bd !== undefined && FREQ[freq] !== 'week')
        return bad('DECLARATION_INVALID', `${id}.${f.id}'s repeat says byday on a ${freq} repeat, and days of the week are read for a weekly one only.`, `${f.id}.repeat.byday`);
      if (r.workday !== undefined && !['previous', 'next', 'none'].includes(r.workday as string))
        return bad('DECLARATION_INVALID', `${id}.${f.id}'s repeat says workday ${JSON.stringify(r.workday)}, and a workday is previous, next or none.`, `${f.id}.repeat.workday`, ['previous', 'next', 'none']);
    }
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
     package promises nothing throws over. Refused at the declaration, where a sentence fits.

     AND THE GUARD ASKED THE WRONG LIST. `PARTS` names the two types that index in halves, which is
     not the set of types the clash check cannot bind. Driven against a real `create`, one register
     per row, `{ type: 'list', of: 'text', unique: true }`, `{ type: 'file', unique: true }` and a
     `json` holding an object or an array each installed clean and then threw
     `TypeError: Provided value cannot be bound to SQLite parameter 2` out of `create`: the identical
     failure above, reached through a type nobody had added to the guard. `json` is the worst of the
     three and not the mildest, because its shape is not declared, so the rule holds for a row that
     happens to carry a string and takes the write path down on the next row that carries an object,
     which is a rule that passes whatever test is written for it. Nor is there a repair that keeps
     the key: `json_extract` over a composite returns its JSON text, so even a bindable comparison
     would not be the comparison the author declared. The answer is the same as it was for `money`,
     and it is the same sentence: carry what you mean by *the same one* in a text field. */
  for (const raw of fields) {
    const f = raw as unknown as FieldLike;
    if (f.unique && COMPOSITE.has(f.type))
      return bad(
        'DECLARATION_INVALID',
        PARTS[f.type]
          ? `${id}.${f.id} is a ${f.type}, which BrainDog stores in two halves, so it cannot be unique. Make a text field that carries what you mean by "the same one".`
          : `${id}.${f.id} is a ${f.type}, which BrainDog stores as more than one value, so it cannot be unique. Make a text field that carries what you mean by "the same one".`,
        f.id,
      );
  }

  const title = decl.body.title;
  if (typeof title !== 'string' || !seen.has(title))
    return bad('DECLARATION_INVALID', `${id} names ${String(title)} as its title, and has no such field.`, 'title', [...seen]);

  const state = decl.body.state;
  if (state !== undefined && (typeof state !== 'string' || !seen.has(state)))
    return bad('DECLARATION_INVALID', `${id} names ${String(state)} as its state, and has no such field.`, 'state', [...seen]);

  /* THE FINISHED DAY IS A DAY FIELD OF A REGISTER WITH A STATE, or there is nothing to fill it on and nothing to fill. */
  const finished = decl.body.finished;
  if (finished !== undefined) {
    const f = (decl.body.fields as readonly Record<string, unknown>[]).find((x) => x.id === finished);
    if (typeof finished !== 'string' || !f || f.type !== 'day' || state === undefined)
      return bad(
        'DECLARATION_INVALID',
        `${id} names ${String(finished)} as the day a row was finished. That is a day field of a register that declares a state.`,
        'finished',
        (decl.body.fields as readonly Record<string, unknown>[]).filter((x) => x.type === 'day').map((x) => String(x.id)),
      );
  }

  /* STEPS NAME A REF AND A BOOL OF THIS LIST, or there is no row they belong to and no way to tell one done. */
  const steps = decl.body.steps;
  if (steps !== undefined) {
    const own = decl.body.fields as readonly Record<string, unknown>[];
    const said = steps !== null && typeof steps === 'object' && !Array.isArray(steps) ? (steps as Record<string, unknown>) : {};
    const of = own.find((x) => x.id === said.of);
    const done = own.find((x) => x.id === said.done);
    if (Object.keys(said).some((k) => k !== 'of' && k !== 'done' && k !== 'order') || of?.type !== 'ref' || done?.type !== 'bool')
      return bad(
        'DECLARATION_INVALID',
        `${id} says its rows are steps. Say which ref field names the row each belongs to and which bool field says it is done, as { of: thing, done: done }.`,
        'steps',
        own.filter((x) => x.type === 'ref' || x.type === 'bool').map((x) => String(x.id)),
      );
    /* AND WHICH ONE COMES NEXT, from a field that sorts: a card's next step is the first open step in this order
       (`steps.ts` `nextSteps`), so an order over a field that does not sort would pick one by accident. */
    if (said.order !== undefined) {
      const sorts = own.filter((x) => ORDERS_STEPS.includes(String(x.type)));
      if (!sorts.some((x) => x.id === said.order))
        return bad(
          'DECLARATION_INVALID',
          `${id}'s steps are put in order by ${JSON.stringify(said.order)}, and the order is a number, a day or a text field of ${id}, lowest first, such as { of: thing, done: done, order: rank }.`,
          'steps',
          sorts.map((x) => String(x.id)),
        );
    }
  }

  /* PAIRS NAME FIELDS OF THIS LIST OF THE TYPES THE MATCHING READS, or the write path would set `true` into a text and
     run a day window over whatever the named field holds. The check is `pairs.ts`'s, beside the reader it guards. */
  if (decl.body.pairs !== undefined) {
    const fault = pairsFault(id, fields as unknown as FieldLike[], decl.body.pairs);
    if (fault) return fault;
  }

  /* A LIST'S OWN ORDER: what a read of it that names no order comes back in, where it came back by last change.
     One field of this list that sorts, read lowest first or, with `dir: desc`, highest first: the Ledger by its date,
     newest first. A money field does not sort, since two amounts in two currencies have no order. */
  if (decl.body.order !== undefined) {
    const order = decl.body.order;
    const sorts = (fields as { id?: unknown; type?: unknown; retired?: unknown }[]).filter((f) => f.retired !== true && LIST_ORDERS.includes(String(f.type)));
    if (!isPart(order) || Object.keys(order).some((k) => k !== 'field' && k !== 'dir') || (order.dir !== undefined && order.dir !== 'asc' && order.dir !== 'desc'))
      return bad('DECLARATION_INVALID', `${id}'s order is one field and which way it reads: { field: date, dir: desc }.`, 'order', ['asc', 'desc']);
    if (!sorts.some((f) => f.id === order.field))
      return bad(
        'DECLARATION_INVALID',
        `${id} is put in order by ${JSON.stringify(order.field ?? null)}, and the order is a number, a day, a time or a text field of ${id}.`,
        'order',
        sorts.map((f) => String(f.id)),
      );
  }

  /* A LIST'S OWN TABLE: the columns it opens on, in order, where the app derived them from the title, the card and the
     state. Each is a live field of this list, or `{ field, or?, label? }`: `or` the field read where the first holds
     nothing, `label` the column's heading. Left out, the app derives them as before. */
  if (decl.body.table !== undefined) {
    const fault = tableFault(id, fields as { id?: unknown; retired?: unknown }[], decl.body.table);
    if (fault) return fault;
  }

  /* `delete:` TAKES THE ONE VALUE THE WRITE PATH KEEPS (`referenced.ts`). Any other would install a promise about
     deleting that nothing reads, which is the silence the unbuilt list above exists to refuse. */
  const deletes = decl.body.delete;
  if (deletes !== undefined && !(DELETE_RULES as readonly unknown[]).includes(deletes))
    return bad(
      'DECLARATION_INVALID',
      `${id}'s delete is ${DELETE_RULES.join(' or ')}, which keeps a row while another row points at it. ${JSON.stringify(deletes)} is not.`,
      'delete',
      DELETE_RULES,
    );

  /* `owner_only:` IS `true` OR LEFT OUT, NEVER `false`, so the one spelling means one thing: a record-wide "Adds only"
     does not reach the list, and a grant naming it does (`20 §1`). The record's `guard` is what reads it. */
  const ownerOnly = decl.body.owner_only;
  if (ownerOnly !== undefined && ownerOnly !== true)
    return bad('DECLARATION_INVALID', `${id}'s owner_only is true, or left out. ${JSON.stringify(ownerOnly)} is not.`, 'owner_only', ['true']);

  /* `personal:` IS `true` OR LEFT OUT, as `owner_only:` is, and the two are never said together: a personal list is
     closed to every grant, so `owner_only` beside it would promise a grant naming the list reaches it. */
  const personal = decl.body.personal;
  if (personal !== undefined && personal !== true)
    return bad('DECLARATION_INVALID', `${id}'s personal is true, or left out. ${JSON.stringify(personal)} is not.`, 'personal', ['true']);
  if (personal === true && ownerOnly !== undefined)
    return bad('DECLARATION_INVALID', `${id} is personal, so no grant reaches it and owner_only says nothing. Leave owner_only out.`, 'owner_only');

  /* `role:` IS ONE PART A LIST PLAYS FOR THE RECORD'S AGENTS, and `fade:` the live day field its rows fade by and how
     many days after it (`packages/record` `agent-lists.ts`). Checked here, at install, so a misspelt one is never inert. */
  const role = decl.body.role;
  if (role !== undefined && (typeof role !== 'string' || !(AGENT_ROLES as readonly string[]).includes(role)))
    return bad('DECLARATION_INVALID', `${id}'s role is one of ${AGENT_ROLES.join(', ')}. ${JSON.stringify(role)} is not.`, 'role', [...AGENT_ROLES]);
  /* A LIST OF PROFILES OR OF WHAT CARRIES BETWEEN MACHINES IS ONE PERSON'S SET-UP, so it is personal or not installed. */
  if (typeof role === 'string' && (PERSONAL_ROLES as readonly string[]).includes(role) && personal !== true)
    return bad('DECLARATION_INVALID', `${id} plays ${role}, which is the owner's alone. Add personal: true to ${id}.`, 'personal', ['true']);
  /* ONE LIST PLAYS EACH PART, as one holds the projects: the agents read their skills, profiles and rules from the first
     list that says so, so a second would take the part over the next time either was declared again. */
  if (typeof role === 'string')
    for (const [other, body] of installed ?? [])
      if (other !== decl.id && other.startsWith('register.') && body.role === role)
        return bad('DECLARATION_INVALID', `${other} already plays ${role}, and one list plays each part. Leave role out of ${id}.`, 'role');
  const fade = decl.body.fade;
  if (fade !== undefined) {
    const f = fade !== null && typeof fade === 'object' && !Array.isArray(fade) ? (fade as Record<string, unknown>) : null;
    const days = (fields as unknown as { id?: unknown; type?: unknown; retired?: unknown }[]).filter((x) => x.type === 'day' && x.retired !== true).map((x) => String(x.id));
    if (f === null || Object.keys(f).some((k) => k !== 'field' && k !== 'after') || typeof f.field !== 'string' || !days.includes(f.field))
      return bad('DECLARATION_INVALID', `${id}'s fade is { field, after }, its field one of this list's day fields${days.length > 0 ? ` (${days.join(', ')})` : ', and it has none'}.`, 'fade.field', days);
    if (typeof f.after !== 'string' || !/^[1-9][0-9]{0,4}d$/u.test(f.after))
      return bad('DECLARATION_INVALID', `${id}'s fade after is a number of days, such as 90d. ${JSON.stringify(f.after)} is not.`, 'fade.after');
  }

  /* `kept_by:` IS `automations` OR LEFT OUT, as `delete:` is its one word: a list the record's automations keep, such as
     the nightly snapshots, is offered no page of its own. Checked here, so a misspelt one is never inert. */
  const keptBy = decl.body.kept_by;
  if (keptBy !== undefined && keptBy !== 'automations')
    return bad('DECLARATION_INVALID', `${id}'s kept_by is automations, or left out. ${JSON.stringify(keptBy)} is not.`, 'kept_by', ['automations']);

  /* `restates:` NAMES A MONEY FIELD AND A DAY FIELD OF THIS LIST, and what the night's net worth is restated in by them
     (`restatesOf` in `restates.ts`). The night's field it fills is the night list's to declare, so it is not checked
     here: a list of prices installed before the night declares the field fills nothing until it does. */
  if (decl.body.restates !== undefined) {
    const fault = restatesFault(id, fields as unknown as FieldLike[], decl.body.restates);
    if (fault) return fault;
  }

  /* `hand:` NAMES FIELDS OF THIS LIST OF THE TYPES A HAND WRITES, or pressing "Hand to" would set a person into a text
     field or leave a row in a state its list does not have. Checked here, at install, and not when somebody presses. */
  if (decl.body.hand !== undefined) {
    const fault = handFault(id, fields as unknown as FieldLike[], state, decl.body.hand);
    if (fault) return fault;
  }

  /* `once:` NAMES FIELDS OF THIS LIST THAT A WRITE CAN SET. An id the list does not have would be inert, and a derived
     field is refused on every write, so neither is a field an add-on could plant once. */
  if (decl.body.once !== undefined) {
    const fault = onceFault(id, fields as unknown as (FieldLike & { derived?: boolean })[], decl.body.once);
    if (fault) return fault;
  }

  /* `same:` NAMES LIVE TEXT FIELDS OF THIS LIST, AND A SCOPE OR A LINK TO BE WITHIN, or the key `entities.ts` builds
     from it is built from nothing and every duplicate it was declared against answers to no key. */
  if (decl.body.same !== undefined) {
    const fault = sameFault(id, decl.body as Record<string, unknown>, fields as unknown as (FieldLike & { scope?: unknown })[], decl.body.same);
    if (fault) return fault;
  }

  /* `state` IS ALWAYS AN ENUM (`02 §1`, `04 §5`). A `state:` naming a `text` field gives the
     register a lifecycle with no transitions the record can check, so every `move` in every rule
     against it is unenforceable — which is the one thing a state field is FOR. */
  if (typeof state === 'string') {
    const held = (fields as unknown as FieldLike[]).find((f) => f.id === state);
    if (held && held.type !== 'enum')
      return bad('STATE_NOT_ENUM', `${id}.${state}: state is a reserved id and is always an enum.`, state, ['enum']);
  }

  const ruled = fieldRules(id, fields as unknown as Record<string, unknown>[], title, installed);
  if (ruled) return ruled;
  const coded = currencyKeysFault(id, fields as unknown as Record<string, unknown>[], installed);
  if (coded) return coded;
  const split = partsKeysFault(id, fields as unknown as Record<string, unknown>[]);
  if (split) return split;

  /* A SPOKEN PREFIX NAMES ONE REGISTER, or `LN7` names two rows (`02 §2`). `#` is the default every
     register shares, which is why it never resolves bare and is not checked here. */
  const prefix = decl.body.seq_prefix;
  if (prefix !== undefined && prefix !== '#') {
    if (typeof prefix !== 'string' || !SEQ_PREFIX.test(prefix))
      return bad(
        'DECLARATION_INVALID',
        `${id}'s seq_prefix is # or a capital letter followed by up to three capitals or digits, and ${JSON.stringify(prefix)} is not.`,
        'seq_prefix',
      );
    const holder = prefixHolder(decl.id, prefix, installed);
    if (holder)
      return bad(
        'SEQ_PREFIX_TAKEN',
        holder.theirs === prefix
          ? `${decl.id}: seq_prefix '${prefix}' is taken by ${holder.who}. D, SG and S are the kernel's.`
          : `${decl.id}: seq_prefix '${prefix}' clashes with '${holder.theirs}', taken by ${holder.who}, because ${prefix.length > holder.theirs.length ? prefix : holder.theirs}1 could mean either. Choose another.`,
        'seq_prefix',
      );
  }

  const scopes = decl.body.scopes;
  if (scopes !== undefined) {
    const fault = scopesBody(decl, fields as unknown as FieldLike[], scopes, installed);
    if (fault) return fault;
  }
  for (const key of ['rates', 'meets', 'org'] as const) {
    if (decl.body[key] === undefined) continue;
    const fault = roleBody(key, decl, fields as unknown as RoleField[], installed, owners);
    if (fault) return fault;
  }
  for (const key of ['rates', 'meets'] as const) {
    const fault = keylessBeside(key, decl, installed, owners, held);
    if (fault) return fault;
  }
  /* ONE FIELD SAYS WHERE A ROW APPLIES, or one row could be in two places with two sets of rules. */
  const scoping = (fields as unknown as { id: string; scope?: unknown }[]).filter((f) => f.scope !== undefined);
  if (scoping.length > 1)
    return bad(
      'DECLARATION_INVALID',
      `${id} declares scope on ${scoping.map((f) => f.id).join(' and ')}, and one field says where a row applies.`,
      scoping[1]?.id ?? 'fields',
    );

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
/**
 * The version a caller read a declaration at, so a write over it lands only if nobody moved it first.
 *
 * A PAGE IS SET WHOLE, so without this two people arranging one page each wrote their own reading over the other's. `0`
 * says the caller read no live declaration by that id.
 */
export type Expected = { id: string; version: number };

export async function installDeclarations(
  sql: Sql,
  now: number,
  batch: readonly Declaration[],
  transaction: <T>(fn: () => T) => T,
  expect?: Expected | Expected[],
): Promise<Result<Installed[]>> {
  const off = disabledPackFault(sql, batch);
  if (off) return { ok: false, refusal: off };
  const staged = await stageDeclarations(batch, knownTo(sql, batch), ownersTo(sql, batch), heldIn(sql));
  /* PASSED THROUGH WHOLE. Rebuilding the envelope by hand dropped whichever arm the rebuild did
     not know about, and there are three of them now. */
  if (!staged.ok) return staged;
  return staged.value(sql, now, transaction, expect);
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
/** Who declared what, from the column rather than from the body — see `Owners`. */
/**
 * The record a plan leaves, for a check asked before anything is written: what each declaration says, and who put it
 * there. `Known` and `Owners` with no batch laid over them.
 *
 * FOR THE ARRANGER, WHICH PLANS SEVERAL PACKS AND WRITES NONE OF THEM UNTIL THE ACCEPT. The second pack of an arrangement
 * is staged over the record the first leaves, and a lint that read the table asked it about a record the accept never
 * shows it: a list the first update retires was still there to be held against it, and a list the first declares was
 * not there to read a page against (`test/lint-planned.test.ts`).
 */
export type PlannedRecord = { known: Known; owners: Owners };

/**
 * The table's live declarations as the lint reads them, read once while they stand: what each says (parsed, and frozen,
 * since every lint lays its batch over a copy), who put each there, and every field each list ever sealed (`sealedEver`).
 *
 * WHY. The lint read the whole table, parsed every body and read every version of every list again for each batch it
 * was asked, and `boot` asks it of every offer the pen weighs: on a record his size about 120 queries and a tenth of
 * `boot`'s time, to read the same rows four times. The kernel keeps one of these while the table's declarations stand
 * (`lintTableNow`) and hands it in; a caller with none reads the table as before.
 */
export type LintTable = { known: Known; owners: Owners; held: ReadonlySet<string>; sealed: (register: string) => Map<string, SealedField> };

const frozen = <T>(v: T): T => {
  if (v !== null && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const x of Object.values(v as object)) frozen(x);
  }
  return v;
};

/** The table's declarations read once, as `knownTo`, `ownersTo`, `heldIn` and `sealedEver` read them. */
export function lintTable(sql: Sql): LintTable {
  const known = new Map<string, Record<string, Json>>();
  const owners = new Map<string, string | null>();
  for (const row of sql.all<{ id: string; pack_id: string | null; body: string }>('SELECT id, pack_id, body FROM declaration WHERE superseded_at IS NULL AND retired = 0')) {
    owners.set(row.id, row.pack_id);
    try {
      known.set(row.id, frozen(JSON.parse(row.body) as Record<string, Json>));
    } catch {
      known.set(row.id, frozen({}));
    }
  }
  const sealed = new Map<string, Map<string, SealedField>>();
  return {
    known,
    owners,
    held: new Set(known.keys()),
    sealed: (register) => {
      if (!sealed.has(register)) sealed.set(register, sealedEver(sql, register));
      return sealed.get(register)!;
    },
  };
}

/**
 * Validate a batch against the record as it would be once the batch lands, and write nothing.
 *
 * FOR A PROPOSAL, which is read by a person before it is installed. A declaration the gate would accept and the install
 * would then refuse is a question answered for nothing, so the same checks run when it is filed.
 *
 * `planned` IS THE RECORD TO LAY THE BATCH ON IN PLACE OF THE TABLE. The disabled pack is still read from the table: a
 * plan turns no pack off, and the arranger turns a disabled pack on rather than installing over it (`expand`).
 */
export function lintBatch(sql: Sql, batch: readonly Declaration[], planned?: PlannedRecord, table?: LintTable): Refusal | null {
  const off = disabledPackFault(sql, batch);
  if (off) return off;
  const unplanned = unplannedHolds(batch);
  if (unplanned) return unplanned;
  const known = knownTo(sql, batch, planned, table);
  const owners = ownersTo(sql, batch, planned, table);
  const held = heldIn(sql, planned, table);
  for (const decl of batch) {
    const fault = validate(decl, known, owners, held);
    if (fault) return fault;
  }
  return doorsKept(batch, known);
}

/** The ids the record holds before a batch lands: the table's live declarations, or the plan's. */
function heldIn(sql: Sql, planned?: PlannedRecord, table?: LintTable): ReadonlySet<string> {
  if (planned !== undefined) return new Set(planned.known.keys());
  if (table !== undefined) return table.held;
  return new Set(sql.all<{ id: string }>('SELECT id FROM declaration WHERE superseded_at IS NULL AND retired = 0').map((r) => r.id));
}

function ownersTo(sql: Sql, batch: readonly Declaration[], planned?: PlannedRecord, table?: LintTable): Owners {
  const owners = new Map<string, string | null>(planned?.owners ?? (table?.owners ?? []));
  if (planned === undefined && table === undefined)
    for (const row of sql.all<{ id: string; pack_id: string | null }>(
      'SELECT id, pack_id FROM declaration WHERE superseded_at IS NULL AND retired = 0',
    ))
      owners.set(row.id, row.pack_id);
  /* THE BATCH OVERLAYS THE TABLE, exactly as `knownTo` does — a pack installing a register and a
     rule that writes into it in one call must not refuse itself because the register is not in the
     table yet. */
  for (const decl of batch) owners.set(decl.id, decl.pack ?? null);
  return owners;
}

function knownTo(sql: Sql, batch: readonly Declaration[], planned?: PlannedRecord, table?: LintTable): Known {
  const known = new Map<string, Record<string, Json>>(planned?.known ?? (table?.known ?? []));
  if (planned === undefined && table === undefined)
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
  /* A FIELD ANY VERSION OF A LIST TYPED SECRET OR FILE IS HANDED TO THE LINT AS ONE, AFTER THE BATCH IS LAID OVER, so a
     batch that drops the field and installs a rule naming it is read as the record it leaves. The lint seals what the
     list's `fields` types so, and a retired field may then leave the list while its rows keep the value. Measured: the
     four rules of `retired-secret.test.ts` installed after the drop, and after `pin` came back as text, each of which
     the lint refuses while `pin` is declared secret. `sealedEver` is the reading `rules.ts`'s `sealedOf` makes at run
     time, so the two lines cannot come to seal two sets of fields.

     APPENDED AS RETIRED, AND AFTER THE FIELDS THE LIST DECLARES NOW. Every reader that asks whether a field can be
     written or aggregated passes over a retired one or takes the first entry under an id, so a list that declared `pin`
     again as text still takes `pin` as text there; `flow-lint.ts`'s `hiddenOf` keys its map by id and keeps the last,
     which is this entry. A copy, never the body the batch handed in, which is what gets installed. */
  for (const [id, body] of known) {
    if (!id.startsWith('register.') || !Array.isArray(body.fields)) continue;
    const fields = body.fields as { id?: unknown; type?: unknown; of?: unknown }[];
    const missed = [...(table?.sealed ?? ((r: string) => sealedEver(sql, r)))(id.slice('register.'.length)).values()].filter(
      (was) => !fields.some((f) => f !== null && typeof f === 'object' && f.id === was.id && sealedAs(f) !== null),
    );
    if (missed.length > 0) known.set(id, { ...body, fields: [...body.fields, ...missed.map((was) => ({ ...was, retired: true }))] });
  }
  return known;
}

/** A field as the version of its list that first typed it secret or file declared it: all a reader needs to seal it. */
export type SealedField = { id: string; type: Json; of?: Json };

/**
 * Every field of `register` that any version of its declaration has typed secret or file (`sealedAs`), retired ones
 * included, by id.
 *
 * EVERY VERSION AND NOT THE STANDING ONE, because a retired field may leave the list and the rows written before keep
 * its value: `index.ts`'s `contradicted` passes the drop, "its values were put away on purpose". A declaration row is
 * never edited and each version stays beside its successor with `superseded_at` stamped, so the type every field has
 * had is already in the table, and a record that dropped a secret before this function existed is read the same way as
 * one that drops it after.
 *
 * ONCE SEALED, SEALED, WHATEVER A LATER VERSION TYPES IT. The kernel refuses `secret` retyped to `text` while a row holds
 * a value, and passes the same change by way of a retire; the rows written under the secret keep it, and which rows
 * those are is not known here. A list that wants the name back as text takes a new field, as that refusal says. A field
 * no version ever declared (`flow-secret-verbs.test.ts`'s `old`) is sealed by none.
 *
 * ONE READING FOR BOTH LINES. `rules.ts`'s `sealedOf` asks this at run time and `knownTo` hands it to the lint, so the
 * install and the run cannot disagree about which fields never leave.
 */
export function sealedEver(sql: Sql, register: string): Map<string, SealedField> {
  const sealed = new Map<string, SealedField>();
  for (const { body } of sql.all<{ body: string }>("SELECT body FROM declaration WHERE id = ? AND kind = 'register' ORDER BY version", `register.${register}`)) {
    let fields: unknown;
    try {
      fields = (JSON.parse(body) as { fields?: unknown } | null)?.fields;
    } catch {
      continue;
    }
    if (!Array.isArray(fields)) continue;
    for (const f of fields as unknown[]) {
      if (f === null || typeof f !== 'object') continue;
      const { id, type, of } = f as { id?: unknown; type?: Json; of?: Json };
      if (typeof id === 'string' && !sealed.has(id) && sealedAs({ type, of }) !== null) sealed.set(id, { id, type: type!, ...(of === undefined ? {} : { of }) });
    }
  }
  return sealed;
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
  owners?: Owners,
  held?: ReadonlySet<string>,
): Promise<Result<(sql: Sql, now: number, transaction: <T>(fn: () => T) => T, expect?: Expected | Expected[]) => Result<Installed[]>>> {
  const unplanned = unplannedHolds(batch);
  if (unplanned) return { ok: false, refusal: unplanned };
  for (const decl of batch) {
    const wrong = validate(decl, known, owners, held);
    if (wrong) return { ok: false, refusal: wrong };
  }
  const unread = known === undefined ? null : doorsKept(batch, known);
  if (unread) return { ok: false, refusal: unread };
  const sums = await Promise.all(batch.map((d) => digest(jcs(d.body))));
  return ok((sql, now, transaction, expect) => applyDeclarations(sql, now, batch, sums, transaction, expect));
}

function applyDeclarations(
  sql: Sql,
  now: number,
  batch: readonly Declaration[],
  sums: readonly string[],
  transaction: <T>(fn: () => T) => T,
  expect?: Expected | Expected[],
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

    /* ASKED INSIDE THE TRANSACTION THAT WRITES, so a second write read at the same version cannot pass the check while
       the first is still hashing. A retired declaration is not live, so it reads as 0. */
    /* EVERY MEMBER OF A BUNDLE, not only the one it is filed under: `decide` asks them all, but an install can land
       between it and this transaction while this one hashes. */
    for (const want of expect === undefined ? [] : Array.isArray(expect) ? expect : [expect]) {
      const held = sql.one<{ version: number; body: string; pack_id: string | null }>(
        'SELECT version, body, pack_id FROM declaration WHERE id = ? AND superseded_at IS NULL AND retired = 0 ORDER BY version DESC LIMIT 1',
        want.id,
      );
      if ((held?.version ?? 0) !== want.version)
        return clash<Installed[]>(held?.version ?? 0, held ? { id: want.id, body: JSON.parse(held.body) } : null, held?.pack_id ?? 'in-app');
    }

    for (const [i, decl] of batch.entries()) {
      const checksum = sums[i]!;
      /* EVERY LIVE ROW, retired or not. Filtering `retired = 0` here meant a retired declaration was
         never stamped `superseded_at` when its successor arrived, so a register retired and then
         reinstalled had TWO rows claiming to be current — and a `.brain` replay, which rebuilds the
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
export function retireDeclarations(
  sql: Sql,
  ids: readonly string[],
  transaction: <T>(fn: () => T) => T,
  /** Declarations leaving in the same operation, retired by a later call: a disable turns packs off one at a time. */
  alsoGoing: readonly string[] = [],
  /** The pack a disable was asked to turn off, when this is its retire: the door guard's fix is then `alsoDisable`. */
  disabling?: string,
): Result<number> {
  /* NOR IS THE KERNEL'S REGISTER RETIRED, for the reason `validate` refuses anyone declaring it:
     every agent write resolves to a row of it, and retiring it would leave the record unable to say
     which agent wrote anything. Refused whole, so no other id in the call is retired either. */
  if (ids.includes('register.session'))
    return no<number>('PROVIDES_CONFLICT', "register.session is the kernel's own register, and no pack or person may retire it.", {
      at: 'register.session',
    });
  if (ids.includes('register.instructions'))
    return no<number>('PROVIDES_CONFLICT', "register.instructions is the kernel's own register, and no pack or person may retire it.", {
      at: 'register.instructions',
    });

  /* THE SCOPES GUARD, FOR UNINSTALL AS FOR DISABLE. Uninstall retires through here, and taking out the
     register that holds the projects while a field left in place still points at them would leave
     that field naming projects nothing can resolve. */
  const rows = liveRows(sql);
  const home = rows.find((r) => ids.includes(r.id) && r.kind === 'register' && r.body.scopes !== undefined);
  if (home) {
    const scoped = scopedFieldsLeft(rows, (r) => ids.includes(r.id) || alsoGoing.includes(r.id));
    if (scoped.length > 0)
      return no<number>(
        'SCOPES_IN_USE',
        `${home.id} holds the projects, and ${scoped.join(', ')} still ${scoped.length === 1 ? 'points' : 'point'} at them. Take out the ${scoped.length === 1 ? 'register that declares that field' : 'registers that declare those fields'} in the same call, or keep ${home.id}.`,
        { at: scoped[0]! },
      );
  }

  /* THE DOOR GUARD: a webhook ingest a live pattern names as its `door:` goes with that pattern or not at all. Retired
     alone it answered `ok` and left the pattern naming a door no text can arrive at, the declaration `doorFault`
     refuses at install (`test/retire-door.test.ts`). */
  const going = (id: string): boolean => ids.includes(id) || alsoGoing.includes(id);
  for (const door of ids.filter((id) => id.startsWith('ingest.'))) {
    const naming = rows
      .filter((r) => r.kind === 'ingest' && !going(r.id) && r.body.door === door.slice('ingest.'.length))
      .map((r) => r.id)
      .sort();
    if (naming.length === 0) continue;
    const those = naming.length === 1 ? 'that pattern' : 'those patterns';
    const reads = `${door} is the door ${listed(naming)} ${naming.length === 1 ? 'reads' : 'read'}`;
    if (disabling === undefined)
      return no<number>(
        'DECLARATION_INVALID',
        `${reads}, and retiring it would leave ${those} naming a door nothing arrives at. Retire ${naming.length === 1 ? 'it' : 'them'} in the same call, or keep ${door}.`,
        { at: naming[0]! },
      );
    /* ON THE DISABLE ROAD A RETIRE IS NOT THE CALLER'S TO MAKE: `disablePack` takes packs, and "retire it in the same
       call" named an act it has no argument for (`test/retire-door.test.ts`, red on that sentence). So the pattern's pack is
       named for `alsoDisable`, as `PACK_REQUIRED` names a dependent, and a pattern no pack owns is named to retire first,
       since no `alsoDisable` reaches it. */
    const ownerOf = (id: string): string | null => rows.find((r) => r.id === id)?.owner ?? null;
    const packs = [...new Set(naming.map(ownerOf).filter((p): p is string => p !== null))].sort();
    const loose = naming.filter((id) => ownerOf(id) === null);
    const add = packs.length === 0 ? '' : `Add ${listed(packs)} to alsoDisable to turn ${packs.length === 1 ? 'it' : 'them'} off in the same call`;
    const retire = loose.length === 0 ? '' : `${add === '' ? 'Retire' : 'and retire'} ${listed(loose)} first`;
    return no<number>(
      'DECLARATION_INVALID',
      `${reads}, and turning ${disabling} off would leave ${those} naming a door nothing arrives at. ${[add, retire].filter((s) => s !== '').join(' ')}, or leave ${disabling} on.`,
      { at: naming[0]! },
    );
  }

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

/* ── disabling and enabling a pack ───────────────────────────────────────── */

/** What a disable or an enable did, with a sentence, because a call that changed nothing must say so. */
export type PackToggle = {
  id: string;
  state: 'enabled' | 'disabled';
  changed: boolean;
  /** Every pack this call turned, the one asked for first. Empty on a no-op. */
  packs: string[];
  /** The declarations retired or brought back. */
  declarations: string[];
  said: string;
};

type Tx = <T>(fn: () => T) => T;

/** Carries a refusal out of a transaction, so the transaction rolls back instead of committing half. */
class Rollback extends Error {
  result: Result<unknown>;
  constructor(result: Result<unknown>) {
    super('rolled back');
    this.result = result;
  }
}

/**
 * Who owns a declaration. The pack path writes `pack_id`; the seed installs the first-party packs as
 * plain declarations whose only owner is the body's `pack:`, and People must be able to go off too.
 */
const OWNER = "coalesce(pack_id, json_extract(body, '$.pack'))";

type LiveRow = { id: string; kind: string; owner: string | null; body: Record<string, unknown> };

function liveRows(sql: Sql): LiveRow[] {
  return sql
    .all<{ id: string; kind: string; pack_id: string | null; body: string }>(
      'SELECT id, kind, pack_id, body FROM declaration WHERE superseded_at IS NULL AND retired = 0 ORDER BY id',
    )
    .map((r) => {
      let body: Record<string, unknown> = {};
      try {
        body = JSON.parse(r.body) as Record<string, unknown>;
      } catch {
        /* an unparseable body names nothing, and `knownTo` treats it the same way */
      }
      return { id: r.id, kind: r.kind, owner: r.pack_id ?? (typeof body.pack === 'string' ? body.pack : null), body };
    });
}

/**
 * Where a pack stands.
 *
 * THE DISABLE EVENT IS WHAT SAYS WHICH DECLARATIONS WENT OFF. Retired rows alone cannot: a register
 * an upgrade dropped is also a retired row of the pack, and enabling must not bring that back. And
 * the first-party packs the seed installs have declarations and no `pack` row, so for them the event
 * is the only place the fact can live.
 */
function packStanding(sql: Sql, id: string) {
  const row = sql.one<{ version: string; disabled_at: string | null }>('SELECT version, disabled_at FROM pack WHERE id = ?', id) ?? null;
  const active = sql
    .all<{ id: string }>(`SELECT id FROM declaration WHERE ${OWNER} = ? AND superseded_at IS NULL AND retired = 0 ORDER BY id`, id)
    .map((r) => r.id);
  const last = sql.one<{ kind: string; to_v: string | null }>(
    "SELECT kind, to_v FROM event WHERE target = ? AND target_kind = 'pack' AND kind IN ('retire', 'install', 'uninstall') ORDER BY rowid DESC LIMIT 1",
    `pack:${id}`,
  );
  let wentOff: string[] | null = null;
  if (last?.kind === 'retire' && last.to_v)
    try {
      wentOff = (JSON.parse(last.to_v) as unknown[]).filter((x): x is string => typeof x === 'string');
    } catch {
      wentOff = [];
    }
  const disabled = row ? row.disabled_at !== null : active.length === 0 && wentOff !== null;
  return { row, active, wentOff, disabled, known: row !== null || active.length > 0 || wentOff !== null };
}

/** The fields that say which project a row belongs to, left once `leaving` has gone, as `register.x.field`. */
function scopedFieldsLeft(rows: readonly LiveRow[], leaving: (r: LiveRow) => boolean): string[] {
  const scoped: string[] = [];
  for (const r of rows) {
    if (r.kind !== 'register' || leaving(r)) continue;
    for (const f of Array.isArray(r.body.fields) ? (r.body.fields as Record<string, unknown>[]) : [])
      if (f !== null && typeof f === 'object' && f.scope !== undefined && f.retired !== true) scoped.push(`${r.id}.${String(f.id)}`);
  }
  return scoped;
}

const REGISTER_REF = /^register\.([a-z][a-z0-9_]*)$/;

/** `a`, `a and b`, `a, b and c`: a list as a person reads one, since six packs can go off at once. */
const listed = (items: readonly string[]): string =>
  items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

/** Every register a declaration body leans on: a field's `to:`, and any `register.<id>` it names. */
function namedRegisters(node: unknown, into = new Set<string>()): Set<string> {
  if (typeof node === 'string') {
    const m = REGISTER_REF.exec(node);
    if (m?.[1]) into.add(m[1]);
  } else if (Array.isArray(node)) {
    for (const n of node) namedRegisters(n, into);
  } else if (node !== null && typeof node === 'object') {
    const o = node as Record<string, unknown>;
    if (typeof o.to === 'string' && (o.type === 'ref' || o.type === 'list')) into.add(o.to);
    for (const v of Object.values(o)) namedRegisters(v, into);
  }
  return into;
}

/**
 * A pack's declarations installed and to be installed stay as they were when it was turned off.
 *
 * Upgrading a disabled pack would compute its diff against declarations that are not active, so `WOULD_ORPHAN` would
 * stop meaning what it says. Enable first.
 */
export function disabledPackFault(sql: Sql, batch: readonly Declaration[]): Refusal | null {
  for (const pack of new Set(batch.map((d) => d.pack ?? d.body.pack).filter((p): p is string => typeof p === 'string')))
    if (packStanding(sql, pack).disabled)
      return { code: 'PACK_DISABLED', fix: `${pack} is disabled. Enable it first, then install or upgrade it.`, at: 'pack' };
  return null;
}

/**
 * Turn packs off: their declarations are retired, their `pack` rows stay, and no row is touched.
 *
 * TWO GUARDS BEFORE ANYTHING IS WRITTEN. A pack another active pack leans on is refused, naming the
 * dependents, and `alsoDisable` is how a caller chooses the cascade; nothing cascades unasked. The
 * pack holding the `scopes:` register is refused while any field left on still points at its
 * projects, because scope resolution is built on that one register.
 */
export function disablePack(
  sql: Sql,
  now: number,
  id: string,
  opts: { alsoDisable?: readonly string[]; actor?: string },
  transaction: Tx,
  mint: () => string,
): Result<PackToggle> {
  const asked = [id, ...(opts.alsoDisable ?? [])];
  if (asked.includes('kernel'))
    return no<PackToggle>('PROVIDES_CONFLICT', "kernel is BrainDog's own, and no pack or person may disable it.", { at: 'pack' });

  const standing = new Map(asked.map((p) => [p, packStanding(sql, p)]));
  for (const [p, s] of standing)
    if (!s.known)
      return no<PackToggle>('DECLARATION_UNKNOWN', `${p} is not an installed pack.`, {
        at: p === id ? 'pack' : 'alsoDisable',
      });

  if (standing.get(id)?.disabled)
    return ok({ id, state: 'disabled', changed: false, packs: [], declarations: [], said: `${id} is already disabled, so nothing changed.` });

  const turning = [...new Set(asked)].filter((p) => !standing.get(p)?.disabled);
  const off = new Set(turning);
  const rows = liveRows(sql);

  const owned = new Set(
    rows.filter((r) => r.kind === 'register' && r.owner !== null && off.has(r.owner)).map((r) => r.id.slice('register.'.length)),
  );
  const dependents = new Set<string>();
  for (const r of rows) {
    if (r.owner === null || r.owner === 'kernel' || off.has(r.owner)) continue;
    for (const register of namedRegisters(r.body))
      if (owned.has(register)) {
        dependents.add(r.owner);
        break;
      }
  }
  for (const p of sql.all<{ id: string; manifest: string }>('SELECT id, manifest FROM pack WHERE disabled_at IS NULL')) {
    if (off.has(p.id)) continue;
    try {
      const needs = (JSON.parse(p.manifest) as { requires?: { packs?: unknown } }).requires?.packs;
      if (needs !== null && typeof needs === 'object' && Object.keys(needs).some((k) => off.has(k))) dependents.add(p.id);
    } catch {
      /* a manifest nobody can read declares no dependency anybody can honour */
    }
  }
  if (dependents.size > 0) {
    const named = [...dependents].sort();
    const labelled = named.map((p) => {
      const v = sql.one<{ version: string }>('SELECT version FROM pack WHERE id = ?', p)?.version;
      return v ? `${p} ${v}` : p;
    });
    return no<PackToggle>(
      'PACK_REQUIRED',
      `${listed(turning)} ${turning.length === 1 ? 'is' : 'are'} required by ${listed(labelled)}, which ${named.length === 1 ? 'is' : 'are'} still on. Add ${named.length === 1 ? 'it' : 'them'} to alsoDisable to turn ${named.length === 1 ? 'it' : 'them'} off in the same call, or leave ${id} on.`,
      { at: 'alsoDisable', allowed: named },
    );
  }

  const home = rows.find((r) => r.kind === 'register' && r.owner !== null && off.has(r.owner) && r.body.scopes !== undefined);
  if (home) {
    const scoped = scopedFieldsLeft(rows, (r) => r.owner !== null && off.has(r.owner));
    if (scoped.length > 0)
      return no<PackToggle>(
        'SCOPES_IN_USE',
        `${home.id} holds the projects, and ${scoped.join(', ')} still ${scoped.length === 1 ? 'points' : 'point'} at them. Turn off the packs that declare ${scoped.length === 1 ? 'that field' : 'those fields'} in the same call, or leave ${id} on.`,
        { at: scoped[0]! },
      );
  }

  const at = instant(now);
  const retired: string[] = [];
  try {
    transaction(() => {
      for (const p of turning) {
        const ids = rows.filter((r) => r.owner === p).map((r) => r.id);
        const done = retireDeclarations(
          sql,
          ids,
          transaction,
          rows.filter((r) => r.owner !== null && off.has(r.owner)).map((r) => r.id),
          p,
        );
        if (!done.ok) throw new Rollback(done);
        retired.push(...ids);
        sql.exec('UPDATE pack SET disabled_at = ? WHERE id = ?', at, p);
        /* `retire`, THE KIND FOR DECLARATIONS GOING OUT OF USE, aimed at the pack. Its `to_v` is the
           list enable reads back, so the event is the record of exactly what went off. */
        sql.exec(
          "INSERT INTO event (id, ts, actor, kind, target, target_kind, from_v, to_v) VALUES (?, ?, ?, 'retire', ?, 'pack', ?, ?)",
          mint(),
          at,
          opts.actor ?? 'system',
          `pack:${p}`,
          standing.get(p)?.row?.version ?? null,
          jcs(ids),
        );
      }
    });
  } catch (e) {
    if (e instanceof Rollback) return e.result as Result<PackToggle>;
    throw e;
  }

  return ok({
    id,
    state: 'disabled',
    changed: true,
    packs: turning,
    declarations: retired,
    said: `Disabled ${listed(turning)}:${retired.length} ${retired.length === 1 ? 'declaration' : 'declarations'} retired, and every row under them kept.`,
  });
}

/**
 * Turn a disabled pack back on, through the install path, over the declarations it went off with.
 *
 * NO NEW PLAN AND NO DIFF, because the bodies are the ones already in the table. Each comes back
 * as a new version with the same checksum, which is what `applyDeclarations` does for any retired
 * declaration reinstalled: `declaration.retired` only ever goes 0 to 1 (`41` K21), so the shape's
 * new period of being live is a new row. The pack's version and every entry row are unchanged.
 */
export async function enablePack(
  sql: Sql,
  now: number,
  id: string,
  opts: { actor?: string },
  transaction: Tx,
  mint: () => string,
): Promise<Result<PackToggle & { batch: Declaration[] }>> {
  type Out = PackToggle & { batch: Declaration[] };
  const s = packStanding(sql, id);
  if (!s.known) return no<Out>('DECLARATION_UNKNOWN', `${id} is not an installed pack.`, { at: 'pack' });
  if (!s.disabled)
    return ok({ id, state: 'enabled', changed: false, packs: [], declarations: [], said: `${id} is already enabled, so nothing changed.`, batch: [] });

  const ids =
    s.wentOff ??
    sql.all<{ id: string }>(`SELECT id FROM declaration WHERE ${OWNER} = ? AND superseded_at IS NULL AND retired = 1`, id).map((r) => r.id);
  const batch: Declaration[] = [];
  for (const decl of ids) {
    const row = sql.one<{ kind: string; pack_id: string | null; body: string }>(
      `SELECT kind, pack_id, body FROM declaration WHERE id = ? AND ${OWNER} = ? AND superseded_at IS NULL AND retired = 1`,
      decl,
      id,
    );
    /* `pack_id` AS IT WAS, so a declaration the seed installed comes back owned the way it went off. */
    if (row)
      batch.push({ id: decl, kind: row.kind as DeclKind, body: JSON.parse(row.body) as Record<string, Json>, pack: row.pack_id ?? undefined });
  }

  const staged = await stageDeclarations(batch, knownTo(sql, batch), ownersTo(sql, batch));
  if (!staged.ok) return staged;

  const at = instant(now);
  try {
    transaction(() => {
      const out = staged.value(sql, now, transaction);
      if (!out.ok) throw new Rollback(out);
      sql.exec('UPDATE pack SET disabled_at = NULL WHERE id = ?', id);
      sql.exec(
        "INSERT INTO event (id, ts, actor, kind, target, target_kind, from_v, to_v) VALUES (?, ?, ?, 'install', ?, 'pack', ?, ?)",
        mint(),
        at,
        opts.actor ?? 'system',
        `pack:${id}`,
        s.row?.version ?? null,
        jcs(batch.map((d) => d.id)),
      );
    });
  } catch (e) {
    if (e instanceof Rollback) return e.result as Result<Out>;
    throw e;
  }

  const back = batch.map((d) => d.id);
  return ok({
    id,
    state: 'enabled',
    changed: true,
    packs: [id],
    declarations: back,
    said: `Enabled ${id}: ${back.length} ${back.length === 1 ? 'declaration' : 'declarations'} back, over the rows ${back.length === 1 ? 'it' : 'they'} had.`,
    batch,
  });
}

/* ── a pack's settings: `config:` ────────────────────────────────────────── */

/**
 * The field types a setting may take.
 *
 * A CLOSED SUBSET, AND THE TWO LEFT OUT ARE THE POINT. A `ref` would let a pack configure its way
 * into reading a list it did not declare, and a `file` would put a document in a manifest people
 * share. A `secret` setting holds only a key's label, never the secret (below). What is left is a
 * value a person can read on a settings screen, so `04 §7`'s enumeration of what a pack can do does
 * not grow.
 *
 * A `list` IS A FEW LINES OF TEXT, NOT ONE OF THE RECORD'S LISTS: the words a script matches a bank
 * line against, the labels a rule reads. Each line is checked as a text setting is, and there are at
 * most `LIST_ITEMS_CEILING` of them, so a person still reads the whole value on the settings screen.
 */
/**
 * `secret` IS THE LABEL OF A KEY IN THE RECORD'S KEYS, NEVER THE SECRET (round 1030). An add-on that needs a private
 * address, a calendar's secret ICS link, names the label here and its script fetches it with `ctx.fetch(null, {
 * address: <label> })`: the host opens the key, checks its host against the script's egress and sends, and the script
 * never holds the address (`addressed` in `@braindog/host/script`). The value is checked as a label: a link or a key
 * typed into it is refused, so the secret itself never lands in a setting.
 */
export const CONFIG_TYPES = ['text', 'enum', 'bool', 'money', 'day', 'duration', 'number', 'list', 'secret'] as const;
export type ConfigType = (typeof CONFIG_TYPES)[number];

/**
 * One setting as a manifest declares it, after `readConfig` has checked it. `max` is a `list`'s own
 * ceiling on its lines, at most `LIST_ITEMS_CEILING`, and no other type takes one.
 *
 * `optional: true` IS A `secret` SETTING'S ONLY, AND SAYS THE ADD-ON INSTALLS WITHOUT THE KEY IT NAMES (Calendar 2.1.1,
 * whose ICS link is one of two ways in beside Connect Google). The install then asks nothing about that key while it is
 * missing, and the script that sends it is the one that skips quietly when it is not held. A key that is there but cannot
 * be opened is still refused. Absent, as on every setting written before it, a missing key refuses the install as it always
 * did, and the setting reads exactly as before, so no other pack's checksum moves.
 */
export type ConfigDecl = { type: ConfigType; values?: string[]; max?: number; default?: Json; label?: string; note?: string; optional?: true };

/** A pack's settings as the record holds them: what the manifest declares, and the value each holds now. */
export type PackConfig = { id: string; version: string | null; config: Record<string, ConfigDecl>; values: Record<string, Json> };

const CONFIG_NAME = /^[a-z][a-z0-9_]{0,31}$/;
const CONFIG_KEYS = ['type', 'values', 'max', 'default', 'label', 'note', 'optional'];
const CONFIG_CEILING = 64;
const CONFIG_TEXT_BYTES = 1024;
/** The longest key label a `secret` setting holds, a script's key label's own ceiling (`script.ts`). */
const SECRET_LABEL_BYTES = 40;
const CONFIG_VALUES_CEILING = 64;
/** The most lines a `list` setting holds whatever its `max` says, and the most bytes in one line. */
const LIST_ITEMS_CEILING = 20;
const LIST_ITEM_BYTES = 200;

/** `{{config:<key>}}`, anywhere in a string. The key is checked against the manifest, not here. */
const PLACEHOLDER = /\{\{config:([^{}]*)\}\}/g;

/**
 * A value for one setting, coerced as a field of that type would be, or the refusal a field would get.
 *
 * THE WRITE PATH'S OWN COERCION, so a money setting is `{ amount, currency }` in minor units, a day
 * is a day that exists, a duration is whole seconds and a text is refused when it looks like a key,
 * exactly as a row's field is.
 */
export function configValue(key: string, decl: ConfigDecl, value: unknown, at = `config.${key}`): Result<Json> {
  if (decl.type === 'list') return listValue(key, decl, value, at);
  /* A NUMBER IS A DECIMAL FIELD'S VALUE, the one type a setting names in its own word, because a setting is not a column. */
  const field = { id: key, type: decl.type === 'number' ? 'decimal' : decl.type === 'secret' ? 'text' : decl.type, ...(decl.values === undefined ? {} : { values: decl.values }) } as FieldDecl;
  const out = coerce(field, value, {}, at);
  if (!out.ok) return { ok: false, refusal: out.refusal };
  const values = decl.values ?? [];
  if (decl.type === 'enum' && !values.includes(out.value as string))
    return no<Json>('ENUM_VALUE_UNKNOWN', `The setting ${key} is one of ${values.join(', ')}, and ${JSON.stringify(value)} is not.`, {
      at,
      allowed: values,
    });
  if (decl.type === 'text' && byteLength(out.value as string) > CONFIG_TEXT_BYTES)
    return no<Json>('OUT_OF_BOUNDS', `The setting ${key} holds at most ${CONFIG_TEXT_BYTES} bytes of text.`, { at });
  /* A SECRET SETTING HOLDS A LABEL: short, one line, and never a link or anything that looks like one. */
  if (decl.type === 'secret') {
    const label = String(out.value ?? '');
    if (byteLength(label) > SECRET_LABEL_BYTES || /[\n\r]/u.test(label) || /:\/\/|^(webcal|https?):/iu.test(label.trim()))
      return no<Json>(
        'VALUE_MALFORMED',
        `The setting ${key} is the name of a key in your keys, such as "Calendar address", never the link itself. Put the link in your keys under that name.`,
        { at },
      );
  }
  return ok(out.value);
}

/**
 * A `list` setting's value: lines of text, each trimmed and coerced as a text setting is, none blank.
 *
 * EACH LINE GOES THROUGH THE TEXT FIELD'S OWN COERCION, so a line that looks like a key is refused
 * here exactly as a text setting holding it would be, and a list carries nothing a text cannot.
 */
function listValue(key: string, decl: ConfigDecl, value: unknown, at: string): Result<Json> {
  const most = Math.min(decl.max ?? LIST_ITEMS_CEILING, LIST_ITEMS_CEILING);
  if (!Array.isArray(value))
    return no<Json>('VALUE_MALFORMED', `The setting ${key} is a list, so it holds lines of text, such as ["rent", "rates"].`, { at });
  if (value.length > most) return no<Json>('OUT_OF_BOUNDS', `The setting ${key} holds at most ${most} lines, and this has ${value.length}.`, { at });
  const lines: string[] = [];
  for (const [i, item] of value.entries()) {
    const where = `${at}[${i}]`;
    if (typeof item !== 'string' || item.trim() === '')
      return no<Json>('VALUE_MALFORMED', `Line ${i + 1} of the setting ${key} is empty or is not text, and every line holds some text.`, { at: where });
    const out = coerce({ id: key, type: 'text' } as FieldDecl, item.trim(), {}, where);
    if (!out.ok) return { ok: false, refusal: out.refusal };
    if (byteLength(out.value as string) > LIST_ITEM_BYTES)
      return no<Json>('OUT_OF_BOUNDS', `Line ${i + 1} of the setting ${key} holds at most ${LIST_ITEM_BYTES} bytes of text.`, { at: where });
    lines.push(out.value as string);
  }
  return ok(lines);
}

/** Why a type is not a setting's, said for the three that are left out on purpose and for everything else. */
function configTypeSentence(key: string, type: unknown): string {
  const allowed = `A setting is ${CONFIG_TYPES.slice(0, -1).join(', ')} or ${CONFIG_TYPES[CONFIG_TYPES.length - 1]}.`;
  if (type === 'ref')
    return `The setting ${key} is a ref, and a setting never points at a list, so a pack cannot configure its way into one it did not declare. ${allowed}`;
  if (type === 'secret' || type === 'file')
    return `The setting ${key} is a ${type}, and a manifest is a file people share, so a setting never holds a credential or a file. ${allowed}`;
  if (typeof type === 'string' && (FIELD_TYPES as readonly string[]).includes(type))
    return `The setting ${key} is a ${type}, which a setting does not take. ${allowed}`;
  return `The setting ${key} has the type ${JSON.stringify(type ?? null)}, which is not a type a setting takes. ${allowed}`;
}

/**
 * A manifest's `config:` map, checked, with every default coerced; or the refusal naming what is wrong.
 *
 * THE SAME CHECKS A REGISTER'S FIELD GETS, over a map instead of a list: a name, a type from the
 * closed subset, the values of an enum, and a default that is a legal value of its own type.
 */
export function readConfig(config: unknown): Result<Record<string, ConfigDecl>> {
  if (config === undefined) return ok({});
  if (config === null || typeof config !== 'object' || Array.isArray(config))
    return no('PACK_MALFORMED', 'config is a map of settings, each with a name and a type.', { at: 'config' });
  const entries = Object.entries(config as Record<string, unknown>);
  if (entries.length > CONFIG_CEILING)
    return no('OUT_OF_BOUNDS', `A pack declares at most ${CONFIG_CEILING} settings, and this one declares ${entries.length}.`, { at: 'config' });

  const out: Record<string, ConfigDecl> = {};
  for (const [key, raw] of entries) {
    const at = `config.${key}`;
    if (!CONFIG_NAME.test(key))
      return no('PACK_MALFORMED', `${key} is not a setting name: lower-case letters, digits and underscores, at most 32.`, { at });
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw))
      return no('PACK_MALFORMED', `The setting ${key} is a type and, when it has one, a default.`, { at });
    const said = raw as Record<string, unknown>;
    const stray = Object.keys(said).find((k) => !CONFIG_KEYS.includes(k));
    if (stray !== undefined)
      return no('FIELD_UNKNOWN', `The setting ${key} declares ${stray}, and a setting takes ${CONFIG_KEYS.join(', ')}.`, {
        at: `${at}.${stray}`,
        allowed: CONFIG_KEYS,
      });

    if (typeof said.type !== 'string' || !(CONFIG_TYPES as readonly string[]).includes(said.type))
      return no('CONFIG_TYPE_UNSUPPORTED', configTypeSentence(key, said.type), { at: `${at}.type`, allowed: [...CONFIG_TYPES] });
    const decl: ConfigDecl = { type: said.type as ConfigType };

    if (decl.type === 'enum') {
      const values = said.values;
      if (
        !Array.isArray(values) ||
        values.length === 0 ||
        values.length > CONFIG_VALUES_CEILING ||
        values.some((v) => typeof v !== 'string' || v.trim() === '') ||
        new Set(values).size !== values.length
      )
        return no('VALUE_MALFORMED', `The setting ${key} is an enum, so it lists one to ${CONFIG_VALUES_CEILING} different values.`, {
          at: `${at}.values`,
        });
      decl.values = [...(values as string[])];
    } else if (said.values !== undefined)
      return no('FIELD_UNKNOWN', `The setting ${key} is a ${decl.type}, and only an enum lists values.`, {
        at: `${at}.values`,
        allowed: decl.type === 'list' ? ['type', 'max', 'default', 'label', 'note'] : ['type', 'default', 'label', 'note'],
      });

    if (said.max !== undefined) {
      if (decl.type !== 'list')
        return no('FIELD_UNKNOWN', `The setting ${key} is a ${decl.type}, and only a list has a max.`, { at: `${at}.max`, allowed: ['type', 'default', 'label', 'note'] });
      if (typeof said.max !== 'number' || !Number.isInteger(said.max) || said.max < 1 || said.max > LIST_ITEMS_CEILING)
        return no('OUT_OF_BOUNDS', `The setting ${key}'s max is a whole number from 1 to ${LIST_ITEMS_CEILING}.`, { at: `${at}.max` });
      decl.max = said.max;
    }

    if (said.optional !== undefined) {
      if (decl.type !== 'secret')
        return no('FIELD_UNKNOWN', `The setting ${key} is a ${decl.type}, and only a secret setting is optional.`, { at: `${at}.optional`, allowed: ['type', 'default', 'label', 'note'] });
      if (typeof said.optional !== 'boolean')
        return no('VALUE_MALFORMED', `The setting ${key}'s optional is true when the plugin installs without that key, and false or absent when it needs it.`, { at: `${at}.optional` });
      if (said.optional) decl.optional = true;
    }

    for (const [name, ceiling] of [['label', 80], ['note', 280]] as const) {
      const text = said[name];
      if (text === undefined) continue;
      if (typeof text !== 'string' || text.trim() === '' || byteLength(text) > ceiling)
        return no('VALUE_MALFORMED', `The setting ${key}'s ${name} is text of at most ${ceiling} bytes.`, { at: `${at}.${name}` });
      decl[name] = text;
    }

    if (said.default !== undefined) {
      const value = configValue(key, decl, said.default, `${at}.default`);
      if (!value.ok) return value as Result<Record<string, ConfigDecl>>;
      decl.default = value.value;
    }
    out[key] = decl;
  }
  return ok(out);
}

/**
 * Every `{{config:<key>}}` in a declaration body: the key, where it is, and whether it is the whole string.
 *
 * WHOLE OR PART MATTERS. A string that is exactly one placeholder is replaced by the setting's value as
 * it is, so a money setting lands as `{ amount, currency }`, a bool as `true` and a list as its array.
 * A placeholder inside a longer string is replaced by its text, which a money value does not have and
 * a list's is its lines joined by a comma and a space.
 */
export function configReads(body: unknown): { key: string; at: string; whole: boolean }[] {
  const out: { key: string; at: string; whole: boolean }[] = [];
  const seen = new WeakSet<object>();
  const walk = (node: unknown, at: string): void => {
    if (typeof node === 'string') {
      for (const m of node.matchAll(PLACEHOLDER)) out.push({ key: m[1] ?? '', at, whole: m[0] === node });
      return;
    }
    if (node === null || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) node.forEach((item, i) => walk(item, `${at}[${i}]`));
    else for (const [k, v] of Object.entries(node)) walk(v, at === '' ? k : `${at}.${k}`);
  };
  walk(body, '');
  return out;
}

/**
 * A declaration body with every `{{config:<key>}}` filled from `values`.
 *
 * CALLED WHERE A PACK'S DECLARATIONS ARE PLANNED AND INSTALLED, and nowhere else: the value a
 * declaration is stored with is the value it runs with, and a later change to the setting is read the
 * next time the pack is planned and installed. A key with no value is left as it was written, and
 * `validate` refuses a body that still carries one.
 */
export function fillConfig(body: Json, values: Readonly<Record<string, Json>>): Json {
  if (typeof body === 'string') {
    const whole = /^\{\{config:([^{}]*)\}\}$/.exec(body);
    if (whole && Object.hasOwn(values, whole[1] ?? '')) return values[whole[1] ?? ''] ?? null;
    return body.replace(PLACEHOLDER, (m, key: string) => {
      if (!Object.hasOwn(values, key)) return m;
      const value = values[key];
      /* A LIST INSIDE TEXT READS AS A SENTENCE WOULD SAY IT, "rent, rates, water", and never as its JSON. */
      if (Array.isArray(value)) return value.map((v) => (typeof v === 'string' ? v : JSON.stringify(v))).join(', ');
      return typeof value === 'string' ? value : JSON.stringify(value);
    });
  }
  if (Array.isArray(body)) return body.map((item) => fillConfig(item, values));
  if (body !== null && typeof body === 'object')
    return Object.fromEntries(Object.entries(body).map(([k, v]) => [k, fillConfig(v, values)]));
  return body;
}

/** A `pack` row's manifest, parsed, or `null` for a pack with no row or a manifest nobody can read. */
function manifestOf(sql: Sql, id: string): { version: string; manifest: Record<string, unknown> } | null {
  const row = sql.one<{ version: string; manifest: string }>('SELECT version, manifest FROM pack WHERE id = ?', id);
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.manifest) as unknown;
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? { version: row.version, manifest: parsed as Record<string, unknown> }
      : { version: row.version, manifest: {} };
  } catch {
    return { version: row.version, manifest: {} };
  }
}

/**
 * The declared settings on a manifest, the values somebody set, and the value each setting holds.
 *
 * `set` IS ONLY WHAT A PERSON CHOSE, and `values` is that or the default, or `null`. A plan needs the
 * difference: a chosen value is carried to the next version, and a default is the new version's own.
 */
function settingsOf(manifest: Record<string, unknown>): {
  config: Record<string, ConfigDecl>;
  set: Record<string, Json>;
  values: Record<string, Json>;
} {
  const read = readConfig(manifest.config);
  const config = read.ok ? read.value : {};
  const stored = manifest.config_values;
  const held = stored !== null && typeof stored === 'object' && !Array.isArray(stored) ? (stored as Record<string, Json>) : {};
  const set: Record<string, Json> = {};
  const values: Record<string, Json> = {};
  for (const [key, decl] of Object.entries(config)) {
    if (Object.hasOwn(held, key) && held[key] !== null && held[key] !== undefined) set[key] = held[key];
    values[key] = set[key] ?? decl.default ?? null;
  }
  return { config, set, values };
}

/**
 * A figure with its target read from the setting it names, as the setting holds it now.
 *
 * A TARGET THAT NAMES A SETTING IS READ LIVE (`{ lte: 250000, setting: 'most_out_30d' }`). A placeholder is filled once, when
 * a pack is installed, so a target a person changes later would wait for a reinstall; a named setting is read each time the
 * figure is, from the pack that declares the figure. The number in the target is the one used when that setting cannot be
 * read: no pack row, no such setting, or a value of the wrong kind. A money setting counts in the figure's own currency or
 * the home one, and one typed in another (the home currency before it changed) is converted at the day's rate (`ctx`).
 */
export function liveTarget<T extends { metric: string; format?: unknown; target?: unknown }>(
  sql: Sql,
  decl: T,
  ctx?: Pick<EvalContext, 'asOfMs' | 'nowMs' | 'tz' | 'fx'>,
): T {
  const target = decl.target as Record<string, unknown> | undefined;
  if (!target || typeof target.setting !== 'string') return decl;
  const owner = sql.one<{ pack: string | null }>(
    "SELECT coalesce(pack_id, json_extract(body, '$.pack')) AS pack FROM declaration WHERE id = ? AND superseded_at IS NULL AND retired = 0",
    `metric.${decl.metric}`,
  );
  const m = owner?.pack ? manifestOf(sql, owner.pack) : null;
  if (!m) return decl;
  const { config, values } = settingsOf(m.manifest);
  const said = config[target.setting];
  const value = values[target.setting];
  /* A SETTING NOBODY HAS TYPED IS NO TARGET, not the placeholder the declaration carries beside it: a money ceiling
     starts empty and the figure has no verdict until a person sets one. */
  if (said !== undefined && (value === null || value === undefined)) {
    const { lte: _lte, gte: _gte, ...rest } = target;
    return { ...decl, target: rest };
  }
  const currency = typeof decl.format === 'string' ? /^money\.([A-Z]{3})$/u.exec(decl.format)?.[1] : undefined;
  let bound: number | null = null;
  let typedIn: string | null = null;
  if (said?.type === 'number' && typeof value === 'number' && Number.isFinite(value)) bound = value;
  if (said?.type === 'money' && value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const money = value as { amount?: unknown; currency?: unknown };
    const home = homeCurrency(sql);
    if (typeof money.amount === 'number' && money.currency === currency) bound = money.amount;
    /* OR IN THE HOME CURRENCY, which is what a person whose money is in pounds types a limit in. The target carries its
       currency, and the figure, added up in that currency, is held to it as it is (`metrics.ts` `targetFor`). */
    else if (typeof money.amount === 'number' && typeof money.currency === 'string' && money.currency === home) {
      bound = money.amount;
      typedIn = money.currency;
    } else if (typeof money.amount === 'number' && home !== null && homeFrom(money.currency) !== null && homeFrom(money.currency) === homeBefore(sql, home)) {
      const was = homeFrom(money.currency)!;
      /* OR IN THE HOME CURRENCY AS IT WAS, a ceiling typed in pounds before the record moved to dollars: converted at the
         day's rate into the currency the figure is held in, the one it declares or else the home one. It was dropped, and
         the figure was held to the number written beside the setting instead, whatever the person had typed. With no
         rate, or no currency to hold it in, that number still stands, since a sum in one currency is never read as
         another's. ONLY THE HOME CURRENCY THE RECORD RECORDED BEFORE THIS ONE (`homeBefore`): a limit
         typed in a third currency, which was never the record's, is not floated with the day's rate either. */
      const into = currency ?? home;
      const fx = ctx?.fx?.();
      const day = ctx ? new Date(clockOf(ctx)).toISOString().slice(0, 10) : null;
      const rate = into !== null && fx && day !== null ? rateFor(fx.rates, was, into, day) : null;
      if (into === null || rate === null) return decl;
      bound = convertMinor(money.amount, was, into, rate.rate);
      if (into !== currency) typedIn = into;
    }
  }
  if (bound === null) return decl;
  return { ...decl, target: { ...target, [typeof target.gte === 'number' ? 'gte' : 'lte']: bound, ...(typedIn ? { currency: typedIn } : {}) } };
}

/**
 * The home currency the record had before `home`, as its log recorded the change, or `null`: the `from` of the newest
 * edit of a pack's settings that moved `home_currency` to `home` from another code (`writePackConfig`'s event).
 */
export function homeBefore(sql: Sql, home: string): string | null {
  const row = sql.one<{ was: unknown }>(
    `SELECT json_extract(from_v, '$.${HOME_CURRENCY_SETTING}') AS was FROM event
     WHERE kind = 'edit' AND target_kind = 'pack' AND json_valid(to_v) AND json_valid(from_v) AND json_extract(to_v, '$.${HOME_CURRENCY_SETTING}') = ?
     ORDER BY rowid DESC LIMIT 1`,
    home,
  );
  const was = homeFrom(row?.was ?? null);
  return was !== null && was !== home ? was : null;
}

/**
 * The record's home currency: the `home_currency` setting of whichever enabled pack declares one, first by id.
 *
 * READ EACH TIME A MONEY FIGURE IS, like a target's setting, so a currency chosen on the add-on's settings is held at
 * once. A value that is not a three-letter code is no home currency, and so is a pack that declares none.
 */
export function homeCurrency(sql: Sql): string | null {
  for (const row of sql.all<{ id: string }>('SELECT id FROM pack WHERE disabled_at IS NULL ORDER BY id')) {
    const m = manifestOf(sql, row.id);
    if (!m) continue;
    const { config, values } = settingsOf(m.manifest);
    if (!config[HOME_CURRENCY_SETTING]) continue;
    const home = homeFrom(values[HOME_CURRENCY_SETTING]);
    if (home) return home;
  }
  return null;
}

/**
 * The settings of the use case a record speaks in, or an empty map when it speaks the house voice.
 *
 * THE SAME RULE `@braindog/declare` `speakingPack` AND THE WEB'S `voice.ts` `speaking` KEEP: of the use-case packs switched on,
 * by id, the first set to speak, else the first not set against it, else the first. Read here so what the record sends on its
 * own, a digest, says a list in the words its pages do: Ticket on a team's record, not Task.
 */
export function speakingSettings(sql: Sql): Record<string, Json> {
  const on = sql
    .all<{ id: string }>("SELECT id FROM pack WHERE disabled_at IS NULL AND id LIKE 'usecase-%' ORDER BY id")
    .flatMap((row) => {
      const m = manifestOf(sql, row.id);
      return m ? [{ id: row.id, values: settingsOf(m.manifest).values }] : [];
    });
  const speaks = (p: { values: Record<string, Json> }) => p.values.speaks;
  return (on.find((p) => speaks(p) === true) ?? on.find((p) => speaks(p) !== false) ?? on[0])?.values ?? {};
}

/**
 * The settings somebody chose, by pack id. What a plan carries into the next install of a pack.
 *
 * NOT THE DEFAULTS. A default belongs to the version being installed, so a plan reads it from that
 * version's manifest; only a value a person set outlives the version it was set on.
 */
export function packSettings(sql: Sql, removedSince?: string): Record<string, Record<string, Json>> {
  const out: Record<string, Record<string, Json>> = {};
  for (const row of sql.all<{ id: string }>('SELECT id FROM pack ORDER BY id')) {
    const m = manifestOf(sql, row.id);
    if (!m) continue;
    const { set } = settingsOf(m.manifest);
    if (Object.keys(set).length > 0) out[row.id] = set;
  }
  /* AND WHAT AN UNINSTALL TOOK, INSIDE THE WINDOW, for a pack that is not back yet. A plan reads these as the settings
     somebody chose, so installing it again fills its declarations with them rather than with the defaults. */
  if (removedSince !== undefined)
    for (const row of sql.all<{ pack: string; settings: string }>(
      'SELECT pack, settings FROM pack_removed WHERE removed_at >= ? AND pack NOT IN (SELECT id FROM pack) ORDER BY pack',
      removedSince,
    )) {
      const set = JSON.parse(row.settings) as Record<string, Json>;
      if (Object.keys(set).length > 0) out[row.pack] = set;
    }
  return out;
}

/**
 * How long an uninstalled pack's settings and pending schedules are kept for a reinstall to put back (`pack_removed`).
 * Past it, installing the pack again starts from its defaults, as a first install does.
 */
export const REMOVED_WINDOW_DAYS = 30;

/** The settings a pack row holds, for the stash an uninstall keeps. */
export function chosenSettings(sql: Sql, id: string): Record<string, Json> {
  const m = manifestOf(sql, id);
  return m ? settingsOf(m.manifest).set : {};
}

/**
 * One pack's settings: what its manifest declares, and the value each holds now.
 *
 * A PACK THE SEED OWNS BY ITS BODIES HAS NO MANIFEST, so it declares no settings, and it is still a
 * pack this record has: it answers with an empty map rather than a refusal.
 */
export function readPackConfig(sql: Sql, id: string): Result<PackConfig> {
  const m = manifestOf(sql, id);
  if (m) {
    const { config, values } = settingsOf(m.manifest);
    return ok({ id, version: m.version, config, values });
  }
  if (packStanding(sql, id).known) return ok({ id, version: null, config: {}, values: {} });
  return no<PackConfig>('DECLARATION_UNKNOWN', `${id} is not an installed pack.`, { at: 'id' });
}

/**
 * Set some of a pack's settings, each checked against its declaration, in one transaction with one event.
 *
 * NOTHING IS REINSTALLED HERE. A declaration keeps the value it was installed with, and the new value
 * is read the next time the pack is planned and installed: a setting that changed what a rule does in
 * the middle of somebody's write would be a declaration change nobody approved. `null` puts a setting
 * back to its default. The event is an `edit` aimed at the pack, with the settings before and after.
 */
export function writePackConfig(
  sql: Sql,
  now: number,
  id: string,
  values: unknown,
  opts: { actor?: string; batch?: string },
  transaction: Tx,
  mint: () => string,
): Result<PackConfig & { changed: string[]; said: string }> {
  type Out = PackConfig & { changed: string[]; said: string };
  const current = readPackConfig(sql, id);
  if (!current.ok) return current as Result<Out>;
  if (values === null || typeof values !== 'object' || Array.isArray(values) || Object.keys(values).length === 0)
    return no<Out>('REQUIRED_MISSING', 'values is a map of setting names to the value each should hold.', { at: 'values' });

  const { config } = current.value;
  const declared = Object.keys(config);
  const m = manifestOf(sql, id);
  const set: Record<string, Json> = m ? { ...settingsOf(m.manifest).set } : {};
  const before = { ...set };
  for (const [key, raw] of Object.entries(values as Record<string, unknown>)) {
    const decl = Object.hasOwn(config, key) ? config[key] : undefined;
    if (decl === undefined)
      return no<Out>(
        'FIELD_UNKNOWN',
        declared.length === 0 ? `${id} declares no settings.` : `${id} has no setting called ${key}. It has ${declared.join(', ')}.`,
        { at: `values.${key}`, allowed: declared },
      );
    if (raw === null) {
      delete set[key];
      continue;
    }
    const value = configValue(key, decl, raw, `values.${key}`);
    if (!value.ok) return value as Result<Out>;
    set[key] = value.value;
  }

  const next: Record<string, Json> = Object.fromEntries(declared.map((k) => [k, set[k] ?? config[k]?.default ?? null]));
  const changed = declared.filter(
    (k) => Object.hasOwn(set, k) !== Object.hasOwn(before, k) || jcs(set[k] ?? null) !== jcs(before[k] ?? null),
  );
  if (changed.length === 0 || !m)
    return ok({ ...current.value, changed: [], said: `${id}'s settings already hold those values, so nothing changed.` });

  const { config_values: _was, ...rest } = m.manifest;
  const manifest = Object.keys(set).length > 0 ? { ...rest, config_values: set } : rest;
  const at = instant(now);
  transaction(() => {
    sql.exec('UPDATE pack SET manifest = ? WHERE id = ?', jcs(manifest as Json), id);
    sql.exec(
      "INSERT INTO event (id, ts, actor, kind, target, target_kind, from_v, to_v, batch) VALUES (?, ?, ?, 'edit', ?, 'pack', ?, ?, ?)",
      mint(),
      at,
      opts.actor ?? 'system',
      `pack:${id}`,
      jcs(Object.fromEntries(changed.map((k) => [k, current.value.values[k] ?? null])) as Json),
      jcs(Object.fromEntries(changed.map((k) => [k, next[k] ?? null])) as Json),
      opts.batch ?? null,
    );
  });

  return ok({
    ...current.value,
    values: next,
    changed,
    said: `Saved ${listed(changed)} for ${id}. ${changed.length === 1 ? 'It is' : 'They are'} read the next time ${id} is planned and installed.`,
  });
}

/**
 * EVERY VALUE THE GRAMMAR ITSELF NAMES, joined from the lists above: a format, a bucket, a tone, a channel, a card's
 * role, a computed source and the rest. A word here is the product's and never a person's, so a shape copy keeps it
 * (`shape.ts`): scrambled, `format: days` in his own declaration read as no format, and the look on the scratch record
 * refused the figure.
 */
export const GRAMMAR_VALUES: readonly string[] = [
  ...CHANNELS, ...FORMATS, ...COMPARE, ...BUCKETS, ...CARD_ROLES, ...TONES, ...Object.keys(SOURCE_MODULES), ...LOOK_LISTS,
  ...CHANNELS_IN, ...SIGNED_KINDS, ...ACTION_PLACEHOLDERS, ...TIME_FORMATS, ...CALL_TRIGGERS, ...ANCHORS,
  ...FETCH_FORMATS, ...REPEAT_READ, ...HAND_PARTS, ...WIDEN, ...SAME,
];

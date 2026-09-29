/**
 * The pattern builder's draft: the rule a person is making, held as the few things the screens let her change, and
 * turned into the ingest declaration the record installs.
 *
 * THE BUILDER CHANGES FOUR THINGS AND KEEPS EVERYTHING ELSE. The list the rows go to, what each field is read by, the
 * match, and how sure the rule is. A proposal Slash or an agent drafted may carry a skip list, a dedupe key or a door,
 * and those ride along untouched in `kept`, so opening a proposal in the builder and saving it never drops a line the
 * person was not shown.
 *
 * THE MATCH IS A SENTENCE OF CONDITIONS, each "the sender is ..." or "the message contains ...", all of which must hold.
 * A match the builder cannot say that way (an "any", a "none", another test) is kept whole and said as it is, and the
 * person may replace it with conditions of her own; it is never rewritten behind her.
 *
 * NO PATTERN TEXT ANYWHERE. What a field is read by comes from `anchorsFor`, cut out of her own samples, and the one
 * thing typed here is a value: a fallback, or the words a condition compares with.
 *
 * PLAIN TYPESCRIPT, loaded by the route and by any test in plain Node.
 */

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
type Row = Record<string, unknown>;
const isRow = (v: unknown): v is Row => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The four things about an arrival a condition may ask, of the seven a match can name. */
export const ASKS = ['from', 'to', 'subject', 'body'] as const;
export type Ask = (typeof ASKS)[number];

/** The two tests a condition may make, both of which the inbox's schema takes. */
export const TESTS = ['is', 'contains'] as const;
export type Test = (typeof TESTS)[number];

/** One condition: "the sender is bank@example.com". */
export type Condition = { ask: Ask; test: Test; value: string };

/** One field and what it is read by: an extractor, as the record takes it. */
export type Reading = { field: string; how: Json };

export type Draft = {
  /** The ingest's name, which is its id without `ingest.`, and never on screen. */
  name: string;
  channel: string;
  register: string;
  readings: Reading[];
  /** The conditions, or `null` when the match is one the builder cannot say (kept in `match`). */
  conditions: Condition[] | null;
  match: Json | null;
  confidence: 'proposed' | 'exact' | 'needs-review';
  /** Every other key of the body and of `writes`, kept as it came. */
  kept: Row;
  keptWrites: Row;
};

/** The most readings one rule holds, which is more fields than a list declares. */
export const READINGS_MOST = 40;

/** A name from a sender, in the letters an id takes: `alerts@hsbc.co.uk` is `hsbc_co_uk`. */
export function nameFrom(from: string, now: number): string {
  const at = from.lastIndexOf('@');
  const host = (at >= 0 ? from.slice(at + 1) : from).toLowerCase();
  let out = '';
  for (const ch of host) out += (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') ? ch : '_';
  const trimmed = out.split('_').filter(Boolean).join('_').slice(0, 32);
  const lead = trimmed !== '' && trimmed[0]! >= 'a' && trimmed[0]! <= 'z' ? trimmed : `from_${trimmed}`;
  return `${lead === 'from_' ? 'pattern' : lead}_${now.toString(36)}`;
}

/** A condition from a match leaf, or `null` when the leaf is not one the builder can say. */
function conditionOf(leaf: unknown): Condition | null {
  if (!isRow(leaf) || typeof leaf.field !== 'string' || !(ASKS as readonly string[]).includes(leaf.field)) return null;
  const keys = Object.keys(leaf).filter((k) => k !== 'field');
  if (keys.length !== 1) return null;
  const test = keys[0]!;
  const value = leaf[test];
  if (!(TESTS as readonly string[]).includes(test) || typeof value !== 'string') return null;
  return { ask: leaf.field as Ask, test: test as Test, value };
}

/** The conditions a match says, or `null` when it says something the builder cannot draw as conditions. */
export function conditionsOf(match: unknown): Condition[] | null {
  if (match === undefined || match === null) return [];
  const leaves = isRow(match) && Array.isArray(match.all) ? match.all : [match];
  const out: Condition[] = [];
  for (const leaf of leaves) {
    const c = conditionOf(leaf);
    if (!c) return null;
    out.push(c);
  }
  return out;
}

/** The match a list of conditions is: nothing for none, the leaf for one, and `all` of them for more. */
export function matchOf(conditions: readonly Condition[]): Json | null {
  const leaves = conditions.filter((c) => c.value.trim() !== '').map((c) => ({ field: c.ask, [c.test]: c.value.trim() }) as Json);
  if (leaves.length === 0) return null;
  return leaves.length === 1 ? leaves[0]! : { all: leaves };
}

/** A fresh draft for samples from one sender, matching that sender when every sample shares it. */
export function freshDraft(samples: readonly { from: string; channel: string | null }[], register: string, now: number): Draft {
  const froms = new Set(samples.map((s) => s.from).filter(Boolean));
  const from = froms.size === 1 ? [...froms][0]! : '';
  const channel = samples.find((s) => s.channel !== null)?.channel ?? 'email';
  return {
    name: nameFrom(from || 'pattern', now),
    channel,
    register,
    readings: [],
    conditions: from ? [{ ask: 'from', test: 'is', value: from }] : [],
    match: null,
    confidence: 'proposed',
    kept: {},
    keptWrites: {},
  };
}

/**
 * A draft from an ingest a proposal carries, bare or as its declaration, or `null` when it is not one the builder can
 * open (it reads a JSON answer by paths, or routes its rows to more than one list).
 */
export function draftOf(ingest: unknown, now: number): Draft | null {
  const body = isRow(ingest) && ingest.kind === 'ingest' && isRow(ingest.body) ? ingest.body : isRow(ingest) ? ingest : null;
  if (!body || body.map !== undefined) return null;
  const { ingest: name, channel, match, extract, writes, ...kept } = body;
  const w = isRow(writes) ? writes : {};
  const { register, confidence, ...keptWrites } = w;
  if (typeof register !== 'string') return null;
  const readings = isRow(extract) ? Object.entries(extract).map(([field, how]) => ({ field, how: how as Json })) : [];
  const conditions = conditionsOf(match);
  return {
    name: typeof name === 'string' && name !== '' ? name : nameFrom('pattern', now),
    channel: typeof channel === 'string' ? channel : 'email',
    register,
    readings: readings.slice(0, READINGS_MOST),
    conditions,
    match: conditions === null ? (match as Json) : null,
    confidence: confidence === 'exact' || confidence === 'needs-review' ? confidence : 'proposed',
    kept,
    keptWrites,
  };
}

/** The ingest's body: the kept keys, then the four the builder owns, as `arrive` reads them. */
export function bodyOf(draft: Draft, confidence: Draft['confidence'] = draft.confidence): Row {
  const extract: Row = {};
  for (const r of draft.readings) extract[r.field] = r.how;
  const match = draft.conditions === null ? draft.match : matchOf(draft.conditions);
  return {
    ...draft.kept,
    ingest: draft.name,
    channel: draft.channel,
    ...(match === null ? {} : { match }),
    extract,
    writes: { ...draft.keptWrites, register: draft.register, confidence },
  };
}

/** The declaration the rule installs as, which `setDeclaration` takes and a `pattern` proposal carries. */
export function declarationOf(draft: Draft, confidence: Draft['confidence'] = draft.confidence): { id: string; kind: 'ingest'; body: Row } {
  return { id: `ingest.${draft.name}`, kind: 'ingest', body: bodyOf(draft, confidence) };
}

/** The draft with one field read by `how`, replacing what read it before. */
export function withReading(draft: Draft, field: string, how: Json): Draft {
  const readings = draft.readings.some((r) => r.field === field)
    ? draft.readings.map((r) => (r.field === field ? { field, how } : r))
    : [...draft.readings, { field, how }].slice(0, READINGS_MOST);
  return { ...draft, readings };
}

/** The draft with `how` as another way to read a field: tried after the ways it already has. */
export function withAnotherWay(draft: Draft, field: string, how: Json): Draft {
  const was = draft.readings.find((r) => r.field === field)?.how;
  if (was === undefined) return withReading(draft, field, how);
  const arms = isRow(was) && Array.isArray(was.first) ? [...was.first] : [was];
  if (arms.some((a) => JSON.stringify(a) === JSON.stringify(how))) return draft;
  return withReading(draft, field, { first: [...arms, how] });
}

/** The draft with a value to write when a field's reading finds nothing, replacing any fallback it had. */
export function withFallback(draft: Draft, field: string, value: Json): Draft {
  const was = draft.readings.find((r) => r.field === field)?.how;
  if (was === undefined) return draft;
  const of = isRow(was) && isRow(was.default) ? (was.default.of as Json) : was;
  return withReading(draft, field, { default: { value, of } });
}

export function withoutReading(draft: Draft, field: string): Draft {
  return { ...draft, readings: draft.readings.filter((r) => r.field !== field) };
}

/** The draft with one more condition, when it has conditions to add to and does not hold this one already. */
export function withCondition(draft: Draft, c: Condition): Draft {
  const had = draft.conditions ?? [];
  if (had.some((h) => h.ask === c.ask && h.test === c.test && h.value === c.value)) return draft;
  return { ...draft, conditions: [...had, c], match: null };
}

/** A fallback as the field's type takes it: a number for a number, the words otherwise, `null` for nothing usable. */
export function fallbackValue(said: string, type: string | undefined): Json | null {
  const text = said.trim();
  if (text === '') return null;
  if (type === 'int' || type === 'integer' || type === 'number' || type === 'decimal') {
    /* DIGITS, A POINT AND A SIGN, AND NOTHING `Number` WOULD READ AS SOMETHING ELSE: `0x10` is not sixteen here. */
    if (!/^-?\d+(\.\d+)?$/u.test(text)) return null;
    return Number(text);
  }
  if (type === 'money' || type === 'day' || type === 'date') return null;
  return text;
}

/** Whether a field of this type can take a fallback typed in the builder. */
export const takesFallback = (type: string | undefined): boolean => type !== 'money' && type !== 'day' && type !== 'date';

/** The samples and a proposed ingest, as the builder's address carries them. */
export type Opened = { samples: string[]; ingest: unknown };

/** The builder's address for samples and, when a proposal is opened, the ingest it proposes. */
export function builderPath(samples: readonly string[], ingest?: unknown): string {
  const q = new URLSearchParams();
  q.set('samples', samples.join(','));
  if (ingest !== undefined) q.set('ingest', JSON.stringify(ingest));
  return `/inbox/pattern?${q.toString()}`;
}

/** What the builder's address carries: the samples, at most ten, and a proposed ingest when there is one. */
export function openedFrom(search: URLSearchParams, most: number): Opened {
  const samples = (search.get('samples') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '' && s.length <= 64)
    .slice(0, most);
  let ingest: unknown = undefined;
  const said = search.get('ingest');
  if (said)
    try {
      ingest = JSON.parse(said);
    } catch {
      ingest = undefined;
    }
  return { samples: [...new Set(samples)], ingest };
}

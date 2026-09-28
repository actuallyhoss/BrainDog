/**
 * The ingest pattern builder, the record's half: `tryPattern` and `anchorsFor` (`loop/finish/platform.md` §4.0 T,
 * `loop/finish/contracts.md` rows `tryPattern` and `anchorsFor`).
 *
 * A PERSON MAKES A RULE BY POINTING, NEVER BY WRITING ONE. The builder shows a few messages that arrived alike; she
 * selects the amount in one of them and the record answers the ways it could be found again (`anchorsFor`), each scored
 * against every sample, so "after `Amount:`" arrives with "3 of 3" beside it and she picks one. No pattern text is taken
 * from her anywhere, and no regular expression exists on either side: an anchor is a literal cut out of her own sample.
 *
 * THE DRY RUN IS THE KERNEL'S OWN READING. Every field is read by `extractOutcome` (the `resolve` `arrive` files with),
 * over the text `arrive` reads (the body, after the same `normalise`), with the readers the record hands the kernel
 * (`createRecordApi`), and the match by `evaluate` over `INBOX_RAW`, the same seven names `arrive` builds. Nothing is
 * written: `write` refuses, and no id is minted, so a try is a read an owner can repeat as often as she likes.
 *
 * `strip:` IS READ HERE AS `arrive` READS IT. `stripOf` and `stripped` are not exported from the kernel's index, so the
 * cut is written below over the same fold, longest prefix first, with the same ceiling on the walk.
 */

import type { Refusal, Result, Sql } from '@braindog/ports';
import { no, ok } from '@braindog/ports';
import { exponentOf, extractOutcome, type Extractor, type IngestDeps, type Json } from '@braindog/kernel';
import { matchLiterals, normalise, parseDate, scanDates, scanDecimals, scanInts, scanMoney, type CurrencyTable } from '@braindog/extract';
import { evaluate, INBOX_RAW, jsonPath, type Predicate } from '@braindog/where';

/** The most samples one try or one anchor search reads, counting pasted ones: `POST /api/slash/pattern`'s ceiling. */
export const SAMPLES_MOST = 10;

/** The most characters of one pasted sample, so a paste box cannot hand the reader a whole mailbox. */
export const PASTED_CHARS_MOST = 20_000;

/** The most candidates `anchorsFor` answers, best first. Past this a person is reading a list, not choosing. */
export const ANCHORS_MOST = 8;

/** The most words either side of a selection an anchor is cut from. Longer is a sentence, not a landmark. */
const ANCHOR_WORDS_MOST = 3;

/** The most characters of one anchor, so a line with no spaces cannot become a literal the length of the line. */
const ANCHOR_CHARS_MOST = 40;

/** The most rows one `lookup` reads per sample, a ceiling on the walk that `arrive`'s own reader leaves to the list. */
const LOOKUP_ROWS_MOST = 5_000;

/** The most rowsets read to say how many of a pattern's arrivals were accepted. */
const WAITED_READ_MOST = 1_000;

/** `arrive`'s ceiling on a `strip:` walk (`STRIP_MOST` in `kernel/src/ingest.ts`). */
const STRIP_MOST = 16;

/**
 * The date formats a selection is tried against, in the token grammar `date:` takes (`extract/src/date.ts`).
 *
 * BOTH ORDERS OF DAY AND MONTH, NEVER A GUESS BETWEEN THEM. `03/04/2026` reads either way, so both candidates are offered
 * and scored; a sample with a day past the twelfth is what tells them apart, and the person sees which read all three.
 */
const DATE_FORMATS = [
  'DD/MM/YYYY', 'MM/DD/YYYY', 'D/M/YYYY', 'M/D/YYYY', 'DD/MM/YY', 'MM/DD/YY', 'YYYY-MM-DD', 'DD-MM-YYYY', 'DD.MM.YYYY',
  'D MMM YYYY', 'DD MMM YYYY', 'DD-MMM-YYYY', 'MMM D, YYYY', 'DD-MMM-YY', 'D MMM', 'DD MMM',
] as const;

/** One sample as the builder reads it: an arrival from the inbox by its id, or a message pasted into the builder. */
export type Sample = { key: string; channel: string | null; from: string; to: string; subject: string; body: string; ts: string };

/** One field of one sample, read: the typed value, and the text it was cut from. */
export type Cell = { ok: boolean; value: Json | null; raw: string | null };

/** `tryPattern`'s answer: which samples the match claims, and every field read from every sample. */
export type Tried = {
  claims: boolean[];
  fields: { field: string; from: 'extract' | 'map'; how: Json; cells: Cell[] }[];
  /**
   * How many of the rowsets this pattern opened were accepted, when it is installed under the name it carries: the
   * "7 of 10 accepted" the builder shows beside "Trust it now". `null` for a pattern nothing has filed yet.
   */
  waited: { accepted: number; of: number } | null;
};

/** One way to find a selection again, with how many samples it reads and what it read in the one selected from. */
export type Anchor = { how: Json; hits: number; of: number; value: Json | null };

type Row = Record<string, unknown>;
const isRow = (v: unknown): v is Row => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Every currency the platform knows, with its exponent, as `createRecordApi` builds the table its money reader takes. */
const CURRENCIES: CurrencyTable = Object.fromEntries(
  Intl.supportedValuesOf('currency').map((code) => [code, { exponent: exponentOf(code) }]),
);

/** `parseDate` in the seam's shape: `null` for no day, and never a throw for a format the grammar refuses. */
const readDay = (text: string, format: string): string | null => {
  try {
    return parseDate(text, format) ?? null;
  } catch {
    return null;
  }
};

/** `scanDates` the same way: a format that does not compile reads nothing rather than taking the try down. */
const readDates = (text: string, format: string): string[] => {
  try {
    return scanDates(text, format);
  } catch {
    return [];
  }
};

/**
 * What the kernel's reader is handed for a try: the record's readers, the record's storage for a `lookup`, and a write
 * that refuses, so a form that somehow reached for one could not file anything.
 *
 * `reads` IS THE CALLER'S, and a `lookup` into a list she may not read finds no row there, which is what a pattern of
 * hers would find at arrival if the list were not hers to read.
 */
export function readerFor(sql: Sql, reads: (register: string) => boolean): IngestDeps {
  return {
    sql,
    ingests: () => [],
    schemaOf: () => null,
    write: () => no('FORBIDDEN', 'A try writes nothing.', { at: 'ingest' }),
    rows: (register, by) => {
      if (!reads(register)) return [];
      let path: string;
      try {
        path = jsonPath(by);
      } catch {
        return [];
      }
      return sql
        .all<{ id: string; value: unknown }>(
          `SELECT id, json_extract(fields, '${path}') AS value FROM entry WHERE register = ? AND deleted_at IS NULL LIMIT ?`,
          register,
          LOOKUP_ROWS_MOST,
        )
        .flatMap((r) => (r.value === null || r.value === undefined ? [] : [{ id: r.id, value: String(r.value) }]));
    },
    literals: matchLiterals,
    dates: readDates,
    day: readDay,
    normalise,
    numbers: {
      money: (text, declared) => scanMoney(text, CURRENCIES, declared),
      int: scanInts,
      decimal: scanDecimals,
    },
    mint: () => 'try',
    allocate: () => 0,
    nowMs: 0,
  };
}

/**
 * The samples named, read out of the inbox, then the pasted ones after them in the order given.
 *
 * AN ERASED ARRIVAL HAS NO BODY, and it is read as an empty one rather than refused, so a sample somebody erased while
 * the builder was open reads as a message that says nothing.
 */
export function samplesOf(sql: Sql, ids: readonly string[], pasted: readonly string[]): Result<Sample[]> {
  const out: Sample[] = [];
  for (const id of ids) {
    const row = sql.one<{ id: string; ts: string; channel: string; headers: string | null; body: string | null }>(
      'SELECT id, ts, channel, headers, body FROM inbox_raw WHERE id = ?',
      id,
    );
    if (!row) return no('REF_UNKNOWN', 'One of the samples is not in the inbox any more. Take it out and try again.', { at: 'samples' });
    let headers: Row = {};
    try {
      const parsed: unknown = JSON.parse(row.headers ?? '{}');
      if (isRow(parsed)) headers = parsed;
    } catch {
      headers = {};
    }
    const said = (key: string): string => (typeof headers[key] === 'string' ? (headers[key] as string) : '');
    out.push({ key: row.id, channel: row.channel, from: said('from'), to: said('to'), subject: said('subject'), body: row.body ?? '', ts: row.ts });
  }
  pasted.forEach((body, i) => out.push({ key: `paste:${i}`, channel: null, from: '', to: '', subject: '', body, ts: '' }));
  return ok(out);
}

/**
 * The arguments both methods share, checked: 1 to `SAMPLES_MOST` samples in all, ids as text, pasted text bounded.
 */
export function samplesAsked(args: Row): Result<{ ids: string[]; pasted: string[] }> {
  const ids: unknown = args.samples ?? [];
  const pasted: unknown = args.pasted ?? [];
  if (!Array.isArray(ids) || !ids.every((s) => typeof s === 'string' && s.length > 0 && s.length <= 64))
    return no('VALUE_MALFORMED', 'The samples are the arrivals it is tried on, named by their ids.', { at: 'samples' });
  if (!Array.isArray(pasted) || !pasted.every((s) => typeof s === 'string' && s.length <= PASTED_CHARS_MOST))
    return no('VALUE_MALFORMED', `A pasted sample is the text of one message, at most ${PASTED_CHARS_MOST} characters.`, { at: 'pasted' });
  const n = ids.length + pasted.length;
  if (n === 0) return no('REQUIRED_MISSING', 'A pattern is tried on at least one message.', { at: 'samples' });
  if (n > SAMPLES_MOST) return no('OUT_OF_BOUNDS', `A pattern is tried on at most ${SAMPLES_MOST} messages at once.`, { at: 'samples' });
  return ok({ ids: [...new Set(ids as string[])], pasted: pasted as string[] });
}

/** An ingest's body, whether it came bare or wrapped as the declaration it installs as (`{ id, kind, body }`). */
export function bodyOf(ingest: unknown): Row | null {
  if (!isRow(ingest)) return null;
  if (ingest.kind === 'ingest' && isRow(ingest.body)) return ingest.body;
  return ingest;
}

/** The seven names a `match:` asks about, as `arrive` builds them for one arrival. */
function arrivalOf(s: Sample, channel: unknown): Row {
  return {
    channel: s.channel ?? (typeof channel === 'string' ? channel : ''),
    from: s.from,
    to: s.to,
    subject: s.subject,
    body: s.body,
    state: 'untriaged',
    ts: s.ts,
  };
}

/** Whether the pattern would take this sample: its channel, its `match:`, and none of its `skip:` rules. */
function claims(body: Row, s: Sample): boolean {
  if (s.channel !== null && typeof body.channel === 'string' && s.channel !== body.channel) return false;
  const fields = arrivalOf(s, body.channel);
  if (body.match !== undefined && !evaluate(body.match as Predicate, fields, INBOX_RAW)) return false;
  const skip = Array.isArray(body.skip) ? body.skip : [];
  return !skip.some((rule) => isRow(rule) && evaluate(rule.when as Predicate, fields, INBOX_RAW));
}

/** A field's declared form without its `strip:`, and the prefixes it lists (`stripOf` in the kernel). */
function unstrip(declared: unknown): { form: Extractor; strip: string[] | null } {
  if (!isRow(declared) || !Object.hasOwn(declared, 'strip')) return { form: declared as Extractor, strip: null };
  const { strip, ...form } = declared;
  const listed = Array.isArray(strip) ? strip.filter((p): p is string => typeof p === 'string' && p.trim() !== '').slice(0, STRIP_MOST) : [];
  return { form: form as unknown as Extractor, strip: listed };
}

/** The ASCII fold the kernel's anchors match over, which keeps every length (`fold` in `kernel/src/ingest.ts`). */
const fold = (text: string): string => {
  let out = '';
  for (const ch of text) out += ch >= 'A' && ch <= 'Z' ? ch.toLowerCase() : ch;
  return out;
};

/** A value with the listed prefixes cut off, longest first, as `stripped` cuts it. */
function cut(value: string, prefixes: readonly string[]): string {
  const longest = [...prefixes].sort((a, b) => b.length - a.length);
  let out = value.trim();
  for (let walked = 0; walked < STRIP_MOST; walked += 1) {
    const hit = longest.find((p) => fold(out).startsWith(fold(p)));
    if (hit === undefined) break;
    out = out.slice(hit.length).trim();
  }
  return out.split(/\s+/u).filter(Boolean).join(' ');
}

/** The anchors a form carries, on itself or inside its one value form, or `null` when it carries none. */
function anchorsOf(form: unknown): Row | null {
  if (!isRow(form)) return null;
  const pick = (from: Row): Row | null => {
    const out: Row = {};
    for (const key of ['after', 'before', 'between'] as const) if (from[key] !== undefined) out[key] = from[key];
    return Object.keys(out).length > 0 ? out : null;
  };
  const own = pick(form);
  if (own) return own;
  const inner = Object.entries(form).find(([key]) => key !== 'note')?.[1];
  return isRow(inner) ? pick(inner) : null;
}

/**
 * The text a field's value was cut from in one sample, for the hover and the long press: the same anchors read as
 * `text`. A `first:` answers with the arm that read, and a form with no anchor has no slice to show.
 */
function rawOf(deps: IngestDeps, form: unknown, text: string, depth = 0): string | null {
  if (!isRow(form) || depth > 3) return null;
  if (Array.isArray(form.first)) {
    for (const arm of form.first) if (extractOutcome(deps, arm as Extractor, text).value !== null) return rawOf(deps, arm, text, depth + 1);
    return null;
  }
  if (isRow(form.nth)) return rawOf(deps, form.nth.of, text, depth + 1);
  if (isRow(form.default)) return rawOf(deps, form.default.of, text, depth + 1);
  const anchors = anchorsOf(form);
  if (!anchors) return null;
  const got = extractOutcome(deps, { text: anchors } as unknown as Extractor, text).value;
  return typeof got === 'string' ? got : null;
}

/** One field of one sample, read by the kernel's reader and cut by its `strip:`. */
function cellOf(deps: IngestDeps, declared: unknown, text: string): Cell {
  const { form, strip } = unstrip(declared);
  const got = extractOutcome(deps, form, text);
  const value = strip === null || typeof got.value !== 'string' ? got.value : cut(got.value, strip) || null;
  return { ok: value !== null && got.outcome !== 'ambiguous', value, raw: rawOf(deps, form, text) };
}

/**
 * How many of the rowsets a pattern opened were accepted, read from the suggestions its name opened.
 *
 * ACCEPTED IS RESOLVED AS ADDRESSED, the word `confirmedTail` reads as a person's yes to a rowset.
 */
function waitedOf(sql: Sql, name: unknown): Tried['waited'] {
  if (typeof name !== 'string' || name === '') return null;
  const got = sql.one<{ n: number; yes: number | null }>(
    `SELECT COUNT(*) AS n, SUM(CASE WHEN status = 'resolved' AND resolved_as = 'addressed' THEN 1 ELSE 0 END) AS yes
       FROM (SELECT status, resolved_as FROM suggestion WHERE body_kind = 'rowset' AND opened_by = ? ORDER BY opened_at DESC LIMIT ?)`,
    `ingest:${name}`,
    WAITED_READ_MOST,
  );
  const of = Number(got?.n ?? 0);
  return of === 0 ? null : { accepted: Number(got?.yes ?? 0), of };
}

/**
 * The dry run: which samples the pattern claims, and every field it reads from each, writing nothing.
 *
 * A `map:` FIELD IS LISTED AND NOT READ. The builder makes patterns over the words of a message, and a `map:` reads a
 * JSON answer by paths through a reader the kernel's index does not export; its cells say they read nothing rather
 * than guessing what the kernel would.
 */
export function tryOn(deps: IngestDeps, sql: Sql, body: Row, samples: readonly Sample[]): Tried {
  const texts = samples.map((s) => (deps.normalise ? deps.normalise(s.body) : s.body));
  const fields: Tried['fields'] = [];
  const extract = isRow(body.extract) ? body.extract : {};
  for (const [field, declared] of Object.entries(extract))
    fields.push({ field, from: 'extract', how: declared as Json, cells: texts.map((text) => cellOf(deps, declared, text)) });
  const map = isRow(body.map) ? body.map : {};
  for (const [field, declared] of Object.entries(map))
    fields.push({ field, from: 'map', how: declared as Json, cells: texts.map(() => ({ ok: false, value: null, raw: null })) });
  return { claims: samples.map((s) => claims(body, s)), fields, waited: waitedOf(sql, body.ingest) };
}

/** What kind of value a selection is, from the field's type when the builder knows it and from the text when not. */
type Kind = 'money' | 'date' | 'decimal' | 'int' | 'text';

const KIND_OF_TYPE: Readonly<Record<string, Kind>> = {
  money: 'money',
  day: 'date',
  date: 'date',
  int: 'int',
  integer: 'int',
  number: 'decimal',
  decimal: 'decimal',
  quantity: 'decimal',
};

/** The value forms a selection could be read as, without anchors, each with what it reads out of the selection alone. */
function formsFor(deps: IngestDeps, selected: string, type: string | undefined): { key: Kind; spec: Row; value: Json }[] {
  const out: { key: Kind; spec: Row; value: Json }[] = [];
  const kind = type !== undefined && Object.hasOwn(KIND_OF_TYPE, type) ? KIND_OF_TYPE[type] : undefined;
  const wants = (k: Kind): boolean => kind === undefined || kind === k;
  const read = (form: Row): Json | null => extractOutcome(deps, form as unknown as Extractor, selected).value;
  if (wants('money')) {
    const value = read({ money: {} });
    if (value !== null) out.push({ key: 'money', spec: {}, value });
  }
  if (wants('date'))
    for (const format of DATE_FORMATS) {
      const value = read({ date: { format } });
      if (value !== null) out.push({ key: 'date', spec: { format }, value });
    }
  if (wants('decimal') && (kind === 'decimal' || out.length === 0)) {
    const sep = selected.lastIndexOf(',') > selected.lastIndexOf('.') && /,\d{1,2}\s*$/u.test(selected) ? ',' : '.';
    const value = read({ decimal: { sep } });
    if (value !== null) out.push({ key: 'decimal', spec: { sep }, value });
  }
  if (wants('int') && kind === 'int') {
    const value = read({ int: {} });
    if (value !== null) out.push({ key: 'int', spec: {}, value });
  }
  /* TEXT IS ALWAYS OFFERED when the field's type does not rule it out, because a reference number that looks like an
     amount is still a reference, and the person, not the reader, knows which she selected. */
  if (kind === undefined || kind === 'text') {
    const value = selected.replace(/\s+/gu, ' ').trim();
    if (value !== '') out.push({ key: 'text', spec: {}, value });
  }
  return out;
}

/** A literal cut from the words beside a selection: the last or first `n` words, trimmed, or `null` if too long. */
function words(side: string, n: number, from: 'end' | 'start'): string | null {
  const parts = (from === 'end' ? side.trimEnd() : side.trimStart()).split(/(\s+)/u);
  const kept = from === 'end' ? parts.slice(Math.max(0, parts.length - n * 2)) : parts.slice(0, n * 2);
  const literal = kept.join('').trim();
  return literal === '' || literal.length > ANCHOR_CHARS_MOST ? null : literal;
}

/**
 * Where the selection sits in the text the reader reads. The builder selects in the body as it arrived, and `normalise`
 * can drop characters, so the selection is found again in the normalised text, at the occurrence nearest where it was.
 */
function located(deps: IngestDeps, body: string, start: number, end: number): { text: string; at: number; selected: string } | null {
  const n = deps.normalise ?? ((t: string) => t);
  const text = n(body);
  const selected = n(body.slice(start, end)).trim();
  if (selected === '') return null;
  const near = n(body.slice(0, start)).length;
  let best = -1;
  for (let at = text.indexOf(selected); at >= 0; at = text.indexOf(selected, at + 1))
    if (best < 0 || Math.abs(at - near) < Math.abs(best - near)) best = at;
  return best < 0 ? null : { text, at: best, selected };
}

/**
 * The ways one selection could be found again, each scored against every sample, best first.
 *
 * THE CANDIDATES ARE CUT FROM THE SAMPLE, never taken from the person: the one to three words before the selection on
 * its line (or the line above, when it opens its line), the one or two words after it (or the end of the line), and
 * the pairs of them as `between`. A candidate that does not read the selection back out of the sample it was selected
 * in is dropped, so every one offered is right at least once. The rest are ranked by how many samples they read.
 */
export function anchorsIn(deps: IngestDeps, samples: readonly Sample[], chosen: Sample, pick: { start: number; end: number; type?: string }): Anchor[] {
  const place = located(deps, chosen.body, pick.start, pick.end);
  if (!place) return [];
  const { text, at, selected } = place;
  const left = text.slice(0, at);
  const right = text.slice(at + selected.length);
  const lineLeft = left.slice(left.lastIndexOf('\n') + 1);
  const lineRight = right.split('\n', 1)[0] ?? '';

  const afters = new Set<string>();
  const leftSide = lineLeft.trim() !== '' ? lineLeft : (left.trimEnd().split('\n').pop() ?? '');
  for (let n = 1; n <= ANCHOR_WORDS_MOST; n += 1) {
    const w = words(leftSide, n, 'end');
    if (w) afters.add(w);
  }
  const befores = new Set<string>();
  for (let n = 1; n <= 2; n += 1) {
    const w = words(lineRight, n, 'start');
    if (w) befores.add(w);
  }
  /* THE END OF THE LINE IS A LANDMARK TOO, and for a name at the end of its line it is the only one on the right. */
  if (right.startsWith('\n') || lineRight.trim() === '') befores.add('\n');

  const anchorings: Row[] = [];
  for (const a of afters) for (const b of befores) anchorings.push({ between: [a, b] });
  for (const a of afters) anchorings.push({ after: a });
  for (const b of befores) if (b !== '\n') anchorings.push({ before: b });

  const texts = samples.map((s) => (deps.normalise ? deps.normalise(s.body) : s.body));
  const seen = new Set<string>();
  const out: (Anchor & { weight: number })[] = [];
  for (const { key, spec, value } of formsFor(deps, selected, pick.type)) {
    for (const anchoring of anchorings) {
      const form = { [key]: { ...spec, ...anchoring } } as Row;
      const said = JSON.stringify(form);
      if (seen.has(said)) continue;
      seen.add(said);
      const own = extractOutcome(deps, form as unknown as Extractor, text);
      if (own.outcome === 'ambiguous' || JSON.stringify(own.value) !== JSON.stringify(value)) continue;
      let hits = 0;
      for (const t of texts) {
        const got = extractOutcome(deps, form as unknown as Extractor, t);
        if (got.value !== null && got.outcome !== 'ambiguous') hits += 1;
      }
      /* THE SHORTER LANDMARK FIRST AT EQUAL HITS, and a pair before a single one, because a pair says where the value
         ends as well as where it starts. */
      const length = JSON.stringify(anchoring).length;
      out.push({ how: form as unknown as Json, hits, of: samples.length, value, weight: ('between' in anchoring ? 0 : 1000) + length });
    }
  }
  out.sort((a, b) => b.hits - a.hits || a.weight - b.weight);
  return out.slice(0, ANCHORS_MOST).map(({ weight: _weight, ...a }) => a);
}

/** The refusal an ingest body gets when it is not one. */
export const notIngest = (): Refusal => ({
  code: 'VALUE_MALFORMED',
  fix: 'The pattern is an ingest: what it matches, the fields it reads and the list it writes.',
  at: 'ingest',
});

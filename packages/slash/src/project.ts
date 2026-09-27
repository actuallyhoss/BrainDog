/**
 * The checks that stand between a model's JSON and a suggestion a person reads.
 *
 * FOUR OF THEM, IN THIS ORDER, and nothing is filed until all four have passed: the schema, the
 * citation rule, the anchor rule, and whatever the job adds on top. `46 §8`'s last-but-one row is
 * this file: *"schema then cite then class check then record.propose; a failure at any step files
 * nothing."*
 *
 * THE ONE HARD RULE IS RULE 1 OF THE SYSTEM PROMPT AND IT IS NOT TRUSTED TO THE MODEL. A figure a
 * model typed is a figure nobody can check, and this product's whole posture is that a number in
 * front of a person is a number with a row behind it. `cite()` is where that stops being a
 * sentence in a prompt and becomes a refusal.
 *
 * THE TOKEN COUNT IS `bytes / 3` AND THAT IS A DELIBERATE CEILING (`46 §10`). It over-counts
 * English by about a quarter and holds for Arabic, which is the direction to be wrong in: a prompt
 * this thinks is 8,000 tokens and the provider reads as 6,300 costs a few dropped rows, where the
 * other direction costs a refused call. It is swapped for the provider's counter the day the
 * `usage.in ≤ 1.3 × tokens(prompt)` assertion fails on a fixture.
 */

import { no, ok, type Refusal, type Result } from '@braindog/ports';

import type { Citable, Projection, ProjectionRegister, ProjectionRow, RawPayload } from './types.ts';

/**
 * A figure the record read for this ask: a declared metric, by its id, as it stands.
 *
 * DECLARED HERE AND NOT IN `types.ts`, because the projection that carries it is the host's addition to `45 §4.4`'s shape
 * (`SlashProjection` in `packages/host/src/slash.ts`), and a projection without it is still a projection. `value` is the
 * kernel's reading: money in minor units under a currency `unit`, anything else a plain number, `null` when the record
 * could not state it.
 */
export type ProjectedFigure = { id: string; name: string; value: number | null; unit: string | null; format: string | null };

/** A figure the record keeps, listed on the index call by id and name so the predicate draft can name it. Never a reading. */
export type FigureName = { id: string; name: string };

/**
 * The projection as a host that reads figures answers it.
 *
 * `cut` NAMES EVERY REGISTER WHOSE ROWS STOPPED SHORT, at the budget or at the list's own page, and a register named there
 * is never totalled: a sum over the first fifty of two hundred matching rows is a figure that reads as the answer and is
 * not. A projection that names none is read as whole, which is what every projection was before hosts said so.
 */
export type Figured = Projection & {
  figures?: readonly ProjectedFigure[] | undefined;
  cut?: readonly string[] | undefined;
  index: Projection['index'] & { figures?: readonly FigureName[] | undefined };
};

/**
 * A total code worked out over the rows read, which the model may cite as `{{sum:<id>}}` and never type.
 *
 * `id` IS `<register>.<field>` FOR A WHOLE NUMBER AND `<register>.<field>.<CURRENCY>` FOR MONEY, one total per currency,
 * because two currencies are never added. `rows` is every row the total covers, in the order the record answered them, so
 * the screen can put them one tap from the figure.
 */
export type Sum = { id: string; register: string; field: string; amount: number; currency: string | null; rows: readonly ProjectionRow[] };

/** Everything a brace may be pinned to on one ask: the rows, their paths and values, the figures read and the totals. */
export type Allowed = Citable & {
  rows: ReadonlyMap<string, ProjectionRow>;
  figures: ReadonlyMap<string, ProjectedFigure>;
  sums: ReadonlyMap<string, Sum>;
};

/**
 * What one brace in an answer stands for, kept on the answer so the palette draws it without asking the record again.
 *
 * ON THE ANSWER AND NEVER ON THE FILED QUESTION. The answer goes to the asker alone, who read every row it names; a filed
 * question is shown to readers the record chooses by its own rule, and a title or an amount kept on it would reach one
 * who cannot read the list it came from (`propose.ts`, where the body is filed). `apps/web/src/lib/cite.ts` reads this
 * shape back, defensively.
 *
 * A ROW IS NAMED BY ITS TITLE. The spoken id is the link and never the words: nobody reads `obligations#7` aloud.
 */
export type DrawnFigure =
  | { kind: 'row'; register: string; seq: number; title: string }
  | { kind: 'value'; register: string; seq: number; field: string; type: string; value: unknown }
  | { kind: 'metric'; name: string; value: number | null; unit: string | null; format: string | null }
  | {
      kind: 'sum';
      register: string;
      field: string;
      amount: number;
      currency: string | null;
      n: number;
      rows: { register: string; seq: number; title: string }[];
    };

const UTF8 = new TextEncoder();

/** The local estimate, `46 §7`. Never billed: the account row uses the provider's `usage`. */
export const tokens = (text: string): number => Math.ceil(UTF8.encode(text).length / 3);

/**
 * The first `n` bytes of a string, cut on a character boundary.
 *
 * CUT ON THE CHARACTER AND NOT ON THE BYTE, because a shape is a grouping key: half a UTF-8
 * sequence would make two subjects that differ only in where the cut landed into two shapes, and
 * `24 §4.3` groups unmatched arrivals on exactly this string.
 */
export const firstBytes = (text: string, n: number): string => {
  if (UTF8.encode(text).length <= n) return text;
  let out = '';
  let used = 0;
  for (const ch of text) {
    const size = UTF8.encode(ch).length;
    if (used + size > n) break;
    out += ch;
    used += size;
  }
  return out;
};

/**
 * The grouping key for an arrival nothing parsed: `channel | sender domain | digit-blanked subject`.
 *
 * DETERMINISTIC, AND COMPUTED BEFORE THE MODEL RATHER THAN BY IT (`46 §13` D15). The model's whole
 * contribution to triage is `kind` and `actionable`; the shape is the part another payload has to
 * match exactly for the two to be one group, and a model that answers a shape answers a different
 * one for the same message on a bad day. Three receipts from one bank differing only in the amount
 * are one shape here, which is what lets the unmatched-ingest count reach its floor of three.
 *
 * ONE NUMBER IS ONE `#`, THOUSANDS SEPARATORS INCLUDED. A comma between two digit runs is part of
 * the number and not a word boundary, so `EGP 1,299.00` and `EGP 940.50` both become `EGP #.#`.
 * Masking each digit run on its own would print `#,#.#` for the first and `#.#` for the second,
 * and the two receipts from one bank that differ only in whether the amount passed a thousand
 * would then sit in two groups, neither of which ever reaches the floor of three.
 */
const NUMBER = /[0-9]+(?:,[0-9]+)*/gu;

export const shapeOf = (raw: RawPayload): string => {
  const at = raw.from === null ? '' : raw.from.slice(raw.from.lastIndexOf('@') + 1).toLowerCase();
  const subject = firstBytes((raw.subject ?? '').replaceAll(NUMBER, '#'), 64);
  return `${raw.channel}|${at}|${subject}`;
};

/**
 * What a figure may be pinned to, built once per projection (`46 §5.6`).
 *
 * THE TYPES COME FROM THE INDEX AND NOT FROM THE VALUE'S SHAPE. A money field is money because the
 * register says so; sniffing `{ amount, currency }` off a value would make any object with those
 * two keys quotable, and a `json` field holding a webhook's echo of a payment is exactly that
 * object with no register behind it.
 */
export const citable = (p: Projection, registers: readonly ProjectionRegister[] = p.index.registers): Allowed => {
  const typeOf = typesOf(registers);

  const spoken = new Set<string>();
  const paths = new Set<string>();
  const money = new Set<string>();
  const days = new Set<string>();
  const rows = new Map<string, ProjectionRow>();
  for (const row of p.rows) {
    spoken.add(row.spoken);
    rows.set(row.spoken, row);
    for (const [field, value] of Object.entries(row.fields)) {
      paths.add(`${row.spoken}.${field}`);
      const type = typeOf.get(`${row.register}.${field}`);
      if (type === 'money' && isMoney(value)) money.add(`${value.amount} ${value.currency}`);
      if (type === 'day' && typeof value === 'string') days.add(value);
    }
  }
  const figured = p as Figured;
  const figures = new Map((figured.figures ?? []).map((f) => [f.id, f] as const));
  const sums = new Map(sumsOf(p.rows, registers, figured.cut ?? []).map((s) => [s.id, s] as const));
  return { spoken, paths, money, days, rows, figures, sums };
};

const typesOf = (registers: readonly ProjectionRegister[]): Map<string, string> => {
  const out = new Map<string, string>();
  for (const reg of registers) for (const f of reg.fields) out.set(`${reg.id}.${f.id}`, f.type);
  return out;
};

/** A total over one row is that row's value, which the row already cites; two is the least worth adding up. */
const SUM_LEAST = 2;

/**
 * The totals over the rows read: every money field per currency, and every whole-number field, per register.
 *
 * CODE ADDS AND THE MODEL CITES (`loop/finish/agents.md` §2.7, S13). "How much did I spend on software this month" has
 * its answer in no single row, so under rule 1 it could never be said, and a model asked to add twelve amounts is the
 * one place a figure would be typed with nothing behind it. The total is worked out here, handed to the model as a brace
 * it may quote, and drawn from the same numbers.
 *
 * A `decimal` IS NOT TOTALLED, because binary fractions do not add to what a person expects (`0.1 + 0.2`), and a total
 * that is out in its last place is a total nobody can check against the rows. Money and `int` are whole numbers.
 *
 * A REGISTER IN `cut` IS NOT TOTALLED AT ALL (`Figured`).
 */
export const sumsOf = (
  rows: readonly ProjectionRow[],
  registers: readonly ProjectionRegister[],
  cut: readonly string[],
): Sum[] => {
  const out = new Map<string, { register: string; field: string; amount: number; currency: string | null; rows: ProjectionRow[] }>();
  for (const reg of registers) {
    if (cut.includes(reg.id)) continue;
    for (const f of reg.fields) {
      if (f.type !== 'money' && f.type !== 'int') continue;
      for (const row of rows) {
        if (row.register !== reg.id) continue;
        const value = row.fields[f.id];
        const currency = f.type === 'money' && isMoney(value) ? value.currency : null;
        const amount = f.type === 'money' ? (isMoney(value) ? value.amount : null) : typeof value === 'number' ? value : null;
        if (amount === null || !Number.isSafeInteger(amount)) continue;
        const id = currency === null ? `${reg.id}.${f.id}` : `${reg.id}.${f.id}.${currency}`;
        const into = out.get(id) ?? { register: reg.id, field: f.id, amount: 0, currency, rows: [] };
        into.amount += amount;
        into.rows.push(row);
        out.set(id, into);
      }
    }
  }
  return [...out.entries()].filter(([, s]) => s.rows.length >= SUM_LEAST).map(([id, s]) => ({ id, ...s }));
};

/**
 * A row's title: the first part of its summary that is not its spoken id.
 *
 * THE SUMMARY IS `spoken | title | state` ON THE HOST'S BRIDGE (`summaryOf` in `packages/host/src/slash.ts`) and the title
 * alone on a record that writes its own, so the spoken id is dropped wherever it sits rather than assumed first. A row
 * with nothing else to say has an empty title, and the screen names it by its list.
 */
export const titleOf = (row: Pick<ProjectionRow, 'spoken' | 'summary'>): string =>
  row.summary
    .split(' | ')
    .map((part) => part.trim())
    .find((part) => part !== '' && part !== row.spoken) ?? '';

/** Rows a total names on the answer, at most: the rest are counted in `n` and are one list away on the register. */
const SUM_ROWS_DRAWN = 50;

const drawnRow = (row: ProjectionRow): { register: string; seq: number; title: string } => ({
  register: row.register,
  seq: row.seq,
  title: titleOf(row),
});

/**
 * Every brace in these texts, as what it stands for (`DrawnFigure`), keyed by the brace's inside.
 *
 * RUN AFTER `cite` PASSED, so every brace here names something `allowed` holds; one that does not is left out rather
 * than guessed, and the screen draws its own words for it. A typed kind over a path (`{{money:obligations#7.amount}}`)
 * is keyed by the path, which is what the screen looks up; a typed literal (`{{money:500500 EGP}}`) needs nothing here,
 * because the literal is its own value.
 */
export const figuresOf = (texts: readonly string[], allowed: Allowed, registers: readonly ProjectionRegister[]): Record<string, DrawnFigure> => {
  const typeOf = typesOf(registers);
  const out: Record<string, DrawnFigure> = {};
  const row = (spoken: string): void => {
    const r = allowed.rows.get(spoken);
    if (r) out[`ref:${spoken}`] = { kind: 'row', ...drawnRow(r) };
  };
  const path = (p: string): void => {
    const whole = allowed.rows.get(p);
    if (whole) {
      out[p] = { kind: 'row', ...drawnRow(whole) };
      return;
    }
    const q = QUALIFIED.exec(p);
    const r = q ? allowed.rows.get(q[0]) : undefined;
    if (q && r && p.startsWith(`${q[0]}.`)) {
      const field = p.slice(q[0].length + 1);
      if (Object.hasOwn(r.fields, field))
        out[p] = { kind: 'value', register: r.register, seq: r.seq, field, type: typeOf.get(`${r.register}.${field}`) ?? 'text', value: r.fields[field] };
      return;
    }
    const figure = allowed.figures.get(p);
    if (figure) out[p] = { kind: 'metric', name: figure.name, value: figure.value, unit: figure.unit, format: figure.format };
  };
  for (const text of texts)
    for (const match of text.replace(CODE_SPAN, blank).matchAll(INTERPOLATION)) {
      const inner = match[0].slice(2, -2).trim();
      const colon = inner.indexOf(':');
      if (colon < 0) {
        path(inner);
        continue;
      }
      const kind = inner.slice(0, colon);
      const arg = inner.slice(colon + 1).trim();
      if (kind === 'ref') row(arg);
      else if (kind === 'sum') {
        const s = allowed.sums.get(arg);
        if (s)
          out[`sum:${arg}`] = {
            kind: 'sum',
            register: s.register,
            field: s.field,
            amount: s.amount,
            currency: s.currency,
            n: s.rows.length,
            rows: s.rows.slice(0, SUM_ROWS_DRAWN).map(drawnRow),
          };
      } else if (!isLiteral(arg)) path(arg);
    }
  return out;
};

const isMoney = (v: unknown): v is { amount: number; currency: string } =>
  typeof v === 'object' && v !== null && typeof (v as { amount?: unknown }).amount === 'number'
  && typeof (v as { currency?: unknown }).currency === 'string';

/** `34 §2.3`: eight typed kinds and no ninth. A `{{rows:14}}` is refused for being the ninth. */
const TYPED = new Set(['date', 'day', 'until', 'ago', 'money', 'quantity', 'pct', 'ref']);

/** `34 §4`: the qualified spoken id, and the prefix every path over a row starts with. */
const QUALIFIED = /^([a-z][a-z0-9_]*)#([1-9][0-9]*)/u;

/** A typed argument is a literal when it starts with a digit or a minus, and a path when it starts with a letter. */
const isLiteral = (arg: string): boolean => /^[-0-9]/u.test(arg);

const NAME_IT = 'Name the path this figure comes from, or leave it out.';

const blank = (m: string): string => ' '.repeat(m.length);

/** Backtick spans are lifted first, so nothing inside one is read as prose or as an interpolation. */
const CODE_SPAN = /`[^`\n]*`/gu;
const INTERPOLATION = /\{\{[^}\n]*\}\}/gu;

/**
 * `cite(text, allowed)`: the one hard rule, as a procedure (`46 §5.7`).
 *
 * POSITIONS ARE PRESERVED BY BLANKING RATHER THAN BY DELETING, because the refusal has to say WHERE,
 * and `at: "about 40%"` is a repair while `at: "the text"` is a shrug. The same reason
 * `tools/gates/em-dash.mjs` blanks comments instead of stripping them.
 *
 * THE DIGIT SCAN RUNS OVER WHAT IS LEFT after code spans and interpolations are blanked, so the two
 * legitimate homes for a digit are the two that survive. Everything else, including a year, a
 * percentage and the word "2" in a sentence, is a figure with nothing behind it.
 */
export const cite = (
  text: string,
  allowed: Citable & Partial<Pick<Allowed, 'figures' | 'sums'>>,
): Result<{ text: string; citations: string[] }> => {
  const spans = text.replace(CODE_SPAN, blank);
  const bare = spans.replace(INTERPOLATION, blank);

  const digit = bare.search(/[0-9]/u);
  if (digit >= 0) return no('PROPOSAL_UNCITED', NAME_IT, { at: around(bare, digit) });

  const citations: string[] = [];
  const add = (id: string): void => {
    if (!citations.includes(id)) citations.push(id);
  };

  for (const match of spans.matchAll(INTERPOLATION)) {
    const whole = match[0];
    const inner = whole.slice(2, -2).trim();
    const colon = inner.indexOf(':');

    if (colon < 0) {
      /* A BARE ID IS A FIGURE THE RECORD READ FOR THIS ASK, OR IT IS NOTHING. It was refused before hosts read figures,
         because no path in the projection matched it, so "why is runway four months" had nothing to cite (S13). */
      if (pathFault(inner, allowed) && allowed.figures?.has(inner) !== true) return no('PROPOSAL_UNCITED', NAME_IT, { at: whole });
      addPath(inner, add);
      continue;
    }

    const kind = inner.slice(0, colon);
    const arg = inner.slice(colon + 1).trim();
    /* `sum` IS SLASH'S OWN AND NOT A NINTH TYPED KIND OF `34 §2.3`: it names a total `sumsOf` worked out for this ask, and
       quoting one cites every row it adds up, because those rows are what the total is a claim about. */
    if (kind === 'sum') {
      const total = allowed.sums?.get(arg);
      if (total === undefined) return no('PROPOSAL_UNCITED', NAME_IT, { at: whole });
      for (const row of total.rows) add(row.spoken);
      continue;
    }
    if (!TYPED.has(kind)) return no('PROPOSAL_UNCITED', NAME_IT, { at: whole });

    if (!isLiteral(arg)) {
      /* A PATH ARGUMENT FOLLOWS THE PATH RULE, whatever the kind is: `{{money:obligations#7.amount}}`
         is the row's own value rendered as money, which is the form `34 §2.3` says a rule's `say:`
         template uses, and it is cited by the row it names. A figure read for this ask is a path here as it is bare
         (`{{pct:paid-share}}`), except under `ref`, which names a row and nothing else. */
      const figure = kind !== 'ref' && allowed.figures?.has(arg) === true;
      if (pathFault(arg, allowed) && !figure) return no('PROPOSAL_UNCITED', NAME_IT, { at: whole });
      addPath(arg, add);
      if (kind === 'ref') add(arg);
      continue;
    }

    /* A COMPUTED FIGURE IS A METRIC PATH OR IT IS NOTHING. `{{pct:-46.3}}` and `{{quantity:3 days}}`
       are the model doing arithmetic and quoting itself, and no row holds the answer to compare. */
    if (kind === 'pct' || kind === 'quantity') return no('PROPOSAL_UNCITED', NAME_IT, { at: whole });
    if (kind === 'money' && !allowed.money.has(arg)) return no('PROPOSAL_UNCITED', NAME_IT, { at: whole });
    if (kind !== 'money' && !allowed.days.has(arg)) return no('PROPOSAL_UNCITED', NAME_IT, { at: whole });
  }

  return ok({ text, citations });
};

/** `{{ref:X}}` needs a row; every other path needs a path or a row. */
const pathFault = (path: string, allowed: Citable): boolean =>
  !allowed.paths.has(path) && !allowed.spoken.has(path);

/** A path over a row cites that row. A bare metric id names no row and cites nothing. */
const addPath = (path: string, add: (id: string) => void): void => {
  const qualified = QUALIFIED.exec(path);
  if (qualified) add(qualified[0]);
};

/**
 * The span a refused digit sits in: the token holding it, and the word before it.
 *
 * TWO WORDS BECAUSE ONE IS NOT A SENTENCE. `at: "40%"` sends a person looking for a number they
 * cannot find in their own text; `at: "about 40%"` is searchable.
 */
const around = (text: string, at: number): string => {
  let start = at;
  while (start > 0 && text[start - 1] !== ' ' && text[start - 1] !== '\n') start--;
  let end = at;
  while (end < text.length && text[end] !== ' ' && text[end] !== '\n') end++;
  let prev = start;
  while (prev > 0 && (text[prev - 1] === ' ' || text[prev - 1] === '\n')) prev--;
  let head = prev;
  while (head > 0 && text[head - 1] !== ' ' && text[head - 1] !== '\n') head--;
  return text.slice(head, end).trim();
};

/**
 * Every anchor a proposed ingest body copies out of a message, in the order they are declared.
 *
 * WHAT COUNTS AS AN ANCHOR: the literal under a `match` operator, and the needles an extractor cuts
 * on. Not the field names, not the register, not the format tokens, because none of those is a
 * claim about what the message said.
 */
export const anchorsOf = (ingest: Record<string, unknown>): { path: string; anchor: string }[] => {
  const out: { path: string; anchor: string }[] = [];
  const MATCH_OPS = ['is', 'contains', 'starts', 'ends'];
  const CUT_OPS = ['after', 'before', 'between'];

  const match = ingest['match'];
  if (isRecord(match)) {
    for (const [field, clause] of Object.entries(match)) {
      if (!isRecord(clause)) continue;
      for (const op of MATCH_OPS) {
        const value = clause[op];
        if (typeof value === 'string') out.push({ path: `match.${field}.${op}`, anchor: value });
      }
    }
  }

  const extract = ingest['extract'];
  if (isRecord(extract)) {
    for (const [field, clause] of Object.entries(extract)) {
      if (!isRecord(clause)) continue;
      for (const op of CUT_OPS) {
        const value = clause[op];
        if (typeof value === 'string') out.push({ path: `extract.${field}.${op}`, anchor: value });
        else if (Array.isArray(value))
          value.forEach((v, i) => {
            if (typeof v === 'string') out.push({ path: `extract.${field}.${op}[${i}]`, anchor: v });
          });
      }
    }
  }
  return out;
};

/**
 * The anchor check (`46 §5.3` 5b): every anchor stands, verbatim, in at least one sample.
 *
 * THIS IS THE CITATION RULE FOR A PATTERN. A model that invents `" - "` as a separator has written a
 * pattern that matches nothing and will be reviewed by somebody who has to run it to find out. The
 * three fields it may have read from are `from`, `subject` and `body`, and nothing else in the
 * payload was in the prompt.
 */
export const anchorFault = (ingest: Record<string, unknown>, samples: readonly RawPayload[]): Refusal | null => {
  const haystacks = samples.flatMap((s) => [s.from ?? '', s.subject ?? '', s.body]);
  for (const { path, anchor } of anchorsOf(ingest)) {
    if (anchor === '') continue;
    if (!haystacks.some((h) => h.includes(anchor)))
      return {
        code: 'PROPOSAL_UNCITED',
        fix: NAME_IT,
        at: path,
      };
  }
  return null;
};

export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * The result schema, re-checked by hand after the provider has answered.
 *
 * WHY BY HAND AND WHY AGAIN. Every call sends its schema as `jsonSchema`, and a provider that
 * supports constrained decoding honours it; a provider that does not, and a gateway that dropped
 * the field on the way through, both return valid JSON of the wrong shape and neither says so. The
 * difference is invisible at the call site, and the thing downstream of it is a write in front of
 * a person.
 *
 * A SUBSET OF JSON SCHEMA AND NOT A VALIDATOR (`46 §10`): `type` (one name or a list), `required`,
 * `enum`, `additionalProperties: false`, an array's `items`, `minItems` and `maxItems`. `anyOf` is NOT read: the
 * proposal's body carries one for the provider, and `propose.ts` checks the body against the one schema in `BODIES`
 * its `body_kind` names instead. `declare`'s Valibot path is the answer if a schema here ever grows past ten keys; this
 * many does not earn a dependency.
 */
export const checkSchema = (schema: object, value: unknown, at = ''): Refusal | null => {
  const s = schema as Record<string, unknown>;
  const kinds = typeof s['type'] === 'string' ? [s['type']] : Array.isArray(s['type']) ? s['type'] : [];

  if (kinds.length > 0 && !kinds.some((k) => isType(k, value))) return schemaFault(at);

  if (Array.isArray(s['enum']) && !s['enum'].includes(value))
    return { ...schemaFault(at), allowed: s['enum'].map(String) };

  if (isRecord(value) && kinds.includes('object')) {
    const properties = isRecord(s['properties']) ? s['properties'] : {};
    for (const key of Array.isArray(s['required']) ? s['required'] : [])
      if (!Object.hasOwn(value, String(key))) return schemaFault(join(at, String(key)));

    if (s['additionalProperties'] === false)
      for (const key of Object.keys(value))
        if (!Object.hasOwn(properties, key)) return schemaFault(join(at, key));

    for (const [key, sub] of Object.entries(properties)) {
      if (!Object.hasOwn(value, key)) continue;
      if (!isRecord(sub)) continue;
      const fault = checkSchema(sub, value[key], join(at, key));
      if (fault) return fault;
    }
  }

  if (Array.isArray(value) && kinds.includes('array')) {
    const items = isRecord(s['items']) ? s['items'] : null;
    if (typeof s['minItems'] === 'number' && value.length < s['minItems'])
      return schemaFault(at);
    if (typeof s['maxItems'] === 'number' && value.length > s['maxItems'])
      return schemaFault(at);
    if (items)
      for (let i = 0; i < value.length; i++) {
        const fault = checkSchema(items, value[i], `${at}[${i}]`);
        if (fault) return fault;
      }
  }

  return null;
};

const join = (at: string, key: string): string => (at === '' ? key : `${at}.${key}`);

const schemaFix = (at: string): string =>
  `The model's answer did not match the schema${at === '' ? '' : ` at ${at}`}. Nothing was filed; ask again.`;

const schemaFault = (at: string): Refusal => ({
  code: 'PROPOSAL_SCHEMA',
  fix: schemaFix(at),
  ...(at === '' ? {} : { at }),
});

const isType = (kind: unknown, value: unknown): boolean => {
  switch (kind) {
    case 'object':
      return isRecord(value);
    case 'array':
      return Array.isArray(value);
    case 'null':
      return value === null;
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number';
    case 'boolean':
      return typeof value === 'boolean';
    default:
      return false;
  }
};

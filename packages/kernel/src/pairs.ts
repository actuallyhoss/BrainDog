/**
 * THE TWO LEGS OF A TRANSFER, FOUND AND MARKED, AND UNMARKED WHEN THEY STOP BEING ONE.
 *
 * Money moved between two of one person's own accounts is written as two rows, one leaving and one arriving, and a ledger
 * that reads each as it stands counts the move twice: once as spend and once as income. His import writes every such move
 * that way (`loop/research-living-in-it.md` section 4.1), and every Ledger figure says `transfer is false`, so until both
 * legs were marked by hand the month's spend held money that was only moved.
 *
 * `02 §5`'s register option: `pairs: { on, opposite, across, within, date?, mark, where? }`. Two rows that agree on every
 * `on` entry, face opposite ways, sit in different accounts, fall inside the window and both pass `where` are one
 * transfer. Both are MARKED, never hidden: `mark` names a `bool` field the kernel sets true on each, and `_pair` beside it
 * names the other row, so a person can see why a row stopped counting and undo it. Zero never matches, because two zero
 * rows are not a movement.
 *
 * A PAIR IS A FUNCTION OF THE LEDGER AS IT STANDS, NOT OF THE ORDER IT WAS WRITTEN IN. W57-1 made a pair once and kept it
 * whatever happened, and the audit of it (`loop/research-batch-fifty-eight-audit.md`) measured what that costs: a leg
 * corrected from GBP 400.00 to 900.00, a leg retyped from in to out, and a leg deleted each left the other marked, so
 * Spent read 0.00 against 900.00, 800.00 and 400.00. And a credit listed before its own debit took the rent two days
 * away, because it was the only candidate when the credit arrived. So two rows are paired when, and only while, each is
 * the other's one nearest candidate (`partnerOf`), and every write that could move that answer settles it again for the
 * rows around it (`settle`). A tie is not broken by id or by arrival: two legs equally near leave the row unpaired, which
 * counts the money rather than guessing which move hid it, UNLESS NO MATCHING OF THE TIED ROWS COULD HIDE THE WRONG
 * MONEY (`matchedOf`): as many alike legs one way as the other are matched in day order.
 *
 * A MARK A PERSON SET IS HIS (`41 §5.4` step 6b, `§13 #10`). The kernel never writes over it and never pairs the row, and
 * a person unmarking one leg of a pair unpairs the other, which is the undo the header of W57-1 promised and did not have.
 * HIS `true` IS KEPT OUT AS HIS `false` IS, and that has a cost audit sixty measured (X2): a transfer he typed and ticked
 * before the savings statement arrived leaves the statement's leg counted, GBP 4,000.00 read as received, until he ticks
 * that one too. Letting his `true` take a partner was tried (held61) and was refused, because a ticked card bill is the
 * same write and took a REFUND that was nobody's transfer (`pairs-undo.test.ts`, P3b), and the sample record's two typed
 * legs paired each other (`packages/seed/test/money-pairs.test.ts`). The spec says both are kept out; changing that is the
 * owner's call and not the kernel's. What a person did NOT say is not a pin: a whole row sent back with the mark as it
 * was is not his word on the mark (the write path in `index.ts` decides, audit sixty's X2b).
 *
 * IN THE KERNEL'S WRITE PATH AND NOT IN A RULE, because a `where:` cannot say "a row of this register that mirrors me",
 * and because the import writes through `create` and so will the bank door after the cut-over: one build serves both.
 */

import type { Refusal, Sql } from '@braindog/ports';
import { compile, evaluate, type Predicate, type Schema } from '@braindog/where';

import { isCurrencyCode } from './coerce.ts';
import { atMs, shiftFrom } from './schedule.ts';

export type PairsDecl = {
  /** One to three fields both rows hold alike. `abs(x)` compares a number or an amount by its size and currency. */
  on: readonly string[];
  /** The field that says which way the money went: a signed number or amount, or an enum of two values. */
  opposite: string;
  /** The field the two rows must differ on, which is the account. */
  across: string;
  /** How far apart the two days may be: `4d`, `1w`, `1m`. */
  within: string;
  /** The day field the window runs over. The register's sole `day` field when absent. */
  date?: string;
  /** A `bool` field set true on both rows. */
  mark: string;
  /** Which rows are money that moved: a row this does not match is nobody's partner. Absent is every row. */
  where?: Predicate;
};

type FieldShape = { id: string; type: string; values?: unknown; of?: unknown; to?: unknown; default?: unknown; retired?: boolean };

const PAIRS_KEYS = ['on', 'opposite', 'across', 'within', 'date', 'mark', 'where'] as const;
const NUMERIC = new Set(['money', 'int', 'decimal']);
/* THREE LETTERS ISO ASSIGNS, in either case, since a text field is not upper-cased on the way in as a money is. */
const CODE = /^[A-Za-z]{3}$/;
const isCode = (v: unknown): v is string => typeof v === 'string' && CODE.test(v) && isCurrencyCode(v.toUpperCase());

/**
 * Whether a field can say which currency a bare number is in: a `text`, or an `enum` whose every value is a currency.
 *
 * NOT A FIELD NAME, because the kernel is a shell and one ledger's `currency` is another's `ccy`. AND NOT ANY TEXT, ENUM
 * OR REF, which is what this was: audit sixty's X1 put `state` in `on`, an enum of pending and cleared that every counted
 * row holds alike, and EGP -1000 paired with USD +1000. An enum says its values at install, so it is checked there. A text
 * can hold anything, so it is taken at its word here and each row is held to it in `currencyOf`. A `ref` holds a row id,
 * and nothing here can read the row it names, so it is refused rather than trusted.
 */
const holdsCurrency = (f: FieldShape): boolean =>
  f.type === 'text' || (f.type === 'enum' && Array.isArray(f.values) && f.values.length > 0 && f.values.every(isCode));
/* `42 §2`'s `Window`, the offset grammar `schedule.ts` steps by, without a sign. */
const WINDOW = /^[1-9]\d{0,3}[dwm]$/;
const ABS = /^abs\(([a-z][a-z0-9_]*)\)$/;
const IDENT = /^[a-z][a-z0-9_]*$/;

/** Who signs what the pairing writes: the record's own, which `markPinned` never reads as somebody's say. */
export const PAIRS_ACTOR = 'system';

/**
 * Whether an actor is machinery, whose writes to a mark are not a pin.
 *
 * STEP 2b'S MECHANISMS AND THE RECORD ITSELF. `41 §13 #5` pins a field against `rule:` and `ingest:`; `script:` and
 * `grant:` are the same kind of writer, and `system` is the pairing's own signature, which is what lets the kernel tell
 * the mark it set from the mark a person set when both were written in a person's batch.
 */
export const isMechanism = (actor: string): boolean => actor === PAIRS_ACTOR || /^(rule|ingest|script|grant):/.test(actor);

const bad = (code: string, fix: string, at: string, allowed?: readonly string[]): Refusal => ({
  code,
  fix,
  at,
  ...(allowed === undefined ? {} : { allowed }),
});

/** `abs(amount)` as `{ field: 'amount', abs: true }`, `currency` as `{ field: 'currency', abs: false }`. */
const entryOf = (said: string): { field: string; abs: boolean } | null => {
  const m = ABS.exec(said);
  if (m) return { field: m[1]!, abs: true };
  return IDENT.test(said) ? { field: said, abs: false } : null;
};

/** The day field a declaration's window runs over, or `null` when it names none and the register has no sole one. */
function dateField(pairs: { date?: unknown }, fields: readonly FieldShape[]): string | null {
  if (typeof pairs.date === 'string') return pairs.date;
  const days = fields.filter((f) => f.type === 'day' && f.retired !== true);
  return days.length === 1 ? days[0]!.id : null;
}

/**
 * The register as `where` reads it, for `pairs.where` alone.
 *
 * NO `state` MIRROR, ON PURPOSE. The mirrored column and the field hold the same string on the same statement, and the
 * field is what both the install check and the match read here, so neither has to be told which field is mirrored.
 */
function schemaOf(register: string, fields: readonly FieldShape[]): Schema {
  return {
    register,
    fields: Object.fromEntries(
      fields
        .filter((f) => f.retired !== true)
        .map((f) => [
          f.id,
          {
            type: f.type,
            ...(Array.isArray(f.values) ? { values: f.values as string[] } : {}),
            ...(typeof f.of === 'string' ? { of: f.of } : {}),
            ...(typeof f.to === 'string' ? { to: f.to } : {}),
          },
        ]),
    ),
  };
}

/** Every field a predicate reads, so an update touching one of them is looked at again. */
function readBy(where: unknown, into: string[] = []): string[] {
  if (where === null || typeof where !== 'object') return into;
  for (const key of ['all', 'any', 'none'] as const) {
    const group = (where as Record<string, unknown>)[key];
    if (Array.isArray(group)) for (const node of group) readBy(node, into);
  }
  /* `via` IS THE REF ON THIS ROW that a hop leaves by, so a change to it moves the answer as a change to `field` does. */
  for (const key of ['field', 'via'] as const) {
    const named = (where as Record<string, unknown>)[key];
    if (typeof named === 'string') into.push(named);
  }
  return into;
}

/**
 * What is wrong with a register's `pairs:`, or `null`.
 *
 * EVERY FIELD IT NAMES IS DECLARED (`FIELD_UNKNOWN`, `42 §4.4`), and each part is the type the matching reads it as,
 * because a mark on a text field would be written `true` into a text and a window over a text would compare strings. A
 * declaration naming no amount at all is refused too: with `opposite` an enum and every `on` a bare equality, zero is
 * indistinguishable from anything else, and the one rule `02 §5` states about amounts could not be kept.
 */
export function pairsFault(id: string, fields: readonly FieldShape[], pairs: unknown): Refusal | null {
  if (pairs === null || typeof pairs !== 'object' || Array.isArray(pairs))
    return bad(
      'DECLARATION_INVALID',
      `${id}'s pairs says how two rows are one transfer, as { on: [abs(amount)], opposite: direction, across: account, within: 4d, mark: transfer }.`,
      'pairs',
      PAIRS_KEYS,
    );
  const said = pairs as Record<string, unknown>;
  for (const key of Object.keys(said))
    if (!(PAIRS_KEYS as readonly string[]).includes(key))
      return bad('DECLARATION_INVALID', `${id}'s pairs has no key ${key}. It takes on, opposite, across, within, date, mark and where.`, `pairs.${key}`, PAIRS_KEYS);

  const live = fields.filter((f) => f.retired !== true);
  const field = (name: unknown) => (typeof name === 'string' ? live.find((f) => f.id === name) : undefined);
  const unknown = (key: string, name: unknown): Refusal =>
    bad('FIELD_UNKNOWN', `${id}'s pairs.${key} names ${String(name)}, and ${id} has no such field.`, `pairs.${key}`, live.map((f) => f.id));

  /* ── on ── */
  const on = said.on;
  if (!Array.isArray(on) || on.length < 1 || on.length > 3 || on.some((x) => typeof x !== 'string' || entryOf(x) === null))
    return bad(
      'DECLARATION_INVALID',
      `${id}'s pairs.on is one to three field names both rows hold alike, a number or an amount written abs(amount) to compare its size.`,
      'pairs.on',
    );
  const entries = (on as string[]).map((x) => entryOf(x)!);
  for (const e of entries) {
    const f = field(e.field);
    if (!f) return unknown('on', e.field);
    if (e.abs && !NUMERIC.has(f.type))
      return bad('DECLARATION_INVALID', `${id}'s pairs.on says abs(${f.id}), and ${f.id} is a ${f.type}. abs() takes a money, int or decimal field.`, 'pairs.on');
    if (f.type === 'secret') return bad('DECLARATION_INVALID', `${id}'s pairs.on names ${f.id}, a secret, which nothing outside the vault reads.`, 'pairs.on');
  }
  if (entries.filter((e) => e.abs).length > 1)
    return bad('DECLARATION_INVALID', `${id}'s pairs.on takes one abs() amount, and names ${entries.filter((e) => e.abs).length}.`, 'pairs.on');

  /* ── opposite ── */
  const opposite = field(said.opposite);
  if (said.opposite === undefined || !opposite) return unknown('opposite', said.opposite);
  const twoWays = opposite.type === 'enum' && Array.isArray(opposite.values) && opposite.values.length === 2;
  if (!NUMERIC.has(opposite.type) && !twoWays)
    return bad(
      'DECLARATION_INVALID',
      `${id}'s pairs.opposite is the field saying which way the money went: a signed money, int or decimal, or an enum of two values such as in and out. ${opposite.id} is ${opposite.type === 'enum' ? 'an enum of other than two values' : `a ${opposite.type}`}.`,
      'pairs.opposite',
    );
  if (!NUMERIC.has(opposite.type) && !entries.some((e) => e.abs))
    return bad(
      'DECLARATION_INVALID',
      `${id}'s pairs names no amount, so a zero could not be told from any other row. Put the amount in on as abs(amount).`,
      'pairs.on',
    );

  /* A BARE NUMBER CARRIES NO CURRENCY, so the declaration has to compare the field that does. A money is compared by the
     currency inside it (`amountOf`); an `int` is not, and the audit's P7 installed `on: [abs(amount)]` over an `int` and
     paired EGP -1000 out of one bank with USD +1000 into another, and audit sixty's X1 did the same with `state` named
     beside it, so the field named has to be one that can hold a currency (`holdsCurrency`). */
  const sized = field(entries.find((e) => e.abs)?.field ?? opposite.id)!;
  if (sized.type !== 'money' && !entries.some((e) => !e.abs && holdsCurrency(field(e.field)!)))
    return bad(
      'DECLARATION_INVALID',
      `${id}'s pairs compares ${sized.id}, a bare ${sized.type} with no currency in it, so 1000 in one currency would pair with 1000 in another. Name the field that says the currency in on, a text or an enum of currency codes, as on: [currency, abs(${sized.id})], or make ${sized.id} a money.`,
      'pairs.on',
      live.filter(holdsCurrency).map((f) => f.id),
    );

  /* ── across, within, date, mark ── */
  const across = field(said.across);
  if (said.across === undefined || !across) return unknown('across', said.across);
  if (typeof said.within !== 'string' || !WINDOW.test(said.within))
    return bad('DECLARATION_INVALID', `${id}'s pairs.within is how far apart the two days may be, as 4d, 1w or 1m, and ${JSON.stringify(said.within)} is not.`, 'pairs.within');

  if (said.date !== undefined) {
    const d = field(said.date);
    if (!d) return unknown('date', said.date);
    if (d.type !== 'day') return bad('DECLARATION_INVALID', `${id}'s pairs.date is the day the window runs over, and ${d.id} is a ${d.type}.`, 'pairs.date');
  } else if (dateField(said, live) === null) {
    const days = live.filter((f) => f.type === 'day').map((f) => f.id);
    return bad(
      'DECLARATION_INVALID',
      days.length === 0
        ? `${id} has no day field, so pairs has no window to run over.`
        : `${id} has ${days.length} day fields, so say which one pairs runs its window over, as date: ${days[0]}.`,
      'pairs.date',
      days,
    );
  }

  const mark = field(said.mark);
  if (said.mark === undefined || !mark) return unknown('mark', said.mark);
  if (mark.type !== 'bool')
    return bad('DECLARATION_INVALID', `${id}'s pairs.mark is the bool set true on both legs, and ${mark.id} is a ${mark.type}.`, 'pairs.mark');

  /* ── where ──
     WHICH ROWS ARE MONEY THAT MOVED IS THE REGISTER'S TO SAY, and nothing the kernel can know. Money-core says it with a
     `state` of pending, cleared or void and counts `state is cleared`; its `done:` holds `void` too, so `done:` is not the
     answer, and a field name written here would be one ledger's words in the shell. P4 paired a cleared GBP 250.00
     payment with a void credit and Spent read 0.00. THE TREE AND NOT THE SENTENCE, as `required_when:` takes it: the
     match runs on every write with no clock and no ref lookup to hand, and a sentence needs both to be read. */
  if (said.where !== undefined) {
    if (said.where === null || typeof said.where !== 'object' || Array.isArray(said.where))
      return bad(
        'DECLARATION_INVALID',
        `${id}'s pairs.where says which rows are money that moved, as a predicate such as { field: state, is: cleared }, and ${JSON.stringify(said.where)} is not one.`,
        'pairs.where',
      );
    const refused = compile(said.where as Predicate, schemaOf(id, live)).bad[0];
    if (refused) return bad(refused.code, `${id}'s pairs.where: ${refused.fix}`, 'pairs.where', refused.allowed);
  }
  return null;
}

/** Every field whose change can make or unmake a pair: an update touching none of them is not looked at again. */
export function pairsReads(pairs: PairsDecl, fields: readonly FieldShape[]): string[] {
  const date = dateField(pairs, fields);
  return [
    ...pairs.on.map((x) => entryOf(x)?.field ?? x),
    pairs.opposite,
    pairs.across,
    pairs.mark,
    ...(date === null ? [] : [date]),
    ...readBy(pairs.where),
  ];
}

type Amount = { size: number; currency: string | null };

/** A money or a number as its size and currency, or `null` when it is neither. */
function amountOf(value: unknown): Amount | null {
  if (typeof value === 'number') return { size: Math.abs(value), currency: null };
  if (value !== null && typeof value === 'object' && typeof (value as { amount?: unknown }).amount === 'number') {
    const v = value as { amount: number; currency?: unknown };
    return { size: Math.abs(v.amount), currency: typeof v.currency === 'string' ? v.currency : null };
  }
  return null;
}

/** A signed number or amount as its sign, `0` for zero, `null` for neither. */
const signOf = (value: unknown): number | null => {
  const n = typeof value === 'number' ? value : amountOf(value) ? (value as { amount: number }).amount : null;
  return n === null ? null : Math.sign(n);
};

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** A row as the matching reads it: its fields, and the columns a `where` over `id`, `seq` or a timestamp reads. */
export type Leg = {
  id: string;
  seq: number | null;
  version: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  fields: Record<string, unknown>;
};

/** One register's `pairs:`, with what the matching needs to read the ledger. */
export type Pairing = { sql: Sql; register: string; pairs: PairsDecl; fields: readonly FieldShape[] };

const LEG_COLUMNS = 'id, seq, version, created_at, updated_at, deleted_at, fields';
type LegRow = Omit<Leg, 'fields'> & { fields: string };
const legOf = (r: LegRow): Leg => ({ ...r, fields: JSON.parse(r.fields) as Record<string, unknown> });

/** A row of this register by id, deleted or not, or `null`. */
export function loadLeg(p: Pairing, id: string): Leg | null {
  const r = p.sql.one<LegRow>(`SELECT ${LEG_COLUMNS} FROM entry WHERE id = ? AND register = ?`, id, p.register);
  return r ? legOf(r) : null;
}

/**
 * Whether a person, or an agent speaking for one, has said what this row's mark is.
 *
 * STEP 2b'S QUERY, WITH TWO THINGS IT DOES NOT HAVE TO SAY. The latest `edit` of the mark decides, and it pins unless a
 * mechanism or the pairing itself (`PAIRS_ACTOR`) signed it. A `create` pins only when it carried a value other than the
 * field's default: its `to_v` is the whole row with every default filled in, so a create that said nothing about the mark
 * holds `false` exactly as one that said `false`, and a form that sends every field it shows would otherwise pin every
 * row a person typed in and none of them would ever pair.
 *
 * NOT HERE: WHETHER AN UNCHANGED MARK WAS HIS WORD. held61 read it from the history, passing over a resent mark that
 * shared its batch with an edit of another field, and the checker found the case it cannot see: a row sent back with
 * nothing changed leaves one bare event and the mark's resend, the same two rows as his lone `{ moved: false }`. Only the
 * patch knows which it was, so `index.ts` writes the resend event only for a patch naming the mark alone.
 */
export function markPinned(p: Pairing, id: string): boolean {
  const mark = p.pairs.mark;
  const said = p.sql.one<{ actor: string; kind: string; to_v: string | null }>(
    `SELECT actor, kind, to_v FROM event WHERE target = ? AND ((kind = 'edit' AND field = ?) OR (kind = 'create' AND field IS NULL))
     ORDER BY rowid DESC LIMIT 1`,
    `entry:${id}`,
    mark,
  );
  if (!said || isMechanism(said.actor)) return false;
  if (said.kind === 'edit') return true;
  let row: unknown;
  try {
    row = said.to_v === null ? null : JSON.parse(said.to_v);
  } catch {
    return false;
  }
  const value = row !== null && typeof row === 'object' ? (row as Record<string, unknown>)[mark] : undefined;
  const declared = p.fields.find((f) => f.id === mark)?.default;
  return value !== undefined && value !== null && !same(value, declared);
}

/**
 * The currency a row's `on` says its bare number is in, or `null` when no field it names holds one on this row.
 *
 * THE ROW IS HELD TO WHAT THE DECLARATION CLAIMED. A text in `on` was let through at install on its word, and a text
 * holding `cleared` on both legs agrees exactly as a text holding `EGP` does, so the value itself has to be a code.
 */
function currencyOf(p: Pairing, leg: Leg): string | null {
  for (const said of p.pairs.on) {
    const e = entryOf(said);
    const f = e && !e.abs ? p.fields.find((x) => x.id === e.field) : undefined;
    const v = f && holdsCurrency(f) ? leg.fields[f.id] : undefined;
    if (isCode(v)) return v.toUpperCase();
  }
  return null;
}

/** The parts of a row the matching compares, or `null` when it has none to compare: no day, no amount, or zero. */
function shapeOf(p: Pairing, leg: Leg): { at: number; day: string; amount: Amount; way: unknown; across: unknown } | null {
  const date = dateField(p.pairs, p.fields);
  if (date === null) return null;
  const day = leg.fields[date];
  const at = typeof day === 'string' ? atMs(day) : null;
  if (at === null || typeof day !== 'string') return null;
  const sized = p.pairs.on.map((x) => entryOf(x)!).find((e) => e.abs)?.field ?? p.pairs.opposite;
  const amount = amountOf(leg.fields[sized]);
  /* ZERO NEVER MATCHES. Two zero rows in two accounts on one day are not a movement of anything. */
  if (amount === null || amount.size === 0) return null;
  /* A BARE NUMBER WITH NO CURRENCY ON ITS ROW IS NOBODY'S PARTNER, because 1000 of nothing in particular cannot be told
     from 1000 of anything else. */
  if (amount.currency === null && currencyOf(p, leg) === null) return null;
  const way = leg.fields[p.pairs.opposite];
  const across = leg.fields[p.pairs.across];
  if (way === undefined || way === null || across === undefined || across === null) return null;
  if (signOf(way) === 0) return null;
  return { at, day, amount, way, across };
}

/** Whether `b`'s day is inside `a`'s window. Checked both ways by the caller, because a month back from the 31st is not a month forward from the 1st. */
function inside(within: string, a: number, b: number): boolean {
  const lo = shiftFrom(a, `-${within}`);
  const hi = shiftFrom(a, `+${within}`);
  return lo !== null && hi !== null && b >= lo && b <= hi;
}

/** Whether two rows are the two legs of one transfer by every part of the declaration but `where` and the pin. */
function mirrors(p: Pairing, a: Leg, b: Leg): boolean {
  const x = shapeOf(p, a);
  const y = shapeOf(p, b);
  if (x === null || y === null) return false;
  const agrees = p.pairs.on.every((said) => {
    const e = entryOf(said)!;
    if (!e.abs) return b.fields[e.field] !== undefined && same(b.fields[e.field], a.fields[e.field]);
    const m = amountOf(a.fields[e.field]);
    const n = amountOf(b.fields[e.field]);
    return m !== null && n !== null && m.size === n.size && m.currency === n.currency;
  });
  if (!agrees) return false;
  /* OPPOSITE WAYS: a signed amount of the other sign and the same size and currency, or the enum's other value. */
  if (signOf(x.way) !== null) {
    const theirs = amountOf(y.way);
    const mine = amountOf(x.way)!;
    if (theirs === null || signOf(y.way) !== -signOf(x.way)! || theirs.size !== mine.size || theirs.currency !== mine.currency) return false;
  } else if (same(y.way, x.way)) return false;
  if (same(x.across, y.across)) return false;
  return inside(p.pairs.within, x.at, y.at) && inside(p.pairs.within, y.at, x.at);
}

/**
 * Whether a row can be anybody's partner at all: live, one `where` matches, and its mark nobody has pinned.
 *
 * A VOID OR PENDING ROW IS NOBODY'S PARTNER when `where` says so. The void row was never counted, so pairing it hid
 * nothing of its own and hid the real payment beside it.
 */
function pairable(p: Pairing, leg: Leg): boolean {
  if (leg.deleted_at !== null || shapeOf(p, leg) === null) return false;
  if (p.pairs.where !== undefined) {
    const row = { id: leg.id, seq: leg.seq, version: leg.version, created_at: leg.created_at, updated_at: leg.updated_at };
    if (!evaluate(p.pairs.where, leg.fields, schemaOf(p.register, p.fields), row)) return false;
  }
  return !markPinned(p, leg.id);
}

/**
 * The rows that could be the other leg of `leg`, each with how far its day is from `leg`'s.
 *
 * THE WINDOW IS THE SQL AND THE REST IS READ HERE. The rows are the live ones whose day falls inside `within` of this
 * one, which is one range over a field a ledger indexes; what they then have to agree on is a handful of comparisons on
 * a handful of rows, and a JSON path per `on` entry built into SQL would be the same rule said twice.
 *
 * A PAIRED ROW IS STILL A CANDIDATE. Whether it stays paired is `partnerOf`'s question, and leaving it out here is what
 * let the first row to arrive keep a leg a nearer one was the real partner of.
 *
 * `leg` ITSELF IS NOT ASKED WHETHER IT CAN PAIR, only the rows around it, so `settle` can ask who stood near a row as it
 * was before a write, whatever the write did to it.
 */
function candidatesOf(p: Pairing, leg: Leg): { leg: Leg; gap: number }[] {
  const date = dateField(p.pairs, p.fields);
  const shape = shapeOf(p, leg);
  if (date === null || shape === null) return [];
  const lo = shiftFrom(shape.at, `-${p.pairs.within}`);
  const hi = shiftFrom(shape.at, `+${p.pairs.within}`);
  if (lo === null || hi === null) return [];
  const toDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const rows = p.sql.all<LegRow>(
    `SELECT ${LEG_COLUMNS} FROM entry WHERE register = ? AND deleted_at IS NULL AND id <> ?
       AND json_extract(fields, '$.${date}') BETWEEN ? AND ?`,
    p.register,
    leg.id,
    toDay(lo),
    toDay(hi),
  );
  const out: { leg: Leg; gap: number }[] = [];
  for (const r of rows) {
    const other = legOf(r);
    if (!mirrors(p, leg, other) || !pairable(p, other)) continue;
    out.push({ leg: other, gap: Math.abs(shapeOf(p, other)!.at - shape.at) });
  }
  return out;
}

/** The one candidate nearest in time, or `null` when there is none or two are equally near. */
function nearestIn(near: readonly { leg: Leg; gap: number }[]): Leg | null {
  if (near.length === 0) return null;
  const least = Math.min(...near.map((c) => c.gap));
  const at = near.filter((c) => c.gap === least);
  /* A TIE IS NOT GUESSED. The lower id won before, which is the order rows were minted in, so which of two equal credits
     hid the payment depended on which line the bank printed first. */
  return at.length === 1 ? at[0]!.leg : null;
}

function nearestOf(p: Pairing, leg: Leg): Leg | null {
  return pairable(p, leg) ? nearestIn(candidatesOf(p, leg)) : null;
}

/** A leg and the rows that could be its partner, as `candidatesOf` answers them. */
type Near = { leg: Leg; near: { leg: Leg; gap: number }[] };

/* HOW MANY ALIKE LEGS ARE ANSWERED AS ONE SET. A move split in halves, or one top-up a day for a week, is a handful; past
   this the set is answered leg by leg, nearest to nearest, as it was before sets were read at all. */
const SET_MOST = 32;

/**
 * The legs alike enough to be one another's partner, followed from `leg` through every candidate of every candidate.
 *
 * `whole` IS FALSE PAST `SET_MOST`, and `set` then holds the legs read before it stopped. Every leg of a whole set finds
 * the same set, because a candidate is one both ways (`mirrors` checks the window from each side, and every leg in it
 * passed `pairable`), so the answer it gives each leg is the same from wherever it was asked.
 */
function setOf(p: Pairing, leg: Leg): { set: Map<string, Near>; whole: boolean } {
  const set = new Map<string, Near>();
  const queue = [leg];
  while (queue.length > 0) {
    const next = queue.shift()!;
    if (set.has(next.id)) continue;
    if (set.size === SET_MOST) return { set, whole: false };
    const near = candidatesOf(p, next);
    set.set(next.id, { leg: next, near });
    for (const c of near) if (!set.has(c.leg.id)) queue.push(c.leg);
  }
  return { set, whole: true };
}

/**
 * A whole set's legs matched in day order, each to one of the other way, or `null` when that is a guess or not needed.
 *
 * AUDIT SIXTY-ONE'S FINDING 2. The tie rule refused M1, one EGP 100,000.00 move sent as two halves of 50,000.00 on one day,
 * and M2, two top-ups of 5,000.00 each landing the next day, and both figures counted money that only moved: every
 * candidate was tied, though any way of matching those legs hides exactly the same money. The legs of a set agree on
 * every `on` entry and so on size and currency (`mirrors`), so when as many go one way as the other every leg is one
 * half of a move, and which half it is paired with changes no figure. Matched in day order, first out with first in,
 * the days are as near as any matching can make them in total, which is what the nearest rule asks one leg at a time.
 *
 * STILL A GUESS WHEN THE COUNTS DIFFER, because some leg is left over and nothing in the ledger says which. AND NOT USED
 * WHERE NOTHING IS TIED: there each leg's nearest answers it, and a set matched in day order can differ from that (an
 * out on day 0 and 1, an in on day 1 and 5, pairs the day-1 legs by nearness and all four by order), which is a change to
 * rows no tie ever held and not this repair. A matching that pairs two legs in one account, or two out of each other's
 * window, is no matching, and the set is answered leg by leg.
 *
 * LEGS ON ONE DAY GO IN `across` ORDER, AND ONLY THEN IN `seq` ORDER. `seq` is the order the bank listed them, the
 * arrival order the tie rule refused to break by, and ordering one day by it alone let that order decide whether a set
 * paired at all: a CIB out and an NBE out against an HSBC in and a CIB in, all one day, paired all four when the HSBC in
 * was listed first and none when the CIB in was, since first with first then put the CIB legs together and the matching
 * was refused (`pairs-ties.test.ts`, ONE ANSWER IN EVERY ORDER). With the account first, `seq` only says which of two
 * legs alike in everything names which, and the rows paired and the figures are the same in every order (M1).
 */
function matchedOf(p: Pairing, set: Map<string, Near>): Map<string, string> | null {
  const members = [...set.values()];
  if (!members.some((m) => m.near.length > 0 && nearestIn(m.near) === null)) return null;
  const sides = new Map<string, { leg: Leg; at: number; across: string }[]>();
  for (const m of members) {
    const shape = shapeOf(p, m.leg)!;
    const sign = signOf(shape.way);
    const side = sign === null ? JSON.stringify(shape.way) : String(sign);
    sides.set(side, [...(sides.get(side) ?? []), { leg: m.leg, at: shape.at, across: JSON.stringify(shape.across) }]);
  }
  if (sides.size !== 2) return null;
  const [one, other] = [...sides.values()].map((legs) =>
    legs.sort(
      (a, b) =>
        a.at - b.at ||
        (a.across < b.across ? -1 : a.across > b.across ? 1 : 0) ||
        (a.leg.seq ?? Infinity) - (b.leg.seq ?? Infinity) ||
        (a.leg.id < b.leg.id ? -1 : 1),
    ),
  );
  if (one!.length !== other!.length) return null;
  const matched = new Map<string, string>();
  for (const [i, a] of one!.entries()) {
    const b = other![i]!;
    if (!set.get(a.leg.id)!.near.some((c) => c.leg.id === b.leg.id)) return null;
    matched.set(a.leg.id, b.leg.id);
    matched.set(b.leg.id, a.leg.id);
  }
  return matched;
}

/** Every leg of a whole set with its partner: matched in day order when `matchedOf` says so, else nearest to nearest. */
function answersOf(p: Pairing, set: Map<string, Near>): Map<string, string | null> {
  const matched = matchedOf(p, set);
  const out = new Map<string, string | null>();
  for (const [id, m] of set) {
    if (matched) {
      out.set(id, matched.get(id) ?? null);
      continue;
    }
    const near = nearestIn(m.near);
    out.set(id, near !== null && nearestIn(set.get(near.id)!.near)?.id === id ? near.id : null);
  }
  return out;
}

/**
 * The row this one is paired with in the ledger as it stands, or `null`: each must be the other's one nearest candidate,
 * or the two matched in day order in a set of alike legs that ties and holds as many each way (`matchedOf`).
 *
 * MUTUAL, SO THE ANSWER IS THE SAME FROM EITHER SIDE and does not depend on which leg was written last. A row whose
 * nearest candidate is nearer to somebody else stays unpaired and counted; that is the side a mistake should fall on.
 */
export function partnerOf(p: Pairing, leg: Leg): string | null {
  return answerOf(p, leg, new Map()).to;
}

/** `partnerOf`, with the legs of the set it read, and every answer that set gave kept in `known` for the next leg asked. */
function answerOf(p: Pairing, leg: Leg, known: Map<string, string | null>): { to: string | null; set: string[] } {
  if (known.has(leg.id)) return { to: known.get(leg.id)!, set: [] };
  if (leg.deleted_at !== null || !pairable(p, leg)) return { to: null, set: [] };
  const { set, whole } = setOf(p, leg);
  if (whole) {
    for (const [id, to] of answersOf(p, set)) known.set(id, to);
    return { to: known.get(leg.id) ?? null, set: [...set.keys()] };
  }
  const near = nearestOf(p, leg);
  return { to: near !== null && nearestOf(p, near)?.id === leg.id ? near.id : null, set: [...set.keys()] };
}

/* A BOUND ON ONE WRITE'S RESETTLING. The rows a write can move are its neighbours old and new, their partners and the
   set of alike legs they stand in, a handful on any ledger a bank writes; the bound is against a runaway, not a budget
   anything should reach. */
const SETTLE_MOST = 256;

/**
 * Every row whose pair a write has changed, with the partner it now has (`null` for none).
 *
 * WHO CAN BE MOVED BY ONE WRITE. A row's nearest candidate changes only if the written row was, or now is, one of its
 * candidates; so `seeds` are the written row, the rows that stood near it before the write, and the rows near it now.
 * Each one's partner is asked again, and so is every row it was paired with or now pairs with, until nothing new comes
 * up. A row outside that set has the same candidates it had, so it has the same answer.
 *
 * AND EVERY LEG OF THE SET EACH ONE STANDS IN, because a set matched in day order moves as one: the last leg of three
 * moves arriving pairs the first move too, which is five days from it and was paired with nothing, so neither a
 * neighbour nor a `_pair` leads there (`pairs-ties.test.ts`, the chain). A set the write broke apart is reached the same
 * way, since each piece of it holds a row that stood next to the written one.
 */
export function settle(p: Pairing, seeds: readonly string[]): { leg: Leg; to: string | null }[] {
  const want = new Map<string, { leg: Leg; to: string | null }>();
  const known = new Map<string, string | null>();
  const queue = [...seeds];
  while (queue.length > 0 && want.size < SETTLE_MOST) {
    const id = queue.shift()!;
    if (want.has(id)) continue;
    const leg = loadLeg(p, id);
    if (!leg) continue;
    const { to, set } = answerOf(p, leg, known);
    want.set(id, { leg, to });
    const held = leg.fields._pair;
    for (const next of [typeof held === 'string' ? held : null, to, ...set]) if (next !== null && !want.has(next)) queue.push(next);
  }
  /* AND A PAIRED ROW WHOSE MARK IS NOT TRUE, which only a mechanism can leave behind: a rule's `false` is not a pin
     (`isMechanism`), so the pair it contradicts still stands and the mark is put back to what the pair says. */
  return [...want.values()].filter(({ leg, to }) => (leg.fields._pair ?? null) !== to || (to !== null && leg.fields[p.pairs.mark] !== true));
}

/** The rows that could be `leg`'s partner, by id: `settle`'s seeds for a row as it was, or as it is. */
export function neighboursOf(p: Pairing, leg: Leg): string[] {
  return candidatesOf(p, leg).map((c) => c.leg.id);
}

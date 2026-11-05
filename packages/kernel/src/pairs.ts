/**
 * THE TWO LEGS OF A TRANSFER, FOUND AND MARKED, AND UNMARKED WHEN THEY STOP BEING ONE.
 *
 * Money moved between two of one person's own accounts is written as two rows, one leaving and one arriving, and a
 * ledger that reads each as it stands counts the move twice: once as spend and once as income. An import writes every
 * such move that way, and every Ledger figure says `transfer is false`, so until both legs were marked by hand the
 * month's spend held money that was only moved.
 *
 * `02 §5`'s register option: `pairs: { on, opposite, across, within, date?, mark, where? }`. Two rows that agree on every
 * `on` entry, face opposite ways, sit in different accounts, fall inside the window and both pass `where` are one
 * transfer. Both are MARKED, never hidden: `mark` names a `bool` field the kernel sets true on each, and `_pair` beside it
 * names the other row, so a person can see why a row stopped counting and undo it. Zero never matches, because two zero
 * rows are not a movement.
 *
 * A PAIR IS A FUNCTION OF THE LEDGER AS IT STANDS, NOT OF THE ORDER IT WAS WRITTEN IN. The first form made a pair once
 * and kept it whatever happened, and what that costs was measured: a leg corrected from GBP 400.00 to 900.00, a leg
 * retyped from in to out, and a leg deleted each left the other marked, so Spent read 0.00 against 900.00, 800.00 and
 * 400.00. And a credit listed before its own debit took the rent two days away, because it was the only candidate when
 * the credit arrived. So two rows are paired when, and only while, each is the other's one nearest candidate
 * (`partnerOf`), and every write that could move that answer settles it again for the rows around it (`settle`). A tie
 * is not broken by id or by arrival: two legs equally near leave the row unpaired, which counts the money rather than
 * guessing which move hid it, UNLESS NO MATCHING OF THE TIED ROWS COULD HIDE THE WRONG MONEY (`matchedOf`): alike legs
 * are matched in day order, and a leg left over only when no other could be left over at as few days' cost, and never
 * while a row outside the set may yet be one of its legs.
 *
 * A MARK A PERSON SET IS HIS (`41 §5.4` step 6b, `§13 #10`). The kernel never writes over it and never pairs the row,
 * and a person unmarking one leg of a pair unpairs the other, which is the undo the first form promised and did not
 * have. HIS `true` IS KEPT OUT AS HIS `false` IS, and that has a measured cost: a transfer he typed and ticked before
 * the savings statement arrived leaves the statement's leg counted, GBP 4,000.00 read as received, until he ticks that
 * one too. Letting his `true` take a partner was tried and was refused, because a ticked card bill is the same write
 * and took a REFUND that was nobody's transfer (`pairs-undo.test.ts`), and the sample record's two typed legs paired
 * each other (`packages/seed/test/money-pairs.test.ts`). The spec says both are kept out; changing that is the owner's
 * call and not the kernel's. What a person did NOT say is not a pin: a whole row sent back with the mark as it was is
 * not his word on the mark (the write path in `index.ts` decides).
 *
 * IN THE KERNEL'S WRITE PATH AND NOT IN A RULE, because a `where:` cannot say "a row of this register that mirrors me",
 * and because the import writes through `create` and so will the bank door after the cut-over: one build serves both.
 */

import type { Param, Refusal, Sql } from '@braindog/ports';
import { compile, evaluate, type Predicate, type Schema } from '@braindog/where';

import { isCurrencyCode } from './coerce.ts';
import { convertMinor, rateFor, ratesFrom, type Rate } from './fx.ts';
import { ratesRole, type RoleList } from './roles.ts';
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
  /**
   * A move between two currencies pairs too, the earlier leg at the rate of its own day, when the two amounts are
   * within `tolerance` percent of each other. Absent, two currencies never pair. Only on a rate no more than two days
   * older than that day, and only where each row is the other's one candidate: anything else is a question for a
   * person (`crossAsks`), never a pair.
   */
  across_currency?: { tolerance: number };
};

type FieldShape = { id: string; type: string; values?: unknown; of?: unknown; to?: unknown; default?: unknown; retired?: boolean };

const PAIRS_KEYS = ['on', 'opposite', 'across', 'within', 'date', 'mark', 'where', 'across_currency'] as const;
/* THE MOST TWO LEGS OF ONE MOVE MAY DIFFER BY, in percent. A bank's own rate sits a point or two off the day's; past
   this the rule would be matching sizes that only look alike. */
const TOLERANCE_MOST = 10;
const NUMERIC = new Set(['money', 'int', 'decimal']);
/* THREE LETTERS ISO ASSIGNS, in either case, since a text field is not upper-cased on the way in as a money is. */
const CODE = /^[A-Za-z]{3}$/;
const isCode = (v: unknown): v is string => typeof v === 'string' && CODE.test(v) && isCurrencyCode(v.toUpperCase());

/**
 * Whether a field can say which currency a bare number is in: a `text`, or an `enum` whose every value is a currency.
 *
 * NOT A FIELD NAME, because the kernel is a shell and one ledger's `currency` is another's `ccy`. AND NOT ANY TEXT,
 * ENUM OR REF, which is what this was: `state` put in `on`, an enum of pending and cleared that every counted row holds
 * alike, paired -1000 in one currency with +1000 in another. An enum says its values at install, so it is checked
 * there. A text can hold anything, so it is taken at its word here and each row is held to it in `currencyOf`. A `ref`
 * holds a row id, and nothing here can read the row it names, so it is refused rather than trusted.
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
      return bad('DECLARATION_INVALID', `${id}'s pairs has no key ${key}. It takes on, opposite, across, within, date, mark, where and across_currency.`, `pairs.${key}`, PAIRS_KEYS);

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
    if (f.type === 'secret') return bad('DECLARATION_INVALID', `${id}'s pairs.on names ${f.id}, a secret, which nothing outside the keychain reads.`, 'pairs.on');
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

  /* A BARE NUMBER CARRIES NO CURRENCY, so the declaration has to compare the field that does. A money is compared by
     the currency inside it (`amountOf`); an `int` is not, and `on: [abs(amount)]` installed over an `int` paired -1000
     in one currency out of one bank with +1000 in another currency into a second, and `state` named beside it did the
     same, so the field named has to be one that can hold a currency (`holdsCurrency`). */
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

  /* ── where ── WHICH ROWS ARE MONEY THAT MOVED IS THE REGISTER'S TO SAY, and nothing the kernel can know. Money-core
     says it with a `state` of pending, cleared or void and counts `state is cleared`; its `done:` holds `void` too, so
     `done:` is not the answer, and a field name written here would be one ledger's words in the shell. Measured: a
     cleared GBP 250.00 payment paired with a void credit and Spent read 0.00. THE TREE AND NOT THE SENTENCE, as
     `required_when:` takes it: the match runs on every write with no clock and no ref lookup to hand, and a sentence
     needs both to be read. */
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

  /* ── across_currency ── ONLY OVER A MONEY, WHICH HOLDS ITS OWN CURRENCY. A bare number says its currency in a field
     `on` makes both rows hold alike, so that declaration has already said two currencies are never one move, and there
     is no one value to convert. */
  if (said.across_currency !== undefined) {
    const ac = said.across_currency;
    const shape = `${id}'s pairs.across_currency says how far apart the two amounts of one move may be in percent, at the rate of the day it left, as { tolerance: 2 }`;
    if (ac === null || typeof ac !== 'object' || Array.isArray(ac)) return bad('DECLARATION_INVALID', `${shape}, and ${JSON.stringify(ac)} is not that.`, 'pairs.across_currency', ['tolerance']);
    const extra = Object.keys(ac).find((key) => key !== 'tolerance');
    if (extra !== undefined) return bad('DECLARATION_INVALID', `${shape}. It has no key ${extra}.`, `pairs.across_currency.${extra}`, ['tolerance']);
    const tolerance = (ac as { tolerance?: unknown }).tolerance;
    if (typeof tolerance !== 'number' || !Number.isFinite(tolerance) || tolerance <= 0 || tolerance > TOLERANCE_MOST)
      return bad(
        'DECLARATION_INVALID',
        `${shape}. The tolerance is a number above 0 and at most ${TOLERANCE_MOST}, and ${JSON.stringify(tolerance)} is not.`,
        'pairs.across_currency.tolerance',
      );
    if (sized.type !== 'money' || !entries.some((e) => e.abs))
      return bad(
        'DECLARATION_INVALID',
        `${id}'s pairs.across_currency converts one amount into the other's currency, so on has to compare a money as abs(amount). ${sized.id} is a ${sized.type}${sized.type === 'money' ? ' that on does not name' : ', which holds no currency of its own'}.`,
        'pairs.across_currency',
        live.filter((f) => f.type === 'money').map((f) => f.id),
      );
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

/**
 * One register's `pairs:`, with what the matching needs to read the ledger.
 *
 * `state` AND `done` ARE THE REGISTER'S OWN, and every `Pairing` says them, `undefined` where the register has none:
 * they tell a row `where` refuses for good from one it refuses until the bank clears it (`waiting`). They were optional
 * in the first attempt at a pending half, the kernel built its `Pairing` without them, and every refused row was taken
 * for one that may clear: a client's cleared 20,000.00 that names its party held a split move back, and Spent and
 * Received each read 40,000.00 high. Required, a caller that leaves them out does not compile.
 *
 * `ruled` IS WHAT A PERSON ANSWERED ABOUT TWO ROWS IN TWO CURRENCIES, by `crossKey`: `true` makes them one move
 * whatever the rate's age and whoever else stands near, `false` takes each out of the other's candidates for good.
 * Left out, nobody has answered anything, and a doubtful match waits as a question (`crossAsks`).
 *
 * `asks` IS THE CALLER SAYING IT PUTS `crossAsks` TO A PERSON. Only then is a match with nothing against it but its
 * being a near one (`lone`) held back for an answer, and a wider spread than the list declares (`spread`) asked about.
 * Left out, nobody would be asked, so the matching pairs what it paired before: a row held back for a question no one
 * puts is only money counted twice.
 */
export type Pairing = {
  sql: Sql;
  register: string;
  pairs: PairsDecl;
  fields: readonly FieldShape[];
  state: string | undefined;
  done: readonly string[] | undefined;
  ruled?: ReadonlyMap<string, boolean>;
  asks?: boolean;
};

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
 * NOT HERE: WHETHER AN UNCHANGED MARK WAS HIS WORD. A first attempt read it from the history, passing over a resent
 * mark that shared its batch with an edit of another field, and there is a case the history cannot see: a row sent back
 * with nothing changed leaves one bare event and the mark's resend, the same two rows as his lone `{ moved: false }`.
 * Only the patch knows which it was, so `index.ts` writes the resend event only for a patch naming the mark alone.
 */
export function markPinned(p: Pairing, id: string): boolean {
  return pinnedBy(p, id) !== null;
}

/**
 * Who pinned this row's mark (`markPinned`), or `null` when nobody has.
 *
 * THE ACTOR AND NOT ONLY THE ANSWER, because an update that renames the mark carries his word to the new field
 * (`carryPins`, called from `index.ts`'s `settleRedeclared`) and the history has to say whose word it still is.
 */
export function pinnedBy(p: Pairing, id: string): string | null {
  const mark = p.pairs.mark;
  const said = p.sql.one<{ actor: string; kind: string; to_v: string | null }>(
    `SELECT actor, kind, to_v FROM event WHERE target = ? AND ((kind = 'edit' AND field = ?) OR (kind = 'create' AND field IS NULL))
     ORDER BY rowid DESC LIMIT 1`,
    `entry:${id}`,
    mark,
  );
  if (!said || isMechanism(said.actor)) return null;
  if (said.kind === 'edit') return said.actor;
  let row: unknown;
  try {
    row = said.to_v === null ? null : JSON.parse(said.to_v);
  } catch {
    return null;
  }
  const value = row !== null && typeof row === 'object' ? (row as Record<string, unknown>)[mark] : undefined;
  const declared = p.fields.find((f) => f.id === mark)?.default;
  return value !== undefined && value !== null && !same(value, declared) ? said.actor : null;
}

/** One pin `carryPins` found: the row as it stands, the value a person said on the old mark, and who said it. */
export type Carried = { leg: Leg; value: boolean; by: string };

/**
 * How many versions of a list `carryPins` reads back for the old mark's shape: the one being installed and the one it
 * replaces, which declared the old mark, since `pairsFault` refuses a `pairs.mark` naming no `bool` field.
 */
const CARRY_VERSIONS = 2;

/**
 * The old mark's field as the list declared it, for its `default`, which is how `pinnedBy` tells a create that said
 * something about the mark from one that only filled it in.
 *
 * FROM THE NEW DECLARATION WHEN IT STILL HOLDS THE FIELD, AND FROM THE ONE BEFORE IT WHEN THE RENAME DROPPED IT. Read
 * off the new fields alone, a dropped mark has no default, and every row a person typed in with `false` filled in would
 * read as his "not a transfer" and never pair again.
 */
function markShape(p: Pairing, field: string): FieldShape | undefined {
  const now = p.fields.find((f) => f.id === field);
  if (now) return now;
  const bodies = p.sql.all<{ body: string }>(
    "SELECT body FROM declaration WHERE id = ? AND kind = 'register' ORDER BY version DESC LIMIT ?",
    `register.${p.register}`,
    CARRY_VERSIONS,
  );
  for (const { body } of bodies) {
    try {
      const fields = (JSON.parse(body) as { fields?: unknown }).fields;
      const was = Array.isArray(fields) ? (fields as FieldShape[]).find((f) => f !== null && typeof f === 'object' && f.id === field) : undefined;
      if (was) return was;
    } catch {
      /* A VERSION THIS CANNOT PARSE SAYS NOTHING ABOUT THE FIELD, so the one before it is asked. */
    }
  }
  return undefined;
}

/**
 * Every row whose old mark a person pinned, with what he said, when an install moves `pairs.mark` from `from` to `to`.
 * `p` is the list under the new declaration, whose `pairs.mark` is `to`.
 *
 * WHAT A RENAME LOST, MEASURED AT `56b35c41`. The pass that settles the list under the new declaration asks
 * `markPinned` of the new field only, and nobody had said anything there: the dinner he unticked on `transfer` paired
 * with Omar's repayment and read `moved: true`, Spent 0.00 against EGP 20,000.00, and a move he typed and ticked read
 * `moved: false`, so money that only moved read as spent (`pairs-followups.test.ts`, ONE). What he said was about the
 * row, whether it is one leg of a move, and not about the field it was written in.
 *
 * IT ANSWERS AND THE CALLER WRITES, as `settle` answers and `index.ts` writes the legs. The carried value is an `edit` on
 * the new field signed by the actor `pinnedBy` names, so `markPinned` reads it as his word, with a note saying it came
 * from the old field on this install; that event needs the kernel's minter, clock and batch, which a `Pairing` does not
 * hold. A mark the pairing set itself (`PAIRS_ACTOR`) or a mechanism wrote is not a pin, so it is not carried and the
 * pass derives it again.
 *
 * A ROW WHERE SOMEBODY SPOKE ON THE NEW FIELD LATER THAN ON THE OLD ONE KEEPS THAT, since it is the nearer word, and
 * only then. A first cut kept any word on the new field, and a mark renamed there and back measured the cost: dinner's
 * "not a transfer" was carried to `moved`, he ticked it there, and the update back to `transfer` kept the older false
 * still standing in `transfer`, so his tick was lost and dinner read as spent, EGP 20,000.00
 * (`pairs-followups.test.ts`, RENAMED THERE AND BACK). A word a create left, with no edit, is older than any edit.
 *
 * DELETED ROWS ARE CARRIED TOO, so a restore finds the pin it left with. ONLY A ROW THAT COULD HOLD A PIN IS ASKED: one
 * with an `edit` of the old mark in its history, or whose old mark is not the field's default, which is what a create
 * that pinned leaves; every other row answers `null` in `pinnedBy`.
 *
 * NOTHING IS CAPPED, as `settleRedeclared`'s pass is not: the rows walked are the list's, once, in the install's
 * transaction, and a cap would drop his word on every row past it, which is the finding again.
 */
export function carryPins(p: Pairing, from: string, to: string): Carried[] {
  if (from === to) return [];
  const shape = markShape(p, from);
  const old: Pairing = { ...p, pairs: { ...p.pairs, mark: from }, fields: shape && !p.fields.includes(shape) ? [...p.fields, shape] : p.fields };
  const declared = shape?.default;
  /* THE OLD MARK'S DEFAULT AS `json_type` NAMES IT, so a row still holding it, with no edit of it, is not asked. */
  const unsaid = declared === true ? 'true' : declared === false ? 'false' : 'null';
  const rows = p.sql.all<{ id: string }>(
    `SELECT id FROM entry WHERE register = ? AND (coalesce(json_type(fields, ?), 'null') <> ?
       OR EXISTS (SELECT 1 FROM event WHERE target = 'entry:' || entry.id AND kind = 'edit' AND field = ?))`,
    p.register,
    `$.${from}`,
    unsaid,
    from,
  );
  const last = (id: string, field: string): number =>
    p.sql.one<{ n: number | null }>("SELECT max(rowid) AS n FROM event WHERE target = ? AND kind = 'edit' AND field = ?", `entry:${id}`, field)?.n ?? 0;
  const carried: Carried[] = [];
  for (const r of rows) {
    const by = pinnedBy(old, r.id);
    if (by === null || (markPinned(p, r.id) && last(r.id, to) >= last(r.id, from))) continue;
    const leg = loadLeg(p, r.id);
    const value = leg?.fields[from];
    if (leg && typeof value === 'boolean') carried.push({ leg, value, by });
  }
  return carried;
}

/**
 * The currency a row's `on` says its bare number is in, or `null` when no field it names holds one on this row.
 *
 * THE ROW IS HELD TO WHAT THE DECLARATION CLAIMED. A text in `on` was let through at install on its word, and a text
 * holding `cleared` on both legs agrees exactly as a text holding `USD` does, so the value itself has to be a code.
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

/** The field a row's size is read from: the first `abs(...)` in `on`, else the signed `opposite`. */
const sizedField = (p: Pairing): string => p.pairs.on.map((x) => entryOf(x)!).find((e) => e.abs)?.field ?? p.pairs.opposite;

/** The parts of a row the matching compares, or `null` when it has none to compare: no day, no amount, or zero. */
function shapeOf(p: Pairing, leg: Leg): { at: number; day: string; amount: Amount; way: unknown; across: unknown } | null {
  const date = dateField(p.pairs, p.fields);
  if (date === null) return null;
  const day = leg.fields[date];
  const at = typeof day === 'string' ? atMs(day) : null;
  if (at === null || typeof day !== 'string') return null;
  const amount = amountOf(leg.fields[sizedField(p)]);
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

type Shape = NonNullable<ReturnType<typeof shapeOf>>;

/**
 * Whether two rows are the two legs of one transfer by every part of the declaration but `where` and the pin.
 *
 * `shape` IS HOW A ROW'S SHAPE IS READ, `shapeOf` unless a pass over the whole list has read each one already (`Ledger`).
 */
function mirrors(p: Pairing, a: Leg, b: Leg, shape: (leg: Leg) => Shape | null = (leg) => shapeOf(p, leg)): boolean {
  const x = shape(a);
  const y = shape(b);
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
  return matchesWhere(p, leg) && !markPinned(p, leg.id);
}

function matchesWhere(p: Pairing, leg: Leg): boolean {
  if (p.pairs.where === undefined) return true;
  const row = { id: leg.id, seq: leg.seq, version: leg.version, created_at: leg.created_at, updated_at: leg.updated_at };
  return evaluate(p.pairs.where, leg.fields, schemaOf(p.register, p.fields), row);
}

/**
 * Whether a live row that is nobody's partner today may still be one leg of a move: `where` refuses it, and it may yet
 * clear into one `where` lets through.
 *
 * A PENDING HALF. A bank alert writes a credit pending before it clears, and a pending half left the set around it two
 * outs and two ins with a client's payment of the same size as the second in: day order matched the client with the
 * second out, 20,000.00 read as received 0.00, and once the half cleared all five unpaired. A row like this one is not
 * in the set, so the set cannot say which of its legs this row's partner is, and it is matched leg by leg until it can
 * be (`matchedOf`).
 *
 * A ROW WHOSE MARK A PERSON PINNED IS NOT ONE, WHICHEVER WAY IT WAS PINNED. A pinned `false` says the row is not a
 * transfer, so no leg is waiting for it, and held back like a pending row, unticking a client's payment left the halves
 * beside it counted, Spent 40,000.00 high, measured. A pinned `true` waited once, on the reading that it says a move
 * landed and not which row is the other leg, and what that cost was measured: a person typed 20,000.00 out of account A
 * and ticked it, the bank then sent the real out of A and in to B the same day, and the bank's two legs stayed apart
 * for good, Spent and Received 20,000.00 each where they read 0. A pinned row is never a partner (`pairable`), so a
 * wait on it never ends. The owner's call: only a row that clears on its own holds a pair back
 * (`pairs-followups.test.ts`, FOUR).
 *
 * A ROW NO FINAL STATE WOULD LET THROUGH IS NOT ONE EITHER, and neither is a row already in one. The first attempt
 * took every row `where` refuses for one that may clear, and the kernel handed it no `done`, so under Money's clause a
 * client's cleared 20,000.00 that names Nile Design held a split move back, and so did a void half that bounced:
 * Spent and Received each 40,000.00 high, for good, measured. A row whose `state` is one of the register's `done:`
 * values is where it will stay. Any other is asked what `where` would say were it in each of them, since that is the
 * move a bank makes to it, and waits only if one lets it through: a bare pending half does, and a pending payment that
 * names its party does not.
 *
 * A REGISTER THAT DECLARES NO `done:` HAS SAID NO STATE IS FINAL, AND ONE WITH NO `state:` HAS NAMED NO LIFECYCLE, and
 * both used to have no row that waits. Measured at `56b35c41`, that left a pending half's set matched in day order and
 * the client hidden as its second in, Received 0.00 against 20,000.00 (`pairs-followups.test.ts`, TWO). So without
 * `done:` a row may move to any value its state declares, and without `state:` any enum `where` reads is a field that
 * may move so; a text, a number or a ref is what the row says and stays, so a payment refused for the party it names
 * still waits for nothing. The cost falls on the counted side: a void half there is a row that may be put back, and
 * holds a tied set back until the register says void is final or the row goes.
 *
 * AN UNRELATED PENDING ROW OF THE SAME SIZE IN THE WINDOW HOLDS A SET BACK TOO, until it clears: measured, a pending
 * credit three days after a split move left all four halves counted, 40,000.00 each way. Nothing in the rows says
 * whose leg a pending credit is, and the side this falls on is the counted one.
 */
function waiting(p: Pairing, leg: Leg): boolean {
  if (leg.deleted_at !== null || shapeOf(p, leg) === null) return false;
  if (p.pairs.where === undefined || markPinned(p, leg.id)) return false;
  const moving = p.state !== undefined ? [p.state] : [...new Set(readBy(p.pairs.where))].filter((id) => id !== p.pairs.mark);
  return moving.some((id) => {
    const f = p.fields.find((x) => x.id === id && x.retired !== true);
    const final = id === p.state ? p.done : undefined;
    const now = leg.fields[id];
    if (final !== undefined && typeof now === 'string' && final.includes(now)) return false;
    const values = final ?? (f?.type === 'enum' && Array.isArray(f.values) ? (f.values as unknown[]) : []);
    return values.some((to) => !same(to, now) && matchesWhere(p, { ...leg, fields: { ...leg.fields, [id]: to } }));
  });
}

/**
 * The rows that could be the other leg of `leg`, each with how far its day is from `leg`'s.
 *
 * THE WINDOW AND THE SIZE ARE THE SQL AND THE REST IS READ HERE. The rows are the live ones whose day falls inside
 * `within` of this one and whose size is this one's; what they then have to agree on is a handful of comparisons on a
 * handful of rows, and a JSON path per `on` entry built into SQL would be the same rule said twice.
 *
 * THE SIZE IS IN THE SQL BECAUSE A BUSY WINDOW WAS PARSED WHOLE. Measured on 10,000 rows of fifty round amounts packed
 * into one year, 27 a day: the install pass that settles a ledger under a new `pairs:` took 251 s, 21 of them in this
 * function, most of that parsing the 250 rows of each window in JS to keep the five of its size. It narrows and never
 * widens: two legs of one move are the same size whatever else `on` compares (`mirrors`), the size is read the way
 * `amountOf` reads it, a money's `amount` or a bare number, and `mirrors` still decides every row it lets through.
 * Measured, a pass over 5,000 rows of three shapes leaves the same ledger with the size in the SQL as without it.
 *
 * NOT FOUND BY AN INDEX ON ITS OWN. With no statistics SQLite plans this through `entry_state` on the list alone, even
 * with the register written in as a literal beside a declared index on the day: 8.5 ms a window on 10,000 rows. A write
 * asks a few windows; a pass over a whole ledger reads the list once and asks none (`Ledger`), unless its rule reads its
 * own mark, and then it builds an index for as long as it runs (`index.ts`, `settleRedeclared`).
 *
 * A PAIRED ROW IS STILL A CANDIDATE. Whether it stays paired is `partnerOf`'s question, and leaving it out here is what
 * let the first row to arrive keep a leg a nearer one was the real partner of.
 *
 * `leg` ITSELF IS NOT ASKED WHETHER IT CAN PAIR, only the rows around it, so `settle` can ask who stood near a row as it
 * was before a write, whatever the write did to it.
 */
function candidatesOf(p: Pairing, leg: Leg): { leg: Leg; gap: number }[] {
  return around(p, leg).near;
}

/**
 * The two expressions `around` asks the window by, a row's day and its size, as SQL over `entry.fields`, or `null` when
 * the declaration has no day to run a window over. Exported so a pass over the whole ledger (`index.ts`,
 * `settleRedeclared`) orders its seeds and counts its sizes by the very reading the window takes, and where it still asks
 * a query per window builds its index on these expressions: SQLite uses an index on an expression only when the query
 * spells the same one.
 */
export function windowSql(p: Pairing): { day: string; size: string } | null {
  const date = dateField(p.pairs, p.fields);
  if (date === null) return null;
  const sized = sizedField(p);
  return { day: `json_extract(fields, '$.${date}')`, size: `abs(coalesce(json_extract(fields, '$.${sized}.amount'), json_extract(fields, '$.${sized}')))` };
}

/**
 * THE LIST'S DECLARED INDEX ON THE DAY, NAMED, when a window can use it: with no statistics SQLite reads a window through
 * `entry_state` and every row of the list (8 ms a window on 20,000 rows, 800 windows in one alarm on the bench), against
 * 0.04 ms through the day's index. Asked of the schema each time, so a redeclared list cannot leave a name that is gone.
 *
 * NOT WHILE A PASS HOLDS ITS OWN INDEX ON THE LIST, THE SIZE AND THE DAY (`settleRedeclared`, `entry_settle_<list>`), which
 * answers a window better still, and is found only by the statement as it was (`register = ?`).
 */
const LIST_ID = /^[a-z][a-z0-9_]{0,31}$/u;
function dayIndexOf(p: Pairing): string | null {
  const date = dateField(p.pairs, p.fields);
  if (date === null || !LIST_ID.test(p.register)) return null;
  /* `indexName` as `declare.ts` writes it: `declare.ts` imports this file, so the name is said here. */
  const name = `entry_i_${p.register}__${date}`;
  const held = p.sql.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'index' AND name IN (?, ?)", name, `entry_settle_${p.register}`).map((r) => r.name);
  return held.length === 1 && held[0] === name ? name : null;
}

/**
 * The live rows of a list that `tail` keeps, read through the day's index where the list has one (`dayIndexOf`). THE LIST
 * IS WRITTEN IN, because a partial index is used only where the statement shows it holds that list, and its id is the
 * grammar's, checked first. A statement SQLite will not plan that way (an index of another shape) is asked as it was.
 */
function windowRows(p: Pairing, tail: string, ...params: Param[]): LegRow[] {
  const index = dayIndexOf(p);
  if (index !== null)
    try {
      return p.sql.all<LegRow>(`SELECT ${LEG_COLUMNS} FROM entry INDEXED BY ${index} WHERE register = '${p.register}' AND deleted_at IS NULL AND ${tail}`, ...params);
    } catch {
      /* Asked below as it always was. */
    }
  return p.sql.all<LegRow>(`SELECT ${LEG_COLUMNS} FROM entry WHERE register = ? AND deleted_at IS NULL AND ${tail}`, p.register, ...params);
}

/**
 * `candidatesOf`, and how near the nearest row that mirrors `leg` and is `waiting` stands (`Infinity` for none): one
 * query over the window answers both.
 *
 * HOW NEAR, NOT ONLY WHETHER, because a leg nothing ties is answered by its nearest (`heldIn`), and a waiting row
 * nearer than that is the partner it may yet have.
 *
 * WITH A `Ledger` THE WINDOW IS READ FROM THE LIST ALREADY IN HAND, the rows of this size between the window's two ends,
 * found by halving. That is `inside` asked one way, so it lets through every row `mirrors` would, and `mirrors` still
 * decides each one; the SQL's `BETWEEN` on the stored day says the same of every day the kernel stores.
 */
function around(p: Pairing, leg: Leg, ledger: Ledger | null = null): { near: { leg: Leg; gap: number }[]; waitsAt: number } {
  const none = { near: [], waitsAt: Infinity };
  const window = windowSql(p);
  const read = ledger === null ? (l: Leg) => shapeOf(p, l) : (l: Leg) => shapeIn(p, ledger, l);
  const shape = read(leg);
  if (window === null || shape === null) return none;
  const lo = shiftFrom(shape.at, `-${p.pairs.within}`);
  const hi = shiftFrom(shape.at, `+${p.pairs.within}`);
  if (lo === null || hi === null) return none;
  let rows: Leg[];
  if (ledger === null) {
    const toDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
    const { day, size } = window;
    rows = windowRows(p, `id <> ? AND ${day} BETWEEN ? AND ? AND ${size} = ?`, leg.id, toDay(lo), toDay(hi), shape.amount.size).map(legOf);
  } else rows = inWindow(ledger.bySize.get(shape.amount.size) ?? [], lo, hi).filter((other) => other.id !== leg.id);
  const out: { leg: Leg; gap: number }[] = [];
  let waitsAt = Infinity;
  for (const other of rows) {
    if (!mirrors(p, leg, other, read)) continue;
    const gap = Math.abs(read(other)!.at - shape.at);
    if (canPair(p, other, ledger)) out.push({ leg: other, gap });
    else if (gap < waitsAt && waitsIn(p, other, ledger)) waitsAt = gap;
  }
  return { near: out, waitsAt };
}

/**
 * THE WHOLE LIST, READ ONCE FOR A PASS OVER IT (`passOf`): every live row parsed and shaped, the rows grouped by size in
 * day order, and what `pairable` and `waiting` say of each row, asked the first time it is needed.
 *
 * ONE READ, NOT A QUERY PER ROW. The window was a query per row, each row it returned parsed and asked `markPinned`,
 * and on 200 rows of one amount packed into a week that was 622,665 questions to the event table for one pass. Each of
 * those answers is a fact about one row, and the pass writes nothing any of them reads: it writes the mark and `_pair`,
 * and a row whose mark a person pinned keeps it (`index.ts`, `writeLeg`), so its pin stands. `passOf` refuses a
 * `Ledger` to a declaration whose own rule reads the mark, the one case where that would not hold.
 */
type Ledger = {
  bySize: Map<number, { at: number; leg: Leg }[]>;
  /** Every shaped row in day order, whatever its size: the window a move between two currencies is looked for in. */
  all: { at: number; leg: Leg }[];
  shapes: Map<string, Shape | null>;
  can: Map<string, boolean>;
  waits: Map<string, boolean>;
};

function ledgerOf(p: Pairing): Ledger {
  const bySize = new Map<number, { at: number; leg: Leg }[]>();
  const shapes = new Map<string, Shape | null>();
  const all: { at: number; leg: Leg }[] = [];
  for (const r of p.sql.all<LegRow>(`SELECT ${LEG_COLUMNS} FROM entry WHERE register = ? AND deleted_at IS NULL ORDER BY rowid`, p.register)) {
    const leg = legOf(r);
    const shape = shapeOf(p, leg);
    shapes.set(leg.id, shape);
    /* A ROW WITH NO SHAPE MIRRORS NOTHING, so it is in no window. */
    if (shape === null) continue;
    let group = bySize.get(shape.amount.size);
    if (group === undefined) bySize.set(shape.amount.size, (group = []));
    group.push({ at: shape.at, leg });
    if (p.pairs.across_currency !== undefined) all.push({ at: shape.at, leg });
  }
  for (const group of bySize.values()) group.sort((a, b) => a.at - b.at);
  all.sort((a, b) => a.at - b.at);
  return { bySize, all, shapes, can: new Map(), waits: new Map() };
}

/** The legs of one size group whose day is between `lo` and `hi`, both included. */
function inWindow(group: readonly { at: number; leg: Leg }[], lo: number, hi: number): Leg[] {
  let from = 0;
  let to = group.length;
  while (from < to) {
    const mid = (from + to) >>> 1;
    if (group[mid]!.at < lo) from = mid + 1;
    else to = mid;
  }
  const out: Leg[] = [];
  for (let i = from; i < group.length && group[i]!.at <= hi; i++) out.push(group[i]!.leg);
  return out;
}

/* A ROW'S SHAPE, PAIRABILITY AND WAITING, read from the `Ledger` when there is one. By id, since the pass reads a row
   again before writing it, and that copy differs from the one in hand only in the mark and `_pair`. */
const shapeIn = (p: Pairing, ledger: Ledger, leg: Leg): Shape | null => (ledger.shapes.has(leg.id) ? ledger.shapes.get(leg.id)! : shapeOf(p, leg));

function canPair(p: Pairing, leg: Leg, ledger: Ledger | null): boolean {
  if (ledger === null) return pairable(p, leg);
  let can = ledger.can.get(leg.id);
  if (can === undefined) ledger.can.set(leg.id, (can = pairable(p, leg)));
  return can;
}

function waitsIn(p: Pairing, leg: Leg, ledger: Ledger | null): boolean {
  if (ledger === null) return waiting(p, leg);
  let waits = ledger.waits.get(leg.id);
  if (waits === undefined) ledger.waits.set(leg.id, (waits = waiting(p, leg)));
  return waits;
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

/**
 * A leg's nearest candidate (`nearestIn`), or `null` when a row that may yet be one of its legs (`waiting`) stands at
 * least as near.
 *
 * THE CHECK FOR A LEG STILL TO COME GUARDED ONLY A TIED SET (`matchedOf`), and a leg nothing ties never reached it.
 * Measured at `56b35c41`: 20,000.00 out of account A, its in to account B still pending, and a client's 20,000.00 into
 * B the next day. The client was the out's one candidate, so the two paired, Spent 0.00 and Received 0.00 against
 * 20,000.00 each until the bank cleared the in (`pairs-followups.test.ts`, THREE). NEARER OR AS NEAR, NOT ANYWHERE IN
 * THE WINDOW: cleared, a waiting row farther off than the nearest candidate would still be the farther, so the pair
 * made now is the one that would be made then, and holding it back would only count the move meanwhile.
 */
function heldIn(w: { near: readonly { leg: Leg; gap: number }[]; waitsAt: number }): Leg | null {
  const leg = nearestIn(w.near);
  return leg !== null && w.near.find((c) => c.leg === leg)!.gap < w.waitsAt ? leg : null;
}

function nearestOf(p: Pairing, leg: Leg, windows: Windows): Leg | null {
  return canPair(p, leg, windows.ledger) ? heldIn(windowOf(p, leg, windows)) : null;
}

/** What `around` answered for each leg, by id, for as long as one question about the ledger lasts, and the list it reads. */
type Windows = {
  seen: Map<string, ReturnType<typeof around>>;
  ledger: Ledger | null;
  /** The same for a move between two currencies (`crossAround`), and the rates it converts by, read when first needed. */
  crossed: Map<string, ReturnType<typeof around>>;
  /** The rows of another currency farther off than the tolerance and inside `ASK_SPREAD`, by leg: a question only. */
  wide: Map<string, Leg[]>;
  fx: { rates: readonly Rate[]; at: Map<string, Held | null> } | null;
};
const windowsOf = (ledger: Ledger | null = null): Windows => ({ seen: new Map(), ledger, crossed: new Map(), wide: new Map(), fx: null });

/**
 * `around`, asked once per leg for as long as the ledger does not change: one `partnerOf`, or one `settle`, which
 * writes nothing until it has answered every row.
 *
 * MEASURED, THE SAME WINDOW WAS READ AGAIN AND AGAIN. A set past `SET_MOST` is answered leg by leg, and `settle` then
 * asks each of its legs, and each of those read the same 32 windows to find the same set was not whole: on 10,000 rows
 * of fifty round amounts in one year, the install pass asked 159,018 windows for 10,000 rows.
 */
function windowOf(p: Pairing, leg: Leg, windows: Windows): ReturnType<typeof around> {
  let w = windows.seen.get(leg.id);
  if (w === undefined) windows.seen.set(leg.id, (w = around(p, leg, windows.ledger)));
  return w;
}

/** A leg, the rows that could be its partner, and how near the nearest row that may yet be one stands (`around`). */
type Near = { leg: Leg; near: { leg: Leg; gap: number }[]; waitsAt: number };

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
function setOf(p: Pairing, leg: Leg, windows: Windows): { set: Map<string, Near>; whole: boolean } {
  const set = new Map<string, Near>();
  const queue = [leg];
  while (queue.length > 0) {
    const next = queue.shift()!;
    if (set.has(next.id)) continue;
    if (set.size === SET_MOST) return { set, whole: false };
    const { near, waitsAt } = windowOf(p, next, windows);
    set.set(next.id, { leg: next, near, waitsAt });
    for (const c of near) if (!set.has(c.leg.id)) queue.push(c.leg);
  }
  return { set, whole: true };
}

/**
 * A whole set's legs matched in day order, each to one of the other way or left over, or `null` when that is a guess
 * or not needed.
 *
 * TWO TIES THAT HID NOTHING. The tie rule refused one 100,000.00 move sent as two halves of 50,000.00 on one day, and
 * two top-ups of 5,000.00 each landing the next day, and both figures counted money that only moved: every candidate
 * was tied, though any way of matching those legs hides exactly the same money. The legs of a set agree on every `on`
 * entry and so on size and currency (`mirrors`), so when as many go one way as the other every leg is one half of a
 * move, and which half it is paired with changes no figure. Matched in day order, first out with first in, the days are
 * as near as any matching can make them in total, which is what the nearest rule asks one leg at a time.
 *
 * WHEN THE COUNTS DIFFER, THE LEGS LEFT OVER ARE THE ONES THAT COST THE FEWEST DAYS, AND ONLY WHEN NO OTHER CHOICE
 * COSTS AS FEW. Measured: a client's 20,000.00 into account B two days after a move split in two halves of that size,
 * and refusing the set whole left both halves counted: Spent and Received each 40,000.00 high. Leaving the client over
 * costs no day and leaving either half over costs two, so which leg is spare is in the ledger. Three alike outs against
 * two ins on one day cost the same whichever out is spare, so that stays refused, as a tie of one does. Every matching
 * the accounts allow is counted, and the rest are matched in day order, so it stays one answer in every order the rows
 * arrived in (`sparesOf`).
 *
 * NOT WHILE A ROW OUTSIDE THE SET IS `waiting` to be one of its legs. The set is then not the whole of the moves in it,
 * so a count that looks even is short of the partner a leg is waiting for, and the leg matched in its place is somebody
 * else's money. Such a set is answered leg by leg until the row clears, as it was before sets were read at all.
 *
 * AND NOT USED WHERE NOTHING IS TIED: there each leg's nearest answers it, and a set matched in day order can differ
 * from that (an out on day 0 and 1, an in on day 1 and 5, pairs the day-1 legs by nearness and all four by order), which
 * is a change to rows no tie ever held and not this repair. A matching that pairs two legs in one account, or two out of
 * each other's window, is no matching, and the set is answered leg by leg.
 *
 * LEGS ON ONE DAY GO IN `across` ORDER, AND ONLY THEN IN `seq` ORDER. `seq` is the order the bank listed them, the
 * arrival order the tie rule refused to break by, and ordering one day by it alone let that order decide whether a set
 * paired at all: an out of account A and an out of B against an in to C and an in to A, all one day, paired all four
 * when the in to C was listed first and none when the in to A was, since first with first then put A's legs together
 * and the matching was refused (`pairs-ties.test.ts`, ONE ANSWER IN EVERY ORDER). With the account first, `seq` only
 * says which of two legs alike in everything names which, and the rows paired and the figures are the same in every
 * order.
 */
function matchedOf(p: Pairing, set: Map<string, Near>): Map<string, string> | null {
  const members = [...set.values()];
  if (!members.some((m) => m.near.length > 0 && nearestIn(m.near) === null)) return null;
  if (members.some((m) => m.waitsAt !== Infinity)) return null;
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
  const [few, many] = one!.length <= other!.length ? [one!, other!] : [other!, one!];
  const can = (i: number, j: number) => set.get(few[i]!.leg.id)!.near.some((c) => c.leg.id === many[j]!.leg.id);
  const spare = sparesOf(
    few.map((x) => x.at),
    many.map((x) => x.at),
    can,
  );
  if (spare === null) return null;
  /* THE REST FIRST WITH FIRST, as equal counts always were. On a line that costs no more days than any other matching of
     the same legs, and where it would pair two legs in one account the set is refused, as it was before: a matching
     that finds the one valid crossing is a larger change than this one (`pairs-ties.test.ts`, ONE ANSWER). */
  const kept = [...many.keys()].filter((j) => !spare.has(j));
  const matched = new Map<string, string>();
  for (const [i, a] of few.entries()) {
    const j = kept[i]!;
    if (!can(i, j)) return null;
    matched.set(a.leg.id, many[j]!.leg.id);
    matched.set(many[j]!.leg.id, a.leg.id);
  }
  return matched;
}

/* WHAT A PAIR THAT IS NO CANDIDATE COSTS, in days: more than every leg of the largest set a whole window apart, since
   `within` is at most 9999 months (`WINDOW`), about 304,000 days, and a side holds at most `SET_MOST` legs. */
const NO_PAIR = 1e9;
const DAY_MS = 86_400_000;

/**
 * The legs of the longer side left over when every leg of the shorter is matched to one of them at the fewest days in
 * total, by index; `null` when no matching exists or when two matchings of that least cost leave different legs over.
 * Exported for its test, which holds it to every matching counted by hand.
 *
 * EVERY FEASIBLE MATCHING IS COUNTED, NOT ONLY THOSE TAKEN IN ORDER. The first attempt walked both sides first with
 * first and counted the choices of legs to skip, which is every matching of least cost only when any pair may be made.
 * The account rule (`can`) forbids some, and then a matching that crosses costs as few days as one in order and leaves
 * a different leg over: outs from x and y and ins into x, y and z on one day, where the one in-order matching left x's
 * in over and three matchings of no days exist, one per in. It paired four rows, and which account's in counted as
 * income was decided by how the account names sort (`pairs-pending.test.ts`).
 *
 * WHICH LEGS PAIR WITH WHICH DOES NOT MOVE A FIGURE, WHICH ARE LEFT OVER DOES. Every leg of a set is the same size in
 * the same currency, so two matchings with one set of legs over hide the same money, and a move's two halves each way
 * have two matchings of no days and are not a guess. So the answer is refused only when the legs over differ. Any
 * matching of least cost leaving other legs over than `best` does must use one of the legs `best` matched, so it is
 * enough to ask, for each of those, what the least cost is with that leg taken out: equal to `best`'s, and another
 * choice exists.
 *
 * BOUNDED BY THE SET. A whole set holds at most `SET_MOST` legs, so when the counts differ the shorter side holds at most
 * 15 and the longer at most 31, and this is at most 16 assignments, each about 15 x 15 x 31 steps (`leastOf`).
 */
export function sparesOf(few: readonly number[], many: readonly number[], can: (i: number, j: number) => boolean): Set<number> | null {
  if (few.length === many.length) return new Set();
  const cost = few.map((a, i) => many.map((b, j) => (can(i, j) ? Math.round(Math.abs(a - b) / DAY_MS) : NO_PAIR)));
  const best = leastOf(cost, many.length);
  if (best.total >= NO_PAIR) return null;
  for (const j of best.to) if (leastOf(cost.map((row) => row.map((c, k) => (k === j ? NO_PAIR : c))), many.length).total === best.total) return null;
  const used = new Set(best.to);
  return new Set([...many.keys()].filter((j) => !used.has(j)));
}

/**
 * A matching of every row of `cost` to its own column at the least total, and the column each row took: the Hungarian
 * method with potentials, rows one at a time along the cheapest augmenting path, which is `O(rows² x columns)`.
 * `cost` holds whole days, so every sum is exact.
 */
function leastOf(cost: readonly (readonly number[])[], columns: number): { total: number; to: number[] } {
  const n = cost.length;
  const u = new Array<number>(n + 1).fill(0);
  const v = new Array<number>(columns + 1).fill(0);
  /* `row[j]` is the row (from 1) holding column j (from 1), 0 for none; column 0 is where each new row starts. */
  const row = new Array<number>(columns + 1).fill(0);
  const back = new Array<number>(columns + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    row[0] = i;
    let j0 = 0;
    const least = new Array<number>(columns + 1).fill(Infinity);
    const seen = new Array<boolean>(columns + 1).fill(false);
    do {
      seen[j0] = true;
      const i0 = row[j0]!;
      let delta = Infinity;
      let j1 = 0;
      for (let j = 1; j <= columns; j++) {
        if (seen[j]) continue;
        const cur = cost[i0 - 1]![j - 1]! - u[i0]! - v[j]!;
        if (cur < least[j]!) {
          least[j] = cur;
          back[j] = j0;
        }
        if (least[j]! < delta) {
          delta = least[j]!;
          j1 = j;
        }
      }
      for (let j = 0; j <= columns; j++)
        if (seen[j]) {
          u[row[j]!] = u[row[j]!]! + delta;
          v[j] = v[j]! - delta;
        } else least[j] = least[j]! - delta;
      j0 = j1;
    } while (row[j0] !== 0);
    do {
      const j1 = back[j0]!;
      row[j0] = row[j1]!;
      j0 = j1;
    } while (j0 !== 0);
  }
  const to = new Array<number>(n).fill(0);
  for (let j = 1; j <= columns; j++) if (row[j] !== 0) to[row[j]! - 1] = j - 1;
  return { total: to.reduce((sum, j, i) => sum + cost[i]![j]!, 0), to };
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
    const near = heldIn(m);
    out.set(id, near !== null && heldIn(set.get(near.id)!)?.id === id ? near.id : null);
  }
  return out;
}

/**
 * The row this one is paired with in the ledger as it stands, or `null`: each must be the other's one nearest candidate,
 * or the two matched in day order in a set of alike legs that ties, is whole, and leaves over only the legs that cost
 * the fewest days (`matchedOf`).
 *
 * MUTUAL, SO THE ANSWER IS THE SAME FROM EITHER SIDE and does not depend on which leg was written last. A row whose
 * nearest candidate is nearer to somebody else stays unpaired and counted; that is the side a mistake should fall on.
 */
export function partnerOf(p: Pairing, leg: Leg): string | null {
  return answerOf(p, leg, new Map(), windowsOf()).to;
}

/** A leg's partner of its own size and currency, with the legs of the set it read, and every answer that set gave kept in `known` for the next leg asked. */
function sameOf(p: Pairing, leg: Leg, known: Map<string, string | null>, windows: Windows): { to: string | null; set: string[] } {
  if (known.has(leg.id)) return { to: known.get(leg.id)!, set: [] };
  if (leg.deleted_at !== null || !canPair(p, leg, windows.ledger)) return { to: null, set: [] };
  const { set, whole } = setOf(p, leg, windows);
  if (whole) {
    for (const [id, to] of answersOf(p, set)) known.set(id, to);
    return { to: known.get(leg.id) ?? null, set: [...set.keys()] };
  }
  const near = nearestOf(p, leg, windows);
  return { to: near !== null && nearestOf(p, near, windows)?.id === leg.id ? near.id : null, set: [...set.keys()] };
}

/* ─────────────── a move between two currencies (`across_currency`) ─────────────── */

/* HOW OLD A RATE MAY BE, in days before the earlier leg's day. A PAIR SAYS NOTHING BESIDE IT: it takes two rows out of
   Spent and Received, so it is made in silence only on a rate that is the day's or one of the two before it (a weekend
   has no rate of its own). Older than that the two rows are a question a person answers, with the rate's age said in
   it, and older than a month the rate says too little about the day to ask on: the rows stay counted. `fx.ts` lets a
   FIGURE convert on a rate up to a week old because it says so beside the number; a pair has nowhere to say it. */
export const PAIR_RATE_DAYS = 2;
export const ASK_RATE_DAYS = 31;

/* HOW FAR APART TWO AMOUNTS MAY BE AND STILL BE ASKED ABOUT, in percent: the most a declaration may call the same money
   (`TOLERANCE_MOST`). A card or an exchange desk takes more than the list's tolerance often enough, and such a move was
   neither paired nor asked about: Spent and Received both read high by it and nobody was told. Past this, two sizes
   only look alike. A PERSON'S YES REACHES AS FAR, since the question did. */
export const ASK_SPREAD = TOLERANCE_MOST;

/** A rate as a pairing holds it: the number, the day it is of, and how many days before the leg's day that is. */
type Held = { rate: number; as_of: string; days: number };

/**
 * The record's own rates: the rows of the list declaring `rates:` (`roles.ts`), read by `fx.ts`. Nothing a pairing
 * writes is a rate.
 */
function ratesOf(sql: Sql): Rate[] {
  const lists = sql
    .all<{ body: string }>("SELECT body FROM declaration WHERE kind = 'register' AND superseded_at IS NULL AND retired = 0")
    .map((r) => JSON.parse(r.body) as RoleList);
  const held = ratesRole(lists);
  if (!held) return [];
  const rows = sql.all<{ fields: string }>('SELECT fields FROM entry WHERE register = ? AND deleted_at IS NULL', held.register).map((r) => JSON.parse(r.fields) as Record<string, unknown>);
  return ratesFrom(rows, held.fields);
}

const daysBetween = (from: string, to: string): number => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

/**
 * How old the newest rate in the record is on `today` (`YYYY-MM-DD`), or `null` with none: the line a vital sign says,
 * and the reason two currencies stopped pairing in silence when it passes `PAIR_RATE_DAYS`.
 */
export function newestRate(sql: Sql, today: string): { as_of: string; days: number } | null {
  let newest: string | null = null;
  for (const r of ratesOf(sql)) if (r.as_of <= today && (newest === null || r.as_of > newest)) newest = r.as_of;
  return newest === null ? null : { as_of: newest, days: daysBetween(newest, today) };
}

/**
 * The rate from one currency into another to read `day` by, or `null`: the newest on or before the day, with its age,
 * and none older than `ASK_RATE_DAYS`.
 *
 * A RATE FROM AFTER THE DAY IS A GUESS BACKWARDS and is never used. One older than `PAIR_RATE_DAYS` still finds the
 * rows that could be one move, and `crossDoubt` then makes them a question, never a pair.
 *
 * READ ONCE for as long as one question about the ledger lasts.
 */
function rateAt(p: Pairing, windows: Windows, from: string, to: string, day: string): Held | null {
  if (windows.fx === null) windows.fx = { rates: ratesOf(p.sql), at: new Map() };
  const key = `${from}>${to}@${day}`;
  let held = windows.fx.at.get(key);
  if (held === undefined) {
    const r = rateFor(windows.fx.rates, from, to, day);
    const days = r === null ? 0 : daysBetween(r.as_of, day);
    windows.fx.at.set(key, (held = r === null || r.forward || days > ASK_RATE_DAYS ? null : { rate: r.rate, as_of: r.as_of, days }));
  }
  return held;
}

/** Two rows' handle for what a person answered about them (`Pairing.ruled`), the same from either side. */
export const crossKey = (a: string, b: string): string => (a < b ? `${a}+${b}` : `${b}+${a}`);

/**
 * Two rows in two currencies read as one move: which leg went first, the currencies, and the rate of the earlier leg's
 * day. `null` when they hold one currency, or no rate reads that day.
 *
 * THE EARLIER LEG'S DAY, because that is the day the money was changed; on one day the lower currency code goes first,
 * so the two legs give one answer whichever is asked.
 */
function crossRead(p: Pairing, x: Shape, y: Shape, windows: Windows): { first: Shape; second: Shape; from: string; to: string; held: Held } | null {
  const mine = x.amount.currency?.toUpperCase();
  const theirs = y.amount.currency?.toUpperCase();
  if (mine === undefined || theirs === undefined || mine === theirs) return null;
  const [first, second] = x.at < y.at || (x.at === y.at && mine < theirs) ? [x, y] : [y, x];
  const from = first.amount.currency!.toUpperCase();
  const to = second.amount.currency!.toUpperCase();
  const held = rateAt(p, windows, from, to, first.day.slice(0, 10));
  return held === null ? null : { first, second, from, to, held };
}

/**
 * How far apart two rows in two currencies are as one move, or `null` when they are not the two legs of one by every
 * other part of the declaration but `where` and the pin: `mirrors`, with "the same amount" read as the earlier leg at
 * the rate of its own day. Every other `on` entry still has to agree as it does in one currency.
 *
 * `diff` is between the earlier leg converted and the later, in the later's minor units, `size` the later's, and
 * `most` the percent these two may differ by and be one move: whole numbers, so the edge of a tolerance is exact.
 * `most` IS THE LIST'S TOLERANCE, AND `ASK_SPREAD` FOR TWO ROWS A PERSON SAID ARE ONE MOVE.
 *
 * TWO ROWS A PERSON SAID ARE NOT ONE MOVE NEVER ARE (`Pairing.ruled`), so neither stands in the other's way again.
 */
function crossGap(p: Pairing, a: Leg, b: Leg, shape: (leg: Leg) => Shape | null, windows: Windows): { diff: number; size: number; most: number } | null {
  const said = p.pairs.across_currency;
  const x = shape(a);
  const y = shape(b);
  if (said === undefined || x === null || y === null) return null;
  const ruled = p.ruled?.get(crossKey(a.id, b.id));
  if (ruled === false) return null;
  if (signOf(x.way) !== null ? signOf(y.way) !== -signOf(x.way)! : same(y.way, x.way)) return null;
  if (same(x.across, y.across)) return null;
  for (const entry of p.pairs.on) {
    const e = entryOf(entry)!;
    if (!e.abs && (b.fields[e.field] === undefined || !same(b.fields[e.field], a.fields[e.field]))) return null;
  }
  if (!inside(p.pairs.within, x.at, y.at) || !inside(p.pairs.within, y.at, x.at)) return null;
  const read = crossRead(p, x, y, windows);
  if (read === null) return null;
  return {
    diff: Math.abs(convertMinor(read.first.amount.size, read.from, read.to, read.held.rate) - read.second.amount.size),
    size: read.second.amount.size,
    most: ruled === true ? Math.max(said.tolerance, ASK_SPREAD) : said.tolerance,
  };
}

/**
 * `around` for a move between two currencies: the rows of another currency that could be `leg`'s other leg, and how
 * near the nearest such row still `waiting` stands. Asked once per leg for as long as the ledger does not change.
 *
 * THE WINDOW IS EVERY ROW OF ANOTHER CURRENCY IN IT, since no one size finds the other leg; `crossGap` decides each.
 */
function crossAround(p: Pairing, leg: Leg, windows: Windows): ReturnType<typeof around> {
  const seen = windows.crossed.get(leg.id);
  if (seen !== undefined) return seen;
  const out: ReturnType<typeof around> = { near: [], waitsAt: Infinity };
  const wide: Leg[] = [];
  windows.crossed.set(leg.id, out);
  windows.wide.set(leg.id, wide);
  const ledger = windows.ledger;
  const window = windowSql(p);
  const read = ledger === null ? (l: Leg) => shapeOf(p, l) : (l: Leg) => shapeIn(p, ledger, l);
  const shape = read(leg);
  if (window === null || shape === null || shape.amount.currency === null) return out;
  const lo = shiftFrom(shape.at, `-${p.pairs.within}`);
  const hi = shiftFrom(shape.at, `+${p.pairs.within}`);
  if (lo === null || hi === null) return out;
  let rows: Leg[];
  if (ledger === null) {
    const toDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
    rows = windowRows(p, `id <> ? AND ${window.day} BETWEEN ? AND ? AND json_extract(fields, '$.${sizedField(p)}.currency') <> ?`, leg.id, toDay(lo), toDay(hi), shape.amount.currency).map(legOf);
  } else rows = inWindow(ledger.all, lo, hi).filter((other) => other.id !== leg.id);
  for (const other of rows) {
    const far = crossGap(p, leg, other, read, windows);
    if (far === null) continue;
    if (far.diff * 100 > far.most * far.size) {
      /* TOO FAR APART TO BE A CANDIDATE, NEAR ENOUGH TO ASK ABOUT, where somebody is asked. It stands in nobody's way. */
      if (p.asks === true && far.diff * 100 <= ASK_SPREAD * far.size && canPair(p, other, ledger)) wide.push(other);
      continue;
    }
    const gap = Math.abs(read(other)!.at - shape.at);
    if (canPair(p, other, ledger)) out.near.push({ leg: other, gap });
    else if (gap < out.waitsAt && waitsIn(p, other, ledger)) out.waitsAt = gap;
  }
  return out;
}

/**
 * A leg's one nearest row of another currency, or `null`: none, two as near (a tie is not guessed), a row that may yet
 * clear into its leg as near (`heldIn`), or a row of its own currency as near, paired or not.
 *
 * A ROW OF ITS OWN CURRENCY AS NEAR WINS, AND SO DOES ONE STILL PENDING. The same size in the same currency is the same
 * money to the unit, where two currencies agree only within a tolerance, so where both stand as near the exact one is
 * the leg, and if that one is tied or taken the money stays counted.
 */
function crossHeld(p: Pairing, leg: Leg, windows: Windows): Leg | null {
  const w = crossAround(p, leg, windows);
  const near = heldIn(w);
  if (near === null) return null;
  const gap = w.near.find((c) => c.leg === near)!.gap;
  const own = windowOf(p, leg, windows);
  return own.waitsAt <= gap || own.near.some((c) => c.gap <= gap) ? null : near;
}

/** The one row of another currency a person said is `leg`'s other leg (`Pairing.ruled`), or `null`: none, or two. */
function saidOf(p: Pairing, leg: Leg, windows: Windows): Leg | null {
  if (p.ruled === undefined) return null;
  const yes = crossAround(p, leg, windows).near.filter((c) => p.ruled!.get(crossKey(leg.id, c.leg.id)) === true);
  return yes.length === 1 ? yes[0]!.leg : null;
}

/** Why two rows in two currencies are a question and not a pair. */
export type CrossWhy = 'rate_old' | 'not_only' | 'lone' | 'spread';

/** Whether `leg` has one row of another currency it could be one move with, and no more: none pending, none besides. */
function onlyOne(p: Pairing, leg: Leg, known: Map<string, string | null>, windows: Windows): boolean {
  const w = crossAround(p, leg, windows);
  /* A ROW WITH A PARTNER OF ITS OWN CURRENCY IS TAKEN, to the unit, and is nobody's rival here. */
  return w.waitsAt === Infinity && w.near.filter((c) => sameOf(p, c.leg, known, windows).to === null).length === 1;
}

/**
 * What stands between two rows in two currencies and a pair made in silence, or nothing.
 *
 * WITHIN 2% AT THE DAY'S RATE IS NOT PROOF. Measured: a purchase in dollars and a receipt in
 * pounds, unrelated, in two accounts inside four days and within the tolerance, paired and both dropped out of Spent
 * and Received with nothing said. One currency agrees to the unit; two agree only nearly, so a near match is taken on
 * its own word only when the rate is the day's (`PAIR_RATE_DAYS`) AND each row is the other's one candidate. A second
 * row that fits either leg, cleared or still pending, or an older rate, makes it a question (`crossAsks`).
 *
 * AND NOT ON ITS OWN WORD AT ALL WHERE A PERSON IS ASKED (`Pairing.asks`): `crossOf` holds that match back as `lone`.
 */
function crossDoubt(p: Pairing, a: Leg, b: Leg, known: Map<string, string | null>, windows: Windows): CrossWhy[] {
  const ledger = windows.ledger;
  const x = ledger === null ? shapeOf(p, a) : shapeIn(p, ledger, a);
  const y = ledger === null ? shapeOf(p, b) : shapeIn(p, ledger, b);
  const read = x === null || y === null ? null : crossRead(p, x, y, windows);
  const why: CrossWhy[] = [];
  if (read === null || read.held.days > PAIR_RATE_DAYS) why.push('rate_old');
  if (!onlyOne(p, a, known, windows) || !onlyOne(p, b, known, windows)) why.push('not_only');
  return why;
}

/**
 * The row of another currency this one is paired with, or `null`. Asked only of a leg with no partner in its own
 * currency, and the other leg must have none either: a pair one currency makes is never undone for one two make.
 * Mutual, as `partnerOf` is, so the answer is the same from either side.
 *
 * A PERSON'S ANSWER COMES FIRST: two rows they said are one move pair whatever else is true of them, while they still
 * mirror each other. Without one, the nearest row pairs only where nothing is in doubt (`crossDoubt`).
 */
function crossOf(p: Pairing, leg: Leg, known: Map<string, string | null>, windows: Windows): string | null {
  if (p.pairs.across_currency === undefined || leg.deleted_at !== null || !canPair(p, leg, windows.ledger)) return null;
  const said = saidOf(p, leg, windows);
  if (said !== null) return sameOf(p, said, known, windows).to === null && saidOf(p, said, windows)?.id === leg.id ? said.id : null;
  const to = crossHeld(p, leg, windows);
  if (to === null || saidOf(p, to, windows) !== null || sameOf(p, to, known, windows).to !== null) return null;
  if (crossHeld(p, to, windows)?.id !== leg.id) return null;
  /* WITH NOTHING AGAINST IT, IT IS STILL ONLY A NEAR MATCH, and where somebody is asked (`Pairing.asks`) it is theirs to
     say: Testing found two unrelated rows, each the other's one candidate on the day's rate, paired with
     nothing said. Where nobody is asked it pairs, as it did. */
  return crossDoubt(p, leg, to, known, windows).length === 0 && p.asks !== true ? to.id : null;
}

/** `partnerOf`, with the legs of the set it read: a partner of its own currency first, and only then one of another. */
function answerOf(p: Pairing, leg: Leg, known: Map<string, string | null>, windows: Windows): { to: string | null; set: string[] } {
  const own = sameOf(p, leg, known, windows);
  if (own.to !== null) return own;
  const to = crossOf(p, leg, known, windows);
  return to === null ? own : { to, set: own.set };
}

/* A BOUND ON ONE WRITE'S RESETTLING. The rows a write can move are its neighbours old and new, their partners and the
   set of alike legs they stand in, a handful on any ledger a bank writes; the bound is against a runaway, not a budget
   anything should reach. */
const SETTLE_MOST = 256;

/* WHEN ONE WRITE READS THE WHOLE LIST, AS A PASS DOES: once it holds this many rows to answer, or has asked this many
   windows. Without a `Ledger` each window is a query that reads every row of the list (`candidatesOf`), and every row
   in it that mirrors the leg is asked `pairable` or `waiting` afresh, each a question to the event table, so a write
   whose window was busy read the list again for every window it asked: one create after 10,000 rows of one amount took
   about 3 s. Below this a write asks its few windows by query, as it always has, since a list read whole parses every
   row of it and a quiet write has no need of that. */
const READ_WHOLE_AT = 16;

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
 *
 * `pass` IS A CALLER SETTLING A WHOLE LEDGER ONE SEED AT A TIME (`index.ts`, `settleRedeclared`, and `passOf`). Its
 * `answered` collects every row whose partner was asked, changed or not: a row asked once has had its answer written,
 * and asking it again as a seed of its own only read its set a second time. Measured on 10,000 rows of fifty round
 * amounts in one year, the pass asked 59,194 rows before it kept this.
 *
 * A WRITE'S OWN `settle`, CALLED WITH NO `pass`, READS THE LIST ONCE WHEN ITS WINDOWS ARE BUSY (`READ_WHOLE_AT`), and
 * answers every window after that from it, as a pass does. It keeps its answers and its windows for the length of the
 * call, as it always did. Nothing is written until every row is answered, so the list read at that moment is the list
 * each window would have queried, and a window already answered by query stays as it is: `around` reads the same rows
 * from a `Ledger` as from SQL. It takes the `Ledger` from `passOf`, so a declaration that reads its own mark still asks
 * every window by query: the condition is said in one place for a pass and for a write.
 */
export function settle(p: Pairing, seeds: readonly string[], pass?: Pass): { leg: Leg; to: string | null }[] {
  const want = new Map<string, { leg: Leg; to: string | null }>();
  const known = pass?.known ?? new Map<string, string | null>();
  const windows = pass?.windows ?? windowsOf();
  /* A PASS HAS ALREADY ASKED `passOf`, and holds its `Ledger` or, where its rule reads the mark, none. */
  let asked = pass !== undefined;
  const queue = [...seeds];
  while (queue.length > 0 && want.size < SETTLE_MOST) {
    if (!asked && (queue.length >= READ_WHOLE_AT || windows.seen.size >= READ_WHOLE_AT)) {
      asked = true;
      windows.ledger = passOf(p).windows?.ledger ?? null;
    }
    const id = queue.shift()!;
    if (want.has(id)) continue;
    /* A ROW AN EARLIER CALL OF THE SAME PASS ANSWERED IS NOT WALKED AGAIN, when the pass keeps its answers (`passOf`):
       its answer is written, and whatever it leads to is a seed of the pass or was answered with it. Walked again, as
       it was, each new seed on 200 rows of one amount in a week led back through the same 140 rows for one new answer. */
    if (pass?.known !== undefined && pass.answered.has(id)) continue;
    const leg = loadLeg(p, id);
    if (!leg) continue;
    const { to, set } = answerOf(p, leg, known, windows);
    want.set(id, { leg, to });
    pass?.answered.add(id);
    const held = leg.fields._pair;
    for (const next of [typeof held === 'string' ? held : null, to, ...set]) if (next !== null && !want.has(next)) queue.push(next);
  }
  /* AND A PAIRED ROW WHOSE MARK IS NOT TRUE, which only a mechanism can leave behind: a rule's `false` is not a pin
     (`isMechanism`), so the pair it contradicts still stands and the mark is put back to what the pair says. */
  return [...want.values()].filter(({ leg, to }) => (leg.fields._pair ?? null) !== to || (to !== null && leg.fields[p.pairs.mark] !== true));
}

/**
 * One pass over a whole list, one `settle` per seed: which rows it has answered, and, when they hold for the length of
 * the pass, the answers, the windows and the list read once (`Ledger`).
 *
 * ONE PASS, ONE READ. Each `settle` read its own windows and answered its own rows, so a pass over a list where most
 * rows share a size read the same windows once per seed: 10,000 rows of three amounts in one year took 80 to 146 s, one
 * amount did not finish in 20 minutes, and a Durable Object request gets 30. Nothing the pass writes moves an answer,
 * since a row's partner is read from the fields `pairsReads` names other than the mark, and from whether a person
 * pinned the mark, and the pass writes only the mark and `_pair`, signed by the record. So one answer, one window and
 * one reading of each row serve the whole pass, and the ledger it leaves is the one each `settle` answering afresh left
 * (`pairs-settle-speed.test.ts`, `pairs-on-update.test.ts`).
 *
 * NOT WHERE THE DECLARATION READS ITS OWN MARK, in `on`, `opposite`, `across`, `date` or `where`: there each write of the
 * pass moves the answers after it, and every `settle` still answers afresh, as all of them did before.
 *
 * MEASURED on 10,000 rows in one year, a third of them the legs of moves (`pairs-settle-speed.test.ts`), in the
 * install's transaction on this machine with other work running on it: every amount one of 1, 3 or 50 round ones took
 * 2.8 s, 1.4 s and 1.4 s, where the pass took more than 20 minutes, 80 to 146 s, and 2.9 s before. 2,000 rows of one
 * amount in 73 days, as densely packed as the first, took 1,659.5 s before; 500 rows in 18 days 279.5 s before and 0.13
 * s now. Sixteen ledgers of 200 to 2,000 rows with pending, void, named and ticked rows, installed over no `pairs:` and
 * over a looser one, came out the same row for row and event for event before and after, and three more under a `where`
 * that reads the mark.
 */
export type Pass = { answered: Set<string>; known?: Map<string, string | null>; windows?: Windows };

export function passOf(p: Pairing): Pass {
  const date = dateField(p.pairs, p.fields);
  const reads = [...p.pairs.on.map((x) => entryOf(x)?.field ?? x), p.pairs.opposite, p.pairs.across, ...(date === null ? [] : [date]), ...readBy(p.pairs.where)];
  if (reads.includes(p.pairs.mark)) return { answered: new Set() };
  return { answered: new Set(), known: new Map(), windows: windowsOf(ledgerOf(p)) };
}

/**
 * Two rows in two currencies that could be one move and were not paired: the question a person answers.
 *
 * `first` IS THE LEG THAT WENT FIRST, the one the rate converts; `converted` is its amount in `to`'s minor units at
 * `rate`, which is of `rate_as_of`, `rate_days` days before the leg's own day, and `landed` is what the second leg
 * holds, in the same units, so the two can be said side by side. `key` goes back into `Pairing.ruled` with the answer
 * (`ruledOf`).
 *
 * `why`, each one a reason it is not a pair already: `rate_old`, the rate is more than `PAIR_RATE_DAYS` old;
 * `not_only`, another row could be either leg's other half; `spread`, the two amounts are farther apart than the list's
 * tolerance (and inside `ASK_SPREAD`); `lone`, nothing is against it and it is still only a near match.
 */
export type CrossAsk = {
  key: string;
  first: Leg;
  second: Leg;
  from: string;
  to: string;
  rate: number;
  rate_as_of: string;
  rate_days: number;
  converted: number;
  landed: number;
  why: readonly CrossWhy[];
};

/**
 * The questions `seeds` leave open: for each seed with no partner, every row of another currency it could be one move
 * with that has none either. One per two rows, whichever of them was the seed. Called beside `settle`, with its seeds
 * and its pass.
 *
 * A QUESTION, NOT A WRITE. `settle` leaves both rows counted; what this returns is for the caller to put to a person,
 * and their answer comes back as `Pairing.ruled`. A question that is no longer returned for its rows has gone: one of
 * them paired, left the window, was pinned or deleted (`crossStill`).
 *
 * THE CALLER THAT PUTS THESE TO A PERSON SAYS SO ON THE `Pairing` IT SETTLES AND ASKS WITH (`asks`). Then a match with
 * nothing against it is asked too (`lone`), and so is a wider spread than the tolerance (`spread`); without it this
 * returns the doubtful matches only, as it did.
 *
 * `why` IS NEVER EMPTY. Where neither the rate nor a second candidate is in doubt and the two are not each other's
 * nearest, a row of the leg's own currency stands as near (`crossHeld`), and that is another candidate.
 */
export function crossAsks(p: Pairing, seeds: readonly string[], pass?: Pass): CrossAsk[] {
  if (p.pairs.across_currency === undefined) return [];
  const known = pass?.known ?? new Map<string, string | null>();
  const windows = pass?.windows ?? windowsOf();
  const ledger = windows.ledger;
  const shape = (l: Leg): Shape | null => (ledger === null ? shapeOf(p, l) : shapeIn(p, ledger, l));
  const free = (l: Leg): boolean => answerOf(p, l, known, windows).to === null;
  const farOf = (l: Leg): readonly Leg[] => (crossAround(p, l, windows), windows.wide.get(l.id) ?? []);
  /* How many rows of another currency stand near a leg, inside the tolerance or only inside `ASK_SPREAD`. A ROW WITH A
     PARTNER OF ITS OWN CURRENCY IS TAKEN, as it is for `onlyOne`, and is no second candidate to tell a person about. */
  const open = (l: Leg): boolean => sameOf(p, l, known, windows).to === null;
  const crowd = (l: Leg): number => crossAround(p, l, windows).near.filter((c) => open(c.leg)).length + farOf(l).filter(open).length;
  const out = new Map<string, CrossAsk>();
  for (const id of new Set(seeds)) {
    const leg = loadLeg(p, id);
    if (!leg || leg.deleted_at !== null || !canPair(p, leg, ledger) || !free(leg)) continue;
    const x = shape(leg);
    if (x === null) continue;
    const near = crossAround(p, leg, windows).near.map((c) => ({ other: c.leg, far: false }));
    for (const { other, far } of [...near, ...farOf(leg).map((l) => ({ other: l, far: true }))]) {
      const key = crossKey(leg.id, other.id);
      if (out.has(key) || p.ruled?.has(key) || !free(other)) continue;
      const y = shape(other);
      const read = y === null ? null : crossRead(p, x, y, windows);
      if (read === null) continue;
      let why: CrossWhy[];
      if (far) {
        why = ['spread'];
        if (read.held.days > PAIR_RATE_DAYS) why.push('rate_old');
        if (crowd(leg) > 1 || crowd(other) > 1) why.push('not_only');
      } else {
        why = crossDoubt(p, leg, other, known, windows);
        if (why.length === 0) why = [p.asks === true && crossHeld(p, leg, windows)?.id === other.id && crossHeld(p, other, windows)?.id === leg.id ? 'lone' : 'not_only'];
      }
      const [first, second] = read.first === x ? [leg, other] : [other, leg];
      out.set(key, {
        key,
        first,
        second,
        from: read.from,
        to: read.to,
        rate: read.held.rate,
        rate_as_of: read.held.as_of,
        rate_days: read.held.days,
        converted: convertMinor(read.first.amount.size, read.from, read.to, read.held.rate),
        landed: read.second.amount.size,
        why,
      });
    }
  }
  return [...out.values()];
}

/** The two rows a question is about, from its `key`: the seeds to `settle` again once a person has answered it. */
export const crossLegs = (key: string): [string, string] => {
  const at = key.indexOf('+');
  return [key.slice(0, at), key.slice(at + 1)];
};

/**
 * `Pairing.ruled` from the answers a caller kept: `one` is "these two are one move". Either order of the two rows,
 * and a later answer about the same two replaces an earlier one, so a person may change their mind.
 */
export function ruledOf(answers: Iterable<{ a: string; b: string; one: boolean } | { key: string; one: boolean }>): Map<string, boolean> {
  const ruled = new Map<string, boolean>();
  for (const said of answers) ruled.set('key' in said ? crossKey(...crossLegs(said.key)) : crossKey(said.a, said.b), said.one);
  return ruled;
}

/**
 * Which of the questions a caller holds open still stand, by `key`: the rest are closed without an answer, since
 * their rows paired, left the window, were pinned or deleted, or a newer rate settled them.
 *
 * ASKED OF BOTH ROWS OF EACH, so a question is found whichever of the two a write moved.
 */
export function crossStill(p: Pairing, keys: Iterable<string>, pass?: Pass): Set<string> {
  const open = new Set(keys);
  const asked = crossAsks(p, [...open].flatMap(crossLegs), pass);
  return new Set(asked.map((ask) => ask.key).filter((key) => open.has(key)));
}

/** The rows that could be `leg`'s partner, by id: `settle`'s seeds for a row as it was, or as it is. */
export function neighboursOf(p: Pairing, leg: Leg): string[] {
  const near = candidatesOf(p, leg);
  /* AND THE ROWS OF ANOTHER CURRENCY IT COULD BE ONE MOVE WITH, where the list pairs those: a row leaving a window
     frees the two it stood between as a third leg does in one currency. */
  const cross = p.pairs.across_currency === undefined ? [] : crossAround(p, leg, windowsOf()).near;
  return [...near, ...cross].map((c) => c.leg.id);
}

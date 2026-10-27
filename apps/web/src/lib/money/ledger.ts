/**
 * WHICH LIST IS THE LEDGER, AND WHICH OF ITS FIELDS IS WHICH, read off the record's declarations and never off a name.
 *
 * The quick-add sheet writes one line of money that moved, or two for a move between one's own accounts. The core does
 * not know what an add-on called that list or its fields, so it asks the declarations what each one is:
 *
 *   - the ledger is a list with an amount (`money`), a field that says which way it went (`money-way.ts`), a day, and a
 *     required link to a list that holds money of its own (the account). A list that declares how its moves pair
 *     (`pairs:`) is the ledger before any other, since pairing two legs is what only a ledger does;
 *   - the account is the link the pairing moves `across`, else that required link;
 *   - the category is a link to a list whose own choice field holds the ledger's two ways (`in`, `out`, and perhaps a
 *     value for either);
 *   - the note is a plain text field that is neither the title nor searched;
 *   - the mark a move carries is the pairing's own `mark`, a yes-or-no field.
 *
 * PURE, so `node --test` reads it, and the sheet, the palette and a page all ask the same question.
 */

import { amountField, wayField } from '../record/money-way.ts';
import type { FieldDecl, RegisterDecl } from '../record/schema.ts';
import { splitAtOf } from '../record/split.ts';

/** A list a ledger links to: its id, the field that names a row, and the state a row leaves it by. */
export type SideList = {
  list: string;
  title: string;
  /** The field holding the row's state, and the values that mean it is finished (a closed account, a retired kind). */
  state: string | null;
  done: readonly string[];
};

/** An account list: a side list with the money it holds, whose code is the code its lines are written in. */
export type AccountList = SideList & {
  money: string | null;
  /** A choice field that says what sort of account it is (a bank, cash, a card), when there is one. */
  kind: string | null;
};

/** A category list: a side list with its own way, glyph and colour, each optional. */
export type CategoryList = SideList & {
  /** The choice field holding the ways, and its value for each. `either` is a value that is neither way. */
  way: { field: string; in: string; out: string; either: readonly string[] } | null;
  icon: string | null;
  colour: string | null;
};

/** The ledger, field by field, as the sheet writes it. */
export type Ledger = {
  list: string;
  name: string;
  one: string;
  title: string;
  amount: string;
  way: { field: string; in: string; out: string };
  day: string;
  account: { field: string } & AccountList;
  category: ({ field: string } & CategoryList) | null;
  note: string | null;
  /** The yes-or-no field a move between one's own accounts is marked with, when the list declares how moves pair. */
  mark: string | null;
  /** The field one line's parts are kept in, each a category and its share of the amount (`parts_of`), when there is one. */
  parts?: string | null;
};

/** A value that sends money out, and one that brings it in, by their own words (`money-way.ts` reads them the same). */
const OUT = /^(?:out|outgoing|spent|expense|debit)$|_out$|_by_me$/u;
const IN = /^(?:in|incoming|income|credit)$|_in$|_to_me$/u;

const live = (f: FieldDecl | undefined): f is FieldDecl => f !== undefined && f.retired !== true;
const fieldOf = (decl: RegisterDecl, id: string | undefined): FieldDecl | undefined => (id ? decl.fields.find((f) => f.id === id && live(f)) : undefined);

/** The two values of a way field that go out and come in, or `null` when its words do not say. */
function waysOf(f: FieldDecl | undefined): { in: string; out: string; either: string[] } | null {
  const values = f?.values ?? [];
  const outs = values.filter((v) => OUT.test(v));
  const ins = values.filter((v) => IN.test(v));
  if (outs.length !== 1 || ins.length !== 1) return null;
  return { out: outs[0]!, in: ins[0]!, either: values.filter((v) => v !== outs[0] && v !== ins[0]) };
}

/** What a declaration says about pairing, read as data: the kernel's own type is not this tab's to import. */
function pairsOf(decl: RegisterDecl): { across?: string; mark?: string } | null {
  const p = (decl as { pairs?: unknown }).pairs;
  if (p === null || typeof p !== 'object') return null;
  const { across, mark } = p as { across?: unknown; mark?: unknown };
  return { ...(typeof across === 'string' ? { across } : {}), ...(typeof mark === 'string' ? { mark } : {}) };
}

function sideOf(decl: RegisterDecl): SideList {
  return { list: decl.id, title: decl.title, state: decl.state ?? null, done: decl.done ?? [] };
}

/** An account list as the sheet reads it: the money it holds and the choice that says what sort it is. */
export function accountOf(decl: RegisterDecl): AccountList {
  const money = amountField(decl) ?? decl.fields.find((f) => f.type === 'money' && live(f));
  const kind = decl.fields.find((f) => live(f) && f.type === 'enum' && f.id !== decl.state && f.required === true);
  return { ...sideOf(decl), money: money?.id ?? null, kind: kind?.id ?? null };
}

/**
 * A category list as the sheet reads it, given the ledger's two ways. Its glyph and its colour are the choice fields
 * whose values are glyph names and colour names: the ones a field called so declares, read by their values, so a list
 * whose fields are called otherwise still draws its chips.
 */
export function categoryOf(decl: RegisterDecl, ways: { in: string; out: string }): CategoryList {
  const enums = decl.fields.filter((f) => live(f) && f.type === 'enum' && f.id !== decl.state);
  const wayF = enums.find((f) => (f.values ?? []).includes(ways.in) && (f.values ?? []).includes(ways.out));
  const icon = enums.find((f) => f !== wayF && (f.values ?? []).length > 0 && (f.values ?? []).every((v) => /^[a-z]+(?:-[a-z]+)*$/u.test(v)) && (f.values ?? []).some((v) => v.includes('-')));
  const colour = enums.find((f) => f !== wayF && f !== icon && (f.values ?? []).length > 0 && (f.values ?? []).every((v) => HUES.has(v)));
  return {
    ...sideOf(decl),
    way: wayF ? { field: wayF.id, in: ways.in, out: ways.out, either: (wayF.values ?? []).filter((v) => v !== ways.in && v !== ways.out) } : null,
    icon: icon?.id ?? null,
    colour: colour?.id ?? null,
  };
}

/** The category hues the skin draws (`--cat-<hue>` and `--cat-<hue>-tint`). */
export const HUES: ReadonlySet<string> = new Set(['pink', 'violet', 'blue', 'teal', 'yellow', 'lime', 'sky', 'slate']);

/** One list read as a ledger, or `null` when it is not one. `byId` is every declaration this tab holds. */
export function ledgerFrom(decl: RegisterDecl, byId: ReadonlyMap<string, RegisterDecl>): Ledger | null {
  const amount = amountField(decl);
  const wayF = wayField(decl, amount);
  const ways = waysOf(wayF);
  if (!amount || !wayF || !ways) return null;
  const day = decl.fields.find((f) => live(f) && f.type === 'day' && f.required === true) ?? decl.fields.find((f) => live(f) && f.type === 'day');
  if (!day) return null;
  const holdsMoney = (id: string | undefined): boolean => {
    const target = id ? byId.get(id) : undefined;
    return target !== undefined && target.fields.some((f) => live(f) && f.type === 'money');
  };
  const pairs = pairsOf(decl);
  const refs = decl.fields.filter((f) => live(f) && f.type === 'ref' && typeof f.to === 'string');
  const across = fieldOf(decl, pairs?.across);
  const accountF = across?.type === 'ref' && holdsMoney(across.to) ? across : refs.find((f) => f.required === true && holdsMoney(f.to));
  if (!accountF?.to) return null;
  const accountDecl = byId.get(accountF.to)!;
  const categoryF = refs
    .filter((f) => f !== accountF && f.to !== decl.id)
    .map((f) => ({ f, target: byId.get(f.to!) }))
    .filter((x): x is { f: FieldDecl; target: RegisterDecl } => x.target !== undefined)
    .map((x) => ({ ...x, read: categoryOf(x.target, ways) }))
    .filter((x) => x.read.way !== null)
    .sort((a, b) => Number(b.f.index === true) - Number(a.f.index === true))[0];
  const note = decl.fields.find((f) => live(f) && f.type === 'text' && f.id !== decl.title && f.search !== true && f.required !== true);
  const mark = fieldOf(decl, pairs?.mark);
  const split = splitAtOf(decl);
  return {
    list: decl.id,
    name: decl.name,
    one: decl.one,
    title: decl.title,
    amount: amount.id,
    way: { field: wayF.id, in: ways.in, out: ways.out },
    day: day.id,
    account: { field: accountF.id, ...accountOf(accountDecl) },
    category: categoryF ? { field: categoryF.f.id, ...categoryF.read } : null,
    note: note?.id ?? null,
    mark: mark?.type === 'bool' ? mark.id : null,
    ...(split?.of === amount.id ? { parts: split.field } : {}),
  };
}

/**
 * THE LEDGER AMONG EVERY LIST THIS TAB HOLDS A DECLARATION FOR, or `null` where none is one.
 *
 * A list that declares how its moves pair comes first; among the rest, the first in the order given. A list of what is
 * owed reads like a ledger (an amount, a way, a day) and is not one, which is why the pairing decides and why the
 * account must be a list that holds money.
 */
export function ledgerAmong(decls: readonly RegisterDecl[]): Ledger | null {
  const byId = new Map(decls.map((d) => [d.id, d]));
  const read = decls.map((d) => ({ d, l: ledgerFrom(d, byId) })).filter((x): x is { d: RegisterDecl; l: Ledger } => x.l !== null);
  const paired = read.find((x) => pairsOf(x.d) !== null);
  return (paired ?? read[0])?.l ?? null;
}

/** Whether a page draws the ledger or its accounts: it names either list among what it requires. */
export function pageOfLedger(requires: readonly string[] | undefined, ledger: Pick<Ledger, 'list' | 'account'> | null): boolean {
  if (!ledger || !requires) return false;
  const lists = new Set(requires.map((r) => r.replace(/^register\./u, '')));
  return lists.has(ledger.list) || lists.has(ledger.account.list);
}

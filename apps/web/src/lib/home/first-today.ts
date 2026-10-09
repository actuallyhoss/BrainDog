/**
 * What a first Today offers beside its blocks: the card to tell it one real thing (`TellOne.svelte`), and once that is
 * done, the next steps (`WantMore.svelte`). Use case 6's steps 5 and 6 (planner-45, the onboarding target), which
 * home-first-46 mounts on Today.
 *
 * ONE AT A TIME, AS THE MOCKUP DRAWS THEM. While nothing has been added the card is the first act, alone; the moment
 * something is, the card goes and the next steps take its place, until the person hides them.
 *
 * NOTHING HERE IS ANY ONE RECORD'S (DIRECTION §27). It reads what every `boot` sends, the lists and how many entries each
 * holds, and the lists are known by the part they play (`start/parts.ts`), never by a name.
 *
 * A plain `.ts` with relative imports, so `node --test` can hold it; the screen only calls it.
 */

import type { Boot } from '@braindog/client';

import type { Pref } from '../pref.ts';
import { playedBy } from '../start/parts.ts';
import { madeSteps, type MadeStep } from '../start/made.ts';
import { PAID_STATES, type TellList } from '../tell/read.ts';

/** What these read of `boot`: the lists, each with how many entries it holds. */
type Holds = Pick<Boot, 'registers'>;

/** What these read of the device's preferences: whether the next steps are hidden, and how work arrives. */
type Said = Pick<Pref, 'nextStepsHidden' | 'arrivesBy'>;

/**
 * How many entries a person has put in, across every list.
 *
 * THE RECORD FILLS RATES ITSELF, so the list that keeps them counts for nothing. AND THE PERSON MAY BE HER OWN FIRST
 * PERSON: a People list whose one entry is the person who signed up has had nothing added by hand, so its first entry is
 * not counted. A record that keeps no rates or no People counts every entry.
 */
export function addedByHand(boot: Holds): number {
  const rates = playedBy('rates');
  const people = playedBy('meets');
  let n = 0;
  for (const r of boot.registers) {
    const count = Number.isFinite(r.count) && r.count > 0 ? r.count : 0;
    if (r.id === rates) continue;
    n += r.id === people ? Math.max(0, count - 1) : count;
  }
  return n;
}

/** Whether Today offers the card to tell it one real thing: while nothing is added by hand, and the person has not hidden it. */
export const showTell = (boot: Holds, pref: Said = {}): boolean => pref.nextStepsHidden !== true && addedByHand(boot) === 0;

/**
 * The next steps Today offers, in the order the person's answer puts them, or none: while the card is still the first
 * act, and once the person has hidden them.
 */
export function wantMore(boot: Holds, pref: Said = {}): MadeStep[] {
  if (pref.nextStepsHidden === true || showTell(boot, pref)) return [];
  return madeSteps(boot.registers, pref.arrivesBy);
}

/* ── the card's words that are worked out ────────────────────────────────────── */

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

/** A count as the card says it: "three" up to ten, the number past it. One sentence becomes eight at most. */
export const countWord = (n: number): string => WORDS[n] ?? String(n);

/** "A, B and C". */
const andOf = (items: readonly string[]): string =>
  items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

/** "an order", "a client": one entry of a list, by what the list calls one of its entries. */
const oneOf = (one: string): string => `${/^[aeiou]/iu.test(one) ? 'an' : 'a'} ${one.toLowerCase().replace(/_/g, ' ')}`;

/** What a receipt reads of a list: its name and what it calls one, and, when known, its fields and the states it ends in. */
type Named = Pick<TellList, 'id' | 'name' | 'one'> & Partial<Pick<TellList, 'fields' | 'state' | 'done'>>;

/** One entry added: its list and, when the screen still has them, the fields it was sent with (`$row` over the same call). */
type Added = { register: string; fields?: Readonly<Record<string, unknown>> | undefined };

const isMoney = (v: unknown): boolean =>
  v !== null && typeof v === 'object' && typeof (v as { amount?: unknown }).amount === 'number' && typeof (v as { currency?: unknown }).currency === 'string';

/**
 * WHAT ONE ENTRY IS, AS A PERSON SAYS IT. Money that has moved is "a payment", wherever it was kept: an amount made in a
 * state that says it was paid (the Ledger's cleared, a bill's paid), so a fresh shop's paid item in Bills and invoices
 * is a payment and not "an item". Somebody kept as what they are to you is that: "a client", not "a person". Anything
 * else is what its list calls one, and a list that calls one nothing says its own name.
 */
function oneSaid(m: Added, list: Named | undefined): string {
  if (!list) return 'something in your BrainDog';
  const fields = m.fields ?? {};
  const state = fields[list.state ?? 'state'];
  const paid = typeof state === 'string' && PAID_STATES.includes(state) && (list.done === undefined || list.done.includes(state));
  if (paid && Object.values(fields).some(isMoney)) return 'a payment';
  const kind = (list.fields ?? []).find((f) => f.type === 'enum' && /role|kind/i.test(`${f.id} ${f.label ?? ''}`) && typeof fields[f.id] === 'string');
  if (kind) {
    const v = fields[kind.id] as string;
    return oneOf(kind.labels?.[v] ?? v);
  }
  return list.one ? oneOf(list.one) : `something in ${list.name}`;
}

/**
 * The receipt after the press: "Added an order, a client and a payment", each entry by what it is (`oneSaid`). A new
 * person is said after the first entry that links to them, as the sentence put them ("Nadia wants..." is an order, from
 * a client), and everything else in the order it was added. Nothing says an id.
 */
export function addedSaid(made: readonly Added[], lists: readonly Named[]): string {
  const after = new Map<number, number[]>();
  const top: number[] = [];
  made.forEach((_, i) => {
    const by = made.findIndex((m, j) => j > i && linksOf(m.fields).includes(i));
    if (by === -1) top.push(i);
    else after.set(by, [...(after.get(by) ?? []), i]);
  });
  const order: number[] = [];
  const put = (i: number): void => {
    order.push(i);
    for (const k of after.get(i) ?? []) put(k);
  };
  top.forEach(put);
  const said = order.map((i) => oneSaid(made[i]!, lists.find((l) => l.id === made[i]!.register)));
  return said.length === 0 ? 'Added nothing' : `Added ${andOf(said)}`;
}

/**
 * The lists a sentence is read against: those `boot` says this person holds, each as the record declared it, where this
 * tab has learnt the declaration (`record/held.ts` `REGISTERS`). A list not learnt yet is left out, never guessed. Each
 * carries how many entries `boot` counted in it, so the reader knows an account is held before this tab has learnt its
 * name (`read.ts` keeps a payment off the Ledger only on a record that holds none).
 */
export function tellLists(boot: Holds, declared: Readonly<Record<string, TellList | undefined>>): TellList[] {
  const out: TellList[] = [];
  for (const r of boot.registers) {
    const d = declared[r.id];
    if (d) out.push(Number.isFinite(r.count) ? { ...d, count: r.count } : d);
  }
  return out;
}

/** A field's `{ $row: n }`, the entry at index `n` of the same call, or `null` for anything else (`capture`'s pointer). */
const pointer = (v: unknown): number | null =>
  v !== null && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 1 && typeof (v as { $row?: unknown }).$row === 'number' ? (v as { $row: number }).$row : null;

/** Every entry of the same call a value points at. */
const linksOf = (v: unknown): number[] => {
  const n = pointer(v);
  if (n !== null) return [n];
  if (Array.isArray(v)) return v.flatMap(linksOf);
  return v !== null && typeof v === 'object' ? Object.values(v).flatMap(linksOf) : [];
};

type Read = { register: string; fields: Readonly<Record<string, unknown>>; missing: readonly string[] };

/** Which entries one press can add: nothing missing, and no pointer at one that is not ready, counted until it settles. */
function readyOf(rows: readonly Read[]): boolean[] {
  const ok = rows.map((r) => r.missing.length === 0);
  for (let moved = true; moved; ) {
    moved = false;
    rows.forEach((r, i) => {
      if (ok[i] && linksOf(r.fields).some((n) => ok[n] !== true)) [ok[i], moved] = [false, true];
    });
  }
  return ok;
}

/**
 * THE ENTRIES ONE PRESS CAN ADD NOW (capture-read-45's line): each with nothing missing, and none pointing (`$row`) at an
 * entry that is not ready, since the record writes a capture all or none. Each pointer is counted again over the entries
 * sent. The rest stay in the preview with what they need, so one entry the record would refuse never holds back the
 * client and the order beside it.
 */
export function readyRows(rows: readonly Read[]): { register: string; fields: Record<string, unknown> }[] {
  const ok = readyOf(rows);
  const at = new Map<number, number>();
  ok.forEach((yes, i) => yes && at.set(i, at.size));
  const again = (v: unknown): unknown => {
    const n = pointer(v);
    if (n !== null) return { $row: at.get(n) };
    if (Array.isArray(v)) return v.map(again);
    return v !== null && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, again(x)])) : v;
  };
  return rows.flatMap((r, i) => (ok[i] ? [{ register: r.register, fields: again(r.fields) as Record<string, unknown> }] : []));
}

/**
 * WHAT THE PRESS LEFT BEHIND, SAID ON THE RECEIPT, so an entry held back is never dropped quietly: "Not added: EGP
 * 900.00 in, by InstaPay. It needs account." Each by its preview line, with what the held ones need. Empty when all went.
 */
export function heldSaid(rows: readonly (Read & { said: string })[]): string {
  const ok = readyOf(rows);
  const held = rows.filter((_, i) => !ok[i]);
  if (held.length === 0) return '';
  const needs = [...new Set(held.flatMap((r) => r.missing))];
  const it = held.length === 1 ? 'It needs' : 'They need';
  return `Not added: ${andOf(held.map((r) => r.said))}.${needs.length > 0 ? ` ${it} ${andOf(needs)}.` : ''}`;
}

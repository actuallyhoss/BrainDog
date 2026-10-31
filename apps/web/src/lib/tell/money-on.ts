/**
 * TURN MONEY ON, FOR A MONEY LINE TOLD ON A RECORD THAT KEEPS NONE (audit 31 Oct m, AM4): "Paid 1,200 USD for the Figma
 * team plan" on a Team said "This BrainDog keeps no money yet" and offered nothing to press. Tell's card offers "Turn on
 * Money and add it", and this is its first half: Money turned back on where the person once turned it off, or put in as
 * the module it is (`packDocument`), planned and installed with that plan's own hash, as onboarding puts a module in.
 * The card then reads the line again against the lists Money brought and adds it in the same press.
 *
 * A ROUTE-ONLY MODULE, loaded when the button is pressed, never with Today.
 */

import { createClient } from '@braindog/client';

import { forget, readBoot } from '../record/boot-live.ts';
import { REGISTERS } from '../record/held.ts';
import { packDocument, type PackState } from '../record/packs.ts';
import { learn } from '../record/remote.ts';
import type { Known, Told, TellList, TellOptions, tellRead } from './read.ts';

/** The module that keeps money: accounts, the Ledger, bills and what repeats. */
export const MONEY_MODULE = 'money-core';

type Wire = { ok: true; value: unknown } | { ok: false; refusal?: { fix?: string } };
const fixOf = (w: Wire | null): string => (w && !w.ok ? (w.refusal?.fix ?? '') : '') || 'Money could not be turned on. Try again.';

/**
 * WHAT MONEY'S PLAN ASKS BEYOND ITS LISTS, said before anything is approved (RN3): `lines` are the calls it would make,
 * in the words Modules says them (`callLine`), and `approve` the record's own lines that the next press approves, the
 * same ones and no others. A plan that asks for something with no call to say it by is not approved from Today.
 */
export type MoneyAsk = { lines: string[]; approve: string[] };

/** Money's plan asks for something its lines cannot say on a card: it is turned on in Modules, where each part is shown. */
export const MONEY_ELSEWHERE = 'Money asks for more than its lists. Turn it on in Modules, where each part is shown.';

/**
 * Money on, the sentence that says why not, or what its plan would also approve. `null` when it is on.
 *
 * NOTHING IS APPROVED THAT THE CARD HAS NOT SAID. `install` asks for a plan's call-outs to be passed back so a person has
 * read them; a press of "Turn on Money and add it" approved them unread. Now a plan that asks for any comes back as
 * `{ ask }`, the card says them, and the next press sends `approved`, the lines it showed: a plan that asks for one
 * line more than that is said again, never approved.
 */
export async function turnOnMoney(base: string, approved: readonly string[] = []): Promise<string | null | { ask: MoneyAsk }> {
  const client = createClient({ base });
  const read = (await client.packs().catch(() => null)) as (Wire & { value?: PackState[] }) | null;
  if (!read?.ok) return fixOf(read);
  const held = (read.value ?? []) as PackState[];
  const state = held.find((p) => p.id === MONEY_MODULE);
  if (state) {
    if (state.disabled_at === null) return null;
    const on = (await client.enablePack({ id: MONEY_MODULE }).catch(() => null)) as Wire | null;
    return on?.ok ? null : fixOf(on);
  }
  const doc = await packDocument(MONEY_MODULE, held);
  if (!doc) return fixOf(null);
  const planned = (await client.planPack({ doc, source: { kind: 'local' } }).catch(() => null)) as
    | (Wire & { value?: { diff?: { planHash?: unknown; approve?: unknown; calls_out?: unknown } } })
    | null;
  if (!planned?.ok) return fixOf(planned);
  const hash = planned.value?.diff?.planHash;
  const lines = planned.value?.diff?.approve;
  if (typeof hash !== 'string' || hash === '') return fixOf(null);
  const approve = Array.isArray(lines) ? lines.filter((a): a is string => typeof a === 'string') : [];
  if (approve.some((line) => !approved.includes(line))) {
    const { callsOutOf, callLine } = await import('../record/actions.ts');
    return moneyAskOf(approve, planned.value?.diff?.calls_out, (raw) => {
      const [call] = callsOutOf([raw]);
      return call ? callLine(call) : null;
    });
  }
  const put = (await client.installPack({ doc, source: { kind: 'local' }, planHash: hash, ...(approve.length === 0 ? {} : { approve }) }).catch(() => null)) as Wire | null;
  return put?.ok ? null : fixOf(put);
}

/* The sentence a plan ends its lines with when a scheduled action sends a key: said on the card as it is written. */
const KEY_NOTE = /^A scheduled action opens this key with nobody present\b/u;

/**
 * WHAT THE CARD SAYS FOR EACH LINE THE PRESS WOULD APPROVE, OR MODULES (RO10). The card said the plan's call-outs and the
 * press approved every line in `approve`, so a key or a schedule with no call-out to say it went through unread. Now
 * each line is said: a call-out's own line and its key line by the call they belong to (`say`, `callLine` read off the
 * plan's `calls_out`), the key sentence as written. A line nothing here can say sends him to Modules, where each part is
 * shown, and nothing is approved.
 */
export function moneyAskOf(approve: readonly string[], callsOut: unknown, say: (raw: unknown) => string | null): string | { ask: MoneyAsk } {
  const lines: string[] = [];
  const said = new Set<string>();
  for (const raw of Array.isArray(callsOut) ? callsOut : []) {
    if (typeof raw !== 'object' || raw === null) continue;
    const o = raw as Record<string, unknown>;
    const own = [o.line, o.key_line].filter((l): l is string => typeof l === 'string' && approve.includes(l));
    if (own.length === 0) continue;
    const line = say(raw);
    if (line === null || line.trim() === '') continue;
    lines.push(line);
    for (const l of own) said.add(l);
  }
  for (const a of approve) {
    if (said.has(a) || !KEY_NOTE.test(a) || lines.length === 0) continue;
    lines.push(a);
    said.add(a);
  }
  if (lines.length === 0 || approve.some((a) => !said.has(a))) return MONEY_ELSEWHERE;
  return { ask: { lines, approve: [...approve] } };
}

/** A ref an entry of money must name, an account: the list it links to. */
const accountListsOf = (lists: readonly TellList[]): string[] => [
  ...new Set(lists.flatMap((l) => l.fields.filter((f) => f.type === 'ref' && f.required && /account/i.test(`${f.id} ${f.label ?? ''}`) && f.to).map((f) => f.to as string))),
];

/**
 * THE ACCOUNTS HELD, BY THE NUMBER YOU CAN SAY AND THEIR NAMES, read from the record, for a Money turned back on (RN4):
 * the tab learnt none of them while Money was off, so the line read against an empty list and a payment over a held
 * account went into Bills and invoices, with no Ledger line and no balance moved.
 */
async function accountsOf(client: ReturnType<typeof createClient>, lists: readonly TellList[]): Promise<Known[]> {
  const out: Known[] = [];
  for (const id of accountListsOf(lists)) {
    const title = REGISTERS[id]?.title ?? 'name';
    const got = (await client.list({ register: id, limit: 200, fields: [title], short: true }).catch(() => null)) as (Wire & { value?: { rows?: unknown[] } }) | null;
    if (!got?.ok) continue;
    for (const r of got.value?.rows ?? []) {
      const row = r as { seq?: unknown; fields?: Record<string, unknown> };
      const name = row.fields?.[title];
      if (typeof row.seq === 'number' && typeof name === 'string' && name.trim() !== '') out.push({ seq: row.seq, name: name.trim() });
    }
  }
  return out;
}

/**
 * MONEY ON, THEN THE SAME WORDS READ AGAIN AGAINST THE LISTS IT BROUGHT: the lists Money holds are learnt here (`learn`)
 * and put in the order the record lists them, as Today reads them (`tellLists`), since the first list a line fits is
 * the one it goes into: read against Instalments before Bills and invoices, a payment asked which plan it was part of.
 * The kept `boot` is dropped, so the rail and Today read the record again after.
 *
 * EACH LIST WITH WHAT IT HOLDS, AS THE RECORD COUNTS IT NOW (RN4): a Money switched off and on again brings back lists
 * that still hold entries, so each carries `boot`'s count, and the accounts are read by name, never taken as none.
 */
export async function moneyThenRead(
  base: string,
  words: string,
  options: TellOptions,
  reader: typeof tellRead,
  approved: readonly string[] = [],
): Promise<{ fix: string } | { ask: MoneyAsk } | { told: Told; lists: TellList[] }> {
  const on = await turnOnMoney(base, approved).catch(() => fixOf(null));
  if (typeof on === 'string') return { fix: on };
  if (on !== null) return on;
  const client = createClient({ base });
  const packs = (await client.packs().catch(() => null)) as (Wire & { value?: PackState[] }) | null;
  const ids = (packs?.ok ? (packs.value ?? []) : []).find((p) => p.id === MONEY_MODULE)?.registers ?? [];
  const asked = new Map<string, Promise<void>>();
  await Promise.all(ids.map((id) => learn(client.schema, id, asked).catch(() => {})));
  forget();
  const got = await readBoot(base).catch(() => null);
  const counted = got?.from === 'live' ? got.boot.registers : [];
  const lists = listsOn(options.lists, ids, counted);
  const known = options.accounts ?? [];
  const unread = known.length === 0 && accountListsOf(lists).some((id) => (lists.find((l) => l.id === id)?.count ?? 0) > 0);
  const accounts = unread ? await accountsOf(client, lists) : known;
  return { told: reader(words, { ...options, lists, accounts }), lists };
}

/**
 * The lists a line is read against once Money is on: those already read, and each Money brought as `declared` says it,
 * with what `counted` (the record's `boot`) says it holds, all in the record's order. A list Money brought back holding
 * three accounts is a list of three, never a fresh one (RN4).
 */
export function listsOn(
  lists: readonly TellList[],
  ids: readonly string[],
  counted: readonly { id: string; count: number }[],
  declared: Readonly<Record<string, unknown>> = REGISTERS,
): TellList[] {
  const countOf = (id: string): number => counted.find((r) => r.id === id)?.count ?? 0;
  const held = new Set(lists.map((l) => l.id));
  const brought = ids.flatMap((id) => (held.has(id) || !declared[id] ? [] : [{ ...(declared[id] as TellList), id, pack: MONEY_MODULE, count: countOf(id) }]));
  const order = counted.map((r) => r.id);
  const at = (id: string): number => order.indexOf(id) + 1 || order.length + 1;
  return [...lists, ...brought].sort((a, b) => at(a.id) - at(b.id));
}

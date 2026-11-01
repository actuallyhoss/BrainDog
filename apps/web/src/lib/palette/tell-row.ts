/**
 * ⌘K READS A LINE AS TODAY'S TELL DOES (next steps 1 Nov, T27). "Paid Ada 300 for the logo" in the palette offered only
 * "Add as a task" and "Asking needs a model", while Today's Tell read the same words, with no model, as money out to
 * Ada. The palette now asks Tell's own rules (`tell/read.ts`) over the same lists, day, currency and people, and where
 * they place the line somewhere other than the plain capture list, that is offered first, as one press that adds it all
 * under one batch with the one Undo, the way Tell's Add does.
 *
 * The rules and the write come with the first line typed, never with the palette: a palette opened to go somewhere
 * loads none of it.
 */

import { createClient } from '@braindog/client';

import { apiBase } from '../at.ts';
import { reread } from '../data/live.svelte.ts';
import { addedSaid, readyRows, tellLists } from '../home/first-today.ts';
import { REGISTERS, TITLES } from '../record/held.ts';
import { learn } from '../record/remote.ts';
import { recordToday } from '../record/zone.ts';
import { playedBy } from '../start/parts.ts';
import type { TellOptions, TellRow, tellRead } from '../tell/read.ts';

/** What the palette knows of the record, as the shell gives it (`boot`). */
export type TellShell = {
  now?: number;
  lists?: readonly { id: string; name: string; pack?: string }[];
  index?: { registers?: readonly { id: string; count?: number }[]; currency?: string | null };
};

/** The row the palette draws for a line Tell placed. */
export type TellOffer = { title: string; detail: string; rows: readonly TellRow[] };

export const tellWords = {
  /** "Add money out to Ada" for one; "Add 2 things it heard" for more. */
  one: (said: string) => `Add ${said.charAt(0).toLowerCase()}${said.slice(1)}`,
  many: (n: number) => (n === 2 ? 'Add both things it heard' : `Add the ${n} things it heard`),
  /** Which account an offer adds it through: "from Mercury", "into Wise". */
  through: (way: 'into' | 'from', name: string) => `${way} ${name}`,
  notLoaded: "Couldn't add it. Try again.",
  raced: 'Something changed on your BrainDog while this was sent. Try again.',
} as const;

let reader: typeof tellRead | null = null;
let loading: Promise<void> | null = null;
const asked = new Map<string, Promise<void>>();

/**
 * THE RULES, ASKED FOR ONCE, and the declarations of the lists this tab has not learnt yet. `ready` is called once they
 * are in, so the palette reads the line again.
 */
export function warm(shell: TellShell, ready: () => void): void {
  again = ready;
  const missing = (shell.lists ?? []).map((l) => l.id).filter((id) => REGISTERS[id] === undefined);
  const client = missing.length > 0 ? createClient({ base: apiBase() }) : null;
  const learnt = client ? Promise.all(missing.map((id) => learn(client.schema, id, asked))).then(() => undefined) : Promise.resolve();
  loading ??= import('../tell/read.ts').then((m) => void (reader = m.tellRead));
  void Promise.all([loading, learnt]).then(ready, () => undefined);
}

const knownIn = (register: string | null | undefined) => [...(register ? (TITLES.get(register) ?? []) : [])].map(([seq, name]) => ({ seq, name }));

/** What Tell reads a line against, as Today and the bank paste box read it. */
export function optionsOf(shell: TellShell): TellOptions {
  const counts = shell.index?.registers ?? [];
  const kept = { registers: (shell.lists ?? []).map((l) => ({ id: l.id, name: l.name, count: counts.find((r) => r.id === l.id)?.count ?? 0, ...(l.pack === undefined ? {} : { pack: l.pack }) })) };
  const lists = tellLists(kept, REGISTERS);
  const into = lists.flatMap((l) => l.fields.filter((f) => f.type === 'ref' && f.required && /account/i.test(`${f.id} ${f.label ?? ''}`)).map((f) => f.to));
  return { lists, today: recordToday(shell.now ?? Date.now()), currency: shell.index?.currency ?? null, people: knownIn(playedBy('meets')), accounts: into.flatMap((to) => knownIn(to)) };
}

/** The entries of a list a missing link could name, fetched once a line needs them (`picksOf`). */
const picks = new Map<string, readonly { seq: number; name: string }[]>();
const picking = new Set<string>();
let again: (() => void) | null = null;

/** The entries a missing link may name: those the tab has named, else a few asked of the record once, then read again. */
function picksOf(register: string, title: string): readonly { seq: number; name: string }[] {
  const named = knownIn(register).filter((k) => k.name !== '');
  if (named.length > 0) return named;
  const got = picks.get(register);
  if (got) return got;
  if (!picking.has(register)) {
    picking.add(register);
    /* ASKED OUTSIDE THE READ THAT FOUND THE GAP: this is called while the palette works out its rows, which may not
       touch anything the record's client keeps as state. */
    setTimeout(() => {
      void createClient({ base: apiBase() })
        .list({ register, limit: PICKS, fields: [title], short: true } as never)
        .then((out) => {
          const rows = out.ok ? (((out.value as { rows?: unknown }).rows as { seq?: number; fields?: Record<string, unknown> }[] | undefined) ?? []) : [];
          picks.set(register, rows.flatMap((r) => (typeof r.seq === 'number' && typeof r.fields?.[title] === 'string' ? [{ seq: r.seq, name: r.fields[title] as string }] : [])));
          again?.();
        })
        .catch(() => void picks.set(register, []));
    }, 0);
  }
  return [];
}

/** How many entries a missing link is offered as, each its own row. */
const PICKS = 4;

/**
 * THE OFFERS FOR A LINE, or none: what Tell placed, where it is more than the plain line the palette already offers (one
 * entry in `plain`, the list a plain line goes into). Every entry ready is one offer. AN ENTRY THAT NEEDS ONE LINK it was
 * not told (the account a payment came through, on a record with several) is offered once for each entry the link could
 * name, each saying which: the person picks, nothing is guessed. Anything else still missing is offered nowhere here.
 */
export function offersFor(text: string, shell: TellShell, plain: string | null): TellOffer[] {
  if (reader === null || text.trim().split(/\s+/u).length < 2) return [];
  const opts = optionsOf(shell);
  if (opts.lists.length === 0) return [];
  let told;
  try {
    told = reader(text, opts);
  } catch {
    return [];
  }
  const rows = told.rows;
  if (rows.length === 0) return [];
  if (rows.length === 1 && rows[0]!.register === plain && rows[0]!.missing.length === 0) return [];
  const title = rows.length === 1 ? tellWords.one(rows[0]!.said) : tellWords.many(rows.length);
  const detail = rows.length === 1 ? rows[0]!.detail : rows.map((r) => r.said).join(' · ');
  const short = rows.filter((r) => r.missing.length > 0);
  if (short.length === 0) return [{ title, detail, rows }];
  /* ONE LINK MISSING, THE SAME ONE IN EVERY ENTRY THAT MISSES ANY. */
  const gaps = short.map((r) => {
    const l = opts.lists.find((x) => x.id === r.register);
    const f = r.missing.length === 1 ? l?.fields.find((x) => x.type === 'ref' && x.required === true && typeof x.to === 'string' && !(x.id in r.fields)) : undefined;
    return { r, f, l };
  });
  const to = gaps[0]?.f?.to;
  if (!to || gaps.some((g) => !g.f || g.f.to !== to)) return [];
  const into = opts.lists.find((l) => l.id === to);
  const choices = picksOf(to, into?.title ?? 'name').slice(0, PICKS);
  const way = rows.some((r) => Object.values(r.fields).includes('in')) ? 'into' : 'from';
  return choices.map((c) => ({
    title,
    detail: tellWords.through(way, c.name),
    rows: rows.map((r) => {
      const g = gaps.find((x) => x.r === r);
      return g?.f ? { ...r, fields: { ...r.fields, [g.f.id]: `${to}#${c.seq}` }, missing: [] } : r;
    }),
  }));
}

/** The press: every entry under one batch, the receipt's one Undo taking all of it back. */
export async function addTold(offer: TellOffer, shell: TellShell, toast: (text: string) => void): Promise<boolean> {
  const lists = optionsOf(shell).lists;
  const sent = readyRows(offer.rows);
  if (sent.length === 0) return false;
  let run: typeof import('../data/optimistic.svelte.ts').run;
  try {
    run = (await import('../data/optimistic.svelte.ts')).run;
  } catch {
    toast(tellWords.notLoaded);
    return false;
  }
  const client = createClient({ base: apiBase() });
  const out = await run({
    apply: () => {},
    revert: () => {},
    send: async () => {
      const answer = await client.capture({ rows: sent });
      if (answer.ok) return { ok: true as const, value: answer.value };
      return { ok: false as const, fix: 'refusal' in answer ? answer.refusal.fix : tellWords.raced };
    },
    said: (value) => addedSaid(value.made.map((m, i) => ({ register: m.register, fields: sent[i]?.fields })), lists),
    settle: () => void reread(),
  });
  return out.ok;
}

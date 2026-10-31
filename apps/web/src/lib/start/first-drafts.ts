/**
 * WHAT THE MODEL READ IN A STRANGER'S FIRST WORDS, BEYOND WHAT THE BUILD ALREADY MADE, AS DRAFTS (1 Nov, his words: "perfect
 * the onboarding please, i need it highly intelligent"; his yes to C7).
 *
 * THE RULES BUILD FIRST AND NEVER WAIT. Sign-up reads the sentence by its rules on the device and the build writes what
 * they found (the starter, the places, the entries the words fill completely). Once the BrainDog is made the person is its
 * owner, so the record's own model door (`POST /api/slash/setup`, the one `/start` asks, on the owner's month of asks) reads
 * the same words once more, against the lists this BrainDog now keeps. What it finds that the build did not write (a
 * project named in passing, the people, a to-do, a bill) comes back as drafts: each one shown, kept with one press, changed
 * in place, or let go. NOTHING HERE WRITES. The press on a draft is the write, through the record's capture and its Undo.
 *
 * EVERY VALUE HELD TO THE LIST'S OWN DECLARATION (`entryOf`), as the first run holds the model's entries: a field that does
 * not fit is left out, and an entry missing its title or a required field is no draft. Money is kept only in the
 * BrainDog's own currency, so a draft never asks for a rate.
 *
 * NOTHING TWICE: an entry whose title the build already wrote, or that is the person themselves, is not a draft, and two
 * drafts with one title are one.
 *
 * A plain `.ts` with relative imports, so `node --test` can hold it; the card only calls it.
 */

import { AGENTS_PACK } from '@braindog/seed/packs';
import { moduleOfList } from '@braindog/seed/packs/modules';
import { moduleName } from '@braindog/seed/usecases/names';

import type { SetupOffer, SetupReply } from './ask.ts';
import { entryOf, FILLABLE, listsOf, type List } from './lists.ts';

/** One entry the model read that the build did not write, waiting for the person's press. */
export type FirstDraft = {
  /** Stable for this draft: its list and its title, read without case. */
  key: string;
  register: string;
  /** The list's own name ("Projects", "People"). */
  list: string;
  /** The field its title is kept in, so Change writes the new words there. */
  titleField: string;
  title: string;
  fields: Record<string, unknown>;
  /** The first amount on it, for the card to draw. */
  amount: { minor: number; currency: string } | null;
  /** The first day on it, `YYYY-MM-DD`. */
  day: string | null;
};

/** The modules a BrainDog keeps, read off the lists it holds, in the order first met; the agents' lists are no module here. */
export function modulesHeld(registers: readonly string[]): string[] {
  const out: string[] = [];
  for (const r of registers) {
    const id = moduleOfList(r)?.id;
    if (id !== undefined && id !== AGENTS_PACK.manifest.id && !out.includes(id)) out.push(id);
  }
  return out;
}

/** What the model may fill: the lists of the modules this BrainDog keeps, each with the fields a sentence can fill; no use case. */
export function draftOffer(modules: readonly string[]): SetupOffer {
  return {
    usecases: [],
    modules: modules.map((id) => ({
      id,
      name: moduleName(id),
      lists: listsOf(id).map((l) => ({ id: l.id, name: l.name, fields: l.fields.filter((f) => FILLABLE.has(f.type)).map((f) => f.id) })),
    })),
  };
}

const plain = (s: unknown): string => (typeof s === 'string' ? s.replace(/\s+/gu, ' ').trim().toLowerCase() : '');

/** The list a register is, among the modules held. */
const listIn = (register: string, modules: readonly string[]): List | null => {
  for (const m of modules) {
    const l = listsOf(m).find((x) => x.id === register);
    if (l) return l;
  }
  return null;
};

export type DraftsFrom = {
  /** The modules this BrainDog keeps (`modulesHeld`). */
  modules: readonly string[];
  /** The BrainDog's own currency, the only one a draft's money may be in; `null` keeps no money on a draft. */
  currency: string | null;
  /** What the build wrote from the same words, by list: never offered again. */
  built: readonly { register: string; fields: Readonly<Record<string, unknown>> }[];
  /** The person's own name, who is no draft in People. */
  me: string | null;
};

/** The model's entries as drafts: held to their lists, and none the build already made, the person, or twice. */
export function draftsOf(reply: Pick<SetupReply, 'rows'>, from: DraftsFrom): FirstDraft[] {
  const seen = new Set<string>();
  for (const b of from.built) {
    const l = listIn(b.register, from.modules);
    const t = plain(l ? b.fields[l.title] : undefined);
    if (t !== '') seen.add(`${b.register}:${t}`);
  }
  const me = plain(from.me);
  const out: FirstDraft[] = [];
  for (const r of reply.rows) {
    const list = listIn(r.list, from.modules);
    if (list === null) continue;
    const fields = entryOf(list, r.fields, from.currency);
    if (fields === null) continue;
    const title = String(fields[list.title] ?? '').trim();
    const key = `${list.id}:${plain(title)}`;
    if (title === '' || seen.has(key) || (me !== '' && plain(title) === me)) continue;
    seen.add(key);
    const money = list.fields.find((f) => f.type === 'money' && fields[f.id] !== undefined);
    const day = list.fields.find((f) => f.type === 'day' && typeof fields[f.id] === 'string');
    const m = money ? (fields[money.id] as { amount: number; currency: string }) : null;
    out.push({
      key,
      register: list.id,
      list: list.name,
      titleField: list.title,
      title,
      fields,
      amount: m ? { minor: m.amount, currency: m.currency } : null,
      day: day ? (fields[day.id] as string) : null,
    });
  }
  return out;
}

/** A draft with its title changed by hand: the same entry, under its new words. */
export function retitled(d: FirstDraft, title: string): FirstDraft {
  const t = title.replace(/\s+/gu, ' ').trim().slice(0, 500);
  if (t === '' || t === d.title) return d;
  return { ...d, title: t, fields: { ...d.fields, [d.titleField]: t } };
}

/** The model's one sentence of what this BrainDog is for, where it said one that reads as a sentence and not a label. */
export function summaryOf(reply: Pick<SetupReply, 'summary'>): string | null {
  const s = reply.summary.replace(/\s+/gu, ' ').trim();
  if (s.length < 12 || s.length > 160) return null;
  return s;
}

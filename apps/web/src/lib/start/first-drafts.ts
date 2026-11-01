/**
 * WHAT A STRANGER'S FIRST WORDS HOLD BEYOND WHAT THE BUILD ALREADY MADE, AS DRAFTS (1 Nov, his words: "perfect the
 * onboarding please, i need it highly intelligent"; his yes to C7).
 *
 * THE RULES BUILD FIRST AND NEVER WAIT. Sign-up reads the sentence by its rules on the device and the build writes what
 * they found: the starter, the places, the entries the words fill completely. That reading is about who the person is,
 * so it leaves out the things said in passing: "I pay Nadia 300 a month", "need to call the bank tomorrow", "my sister
 * Huda". Two readers find those once the BrainDog is made, and both only offer:
 *
 * - TELL'S OWN READER, AT ONCE AND ON THE DEVICE (`draftsFromTold`): each sentence read as if it had been told to Today
 *   (`tellRead`), against the lists this BrainDog now keeps. Kept only where it gives something concrete (a day, an
 *   amount, somebody), never the self-introduction, so a bio is not turned into to-dos. This is the fallback: it needs
 *   no model and draws with Today.
 * - THE MODEL, ONCE, AS THE OWNER NOW (`draftsOf`): the record's own door (`POST /api/slash/setup`, the one `/start`
 *   asks, on the owner's month of asks) reads the same words against the same lists. Its entries are held to each
 *   list's declaration (`entryOf`) and join the card when it answers; where both found one thing, it is one draft.
 *
 * NOTHING HERE WRITES. A draft is shown, kept with one press (the record's capture, with its Undo), changed in place,
 * or let go. A draft is one or more entries kept together: a payment and the new person it is paid to go in one press,
 * linked as Tell links them (`$row`).
 *
 * NOTHING TWICE: an entry whose title the build already wrote, or that is the person themselves, is no draft.
 *
 * A plain `.ts` with relative imports, so `node --test` can hold it; the card only calls it.
 */

import { AGENTS_PACK } from '@braindog/seed/packs';
import { moduleOfList } from '@braindog/seed/packs/modules';
import { moduleName } from '@braindog/seed/usecases/names';
import type { TellList, Told } from '../tell/read.ts';
import { PEOPLE } from '../who.ts';
import type { SetupOffer, SetupReply } from './ask.ts';

import { entryOf, FILLABLE, listDocument, listsOf, useCaseOfList, type List } from './lists.ts';

/** One entry of a draft, as the record's capture takes it. */
export type DraftRow = { register: string; fields: Record<string, unknown> };

/** One thing the words held that the build did not write, waiting for the person's press. */
export type FirstDraft = {
  /** Stable for this draft: its list and its title, read without case. */
  key: string;
  /** The entries it writes, in the order the capture takes them; `main` is the one it is about. */
  rows: DraftRow[];
  main: number;
  /** The main entry's list, by its own name ("Projects", "People"). */
  list: string;
  /** The field its title is kept in, so Change writes the new words there. */
  titleField: string;
  title: string;
  /** The line under the title, where the reader said one ("EGP 12,000 out every month"). */
  detail: string | null;
  /** The first amount on it, for the card to draw where no detail says it. */
  amount: { minor: number; currency: string } | null;
  /** The first day on it, `YYYY-MM-DD`. */
  day: string | null;
  /** Who read it: Tell's rules on the device, or the model. */
  by: 'rules' | 'model';
  /**
   * THE ONE FIELD IT STILL NEEDS, asked on the card in place ("Nadia 300 a month" needs the day it is next due): which
   * entry, which field, its type, and the words Tell says it in. Keep waits for it. Absent when it needs nothing.
   */
  needs?: { row: number; field: string; type: 'day' | 'text' | 'number'; label: string };
  /**
   * A LIST CALLED BY THE PERSON'S OWN WORD ("I keep my clients here", so People is Clients): no entries, kept by the
   * record's `renameList`, and Undo is the same call with the old name. Absent on a draft of entries.
   */
  rename?: { list: string; was: string; name: string };
};

/** The field types a draft may ask for in place, as the card can take them: a date, words, or a number. */
const ASKABLE: Readonly<Record<string, 'day' | 'text' | 'number'>> = { day: 'day', text: 'text', int: 'number', decimal: 'number', number: 'number' };

/** A draft with its one missing field filled, or the draft as it was where the value does not fit. */
export function filled(d: FirstDraft, value: string): FirstDraft {
  const n = d.needs;
  if (n === undefined) return d;
  const v = value.trim();
  const fit = n.type === 'day' ? (/^\d{4}-\d{2}-\d{2}$/u.test(v) ? v : null) : n.type === 'number' ? (v !== '' && Number.isFinite(Number(v)) ? Number(v) : null) : v === '' ? null : v.slice(0, 500);
  if (fit === null) return d;
  const { needs: _done, ...rest } = d;
  return { ...rest, ...(n.type === 'day' ? { day: fit as string } : {}), rows: d.rows.map((r, i) => (i === n.row ? { ...r, fields: { ...r.fields, [n.field]: fit } } : r)) };
}

/**
 * The modules a BrainDog keeps, read off the lists it holds, in the order first met; the agents' lists are no module here.
 * A STARTER'S OWN LISTS COUNT AS ITS OWN PACK (`usecase-shop`: Orders, Products), so they are offered too (audit AP1).
 */
export function modulesHeld(registers: readonly string[]): string[] {
  const out: string[] = [];
  for (const r of registers) {
    const id = moduleOfList(r)?.id ?? useCaseOfList(r) ?? undefined;
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
  /** The BrainDog's own currency, the only one a model's money may be in; `null` keeps no money on its drafts. */
  currency: string | null;
  /** What the build wrote from the same words, by list: never offered again. */
  built: readonly DraftRow[];
  /** The person's own name, who is no draft in People. */
  me: string | null;
};

/** The keys the build already wrote, and the person: what no draft may be. */
function takenBy(from: Pick<DraftsFrom, 'built' | 'modules'>, titleOf: (register: string) => string | null): Set<string> {
  const seen = new Set<string>();
  for (const b of from.built) {
    const field = titleOf(b.register);
    const t = plain(field === null ? undefined : b.fields[field]);
    if (t !== '') seen.add(`${b.register}:${t}`);
  }
  return seen;
}

const isMoney = (v: unknown): v is { amount: number; currency: string } =>
  typeof v === 'object' && v !== null && typeof (v as { amount?: unknown }).amount === 'number' && typeof (v as { currency?: unknown }).currency === 'string';
const isDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(v);

/**
 * THE MODEL'S OWN WORDS FOR THE LISTS, AS DRAFTS (onboard-b: "list renames need a record rename call"): "Clients" for
 * People where the words said clients. Only a list this BrainDog holds, a name of a word or a few, and never the name it
 * has already; `names` is what each list is called now, by id, where the caller knows it.
 */
export function renamesOf(reply: Pick<SetupReply, 'names'>, from: Pick<DraftsFrom, 'modules'> & { names?: Readonly<Record<string, string>> }): FirstDraft[] {
  const out: FirstDraft[] = [];
  for (const n of reply.names ?? []) {
    const list = listIn(n.list, from.modules);
    const name = typeof n.name === 'string' ? n.name.replace(/\s+/gu, ' ').trim() : '';
    if (list === null || name === '' || name.length > 40 || /[{}\n]/u.test(name)) continue;
    const was = from.names?.[list.id] ?? list.name;
    if (plain(was) === plain(name) || out.some((d) => d.rename?.list === list.id)) continue;
    out.push({ key: `rename:${list.id}`, rows: [], main: 0, list: was, titleField: '', title: name, detail: `What you call ${was}`, amount: null, day: null, by: 'model', rename: { list: list.id, was, name } });
  }
  return out;
}

/** The model's entries as drafts: held to their lists, and none the build already made, the person, or twice. */
export function draftsOf(reply: Pick<SetupReply, 'rows'>, from: DraftsFrom): FirstDraft[] {
  const seen = takenBy(from, (r) => listIn(r, from.modules)?.title ?? null);
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
    /* A TASK IS A THING TO DO, written as one: an answer the model took for one is no draft. */
    if (list.id === 'tasks' && !readsAsTodo(title)) continue;
    seen.add(key);
    const money = Object.values(fields).find(isMoney) ?? null;
    out.push({
      key,
      rows: [{ register: list.id, fields }],
      main: 0,
      list: list.name,
      titleField: list.title,
      title,
      detail: null,
      amount: money ? { minor: money.amount, currency: money.currency } : null,
      day: Object.values(fields).find(isDay) ?? null,
      by: 'model',
    });
  }
  return out;
}

/** Where one clause ends and the next thing to do starts: "… for design and need to call the bank tomorrow". */
const NEXT_TODO = /,?\s+(?:and|but)\s+(?=(?:i\s+|we\s+)?(?:also\s+)?(?:need|have|must|got|remember|want|am going|'m going)\s+to\b)/iu;
/** What a person says before the thing itself, which Tell would keep in its title: "Life admin:", "and", "I need to". */
const LABEL = /^[^:,.]{1,30}:\s*/u;
const LEAD = /^(?:and|also|plus|then|oh)\s+/iu;
const MUST = /^(?:(?:i|we)\s+(?:also\s+)?)?(?:need|have|must|got|remember|want|am going|'m going)\s+to\s+/iu;
const SUBJECT = /^(?:i|we)\s+(?=(?:pay|owe|get|earn|spend|buy|rent|send|call|meet|charge|bill|invoice)\b)/iu;

/**
 * THE CLAUSES OF WHAT WAS TYPED, each read on its own as one thing told: the sentences, a second thing to do split off
 * its own clause, and the words a person puts before the thing taken off, so Tell's title is the thing ("Call the bank",
 * "Rent"). `said` is the clause as typed, for telling a self-introduction from a thing to do; `text` is what Tell reads.
 */
export function clausesOf(said: string): { said: string; text: string }[] {
  return said
    .split(/(?<=[.!?;])\s+|\n+/u)
    .flatMap((s) => s.split(NEXT_TODO))
    .map((s) => s.trim())
    .filter((s) => s.length > 2)
    .map((s) => {
      const text = s.replace(LABEL, '').replace(LEAD, '').replace(MUST, '').replace(SUBJECT, '').trim();
      return { said: s, text: text.charAt(0).toUpperCase() + text.slice(1) };
    })
    .filter((c) => c.text.length > 2);
}

/** A sentence about who the person is, which Tell would read as a to-do ("I run a small candle shop"). */
const ABOUT_ME = /^(?:hi|hello|hey)?[\s,!]*(?:i'?m|i am|i run|i own|i work|i have|i've|i do|i'm a|we are|we're|we run|my name|this is)\b/iu;
/**
 * Words a to-do starts with, so "need to call the bank" is a to-do and "a solo founder building Tallow" is not. A VERB OF
 * DOING COUNTS AT THE FRONT OF THE CLAUSE (1 Nov, a live run: "A spreadsheet and invoices by email", an answer about how
 * she works, was offered as a task for its "email"), and "want to" is a wish, not a thing to do.
 */
const DOING = /\b(?:need to|have to|must|got to|remember to|going to)\b|^(?:(?:and|also|then)\s+)?(?:(?:i|we)\s+(?:also\s+)?(?:should|will|'ll|must)\s+)?(?:call|email|text|send|book|buy|pay|finish|fix|file|renew|cancel|chase|ask|meet|pick up|drop off|submit|reply to|follow up|invoice|sign|post|ship|review|update|prepare|write|set up|list|add)\b/iu;

/** Whether an entry's title reads as a thing to do ("Send Fenwick's invoice"), for the drafts that land in Tasks. */
export const readsAsTodo = (title: string): boolean => DOING.test(title.trim());

/** One name as a person writes it: "Karim", "Hana", "Lina Haddad". */
const NAME = String.raw`\p{Lu}\p{Ll}+(?:\s\p{Lu}\p{Ll}+)?`;
/**
 * THE PEOPLE A SENTENCE SAYS ARE AROUND THE PERSON, which Tell reads as a thing to do ("Karim and Hana are on my team"
 * became a task called that, audit AP2): who is on their team, works with them, or is their sister, client or cofounder.
 * Each name is a draft in People with what was said of them; nothing else in the sentence is read here.
 */
const AROUND = [
  new RegExp(String.raw`^(${NAME}(?:(?:,\s*|,?\s+and\s+)${NAME})*)\s+(?:is|are)\s+(?:on|in|part of)\s+(?:my|our|the)\s+team\b`, 'u'),
  new RegExp(String.raw`^(${NAME}(?:(?:,\s*|,?\s+and\s+)${NAME})*)\s+works?\s+(?:with|for)\s+(?:me|us)\b`, 'u'),
  new RegExp(String.raw`^(?:[Aa]nd\s+)?(?:[Mm]y|[Oo]ur)\s+(?:sister|brother|mum|mom|dad|wife|husband|partner|son|daughter|friend|colleague|cofounder|co-founder|boss|client|accountant|lawyer|landlord)\s+(?:is\s+)?(\p{Lu}\p{Ll}+)\b`, 'u'),
];
const TEAM_SAID = /\bteam\b/iu;

/** The names a clause says are around the person, and what was said of them, or `null`. */
export function peopleAround(said: string): { names: string[]; detail: string } | null {
  const s = said.trim();
  for (const re of AROUND) {
    const m = re.exec(s);
    if (!m?.[1]) continue;
    const names = m[1].split(/,\s*|,?\s+and\s+/u).map((n) => n.trim()).filter((n) => n !== '' && !/^(?:I|We|My|Our|The)$/u.test(n));
    if (names.length === 0) continue;
    const kin = /(?:my|our)\s+([a-z-]+)/iu.exec(s)?.[1]?.toLowerCase();
    return { names, detail: TEAM_SAID.test(s) ? 'On your team' : re === AROUND[1] ? 'Works with you' : kin ? `Your ${kin}` : '' };
  }
  return null;
}

/**
 * TELL'S READING OF EACH SENTENCE, AS DRAFTS: the rows one sentence became, split into the groups that point at one
 * another (`$row`: the payment and the person it names), each group one draft. A group is kept only where it is concrete:
 * it has a day or an amount, it is somebody, or its words read as a thing to do. Nothing that still needs a field, the
 * person, or what the build wrote.
 */
export function draftsFromTold(read: readonly { said: string; told: Pick<Told, 'rows'> }[], lists: readonly TellList[], from: Pick<DraftsFrom, 'built' | 'me'>): FirstDraft[] {
  const listOf = (id: string): TellList | undefined => lists.find((l) => l.id === id);
  const seen = takenBy({ built: from.built, modules: [] }, (r) => listOf(r)?.title ?? null);
  const me = plain(from.me);
  const out: FirstDraft[] = [];
  const people = listOf(PEOPLE);
  for (const { said, told } of read) {
    /* THE PEOPLE AROUND THEM FIRST, never the task Tell would make of the sentence. */
    const around = people === undefined ? null : peopleAround(said);
    if (around !== null && people !== undefined) {
      for (const name of around.names) {
        const key = `${PEOPLE}:${plain(name)}`;
        if (seen.has(key) || (me !== '' && plain(name) === me)) continue;
        seen.add(key);
        out.push({ key, rows: [{ register: PEOPLE, fields: { [people.title]: name } }], main: 0, list: people.name, titleField: people.title, title: name, detail: around.detail === '' ? null : around.detail, amount: null, day: null, by: 'rules' });
      }
      continue;
    }
    if (ABOUT_ME.test(said) && !DOING.test(said)) continue;
    const rows = told.rows;
    /* ONE FIELD STILL NEEDED IN THE WHOLE SENTENCE IS ASKED ON THE CARD; MORE IS NO DRAFT. */
    if (rows.length === 0 || rows.reduce((n, r) => n + r.missing.length, 0) > 1) continue;
    /* THE GROUPS: rows joined by a `$row` that points from one to another. */
    const group = rows.map((_, i) => i);
    const root = (i: number): number => (group[i] === i ? i : (group[i] = root(group[i]!)));
    rows.forEach((r, i) => {
      for (const v of Object.values(r.fields)) {
        if (typeof v === 'object' && v !== null && '$row' in v && typeof v.$row === 'number' && v.$row >= 0 && v.$row < rows.length) group[root(i)] = root(v.$row);
      }
    });
    const groups = new Map<number, number[]>();
    rows.forEach((_, i) => groups.set(root(i), [...(groups.get(root(i)) ?? []), i]));
    for (const at of groups.values()) {
      /* THE MAIN ENTRY IS THE ONE OTHERS POINT FROM: the payment, never the person it names. */
      const main = at.find((i) => Object.values(rows[i]!.fields).some((v) => typeof v === 'object' && v !== null && '$row' in v)) ?? at[0]!;
      const r = rows[main]!;
      const list = listOf(r.register);
      if (list === undefined) continue;
      const title = String(r.fields[list.title] ?? '').trim();
      const key = `${r.register}:${plain(title)}`;
      if (title === '' || seen.has(key) || (me !== '' && plain(title) === me)) continue;
      const values = at.flatMap((i) => Object.values(rows[i]!.fields));
      const money = values.find(isMoney) ?? null;
      const day = values.find(isDay) ?? null;
      const somebody = at.some((i) => rows[i]!.register === PEOPLE);
      if (money === null && day === null && !somebody && !DOING.test(said)) continue;
      /* THE FIELD STILL NEEDED, by the list's own declaration (as Tell's `missingOf` reads it), where it is one the card can ask. */
      let needs: FirstDraft['needs'];
      const short = at.find((i) => rows[i]!.missing.length > 0);
      if (short !== undefined) {
        const sl = listOf(rows[short]!.register);
        const f = sl?.fields.find((x) => x.required && rows[short]!.fields[x.id] === undefined && x.default === undefined && !x.retired);
        const type = f ? ASKABLE[f.type] : undefined;
        if (f === undefined || type === undefined) continue;
        needs = { row: at.indexOf(short), field: f.id, type, label: rows[short]!.missing[0]! };
      }
      seen.add(key);
      /* THE GROUP'S OWN ORDER, with each `$row` pointed again at its place in the group. */
      const place = new Map(at.map((i, n) => [i, n]));
      const sent = at.map((i) => ({
        register: rows[i]!.register,
        fields: Object.fromEntries(
          Object.entries(rows[i]!.fields).map(([k, v]) => [k, typeof v === 'object' && v !== null && '$row' in v ? { $row: place.get(v.$row) ?? 0 } : v]),
        ),
      }));
      out.push({
        key,
        rows: sent,
        main: place.get(main) ?? 0,
        list: list.name,
        titleField: list.title,
        title,
        detail: r.detail.trim() === '' ? null : r.detail,
        amount: money ? { minor: money.amount, currency: money.currency } : null,
        day,
        by: 'rules',
        ...(needs === undefined ? {} : { needs }),
      });
    }
  }
  return out;
}

/**
 * THE TWO READINGS AS ONE CARD: the model's first where it answered, then Tell's that the model did not also find. One
 * thing found by both is one draft, by its list and a title one holds the other of ("Call the bank" and "Call the bank
 * tomorrow").
 */
export function mergeDrafts(model: readonly FirstDraft[], rules: readonly FirstDraft[]): FirstDraft[] {
  const same = (a: FirstDraft, b: FirstDraft): boolean => {
    if (a.rows[a.main]?.register !== b.rows[b.main]?.register) return false;
    const x = plain(a.title);
    const y = plain(b.title);
    return x === y || x.includes(y) || y.includes(x);
  };
  return [...model, ...rules.filter((r) => !model.some((m) => same(m, r)))];
}

/** A draft with its title changed by hand: the same entries, its main one under the new words. */
export function retitled(d: FirstDraft, title: string): FirstDraft {
  const t = title.replace(/\s+/gu, ' ').trim().slice(0, 500);
  if (t === '' || t === d.title) return d;
  /* A LIST'S NEW NAME CHANGED BY HAND is the name it is kept as. */
  if (d.rename) return { ...d, title: t.slice(0, 40), rename: { ...d.rename, name: t.slice(0, 40) } };
  return { ...d, title: t, rows: d.rows.map((r, i) => (i === d.main ? { ...r, fields: { ...r.fields, [d.titleField]: t } } : r)) };
}

/** The model's one sentence of what this BrainDog is for, where it said one that reads as a sentence and not a label. */
export function summaryOf(reply: Pick<SetupReply, 'summary'>): string | null {
  const s = reply.summary.replace(/\s+/gu, ' ').trim();
  if (s.length < 12 || s.length > 160) return null;
  return s;
}

/**
 * THE LISTS TELL READS AGAINST, FROM THE MODULES' OWN DECLARATIONS, for a screen that has not learned them from the
 * record yet (the made screen, which counts what waits on Today before Today has drawn). Today reads against the record's
 * own (`tellLists`), with its people and entries, so its count can only be the same or smaller.
 */
export function tellListsOf(modules: readonly string[], today: string): TellList[] {
  const out: TellList[] = [];
  for (const m of modules) {
    const doc = listDocument(m, today);
    for (const d of Array.isArray(doc?.declarations) ? (doc.declarations as Record<string, unknown>[]) : []) {
      if (typeof d.register !== 'string' || !Array.isArray(d.fields) || out.some((l) => l.id === d.register)) continue;
      const fields = d.fields as TellList['fields'];
      out.push({
        id: d.register,
        name: typeof d.name === 'string' ? d.name : d.register,
        ...(typeof d.one === 'string' ? { one: d.one } : {}),
        title: typeof d.title === 'string' ? d.title : (fields[0]?.id ?? ''),
        fields,
        ...(typeof d.state === 'string' ? { state: d.state } : {}),
        ...(Array.isArray(d.done) ? { done: d.done as string[] } : {}),
        ...(typeof d.icon === 'string' ? { icon: d.icon } : {}),
      });
    }
  }
  return out;
}

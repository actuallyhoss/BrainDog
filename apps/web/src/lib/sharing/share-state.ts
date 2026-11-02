/**
 * The Share sheet as data: what it is opened on, what somebody has chosen in it, the share JSON
 * that turns into (§2.3), the sentence it is said in before the record answers, and the line counting what they will
 * see. `ShareSheet.svelte` draws this and sends what `sharesOf` makes; nothing here reads or writes the record.
 *
 * ONE SHARE, OR A TEMPLATE'S BUNDLE. Without a chip the sheet makes one allow. A chip (`templates.ts`) makes the
 * template's rows, its allow carrying what the sheet says for Can, Hide, Until and More, its denies as the template
 * wrote them; the record keeps them as one bundle and says them as one sentence.
 *
 * THE DEFAULTS ARE §6's. A share to an email ends in 30 days unless somebody says otherwise; a share to somebody with a
 * role has no end. Their agents are on, and Can delete is on for Edit. A switch left at its default is not written, so
 * the share JSON says only what was chosen.
 *
 * THE SENTENCE IS THE RECORD'S OWN WORDS (`shareSentenceOf`), named from what the browser holds, so it is drawn as the
 * choices change and the record's `sharePreview` replaces it when it lands. `share-state.test.ts` holds the two equal.
 *
 * PLAIN TYPESCRIPT WITH RELATIVE IMPORTS, so a test loads it in Node.
 */

import { shareSentenceOf, type Share, type ShareCaps, type ShareHide, type ShareNames, type ShareRung, type ShareTarget, type ShareWhen, type ShareWhere } from '@braindog/kernel';

import { copy } from '../copy.ts';
import { deletesOf, rowsOf, rungOf, templateOf, type Fills, type Offers } from './templates.ts';
import { recordMidnight, recordToday } from '../record/zone.ts';

const DAY_MS = 86_400_000;
/** How long a share with somebody not on the record lasts unless somebody says otherwise (§6, default 2). */
export const GUEST_DAYS = 30;
/** Weekdays 9 to 6, as the More switch writes it. */
export const WEEKDAYS = { days: [1, 2, 3, 4, 5], from: '09:00', to: '18:00' } as const;

/** A list as the sheet reads its declaration: a structural slice of `RegisterDecl`, so a test can hand one in. */
export type ListDecl = {
  name: string;
  one?: string | undefined;
  title?: string | undefined;
  fields: readonly { id: string; type: string; label?: string | undefined; retired?: boolean | undefined; to?: string | undefined }[];
};
export type Decls = Readonly<Record<string, ListDecl | undefined>>;

/** What the sheet is opened on. A project and a row are named by their number until the record says their id. */
export type Subject =
  | { kind: 'project'; register: string; seq: number; id: string | null; name: string }
  | { kind: 'list'; list: string; name: string; view?: { where: ShareWhere } | undefined }
  | { kind: 'row'; list: string; seq: number; id: string | null; name: string }
  /* FROM THE SHARING PAGE: a new share of anything on the record, or one share kept, to change, whose target stays. */
  | { kind: 'record'; name: string }
  | { kind: 'held'; id: string; target: ShareTarget; name: string };

/**
 * Who the share is with: somebody on the record, a group, or an address not on it yet. `team` is somebody who holds a
 * role on the whole record (Owner, Admin, Member, Viewer or Adds only); anybody else is outside his team.
 */
export type With =
  | { kind: 'person'; id: string; name: string; team?: boolean | undefined }
  | { kind: 'group'; id: string; name: string; people: number }
  | { kind: 'email'; email: string };

/** What part of the subject: all of it, one list of a project, or the subject list's rows a condition picks. */
export type What = { kind: 'all' } | { kind: 'list'; list: string } | { kind: 'where'; where: ShareWhere | null };

export const UNTILS = ['day1', 'week', 'days30', 'day', 'none'] as const;
export type Until = { kind: 'day1' | 'week' | 'days30' | 'none' } | { kind: 'day'; day: string };

export type SheetState = {
  with: With | null;
  can: ShareRung;
  what: What;
  /**
   * "Amounts" hides every money field; `fields` hides named ones, by list. `chosen` is whether somebody pressed Amounts:
   * until they do, it follows who the share is with (`amountsFor`), hidden from anybody outside his team.
   */
  hide: { amounts: boolean; fields: Readonly<Record<string, readonly string[]>>; chosen?: boolean | undefined };
  until: Until;
  weekdays: boolean;
  once: boolean;
  /** Their agents too: their tokens read what they can, as §6 default 4 has it. */
  withAgents: boolean;
  /** Can delete, read only at Edit and Manage. */
  remove: boolean;
  /** The chip pressed, while its rows are the share. */
  template: string | null;
};

/** A day `days` from `now`, as a date field holds it. */
export const dayAhead = (now: number, days: number): string => recordToday(now + days * DAY_MS);

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/u;
export const isEmail = (s: string): boolean => EMAIL.test(s.trim());

/** Somebody the record does not hold yet: their share ends in 30 days unless somebody says otherwise. */
export const guest = (w: With | null): boolean => w?.kind === 'email';

/** Whether somebody is on his own team: a person with a role on the whole record. A group or an address never is. */
export const onTeam = (w: With | null): boolean => w?.kind === 'person' && w.team === true;

/**
 * AMOUNTS ARE HIDDEN FROM ANYBODY OUTSIDE HIS TEAM UNLESS HE SHOWS THEM (the owner's call of 21 October): a guest, a
 * group or an address is shown a project's tasks and not its money until he turns Amounts off. Somebody on his team
 * sees amounts, as their role already does. A press on Amounts is his, and who the share is with no longer moves it.
 */
export function amountsFor(s: SheetState, w: With | null): SheetState['hide'] {
  return s.hide.chosen === true ? s.hide : { ...s.hide, amounts: w !== null && !onTeam(w), chosen: false };
}

/** Amounts pressed: hidden or shown as he says, from now on. */
export const amountsPressed = (s: SheetState): SheetState => ({ ...s, hide: { ...s.hide, amounts: !s.hide.amounts, chosen: true } });

/** Whether somebody may share at all: an owner, or an Admin over the whole record, as the record's `team` asks. */
export { canShare } from './may-share.ts';

/** A sheet as it opens on `subject`: View, all of it, no end, their agents on. */
export function startOf(subject: Subject): SheetState {
  return {
    with: null,
    can: 'view',
    what: subject.kind === 'list' && subject.view ? { kind: 'where', where: subject.view.where } : { kind: 'all' },
    hide: { amounts: false, fields: {} },
    until: { kind: 'none' },
    weekdays: false,
    once: false,
    withAgents: true,
    remove: true,
    template: null,
  };
}

/** Somebody picked: an address starts at 30 days, anybody on the record at no end, unless a chip says its own. */
export function withPicked(s: SheetState, w: With | null, now: number): SheetState {
  return { ...s, with: w, until: lengthOf(templateOf(s.template)?.days ?? null, w, now), hide: amountsFor(s, w) };
}

/** How long a share lasts unless somebody says otherwise: a chip's days, else 90 for an address, else no end. */
function lengthOf(days: number | null, w: With | null, now: number): Until {
  const n = days ?? (guest(w) ? GUEST_DAYS : null);
  return n === null ? { kind: 'none' } : { kind: 'day', day: dayAhead(now, n) };
}

/** A chip pressed: its rung, its length, and delete as it says. Pressed again, it lets go and the sheet stays as it is. */
export function chipPressed(s: SheetState, id: string, now: number): SheetState {
  if (s.template === id) return { ...s, template: null };
  const t = templateOf(id);
  if (!t) return s;
  const until = lengthOf(t.days, s.with, now);
  const asksWhere = t.asks.includes('where');
  return { ...s, template: id, can: rungOf(t), until, remove: deletesOf(t), what: asksWhere && s.what.kind !== 'where' ? { kind: 'where', where: null } : s.what };
}

/** What a chip's `$` words are filled from: the subject, and the condition the sheet holds. */
export function fillsOf(s: SheetState, subject: Subject): Fills {
  return {
    project: subject.kind === 'project' ? subject.id : null,
    list: subject.kind === 'list' || subject.kind === 'row' ? subject.list : null,
    where: s.what.kind === 'where' ? (s.what.where ?? undefined) : undefined,
    row: subject.kind === 'row' ? subject.id : null,
  };
}

/** What the subject can give a chip. */
export const offersOf = (subject: Subject): Offers => ({ project: subject.kind === 'project', list: subject.kind === 'list', row: subject.kind === 'row' });

/** The share's target, from the subject and What. `null` while the subject's id or the condition is not known yet. */
export function targetOf(subject: Subject, what: What): ShareTarget | null {
  if (subject.kind === 'held') return subject.target;
  if (subject.kind === 'record') return what.kind === 'list' ? { lists: [what.list] } : { record: true };
  if (subject.kind === 'project') {
    if (subject.id === null) return null;
    return what.kind === 'list' ? { project: subject.id, lists: [what.list] } : { project: subject.id };
  }
  if (subject.kind === 'row') return subject.id === null ? null : { list: subject.list, rows: [subject.id] };
  if (what.kind === 'where') return what.where === null ? null : { list: subject.list, where: what.where };
  return { lists: [subject.list] };
}

/** Who, as the grammar says it. An address is sent lower-case and trimmed, as the record keeps it. */
export function whoOf(w: With): Share['who'] {
  return w.kind === 'email' ? { kind: 'email', id: w.email.trim().toLowerCase() } : { kind: w.kind, id: w.id };
}

/** When it ends, as an instant: a picked day lasts to its end. */
export function untilAt(u: Until, now: number): string | undefined {
  if (u.kind === 'none') return undefined;
  /* THE END OF THAT DAY ON THE RECORD'S CLOCK (collab pass 2), as every day on the screen is the record's: read as UTC, a
     share "until 2 Dec" on a record in New York stopped at seven in the evening of the 2nd. */
  if (u.kind === 'day') {
    const after = Date.parse(`${u.day}T12:00:00Z`) + DAY_MS;
    return Number.isFinite(after) ? new Date(recordMidnight(after) - 1000).toISOString() : `${u.day}T23:59:59.000Z`;
  }
  const days = u.kind === 'day1' ? 1 : u.kind === 'week' ? 7 : 30;
  return new Date(now + days * DAY_MS).toISOString();
}

export function whenOf(s: SheetState, now: number): ShareWhen | undefined {
  const until = untilAt(s.until, now);
  const w: ShareWhen = {
    ...(until === undefined ? {} : { until }),
    ...(s.weekdays ? { hours: { days: [...WEEKDAYS.days], from: WEEKDAYS.from, to: WEEKDAYS.to } } : {}),
    ...(s.once ? { once: true as const } : {}),
  };
  return Object.keys(w).length ? w : undefined;
}

/** Only what differs from the defaults: their agents off, or delete off at Edit or Manage. */
export function capsOf(s: SheetState): ShareCaps | undefined {
  const c: ShareCaps = {
    ...(s.withAgents ? {} : { agents: false }),
    ...(!s.remove && (s.can === 'edit' || s.can === 'manage') ? { delete: false } : {}),
  };
  return Object.keys(c).length ? c : undefined;
}

const moneyOf = (d: ListDecl | undefined): string[] => (d ? d.fields.filter((f) => f.type === 'money' && !f.retired && f.id !== d.title).map((f) => f.id) : []);

/**
 * What is hidden. Amounts alone is every money field, now and later (`types`); named fields are by list; both is the
 * named ones with every money field the browser knows of beside them, since the grammar holds one shape or the other.
 */
export function hideOf(s: SheetState, decls: Decls): ShareHide | undefined {
  const named = Object.entries(s.hide.fields).filter(([, fs]) => fs.length > 0);
  if (!s.hide.amounts) return named.length ? Object.fromEntries(named.map(([l, fs]) => [l, [...fs]])) : undefined;
  if (named.length === 0) return { types: ['money'] };
  const out: Record<string, string[]> = Object.fromEntries(named.map(([l, fs]) => [l, [...fs]]));
  for (const [id, d] of Object.entries(decls)) {
    const money = moneyOf(d);
    if (money.length) out[id] = [...new Set([...(out[id] ?? []), ...money])];
  }
  return out;
}

/** The lists a choice reaches, as far as the browser can say: what Hide offers fields from. */
export function listsOf(s: SheetState, subject: Subject, decls: Decls, inProject: readonly string[]): string[] {
  if (s.template !== null) return [];
  if (subject.kind === 'held') return listsIn(subject.target).filter((l) => decls[l] !== undefined);
  if (subject.kind === 'record') return s.what.kind === 'list' ? [s.what.list] : [];
  if (subject.kind !== 'project') return [subject.list];
  return s.what.kind === 'list' ? [s.what.list] : [...inProject].filter((l) => decls[l] !== undefined);
}

/** The lists a target names by id: one list, named lists, or a project's named lists. None for the rest. */
function listsIn(t: ShareTarget): string[] {
  if ('list' in t) return [t.list];
  if ('lists' in t && Array.isArray(t.lists)) return [...t.lists];
  return [];
}

/** Whether Hide offers Amounts: something reached holds money, or a chip's share reaches lists the browser cannot list. */
export const amountsOffered = (s: SheetState, reached: readonly string[], decls: Decls): boolean =>
  s.template !== null || reached.some((l) => moneyOf(decls[l]).length > 0);

/** The share JSON, one row or a chip's bundle with its allow first. Empty while the sheet is not ready to share. */
export function sharesOf(s: SheetState, subject: Subject, now: number, decls: Decls): Share[] {
  if (!ready(s, subject)) return [];
  const who = whoOf(s.with!);
  const caps = capsOf(s);
  const hide = hideOf(s, decls);
  const when = whenOf(s, now);
  const extra = { ...(caps ? { caps } : {}), ...(hide ? { hide } : {}), ...(when ? { when } : {}) };
  const t = templateOf(s.template);
  if (t) {
    const rows = rowsOf(t, fillsOf(s, subject)) ?? [];
    const out = rows.map(
      (r): Share =>
        r.effect === 'allow'
          ? { effect: 'allow', who, what: r.what as ShareTarget, can: s.can, ...extra }
          : { effect: 'deny', who, what: r.what as ShareTarget, can: r.can, ...(r.caps ? { caps: r.caps } : {}) },
    );
    return out.sort((a, b) => (a.effect === b.effect ? 0 : a.effect === 'allow' ? -1 : 1));
  }
  const what = targetOf(subject, s.what);
  return what === null ? [] : [{ effect: 'allow', who, what, can: s.can, ...extra }];
}

/** Whether Share can be pressed: somebody to share with, an address that is one, a target, a day still ahead. */
export function ready(s: SheetState, subject: Subject, now?: number): boolean {
  if (s.with === null) return false;
  if (s.with.kind === 'email' && !isEmail(s.with.email)) return false;
  if (s.until.kind === 'day' && !/^\d{4}-\d{2}-\d{2}$/u.test(s.until.day)) return false;
  if (s.until.kind === 'day' && now !== undefined && s.until.day <= recordToday(now)) return false;
  const t = templateOf(s.template);
  if (t) return rowsOf(t, fillsOf(s, subject)) !== null;
  return targetOf(subject, s.what) !== null;
}

/** A person, a group or an address as a sentence names them. */
export function whoSaid(w: With): string {
  return w.kind === 'email' ? w.email.trim().toLowerCase() : w.name;
}

/**
 * Names, never ids, as the record's `namesOf` gives them (`packages/record/src/methods/sharing.ts`): a list by its name
 * in lower case, a row as "Task 42", the project by its title.
 */
export function namesFor(s: SheetState, subject: Subject, decls: Decls): ShareNames {
  const w = s.with;
  return {
    person: (id) => (w?.kind === 'person' && w.id === id ? w.name : undefined),
    group: (id) => (w?.kind === 'group' && w.id === id ? { name: w.name, people: w.people } : undefined),
    list: (id) => decls[id]?.name.toLowerCase(),
    project: (id) =>
      (subject.kind === 'project' && subject.id === id) || (subject.kind === 'held' && 'project' in subject.target && subject.target.project === id) ? subject.name : undefined,
    row: (list, id) => {
      if (subject.kind === 'held' && 'rows' in subject.target && subject.target.rows.includes(id)) return subject.name;
      if (subject.kind !== 'row' || subject.id !== id) return undefined;
      const name = decls[list]?.name;
      return name ? `${name.replace(/s$/iu, '')} ${subject.seq}` : subject.name;
    },
  };
}

/** The sentence the sheet's shares are said in, before the record has said it. */
export function sentenceOf(shares: readonly Share[], s: SheetState, subject: Subject, now: number, decls: Decls): string {
  return shares.length === 0 ? '' : shareSentenceOf(shares.length === 1 ? shares[0]! : shares, namesFor(s, subject, decls), { now });
}

/** "a", "a and b", "a, b and c". */
const joined = (xs: readonly string[]): string => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/** The money a share shows, as `sharePreview` answers it (`SharePreview.money` in the record's `sharing.ts`). */
export type MoneyShown = { lists: readonly string[]; hidden: boolean; figures: readonly { label: string; said: string | null }[] } | null;

/**
 * WHAT THEY WILL SEE, MONEY INCLUDED, SAID PLAINLY (the owner's call of 21 October): "Priya will see Kiln's tasks,
 * notes and money: £18,400 earned in a year." From `sharePreview`'s counts and money: each list it reaches rows of now
 * by name (a project's own row is the project, not a list in it), then money with the project's own figures, or
 * "amounts included", or "with amounts hidden", and why when it is hidden because they are outside his team. A figure
 * that reads nothing is said as "nothing still to come in". `drawn` writes the record's "GBP 18,400.00" as the screen
 * draws money. `null` for a share of named rows.
 */
export function seenSaid(
  w: With,
  subject: Subject,
  lists: readonly { list: string; name: string; rows: number }[],
  money: MoneyShown,
  hide: SheetState['hide'],
  drawn: (said: string) => string = (x) => x,
): string | null {
  if (subject.kind === 'row' || (subject.kind === 'held' && 'rows' in subject.target)) return null;
  const who = whoSaid(w);
  const own = subject.kind === 'project' ? subject.register : null;
  const named = lists.filter((l) => l.rows > 0 && l.list !== own).map((l) => l.name.toLowerCase());
  if (named.length === 0 && money === null) return copy.shareSeesNone(who);
  const of = subject.kind === 'project' ? `${subject.name}'s ` : '';
  const said = (xs: readonly string[]): string => (xs.length > 0 ? `${of}${joined(xs)}` : subject.kind === 'project' ? subject.name : copy.shareSeenWhat);
  if (money === null) return copy.shareSeen(who, said(named));
  if (money.hidden) return hide.amounts && hide.chosen !== true && !onTeam(w) ? copy.shareSeenHiddenOutside(who, said(named)) : copy.shareSeenHidden(who, said(named));
  const things = said([...named, copy.shareSeenMoney]);
  if (money.figures.length === 0) return copy.shareSeenAmounts(who, things);
  return copy.shareSeenFigures(who, things, joined(money.figures.map((f) => (f.said === null ? copy.shareSeenNothing(f.label.toLowerCase()) : `${drawn(f.said)} ${f.label.toLowerCase()}`))));
}

/**
 * How much they will see now, from `sharePreview`'s counts: "Priya will see 14 tasks now, and new ones as they're
 * added." One of a list is said by the list's own word for one. `null` for a share of named rows, which gains no more.
 */
export function countSaid(w: With, subject: Subject, lists: readonly { list: string; name: string; rows: number }[], decls: Decls): string | null {
  if (subject.kind === 'row' || (subject.kind === 'held' && 'rows' in subject.target)) return null;
  const who = whoSaid(w);
  /* A PROJECT'S OWN ROW comes with it, and is not one of the things in it. */
  const held = lists.filter((l) => l.rows > 0 && !(subject.kind === 'project' && l.list === subject.register));
  if (held.length === 0) return copy.shareSeesNone(who);
  const things = held.map((l) => `${l.rows} ${l.rows === 1 ? (decls[l.list]?.one ?? l.name.toLowerCase()) : l.name.toLowerCase()}`);
  return copy.shareWillSee(who, joined(things));
}

/** A share the record keeps, as far as the sheet changes one: `SharingRow` in `sharing.ts`, read structurally. */
export type KeptShare = {
  who: { kind: string; id: string };
  who_name: string | null;
  can: ShareRung;
  caps: { readonly agents?: boolean; readonly delete?: boolean } | null;
  hide: unknown;
  when: { until?: string; hours?: unknown; once?: true } | null;
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * The sheet as it opens on a share kept, to change it: who it is with stays as it is, and Can, Hide, Until and More say
 * what the share holds. A group's size is filled in once the sheet has read the groups.
 */
export function stateOfShare(k: KeptShare, subject: Subject): SheetState {
  const name = k.who_name ?? k.who.id;
  const w: With | null =
    k.who.kind === 'person'
      ? { kind: 'person', id: k.who.id, name }
      : k.who.kind === 'group'
        ? { kind: 'group', id: k.who.id, name, people: 0 }
        : k.who.kind === 'email'
          ? { kind: 'email', email: k.who.id }
          : null;
  const hide = k.hide;
  const amounts = isObj(hide) && Array.isArray(hide['types']) && hide['types'].includes('money');
  const fields: Record<string, string[]> = {};
  if (isObj(hide) && !('types' in hide)) for (const [l, fs] of Object.entries(hide)) if (Array.isArray(fs)) fields[l] = fs.filter((f): f is string => typeof f === 'string');
  const until = k.when?.until;
  return {
    ...startOf(subject),
    with: w,
    can: k.can,
    hide: { amounts, fields, chosen: true },
    until: typeof until === 'string' && /^\d{4}-\d{2}-\d{2}/u.test(until) ? { kind: 'day', day: until.slice(0, 10) } : { kind: 'none' },
    weekdays: k.when?.hours !== undefined,
    once: k.when?.once === true,
    withAgents: k.caps?.agents !== false,
    remove: k.caps?.delete !== false,
  };
}

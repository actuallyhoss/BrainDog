/**
 * Who a list of people is, read from what the list declares: who is with which organisation, when each was last in
 * touch, where each was seen, and what each is known by.
 *
 * BY THE ROLE THE LIST DECLARES AND NEVER BY ITS NAME. A list that says `meets:` is the people `meet` writes, and the
 * parts of that key name its fields (`packages/kernel/src/roles.ts`): `org` the organisation a person is with, `in_touch`
 * the last day they were heard from, `met` the dated lines saying where, `keys` and `handles` what they are known by,
 * `self` the person whose record it is. A list that says `org:` is the organisations. Any record that declares them
 * gets what follows, whoever it belongs to, and a list that declares neither draws as it always did.
 *
 * TWO SCREENS READ IT. The list groups its people by organisation, the group placed where its most recent person is and
 * folded below them, so twenty-four colleagues of one company read as one line and not as twenty-four; a row's page
 * says who a person is and where they were seen, in names and never in ids.
 *
 * A THIRD READS IT NOW: a page's `cards` block that answers `group:` and `fold:` draws its rows in the same groups
 * (`groupCards`), so People on a page reads as the list does. It lives beside the record's other readers for that
 * reason; `routes/r/[register]/folk.ts` hands it on to the two screens that read it first.
 *
 * OUT OF THE COMPONENTS so `node --test` can run it, which is why its imports are relative and type-only.
 */

import { bankCode } from 'braindog-render';
import type { Entry, Fields, RegisterDecl } from './schema.ts';

/* ── the roles a list declares ──────────────────────────────────────────── */

/** The parts of `meets:` a page reads, each naming the field that plays it. Only `name` is always there. */
export type Meets = {
  name: string;
  email?: string;
  keys?: string;
  handles?: string;
  org?: string;
  projects?: string;
  met?: string;
  merged_into?: string;
  in_touch?: string;
  self?: string;
  aliases?: string;
};

/** The parts of `org:`, the organisations' role. */
export type OrgRole = { name: string; keys?: string; kind?: string; domain?: string; merged_into?: string; met?: string; projects?: string; retired?: string };

const MEETS_PARTS = ['email', 'keys', 'handles', 'org', 'projects', 'met', 'merged_into', 'in_touch', 'self', 'aliases'] as const;
const ORG_PARTS = ['keys', 'kind', 'domain', 'merged_into', 'met', 'projects', 'retired'] as const;

/* A DECLARATION THE RECORD HANDED BACK KEEPS EVERY KEY IT CARRIED (`declOf` spreads it), so the role is read off it as
   it came; `RegisterDecl` names only the keys every screen reads. */
type Declared = RegisterDecl & { meets?: unknown; org?: unknown };

/** Each part whose field the list really has, live: a part naming a field it lacks or retired is no part at all. */
function partsOf<K extends string>(decl: RegisterDecl, said: unknown, parts: readonly K[]): Partial<Record<K, string>> & { name?: string } {
  if (said === null || typeof said !== 'object' || Array.isArray(said)) return {};
  const live = new Set(decl.fields.filter((f) => !f.retired).map((f) => f.id));
  const out: Record<string, string> = {};
  for (const part of ['name', ...parts]) {
    const field = (said as Record<string, unknown>)[part];
    if (typeof field === 'string' && live.has(field)) out[part] = field;
  }
  return out as Partial<Record<K, string>> & { name?: string };
}

/**
 * THE LIST'S PEOPLE ROLE, or `null` for a list that is not the people `meet` writes. A list that declares `meets:` with
 * no name part still titles its rows, so the title stands in for it.
 */
export function meetsOf(decl: RegisterDecl | undefined): Meets | null {
  const said = (decl as Declared | undefined)?.meets;
  if (!decl || said === undefined) return null;
  const parts = partsOf(decl, said, MEETS_PARTS);
  return { ...parts, name: parts.name ?? decl.title };
}

/** The list's organisations role, or `null`. */
export function orgRoleOf(decl: RegisterDecl | undefined): OrgRole | null {
  const said = (decl as Declared | undefined)?.org;
  if (!decl || said === undefined) return null;
  const parts = partsOf(decl, said, ORG_PARTS);
  return { ...parts, name: parts.name ?? decl.title };
}

/**
 * THE FIELD A LIST OF PEOPLE IS GROUPED BY, and the list it points at: the `org` part, when it is a link to one row.
 * A list of people with no organisation part is never grouped, and nor is any other list.
 */
export function orgFieldOf(decl: RegisterDecl | undefined): { field: string; to: string } | null {
  const org = meetsOf(decl)?.org;
  const f = org ? decl?.fields.find((x) => x.id === org) : undefined;
  return f && f.type === 'ref' && f.to ? { field: f.id, to: f.to } : null;
}

/**
 * THE FIELD THAT SAYS WHAT A PERSON IS TO YOU ("Contractor", "Client"): the first of the list's own card fields
 * (`mobile:`) after the name that is a word, which is how the list already says what to show beside a name. Never the
 * organisation or the address, which are said in their own places.
 */
export function roleFieldOf(decl: RegisterDecl | undefined): string | null {
  const m = meetsOf(decl);
  if (!m || !decl) return null;
  const skip = new Set([decl.title, m.name, m.org, m.email].filter((x): x is string => Boolean(x)));
  for (const id of decl.mobile ?? []) {
    if (skip.has(id)) continue;
    const f = decl.fields.find((x) => x.id === id);
    if (f && !f.retired && (f.type === 'enum' || f.type === 'text')) return id;
  }
  return null;
}

/* ── when somebody was last in touch ────────────────────────────────────── */

const DAY = /^\d{4}-\d{2}-\d{2}/u;
const DAY_MS = 86_400_000;

/** A `met` line as `meet` writes it: `2026-08-27 · commit 8b1e4d0 in portage`. */
const MET_LINE = /^(\d{4}-\d{2}-\d{2})\s*·\s*(.*)$/u;

const textsOf = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : []);

/**
 * THE LAST DAY A PERSON WAS IN TOUCH: their Last in touch, or failing that the newest day among the lines saying where
 * they were met, since a person `meet` wrote before Last in touch existed has the lines and not the day. `null` is never.
 */
export function lastDayOf(fields: Fields, meets: Meets): string | null {
  let best: string | null = null;
  const take = (v: unknown) => {
    if (typeof v !== 'string' || !DAY.test(v)) return;
    const d = v.slice(0, 10);
    if (best === null || d > best) best = d;
  };
  if (meets.in_touch) take(fields[meets.in_touch]);
  if (meets.met) for (const line of textsOf(fields[meets.met])) take(MET_LINE.exec(line)?.[1]);
  return best;
}

/** Calendar days from a stored day to the reader's day, both `YYYY-MM-DD`. */
const daysSince = (day: string, today: string): number => Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / DAY_MS);

/** How long ago, in the four bands the list is headed by. */
export type Band = 'week' | 'month' | 'earlier' | 'never';

export function bandOf(day: string | null, today: string): Band {
  if (day === null) return 'never';
  const n = daysSince(day, today);
  return n <= 7 ? 'week' : n <= 30 ? 'month' : 'earlier';
}

/* ── the list, grouped by organisation ──────────────────────────────────── */

/** One person on the list. */
export type Member = { entry: Entry; day: string | null; self: boolean };

/**
 * ONE LINE OF THE LIST: a person, or an organisation and its people, newest first. An organisation is a group only once
 * it has two people here; with one, that person is a line of their own that names where they work.
 */
export type Item =
  | { kind: 'person'; key: string; member: Member; org: number | null }
  | { kind: 'org'; key: string; org: number; members: Member[]; day: string | null };

export type Banded = { band: Band; items: Item[] };

/** Past this many people a group shows its most recent and folds the rest under them. */
export const FOLD_OVER = 3;

/** Whether a group of this many is folded below its most recent person. */
export const folds = (n: number): boolean => n > FOLD_OVER;

const newer = (a: Member, b: Member): number => {
  if (a.day !== b.day) return a.day === null ? 1 : b.day === null ? -1 : a.day < b.day ? 1 : -1;
  return b.entry.seq - a.entry.seq;
};

const orgOf = (fields: Fields, field: string | undefined): number | null => {
  const v = field ? fields[field] : null;
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d+$/u.test(v) ? Number(v) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
};

/**
 * THE LIST AS IT IS READ: the people most recently in touch first, each organisation folded into one line where its most
 * recent person stands, under the four bands of how long ago. A person folded into another by a merge is left out, since
 * the person they were folded into is already here.
 */
export function foldPeople(entries: readonly Entry[], decl: RegisterDecl | undefined, today: string): Banded[] {
  const meets = meetsOf(decl);
  if (!meets) return [];
  const org = orgFieldOf(decl)?.field;
  const members: Member[] = [];
  for (const e of entries) {
    if (mergedAway(e.fields, decl)) continue;
    members.push({ entry: e, day: lastDayOf(e.fields, meets), self: meets.self ? e.fields[meets.self] === true : false });
  }
  members.sort(newer);

  const byOrg = new Map<number, Member[]>();
  for (const m of members) {
    const o = orgOf(m.entry.fields, org);
    if (o !== null) byOrg.set(o, [...(byOrg.get(o) ?? []), m]);
  }

  const items: Item[] = [];
  const placed = new Set<number>();
  for (const m of members) {
    const o = orgOf(m.entry.fields, org);
    const group = o === null ? undefined : byOrg.get(o);
    if (o !== null && group && group.length > 1) {
      if (placed.has(o)) continue;
      placed.add(o);
      items.push({ kind: 'org', key: `o${o}`, org: o, members: group, day: group[0]!.day });
    } else {
      items.push({ kind: 'person', key: `p${m.entry.seq}`, member: m, org: o });
    }
  }

  const bands: Banded[] = [];
  for (const item of items) {
    const band = bandOf(item.kind === 'org' ? item.day : item.member.day, today);
    const last = bands.at(-1);
    if (last?.band === band) last.items.push(item);
    else bands.push({ band, items: [item] });
  }
  return bands;
}

/* ── the list of people, A to Z ─────────────────────────────────────────── */

/** One letter of the list and the people under it. */
export type Lettered = { letter: string; members: Member[] };

/**
 * THE PEOPLE BY THE FIRST LETTER OF THEIR NAME, for finding somebody you know by name rather than by when you last spoke.
 * A name that starts with no letter (a digit, a mark) is under "#", last. Folded-away people are left out, as above.
 */
export function letterPeople(entries: readonly Entry[], decl: RegisterDecl | undefined): Lettered[] {
  const meets = meetsOf(decl);
  if (!meets || !decl) return [];
  const nameOf = (e: Entry): string => String(e.fields[meets.name] ?? e.fields[decl.title] ?? '').trim();
  const members: Member[] = entries
    .filter((e) => !mergedAway(e.fields, decl))
    .map((e) => ({ entry: e, day: lastDayOf(e.fields, meets), self: meets.self ? e.fields[meets.self] === true : false }))
    .sort((a, b) => nameOf(a.entry).localeCompare(nameOf(b.entry), undefined, { sensitivity: 'base' }));
  const out: Lettered[] = [];
  for (const m of members) {
    const first = nameOf(m.entry).charAt(0).toLocaleUpperCase();
    const letter = /\p{L}/u.test(first) ? first : '#';
    const last = out.find((g) => g.letter === letter);
    if (last) last.members.push(m);
    else out.push({ letter, members: [m] });
  }
  return out.sort((a, b) => (a.letter === '#' ? 1 : b.letter === '#' ? -1 : a.letter.localeCompare(b.letter)));
}

/* ── the list of organisations, by kind ─────────────────────────────────── */

/**
 * AN ORGANISATION'S NAME AS IT IS SHOWN: a bank's code is never a name (Q15), so one a card text named by the end of an
 * account ("0140") reads "Account ending 0140", and a government code "Government payment". The row keeps its name.
 */
export const orgNameSaid = (name: string): string => bankCode(name) ?? name;

/** The counts the organisations list's line says: the ones with a kind, and the shops a card text named. */
export function orgsCounted(groups: readonly OrgGroup[]): { known: number; shops: number } {
  let known = 0;
  let shops = 0;
  for (const g of groups) {
    if (g.kind !== null) known += g.items.length;
    else if (g.rest === 'texts' || g.rest === 'unsorted') shops += g.items.length;
  }
  return { known, shops };
}

/** One group of the organisations list: a kind ("Vendors"), the shops a card text named, or the ones put away. */
export type OrgItem = { entry: Entry; day: string | null };
export type OrgGroup = { key: string; kind: string | null; rest: 'texts' | 'unsorted' | 'away' | null; items: OrgItem[] };

/**
 * THE ORGANISATIONS AS THEY ARE READ (29 October): by what kind each is, in the order the list declares its kinds, each
 * A to Z; then the ones a card text named with no kind yet, which `rule.meet-payees` writes and which are shops nearly
 * always; then any other with no kind; then the ones folded into another or retired, kept and said last so the list
 * still counts every row it holds. Every row is somewhere, so the groups add up to the list's own count.
 */
export function foldOrgs(entries: readonly Entry[], decl: RegisterDecl | undefined): OrgGroup[] {
  const role = orgRoleOf(decl);
  if (!role || !decl) return [];
  const kinds: readonly string[] = (role.kind ? decl.fields.find((f) => f.id === role.kind)?.values : undefined) ?? [];
  const nameOf = (e: Entry): string => String(e.fields[role.name] ?? e.fields[decl.title] ?? '').trim();
  const dayOf = (e: Entry): string | null => {
    let best: string | null = null;
    for (const line of role.met ? textsOf(e.fields[role.met]) : []) {
      const d = MET_LINE.exec(line)?.[1];
      if (d && (best === null || d > best)) best = d;
    }
    return best;
  };
  const filled = (v: unknown): boolean => v !== null && v !== undefined && v !== '' && v !== false;
  const groups = new Map<string, OrgGroup>();
  const put = (key: string, kind: string | null, rest: OrgGroup['rest'], e: Entry): void => {
    const g = groups.get(key) ?? { key, kind, rest, items: [] };
    g.items.push({ entry: e, day: dayOf(e) });
    groups.set(key, g);
  };
  for (const e of entries) {
    const f = e.fields;
    const kind = role.kind ? f[role.kind] : undefined;
    if ((role.merged_into && filled(f[role.merged_into])) || (role.retired && filled(f[role.retired]))) put('away', null, 'away', e);
    else if (typeof kind === 'string' && kind !== '') put(`k:${kind}`, kind, null, e);
    else if (role.keys && textsOf(f[role.keys]).some((k) => k.startsWith('bank:'))) put('texts', null, 'texts', e);
    else put('unsorted', null, 'unsorted', e);
  }
  const rank = (g: OrgGroup): number => {
    if (g.rest === 'texts') return 1000;
    if (g.rest === 'unsorted') return 1001;
    if (g.rest === 'away') return 1002;
    const i = kinds.indexOf(g.kind ?? '');
    return i === -1 ? 999 : i;
  };
  const out = [...groups.values()].sort((a, b) => rank(a) - rank(b));
  for (const g of out) g.items.sort((a, b) => nameOf(a.entry).localeCompare(nameOf(b.entry), undefined, { sensitivity: 'base' }));
  return out;
}

/* ── a page's cards, grouped by what they point at ─────────────────────── */

/** What one card is grouped under: the row its `group:` field points at, by its number when it has one, and its name. */
export type GroupKey = { key: string; name: string; ref: number | null };

/**
 * ONE RUN OF A GROUPED CARD BLOCK, in the order the record answered its rows: cards with no group of their own, or a
 * group headed by what its cards point at. Each names its cards by their place in the block's rows. A group's `rows`
 * are the cards it shows, `total` how many it has here, and the rest are folded below them.
 */
export type CardRun = { kind: 'loose'; rows: number[] } | { kind: 'group'; key: string; name: string; ref: number | null; rows: number[]; total: number };

/**
 * HOW MANY OF A GROUP OF `n` A FOLD SHOWS: `true` the most recent one once there are more than `FOLD_OVER`, as the list's
 * groups fold, and a number that many once there are more. `false` shows them all.
 */
export function foldedTo(n: number, fold: boolean | number): number {
  if (fold === true) return folds(n) ? 1 : n;
  if (typeof fold === 'number' && Number.isInteger(fold) && fold > 0) return n > fold ? fold : n;
  return n;
}

/**
 * A CARD BLOCK'S ROWS IN GROUPS, the way the list of people is grouped (`foldPeople`), from what the record answered.
 *
 * THE RECORD'S ORDER IS KEPT, so a block ordered by the last day in touch reads the most recent first, and a group stands
 * where its first card stood, its most recent, with the rest of its cards under it. A group is a group only once it has
 * two cards here; with one, that card stays where it was, among the cards around it, which are one run and not one each.
 * `single` makes a group of one card a group too, for a block grouped by a kind of row (an account's Bank, Cash, Card).
 * `keys[i]` is what card `i` is grouped under, or `null` for none; a card in `gone` is not drawn at all.
 *
 * A GROUP IS FOLDED ONLY WHERE ITS REST HAS SOMEWHERE TO OPEN: one that points at a row, whose page lists them all. A
 * group named by words alone shows every card, since folding them would hide people nobody could then reach.
 */
export function groupCards(keys: readonly (GroupKey | null)[], fold: boolean | number, gone: ReadonlySet<number> = new Set(), single = false): CardRun[] {
  const byKey = new Map<string, number[]>();
  keys.forEach((k, i) => {
    if (k && !gone.has(i)) byKey.set(k.key, [...(byKey.get(k.key) ?? []), i]);
  });
  const runs: CardRun[] = [];
  const placed = new Set<string>();
  keys.forEach((k, i) => {
    if (gone.has(i)) return;
    const group = k ? byKey.get(k.key) : undefined;
    if (k && group && (group.length > 1 || single)) {
      if (placed.has(k.key)) return;
      placed.add(k.key);
      const shown = k.ref === null ? group.length : foldedTo(group.length, fold);
      runs.push({ kind: 'group', key: k.key, name: k.name, ref: k.ref, rows: group.slice(0, shown), total: group.length });
      return;
    }
    const last = runs.at(-1);
    if (last?.kind === 'loose') last.rows.push(i);
    else runs.push({ kind: 'loose', rows: [i] });
  });
  return runs;
}

/** The field a list of people or of organisations says who a row was merged into, or `null` for a list that says none. */
export const mergedFieldOf = (decl: RegisterDecl | undefined): string | null => meetsOf(decl)?.merged_into ?? orgRoleOf(decl)?.merged_into ?? null;

/** Whether a row was folded into another by a merge: its list declares who it was merged into, and it names someone. */
export function mergedAway(fields: Fields, decl: RegisterDecl | undefined): boolean {
  const field = mergedFieldOf(decl);
  const v = field ? fields[field] : undefined;
  return v !== null && v !== undefined && v !== '';
}

/* ── where a person was seen ────────────────────────────────────────────── */

/** One place a person was seen, with how often and when last: "Commits in portage", twice, last on 2 Sep. */
export type Seen = { where: string; kind: 'commit' | 'mail' | 'other'; times: number; last: string | null; about: string[] };

/* AN ID IS NOT A WORD: a commit's hash, a ULID, a spoken row id. Each is taken out of the words a person reads. A hash
   holds a digit and a letter both, so a word spelt in a to f ("defaced") and a plain number ("Invoice 20261001") stay. */
const IDS = [/\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}\b/giu, /\b[0-9A-HJKMNP-TV-Z]{26}\b/gu, /\b[a-z][a-z0-9_]*#\d+\b/giu];

/* AN ADDRESS IS NOT A WORD EITHER (names, never addresses): a mail address, bare, in angle brackets or
   behind `mailto:`, is taken out of a bank text's or an import's line as surely as out of a mail's subject. */
const ADDRESS = /(?:mailto:)?<?[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+>?/giu;

/* BRACKETS LEFT HOLDING NOTHING once what was in them is out, "Jo ()", go too. Only those: a subject's own `foo()` stays. */
const BRACKETED = /\(([^()]*)\)|\[([^[\]]*)\]|<([^<>]*)>/gu;

/* A WORD LEFT POINTING AT NOTHING once its id is out, "asked about in", goes with it. */
const DANGLING = /\s+(?:in|on|at|about|for|to|of|from|with|by)$/iu;

/* A HANDLE IN "KNOWN BY" KEEPS ITS ADDRESS (`mastodon:jo@social.example` is how Jo is known there); words lose both. */
const WORDLESS = [ADDRESS, ...IDS];

const plain = (s: string, out: readonly RegExp[] = WORDLESS): string => {
  const strip = (x: string) => out.reduce((y, re) => y.replace(re, ''), x);
  let t = strip(s.replace(BRACKETED, (all, ...held: (string | undefined)[]) => {
    const inner = held.slice(0, 3).find((h) => h !== undefined) ?? '';
    return inner.trim() !== '' && strip(inner).trim() === '' ? '' : all;
  }))
    .replace(/\s{2,}/gu, ' ')
    .replace(/\s+([,.;:])/gu, '$1')
    .trim();
  while (DANGLING.test(t)) t = t.replace(DANGLING, '');
  return t;
};

/** A repository as a person names it: its last part, never the host or the path it lives at. */
const repoOf = (s: string): string => s.replace(/\.git$/u, '').split(/[/:]/u).filter(Boolean).at(-1) ?? s;

/**
 * Where one `met` line says the person was, and what about: a commit names its repository, a mail its subject.
 * Anything else (a bank text, an import, a note) is its own words, with any id or address taken out.
 */
function placeOf(said: string): { where: string; kind: Seen['kind']; about: string | null } | null {
  const commit = /^commits?\b.*?\bin\s+(\S+)\s*$/iu.exec(said);
  if (commit) return { where: seenWords.commits(repoOf(commit[1]!)), kind: 'commit', about: null };
  const mail = /^(?:mail|email)\s*(?::|from\b)\s*(.*)$/iu.exec(said);
  if (mail) return { where: seenWords.mail, kind: 'mail', about: plain(mail[1]!) || null };
  const words = plain(said);
  /* A BANK TEXT FILED IT: said as what happened, "Filed from a bank text", never "Seen in · Bank text". */
  if (/^bank (?:texts?|sms|messages?)$/iu.test(words)) return { where: seenWords.filedFromText, kind: 'other', about: null };
  return words ? { where: words.charAt(0).toUpperCase() + words.slice(1), kind: 'other', about: null } : null;
}

/**
 * THE `met` LINES AS PLACES, newest first: each place once, with how many times and the last day. A line that is not
 * dated still counts, with no day.
 */
export function seenOf(lines: unknown): Seen[] {
  const out = new Map<string, Seen>();
  for (const line of textsOf(lines)) {
    const m = MET_LINE.exec(line.trim());
    const place = placeOf(m ? m[2]! : line.trim());
    if (!place) continue;
    const day = m ? m[1]! : null;
    const seen = out.get(place.where) ?? { where: place.where, kind: place.kind, times: 0, last: null, about: [] };
    seen.times += 1;
    if (day !== null && (seen.last === null || day > seen.last)) seen.last = day;
    /* NEWEST FIRST: `meet` writes its lines newest last. */
    if (place.about && !seen.about.includes(place.about)) seen.about.unshift(place.about);
    out.set(place.where, seen);
  }
  return [...out.values()].sort((a, b) => (a.last === b.last ? b.times - a.times : a.last === null ? 1 : b.last === null ? -1 : a.last < b.last ? 1 : -1));
}

/* ── what a person or an organisation is known by ───────────────────────── */

/** One way somebody is known: "Email" and the address, "GitHub" and the login. */
export type Known = { label: string; value: string };

/* THE KINDS OF KEY `packages/kernel/src/identity-keys.ts` WRITES (`kind:value`), as a person says each. A remote is a
   repository by its name and a folder by its own, never the host or the path; a key of a kind nobody named here is said
   by its kind with a capital. */
const KEY_LABELS: Readonly<Record<string, string>> = {
  email: 'Email',
  github: 'GitHub',
  bank: 'Bank texts call it',
  folder: 'Folder',
  git: 'Git',
  gitlab: 'GitLab',
  slack: 'Slack',
  discord: 'Discord',
  x: 'X',
  twitter: 'X',
  linkedin: 'LinkedIn',
  phone: 'Phone',
  domain: 'Website',
  payee: 'Bank texts call it',
  remote: 'Repository',
};

/** A key as a person reads it, or `null` for one that is nothing but an id. */
export function keySaid(key: string): Known | null {
  const at = key.indexOf(':');
  const kind = at > 0 ? key.slice(0, at).toLowerCase() : '';
  const raw = (at > 0 ? key.slice(at + 1) : key).trim();
  if (!raw) return null;
  /* A KEY OF A KIND THE KERNEL NAMES IS ALREADY ITS VALUE, and taking ids out of it would eat a phone number or a login
     that happens to look like a hash. Only a handle of some other kind is read for ids. */
  const value = kind === 'remote' || kind === 'folder' ? repoOf(raw) : Object.hasOwn(KEY_LABELS, kind) ? raw : plain(raw, IDS);
  if (!value) return null;
  const label = Object.hasOwn(KEY_LABELS, kind) ? KEY_LABELS[kind]! : kind ? kind.charAt(0).toUpperCase() + kind.slice(1) : seenWords.handle;
  return { label, value };
}

/**
 * EVERYTHING A ROW IS KNOWN BY, each once: its email, then its keys and handles in the order they were written. The same
 * address held as the email and as a key is said once.
 */
export function knownOf(
  fields: Fields,
  parts: { email?: string | undefined; domain?: string | undefined; keys?: string | undefined; handles?: string | undefined; aliases?: string | undefined },
): Known[] {
  const out: Known[] = [];
  const seen = new Set<string>();
  const add = (k: Known | null) => {
    if (!k) return;
    const id = `${k.label}:${k.value.toLowerCase()}`;
    if (seen.has(id)) return;
    seen.add(id);
    out.push(k);
  };
  const one = (part: string | undefined, label: string) => {
    const v = part ? fields[part] : null;
    if (typeof v === 'string' && v.trim() !== '') add({ label, value: v.trim() });
  };
  one(parts.email, KEY_LABELS.email!);
  one(parts.domain, KEY_LABELS.domain!);
  for (const part of [parts.keys, parts.handles]) if (part) for (const k of textsOf(fields[part])) add(keySaid(k));
  if (parts.aliases) for (const a of textsOf(fields[parts.aliases])) add({ label: seenWords.aliases, value: a.trim() });
  return out;
}

/* ── the sentences ──────────────────────────────────────────────────────── */

/** A name a sentence says, and where it opens when it is a row the reader can go to. */
export type Named = { name: string; href?: string | undefined };

/** One run of a sentence: words, or a name that opens its row. */
export type Said = { text: string; href?: string | undefined };

/**
 * WHO A PERSON IS, in one line under their name: "Contractor at Brightwell, on Kiln and Portage." Each part only when the row
 * has it, the organisation and the projects by name and each opening its own page, and nothing at all for a row that has
 * none, so the page says its usual sentence instead.
 */
export function whoParts(p: { role: string | null; org: Named | null; projects: readonly Named[] }): Said[] | null {
  const role = p.role?.trim() || null;
  const out: Said[] = [];
  const words = (text: string) => {
    const last = out.at(-1);
    if (last && last.href === undefined) last.text += text;
    else out.push({ text });
  };
  const name = (n: Named) => out.push(n.href ? { text: n.name, href: n.href } : { text: n.name });
  if (role && p.org) {
    words(`${role} at `);
    name(p.org);
  } else if (role) words(role);
  else if (p.org) {
    words('At ');
    name(p.org);
  }
  const shown = p.projects.slice(0, 3);
  if (shown.length > 0) {
    words(out.length > 0 ? ', on ' : 'On ');
    shown.forEach((n, i) => {
      if (i > 0) words(i === shown.length - 1 && p.projects.length <= 3 ? ' and ' : ', ');
      name(n);
    });
    if (p.projects.length > 3) words(` and ${seenWords.more(p.projects.length - 3)}`);
  }
  if (out.length === 0) return null;
  words('.');
  const first = out[0]!;
  first.text = first.text.charAt(0).toUpperCase() + first.text.slice(1);
  return out;
}

/** The same line as plain words. */
export const whoSaid = (p: { role: string | null; org: string | null; projects: readonly string[] }): string | null =>
  whoParts({ role: p.role, org: p.org ? { name: p.org } : null, projects: p.projects.map((name) => ({ name })) })
    ?.map((x) => x.text)
    .join('') ?? null;

/**
 * WHAT AN ORGANISATION IS, under its name: "Client · 24 people · 3 projects". Its kind when it has one, then the counts
 * that are not nought.
 */
export function orgSaid(p: { kind: string | null; people: number; projects: number }): string | null {
  const parts = [p.kind?.trim() || null, p.people > 0 ? seenWords.people(p.people) : null, p.projects > 0 ? seenWords.projects(p.projects) : null].filter(
    (x): x is string => Boolean(x),
  );
  if (parts.length === 0) return null;
  const said = parts.join(' · ');
  return said.charAt(0).toUpperCase() + said.slice(1);
}

/** "Twice, last on 2 Sep" for a place seen more than once; the day alone for once. */
export function timesSaid(s: Pick<Seen, 'times' | 'last'>, day: (iso: string) => string): string {
  const when = s.last ? day(s.last) : null;
  if (s.times <= 1) return when ?? '';
  const times = s.times === 2 ? 'Twice' : `${s.times} times`;
  return when ? `${times}, last on ${when}` : times;
}

/** The words these two screens say about people, kept beside the functions that say them. */
export const seenWords = {
  bands: { week: 'Last 7 days', month: 'Last 30 days', earlier: 'Earlier', never: 'Not in touch yet' } satisfies Record<Band, string>,
  commits: (repo: string): string => `Commits in ${repo}`,
  mail: 'Mail',
  handle: 'Handle',
  aliases: 'Also called',
  roleAt: (role: string, org: string): string => `${role} at ${org}`,
  at: (org: string): string => `At ${org}`,
  more: (n: number): string => `${n} more`,
  people: (n: number): string => (n === 1 ? '1 person' : `${n} people`),
  lastInTouch: (day: string): string => `Last in touch ${day}.`,
  atPlace: (where: string): string => `at ${where}`,
  isYou: 'This is you.',
  projects: (n: number): string => (n === 1 ? '1 project' : `${n} projects`),
  /* The list's grouped view and its disclosure. */
  showAll: (n: number, org: string): string => `Show all ${n} people at ${org}`,
  showFewer: (org: string): string => `Show fewer at ${org}`,
  moreAt: (n: number): string => (n === 1 ? '1 more' : `${n} more`),
  fewer: 'Show fewer',
  /* A grouped card block's heading count, for a list that is not people: "3 projects". */
  count: (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`,
  /* A grouped card block's way to the rest when the block is a slice of its list, so how many it is not known here. */
  everyoneAt: (org: string): string => `Show everyone at ${org}`,
  moreIn: (name: string): string => `More in ${name}`,
  unnamedOrg: 'An organisation with no name yet',
  you: 'You',
  /* The organisations list's groups and the people list's orders. */
  kindsOf: (label: string): string => (/^other$/iu.test(label) ? 'Other' : /[^aeiou]y$/iu.test(label) ? `${label.slice(0, -1)}ies` : `${label}s`),
  fromTexts: 'Shops from card texts',
  /* THE LIST'S ONE LINE, the same words People says over it: "4 organisations you work with, 13 shops from card texts." */
  orgsSaid: (known: number, shops: number): string =>
    [
      known > 0 ? `${known} ${known === 1 ? 'organisation you work with' : 'organisations you work with'}` : '',
      shops > 0 ? `${shops} ${shops === 1 ? 'shop from card texts' : 'shops from card texts'}` : '',
    ]
      .filter(Boolean)
      .join(', ') + '.',
  /* AN ORGANISATION A BANK TEXT FILED, said on its page as a sentence and not as "Seen in · Bank text". */
  filedFromText: 'Filed from a bank text',
  /* AN ORGANISATION WITH NO KIND YET: the one press that says what it is to you. */
  setKind: 'Say what it is to you',
  noKind: 'No kind yet',
  putAway: 'Merged or retired',
  recent: 'Recent',
  az: 'A to Z',
  orderBy: 'Order people by',
  /* The person's page. */
  seenIn: 'Seen in',
  knownBy: 'Known by',
  yours: 'Your identities',
} as const;

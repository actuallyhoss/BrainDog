/**
 * PEOPLE › IMPORT: A CONTACTS FILE READ INTO PEOPLE AND THEIR ORGANISATIONS (2 Nov, a walk: a new person had no door
 * for the contacts every phone and mail app exports). A CSV from Google, Outlook, Apple or LinkedIn, or a vCard (.vcf).
 *
 * NOTHING IS WRITTEN HERE. The file is read into contacts (a name, emails, phones, an organisation), held against who
 * the BrainDog already keeps (`planOf`: anyone whose email it holds is skipped, and an organisation it holds by name is
 * the one they are with), and the page writes what is left with one press.
 *
 * THEN ONE QUESTION TIDIES WHAT THE IMPORT LEFT (`tidyOf`), as the agents' after-an-import skill does for a session: find
 * what the import wrote, put every tidy into one arrangement, and ask once for all of it, never once each.
 *
 * A plain `.ts` with relative imports, so `node` can hold it; `routes/add/contacts` draws it.
 */

import { csvCells } from '../start/export.ts';

/** One contact as the file gave it. */
export type Contact = { name: string; emails: string[]; phones: string[]; org: string };

/** Somebody the BrainDog already keeps: their entry's number, name and every email they are known by. */
export type HeldPerson = { seq: number; name: string; emails: string[] };
/** An organisation the BrainDog already keeps. */
export type HeldOrg = { seq: number; name: string; kind: string | null; domain: string | null };

/** The most contacts one file brings in one press. */
export const CONTACTS_MOST = 1000;

/** The words the page says. */
export const words = {
  title: 'Import contacts',
  kicker: 'People',
  sentence: 'Bring in the people from a contacts file. You see who will be added before anything is.',
  file: 'Your contacts file',
  drop: 'Drop a contacts file here, or choose one. A CSV or a vCard (.vcf) from your phone, Google, Outlook or LinkedIn.',
  /* THE DROP ZONE IN TWO LINES AND A BUTTON (ui-work 2 Nov): one centred sentence in a dashed box gave nothing that read
     as pressable, and a phone has nothing to drop. */
  dropHere: 'Drop a contacts file here',
  dropWhat: 'A CSV or a vCard (.vcf) from your phone, Google, Outlook or LinkedIn.',
  choose: 'Choose a file',
  notRead: 'That file could not be read as contacts. Export a CSV or a vCard (.vcf) and try that.',
  noNames: 'No names in that file. A contacts file has a name column, or a name on each card.',
  preview: 'What it will add',
  people: (n: number) => (n === 1 ? '1 person' : `${n} people`),
  orgs: (n: number) => (n === 1 ? '1 organisation' : `${n} organisations`),
  skipped: (n: number) => (n === 1 ? '1 already here, skipped' : `${n} already here, skipped`),
  unnamed: (n: number) => (n === 1 ? '1 with no name, left out' : `${n} with no name, left out`),
  already: 'Already here',
  newOrg: 'new',
  more: (n: number) => `And ${n} more.`,
  add: (people: number, orgs: number) => (orgs === 0 ? `Add ${words.people(people)}` : `Add ${words.people(people)} and ${words.orgs(orgs)}`),
  adding: (done: number, of: number) => `Adding ${done} of ${of}`,
  nothingNew: 'Everyone in this file is already here.',
  added: (people: number, orgs: number) => (orgs === 0 ? `Added ${words.people(people)}.` : `Added ${words.people(people)} and ${words.orgs(orgs)}.`),
  missed: (n: number) => (n === 1 ? '1 could not be added.' : `${n} could not be added.`),
  other: 'Choose another file',
  again: 'Import another file',
  back: 'Back to People',
  columns: { name: 'Name', email: 'Email', phone: 'Phone', org: 'Organisation' },
  /* THE ONE TIDY QUESTION. */
  tidyAsk: 'Tidy what the import left?',
  tidyYes: 'Yes, tidy it',
  tidyNo: 'Not now',
  tidied: 'Tidied.',
  tidyLeft: 'Left as it is. You can change any of them on their page.',
  capitals: (names: readonly string[]) => `Write ${listed(names)} with capitals`,
  websites: (n: number) => (n === 1 ? 'Give 1 new organisation its website, from their emails' : `Give ${n} new organisations their websites, from their emails`),
  clients: (names: readonly string[]) => `Mark ${listed(names)} as ${names.length === 1 ? 'a client' : 'clients'}, like the ones you have`,
};

/** "A", "A and B", "A, B and C", "A, B and 3 more". */
export function listed(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length <= 3) return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
  return `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const clean = (s: string | undefined): string => (s ?? '').replace(/\s+/gu, ' ').trim();
const lower = (s: string): string => s.toLowerCase();

/* ── a vCard ───────────────────────────────────────────────────────────── */

/** A vCard's value, unescaped: `\,` `\;` `\n` as written. */
const unescape = (v: string): string => v.replace(/\\n/giu, ' ').replace(/\\([,;\\])/gu, '$1');

function readVcards(text: string): Contact[] {
  /* LINES FOLDED BY A SPACE OR A TAB ARE ONE LINE. */
  const lines = text.replace(/\r\n?/gu, '\n').replace(/\n[ \t]/gu, '').split('\n');
  const out: Contact[] = [];
  let card: Contact | null = null;
  let n = '';
  for (const line of lines) {
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const head = line.slice(0, colon);
    const value = line.slice(colon + 1);
    const prop = lower(head.split(';')[0]!.split('.').pop() ?? '');
    if (prop === 'begin' && lower(value.trim()) === 'vcard') {
      card = { name: '', emails: [], phones: [], org: '' };
      n = '';
    } else if (card === null) continue;
    else if (prop === 'end') {
      if (card.name === '' && n !== '') card.name = n;
      out.push(card);
      card = null;
    } else if (prop === 'fn') card.name = clean(unescape(value));
    else if (prop === 'n') {
      const [family = '', given = '', middle = ''] = value.split(';').map((x) => clean(unescape(x)));
      n = clean([given, middle, family].join(' '));
    } else if (prop === 'email') {
      const e = clean(value);
      if (EMAIL.test(e)) card.emails.push(e);
    } else if (prop === 'tel') {
      const t = clean(value.replace(/^tel:/iu, ''));
      if (t !== '') card.phones.push(t);
    } else if (prop === 'org') card.org = clean(unescape(value.split(';')[0] ?? ''));
  }
  return out;
}

/* ── a CSV ─────────────────────────────────────────────────────────────── */

/** A column's header, as the apps that export contacts write it, read to what it holds. */
function roleOf(header: string): 'name' | 'first' | 'middle' | 'last' | 'email' | 'phone' | 'org' | null {
  const h = lower(header).replace(/[^a-z0-9]+/gu, ' ').trim();
  if (/^(?:name|full name|display name|contact|contact name)$/u.test(h)) return 'name';
  if (/^(?:first name|given name|first)$/u.test(h)) return 'first';
  if (/^(?:middle name|additional name)$/u.test(h)) return 'middle';
  if (/^(?:last name|family name|surname|last)$/u.test(h)) return 'last';
  if (/\be ?mail\b/u.test(h) && !/\b(?:type|label)\b/u.test(h)) return 'email';
  if (/\b(?:phone|mobile|tel|telephone|cell)\b/u.test(h) && !/\b(?:type|label)\b/u.test(h)) return 'phone';
  if (/^(?:company|organi[sz]ation|organi[sz]ation name|organi[sz]ation 1 name|org|employer|business|company name)$/u.test(h)) return 'org';
  return null;
}

function readCsv(text: string): Contact[] | null {
  const cells = csvCells(text);
  if (cells.length < 2) return null;
  const roles = cells[0]!.map(roleOf);
  if (!roles.some((r) => r === 'name' || r === 'first' || r === 'last')) return null;
  const out: Contact[] = [];
  for (const row of cells.slice(1)) {
    const of = (r: string): string[] => roles.flatMap((x, i) => (x === r ? [clean(row[i])] : [])).filter((v) => v !== '');
    const name = of('name')[0] ?? clean([...of('first'), ...of('middle'), ...of('last')].join(' '));
    /* A CELL MAY HOLD SEVERAL, as Google writes them: "a@x.com ::: b@y.com". */
    const many = (vs: string[]): string[] => vs.flatMap((v) => v.split(/\s*:::\s*|\s*;\s*/u)).map(clean).filter((v) => v !== '');
    out.push({ name, emails: many(of('email')).filter((e) => EMAIL.test(e)), phones: many(of('phone')), org: of('org')[0] ?? '' });
  }
  return out;
}

/** A contacts file read into contacts, or why it could not be. A vCard by its first line, else a CSV. */
export function readContacts(file: string, text: string): { contacts: Contact[]; unnamed: number } | { why: string } {
  const body = text.replace(/^﻿/u, '');
  const vcard = /\.vcf$/iu.test(file) || /^\s*BEGIN:VCARD/iu.test(body);
  const all = vcard ? readVcards(body) : readCsv(body);
  if (all === null) return { why: words.notRead };
  /* A CONTACT WITH NO NAME IS NAMED BY ITS EMAIL'S FIRST PART where it has one, else left out. */
  const named = all.map((c) => (c.name !== '' ? c : { ...c, name: c.emails[0]?.split('@')[0] ?? '' }));
  const contacts = named.filter((c) => c.name !== '').slice(0, CONTACTS_MOST);
  if (contacts.length === 0) return { why: words.noNames };
  return { contacts, unnamed: named.length - named.filter((c) => c.name !== '').length };
}

/* ── what it will add ──────────────────────────────────────────────────── */

/** One organisation as the file names it, read without case, its company words or its punctuation. */
export const orgKey = (name: string): string =>
  lower(name)
    .replace(/\b(?:ltd|limited|inc|incorporated|llc|plc|gmbh|co|company|corp|corporation)\b\.?/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, '');

/** What one press adds: the people new to this BrainDog, the organisations new to it, and who is already here. */
export type Plan = {
  people: (Contact & { orgKey: string })[];
  /** The organisations the new people are with that the BrainDog does not keep yet, by the name the file first gives. */
  orgs: { key: string; name: string; domain: string | null }[];
  /** The organisations the new people are with that it keeps, by key. */
  heldOrgs: Map<string, HeldOrg>;
  /** Contacts skipped: somebody here already has one of their emails, or the file had them twice. */
  skipped: Contact[];
};

/** The email domains that are a mail service, never an organisation's website. */
const FREE_MAIL = /^(?:gmail|googlemail|outlook|hotmail|live|msn|yahoo|ymail|icloud|me|mac|aol|proton|protonmail|pm|gmx|mail|yandex|zoho|fastmail|hey)\./u;

/** The website an organisation's people's emails share, where they share one and it is no mail service. */
function domainOf(emails: readonly string[]): string | null {
  const ds = [...new Set(emails.map((e) => lower(e.split('@')[1] ?? '')).filter((d) => d !== '' && !FREE_MAIL.test(d)))];
  return ds.length === 1 ? ds[0]! : null;
}

/** The contacts held against who the BrainDog keeps: duplicates by email skipped, organisations matched by name. */
export function planOf(contacts: readonly Contact[], held: { people: readonly HeldPerson[]; orgs: readonly HeldOrg[] }): Plan {
  const known = new Set(held.people.flatMap((p) => p.emails.map(lower)));
  const heldByKey = new Map(held.orgs.map((o) => [orgKey(o.name), o] as const));
  const people: Plan['people'] = [];
  const skipped: Contact[] = [];
  for (const c of contacts) {
    const es = c.emails.map(lower);
    if (es.some((e) => known.has(e))) {
      skipped.push(c);
      continue;
    }
    for (const e of es) known.add(e);
    people.push({ ...c, orgKey: c.org === '' ? '' : orgKey(c.org) });
  }
  const heldOrgs = new Map<string, HeldOrg>();
  const orgs: Plan['orgs'] = [];
  for (const p of people) {
    if (p.orgKey === '') continue;
    const h = heldByKey.get(p.orgKey);
    if (h) heldOrgs.set(p.orgKey, h);
    else if (!orgs.some((o) => o.key === p.orgKey)) orgs.push({ key: p.orgKey, name: p.org, domain: null });
  }
  for (const o of orgs) o.domain = domainOf(people.filter((p) => p.orgKey === o.key).flatMap((p) => p.emails));
  return { people, orgs, heldOrgs, skipped };
}

/** A person's fields as People keeps them: their name, their first email, every way they are known, who they are with. */
export function personFields(p: Contact, org: string | null): Record<string, unknown> {
  const keys = [...p.emails.map((e) => `email:${lower(e)}`), ...p.phones.map((t) => `phone:${t.replace(/[^\d+]/gu, '')}`).filter((k) => k !== 'phone:')];
  return {
    name: p.name,
    ...(p.emails[0] ? { email: lower(p.emails[0]) } : {}),
    ...(keys.length > 0 ? { keys: [...new Set(keys)] } : {}),
    ...(org ? { org } : {}),
  };
}

/* ── the one tidy question ─────────────────────────────────────────────── */

/** What the import wrote, as the page knows it once the press is done. */
export type Wrote = { people: { seq: number; name: string }[]; orgs: { seq: number; name: string; domain: string | null }[] };

/** One change the tidy makes, to one entry. */
export type TidyChange = { register: 'people' | 'organisations'; seq: number; patch: Record<string, unknown> };
/** The one question: the lines it says, and every change a yes makes. */
export type Tidy = { lines: string[]; changes: TidyChange[] };

/** A name typed all in small letters or all in capitals, written with a capital to each word ("jane fenwick"). */
function capitalised(name: string): string | null {
  const letters = name.replace(/[^\p{L}]/gu, '');
  if (letters.length < 2 || (letters !== lower(letters) && letters !== letters.toUpperCase())) return null;
  const fixed = lower(name).replace(/(^|[\s'-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase());
  return fixed === name ? null : fixed;
}

/**
 * WHAT THE IMPORT LEFT UNTIDY, AS ONE QUESTION (the after-an-import skill, `packages/seed/src/packs/agents-skills.ts`:
 * find what the import wrote, put every tidy in one arrangement, one question for all of it). Only what this import
 * wrote is touched. Three tidies, each said in a line: names written all small or all capitals get their capitals; a new
 * organisation is given the website its people's emails share; and where the BrainDog already marks organisations as
 * clients, the new ones are offered as clients too. `null` when there is nothing to tidy.
 */
export function tidyOf(wrote: Wrote, held: { orgs: readonly HeldOrg[] }): Tidy | null {
  const lines: string[] = [];
  const changes: TidyChange[] = [];
  const caps: string[] = [];
  for (const p of wrote.people) {
    const fixed = capitalised(p.name);
    if (fixed === null) continue;
    caps.push(fixed);
    changes.push({ register: 'people', seq: p.seq, patch: { name: fixed } });
  }
  for (const o of wrote.orgs) {
    const fixed = capitalised(o.name);
    if (fixed === null) continue;
    caps.push(fixed);
    changes.push({ register: 'organisations', seq: o.seq, patch: { name: fixed } });
  }
  if (caps.length > 0) lines.push(words.capitals(caps));
  const sites = wrote.orgs.filter((o) => o.domain !== null);
  if (sites.length > 0) {
    lines.push(words.websites(sites.length));
    for (const o of sites) {
      const at = changes.find((c) => c.register === 'organisations' && c.seq === o.seq);
      if (at) at.patch = { ...at.patch, domain: o.domain };
      else changes.push({ register: 'organisations', seq: o.seq, patch: { domain: o.domain } });
    }
  }
  if (wrote.orgs.length > 0 && held.orgs.some((o) => o.kind === 'client')) {
    lines.push(words.clients(wrote.orgs.map((o) => o.name)));
    for (const o of wrote.orgs) {
      const at = changes.find((c) => c.register === 'organisations' && c.seq === o.seq);
      if (at) at.patch = { ...at.patch, kind: 'client' };
      else changes.push({ register: 'organisations', seq: o.seq, patch: { kind: 'client' } });
    }
  }
  return lines.length === 0 ? null : { lines, changes };
}

/**
 * Mail forwarded to the record's address is read for who and what, after no pattern took it.
 *
 * WHO: the sender and the people it names are met (`meet`), never given an address the mail did not print.
 * WHAT: an invoice or receipt becomes a bill, a renewal notice moves a service's renewal day, a shipping or booking
 * confirmation becomes a dated task on the project it names. Each is a question BrainDog files itself only when it is
 * sure (the vendor is held, the amount and day read cleanly, the row it belongs to found); otherwise it waits in To
 * review with the filing as the button, and money that did not read cleanly asks in Needs you: only what is sure is filed alone.
 *
 * LISTS ARE FOUND BY SHAPE AND NEVER BY ID, because a record names its lists as it likes. Nothing here follows a link,
 * opens an attachment or keeps a body: the mail is already stored raw, and only the facts above are written.
 */

import type { Result } from '@braindog/ports';
import { openRowset, unfile, type IngestDeps } from './ingest.ts';
import { instant } from './migrate.ts';
import { places, readMail, type MailRead } from './mail-read.ts';
import { domainOrgName } from './identity-keys.ts';
import type { MeetArgs, Met } from './index.ts';

type MailField = { id: string; type: string; to?: string; values?: readonly string[]; retired?: boolean; deadline?: boolean };
export type MailList = { id: string; title?: string; state?: string; scopes?: unknown; fields: readonly MailField[] };

export type MailDeps = {
  ing: IngestDeps;
  lists: readonly MailList[];
  /** The lists `meet` writes (people and organisations), so a vendor already held can be told from a new one. */
  people: readonly string[];
  meet: (args: MeetArgs) => Result<Met>;
  /**
   * The model's reading, offered only when it is on, the plan allows a call, and the rules found nothing in mail that
   * talks of money. Absent, such mail stays as it was. A model reading is never sure enough to file by itself.
   */
  model?: ((subject: string, body: string) => MailRead | null) | undefined;
};

export type MailOutcome =
  | { handled: false }
  | { handled: true; state: 'matched' | 'review' | 'skipped'; reason: string; suggestion?: string };

type Row = { id: string; version: number; fields: Record<string, unknown> };

const live = (l: MailList): MailField[] => l.fields.filter((f) => !f.retired);

/* ── the lists, by their shape ──────────────────────────────────────────── */

type Bills = { id: string; title: string; direction: string; amount: string; due: string; state?: string; party?: { id: string; to: string } };
type Services = { id: string; title: string; renews: string; cost?: string };
type Tasks = { id: string; title: string; by?: string; thing: string };

/** Bills: money out or in, an amount, and a due day. */
export function billsList(lists: readonly MailList[], people: readonly string[]): Bills | null {
  for (const l of lists) {
    const f = live(l);
    const direction = f.find((x) => x.type === 'enum' && x.values?.includes('owed_by_me'));
    const amount = f.find((x) => x.type === 'money');
    const due = f.find((x) => x.type === 'day' && x.deadline);
    if (!direction || !amount || !due || !l.title) continue;
    const state = f.find((x) => x.type === 'enum' && x.values?.includes('paid'));
    const party = f.find((x) => x.type === 'ref' && x.to !== undefined && people.includes(x.to));
    return {
      id: l.id,
      title: l.title,
      direction: direction.id,
      amount: amount.id,
      due: due.id,
      ...(state ? { state: state.id } : {}),
      ...(party ? { party: { id: party.id, to: party.to! } } : {}),
    };
  }
  return null;
}

/** Services and domains: a renewal day that is a deadline, a cost, and a cycle. */
export function servicesList(lists: readonly MailList[]): Services | null {
  for (const l of lists) {
    const f = live(l);
    const renews = f.find((x) => x.type === 'day' && x.deadline);
    const cycle = f.find((x) => x.type === 'enum' && x.values?.includes('monthly') && x.values.includes('yearly'));
    if (!renews || !cycle || !l.title || f.some((x) => x.type === 'enum' && x.values?.includes('owed_by_me'))) continue;
    const cost = f.find((x) => x.type === 'money');
    return { id: l.id, title: l.title, renews: renews.id, ...(cost ? { cost: cost.id } : {}) };
  }
  return null;
}

/** Tasks: a link to the project list, a deadline day, and a state. */
export function tasksList(lists: readonly MailList[]): Tasks | null {
  const project = lists.find((l) => l.scopes !== undefined);
  if (!project) return null;
  for (const l of lists) {
    if (l.id === project.id || !l.title || l.state === undefined) continue;
    const f = live(l);
    if (f.some((x) => x.type === 'money')) continue;
    const thing = f.find((x) => x.type === 'ref' && x.to === project.id);
    if (!thing) continue;
    const by = f.find((x) => x.type === 'day' && x.deadline);
    return { id: l.id, title: l.title, thing: thing.id, ...(by ? { by: by.id } : {}) };
  }
  return null;
}

/* ── reading the record ─────────────────────────────────────────────────── */

function rowsOf(deps: MailDeps, register: string): Row[] {
  return deps.ing.sql
    .all<{ id: string; version: number; fields: string }>('SELECT id, version, fields FROM entry WHERE register = ? AND deleted_at IS NULL', register)
    .map((r) => ({ id: r.id, version: r.version, fields: JSON.parse(r.fields) as Record<string, unknown> }));
}

/** Whether somebody or some organisation held in the record already has this address or domain. */
function holds(deps: MailDeps, address: string, domain: string): boolean {
  for (const register of deps.people) {
    const found = deps.ing.sql.one<{ n: number }>(
      `SELECT 1 AS n FROM entry WHERE register = ? AND deleted_at IS NULL
         AND (instr(lower(fields), ?) > 0 OR instr(lower(fields), ?) > 0 OR instr(lower(fields), ?) > 0) LIMIT 1`,
      register,
      address,
      `@${domain}`,
      `domain:${domain}`,
    );
    if (found) return true;
  }
  return false;
}

const whole = (text: string, word: string): boolean => {
  const w = word.toLowerCase();
  for (let i = text.indexOf(w); i !== -1; i = text.indexOf(w, i + 1))
    if (!/[a-z0-9]/u.test(text[i - 1] ?? ' ') && !/[a-z0-9]/u.test(text[i + w.length] ?? ' ')) return true;
  return false;
};

/** The one project whose title the mail spells out, or none (two is none: a guess is worse than a blank). */
function projectIn(deps: MailDeps, text: string): Row | null {
  const projects = deps.lists.find((l) => l.scopes !== undefined);
  if (!projects?.title) return null;
  const hit = rowsOf(deps, projects.id).filter((r) => {
    const t = r.fields[projects.title!];
    return typeof t === 'string' && t.trim().length >= 4 && whole(text, t.trim());
  });
  return hit.length === 1 ? hit[0]! : null;
}

/* ── words ──────────────────────────────────────────────────────────────── */

const GENERIC = /^(?:no-?reply|billing|invoices?|receipts?|support|team|accounts?|payments?|info|hello|admin|orders?)\b/iu;

/** The registrable part of a domain: `billing.acme.co.uk` is `acme.co.uk`. */
function rootOf(domain: string): string {
  const parts = domain.split('.');
  if (parts.length <= 2) return domain;
  const last = parts.at(-1)!;
  const mid = parts.at(-2)!;
  return parts.slice(last.length === 2 && mid.length <= 3 ? -3 : -2).join('.');
}

/** Who sent it, as a person says it: the name it wrote, else the company the domain spells. */
function vendorOf(read: MailRead): string {
  const named = (read.from?.name ?? '').replace(/\s+(?:via|from)\s+.*$/iu, '').replace(/[<>"]/gu, '').trim();
  if (named.length >= 3 && named.length <= 40 && !GENERIC.test(named) && !named.includes('@')) return named;
  return domainOrgName(rootOf(read.domain), null);
}

const sayMoney = (m: { amount: number; currency: string }): string => `${m.currency} ${(m.amount / 10 ** places(m.currency)).toFixed(places(m.currency))}`;

const cut = (text: string, most = 80): string => (text.length <= most ? text : `${text.slice(0, most - 1).trimEnd()}…`);

/* ── the filing each kind suggests ──────────────────────────────────────── */

type Plan = {
  register: string;
  rows: Record<string, unknown>[];
  question: string;
  sure: string;
  context: string;
  /** Filed by BrainDog itself: every fact read cleanly and the row it belongs to found. */
  isSure: boolean;
  /** Money did not read cleanly, so it asks in Needs you whatever else is true. */
  moneyDoubt: boolean;
  adds: boolean;
};

type Facts = { read: MailRead; known: boolean; vendor: string; subject: string; text: string; today: string; viaModel: boolean };

function billPlan(deps: MailDeps, f: Facts): Plan | { skipped: string } | null {
  const bills = billsList(deps.lists, deps.people);
  if (!bills) return null;
  const { read } = f;
  const receipt = read.kind === 'receipt';
  const what = cut(`${f.vendor} ${receipt ? 'receipt' : 'invoice'}${read.ref ? ` ${read.ref}` : ''}`, 60);
  const day = read.due ?? f.today;

  /* THE SAME BILL TWICE IS ONE BILL: a vendor's mail forwarded again must not make a second row. */
  if (read.amount) {
    const label = f.vendor.toLowerCase();
    const again = rowsOf(deps, bills.id).find((r) => {
      const m = r.fields[bills.amount] as { amount?: number; currency?: string } | undefined;
      return m?.amount === read.amount!.amount && m.currency === read.amount!.currency && r.fields[bills.due] === day && String(r.fields[bills.title] ?? '').toLowerCase().includes(label);
    });
    if (again) return { skipped: `${what} is already in the record.` };
  }

  const before = rowsOf(deps, bills.id).some((r) => {
    const t = String(r.fields[bills.title] ?? '').toLowerCase();
    return f.vendor.length >= 3 && t.includes(f.vendor.toLowerCase());
  });
  const row: Record<string, unknown> = {
    [bills.title]: what,
    [bills.direction]: 'owed_by_me',
    [bills.due]: day,
    ...(read.amount ? { [bills.amount]: read.amount } : {}),
    ...(receipt && bills.state ? { [bills.state]: 'paid' } : {}),
  };
  const party = bills.party && f.known ? rowsOf(deps, bills.party.to).find((r) => JSON.stringify(r.fields).toLowerCase().includes(`@${read.domain}`)) : undefined;
  if (party && bills.party) row[bills.party.id] = party.id;

  const dayRead = read.due !== undefined || receipt;
  const notes = [
    read.amount ? '' : 'No total was printed clearly, so the amount needs you.',
    read.amount && !read.amountClean ? 'The total could be read two ways, so please check it.' : '',
    dayRead ? '' : 'No due day was printed, so today is used.',
    f.known ? '' : `${f.vendor} is new to the record.`,
    before ? '' : 'No earlier bill from them is in the record.',
  ].filter((t) => t !== '');
  const said = read.amount ? sayMoney(read.amount) : 'amount unread';
  return {
    register: bills.id,
    rows: [row],
    question: cut(`Add ${what}, ${said}?`),
    sure: cut(`Filed by BrainDog: ${what}, ${said} due ${day}`),
    context: `Mail from ${read.domain}. ${notes.join(' ')}`.trim(),
    isSure: !f.viaModel && f.known && before && read.amount !== undefined && read.amountClean && dayRead,
    moneyDoubt: !(read.amount !== undefined && read.amountClean),
    adds: true,
  };
}

function renewalPlan(deps: MailDeps, f: Facts): Plan | { skipped: string } | null {
  const services = servicesList(deps.lists);
  const { read } = f;
  if (!services || !read.renewsOn) return null;
  const hits = rowsOf(deps, services.id)
    .map((r) => ({ r, name: String(r.fields[services.title] ?? '').trim() }))
    .filter((x) => x.name.length >= 3 && whole(f.text, x.name));
  if (hits.length === 0) return null;
  const longest = Math.max(...hits.map((h) => h.name.length));
  const top = hits.filter((h) => h.name.length === longest);
  const exact = top.length === 1;
  const row = top[0]!;
  const current = row.r.fields[services.renews];
  if (exact && current === read.renewsOn) return { skipped: `${row.name} already renews on ${read.renewsOn}.` };

  const costNow = services.cost ? (row.r.fields[services.cost] as { amount?: number; currency?: string } | undefined) : undefined;
  const dearer = read.amount && costNow?.amount !== undefined && (costNow.amount !== read.amount.amount || costNow.currency !== read.amount.currency);
  const later = typeof current !== 'string' || read.renewsOn > current;
  const notes = [
    exact ? '' : 'Two of your services fit this mail.',
    later ? '' : 'The day is earlier than the one kept.',
    dearer ? `The mail says ${sayMoney(read.amount!)}, which differs from the cost kept; the cost is left as it is.` : '',
    read.amount && !read.amountClean ? 'The price could be read two ways.' : '',
    f.known ? '' : `${f.vendor} is new to the record.`,
  ].filter((t) => t !== '');
  return {
    register: services.id,
    rows: [{ at: row.r.id, version: row.r.version, patch: { [services.renews]: read.renewsOn } }],
    question: cut(`Move ${row.name} renewal to ${read.renewsOn}?`),
    sure: cut(`Filed by BrainDog: ${row.name} now renews ${read.renewsOn}`),
    context: `Mail from ${read.domain}. ${notes.join(' ')}`.trim(),
    isSure: !f.viaModel && exact && later && f.known && (read.amount === undefined || read.amountClean),
    /* A price on the mail that did not read cleanly asks, even though only the day is changed. */
    moneyDoubt: read.amount !== undefined && !read.amountClean,
    adds: false,
  };
}

function shippingPlan(deps: MailDeps, f: Facts): Plan | { skipped: string } | null {
  const tasks = tasksList(deps.lists);
  if (!tasks) return null;
  const { read } = f;
  const project = projectIn(deps, f.text);
  const what = cut(`${f.vendor}: ${f.subject.replace(/\s+/gu, ' ').trim() || 'delivery'}`, 70);
  const again = rowsOf(deps, tasks.id).some((r) => r.fields[tasks.title] === what);
  if (again) return { skipped: `${what} is already a task.` };
  const dated = read.date !== undefined && tasks.by !== undefined;
  return {
    register: tasks.id,
    rows: [{ [tasks.title]: what, ...(dated ? { [tasks.by!]: read.date } : {}), ...(project ? { [tasks.thing]: project.id } : {}) }],
    question: cut(`Add a task for ${f.vendor}?`),
    sure: cut(`Filed by BrainDog: task for ${f.vendor}${read.date ? ` on ${read.date}` : ''}`),
    context: `Mail from ${read.domain}. ${project ? '' : 'No project is named in it. '}${dated ? '' : 'No day was printed. '}`.trim(),
    isSure: !f.viaModel && f.known && dated && project !== null,
    moneyDoubt: false,
    adds: true,
  };
}

/* ── the whole reading ──────────────────────────────────────────────────── */

/**
 * THE SENDER OF MAIL A PATTERN TOOK IS MET TOO, untrusted and with where it was seen, as the reading below
 * meets the sender of mail no pattern took: before this, only unpatterned mail met anybody, so the people his
 * patterns read from every day were nobody in People. Only the verified `From`, never a name the body prints.
 */
export function meetPatternedSender(meet: MailDeps['meet'], headers: Record<string, string>): void {
  const read = readMail({ ...(headers.from === undefined ? {} : { from: headers.from }), ...(headers.subject === undefined ? {} : { subject: headers.subject }), body: '' });
  if (read.from) meet({ email: read.from.name ? `${read.from.name} <${read.from.email}>` : read.from.email, source: `mail from ${read.domain}`, untrusted: true });
}

/**
 * Reads one verified, unmatched mail: meets who it names, then files or asks what it says. Inside the arrival's own
 * transaction; the caller hands over the stored row's id. Mail with nothing it can place is `handled: false`, kept
 * untriaged as before.
 */
export function readMailArrival(deps: MailDeps, arrival: { raw: string; headers: Record<string, string>; body: string }): MailOutcome {
  const h = arrival.headers;
  let read = readMail({
    ...(h.from === undefined ? {} : { from: h.from }),
    ...(h.to === undefined ? {} : { to: h.to }),
    ...(h.cc === undefined ? {} : { cc: h.cc }),
    ...(h.subject === undefined ? {} : { subject: h.subject }),
    body: arrival.body,
  });
  const subject = (h.subject ?? '').replace(/^\s*(?:(?:fwd?|re):\s*)+/iu, '');

  /* THE VENDOR IS TOLD FROM A NEW ONE BEFORE ANYONE IS MET, or meeting them would make every vendor known. */
  const known = read.from !== null && holds(deps, read.from.email, read.domain);

  /* WHO: the sender, then the people it names. A person is met by the address the mail printed, never one made up. */
  if (read.from)
    deps.meet({ email: read.from.name ? `${read.from.name} <${read.from.email}>` : read.from.email, source: `mail from ${read.domain}`, untrusted: true });
  for (const p of read.named) deps.meet({ email: p.name ? `${p.name} <${p.email}>` : p.email, source: `mail from ${p.email.slice(p.email.lastIndexOf('@') + 1)}`, untrusted: true });

  let viaModel = false;
  if (read.kind === 'none' && read.looksFinancial && deps.model) {
    const asked = deps.model(subject, arrival.body.slice(0, 8_000));
    if (asked && asked.kind !== 'none') {
      read = { ...asked, from: asked.from ?? read.from, domain: asked.domain || read.domain, named: read.named };
      viaModel = true;
    }
  }
  if (read.kind === 'none' || read.from === null) return { handled: false };

  const facts: Facts = {
    read,
    known,
    vendor: vendorOf(read),
    subject,
    text: `${subject}\n${arrival.body.slice(0, 20_000)}`.toLowerCase(),
    today: new Date(deps.ing.nowMs).toISOString().slice(0, 10),
    viaModel,
  };
  const plan = read.kind === 'renewal' ? renewalPlan(deps, facts) : read.kind === 'shipping' ? shippingPlan(deps, facts) : billPlan(deps, facts);
  if (plan === null) return { handled: false };

  const store = (state: 'matched' | 'review' | 'skipped', reason: string): void =>
    void deps.ing.sql.exec('UPDATE inbox_raw SET state = ?, reason = ? WHERE id = ?', state, reason, arrival.raw);

  if ('skipped' in plan) {
    store('skipped', plan.skipped);
    return { handled: true, state: 'skipped', reason: plan.skipped };
  }

  const at = instant(deps.ing.nowMs);
  const suggestion = openRowset(deps.ing, at, {
    ingest: 'mail',
    register: plan.register,
    rows: plan.rows,
    question: plan.isSure ? plan.sure : plan.question,
    context: plan.context,
    raw: arrival.raw,
    ...(plan.isSure && plan.adds ? { confident: true } : {}),
    /* A DOUBTFUL FILING WAITS IN TO REVIEW; MONEY NOT READ CLEANLY STILL ASKS IN NEEDS YOU. */
    ...(!plan.isSure && !plan.moneyDoubt ? { review: true } : {}),
  });
  if (plan.isSure) {
    const done = deps.ing.settle?.(suggestion);
    if (done?.ok) {
      store('matched', plan.sure);
      return { handled: true, state: 'matched', reason: plan.sure, suggestion };
    }
    unfile(deps.ing, suggestion, { question: plan.question, context: plan.context });
  }
  store('review', plan.question);
  return { handled: true, state: 'review', reason: plan.question, suggestion };
}

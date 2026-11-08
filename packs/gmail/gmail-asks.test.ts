/**
 * Gmail 1.2.0: what the hourly script asks about in Needs you, and who it meets, each rule with its own mails. The
 * script is run alone in QuickJS, as a record runs it, over a host double holding the rows; its writes are laid back on
 * them, so a second hour reads what the first wrote. Every mail, name and address here is invented.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import type { CtxHost, Json, ScriptAnswer, ScriptDecl } from '../../packages/script/src/index.ts';
import { runInQuickJs } from '../../packages/script/src/quickjs.ts';

const HERE = new URL('./', import.meta.url);
const SOURCE = readFileSync(new URL('gmail.js', HERE), 'utf8');
const PACK = JSON.parse(readFileSync(new URL('gmail.pack.json', HERE), 'utf8')) as { declarations: Record<string, unknown>[] };
const SCRIPT = PACK.declarations.find((d) => d.script === 'gmail_people') as { script: string; reads: string[]; writes: string[] };
const decl = (): ScriptDecl => ({ id: SCRIPT.script, version: 1, egress: [], keys: [], reads: SCRIPT.reads, writes: SCRIPT.writes, source: SOURCE });

type Fields = Record<string, unknown>;
type Row = { id: string; seq: number; version: number; fields: Fields };
type Lists = Record<string, Row[]>;

const TODAY = '2026-11-03';
const ME = 'sam.okafor@gmail.com';

/* ── the host double ─────────────────────────────────────────────────────── */

/** The predicate tree a script filters with, read over a row as the record reads it. */
function holds(where: unknown, row: Row): boolean {
  if (where === null || where === undefined) return true;
  const w = where as Record<string, unknown>;
  if (Array.isArray(w.all)) return w.all.every((x) => holds(x, row));
  if (Array.isArray(w.any)) return w.any.some((x) => holds(x, row));
  if (Array.isArray(w.none)) return !w.none.some((x) => holds(x, row));
  const value = w.field === 'seq' ? row.seq : row.fields[w.field as string];
  if ('is' in w) return value === w.is;
  if ('gte' in w) return value !== undefined && value !== null && (value as string) >= (w.gte as string);
  if ('in' in w) return (w.in as unknown[]).includes(value);
  throw new Error(`the double does not read ${JSON.stringify(w)}`);
}

function hostOf(lists: Lists): CtxHost {
  return {
    fetch: async () => {
      throw new Error('the Gmail script fetches nothing');
    },
    list: async (register: string, where: Json) => (lists[register] ?? []).filter((r) => holds(where, r)).sort((a, b) => a.seq - b.seq).slice(0, 50) as unknown as Json[],
    get: async () => null,
    now: () => `${TODAY}T12:00:00.000Z`,
    clock: () => 0,
    tz: 'UTC',
    input: {},
  } as unknown as CtxHost;
}

type W = { op: string; register?: string; spoken?: string; fields?: Fields; patch?: Fields };

/** One hour: the script run over the lists, and its writes laid back on them as the record keeps them. */
async function hour(lists: Lists): Promise<{ writes: W[]; log: string }> {
  const a: ScriptAnswer = await runInQuickJs(decl(), hostOf(lists));
  assert.ok('writes' in a, JSON.stringify(a));
  const writes = a.writes as unknown as W[];
  for (const w of writes) {
    if (w.op === 'create') {
      const list = (lists[w.register!] ??= []);
      const seq = Math.max(0, ...Object.values(lists).flat().map((r) => r.seq)) + 1;
      list.push({ id: `${w.register}_${seq}`, seq, version: 1, fields: { ...w.fields } });
    } else {
      const [register, n] = w.spoken!.split('#');
      const row = lists[register!]!.find((r) => r.seq === Number(n))!;
      for (const [k, v] of Object.entries(w.patch ?? {})) if (v === null) delete row.fields[k];
      else row.fields[k] = v;
      row.version += 1;
    }
  }
  return { writes, log: a.log };
}

/* ── mails ───────────────────────────────────────────────────────────────── */

let next = 100;
/** A mail as the door writes it: from a person, to you, unread and not yet answered in Gmail, unless said otherwise. */
function mail(f: Fields): Row {
  next += 1;
  const at = (f.at as string) ?? `${TODAY}T0${String(next % 10)}:${String(next % 60).padStart(2, '0')}:00.000Z`;
  return {
    id: `mail_${next}`,
    seq: next,
    version: 1,
    fields: {
      direction: 'received',
      person: true,
      needs_reply: true,
      unread: true,
      hint: 'none',
      kind: 'none',
      met: false,
      message: `msg${next}`,
      thread: `thr${next}`,
      day: at.slice(0, 10),
      link: `https://mail.google.com/mail/#all/thr${next}`,
      snippet: '',
      ...f,
      at,
    },
  };
}
const sent = (f: Fields): Row => mail({ direction: 'sent', person: false, needs_reply: false, unread: false, ...f });

const SELF = { id: 'person_self', seq: 1, version: 1, fields: { name: 'Sam Okafor', email: ME, self: true, keys: ['email:sam@okafor-studio.example'] } };
function lists(mails: Row[], people: Row[] = [], met = true): Lists {
  /* AN EARLIER MAIL ALREADY LOOKED AT, so the hour is not the mailbox's first look, unless the test says it is. */
  const before = met ? [mail({ subject: 'Old', name: 'Old', address: 'old@old.example', met: true, ask: 'none', person: false, needs_reply: false, day: '2026-10-30', at: '2026-10-30T09:00:00.000Z' })] : [];
  return { gmail_mail: [...before, ...mails], people: [structuredClone(SELF), ...people], organisations: [] };
}
const row = (l: Lists, r: Row): Fields => l.gmail_mail!.find((x) => x.id === r.id)!.fields;
const asked = (l: Lists): Fields[] => l.gmail_mail!.filter((r) => ['reply', 'bill', 'receipt', 'date', 'many'].includes(r.fields.ask as string)).map((r) => r.fields);

/* ── what is asked ───────────────────────────────────────────────────────── */

test('A CALENDAR INVITATION AND ITS UPDATES ASK NOTHING: no reply, no date, from the organiser or the calendar', async () => {
  const invite = mail({ subject: 'Invitation: Weekly Team Sync @ Weekly from 3pm to 3:30pm on Monday (EET)', name: 'Lena Park', address: 'lena@marlow-studio.example', snippet: 'You have been invited by Lena Park to attend an event named Weekly Team Sync on Monday Nov 2, 2026 3pm. Join with Google Meet', thread: 'cal1' });
  const updates = [1, 2, 3].map((n) =>
    mail({ subject: `Updated invitation: Lena <> Sam Weekly 1:1 @ Tue Nov 3, 2026 ${n + 3}pm - ${n + 3}:30pm (EET) (${ME})`, name: 'Lena Park', address: 'lena@marlow-studio.example', snippet: 'This event has been changed. Changed: time. Can you make it?', thread: `cal${n + 1}` }),
  );
  /* ONE CONNECT GOOGLE MARKED AS THE CALENDAR'S BY ITS HEADERS, its subject saying nothing. */
  const marked = mail({ subject: 'Studio walk-through', name: 'Lena Park', address: 'lena@marlow-studio.example', snippet: 'Thursday at 10am, does that work?', hint: 'event' });
  const l = lists([invite, ...updates, marked]);
  await hour(l);
  for (const m of [invite, ...updates, marked]) {
    assert.equal(row(l, m).ask, 'none', `${String(row(l, m).subject)} was asked about`);
    assert.notEqual(row(l, m).kind, 'date', `${String(row(l, m).subject)} became a date`);
    assert.notEqual(row(l, m).wants, true);
  }
});

test('A FORWARD SENT FOR YOUR INFORMATION ASKS NOTHING; one where whoever forwarded it asks something does', async () => {
  const fyi = mail({ subject: 'Fwd: Studio newsletter for November', name: 'Omar Haddad', address: 'omar@haddad-legal.example', snippet: '---------- Forwarded message --------- From: Studio <hello@studio.example> Date: Mon, Nov 2, 2026 Subject: Studio newsletter. What do you think?' });
  const fyi2 = mail({ subject: 'Fwd: You have upgraded to a paid account', name: 'Omar Haddad', address: 'omar@haddad-legal.example', snippet: 'FYI ---------- Forwarded message --------- From: Cloud Billing' });
  const ask = mail({ subject: 'Fwd: Pre-order promo', name: 'Omar Haddad', address: 'omar@haddad-legal.example', snippet: 'Can you check the dates before Friday? ---------- Forwarded message --------- From: Shop' });
  const l = lists([fyi, fyi2, ask]);
  await hour(l);
  assert.equal(row(l, fyi).ask, 'none', 'a forward with nothing asked by its forwarder asked for a reply');
  assert.equal(row(l, fyi2).ask, 'none');
  assert.equal(row(l, ask).ask, 'reply');
  assert.equal(row(l, ask).wants, true);
});

test('A REAL QUESTION FROM A COLLEAGUE, SENT TO YOU, IS ASKED; the same on Cc, or with nothing asked, is not', async () => {
  const question = mail({ subject: 'Quote for the shoot', name: 'Lena Park', address: 'lena@marlow-studio.example', snippet: 'Hi Sam, could you send the signed quote by Thursday?' });
  /* COPIED: the door says it waits on nobody's reply but somebody else's. */
  const copied = mail({ subject: 'Quote for the shoot (team)', name: 'Lena Park', address: 'lena@marlow-studio.example', snippet: 'Could someone send the signed quote?', needs_reply: false });
  const thanks = mail({ subject: 'Lovely to meet', name: 'Ana Ruiz', address: 'ana@ruiz-design.example', snippet: 'Great to meet you yesterday. Talk soon.' });
  const support = mail({ subject: 'Your ticket', name: 'Studio Support', address: 'support@studio.example', snippet: 'Could you tell us more about the problem?' });
  const l = lists([question, copied, thanks, support]);
  await hour(l);
  assert.equal(row(l, question).ask, 'reply');
  assert.equal(row(l, copied).ask, 'none', 'a mail he is only copied on asked for a reply');
  assert.equal(row(l, thanks).ask, 'none', 'a mail that asks nothing asked for a reply');
  assert.equal(row(l, support).ask, 'none', 'a shared inbox is not a person waiting on him');
});

test('A NEWSLETTER ASKS NOTHING AND MEETS NOBODY, even sent to you by name', async () => {
  const news = mail({ subject: 'This week in design', name: 'Weekly Design', address: 'news@design-weekly.example', snippet: 'Can you believe it? Unsubscribe here', person: false, hint: 'list' });
  const l = lists([news]);
  await hour(l);
  assert.equal(row(l, news).ask, 'none');
  assert.equal(l.people!.length, 1, 'a newsletter became a person');
  assert.equal(l.organisations!.length, 0, 'a newsletter became an organisation');
});

test('ONE QUESTION A THREAD: the newest mail that asks carries it, a later one joins it, and one after your reply asks again', async () => {
  const one = mail({ subject: 'Contract draft', name: 'Omar Haddad', address: 'omar@haddad-legal.example', snippet: 'Could you look at clause 4?', thread: 'contract', at: `${TODAY}T08:00:00.000Z` });
  const two = mail({ subject: 'Re: Contract draft', name: 'Omar Haddad', address: 'omar@haddad-legal.example', snippet: 'Also, can you sign page 2? On Mon, Nov 2 Omar wrote: Could you look', thread: 'contract', at: `${TODAY}T09:00:00.000Z` });
  const l = lists([one, two]);
  await hour(l);
  assert.deepEqual([row(l, one).ask, row(l, two).ask], ['joined', 'reply'], 'two questions for one thread');
  assert.equal(asked(l).length, 1);

  /* A NEWER MAIL IN THE THREAD WHILE ITS QUESTION WAITS JOINS IT. */
  const three = mail({ subject: 'Re: Contract draft', name: 'Omar Haddad', address: 'omar@haddad-legal.example', snippet: 'And can you initial page 3?', thread: 'contract', at: `${TODAY}T10:00:00.000Z` });
  l.gmail_mail!.push(three);
  await hour(l);
  assert.equal(row(l, three).ask, 'joined', 'a newer mail in a waiting thread asked again');
  assert.equal(row(l, three).wants, false);

  /* YOU REPLIED IN GMAIL; THEN A NEW QUESTION IS A NEW ASK. */
  l.gmail_mail!.push(sent({ subject: 'Re: Contract draft', name: 'Omar Haddad', address: 'omar@haddad-legal.example', thread: 'contract', at: `${TODAY}T10:30:00.000Z` }));
  for (const r of l.gmail_mail!) if (r.fields.thread === 'contract' && r.fields.direction === 'received') r.fields.needs_reply = false;
  const four = mail({ subject: 'Re: Contract draft', name: 'Omar Haddad', address: 'omar@haddad-legal.example', snippet: 'Thanks. Could you send the final by Friday?', thread: 'contract', at: `${TODAY}T11:00:00.000Z` });
  l.gmail_mail!.push(four);
  await hour(l);
  /* YOUR REPLY MADE OMAR OF USE: he is added, and his mail waits an hour to be linked to him, and asked about then. */
  assert.deepEqual(l.people!.map((p) => p.fields.name), ['Sam Okafor', 'Omar Haddad']);
  assert.equal(row(l, four).met, false);
  await hour(l);
  assert.equal(row(l, four).ask, 'reply', 'a question after your reply was not asked');
  assert.equal(row(l, four).who, l.people![1]!.id);
});

test('ONE ORDER IS ONE, AND A RECEIPT IS NEVER ASKED ABOUT: Order Received and Order Finished, and a PayPal receipt and the invoice it pays, are one each, kept with your money, amount first', async () => {
  const received = mail({ subject: 'Order #1042 received', name: 'Corner Shop', address: 'orders@corner-shop.example', snippet: 'Thanks for your order. Total: EGP 450.00', person: false, needs_reply: false });
  const finished = mail({ subject: 'Order #1042 finished', name: 'Corner Shop', address: 'orders@corner-shop.example', snippet: 'Your order is complete. Total: EGP 450.00', person: false, needs_reply: false });
  const invoice = mail({ subject: 'Invoice INV-2026-07 for October hosting', name: 'Northwind Hosting', address: 'billing@northwind.example', snippet: 'Amount due: $49.00 by 15 November.', person: false, needs_reply: false, day: '2026-11-01', at: '2026-11-01T07:00:00.000Z' });
  const paid = mail({ subject: 'Receipt for your payment to Northwind Hosting', name: 'PayPal', address: 'service@paypal.com', snippet: 'You sent a payment of $49.00 USD to Northwind Hosting.', person: false, needs_reply: false });
  const l = lists([received, finished, invoice, paid]);
  await hour(l);
  /* A RECEIPT IS KEPT WITH YOUR MONEY AND NOT ASKED ABOUT (1.3.2): it waits to be added, once an order. */
  assert.deepEqual([row(l, received).ask, row(l, finished).ask], ['none', 'joined'], 'one order kept twice');
  assert.deepEqual([row(l, received).add, row(l, finished).add], [true, undefined]);
  assert.equal(row(l, received).says, 'EGP 450.00 receipt from Corner Shop');
  assert.equal(row(l, received).ref, '1042');
  /* PAID ALREADY: the invoice joins the receipt, and the receipt is kept with your money, with nothing asked. */
  assert.deepEqual([row(l, invoice).ask, row(l, paid).ask], ['joined', 'none'], 'a receipt and the invoice it pays asked about');
  assert.equal(row(l, paid).add, true);
  assert.equal(row(l, paid).says, '$49.00 receipt from PayPal');
  assert.equal(asked(l).length, 0);

  /* AN HOUR LATER THE SAME ORDER'S NEXT MAIL STILL JOINS, read from what was kept. */
  const shipped = mail({ subject: 'Order #1042 has shipped', name: 'Corner Shop', address: 'orders@corner-shop.example', snippet: 'Your order receipt: EGP 450.00', person: false, needs_reply: false });
  l.gmail_mail!.push(shipped);
  await hour(l);
  assert.equal(row(l, shipped).ask, 'joined');
});

test('A DATE ONLY FROM A PERSON NAMING A DAY, once a thread, and never where a reply question already asks', async () => {
  const date = mail({ subject: 'Interview slot', name: 'Ana Ruiz', address: 'ana@ruiz-design.example', snippet: 'Your interview is booked for Tuesday Nov 10 at 3pm.', thread: 'interview' });
  const again = mail({ subject: 'Re: Interview slot', name: 'Ana Ruiz', address: 'ana@ruiz-design.example', snippet: 'Reminder: the interview is Tuesday Nov 10 at 3pm.', thread: 'interview' });
  const noDay = mail({ subject: 'Meeting notes', name: 'Ana Ruiz', address: 'ana@ruiz-design.example', snippet: 'Here are the notes from the meeting.' });
  const l = lists([date, again, noDay]);
  await hour(l);
  assert.equal(row(l, date).ask, 'date');
  assert.equal(row(l, again).ask, 'joined', 'one thread asked about its date twice');
  assert.equal(row(l, noDay).ask, 'none');
});

/* ── many at once ────────────────────────────────────────────────────────── */

const QUESTIONS = ['Could you send the deck?', 'Can we move Friday?', 'Can you sign the form?', 'Would you check the numbers?', 'Can you approve the budget?', 'Could you call me back?', 'Are you free next week?', 'Please confirm the venue.'];
const asking = (n: number, who = 'Lena Park', address = 'lena@marlow-studio.example'): Row[] =>
  QUESTIONS.slice(0, n).map((q, i) => mail({ subject: `Question ${String(i + 1)}`, name: who, address, snippet: q, at: `${TODAY}T0${String(i)}:00:00.000Z` }));

test('THE FIRST LOOK AT A MAILBOX ASKS ONCE: 8 questions are one, "8 mails may need you", and each is held on the Mail page', async () => {
  const mails = asking(8);
  const l = lists(mails, [], false);
  await hour(l);
  const many = l.gmail_mail!.filter((r) => r.fields.ask === 'many');
  assert.equal(many.length, 1, 'not one question in place of many');
  assert.equal(asked(l).length, 1, 'a question besides the one in place of many');
  assert.equal(many[0]!.fields.says, '8 mails may need you: 8 waiting on your reply. They are on the Mail page.');
  assert.equal(l.gmail_mail!.filter((r) => r.fields.ask === 'held').length, 7);
  assert.ok(mails.every((m) => row(l, m).batch === many[0]!.fields.batch && row(l, m).wants === true), 'a held mail is not on the list it is said to be on');
});

test('ANY HOUR WITH MORE THAN FIVE ASKS ONCE; five or fewer are asked one by one', async () => {
  const l = lists(asking(6));
  await hour(l);
  assert.equal(asked(l).length, 1);
  assert.equal(asked(l)[0]!.ask, 'many');
  assert.match(String(asked(l)[0]!.says), /^6 mails may need you/u);

  const five = lists(asking(5, 'Omar Haddad', 'omar@haddad-legal.example'));
  await hour(five);
  assert.equal(asked(five).length, 5);
  assert.ok(asked(five).every((f) => f.ask === 'reply'));
});

test('"LEAVE THEM" ON THE QUESTION IN PLACE OF MANY TAKES EACH OF THEM OFF THE LISTS at the next hour', async () => {
  const l = lists(asking(6));
  await hour(l);
  const many = l.gmail_mail!.find((r) => r.fields.ask === 'many')!;
  many.fields.answered = true;
  await hour(l);
  const batch = l.gmail_mail!.filter((r) => r.fields.ask === 'held');
  assert.equal(batch.length, 5);
  assert.ok(batch.every((r) => r.fields.answered === true && r.fields.wants === false), 'a mail left is still on the list');
  /* AND ONCE: the next hour reads it and writes nothing. */
  assert.equal((await hour(l)).writes.length, 0);
});

/* ── who is met ──────────────────────────────────────────────────────────── */

test('NOBODY IS ADDED FOR WRITING TO YOU: a person is added once you both wrote, named, with why; machines and inboxes never', async () => {
  const lena = mail({ subject: 'Hello', name: 'Lena Park', address: 'lena@marlow-studio.example', snippet: 'Nice to meet you.', thread: 'hello', at: `${TODAY}T08:00:00.000Z` });
  const reply = sent({ subject: 'Re: Hello', name: 'Lena Park', address: 'lena@marlow-studio.example', thread: 'hello', at: `${TODAY}T09:00:00.000Z` });
  const stranger = mail({ subject: 'Partnership', name: 'Victor Hale', address: 'victor@hale-ventures.example', snippet: 'We would love to work with you.' });
  const bare = mail({ subject: 'Hi', name: 'kim@kim-studio.example', address: 'kim@kim-studio.example', snippet: 'Hi there.' });
  const shop = mail({ subject: 'Your receipt', name: 'Stream+', address: 'streamplus@trx.mail2.streamplus.example', snippet: 'Thanks for your payment of $12.99', person: true, needs_reply: false });
  const updates = mail({ subject: 'News', name: 'VOILA UPDATES', address: 'info@voila.example', snippet: 'Our latest' });
  const admin = mail({ subject: 'Weekly report', name: 'Studio Admin', address: 'admin@studio.example', snippet: 'The report' });
  const toAdmin = sent({ subject: 'Re: Weekly report', name: 'Studio Admin', address: 'admin@studio.example' });
  const l = lists([lena, reply, stranger, bare, shop, updates, admin, toAdmin]);
  await hour(l);
  const names = l.people!.map((p) => p.fields.name);
  assert.deepEqual(names, ['Sam Okafor', 'Lena Park'], 'somebody was added who is not of use, or somebody of use was not');
  const added = l.people![1]!.fields;
  assert.equal(added.email, 'lena@marlow-studio.example');
  assert.equal(added.in_touch, TODAY);
  assert.deepEqual(added.met, [`${TODAY} · Gmail, a mail thread you both wrote in`]);
  assert.deepEqual(l.organisations!.map((o) => o.fields.domain), ['marlow-studio.example'], 'an organisation came with nobody of use');
});

test('A BARE ADDRESS IS NO NAME: somebody of use with no other is named by their address', async () => {
  const kim = mail({ subject: 'Hi', name: 'kim.lee@kim-studio.example', address: 'kim.lee@kim-studio.example', snippet: 'Hi there.', thread: 'kim' });
  const back = sent({ subject: 'Re: Hi', name: 'kim.lee@kim-studio.example', address: 'kim.lee@kim-studio.example', thread: 'kim' });
  const l = lists([kim, back]);
  await hour(l);
  assert.equal(l.people![1]?.fields.name, 'kim.lee', 'the address was kept as a name');
});

test('YOUR OWN ADDRESSES ARE YOU: a mail from your other address meets nobody and asks nothing', async () => {
  const own = mail({ subject: 'Note to self', name: 'Sam Okafor', address: 'sam@okafor-studio.example', snippet: 'Can you remember the keys?' });
  const ownName = mail({ subject: 'From the phone', name: 'Sam Okafor', address: 'sam.phone@okafor.example', snippet: 'Can you remember the keys?' });
  const l = lists([own, ownName, sent({ subject: 'Re: From the phone', address: 'sam.phone@okafor.example', name: 'Sam Okafor', thread: ownName.fields.thread })]);
  await hour(l);
  assert.equal(l.people!.length, 1, 'one of his own addresses became somebody else');
  assert.equal(row(l, own).ask, 'none');
  assert.equal(row(l, ownName).ask, 'none');
});

test('SOMEBODY ALREADY IN PEOPLE IS LINKED, and their Last in touch moves on, whether or not the mail asks anything', async () => {
  const omar = { id: 'person_omar', seq: 2, version: 1, fields: { name: 'Omar Haddad', email: 'omar@haddad-legal.example', in_touch: '2026-10-20' } };
  const hi = mail({ subject: 'Lunch', name: 'Omar Haddad', address: 'omar@haddad-legal.example', snippet: 'Was good to see you.' });
  const l = lists([hi], [omar]);
  await hour(l);
  assert.equal(row(l, hi).who, 'person_omar');
  assert.equal(l.people!.find((p) => p.id === 'person_omar')!.fields.in_touch, TODAY);
  assert.equal(row(l, hi).met, true);
});

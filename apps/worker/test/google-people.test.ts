/**
 * Connect Google never adds a person for being in Google Contacts.
 *
 * The first sync of a real account added every card in the book as a person: family nicknames, a bank's clerk, and the
 * owner's own second address as somebody else. Now a card holding one of his own addresses is his, a card somebody kept
 * already answers to fills in what they lack, and a card is a new person only when they are of use: a mail thread both
 * of them wrote in, or a name the record already says. Everybody else is left out, and the sync's line says how many.
 *
 * Run against a real record through the writer the alarm uses (`googleWriter`), with Google answered by a fake.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '@braindog/record';

import { googleWriter, syncOnce, type Connection, type Send } from '../src/google-connect.ts';
import { fixedClock, openSqlite, type NodeSql } from '../../../packages/kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 10, 3, 12);
const TWO_DAYS_AGO = NOW - 2 * 86_400_000;
const MAIL_DAY = '2026-11-01';

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

const PEOPLE = {
  id: 'register.people',
  kind: 'register' as const,
  body: {
    id: 'people',
    name: 'People',
    title: 'name',
    meets: { name: 'name', email: 'email', handles: 'handles', met: 'met', merged_into: 'merged_into', keys: 'keys', aliases: 'aliases', self: 'self', in_touch: 'in_touch' },
    fields: [
      { id: 'name', type: 'text', required: true, search: true },
      { id: 'email', type: 'email', unique: true, index: true },
      { id: 'handles', type: 'list', of: 'text' },
      { id: 'keys', type: 'list', of: 'text' },
      { id: 'aliases', type: 'list', of: 'text' },
      { id: 'self', type: 'bool' },
      { id: 'in_touch', type: 'day' },
      { id: 'met', type: 'list', of: 'text' },
      { id: 'merged_into', type: 'ref', to: 'people' },
    ],
  } as never,
};

const TASKS = {
  id: 'register.tasks',
  kind: 'register' as const,
  body: { id: 'tasks', name: 'Tasks', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never,
};

const value = <T>(r: { ok: boolean }): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

/* ── Google, answered ─────────────────────────────────────────────────────── */

type FakeMail = { id: string; thread: string; labels: string[]; headers: Record<string, string> };

const ME = 'sami@gmail.com';

/** A thread with Ada both of them wrote in, a newsletter he once answered, and nothing else. */
const MAILS: FakeMail[] = [
  { id: 'm1', thread: 't1', labels: ['INBOX'], headers: { From: 'Ada Lovelace <ada.lovelace@analytical.example>', To: ME, Subject: 'The engine notes' } },
  { id: 'm2', thread: 't1', labels: ['SENT'], headers: { From: ME, To: '"Lovelace, Ada" <ada.lovelace@analytical.example>', Subject: 'Re: The engine notes' } },
  {
    id: 'm3',
    thread: 't2',
    labels: ['INBOX', 'CATEGORY_PROMOTIONS'],
    headers: { From: 'Jane Writer <jane@letters.example>', To: ME, Subject: 'This week in letters', 'List-Id': '<letters.example>', 'List-Unsubscribe': '<https://letters.example/u>' },
  },
  { id: 'm4', thread: 't2', labels: ['SENT'], headers: { From: ME, To: 'jane@letters.example', Subject: 'Re: This week in letters' } },
];

type Card = { name: string; emails?: string[]; phones?: string[] };

const CARDS: Card[] = [
  /* HIS OWN: an address Gmail sends as, and his second address, which his own person already holds, in other case. */
  { name: 'Sami Work', emails: ['sami@work.example'], phones: ['+20 100 000 0001'] },
  { name: 'Samira', emails: ['Sami.Second@Example.com'] },
  /* SOMEBODY KEPT, by the second address her row holds as a key, in other case. */
  { name: 'Grace H.', emails: ['Amazing.Grace@COBOL.example', 'grace.hopper@yale.example'], phones: ['+1 202 555 0143'] },
  /* A THREAD BOTH WROTE IN. */
  { name: 'Ada Lovelace', emails: ['ada.lovelace@analytical.example'] },
  /* A NEWSLETTER HE ANSWERED ONCE: she never wrote to him as a person. */
  { name: 'Jane Writer', emails: ['jane@letters.example'] },
  /* ONLY IN THE BOOK. */
  { name: 'Teta', emails: ['teta@family.example'], phones: ['+20 122 000 0002'] },
  { name: 'Mona Hassan', emails: ['mona.hassan@bank.example'] },
  /* NAMED IN THE RECORD, on a task. */
  { name: 'Rohan Meduri', emails: ['rohan@fanline.example'] },
];

function google(cards: Card[] = CARDS): { send: Send; asked: string[] } {
  const asked: string[] = [];
  const json = (body: unknown): Response => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  const send: Send = (input) => {
    const url = new URL(input);
    asked.push(`${url.host}${url.pathname}`);
    const path = url.pathname;
    if (path.endsWith('/users/me/profile')) return Promise.resolve(json({ historyId: '100' }));
    if (path.endsWith('/users/me/settings/sendAs')) return Promise.resolve(json({ sendAs: [{ sendAsEmail: ME }, { sendAsEmail: 'sami@work.example' }] }));
    if (path.endsWith('/users/me/messages')) return Promise.resolve(json({ messages: MAILS.map((m) => ({ id: m.id, threadId: m.thread })) }));
    const one = /\/users\/me\/messages\/([^/]+)$/.exec(path);
    if (one) {
      const m = MAILS.find((x) => x.id === one[1])!;
      return Promise.resolve(
        json({ id: m.id, threadId: m.thread, labelIds: m.labels, internalDate: String(TWO_DAYS_AGO), snippet: '', payload: { headers: Object.entries(m.headers).map(([name, v]) => ({ name, value: v })) } }),
      );
    }
    const thread = /\/users\/me\/threads\/([^/]+)$/.exec(path);
    if (thread) {
      const ms = MAILS.filter((x) => x.thread === thread[1]);
      return Promise.resolve(json({ messages: ms.map((m) => ({ id: m.id, payload: { headers: [{ name: 'From', value: m.headers.From }] } })) }));
    }
    if (path.endsWith('/people/me/connections'))
      return Promise.resolve(
        json({
          connections: cards.map((c, i) => ({
            resourceName: `people/c${String(i)}`,
            names: [{ displayName: c.name }],
            ...(c.emails ? { emailAddresses: c.emails.map((value) => ({ value })) } : {}),
            ...(c.phones ? { phoneNumbers: c.phones.map((value) => ({ value })) } : {}),
          })),
          nextSyncToken: 'contacts-1',
        }),
      );
    return Promise.resolve(new Response('{}', { status: 404 }));
  };
  return { send, asked };
}

/* ── a record ─────────────────────────────────────────────────────────────── */

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  value(await api.kernel.install([PEOPLE, TASKS]));
  value(await api.create({ register: 'people', fields: { name: 'Sami Example', email: ME, self: true, keys: ['email:sami.second@example.com'] } as never }, owner));
  value(await api.create({ register: 'people', fields: { name: 'Grace Hopper', email: 'grace@navy.example', keys: ['email:amazing.grace@cobol.example'] } as never }, owner));
  value(await api.create({ register: 'tasks', fields: { what: 'Send Rohan Meduri the signed contract' } as never }, owner));
  /* THE MAIL ITSELF GOES TO THE GMAIL ADD-ON'S DOOR, which this record does not have; what is measured is who it says. */
  const w = { ...googleWriter(api), mail: true, arrive: () => Promise.resolve(true) };
  const conn: Connection = { v: 1, email: ME, scopes: [], token: { nonce: '', box: '' }, since: NOW, due: NOW };
  return { api, sql, w, conn };
}

type Person = { name: string; email?: string; keys?: string[]; handles?: string[]; aliases?: string[]; self?: boolean; in_touch?: string; met?: string[] };

const people = (sql: NodeSql): Person[] =>
  sql.all<{ fields: string }>("SELECT fields FROM entry WHERE register = 'people' AND deleted_at IS NULL ORDER BY seq").map((r) => JSON.parse(r.fields) as Person);
const named = (sql: NodeSql, name: string): Person | undefined => people(sql).find((p) => p.name === name);
/** Every key a person answers to, as `entity_key` holds them. */
const keysOf = (sql: NodeSql, name: string): string[] => {
  const id = sql.one<{ id: string }>("SELECT id FROM entry WHERE register = 'people' AND deleted_at IS NULL AND json_extract(fields, '$.name') = ?", name)?.id;
  return sql.all<{ key: string }>('SELECT key FROM entity_key WHERE row_id = ? ORDER BY key', id ?? '').map((k) => k.key);
};

/* ── the rule ─────────────────────────────────────────────────────────────── */

test('ONLY PEOPLE OF USE ARE ADDED: a thread both wrote in, a name the record says; the rest of the book is left out', async () => {
  const { sql, w, conn } = await record();
  const { send } = google();
  await syncOnce(conn, 'access', w, send, NOW);

  assert.deepEqual(
    people(sql).map((p) => p.name),
    ['Sami Example', 'Grace Hopper', 'Ada Lovelace', 'Rohan Meduri'],
    'a card was added for being a card, or one of use was not',
  );
  const ada = named(sql, 'Ada Lovelace')!;
  assert.equal(ada.email, 'ada.lovelace@analytical.example');
  assert.equal(ada.in_touch, MAIL_DAY, 'Last in touch is the day of the thread, not the day the book was read');
  assert.match(ada.met?.[0] ?? '', /Google Contacts, a mail thread you both wrote in$/);
  const rohan = named(sql, 'Rohan Meduri')!;
  assert.equal(rohan.in_touch, undefined, 'being named in the record is not being in touch');
  assert.match(rohan.met?.[0] ?? '', /already named in this record$/);

  /* AND THE SYNC SAYS SO, rather than adding quietly. */
  assert.equal(conn.last?.ok, true, conn.last?.said);
  assert.match(conn.last?.said ?? '', /3 people matched, 2 added, 3 contacts not added$/);
  sql.close();
});

test('A CARD WITH ONE OF HIS OWN ADDRESSES IS HIS: what it holds goes onto his own person, and nobody is added', async () => {
  const { sql, w, conn } = await record();
  await syncOnce(conn, 'access', w, google().send, NOW);

  assert.equal(people(sql).filter((p) => /sami/i.test(p.name)).length, 1, 'his own address became somebody else');
  const mine = keysOf(sql, 'Sami Example');
  assert.ok(mine.includes('email:sami@work.example'), `the address Gmail sends as is not his: ${mine.join(', ')}`);
  assert.ok(mine.some((k) => k.startsWith('phone:')), 'the phone on his own card is not his');
  assert.equal(named(sql, 'Sami Example')?.name, 'Sami Example', 'a card renamed him');
  sql.close();
});

test('A CARD SOMEBODY ALREADY ANSWERS TO FILLS IN WHAT THEY LACK, by any of their addresses in any case, and adds nobody', async () => {
  const { sql, w, conn } = await record();
  await syncOnce(conn, 'access', w, google().send, NOW);

  assert.equal(people(sql).filter((p) => /grace/i.test(p.name)).length, 1, 'a second Grace');
  const grace = named(sql, 'Grace Hopper')!;
  assert.equal(grace.email, 'grace@navy.example', 'the address she was kept with was replaced');
  const hers = keysOf(sql, 'Grace Hopper');
  assert.ok(hers.includes('email:grace.hopper@yale.example'), `the card's other address is not hers: ${hers.join(', ')}`);
  assert.ok(hers.some((k) => k.startsWith('phone:')), "the card's phone is not hers");
  assert.deepEqual(grace.aliases, ['Grace H.'], 'the name on the card is not kept as another of her names');
  sql.close();
});

test('A NEWSLETTER IS NOBODY, even one he answered once: she never wrote to him as a person', async () => {
  const { sql, w, conn } = await record();
  await syncOnce(conn, 'access', w, google().send, NOW);

  assert.equal(named(sql, 'Jane Writer'), undefined);
  assert.equal(sql.one<{ n: number }>("SELECT count(*) AS n FROM entity_key WHERE key = 'email:jane@letters.example'")?.n, 0);
  sql.close();
});

test('A CARD ONLY IN THE BOOK IS LEFT OUT WHOLE: no person, no key, no mention kept', async () => {
  const { sql, w, conn } = await record();
  await syncOnce(conn, 'access', w, google().send, NOW);

  assert.equal(named(sql, 'Teta'), undefined);
  assert.equal(named(sql, 'Mona Hassan'), undefined);
  assert.equal(sql.one<{ n: number }>('SELECT count(*) AS n FROM entity_mention')?.n, 0, 'a card left out was kept as a mention');
  sql.close();
});

test('READ AGAIN, NOTHING MOVES, and the line says the book is up to date', async () => {
  const { sql, w, conn } = await record();
  const { send } = google();
  await syncOnce(conn, 'access', w, send, NOW);
  const after = sql.all<{ fields: string; version: number }>("SELECT fields, version FROM entry WHERE register = 'people' ORDER BY seq");

  /* GOOGLE SAYS NOTHING CHANGED: an incremental read answers no cards. */
  await syncOnce(conn, 'access', w, google([]).send, NOW + 15 * 60_000);
  assert.match(conn.last?.said ?? '', /contacts up to date$/);

  /* AND A WHOLE READ THE NEXT DAY WRITES NOTHING NEW ON ANYBODY. */
  await syncOnce(conn, 'access', w, send, NOW + 25 * 3_600_000);
  assert.deepEqual(sql.all<{ fields: string; version: number }>("SELECT fields, version FROM entry WHERE register = 'people' ORDER BY seq"), after);
  assert.match(conn.last?.said ?? '', /5 people matched, 0 added, 3 contacts not added$/);
  sql.close();
});

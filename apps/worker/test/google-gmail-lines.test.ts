/**
 * What Connect Google tells the Gmail add-on about a mail, in the lines every version of its door already reads: a mail
 * he is only copied on waits on no reply of his, and a calendar's mail (an invitation by its subject, its `Sender` or its
 * type, or a mail about an event the calendar holds) waits on none either and is `event` to Gmail 1.2.0 and `none` to an
 * older one, whose door has no such word. Google is answered by a fake; every mail is invented.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { aboutEvent, isInvite, syncOnce, titleWords, type Connection, type Send, type Writer } from '../src/google-connect.ts';

const NOW = Date.UTC(2026, 10, 3, 12);
const ME = 'sam.okafor@gmail.com';

type FakeMail = { id: string; labels: string[]; headers: Record<string, string>; snippet?: string };

const MAILS: FakeMail[] = [
  { id: 'to', labels: ['INBOX', 'UNREAD'], headers: { From: 'Lena Park <lena@marlow-studio.example>', To: ME, Subject: 'Quote' }, snippet: 'Could you sign it?' },
  { id: 'cc', labels: ['INBOX', 'UNREAD'], headers: { From: 'Lena Park <lena@marlow-studio.example>', To: 'omar@haddad-legal.example', Cc: `Sam <${ME}>`, Subject: 'Quote for Omar' }, snippet: 'Could you sign it?' },
  { id: 'alias', labels: ['INBOX', 'UNREAD'], headers: { From: 'Lena Park <lena@marlow-studio.example>', To: 'sam@okafor-studio.example', Subject: 'To the studio address' }, snippet: 'Could you sign it?' },
  {
    id: 'invite',
    labels: ['INBOX', 'UNREAD'],
    headers: { From: 'Lena Park <lena@marlow-studio.example>', Sender: 'Google Calendar <calendar-notification@google.com>', To: ME, Subject: 'Studio walk-through', 'Content-Type': 'multipart/mixed; boundary="x"' },
    snippet: 'Thursday 10am',
  },
  { id: 'about', labels: ['INBOX', 'UNREAD'], headers: { From: 'Lena Park <lena@marlow-studio.example>', To: ME, Subject: 'Re: Weekly Team Sync agenda meeting' }, snippet: 'For Monday' },
];

function google(): Send {
  const json = (body: unknown): Response => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  return (input) => {
    const path = new URL(input).pathname;
    if (path.endsWith('/users/me/profile')) return Promise.resolve(json({ historyId: '100' }));
    if (path.endsWith('/users/me/messages')) return Promise.resolve(json({ messages: MAILS.map((m) => ({ id: m.id, threadId: `t-${m.id}` })) }));
    const one = /\/users\/me\/messages\/([^/]+)$/.exec(path);
    if (one) {
      const m = MAILS.find((x) => x.id === one[1])!;
      return Promise.resolve(
        json({ id: m.id, threadId: `t-${m.id}`, labelIds: m.labels, internalDate: String(NOW - 3_600_000), snippet: m.snippet ?? '', payload: { headers: Object.entries(m.headers).map(([name, value]) => ({ name, value })) } }),
      );
    }
    if (/\/users\/me\/threads\//.test(path)) return Promise.resolve(json({ messages: [] }));
    return Promise.resolve(new Response('{}', { status: 404 }));
  };
}

/** A writer that keeps each body the door would be posted, with or without Gmail 1.2.0's `event`. */
function writer(eventHint: boolean): { w: Writer; bodies: Map<string, string> } {
  const bodies = new Map<string, string>();
  const w: Writer = {
    zone: 'UTC',
    mail: true,
    eventHint,
    events: true,
    invites: false,
    arrive: (body) => {
      bodies.set(/gmail\.message= (\S+)/.exec(body)![1]!, body);
      return Promise.resolve(true);
    },
    heldEvents: () => Promise.resolve(new Map([['k1', { seq: 1, version: 1, fields: { what: 'Weekly Team Sync', day: '2026-11-09' } }]])),
    addEvent: () => Promise.resolve(),
    changeEvent: () => Promise.resolve(),
    contact: () => Promise.resolve('skipped'),
    hints: [],
    arriveWhole: () => Promise.resolve(false),
  };
  return { w, bodies };
}

const line = (body: string | undefined, key: string): string => new RegExp(`gmail\\.${key}= (.*)`).exec(body ?? '')?.[1] ?? '';

async function synced(eventHint: boolean): Promise<Map<string, string>> {
  const { w, bodies } = writer(eventHint);
  /* THE STUDIO ADDRESS IS ONE GMAIL SENDS AS. */
  const conn: Connection = { v: 1, email: ME, scopes: [], token: { nonce: '', box: '' }, since: NOW, due: NOW, own: { list: ['sam@okafor-studio.example'], at: NOW } };
  await syncOnce(conn, 'access', w, google(), NOW);
  assert.match(conn.last?.said ?? '', /^5 mails/u, conn.last?.said);
  return bodies;
}

test('A MAIL HE IS ONLY COPIED ON WAITS ON NO REPLY OF HIS; one to him, or to an address he sends as, does', async () => {
  const bodies = await synced(true);
  assert.equal(line(bodies.get('to'), 'reply'), 'yes');
  assert.equal(line(bodies.get('cc'), 'reply'), 'no', 'a mail he is only copied on waits on his reply');
  assert.equal(line(bodies.get('alias'), 'reply'), 'yes', 'a mail to the address he sends as is not his');
});

test("A CALENDAR'S MAIL WAITS ON NO REPLY, and is `event` to Gmail 1.2.0 and `none` to the door before it", async () => {
  const now = await synced(true);
  assert.equal(line(now.get('invite'), 'reply'), 'no');
  assert.equal(line(now.get('invite'), 'kind'), 'event');
  /* ABOUT AN EVENT THE CALENDAR HOLDS, though no invitation. */
  assert.equal(line(now.get('about'), 'kind'), 'event');
  const before = await synced(false);
  assert.equal(line(before.get('invite'), 'kind'), 'none', 'a word the 1.1.1 door cannot read was sent to it');
  assert.equal(line(before.get('about'), 'kind'), 'date');
  /* AND NO LINE IS ADDED, so every door that reads these bodies reads them whole. */
  for (const body of [...now.values(), ...before.values()]) assert.deepEqual(body.split('\n').map((l) => l.split('=')[0]), ['BrainDog Gmail 1', 'gmail.message', 'gmail.thread', 'gmail.direction', 'gmail.name', 'gmail.address', 'gmail.subject', 'gmail.day', 'gmail.at', 'gmail.unread', 'gmail.reply', 'gmail.person', 'gmail.kind', 'gmail.link', 'gmail.snippet', 'gmail.end', '']);
});

test('WHAT IS A CALENDAR MAIL, AND WHAT IS ABOUT AN EVENT', () => {
  assert.ok(isInvite('Updated invitation: Lena <> Sam Weekly 1:1 @ Tue Nov 3, 2026 4pm (EET)', 'lena@marlow-studio.example', '', ''));
  assert.ok(isInvite('Accepted: Weekly Team Sync @ Mon Nov 9', 'omar@haddad-legal.example', '', ''));
  assert.ok(isInvite('Anything', 'calendar-notification@google.com', '', ''));
  assert.ok(isInvite('Walk-through', 'lena@marlow-studio.example', '', 'text/calendar; method=REQUEST'));
  assert.ok(!isInvite('Can we meet on Thursday?', 'lena@marlow-studio.example', '', 'multipart/alternative'));
  const titles = ['Weekly Team Sync', 'Lunch'].map(titleWords);
  assert.ok(aboutEvent('Re: Weekly Team Sync agenda', titles));
  assert.ok(!aboutEvent('Lunch?', titles), 'a one-word title names every mail that says it');
  assert.ok(!aboutEvent('Weekly sync notes', titles));
});

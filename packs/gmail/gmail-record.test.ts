/**
 * Gmail 1.2.0 on a real record: mail through the add-on's own door, the hourly script on the record's own clock, and the
 * questions that reach Needs you counted where Decide reads them. And the update from 1.1.1, which a record holding the
 * store's Gmail takes by itself on the night pass when it loses nothing and reaches nothing new. Every mail is invented.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { scriptReads, scriptRunner } from '../../packages/host/src/script.ts';
import { createRecordApi, type CallContext } from '../../packages/record/src/index.ts';
import { fixedClock, openSqlite } from '../../packages/kernel/test/sqlite.ts';
import { runInQuickJs } from '../../packages/script/src/quickjs.ts';
import { firstPartyDocument } from '../../packages/seed/src/index.ts';
import { losses, reachesNew } from '../../packages/seed/src/packs/quiet.ts';

const NOW = Date.UTC(2026, 10, 3, 9);
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };
const said = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};

type Api = Awaited<ReturnType<typeof createRecordApi>>;
const SHIPPED = (): Record<string, unknown> => JSON.parse(readFileSync(new URL('./gmail.pack.json', import.meta.url), 'utf8')) as Record<string, unknown>;
const PUBLISHED_111 = (): Record<string, unknown> => JSON.parse(readFileSync(new URL('../../apps/web/static/catalogue/packs/gmail/1.1.1.pack.json', import.meta.url), 'utf8')) as Record<string, unknown>;

async function planned(api: Api, doc: unknown) {
  return said<{ diff: Parameters<typeof losses>[0] & { planHash: string; approve: unknown[] } }>(await api.planPack({ doc, source: { kind: 'local' } } as never, owner)).diff;
}
async function put(api: Api, doc: unknown): Promise<void> {
  const diff = await planned(api, doc);
  said(await api.installPack({ doc, source: { kind: 'local' }, planHash: diff.planHash, approve: diff.approve } as never, owner));
}

async function fresh(gmail: Record<string, unknown> | null = SHIPPED()) {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  for (const id of ['portfolio', 'people']) await put(api, firstPartyDocument(id, { seeds: [] }));
  said(await api.create({ register: 'people', fields: { name: 'Sam Okafor', email: 'sam.okafor@gmail.com', self: true } as never }, owner));
  if (gmail !== null) await put(api, gmail);
  return { api, sql, clock, close: () => sql.close() };
}

let n = 0;
/** One mail as the door takes it, the lines Connect Google and every pasted script post. */
function body(m: { subject: string; name: string; address: string; snippet: string; thread?: string; reply?: boolean; person?: boolean; kind?: string }): string {
  n += 1;
  return [
    'BrainDog Gmail 1',
    `gmail.message= rec${String(n)}`,
    `gmail.thread= ${m.thread ?? `t${String(n)}`}`,
    'gmail.direction= received',
    `gmail.name= ${m.name}`,
    `gmail.address= ${m.address}`,
    `gmail.subject= ${m.subject}`,
    'gmail.day= 2026-11-03',
    `gmail.at= 2026-11-03T08:${String(n % 60).padStart(2, '0')}:00.000Z`,
    'gmail.unread= yes',
    `gmail.reply= ${m.reply === false ? 'no' : 'yes'}`,
    `gmail.person= ${m.person === false ? 'no' : 'yes'}`,
    `gmail.kind= ${m.kind ?? 'none'}`,
    `gmail.link= https://mail.google.com/mail/#all/t${String(n)}`,
    `gmail.snippet= ${m.snippet}`,
    'gmail.end',
    '',
  ].join('\n');
}
async function arrive(api: Api, text: string): Promise<void> {
  const sha256 = createHash('sha256').update(text).digest('hex');
  const out = (await api.arrive({ channel: 'webhook', headers: { 'content-type': 'text/plain; charset=utf-8' }, body: text, sha256, verified: true, ingest: 'gmail_in' } as never)) as Out;
  assert.ok(out.ok, JSON.stringify(out));
  /* WRITTEN, NEVER PROPOSED: a door that misses a line it reads asks about the mail instead of keeping it. */
  const v = out.value as { confidence: string; wrote: string[] };
  assert.deepEqual([v.confidence, v.wrote.length], ['exact', 1], JSON.stringify(v));
}

/** An hour on the record's clock: what is due fires, and the script runs in QuickJS as a host runs it. */
async function hour(api: Api, clock: ReturnType<typeof fixedClock>): Promise<void> {
  clock.advance(61 * 60_000);
  const refuse = async (): Promise<never> => {
    throw new Error('the Gmail script fetches nothing');
  };
  const run = scriptRunner({ run: runInQuickJs, send: refuse, pin: refuse, openKey: refuse, grantOf: () => null, reads: scriptReads(api), now: () => clock.now() } as never);
  for (let i = 0; i < 3; i++) {
    await api.kernel.drain();
    const ran = (await api.kernel.runActions(refuse as never, { script: run, limit: 50 })) as { refused: number; failed: number };
    assert.deepEqual([ran.refused, ran.failed], [0, 0], 'the hourly script was refused');
  }
}

/** The questions the Gmail add-on's rules opened, as Needs you holds them. */
const cards = (api: Api, sql: ReturnType<typeof openSqlite>): string[] =>
  sql
    .all<{ id: string }>("SELECT id FROM suggestion WHERE status = 'open' AND opened_by LIKE 'rule:gmail%' ORDER BY rowid")
    .map((q) => api.kernel.question(q.id) ?? q.id);
const figure = async (api: Api, id: string): Promise<unknown> => said<{ value: unknown }>(await api.metric({ metric: id } as never, owner)).value;

const QUESTIONS = ['Could you send the deck?', 'Can we move Friday?', 'Can you sign the form?', 'Would you check the numbers?', 'Can you approve the budget?', 'Could you call me back?', 'Are you free next week?'];

test('A FIRST LOOK WITH SEVEN QUESTIONS, TWO INVITATIONS, AN FYI AND A NEWSLETTER REACHES NEEDS YOU AS ONE QUESTION', async () => {
  const { api, sql, clock, close } = await fresh();
  for (const q of QUESTIONS) await arrive(api, body({ subject: q.replace('?', ''), name: 'Lena Park', address: 'lena@marlow-studio.example', snippet: q }));
  /* CONNECT GOOGLE SAYS A CALENDAR'S MAIL IS ONE, and that it waits on no reply. */
  await arrive(api, body({ subject: 'Updated invitation: Lena <> Sam Weekly 1:1 @ Tue Nov 3, 2026 4pm (EET)', name: 'Lena Park', address: 'lena@marlow-studio.example', snippet: 'This event has been changed. Can you make it?', kind: 'event', reply: false }));
  /* A SCRIPT PASTED BEFORE 1.2.0 SAYS NEITHER: its invitation is known by its subject and its words. */
  await arrive(api, body({ subject: 'Invitation: Weekly Team Sync @ Weekly from 3pm on Monday', name: 'Lena Park', address: 'lena@marlow-studio.example', snippet: 'You have been invited by Lena Park. Join with Google Meet' }));
  await arrive(api, body({ subject: 'Fwd: Studio newsletter', name: 'Omar Haddad', address: 'omar@haddad-legal.example', snippet: '---------- Forwarded message --------- From: Studio' }));
  await arrive(api, body({ subject: 'This week in design', name: 'Design Weekly', address: 'news@design-weekly.example', snippet: 'Unsubscribe', person: false, reply: false, kind: 'list' }));
  await hour(api, clock);
  const asked = cards(api, sql);
  assert.deepEqual(asked, ['7 mails may need you: 7 waiting on your reply. They are on the Mail page.'], `Needs you holds ${String(asked.length)} questions`);
  /* THE SEVEN ARE ON THE MAIL PAGE'S LIST AND COUNTED, the invitations and the forward are not. */
  assert.equal(await figure(api, 'gmail-needs-reply'), 7);
  /* AND NOBODY WAS ADDED: Sam never wrote to any of them. */
  assert.deepEqual(sql.all<{ name: string }>("SELECT json_extract(fields, '$.name') AS name FROM entry WHERE register = 'people' AND deleted_at IS NULL").map((r) => r.name), ['Sam Okafor']);

  /* THE NEXT HOUR, ONE NEW QUESTION IS ONE QUESTION, and an invitation's update is none. */
  await arrive(api, body({ subject: 'Contract draft', name: 'Omar Haddad', address: 'omar@haddad-legal.example', snippet: 'Could you look at clause 4 before Thursday?' }));
  await arrive(api, body({ subject: 'Updated invitation: Lena <> Sam Weekly 1:1 @ Tue Nov 3, 2026 5pm (EET)', name: 'Lena Park', address: 'lena@marlow-studio.example', snippet: 'This event has been changed.', kind: 'event', reply: false }));
  await hour(api, clock);
  const next = cards(api, sql).slice(1);
  assert.equal(next.length, 1, next.join(' | '));
  assert.match(next[0]!, /^Omar Haddad is waiting on a reply about Contract draft\. Open it in Gmail: https:\/\/mail\.google\.com\//u);
  close();
});

test('A RECEIPT IS NEVER A QUESTION: ONE ORDER IS KEPT WITH YOUR MONEY ONCE, AMOUNT FIRST', async () => {
  const { api, sql, clock, close } = await fresh();
  await arrive(api, body({ subject: 'Order #1042 received', name: 'Corner Shop', address: 'orders@corner-shop.example', snippet: 'Thanks for your order. Total: EGP 450.00', person: false, reply: false }));
  await arrive(api, body({ subject: 'Order #1042 finished', name: 'Corner Shop', address: 'orders@corner-shop.example', snippet: 'Your order is complete. Total: EGP 450.00', person: false, reply: false }));
  await hour(api, clock);
  const asked = cards(api, sql);
  assert.deepEqual(asked, [], asked.join(' | '));
  /* THE ONE ORDER WAITS TO BE ADDED, and the Mail page counts it once. */
  const adding = sql.all<{ says: string }>("SELECT json_extract(fields, '$.says') AS says FROM entry WHERE register = 'gmail_mail' AND json_extract(fields, '$.add') = 1");
  assert.deepEqual(adding.map((r) => r.says), ['EGP 450.00 receipt from Corner Shop']);
  assert.equal(await figure(api, 'gmail-to-look'), 1);
  close();
});

test('THE UPDATE FROM 1.1.1 LOSES NOTHING AND REACHES NOTHING NEW, so the night pass puts it in by itself, and mail kept before asks nothing again', async () => {
  const { api, sql, clock, close } = await fresh(PUBLISHED_111());
  await arrive(api, body({ subject: 'Old question', name: 'Lena Park', address: 'lena@marlow-studio.example', snippet: 'Could you look?' }));
  /* 1.1.1 MEETS LENA IN ONE HOUR AND ASKS IN THE NEXT, once her mail is linked to her. */
  await hour(api, clock);
  await hour(api, clock);
  const before = cards(api, sql).length;
  assert.equal(before, 1, 'the 1.1.1 hour did not ask as it did');

  const diff = await planned(api, SHIPPED());
  assert.deepEqual(losses(diff as never), [], 'the update would wait for a press');
  assert.deepEqual(reachesNew(diff as never), [], 'the update would run something new');
  assert.deepEqual((diff as unknown as { conflicts: unknown[] }).conflicts, []);
  await put(api, SHIPPED());
  assert.equal(sql.one<{ version: string }>("SELECT version FROM pack WHERE id = 'gmail'")?.version, '1.3.2');
  /* A BILL KEPT BEFORE 1.2.0 SAID WHAT IT ASKS IS STILL COUNTED: it holds no ask at all. */
  sql.exec("UPDATE entry SET fields = json_set(fields, '$.kind', 'bill') WHERE register = 'gmail_mail'");
  assert.equal(await figure(api, 'gmail-to-look'), 1);

  /* THE MAIL 1.1.1 ALREADY LOOKED AT IS NOT ASKED ABOUT AGAIN, whatever the door says of it next. */
  await arrive(api, body({ subject: 'Another', name: 'Ana Ruiz', address: 'ana@ruiz-design.example', snippet: 'Nice to meet you.' }));
  await hour(api, clock);
  assert.equal(cards(api, sql).length, before, 'the update asked again about mail already looked at, or about a mail that asks nothing');
  close();
});

/**
 * The four reads of batch 84 through the client: `briefing`, `exceptions`, `matched` and `about`, each a typed call
 * sent to the route of its name and answered by the record method of that name.
 *
 * NOT A STAND-IN FETCH AND NOT A STAND-IN GUARD: `serveApi` over a real record, as `held-twice.test.ts` drives it, so
 * what the client sends is what the host decodes, the caller is held by the record's own guards, and the answers are
 * what the record holds. One record carries all four: a bill that is late, a list of numbers that stopped arriving,
 * one person met twice and folded by the record's own rules, and a project a note names.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ROUTES, handlersFor, serveApi } from '@braindog/host';

import { createClient, type Briefing } from '../src/index.ts';
import { createRecordApi, type CallContext } from '../../record/src/index.ts';
import type { Briefing as RecordBriefing } from '../../record/src/methods/briefing.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

/** The record's own briefing is what the client's written-out shape says it is, held at compile time. */
const _same: Briefing = null as unknown as RecordBriefing;
void _same;

const DAY = 86_400_000;
/** Wednesday 14 October 2026, noon, on a record that keeps UTC. The numbers last arrived on the 10th. */
const NOW = Date.UTC(2026, 9, 14, 12);

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true };
/** Somebody invited to Notes and nothing else: the bills, the numbers, the people and the projects are not there for them. */
const shut: CallContext = { principal: { kind: 'person', id: 'p_3', level: 'read' }, registers: ['notes'] };

const list = (id: string, name: string, title: string, rest: Record<string, unknown>) => ({ id: `register.${id}`, kind: 'register' as const, body: { id, name, title, ...rest } as never });

const BILLS = list('bills', 'Bills', 'name', {
  state: 'status',
  done: ['paid'],
  fields: [
    { id: 'name', type: 'text', required: true },
    { id: 'due', type: 'day', deadline: true },
    { id: 'status', type: 'enum', values: ['open', 'paid'], default: 'open' },
  ],
});
const NUMBERS = list('figures', 'Numbers', 'label', { fields: [{ id: 'label', type: 'text', required: true }, { id: 'value', type: 'int' }] });
const THINGS = list('things', 'Projects', 'name', {
  search: ['name'],
  scopes: { repos: 'repos', folders: 'folders' },
  fields: [{ id: 'name', type: 'text', required: true }, { id: 'repos', type: 'list', of: 'text' }, { id: 'folders', type: 'list', of: 'text' }],
});
const NOTES = list('notes', 'Notes', 'subject', { search: ['subject', 'body'], fields: [{ id: 'subject', type: 'text', required: true }, { id: 'body', type: 'text' }] });
const PEOPLE = list('people', 'People', 'name', {
  meets: { name: 'name', email: 'email', handles: 'handles', keys: 'keys', met: 'met', merged_into: 'merged_into' },
  fields: [
    { id: 'name', type: 'text', required: true },
    { id: 'email', type: 'email', unique: true, index: true },
    { id: 'handles', type: 'list', of: 'text' },
    { id: 'keys', type: 'list', of: 'text' },
    { id: 'met', type: 'list', of: 'text' },
    { id: 'merged_into', type: 'ref', to: 'people' },
  ],
});

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

/** The record, served as the host serves it, and a client for each of two callers. */
async function wired() {
  const sql = openSqlite();
  const clock = fixedClock(NOW - 20 * DAY);
  const api = await createRecordApi({ sql, clock });
  value(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }));
  value(await api.kernel.install([BILLS, NUMBERS, THINGS, NOTES, PEOPLE]));
  const add = (register: string, fields: Record<string, unknown>) => value<{ seq: number }>(api.kernel.create(register, fields as never, { actor: 'p_1' })).seq;
  /* THE NUMBERS ARRIVED ONE A DAY FOR TEN DAYS, 1 to 10 October, and not on the four days since. */
  for (let ago = 13; ago >= 4; ago -= 1) {
    clock.set(NOW - ago * DAY - 2 * 3_600_000);
    add('figures', { label: `Sessions, day ${String(14 - ago)}`, value: 100 + ago });
  }
  clock.set(NOW);
  const rent = add('bills', { name: 'Studio rent', due: '2026-10-12' });
  const northbank = add('things', { name: 'Northbank' });
  add('notes', { subject: 'Call with the printers', body: 'Northbank goes to print on Friday.' });
  /* TEODOR, MET IN A COMMIT, THEN UNDER ANOTHER ADDRESS, THEN UNDER THE COMMIT'S OWN: the strong rules fold the two. */
  const meet = async (said: Record<string, unknown>) => value<{ undo?: string; question?: string }>(await api.meet(said as never, owner));
  await meet({ name: 'Teodor Vance', email: 'teodorv@lanternfish.example', source: 'commit 1 in lanternfish' });
  await meet({ name: 'Teodor Vance', email: 'teodor.v@pellucid.example', source: 'note from Tuesday' });
  const fold = (await meet({ name: 'Teodor Vance', email: 'teodorv@lanternfish.example', source: 'note from Wednesday' })).undo;
  assert.ok(fold, 'the strong rules did not fold them');

  const handlers = handlersFor(api);
  const sent: string[] = [];
  const clientFor = (ctx: CallContext) =>
    createClient({
      base: 'https://x',
      fetch: (async (input: string | URL | Request, init?: RequestInit) => {
        const req = new Request(new URL(String(input)), init);
        sent.push(`${req.method} ${new URL(req.url).pathname}`);
        return serveApi(req, handlers, ctx);
      }) as typeof globalThis.fetch,
    });
  return { sql, api, sent, rent, northbank, fold, mine: clientFor(owner), theirs: clientFor(shut) };
}

test('EACH OF THE FOUR IS ONE READ+ ROUTE THAT WRITES NOTHING, and the client sends each as a GET to the route of its name', async () => {
  for (const name of ['briefing', 'exceptions', 'matched', 'about']) {
    const rows = ROUTES.filter((r) => r.name === name);
    assert.deepEqual(rows.map((r) => [r.group, r.writes]), [['READ+', false]], name);
  }
  const { sql, sent, mine } = await wired();
  const before = sql.one<{ n: number }>('SELECT count(*) AS n FROM event')!.n;
  await mine.briefing();
  await mine.exceptions();
  await mine.matched();
  await mine.about({ name: 'Northbank' });
  assert.deepEqual(sent, ['GET /api/briefing', 'GET /api/exceptions', 'GET /api/matched', 'GET /api/about']);
  assert.equal(sql.one<{ n: number }>('SELECT count(*) AS n FROM event')!.n, before, 'a read wrote to the log');
  sql.close();
});

test('WHAT STOPPED IS ANSWERED BY THE RECORD: the numbers by the name of their list, in one sentence, with the day', async () => {
  const { sql, mine } = await wired();
  const out = value<{ exceptions: { kind: string; subject: string; said: string; since: string }[] }>(await mine.exceptions());
  assert.deepEqual(out.exceptions.map((e) => [e.kind, e.subject, e.since]), [['list', 'Numbers', '10 October']]);
  assert.match(out.exceptions[0]!.said, /Numbers.*four days/u);
  assert.doesNotMatch(JSON.stringify(out), /[0-9A-HJKMNP-TV-Z]{26}|register\.|—/u);
  sql.close();
});

test('THE BRIEFING IS ANSWERED BY THE RECORD: the late bill first with what it opens, and what stopped as a card of its own', async () => {
  const { sql, mine, rent } = await wired();
  const brief = value<Briefing>(await mine.briefing());
  assert.equal(brief.at, new Date(NOW).toISOString());
  assert.ok(brief.cards.length >= 2 && brief.cards.length <= 7, JSON.stringify(brief.cards));
  assert.match(brief.cards[0]!.line, /Studio rent/u);
  assert.equal(brief.cards[0]!.row, `bills#${String(rent)}`);
  const stopped = brief.cards.find((c) => /Numbers/u.test(c.line));
  assert.ok(stopped, `no card said the numbers stopped: ${JSON.stringify(brief.cards)}`);
  for (const c of brief.cards) {
    assert.equal(c.by, 'rule');
    assert.doesNotMatch(c.line, /[0-9A-HJKMNP-TV-Z]{26}|#|—|\{\{/u, c.line);
  }
  sql.close();
});

test('WHO WAS MATCHED IS ANSWERED BY THE RECORD: one fold, by name, with its evidence and the batch its Undo takes', async () => {
  const { sql, mine, fold } = await wired();
  const out = value<{ matches: { from: string[]; into: { name: string; seq: number | null }; evidence: string; batch: string }[] } | null>(await mine.matched({ limit: 5 }));
  assert.ok(out !== null);
  assert.deepEqual(out.matches.map((m) => [m.from, m.into.name, m.batch]), [[['Teodor Vance'], 'Teodor Vance', fold]]);
  assert.equal(out.matches[0]!.evidence, 'The same name and the same handle, teodorv.');
  /* A LIMIT THAT IS NOT A WHOLE NUMBER IS REFUSED AT `limit`, by the route's own table. */
  const bad = (await mine.matched({ limit: 'many' as never })) as { ok: boolean; refusal?: { at?: string } };
  assert.equal(bad.ok, false);
  assert.equal(bad.refusal?.at, 'limit');
  sql.close();
});

test('WHAT ONE THING IS, IS ANSWERED BY THE RECORD: the project by its name, its list and number, and the note as a place it was seen', async () => {
  const { sql, mine, northbank } = await wired();
  const out = value<{ is: { kind: string; name: string; register: string; seq: number | null; seen: { where: string }[] } | null; candidates: unknown[] }>(await mine.about({ name: 'Northbank' }));
  assert.ok(out.is);
  assert.deepEqual([out.is.kind, out.is.name, out.is.register, out.is.seq], ['project', 'Northbank', 'things', northbank]);
  assert.deepEqual(out.is.seen.map((s) => s.where), ['Notes: Call with the printers']);
  assert.deepEqual(out.candidates, []);
  assert.deepEqual(value(await mine.about({ name: 'Nobody of that name' })), { is: null, candidates: [] });
  sql.close();
});

test('SOMEBODY INVITED TO ONE LIST IS HELD BY THE RECORD’S OWN GUARDS on all four: no card, nothing stopped, the people refused, the project unknown', async () => {
  const { sql, theirs } = await wired();
  assert.deepEqual(value<Briefing>(await theirs.briefing()).cards, []);
  assert.deepEqual(value(await theirs.exceptions()), { exceptions: [] });
  const matched = (await theirs.matched()) as { ok: boolean; refusal?: { code: string; fix: string } };
  assert.equal(matched.ok, false);
  assert.doesNotMatch(matched.refusal?.fix ?? '', /Teodor|—/u);
  assert.deepEqual(value(await theirs.about({ name: 'Northbank' })), { is: null, candidates: [] });
  sql.close();
});

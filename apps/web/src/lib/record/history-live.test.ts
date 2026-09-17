/**
 * A row's history against the record: the live events drawn newest first and in words, the sample
 * when there is no record, the record's sentence for any other refusal, and nothing sent for a row
 * the record could not hold.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { display, NOW, REGISTERS, whoDid } from './api.ts';
import { noteOf, readHistory, readNames, sampleLines, type Fetch } from './history-live.ts';

const BASE = 'http://record.test';

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function host(answer: (() => Response) | null): { io: Fetch; sent: string[] } {
  const sent: string[] = [];
  const io = (async (url: string | URL | Request) => {
    sent.push(String(url));
    if (!answer) throw new TypeError('fetch failed');
    return answer();
  }) as Fetch;
  return { io, sent };
}

test("the record's events are drawn newest first, each with who and what", async () => {
  const state = REGISTERS.services!.state!;
  const { io, sent } = host(() =>
    json(200, {
      ok: true,
      value: [
        { ts: '2026-09-01T09:00:00.000Z', actor: 'S42', kind: 'create', field: null, from: null, to: null, note: null },
        { ts: '2026-09-10T09:00:00.000Z', actor: 'rule:renewal', kind: 'state', field: state, from: 'live', to: 'lapsing', note: null },
        { ts: '2026-09-12T09:00:00.000Z', actor: 'agent:claude', kind: 'note', field: null, from: null, to: null, note: 'Chased twice' },
      ],
    }),
  );
  const before = Date.now();
  const out = await readHistory(BASE, 'services', 2, io);
  assert.equal(out.from, 'live');
  const label = (REGISTERS.services!.fields.find((f) => f.id === state)!.label ?? state).toLowerCase();
  assert.deepEqual(out.lines, [
    { by: 'agent:claude', note: 'Chased twice', at: '2026-09-12T09:00:00.000Z' },
    { by: 'rule.renewal', note: `${label} from ${display('services', state, 'live')} to ${display('services', state, 'lapsing')}`, at: '2026-09-10T09:00:00.000Z' },
    { by: 'S42', note: 'created', at: '2026-09-01T09:00:00.000Z' },
  ]);
  assert.ok(out.now >= before, 'a live history is read against the reader\'s clock');
  const url = new URL(sent[0]!);
  assert.equal(url.pathname, '/api/history');
  assert.equal(url.searchParams.get('register'), 'services');
  assert.equal(url.searchParams.get('seq'), '2');
});

for (const [what, answer] of [
  ['nothing answers', null],
  ['the record says UNAUTHORIZED', () => json(401, { ok: false, refusal: { code: 'UNAUTHORIZED', fix: 'Sign in again.' } })],
  ['a static host answers a 404 page', () => new Response('<!doctype html><title>Not found</title>', { status: 404 })],
] as const)
  test(`the sample's history is drawn when ${what}`, async () => {
    const { io } = host(answer);
    const out = await readHistory(BASE, 'services', 2, io);
    assert.deepEqual(out, { from: 'sample', lines: sampleLines('services', 2), now: NOW });
    assert.ok(sampleLines('services', 2).length > 0, 'the sample row has no history, so this proves nothing');
  });

test("any other refusal is the record's own sentence", async () => {
  const fix = 'There is no register called services.';
  const { io } = host(() => json(422, { ok: false, refusal: { code: 'REGISTER_UNKNOWN', fix } }));
  assert.deepEqual(await readHistory(BASE, 'services', 2, io), { from: 'refused', fix });
});

test('a row the record could not hold, a pending one, sends nothing', async () => {
  const { io, sent } = host(() => json(200, { ok: true, value: [] }));
  for (const seq of [-1, 0, Number.NaN]) assert.deepEqual(await readHistory(BASE, 'services', seq, io), { from: 'sample', lines: [], now: NOW });
  assert.equal(sent.length, 0);
});

test('the row page reads its history through the live source, and nothing else there does yet', () => {
  const page = readFileSync(new URL('../../routes/r/[register]/[seq]/+page.svelte', import.meta.url), 'utf8');
  assert.doesNotMatch(page, /AUDIT\.filter/u, 'the history is read from the sample ledger again');
  assert.match(page, /from '\$lib\/record\/history-live\.ts'/u);
  assert.match(page, /<Empty kind="error" compact title=\{told\.fix\} \/>/u);
});

test('a link is said without the id it is held as, which names nothing to a reader', () => {
  const at = '2026-09-17T00:00:00.000Z';
  const ulid = '01M2PAZRWJZEGEEV41P8PR2H2Y';
  assert.equal(noteOf('tickets', { ts: at, actor: 'p_1', kind: 'edit', field: 'cycle', from: null, to: `cycles#${ulid}` }), 'cycle set');
  assert.equal(noteOf('tickets', { ts: at, actor: 'p_1', kind: 'edit', field: 'cycle', from: ulid, to: '01M2PAZRWJZEGEEV41P8PR2H2Z' }), 'cycle changed');
  assert.equal(noteOf('tickets', { ts: at, actor: 'p_1', kind: 'edit', field: 'cycle', from: ulid, to: null }), 'cycle cleared');
});

test('WHO DID IT IS SAID BY NAME, and never as a person\'s id: You, the name the record has, or Someone on this record', () => {
  const me = 'p_01M2PAKF00EG11XPVBJ3PM4ZN8';
  const other = 'p_01M2PAZ28BN3FTKQB266DVT4HX';
  const stranger = 'p_01M2PB0000000000000000000A';
  const names = new Map([[other, 'Ada Lovelace']]);
  assert.deepEqual(whoDid(me, me, names), { name: 'You', you: true, person: true });
  assert.deepEqual(whoDid(other, me, names), { name: 'Ada Lovelace', you: false, person: true });
  assert.deepEqual(whoDid(stranger, me, names), { name: 'Someone on this record', you: false, person: true });
  assert.deepEqual(whoDid(stranger, null), { name: 'Someone on this record', you: false, person: true });
  assert.equal(whoDid('rule.renewal', me).name, 'renewal rule');
  assert.equal(whoDid('agent:claude', me).name, 'claude');
  assert.equal(whoDid('you', null).you, true, 'the sample\'s own writes are not the reader\'s');
});

test('THE NAMES ARE THE MEMBERS THE RECORD ANSWERS, and a refusal is no names rather than an error', async () => {
  const members = [
    { person_id: 'p_01M2PAZ28BN3FTKQB266DVT4HX', name: 'Ada Lovelace', email: null, level: 'owner', scoped: [], seen_at: null, suspended_at: null },
    { person_id: 'p_01M2PB0000000000000000000A', name: '  ', email: null, level: 'read', scoped: [], seen_at: null, suspended_at: null },
  ];
  const answered = await readNames('https://x.example', (async () => new Response(JSON.stringify({ ok: true, value: members }), { status: 200, headers: { 'content-type': 'application/json' } })) as never);
  assert.deepEqual([...answered], [['p_01M2PAZ28BN3FTKQB266DVT4HX', 'Ada Lovelace']]);
  const refused = await readNames('https://x.example', (async () => new Response(JSON.stringify({ ok: false, refusal: { code: 'FORBIDDEN', fix: 'Owners only.' } }), { status: 403, headers: { 'content-type': 'application/json' } })) as never);
  assert.equal(refused.size, 0);
});

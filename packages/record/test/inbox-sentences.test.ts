/**
 * No refusal the inbox or the triage door gives says "no token".
 *
 * WHY THIS FILE EXISTS. The inbox's refusal to a token was `allows`'s "This needs owner, and no token reaches it. A
 * person has to do it, signed in." It stopped being true the day the `inbox` reach was made: a token its owner gave
 * the reach does read the inbox, and an agent's owner told "no token reaches it" went looking for a person to sign in
 * when one flag on the token was all it lacked ("Once minting lands, that sentence should name the inbox
 * reach instead."). Batch 88 changed the sentence; this holds every refusal of both doors to it, so a new branch that
 * falls back on `allows`'s wording turns this red.
 *
 * WHAT IS ASKED. Every caller a record meets (owner, writer, reader, stranger, an invited member of one list, tokens of
 * every scope with and without the reach, a token held to one list, a token whose person was moved down) against
 * every shape of call each door takes, good and bad. Every refusal's sentence is kept, and none may say "no token".
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 14, 9);

const OBLIGATIONS = {
  id: 'register.obligations',
  kind: 'register' as const,
  body: { id: 'obligations', name: 'Obligations', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never,
};

const token = (scope: 'read' | 'propose' | 'write', level: 'owner' | 'write' | 'read' | null, reach?: readonly 'inbox'[]): CallContext => ({
  principal: { kind: 'token', id: `t_${scope}_${String(level)}_${reach ? 'reach' : 'none'}`, scope, person: 'p_1', level, ...(reach ? { reach } : {}) },
  session: { agent: 'claude', client: 'inbox-sentences-test' },
});

/** Every caller a record meets, by what it is. */
const CALLERS: [string, CallContext][] = [
  ['the owner', { principal: { kind: 'person', id: 'p_1', level: 'owner' } }],
  ['a writer', { principal: { kind: 'person', id: 'p_2', level: 'write' } }],
  ['a reader', { principal: { kind: 'person', id: 'p_3', level: 'read' } }],
  ['a stranger', { principal: { kind: 'person', id: 'p_9', level: null } }],
  ['a member of one list', { principal: { kind: 'person', id: 'p_4', level: null }, registers: ['obligations'] }],
  ...(['read', 'propose', 'write'] as const).flatMap((scope): [string, CallContext][] => [
    [`a ${scope} token with the reach`, token(scope, 'owner', ['inbox'])],
    [`a ${scope} token without it`, token(scope, 'owner')],
    [`a ${scope} token with the reach held to one list`, { ...token(scope, 'owner', ['inbox']), registers: ['obligations'] }],
    [`a ${scope} token with the reach whose person is a writer now`, token(scope, 'write', ['inbox'])],
    [`a ${scope} token whose person holds nothing`, token(scope, null, ['inbox'])],
  ]),
];

test('NO REFUSAL THE INBOX OR THE TRIAGE DOOR GIVES SAYS "no token", for any caller and any call', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  assert.ok((await api.kernel.install([OBLIGATIONS])).ok);
  assert.ok(
    api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok,
  );
  const ids: string[] = [];
  for (const n of [1, 2]) {
    const out = api.kernel.arrive({ channel: 'webhook', headers: { From: 'BANK', Subject: `Text ${n}` }, body: `Debit ${n}`, sha256: `s${n}` });
    assert.ok(out.ok, JSON.stringify(out));
    ids.push(out.value.raw);
  }
  const reads: unknown[] = [
    undefined,
    { state: 'all' },
    { state: 'skipped', limit: 5 },
    { state: 'nowhere' },
    { digest: true },
    { digest: 'yes' },
    { digest: true, state: 'all' },
    { id: ids[0] },
    { id: 'no-such-arrival' },
    { id: '' },
    { id: ids[0], digest: true },
    { colour: 'red' },
  ];
  const triages: unknown[] = [
    { arrival: ids[1], register: 'obligations', fields: { what: 'Water' } },
    { arrival: ids[1], register: 'nowhere' },
    { arrival: ids[1], ignore: true },
    { arrival: ids[1], back: true },
    { arrival: ids[1], back: true, version: 0 },
    { arrival: ids[1], register: 'obligations', ignore: true },
    { arrival: ids[1] },
    { arrival: '' },
    { arrival: 'no-such-arrival', ignore: true },
    { arrival: ids[1], ignore: true, note: 'x' },
    { arrival: ids[1], register: 'obligations', version: 2 },
    { colour: 'red' },
  ];
  const said = new Map<string, string>();
  let refused = 0;
  for (const [who, ctx] of CALLERS) {
    for (const args of reads) {
      const out = await api.inbox(args as never, ctx);
      if (!out.ok && 'refusal' in out) {
        refused++;
        said.set(out.refusal.fix, `${who}, inbox ${JSON.stringify(args)}`);
      }
    }
    for (const args of triages) {
      const out = await api.triage(args as never, ctx);
      if (!out.ok && 'refusal' in out) {
        refused++;
        said.set(out.refusal.fix, `${who}, triage ${JSON.stringify(args)}`);
      }
    }
  }
  /* AND IT ASKED ENOUGH TO MEAN SOMETHING: both doors' refusals to a token, a person, a held caller and a bad call. */
  assert.ok(refused > 200, `only ${String(refused)} refusals were given`);
  assert.ok(said.size >= 15, `only ${String(said.size)} different sentences were given: ${[...said.keys()].join(' | ')}`);
  const fixes = [...said.keys()];
  assert.ok(fixes.some((f) => f.startsWith('Reading the inbox needs a token its owner gave the inbox reach.')), 'the inbox never said its own sentence');
  assert.ok(fixes.some((f) => f === 'Triage needs a token its owner gave the inbox reach. The owner mints one with braindog token create --inbox.'), 'the door never said its own sentence');
  const wrong = [...said].filter(([fix]) => /no token/i.test(fix)).map(([fix, where]) => `${where}: ${fix}`);
  assert.deepEqual(wrong, [], 'a refusal said "no token"');
  sql.close();
});

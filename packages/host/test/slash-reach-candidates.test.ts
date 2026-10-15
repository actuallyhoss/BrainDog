/**
 * THE DAILY LOOK IS HANDED THE REACH CANDIDATES (ENG-B20 job 3). The one `look` ask a day carries the add-ons and skills
 * `packages/record/src/reach.ts` found, as `reach`, beside how the record is used, and the instructions say in one line
 * to rank them with the rest and never invent one. No new ask: the same `draft` the look already sends. And nothing is
 * asked while his switch for Slash reading on its own is off (`mayThink`), through the fake adapter only.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRecordApi, type CallContext } from '@braindog/record';
import { BANKS } from '../../../fixtures/names.ts';
import { addonOffers } from '../../record/src/reach.ts';
import { endpointModel, SLASH_INSTRUCTIONS } from '../src/slash.ts';
import { slashRecordMeter } from '../src/slash-ask.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const URL_ = 'http://localhost:11434/v1/chat/completions';
const DAY = 86_400_000;
const T0 = Date.UTC(2026, 8, 1, 9);
const OWNER: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' }, credentialed: true };

/** The fake adapter: every request it is handed is kept, and each is answered with no drafts. */
function endpoint() {
  const sent: { system: string; user: unknown }[] = [];
  const send = async (_url: URL, init: RequestInit): Promise<Response> => {
    const body = JSON.parse(String(init.body)) as { messages: { role: string; content: string }[] };
    sent.push({ system: body.messages[0]!.content, user: JSON.parse(body.messages[1]!.content) });
    return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: '{"drafts":[]}' } }] }), { status: 200 });
  };
  return { sent, send };
}

/** The candidates as the record would hand them: an add-on offer for six figures on rates three weeks old. */
const candidates = () =>
  addonOffers(
    {
      catalogue: [{ id: 'dawn-rates-feed', title: `${BANKS[2]} rates`, keeps: [{ list: 'xr_role', everyMs: DAY }], shapes: [], needsKey: false }],
      installed: [],
      lists: [{ list: 'xr', role: 'xr_role', name: 'Rates', newest: '2026-09-28', rows: 31 }],
      figures: Array.from({ length: 6 }, (_, i) => ({ id: `fig_${i}`, reads: 'xr', oldest: '2026-09-28' })),
      arrivals: [],
    },
    Date.parse('2026-10-19T12:00:00Z'),
  ).map(({ key, title, why, change }) => ({ key, title, why, change }));

test('THE CANDIDATES REACH THE LOOK ASK BESIDE THE USAGE, under the one line that says rank them and invent none', async () => {
  const reach = candidates();
  assert.equal(reach.length, 1);
  const net = endpoint();
  const model = endpointModel({ url: URL_, send: net.send });
  const input = { usage: { lists: [] }, noticed: [], rules: [], offered: [], kinds: ['pack', 'settings', 'arrange', 'change'], most: 3, reach } as never;
  await model.draft(input);
  assert.equal(net.sent.length, 1, 'the look sent more or fewer than one ask');
  const [call] = net.sent;
  assert.equal(call!.system, SLASH_INSTRUCTIONS);
  const line = SLASH_INSTRUCTIONS.split('\n').filter((l) => l.includes('`reach`'));
  assert.equal(line.length, 1, 'the reach candidates are not explained in exactly one line');
  assert.match(line[0]!, /rank them with the rest/u);
  assert.match(line[0]!, /never invent one/u);
  assert.ok(!/[—]/u.test(line[0]!), 'an em dash in what the model is told');
  assert.deepEqual((call!.user as { reach: unknown }).reach, reach);
  assert.equal((call!.user as { reach: { why: string }[] }).reach[0]!.why, '6 figures here use rates from 28 September.');
});

const CALL = `CREATE TABLE slash_call (
  id TEXT PRIMARY KEY, ts TEXT NOT NULL, kind TEXT NOT NULL, tier TEXT NOT NULL, model TEXT NOT NULL,
  tokens_in INTEGER NOT NULL, tokens_out INTEGER NOT NULL, neurons INTEGER NOT NULL, ms INTEGER NOT NULL,
  status TEXT NOT NULL, code TEXT, question TEXT, predicate TEXT, read TEXT NOT NULL DEFAULT '[]', filed TEXT,
  purpose TEXT NOT NULL DEFAULT 'ask', spends TEXT NOT NULL DEFAULT 'person' CHECK (spends IN ('person','background','none')))`;

const TASKS = {
  id: 'register.tasks',
  kind: 'register' as const,
  body: { id: 'tasks', name: 'Tasks', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never,
};

/** A record twenty days old with its owner's use on five days, so the look advises it, over the fake adapter. */
async function record(reads: () => boolean) {
  const sql = openSqlite();
  const ledger = openSqlite();
  ledger.exec(CALL);
  const clock = fixedClock(T0);
  const net = endpoint();
  const engine = { status: () => ({ tier: 'a', model: '', asks: { used: 0, cap: 20, resets: '2026-10-01T00:00:00.000Z', capped: true } }) };
  const slashMeter = slashRecordMeter({ sql: ledger, clock, engine: async () => engine, model: 'test-model', reads });
  const api = await createRecordApi({ sql, clock, slashModel: endpointModel({ url: URL_, send: net.send }), slashMeter });
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAF', slug: 'kiln-books', name: 'Kiln Books', tz: 'UTC', locale: 'en', owner: { id: 'p_owner' } }).ok);
  assert.ok((await api.kernel.install([TASKS])).ok);
  for (const day of [0, 3, 6, 9, 12]) {
    clock.set(T0 + day * DAY);
    assert.ok((await api.create({ register: 'tasks', fields: { what: `Glaze batch ${day}` } }, OWNER)).ok);
  }
  clock.set(T0 + 20 * DAY);
  return { api, net, ledger };
}

test('NOTHING IS ASKED WITHOUT HIS SWITCH: off, the daily look sends no request and holds no row; on, the look asks once', async () => {
  const off = await record(() => false);
  await off.api.slashTick();
  assert.deepEqual(off.net.sent, [], 'a request left with his switch off');
  assert.equal(off.ledger.all('SELECT 1 FROM slash_call').length, 0, 'a row was held with his switch off');

  const on = await record(() => true);
  await on.api.slashTick();
  const looks = on.net.sent.filter((s) => s.system === SLASH_INSTRUCTIONS);
  assert.equal(looks.length, 1, `the look asked ${looks.length} times`);
  assert.ok(on.ledger.all<{ purpose: string }>('SELECT purpose FROM slash_call').some((r) => r.purpose === 'look'), 'the look held no row of its own');
});

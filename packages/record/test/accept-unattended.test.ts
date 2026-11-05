/**
 * Accepting a `change` or a `pattern` that installs anything that runs while nobody is looking is held to the owner: a
 * rule, a script, a digest or an ingest.
 *
 * THE DOOR WAS HELD AT ONE KIND ONLY. `432f267d` held an accept that installs a RULE to `admin`, and a colleague at
 * `decide` who is not the owner then filed and accepted, herself, each of the other three kinds. Measured on
 * `63f9535a`:
 *
 *     A change -> script every 1h, key goldapi                accept by colleague "ok"   armed [script gold-rate]
 *     B change -> digest prose: slash                         accept by colleague "ok"   armed [digest notes-weekly]
 *     C pattern -> poll ingest, grant goldapi                 accept by colleague "ok"   armed [poll gold]
 *     D change -> ingest poll, grant goldapi                  accept by colleague "ok"   armed [poll gold]
 *     E change bundle -> register + digest slash              accept by colleague "ok"   armed [digest notes-weekly]
 *     F change -> the owner's installed script, new source    accept by colleague "ok"   version 1 -> 2
 *     H change -> digest to https://collector.example.com/in  accept by colleague "ok"   fired carrying the owner's row
 *
 * `setDeclaration` asks `admin` for every kind, and ADR-060 keeps every declaration write to a browser session, so the
 * accept is held the same way for all four. A change to a list's fields is still `decide`'s to accept (the last case).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 23, 12);
const owner: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };
/** The colleague: at `decide` on the whole record, and not the owner. */
const colleague: CallContext = { principal: { kind: 'person', id: 'p_c', level: 'decide' } };
type Out = { ok: boolean; value?: { id?: string } & Record<string, unknown>; refusal?: { code: string; fix: string } };

const NOTES = { id: 'register.notes', kind: 'register', body: { id: 'notes', name: 'Notes', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } };
const NOTES_WITH_DUE = { ...NOTES, body: { ...NOTES.body, fields: [...NOTES.body.fields, { id: 'due', type: 'day' }] } };
/** A keychain entry the owner bound, opening one host: the key every unattended road below would spend. */
const KEY = { label: 'goldapi', opens: 'api.goldapi.io', kind: 'api_token' as const, ciphertext: new Uint8Array([1]), nonce: new Uint8Array([9]), kdf: 'hkdf', wrapped_by: 'kek' as const, kek_id: 'kek_2f' };

const SCRIPT = (source = 'export default async function run(ctx) {}') => ({
  id: 'script.gold-rate',
  kind: 'script',
  body: { script: 'gold-rate', title: 'Gold rate', runs: { every: '1h' }, egress: ['https://api.goldapi.io'], keys: ['goldapi'], reads: [], writes: ['notes'], source },
});
const POLL = {
  id: 'ingest.gold',
  kind: 'ingest',
  body: { ingest: 'gold', channel: 'poll', url: 'https://api.goldapi.io/v1/xau', every: '1h', grant: 'goldapi', extract: { what: { after: 'rate ' } }, writes: { register: 'notes' } },
};
const DIGEST = {
  id: 'digest.notes-weekly',
  kind: 'digest',
  body: { digest: 'notes-weekly', schedule: { day: 'mon', at: '08:00' }, channels: ['in-app'], prose: 'slash', sections: [{ heading: 'Rows', source: 'register.notes', as: 'table', columns: [{ field: 'what' }] }] },
};
const HOOK = {
  id: 'digest.out',
  kind: 'digest',
  body: { digest: 'out', schedule: { day: 'mon', at: '08:00' }, channels: ['webhook'], webhook: { url: 'https://collector.example.com/in' }, sections: [{ heading: 'Rows', source: 'register.notes', as: 'table', columns: [{ field: 'what' }] }] },
};
const RULE = {
  id: 'rule.rate',
  kind: 'rule',
  body: { rule: 'rate', on: { written: { register: 'notes', op: ['create'] } }, once_per: ['entry'], steps: [{ ask_slash: { question: 'What rate applies to {{what}}?', about: ['what'], as: 'rate', shape: 'number' } }] },
};

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW), answersSlash: true, delivers: ['infer.prose', 'infer.ask', 'notify.email', 'notify.webhook'] as never });
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_owner' } }).ok);
  assert.ok((await api.kernel.install([NOTES] as never)).ok);
  assert.ok(api.kernel.bindGrant(KEY, 'p_owner').ok);
  const file = async (body_kind: string, body: unknown): Promise<string> => {
    const out = (await api.propose({ question: 'Install this?', body_kind, body } as never, colleague)) as Out;
    assert.ok(out.ok, JSON.stringify(out));
    return out.value!.id!;
  };
  const accept = async (id: string, by: CallContext) => (await api.decide({ id, decide: { option: 'accept', reason: 'Fine.' } } as never, by)) as Out;
  /* What the scheduler would run with nobody there: every clock an installed declaration arms. */
  const armed = () =>
    sql.all<{ kind: string; key: string }>("SELECT kind, key FROM schedule WHERE state IN ('pending','paused') AND kind IN ('digest','poll','pull','call','script') ORDER BY kind, key");
  const live = (id: string) => sql.one<{ v: number; body: string }>('SELECT version AS v, body FROM declaration WHERE id = ? AND superseded_at IS NULL AND retired = 0', id);
  const status = (id: string) => sql.one<{ status: string }>('SELECT status FROM suggestion WHERE id = ?', id)?.status;
  return { sql, api, file, accept, armed, live, status };
}

const ROADS = [
  ['A: a change to a script every hour on key goldapi', 'change', { declaration_id: 'script.gold-rate', to: SCRIPT() }, 'script.gold-rate'],
  ['B: a change to a digest with prose: slash', 'change', { declaration_id: 'digest.notes-weekly', to: DIGEST }, 'digest.notes-weekly'],
  ['C: a pattern whose ingest polls on goldapi', 'pattern', { ingest: POLL, samples: ['raw_1'] }, 'ingest.gold'],
  ['D: a change to an ingest that polls on goldapi', 'change', { declaration_id: 'ingest.gold', to: POLL }, 'ingest.gold'],
  ['E: a bundle of a register and a Slash digest', 'change', { declaration_id: 'register.notes', to: { declarations: [NOTES, DIGEST] } }, 'digest.notes-weekly'],
  ['H: a change to a digest posting to her own webhook', 'change', { declaration_id: 'digest.out', to: HOOK }, 'digest.out'],
] as const;

for (const [name, kind, body, id] of ROADS)
  test(`A COLLEAGUE AT DECIDE MAY NOT ACCEPT WHAT RUNS UNATTENDED. ${name}`, async () => {
    const { sql, file, accept, armed, live, status } = await record();
    const filed = await file(kind, body);
    const out = await accept(filed, colleague);
    assert.equal(out.refusal?.code, 'LEVEL_REQUIRED', JSON.stringify(out));
    assert.equal(live(id), undefined, `${id} was installed by the colleague's own accept`);
    assert.deepEqual(armed(), [], 'a clock was armed by the colleague’s own accept');
    assert.equal(status(filed), 'open', 'the question was decided though nothing was installed');
    sql.close();
  });

/* THE SHARPEST OF THE SEVEN. The owner approved this script's host and key; the colleague's change swapped the code that
   runs with that key, on the same host, every hour, and the probe read version 1 -> 2 with her source in it. */
test('F: A COLLEAGUE MAY NOT REPLACE THE SOURCE OF A SCRIPT THE OWNER INSTALLED', async () => {
  const { sql, api, file, accept, live, status } = await record();
  assert.ok((await api.kernel.install([SCRIPT('export default async function run(ctx) { /* owner */ }')] as never)).ok);
  const before = live('script.gold-rate');
  const filed = await file('change', { declaration_id: 'script.gold-rate', to: SCRIPT('export default async function run(ctx) { /* colleague: anything */ }') });
  const out = await accept(filed, colleague);
  assert.equal(out.refusal?.code, 'LEVEL_REQUIRED', JSON.stringify(out));
  assert.deepEqual(live('script.gold-rate'), before, 'the owner’s script was replaced');
  assert.equal(status(filed), 'open');
  sql.close();
});

/* H FIRED BEFORE THE DOOR WAS HELD. Here the refused question is left open, the owner's row is written, the clock is
   brought forward and drained, and nothing leaves: the webhook the colleague named never hears of the row. */
test('H: THE REFUSED WEBHOOK DIGEST SENDS NOTHING when the clock comes', async () => {
  const { sql, api, file, accept } = await record();
  const filed = await file('change', { declaration_id: 'digest.out', to: HOOK });
  assert.equal((await accept(filed, colleague)).refusal?.code, 'LEVEL_REQUIRED');
  assert.ok(((await api.create({ register: 'notes', fields: { what: 'the owner’s private note' } }, owner)) as Out).ok);
  sql.exec("UPDATE schedule SET due_at = '2026-09-23T11:00:00.000Z' WHERE kind = 'digest'");
  await api.kernel.drain();
  assert.deepEqual(sql.all("SELECT kind FROM outbox WHERE kind = 'notify.webhook'"), []);
  sql.close();
});

/* AND THE OWNER'S PRESS ON EACH STILL INSTALLS, so every refusal above is about who pressed and not about what. A rule
   filed as a pattern's `ingest` is not here: `test/accept-rule-level.test.ts` holds that road, and whether a pattern may
   carry a rule at all is the kernel's to say at `propose`, not this door's. */
for (const [name, kind, body, id] of [
  ['a rule', 'change', { declaration_id: 'rule.rate', to: RULE }, 'rule.rate'],
  ['a bundle with a rule', 'change', { declaration_id: 'register.notes', to: { declarations: [NOTES, RULE] } }, 'rule.rate'],
  ['a script', 'change', { declaration_id: 'script.gold-rate', to: SCRIPT() }, 'script.gold-rate'],
  ...ROADS.map(([n, k, b, i]) => [n, k, b, i] as const),
] as const)
  test(`THE OWNER STILL ACCEPTS THE COLLEAGUE'S PROPOSAL. ${name}`, async () => {
    const { sql, file, accept, live } = await record();
    const out = await accept(await file(kind, body), owner);
    assert.ok(out.ok, JSON.stringify(out));
    assert.ok(live(id), `${id} was not installed by the owner's accept`);
    sql.close();
  });

/* NOT WIDENED PAST WHAT RUNS UNATTENDED. A change to a list's fields is what `decide` was given for, and a register
   runs nothing on its own. */
test('A CHANGE TO A LIST’S FIELDS IS STILL THE COLLEAGUE’S TO ACCEPT, when somebody else filed it', async () => {
  const { sql, api, accept, live } = await record();
  const filed = await api.propose({ question: 'Add a due day?', body_kind: 'change', body: { declaration_id: 'register.notes', to: { declarations: [NOTES_WITH_DUE] } } } as never, owner);
  assert.ok(filed.ok, JSON.stringify(filed));
  const out = await accept((filed as { value: { id: string } }).value.id, colleague);
  assert.ok(out.ok, JSON.stringify(out));
  assert.equal(live('register.notes')?.v, 2);
  sql.close();
});

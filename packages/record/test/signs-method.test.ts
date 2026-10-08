/**
 * `signs`: the record's vital signs read through the record (PRF-A01), the door `braindog signs`, the Health page and an
 * agent all read them by.
 *
 * What is asserted is the door, not the readers, which are the kernel's (`kernel/test/signs-read.test.ts`): every
 * sign comes back with a state each, a read writes nothing and opens no run, and a caller held to part of the record is
 * told so rather than shown the whole.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { VITAL_SIGNS } from '@braindog/kernel';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 8, 12);

/** Every sign on the closed list, the kernel's five and the four filed (`VITAL_SIGNS` in `packages/kernel/src/signs.ts`). */
const EVERY = VITAL_SIGNS.map((s) => s.sign);

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  return { api, sql };
}

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const agent: CallContext = {
  principal: { kind: 'token', id: 'tok_1', scope: 'read', person: 'p_1', level: 'owner' },
  session: { client_id: 'claude-run-1', agent: 'claude', host: 'dev-pc', repo: 'kiln' },
};

/** The signs out of an answer, however the kernel holds them: a list, or an object with one under `signs`. */
const signsOf = (value: unknown): { sign?: string; id?: string; state?: string }[] => {
  if (Array.isArray(value)) return value as never;
  const held = (value as { signs?: unknown } | null)?.signs;
  return Array.isArray(held) ? (held as never) : [];
};

/** Everything a read could have written: rows, history lines and the signs' own readings. */
const written = (sql: NodeSql) => ({
  entries: sql.one<{ n: number }>('SELECT COUNT(*) AS n FROM entry')!.n,
  events: sql.one<{ n: number }>('SELECT COUNT(*) AS n FROM event')!.n,
});

test('THE OWNER AND HER AGENT READ EVERY SIGN, each with a state, and the read writes nothing and opens no run', async () => {
  const { api, sql } = await record();
  const before = written(sql);
  for (const who of [owner, agent]) {
    const out = await api.signs({}, who);
    assert.ok(out.ok, JSON.stringify(out));
    const signs = signsOf(out.value);
    assert.deepEqual(signs.map((s) => s.sign ?? s.id).sort(), [...EVERY].sort());
    for (const s of signs) assert.ok(['green', 'red', 'none'].includes(String(s.state)), `${String(s.sign ?? s.id)} reads ${String(s.state)}`);
  }
  assert.deepEqual(written(sql), before);
  assert.equal(sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM entry WHERE register = 'session'")!.n, 0);
  sql.close();
});

test('A CALLER HELD TO PART OF THE RECORD, OR WHO MAY ONLY ADD, IS TOLD SO in one sentence and shown nothing', async () => {
  const { api, sql } = await record();
  const narrow: CallContext = { ...owner, principal: { kind: 'person', id: 'p_2', level: 'write' }, registers: ['tasks'] };
  const adder: CallContext = { principal: { kind: 'person', id: 'p_3', level: 'append' } };
  /* One who reads only Tasks is held by this door; one who may only add is held by the read guard before it. */
  for (const [who, code] of [[narrow, 'FORBIDDEN'], [adder, 'LEVEL_REQUIRED']] as const) {
    const out = await api.signs({}, who);
    assert.equal(out.ok, false);
    const refusal = (out as { refusal: { code: string; fix: string } }).refusal;
    assert.equal(refusal.code, code);
    assert.doesNotMatch(refusal.fix, /—/u);
  }
  sql.close();
});

/* ── the inbox's words ─────────────────────────────────────────────────── */

/** What the bank's texts say when no account holds the card they name: inbox text, which only the inbox's reach reads. */
const SAYS = 'No account has 1234 in Digits the bank prints.';
const ASKED = 'Fire the kiln on Friday?';

/** A record with three texts held two days in the inbox for one reason, and two open questions about one thing. */
async function busy() {
  const r = await record();
  for (let i = 0; i < 3; i++)
    r.sql.exec(
      "INSERT INTO inbox_raw (id, ts, channel, body, sha256, state, reason) VALUES (?, ?, 'api', ?, ?, 'review', ?)",
      `raw_${String(i)}`,
      new Date(NOW - 2 * 24 * 3_600_000).toISOString(),
      `CARD 1234 SHOP ${String(i)}`,
      `sha_${String(i)}`,
      SAYS,
    );
  const options = { options: [{ id: 'yes', label: 'Yes', because: 'It is due' }, { id: 'no', label: 'No', because: 'It is not' }], about: 'kiln' };
  for (const question of [ASKED, 'Fire the kiln on Saturday?']) {
    const asked = await r.api.propose({ question, body_kind: 'options', body: options } as never, owner);
    assert.ok(asked.ok, JSON.stringify(asked));
  }
  return r;
}

type Read = { sign: string; state: string; value: number | null; said: string; facts: string[]; days: unknown[] };
const read = async (api: Awaited<ReturnType<typeof record>>['api'], who: CallContext): Promise<Read[]> => {
  const out = await api.signs({}, who);
  assert.ok(out.ok, JSON.stringify(out));
  return signsOf(out.value) as Read[];
};

test('THE INBOX’S WORDS GO ONLY TO A CALLER WHO MAY READ THE INBOX: an owner and a token given the inbox reach read them, a whole-record token reads the state and number alone', async () => {
  const { api, sql } = await busy();
  const reached: CallContext = { ...agent, principal: { ...agent.principal, reach: ['inbox'] } as CallContext['principal'] };
  /* A REACH OF THE WRONG SHAPE IS NO REACH: `includes` is a string's too. */
  const stringy: CallContext = { ...agent, principal: { ...agent.principal, reach: 'no-inbox' } as unknown as CallContext['principal'] };

  for (const who of [owner, reached]) {
    const signs = await read(api, who);
    const arrivals = signs.find((s) => s.sign === 'arrivals-filed')!;
    assert.equal(arrivals.state, 'red');
    assert.match(arrivals.said, new RegExp(`Most say: ${SAYS.replace(/\./g, '\\.')}`));
    const causes = signs.find((s) => s.sign === 'questions-by-cause')!;
    assert.equal(causes.state, 'red');
    assert.match(causes.said, /Fire the kiln on Friday\?/);
    assert.ok(signs.find((s) => s.sign === 'oldest-question')!.facts.some((f) => f.includes(ASKED)));
  }

  const full = await read(api, owner);
  /* A PERSON BELOW OWNER READS THE WHOLE RECORD AND NOT THE INBOX, as `inbox` refuses her. */
  const decider: CallContext = { principal: { kind: 'person', id: 'p_2', level: 'decide' } };
  for (const who of [agent, stringy, decider]) {
    /* NOWHERE IN THE ANSWER, not only in the sentences and facts. */
    const answer = await api.signs({}, who);
    assert.doesNotMatch(JSON.stringify(answer), /1234|Most say|kiln|Digits/u);
    const signs = await read(api, who);
    /* EVERY SIGN STILL COMES BACK, with the owner's state, number and days; only the words are held. */
    assert.deepEqual(signs.map((s) => [s.sign, s.state, s.value, s.days.length]), full.map((s) => [s.sign, s.state, s.value, s.days.length]));
    for (const s of signs) {
      assert.deepEqual(s.facts, [], `${s.sign} handed its facts to a caller without the inbox reach`);
      assert.doesNotMatch(s.said, /1234|Most say|kiln/u, `${s.sign} said ${s.said}`);
      assert.doesNotMatch(s.said, /—/u);
      assert.ok(s.said.length > 0, `${s.sign} said nothing`);
    }
    assert.equal(signs.find((s) => s.sign === 'arrivals-filed')!.said, 'Messages wait to be filed.');
    assert.equal(signs.find((s) => s.sign === 'questions-by-cause')!.said, 'Open questions pile up on one cause, or carry none.');
  }
  sql.close();
});

test('A SIGN READ NONE KEEPS ITS OWN SENTENCE for a caller without the inbox reach, which says what is missing and quotes nothing', async () => {
  const { api, sql } = await record();
  const full = await read(api, owner);
  const held = await read(api, agent);
  for (const id of ['arrivals-filed', 'questions-by-cause']) {
    const mine = full.find((s) => s.sign === id)!;
    assert.equal(mine.state, 'none');
    assert.equal(held.find((s) => s.sign === id)!.said, mine.said, `${id} told a token something other than what is missing`);
  }
  sql.close();
});

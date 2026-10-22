/**
 * A question answered by the person's press on the decision card inside Claude or ChatGPT (`methods/chat-answer.ts`).
 *
 * WHAT IS HELD: a grant is minted only for a key Claude or ChatGPT holds after the owner signed in to it, only while his
 * "Answer from inside chat apps" is on, and only for a choice or a set of rows; without a grant nothing is answered, and
 * the refusal sends the model to the card; a grant answers one press, by the key it was drawn for, inside fifteen minutes,
 * for an option the card showed on the question as it was; the press is the owner's own `decide`, and the decision keeps
 * where it was pressed; a press can never reach what `admin` holds; and only an owner in a browser turns the switch on.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { appOf, GRANT_FOR } from '../src/methods/chat-answer.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { NOW, installSeed } from '../../seed/src/index.ts';

const MIN = 60_000;

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const refusal = (r: unknown): { code: string; fix: string; at?: string } => {
  const x = r as { ok: boolean; refusal?: { code: string; fix: string; at?: string } };
  assert.equal(x.ok, false, 'the call went through');
  return x.refusal!;
};

const owner: CallContext = { principal: { kind: 'person', id: 'p_seed', level: 'owner' } };

/** A key's call: Claude's, signed in at claude.ai, unless another key is named. */
const key = (id = 'tok_claude'): CallContext => ({ principal: { kind: 'token', id, scope: 'write', person: 'p_seed', level: 'owner' } });

type Api = Awaited<ReturnType<typeof createRecordApi>> & {
  chatApp(args: unknown, ctx: CallContext): Promise<unknown>;
  chatAnswerMint(args: unknown, ctx: CallContext): Promise<unknown>;
  chatAnswer(args: unknown, ctx: CallContext): Promise<unknown>;
};

async function record() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = (await createRecordApi({ sql, clock })) as Api;
  value(await installSeed(api.kernel));
  sql.exec("INSERT OR REPLACE INTO person (id, email, name) VALUES ('p_seed', 'teo@vance-studio.example', 'Teodor')");
  sql.exec("INSERT OR REPLACE INTO member (person_id, register, level) VALUES ('p_seed', '*', 'owner')");
  const made = new Date(NOW).toISOString();
  for (const [id, kind, host] of [
    ['tok_claude', 'cimd', 'claude.ai'],
    ['tok_chatgpt', 'dcr', 'chatgpt.com'],
    ['tok_cli', 'device', 'kiln-mbp'],
    ['tok_other', 'dcr', 'example.com'],
  ] as const)
    sql.exec(
      'INSERT INTO token (id, person_id, hash, scope, label, created_at, client_id, client_kind, host) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      id,
      'p_seed',
      `hash-${id}`,
      'write',
      id,
      made,
      `client-${id}`,
      kind,
      host,
    );
  clock.advance(MIN);
  return { api, sql, clock };
}

/** A question of two options, filed by an agent's key, answering its id. */
async function asked(api: Api, question = 'Ship Friday or wait?'): Promise<string> {
  const filed = value<{ id: string }>(
    await api.propose(
      {
        question,
        body_kind: 'options',
        body: { options: [{ id: 'ship', label: 'Ship Friday', because: 'It is ready.' }, { id: 'wait', label: 'Wait a week', because: 'Safer.' }] },
      } as never,
      key('tok_cli'),
    ),
  );
  return filed.id;
}

const switchOn = async (api: Api) => value(await api.setPref({ key: 'agents.answer_in_chat', value: true }, owner));

test('the app is named from the address the door proved, and only Claude and ChatGPT are', () => {
  assert.equal(appOf('cimd', 'claude.ai'), 'Claude');
  assert.equal(appOf('dcr', 'chatgpt.com'), 'ChatGPT');
  assert.equal(appOf('cimd', 'www.claude.ai:443'), 'Claude');
  assert.equal(appOf('device', 'claude.ai'), null, 'a key on a machine is never one, whatever its host says');
  assert.equal(appOf('key', null), null);
  assert.equal(appOf('dcr', null), null, 'an app on the person’s own machine has no address to name');
  assert.equal(appOf('dcr', 'notclaude.ai'), null);
  assert.equal(appOf('dcr', 'example.com'), null);
});

test('OFF UNTIL HE TURNS IT ON: no grant while the switch is off, and only an owner in a browser turns it on', async () => {
  const { api } = await record();
  const id = await asked(api);
  const off = refusal(await api.chatAnswerMint({ id, options: ['ship', 'wait'] }, key()));
  assert.equal(off.code, 'FORBIDDEN');
  assert.match(off.fix, /Settings > Agents/u);
  /* NO AGENT TURNS IT ON FOR ITSELF. */
  assert.equal(refusal(await api.setPref({ key: 'agents.answer_in_chat', value: true }, key())).code, 'FORBIDDEN');
  assert.equal(refusal(await api.setPref({ key: 'agents.answer_in_chat', value: 'yes' }, owner)).code, 'VALUE_MALFORMED');
  await switchOn(api);
  assert.equal(api.kernel.prefsOf('p_seed')['agents.answer_in_chat'], true);
});

test('ONLY A CHAT APP’S KEY IS MINTED A GRANT: never a person, a key on a machine, or an app of another address', async () => {
  const { api, clock } = await record();
  const id = await asked(api);
  await switchOn(api);
  assert.equal(refusal(await api.chatAnswerMint({ id, options: ['ship'] }, owner)).code, 'FORBIDDEN');
  assert.equal(refusal(await api.chatAnswerMint({ id, options: ['ship'] }, key('tok_cli'))).code, 'FORBIDDEN', 'an agent with a shell holds this key');
  assert.equal(refusal(await api.chatAnswerMint({ id, options: ['ship'] }, key('tok_other'))).code, 'FORBIDDEN');
  const minted = value<{ grant: string; until: string; app: string; hard: string[] }>(await api.chatAnswerMint({ id, options: ['ship', 'wait', 'made-up'] }, key()));
  assert.equal(minted.app, 'Claude');
  assert.match(minted.grant, /^ca1\.[A-Za-z0-9_-]+$/u);
  assert.equal(Date.parse(minted.until) - clock.now(), GRANT_FOR);
  assert.ok(!minted.grant.includes('p_seed') && !minted.grant.includes(id), 'the grant is sealed, and says nothing of whose or which');
  assert.equal(value<{ app: string }>(await api.chatAnswerMint({ id, options: ['ship'] }, key('tok_chatgpt'))).app, 'ChatGPT');
});

test('the door asks which chat app holds a key before it lists answer, whatever the switch says', async () => {
  const { api } = await record();
  assert.equal(value<{ app: string }>(await api.chatApp({}, key())).app, 'Claude');
  assert.equal(refusal(await api.chatApp({}, key('tok_cli'))).code, 'FORBIDDEN');
  assert.equal(refusal(await api.chatApp({}, owner)).code, 'FORBIDDEN');
});

test('WITHOUT A GRANT NOTHING IS ANSWERED: the model calling is sent to the card, and the question stays open', async () => {
  const { api } = await record();
  const id = await asked(api);
  await switchOn(api);
  for (const args of [{ option: 'ship' }, { grant: '', option: 'ship' }, { grant: 'ca1.made-up', option: 'ship' }, { grant: 42, option: 'ship' }]) {
    const no = refusal(await api.chatAnswer(args, key()));
    assert.equal(no.code, 'LEVEL_REQUIRED');
    assert.match(no.fix, /pressing an option on the decision card/u);
    assert.match(no.fix, /governance/u);
  }
  assert.equal(api.kernel.governanceRow('suggestion', id)?.status, 'open');
});

test('ONE PRESS ANSWERS AS THE OWNER, AND THE DECISION KEEPS WHERE IT WAS PRESSED', async () => {
  const { api, sql } = await record();
  const id = await asked(api);
  await switchOn(api);
  const { grant } = value<{ grant: string }>(await api.chatAnswerMint({ id, options: ['ship', 'wait'] }, key()));
  const pressed = value<{ decision: string; question: string; option: string; app: string; said: string }>(await api.chatAnswer({ grant, option: 'wait' }, key()));
  assert.equal(pressed.option, 'wait');
  assert.equal(pressed.app, 'Claude');
  assert.equal(pressed.said, 'Answered: Wait a week. BrainDog keeps it as answered in Claude.');
  assert.equal(api.kernel.governanceRow('suggestion', id)?.status, 'resolved');
  const decision = api.kernel.governanceRow('decision', pressed.decision);
  assert.equal(decision?.answer, 'wait');
  assert.equal(decision?.decided_by, 'p_seed', 'the owner decided it, not the key');
  assert.equal(api.kernel.answeredInOf(pressed.decision), 'Claude');
  const line = sql.one<{ note: string; actor: string }>("SELECT note, actor FROM event WHERE kind = 'note' AND field = 'answered_in' AND target = ?", `decision:${pressed.decision}`);
  assert.deepEqual({ ...line }, { note: 'Answered in Claude, on the card.', actor: 'p_seed' });
  /* THE SOURCE IS NOT WHAT THE DECISION APPLIED. */
  assert.equal(decision?.applied ?? null, null);

  /* SPENT: the same grant again answers nothing. */
  assert.equal(refusal(await api.chatAnswer({ grant, option: 'ship' }, key())).code, 'TRANSITION_ILLEGAL');
});

test('A GRANT IS THE CARD’S ALONE: another key, another option, an older card or a changed question is refused', async () => {
  const { api, clock } = await record();
  const id = await asked(api);
  await switchOn(api);
  const { grant } = value<{ grant: string }>(await api.chatAnswerMint({ id, options: ['ship'] }, key()));
  /* ANOTHER KEY, EVEN THE SAME PERSON'S. */
  assert.equal(refusal(await api.chatAnswer({ grant, option: 'ship' }, key('tok_chatgpt'))).code, 'LEVEL_REQUIRED');
  /* AN OPTION THE CARD DID NOT SHOW. */
  assert.equal(refusal(await api.chatAnswer({ grant, option: 'wait' }, key())).code, 'ENUM_VALUE_UNKNOWN');
  /* FIFTEEN MINUTES ON. */
  clock.advance(GRANT_FOR + 1);
  assert.equal(refusal(await api.chatAnswer({ grant, option: 'ship' }, key())).code, 'VERSION_STALE');
  assert.equal(api.kernel.governanceRow('suggestion', id)?.status, 'open');

  /* ANSWERED IN THE APP MEANWHILE. */
  const fresh = value<{ grant: string }>(await api.chatAnswerMint({ id, options: ['ship'] }, key())).grant;
  value(await api.decide({ id, decide: { option: 'wait', reason: 'Not this week.' } } as never, owner));
  assert.equal(refusal(await api.chatAnswer({ grant: fresh, option: 'ship' }, key())).code, 'TRANSITION_ILLEGAL');
});

test('THE SWITCH TURNED OFF AFTER THE CARD WAS DRAWN stops the press', async () => {
  const { api } = await record();
  const id = await asked(api);
  await switchOn(api);
  const { grant } = value<{ grant: string }>(await api.chatAnswerMint({ id, options: ['ship'] }, key()));
  value(await api.setPref({ key: 'agents.answer_in_chat', value: false }, owner));
  assert.equal(refusal(await api.chatAnswer({ grant, option: 'ship' }, key())).code, 'FORBIDDEN');
  assert.equal(api.kernel.governanceRow('suggestion', id)?.status, 'open');
});

test('A QUESTION THAT INSTALLS IS ANSWERED IN BRAINDOG, never on the card', async () => {
  const { api } = await record();
  await switchOn(api);
  const open = api.kernel.openSuggestions();
  const installs = (open.ok ? open.value : []).find((r) => ['pack', 'settings', 'arrange', 'change', 'pattern'].includes(String((r as { body_kind?: unknown }).body_kind)));
  if (installs === undefined) return;
  const id = String((installs as { id: unknown }).id);
  assert.equal(refusal(await api.chatAnswerMint({ id, options: ['accept', 'reject'] }, key())).code, 'FORBIDDEN');
});

test('A PRESS REACHES NOTHING AN OWNER DOES IN A BROWSER: admin and vault refuse it', async () => {
  const { api } = await record();
  const pressed: CallContext = { principal: { kind: 'person', id: 'p_seed', level: 'owner' }, registers: '*', pressedIn: 'Claude' };
  assert.equal(refusal(await api.setPref({ key: 'agents.answer_in_chat', value: false }, pressed)).code, 'NEEDS_BROWSER_SESSION');
  assert.equal(refusal(await api.listGrants(pressed)).code, 'NEEDS_BROWSER_SESSION');
});

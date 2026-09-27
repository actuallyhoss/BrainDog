/**
 * Canaries planted in a real record, and looked for in every answer of every MCP tool (DEF-1).
 *
 * THE SAME SWEEP `apps/selfhost/test/canary.test.ts` MAKES OF THE ROUTES, made of the tools. `TOOLS` is read when the
 * test runs, so a tool added later is swept the day it lands. Every tool is called through `handle`, the dispatcher
 * stdio and `/mcp` both serve, over the record itself, so what is read here is the whole answer an agent is sent.
 *
 * WHAT IS PLANTED:
 * - a value sealed into a `secret` field through the record's own deposit step, as a host's key door calls it;
 * - the record's vault key, made here so its bytes are known, and wrapped before the record is handed it;
 * - the title of a row in `obligations`, a list the member was never given.
 *
 * THE SEALED ONES ARE ALSO LOOKED FOR AS THE RECORD HOLDS THEM. With no host here, nothing opens a sealed value or
 * unwraps a key, so their plain bytes never reach the record and a tool over it could not answer them; the sealed
 * value's ciphertext and the wrapped key are what it keeps, and what a tool that leaked would answer.
 *
 * WHO ASKS: a member invited to Reads on `tasks` and nothing else, and a token that member holds, each with the context
 * a host builds for it. No canary may reach either of them.
 *
 * AND A HIDDEN LIST REFUSES AS A MISSING ONE DOES: every tool is asked by the member about `obligations` and about a
 * list that is not there, and the two answers must be one answer with the name changed.
 *
 * WRITTEN AND NOT RUN BY ITS AUTHOR. Every finding is collected before anything is asserted, so the first run lists
 * every leak at once; each is repaired at its tool, never here. An exemption is a line in `EXEMPT` with its reason.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

import { ok } from '@braindog/ports';
import { createRecordApi, type CallContext, type SealTarget } from '@braindog/record';

import { TOOLS, type Tool } from '../src/index.ts';
import { handle, type Reply } from '../src/rpc.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 25, 12);
const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAG';
const OWNER = 'p_ada';
const MEMBER = 'p_wren';
/** A list no record here declares, asked about beside the hidden one. */
const MISSING = 'atlantis';

/**
 * Tools this sweep leaves out, each with the reason, as `name: 'why'`.
 *
 * NONE AT LANDING, AND AN EXEMPTION IS NEVER THE REPAIR. A tool that leaks is repaired where it answers; a line here is
 * for a tool this harness cannot ask at all, and its reason says why.
 */
const EXEMPT: Readonly<Record<string, string>> = {};

const OBLIGATIONS = {
  id: 'register.obligations',
  kind: 'register' as const,
  body: {
    id: 'obligations',
    name: 'Obligations',
    title: 'what',
    state: 'state',
    fields: [
      { id: 'what', type: 'text', required: true, search: true },
      { id: 'state', type: 'enum', values: ['open', 'paid'] },
    ],
  } as never,
};

const TASKS = {
  id: 'register.tasks',
  kind: 'register' as const,
  body: {
    id: 'tasks',
    name: 'Tasks',
    title: 'what',
    fields: [{ id: 'what', type: 'text', required: true, search: true }],
  } as never,
};

/** The Keys list a deposit writes into, as `apps/selfhost/test/keys-doors.test.ts` declares it, less the project. */
const KEYS = {
  id: 'register.credentials',
  kind: 'register' as const,
  body: {
    id: 'credentials',
    name: 'Keys',
    title: 'label',
    fields: [
      { id: 'label', type: 'text', required: true, max: 120 },
      { id: 'opens', type: 'text', required: true, max: 280 },
      { id: 'kind', type: 'enum', values: ['api_token', 'password', 'ssh_key', 'recovery_codes', 'note'], required: true },
      { id: 'value', type: 'secret' },
    ],
  } as never,
};

/**
 * Every way these bytes could be written into an answer: hex, both base64 alphabets, the numbers a JSON array or a
 * `Buffer` serialises to, and the numbered keys a `Uint8Array` serialises to, taken whole as the self-host sweep takes
 * them.
 */
function written(bytes: Uint8Array): string[] {
  const b = Buffer.from(bytes);
  return [
    b.toString('hex'),
    b.toString('base64').replace(/=+$/u, ''),
    b.toString('base64url'),
    Array.from(bytes).join(','),
    Array.from(bytes, (v, i) => `"${i}":${v}`).join(','),
  ];
}

type Canary = { name: string; forms: readonly string[] };

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });

  /* THE VAULT KEY IS WRAPPED HERE, AS A HOST WRAPS ONE, under a wrapping key this test holds and the record never sees.
     The record keeps the wrapped bytes, and both they and their unwrapped form are the canary. */
  const wrapping = await crypto.subtle.importKey('raw', new Uint8Array(randomBytes(32)), 'AES-GCM', false, ['encrypt']);
  const vaultBytes = new Uint8Array(randomBytes(32));
  const nonce = new Uint8Array(randomBytes(12));
  const wrapped = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, wrapping, vaultBytes));
  const made = await api.createRecord({
    id: REC,
    slug: 'the-studio',
    name: 'The Studio',
    tz: 'UTC',
    locale: 'en',
    owner: { id: OWNER, email: 'ada@example.com', name: 'Ada' },
    keys: { record: { wrapped, nonce, kek_id: 'key_canary', wrapped_by: 'kek' } },
  });
  assert.ok(made.ok, JSON.stringify(made));
  const installed = await api.kernel.install([OBLIGATIONS, TASKS, KEYS]);
  assert.ok(installed.ok, JSON.stringify(installed));

  /* THE ROW IS THE FIRST IN ITS LIST, so `obligations#1` names it, and its first word is what `search` is sent. */
  const mark = `quillon${randomBytes(6).toString('hex')}`;
  assert.ok(api.kernel.create('obligations', { what: `${mark} renewal`, state: 'open' }, { actor: OWNER }).ok);
  assert.ok(api.kernel.create('tasks', { what: 'Water the plants' }, { actor: OWNER }).ok);

  /* THE SECRET IS SEALED AS A HOST SEALS ONE: the record names what to seal for, and only the sealed bytes come back to
     it. The owner is a browser session proved just now, which is what the vault gate asks for. */
  const value = ['bd_fake_canary_value_', randomBytes(24).toString('hex')].join('');
  const sealedBytes: Uint8Array[] = [];
  const seal = async (target: SealTarget) => {
    const iv = new Uint8Array(randomBytes(12));
    const bytes = new TextEncoder().encode(value);
    const ciphertext = new Uint8Array(
      await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(target.aad) }, wrapping, bytes),
    );
    sealedBytes.push(ciphertext);
    return ok({ ciphertext, nonce: iv, kdf: 'hkdf-sha256', kek_id: target.key.kek_id ?? 'key_canary', bytes: bytes.length, hint: `a ${value.length}-character value` });
  };
  const session: CallContext = { principal: { kind: 'person', id: OWNER, level: 'owner' }, credentialed: true, provedAt: NOW };
  const deposited = await api.depositGrant({ label: 'Canary deploy', opens: 'Deploys canary.example', kind: 'api_token' }, session, {}, seal);
  assert.ok(deposited.ok, JSON.stringify(deposited));

  /* THE MEMBER, invited to Reads on one list, and the token they hold, each with the context a host builds for it:
     `sessionContext` for a signed-in person, and the self-host's `bearerFor` for a token, both over `access`. */
  const owner: CallContext = { principal: { kind: 'person', id: OWNER, level: 'owner' } };
  const invited = await api.invite({ person: MEMBER, name: 'Wren', registers: { tasks: 'read' } }, owner);
  assert.ok(invited.ok, JSON.stringify(invited));
  const held = api.kernel.access(MEMBER) ?? assert.fail('the member holds nothing on the record');
  assert.equal(held.level, null, 'the member holds the whole record');
  const narrowed = {
    ...(held.registers === null ? {} : { registers: held.registers }),
    ...(Object.keys(held.levels).length === 0 ? {} : { levels: held.levels }),
  };
  const member: CallContext = { principal: { kind: 'person', id: MEMBER, level: held.level }, ...narrowed, credentialed: true, provedAt: NOW };

  const minted = await api.kernel.createToken(MEMBER, { scope: 'write', label: 'Canary scoped' });
  if (!minted.ok) throw new Error(`the member's token was not minted: ${JSON.stringify(minted)}`);
  const seen = await api.kernel.verifyToken(minted.value.bearer, 'mcp');
  if (!seen.ok) throw new Error(`the member's token did not verify: ${JSON.stringify(seen)}`);
  const scoped: CallContext = {
    principal: { kind: 'token', id: seen.value.id, scope: seen.value.scope, person: seen.value.person_id, level: held.level },
    ...narrowed,
  };

  const canaries: Canary[] = [
    {
      name: 'the value in a secret field',
      forms: [value, ...written(new TextEncoder().encode(value)), ...sealedBytes.flatMap((bytes) => written(bytes))],
    },
    { name: 'a vault key', forms: [...written(vaultBytes), ...written(wrapped)] },
    { name: 'the title of a row in obligations', forms: [mark] },
  ];
  return { sql, api, owner, member, scoped, mark, canaries };
}

/** Only the arguments a tool declares, so a tool is never refused for one it was not built to take. */
function argsFor(tool: Tool, bag: Record<string, unknown>): Record<string, unknown> {
  const takes = (tool.input as { properties?: Record<string, unknown> }).properties ?? {};
  return Object.fromEntries(Object.entries(bag).filter(([key]) => Object.hasOwn(takes, key)));
}

/** Both list names as one, and a crash's reference as one, so two answers compare on what they say. */
const LISTS = new RegExp(`\\b(?:obligations|${MISSING})\\b`, 'giu');
const REF = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/giu;
const normal = (text: string): string => text.replace(LISTS, '<list>').replace(REF, '<ref>');

/** What a reply says, as far as a refusal goes: the error, or the refusal the tool answered with. */
function shapeOf(reply: Reply | null): string {
  if (reply === null) return 'no reply';
  if ('error' in reply) return normal(`error ${JSON.stringify(reply.error)}`);
  const out = reply.result as { isError?: boolean; content?: { text?: string }[] };
  if (out.isError !== true) return 'answered';
  return normal(`refused ${(out.content ?? []).map((c) => c.text ?? '').join('\n')}`);
}

test('NO TOOL ANSWERS A SEALED VALUE OR A HIDDEN ROW TO A MEMBER OR THEIR TOKEN, and a hidden list refuses as a missing one does', async () => {
  const { sql, api, owner, member, scoped, mark, canaries } = await record();
  try {
    for (const name of Object.keys(EXEMPT)) assert.ok(TOOLS.some((t) => t.name === name), `EXEMPT names ${name}, which is no tool`);

    const ask = (tool: Tool, args: Record<string, unknown>, ctx: CallContext) =>
      handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: tool.name, arguments: args } }, api, ctx);

    /* THE ROW IS THERE TO BE MISSED: the owner reads it by the address the member is sent, or every "not found" below
       is about a row nobody could have found. */
    const get = TOOLS.find((t) => t.name === 'get') ?? assert.fail('there is no get tool');
    assert.ok(JSON.stringify(await ask(get, { spoken: 'obligations#1' }, owner)).includes(mark), 'the owner could not read the row');

    /* THE GENERIC ARGUMENTS THE ROUTE SWEEP SENDS, in the tools' own names: a row is addressed by what a person says. */
    const hidden = { register: 'obligations', spoken: 'obligations#1', fields: { what: 'x' }, patch: {}, q: mark };
    const missing = { ...hidden, register: MISSING, spoken: `${MISSING}#1` };
    const leaks: string[] = [];
    const tells: string[] = [];

    const look = (tool: string, who: string, reply: Reply | null) => {
      const raw = JSON.stringify(reply);
      for (const c of canaries) if (c.forms.some((f) => raw.includes(f))) leaks.push(`${tool} as ${who}: ${c.name}`);
    };

    for (const tool of TOOLS) {
      if (Object.hasOwn(EXEMPT, tool.name)) continue;
      const about = await ask(tool, argsFor(tool, hidden), member);
      const nowhere = await ask(tool, argsFor(tool, missing), member);
      const token = await ask(tool, argsFor(tool, hidden), scoped);
      look(tool.name, 'the member', about);
      look(tool.name, 'the member, about a missing list', nowhere);
      look(tool.name, "the member's token", token);

      /* A TOOL THAT READS NO LIST ANSWERS BOTH ALIKE, so asking every tool is asking every tool that takes one. */
      const a = shapeOf(about);
      const b = shapeOf(nowhere);
      if (a !== b) tells.push(`${tool.name}: about obligations ${a}; about ${MISSING} ${b}`);
    }

    assert.deepEqual(leaks, [], 'a canary reached an answer it may not');
    assert.deepEqual(tells, [], 'a hidden list was refused differently from a missing one');
  } finally {
    sql.close();
  }
});

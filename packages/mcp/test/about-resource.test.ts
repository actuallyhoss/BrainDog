/**
 * `braindog:about/<name>` at the agent door: what one thing on the record is, asked by its name, answered by
 * the record's own `about` and held to what the caller may read.
 *
 * THROUGH A REAL RECORD, as `mcp.test.ts` drives the door: the surface is the record itself, so the name an agent
 * writes in the address is the name the record's method is asked.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { tools } from '../src/index.ts';
import { createRecordApi, type CallContext } from '@braindog/record';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const agent: CallContext = { principal: { kind: 'token', id: 'tok_1', scope: 'read', person: 'p_1', level: 'owner' } };
/** A token whose grant reaches the notes and not the projects. */
const narrow: CallContext = { principal: { kind: 'token', id: 'tok_2', scope: 'read', person: 'p_1', level: 'owner' }, registers: ['notes'] };

const THINGS = {
  id: 'register.things',
  kind: 'register' as const,
  body: {
    id: 'things',
    name: 'Projects',
    title: 'name',
    search: ['name'],
    scopes: { repos: 'repos', folders: 'folders' },
    fields: [{ id: 'name', type: 'text', required: true }, { id: 'repos', type: 'list', of: 'text' }, { id: 'folders', type: 'list', of: 'text' }],
  } as never,
};
const NOTES = {
  id: 'register.notes',
  kind: 'register' as const,
  body: { id: 'notes', name: 'Notes', title: 'subject', search: ['subject', 'body'], fields: [{ id: 'subject', type: 'text', required: true }, { id: 'body', type: 'text' }] } as never,
};

type Said = { is: { kind: string; name: string; register: string; seq: number; seen: { where: string }[] } | null; candidates: unknown[] };
const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

async function studio() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 9, 14, 12)) });
  value(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }));
  value(await api.kernel.install([THINGS, NOTES]));
  const add = (register: string, fields: Record<string, unknown>) => value<{ seq: number }>(api.kernel.create(register, fields as never, { actor: 'p_1' })).seq;
  const seq = add('things', { name: 'North Bank', repos: ['git@github.com:mara/northbank.git'] });
  add('notes', { subject: 'Call with the printers', body: 'North Bank goes to print on Friday.' });
  return { sql, api, seq, mcp: tools(api) };
}

test('AN AGENT READS WHAT ONE THING IS BY ITS NAME, written in the address as a person says it', async () => {
  const { sql, mcp, seq } = await studio();
  for (const ctx of [owner, agent]) {
    const said = value<Said>(await mcp.read('braindog:about/North%20Bank', ctx));
    assert.ok(said.is);
    assert.deepEqual([said.is.kind, said.is.name, said.is.register, said.is.seq], ['project', 'North Bank', 'things', seq]);
    assert.deepEqual(said.is.seen.map((s) => s.where), ['Notes: Call with the printers']);
    /* IN NAMES: neither a row's id nor the repository the project is keyed by. */
    assert.doesNotMatch(JSON.stringify(said), /[0-9A-HJKMNP-TV-Z]{26}|github|\.git/u);
  }
  sql.close();
});

test('A NAME NOBODY HAS, AND ONE IN A LIST THE CALLER MAY NOT READ, ARE THE SAME EMPTY ANSWER', async () => {
  const { sql, mcp } = await studio();
  const nothing = { is: null, candidates: [] };
  assert.deepEqual(value<Said>(await mcp.read('braindog:about/Nobody', agent)), nothing);
  assert.deepEqual(value<Said>(await mcp.read('braindog:about/North%20Bank', narrow)), nothing);
  sql.close();
});

test('AN ADDRESS THAT DOES NOT DECODE IS REFUSED IN A SENTENCE, and a surface with no such read says so', async () => {
  const { sql, mcp, api } = await studio();
  const bad = (await mcp.read('braindog:about/%E0%A4%A', agent)) as { ok: boolean; refusal?: { code: string; fix: string } };
  assert.equal(bad.ok, false);
  assert.equal(bad.refusal?.code, 'VALUE_MALFORMED');
  const older = tools(Object.assign(Object.create(api) as typeof api, { about: undefined }));
  const none = (await older.read('braindog:about/North%20Bank', agent)) as { ok: boolean; refusal?: { code: string; fix: string } };
  assert.equal(none.ok, false);
  assert.equal(none.refusal?.code, 'NOT_IN_THIS_BUILD');
  assert.doesNotMatch(`${bad.refusal?.fix ?? ''} ${none.refusal?.fix ?? ''}`, /—/u);
  sql.close();
});

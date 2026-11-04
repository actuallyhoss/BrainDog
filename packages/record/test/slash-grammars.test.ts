/**
 * The grammars a description is drafted in, held to the lint that decides (`packages/record/src/grammar.ts`).
 *
 * A GRAMMAR IS A REFERENCE AND THE LINT IS THE JUDGE, so a grammar that drifts from the lint teaches a model to write what
 * is then refused. Each list of keys here is held to the `allowed` the lint's own refusal names, each rule trigger and
 * step to the capability table the lint and the runner read, and each example is installed on a real record.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CAPABILITIES } from '@braindog/kernel';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { describedGrammar, GRAMMARS, grammarOf } from '../src/grammar.ts';
import { REACHES_OUT } from '../src/slash.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const OWNER: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string; allowed?: readonly string[] } };
const value = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};
const refusal = (r: unknown) => {
  const x = r as Out;
  assert.equal(x.ok, false, JSON.stringify(x));
  return x.refusal!;
};

type Decl = { id: string; kind: string; body: Record<string, unknown> };
type Register = { body: Record<string, string>; rare: Record<string, string>; field: Record<string, string>; example: Decl };
type Rule = { triggers: Record<string, string>; steps: Record<string, string>; example: Decl };

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 8, 1, 9)) });
  return { sql, api };
}

test('EVERY GRAMMAR IS SERVED BY ITS NAME, a name that is not one is refused with all of them, and a description is handed six', async () => {
  const { api, sql } = await record();
  for (const name of GRAMMARS) value(await api.arrangement({ grammar: name }, OWNER));
  assert.deepEqual(refusal(await api.arrangement({ grammar: 'yaml' }, OWNER)).allowed, [...GRAMMARS]);
  const described = describedGrammar();
  assert.deepEqual(Object.keys(described).sort(), ['design', 'ingest', 'metric', 'page', 'register', 'rule']);
  /* THE DESIGN LINES ARE HOW A PAGE IT BUILDS LOOKS, no grammar of the record's, and the rest are what is served. */
  const { design, ...grammars } = described;
  assert.ok(design.length > 0, 'a description is handed no design lines');
  for (const [name, grammar] of Object.entries(grammars)) assert.equal(grammar, value(grammarOf(name)), `${name} is handed to Slash as something other than what is served`);
  sql.close();
});

test('THE LIST GRAMMAR IS EVERY KEY THE LINT READS, on a list and on a field, and its example installs', async () => {
  const { api, sql } = await record();
  const grammar = value<Register>(grammarOf('register'));
  const example = grammar.example;

  const listKeys = refusal(await api.kernel.install([{ ...example, body: { ...example.body, nonsense: true } }] as never)).allowed ?? [];
  assert.deepEqual([...Object.keys(grammar.body), ...Object.keys(grammar.rare)].sort(), [...listKeys].sort());

  const fields = example.body.fields as Record<string, unknown>[];
  const fieldKeys =
    refusal(await api.kernel.install([{ ...example, body: { ...example.body, fields: [{ ...fields[0], nonsense: true }, ...fields.slice(1)] } }] as never)).allowed ?? [];
  assert.deepEqual(Object.keys(grammar.field).sort(), [...fieldKeys].sort());

  value(await api.kernel.install([example] as never));
  sql.close();
});

test('THE FIGURE GRAMMAR\'S EXAMPLE INSTALLS OVER THE LIST GRAMMAR\'S', async () => {
  const { api, sql } = await record();
  value(await api.kernel.install([value<Register>(grammarOf('register')).example] as never));
  value(await api.kernel.install([value<{ example: Decl }>(grammarOf('metric')).example] as never));
  sql.close();
});

test('THE RULE GRAMMAR SAYS EVERY TRIGGER AND EVERY STEP A DESCRIPTION MAY BUILD, by the capability table, and its example installs', async () => {
  const { api, sql } = await record();
  const grammar = value<Rule>(grammarOf('rule'));
  assert.deepEqual(Object.keys(grammar.triggers), CAPABILITIES.filter((c) => c.of === 'trigger').map((c) => c.name));
  const inside = CAPABILITIES.filter((c) => c.of === 'step' && !c.name.includes('.') && !Object.hasOwn(REACHES_OUT, c.name)).map((c) => c.name);
  assert.deepEqual(Object.keys(grammar.steps), inside);
  /* SAID, NOT NAMED: a row the table gained with no words here is its bare name, and that is a grammar saying nothing. */
  for (const [name, said] of [...Object.entries(grammar.triggers), ...Object.entries(grammar.steps)]) assert.notEqual(said, name, `${name} is in the table and not said`);
  for (const verb of Object.keys(REACHES_OUT)) assert.ok(!Object.hasOwn(grammar.steps, verb), `${verb} reaches out and is offered to a description`);
  value(await api.kernel.install([grammar.example] as never));
  sql.close();
});

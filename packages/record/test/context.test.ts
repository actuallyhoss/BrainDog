/**
 * `context`, over the seed: where an agent working on Kiln stands, in one call.
 *
 * The seed is the record this product shows itself with, so the shape is asserted against it rather
 * than against a toy. The seed installs the agents pack with sample rows of its own, so each test
 * narrows the registers to the fields it writes and asserts only on the rows it wrote: a sample row
 * added to the demo must not break what `context` is held to.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Declaration, Entry } from '@braindog/kernel';

import { createRecordApi, type Attached, type CallContext, type Context } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { NOW, declarations, installSeed } from '../../seed/src/index.ts';

const MIN = 60_000;
const iso = (ms: number): string => new Date(ms).toISOString();

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const refusal = (r: unknown): { code: string; fix: string } => {
  const x = r as { ok: boolean; refusal?: { code: string; fix: string } };
  assert.equal(x.ok, false, 'the call went through');
  return x.refusal!;
};

type Field = { id: string } & Record<string, unknown>;
type Body = { id: string; fields: Field[] } & Record<string, unknown>;

/** One of the seed's registers, declared again with what the agents pack adds to it. */
const again = (id: string, change: (body: Body) => Body): Declaration => {
  const decl = declarations().find((d) => d.id === `register.${id}`) ?? assert.fail(`the seed has no ${id}`);
  return { ...decl, body: change(structuredClone(decl.body) as unknown as Body) as never };
};
const withField = (body: Body, field: Field): Body => (body.fields.some((f) => f.id === field.id) ? body : { ...body, fields: [...body.fields, field] });

const SKILLS: Declaration = {
  id: 'register.skills',
  kind: 'register',
  body: {
    id: 'skills',
    name: 'Skills',
    title: 'name',
    state: 'state',
    done: ['retired'],
    mobile: ['name', 'trigger'],
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'trigger', type: 'text' },
      { id: 'what', type: 'text' },
      { id: 'kind', type: 'enum', values: ['skill', 'command'], default: 'skill', required: true },
      { id: 'project', type: 'ref', to: 'things', scope: { widen: 'person', same: 'nearer' } },
      { id: 'body', type: 'document', by: 'decide' },
      { id: 'rev', type: 'int', default: 1, required: true, by: 'decide' },
      { id: 'managed', type: 'bool', default: true },
      { id: 'source', type: 'url' },
      { id: 'because', type: 'list', of: 'ref', to: 'learnings' },
      { id: 'state', type: 'enum', values: ['active', 'retired'], default: 'active' },
    ],
  } as never,
};

const KEYS: Declaration = {
  id: 'register.credentials',
  kind: 'register',
  body: {
    id: 'credentials',
    name: 'Keys',
    title: 'label',
    mobile: ['label', 'opens'],
    fields: [
      { id: 'label', type: 'text', required: true },
      { id: 'opens', type: 'text', required: true },
      { id: 'provider', type: 'text' },
      { id: 'kind', type: 'enum', values: ['api_token', 'password', 'ssh_key', 'recovery_codes', 'note'] },
      { id: 'project', type: 'ref', to: 'things', scope: { widen: 'person' } },
      { id: 'value', type: 'secret' },
      { id: 'where', type: 'text' },
      { id: 'origin', type: 'text' },
      { id: 'verified', type: 'day' },
      { id: 'expires', type: 'day' },
      /* The seed's Agents page filters Keys on `state`, and a list that takes it away is refused at install. */
      { id: 'state', type: 'enum', values: ['live', 'stale', 'invalid', 'missing', 'retired'], default: 'live' },
    ],
  } as never,
};

const LEARNINGS: Declaration = {
  id: 'register.learnings',
  kind: 'register',
  body: {
    id: 'learnings',
    name: 'Learnings',
    title: 'lesson',
    mobile: ['lesson'],
    fields: [
      { id: 'lesson', type: 'text', required: true },
      { id: 'because', type: 'text' },
      { id: 'kind', type: 'enum', values: ['method', 'fact'] },
      { id: 'project', type: 'ref', to: 'things', scope: { widen: 'person' } },
      { id: 'topic', type: 'text' },
      { id: 'confirmed_on', type: 'day' },
      { id: 'supersedes', type: 'ref', to: 'learnings' },
      { id: 'state', type: 'enum', values: ['active', 'superseded', 'reverted'], default: 'active' },
      { id: 'why', type: 'text' },
    ],
  } as never,
};

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
/** Where a run working on Kiln says it is: the repository's folder name is enough to place it. */
const HERE = { host: 'kiln-mbp', repo: 'kiln', agent: 'claude' };
const agent = (session: CallContext['session']): CallContext => ({
  principal: { kind: 'token', id: 'tok_1', scope: 'write', person: 'p_1', level: 'owner' },
  session,
});

/** The seed, with Kiln listing its repositories, and the registers that say where their rows apply. */
async function kiln() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  value(await installSeed(api.kernel));
  value(
    await api.kernel.install([
      again('things', (b) => ({
        ...withField(withField(b, { id: 'repos', type: 'list', of: 'text' }), { id: 'folders', type: 'list', of: 'text' }),
        scopes: { repos: 'repos', folders: 'folders' },
      })),
      again('tasks', (b) => ({ ...b, fields: b.fields.map((f) => (f.id === 'thing' ? { ...f, scope: {} } : f)) })),
      again('people', (b) => withField(b, { id: 'projects', type: 'list', of: 'ref', to: 'things', scope: { links: true } })),
      SKILLS,
      KEYS,
      LEARNINGS,
    ]),
  );
  const row = value<{ rows: Entry[] }>(await api.list({ register: 'things', where: { field: 'name', is: 'Kiln' } }, owner)).rows[0];
  if (!row) assert.fail('the seed has no Kiln');
  value(await api.update({ register: 'things', seq: row.seq!, patch: { repos: ['github.com/kiln/kiln-type', 'kiln'] } }, owner));
  /* Past every run the seed wrote, so what these tests write is the newest. */
  clock.advance(5 * MIN);
  return { api, sql, clock, kiln: `things#${String(row.seq)}` };
}

const registerOf = (here: Context, id: string) => here.registers.find((r) => r.id === id) ?? assert.fail(`${id} is not in the answer`);
/** The rows among `rows` whose `key` is one this test wrote. */
const mine = <R>(rows: readonly R[], key: string, wrote: readonly unknown[]): R[] => rows.filter((r) => wrote.includes((r as Record<string, unknown>)[key]));

/* ── the shape ───────────────────────────────────────────────────────────── */

test('CONTEXT OVER THE SEED: the run, Kiln, the last handoff, who is live, what waits, and what applies there', async () => {
  const { api, sql, clock, kiln: project } = await kiln();

  /* An earlier run on Kiln left a handoff; another is live beside this one, and one elsewhere. */
  const earlier = agent({ ...HERE, client_id: 'c-0' });
  const before = value<Attached>(await api.attach({ source: 'startup', client_id: 'c-0', doing: 'Kerning pass' }, earlier));
  value(await api.handoff({ next: 'Kern the lowercase pairs', tried: 'Auto-kerning read as uneven', head: 'a1b2c3d', state: 'handoff' }, earlier));
  const beside = value<Attached>(await api.attach({ source: 'startup', client_id: 'c-2', doing: 'Specimen copy' }, agent({ ...HERE, client_id: 'c-2' })));
  const away = value<Attached>(await api.attach({ source: 'startup', client_id: 'c-3' }, agent({ host: 'kiln-mbp', repo: 'site', agent: 'codex', client_id: 'c-3' })));

  const asked = value<{ id: string }>(
    await api.propose(
      {
        question: 'Let kilnfonts.example lapse?',
        body_kind: 'options',
        body: { options: [{ id: 'renew', label: 'Renew it', because: 'Old PDFs point at it.' }, { id: 'lapse', label: 'Let it lapse', because: 'It costs every year.' }] },
      },
      owner,
    ),
  );

  value(await api.create({ register: 'learnings', fields: { lesson: 'Export the variable font last.', project } }, owner));
  value(await api.create({ register: 'learnings', fields: { lesson: 'Proof on paper before the web.', confirmed_on: '2026-01-02' } }, owner));
  const person = value<{ rows: Entry[] }>(await api.list({ register: 'people', limit: 1 }, owner)).rows[0] ?? assert.fail('the seed has no people');
  value(await api.update({ register: 'people', seq: person.seq!, patch: { projects: [project] } }, owner));

  clock.advance(10 * MIN);
  const said = agent({ ...HERE, client_id: 'c-1' });
  const attached = value<Attached>(await api.attach({ source: 'startup', client_id: 'c-1', doing: 'Variable axis QA' }, said));
  const runs = sql.all("SELECT 1 FROM entry WHERE register = 'session'").length;
  const here = value<Context>(await api.context({}, said));
  assert.equal(sql.all("SELECT 1 FROM entry WHERE register = 'session'").length, runs, 'reading context opened a run');

  assert.deepEqual(here.session, { spoken: attached.spoken, state: 'active' });
  assert.deepEqual([here.project?.spoken, here.project?.name, here.project?.how], [project, 'Kiln', 'repo']);
  assert.equal(typeof here.project?.mark, 'string', 'Kiln has a mark in the seed');
  assert.deepEqual(here.ambiguous, []);

  assert.deepEqual(here.handoff, { from: before.spoken, age_s: 600, next: 'Kern the lowercase pairs', tried: ['Auto-kerning read as uneven'], head: 'a1b2c3d' });
  const spokenOf = (list: { spoken: string }[]) => list.map((r) => r.spoken);
  assert.ok(spokenOf(here.live.same_repo).includes(beside.spoken), 'a run beside this one is missing');
  assert.ok(!spokenOf(here.live.same_repo).includes(attached.spoken), 'the caller is listed as someone else');
  assert.ok(spokenOf(here.live.elsewhere).includes(away.spoken), 'a run in another repository is missing');
  assert.deepEqual(here.waiting.find((w) => w.id === asked.id), { id: asked.id, question: 'Let kilnfonts.example lapse?' });

  /* Kiln's open tasks, each as a person says it, with the version to write against. */
  const tasks = registerOf(here, 'tasks');
  assert.ok(tasks.rows.length > 0, 'Kiln has open tasks in the seed');
  for (const row of tasks.rows) {
    assert.match(row.spoken, /^tasks#[1-9][0-9]*$/);
    assert.deepEqual([row.scope, typeof row.version, ['done', 'dropped'].includes(String(row.state))], ['project', 'number', false]);
    assert.equal(row.thing, undefined, 'the scope field is repeated as a field');
  }

  /* A learning nobody confirmed in ninety days is counted, not shown. */
  const learnings = registerOf(here, 'learnings');
  const lessons = ['Export the variable font last.', 'Proof on paper before the web.'];
  assert.deepEqual(
    [mine(learnings.rows, 'lesson', lessons).map((r) => r.lesson), mine(learnings.inherited, 'lesson', lessons).length, here.faded],
    [['Export the variable font last.'], 0, 1],
  );
  assert.match(here.next, new RegExp(`handoff ${before.spoken} left`));

  assert.deepEqual(here.people.map((p) => [p.spoken, p.scope]), [[`people#${String(person.seq)}`, 'project']]);
  assert.ok(!here.registers.some((r) => r.id === 'people' || r.id === 'things' || r.id === 'session'));
  sql.close();
});

test('NEARER WINS: Kiln’s own skill hides the global one of the same name, and the rest are inherited', async () => {
  const { api, sql, kiln: project } = await kiln();
  value(await api.create({ register: 'skills', fields: { name: 'review-pr', trigger: 'Before any merge' } }, owner));
  value(await api.create({ register: 'skills', fields: { name: 'deploy', trigger: 'Shipping a site' } }, owner));
  value(await api.create({ register: 'skills', fields: { name: 'review-pr', trigger: 'Before a Kiln merge', project } }, owner));

  const triggers = ['Before any merge', 'Shipping a site', 'Before a Kiln merge'];
  const skills = registerOf(value<Context>(await api.context({}, agent({ ...HERE, client_id: 'c-1' }))), 'skills');
  assert.deepEqual(mine(skills.rows, 'trigger', triggers).map((r) => [r.name, r.trigger, r.scope]), [['review-pr', 'Before a Kiln merge', 'project']]);
  assert.deepEqual(mine(skills.inherited, 'trigger', triggers).map((r) => [r.name, r.scope]), [['deploy', 'global']]);
  assert.equal(skills.truncated, false);

  /* A run in no project inherits every global skill, and has no rows of its own. */
  const global = registerOf(value<Context>(await api.context({}, agent({ host: 'kiln-mbp', repo: 'elsewhere', client_id: 'c-9' }))), 'skills');
  assert.deepEqual([mine(global.rows, 'trigger', triggers).length, mine(global.inherited, 'trigger', triggers).map((r) => r.name).sort()], [0, ['deploy', 'review-pr']]);
  sql.close();
});

test('A KEY IS NAMED, NEVER GIVEN: its label, what it opens and whether it is sealed, and no value anywhere', async () => {
  const { api, sql } = await kiln();
  /* Built here, so no key-shaped text sits in this file. It stands in for sealed bytes. */
  const secret = ['sk', '_live_', 'FAKE0NOT0A0REAL0KEY0FOR0TESTS0ONLY0000'].join('');
  const bytes = new TextEncoder().encode(secret);
  const sealed = { kind: 'api_token' as const, ciphertext: bytes, nonce: new Uint8Array([7, 7]), kdf: 'hkdf', wrapped_by: 'kek' as const, kek_id: 'kek_2f' };
  const said = agent({ ...HERE, client_id: 'c-1' });
  const deposit = { actor: 'agent:claude', principal: { kind: 'token' as const, token: 'tok_1' }, session: said.session };

  const here = value<{ entry: Entry; grant: { id: string } }>(
    api.kernel.depositGrant(
      { register: 'credentials', field: 'value', fields: { label: 'Shop', opens: 'the Kiln shop' }, grant: { ...sealed, label: 'Shop', opens: 'the Kiln shop' } },
      deposit,
    ),
  );
  const everywhere = value<{ entry: Entry; grant: { id: string } }>(
    api.kernel.depositGrant(
      { register: 'credentials', field: 'value', fields: { label: 'DNS', opens: 'the registrar' }, grant: { ...sealed, label: 'DNS', opens: 'the registrar' } },
      { actor: 'p_1' },
    ),
  );
  const run = api.kernel.findRun(said.session ?? {}) ?? assert.fail('the deposit opened no run');
  const opener = `S${String(run.seq)}`;
  /* A grant opens only in a record with a wrapped key, which is what naming a record gives it. */
  const b = (n: number) => new Uint8Array([n, n + 1, n + 2, 255]);
  value(
    api.kernel.createRecord({
      id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD',
      slug: 'kiln',
      name: 'Kiln',
      tz: 'UTC',
      locale: 'en',
      owner: { id: 'p_1', name: 'Sam' },
      keys: { record: { wrapped: b(90), nonce: b(80), kek_id: 'kek_2f' } },
    }),
  );
  value(api.kernel.openGrant({ id: here.grant.id, kek_id: 'kek_2f' }, opener));

  const attached = value<Attached>(await api.attach({ source: 'startup', client_id: 'c-1' }, said));
  const briefed = value<Context>(await api.context({}, said));
  const keys = registerOf(briefed, 'credentials');
  assert.deepEqual(
    mine(keys.rows, 'label', ['Shop', 'DNS']).map((r) => [r.label, r.opens, r.value]),
    [['Shop', 'the Kiln shop', { sealed: true, opened: 1, last_opened: iso(NOW + 5 * MIN), last_by: opener }]],
  );
  assert.deepEqual(mine(keys.inherited, 'label', ['Shop', 'DNS']).map((r) => [r.label, (r.value as { sealed: boolean }).sealed]), [['DNS', true]]);

  for (const [what, answer] of [['context', JSON.stringify(briefed)], ['attach', JSON.stringify(attached)]] as const) {
    assert.ok(!answer.includes(secret), `${what} carries the key`);
    assert.ok(!answer.includes(Buffer.from(bytes).toString('base64')), `${what} carries the sealed bytes`);
    assert.ok(!answer.includes(here.grant.id) && !answer.includes(everywhere.grant.id), `${what} names a grant`);
    assert.ok(!answer.includes('ciphertext'), `${what} carries a grant row`);
  }
  sql.close();
});

test('A CALLER SEES ONLY WHAT IT MAY READ: an append grant is no register in the answer, and nothing to read is refused', async () => {
  const { api, sql } = await kiln();
  value(await api.create({ register: 'skills', fields: { name: 'deploy' } }, owner));
  value(await api.attach({ source: 'startup', client_id: 'c-0' }, agent({ ...HERE, client_id: 'c-0' })));

  /* Invited to read tasks and to add skills, and nothing else: no project, because naming Kiln would
     name a row of a register it cannot see, and no runs, for the same reason. */
  const scoped: CallContext = { principal: { kind: 'person', id: 'p_2', level: null }, levels: { tasks: 'read', skills: 'append' }, session: HERE };
  const seen = value<Context>(await api.context({}, scoped));
  assert.deepEqual(seen.registers.map((r) => r.id), ['tasks']);
  assert.deepEqual([seen.session, seen.project, seen.handoff, seen.people], [null, null, null, []]);
  assert.deepEqual(seen.live, { same_repo: [], elsewhere: [] });

  const nothing: CallContext = { principal: { kind: 'person', id: 'p_3', level: null }, levels: { skills: 'append' } };
  assert.equal(refusal(await api.context({}, nothing)).code, 'LEVEL_REQUIRED');
  sql.close();
});

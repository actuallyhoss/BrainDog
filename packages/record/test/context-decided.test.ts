/**
 * `context.decided` on a real record: an agent opening a session on a project is told the last three
 * questions a person decided there, "Decided 2 Oct: <the choice>", so it asks none of them again.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Declaration, Entry } from '@braindog/kernel';

import { createRecordApi, type CallContext, type Context } from '../src/index.ts';
import { dayOfDecision } from '../src/context-caps.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { NOW, declarations, installSeed } from '../../seed/src/index.ts';
import { PROJECTS } from '../../../fixtures/names.ts';

const MIN = 60_000;
const OTHER = PROJECTS[0];

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

type Field = { id: string } & Record<string, unknown>;
type Body = { id: string; fields: Field[] } & Record<string, unknown>;

/** One of the seed's registers, declared again with what the agents pack adds to it. */
const again = (id: string, change: (body: Body) => Body): Declaration => {
  const decl = declarations().find((d) => d.id === `register.${id}`) ?? assert.fail(`the seed has no ${id}`);
  return { ...decl, body: change(structuredClone(decl.body) as unknown as Body) as never };
};
const withField = (body: Body, field: Field): Body => (body.fields.some((f) => f.id === field.id) ? body : { ...body, fields: [...body.fields, field] });

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const agent = (repo: string, client_id: string): CallContext => ({
  principal: { kind: 'token', id: 'tok_1', scope: 'write', person: 'p_1', level: 'owner' },
  session: { host: 'studio-desktop', repo, agent: 'claude', client_id },
});

/** The seed, with Kiln and a second project each placed by its repository, and tasks placed by their project. */
async function record() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  value(await installSeed(api.kernel));
  value(
    await api.kernel.install([
      again('things', (b) => ({ ...withField(b, { id: 'repos', type: 'list', of: 'text' }), scopes: { repos: 'repos' } })),
      again('tasks', (b) => withField({ ...b, fields: b.fields.map((f) => (f.id === 'thing' ? { ...f, scope: {} } : f)) }, { id: 'cost', type: 'money', label: 'Cost' })),
    ]),
  );
  const kiln = value<{ rows: Entry[] }>(await api.list({ register: 'things', where: { field: 'name', is: 'Kiln' } }, owner)).rows[0] ?? assert.fail('the seed has no Kiln');
  value(await api.update({ register: 'things', seq: kiln.seq!, patch: { repos: ['kiln'] } }, owner));
  value(await api.create({ register: 'things', fields: { name: OTHER, lane: 'building', repos: ['lanternfish'] } }, owner));
  value(await api.create({ register: 'tasks', fields: { what: 'Proof the specimen', thing: `things#${String(kiln.seq)}` } }, owner));
  const other = value<{ rows: Entry[] }>(await api.list({ register: 'things', where: { field: 'name', is: OTHER } }, owner)).rows[0] ?? assert.fail(`no ${OTHER}`);
  const task = value<{ rows: Entry[] }>(await api.list({ register: 'tasks', where: { field: 'what', is: 'Proof the specimen' } }, owner)).rows[0] ?? assert.fail('no task');
  clock.advance(5 * MIN);
  return { api, clock, kiln: `things#${String(kiln.seq)}`, other: `things#${String(other.seq)}`, task: `tasks#${String(task.seq)}` };
}

const OPTIONS = { options: [{ id: 'renew', label: 'Renew the domain', because: 'Old PDFs point at it.' }, { id: 'lapse', label: 'Let it lapse', because: 'It costs every year.' }] };

test('THREE QUESTIONS DECIDED IN KILN READ AS THREE DATED LINES THERE, newest first, and none in another project', async () => {
  const { api, clock, kiln, task } = await record();
  const zone = api.kernel.identity()?.tz ?? 'UTC';
  const inKiln = agent('kiln', 'c-1');
  const day = (): string => dayOfDecision(new Date(clock.now()).toISOString(), zone)!;

  const domain = value<{ id: string }>(await api.propose({ question: 'Let kilnfonts.example lapse?', body_kind: 'options', body: OPTIONS }, inKiln));
  const at = value<{ rows: Entry[] }>(await api.list({ register: 'tasks', where: { field: 'what', is: 'Proof the specimen' } }, owner)).rows[0]!;
  const price = value<{ id: string }>(
    await api.propose({ question: 'Price the specimen proof?', body_kind: 'rowset', body: { register: 'tasks', rows: [{ at: task, version: at.version, patch: { cost: { amount: 900, currency: 'EUR' } } }] } }, inKiln),
  );
  const archive = value<{ id: string }>(await api.propose({ question: 'Archive the old specimen?', body_kind: 'options', body: { options: [{ id: 'yes', label: 'Yes, it can go', because: 'Nobody opens it.' }, { id: 'no', label: 'Keep it', because: 'It may come back.' }] } }, inKiln));

  clock.advance(MIN);
  value(await api.decide({ id: domain.id, decide: { option: 'renew', reason: 'The PDFs.' } }, owner));
  const first = day();
  clock.advance(MIN);
  value(await api.decide({ id: price.id, decide: { option: 'accept', reason: 'Fair.' } }, owner));
  const second = day();
  clock.advance(MIN);
  value(await api.decide({ id: archive.id, resolved_as: 'wont-fix', reason: 'Not yet.' }, owner));
  const third = day();

  const here = value<Context>(await api.context({}, agent('kiln', 'c-2')));
  assert.equal(here.project?.spoken, kiln);
  assert.deepEqual(here.decided, [`Decided ${third}: No: Archive the old specimen`, `Decided ${second}: Yes: Price the specimen proof`, `Decided ${first}: Renew the domain`]);

  const there = value<Context>(await api.context({}, agent('lanternfish', 'c-3')));
  assert.equal(there.project?.name, OTHER);
  assert.deepEqual(there.decided, []);
});

test('A QUESTION ITS ASKER CLOSED ITSELF IS NOT COUNTED, nor one taken back', async () => {
  const { api, clock, other } = await record();
  const there = agent('lanternfish', 'c-1');
  const taken = value<{ id: string }>(await api.propose({ question: 'Rename the repository?', body_kind: 'options', body: OPTIONS }, there));
  clock.advance(MIN);
  value(await api.withdraw({ id: taken.id }, there));
  /* THE OWNER ASKED ABOUT THE PROJECT AND CLOSED IT HIMSELF: he said nothing about it, as the kernel's memory reads it. */
  const own = value<{ id: string }>(await api.propose({ question: 'Pause the project?', body_kind: 'options', body: { ...OPTIONS, about: other } }, owner));
  value(await api.decide({ id: own.id, resolved_as: 'wont-fix', reason: 'Asked by mistake.' }, owner));
  /* AND ONE A PERSON ANSWERED IS. */
  const answered = value<{ id: string }>(await api.propose({ question: 'Keep the old name?', body_kind: 'options', body: OPTIONS }, there));
  clock.advance(MIN);
  value(await api.decide({ id: answered.id, decide: { option: 'lapse', reason: 'Done with it.' } }, owner));

  const here = value<Context>(await api.context({}, agent('lanternfish', 'c-2')));
  assert.equal(here.project?.spoken, other);
  assert.equal(here.decided?.length, 1, JSON.stringify(here.decided));
  assert.match(here.decided![0]!, /^Decided \d{1,2} [A-Z][a-z]{2}: Let it lapse$/u);
});

test('A MEMBER CLOSED TO THE LIST A DECISION WAS ABOUT HEARS NOTHING OF IT', async () => {
  const { api, clock, kiln, task } = await record();
  const inKiln = agent('kiln', 'c-1');
  const at = value<{ rows: Entry[] }>(await api.list({ register: 'tasks', where: { field: 'what', is: 'Proof the specimen' } }, owner)).rows[0]!;
  const price = value<{ id: string }>(
    await api.propose({ question: 'Price the specimen proof?', body_kind: 'rowset', body: { register: 'tasks', rows: [{ at: task, version: at.version, patch: { cost: { amount: 900, currency: 'EUR' } } }] } }, inKiln),
  );
  const domain = value<{ id: string }>(await api.propose({ question: 'Let kilnfonts.example lapse?', body_kind: 'options', body: OPTIONS }, inKiln));
  clock.advance(MIN);
  value(await api.decide({ id: price.id, decide: { option: 'accept', reason: 'Fair.' } }, owner));
  value(await api.decide({ id: domain.id, decide: { option: 'renew', reason: 'The PDFs.' } }, owner));

  assert.equal(value<Context>(await api.context({}, agent('kiln', 'c-2'))).decided?.length, 2, 'the owner hears both');
  const member: CallContext = { principal: { kind: 'person', id: 'p_2', level: 'read' }, registers: ['things'], session: { host: 'studio-desktop', repo: 'kiln', agent: 'claude', client_id: 'c-9' } };
  const heard = value<Context>(await api.context({}, member));
  assert.equal(heard.project?.spoken, kiln, 'the member stands in Kiln');
  assert.deepEqual(heard.decided, []);
});

/**
 * Where what has no scope belongs, read and asked (`src/methods/stale.ts`, AGT-D04 jobs 2 and 3): `scopeProposals` says
 * a list's moves with their reasons, and `proposeScopes` puts them to Decide as one question a list, signed by the
 * person who pressed, with the things left in a finished project as one question of three answers.
 *
 * Through the real record on a real kernel in memory: two live projects and a finished one, runs of agents in each, and
 * keys and tools that apply everywhere. The votes are `scope-propose.ts`'s own, run for real.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Entry } from '@braindog/kernel';

import { createRecordApi, type CallContext } from '../src/index.ts';
import type { ScopeAsks, ScopesAsked } from '../src/methods/stale.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 14, 9);
const DAY = 86_400_000;

const reg = (body: Record<string, unknown>) => ({ id: `register.${String(body.id)}`, kind: 'register' as const, body: body as never });

const PROJECTS = reg({
  id: 'things',
  name: 'Projects',
  title: 'name',
  scopes: { repos: 'repos' },
  state: 'state',
  done: ['done'],
  fields: [
    { id: 'name', type: 'text', required: true },
    { id: 'repos', type: 'list', of: 'text' },
    { id: 'state', type: 'enum', values: ['active', 'done'], default: 'active' },
  ],
});
const KEYS = reg({
  id: 'keys',
  name: 'Keys',
  title: 'label',
  state: 'state',
  done: ['retired'],
  fields: [
    { id: 'label', type: 'text', required: true },
    { id: 'note', label: 'Note', type: 'text' },
    { id: 'project', type: 'ref', to: 'things', index: true, scope: { widen: 'person' } },
    { id: 'state', type: 'enum', values: ['live', 'retired'], default: 'live' },
  ],
});
const TOOLS = reg({
  id: 'tools',
  name: 'Tools',
  title: 'name',
  fields: [
    { id: 'name', type: 'text', required: true },
    { id: 'needs', label: 'Keys it needs', type: 'list', of: 'text' },
    { id: 'note', label: 'Note', type: 'text' },
    { id: 'project', type: 'ref', to: 'things', index: true, scope: { widen: 'person', same: 'nearer' } },
  ],
});

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true };
/** Somebody invited to the keys, the projects and the runs, and nothing else: the tools are closed to her. */
const held: CallContext = { principal: { kind: 'person', id: 'p_3', level: 'write' }, registers: ['keys', 'things', 'session'] };
/** The same, without the runs: what runs used is then no evidence she is told of. */
const runless: CallContext = { principal: { kind: 'person', id: 'p_4', level: 'write' }, registers: ['keys', 'things'] };
const KILN = 'https://github.com/sam/kiln';
const TALLOW = 'https://github.com/sam/tallow';
/** An agent's run, one a client id, started in the checkout `remote` names. */
const agent = (client_id: string, remote: string): CallContext => ({
  principal: { kind: 'token', id: 't_claude', scope: 'write', person: 'p_1', level: 'owner' },
  session: { client_id, client: 'Claude Code', host: 'mac', remote },
});

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};
const refused = (r: unknown): { code: string; fix: string } => {
  const x = r as { ok: boolean; refusal?: { code: string; fix: string } };
  assert.equal(x.ok, false, 'refused');
  return x.refusal!;
};

type Api = Awaited<ReturnType<typeof createRecordApi>> & {
  scopeProposals: (a: unknown, c: CallContext) => Promise<unknown>;
  proposeScopes: (a: unknown, c: CallContext) => Promise<unknown>;
};

/**
 * The studio: Kiln and Tallow live, Fernway finished. A tool and a key three Kiln runs used, a tool placed in
 * Tallow that needs a key, a key used in both projects, a key with no evidence, and a key left in Fernway.
 */
async function studio() {
  const sql = openSqlite();
  const clock = fixedClock(NOW - 5 * DAY);
  const api = (await createRecordApi({ sql, clock })) as Api;
  value(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }));
  value(await api.kernel.install([PROJECTS, KEYS, TOOLS] as never));
  sql.exec("INSERT INTO token (id, person_id, hash, scope, label, created_at) VALUES ('t_claude', 'p_1', 'h_t_claude', 'write', 'Claude Code', '2026-09-01T00:00:00.000Z')");
  const make = async (register: string, fields: Record<string, unknown>) => value<Entry>(await api.create({ register, fields: fields as never }, owner));
  const kiln = await make('things', { name: 'Kiln', repos: [KILN] });
  const tallow = await make('things', { name: 'Tallow', repos: [TALLOW] });
  const fernway = await make('things', { name: 'Fernway', repos: ['https://github.com/sam/fernway'] });
  value(await api.update({ register: 'things', seq: fernway.seq!, patch: { state: 'done' } }, owner));

  const stripe = await make('tools', { name: 'stripe-cli', needs: ['Stripe live key'] });
  const deploy = await make('tools', { name: 'deploy-bot', needs: ['Wrangler token'], project: tallow.id });
  const lonely = await make('tools', { name: 'lonely' });
  const hook = await make('keys', { label: 'Webhook signing' });
  const wrangler = await make('keys', { label: 'Wrangler token' });
  const shared = await make('keys', { label: 'Shared key' });
  const live = await make('keys', { label: 'Stripe live key' });
  const old = await make('keys', { label: 'Old Fernway key', project: fernway.id });

  /* THREE RUNS IN KILN.GG use the tool and the webhook key, and the shared key; one run in Tallow uses the shared key.
     Written as an agent's write lands, signed by its run (the record's own `update` would ask the owner first). */
  const use = (list: string, row: Entry, note: string, client_id: string, remote: string) =>
    value(api.kernel.update(list, row.id, { note }, { actor: 'agent:claude', principal: { kind: 'token', token: 't_claude' }, session: { client_id, client: 'Claude Code', host: 'mac', remote } }));
  for (const n of [1, 2, 3]) {
    use('tools', stripe, `Seen by run ${n}`, `kiln-${n}`, KILN);
    use('keys', hook, `Opened by run ${n}`, `kiln-${n}`, KILN);
    use('keys', shared, `Kiln run ${n}`, `kiln-${n}`, KILN);
  }
  use('keys', shared, 'Tallow run', 'tallow-1', TALLOW);
  clock.set(NOW);
  return { sql, clock, api, kiln, tallow, fernway, stripe, deploy, lonely, hook, wrangler, shared, live, old };
}

const listIn = (got: ScopeAsks, list: string) => {
  const found = got.lists.find((l) => l.list === list);
  assert.ok(found, `no ${list} in ${JSON.stringify(got.lists.map((l) => l.list))}`);
  return found;
};

test('THE READ SAYS EACH LIST: how many, the question, and each row with its project and its reasons in words', async () => {
  const s = await studio();
  const got = value<ScopeAsks>(await s.api.scopeProposals({}, owner));
  const keys = listIn(got, 'keys');
  assert.equal(keys.name, 'Keys');
  assert.equal(keys.count, 2);
  assert.equal(keys.line, 'Move 2 keys to the projects they belong to?');
  assert.equal(keys.truncated, false);
  const byTitle = Object.fromEntries(keys.rows.map((r) => [r.title, r]));
  assert.deepEqual(Object.keys(byTitle).sort(), ['Webhook signing', 'Wrangler token'], 'a key used in two projects, and one with nothing to go on, stay everywhere');
  assert.equal(byTitle['Webhook signing']!.project, 'Kiln');
  assert.deepEqual(byTitle['Webhook signing']!.reasons, ['Used by 3 runs in Kiln in the last 90 days']);
  assert.equal(byTitle['Wrangler token']!.project, 'Tallow');
  assert.deepEqual(byTitle['Wrangler token']!.reasons, ['Needed by deploy-bot in Tallow']);
  assert.equal(keys.stranded, 1);
  assert.equal(keys.strandedLine, '1 key belongs to a finished project.');

  const tools = listIn(got, 'tools');
  assert.equal(tools.count, 1);
  assert.equal(tools.line, 'Move 1 tool to the project it belongs to?');
  assert.deepEqual(tools.rows.map((r) => [r.title, r.project]), [['stripe-cli', 'Kiln']]);
  /* NAMES, NEVER IDS: no row id, no address and no path in anything a person reads. */
  const words = JSON.stringify(got.lists.map((l) => [l.line, l.strandedLine, l.rows.map((r) => [r.title, r.project, r.reasons])]));
  assert.doesNotMatch(words, /01[A-Z0-9]{24}|https?:|github|\/sam\//u);
  /* ONE LIST ASKED FOR, AND ONLY IT. */
  assert.deepEqual(value<ScopeAsks>(await s.api.scopeProposals({ register: 'tools' }, owner)).lists.map((l) => l.list), ['tools']);
  s.sql.close();
});

test('proposeScopes FILES ONE QUESTION FOR KEYS AND ONE FOR TOOLS, signed by the person, and a second press files nothing new', async () => {
  const s = await studio();
  const first = value<ScopesAsked>(await s.api.proposeScopes({}, owner));
  const moves = first.asked.filter((a) => a.said.startsWith('Move'));
  assert.deepEqual(moves.map((a) => [a.list, a.said, a.rows, a.opened]).sort(), [
    ['keys', 'Move 2 keys to the projects they belong to?', 2, true],
    ['tools', 'Move 1 tool to the project it belongs to?', 1, true],
  ]);
  const stranded = first.asked.find((a) => a.list === 'keys' && !a.said.startsWith('Move'));
  assert.ok(stranded, 'the key left in a finished project is asked about too');
  assert.match(stranded.said, /^1 key belongs to a finished project\. What should happen to it\?$/u);
  for (const a of first.asked) {
    const q = s.sql.one<{ opened_by: string; body_kind: string; body: string; status: string }>('SELECT opened_by, body_kind, body, status FROM suggestion WHERE id = ?', a.question);
    assert.equal(q?.opened_by, 'p_1', 'signed by whoever pressed, never by the system');
    assert.equal(q?.status, 'open', 'nothing moves until she answers');
  }
  const asked = JSON.parse(s.sql.one<{ body: string }>('SELECT body FROM suggestion WHERE id = ?', stranded.question)!.body) as { options: { label: string }[] };
  assert.deepEqual(asked.options.map((o) => o.label), ['Retire it', 'Keep it for every project', 'Leave it']);
  const keyBody = JSON.parse(s.sql.one<{ body: string }>('SELECT body FROM suggestion WHERE id = ?', moves.find((a) => a.list === 'keys')!.question)!.body) as { why: { text: string }[] };
  assert.ok(keyBody.why.some((w) => w.text === 'Webhook signing: Used by 3 runs in Kiln in the last 90 days.'), 'each row carries its reason');

  const again = value<ScopesAsked>(await s.api.proposeScopes({}, owner));
  assert.deepEqual(again.asked.map((a) => [a.question, a.opened]).sort(), first.asked.map((a) => [a.question, false]).sort(), 'the same questions, answered again, none filed');
  assert.equal(s.sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM suggestion WHERE status = 'open'")?.n, first.asked.length);
  s.sql.close();
});

/** The project a row applies in now, by the project's name, or Everywhere. */
const placeOf = (s: Awaited<ReturnType<typeof studio>>, row: Entry): string => {
  const at = s.api.kernel.get(row.id)?.fields.project;
  return typeof at === 'string' ? String(s.api.kernel.get(at)?.fields.name) : 'Everywhere';
};
/** The keys a session started in one project is handed: the project's own and those that apply everywhere. */
const handed = (s: Awaited<ReturnType<typeof studio>>, project: Entry): string[] => {
  const got = value<{ rows: Entry[]; inherited: Entry[] }>(s.api.kernel.inScope('keys', project.id, { open: true }));
  return [...got.rows, ...got.inherited].map((r) => String(r.fields.label)).sort();
};

test('ACCEPTING MOVES EVERY ROW, and one Undo puts all of them back; afterwards a Kiln session is handed its key and a Tallow one is not', async () => {
  const s = await studio();
  assert.ok(handed(s, s.tallow).includes('Webhook signing'), 'before: every key applies everywhere');
  const filed = value<ScopesAsked>(await s.api.proposeScopes({ register: 'keys' }, owner)).asked.find((a) => a.said.startsWith('Move'))!;
  const decided = value<{ decision: string }>(await s.api.decide({ id: filed.question, decide: { option: 'accept', reason: 'They belong there.' } }, owner));
  assert.equal(placeOf(s, s.hook), 'Kiln');
  assert.equal(placeOf(s, s.wrangler), 'Tallow');
  assert.equal(placeOf(s, s.shared), 'Everywhere', 'a key the question did not ask about is not moved');
  assert.ok(handed(s, s.kiln).includes('Webhook signing'));
  assert.ok(!handed(s, s.tallow).includes('Webhook signing'), 'a session in Tallow is not handed the Kiln key');
  assert.ok(handed(s, s.tallow).includes('Wrangler token'));
  /* Nothing is left to propose for the keys that moved. */
  assert.equal(listIn(value<ScopeAsks>(await s.api.scopeProposals({ register: 'keys' }, owner)), 'keys').count, 0);

  const plan = value<{ hash: string }>(await s.api.undo({ decision: decided.decision, dry: true }, owner));
  value(await s.api.undo({ decision: decided.decision, hash: plan.hash }, owner));
  assert.equal(placeOf(s, s.hook), 'Everywhere');
  assert.equal(placeOf(s, s.wrangler), 'Everywhere');
  s.sql.close();
});

test('A MOVE HE DECLINED IS NOT PROPOSED AGAIN, and what is new is asked on its own', async () => {
  const s = await studio();
  const tools = value<ScopesAsked>(await s.api.proposeScopes({ register: 'tools' }, owner)).asked[0]!;
  value(await s.api.decide({ id: tools.question, decide: { option: 'reject', reason: 'stripe-cli is used everywhere.' } }, owner));
  assert.equal(listIn(value<ScopeAsks>(await s.api.scopeProposals({ register: 'tools' }, owner)), 'tools').count, 0, 'the declined row is not offered again');
  assert.deepEqual(value<ScopesAsked>(await s.api.proposeScopes({ register: 'tools' }, owner)).asked, [], 'and nothing is filed');

  /* Taking some of the keys' question declines the rest of it, and only the rest. */
  const keys = value<ScopesAsked>(await s.api.proposeScopes({ register: 'keys' }, owner)).asked.find((a) => a.said.startsWith('Move'))!;
  const body = JSON.parse(s.sql.one<{ body: string }>('SELECT body FROM suggestion WHERE id = ?', keys.question)!.body) as { rows: { at: string }[] };
  const hookAt = body.rows.findIndex((r) => s.api.kernel.get(r.at)?.id === s.hook.id);
  value(await s.api.decide({ id: keys.question, decide: { option: 'accept', reason: 'Only the webhook.', rows: [hookAt] } } as never, owner));
  assert.equal(placeOf(s, s.hook), 'Kiln');
  assert.equal(placeOf(s, s.wrangler), 'Everywhere');
  assert.deepEqual(listIn(value<ScopeAsks>(await s.api.scopeProposals({ register: 'keys' }, owner)), 'keys').rows, []);
  s.sql.close();
});

test('A TOKEN IS REFUSED THE PRESS, and a member held to one list hears nothing of the others', async () => {
  const s = await studio();
  const token = refused(await s.api.proposeScopes({}, agent('kiln-1', KILN)));
  assert.equal(token.code, 'NEEDS_BROWSER_SESSION');
  assert.match(token.fix, /^Open this from the app; /u);
  assert.equal(s.sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM suggestion WHERE status = 'open'")?.n, 0, 'nothing was filed');

  const read = value<ScopeAsks>(await s.api.scopeProposals({}, held));
  assert.deepEqual(read.lists.map((l) => l.list), ['keys'], 'the tools are not named to her');
  assert.doesNotMatch(JSON.stringify(read), /stripe-cli|deploy-bot|lonely/u);
  /* The keys a tool needs are a vote only where she may read the tools, so the Wrangler token is not offered to her. */
  assert.deepEqual(listIn(read, 'keys').rows.map((r) => r.title), ['Webhook signing']);
  assert.equal(listIn(value<ScopeAsks>(await s.api.scopeProposals({}, runless)), 'keys').count, 0, 'runs she may not read count for nothing');
  const closed = refused(await s.api.scopeProposals({ register: 'tools' }, held));
  assert.equal(closed.code, 'REGISTER_UNKNOWN');
  assert.equal(closed.fix, refused(await s.api.scopeProposals({ register: 'nowhere' }, held)).fix, 'a list held from her reads as one that is not there');
  assert.doesNotMatch(closed.fix, /tools|Tools/u);

  const asked = value<ScopesAsked>(await s.api.proposeScopes({}, held));
  assert.deepEqual([...new Set(asked.asked.map((a) => a.list))], ['keys']);
  assert.ok(asked.asked.every((a) => s.sql.one<{ opened_by: string }>('SELECT opened_by FROM suggestion WHERE id = ?', a.question)?.opened_by === 'p_3'));
  s.sql.close();
});

test('WHAT IS LEFT IN A FINISHED PROJECT IS ASKED IN THREE ANSWERS, and each answer that writes writes what it says', async () => {
  for (const [option, state, place] of [['retire', 'retired', 'Fernway'], ['every', 'live', 'Everywhere'], ['leave', 'live', 'Fernway']] as const) {
    const s = await studio();
    const left = value<ScopesAsked>(await s.api.proposeScopes({ register: 'keys' }, owner)).asked.find((a) => !a.said.startsWith('Move'))!;
    assert.equal(left.rows, 1);
    value(await s.api.decide({ id: left.question, decide: { option, reason: 'As it says.' } }, owner));
    assert.equal(s.api.kernel.get(s.old.id)?.fields.state, state, option);
    assert.equal(placeOf(s, s.old), place, option);
    s.sql.close();
  }
});

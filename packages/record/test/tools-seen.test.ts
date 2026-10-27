/**
 * What one machine holds, written down by the record (`src/methods/tools-seen.ts`): every server, command line
 * and integration matched to its row by what it runs, added when new, stamped when seen again, and asked about only
 * when a known name now runs something else.
 *
 * Through the real record on a real kernel in memory, with the seed and the agents add-on installed as any add-on is.
 * The method is called as its file builds it, over the record's own kernel, until `methods/index.ts` holds its line;
 * the door's checks before it are the record's own and are not what this file proves.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { no, type Result } from '@braindog/ports';
import { looksLikeCredential, type Entry } from '@braindog/kernel';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { methods, programOf, startOf, type FoundTool, type ToolsSeen } from '../src/methods/tools-seen.ts';
import type { RecordDeps } from '../src/methods/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { NOW as SEEDED, installAgentsPack, installSeed } from '../../seed/src/index.ts';
import { MACHINES } from '../../../fixtures/names.ts';

const DAY = 86_400_000;
const NOW = SEEDED + 2 * DAY;
const [HERE, THERE, THIRD] = MACHINES;

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true };
/** A run in no project: its folder is no project's. */
const loose = (id = 'c-loose'): CallContext => ({
  principal: { kind: 'token', id: 'tok_1', scope: 'write', person: 'p_1', level: 'owner' },
  session: { client_id: id, client: 'claude-code', host: HERE, repo: 'scratch-folder' },
});
/** A run in the seed's Portage, placed by its repository's folder name. */
const inPortage = (id = 'c-portage'): CallContext => ({
  principal: { kind: 'token', id: 'tok_1', scope: 'write', person: 'p_1', level: 'owner' },
  session: { client_id: id, client: 'claude-code', host: HERE, repo: 'portage' },
});

type Api = Awaited<ReturnType<typeof createRecordApi>>;
type Made = { api: Api; sql: ReturnType<typeof openSqlite>; seen: (args: unknown, ctx: CallContext) => Promise<Result<ToolsSeen>> };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

async function record(): Promise<Made> {
  const sql = openSqlite();
  const clock = fixedClock(SEEDED);
  const api = await createRecordApi({ sql, clock });
  value(await installSeed(api.kernel));
  value(await installAgentsPack(api.kernel));
  clock.set(NOW);
  const deps = { kernel: api.kernel, sql, clock, guard: () => null, no, tail: async <T>(out: T) => out } as unknown as RecordDeps;
  const own = (api as unknown as { toolsSeen?: Made['seen'] }).toolsSeen;
  const seen: Made['seen'] = typeof own === 'function' ? own : (args, ctx) => methods(deps).toolsSeen(args as never, ctx);
  return { api, sql, seen };
}

/** Every live tool. */
const tools = async (r: Made): Promise<Entry[]> => value<{ rows: Entry[] }>(await r.api.list({ register: 'tools', limit: 200 }, owner)).rows;
const named = async (r: Made, name: string): Promise<Entry[]> => (await tools(r)).filter((t) => t.fields.name === name);
const openQuestions = (r: Made): number => r.sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM suggestion WHERE status = 'open'")!.n;

const server = (name: string, more: Partial<FoundTool> = {}): FoundTool => ({
  name,
  kind: 'mcp',
  scope: 'global',
  transport: 'stdio',
  command: 'npx',
  args: ['-y', `@pellucid/${name}-server`],
  needs: [],
  source: 'the user config of Claude Code',
  ...more,
});

test('WHAT A TOOL RUNS AND HOW IT STARTS, by the two rules of decision 2', () => {
  const programs: [Partial<FoundTool> & { name: string }, string][] = [
    [{ name: 'a', kind: 'mcp', transport: 'http', endpoint: 'https://MCP.Copperleaf.example/v1/?key=x#top' }, 'http:mcp.copperleaf.example/v1'],
    [{ name: 'a', kind: 'mcp', transport: 'stdio', command: 'npx', args: ['-y', '@scope/quill-mcp@1.4.2'] }, 'pkg:@scope/quill-mcp'],
    [{ name: 'a', kind: 'mcp', transport: 'stdio', command: '/opt/homebrew/bin/npx', args: ['--yes', 'quill-mcp@latest'] }, 'pkg:quill-mcp'],
    [{ name: 'a', kind: 'mcp', transport: 'stdio', command: 'npx', args: ['-y', '-p', 'oxbow-tools', 'oxbow'] }, 'pkg:oxbow-tools'],
    [{ name: 'a', kind: 'mcp', transport: 'stdio', command: 'pnpm', args: ['dlx', 'oxbow-mcp'] }, 'pkg:oxbow-mcp'],
    [{ name: 'a', kind: 'mcp', transport: 'stdio', command: 'uvx', args: ['oxbow-mcp==0.3'] }, 'pkg:oxbow-mcp'],
    [{ name: 'a', kind: 'mcp', transport: 'stdio', command: 'pipx', args: ['run', 'oxbow-mcp'] }, 'pkg:oxbow-mcp'],
    [{ name: 'a', kind: 'mcp', transport: 'stdio', command: 'docker', args: ['run', '-i', '--rm', '-e', 'TOKEN', 'ghcr.io/saltmarsh/mcp:2.1'] }, 'pkg:ghcr.io/saltmarsh/mcp'],
    [{ name: 'a', kind: 'mcp', transport: 'stdio', command: 'node', args: ['/Users/mara/Code/quietcart-mcp/dist/index.js'] }, 'script:quietcart-mcp'],
    [{ name: 'a', kind: 'mcp', transport: 'stdio', command: 'python3', args: ['-m', 'thimble_mcp'] }, 'mod:thimble_mcp'],
    [{ name: 'a', kind: 'mcp', transport: 'stdio', command: 'deno', args: ['run', '-A', 'C:\\Users\\joaquin\\tools\\vance\\main.ts'] }, 'script:vance'],
    [{ name: 'a', kind: 'mcp', transport: 'stdio', command: '/usr/local/bin/orchard-mcp', args: ['serve'] }, 'bin:orchard-mcp'],
    [{ name: 'Lantern', kind: 'cli', command: 'lantern', args: ['--all'] }, 'bin:lantern'],
    [{ name: 'Thimble', kind: 'integration', endpoint: 'https://api.thimble.example/v2' }, 'http:api.thimble.example/v2'],
    [{ name: 'Thimble', kind: 'integration' }, 'name:thimble'],
  ];
  for (const [tool, program] of programs) assert.equal(programOf(tool), program, JSON.stringify(tool));

  /* Two people's home folders start the same; another folder does not. */
  const at = (home: string) => startOf({ transport: 'stdio', command: 'node', args: [`${home}/Code/quietcart-mcp/dist/index.js`, `--data=${home}/.quietcart`] });
  assert.equal(at('/Users/mara'), 'stdio node ~/Code/quietcart-mcp/dist/index.js --data=~/.quietcart');
  assert.equal(at('/home/joaquin'), at('/Users/mara'));
  assert.equal(startOf({ transport: 'stdio', command: 'node', args: ['C:\\Users\\priya\\Code\\quietcart-mcp\\dist\\index.js', '--data=C:\\Users\\priya\\.quietcart'] }), at('/Users/mara'));
  assert.notEqual(startOf({ transport: 'stdio', command: 'node', args: ['/srv/quietcart-mcp/dist/index.js'] }), at('/Users/mara'));
  assert.equal(startOf({ transport: 'http', endpoint: 'https://mcp.copperleaf.example/v1' }), 'http https://mcp.copperleaf.example/v1');
});

test('A NEW SERVER IS ADDED, signed by the run, and nothing is asked', async () => {
  const r = await record();
  const before = openQuestions(r);
  const got = value<ToolsSeen>(await r.seen({ machine: HERE, found: [server('quill', { needs: ['QUILL_KEY'] })] }, loose()));
  assert.equal(got.tools.length, 1);
  assert.equal(got.tools[0]!.did, 'added');
  const [row] = await named(r, 'quill');
  assert.ok(row, 'the row is in Tools');
  assert.equal(got.tools[0]!.row, r.api.kernel.nameOf(row.id));
  assert.deepEqual(row.fields.hosts, [HERE]);
  assert.deepEqual(row.fields.needs, ['QUILL_KEY']);
  assert.equal(row.fields.transport, 'stdio');
  assert.equal(row.fields.origin, 'the user config of Claude Code');
  assert.equal(row.fields.project ?? null, null);
  const by = r.sql.one<{ actor: string }>("SELECT actor FROM event WHERE target = ? AND kind = 'create'", `entry:${row.id}`)?.actor;
  assert.match(String(by), /^S\d+$/u, 'signed by the caller\'s run, never by the record');
  assert.equal(openQuestions(r), before, 'no question on Decide');
});

test('THE SAME SERVER FROM A SECOND MACHINE, in another home folder, stamps "Seen on" and asks nothing', async () => {
  const r = await record();
  const at = (home: string) => server('quietcart', { command: 'node', args: [`${home}/Code/quietcart-mcp/dist/index.js`] });
  value(await r.seen({ machine: HERE, found: [at('/Users/mara')] }, loose()));
  const before = openQuestions(r);
  const again = value<ToolsSeen>(await r.seen({ machine: THERE, found: [at('/home/joaquin')] }, loose('c-two')));
  assert.equal(again.tools[0]!.did, 'seen');
  /* The same program from a folder of another name still names the row: rule 2. */
  const moved = value<ToolsSeen>(await r.seen({ machine: THIRD, found: [server('quietcart', { command: 'node', args: ['/srv/quietcart-mcp/build/server.js'] })] }, loose('c-three')));
  assert.equal(moved.tools[0]!.did, 'seen');
  const rows = await named(r, 'quietcart');
  assert.equal(rows.length, 1, 'one row');
  assert.deepEqual(rows[0]!.fields.hosts, [HERE, THERE, THIRD]);
  assert.equal(openQuestions(r), before, 'nothing asked');
});

test('x AND x-mcp RUNNING ONE PACKAGE ARE ONE ROW', async () => {
  const r = await record();
  value(await r.seen({ machine: HERE, found: [server('oxbow', { args: ['-y', 'oxbow-mcp'] })] }, loose()));
  const twin = value<ToolsSeen>(await r.seen({ machine: THERE, found: [server('oxbow-mcp', { args: ['oxbow-mcp@latest'] })] }, loose('c-two')));
  assert.equal(twin.tools[0]!.did, 'seen');
  assert.equal((await named(r, 'oxbow-mcp')).length, 0, 'no second row');
  assert.deepEqual((await named(r, 'oxbow'))[0]!.fields.hosts, [HERE, THERE]);
});

test('A KNOWN NAME RUNNING ANOTHER PROGRAM files one question, and a second call files none', async () => {
  const r = await record();
  value(await r.seen({ machine: HERE, found: [server('lantern', { args: ['-y', 'lantern-mcp'] })] }, loose()));
  const before = openQuestions(r);
  const other: FoundTool = { name: 'lantern', kind: 'mcp', scope: 'global', transport: 'http', endpoint: 'https://mcp.lanternfish.example/v1', needs: [], source: 'the user config of Claude Code' };
  const asked = value<ToolsSeen>(await r.seen({ machine: THERE, found: [other] }, loose('c-two')));
  assert.equal(asked.tools[0]!.did, 'asked');
  assert.ok(asked.tools[0]!.question);
  assert.equal(openQuestions(r), before + 1);
  assert.equal(r.api.kernel.question(asked.tools[0]!.question!), 'Change how lantern starts?');
  const by = r.sql.one<{ opened_by: string }>('SELECT opened_by FROM suggestion WHERE id = ?', asked.tools[0]!.question!)?.opened_by;
  assert.match(String(by), /^S\d+$/u, 'asked by the run, never by the record');
  /* The same start sent again is a sighting of the row, and asks nothing. */
  const same = value<ToolsSeen>(await r.seen({ machine: THIRD, found: [server('lantern', { args: ['-y', 'lantern-mcp'] })] }, loose('c-four')));
  assert.equal(same.tools[0]!.did, 'seen');
  const again = value<ToolsSeen>(await r.seen({ machine: THIRD, found: [other] }, loose('c-three')));
  assert.equal(again.tools[0]!.did, 'waiting');
  assert.equal(again.tools[0]!.question, asked.tools[0]!.question);
  assert.equal(openQuestions(r), before + 1, 'still one question');
  const [row] = await named(r, 'lantern');
  assert.equal(row!.fields.command, 'npx', 'the row is left as it is until he answers');
});

test('A PROJECT CONFIG TOOL goes to the run\'s project, and is skipped with why when the run has none', async () => {
  const r = await record();
  const local = server('copperleaf', { scope: 'project', source: '.mcp.json in this folder' });
  const none = value<ToolsSeen>(await r.seen({ machine: HERE, found: [local] }, loose()));
  assert.equal(none.tools[0]!.did, 'skipped');
  assert.match(none.tools[0]!.why!, /in no project/u);
  assert.equal((await named(r, 'copperleaf')).length, 0);
  const placed = value<ToolsSeen>(await r.seen({ machine: HERE, found: [local] }, inPortage()));
  assert.equal(placed.tools[0]!.did, 'added');
  const [row] = await named(r, 'copperleaf');
  const portage = r.api.kernel.get(String(row!.fields.project));
  assert.equal(portage?.fields.name, 'Portage');
});

test('A TOOL OF THE USER CONFIG FROM A RUN IN A PROJECT is one question for all of them, never a row by itself', async () => {
  const r = await record();
  const found = [server('brightwell'), server('saltmarsh', { args: ['-y', 'saltmarsh-mcp'] })];
  const got = value<ToolsSeen>(await r.seen({ machine: HERE, found }, inPortage()));
  assert.deepEqual(got.tools.map((t) => t.did), ['asked', 'asked']);
  assert.equal(got.tools[0]!.question, got.tools[1]!.question, 'one question');
  assert.equal(r.api.kernel.question(got.tools[0]!.question!), 'Add 2 tools for use everywhere: brightwell and saltmarsh?');
  assert.equal((await named(r, 'brightwell')).length, 0);
  const again = value<ToolsSeen>(await r.seen({ machine: THERE, found }, inPortage('c-two')));
  assert.deepEqual(again.tools.map((t) => t.did), ['waiting', 'waiting']);
});

test('A KEY-SHAPED VALUE is never written, and its tool is skipped with why', async () => {
  const r = await record();
  const key = 'Zq8xT2mLp9Rv4Wn7Kc3Hb6Ys1Fd5Gj0Ae8Ui2OkW';
  assert.ok(looksLikeCredential(key), 'the fixture reads as a key');
  const got = value<ToolsSeen>(await r.seen({ machine: HERE, found: [server('vance', { args: ['-y', 'vance-mcp', '--token', key] })] }, loose()));
  assert.equal(got.tools[0]!.did, 'skipped');
  assert.match(got.tools[0]!.why!, /looks like a key/u);
  assert.equal((await named(r, 'vance')).length, 0);
  assert.equal(r.sql.one<{ n: number }>('SELECT COUNT(*) AS n FROM event WHERE to_v LIKE ?', `%${key}%`)!.n, 0, 'nowhere in the log');
});

test('TWO CALLS AT ONCE MAKE ONE ROW, and a stale row seen again is active again', async () => {
  const r = await record();
  const [a, b] = await Promise.all([
    r.seen({ machine: HERE, found: [server('thimble')] }, loose()),
    r.seen({ machine: THERE, found: [server('thimble')] }, loose('c-two')),
  ]);
  assert.deepEqual([value<ToolsSeen>(a).tools[0]!.did, value<ToolsSeen>(b).tools[0]!.did].sort(), ['added', 'seen']);
  assert.equal((await named(r, 'thimble')).length, 1);

  const stale = (await tools(r)).find((t) => t.fields.state === 'stale' && t.fields.kind === 'integration');
  assert.ok(stale, 'the seed holds a stale integration');
  const back = value<ToolsSeen>(await r.seen({ machine: HERE, found: [{ name: String(stale.fields.name), kind: 'integration', scope: 'global', endpoint: String(stale.fields.endpoint), needs: [], source: 'what Claude Code lists as connected' }] }, loose()));
  assert.equal(back.tools[0]!.did, 'seen');
  assert.equal(r.api.kernel.get(stale.id)?.fields.state, 'active');
});

test('A CALL THAT IS NOT A LIST OF TOOLS is refused at what is wrong, and nothing is written', async () => {
  const r = await record();
  const count = (await tools(r)).length;
  for (const [args, at] of [
    [{ found: [server('quill')] }, 'machine'],
    [{ machine: HERE, found: 'quill' }, 'found'],
    [{ machine: HERE, found: Array.from({ length: 51 }, (_, i) => server(`t${String(i)}`)) }, 'found'],
    [{ machine: HERE, found: [{ ...server('quill'), kind: 'plugin' }] }, 'found'],
  ] as const) {
    const out = (await r.seen(args, loose())) as { ok: boolean; refusal?: { code: string; at?: string } };
    assert.equal(out.ok, false);
    assert.equal(out.refusal?.code, 'VALUE_MALFORMED');
    assert.equal(out.refusal?.at, at);
  }
  assert.equal((await tools(r)).length, count);
});

test("A TOOL OF THE USER CONFIG THAT A PROJECT HOLDS stamps the project's row, and makes no global copy", async () => {
  const r = await record();
  value(await r.seen({ machine: HERE, found: [server('copperleaf', { scope: 'project', source: '.mcp.json in this folder' })] }, inPortage()));
  const got = value<ToolsSeen>(await r.seen({ machine: THERE, found: [server('copperleaf')] }, loose()));
  assert.equal(got.tools[0]!.did, 'seen');
  const rows = await named(r, 'copperleaf');
  assert.equal(rows.length, 1, "one row, the project's");
  assert.deepEqual(rows[0]!.fields.hosts, [HERE, THERE]);
  /* One address under two names is still two tools: the name has to agree too. */
  const twin = value<ToolsSeen>(await r.seen({ machine: THERE, found: [server('copperleaf-two', { args: ['-y', '@pellucid/copperleaf-server'] })] }, loose()));
  assert.equal(twin.tools[0]!.did, 'added');
});

test('AN OPEN "ADD EVERYWHERE" QUESTION gives up a tool added directly since, so a yes makes one row', async () => {
  const r = await record();
  const asked = value<ToolsSeen>(await r.seen({ machine: HERE, found: [server('brightwell'), server('saltmarsh', { args: ['-y', 'saltmarsh-mcp'] })] }, inPortage()));
  const id = asked.tools[0]!.question!;
  assert.equal(value<ToolsSeen>(await r.seen({ machine: THERE, found: [server('brightwell')] }, loose())).tools[0]!.did, 'added');
  value(await r.api.decide({ id, decide: { option: 'accept', reason: 'Fine.' } } as never, owner));
  assert.equal((await named(r, 'brightwell')).length, 1, 'one brightwell');
  assert.equal((await named(r, 'saltmarsh')).length, 1, 'saltmarsh still added');

  /* A question left with nothing to add is closed as moot. */
  const lone = value<ToolsSeen>(await r.seen({ machine: HERE, found: [server('thimble')] }, inPortage('c-p2')));
  value(await r.seen({ machine: THERE, found: [server('thimble')] }, loose('c-l2')));
  const q = r.sql.one<{ status: string; resolved_as: string }>('SELECT status, resolved_as FROM suggestion WHERE id = ?', lone.tools[0]!.question!)!;
  assert.deepEqual([q.status, q.resolved_as], ['resolved', 'moot']);
  assert.equal((await named(r, 'thimble')).length, 1);
});

test('A RETIRED ROW AND A LIVE ONE OF ONE NAME: the sighting stamps the live one', async () => {
  const r = await record();
  value(await r.seen({ machine: HERE, found: [server('lantern')] }, loose()));
  const [old] = await named(r, 'lantern');
  value(r.api.kernel.update('tools', old!.id, { state: 'retired' }, { actor: 'p_1' } as never));
  const fresh = value<{ id: string }>(
    await r.api.create({ register: 'tools', fields: { name: 'lantern', kind: 'mcp', transport: 'stdio', command: 'npx', args: ['-y', '@pellucid/lantern-server'], state: 'active' } }, owner),
  );
  const got = value<ToolsSeen>(await r.seen({ machine: THERE, found: [server('lantern')] }, loose('c-two')));
  assert.equal(got.tools[0]!.did, 'seen');
  assert.equal(got.tools[0]!.row, r.api.kernel.nameOf(fresh.id));
  assert.deepEqual(r.api.kernel.get(fresh.id)?.fields.hosts, [THERE]);
});

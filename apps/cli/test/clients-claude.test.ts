/**
 * The clients table and Claude Code's module (`apps/cli/src/clients/`): the reader, the writer `writeTools` calls
 * through it, the copy kept before a run's first change, and the tools left out because they cannot run here.
 *
 * EVERY HOME IS A TEMPORARY ONE, so this machine's own `~/.claude.json` is never read. The record is a stand-in that
 * answers `get` alone, and `claude` is a stand-in that edits the files as `claude mcp add-json` and `remove` would.
 * The table is imported first, never `claude.ts` on its own (see `clients/index.ts`).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Brief, Client as BrainDog, Context } from '@braindog/client';

import { CLIENTS, clientOf, DEFAULT_CLIENT, foreignPath, onPath } from '../src/clients/index.ts';
import { looksLikeKey, writeTools, type ClaudeRunner } from '../src/tools.ts';

type After = { after: (fn: () => void) => void };
type Fields = { [k: string]: unknown };

const CLI = '/fake/braindog/apps/cli/src/main.ts';
const claude = clientOf('claude')!;

/** A home, a repository, and a folder on the path holding the programs named. */
function machine(t: After, programs: string[] = []) {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-clients-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const home = join(dir, 'home');
  const top = join(dir, 'repo');
  const bin = join(dir, 'bin');
  for (const d of [home, top, bin]) mkdirSync(d, { recursive: true });
  for (const p of programs) {
    writeFileSync(join(bin, p), '#!/bin/sh\n');
    chmodSync(join(bin, p), 0o755);
  }
  return { dir, home, top, bin, env: { PATH: bin }, claudeJson: join(home, '.claude.json'), mcpJson: join(top, '.mcp.json') };
}

const readJson = (file: string): Fields => JSON.parse(readFileSync(file, 'utf8')) as Fields;
const serversIn = (file: string): Fields => (readJson(file).mcpServers ?? {}) as Fields;

/** A record holding these tool rows, answering `get` for each. */
function record(rows: { fields: Fields; scope?: 'global' | 'project' }[]): { client: BrainDog; context: Context } {
  const briefs = rows.map((r, i) => ({ spoken: `tools#${String(i + 1)}`, version: 1, scope: r.scope ?? 'global', state: 'active', name: r.fields.name, kind: 'mcp', project: null }));
  const client = { get: async (_register: string, seq: number) => ({ ok: true, value: { seq, version: 1, fields: { kind: 'mcp', ...rows[seq - 1]!.fields } } }) };
  const context = { registers: [{ id: 'tools', name: 'Tools', rows: briefs as unknown as Brief[], inherited: [], truncated: false }] };
  return { client: client as unknown as BrainDog, context: context as unknown as Context };
}

/** A stand-in `claude`: each call is kept, and add-json and remove change the file of their scope as the real one does. */
function fakeClaude(m: ReturnType<typeof machine>, code: () => number = () => 0) {
  const calls: string[][] = [];
  const run: ClaudeRunner = async (args) => {
    calls.push(args);
    if (code() !== 0) return code();
    const [, verb, name = '', ...rest] = args;
    const file = rest.at(-1) === 'project' ? m.mcpJson : m.claudeJson;
    const json = existsSync(file) ? readJson(file) : {};
    const servers = (json.mcpServers ?? {}) as Fields;
    if (verb === 'add-json') servers[name] = JSON.parse(rest[0]!) as unknown;
    if (verb === 'remove') delete servers[name];
    writeFileSync(file, JSON.stringify({ ...json, mcpServers: servers }, null, 2));
    return 0;
  };
  return { calls, run };
}

/** Every file under a folder, with its text. */
function filesUnder(dir: string): { file: string; text: string }[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .map((f) => join(dir, f))
    .filter((f) => statSync(f).isFile())
    .map((file) => ({ file, text: readFileSync(file, 'utf8') }));
}

/* ── the table ─────────────────────────────────────────────────────────── */

test('THE TABLE holds Claude Code first, by its id, as the client tools write takes when none is named, then Codex, Cursor, Claude Desktop and VS Code', () => {
  assert.deepEqual(CLIENTS.map((c) => [c.id, c.title]), [['claude', 'Claude Code'], ['codex', 'Codex'], ['cursor', 'Cursor'], ['claude-desktop', 'Claude Desktop'], ['vscode', 'VS Code']]);
  assert.equal(DEFAULT_CLIENT, 'claude');
  assert.equal(clientOf('claude'), CLIENTS[0]);
  assert.equal(clientOf('nobody'), undefined);
  assert.equal(claude.remove('kiln', 'user'), 'claude mcp remove kiln --scope user');
});

test('FOUND: Claude Code is on a machine by its folder, its file, its profile or its program, and not on an empty one', (t) => {
  const bare = machine(t);
  assert.equal(claude.found(bare.home, bare.env), false);
  const withProgram = machine(t, ['claude']);
  assert.equal(claude.found(withProgram.home, withProgram.env), true);
  const withFolder = machine(t);
  mkdirSync(join(withFolder.home, '.claude'));
  assert.equal(claude.found(withFolder.home, withFolder.env), true);
  const withProfile = machine(t);
  assert.equal(claude.found(withProfile.home, { ...withProfile.env, CLAUDE_CONFIG_DIR: withProfile.top }), true);
});

test('ON THE PATH AND FROM ANOTHER SYSTEM: a program is a name on the path or a file here; a drive letter or another system\'s home is foreign', (t) => {
  const m = machine(t, ['kiln-mcp']);
  assert.equal(onPath('kiln-mcp', m.env, 'darwin'), true);
  assert.equal(onPath('gone-mcp', m.env, 'darwin'), false);
  assert.equal(onPath(join(m.bin, 'kiln-mcp'), {}, 'darwin'), true);
  assert.equal(onPath('./bin/kiln-mcp', {}, 'darwin', m.dir), true);
  assert.equal(onPath('', m.env, 'darwin'), false);
  writeFileSync(join(m.bin, 'kiln.cmd'), '@echo off\r\n');
  assert.equal(onPath('kiln', { Path: m.bin, PATHEXT: '.EXE;.CMD' }, 'win32'), true);

  assert.equal(foreignPath('C:\\Users\\someone\\server.exe', 'darwin'), 'windows');
  assert.equal(foreignPath('D:/tools/server.js', 'linux'), 'windows');
  assert.equal(foreignPath('\\\\share\\tools\\server.exe', 'darwin'), 'windows');
  assert.equal(foreignPath('C:\\Users\\someone\\server.exe', 'win32'), null);
  assert.equal(foreignPath('/home/nobody-braindog-test/server.js', 'darwin'), 'home');
  assert.equal(foreignPath('/Users/nobody-braindog-test/server.js', 'linux'), 'home');
  assert.equal(foreignPath('/home/nobody-braindog-test/server.js', 'linux'), null);
  assert.equal(foreignPath('npx', 'darwin'), null);
  assert.equal(foreignPath('-y', 'darwin'), null);
});

/* ── the reader ────────────────────────────────────────────────────────── */

test('THE READER finds the repository\'s servers, the person\'s global ones and this project\'s, in that order, and only this project\'s', (t) => {
  const m = machine(t);
  writeFileSync(m.mcpJson, JSON.stringify({ mcpServers: { glaze: { command: 'glaze-mcp' } } }));
  writeFileSync(
    m.claudeJson,
    JSON.stringify({
      oauthAccount: { emailAddress: 'someone@example.test' },
      mcpServers: { kiln: { command: 'kiln-mcp' } },
      projects: { [m.top]: { mcpServers: { quill: { type: 'http', url: 'https://quill.example/mcp' } } }, [m.dir]: { mcpServers: { other: { command: 'x' } } } },
    }),
  );
  assert.deepEqual(claude.servers(m.home, m.top, m.top), [
    { scope: 'project', source: '.mcp.json', writes: 'project', servers: { glaze: { command: 'glaze-mcp' } }, fault: null },
    { scope: 'global', source: '~/.claude.json', writes: 'user', servers: { kiln: { command: 'kiln-mcp' } }, fault: null },
    { scope: 'project', source: '~/.claude.json', writes: null, servers: { quill: { type: 'http', url: 'https://quill.example/mcp' } }, fault: null },
  ]);
  /* A run in no repository reads the person's file alone, and a run in a folder the person's file names reads that one's. */
  assert.deepEqual(claude.servers(m.home, null, m.dir).map((s) => [s.scope, s.source, Object.keys(s.servers as Fields)]), [
    ['global', '~/.claude.json', ['kiln']],
    ['project', '~/.claude.json', ['other']],
  ]);
});

test('THE READER says a file that is not JSON in one sentence and quotes none of it, and a missing file is no servers', (t) => {
  const m = machine(t);
  writeFileSync(m.mcpJson, '{ "mcpServers": { "kiln": { "env": { "KILN_API_TOKEN": "not-closed');
  const [repo, person] = claude.servers(m.home, m.top, m.top);
  assert.deepEqual(repo, { scope: 'project', source: '.mcp.json', writes: 'project', servers: undefined, fault: `${m.mcpJson} is not valid JSON, so its servers were not read.` });
  assert.deepEqual(person, { scope: 'global', source: '~/.claude.json', writes: 'user', servers: undefined, fault: null });
});

/* ── the writer ────────────────────────────────────────────────────────── */

const KILN = { name: 'kiln', transport: 'stdio', command: 'kiln-mcp', args: ['--quiet'], needs: ['KILN_API_TOKEN=credentials#1'] };
const DOCS = { name: 'docs', transport: 'http', endpoint: 'https://docs.example/mcp', needs: [] };
const GONE = { name: 'gone', transport: 'stdio', command: 'gone-mcp', args: [], needs: [] };
const WINDOWS = { name: 'ledger', transport: 'stdio', command: 'C:\\Users\\someone\\tools\\ledger.exe', args: [], needs: [] };
const ELSEWHERE = { name: 'atlas', transport: 'stdio', command: 'kiln-mcp', args: ['/home/nobody-braindog-test/atlas.js'], needs: [] };
const kilnEntry = { type: 'stdio', command: 'node', args: [CLI, 'keys', 'exec', 'credentials#1', '--as', 'KILN_API_TOKEN', '--', 'kiln-mcp', '--quiet'] };
const SKIPPED = [
  'Tool gone was not written, because its program gone-mcp is neither on this machine\'s path nor a file here.',
  'Tool ledger was not written, because it starts from a Windows path and this machine is not Windows.',
  'Tool atlas was not written, because it starts from a home folder of another computer.',
];

test('THE WRITER changes only BrainDog\'s entries, keeps a copy before its first write, and a second run changes nothing', async (t) => {
  const m = machine(t, ['kiln-mcp']);
  const theirs = { oauthAccount: { emailAddress: 'someone@example.test' }, mcpServers: { mine: { command: 'my-own', args: ['--x'] } }, projects: { '/work/kiln': { allowedTools: [] } } };
  writeFileSync(m.claudeJson, JSON.stringify(theirs, null, 2));
  const before = readFileSync(m.claudeJson, 'utf8');
  const rec = record([{ fields: KILN }, { fields: DOCS }, { fields: GONE }, { fields: WINDOWS }, { fields: ELSEWHERE }]);
  const fake = fakeClaude(m);
  const write = (dryRun = false) => writeTools({ ...rec, top: null, cwd: m.top, home: m.home, scope: 'user', dryRun, cli: CLI, claude: fake.run, env: m.env, platform: 'darwin' });

  assert.deepEqual(await write(), ['Tool kiln added at user scope.', 'Tool docs added at user scope.', ...SKIPPED]);
  assert.deepEqual(fake.calls.map((c) => c.slice(0, 3)), [['mcp', 'add-json', 'kiln'], ['mcp', 'add-json', 'docs']]);
  const after = readJson(m.claudeJson);
  assert.deepEqual(after.oauthAccount, theirs.oauthAccount);
  assert.deepEqual(after.projects, theirs.projects);
  assert.deepEqual(after.mcpServers, { ...theirs.mcpServers, kiln: kilnEntry, docs: { type: 'http', url: 'https://docs.example/mcp' } });
  assert.equal(readFileSync(`${m.claudeJson}.pre-braindog`, 'utf8'), before, 'the copy is the file as it was');
  assert.deepEqual(readdirSync(m.home).filter((f) => f.startsWith('.claude.json')).sort(), ['.claude.json', '.claude.json.pre-braindog']);

  const held = readFileSync(m.claudeJson, 'utf8');
  assert.deepEqual(await write(), SKIPPED);
  assert.equal(fake.calls.length, 2, 'claude is not run again');
  assert.equal(readFileSync(m.claudeJson, 'utf8'), held);
  assert.deepEqual(readdirSync(m.home).filter((f) => f.startsWith('.claude.json')).sort(), ['.claude.json', '.claude.json.pre-braindog']);

  /* No file this wrote, the lock included, holds anything shaped like a key. */
  for (const { file, text } of [...filesUnder(m.home), ...filesUnder(m.top)]) {
    assert.equal(looksLikeKey(text), false, `${file} holds a key's shape`);
    for (const piece of text.split(/[\s"',:{}[\]]+/)) assert.equal(/^(?:hb|sk|pk|rk|ghp|gho|ghs|ghu|github_pat|glpat|rec|AKIA)[_-]/i.test(piece), false, `${file} holds a token's prefix`);
  }
});

test('A DRY RUN plans every line and writes nothing: no file, no copy, no lock, and claude is not run', async (t) => {
  const m = machine(t, ['kiln-mcp']);
  writeFileSync(m.claudeJson, JSON.stringify({ mcpServers: {} }));
  const fake = fakeClaude(m);
  const rec = record([{ fields: KILN }, { fields: GONE }]);
  assert.deepEqual(await writeTools({ ...rec, top: null, cwd: m.top, home: m.home, scope: null, dryRun: true, cli: CLI, claude: fake.run, env: m.env, platform: 'darwin' }), [
    `+ kiln at user scope: ${JSON.stringify(kilnEntry)}`,
    SKIPPED[0],
    'Nothing was changed. Run braindog tools write --scope user for the global tools, or --scope project for this repository.',
  ]);
  assert.deepEqual(fake.calls, []);
  assert.deepEqual(readdirSync(m.home).sort(), ['.claude.json']);

  const plan = claude.plan({ name: 'kiln', scope: 'project', entry: kilnEntry, replace: true, home: m.home, top: m.top, cwd: m.top });
  assert.deepEqual(plan.lines, [`~ kiln at project scope, replacing the entry there: ${JSON.stringify(kilnEntry)}`]);
  assert.equal(plan.file, m.mcpJson);
  assert.equal(existsSync(m.mcpJson), false);
});

test('A PROJECT TOOL goes into the repository\'s file; an entry the scan read is replaced, and a later run\'s copy never takes the first one\'s name', async (t) => {
  const m = machine(t, ['kiln-mcp']);
  writeFileSync(m.mcpJson, JSON.stringify({ mcpServers: { kiln: { command: 'kiln-mcp', args: ['--quiet'], env: { KILN_REGION: 'north' } }, glaze: { command: 'glaze-mcp' } } }));
  const first = readFileSync(m.mcpJson, 'utf8');
  const fake = fakeClaude(m);
  const write = (rows: Fields[]) => writeTools({ ...record(rows.map((fields) => ({ fields, scope: 'project' }))), top: m.top, cwd: m.top, home: m.home, scope: 'project', dryRun: false, cli: CLI, claude: fake.run, env: m.env, platform: 'darwin' });

  assert.deepEqual(await write([KILN]), ['Tool kiln replaced at project scope.']);
  assert.deepEqual(fake.calls.map((c) => [c[1], c[2], c.at(-1)]), [['remove', 'kiln', 'project'], ['add-json', 'kiln', 'project']]);
  assert.deepEqual(serversIn(m.mcpJson), { glaze: { command: 'glaze-mcp' }, kiln: kilnEntry });
  assert.equal(readFileSync(`${m.mcpJson}.pre-braindog`, 'utf8'), first);
  assert.equal(existsSync(m.claudeJson), false, 'the person\'s file is not touched by a project write');

  const second = readFileSync(m.mcpJson, 'utf8');
  assert.deepEqual(await write([KILN, { ...DOCS, name: 'quill' }]), ['Tool quill added at project scope.']);
  assert.equal(readFileSync(`${m.mcpJson}.pre-braindog`, 'utf8'), first, 'the first copy is kept as it was');
  assert.equal(readFileSync(`${m.mcpJson}.bak`, 'utf8'), second);
});

test('CLAUDE NOT FOUND stops the run in one line, and the copy made for it goes again, since nothing changed', async (t) => {
  const m = machine(t, ['kiln-mcp']);
  writeFileSync(m.claudeJson, JSON.stringify({ mcpServers: {} }));
  const fake = fakeClaude(m, () => -1);
  const rec = record([{ fields: KILN }, { fields: DOCS }]);
  assert.deepEqual(await writeTools({ ...rec, top: null, cwd: m.top, home: m.home, scope: 'user', dryRun: false, cli: CLI, claude: fake.run, env: m.env, platform: 'darwin' }), ['claude was not found, so nothing was applied.']);
  assert.equal(fake.calls.length, 1);
  assert.deepEqual(readdirSync(m.home).sort(), ['.braindog', '.claude.json']);
  assert.deepEqual(readdirSync(join(m.home, '.braindog')), ['tools-lock.json']);
});

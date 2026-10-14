/**
 * Cursor in the clients table: found or not, its servers read with their `type` filled in, and its writer, which sets
 * one member of `mcpServers` by position and leaves every other byte of `mcp.json` as it was.
 *
 * EVERY HOME HERE IS A TEMPORARY FOLDER made from the invented samples in `fixtures/clients/`.
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cursor } from '../src/clients/cursor.ts';
import type { Want } from '../src/clients/index.ts';
import { looksLikeToken } from '../src/install.ts';
import { looksLikeKey } from '../src/tools.ts';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'clients');
const scratch = mkdtempSync(join(tmpdir(), 'braindog-cursor-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

let n = 0;
function home(sample: string | null = 'cursor-mcp.json'): { home: string; top: string; file: string } {
  const at = join(scratch, `h${String(++n)}`);
  mkdirSync(join(at, '.cursor'), { recursive: true });
  const file = join(at, '.cursor', 'mcp.json');
  if (sample !== null) cpSync(join(FIXTURES, sample), file);
  const top = join(at, 'repo');
  mkdirSync(join(top, '.cursor'), { recursive: true });
  cpSync(join(FIXTURES, 'cursor-project-mcp.json'), join(top, '.cursor', 'mcp.json'));
  return { home: at, top, file };
}

const want = (h: { home: string; top: string }, name: string, entry: Record<string, unknown>, o: Partial<Want> = {}): Want => ({ name, scope: 'user', entry, replace: false, home: h.home, top: h.top, cwd: h.top, ...o });
const TALLY = { type: 'stdio', command: 'tally-mcp', args: ['--quiet'] };
const write = async (w: Want, copied = new Set<string>()) => cursor.apply(cursor.plan(w), { run: async () => 0, copied });
const serversOf = (h: { home: string; top: string }) => (cursor.servers(h.home, h.top)[0]!.servers ?? {}) as Record<string, unknown>;

test('found when ~/.cursor is there, not otherwise', () => {
  assert.equal(cursor.found(home().home, {}), true);
  assert.equal(cursor.found(mkdtempSync(join(scratch, 'bare-')), {}), false);
});

test('the reader hands each server on with its type filled in, the person\'s and the repository\'s', () => {
  const h = home();
  const [user, project] = cursor.servers(h.home, h.top);
  assert.equal(user!.source, '~/.cursor/mcp.json');
  assert.equal(user!.writes, 'user');
  assert.deepEqual(user!.servers, {
    'server-name': { type: 'stdio', command: 'npx', args: ['-y', 'mcp-server'], env: { API_KEY: 'value' } },
    remote: { type: 'http', url: 'http://localhost:3000/mcp', headers: { 'X-Region': 'eu' } },
  });
  assert.deepEqual(project, {
    scope: 'project',
    source: '.cursor/mcp.json',
    writes: 'project',
    servers: { 'repo-tool': { type: 'stdio', command: 'node', args: ['${workspaceFolder}/tools/repo-mcp.mjs'], envFile: '${workspaceFolder}/.env' } },
    fault: null,
  });
});

test('a file that is not JSON is said without quoting it, and read as no servers', () => {
  const h = home(null);
  writeFileSync(h.file, '{ "mcpServers": { "a": { "env": { "K": "secret-ish" } } }, }');
  const [user] = cursor.servers(h.home, null);
  assert.deepEqual(user, { scope: 'global', source: '~/.cursor/mcp.json', writes: 'user', servers: undefined, fault: '~/.cursor/mcp.json is not valid JSON, so its servers were not read.' });
  assert.equal(cursor.plan(want(h, 'braindog', cursor.server)).file, null);
});

test('plan says the lines and writes nothing', () => {
  const h = home();
  const before = readFileSync(h.file, 'utf8');
  const plan = cursor.plan(want(h, 'braindog', cursor.server));
  assert.deepEqual(plan.lines, [`+ braindog for Cursor at user scope: ${JSON.stringify(cursor.server)}`]);
  assert.equal(readFileSync(h.file, 'utf8'), before);
  assert.deepEqual(readdirSync(join(h.home, '.cursor')), ['mcp.json']);
});

const member = (name: string, entry: unknown, indent = '    ') => `,\n${indent}${JSON.stringify(name)}: ${JSON.stringify(entry, null, 2).replaceAll('\n', `\n${indent}`)}`;
const AFTER_REMOTE = '      }\n    }\n  },\n  "otherSetting"';

test('apply adds only BrainDog\'s members in the file\'s own indent, keeps every other byte, and one copy', async () => {
  const h = home();
  const before = readFileSync(h.file, 'utf8');
  const copied = new Set<string>();
  const first = await write(want(h, 'braindog', cursor.server), copied);
  assert.deepEqual(first, { lines: ['The file as it was is kept beside it as mcp.json.pre-braindog.', 'Tool braindog added for Cursor at user scope.'], written: true, stop: false });
  assert.deepEqual((await write(want(h, 'tally', TALLY), copied)).lines, ['Tool tally added for Cursor at user scope.']);
  const added = member('braindog', cursor.server) + member('tally', TALLY);
  assert.equal(readFileSync(h.file, 'utf8'), before.replace(AFTER_REMOTE, `      }\n    }${added}\n  },\n  "otherSetting"`));
  assert.equal(readFileSync(`${h.file}.pre-braindog`, 'utf8'), before);
  const servers = serversOf(h);
  assert.deepEqual(servers.braindog, cursor.server, 'it reads back as the entry it was given, so tools.ts finds it the same');
  assert.deepEqual(servers.tally, TALLY);
  assert.deepEqual(JSON.parse(readFileSync(h.file, 'utf8')).otherSetting, true);
});

test('a second apply changes nothing and keeps no second copy', async () => {
  const h = home();
  await write(want(h, 'braindog', cursor.server));
  const once = readFileSync(h.file, 'utf8');
  assert.deepEqual((await write(want(h, 'braindog', cursor.server, { replace: true }))).lines, ['Tool braindog is already in Cursor at user scope.']);
  assert.equal(readFileSync(h.file, 'utf8'), once);
  assert.deepEqual(readdirSync(join(h.home, '.cursor')).sort(), ['mcp.json', 'mcp.json.pre-braindog']);
});

test('a replace puts the new value where the old one stood, token and all gone, and nothing else moves', async () => {
  const h = home(null);
  const old = `{\n\t"mcpServers": {\n\t\t"braindog": { "command": "old", "env": { "TOKEN": "ghp_${'a1B2'.repeat(9)}" } },\n\t\t"mine": { "command": "x" }\n\t}\n}\n`;
  writeFileSync(h.file, old);
  assert.equal((await write(want(h, 'braindog', cursor.server, { replace: true }))).written, true);
  const text = readFileSync(h.file, 'utf8');
  const value = JSON.stringify(cursor.server, null, '\t').replaceAll('\n', '\n\t\t');
  assert.equal(text, `{\n\t"mcpServers": {\n\t\t"braindog": ${value},\n\t\t"mine": { "command": "x" }\n\t}\n}\n`);
  assert.doesNotMatch(text, /ghp_|TOKEN/);
});

test('a server that is not BrainDog\'s is left; a repository\'s tool goes in .cursor/mcp.json, made when missing', async () => {
  const h = home();
  assert.deepEqual(cursor.plan(want(h, 'remote', TALLY)).lines, ["Tool remote is already in Cursor's servers and is not BrainDog's, so it is left."]);
  assert.equal(cursor.plan(want(h, 'tally', TALLY, { scope: 'project', top: null })).file, null);
  rmSync(join(h.top, '.cursor'), { recursive: true });
  assert.deepEqual((await write(want(h, 'tally', TALLY, { scope: 'project' }))).lines, ['Tool tally added for Cursor at project scope.']);
  assert.equal(readFileSync(join(h.top, '.cursor', 'mcp.json'), 'utf8'), `${JSON.stringify({ mcpServers: { tally: TALLY } }, null, 2)}\n`);
});

test('a file with no mcpServers, an empty one, and one on a single line each take the member as they are written', async () => {
  const h = home(null);
  writeFileSync(h.file, '{\n  "theme": "dark"\n}\n');
  await write(want(h, 'tally', TALLY));
  assert.equal(readFileSync(h.file, 'utf8'), `{\n  "theme": "dark"${member('mcpServers', { tally: TALLY }, '  ')}\n}\n`);
  writeFileSync(h.file, '{\n  "mcpServers": {}\n}\n');
  await write(want(h, 'tally', TALLY));
  assert.equal(readFileSync(h.file, 'utf8'), `{\n  "mcpServers": {\n    "tally": ${JSON.stringify(TALLY, null, 2).replaceAll('\n', '\n    ')}\n  }\n}\n`);
  writeFileSync(h.file, '{"mcpServers": {"a": {"command": "x"}}}');
  await write(want(h, 'tally', TALLY));
  assert.equal(readFileSync(h.file, 'utf8'), `{"mcpServers": {"a": {"command": "x"}, "tally": ${JSON.stringify(TALLY)}}}`);
});

test('an HTTP tool is written by its url alone, reads back as the entry, and no written byte is shaped like a token', async () => {
  const h = home(null);
  writeFileSync(h.file, '{}\n');
  const done = await write(want(h, 'remote', { type: 'http', url: 'https://tools.example/mcp', headersHelper: 'node "/m.ts" keys headers credentials#4 --as X-Key' }));
  assert.match(done.lines[0] ?? '', /^Tool remote: its key header is left out for Cursor/);
  assert.deepEqual(serversOf(h).remote, { type: 'http', url: 'https://tools.example/mcp' });
  await write(want(h, 'braindog', cursor.server));
  await write(want(h, 'tally', TALLY));
  const text = readFileSync(h.file, 'utf8');
  assert.equal(looksLikeKey(text), false);
  for (const piece of text.split(/[\s"'/\\,:{}[\]]+/).filter((p) => p !== '')) assert.equal(looksLikeToken(piece), false, piece);
});

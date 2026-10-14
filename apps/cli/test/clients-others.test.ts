/**
 * Claude Desktop and VS Code in the clients table (`clients/others.ts`): found or not, their servers read in the
 * `mcpServers` shape with `type` filled in, and their writers, which set one member by position and leave every other
 * byte of the file as it was, keep one copy aside, and never write a key.
 *
 * EVERY HOME HERE IS A TEMPORARY FOLDER made from the invented samples in `fixtures/clients/others/`, laid out as the
 * apps' documents put them on a Mac (`claudeDesktopFor('darwin')`, `vscodeFor('darwin')`), whatever this machine is.
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CLIENTS, type Want } from '../src/clients/index.ts';
import { claudeDesktop, claudeDesktopFor, vscode, vscodeFor } from '../src/clients/others.ts';
import { looksLikeToken } from '../src/install.ts';
import { looksLikeKey } from '../src/tools.ts';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'clients', 'others');
const scratch = mkdtempSync(join(tmpdir(), 'braindog-others-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

const desktop = claudeDesktopFor('darwin');
const code = vscodeFor('darwin');

let n = 0;
/** A Mac-shaped home with Claude Desktop's and VS Code's files from the samples (null leaves that file out), and a repository. */
function home(o: { desktop?: string | null; code?: string | null; workspace?: string | null } = {}) {
  const at = join(scratch, `h${String(++n)}`);
  const support = join(at, 'Library', 'Application Support');
  const desktopFile = join(support, 'Claude', 'claude_desktop_config.json');
  const codeFile = join(support, 'Code', 'User', 'mcp.json');
  mkdirSync(dirname(desktopFile), { recursive: true });
  mkdirSync(dirname(codeFile), { recursive: true });
  const top = join(at, 'repo');
  mkdirSync(join(top, '.vscode'), { recursive: true });
  const sample = { desktop: 'claude-desktop-config.json', code: 'vscode-mcp.json', workspace: 'vscode-workspace-mcp.json', ...o };
  if (sample.desktop !== null) cpSync(join(FIXTURES, sample.desktop), desktopFile);
  if (sample.code !== null) cpSync(join(FIXTURES, sample.code), codeFile);
  if (sample.workspace !== null) cpSync(join(FIXTURES, sample.workspace), join(top, '.vscode', 'mcp.json'));
  return { home: at, top, desktopFile, codeFile };
}

type Home = ReturnType<typeof home>;
const want = (h: Home, name: string, entry: Record<string, unknown>, o: Partial<Want> = {}): Want => ({ name, scope: 'user', entry, replace: false, home: h.home, top: h.top, cwd: h.top, ...o });
const TALLY = { type: 'stdio', command: 'tally-mcp', args: ['--quiet'] };
const REMOTE = { type: 'http', url: 'https://tools.example/mcp', headersHelper: 'node "/m.ts" keys headers credentials#4 --as X-Key' };
const write = async (c: typeof desktop, w: Want, copied = new Set<string>()) => c.apply(c.plan(w), { run: async () => 0, copied });
const serversOf = (c: typeof desktop, h: Home) => (c.servers(h.home, h.top)[0]!.servers ?? {}) as Record<string, unknown>;
const member = (name: string, entry: unknown, indent: string, unit: string) =>
  `,\n${indent}${JSON.stringify(name)}: ${JSON.stringify(entry, null, unit).replaceAll('\n', `\n${indent}`)}`;

/** Every file under a folder, by its path. */
function files(dir: string, out: Record<string, string> = {}): Record<string, string> {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) files(p, out);
    else out[p] = readFileSync(p, 'utf8');
  }
  return out;
}

test('THE TWO ARE IN THE TABLE after Cursor, each with BrainDog\'s own entry run as another app', () => {
  assert.deepEqual(CLIENTS.map((c) => c.id).slice(3), ['claude-desktop', 'vscode']);
  assert.equal(CLIENTS[3], claudeDesktop);
  assert.equal(CLIENTS[4], vscode);
  for (const c of [desktop, code]) assert.deepEqual((c.server.args as string[]).slice(-3), ['mcp', '--agent', 'other']);
  assert.equal(desktop.remove('kiln', 'user'), 'an edit of ~/Library/Application Support/Claude/claude_desktop_config.json, taking out mcpServers.kiln');
  assert.equal(code.remove('kiln', 'project'), 'an edit of .vscode/mcp.json, taking out servers.kiln');
});

test('FOUND by each app\'s own folder, not in a bare home, and Claude Desktop never where its document gives no path', () => {
  const h = home();
  assert.equal(desktop.found(h.home, {}), true);
  assert.equal(code.found(h.home, {}), true);
  const bare = mkdtempSync(join(scratch, 'bare-'));
  assert.equal(desktop.found(bare, {}), false);
  assert.equal(code.found(bare, {}), false);

  /* ON WINDOWS, a home that is not this machine's is taken at its default %APPDATA%. */
  mkdirSync(join(bare, 'AppData', 'Roaming', 'Claude'), { recursive: true });
  assert.equal(claudeDesktopFor('win32').found(bare, { APPDATA: join(scratch, 'elsewhere') }), true);
  assert.equal(claudeDesktopFor('win32').servers(bare, null)[0]!.source, '%APPDATA%\\Claude\\claude_desktop_config.json');

  /* ON LINUX, VS Code is ~/.config/Code/User, and Claude Desktop is not found, read or written. */
  mkdirSync(join(bare, '.config', 'Code', 'User'), { recursive: true });
  mkdirSync(join(bare, '.config', 'Claude'), { recursive: true });
  assert.equal(vscodeFor('linux').found(bare, {}), true);
  const linux = claudeDesktopFor('linux');
  assert.equal(linux.found(bare, {}), false);
  assert.deepEqual(linux.servers(bare, null), []);
  assert.deepEqual(linux.plan({ name: 'braindog', scope: 'user', entry: linux.server, replace: false, home: bare, top: null, cwd: bare }).lines, [
    'Tool braindog is not written for Claude Desktop, whose servers file on this system its documents do not give.',
  ]);
});

test('THE READERS hand each server on in the mcpServers shape with its type filled in, VS Code\'s workspace after the person\'s', () => {
  const h = home();
  const [own, none] = desktop.servers(h.home, h.top);
  assert.equal(none, undefined, 'Claude Desktop keeps no servers for a repository');
  assert.deepEqual(own, {
    scope: 'global',
    source: '~/Library/Application Support/Claude/claude_desktop_config.json',
    writes: 'user',
    servers: {
      filesystem: { type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '/Users/username/Desktop'] },
      'brave-search': { type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-brave-search'], env: { BRAVE_API_KEY: '...' } },
    },
    fault: null,
  });
  const [user, project] = code.servers(h.home, h.top);
  assert.equal(user!.source, '~/Library/Application Support/Code/User/mcp.json');
  assert.deepEqual(user!.servers, {
    'io.github.github/github-mcp-server': { type: 'http', url: 'https://api.example.com/mcp/', gallery: 'https://gallery.example.com', version: '1.0.0' },
    memory: { type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-memory'], env: { API_KEY: '${input:api-key}' } },
  });
  assert.deepEqual(project, {
    scope: 'project',
    source: '.vscode/mcp.json',
    writes: 'project',
    servers: { 'repo-tool': { type: 'stdio', command: 'node', args: ['${workspaceFolder}/tools/repo-mcp.mjs'], envFile: '${workspaceFolder}/.env' } },
    fault: null,
  });
  /* A HOME WITH NO FILE YET reads as no servers, and is no fault. */
  const empty = home({ desktop: null, code: null, workspace: null });
  assert.equal(desktop.servers(empty.home, null)[0]!.servers, undefined);
  assert.equal(code.servers(empty.home, empty.top)[1]!.fault, null);
});

test('a file that is not JSON is said without quoting it, read as no servers, and never written', () => {
  const h = home({ code: null });
  writeFileSync(h.codeFile, '{\n\t// mine\n\t"servers": { "a": { "env": { "K": "secret-ish" } } },\n}');
  const [user] = code.servers(h.home, null);
  assert.deepEqual(user, { scope: 'global', source: '~/Library/Application Support/Code/User/mcp.json', writes: 'user', servers: undefined, fault: '~/Library/Application Support/Code/User/mcp.json is not valid JSON, so its servers were not read.' });
  const plan = code.plan(want(h, 'braindog', code.server));
  assert.equal(plan.file, null);
  assert.deepEqual(plan.lines, [user!.fault]);
});

test('plan says the lines and writes nothing', () => {
  const h = home();
  const before = files(h.home);
  const plan = desktop.plan(want(h, 'braindog', desktop.server));
  assert.deepEqual(plan.lines, [`+ braindog for Claude Desktop at user scope: ${JSON.stringify(desktop.server)}`]);
  assert.equal(plan.file, h.desktopFile);
  assert.deepEqual(code.plan(want(h, 'tally', TALLY)).lines, [`+ tally for VS Code at user scope: ${JSON.stringify(TALLY)}`]);
  assert.deepEqual(files(h.home), before);
});

test('CLAUDE DESKTOP AS A REAL INSTALL HOLDS IT (no mcpServers yet, no last newline): the member is added and nothing else moves, with one copy', async () => {
  const h = home({ desktop: 'claude-desktop-bare.json' });
  const before = readFileSync(h.desktopFile, 'utf8');
  const copied = new Set<string>();
  const first = await write(desktop, want(h, 'braindog', desktop.server), copied);
  assert.deepEqual(first, { lines: ['The file as it was is kept beside it as claude_desktop_config.json.pre-braindog.', 'Tool braindog added for Claude Desktop at user scope.'], written: true, stop: false });
  const entry = { command: desktop.server.command, args: desktop.server.args };
  assert.equal(readFileSync(h.desktopFile, 'utf8'), before.replace(/\n  }\n}$/, `\n  }${member('mcpServers', { braindog: entry }, '  ', '  ')}\n}`));
  assert.equal(readFileSync(`${h.desktopFile}.pre-braindog`, 'utf8'), before);
  /* IT READS BACK AS BRAINDOG'S OWN ENTRY, type and all, so setup's next run finds it registered. */
  assert.deepEqual(serversOf(desktop, h).braindog, desktop.server);

  /* A SECOND TOOL GOES IN AFTER IT, with no second copy; the same one again changes nothing. */
  assert.deepEqual((await write(desktop, want(h, 'tally', TALLY), copied)).lines, ['Tool tally added for Claude Desktop at user scope.']);
  const once = readFileSync(h.desktopFile, 'utf8');
  assert.deepEqual((await write(desktop, want(h, 'braindog', desktop.server, { replace: true }))).lines, ['Tool braindog is already in Claude Desktop at user scope.']);
  assert.equal(readFileSync(h.desktopFile, 'utf8'), once);
  assert.deepEqual(readdirSync(dirname(h.desktopFile)).sort(), ['claude_desktop_config.json', 'claude_desktop_config.json.pre-braindog']);
  assert.deepEqual(JSON.parse(once).preferences, { sidebarMode: 'chat' });
});

test('VS CODE IN TABS: the member goes after the last server in the file\'s own indent, inputs and the gallery\'s fields kept', async () => {
  const h = home();
  const before = readFileSync(h.codeFile, 'utf8');
  const done = await write(code, want(h, 'braindog', code.server));
  assert.deepEqual(done.lines, ['The file as it was is kept beside it as mcp.json.pre-braindog.', 'Tool braindog added for VS Code at user scope.']);
  assert.equal(readFileSync(h.codeFile, 'utf8'), before.replace('\n\t},\n\t"inputs"', `${member('braindog', code.server, '\t\t', '\t')}\n\t},\n\t"inputs"`));
  assert.equal(readFileSync(`${h.codeFile}.pre-braindog`, 'utf8'), before);
  assert.deepEqual(serversOf(code, h).braindog, code.server);
  assert.deepEqual(serversOf(code, h)['io.github.github/github-mcp-server'], { type: 'http', url: 'https://api.example.com/mcp/', gallery: 'https://gallery.example.com', version: '1.0.0' });
});

test('a replace puts the new value where the old one stood, token and all gone; a server not BrainDog\'s is left', async () => {
  const h = home({ desktop: null });
  writeFileSync(h.desktopFile, `{\n  "mcpServers": {\n    "braindog": { "command": "old", "env": { "TOKEN": "ghp_${'a1B2'.repeat(9)}" } },\n    "mine": { "command": "x" }\n  }\n}\n`);
  assert.deepEqual(desktop.plan(want(h, 'mine', TALLY)).lines, ["Tool mine is already in Claude Desktop's servers and is not BrainDog's, so it is left."]);
  assert.equal((await write(desktop, want(h, 'braindog', desktop.server, { replace: true }))).written, true);
  const text = readFileSync(h.desktopFile, 'utf8');
  const value = JSON.stringify({ command: desktop.server.command, args: desktop.server.args }, null, 2).replaceAll('\n', '\n    ');
  assert.equal(text, `{\n  "mcpServers": {\n    "braindog": ${value},\n    "mine": { "command": "x" }\n  }\n}\n`);
  assert.doesNotMatch(text, /ghp_|TOKEN/);
});

test('A REPOSITORY\'S TOOL goes in .vscode/mcp.json, made when missing; Claude Desktop keeps none and says so', async () => {
  const h = home({ workspace: null });
  rmSync(join(h.top, '.vscode'), { recursive: true });
  assert.deepEqual(desktop.plan(want(h, 'tally', TALLY, { scope: 'project' })).lines, [
    "Tool tally is a repository's, and Claude Desktop keeps no servers for a repository, so it is not written there.",
  ]);
  assert.equal(code.plan(want(h, 'tally', TALLY, { scope: 'project', top: null })).file, null);
  assert.deepEqual((await write(code, want(h, 'tally', TALLY, { scope: 'project' }))).lines, ['Tool tally added for VS Code at project scope.']);
  assert.equal(readFileSync(join(h.top, '.vscode', 'mcp.json'), 'utf8'), `${JSON.stringify({ servers: { tally: TALLY } }, null, 2)}\n`);
  assert.ok(!existsSync(join(h.top, '.vscode', 'mcp.json.pre-braindog')), 'a file made new needs no copy');
});

test('AN HTTP TOOL WITH A KEY HEADER: VS Code takes it by its url alone, Claude Desktop says why not, and no file holds a key', async () => {
  const h = home();
  const vs = await write(code, want(h, 'remote', REMOTE));
  assert.match(vs.lines[0] ?? '', /^Tool remote: its key header is left out for VS Code/);
  assert.deepEqual(serversOf(code, h).remote, { type: 'http', url: 'https://tools.example/mcp' });
  const cd = await write(desktop, want(h, 'remote', REMOTE));
  assert.deepEqual(cd, { lines: ['Tool remote is not written for Claude Desktop, which adds a server reached by a url in the app, not in its file.'], written: false, stop: false });
  /* A STDIO TOOL WITH AN ENV IS WRITTEN WITHOUT IT, and the line says so. */
  const withEnv = await write(desktop, want(h, 'tally', { ...TALLY, env: { TALLY_KEY: `sk-${'x9Y8'.repeat(10)}` } }));
  assert.equal(withEnv.lines.at(-1), 'Tool tally added for Claude Desktop at user scope.');
  assert.ok(withEnv.lines.includes('Tool tally: settings other than its command and arguments are left out of its entry for Claude Desktop.'));
  await write(desktop, want(h, 'braindog', desktop.server));
  await write(code, want(h, 'braindog', code.server));
  for (const file of [h.desktopFile, h.codeFile]) {
    const text = readFileSync(file, 'utf8');
    assert.equal(looksLikeKey(text), false, file);
    assert.doesNotMatch(text, /sk-|TALLY_KEY|headersHelper|credentials#/);
    for (const piece of text.split(/[\s"'/\\,:{}[\]]+/).filter((p) => p !== '')) assert.equal(looksLikeToken(piece), false, piece);
  }
});

test('apply decides again from the file as it is now: a tool turned away at plan is not written, and a stale plan writes nothing', async () => {
  const h = home();
  const plan = code.plan(want(h, 'tally', TALLY));
  writeFileSync(h.codeFile, '{ "servers": { "tally": { "type": "stdio", "command": "theirs" } } }');
  const done = await code.apply(plan, { run: async () => 0, copied: new Set() });
  assert.deepEqual(done, { lines: ["Tool tally is already in VS Code's servers and is not BrainDog's, so it is left."], written: false, stop: false });
  const linux = claudeDesktopFor('linux');
  const none = linux.plan(want(h, 'tally', TALLY));
  assert.deepEqual(await linux.apply(none, { run: async () => 0, copied: new Set() }), { lines: none.lines, written: false, stop: false });
});

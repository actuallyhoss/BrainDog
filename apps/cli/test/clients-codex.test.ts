/**
 * Codex in the clients table: found or not, its servers read as `tools.ts` reads Claude Code's, and its writer, which
 * puts in or replaces one server's table and leaves every other byte of `config.toml` as it was.
 *
 * EVERY HOME HERE IS A TEMPORARY FOLDER made from the invented samples in `fixtures/clients/`, and `CODEX_HOME` is
 * cleared, so the machine's own Codex is never read.
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { codex, parseToml } from '../src/clients/codex.ts';
import type { Want } from '../src/clients/index.ts';
import { looksLikeToken } from '../src/install.ts';
import { looksLikeKey } from '../src/tools.ts';

delete process.env.CODEX_HOME;
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'clients');
const scratch = mkdtempSync(join(tmpdir(), 'braindog-codex-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

let n = 0;
/** A home holding Codex's sample file, and a repository holding the sample repository file. */
function home(sample: string | null = 'codex-config.toml'): { home: string; top: string; file: string } {
  const at = join(scratch, `h${String(++n)}`);
  mkdirSync(join(at, '.codex'), { recursive: true });
  const file = join(at, '.codex', 'config.toml');
  if (sample !== null) cpSync(join(FIXTURES, sample), file);
  const top = join(at, 'repo');
  mkdirSync(join(top, '.codex'), { recursive: true });
  cpSync(join(FIXTURES, 'codex-project.toml'), join(top, '.codex', 'config.toml'));
  return { home: at, top, file };
}

const want = (h: { home: string; top: string }, name: string, entry: Record<string, unknown>, o: Partial<Want> = {}): Want => ({ name, scope: 'user', entry, replace: false, home: h.home, top: h.top, cwd: h.top, ...o });
const TALLY = { type: 'stdio', command: 'tally-mcp', args: ['--quiet'] };
const write = async (w: Want, copied = new Set<string>()) => codex.apply(codex.plan(w), { run: async () => 0, copied });
const serversOf = (h: { home: string; top: string }) => codex.servers(h.home, h.top) as { servers: Record<string, unknown> }[];

test('found when its folder is in the home or CODEX_HOME names one, not otherwise', () => {
  const h = home();
  assert.equal(codex.found(h.home, {}), true);
  const bare = mkdtempSync(join(scratch, 'bare-'));
  assert.equal(codex.found(bare, {}), false);
  assert.equal(codex.found(bare, { CODEX_HOME: join(h.home, '.codex') }), true);
});

test('the reader hands every server on in the mcpServers shape, variables by name, the rest passed through', () => {
  const h = home();
  const [user, project] = codex.servers(h.home, h.top);
  assert.deepEqual({ ...user, servers: undefined }, { scope: 'global', source: '~/.codex/config.toml', writes: 'user', servers: undefined, fault: null });
  assert.deepEqual(user!.servers, {
    context7: { type: 'stdio', command: 'npx', args: ['-y', '@upstash/context7-mcp'], env: { MY_ENV_VAR: 'MY_ENV_VALUE', CONTEXT7_API_KEY: 'ctx7-invented-value-not-a-key', LOCAL_TOKEN: '${LOCAL_TOKEN}' } },
    figma: { type: 'http', url: 'https://mcp.figma.example/mcp', headers: { 'X-Figma-Region': 'us-east-1', Authorization: 'Bearer ${FIGMA_OAUTH_TOKEN}' } },
    'docs.search': { type: 'stdio', command: 'uvx', args: ['docs-search-mcp', '--port', '0'], startup_timeout_sec: 20, enabled: false },
  });
  assert.equal(project!.writes, 'project');
  assert.deepEqual(project!.servers, { tallyrepo: { type: 'stdio', command: 'node', args: ['scripts/tally-mcp.mjs'], env: { TALLY_MODE: 'read' } } });
  assert.equal(codex.servers(h.home, null).length, 1);
});

test('a file that is not TOML is said by its line and read as no servers', () => {
  const h = home(null);
  writeFileSync(h.file, 'model = "x"\n[mcp_servers.a\ncommand = "secret-ish"\n');
  const [user] = codex.servers(h.home, null);
  assert.equal(user!.servers, undefined);
  assert.match(user!.fault ?? '', /^~\/\.codex\/config\.toml could not be read as TOML \(line 2: /);
  assert.doesNotMatch(user!.fault ?? '', /secret-ish/);
});

test('a multi-line string that holds a table header is text, not a table', () => {
  const toml = parseToml('notes = """\n[mcp_servers.fake]\ncommand = "x"\n"""\n[mcp_servers.real]\ncommand = \'y\'\n');
  assert.deepEqual(Object.keys(toml.data.mcp_servers as object), ['real']);
  assert.equal((toml.data.notes as string).startsWith('[mcp_servers.fake]'), true);
});

test('plan says the lines and writes nothing', () => {
  const h = home();
  const before = readFileSync(h.file, 'utf8');
  const plan = codex.plan(want(h, 'braindog', codex.server));
  assert.deepEqual(plan.lines, [`+ braindog for Codex at user scope: ${JSON.stringify(codex.server)}`]);
  assert.equal(plan.file, h.file);
  assert.equal(readFileSync(h.file, 'utf8'), before);
  assert.deepEqual(readdirSync(join(h.home, '.codex')), ['config.toml']);
});

test('apply adds only BrainDog\'s tables, keeps every other byte, and keeps one copy of the file as it was', async () => {
  const h = home();
  const before = readFileSync(h.file, 'utf8');
  const copied = new Set<string>();
  const first = await write(want(h, 'braindog', codex.server), copied);
  assert.deepEqual(first, { lines: ['The file as it was is kept beside it as config.toml.pre-braindog.', 'Tool braindog added for Codex at user scope.'], written: true, stop: false });
  const second = await write(want(h, 'tally', TALLY), copied);
  assert.deepEqual(second.lines, ['Tool tally added for Codex at user scope.']);
  const after = readFileSync(h.file, 'utf8');
  assert.equal(after.slice(0, before.length), before, 'every byte that was there is still there');
  const main = (codex.server.args as string[])[0]!;
  assert.equal(after.slice(before.length), `\n[mcp_servers.braindog]\ncommand = "node"\nargs = [${JSON.stringify(main)}, "mcp", "--agent", "codex"]\n\n[mcp_servers.tally]\ncommand = "tally-mcp"\nargs = ["--quiet"]\n`);
  assert.equal(readFileSync(`${h.file}.pre-braindog`, 'utf8'), before);
  const servers = serversOf(h)[0]!.servers;
  assert.deepEqual(servers.braindog, codex.server, 'it reads back as the entry it was given, so tools.ts finds it the same');
  assert.deepEqual(servers.tally, TALLY);
});

test('a second apply changes nothing and keeps no second copy', async () => {
  const h = home();
  await write(want(h, 'braindog', codex.server));
  const once = readFileSync(h.file, 'utf8');
  const again = await write(want(h, 'braindog', codex.server, { replace: true }));
  assert.deepEqual(again.lines, ['Tool braindog is already in Codex at user scope.']);
  assert.equal(readFileSync(h.file, 'utf8'), once);
  assert.deepEqual(readdirSync(join(h.home, '.codex')).sort(), ['config.toml', 'config.toml.pre-braindog']);
});

test('a replace takes out the old table and its subtables, token and all, and nothing else', async () => {
  const h = home();
  const head = readFileSync(h.file, 'utf8');
  const tail = '\n[projects."/x"]\ntrust_level = "trusted"\n';
  writeFileSync(h.file, `${head}\n[mcp_servers.braindog]\ncommand = "old-brain"\n\n[mcp_servers.braindog.env]\nOLD_TOKEN = "ghp_${'a1B2'.repeat(9)}"\n${tail}`);
  const done = await write(want(h, 'braindog', codex.server, { replace: true }));
  assert.equal(done.written, true);
  const text = readFileSync(h.file, 'utf8');
  assert.equal(text.startsWith(`${head}\n[mcp_servers.braindog]\ncommand = "node"\n`), true);
  assert.equal(text.endsWith(`"--agent", "codex"]\n${tail}`), true);
  assert.doesNotMatch(text, /OLD_TOKEN|ghp_/);
});

test('a server that is not BrainDog\'s, or is written inline, is left', async () => {
  const h = home();
  const before = readFileSync(h.file, 'utf8');
  const taken = codex.plan(want(h, 'context7', TALLY));
  assert.deepEqual(taken, { want: want(h, 'context7', TALLY), file: null, lines: ["Tool context7 is already in Codex's servers and is not BrainDog's, so it is left."] });
  assert.equal((await codex.apply(taken, { run: async () => 0, copied: new Set() })).written, false);
  writeFileSync(h.file, `${before}\n[mcp_servers]\nbraindog = { command = "x" }\n`);
  const inline = codex.plan(want(h, 'braindog', codex.server, { replace: true }));
  assert.deepEqual(inline.lines, ["Tool braindog is written in Codex's file in a form BrainDog does not change, so it is left."]);
});

test('a repository\'s tool goes into its .codex/config.toml, which is made when missing', async () => {
  const h = home();
  rmSync(join(h.top, '.codex'), { recursive: true });
  const none = codex.plan(want(h, 'tally', TALLY, { scope: 'project', top: null }));
  assert.equal(none.file, null);
  const done = await write(want(h, 'tally', TALLY, { scope: 'project' }));
  assert.deepEqual(done.lines, ['Tool tally added for Codex at project scope.']);
  assert.equal(readFileSync(join(h.top, '.codex', 'config.toml'), 'utf8'), '[mcp_servers.tally]\ncommand = "tally-mcp"\nargs = ["--quiet"]\n');
});

test('an HTTP tool is written by its url alone, its key header said and left out; CRLF files stay CRLF', async () => {
  const h = home(null);
  writeFileSync(h.file, 'model = "x"\r\n');
  const done = await write(want(h, 'remote', { type: 'http', url: 'https://tools.example/mcp', headersHelper: 'node "/m.ts" keys headers credentials#4 --as X-Key' }));
  assert.match(done.lines[0] ?? '', /^Tool remote: its key header is left out for Codex/);
  assert.equal(readFileSync(h.file, 'utf8'), 'model = "x"\r\n\r\n[mcp_servers.remote]\r\nurl = "https://tools.example/mcp"\r\n');
});

test('no file BrainDog writes holds anything shaped like a token', async () => {
  const h = home('codex-project.toml');
  await write(want(h, 'braindog', codex.server));
  await write(want(h, 'tally', TALLY));
  await write(want(h, 'remote', { type: 'http', url: 'https://tools.example/mcp', headersHelper: 'node "/m.ts" keys headers credentials#4 --as X-Key' }));
  const before = readFileSync(join(FIXTURES, 'codex-project.toml'), 'utf8');
  const added = readFileSync(h.file, 'utf8').slice(before.length);
  assert.equal(existsSync(h.file), true);
  assert.equal(looksLikeKey(added), false);
  for (const piece of added.split(/[\s"'/\\,=[\]]+/).filter((p) => p !== '')) assert.equal(looksLikeToken(piece), false, piece);
});

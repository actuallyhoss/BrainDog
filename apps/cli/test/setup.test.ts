/**
 * his "Hooks install shows changes first": `braindog setup` step 2 prints the lines it will add to Claude
 * Code's settings before any file changes, asks on a terminal, writes with `--yes` without asking, and off a terminal
 * with no `--yes` stops after the plan and says how to go on.
 *
 * MEASURED BEFORE THIS EXISTED: step 2 ran `install --apply` first and printed what it had done after, so the first a
 * person saw of a hook that runs in every session was the line saying it was in.
 *
 * NO NETWORK IS NEEDED BEFORE STEP 4: a login is held through `BRAINDOG_TOKEN`, `claude` is a stub, and the host is a
 * closed port on this machine, so a run that goes past step 3 stops at step 4 with its own sentence.
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CLIENTS, type Client } from '../src/clients/index.ts';
import { claudeDesktopFolder, vscodeUserFolder } from '../src/clients/others.ts';
import { hostKey, keyPrint, readHosts, saveHosts, target } from '../src/http.ts';
import { HOOK_STATUS, keepCopy } from '../src/install.ts';
import { logout } from '../src/logout.ts';
import { LAUNCH } from '../../site/src/lib/launch.ts';
import { NOT_AN_OWNER_KEY, PLUGIN_LINE, REPO_PUBLIC, agentKindOf, agentTokens, profilesFile, setup, type ProfileRunner, type SetupIo } from '../src/setup.ts';
import { keepPin, pinOf, pinsFile } from '../src/pins.ts';
import { renderEntry } from '../src/tools.ts';

const scratch = mkdtempSync(join(tmpdir(), 'braindog-setup-'));

/** Whether setup said a step's line, numbered or under its step's number: `stepsOnce` numbers a step's first line only. */
const saidStep = (out: readonly string[], line: string): boolean => {
  const m = /^(\d+[a-z]?\. )(.*)$/su.exec(line);
  return m !== null && out.some((l) => l === line || l === `${' '.repeat(m[1]!.length)}${m[2]!}`);
};
after(() => rmSync(scratch, { recursive: true, force: true }));
const HOST = 'http://127.0.0.1:9';
let n = 0;

function machine(ask?: SetupIo['ask']) {
  const home = join(scratch, `home${String(n++)}`);
  const profile = join(home, '.claude');
  mkdirSync(profile, { recursive: true });
  const out: string[] = [];
  const io: SetupIo = {
    env: { XDG_CONFIG_HOME: join(home, '.config'), CLAUDE_CONFIG_DIR: profile, BRAINDOG_TOKEN: 'rec_test-setup-never-printed', BRAINDOG_TIMEOUT_MS: '300' },
    cwd: home,
    home,
    out: (line) => out.push(line),
    say: (line) => out.push(`! ${line}`),
    headers: async () => ({}),
    cli: join(scratch, 'main.ts'),
    scripts: join(scratch, 'hooks'),
    claude: async () => 0,
    ask,
  };
  return { io, out, settings: join(profile, 'settings.json') };
}

test('the plan is printed, then asked about, before the settings file exists; a yes writes it', async () => {
  let seen: { lines: string[]; written: boolean } | null = null;
  const m = machine(async (question) => {
    assert.equal(question, 'Write these changes? [y/N] ');
    seen = { lines: [...m.out], written: existsSync(m.settings) };
    return true;
  });
  await setup([HOST], m.io);
  assert.ok(seen, 'setup never asked');
  const asked = seen as { lines: string[]; written: boolean };
  assert.equal(asked.written, false, 'the settings were written before the question');
  const plan = asked.lines.findIndex((l) => l.startsWith("2. Hooks: these changes to Claude Code's settings come next"));
  assert.ok(plan > 0, asked.lines.join('\n'));
  assert.ok(asked.lines.slice(plan).some((l) => l.includes('+ hooks.SessionStart:') && l.includes(HOOK_STATUS)), asked.lines.join('\n'));
  assert.ok(asked.lines.slice(plan).some((l) => l.includes('+ hooks.PostToolUse:')), asked.lines.join('\n'));

  const hooks = (JSON.parse(readFileSync(m.settings, 'utf8')) as { hooks: Record<string, unknown> }).hooks;
  assert.deepEqual(Object.keys(hooks), ['SessionStart', 'SessionEnd', 'PostToolUse', 'UserPromptSubmit', 'PreToolUse', 'Stop']);
  assert.ok(m.out.includes("   Written: the BrainDog hooks and Agent Skill are in Claude Code's settings."), m.out.join('\n'));
  assert.ok(m.out.some((l) => /^(?:3\.| {2}) MCP server, Claude Code in ~\/\.claude: braindog is registered/u.test(l)), m.out.join('\n'));
});

test('a no writes nothing and stops at step 2', async () => {
  const m = machine(async () => false);
  assert.equal(await setup([HOST], m.io), 1);
  assert.equal(existsSync(m.settings), false);
  assert.ok(m.out.at(-1)!.includes("Nothing was written to Claude Code's settings, so setup stopped there."), m.out.join('\n'));
  assert.ok(!m.out.some((l) => l.startsWith('3.')), m.out.join('\n'));
});

test('off a terminal with no --yes it stops after the plan and says how to go on', async () => {
  const m = machine(async () => null);
  assert.equal(await setup([HOST], m.io), 1);
  assert.equal(existsSync(m.settings), false);
  assert.ok(m.out.some((l) => l.includes('+ hooks.SessionEnd:')), 'the plan was not shown');
  assert.equal(m.out.at(-1), `   Nothing was written, because no one is at a terminal to say yes. Run braindog setup ${HOST} --yes to write them.`);
});

test('--yes writes without asking', async () => {
  const m = machine(async () => assert.fail('asked, with --yes given'));
  await setup([HOST, '--yes'], m.io);
  assert.ok(existsSync(m.settings));
  const plan = m.out.findIndex((l) => l.includes('+ hooks.SessionStart:'));
  const written = m.out.findIndex((l) => l.startsWith('   Written:'));
  assert.ok(plan >= 0 && written > plan, m.out.join('\n'));
});

test('--dry-run still only shows, and a second run with nothing to add asks nothing', async () => {
  const dry = machine(async () => assert.fail('a dry run asked'));
  /* A held login reads the record at step 4, and the closed port ends the run there: the code is that step's. */
  await setup([HOST, '--dry-run'], dry.io);
  assert.equal(existsSync(dry.settings), false);
  assert.ok(dry.out.some((l) => l.startsWith('2. Hooks: the BrainDog hooks and Agent Skill would be added')), dry.out.join('\n'));

  const m = machine(async () => true);
  await setup([HOST], m.io);
  const again = machine(async () => assert.fail('asked with nothing to write'));
  again.io.env = m.io.env;
  again.io.home = m.io.home;
  await setup([HOST], again.io);
  assert.ok(again.out.includes("2. Hooks: Claude Code's settings already run the BrainDog hooks and Agent Skill."), again.out.join('\n'));
  assert.ok(!again.out.join('\n').includes('rec_test-setup-never-printed'));
});

/* ── every app and every profile ── */

/**
 * A record with a tools register: three tools for everywhere (one handed a key, one whose program is a Windows path)
 * and two of the repository's own, one handed a key. Every call answers from memory; nothing leaves this machine.
 */
async function stubRecord() {
  const rows = [
    { seq: 1, scope: 'global', fields: { kind: 'mcp', name: 'search', transport: 'stdio', command: 'node', args: ['search.js'] } },
    { seq: 2, scope: 'global', fields: { kind: 'mcp', name: 'mail', transport: 'stdio', command: 'node', args: ['mail.js'], needs: ['MAIL_KEY=credentials#4'] } },
    { seq: 3, scope: 'global', fields: { kind: 'mcp', name: 'old', transport: 'stdio', command: 'C:\\tools\\old.exe', args: [] } },
    { seq: 4, scope: 'project', fields: { kind: 'mcp', name: 'kiln-a', transport: 'stdio', command: 'node', args: ['a.js'] } },
    { seq: 5, scope: 'project', fields: { kind: 'mcp', name: 'kiln-b', transport: 'stdio', command: 'node', args: ['b.js'], needs: ['B_KEY=credentials#5'] } },
  ];
  const brief = (r: (typeof rows)[number]) => ({ spoken: `tools#${String(r.seq)}`, version: 1, scope: r.scope, state: 'active', name: r.fields.name, kind: 'mcp', project: null });
  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://stub');
    const method = url.pathname.replace(/^\/api\//, '');
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      const args = (raw ? JSON.parse(raw) : {}) as Record<string, unknown>;
      for (const [k, v] of url.searchParams) {
        try {
          args[k] = JSON.parse(v);
        } catch {
          args[k] = v;
        }
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      if (method === 'context')
        return res.end(
          JSON.stringify({
            ok: true,
            value: {
              session: null,
              project: { spoken: 'things#1', name: 'Kiln', mark: null, hue: null, how: 'folder' },
              ambiguous: [],
              handoff: null,
              live: { same_repo: [], elsewhere: [] },
              waiting: [],
              people: [],
              registers: [{ id: 'tools', name: 'Tools', rows: rows.map(brief), inherited: [], truncated: false }],
            },
          }),
        );
      const row = rows.find((r) => r.seq === args.seq);
      if (method === 'get' && row) return res.end(JSON.stringify({ ok: true, value: { id: `e_${String(row.seq)}`, register: 'tools', seq: row.seq, state: 'active', version: 1, fields: row.fields } }));
      res.end(JSON.stringify({ ok: false, refusal: { code: 'REF_UNKNOWN', fix: 'There is no such row.' } }));
    });
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  after(() => new Promise<void>((done) => (server.closeAllConnections(), server.close(() => done()))));
  return `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
}

/** A second app for the table, keeping its servers in `~/.fakeapp/mcp.json`: present when that folder is. */
const fakeApp: Client = {
  id: 'fakeapp',
  title: 'Fake App',
  found: (home) => existsSync(join(home, '.fakeapp')),
  servers: (home) => {
    const file = join(home, '.fakeapp', 'mcp.json');
    const json = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as { mcpServers?: unknown }) : undefined;
    return [{ scope: 'global', source: '~/.fakeapp/mcp.json', writes: 'user', servers: json?.mcpServers, fault: null }];
  },
  plan: (want) => ({ want, file: join(want.home, '.fakeapp', 'mcp.json'), lines: [`+ ${want.name}: ${JSON.stringify(want.entry)}`] }),
  apply: async (plan, { copied }) => {
    const file = plan.file!;
    if (!copied.has(file)) keepCopy(file);
    copied.add(file);
    const json = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as { mcpServers?: Record<string, unknown> }) : {};
    json.mcpServers = { ...json.mcpServers, [plan.want.name]: plan.want.entry };
    writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
    return { lines: [`Tool ${plan.want.name} added.`], written: true, stop: false };
  },
  remove: (name) => `fakeapp mcp remove ${name}`,
};

/*
 * THE FAKE APP JOINS THE TABLE FOR THIS FILE, because setup and `writeTools` go through `CLIENTS` and nothing else: it
 * is what Codex or Cursor is once its line is in the table, present in a home with its folder and absent without.
 */
(CLIENTS as Client[]).push(fakeApp);
after(() => void (CLIENTS as Client[]).splice(CLIENTS.indexOf(fakeApp), 1));

/**
 * A home with Claude Code in two profiles, `~/.claude` and `~/.claude-work`, the fake app when `fake` is set, and a
 * repository to run in. `claude` is a stand-in that writes `add-json` into the servers file of the profile its
 * environment names, as the real one does, so a second run reads what the first registered.
 */
function home2(fake: boolean) {
  const home = join(scratch, `two${String(n++)}`);
  const work = join(home, '.claude-work');
  for (const dir of [join(home, '.claude'), work, join(home, 'kiln')]) mkdirSync(dir, { recursive: true });
  execFileSync('git', ['init', '-q', join(home, 'kiln')]);
  writeFileSync(join(home, '.claude.json'), `${JSON.stringify({ numStartups: 3, mcpServers: { theirs: { command: 'their-server' } } }, null, 2)}\n`);
  if (fake) {
    mkdirSync(join(home, '.fakeapp'));
    writeFileSync(join(home, '.fakeapp', 'mcp.json'), `${JSON.stringify({ mcpServers: { theirs: { command: 'their-server' } } }, null, 2)}\n`);
  }
  const calls: { args: string[]; profile: string | undefined }[] = [];
  const claude: ProfileRunner = async (args, _cwd, env) => {
    const profile = env?.CLAUDE_CONFIG_DIR;
    calls.push({ args, profile });
    const file = profile ? join(profile, '.claude.json') : join(home, '.claude.json');
    const json = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as { mcpServers?: Record<string, unknown> }) : {};
    if (args[1] === 'add-json') json.mcpServers = { ...json.mcpServers, [args[2]!]: JSON.parse(args[3]!) as unknown };
    if (args[1] === 'remove') delete json.mcpServers?.[args[2]!];
    writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
    return 0;
  };
  const out: string[] = [];
  const io: SetupIo = {
    env: { XDG_CONFIG_HOME: join(home, '.config'), PATH: process.env.PATH, BRAINDOG_TOKEN: 'rec_test-setup-never-printed', BRAINDOG_TIMEOUT_MS: '2000' },
    cwd: join(home, 'kiln'),
    home,
    out: (line) => out.push(line),
    say: (line) => out.push(`! ${line}`),
    headers: async () => ({}),
    cli: join(scratch, 'main.ts'),
    scripts: join(scratch, 'hooks'),
    claude,
    ask: async () => assert.fail('asked, with --yes given'),
  };
  return { home, work, io, out, calls };
}

/** Every file under a folder with its bytes, so "writes nothing" is compared whole. */
function snapshot(dir: string, into: Record<string, string> = {}): Record<string, string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) snapshot(path, into);
    else into[path] = readFileSync(path, 'utf8');
  }
  return into;
}

/** The record's two runnable tools for everywhere, approved on this machine the way `env apply` pins them. */
function pinTools(home: string, cli: string): void {
  for (const [name, fields] of [
    ['search', { transport: 'stdio', command: 'node', args: ['search.js'] }],
    ['mail', { transport: 'stdio', command: 'node', args: ['mail.js'], needs: ['MAIL_KEY=credentials#4'] }],
  ] as const) {
    const entry = renderEntry(name, fields, cli).entry;
    keepPin(pinsFile(home), pinOf('tool', name, entry), { name, kind: 'tool', profile: 'default', now: Date.now() });
  }
}

/* The issuers' shapes `looksLikeToken` names first in install.ts, asked of each word of a written file. */
const TOKEN = /^(?:hb|sk|pk|rk|ghp|gho|ghs|ghu|github_pat|glpat|xox[a-z]|rec|AKIA)[_-][A-Za-z0-9]{6,}/i;
const tokensIn = (text: string) => text.split(/[^A-Za-z0-9_-]+/).filter((word) => TOKEN.test(word));

test('a dry run says one line per app and profile, and the two things left, and writes nothing', async () => {
  const host = await stubRecord();
  const m = home2(true);
  const before = snapshot(m.home);
  assert.equal(await setup([host, '--dry-run', '--profile', m.work], m.io), 0, m.out.join('\n'));
  assert.deepEqual(snapshot(m.home), before, 'the dry run wrote');
  assert.deepEqual(m.calls, [], 'the dry run ran claude');
  const text = m.out.join('\n');
  for (const line of [
    '3. MCP server, Claude Code in ~/.claude: braindog would be registered at user scope, with a copy of its servers file kept first:',
    '3. MCP server, Claude Code in ~/.claude-work: braindog would be registered at user scope, with a copy of its servers file kept first:',
    '3. MCP server, Fake App: braindog would be registered, with a copy of the file kept first:',
    '4. Tools, Fake App: what would be written at user scope, from the tools your BrainDog applies everywhere:',
    '   Tool old was not written, because it starts from a Windows path and this machine is not Windows.',
  ])
    assert.ok(saidStep(m.out, line) || text.includes(line), `missing: ${line}\n${text}`);
  /* EACH STEP'S NUMBER ONCE (D23): a dry run with an app or profile a line said 3. on every one of them. */
  for (const step of ['1.', '2.', '3.', '4.', '5.', '6.']) assert.ok(m.out.filter((l) => l.startsWith(`${step} `)).length <= 1, `${step} said twice\n${text}`);
  const key = hostKey(host);
  const tail = [
    'This repository has 2 tools of its own. Write them with braindog tools write --scope project.',
    `2 tools need keys. Approve this machine for them with braindog login ${key} --keychain things#1.`,
    /* THE PLUGIN'S LINE ONLY ONCE THE REPOSITORY IT NAMES IS PUBLIC. */
    ...(REPO_PUBLIC ? [PLUGIN_LINE] : []),
    'That was a dry run, so nothing was signed in, written, registered or proposed.',
  ];
  assert.deepEqual(m.out.slice(-tail.length), tail);
  if (!REPO_PUBLIC) assert.ok(!text.includes('actuallyhoss/BrainDog'), 'a private repository was named');
});

test('the plugin line waits for the repository: REPO_PUBLIC is the site launch flag LAUNCH.repo', () => {
  assert.equal(REPO_PUBLIC, LAUNCH.repo);
});

test('apply registers the server in both profiles and the other app, keeps a .pre-braindog copy of each file it changed, and a second run changes nothing', async () => {
  const host = await stubRecord();
  const m = home2(true);
  const before = { claudeJson: readFileSync(join(m.home, '.claude.json'), 'utf8'), fake: readFileSync(join(m.home, '.fakeapp', 'mcp.json'), 'utf8') };
  pinTools(m.home, m.io.cli);
  assert.equal(await setup([host, '--yes', '--profile', m.work], m.io), 0, m.out.join('\n'));
  const text = m.out.join('\n');

  /* ONE add-json A PROFILE, each with its own CLAUDE_CONFIG_DIR, the default one with none. */
  const adds = m.calls.filter((c) => c.args[1] === 'add-json' && c.args[2] === 'braindog');
  assert.deepEqual(adds.map((c) => c.profile), [undefined, m.work]);
  /* THE RECORD'S TOOLS GO INTO THE DEFAULT PROFILE, whose file Claude Code's reader reads back. */
  assert.deepEqual(m.calls.filter((c) => c.args[2] === 'search').map((c) => c.profile), [undefined]);
  for (const line of [
    '3. MCP server, Claude Code in ~/.claude: braindog is registered, running this command.',
    `   The servers file as it was is kept at ${join(m.home, '.claude.json')}.pre-braindog.`,
    '3. MCP server, Claude Code in ~/.claude-work: braindog is registered, running this command.',
    '3. MCP server, Fake App: braindog is registered, running this command.',
  ])
    assert.ok(saidStep(m.out, line) || text.includes(line), `missing: ${line}\n${text}`);
  assert.equal(readFileSync(join(m.home, '.claude.json.pre-braindog'), 'utf8'), before.claudeJson);
  assert.equal(readFileSync(join(m.home, '.fakeapp', 'mcp.json.pre-braindog'), 'utf8'), before.fake);
  const fake = JSON.parse(readFileSync(join(m.home, '.fakeapp', 'mcp.json'), 'utf8')) as { mcpServers: Record<string, { args?: string[] }> };
  assert.deepEqual(Object.keys(fake.mcpServers).sort(), ['braindog', 'mail', 'search', 'theirs']);
  assert.deepEqual(fake.mcpServers.braindog!.args!.slice(-3), ['mcp', '--agent', 'fakeapp']);
  assert.deepEqual(JSON.parse(readFileSync(profilesFile(m.home), 'utf8')), { profiles: [join(m.home, '.claude'), m.work] });
  assert.ok(m.out.at(-1)!.startsWith(`This machine is set up from ${hostKey(host)}.`), text);

  /* NO TOKEN IN ANY FILE IT WROTE, and the login's own value nowhere. */
  for (const [file, body] of Object.entries(snapshot(m.home))) {
    assert.deepEqual(tokensIn(body), [], `${file} holds a token shape`);
    assert.ok(!body.includes('rec_test-setup-never-printed'), `${file} holds the login`);
  }

  /* A SECOND RUN, WITH NO --profile: the work profile is reached from profiles.json, and nothing is written. */
  const again = home2(false);
  again.io.home = m.home;
  again.io.cwd = m.io.cwd;
  again.io.claude = m.io.claude;
  const settled = snapshot(m.home);
  const calls = m.calls.length;
  assert.equal(await setup([host, '--yes'], again.io), 0, again.out.join('\n'));
  assert.ok(saidStep(again.out, '3. MCP server, Claude Code in ~/.claude-work: braindog is already registered, running this command.'), again.out.join('\n'));
  assert.equal(again.out.at(-1), `Nothing changed: this machine was already set up from ${hostKey(host)}.`);
  assert.equal(m.calls.length, calls, 'the second run ran claude');
  assert.deepEqual(snapshot(m.home), settled, 'the second run wrote');
});

test('an app not on this machine is one line and is left alone; --only names the apps; a kept profile now gone is left out', async () => {
  const host = await stubRecord();
  const m = home2(false);
  /* A PROFILE KEPT FROM AN EARLIER RUN that is no longer here, beside the work one. */
  mkdirSync(join(m.home, '.braindog'), { recursive: true });
  writeFileSync(profilesFile(m.home), `${JSON.stringify({ profiles: [m.work, join(m.home, '.claude-gone')] })}\n`);
  assert.equal(await setup([host, '--yes'], m.io), 0, m.out.join('\n'));
  /* EVERY APP NOT HERE IN ONE LINE, after the ones that are. */
  assert.equal(m.out.filter((l) => / not on this machine, so setup leaves (?:it|them)\.$/u.test(l)).length, 1, m.out.join('\n'));
  assert.ok(m.out.some((l) => /^(?:3\.| {2}) MCP server, (?:.+, |.+ and )?Fake App(?:(?:,| and) .+)?: not on this machine, so setup leaves (?:it|them)\.$/u.test(l)), m.out.join('\n'));
  assert.ok(m.out.includes('   The profile ~/.claude-gone was set up before and is no longer on this machine, so it is left out.'), m.out.join('\n'));
  assert.ok(saidStep(m.out, '3. MCP server, Claude Code in ~/.claude-work: braindog is registered, running this command.'), m.out.join('\n'));
  assert.ok(!existsSync(join(m.home, '.fakeapp')) && !existsSync(join(m.home, '.claude-gone')));
  assert.deepEqual(JSON.parse(readFileSync(profilesFile(m.home), 'utf8')), { profiles: [join(m.home, '.claude'), m.work] });

  /* --only fakeapp IN A HOME THAT HAS IT: Claude Code is not touched, and no hook or profile is written. */
  const only = home2(true);
  assert.equal(await setup([host, '--yes', '--only', 'fakeapp'], only.io), 0, only.out.join('\n'));
  assert.deepEqual(only.calls, []);
  assert.ok(only.out.includes('2. Hooks: --only leaves Claude Code out, so no hooks were placed.'), only.out.join('\n'));
  assert.ok(!existsSync(join(only.home, '.claude', 'settings.json')), 'hooks were written with --only fakeapp');
  assert.ok(saidStep(only.out, '3. MCP server, Fake App: braindog is registered, running this command.'), only.out.join('\n'));

  const wrong = home2(true);
  assert.equal(await setup([host, '--only', 'nope'], wrong.io), 1);
  assert.equal(wrong.out[0], '! braindog setup --only takes claude, codex, cursor, claude-desktop, vscode, fakeapp, and not nope.');
});

test('with Codex and Cursor in the table, a home holding both gets the server in each, and a second run changes nothing', async () => {
  /* THE TWO APPS ARE IN THE TABLE FOR GOOD (batch 89's integration), so the test only gives the home their folders. */
  assert.deepEqual(CLIENTS.map((c) => c.id).slice(0, 3), ['claude', 'codex', 'cursor']);
  const host = await stubRecord();
  const m = home2(false);
  mkdirSync(join(m.home, '.codex'));
  mkdirSync(join(m.home, '.cursor'));
  m.io.env.CODEX_HOME = join(m.home, '.codex');
  assert.equal(await setup([host, '--yes'], m.io), 0, m.out.join('\n'));
  for (const title of ['Codex', 'Cursor']) assert.ok(saidStep(m.out, `3. MCP server, ${title}: braindog is registered, running this command.`), m.out.join('\n'));
  assert.ok(readFileSync(join(m.home, '.codex', 'config.toml'), 'utf8').includes('[mcp_servers.braindog]'));
  /* AND CODEX'S TURN END AND AGENTS.md BLOCK, shown first and written with the --yes given ahead. */
  assert.ok(saidStep(m.out, "2. Hooks, Codex: these changes to Codex's files come next, with a copy of each file kept first:"), m.out.join('\n'));
  assert.match(readFileSync(join(m.home, '.codex', 'config.toml'), 'utf8'), /^# braindog: the notify line below is BrainDog's/u);
  assert.match(readFileSync(join(m.home, '.codex', 'AGENTS.md'), 'utf8'), /^## BrainDog$/mu);
  for (const [file, body] of Object.entries(snapshot(m.home))) assert.deepEqual(tokensIn(body), [], `${file} holds a token shape`);

  const settled = snapshot(m.home);
  m.out.length = 0;
  assert.equal(await setup([host, '--yes'], m.io), 0, m.out.join('\n'));
  assert.ok(saidStep(m.out, "2. Hooks, Codex: its config already runs BrainDog's turn end, and its AGENTS.md holds BrainDog's block."), m.out.join('\n'));
  for (const title of ['Codex', 'Cursor']) assert.ok(saidStep(m.out, `3. MCP server, ${title}: braindog is already registered, running this command.`), m.out.join('\n'));
  assert.equal(m.out.at(-1), `Nothing changed: this machine was already set up from ${hostKey(host)}.`);
  assert.deepEqual(snapshot(m.home), settled, 'the second run wrote');
});

test('with Claude Desktop and VS Code on the machine, each gets the server in its own file, and a second run changes nothing', async () => {
  /* WHERE THEIR DOCUMENTS PUT THEM ON THIS PLATFORM; Claude Desktop has no path on Linux, so there it is VS Code alone. */
  const host = await stubRecord();
  const m = home2(false);
  const desktop = claudeDesktopFolder(m.home);
  const code = vscodeUserFolder(m.home);
  if (desktop !== null) {
    mkdirSync(desktop, { recursive: true });
    writeFileSync(join(desktop, 'claude_desktop_config.json'), '{\n  "preferences": {\n    "sidebarMode": "chat"\n  }\n}');
  }
  mkdirSync(code, { recursive: true });
  const titles = [...(desktop !== null ? ['Claude Desktop'] : []), 'VS Code'];
  pinTools(m.home, m.io.cli);
  assert.equal(await setup([host, '--yes'], m.io), 0, m.out.join('\n'));
  for (const title of titles) assert.ok(saidStep(m.out, `3. MCP server, ${title}: braindog is registered, running this command.`), m.out.join('\n'));
  const vs = JSON.parse(readFileSync(join(code, 'mcp.json'), 'utf8')) as { servers: Record<string, { args: string[] }> };
  assert.deepEqual(vs.servers.braindog!.args.slice(-3), ['mcp', '--agent', 'other']);
  if (desktop !== null) {
    const cd = JSON.parse(readFileSync(join(desktop, 'claude_desktop_config.json'), 'utf8')) as { preferences: unknown; mcpServers: Record<string, unknown> };
    /* STEP 4 WRITES THE RECORD'S TOOLS INTO IT TOO, as into every app setup reaches. */
    assert.deepEqual(Object.keys(cd.mcpServers).sort(), ['braindog', 'mail', 'search']);
    assert.deepEqual(cd.preferences, { sidebarMode: 'chat' });
    assert.ok(existsSync(join(desktop, 'claude_desktop_config.json.pre-braindog')));
  }
  for (const [file, body] of Object.entries(snapshot(m.home))) assert.deepEqual(tokensIn(body), [], `${file} holds a token shape`);

  const settled = snapshot(m.home);
  m.out.length = 0;
  assert.equal(await setup([host, '--yes'], m.io), 0, m.out.join('\n'));
  for (const title of titles) assert.ok(saidStep(m.out, `3. MCP server, ${title}: braindog is already registered, running this command.`), m.out.join('\n'));
  assert.equal(m.out.at(-1), `Nothing changed: this machine was already set up from ${hostKey(host)}.`);
  assert.deepEqual(snapshot(m.home), settled, 'the second run wrote');
});

/* ── one token per agent (agents and MCP plan §5.1, §10.5; W2-D) ───────── */

test('STEP 6 MAKES ONE TOKEN PER KIND OF AGENT WIRED, keeps it beside the login, never prints it, and asks nothing twice', async () => {
  const m = machine();
  const { BRAINDOG_TOKEN: _held, ...env } = m.io.env;
  m.io.env = env;
  const file = join(env.XDG_CONFIG_HOME!, 'braindog', 'hosts.json');
  const key = hostKey('https://brain.example/acme');
  saveHosts(file, { default: key, hosts: { [key]: { token: { value: 'bd_machine_login_never_printed', expires: '2099-01-01T00:00:00Z', label: 'MacBook · braindog-cli' } } } });
  const asked: string[] = [];
  m.io.mint = async (_key, label) => {
    asked.push(label);
    return label.endsWith('Codex') ? 'he did not approve it' : { value: `bd_agent_${String(asked.length)}_never_printed`, expires: '2027-01-19T00:00:00Z', label };
  };
  const apps = ['claude', 'codex', 'claude-desktop', 'vscode'].map((id) => CLIENTS.find((c) => c.id === id) ?? ({ id } as Client));
  assert.deepEqual(apps.map((c) => agentKindOf(c.id)), ['claude', 'codex', 'other', 'other']);
  const made = await agentTokens(apps, key, file, false, m.io);
  assert.deepEqual(made, { changed: true, failed: true });
  assert.equal(asked.length, 3, 'Claude Desktop and VS Code are one kind, so one token');
  assert.ok(asked.every((l) => / · (?:Claude Code|Codex|other apps)$/u.test(l)), asked.join('\n'));
  const agents = readHosts(file).hosts[key]!.agents!;
  assert.deepEqual(Object.keys(agents).sort(), ['claude', 'other']);
  assert.equal(readHosts(file).hosts[key]!.token!.value, 'bd_machine_login_never_printed', 'the machine login was touched');
  assert.ok(m.out.some((l) => l.startsWith("6. Tokens, Codex: no token was made, so it keeps this machine's login: he did not approve it.")), m.out.join('\n'));
  assert.ok(!m.out.join('\n').includes('never_printed'), 'a bearer was printed');

  /* A SECOND RUN MAKES ONLY WHAT IS STILL MISSING. */
  asked.length = 0;
  m.io.mint = async (_key, label) => (asked.push(label), { value: 'bd_agent_codex_never_printed', expires: '2027-01-19T00:00:00Z', label });
  assert.deepEqual(await agentTokens(apps, key, file, false, m.io), { changed: true, failed: false });
  assert.equal(asked.length, 1);
  m.out.length = 0;
  assert.deepEqual(await agentTokens(apps, key, file, false, m.io), { changed: false, failed: false });
  assert.match(m.out[0]!, /^6\. Tokens: Claude Code, Codex and other apps already have a token each of their own\.$/u);

  /* UNDER BRAINDOG_TOKEN HOLDING A TOKEN, NOTHING IS MADE, AND THAT IS NO FAILURE. */
  m.io.mint = async () => NOT_AN_OWNER_KEY;
  m.out.length = 0;
  assert.deepEqual(await agentTokens(apps, key, file, false, { ...m.io, env: { ...env, BRAINDOG_TOKEN: 'x' } }), { changed: false, failed: false });
  assert.match(m.out[0]!, /^6\. Tokens: BRAINDOG_TOKEN holds a token rather than the server key/u);

  /* UNDER THE SELF-HOST'S SERVER KEY (D4), EACH AGENT GETS A TOKEN MADE FROM IT, and a command inside Claude Code sends
     that token while the same key is set, so the agent is a run and not the owner. */
  m.io.mint = async (_key, label) => ({ value: 'bd_from_server_key_never_printed', expires: '2099-01-01T00:00:00Z', label, from: keyPrint('server-key') });
  m.out.length = 0;
  assert.deepEqual(await agentTokens(apps, key, file, false, { ...m.io, env: { ...env, BRAINDOG_TOKEN: 'server-key' } }), { changed: true, failed: false });
  assert.ok(m.out.every((l) => l.includes('made from the key in BRAINDOG_TOKEN')), m.out.join('\n'));
  assert.equal(target(key, { BRAINDOG_TOKEN: 'server-key', CLAUDECODE: '1' }, file).token, 'bd_from_server_key_never_printed');
  assert.equal(target(key, { BRAINDOG_TOKEN: 'server-key', CLAUDECODE: '1' }, file).from, 'agent');
  assert.equal(target(key, { BRAINDOG_TOKEN: 'another-key', CLAUDECODE: '1' }, file).token, 'another-key', 'a token made from one key was sent for another');
  assert.equal(target(key, { BRAINDOG_TOKEN: 'server-key' }, file).token, 'server-key', 'a person at a terminal still sends the key');
  assert.ok(!readFileSync(file, 'utf8').includes('server-key'), 'the key itself was kept');
  rmSync(file);
  m.out.length = 0;
  await agentTokens(apps, key, file, true, m.io);
  assert.match(m.out[0]!, /^6\. Tokens: a token of its own would be made for Claude Code, Codex and other apps/u);
});

test("THE AGENT'S OWN TOKEN IS SENT FOR THAT AGENT, the login for any other, the login again once it expired; logout takes them all", async () => {
  const dir = mkdtempSync(join(scratch, 'agent-tokens-'));
  const file = join(dir, 'hosts.json');
  const key = 'https://brain.example/acme';
  saveHosts(file, {
    default: key,
    hosts: {
      [key]: {
        token: { value: 'bd_login', expires: '2099-01-01T00:00:00Z', label: 'm' },
        agents: { claude: { value: 'bd_claude', expires: '2099-01-01T00:00:00Z', label: 'm · Claude Code' }, codex: { value: 'bd_codex', expires: '2020-01-01T00:00:00Z', label: 'm · Codex' } },
      },
    },
  });
  assert.equal(target(undefined, {}, file).token, 'bd_login', 'no agent said, so the login');
  assert.equal(target(undefined, { BRAINDOG_AGENT: 'claude' }, file).token, 'bd_claude');
  assert.equal(target(undefined, { CLAUDECODE: '1' }, file).token, 'bd_claude', 'a command inside Claude Code');
  assert.equal(target(undefined, {}, file, Date.now(), 'claude').token, 'bd_claude');
  assert.equal(target(undefined, {}, file, Date.now(), 'codex').token, 'bd_login', 'an expired agent token was sent');
  assert.equal(target(undefined, {}, file, Date.now(), 'cursor').token, 'bd_login');
  assert.equal(target(undefined, { BRAINDOG_TOKEN: 'bd_env', CLAUDECODE: '1' }, file).token, 'bd_env', 'BRAINDOG_TOKEN still wins');
  /* ANOTHER HOST NEVER GETS THIS HOST'S AGENT TOKEN. */
  assert.equal(target('https://other.example/x', { CLAUDECODE: '1' }, file).token, undefined);

  assert.equal(await logout([key], { file, env: {}, say: () => undefined }), 0);
  assert.equal(readHosts(file).hosts[key], undefined, 'an agent token outlived the logout');
});

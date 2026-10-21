/**
 * `braindog sync inventory`: what a setup sync would carry from a machine, by name and size, and what it would refuse.
 *
 * EVERY FILE IS UNDER A TEMPORARY FOLDER and `home` and `env` are always passed, so no real profile is read, and the
 * record is handed in as names. The repositories are real ones made here, so `git` itself is what is held read-only.
 *
 * NOTHING IT LISTS IS OPENED, AND NO VALUE REACHES A LINE. A transcript, a sign-in, a shared sign-in file, a program
 * named for a key and two `.env` files each hold the same made-up key, and it must come out nowhere, in the lines or
 * in the JSON; and the home, `.git` folders included, is byte for byte what it was.
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import type { RecordNames } from '../src/env.ts';
import { planInventory, printInventory, runGit, sized, syncCommand, syncInventory, type Item } from '../src/sync.ts';

/* Made up, in the shape of a key. It must never reach a line. */
const TOKEN = 'hb_live_4f9K2mQ8xZ71';

/* What the planted files hold, so each size below is counted from it rather than by hand. */
const MEMORY = '- notes\n';
const DEPLOYS = 'deploy notes\n';
const LAB = 'lab\n';
const CONTEXT = 'context\n';
const DEPLOY = '#!/bin/sh\necho deployed\n';
const HELLO = 'hello\n';
const NOTES = 'notes\n';
const REPORT = 'export {};\n';
const TRANSCRIPT = `{"said":"${TOKEN}"}\n`;
const AUTH = `{"token":"${TOKEN}"}`;
const ENV = `TOKEN=${TOKEN}\n`;

const scratch = mkdtempSync(join(tmpdir(), 'braindog-sync-'));
after(() => rmSync(scratch, { recursive: true, force: true }));
let homes = 0;
const newHome = () => {
  const dir = join(scratch, `home-${String(homes++)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
};
const text = (file: string, value: string) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, value);
};
const SKILL = (name: string) => `---\nname: ${name}\ndescription: A skill.\n---\n`;
const skill = (profile: string, name: string) => text(join(profile, 'skills', name, 'SKILL.md'), SKILL(name));
/** A path under the home as the lines say it, with this system's own slashes. */
const tilde = (path: string, home: string) => `~${path.slice(home.length)}`;

/** One hash of every file under a folder, by path and bytes, links named and never followed. */
const hashOf = (dir: string): string => {
  const hash = createHash('sha256');
  const walk = (at: string) => {
    for (const name of readdirSync(at).sort()) {
      const path = join(at, name);
      hash.update(path);
      const st = lstatSync(path);
      if (st.isDirectory()) walk(path);
      else if (st.isFile()) hash.update(readFileSync(path));
    }
  };
  walk(dir);
  return hash.digest('hex');
};

/** Git in a folder of the test's, with its own name and no hooks or signing, so nothing of this machine's is used. */
const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });

/**
 * A repository `shop` under `code/`, with one commit on no remote, a file changed and a file new, two ignored `.env`
 * files and one inside an ignored folder; and a linked worktree of it, `shop-wt`.
 */
function repository(home: string) {
  const code = join(home, 'code');
  const shop = join(code, 'shop');
  mkdirSync(shop, { recursive: true });
  git(shop, 'init', '--quiet');
  git(shop, 'config', 'user.name', 'Owner');
  git(shop, 'config', 'user.email', 'owner@example.com');
  git(shop, 'config', 'commit.gpgsign', 'false');
  text(join(shop, '.gitignore'), '.env*\nnode_modules/\n');
  text(join(shop, 'app.js'), 'export {};\n');
  git(shop, 'add', '.gitignore', 'app.js');
  git(shop, 'commit', '--quiet', '--no-verify', '-m', 'first');
  git(shop, 'worktree', 'add', '--quiet', '-b', 'side', join(code, 'shop-wt'));
  /* The same bytes with a new time: a plain `git status` would rewrite the index to note it, which is a write. */
  utimesSync(join(shop, '.gitignore'), new Date(Date.now() + 60_000), new Date(Date.now() + 60_000));
  text(join(shop, 'app.js'), 'export const changed = 1;\n');
  text(join(shop, 'new.js'), 'export {};\n');
  text(join(shop, '.env'), ENV);
  text(join(shop, '.env.local'), ENV);
  text(join(shop, 'node_modules', 'pkg', '.env'), ENV);
  return { code, shop };
}

/**
 * A home with the default profile and a ccenv profile linking to its skills and plugins, each group of what a sync
 * carries, and each kind of thing it refuses, the key planted in every file that could hold one.
 */
function planted() {
  const home = newHome();
  const main = join(home, '.claude');
  text(join(main, 'settings.json'), '{}\n');
  text(join(main, 'projects', '-work-shop', 'memory', 'MEMORY.md'), MEMORY);
  text(join(main, 'projects', '-work-shop', 'memory', 'deploys.md'), DEPLOYS);
  mkdirSync(join(main, 'projects', '-work-empty', 'memory'), { recursive: true });
  text(join(main, 'projects', '-work-shop', 'a1b2.jsonl'), TRANSCRIPT);
  text(join(main, 'projects', '-work-shop', 'a1b2', 'subagents', 'agent.jsonl'), '{}\n');
  text(join(main, 'projects', '-work-shop', 'notes.txt'), 'not memory\n');
  text(join(main, 'context', 'one.md'), CONTEXT);
  for (const name of ['kept', 'own', 'braindog']) skill(main, name);
  mkdirSync(join(main, 'skills', '.replaced'));
  text(join(main, '.credentials.json'), AUTH);
  text(join(main, 'plugins', 'cache', 'tool', 'index.js'), 'export {};\n');
  const work = join(home, '.ccenv', 'profiles', 'work');
  text(join(work, 'settings.json'), '{}\n');
  text(join(work, 'projects', '-lab', 'memory', 'MEMORY.md'), LAB);
  symlinkSync(join(main, 'skills'), join(work, 'skills'), 'junction');
  mkdirSync(join(work, 'plugins'));
  symlinkSync(join(main, 'plugins', 'cache'), join(work, 'plugins', 'cache'), 'junction');
  const bin = join(home, '.local', 'bin');
  text(join(bin, 'deploy'), DEPLOY);
  chmodSync(join(bin, 'deploy'), 0o755);
  text(join(bin, 'notes.txt'), HELLO);
  text(join(bin, 'git-credential-shop'), `#!/bin/sh\necho password=${TOKEN}\n`);
  chmodSync(join(bin, 'git-credential-shop'), 0o755);
  mkdirSync(join(home, 'elsewhere'));
  symlinkSync(join(home, 'elsewhere'), join(bin, 'ship'), 'junction');
  const shared = join(home, '.ccenv', 'shared');
  text(join(shared, 'report.mjs'), REPORT);
  text(join(shared, 'handoff.md'), NOTES);
  text(join(shared, 'mcp-auth.json'), AUTH);
  text(join(shared, 'usage.cache.json'), '{}');
  text(join(home, '.codex', 'auth.json'), `{"key":"${TOKEN}"}`);
  return { home, main, work, bin, shared, ...repository(home) };
}

const RECORD: RecordNames = { read: true, tools: [], skills: ['kept'] };

test('EACH GROUP IS LISTED BY NAME AND SIZE, and only the memory folders under projects', async () => {
  const p = planted();
  const inv = await planInventory({ home: p.home, profiles: [p.main, p.work], record: RECORD, env: {}, under: [p.code] });
  const by = (group: Item['group']) => inv.items.filter((i) => i.group === group).map((i) => [i.path, i.size, i.files, i.runs]);
  assert.deepEqual(by('memory'), [
    [tilde(join(p.main, 'projects', '-work-shop', 'memory'), p.home), MEMORY.length + DEPLOYS.length, 2, false],
    [tilde(join(p.work, 'projects', '-lab', 'memory'), p.home), LAB.length, 1, false],
  ]);
  assert.deepEqual(by('context'), [[tilde(join(p.main, 'context'), p.home), CONTEXT.length, 1, false]]);
  /* A file marked to run runs a program; Windows marks none, so there it is said by its ending alone. */
  assert.deepEqual(by('scripts'), [
    [tilde(join(p.bin, 'deploy'), p.home), DEPLOY.length, 1, process.platform !== 'win32'],
    [tilde(join(p.bin, 'notes.txt'), p.home), HELLO.length, 1, false],
  ]);
  assert.deepEqual(by('shared'), [
    [tilde(join(p.shared, 'handoff.md'), p.home), NOTES.length, 1, false],
    [tilde(join(p.shared, 'report.mjs'), p.home), REPORT.length, 1, true],
  ]);
  /* The record holds `kept`, `install` places `braindog`, and the ccenv profile's link to the same folder is read once. */
  assert.deepEqual(by('skills'), [[tilde(join(p.main, 'skills', 'own'), p.home), SKILL('own').length, 1, false]]);
  assert.deepEqual(
    inv.items.filter((i) => i.group === 'env').map((i) => [i.repo, i.path, i.size]),
    [
      ['shop', '.env', ENV.length],
      ['shop', '.env.local', ENV.length],
    ],
  );
});

test('WHAT IT WOULD REFUSE, AND WHY: transcripts, sign-ins, a link, a cache, a name that says key, a plugin cache once', async () => {
  const p = planted();
  const inv = await planInventory({ home: p.home, profiles: [p.main, p.work], record: RECORD, env: {}, under: [] });
  assert.deepEqual(
    inv.refused.map((r) => [r.path, r.why, r.files]),
    [
      [tilde(join(p.main, 'projects'), p.home), 'transcripts', 1],
      [tilde(join(p.bin, 'git-credential-shop'), p.home), 'secret', 1],
      [tilde(join(p.bin, 'ship'), p.home), 'link', 0],
      [tilde(join(p.shared, 'mcp-auth.json'), p.home), 'secret', 1],
      [tilde(join(p.shared, 'usage.cache.json'), p.home), 'cache', 1],
      [tilde(join(p.main, '.credentials.json'), p.home), 'sign-in', 1],
      [tilde(join(p.main, 'plugins', 'cache'), p.home), 'plugin-cache', 1],
      [tilde(join(p.home, '.codex', 'auth.json'), p.home), 'sign-in', 1],
    ],
  );
  /* Sized by `stat`: the transcript's bytes are counted, never read. */
  assert.equal(inv.refused[0]?.size, TRANSCRIPT.length);
  const lines = printInventory(inv);
  for (const line of [
    'It would refuse:',
    `  ${tilde(join(p.main, 'projects'), p.home)}: 1 session transcript, ${sized(TRANSCRIPT.length)}, never read and never carried`,
    `  ${tilde(join(p.shared, 'mcp-auth.json'), p.home)}: ${sized(AUTH.length)}, its name says it may hold a key, so only its size was read`,
    `  ${tilde(join(p.bin, 'ship'), p.home)}: a link, and what it points to is not carried`,
    'No folder was named with --under, so no repository was read.',
  ])
    assert.ok(lines.includes(line), `no line ${JSON.stringify(line)}:\n${lines.join('\n')}`);
  assert.doesNotMatch(lines.join('\n'), /—/, 'an em dash in a line a person reads');
});

test('EACH REPOSITORY: its commits on no remote and its changes, a worktree said as one of its checkout', async () => {
  const p = planted();
  const inv = await planInventory({ home: p.home, profiles: [p.main], record: RECORD, env: {}, under: [p.code] });
  assert.deepEqual(inv.repos, [
    { repo: 'shop', worktreeOf: null, unpushed: 1, dirty: 2 },
    { repo: 'shop-wt', worktreeOf: 'shop', unpushed: 1, dirty: 0 },
  ]);
  const lines = printInventory(inv);
  for (const line of [`Repositories under ${tilde(p.code, p.home)}:`, '  shop: 1 commit on no remote, 2 changes not committed', '  shop-wt: a worktree of shop, nothing to commit', '.env files git ignores, by repository:', `  shop: .env, ${sized(ENV.length)}`])
    assert.ok(lines.includes(line), `no line ${JSON.stringify(line)}:\n${lines.join('\n')}`);
  /* Where git cannot answer, the line says so rather than a number. */
  const none = await planInventory({ home: p.home, profiles: [], record: RECORD, env: {}, under: [p.code], git: async () => null });
  assert.deepEqual(none.repos[0], { repo: 'shop', worktreeOf: null, unpushed: null, dirty: null });
  assert.ok(printInventory(none).includes('  shop: git could not count its commits, git could not read its changes'));
});

test('NO VALUE REACHES THE OUTPUT AND NOTHING CHANGES: the key planted everywhere comes out nowhere, and the home is as it was', async () => {
  const p = planted();
  const before = hashOf(p.home);
  const out = await syncInventory(['--under', p.code, '--json'], { home: p.home, env: {}, record: async () => RECORD });
  const all = `${out.lines.join('\n')}\n${JSON.stringify(out.report)}`;
  for (const value of [TOKEN, '4f9K2mQ8xZ71', 'password', 'deployed']) assert.ok(!all.includes(value), `${value} was printed:\n${all}`);
  assert.equal(out.json, true);
  assert.equal(out.code, 0);
  assert.equal(hashOf(p.home), before, 'sync inventory changed the home, or a repository');
  const carried = out.report.items.reduce((sum, i) => sum + i.size, 0);
  assert.equal(out.lines.at(-1), `It would carry 11 files, ${sized(carried)}, and refuse 8 things.`);
});

test('NOT SIGNED IN, THE SKILLS LOCK SAYS WHICH SKILLS THE RECORD HOLDS, and the line says why', async () => {
  const p = planted();
  text(
    join(p.home, '.braindog', 'skills-lock.json'),
    JSON.stringify({ [join(p.main, 'skills', 'own', 'SKILL.md')]: { spoken: 'skills#3', version: 1, sha256: 'x' }, [join(p.main, 'skills', 'kept', 'SKILL.md')]: { spoken: null, version: 0, sha256: 'y' } }),
  );
  const out = await syncInventory([], { home: p.home, env: {}, record: async () => ({ read: false, why: 'signed-out' }) });
  assert.deepEqual(
    out.report.items.filter((i) => i.group === 'skills').map((i) => i.path),
    [tilde(join(p.main, 'skills', 'kept'), p.home)],
  );
  assert.deepEqual(out.report.skills, { from: 'lock', why: 'signed-out' });
  assert.ok(out.lines.includes("This machine is not signed in to BrainDog, so the skills the record holds were read from this machine's skills lock."), out.lines.join('\n'));
});

test('THE VERB FINDS THE PROFILES AS doctor DOES, ccenv and CODEX_HOME by the environment', async () => {
  const p = planted();
  const codex = join(p.home, 'codex-elsewhere');
  text(join(codex, 'auth.json'), '{}');
  const out = await syncInventory([], { home: p.home, env: { CODEX_HOME: codex }, record: async () => RECORD });
  assert.ok(out.report.items.some((i) => i.path === tilde(join(p.work, 'projects', '-lab', 'memory'), p.home)));
  assert.ok(out.report.refused.some((r) => r.path === tilde(join(codex, 'auth.json'), p.home) && r.why === 'sign-in'));
  assert.ok(!out.report.refused.some((r) => r.path === tilde(join(p.home, '.codex', 'auth.json'), p.home)));
});

test('ARGUMENTS IT DOES NOT TAKE ARE REFUSED IN ONE SENTENCE, and sizes read as a person reads them', async () => {
  const home = newHome();
  await assert.rejects(syncInventory(['--apply'], { home, env: {}, record: async () => RECORD }), /braindog sync inventory takes --under/);
  await assert.rejects(syncInventory([TOKEN], { home, env: {}, record: async () => RECORD }), (e: Error) => !e.message.includes(TOKEN));
  await assert.rejects(syncCommand(['everything'], { home, env: {}, record: async () => RECORD }), /braindog sync takes inventory/);
  assert.deepEqual([sized(0), sized(1023), sized(1024), sized(1536), sized(5 * 1024 * 1024), sized(3 * 1024 ** 3)], ['0 B', '1023 B', '1 KB', '1.5 KB', '5 MB', '3 GB']);
  /* The real git, run where nothing is a repository, answers null rather than throwing. */
  assert.equal(await runGit(home, ['rev-parse', '--git-common-dir']), null);
});

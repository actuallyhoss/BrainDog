/**
 * `braindog install --replace` retiring the `old-brain` skill, and warning when it runs from a checkout that is
 * still moving.
 *
 * MEASURED BEFORE THIS EXISTED: the dry run named nothing under `skills/`, and
 * `--apply` left `skills/old-brain` where it was, so a session went on loading a skill that says to use it
 * "whenever you start work in a repo" and reads and writes `tallybook.example`, beside BrainDog. All three of
 * the profiles measured held that folder, and it is the only skill in each whose `SKILL.md` names the host. And a checkout
 * with another agent's edit in it printed nothing about it, though the hooks and the server run from there. Four of the six cases below failed then; the rollback case and the one for other skills passed,
 * because nothing moved, and the rollback case was shown to bite by moving the folder outside the write.
 *
 * EVERY FILE HERE IS UNDER A TEMPORARY FOLDER, which is in no git working tree, and each function is called with
 * `home` set to it and `checkout` set to a scratch folder, so no real profile is read and the real tree's state does
 * not decide what these print. The one case through main.ts reads the real tree's state and expects that.
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { descriptionOf, installEvery } from '../src/install.ts';
import { REPLACE, REPLACE_FILE } from './replace.ts';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
const scripts = join(APP, 'hooks');

const HB_START = 'powershell -NoProfile -ExecutionPolicy Bypass -File "C:\\Tools\\tallybook\\hooks\\session-start.ps1"';
const OLD_SERVER = { type: 'stdio', command: 'node', args: ['C:\\Tools\\tallybook\\mcp\\tallybook-mcp.mjs'] };

/* The skill's first lines as the real one begins, which is how it names the host. */
const OLD_SKILL = "---\nname: old-brain\ndescription: Read and write the shared cross-project brain at https://tallybook.example.\n---\n\n# Tallybook\n";
const OTHER_SKILL = '---\nname: tidy\ndescription: Tidy the imports in a file.\n---\n\n# Tidy\n';
const MOVING = /has uncommitted changes/;

const scratch = mkdtempSync(join(tmpdir(), 'braindog-install-skill-'));
/* A read-only file cannot be removed on Windows, so everything is made writable before the folder goes. */
after(() => {
  const loosen = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      chmodSync(path, 0o700);
      if (statSync(path).isDirectory()) loosen(path);
    }
  };
  loosen(scratch);
  rmSync(scratch, { recursive: true, force: true });
});
let folders = 0;
const folder = (name: string) => {
  const dir = join(scratch, `${name}-${String(folders++)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
};

/** Every file under a folder, by its path inside it, with its bytes: what "byte for byte" is compared by. */
const tree = (dir: string): Record<string, string> => {
  const out: Record<string, string> = {};
  const walk = (at: string, prefix: string) => {
    for (const name of readdirSync(at).sort()) {
      const path = join(at, name);
      if (statSync(path).isDirectory()) walk(path, `${prefix}${name}/`);
      else out[`${prefix}${name}`] = readFileSync(path, 'utf8');
    }
  };
  walk(dir, '');
  return out;
};

/**
 * A named profile as a real one is: Tallybook's start hook, its server in `.claude.json`, the `old-brain` skill with a
 * second file in a subfolder, a skill of the owner's own, and a command that names the host, which is not a skill.
 */
function profile(home: string, name: string) {
  const dir = join(home, name);
  mkdirSync(join(dir, 'skills', 'old-brain', 'references'), { recursive: true });
  mkdirSync(join(dir, 'skills', 'tidy'), { recursive: true });
  mkdirSync(join(dir, 'commands'), { recursive: true });
  writeFileSync(join(dir, 'settings.json'), `${JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ type: 'command', command: HB_START }] }] } }, null, 2)}\n`);
  const claudeJson = join(dir, '.claude.json');
  writeFileSync(claudeJson, `${JSON.stringify({ mcpServers: { brain: OLD_SERVER } }, null, 2)}\n`);
  writeFileSync(join(dir, 'skills', 'old-brain', 'SKILL.md'), OLD_SKILL);
  writeFileSync(join(dir, 'skills', 'old-brain', 'references', 'api.md'), 'GET https://tallybook.example/api/db\n');
  writeFileSync(join(dir, 'skills', 'tidy', 'SKILL.md'), OTHER_SKILL);
  writeFileSync(join(dir, 'commands', 'brain.md'), 'Read https://tallybook.example first.\n');
  return { dir, claudeJson, skill: join(dir, 'skills', 'old-brain'), tidy: join(dir, 'skills', 'tidy'), commands: join(dir, 'commands') };
}

/* A folder in no git working tree, so the checkout warning is neither owed nor printed. */
const still = () => folder('checkout');

test('A PROFILE HOLDING THE old-brain SKILL: the dry run lists - skills/old-brain, and moves nothing', () => {
  const home = folder('home');
  const p = profile(home, '.claude-studio');
  const before = tree(p.dir);

  const dry = installEvery([p.dir], [], { apply: false, replace: REPLACE, scripts, home, checkout: still() });
  assert.ok(
    dry.some((l) => l.startsWith('  - skills/old-brain')),
    `no line for the skill:\n${dry.join('\n')}`,
  );
  /* Named once, and never the skill that does not name the host. */
  assert.equal(dry.filter((l) => l.startsWith('  - skills/')).length, 1, dry.join('\n'));
  assert.deepEqual(tree(p.dir), before, 'the dry run changed the profile');
});

test('--APPLY MOVES IT UNDER skills/.replaced/ WITH THE SAME BYTES, and skills/old-brain is gone', () => {
  const home = folder('home');
  const p = profile(home, '.claude-studio');
  const skill = tree(p.skill);

  const lines = installEvery([p.dir], [], { apply: true, replace: REPLACE, scripts, home, checkout: still() });
  assert.ok(!existsSync(p.skill), `skills/old-brain is still there:\n${lines.join('\n')}`);
  const kept = readdirSync(join(p.dir, 'skills', '.replaced'));
  assert.equal(kept.length, 1, kept.join(', '));
  assert.match(kept[0]!, /^old-brain-\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(tree(join(p.dir, 'skills', '.replaced', kept[0]!)), skill);
  /* Where it went is said, as the copy of each file is. */
  assert.ok(lines.some((l) => l.includes(join(p.dir, 'skills', '.replaced', kept[0]!))), lines.join('\n'));

  /* A second run finds nothing to retire, and a folder under `.replaced` is never taken for a skill. */
  const again = installEvery([p.dir], [], { apply: true, replace: REPLACE, scripts, home, checkout: still() });
  assert.ok(!again.some((l) => l.startsWith('  - skills/')), again.join('\n'));
  assert.deepEqual(readdirSync(join(p.dir, 'skills', '.replaced')), kept);
});

test('A SKILL THAT DOES NOT NAME THE HOST, AND commands/, ARE BYTE FOR BYTE AS THEY WERE; and without --replace nothing moves', () => {
  const home = folder('home');
  const p = profile(home, '.claude-studio');
  const tidy = tree(p.tidy);
  const commands = tree(p.commands);

  installEvery([p.dir], [], { apply: true, replace: REPLACE, scripts, home, checkout: still() });
  assert.deepEqual(tree(p.tidy), tidy);
  assert.deepEqual(tree(p.commands), commands);

  const plain = profile(folder('home'), '.claude-plain');
  const skill = tree(plain.skill);
  const lines = installEvery([plain.dir], [], { apply: true, scripts, home, checkout: still() });
  assert.ok(!lines.some((l) => l.startsWith('  - skills/')), lines.join('\n'));
  assert.deepEqual(tree(plain.skill), skill);
});

/*
 * THE MOVE IS INSIDE THE ALL-OR-NONE WRITE. Windows refuses a rename onto a read-only file, so the second profile's
 * `.claude.json` fails after the first profile's skill folder has been moved, and the move must be put back.
 */
test('A FAILURE IN A LATER FILE PUTS THE SKILL FOLDER BACK', { skip: process.platform !== 'win32' }, () => {
  const home = folder('home');
  const a = profile(home, '.claude-a');
  const b = profile(home, '.claude-b');
  chmodSync(b.claudeJson, 0o444);
  const before = [tree(a.dir), tree(b.dir)];

  assert.throws(() => installEvery([a.dir, b.dir], [], { apply: true, replace: REPLACE, scripts, home, checkout: still() }), /changed nothing/);
  assert.deepEqual([tree(a.dir), tree(b.dir)], before);
  /* Nor is an empty `.replaced` left behind: the folder was this run's. */
  assert.ok(!existsSync(join(a.dir, 'skills', '.replaced')));
});

test('A CHECKOUT WITH AN UNCOMMITTED CHANGE PRINTS THE WARNING, a clean one does not, and neither refuses', () => {
  const repo = folder('repo');
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', windowsHide: true });
  git('init', '--quiet');
  git('config', 'user.name', 'Owner');
  git('config', 'user.email', 'owner@example.com');
  git('config', 'commit.gpgsign', 'false');
  writeFileSync(join(repo, 'main.ts'), 'export {};\n');
  git('add', 'main.ts');
  git('commit', '--quiet', '-m', 'one');
  const home = folder('home');
  const p = profile(home, '.claude-studio');
  /*
   * AN UNTRACKED FILE IS NOT A MOVING CHECKOUT, since no hook or server runs it until a tracked file imports it. A
   * mutation that counted untracked files passed every case here until this file was added.
   */
  writeFileSync(join(repo, 'notes.test.ts'), 'export {};\n');

  const clean = installEvery([p.dir], [], { apply: false, replace: REPLACE, scripts, home, checkout: repo });
  assert.ok(!clean.some((l) => MOVING.test(l)), clean.join('\n'));

  writeFileSync(join(repo, 'main.ts'), 'export const half = \n');
  const moving = installEvery([p.dir], [], { apply: false, replace: REPLACE, scripts, home, checkout: repo });
  const warned = moving.filter((l) => MOVING.test(l));
  assert.equal(warned.length, 1, moving.join('\n'));
  /* It names the tree and the fix, and the run goes on to plan everything it would without it. */
  assert.ok(warned[0]!.includes(repo) && warned[0]!.includes('git worktree add'), warned[0]);
  assert.ok(moving.some((l) => l.startsWith('  - skills/old-brain')), moving.join('\n'));
});

/*
 * STEP 14'S DRY RUN AS HE WILL RUN IT, through main.ts: every profile lists both lines the step says to look for. The
 * warning is read against the real tree's own `git status`, since main.ts names no other checkout.
 */
test('THROUGH main.ts, each profile lists + mcpServers.braindog and - skills/old-brain, and the warning follows the real tree', () => {
  const home = folder('home');
  const studio = profile(home, '.claude-studio');
  const client = profile(home, '.claude-client');
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: join(home, 'config') };
  for (const name of Object.keys(env)) if (name.startsWith('BRAINDOG_') || name === 'CLAUDE_CONFIG_DIR') delete env[name];
  const ran = spawnSync(process.execPath, [join(APP, 'src', 'main.ts'), 'install', '--replace', REPLACE_FILE, '--config-dir', studio.dir, '--config-dir', client.dir], { cwd: home, env, encoding: 'utf8', timeout: 30_000 });

  assert.equal(ran.status, 0, ran.stderr);
  const lines = ran.stdout.split('\n');
  assert.equal(lines.filter((l) => l.startsWith('  + mcpServers.braindog')).length, 2, ran.stdout);
  assert.equal(lines.filter((l) => l.startsWith('  - skills/old-brain')).length, 2, ran.stdout);
  const dirty = execFileSync('git', ['--no-optional-locks', 'status', '--porcelain', '--untracked-files=no'], { cwd: APP, encoding: 'utf8', windowsHide: true }).trim() !== '';
  assert.equal(lines.filter((l) => MOVING.test(l)).length, dirty ? 1 : 0, ran.stdout);
});

/*
 * A SKILL IS TOLD BY ITS DESCRIPTION LINE AND NOTHING ELSE. Read by its whole text, a folder of notes that
 * mentions the old host further down was taken for the old tool's skill and set aside, and these three cases are the
 * shapes that went wrong: the same body under two descriptions, a body that mentions the host, and no front matter.
 */
const BODY = '\n# Moving\n\nThe old notes lived at https://tallybook.example until spring.\n';

test('TWO SKILLS WITH THE SAME BODY AND DIFFERENT DESCRIPTIONS ARE TOLD APART: only the one whose description names the host moves', () => {
  const home = folder('home');
  const p = profile(home, '.claude-studio');
  mkdirSync(join(p.dir, 'skills', 'mover'));
  mkdirSync(join(p.dir, 'skills', 'diary'));
  writeFileSync(join(p.dir, 'skills', 'mover', 'SKILL.md'), `---\nname: mover\ndescription: Sync with the brain at\n  tallybook.example every hour.\n---\n${BODY}`);
  writeFileSync(join(p.dir, 'skills', 'diary', 'SKILL.md'), `---\nname: diary\ndescription: Keep a diary of the move.\n---\n${BODY}`);
  const diary = tree(join(p.dir, 'skills', 'diary'));

  const lines = installEvery([p.dir], [], { apply: true, replace: REPLACE, scripts, home, checkout: still() });
  const moved = lines.filter((l) => l.startsWith('  - skills/')).map((l) => l.split(',')[0]);
  /* The description carried on to an indented line is still the description. */
  assert.deepEqual(moved.sort(), ['  - skills/mover', '  - skills/old-brain'], lines.join('\n'));
  assert.ok(!existsSync(join(p.dir, 'skills', 'mover')));
  assert.deepEqual(tree(join(p.dir, 'skills', 'diary')), diary);
});

test('A NOTES FOLDER THAT MENTIONS THE HOST IN ITS BODY STAYS, and so does a skill with no front matter', () => {
  const home = folder('home');
  const p = profile(home, '.claude-studio');
  mkdirSync(join(p.dir, 'skills', 'bare'));
  writeFileSync(join(p.dir, 'skills', 'bare', 'SKILL.md'), `description: tallybook.example${BODY}`);
  const bare = tree(join(p.dir, 'skills', 'bare'));

  const dry = installEvery([p.dir], [], { apply: false, replace: REPLACE, scripts, home, checkout: still() });
  assert.deepEqual(dry.filter((l) => l.startsWith('  - skills/')).map((l) => l.split(',')[0]), ['  - skills/old-brain'], dry.join('\n'));
  installEvery([p.dir], [], { apply: true, replace: REPLACE, scripts, home, checkout: still() });
  assert.deepEqual(tree(join(p.dir, 'skills', 'bare')), bare);
  /* `tidy` has front matter and a description that names nothing of the old tool's. */
  assert.ok(existsSync(p.tidy));
});

test('THE READER RETURNS THE DESCRIPTION LINE ONLY, carried on by indented lines, and null without front matter', () => {
  assert.equal(descriptionOf('---\nname: a\ndescription: One\n  two\nother: x\n---\nbody tallybook.example\n'), 'One two');
  assert.equal(descriptionOf('﻿---\r\ndescription: Win\r\n---\r\n'), 'Win');
  assert.equal(descriptionOf('---\nname: a\n---\ndescription: in the body\n'), null);
  assert.equal(descriptionOf('# no front matter\ndescription: x\n'), null);
});

/**
 * `braindog doctor`: what still names a replaced tool, and what holds something shaped like a key, listed and never
 * changed.
 *
 * WRITTEN BEFORE `src/doctor.ts` EXISTED, when every case here failed on the import. `install --replace` takes the old
 * tool out of the files it is pointed at, and nothing said afterwards what was left: the one reading of a real machine
 * was done by hand, once, for one app. So a home is planted with each kind of place, and each must come back named by
 * its file and its entry.
 *
 * EVERY FILE IS UNDER A TEMPORARY FOLDER and `home` is always passed, so no real profile and no real crontab is read.
 * The crontab is a text handed in, as the command hands in what `crontab -l` printed.
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { doctor, planDoctor, printDoctor, profilesIn } from '../src/doctor.ts';
import { BRAINDOG_SERVER, hookCommand } from '../src/install.ts';
import { REPLACE, REPLACE_FILE } from './replace.ts';

const scripts = join(dirname(fileURLToPath(import.meta.url)), '..', 'hooks');

/* Made up, in the shape of a key: a known prefix, letters and digits mixed. It must never reach a line. */
const TOKEN = 'hb_live_4f9K2mQ8xZ71';
/* Eight characters with no prefix, the shape a length test alone lets through. */
const SHORT = 'q7Rw2xT9';

const OLD_HOOK = `sh /opt/tallybook/hooks/session-start.sh --token ${TOKEN}`;
const OLD_SERVER = { type: 'stdio', command: 'node', args: ['/opt/tallybook/mcp/tallybook-mcp.mjs', '--hb', TOKEN] };
const OLD_SKILL = '---\nname: old-brain\ndescription: Read and write the shared brain at https://tallybook.example.\n---\n\n# Tallybook\n';
/* Notes that mention the host in their body and not in their description: no skill of the old tool's (H.620). */
const NOTES = '---\nname: notes\ndescription: Notes on moving between tools.\n---\n\nWe left https://tallybook.example in March.\n';
const CRONTAB = `# nightly\n0 3 * * * node /opt/tallybook/mcp/tallybook-mcp.mjs sync ${SHORT}\n15 4 * * * /usr/bin/true\n`;

const scratch = mkdtempSync(join(tmpdir(), 'braindog-doctor-'));
after(() => rmSync(scratch, { recursive: true, force: true }));
let homes = 0;
const newHome = () => {
  const dir = join(scratch, `home-${String(homes++)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
};
const json = (file: string, value: unknown) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
};

/** One hash of every file under a folder, by path and bytes: what "it changes nothing" is held to. */
const hashOf = (dir: string): string => {
  const hash = createHash('sha256');
  const walk = (at: string) => {
    for (const name of readdirSync(at).sort()) {
      const path = join(at, name);
      hash.update(path);
      if (statSync(path).isDirectory()) walk(path);
      else hash.update(readFileSync(path));
    }
  };
  walk(dir);
  return hash.digest('hex');
};

/** BrainDog's own entries, as `install` and the hand-run line leave a profile. */
const ours = {
  hooks: {
    SessionStart: [{ hooks: [{ type: 'command', command: hookCommand('start', scripts), timeout: 10 }] }],
    SessionEnd: [{ hooks: [{ type: 'command', command: hookCommand('end', scripts), timeout: 10 }] }],
  },
};

/** A home where the old tool is still everywhere: a server, a hook, a skill, and a project file under `work/`. */
function planted() {
  const home = newHome();
  const profile = join(home, '.claude');
  const servers = join(home, '.claude.json');
  const settings = join(profile, 'settings.json');
  json(servers, { mcpServers: { brain: OLD_SERVER, braindog: BRAINDOG_SERVER } });
  json(settings, { hooks: { ...ours.hooks, SessionStart: [...ours.hooks.SessionStart, { hooks: [{ type: 'command', command: OLD_HOOK }] }] } });
  mkdirSync(join(profile, 'skills', 'old-brain'), { recursive: true });
  mkdirSync(join(profile, 'skills', 'notes'), { recursive: true });
  writeFileSync(join(profile, 'skills', 'old-brain', 'SKILL.md'), OLD_SKILL);
  writeFileSync(join(profile, 'skills', 'notes', 'SKILL.md'), NOTES);
  const project = join(home, 'work', 'shop', '.mcp.json');
  json(project, { mcpServers: { tally: { url: 'https://tallybook.example/mcp' } } });
  writeFileSync(join(home, '.zshrc'), `export PATH=$PATH:/usr/local/bin\nsh /opt/tallybook/hooks/session-end.sh\n`);
  return { home, profile, servers, settings, project, skill: join(profile, 'skills', 'old-brain', 'SKILL.md') };
}

const has = (places: { file: string; entry: string; kind: string }[], kind: string, file: string, entry: string) =>
  assert.ok(
    places.some((p) => p.kind === kind && p.file === file && p.entry === entry),
    `no ${kind} at ${file}, ${entry}:\n${JSON.stringify(places, null, 2)}`,
  );

test('EACH PLANTED PLACE IS FOUND, named by its file and its entry', () => {
  const p = planted();
  const report = planDoctor({ home: p.home, profiles: [p.profile], replace: REPLACE, under: [join(p.home, 'work')], crontab: CRONTAB });
  has(report.places, 'server', p.servers, 'mcpServers.brain');
  has(report.places, 'hook', p.settings, 'hooks.SessionStart');
  has(report.places, 'skill', p.skill, 'description');
  has(report.places, 'schedule', 'crontab', 'line 2');
  has(report.places, 'server', p.project, 'mcpServers.tally');
  has(report.places, 'startup', join(p.home, '.zshrc'), 'line 2');
  has(report.places, 'key', p.servers, 'mcpServers.brain');
  has(report.places, 'key', p.settings, 'hooks.SessionStart');
  /* The notes folder names the host in its body only, the other crontab line names nothing, and BrainDog's own are left. */
  assert.equal(report.places.filter((x) => x.kind === 'skill').length, 1);
  assert.equal(report.places.filter((x) => x.kind === 'schedule').length, 1);
  assert.ok(!report.places.some((x) => x.entry === 'mcpServers.braindog'), JSON.stringify(report.places));
});

test('THE PRINTED LINES NAME EACH FILE AND ENTRY, and the tool by its name', () => {
  const p = planted();
  const lines = printDoctor(planDoctor({ home: p.home, profiles: [p.profile], replace: REPLACE, under: [], crontab: CRONTAB }));
  const text = lines.join('\n');
  for (const [file, entry] of [
    [p.servers, 'mcpServers.brain'],
    [p.settings, 'hooks.SessionStart'],
    [p.skill, 'description'],
    ['crontab', 'line 2'],
  ] as const)
    assert.ok(
      lines.some((l) => l.includes(file) && l.includes(entry)),
      `no line for ${file}, ${entry}:\n${text}`,
    );
  assert.match(text, /Tallybook/);
  assert.doesNotMatch(text, /—/, 'an em dash in a line a person reads');
});

test('THE TOKEN IS NEVER PRINTED, in the lines or in the JSON, whole or short', () => {
  const p = planted();
  const out = doctor(['--replaced', REPLACE_FILE, '--under', join(p.home, 'work'), '--json'], { home: p.home, env: {}, crontab: () => CRONTAB });
  const all = `${out.lines.join('\n')}\n${JSON.stringify(out.report)}`;
  assert.ok(!all.includes(TOKEN), `the token was printed:\n${all}`);
  assert.ok(!all.includes(SHORT), `the short token was printed:\n${all}`);
  assert.ok(!all.includes('--token'), 'a hook was printed with its arguments');
  assert.equal(out.json, true);
});

test('EXIT 1 WHEN ANYTHING IS LISTED, and the home is byte for byte what it was', () => {
  const p = planted();
  const before = hashOf(p.home);
  const out = doctor(['--replaced', REPLACE_FILE, '--under', join(p.home, 'work')], { home: p.home, env: {}, crontab: () => CRONTAB });
  assert.equal(out.code, 1);
  assert.ok(out.report.places.length >= 6, JSON.stringify(out.report.places));
  assert.equal(hashOf(p.home), before, 'doctor changed the home');
});

test('A KEY IS LISTED WITHOUT --replaced TOO, and the old tool is not looked for', () => {
  const p = planted();
  const out = doctor([], { home: p.home, env: {}, crontab: () => CRONTAB });
  assert.equal(out.code, 1);
  assert.deepEqual([...new Set(out.report.places.map((x) => x.kind))], ['key']);
});

test('A CLEAN HOME EXITS 0: BrainDog served, both hooks, nothing of the old tool', () => {
  const home = newHome();
  json(join(home, '.claude.json'), { mcpServers: { braindog: BRAINDOG_SERVER } });
  json(join(home, '.claude', 'settings.json'), ours);
  const before = hashOf(home);
  const out = doctor(['--replaced', REPLACE_FILE], { home, env: {}, crontab: () => '15 4 * * * /usr/bin/true\n' });
  assert.equal(out.code, 0, out.lines.join('\n'));
  assert.deepEqual(out.report.places, []);
  assert.deepEqual(out.report.profiles, [{ dir: join(home, '.claude'), server: 'this', start: true, end: true }]);
  assert.equal(hashOf(home), before);
});

test('A PROFILE WITHOUT BRAINDOG IS LISTED: no server, and the hook that is missing is named', () => {
  const home = newHome();
  json(join(home, '.claude-studio', 'settings.json'), { hooks: { SessionStart: ours.hooks.SessionStart } });
  const out = doctor([], { home, env: {}, crontab: () => null });
  assert.deepEqual(out.report.profiles, [{ dir: join(home, '.claude-studio'), server: 'none', start: true, end: false }]);
  assert.equal(out.code, 1);
  assert.ok(out.report.places.some((x) => x.kind === 'profile' && x.entry === 'mcpServers.braindog'));
  assert.ok(out.report.places.some((x) => x.kind === 'profile' && x.entry === 'hooks.SessionEnd'));
});

test('EVERY PROFILE IN THE HOME IS FOUND: .claude and each .claude-<name> that holds settings', () => {
  const home = newHome();
  json(join(home, '.claude', 'settings.json'), {});
  json(join(home, '.claude-work', 'settings.json'), {});
  mkdirSync(join(home, '.claude-empty'));
  assert.deepEqual(profilesIn(home, [], {}), [join(home, '.claude'), join(home, '.claude-work')]);
  assert.deepEqual(profilesIn(home, [join(home, 'elsewhere')], {}), [join(home, 'elsewhere')]);
});

test('ARGUMENTS IT DOES NOT KNOW ARE REFUSED IN ONE SENTENCE, and so is a replace file that does not read', () => {
  const home = newHome();
  assert.throws(() => doctor(['--apply'], { home, env: {}, crontab: () => null }), /braindog doctor takes/);
  assert.throws(() => doctor(['--replaced', join(home, 'none.json')], { home, env: {}, crontab: () => null }), /could not be read as JSON/);
});

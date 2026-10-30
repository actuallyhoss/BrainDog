/**
 * `braindog env diff`: how the profiles on one machine differ, by name and hash, and how each differs from your BrainDog.
 *
 * EVERY FILE IS UNDER A TEMPORARY FOLDER and `home` and `env` are always passed, so no real profile is read. The
 * record is handed in as names, or read through a client made here, so no host is asked either.
 *
 * NO VALUE REACHES A LINE. One planted `.claude.json` holds a key in an address, a header, an environment value, an
 * argument and a server's own name, and none of it may come out, in the lines or in the JSON.
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import type { Page } from '@braindog/client';
import type { Result } from '@braindog/ports';

import { envCommand, envDiff, planEnvDiff, printEnvDiff, recordNames, shortHash, type MakeClient, type RecordNames } from '../src/env.ts';
import { canonical } from '../src/tools.ts';

/* Made up, in the shape of a key: a known prefix, letters and digits mixed. It must never reach a line. */
const TOKEN = 'hb_live_4f9K2mQ8xZ71';
/* Eight characters with no prefix, the shape a length test alone lets through. */
const SHORT = 'q7Rw2xT9';

const scratch = mkdtempSync(join(tmpdir(), 'braindog-env-'));
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
const text = (file: string, value: string) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, value);
};
const skill = (profile: string, name: string) => text(join(profile, 'skills', name, 'SKILL.md'), `---\nname: ${name}\ndescription: A skill.\n---\n`);
/** A folder under the home as the lines say it, with this system's own slashes. */
const tilde = (path: string, home: string) => `~${path.slice(home.length)}`;

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

const hook = { hooks: [{ type: 'command', command: 'true' }] };
const LANTERN = { command: 'npx', args: ['lantern-mcp'] };
const QUILL = { type: 'http', url: `https://quill.example/mcp?token=${TOKEN}` };

/**
 * Three profiles: the default one, `.claude-studio`, and ccenv's `work`, whose skills folder is a link to the default
 * one's. The default profile's servers file holds a key in every place a server entry can.
 */
function planted() {
  const home = newHome();
  const main = join(home, '.claude');
  const studio = join(home, '.claude-studio');
  const work = join(home, '.ccenv', 'profiles', 'work');
  json(join(main, 'settings.json'), { enabledPlugins: { 'notes@market': true, 'draw@market': false }, hooks: { SessionStart: [hook], Stop: [] } });
  json(join(home, '.claude.json'), {
    mcpServers: {
      lantern: LANTERN,
      quill: QUILL,
      vault: { type: 'http', url: 'https://vault.example/mcp', headers: { Authorization: `Bearer ${TOKEN}` } },
      ledger: { command: 'node', args: ['ledger.mjs', '--key', SHORT], env: { LEDGER_API_TOKEN: TOKEN } },
      [TOKEN]: { command: 'echo' },
    },
  });
  skill(main, 'alpha');
  skill(main, 'beta');
  mkdirSync(join(main, 'skills', '.replaced'), { recursive: true });
  text(join(main, 'CLAUDE.md'), 'Be brief.\n');
  json(join(studio, 'settings.json'), { enabledPlugins: { 'notes@market': true, 'draw@market': true }, hooks: { SessionStart: [hook], Stop: [hook] } });
  json(join(studio, '.claude.json'), { mcpServers: { lantern: { ...LANTERN, args: ['lantern-mcp', '--verbose'] }, quill: QUILL } });
  skill(studio, 'alpha');
  text(join(studio, 'CLAUDE.md'), 'Be brief.\n');
  json(join(work, 'settings.json'), { enabledPlugins: { 'notes@market': true } });
  json(join(work, '.claude.json'), { mcpServers: { lantern: LANTERN } });
  symlinkSync(join(main, 'skills'), join(work, 'skills'), 'junction');
  text(join(work, 'CLAUDE.md'), 'Be thorough.\n');
  return { home, main, studio, work };
}

const SIGNED_OUT: RecordNames = { read: false, why: 'signed-out' };
const signedOut = async () => SIGNED_OUT;

test('EACH PROFILE IS READ BY NAME AND HASH: servers, the plugins turned on, hook events with a hook, skill folders, CLAUDE.md', () => {
  const p = planted();
  const report = planEnvDiff({ home: p.home, profiles: [p.main, p.studio, p.work], record: SIGNED_OUT });
  const [main, studio, work] = report.profiles;
  assert.deepEqual(
    report.profiles.map((x) => [x.name, x.dir]),
    [
      ['default', tilde(p.main, p.home)],
      ['studio', tilde(p.studio, p.home)],
      ['work', tilde(p.work, p.home)],
    ],
  );
  assert.deepEqual(Object.keys(main?.servers ?? {}), ['[hidden name 1]', 'lantern', 'ledger', 'quill', 'vault']);
  assert.equal(main?.servers.lantern, shortHash(canonical(LANTERN)));
  assert.deepEqual(main?.plugins, ['notes@market']);
  assert.deepEqual(main?.hooks, ['SessionStart']);
  assert.deepEqual(main?.skills, ['alpha', 'beta']);
  assert.deepEqual(studio?.plugins, ['draw@market', 'notes@market']);
  assert.deepEqual(studio?.hooks, ['SessionStart', 'Stop']);
  /* ccenv's profile reads the default one's skills through its link, and a dot folder is no skill. */
  assert.deepEqual(work?.skills, ['alpha', 'beta']);
  assert.equal(work?.claudeMd, shortHash('Be thorough.\n'));
});

test('WHAT EACH LACKS BESIDE THE OTHERS, what differs, and CLAUDE.md when it is not one file everywhere', () => {
  const p = planted();
  const report = planEnvDiff({ home: p.home, profiles: [p.main, p.studio, p.work], record: SIGNED_OUT });
  assert.deepEqual(report.missing, [
    { profile: 'studio', part: 'server', names: ['[hidden name 1]', 'ledger', 'vault'] },
    { profile: 'work', part: 'server', names: ['[hidden name 1]', 'ledger', 'quill', 'vault'] },
    { profile: 'default', part: 'plugin', names: ['draw@market'] },
    { profile: 'work', part: 'plugin', names: ['draw@market'] },
    { profile: 'default', part: 'hook', names: ['Stop'] },
    { profile: 'work', part: 'hook', names: ['SessionStart', 'Stop'] },
    { profile: 'studio', part: 'skill', names: ['beta'] },
  ]);
  const usual = shortHash(canonical(LANTERN));
  const verbose = shortHash(canonical({ ...LANTERN, args: ['lantern-mcp', '--verbose'] }));
  assert.deepEqual(report.differs, [{ server: 'lantern', hashes: { default: usual, studio: verbose, work: usual } }]);
  const brief = shortHash('Be brief.\n');
  assert.deepEqual(report.claudeMd, { default: brief, studio: brief, work: shortHash('Be thorough.\n') });

  const lines = printEnvDiff(report);
  for (const line of [
    `default, ${tilde(p.main, p.home)}: 5 servers, 1 plugin, 1 hook event, 2 skills, CLAUDE.md ${brief}.`,
    'Missing beside the other profiles:',
    '  default and work lack the plugin draw@market.',
    '  work lacks the hook events SessionStart, Stop.',
    `  server lantern: ${usual} in default and work; ${verbose} in studio.`,
    `  CLAUDE.md: ${brief} in default and studio; ${shortHash('Be thorough.\n')} in work.`,
    "This machine is not signed in to BrainDog, so your BrainDog's tools and skills were not compared.",
    '8 differences, by name and hash only.',
  ])
    assert.ok(lines.includes(line), `no line ${JSON.stringify(line)}:\n${lines.join('\n')}`);
  assert.doesNotMatch(lines.join('\n'), /—/, 'an em dash in a line a person reads');
});

test('AGAINST THE RECORD: the tools and skills each lacks, and what each holds the record does not', () => {
  const p = planted();
  const report = planEnvDiff({ home: p.home, profiles: [p.main, p.studio, p.work], record: { read: true, tools: ['lantern', 'compass'], skills: ['alpha', 'gamma'] } });
  assert.ok(report.record.read);
  assert.deepEqual(report.record.lacks, [
    { profile: 'default', part: 'server', names: ['compass'] },
    { profile: 'default', part: 'skill', names: ['gamma'] },
    { profile: 'studio', part: 'server', names: ['compass'] },
    { profile: 'studio', part: 'skill', names: ['gamma'] },
    { profile: 'work', part: 'server', names: ['compass'] },
    { profile: 'work', part: 'skill', names: ['gamma'] },
  ]);
  assert.deepEqual(report.record.extra, [
    { profile: 'default', part: 'server', names: ['[hidden name 1]', 'ledger', 'quill', 'vault'] },
    { profile: 'default', part: 'skill', names: ['beta'] },
    { profile: 'studio', part: 'server', names: ['quill'] },
    { profile: 'work', part: 'skill', names: ['beta'] },
  ]);
  const lines = printEnvDiff(report);
  for (const line of [
    "Against your BrainDog's 2 tools and 2 skills that apply everywhere:",
    '  default, studio and work lack the tool compass.',
    '  default, studio and work lack the skill gamma.',
    '  default holds servers your BrainDog does not: [hidden name 1], ledger, quill, vault.',
    '  default and work hold a skill your BrainDog does not: beta.',
  ])
    assert.ok(lines.includes(line), `no line ${JSON.stringify(line)}:\n${lines.join('\n')}`);
});

test('A KEY IN A SERVERS FILE NEVER REACHES THE OUTPUT: not its address, header, environment, argument or name', async () => {
  const p = planted();
  /* A plugin named like a key is hidden too, and keeps its own hidden name. */
  json(join(p.studio, 'settings.json'), { enabledPlugins: { [`${SHORT}@market`]: true } });
  const before = hashOf(p.home);
  const out = await envDiff(['--json'], { home: p.home, env: {}, record: async () => ({ read: true, tools: [TOKEN], skills: [] }) });
  const all = `${out.lines.join('\n')}\n${JSON.stringify(out.report)}`;
  for (const value of [TOKEN, SHORT, '4f9K2mQ8xZ71', 'quill.example', 'vault.example', 'Bearer', 'LEDGER_API_TOKEN', '--key', 'ledger.mjs'])
    assert.ok(!all.includes(value), `${value} was printed:\n${all}`);
  assert.match(all, /\[hidden name 1\]/);
  assert.match(all, /\[hidden name 2\]/);
  assert.equal(out.json, true);
  assert.equal(hashOf(p.home), before, 'env diff changed the home');
});

test('THE VERB FINDS THE PROFILES AS doctor DOES, exits 1 on a difference and 0 on none, and says it is signed out', async () => {
  const p = planted();
  const out = await envDiff([], { home: p.home, env: {}, record: signedOut });
  assert.deepEqual(
    out.report.profiles.map((x) => x.name),
    ['default', 'studio', 'work'],
  );
  assert.equal(out.code, 1);
  const home = newHome();
  json(join(home, '.claude', 'settings.json'), {});
  json(join(home, '.claude-twin', 'settings.json'), {});
  const same = await envDiff([], { home, env: {}, record: signedOut });
  assert.equal(same.code, 0, same.lines.join('\n'));
  assert.equal(same.lines.at(-1), 'Nothing differs.');
  /* --config-dir names the profiles, and nothing else is read. */
  const named = await envDiff(['--config-dir', p.studio], { home: p.home, env: {}, record: signedOut });
  assert.deepEqual(
    named.report.profiles.map((x) => x.name),
    ['studio'],
  );
});

test('TWO PROFILES OF ONE NAME ARE EACH CALLED BY WHERE THEY ARE', () => {
  const home = newHome();
  json(join(home, '.claude-work', 'settings.json'), {});
  json(join(home, '.ccenv', 'profiles', 'work', 'settings.json'), {});
  const report = planEnvDiff({ home, profiles: [join(home, '.claude-work'), join(home, '.ccenv', 'profiles', 'work')], record: SIGNED_OUT });
  assert.deepEqual(
    report.profiles.map((x) => x.name),
    report.profiles.map((x) => x.dir),
  );
});

test('ARGUMENTS IT DOES NOT TAKE ARE REFUSED IN ONE SENTENCE, before anything is read', async () => {
  const home = newHome();
  await assert.rejects(envDiff(['--apply'], { home, env: {}, record: signedOut }), /braindog env diff takes --config-dir/);
  await assert.rejects(envDiff([TOKEN], { home, env: {}, record: signedOut }), (e: Error) => !e.message.includes(TOKEN));
  await assert.rejects(envCommand(['show'], { home, env: {}, record: signedOut }), /braindog env takes diff/);
});

/* ── the record's names ─────────────────────────────────────────────────── */

type Row = { seq: number; state: string; fields: Record<string, unknown> };
const row = (seq: number, name: string, fields: Record<string, unknown> = {}, state = 'active'): Row => ({ seq, state, fields: { name, ...fields } });

/** A client whose `list` answers the pages given, a cursor at a time, and keeps every read and its headers. */
function lists(pages: Record<string, { rows: Row[]; cursor: string | null }[]>, answer?: Result<Page<unknown>>) {
  const seen: { register: string; cursor: string | undefined; headers: Record<string, string> }[] = [];
  const make: MakeClient = (_to, headers) => ({
    list: async (args) => {
      seen.push({ register: args.register, cursor: args.cursor ?? undefined, headers: await headers() });
      if (answer !== undefined) return answer;
      const page = pages[args.register]?.[args.cursor ? Number(args.cursor) : 0] ?? { rows: [], cursor: null };
      return { ok: true, value: { rows: page.rows, matched: page.rows.length, cursor: page.cursor } };
    },
  });
  return { make, seen };
}

const SIGNED_IN = { BRAINDOG_HOST: 'https://record.example/kiln', BRAINDOG_TOKEN: 'rec_01TESTTESTTESTTESTTESTTEST' };

test('THE RECORD IS READ WHOLE, A PAGE AT A TIME, WITH NO SESSION HEADERS: MCP tools and skills that apply everywhere', async () => {
  const { make, seen } = lists({
    tools: [
      { rows: [row(1, 'lantern', { kind: 'mcp' }), row(2, 'helper', { kind: 'cli' }), row(3, 'board', { kind: 'integration' }), row(4, 'local', { kind: 'mcp', project: 'e_things_1' })], cursor: '1' },
      { rows: [row(5, 'compass'), row(6, 'old', { kind: 'mcp' }, 'retired')], cursor: null },
    ],
    skills: [{ rows: [row(1, 'alpha', { kind: 'skill' }), row(2, 'deploy', { kind: 'command' }), row(3, 'beta'), row(4, 'ours', { project: 'e_things_1' })], cursor: null }],
  });
  const env = { ...SIGNED_IN, XDG_CONFIG_HOME: join(newHome(), 'config') };
  assert.deepEqual(await recordNames(undefined, env, { make }), { read: true, tools: ['compass', 'lantern'], skills: ['alpha', 'beta'] });
  assert.deepEqual(
    seen.map((s) => [s.register, s.cursor]),
    [
      ['tools', undefined],
      ['tools', '1'],
      ['skills', undefined],
    ],
  );
  assert.ok(seen.every((s) => Object.keys(s.headers).length === 0), 'a read sent session headers');
  /* The skills alone, for the inventory. */
  const skillsOnly = lists({ skills: [{ rows: [row(1, 'alpha')], cursor: null }] });
  assert.deepEqual(await recordNames(undefined, env, { make: skillsOnly.make, tools: false }), { read: true, tools: [], skills: ['alpha'] });
  assert.deepEqual(
    skillsOnly.seen.map((s) => s.register),
    ['skills'],
  );
});

test('SIGNED OUT, UNREACHABLE OR REFUSED, THE RECORD SAYS WHICH and nothing more is read', async () => {
  const config = join(newHome(), 'config');
  const never = lists({});
  assert.deepEqual(await recordNames(undefined, { XDG_CONFIG_HOME: config, APPDATA: config }, { make: never.make }), { read: false, why: 'signed-out' });
  assert.deepEqual(await recordNames(undefined, { BRAINDOG_HOST: SIGNED_IN.BRAINDOG_HOST, XDG_CONFIG_HOME: config, APPDATA: config }, { make: never.make }), { read: false, why: 'signed-out' });
  assert.equal(never.seen.length, 0);
  const env = { ...SIGNED_IN, XDG_CONFIG_HOME: config };
  const away = lists({}, { ok: false, refusal: { code: 'UNREACHABLE', fix: 'The record did not answer.' } });
  assert.deepEqual(await recordNames(undefined, env, { make: away.make }), { read: false, why: 'unreachable' });
  const no = lists({}, { ok: false, refusal: { code: 'FORBIDDEN', fix: 'This token may not read tools.' } });
  assert.deepEqual(await recordNames(undefined, env, { make: no.make }), { read: false, why: 'refused' });
  assert.equal(no.seen.length, 1, 'a refusal is the end of the read');
});

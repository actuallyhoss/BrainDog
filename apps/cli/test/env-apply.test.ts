/**
 * `braindog env apply`: setup's steps run in each Claude Code profile on one machine, with the record's tools and
 * skills each profile is given, its rules in a marked block of its CLAUDE.md, and every program asked about first.
 *
 * EVERY FILE IS UNDER A TEMPORARY FOLDER and `home` and `env` are always passed, so no real profile is read. The record
 * is a client made here, the terminal is a function that answers, and `claude` is a stand-in that writes the profile's
 * servers file as the real one does. No host is asked and no program runs.
 *
 * NO KEY REACHES A FILE. The login, and a key-shaped value in a tool's arguments and in a profile's rules, are looked
 * for in every file the run leaves and every line it says.
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import type { Client, Context } from '@braindog/client';

import { envApply, RULES_END, RULES_START, withRules, type EnvApplyIo } from '../src/env-apply.ts';
import { pinsFile, readPins } from '../src/pins.ts';
import { allowSkills } from '../src/skills-consent.ts';
import type { ProfileRunner } from '../src/setup.ts';

/* Made up, in the shapes of a login and an issuer's key. Neither may reach a file or a line. */
const LOGIN = ['rec_01TESTTESTTESTTESTTESTTEST', `stub-login-${randomBytes(12).toString('hex')}`].join('.');
const KEY = ['sk', 'proj', `FakeTestsOnly${randomBytes(12).toString('hex')}`].join('-');
const HOST = 'https://record.example/kiln';
const CLI = '/fake/braindog/apps/cli/src/main.ts';
const SCRIPTS = '/fake/braindog/hooks';
const NOW = Date.parse('2026-10-22T09:00:00.000Z');

const scratch = mkdtempSync(join(tmpdir(), 'braindog-env-apply-'));
after(() => rmSync(scratch, { recursive: true, force: true }));
let homes = 0;
const json = (file: string, value: unknown) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
};
const text = (file: string, value: string) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, value);
};

/** Every file under a folder, a link's target read where it is and not again through the link. */
function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    const st = lstatSync(path);
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) out.push(...filesUnder(path));
    else out.push(path);
  }
  return out;
}

/** One hash of every file under a folder, by path and bytes: what "it writes nothing" is held to. */
const hashOf = (dir: string): string => {
  const hash = createHash('sha256');
  for (const file of filesUnder(dir)) hash.update(file).update(readFileSync(file));
  return hash.digest('hex');
};

const nowhere = (texts: string[], secrets: string[]) => {
  for (const t of texts) for (const secret of secrets) assert.ok(!t.includes(secret), 'a key reached a line or a file');
};

/* The person's own CLAUDE.md text, which every run must leave byte for byte. */
const MINE = '# Mine\n\nBe brief.\n\nMy own notes stay here.\n';
const MINE_CRLF = 'Studio notes.\r\nSecond line, no newline after';

/**
 * Three profiles: the default one, `.claude-studio` with a CLAUDE.md in Windows line endings, and ccenv's `work`, with
 * no CLAUDE.md and its skills folder a link to the default one's, as ccenv makes it.
 */
function planted() {
  const home = join(scratch, `home-${String(homes++)}`);
  const main = join(home, '.claude');
  const studio = join(home, '.claude-studio');
  const work = join(home, '.ccenv', 'profiles', 'work');
  for (const dir of [main, studio, work]) json(join(dir, 'settings.json'), {});
  text(join(main, 'CLAUDE.md'), MINE);
  text(join(studio, 'CLAUDE.md'), MINE_CRLF);
  mkdirSync(join(main, 'skills'), { recursive: true });
  symlinkSync(join(main, 'skills'), join(work, 'skills'), 'junction');
  const config = join(home, 'config');
  const env = { BRAINDOG_HOST: HOST, BRAINDOG_TOKEN: LOGIN, XDG_CONFIG_HOME: config, APPDATA: config, PATH: dirname(process.execPath) };
  /* THE YES `braindog skills sync` KEEPS, without which env apply copies no skill (RG12). */
  allowSkills(home, HOST);
  return { home, main, studio, work, env };
}
type Planted = ReturnType<typeof planted>;

/* ── the record ─────────────────────────────────────────────────────────── */

type Row = { seq: number; state?: string; version?: number; fields: Record<string, unknown> };

const LANTERN = { name: 'lantern', kind: 'mcp', transport: 'stdio', command: process.execPath, args: ['lantern.mjs'] };
/* For studio alone, by a ref to its row in Profiles. */
const QUILL = { name: 'quill', kind: 'mcp', transport: 'http', endpoint: 'https://quill.example/mcp', profiles: ['profiles#2'] };
/* Its key is named by the command that opens it, and never held. */
const VAULTED = { name: 'vaulted', kind: 'mcp', transport: 'http', endpoint: 'https://vault.example/mcp', needs: ['header:Authorization=credentials#4'] };
const LEAKY = { name: 'leaky', kind: 'mcp', transport: 'stdio', command: process.execPath, args: ['leaky.mjs', '--key', KEY] };

const tools = (...more: Row['fields'][]): Row[] => [LANTERN, QUILL, VAULTED, ...more].map((fields, i) => ({ seq: i + 1, fields: { ...fields } }));
const skills = (): Row[] => [
  { seq: 1, fields: { name: 'alpha', kind: 'skill', trigger: 'Use for alpha.', body: 'Alpha body.\n', rev: 1 } },
  /* For studio alone, by its name. */
  { seq: 2, fields: { name: 'beta', kind: 'skill', trigger: 'Use for beta.', body: 'Beta body.\n', rev: 1, profiles: ['studio'] } },
  /* BrainDog's own skill, which step 1 places, kept in the record as index only. */
  { seq: 3, fields: { name: 'braindog', kind: 'skill', trigger: 'BrainDog.', body: 'Kept by BrainDog.\n', managed: false } },
];
const PEOPLE: Row[] = [
  { seq: 1, fields: { name: 'default', app: 'Claude Code', rules: 'Answer in English.\nKeep replies short.' } },
  { seq: 2, fields: { name: 'studio', app: 'Claude Code', rules: 'Draw first.' } },
  /* Another app's row of the same name is not a Claude Code profile's. */
  { seq: 3, fields: { name: 'work', app: 'Cursor', rules: 'Never this.' } },
];

/**
 * A record whose lists are these rows, reached without a host. `profiles: false` is a record without the Profiles
 * add-on, whose `schemas` names no list in that role. Every method the run calls is kept.
 */
function record(o: { tools: Row[]; skills: Row[]; people?: Row[]; profiles?: boolean }) {
  const registers: Record<string, Row[]> = { tools: o.tools, skills: o.skills, profiles: o.people ?? PEOPLE };
  const calls: string[] = [];
  const entry = (register: string, r: Row) => ({ id: `e_${register}_${String(r.seq)}`, register, seq: r.seq, state: r.state ?? 'active', version: r.version ?? 1, fields: r.fields });
  const no = { ok: false, refusal: { code: 'FORBIDDEN', fix: 'Not in this test.' } };
  const client = {
    call: async (method: string) => {
      calls.push(method);
      if (method !== 'schemas') return no;
      const lists = o.profiles === false ? { tools: { title: 'name' } } : { tools: { title: 'name' }, profiles: { role: 'profiles', title: 'name' } };
      return { ok: true, value: { lists } };
    },
    list: async (args: { register: string }) => {
      calls.push(`list ${args.register}`);
      const rows = (registers[args.register] ?? []).map((r) => entry(args.register, r));
      return { ok: true, value: { rows, matched: rows.length, cursor: null } };
    },
    get: async (register: string, seq: number) => {
      const r = (registers[register] ?? []).find((x) => x.seq === seq);
      return r ? { ok: true, value: entry(register, r) } : { ok: false, refusal: { code: 'REF_UNKNOWN', fix: 'There is no such row.' } };
    },
    create: async () => (calls.push('create'), no),
    update: async () => (calls.push('update'), no),
  };
  const brief = (register: string, r: Row) => ({
    spoken: `${register}#${String(r.seq)}`,
    version: r.version ?? 1,
    scope: 'global',
    state: r.state ?? 'active',
    name: r.fields.name,
    kind: r.fields.kind,
    trigger: r.fields.trigger,
    rev: r.fields.rev ?? 1,
    project: null,
  });
  const reach = async () => ({
    to: { key: HOST, base: HOST },
    client: client as unknown as Client,
    context: {
      session: null,
      project: null,
      ambiguous: [],
      handoff: null,
      registers: ['tools', 'skills'].map((id) => ({ id, name: id, rows: (registers[id] ?? []).map((r) => brief(id, r)), inherited: [], truncated: false })),
    } as unknown as Context,
    top: null,
  });
  return { reach, calls, registers };
}

/* ── the machine ────────────────────────────────────────────────────────── */

/** A stand-in for `claude mcp add-json` and `remove`, writing the servers file of the profile its environment names. */
function fakeClaude(home: string) {
  const ran: { args: string[]; profile: string | null }[] = [];
  const run: ProfileRunner = async (args, _cwd, env) => {
    const dir = env?.CLAUDE_CONFIG_DIR;
    ran.push({ args, profile: dir ?? null });
    const file = dir === undefined ? join(home, '.claude.json') : join(dir, '.claude.json');
    const held = (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}) as { mcpServers?: Record<string, unknown> };
    const servers = { ...held.mcpServers };
    const [, verb, name = '', value = '{}'] = args;
    if (verb === 'add-json') servers[name] = JSON.parse(value);
    else if (verb === 'remove') delete servers[name];
    else return 1;
    writeFileSync(file, `${JSON.stringify({ ...held, mcpServers: servers }, null, 2)}\n`);
    return 0;
  };
  return { run, ran };
}

/** The run's io: a terminal that answers `answer` (a yes unless said), and everything it says kept. */
function machine(p: Planted, rec: ReturnType<typeof record>, o: { terminal?: boolean; answer?: (question: string) => boolean | null } = {}) {
  const lines: string[] = [];
  const said: string[] = [];
  const asked: string[] = [];
  const claude = fakeClaude(p.home);
  const io: EnvApplyIo = {
    env: p.env,
    cwd: p.home,
    home: p.home,
    out: (line) => void lines.push(line),
    say: (line) => void said.push(line),
    headers: async () => {
      throw new Error('a session header was asked for');
    },
    cli: CLI,
    scripts: SCRIPTS,
    terminal: o.terminal ?? true,
    ask: async (question) => {
      asked.push(question);
      return o.answer === undefined ? true : o.answer(question);
    },
    claude: claude.run,
    record: rec.reach,
    now: () => NOW,
  };
  return { io, lines, said, asked, ran: claude.ran, all: () => lines.join('\n') };
}

const servers = (file: string): Record<string, unknown> => (existsSync(file) ? ((JSON.parse(readFileSync(file, 'utf8')) as { mcpServers?: Record<string, unknown> }).mcpServers ?? {}) : {});
const files = (p: Planted) => ({ main: join(p.home, '.claude.json'), studio: join(p.studio, '.claude.json'), work: join(p.work, '.claude.json') });
const ASKS = ["BrainDog's hooks", "BrainDog's MCP server", 'the lantern tool', 'the vaulted tool'].map((what) => `Allow ${what} to run from Claude Code on this machine? [y/N] `);

/* ── the rules block ────────────────────────────────────────────────────── */

test('THE RULES BLOCK IS ADDED, CHANGED AND TAKEN OUT, and every other byte of the file stays as it was', () => {
  const added = withRules(MINE, 'Answer in English.\nKeep replies short.');
  assert.ok('text' in added && added.text !== null);
  assert.equal(added.text, `${MINE}\n${RULES_START}\nAnswer in English.\nKeep replies short.\n${RULES_END}\n`);
  /* Changed where it stands, the text after it untouched. */
  const later = `${added.text}Written after the block.\n`;
  const changed = withRules(later, 'Answer in French.');
  assert.ok('text' in changed);
  assert.equal(changed.text, `${MINE}\n${RULES_START}\nAnswer in French.\n${RULES_END}\nWritten after the block.\n`);
  /* Taken out, the file is the person's again, byte for byte, with the text after the block kept. */
  assert.deepEqual(withRules(added.text, '  '), { text: MINE });
  assert.deepEqual(withRules(later, ''), { text: `${MINE}Written after the block.\n` });
  assert.deepEqual(withRules(`${MINE}${RULES_START}\nOld.\n${RULES_END}\n`, ''), { text: MINE });
  /* A file in Windows line endings takes the block in its own, and one with no last line break gains one before it. */
  const crlf = withRules(MINE_CRLF, 'Draw first.');
  assert.ok('text' in crlf);
  assert.equal(crlf.text, `${MINE_CRLF}\r\n\r\n${RULES_START}\r\nDraw first.\r\n${RULES_END}\r\n`);
  /* No file, and no rules: nothing to write. */
  assert.deepEqual(withRules(null, 'Be kind.'), { text: `${RULES_START}\nBe kind.\n${RULES_END}\n` });
  assert.deepEqual(withRules(null, ''), { text: null });
  assert.deepEqual(withRules(MINE, ''), { text: MINE });
});

test('A MARKER INSIDE A LINE IS THE PERSON\'S TEXT, and a block with no end or rules holding a marker change nothing', () => {
  const quoted = `They wrote \`${RULES_START}\` in a sentence.\n`;
  const out = withRules(quoted, 'Be kind.');
  assert.ok('text' in out && out.text !== null);
  assert.ok(out.text.startsWith(`${quoted}\n${RULES_START}\n`));
  assert.deepEqual(withRules(`${MINE}${RULES_START}\nHalf a block.\n`, 'Be kind.'), { refused: 'its CLAUDE.md holds the start of the rules block and no end' });
  assert.deepEqual(withRules(MINE, `Be kind.\n${RULES_END}`), { refused: 'its rules hold a line BrainDog marks the block with' });
});

/* ── the run ────────────────────────────────────────────────────────────── */

test('A DRY RUN READS THE RECORD AND WRITES NOTHING: no file, no claude, no question and no pin', async () => {
  const p = planted();
  const rec = record({ tools: tools(LEAKY), skills: skills() });
  const before = hashOf(p.home);
  const run = machine(p, rec);
  const code = await envApply(['--dry-run'], run.io);
  const all = run.all();
  assert.equal(code, 0, all);
  assert.equal(hashOf(p.home), before, 'a dry run changed the home');
  assert.deepEqual(run.ran, []);
  assert.deepEqual(run.asked, []);
  assert.equal(existsSync(pinsFile(p.home)), false);
  assert.equal(run.lines[0], 'braindog env apply: 3 profiles on this machine, default, studio and work, as a dry run.');
  assert.match(all, /Profiles names default and studio, and a tool or skill that names profiles goes to those alone\./);
  assert.match(all, /2\. MCP server: braindog would be registered at user scope/);
  assert.match(all, /It runs a program not yet approved on this machine, so applying asks about it first\./);
  assert.match(all, /\+ lantern at user scope: /);
  assert.match(all, /lantern runs a program not yet approved on this machine, so applying asks about it first\./);
  assert.match(all, /Tool leaky holds what looks like a key, so it is never written\./);
  assert.match(all, /5\. Rules: CLAUDE\.md would gain the block of default's rules from Profiles, 2 lines, with a copy of the file kept first\./);
  assert.match(all, /5\. Rules: Profiles has no row for work, so its CLAUDE\.md is left as it is\./);
  assert.equal(run.lines.at(-1), 'That was a dry run, so nothing was written, registered, asked or pinned.');
  nowhere([...run.lines, ...run.said], [LOGIN, KEY]);
  assert.ok(!rec.calls.includes('create') && !rec.calls.includes('update'), 'a dry run wrote to the record');
});

test('AT A TERMINAL EACH PROGRAM IS ASKED ONCE, PINNED, AND PLACED IN EVERY PROFILE; THE NEXT RUN ASKS NOTHING', async () => {
  const p = planted();
  const rec = record({ tools: tools(), skills: skills() });
  const run = machine(p, rec);
  const code = await envApply([], run.io);
  const all = run.all();
  assert.equal(code, 0, all);
  /* One question for each program, however many profiles it goes into. */
  assert.deepEqual(run.asked, ASKS);
  const pins = readPins(pinsFile(p.home)) ?? {};
  assert.deepEqual(
    Object.values(pins)
      .map((pin) => [pin.kind, pin.name, pin.profiles])
      .sort(),
    [
      ['hooks', 'hooks', ['default', 'studio', 'work']],
      ['server', 'braindog', ['default', 'studio', 'work']],
      ['tool', 'lantern', ['default', 'studio', 'work']],
      ['tool', 'vaulted', ['default', 'studio', 'work']],
    ],
  );
  /* Each profile's own servers file, by its own CLAUDE_CONFIG_DIR, the default one with none. */
  const f = files(p);
  assert.deepEqual(Object.keys(servers(f.main)).sort(), ['braindog', 'lantern', 'vaulted']);
  assert.deepEqual(Object.keys(servers(f.studio)).sort(), ['braindog', 'lantern', 'quill', 'vaulted']);
  assert.deepEqual(Object.keys(servers(f.work)).sort(), ['braindog', 'lantern', 'vaulted']);
  assert.deepEqual([...new Set(run.ran.map((r) => r.profile))], [null, p.studio, p.work]);
  assert.deepEqual(servers(f.studio).vaulted, { type: 'http', url: 'https://vault.example/mcp', headersHelper: `node "${CLI}" keys headers credentials#4 --as Authorization` });
  /* The hooks, in each profile's settings. */
  for (const dir of [p.main, p.studio, p.work]) assert.match(readFileSync(join(dir, 'settings.json'), 'utf8'), /braindog-hook\.sh/);
  /* Skills: alpha everywhere; beta in studio alone, and not in the folder default and work share. */
  assert.ok(existsSync(join(p.main, 'skills', 'alpha', 'SKILL.md')));
  assert.ok(existsSync(join(p.studio, 'skills', 'alpha', 'SKILL.md')));
  assert.ok(existsSync(join(p.studio, 'skills', 'beta', 'SKILL.md')));
  assert.equal(existsSync(join(p.main, 'skills', 'beta')), false);
  assert.match(all, /4\. Skills: its skills folder is default's, so the skills given to any profile that shares it were synced there\./);
  assert.match(all, /Left out here, because Profiles gives it to other profiles: quill\./);
  /* Rules: default's and studio's, in a block after the person's own text; work has no row. */
  assert.equal(readFileSync(join(p.main, 'CLAUDE.md'), 'utf8'), `${MINE}\n${RULES_START}\nAnswer in English.\nKeep replies short.\n${RULES_END}\n`);
  assert.equal(readFileSync(join(p.studio, 'CLAUDE.md'), 'utf8'), `${MINE_CRLF}\r\n\r\n${RULES_START}\r\nDraw first.\r\n${RULES_END}\r\n`);
  assert.equal(existsSync(join(p.work, 'CLAUDE.md')), false);
  assert.equal(readFileSync(`${join(p.main, 'CLAUDE.md')}.pre-braindog`, 'utf8'), MINE, 'no copy of CLAUDE.md was kept first');
  assert.equal(run.lines.at(-1), 'Applied to default, studio and work. Sessions started from now on in each have it.');

  /* The next run: everything is there and approved, so nothing is asked, written or run. */
  const before = hashOf(p.home);
  const again = machine(p, rec);
  assert.equal(await envApply([], again.io), 0, again.all());
  assert.deepEqual(again.asked, []);
  assert.deepEqual(again.ran, []);
  assert.equal(hashOf(p.home), before, 'a run with nothing to do changed the home');
  assert.equal(again.lines.at(-1), 'Nothing changed: every profile already holds what your BrainDog applies to it.');
});

test('A CHANGED ENTRY IS ASKED ABOUT AGAIN: a yes replaces its pin, and a no leaves the old entry and names it', async () => {
  const p = planted();
  const rec = record({ tools: tools(), skills: skills() });
  assert.equal(await envApply([], machine(p, rec).io), 0);
  const first = readPins(pinsFile(p.home)) ?? {};

  /* The record's lantern now starts with another argument. */
  rec.registers.tools![0]!.fields.args = ['lantern.mjs', '--fast'];
  const no = machine(p, rec, { answer: () => false });
  assert.equal(await envApply([], no.io), 1, no.all());
  assert.deepEqual(no.asked, ['Allow the lantern tool to run from Claude Code on this machine? [y/N] ']);
  assert.deepEqual(servers(files(p).studio).lantern, { type: 'stdio', command: process.execPath, args: ['lantern.mjs'] });
  assert.deepEqual(readPins(pinsFile(p.home)), first, 'a no changed the pins');
  assert.equal(no.lines.at(-2), 'Left out, because they are not approved on this machine: the lantern tool in default, studio and work.');

  const yes = machine(p, rec);
  assert.equal(await envApply([], yes.io), 0, yes.all());
  assert.deepEqual(yes.asked, ['Allow the lantern tool to run from Claude Code on this machine? [y/N] ']);
  for (const file of Object.values(files(p))) assert.deepEqual(servers(file).lantern, { type: 'stdio', command: process.execPath, args: ['lantern.mjs', '--fast'] });
  const now = readPins(pinsFile(p.home)) ?? {};
  const lanterns = Object.entries(now).filter(([, pin]) => pin.name === 'lantern');
  assert.equal(lanterns.length, 1, 'the old entry kept its pin beside the new one');
  assert.equal(first[lanterns[0]![0]], undefined, 'the changed entry kept its old hash');
  assert.equal(Object.keys(now).length, Object.keys(first).length);
});

test('WITH NO TERMINAL NOTHING IS ASKED: a plan without --yes-data, and with it the data written and each program left out by name', async () => {
  const p = planted();
  const rec = record({ tools: tools(), skills: skills() });
  const before = hashOf(p.home);
  const plan = machine(p, rec, { terminal: false });
  assert.equal(await envApply([], plan.io), 1, plan.all());
  assert.equal(hashOf(p.home), before, 'a run nobody could approve changed the home');
  assert.deepEqual(plan.asked, []);
  assert.deepEqual(plan.ran, []);
  assert.match(plan.all(), /lantern runs a program not yet approved on this machine, and no one is at a terminal to approve it\./);
  assert.match(plan.lines.at(-1) ?? '', /^Nothing was written, because no one is at a terminal to say yes\. Run braindog env apply --yes-data/);

  const data = machine(p, rec, { terminal: false });
  assert.equal(await envApply(['--yes-data'], data.io), 1, data.all());
  assert.deepEqual(data.asked, []);
  assert.equal(existsSync(pinsFile(p.home)), false, 'a run nobody answered pinned something');
  /* The plain data: quill (a URL), the skills and the rules. No program, not even BrainDog's own. */
  assert.deepEqual(Object.keys(servers(files(p).studio)), ['quill']);
  assert.deepEqual(servers(files(p).main), {});
  assert.ok(existsSync(join(p.studio, 'skills', 'beta', 'SKILL.md')));
  assert.match(readFileSync(join(p.main, 'CLAUDE.md'), 'utf8'), /Keep replies short\./);
  assert.doesNotMatch(readFileSync(join(p.main, 'settings.json'), 'utf8'), /braindog-hook/);
  assert.equal(
    data.lines.at(-2),
    "Left out, because they are not approved on this machine: BrainDog's hooks in default, studio and work; BrainDog's MCP server in default, studio and work; the lantern tool in default, studio and work; the vaulted tool in default, studio and work. Run braindog env apply at a terminal to be asked.",
  );

  /* Approved once at a terminal for one profile, the same entries go into the others with no one there. */
  const once = machine(p, rec);
  assert.equal(await envApply(['--profile', 'default'], once.io), 0, once.all());
  assert.deepEqual(once.asked, ASKS);
  const later = machine(p, rec, { terminal: false });
  assert.equal(await envApply(['--yes-data'], later.io), 0, later.all());
  assert.deepEqual(later.asked, []);
  for (const file of Object.values(files(p))) for (const name of ['braindog', 'lantern', 'vaulted']) assert.ok(Object.hasOwn(servers(file), name), `${name} is not in ${file}`);
  for (const dir of [p.studio, p.work]) assert.match(readFileSync(join(dir, 'settings.json'), 'utf8'), /braindog-hook\.sh/);
});

test('WITHOUT THE PROFILES ADD-ON IT SAYS SO ONCE, every profile gets what applies everywhere, and no CLAUDE.md is touched', async () => {
  const p = planted();
  const rec = record({ tools: tools(), skills: skills(), profiles: false });
  const run = machine(p, rec);
  assert.equal(await envApply([], run.io), 0, run.all());
  assert.equal(run.lines.filter((l) => l === 'Install the Profiles plugin to choose per profile; applying what applies everywhere.').length, 1);
  assert.ok(!rec.calls.includes('list profiles'), 'a list in no role was read');
  /* A profiles field means nothing without the list it names. */
  for (const file of Object.values(files(p))) assert.ok(Object.hasOwn(servers(file), 'quill'));
  assert.ok(existsSync(join(p.main, 'skills', 'beta', 'SKILL.md')));
  assert.equal(readFileSync(join(p.main, 'CLAUDE.md'), 'utf8'), MINE);
  assert.equal(readFileSync(join(p.studio, 'CLAUDE.md'), 'utf8'), MINE_CRLF);
  assert.equal(run.lines.filter((l) => l === '5. Rules: kept per profile by the Profiles plugin, which this BrainDog does not have.').length, 3);
});

test('RULES CHANGED IN PROFILES CHANGE THE BLOCK ALONE, and rules taken out leave the person\'s file as it was', async () => {
  const p = planted();
  const people = PEOPLE.map((r) => ({ ...r, fields: { ...r.fields } }));
  const rec = record({ tools: [], skills: [], people });
  assert.equal(await envApply([], machine(p, rec).io), 0);
  const claudeMd = join(p.main, 'CLAUDE.md');
  /* The person writes below the block between runs. */
  writeFileSync(claudeMd, `${readFileSync(claudeMd, 'utf8')}A line of mine after it.\n`);
  people[0]!.fields.rules = 'Answer in French.';
  const changed = machine(p, rec);
  assert.equal(await envApply([], changed.io), 0, changed.all());
  assert.equal(readFileSync(claudeMd, 'utf8'), `${MINE}\n${RULES_START}\nAnswer in French.\n${RULES_END}\nA line of mine after it.\n`);
  assert.match(changed.all(), /5\. Rules: CLAUDE\.md changed the block of default's rules from Profiles, one line\. The rest of it is as it was\./);
  people[0]!.fields.rules = '';
  people[1]!.fields.rules = '';
  assert.equal(await envApply([], machine(p, rec).io), 0);
  assert.equal(readFileSync(claudeMd, 'utf8'), `${MINE}A line of mine after it.\n`);
  /* The line break its last line gained stays, since nothing says it had none. */
  assert.equal(readFileSync(join(p.studio, 'CLAUDE.md'), 'utf8'), `${MINE_CRLF}\r\n`);
});

test('NO KEY LANDS IN ANY FILE: not the login, not a key in a tool\'s arguments, and not one in a profile\'s rules', async () => {
  const p = planted();
  const people = PEOPLE.map((r) => ({ ...r, fields: { ...r.fields } }));
  people[1]!.fields.rules = `Use ${KEY} for the studio.`;
  const rec = record({ tools: tools(LEAKY), skills: skills(), people });
  const run = machine(p, rec);
  assert.equal(await envApply([], run.io), 1, run.all());
  assert.match(run.all(), /Tool leaky holds what looks like a key, so it was not written\./);
  assert.match(run.all(), /5\. Rules: studio's rules in Profiles hold what looks like a key, so CLAUDE\.md is left as it is\./);
  assert.equal(readFileSync(join(p.studio, 'CLAUDE.md'), 'utf8'), MINE_CRLF);
  for (const file of Object.values(files(p))) assert.equal(Object.hasOwn(servers(file), 'leaky'), false);
  const written = filesUnder(p.home).map((file) => readFileSync(file, 'utf8'));
  assert.ok(written.length > 10, 'the run wrote too little to say anything');
  nowhere([...written, ...run.lines, ...run.said, ...run.ran.flatMap((r) => r.args)], [LOGIN, KEY]);
});

test('--profile APPLIES TO THE ONES NAMED, a name not on this machine is one sentence, and an argument it does not take is refused', async () => {
  const p = planted();
  const rec = record({ tools: tools(), skills: skills() });
  const run = machine(p, rec);
  assert.equal(await envApply(['--profile', 'studio'], run.io), 0, run.all());
  assert.deepEqual(Object.keys(servers(files(p).studio)).sort(), ['braindog', 'lantern', 'quill', 'vaulted']);
  assert.deepEqual(servers(files(p).main), {});
  assert.equal(readFileSync(join(p.main, 'CLAUDE.md'), 'utf8'), MINE);
  assert.deepEqual(Object.values(readPins(pinsFile(p.home)) ?? {}).map((pin) => pin.profiles), [['studio'], ['studio'], ['studio'], ['studio']]);

  const before = hashOf(p.home);
  const unknown = machine(p, rec);
  assert.equal(await envApply(['--profile', 'nowhere'], unknown.io), 1);
  assert.deepEqual(unknown.said, ['braindog env apply --profile takes a profile on this machine: default, studio and work.']);
  const pasted = machine(p, rec);
  assert.equal(await envApply([KEY], pasted.io), 1);
  assert.deepEqual(pasted.said, ['braindog env apply takes --profile <name>, --dry-run, --yes-data and --host <host>, and nothing else.']);
  assert.equal(hashOf(p.home), before);
});

test('SIGNED OUT, BRAINDOG\'S OWN HOOKS AND SERVER ARE PLACED, and the record\'s tools, skills and rules wait', async () => {
  const p = planted();
  const rec = record({ tools: tools(), skills: skills() });
  const run = machine({ ...p, env: { ...p.env, BRAINDOG_TOKEN: undefined as unknown as string } }, rec);
  assert.equal(await envApply(['--profile', 'default'], run.io), 1, run.all());
  assert.deepEqual(rec.calls, [], 'the record was asked while signed out');
  assert.deepEqual(Object.keys(servers(files(p).main)), ['braindog']);
  assert.match(run.all(), /This machine is not signed in to BrainDog, so your BrainDog was not read/);
  assert.match(run.all(), /3\. Tools: your BrainDog was not read, so none was written\./);
});

test("CODEX ON THE MACHINE GETS ITS TURN END, BRAINDOG'S AGENTS.md BLOCK AND THE SERVER, each program asked about as Codex's", async () => {
  /* Codex's folder is the home's, never the machine's own. */
  delete process.env.CODEX_HOME;
  const p = planted();
  mkdirSync(join(p.home, '.codex'));
  const rec = record({ tools: tools(), skills: skills() });
  const run = machine(p, rec);
  await envApply([], run.io);
  assert.ok(run.asked.includes("Allow BrainDog's turn end to run from Codex on this machine? [y/N] "), run.asked.join('\n'));
  assert.ok(run.asked.includes("Allow BrainDog's MCP server to run from Codex on this machine? [y/N] "), run.asked.join('\n'));
  const config = readFileSync(join(p.home, '.codex', 'config.toml'), 'utf8');
  assert.match(config, /^# braindog: the notify line below is BrainDog's/u);
  assert.match(config, /^\[mcp_servers\.braindog\]$/mu);
  assert.match(readFileSync(join(p.home, '.codex', 'AGENTS.md'), 'utf8'), /^## BrainDog$/mu);
  assert.match(run.all(), /^Codex, ~\/\.codex:$/mu);

  /* A SECOND RUN ASKS NOTHING MORE AND LEAVES CODEX'S FOLDER AS IT WAS. */
  const before = hashOf(join(p.home, '.codex'));
  const again = machine(p, rec);
  await envApply([], again.io);
  assert.equal(hashOf(join(p.home, '.codex')), before);
  assert.ok(!again.asked.some((q) => q.includes('from Codex')), again.asked.join('\n'));
  assert.ok(again.all().includes("1. Hooks: Codex already runs BrainDog's turn end, and its AGENTS.md holds BrainDog's block."), again.all());
  assert.ok(again.all().includes('2. MCP server: braindog is already registered in Codex, running this command.'), again.all());
});

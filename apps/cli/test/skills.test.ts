/**
 * `braindog skills sync` against a stub record on node:http: every row of the sync conflict
 * table, the name rule, the lock file, the dry run, and the start hook's sync.
 *
 * EVERY FOLDER IS A TEMPORARY ONE. The home folder, the Claude config folder and the repository are made per test and
 * removed after it, so nothing here reads or writes this machine's own skills.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { hookStart } from '../src/hooks.ts';
import { connect, describedIn, render, skillPath, skills, syncSkills, thisMachine, type AgentIo } from '../src/skills.ts';

/* Obviously fake, and long enough that a fragment of it in any output is findable. */
const TOKEN = ['rec_01TESTTESTTESTTESTTESTTEST', 'stub-bearer-for-tests-only-5e2a'].join('.');
const sha = (text: string) => createHash('sha256').update(text).digest('hex');

/** Every line any sync or command wrote, for the last test. */
const printed: string[] = [];

type After = { after: (fn: () => void | Promise<void>) => void };
type Row = { seq: number; scope: 'project' | 'global'; state: string; version: number; fields: Record<string, unknown> };
type Seen = { method: string; args: Record<string, unknown>; authorization: string | undefined };

const CONTEXT = {
  session: { spoken: 'S7', state: 'active' },
  ambiguous: [],
  handoff: null,
  live: { same_repo: [], elsewhere: [] },
  waiting: [],
  people: [],
  faded: 0,
  next: 'Start with the task in front of you, and call handoff with your next step before you stop.',
};
const PROJECT = { spoken: 'things#1', name: 'Kiln', mark: null, hue: null, how: 'folder' };

/** A record with a skills register: `context` lists the active rows, and `get`, `create`, `update` and `propose` answer. */
async function stubRecord(t: After, o: { project?: boolean; register?: boolean }) {
  const rows: Row[] = [];
  const seen: Seen[] = [];
  let proposals = 0;
  const brief = (r: Row) => ({ spoken: `skills#${String(r.seq)}`, version: r.version, scope: r.scope, state: r.state, name: r.fields.name, trigger: r.fields.trigger, rev: r.fields.rev });
  const context = () => ({
    ...CONTEXT,
    project: o.project ? PROJECT : null,
    registers: o.register === false ? [] : [{ id: 'skills', name: 'Skills', rows: rows.filter((r) => r.state === 'active').map(brief), inherited: [], truncated: false }],
  });
  const entry = (r: Row) => ({ id: `e_${String(r.seq)}`, register: 'skills', seq: r.seq, state: r.state, version: r.version, fields: r.fields });
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const url = new URL(req.url ?? '/', 'http://stub');
      const method = url.pathname.replace(/^\/api\//, '');
      const raw = Buffer.concat(chunks).toString('utf8');
      const args = (raw ? JSON.parse(raw) : {}) as Record<string, unknown>;
      for (const [k, v] of url.searchParams) {
        try {
          args[k] = JSON.parse(v);
        } catch {
          args[k] = v;
        }
      }
      seen.push({ method, args, authorization: req.headers.authorization });
      const answer = (value: unknown) => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(value));
      };
      const missing = () => answer({ ok: false, refusal: { code: 'REF_UNKNOWN', fix: 'There is no such row.' } });
      if (method === 'context') return answer({ ok: true, value: context() });
      if (method === 'attach') return answer({ ok: true, value: { session: { id: 'e_7', seq: 7, state: 'active', version: 1, fields: {} }, spoken: 'S7', resumed: false, project: null, context: context() } });
      if (method === 'get') {
        const r = rows.find((x) => x.seq === args.seq);
        return r ? answer({ ok: true, value: entry(r) }) : missing();
      }
      if (method === 'create') {
        const r: Row = { seq: rows.length + 1, scope: o.project ? 'project' : 'global', state: 'active', version: 1, fields: { rev: 1, ...(args.fields as Record<string, unknown>) } };
        rows.push(r);
        return answer({ ok: true, value: entry(r) });
      }
      if (method === 'update') {
        const r = rows.find((x) => x.seq === args.seq);
        if (!r) return missing();
        Object.assign(r.fields, args.patch as Record<string, unknown>);
        r.version++;
        return answer({ ok: true, value: entry(r) });
      }
      if (method === 'propose') return answer({ ok: true, value: { id: `SG${String(++proposals)}` } });
      return answer({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: `The stub does not answer ${method}.` } });
    });
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  t.after(
    () =>
      new Promise<void>((done) => {
        server.closeAllConnections();
        server.close(() => done());
      }),
  );
  /** A row as the owner would have made it: managed, active, at version 1. */
  const add = (fields: Record<string, unknown>, scope: Row['scope'] = 'global') => {
    const r: Row = { seq: rows.length + 1, scope, state: 'active', version: 1, fields: { kind: 'skill', rev: 1, managed: true, ...fields } };
    rows.push(r);
    return r;
  };
  /** The owner accepting a new version. */
  const bump = (r: Row, body: string) => {
    r.fields.body = body;
    r.fields.rev = (r.fields.rev as number) + 1;
    r.version++;
  };
  return { base: `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`, rows, seen, add, bump, proposals: () => seen.filter((s) => s.method === 'propose') };
}

async function setup(t: After, o: { project?: boolean; register?: boolean } = {}) {
  const host = await stubRecord(t, o);
  const dir = mkdtempSync(join(tmpdir(), 'braindog-skills-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const home = join(dir, 'home');
  const configDir = join(home, '.claude');
  const cwd = join(dir, 'work');
  const top = join(dir, 'repo');
  for (const d of [home, cwd, top]) mkdirSync(d, { recursive: true });
  const env = { XDG_CONFIG_HOME: join(dir, 'config'), BRAINDOG_HOST: host.base, BRAINDOG_TOKEN: TOKEN, CLAUDE_CONFIG_DIR: configDir };
  const out: string[] = [];
  const said: string[] = [];
  const io: AgentIo = { env, cwd, home, out: (l) => void out.push(l), say: (l) => void said.push(l), headers: async () => ({}) };
  const sync = async (s: { dryRun?: boolean } = {}) => {
    const at = await connect(undefined, io);
    if (typeof at === 'number') throw new Error(`connect ended with ${String(at)}`);
    const lines = await syncSkills({ client: at.client, context: at.context, home, configDir, top: o.project ? top : null, dryRun: s.dryRun === true, machine: 'test-machine' });
    printed.push(...lines);
    return lines;
  };
  const lockFile = join(home, '.braindog', 'skills-lock.json');
  const lock = () => JSON.parse(readFileSync(lockFile, 'utf8')) as Record<string, Record<string, unknown>>;
  const global = (name: string) => join(configDir, 'skills', name, 'SKILL.md');
  return { ...host, dir, home, configDir, cwd, top, env, io, out, said, sync, lock, lockFile, global };
}

const RELEASE = { name: 'kiln-release', trigger: 'When a kiln build ships', body: '# Release\n\nTag it, then push.\n' };

/* ── the conflict table ────────────────────────────────────────────────── */

test('ROW 1, NO FILE AND A SKILL IN THE RECORD: the file is written with its name and description, and the lock records it', async (t) => {
  const h = await setup(t);
  h.add(RELEASE);
  const path = h.global('kiln-release');

  assert.deepEqual(await h.sync(), [`Skill kiln-release written to ${path}.`]);
  const text = readFileSync(path, 'utf8');
  assert.equal(text, render('skill', RELEASE.name, RELEASE.trigger, RELEASE.body));
  assert.match(text, /^---\nname: kiln-release\ndescription: "When a kiln build ships"\n---\n\n# Release\n/);
  assert.deepEqual(h.lock()[path], { spoken: 'skills#1', version: 1, sha256: sha(text) });

  assert.deepEqual(await h.sync(), [], 'a second sync has nothing to do');
  assert.equal(h.seen.filter((s) => s.method === 'get').length, 1, 'an unchanged file at the listed version is not fetched again');
});

test('ROW 2, UNCHANGED SINCE THE LOCK AND A NEWER VERSION: the body is fetched, written, and the lock moves on', async (t) => {
  const h = await setup(t);
  const row = h.add(RELEASE);
  const path = h.global('kiln-release');
  await h.sync();

  h.bump(row, '# Release\n\nTag it, sign it, then push.\n');
  assert.deepEqual(await h.sync(), [`Skill kiln-release updated to version 2 in ${path}.`]);
  assert.match(readFileSync(path, 'utf8'), /sign it/);
  assert.equal(h.lock()[path]?.version, 2);
  assert.equal(h.lock()[path]?.sha256, sha(readFileSync(path, 'utf8')));
});

test('ROW 3, EDITED SINCE THE LOCK AND UNCHANGED IN THE RECORD: the file is kept and proposed as rev+1, once per file hash', async (t) => {
  const h = await setup(t);
  h.add(RELEASE);
  const path = h.global('kiln-release');
  await h.sync();

  const edited = `${readFileSync(path, 'utf8')}\nRun the smoke test first.\n`;
  writeFileSync(path, edited);
  assert.deepEqual(await h.sync(), [`Skill kiln-release was edited in ${path}; kept it and proposed it as version 2 (SG1).`]);
  assert.equal(readFileSync(path, 'utf8'), edited, 'the edit is never overwritten');
  const [asked] = h.proposals();
  /* The skill and "this Mac" in the question; the file and the machine's own name only in the details. */
  assert.equal(asked?.args.question, `Take ${thisMachine()}'s edit to kiln-release as version 2?`);
  assert.equal(asked?.args.body_kind, 'rowset');
  assert.deepEqual(asked?.args.body, { register: 'skills', rows: [{ at: 'skills#1', version: 1, patch: { body: edited, rev: 2 } }], details: { file: path, machine: 'test-machine' } });

  assert.deepEqual(await h.sync(), [], 'the same edit is not proposed twice');
  assert.equal(h.proposals().length, 1);

  writeFileSync(path, `${edited}And tag the release notes.\n`);
  assert.deepEqual(await h.sync(), [`Skill kiln-release was edited in ${path}; kept it and proposed it as version 2 (SG2).`], 'a further edit is a new hash, so it is asked about');
});

test('ROW 4, EDITED HERE AND CHANGED IN THE RECORD: the file is kept and proposed, and the line says both changed', async (t) => {
  const h = await setup(t);
  const row = h.add(RELEASE);
  const path = h.global('kiln-release');
  await h.sync();

  const edited = `${readFileSync(path, 'utf8')}\nLocal note.\n`;
  writeFileSync(path, edited);
  h.bump(row, '# Release\n\nThe record moved on.\n');
  assert.deepEqual(await h.sync(), ['Skill kiln-release changed here and in the record; kept yours and asked (SG1).']);
  assert.equal(readFileSync(path, 'utf8'), edited);
  assert.deepEqual(h.proposals()[0]?.args.body, { register: 'skills', rows: [{ at: 'skills#1', version: 2, patch: { body: edited, rev: 3 } }], details: { file: path, machine: 'test-machine' } });
  assert.deepEqual(await h.sync(), []);
});

test('ROW 5, A FILE WITH NO LOCK AND NO ROW: registered as managed:false where the run may create, once', async (t) => {
  const h = await setup(t);
  const skill = join(h.configDir, 'skills', 'hand-made', 'SKILL.md');
  const command = join(h.configDir, 'commands', 'tidy.md');
  mkdirSync(dirname(skill), { recursive: true });
  mkdirSync(dirname(command), { recursive: true });
  writeFileSync(skill, '---\nname: hand-made\ndescription: "When a skill was written by hand"\n---\n\nBody.\n');
  writeFileSync(command, '# Tidy the working tree\n\nRemove what git ignores.\n');

  const lines = await h.sync();
  assert.deepEqual(lines, [`Skill hand-made in ${skill} was registered as skills#1, index only.`, `Skill tidy in ${command} was registered as skills#2, index only.`]);
  const creates = h.seen.filter((s) => s.method === 'create').map((s) => s.args);
  assert.deepEqual(creates, [
    { register: 'skills', fields: { name: 'hand-made', kind: 'skill', trigger: 'When a skill was written by hand', body: readFileSync(skill, 'utf8'), managed: false } },
    { register: 'skills', fields: { name: 'tidy', kind: 'command', trigger: 'Tidy the working tree', body: readFileSync(command, 'utf8'), managed: false } },
  ]);
  assert.equal(h.lock()[skill]?.spoken, 'skills#1');

  assert.deepEqual(await h.sync(), [], 'a registered file is not registered again');
  assert.equal(h.seen.filter((s) => s.method === 'create').length, 2);
});

test('A FOLDED OR LITERAL DESCRIPTION IS READ WHOLE, so no trigger is stored as ">" or "|"', async (t) => {
  /* MEASURED ON THE OWNER'S RECORD: six skills written with `description: >` were registered with the trigger ">". */
  const cases: [string, string | undefined][] = [
    ['description: >\n  Code review focused on over-engineering.\n  Finds what to delete.', 'Code review focused on over-engineering. Finds what to delete.'],
    ['description: |\n  Line one.\n\n  Line two.\n', 'Line one. Line two.'],
    ['description: >-\n  Folded, chomped.\nname: tidy', 'Folded, chomped.'],
    ['description: |2+ # kept\n   Indented by two.', 'Indented by two.'],
    ['description: "Quoted \\"inside\\" it"', 'Quoted "inside" it'],
    ["description: 'It''s single'", "It's single"],
    ['description: "Runs onto\n  the next line"', 'Runs onto the next line'],
    ['description: Plain that runs\n  onto the next line # a comment', 'Plain that runs onto the next line'],
    ['description: For C# projects', 'For C# projects'],
    ['name: tidy\ndescription:\n  Starts below its key.', 'Starts below its key.'],
    ['name: tidy', undefined],
    ['description: >\nname: tidy', undefined],
  ];
  for (const [front, said] of cases) assert.equal(describedIn(front), said, front);

  const h = await setup(t);
  const skill = join(h.configDir, 'skills', 'ponytail-review', 'SKILL.md');
  mkdirSync(dirname(skill), { recursive: true });
  writeFileSync(skill, '---\nname: ponytail-review\ndescription: >\n  Code review focused on over-engineering.\n  Finds what to delete.\n---\n\n# Review\n');
  assert.deepEqual(await h.sync(), [`Skill ponytail-review in ${skill} was registered as skills#1, index only.`]);
  assert.equal(h.rows[0]?.fields.trigger, 'Code review focused on over-engineering. Finds what to delete.');
});

test('A TRIGGER ALREADY STORED AS ">" IS READ AGAIN FROM ITS FILE and written back once, and a dry run only says it would be', async (t) => {
  const h = await setup(t);
  const file = h.global('ponytail');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, '---\nname: ponytail\ndescription: >\n  Forces the laziest solution\n  that actually works.\n---\n\nBody.\n');
  h.add({ name: 'ponytail', trigger: '>', body: readFileSync(file, 'utf8'), managed: false });

  assert.deepEqual(await h.sync({ dryRun: true }), [`Skill ponytail would take its description from ${file} again.`]);
  assert.deepEqual(h.seen.filter((s) => s.method === 'update'), []);
  assert.deepEqual(await h.sync(), [`Skill ponytail took its description from ${file} again.`]);
  assert.deepEqual(
    h.seen.filter((s) => s.method === 'update').map((s) => s.args),
    [{ register: 'skills', seq: 1, patch: { trigger: 'Forces the laziest solution that actually works.' }, version: 1 }],
  );
  assert.deepEqual(await h.sync(), [], 'a trigger read again is not read a third time');
  /* A file that says no better, or no file, leaves the row as it is. */
  h.add({ name: 'gone', trigger: '|', body: 'Body.\n', managed: false });
  assert.deepEqual(await h.sync(), []);
});

test('AN EDIT PROPOSED IN THE SAME SYNC AS A TRIGGER WRITTEN BACK carries the version the write left, and no file is written saying ">"', async (t) => {
  const h = await setup(t);
  const row = h.add(RELEASE);
  const path = h.global('kiln-release');
  await h.sync();
  /* The old reader's ">" on the row, and an edit to the file since the lock. */
  row.fields.trigger = '>';
  const edited = `${readFileSync(path, 'utf8')}\nRun the smoke test first.\n`;
  writeFileSync(path, edited);

  assert.deepEqual(await h.sync(), [`Skill kiln-release took its description from ${path} again.`, `Skill kiln-release was edited in ${path}; kept it and proposed it as version 2 (SG1).`]);
  assert.equal(row.fields.trigger, RELEASE.trigger);
  assert.deepEqual((h.proposals()[0]?.args.body as { rows: { version: number }[] }).rows.map((r) => r.version), [2], 'the proposal named the version from before the write');

  /* A managed row still saying ">" with no file to read it from is written with its body's first line instead. */
  h.add({ name: 'kiln-glaze', trigger: '>', body: '# Glaze\n\nFire it twice.\n' });
  await h.sync();
  assert.match(readFileSync(h.global('kiln-glaze'), 'utf8'), /^---\nname: kiln-glaze\ndescription: "Glaze"\n---\n/u);
});

test('ROW 5 BY LOCATION: a run in a project registers the repository file at project scope and leaves the global folder alone', async (t) => {
  const h = await setup(t, { project: true });
  const mine = join(h.top, '.claude', 'skills', 'kiln-glaze', 'SKILL.md');
  const global = h.global('everywhere');
  for (const f of [mine, global]) {
    mkdirSync(dirname(f), { recursive: true });
    writeFileSync(f, '# A skill kept by hand\n');
  }
  assert.deepEqual(await h.sync(), [`Skill kiln-glaze in ${mine} (in the repository, not committed) was registered as skills#1, index only.`]);
  assert.equal(h.rows[0]?.scope, 'project');
  assert.equal(h.rows.length, 1, 'the global file is not created from a project run');
});

test('ROW 6, UNCHANGED SINCE THE LOCK AND RETIRED: the file is deleted; an edited one is left and said once', async (t) => {
  const h = await setup(t);
  const kept = h.add(RELEASE);
  const touched = h.add({ name: 'kiln-glaze', trigger: 'When glazing', body: 'Glaze.\n' });
  await h.sync();
  const path = h.global('kiln-release');
  const other = h.global('kiln-glaze');
  writeFileSync(other, 'Glaze, but thinner.\n');

  kept.state = 'retired';
  touched.state = 'retired';
  assert.deepEqual(await h.sync(), [
    `Skill kiln-release was retired, so ${path} was deleted.`,
    `Skill kiln-glaze was retired in the record and edited in ${other}, so the file was left.`,
  ]);
  assert.equal(existsSync(path), false);
  assert.equal(existsSync(dirname(path)), false, 'the empty skill folder goes with it');
  assert.equal(h.lock()[path], undefined);
  assert.equal(readFileSync(other, 'utf8'), 'Glaze, but thinner.\n');
  assert.deepEqual(await h.sync(), [], 'the edited retired file is said once');
});

/* ── the rules around it ───────────────────────────────────────────────── */

test('A NAME THAT IS NOT A FOLDER NAME is never written, and nothing lands outside the skills folder', async (t) => {
  const h = await setup(t);
  h.add({ ...RELEASE, name: '../escape' });
  h.add({ ...RELEASE, name: 'Not A Name' });
  assert.deepEqual(await h.sync(), [
    'skills#1 was not written, because its name is not one a skill folder may have.',
    'skills#2 was not written, because its name is not one a skill folder may have.',
  ]);
  assert.equal(existsSync(join(h.configDir, 'escape')), false);
  assert.equal(existsSync(join(h.configDir, 'skills')), false);

  assert.equal(skillPath(h.configDir, 'skill', '..'), null);
  assert.equal(skillPath(h.configDir, 'command', 'a/b'), null);
  assert.equal(skillPath(h.configDir, 'skill', 'kiln-release'), h.global('kiln-release'));
  assert.equal(skillPath(h.configDir, 'command', 'tidy'), join(h.configDir, 'commands', 'tidy.md'));
});

test('A ROW THE RECORD DOES NOT MANAGE is never written', async (t) => {
  const h = await setup(t);
  h.add({ ...RELEASE, managed: false });
  assert.deepEqual(await h.sync(), []);
  assert.equal(existsSync(h.global('kiln-release')), false);
});

test('A PROJECT SKILL is written into the repository and reported as not committed', async (t) => {
  const h = await setup(t, { project: true });
  h.add(RELEASE, 'project');
  const path = join(h.top, '.claude', 'skills', 'kiln-release', 'SKILL.md');
  assert.deepEqual(await h.sync(), [`Skill kiln-release written to ${path} (in the repository, not committed).`]);
  assert.ok(existsSync(path));
});

test('A DRY RUN writes no file and no lock, and proposes and creates nothing', async (t) => {
  const h = await setup(t);
  h.add(RELEASE);
  const hand = h.global('hand-made');
  mkdirSync(dirname(hand), { recursive: true });
  writeFileSync(hand, 'By hand.\n');

  assert.deepEqual(await h.sync({ dryRun: true }), [`Skill kiln-release would be written to ${h.global('kiln-release')}.`, `Skill hand-made in ${hand} would be registered as index only.`]);
  assert.equal(existsSync(h.global('kiln-release')), false);
  assert.equal(existsSync(h.lockFile), false);
  assert.deepEqual(h.seen.filter((s) => s.method !== 'context' && s.method !== 'get'), []);
});

test('A BROKEN LOCK FILE stops the sync with one line and is left for a person to delete', async (t) => {
  const h = await setup(t);
  h.add(RELEASE);
  mkdirSync(dirname(h.lockFile), { recursive: true });
  writeFileSync(h.lockFile, '{ not json');
  assert.deepEqual(await h.sync(), [`${h.lockFile} is not valid JSON, so skills were not synced. Delete it and sync again.`]);
  assert.equal(readFileSync(h.lockFile, 'utf8'), '{ not json');
  assert.equal(existsSync(h.global('kiln-release')), false);
});

/* ── the command ───────────────────────────────────────────────────────── */

test('braindog skills: a wrong verb or flag is exit 1, a record without skills is exit 0, and a host that does not answer is exit 3', async (t) => {
  const h = await setup(t, { register: false });
  assert.equal(await skills(['pull'], h.io), 1);
  assert.equal(await skills(['sync', '--force'], h.io), 1);
  assert.deepEqual(h.said, ['braindog skills takes sync, --host and --dry-run, and nothing else.', 'braindog skills takes sync, --host and --dry-run, and nothing else.']);

  assert.equal(await skills(['sync'], h.io), 0);
  assert.deepEqual(h.out, ['This record has no skills register, so there is nothing to sync.']);

  const closed = createServer();
  await new Promise<void>((done) => closed.listen(0, '127.0.0.1', done));
  const port = (closed.address() as AddressInfo).port;
  await new Promise<void>((done) => closed.close(() => done()));
  const gone = `http://127.0.0.1:${String(port)}`;
  assert.equal(await skills(['sync', '--host', gone], { ...h.io, env: { ...h.env, BRAINDOG_HOST: gone } }), 3);
  assert.match(h.said.at(-1) ?? '', /did not answer\.$/);
  printed.push(...h.out, ...h.said);
});

test('braindog skills sync --dry-run prints what it would do and says it was a dry run', async (t) => {
  const h = await setup(t);
  h.add(RELEASE);
  assert.equal(await skills(['sync', '--dry-run'], h.io), 0);
  assert.deepEqual(h.out, [`Skill kiln-release would be written to ${h.global('kiln-release')}.`, 'That was a dry run, so nothing was written, sent or proposed.']);
  assert.equal(await skills(['sync'], h.io), 0);
  assert.equal(h.out.at(-1), `Skill kiln-release written to ${h.global('kiln-release')}.`);
  assert.equal(await skills(['sync'], h.io), 0);
  assert.equal(h.out.at(-1), 'Skills are in sync.');
  printed.push(...h.out, ...h.said);
});

/* ── the start hook ────────────────────────────────────────────────────── */

test('THE START HOOK SYNCS SKILLS on startup, says so as one count on the card, and not on a compaction', async (t) => {
  const h = await setup(t);
  h.add(RELEASE);
  const written: string[] = [];
  const hook = (source: string) =>
    hookStart({ env: h.env, stdin: JSON.stringify({ cwd: h.cwd, session_id: 'claude-run-1', source }), cwd: h.cwd, home: h.home, device: 'MacBook', write: (text) => void written.push(text) });

  await hook('startup');
  const lines = (written[0] ?? '').split('\n');
  /* A count, not the sync's lines: they carry file paths, and are not what an agent starts from. */
  assert.deepEqual(lines, ['BrainDog · run S7 · no project · Claude Code on MacBook', 'More     1 skill · skills sync: 1 change · call context']);
  assert.ok(existsSync(h.global('kiln-release')));
  assert.deepEqual(h.seen.map((s) => s.method), ['attach', 'get']);
  assert.equal(h.seen[1]?.authorization, `Bearer ${TOKEN}`);

  await hook('compact');
  assert.deepEqual(h.seen.map((s) => s.method).filter((m) => m !== 'heard'), ['attach', 'get', 'attach'], 'a compaction is the same session, so it does not sync');
  assert.ok(!(written[1] ?? '').includes('Skill kiln-release'));
  printed.push(...written);
});

test('THE TOKEN WAS NEVER PRINTED by any sync, command or hook above', () => {
  assert.ok(printed.length > 10, 'the tests above printed nothing, so this proves nothing');
  assert.equal(printed.join('\n').includes('stub-bearer-for-tests-only'), false);
});

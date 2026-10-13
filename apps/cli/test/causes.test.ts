/**
 * The command line's own questions are asked once (AGT-C07 g): `skills sync`, `pack install` and `usecase install` each
 * send a `cause`, and a record that already holds it open answers `joined` with its own sentence, which is what is printed.
 *
 * THE STUB KEEPS CAUSES AS THE RECORD DOES (`packages/kernel/src/govern.ts` `askedAlready`): the first question with a
 * cause is filed, and one more with the same cause while it is open is answered with the first one's name and "Already
 * waiting as SGn.", nothing new filed.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { exportUseCase } from '@braindog/declare';

import { pack } from '../src/catalogue.ts';
import { causeOf, connect, joinedSaid, sha256, syncSkills, type AgentIo } from '../src/skills.ts';
import { usecase } from '../src/usecase.ts';

/* Obviously fake. */
const TOKEN = ['rec_01TESTTESTTESTTESTTESTTEST', 'stub-bearer-for-tests-only-c07g'].join('.');
const RELEASE = { name: 'kiln-release', trigger: 'When a kiln build ships', body: '# Release\n\nTag it, then push.\n' };
const ROW = { seq: 1, version: 1, fields: { kind: 'skill', rev: 1, managed: true, ...RELEASE } };
const BRIEF = { spoken: 'skills#1', version: 1, scope: 'global', state: 'active', name: RELEASE.name, trigger: RELEASE.trigger, rev: 1 };
const CONTEXT = {
  session: null,
  ambiguous: [],
  handoff: null,
  live: { same_repo: [], elsewhere: [] },
  waiting: [],
  people: [],
  faded: 0,
  project: null,
  next: '',
  registers: [{ id: 'skills', name: 'Skills', rows: [BRIEF], inherited: [], truncated: false }],
};
const ARRANGEMENT = {
  packs: [{ id: 'usecase-team', version: '1.0.0' }],
  offer: [{ id: 'usecase-student', usecase: 'Student', summary: 'Courses.', modules: [] }],
  updates: [{ id: 'usecase-team', from: '1.0.0', to: '1.1.0' }],
  voice: null,
  pages: [],
  waiting: [],
};
const PROJECT_BRIEF = fileURLToPath(new URL('../../../packs/project-brief/project-brief.pack.json', import.meta.url));

/** A record that keeps open questions by cause, and a fresh home folder per machine. */
async function setup(t: { after: (fn: () => void | Promise<void>) => void }, older = false) {
  const seen: { method: string; args: Record<string, unknown> }[] = [];
  const open = new Map<string, string>();
  let filed = 0;
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const url = new URL(req.url ?? '/', 'http://stub');
      const method = url.pathname.replace(/^\/api\//, '');
      const raw = Buffer.concat(chunks).toString('utf8');
      const args = (raw ? JSON.parse(raw) : {}) as Record<string, unknown>;
      for (const [k, v] of url.searchParams) args[k] = /^[0-9]+$/u.test(v) ? Number(v) : v;
      seen.push({ method, args });
      const answer = (value: unknown) => void res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(value));
      if (method === 'context') return answer({ ok: true, value: CONTEXT });
      if (method === 'get') return answer({ ok: true, value: { id: 'e_1', register: 'skills', seq: 1, state: 'active', version: ROW.version, fields: ROW.fields } });
      if (method === 'arrangement') return answer({ ok: true, value: ARRANGEMENT });
      if (method === 'propose') {
        /* AN OLDER RECORD knows no cause and files every question it is sent. */
        const cause = !older && typeof args.cause === 'string' ? args.cause : null;
        const held = cause === null ? undefined : open.get(cause);
        if (held !== undefined) return answer({ ok: true, value: { id: held, joined: true, said: `Already waiting as ${held}.` } });
        const id = `SG${String(++filed)}`;
        if (cause !== null) open.set(cause, id);
        return answer({ ok: true, value: { id } });
      }
      answer({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: `The stub does not answer ${method}.` } });
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
  const base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
  const dir = mkdtempSync(join(tmpdir(), 'braindog-causes-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  /** One machine: its own home, Claude folder and lock, against the same record. */
  const machine = (name: string) => {
    const home = join(dir, name);
    const configDir = join(home, '.claude');
    mkdirSync(home, { recursive: true });
    const out: string[] = [];
    const said: string[] = [];
    const io: AgentIo = { env: { XDG_CONFIG_HOME: join(home, 'config'), BRAINDOG_HOST: base, BRAINDOG_TOKEN: TOKEN, CLAUDE_CONFIG_DIR: configDir }, cwd: home, home, out: (l) => void out.push(l), say: (l) => void said.push(l), headers: async () => ({}) };
    const sync = async () => {
      const at = await connect(undefined, io);
      if (typeof at === 'number') throw new Error(`connect ended with ${String(at)}`);
      return syncSkills({ client: at.client, context: at.context, home, configDir, top: null, dryRun: false, machine: name });
    };
    return { home, io, out, said, sync, skill: join(configDir, 'skills', RELEASE.name, 'SKILL.md') };
  };
  const proposals = () => seen.filter((s) => s.method === 'propose');
  return { base, dir, machine, proposals };
}

/* ── skills sync ───────────────────────────────────────────────────────── */

test('SKILLS SYNC ASKS ONCE: two machines with the same edit send one skills#<name>@<scope> cause, and the second says the record\'s sentence', async (t) => {
  const h = await setup(t);
  const one = h.machine('studio');
  const two = h.machine('laptop');
  await one.sync();
  await two.sync();
  const edited = `${readFileSync(one.skill, 'utf8')}\nRun the smoke test first.\n`;
  writeFileSync(one.skill, edited);
  writeFileSync(two.skill, edited);

  assert.deepEqual(await one.sync(), [`Skill kiln-release was edited in ${one.skill}; kept it and proposed it as version 2 (SG1).`]);
  assert.deepEqual(await two.sync(), [`Skill kiln-release was edited in ${two.skill}; kept it. Already waiting as SG1.`]);
  const sent = h.proposals().map((p) => p.args);
  const body = ((sent[0]?.body as { rows: { patch: { body: string } }[] }).rows[0]?.patch.body ?? '');
  const cause = `skills#kiln-release@global#1#${sha256(body).slice(0, 24)}`;
  assert.deepEqual(sent.map((a) => a.cause), [cause, cause]);
  assert.doesNotMatch(cause, /studio|laptop|\/|\\/u, 'no machine name and no path in a cause');
  assert.deepEqual(await two.sync(), [], 'a joined question is not asked again from the same file');
});

test('SKILLS SYNC: a different edit on the second machine is its own question, not "Already waiting" for text it never sent', async (t) => {
  const h = await setup(t);
  const one = h.machine('studio');
  const two = h.machine('laptop');
  await one.sync();
  await two.sync();
  writeFileSync(one.skill, `${readFileSync(one.skill, 'utf8')}\nRun the smoke test first.\n`);
  writeFileSync(two.skill, `${readFileSync(two.skill, 'utf8')}\nTag it twice.\n`);
  assert.deepEqual(await one.sync(), [`Skill kiln-release was edited in ${one.skill}; kept it and proposed it as version 2 (SG1).`]);
  assert.deepEqual(await two.sync(), [`Skill kiln-release was edited in ${two.skill}; kept it and proposed it as version 2 (SG2).`]);
});

test('AN OLDER RECORD that ignores cause files each question as before, and the line names it as before', async (t) => {
  const h = await setup(t, true);
  const one = h.machine('studio');
  const two = h.machine('laptop');
  await one.sync();
  await two.sync();
  const edited = `${readFileSync(one.skill, 'utf8')}\nRun the smoke test first.\n`;
  writeFileSync(one.skill, edited);
  writeFileSync(two.skill, edited);
  assert.deepEqual(await one.sync(), [`Skill kiln-release was edited in ${one.skill}; kept it and proposed it as version 2 (SG1).`]);
  assert.deepEqual(await two.sync(), [`Skill kiln-release was edited in ${two.skill}; kept it and proposed it as version 2 (SG2).`]);
  const m = h.machine('desk');
  assert.equal(await pack(['install', PROJECT_BRIEF], m.io), 0, m.said.join('\n'));
  assert.equal(await pack(['install', PROJECT_BRIEF], m.io), 0, m.said.join('\n'));
  assert.match(m.out.at(-1) ?? '', /^Asked the owner: Install Project brief 2\.0\.0\? Nothing is installed until they accept it\. Open Decide in the app\.$/u);
});

/* ── pack install ──────────────────────────────────────────────────────── */

test('PACK INSTALL ASKS ONCE: the pack is its cause, and asking again prints "Already waiting as" with the same Decide link', async (t) => {
  const h = await setup(t);
  const m = h.machine('studio');
  assert.equal(await pack(['install', PROJECT_BRIEF], m.io), 0, m.said.join('\n'));
  assert.equal(h.proposals()[0]?.args.cause, 'install#project-brief');
  assert.match(m.out.at(-1) ?? '', /^Asked the owner: Install Project brief 2\.0\.0\? Nothing is installed until they accept it\. Open Decide in the app\.$/u);

  assert.equal(await pack(['install', PROJECT_BRIEF], m.io), 0, m.said.join('\n'));
  assert.equal(h.proposals()[1]?.args.cause, 'install#project-brief');
  assert.equal(m.out.at(-1), `Already waiting as SG1. Nothing is installed until they accept it. Open Decide in the app.`);
});

/* ── usecase install ───────────────────────────────────────────────────── */

test('USECASE INSTALL ASKS ONCE: a file, a use case on offer and an update each send install#<usecase>, and a joined one says so', async (t) => {
  const h = await setup(t);
  const m = h.machine('studio');
  const built = exportUseCase({
    usecase: 'student',
    version: '1.0.1',
    title: 'Student',
    summary: 'Courses.',
    author: 'Halden',
    license: 'MIT',
    audience: 'individual',
    tone: 'plain',
    modules: [],
    voice: { home: 'Desk' },
    labels: {},
    declarations: [{ register: 'courses', name: 'Courses', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] }],
    examples: [],
  });
  assert.ok(built.ok);
  writeFileSync(join(m.home, 'student.usecase.json'), JSON.stringify(built.value));

  /* FROM A FILE, keyed as its pack is, so the same use case on offer by its id joins it. */
  assert.equal(await usecase(['install', 'student.usecase.json'], m.io), 0, m.said.join('\n'));
  assert.equal(h.proposals()[0]?.args.cause, 'install#usecase-student');
  assert.equal(m.out.at(-1), `Asked the owner to install Student 1.0.1. Nothing is installed until they accept it. Open Decide in the app.`);
  assert.equal(await usecase(['install', 'student'], m.io), 0, m.said.join('\n'));
  assert.equal(h.proposals()[1]?.args.cause, 'install#usecase-student');
  assert.equal(m.out.at(-1), `Already waiting as SG1. Nothing is installed until they accept it. Open Decide in the app.`);
  assert.equal(await usecase(['install', 'student.usecase.json'], m.io), 0, m.said.join('\n'));
  assert.equal(m.out.at(-1), `Already waiting as SG1. Nothing is installed until they accept it. Open Decide in the app.`);

  /* AN UPDATE, the third place that asks. */
  assert.equal(await usecase(['install', 'team'], m.io), 0, m.said.join('\n'));
  assert.equal(h.proposals()[3]?.args.cause, 'install#usecase-team');
  assert.equal(m.out.at(-1), `Asked the owner to update Team from 1.0.0 to 1.1.0. Nothing is installed until they accept it. Open Decide in the app.`);
  assert.equal(await usecase(['install', 'team'], m.io), 0, m.said.join('\n'));
  assert.equal(m.out.at(-1), `Already waiting as SG2. Nothing is installed until they accept it. Open Decide in the app.`);
});

/* ── the two helpers ───────────────────────────────────────────────────── */

test('A KEY OUT OF THE RECORD\'S SHAPE IS LEFT OFF, so the record derives one rather than refusing the question; an older joined answer still reads', () => {
  assert.deepEqual(causeOf('skills#kiln-release@global'), { cause: 'skills#kiln-release@global' });
  assert.deepEqual(causeOf('skills#two words@global'), {});
  assert.deepEqual(causeOf(`install#${'x'.repeat(200)}`), {});
  assert.equal(joinedSaid({ id: 'SG4' }), null);
  assert.equal(joinedSaid({ id: 'SG4', joined: true, said: 'Already waiting as SG4.' }), 'Already waiting as SG4.');
  assert.equal(joinedSaid({ id: 'q.01J', joined: true }), 'Already waiting.');
});

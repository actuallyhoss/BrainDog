/**
 * Who the commits and the imports are about: keys, machines, the owner's own names, `meet` in either shape a record
 * takes, an import that folds a person into the row already there, and `braindog people harvest` against a stub host.
 *
 * THE HOST IS A STUB ON node:http, as in `hooks.test.ts`, because apps never import apps; the import's door is a fake
 * that keeps its rows in a map, because what is under test is which calls the import makes and with what.
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ok, type Result } from '@braindog/ports';

import type { Plan, PlannedRow } from '../src/adapter.ts';
import { applyPlan, type Door } from '../src/import.ts';
import { clustersOf, isMachine, keyOfAddress, meeter, metOf, peopleCommand, projectOf, authoredIn, type LocalRepo } from '../src/people.ts';
import type { AgentIo } from '../src/skills.ts';

const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'braindog-people-')));
after(() => rmSync(scratch, { recursive: true, force: true }));

/* ── keys and machines ─────────────────────────────────────────────────── */

test('A KEY IS AN ADDRESS FOLDED ONLY WHERE THE MAIL SERVICE FOLDS IT, and GitHub’s private address is the account', () => {
  assert.equal(keyOfAddress('sam.avery+work@GoogleMail.com'), 'email:sam.avery@example.com');
  assert.equal(keyOfAddress('sam.avery+work@encore.example'), 'email:sam.avery+work@encore.example');
  assert.equal(keyOfAddress('49699333+Ada@users.noreply.github.com'), 'github:ada');
  assert.equal(keyOfAddress('ada@users.noreply.github.com'), 'github:ada');
  assert.equal(keyOfAddress('no address'), null);
  assert.equal(keyOfAddress(''), null);
});

test('MACHINES ARE NOT PEOPLE: bots, CI users named for what they do at an organisation’s domain, and a machine’s own users', () => {
  for (const [name, email] of [
    ['dependabot[bot]', '49699333+dependabot[bot]@users.noreply.github.com'],
    ['github-actions', '41898282+github-actions[bot]@users.noreply.github.com'],
    ['Jenkins Schema Sync', 'jenkins@brightloomit.example'],
    ['Brightloom Repos', 'repos@brightloomit.example'],
    ['Ubuntu', 'ubuntu@ip-172-31-0-1.eu-west-1.compute.internal'],
    ['root', 'root@build.example'],
    ['runner', 'runner@fv-az123.example'],
    ['Claude', 'noreply@anthropic.com'],
    ['Somebody', 'somebody@macbook.local'],
  ])
    assert.equal(isMachine(name!, email!), true, `${name!} <${email!}>`);
  for (const [name, email] of [
    ['Rohan Mehta', 'rohan@encore.example'],
    ['Ada Sync', 'ada.sync@gmail.com'],
    ['Madan Neriyanur', 'madann@users.noreply.github.com'],
  ])
    assert.equal(isMachine(name!, email!), false, `${name!} <${email!}>`);
});

test('AUTHORS GROUP BY KEY: one person under two spellings of one address is one, and the owner’s keys are left out', () => {
  const log = [
    ['Rohan Mehta', 'Rohan@Encore.example', 'a'.repeat(40), '2026-10-01T10:00:00Z'],
    ['rohanm', 'rohan@encore.example', 'b'.repeat(40), '2026-09-30T10:00:00Z'],
    ['Sam', 'sam@avery.example', 'c'.repeat(40), '2026-09-29T10:00:00Z'],
    ['Madan', '12+madann@users.noreply.github.com', 'd'.repeat(40), '2026-09-28T10:00:00Z'],
    ['Jenkins Schema Sync', 'jenkins@encore.example', 'e'.repeat(40), '2026-09-27T10:00:00Z'],
  ]
    .map((l) => l.join('\x1f'))
    .join('\n');
  const repo: LocalRepo = { dir: '/work/encore', name: 'encore', remote: 'github.com/brightloom/encore' };
  const project = { name: 'Encore', repos: ['github.com/brightloom/encore'], folders: [] };
  const clusters = clustersOf([{ repo, project, authored: authoredIn(log, new Set(['email:sam@avery.example'])) }]);
  assert.deepEqual(
    clusters.map((c) => [[...c.keys], c.commits, [...c.names.keys()], [...c.projects.keys()]]),
    [
      [['email:rohan@encore.example'], 2, ['Rohan Mehta', 'rohanm'], ['Encore']],
      [['github:madann'], 1, ['Madan'], ['Encore']],
    ],
  );
});

test('A REPOSITORY FINDS ITS PROJECT by its remote, then a folder it is in, then a name only one project lists', () => {
  const projects = [
    { name: 'BrainDog', repos: ['https://github.com/actuallyhoss/BrainDog.git'], folders: [] },
    { name: 'Nook', repos: [], folders: ['C:/Repos/nook', '/Users/sam/Developer/nook'] },
    { name: 'Fernly', repos: ['inkwell'], folders: [] },
    { name: 'App one', repos: ['github.com/a/app'], folders: [] },
    { name: 'App two', repos: ['github.com/b/app'], folders: [] },
  ];
  const at = (dir: string, remote: string | null): LocalRepo => ({ dir, name: dir.split('/').at(-1)!, remote });
  assert.equal(projectOf(projects, at('/x/braindog', 'github.com/actuallyhoss/braindog'))?.name, 'BrainDog');
  assert.equal(projectOf(projects, at('/Users/sam/Developer/nook', null))?.name, 'Nook');
  assert.equal(projectOf(projects, at('/x/inkwell', null))?.name, 'Fernly');
  assert.equal(projectOf(projects, at('/x/app', null)), null, 'two projects list an app, so neither is picked');
  assert.equal(projectOf(projects, at('/x/elsewhere', 'github.com/c/elsewhere')), null);
});

/* ── meet ──────────────────────────────────────────────────────────────── */

test('MEET IN THE CONTRACT’S WORDS, and once a record refuses one by name, in the four it takes for the rest of the run', async () => {
  const sent: Record<string, unknown>[] = [];
  const old = meeter(async (args) => {
    sent.push(args);
    const extra = Object.keys(args).find((k) => !['name', 'email', 'handle', 'where'].includes(k));
    return extra === undefined ? ok({ person: 'people#4', created: false, linked: true, merge: null }) : { ok: false, refusal: { code: 'FIELD_UNKNOWN', fix: `${extra} is not taken.`, at: extra } };
  });
  const m = { name: 'Ada', email: 'ada@example.com', keys: ['email:ada@example.com'], kind: 'person' as const, source: 'commit abcdef1 in kiln' };
  assert.equal((await old(m)).ok, true);
  assert.equal((await old({ ...m, name: 'Grace' })).ok, true);
  assert.deepEqual(sent, [
    { name: 'Ada', email: 'ada@example.com', where: 'commit abcdef1 in kiln', keys: ['email:ada@example.com'], kind: 'person', source: 'commit abcdef1 in kiln' },
    { name: 'Ada', email: 'ada@example.com', where: 'commit abcdef1 in kiln' },
    { name: 'Grace', email: 'ada@example.com', where: 'commit abcdef1 in kiln' },
  ]);

  /* A refusal of anything else is the answer, and the next call is in the contract's words again. */
  const calls: Record<string, unknown>[] = [];
  const off = meeter(async (args) => (calls.push(args), { ok: false, refusal: { code: 'REGISTER_UNKNOWN', fix: 'There is no people register.', at: 'register' } }));
  assert.equal((await off(m)).ok, false);
  assert.equal(calls.length, 1);

  /* An organisation is never sent in the four, which say nothing of kind and would meet it as a person. */
  const orgCalls: Record<string, unknown>[] = [];
  const orgs = meeter(async (args) => (orgCalls.push(args), { ok: false, refusal: { code: 'FIELD_UNKNOWN', fix: 'organisations keeps no keys.', at: 'keys' } }));
  assert.equal((await orgs({ name: 'Acme Ltd', keys: ['domain:acme.example'], kind: 'organisation', source: 'import' })).ok, false);
  assert.equal(orgCalls.length, 1);

  assert.deepEqual(metOf({ row: { register: 'people', id: 'e_9', seq: 9, name: 'Ada' }, created: true, matched_by: 'none' }), { register: 'people', id: 'e_9', seq: 9, created: true, mention: false });
  assert.deepEqual(metOf({ person: 'people#4', created: false, linked: true, merge: null }), { register: 'people', id: null, seq: 4, created: false, mention: false });
  assert.deepEqual(metOf({ row: null, created: false, matched_by: 'none', mention: true }), { register: null, id: null, seq: null, created: false, mention: true });
  assert.equal(metOf('nothing'), null);
});

/* ── the import ────────────────────────────────────────────────────────── */

type Row = { id: string; seq: number; version: number; fields: Record<string, unknown> };

/** A record holding one People list that plays `meets:`, with the owner's own row and one colleague in it. */
function peopleDoor(o: { meet?: boolean } = {}) {
  const rows: Row[] = [
    { id: 'e_self', seq: 1, version: 4, fields: { name: 'Sam Avery', aliases: ['Sam'], self: true, email: 'sam@avery.example', tags: [] } },
    { id: 'e_sudip', seq: 2, version: 1, fields: { name: 'Priya Raman', email: 'priya@encore.example', tags: [] } },
  ];
  const calls: { method: string; args: Record<string, unknown> }[] = [];
  let seq = rows.length;
  const door: Door = {
    schema: async () =>
      ok({
        id: 'people',
        fields: ['name', 'email', 'keys', 'handles', 'aliases', 'self', 'role', 'met', 'merged_into', 'tags'].map((id) => ({ id, type: ['keys', 'handles', 'aliases', 'met', 'tags'].includes(id) ? 'list' : id === 'self' ? 'bool' : 'text' })),
        meets: { name: 'name', email: 'email', keys: 'keys', handles: 'handles', aliases: 'aliases', self: 'self', met: 'met', merged_into: 'merged_into' },
      }),
    list: async () => ok({ rows: rows.map((r) => ({ ...r, fields: { ...r.fields } })), cursor: null }),
    create: async (a) => {
      calls.push({ method: 'create', args: a as Record<string, unknown> });
      const row = { id: `e_${String(++seq)}`, seq, version: 1, fields: a.fields };
      rows.push(row);
      return ok(row);
    },
    update: async (a) => {
      calls.push({ method: 'update', args: a as Record<string, unknown> });
      const row = rows.find((r) => r.seq === a.seq)!;
      if (a.version !== undefined && a.version !== row.version) return { ok: false, refusal: { code: 'VERSION_STALE', fix: 'Re-read the row.' } };
      row.fields = { ...row.fields, ...a.patch };
      row.version++;
      return ok({ ...row });
    },
    governance: async () => ok([]),
    propose: async () => ok({ id: 'SG1' }),
    ...(o.meet === false
      ? {}
      : {
          meet: async (args: Record<string, unknown>): Promise<Result<unknown>> => {
            calls.push({ method: 'meet', args });
            /* A record that knows nobody by this key makes the row from what it was told. */
            const row = { id: `e_${String(++seq)}`, seq, version: 1, fields: { name: args.name, email: args.email, tags: [] } };
            rows.push(row);
            return ok({ row: { register: 'people', id: row.id, seq: row.seq, name: String(args.name) }, created: true, matched_by: 'none' });
          },
        }),
  };
  return { door, rows, calls };
}

const person = (key: string, fields: Record<string, unknown>): PlannedRow => ({ register: 'people', key: `hb:person:${key}`, label: String(fields.name), fields });
const planOf = (rows: PlannedRow[]): Plan => ({ key: 'hb:', taken: null, rev: null, rows, asks: [], polls: [], skipped: [], changed: [] });

test('AN IMPORTED PERSON GOES THROUGH RESOLUTION: “Sam” folds into the owner’s own row, an address already known lands on its person, a new address is met, and a name alone is created', async () => {
  const { door, rows, calls } = peopleDoor();
  const plan = planOf([
    person('1', { name: 'Sam', role: 'owner' }),
    person('2', { name: 'Priya B', email: 'PRIYA@encore.example', role: 'colleague' }),
    person('3', { name: 'Ada Lovelace', email: 'ada@example.com' }),
    person('4', { name: 'Bob' }),
  ]);
  const report = await applyPlan(plan, door, { dryRun: false });
  assert.deepEqual(report.refused, []);
  assert.deepEqual(report.outcomes, { 'hb:person:1': 'updated', 'hb:person:2': 'updated', 'hb:person:3': 'added', 'hb:person:4': 'added' });

  const self = rows.find((r) => r.id === 'e_self')!;
  /* His own row keeps its name and gains the import's key and what it lacked. */
  assert.deepEqual(self.fields, { name: 'Sam Avery', aliases: ['Sam'], self: true, email: 'sam@avery.example', tags: ['hb:person:1'], role: 'owner' });
  assert.deepEqual(rows.find((r) => r.id === 'e_sudip')!.fields, { name: 'Priya Raman', email: 'priya@encore.example', tags: ['hb:person:2'], role: 'colleague' });
  /* Only the person with an address the record had not seen was met; the one with a name alone was created. */
  assert.deepEqual(
    calls.filter((c) => c.method === 'meet').map((c) => c.args),
    [{ name: 'Ada Lovelace', email: 'ada@example.com', where: 'import from the export', keys: ['email:ada@example.com'], kind: 'person', source: 'import from the export' }],
  );
  assert.deepEqual(rows.find((r) => r.fields.email === 'ada@example.com')!.fields.tags, ['hb:person:3']);
  assert.deepEqual(calls.filter((c) => c.method === 'create').map((c) => (c.args.fields as Record<string, unknown>).name), ['Bob']);
  assert.equal(rows.length, 4);

  /* THE NEXT NIGHT: every row is found by its key, and the folded ones are never renamed to what the old tool calls them. */
  calls.splice(0);
  const again = await applyPlan(plan, door, { dryRun: false });
  assert.deepEqual(again.outcomes, { 'hb:person:1': 'unchanged', 'hb:person:2': 'unchanged', 'hb:person:3': 'unchanged', 'hb:person:4': 'unchanged' });
  assert.equal(calls.length, 0);
  assert.equal(self.fields.name, 'Sam Avery');
});

test('A DRY RUN FOLDS ON PAPER ONLY, and a door with no meet still folds by key and by the owner’s names', async () => {
  const { door, calls, rows } = peopleDoor({ meet: false });
  const plan = planOf([person('1', { name: 'sam' }), person('3', { name: 'Ada Lovelace', email: 'ada@example.com' })]);
  const dry = await applyPlan(plan, door, { dryRun: true });
  assert.deepEqual(dry.outcomes, { 'hb:person:1': 'updated', 'hb:person:3': 'added' });
  assert.equal(calls.length, 0);
  const wet = await applyPlan(plan, door, { dryRun: false });
  assert.deepEqual(wet.outcomes, { 'hb:person:1': 'updated', 'hb:person:3': 'added' });
  assert.deepEqual(calls.map((c) => c.method), ['update', 'create']);
  assert.equal(rows.length, 3);
});

test('A MEET THAT LANDS IN ANOTHER LIST, or on a row the import did not read, never patches this list’s row of the same number', async () => {
  for (const answer of [
    { row: { register: 'contacts', id: 'contacts#2', seq: 2, name: 'Ada' }, created: true, matched_by: 'none' },
    { row: { register: 'people', id: 'people#9', seq: 9, name: 'Ada' }, created: false, matched_by: 'key' },
  ]) {
    const { door, rows, calls } = peopleDoor();
    door.meet = async (args) => (calls.push({ method: 'meet', args }), ok(answer));
    const report = await applyPlan(planOf([person('3', { name: 'Ada Lovelace', email: 'Ada.Lovelace@gmail.com' })]), door, { dryRun: false });
    assert.equal(calls.find((c) => c.method === 'meet')?.args.email, 'Ada.Lovelace@gmail.com', 'the address was sent folded');
    assert.deepEqual(calls.filter((c) => c.method === 'update'), [], 'a row the meet did not make here was patched');
    assert.deepEqual(rows.find((r) => r.id === 'e_sudip')!.fields.name, 'Priya Raman');
    assert.equal(report.outcomes['hb:person:3'], 'added');
  }
});

/* ── braindog people harvest ───────────────────────────────────────────── */

function repository(dir: string): (author?: string) => string {
  mkdirSync(dir, { recursive: true });
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', windowsHide: true }).trim();
  git('init', '--quiet');
  git('config', 'user.name', 'Owner');
  git('config', 'user.email', 'owner@example.com');
  git('config', 'commit.gpgsign', 'false');
  let n = 0;
  return (author) => {
    git('commit', '--quiet', '--allow-empty', '-m', `change ${String(++n)}`, ...(author === undefined ? [] : ['--author', author]));
    return git('rev-parse', 'HEAD');
  };
}

type Seen = { method: string; body: Record<string, unknown>; headers: Record<string, string | string[] | undefined> };

/** A record with a Projects list declaring `scopes:`, one project naming the glaze repository by its folder. */
async function harvestHost(t: { after: (fn: () => Promise<void>) => void }, glaze: string) {
  const seen: Seen[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const url = new URL(req.url ?? '/', 'http://stub');
      const method = url.pathname.replace(/^\/api\//, '');
      const raw = Buffer.concat(chunks).toString('utf8');
      const body = (raw ? JSON.parse(raw) : Object.fromEntries(url.searchParams)) as Record<string, unknown>;
      seen.push({ method, body, headers: req.headers });
      const answer = (value: unknown) => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true, value }));
      };
      if (method === 'boot') return answer({ registers: [{ id: 'things', name: 'Projects', count: 1 }, { id: 'people', name: 'People', count: 1 }], now: '2026-10-06T09:00:00Z' });
      if (method === 'schema') return answer(String(body.register) === 'things' ? { id: 'things', title: 'name', fields: [], scopes: { repos: 'repos', folders: 'folders' } } : { id: 'people', title: 'name', fields: [] });
      if (method === 'list')
        return answer(
          String(body.register) === 'things'
            ? { rows: [{ id: 'e_p', seq: 1, version: 1, fields: { name: 'Glaze', repos: [], folders: [glaze] } }], cursor: null }
            : { rows: [{ id: 'e_self', seq: 1, version: 1, fields: { name: 'Sam', self: true, keys: ['email:sam@avery.example'] } }], cursor: null },
        );
      if (method === 'meet') return answer({ row: { register: 'people', id: 'e_x', seq: 5, name: body.name }, created: true, matched_by: 'none' });
      if (method === 'handoff') return answer({ id: 'e_run', seq: 1, state: 'done', version: 2, fields: {} });
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: `not ${method}` } }));
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
  return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, seen };
}

test('BRAINDOG PEOPLE HARVEST groups everyone who committed by key, prints them on --dry-run, and meets each with their project as a run of its own', async (t) => {
  const top = join(scratch, 'developer');
  const glaze = join(top, 'glaze');
  const commitGlaze = repository(glaze);
  const commitLoose = repository(join(top, 'loose', 'sketch'));
  commitGlaze('Grace Hopper <grace@navy.example>');
  commitGlaze('Grace H <Grace@Navy.example>');
  commitGlaze('Sam <sam@avery.example>');
  commitGlaze();
  commitGlaze('dependabot[bot] <49699333+dependabot[bot]@users.noreply.github.com>');
  const linus = commitLoose('Linus <linus@example.org>');
  const host = await harvestHost(t, glaze);
  const out: string[] = [];
  const said: string[] = [];
  const io: AgentIo = {
    env: { BRAINDOG_HOST: host.base, BRAINDOG_TOKEN: 'rec_01TESTTESTTESTTESTTESTTEST.people-harvest', XDG_CONFIG_HOME: join(scratch, 'config') },
    cwd: top,
    home: scratch,
    out: (l) => void out.push(l),
    say: (l) => void said.push(l),
    headers: async () => ({ 'x-braindog-host': 'box' }),
  };

  assert.equal(await peopleCommand(['harvest', '--dry-run'], io), 0, said.join('\n'));
  assert.deepEqual(out, [
    '2 people committed to 2 repositories. Nothing was sent:',
    'Grace Hopper (also Grace H): 2 commits in glaze, Glaze',
    '  grace@navy.example',
    'Linus: 1 commit in sketch',
    '  linus@example.org',
  ]);
  assert.equal(host.seen.filter((s) => s.method === 'meet').length, 0);

  out.splice(0);
  host.seen.splice(0);
  assert.equal(await peopleCommand(['harvest'], io), 0, said.join('\n'));
  const meets = host.seen.filter((s) => s.method === 'meet');
  assert.deepEqual(
    meets.map((s) => [s.body.name, s.body.keys, s.headers['x-braindog-repo'], s.headers['x-braindog-agent']]),
    [
      ['Grace Hopper', ['email:grace@navy.example'], 'glaze', 'other'],
      ['Linus', ['email:linus@example.org'], 'sketch', 'other'],
    ],
  );
  assert.equal(meets[1]!.body.source, `commit ${linus.slice(0, 7)} in sketch`);
  /* One run a project, each its own client id, and each ended once its meets answered. */
  const clients = new Set(meets.map((s) => s.headers['x-braindog-client']));
  assert.equal(clients.size, 2);
  assert.equal(host.seen.filter((s) => s.method === 'handoff').length, 2);
  assert.deepEqual(out, ['Met 2 people from 2 repositories: 2 new. Your own commits and the machines\' were left out.']);

  assert.equal(await peopleCommand(['harvest', '--since', 'yesterday'], io), 1);
  assert.match(said.at(-1)!, /^braindog people harvest takes/);
});

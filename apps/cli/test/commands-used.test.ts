/**
 * The command lines a project is worked with, read from its own Claude Code settings and sent by name only as
 * `toolsSeen` command lines when a session ends (its settings half). No transcript is opened: the
 * half of the scope that counts the session's shell calls is left out by his "transcripts never read".
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { allowedPrograms, COMMANDS_EVERY_MS, COMMANDS_MAX, owedCommands, programsOf, readAllowed, SETTINGS_SOURCE, usedTools } from '../src/commands-used.ts';
import { hookEnd, hookStart, readSession, sendCommands, sessionPath, writeSession, type SendSeen } from '../src/hooks.ts';
import { hostsPath } from '../src/http.ts';
import { positionOf } from '../src/position.ts';
import { MACHINES, PROJECTS } from '../../../fixtures/names.ts';

const scratch = mkdtempSync(join(tmpdir(), 'braindog-commands-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

const allowing = (...allow: unknown[]) => ({ permissions: { allow } });
const PLANTED = 'rec_planted0secret0value0never0sent';

test('wrangler and gh are kept, ls is not, and only the program of each entry', () => {
  assert.deepEqual(allowedPrograms([allowing('Bash(wrangler:*)', 'Bash(gh pr view:*)', 'Bash(ls:*)')]), ['wrangler', 'gh']);
});

test('a variable, a wrapper, a path and a runner are passed to the program they run', () => {
  assert.deepEqual(programsOf('Bash(FOO=1 pnpm exec vitest:*)'), ['vitest']);
  assert.deepEqual(programsOf('Bash(npx -y create-thing@2.1.0 init)'), ['create-thing']);
  assert.deepEqual(programsOf('Bash(pnpm dlx @acme/kit@1 run:*)'), ['@acme/kit']);
  assert.deepEqual(programsOf('Bash(bunx tsx:*)'), ['tsx']);
  assert.deepEqual(programsOf('Bash(uvx ruff@0.6 check)'), ['ruff']);
  assert.deepEqual(programsOf('Bash(sudo -E env A=1 /usr/local/bin/fly deploy:*)'), ['fly']);
  assert.deepEqual(programsOf('Bash(time ./scripts/release.sh)'), ['release.sh']);
  assert.deepEqual(programsOf('Bash(cd site && wrangler deploy; git push | tee out)'), ['wrangler']);
  assert.deepEqual(programsOf('Bash(terraform plan *)'), ['terraform']);
  /* A runner or a bare package manager alone runs nothing worth keeping. */
  assert.deepEqual(programsOf('Bash(npx:*)'), []);
  assert.deepEqual(programsOf('Bash(pnpm run build:*)'), []);
  assert.deepEqual(programsOf('Read(./src/**)'), []);
  assert.deepEqual(programsOf('mcp__kiln__list'), []);
});

test('eleven programs keep ten, each once, in the order the files name them', () => {
  const eleven = ['fly', 'gh', 'wrangler', 'terraform', 'kubectl', 'docker', 'vercel', 'supabase', 'stripe', 'aws', 'gcloud'];
  assert.equal(eleven.length, COMMANDS_MAX + 1);
  const kept = allowedPrograms([allowing(...eleven.slice(0, 6).map((p) => `Bash(${p}:*)`), 'Bash(gh run list)'), allowing(...eleven.slice(6).map((p) => `Bash(${p} *)`))]);
  assert.deepEqual(kept, eleven.slice(0, COMMANDS_MAX));
});

test('a malformed file is skipped, and so is a list or an entry of the wrong shape', () => {
  const folder = join(scratch, PROJECTS[0], '.claude');
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, 'settings.json'), '{ "permissions": { "allow": ["Bash(fly:*)", ');
  writeFileSync(join(folder, 'settings.local.json'), JSON.stringify(allowing('Bash(wrangler:*)')));
  const read = readAllowed(dirname(folder));
  assert.equal(read.length, 1);
  assert.deepEqual(allowedPrograms(read), ['wrangler']);
  assert.deepEqual(readAllowed(join(scratch, 'nowhere')), []);
  assert.deepEqual(allowedPrograms([null, 7, [], { permissions: { allow: 'Bash(fly:*)' } }, allowing(3, null, 'Bash(gh:*)')]), ['gh']);
});

test('an entry holding a planted secret never reaches what is sent', () => {
  const settings = [
    allowing(
      `Bash(DEPLOY_TOKEN=${PLANTED} wrangler deploy --token ${PLANTED}:*)`,
      `Bash(${PLANTED}:*)`,
      `Bash(curl -H "Authorization: Bearer ${PLANTED}" https://api.${PROJECTS[1].toLowerCase()}.example)`,
      `Bash(/home/someone/.secrets/${PLANTED}/bin/tool:*)`,
    ),
  ];
  const sent = JSON.stringify(usedTools(allowedPrograms(settings)));
  assert.ok(!sent.includes('planted'), sent);
  assert.deepEqual(JSON.parse(sent), [
    { name: 'wrangler', kind: 'cli', scope: 'project', command: 'wrangler', needs: [], source: SETTINGS_SOURCE },
    { name: 'tool', kind: 'cli', scope: 'project', command: 'tool', needs: [], source: SETTINGS_SOURCE },
  ]);
});

test('the same list is owed once a day; another list is owed at once', () => {
  const now = Date.parse('2026-10-14T12:00:00Z');
  const sent = { names: ['gh', 'wrangler'], at: new Date(now - 3_600_000).toISOString() };
  assert.equal(owedCommands([], undefined, now), false);
  assert.equal(owedCommands(['wrangler'], undefined, now), true);
  assert.equal(owedCommands(['wrangler', 'gh'], sent, now), false);
  assert.equal(owedCommands(['wrangler', 'gh', 'fly'], sent, now), true);
  assert.equal(owedCommands(['wrangler', 'gh'], sent, now + COMMANDS_EVERY_MS), true);
});

/* ── the end hook ──────────────────────────────────────────────────────── */

/** A repository with the project's settings, and the config folder its session files live in. */
function project(name: string, settings: unknown) {
  const cwd = join(scratch, name);
  mkdirSync(join(cwd, '.claude'), { recursive: true });
  execFileSync('git', ['init', '-q', cwd]);
  writeFileSync(join(cwd, '.claude', 'settings.json'), JSON.stringify(settings));
  const env = { XDG_CONFIG_HOME: join(scratch, `${name}-config`), BRAINDOG_HOST: 'http://127.0.0.1:9', BRAINDOG_TOKEN: 'rec_test-commands-never-printed' };
  return { cwd, env, log: join(dirname(hostsPath(env)), 'hook.log') };
}

const TO = { key: 'http://127.0.0.1:9', base: 'http://127.0.0.1:9' };
const RUN = { spoken: 'S7', client_id: 'claude-run-1' };
const held = { host: TO.key, spoken: 'S7', client_id: 'claude-run-1', head_at_start: null, at: '2026-10-14T00:00:00Z' };

test('the end sends the settings programs once, by name, and the same list not again within the day', async () => {
  const { cwd, env } = project(PROJECTS[2].replace(' ', '-'), allowing('Bash(wrangler:*)', 'Bash(gh pr view:*)', 'Bash(ls:*)'));
  const files = [sessionPath(env, cwd, 'claude-run-1'), sessionPath(env, cwd)];
  for (const f of files) writeSession(f, held);
  const sent: Parameters<SendSeen>[0][] = [];
  const send: SendSeen = async (args) => (sent.push(args), { ok: true, value: { tools: [] } });
  const at = { ...(await positionOf(cwd)), host: MACHINES[0] };
  const io = { env, stdin: '', cwd, write: () => assert.fail('the end hook printed') };

  await sendCommands(io, TO, at, RUN, files, 1_000, send);
  assert.deepEqual(sent, [{ machine: MACHINES[0], found: usedTools(['wrangler', 'gh']) }]);
  for (const f of files) assert.deepEqual(readSession(f)?.commands?.names, ['wrangler', 'gh'], f);

  await sendCommands(io, TO, at, RUN, files, 1_000, send);
  assert.equal(sent.length, 1, 'the same list went twice in a day');

  writeFileSync(join(cwd, '.claude', 'settings.local.json'), JSON.stringify(allowing('Bash(fly deploy:*)')));
  await sendCommands(io, TO, at, RUN, files, 1_000, send);
  assert.deepEqual(sent[1]?.found.map((f) => f.name), ['wrangler', 'gh', 'fly']);
});

test('an unknown method, a refusal or a throw changes nothing and is one quiet line in the hook log', async () => {
  const { cwd, env, log } = project(PROJECTS[3], allowing('Bash(wrangler:*)'));
  const files = [sessionPath(env, cwd)];
  writeSession(files[0]!, held);
  const before = readFileSync(files[0]!, 'utf8');
  const at = await positionOf(cwd);
  const io = { env, stdin: '', cwd, write: () => assert.fail('the end hook printed') };
  const answers: SendSeen[] = [
    async () => ({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'There is no method called toolsSeen.' } }),
    async () => ({ ok: false, refusal: { code: 'FORBIDDEN', fix: 'This token may not write tools.' } }),
    async () => {
      throw new Error(PLANTED);
    },
  ];
  for (const send of answers) await sendCommands(io, TO, at, RUN, files, 1_000, send);
  assert.equal(readFileSync(files[0]!, 'utf8'), before);
  const lines = readFileSync(log, 'utf8').trim().split('\n');
  assert.equal(lines.length, 3, lines.join('\n'));
  assert.match(lines[0]!, /does not record command lines yet/u);
  assert.match(lines[1]!, /This token may not write tools\./u);
  assert.ok(!lines.join('\n').includes('planted'));
});

test('the end hook in a project sends its end, prints nothing, and opens no transcript', async (t) => {
  const seen: string[] = [];
  const server = createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      const method = new URL(req.url ?? '/', 'http://stub').pathname.replace(/^\/api\//u, '');
      seen.push(method);
      res.writeHead(200, { 'content-type': 'application/json' });
      if (method === 'end') return res.end(JSON.stringify({ ok: true, value: { run: 'S7', state: 'done', changed: true } }));
      res.end(JSON.stringify({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: `The stub does not answer ${method}.` } }));
    });
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  t.after(() => new Promise<void>((done) => (server.closeAllConnections(), server.close(() => done()))));
  const base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;

  const { cwd, env: own, log } = project(PROJECTS[4], allowing('Bash(wrangler:*)'));
  const env = { ...own, BRAINDOG_HOST: base, BRAINDOG_TIMEOUT_MS: '3000' };
  writeSession(sessionPath(env, cwd), { ...held, host: base });
  /* The transcript a folder, which any read would throw on. */
  const transcript = join(scratch, 'session-log');
  mkdirSync(transcript, { recursive: true });
  const printed: string[] = [];
  const stdin = JSON.stringify({ session_id: 'claude-run-1', transcript_path: transcript, cwd, hook_event_name: 'SessionEnd', reason: 'logout' });
  await hookEnd({ env, stdin, cwd, write: (text) => printed.push(text) });

  assert.deepEqual(printed, []);
  assert.equal(seen.at(-1), 'end', seen.join(', '));
  /* Until the host's route lands the client answers that it has no such method; once it does, the stub does. Either way
     nothing is remembered and the log says so once. */
  assert.equal(readSession(sessionPath(env, cwd))?.commands, undefined);
  assert.ok(existsSync(log) && /command lines/u.test(readFileSync(log, 'utf8')));
});

test('the next session in the folder carries what was sent, so its end does not send it again', async (t) => {
  const context = { session: { spoken: 'S8', state: 'active' }, project: null, ambiguous: [], handoff: null, live: { same_repo: [], elsewhere: [] }, waiting: [], registers: [], people: [], faded: 0, next: 'Call handoff before you stop.' };
  const server = createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      const method = new URL(req.url ?? '/', 'http://stub').pathname.replace(/^\/api\//u, '');
      res.writeHead(200, { 'content-type': 'application/json' });
      if (method === 'attach') return res.end(JSON.stringify({ ok: true, value: { session: { id: 'e_8', seq: 8, state: 'active', version: 1, fields: {} }, spoken: 'S8', resumed: false, context } }));
      res.end(JSON.stringify({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: `The stub does not answer ${method}.` } }));
    });
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  t.after(() => new Promise<void>((done) => (server.closeAllConnections(), server.close(() => done()))));
  const base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;

  const { cwd, env: own } = project(`${PROJECTS[0]}-next`, allowing('Bash(wrangler:*)'));
  const env = { ...own, BRAINDOG_HOST: base, BRAINDOG_TIMEOUT_MS: '3000' };
  const commands = { names: ['wrangler'], at: new Date().toISOString() };
  writeSession(sessionPath(env, cwd), { ...held, host: base, commands });
  const stdin = JSON.stringify({ session_id: 'claude-run-2', cwd, hook_event_name: 'SessionStart', source: 'clear' });
  await hookStart({ env, stdin, cwd, device: MACHINES[1], write: () => {} });

  assert.equal(readSession(sessionPath(env, cwd, 'claude-run-2'))?.spoken, 'S8');
  assert.deepEqual(readSession(sessionPath(env, cwd, 'claude-run-2'))?.commands, commands);
  assert.deepEqual(readSession(sessionPath(env, cwd))?.commands, commands);
});

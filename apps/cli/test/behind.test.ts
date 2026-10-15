/**
 * The start hook's line when this command is behind its host (AGT-A04 job 3), against a local server that answers the
 * build address as a host does. The claims are the scope's: "needs" before `min_cli`, "can" past fourteen days behind
 * the host's build, at most one request a day per host, two seconds at most, and a host that does not answer is no line.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { BEHIND_DAYS, behindLine, behindSaid, CHECK_EVERY_MS, CHECK_MS, checkPath, DOCTOR_EVERY_MS, doctorCheckPath, doctorLine, hostName } from '../src/behind.ts';

type T = { after: (f: () => void | Promise<void>) => void };

const NOW = Date.parse('2026-10-09T08:00:00Z');

/** A host whose build address answers `body`, or never answers with `hang`; it counts every request. */
async function host(t: T, body: unknown, hang = false): Promise<{ base: string; asked: string[] }> {
  const asked: string[] = [];
  const server: Server = createServer((req, res) => {
    asked.push(req.url ?? '');
    if (hang) return;
    if (req.url !== '/.well-known/braindog-build') return void res.writeHead(404).end();
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(body));
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  t.after(() => {
    server.closeAllConnections();
    return new Promise<void>((done) => server.close(() => done()));
  });
  return { base: `http://127.0.0.1:${String((server.address() as { port: number }).port)}`, asked };
}

/** A machine whose default host is `base`, with its own home and config folder. */
function machine(t: T, base: string) {
  const root = mkdtempSync(join(tmpdir(), 'braindog-behind-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const home = join(root, 'home');
  return { home, env: { BRAINDOG_HOST: `${base}/app/someone`, XDG_CONFIG_HOME: join(root, 'config') } };
}

test('a command from a day before min_cli is told the host needs the update, and the host is named, never its address', async (t) => {
  const h = await host(t, { app: '2026.10.09+5a57ba2', min_cli: '2026.10.07' });
  const m = machine(t, h.base);
  const line = await behindLine({ ...m, build: '2026.10.06+4e712da', now: NOW });
  assert.equal(line, `This command is older than ${hostName(h.base)} needs. Run braindog update.`);
  assert.doesNotMatch(line!, /https?:|\/app\/|—/u);
  assert.deepEqual(h.asked, ['/.well-known/braindog-build']);
});

test('more than fourteen days behind the host says can; fourteen or fewer, and the same day as min_cli, say nothing', async (t) => {
  const h = await host(t, { app: '2026.10.09+5a57ba2', min_cli: '2026.09.01' });
  const can = await behindLine({ ...machine(t, h.base), build: '2026.09.24+4e712da', now: NOW });
  assert.equal(can, `This command is older than ${hostName(h.base)} can. Run braindog update.`);
  assert.equal(await behindLine({ ...machine(t, h.base), build: '2026.09.25+4e712da', now: NOW }), null, `${String(BEHIND_DAYS)} days is not behind`);
  assert.equal(behindSaid('2026.10.07+4e712da', { app: '2026.10.09+5a57ba2', min_cli: '2026.10.07' }, 'brain.dog'), null);
  assert.equal(behindSaid('2026.10.09+4e712da', { app: '2026.10.09+5a57ba2', min_cli: null }, 'brain.dog'), null);
});

test('at most once a day per host: the kept answer is read against this build, and a day later the host is asked again', async (t) => {
  const h = await host(t, { app: '2026.10.09+5a57ba2', min_cli: '2026.10.07' });
  const m = machine(t, h.base);
  const old = '2026.10.01+4e712da';
  assert.match((await behindLine({ ...m, build: old, now: NOW })) ?? '', /needs/u);
  assert.match((await behindLine({ ...m, build: old, now: NOW + 3_600_000 })) ?? '', /needs/u, 'the kept answer still says it');
  assert.equal(await behindLine({ ...m, build: '2026.10.09+5a57ba2', now: NOW + 3_600_000 }), null, 'updated: quiet at once');
  assert.equal(h.asked.length, 1);
  const kept = JSON.parse(readFileSync(checkPath(m.home), 'utf8')) as { hosts: Record<string, { at: string; min_cli: string }> };
  assert.equal(Object.values(kept.hosts)[0]?.min_cli, '2026.10.07');
  await behindLine({ ...m, build: old, now: NOW + CHECK_EVERY_MS + 1 });
  assert.equal(h.asked.length, 2);
});

/* A timeout of its own, so a budget that stops holding fails this test rather than hanging the run. */
test('a host that never answers costs two seconds at most, says nothing, and is not asked again that day', { timeout: 10_000 }, async (t) => {
  const h = await host(t, null, true);
  const m = machine(t, h.base);
  const from = performance.now();
  assert.equal(await behindLine({ ...m, build: '2026.10.01+4e712da', now: NOW }), null);
  const took = performance.now() - from;
  assert.ok(took < CHECK_MS + 500, `took ${String(Math.round(took))} ms`);
  assert.equal(await behindLine({ ...m, build: '2026.10.01+4e712da', now: NOW + 60_000 }), null);
  assert.equal(h.asked.length, 1);
});

test('an unreachable host, a wrong answer, a checkout and a broken hosts file are all no line, and nothing throws', async (t) => {
  const dead = machine(t, 'http://127.0.0.1:9');
  assert.equal(await behindLine({ ...dead, build: '2026.10.01+4e712da', now: NOW }), null);
  const blank = await host(t, {});
  assert.equal(await behindLine({ ...machine(t, blank.base), build: '2026.10.01+4e712da', now: NOW }), null, 'no min_cli, no app');

  const h = await host(t, { app: '2026.10.09+5a57ba2', min_cli: '2026.10.07' });
  assert.equal(await behindLine({ ...machine(t, h.base), build: 'dev+0000000', now: NOW }), null);
  assert.deepEqual(h.asked, [], 'a checkout asks nothing');

  const broken = machine(t, h.base);
  mkdirSync(join(broken.env.XDG_CONFIG_HOME, 'braindog'), { recursive: true });
  writeFileSync(join(broken.env.XDG_CONFIG_HOME, 'braindog', 'hosts.json'), '{ not json');
  assert.equal(await behindLine({ env: { XDG_CONFIG_HOME: broken.env.XDG_CONFIG_HOME }, home: broken.home, build: '2026.10.01+4e712da', now: NOW }), null);
  assert.equal(existsSync(checkPath(broken.home)), false);
});

/* ONCE A WEEK, A QUIET DOCTOR RUN (AGT-A10 job 4): its line only when it lists something, run again only after seven days,
   when it was run written before the run, and a run that throws is no line. */
test('the weekly doctor line: said when doctor lists places, kept quiet for seven days, and nothing on a throw', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'braindog-doctor-line-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  let runs = 0;
  const listed = () => (runs++, { report: { places: [1, 2, 3] }, code: 1 });
  assert.equal(doctorLine(root, NOW, listed), 'braindog doctor lists 3 places to fix. Run braindog doctor to see them.');
  assert.equal(JSON.parse(readFileSync(doctorCheckPath(root), 'utf8')).at, new Date(NOW).toISOString());
  assert.equal(doctorLine(root, NOW + DOCTOR_EVERY_MS - 1, listed), null, 'inside the week it is not run again');
  assert.equal(runs, 1);
  assert.equal(doctorLine(root, NOW + DOCTOR_EVERY_MS, () => ({ report: { places: [] }, code: 0 })), null, 'nothing listed is no line');
  const thrown = mkdtempSync(join(tmpdir(), 'braindog-doctor-line-'));
  t.after(() => rmSync(thrown, { recursive: true, force: true }));
  assert.equal(doctorLine(thrown, NOW, () => { throw new Error('ps failed'); }), null);
  assert.ok(existsSync(doctorCheckPath(thrown)), 'written before the run, so a run that throws is not tried on every start');
});

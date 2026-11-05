/**
 * `braindog update`, against a local server that serves a bundle, its sum and its build as the site does.
 *
 * THE BUNDLE SERVED HERE IS A SMALL SCRIPT, because what is under test is the swap and not the command: it answers
 * `--version` with the build it is, and `install --apply` by writing the arguments it was given to a file, so the
 * profiles placed again are seen through the real `placeAgain` and a real child process. The claims are the scope's:
 * a good swap, a bad sum refused with the old file intact, the previous kept, and no temporary file on any path.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { listedProfiles, placeAgain } from '../src/placed.ts';
import { checkLine, update, type UpdateIo } from '../src/update.ts';

const OLD = '2026.10.01+4e712da';
const NEW = '2026.10.09+5a57ba2';

/** A bundle that says it is `build`, and records the arguments of any `install` it is asked to run. */
const bundle = (build: string) =>
  [
    '#!/usr/bin/env node',
    "import { writeFileSync } from 'node:fs';",
    `if (process.argv[2] === '--version') console.log('app ${build} · format 1');`,
    "else if (process.argv[2] === 'install') writeFileSync(process.env.BRAINDOG_TEST_MARK, process.argv.slice(2).join(' '));",
    '',
  ].join('\n');

const sha = (text: string) => createHash('sha256').update(text).digest('hex');

/** Serves `files` by name under `/cli/`, and counts every request so a test can say nothing was downloaded. */
async function serve(t: { after: (f: () => void | Promise<void>) => void }, files: Record<string, string>): Promise<{ base: string; asked: string[] }> {
  const asked: string[] = [];
  const server: Server = createServer((req, res) => {
    const name = (req.url ?? '').replace(/^\/cli\//, '');
    asked.push(name);
    const body = files[name];
    if (body === undefined) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-type': 'text/plain' }).end(body);
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  t.after(() => new Promise<void>((done) => server.close(() => done())));
  const port = (server.address() as { port: number }).port;
  return { base: `http://127.0.0.1:${port}/cli`, asked };
}

/** A machine: an installed old command in `bin/`, a home with no profiles file, and one Claude Code profile. */
function machine(t: { after: (f: () => void) => void }) {
  const root = mkdtempSync(join(tmpdir(), 'braindog-update-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const bin = join(root, 'bin');
  mkdirSync(bin);
  const file = join(bin, 'braindog.mjs');
  writeFileSync(file, bundle(OLD));
  const mark = join(root, 'placed.txt');
  const env = { ...process.env, HOME: join(root, 'home'), CLAUDE_CONFIG_DIR: join(root, 'profile'), BRAINDOG_TEST_MARK: mark };
  return { root, bin, file, mark, env };
}

function io(m: ReturnType<typeof machine>, base: string, build = OLD): UpdateIo & { said: string[]; refused: string[] } {
  const said: string[] = [];
  const refused: string[] = [];
  /* THE SWAP IS WHAT THIS FILE TESTS, so no key is pinned here; `release-signing.test.ts` holds the signature. */
  return { keys: [], file: m.file, build, env: m.env, base, home: m.env.HOME, out: (l) => said.push(l), err: (l) => refused.push(l), said, refused };
}

test('a good swap puts the new build in place, keeps the old as .prev, places the profile again and leaves no temporary file', async (t) => {
  const m = machine(t);
  const body = bundle(NEW);
  const { base } = await serve(t, { 'braindog.mjs': body, 'braindog.mjs.sha256': `${sha(body)}  braindog.mjs\n`, 'braindog.mjs.build': `${NEW}\n` });
  const run = io(m, base);
  assert.equal(await update([], run), 0, run.refused.join('\n'));
  assert.equal(readFileSync(m.file, 'utf8'), body);
  assert.equal(readFileSync(`${m.file}.prev`, 'utf8'), bundle(OLD));
  assert.deepEqual(readdirSync(m.bin).sort(), ['braindog.mjs', 'braindog.mjs.prev']);
  assert.deepEqual(run.said, ['Updated 2026.10.01 to 2026.10.09, the old one kept beside it as braindog.mjs.prev, skill placed in 1 profile.']);
  assert.equal(readFileSync(m.mark, 'utf8'), 'install --apply');
});

test('a wrong sum is refused, the installed file is untouched, and nothing is left beside it', async (t) => {
  const m = machine(t);
  const body = bundle(NEW);
  const { base } = await serve(t, { 'braindog.mjs': body, 'braindog.mjs.sha256': `${sha('something else')}  braindog.mjs\n`, 'braindog.mjs.build': NEW });
  const run = io(m, base);
  assert.equal(await update([], run), 1);
  assert.match(run.refused.join('\n'), /does not match its checksum/);
  assert.ok(readFileSync(m.file).equals(Buffer.from(bundle(OLD))));
  assert.deepEqual(readdirSync(m.bin), ['braindog.mjs']);
  assert.equal(existsSync(m.mark), false);
});

test('a swap whose rename fails leaves the installed file byte for byte as it was, and no download beside it', async (t) => {
  const m = machine(t);
  const before = readFileSync(m.file);
  const body = bundle(NEW);
  const { base } = await serve(t, { 'braindog.mjs': body, 'braindog.mjs.sha256': sha(body), 'braindog.mjs.build': NEW });
  const run = io(m, base);
  run.rename = () => {
    throw new Error('the disk said no');
  };
  assert.equal(await update([], run), 1);
  assert.deepEqual(run.refused, ['The update stopped (the disk said no), and the installed command is the one that was there.']);
  assert.ok(readFileSync(m.file).equals(before));
  assert.deepEqual(readdirSync(m.bin).sort(), ['braindog.mjs', 'braindog.mjs.prev']);
  assert.equal(existsSync(m.mark), false);
});

test('a bundle that is not the build the site named is refused, with no temporary file left', async (t) => {
  const m = machine(t);
  const body = bundle('2026.10.08+0badc0d');
  const { base } = await serve(t, { 'braindog.mjs': body, 'braindog.mjs.sha256': sha(body), 'braindog.mjs.build': NEW });
  const run = io(m, base);
  assert.equal(await update([], run), 1);
  assert.match(run.refused.join('\n'), /while a deploy is copying them/);
  assert.equal(readFileSync(m.file, 'utf8'), bundle(OLD));
  assert.deepEqual(readdirSync(m.bin), ['braindog.mjs']);
});

test('a missing bundle changes nothing and leaves nothing', async (t) => {
  const m = machine(t);
  const { base } = await serve(t, { 'braindog.mjs.sha256': sha('x'), 'braindog.mjs.build': NEW });
  const run = io(m, base);
  assert.equal(await update([], run), 1);
  assert.match(run.refused.join('\n'), /could not be downloaded/);
  assert.deepEqual(readdirSync(m.bin), ['braindog.mjs']);
});

test('--check only reports, in the dates when they differ', async (t) => {
  const m = machine(t);
  const { base, asked } = await serve(t, { 'braindog.mjs.build': NEW });
  const run = io(m, base);
  assert.equal(await update(['--check'], run), 0);
  assert.deepEqual(run.said, ['This command is 2026.10.01; 2026.10.09 is out. Run braindog update.']);
  assert.deepEqual(asked, ['braindog.mjs.build']);
  assert.deepEqual(readdirSync(m.bin), ['braindog.mjs']);
  assert.equal(checkLine(NEW, NEW), `This command is ${NEW}, the build that is out.`);
  assert.equal(checkLine('2026.10.09+1111111', NEW), `This command is 2026.10.09+1111111; ${NEW} is out. Run braindog update.`);
});

test('the same build downloads nothing and says so', async (t) => {
  const m = machine(t);
  const { base, asked } = await serve(t, { 'braindog.mjs.build': NEW });
  const run = io(m, base, NEW);
  assert.equal(await update([], run), 0);
  assert.match(run.said[0] ?? '', /nothing to update/);
  assert.deepEqual(asked, ['braindog.mjs.build']);
});

test('a checkout run refuses in one sentence and asks nothing', async (t) => {
  const m = machine(t);
  const { base, asked } = await serve(t, {});
  const run = io(m, base, 'dev+0000000');
  assert.equal(await update([], run), 1);
  assert.deepEqual(run.refused, ['This braindog runs from a checkout, so it is updated with git, not with braindog update.']);
  assert.deepEqual(asked, []);
});

test('profiles.json, once written, names every profile placed again', (t) => {
  const m = machine(t);
  const home = m.env.HOME;
  assert.equal(listedProfiles(home), null);
  mkdirSync(join(home, '.braindog'), { recursive: true });
  writeFileSync(join(home, '.braindog', 'profiles.json'), JSON.stringify({ profiles: ['/a', { dir: '/b' }, 7] }));
  assert.deepEqual(listedProfiles(home), ['/a', '/b']);
  let seen: string[] = [];
  const placed = placeAgain(m.file, m.env, home, (_cmd, args) => ((seen = args), { status: 0 }));
  assert.deepEqual(placed, { count: 2, failed: null });
  assert.deepEqual(seen, [m.file, 'install', '--apply', '--config-dir', '/a', '--config-dir', '/b']);
  const failed = placeAgain(m.file, m.env, home, () => ({ status: 1, stderr: '\nThe settings file does not read.\n' }));
  assert.deepEqual(failed, { count: 0, failed: 'The settings file does not read.' });
});

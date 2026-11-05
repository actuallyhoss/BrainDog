/**
 * A build of this command is signed at release, and a pinned command and the install scripts take nothing else
 * (`src/release-key.ts`, `tools/ship/cli-sign.mjs`, `tools/ship/cli-key.mjs`).
 *
 * WHAT THIS IS FOR. A sum is served beside its file, so somebody who can change what the site serves changes both, and every
 * `braindog update` and every curl-pipe-sh then runs their code. Here a host serves a build with a good sum and no
 * signature, and with a good sum and somebody else's signature, and neither runs.
 *
 * NO REAL KEY AND NO REAL KEYCHAIN. Each test makes its own pair, and `security` here is a small script on a PATH of its own that
 * keeps its item in a file.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash, createPublicKey, generateKeyPairSync, sign } from 'node:crypto';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { readSignature, RELEASE_KEYS, RELEASE_LABEL, releaseMessage, signedBy } from '../src/release-key.ts';
import { update, type UpdateIo } from '../src/update.ts';

const REPO = new URL('../../../', import.meta.url);
const repo = (path: string): string => new URL(path, REPO).pathname;
const OLD = '2026.01.01+aaaaaaa';
const NEW = '2026.02.02+bbbbbbb';
const RAN = 'BRAINDOG_TEST_RAN';

const bundle = (build: string): string =>
  `#!/usr/bin/env node\nimport { writeFileSync } from 'node:fs';\nif (process.env.${RAN}) writeFileSync(process.env.${RAN}, 'ran');\nconsole.log('app ${build}');\n`;
const sha = (text: string): string => createHash('sha256').update(text).digest('hex');

const AT = 2_000_000_000;

function pair(): { x: string; signs: (sum: string, build: string, released?: number) => string; der: string } {
  const { privateKey } = generateKeyPairSync('ed25519');
  return {
    x: createPublicKey(privateKey).export({ format: 'jwk' }).x!,
    signs: (sum, build, released = AT) => `${released}\n${sign(null, releaseMessage(sum, build, released), privateKey).toString('base64url')}`,
    der: privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'),
  };
}

async function serve(t: { after: (f: () => Promise<void>) => void }, files: Record<string, string>): Promise<string> {
  const server = createServer((req, res) => {
    const body = files[(req.url ?? '').replace(/^\/cli\//u, '')];
    if (body === undefined) return void res.writeHead(404).end();
    res.writeHead(200, { 'content-type': 'text/plain' }).end(body);
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  t.after(() => new Promise<void>((done) => server.close(() => done())));
  return `http://127.0.0.1:${(server.address() as { port: number }).port}/cli`;
}

function scratch(t: { after: (f: () => void) => void }): string {
  const root = mkdtempSync(join(tmpdir(), 'braindog-signing-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function served(body: string, sig?: string): Record<string, string> {
  return { 'braindog.mjs': body, 'braindog.mjs.sha256': `${sha(body)}  braindog.mjs\n`, 'braindog.mjs.build': `${NEW}\n`, ...(sig === undefined ? {} : { 'braindog.mjs.sig': `${sig}\n` }) };
}

function machine(root: string, base: string, keys: readonly string[]): UpdateIo & { said: string[]; refused: string[]; ran: string; file: string } {
  const file = join(root, 'braindog.mjs');
  writeFileSync(file, bundle(OLD));
  const said: string[] = [];
  const refused: string[] = [];
  const ran = join(root, 'ran');
  return { file, build: OLD, env: { ...process.env, [RAN]: ran }, base, keys, out: (l) => said.push(l), err: (l) => refused.push(l), place: () => ({ count: 0, failed: null }), said, refused, ran };
}

test('A PINNED COMMAND TAKES A BUILD SIGNED BY ITS KEY', async (t) => {
  const key = pair();
  const body = bundle(NEW);
  const run = machine(scratch(t), await serve(t, served(body, key.signs(sha(body), NEW))), [key.x]);
  assert.equal(await update([], run), 0, run.refused.join('\n'));
  assert.equal(readFileSync(run.file, 'utf8'), body);
});

test('A PINNED COMMAND REFUSES A GOOD SUM WITH NO SIGNATURE OR ANOTHER KEY\'S, AND NEVER RUNS IT', async (t) => {
  const key = pair();
  const stranger = pair();
  const body = bundle(NEW);
  const cases: [string, string | undefined, RegExp][] = [
    ['no signature', undefined, /no signature/u],
    ['a stranger signed it', stranger.signs(sha(body), NEW), /not BrainDog's/u],
    ['signed for another build', key.signs(sha(body), OLD), /not BrainDog's/u],
    ['signed for another file', key.signs(sha('other'), NEW), /not BrainDog's/u],
    ['not a signature', 'AAAA', /not BrainDog's/u],
    ['another time written over a good signature', key.signs(sha(body), NEW, AT).replace(String(AT), String(AT + 1)), /not BrainDog's/u],
  ];
  for (const [why, sig, says] of cases) {
    const run = machine(scratch(t), await serve(t, served(body, sig)), [key.x]);
    assert.equal(await update([], run), 1, why);
    assert.match(run.refused.join('\n'), says, why);
    assert.equal(readFileSync(run.file, 'utf8'), bundle(OLD), `${why}: the installed file changed`);
    assert.equal(existsSync(run.ran), false, `${why}: the download ran`);
    assert.equal(existsSync(`${run.file}.prev`), false, why);
  }
});

test('A COMMAND WITH NO KEY PINNED KEEPS WORKING OVER THE SUM, AS EVERY BUILD BEFORE THE PIN DOES', async (t) => {
  const body = bundle(NEW);
  const run = machine(scratch(t), await serve(t, served(body)), []);
  assert.equal(await update([], run), 0, run.refused.join('\n'));
  assert.equal(readFileSync(run.file, 'utf8'), body);
});

test('AN OLDER SIGNED BUILD SERVED AGAIN IS REFUSED BEFORE IT RUNS, BY ITS DAY AND WITHIN A DAY, AND --older TAKES IT', async (t) => {
  const key = pair();
  const body = bundle(NEW);
  /* WITHIN A DAY: a good signature on a build of the same date as the one running, released before it. */
  const today = `${NEW.split('+')[0]}+ccccccc`;
  const same = machine(scratch(t), await serve(t, served(body, key.signs(sha(body), NEW, AT - 60))), [key.x]);
  same.build = today;
  same.released = AT;
  assert.equal(await update([], same), 1);
  assert.match(same.refused.join('\n'), /older build/u);
  assert.match(same.refused.join('\n'), /--older/u);
  assert.equal(readFileSync(same.file, 'utf8'), bundle(OLD));
  assert.equal(existsSync(same.ran), false, 'the older build ran');
  assert.equal(await update(['--older'], same), 0, same.refused.join('\n'));
  assert.equal(readFileSync(same.file, 'utf8'), body);

  /* BY ITS DAY, and nothing is downloaded. */
  const asked: string[] = [];
  const later = machine(scratch(t), await serve(t, served(body, key.signs(sha(body), NEW, AT - 86_400 * 30))), [key.x]);
  later.build = '2027.01.01+ddddddd';
  later.released = AT;
  later.fetch = ((url: string, init?: RequestInit) => (asked.push(url), fetch(url, init))) as typeof fetch;
  assert.equal(await update([], later), 1);
  assert.deepEqual(asked.map((u) => u.split('/').pop()), ['braindog.mjs.build']);
  assert.equal(await update(['--older'], later), 0, later.refused.join('\n'));

  /* AND A NEWER RELEASE OF THE SAME DAY GOES THROUGH. */
  const newer = machine(scratch(t), await serve(t, served(body, key.signs(sha(body), NEW, AT + 60))), [key.x]);
  newer.build = today;
  newer.released = AT;
  assert.equal(await update([], newer), 0, newer.refused.join('\n'));

  /* AN UNPINNED COMMAND HOLDS TO THE DAY. */
  const unpinned = machine(scratch(t), await serve(t, served(body)), []);
  unpinned.build = '2027.01.01+ddddddd';
  assert.equal(await update([], unpinned), 1);
  assert.match(unpinned.refused.join('\n'), /older build/u);
});

test('THE SIGNATURE FILE IS A TIME AND A SIGNATURE, AND NOTHING ELSE', () => {
  assert.deepEqual(readSignature('123\nabc\n'), { released: 123, signature: 'abc' });
  for (const bad of ['', 'abc', '123', 'x y', '1 2 3', '-1 abc', '1.5 abc']) assert.equal(readSignature(bad), null, bad);
});

test('THE TWO SCRIPTS PIN WHAT THE COMMAND PINS, AND SPELL THE SAME MESSAGE', () => {
  const sh = readFileSync(repo('apps/site/static/cli/install.sh'), 'utf8');
  const ps = readFileSync(repo('apps/site/static/cli/install.ps1'), 'utf8');
  assert.equal(/^PIN='([^']*)'$/mu.exec(sh)?.[1], RELEASE_KEYS.join(' '));
  assert.equal(/^ {2}\$pin = '([^']*)'$/mu.exec(ps)?.[1], RELEASE_KEYS.join(' '));
  const said = 'braindog-cli release\\n"+sum+"\\n"+build+"\\n"+r+"\\n"';
  assert.ok(sh.includes(said), 'install.sh signs another message');
  assert.ok(ps.includes(said), 'install.ps1 signs another message');
  assert.equal(releaseMessage('s', 'b', 7).toString(), 'braindog-cli release\ns\nb\n7\n');
  /* AND THE LIST PUBLISHED IN THE REPOSITORY, which is the check on the scripts. */
  const published = /<!-- release-keys -->([\s\S]*?)<!-- \/release-keys -->/u.exec(readFileSync(repo('apps/cli/README.md'), 'utf8'))?.[1] ?? '';
  assert.deepEqual([...published.matchAll(/`([^`]+)`/gu)].map((m) => m[1]), [...RELEASE_KEYS]);
});

test('THE DEPLOY SIGNS BEFORE IT PUBLISHES, AND PUBLISHES THE SUM BESIDE THE SIGNATURE FOR A COMMAND FROM BEFORE THE PIN', () => {
  const yml = readFileSync(repo('.github/workflows/deploy.yml'), 'utf8');
  const at = yml.indexOf('node tools/ship/cli-sign.mjs');
  const copy = yml.indexOf('cp apps/cli/dist/braindog.mjs');
  assert.ok(at > 0 && at < copy, 'the CLI is copied to the site before it is signed');
  /* NO HALF A DEPLOY: nothing is written anywhere before this step, so a stop here leaves what is live as it was. */
  for (const write of ['Take a restore point', 'wrangler deploy', 'wrangler rollback', 'migrat']) {
    const first = yml.indexOf(write);
    assert.ok(first === -1 || first > at, `${write} comes before the CLI is signed`);
  }
  /* AND A RED HERE ROLLS NOTHING BACK, which would undo a deploy that never happened. */
  assert.match(yml, /if: failure\(\) && \(steps\.parity\.outcome == 'failure' \|\| steps\.smoke\.outcome == 'failure'\)/u);
  /* WITH NO KEY THE DEPLOY STOPS BEFORE ITS FIRST STEP, among its refusals, and asks for no value to do it. */
  const deploy = readFileSync(repo('tools/ship/deploy.mjs'), 'utf8');
  const asked = deploy.indexOf("'tools/ship/cli-sign.mjs'), '--check'");
  assert.ok(asked > 0 && asked < deploy.indexOf('for (const line of refusals) say'), 'deploy.mjs does not ask for the key among its refusals');
  assert.ok(deploy.indexOf('Nothing was deployed.') < deploy.indexOf('writeFileSync(LOCK'));
  const line = yml.slice(copy, yml.indexOf('\n', copy));
  assert.ok(line.includes('braindog.mjs.sig') && line.includes('braindog.mjs.sha256') && line.includes('braindog.mjs.build'), line);
});

/** A process run to its end with this process's server still answering: `spawnSync` would hold the server still. */
function ran(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<{ status: number | null; said: string }> {
  return new Promise((done) => {
    const child = spawn(command, args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let said = '';
    child.stdout.on('data', (b) => (said += String(b)));
    child.stderr.on('data', (b) => (said += String(b)));
    child.on('close', (status) => done({ status, said }));
  });
}

/** `install.sh` as the deploy serves it, at this server and with this pin, run in a home of its own. */
async function runSh(root: string, base: string, pin: string): Promise<{ status: number | null; said: string; installed: string }> {
  const home = join(root, 'home');
  mkdirSync(home, { recursive: true });
  const script = join(root, 'install.sh');
  writeFileSync(
    script,
    readFileSync(repo('apps/site/static/cli/install.sh'), 'utf8')
      .replace(/^BASE=.*$/mu, `BASE='${base}'`)
      .replace(/^PIN=.*$/mu, `PIN='${pin}'`),
  );
  const out = await ran('sh', [script], { ...process.env, HOME: home, SHELL: '/bin/sh', [RAN]: join(root, 'ran') });
  return { ...out, installed: join(home, '.braindog', 'bin', 'braindog.mjs') };
}

test('install.sh TAKES A SIGNED BUILD, REFUSES AN UNSIGNED ONE AND ANOTHER KEY\'S BEFORE IT RUNS THEM, AND HOLDS TO THE SUM WITH NO PIN', { skip: process.platform === 'win32' }, async (t) => {
  const key = pair();
  const stranger = pair();
  const body = bundle(NEW);

  const good = scratch(t);
  const signed = await runSh(good, await serve(t, served(body, key.signs(sha(body), NEW))), key.x);
  assert.equal(signed.status, 0, signed.said);
  assert.equal(readFileSync(signed.installed, 'utf8'), body);

  /* A KEY PINNED BESIDE THE ONE THAT SIGNED, as the release that moves between two has. */
  const two = scratch(t);
  const either = await runSh(two, await serve(t, served(body, key.signs(sha(body), NEW))), `${stranger.x} ${key.x}`);
  assert.equal(either.status, 0, either.said);

  for (const [why, sig, says] of [
    ['unsigned', undefined, /no signature/u],
    ['a stranger signed it', stranger.signs(sha(body), NEW), /not BrainDog's/u],
    ['another build', key.signs(sha(body), OLD), /not BrainDog's/u],
  ] as const) {
    const root = scratch(t);
    const out = await runSh(root, await serve(t, served(body, sig)), key.x);
    assert.notEqual(out.status, 0, `${why}: ${out.said}`);
    assert.match(out.said, says, why);
    assert.equal(existsSync(out.installed), false, `${why}: it was installed`);
    assert.equal(existsSync(join(root, 'ran')), false, `${why}: it ran`);
  }

  const none = scratch(t);
  const unpinned = await runSh(none, await serve(t, served(body)), '');
  assert.equal(unpinned.status, 0, unpinned.said);
});

test('install.ps1 DOES THE SAME, WHERE THIS MACHINE HAS PowerShell', { skip: spawnSync('pwsh', ['-v']).status !== 0 ? 'no pwsh here' : false }, async (t) => {
  const key = pair();
  const stranger = pair();
  const body = bundle(NEW);
  const run = async (root: string, base: string, pin: string) => {
    const home = join(root, 'home');
    mkdirSync(home, { recursive: true });
    const script = join(root, 'install.ps1');
    writeFileSync(
      script,
      readFileSync(repo('apps/site/static/cli/install.ps1'), 'utf8')
        .replace(/^ {2}\$base = .*$/mu, `  $base = '${base}'`)
        .replace(/^ {2}\$pin = .*$/mu, `  $pin = '${pin}'`),
    );
    const out = await ran('pwsh', ['-NoProfile', '-File', script], { ...process.env, HOME: home, [RAN]: join(root, 'ran') });
    return { said: out.said, installed: join(home, '.braindog', 'bin', 'braindog.mjs') };
  };
  const signed = await run(scratch(t), await serve(t, served(body, key.signs(sha(body), NEW))), key.x);
  assert.equal(readFileSync(signed.installed, 'utf8'), body, signed.said);
  for (const [why, sig, says] of [
    ['unsigned', undefined, /no signature/u],
    ['a stranger signed it', stranger.signs(sha(body), NEW), /not BrainDog's/u],
  ] as const) {
    const root = scratch(t);
    const out = await run(root, await serve(t, served(body, sig)), key.x);
    assert.match(out.said, says, `${why}: ${out.said}`);
    assert.equal(existsSync(out.installed), false, `${why}: it was installed`);
    assert.equal(existsSync(join(root, 'ran')), false, `${why}: it ran`);
  }
});

/* ─── the two tools, over a copy of the files they write and a `security` that keeps its item in a file ─── */

const PINS = /RELEASE_KEYS: readonly string\[\] = \[(.*)\]/u;

function tree(t: { after: (f: () => void) => void }, opts: { keeps?: boolean; locked?: boolean } = {}) {
  const root = scratch(t);
  for (const path of ['apps/cli/src/release-key.ts', 'apps/cli/README.md', 'apps/site/static/cli/install.sh', 'apps/site/static/cli/install.ps1']) {
    mkdirSync(join(root, path, '..'), { recursive: true });
    cpSync(repo(path), join(root, path));
  }
  mkdirSync(join(root, 'apps/cli/dist'), { recursive: true });
  writeFileSync(join(root, 'apps/cli/dist/braindog.mjs'), bundle(NEW));
  writeFileSync(join(root, 'apps/cli/dist/braindog.mjs.build'), `${NEW}\n`);
  writeFileSync(join(root, 'apps/cli/dist/braindog.mjs.released'), `${AT}\n`);
  const bin = join(root, 'bin');
  mkdirSync(bin);
  const kept = join(root, 'kept-key');
  const argvLog = join(root, 'argv');
  /* `add-generic-password` WITH NO -U REFUSES A DUPLICATE, as the real one was seen to on a throwaway keychain. */
  writeFileSync(
    join(bin, 'security'),
    `#!/bin/sh
printf '%s\\n' "$*" >> '${argvLog}'
case "$1" in
  -i)
    while IFS= read -r line; do
      case "$line" in
        add-generic-password*-U*) printf 'overwrite\\n' >> '${argvLog}' ;;
        add-generic-password*)
          ${opts.keeps === false ? ':' : `[ -f '${kept}' ] || { v="\${line##*-w \\"}"; printf '%s' "\${v%\\"}" > '${kept}'; }`}
          ;;
      esac
    done
    exit 0
    ;;
  find-generic-password)
    [ -f '${kept}' ] || exit 44
    case "$*" in
      *-w*) ${opts.locked ? 'exit 36' : `cat '${kept}'; echo`} ;;
      *) echo 'attributes of the item' ;;
    esac
    ;;
esac
`,
  );
  chmodSync(join(bin, 'security'), 0o755);
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH ?? ''}`, BRAINDOG_SIGN_ROOT: root };
  const tool = (name: string, ...args: string[]) => {
    const out = spawnSync(process.execPath, [repo(`tools/ship/${name}`), ...args], { encoding: 'utf8', env });
    return { status: out.status, said: `${out.stdout}${out.stderr}` };
  };
  const pins = () => PINS.exec(readFileSync(join(root, 'apps/cli/src/release-key.ts'), 'utf8'))?.[1] ?? '';
  return { root, kept, argvLog, tool, pins, sig: join(root, 'apps/cli/dist/braindog.mjs.sig') };
}

test('NO KEY MADE: SIGNING STOPS AND SAYS THE ONE COMMAND, AND THE DEPLOY\'S CHECK SAYS THE SAME AND OPENS NOTHING', (t) => {
  const w = tree(t);
  for (const args of [[], ['--check']]) {
    const out = w.tool('cli-sign.mjs', ...args);
    assert.equal(out.status, 1, args.join());
    assert.match(out.said, /^ {2}node tools\/ship\/cli-key\.mjs$/mu);
    assert.match(out.said, /nothing was published/u);
  }
  assert.doesNotMatch(readFileSync(w.argvLog, 'utf8'), /-w/u, 'the value was asked for with no key made');
  assert.equal(existsSync(w.sig), false);
});

test('MAKING THE KEY KEEPS THE PRIVATE HALF IN THE KEYCHAIN, OFF EVERY ARGUMENT AND OFF THE SCREEN, AND PINS THE PUBLIC HALF; THEN A BUILD SIGNS AND VERIFIES', async (t) => {
  const w = tree(t);
  const made = w.tool('cli-key.mjs');
  assert.equal(made.status, 0, made.said);
  const held = readFileSync(w.kept, 'utf8').trim();
  assert.ok(held.length > 40, 'nothing was kept');
  assert.ok(!made.said.includes(held), 'the private key was printed');
  assert.ok(!readFileSync(w.argvLog, 'utf8').includes(held), 'the private key was on an argument, where ps shows it');
  assert.ok(!readFileSync(w.argvLog, 'utf8').includes('overwrite'), 'it asked security to replace an item');
  const x = /'([^']+)'/u.exec(w.pins())?.[1];
  assert.ok(x);
  assert.ok(made.said.includes(x), 'the public key was not said');
  assert.ok(readFileSync(join(w.root, 'apps/site/static/cli/install.sh'), 'utf8').includes(`PIN='${x}'`));
  assert.ok(readFileSync(join(w.root, 'apps/site/static/cli/install.ps1'), 'utf8').includes(`$pin = '${x}'`));
  assert.ok(readFileSync(join(w.root, 'apps/cli/README.md'), 'utf8').includes(`<!-- release-keys -->\n- \`${x}\`\n<!-- /release-keys -->`), 'the published list does not name it');

  assert.equal(w.tool('cli-sign.mjs', '--check').status, 0);
  const signing = w.tool('cli-sign.mjs');
  assert.equal(signing.status, 0, signing.said);
  assert.ok(!signing.said.includes(held), 'the private key was printed');
  const line = readFileSync(w.sig, 'utf8');
  const sig = readSignature(line);
  assert.equal(sig?.released, AT);
  assert.equal(signedBy([x], sha(bundle(NEW)), NEW, AT, sig!.signature), true);

  /* AND A PINNED COMMAND TAKES WHAT THE TOOL SIGNED. */
  const run = machine(scratch(t), await serve(t, served(bundle(NEW), line.trim())), [x]);
  assert.equal(await update([], run), 0, run.refused.join('\n'));
});

test('IT NEVER REPLACES AN ITEM, AND A SECOND KEY IS MADE WHERE NONE IS HELD AND STANDS BESIDE THE FIRST', (t) => {
  const w = tree(t);
  assert.equal(w.tool('cli-key.mjs').status, 0);
  const first = readFileSync(w.kept, 'utf8');
  const pinned = w.pins();
  for (const args of [[], ['--again']]) {
    const out = w.tool('cli-key.mjs', ...args);
    assert.equal(out.status, 1, args.join());
    assert.equal(readFileSync(w.kept, 'utf8'), first, 'the item was replaced');
    assert.equal(w.pins(), pinned);
  }
  /* A SECOND MAC, which holds no item, and the same tree. */
  rmSync(w.kept);
  const second = w.tool('cli-key.mjs', '--again');
  assert.equal(second.status, 0, second.said);
  assert.equal(w.pins().split(',').length, 2);
  assert.ok(w.pins().startsWith(pinned), 'the first key went');
  /* AND EITHER MAC SIGNS. */
  assert.equal(w.tool('cli-sign.mjs').status, 0);
  rmSync(w.sig);
  writeFileSync(w.kept, first);
  assert.equal(w.tool('cli-sign.mjs').status, 0);
});

test('A PIN WITH NO ITEM, OR ANOTHER KEY IN THE ITEM, OR A LOCKED KEYCHAIN, STOPS THE SIGNING AND PUBLISHES NOTHING', (t) => {
  const w = tree(t);
  assert.equal(w.tool('cli-key.mjs').status, 0);
  rmSync(w.kept);
  for (const args of [[], ['--check']]) {
    const gone = w.tool('cli-sign.mjs', ...args);
    assert.equal(gone.status, 1);
    assert.match(gone.said, /^ {2}node tools\/ship\/cli-key\.mjs --again$/mu);
    assert.match(gone.said, /nothing was published/u);
  }
  writeFileSync(w.kept, pair().der);
  const other = w.tool('cli-sign.mjs');
  assert.equal(other.status, 1);
  assert.match(other.said, /not a key pinned/u);
  writeFileSync(w.kept, 'not a key');
  assert.equal(w.tool('cli-sign.mjs').status, 1);
  assert.equal(existsSync(w.sig), false);

  const locked = tree(t, { locked: true });
  writeFileSync(join(locked.root, 'apps/cli/src/release-key.ts'), readFileSync(join(locked.root, 'apps/cli/src/release-key.ts'), 'utf8').replace(PINS, `RELEASE_KEYS: readonly string[] = ['${pair().x}']`));
  writeFileSync(locked.kept, pair().der);
  const shut = locked.tool('cli-sign.mjs');
  assert.equal(shut.status, 1);
  assert.match(shut.said, /did not open/u);
});

test('AN ITEM WITH NO PIN IN THIS TREE SAYS TO COMMIT, AND MAKES NOTHING', (t) => {
  const w = tree(t);
  writeFileSync(w.kept, pair().der);
  const out = w.tool('cli-sign.mjs');
  assert.equal(out.status, 1);
  assert.match(out.said, /^ {2}git add /mu);
});

test('A KEYCHAIN THAT DID NOT KEEP THE KEY PINS NOTHING, WHATEVER `security -i` ANSWERED', (t) => {
  const w = tree(t, { keeps: false });
  const out = w.tool('cli-key.mjs');
  assert.equal(out.status, 1);
  assert.match(out.said, /did not keep the key/u);
  assert.equal(w.pins(), '');
  assert.match(readFileSync(join(w.root, 'apps/cli/README.md'), 'utf8'), /None yet/u);
});

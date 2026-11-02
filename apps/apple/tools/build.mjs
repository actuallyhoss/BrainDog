/**
 * Build the apps, and run them on this Mac.
 *
 *   node apps/apple/tools/build.mjs check                 both apps, unsigned: the iPhone app for the simulator, the Mac app
 *   node apps/apple/tools/build.mjs sim [--server URL]    the iPhone app, Debug, on the one booted simulator, launched
 *   node apps/apple/tools/build.mjs mac [--server URL]    the Mac app, Debug, signed to run locally, launched
 *
 * `--server` points a Debug build at another host (the seed: `http://localhost:5183`, `tools/dev.mjs`); a Release
 * build ignores it. The project is generated first (`xcodegen generate`), because it is never committed.
 *
 * ONE SIMULATOR, EVER. `sim` refuses to start when more than one is booted, and boots "iPhone 18 Pro" only when none is.
 * Until Xcode is signed in to the team, nothing here signs with it: `check` builds with signing off, and the runs sign
 * to run locally, which the simulator and this Mac accept and nothing else does.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { argv, exit } from 'node:process';

const apple = join(import.meta.dirname, '..');
const derived = join(apple, 'build', 'dd');
const project = join(apple, 'BrainDog.xcodeproj');
const DEVICE = 'iPhone 18 Pro';

const [mode = 'check', ...rest] = argv.slice(2);
const at = rest.indexOf('--server');
const server = at >= 0 ? rest[at + 1] : null;
/* `--press email:<address>` and the like: a Debug build presses Sign in's buttons at launch (BrainDogApp.swift). */
const pressAt = rest.indexOf('--press');
const press = pressAt >= 0 ? rest[pressAt + 1] : null;
/* `--launch`: launch what was built last, again, without building. */
const again = rest.includes('--launch');

function run(cmd, args, opts = {}) {
  const out = spawnSync(cmd, args, { cwd: apple, stdio: opts.quiet ? 'pipe' : 'inherit', encoding: 'utf8', ...opts });
  if (out.status !== 0) {
    if (opts.quiet) process.stderr.write(`${out.stdout ?? ''}${out.stderr ?? ''}`.split('\n').filter((l) => /error:|BUILD FAILED/.test(l)).join('\n') + '\n');
    throw new Error(`${cmd} ${args.slice(0, 3).join(' ')} failed`);
  }
  return out.stdout ?? '';
}

const generate = () => run('xcodegen', ['generate', '--quiet']);

function build(scheme, destination, signing) {
  const sign = signing === 'none' ? ['CODE_SIGNING_ALLOWED=NO'] : ['CODE_SIGN_IDENTITY=-', 'CODE_SIGN_STYLE=Manual', 'DEVELOPMENT_TEAM=', 'PROVISIONING_PROFILE_SPECIFIER='];
  run('xcodebuild', ['-project', project, '-scheme', scheme, '-destination', destination, '-configuration', 'Debug', '-derivedDataPath', derived, ...sign, 'build'], { quiet: true });
  console.log(`  built ${scheme} for ${destination}${signing === 'none' ? ', unsigned' : ', signed to run locally'}`);
}

function booted() {
  const list = JSON.parse(execFileSync('xcrun', ['simctl', 'list', 'devices', 'booted', '-j'], { encoding: 'utf8' }));
  return Object.values(list.devices).flat();
}

try {
  if (!again) generate();
  if (mode === 'check') {
    /* (generated above) */
    build('BrainDog', 'generic/platform=iOS Simulator', 'none');
    build('BrainDogMac', 'platform=macOS', 'none');
  } else if (mode === 'sim') {
    let on = booted();
    if (on.length > 1) throw new Error(`${on.length} simulators are booted (${on.map((d) => d.name).join(', ')}); shut all but one down first.`);
    if (on.length === 0) {
      run('xcrun', ['simctl', 'boot', DEVICE]);
      on = booted();
    }
    const device = on[0];
    if (!again) {
      build('BrainDog', `platform=iOS Simulator,id=${device.udid}`, 'local');
      run('xcrun', ['simctl', 'install', device.udid, join(derived, 'Build', 'Products', 'Debug-iphonesimulator', 'BrainDog.app')]);
    }
    spawnSync('xcrun', ['simctl', 'terminate', device.udid, 'dog.brain.app']);
    run('xcrun', ['simctl', 'launch', device.udid, 'dog.brain.app', ...(server ? ['-braindogServer', server] : []), ...(press ? ['-braindogPress', press] : [])]);
    console.log(`  launched on ${device.name}`);
  } else if (mode === 'mac') {
    if (!again) build('BrainDogMac', 'platform=macOS', 'local');
    const app = join(derived, 'Build', 'Products', 'Debug', 'BrainDog.app');
    spawnSync('osascript', ['-e', 'quit app id "dog.brain.desktop"']);
    const args = [...(server ? ['-braindogServer', server] : []), ...(press ? ['-braindogPress', press] : [])];
    run('open', ['-n', app, ...(args.length ? ['--args', ...args] : [])]);
    console.log('  launched the Mac app');
  } else {
    throw new Error(`There is no mode called ${mode}: check, sim or mac.`);
  }
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  exit(1);
}

/**
 * The Mac app's screenshot walk (plan section 6), light and dark, into `.notes/shots/apps/m6/` under the main checkout.
 *
 *   node apps/apple/tools/dev.mjs                      the Cloud on this Mac, with a seeded record
 *   pnpm --filter @braindog/web dev                    the web app on 5183
 *   node apps/apple/tools/build.mjs mac --server http://localhost:5183 --press email:mina@the-studio.example
 *   node apps/apple/tools/build.mjs mac --server http://localhost:5183 --launch --press code:<the six digits>
 *   node apps/apple/tools/mac-shots.mjs [--only window,tell] [--themes light,dark]
 *
 * THE APP DRAWS ITS OWN PICTURES (`Mac/Shots.swift`), because a shell may not be allowed to record the screen: the
 * window at 1512 wide from the page's own snapshot with the traffic lights where AppKit holds them, the Tell and Settings
 * windows as AppKit draws them, the menu bar's panel by its own view. Each is saved in the app's container and copied
 * here. It relaunches only the Debug app it built (by its path), never another BrainDog that may be running.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { argv } from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';

const apple = join(import.meta.dirname, '..');
const rest = argv.slice(2);
const opt = (name) => {
  const at = rest.indexOf(`--${name}`);
  return at >= 0 ? rest[at + 1] : null;
};
const only = opt('only')?.split(',') ?? null;
const themes = (opt('themes') ?? 'light,dark').split(',');
const out = join(homedir(), 'Developer', 'braindog', '.notes', 'shots', 'apps', 'm6');
const made = join(homedir(), 'Library', 'Containers', 'dog.brain.desktop', 'Data', 'tmp', 'shots');
const app = join(apple, 'build', 'dd', 'Build', 'Products', 'Debug', 'BrainDog.app');
const binary = join(app, 'Contents', 'MacOS', 'BrainDog');

/** Each picture: its name, the launch press (`go:` steps joined by `;;`, three seconds apart), and how long to wait. */
const WALK = [
  ['window', 'size:1512x945;;/;;/;;shot:window', 16],
  ['window-needs', 'size:1512x945;;/decide;;/decide;;shot:window-needs', 16],
  ['window-money', 'size:1512x945;;/p/money;;/p/money;;shot:window-money', 16],
  ['tell', 'size:1200x760;;tell:Paid £120 for the domain renewal yesterday|New project: autumn fair|Call Nadia tomorrow;;window:Tell BrainDog=tell', 12],
  ['menubar', 'size:1200x760;;/;;panel:menubar', 10],
  ['settings', 'size:1200x760;;/;;settings;;window:Settings=settings', 14],
];

/** The Debug app this walk built, and nothing else, stopped by its own process id. */
function stopOurs() {
  const pids = spawnSync('pgrep', ['-f', binary], { encoding: 'utf8' }).stdout.split('\n').filter(Boolean);
  for (const pid of pids) spawnSync('kill', [pid]);
}

mkdirSync(out, { recursive: true });
for (const theme of themes) {
  for (const [name, press, wait] of WALK) {
    if (only && !only.includes(name)) continue;
    stopOurs();
    rmSync(join(made, `${name}.png`), { force: true });
    await sleep(800);
    execFileSync('open', ['-n', app, '--args', '-braindogServer', 'http://localhost:5183', '-braindogAppearance', theme, '-braindogPress', `go:${press}`]);
    await sleep(wait * 1000);
    const file = join(made, `${name}.png`);
    if (existsSync(file)) {
      copyFileSync(file, join(out, `${name}-${theme}.png`));
      console.log(`  ${name}-${theme}.png`);
    } else {
      console.log(`  ${name}-${theme}: not drawn`);
    }
  }
}
stopOurs();

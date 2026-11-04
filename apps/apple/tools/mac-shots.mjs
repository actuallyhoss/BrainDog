/**
 * The Mac app's screenshot walk (plan section 6), light and dark, into `.notes/shots/apps/m6/` under the main checkout.
 *
 *   node apps/apple/tools/dev.mjs                      the Cloud on this Mac, with a seeded record
 *   pnpm --filter @braindog/web dev                    the web app on 5183
 *   node apps/apple/tools/build.mjs mac --server http://localhost:5183 --press email:mina@the-studio.example
 *   node apps/apple/tools/build.mjs mac --server http://localhost:5183 --launch --press code:<the six digits>
 *   node apps/apple/tools/mac-shots.mjs [--only window,tell] [--themes light,dark] [--out m6] [--server http://localhost:5183]
 *
 * THE APP DRAWS ITS OWN PICTURES (`Mac/Shots.swift`), because a shell may not be allowed to record the screen: the
 * window at 1512 wide from the page's own snapshot with the traffic lights where AppKit holds them, the Tell and Settings
 * windows as AppKit draws them, the menu bar's panel by its own view. Each is saved in the app's container and copied
 * here. It relaunches only the Debug app it built (by its path), never another BrainDog that may be running.
 *
 * IT NEVER TAKES THE MAC FROM THE PERSON AT IT: each launch is in the background (`open -g`, `-braindogQuiet YES`), the app
 * never brings itself forward, its windows are clear and deaf to the mouse, and the quick panel never takes the keys.
 * The native pictures (the panel, Settings, Tell, offline) draw so; the window's page does not (WebKit answers nothing
 * for an app opened in the background), so `window*` need `--front`, run only when nobody is using the Mac.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
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
/* `--out m6`, a folder under the notes; an absolute path is used as it is. */
const out = isAbsolute(opt('out') ?? '') ? opt('out') : join(homedir(), 'Developer', 'braindog', '.notes', 'shots', 'apps', opt('out') ?? 'm6');
const server = opt('server') ?? 'http://localhost:5183';
/* `--front`: launch in front as a person would, for the window's page shots (WebKit draws no page for an app opened in
   the background). Only when nobody is using the Mac: each launch takes the front. */
const front = rest.includes('--front');
const made = join(homedir(), 'Library', 'Containers', 'dog.brain.desktop', 'Data', 'tmp', 'shots');
const app = join(apple, 'build', 'dd', 'Build', 'Products', 'Debug', 'BrainDog.app');
const binary = join(app, 'Contents', 'MacOS', 'BrainDog');

/** Each picture: its name, the launch press (`go:` steps joined by `;;`, three seconds apart), and how long to wait. */
const WALK = [
  ['window', 'size:1512x945;;/;;/;;shot:window', 16],
  ['window-needs', 'size:1512x945;;/decide;;/decide;;shot:window-needs', 16],
  ['window-money', 'size:1512x945;;/p/money;;/p/money;;shot:window-money', 16],
  ['window-project', 'size:1512x945;;/p/tidepool;;/p/tidepool;;shot:window-project', 16],
  ['window-person', 'size:1512x945;;/r/people/8;;/r/people/8;;shot:window-person', 16],
  ['window-tasks', 'size:1512x945;;/r/tasks;;/r/tasks;;shot:window-tasks', 16],
  ['window-settings', 'size:1512x945;;/settings/appearance;;/settings/appearance;;shot:window-settings', 16],
  ['window-search', 'size:1512x945;;/;;/;;search;;shot:window-search', 16],
  ['window-small', 'size:900x600;;/;;/;;shot:window-small', 16],
  ['tell', 'size:1200x760;;tell:Paid £120 for the domain renewal yesterday|New project: autumn fair|Call Nadia tomorrow;;window:Tell BrainDog=tell', 12],
  ['menubar', 'size:1200x760;;/;;panel:menubar', 10],
  ['settings', 'size:1200x760;;/;;settings;;window:General=settings', 14],
  ['settings-shortcut', 'size:1200x760;;/;;settings:shortcut;;window:Shortcut=settings-shortcut', 14],
  ['settings-signing-in', 'size:1200x760;;/;;settings:signing-in;;window:Signing in=settings-signing-in', 14],
  ['quick-tell', 'size:1200x760;;/;;quick:tell:Paid £120 for the domain renewal yesterday|Call Nadia tomorrow about the autumn fair;;quickshot:quick-tell', 14],
  ['quick-search', 'size:1200x760;;/;;quick:search:brand;;quickshot:quick-search', 14],
  ['quick-added', 'size:1200x760;;/;;quick:tell:Paid £120 for the domain renewal yesterday;;quick:add;;quickshot:quick-added', 17],
  /* NOTHING ANSWERS ON THIS PORT, so the first load reaches nothing and the window says so. */
  ['offline', 'size:1512x945;;/;;offlineshot:offline', 14, 'http://localhost:9'],
];

/** The Debug app this walk built, and nothing else, stopped by its own process id. */
function stopOurs() {
  const pids = spawnSync('pgrep', ['-f', binary], { encoding: 'utf8' }).stdout.split('\n').filter(Boolean);
  for (const pid of pids) spawnSync('kill', [pid]);
}

mkdirSync(out, { recursive: true });
for (const theme of themes) {
  for (const [name, press, wait, host] of WALK) {
    if (only && !only.includes(name)) continue;
    stopOurs();
    rmSync(join(made, `${name}.png`), { force: true });
    await sleep(800);
    execFileSync('open', [...(front ? [] : ['-g']), '-n', app, '--args', '-braindogServer', host ?? server, '-braindogAppearance', theme, ...(front ? [] : ['-braindogQuiet', 'YES']), '-braindogPress', `go:${press}`]);
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

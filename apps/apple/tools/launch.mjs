/**
 * How long the iPhone app takes from launch to the first picture and to the page's own first draw, cold, on the one
 * booted simulator, against whatever `--server` serves. It reads the app's Debug marks (`LaunchMark`, the wall's clock).
 *
 *   node apps/apple/tools/launch.mjs --server http://localhost:5183 [--times 6]
 *
 * A press that does nothing goes on the launch line, so the system's notification ask stays away.
 * "shell" is the app's own first view; "drawn" the first web screen on screen, with its kept picture if it has one;
 * "ready" the page saying it has drawn. Each run relaunches the app; the first is dropped, since it fills the caches.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { argv } from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';

const opt = (name, or) => {
  const at = argv.indexOf(`--${name}`);
  return at >= 0 ? argv[at + 1] : or;
};
const server = opt('server', 'http://localhost:5183');
const times = Number(opt('times', 6));
const sim = (...args) => execFileSync('xcrun', ['simctl', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const data = sim('get_app_container', 'booted', 'dog.brain.app', 'data');
const marks = join(data, 'tmp', 'launch-marks.txt');
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const runs = [];

for (let i = 0; i <= times; i++) {
  spawnSync('xcrun', ['simctl', 'terminate', 'booted', 'dog.brain.app']);
  rmSync(marks, { force: true });
  await sleep(1500);
  const t0 = Date.now() / 1000;
  sim('launch', 'booted', 'dog.brain.app', '-braindogServer', server, '-braindogPress', 'none');
  await sleep(8000);
  /* LEAVING THE APP SAVES ITS PICTURE, as a person leaving does, so the next launch has one. */
  sim('launch', 'booted', 'com.apple.Preferences');
  await sleep(1200);
  const lines = readFileSync(marks, 'utf8').trim().split('\n').map((l) => [Number(l.slice(0, l.indexOf(' '))), l.slice(l.indexOf(' ') + 1)]);
  const at = (word) => lines.find(([, what]) => what.startsWith(word))?.[0];
  const ms = (t) => (t === undefined ? null : Math.round((t - t0) * 1000));
  runs.push({ shell: ms(at('root')), drawn: ms(at('drawn')), ready: ms(at('ready')), picture: lines.some(([, w]) => w.includes('with its picture')) });
  console.log(`  ${JSON.stringify(runs.at(-1))}`);
}
const kept = runs.slice(1);
for (const key of ['shell', 'drawn', 'ready']) console.log(`${key}: median ${median(kept.map((r) => r[key] ?? 0))} ms`);

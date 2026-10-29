/**
 * The outside watch on his Mac, once an hour through launchd (LAUNCH 108 "an uptime check").
 *
 *   node tools/watch/mac.mjs run [--host <name>]   ask now; a miss is a macOS notice (a forced miss with --host)
 *   node tools/watch/mac.mjs install               write ~/Library/LaunchAgents/dog.brain.watch.plist and load it
 *   node tools/watch/mac.mjs uninstall             unload it and remove the file
 *   node tools/watch/mac.mjs plist                 print the job without writing it
 *
 * WHY HIS MAC: `watch.yml` runs by hand only since 15 October, when CI and the deploy moved to this machine, so nothing
 * watched brain.dog. His Mac is outside Cloudflare, as GitHub's machines were. It sleeps, so an hour can be missed: the
 * run after it says how long the gap was, and launchd runs once on wake for the hours it slept through.
 *
 * THE SAME SEVEN QUESTIONS (`launch.mjs`). Question 3 reads the deploys `tools/ship/deploy.mjs` logged in `.ship/logs`
 * here, since none run on GitHub now. Read-only: it asks brain.dog and reads this checkout, and writes only its own log
 * and `.ship/watch.json` (when it last ran and whether that run missed).
 *
 * A MISS IS A NOTICE WITH A SOUND, the first miss's sentence in it, every hour until it answers again, and then one
 * notice saying it is back. Every run is appended to `.ship/logs/watch.log`.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, appendFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import watch, { hostInput, namesOf, shipRuns } from './launch.mjs';
import { siteConfig, wranglerConfig } from '../../apps/worker/scripts/provision-check.mjs';

export const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
export const LABEL = 'dog.brain.watch';
export const PLIST = join(homedir(), 'Library', 'LaunchAgents', `${LABEL}.plist`);
/* `WATCH_SHIP` POINTS IT AT ANOTHER `.ship`, for a run from a worktree against the main checkout's deploys. */
const SHIP = process.env.WATCH_SHIP ? resolve(process.env.WATCH_SHIP) : join(ROOT, '.ship');
const STATE = join(SHIP, 'watch.json');
const LOG = join(SHIP, 'logs', 'watch.log');

const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The launchd job: this node, this checkout, every hour and once at load. Pure, so the test reads it. */
export function plistText({ node = process.execPath, root = ROOT } = {}) {
  const args = [node, join(root, 'tools/watch/mac.mjs'), 'run'].map((a) => `    <string>${xml(a)}</string>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
${args}
  </array>
  <key>WorkingDirectory</key>
  <string>${xml(root)}</string>
  <key>StartInterval</key>
  <integer>3600</integer>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${xml(join(root, '.ship/logs/watch.launchd.log'))}</string>
  <key>StandardErrorPath</key>
  <string>${xml(join(root, '.ship/logs/watch.launchd.log'))}</string>
</dict>
</plist>
`;
}

/** The deploy logs in `.ship/logs`, `{ name: text }`, and whether a deploy holds the lock now. */
export function shipLogs(ship = SHIP) {
  const dir = join(ship, 'logs');
  const files = {};
  if (existsSync(dir))
    for (const name of readdirSync(dir).filter((n) => /^deploy-\d/.test(n))) {
      const file = join(dir, name, 'deploy.log');
      if (existsSync(file)) files[name] = readFileSync(file, 'utf8');
    }
  return { files, locked: existsSync(join(ship, 'deploy.lock')) };
}

/** What the notice says for one run: null when nothing needs saying. */
export function noticeOf(lines, code, before) {
  const host = /watch: (\S+), from outside/.exec(lines.join('\n'))?.[1] ?? 'brain.dog';
  if (code === 0) return before?.missed ? { title: `${host} is back`, body: 'The watch asked again and all seven answered.' } : null;
  const at = lines.findIndex((l) => /^\s+MISS\s/.test(l));
  const first = at === -1 ? 'the watch could not run' : `${lines[at].trim().replace(/^MISS\s+/, '')}: ${(lines[at + 1] ?? '').trim()}`;
  const missed = /, (\d+) missed$/.exec(lines.at(-1) ?? '')?.[1] ?? '';
  return { title: `${host}: ${missed ? `${missed} missed` : 'the watch is red'}`, body: first };
}

/** A macOS notice with a sound. The words go in as arguments, never into the script. */
function notify({ title, body }) {
  spawnSync('osascript', ['-e', 'on run argv', '-e', 'display notification (item 2 of argv) with title (item 1 of argv) sound name "Basso"', '-e', 'end run', title, body]);
}

const readState = () => {
  try {
    return JSON.parse(readFileSync(STATE, 'utf8'));
  } catch {
    return null;
  }
};

async function run(hostSaid) {
  mkdirSync(join(SHIP, 'logs'), { recursive: true });
  const before = readState();
  const { files, locked } = shipLogs();
  const lines = [];
  const now = Date.now();
  let code;
  try {
    const host = hostInput(hostSaid);
    code = await watch({ names: namesOf(wranglerConfig(), 'production', host, siteConfig()), github: { deploys: { runs: shipRuns(files, locked) }, lastWatch: before?.at ?? null }, log: (l) => lines.push(l), now });
  } catch (err) {
    lines.push(`  watch: ${err instanceof Error ? err.message : String(err)}`);
    code = 1;
  }
  for (const l of lines) console.log(l);
  appendFileSync(LOG, `${new Date(now).toISOString()}\n${lines.join('\n')}\n`);
  const notice = noticeOf(lines, code, before);
  if (notice) notify(notice);
  /* A FORCED MISS IS NOT THE STATE: a run with --host leaves the hourly one's last time and verdict alone. */
  if (!hostSaid) writeFileSync(STATE, `${JSON.stringify({ at: new Date(now).toISOString(), missed: code !== 0 })}\n`);
  return code;
}

const launchctl = (...args) => spawnSync('launchctl', args, { encoding: 'utf8' });

if (import.meta.main) {
  const [verb = 'run', ...rest] = process.argv.slice(2);
  const at = rest.indexOf('--host');
  if (verb === 'run') process.exitCode = await run(at === -1 ? '' : rest[at + 1]);
  else if (verb === 'plist') process.stdout.write(plistText());
  else if (verb === 'install') {
    mkdirSync(join(homedir(), 'Library', 'LaunchAgents'), { recursive: true });
    mkdirSync(join(SHIP, 'logs'), { recursive: true });
    writeFileSync(PLIST, plistText());
    const domain = `gui/${process.getuid()}`;
    launchctl('bootout', `${domain}/${LABEL}`);
    const r = launchctl('bootstrap', domain, PLIST);
    console.log(r.status === 0 ? `  watch: ${PLIST} loaded; it asks now and every hour, and a miss is a notice` : `  watch: launchctl bootstrap said ${r.stderr.trim()}`);
    process.exitCode = r.status ?? 1;
  } else if (verb === 'uninstall') {
    launchctl('bootout', `gui/${process.getuid()}/${LABEL}`);
    rmSync(PLIST, { force: true });
    console.log(`  watch: ${LABEL} unloaded and removed`);
  } else {
    console.error('mac.mjs takes run [--host <name>], install, uninstall or plist.');
    process.exitCode = 2;
  }
}

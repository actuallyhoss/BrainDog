/**
 * The simulator screenshot walk (plan section 6), light and dark, into `.notes/shots/apps/<milestone>/` under the main
 * checkout (never the tracked tree).
 *
 *   node apps/apple/tools/dev.mjs                      the Cloud on this Mac, with a seeded record
 *   pnpm --filter @braindog/web dev                    the web app on 5183
 *   node apps/apple/tools/build.mjs sim --server http://localhost:5183 --press email:mina@the-studio.example
 *   node apps/apple/tools/build.mjs sim --server http://localhost:5183 --launch --press code:<the six digits>
 *   node apps/apple/tools/shots.mjs m2 [--only today,needs] [--themes light,dark]
 *
 * ONE SIMULATOR, THE ONE BOOTED. It refuses when none or more than one is booted, and it builds nothing: it relaunches
 * what `build.mjs sim` last installed, signed in, with a Debug launch press per screen (`BrainDogApp.swift`, `Links`),
 * which calls exactly what the screen's controls call. The status bar reads 9:41 and full.
 *
 * A step may write to the record (Add, an answer): the seed is a dev record on this Mac and nothing else.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { argv, exit } from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';

const apple = join(import.meta.dirname, '..');
const [milestone = 'm2', ...rest] = argv.slice(2);
const opt = (name) => {
  const at = rest.indexOf(`--${name}`);
  return at >= 0 ? rest[at + 1] : null;
};
const only = opt('only')?.split(',') ?? null;
const themes = (opt('themes') ?? 'light,dark').split(',');
const out = join(homedir(), 'Developer', 'braindog', '.notes', 'shots', 'apps', milestone);

/** Each screen: its name, the launch press (`go:` steps joined by `;;`, three seconds apart), and how long to wait. */
const WALKS = {
  m2: [
    ['today', 'go:tab:/', 9],
    ['needs', 'go:tab:/decide', 8],
    ['card', 'go:/decide/SG3', 11],
    ['pushed-list', 'go:tab:/;;click:main a[href*="/r/"]', 13],
    ['money', 'go:tab:/p/money', 9],
    ['search-empty', 'go:search:', 8],
    ['search-results', 'go:search:brand', 10],
    ['account', 'go:account', 8],
    ['settings', 'go:settings', 8],
    ['settings-sessions', 'go:/settings/signing-in;;see:.sessions', 15],
  ],
  m3: [
    ['needs', 'go:tab:/decide', 8],
    ['later', 'go:tab:/decide;;later', 10],
    ['tell-empty', 'go:tell:', 7],
    ['tell-typed', 'go:tell:New project: autumn fair|Paid £120 for the domain renewal yesterday|Call Nadia tomorrow', 8],
    ['tell-ask', 'go:ask:What is due this week?', 7],
    ['tell-receipt', 'go:tell:New project: winter market|Call Nadia tomorrow;;tellAdd', 12],
    ['answered', 'go:tab:/decide;;answer', 10],
  ],
};

const walk = WALKS[milestone];
if (!walk) {
  console.error(`There is no walk called ${milestone}: ${Object.keys(WALKS).join(' or ')}.`);
  exit(1);
}

const booted = Object.values(JSON.parse(execFileSync('xcrun', ['simctl', 'list', 'devices', 'booted', '-j'], { encoding: 'utf8' })).devices).flat();
if (booted.length !== 1) {
  console.error(booted.length === 0 ? 'No simulator is booted: run build.mjs sim first.' : `${booted.length} simulators are booted; shut all but one down.`);
  exit(1);
}
const udid = booted[0].udid;
mkdirSync(out, { recursive: true });
spawnSync('xcrun', ['simctl', 'status_bar', udid, 'override', '--time', '9:41', '--batteryLevel', '100', '--batteryState', 'charged', '--cellularBars', '4', '--wifiBars', '3']);

for (const theme of themes) {
  spawnSync('xcrun', ['simctl', 'ui', udid, 'appearance', theme]);
  for (const [name, press, wait] of walk) {
    if (only && !only.includes(name)) continue;
    spawnSync('node', [join(apple, 'tools', 'build.mjs'), 'sim', '--server', 'http://localhost:5183', '--launch', '--press', press], { stdio: 'ignore' });
    await sleep(wait * 1000);
    const file = join(out, `${name}-${theme}.png`);
    spawnSync('xcrun', ['simctl', 'io', udid, 'screenshot', file], { stdio: 'ignore' });
    console.log(`  ${name}-${theme}.png`);
  }
}

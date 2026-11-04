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
import { mkdirSync, writeFileSync } from 'node:fs';
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
/* `--out <folder>`: where the pictures go, for a lane that keeps its own. */
const out = opt('out') ?? join(homedir(), 'Developer', 'braindog', '.notes', 'shots', 'apps', milestone);
/* `--server http://localhost:5203`: another lane's web dev server may hold 5183. */
const server = opt('server') ?? 'http://localhost:5183';

/** Each screen: its name, the launch press (`go:` steps joined by `;;`, three seconds apart), and how long to wait. */
const WALKS = {
  /* EVERY SCREEN ONCE, on Maya's demo record (`demo-record.mjs make`): what a polish pass looks at. */
  all: [
    ['today', 'go:tab:/', 9],
    ['today-end', 'go:tab:/;;end', 12],
    ['needs', 'go:tab:/decide', 8],
    ['card', 'go:tab:/decide;;openFirst', 13],
    ['money', 'go:tab:/p/money', 9],
    ['money-end', 'go:tab:/p/money;;end', 12],
    ['agents', 'go:tab:/p/agents', 9],
    ['projects', 'go:/p/portfolio', 11],
    ['project', 'go:/p/tidepool', 11],
    ['people', 'go:/p/people', 11],
    ['person', 'go:/r/people/8', 11],
    ['tasks', 'go:/r/tasks', 11],
    ['task', 'go:/r/tasks/13', 11],
    ['activity', 'go:/audit', 11],
    ['slash', 'go:/slash', 11],
    ['search-empty', 'go:search:', 8],
    ['search-results', 'go:search:north', 10],
    ['account', 'go:account', 8],
    ['settings', 'go:settings', 8],
    ['settings-area', 'go:/settings/notifications', 12],
    ['tell-empty', 'go:tell:', 7],
    ['tell-typed', 'go:tell:New project: autumn fair|Paid $120 for the domain renewal yesterday|Call June tomorrow', 8],
    ['ask', 'go:ask:What is due this week?', 7],
    ['widgets', 'go:widgets', 9],
    ['widgets2', 'go:widgets2', 9],
    ['share-link', 'go:share:Read before the launch https://www.example.com/spring-launch-checklist', 9],
    ['share-photo', 'go:share:Paid $34 for lunch with June today|photo', 9],
    ['lock-cover', 'go:tab:/;;lock', 8],
    ['attach', 'go:attach', 9],
    ['share-web', 'go:/p/tidepool;;click:.share-trigger', 14],
    ['send-web', 'go:/p/tidepool;;click:.sb-more', 14],
    ['refreshing', 'go:tab:/p/money;;refreshing', 12],
    ['bounce', 'go:tab:/;;offset:-260', 12],
  ],
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
  /* M5: the widgets and the share sheet are drawn by their own views in a Debug gallery over the app (`Gallery.swift`),
     since nobody can add a widget to a simulator's Home Screen or press Share in another app without a finger. */
  m5: [
    ['widgets', 'go:widgets', 9],
    ['share-link', 'go:share:Read before the launch|https://www.example.com/spring-launch-checklist', 9],
    ['share-photo', 'go:share:Paid £34 for lunch with Nadia today|photo', 9],
    ['tell-widget-opens', 'go:tab:/;;tellLink', 10],
  ],
  /* M4 and M5's second pass: a push as it lands (sent with `simctl push`, see PUSHES below), the native phone settings
     with Face ID lock and Say what it is about, the lock cover, the press-and-hold actions, and the new widgets. */
  ios4: [
    ['settings-phone', 'go:settings', 9],
    ['lock-cover', 'go:tab:/;;lock', 8],
    ['quick-tell', 'go:quick:tell', 8],
    ['quick-needs', 'go:quick:needs', 8],
    ['quick-search', 'go:quick:search', 8],
    ['widgets-due-number', 'go:widgets2', 9],
  ],
};

/* Pushes for the walk, shown on the lock screen and as a banner over the app: what Apple would carry (`apns.ts`). */
const PUSHES = {
  ios4: [
    ['push-question', { aps: { alert: { title: 'BrainDog', body: 'Something in your BrainDog needs you' }, sound: 'default', category: 'question', 'mutable-content': 1 }, open: '/decide/SG1', kind: 'needs' }],
    ['push-mention', { aps: { alert: { title: 'BrainDog', body: 'Someone mentioned you in a comment' }, sound: 'default', category: 'open', 'mutable-content': 1 }, open: '/decide/SG2/thread', kind: 'people' }],
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
    spawnSync('node', [join(apple, 'tools', 'build.mjs'), 'sim', '--server', server, '--launch', '--press', press], { stdio: 'ignore' });
    await sleep(wait * 1000);
    const file = join(out, `${name}-${theme}.png`);
    spawnSync('xcrun', ['simctl', 'io', udid, 'screenshot', file], { stdio: 'ignore' });
    console.log(`  ${name}-${theme}.png`);
  }
  for (const [name, payload] of PUSHES[milestone] ?? []) {
    if (only && !only.includes(name)) continue;
    spawnSync('node', [join(apple, 'tools', 'build.mjs'), 'sim', '--server', server, '--launch', '--press', 'go:tab:/'], { stdio: 'ignore' });
    await sleep(8000);
    const file = join(out, `${name}.apns`);
    writeFileSync(file, JSON.stringify(payload));
    spawnSync('xcrun', ['simctl', 'push', udid, 'dog.brain.app', file], { stdio: 'ignore' });
    await sleep(3000);
    spawnSync('xcrun', ['simctl', 'io', udid, 'screenshot', join(out, `${name}-${theme}.png`)], { stdio: 'ignore' });
    console.log(`  ${name}-${theme}.png`);
  }
}

/**
 * A job placed on a machine and under a Claude Code profile (migration 44): what a claim says of where this runner is,
 * and the environment a job under a profile runs in.
 *
 * EVERY FILE IS UNDER A TEMPORARY FOLDER and `home` is always passed, so no real profile is read. A folder never
 * reaches the record: a claim names profiles by name, and a refusal, which is posted to the record, names the profile
 * and never where it is.
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { claimArgs, seatEnv, seatsHere } from '../src/runner.ts';

const scratch = mkdtempSync(join(tmpdir(), 'braindog-seats-'));
after(() => rmSync(scratch, { recursive: true, force: true }));
let homes = 0;
const newHome = () => {
  const dir = join(scratch, `home-${String(homes++)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
};
/** A profile as `doctor` finds one: a folder with a `settings.json` in it. */
const profile = (home: string, ...parts: string[]): string => {
  const dir = join(home, ...parts);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'settings.json'), '{}\n');
  return dir;
};

test('A CLAIM NAMES THIS MACHINE AND ITS PROFILES BY NAME: the default one, each .claude-<name> and each ccenv profile', () => {
  const home = newHome();
  profile(home, '.claude');
  profile(home, '.claude-harbour');
  profile(home, '.ccenv', 'profiles', 'garden');
  const env = { HOME: home };
  assert.deepEqual([...seatsHere(home, env).keys()].sort(), ['default', 'garden', 'harbour']);
  const said = claimArgs(home, env, 'kiln-mbp');
  assert.deepEqual(said, { wait: 20, host: 'kiln-mbp', seats: ['default', 'garden', 'harbour'], repos: [] });
  assert.ok(!JSON.stringify(said).includes(home), 'no folder is in a claim');
  assert.equal(claimArgs(home, env, 'two words').host, undefined, 'a machine name outside the grammar is not sent');

  /* THE RUNNER'S OWN PROFILE IS ALWAYS ONE, settings or none. */
  const bare = newHome();
  assert.deepEqual(claimArgs(bare, { HOME: bare }, 'kiln-mbp').seats, ['default']);
});

test('~/.braindog/profiles.json, WHERE IT IS, NAMES THE PROFILES, with the runner’s own beside them', () => {
  const home = newHome();
  profile(home, '.claude-harbour');
  const garden = profile(home, '.ccenv', 'profiles', 'garden');
  mkdirSync(join(home, '.braindog'), { recursive: true });
  writeFileSync(join(home, '.braindog', 'profiles.json'), JSON.stringify({ profiles: [{ dir: garden }] }));
  assert.deepEqual([...seatsHere(home, { HOME: home }).keys()].sort(), ['default', 'garden']);
  assert.deepEqual([...seatsHere(home, { HOME: home, CLAUDE_CONFIG_DIR: garden }).keys()], ['garden'], 'one folder reached two ways is one profile');
});

test('A JOB UNDER A PROFILE RUNS WITH ITS FOLDER, the default one with none, and a job under none as the runner is', () => {
  const home = newHome();
  profile(home, '.claude');
  const harbour = profile(home, '.claude-harbour');
  const garden = profile(home, '.ccenv', 'profiles', 'garden');
  const env = { HOME: home, PATH: '/usr/bin', CLAUDE_CONFIG_DIR: garden };

  const q = seatEnv('harbour', home, env);
  assert.ok('env' in q);
  assert.equal(q.env.CLAUDE_CONFIG_DIR, harbour);
  assert.equal(q.env.PATH, '/usr/bin');
  assert.equal(q.seat, 'harbour');

  const d = seatEnv('default', home, env);
  assert.ok('env' in d);
  assert.equal(Object.hasOwn(d.env, 'CLAUDE_CONFIG_DIR'), false, 'Claude Code keeps the default profile only with the variable unset');

  const own = seatEnv(null, home, env);
  assert.ok('env' in own);
  assert.equal(own.env.CLAUDE_CONFIG_DIR, garden);
  assert.equal(own.seat, 'garden');
  assert.notEqual(own.env, env, 'the runner’s own environment is copied, never changed');
});

test('A PROFILE THIS MACHINE DOES NOT HAVE, OR HAS TWICE, IS REFUSED BY NAME, and the sentence names no folder', () => {
  const home = newHome();
  profile(home, '.claude-harbour');
  const env = { HOME: home };
  const none = seatEnv('brain', home, env);
  assert.ok('refused' in none);
  assert.match(none.refused, /no Claude Code profile called brain/u);
  assert.ok(!none.refused.includes(home));

  profile(home, '.ccenv', 'profiles', 'harbour');
  const two = seatEnv('harbour', home, env);
  assert.ok('refused' in two);
  assert.match(two.refused, /^Two Claude Code profiles on this machine are called harbour/u);
  assert.ok(!two.refused.includes(home));
});

/**
 * `braindog statusline`: the status JSON read defensively, the line it prints, the five minutes between beats for each
 * profile, a beat that holds a profile's name and figures and nothing else, and the meters written on the Profiles row.
 * No network: the beat is handed to a function the test holds, and the record is a stub of `ask`.
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { keepMeters } from '../src/profile-place.ts';
import { readBeat } from '../src/statusline-beat.ts';
import { placeStatusLine, statusLineEntry, statusLineIn, statuslineEntryIn } from '../src/statusline-place.ts';
import { beatOf, parseStatus, STATUS_EVERY_MS, statusFresh, statusline, statusLine, statusStamp, type StatusBeat } from '../src/statusline.ts';

const scratch = mkdtempSync(join(tmpdir(), 'braindog-statusline-'));
after(() => rmSync(scratch, { recursive: true, force: true }));
let n = 0;
const folder = () => {
  const dir = join(scratch, `h${String(n++)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
};

const NOW = Date.UTC(2026, 9, 22, 12);
const RESET = Math.floor((NOW + 90 * 60_000) / 1000);
const event = {
  model: { id: 'claude-x', display_name: 'Opus' },
  workspace: { current_dir: '/Users/rowan/Secret/client-work' },
  session_id: 'abc',
  transcript_path: '/Users/rowan/.claude/projects/x.jsonl',
  rate_limits: { five_hour: { used_percentage: 41.6, resets_at: RESET }, seven_day: { used_percentage: 83, resets_at: RESET + 86_400 } },
};

test('THE EVENT IS READ DEFENSIVELY: whole, partial, wrong types and not JSON at all', () => {
  assert.deepEqual(parseStatus(JSON.stringify(event)), { model: 'Opus', folder: 'client-work', five: 42, seven: 83, resets: RESET * 1000 });
  assert.deepEqual(parseStatus('{}'), { model: null, folder: null, five: null, seven: null, resets: null });
  assert.deepEqual(parseStatus('not json'), { model: null, folder: null, five: null, seven: null, resets: null });
  assert.deepEqual(parseStatus(''), { model: null, folder: null, five: null, seven: null, resets: null });
  const odd = parseStatus(JSON.stringify({ model: 7, workspace: 'x', rate_limits: { five_hour: { used_percentage: 'lots' }, seven_day: { used_percentage: 250, resets_at: '2026-10-25T08:00:00Z' } } }));
  assert.deepEqual([odd.model, odd.folder, odd.five, odd.seven, odd.resets], [null, null, null, 100, Date.parse('2026-10-25T08:00:00Z')]);
});

test('THE LINE: model, folder, both figures and the reset, and only what the event had', () => {
  const line = statusLine(parseStatus(JSON.stringify(event)), NOW);
  assert.match(line, /^Opus \| client-work \| 5h 42% \| 7d 83% \| resets \d\d:\d\d$/u);
  assert.equal(statusLine(parseStatus('{}'), NOW), '');
  assert.equal(statusLine(parseStatus(JSON.stringify({ model: { display_name: 'Haiku' } })), NOW), 'Haiku');
});

test('THE BEAT: once in five minutes for each profile, never for an event with no figure, and none of the others', () => {
  const home = folder();
  const sent: StatusBeat[] = [];
  const draw = (profile: string, at: number, raw: string = JSON.stringify(event)) =>
    statusline({ env: { CLAUDE_CONFIG_DIR: join(home, `.claude-${profile}`) }, stdin: raw, home, machine: 'bench-laptop', now: at, send: (b) => sent.push(b) });
  draw('work', NOW);
  draw('work', NOW + 60_000);
  assert.equal(sent.length, 1, 'a second draw inside five minutes sent again');
  draw('home', NOW + 60_000);
  assert.deepEqual(sent.map((b) => b.profile), ['work', 'home'], 'each profile has its own five minutes');
  /* THE STAMP IS WRITTEN, and ages out. */
  const stamp = statusStamp(home, 'work');
  assert.ok(existsSync(stamp));
  assert.equal(statusFresh(stamp, NOW + STATUS_EVERY_MS - 1_000), true);
  utimesSync(stamp, new Date(NOW - 6 * 60_000), new Date(NOW - 6 * 60_000));
  assert.equal(statusFresh(stamp, NOW), false);
  draw('work', NOW);
  assert.equal(sent.length, 3);
  /* AN EVENT WITH NO FIGURE SENDS NOTHING AND LEAVES NO STAMP. */
  draw('quiet', NOW, JSON.stringify({ model: { display_name: 'Opus' } }));
  assert.equal(sent.length, 3);
  assert.ok(!existsSync(statusStamp(home, 'quiet')));
});

test('A BEAT HOLDS A NAME, A MACHINE AND FIGURES: no path, no folder, no model and no session', () => {
  const home = folder();
  const sent: StatusBeat[] = [];
  statusline({ env: { CLAUDE_CONFIG_DIR: join(home, '.ccenv', 'profiles', 'second') }, stdin: JSON.stringify(event), home, machine: 'bench-laptop', now: NOW, send: (b) => sent.push(b) });
  const beat = sent[0]!;
  assert.deepEqual(Object.keys(beat).sort(), ['five_hour_pct', 'machine', 'profile', 'resets_at', 'seven_day_pct']);
  assert.deepEqual([beat.profile, beat.machine, beat.five_hour_pct, beat.seven_day_pct, beat.resets_at], ['second', 'bench-laptop', 42, 83, new Date(RESET * 1000).toISOString()]);
  const wire = JSON.stringify(beat);
  for (const word of ['/', '\\', 'Users', 'Secret', 'client-work', 'Opus', 'abc', 'jsonl', home]) assert.ok(!wire.includes(word), `the beat holds ${word}`);
  /* AND WHAT THE CHILD READS BACK IS HELD TO THE SAME GRAMMAR. */
  assert.deepEqual(readBeat(wire), beat);
  assert.equal(readBeat(JSON.stringify({ ...beat, profile: '/Users/rowan/.claude' })), null);
  assert.equal(readBeat(JSON.stringify({ ...beat, machine: 'a b' })), null);
  assert.equal(readBeat('nope'), null);
  assert.equal(beatOf('x', 'y', parseStatus('{}')), null);
});

/* A record with the Profiles add-on: the list that plays `role: profiles`, one row named Work, and the calls kept. */
function record(withMeters = true) {
  const calls: { method: string; body: Record<string, unknown> }[] = [];
  const fields = [{ id: 'name' }, ...(withMeters ? [{ id: 'five_hour_pct' }, { id: 'seven_day_pct' }, { id: 'resets_at' }, { id: 'beat_at' }] : [])];
  const ask = async (method: string, body: Record<string, unknown>) => {
    calls.push({ method, body });
    if (method === 'schemas') return { kind: 'ok' as const, value: { lists: { profiles: { id: 'profiles', title: 'name', role: 'profiles', done: ['retired'], fields } } } };
    if (method === 'list') return { kind: 'ok' as const, value: { rows: [{ id: 'r1', seq: 3, version: 2, state: 'active', fields: { name: 'Work' } }] } };
    return { kind: 'ok' as const, value: {} };
  };
  return { ask, calls };
}

test('THE METERS go on the profile\'s row through update, with the time, and a record without the add-on does nothing', async () => {
  const r = record();
  const out = await keepMeters({ ask: r.ask, profile: 'work', meters: { five_hour_pct: 42, seven_day_pct: 83, resets_at: '2026-10-22T13:30:00.000Z' }, now: NOW });
  assert.equal(out, 'written');
  const update = r.calls.find((c) => c.method === 'update')!;
  assert.deepEqual(update.body, { register: 'profiles', seq: 3, version: 2, patch: { five_hour_pct: 42, seven_day_pct: 83, resets_at: '2026-10-22T13:30:00.000Z', beat_at: new Date(NOW).toISOString() } });

  const old = record(false);
  assert.equal(await keepMeters({ ask: old.ask, profile: 'work', meters: { five_hour_pct: 1, seven_day_pct: 2, resets_at: null } }), 'none');
  assert.ok(!old.calls.some((c) => c.method === 'update' || c.method === 'create'));
  const bare = { ask: async (method: string) => ({ kind: 'ok' as const, value: method === 'schemas' ? { lists: {} } : {} }), profile: 'work', meters: { five_hour_pct: 1, seven_day_pct: 2, resets_at: null } };
  assert.equal(await keepMeters(bare), 'none');
  assert.equal(await keepMeters({ ask: record().ask, profile: 'nobody', meters: { five_hour_pct: 1, seven_day_pct: 2, resets_at: null } }), 'none');
  assert.equal(await keepMeters({ ask: async () => ({ kind: 'gone' as const }), profile: 'work', meters: { five_hour_pct: 1, seven_day_pct: 2, resets_at: null } }), 'away');
});

test('THE STATUS LINE IS PLACED ONLY WHERE THERE IS NONE: his own is never read into or replaced', () => {
  const scripts = folder();
  writeFileSync(join(scripts, 'braindog-statusline.mjs'), '');
  const own = folder();
  writeFileSync(join(own, 'settings.json'), JSON.stringify({ statusLine: { type: 'command', command: 'my-line' }, model: 'x' }));
  assert.equal(statusLineIn(own), 'has');
  assert.throws(() => placeStatusLine(own, scripts));
  assert.equal((JSON.parse(readFileSync(join(own, 'settings.json'), 'utf8')) as { statusLine: { command: string } }).statusLine.command, 'my-line');

  const bare = folder();
  writeFileSync(join(bare, 'settings.json'), JSON.stringify({ model: 'x' }));
  assert.equal(statusLineIn(bare), 'none');
  const done = placeStatusLine(bare, scripts);
  assert.ok(done.kept !== null && existsSync(done.kept), 'a copy of the settings is kept first');
  assert.deepEqual(JSON.parse(readFileSync(join(bare, 'settings.json'), 'utf8')), { model: 'x', statusLine: { type: 'command', command: `node "${join(scripts, 'braindog-statusline.mjs').replaceAll('\\', '/')}"` } });

  const broken = folder();
  writeFileSync(join(broken, 'settings.json'), '[1]');
  assert.equal(statusLineIn(broken), 'unreadable');
});

test('THE PLACED COMMAND RUNS THE SMALL ENTRY: the bundle\'s file beside the hooks, else the checkout\'s source', () => {
  const bare = folder();
  assert.match(statuslineEntryIn(bare), /src\/statusline-entry\.ts$/u);
  assert.match(statusLineEntry(bare).command, /^node ".*src\/statusline-entry\.ts"$/u);
  writeFileSync(join(bare, 'braindog-statusline.mjs'), '');
  assert.equal(statuslineEntryIn(bare), join(bare, 'braindog-statusline.mjs').replaceAll('\\', '/'));
});

test('THE PRINT PATH LOADS NOTHING BUT NODE AND position.ts: no network, no record, no profile code', () => {
  const src = readFileSync(new URL('../src/statusline.ts', import.meta.url), 'utf8');
  const from = [...src.matchAll(/^import .* from '([^']+)'/gmu)].map((m) => m[1]!);
  assert.deepEqual(from.filter((f) => !f.startsWith('node:')), ['./position.ts']);
  const entry = readFileSync(new URL('../src/statusline-entry.ts', import.meta.url), 'utf8');
  assert.deepEqual([...entry.matchAll(/^import .* from '([^']+)'/gmu)].map((m) => m[1]!).filter((f) => !f.startsWith('node:')), ['./statusline.ts']);
});

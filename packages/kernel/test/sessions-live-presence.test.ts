/**
 * `sessions.live` answers the one word each run reads as (AGT-C04, AGT-C10): beside `quiet`, in the order of its rows.
 *
 * MEASURED BEFORE: the kernel told six presences apart (`presenceOf`), but the source answered only `quiet`, so every
 * screen folded a run into working, quiet or stopped, and a run that handed on a step, one that finished and one carried
 * in by an import all read "Stopped". What is asserted: the six words, one run of each, through the source's own read;
 * the word said again on a kit that does not carry `presenceOf` is the kernel's word, run by run; and `quiet` is as it was.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isQuiet, openRecord, presenceOf, type Entry, type Kernel, type Presence } from '../src/index.ts';
import type { PageBlock, SourceKit } from '../src/pages.ts';
import { SOURCE_MODULES } from '../src/sources/index.ts';
import { presenceFrom, type LiveResult } from '../src/sources/sessions-live.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 15, 12);
const MIN = 60_000;
const OWNER = { actor: 'p_1' };
const iso = (ms: number): string => new Date(ms).toISOString();

/** A run as a reader holds it: its state, and its fields with or without a `last_seen`. */
const run = (state: string, heard: number | null) => ({ state, fields: heard === null ? { state } : { state, last_seen: iso(NOW - heard * MIN) } });

/** One run of each presence, in the order the words are said. */
const SIX: readonly [Presence, ReturnType<typeof run>][] = [
  ['working', run('active', 2)],
  ['quiet', run('idle', 3)],
  ['left', run('handoff', 4)],
  ['ended', run('done', 5)],
  ['stopped', run('abandoned', 700)],
  ['before', run('active', null)],
];

/** The kit `pages.ts` hands a source, caught on the first read so the restated word is held to the kernel's own. */
let caught: SourceKit | null = null;
const LIVE = SOURCE_MODULES['sessions.live']!;
/** What the next read's `sessionsLive` answers in place of the record's, or `null` for the record's own. */
let handed: (() => Entry[]) | null = null;
SOURCE_MODULES['sessions.live'] = {
  ...LIVE,
  read: (deps, block, base, also, kit) => {
    caught = kit;
    return LIVE.read(handed ? { ...deps, sessionsLive: handed } : deps, block, base, also, kit);
  },
};

const BOARD = { kind: 'list', source: 'sessions.live', columns: [{ field: 'doing' }] } as unknown as PageBlock;

/** A record with one run of each of the six, made through the record's own writes. */
async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  for (const [i, [word, r]] of SIX.entries()) {
    const stamp = 'last_seen' in r.fields ? { last_seen: r.fields.last_seen } : {};
    const made = k.create('session', { doing: `Run ${String(i + 1)}`, agent: 'claude', state: 'active' }, { actor: OWNER.actor, stamp });
    assert.ok(made.ok, `${word}: ${JSON.stringify(made)}`);
    if (r.state !== 'active') assert.ok(k.update('session', `S${String(i + 1)}`, { state: r.state }, OWNER).ok, `${word} moved to ${r.state}`);
  }
  return { k, sql };
}

/** Every run on the record, read whole, in the order it was made. */
const everyRun = (k: Kernel): Entry[] => SIX.map((_, i) => k.get(`S${String(i + 1)}`)).filter((e): e is Entry => e !== null);

test('SIX WORDS, ONE A RUN: the source answers presence beside quiet, in the order of its rows', async () => {
  const { k, sql } = await record();
  handed = () => everyRun(k);
  try {
    const out = k.block(BOARD) as LiveResult;
    assert.deepEqual(out.refusals, []);
    assert.deepEqual(out.rows.map((r) => r.fields.doing), SIX.map((_, i) => `Run ${String(i + 1)}`));
    /* What the record made of each write is asked of the kernel's own clock, so the fixture cannot drift from it. */
    const want = everyRun(k).map((e) => presenceOf(e, NOW));
    assert.deepEqual(out.presence, want);
    assert.ok(want.includes('ended') && want.includes('left'), `a finished run and one that left a step each read their own word: ${want.join(', ')}`);
    /* QUIET IS AS IT WAS: open and not working, the resting run and the one carried in still open, nothing that ended. */
    assert.deepEqual(out.quiet, everyRun(k).map((e) => isQuiet(e, NOW)));
    assert.deepEqual(out.quiet, [false, true, false, false, false, true]);
  } finally {
    handed = null;
    sql.close();
  }
});

test('THE RECORD\'S OWN LIVE RUNS read their word too: a finished run is not live, and the rest are named', async () => {
  const { k, sql } = await record();
  const out = k.block(BOARD) as LiveResult;
  assert.deepEqual(out.refusals, []);
  assert.equal(out.presence?.length, out.rows.length);
  for (const [i, r] of out.rows.entries()) assert.equal(out.presence?.[i], presenceOf(k.get(`S${String(r.seq)}`)!, NOW));
  assert.ok(!out.presence?.includes('ended'), 'a done run is no live run');
  sql.close();
});

test('SAID AGAIN ON A KIT WITHOUT presenceOf, the word is the kernel\'s, run by run', async () => {
  const { k, sql } = await record();
  k.block(BOARD);
  assert.ok(caught, 'the source was read');
  const bare = { ...caught, presenceOf: undefined } as unknown as SourceKit;
  for (const [word, r] of SIX) {
    assert.equal(presenceOf(r, NOW), word, `the fixture for ${word} is the kernel's ${word}`);
    assert.equal(presenceFrom(bare, r, NOW), word);
  }
  /* The edges: working stops at fifteen minutes, an idle run is never at work, and a state nobody named is quiet. */
  for (const r of [run('active', 14), run('active', 16), run('idle', 1), run('', 1), { fields: { state: 'active', last_seen: iso(NOW - MIN) } }])
    assert.equal(presenceFrom(bare, r, NOW), presenceOf(r, NOW), JSON.stringify(r));
  /* AND A KIT THAT CARRIES IT IS ASKED, not said again. */
  const carried = { ...caught, presenceOf: () => 'ended' } as unknown as SourceKit;
  assert.equal(presenceFrom(carried, run('active', 1), NOW), 'ended');
  sql.close();
});

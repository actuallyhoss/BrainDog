/**
 * The poll that tells an open screen the record changed, with its clock and its visibility handed in.
 *
 * WHY IT EXISTS. There was one poll in the whole app, `Reporting.svelte`'s report
 * keys, and a register list that asked again only when its own question changed: an agent writing into the list he
 * had open changed none of the four parts of that question, so the row appeared on his next navigation and not before.
 * `/api/version` already answered the change, 0.87 ms a call on a self-host, and nothing asked it.
 *
 * NO REAL TIMER AND NO DOCUMENT. `every` is a fake clock that fires on `advance`, and visibility is a flag with a
 * listener, so a fifteen-second interval is tested in no time at all and a hidden tab is a boolean rather than a
 * browser. What this file cannot prove is that the layout starts the poll or that a list redraws when it answers:
 * those are the in-browser proof the layout gate carries.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { delayOf, endedBy, newerBuild, paced, poller, regranted, Wait, type LiveState, type Timers, type Visibility } from './live.ts';
import { accessEnded } from './offline.ts';

/**
 * A clock that only moves when told to, and fires each timer that falls due inside the time it moved.
 *
 * ONE-SHOT, AS THE POLL'S ARE: the poll sets its next timer when an answer lands, so a timer fired here asks, and the
 * next one exists only after `settle` lets the answer through. `advance` then moves the rest of the way.
 */
function clock(): Timers & { advance(ms: number): void; now(): number } {
  let now = 0;
  const running = new Set<{ fn: () => void; at: number }>();
  return {
    now: () => now,
    after(fn, ms) {
      const t = { fn, at: now + ms };
      running.add(t);
      return () => running.delete(t);
    },
    advance(ms) {
      const until = now + ms;
      for (;;) {
        const due = [...running].filter((t) => t.at <= until).sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        running.delete(due);
        now = due.at;
        due.fn();
      }
      now = until;
    },
  };
}

/** A tab that is hidden or not and focused or not, and says so to whoever is listening. */
function tab(hidden: boolean, focused?: boolean): Visibility & { set(hidden: boolean): void; focus(on: boolean): void } {
  const heard = new Set<() => void>();
  return {
    hidden: () => hidden,
    ...(focused === undefined ? {} : { focused: () => focused === true }),
    watch(fn) {
      heard.add(fn);
      return () => heard.delete(fn);
    },
    set(next) {
      hidden = next;
      for (const fn of heard) fn();
    },
    focus(on) {
      focused = on;
      for (const fn of heard) fn();
    },
  };
}

/** Move the clock `ms` in steps of `step`, letting every answer land after each, which is how time passes for a poll. */
async function run(timers: ReturnType<typeof clock>, ms: number, step = 100) {
  for (let t = 0; t < ms; t += step) {
    timers.advance(Math.min(step, ms - t));
    await settle();
  }
}

/** An `ask` that answers from a script, one entry per call, and counts the calls. A string is a failure. */
function asker(script: (number | string)[]) {
  const out = { calls: 0, ask: async (): Promise<number> => 0 };
  out.ask = async () => {
    const said = script[Math.min(out.calls, script.length - 1)];
    out.calls++;
    if (typeof said === 'string') throw new Error(said);
    return said as number;
  };
  return out;
}

/** Let every answer that is due land. */
const settle = () => new Promise<void>((r) => setImmediate(r));

test('a visible tab asks at once, then once every fifteen seconds', async () => {
  const timers = clock();
  const a = asker([1]);
  const stop = poller({ ask: a.ask, timers, visible: tab(false), onChange: () => {} });
  await settle();
  assert.equal(a.calls, 1, 'the first ask is the baseline, and it goes out when the poll starts');
  for (let i = 0; i < 3; i++) {
    timers.advance(15_000);
    await settle();
  }
  assert.equal(a.calls, 4, 'forty-five seconds is three more');
  timers.advance(14_999);
  await settle();
  assert.equal(a.calls, 4, 'and not one before the fifteenth second');
  stop();
});

test('a hidden tab asks nothing, and asks exactly once when it comes back', async () => {
  const timers = clock();
  const t = tab(true);
  const a = asker([1]);
  const stop = poller({ ask: a.ask, timers, visible: t, onChange: () => {} });
  timers.advance(60_000);
  await settle();
  assert.equal(a.calls, 0, 'a minute hidden is a minute of no requests');
  t.set(false);
  await settle();
  assert.equal(a.calls, 1, 'coming back is one ask, not a burst of the ones it skipped');
  timers.advance(15_000);
  await settle();
  assert.equal(a.calls, 2, 'and the interval runs again from there');
  t.set(true);
  timers.advance(60_000);
  await settle();
  assert.equal(a.calls, 2, 'hidden again, and quiet again');
  stop();
});

test('onChange hears a different version once, never an equal one, and never an ordering', async () => {
  const timers = clock();
  const heard: number[] = [];
  /* 7 THEN 3 IS THE CASE THAT MATTERS. A member's version is a hash (`Version.version` in `@braindog/client`), so a
     change can come back smaller; a poller that compared with `>` would sit on the change and say nothing. */
  const a = asker([7, 7, 3, 3]);
  const stop = poller({ ask: a.ask, timers, visible: tab(false), onChange: (v) => heard.push(v) });
  await settle();
  assert.deepEqual(heard, [], 'the first answer is the baseline: the screen was drawn from this state');
  timers.advance(15_000);
  await settle();
  assert.deepEqual(heard, [], 'an equal version is no change');
  timers.advance(15_000);
  await settle();
  assert.deepEqual(heard, [3], 'a different one is one change, whichever way it moved');
  timers.advance(15_000);
  await settle();
  assert.deepEqual(heard, [3], 'and it is heard once');
  stop();
});

test('a failed ask is offline, an answer is open, and each is said once', async () => {
  const timers = clock();
  const states: LiveState[] = [];
  const heard: number[] = [];
  const a = asker([4, 'down', 'down', 5]);
  const stop = poller({ ask: a.ask, timers, visible: tab(false), onChange: (v) => heard.push(v), onState: (s) => states.push(s) });
  await settle();
  assert.deepEqual(states, [], 'open is where it starts, so the first answer is not a transition');
  timers.advance(15_000);
  await settle();
  assert.deepEqual(states, ['offline']);
  /* THE SECOND ASK WAITS TWICE AS LONG, because the first failed. */
  timers.advance(30_000);
  await settle();
  assert.deepEqual(states, ['offline'], 'a second failure changes nothing on screen');
  timers.advance(60_000);
  await settle();
  assert.deepEqual(states, ['offline', 'open']);
  assert.deepEqual(heard, [5], 'and what was written while it was down is a change like any other');
  stop();
});

test('a focused tab asks about every 1.5 s while the record moves, a blurred one every 15 s, and taking focus asks at once', async () => {
  const timers = clock();
  const t = tab(false, true);
  const a = asker(Array.from({ length: 40 }, (_, i) => i));
  const stop = poller({ ask: a.ask, timers, visible: t, onChange: () => {} });
  await settle();
  assert.equal(a.calls, 1);
  await run(timers, 15_000);
  assert.equal(a.calls, 11, 'fifteen seconds focused is ten more asks');
  t.focus(false);
  await run(timers, 14_000);
  assert.equal(a.calls, 11, 'without focus the next ask is fifteen seconds off');
  await run(timers, 1_000);
  assert.equal(a.calls, 12);
  t.focus(true);
  await settle();
  assert.equal(a.calls, 13, 'focus back is one ask at once');
  await run(timers, 1_500);
  assert.equal(a.calls, 14, 'and the fast interval from there');
  stop();
});

test('failures back off by doubling to a minute, and one answer brings the interval back', async () => {
  assert.equal(delayOf(1_500, 0, 60_000, null), 1_500);
  assert.equal(delayOf(1_500, 1, 60_000, null), 3_000);
  assert.equal(delayOf(1_500, 3, 60_000, null), 12_000);
  assert.equal(delayOf(1_500, 9, 60_000, null), 60_000, 'never longer than a minute');
  assert.equal(delayOf(1_500, 1, 60_000, 20), 20_000, 'and never shorter than a 429 asked for');

  const timers = clock();
  const a = asker([1, 'down', 'down', 'down', 2]);
  const stop = poller({ ask: a.ask, timers, visible: tab(false, true), onChange: () => {} });
  await settle();
  const at: number[] = [];
  let seen = a.calls;
  for (let ms = 0; ms < 40_000; ms += 100) {
    timers.advance(100);
    await settle();
    if (a.calls !== seen) (seen = a.calls), at.push(timers.now());
  }
  assert.deepEqual(at.slice(0, 5), [1_500, 4_500, 10_500, 22_500, 24_000], 'failing at 1.5, then 3, 6 and 12 s apart, and 1.5 s again once it answers');
  stop();
});

test('a 429 is not offline, and the next ask waits as long as it said', async () => {
  const timers = clock();
  const states: LiveState[] = [];
  let calls = 0;
  const ask = async () => {
    calls++;
    if (calls === 2) throw new Wait(20);
    return 1;
  };
  const stop = poller({ ask, timers, visible: tab(false, true), onChange: () => {}, onState: (s) => states.push(s) });
  await settle();
  await run(timers, 1_500);
  assert.equal(calls, 2);
  await run(timers, 19_900);
  assert.equal(calls, 2, 'nothing asked inside the twenty seconds');
  await run(timers, 200);
  assert.equal(calls, 3);
  assert.deepEqual(states, [], 'and the hairline never said offline');
  stop();
});

test('one ask at a time: a slow answer is waited for, not overtaken', async () => {
  const timers = clock();
  let calls = 0;
  let answer: (v: number) => void = () => {};
  const ask = () => {
    calls++;
    return new Promise<number>((r) => (answer = r));
  };
  const stop = poller({ ask, timers, visible: tab(false), onChange: () => {} });
  timers.advance(45_000);
  await settle();
  assert.equal(calls, 1, 'three ticks under one slow answer send no second request');
  answer(1);
  await settle();
  timers.advance(15_000);
  await settle();
  assert.equal(calls, 2);
  stop();
});

test('after stop, nothing is asked and nothing is heard', async () => {
  const timers = clock();
  const t = tab(false);
  const heard: number[] = [];
  let answer: (v: number) => void = () => {};
  let calls = 0;
  const ask = () => {
    calls++;
    return calls === 1 ? Promise.resolve(1) : new Promise<number>((r) => (answer = r));
  };
  const stop = poller({ ask, timers, visible: t, onChange: (v) => heard.push(v) });
  await settle();
  timers.advance(15_000);
  stop();
  answer(2);
  await settle();
  assert.deepEqual(heard, [], 'an answer landing after stop belongs to nobody');
  timers.advance(60_000);
  t.set(true);
  t.set(false);
  await settle();
  assert.equal(calls, 2, 'and the clock and the tab no longer reach it');
});

/* THE HAIRLINE WAS A CONSTANT, and a constant cannot be reassigned by a poll. `+layout.svelte` held
   `const live: 'open' | 'polling' | 'offline' = 'open'`, so the `polling` and `offline` rules under it could never match
   (§1.1). This reads the file because the layout is a component no unit test mounts. */
test('the layout draws the hairline from the live store, not from a constant', () => {
  const layout = readFileSync(new URL('../shell/AppFrame.svelte', import.meta.url), 'utf8');
  assert.ok(!layout.includes("const live: 'open' | 'polling' | 'offline' = 'open'"), 'the constant is gone');
  assert.match(layout, /from '\$lib\/data\/live\.svelte\.ts'/, 'the state comes from the store the poll writes');
  /* AN IMPORT IS NOT A READ. With only the two lines above, `data-state="open"` written back in beside the import
     passed, and so did a layout that imported `follow` and never called it: measured by mutating a copy of the layout
     both ways. So the hairline's attribute and the call that starts the poll are named too. */
  assert.match(layout, /data-state=\{live\.state\}/, 'the hairline reads the state the poll sets');
  assert.match(layout, /follow\(data\.live === true \?/, 'and the poll is started, for a live record only');
});

/* ── access: a share changed, or ended ── */

test('an access epoch that moved boots the tab again; nobody no share let in is ever re-booted by it', () => {
  assert.equal(regranted(4, 5), true, 'a share changed');
  assert.equal(regranted(4, null), true, 'the last share ended while a role stayed');
  assert.equal(regranted(null, 3), true, 'a first share for a member');
  assert.equal(regranted(4, 4), false);
  /* AN OWNER'S SHELL SAYS NO GRANT AND THE POLL SENDS NONE: absent and null are one answer. */
  assert.equal(regranted(null, undefined), false);
  assert.equal(regranted(undefined, undefined), false);
});

test('only the door\'s access refusal ends the tab: FORBIDDEN at access, and no other 403', () => {
  assert.equal(endedBy({ code: 'FORBIDDEN', at: 'access', fix: "Your access to Ada's BrainDog ended. Ask Ada if you need it back." } as never), true);
  assert.equal(endedBy({ code: 'FORBIDDEN', at: 'principal' }), false, 'a stopped member is told otherwise');
  assert.equal(endedBy({ code: 'FORBIDDEN' }), false, 'a stranger at a name is not told their access ended');
  assert.equal(endedBy({ code: 'LEVEL_REQUIRED', at: 'access' }), false);
  assert.equal(endedBy(null), false);
});

/* THE POLL, THE LAYOUT AND THE SERVICE WORKER ARE WIRED TO IT, which a pure test cannot mount, so their text is read as the
   hairline's is above: the ended refusal wipes the copies and is drawn, an epoch move re-boots, and the worker deletes
   its cache on the header. */
test('an ended refusal wipes both copies and draws the ended screen; the worker deletes its cache on the header', () => {
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
  const poll = read('./live.svelte.ts');
  assert.match(poll, /endedBy\(out\.refusal\)\) end\(out\.refusal\.fix\)/, 'the poll ends the tab on the access refusal');
  assert.match(poll, /function end\(said: string\): void \{\s*void forget\(\)[\s\S]*?void wipeLocal\(\);[\s\S]*?live\.ended = \{ said \};/, 'ending wipes the worker\'s copy and the local copy');
  assert.match(poll, /regranted\(known, epoch\)/, 'an epoch move re-boots');
  const layout = read('../shell/AppFrame.svelte');
  assert.match(layout, /data\.refused\?\.at === 'access'/, 'a boot refused the same way draws the same screen');
  assert.match(layout, /<AccessEnded said=\{endedSaid\} \/>/);
  assert.match(layout, /followGrant\(me\.grant\?\.epoch \?\? null, \(\) => invalidate\('braindog:boot'\)\)/, 'the layout tells the poll the epoch it booted with, and how to boot again');
  const worker = read('../../service-worker.ts');
  assert.match(worker, /res\.status === 401 \|\| accessEnded\(res\.headers\)/, 'the worker deletes its copy on the header');
  assert.equal(accessEnded(new Headers({ 'x-braindog-access': 'ended' })), true);
  assert.equal(accessEnded(new Headers()), false);
});

test('A FOCUSED TAB WHERE NOTHING MOVES STRETCHES TO SIX SECONDS, and a change or a touch makes it quick again', async () => {
  const timers = clock();
  const t = tab(false, true);
  const a = asker([1, 1, 1, 1, 1, 1, 1, 1, 2, 2]);
  const stop = poller({ ask: a.ask, timers, visible: t, onChange: () => {} });
  await settle();
  const at: number[] = [];
  let seen = a.calls;
  for (let ms = 0; ms < 40_000; ms += 50) {
    timers.advance(50);
    await settle();
    if (a.calls !== seen) (seen = a.calls), at.push(timers.now());
  }
  const gaps = at.slice(1).map((v, i) => v - at[i]!);
  assert.deepEqual(gaps.slice(0, 4), [2_250, 3_400, 5_100, 6_000], 'each unchanged answer stretches the wait by half, to six seconds (on the 50 ms clock)');
  assert.equal(gaps[7], 1_500, 'a change is quick again');
  /* A TOUCH ON A QUIET TAB: the next ask is the quick one from now. */
  await run(timers, 10_000);
  const before = a.calls;
  t.focus(true);
  await run(timers, 1_500);
  assert.equal(a.calls, before + 1, 'a touch on a quiet tab asks within 1.5 s');
  stop();
});

test('A BUSY RECORD IS NOT OFFLINE: the poll waits as it was told', async () => {
  const timers = clock();
  const states: LiveState[] = [];
  let calls = 0;
  const ask = async () => {
    calls++;
    if (calls === 2) throw new Wait(5);
    return 1;
  };
  const stop = poller({ ask, timers, visible: tab(false, true), onChange: () => {}, onState: (s) => states.push(s) });
  await settle();
  await run(timers, 1_500);
  await run(timers, 4_900);
  assert.equal(calls, 2, 'nothing asked inside the five seconds');
  await run(timers, 200);
  assert.equal(calls, 3);
  assert.deepEqual(states, []);
  stop();
});

test('A NEWER BUILD IS ONE BOTH SIDES NAME AND DISAGREE ON, tried once a pair (scope 2026-10-24 A17)', () => {
  assert.equal(newerBuild('2026.10.24+aaaaaaa', '2026.10.24+bbbbbbb', null), '2026.10.24+aaaaaaa>2026.10.24+bbbbbbb');
  assert.equal(newerBuild('2026.10.24+aaaaaaa', '2026.10.24+aaaaaaa', null), null, 'the same build');
  assert.equal(newerBuild('', '2026.10.24+bbbbbbb', null), null, 'a build made without a tuple compares nothing');
  for (const heard of ['', null, undefined, 7]) assert.equal(newerBuild('2026.10.24+aaaaaaa', heard, null), null, `a host naming ${String(heard)}`);
  assert.equal(newerBuild('2026.10.24+aaaaaaa', '2026.10.24+bbbbbbb', '2026.10.24+aaaaaaa>2026.10.24+bbbbbbb'), null, 'a pair already tried');
  const poll = readFileSync(new URL('./live.svelte.ts', import.meta.url), 'utf8');
  assert.match(poll, /newerBuild\(OWN_BUILD, out\.value\.app, tried\(\)\)/, 'the poll compares what version answers');
  assert.match(poll, /hearShell\(/, 'and hears the worker say the shell moved');
});

test('the screens hear the record moved at most once a wait: the first at once, then the newest when it ends', () => {
  const due: { fn: () => void; at: number; gone: boolean }[] = [];
  let now = 0;
  const timers: Timers = {
    after(fn, ms) {
      const t = { fn, at: now + ms, gone: false };
      due.push(t);
      return () => void (t.gone = true);
    },
  } as Timers;
  const move = (ms: number) => {
    now += ms;
    for (const t of due.splice(0)) {
      if (t.gone) continue;
      if (t.at <= now) t.fn();
      else due.push(t);
    }
  };
  const heard: number[] = [];
  const told = paced((v: number) => heard.push(v), 5_000, timers);
  told.hear(1);
  assert.deepEqual(heard, [1], 'the first of a quiet spell goes at once');
  told.hear(2);
  told.hear(3);
  move(4_999);
  assert.deepEqual(heard, [1], 'nothing more inside the wait');
  move(1);
  assert.deepEqual(heard, [1, 3], 'the newest when it ends, and 2 never');
  told.hear(4);
  assert.deepEqual(heard, [1, 3], 'the wait starts again after what it let go');
  move(5_000);
  assert.deepEqual(heard, [1, 3, 4]);
  move(5_000);
  told.hear(5);
  assert.deepEqual(heard, [1, 3, 4, 5], 'a quiet spell goes at once again');
  told.hear(6);
  told.stop();
  move(10_000);
  assert.deepEqual(heard, [1, 3, 4, 5], 'stopped, what was held is let go');
});

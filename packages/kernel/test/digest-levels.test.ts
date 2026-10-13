/**
 * The three alert levels and the quiet hours they answer to (AGT-C19 job a).
 *
 * PASSIVE writes the note and nothing else. ACTIVE adds one push, at most one an hour, that says how many things wait.
 * TIME-SENSITIVE adds a push and a mail, once for its cause. Inside the record's quiet hours none of them pushes or
 * mails, and a time-sensitive notice held there leads the next digest.
 *
 * OVER `notify` AND `runDigest` THEMSELVES, with the deps a kernel hands them written out here, so each level is read
 * off what it queued and not off a record's whole write path.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { QUIET_DEFAULT, heldIn, inQuietHours, notify, quietOf, runDigest, type DigestDecl, type DigestDeps, type HeldNotice, type QuietWindow } from '../src/digest.ts';

const TZ = 'Europe/London';
/* September in London is an hour ahead of UTC. */
const AFTERNOON = Date.UTC(2026, 8, 5, 13); // 14:00 there
const EVENING = Date.UTC(2026, 8, 5, 20, 30); // 21:30 there: quiet by the new default, loud by the old one
const NIGHT = Date.UTC(2026, 8, 5, 22); // 23:00 there
const MORNING = Date.UTC(2026, 8, 6, 7); // 08:00 there

type Queued = { kind: string; payload: Record<string, unknown> };
type Noted = { actor: string; text: string; urgent: boolean };

type Over = {
  nowMs?: number;
  quiet?: QuietWindow;
  waiting?: number;
  owners?: string[];
  held?: HeldNotice[];
  /** A figure the digest's one section reads, so a digest has something of its own to carry. */
  figure?: number;
};

/** A kernel's deps, kept in memory: what was queued and noted, and the hour's limit counted over what was queued. */
function world(over: Over = {}) {
  const queued: Queued[] = [];
  const notes: Noted[] = [];
  const told = new Set<string>();
  let now = over.nowMs ?? AFTERNOON;
  let last = -Infinity;
  const deps = (): DigestDeps => ({
    metric: () => (over.figure === undefined ? null : ({} as never)),
    read: () => ({ ok: true, value: { value: over.figure ?? 0, unit: null, rows: 0 } }) as never,
    list: () => ({ ok: true, value: { rows: [], matched: 0 } }),
    schemaOf: () => null,
    ctx: {} as never,
    owners: () => over.owners ?? ['me@example.test'],
    outbox: (kind, payload) => {
      const p = payload as Record<string, unknown>;
      queued.push({ kind, payload: p });
      if (kind === 'notify.push') last = now;
      if (typeof p.cause === 'string') told.add(p.cause);
    },
    note: (actor, text, urgent) => void notes.push({ actor, text, urgent: urgent === true }),
    delivers: ['notify.email', 'notify.push'],
    interrupted: () => now - last < 3_600_000,
    mint: () => 'id',
    nowMs: now,
    tz: TZ,
    ...(over.quiet !== undefined ? { quiet: over.quiet } : {}),
    ...(over.waiting !== undefined ? { waiting: () => over.waiting as number } : {}),
    told: (cause) => told.has(cause),
    ...(over.held !== undefined ? { held: () => over.held as HeldNotice[] } : {}),
  });
  return {
    deps,
    queued,
    notes,
    at: (ms: number) => void (now = ms),
    of: (kind: string) => queued.filter((q) => q.kind === kind),
  };
}

const WINDOW = quietOf(null);

/* ── passive ─────────────────────────────────────────────────────────────── */

test('PASSIVE WRITES THE NOTE AND NOTHING ELSE', () => {
  const w = world({ quiet: WINDOW, waiting: 3 });
  notify(w.deps(), { actor: 'rule:chase', say: 'Chase Invoice 41', level: 'passive' });
  assert.deepEqual(w.notes, [{ actor: 'rule:chase', text: 'Chase Invoice 41', urgent: false }]);
  assert.deepEqual(w.queued, [], 'a passive notice left the record');
});

test('and a notice that names no level is passive, as it was', () => {
  const w = world({ quiet: WINDOW });
  notify(w.deps(), { actor: 'rule:chase', say: 'Chase Invoice 41' });
  assert.equal(w.notes.length, 1);
  assert.deepEqual(w.queued, []);
});

/* ── active ──────────────────────────────────────────────────────────────── */

test('ACTIVE PUSHES ONCE, SAYS HOW MANY THINGS WAIT, AND MAILS NOBODY', () => {
  const w = world({ quiet: WINDOW, waiting: 3 });
  notify(w.deps(), { actor: 'agent:Scout', say: 'Scout asks which supplier to keep', level: 'active', url: '/decide' });
  assert.equal(w.notes.length, 1);
  assert.equal(w.notes[0]!.urgent, false, 'an active notice was marked as one a mute cannot hide');
  assert.deepEqual(w.of('notify.push'), [{ kind: 'notify.push', payload: { title: '3 things wait for you', url: '/decide', level: 'active' } }]);
  assert.deepEqual(w.of('notify.email'), [], 'an active notice sent a mail');
});

test('and it counts one thing as one thing, and itself when nobody can count', () => {
  const one = world({ quiet: WINDOW, waiting: 1 });
  notify(one.deps(), { actor: 'agent:Scout', say: 'Scout asks', level: 'active' });
  assert.equal(one.of('notify.push')[0]!.payload.title, '1 thing waits for you');

  const none = world({ quiet: WINDOW });
  notify(none.deps(), { actor: 'agent:Scout', say: 'Scout asks', level: 'active' });
  assert.equal(none.of('notify.push')[0]!.payload.title, '1 thing waits for you');
});

test('AT MOST ONE ACTIVE PUSH AN HOUR, and the note is written each time', () => {
  const w = world({ quiet: WINDOW, waiting: 2 });
  notify(w.deps(), { actor: 'agent:Scout', say: 'First', level: 'active' });
  w.at(AFTERNOON + 20 * 60_000);
  notify(w.deps(), { actor: 'agent:Scout', say: 'Second', level: 'active' });
  assert.equal(w.of('notify.push').length, 1, 'a second active notice pushed inside the hour');
  assert.equal(w.notes.length, 2, 'the hour limit swallowed the note as well');
  w.at(AFTERNOON + 61 * 60_000);
  notify(w.deps(), { actor: 'agent:Scout', say: 'Third', level: 'active' });
  assert.equal(w.of('notify.push').length, 2, 'an active notice an hour on did not push');
});

test('ACTIVE NEVER PUSHES INSIDE QUIET HOURS', () => {
  const w = world({ quiet: WINDOW, waiting: 2, nowMs: NIGHT });
  notify(w.deps(), { actor: 'agent:Scout', say: 'Scout asks', level: 'active' });
  assert.equal(w.notes.length, 1);
  assert.deepEqual(w.queued, [], 'an active notice made a sound at eleven at night');
});

/* ── time-sensitive ──────────────────────────────────────────────────────── */

test('TIME-SENSITIVE PUSHES AND MAILS, and its note is one a mute cannot hide', () => {
  const w = world({ quiet: WINDOW });
  notify(w.deps(), { actor: 'rule:urgent', say: 'Payment failed for Invoice 41', because: 'The card was declined.', level: 'time-sensitive', cause: 'invoice-41', url: '/money' });
  assert.deepEqual(w.notes, [{ actor: 'rule:urgent', text: 'Payment failed for Invoice 41', urgent: true }]);
  assert.deepEqual(w.of('notify.push'), [{ kind: 'notify.push', payload: { title: 'Payment failed for Invoice 41', url: '/money', level: 'time-sensitive', cause: 'invoice-41' } }]);
  const mail = w.of('notify.email');
  assert.equal(mail.length, 1);
  assert.deepEqual(mail[0]!.payload, {
    to: ['me@example.test'],
    subject: 'Payment failed for Invoice 41',
    text: 'Payment failed for Invoice 41\n\nThe card was declined.',
    cause: 'invoice-41',
  });
});

test('ONCE FOR ITS CAUSE: the same cause is quiet for good, and another cause is heard inside the hour', () => {
  const w = world({ quiet: WINDOW });
  notify(w.deps(), { actor: 'rule:urgent', say: 'Payment failed for Invoice 41', level: 'time-sensitive', cause: 'invoice-41' });
  w.at(AFTERNOON + 3 * 3_600_000);
  notify(w.deps(), { actor: 'rule:urgent', say: 'Payment failed for Invoice 41', level: 'time-sensitive', cause: 'invoice-41' });
  assert.equal(w.of('notify.push').length, 1, 'one cause pushed twice');
  assert.equal(w.of('notify.email').length, 1, 'one cause mailed twice');
  assert.equal(w.notes.length, 2, 'the second telling lost its note');

  w.at(AFTERNOON + 3 * 3_600_000 + 60_000);
  notify(w.deps(), { actor: 'rule:urgent', say: 'Payment failed for Invoice 42', level: 'time-sensitive', cause: 'invoice-42' });
  assert.equal(w.of('notify.push').length, 2, 'the hour limit swallowed a second cause');
  assert.equal(w.of('notify.email').length, 2);
});

test('and an active push inside the hour does not swallow a time-sensitive one', () => {
  const w = world({ quiet: WINDOW, waiting: 1 });
  notify(w.deps(), { actor: 'agent:Scout', say: 'Scout asks', level: 'active' });
  w.at(AFTERNOON + 5 * 60_000);
  notify(w.deps(), { actor: 'rule:urgent', say: 'Payment failed', level: 'time-sensitive', cause: 'invoice-41' });
  assert.equal(w.of('notify.push').length, 2);
  assert.equal(w.of('notify.email').length, 1);
});

test('`urgent: true` IS TIME-SENSITIVE, and with no cause it keeps the one-an-hour limit it had', () => {
  const w = world({ quiet: WINDOW });
  notify(w.deps(), { actor: 'rule:urgent', say: 'Payment failed', urgent: true });
  assert.equal(w.notes[0]!.urgent, true);
  assert.equal(w.of('notify.push').length, 1);
  assert.equal(w.of('notify.email').length, 1);
  assert.equal(w.of('notify.push')[0]!.payload.level, 'time-sensitive');

  w.at(AFTERNOON + 60_000);
  notify(w.deps(), { actor: 'rule:other', say: 'A key expires tomorrow', urgent: true });
  assert.equal(w.of('notify.push').length, 1, 'a second urgent notice with no cause interrupted inside the hour');
  assert.equal(w.notes.length, 2);
});

test('and a level said beside `urgent: true` is the level that holds', () => {
  const w = world({ quiet: WINDOW, waiting: 4 });
  notify(w.deps(), { actor: 'agent:Scout', say: 'Scout asks', urgent: true, level: 'active' });
  assert.equal(w.of('notify.email').length, 0);
  assert.equal(w.of('notify.push')[0]!.payload.title, '4 things wait for you');
});

test('a record with no owner address sends the push alone', () => {
  const w = world({ quiet: WINDOW, owners: [] });
  notify(w.deps(), { actor: 'rule:urgent', say: 'Payment failed', level: 'time-sensitive', cause: 'invoice-41' });
  assert.equal(w.of('notify.push').length, 1);
  assert.equal(w.of('notify.email').length, 0);
});

/* ── quiet hours ─────────────────────────────────────────────────────────── */

const DAILY = (over: Partial<DigestDecl> = {}): DigestDecl => ({
  digest: 'morning',
  name: 'Morning',
  schedule: { at: '08:00' },
  channels: ['in-app', 'email', 'push'],
  sections: [{ heading: 'Open questions', source: 'metric.open', as: 'stat' }],
  ...over,
});

test('TIME-SENSITIVE IS HELD INSIDE QUIET HOURS: the note, and no sound', () => {
  const w = world({ quiet: WINDOW, nowMs: NIGHT });
  notify(w.deps(), { actor: 'rule:urgent', say: 'Payment failed for Invoice 41', level: 'time-sensitive', cause: 'invoice-41' });
  assert.deepEqual(w.notes, [{ actor: 'rule:urgent', text: 'Payment failed for Invoice 41', urgent: true }]);
  assert.deepEqual(w.queued, [], 'a time-sensitive notice made a sound at eleven at night');

  /* AND `urgent: true` THE SAME, at half past nine, which the old window let through. */
  const e = world({ quiet: WINDOW, nowMs: EVENING });
  notify(e.deps(), { actor: 'rule:urgent', say: 'Payment failed', urgent: true });
  assert.deepEqual(e.queued, []);
  assert.equal(e.notes.length, 1);
});

test('a window that is off holds nothing, and a caller that hands no window sends as before', () => {
  const off = world({ quiet: 'off', nowMs: NIGHT });
  notify(off.deps(), { actor: 'rule:urgent', say: 'Payment failed', urgent: true });
  assert.equal(off.of('notify.push').length, 1);

  const unsaid = world({ nowMs: NIGHT });
  notify(unsaid.deps(), { actor: 'rule:urgent', say: 'Payment failed', urgent: true });
  assert.equal(unsaid.of('notify.push').length, 1, 'a notice was held by a window nobody read from the record');
  assert.equal(unsaid.of('notify.email').length, 1);
});

test('THE HELD ONE LEADS THE NEXT DIGEST, above the digest’s own sections', () => {
  const held: HeldNotice[] = [
    { at: NIGHT, say: 'Payment failed for Invoice 41' },
    /* Said in the afternoon, so it pushed then and is not said again. */
    { at: AFTERNOON, say: 'A key expires tomorrow' },
  ];
  const w = world({ quiet: WINDOW, nowMs: MORNING, held, figure: 2 });
  const sent = runDigest(w.deps(), DAILY());
  assert.equal(sent.skipped, false);

  const text = String(w.of('notify.email')[0]!.payload.text);
  const lead = text.indexOf('## Held in quiet hours');
  const own = text.indexOf('## Open questions');
  assert.ok(lead > 0 && own > lead, `the held notice did not lead:\n${text}`);
  assert.match(text, /Payment failed for Invoice 41/);
  assert.doesNotMatch(text, /A key expires tomorrow/, 'a notice that already pushed was said again');

  const note = w.notes.find((n) => n.actor === 'digest:morning');
  assert.match(note!.text, /^Morning: Held in quiet hours 1 · Open questions 2/);
  assert.equal(w.of('notify.push')[0]!.payload.title, 'Morning: 2 items');
});

test('and a digest with nothing of its own still goes when something was held', () => {
  const w = world({ quiet: WINDOW, nowMs: MORNING, held: [{ at: NIGHT, say: 'Payment failed for Invoice 41' }] });
  const sent = runDigest(w.deps(), DAILY({ sections: [] }));
  assert.equal(sent.skipped, false, 'the held notice was dropped with the empty digest');
  assert.match(String(w.of('notify.email')[0]!.payload.text), /Payment failed for Invoice 41/);

  const empty = world({ quiet: WINDOW, nowMs: MORNING, held: [] });
  assert.equal(runDigest(empty.deps(), DAILY({ sections: [] })).skipped, true, 'an empty digest was sent');
});

test('five held lines at most, and the rest are counted', () => {
  const held = Array.from({ length: 8 }, (_, i) => ({ at: NIGHT + i * 60_000, say: `Payment ${i + 1} failed` }));
  const w = world({ quiet: WINDOW, nowMs: MORNING, held });
  runDigest(w.deps(), DAILY({ sections: [] }));
  const text = String(w.of('notify.email')[0]!.payload.text);
  assert.match(text, /Payment 5 failed/);
  assert.doesNotMatch(text, /Payment 6 failed/);
  assert.match(text, /And 3 more\./);
});

test('`heldIn` keeps what was said inside the window, soonest first', () => {
  const said = [
    { at: NIGHT + 60_000, say: 'second' },
    { at: AFTERNOON, say: 'loud' },
    { at: NIGHT, say: 'first' },
  ];
  assert.deepEqual(heldIn(said, TZ, WINDOW).map((h) => h.say), ['first', 'second']);
  assert.deepEqual(heldIn(said, TZ, 'off'), []);
});

/* ── the default window ──────────────────────────────────────────────────── */

test('THE DEFAULT WINDOW IS 21:00 TO 08:00 for a record that set none, and a set window is kept', () => {
  assert.deepEqual(QUIET_DEFAULT, { from: '21:00', to: '08:00' });
  assert.deepEqual(quietOf(null), { from: '21:00', to: '08:00' });
  assert.deepEqual(quietOf(undefined), { from: '21:00', to: '08:00' });
  assert.equal(inQuietHours(EVENING, TZ), true, 'half past nine was loud');
  assert.equal(inQuietHours(Date.UTC(2026, 8, 5, 19, 59), TZ), false, 'a minute to nine was quiet');
  assert.equal(inQuietHours(MORNING, TZ), false, 'eight in the morning was still quiet');

  assert.deepEqual(quietOf('{"from":"22:00","to":"08:00"}'), { from: '22:00', to: '08:00' }, 'a record that chose the old hours lost them');
  assert.deepEqual(quietOf('{"from":"23:30","to":"6:15"}'), { from: '23:30', to: '06:15' });
  assert.equal(quietOf('off'), 'off');
  assert.equal(inQuietHours(EVENING, TZ, quietOf('{"from":"22:00","to":"08:00"}')), false);
});

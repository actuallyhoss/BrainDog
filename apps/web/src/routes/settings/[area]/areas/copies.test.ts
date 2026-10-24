/**
 * `boot`'s `copies`, said as Settings says them (LCH-C03).
 *
 * THE SHAPE IS THE RECORD'S AND NOT WRITTEN HERE TWICE: `{ last_copy_at, last_copy_bytes, last_export_at }`, each
 * possibly `null`, as `packages/kernel/src/copies.ts` answers it. The cases are the ones a screen can meet: a copy in
 * last night, one past 26 hours, a record with no copy yet, a host older than the field, and a value of the wrong shape.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DRILL_DUE_MS, LATE_MS, NIGHT_CAUSE, ago, copiesOf, copyLine, drillLine, drillOf, exportLine, failedNight, readDrill } from './copies.ts';

const NOW = Date.parse('2026-10-09T12:00:00Z');
const back = (ms: number) => new Date(NOW - ms).toISOString();
const H = 3_600_000;

test("the record's facts are read as they come, and a host older than the field draws no line", () => {
  const facts = { last_copy_at: back(9 * H), last_copy_bytes: 2_100_000, last_export_at: null };
  assert.deepEqual(copiesOf({ copies: facts }), facts);
  assert.equal(copiesOf({ registers: [] }), null);
  assert.equal(copiesOf(null), null);
  assert.equal(copiesOf({ copies: null }), null);
});

test('a value of the wrong shape is that fact unknown, never a date of 1970', () => {
  assert.deepEqual(copiesOf({ copies: { last_copy_at: 'soon', last_copy_bytes: -4, last_export_at: 0 } }), {
    last_copy_at: null,
    last_copy_bytes: null,
    last_export_at: null,
  });
});

test('last night\'s copy reads its age and size, and is not late', () => {
  const line = copyLine({ last_copy_at: back(9 * H), last_copy_bytes: 2_100_000, last_export_at: null }, NOW);
  assert.deepEqual(line, { text: 'Last copy: 9 hours ago, 2.10 MB', late: false });
  assert.equal(copyLine({ last_copy_at: back(9 * H), last_copy_bytes: null, last_export_at: null }, NOW).text, 'Last copy: 9 hours ago');
});

test('past 26 hours the copy is late, and at 26 hours it is not yet', () => {
  assert.equal(copyLine({ last_copy_at: back(LATE_MS), last_copy_bytes: 10, last_export_at: null }, NOW).late, false);
  const late = copyLine({ last_copy_at: back(LATE_MS + 60_000), last_copy_bytes: 10, last_export_at: null }, NOW);
  assert.equal(late.late, true);
  assert.equal(late.text, 'Last copy: yesterday, 10 B');
});

test('a record with no copy yet reads "First copy tonight", never a fault', () => {
  assert.deepEqual(copyLine({ last_copy_at: null, last_copy_bytes: null, last_export_at: null }, NOW), { text: 'First copy tonight', late: false });
});

test('the export reads when it was taken, or that it never was', () => {
  assert.equal(exportLine({ last_copy_at: null, last_copy_bytes: null, last_export_at: back(3 * 24 * H) }, NOW), 'Last exported: 3 days ago');
  assert.equal(exportLine({ last_copy_at: back(H), last_copy_bytes: 1, last_export_at: null }, NOW), 'Never exported');
});

test('an age is said in the unit a person uses, one of each in the singular', () => {
  assert.equal(ago(back(20_000), NOW), 'just now');
  assert.equal(ago(back(60_000), NOW), '1 minute ago');
  assert.equal(ago(back(45 * 60_000), NOW), '45 minutes ago');
  assert.equal(ago(back(H), NOW), '1 hour ago');
  assert.equal(ago(back(30 * H), NOW), 'yesterday');
  assert.equal(ago(back(49 * H), NOW), '2 days ago');
  /* A CLOCK A LITTLE BEHIND THE HOST'S is "just now", never a negative age. */
  assert.equal(ago(new Date(NOW + 5_000).toISOString(), NOW), 'just now');
});

test('no line carries an em dash or an id', () => {
  const lines = [
    copyLine({ last_copy_at: back(9 * H), last_copy_bytes: 2_100_000, last_export_at: null }, NOW).text,
    copyLine({ last_copy_at: null, last_copy_bytes: null, last_export_at: null }, NOW).text,
    exportLine({ last_copy_at: null, last_copy_bytes: null, last_export_at: null }, NOW),
  ];
  for (const line of lines) assert.doesNotMatch(line, /\u2014|#\d|[0-9A-HJKMNP-TV-Z]{26}/, line);
});

/* THIS HOST'S LAST RESTORE TEST (LCH-C04): `GET /account/drill`, `{ ok, value: { at, pass, record_copies } | { at: null } }`. */

const D = 24 * H;
/** A door that answers `status` with `body`, and keeps the address it was asked. */
const door = (status: number, body: unknown) => {
  const asked: string[] = [];
  const io = (async (url: string | URL | Request) => {
    asked.push(String(url));
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { io, asked };
};

test('a passed test reads its age, and is no fault', async () => {
  const { io, asked } = door(200, { ok: true, value: { at: back(12 * D), pass: true, record_copies: 3 } });
  const drill = await readDrill(io);
  assert.deepEqual(asked, ['/account/drill']);
  assert.deepEqual(drill, { at: back(12 * D), pass: true, records: 3 });
  assert.deepEqual(drillLine(drill!, NOW), { text: "This BrainDog's last restore test: passed 12 days ago", fault: false, mark: null });
});

test('a failed test is a fault, and the word failed says so beside the red', async () => {
  const { io } = door(200, { ok: true, value: { at: back(3 * D), pass: false, record_copies: 0 } });
  const line = drillLine((await readDrill(io))!, NOW);
  assert.deepEqual(line, { text: "This BrainDog's last restore test: failed 3 days ago", fault: true, mark: null });
});

test('a test that tried no record reads what it did, never "passed", and is a fault with its word', async () => {
  const { io } = door(200, { ok: true, value: { at: back(12 * D), pass: true, record_copies: 0 } });
  const line = drillLine((await readDrill(io))!, NOW);
  assert.deepEqual(line, {
    text: "This BrainDog's last restore test, 12 days ago: the Directory's copy opened; no record's copy was tried",
    fault: true,
    mark: 'Not proven',
  });
  assert.doesNotMatch(line.text, /passed/);
  // Past 35 days it is still this line: an overdue test that proved nothing is not "passed" with an Overdue mark.
  const old = drillLine({ at: back(DRILL_DUE_MS + D), pass: true, records: 0 }, NOW);
  assert.doesNotMatch(old.text, /passed/);
  assert.equal(old.mark, 'Not proven');
  // One record's copy is enough to read as a pass.
  assert.match(drillLine({ at: back(12 * D), pass: true, records: 1 }, NOW).text, /passed 12 days ago$/);
});

test('a pass with no count draws no line, where a failure with none still reads failed', () => {
  assert.equal(drillOf({ at: back(D), pass: true }), null);
  assert.equal(drillOf({ at: back(D), pass: true, record_copies: -1 }), null);
  assert.equal(drillOf({ at: back(D), pass: true, record_copies: '3' }), null);
  assert.deepEqual(drillOf({ at: back(D), pass: false }), { at: back(D), pass: false, records: 0 });
  /* A HOST ON THE BUILD BEFORE THE NAME MOVED still answers `records`, and its line is still drawn. */
  assert.deepEqual(drillOf({ at: back(D), pass: true, records: 3 }), { at: back(D), pass: true, records: 3 });
  assert.deepEqual(drillOf({ at: back(D), pass: true, record_copies: 2, directory_only: false }), { at: back(D), pass: true, records: 2 });
});

test('a host never tested reads "Never tested" as a fault, and stays red until the first test', async () => {
  const { io } = door(200, { ok: true, value: { at: null } });
  const drill = await readDrill(io);
  assert.deepEqual(drill, { at: null });
  const line = drillLine(drill!, NOW);
  assert.equal(line.fault, true);
  assert.equal(line.mark, 'Never tested');
  assert.equal(line.text, 'No copy on this BrainDog has been restored as a test yet');
});

test("a self-host has no such door: its 404 draws no line, nor does a 401 or a host that cannot be reached", async () => {
  assert.equal(await readDrill(door(404, '<!doctype html><title>Not found</title>').io), null);
  assert.equal(await readDrill(door(404, { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'x' } }).io), null);
  /* THE STATUS DECIDES, NOT THE BODY: a 404 never reads as "Never tested", whatever it carries. */
  assert.equal(await readDrill(door(404, { ok: true, value: { at: null } }).io), null);
  assert.equal(await readDrill(door(401, { ok: false, refusal: { code: 'UNAUTHORIZED', fix: 'x' } }).io), null);
  assert.equal(await readDrill((async () => { throw new TypeError('offline'); }) as typeof fetch), null);
  /* A 200 THAT IS NOT THE DOOR'S ANSWER is no line either, never a test that passed in 1970. */
  assert.equal(await readDrill(door(200, '<html></html>').io), null);
  assert.equal(drillOf({ at: 'soon', pass: true }), null);
  assert.equal(drillOf({ at: back(D), pass: 'yes' }), null);
});

test('a pass past 35 days is overdue, marked with the word, and at 35 days it is not yet', () => {
  assert.equal(drillLine({ at: back(DRILL_DUE_MS), pass: true, records: 1 }, NOW).fault, false);
  const late = drillLine({ at: back(DRILL_DUE_MS + 60_000), pass: true, records: 1 }, NOW);
  assert.deepEqual(late, { text: "This BrainDog's last restore test: passed 35 days ago", fault: true, mark: 'Overdue' });
});

test('no drill line carries an em dash, an id or a path', () => {
  const lines = [
    drillLine({ at: back(12 * D), pass: true, records: 3 }, NOW),
    drillLine({ at: back(D), pass: false, records: 0 }, NOW),
    drillLine({ at: back(D), pass: true, records: 0 }, NOW),
    drillLine({ at: null }, NOW),
  ].flatMap((l) => [l.text, l.mark ?? '']);
  for (const line of lines) assert.doesNotMatch(line, /\u2014|#\d|[0-9A-HJKMNP-TV-Z]{26}|\//, line);
  /* NO COPY FILE, KEY OR BUCKET: the line says what was tested, never where the copies live or what opens them. */
  for (const line of lines) assert.doesNotMatch(line, /\.brainl|\.dirl|\.age\b|\bbucket|blobs|\bR2\b|\bkeys?\b|identity|PROVISION/i, line);
});

test('a drill reported a moment ago reads "just now", as the operator sees it after the first report', () => {
  assert.equal(drillLine({ at: back(30_000), pass: true, records: 3 }, NOW).text, "This BrainDog's last restore test: passed just now");
});

/* ── a night that failed, and why (A22) ─────────────────────────────────── */

const SAID = 'BrainDog could not save a copy of your record. It tries again tonight.';
const planted = (over: Record<string, unknown> = {}) => [
  { cause: 'outbox#infer.resolve', said: 'Something else broke.', count: 2, since: back(30 * H), last: back(2 * H) },
  { cause: NIGHT_CAUSE, said: SAID, count: 1, since: back(9 * H), last: back(9 * H), why: 'Your record was too large to copy in one piece.', ...over },
];

test('A PLANTED FAILED NIGHT SHOWS ITS REASON IN PLAIN WORDS, marked with a word and never the colour alone', () => {
  assert.deepEqual(failedNight(planted(), NOW), {
    text: 'Last night’s copy failed. Your record was too large to copy in one piece. It tries again tonight.',
    mark: 'Failed',
  });
  /* NIGHTS RUNNING ARE COUNTED, and a failure from days ago says when rather than last night. */
  assert.equal(
    failedNight(planted({ count: 3, last: back(3 * 24 * H) }), NOW)?.text,
    'The copy 3 days ago failed, 3 nights running. Your record was too large to copy in one piece. It tries again tonight.',
  );
});

test('NO FAILED NIGHT, NO REASON, OR NO LIST DRAWS NO LINE, and the raw error is never what is said', () => {
  assert.equal(failedNight(planted().slice(0, 1), NOW), null);
  assert.equal(failedNight(planted({ why: undefined }), NOW), null, 'a record built before the reason');
  assert.equal(failedNight(null, NOW), null);
  const line = failedNight(planted({ error: 'R2 bucket braindog-copies refused' }), NOW);
  assert.ok(line && !line.text.includes('bucket'));
});

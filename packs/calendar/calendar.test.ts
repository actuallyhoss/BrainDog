/**
 * Calendar: the next sixty days of one Google or Outlook calendar from its ICS address, one row an occurrence. The
 * script is run alone in QuickJS over a host double that answers an ICS file written here, in Cairo's zone with its
 * summer and winter rules, and the pack as it ships is read by the add-on door. Every event here is invented.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { readPackFile } from '../../packages/declare/src/catalogue.ts';
import { fixOf } from '../../packages/ports/src/index.ts';
import type { CtxHost, Json, ScriptAnswer, ScriptDecl } from '../../packages/script/src/index.ts';
import { runInQuickJs } from '../../packages/script/src/quickjs.ts';

const HERE = new URL('./', import.meta.url);
const SOURCE = readFileSync(new URL('calendar.js', HERE), 'utf8');
const TEXT = readFileSync(new URL('calendar.pack.json', HERE), 'utf8');
const PACK = JSON.parse(TEXT) as { version: string; declarations: Record<string, unknown>[]; widgets: { id: string }[] };
const SCRIPT = PACK.declarations.find((d) => typeof d.script === 'string') as { script: string; egress: string[]; keys: string[]; reads: string[]; writes: string[]; source: string };
/* THE KEY AS INSTALL FILLS IT: the setting's default label. */
const LABEL = 'Calendar link';

const ICS = [
  'BEGIN:VCALENDAR', 'X-WR-CALNAME:Home', 'X-WR-TIMEZONE:Africa/Cairo',
  'BEGIN:VTIMEZONE', 'TZID:Africa/Cairo',
  'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0300', 'DTSTART:19700424T000000', 'RRULE:FREQ=YEARLY;BYMONTH=4;BYDAY=-1FR', 'END:DAYLIGHT',
  'BEGIN:STANDARD', 'TZOFFSETFROM:+0300', 'TZOFFSETTO:+0200', 'DTSTART:19701030T000000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1TH', 'END:STANDARD',
  'END:VTIMEZONE',
  'BEGIN:VEVENT', 'UID:one@x', 'SUMMARY:Call with the accountant', 'DTSTART;TZID=Africa/Cairo:20261030T100000', 'DTEND;TZID=Africa/Cairo:20261030T103000', 'LOCATION:Phone', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:weekly@x', 'SUMMARY:Standup', 'DTSTART:20240101T070000Z', 'DTEND:20240101T071500Z', 'RRULE:FREQ=WEEKLY;BYDAY=MO,WE', 'EXDATE:20261102T070000Z', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:weekly@x', 'RECURRENCE-ID:20261104T070000Z', 'SUMMARY:Standup (moved)', 'DTSTART:20261105T090000Z', 'DTEND:20261105T091500Z', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:day@x', 'SUMMARY:Holiday', 'DTSTART;VALUE=DATE:20261106', 'DTEND;VALUE=DATE:20261107', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:off@x', 'SUMMARY:Cancelled thing', 'STATUS:CANCELLED', 'DTSTART:20261101T100000Z', 'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

const decl = (): ScriptDecl => ({ id: SCRIPT.script, version: 1, egress: SCRIPT.egress, keys: [LABEL], reads: SCRIPT.reads, writes: SCRIPT.writes, source: SCRIPT.source });
/* THE HOST DOUBLE STANDS IN FOR `addressed`: it is handed the label, never a URL, and answers the file for the one key. */
const hostOf = (address: string, held: Json[] = []): CtxHost =>
  ({
    fetch: async (r: { url: string; address?: string | null }) => {
      assert.equal(r.url, '', 'the script never names the link');
      if (r.address !== LABEL) throw new Error('not that key');
      return { status: 200, headers: {}, body: ICS };
    },
    list: async () => held,
    get: async () => null,
    now: () => '2026-10-29T09:00:00.000Z',
    clock: () => 0,
    tz: 'Africa/Cairo',
    input: {},
    config: { address },
  }) as unknown as CtxHost;
type W = { op: string; spoken?: string; fields?: Record<string, Json>; patch?: Record<string, Json> };
const writes = (a: ScriptAnswer): W[] => {
  assert.ok('writes' in a, JSON.stringify(a));
  return a.writes as unknown as W[];
};
const ADDRESS = LABEL;

test('THE PACK CARRIES calendar.js, CALLS ONLY GOOGLE AND OUTLOOK, AND KEEPS THE LINK IN THE KEYS', async () => {
  assert.equal(SCRIPT.source, SOURCE);
  assert.deepEqual(SCRIPT.egress, ['https://calendar.google.com', 'https://outlook.office365.com', 'https://outlook.live.com']);
  assert.deepEqual(PACK.widgets.map((w) => w.id), ['calendar-next', 'calendar-today', 'calendar-invites']);
  const file = await readPackFile(TEXT);
  assert.ok(file.ok, fixOf(file));
  /* 2.1.0 SINCE 3 November (23aeeb9b4): invitations and their widget. 2.1.3 SINCE 3 November (3ea2e541c): plugin in its words. */
  assert.equal(PACK.version, '2.1.3');
  /* ITS PAGE IS `events`: BrainDog's own Calendar is `page.calendar` on every record, and 1.x declared the same id, so the
     plan said "Calendar is already here, from BrainDog" and the add-on could never be installed. */
  assert.deepEqual(PACK.declarations.filter((d) => typeof d.page === 'string').map((d) => d.page), ['events']);
  assert.deepEqual((SCRIPT as unknown as { keys: string[] }).keys, ['{{config:address}}'], 'the link is a key, named by the setting');
});

test('EACH OCCURRENCE IN THE WINDOW IS ONE ROW, IN THE CALENDAR\'S OWN CLOCK ACROSS THE CHANGE OF THE CLOCKS', async () => {
  const w = writes(await runInQuickJs(decl(), hostOf(ADDRESS)));
  const by = new Map(w.map((x) => [String(x.fields!.key), x.fields!]));
  assert.deepEqual([by.get('one@x')!.day, by.get('one@x')!.time, by.get('one@x')!.starts], ['2026-10-30', '10:00', '2026-10-30T08:00:00.000Z']);
  /* 07:00 UTC is 10:00 in Cairo's summer, on the 28th, and 09:00 once the clocks go back on the 30th. */
  assert.equal(by.get('weekly@x@2026-10-28')!.time, '10:00');
  assert.equal(by.get('weekly@x@2026-11-09')!.time, '09:00');
  assert.equal(by.has('weekly@x@2026-11-02'), false, 'a skipped date is skipped');
  assert.deepEqual([by.get('weekly@x@2026-11-04')!.day, by.get('weekly@x@2026-11-04')!.what], ['2026-11-05', 'Standup (moved)']);
  assert.deepEqual([by.get('day@x')!.all_day, by.get('day@x')!.time], [true, undefined]);
  assert.equal([...by.keys()].some((k) => k.startsWith('off@x')), false, 'nothing cancelled');
  assert.equal([...by.values()].every((f) => String(f.day) >= '2026-10-28' && String(f.day) <= '2026-12-28'), true);
});

test('A HELD EVENT THAT LEFT THE CALENDAR IS MARKED GONE, AND A KEY IT DOES NOT DECLARE IS REFUSED', async () => {
  const held = [{ id: 'e9', register: 'events', seq: 9, version: 1, fields: { key: 'old@x', what: 'Old', day: '2026-11-01', gone: false } }];
  const w = writes(await runInQuickJs(decl(), hostOf(ADDRESS, held as unknown as Json[])));
  assert.deepEqual(w.find((x) => x.spoken === 'events#9')?.patch, { gone: true });
  const out = await runInQuickJs(decl(), hostOf('Some other key'));
  assert.ok('refused' in out, 'a key the script does not declare is refused before the host is asked');
});

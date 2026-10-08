/**
 * What each pattern did, as a person reads it: filed and held per pattern, each held reason in plain words, the messages
 * no pattern read, and nothing at all for a pattern or a door with nothing to say.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { heldSaid, isRepeat, panelOf, readReport, reportOf, type PatternLine, type PatternReport } from './patterns.ts';

const line = (over: Partial<PatternLine>): PatternLine => ({ ingest: 'hsbc_card', said: 'Card purchases', filed: 0, skipped: [], waiting: 0, ...over });

const report = (doors: PatternReport['doors']): PatternReport => ({ days: 14, since: '2026-09-24T00:00:00.000Z', doors });

test('a pattern says what it filed and what it held, with each reason in plain words', () => {
  const panel = panelOf(
    report([
      {
        door: 'hsbc_sms',
        said: 'HSBC Egypt',
        unread: 2,
        patterns: [
          line({ filed: 12 }),
          line({
            ingest: 'hsbc_account',
            said: 'Account movements',
            filed: 3,
            skipped: [
              { reason: 'Looks like a repeat of Corner Shop, EGP 120.00, 7 Oct.', n: 1 },
              { reason: 'A balance alert is a position \u2014 not a movement', n: 2 },
            ],
            waiting: 1,
          }),
        ],
      },
    ]),
  );
  assert.ok(panel);
  assert.equal(panel.sentence, 'In the last 14 days: 15 filed, 4 held, 2 no pattern read.');
  const [door] = panel.doors;
  assert.equal(door!.name, 'HSBC Egypt');
  assert.equal(door!.unread, '2 messages no pattern read.');
  /* THE ONE THAT HELD SOMETHING LEADS, and its counts and reasons carry words, never an id. */
  assert.deepEqual(door!.patterns[0], {
    key: 'hsbc_account',
    name: 'Account movements',
    counts: '3 filed, 4 held',
    held: ['Looks like a repeat of Corner Shop, EGP 120.00, 7 Oct.', 'A balance alert is a position, not a movement. 2 like this.'],
    waiting: '1 waits for you to decide.',
  });
  assert.deepEqual(door!.patterns[1], { key: 'hsbc_card', name: 'Card purchases', counts: '12 filed', held: [], waiting: null });
  for (const p of door!.patterns) for (const text of [p.name, p.counts, ...p.held]) assert.doesNotMatch(text, /\u2014|hsbc_|row/u);
});

test('many repeats are one counted line, since each names the one it repeats', () => {
  const held = heldSaid([
    { reason: 'Looks like a repeat of Corner Shop, EGP 120.00, 7 Oct.', n: 1 },
    { reason: 'Looks like a repeat of Uber, EGP 85.50, 6 Oct.', n: 2 },
  ]);
  assert.deepEqual(held, ['3 messages looked like repeats of ones already filed.']);
  assert.equal(isRepeat('Looks like a repeat of Uber.'), true);
  assert.equal(isRepeat('Not a message from the bank.'), false);
  assert.equal(isRepeat(null), false);
});

test('a pattern, a door or a whole report with nothing to say draws nothing', () => {
  assert.equal(panelOf(null), null);
  assert.equal(panelOf(report([])), null);
  /* A RECORD WITH NO PATTERN draws no tile, even with messages nothing read. */
  assert.equal(panelOf(report([{ door: 'email', said: 'Mail', unread: 4, patterns: [] }])), null);
  assert.equal(panelOf(report([{ door: 'mail', said: 'Mail', unread: 0, patterns: [line({})] }])), null);

  const panel = panelOf(report([{ door: 'hsbc_sms', said: 'HSBC Egypt', unread: 0, patterns: [line({}), line({ ingest: 'b', said: 'Transfers', filed: 0, waiting: 2 })] }]));
  assert.deepEqual(panel?.doors[0]?.patterns.map((p) => [p.name, p.counts]), [['Transfers', 'None filed, 2 held']]);
  assert.equal(panel?.sentence, 'In the last 14 days: 0 filed, 2 held.');

  /* A DOOR WHERE ONLY UNREAD MESSAGES CAME still says so. */
  const unread = panelOf(report([{ door: 'email', said: 'Mail', unread: 1, patterns: [line({})] }]));
  assert.deepEqual(unread?.doors, [{ key: 'email', name: 'Mail', patterns: [], unread: '1 message no pattern read.' }]);
});

test("the report is read from the record's answer, and anything else is no report", async () => {
  const value = report([{ door: 'hsbc_sms', said: 'HSBC Egypt', unread: 0, patterns: [line({ filed: 1 })] }]);
  assert.deepEqual(reportOf({ ok: true, value }), value);
  assert.equal(reportOf({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'No.' } }), null);
  assert.equal(reportOf('<html>'), null);

  const sent: { url: string; body: unknown }[] = [];
  const io = async (url: string, init?: RequestInit) => {
    sent.push({ url, body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify({ ok: true, value }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  assert.deepEqual(await readReport('http://record.test', io), value);
  assert.deepEqual(sent, [{ url: 'http://record.test/api/inboxPatterns', body: { days: 14 } }]);

  assert.equal(await readReport('http://record.test', async () => new Response(null, { status: 404 })), null);
  assert.equal(
    await readReport('http://record.test', async () => {
      throw new TypeError('fetch failed');
    }),
    null,
  );
});

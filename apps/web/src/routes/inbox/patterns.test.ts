/**
 * What each pattern did, as a person reads it: filed and held per pattern, each held reason in plain words, the messages
 * no pattern read, and nothing at all for a pattern or a door with nothing to say.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { heldSaid, isRepeat, panelOf, readRepeats, readReport, reportOf, REPEATS_MOST, type PatternLine, type PatternReport } from './patterns.ts';

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
  assert.equal(isRepeat('transactions#4 already says this.'), true);
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

/* ── the repeats the tile offers "It is a second one" on ─────────────────── */

type Skip = { id: string; reason: string; repeats?: string };

/**
 * A record that answers `inbox` as the record does: newest first, at most 200 to a page, and with `repeats: true` only
 * the arrivals ingest marked as repeating a row. Every ask is kept, so a test can say what was asked.
 */
function record(skips: readonly Skip[]): { io: (url: string) => Promise<Response>; asked: URLSearchParams[] } {
  const asked: URLSearchParams[] = [];
  const io = async (url: string) => {
    const q = new URL(url).searchParams;
    asked.push(q);
    const limit = Math.min(Number(q.get('limit') ?? 50), 200);
    const arrivals = skips
      .map((s, i) => ({ rowid: skips.length - i, id: s.id, ts: new Date(Date.UTC(2026, 9, 9, 12) - i * 60_000).toISOString(), channel: 'sms', from: 'HSBC', to: '', subject: '', body: `Text ${s.id}`, state: 'skipped', reason: s.reason, ...(s.repeats ? { repeats: s.repeats } : {}) }))
      .filter((a) => q.get('repeats') !== 'true' || 'repeats' in a)
      .slice(0, limit);
    return new Response(JSON.stringify({ ok: true, value: { arrivals, cursor: null } }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return { io, asked };
}

const balance = (n: number): Skip[] => Array.from({ length: n }, (_, i) => ({ id: `bal_${i}`, reason: 'A balance alert is a position, not a movement.' }));

/* A MARKED REPEAT IN THE OLD WORDS: what a pre-35 repeat reads like once the kernel marks it. On a real record a repeat
   skipped before batch 35 has no `match` line and no mark yet, so the record does not answer it here at all. */
test('a marked repeat in the words before batch 35 offers the press, and never says the list it repeats by its handle', async () => {
  const { io, asked } = record([{ id: 'raw_old', reason: 'transactions#4 already says this.', repeats: '01J9ZQ4M8X3V6T2R5N7K1P0WQY' }]);
  const held = await readRepeats('http://record.test', io);
  assert.deepEqual(held.map((r) => [r.id, r.reason]), [['raw_old', 'Looks like a repeat of one already filed.']]);
  for (const r of held) assert.doesNotMatch(`${r.reason} ${r.subject}`, /#\d|01J9|\u2014/u);
  /* THE RECORD IS ASKED FOR ITS REPEATS ALONE, by the mark, and only as many as the tile offers. */
  assert.equal(asked[0]!.get('repeats'), 'true');
  assert.equal(asked[0]!.get('state'), 'skipped');
  assert.equal(asked[0]!.get('limit'), String(REPEATS_MOST));
});

test('a page full of balance alerts set aside does not push a real second charge off', async () => {
  /* MORE THAN A WHOLE PAGE of other skips, all newer than the repeat: one page of skipped texts never reached it. */
  const skips = [...balance(250), { id: 'raw_twice', reason: 'Looks like a repeat of Corner Shop, EGP 120.00, 7 Oct.', repeats: '01J9ZQ4M8X3V6T2R5N7K1P0WQY' }];
  const held = await readRepeats('http://record.test', record(skips).io);
  assert.deepEqual(held.map((r) => [r.id, r.reason]), [['raw_twice', 'Looks like a repeat of Corner Shop, EGP 120.00, 7 Oct.']]);

  /* AND THIRTY OF THEM beside one repeat still show the repeat alone. */
  const few = await readRepeats('http://record.test', record([...balance(30), skips.at(-1)!]).io);
  assert.deepEqual(few.map((r) => r.id), ['raw_twice']);
});

test("a rule's skip never offers the press, even from a record that answers it among the repeats", async () => {
  /* A RECORD THAT DOES NOT KNOW `repeats` answers every skip; only the marked one shows. */
  const careless = async () =>
    new Response(
      JSON.stringify({
        ok: true,
        value: {
          arrivals: [
            { rowid: 2, id: 'raw_rule', ts: '2026-10-09T12:00:00.000Z', channel: 'sms', from: 'HSBC', to: '', subject: '', body: 'Balance', state: 'skipped', reason: 'Looks like a repeat, by the rule that sets aside balance alerts.' },
            { rowid: 1, id: 'raw_twice', ts: '2026-10-09T11:00:00.000Z', channel: 'sms', from: 'HSBC', to: '', subject: '', body: 'Corner Shop', state: 'skipped', reason: 'Looks like a repeat of Corner Shop.', repeats: '01J9ZQ4M8X3V6T2R5N7K1P0WQY' },
          ],
          cursor: null,
        },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  assert.deepEqual((await readRepeats('http://record.test', careless)).map((r) => r.id), ['raw_twice']);
  assert.deepEqual(await readRepeats('http://record.test', record(balance(3)).io), []);

  /* A RECORD THAT REFUSES THE ASK, or is not there, offers no repeats rather than a guess. */
  const refused = async () => new Response(JSON.stringify({ ok: false, refusal: { code: 'VALUE_MALFORMED', fix: 'No.' } }), { status: 422, headers: { 'content-type': 'application/json' } });
  assert.deepEqual(await readRepeats('http://record.test', refused), []);
  assert.deepEqual(await readRepeats('http://record.test', async () => { throw new TypeError('fetch failed'); }), []);
});

test("the report's tile never says a repeat by the old handle either", () => {
  assert.deepEqual(heldSaid([{ reason: 'transactions#4 already says this.', n: 1 }]), ['Looks like a repeat of one already filed.']);
});

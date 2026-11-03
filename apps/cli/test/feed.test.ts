/**
 * `braindog feed propose <file>`: a setup file of two feeds files two questions, each the live feed add-on filled by
 * its own `fillFeed`, and a file with one fault is refused in one sentence naming its line, before anything is asked.
 *
 * THE HOST IS A STUB ON node:http, as in `understand.test.ts`, because apps never import apps. What the record does
 * with the question (the plan line `CALLS OUT <host> · every 1d`, the install once approved) is the add-on's own test,
 * `packs/live-feed/live-feed.test.ts`, over the real record.
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { fillFeed } from '@braindog/pack-live-feed/fill.ts';
import TEMPLATE from '@braindog/pack-live-feed/live-feed.pack.json' with { type: 'json' };

import { elementLines, feedCommand, questionOf, readFeeds } from '../src/feed.ts';
import type { AgentIo } from '../src/skills.ts';

const scratch = mkdtempSync(join(tmpdir(), 'braindog-feed-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

/** Two feeds as a person writes them: one hourly, one of day counts dated from the answer and money in cents. */
const FILE = `[
  {
    "id": "oxbow-gg",
    "url": "https://oxbow.gg/api/stats",
    "every": "1h",
    "project": "things#1",
    "measures": [
      { "name": "Active users", "path": "data.users", "type": "int" },
      { "name": "Monthly revenue", "path": "data.mrr", "money": { "currency": "USD", "minor": true } }
    ]
  },
  {
    "id": "pinwheel",
    "url": "https://pinwheel.example/api/daily",
    "every": "1d",
    "at": "07:00",
    "tz": "Africa/Cairo",
    "measures": [{ "name": "Drawings", "path": "count", "at": { "path": "day", "as": "day" } }]
  }
]
`;

async function host(t: { after: (fn: () => Promise<void>) => void }, answer: (method: string, body: Record<string, unknown>) => unknown) {
  const seen: { method: string; body: Record<string, unknown> }[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const url = new URL(req.url ?? '/', 'http://stub');
      const method = url.pathname.replace(/^\/api\//, '');
      const raw = Buffer.concat(chunks).toString('utf8');
      const body = (raw ? JSON.parse(raw) : Object.fromEntries(url.searchParams)) as Record<string, unknown>;
      seen.push({ method, body });
      const said = answer(method, body) as { refusal?: unknown };
      res.writeHead(said.refusal ? 409 : 200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(said));
    });
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  t.after(
    () =>
      new Promise<void>((done) => {
        server.closeAllConnections();
        server.close(() => done());
      }),
  );
  return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, seen };
}

function io(base: string): AgentIo & { lines: string[]; said: string[]; answered: unknown[] } {
  const lines: string[] = [];
  const said: string[] = [];
  const answered: unknown[] = [];
  return {
    env: { BRAINDOG_HOST: base, BRAINDOG_TOKEN: 'rec_01TESTTESTTESTTESTTESTTEST.feed', XDG_CONFIG_HOME: join(scratch, 'config') },
    cwd: scratch,
    home: scratch,
    out: (l) => void lines.push(l),
    say: (l) => void said.push(l),
    answer: (a) => void answered.push(a),
    headers: async () => ({}),
    lines,
    said,
    answered,
  };
}

const write = (name: string, text: string): string => {
  const path = join(scratch, name);
  writeFileSync(path, text);
  return path;
};

test('A FILE OF TWO FEEDS FILES TWO QUESTIONS, each the live feed add-on as its own fill builds it, with its document', async (t) => {
  const h = await host(t, (method) => (method === 'governance' ? { ok: true, value: [] } : { ok: true, value: { id: 'q' } }));
  const me = io(h.base);
  assert.equal(await feedCommand(['propose', write('feeds.json', FILE)], me), 0, me.said.join('\n'));

  const asked = h.seen.filter((s) => s.method === 'propose').map((s) => s.body);
  const specs = JSON.parse(FILE) as Parameters<typeof fillFeed>[1][];
  assert.deepEqual(
    asked,
    specs.map((spec) => {
      const doc = fillFeed(TEMPLATE as Record<string, unknown>, spec);
      return { question: questionOf(spec), body_kind: 'pack', body: { install: doc.pack, doc } };
    }),
  );
  assert.deepEqual(
    asked.map((a) => a.question),
    ['Poll oxbow.gg every 1h for Active users and Monthly revenue?', 'Poll pinwheel.example every 1d for Drawings?'],
  );
  /* MONEY IS AN AMOUNT AND A DATED DAY IS READ FROM THE ANSWER, as the add-on writes them, never re-made here. */
  const first = (asked[0]!.body as unknown as { doc: { declarations: { map: Record<string, unknown>[] }[] } }).doc.declarations[0]!.map;
  assert.deepEqual(first[1]!.amount, { path: 'data.mrr', type: 'money', currency: 'USD', minor: true });
  assert.equal(first[1]!.value, undefined);
  assert.deepEqual(me.lines, ['Asked on Decide: Numbers from oxbow.gg, every 1h.', 'Asked on Decide: Numbers from pinwheel.example, every 1d.']);
  assert.deepEqual(me.answered, [{ value: { asked: ['Numbers from oxbow.gg', 'Numbers from pinwheel.example'], before: [], refused: [] } }]);
});

test('RUN TWICE, A FEED WHOSE QUESTION STILL WAITS IS NOT ASKED AGAIN, and one already installed is said so', async (t) => {
  const waiting = fillFeed(TEMPLATE as Record<string, unknown>, (JSON.parse(FILE) as Parameters<typeof fillFeed>[1][])[0]!);
  const h = await host(t, (method) =>
    method === 'governance'
      ? { ok: true, value: [{ id: 's1', status: 'open', body: { install: waiting.pack, doc: waiting } }] }
      : { ok: false, refusal: { code: 'TRANSITION_ILLEGAL', fix: 'feed-pinwheel is installed at this version.' } },
  );
  const me = io(h.base);
  assert.equal(await feedCommand(['propose', write('again.json', FILE)], me), 0, me.said.join('\n'));
  assert.equal(h.seen.filter((s) => s.method === 'propose').length, 1);
  assert.deepEqual(me.lines, ['Already waiting on Decide: Numbers from oxbow.gg.', 'Already there: Numbers from pinwheel.example.']);
});

test('A BAD FILE IS REFUSED IN ONE SENTENCE NAMING THE LINE, and nothing is asked', async (t) => {
  const h = await host(t, () => ({ ok: true, value: [] }));

  /* The second feed's id is too long for its poll: the add-on's own words, at the line the feed starts on. */
  const long = FILE.replace('"id": "pinwheel"', '"id": "pinwheel-daily-drawings-count"');
  const me = io(h.base);
  assert.equal(await feedCommand(['propose', write('long.json', long)], me), 1);
  assert.deepEqual(me.said, ['long.json, line 12: pinwheel-daily-drawings-count is 29 characters, and a feed\'s id is 27 at most, because its poll\'s name is 32 at most.']);
  assert.deepEqual(h.seen, []);

  /* A word a fill does not take, a missing comma, a list that is not one, and one id twice. */
  const typo = readFeeds(FILE.replace('"measures": [{', '"measure": [{'), 'feeds.json');
  assert.deepEqual(typo, { ok: false, fix: 'feeds.json, line 12: the feed says measure, which a feed does not take: it takes id, url, every, at, tz, grant, project, organisation and measures.' });
  const comma = readFeeds(FILE.replace('"every": "1d",', '"every": "1d"'), 'feeds.json');
  assert.equal(comma.ok, false);
  assert.match((comma as { fix: string }).fix, /^feeds\.json, line 1[67]: this is not JSON/);
  assert.deepEqual(readFeeds('{"id":"x"}', 'feeds.json'), { ok: false, fix: 'feeds.json, line 1: the file is a list of feeds, written between [ and ], each one feed.' });
  const twice = readFeeds(FILE.replace('"id": "pinwheel"', '"id": "oxbow-gg"'), 'feeds.json');
  assert.deepEqual(twice, { ok: false, fix: 'feeds.json, line 12: oxbow-gg is a feed already on line 2, and one id is one plugin.' });
  /* The add-on's own refusal that says its fix after a full stop is still one sentence here. */
  const zone = readFeeds(FILE.replace('"tz": "Africa/Cairo"', '"tz": "Mars/Olympus"'), 'feeds.json');
  assert.deepEqual(zone, { ok: false, fix: 'feeds.json, line 12: Mars/Olympus is not a time zone; name one such as Africa/Cairo or Europe/London.' });
  for (const r of [typo, comma, twice, zone]) assert.equal((r as { fix: string }).fix.split(/\. /u).length, 1);

  /* A file an editor saved with a byte order mark is the same two feeds, on the same lines. */
  const marked = readFeeds(`﻿${FILE}`, 'feeds.json');
  assert.equal(marked.ok, true);
  assert.deepEqual((marked as { feeds: { line: number }[] }).feeds.map((f) => f.line), [2, 12]);
});

test('EACH FEED IS PLACED ON THE LINE IT STARTS ON, and a bracket inside a string is not the list\'s', () => {
  assert.deepEqual(elementLines(FILE), [2, 12]);
  assert.deepEqual(elementLines('[{"a":"[x], {y}"},\n\n {"b":1}]'), [1, 3]);
  assert.deepEqual(elementLines('[]'), []);
});

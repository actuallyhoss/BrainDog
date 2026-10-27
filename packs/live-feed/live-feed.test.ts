/**
 * A live feed, polled, as a pack file: one JSON address, a key named by its label in the vault, and which number in
 * the answer is which measure.
 *
 * WHY A FILE AND NOT A BUILDER IN CODE. The seed's old `pollPack` built the same declaration in code, and it required
 * the founder's use case, because that is where `datapoints` was declared for it. A record whose readings come from
 * any other pack could not use it, and a feed that one person polls became
 * a use case compiled into the seed. This is the same declaration as a file anybody can read, with what a person
 * supplies named under `fill`. It names no pack it requires: it writes a list called `datapoints`, from whichever pack
 * declares it, and the last test holds the plan to refusing it on a record where no pack does. A person's own feeds are
 * fills of it in the setup file kept beside an export, never files in the repository, so the only host the pack
 * file names is `stats.example.com`.
 *
 * RED FIRST, MEASURED: with no `fill.ts` and no pack file this file did not load,
 * ERR_MODULE_NOT_FOUND on `./fill.ts`, the red of a pack that does not exist yet.
 *
 * THE KEY IS WHAT THE LAST TESTS ARE ABOUT, because a feed behind a key is the case nothing else measures. The
 * address is a stand-in that answers 401 to a request without `Authorization: Bearer <key>` and 200 with it, and the
 * request goes through `sendAction` from `packages/host/src/actions.ts`, the loop both hosts send through, so the
 * header the address sees is the one a real host would send.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

import { normalise } from '../../packages/declare/src/index.ts';
import { readPackFile } from '../../packages/declare/src/catalogue.ts';
import { sendAction } from '../../packages/host/src/actions.ts';
import { validateDeclaration } from '../../packages/kernel/src/index.ts';
import { fixedClock, openSqlite } from '../../packages/kernel/test/sqlite.ts';
import { createRecordApi, type CallContext } from '../../packages/record/src/index.ts';
import { firstPartyDocument } from '../../packages/seed/src/index.ts';

import { FEED_MEASURES_MOST, FEED_NAME_MOST, fillFeed, type FeedSpec } from './fill.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const NOW = Date.UTC(2026, 8, 25, 9);

type Refusal = { code: string; fix: string; at?: string };
type Out = { ok: boolean; value?: unknown; refusal?: Refusal };
const said = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};

/** The file as it ships, read fresh each time so no test can hand the next one a copy it changed. */
const PACK_FILE = new URL('./live-feed.pack.json', import.meta.url);
const template = (): Record<string, unknown> => JSON.parse(readFileSync(PACK_FILE, 'utf8')) as Record<string, unknown>;

type Poll = Record<string, unknown> & { ingest: string; map: Record<string, unknown>[] };
const pollOf = (doc: Record<string, unknown>): Poll => (doc.declarations as Poll[])[0]!;

/** What the file itself says, filled. */
const EXAMPLE: FeedSpec = {
  id: 'example',
  url: 'https://stats.example.com/v1/numbers',
  every: '1h',
  grant: 'Example stats (read only)',
  measures: [
    { name: 'Monthly recurring revenue', path: 'data.mrr', unit: 'USD' },
    { name: 'Active users', path: 'data.users', unit: 'users', type: 'int' },
  ],
};

/* ── where the pack lives ─────────────────────────────────────────────────────────────────────── */

test('the file reads clean as an add-on somebody opens from disk, and says what a person fills', async () => {
  const file = said<{ pack: { manifest: { pack: string } }; doc: { fill?: Record<string, unknown> } }>(await readPackFile(readFileSync(PACK_FILE, 'utf8')));
  assert.equal(file.pack.manifest.pack, 'live-feed');
  assert.deepEqual(Object.keys(file.doc.fill ?? {}), ['id', 'url', 'every', 'at', 'tz', 'grant', 'project', 'organisation', 'measures']);
});

test('the file as it ships, with its marks taken off, is its own example filled, but for its name', () => {
  /* THE FILE IS `live-feed`, THE ONE EVERY FEED IS FILLED FROM, titled "Live feed", and kept off every listing: listed,
     the template would install as it ships and poll stats.example.com. A fill is `feed-<id>`, named for its host, and
     listed nowhere either, since a person's feeds are never in the catalogue. */
  const { fill: _marks, unlisted, changes, ...shipped } = template();
  assert.equal(unlisted, true);
  assert.equal(typeof changes, 'string');
  const filled = fillFeed(template(), EXAMPLE);
  assert.deepEqual([filled.pack, filled.title, 'unlisted' in filled, 'changes' in filled], ['feed-example', 'Numbers from stats.example.com', false, false]);
  assert.equal(JSON.stringify(shipped), JSON.stringify({ ...filled, pack: 'live-feed', title: 'Live feed' }));
});

test('THE WITHDRAWN EXAMPLE SAYS WHERE A POLL IS SET UP NOW: the form on a project\'s page, not Settings', () => {
  const yanked = JSON.parse(readFileSync(new URL('./yanked.json', import.meta.url), 'utf8')) as Record<string, string>;
  assert.deepEqual(Object.keys(yanked), ['feed-example']);
  assert.match(yanked['feed-example']!, /project's page, under Send numbers here/u);
  assert.doesNotMatch(yanked['feed-example']!, /Settings|\u2014/u);
});

test('IT REQUIRES NO PACK BY NAME, and names no host but the example', () => {
  const doc = template() as { requires: { packs: Record<string, string> } };
  assert.deepEqual(doc.requires.packs, {});
  const text = readFileSync(PACK_FILE, 'utf8');
  assert.deepEqual([...new Set(text.match(/https:\/\/[^/"\s]+/gu))], ['https://stats.example.com']);
});

/**
 * THE DECLARATION IS THE ONE THE IMPORT FILED BEFORE, BUT FOR ITS NAME. The setup file's `polls` were built in code by
 * the seed's old `pollPack`, which went when the form and the importer moved onto this file (REC-C01). So the poll it
 * built for a synthetic setup file's poll, with a project and a key, is written out here, and a spec that names no
 * date and no money still fills it to the letter: moving onto this file changes nothing polled.
 */
test('A SETUP FILE’S POLL FILLS IT AS IT STANDS, and the poll is the one the old builder in the seed made', () => {
  const setup: FeedSpec = {
    id: 'lanternly',
    url: 'https://stats.lanternly.example/api/numbers',
    every: '1h',
    project: 'things#1',
    organisation: 'organisations#1',
    grant: 'lanternly-stats',
    measures: [
      { name: 'Monthly revenue, Lanternly', path: 'data.mrr', unit: 'USD' },
      { name: 'Subscribers, Lanternly', path: 'data.subscribers', type: 'int' },
    ],
  };
  const stamp = { thing: { value: 'things#1' }, organisation: { value: 'organisations#1' }, source: { value: 'polled' }, at: { arrived: true } };
  const filled = fillFeed(template(), setup);
  assert.equal(JSON.stringify(filled.declarations), JSON.stringify([
    {
      ingest: 'feed_lanternly',
      channel: 'poll',
      url: 'https://stats.lanternly.example/api/numbers',
      every: '1h',
      grant: 'lanternly-stats',
      project: 'things#1',
      map: [
        { name: { value: 'Monthly revenue, Lanternly' }, value: { path: 'data.mrr', type: 'decimal' }, unit: { value: 'USD' }, ...stamp },
        { name: { value: 'Subscribers, Lanternly' }, value: { path: 'data.subscribers', type: 'int' }, ...stamp },
      ],
      writes: { register: 'datapoints' },
    },
  ]));
  assert.equal(filled.pack, 'feed-lanternly');
  assert.equal(filled.summary, 'Polls stats.lanternly.example every 1h, one request each time, for Monthly revenue, Lanternly, Subscribers, Lanternly.');
});

/* ── what the fill refuses ────────────────────────────────────────────────────────────────────── */

test('A FEED THAT COULD NEVER WRITE A READING IS NOT FILLED, so nobody is asked to approve a call out that does nothing', () => {
  const refused = (over: Partial<FeedSpec>, why: RegExp) => assert.throws(() => fillFeed(template(), { ...EXAMPLE, ...over }), why);
  refused({ id: 'Bad Id' }, /lower case, digits and hyphens/);
  refused({ url: 'http://stats.example.com/v1/numbers' }, /https:\/\/ address/);
  refused({ url: 'stats.example.com' }, /https:\/\/ address/);
  refused({ measures: [] }, /at least one measure/);
  refused({ measures: [{ name: '  ', path: 'data.mrr' }] }, /a name and a path/);
  refused({ measures: [{ name: 'Revenue', path: '' }] }, /a name and a path/);
  refused({ measures: [{ name: 'Revenue', path: 'data.a' }, { name: 'Revenue ', path: 'data.b' }] }, /Revenue is named twice/);
  refused({ measures: [{ name: 'Revenue', path: 'data.a', at: { path: ' ', as: 'day' } }] }, /Revenue is dated from the answer and names no path/);
  refused({ measures: [{ name: 'Revenue', path: 'data.a', at: { path: 'data.on', as: 'week' as never } }] }, /a day or as an instant/);
  refused({ measures: [{ name: 'Revenue', path: 'data.a', money: { currency: 'dollars' } }] }, /names its currency in three letters/);
  refused({ measures: [{ name: 'Revenue', path: 'data.a', money: { currency: 'USD' }, type: 'int' }] }, /money, .* takes no type/);
  refused({ measures: [{ name: 'Revenue', path: 'data.a', money: { currency: 'USD' }, unit: 'EUR' }] }, /money in USD and says its unit is EUR/);
  /* A TIME OF DAY IS THE POLL'S, and the record refuses each of these at install, after the owner approved. */
  refused({ at: '07:00' }, /every 1h has no time of day.*every 1d, 2d or 1w/);
  refused({ every: '1d', at: '7am' }, /7am is not a time of day/);
  refused({ every: '1d', tz: 'Africa/Cairo' }, /a zone with no time of day/);
  refused({ every: '1d', at: '07:00', tz: 'Mars/Olympus' }, /Mars\/Olympus is not a time zone/);
  /* A key label round spaces is the label; an empty one is no key, which is a public address. */
  assert.equal(pollOf(fillFeed(template(), { ...EXAMPLE, grant: '  Stats  ' })).grant, 'Stats');
  assert.equal('grant' in pollOf(fillFeed(template(), { ...EXAMPLE, grant: ' ' })), false);
});

/** `n` measures, each its own number in the answer. */
const many = (n: number): FeedSpec['measures'] => Array.from({ length: n }, (_, i) => ({ name: `m${i}`, path: `data.m${i}` }));

test('AN ID TOO LONG FOR ITS POLL IS REFUSED IN A SENTENCE THAT SAYS THE LIMIT, never cut short', () => {
  /* BEFORE 2.0.0 IT WAS CUT TO 32 WITHOUT A WORD, so two long ids that began alike named one poll. `feed_` and 27
     characters is the most a poll's name holds; with a second poll, `_2` takes two more. */
  const longest = 'a'.repeat(FEED_NAME_MOST - 'feed_'.length);
  assert.equal(pollOf(fillFeed(template(), { ...EXAMPLE, id: longest })).ingest, `feed_${longest}`);
  assert.throws(() => fillFeed(template(), { ...EXAMPLE, id: `${longest}b` }), /is 28 characters, and a feed's id is 27 at most, because its poll's name is 32 at most/);
  assert.throws(() => fillFeed(template(), { ...EXAMPLE, id: 'a'.repeat(33) }), /is 33 characters, and a feed's id is 27 at most/);
  assert.throws(
    () => fillFeed(template(), { ...EXAMPLE, id: longest, measures: many(FEED_MEASURES_MOST + 1) }),
    /is 27 characters, and a feed's id is 25 at most with 2 polls/,
  );
});

test('PAST TWENTY MEASURES A SECOND POLL ASKS THE SAME ADDRESS, and the summary says it is 2 requests each time', () => {
  const doc = fillFeed(template(), { ...EXAMPLE, id: 'kiln-stats', measures: many(FEED_MEASURES_MOST + 1) });
  const polls = doc.declarations as Poll[];
  assert.deepEqual(polls.map((p) => [p.ingest, p.url, p.every, p.grant, p.map.length]), [
    ['feed_kiln_stats', EXAMPLE.url, '1h', EXAMPLE.grant, FEED_MEASURES_MOST],
    ['feed_kiln_stats_2', EXAMPLE.url, '1h', EXAMPLE.grant, 1],
  ]);
  assert.match(String(doc.summary), /^Polls stats\.example\.com every 1h, 2 requests each time, for m0, /u);
  assert.match(String(fillFeed(template(), EXAMPLE).summary), /^Polls stats\.example\.com every 1h, one request each time, for /u);
});

test('A DATED MEASURE READS ITS DATE FROM THE ANSWER, money is written as an amount, and a whole-day feed keeps its time', () => {
  const doc = fillFeed(template(), {
    ...EXAMPLE,
    every: '1d',
    at: '07:00',
    tz: 'Africa/Cairo',
    measures: [
      { name: 'Plays', path: 'days[-1].count', type: 'int', at: { path: 'days[-1].day', as: 'day' } },
      { name: 'Takings', path: 'data.takings', money: { currency: 'usd', minor: true } },
      { name: 'Refunds', path: 'data.refunds', money: { currency: 'EUR' }, unit: 'eur', at: { path: 'data.as_of', as: 'instant' } },
    ],
  });
  const poll = pollOf(doc);
  assert.deepEqual([poll.every, poll.at, poll.tz], ['1d', '07:00', 'Africa/Cairo']);
  const [plays, takings, refunds] = poll.map;
  assert.deepEqual([plays!.value, plays!.at], [{ path: 'days[-1].count', type: 'int' }, { path: 'days[-1].day', type: 'day' }]);
  assert.deepEqual([takings!.amount, 'value' in takings!, takings!.at], [{ path: 'data.takings', type: 'money', currency: 'USD', minor: true }, false, { arrived: true }]);
  assert.deepEqual([refunds!.amount, refunds!.unit, refunds!.at], [{ path: 'data.refunds', type: 'money', currency: 'EUR' }, { value: 'eur' }, { path: 'data.as_of', type: 'instant' }]);
  assert.equal(doc.summary, 'Polls stats.example.com every 1d at 07:00 Africa/Cairo, one request each time, for Plays, Takings, Refunds.');
});

test('AND THE MOST IT FILLS IS THE RECORD’S NUMBER, asked of the record rather than copied from it', async () => {
  /* `FEED_MEASURES_MOST` IS A HAND COPY OF THE KERNEL'S `POLL_MAPS_MOST`, which the kernel's entry point does not
     export, so it is held against `validateDeclaration`: the fill's twenty pass, and one more is refused in the
     record's own sentence. Without the fill's check, the twenty-first is found at install, after the owner approved. */
  const declaredAt = async (maps: number): Promise<Parameters<typeof validateDeclaration>[0]> => {
    const doc = fillFeed(template(), { ...EXAMPLE, measures: Array.from({ length: FEED_MEASURES_MOST }, (_, i) => ({ name: `m${i}`, path: `data.m${i}` })) });
    const map = pollOf(doc).map;
    assert.equal(map.length, FEED_MEASURES_MOST);
    while (map.length < maps) map.push({ ...structuredClone(map[0]!), name: { value: `x${map.length}` } });
    return said<{ declarations: Parameters<typeof validateDeclaration>[0][] }>(await normalise(doc, { kind: 'local' })).declarations[0]!;
  };
  assert.equal(validateDeclaration(await declaredAt(FEED_MEASURES_MOST)), null);
  const past = validateDeclaration(await declaredAt(FEED_MEASURES_MOST + 1));
  assert.equal(past?.code, 'DECLARATION_INVALID');
  assert.match(past!.fix, new RegExp(`1 to ${FEED_MEASURES_MOST} maps`, 'u'));
});

/* ── on a record, behind a key ────────────────────────────────────────────────────────────────── */

/**
 * A pack of somebody else's that declares `datapoints`: readings about each project, with no use case around them.
 * Invented here, so the feed is shown landing in a list it did not bring and does not name. SINCE PORTFOLIO 1.19.0
 * NUMBERS IS PORTFOLIO'S OWN, so this pack installs only beside a Portfolio from before then (`BEFORE_NUMBERS`).
 */
const DIARY = {
  pack: 'numbers-diary',
  version: '1.0.0',
  summary: 'Readings about each project.',
  author: 'Example',
  license: 'MIT',
  requires: { format: 1, primitives: 1, packs: { portfolio: '^1.0.0' } },
  declarations: [
    {
      register: 'datapoints',
      name: 'Readings',
      one: 'reading',
      holds: 'one number about one project at one moment',
      title: 'name',
      fields: [
        { id: 'name', label: 'Measure', type: 'text', required: true, index: true, search: true },
        { id: 'value', label: 'Value', type: 'decimal', required: true },
        { id: 'unit', label: 'Unit', type: 'text' },
        { id: 'thing', label: 'Project', type: 'ref', to: 'things', index: true },
        { id: 'at', label: 'When', type: 'instant', index: true },
        { id: 'source', label: 'Source', type: 'text' },
      ],
    },
  ],
};

/**
 * PORTFOLIO FROM BEFORE IT HELD NUMBERS: 1.16.0 as brain.dog last served it (`packages/seed/test/fixtures/released`),
 * without its example rows, the way a record still on that version holds it. Today's Portfolio declares Numbers
 * itself, with a reading that may be money (REC-C03), so a record with Portfolio and no readings list, or with another
 * pack's, is a record on this version.
 */
const BEFORE_NUMBERS = {
  ...(JSON.parse(readFileSync(new URL('../../packages/seed/test/fixtures/released/portfolio-1.16.0.json', import.meta.url), 'utf8')) as Record<string, unknown>),
  seeds: [],
};

const KEY = 'feed-key-5b1e';
const LABEL = 'Example stats (read only)';

/**
 * The address, standing in for a project's stats endpoint: 401 unless the request carries the key as a bearer,
 * and the numbers when it does. It remembers the header each request carried, so a test can say what was sent.
 */
function address(body = '{"data":{"mrr":4310.5,"users":128}}') {
  const seen: (string | null)[] = [];
  const send = async (_url: URL, init: RequestInit): Promise<Response> => {
    const auth = new Headers(init.headers).get('authorization');
    seen.push(auth);
    return auth === `Bearer ${KEY}`
      ? new Response(body, { status: 200, headers: { 'content-type': 'application/json' } })
      : new Response('{"error":"unauthorized"}', { status: 401 });
  };
  return { send, seen };
}

/**
 * A record holding Portfolio and one project, with the vault holding `LABEL` when asked. Its readings list is
 * Portfolio's own Numbers (`numbers: 'portfolio'`, the default), the invented diary beside a Portfolio from before
 * Numbers (`'diary'`), or none at all, on that older Portfolio alone (`'none'`).
 */
async function recordWith(o: { vault: boolean; numbers?: 'portfolio' | 'diary' | 'none' }) {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  const plan = async (doc: unknown) => said<{ diff: { planHash: string; approve: string[] } }>(await api.planPack({ doc, source: { kind: 'local' } } as never, owner)).diff;
  const put = async (doc: unknown): Promise<Out> => {
    const p = (await api.planPack({ doc, source: { kind: 'local' } } as never, owner)) as Out & { value?: { diff: { planHash: string; approve: string[] } } };
    if (!p.ok) return p;
    return (await api.installPack({ doc, source: { kind: 'local' }, planHash: p.value!.diff.planHash, approve: p.value!.diff.approve } as never, owner)) as Out;
  };
  const numbers = o.numbers ?? 'portfolio';
  said(await put(numbers === 'portfolio' ? firstPartyDocument('portfolio', { seeds: [] }) : BEFORE_NUMBERS));
  if (numbers === 'diary') said(await put(DIARY));
  said(api.kernel.create('things', { name: 'Kiln', lane: 'earning' }, { actor: 'p_1' }));
  if (o.vault)
    assert.ok(
      api.kernel.bindGrant(
        { label: LABEL, opens: 'stats.example.com', kind: 'api_token', ciphertext: new Uint8Array([1, 2, 3]), nonce: new Uint8Array([4, 5, 6]), kdf: 'hkdf', wrapped_by: 'kek', kek_id: 'kek_fake' },
        'p_1',
      ).ok,
    );
  const readings = () =>
    sql
      .all<{ name: string; value: number; unit: string | null; source: string; thing: string }>(
        `SELECT json_extract(fields, '$.name') AS name, json_extract(fields, '$.value') AS value, json_extract(fields, '$.unit') AS unit,
                json_extract(fields, '$.source') AS source, json_extract(fields, '$.thing') AS thing
         FROM entry WHERE register = 'datapoints' AND deleted_at IS NULL ORDER BY name`,
      )
      .map((r) => [r.name, r.value, r.unit, r.source]);
  const run = (send: ReturnType<typeof address>['send'], openKey: (g: { label: string }) => Promise<string | null>) =>
    api.kernel.runActions(sendAction({ origins: () => api.kernel.actionOrigins(), openKey, send }));
  const said_ = () => sql.all<{ note: string }>("SELECT note FROM event WHERE kind = 'pull' ORDER BY ts, id").map((e) => e.note);
  return { api, sql, plan, put, readings, run, events: said_ };
}

const PROJECT: Partial<FeedSpec> = { project: 'things#1' };

test('WITHOUT THE KEY THE ADDRESS ANSWERS 401, the feed pauses and says so, and not one reading is written', async () => {
  const r = await recordWith({ vault: false });
  const { grant: _none, ...open } = EXAMPLE;
  const doc = fillFeed(template(), { ...open, ...PROJECT });
  assert.deepEqual((await r.plan(doc)).approve, ['CALLS OUT stats.example.com · every 1h · grant "none"']);
  said(await r.put(doc));

  const net = address();
  const out = await r.run(net.send, async () => KEY);
  assert.deepEqual(net.seen, [null], 'a feed that names no key sends none');
  assert.deepEqual({ ran: out.ran, ok: out.ok, paused: out.paused }, { ran: 1, ok: 0, paused: 1 });
  assert.deepEqual(r.readings(), []);
  assert.ok(
    r.events().some((n) => n.includes('stats.example.com answered 401')),
    `the run says nothing about the 401: ${JSON.stringify(r.events())}`,
  );
  r.sql.close();
});

/* IN WHICHEVER LIST DECLARES `datapoints`: Portfolio's own Numbers, and another pack's beside an older Portfolio. */
for (const numbers of ['portfolio', 'diary'] as const)
  test(`WITH THE KEY NAMED AND IN THE VAULT THE ADDRESS ANSWERS 200, and each measure is a reading on the project (${numbers})`, async () => {
    const r = await recordWith({ vault: true, numbers });
    const doc = fillFeed(template(), { ...EXAMPLE, ...PROJECT });
    /* THE OWNER APPROVES THE HOST, THE INTERVAL AND THE KEY BY ITS LABEL, and the project it runs for. */
    const approve = (await r.plan(doc)).approve;
    assert.equal(approve[0], `CALLS OUT stats.example.com · every 1h · grant "${LABEL}"`);
    assert.match(approve[1] ?? '', new RegExp(`feed_example runs for the project .+ and sends the key "${LABEL.replace(/[()]/gu, '\\$&')}"`, 'u'));
    said(await r.put(doc));

    const net = address();
    const opened: string[] = [];
    const out = await r.run(net.send, async (g) => (opened.push(g.label), KEY));
    assert.deepEqual(opened, [LABEL], 'the key is opened by its label and by nothing else');
    assert.deepEqual(net.seen, [`Bearer ${KEY}`]);
    assert.deepEqual({ ran: out.ran, ok: out.ok, paused: out.paused }, { ran: 1, ok: 1, paused: 0 });
    assert.deepEqual(r.readings(), [
      ['Active users', 128, 'users', 'polled'],
      ['Monthly recurring revenue', 4310.5, 'USD', 'polled'],
    ]);
    const kiln = r.sql.one<{ id: string }>("SELECT id FROM entry WHERE register = 'things'")!.id;
    assert.deepEqual(
      r.sql.all<{ thing: string }>("SELECT json_extract(fields, '$.thing') AS thing FROM entry WHERE register = 'datapoints'").map((x) => x.thing),
      [kiln, kiln],
      'the readings are on the project the fill named',
    );
    /* THE KEY IS IN NO ROW THE RECORD KEPT: not the readings, not the run's events, not the raw answer. */
    const kept = r.sql.all<{ t: string }>("SELECT fields AS t FROM entry UNION ALL SELECT COALESCE(note, '') || COALESCE(to_v, '') FROM event");
    assert.equal(kept.some((x) => String(x.t).includes(KEY)), false);
    r.sql.close();
  });

test('A KEY NAMED BUT NOT IN THE VAULT IS REFUSED AT INSTALL, so nothing is ever sent without it', async () => {
  /* WRITTEN EXPECTING A PAUSE AT THE FIRST RUN, AND MEASURED EARLIER THAN THAT: the install itself is refused, in a
     sentence that tells the owner what to add. */
  const r = await recordWith({ vault: false });
  const put = await r.put(fillFeed(template(), { ...EXAMPLE, ...PROJECT }));
  assert.equal(put.ok, false);
  assert.equal(put.refusal?.code, 'REQUIRED_MISSING');
  assert.equal(put.refusal?.fix, `Add the key called "${LABEL}" to the keychain, then install.`);
  const net = address();
  const out = await r.run(net.send, async () => KEY);
  assert.deepEqual([net.seen, out.ran, r.readings()], [[], 0, []]);
  r.sql.close();
});

test('ON A RECORD WITH NO DATAPOINTS LIST THE FEED IS REFUSED, NAMING THE LIST', async () => {
  /* MEASURED WHILE BUILDING THIS PACK, AND NOT THIS PACK'S TO REPAIR. On a record holding Portfolio and no readings
     list, the plan's `unresolved` was empty, the install was `ok`, and the first run counted as `ok` and `changed`
     while every answer went to review with the suggestion "There is no register called datapoints". So the owner
     approved a call out that ran every hour, read as working, and filed nothing. The repair is in the shell, for every
     ingest: `pointsAt` in `packages/declare` counts `writes.register` among the lists a declaration points at. */
  const r = await recordWith({ vault: true, numbers: 'none' });
  const put = await r.put(fillFeed(template(), EXAMPLE));
  assert.equal(put.ok, false, 'a feed installed on a record with nowhere for a reading to go');
  assert.equal(put.refusal?.code, 'REGISTER_UNRESOLVED');
  assert.match(put.refusal?.fix ?? '', /points at the datapoints list/);
  r.sql.close();
});

/* ── 2.0.0 on a record: dated, money, and a second poll ───────────────────────────────────────── */

/** Every reading the record kept, by name: its value, its amount, when it is dated, and the list it came in. */
const kept = (sql: Awaited<ReturnType<typeof recordWith>>['sql']) =>
  sql.all<{ name: string; value: number | null; amount: string | null; at: string }>(
    `SELECT json_extract(fields, '$.name') AS name, json_extract(fields, '$.value') AS value,
            json_extract(fields, '$.amount') AS amount, json_extract(fields, '$.at') AS at
     FROM entry WHERE register = 'datapoints' AND deleted_at IS NULL ORDER BY name`,
  );

test('ON A RECORD, A DATED MEASURE CARRIES THE ANSWER’S DAY and an undated one the moment it arrived', async () => {
  const r = await recordWith({ vault: true });
  const doc = fillFeed(template(), {
    ...EXAMPLE,
    ...PROJECT,
    every: '1d',
    measures: [
      { name: 'Plays', path: 'days[-1].count', type: 'int', at: { path: 'days[-1].day', as: 'day' } },
      { name: 'Active users', path: 'data.users', type: 'int' },
    ],
  });
  said(await r.put(doc));
  const net = address('{"data":{"users":128},"days":[{"day":"2026-09-19","count":7},{"day":"2026-09-20","count":11}]}');
  const out = await r.run(net.send, async () => KEY);
  assert.deepEqual({ ran: out.ran, ok: out.ok }, { ran: 1, ok: 1 });
  const rows = kept(r.sql);
  assert.deepEqual(rows.map((x) => [x.name, x.value]), [['Active users', 128], ['Plays', 11]]);
  assert.equal(rows[1]!.at.slice(0, 10), '2026-09-20', 'the day counted is the answer’s, not the day it was asked');
  assert.notEqual(rows[0]!.at.slice(0, 10), '2026-09-20');
  r.sql.close();
});

test('ON A RECORD, A MONEY MEASURE IS WRITTEN AS AN AMOUNT IN MINOR UNITS, from cents or from whole units', async () => {
  const r = await recordWith({ vault: true });
  const doc = fillFeed(template(), {
    ...EXAMPLE,
    ...PROJECT,
    measures: [
      { name: 'Takings', path: 'data.cents', money: { currency: 'USD', minor: true } },
      { name: 'Monthly recurring revenue', path: 'data.mrr', money: { currency: 'USD' } },
    ],
  });
  said(await r.put(doc));
  const out = await r.run(address('{"data":{"cents":431050,"mrr":4310.5}}').send, async () => KEY);
  assert.deepEqual({ ran: out.ran, ok: out.ok }, { ran: 1, ok: 1 });
  assert.deepEqual(
    kept(r.sql).map((x) => [x.name, x.value, JSON.parse(x.amount ?? 'null')]),
    [
      ['Monthly recurring revenue', null, { amount: 431050, currency: 'USD' }],
      ['Takings', null, { amount: 431050, currency: 'USD' }],
    ],
  );
  assert.ok(kept(r.sql).every((x) => Number.isInteger(JSON.parse(x.amount ?? 'null')?.amount)), 'an amount is whole minor units');
  r.sql.close();
});

test('ON A RECORD, TWENTY-ONE MEASURES ARE TWO POLLS OF ONE ADDRESS, two requests and twenty-one readings an interval', async () => {
  const r = await recordWith({ vault: true });
  const doc = fillFeed(template(), { ...EXAMPLE, ...PROJECT, measures: many(FEED_MEASURES_MOST + 1) });
  const approve = (await r.plan(doc)).approve;
  assert.equal(approve.filter((line) => line.startsWith('CALLS OUT stats.example.com · every 1h')).length, 2, approve.join('\n'));
  said(await r.put(doc));
  const answer = JSON.stringify({ data: Object.fromEntries(Array.from({ length: FEED_MEASURES_MOST + 1 }, (_, i) => [`m${i}`, i])) });
  const net = address(answer);
  const out = await r.run(net.send, async () => KEY);
  assert.deepEqual({ ran: out.ran, ok: out.ok, sent: net.seen.length }, { ran: 2, ok: 2, sent: 2 });
  assert.equal(kept(r.sql).length, FEED_MEASURES_MOST + 1);
  r.sql.close();
});

test('ON A RECORD, A WHOLE-DAY FEED WITH A TIME OF DAY AND A ZONE INSTALLS, so the record takes the time and the zone the fill wrote', async () => {
  const r = await recordWith({ vault: true });
  const doc = fillFeed(template(), { ...EXAMPLE, ...PROJECT, every: '1d', at: '07:00', tz: 'Africa/Cairo' });
  said(await r.put(doc));
  assert.deepEqual([pollOf(doc).at, pollOf(doc).tz], ['07:00', 'Africa/Cairo']);
  r.sql.close();
});

test('ONE BUILDER: the importer, the setup file command and the form all fill this file, and none builds a poll of its own', () => {
  /* MEASURED RED FIRST: with the importer still on the seed's `pollPack`, `apps/cli/src/import.ts` is the one file
     named below, and the same poll could sit on Decide twice, as `poll-<id>` and as `feed-<id>`. */
  const builds: string[] = [];
  const fills: string[] = [];
  for (const app of ['cli', 'web']) {
    const src = new URL(`../../apps/${app}/src/`, import.meta.url);
    for (const rel of readdirSync(src, { recursive: true, encoding: 'utf8' })) {
      const path = rel.replaceAll('\\', '/');
      if (!/\.(ts|svelte)$/u.test(path) || /\.test\.ts$/u.test(path)) continue;
      const text = readFileSync(new URL(path, src), 'utf8');
      if (/\bpollPack\b|usecases\/founder-poll/u.test(text)) builds.push(`apps/${app}/src/${path}`);
      if (/\bfillFeed\(/u.test(text)) fills.push(`apps/${app}/src/${path}`);
    }
  }
  assert.deepEqual(builds, []);
  for (const caller of ['apps/cli/src/import.ts', 'apps/cli/src/feed.ts', 'apps/web/src/lib/record/poll-form.ts']) assert.ok(fills.includes(caller), `${caller} no longer fills the live feed`);
});

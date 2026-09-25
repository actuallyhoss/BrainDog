/**
 * Live numbers, polled, as a pack file: one JSON address, a key named by its label in the vault, and which number in
 * the answer is which measure (`loop/research-legacy-parity.md` row 45 and brief B5; `loop/DIRECTION.md` sections
 * 22, 24 and 27).
 *
 * WHY A FILE AND NOT THE BUILDER IT REPEATS. `pollPack` in `packages/seed/src/usecases/founder-poll.ts` builds the
 * same declaration in code, and it requires the founder's use case, because that is where `datapoints` is declared
 * there. A record whose readings come from any other pack could not use it, and a feed that one person polls became
 * a use case compiled into the seed. This is the same declaration as a file anybody can read, with what a person
 * supplies named under `fill`. It names no pack it requires: it writes a list called `datapoints`, from whichever pack
 * declares it, and the last test says what the plan does not yet check about that. His own feeds are two fills of it
 * in the setup file he keeps beside his export, never files in the repository, so the only host the pack file names
 * is `stats.example.com`.
 *
 * RED FIRST, MEASURED ON SEPTEMBER 25TH AGAINST `772c0be1`: with no `fill.ts` and no pack file this file did not load,
 * ERR_MODULE_NOT_FOUND on `./fill.ts`, which is the brief's red ("at HEAD the pack does not exist").
 *
 * THE KEY IS WHAT THE LAST TESTS ARE ABOUT, because a feed behind a key is the case the survey left unmeasured. The
 * address is a stand-in that answers 401 to a request without `Authorization: Bearer <key>` and 200 with it, and the
 * request goes through `sendAction` from `packages/host/src/actions.ts`, the loop both hosts send through, so the
 * header the address sees is the one a real host would send.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { normalise } from '../../packages/declare/src/index.ts';
import { readPackFile } from '../../packages/declare/src/catalogue.ts';
import { sendAction } from '../../packages/host/src/actions.ts';
import { validateDeclaration } from '../../packages/kernel/src/index.ts';
import { fixedClock, openSqlite } from '../../packages/kernel/test/sqlite.ts';
import { createRecordApi, type CallContext } from '../../packages/record/src/index.ts';
import { firstPartyDocument } from '../../packages/seed/src/index.ts';
import { pollPack } from '../../packages/seed/src/usecases/founder-poll.ts';

import { FEED_MEASURES_MOST, fillFeed, type FeedSpec } from './fill.ts';

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
  assert.equal(file.pack.manifest.pack, 'feed-example');
  assert.deepEqual(Object.keys(file.doc.fill ?? {}), ['id', 'url', 'every', 'grant', 'project', 'organisation', 'measures']);
});

test('the file as it ships, with its marks taken off, is its own example filled', () => {
  const { fill: _marks, ...shipped } = template();
  assert.equal(JSON.stringify(shipped), JSON.stringify(fillFeed(template(), EXAMPLE)));
});

test('IT REQUIRES NO PACK BY NAME, and names no host but the example', () => {
  const doc = template() as { requires: { packs: Record<string, string> } };
  assert.deepEqual(doc.requires.packs, {});
  const text = readFileSync(PACK_FILE, 'utf8');
  assert.deepEqual([...new Set(text.match(/https:\/\/[^/"\s]+/gu))], ['https://stats.example.com']);
});

/**
 * THE DECLARATION IS THE ONE THE IMPORT FILES TODAY, BUT FOR ITS NAME. The setup file's `polls` are `PollSpec`s, which
 * `apps/cli/src/import.ts` hands to `pollPack`, so a spec that fills this file and builds the same poll there is the
 * proof that moving the import onto this file changes what is polled in nothing but the ingest's name and the pack's.
 * The spec is the synthetic setup's own poll (`packs/legacy-import/test/synthetic.ts`), with a project and a key.
 */
test('A SETUP FILE’S POLL FILLS IT AS IT STANDS, and the poll is the one the builder in the seed makes', () => {
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
  const filled = fillFeed(template(), setup);
  const built = pollPack(setup) as Record<string, unknown>;
  const { ingest: mine, ...ours } = pollOf(filled);
  const { ingest: theirs, ...seeds } = pollOf(built);
  assert.deepEqual(ours, seeds);
  assert.deepEqual([filled.pack, mine, theirs], ['feed-lanternly', 'feed_lanternly', 'poll_lanternly']);
  assert.equal(filled.summary, built.summary);
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
  refused({ measures: Array.from({ length: FEED_MEASURES_MOST + 1 }, (_, i) => ({ name: `m${i}`, path: `data.m${i}` })) }, new RegExp(`${FEED_MEASURES_MOST} measures at most`, 'u'));
  /* A key label round spaces is the label; an empty one is no key, which is a public address. */
  assert.equal(pollOf(fillFeed(template(), { ...EXAMPLE, grant: '  Stats  ' })).grant, 'Stats');
  assert.equal('grant' in pollOf(fillFeed(template(), { ...EXAMPLE, grant: ' ' })), false);
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
 * Invented here, so the feed is shown landing in a list it did not bring and does not name.
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

const KEY = 'feed-key-5b1e';
const LABEL = 'Example stats (read only)';

/**
 * The address, standing in for a project's stats endpoint: 401 unless the request carries the key as a bearer,
 * and the numbers when it does. It remembers the header each request carried, so a test can say what was sent.
 */
function address() {
  const seen: (string | null)[] = [];
  const send = async (_url: URL, init: RequestInit): Promise<Response> => {
    const auth = new Headers(init.headers).get('authorization');
    seen.push(auth);
    return auth === `Bearer ${KEY}`
      ? new Response('{"data":{"mrr":4310.5,"users":128}}', { status: 200, headers: { 'content-type': 'application/json' } })
      : new Response('{"error":"unauthorized"}', { status: 401 });
  };
  return { send, seen };
}

/** A record holding Portfolio, one project, and the invented readings list, with the vault holding `LABEL` when asked. */
async function recordWith(o: { vault: boolean; readings?: boolean }) {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  const plan = async (doc: unknown) => said<{ diff: { planHash: string; approve: string[] } }>(await api.planPack({ doc, source: { kind: 'local' } } as never, owner)).diff;
  const put = async (doc: unknown): Promise<Out> => {
    const p = (await api.planPack({ doc, source: { kind: 'local' } } as never, owner)) as Out & { value?: { diff: { planHash: string; approve: string[] } } };
    if (!p.ok) return p;
    return (await api.installPack({ doc, source: { kind: 'local' }, planHash: p.value!.diff.planHash, approve: p.value!.diff.approve } as never, owner)) as Out;
  };
  said(await put(firstPartyDocument('portfolio', { seeds: [] })));
  if (o.readings !== false) said(await put(DIARY));
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

test('WITH THE KEY NAMED AND IN THE VAULT THE ADDRESS ANSWERS 200, and each measure is a reading on the project', async () => {
  const r = await recordWith({ vault: true });
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
  assert.equal(put.refusal?.fix, `Add the key called "${LABEL}" to the vault, then install.`);
  const net = address();
  const out = await r.run(net.send, async () => KEY);
  assert.deepEqual([net.seen, out.ran, r.readings()], [[], 0, []]);
  r.sql.close();
});

test(
  'ON A RECORD WITH NO DATAPOINTS LIST THE FEED IS REFUSED, NAMING THE LIST',
  {
    todo: 'pointsAt in packages/declare/src/index.ts reads fields, pages and figures and not an ingest\'s writes.register, so the plan finds nothing unresolved and the feed installs on a record that has no datapoints list',
  },
  async () => {
    /* MEASURED WHILE BUILDING THIS PACK, AND NOT THIS PACK'S TO REPAIR. On a record holding Portfolio and no readings
       list, the plan's `unresolved` was empty, the install was `ok`, and the first run counted as `ok` and `changed`
       while every answer went to review with the suggestion "There is no register called datapoints". So the owner
       approves a call out that runs every hour, reads as working, and files nothing. The repair is one line in the
       shell, for every ingest: count `writes.register` among the lists a declaration points at. */
    const r = await recordWith({ vault: true, readings: false });
    const put = await r.put(fillFeed(template(), EXAMPLE));
    assert.equal(put.ok, false, 'a feed installed on a record with nowhere for a reading to go');
    assert.equal(put.refusal?.code, 'REGISTER_UNRESOLVED');
    assert.match(put.refusal?.fix ?? '', /points at the datapoints list/);
    r.sql.close();
  },
);

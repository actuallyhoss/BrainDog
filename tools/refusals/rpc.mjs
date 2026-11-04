/**
 * The `rpc` driver behind `run-via.mjs rpc`: every fixture of the family asked for by name, driven against a self-host
 * over a socket where it can be, and named with its reason where it cannot.
 *
 * ONE SURFACE FOR THE FAMILY, AND IT IS THE ONE A CALLER MEETS. `40 §6` gives `rpc` a record method and a principal, and
 * the runners that existed each drove the file its slice's `raises:` names, one layer at a time: the shared router with a
 * record that only notes it was touched (`packages/host/test/refusals-rpc.test.ts`), the self-host's doors
 * (`apps/selfhost/test/refusals-rpc.test.ts`) and the client over a dead socket (`packages/client/test/refusals-rpc.test.ts`).
 * Those stay where they are, because each holds its raiser to its own slice. What none of them could do is say, for the
 * whole family, which fixture is driven and which is not, and a fixture named by no runner is one nobody knows is
 * undriven. So this drives every one it can through `start` (`apps/selfhost/src/server.ts`), the same host `braindog
 * serve` runs, and every refusal but the client's comes back through the self-host's doors, the shared router and the
 * record, as it would to anybody calling.
 *
 * TWO KINDS OF INPUT, AND THE FIXTURE'S OWN WINS. A fixture that carries `call:` and `principal:` is driven from them
 * (`carried` below), which is `40 §6`'s format. The rest carry no input, because a scene is not a key/value: a
 * suggestion decided once before it is decided again, a device code left to expire. Those are `SCENES`, one function
 * per fixture file, each standing a host up, setting the state its refusal needs, and making the one call the fixture
 * is about. A scene's setup is done in process when it is not the thing under test; the call it ends with always goes
 * over the socket.
 *
 * AND A SCENE WRITES ITS STATE WITH SQL ONLY WHEN NO CALLER CAN WRITE IT ANY MORE and a live record can still hold it:
 * a figure's body from before a figure carried its own factor tables, and a money value from before every money value
 * carried a currency. Each such scene says so beside its own lines, and `packages/kernel/test/metrics.test.ts` reads
 * both states for the same reason.
 *
 * A STRING IN `SCENES` IS THE REASON A FIXTURE IS NOT DRIVEN, and `run-via.mjs` prints it on the fixture's line. Each is
 * a fact about the tree: the address the fixture claims is one no raiser answers with, or the code it claims is one a
 * caller of this host never reads. So the family's undriven part is a list somebody can work down, and working one
 * down means moving the fixture or the raiser rather than writing a scene.
 *
 * EVERY HOST IS CLOSED ON EVERY PATH OUT, in `withHost`'s `finally`: a scene that throws is that fixture's `threw` line in
 * the report, and a server left listening would keep the command from ever finishing.
 */

import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/* RELATIVE PATHS, FOR THE REASON `run-via.mjs` GIVES: `tools/` is not a workspace package, and the bare specifiers inside
   these files resolve against their own packages. Loaded only when `rpc` is asked for, because standing up a self-host
   costs the `lint` and `where` runs something they never use. */
import { openKeyStore, recordKeys } from '../../apps/selfhost/src/keys.ts';
import { start } from '../../apps/selfhost/src/server.ts';
import { createClient } from '../../packages/client/src/index.ts';
import { CODE_MS, CODE_TRIES } from '../../packages/kernel/src/device.ts';
import { REPORT_ROWS_MOST, REPORT_ROWS_PER_MINUTE } from '../../packages/record/src/report.ts';

/** The server key every host here is started with, which answers as the record's owner. */
const KEY = 'the-server-key-for-the-rpc-runner';
const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const OWNER = 'owner@example.test';
/** A fixed instant, so a scene that moves the clock moves it from somewhere every run agrees on. */
const NOW = Date.UTC(2026, 8, 5, 12);
/** Port 1 on loopback, where nothing listens on any machine this runs on: the client's own `UNREACHABLE`. */
const CLOSED = 'http://127.0.0.1:1';

const OBLIGATIONS = {
  id: 'register.obligations',
  kind: 'register',
  body: { id: 'obligations', name: 'Obligations', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] },
};

/** Two options, because one is not a choice and the governance writer refuses it. */
const QUESTION = {
  question: 'Two services on the Fenwick invoice, or one billed twice?',
  body_kind: 'options',
  body: {
    options: [
      { id: 'two', label: 'Two services', because: 'the invoice names two lines' },
      { id: 'one', label: 'One, billed twice', because: 'the second line repeats the first' },
    ],
  },
};

/** The list the figure scenes read, with the fields each scene names after its title. */
const ledger = (fields) => ({
  id: 'register.ledger',
  kind: 'register',
  body: { id: 'ledger', name: 'Ledger', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, ...fields] },
});

/** The one figure a figure scene asks for. */
const FIGURE = 'the-figure';

/**
 * A figure over the ledger, with the target and the window `08 §2` requires, so that what a scene changes is the one
 * thing its fixture is about. `compare: none`, because a comparison reads the rows a second time and no fixture here
 * is about the second reading.
 */
const figure = (value, body = {}) => ({
  id: `metric.${FIGURE}`,
  kind: 'metric',
  body: { metric: FIGURE, name: 'The figure', source: 'register.ledger', value, target: { gte: 0 }, window: '30d', compare: 'none', format: 'decimal', ...body },
});

/* THREE LISTS AS `packages/kernel/test/pack-disable.test.ts` DECLARES THEM, because that file is where the two
   refusals a pack's turning off can meet were first pinned. Projects belong to one pack; Learnings to another pack and
   lean on Projects; Tasks were declared in the app, so no pack owns them and nothing can turn them off with Projects. */
const PROJECTS = {
  id: 'register.things',
  kind: 'register',
  pack: 'portfolio',
  body: {
    id: 'things',
    name: 'Projects',
    title: 'name',
    scopes: { repos: 'repos' },
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'repos', type: 'list', of: 'text' },
    ],
  },
};
const LEARNINGS = {
  id: 'register.learnings',
  kind: 'register',
  pack: 'agents',
  body: {
    id: 'learnings',
    name: 'Learnings',
    title: 'lesson',
    fields: [
      { id: 'lesson', type: 'text', required: true },
      { id: 'project', type: 'ref', to: 'things', index: true, scope: { widen: 'person' } },
    ],
  },
};
const TASKS = {
  id: 'register.tasks',
  kind: 'register',
  body: {
    id: 'tasks',
    name: 'Tasks',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'thing', type: 'ref', to: 'things', index: true, scope: {} },
    ],
  },
};

/** A pack a person could write, planned and installed through the record's own doors. */
const NOTEBOOK = {
  pack: 'fixture-notebook',
  version: '1.0.0',
  summary: 'Somewhere to write things down.',
  author: 'BrainDog fixtures',
  license: 'MIT',
  declarations: [{ register: 'notes', name: 'Notes', title: 'body', fields: [{ id: 'body', type: 'text', required: true }] }],
};

/** A list a report key sends rows to, as `apps/selfhost/test/report.test.ts` declares one. */
const POINTS = {
  id: 'register.points',
  kind: 'register',
  body: {
    id: 'points',
    name: 'Points',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'value', type: 'decimal', required: true },
    ],
  },
};

/** The list of keys the vault's doors read, as `apps/selfhost/test/keys-doors.test.ts` declares it, less the project. */
const KEYS = {
  id: 'register.credentials',
  kind: 'register',
  body: {
    id: 'credentials',
    name: 'Keys',
    title: 'label',
    fields: [
      { id: 'label', type: 'text', required: true, max: 120 },
      { id: 'opens', type: 'text', required: true, max: 280 },
      { id: 'kind', type: 'enum', values: ['api_token', 'password', 'ssh_key', 'recovery_codes', 'note'], required: true },
      { id: 'value', type: 'secret' },
    ],
  },
};

/**
 * Sealed bytes that seal nothing, for a grant no scene ever opens: each one is refused before its bytes are read.
 * `kek` is the root key the grant says it is under.
 */
const sealed = (kek) => ({
  label: 'Kiln deploy',
  opens: 'Deploys kiln.example',
  kind: 'api_token',
  ciphertext: new Uint8Array(32).fill(7),
  nonce: new Uint8Array(12).fill(9),
  kdf: 'hkdf-sha256',
  wrapped_by: 'kek',
  kek_id: kek,
  bytes: 32,
  hint: 'a 32-character value',
});

/* ── the envelope ───────────────────────────────────────────────────────────────────────────── */

/**
 * What came back over the wire, as the envelope `run-via.mjs` compares.
 *
 * A BODY THAT IS NONE OF THE THREE IS A THROW, and never an `accepted`: a 404 page or a stack trace read as "the
 * surface accepted it" would be a fixture failing for a reason that is not about its code.
 */
function envelopeOf(body) {
  if (body?.ok === true) return { kind: 'accepted' };
  const r = body?.refusal;
  if (r !== null && typeof r === 'object' && typeof r.code === 'string') return { kind: 'refusal', code: r.code, at: r.at, fix: r.fix };
  if (body?.conflict) return { kind: 'conflict', ...body.conflict };
  throw new Error(`the surface answered ${JSON.stringify(body)?.slice(0, 200)}, which is no envelope this reader knows`);
}

/* ── one host ───────────────────────────────────────────────────────────────────────────────── */

/** A result's value, or a throw naming the step that did not happen and the record's own sentence for why. */
function must(result, what) {
  if (result?.ok === true) return result.value;
  throw new Error(`${what}: ${result?.refusal?.fix ?? JSON.stringify(result)?.slice(0, 200)}`);
}

/**
 * A self-host with a Directory, a record its owner holds, and the name the record is served under, set up the way
 * `apps/selfhost/test/device.test.ts` sets one up, and `scene` called with what it needs to drive it.
 *
 * `open` STARTS IT WITH NO SERVER KEY, which is open mode: a request carrying nothing is the owner, uncredentialed.
 *
 * `rootKeys: 'two'` GIVES THE HOST ONE KEY FILE AND WRAPS THE RECORD UNDER ANOTHER, which is a record carried to a host
 * that was never given its key. Both files are made in the scratch folder, as `apps/selfhost/test/keys-doors.test.ts`
 * makes its one.
 *
 * `call` POSTS OVER THE SOCKET, to `localhost`, which is the name the host says it is reached by. `bearer` is the server
 * key unless a scene says otherwise, and `null` sends none; `headers` go on top, for a door that takes a cookie instead.
 * A `body` that is already text is sent as it is, which is how a fixture puts something other than an object in front
 * of the router.
 *
 * `signIn` IS THE SERVER KEY EXCHANGED FOR A BROWSER SESSION, the way the app gets one on a self-host, and it answers the
 * session's id for a scene to send as the `bd_s` cookie with `origin`.
 */
async function withHost(o, scene) {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-rpc-'));
  let now = NOW;
  let running = null;
  try {
    const stores =
      o.rootKeys === 'two' ? { host: await openKeyStore(join(dir, 'host.key')), record: await openKeyStore(join(dir, 'record.key')) } : null;
    running = await start({
      file: join(dir, 'record.brain'),
      directory: join(dir, 'directory.sqlite'),
      port: 0,
      host: '127.0.0.1',
      ...(o.open === true ? {} : { token: KEY }),
      ...(stores === null ? {} : { keys: stores.host }),
      sessionKey: new Uint8Array(randomBytes(32)),
      now: () => now,
      pollMs: 0,
    });
    const person = running.directory.person$(OWNER, 'Owner');
    if (!person.ok) throw new Error(`the Directory would not hold the owner: ${person.refusal?.fix}`);
    const made = await running.api.createRecord({
      id: REC,
      slug: 'the-studio',
      name: 'The Studio',
      tz: 'UTC',
      locale: 'en',
      owner: { id: person.value.id, email: OWNER, name: 'Owner' },
      ...(stores === null ? {} : { keys: await recordKeys(stores.record, REC) }),
    });
    if (!made.ok) throw new Error(`the host would not create the record: ${made.refusal?.fix}`);
    const named = running.directory.provision({ slug: 'the-studio', email: OWNER, record: REC });
    if (!named.ok) throw new Error(`the Directory would not name the record: ${named.refusal?.fix}`);

    const port = running.server.address().port;
    const origin = `http://localhost:${port}`;
    const call = async (path, body, bearer = o.open === true ? null : KEY, headers = {}) => {
      const res = await fetch(`${origin}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(bearer === null ? {} : { authorization: `Bearer ${bearer}` }), ...headers },
        body: typeof body === 'string' ? body : JSON.stringify(body),
      });
      const raw = await res.text();
      try {
        return JSON.parse(raw);
      } catch {
        throw new Error(`${path} answered ${res.status} with a body that is not JSON: ${raw.slice(0, 200)}`);
      }
    };
    const signIn = async () => {
      const res = await fetch(`${origin}/auth/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin },
        body: JSON.stringify({ serverKey: KEY }),
      });
      const raw = await res.text();
      const sid = /^bd_s=([A-Za-z0-9_-]{43});/u.exec(res.headers.getSetCookie()[0] ?? '')?.[1];
      if (sid === undefined) throw new Error(`the server key was not exchanged for a session: ${res.status} ${raw.slice(0, 200)}`);
      return sid;
    };
    return await scene({ running, owner: person.value.id, call, origin, signIn, advance: (ms) => void (now += ms) });
  } finally {
    await running?.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

/** A device asking to sign in, started in process: the start is setup here, and the refusal is at a door after it. */
async function deviceWaiting(running) {
  const out = await running.api.deviceStart({ reach: 'login', label: 'the rpc runner' }, '127.0.0.1');
  if (!out.ok) throw new Error(`no device could be started: ${out.refusal?.fix ?? `wait ${out.retryAfter}s`}`);
  return out.value;
}

/**
 * A figure over the ledger, installed with the ledger, the ledger's rows written, and then the figure asked for over
 * the socket through `metric`. The owner reads every list, so the record hands the figure straight to the kernel's
 * reader, `evaluateMetric` in `packages/kernel/src/metrics.ts`, which is where every refusal these scenes end on is raised.
 *
 * `after` IS HANDED THE RECORD'S OWN CONNECTION, for a scene whose state no caller can write any more (see the header).
 * It runs after the rows and before the one call.
 */
const figureScene =
  ({ fields = [], value, body = {}, rows = [], after }) =>
  () =>
    withHost({}, async ({ running, owner, call }) => {
      must(await running.api.kernel.install([ledger(fields), figure(value, body)]), 'the ledger and its figure would not install');
      for (const row of rows) must(running.api.kernel.create('ledger', row, { actor: owner }), `the row ${row.what} would not be written`);
      after?.(running.sql);
      return call('/api/metric', { metric: FIGURE });
    });

/**
 * Lists installed as packs hold them, each pack remembered as the pack path remembers one, and then the pack holding
 * Projects turned off over the socket, which is where both of `disablePack`'s own refusals are met.
 */
const packsScene = (batch) => () =>
  withHost({}, async ({ running, call }) => {
    must(await running.api.kernel.install(batch), 'the lists would not install');
    for (const pack of new Set(batch.map((d) => d.pack).filter((p) => typeof p === 'string')))
      running.api.kernel.rememberPack({
        id: pack,
        version: '1.0.0',
        source: 'local',
        ref: null,
        manifest: JSON.stringify({ pack, version: '1.0.0', requires: { format: 1, primitives: 1, packs: {} } }),
        checksum: `sum-${pack}`,
      });
    return call('/api/disablePack', { id: 'portfolio' });
  });

/* ── a fixture's own input ──────────────────────────────────────────────────────────────────── */

/**
 * `call:` and `principal:`, as `40 §6` gives them, driven the way the three slice runners drive them.
 *
 * THE CLIENT'S FIXTURE GOES THROUGH THE CLIENT, because `UNREACHABLE` is what the client says when no host answers, and a
 * host cannot be asked to not be there. `raises:` is what says so, as it is what chose each slice's runner.
 *
 * `suspended` MAKES THE OWNER THE RECORD'S ONLY ONE, AND SUSPENDED, with SQL, because the record refuses to suspend the
 * last owner who can act; the fixture's own comment gives the reason. A principal this driver cannot be is a throw that
 * names it, and never a call made as somebody else.
 */
async function carried({ call, principal }, fixture) {
  if (fixture.keys.get('raises') === 'packages/client/src/index.ts') {
    const client = createClient({ base: CLOSED, token: `${REC}.owner`, fetch: globalThis.fetch });
    return client.call(call.method, call.args);
  }
  const known = principal?.kind === 'bearer' || (principal?.kind === 'person' && principal.level === 'owner');
  if (!known) throw new Error(`carries \`principal: ${JSON.stringify(principal)}\`, and this driver is the owner or a bearer nobody issued`);
  return withHost({}, async ({ running, owner, call: post }) => {
    if (principal.kind === 'person' && principal.suspended === true)
      running.sql.exec('UPDATE person SET suspended_at = ? WHERE id = ?', '2026-09-05T12:00:00.000Z', owner);
    const bearer = principal.kind === 'bearer' ? 'a-credential-nobody-issued' : KEY;
    return post(`/api/${call.method}`, JSON.stringify(call.args), bearer);
  });
}

/* ── the scenes, and the reasons ────────────────────────────────────────────────────────────── */

/**
 * Every `rpc` fixture that carries no input, by file name: a scene that drives it, or the reason nothing does.
 *
 * A FIXTURE THAT ARRIVES IN THE FAMILY AND IS NAMED HERE BY NOBODY is still on the report, as `undriven` with the line
 * `run-via.mjs` prints for a fixture with no input, so a new one cannot be missed by adding it.
 */
export const SCENES = new Map([
  /* ── driven ── */

  /* THE OWNER ASKS FOR A PAGE NO DECLARATION NAMES. The owner reads every list, so the record hands the question to the
     kernel's `page` unchanged, which is the file the fixture names. */
  ['page-unknown.yaml', () => withHost({}, ({ call }) => call('/api/page', { slug: 'no-such-page' }))],

  /* A VIEW TAKEN OFF A LIST THAT HAS NONE BY THAT NAME. The list is installed first, so the refusal is about the view. */
  [
    'view-unknown.yaml',
    () =>
      withHost({}, async ({ running, call }) => {
        const installed = await running.api.kernel.install([OBLIGATIONS]);
        if (!installed.ok) throw new Error(`the list would not install: ${installed.refusal?.fix}`);
        return call('/api/retireView', { register: 'obligations', id: 'overdue' });
      }),
  ],

  /* THE ONLY OWNER, MOVED DOWN TO READ. `invite` on a person the record already holds is how a level changes. */
  ['level-required.yaml', () => withHost({}, ({ owner, call }) => call('/api/invite', { person: owner, level: 'read' }))],

  /* A QUESTION DECIDED, AND THEN DECIDED AGAIN. The first answer has to land, or the second proves nothing. */
  [
    'transition-illegal.yaml',
    () =>
      withHost({}, async ({ call }) => {
        const filed = await call('/api/propose', QUESTION);
        if (!filed.ok) throw new Error(`the question was not filed: ${filed.refusal?.fix}`);
        const verdict = { id: filed.value.id, decide: { option: 'two', reason: 'the invoice names two lines' } };
        const first = await call('/api/decide', verdict);
        if (!first.ok) throw new Error(`the first answer did not land: ${first.refusal?.fix}`);
        return call('/api/decide', verdict);
      }),
  ],

  /* AN INVITATION LINK MINTED ON AN OPEN HOST, where the owner is whoever is at the machine and presented nothing. A link
     works from anywhere, so the record asks for a credential before it mints one. */
  ['needs-browser-session.yaml', () => withHost({ open: true }, ({ call }) => call('/api/invite', { email: 'bea@example.com', level: 'read' }))],

  /* A DEVICE CODE NOBODY APPROVED, POLLED ONE MILLISECOND AFTER IT RAN OUT. The poll door takes no credential. */
  [
    'device-code-expired.yaml',
    () =>
      withHost({}, async ({ running, call, advance }) => {
        const code = await deviceWaiting(running);
        advance(CODE_MS + 1);
        return call('/auth/device/token', { device_code: code.device_code }, null);
      }),
  ],

  /* A WRONG SIX DIGITS, TYPED AS MANY TIMES AS THE KERNEL ALLOWS. Every miss before the last is `FORBIDDEN`; the last is
     the answer the fixture is about. */
  [
    'device-code-tries.yaml',
    () =>
      withHost({}, async ({ running, call }) => {
        const code = await deviceWaiting(running);
        const wrong = String((Number(code.user_code) + 1) % 1_000_000).padStart(6, '0');
        let last = null;
        for (let i = 0; i < CODE_TRIES; i++) last = await call('/api/deviceApprove', { user_code: wrong });
        return last;
      }),
  ],

  /* ── figures ── */

  /* A FIGURE NOBODY DECLARED, ASKED FOR BY NAME. The fixture names `pages.ts`, where the same code lands on a block of a
     page and the page answers ok around it; `metric` is the call that answers it as an envelope, from the record's own
     `metric` in `packages/record/src/index.ts`, which says the same words for a figure over a list the caller cannot
     read. */
  ['metric-unknown.yaml', () => withHost({}, ({ call }) => call('/api/metric', { metric: 'no-such-figure' }))],

  /* A FIGURE OVER A SERIES. `08 §2` names `series.<id>` as a source and install admits one, and the reader in
     `metrics.ts` reads a list or the walk ahead, so the figure is refused where it is read. The fixture names `pages.ts`,
     where the same code lands on a block; `metric` answers it as an envelope. */
  ['source-unknown.yaml', figureScene({ fields: [{ id: 'amount', type: 'money' }], value: { sum: 'amount' }, body: { source: 'series.revenue', format: 'money' } })],

  /* `median` IS PUBLISHED IN `08 §2.2` AND READ BY NOTHING IN THIS BUILD. Install lets it through, because the
     declaration is right and the build is behind, and the reader says so. */
  ['not-in-this-build.yaml', figureScene({ fields: [{ id: 'amount', type: 'money' }], value: { median: 'amount' }, body: { format: 'money' } })],

  /* A COST PER PERIOD, MULTIPLIED UP TO A YEAR, over a row whose period the table has no factor for. The row is left
     out and named rather than multiplied by one, and `period` is the field the refusal points at. */
  [
    'lookup-missing.yaml',
    figureScene({
      fields: [
        { id: 'cost', type: 'money' },
        { id: 'period', type: 'text' },
      ],
      value: { sum: { product: ['cost', { lookup: 'per_year', by: 'period' }] } },
      body: { lookups: { per_year: { monthly: 12, yearly: 1 } }, format: 'money' },
      rows: [
        { what: 'Object storage', cost: { amount: 4_100, currency: 'GBP' }, period: 'monthly' },
        { what: 'A weekly licence', cost: { amount: 900, currency: 'GBP' }, period: 'weekly' },
      ],
    }),
  ],

  /* A FIGURE THAT MULTIPLIES BY A TABLE ITS BODY DOES NOT CARRY. Install refuses that today, in `declare.ts` and at
     `lookups`, so the body the reader refuses is one from before a figure carried its tables: declaration rows are
     never edited, so a live record can still hold one, and the reader then falls back to the one table every such body
     was handed, which has no `per_week`. It is installed carrying the table and then written back without it, with
     SQL, as that older install left it. */
  [
    'lookup-unknown.yaml',
    figureScene({
      fields: [
        { id: 'cost', type: 'money' },
        { id: 'period', type: 'text' },
      ],
      value: { sum: { product: ['cost', { lookup: 'per_week', by: 'period' }] } },
      body: { lookups: { per_week: { weekly: 1, monthly: 4 } }, format: 'money' },
      after: (sql) =>
        sql.exec("UPDATE declaration SET body = json_remove(body, '$.lookups') WHERE id = ? AND superseded_at IS NULL", `metric.${FIGURE}`),
    }),
  ],

  /* A SUM OF MONEY OVER A ROW THAT CARRIES NO CURRENCY. Two currencies with no home currency are read one amount per
     currency and are not refused, so the refusal at a field is left for a set the reader cannot split: one currency and
     none. `coerce.ts` refuses a money value with no currency, so no caller can write that row now; what holds one is
     JSON already in the column from an older import, and it is put there with SQL, as `metrics.test.ts` puts it. */
  [
    'mixed-currency.yaml',
    figureScene({
      fields: [{ id: 'amount', type: 'money' }],
      value: { sum: 'amount' },
      body: { format: 'money' },
      rows: [
        { what: 'Invoice 41', amount: { amount: 480_000, currency: 'GBP' } },
        { what: 'Tax', amount: { amount: 1_910_000, currency: 'GBP' } },
      ],
      after: (sql) =>
        sql.exec(
          `UPDATE entry SET fields = json_set(fields, '$.amount', json('{"amount":250}')) WHERE register = 'ledger' AND json_extract(fields, '$.what') = 'Tax'`,
        ),
    }),
  ],

  /* A SUM OF HOURS AND DAYS. A quantity carries its own unit and a caller may write any, so two rows are enough. */
  [
    'quantity-mixed-unit.yaml',
    figureScene({
      fields: [{ id: 'amount', type: 'quantity' }],
      value: { sum: 'amount' },
      rows: [
        { what: 'Editing', amount: { value: 3, unit: 'h' } },
        { what: 'Binding', amount: { value: 4, unit: 'd' } },
      ],
    }),
  ],

  /* REVENUE IN DOLLARS OVER SPEND IN POUNDS EGYPTIAN, WITH NO RATE. With no rate, `read` in `metrics.ts` answers a
     pair one part per currency, each half read again over the rows in that currency, and refuses only when no currency
     has both halves. AN AVERAGE AND NOT A SUM, from reading `one` there: a sum over a currency no row holds is zero,
     which still makes a part for that currency, and an average over no rows is no number, which makes none. */
  [
    'ratio-mixed-currency.yaml',
    figureScene({
      fields: [
        { id: 'revenue', type: 'money' },
        { id: 'spend', type: 'money' },
      ],
      value: { ratio: { of: { avg: 'revenue' }, per: { avg: 'spend' } } },
      rows: [{ what: 'June', revenue: { amount: 500_000, currency: 'USD' }, spend: { amount: 250_000, currency: 'EGP' } }],
    }),
  ],

  /* A DAY THE CALENDAR DOES NOT HAVE, in a filter on a list. `list` resolves a filter's dates through `predicateOf` in
     `metrics.ts`, the same function every figure's filter goes through, and the tree form is the one that reaches it:
     a sentence is parsed by `packages/where` first. */
  [
    'relative-literal-unknown.yaml',
    () =>
      withHost({}, async ({ running, call }) => {
        must(await running.api.kernel.install([ledger([{ id: 'due', type: 'day' }])]), 'the ledger would not install');
        return call('/api/list', { register: 'ledger', where: { field: 'due', before: '2026-13-45' } });
      }),
  ],

  /* ── packs ── */

  /* THE PACK HOLDING PROJECTS, TURNED OFF WHILE ANOTHER PACK'S LIST LEANS ON IT, and no `alsoDisable`. */
  ['pack-required.yaml', packsScene([PROJECTS, LEARNINGS])],

  /* AND WHILE A LIST NO PACK OWNS STILL POINTS AT ITS PROJECTS, which nothing can turn off with it. */
  ['scopes-in-use.yaml', packsScene([PROJECTS, TASKS])],

  /* A PLAN READ, THE RECORD MOVED UNDER IT, AND THE PLAN APPROVED ANYWAY. The plan's hash carries the record's version,
     and installing a list is a move. */
  [
    'plan-stale.yaml',
    () =>
      withHost({}, async ({ running, call }) => {
        const { planHash } = must(await call('/api/planPack', { doc: NOTEBOOK }), 'the plan could not be read').diff;
        must(await running.api.kernel.install([OBLIGATIONS]), 'the record could not be moved');
        return call('/api/installPack', { doc: NOTEBOOK, planHash });
      }),
  ],

  /* ── questions, keys and reports ── */

  /* A CHANGE TO A LIST, PROPOSED WITH A PREDICTION THAT NAMES NO SOURCE. The change itself is one the record could
     install, a new name for a list it holds, so the prediction is the first thing `govern.ts` finds wrong with it. */
  [
    'prediction-unmeasurable.yaml',
    () =>
      withHost({}, async ({ running, call }) => {
        must(await running.api.kernel.install([OBLIGATIONS]), 'the list would not install');
        return call('/api/propose', {
          question: 'Should the obligations list be called Obligations owed?',
          body_kind: 'change',
          body: {
            declaration_id: 'register.obligations',
            to: { ...OBLIGATIONS, body: { ...OBLIGATIONS.body, name: 'Obligations owed' } },
            prediction: { claim: 'Fewer obligations are missed once the list says whose they are.', measure: { value: { count: 'id' } }, target: { lte: 0 }, window: '30d' },
          },
        });
      }),
  ],

  /* A GRANT REVOKED, AND REVOKED AGAIN. The grant is bound in process, because binding one is no route's work: a host's
     key door seals a value and the record binds it. Its bytes seal nothing, because nothing here opens them. */
  [
    'grant-revoked.yaml',
    () =>
      withHost({}, async ({ running, owner, call }) => {
        const grant = must(running.api.kernel.bindGrant(sealed('none'), owner), 'no grant could be bound');
        must(await call('/api/revokeGrant', { id: grant.id }), 'the first revoke did not land');
        return call('/api/revokeGrant', { id: grant.id });
      }),
  ],

  /* A KEY ASKED FOR ON A HOST THAT DOES NOT HOLD THE ROOT KEY ITS RECORD IS WRAPPED UNDER. The key door offers the
     record the id of the key file it holds, and the record refuses before any bytes are read. The key is deposited in
     process, through the kernel's `depositGrant`, because that is the one write that points a row at a grant, and the
     host's own deposit could not seal under a key it does not hold. The door takes a browser session and no bearer. */
  [
    'wrong-key.yaml',
    () =>
      withHost({ rootKeys: 'two' }, async ({ running, owner, call, origin, signIn }) => {
        must(await running.api.kernel.install([KEYS]), 'the list of keys would not install');
        const fields = { label: 'Kiln deploy', opens: 'Deploys kiln.example', kind: 'api_token' };
        const kek = running.api.kernel.wrappingKey() ?? 'none';
        must(running.api.kernel.depositGrant({ register: 'credentials', field: 'value', fields, grant: sealed(kek) }, { actor: owner }), 'no key could be deposited');
        const sid = await signIn();
        return call('/api/keys/open', { label: 'Kiln deploy' }, null, { cookie: `bd_s=${sid}`, origin });
      }),
  ],

  /* A REPORT KEY THAT HAS SENT ITS ROWS FOR THE MINUTE, twenty seconds into it. The budget is counted on the record's
     clock, which is pinned here, so the minute ends only when the scene moves it. */
  [
    'rate-limited.yaml',
    () =>
      withHost({}, async ({ running, call, advance }) => {
        must(await running.api.kernel.install([POINTS]), 'the list would not install');
        const key = must(await call('/api/createReportKey', { register: 'points' }), 'no report key was minted').bearer;
        for (let left = REPORT_ROWS_PER_MINUTE; left > 0; left -= REPORT_ROWS_MOST) {
          const rows = Array.from({ length: Math.min(REPORT_ROWS_MOST, left) }, (_, n) => ({ name: 'Sign-ups', value: n }));
          must(await call('/api/report', { rows }, key), 'a report inside the minute was refused');
        }
        advance(20_000);
        return call('/api/report', { name: 'Sign-ups', value: 1 }, key);
      }),
  ],

  /* ── not driven, and why ── */

  ['human-only.yaml', "the caller it refuses is an agent's token, and this driver is the owner, who adds a deleted person back by hand, or a bearer nobody issued. `packages/record/test/human-only.test.ts` drives it."],
  [
    'declaration-unknown.yaml',
    'the fixture claims `at: ids`, and no raiser under packages/kernel/src or packages/record/src answers DECLARATION_UNKNOWN at that address: the one sentence that names several ids (`None of ... is installed.`, packages/kernel/src/declare.ts) carries none. The fixture or the raiser has to move first.',
  ],
  [
    'forbidden.yaml',
    'a bearer that packages/kernel/src/token.ts refuses reaches a self-host caller as the host\'s own UNAUTHORIZED (`bearerFor` in apps/selfhost/src/server.ts), so this FORBIDDEN at `authorization` is never the envelope a caller of this host reads.',
  ],
]);

/**
 * The driver `run-via.mjs` calls: a scene's answer, or a fixture's own `call:` driven, as the envelope it compares.
 */
export async function driveRpc(input, fixture) {
  if (typeof input === 'function') return envelopeOf(await input());
  return envelopeOf(await carried(input, fixture));
}

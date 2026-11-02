/**
 * A record for the browser gates to read: the self-host, in memory, with the seed installed.
 *
 *   node tools/gates/record.mjs     serves it on 127.0.0.1 at `budgets.json`'s `record.port`, for
 *                                   `vite dev` and screenshots, until the process is stopped
 *
 * WHY THE GATES NEED ONE. `/r/[register]` reads `boot`, `schema` and `list` from the record now, and
 * `layout`, `a11y`, `keys` and `prefs` drive a real browser against a static build. Without
 * something answering `/api/*` the build's own SPA fallback answers it with `index.html`, and the
 * four gates would be measuring a screen drawn from nothing.
 *
 * THE SAME RECORD THE PRODUCT READS, NOT A STAND-IN. It is `apps/selfhost`'s `start`, which serves
 * the same `handlersFor` over the same route table as the Worker, with `installSeed` writing the
 * seed's rows through the record's own write path. The clock is pinned at the seed's `NOW`, so every
 * tone and every date band is the same on every run and every day.
 *
 * AND `/signin` DRAWS ITS FULLEST SIGNED-OUT STATE. The gates' record has a server key and a Directory,
 * so `/auth/methods` offers a passkey and the key, nobody is signed in, and it is the first run. The key
 * is random, held in this module and never printed, and `forward` puts it on every `/api/*` request, so
 * the screens read the record as its owner exactly as they did when it was open.
 *
 * IN MEMORY AND ON PORT 0, so two gates never share a file or fight for a socket. NOT `unref`ED, though
 * this paragraph said so until 22 September: `start` never calls `unref`, and a process whose record
 * leaked stayed alive on it until it was killed (`test/record-throws.test.mjs`). So a record is handed
 * back by `close()`, which every gate calls from its `finally` and `startRecord` calls on any throw.
 *
 * AND A GATE THAT FORGETS TO FORWARD IS RED, NOT QUIETLY GREEN. With no record behind the port every
 * screen draws the refusal that says the record was not reached, and a refusal card is small enough to
 * pass every width and every contrast rule. `answers` asks the gate's own port for `boot` before
 * anything is measured and throws unless the record answered it.
 *
 * AND THE VARIANTS ARE RECORDS NOW, NOT BUILDS. See `VARIANTS`.
 *
 * AND ONE OF THEM IS THE CLOUD ITSELF. `cloud` is the Worker's own `fetch` over a real Directory and a real
 * record (`apps/worker/test/cloud-serve.ts`), reached with a signed-in person's cookie where the others are reached
 * with a server key. See `startCloudRecord`.
 */

import { randomBytes } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve as resolvePath, sep } from 'node:path';
import { argv, env } from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { keysDoor } from '../../apps/selfhost/src/keychain.ts';
import { openKeyStore, recordKeys } from '../../apps/selfhost/src/keys.ts';
import { start } from '../../apps/selfhost/src/server.ts';
import { startCloud } from '../../apps/worker/test/cloud-serve.ts';
import { httpStatus } from '../../packages/host/src/index.ts';
import { NOW, ORDER, ROWS, declarations, forWrite, ingestDeclarations, installSeed, metricDeclarations, pageDeclarations } from '../../packages/seed/src/index.ts';
import { FIRST_PARTY, firstPartyDocument } from '../../packages/seed/src/packs-entry.ts';

import { budget } from './lib.mjs';
/* THE LIVED RECORD (`lived.mjs`), the gates' second record, built by living in it rather than seeded. PRF-B06
   draws it here as a variant; until then it is handed on from this door, so a gate and the look reach both records
   through one module, and the runner reads `lived.mjs` as the library it is rather than a gate nobody registered. */
export { buildLived, openLived } from './lived.mjs';
/* THE OUTSIDE WORLD A RECORD'S SCRIPTS ASK, stubbed (`outside.mjs`), handed on from here for the same reason: a walk that
   starts a record with `keys` and `outside` reaches the stub and its keys through this one door. */
export { KEYS as STUB_KEYS, SENTRY_ORG, startOutside } from './outside.mjs';

/**
 * The app's own catalogue folder, the one the build ships beside the shell: every add-on as it was last published, read
 * from the disk. `catalogue: true` hands it to the record (`startRecord`), so an add-on published since the last deploy
 * is listed in the store and installs, with the public Kennel still off.
 */
export const CATALOGUE = fileURLToPath(new URL('../../apps/web/static/catalogue', import.meta.url));

/** Each running record's server key, by its base. Here and nowhere else. */
const KEYS = new Map();

/**
 * Each running Cloud's signed-in person, by its base: the session cookie their browser would hold. Here and nowhere else.
 *
 * A BASE IN THIS MAP IS THE CLOUD, and that is the one thing `forward`, `ask` and `setPref` ask of it: the Worker reads
 * who is asking from a cookie it set itself, `__Host-` and `Secure`, which a browser on `http://127.0.0.1` would never
 * send back. So the gate carries it, as it carries the self-host's key.
 */
const COOKIES = new Map();

/** Each running record's clock, by its base, as epoch milliseconds (`clockOf`). */
const CLOCKS = new Map();

/**
 * THE OTHER RECORDS, FOR THE HALF OF EVERY BRANCH THE GATES' OWN RECORD CANNOT DRAW, and the routes each one shows.
 *
 * THEY WERE THREE MORE BUILDS OF THE APP. `BRAINDOG_VARIANT` swapped constants in the sample (`DEPLOYMENT`, `DEVICES`,
 * `TOKENS`, `DECIDED`) and `build:variants` wrote `build-cloud/`, `build-quiet/` and `build-busy/` for `layout` and `a11y`
 * to serve against this record. Once the screens read the record and not the sample, screen by screen,
 * none of those constants reached a screen, so each variant build drew exactly what the main build drew and the branches
 * it existed for went unmeasured, at three Vite builds a CI run. A variant is a record that holds something different,
 * which is what the build flag's own comment said it should be.
 *
 * `cloud` IS THE CLOUD, AND WAS THE SELF-HOST SAYING IT WAS. Until PRF-B05 `forward` wrote `host: 'cloud'` into this
 * record's `boot` and answered Billing with one fixed line, and no account door was handed on, so `/usage` was never
 * drawn from an answer the Worker gave while Usage was broken on a real record. Now the Worker answers all of it
 * (`startCloudRecord`): `boot` says `cloud` because the Worker says so, and Billing and Usage are its own doors. It
 * holds what a person a day into the Cloud holds, one use case and no entries, and not the seed.
 *
 * `connected` REPLACES `quiet`, BECAUSE THE GATES' RECORD IS THE QUIET ONE NOW. `quiet` was the sample with no machines,
 * no keys and no vault grants, so `/settings/agents` could draw its two designed empty states; the seeded record has none
 * of the three (measured on 25 September: `listDevices` and `listTokens` both `[]`), so the main pass draws those states
 * and it was the populated half that no gate reached. This one signs a machine in through the device flow, leaves a
 * second waiting for its six digits, and mints a key, the way a person connecting an agent does.
 *
 * `busy` IS STILL ENOUGH DECISIONS TO OVERFLOW A GROUP: `/search` cuts a group at ten, and says the count in a sentence
 * for a group with no door, which is what questions are. The seed decides two, so twelve more renewal questions are
 * filed and decided here, through `propose` and `decide` as the record's own path writes them.
 */
export const VARIANTS = [
  { name: 'cloud', routes: ['/settings/backups', '/settings/billing'] },
  { name: 'connected', routes: ['/settings/agents'] },
  { name: 'busy', routes: ['/search?q=renewal', '/decide'] },
];

/** The view every gate record saves, which `routes.mjs` opens as `/v/obligations.open`. */
export const VIEW = { register: 'obligations', id: 'open', name: 'Still open', filter: { field: 'state', in: ['open', 'part'] }, order: [{ field: 'due', dir: 'asc' }] };

/** The look's two runs: a button-started automation that has run once, and a job waiting for a machine. */
async function plantRuns(kernel) {
  const installed = await kernel.install([
    { id: 'rule.weekly-review', kind: 'rule', body: { rule: 'weekly-review', on: { manual: true }, steps: [{ notify: { say: 'The week is reviewed.' } }] } },
    {
      id: 'job.stale-tasks',
      kind: 'job',
      body: { job: 'stale-tasks', title: 'Stale tasks', prompt: 'Read my open tasks and say which have not moved in a month.', tools: ['mcp__braindog__search'], turns: 1, permission: 'dontAsk' },
    },
  ]);
  if (!installed.ok) throw new Error(`the look's record could not take its runs: ${installed.refusal?.fix ?? 'no reason given'}`);
  const ran = kernel.automationRun('rule.weekly-review', 'p_seed');
  if (!ran.ok) throw new Error(`the look's automation could not run: ${ran.refusal?.fix ?? 'no reason given'}`);
  await kernel.drain();
  const job = kernel.jobs.create({ kind: 'job.stale-tasks', args: {} });
  if (!job.ok) throw new Error(`the look's job could not be started: ${job.refusal?.fix ?? 'no reason given'}`);
}

/** The twelve renewals `busy` decides, one a licence year, each answered the way the year before was. */
async function decideRenewals(kernel) {
  for (let i = 0; i < 12; i++) {
    const body = {
      options: [
        { id: 'same', label: 'Same terms', because: 'Nothing has changed on either side.' },
        { id: 'raise', label: 'Raise it', because: 'Costs have moved and the licence has not.' },
      ],
    };
    const opened = kernel.propose({ question: `Renewal terms for the ${2025 - i} licence year`, body_kind: 'options', body }, 'p_seed');
    if (!opened.ok) throw new Error(`the busy record could not file a renewal: ${opened.refusal?.fix ?? 'no reason given'}`);
    const decided = kernel.decide(opened.value.id, { decide: { option: 'same', reason: 'Nothing had changed on either side.' } }, 'p_seed');
    if (!decided.ok) throw new Error(`the busy record could not decide a renewal: ${decided.refusal?.fix ?? 'no reason given'}`);
  }
}

/** How many entries a `fresh` record holds: a few put in by hand, more than none and fewer than a kept record's. */
export const FRESH_ENTRIES = 2;

/**
 * THE SEED'S LISTS AND PAGES WITH NOTHING IN THEM BUT A FEW ENTRIES, for a gate that measures a first Today (`fresh`).
 *
 * WHY A SECOND RECORD AND NOT THE SEED. Today offers its next steps and the card to tell it one real thing only on a
 * first Today (`apps/web/src/lib/home/Home.svelte`, `addedByHand` at most `FIRST_TODAY_MOST`), and the gates' record is
 * a record kept for months, so a preference that orders or hides those steps drew nothing either way there. Each entry
 * is the seed's own first row of a list, written as a person writes one; a row that points at another list's row is
 * refused here and the next list is tried.
 */
async function freshen(kernel) {
  const installed = await kernel.install([...declarations(), ...pageDeclarations(), ...metricDeclarations(), ...ingestDeclarations()]);
  if (!installed.ok) return installed;
  let made = 0;
  for (const register of ORDER) {
    if (made >= FRESH_ENTRIES) break;
    if (register === 'people' || register === 'session') continue;
    const first = ROWS[register]?.[0];
    if (first === undefined) continue;
    if (kernel.create(register, forWrite(register, first), { actor: 'p_self' }).ok) made++;
  }
  return made === FRESH_ENTRIES ? { ok: true } : { ok: false, refusal: { fix: `only ${made} of ${FRESH_ENTRIES} entries went in` } };
}

/**
 * Every gate record's name, which `startRecord` gives it before the seed goes in.
 *
 * A RECORD NOBODY NAMED IS NOT WHAT A PERSON READS. The gates' record was a self-host nobody ran `init` on, so `boot`
 * answered `record: null` and a review measured a shell with no name over it; `connected` alone was named, because a
 * bearer carries the record it is for and `createToken` refused "This record has no id yet". Named first, so the owner's
 * grant is the oldest line in its history and not news on the first screen. The owner is `p_self`, the person the
 * server key and open mode already read as (`apps/selfhost` `owner`).
 */
export const IDENTITY = { id: 'rec_01J8Z3N4W5X6Y7Z8A9B0C1D2E3', slug: 'the-studio', name: 'The Studio', tz: 'Europe/London', locale: 'en-GB', owner: { id: 'p_self' } };

/**
 * A machine signed in, a machine waiting, and a key, for `connected`.
 *
 * The device flow is asked at `localhost`, because the self-host signs devices in only at the origin it serves and
 * refuses a flow started by another name.
 */
async function connect(port, key) {
  const at = `http://localhost:${port}`;
  const send = async (path, body, bearer = false) => {
    const headers = { 'content-type': 'application/json', ...(bearer && key !== undefined ? { authorization: `Bearer ${key}` } : {}) };
    const said = await fetch(`${at}${path}`, { method: 'POST', headers, body: JSON.stringify(body) }).then((r) => r.json());
    if (said?.ok !== true) throw new Error(`the connected record refused ${path}: ${said?.refusal?.fix ?? 'no reason given'}`);
    return said.value;
  };
  const laptop = await send('/auth/device', { reach: 'runner', label: 'Studio laptop' });
  await send('/api/deviceApprove', { user_code: laptop.user_code }, true);
  await send('/auth/device/token', { device_code: laptop.device_code });
  await send('/auth/device', { reach: 'login', label: 'Claude Code, this laptop' });
  await send('/api/createToken', { scope: 'read', label: 'Nightly export' }, true);
}

/** The person `cloud` is provisioned for, invented, and the key and the runs their first day left behind. */
const CLOUD_PERSON = 'mina@the-studio.example';
const CLOUD_USE_CASE = 'usecase-founder';
const CLOUD_KEY = 'Studio laptop agent';
const CLOUD_AGENT_RUNS = ['Send the September invoices', 'Check the licence renewal dates'];
/** The script whose runs the ledger holds: Solo founder's daily one, so Usage says a name the record itself holds. */
const CLOUD_SCRIPT = 'last_day';

/**
 * `cloud`: the Worker itself, with one person a day into it.
 *
 * EVERYTHING HERE GOES IN THROUGH THE WORKER'S OWN DOORS, in the order a person meets them. An operator provisions the
 * record and the claim link is spent (`startCloud`'s `provision`), which signs them in. Solo founder is put on Decide
 * and accepted, which is what the first run's "Make it mine" comes to once its plan is drawn. A key is minted for an
 * agent, and with that key two agent runs are opened and ended, each by `handoff`. The saved view every gate record
 * holds is saved here too.
 *
 * AND THIS MONTH HAS RUNS IN IT, THREE DAYS OF THEM, so `/usage` draws a month with something to say and a chart with
 * three points. THE COUNT IS HANDED TO THE LEDGER AS A RECORD'S ALARM HANDS IT (`startCloud`'s `meter`), and the alarm
 * itself is not fired: that is the one step here that is not a door a person or an agent opens. What Usage reads after
 * it is the Worker's own `/account/usage` (both in `startCloud`'s `lived`), and a month that came back short throws,
 * because a gate that measured an
 * empty Usage would be measuring the page this variant exists to stop being the only one drawn.
 *
 * NOT THE SEED. The seed goes in through the kernel, which a Durable Object does not hand out, and a record a day old
 * with one use case is the Cloud most people are on.
 */
async function startCloudRecord() {
  const running = await startCloud({ now: NOW });
  try {
    const person = await running.provision(CLOUD_PERSON, { slug: IDENTITY.slug, name: IDENTITY.name, tz: IDENTITY.tz });
    const send = async (name, body, headers = { cookie: person.cookie }) => {
      const said = await fetch(`${running.base}/api/${name}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
        .then((r) => r.json())
        .catch(() => null);
      if (said?.ok !== true) throw new Error(`the Cloud refused ${name}: ${said?.refusal?.fix ?? 'it did not answer'}`);
      return said.value;
    };
    const offered = await send('propose', { question: 'Set this record up for a solo founder?', body_kind: 'pack', body: { install: CLOUD_USE_CASE } });
    await send('decide', { id: offered.id, decide: { option: 'accept', reason: 'This is what the record is for.' } });
    const saved = await send('saveView', VIEW);
    if (saved === undefined) throw new Error("the Cloud did not save the gates' view");
    const key = await send('createToken', { scope: 'write', label: CLOUD_KEY });
    const agent = { authorization: `Bearer ${key.bearer}` };
    for (const next of CLOUD_AGENT_RUNS) {
      await send('handoff', { next, note: 'Read the open bills first.' }, agent);
      await send('handoff', { next, state: 'done' }, agent);
    }
    const month = await running.lived(person, CLOUD_SCRIPT);
    if (month.runs === null || month.runs < month.counted)
      throw new Error(`the Cloud's usage for this month does not hold the ${month.counted} runs counted: ${month.fix ?? `it holds ${month.runs}`}`);
    COOKIES.set(running.base, person.cookie);
    CLOCKS.set(running.base, NOW);
  } catch (e) {
    await running.close().catch(() => {});
    throw e;
  }
  return {
    ...recordAt(running.base),
    variants: {},
    close: async () => {
      COOKIES.delete(running.base);
      CLOCKS.delete(running.base);
      await running.close();
    },
    server: running.server,
  };
}

/**
 * BrainDog's six modules installed as packs, with no example rows, the way `lived.mjs` puts them in: planned, then
 * installed with exactly what the plan asked to approve. Before `installSeed`, whose lists and pages then land on
 * lists and pages a pack already owns, so the record holds the seed's rows and says it holds Money 3.x.
 */
async function asModules(api) {
  const owner = { principal: { kind: 'person', id: 'p_seed', level: 'owner' } };
  for (const id of FIRST_PARTY) {
    const doc = firstPartyDocument(id, { seeds: [] });
    const planned = await api.planPack({ doc, source: { kind: 'local' } }, owner);
    if (!planned.ok) throw new Error(`the gate's record could not plan the ${id} module: ${planned.refusal?.fix ?? 'no reason given'}`);
    const { planHash, approve } = planned.value.diff;
    const put = await api.installPack({ doc, source: { kind: 'local' }, planHash, approve }, owner);
    if (!put.ok) throw new Error(`the gate's record could not install the ${id} module: ${put.refusal?.fix ?? 'no reason given'}`);
  }
}


/**
 * The key file a record's key store may be opened on: a scratch file, never the real vault.
 *
 * A SCRATCH FILE IS ONE UNDER THE MACHINE'S TEMPORARY FOLDER, the folder named, as it is on disk, under `tmpdir()` or
 * `/tmp`, and never the file `BRAINDOG_KEK_FILE` names, which is the operator's own. Anything else throws before a byte
 * is read or written, so a gate or a walk that names the wrong path is stopped rather than handed a person's keys. A
 * file that is not there yet is minted, `0600`, by `openKeyStore`, as `init` mints one.
 */
export function scratchKeyFile(file) {
  if (typeof file !== 'string' || file === '') throw new Error('a record key store needs a scratch file named');
  const at = resolvePath(file);
  const real = (dir) => {
    try {
      return realpathSync(dir);
    } catch {
      return null;
    }
  };
  const folder = real(dirname(at));
  if (folder === null) throw new Error(`${dirname(at)} is not a folder, so no key store was opened there`);
  const scratch = [tmpdir(), '/tmp', '/private/tmp'].map(real).filter((r) => r !== null);
  const under = scratch.some((root) => folder === root || folder.startsWith(root + sep));
  const vault = env.BRAINDOG_KEK_FILE === undefined ? null : resolvePath(env.BRAINDOG_KEK_FILE);
  if (!under || at === vault)
    throw new Error(`${at} is not a scratch file under the temporary folder, so it was not opened: a record started here never holds the real vault`);
  return at;
}

/**
 * Where a script's request goes when the record is given `outside`: the stub's base, then the host it asked, then its
 * path, so the stub (`outside.mjs`) answers as that service. Nothing leaves the machine.
 */
const toOutside = (outside) => async (url, init) =>
  fetch(`${outside}/${url.host}${url.pathname}${url.search}`, { method: init.method, headers: init.headers, ...(init.body === undefined ? {} : { body: init.body }), redirect: 'manual' });

/** Every host a script asks is a public address to the pin, since `toOutside` sends it to the stub whatever it is. */
const PUBLIC = async () => [{ address: '93.184.215.14', family: 4 }];

/** The owner as the keychain's own door reads them: a person, the owner, in no chat. `p_self` is `IDENTITY`'s owner. */
const OWNER_CTX = { principal: { kind: 'person', id: 'p_self', level: 'owner' } };

/**
 * Start one. `{ base, now, ask, setPref, close, server, variants }`, where `base` is `http://127.0.0.1:<port>`, `now` its
 * clock and `ask` and `setPref` its own doors with the gate's key (`recordAt`).
 *
 * `pollMs: 0` because nothing is ever delivered from a gate's record, and a ticker is a timer. EXCEPT WITH THE CATALOGUE,
 * whose record runs the belt each second, so a rule an add-on installs runs its script (Splits works out who owes what,
 * Tax set aside what to put by) and the look sees the add-on working. Outbound stays off (`actions` is never passed),
 * so a script that would call another server, Weather's or Calendar's, is held and nothing leaves this machine.
 *
 * `fresh` MAKES IT A FIRST TODAY instead of the seed: the seed's lists and pages and a few entries (`freshen`).
 *
 * `catalogue` LETS ITS STORE LIST AND INSTALL every add-on in the app's own catalogue (`CATALOGUE`), with BrainDog's
 * modules in as packs first (`asModules`) so a money add-on finds Money. The look and the command line ask for it.
 *
 * `open` IS FOR THE COMMAND LINE: `vite dev` proxies `/api` to it directly and cannot add a bearer, so that
 * record is the open self-host it always was, at the origin the dev server serves the app from.
 *
 * `keys` OPENS A KEY STORE ON A SCRATCH FILE AND PUTS STUB KEYS IN IT: `{ file, put: [{ label, opens, value }] }`. The file
 * is held to `scratchKeyFile` (never the real vault), the record is made with its three wrapped keys as `init` makes them,
 * and each key goes in through the keychain's own deposit door as the owner, so a script opens it exactly as on a real
 * self-host. `outside` IS A STUB'S BASE (`outside.mjs`): outbound is turned on and every request a script sends goes
 * there and nowhere else, its host kept in the path, and the belt runs each second. The handle then has `again()`, which
 * makes every script due now and runs one pass, since the record's clock stands still and an hourly script would
 * otherwise run once.
 *
 * `variant` MAKES THIS RECORD ONE OF `VARIANTS`, and `variants: true` starts every one of them beside this record and
 * hands their bases back as `variants[name]`. ONE `close()` GIVES ALL OF THEM BACK, which is why they come from this
 * call and not from a second one in the gate: `test/handles.test.mjs` holds every gate to closing what it opened in the
 * `finally` of the `try` it opened it in, and four records under one handle are one close.
 */
export async function startRecord(port = 0, { open = false, origin, variant, variants = false, queuePage = false, fresh = false, runs = false, catalogue = false, keys, outside } = {}) {
  if (variant !== undefined && !VARIANTS.some((v) => v.name === variant)) throw new Error(`there is no record variant called ${variant}`);
  /* THE CLOUD IS ANOTHER HOST, NOT THIS ONE WITH SOMETHING ADDED, so none of what follows is asked of it. */
  if (variant === 'cloud') return startCloudRecord();
  const key = open ? undefined : randomBytes(32).toString('base64url');
  const store = keys === undefined ? undefined : await openKeyStore(scratchKeyFile(keys.file));
  const running = await start({
    file: ':memory:',
    directory: ':memory:',
    port,
    host: '127.0.0.1',
    now: NOW,
    pollMs: catalogue || outside !== undefined ? 1_000 : 0,
    sessionKey: new Uint8Array(randomBytes(32)),
    /* NO PUBLIC KENNEL. Left to the environment, the record read `https://app.brain.dog/api/kennel/v1/` for every catalogue
       index and preview, so a screen waited on another host for up to five seconds a file: `/packs/browse` asks for a
       preview of every add-on, missed `networkidle` while the Kennel was slow, and `a11y`'s seeded run died on that
       timeout before it could name a single seed, which `self-test` read as four negatives passed. A gate measures
       this record and nothing on the network. */
    kennel: { kennel: 'off', fetch: () => Promise.reject(new Error('the gates read no Kennel')), now: () => NOW },
    /* THE APP'S OWN CATALOGUE, ASKED FOR BY THE LOOK AND THE COMMAND LINE. With the Kennel off and no folder, the store
       listed nothing, so an add-on published since the last deploy could not be opened anywhere before that deploy. The
       folder is on this disk, so nothing waits on the network. No gate asks for it: their sweeps measure the seed as it
       ships, and a gate's `/packs/browse` stays the empty store it has always measured. */
    ...(catalogue ? { catalogue: CATALOGUE } : {}),
    ...(store === undefined ? {} : { keys: store }),
    /* THE STUB AND NOTHING ELSE. `openKey` is left to the host, so the key a script sends is the one this store opens. */
    ...(outside === undefined ? {} : { actions: { send: toOutside(outside), resolve: PUBLIC } }),
    ...(key === undefined ? {} : { token: key }),
    ...(origin === undefined ? {} : { origin }),
  });
  /* FROM HERE ANY THROW CLOSES WHAT `start` OPENED, and the gates rely on it: each one leaves `record` `null` when
     this throws, so a server still listening after the throw is a server nobody holds a handle to. Until 22 September
     only the two refusals below closed it, each by hand, and an exception out of `installSeed` or `person$` left the
     port bound: `test/record-throws.test.mjs` rebound it after a stubbed seed threw and got EADDRINUSE, and the child
     stayed alive on the leaked server until it was killed. The refusals now throw into the same `catch` rather than
     closing first, because closing twice takes `sql.close()` through a database already closed. The `.catch` only
     drops a rejection, so the caller sees why the record did not start and not why it did not stop; `close()` as
     `start` writes it never rejects, and a throw inside its `server.close` callback is uncaught rather than dropped. */
  try {
    const named = running.api.kernel.createRecord(store === undefined ? IDENTITY : { ...IDENTITY, keys: await recordKeys(store, IDENTITY.id) });
    if (!named.ok) throw new Error(`the gate's record could not be named: ${named.refusal?.fix ?? 'no reason given'}`);
    /* WITH THE CATALOGUE, BRAINDOG'S MODULES GO IN FIRST AS THE PACKS A PERSON'S RECORD HOLDS THEM AS (`asModules`), so
       an add-on that needs Money finds it: the seed alone writes Money's lists as the record's own, and the store
       refused every money add-on with "Needs Money, which this record does not have". */
    if (catalogue && !fresh) await asModules(running.api);
    /* `fresh` IS A FIRST TODAY: the seed's lists and pages, and a few entries put in by hand (`freshen`). */
    const seeded = fresh ? await freshen(running.api.kernel) : await installSeed(running.api.kernel);
    if (!seeded.ok) throw new Error(`the gate's record could not take the seed: ${seeded.refusal?.fix ?? 'no reason given'}`);
    /* ONE PERSON, SO THE KEY IS A WAY IN. Sign-in offers the server key only where the Directory holds exactly one
       person, so without an owner /signin would draw a self-host nobody ran `init --owner` on. */
    if (key !== undefined) {
      const owner = running.directory.person$('owner@the-studio.example', 'Owner');
      if (!owner.ok) throw new Error(`the gate's record could not name its owner: ${owner.refusal?.fix ?? 'no reason given'}`);
    }
    /* A SAVED VIEW, SO `/v/[view]` HAS SOMETHING TO DRAW. The seed saves none, so the gates opened the view route with
       the record taken away and measured the sample's view; with no sample that address is the refusal "the record was
       not reached", which is a finding on any route outside `MAY_REFUSE` (`lib.mjs`). `routes.mjs` samples this key. */
    const saved = running.api.kernel.saveView(VIEW, { actor: 'p_seed' });
    if (!saved.ok) throw new Error(`the gate's record could not save its view: ${saved.refusal?.fix ?? 'no reason given'}`);
    /* A QUEUE OF ITS OWN, ASKED FOR BY `queue.mjs` AND `keys.mjs` ALONE, SO EACH HAS ONE TO PRESS. The seeded Agents page
       stopped drawing one at agents 1.5.0, since it repeated Decide, Money's went to Decide at money-core 3.17.0, and
       every other seeded queue is filtered to a list the seed's questions are not about. No sweeping gate's record holds
       it, so their sweeps measure the seed as it ships. */
    const queued = !queuePage ? { ok: true } : await running.api.kernel.install([
      {
        id: 'page.questions',
        kind: 'page',
        body: {
          page: 'questions',
          title: 'Questions',
          requires: ['register.session'],
          blocks: [{ kind: 'queue', heading: 'Waiting on you', icon: 'ask', span: 12, source: 'governance.open', limit: 3, empty: 'Nothing is waiting on you.' }],
        },
      },
    ]);
    if (!queued.ok) throw new Error(`the gate's record could not take its queue page: ${queued.refusal?.fix ?? 'no reason given'}`);
    /* ONE RUN OF AN AUTOMATION AND ONE JOB, ASKED FOR BY THE LOOK ALONE (`tools/look/sources/seed.mjs`), so an
       automation's Runs and `/jobs/[id]` have something to draw. The seed holds neither: its rules run inside the change
       that starts them and keep no run, and it approves no kind of job. No gate's record holds them. */
    if (runs) await plantRuns(running.api.kernel);
    if (variant === 'busy') await decideRenewals(running.api.kernel);
    if (variant === 'connected') await connect(running.server.address().port, key);
    /* THE STUB KEYS, LAST, so the Keychain the seed or a module holds is there to take them. Through the door the Keys
       screen deposits through, as the owner, sealed under this store. */
    if (store !== undefined) {
      const door = keysDoor(running.api, store, new Set(['http://127.0.0.1']));
      for (const k of keys.put ?? []) {
        const put = await door.keys.put({ ctx: OWNER_CTX, hints: {}, body: { label: k.label, opens: k.opens, value: k.value, ...(k.kind === undefined ? {} : { kind: k.kind }) } });
        if (!put.ok) throw new Error(`the gate's record could not keep the stub key ${k.label}: ${put.refusal?.fix ?? 'no reason given'}`);
      }
    }
  } catch (e) {
    await running.close().catch(() => {});
    throw e;
  }
  const { port: at } = running.server.address();
  const base = `http://127.0.0.1:${at}`;
  if (key !== undefined) KEYS.set(base, key);
  CLOCKS.set(base, NOW);
  const stop = () => {
    KEYS.delete(base);
    CLOCKS.delete(base);
    return running.close();
  };

  /* THE VARIANTS, EACH A WHOLE RECORD OF ITS OWN, and a throw in any of them hands back every one already started and
     this one, for the reason the `catch` above gives. */
  const others = [];
  if (variants)
    try {
      for (const v of VARIANTS) others.push({ name: v.name, record: await startRecord(0, { variant: v.name }) });
    } catch (e) {
      for (const o of others) await o.record.close().catch(() => {});
      await stop().catch(() => {});
      throw e;
    }
  /* THE HANDLE IS ALSO WHAT `openPage` AND `routesFor` READ (`recordAt`): the base, the clock, a read and a setting. */
  return {
    ...recordAt(base),
    variants: Object.fromEntries(others.map((o) => [o.name, o.record.base])),
    close: async () => {
      for (const o of others) await o.record.close();
      await stop();
    },
    server: running.server,
    ...(outside === undefined
      ? {}
      : {
          /* THE KERNEL AND ITS DATABASE, for a walk that sets quiet hours or counts what the outbox holds. */
          kernel: running.api.kernel,
          sql: running.sql,
          /* EVERY SCRIPT DUE AT THE RECORD'S NOW, AND ONE PASS. The clock stands at `NOW`, so a script that ran once is
             next due an hour after a moment that never comes. */
          again: async () => {
            running.sql.exec("UPDATE schedule SET due_at = ? WHERE kind = 'script'", new Date(NOW - 1_000).toISOString());
            /* AND PASSES UNTIL NO RUN IS LEFT WAITING: a pass leases a few, and the seed's own scripts queue a couple of
               hundred runs the first time, so one pass would leave an add-on's run behind them. */
            const waiting = () => running.sql.one("SELECT count(*) AS n FROM outbox WHERE kind = 'script.run' AND state IN ('pending', 'leased')")?.n ?? 0;
            for (let i = 0; i < 400; i++) {
              await running.poll();
              if (waiting() === 0) break;
            }
            /* AND WHAT EACH SCRIPT SAID, from its newest run's event, so a walk can print it. */
            return running.sql
              .all("SELECT target, note, to_v FROM event WHERE target LIKE 'declaration:script.%' AND rowid IN (SELECT max(rowid) FROM event WHERE target LIKE 'declaration:script.%' GROUP BY target)")
              .map((e) => {
                let said = {};
                try {
                  said = JSON.parse(e.to_v ?? '{}') ?? {};
                } catch {}
                return { script: String(e.target).replace('declaration:script.', ''), outcome: said.outcome ?? e.note, log: said.log ?? null };
              });
          },
        }),
  };
}

/**
 * The paths a gate's server hands to the record: the record's own (`api`), sign-in's (`auth`), the person's account
 * doors (`account`), OAuth's (`oauth`), an agent's (`mcp`) and what arrives from outside (`in`). Everything else is the
 * build's.
 *
 * EVERY DOOR A HOST ANSWERS AND THE BUILD DOES NOT. It was `api`, `auth` and `account/billing`, so the build's
 * own fallback answered `/account/usage` and no gate had drawn Usage from a host's answer. The same six names are the
 * Worker's root doors (`apps/worker/src/route.ts`) and the self-host's.
 *
 * AND A RECORD'S `/api` UNDER ITS NAME, `/<slug>/api/<method>`, which is where a page opened at `/<slug>/...` asks
 * (`apiBase` in `apps/web/src/lib/at.ts`) now the app is the root. `forward` takes the name off, because a gate's server
 * holds one record and the name has done its work by then, as it has in the Worker (`atRoot`).
 */
export const forwards = (pathname) => /^\/+(?:api|auth|account|oauth|mcp|in)(?:\/|$)/.test(unslugged(pathname));

/** `/<slug>/api/...` as the record reads it, `/api/...`; any other path unchanged. */
const unslugged = (pathname) => pathname.replace(/^\/+[a-z][a-z0-9-]*[a-z0-9](?=\/+api(?:\/|$))/u, '');

/**
 * `GET /account/records` as the host's envelope (`readRecordsForSwitcher` in `apps/web/src/lib/record/switcher.ts`):
 * the one record a gate's server holds, its owner's.
 *
 * NOT FORWARDED TO A SELF-HOST, BECAUSE THE SELF-HOST WOULD SAY NO. The route reads a session cookie and nothing else,
 * and a gate's self-host is reached with its server key, so the record behind it answers 401 and the switcher would
 * draw "Sign in again" over a record the screen is plainly open on. The shell asks this on every screen, so a source
 * that left it to a 404 put one failed request and two console errors in every picture. `forward` answers with this
 * for a self-host now that `forwards` hands the whole of `account` on, so a gate whose server does not answer it
 * first draws the same row. THE CLOUD ANSWERS FOR ITSELF: its person is signed in, and the row is the Worker's.
 */
export const recordsAnswer = () => ({ ok: true, value: [{ slug: IDENTITY.slug, name: IDENTITY.name, level: 'owner' }] });

/**
 * The server key of a record this module started, for the one gate that has to sign in as a person rather than
 * be handed the record: `passkey` drives the real ceremony, and the key is the door the first person comes
 * through before a passkey exists. It stays inside this process and is never printed, as it was before.
 */
export const serverKeyFor = (base) => KEYS.get(base);

/**
 * The record's clock: the instant a record this module started reads as now, or `null` for a base it did not start.
 *
 * ONE CLOCK FOR THE RECORD AND THE PAGE. The record was pinned at the seed's `NOW` and the page drew at the
 * runner's own date, so Today's date line and Usage's "this month" were measured on a day the record never lived. A
 * gate opens every page through `openPage` (`lib.mjs`), which pins the page to this instant. By base, so a record that
 * lives on its own clock (the lived copy) hands back its own.
 */
export const clockOf = (base) => CLOCKS.get(base) ?? null;

/**
 * What a gate presents to one running record as its owner: a self-host's server key, or the Cloud person's cookie.
 * Nothing for an open record.
 */
function credentialOf(base) {
  const cookie = COOKIES.get(base);
  if (cookie !== undefined) return { cookie };
  const key = KEYS.get(base);
  return key === undefined ? {} : { authorization: `Bearer ${key}` };
}

/** The query string the client writes: a string as itself, anything else as JSON, an absent value left out. */
const queryOf = (args) =>
  new URLSearchParams(
    Object.entries(args)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]),
  );

/**
 * One read through the record's own door, with the gate's key, as the record's envelope.
 *
 * THE RECORD IS ASKED, NEVER WRITTEN FOR. `routes.mjs` asks it for its own addresses with this, so an id a gate opens
 * is one the record holds, and a record that does not answer is the envelope `forward` gives, not a throw.
 */
export async function ask(base, name, args = {}) {
  return fetch(new URL(`/api/${name}?${queryOf(args)}`, base), { headers: credentialOf(base) })
    .then((r) => r.json())
    .catch((e) => ({ ok: false, refusal: { code: 'RECORD_UNAVAILABLE', fix: `The gate's record did not answer ${name}: ${e instanceof Error ? e.message : String(e)}.` } }));
}

/**
 * Keep one of the person's own settings through the record's `setPref`, with the gate's key. `null` takes it away.
 *
 * A GATE ONCE WROTE THE PREFERENCES INTO `boot` ITSELF, on a comment that said the record refuses `setPref` from a key;
 * that writer is gone. The record refuses a token (`packages/record/src/index.ts` `setPref`), and
 * the gate's key is the self-host's server key, which speaks as the owner, a person (`apps/selfhost/src/server.ts`
 * `owner`): asked on 9 October, `setPref nav.shape bar` with this key answered `ok: true`. So a page reads what the
 * record keeps, through the door a person's own Settings writes through, and no answer is written by a gate. On the
 * Cloud it is the signed-in person's cookie, and the Worker answered the same on 13 October.
 *
 * A REFUSAL THROWS, in the record's own words, because a gate that measured a screen without the setting it asked for
 * would measure the wrong screen and say nothing.
 */
export async function setPref(base, key, value) {
  const said = await fetch(new URL('/api/setPref', base), {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...credentialOf(base) },
    body: JSON.stringify({ key, value }),
  })
    .then((r) => r.json())
    .catch(() => null);
  if (said?.ok !== true) throw new Error(`the gate's record would not keep ${key}: ${said?.refusal?.fix ?? 'it did not answer'}`);
  return said.value;
}

/**
 * What `openPage` and `routesFor` need of one running record: its base, its clock, a read and a setting kept.
 *
 * `startRecord`'s handle is one of these, and `recordAt(record.variants.cloud)` makes one for a variant.
 */
export const recordAt = (base) => ({
  base,
  now: clockOf(base),
  ask: (name, args) => ask(base, name, args),
  setPref: (key, value) => setPref(base, key, value),
});

/** Headers that describe one hop and not the message, so they are not copied across this one. */
const HOP = new Set(['connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'host', 'content-length', 'content-encoding']);

/**
 * Hand one request to the record and its answer back, unchanged.
 *
 * THE BODY IS READ WHOLE BEFORE IT IS SENT, because `fetch` wants a body it can measure and a gate's
 * requests are small. A record that does not answer is `RECORD_UNAVAILABLE`, at the status the
 * shared table gives it: a refusal the screen draws as an error card, which is a finding on every
 * route outside `MAY_REFUSE`, and never `UNREACHABLE`, which is the one answer that means the gate's port
 * reached nothing at all.
 *
 * NO ANSWER IS WRITTEN OR REWRITTEN FOR THE CLOUD. `boot` from the `cloud` variant had `host: 'cloud'` put
 * into it here and Billing was one fixed line, `{ records: [], open: false }`; both are the Worker's own answers now.
 * THE ANSWERS MADE HERE are a self-host's `POST /api/seen` (an empty answer, below) and its `GET /account/records`,
 * for the reason `recordsAnswer` gives, the second only
 * while the gate is speaking as the owner: with `bearer: false` the self-host answers for itself, 401 to nobody and
 * the person's own records once they have signed in.
 *
 * THE CLOUD'S PERSON IS SIGNED IN ON EVERY PATH, as their browser is: the cookie goes with whatever is handed on, where
 * a self-host's key goes on `/api/*` alone. The Worker asks `/auth/methods` who is here before Usage asks the ledger.
 *
 * EVERY `Set-Cookie` COMES BACK AS ITS OWN HEADER. `forEach` joins them into one value no browser can split.
 *
 * `bearer: false` KEEPS THE KEY OFF THE WIRE, and the Cloud's cookie with it, which is what a gate about signing in
 * needs: with the key on every request, each screen reads the record as its owner and there is no signed-out state
 * left to drive.
 * It is on by default because every other browser gate measures a screen rather than a door.
 */
export async function forward(req, res, base, { bearer = true } = {}) {
  const cookie = COOKIES.get(base);
  if (bearer && cookie === undefined && req.method === 'GET' && /^\/+account\/records\/?$/u.test(new URL(req.url ?? '/', base).pathname)) {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify(recordsAnswer()));
    return;
  }
  /* AND A SELF-HOST'S `POST /api/seen`, the site's visit count (`apps/site/static/seen.js`). Only the Worker serves the
     site and counts it (`apps/worker/src/seen.ts`), and every way out there is the same 204; a self-host has no such
     method and answered 404, a console error on every site page a gate opened. The Cloud answers for itself. Answered
     empty with the server's own default status, since `seen.js` reads nothing back and only a failure is a fault. */
  if (cookie === undefined && req.method === 'POST' && /^\/+api\/seen\/?$/u.test(new URL(req.url ?? '/', base).pathname)) {
    req.resume();
    res.setHeader('cache-control', 'no-store');
    res.end();
    return;
  }
  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) if (!HOP.has(k) && v !== undefined) headers[k] = Array.isArray(v) ? v.join(', ') : v;
  const url = new URL(req.url ?? '/', base);
  url.pathname = unslugged(url.pathname);
  const key = KEYS.get(base);
  if (bearer && key !== undefined && /^\/+api(?:\/|$)/.test(url.pathname) && headers.authorization === undefined) headers.authorization = `Bearer ${key}`;
  if (bearer && cookie !== undefined) headers.cookie = headers.cookie === undefined ? cookie : `${headers.cookie}; ${cookie}`;
  try {
    /* INSIDE THE TRY: a request the browser drops mid-flight (a page being left) rejects this read, and nothing awaits that. */
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const out = await fetch(url, {
      method: req.method ?? 'GET',
      headers,
      ...(chunks.length ? { body: Buffer.concat(chunks) } : {}),
    });
    const back = {};
    out.headers.forEach((v, k) => {
      if (!HOP.has(k) && k !== 'set-cookie') back[k] = v;
    });
    const cookies = out.headers.getSetCookie();
    if (cookies.length > 0) back['set-cookie'] = cookies;
    res.writeHead(out.status, back);
    res.end(Buffer.from(await out.arrayBuffer()));
  } catch (e) {
    const answer = { ok: false, refusal: { code: 'RECORD_UNAVAILABLE', fix: `The gate's record did not answer: ${e instanceof Error ? e.message : String(e)}.` } };
    res.writeHead(httpStatus(answer), { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify(answer));
  }
}

/**
 * Throw unless `origin`'s `/api/boot` is the record answering.
 *
 * ASKED OF THE GATE'S OWN PORT, so what is proved is the forward and not merely the record.
 */
export async function answers(origin) {
  const said = await fetch(new URL('/api/boot', origin))
    .then((r) => r.json())
    .catch(() => null);
  if (said?.ok !== true || !Array.isArray(said.value?.registers) || said.value.registers.length === 0)
    throw new Error(`${origin}/api/boot is not the gate's record answering, so every screen would draw the refusal that says so.`);
}

/* THE COMMAND LINE: one open record on a fixed port, for `vite dev` and `vite preview` to proxy to. Its
   origin is the dev server's (`apps/web/vite.config.ts`, port 5183), because that is the `Host` and the
   `Origin` the proxy passes on, and an open self-host answers only its own names. */
if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href) {
  const { port } = budget('record');
  const { base, server } = await startRecord(port, { open: true, origin: 'http://localhost:5183', catalogue: true });
  server.ref();
  console.log(`  record: ${base}, the seed at ${new Date(NOW).toISOString().slice(0, 10)}. Stop it with Ctrl+C.`);
}

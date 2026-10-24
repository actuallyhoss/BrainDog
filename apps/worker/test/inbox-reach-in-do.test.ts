/**
 * An agent sorts the money inbox on the Cloud: a token its owner minted with the `inbox` reach reads the digest, one
 * state and one arrival whole, files one arrival and puts one back, on a record that lives in a Durable Object
 * (AGT-B13 job 6).
 *
 * WHY THIS FILE EXISTS. The read, the digest and the triage door were held over the record on `node:sqlite`
 * (`packages/record/test/inbox-digest.test.ts`, `triage-door.test.ts`) and the reach's crossing of the Worker over
 * stubs (`test/bearer-reach.test.ts`). Nobody had minted a token with the reach through the Worker and watched workerd
 * carry it from the token's row to the record's gate and file a row signed by the agent's run.
 *
 * WHAT RUNS, AND NOTHING IN THE MIDDLE IS A DOUBLE. Built the way `shortcut-in-do.test.ts` builds it: `src/index.ts`
 * bundled by `wrangler`'s own esbuild with `cloudflare:workers` left for workerd, Miniflare serving both Durable Objects
 * on SQLite storage, a record made by `POST /auth/provision`, its owner signed in by spending the claim link, and Solo
 * founder and `bank-hsbc-eg` installed on Decide. 250 texts are posted through the bank's door as the Shortcut posts
 * them, landing in four states: 130 with a wrong token wait `untriaged`, 50 withdrawals with the right one are filed
 * `matched` by the pack's rule, 50 that are not the bank's are `skipped` by its skip rule, and 20 more the owner sets
 * aside, `ignored`. The agent's token is minted through `/api/createToken` on the owner's session.
 *
 * ONE RECORD FOR THE FILE, because 250 posts are the slow part and every case reads the same inbox; the cases that
 * move an arrival move ones no other case reads.
 *
 * EVERY ANSWER OF 500 OR MORE IS COUNTED, as in the other `*-in-do` files.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createClient, type Client, type InboxDigest, type InboxPage, type InboxState } from '../../../packages/client/src/index.ts';
import { bankHsbcEgFile as bankHsbcEgPack } from '../../../packages/seed/test/pack-files.ts';

const fromWrangler = createRequire(createRequire(import.meta.url).resolve('wrangler/package.json'));
const esbuild = fromWrangler('esbuild') as { build(o: object): Promise<{ outputFiles: { text: string }[] }> };
const { Miniflare, convertV4MiniflareOptions } = (await import(pathToFileURL(fromWrangler.resolve('miniflare')).href)) as {
  Miniflare: new (o: object) => { ready: Promise<URL>; dispose(): Promise<void> };
  convertV4MiniflareOptions(o: object): object;
};

const HOST = 'app.example.test';
const ORIGIN = `https://${HOST}`;
/* NOT SECRETS. They guard a Worker that lives in this process for a few seconds. */
const PROVISION_KEY = 'inbox-reach-in-do-operator-key-not-a-secret';
const SESSION_SECRET = 'inbox-reach-in-do-session-secret-not-a-secret-0123456789';
const INGEST = 'bank-from-out-sms';
const NO_REACH = 'Reading the inbox needs a token its owner gave the inbox reach. The owner mints one with braindog token create --inbox.';
const TRIAGE_NO_REACH = 'Triage needs a token its owner gave the inbox reach. The owner mints one with braindog token create --inbox.';

/** How many texts land in each state. Two states hold none, and are still counted. */
const HELD: Record<InboxState, number> = { untriaged: 130, review: 0, skipped: 50, matched: 50, proposed: 0, ignored: 20 };

/** A withdrawal in the bank's wording, `n` making each amount and so each text its own. */
const withdrawal = (n: number): string =>
  `From HSBC: 16AUG26 ATM Cash Withdrawal from 310-527***-846 EGP ${String(1000 + n)}.00- Your available balance is EGP 31,040.25`;
/** A text with a wrong token: every fifth is longer than a digest shows, so it comes back cut. */
const waiting = (n: number): string => (n % 5 === 0 ? `Card purchase ${String(n)} at ${'a shop with a long name on a long street, '.repeat(6)}` : `Card purchase ${String(n)}`);
/** A text the door verifies that is not the bank's, which the pack's skip rule sets aside. */
const notTheBank = (n: number): string => `Your parcel ${String(n)} is out for delivery today`;

let mf: InstanceType<typeof Miniflare> | undefined;
let base = '';
const fives: string[] = [];
let asked = 0;

async function counted(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init);
  asked++;
  if (res.status >= 500) fives.push(`${String(res.status)} ${String(input)}: ${await res.clone().text()}`);
  return res;
}

/** The one record: its owner's session, the ids the texts landed as by what was posted, and two agents' clients. */
type Held = { owner: Client; agent: Client; without: Client; account: string; bodies: Map<string, string> };
let held: Held | undefined;

async function setUp(): Promise<Held> {
  const provisioned = await counted(`${base}/auth/provision`, {
    method: 'POST',
    headers: { authorization: `Bearer ${PROVISION_KEY}`, 'content-type': 'application/json', origin: ORIGIN },
    body: JSON.stringify({ slug: 'inbox-reach', email: 'inbox-reach@example.test', name: 'Inbox' }),
  });
  const out = (await provisioned.json()) as { ok: boolean; value?: { record: string; claim: string } };
  assert.equal(provisioned.status, 200, JSON.stringify(out));
  const redeemed = await counted(`${base}/auth/magic/redeem`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN },
    body: JSON.stringify({ claimToken: out.value!.claim.split('#claim=')[1] }),
  });
  const set = redeemed.headers.getSetCookie().find((c) => c.startsWith('__Host-bd_s='));
  assert.ok(set, `the claim link signed nobody in: ${String(redeemed.status)} ${await redeemed.text()}`);
  const cookie = set.split(';')[0]!;
  const owner = createClient({
    base,
    fetch: (input, init) => {
      const sent = new Headers(init?.headers);
      sent.set('cookie', cookie);
      sent.set('origin', ORIGIN);
      return counted(input, { ...init, headers: sent });
    },
  });
  for (const body of [{ install: 'usecase-founder' }, { install: 'bank-hsbc-eg', doc: bankHsbcEgPack() }]) {
    const filed = await owner.call<{ id: string }>('propose', { question: `Install ${body.install}?`, body_kind: 'pack', body });
    assert.ok(filed.ok, `${body.install} could not be offered on the Worker: ${JSON.stringify(filed)}`);
    const accepted = await owner.call('decide', { id: filed.value.id, decide: { option: 'accept', reason: 'the bank texts need it' } });
    assert.ok(accepted.ok, `${body.install} would not install on the Worker: ${JSON.stringify(accepted)}`);
  }
  const account = await owner.create({
    register: 'accounts',
    fields: { name: 'Cairo current account', kind: 'bank', balance: { amount: 0, currency: 'EGP' }, as_of: '2026-08-01', liquid: true, last4: '846' },
  });
  assert.ok(account.ok, JSON.stringify(account));
  const rec = out.value!.record;
  const minted = await owner.call<{ token: string }>('ingestMint', { ingest: INGEST });
  assert.ok(minted.ok, JSON.stringify(minted));
  /* THE DOOR'S BUDGET IS 120 A MINUTE ON ONE PATH (`IN_PER_MINUTE` in `src/route.ts`), and 250 texts are more than
     that. The wrong token's texts go to two of the pack's other text ingests, which share the door's verification, so
     no path passes its minute; a 429 is still waited out as its `retry-after` says, as a Shortcut that honours it would,
     which took two minutes when every text went to one path. */
  const post = async (token: string, body: string, path: string = INGEST): Promise<void> => {
    for (;;) {
      const res = await counted(`${base}/in/webhook/${rec}/${path}/${token}`, { method: 'POST', body });
      if (res.status === 429) {
        await new Promise((done) => setTimeout(done, 1000 * Number(res.headers.get('retry-after') ?? '1')));
        continue;
      }
      assert.equal(res.status, 202, `a text was answered ${String(res.status)}: ${await res.text()}`);
      return;
    }
  };
  const bodies = new Map<string, string>();
  let n = 0;
  for (let k = 0; k < HELD.untriaged + HELD.ignored; k++) await post('tk_not_the_one_he_was_shown', waiting(++n), k % 2 === 0 ? 'bank-card-used-sms' : 'bank-from-in-sms');
  for (let k = 0; k < HELD.matched; k++) await post(minted.value.token, withdrawal(++n));
  for (let k = 0; k < HELD.skipped; k++) await post(minted.value.token, notTheBank(++n));
  /* WHAT WAITS, READ BY THE OWNER A PAGE AT A TIME, so each arrival's id is known by what was posted. */
  let cursor: number | null | undefined;
  do {
    const page = await owner.inbox({ state: 'untriaged', ...(cursor ? { cursor } : {}) });
    assert.ok(page.ok, JSON.stringify(page));
    for (const a of page.value.arrivals) bodies.set(a.id, a.body ?? '');
    cursor = page.value.cursor;
  } while (cursor);
  assert.equal(bodies.size, HELD.untriaged + HELD.ignored, 'a text posted with a wrong token did not wait in the inbox');
  /* THE OWNER SETS TWENTY ASIDE, the ones posted last before the right token was used. */
  for (const [id, body] of bodies) {
    const k = Number(/^Card purchase (\d+)/.exec(body)?.[1]);
    if (k <= HELD.untriaged) continue;
    const archived = await owner.call('archiveArrival', { id });
    assert.ok(archived.ok, `the owner could not set an arrival aside: ${JSON.stringify(archived)}`);
    bodies.delete(id);
  }
  /* THE TWO AGENTS' TOKENS, minted on the owner's session: one with the reach, and one for the whole record without. */
  const mint = async (reach: boolean): Promise<Client> => {
    const got = await owner.call<{ bearer: string }>('createToken', { scope: 'write', label: reach ? 'triage' : 'no reach', ...(reach ? { reach: ['inbox'] } : {}) });
    assert.ok(got.ok, `the owner could not mint a token on the Worker: ${JSON.stringify(got)}`);
    return createClient({ base, token: got.value.bearer, fetch: (input, init) => counted(input, init) });
  };
  return { owner, agent: await mint(true), without: await mint(false), account: (account.value as { id: string }).id, bodies };
}

before(async () => {
  const built = await esbuild.build({
    entryPoints: [fileURLToPath(new URL('../src/index.ts', import.meta.url))],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'neutral',
    conditions: ['workerd', 'worker', 'browser'],
    mainFields: ['module', 'main'],
    external: ['cloudflare:workers'],
    logLevel: 'silent',
  });
  mf = new Miniflare(
    convertV4MiniflareOptions({
      /* Port 0, so the system picks one: a fixed port would collide with `wrangler dev` or a gate already listening. */
      port: 0,
      modules: true,
      script: built.outputFiles[0]!.text,
      /* `wrangler.jsonc`'s own date and flags, because a different date is a different runtime. */
      compatibilityDate: '2026-09-01',
      compatibilityFlags: [],
      durableObjects: { RECORD: { className: 'Record$', useSQLite: true }, DIRECTORY: { className: 'Directory$', useSQLite: true } },
      queueProducers: { INGRESS: 'braindog-ingress' },
      bindings: { PUBLIC_HOST: HOST, SESSION_SECRET, PROVISION_KEY, PROVISION_WITHOUT_KEYS: 'yes', BRAINDOG_BUILD: '' },
    }),
  );
  base = (await mf.ready).origin;
  held = await setUp();
});

after(async () => {
  await mf?.dispose();
});

test('THE DIGEST COUNTS ALL SIX STATES AND HANDS THE NEWEST HUNDRED OF EACH, a long body cut to 180 and marked', async () => {
  const { agent, bodies } = held!;
  const got = await agent.inbox({ digest: true });
  assert.ok(got.ok, `the agent could not read the digest: ${JSON.stringify(got)}`);
  const digest: InboxDigest = got.value;
  assert.deepEqual(digest.counts, HELD);
  for (const [state, n] of Object.entries(HELD) as [InboxState, number][]) {
    const lines = digest.states[state];
    assert.equal(lines.length, Math.min(n, 100), `${state} handed ${String(lines.length)} lines`);
    assert.ok(lines.every((l) => l.state === state), `${state} handed an arrival in another state`);
  }
  const untriaged = digest.states.untriaged;
  const cut = untriaged.filter((l) => l.cut === true);
  assert.ok(cut.length > 0, 'no long body came back cut');
  for (const line of untriaged) {
    const whole = bodies.get(line.id);
    assert.ok(whole !== undefined, 'the digest handed an arrival nobody posted');
    assert.equal(line.body, whole.length > 180 ? whole.slice(0, 180) : whole);
    assert.equal(line.cut, whole.length > 180 ? true : undefined, `the mark on ${line.id} is wrong`);
  }
});

test('ONE STATE IS A PAGE OF THAT STATE, with every count beside it', async () => {
  const { agent } = held!;
  const got = await agent.inbox({ state: 'skipped' });
  assert.ok(got.ok, JSON.stringify(got));
  const page: InboxPage = got.value;
  assert.ok(page.arrivals.length > 0);
  assert.ok(page.arrivals.every((a) => a.state === 'skipped' && /^Your parcel \d+/.test(a.body ?? '')), JSON.stringify(page.arrivals[0]));
  assert.deepEqual(page.counts, HELD);
});

test('ONE ARRIVAL IS READ WHOLE, where a cut body is read to its end', async () => {
  const { agent, bodies } = held!;
  const digest = await agent.inbox({ digest: true });
  assert.ok(digest.ok);
  const line = digest.value.states.untriaged.find((l) => l.cut === true)!;
  const got = await agent.inbox({ id: line.id });
  assert.ok(got.ok, JSON.stringify(got));
  assert.equal(got.value.id, line.id);
  assert.equal(got.value.body, bodies.get(line.id));
  assert.ok((got.value.body ?? '').length > 180);
  assert.equal('cut' in got.value, false, 'one arrival whole carries the mark of a cut one');
});

test('THE AGENT FILES ONE ARRIVAL AND PUTS IT BACK, signed by its run', async () => {
  const { agent, owner, account } = held!;
  const before = await agent.inbox({ state: 'untriaged' });
  assert.ok(before.ok);
  const arrival = before.value.arrivals.find((a) => !/^Card purchase \d+ at/.test(a.body ?? ''))!;
  const filed = await agent.triage({ arrival: arrival.id, register: 'transactions', fields: { what: 'Card purchase', on: '2026-08-16', direction: 'out', amount: { amount: 4500, currency: 'EGP' }, account } });
  assert.ok(filed.ok, `the agent could not file an arrival: ${JSON.stringify(filed)}`);
  const matched = await agent.inbox({ id: arrival.id });
  assert.ok(matched.ok);
  assert.equal(matched.value.state, 'matched');
  assert.match(matched.value.settled?.by ?? '', /^S\d+$/, `the filing was signed ${JSON.stringify(matched.value.settled)}`);
  const row = matched.value.settled!.row!;
  const back = await agent.triage({ arrival: arrival.id, back: true, version: row.version });
  assert.ok(back.ok, `the agent could not put the arrival back: ${JSON.stringify(back)}`);
  const again = await agent.inbox({ id: arrival.id });
  assert.ok(again.ok);
  assert.equal(again.value.state, 'untriaged');
  /* AND THE ROW IT FILED IS ARCHIVED, so the owner's list holds the rule's fifty and nothing the agent took back. */
  const rows = await owner.list({ register: 'transactions', limit: 100 });
  assert.ok(rows.ok, JSON.stringify(rows));
  assert.equal(rows.value.rows.length, HELD.matched);
});

test('A TOKEN WITHOUT THE REACH IS TOLD THE SENTENCE, at the inbox and at the door', async () => {
  const { without, bodies } = held!;
  for (const args of [undefined, { digest: true as const }, { state: 'skipped' as const }, { id: [...bodies.keys()][0]! }]) {
    const got = await without.inbox(args as never);
    assert.equal(got.ok, false, `a token without the reach read ${JSON.stringify(args)}`);
    assert.deepEqual(!got.ok && 'refusal' in got ? [got.refusal.code, got.refusal.fix] : null, ['FORBIDDEN', NO_REACH]);
  }
  const filed = await without.triage({ arrival: [...bodies.keys()][0]!, ignore: true });
  assert.deepEqual(!filed.ok && 'refusal' in filed ? [filed.refusal.code, filed.refusal.fix] : null, ['FORBIDDEN', TRIAGE_NO_REACH]);
});

test('NOTHING THROUGH THE WORKER WAS ANSWERED 500 OR MORE', () => {
  assert.ok(asked > 260, `${String(asked)} requests`);
  assert.deepEqual(fives, []);
});

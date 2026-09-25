/**
 * His iOS Shortcut's door on the Cloud: a token minted through the Worker, one `From HSBC:` text posted through the
 * Worker, and a transaction filed on a record that lives in a Durable Object.
 *
 * WHY THIS FILE EXISTS. `loop/research-switch-recheck.md` §3 brief 4. The money moves to the Cloud, and what had been
 * driven end to end was the self-host (`packages/host/test/ingest-shortcut.test.ts`, the record over `node:sqlite`) and,
 * on the Worker, only the hand-off, with `RECORD` and `DIRECTORY` stubs (`test/arrive-ingest-handoff.test.ts`). Nobody
 * had minted a digest with `ingestMint` and watched workerd verify a path token against it and file a row.
 *
 * WHAT RUNS, AND NOTHING IN THE MIDDLE IS A DOUBLE. Built the way `test/import-in-do.test.ts` builds it: `src/index.ts`
 * bundled by `wrangler`'s own esbuild with `cloudflare:workers` left for workerd, Miniflare serving both Durable Objects
 * on SQLite storage, a record made by `POST /auth/provision`, its owner signed in by spending the claim link, and Solo
 * founder and `bank-hsbc-eg` installed on Decide. The token is minted through `/api/ingestMint` on that session, which
 * is seconds old and so inside the mint's fifteen minutes, and the text is posted at
 * `/in/webhook/<rec>/bank-from-out-sms/<token>` with no credential, as the Shortcut posts it.
 *
 * `bank-hsbc-eg` IS OFFERED WITH ITS DOCUMENT, NOT BY NAME. Proposed as `{ install: 'bank-hsbc-eg' }` the Worker
 * answered `DECLARATION_UNKNOWN`, "There is no pack called bank-hsbc-eg on offer here", measured on 23 September: it
 * is deliberately not in `seedCatalogue` (`apps/cli/src/import.ts`, `PlannedPack`), and the import offers it the way
 * this file does. Before it is installed the mint answers `DECLARATION_UNKNOWN` for `bank-from-out-sms`, so on the
 * Cloud a record set up with Solo founder alone has no door for his texts.
 *
 * ONE RECORD PER CASE, because the inbox keys an arrival by its bytes and a case that posts after another would be
 * asking about the first case's leftovers.
 *
 * EVERY ANSWER OF 500 OR MORE IS COUNTED, as `import-in-do` counts them: the door answers 503 for a record that threw,
 * and a 503 on a post is a text the Shortcut was told to send again rather than a row, which no count of rows shows.
 *
 * RED FIRST, MEASURED ON 23 SEPTEMBER without touching the tree. The four cases describe behaviour that should hold at
 * HEAD, so the red is made as `arrive-ingest-handoff.test.ts` made its own, over scratch bundles whose esbuild `onLoad`
 * rewrites one line of `arrivals()` in `src/index.ts` before building. `SHORTCUT_MUTANT` picks which, and a rewrite
 * that no longer finds its line throws rather than building the Worker as it ships:
 *   - `unverified`: `verifies:` answers `{ kind: 'none' }` instead of asking the record's `ingestVerify`, so no token
 *     verifies. The minted token, the second mint and the text posted twice went red; the wrong token stayed green,
 *     as the brief expected, because under it nothing verifies at all.
 *   - `verifies-all`: the arrival crosses with `verified: true` whatever the door found. The wrong token and the
 *     rotated token went red, and the other two stayed green.
 * So every case is red under one of the two, and none is green only because the door refuses everything.
 *
 * WHAT IT FOUND AT HEAD: NOTHING WRONG. Every request answered below 500, the minted token filed EGP 2,500.00 as one
 * row on the account ending 846, and the wrong and rotated tokens were stored `untriaged` with the record's reason
 * "nothing verified this arrival, so no pattern was offered it". The text posted twice left one row and an empty inbox.
 *
 * ABOUT TWO SECONDS, 2.1 and 2.3 across two runs on 23 September: workerd starting once, and four records set up.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createClient, type Client } from '../../../packages/client/src/index.ts';
import { bankHsbcEgPack } from '../../../packages/seed/src/index.ts';

const fromWrangler = createRequire(createRequire(import.meta.url).resolve('wrangler/package.json'));
const esbuild = fromWrangler('esbuild') as { build(o: object): Promise<{ outputFiles: { text: string }[] }> };
const { Miniflare, convertV4MiniflareOptions } = (await import(pathToFileURL(fromWrangler.resolve('miniflare')).href)) as {
  Miniflare: new (o: object) => { ready: Promise<URL>; dispose(): Promise<void> };
  convertV4MiniflareOptions(o: object): object;
};

const HOST = 'app.example.test';
const ORIGIN = `https://${HOST}`;
/* NOT SECRETS. They guard a Worker that lives in this process for a second or two. */
const PROVISION_KEY = 'shortcut-in-do-operator-key-not-a-secret';
const SESSION_SECRET = 'shortcut-in-do-session-secret-not-a-secret-0123456789';
const INGEST = 'bank-from-out-sms';

/** `ingest-shortcut.test.ts`'s invented withdrawal: EGP 2,500.00 from the account ending 846. */
const SMS = 'From HSBC: 16AUG26 ATM Cash Withdrawal from 310-527***-846 EGP 2500.00- Your available balance is EGP 31,040.25';
/** A second withdrawal in the same wording, so the rotation case posts two texts that are not one arrival twice. */
const SMS_AGAIN = 'From HSBC: 17AUG26 ATM Cash Withdrawal from 310-527***-846 EGP 1200.00- Your available balance is EGP 29,840.25';

/**
 * The scratch rewrites the red was measured with, each one line of `arrivals()`: see the header.
 *
 * WRITTEN AS THE WHOLE LINE, so a reshuffle of `src/index.ts` that moves or rewords it makes the build throw here and
 * never quietly builds the unmutated Worker under a mutant's name.
 */
const MUTANTS: Record<string, { from: string; to: string }> = {
  unverified: {
    from: 'verifies: (rec, ingest) => env.RECORD.get(env.RECORD.idFromName(rec)).ingestVerify({ ingest }),',
    to: "verifies: async () => ({ kind: 'none' }),",
  },
  'verifies-all': { from: 'verified: arrival.verified,', to: 'verified: true,' },
};
const mutant = process.env.SHORTCUT_MUTANT;

let mf: InstanceType<typeof Miniflare> | undefined;
let base = '';
/** Every answer of 500 or more this file was given, with its path and body. */
const fives: string[] = [];
let asked = 0;

/** `fetch`, with every answer counted and each one of 500 or more kept. */
async function counted(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init);
  asked++;
  if (res.status >= 500) fives.push(`${String(res.status)} ${String(input)}: ${await res.clone().text()}`);
  return res;
}

/** One record, provisioned, claimed, set up with Solo founder and the HSBC pack, and holding the account ending 846. */
type Held = { rec: string; owner: Client; account: string; mint(): Promise<string>; post(token: string, body: string): Promise<Response> };

let made = 0;
async function record(): Promise<Held> {
  const slug = `shortcut-${String(++made)}`;
  const provisioned = await counted(`${base}/auth/provision`, {
    method: 'POST',
    headers: { authorization: `Bearer ${PROVISION_KEY}`, 'content-type': 'application/json', origin: ORIGIN },
    body: JSON.stringify({ slug, email: `${slug}@example.test`, name: 'Shortcut' }),
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
    const accepted = await owner.call('decide', { id: filed.value.id, decide: { option: 'accept', reason: 'the Shortcut needs it' } });
    assert.ok(accepted.ok, `${body.install} would not install on the Worker: ${JSON.stringify(accepted)}`);
  }
  /* THE ACCOUNT THE TEXT NAMES. `last4` is text and the bank prints three digits (`bank-hsbc-eg.ts`). */
  const account = await owner.create({
    register: 'accounts',
    fields: { name: 'Cairo current account', kind: 'bank', balance: { amount: 0, currency: 'EGP' }, as_of: '2026-08-01', liquid: true, last4: '846' },
  });
  assert.ok(account.ok, JSON.stringify(account));

  const rec = out.value!.record;
  return {
    rec,
    owner,
    account: (account.value as { id: string }).id,
    mint: async () => {
      const minted = await owner.call<{ ingest: string; token: string; path: string }>('ingestMint', { ingest: INGEST });
      assert.ok(minted.ok, `the owner could not mint the Shortcut's token on the Worker: ${JSON.stringify(minted)}`);
      /* THE ADDRESS THE SCREEN SHOWS HIM IS THE ADDRESS POSTED TO BELOW, not one this file assembles on its own. */
      assert.equal(minted.value.path, `/in/webhook/${rec}/${INGEST}/${minted.value.token}`);
      return minted.value.token;
    },
    /* NO COOKIE AND NO ORIGIN. The Shortcut holds nothing but the URL, and a door that needed more would pass here. */
    post: (token, body) => counted(`${base}/in/webhook/${rec}/${INGEST}/${token}`, { method: 'POST', body }),
  };
}

/** The record's transactions, as the owner reads them back through the Worker. */
async function transactions(r: Held): Promise<Record<string, unknown>[]> {
  const got = await r.owner.list({ register: 'transactions', limit: 50 });
  assert.ok(got.ok, JSON.stringify(got));
  return got.value.rows.map((row) => (row as { fields: Record<string, unknown> }).fields);
}

/** What waits in the record's inbox: each arrival's state and body. */
async function inbox(r: Held): Promise<{ state: string; body: string | null }[]> {
  const got = await r.owner.inbox();
  assert.ok(got.ok, JSON.stringify(got));
  return got.value.arrivals.map((a) => ({ state: a.state, body: a.body }));
}

before(async () => {
  const index = fileURLToPath(new URL('../src/index.ts', import.meta.url));
  const rewrite = mutant === undefined ? undefined : MUTANTS[mutant];
  if (mutant !== undefined && rewrite === undefined) throw new Error(`SHORTCUT_MUTANT names no mutant: ${mutant}`);
  const built = await esbuild.build({
    entryPoints: [index],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'neutral',
    conditions: ['workerd', 'worker', 'browser'],
    mainFields: ['module', 'main'],
    external: ['cloudflare:workers'],
    logLevel: 'silent',
    plugins:
      rewrite === undefined
        ? []
        : [
            {
              name: 'shortcut-mutant',
              setup(b: { onLoad: Function }) {
                b.onLoad({ filter: /[\\/]apps[\\/]worker[\\/]src[\\/]index\.ts$/ }, (args: { path: string }) => {
                  const text = readFileSync(args.path, 'utf8');
                  if (text.split(rewrite.from).length !== 2) throw new Error(`the ${String(mutant)} line is not in src/index.ts exactly once`);
                  return { contents: text.replace(rewrite.from, rewrite.to), loader: 'ts' };
                });
              },
            },
          ],
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
});

after(async () => {
  await mf?.dispose();
});

test('THE MINTED TOKEN FILES ONE TRANSACTION, with the amount, day and account the text names', async () => {
  const r = await record();
  const token = await r.mint();
  const res = await r.post(token, SMS);
  assert.equal(res.status, 202, await res.clone().text());
  assert.equal(await res.text(), '', 'the answer said something about what the bytes did');

  const rows = await transactions(r);
  assert.equal(rows.length, 1, `the text filed ${String(rows.length)} rows: ${JSON.stringify(rows)}`);
  assert.deepEqual(
    { amount: rows[0]!.amount, direction: rows[0]!.direction, on: rows[0]!.on, account: rows[0]!.account },
    { amount: { amount: 250000, currency: 'EGP' }, direction: 'out', on: '2026-08-16', account: r.account },
  );
  assert.deepEqual(await inbox(r), [], 'a filed text was also left in the inbox');
});

test('THE SAME TEXT WITH A WRONG TOKEN IS STORED untriaged AND WRITES NO ROW', async () => {
  const r = await record();
  /* MINTED FIRST, so the record holds a digest and the wrong token is compared against something. Before any mint
     every token is equally unverified, and the case would hold for the wrong reason. */
  await r.mint();
  const res = await r.post('tk_shortcut_not_the_one_he_was_shown', SMS);
  assert.equal(res.status, 202, 'a wrong token is a row somebody can look at, not a refusal nobody sees');
  assert.deepEqual(await transactions(r), []);
  assert.deepEqual(await inbox(r), [{ state: 'untriaged', body: SMS }]);
});

test('A SECOND MINT MAKES THE FIRST TOKEN STOP VERIFYING, and the second one files', async () => {
  const r = await record();
  const first = await r.mint();
  const second = await r.mint();
  assert.notEqual(first, second);

  assert.equal((await r.post(first, SMS)).status, 202);
  assert.deepEqual(await transactions(r), [], 'the rotated token still filed a row');
  assert.deepEqual(await inbox(r), [{ state: 'untriaged', body: SMS }]);

  /* AND THE NEW ONE OPENS THE DOOR, or "the first stopped verifying" would be true of a door that stopped verifying
     anything. */
  assert.equal((await r.post(second, SMS_AGAIN)).status, 202);
  const rows = await transactions(r);
  assert.deepEqual(rows.map((row) => row.amount), [{ amount: 120000, currency: 'EGP' }]);
});

test('THE SAME TEXT POSTED TWICE FILES ONE ROW', async () => {
  /* WHAT A SHORTCUT THAT TIMED OUT AND RAN AGAIN DOES: the same bytes, the same token, a second request. */
  const r = await record();
  const token = await r.mint();
  const once = await r.post(token, SMS);
  const twice = await r.post(token, SMS);
  assert.deepEqual([once.status, twice.status], [202, 202]);
  const rows = await transactions(r);
  assert.deepEqual(rows.map((row) => row.amount), [{ amount: 250000, currency: 'EGP' }], JSON.stringify(rows));
  assert.deepEqual(await inbox(r), [], 'the second copy was left for a person to file by hand');
});

test('NOTHING THROUGH THE WORKER WAS ANSWERED 500 OR MORE', () => {
  /* AND IT WAS ASKED SOMETHING. Each record is about ten requests before its case posts anything. */
  assert.ok(asked > 40, `${String(asked)} requests`);
  assert.deepEqual(fives, []);
});

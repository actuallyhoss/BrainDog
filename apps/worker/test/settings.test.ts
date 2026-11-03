/**
 * Every optional setting of `wrangler.jsonc`, unset, and the door that needs it asked ("product must
 * answer the same wherever run", HD.132): the refusal names the setting, so an operator who left one out reads which.
 *
 * THE LIST IS READ FROM THE CONFIG, NEVER WRITTEN HERE. The vars are the keys of every environment's `vars`; the secrets
 * are the names the file's closing note puts in backticks (`WORKER SECRETS ARE NOT IN THIS FILE`), and the one a var's
 * comment calls "its secret", kept only where the Worker reads them as a setting (`NAME?:` in a type, or `env.NAME`), so
 * a refusal code or a retired name mentioned in passing is not taken for one. NAMES ONLY: no value of the file is read
 * into a case, and a secret has no value here to read.
 *
 * EVERY SETTING HAS ONE CASE, OF THREE KINDS, and a setting with none is red, so a new one cannot land quietly:
 *   - `refuses`: the door answers a refusal naming the setting, and anything else is red.
 *   - `todo`: the door answers without naming it (a 404, a bare `null`, a sentence about something else). It runs as a
 *     node:test `todo` carrying the sentence the door should give, and turns into `refuses` once the door gives one.
 *   - `quiet`: unset is a working default the config itself documents (a fallback, a switch that is off, a setting this
 *     Worker never reads), and the case holds only that the door still answers rather than failing.
 *
 * THE CLOUD HARNESS (`cloud-harness.ts`) IS THE WORKER AS `src/index.ts` WIRES IT. Each case starts its own, with the
 * prerequisites set to plain test values so the one setting asked about is the only thing missing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { cloud } from './cloud-harness.ts';
import { PEOPLE } from '../../../fixtures/names.ts';

const checker = '../scripts/provision-check.mjs' as string;
const { stripJsonc } = (await import(checker)) as { stripJsonc: (text: string) => string };

type Config = { vars?: Record<string, string>; env?: Record<string, { vars?: Record<string, string> }> };

const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));
const RAW = readFileSync(here('../wrangler.jsonc'), 'utf8');
const CONFIG = JSON.parse(stripJsonc(RAW)) as Config;

/** What the Worker reads as a setting: a field of an env type, or `env.NAME`. */
const SOURCE = readdirSync(here('../src'))
  .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
  .map((f) => readFileSync(here(`../src/${f}`), 'utf8'))
  .join('\n');
const read = (name: string): boolean => new RegExp(`\\b${name}\\?:|env\\.${name}\\b|env\\[['"]${name}['"]\\]`).test(SOURCE);

/** The vars, every environment's, in the order the file first names them. */
export function varsOf(config: Config): string[] {
  const all = [config.vars ?? {}, ...Object.values(config.env ?? {}).map((e) => e.vars ?? {})];
  return [...new Set(all.flatMap((v) => Object.keys(v)))];
}

/** The secrets the file names: the closing note's backticked names and "its secret NAME", read by the Worker, not vars. */
export function secretsOf(raw: string, vars: readonly string[], isRead: (name: string) => boolean = read): string[] {
  const at = raw.indexOf('WORKER SECRETS ARE NOT IN THIS FILE');
  assert.ok(at >= 0, 'wrangler.jsonc has no note naming its secrets, so this test cannot read them');
  const named = [...raw.slice(at).matchAll(/`([A-Z][A-Z0-9_]{2,})`/g), ...raw.matchAll(/its secret `?([A-Z][A-Z0-9_]{2,})`?/g)].map((m) => m[1]!);
  return [...new Set(named)].filter((n) => !vars.includes(n) && isRead(n));
}

const VARS = varsOf(CONFIG);
const SECRETS = secretsOf(RAW, VARS);
const SETTINGS = [...VARS, ...SECRETS];

/* ── THE DOORS ──────────────────────────────────────────────────────────────────────────────────────────────────── */

const OWNER = PEOPLE[6]!;
const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
/* NOT SECRETS. Each keys a Worker that lives in this process for a second. */
const OPERATOR = 'operator-key-for-a-settings-test-0123456789';
const STRIPE = { BILLING: 'test', STRIPE_SECRET_KEY: 'sk_test_settings_not_a_key' };
const PRICES = { STRIPE_PRICE_HOSTED: 'price_test_cloud', STRIPE_PRICE_PLUS: 'price_test_plus', STRIPE_PRICE_PACK_100: 'price_test_100', STRIPE_PRICE_PACK_500: 'price_test_500' };
const SIGNUP_ON = { SIGNUP: 'open', AUTH_MAIL_FROM: 'hello@thimble.example', EMAIL: { send: async () => {} } };

type Door = { path: string; method?: 'GET' | 'POST'; body?: unknown; as?: 'owner' | 'operator' };
type Case =
  | { kind: 'refuses'; door: Door; env?: Record<string, unknown> }
  | { kind: 'todo'; door: Door; env?: Record<string, unknown>; said: string }
  | { kind: 'quiet'; door: Door; env?: Record<string, unknown>; why: string };

const HEALTH: Door = { path: '/healthz' };
const METHODS: Door = { path: '/auth/methods' };
const CHECKOUT = (body: Record<string, unknown>): Door => ({ path: '/account/billing/checkout', method: 'POST', body, as: 'owner' });
const NEW_CLOUD = CHECKOUT({ plan: 'cloud', slug: 'kiln-yard' });
const PROVISION: Door = { path: '/auth/provision', method: 'POST', body: { slug: 'kiln-yard', email: OWNER.email }, as: 'operator' };
const SIGNUP: Door = { path: '/auth/signup/start', method: 'POST', body: { email: PEOPLE[5]!.email } };
const PUSH: Door = { path: '/api/push/key' };
const GOOGLE: Door = { path: '/auth/google/start' };

/** One case a setting. The sentence in a `todo` is the refusal the door should give, word for word, and where. */
const CASES: Record<string, Case> = {
  PUBLIC_HOST: {
    kind: 'todo',
    door: NEW_CLOUD,
    env: { ...STRIPE, ...PRICES },
    said: 'every /account door in apps/worker/src/index.ts answers FORBIDDEN "Your account is answered only for pages on https://." before billing can say originOf\'s sentence: add "PUBLIC_HOST is not set, so this host has no address to answer account pages on."',
  },
  LEGACY_HOSTS: { kind: 'quiet', door: HEALTH, why: 'unset, no name is a legacy one, which is the Worker before the move' },
  RP_ID: { kind: 'quiet', door: METHODS, why: 'unset, the passkeys’ relying party is PUBLIC_HOST' },
  APPLE_TEAM_ID: { kind: 'refuses', door: { path: '/.well-known/apple-app-site-association' } },
  AI_GATEWAY: { kind: 'quiet', door: HEALTH, why: 'unset, a model call goes to Workers AI with no gateway' },
  AGE_RECIPIENT: { kind: 'quiet', door: HEALTH, why: 'empty takes unsealed copies, which the config names as the choice' },
  COUNT_VISITS: { kind: 'quiet', door: HEALTH, why: 'anything but yes counts nothing, and /api/seen answers 204' },
  SLASH_ENDPOINT: { kind: 'quiet', door: HEALTH, why: 'this Worker does not read it; deploy-parity and the site’s claims do' },
  SLASH_INCLUDED: { kind: 'quiet', door: HEALTH, why: 'anything but yes is the included model switched off, the state the config ships dark' },
  SLASH_INCLUDED_MONTH_NEURONS: { kind: 'quiet', door: HEALTH, why: 'unset falls back to the ceiling written in slash.ts' },
  SLASH_LARGE: { kind: 'quiet', door: HEALTH, why: 'empty is no to the larger model' },
  SLASH_FALLBACK_URL: { kind: 'quiet', door: HEALTH, why: 'any one of the fallback’s four empty is no second provider' },
  SLASH_FALLBACK_MODEL: { kind: 'quiet', door: HEALTH, why: 'any one of the fallback’s four empty is no second provider' },
  SLASH_FALLBACK_PROVIDER: { kind: 'quiet', door: HEALTH, why: 'any one of the fallback’s four empty is no second provider' },
  SLASH_FALLBACK_KEY: { kind: 'quiet', door: HEALTH, why: 'any one of the fallback’s four empty is no second provider' },
  BRAINDOG_BUILD: { kind: 'quiet', door: HEALTH, why: 'empty answers app null, which deploy-parity reads and refuses' },
  AUTH_MAIL_FROM: {
    kind: 'todo',
    door: METHODS,
    env: SIGNUP_ON,
    said: '/auth/methods in apps/worker/src/index.ts answers magic false with no why: add "Sign-in links are off on this host: AUTH_MAIL_FROM is not set."',
  },
  TEAMS_HELD: { kind: 'quiet', door: HEALTH, why: 'unset holds nothing: teams work as the plan allows, as on a self-host' },
  SHARE_LINKS: { kind: 'quiet', door: HEALTH, why: 'anything but on makes no read-only links, and shareable says so in the owner\'s sentence' },
  MAIL_FROM: { kind: 'quiet', door: HEALTH, why: 'empty falls back to AUTH_MAIL_FROM' },
  SUPPORT_ADDRESS: { kind: 'quiet', door: HEALTH, why: 'empty is the generic footer, naming no address' },
  SUPPORT_FORWARD: { kind: 'quiet', door: HEALTH, why: 'unset, mail to the support address is refused at the door' },
  OPS_ALERT_TO: { kind: 'quiet', door: HEALTH, why: 'unset, no alert line is mailed' },
  OPS_RECORD: { kind: 'quiet', door: HEALTH, why: 'empty on purpose until the canary sitting: the nightly walk writes its summary nowhere' },
  PROVISION_WITHOUT_KEYS: { kind: 'refuses', door: PROVISION, env: { PROVISION_KEY: OPERATOR } },
  KEK: { kind: 'refuses', door: PROVISION, env: { PROVISION_KEY: OPERATOR } },
  PROVISION_KEY: { kind: 'refuses', door: { path: '/api/kennel/v1/review', as: 'operator' } },
  OPERATOR_EMAILS: { kind: 'quiet', door: HEALTH, why: 'unset, nobody is the operator by session and only the key opens the operator doors' },
  TOKENS_VALID_FROM: { kind: 'quiet', door: HEALTH, why: 'unset is the epoch, so no bearer is cut off' },
  BILLING: { kind: 'refuses', door: NEW_CLOUD, env: { STRIPE_SECRET_KEY: STRIPE.STRIPE_SECRET_KEY, ...PRICES } },
  STRIPE_SECRET_KEY: { kind: 'refuses', door: NEW_CLOUD, env: { BILLING: 'test', ...PRICES } },
  STRIPE_WEBHOOK_SECRET: { kind: 'refuses', door: { path: '/account/billing/webhook', method: 'POST', body: {} }, env: { ...STRIPE, ...PRICES } },
  STRIPE_PRICE_HOSTED: { kind: 'refuses', door: NEW_CLOUD, env: { ...STRIPE, ...PRICES } },
  STRIPE_PRICE_PLUS: { kind: 'refuses', door: CHECKOUT({ plan: 'plus', slug: 'kiln-yard' }), env: { ...STRIPE, ...PRICES } },
  STRIPE_PRICE_PACK_100: { kind: 'refuses', door: CHECKOUT({ pack: 'credits-100', record: REC }), env: { ...STRIPE, ...PRICES } },
  STRIPE_PRICE_PACK_500: { kind: 'refuses', door: CHECKOUT({ pack: 'credits-500', record: REC }), env: { ...STRIPE, ...PRICES } },
  SIGNUP: {
    kind: 'todo',
    door: SIGNUP,
    said: '/auth/signup/start in apps/worker/src/index.ts answers SIGNUP_CLOSED (launch.ts): add "Sign-up is not open on this BrainDog yet: SIGNUP is not set to open or invite."',
  },
  TURNSTILE_SITE_KEY: { kind: 'quiet', door: HEALTH, env: SIGNUP_ON, why: 'unset, the bot check is off whatever the secret says (turnstile.ts), and the owner’s why says it has one key' },
  TURNSTILE_SECRET: { kind: 'quiet', door: HEALTH, env: SIGNUP_ON, why: 'unset, the bot check is off and sign-up runs on the Directory’s lockouts alone, tightened' },
  SESSION_SECRET: {
    kind: 'todo',
    door: METHODS,
    said: '/auth/methods in apps/worker/src/index.ts answers why not-configured: add "Sign-in is off on this host until SESSION_SECRET is set." as the refusal it already gives an invitation (INVITES_OFF).',
  },
  VAPID_PUBLIC: {
    kind: 'todo',
    door: PUSH,
    env: { VAPID_PRIVATE: 'vapid-private-not-a-key' },
    said: '/api/push/key in apps/worker/src/index.ts answers key null alone: add why "Push is off on this host: VAPID_PUBLIC is not set."',
  },
  VAPID_PRIVATE: {
    kind: 'todo',
    door: PUSH,
    env: { VAPID_PUBLIC: 'vapid-public-not-a-key' },
    said: '/api/push/key in apps/worker/src/index.ts answers key null alone: add why "Push is off on this host: VAPID_PRIVATE is not set."',
  },
  GOOGLE_CLIENT_ID: {
    kind: 'todo',
    door: GOOGLE,
    env: { GOOGLE_CLIENT_SECRET: 'google-secret-not-a-secret' },
    said: '/auth/google/start in apps/worker/src/index.ts answers 404 ROUTE_UNKNOWN: add NOT_IN_THIS_BUILD "Sign-in with Google is off on this host: GOOGLE_CLIENT_ID is not set."',
  },
  GOOGLE_CLIENT_SECRET: {
    kind: 'todo',
    door: GOOGLE,
    env: { GOOGLE_CLIENT_ID: 'google-client-id.example' },
    said: '/auth/google/start in apps/worker/src/index.ts answers 404 ROUTE_UNKNOWN: add NOT_IN_THIS_BUILD "Sign-in with Google is off on this host: GOOGLE_CLIENT_SECRET is not set."',
  },
};

/** The door asked on a Worker with `env` set and `name` unset: the status and the body as text. */
async function ask(name: string, c: Case): Promise<{ status: number; text: string }> {
  const h = await cloud({ ...(c.env ?? {}), [name]: undefined });
  delete h.env[name];
  const init: { method: string; body?: string; cookie?: string; bearer?: string; headers: Record<string, string> } = {
    method: c.door.method ?? 'GET',
    headers: { 'cf-connecting-ip': '198.51.100.7' },
  };
  if (c.door.body !== undefined) init.body = JSON.stringify(c.door.body);
  if (c.door.as === 'owner') {
    await h.provision(REC, 'harbour-lane', OWNER.email);
    init.cookie = await h.signIn(OWNER.email);
  }
  if (c.door.as === 'operator') init.bearer = OPERATOR;
  const res = await h.ask(c.door.path, init);
  return { status: res.status, text: await res.text() };
}

test('THE SETTINGS ARE READ FROM wrangler.jsonc, and each has exactly one case here', () => {
  assert.ok(VARS.includes('PUBLIC_HOST') && VARS.includes('BILLING'), `the vars read were ${VARS.join(', ')}`);
  assert.ok(SECRETS.includes('SESSION_SECRET') && SECRETS.includes('KEK'), `the secrets read were ${SECRETS.join(', ')}`);
  /* A REFUSAL CODE AND A RETIRED NAME ARE IN THE NOTE TOO, and neither is a setting. */
  assert.ok(!SECRETS.includes('NOT_IN_THIS_BUILD') && !SECRETS.includes('KEK_PREV'), `the secrets read were ${SECRETS.join(', ')}`);
  const missing = SETTINGS.filter((s) => CASES[s] === undefined);
  assert.deepEqual(missing, [], `no case says what happens when ${missing.join(', ')} is unset: add one to CASES`);
  const stale = Object.keys(CASES).filter((s) => !SETTINGS.includes(s));
  assert.deepEqual(stale, [], `${stale.join(', ')} is not a setting of wrangler.jsonc any more: take its case out`);
});

test('a new secret in the note is read as a setting, and a name the Worker never reads is not', () => {
  const raw = `${RAW}\n/* WORKER SECRETS ARE NOT IN THIS FILE. \`SESSION_SECRET\`, \`KILN_TOKEN\` and \`OLD_THING\`. */`;
  const found = secretsOf(raw, VARS, (n) => n !== 'OLD_THING');
  assert.ok(found.includes('KILN_TOKEN'));
  assert.ok(!found.includes('OLD_THING'));
});

for (const name of SETTINGS) {
  const c = CASES[name];
  if (c === undefined) continue;
  if (c.kind === 'quiet') {
    test(`${name} unset is a working default: ${c.why}`, async () => {
      const { status, text } = await ask(name, c);
      assert.ok(status < 400, `${c.door.path} answered ${String(status)} with ${name} unset: ${text.slice(0, 300)}`);
    });
  } else {
    const run = async () => {
      const { status, text } = await ask(name, c);
      assert.notEqual(status, 500, `${c.door.path} failed with ${name} unset: ${text.slice(0, 300)}`);
      assert.ok(text.includes(name), `${c.door.path} answered ${String(status)} with ${name} unset and did not name it: ${text.slice(0, 300)}`);
    };
    if (c.kind === 'refuses') test(`${name} unset: ${c.door.path} refuses and names it`, run);
    else test(`${name} unset: ${c.door.path} should name it`, { todo: c.said }, run);
  }
}

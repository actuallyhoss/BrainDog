/**
 * The passkey in the email field's autofill: a returning phone signs in with one touch, and the link
 * stays for a device with none.
 *
 * WHAT BREAKS IT IS A SECOND REQUEST. The offer holds the browser's one pending request and one challenge, so a press
 * that asks while it is pending fails the first time and works the second. These tests hold the order: the offer is
 * conditional and abortable, a stop aborts it and spends nothing, and the page withdraws it before any press asks.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { canAutofill, passkeyAutofill, type Io } from './auth.ts';

const PAGE = readFileSync(new URL('../routes/signin/+page.svelte', import.meta.url), 'utf8');

const WHO = { person: 'p_01', email: 'ada@example.com', record: 'studio', provedAt: 1_757_000_000_000 };
const ok = (value: unknown) => new Response(JSON.stringify({ ok: true, value }), { status: 200, headers: { 'content-type': 'application/json' } });
const buf = (...b: number[]) => new Uint8Array(b).buffer;
const PICKED = {
  id: 'cred-1',
  response: { clientDataJSON: buf(1), authenticatorData: buf(2), signature: buf(3), userHandle: null },
};

/** A host that answers the two passkey doors, and counts what it was asked. */
function host(timeout?: number) {
  const asked: string[] = [];
  const fetch: Io['fetch'] = async (url) => {
    asked.push(url);
    if (url === '/auth/passkey/assert/options') return ok({ challenge: 'AQID', rpId: 'brain.dog', ...(timeout ? { timeout } : {}) });
    if (url === '/auth/passkey/assert') return ok(WHO);
    return new Response('{}', { status: 404 });
  };
  return { fetch, asked };
}

/** A `navigator.credentials` whose `get` waits until it is told to pick, or until its signal aborts. */
function waiting() {
  const given: CredentialRequestOptions[] = [];
  let pick: (() => void) | null = null;
  const credentials = {
    create: async () => null,
    get: (o: CredentialRequestOptions) =>
      new Promise((resolve, reject) => {
        given.push(o);
        const abort = () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        if (o.signal?.aborted) return abort();
        o.signal?.addEventListener('abort', abort, { once: true });
        pick = () => resolve(PICKED);
      }),
  } as unknown as Io['credentials'];
  return { credentials, given, pick: () => pick?.() };
}

/** A clock the test turns by hand: `fire` runs every wait that is still set. */
function handClock() {
  const set = new Map<number, () => void>();
  let n = 0;
  return {
    clock: {
      wait: (_ms: number, then: () => void) => {
        const id = n++;
        set.set(id, then);
        return () => void set.delete(id);
      },
    },
    fire: () => [...set.values()].forEach((f) => f()),
  };
}

/* A BROKEN OFFER HANGS RATHER THAN THROWS (a request nobody aborts waits for ever), so each test has a deadline. */
const LIMIT = { timeout: 2_000 };

const settle = () => new Promise((r) => setTimeout(r, 0));

test('canAutofill is a plain yes only: missing, false and a throw are all no', async () => {
  assert.equal(await canAutofill({}), false);
  assert.equal(await canAutofill({ PublicKeyCredential: function () {} }), false);
  assert.equal(await canAutofill({ PublicKeyCredential: { isConditionalMediationAvailable: async () => false } }), false);
  assert.equal(await canAutofill({ PublicKeyCredential: { isConditionalMediationAvailable: async () => { throw new Error('x'); } } }), false);
  assert.equal(await canAutofill({ PublicKeyCredential: { isConditionalMediationAvailable: async () => true } }), true);
});

test('the offer is one conditional request with a signal, and a pick signs in through the same door a press does', LIMIT, async () => {
  const { fetch, asked } = host();
  const a = waiting();
  const offer = passkeyAutofill({ fetch, credentials: a.credentials }, handClock().clock);
  await settle();
  assert.equal(a.given.length, 1);
  assert.equal(a.given[0]?.mediation, 'conditional');
  assert.ok(a.given[0]?.signal instanceof AbortSignal);
  a.pick();
  assert.deepEqual(await offer.done, { ok: true, value: WHO });
  assert.deepEqual(asked, ['/auth/passkey/assert/options', '/auth/passkey/assert']);
});

test('stop aborts the pending request, answers cancelled, and presents nothing to the host', LIMIT, async () => {
  const { fetch, asked } = host();
  const a = waiting();
  const offer = passkeyAutofill({ fetch, credentials: a.credentials }, handClock().clock);
  await settle();
  assert.equal(a.given[0]?.signal?.aborted, false);
  const out = await offer.stop();
  assert.deepEqual(out, { ok: false, kind: 'cancelled' });
  assert.equal(a.given[0]?.signal?.aborted, true, 'the browser is let go of before a press asks');
  assert.deepEqual(asked, ['/auth/passkey/assert/options'], 'no assertion, so no strike');
});

test('a stop that lands while the challenge is still being fetched asks the browser for nothing', LIMIT, async () => {
  const { fetch, asked } = host();
  const a = waiting();
  const offer = passkeyAutofill({ fetch, credentials: a.credentials }, handClock().clock);
  const out = await offer.stop();
  assert.deepEqual(out, { ok: false, kind: 'cancelled' });
  assert.equal(a.given.length, 0);
  assert.deepEqual(asked, ['/auth/passkey/assert/options']);
});

test('a waiting offer is asked again before its challenge runs out, so a late pick still signs in', LIMIT, async () => {
  const { fetch, asked } = host(300_000);
  const a = waiting();
  const hand = handClock();
  const offer = passkeyAutofill({ fetch, credentials: a.credentials }, hand.clock);
  await settle();
  hand.fire();
  await settle();
  await settle();
  assert.equal(a.given.length, 2, 'a second request, after the first was aborted');
  assert.equal(a.given[0]?.signal?.aborted, true);
  a.pick();
  assert.deepEqual(await offer.done, { ok: true, value: WHO });
  assert.deepEqual(asked, ['/auth/passkey/assert/options', '/auth/passkey/assert/options', '/auth/passkey/assert']);
});

test('a browser with no WebAuthn gets no offer at all', LIMIT, async () => {
  const { fetch, asked } = host();
  const out = await passkeyAutofill({ fetch, credentials: undefined }, handClock().clock).done;
  assert.deepEqual(out, { ok: false, kind: 'unsupported' });
  assert.equal(asked.length, 1);
});

test('only a pick counts as picked: a challenge that would not come is the offer\'s own failure', LIMIT, async () => {
  const down: Io['fetch'] = async () => new Response('{}', { status: 503 });
  const a = waiting();
  const failed = passkeyAutofill({ fetch: down, credentials: a.credentials }, handClock().clock);
  assert.equal((await failed.done).ok, false);
  assert.equal(failed.picked, false);
  assert.equal(a.given.length, 0);
  const { fetch } = host();
  const offer = passkeyAutofill({ fetch, credentials: a.credentials }, handClock().clock);
  await settle();
  assert.equal(offer.picked, false);
  a.pick();
  await offer.done;
  assert.equal(offer.picked, true);
});

/* ── the page ───────────────────────────────────────────────────────────── */

test('NOTHING HAPPENS ON ARRIVAL: a failure before a pick is kept off the screen', () => {
  const handler = /function offerPasskey\(\)[\s\S]*?\n {2}\}/.exec(PAGE)?.[0] ?? '';
  const quiet = handler.indexOf('if (!mine.picked) return;');
  const drawn = handler.indexOf("step = { at: 'failed'");
  assert.ok(quiet > 0 && drawn > quiet, 'the offer draws its failure only after somebody picked a passkey');
});

test('a browser with no conditional mediation keeps the link: the field where it led, the button everywhere else', () => {
  assert.match(PAGE, /\{#if fieldShown\}[\s\S]*?\{:else\}\s*<Button onclick=\{mail\}><Icon name="link" size="m" \/>\{copy\.emailLink\}<\/Button>/);
  assert.match(PAGE, /let autofill = \$state\(false\);/, 'no autofill until the browser says yes');
});

test('the email field carries the passkey autofill token', () => {
  assert.match(PAGE, /type="email"\s+autocomplete="username webauthn"/);
  assert.doesNotMatch(PAGE, /autocomplete="email"/);
});

test('every press withdraws the offer and waits for it before asking for its own', () => {
  const run = /async function run<T>[\s\S]*?\n {2}\}/.exec(PAGE)?.[0] ?? '';
  const withdrawn = run.indexOf('await withdraw()');
  const asked = run.indexOf('await work()');
  assert.ok(withdrawn > 0 && asked > withdrawn, 'withdraw() is awaited before the press does its work');
  assert.match(PAGE, /return mine \? \(await mine\.stop\(\)\)\.ok : false;/);
});

test('the offer is made only where the field is drawn, and the field is drawn wherever autofill is', () => {
  assert.match(PAGE, /canAutofill\(\)\.then\(\(yes\) => \(autofill = yes\)\)/);
  assert.match(PAGE, /fieldShown = \$derived\(doors !== null && doors\.magic && \(doors\.lead === 'magic' \|\| mailing \|\| autofill\)\)/);
  assert.match(PAGE, /if \(fieldShown && doors\?\.passkey === true && step\.at !== 'asking' && !held\) untrack\(offerPasskey\)/);
  assert.match(PAGE, /\{#if fieldShown\}/);
});

/* ── the words ──────────────────────────────────────────────────────────── */

/**
 * WHAT THE SIGN-IN SCREEN SAYS NEVER NAMES THE MACHINERY ("Words"): every sentence the page reads from the
 * copy, and the entry screens' own words, with no "token", no em dash, and none of the words a schema uses about itself.
 * A sentence that takes arguments is said with ordinary ones, so its template is read as a person would read it.
 */
test("the sign-in screen's words never say token, nor an em dash", async () => {
  const { copy } = await import('./copy.ts');
  const { words } = await import('../routes/signin/words.ts');
  const keys = [...new Set([...PAGE.matchAll(/copy\.([A-Za-z]+)/g)].map((m) => m[1] ?? ''))];
  const said = (v: unknown): string[] =>
    typeof v === 'string'
      ? [v]
      : typeof v === 'function'
        ? [true, false].flatMap((b) => said((v as (...a: unknown[]) => unknown)(b ? 'ada@example.com' : 2, b, '12:00:00')))
        : v && typeof v === 'object'
          ? Object.values(v).flatMap(said)
          : [];
  const lines = [...keys.flatMap((k) => said((copy as Record<string, unknown>)[k])), ...Object.values(words)];
  assert.ok(lines.length > 40, `only ${lines.length} sentences were read off the page`);
  for (const line of lines) assert.doesNotMatch(line, /\btokens?\b|—|\brow\b|\bentity\b|list item/iu, `a word a person should not read: ${line}`);
});

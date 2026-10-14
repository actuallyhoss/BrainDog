/**
 * The sign-in door stamps the app it let in: a token minted through `/oauth/approve` carries the client id, how the
 * app came (a metadata document, `cimd`, or a registration here, `dcr`) and its host, and the consent answer says the
 * same before the person allows it. Every name is invented (`fixtures/names.ts`); the store is an in-memory one.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { HeldRequest, OAuthAnswers, OAuthCall, OAuthClient } from '@braindog/record/oauth';

import { COMPANIES, DOMAINS } from '../../../fixtures/names.ts';
import { serveOAuthDoor, type Approver, type Minted, type OAuthDeps, type OAuthStore } from '../src/oauth.ts';

const ISSUER = 'https://brain.example';
const CHALLENGE = 'A'.repeat(43);
const APP = COMPANIES[1];
const SITE = DOMAINS[0];

/** A store in memory: clients, held requests and codes, each answered once as the record's own does. */
function memoryStore(): OAuthStore {
  const clients = new Map<string, OAuthClient>();
  const held = new Map<string, HeldRequest>();
  const answer = (call: OAuthCall): OAuthAnswers[OAuthCall['op']] => {
    switch (call.op) {
      case 'client':
        return clients.get(call.client_id) ?? null;
      case 'register':
        clients.set(call.client.client_id, call.client);
        return 'ok';
      case 'hold':
        held.set(call.request.id, call.request);
        return 'ok';
      case 'held':
        return held.get(call.id) ?? null;
      case 'take': {
        const row = held.get(call.id) ?? null;
        held.delete(call.id);
        return row;
      }
      case 'code':
        return 'ok';
      case 'redeem':
        return null;
      case 'count':
        return null;
    }
  };
  return (async (call: OAuthCall) => answer(call)) as OAuthStore;
}

type MintArgs = Parameters<Extract<Approver, { ok: true }>['mint']>[0];

/** The doors on one store, with an approver who proved a sign-in just now and a mint that keeps what it was given. */
function doors(minted: Minted = { ok: true, bearer: 'bd_invented_bearer' }) {
  const mints: MintArgs[] = [];
  const documents = new Map<string, string>();
  const deps: OAuthDeps = {
    issuer: ISSUER,
    store: memoryStore(),
    now: () => Date.now(),
    address: null,
    consent: (id) => `/app/connect?request=${id}`,
    approver: async () => ({
      ok: true,
      record: 'rec_invented',
      provedAt: Date.now(),
      mint: async (args) => {
        mints.push(args);
        return minted;
      },
    }),
    fetchDocument: async (url) => documents.get(url) ?? null,
  };
  const call = (path: string, init?: RequestInit) => serveOAuthDoor(new Request(`${ISSUER}${path}`, init), deps).then((r) => r as Response);
  const post = (path: string, body: unknown) =>
    call(path, { method: 'POST', headers: { 'content-type': 'application/json', origin: ISSUER }, body: JSON.stringify(body) });

  /** `/oauth/authorize` for a client id, answered with the held request's id. */
  async function hold(clientId: string, redirect: string): Promise<string> {
    const q = new URLSearchParams({ client_id: clientId, redirect_uri: redirect, response_type: 'code', code_challenge: CHALLENGE, code_challenge_method: 'S256' });
    const res = await call(`/oauth/authorize?${q}`);
    assert.equal(res.status, 302, await res.clone().text());
    const id = new URL(res.headers.get('location') ?? '', ISSUER).searchParams.get('request');
    assert.ok(id);
    return id;
  }
  return { mints, documents, call, post, hold };
}

test('an app that came by its metadata document is minted with cimd and the host that served it', async () => {
  const d = doors();
  const id = `https://${SITE}/oauth/client.json`;
  const redirect = `https://app.${SITE}/callback`;
  d.documents.set(id, JSON.stringify({ client_id: id, client_name: APP, redirect_uris: [redirect] }));
  const request = await d.hold(id, redirect);

  const consent = (await (await d.call(`/oauth/request?request=${request}`)).json()) as { source: unknown; client_name: string };
  assert.equal(consent.client_name, APP);
  assert.deepEqual(consent.source, { kind: 'cimd', host: SITE });

  const res = await d.post('/oauth/approve', { request, record: 'rec_invented', scope: 'read' });
  assert.equal(res.status, 200, await res.clone().text());
  assert.equal(d.mints.length, 1);
  assert.deepEqual(d.mints[0], { scope: 'read', label: APP, days: 90, client: { id, kind: 'cimd', host: SITE } });
});

test('an app that registered itself is minted with dcr and the host it asked to be answered at', async () => {
  const d = doors();
  const redirect = `https://APP.${SITE.toUpperCase()}/callback`;
  const reg = await d.post('/oauth/register', { client_name: APP, redirect_uris: [redirect], token_endpoint_auth_method: 'none' });
  assert.equal(reg.status, 201, await reg.clone().text());
  const { client_id } = (await reg.json()) as { client_id: string };
  const request = await d.hold(client_id, redirect);

  const consent = (await (await d.call(`/oauth/request?request=${request}`)).json()) as { source: unknown };
  assert.deepEqual(consent.source, { kind: 'dcr', host: `app.${SITE}` }, 'the host is lower case, with no path');

  const res = await d.post('/oauth/approve', { request, record: 'rec_invented', scope: 'read' });
  assert.equal(res.status, 200, await res.clone().text());
  assert.deepEqual(d.mints[0]?.client, { id: client_id, kind: 'dcr', host: `app.${SITE}` });
});

test('an app answered on this computer has no host to name', async () => {
  const d = doors();
  const reg = await d.post('/oauth/register', { client_name: APP, redirect_uris: ['http://127.0.0.1/callback'], token_endpoint_auth_method: 'none' });
  const { client_id } = (await reg.json()) as { client_id: string };
  const request = await d.hold(client_id, 'http://127.0.0.1:53111/callback');
  const consent = (await (await d.call(`/oauth/request?request=${request}`)).json()) as { source: unknown };
  assert.deepEqual(consent.source, { kind: 'dcr', host: null });
  const res = await d.post('/oauth/approve', { request, record: 'rec_invented', scope: 'read' });
  assert.equal(res.status, 200, await res.clone().text());
  assert.deepEqual(d.mints[0]?.client, { id: client_id, kind: 'dcr', host: null });
});

test('a mint the record refuses still says the record sentence, after the stamp was offered', async () => {
  const said = 'Sign in again to make a token. Nothing was made.';
  const d = doors({ ok: false, status: 401, say: said });
  const reg = await d.post('/oauth/register', { client_name: APP, redirect_uris: [`https://${SITE}/callback`], token_endpoint_auth_method: 'none' });
  const { client_id } = (await reg.json()) as { client_id: string };
  const request = await d.hold(client_id, `https://${SITE}/callback`);
  const res = await d.post('/oauth/approve', { request, record: 'rec_invented', scope: 'read' });
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: 'access_denied', error_description: said });
  assert.equal(d.mints[0]?.client.kind, 'dcr');
});

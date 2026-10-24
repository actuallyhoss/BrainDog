/**
 * THE DECISION CARD, DRAWN AND PRESSED IN AN MCP APPS HOST (scope 2026-10-24 H20).
 *
 *   node --test tools/client-checks/cards.check.mjs
 *
 * The cards were tested only as code (`packages/mcp/test/cards.test.ts`, `answer.test.ts`), so nothing said a host could
 * draw one, hand it its answer, and take its press. This check is that host, built from the MCP Apps SDK's own host half,
 * `AppBridge` and `PostMessageTransport` of `@modelcontextprotocol/ext-apps/app-bridge` (pinned in `package.json`), which
 * is what the spec's reference hosts are built on. Nothing of the protocol between card and host is written here.
 *
 * THE HOST IS TWO HALVES, AS A REAL ONE IS. Its MCP client is the official SDK of `clients.json` over HTTP, here in Node.
 * Its page is headless Chromium: the card's `ui://` page in a sandboxed iframe (`allow-scripts`, no same origin, as hosts
 * draw it), the bridge beside it, and the bridge's `tools/call` handed to the Node half, as a host relays a view's calls.
 *
 * THE KEY IS ONE A CHAT APP HOLDS, got as Claude gets it. A grant is minted only for a key Claude or ChatGPT holds after
 * the owner signed in (`chat-answer.ts`), so the check registers itself at `/oauth/register` with Claude's callback
 * address, is allowed by the owner's own browser session on the consent door, and trades the code for a key. The
 * callback is never followed: the code is read off the answer. The owner turns "Answer from inside chat apps" on through
 * his session first, as Settings does.
 *
 * WHAT MAKES IT GREEN: the card draws the seed's open question with a button per option, a press on one option sends
 * `answer` through the bridge with the card's grant, the card says the answer, and the record holds the question
 * answered with that option. The grant never reaches what the model reads (the answer's text and `structuredContent`),
 * and `answer` without it answers nothing. Read-only on nothing but the gates' own record, started here and gone after.
 *
 * WHAT IT DOES NOT SAY: how Claude itself draws the card (its sandbox proxy, its theme, its size handling). That is the
 * look in Claude (agents.md H21), which this check makes a confirmation rather than a first try.
 */

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { RESOURCE_MIME_TYPE, getToolUiResourceUri, isToolVisibilityAppOnly } from '@modelcontextprotocol/ext-apps/app-bridge';
import { chromium } from '@playwright/test';
import { build } from 'esbuild';

import { start } from '../../apps/selfhost/src/server.ts';
import { NOW, installSeed } from '../../packages/seed/src/index.ts';
import { IDENTITY } from '../gates/record.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PINNED = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).devDependencies;
/* WHERE CLAUDE ASKS TO BE ANSWERED, so the door stamps the key as Claude's. Never fetched: the code is read off the answer. */
const CALLBACK = 'https://claude.ai/api/mcp/auth_callback';

let record;
let base;
let serverKey;
/* THE ORIGIN THE RECORD SIGNS IN AT, which a page on it sends: `localhost`, where `base` is the address it listens on. */
let origin;
let browser;
let session;
let mcp;

const b64url = (buf) => Buffer.from(buf).toString('base64url');

/** The owner's browser session on the gates' record, signed in with its server key as the sign-in page does. */
async function signIn() {
  const res = await fetch(new URL('/auth/token', base), { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ serverKey }) });
  assert.equal(res.status, 200, `the owner could not sign in: ${await res.text()}`);
  const sid = /^bd_s=([A-Za-z0-9_-]{43});/u.exec(res.headers.getSetCookie()[0] ?? '')?.[1];
  assert.ok(sid, 'signing in set no session');
  return `bd_s=${sid}`;
}

/** A POST as the owner's page sends it: the session cookie and this BrainDog's origin. */
const asOwner = (path, body) =>
  fetch(new URL(path, base), { method: 'POST', headers: { origin, cookie: session, 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json() }));

/** A key for this check as Claude gets one: registered, allowed by the owner, and the code traded with PKCE. */
async function claudeKey() {
  const reg = await fetch(new URL('/oauth/register', base), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ client_name: 'Claude', redirect_uris: [CALLBACK], token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] }),
  });
  assert.equal(reg.status, 201, `registering as Claude was refused: ${await reg.clone().text()}`);
  const { client_id } = await reg.json();
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash('sha256').update(verifier).digest());
  const q = new URLSearchParams({ client_id, redirect_uri: CALLBACK, response_type: 'code', code_challenge: challenge, code_challenge_method: 'S256', scope: 'write', state: 'cards-check', resource: `${origin}/mcp` });
  const held = await fetch(new URL(`/oauth/authorize?${q}`, base), { redirect: 'manual' });
  assert.equal(held.status, 302, `authorize did not send the browser to consent: ${await held.text()}`);
  const request = new URL(held.headers.get('location'), base).searchParams.get('request');
  assert.ok(request, 'authorize named no held request');
  const allowed = await asOwner('/oauth/approve', { request, record: IDENTITY.slug, scope: 'write' });
  assert.equal(allowed.status, 200, `the owner's Allow was refused: ${JSON.stringify(allowed.body)}`);
  const code = new URL(allowed.body.redirect).searchParams.get('code');
  assert.ok(code, 'Allow answered no code');
  const traded = await fetch(new URL('/oauth/token', base), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, code_verifier: verifier, client_id, redirect_uri: CALLBACK, resource: `${origin}/mcp` }),
  });
  const token = await traded.json();
  assert.equal(traded.status, 200, `the code was not traded: ${JSON.stringify(token)}`);
  return token.access_token;
}

/** The host page's half of the SDK, bundled for the browser from the pinned package. */
async function bridgeBundle() {
  const out = await build({
    stdin: { contents: "import { AppBridge, PostMessageTransport } from '@modelcontextprotocol/ext-apps/app-bridge'; window.McpApps = { AppBridge, PostMessageTransport };", resolveDir: HERE, loader: 'js' },
    bundle: true,
    format: 'iife',
    platform: 'browser',
    write: false,
    logLevel: 'silent',
  });
  return out.outputFiles[0].text;
}

/**
 * The gates' record, owned by the person who signs in. `startRecord` names its owner apart from the Directory's person,
 * so a browser session there reaches no record; this starts the same self-host the way `init` does (the person, the
 * record they own, the Directory row naming it) and puts the seed in.
 */
async function startOwned() {
  serverKey = randomBytes(32).toString('base64url');
  const running = await start({
    file: ':memory:',
    directory: ':memory:',
    port: 0,
    host: '127.0.0.1',
    now: NOW,
    pollMs: 0,
    token: serverKey,
    sessionKey: new Uint8Array(randomBytes(32)),
    kennel: { kennel: 'off', fetch: () => Promise.reject(new Error('this check reads no Kennel')), now: () => NOW },
  });
  try {
    const email = 'owner@the-studio.example';
    const person = running.directory.person$(email, 'Owner');
    assert.ok(person.ok, 'the owner could not be named');
    const made = await running.api.createRecord({ ...IDENTITY, owner: { id: person.value.id, email, name: 'Owner' } });
    assert.ok(made.ok, `the record could not be made: ${made.refusal?.fix}`);
    assert.ok(running.directory.provision({ slug: IDENTITY.slug, email, record: IDENTITY.id }).ok, 'the record could not be named in the Directory');
    const seeded = await installSeed(running.api.kernel);
    assert.ok(seeded.ok, `the seed did not go in: ${seeded.refusal?.fix}`);
  } catch (e) {
    await running.close().catch(() => {});
    throw e;
  }
  return { base: `http://127.0.0.1:${running.server.address().port}`, close: () => running.close() };
}

before(async () => {
  record = await startOwned();
  base = record.base;
  origin = base.replace('127.0.0.1', 'localhost');
  session = await signIn();
  const on = await asOwner('/api/setPref', { key: 'agents.answer_in_chat', value: true });
  assert.equal(on.body.ok, true, `the owner could not turn on answering in chat apps: ${JSON.stringify(on.body)}`);
  const key = await claudeKey();
  mcp = new Client({ name: 'braindog-cards-check', version: '1.0.0' }, { capabilities: { extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: [RESOURCE_MIME_TYPE] } } } });
  await mcp.connect(new StreamableHTTPClientTransport(new URL('/mcp', base), { requestInit: { headers: { authorization: `Bearer ${key}` } } }));
  browser = await chromium.launch();
});

after(async () => {
  await mcp?.close().catch(() => {});
  await browser?.close();
  await record?.close();
});

test('THE HOST IS THE SPEC\'S OWN SDK, pinned exactly', () => {
  assert.match(PINNED['@modelcontextprotocol/ext-apps'] ?? '', /^\d+\.\d+\.\d+$/u, 'the MCP Apps SDK is pinned to an exact version');
});

test('A PRESS ON THE DECISION CARD, DRAWN IN AN MCP APPS HOST, ANSWERS THE SEED\'S QUESTION', async (t) => {
  const { tools } = await mcp.listTools();
  const governance = tools.find((t) => t.name === 'governance');
  const answer = tools.find((t) => t.name === 'answer');
  assert.ok(governance, 'governance is not listed');
  const uri = getToolUiResourceUri(governance);
  assert.equal(uri, 'ui://braindog/decision.html', 'governance names no MCP Apps card');
  assert.ok(answer, 'answer is not listed to a key Claude holds');
  assert.ok(isToolVisibilityAppOnly(answer), 'answer is shown to the model, not only to the card');

  /* THE MODEL CANNOT PRESS: `answer` without the card's grant answers nothing. */
  const bare = await mcp.callTool({ name: 'answer', arguments: { option: 'accept' } });
  assert.equal(bare.isError, true, 'answer without a grant was taken');

  /* THE SEED'S OPEN QUESTIONS, and the first one whose card carries buttons. */
  const open = await mcp.callTool({ name: 'governance', arguments: { register: 'suggestion' } });
  const listed = open.structuredContent?.items ?? open.structuredContent?.rows ?? open.structuredContent?.value ?? [];
  const ids = (Array.isArray(listed) ? listed : []).map((r) => r?.id).filter((id) => typeof id === 'string');
  assert.ok(ids.length > 0, `the seed has no open question to draw: ${JSON.stringify(open.structuredContent).slice(0, 300)}`);
  let id;
  let result;
  for (const candidate of ids) {
    const one = await mcp.callTool({ name: 'governance', arguments: { register: 'suggestion', id: candidate } });
    if (one.structuredContent?.card?.answerTool === 'answer' && one._meta?.['braindog/answer']?.grant) {
      id = candidate;
      result = one;
      break;
    }
  }
  assert.ok(result, `no open question in the seed drew a card that answers in the chat (${ids.length} tried)`);
  const card = result.structuredContent.card;
  const grant = result._meta['braindog/answer'].grant;
  assert.ok(!JSON.stringify(result.content).includes(grant) && !JSON.stringify(result.structuredContent).includes(grant), 'the grant reached what the model reads');

  const read = await mcp.readResource({ uri });
  const page = read.contents.find((c) => c.uri === uri);
  assert.equal(page?.mimeType, RESOURCE_MIME_TYPE, 'the card is not served as an MCP App');

  /* THE PAGE: one sandboxed iframe holding the card, the bridge beside it, its calls relayed to the Node half. */
  const context = await browser.newContext();
  const tab = await context.newPage();
  const calls = [];
  const errors = [];
  tab.on('pageerror', (e) => errors.push(e.message));
  await tab.exposeFunction('hostCallTool', async (params) => {
    calls.push(params);
    return mcp.callTool(params);
  });
  await tab.setContent('<!doctype html><html><body><iframe id="card" sandbox="allow-scripts" style="width:480px;height:600px;border:0"></iframe></body></html>');
  await tab.addScriptTag({ content: await bridgeBundle() });
  await tab.evaluate(
    async ({ html, args, result: toolResult }) => {
      const { AppBridge, PostMessageTransport } = window.McpApps;
      const frame = document.getElementById('card');
      const bridge = new AppBridge(null, { name: 'braindog-cards-check', version: '1.0.0' }, { serverTools: {}, openLinks: {} }, { hostContext: { theme: 'light', displayMode: 'inline' } });
      window.__drawn = { initialized: false, sizes: [] };
      bridge.oncalltool = (params) => window.hostCallTool(params);
      bridge.onsizechange = (size) => window.__drawn.sizes.push(size);
      bridge.oninitialized = async () => {
        window.__drawn.initialized = true;
        await bridge.sendToolInput({ arguments: args });
        await bridge.sendToolResult(toolResult);
      };
      const loaded = new Promise((r) => frame.addEventListener('load', r, { once: true }));
      frame.srcdoc = html;
      await loaded;
      await bridge.connect(new PostMessageTransport(frame.contentWindow, frame.contentWindow));
    },
    { html: page.text, args: { register: 'suggestion', id }, result },
  );

  const view = tab.frameLocator('#card');
  const options = view.locator('button.opt');
  await options.first().waitFor({ timeout: 15_000 });
  assert.equal(await options.count(), card.options.length, 'the card drew a button per option');
  assert.equal(await view.locator('h1').textContent(), card.question);
  assert.equal(await tab.evaluate(() => window.__drawn.initialized), true, 'the card never said it was initialized');

  /* THE PERSON'S PRESS: an option that is not hard to undo, so one press answers. */
  const chosen = card.options.find((o) => !o.hard) ?? card.options[0];
  const button = options.nth(card.options.indexOf(chosen));
  await button.click();
  if (chosen.hard) await button.click();
  await view.locator('p.note').waitFor({ timeout: 15_000 });
  const said = await view.locator('p.note').textContent();

  assert.equal(calls.length, 1, `the card asked the host ${calls.length} times`);
  assert.equal(calls[0].name, 'answer');
  assert.deepEqual(calls[0].arguments, { grant, option: chosen.id });
  assert.doesNotMatch(said, /could not|Answer it in BrainDog/u, `the press was refused: ${said}`);
  assert.deepEqual(errors, [], 'the host page threw');

  /* THE RECORD HOLDS IT: the question is answered, with the option pressed. */
  const after_ = await mcp.callTool({ name: 'governance', arguments: { register: 'suggestion', id } });
  const row = after_.structuredContent;
  const status = row?.status;
  assert.equal(status, 'resolved', `the question is not answered after the press: ${JSON.stringify(row).slice(0, 400)}`);
  assert.equal(typeof row.decision, 'string', 'the answered question names no decision');
  const decided = await mcp.callTool({ name: 'governance', arguments: { register: 'decision', id: row.decision } });
  const d = decided.structuredContent;
  assert.equal(d?.suggestion, id, 'the decision is not the one the card drew');
  assert.equal(d?.answer, chosen.id, `the decision holds ${d?.answer}, and the press was ${chosen.id}`);
  assert.match(d?.decided_by ?? '', /^p_/u, `the decision was made by ${d?.decided_by}, not by the person`);
  t.diagnostic(`drew ${id} (${card.options.length} options, ${ids.length} open), pressed ${chosen.id}; the card said "${said}"; the record says ${status}`);

  /* SPENT BY ONE PRESS: the same grant again answers nothing. */
  const again = await mcp.callTool({ name: 'answer', arguments: { grant, option: chosen.id } });
  assert.equal(again.isError, true, 'the grant answered a second press');
  await context.close();
});

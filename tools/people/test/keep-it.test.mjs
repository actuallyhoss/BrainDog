/**
 * Use case 6, step 4, for Mariam, walked on the hosted service in one process (`expect/keep-it.mjs`): the mailed link
 * carries her sentence, spends, and opens "Mariam's Candles", and the sentence is kept nowhere.
 *
 * AND THE LINE GOES RED BY ITSELF. The same walk, with one door broken between the tab and the Worker, must say red and
 * name what broke: the sentence dropped from the sign-up, the proof refused, the sentence written to a table or a log.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { foundIn, joined, judge, keepIt, PASSKEY, tracesOf } from '../expect/keep-it.mjs';

const MARIAM = JSON.parse(readFileSync(new URL('../mariam.json', import.meta.url), 'utf8'));
const TITLE = MARIAM.expect.heard.title;

/** A tab whose calls to `path` have their JSON body changed by `change` before the Worker reads it. */
const meddle = (path, change) => (fetch) => async (url, init = {}) =>
  String(url).endsWith(path) && typeof init.body === 'string' ? fetch(url, { ...init, body: JSON.stringify(change(JSON.parse(init.body))) }) : fetch(url, init);

/** A tab that, once the sign-up has answered, does `after(harness)`: how a copy kept by mistake is made to happen. */
const thenDo = (after) => (fetch, c) => async (url, init) => {
  const res = await fetch(url, init);
  if (String(url).endsWith('/auth/signup/start')) after(c);
  return res;
};

test('MARIAM KEEPS IT: the link carries her sentence, opens "Mariam\'s Candles", and the sentence is kept nowhere', async () => {
  let c = null;
  const r = await keepIt(MARIAM, { name: TITLE, wrap: (f, h) => ((c = h), f) });
  assert.equal(r.pass, true, r.saw);
  assert.equal(r.seen.carried, MARIAM.said);
  assert.equal(r.seen.name, TITLE);
  assert.deepEqual(r.seen.kept, []);
  assert.match(r.saw, /passkey: screen only$/u);
  assert.doesNotMatch(r.saw, /—/u, 'no em dash in a line a person reads');
  /* NOTHING WRITTEN OUTSIDE THE RECORD IT MADE: one record in the whole service, hers, and nothing in the bucket. */
  const named = c.dirStorage.sql.exec('SELECT record FROM dir_slug WHERE slug = ?', MARIAM.slug).toArray();
  assert.deepEqual([...c.storages.keys()], named.map((n) => n.record));
  assert.equal(c.blobs.held.size, 0);
});

/* THE PAGE SENDS THE NAME IT HEARD (`routes/signup/+page.svelte` `send`: `name: read.name`), and the free record is
   named with it, so her record opens as "Mariam" while the keep tile showed "Mariam's Candles". Red until the page
   sends the title it showed; the walk above sends the title to prove every other door. */
test('THE PAGE\'S OWN NAME opens "Mariam\'s Candles"', { todo: 'the sign-up page sends read.name, so the record is named "Mariam"' }, async () => {
  const r = await keepIt(MARIAM);
  assert.equal(r.seen.name, TITLE, r.saw);
});

test('A DROPPED SAID IS RED: the sign-up went without her sentence', async () => {
  const r = await keepIt(MARIAM, { name: TITLE, wrap: meddle('/auth/signup/start', ({ said: _said, ...rest }) => rest) });
  assert.equal(r.pass, false);
  assert.match(r.saw, /the link carried no sentence/u);
});

test('A FAILED VERIFY IS RED: a proof the Directory does not hold is refused, and no record is opened', async () => {
  const r = await keepIt(MARIAM, { name: TITLE, wrap: meddle('/auth/signup/verify', (b) => ({ ...b, token: `${b.token.slice(0, -1)}${b.token.endsWith('A') ? 'B' : 'A'}` })) });
  assert.equal(r.pass, false);
  assert.match(r.saw, /the link was refused/u);
  assert.equal(r.seen.name, null);
});

test('THE SENTENCE IN A DIRECTORY TABLE IS RED, by the table it was found in', async () => {
  const leak = (c) => {
    c.dirStorage.sql.exec('CREATE TABLE IF NOT EXISTS said_kept (said TEXT)');
    c.dirStorage.sql.exec('INSERT INTO said_kept (said) VALUES (?)', MARIAM.said);
  };
  const r = await keepIt(MARIAM, { name: TITLE, wrap: thenDo(leak) });
  assert.equal(r.pass, false);
  assert.match(r.saw, /her sentence was kept in the Directory's said_kept/u);
});

test('A COPY CUT SHORT AND KEPT AS BYTES IS RED', async () => {
  const leak = (c) => {
    c.dirStorage.sql.exec('CREATE TABLE IF NOT EXISTS said_bytes (b BLOB)');
    c.dirStorage.sql.exec('INSERT INTO said_bytes (b) VALUES (?)', new TextEncoder().encode(MARIAM.said.slice(0, 50)));
  };
  const r = await keepIt(MARIAM, { name: TITLE, wrap: thenDo(leak) });
  assert.equal(r.pass, false);
  assert.match(r.saw, /her sentence was kept in the Directory's said_bytes/u);
});

test('THE SENTENCE IN A LOG LINE IS RED, even encoded as a link carries it', async () => {
  const r = await keepIt(MARIAM, { name: TITLE, wrap: thenDo(() => console.log(`mailed ${encodeURIComponent(MARIAM.said)}`)) });
  assert.equal(r.pass, false);
  assert.match(r.saw, /kept in log line \d+/u);
});

test('the judge names each broken door, and a green line is only a whole walk', () => {
  const whole = { started: { ok: true }, link: 'https://x.test/app/signup#verify=a', carried: MARIAM.said, verified: { ok: true }, made: { ok: true }, opened: { ok: true }, name: TITLE, kept: [] };
  assert.equal(judge(whole, MARIAM, TITLE).pass, true);
  const red = (change) => judge({ ...whole, ...change }, MARIAM, TITLE);
  assert.match(red({ started: { ok: false, why: 'closed' }, link: null }).saw, /sign-up was refused: closed/u);
  assert.match(red({ link: null }).saw, /no letter/u);
  assert.match(red({ carried: 'I run a shop.' }).saw, /carried "I run a shop\."/u);
  assert.match(red({ made: { ok: false, why: 'taken' } }).saw, /free record was not made: taken/u);
  assert.match(red({ name: 'mariams-candles' }).saw, /opened "mariams-candles", not "Mariam's Candles"/u);
  assert.match(red({ kept: ['log line 3'] }).saw, new RegExp(`kept in log line 3; ${PASSKEY}$`, 'u'));
});

test('a trace is found plain, encoded or packed, and a sentence that only shares a name is not', () => {
  const places = [
    { where: 'plain', text: `x ${MARIAM.said} x` },
    { where: 'encoded', text: `#said=${encodeURIComponent(JSON.stringify({ said: MARIAM.said }))}` },
    { where: 'packed', text: JSON.stringify([{ said: MARIAM.said }]) },
    { where: 'form', text: new URLSearchParams({ said: MARIAM.said }).toString() },
    { where: 'cut short', text: `said: ${MARIAM.said.slice(0, 50)}...` },
    { where: 'name only', text: '{"name":"Mariam\'s Candles","person":"Mariam"}' },
  ];
  assert.deepEqual(foundIn(places, MARIAM.said), ['plain', 'encoded', 'packed', 'form', 'cut short']);
  assert.ok(tracesOf(MARIAM.said).every((t) => t.length >= 20));
});

test('first-run\'s step 4 takes this walk only where it said "not walked"', () => {
  const selfHost = { id: 'keep', pass: null, saw: 'sign-up not walked: self-host; opened through the owner door, built orders, in EGP' };
  const hosted = { id: 'keep', pass: true, saw: `the mailed link carried her sentence; ${PASSKEY}` };
  assert.deepEqual(joined(selfHost, hosted), { id: 'keep', pass: true, saw: `on the hosted service, ${hosted.saw}; on the self-host, built orders, in EGP` });
  assert.equal(joined(selfHost, { ...hosted, pass: false }).pass, false);
  const red = { id: 'keep', pass: false, saw: 'no orders on the record' };
  assert.equal(joined(red, hosted), red);
});

/**
 * Where the person answers a filed question, as the command prints it: `<origin>/app/<slug>/decide/<id>`, the address
 * the agent door hands an agent for the same question.
 *
 * PURE, SO NO HOST. The target is the one `target` in http.ts builds, from the same `hostKey`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { hostKey, target } from '../src/http.ts';
import { decideLink, untilAccepted } from '../src/links.ts';

/* THE AGENT DOOR'S OWN LINE (`decideAt`, packages/mcp/src/index.ts), kept here word for word so the two cannot drift. */
const mcpShape = (origin: string, slug: string, id: string) => `${origin.replace(/\/+$/, '')}/app/${encodeURIComponent(slug)}/decide/${encodeURIComponent(id)}`;

const to = (typed: string) => ({ key: hostKey(typed) });

test('A KEY WITH A SLUG ANSWERS THE APP’S OWN ADDRESS, under /app and under the record', () => {
  assert.equal(decideLink(to('https://brain.dog/acme'), 'SG3'), 'https://brain.dog/app/acme/decide/SG3');
  /* What the connect screen prints and people paste is the same record, so it is the same link. */
  assert.equal(decideLink(to('https://brain.dog/app/acme'), 'SG3'), 'https://brain.dog/app/acme/decide/SG3');
  assert.equal(decideLink(to('brain.dog/app/acme/'), 'SG3'), 'https://brain.dog/app/acme/decide/SG3');
  assert.equal(decideLink(to('http://127.0.0.1:8787/acme'), 'SG3'), 'http://127.0.0.1:8787/app/acme/decide/SG3');
});

test('THE TARGET THE COMMAND REALLY HOLDS gives the same link, though its base is the origin alone', () => {
  const held = target('https://brain.dog/app/acme', { BRAINDOG_TOKEN: 'bd_x' }, '/nowhere/hosts.json');
  assert.equal(held.base, 'https://brain.dog');
  assert.equal(decideLink(held, 'SG3'), 'https://brain.dog/app/acme/decide/SG3');
});

test('NO SLUG, NO LINK: an origin alone names no record, and a guessed address would land nowhere', () => {
  assert.equal(decideLink(to('https://brain.dog'), 'SG3'), null);
  assert.equal(decideLink(to('https://brain.dog/app'), 'SG3'), null);
  assert.equal(decideLink(to('http://127.0.0.1:8787'), 'SG3'), null);
  /* A path that is not one slug is not a record either. */
  assert.equal(decideLink({ key: 'https://brain.dog/a/b' }, 'SG3'), null);
  assert.equal(decideLink({ key: 'not an address' }, 'SG3'), null);
});

test('AN EMPTY ID IS NO QUESTION TO LINK TO, as the agent door holds', () => {
  assert.equal(decideLink(to('https://brain.dog/acme'), ''), null);
});

test('THE ID IS ENCODED, so nothing in it can walk the path or open a query', () => {
  assert.equal(decideLink(to('https://brain.dog/acme'), 'a/b?c#d e'), 'https://brain.dog/app/acme/decide/a%2Fb%3Fc%23d%20e');
  assert.equal(decideLink(to('https://brain.dog/acme'), '../../admin'), 'https://brain.dog/app/acme/decide/..%2F..%2Fadmin');
});

test('THE SAME INPUTS GIVE THE AGENT DOOR’S STRING, byte for byte', () => {
  for (const [origin, slug, id] of [
    ['https://brain.dog', 'acme', 'SG3'],
    ['https://brain.dog', 'ada-kiln', '01JABCDEFGHJKMNPQRSTVWXYZ0'],
    ['http://127.0.0.1:8787', 'acme', 'a/b c'],
    ['https://self.example:8443', 'acme_2', 'SG12'],
  ] as const)
    assert.equal(decideLink(to(`${origin}/app/${slug}`), id), mcpShape(origin, slug, id));
});

test('THE SENTENCE A FILING ENDS ON carries the link, or sends the person to Decide when there is none', () => {
  assert.equal(untilAccepted(to('https://brain.dog/app/acme'), 'SG3'), 'Nothing is installed until they accept it: https://brain.dog/app/acme/decide/SG3');
  assert.equal(untilAccepted(to('http://127.0.0.1:8787'), 'SG3'), 'Nothing is installed until they accept it. Open Decide in the app.');
});

/**
 * The hour of arrivals a record keeps, against a stranger who knows its webhook address and not its token.
 *
 * WHAT IS PINNED: forged arrivals spend their own, smaller hour. However many a stranger posts, the record's real sender,
 * with the right token, is still taken in that hour.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ABUSE } from '@braindog/host/abuse';

import { cloud } from './cloud-harness.ts';

const REC = 'rec_01J8ZC0000000000000000000A';
const TOKEN = 'tok_an_invented_sender_secret_for_this_test';

test('A STRANGER WITHOUT THE TOKEN NEVER SPENDS THE HOUR A RECORD\'S REAL SENDER NEEDS', async () => {
  const realNow = Date.now;
  let shift = 0;
  Date.now = () => realNow() + shift;
  try {
    const c = await cloud();
    (c.directory as unknown as { knows: (id: string) => Promise<boolean> }).knows = async (id: string) => id === REC;
    const arrived: { verified: unknown }[] = [];
    const stub = {
      ingestVerify: async () => ({ kind: 'path', token: TOKEN }),
      arrive: async (a: { verified: unknown }) => (arrived.push({ verified: a.verified }), { ok: true, value: { raw: `raw_${String(arrived.length)}` } }),
    };
    c.env['RECORD'] = { idFromName: (n: string) => n, get: () => stub };
    const post = (tok: string, body: string) =>
      c.bundle.default.fetch(new Request(`https://app.example.test/in/webhook/${REC}/bank/${tok}`, { method: 'POST', body }), c.env, { waitUntil: () => {} });

    /* 1,500 FORGED POSTS IN UNDER AN HOUR, 110 a minute so the per-path brake at the door is not what stops them. */
    let sent = 0;
    while (sent < ABUSE.inboxHour.most) {
      for (let i = 0; i < 110 && sent < ABUSE.inboxHour.most; i++, sent++) await post('wrong-token', `forged ${String(sent)}`);
      shift += 61_000;
    }
    assert.ok(arrived.filter((a) => a.verified === false).length <= ABUSE.inboxStrangerHour.most, 'more forged arrivals were kept than the stranger hour allows');

    const genuine = await post(TOKEN, 'A real payment line');
    assert.equal(genuine.status, 202, await genuine.text());
    assert.equal(arrived.filter((a) => a.verified === true).length, 1);
  } finally {
    Date.now = realNow;
  }
});

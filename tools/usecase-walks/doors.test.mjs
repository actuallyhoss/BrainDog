/**
 * The walk's real doors, on the Worker as it ships, in one process (`apps/worker/test/cloud-harness.ts`, as
 * `tools/people/expect/keep-it.mjs` uses it): sign-up with the mailed link, the free record made with no plan, the
 * proposal accepted, a key made, the record aged a week and then three months through that key (with her yes on Decide
 * to what the record asks about first), and the record deleted and looked for. Nothing is faked but the mailbox and the browser.
 *
 * WHY, WHEN `walk.test.mjs` ALREADY WALKS: that test hands the walk doors of its own, to plant failures. This one holds
 * `realDoors` to the product, so a sign-up call that changes its shape, or a key that can no longer write, is red here
 * and not on the first night against a host.
 *
 * THE BROWSER HERE READS THE RECORD, NOT A SCREEN: each "page" is the count of tasks the session's own `boot` answers,
 * which is how the test knows the entries landed in the record the walk made.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { createClient } from '../../packages/client/src/index.ts';
import { cloud, ORIGIN } from '../../apps/worker/test/cloud-harness.ts';
import { plan } from './age.mjs';
import { failed, fresh, realDoors, STAGES, walk } from './walk.mjs';

const dina = JSON.parse(readFileSync(new URL('../people/free.json', import.meta.url), 'utf8'));

/** A hosted service with sign-up open and a mailbox that keeps every letter, reached as `host.fetch`. */
async function hosted() {
  const sent = [];
  const mail = { send: async (m) => (sent.push(m), { messageId: `m${sent.length}` }) };
  /* A key store bound, as production binds one: a fresh key of the test's own, never a host's. */
  const KEK = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex');
  const c = await cloud({ SIGNUP: 'open', AUTH_MAIL_FROM: 'hello@people.braindog.test', EMAIL: mail, KEK });
  const send = (url, init = {}) => {
    const path = String(url).startsWith(ORIGIN) ? String(url).slice(ORIGIN.length) : String(url);
    const headers = new Headers(init.headers);
    const cookie = headers.get('cookie');
    return c.ask(path, { ...init, headers, ...(cookie ? { cookie } : {}) });
  };
  /* The letter goes inside `waitUntil`, which nothing waits on, so the mailbox is looked in for half a second. */
  const linkFor = async (to) => {
    for (let i = 0; i < 50; i++) {
      const link = sent.filter((m) => m.to === to).map((m) => /https:\/\/\S+#verify=\S+/u.exec(String(m.text ?? ''))?.[0]).find(Boolean);
      if (link) return link;
      await new Promise((r) => setTimeout(r, 10));
    }
    return null;
  };
  return { origin: ORIGIN, fetch: send, sink: { linkFor } };
}

/** A browser that reads the record with the tab's session: one page, saying how many tasks the record holds. */
function counting(host) {
  const seen = {};
  let record = null;
  return {
    seen,
    async open({ origin, slug, cookie }) {
      const io = (url, init = {}) => host.fetch(url, { ...init, headers: { ...Object.fromEntries(new Headers(init.headers)), cookie } });
      record = createClient({ base: `${origin}/${slug}`, fetch: io });
    },
    rail: async () => [{ name: 'Today', path: '/' }],
    async see(_page, _width, stage) {
      const boot = await record.boot();
      const tasks = boot.ok ? (boot.value.registers.find((r) => r.id === 'tasks')?.count ?? null) : null;
      seen[stage] = tasks;
      return { state: boot.ok ? 'ready' : 'refused', text: `Tasks\n${tasks} tasks`, raw: {}, errors: [], failed: [], image: null };
    },
    act: async () => ({ said: [], image: null }),
    close: async () => {},
  };
}

/** Her list cut to what a record can answer with no screen: the rail opens. */
const person = (p) => ({ ...p, walk: { ...p.walk, pages: [], acts: [], expect: p.walk.expect.filter((l) => l.kind === 'opens') } });

test('Dina signs up with no plan, keeps what was proposed, is aged a week and three months, and her record is deleted', async () => {
  const host = await hosted();
  const seer = counting(host);
  const verdict = await walk(person(fresh(dina, null)), { origin: host.origin, doors: await realDoors(host), seer });
  assert.deepEqual(verdict.steps.filter((s) => !s.ok), []);
  assert.equal(verdict.colour, 'green');
  assert.equal(failed(verdict), false);
  assert.deepEqual(verdict.record, { name: "Dina's BrainDog", made: true, deleted: true });
  const week = plan(dina, 'week').length;
  assert.deepEqual(seen(seer), [0, week, week + plan(dina, 'quarter').length]);
  /* The record asked about the key's first changes, and she said yes to each on Decide: the walk says how many. */
  assert.match(verdict.steps.find((s) => s.step === 'Age the record a week').saw, /^14 entries written, \d+ of them after a yes on Decide$/u);
});

const seen = (seer) => STAGES.map((s) => seer.seen[s]);

test('a second walk from the same mailbox is a new person with a new record, and leaves nothing behind either', async () => {
  const host = await hosted();
  for (const at of [1_760_000_000_000, 1_760_000_100_000]) {
    const verdict = await walk(person(fresh(dina, 'walks@people.braindog.test', at)), { origin: host.origin, doors: await realDoors(host), seer: counting(host) });
    assert.deepEqual(verdict.steps.filter((s) => !s.ok), [], `the walk at ${at}`);
    assert.equal(verdict.record.deleted, true);
  }
});

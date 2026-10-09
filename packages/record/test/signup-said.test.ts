/**
 * What was said survives the link (LCH-A04, the onboarding target's step 4): a sign-up typed on a desk and opened on a
 * phone builds from the same sentence.
 *
 * THE SENTENCE RIDES IN THE MAILED LINK'S FRAGMENT AND NOWHERE ELSE: not in a table, not in a log. A start without one
 * mails the link it always did.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { AuthResult } from '@braindog/ports';

import { createDirectory } from '../src/directory.ts';
import { SAID_IN_LINK, saidRefused } from '../src/identity.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 9);
const MARIAM = "I'm Mariam. I run a small candle shop in Alexandria and freelance as a designer.";
const PACKED = JSON.stringify({ said: MARIAM, currency: 'EGP' });

function setup() {
  const sql = openSqlite();
  const logged: unknown[] = [];
  const d = createDirectory(sql, fixedClock(NOW), { mac: new Uint8Array(32).fill(5), magic: true, log: (line: unknown) => logged.push(line) } as never);
  return { sql, d, logged };
}

let seq = 0;
const start = (d: ReturnType<typeof setup>['d'], said?: unknown) =>
  d.auth({
    flow: 'signup.start',
    email: `mariam${++seq}@example.com`,
    slug: `candles-${seq}`,
    ip: `203.0.113.${seq}`,
    checked: true,
    ...(said === undefined ? {} : { said }),
  } as never) as Promise<AuthResult>;

const linkOf = (out: AuthResult): string => {
  assert.equal(out.status, 200);
  const mail = out.status === 200 ? (out.mail as { kind?: string; link?: string } | undefined) : undefined;
  assert.equal(mail?.kind, 'signup.verify');
  return mail?.link ?? '';
};

/** Every value in every table, as one string, so a test can say a sentence is in none of them. */
const everything = (sql: ReturnType<typeof setup>['sql']): string =>
  sql
    .all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'")
    .map((t) => JSON.stringify(sql.all(`SELECT * FROM "${t.name}"`)))
    .join('\n');

test('THE MAIL CARRIES WHAT WAS SAID IN THE LINK, after the proof, and the proof is as it always was', async () => {
  const { d } = setup();
  const link = linkOf(await start(d, PACKED));
  const [token, ...rest] = link.split('&');
  assert.match(token ?? '', /^[A-Za-z0-9_-]{43}$/);
  assert.equal(rest.length, 1, 'only the sentence follows the proof');
  /* THE WORKER WRITES `#verify=<link>`, so the page reads this off the fragment exactly as a browser would. */
  assert.equal(new URLSearchParams(rest.join('&')).get('said'), PACKED);
  assert.deepEqual(JSON.parse(new URLSearchParams(rest.join('&')).get('said') ?? ''), { said: MARIAM, currency: 'EGP' });
});

test('NOTHING SAID IS A LINK AS IT ALWAYS WAS: no fragment after the proof, and spaces count as nothing', async () => {
  const { d } = setup();
  assert.match(linkOf(await start(d)), /^[A-Za-z0-9_-]{43}$/);
  assert.match(linkOf(await start(d, '   ')), /^[A-Za-z0-9_-]{43}$/);
  assert.match(linkOf(await start(d, 42)), /^[A-Za-z0-9_-]{43}$/, 'anything but words is nothing said');
});

test('THE SENTENCE IS IN NO TABLE AND NO LOG LINE', async () => {
  const { sql, d, logged } = setup();
  linkOf(await start(d, PACKED));
  await start(d, 'x'.repeat(SAID_IN_LINK + 1));
  assert.equal(everything(sql).includes('Alexandria'), false, 'not in a table');
  assert.equal(JSON.stringify(logged).includes('Alexandria'), false, 'not in a log line');
  assert.equal(JSON.stringify(logged).includes('xxxxxxxx'), false, 'a refused one is not logged either');
});

test('OVER 1,000 CHARACTERS IS REFUSED, at said, with the sentence why, and mails nothing', async () => {
  const { d } = setup();
  assert.equal(SAID_IN_LINK, 1000);
  const at = await start(d, 'a'.repeat(SAID_IN_LINK));
  assert.equal(at.status, 200, '1,000 is allowed');
  const over = await start(d, 'a'.repeat(SAID_IN_LINK + 1));
  assert.equal(over.status, 422);
  assert.equal(over.status === 422 ? over.refusal.at : null, 'said');
  assert.match(over.status === 422 ? over.refusal.fix : '', /at most 1,000 characters/);
  assert.equal('mail' in over, false);
});

test('A WEB OR EMAIL ADDRESS IN WHAT WAS SAID IS REFUSED, with the sentence why', async () => {
  const { d } = setup();
  for (const said of ['See https://evil.example/x', 'go to www.example.org', 'write to me at m@example.com', 'my shop is mariamcandles.com', 'mailto:m@example.com']) {
    const out = await start(d, said);
    assert.equal(out.status, 422, said);
    assert.equal(out.status === 422 ? out.refusal.at : null, 'said', said);
    assert.match(out.status === 422 ? out.refusal.fix : '', /web or email address/, said);
  }
  /* WORDS THAT ONLY LOOK LIKE ONE ARE NOT ONE. */
  for (const said of [MARIAM, 'Mr. Adel pays me, e.g. monthly.', 'I sell at 3.50 a candle', 'shop.company of two']) assert.equal(saidRefused(said), null, said);
});

test('A CHARACTER NO LINK CAN CARRY IS REFUSED, never a fault', async () => {
  const { d } = setup();
  const out = await start(d, 'candles \uD800');
  assert.equal(out.status, 422);
  assert.equal(out.status === 422 ? out.refusal.at : null, 'said');
});

test('A KNOWN ADDRESS IS SENT ITS SIGN-IN LINK WITHOUT THE SENTENCE', async () => {
  const { sql, d } = setup();
  sql.exec("INSERT INTO dir_person (id, email, created_at) VALUES ('p1', 'known@example.com', 1)");
  const out = (await d.auth({ flow: 'signup.start', email: 'known@example.com', slug: 'known-shop', ip: '198.51.100.1', checked: true, said: PACKED } as never)) as AuthResult;
  assert.equal(out.status, 200);
  const mail = out.status === 200 ? (out.mail as { kind?: string; link?: string } | undefined) : undefined;
  assert.equal(mail?.kind, 'signup.known');
  assert.match(mail?.link ?? '', /^[A-Za-z0-9_-]{43}$/);
});

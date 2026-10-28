/**
 * Whether each sign-in letter went out, kept by the Directory.
 *
 * MEASURED BEFORE THIS FILE: the letter was sent inside `waitUntil` and its failure was a log line, so the screen said a
 * link was on its way whatever happened. Sign-up is open to strangers now, so a host whose mail has
 * stopped leaves every newcomer waiting on a letter that is not coming.
 *
 * NOW: the Directory keeps the last 20 sends and their outcome, and `lettersDown()` is true when the last five all met a
 * fault of the host's. A fault of one address (suppressed, or not an address) is never counted, so the count cannot be
 * used to ask whether a mailbox has an account. The answer still never waits for the send.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { cloud } from './cloud-harness.ts';

const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAH';
const OWNER = 'ada@example.test';

type Down = { lettersDown(): Promise<boolean>; letterSent(went: boolean): Promise<void> };

/** A deployment whose mail binding answers `fault()`: a code to refuse with, or nothing to take the letter. */
async function deployment() {
  let fault: string | null = null;
  const sent: Record<string, unknown>[] = [];
  const c = await cloud({
    AUTH_MAIL_FROM: 'hello@brain.example.test',
    EMAIL: {
      send: async (m: Record<string, unknown>) => {
        if (fault !== null) throw Object.assign(new Error(`refused ${OWNER}`), { code: fault });
        sent.push(m);
      },
    },
  });
  const kv = new Map<string, unknown>();
  Object.assign(c.dirStorage, { get: async (k: string) => kv.get(k), put: async (k: string, v: unknown) => void kv.set(k, v) });
  await c.provision(REC, 'letters', OWNER);
  const directory = c.directory as unknown as Down;
  /* ONE SIGN-IN LINK ASKED FOR, THROUGH THE WORKER'S OWN DOOR, and the send it started let finish. */
  const ask = async (email = OWNER) => {
    const out = await c.ask('/auth/magic/start', { method: 'POST', body: JSON.stringify({ email }) });
    assert.ok(out.status < 500, `${out.status} ${await out.clone().text()}`);
    for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
  };
  const methods = () => c.ask('/auth/methods', { method: 'GET' });
  return { sent, kv, directory, ask, methods, failWith: (code: string | null) => void (fault = code) };
}

/** Run `fn` with the Worker's lines kept out of the test's output. */
async function quiet<T>(fn: () => Promise<T>): Promise<T> {
  const methods = ['log', 'info', 'warn', 'error'] as const;
  const kept = methods.map((m) => console[m]);
  for (const m of methods) console[m] = () => {};
  try {
    return await fn();
  } finally {
    methods.forEach((m, i) => (console[m] = kept[i]!));
  }
}

test('A LETTER THAT WENT IS COUNTED AS GONE, and mail is not down', async () => {
  const d = await deployment();
  await quiet(() => d.ask());
  assert.equal(d.sent.length, 1, 'the sign-in letter was not sent');
  assert.deepEqual(d.kv.get('ops-letters'), [true]);
  assert.equal(await d.directory.lettersDown(), false);
});

test('FIVE HOST FAULTS IN A ROW IS MAIL DOWN, and one letter that goes is mail back', async () => {
  const d = await deployment();
  d.failWith('E_INTERNAL_SERVER_ERROR');
  await quiet(async () => {
    for (let i = 0; i < 4; i++) await d.ask();
  });
  assert.equal(await d.directory.lettersDown(), false, 'four is not five');
  await quiet(() => d.ask());
  assert.deepEqual(d.kv.get('ops-letters'), [false, false, false, false, false]);
  assert.equal(await d.directory.lettersDown(), true);

  d.failWith(null);
  await quiet(() => d.ask());
  assert.equal(await d.directory.lettersDown(), false);
});

test("MAIL DOWN REACHES /auth/methods AS magic: 'down', AND GOES STALE: a quarter hour after the last send it is not down", async () => {
  const d = await deployment();
  d.failWith('E_INTERNAL_SERVER_ERROR');
  await quiet(async () => {
    for (let i = 0; i < 5; i++) await d.ask();
  });
  assert.equal(await d.directory.lettersDown(), true);
  const methods = (await (await d.methods()).json()) as { value?: { magic?: unknown } };
  assert.equal(methods.value?.magic, 'down');
  d.kv.set('ops-letters-at', Date.now() - 16 * 60_000);
  assert.equal(await d.directory.lettersDown(), false, 'five old failures still read as down, and nothing would ever send to clear them');
});

test("AN ADDRESS'S OWN FAULT IS NEVER COUNTED: a suppressed mailbox says nothing about the host or the person", async () => {
  const d = await deployment();
  d.failWith('E_RECIPIENT_SUPPRESSED');
  await quiet(async () => {
    for (let i = 0; i < 6; i++) await d.ask();
  });
  assert.equal(d.kv.get('ops-letters'), undefined);
  assert.equal(await d.directory.lettersDown(), false);
});

test('THE DIRECTORY KEEPS THE LAST 20 AND NO MORE', async () => {
  const d = await deployment();
  for (let i = 0; i < 25; i++) await d.directory.letterSent(i % 2 === 0);
  const kept = d.kv.get('ops-letters') as boolean[];
  assert.equal(kept.length, 20);
  assert.equal(kept.at(-1), true, 'newest last');
});

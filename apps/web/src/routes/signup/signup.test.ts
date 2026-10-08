/**
 * Describe-then-build's two promises on sign-up: the record is named from what was heard, and what was said survives the
 * round trip through the mail to the tab the link opens.
 *
 * AGAINST THE RULES THE PAGE READS WITH (`propose`), not a fixture of their answer, so a reading that stops hearing a
 * business stops naming the record after it here too.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  allWritten,
  arrivalOf,
  billing,
  checkName,
  chooseName,
  CODE_KEY,
  codeKept,
  keepCode,
  keepSaid,
  namesHeard,
  recordNames,
  SAID_KEY,
  SAID_MOST,
  saidKept,
  startSignup,
  type Asked,
  type Io,
  type NameSeen,
} from '../../lib/signup.ts';
import { words } from './words.ts';
import { propose } from '../../lib/start/propose.ts';

const CTX = { zone: 'Europe/London', locale: 'en-GB' };

/** A Directory that has handed out these names and no others. */
const directory =
  (taken: readonly string[], asked: string[] = []) =>
  async (slug: string): Promise<Asked<NameSeen>> => {
    asked.push(slug);
    return { ok: true, value: { slug, free: !taken.includes(slug), why: null, mode: 'open', open: true, turnstile: null } };
  };

/** A storage that keeps what it is given, as a tab's would. */
function storage(): Storage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
  };
}

test('THE RECORD IS NAMED FOR THE BUSINESS HEARD FIRST, then the person, then the address', () => {
  const p = propose('Sami, I run Kiln Studio, a pottery shop', CTX);
  assert.deepEqual(namesHeard(p), { person: 'Sami', business: 'Kiln Studio' });
  assert.deepEqual(recordNames(namesHeard(p), 'sami.k@example.com'), ['kiln-studio', 'sami', 'sami-k']);
  /* NO BUSINESS: the person. A client in People is not the business, and neither is a payment. */
  const billing = propose('I am Dana. We bill Fenwick £2,000 a month on the 1st', CTX);
  assert.equal(namesHeard(billing).business, null);
  assert.deepEqual(recordNames({ person: null, business: null }, 'dana@example.com'), ['dana']);
  /* THE BUSINESS WITH A CLIENT BESIDE IT is still the business, whichever the sentence said first. */
  assert.equal(namesHeard(propose('I am Dana, I run Kiln Studio and we bill Fenwick £2,000 a month', CTX)).business, 'Kiln Studio');
});

test('THE RECORD IS NEVER NAMED FOR A CLIENT OR A VENDOR, only for what the person runs', () => {
  /* WHAT A MODEL MAY HAND BACK, list by list: none of these is the person's, and the record's name is public. */
  const theirs = [
    { register: 'organisations', fields: { name: 'Acme Ltd' } },
    { register: 'people', fields: { name: 'Fenwick', role: 'client' } },
    { register: 'services', fields: { name: 'Adobe' } },
    { register: 'accounts', fields: { name: 'HSBC' } },
    { register: 'obligations', fields: { what: 'Monthly invoice to Fenwick' } },
  ];
  assert.deepEqual(namesHeard({ name: 'Jo', rows: theirs }), { person: 'Jo', business: null });
  assert.deepEqual(recordNames(namesHeard({ name: 'Jo', rows: theirs }), 'jo@acme.example'), ['jo']);
  /* A PROJECT THAT CARRIES A CLIENT'S NAME is the client's work, and the next project is the one taken. */
  const rows = [...theirs, { register: 'things', fields: { name: ' fenwick ' } }, { register: 'things', fields: { name: 'Kiln Studio' } }];
  assert.equal(namesHeard({ name: null, rows }).business, 'Kiln Studio');
});

test('A NAME IS ONE THE DIRECTORY COULD HAND OUT: a letter first, no hyphen last, never a spoken id', () => {
  assert.deepEqual(recordNames({ person: null, business: '2 Kiln Studio!' }, ''), ['kiln-studio']);
  assert.deepEqual(recordNames({ person: 'D41', business: null }, ''), [], 'd41 opens decision 41');
  assert.deepEqual(recordNames({ person: 'A', business: null }, '9@example.com'), [], 'one letter, and an address with no letter');
  const long = recordNames({ person: null, business: 'The Very Long Name Of A Studio That Makes Pots' }, '')[0] ?? '';
  assert.ok(long.length <= 32 && !long.endsWith('-'), long);
});

test('THE FIRST FREE NAME IS CHOSEN, and a taken one tries -2 to -9 before giving up', async () => {
  assert.equal(await chooseName(['kiln-studio', 'sami'], directory([])), 'kiln-studio');
  assert.equal(await chooseName(['kiln-studio', 'sami'], directory(['kiln-studio'])), 'sami');
  assert.equal(await chooseName(['kiln-studio', 'sami'], directory(['kiln-studio', 'sami', 'kiln-studio-2'])), 'kiln-studio-3');
  const asked: string[] = [];
  const all = ['kiln', ...[2, 3, 4, 5, 6, 7, 8, 9].map((n) => `kiln-${n}`)];
  assert.equal(await chooseName(['kiln'], directory(all, asked)), null, 'every name is taken, and the person chooses one');
  assert.deepEqual(asked, all, 'it stops at -9');
  assert.equal(await chooseName([], directory([])), null);
  /* A HOST THAT DID NOT ANSWER IS NOT A NAME: the person is asked for one rather than given one nobody checked. */
  assert.equal(await chooseName(['kiln'], async () => ({ ok: false, kind: 'unreachable' })), null);
});

test('WHAT WAS SAID SURVIVES THE ROUND TRIP THROUGH THE MAIL, and only for the life of the link', () => {
  const tab = storage();
  const now = Date.UTC(2026, 9, 6, 9);
  keepSaid(tab, { said: 'Sami, I run Kiln Studio', currency: 'GBP', usecase: null }, now);
  /* THE TAB THE LINK OPENS reads it back, and builds what the first tab drew. */
  assert.deepEqual(saidKept(tab, now + 60_000), { said: 'Sami, I run Kiln Studio', currency: 'GBP', usecase: null });
  assert.equal(saidKept(tab, now + 27 * 60 * 60 * 1000), null, 'a sentence older than the link is not built');
  /* AN OLD SENTENCE IS REMOVED AS IT IS READ, so a shared device does not keep somebody's words for the next person. */
  assert.equal(tab.map.has(SAID_KEY), false);
  keepSaid(tab, { said: 'Sami, I run Kiln Studio', currency: 'GBP', usecase: null }, now);
  assert.equal(saidKept(tab, now - 60_000), null, 'one dated after this clock is not built');
  assert.equal(tab.map.has(SAID_KEY), false);
  keepSaid(tab, { said: 'Sami, I run Kiln Studio', currency: 'GBP', usecase: null }, now);
  /* FORGOTTEN once the record is made. */
  keepSaid(tab, null, now);
  assert.equal(tab.map.has(SAID_KEY), false);
  assert.equal(saidKept(tab, now), null);
});

test('THE SENTENCE KEPT IS THE WORDS ALONE, at most what the host keeps, and storage that throws keeps nothing', () => {
  const tab = storage();
  keepSaid(tab, { said: 'x'.repeat(SAID_MOST + 50), currency: null, usecase: 'founder' }, 1);
  const kept = JSON.parse(tab.map.get(SAID_KEY) ?? '{}') as Record<string, unknown>;
  assert.deepEqual(Object.keys(kept).sort(), ['at', 'currency', 'said', 'usecase']);
  assert.equal(String(kept.said).length, SAID_MOST);
  assert.equal(saidKept(tab, 2)?.usecase, 'founder');
  /* A BLANK SENTENCE IS NOTHING TO KEEP, and a broken one is nothing to read. */
  keepSaid(tab, { said: '   ', currency: null, usecase: null }, 1);
  assert.equal(tab.map.has(SAID_KEY), false);
  tab.setItem(SAID_KEY, '{not json');
  assert.equal(saidKept(tab, 2), null);
  assert.equal(tab.map.has(SAID_KEY), false, 'a broken sentence is removed too');
  const blocked = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('blocked');
    },
    removeItem: () => {
      throw new Error('blocked');
    },
  };
  assert.doesNotThrow(() => keepSaid(blocked, { said: 'hello', currency: null, usecase: null }));
  assert.equal(saidKept(blocked), null);
});

test('THE SENTENCE IS FORGOTTEN ONLY WHEN THE BUILD IS ALL IN, so a dropped line or a refusal can be tried again', () => {
  assert.equal(allWritten({ failed: [] }), true);
  assert.equal(allWritten({ failed: [{ said: 'Money was not added.', why: '' }] }), false);
  assert.equal(allWritten(null), false, 'nothing answered');
});

/** A host that answers one envelope, and remembers what it was sent. */
function host(answer: unknown, status = 200) {
  const sent: { url: string; body: Record<string, unknown> | null }[] = [];
  const io: Io = {
    fetch: async (url, init) => {
      sent.push({ url, body: typeof init.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null });
      return new Response(JSON.stringify(answer), { status, headers: { 'content-type': 'application/json' } });
    },
  };
  return { io, sent };
}

const CODE = 'c'.repeat(20) + '_-' + 'D'.repeat(21);

test('WHO MAY SIGN UP IS THE HOST\'S mode, and a host a release older that says only open is read the old way', async () => {
  for (const mode of ['open', 'invite', 'closed'] as const) {
    const out = await checkName('', host({ ok: true, value: { slug: '', free: false, mode, open: mode !== 'closed' } }).io);
    assert.ok(out.ok);
    assert.equal(out.ok && out.value.mode, mode);
    assert.equal(out.ok && out.value.open, mode !== 'closed');
  }
  const old = await checkName('', host({ ok: true, value: { slug: '', free: false, open: true } }).io);
  assert.equal(old.ok && old.value.mode, 'open');
  const shut = await checkName('', host({ ok: true, value: { slug: '', free: false } }).io);
  assert.equal(shut.ok && shut.value.mode, 'closed', 'a host that says nothing is closed');
});

test('AN INVITATION\'S CODE IS READ OFF THE ADDRESS AND WIPED, as a mailed link is, and kept for this tab only', () => {
  let wiped = 0;
  assert.deepEqual(arrivalOf(`#code=${CODE}`, () => (wiped += 1)), { kind: 'code', code: CODE });
  assert.equal(wiped, 1);
  /* A FRAGMENT THAT IS NOT A CODE IS NOT TAKEN, and the address is left as it was. */
  assert.equal(arrivalOf('#code=short', () => (wiped += 1)), null);
  assert.equal(wiped, 1);
  const tab = storage();
  keepCode(tab, CODE);
  assert.equal(tab.map.get(CODE_KEY), CODE);
  assert.ok(CODE_KEY.startsWith('braindog.signup'));
  assert.equal(codeKept(tab), CODE);
  keepCode(tab, 'not a code');
  assert.equal(codeKept(tab), null, 'anything but a code is not kept');
  keepCode(tab, CODE);
  keepCode(tab, null);
  assert.equal(tab.map.has(CODE_KEY), false);
  const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => { throw new Error('blocked'); } };
  assert.doesNotThrow(() => keepCode(blocked, CODE));
  assert.equal(codeKept(blocked), null);
});

test('THE CODE RIDES WITH THE START, and a refusal at code is the host\'s own sentence', async () => {
  const yes = host({ ok: true, value: {} });
  assert.deepEqual(await startSignup({ email: ' sami@example.com ', slug: 'kiln', code: CODE }, yes.io), { ok: true, value: null });
  assert.equal(yes.sent[0]?.url, '/auth/signup/start');
  assert.equal(yes.sent[0]?.body?.['code'], CODE);
  const none = host({ ok: true, value: {} });
  await startSignup({ email: 'sami@example.com', slug: 'kiln' }, none.io);
  assert.equal('code' in (none.sent[0]?.body ?? {}), false, 'no code is sent when there is none');
  const fix = 'Sign-up here is by invitation, so open the link you were sent to sign up.';
  const no = await startSignup({ email: 'sami@example.com', slug: 'kiln' }, host({ ok: false, refusal: { code: 'FORBIDDEN', fix, at: 'code' } }, 403).io);
  assert.deepEqual(no, { ok: false, kind: 'refused', fix, at: 'code' });
});

test('"MAKE IT AGAIN" WAITS ON THE ACCOUNT\'S OWN YES: canMake true only when the host says so', async () => {
  const said = await billing(host({ ok: true, value: { records: [], open: false, plans: [], canMake: true } }).io);
  assert.equal(said.ok && said.value.canMake, true);
  const silent = await billing(host({ ok: true, value: { records: [], open: false, plans: [] } }).io);
  assert.equal(silent.ok && silent.value.canMake, false, 'a host that did not say is a no');
});

test('THE INVITATION PAGE IS ONE PLAIN LINE, with no dash and no code to type', () => {
  for (const line of [words.inviteTitle, words.inviteWhy]) {
    assert.doesNotMatch(line, /[\u2013\u2014]/);
    assert.doesNotMatch(line, /\bcode\b/i, 'nobody types a code, so the page does not ask for one');
  }
});

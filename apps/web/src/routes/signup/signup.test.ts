/**
 * Describe-then-build's two promises on sign-up: the record is named from what was heard, and what was said survives the
 * round trip through the mail to the tab the link opens.
 *
 * AGAINST THE RULES THE PAGE READS WITH (`propose`), not a fixture of their answer, so a reading that stops hearing a
 * business stops naming the record after it here too.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { allWritten, chooseName, keepSaid, namesHeard, recordNames, SAID_KEY, SAID_MOST, saidKept, type Asked, type NameSeen } from '../../lib/signup.ts';
import { propose } from '../../lib/start/propose.ts';

const CTX = { zone: 'Europe/London', locale: 'en-GB' };

/** A Directory that has handed out these names and no others. */
const directory =
  (taken: readonly string[], asked: string[] = []) =>
  async (slug: string): Promise<Asked<NameSeen>> => {
    asked.push(slug);
    return { ok: true, value: { slug, free: !taken.includes(slug), why: null, open: true, turnstile: null } };
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

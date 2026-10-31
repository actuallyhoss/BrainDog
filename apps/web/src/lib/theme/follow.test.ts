/**
 * The person's look adopted from `boot`, once per tab, and nothing adopted for nobody.
 *
 * ONCE IS THE CASE THAT MATTERS. The root layout's load hands `draw` the kept `boot` on every navigation, so a second
 * adopt would put back the look as the tab opened over a scheme picked in Settings since.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as pref from '../pref.ts';
import { ACCENTS } from '../accent.ts';
import { follow, personOf, prefsOf, unstampedOf, whoOf } from './follow.ts';

function page(initial = '') {
  (globalThis as { document?: unknown }).document = {
    get cookie() {
      return initial;
    },
    set cookie(next: string) {
      initial = next.split(';')[0] ?? '';
    },
    documentElement: { setAttribute() {}, removeAttribute() {} },
  };
}

const boot = (prefs?: Record<string, unknown>) => ({ registers: [], me: prefs ? { person: 'p', prefs } : { person: 'p' } });

test('prefsOf reads me.prefs and nothing else', () => {
  assert.equal(prefsOf(null), undefined);
  assert.equal(prefsOf({ me: {} }), undefined);
  assert.equal(prefsOf({ me: { prefs: ['look.scheme'] } }), undefined);
  assert.deepEqual(prefsOf(boot({ 'look.scheme': 'dark' })), { 'look.scheme': 'dark' });
});

test('nobody signed in adopts nothing and sends nothing; a person is adopted once', async () => {
  page();
  const sent: string[] = [];
  const send: pref.Send = async (key) => (sent.push(key), { from: 'kept' });

  follow(boot(), send);
  follow(null, send);
  assert.equal(pref.follows(), false, 'a boot with no person in it started sending');

  follow(boot({ 'look.scheme': 'dark', 'look.accent': 'House' }), send);
  assert.equal(pref.read().scheme, 'dark');
  assert.equal(pref.follows(), true);

  pref.apply('scheme', 'light');
  follow(boot({ 'look.scheme': 'dark' }), send);
  assert.equal(pref.read().scheme, 'light', 'the kept boot put back the scheme the tab opened with');

  await pref.settled();
  assert.deepEqual(sent, ['look.scheme']);
  pref.follow(null);
});

/**
 * THE COOKIE'S LOOK IS STAMPED WITH WHOSE IT IS. `bd_pref` covers the whole
 * host and each record keeps its own `look.*`, so a second person on the same browser met the first person's look for
 * every key they had never set, and looks chosen before the record kept them were never sent to it.
 */

const at = (slug: string, person: string, prefs: Record<string, unknown>) => ({ registers: [], record: { slug }, me: { person, prefs } });

/** A record that keeps every look key, and what it was sent. */
function keeping() {
  const sent: [string, unknown][] = [];
  const send: pref.Send = async (key, value) => (sent.push([key, value]), { from: 'kept' });
  return { sent, send };
}

const cookie = (p: Record<string, unknown>) => `bd_pref=${encodeURIComponent(JSON.stringify(p))}`;

test('whoOf names the record and the person, and nothing for an answer with nobody in it', () => {
  assert.equal(whoOf(at('acme', 'p1', {})), 'acme/p1');
  /* A RECORD WITH NO NAME IS THE SHELL'S EMPTY SLUG, so Settings handing over `index.slug` names the same person. */
  assert.equal(whoOf({ me: { person: 'p1' } }), '/p1');
  assert.equal(whoOf({ record: null, me: { person: 'p1' } }), '/p1');
  assert.equal(whoOf({ me: { person: null } }), undefined);
  assert.equal(whoOf(null), undefined);
  assert.equal(personOf(at('acme', 'p1', {})), 'p1');
  assert.equal(personOf({ me: { person: '' } }), undefined);
});

test('THE SAME PERSON IN ANOTHER OF THEIR RECORDS KEEPS THEIR LOOK, and that record\'s words are adopted over it', async () => {
  page(cookie({ scheme: 'dark', density: 'compact', who: 'eve' }));
  const record = keeping();
  try {
    follow(at('acme', 'eve', {}), record.send);
    follow(at('north', 'eve', { 'look.density': 'roomy' }), record.send);
    const now = pref.read();
    assert.equal(now.scheme, 'dark', 'the scheme was taken off at a switch of record, a flash on every move');
    assert.equal(now.density, 'roomy', "the second record's own word was not adopted");
    assert.equal(now.who, 'eve');
    await pref.settled();
    assert.deepEqual(record.sent, []);
  } finally {
    pref.follow(null);
  }
});

test('SOMEBODY ELSE SIGNING IN STARTS FROM THE HOUSE LOOK and their own record, not the last person\'s', async () => {
  page(cookie({ scheme: 'dark', density: 'compact', contrast: true, who: 'ann', unsent: { 'look.scheme': 'dark' }, nav: ['/'] }));
  const record = keeping();
  try {
    follow(at('acme', 'bob', { 'look.size': 'md' }), record.send);
    const now = pref.read();
    assert.equal(now.scheme, undefined, "Ann's dark was left on Bob's screen");
    assert.equal(now.density, undefined);
    assert.equal(now.contrast, undefined);
    assert.equal(now.text, 'md', "Bob's own record was not adopted");
    assert.equal(now.who, 'bob');
    assert.deepEqual(now.nav, ['/'], 'a per-device setting went with the look');
    await pref.settled();
    assert.deepEqual(record.sent, [], "what Ann's device owed her record was sent to Bob's");
  } finally {
    pref.follow(null);
  }
});

test('A COOKIE FROM BEFORE THE STAMP IS SENT ONCE, only where the record has no word, then stamped', async () => {
  const [first] = ACCENTS;
  page(cookie({ scheme: 'dark', text: 'sm', theme: first!.hex }));
  const record = keeping();
  try {
    follow(at('north', 'cy', { 'look.size': 'md' }), record.send);
    /* THE RECORD'S WORD FOR THE SIZE WAS CHOSEN SINCE, so it wins and the old size is not sent over it. */
    assert.equal(pref.read().text, 'md');
    assert.equal(pref.read().scheme, 'dark');
    assert.equal(pref.read().who, 'cy');
    await pref.settled();
    assert.deepEqual(record.sent, [
      ['look.scheme', 'dark'],
      ['look.accent', first!.name],
    ]);
    assert.deepEqual(pref.unsent(), {});

    /* ONCE: the kept boot again sends nothing. */
    follow(at('north', 'cy', { 'look.size': 'md' }), record.send);
    await pref.settled();
    assert.equal(record.sent.length, 2);
  } finally {
    pref.follow(null);
  }
});

test('WHAT THE LAST BOOT COULD NOT SEND IS SENT BEFORE ADOPTING, and the record\'s older word does not undo it', async () => {
  page(cookie({ scheme: 'dark', who: 'di', unsent: { 'look.scheme': 'dark' } }));
  const record = keeping();
  try {
    follow(at('south', 'di', { 'look.scheme': 'light', 'look.density': 'roomy' }), record.send);
    assert.equal(pref.read().scheme, 'dark', 'the offline choice was undone on reload');
    assert.equal(pref.read().density, 'roomy');
    await pref.settled();
    assert.deepEqual(record.sent, [['look.scheme', 'dark']]);
    assert.deepEqual(pref.unsent(), {});
  } finally {
    pref.follow(null);
  }
});

test('unstampedOf leaves out a colour no swatch wears and a contrast left off', () => {
  assert.deepEqual(unstampedOf({ theme: '#123456', contrast: undefined, density: 'roomy' }, {}), { 'look.density': 'roomy' });
  assert.deepEqual(unstampedOf({ scheme: 'dark' }, { 'look.scheme': 'light' }), {});
});

test('THE THEME BUILDER IS NOT LOADED FOR A PAGE IN THE HOUSE COLOUR: follow imports no accent.ts', () => {
  const src = readFileSync(new URL('./follow.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /^import[^;]*from '\.\.\/accent\.ts';/mu, 'follow.ts pulls the theme builder onto every open again');
});

test('A SWATCH THE RECORD NAMES IS IN THE COOKIE AT ONCE, so the shell restores it and not the device’s older colour', async () => {
  const [first, second] = ACCENTS;
  page(cookie({ theme: first!.hex, who: 'fa' }));
  const record = keeping();
  try {
    follow(at('east', 'fa', { 'look.accent': second!.name }), record.send);
    assert.equal(pref.read().theme, second!.hex);
    follow(at('west', 'fa', { 'look.accent': 'House' }), record.send);
    assert.equal(pref.read().theme, undefined, 'House over a painted colour left the colour in the cookie');
    await pref.settled();
    assert.deepEqual(record.sent, []);
  } finally {
    pref.follow(null);
  }
});

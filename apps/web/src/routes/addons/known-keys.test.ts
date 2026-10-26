/**
 * The publisher keys a person has seen, on their record: the record answers, an older record falls back to the browser,
 * and what a browser kept is carried over once.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { capKnown, KEYS_MOST, keepKnown, KNOWN_KEYS, KNOWN_MOST, KNOWN_PREF, readKnown, recordKeys, type Call, type KeyStore } from './known-keys.ts';
import { keepFirstKey, trustFor, trustThisKey } from './catalogue.ts';

/* PUBLIC KEY IDS ONLY, made up here: sixteen hex characters, as a key id is. */
const OLD = 'a1b2c3d4e5f60718';
const NEXT = '0f1e2d3c4b5a6978';
const OTHER = '9988776655443322';

function memoryStore(): KeyStore & { held: Map<string, string> } {
  const held = new Map<string, string>();
  return { held, getItem: (k) => held.get(k) ?? null, setItem: (k, v) => void held.set(k, v), removeItem: (k) => void held.delete(k) };
}

/** A record that keeps prefs as `setPref` does, or an older one whose `PREF_KEYS` does not hold the key. */
function fakeRecord(opts: { older?: boolean; held?: unknown } = {}) {
  const prefs: Record<string, unknown> = opts.held === undefined ? {} : { [KNOWN_PREF]: opts.held };
  const calls: string[] = [];
  const call: Call = async (name, args) => {
    calls.push(name);
    if (name === 'boot') return { ok: true, value: { me: { prefs: { ...prefs } } } };
    if (name === 'setPref') {
      if (opts.older || args.key !== KNOWN_PREF) return { ok: false, refusal: { fix: 'key is one of nav.order or nav.hidden.', code: 'VALUE_MALFORMED' } };
      prefs[KNOWN_PREF] = args.value;
      return { ok: true, value: { key: args.key, value: args.value } };
    }
    return { ok: false, refusal: { fix: 'No such call.' } };
  };
  return { call, prefs, calls };
}

test('the record answers the keys it holds, and keeps them for every device', async () => {
  const record = fakeRecord({ held: { 'pack:reading-shelf': [OLD] } });
  const store = memoryStore();
  assert.deepEqual(await readKnown(record.call, store), { 'pack:reading-shelf': [OLD] });
  assert.equal(await keepKnown(record.call, { 'pack:reading-shelf': [OLD, NEXT] }, store), true);
  assert.deepEqual(record.prefs[KNOWN_PREF], { 'pack:reading-shelf': [OLD, NEXT] });
  assert.equal(store.held.has(KNOWN_KEYS), false);

  /* A SECOND BROWSER ON THE SAME RECORD reads the same trust, with nothing of its own. */
  const elsewhere = memoryStore();
  assert.equal((await trustFor(recordKeys(record.call, elsewhere), 'pack:reading-shelf', { alg: 'ed25519', key_id: NEXT, public_key: 'x', sig: 'x', signed_at: '2026-10-01T00:00:00Z' })).kind, 'known');
});

test('an older record refuses the key, and both read and keep fall back to the browser as before', async () => {
  const record = fakeRecord({ older: true });
  const store = memoryStore();
  store.setItem(KNOWN_KEYS, JSON.stringify({ 'pack:reading-shelf': [OLD] }));
  assert.deepEqual(await readKnown(record.call, store), { 'pack:reading-shelf': [OLD] });
  assert.equal(store.held.has(KNOWN_KEYS), true, 'the browser keeps its copy while the record cannot');
  assert.equal(await keepKnown(record.call, { 'pack:reading-shelf': [OLD, NEXT] }, store), true);
  assert.deepEqual(JSON.parse(store.held.get(KNOWN_KEYS)!), { 'pack:reading-shelf': [OLD, NEXT] });

  /* A record out of reach answers the browser's keys too, and a thrown call is not an error. */
  const unreachable: Call = async () => {
    throw new Error('offline');
  };
  assert.deepEqual(await readKnown(unreachable, store), { 'pack:reading-shelf': [OLD, NEXT] });
  assert.equal(await keepKnown(unreachable, {}, null), false);
});

test('what a browser kept is carried over to the record once, and cleared only when the record kept it', async () => {
  const record = fakeRecord({ held: { 'usecase:study-plan': [OTHER] } });
  const store = memoryStore();
  store.setItem(KNOWN_KEYS, JSON.stringify({ 'pack:reading-shelf': [OLD], 'usecase:study-plan': [OTHER, NEXT] }));
  const merged = { 'usecase:study-plan': [OTHER, NEXT], 'pack:reading-shelf': [OLD] };
  assert.deepEqual(await readKnown(record.call, store), merged);
  assert.deepEqual(record.prefs[KNOWN_PREF], merged);
  assert.equal(store.held.has(KNOWN_KEYS), false);
  assert.deepEqual(record.calls, ['boot', 'setPref']);

  record.calls.length = 0;
  assert.deepEqual(await readKnown(record.call, store), merged);
  assert.deepEqual(record.calls, ['boot'], 'nothing is carried over twice');
});

test('a full map is held to what the record takes, newest kept', () => {
  const many = Object.fromEntries(Array.from({ length: KNOWN_MOST + 5 }, (_, i) => [`pack:shelf-${i}`, [OLD]]));
  const capped = capKnown(many);
  assert.equal(Object.keys(capped).length, KNOWN_MOST);
  assert.ok(Object.hasOwn(capped, `pack:shelf-${KNOWN_MOST + 4}`) && !Object.hasOwn(capped, 'pack:shelf-0'));
  const keys = Array.from({ length: KEYS_MOST + 2 }, (_, i) => i.toString(16).padStart(16, '0'));
  assert.deepEqual(capKnown({ 'pack:reading-shelf': keys })['pack:reading-shelf'], keys.slice(-KEYS_MOST));
  assert.deepEqual(capKnown({ '': [OLD], [`pack:${'x'.repeat(300)}`]: [OLD], 'pack:reading-shelf': [OLD] }), { 'pack:reading-shelf': [OLD] }, 'a name the record refuses would hold back the rest');
});

test('a key kept after a read the record missed stays in the browser, and never writes over what the record holds', async () => {
  const record = fakeRecord({ held: { 'pack:reading-shelf': [OLD], 'usecase:study-plan': [OTHER] } });
  let down = true;
  const flaky: Call = (name, args) => (down && name === 'boot' ? Promise.reject(new Error('offline')) : record.call(name, args));
  const store = memoryStore();
  const keys = recordKeys(flaky, store);
  const signed = { alg: 'ed25519' as const, key_id: NEXT, public_key: 'x', sig: 'x', signed_at: '2026-10-01T00:00:00Z' };
  /* BOOT DOWN AND setPref UP: the read before the keep misses the record, and the keep must not write it whole. */
  const first = await trustFor(keys, 'pack:garden-log', signed);
  assert.equal(first.kind, 'first');
  assert.equal(await keepFirstKey(keys, 'pack:garden-log', first), true);
  down = false;
  assert.deepEqual(record.prefs[KNOWN_PREF], { 'pack:reading-shelf': [OLD], 'usecase:study-plan': [OTHER] }, 'the record still holds every publisher it had');
  assert.equal(record.calls.includes('setPref'), false);

  /* The next read that reaches the record carries the browser's key over beside the rest. */
  assert.deepEqual(await keys.read(), { 'pack:reading-shelf': [OLD], 'usecase:study-plan': [OTHER], 'pack:garden-log': [NEXT] });
  assert.deepEqual(record.prefs[KNOWN_PREF], { 'pack:reading-shelf': [OLD], 'usecase:study-plan': [OTHER], 'pack:garden-log': [NEXT] });
  assert.equal(store.held.has(KNOWN_KEYS), false);
});

test('a first key is kept on the record when asked for, and a changed one only on the person\'s press', async () => {
  const record = fakeRecord();
  const keys = recordKeys(record.call, memoryStore());
  const signed = (key_id: string) => ({ alg: 'ed25519' as const, key_id, public_key: 'x', sig: 'x', signed_at: '2026-10-01T00:00:00Z' });
  const first = await trustFor(keys, 'pack:reading-shelf', signed(OLD));
  assert.equal(first.kind, 'first');
  assert.equal(await keepFirstKey(keys, 'pack:reading-shelf', first), true);
  assert.deepEqual(record.prefs[KNOWN_PREF], { 'pack:reading-shelf': [OLD] });

  const changed = await trustFor(keys, 'pack:reading-shelf', signed(NEXT));
  assert.equal(changed.kind, 'changed');
  assert.equal(await keepFirstKey(keys, 'pack:reading-shelf', changed), false);
  assert.equal(await trustThisKey(keys, 'pack:reading-shelf', first), false, 'only a changed key is taken by the press');
  assert.equal(await trustThisKey(keys, 'pack:reading-shelf', changed), true);
  assert.deepEqual(record.prefs[KNOWN_PREF], { 'pack:reading-shelf': [OLD, NEXT] });
  assert.equal((await trustFor(keys, 'pack:reading-shelf', signed(NEXT))).kind, 'known');
});

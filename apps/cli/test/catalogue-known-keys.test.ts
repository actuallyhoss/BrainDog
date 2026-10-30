/**
 * Trust in a publisher is the record's in the terminal too: the keys the app's Browse keeps in the
 * record's `packs.known_keys` are read by the command line, a key first met here is kept there, and a machine with no
 * record to read keeps its own `known-keys.json` as before, said once. A key other than the one seen before is held back,
 * as Browse holds it, until `--trust-key`.
 *
 * The record is a stand-in: a function answering `boot` and `setPref` for the unit half, and a stub on node:http for the
 * install half. Every publisher is invented.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { hostKeys, keySource, knownKeysPath, KNOWN_PREF, pack, type PrefCall } from '../src/catalogue.ts';
import type { AgentIo } from '../src/skills.ts';

/* Obviously fake. */
const TOKEN = ['rec_01TESTTESTTESTTESTTESTTEST', 'stub-bearer-for-tests-only-44ab'].join('.');
const CONTEXT = { session: null, ambiguous: [], handoff: null, live: { same_repo: [], elsewhere: [] }, waiting: [], people: [], faded: 0, project: null, registers: [], next: '' };
const KEY_A = '0a1b2c3d4e5f6071';
const KEY_B = 'f1e2d3c4b5a69788';
const SIGNED_OUT = "Using this machine's list of publishers: not signed in.";

type Seen = { method: string; args: Record<string, unknown> };

/** A temp home and an io over it, with no host unless one is given. */
function home(t: { after: (fn: () => void) => void }, env: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-known-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const out: string[] = [];
  const said: string[] = [];
  const io: AgentIo = { env: { XDG_CONFIG_HOME: join(dir, 'config'), ...env }, cwd: dir, home: dir, out: (l) => void out.push(l), say: (l) => void said.push(l), headers: async () => ({}) };
  return { dir, io, out, said };
}

/** A stand-in record: `boot` answers `prefs` on `me`, or the refusal given; `setPref` keeps what it is sent, or refuses. */
function standIn(prefs: Record<string, unknown> | 'refuse' | 'token', setPref: 'keep' | 'refuse' = 'keep') {
  const seen: Seen[] = [];
  const held: Record<string, unknown> = typeof prefs === 'object' ? { ...prefs } : {};
  const call: PrefCall = async (method, args) => {
    seen.push({ method, args });
    if (method === 'boot') {
      if (prefs === 'refuse') return { ok: false, refusal: { code: 'FORBIDDEN', fix: 'This key may not read that.' } };
      return { ok: true, value: { me: prefs === 'token' ? { kind: 'token' } : { kind: 'person', prefs: { ...held } } } };
    }
    if (method === 'setPref' && setPref === 'keep') {
      held[String(args.key)] = args.value;
      return { ok: true, value: { key: args.key, value: args.value } };
    }
    return { ok: false, refusal: { code: 'FORBIDDEN', fix: 'What a rail shows belongs to a person, and a token is not one.' } };
  };
  return { call, seen, held };
}

const writeFile = (io: AgentIo, known: Record<string, string[]>) => {
  mkdirSync(join(io.env.XDG_CONFIG_HOME ?? '', 'braindog'), { recursive: true });
  writeFileSync(knownKeysPath(io), JSON.stringify(known));
};

test('signed in, the keys are read from the record, with this machine\'s folded in, and nothing is said', async (t) => {
  const h = home(t);
  writeFile(h.io, { 'pack:tidewater': [KEY_B] });
  const record = standIn({ [KNOWN_PREF]: { 'pack:lantern': [KEY_A], 'pack:bad': ['not a key id'] } });
  const source = await keySource(h.io, record.call);
  assert.equal(source.on, 'record');
  assert.deepEqual(source.known, { 'pack:lantern': [KEY_A], 'pack:bad': [], 'pack:tidewater': [KEY_B] });
  assert.deepEqual(h.said, []);
  assert.deepEqual(record.seen.map((s) => s.method), ['boot']);
});

test('a key first met in the terminal is written back to the record, public key ids only, and to this machine', async (t) => {
  const h = home(t);
  const record = standIn({ [KNOWN_PREF]: { 'pack:lantern': [KEY_A] } });
  const source = await keySource(h.io, record.call);
  await source.keep('pack:tidewater', KEY_B);
  const sent = record.seen.filter((s) => s.method === 'setPref');
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0]?.args, { key: KNOWN_PREF, value: { 'pack:lantern': [KEY_A], 'pack:tidewater': [KEY_B] } });
  assert.deepEqual(record.held[KNOWN_PREF], { 'pack:lantern': [KEY_A], 'pack:tidewater': [KEY_B] });
  assert.deepEqual(JSON.parse(readFileSync(knownKeysPath(h.io), 'utf8')), { 'pack:tidewater': [KEY_B] });
  assert.deepEqual(source.known['pack:tidewater'], [KEY_B]);
  /* Kept twice is sent once more and changes nothing. */
  await source.keep('pack:tidewater', KEY_B);
  assert.deepEqual(record.held[KNOWN_PREF], { 'pack:lantern': [KEY_A], 'pack:tidewater': [KEY_B] });
  assert.deepEqual(h.said, []);
});

test('signed out, this machine\'s file is read and kept exactly as before, said once in one line', async (t) => {
  const h = home(t);
  writeFile(h.io, { 'pack:lantern': [KEY_A] });
  const source = await keySource(h.io, null);
  assert.equal(source.on, 'machine');
  assert.deepEqual(source.known, { 'pack:lantern': [KEY_A] });
  await source.keep('pack:lantern', KEY_B);
  assert.deepEqual(JSON.parse(readFileSync(knownKeysPath(h.io), 'utf8')), { 'pack:lantern': [KEY_A, KEY_B] });
  assert.deepEqual(h.said, [SIGNED_OUT]);

  /* No host set is not signed in, and nothing is sent anywhere. */
  const bare = home(t);
  const viaHost = await hostKeys(undefined, bare.io);
  assert.equal(viaHost.on, 'machine');
  assert.deepEqual(bare.said, [SIGNED_OUT]);
});

test('a record that refuses, or gives no list to a token, falls back to this machine and is never written over', async (t) => {
  const h = home(t);
  writeFile(h.io, { 'pack:lantern': [KEY_A] });
  const refusing = standIn('refuse');
  const source = await keySource(h.io, refusing.call);
  assert.equal(source.on, 'machine');
  assert.deepEqual(source.known, { 'pack:lantern': [KEY_A] });
  await source.keep('pack:tidewater', KEY_B);
  assert.deepEqual(refusing.seen.map((s) => s.method), ['boot'], 'a map the record never gave was written to it');
  assert.deepEqual(h.said, ["Using this machine's list of publishers: the record did not give its list."]);

  const t2 = home(t);
  const token = standIn('token');
  assert.equal((await keySource(t2.io, token.call)).on, 'machine');
  assert.deepEqual(t2.said, ["Using this machine's list of publishers: the record does not give its list to the command line."]);

  const t3 = home(t);
  const gone: PrefCall = async () => {
    throw new Error('connection reset');
  };
  assert.equal((await keySource(t3.io, gone)).on, 'machine');
  assert.deepEqual(t3.said, ["Using this machine's list of publishers: the record did not answer."]);

  /* A host set with no login is refused at the door, and that is said as not signed in. */
  const t5 = home(t);
  const door: PrefCall = async () => ({ ok: false, refusal: { code: 'UNAUTHORIZED', fix: 'That did not sign you in.' } });
  assert.equal((await keySource(t5.io, door)).on, 'machine');
  assert.deepEqual(t5.said, [SIGNED_OUT]);

  /* Read, then refused on the write: this machine keeps it, and that is said once. */
  const t4 = home(t);
  const readOnly = standIn({}, 'refuse');
  const kept = await keySource(t4.io, readOnly.call);
  assert.equal(kept.on, 'record');
  await kept.keep('pack:lantern', KEY_A);
  await kept.keep('pack:tidewater', KEY_B);
  assert.deepEqual(JSON.parse(readFileSync(knownKeysPath(t4.io), 'utf8')), { 'pack:lantern': [KEY_A], 'pack:tidewater': [KEY_B] });
  assert.deepEqual(t4.said, ['The record did not keep this publisher key, so only this machine remembers it.']);
});

/* ── pack install against a stand-in record on node:http ─────────────────── */

/** A record answering `context`, `boot` (with `prefs` on `me`), `setPref` and `propose`, and a temp home signed in to it. */
async function signedIn(t: { after: (fn: () => void | Promise<void>) => void }, prefs: Record<string, unknown>) {
  const seen: Seen[] = [];
  const held: Record<string, unknown> = { ...prefs };
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const method = new URL(req.url ?? '/', 'http://stub').pathname.replace(/^\/api\//, '');
      const raw = Buffer.concat(chunks).toString('utf8');
      const args = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      seen.push({ method, args });
      res.writeHead(200, { 'content-type': 'application/json' });
      if (method === 'context') return res.end(JSON.stringify({ ok: true, value: CONTEXT }));
      if (method === 'boot') return res.end(JSON.stringify({ ok: true, value: { me: { kind: 'person', prefs: { ...held } } } }));
      if (method === 'setPref') {
        held[String(args.key)] = args.value;
        return res.end(JSON.stringify({ ok: true, value: { key: args.key, value: args.value } }));
      }
      if (method === 'propose') return res.end(JSON.stringify({ ok: true, value: { id: 'SG7' } }));
      res.end(JSON.stringify({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: `The stub does not answer ${method}.` } }));
    });
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  t.after(() => new Promise<void>((done) => server.close(() => done())));
  const h = home(t, { BRAINDOG_HOST: `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`, BRAINDOG_TOKEN: TOKEN });
  return { ...h, seen, held };
}

/** A signed add-on by an invented publisher in a catalogue folder, and the id of the key that signed it. */
async function published(h: { dir: string; io: AgentIo; said: string[] }): Promise<string> {
  const keys = join(h.dir, 'keys');
  assert.equal(await pack(['key', join(keys, 'orrin.json'), '--author', 'Orrin Vale'], h.io), 0, h.said.join('\n'));
  assert.equal(await pack(['new', 'lantern', '--author', 'Orrin Vale'], h.io), 0, h.said.join('\n'));
  assert.equal(await pack(['publish', 'lantern', '--to', 'catalogue', '--sign', join(keys, 'orrin.json')], h.io), 0, h.said.join('\n'));
  return (JSON.parse(readFileSync(join(keys, 'orrin.json'), 'utf8')) as { key_id: string }).key_id;
}

test('a key trusted in the app is known at install, and a key first met here is kept on the record', async (t) => {
  const known = await signedIn(t, {});
  const keyId = await published(known);
  known.held[KNOWN_PREF] = { 'pack:lantern': [keyId] };
  assert.equal(await pack(['install', 'lantern', '--from', 'catalogue'], known.io), 0, known.said.join('\n'));
  assert.ok(known.out.includes(`Signed by key ${keyId}, the key your BrainDog has seen for Orrin Vale before.`), known.out.join('\n'));
  assert.equal(known.seen.filter((s) => s.method === 'setPref').length, 0, 'a key already known was written again');
  assert.equal(existsSync(knownKeysPath(known.io)), false);

  const fresh = await signedIn(t, {});
  const freshId = await published(fresh);
  assert.equal(await pack(['install', 'lantern', '--from', 'catalogue'], fresh.io), 0, fresh.said.join('\n'));
  assert.ok(fresh.out.includes(`Signed by key ${freshId}. Your BrainDog has not seen a key for Orrin Vale before, so it now remembers this one.`), fresh.out.join('\n'));
  assert.deepEqual(fresh.held[KNOWN_PREF], { 'pack:lantern': [freshId] });
  assert.deepEqual(JSON.parse(readFileSync(knownKeysPath(fresh.io), 'utf8')), { 'pack:lantern': [freshId] });
  assert.deepEqual(fresh.seen.filter((s) => s.method === 'propose').length, 1);
  assert.ok(!fresh.said.some((l) => l.startsWith("Using this machine's list")), fresh.said.join('\n'));
});

test('a changed key is held back naming the publisher, until --trust-key keeps it beside the one seen before', async (t) => {
  const h = await signedIn(t, { [KNOWN_PREF]: { 'pack:lantern': [KEY_B] } });
  const keyId = await published(h);
  assert.equal(await pack(['install', 'lantern', '--from', 'catalogue'], h.io), 1);
  assert.equal(
    h.said.at(-1),
    `Lantern 1.0.0: Signed by key ${keyId}, which is not the key your BrainDog has seen for Orrin Vale before (${KEY_B}). Somebody else may have published it. It is not asked for. If Orrin Vale told you their key changed, run this again with --trust-key. Nothing was sent.`,
  );
  assert.equal(h.seen.filter((s) => s.method === 'propose' || s.method === 'setPref').length, 0);

  /* A dry run with the press still keeps nothing. */
  assert.equal(await pack(['install', 'lantern', '--from', 'catalogue', '--dry-run', '--trust-key'], h.io), 0, h.said.join('\n'));
  assert.equal(h.seen.filter((s) => s.method === 'propose' || s.method === 'setPref').length, 0);

  assert.equal(await pack(['install', 'lantern', '--from', 'catalogue', '--trust-key'], h.io), 0, h.said.join('\n'));
  assert.deepEqual(h.held[KNOWN_PREF], { 'pack:lantern': [KEY_B, keyId] });
  assert.equal(h.seen.filter((s) => s.method === 'propose').length, 1);
  assert.equal(await pack(['install', 'lantern', '--from', 'catalogue'], h.io), 0, h.said.join('\n'));
  assert.ok(h.out.includes(`Signed by key ${keyId}, the key your BrainDog has seen for Orrin Vale before.`), h.out.join('\n'));
});

test('signed out, install reads and keeps this machine\'s list as before, said once', async (t) => {
  const h = home(t);
  const keyId = await published(h);
  assert.equal(await pack(['install', 'lantern', '--from', 'catalogue', '--dry-run'], h.io), 0, h.said.join('\n'));
  assert.deepEqual(h.said.filter((l) => l === SIGNED_OUT).length, 1);
  assert.ok(h.out.includes(`Signed by key ${keyId}. This machine has not seen a key for Orrin Vale before, so it now remembers this one.`), h.out.join('\n'));
  assert.equal(existsSync(knownKeysPath(h.io)), false, 'a dry run remembered a key');
});

/**
 * The lived `default` profile as a copy of the canary: the file the weekly reset puts back with replace.
 *
 * WHY A FILE HAS TO BE MADE AND NOT ONLY EXPORTED. A replacing import puts a record back as itself and refuses any other
 * record's file (`kernel.import`, "REFUSED UNLESS THE FILE IS THIS RECORD"). The lived record is its own record, built
 * by `tools/gates/lived.mjs`, so its export is re-addressed to the canary before it goes: the canary's `record` row and
 * the identity half of its `dog_meta`, the canary's owner wherever the lived owner stood, and the canary's sealed bytes
 * if it holds any, since a replace that would throw keys away is refused. Every other row is the lived record's, which
 * is the point: the canary is put back to an untended record a week old, and nothing mended by hand survives.
 *
 * THEN IT IS MADE WHOLE AGAIN THE WAY AN EXPORT IS: each table's hash and count in `dog_manifest`, and a signature over
 * the manifest by a key made for this one file. The signature proves the file was not changed after it was made, which
 * is all an unpinned signature claims (`signatureOf` in `packages/kernel/src/brainl.ts`); it does not claim the canary's
 * host made it, and nothing here says it does. `checkBrainl`, the import's own check, reads it before it leaves.
 */

import { b64url, checkBrainl, keyIdOf, signBrainl } from '../../packages/kernel/src/index.ts';

/** The tables whose rows describe the file and are made here, never carried. */
const MADE = new Set(['dog_manifest', 'dog_sig']);

/** `dog_meta` keys that say which record a file is, taken from the canary. `format` stays the lived build's. */
const IDENTITY_META = new Set(['created_at', 'locale', 'record_id', 'record_name', 'record_slug', 'tz', 'keys']);

/** A file read as tables: `{ order, head, rows }`, each table's header line and its rows in file order. */
export function tablesOf(lines) {
  const order = [];
  const head = new Map();
  const rows = new Map();
  let at = null;
  for (const line of lines) {
    if (line.startsWith('#table ')) {
      at = line.slice('#table '.length).split(' ')[0];
      order.push(at);
      head.set(at, line);
      rows.set(at, []);
    } else if (at !== null && line.trim() !== '' && !line.startsWith('#')) rows.get(at).push(line);
  }
  return { order, head, rows, first: lines[0] };
}

const columnsOf = (t, name) => (t.head.get(name)?.slice(`#table ${name} `.length).split(' ')[0] ?? '').split(',');
const parsed = (t, name) => (t.rows.get(name) ?? []).map((l) => JSON.parse(l));

/** The record a file is and its owner: `{ id, slug, owner }`, read by column name, or a throw saying what is missing. */
export function identityOf(lines) {
  const t = tablesOf(lines);
  const rc = columnsOf(t, 'record');
  const record = parsed(t, 'record')[0];
  if (!Array.isArray(record)) throw new Error('The file carries no record row, so it cannot say which record it is.');
  const mc = columnsOf(t, 'member');
  const owner = parsed(t, 'member').find((m) => m[mc.indexOf('register')] === '*' && m[mc.indexOf('level')] === 'owner');
  if (owner === undefined) throw new Error('The file names no owner of the whole record.');
  return { id: record[rc.indexOf('id')], slug: record[rc.indexOf('slug')], owner: owner[mc.indexOf('person_id')] };
}

/**
 * The lived file re-addressed to the canary, unsigned and unhashed: `lived` and `canary` are both export lines. The
 * canary's owner takes the lived owner's place by its id, written as a JSON string, so a value that merely contains
 * those letters is untouched.
 */
export function readdress(lived, canary) {
  const from = identityOf(lived);
  const to = identityOf(canary);
  const L = tablesOf(lived);
  const C = tablesOf(canary);
  const ownerFrom = JSON.stringify(from.owner);
  const ownerTo = JSON.stringify(to.owner);
  const out = [L.first];
  for (const name of L.order) {
    out.push(L.head.get(name));
    if (MADE.has(name)) continue;
    let rows = L.rows.get(name);
    if (name === 'record') rows = byColumns(C, L, 'record');
    else if (name === 'dog_meta') rows = meta(L, C);
    else if (name === 'vault_key' && (C.rows.get('vault_key') ?? []).length > 0) rows = byColumns(C, L, 'vault_key');
    else if (name === 'grant') rows = [...rows, ...byColumns(C, L, 'grant').filter((r) => sealed(L, r))];
    else if (name === 'person') {
      const pc = columnsOf(L, 'person');
      const theirs = byColumns(C, L, 'person').find((r) => JSON.parse(r)[pc.indexOf('id')] === to.owner);
      rows = rows.filter((r) => JSON.parse(r)[pc.indexOf('id')] !== from.owner);
      if (theirs !== undefined) rows = [theirs, ...rows];
    }
    out.push(...rows.map((r) => (name === 'record' || name === 'dog_meta' ? r : r.split(ownerFrom).join(ownerTo))));
  }
  return out;
}

/** The canary's rows of a table, laid out in the lived file's columns, a column the canary lacks read as null. */
function byColumns(C, L, name) {
  const theirs = columnsOf(C, name);
  return parsed(C, name).map((row) => JSON.stringify(columnsOf(L, name).map((c) => (theirs.includes(c) ? row[theirs.indexOf(c)] : null))));
}

/** A grant row that carries sealed bytes. */
function sealed(L, row) {
  const at = columnsOf(L, 'grant').indexOf('ciphertext');
  return at >= 0 && JSON.parse(row)[at] !== null;
}

/** The lived `dog_meta` with the canary's identity keys in it. */
function meta(L, C) {
  const ours = new Map(parsed(C, 'dog_meta').map(([k, v]) => [k, v]));
  return parsed(L, 'dog_meta').map(([k, v]) => JSON.stringify([k, IDENTITY_META.has(k) && ours.has(k) ? ours.get(k) : v]));
}

async function sha256(text) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** `dog_manifest` made again over the file as it now is, in table order, as the exporter writes it. */
export async function manifest(lines) {
  const t = tablesOf(lines);
  const sums = [];
  for (const name of [...t.order].sort()) {
    if (MADE.has(name)) continue;
    const rows = t.rows.get(name);
    sums.push(JSON.stringify([name, rows.length, await sha256(rows.join('\n'))]));
  }
  const out = [];
  for (const line of lines) {
    out.push(line);
    if (line.startsWith('#table dog_manifest ')) out.push(...sums);
  }
  return out;
}

/** A signature over the manifest by a key made for this file alone, in the shape `signBrainl` puts on an export. */
export async function signOnce(lines) {
  const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const publicKey = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  return signBrainl(lines, async (bytes) => ({
    keyId: await keyIdOf(publicKey),
    publicKey: b64url(publicKey),
    sig: b64url(new Uint8Array(await crypto.subtle.sign('Ed25519', pair.privateKey, bytes))),
    signedAt: new Date().toISOString(),
  }));
}

/** The whole of it: re-addressed, hashed, signed, and checked by the import's own check, or a throw in its words. */
export async function canaryCopy(lived, canary) {
  const lines = await signOnce(await manifest(readdress(lived, canary)));
  const checked = await checkBrainl(lines);
  if (!checked.ok) throw new Error(`The copy made for the canary does not pass the import's own check: ${checked.refusal.fix}`);
  return lines;
}

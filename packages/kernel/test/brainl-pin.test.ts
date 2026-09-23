/**
 * A file checked against a key somebody named, not only against the key it carries.
 *
 * THE FORGERY BELOW PASSED `checkBrainl` AT `b7409d2d`, and that is what this file is for.
 * `loop/research-restore.md` §3.5 measured it on a real Cloud copy: one row edited, that table's
 * manifest hash recomputed, the old `dog_sig` row removed, and the file signed again by a stranger's
 * fresh Ed25519 key. `checkBrainl` answered `{"ok":true}` and the file imported. That is `03 §4`'s
 * narrow claim working as written, because the key inside a file proves only that nothing changed
 * since that key signed it. Which key it had to be is a fact from outside the file, and `48 §5.6`
 * gives it the one place it can come in: `--key`, which reaches the kernel as `{ key }`.
 *
 * SO THE SAME FORGERY IS RUN TWICE. Unpinned it still opens, and says so (`pinned: false`), because
 * refusing it there would claim a check nothing made. Pinned to the record's own key it is refused at
 * `dog_sig.key_id`, which is the part of the file that names the wrong key.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { b64url, checkBrainl, keyIdOf, openRecord, signBrainl } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';
import { testSigner } from './signer.ts';

const NOW = Date.UTC(2026, 8, 23, 3, 17);

/** A signed export of a record holding what `openRecord` writes and one `record` row, and the key it was signed by. */
async function exported(): Promise<{ lines: string[]; key: string }> {
  const signer = testSigner();
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW), { sign: signer });
  /* THE ROW §3.5 EDITED. `openRecord` writes none, and a record `createRecord` made always has one. */
  sql.exec(
    'INSERT INTO record (singleton, id, slug, name, locale, tz, format_ver, created_at) VALUES (1, ?, ?, ?, ?, ?, 1, ?)',
    'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', 'the-studio', 'The Studio', 'en', 'UTC', '2026-09-23T03:17:00.000Z',
  );
  const out = (await k.export()) as { ok: boolean; value?: string[] };
  assert.ok(out.ok, JSON.stringify(out));
  sql.close();
  return { lines: out.value!, key: b64url(await signer.publicKey) };
}

/**
 * §3.5's forgery, step for step: one row of `table` changed, that table's manifest row recomputed
 * the way the exporter computes it, the signature row dropped, and the file signed again by `signer`.
 * What an author with a text editor and a key of their own can make.
 */
async function forged(lines: readonly string[], table: string, from: string, to: string, signer = testSigner()): Promise<string[]> {
  const header = lines.findIndex((l) => l.startsWith(`#table ${table} `));
  assert.ok(header > 0, `no ${table} block to edit`);
  const out = [...lines];
  const row = out.findIndex((l, i) => i > header && l.includes(JSON.stringify(from)));
  assert.ok(row > header && !out.slice(header + 1, row).some((l) => l.startsWith('#')), `no ${table} row holds ${from}`);
  out[row] = out[row]!.replace(JSON.stringify(from), JSON.stringify(to));

  let end = header + 1;
  while (end < out.length && !out[end]!.startsWith('#')) end += 1;
  const rows = out.slice(header + 1, end);
  const sha = createHash('sha256').update(rows.join('\n')).digest('hex');
  /* INSIDE `dog_manifest` ONLY: `dog_section` comes first and carries a row that starts the same way. */
  const manifest = out.findIndex((l) => l.startsWith('#table dog_manifest '));
  const at = out.findIndex((l, i) => i > manifest && l.startsWith(`["${table}",`));
  assert.ok(at > 0, `no manifest row for ${table}`);
  out[at] = JSON.stringify([table, rows.length, sha]);

  const sig = out.findIndex((l) => l.startsWith('#table dog_sig '));
  return signBrainl(
    out.filter((_, i) => i !== sig + 1),
    signer,
  );
}

test('A FILE PINNED TO THE KEY THAT SIGNED IT OPENS, AND SAYS IT WAS PINNED', async () => {
  const { lines, key } = await exported();
  assert.deepEqual(await checkBrainl(lines, { key }), { ok: true, pinned: true });
  /* WITHOUT A KEY THE ANSWER IS STILL YES, and it says whose word that is: the file's own. */
  assert.deepEqual(await checkBrainl(lines), { ok: true, pinned: false });
});

test('§3.5 FORGERY: A ROW EDITED AND RE-SIGNED BY A STRANGER OPENS UNPINNED, AND IS REFUSED AT dog_sig.key_id PINNED', async () => {
  const { lines, key } = await exported();
  const fake = await forged(lines, 'record', 'The Studio', 'The Forgery');

  const pinned = await checkBrainl(fake, { key });
  assert.equal(pinned.ok, false, 'a file signed by a stranger opened against the key it was pinned to');
  const refusal = (pinned as { refusal: { code: string; at?: string; fix: string } }).refusal;
  assert.equal(refusal.code, 'SIGNATURE_INVALID');
  assert.equal(refusal.at, 'dog_sig.key_id');

  /* The measured fact at `b7409d2d`, kept true on purpose: the file's own key proves integrity only. */
  assert.deepEqual(await checkBrainl(fake), { ok: true, pinned: false });

  /* THE SENTENCE NAMES BOTH KEYS BY ID, because the two repairs are different: a key that rotated
     means fetching the new one, and a key nobody recognises means the file came from somewhere else. */
  const theirs = lines.find((l) => l.startsWith('["ed25519",'))!;
  const signedBy = (JSON.parse(fake.find((l) => l.startsWith('["ed25519",'))!) as string[])[1]!;
  assert.notEqual(signedBy, (JSON.parse(theirs) as string[])[1]);
  assert.match(refusal.fix, new RegExp(signedBy));
  const wanted = await keyIdOf(new Uint8Array(Buffer.from(key, 'base64url')));
  assert.match(refusal.fix, new RegExp(wanted));
});

test('THE PIN DECIDES AND NOT A LIST: the forgery pinned to the key that signed it opens, pinned', async () => {
  /* A pin is a claim about who wrote the file, not a stamp of approval: pinned to the stranger's own
     key, the stranger's file is exactly what it says it is. */
  const { lines } = await exported();
  const stranger = testSigner();
  const fake = await forged(lines, 'record', 'The Studio', 'The Forgery', stranger);
  assert.deepEqual(await checkBrainl(fake, { key: b64url(await stranger.publicKey) }), { ok: true, pinned: true });
});

test('A PIN NEVER RESCUES A DAMAGED OR UNSIGNED FILE: the cheaper refusal still answers first', async () => {
  const { lines, key } = await exported();
  const row = lines.findIndex((l) => l.includes('"The Studio"'));
  const bent = [...lines];
  bent[row] = bent[row]!.replace('The Studio', 'The Studi0');
  const damaged = (await checkBrainl(bent, { key })) as { ok: boolean; refusal?: { code: string } };
  assert.equal(damaged.refusal?.code, 'CHECKSUM_MISMATCH');

  const sig = lines.findIndex((l) => l.startsWith('#table dog_sig '));
  const bare = (await checkBrainl(
    lines.filter((_, i) => i !== sig + 1),
    { key },
  )) as { ok: boolean; refusal?: { code: string; fix: string } };
  assert.equal(bare.refusal?.code, 'SIGNATURE_INVALID');
  assert.match(bare.refusal?.fix ?? '', /no signature/);
});

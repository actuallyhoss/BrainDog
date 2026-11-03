/**
 * `arrived` names an add-on as Add-ons does: an add-on whose manifest carries no title was said
 * by its id with the dashes as spaces ("Bank hsbc eg"), while Add-ons listed it under the catalogue's title. The
 * manifest's title comes first, then the catalogue's, and only with neither the id said as words.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi } from '../src/index.ts';
import { readArrivedSign, type RecordSignsDeps } from '../src/signs.ts';
import type { CatalogueOffer } from '../src/slash.ts';
import { fixedClock, openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';

const DAY = 86_400_000;
const NIGHT = Date.UTC(2026, 10, 3, 0, 5);

function install(sql: NodeSql, id: string, version: string, title?: string): void {
  sql.exec(
    "INSERT OR REPLACE INTO pack (id, version, source, manifest, installed_at, checksum) VALUES (?, ?, 'kennel', ?, '2026-10-01T00:00:00.000Z', 'x')",
    id,
    version,
    JSON.stringify(title === undefined ? { pack: id, version } : { pack: id, version, title }),
  );
}

const offering = (to: string, title: string): NonNullable<RecordSignsDeps['offers']> => async (held) =>
  held.map((h): CatalogueOffer => ({ id: h.id, title, from: h.version, to, body: {}, signedBy: null, installedSignedBy: null, rotated: false, hostsAdded: [], removed: [], changesKnown: true }));

test('AN ADD-ON WITH NO TITLE OF ITS OWN is named by the catalogue, as Add-ons names it, never by its id', async () => {
  const sql = openSqlite();
  const clock = fixedClock(NIGHT);
  const api = await createRecordApi({ sql, clock });
  install(sql, 'bank-tern-ny', '1.2.0');
  const offers = offering('1.4.0', 'Tern Bank alerts');
  await readArrivedSign(api.kernel, { sql, offers }, clock.now());
  clock.advance(2 * DAY);
  const r = await readArrivedSign(api.kernel, { sql, offers }, clock.now());
  assert.equal(r.state, 'red');
  assert.equal(r.said, 'Tern Bank alerts has had version 1.4.0 waiting since 3 November. Updating it on Plugins turns it on.');
  assert.doesNotMatch(r.said, /tern ny/iu);
});

test('THE MANIFEST’S OWN TITLE still comes first, and with no title anywhere the id is said as words', async () => {
  const sql = openSqlite();
  const clock = fixedClock(NIGHT);
  const api = await createRecordApi({ sql, clock });
  install(sql, 'garden-log', '2.0.0', 'Garden log');
  install(sql, 'bird-count', '1.0.0');
  const offers: NonNullable<RecordSignsDeps['offers']> = async (held) =>
    held.map((h): CatalogueOffer => ({ id: h.id, title: h.id === 'garden-log' ? 'Something else' : '', from: h.version, to: '9.9.9', body: {}, signedBy: null, installedSignedBy: null, rotated: false, hostsAdded: [], removed: [], changesKnown: true }));
  const r = await readArrivedSign(api.kernel, { sql, offers }, clock.now());
  assert.deepEqual(r.facts?.slice().sort(), ['Bird count has had version 9.9.9 waiting since 3 November.', 'Garden log has had version 9.9.9 waiting since 3 November.']);
});

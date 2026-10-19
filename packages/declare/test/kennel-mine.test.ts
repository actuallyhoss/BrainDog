/**
 * What a publisher reads of their own submissions (`mineIn`): waiting, listed, declined with the operator's reason, and
 * taken back, for the key or the person asking and nobody else. The state is built by hand; the add-ons are invented.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { CatalogueEntry, CatalogueIndex, CatalogueVersion } from '../src/catalogue.ts';
import { emptyReview, kennelAsk, mineIn, readMine, type Pending, type Review } from '../src/kennel.ts';

const AT = '2026-10-01T09:00:00Z';
const REACH = { modules: [], lists: [], pages: [], rules: [], examples: 0, skills: [], calls_out: [] };
const version = (v: string, extra: Partial<CatalogueVersion> = {}): CatalogueVersion => ({ version: v, checksum: 'a'.repeat(64), bytes: 10, published_at: AT, bump: null, reach: REACH, ...extra });
const MINE = { kind: 'key' as const, id: 'key-mine', name: 'Me' };
const entry = (id: string, versions: CatalogueVersion[], publisher = MINE): CatalogueEntry => ({
  kind: 'pack',
  id,
  title: id.toUpperCase(),
  summary: `${id} does a thing`,
  author: 'Me',
  license: 'MIT',
  audience: 'addon',
  latest: versions[0]?.version ?? '1.0.0',
  versions,
  publisher,
});
const index = (entries: CatalogueEntry[]): CatalogueIndex => ({ format: 1, name: 'Kennel', entries });
const pending = (id: string, v: string, publisher = MINE): Pending => ({ entry: { ...entry(id, [], publisher), kind: 'pack' } as Pending['entry'], version: version(v), submitted_at: '2026-10-05T09:00:00Z' });
const refused = (id: string, v: string, reason: string, publisher = MINE): Review['refused'][number] => ({ kind: 'pack', id, version: v, publisher, reason, at: '2026-10-03T09:00:00Z' });

test('each of my submissions is told in its state, and the operator\'s reason comes with a decline', () => {
  const review: Review = { ...emptyReview(), pending: [pending('rota', '1.1.0')], refused: [refused('tide', '1.0.0', 'The page reads a list it never makes.')] };
  const idx = index([entry('rota', [version('1.0.0', { reviewed: AT })]), entry('gone', [version('1.0.0', { yanked: { reason: 'Taken back.', at: '2026-10-02T09:00:00Z' } })])]);
  const rows = mineIn({ index: idx, review }, { keys: ['key-mine'], person: null });
  assert.deepEqual(
    rows.map((r) => [r.id, r.version, r.state, r.reason ?? null]),
    [
      ['rota', '1.1.0', 'waiting', null],
      ['tide', '1.0.0', 'declined', 'The page reads a list it never makes.'],
      ['gone', '1.0.0', 'unpublished', 'Taken back.'],
      ['rota', '1.0.0', 'listed', null],
    ],
  );
});

test('only the asker\'s own are told: another key, and a person who is not the publisher, read nothing', () => {
  const review: Review = { ...emptyReview(), refused: [refused('tide', '1.0.0', 'No.')] };
  const idx = index([entry('rota', [version('1.0.0')])]);
  assert.deepEqual(mineIn({ index: idx, review }, { keys: ['key-other'], person: 'p_other' }), []);
  assert.deepEqual(mineIn({ index: idx, review }, { keys: [], person: null }), []);
  const byPerson = { kind: 'person' as const, id: 'p_me', name: 'Me' };
  const theirs = mineIn({ index: index([entry('rota', [version('1.0.0')], byPerson)]), review: emptyReview() }, { keys: [], person: 'p_me' });
  assert.deepEqual(theirs.map((r) => r.state), ['listed']);
});

test('a decline the publisher has since answered with a later version is not shown beside it', () => {
  const review: Review = { ...emptyReview(), pending: [pending('tide', '1.0.1')], refused: [refused('tide', '1.0.0', 'No.')] };
  const rows = mineIn({ index: index([]), review }, { keys: ['key-mine'], person: null });
  assert.deepEqual(rows.map((r) => [r.version, r.state]), [['1.0.1', 'waiting']]);
  const again: Review = { ...emptyReview(), pending: [pending('tide', '1.0.0')], refused: [refused('tide', '1.0.0', 'No.')] };
  assert.deepEqual(mineIn({ index: index([]), review: again }, { keys: ['key-mine'], person: null }).map((r) => r.state), ['waiting']);
});

test('the ask is a POST to mine, and its body is read whole or refused', () => {
  assert.deepEqual(kennelAsk('POST', '/api/kennel/v1/mine'), { ask: 'mine' });
  assert.deepEqual(kennelAsk('GET', '/api/kennel/v1/mine'), { wrong: 'method', allow: 'POST' });
  assert.equal(readMine({}).ok, true);
  assert.equal(readMine({ signature: 'x' }).ok, false);
  assert.equal(readMine([1]).ok, false);
});

/**
 * A file's declarations against what an install would take: an id becomes SQL, so one that is not an id is refused at
 * the import, as it is at an install, and nothing of the file is written.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';
import { testSigner } from './signer.ts';

const NOW = Date.UTC(2026, 8, 5, 12);
const THINGS: Declaration = {
  id: 'register.things',
  kind: 'register',
  body: {
    id: 'things',
    name: 'Things',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'code', type: 'text', unique: true },
    ],
  } as never,
};
const NOT_AN_ID = "code') OR 1=1 OR ('1";

test('A FILE WHOSE LIST NAMES A FIELD WITH SOMETHING THAT IS NOT AN ID IS REFUSED, and the record it was imported into stays empty', async () => {
  const src = openSqlite();
  const from = await openRecord(src, fixedClock(NOW), { sign: testSigner() });
  assert.ok((await from.install([THINGS])).ok);
  /* EDITED IN THE MAKER'S OWN FILE AND SIGNED BY THEIR OWN KEY, as a file handed over could be. */
  src.exec(`UPDATE declaration SET body = replace(body, '"id":"code"', '"id":' || json_quote(?)) WHERE id = 'register.things'`, NOT_AN_ID);
  const file = await from.export();
  assert.ok(file.ok, JSON.stringify(file));

  const dst = openSqlite();
  const into = await openRecord(dst, fixedClock(NOW));
  const out = await into.import(file.value);
  assert.equal(out.ok, false, 'the file was imported');
  assert.equal(!out.ok && 'refusal' in out ? out.refusal.code : '', 'DECLARATION_INVALID');
  assert.equal(dst.one<{ n: number }>("SELECT count(*) AS n FROM declaration WHERE id = 'register.things'")?.n, 0, 'the declaration was written anyway');

  /* AND THE SAME FILE UNTOUCHED STILL IMPORTS. */
  const clean = openSqlite();
  const maker = await openRecord(clean, fixedClock(NOW), { sign: testSigner() });
  assert.ok((await maker.install([THINGS])).ok);
  const good = await maker.export();
  assert.ok(good.ok);
  const fresh = await openRecord(openSqlite(), fixedClock(NOW));
  const took = await fresh.import(good.value);
  assert.ok(took.ok, JSON.stringify(took));
});

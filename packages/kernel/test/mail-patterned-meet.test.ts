/**
 * Senders of patterned mail are met (scope B36): before, only mail no pattern took met anybody, so the people his
 * patterns read every day were nobody in People. Now verified mail a pattern took meets its sender once, untrusted,
 * with where it was seen; unverified mail, a skip and a redelivery meet nobody.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Entry, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 24, 9);

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const PROJECTS: Declaration = {
  id: 'register.things',
  kind: 'register',
  body: { id: 'things', name: 'Projects', title: 'name', scopes: { repos: 'repos' }, fields: [{ id: 'name', type: 'text', required: true }, { id: 'repos', type: 'list', of: 'text' }] },
};

const PEOPLE: Declaration = {
  id: 'register.people',
  kind: 'register',
  body: {
    id: 'people',
    name: 'People',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'email', type: 'email', unique: true, index: true },
      { id: 'handles', type: 'list', of: 'text' },
      { id: 'projects', type: 'list', of: 'ref', to: 'things', scope: { links: true } },
      { id: 'met', type: 'list', of: 'text' },
      { id: 'merged_into', type: 'ref', to: 'people' },
    ],
  },
};

const NOTES: Declaration = {
  id: 'register.notes',
  kind: 'register',
  body: { id: 'notes', name: 'Notes', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never,
};

const DOOR: Declaration = {
  id: 'ingest.studio-invoices',
  kind: 'ingest',
  body: {
    ingest: 'studio-invoices',
    channel: 'email',
    match: { all: [{ field: 'body', contains: 'Invoice' }] },
    extract: { what: { text: { between: ['Invoice ', ' is'] } } },
    writes: { register: 'notes', confidence: 'exact' },
  } as never,
};

async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  value(await k.install([PROJECTS, PEOPLE, NOTES, DOOR]));
  return { k, sql };
}

const people = (k: Kernel) => value<{ rows: Entry[] }>(k.list({ register: 'people', limit: 50 })).rows;

let sent = 0;
const mail = (k: Kernel, from: string, body: string, more: { verified?: boolean; sha?: string } = {}) =>
  value<{ state: string; redelivered?: boolean }>(
    k.arrive({ channel: 'email', headers: { From: from, Subject: 'Your invoice' }, body, sha256: more.sha ?? `patterned-${String((sent += 1))}`, ...(more.verified === undefined ? {} : { verified: more.verified }) }),
  );

test('PATTERNED MAIL FROM A NEW ADDRESS ADDS ONE PERSON, with where they were seen', async () => {
  const { k, sql } = await record();
  const got = mail(k, 'Bea Arthur <bea@studio.example>', 'Invoice 2026-041 is attached.');
  assert.equal(got.state, 'matched');
  const met = people(k);
  assert.equal(met.length, 1, JSON.stringify(met.map((p) => p.fields)));
  assert.equal(met[0]!.fields.email, 'bea@studio.example');
  assert.match(JSON.stringify(met[0]!.fields.met), /mail from studio\.example/u, 'where they were seen is kept');

  /* THE SAME SENDER AGAIN IS THE SAME PERSON. */
  mail(k, 'Bea Arthur <bea@studio.example>', 'Invoice 2026-042 is attached.');
  assert.equal(people(k).length, 1);
  sql.close();
});

test('UNVERIFIED MAIL AND A REDELIVERY MEET NOBODY', async () => {
  const { k, sql } = await record();
  mail(k, 'Cy Twombly <cy@else.example>', 'Invoice 7 is attached.', { verified: false });
  assert.equal(people(k).length, 0, 'unverified');
  mail(k, 'Dee Dee <dee@else.example>', 'Invoice 8 is attached.', { sha: 'twice' });
  const lines = () => JSON.stringify(people(k)[0]?.fields.met ?? []);
  const before = lines();
  assert.equal(people(k).length, 1);
  const again = mail(k, 'Dee Dee <dee@else.example>', 'Invoice 8 is attached.', { sha: 'twice' });
  assert.equal(again.redelivered, true);
  assert.equal(lines(), before, 'a redelivery adds no line');
  sql.close();
});

/**
 * `only: 'known'` (batch 20, seed's ask): a rule that meets whoever writes in may say it wants nobody new from the mail.
 * Then a sender is written only when the record has reason to know them: a key somebody holds, an address at a domain
 * an organisation the record keeps holds, or an address the record's own person has written to in a verified mail.
 * Anybody else is a mention: no row, no fold, no key carried.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Entry, type Kernel, type Met, type WriteContext } from '../src/index.ts';
import { UNVERIFIED } from '../src/ingest.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 6, 12);

const PROJECTS: Declaration = {
  id: 'register.things',
  kind: 'register',
  body: { id: 'things', name: 'Projects', title: 'name', scopes: { repos: 'repos' }, fields: [{ id: 'name', type: 'text', required: true }, { id: 'repos', type: 'list', of: 'text' }] },
};

const ORGS: Declaration = {
  id: 'register.organisations',
  kind: 'register',
  body: {
    id: 'organisations',
    name: 'Organisations',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'domain', type: 'text' },
      { id: 'keys', type: 'list', of: 'text' },
      { id: 'merged_into', type: 'ref', to: 'organisations' },
    ],
  },
};

const PEOPLE: Declaration = {
  id: 'register.people',
  kind: 'register',
  body: {
    id: 'people',
    name: 'People',
    title: 'name',
    meets: { name: 'name', email: 'email', handles: 'handles', projects: 'projects', met: 'met', merged_into: 'merged_into', keys: 'keys', org: 'org', aliases: 'aliases', self: 'self' },
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'email', type: 'email', unique: true, index: true },
      { id: 'handles', type: 'list', of: 'text' },
      { id: 'keys', type: 'list', of: 'text' },
      { id: 'aliases', type: 'list', of: 'text' },
      { id: 'self', type: 'bool' },
      { id: 'org', type: 'ref', to: 'organisations' },
      { id: 'projects', type: 'list', of: 'ref', to: 'things' },
      { id: 'met', type: 'list', of: 'text' },
      { id: 'merged_into', type: 'ref', to: 'people' },
    ],
  },
};

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const OWNER: WriteContext = { actor: 'p_owner' };
const RULE: WriteContext = { actor: 'rule:meet-senders' };

/** What a rule meeting a sender says, as `rule.meet-senders` would with `only: 'known'`. */
const sender = (email: string, name?: string) => ({ ...(name === undefined ? {} : { name }), email, source: 'mail from a sender', only: 'known' as const, untrusted: true });

async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  value(await k.install([PROJECTS, ORGS, PEOPLE]));
  value(k.create('people', { name: 'Kas', email: 'kas@kas.example', self: true }, OWNER));
  return { k, sql };
}

/** A mail that reached the record, from `from` to `to`, verified unless said otherwise. */
let mails = 0;
function mail(sql: NodeSql, from: string, to: string, verified = true): void {
  mails++;
  sql.exec(
    "INSERT INTO inbox_raw (id, ts, channel, headers, body, sha256, state, reason) VALUES (?, ?, 'email', ?, '', ?, ?, ?)",
    `raw_${mails}`,
    '2026-10-05T09:00:00Z',
    JSON.stringify({ from, to, subject: 'the launch' }),
    `sha_${mails}`,
    verified ? 'matched' : 'untriaged',
    verified ? null : UNVERIFIED,
  );
}

test('A SENDER NOBODY KNOWS IS A MENTION: no row, no question, nothing carried', async () => {
  const { k, sql } = await record();
  const ada = value<Entry>(k.create('people', { name: 'Ada Lovelace', email: 'ada@example.com' }, OWNER));
  const met = value<Met>(k.meet(sender('stranger@nowhere.example', 'Ada Lovelace'), RULE));
  assert.equal(met.row, null);
  assert.equal(met.mention, true);
  assert.equal(met.question, undefined, 'a stranger opened a question');
  assert.equal(k.count('people'), 2);
  assert.equal(k.get(ada.id)!.fields.keys, undefined);
  assert.equal(sql.one("SELECT 1 AS n FROM entity_key WHERE key = 'email:stranger@nowhere.example'"), undefined);
  assert.equal(k.count('organisations'), 0, 'an organisation was made from a stranger’s domain');
  sql.close();
});

test('A KEY SOMEBODY HOLDS IS MET AS EVER: the line, and nothing the mail says', async () => {
  const { k, sql } = await record();
  const ada = value<Entry>(k.create('people', { name: 'Ada Lovelace', email: 'ada@example.com' }, OWNER));
  const met = value<Met>(k.meet(sender('ada@example.com', 'The Countess'), RULE));
  assert.equal(met.row?.id, ada.id);
  assert.equal(met.matched_by, 'key');
  assert.equal(k.get(ada.id)!.fields.aliases, undefined);
  sql.close();
});

test('AN ADDRESS AT AN ORGANISATION THE RECORD KEEPS IS SOMEBODY TO KNOW', async () => {
  const { k, sql } = await record();
  const lanternfish = value<Entry>(k.create('organisations', { name: 'Lanternfish', domain: 'lanternfish.example' }, OWNER));
  const met = value<Met>(k.meet(sender('teodor@lanternfish.example', 'Teodor Vance'), RULE));
  assert.equal(met.created, true);
  assert.equal(k.get(met.row!.id)!.fields.org, lanternfish.id);
  /* A subdomain's address is the same organisation's. */
  assert.equal(value<Met>(k.meet(sender('ops@mail.lanternfish.example', 'Joaquin Herrera'), RULE)).created, true);
  /* A public mail host says nothing, whichever organisation the record files it under (it is never a domain key). */
  value(k.create('organisations', { name: 'Google', domain: 'gmail.com' }, OWNER));
  assert.equal(value<Met>(k.meet(sender('stranger@gmail.com', 'Stranger'), RULE)).mention, true);
  sql.close();
});

test('AN ADDRESS THE RECORD’S OWN PERSON WROTE TO IS SOMEBODY TO KNOW, in a verified mail and from his own address', async () => {
  const { k, sql } = await record();
  mail(sql, 'Kas <kas@kas.example>', 'Ada Lovelace <ada@newco.example>, bob@newco.example');
  assert.equal(value<Met>(k.meet(sender('ada@newco.example', 'Ada Lovelace'), RULE)).created, true);
  assert.equal(value<Met>(k.meet(sender('bob@newco.example'), RULE)).created, true);

  /* A mail nothing verified says nothing, since its From is whatever the sender typed. */
  mail(sql, 'Kas <kas@kas.example>', 'grace@forged.example', false);
  assert.equal(value<Met>(k.meet(sender('grace@forged.example', 'Grace'), RULE)).mention, true);
  /* Nor does somebody else's mail to the address. */
  mail(sql, 'Ada Lovelace <ada@newco.example>', 'linus@newco2.example');
  assert.equal(value<Met>(k.meet(sender('linus@newco2.example', 'Linus'), RULE)).mention, true);
  assert.equal(k.count('people'), 3);
  sql.close();
});

test('ONLY TAKES known, AND NOTHING ELSE', async () => {
  const { k, sql } = await record();
  const out = k.meet({ email: 'ada@example.com', source: 'a note', only: 'everyone' as never }, OWNER) as { ok: boolean; refusal?: { at?: string } };
  assert.equal(out.ok, false);
  assert.equal(out.refusal?.at, 'only');
  sql.close();
});

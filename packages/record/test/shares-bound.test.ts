/**
 * SEC3 (security review of 30 Oct): A LINK OPENS THE PAGE IT WAS MADE FOR, NOT WHATEVER ITS SLUG NAMES NOW.
 *
 * A link followed its slug, and a slug is a row's title. He shares `/p/acme`; Acme is renamed Zed and Beta is renamed
 * Acme; the old link served Beta's page (probe: `About Acme: acme-plan`, then `About Acme: beta-plan-CONFIDENTIAL`), and
 * his Links list showed the slug's new title, so he could not see the swap. Now `share.open` keeps the page's declaration
 * and, for a row's page, the row: the link follows its row to the row's new address, and a page taken out and written
 * again under the same name opens nothing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { no } from '@braindog/ports';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { methods as shareMethods, type SharedPage } from '../src/methods/shares.ts';
import type { RecordDeps } from '../src/methods/index.ts';
import { OWNER } from '../../../fixtures/names.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };
const link = (id: string, slug: string): CallContext => ({ principal: { kind: 'share', id, slug } });
const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value?: T; refusal?: { code: string; fix: string; at?: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};

const CLIENTS = {
  id: 'register.clients',
  kind: 'register',
  body: { id: 'clients', name: 'Clients', title: 'name', fields: [{ id: 'name', type: 'text', required: true }, { id: 'plan', type: 'text' }] },
} as never;
const EACH = {
  id: 'page.client',
  kind: 'page',
  body: { page: 'client', title: '{{name}}', for: { register: 'clients' }, requires: ['register.clients'], blocks: [{ kind: 'note', body: 'About {{name}}: {{plan}}' }] },
} as never;
const NOTES = {
  id: 'page.notes',
  kind: 'page',
  body: { page: 'notes', title: 'Notes', requires: ['register.clients'], blocks: [{ kind: 'note', body: 'Our notes' }] },
} as never;

async function harness() {
  const sql = openSqlite();
  const clock = fixedClock(Date.UTC(2026, 9, 30, 12));
  const api = await createRecordApi({ sql, clock });
  sql.exec("INSERT INTO record (singleton, id, slug, name, locale, tz, format_ver, created_at) VALUES (1, 'rec_1', 'studio', 'Studio', 'en-GB', 'UTC', 1, '2026-10-01T00:00:00.000Z')");
  value(await api.kernel.install([CLIENTS, EACH, NOTES]));
  sql.exec("INSERT INTO person (id, email, name) VALUES ('p_owner', ?, ?)", OWNER.email, OWNER.name);
  sql.exec("INSERT INTO member (person_id, register, level) VALUES ('p_owner', '*', 'owner')");
  const direct = shareMethods({ kernel: api.kernel, sql, clock, no, tail: async <T>(o: T) => o, scoped: () => null, admin: () => null, shares: () => ({ can: true }) } as unknown as RecordDeps);
  const share = async (slug: string): Promise<string> => value<{ id: string }>(await direct.openShare({ slug }, owner)).id;
  const read = async (id: string, slug: string) => (await api.sharedPage(undefined, link(id, slug))) as { ok: boolean; value?: SharedPage };
  return { sql, api, direct, share, read };
}

test("SEC3: A LINK TO A ROW'S PAGE FOLLOWS THE ROW, AND NEVER SERVES THE ROW THAT TOOK ITS NAME", async () => {
  const { sql, api, direct, share, read } = await harness();
  const acme = value<{ id: string }>(api.kernel.create('clients', { name: 'Acme', plan: 'acme-plan' }, { actor: 'p_owner' }));
  const beta = value<{ id: string }>(api.kernel.create('clients', { name: 'Beta', plan: 'beta-plan-CONFIDENTIAL' }, { actor: 'p_owner' }));
  const id = await share('acme');
  assert.match(JSON.stringify((await read(id, 'acme')).value), /acme-plan/u);

  value(api.kernel.update('clients', acme.id, { name: 'Zed' }, { actor: 'p_owner', version: 1 }));
  value(api.kernel.update('clients', beta.id, { name: 'Acme' }, { actor: 'p_owner', version: 1 }));
  const after = await read(id, 'acme');
  assert.equal(after.ok, true, 'a renamed row lost its link');
  const said = JSON.stringify(after.value);
  assert.doesNotMatch(said, /beta-plan-CONFIDENTIAL/u, 'the link served the row that took its slug');
  assert.match(said, /acme-plan/u);
  /* AND HIS LIST OF LINKS NAMES THE PAGE THE LINK OPENS, not the page now at the slug. */
  const rows = value<{ id: string; title: string }[]>(await direct.shares(undefined, owner));
  assert.equal(rows.find((r) => r.id === id)?.title, 'Zed');
  sql.close();
});

test('SEC3: A PAGE TAKEN OUT AND WRITTEN AGAIN UNDER ITS NAME IS NOT THE PAGE THE LINK WAS MADE FOR', async () => {
  const { sql, api, share, read } = await harness();
  const id = await share('notes');
  assert.equal((await read(id, 'notes')).ok, true);
  value(api.kernel.retire(['page.notes']));
  value(await api.kernel.install([NOTES]));
  assert.equal((await read(id, 'notes')).ok, false);
  sql.close();
});

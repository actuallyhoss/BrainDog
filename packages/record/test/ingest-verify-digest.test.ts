/**
 * The webhook token a Shortcut carries: minted by an owner, shown once, kept only as its SHA-256, and answered to the
 * `/in/*` door as that digest.
 *
 * `loop/research-switch-matrix.md` brief 2, second half. `verify: { kind: path }` reached the grammar at `ef182a6c`
 * and nothing answered it: measured at that HEAD, `ingestVerify` answered `{ kind: 'none' }` for a webhook ingest
 * declaring it, and there was no way to make a token at all, so every SMS his Shortcut posted would be stored
 * `untriaged` whatever URL it carried. Every token below is minted by the test and every name is invented.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createHash } from 'node:crypto';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { NOW, installSeed } from '../../seed/src/index.ts';
import { MONEY_SMS_INGESTS } from '../../seed/src/modules/money.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };

const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex');

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  assert.ok((await installSeed(api.kernel)).ok);
  const twins = Object.values(MONEY_SMS_INGESTS).map((body) => ({ id: `ingest.${body.ingest}`, kind: 'ingest' as const, body: body as never }));
  const put = await api.kernel.install(twins);
  assert.ok(put.ok, JSON.stringify(put));
  return { sql, api };
}

/** Every cell in the database that holds `needle`, as `table.column`: `erase.test.ts`'s own sweep. */
function holding(sql: ReturnType<typeof openSqlite>, needle: string): string[] {
  const found: string[] = [];
  for (const { name } of sql.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'entry_fts_%'"))
    for (const c of sql.all<{ name: string }>(`SELECT name FROM pragma_table_info('${name}')`))
      if ((sql.one<{ n: number }>(`SELECT count(*) AS n FROM "${name}" WHERE CAST("${c.name}" AS TEXT) LIKE ?`, `%${needle}%`)?.n ?? 0) > 0) found.push(`${name}.${c.name}`);
  return found;
}

test('A DECLARED PATH TOKEN WITH NOTHING MINTED IS ANSWERED none, so an arrival before the mint stays untriaged', async () => {
  const { sql, api } = await record();
  assert.deepEqual(await api.ingestVerify({ ingest: 'bank-from-out-sms' }), { kind: 'none' });
  sql.close();
});

test('THE MINT SHOWS THE TOKEN ONCE AND KEEPS ONLY ITS DIGEST, which is what ingestVerify then answers', async () => {
  const { sql, api } = await record();
  const minted = await api.ingestMint({ ingest: 'bank-from-out-sms' }, owner);
  assert.ok(minted.ok, JSON.stringify(minted));
  const { token } = minted.value;
  /* THE SELF-HOST'S AND THE WORKER'S OWN SHAPE: 32 random bytes, base64url, 43 characters. */
  assert.match(token, /^[A-Za-z0-9_-]{43}$/u);
  assert.deepEqual(await api.ingestVerify({ ingest: 'bank-from-out-sms' }), { kind: 'path', sha256: sha256(token) });
  assert.deepEqual(holding(sql, token), [], 'the token itself was written somewhere in the record');
  assert.equal(holding(sql, sha256(token)).length, 1, 'the digest is not in exactly one place');
  /* AND ONLY THE INGEST IT WAS MINTED FOR. A twin with no token of its own is still answered none. */
  assert.deepEqual(await api.ingestVerify({ ingest: 'bank-from-in-sms' }), { kind: 'none' });
  sql.close();
});

test('MINTING AGAIN ROTATES: the new digest replaces the old one, which is how a leaked token is revoked', async () => {
  const { sql, api } = await record();
  const first = await api.ingestMint({ ingest: 'bank-from-out-sms' }, owner);
  const second = await api.ingestMint({ ingest: 'bank-from-out-sms' }, owner);
  assert.ok(first.ok && second.ok);
  assert.notEqual(first.value.token, second.value.token);
  assert.deepEqual(await api.ingestVerify({ ingest: 'bank-from-out-sms' }), { kind: 'path', sha256: sha256(second.value.token) });
  assert.deepEqual(holding(sql, sha256(first.value.token)), [], 'the first digest outlived the rotation');
  sql.close();
});

test('ONLY AN OWNER, IN A BROWSER, WITH A CREDENTIAL AND A RECENT PROOF, MINTS ONE', async () => {
  const { sql, api } = await record();
  const refused = async (ctx: CallContext, code: string) => {
    const out = await api.ingestMint({ ingest: 'bank-from-out-sms' }, ctx);
    assert.equal(out.ok, false, `${JSON.stringify(ctx.principal)} minted a token`);
    if (!out.ok && 'refusal' in out) assert.equal(out.refusal.code, code);
  };
  await refused({ principal: { kind: 'token', id: 't_1', scope: 'write', person: 'p_owner', level: 'owner' } }, 'NEEDS_BROWSER_SESSION');
  await refused({ principal: { kind: 'person', id: 'p_2', level: 'decide' } }, 'LEVEL_REQUIRED');
  await refused({ ...owner, credentialed: false }, 'NEEDS_BROWSER_SESSION');
  await refused({ ...owner, provedAt: NOW - 16 * 60_000 }, 'NEEDS_BROWSER_SESSION');
  assert.ok((await api.ingestMint({ ingest: 'bank-from-out-sms' }, { ...owner, provedAt: NOW - 60_000 })).ok);
  sql.close();
});

test('A TOKEN IS MINTED ONLY FOR A WEBHOOK INGEST THAT DECLARES verify: { kind: path }', async () => {
  const { sql, api } = await record();
  const refused = async (ingest: unknown, code: string) => {
    const out = await api.ingestMint({ ingest } as never, owner);
    assert.equal(out.ok, false, `${JSON.stringify(ingest)} was given a token`);
    if (!out.ok && 'refusal' in out) {
      assert.equal(out.refusal.code, code);
      assert.equal(out.refusal.at, 'ingest');
    }
  };
  await refused(undefined, 'REQUIRED_MISSING');
  await refused('no-such-ingest', 'DECLARATION_UNKNOWN');
  /* THE MAIL PATTERN IS DECLARED AND IS NOT A DOOR: mail is verified by its forwarder, never by a URL. */
  await refused('bank-from-out', 'VALUE_MALFORMED');
  /* AND A WEBHOOK THAT DECLARES NO VERIFIER is told to declare one, rather than handed a token nothing reads. */
  const { verify: _verify, ...bare } = MONEY_SMS_INGESTS['bank-from-out-sms']!;
  assert.ok((await api.kernel.install([{ id: 'ingest.bare-sms', kind: 'ingest', body: { ...bare, ingest: 'bare-sms' } as never }])).ok);
  await refused('bare-sms', 'VALUE_MALFORMED');
  assert.deepEqual(holding(sql, 'ingest_token'), [], 'a refused mint wrote something');
  sql.close();
});

/**
 * THE CHECKER'S SECOND FINDING, measured before it was repaired: the digest outlived the declaration it was minted for.
 * `ingestMint` wrote a `dog_meta` row and nothing ever deleted it, so an ingest retired and then declared again under
 * the same id answered the old digest, and the token shown for the first declaration verified the second, which
 * nobody had minted anything for. Taking `verify:` out answered `none`, but put back it answered the old digest too.
 */
const redeclare = async (api: Awaited<ReturnType<typeof record>>['api'], body: Record<string, unknown>) => {
  const put = await api.kernel.install([{ id: 'ingest.bank-from-out-sms', kind: 'ingest', body: body as never }]);
  assert.ok(put.ok, JSON.stringify(put));
};

test('A TOKEN DOES NOT OUTLIVE ITS DECLARATION: retired and declared again, the id answers none and the digest is gone', async () => {
  const { sql, api } = await record();
  const minted = await api.ingestMint({ ingest: 'bank-from-out-sms' }, owner);
  assert.ok(minted.ok);
  const held = sha256(minted.value.token);
  const retired = api.kernel.retire(['ingest.bank-from-out-sms']);
  assert.ok(retired.ok, JSON.stringify(retired));
  await redeclare(api, MONEY_SMS_INGESTS['bank-from-out-sms']!);
  assert.deepEqual(await api.ingestVerify({ ingest: 'bank-from-out-sms' }), { kind: 'none' }, 'the token minted for the retired declaration verifies its successor');
  assert.deepEqual(holding(sql, held), [], 'the retired declaration left its digest in the record');
  /* AND A NEW MINT IS WHAT MAKES THE NEW DECLARATION A DOOR, which is the only way one should become one. */
  const again = await api.ingestMint({ ingest: 'bank-from-out-sms' }, owner);
  assert.ok(again.ok);
  assert.deepEqual(await api.ingestVerify({ ingest: 'bank-from-out-sms' }), { kind: 'path', sha256: sha256(again.value.token) });
  sql.close();
});

test('A DECLARATION THAT DROPS verify: TAKES THE DIGEST WITH IT, so putting verify: back does not bring the old token back', async () => {
  const { sql, api } = await record();
  const minted = await api.ingestMint({ ingest: 'bank-from-out-sms' }, owner);
  assert.ok(minted.ok);
  const held = sha256(minted.value.token);
  const { verify: _verify, ...bare } = MONEY_SMS_INGESTS['bank-from-out-sms']!;
  await redeclare(api, bare);
  assert.deepEqual(await api.ingestVerify({ ingest: 'bank-from-out-sms' }), { kind: 'none' });
  await redeclare(api, MONEY_SMS_INGESTS['bank-from-out-sms']!);
  assert.deepEqual(await api.ingestVerify({ ingest: 'bank-from-out-sms' }), { kind: 'none' }, 'the token minted before verify: was dropped verifies again');
  assert.deepEqual(holding(sql, held), [], 'the digest outlived the declaration that dropped verify:');
  sql.close();
});

test('A NEW VERSION THAT STILL DECLARES verify: KEEPS THE TOKEN, so a pack update does not break his Shortcut', async () => {
  const { sql, api } = await record();
  const minted = await api.ingestMint({ ingest: 'bank-from-out-sms' }, owner);
  assert.ok(minted.ok);
  await redeclare(api, { ...MONEY_SMS_INGESTS['bank-from-out-sms']!, description: 'The same pattern, reworded by a later version of the pack.' });
  assert.deepEqual(await api.ingestVerify({ ingest: 'bank-from-out-sms' }), { kind: 'path', sha256: sha256(minted.value.token) });
  sql.close();
});

test('THE REFUSAL FOR A CALLER WHO PRESENTED NOTHING SAYS WHAT WORKS, and not a token the next check refuses', async () => {
  /* THE CHECKER'S FIRST FINDING. It said "Sign in, or send BRAINDOG_TOKEN", and both halves were wrong for the one
     caller it is said to: `credentialed: false` is a self-host started without `BRAINDOG_TOKEN`, which has no token to
     send and nobody to sign in, and the agent token a client's `BRAINDOG_TOKEN` usually holds is refused by `admin`
     before this line is reached. What works is the server key, and only once the host is started with one. */
  const { sql, api } = await record();
  const out = await api.ingestMint({ ingest: 'bank-from-out-sms' }, { ...owner, credentialed: false });
  assert.equal(out.ok, false);
  const fix = !out.ok && 'refusal' in out ? out.refusal.fix : '';
  assert.doesNotMatch(fix, /or send BRAINDOG_TOKEN/u);
  assert.match(fix, /start/iu);
  assert.match(fix, /BRAINDOG_TOKEN/u);
  assert.match(fix, /agent/iu);
  sql.close();
});

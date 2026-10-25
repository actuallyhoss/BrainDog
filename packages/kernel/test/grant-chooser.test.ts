/**
 * Which live keychain entry a name opens, when the keychain holds more than one under it: `grantChosen`, and the two SQL
 * readers that now hand their rows to it.
 *
 * ONE CHOOSER, NOT FIVE COPIES OF ITS ORDER. The keychain admits two live grants under one label (`bindGrant` checks no
 * label for uniqueness), and at `afb3b1b2` four places each wrote the newest-first order out for themselves: `keyNamed`
 * and `opensNamed` here as `ORDER BY created_at DESC, id DESC`, `grantNamed` in `@braindog/host/script` as a `sort`,
 * and `slashGrantOf` in `@braindog/host/slash` as a loop over `newerThan`. A fifth, Slash's `grants().find(...)`,
 * answered the OLDEST key while every action named `slash` sent the newest, and the only thing that had kept the other
 * four agreeing was that each author copied the same clause. This file holds the kernel's half of one chooser: the two
 * SQL readers filter and `grantChosen` orders. One more copy of the clause, `sealedGrant`'s for a signed post, asks the
 * chooser now too; `keychain-webhook-grant.test.ts` holds it, over a tie that SQL and the chooser would have broken two
 * ways.
 *
 * THE ORDER AS IT STOOD IS WRITTEN OUT BELOW (`BEFORE`), verbatim from `keyNamed` at `afb3b1b2`, and every case asserts the
 * chooser picks what that query picked. The move was to put the order in one place, not to change which key wins, and a
 * case that only compared `keyNamed` with `grantChosen` would stay green if both had moved together.
 *
 * RED BEFORE THE MOVE, MEASURED: the file did not load, `grantChosen` not exported by `actions.ts`. That is
 * the only red there was. `packages/host/test/grant-named.test.ts`, run against the four copies as they stood, passed 8 of
 * 8, so the repair here is one copy of the order and not a different winner. With the move in, `grantChosen`'s id
 * tie-break reversed by hand failed case 2 here and nothing else, which is the case that holds it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf } from '@braindog/ports';

import { grantChosen, keyNamed, opensNamed } from '../src/actions.ts';
import { openRecord, type GrantKind, type GrantRow, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 23, 12);
const DAY = 86_400_000;
const b = (n: number) => new Uint8Array([n, n + 1, 2, 3]);

/** `keyNamed`'s query at `afb3b1b2`, the order every case is held to. */
const BEFORE = (sql: NodeSql, name: string): string | null =>
  sql.one<{ id: string }>('SELECT id FROM grant WHERE (label = ? OR id = ?) AND revoked_at IS NULL ORDER BY created_at DESC, id DESC LIMIT 1', name, name)?.id ?? null;

async function keychain() {
  const sql = openSqlite();
  const clock = fixedClock(NOW - 30 * DAY);
  const k: Kernel = await openRecord(sql, clock);
  assert.ok(
    k.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1', email: 'ada@example.test', name: 'Ada' } }).ok,
  );
  /** One grant, bound `after` ms on from the last, under the id `id` when one is given so a tie can be ordered on purpose. */
  const bind = (label: string, opens: string, over: { kind?: GrantKind; after?: number; id?: string } = {}): string => {
    clock.advance(over.after ?? DAY);
    const made = k.bindGrant(
      {
        label,
        opens,
        kind: over.kind ?? 'api_token',
        ciphertext: b(1),
        nonce: b(9),
        kdf: 'hkdf',
        wrapped_by: 'kek',
        kek_id: 'kek_2f',
        ...(over.id === undefined ? {} : { sealed_for: { id: over.id, version: 1 } }),
      },
      'p_1',
    );
    assert.ok(made.ok, fixOf(made));
    return (made.value as GrantRow).id;
  };
  /** Every reader of one name, and the old query, answering the same keychain. */
  const readings = (name: string) => {
    const chosen = grantChosen(k.grants(), name);
    return {
      before: BEFORE(sql, name),
      chosen: chosen?.id ?? null,
      key: keyNamed(sql, name)?.id ?? null,
      opens: opensNamed(sql, name),
      chosenOpens: chosen?.opens ?? null,
    };
  };
  /** The four readers agree, and they agree on `want`. */
  const agree = (name: string, want: string | null) => {
    const r = readings(name);
    assert.equal(r.before, want, `the query as it stood picked ${r.before} for ${name}, and the case expected ${want}`);
    assert.deepEqual({ chosen: r.chosen, key: r.key }, { chosen: want, key: want }, `${name}: ${JSON.stringify(r)}`);
    assert.equal(r.opens, r.chosenOpens, `opensNamed said ${r.opens} for ${name}, and the entry chosen opens ${r.chosenOpens}`);
  };
  return { k, sql, bind, agree, close: () => sql.close() };
}

test('(1) TWO LIVE ENTRIES UNDER ONE LABEL, A DAY APART: every reader opens the newer', async () => {
  const v = await keychain();
  try {
    v.bind('goldapi', 'old.example.test');
    const newer = v.bind('goldapi', 'new.example.test');
    v.agree('goldapi', newer);
  } finally {
    v.close();
  }
});

test('(2) BOUND IN THE SAME INSTANT, THE LARGER ID WINS, and the row bound second is not the newest when its id is smaller', async () => {
  const v = await keychain();
  try {
    /* THE IDS ARE CHOSEN AGAINST THE ORDER OF THE BINDS, so a chooser that fell back to the order the rows came back in
       (what Slash's `find` did) would open `SMALLER` here, and the tie-break is what decides. */
    const larger = v.bind('goldapi', 'first.example.test', { id: 'g_01JZ8QK3F7R2M9V4XN6TCB5ZZZ' });
    const smaller = v.bind('goldapi', 'second.example.test', { id: 'g_01JZ8QK3F7R2M9V4XN6TCB5AAA', after: 0 });
    assert.notEqual(larger, smaller);
    v.agree('goldapi', larger);
  } finally {
    v.close();
  }
});

test('(3) A REVOKED NEWEST ENTRY IS PASSED OVER, and a label with nothing live opens nothing', async () => {
  const v = await keychain();
  try {
    const older = v.bind('goldapi', 'old.example.test');
    const newer = v.bind('goldapi', 'new.example.test');
    assert.ok(v.k.revokeGrant(newer, 'p_1').ok);
    v.agree('goldapi', older);
    assert.ok(v.k.revokeGrant(older, 'p_1').ok);
    v.agree('goldapi', null);
    v.agree('nobody', null);
  } finally {
    v.close();
  }
});

test('(4) A NAME THAT IS AN ID OPENS THAT ENTRY, whatever is newer under its label', async () => {
  const v = await keychain();
  try {
    const older = v.bind('goldapi', 'old.example.test');
    v.bind('goldapi', 'new.example.test');
    v.agree(older, older);
  } finally {
    v.close();
  }
});

test('(5) WHAT A CALLER PASSES OVER IS ITS OWN RULE, and among what it keeps the order is still this one', async () => {
  const v = await keychain();
  try {
    /* SLASH'S RULE, stated as `slashGrantOf` states it: a row of a kind the keychain holds that is not a token is not a
       bearer. With a password bound after the token, the kind-blind readers take the password and Slash's the token. */
    const token = v.bind('slash', 'gateway.example.test');
    const password = v.bind('slash', 'gateway.example.test', { kind: 'password' });
    const tokens = (g: { kind?: string | undefined }) => g.kind === undefined || g.kind === 'api_token';
    v.agree('slash', password);
    assert.equal(grantChosen(v.k.grants(), 'slash', tokens)?.id, token);
    const later = v.bind('slash', 'gateway.example.test');
    assert.equal(grantChosen(v.k.grants(), 'slash', tokens)?.id, later);
  } finally {
    v.close();
  }
});

test('(6) THE ROWS A CALLER HANDS IN ARE NOT REORDERED, and no name opens nothing', () => {
  const rows = [
    { id: 'g_1', label: 'x', revoked_at: null, created_at: '2026-09-01T00:00:00.000Z' },
    { id: 'g_2', label: 'x', revoked_at: null, created_at: '2026-09-02T00:00:00.000Z' },
  ];
  const copy = structuredClone(rows);
  assert.equal(grantChosen(rows, 'x')?.id, 'g_2');
  assert.deepEqual(rows, copy);
  assert.equal(grantChosen(rows, ''), undefined);
  assert.equal(grantChosen(rows, undefined), undefined);
});

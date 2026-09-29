/**
 * The same vault answers the same key to a scheduled action and to a script. A guard against drift. Slash was a third
 * caller until its key became the one the owner picks by id, and the paragraphs below keep
 * the history as it was measured.
 *
 * THREE CALLERS, ONE ORDER. A scheduled action's `grant:` opens what `keyNamed` (`packages/kernel/src/actions.ts`) finds,
 * and the approval line names what `opensNamed` finds. A script's key is what `grantNamed` (`src/script.ts`) finds. The
 * host's own Slash key is what `slashGrantOf` (`src/slash.ts`) finds. At `afb3b1b2` each of the four wrote the newest-first
 * order out for itself, and a probe found a fifth, Slash's `grants().find(...)`, opening the OLDEST
 * `slash` key while every action named `slash` sent the newest (`slash-grant-chooser.test.ts` case 1). Nothing but four
 * authors copying the same clause kept the rest in step.
 *
 * SO EVERY CASE ASKS ALL OF THEM ABOUT ONE REAL VAULT and asserts one answer. A real kernel, because the order the rows come
 * back in from `listGrants` (`ORDER BY label` and nothing within it) is exactly what a chooser that forgot to order would
 * return, and a fixture array is in whatever order its author typed.
 *
 * MEASURED AGAINST THE FOUR COPIES AS THEY STOOD: 8 tests, 8 pass. No state here, ties on the instant
 * included, made two of them disagree, so this file is the guard for the move to one chooser and not the proof of a wrong
 * winner. Copies were then broken by hand to see that the guard holds them. `grantNamed`'s sort turned oldest-first: 6 of
 * 8 fail, every case but the two revoke cases. Its id tie-break alone reversed: the two case 2s fail. `grantChosen`'s id
 * tie-break reversed, which `keyNamed` now reads: the two case 2s fail. `slashGrantOf` was not broken by hand, because
 * `src/slash.ts` was not this change's file to edit; it answers in every case and case 2 is the one that holds its tie.
 *
 * AND IT IS STILL NEEDED AFTER THE MOVE, because the move is half made. `keyNamed` and `opensNamed` hand their rows to the
 * kernel's `grantChosen`; `grantNamed` and `slashGrantOf` keep their own copies until `@braindog/kernel`'s index exports
 * it, which is one name in a file that was not this change's. Until then this file is all that holds the three together.
 *
 * WHAT THIS FILE DOES NOT ASSERT IS EQUALITY ACROSS KINDS. Slash passes over a `password`, a `note`, an `ssh_key` or
 * `recovery_codes` under `slash`, because its key goes out as a bearer; an action and a script take the newest entry of any
 * kind. Case 5 holds both halves of that as they stand, so a change to either is a test edited on purpose.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf } from '@braindog/ports';
import { openRecord, type GrantKind, type GrantRow, type Kernel } from '@braindog/kernel';

import { grantNamed } from '../src/script.ts';
import { SLASH_KEY_LABEL } from '../src/slash.ts';
import { keyNamed } from '../../kernel/src/actions.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.parse('2026-09-23T12:00:00.000Z');
const DAY = 86_400_000;
const b = (n: number) => new Uint8Array([n, n + 1, 2, 3]);

async function vault() {
  const sql = openSqlite();
  const clock = fixedClock(NOW - 30 * DAY);
  const k: Kernel = await openRecord(sql, clock);
  assert.ok(
    k.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1', email: 'ada@example.test', name: 'Ada' } }).ok,
  );
  /** One grant, bound `after` ms on from the last, under `id` when one is given so a tie can be ordered on purpose. */
  const bind = (label: string, over: { kind?: GrantKind; after?: number; id?: string } = {}): string => {
    clock.advance(over.after ?? DAY);
    const made = k.bindGrant(
      {
        label,
        opens: `${label}.example.test`,
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
  const script = grantNamed(() => k.grants());
  /* SLASH IS NO LONGER ONE OF THE CALLERS. Its key is the grant the owner picked by id in Settings, and no label chooses
     it, so `slashGrantOf` is gone and `slash` is a label like `goldapi` to the two left. */
  /** What each caller opens under `name`. */
  const opened = (name: string) => ({
    action: keyNamed(sql, name)?.id ?? null,
    script: script(name)?.id ?? null,
  });
  /** Every caller opens `want` under `name`, and the approval line names what that entry opens. */
  const agree = (name: string, want: string | null) => {
    const got = opened(name);
    const all = Object.fromEntries(Object.keys(got).map((caller) => [caller, want]));
    assert.deepEqual(got, all, `the callers disagreed about ${name}`);
    const entry = want === null ? null : (k.grants().find((g) => g.id === want) ?? null);
    assert.equal(k.opensOf(name), entry?.opens ?? null);
    assert.equal(script(name)?.opens ?? null, entry?.opens ?? null);
  };
  return { k, bind, opened, agree, close: () => sql.close() };
}

for (const label of [SLASH_KEY_LABEL, 'goldapi']) {
  test(`(1) ${label}: TWO LIVE TOKENS A DAY APART, and every caller opens the newer`, async () => {
    const v = await vault();
    try {
      v.bind(label);
      const newer = v.bind(label);
      v.agree(label, newer);
    } finally {
      v.close();
    }
  });

  test(`(2) ${label}: BOUND IN ONE INSTANT, the larger id is the newest for every caller, whichever was bound second`, async () => {
    const v = await vault();
    try {
      const larger = v.bind(label, { id: 'g_01JZ8QK3F7R2M9V4XN6TCB5ZZZ' });
      v.bind(label, { id: 'g_01JZ8QK3F7R2M9V4XN6TCB5AAA', after: 0 });
      v.agree(label, larger);
    } finally {
      v.close();
    }
  });

  test(`(3) ${label}: A REVOKED NEWEST IS PASSED OVER BY EVERY CALLER, and then nothing is left`, async () => {
    const v = await vault();
    try {
      const older = v.bind(label);
      const newer = v.bind(label);
      assert.ok(v.k.revokeGrant(newer, 'p_1').ok);
      v.agree(label, older);
      assert.ok(v.k.revokeGrant(older, 'p_1').ok);
      v.agree(label, null);
    } finally {
      v.close();
    }
  });
}

test('(4) THREE TOKENS UNDER `slash`, THE LAST BOUND NOT THE NEWEST: the order is the instant, not the order of the binds', async () => {
  const v = await vault();
  try {
    v.bind(SLASH_KEY_LABEL);
    const newest = v.bind(SLASH_KEY_LABEL, { after: 2 * DAY });
    /* THE CLOCK STEPS BACK A DAY, as a host whose clock was corrected does, so the row bound last sits between the two. */
    v.bind(SLASH_KEY_LABEL, { after: -DAY });
    v.agree(SLASH_KEY_LABEL, newest);
  } finally {
    v.close();
  }
});

test('(5) ACROSS KINDS AN ACTION AND A SCRIPT TAKE THE NEWEST ENTRY: a password bound after the token is what both send', async () => {
  const v = await vault();
  try {
    v.bind(SLASH_KEY_LABEL);
    const password = v.bind(SLASH_KEY_LABEL, { kind: 'password' });
    assert.deepEqual(v.opened(SLASH_KEY_LABEL), { action: password, script: password });
  } finally {
    v.close();
  }
});

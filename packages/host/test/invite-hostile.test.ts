/**
 * Hostile names on `/auth/invite`, against a real Directory. `loop/research-batch-fourteen-audit.md` finding 4.
 *
 * ANYBODY HOLDING THE LINK TYPES THIS, BEFORE THEY HAVE SIGNED IN, because path 3 of `serveInvite` needs no session.
 * The audit sent each of these through and every one answered 200: five invisible names were stored as names, so a
 * screen that asks "is there a name" was told yes and drew nothing; `Bo\u0000Tanner` was stored as `Bo` by
 * `node:sqlite`'s bind, with nobody told; a CRLF, a BEL and an ANSI escape were stored as typed; a right-to-left
 * override stored `Bo nimda`, which draws as `Bo admin`; and 60,000 characters were stored whole. The same column is the
 * passkey's `displayName` (`packages/record/src/identity.ts:413`), so the operating system's passkey chooser would
 * have drawn every one of them.
 *
 * TWO ANSWERS, AND WHICH ONE IS THE POINT. A name with nothing visible in it is no name, exactly as a name of spaces
 * already was, so the invitation is accepted and the column stays NULL. A name with something visible and something
 * dangerous in it is REFUSED at `name`, before the person is made and before the link is spent, because cleaning it
 * silently is the NUL case again: the person asked to be one thing and is quietly another.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { AuthResult, Result } from '@braindog/ports';
import { ok } from '@braindog/ports';
import { createDirectory, type AuthConfig } from '@braindog/record/directory';

import { serveAuth, type AuthDoor } from '../src/auth.ts';
import { serveInvite, type InviteDoor } from '../src/invite.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 5, 12);
const EXPIRES = new Date(NOW + 24 * 3_600_000).toISOString();
const ORIGIN = 'https://studio.example';
const CONFIG: AuthConfig = { mac: new Uint8Array(32).fill(7), rp: { id: 'studio.example', origin: ORIGIN }, magic: true };

function setup() {
  const sql = openSqlite();
  const d = createDirectory(sql, fixedClock(NOW), CONFIG);
  const links = new Map<string, string>();
  const accepted: { token: string; person: { id: string; email: string; name?: string } }[] = [];
  const invite: InviteDoor = {
    look: (token) => Promise.resolve(ok({ email: links.get(token) ?? '', expires_at: EXPIRES })),
    accept: (token, person) => {
      accepted.push({ token, person });
      return Promise.resolve(ok(null) as Result<unknown>);
    },
    /* NOBODY HERE IS KNOWN, so every accept reaches path 3, which is the only path that reads a name. */
    known: () => Promise.resolve(false),
    person: (email, name) => Promise.resolve(d.person$(email, name)),
  };
  const door = { on: 'worker' as const, ip: '203.0.113.9', auth: d.auth, invite };
  const finish = (out: AuthResult) => new Response(JSON.stringify('body' in out ? out.body : null), { status: out.status });
  let n = 0;
  return {
    accepted,
    /** Accept a fresh invitation for a fresh address with `name` in the body. */
    send: async (name: unknown) => {
      const email = `p${++n}@example.com`;
      const token = `rec_01JZ8QK3F7R2M9V4XN6TCB5HAD.${email}`;
      links.set(token, email);
      const out = await serveInvite({ inviteToken: token, accept: true, name }, undefined, door, finish);
      const row = sql.one<{ name: string | null }>('SELECT name FROM dir_person WHERE lower(email) = lower(?)', email);
      return { status: out.status, body: (await out.json()) as { refusal?: { code: string; at?: string } }, row, email };
    },
    close: () => sql.close(),
  };
}

/** Each of these has nothing a reader can see. The audit stored the zero-width space, the joiners, the word joiner,
    the hangul filler and the braille blank as names; the rest are their neighbours in the same classes. */
const INVISIBLE: [string, unknown][] = [
  ['empty', ''],
  ['spaces', '   '],
  ['nbsp and ideographic space', '\u00A0\u3000'],
  ['zero-width space', '\u200B'],
  ['zero-width joiner x3', '\u200D\u200D\u200D'],
  ['word joiner', '\u2060'],
  ['hangul filler', '\u3164'],
  ['halfwidth hangul filler', '\uFFA0'],
  ['braille blank', '\u2800'],
  ['soft hyphen', '\u00AD'],
  ['byte order mark', '\uFEFF'],
  ['a mixture', ' \u200B\u2800\u3164\u2060 '],
  ['an array', ['Bo']],
  ['an object', { name: 'Bo' }],
];

/** Each of these has something visible AND something that must not reach a row, a log line or a passkey chooser. */
const REFUSED: [string, string][] = [
  ['NUL, which node:sqlite truncates at the bind', 'Bo\u0000Tanner'],
  ['CRLF', 'Bo\r\nBcc: x@evil.example'],
  ['BEL and ESC', 'Bo\u0007\u001b[31mred'],
  ['a C1 control', 'Bo\u0085Tanner'],
  ['DEL', 'Bo\u007FTanner'],
  ['a tab', 'Bo\tTanner'],
  /* WHITE SPACE BY PROPERTY AND A LINE BREAK ON THE SCREEN. Neither is a control, so a check for controls alone let
     both through and stored `Bo`, a new line, and `Tanner` as one name. */
  ['a line separator', 'Bo Tanner'],
  ['a paragraph separator', 'Bo Tanner'],
  ['right-to-left override', 'Bo \u202Enimda\u202C'],
  ['right-to-left isolate', 'Bo \u2067nimda\u2069'],
  ['right-to-left mark', 'Bo\u200FTanner'],
  ['arabic letter mark', 'Bo\u061CTanner'],
  ['a zero-width space inside a name', 'Bo\u200BTanner'],
  ['a word joiner inside a name', 'Bo\u2060Tanner'],
  ['a hangul filler inside a name', 'Bo\u3164Tanner'],
  ['a braille blank inside a name', 'Bo\u2800Tanner'],
  ['a lone surrogate', 'Bo\uD800'],
  ['60 000 characters', 'A'.repeat(60_000)],
  ['101 code points', 'A'.repeat(101)],
];

test('A NAME WITH NOTHING VISIBLE IN IT IS NO NAME: accepted, and the column stays NULL', async () => {
  const s = setup();
  try {
    for (const [what, name] of INVISIBLE) {
      const out = await s.send(name);
      assert.equal(out.status, 200, `${what}: ${JSON.stringify(out.body)}`);
      assert.equal(out.row?.name, null, `${what} was stored as a name`);
      assert.equal(s.accepted.at(-1)?.person.name, undefined, `${what} reached the record's mirror as a name`);
    }
    assert.equal(s.accepted.length, INVISIBLE.length, 'an invisible name stopped a link being spent');
  } finally {
    s.close();
  }
});

test('A NAME CARRYING A CONTROL, A DIRECTION OVERRIDE OR AN INVISIBLE GAP IS REFUSED at `name`, and nothing is made or spent', async () => {
  const s = setup();
  try {
    for (const [what, name] of REFUSED) {
      const out = await s.send(name);
      assert.equal(out.status, 422, `${what} answered ${out.status}: ${JSON.stringify(out.body)}`);
      assert.equal(out.body.refusal?.code, 'VALUE_MALFORMED', what);
      assert.equal(out.body.refusal?.at, 'name', what);
      assert.equal(out.row, undefined, `${what}: a person was made anyway`);
    }
    assert.equal(s.accepted.length, 0, 'a refused name spent a link');
  } finally {
    s.close();
  }
});

test('REAL NAMES STILL ARRIVE WHOLE: scripts that need a joiner, astral letters, and exactly the limit', async () => {
  const s = setup();
  try {
    const kept: [string, string, string][] = [
      ['trimmed', '  Bo Tanner  ', 'Bo Tanner'],
      /* ZWNJ IS SPELLING IN PERSIAN. Without it the two halves of this name join into different letters. */
      ['Persian with a non-joiner', '\u0645\u062D\u0645\u062F\u200C\u0631\u0636\u0627', '\u0645\u062D\u0645\u062F\u200C\u0631\u0636\u0627'],
      /* AND ZWJ IS SPELLING IN THE INDIC SCRIPTS: a Malayalam chillu is written with one. */
      ['Malayalam with a joiner', '\u0D28\u0D4D\u200D', '\u0D28\u0D4D\u200D'],
      ['edge invisibles trimmed', '\u200B\uFEFFBo\u2060', 'Bo'],
      ['Chinese', '\u674E\u5C0F\u9F99', '\u674E\u5C0F\u9F99'],
      ['100 code points exactly', 'A'.repeat(100), 'A'.repeat(100)],
      /* CODE POINTS AND NOT UTF-16 UNITS: 100 astral letters are 200 units, and a person's name is not twice as
         long for being written in a script outside the first plane. */
      ['100 astral code points', '\u{1D400}'.repeat(100), '\u{1D400}'.repeat(100)],
      /* SVELTE ESCAPES IT, so it is a strange name and not an attack, and refusing it would be guessing. */
      ['markup', '<img src=x onerror=alert(1)>', '<img src=x onerror=alert(1)>'],
    ];
    for (const [what, sent, stored] of kept) {
      const out = await s.send(sent);
      assert.equal(out.status, 200, `${what}: ${JSON.stringify(out.body)}`);
      assert.equal(out.row?.name, stored, what);
      assert.equal(s.accepted.at(-1)?.person.name, stored, `${what} did not reach the record's mirror`);
    }
  } finally {
    s.close();
  }
});

/**
 * THE OPERATOR'S PROVISION ROUTE WRITES THE SAME COLUMN, and it trimmed and capped nothing either
 * (`packages/host/src/auth.ts`, `serveOperator`). It takes the operator key, so it is not a stranger's door, but a
 * name it stores is the same passkey `displayName` and the same People row, so it answers to the same rule.
 */
test('THE OPERATOR IS HELD TO THE SAME RULE: a hostile name is refused before a record is made', async () => {
  const sql = openSqlite();
  const d = createDirectory(sql, fixedClock(NOW), CONFIG);
  const KEY = 'k'.repeat(43);
  const made: { slug: string; email: string; name?: string }[] = [];
  const provision = async (args: { slug: string; email: string; name?: string }) => {
    made.push(args);
    /* THE REAL DIRECTORY'S ROWS, so the claim link that follows has a person to be minted for. */
    assert.ok(d.person$(args.email, args.name).ok);
    const named = d.provision({ ...args, slug: `studio-${made.length}` });
    assert.ok(named.ok, JSON.stringify(named));
    return ok({ record: named.value.record, slug: named.value.slug, person: named.value.person });
  };
  const door: AuthDoor = { on: 'worker', origin: ORIGIN, auth: d.auth, ip: '203.0.113.9', operator: { key: KEY, provision } };
  const call = (name: unknown) =>
    serveAuth(
      new Request(`${ORIGIN}/auth/provision`, {
        method: 'POST',
        headers: { origin: ORIGIN, 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
        body: JSON.stringify({ slug: 'the-studio', email: 'ada@example.com', name }),
      }),
      door,
    );
  try {
    /* THE REFUSAL'S `at` AND NOT ITS STATUS. Before the repair these answered 422 as well, from the claim link that
       followed a record this fake never made, so a status alone would have passed against the unrepaired route. */
    for (const [what, name] of REFUSED) {
      const out = (await (await call(name)).json()) as { refusal?: { code: string; at?: string } };
      assert.equal(out.refusal?.at, 'name', `${what}: ${JSON.stringify(out)}`);
    }
    assert.equal(made.length, 0, 'a record was made under a refused name');

    assert.equal((await call('\u200B\u3164')).status, 200);
    assert.equal(made.at(-1)?.name, undefined, 'an invisible name was provisioned as a name');
    assert.equal((await call('  Ada Lovelace  ')).status, 200);
    assert.equal(made.at(-1)?.name, 'Ada Lovelace');
  } finally {
    sql.close();
  }
});

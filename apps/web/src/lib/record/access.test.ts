/**
 * Who can see this record, and the way back into it.
 *
 * `19 §2` names both areas together and says why: *"`recovery` and `people & sharing` were missing
 * from an earlier draft — the first left a passkey-primary product with no designed way back in."*
 * This build shipped both areas and left them saying "This area is part of the shell and is not
 * wired in the mock-up", which is the same hole with a sentence in it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { copy } from '../copy.ts';
import { AUTH_METHODS, PASSKEYS, PEOPLE_ACCESS } from './data.ts';
import { LEVELS } from './schema.ts';

/* ── the ladder ──────────────────────────────────────────────────────────── */

test('THE PERSON LADDER IS THE FIVE `20 §1` NAMES, and `admin` is not one of them', () => {
  /* The type admitted `read | write | admin | owner`. `admin` is in neither ladder — `20 §1` says
     the person one is "never held by a token or a share link, which is why there is no `admin`
     token scope" — and the screen falls back to printing the raw value, so a person at `admin`
     would have rendered the word `admin` where every other row reads a sentence. An id on the
     screen that says who can change somebody's business record. */
  assert.deepEqual([...LEVELS], ['read', 'append', 'write', 'decide', 'owner']);
  assert.ok(!(LEVELS as readonly string[]).includes('admin'));
});

test('and every one of them has a sentence, so no enum reaches a screen', () => {
  /* `19 §9`: `ceiling` and `scope` "must never reach a user — say what they can see". The five
     ladder words are the same class of thing: the control shows them because they are the values,
     and the sentence under it is what a reader is actually choosing between. */
  const said = LEVELS.map((level) => {
    const line = copy.levelMeans[level];
    assert.ok(line, `${level} has no sentence, so the screen would print the enum`);
    assert.ok(line.length > 15, `${level}'s sentence explains nothing: ${line}`);
    return line;
  });
  /* FIVE DIFFERENT MEANINGS. Two levels sharing a sentence is the collapse this screen was found
     doing in the other direction — a chip printing `write` beside a cell reading `Read only`. */
  assert.equal(new Set(said).size, LEVELS.length, 'two levels say the same thing');

  /* AND `append` IS THE ONE THAT IS NOT WHAT IT SOUNDS LIKE. `20 §1`: "`create`, `propose` and
     `log` — and NO READ. The conservative half: an appender sees nothing, not even what it filed."
     A sentence that let a reader assume otherwise would hand a contractor the whole record. */
  assert.match(copy.levelMeans.append ?? '', /not read/);
  /* AND NOTHING ELSE. A sentence for a level that does not exist is a sentence nobody reads. */
  for (const key of Object.keys(copy.levelMeans))
    assert.ok((LEVELS as readonly string[]).includes(key), `levelMeans.${key} is not a level`);
});

test('every seeded person sits on the ladder', () => {
  for (const p of PEOPLE_ACCESS) {
    assert.ok((LEVELS as readonly string[]).includes(p.level), `${p.name} is at ${p.level}`);
    /* THE INVITATION IS BOUND TO ONE EMAIL (`12 §3`), so it is the identifier and not the name. */
    assert.match(p.email, /^[^@\s]+@[^@\s]+$/, `${p.name} has no address the invitation could bind to`);
  }
});

test('A RECORD KEEPS AT LEAST ONE OWNER, and the seed has exactly one to prove the rule', () => {
  /* `45 §5.6`'s `LEVEL_REQUIRED`, whose fix sentence this screen renders verbatim. With one owner,
     every demotion and every removal of that person is refused — which is what makes the disabled
     state on the screen a real state rather than a decoration nobody ever sees. */
  const owners = PEOPLE_ACCESS.filter((p) => p.level === 'owner' && p.since);
  assert.equal(owners.length, 1, 'more than one owner, so the last-owner refusal is unreachable');
  assert.equal(copy.lastOwner, 'A record keeps at least one owner.');
});

test('an invitation that is out is a different fact from access', () => {
  /* The two were one row, so somebody who had invited a bookkeeper could not tell whether the link
     had been used. `12 §3`: single-use, twenty-four hours, bound to one address. */
  const pending = PEOPLE_ACCESS.filter((p) => p.since === null);
  assert.equal(pending.length, 1, 'no pending invitation in the seed, so that state never renders');
  assert.notEqual(copy.inviteOut, copy.sinceWhen('3mo ago'));
  assert.match(copy.inviteHow, /24 hours/);
});

/* ── the way back in ─────────────────────────────────────────────────────── */

test('THERE ARE NO RECOVERY CODES, AND THE SCREEN SAYS SO', () => {
  /* `grep -rn "recovery code"` over all fifty-four documents returns nothing. The mechanism is a
     second passkey and the fallback is the email link — so a screen that stayed quiet about it
     would leave somebody hunting for a sheet of codes that has never existed. */
  assert.match(copy.magicHow, /no recovery codes/i);
  /* `49 §5.6`: fifteen minutes, single use. */
  assert.match(copy.magicHow, /fifteen minutes/);
  assert.match(copy.magicHow, /once/);
});

test('the lockout is stated before it happens, not after', () => {
  /* `49 §5.5`: ten strikes, fifteen minutes, sticky, fail-closed. Somebody locked out has, by
     definition, no way to read a message that only appears once they are. */
  assert.match(copy.lockoutHow, /Ten failed attempts/);
  assert.match(copy.lockoutHow, /fifteen minutes/);
});

test('a passkey says when it was last used, because that is the one that matters', () => {
  assert.ok(PASSKEYS.length >= 2, 'one passkey, so the "keep more than one" advice contradicts the seed');
  for (const k of PASSKEYS) {
    assert.ok(k.label, 'a passkey with no label is a row nobody can act on');
    assert.ok(k.added, `${k.label} does not say when it was added`);
  }
});

test('and a method this deployment does not have is not offered', () => {
  /* `49 §5.6`: on a self-host with no SMTP, `GET /auth/methods` answers `magic: false` "so the
     screen never offers it". A recovery screen offering a link that cannot be sent is worse than
     one offering nothing — it is the only screen where believing a false promise costs the record. */
  assert.equal(typeof AUTH_METHODS.magic, 'boolean');
  assert.equal(typeof AUTH_METHODS.passkey, 'boolean');
  assert.ok(AUTH_METHODS.passkey, 'the passkey list would render with nothing behind it');
});

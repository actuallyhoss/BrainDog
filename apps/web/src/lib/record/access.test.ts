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
import { AUTH_METHODS, DEPLOYMENT, DEVICES, INBOX, JOB, JOBS, NOW, PASSKEYS, PEOPLE_ACCESS, ROWS, SNAPSHOTS, SNAPSHOTS_KEPT, SOURCES, VAULT } from './data.ts';
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

/* ── the five areas that were the same stub ──────────────────────────────── */

test('EVERY SETTINGS AREA HAS SOMETHING TO SAY, and it is not the same something', () => {
  /* Seven of the twelve rendered one byte-identical sentence: "Nothing configured yet. This area is
     part of the shell and is not wired in the mock-up." The build's own words about itself, shown
     to a user — `23 §7` forbids explaining the interface, `19 §9` calls `shell` and `mock-up`
     internal vocabulary reaching a user, and `13 §5.2` requires a `no-data-yet` state to be
     specific about what will be here and to carry a real action. It had none. */
  const stub = 'not wired in the mock-up';
  for (const line of Object.values(copy) as unknown[])
    if (typeof line === 'string') assert.ok(!line.includes(stub), `the stub sentence survives: ${line}`);
});

test('the connector rows are `25 §9`\u2019s three states, and the paused one names what to reconnect', () => {
  /* `25 §9` draws this screen — three status words, a last-run line, a next-run line, a failure line
     naming the credential by its VAULT LABEL, and two buttons on the paused row only. */
  assert.deepEqual([...new Set(SOURCES.map((s) => s.state))].sort(), ['failing', 'ok', 'paused']);
  for (const s of SOURCES) {
    if (s.state === 'ok') {
      assert.equal(s.error, undefined, `${s.name} is working and carries a failure`);
      assert.ok(s.nextAt, `${s.name} is working and has nothing scheduled`);
      continue;
    }
    assert.ok(s.error, `${s.name} is ${s.state} and does not say why`);
    /* `13 §6`: the app renders the server's `fix` VERBATIM, so it has to BE a sentence somebody can
       act on rather than a code. */
    assert.ok(s.error.fix.length > 30, `${s.name}'s fix explains nothing`);
    /* AND THE CREDENTIAL BY THE LABEL THE VAULT INDEXES IT UNDER. A pull failure names what to
       reconnect; naming the value would put a secret on a settings screen. */
    assert.ok(VAULT.some((c) => c.label === s.error!.credential), `${s.name} names a credential the vault does not hold`);
  }
  /* Paused means nothing is scheduled until somebody acts. A next run on a paused connector is a
     promise the schedule is not keeping. */
  for (const s of SOURCES) if (s.state === 'paused') assert.equal(s.nextAt, null);
});

test('A DENIED DEVICE ROW IS KEPT', () => {
  /* `12 §6.1` calls "I said no to a request I did not make" the single most important line this
     table can produce. A denial that leaves no trace is a break-in attempt nobody can see
     afterwards — so the seed carries one, or the state renders nowhere and nothing proves it. */
  assert.ok(DEVICES.some((d) => d.state === 'denied'), 'no denied row, so that state is unreachable');
  assert.ok(DEVICES.some((d) => d.state === 'pending'), 'no pending row, so Approve and Deny render nowhere');
  for (const d of DEVICES) {
    assert.ok(copy.deviceState[d.state], `${d.state} has no sentence, so the screen would print the enum`);
    /* `33 §2`'s six surfaces, closed. */
    assert.ok(['web', 'mcp', 'cli', 'email', 'webhook', 'alarm'].includes(d.surface), `${d.name} is over ${d.surface}`);
    /* Only a row that has actually acted has been seen. */
    if (d.state !== 'active') assert.equal(d.lastSeen, null, `${d.name} is ${d.state} and claims to have been used`);
  }
});

test('and the two areas that report rather than offer say which deployment this is', () => {
  /* `03 §6` on exactly this case: "PITR is Cloud-only and this is DOCUMENTED, NOT HIDDEN." So the
     fact is stated where somebody would go looking for the control, rather than the control being
     drawn and then refusing — and `50 §2.2` admits all twelve areas with no per-host conditional. */
  assert.ok(['self-host', 'cloud'].includes(DEPLOYMENT.kind));
  assert.notEqual(copy.restoreSelfHost, copy.restoreCloud);
  assert.notEqual(copy.billingSelfHost, copy.billingCloud);
  /* `49 §8` asks for one line, here, and names the reason: the key "is what a self-hoster must back
     up separately". A copy sealed with a key that is only inside the copy cannot be opened. */
  assert.match(copy.theKeyIs, /back that key up somewhere else/i);
  /* `53 §5.4`: thirty kept, and the sentence says the number rather than the word "some". */
  assert.match(copy.keptHow(SNAPSHOTS_KEPT), new RegExp(String(SNAPSHOTS_KEPT)));
  assert.ok(SNAPSHOTS.length > 0 && SNAPSHOTS.length <= SNAPSHOTS_KEPT);
});

/* ── the seed's own arithmetic ───────────────────────────────────────────── */

test('A SNAPSHOT IS DATED BY THE CLOCK AND COUNTED FROM THE RECORD', () => {
  /* Both halves were typed and both were wrong. The ids read `2026-09-07 … 2026-09-04` against `at`
     values of `day(0) … day(-3)` — 2026-09-03 back to 08-31 — so each row printed an id four days
     after the date its own relative phrase resolved to, and all four sat in the FUTURE of a record
     whose today is Thursday 3 September. This is the only screen that says when the last sealed copy
     was taken, and it carries no other absolute date to check against. */
  for (const snap of SNAPSHOTS) assert.equal(snap.id, snap.at, `${snap.id} is dated ${snap.at}`);
  assert.equal(SNAPSHOTS[0]!.at.slice(0, 10), new Date(NOW).toISOString().slice(0, 10), 'the newest copy is not from today');

  /* And the counts said 1,206 rows for a record holding 93. The nightly DELTAS were right, which is
     what made an invented absolute figure read as a derived one. */
  const held = Object.values(ROWS).reduce((n, list) => n + list.length, 0);
  assert.equal(SNAPSHOTS[0]!.rows, held, `the newest copy claims ${SNAPSHOTS[0]!.rows} rows and the record holds ${held}`);
  /* Older copies hold fewer, because rows were added since. Monotonic, and never above today's. */
  for (let i = 1; i < SNAPSHOTS.length; i++)
    assert.ok(SNAPSHOTS[i]!.rows < SNAPSHOTS[i - 1]!.rows, 'an older copy holds at least as many rows as a newer one');
});

test('a run log reports counts the record can produce', () => {
  /* Three lines in these logs were typed and all three contradicted the record, sitting beside
     siblings that were derived — which is exactly what makes an invented figure believable. A run
     log is a receipt, and a receipt reporting a count the record cannot produce is one nobody can
     check. */
  const outs = [...JOB.events, ...Object.values(JOBS).flatMap((j) => j.events)].map((e) => e.out);

  /* The inbox holds what it holds, and the log said eighteen. */
  const inbox = outs.find((o) => o.includes('arrival'));
  assert.ok(inbox, 'no arrival count in either log');
  assert.match(inbox, new RegExp(`^${INBOX.length} arrivals`), `the log says "${inbox}" and the inbox holds ${INBOX.length}`);

  /* `19 §9` bans the schema's word from a surface a person reads, and one line said `register` two
     lines from another saying `lists`. */
  for (const out of outs) assert.ok(!/\bregisters?\b/.test(out), `a run log says "${out}"`);
});

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
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { copy } from '../copy.ts';
import { AUTH_METHODS, DEPLOYMENT, DEVICES, INBOX, JOB, JOBS, NOW, PASSKEYS, PEOPLE_ACCESS, ROWS, SNAPSHOTS, SNAPSHOTS_KEPT, SOURCES, VAULT } from './data.ts';
import { LEVELS, type Level } from './schema.ts';
import { REGISTERS } from './api.ts';

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

  /**
   * AND `append` IS THE ONE THAT IS NOT WHAT IT SOUNDS LIKE. `20 §1`: *"`create`, `propose` and
   * `log` — and NO READ. The conservative half: an appender sees nothing, **not even what it
   * filed**."* A sentence that lets a reader assume otherwise hands a contractor the whole record.
   *
   * THIS USED TO ASSERT `/not read/`, WHICH THE WRONG SENTENCE SATISFIED. *"Can add rows, and not
   * read the rest"* matched it and says the opposite of the rule — that an appender can read their
   * own submissions — while the correct sentence, *"and read nothing"*, did not match at all. The
   * comment had the rule right and the regex was satisfied by the bug, which is the third time a
   * test on this tree has been found proving a true claim with a false example.
   *
   * So it tests the MEANING in both directions: nothing that implies a partial read, and something
   * that says none.
   */
  const append = copy.levelMeans.append ?? '';
  assert.doesNotMatch(append, /the rest|their own|what they filed|own rows/i, `append implies a partial read: "${append}"`);
  assert.match(append, /read nothing|no read|cannot read|reads nothing/i, `append does not say it reads nothing: "${append}"`);
  /* AND NOTHING ELSE. A sentence for a level that does not exist is a sentence nobody reads. */
  for (const key of Object.keys(copy.levelMeans))
    assert.ok((LEVELS as readonly string[]).includes(key), `levelMeans.${key} is not a level`);
});

test('every seeded person sits on the ladder, or holds nothing on the record and says so', () => {
  for (const p of PEOPLE_ACCESS) {
    /* `null` IS A LEVEL THIS TYPE CAN HOLD AND THE LADDER DOES NOT CONTAIN. `members.ts` shipped two
       wrong readings of it — promoting the highest scoped level, then defaulting to `read` — and the
       browser's mirror typed it non-null, so it could hold neither the answer nor the argument. */
    assert.ok(p.level === null || (LEVELS as readonly string[]).includes(p.level), `${p.name} is at ${p.level}`);
    /* THE INVITATION IS BOUND TO ONE EMAIL (`12 §3`), so it is the identifier and not the name. */
    assert.match(p.email, /^[^@\s]+@[^@\s]+$/, `${p.name} has no address the invitation could bind to`);
  }
});

test('AND SOMEBODY HOLDS NOTHING ON THE RECORD, OR `null` IS A SHAPE NOBODY EVER SEES', () => {
  /**
   * The bookkeeper. `members.ts`'s header gives the whole argument: *"inviting a bookkeeper means
   * showing them everything, and what people do then is not invite the bookkeeper."* A seed where
   * every person has a record level makes `null` a branch the screen carries and nothing renders,
   * which is how the two wrong readings survived as long as they did.
   */
  const scopedOnly = PEOPLE_ACCESS.filter((p) => p.level === null);
  assert.equal(scopedOnly.length, 1, 'nobody is held to named lists, so the matrix has no second row');
  for (const p of scopedOnly)
    assert.ok(p.scoped.length > 0, `${p.name} holds nothing on the record and nothing on any list, which is not an invitation`);
});

test('THE EXCEPTIONS ARE REAL LISTS, AND THEY ARE EXCEPTIONS', () => {
  /* A scoped row naming a register that does not exist is a grant to nothing — `invite` refuses one
     with `REGISTER_UNKNOWN`, and a seed that carried one would be drawing a row the kernel would not
     have accepted. And a scoped row at the person's own record level is not an exception; it is the
     same answer written twice, which is the shape that makes a matrix unreadable. */
  for (const p of PEOPLE_ACCESS) {
    const seen = new Set<string>();
    for (const ex of p.scoped) {
      assert.ok(REGISTERS[ex.register], `${p.name} holds ${ex.register}, which is not a list`);
      assert.ok((LEVELS as readonly string[]).includes(ex.level), `${p.name} holds ${ex.level} on ${ex.register}`);
      assert.notEqual(ex.level, p.level, `${p.name}'s ${ex.register} row repeats their record level instead of excepting it`);
      assert.ok(!seen.has(ex.register), `${p.name} has two rows for ${ex.register}`);
      seen.add(ex.register);
    }
  }
});

test('and the matrix runs in both directions, or half of it is decorative', () => {
  /**
   * A scoped level that could only NARROW the record level would make the bookkeeper's opposite
   * impossible — `read` on the record and `write` on the one list they actually work in — and a
   * screen that only ever narrows teaches the wrong model. Both directions have to be in the seed,
   * or nothing on any screen ever shows one.
   */
  const rung = (l: string | null) => (l === null ? -1 : LEVELS.indexOf(l as Level));
  const pairs = PEOPLE_ACCESS.flatMap((p) => p.scoped.map((ex) => rung(ex.level) - rung(p.level)));
  assert.ok(pairs.some((d) => d < 0), 'no exception narrows a record level');
  assert.ok(pairs.some((d) => d > 0), 'no exception widens one, so the screen can only ever take away');
});

test('the hint says one rule rather than two that contradict each other', () => {
  /* It read *"A level here covers every list. Nobody is added to a new list until you add them."*
     The first clause is `45 §5.1`'s `'*'` fill and the second is `20 §1`'s private-until-granted,
     and both are true of DIFFERENT rows of a matrix the screen was not drawing. */
  assert.doesNotMatch(copy.accessScope, /Nobody is added to a new list/u);
  assert.match(copy.accessScope, /including ones added later/u, 'the hint no longer says the `*` row covers what comes next');
  assert.match(copy.accessScope, /one list/u, 'the hint does not mention the exception it is now possible to make');
});

test('“nothing on the record” has its own sentence, and it is not the bottom rung’s', () => {
  assert.ok(copy.noRecordLevel.length > 0);
  assert.ok(copy.noRecordLevelMeans.length > 20);
  assert.notEqual(copy.noRecordLevelMeans, copy.levelMeans.read);
  /* And it says the part that makes it different from `read`: a list installed tomorrow gives them
     nothing, because the ceiling is exactly the lists they were named on. */
  assert.match(copy.noRecordLevelMeans, /added later|nothing that is added/u);
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

test('every settings area the rail offers has a body written for it', () => {
  /**
   * THE STUB IS GONE, SO NOTHING RENDERS FOR AN AREA WITH NO BRANCH.
   *
   * The `{:else}` used to catch that case, and what it caught in practice was a URL naming no area
   * at all — `/settings/banana` got `<h1>Banana</h1>` and a `no-data-yet` state asserting the
   * feature exists and is merely unconfigured, while `/r/nope`, `/v/nope` and `/p/nope` all refused
   * correctly. An unknown area is a refusal now, and with the costume removed a thirteenth row added
   * to `AREAS` with no branch behind it would draw an empty column in silence.
   *
   * So the guard moved here, where it can say which id is missing. It reads the route as text for
   * the reason the `keys` gate does: the thing being checked is a correspondence between two lists
   * in one file, and there is no smaller way to hold it.
   */
  const route = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'routes', 'settings', '[area]', '+page.svelte'),
    'utf8',
  );
  const ids = [...route.matchAll(/\{ id: '([a-z-]+)', label:/g)].map((m) => m[1]!);
  assert.ok(ids.length >= 12, `only ${ids.length} areas were found in the rail`);
  for (const id of ids)
    assert.ok(route.includes(`area === '${id}'`), `the rail offers ${id} and no branch draws it`);
});

test('EVERY SETTINGS AREA HAS SOMETHING TO SAY, and it is not the same something', () => {
  /* Seven of the twelve rendered one byte-identical sentence: "Nothing configured yet. This area is
     part of the shell and is not wired in the mock-up." The build's own words about itself, shown
     to a user — `23 §7` forbids explaining the interface, `19 §9` calls `shell` and `mock-up`
     internal vocabulary reaching a user, and `13 §5.2` requires a `no-data-yet` state to be
     specific about what will be here and to carry a real action. It had none. */
  /**
   * THE WORDS, NOT ONE SENTENCE.
   *
   * This forbade the literal `not wired in the mock-up`, which was deleted — and the bigger call
   * site went on rendering *"A frontend mock-up. Nothing writes, and no request leaves the page."*
   * on all twelve settings areas, on `/jobs/<id>` and on `/decide/<id>`. A test naming one sentence
   * catches that sentence; `19 §9` names the WORDS, so this does too, and a new sentence carrying
   * one cannot slip past by being differently phrased.
   *
   * Every value is walked, including the functions — a banned word inside a template is on the
   * screen exactly as much as one inside a literal, and `copy.ts` is now half functions.
   */
  const BANNED = ['mock-up', 'mockup', 'the shell', 'predicate', 'declaration', 'projection'];

  /**
   * ONE SET OF ARGUMENTS WAS NOT ENOUGH, AND THE FALLBACK MADE IT WORSE.
   *
   * Calling every function with `('x', 1, 'y')` and grepping the result reached most of them, and
   * for the three that THROW on those arguments — `theseExist`, `diffRefused`, `accentRefused` —
   * the `catch` fell back to `String(v)`, which is the function's SOURCE. A banned word assembled at
   * run time from pieces was invisible to that, and `theseExist` is what `/r/<unknown>` and
   * `/v/<unknown>` print. A review wrote a copy function whose banned word survived and the test
   * stayed green.
   *
   * So: several shapes of argument, and **a throw is a failure, not a fallback**. A sentence this
   * test cannot render is a sentence it cannot check, and saying so out loud is the only honest
   * answer — the alternative is a green light over an unchecked string.
   */
  const SHAPES: unknown[][] = [
    ['x', 1, 'y'],
    [['x', 'y'], 'z', 1],
    ['x', ['y', 'z'], 1],
    [1, 'x', ['y']],
    [{ name: 'x' }, 'y', 2],
  ];

  const said = (v: unknown, at: string): string[] => {
    if (typeof v === 'string') return [v];
    if (typeof v === 'function') {
      const out: string[] = [];
      for (const args of SHAPES) {
        try {
          out.push(String((v as (...a: unknown[]) => unknown)(...args)));
        } catch {
          /* the next shape may suit it */
        }
      }
      assert.ok(out.length > 0, `${at} could not be rendered by any argument shape, so nothing checked it`);
      return out;
    }
    if (v && typeof v === 'object')
      return Object.entries(v as Record<string, unknown>).flatMap(([k, x]) => said(x, `${at}.${k}`));
    return [];
  };

  for (const line of Object.entries(copy).flatMap(([k, v]) => said(v, `copy.${k}`)))
    for (const word of BANNED)
      assert.ok(
        !line.toLowerCase().includes(word),
        `\`${word}\` reaches a reader: ${line.slice(0, 90)}`,
      );
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

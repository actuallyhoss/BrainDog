/**
 * `POST /auth/provision` takes the record's time zone, through `export default`'s own `fetch` and a real `Directory$`.
 * `loop/research-first-sign-in.md` friction 12.
 *
 * THE TIME ZONE WAS ALWAYS `UTC`, AND NOTHING LATER CHANGES IT. `provision()` wrote `tz: 'UTC'` for every record, and
 * the walk searched every settings area and `copy.ts` for a screen that renames a record or moves its zone and found
 * none. For somebody in London that is every digest, every due date and every "today" an hour out for half the year,
 * decided on the night he provisions by a field he was never offered.
 *
 * SO THE BODY CARRIES IT, AND THE WORKER CHECKS IT BEFORE THE DIRECTORY WRITES ANYTHING. `createRecord` checks the zone
 * too (`packages/kernel/src/provision.ts`), but it runs inside the record, after `prepare` has minted the owner as a
 * `dir_person` row: a zone refused there leaves a person in the Directory with no record behind them. So the refused
 * cases below count `dir_person` before and after, and require that the record was never asked to exist. Measured: with
 * the zone checked after `prepare`, the count went up by one on `Mars/Olympus` and that assertion was the one that failed.
 *
 * THE RECORD IS A DOUBLE THAT KEEPS WHAT IT WAS HANDED, because what a record does with its zone is the kernel's and
 * is tested there. What is held here is what the Worker hands it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { bundled, objectStorage } from './bundled-worker.ts';

const HOST = 'app.example.test';
const ORIGIN = `https://${HOST}`;
const OPERATOR = 'operator-key-for-tests-only-0123456789abcdef';

/** A Worker with a real Directory and a record double, and a `provision` that answers the status, the body and what the record was given. */
async function host() {
  const { default: worker, Directory$ } = await bundled();
  const made: { tz?: unknown; owner?: { name?: unknown } }[] = [];
  const records = { idFromName: (n: string) => n, get: () => ({ create: async (args: (typeof made)[number]) => (made.push(args), null) }) };
  /* KEYLESS ON PURPOSE, which `keyless.ts` allows only when it is written down. The keys are `provision.test.ts`'s
     question; a zone is decided before them and has nothing to do with them. */
  const env: Record<string, unknown> = {
    PUBLIC_HOST: HOST,
    SESSION_SECRET: 'fake-session-secret-for-tests-only-0123456789',
    PROVISION_KEY: OPERATOR,
    PROVISION_WITHOUT_KEYS: 'yes',
    RECORD: records,
  };
  const blocked: Promise<unknown>[] = [];
  const storage = objectStorage();
  const state = { storage, id: { toString: () => 'directory' }, blockConcurrencyWhile: (f: () => Promise<unknown>) => (blocked.push(f()), blocked.at(-1)), waitUntil: () => {} };
  const directory = new Directory$(state, env);
  await Promise.all(blocked);
  env['DIRECTORY'] = { idFromName: (n: string) => n, get: () => directory };
  /* THE DIRECTORY MAKES ITS TABLES ON FIRST USE, so counting people before the first provision read `no such table`. */
  (directory as unknown as { knows(id: string): boolean }).knows('rec_00000000000000000000000000');
  const people = () => Number((storage.sql.exec('SELECT count(*) AS n FROM dir_person').toArray()[0] as { n: number }).n);

  const provision = async (body: object) => {
    const res = await worker.fetch(
      new Request(`${ORIGIN}/auth/provision`, {
        method: 'POST',
        headers: { authorization: `Bearer ${OPERATOR}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
      env,
      { waitUntil: () => {} },
    );
    const text = await res.text();
    return { status: res.status, text, json: JSON.parse(text) as { ok: boolean; refusal?: { code: string; at?: string; fix: string } } };
  };
  return { provision, made, people };
}

test('A ZONE IN THE BODY IS THE ZONE THE RECORD IS MADE WITH, not UTC', async () => {
  const { provision, made } = await host();
  const out = await provision({ slug: 'sam', email: 'owner@example.test', name: 'Sam', tz: 'Europe/London' });
  assert.equal(out.status, 200, out.text);
  assert.equal(made.length, 1);
  assert.equal(made[0]!.tz, 'Europe/London', 'the record was made in a zone other than the one the operator typed');
});

test('and it is written in the runtime\'s own spelling, so a zone typed in lower case is the zone every reader finds', async () => {
  /* `Intl` accepts `europe/london` and answers `Europe/London` from `resolvedOptions`. Stored as typed, the record would
     hold a spelling no other record has, and a comparison by name anywhere would call them two zones. */
  const { provision, made } = await host();
  const out = await provision({ slug: 'sam', email: 'owner@example.test', tz: '  europe/london ' });
  assert.equal(out.status, 200, out.text);
  assert.equal(made[0]!.tz, 'Europe/London');
});

test('with no zone in the body the record is UTC, as every record provisioned before this was', async () => {
  const { provision, made } = await host();
  const out = await provision({ slug: 'sam', email: 'owner@example.test', name: 'Sam' });
  assert.equal(out.status, 200, out.text);
  assert.equal(made[0]!.tz, 'UTC');
});

test('A ZONE THE RUNTIME DOES NOT KNOW IS REFUSED AT tz, before the Directory has written a person', async () => {
  const { provision, made, people } = await host();
  /* `Etc/GMT-3` IS `+03:00` UNDER A ZONE'S NAME, AND `EST` IS AN OFFSET SPELLED AS A PLACE. `Intl` answers the first
     back unchanged and the second as `America/Panama`, which has no summer time: for somebody in New York every day
     from March to November an hour out. Both were 200 and stored (`loop/research-batch-forty-six-audit.md` §8), so the
     spelling typed is tested as well as the one `Intl` answers, and lower case is the same spelling to `Intl`.
     `SystemV/EST5` IS THE SAME FAULT UNDER A THIRD PREFIX: measured on Node 24.13 (ICU 77.1), `Intl` knows all twelve
     `SystemV/` names though the tz database dropped them, answers each back as itself, and `SystemV/EST5` is -05:00 in
     July and in January. It was 200 and stored after the `Etc/` rule went in. */
  for (const tz of ['Mars/Olympus', '', 42, '+01:00', 'Etc/GMT-3', 'etc/gmt+5', 'Etc/Zulu', 'EST', 'mst', ' HST ', 'SystemV/EST5', 'systemv/pst8pdt']) {
    const before = people();
    const out = await provision({ slug: 'sam', email: 'owner@example.test', name: 'Sam', tz });
    /* 422, WHICH IS `httpStatus` FOR `VALUE_MALFORMED` everywhere, the slug's own refusal from `prepare` included. */
    assert.equal(out.status, 422, `${JSON.stringify(tz)} was not refused: ${out.text}`);
    assert.equal(out.json.refusal?.code, 'VALUE_MALFORMED', out.text);
    assert.equal(out.json.refusal?.at, 'tz', out.text);
    assert.equal(made.length, 0, `${JSON.stringify(tz)} reached the record`);
    assert.equal(people(), before, `${JSON.stringify(tz)} left a person in the Directory with no record behind them`);
  }
  /* AND THE NAME IS STILL HIS. A refusal that had claimed the slug would make the retry below `ALREADY_KNOWN`, and the
     Directory never gives a name out twice. */
  const retried = await provision({ slug: 'sam', email: 'owner@example.test', name: 'Sam', tz: 'Europe/London' });
  assert.equal(retried.status, 200, retried.text);
  assert.equal(made.length, 1);
});

test('the refusal of an offset names a zone that is a place, so the fix is something to type', async () => {
  const { provision } = await host();
  const out = await provision({ slug: 'sam', email: 'owner@example.test', tz: 'EST' });
  assert.equal(out.status, 422, out.text);
  assert.match(out.json.refusal?.fix ?? '', /America\/New_York/, 'the refusal of EST does not say which zone New York is');
});

/**
 * Every three-letter word the runtime takes as a time zone, in upper case, found by asking `Intl` for each of the
 * 17,576 and keeping those it does not throw on.
 *
 * ASKED AND NOT LISTED, because the list written from memory was the fault. The Worker refused `EST`, `MST` and `HST`,
 * the three `loop/research-batch-forty-six-audit.md` §8 named, and took the other twenty-five of the same kind:
 * `BST` was stored as `Asia/Dhaka` and `IST` as `Asia/Calcutta` (`loop/research-batch-forty-eight-audit.md` §1). On
 * Node 24.13 (ICU 77.1, tz 2025b) this answers thirty-eight names. A runtime that gains or drops one fails the test
 * below by name instead of passing it in silence.
 */
function threeLetterZones(): string[] {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const found: string[] = [];
  for (const a of letters)
    for (const b of letters)
      for (const c of letters) {
        try {
          new Intl.DateTimeFormat('en', { timeZone: a + b + c });
          found.push(a + b + c);
        } catch {
          /* not a zone to this runtime, which is most of them */
        }
      }
  return found;
}

/**
 * The three-letter names that stay, each for a reason that is not the typed word's: UTC by three spellings, the four
 * tz database names that carry a summer rule and are answered as a place that keeps it, and the three country links.
 */
const THREE_LETTERS_KEPT: ReadonlySet<string> = new Set(['UTC', 'UCT', 'GMT', 'CET', 'EET', 'MET', 'WET', 'PRC', 'ROC', 'ROK']);

test('EVERY THREE-LETTER ID ICU KEEPS FROM JAVA IS REFUSED AT tz, the whole set the runtime answers and not the three first found', async () => {
  const asked = threeLetterZones();
  /* A RUNTIME WITH NO ZONES WOULD PASS THIS BY REFUSING NOTHING, so the enumeration is held to have found the name the
     rule began with. */
  assert.ok(asked.includes('EST'), `the runtime answered no EST, so the set below proves nothing: ${asked.join(' ')}`);
  const legacy = asked.filter((z) => !THREE_LETTERS_KEPT.has(z));
  const { provision, made, people } = await host();
  const stored: string[] = [];
  /* EACH IN UPPER CASE AS ASKED, AND THREE AS A PERSON TYPES THEM: `Intl` reads `pst` and ` cst ` as the same names.
     A slug each, so one taken does not turn the next into `ALREADY_KNOWN` at `slug` and the list below names them all. */
  for (const [i, tz] of [...legacy, 'pst', ' cst ', 'Bst'].entries()) {
    const out = await provision({ slug: `abbr-${i}`, email: `abbr-${i}@example.test`, name: 'Sam', tz });
    /* AT `tz`, NOT MERELY 422: a refusal at another field would pass a status check and say nothing about the zone. */
    if (out.status !== 422 || out.json.refusal?.at !== 'tz') stored.push(`${JSON.stringify(tz)} -> ${String(made.at(-1)?.tz)}`);
  }
  assert.deepEqual(stored, [], `stored as a place: ${stored.join(', ')}`);
  assert.equal(made.length, 0);
  assert.equal(people(), 0, 'a refused zone left a person in the Directory with no record behind them');
});

test('and the zones that are a place by an old name stay: UTC, CET and its kind, the country links and EST5EDT and its kind', async () => {
  /* NOT EVERY OLD SPELLING IS AN ABBREVIATION. `GB` is answered as `Europe/London`, `EST5EDT` as `America/New_York`
     with its summer rule, and `CET` as `Europe/Brussels`, each the arithmetic the typist meant. */
  const kept = [...THREE_LETTERS_KEPT, 'GB', 'NZ', 'EST5EDT', 'CST6CDT', 'MST7MDT', 'PST8PDT'];
  const { provision, made } = await host();
  const refused: string[] = [];
  for (const [i, tz] of kept.entries()) {
    const out = await provision({ slug: `kept-${i}`, email: `kept-${i}@example.test`, tz });
    if (out.status !== 200) refused.push(`${tz}: ${out.text}`);
  }
  assert.deepEqual(refused, []);
  assert.equal(made.length, kept.length);
  /* AND STORED AS THE PLACE, not as the word: only UTC is a zone that is three letters long. */
  const lettered = made.map((m) => String(m.tz)).filter((tz) => /^[A-Z]{3}$/.test(tz) && tz !== 'UTC');
  assert.deepEqual(lettered, [], 'a kept name was stored as the word typed');
});

test('the refusal of an abbreviation says which word it read, and that the runtime would have put the record somewhere else', async () => {
  /* `BST` IS BRITISH SUMMER TIME TO THE PERSON WHO TYPES IT AND BANGLADESH TO ICU. A refusal that says only "an
     abbreviation such as EST" leaves him to guess why his word was wrong. */
  const { provision } = await host();
  const out = await provision({ slug: 'sam', email: 'owner@example.test', tz: ' bst ' });
  assert.equal(out.status, 422, out.text);
  assert.match(out.json.refusal?.fix ?? '', /\bBST\b/, 'the refusal does not name the word it refused');
  assert.match(out.json.refusal?.fix ?? '', /Asia\/Dhaka/, 'the refusal does not say where the runtime would have put the record');
  assert.match(out.json.refusal?.fix ?? '', /Europe\/London/, 'the refusal does not name a zone that is a place');
});

test('THE TWO SPELLINGS OF UTC UNDER Etc/ ARE STILL UTC, because they are not an offset from anywhere', async () => {
  const { provision, made } = await host();
  for (const [slug, tz] of [['utc-a', 'Etc/UTC'], ['utc-b', 'Etc/GMT']] as const) {
    const out = await provision({ slug, email: `${slug}@example.test`, tz });
    assert.equal(out.status, 200, `${tz}: ${out.text}`);
  }
  assert.deepEqual(made.map((m) => m.tz), ['UTC', 'UTC']);
});

test('A NAME WITH AN ANGLE BRACKET IS REFUSED AT name, because the checker once printed <your name> to be edited', async () => {
  /* THE NAME IS FIXED AT PROVISION AND IS THE PASSKEY'S DISPLAY NAME, and the slug and the email each refused their
     placeholder while this one was taken: `{ name: '<your name>' }` was 200 and the owner's `me` said
     `"name":"<your name>"` for good (`loop/research-batch-forty-six-audit.md` §7). Nobody is called `<` or `>`. */
  const { provision, made, people } = await host();
  for (const name of ['<your name>', 'Sam <sam@example.test>', 'a > b']) {
    const before = people();
    const out = await provision({ slug: 'sam', email: 'owner@example.test', name, tz: 'Europe/London' });
    assert.equal(out.status, 422, `${JSON.stringify(name)} was not refused: ${out.text}`);
    assert.equal(out.json.refusal?.code, 'VALUE_MALFORMED', out.text);
    assert.equal(out.json.refusal?.at, 'name', out.text);
    assert.equal(made.length, 0, `${JSON.stringify(name)} reached the record`);
    assert.equal(people(), before, `${JSON.stringify(name)} left a person in the Directory with no record behind them`);
  }
  const retried = await provision({ slug: 'sam', email: 'owner@example.test', name: 'Sam', tz: 'Europe/London' });
  assert.equal(retried.status, 200, retried.text);
});

test('A PLACEHOLDER IN ANY BRACKETS IS REFUSED AT name, and so are the words "your name" and the brackets as entities', async () => {
  /* THE GUARD WAS ONE PAIR OF BRACKETS, `/[<>]/`. Seven of these were 200 on a local Worker and stored as the owner's
     name for good (`loop/research-batch-forty-eight-audit.md` §5, `names.mjs`), and all fifteen were 200 through this
     file under that rule: the full-width pair, the single guillemets, the CJK and the mathematical angle brackets,
     square, curly and round in two widths, the HTML entities, and the words with no brackets at all. `«Name»` was
     added by the checker: the single guillemets were refused and the double ones, the same kind of mark and the more
     common, were 200 and stored. */
  const { provision, made, people } = await host();
  const taken: string[] = [];
  /* A SLUG EACH, so one taken does not hide the rest behind `ALREADY_KNOWN` at `slug`. */
  for (const [i, name] of ['＜your name＞', '‹your name›', '«Name»', '〈your name〉', '⟨your name⟩', '[your name]', '{your name}', '(your name)', '[Name]', '（名前）', '&lt;your name&gt;', 'Sam &LT;', 'YOUR NAME', 'Your Name', 'Put your name here', ' [ Sam ] '].entries()) {
    const out = await provision({ slug: `held-${i}`, email: `held-${i}@example.test`, name, tz: 'Europe/London' });
    if (out.status !== 422 || out.json.refusal?.at !== 'name') taken.push(`${JSON.stringify(name)} -> ${out.status} ${out.json.refusal?.at ?? ''}`);
  }
  assert.deepEqual(taken, [], `taken as the owner's name for good: ${taken.join(' | ')}`);
  assert.equal(made.length, 0);
  assert.equal(people(), 0, 'a refused name left a person in the Directory with no record behind them');
});

test('but a name with a bracket inside it is a name: the bracket has to open it and close it', async () => {
  /* `Sam (work)` IS HOW SOMEBODY TELLS TWO OF HIS OWN PASSKEYS APART, and a rule that refused a bracket anywhere
     would take that from him. So the rule is the name's two ends, and each of these is stored as typed. */
  const { provision, made } = await host();
  const names = ['Sam (work)', 'Zoë [Z] O’Brien', '(Ada) Lovelace', 'Bo {B} Tanner', 'Yourname'];
  for (const [i, name] of names.entries()) {
    const out = await provision({ slug: `name-${i}`, email: `name-${i}@example.test`, name, tz: 'Europe/London' });
    assert.equal(out.status, 200, `${JSON.stringify(name)} was refused: ${out.text}`);
  }
  assert.deepEqual(made.map((m) => m.owner?.name), names);
});

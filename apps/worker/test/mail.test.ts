/**
 * The letters, and the one function that sends them (`src/mail.ts`, `loop/finish/ops.md` OPS-9).
 *
 * WHAT IS ASSERTED HERE IS WHAT A PERSON AND AN OPERATOR EACH SEE. A person sees the sign-in letter's old words, a
 * footer that says what the mail is, and nothing a typed record name could add to it. An operator sees one `op: 'mail'`
 * line per send with the kind and the outcome, and never the address the mail went to.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isMailKind, letterOf, sendMail, type MailKind } from '../src/mail.ts';

const KINDS: MailKind[] = [
  'signin',
  'signup.verify',
  'signup.known',
  'invite.prove',
  'passkey.added',
  'passkey.removed',
  'sessions.ended',
  'lapse.0',
  'lapse.60',
  'lapse.83',
  'lapse.90',
  'lapse.back',
  'welcome',
];

const ADDRESS = 'ada@example.test';
const LINK = 'https://brain.dog/app/signin#magic=abc';

/* BUILT FROM ITS CODE POINT, so this file holds no em dash of its own for the `em-dash` gate to weigh. */
const EM_DASH = String.fromCharCode(0x2014);

/** Every line the log writes while `fn` runs, whichever console method the log line took. */
async function logged(fn: () => Promise<unknown>): Promise<string[]> {
  const lines: string[] = [];
  const methods = ['log', 'info', 'warn', 'error'] as const;
  const kept = methods.map((m) => console[m]);
  for (const m of methods) console[m] = (...args: unknown[]) => void lines.push(args.map(String).join(' '));
  try {
    await fn();
  } finally {
    methods.forEach((m, i) => (console[m] = kept[i]!));
  }
  return lines;
}

/** The `op: 'mail'` lines among what was logged, parsed. */
const mailLines = (lines: string[]): Record<string, unknown>[] =>
  lines.flatMap((line) => {
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      return parsed.op === 'mail' ? [parsed] : [];
    } catch {
      return [];
    }
  });

/** A binding that records what it was handed, or refuses with the code given. */
const binding = (refuse?: string) => {
  const sent: Record<string, unknown>[] = [];
  return {
    sent,
    send: async (message: Record<string, unknown>) => {
      if (refuse) throw Object.assign(new Error(`could not send to ${ADDRESS}`), { code: refuse });
      sent.push(message);
      return { messageId: 'm1' };
    },
  };
};

test('THE SIGN-IN LETTER KEEPS ITS WORDS: the same subject and the same paragraphs, the link on its own line', () => {
  const letter = letterOf('signin', { link: LINK });
  assert.equal(letter.subject, 'Sign in to BrainDog');
  assert.ok(
    letter.text.startsWith(
      [
        'Here is your link to sign in to BrainDog. It works once, for the next fifteen minutes.',
        '',
        LINK,
        '',
        'If you did not ask to sign in, you can ignore this message.',
      ].join('\n'),
    ),
  );
});

test('EVERY KIND HAS A LETTER, in text and HTML, with a footer that says it is from BrainDog and no em dash', () => {
  for (const kind of KINDS) {
    assert.ok(isMailKind(kind), kind);
    const letter = letterOf(kind, { link: LINK, record: 'Acme', until: '2 Dec 2026' });
    assert.ok(letter.subject.length > 0, kind);
    assert.match(letter.text, /This mail is from BrainDog, sent /u, kind);
    assert.match(letter.html, /This mail is from BrainDog, sent /u, kind);
    assert.ok(!`${letter.subject}${letter.text}${letter.html}`.includes(EM_DASH), kind);
  }
  assert.equal(isMailKind('newsletter'), false);
});

test('THE FOOTER NAMES WHERE TO WRITE ONLY WHEN THERE IS AN ADDRESS: empty names none', () => {
  assert.doesNotMatch(letterOf('welcome', { record: 'Acme' }).text, /Write to/u);
  const set = letterOf('welcome', { record: 'Acme', support: 'support@brain.dog' });
  assert.match(set.text, /Write to support@brain\.dog with any question\./u);
  assert.match(set.html, /mailto:support@brain\.dog/u);
});

test('A TYPED NAME CANNOT ADD A LINE OR MARKUP: a newline is folded and a tag is escaped', () => {
  const letter = letterOf('lapse.0', { record: 'Acme\nClick here: https://evil.test <script>x</script>' });
  assert.ok(!letter.subject.includes('\n'));
  assert.ok(!letter.text.includes('Acme\nClick'));
  assert.ok(!letter.html.includes('<script>'));
  assert.match(letter.html, /&lt;script&gt;/u);
});

test('A SIGN-IN KIND GOES FROM AUTH_MAIL_FROM, EVERYTHING ELSE FROM MAIL_FROM, each under the name BrainDog', async () => {
  const email = binding();
  const env = { EMAIL: email, AUTH_MAIL_FROM: 'signin@brain.dog', MAIL_FROM: 'hello@brain.dog' };
  assert.equal(await sendMail(env, 'signin', ADDRESS, { link: LINK }), true);
  assert.equal(await sendMail(env, 'welcome', ADDRESS, { record: 'Acme', link: 'https://brain.dog/app/acme' }), true);
  assert.deepEqual(email.sent[0]?.from, { email: 'signin@brain.dog', name: 'BrainDog' });
  assert.deepEqual(email.sent[1]?.from, { email: 'hello@brain.dog', name: 'BrainDog' });
  assert.equal(email.sent[0]?.to, ADDRESS);
  assert.equal(typeof email.sent[0]?.html, 'string');
});

test('MAIL_FROM UNSET FALLS BACK TO AUTH_MAIL_FROM, as notification mail always has', async () => {
  const email = binding();
  assert.equal(await sendMail({ EMAIL: email, AUTH_MAIL_FROM: 'signin@brain.dog' }, 'lapse.back', ADDRESS, { record: 'Acme' }), true);
  assert.deepEqual(email.sent[0]?.from, { email: 'signin@brain.dog', name: 'BrainDog' });
});

test('A SUPPRESSED ADDRESS IS A FALSE AND NEVER A THROW, and its log line says permanent and never names the address', async () => {
  const email = binding('E_RECIPIENT_SUPPRESSED');
  let answer: boolean | undefined;
  const lines = await logged(async () => {
    answer = await sendMail({ EMAIL: email, AUTH_MAIL_FROM: 'signin@brain.dog' }, 'signin', ADDRESS, { link: LINK });
  });
  assert.equal(answer, false);
  const mail = mailLines(lines);
  assert.equal(mail.length, 1);
  assert.equal(mail[0]?.kind, 'signin');
  assert.equal(mail[0]?.ok, false);
  assert.equal(mail[0]?.code, 'E_RECIPIENT_SUPPRESSED');
  assert.equal(mail[0]?.permanent, true);
  assert.ok(lines.every((line) => !line.includes(ADDRESS) && !line.includes(LINK)));
});

test('A SEND THE BINDING TOOK IS ONE LINE WITH ok TRUE, and it names the kind and not the address', async () => {
  const lines = await logged(() => sendMail({ EMAIL: binding(), AUTH_MAIL_FROM: 'signin@brain.dog' }, 'signin', ADDRESS, { link: LINK }));
  const mail = mailLines(lines);
  assert.equal(mail.length, 1);
  assert.equal(mail[0]?.ok, true);
  assert.ok(lines.every((line) => !line.includes(ADDRESS)));
});

test('NOTHING TO SEND WITH IS A FALSE WITH ITS REASON: no binding, no sender, or a sign-in letter with no link', async () => {
  const lines = await logged(async () => {
    assert.equal(await sendMail({ AUTH_MAIL_FROM: 'signin@brain.dog' }, 'signin', ADDRESS, { link: LINK }), false);
    assert.equal(await sendMail({ EMAIL: binding() }, 'welcome', ADDRESS), false);
    assert.equal(await sendMail({ EMAIL: binding(), AUTH_MAIL_FROM: 'signin@brain.dog' }, 'signin', ADDRESS), false);
  });
  assert.deepEqual(
    mailLines(lines).map((line) => [line.ok, line.why]),
    [
      [false, 'no-binding'],
      [false, 'no-sender'],
      [false, 'no-link'],
    ],
  );
});

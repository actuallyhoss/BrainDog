/**
 * The letters, and the one function that sends them (`src/mail.ts`).
 *
 * WHAT IS ASSERTED HERE IS WHAT A PERSON AND AN OPERATOR EACH SEE. A person sees the sign-in letter's old words, a
 * footer that says what the mail is, and nothing a typed record name could add to it. An operator sees one `op: 'mail'`
 * line per send with the kind and the outcome, and never the address the mail went to.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { existsSync } from 'node:fs';

import { isMailKind, letterOf, OPS_QUIET_MS, opsAlert, SENDER, recordLetter, sendMail, type MailKind } from '../src/mail.ts';

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
  'email.change',
  'email.changed',
  'usage.notice',
];

/** The kinds whose letter is a link, and so carries the one button. */
const LINKED: MailKind[] = ['signin', 'signup.verify', 'signup.known', 'invite.prove', 'email.change', 'lapse.0', 'lapse.60', 'lapse.83', 'lapse.back', 'welcome'];

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

test('EVERY LETTER WEARS THE ONE PAGE: the mark from brain.dog, a card of at most 600, a preheader, a dark scheme, and the postal footer', () => {
  for (const kind of KINDS) {
    const { html, text } = letterOf(kind, { link: LINK, record: 'Acme', until: '2 Dec 2026', support: 'support@brain.dog', say: 'Acme has used 80% of its allowance.' });
    /* The header's mark is an absolute https image the site serves, and the file is there to serve. */
    assert.match(html, /<img src="https:\/\/brain\.dog\/email\/mark\.png" width="36" height="28" alt=""/u, kind);
    assert.match(html, /max-width:600px/u, kind);
    assert.match(html, /<div style="display:none;[^"]*">[^<&]+&#847;/u, kind);
    assert.match(html, /@media \(prefers-color-scheme:dark\)\{/u, kind);
    assert.match(html, /<meta name="color-scheme" content="light dark">/u, kind);
    assert.ok(html.includes(SENDER), kind);
    assert.ok(text.endsWith(SENDER), kind);
    /* Email-client safe: no stylesheet to fetch, no web font, no script, and every image absolute. */
    assert.doesNotMatch(html, /<link\b|@import|@font-face|<script/u, kind);
    for (const [, src] of html.matchAll(/<img src="([^"]*)"/gu)) assert.match(src!, /^https:\/\//u, kind);
    /* One prominent button where the letter is a link, drawn for Outlook too, and none where it is not. */
    const buttons = [...html.matchAll(/class="bd-btn"/gu)].length;
    assert.equal(buttons, LINKED.includes(kind) ? 1 : 0, kind);
    if (LINKED.includes(kind)) assert.match(html, /<v:roundrect [^>]*href="https:\/\/brain\.dog\/app\/signin#magic=abc"/u, kind);
  }
  assert.ok(existsSync(new URL('../../site/static/email/mark.png', import.meta.url)), 'apps/site/static/email/mark.png is served as https://brain.dog/email/mark.png');
});

test('THE BUTTON SAYS WHAT IT DOES, and a link that works once also shows itself under it as text', () => {
  const button = (kind: MailKind, vars = {}) => /<a href="[^"]*" target="_blank" style="display:inline-block;[^"]*">([^<]*)<\/a>/u.exec(letterOf(kind, { link: LINK, ...vars }).html)?.[1];
  assert.equal(button('signin'), 'Sign in to BrainDog');
  assert.equal(button('signup.verify'), 'Finish making your record');
  assert.equal(button('invite.prove'), 'Accept the invitation');
  assert.equal(button('email.change'), 'Confirm this address');
  assert.equal(button('welcome', { record: 'Acme' }), 'Open Acme');
  assert.equal(button('lapse.0'), 'Open your record');
  assert.match(letterOf('signin', { link: LINK }).html, /Or paste this link into your browser:<br><a href="https:\/\/brain\.dog\/app\/signin#magic=abc"/u);
  assert.doesNotMatch(letterOf('welcome', { link: LINK, record: 'Acme' }).html, /Or paste this link/u);
});

test('THE WELCOME READS WITHOUT "OPEN IT HERE": the button says it, and the text puts the link on its own line', () => {
  const letter = letterOf('welcome', { record: 'Acme', link: 'https://brain.dog/app/acme/start' });
  assert.ok(letter.text.startsWith('Acme is ready.\n\nhttps://brain.dog/app/acme/start\n\n'), letter.text);
  assert.doesNotMatch(letter.html, /Open it here/u);
});

test("A RECORD'S OWN MAIL IS DRAWN IN THE SAME PAGE: a digest's sections, figures and rows, and plain text with no markup", () => {
  const source = [
    '# Monday',
    '',
    '## Cash',
    '',
    '```stat',
    'Cash | £10,540.00',
    '```',
    '',
    '## Overdue',
    '',
    '```table',
    'Who | Amount',
    'Pell & Vine | £400.00',
    'A \\| B <b> | £12.00',
    '```',
    '',
  ].join('\n');
  const letter = recordLetter('Monday', source, 'digest.monday', 'support@brain.dog');
  assert.equal(letter.subject, 'Monday');
  /* The dialect's own title is the subject, said once in the card. */
  assert.equal([...letter.html.matchAll(/>Monday</gu)].length, 2, 'the <title> and the <h1>');
  assert.match(letter.html, /<h2[^>]*>Cash<\/h2>/u);
  assert.match(letter.html, /font-size:28px[^>]*>£10,540\.00<\/p>/u);
  assert.match(letter.html, />Pell &amp; Vine<\/td>/u);
  assert.match(letter.html, />A \| B &lt;b&gt;<\/td>/u);
  assert.match(letter.html, /sent because a digest on a BrainDog record you own is set to mail this address\./u);
  assert.match(letter.html, /mailto:support@brain\.dog/u);
  assert.doesNotMatch(letter.text, /```|^#/mu);
  assert.ok(letter.text.startsWith('Monday\n\nCash\n----\n\nCash: £10,540.00\n\nOverdue\n-------\n\nWho  |  Amount\nPell & Vine  |  £400.00\nA | B <b>  |  £12.00\n\n'), letter.text);
  assert.ok(letter.text.endsWith(`Write to support@brain.dog with any question.\n${SENDER}`));
  assert.ok(!`${letter.subject}${letter.text}${letter.html}`.includes(EM_DASH));
});

test('AN URGENT NOTICE IS ITS SENTENCE AND ITS REASON: the sentence is the title, and the text keeps both', () => {
  const letter = recordLetter('Invoice 12 is 30 days overdue', 'Invoice 12 is 30 days overdue\n\nThe rule chase asked for it.');
  assert.ok(letter.text.startsWith('Invoice 12 is 30 days overdue\n\nThe rule chase asked for it.\n\nThis mail is from BrainDog, sent because a BrainDog record you own has something that needs you now.'));
  assert.match(letter.html, /<h1[^>]*>Invoice 12 is 30 days overdue<\/h1><p class="bd-ink2"[^>]*>The rule chase asked for it\.<\/p><\/td>/u);
  assert.doesNotMatch(letter.text, /Write to/u);
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

/* THE OPS MAIL KEEPS ITS WINDOW IN MODULE STATE, so each test below starts an hour after the last one's clock. */
const HOUR = 60 * 60 * 1000;
const OPS = { OPS_ALERT_TO: 'ops@example.test', AUTH_MAIL_FROM: 'hello@brain.dog', BRAINDOG_BUILD: '20260929+abc' };
const CRASH = { op: 'crash', ref: 'r-1', where: '/api/boot', error: `TypeError: row ${ADDRESS}` } as const;

test('AN OPS MAIL IS OFF WITHOUT OPS_ALERT_TO, and sends nothing', async () => {
  const email = binding();
  assert.equal(await opsAlert({ ...OPS, OPS_ALERT_TO: '', EMAIL: email }, CRASH, undefined, 1 * HOUR), false);
  assert.equal(email.sent.length, 0);
});

test('A CRASH MAILS ITS REF, DOOR, BUILD AND RUNBOOK ONCE IN 15 MINUTES, and never the thrown sentence', async () => {
  const email = binding();
  const env = { ...OPS, EMAIL: email };
  const t = 10 * HOUR;
  await logged(async () => {
    assert.equal(await opsAlert(env, CRASH, undefined, t), true);
    assert.equal(await opsAlert(env, CRASH, undefined, t + OPS_QUIET_MS - 1), false);
    assert.equal(await opsAlert(env, { op: 'refuse', rec: 'rec_1', code: 'FORMAT_NEWER_THAN_READER' }, undefined, t + 1), true);
    assert.equal(await opsAlert(env, CRASH, undefined, t + OPS_QUIET_MS), true);
  });
  assert.equal(email.sent.length, 3);
  const text = String(email.sent[0]?.text);
  for (const said of ['op: crash', 'ref: r-1', 'where: /api/boot', 'build: 20260929+abc', 'Rolling back']) assert.ok(text.includes(said), said);
  assert.ok(!text.includes('TypeError') && !text.includes(ADDRESS));
  assert.equal(email.sent[0]?.to, 'ops@example.test');
  assert.ok(String(email.sent[1]?.text).includes('53 §5.3'));
});

test("THE DIRECTORY'S WINDOW HOLDS ACROSS ISOLATES: a claim that says no sends nothing, and one that throws still sends", async () => {
  const email = binding();
  const env = { ...OPS, EMAIL: email };
  assert.equal(await opsAlert(env, CRASH, async () => false, 20 * HOUR), false);
  await logged(async () => {
    assert.equal(
      await opsAlert(env, CRASH, async () => Promise.reject(new Error('directory down')), 21 * HOUR),
      true,
    );
  });
  assert.equal(email.sent.length, 1);
});

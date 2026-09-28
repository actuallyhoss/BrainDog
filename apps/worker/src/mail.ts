/**
 * Every mail the Worker sends a person, and the one function that sends it (`loop/finish/ops.md` 4.0 F).
 *
 * ONE MODULE, SO THE LETTERS CANNOT DRIFT. Sign-in, sign-up, an invitation's proof, a passkey notice, the lapse ladder
 * and the welcome after payment each write their words here and nowhere else, as text and as simple HTML, with the
 * same footer naming what the mail is. A caller hands over a kind and the few values its letter needs.
 *
 * `sendMail` NEVER THROWS. A mail is sent beside an answer (inside `ctx.waitUntil`) or by the nightly walk, and neither
 * may be broken by a transport that refused: the caller reads `false` and decides whether to try again. Every send
 * writes one `op: 'mail'` line with the kind and the outcome, and never the address, the link or the letter, because a
 * log line that quoted either has published a way into somebody's record to wherever logs go.
 *
 * IT IMPORTS NOTHING FROM `cloudflare:`, as `deliver.ts` does not, so the tests load it in a bare Node process and
 * hand it an object literal for the binding.
 */

import { op } from './oplog.ts';

/** Every mail this Worker sends, by what it is for. The lapse kinds name the day of the ladder they belong to. */
export type MailKind =
  | 'signin'
  | 'signup.verify'
  | 'signup.known'
  | 'invite.prove'
  | 'passkey.added'
  | 'passkey.removed'
  | 'sessions.ended'
  | 'email.change'
  | 'email.changed'
  | 'lapse.0'
  | 'lapse.60'
  | 'lapse.83'
  | 'lapse.90'
  | 'lapse.back'
  | 'welcome'
  | 'usage.notice';

const KINDS: ReadonlySet<string> = new Set<MailKind>([
  'signin',
  'signup.verify',
  'signup.known',
  'invite.prove',
  'passkey.added',
  'passkey.removed',
  'sessions.ended',
  'email.change',
  'email.changed',
  'lapse.0',
  'lapse.60',
  'lapse.83',
  'lapse.90',
  'lapse.back',
  'welcome',
  'usage.notice',
]);

/** Whether a word a door handed on names one of this module's letters. */
export const isMailKind = (kind: unknown): kind is MailKind => typeof kind === 'string' && KINDS.has(kind);

/**
 * THE KINDS SIGN-IN'S FLOWS SEND, from `AUTH_MAIL_FROM`: the address sign-in links already go out from, which is the one
 * this deployment knows Email Service accepts. Everything else goes from `MAIL_FROM`, falling back to the same.
 */
const SIGN_IN_KINDS: ReadonlySet<MailKind> = new Set<MailKind>([
  'signin',
  'signup.verify',
  'signup.known',
  'invite.prove',
  'passkey.added',
  'passkey.removed',
  'sessions.ended',
  'email.change',
  'email.changed',
]);

/** The kinds whose whole point is a link. Without one there is nothing to send, and `sendMail` says so and sends nothing. */
const NEEDS_LINK: ReadonlySet<MailKind> = new Set<MailKind>(['signin', 'signup.verify', 'signup.known', 'invite.prove', 'email.change']);

/**
 * What a letter may say beyond its own words. Each is optional, and a letter leaves out the sentence a value is missing
 * from rather than printing an empty one.
 *
 * `until` IS A DAY ALREADY WRITTEN FOR A PERSON ("2 Dec 2026"), because the caller holds the clock and the record's
 * zone and this module holds neither. `support` is filled by `sendMail` from `SUPPORT_ADDRESS` when the caller gives none.
 */
export type MailVars = {
  /** The one link the letter is for: a sign-in link, a proof, the billing page, the record. */
  link?: string | undefined;
  /** The record's name as a person reads it. */
  record?: string | undefined;
  /** The day the next step of a lapse happens, written for a person. */
  until?: string | undefined;
  /** The name that was asked for, when the record was made under another because it had been taken. */
  asked?: string | undefined;
  /** A passkey's label, for the notice that it was added or removed. */
  label?: string | undefined;
  /** Where to write with a question. Empty, and the footer names no address. */
  support?: string | undefined;
  /** The one sentence the Directory already wrote, printed whole as the letter's body (`usage.notice`, MTR-2). */
  say?: string | undefined;
};

/** One letter: its subject, its text, and the same words as simple HTML. */
export type Letter = { subject: string; text: string; html: string };

/**
 * A value as a line of a letter: control characters folded to a space and the ends trimmed.
 *
 * A NEWLINE IN A VALUE WOULD WRITE A LINE THE LETTER NEVER HAD. A record's name is typed by a person, so a name with a
 * line break in it could add a sentence under BrainDog's own, or a header to the subject.
 */
const flat = (value: string | undefined): string => (value ?? '').replace(/[\u0000-\u001f\u007f]+/gu, ' ').trim();

/** Text as HTML: every character that could open markup or leave an attribute, escaped. */
const escaped = (value: string): string =>
  value.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;').replace(/'/gu, '&#39;');

/** One paragraph of a letter: its words, or the link it points at. */
type Part = { say: string } | { link: string };

/** Why each mail was sent, the footer's first sentence, so a mail nobody expected still says where it came from. */
const WHY: Record<MailKind, string> = {
  signin: 'because somebody asked to sign in with this address',
  'signup.verify': 'because somebody asked to make a BrainDog record with this address',
  'signup.known': 'because somebody asked to make a BrainDog record with this address',
  'invite.prove': 'because somebody accepted an invitation to a BrainDog record with this address',
  'passkey.added': 'because the passkeys that sign in with this address changed',
  'passkey.removed': 'because the passkeys that sign in with this address changed',
  'sessions.ended': 'because every session for this address ended',
  'email.change': 'because somebody asked to sign in to BrainDog with this address instead of their old one',
  'email.changed': 'because the address that signs in to this BrainDog account changed',
  'lapse.0': 'about billing for a record this address pays for or owns',
  'lapse.60': 'about billing for a record this address pays for or owns',
  'lapse.83': 'about billing for a record this address pays for or owns',
  'lapse.90': 'about billing for a record this address pays for or owns',
  'lapse.back': 'about billing for a record this address pays for or owns',
  welcome: 'because a BrainDog record was made for this address',
  'usage.notice': "about this record's usage this month",
};

/**
 * Each letter's subject and paragraphs. A paragraph that needs a value it was not given is left out.
 *
 * THE SIGN-IN LETTER KEEPS THE WORDS IT HAS ALWAYS SENT, line for line, with the footer under them: a person who has
 * had one before sees the same mail, and a filter somebody wrote against it still matches.
 */
function partsOf(kind: MailKind, v: { [K in keyof MailVars]-?: string }): { subject: string; parts: Part[] } {
  const record = v.record || 'Your record';
  const link: Part[] = v.link ? [{ link: v.link }] : [];
  switch (kind) {
    case 'signin':
      return {
        subject: 'Sign in to BrainDog',
        parts: [
          { say: 'Here is your link to sign in to BrainDog. It works once, for the next fifteen minutes.' },
          ...link,
          { say: 'If you did not ask to sign in, you can ignore this message.' },
        ],
      };
    case 'signup.verify':
      return {
        subject: 'Finish making your BrainDog record',
        parts: [
          { say: 'Here is your link to finish making your BrainDog record. It proves this address is yours, and it works once.' },
          ...link,
          { say: 'If you did not ask for a BrainDog record, you can ignore this message and nothing is made.' },
        ],
      };
    case 'signup.known':
      return {
        subject: 'Sign in to BrainDog',
        parts: [
          { say: 'Somebody asked to make a BrainDog record with this address, and this address can already sign in. Here is a link to sign in instead. It works once.' },
          ...link,
          { say: 'If you did not ask, you can ignore this message.' },
        ],
      };
    case 'invite.prove':
      return {
        subject: 'Accept your invitation to BrainDog',
        parts: [
          { say: v.record ? `To accept the invitation to ${v.record}, open this link. It proves this address is yours, and it works once.` : 'To accept your invitation, open this link. It proves this address is yours, and it works once.' },
          ...link,
          { say: 'If you did not accept an invitation, you can ignore this message and nothing changes.' },
        ],
      };
    case 'passkey.added':
      return {
        subject: 'A passkey was added to your BrainDog sign-in',
        parts: [
          { say: v.label ? `A passkey named ${v.label} can now sign in with this address.` : 'A new passkey can now sign in with this address.' },
          { say: 'If this was not you, sign in, remove it in Settings, and sign out everywhere.' },
        ],
      };
    case 'passkey.removed':
      return {
        subject: 'A passkey was removed from your BrainDog sign-in',
        parts: [
          { say: v.label ? `The passkey named ${v.label} can no longer sign in with this address, and every other session was signed out.` : 'A passkey can no longer sign in with this address, and every other session was signed out.' },
          { say: 'If this was not you, sign in and look at your passkeys in Settings.' },
        ],
      };
    case 'sessions.ended':
      return {
        subject: 'You are signed out of BrainDog',
        parts: [{ say: 'Every BrainDog session for this address has ended, on every device. Signing in again needs a passkey or a new sign-in link.' }],
      };
    /* THE TWO HALVES OF CHANGING A SIGN-IN ADDRESS (GAP-7). The link goes to the new address, so only somebody who reads
       it can finish; the notice goes to the old one, so a change nobody there made is seen by the person it was done to.
       The notice names no address, old or new: the mail may be read by whoever now holds the old mailbox. */
    case 'email.change':
      return {
        subject: 'Confirm your new BrainDog sign-in address',
        parts: [
          { say: 'Open this link to sign in to BrainDog with this address from now on. It works once, for the next 24 hours, while you are signed in.' },
          ...link,
          { say: 'If you did not ask, you can ignore this message and nothing changes.' },
        ],
      };
    case 'email.changed':
      return {
        subject: 'Your BrainDog sign-in address changed',
        parts: [
          { say: 'This address no longer signs in to BrainDog. The account now signs in with a new one.' },
          { say: v.support ? `If this was not you, write to ${v.support} straight away.` : 'If this was not you, contact whoever runs this BrainDog straight away.' },
        ],
      };
    case 'lapse.0':
      return {
        subject: `${record} is read-only until billing resumes`,
        parts: [
          { say: `The last payment for ${v.record || 'your record'} did not go through, so it is read-only until billing resumes. Everything in it is still there, and you can export it at any time.` },
          ...(v.until ? [{ say: `If billing has not resumed by ${v.until}, the record is deleted that day.` }] : []),
          ...link,
        ],
      };
    case 'lapse.60':
    case 'lapse.83':
      return {
        subject: kind === 'lapse.83' ? `Last notice: ${record} will be deleted` : `${record} will be deleted`,
        parts: [
          { say: `${v.record || 'Your record'} has been read-only since its billing stopped.` },
          { say: v.until ? `It is deleted on ${v.until} unless billing resumes before then. Export it first if you want to keep a copy.` : 'It is deleted unless billing resumes. Export it first if you want to keep a copy.' },
          ...link,
        ],
      };
    case 'lapse.90':
      return {
        subject: `${record} has been deleted`,
        parts: [
          { say: `${v.record || 'Your record'} was deleted today, because its billing did not resume.` },
          ...(v.until ? [{ say: `BrainDog keeps one final copy of it until ${v.until}.` }] : []),
        ],
      };
    case 'lapse.back':
      return {
        subject: `${record} can be written again`,
        parts: [{ say: `Billing for ${v.record || 'your record'} has resumed, so it can be written again. Nothing in it was lost.` }, ...link],
      };
    case 'welcome':
      return {
        subject: 'Your BrainDog record is ready',
        parts: [
          { say: v.record ? `${v.record} is ready. Open it here:` : 'Your record is ready. Open it here:' },
          ...link,
          ...(v.asked ? [{ say: `The name ${v.asked} was taken before the payment went through, so the record was made as ${v.record || 'the next free name'}.` }] : []),
        ],
      };
    /* THE ONE SENTENCE THE DIRECTORY ALREADY WROTE (MTR-2), printed whole: `notice()` decided the words against the
       record's own allowance and plan, and this letter adds nothing to them beyond the subject and the footer. */
    case 'usage.notice':
      return {
        subject: v.record ? `${v.record}: usage this month` : 'Your BrainDog usage this month',
        parts: [{ say: v.say || "There is news about this record's usage this month." }],
      };
  }
}

/**
 * A kind's letter, with every value in it made safe: a line of text, and escaped in the HTML.
 *
 * THE FOOTER NAMES WHAT THE MAIL IS, and where to write once `SUPPORT_ADDRESS` is set; while it is empty the footer
 * names no address at all (`loop/finish/contracts.md` 8.4, "support address").
 */
export function letterOf(kind: MailKind, vars: MailVars = {}): Letter {
  const v = {
    link: flat(vars.link),
    record: flat(vars.record),
    until: flat(vars.until),
    asked: flat(vars.asked),
    label: flat(vars.label),
    support: flat(vars.support),
    say: flat(vars.say),
  };
  const { subject, parts } = partsOf(kind, v);
  const footer: Part[] = [
    { say: `This mail is from BrainDog, sent ${WHY[kind]}.` },
    ...(v.support ? [{ say: `Write to ${v.support} with any question.` }] : []),
  ];
  const line = (p: Part): string => ('say' in p ? p.say : p.link);
  /* A BLANK LINE BETWEEN PARAGRAPHS, AS THE SIGN-IN LETTER HAS ALWAYS HAD, and the footer's lines together under them. */
  const text = [parts.map(line).join('\n\n'), footer.map(line).join('\n')].join('\n\n');
  const para = (p: Part): string =>
    'say' in p ? `<p>${escaped(p.say)}</p>` : `<p><a href="${escaped(p.link)}">${escaped(p.link)}</a></p>`;
  const support = v.support ? `<p>Write to <a href="mailto:${escaped(v.support)}">${escaped(v.support)}</a> with any question.</p>` : '';
  const html = [
    '<!doctype html><html><body>',
    ...parts.map(para),
    '<hr>',
    `<p><small>This mail is from BrainDog, sent ${escaped(WHY[kind])}.</small></p>`,
    support,
    '</body></html>',
  ].join('');
  return { subject: flat(subject), text, html };
}

/** One message as the `send_email` binding takes it, with the sender's display name. */
type Outgoing = { from: { email: string; name: string }; to: string; subject: string; text: string; html: string };

/**
 * The part of the Worker's `Env` this module reads.
 *
 * `EMAIL` IS TAKEN AS `unknown` AND CHECKED HERE, because the Worker's `Env` types the binding by the notification
 * message `deliver.ts` sends, whose `from` is a bare address, and this module sends the sender's name with it, which
 * the binding takes as `{ email, name }`. Narrowing it in one place keeps both callers honest about what they send.
 */
export type MailEnv = {
  EMAIL?: unknown;
  AUTH_MAIL_FROM?: string | undefined;
  MAIL_FROM?: string | undefined;
  SUPPORT_ADDRESS?: string | undefined;
};

type Binding = { send(message: Outgoing): Promise<unknown> };

const bindingOf = (email: unknown): Binding | null =>
  typeof email === 'object' && email !== null && typeof (email as { send?: unknown }).send === 'function' ? (email as Binding) : null;

/** The name every mail is sent under. */
const SENDER_NAME = 'BrainDog';

/**
 * The code a failed send carries, when it is one of Email Service's own (`E_` and capitals), else `unknown`.
 *
 * ONLY THE CODE, NEVER THE MESSAGE: a transport's message may quote the address it refused.
 */
const codeOf = (e: unknown): string => {
  const code = typeof e === 'object' && e !== null ? (e as { code?: unknown }).code : undefined;
  return typeof code === 'string' && /^E_[A-Z_]{1,60}$/u.test(code) ? code : 'unknown';
};

/**
 * An address Email Service will refuse, suppressed after a bounce or a complaint. SENDING AGAIN CANNOT HELP, so the line
 * says `permanent` and the caller that retries (the nightly ladder) can tell it from a failure worth a second try.
 */
const SUPPRESSED = 'E_RECIPIENT_SUPPRESSED';

/**
 * Send one kind of mail to one address. `true` when the binding took it, `false` for every other outcome, each of which
 * writes its `op: 'mail'` line with `ok: false` and why.
 *
 * ONE ADDRESS, ONE MESSAGE, ONE ATTEMPT: that is this call's whole ceiling. A retry is the caller's, on its own clock.
 */
export async function sendMail(env: MailEnv, kind: MailKind, to: string, vars: MailVars = {}): Promise<boolean> {
  try {
    const binding = bindingOf(env.EMAIL);
    const from = (SIGN_IN_KINDS.has(kind) ? env.AUTH_MAIL_FROM : env.MAIL_FROM || env.AUTH_MAIL_FROM)?.trim() ?? '';
    if (binding === null || from === '') {
      op({ op: 'mail', kind, ok: false, why: binding === null ? 'no-binding' : 'no-sender' }, 'error');
      return false;
    }
    const address = to.trim();
    if (!/^[^\s@]+@[^\s@]+$/u.test(address)) {
      op({ op: 'mail', kind, ok: false, why: 'address' }, 'error');
      return false;
    }
    if (NEEDS_LINK.has(kind) && flat(vars.link) === '') {
      op({ op: 'mail', kind, ok: false, why: 'no-link' }, 'error');
      return false;
    }
    const letter = letterOf(kind, { ...vars, support: vars.support ?? env.SUPPORT_ADDRESS });
    try {
      await binding.send({ from: { email: from, name: SENDER_NAME }, to: address, ...letter });
    } catch (e) {
      const code = codeOf(e);
      op({ op: 'mail', kind, ok: false, why: 'refused', code, permanent: code === SUPPRESSED }, 'error');
      return false;
    }
    op({ op: 'mail', kind, ok: true });
    return true;
  } catch {
    /* A FAULT IN THIS MODULE, OR IN THE LOG ITSELF, IS STILL A `false` AND NEVER A THROW: the caller's answer has gone,
       or its walk has other records to reach. */
    return false;
  }
}

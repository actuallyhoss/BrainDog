/**
 * Every mail the Worker sends a person, and the one function that sends it.
 *
 * ONE MODULE, SO THE LETTERS CANNOT DRIFT. Sign-in, sign-up, an invitation's proof, a passkey notice, the lapse ladder
 * and the welcome after payment each write their words here and nowhere else, as text and as HTML, with the same
 * footer naming what the mail is. A caller hands over a kind and the few values its letter needs. A record's own mail
 * (a digest, an urgent notice) is written by the kernel and drawn in the same page here, by `recordLetter`, so every
 * mail BrainDog sends wears one layout.
 *
 * THE HTML IS WRITTEN FOR MAIL CLIENTS, NOT BROWSERS: tables for layout, every style inline, no web font, the one image
 * an absolute https URL on brain.dog, a button Outlook can draw, and a dark scheme in a media query that a client
 * which ignores it simply never sees. The colours are the house theme's, generated into `mail-palette.ts`.
 *
 * `sendMail` NEVER THROWS. A mail is sent beside an answer (inside `ctx.waitUntil`) or by the nightly walk, and neither
 * may be broken by a transport that refused: the caller reads `false` and decides whether to try again. Every send
 * writes one `op: 'mail'` line with the kind and the outcome, and never the address, the link or the letter, because a
 * log line that quoted either has published a way into somebody's record to wherever logs go.
 *
 * IT IMPORTS NOTHING FROM `cloudflare:`, as `deliver.ts` does not, so the tests load it in a bare Node process and
 * hand it an object literal for the binding.
 */

import { MAIL_PALETTE } from './mail-palette.ts';
import { op, type OpValue } from './oplog.ts';

/** Every mail this Worker sends, by what it is for. The lapse kinds name the day of the ladder they belong to. */
export type MailKind =
  | 'signin'
  | 'signup.verify'
  | 'signup.known'
  | 'invite.prove'
  | 'invite.sent'
  | 'invite.ready'
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
  'invite.sent',
  'invite.ready',
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
  'invite.sent',
  'invite.ready',
  'passkey.added',
  'passkey.removed',
  'sessions.ended',
  'email.change',
  'email.changed',
]);

/** The kinds whose whole point is a link. Without one there is nothing to send, and `sendMail` says so and sends nothing. */
const NEEDS_LINK: ReadonlySet<MailKind> = new Set<MailKind>(['signin', 'signup.verify', 'signup.known', 'invite.prove', 'invite.sent', 'invite.ready', 'email.change']);

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
  /** The one sentence the Directory already wrote, printed whole as the letter's body (`usage.notice`). */
  say?: string | undefined;
  /** The person's own name, for a letter that greets them (`invite.ready`). */
  name?: string | undefined;
  /** Who sent an invitation, by the name they go by (`invite.sent`). */
  from?: string | undefined;
  /** The days a link lives, written as a whole number ("30"), for a letter that says when it ends (`invite.ready`). */
  days?: string | undefined;
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
  'signup.verify': 'because somebody asked to make a BrainDog with this address',
  'signup.known': 'because somebody asked to make a BrainDog with this address',
  'invite.prove': 'because somebody accepted an invitation to a BrainDog with this address',
  'invite.sent': 'because somebody invited this address to their BrainDog',
  'invite.ready': 'because this address was invited to make a BrainDog account',
  'passkey.added': 'because the passkeys that sign in with this address changed',
  'passkey.removed': 'because the passkeys that sign in with this address changed',
  'sessions.ended': 'because every session for this address ended',
  'email.change': 'because somebody asked to sign in to BrainDog with this address instead of their old one',
  'email.changed': 'because the address that signs in to this BrainDog account changed',
  'lapse.0': 'about billing for a BrainDog this address pays for or owns',
  'lapse.60': 'about billing for a BrainDog this address pays for or owns',
  'lapse.83': 'about billing for a BrainDog this address pays for or owns',
  'lapse.90': 'about billing for a BrainDog this address pays for or owns',
  'lapse.back': 'about billing for a BrainDog this address pays for or owns',
  welcome: 'because a BrainDog was made for this address',
  'usage.notice': "about your BrainDog's usage this month",
};

/**
 * Each letter's subject and paragraphs. A paragraph that needs a value it was not given is left out.
 *
 * THE SIGN-IN LETTER KEEPS THE WORDS IT HAS ALWAYS SENT, line for line, with the footer under them: a person who has
 * had one before sees the same mail, and a filter somebody wrote against it still matches.
 */
function partsOf(kind: MailKind, v: { [K in keyof MailVars]-?: string }): { subject: string; parts: Part[] } {
  const record = v.record || 'Your BrainDog';
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
        subject: 'Finish making your BrainDog',
        parts: [
          { say: 'Here is your link to finish making your BrainDog. It proves this address is yours, and it works once.' },
          ...link,
          { say: 'If you did not ask for a BrainDog, you can ignore this message and nothing is made.' },
        ],
      };
    case 'signup.known':
      return {
        subject: 'Sign in to BrainDog',
        parts: [
          { say: 'Somebody asked to make a BrainDog with this address, and this address can already sign in. Here is a link to sign in instead. It works once.' },
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
    case 'invite.sent':
      return {
        subject: v.from ? `${v.from} invited you to ${v.record || 'their BrainDog'}` : `You're invited to ${v.record || 'a BrainDog'}`,
        parts: [
          { say: v.from ? `${v.from} invited you to ${v.record || 'their BrainDog'}, where they keep their work, projects and plans.` : `You're invited to ${v.record || 'a BrainDog'}.` },
          { say: 'Open this link to see what you can do there and join. It works once, for this address, and ends in 24 hours.' },
          ...link,
          { say: 'If you did not expect this, you can ignore this message and nothing changes.' },
        ],
      };
    case 'invite.ready':
      return {
        subject: 'Your BrainDog invite',
        parts: [
          { say: v.name ? `Hi ${v.name},` : 'Hi there,' },
          { say: 'Your invite to BrainDog is ready. Open this link to make your account:' },
          ...link,
          { say: /^[1-9]\d*$/u.test(v.days) ? `It works once, and it ends in ${v.days} ${v.days === '1' ? 'day' : 'days'}.` : 'It works once.' },
          { say: 'This link proves your address, so there is no second email to wait for.' },
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
    /* THE TWO HALVES OF CHANGING A SIGN-IN ADDRESS. The link goes to the new address, so only somebody who reads
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
          { say: `The last payment for ${v.record || 'your BrainDog'} did not go through, so it is read-only until billing resumes. Everything in it is still there, and you can export it at any time.` },
          ...(v.until ? [{ say: `If billing has not resumed by ${v.until}, it is deleted that day.` }] : []),
          ...link,
        ],
      };
    case 'lapse.60':
    case 'lapse.83':
      return {
        subject: kind === 'lapse.83' ? `Last notice: ${record} will be deleted` : `${record} will be deleted`,
        parts: [
          { say: `${v.record || 'Your BrainDog'} has been read-only since its billing stopped.` },
          { say: v.until ? `It is deleted on ${v.until} unless billing resumes before then. Export it first if you want to keep a copy.` : 'It is deleted unless billing resumes. Export it first if you want to keep a copy.' },
          ...link,
        ],
      };
    case 'lapse.90':
      return {
        subject: `${record} has been deleted`,
        parts: [
          { say: `${v.record || 'Your BrainDog'} was deleted today, because its billing did not resume.` },
          ...(v.until ? [{ say: `BrainDog keeps one final copy of it until ${v.until}.` }] : []),
        ],
      };
    case 'lapse.back':
      return {
        subject: `${record} can be written again`,
        parts: [{ say: `Billing for ${v.record || 'your BrainDog'} has resumed, so it can be written again. Nothing in it was lost.` }, ...link],
      };
    case 'welcome':
      return {
        subject: 'Your BrainDog is ready',
        parts: [
          /* "OPEN IT HERE:" WENT WITH THE BARE LINK IT POINTED AT: the letter now has a button saying the same. */
          { say: v.record ? `${v.record} is ready.` : 'Your BrainDog is ready.' },
          ...link,
          ...(v.asked ? [{ say: `The name ${v.asked} was taken before the payment went through, so it was made as ${v.record || 'the next free name'}.` }] : []),
        ],
      };
    /* THE ONE SENTENCE THE DIRECTORY ALREADY WROTE, printed whole: `notice()` decided the words against the
       record's own allowance and plan, and this letter adds nothing to them beyond the subject and the footer. */
    case 'usage.notice':
      return {
        subject: v.record ? `${v.record}: usage this month` : 'Your BrainDog usage this month',
        parts: [{ say: v.say || "There is news about your BrainDog's usage this month." }],
      };
  }
}

/**
 * What the one button in a letter says: its verb and object, never "Click here". Only a letter with a link has one.
 */
function actionOf(kind: MailKind, record: string): string {
  switch (kind) {
    case 'signin':
    case 'signup.known':
      return 'Sign in to BrainDog';
    case 'signup.verify':
      return 'Finish making your BrainDog';
    case 'invite.prove':
    case 'invite.sent':
      return 'Accept the invitation';
    case 'invite.ready':
      return 'Make your account';
    case 'email.change':
      return 'Confirm this address';
    default:
      return record ? `Open ${record}` : 'Open your BrainDog';
  }
}

/* ── the page every mail is drawn in ─────────────────────────────────────── */

/** Where BrainDog lives, and the mark every letter's header shows, served by the site (`apps/site/static/email/`). */
const HOME = 'https://brain.dog';
const MARK_SRC = `${HOME}/email/mark.png`;

/** Who sends BrainDog's mail: the last line of every footer. */
export const SENDER = 'BrainDog is run by Quartz Apps LLC.';

/**
 * THE SYSTEM'S OWN FACE, because a mail cannot load one. Geist first for the reader who has it installed, then each
 * platform's interface font, so the letter reads like the device it is on rather than like a web page that failed.
 */
const FONT = `'Geist',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`;

const L = MAIL_PALETTE.light;
const D = MAIL_PALETTE.dark;

/**
 * The enhancements a client may take or leave: a narrower card on a phone, and the dark scheme.
 *
 * EVERYTHING HERE IS ALSO SAID INLINE IN LIGHT, so a client that strips `<style>` (Gmail on some accounts, most
 * webmail in a forward) shows the light letter whole. `[data-ogsc]` and `[data-ogsb]` are how Outlook.com marks its
 * own dark mode, which reads no media query.
 */
const STYLE = (() => {
  const dark = (p: string): string =>
    [
      `${p}.bd-ground{background-color:${D.sunk} !important}`,
      `${p}.bd-card{background-color:${D.bg} !important;border-color:${D.line} !important}`,
      `${p}.bd-ink{color:${D.ink} !important}`,
      `${p}.bd-ink2{color:${D.ink2} !important}`,
      `${p}.bd-dim,${p}.bd-dim a{color:${D.dim} !important}`,
      `${p}.bd-rule{border-color:${D.line} !important}`,
      `${p}.bd-btn{background-color:${D.ink} !important}`,
      `${p}.bd-btn a{color:${D.bg} !important}`,
      `${p}.bd-cell{border-color:${D.line} !important}`,
    ].join('');
  return (
    '<style>' +
    ':root{color-scheme:light dark;supported-color-schemes:light dark}' +
    'body{margin:0;padding:0;-webkit-text-size-adjust:100%;text-size-adjust:100%}' +
    'a{text-decoration-thickness:1px;text-underline-offset:3px}' +
    '@media only screen and (max-width:620px){' +
    '.bd-outer{padding:24px 16px 32px !important}' +
    '.bd-pad{padding:28px 24px !important}' +
    '.bd-h1{font-size:20px !important;line-height:26px !important}' +
    '.bd-btn-wrap{width:100% !important}' +
    '.bd-btn a{display:block !important}' +
    '}' +
    `@media (prefers-color-scheme:dark){${dark('')}}` +
    dark('[data-ogsc] ') +
    dark('[data-ogsb] ') +
    '</style>'
  );
})();

/** Text as HTML inside the page: escaped, and nothing else. */
const h = (value: string): string => escaped(value);

/** One paragraph of the letter's body. */
const para = (text: string): string =>
  `<p class="bd-ink2" style="margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:24px;color:${L.ink2}">${h(text)}</p>`;

/** A quieter paragraph under the button: what to do if the mail was not expected, a note beside the point. */
const aside = (text: string): string =>
  `<p class="bd-dim" style="margin:0 0 12px;font-family:${FONT};font-size:14px;line-height:21px;color:${L.dim}">${h(text)}</p>`;

/**
 * THE ONE BUTTON, BULLETPROOF. Everywhere but Outlook for Windows it is a padded link painted as an ink rectangle with
 * the app's 8px corners (it was a pill); Outlook draws no padding on a link and no
 * radius on anything, so it gets a VML round rectangle of its own, sized from the label because VML cannot size to its
 * text. Both are one link to the same address, and the whole button is the target.
 */
const button = (label: string, href: string): string => {
  const width = Math.min(520, Math.max(180, Math.round(label.length * 8.6 + 56)));
  return (
    `<table role="presentation" class="bd-btn-wrap" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;border-collapse:separate">` +
    `<tr><td class="bd-btn" align="center" bgcolor="${L.ink}" style="border-radius:8px;background-color:${L.ink}">` +
    `<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${h(href)}" style="height:46px;v-text-anchor:middle;width:${width}px" arcsize="17%" stroke="f" fillcolor="${L.ink}"><w:anchorlock/><center style="color:${L.bg};font-family:Segoe UI,Arial,sans-serif;font-size:16px;font-weight:600">${h(label)}</center></v:roundrect><![endif]-->` +
    `<!--[if !mso]><!-->` +
    `<a href="${h(href)}" target="_blank" style="display:inline-block;padding:13px 28px;font-family:${FONT};font-size:16px;line-height:20px;font-weight:600;color:${L.bg};text-decoration:none;border-radius:8px;mso-hide:all">${h(label)}</a>` +
    `<!--<![endif]-->` +
    `</td></tr></table>`
  );
};

/**
 * A link as a letter shows it in words: as far as its proof. What a person said follows the proof of a sign-up link
 * (`#verify=<proof>&said=<words>`, `packages/record/src/identity.ts`) and rides in the button's address only, so no
 * letter prints a sentence, hers or one somebody else typed for her address.
 */
const shown = (href: string): string => href.replace(/(#verify=[^&#\s]*)&said=.*$/su, '$1');

/** For a link that works once: the address itself under the button, for the client that will not follow a button. */
const fallback = (href: string): string =>
  `<p class="bd-dim" style="margin:0 0 20px;font-family:${FONT};font-size:13px;line-height:20px;color:${L.dim}">` +
  `Or paste this link into your browser:<br>` +
  `<a href="${h(href)}" target="_blank" style="color:${L.dim};text-decoration:underline;word-break:break-all">${h(href)}</a></p>`;

/** A hairline across the card, between what the letter is for and what is beside the point. */
const rule = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="bd-rule" style="border-top:1px solid ${L.line};font-size:0;line-height:0;padding:0 0 20px">&nbsp;</td></tr></table>`;

/**
 * THE PREHEADER: the line a mailbox shows beside the subject, hidden in the letter itself. Padded with zero-width
 * joiners and spaces so the client does not fill the rest of the preview with the letter's first words again.
 */
const preheader = (text: string): string =>
  `<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${L.bg}">` +
  `${h(text)}${'&#847;&zwnj;&nbsp;'.repeat(60)}</div>`;

/** What a page is made of: the subject as its title, the preheader, the body's HTML, and the footer's lines. */
type Page = { subject: string; preheader: string; body: string; why: string; support: string };

/**
 * The page every mail is drawn in: the mark and the name, a white card on a soft ground, and a quiet footer.
 *
 * 600 WIDE AT MOST, THE WIDTH EVERY CLIENT SHOWS WHOLE, and on a phone the card fills the screen less a 16 gutter.
 * Outlook for Windows ignores `max-width`, so it gets a fixed 600 table in a conditional comment.
 */
function page(p: Page): string {
  const footer = [
    `<p style="margin:0 0 8px">${h(`This mail is from BrainDog, sent ${p.why}.`)}</p>`,
    ...(p.support
      ? [`<p style="margin:0 0 8px">Write to <a href="mailto:${h(p.support)}" style="color:${L.dim};text-decoration:underline">${h(p.support)}</a> with any question.</p>`]
      : []),
    `<p style="margin:0">${h(SENDER)}</p>`,
  ].join('');
  return (
    '<!doctype html>' +
    '<html lang="en" dir="ltr" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">' +
    '<head>' +
    '<meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="x-apple-disable-message-reformatting">' +
    '<meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no">' +
    '<meta name="color-scheme" content="light dark">' +
    '<meta name="supported-color-schemes" content="light dark">' +
    `<title>${h(p.subject)}</title>` +
    '<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->' +
    STYLE +
    '</head>' +
    `<body class="bd-ground" style="margin:0;padding:0;background-color:${L.sunk};word-spacing:normal">` +
    preheader(p.preheader) +
    `<table role="presentation" class="bd-ground" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${L.sunk}" style="background-color:${L.sunk}">` +
    `<tr><td class="bd-outer" align="center" style="padding:40px 16px 48px">` +
    '<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td><![endif]-->' +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;margin:0 auto">` +
    /* THE HEADER: the red mark and the name beside it, a link home. The mark's alt is empty because the name says it. */
    `<tr><td style="padding:0 8px 24px">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>` +
    `<td style="vertical-align:middle"><a href="${HOME}" target="_blank"><img src="${MARK_SRC}" width="36" height="28" alt="" style="display:block;width:36px;height:28px;border:0;outline:none"></a></td>` +
    `<td style="vertical-align:middle;padding-left:10px;font-family:${FONT};font-size:19px;line-height:28px;font-weight:600;letter-spacing:-0.01em">` +
    `<a class="bd-ink" href="${HOME}" target="_blank" style="color:${L.ink};text-decoration:none">BrainDog</a></td>` +
    `</tr></table></td></tr>` +
    /* THE CARD: the letter itself. */
    `<tr><td>` +
    `<table role="presentation" class="bd-card" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${L.bg}" style="background-color:${L.bg};border:1px solid ${L.line};border-radius:12px;border-collapse:separate">` +
    `<tr><td class="bd-pad" style="padding:40px 40px 28px">` +
    `<h1 class="bd-ink bd-h1" style="margin:0 0 16px;font-family:${FONT};font-size:22px;line-height:28px;font-weight:600;letter-spacing:-0.01em;color:${L.ink}">${h(p.subject)}</h1>` +
    p.body +
    `</td></tr></table>` +
    `</td></tr>` +
    /* THE FOOTER: who sent it and why, where to write, and where post reaches the company. */
    `<tr><td class="bd-dim" style="padding:24px 8px 0;font-family:${FONT};font-size:12px;line-height:18px;color:${L.dim}">${footer}</td></tr>` +
    `</table>` +
    '<!--[if mso]></td></tr></table><![endif]-->' +
    `</td></tr></table>` +
    '</body></html>'
  );
}

/** The footer's lines as plain text, under a letter's own: why it was sent, where to write, and who sends it. */
const textFooter = (why: string, support: string): string =>
  [`This mail is from BrainDog, sent ${why}.`, ...(support ? [`Write to ${support} with any question.`] : []), SENDER].join('\n');

/**
 * A kind's letter, with every value in it made safe: a line of text, and escaped in the HTML.
 *
 * THE FOOTER NAMES WHAT THE MAIL IS, and where to write once `SUPPORT_ADDRESS` is set; while it is empty the footer
 * names no address at all.
 *
 * THE LINK IS THE BUTTON. What comes before it is the letter's body; what comes after it is quieter, under a hairline,
 * because it is the sentence for the person who did not ask. A link that works once also shows itself as text under
 * the button, for the client that will not follow one.
 *
 * ONLY THE BUTTON CARRIES WHAT WAS SAID. The line under it and the plain text show the link as far as its proof
 * (`shown`), which still makes the record: a client that reads only the plain text opens it without the sentence.
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
    name: flat(vars.name),
    from: flat(vars.from),
    days: flat(vars.days),
  };
  const { subject, parts } = partsOf(kind, v);
  const line = (p: Part): string => ('say' in p ? p.say : shown(p.link));
  /* A BLANK LINE BETWEEN PARAGRAPHS, AS THE SIGN-IN LETTER HAS ALWAYS HAD, and the footer's lines together under them. */
  const text = [parts.map(line).join('\n\n'), textFooter(WHY[kind], v.support)].join('\n\n');

  const at = parts.findIndex((p) => 'link' in p);
  const body = parts
    .map((p, i) => {
      if ('link' in p) return button(actionOf(kind, v.record), p.link) + (NEEDS_LINK.has(kind) ? fallback(shown(p.link)) : '');
      if (at === -1 || i < at) return para(p.say);
      return (i === at + 1 ? rule : '') + aside(p.say);
    })
    .join('');
  const first = parts.find((p): p is { say: string } => 'say' in p)?.say ?? '';
  const html = page({ subject: flat(subject), preheader: first, body, why: WHY[kind], support: v.support });
  return { subject: flat(subject), text, html };
}

/* ── a record's own mail ─────────────────────────────────────────────────── */

/**
 * A line of the kernel's block dialect (`packages/kernel/src/digest.ts` `render`) as the cells it holds: split on the
 * pipes that are not escaped, and each cell's `\|` and `\\` read back as the characters they stand for.
 */
const cellsOf = (row: string): string[] =>
  (row.match(/(?:\\.|[^|])+/gu) ?? []).map((cell) => cell.trim().replace(/\\(.)/gu, '$1'));

/** A heading line of the dialect, `# name` or `## section`, as its level and its words. */
const headingOf = (line: string): { level: number; words: string } | null => {
  const m = /^(#{1,3})\s+(.*)$/u.exec(line);
  return m ? { level: m[1]!.length, words: m[2]!.trim() } : null;
};

/** One block of the dialect: a paragraph, a heading, a single figure, or a table of rows. */
type Chunk = { kind: 'para'; lines: string[] } | { kind: 'heading'; level: number; words: string } | { kind: 'stat' | 'table'; rows: string[][] };

/** The dialect read into blocks. A fence that never closes runs to the end, which is where the kernel would have closed it. */
function chunksOf(source: string): Chunk[] {
  const out: Chunk[] = [];
  const lines = source.replace(/\r\n?/gu, '\n').split('\n');
  let para: string[] = [];
  const endPara = (): void => {
    if (para.length > 0) out.push({ kind: 'para', lines: para });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const fence = /^```(stat|table)\s*$/u.exec(line.trim());
    if (fence) {
      endPara();
      const rows: string[][] = [];
      for (i++; i < lines.length && lines[i]!.trim() !== '```'; i++) if (lines[i]!.trim() !== '') rows.push(cellsOf(lines[i]!));
      out.push({ kind: fence[1] as 'stat' | 'table', rows });
      continue;
    }
    const heading = headingOf(line.trim());
    if (heading) {
      endPara();
      out.push({ kind: 'heading', ...heading });
      continue;
    }
    if (line.trim() === '') endPara();
    else para.push(line.trim());
  }
  endPara();
  return out;
}

/** The dialect as plain text a person reads: no fences and no hashes, a figure as "label: value", a row as cells. */
function plainOf(chunks: Chunk[]): string {
  return chunks
    .map((c) => {
      if (c.kind === 'para') return c.lines.join('\n');
      if (c.kind === 'heading') return c.level === 1 ? c.words : `${c.words}\n${'-'.repeat(Math.min(c.words.length, 60))}`;
      if (c.kind === 'stat') return c.rows.map((r) => (r.length > 1 ? `${r[0]}: ${r.slice(1).join(' ')}` : (r[0] ?? ''))).join('\n');
      return c.rows.map((r) => r.join('  |  ')).join('\n');
    })
    .filter((s) => s !== '')
    .join('\n\n');
}

/** The dialect as the card's body: a section title, a large figure, or a table of hairline rows. */
function htmlOf(chunks: Chunk[]): string {
  const cell = (text: string, head: boolean): string =>
    `<td class="${head ? 'bd-dim' : 'bd-ink2'} bd-cell" style="padding:8px 12px 8px 0;border-bottom:1px solid ${L.line};font-family:${FONT};font-size:${head ? 13 : 14}px;line-height:20px;${head ? 'font-weight:500;' : ''}color:${head ? L.dim : L.ink2};text-align:left;vertical-align:top">${h(text)}</td>`;
  return chunks
    .map((c) => {
      /* THE ATTRIBUTION UNDER A MODEL'S PROSE (`digest.ts` `sendDigest`, "Slash" after a dash) is a byline, set quieter
         than the prose it names so the record's own figures below read as the record's. */
      if (c.kind === 'para' && c.lines.length === 1 && /^\p{Pd}\s/u.test(c.lines[0]!)) return aside(c.lines[0]!);
      if (c.kind === 'para') return para(c.lines.join(' '));
      if (c.kind === 'heading')
        return `<h2 class="bd-ink" style="margin:24px 0 8px;font-family:${FONT};font-size:16px;line-height:22px;font-weight:600;color:${L.ink}">${h(c.words)}</h2>`;
      if (c.kind === 'stat')
        return c.rows
          .map(
            (r) =>
              `<p class="bd-ink" style="margin:0 0 16px;font-family:${FONT};font-size:28px;line-height:34px;font-weight:600;font-variant-numeric:tabular-nums;color:${L.ink}">${h(r.length > 1 ? r.slice(1).join(' ') : (r[0] ?? ''))}</p>`,
          )
          .join('');
      if (c.rows.length === 0) return '';
      const [head, ...rows] = c.rows;
      const tr = (r: string[], isHead: boolean): string => `<tr>${r.map((t) => cell(t, isHead)).join('')}</tr>`;
      return (
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;border-collapse:collapse">` +
        tr(head!, true) +
        rows.map((r) => tr(r, false)).join('') +
        `</table>`
      );
    })
    .join('');
}

/**
 * Why a record's mail was sent, the footer's first sentence: a digest by the mark the kernel gives it
 * (`because: 'digest.<id>'`), and anything else as the urgent notice it is.
 */
const recordWhy = (because: string): string =>
  because.startsWith('digest.')
    ? 'because a digest on a BrainDog you own is set to mail this address'
    : 'because a BrainDog you own has something that needs you now';

/**
 * A mail a record wrote (a digest, an urgent notice), in the same page as every letter above.
 *
 * THE KERNEL'S WORDS ARE KEPT WHOLE. The body is its block dialect, drawn: a heading as a heading, a figure large, a
 * table as rows with hairlines, a paragraph as itself. The dialect's first `# name` is the subject already, so the card
 * does not say it twice. Every word is escaped; the record wrote them and a person may have typed any of them.
 */
export function recordLetter(subject: string, source: string, because = '', support = ''): Letter {
  const title = flat(subject);
  const chunks = chunksOf(source);
  /* THE CARD'S TITLE IS THE SUBJECT, so a body that opens with the same words (a digest's `# name`, a notice's own
     sentence) does not say them twice in the HTML. The text keeps them: it has no title of its own. */
  const top = chunks[0];
  const said = top?.kind === 'para' && top.lines.join(' ') === title;
  /* A digest with prose opens with the prose and its attribution, and its `# name` comes after them, so the title is
     dropped wherever it is and not only at the top. */
  const card = (said ? chunks.slice(1) : chunks).filter((c) => !(c.kind === 'heading' && c.level === 1 && c.words === title));
  const why = recordWhy(because);
  const text = [plainOf(chunks), textFooter(why, flat(support))].filter((s) => s !== '').join('\n\n');
  const first = card.find((c) => c.kind === 'para');
  const html = page({
    subject: title,
    preheader: first?.kind === 'para' ? first.lines.join(' ') : title,
    body: htmlOf(card),
    why,
    support: flat(support),
  });
  return { subject: title, text, html };
}

/** One message as the `send_email` binding takes it, with the sender's display name. */
type Outgoing = { from: { email: string; name: string }; to: string; subject: string; text: string; html?: string };

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
 * A refusal about the one address and not this host: suppressed, a recipient the service will not take, or an address it
 * would not parse. Counted as a host fault, a stranger could type five of them and have sign-in tell everyone mail is down.
 */
const ADDRESS_FAULT = /^E_(?:RECIPIENT_|VALIDATION)/u;

/**
 * Send one kind of mail to one address. `true` when the binding took it, `false` for every other outcome, each of which
 * writes its `op: 'mail'` line with `ok: false` and why.
 *
 * ONE ADDRESS, ONE MESSAGE, ONE ATTEMPT: that is this call's whole ceiling. A retry is the caller's, on its own clock.
 */
export async function sendMail(env: MailEnv, kind: MailKind, to: string, vars: MailVars = {}): Promise<boolean> {
  return (await mailOutcome(env, kind, to, vars)) === 'sent';
}

/**
 * How one send went: `sent`; `host`, a fault of this deployment's that every letter would meet (no binding, no sender,
 * no link, the service refusing); or `address`, a fault of the one address (not an address, or suppressed).
 *
 * THE DIFFERENCE IS WHAT SIGN-IN MAY SAY. A host fault says nothing about who has an account, so a run of them
 * may be told on the sign-in screen as "mail is not going out". An address fault is about one person, and saying it
 * would tell a stranger whether that mailbox is real, so it is never counted.
 */
export type MailOutcome = 'sent' | 'host' | 'address';

/** `sendMail`, with the outcome kept apart. The same lines, the same one attempt, and never a throw. */
export async function mailOutcome(env: MailEnv, kind: MailKind, to: string, vars: MailVars = {}): Promise<MailOutcome> {
  try {
    const binding = bindingOf(env.EMAIL);
    const from = (SIGN_IN_KINDS.has(kind) ? env.AUTH_MAIL_FROM : env.MAIL_FROM || env.AUTH_MAIL_FROM)?.trim() ?? '';
    if (binding === null || from === '') {
      op({ op: 'mail', kind, ok: false, why: binding === null ? 'no-binding' : 'no-sender' }, 'error');
      return 'host';
    }
    const address = to.trim();
    if (!/^[^\s@]+@[^\s@]+$/u.test(address)) {
      op({ op: 'mail', kind, ok: false, why: 'address' }, 'error');
      return 'address';
    }
    if (NEEDS_LINK.has(kind) && flat(vars.link) === '') {
      op({ op: 'mail', kind, ok: false, why: 'no-link' }, 'error');
      return 'host';
    }
    const letter = letterOf(kind, { ...vars, support: vars.support ?? env.SUPPORT_ADDRESS });
    try {
      await binding.send({ from: { email: from, name: SENDER_NAME }, to: address, ...letter });
    } catch (e) {
      const code = codeOf(e);
      op({ op: 'mail', kind, ok: false, why: 'refused', code, permanent: code === SUPPRESSED }, 'error');
      return ADDRESS_FAULT.test(code) ? 'address' : 'host';
    }
    op({ op: 'mail', kind, ok: true });
    return 'sent';
  } catch {
    /* A FAULT IN THIS MODULE, OR IN THE LOG ITSELF, IS STILL AN ANSWER AND NEVER A THROW: the caller's answer has gone,
       or its walk has other records to reach. */
    return 'host';
  }
}

/**
 * The letters a person waits on at the sign-in and sign-up screens, whose outcomes the Directory counts
 * (`Directory$.letterSent`). Not the passkey notices, which nobody is waiting for.
 */
const WAITED_ON: ReadonlySet<MailKind> = new Set<MailKind>(['signin', 'signup.verify', 'signup.known', 'invite.prove']);
export const isWaitedOn = (kind: MailKind): boolean => WAITED_ON.has(kind);

/**
 * The lines that mail the operator, and nothing else: every other alert is read the next morning. `model` is a model
 * that did not answer, `night` a nightly walk with a failure or a Directory copy not written.
 */
export type OpsKind = 'crash' | 'refuse' | 'model' | 'night' | 'door' | 'step';

/** Where each one sends whoever reads it, as DEPLOYMENT.md's "## Alerts" table says it. */
const RUNBOOK: Record<OpsKind, string> = {
  crash:
    'find the ref the person was shown, read where and error in Workers Logs; if it started with a deploy, DEPLOYMENT.md "Rolling back"; more than one door, 53 §5.11',
  refuse: '53 §5.3 (docs/53-SPEC-OPERATIONS.md)',
  model:
    'read raw on the op: model line in Workers Logs; a message that names the model means the route table (MODELS in apps/worker/src/inference.ts), one that names the account or the gateway means the provider\'s console; from the model-checks workflow, read model-checks.json in that run\'s artifacts',
  night: '53 §5.4 (docs/53-SPEC-OPERATIONS.md): read the op: walk lines with ok false from the same night in Workers Logs',
  step: 'a record\'s alarm was reset in the same step two alarms in a row and that step is held for six hours: read the op: alarm-step lines for the rec in Workers Logs (cut, times, held), and the Record$ alarm events beside them for CPU time; the step named act:<script> is that script\'s calls into the record (apps/worker/src/alarm-cuts.ts)',
  door:
    'a webhook arrival was kept because its record could not take it: read the op: door lines for the rec in Workers Logs. "waiting" means the record has refused it for hours (read its Record$ errors); "gave-up" means the door will never take it, and the sealed request is under held/gave-up/ in BLOBS (apps/worker/src/held.ts)',
};

/**
 * The fields a mail repeats from its line: ids, codes, a model's name and the night's counts. `error` and `raw` stay in
 * the log, where they are scrubbed and cut: a provider's message can quote what it was sent.
 */
const OPS_FIELDS = ['ref', 'where', 'rec', 'code', 'model', 'why', 'records', 'backups', 'backups_failed', 'directory'] as const;

/** One mail per kind in this long, however many lines a burst writes. */
export const OPS_QUIET_MS = 15 * 60 * 1000;

/**
 * A MODEL THAT DOES NOT ANSWER IS MAILED ONCE A DAY: it is the provider's weather more than an outage of ours, Health's
 * model sign shows it, and the owner asked on 11 October not to be mailed through every failure.
 */
export const OPS_QUIET_BY_KIND: Partial<Record<OpsKind, number>> = { model: 24 * 60 * 60 * 1000 };
const quietOf = (kind: OpsKind): number => OPS_QUIET_BY_KIND[kind] ?? OPS_QUIET_MS;
const quietWords = (ms: number): string => (ms >= 86_400_000 ? 'day' : `${Math.round(ms / 60_000)} minutes`);

/* PER ISOLATE FIRST, so a burst in one isolate asks the shared gate once and not once a line. */
const opsSent = new Map<string, number>();

/**
 * The window a line is quiet in: its kind, and for a door's line its `why` too.
 *
 * A DOOR'S REASONS ARE APART. One window for every door line let a burst of junk give-ups (posts to a made-up ingest,
 * answered 404 once the record was back) use up the hour, so the give-up of a real arrival for another reason was never
 * mailed. Each reason now has its own window; the reasons are few and fixed by the code, so the windows are too.
 */
export const opsSlot = (fields: { op: OpsKind } & Record<string, OpValue>): string =>
  fields.op === 'door' && typeof fields.why === 'string' && fields.why !== '' ? `door:${fields.why.slice(0, 64)}` : fields.op;

/** The part of the Worker's `Env` an ops mail reads. */
export type OpsEnv = MailEnv & { OPS_ALERT_TO?: string | undefined; BRAINDOG_BUILD?: string | undefined };

/**
 * Mail the operator that a `crash`, `refuse`, `model` or `night` line was written. `true` when one went out.
 *
 * CLOUDFLARE CANNOT MAIL ON A LOG LINE FOR THIS ACCOUNT, so the Worker does: Observability alerts are not offered and the
 * zone's plan has no Health Checks. `OPS_ALERT_TO` unset is off.
 *
 * AT MOST ONE PER KIND PER `OPS_QUIET_MS`: this isolate's clock first, then `claim`, the Directory's, which holds the
 * window across isolates. A `claim` that throws is a send anyway, because the Directory failing is a likely cause of
 * the crash being reported, and the isolate's own window still caps the burst.
 *
 * NEVER THROWS, like `sendMail`: it runs inside `waitUntil` beside an answer that has already gone.
 */
export async function opsAlert(
  env: OpsEnv,
  fields: { op: OpsKind } & Record<string, OpValue>,
  claim?: (slot: string, quietMs: number) => Promise<boolean>,
  now = Date.now(),
): Promise<boolean> {
  try {
    const to = env.OPS_ALERT_TO?.trim() ?? '';
    if (to === '') return false;
    const kind = fields.op;
    const slot = opsSlot(fields);
    const last = opsSent.get(slot);
    const quiet = quietOf(kind);
    if (last !== undefined && now - last < quiet) return false;
    opsSent.set(slot, now);
    if (claim) {
      let due = true;
      try {
        due = await claim(slot, quiet);
      } catch {
        /* See the header: the isolate's window is the one left. */
      }
      if (!due) return false;
    }
    const binding = bindingOf(env.EMAIL);
    const from = (env.MAIL_FROM || env.AUTH_MAIL_FROM)?.trim() ?? '';
    if (binding === null || from === '') {
      op({ op: 'mail', kind: `ops.${kind}`, ok: false, why: binding === null ? 'no-binding' : 'no-sender' }, 'error');
      return false;
    }
    const said = OPS_FIELDS.flatMap((key) => (fields[key] == null ? [] : [`${key}: ${String(fields[key]).slice(0, 200)}`]));
    const text = [
      `The app Worker wrote an op: ${kind} line.`,
      '',
      ...said,
      `build: ${env.BRAINDOG_BUILD || 'unknown'}`,
      '',
      `Runbook: ${RUNBOOK[kind]}`,
      '',
      `More ${kind} lines in the next ${quietWords(quiet)} are not mailed. Workers Logs has every one.`,
    ].join('\n');
    try {
      await binding.send({ from: { email: from, name: SENDER_NAME }, to, subject: `BrainDog ${kind}`, text });
    } catch (e) {
      op({ op: 'mail', kind: `ops.${kind}`, ok: false, why: 'refused', code: codeOf(e) }, 'error');
      return false;
    }
    op({ op: 'mail', kind: `ops.${kind}`, ok: true });
    return true;
  } catch {
    return false;
  }
}

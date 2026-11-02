/**
 * The self-host's way out for mail: a submission client over `node:net` and `node:tls`, and the letters it sends.
 *
 * NO DEPENDENCY, because a submission client is a greeting, EHLO, one upgrade to TLS, one sign-in, and three commands
 * per message, and the tree carries no mail library to trust with a password.
 *
 * TLS OR NOTHING. `smtps://` (465) is TLS from the first byte; `smtp://` (587) must be upgraded with STARTTLS before the
 * password is sent, and a server that does not offer the upgrade is refused rather than handed the password in the
 * clear. There is no third way: a relay that takes mail unencrypted is one the operator puts behind a tunnel.
 *
 * THE PASSWORD NEVER LEAVES THIS FILE AS TEXT. It is read out of `BRAINDOG_SMTP_URL` once, sent once per connection
 * inside the sign-in command, and never quoted: not in a line on stderr, not in an error the retry ladder stores, not in
 * the boot summary (`smtpLine` names the host and port and nothing else). A mail server's own reply text is not quoted
 * either, because a server may echo an address back, and `49 §5.12` note 4 gives an error a name and a status only.
 */

import { randomUUID } from 'node:crypto';
import { connect as connectTcp, type Socket } from 'node:net';
import { connect as connectTls, type ConnectionOptions, type TLSSocket } from 'node:tls';

import type { OutboxRow } from '@braindog/kernel';
import type { MailNotice } from '@braindog/host/auth';

/**
 * `MailNotice`, plus the two email-change letters: `email.change` and
 * `email.changed` are not part of `MailNotice`, because that type comes from `packages/ports`'s `Mail`, which is not
 * this lane's to widen. The sign-in sender takes both anyway, so `serveAccount`'s email door can call it with either.
 */
export type SignInMailKind = MailNotice | 'email.change' | 'email.changed';

/** Where mail goes and who it comes from, read out of the environment once. `secure` is 465's TLS from the first byte. */
export type SmtpConfig = { secure: boolean; host: string; port: number; user: string; password: string; from: string };

/** One message: who to, what about, and its words. The self-host sends words only; the Worker's letters add HTML. */
export type Letter = { to: string | readonly string[]; subject: string; text: string };

/**
 * What a send that went says of it: the addresses the server refused while it took the rest (`smtpSender` skips a
 * mailbox it does not have), so the people behind them can be told about on Health. Empty when everybody got it.
 */
export type Sent = { refused: readonly string[] };

/**
 * Sends one message, or throws with a sentence that names a stage and a status and never the password or an address.
 * A sender that cannot tell who it reached answers nothing, which reads as everybody.
 */
export type SendLetter = (letter: Letter) => Promise<Sent | void>;

/** The most addresses one `notify.email` names, as the Worker's own ceiling is: a longer list is a mistake, not a digest. */
export const MOST_RECIPIENTS = 50;

/** How long one reply may take before the connection is given up, so a relay that stops answering holds no job for ever. */
const WAIT_MS = 30_000;

/* A LINE BREAK IN A HEADER IS A SECOND HEADER, so an address or a subject holding one is refused before it is written. */
const BREAK = /[\r\n]/;

/**
 * `BRAINDOG_SMTP_URL` and `BRAINDOG_MAIL_FROM`, read: `null` when neither is set (this host sends no mail, as before),
 * the config when both are, and a sentence when the pair is half set or malformed.
 *
 * THE SENTENCE NAMES WHAT TO FIX AND NEVER QUOTES THE URL, because the URL holds the password.
 */
export function smtpOf(url: string | undefined, from: string | undefined): SmtpConfig | { wrong: string } | null {
  const given = (url ?? '').trim();
  const sender = (from ?? '').trim();
  if (given === '' && sender === '') return null;
  if (given === '') return { wrong: 'BRAINDOG_MAIL_FROM is set and BRAINDOG_SMTP_URL is not, so this host sends no mail. Set both, or neither.' };
  if (sender === '') return { wrong: 'BRAINDOG_SMTP_URL is set and BRAINDOG_MAIL_FROM is not, so this host sends no mail. Set the address mail comes from.' };
  if (BREAK.test(sender) || !/^[^\s@<>]+@[^\s@<>]+$/.test(sender))
    return { wrong: 'BRAINDOG_MAIL_FROM is not one address, such as braindog@example.com, so this host sends no mail.' };
  let parsed: URL;
  try {
    parsed = new URL(given);
  } catch {
    return { wrong: 'BRAINDOG_SMTP_URL is not an address. Write it as smtps://user:password@host:465 or smtp://user:password@host:587.' };
  }
  const secure = parsed.protocol === 'smtps:';
  if (!secure && parsed.protocol !== 'smtp:')
    return { wrong: 'BRAINDOG_SMTP_URL begins smtps:// for TLS on 465, or smtp:// for STARTTLS on 587, and this one begins neither.' };
  if (parsed.hostname === '') return { wrong: 'BRAINDOG_SMTP_URL names no mail server.' };
  const port = parsed.port === '' ? (secure ? 465 : 587) : Number(parsed.port);
  let user: string;
  let password: string;
  try {
    user = decodeURIComponent(parsed.username);
    password = decodeURIComponent(parsed.password);
  } catch {
    return { wrong: 'BRAINDOG_SMTP_URL has a username or password that is not written as a URL encodes it. Percent-encode @, : and / in them.' };
  }
  /* A HOST WITH NO BRACKETS: `URL` keeps them round an IPv6 address, and `net.connect` wants the address bare. */
  return { secure, host: parsed.hostname.replace(/^\[|\]$/g, ''), port, user, password, from: sender };
}

/** The one line the boot summary says about mail: where it goes, and never with what. */
export const smtpLine = (c: SmtpConfig): string =>
  `mail goes out through ${c.host}:${String(c.port)} (${c.secure ? 'TLS' : 'STARTTLS'}) from ${c.from}`;

/**
 * A connection that reads whole replies. A reply is one or more lines of a three-digit code, and the last line has a
 * space after the code where the others have a hyphen.
 */
type Wire = { socket: Socket | TLSSocket; reply(): Promise<{ code: number; lines: string[] }>; write(line: string): void };

function wireOf(socket: Socket | TLSSocket): Wire {
  let buffered = '';
  let failed: Error | null = null;
  const waiting: ((e: Error | null) => void)[] = [];
  const wake = (e: Error | null): void => {
    for (const w of waiting.splice(0)) w(e);
  };
  socket.setEncoding('utf8');
  socket.on('data', (chunk: Buffer | string) => {
    buffered += chunk.toString();
    wake(null);
  });
  socket.on('error', (e: Error) => {
    failed = e;
    wake(e);
  });
  socket.on('close', () => {
    failed ??= new Error('the mail server closed the connection');
    wake(failed);
  });
  socket.setTimeout(WAIT_MS, () => socket.destroy(new Error('the mail server stopped answering')));

  const reply = async (): Promise<{ code: number; lines: string[] }> => {
    for (;;) {
      const lines = buffered.split('\r\n');
      /* THE LAST PIECE IS A LINE STILL ARRIVING, so only the whole lines before it are read. */
      const whole = lines.slice(0, -1);
      const end = whole.findIndex((l) => /^\d{3}(?: |$)/.test(l));
      if (end >= 0) {
        buffered = lines.slice(end + 1).join('\r\n');
        const got = whole.slice(0, end + 1);
        return { code: Number(got[end]!.slice(0, 3)), lines: got.map((l) => l.slice(4)) };
      }
      if (failed) throw failed;
      await new Promise<Error | null>((done) => waiting.push(done));
    }
  };
  return { socket, reply, write: (line) => void socket.write(`${line}\r\n`) };
}

/** A reply of the expected class, or an error naming the stage and the code and nothing the server said. */
async function expect(wire: Wire, stage: string, ok: (code: number) => boolean): Promise<string[]> {
  const got = await wire.reply();
  if (!ok(got.code)) throw new Error(`the mail server answered ${String(got.code)} at ${stage}, so the mail was not sent`);
  return got.lines;
}

const is2 = (code: number): boolean => code >= 200 && code < 300;

/** RFC 2047's encoded word for a subject that is not all ASCII, so a pound sign arrives as one. */
const headerText = (text: string): string =>
  /^[\x20-\x7e]*$/.test(text) ? text : `=?UTF-8?B?${Buffer.from(text, 'utf8').toString('base64')}?=`;

/**
 * The message as it is sent after DATA: headers, a blank line, the words in base64 at 76 a line, and the end mark.
 *
 * BASE64 AND NOT EIGHT-BIT, so a relay that does not announce 8BITMIME still carries every character, and no line of the
 * body can begin with the full stop that would end the message early.
 */
function messageOf(from: string, to: readonly string[], subject: string, text: string, now: Date): string {
  const body = Buffer.from(text.replace(/\r?\n/g, '\r\n'), 'utf8').toString('base64');
  const domain = from.slice(from.indexOf('@') + 1);
  const head = [
    `From: ${from}`,
    `To: ${to.join(', ')}`,
    `Subject: ${headerText(subject)}`,
    `Date: ${now.toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: <${randomUUID()}@${domain}>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
  ];
  return [...head, '', ...(body.match(/.{1,76}/g) ?? []), '.'].join('\r\n');
}

/**
 * A sender over one fresh connection per message.
 *
 * ONE CONNECTION A MESSAGE, because a self-host mails a few letters a day and a pooled connection is one more thing that
 * goes stale overnight. `tls` is for a test's own certificate authority and nothing else.
 */
export function smtpSender(config: SmtpConfig, tls: ConnectionOptions = {}): SendLetter {
  const open = signedIn(config, tls);
  return async (letter) => {
    const to = typeof letter.to === 'string' ? [letter.to] : [...letter.to];
    if (to.length === 0 || to.some((a) => BREAK.test(a) || !a.includes('@')) || BREAK.test(letter.subject))
      throw new Error('a mail needs one or more addresses and a one-line subject');
    const wire = await open();
    try {
      wire.write(`MAIL FROM:<${config.from}>`);
      await expect(wire, 'MAIL FROM', is2);
      /* ONE MAILBOX THE SERVER DOES NOT HAVE IS SKIPPED, AND THE REST STILL GET THE MAIL (review k, RK5): a summary to
         the owner and a member stopped at the member's 550, so the owner's copy never went either. Only a refusal of
         the mailbox itself is skipped (`mailboxRefused`); a relay denied or a sender not allowed is the server refusing
         every mail, and ends the send as any other answer does. */
      const taken: string[] = [];
      let refusal = '';
      for (const address of to) {
        wire.write(`RCPT TO:<${address}>`);
        const got = await wire.reply();
        if (is2(got.code)) taken.push(address);
        else if (mailboxRefused(got)) refusal = codeOf(got);
        else throw new Error(`the mail server answered ${codeOf(got)} at RCPT TO, so the mail was not sent`);
      }
      /* NOBODY TAKEN: one address refused is that mailbox (`addressRefused`), and every one of several refused is the
         server's to explain, so Health hears it. */
      if (taken.length === 0)
        throw new Error(
          to.length === 1
            ? `the mail server has no such mailbox (${refusal} at RCPT TO), so the mail was not sent`
            : `the mail server refused every address at RCPT TO (${refusal}), so the mail was not sent`,
        );
      wire.write('DATA');
      await expect(wire, 'DATA', (c) => c === 354);
      wire.write(messageOf(config.from, taken, letter.subject, letter.text, new Date()));
      await expect(wire, 'the end of the message', is2);
      wire.write('QUIT');
      /* AND WHO IT MISSED, so a member skipped above is said on Health by name and not only in nobody's log. */
      return { refused: to.filter((a) => !taken.includes(a)) };
    } finally {
      wire.socket.end();
    }
  };
}

/**
 * MAIL THAT CANNOT GO OUT IS SAID AT START (AI20): connect, greet, upgrade and sign in, then QUIT with nothing sent. The
 * start line said only where mail goes, so a closed port or a wrong password was found by the person waiting for a
 * sign-in link that never came. Throws the same sentences a send would.
 */
export async function smtpCheck(config: SmtpConfig, tls: ConnectionOptions = {}): Promise<void> {
  const wire = await signedIn(config, tls)();
  try {
    wire.write('QUIT');
  } finally {
    wire.socket.end();
  }
}

/** A fresh connection, greeted, upgraded to TLS and signed in, ready for MAIL FROM; it closes itself on any failure. */
function signedIn(config: SmtpConfig, tls: ConnectionOptions): () => Promise<Wire> {
  const upgraded = (socket: Socket | undefined): Promise<TLSSocket> =>
    new Promise((done, failed) => {
      const secured = connectTls({ ...tls, host: config.host, port: config.port, servername: config.host, ...(socket ? { socket } : {}) }, () =>
        done(secured),
      );
      secured.once('error', failed);
    });

  return async () => {
    let wire: Wire;
    if (config.secure) wire = wireOf(await upgraded(undefined));
    else {
      const bare = connectTcp({ host: config.host, port: config.port });
      wire = wireOf(bare);
    }
    try {
      await expect(wire, 'the greeting', (c) => c === 220);
      const me = config.from.slice(config.from.indexOf('@') + 1);
      wire.write(`EHLO ${me}`);
      let offered = await expect(wire, 'EHLO', is2);

      if (!config.secure) {
        /* THE UPGRADE IS REQUIRED. A server that does not offer it would be handed the password unencrypted. */
        if (!offered.some((l) => /^STARTTLS\b/i.test(l)))
          throw new Error('the mail server does not offer STARTTLS, so nothing was sent to it. Use smtps:// on 465, or a server that offers it');
        wire.write('STARTTLS');
        await expect(wire, 'STARTTLS', (c) => c === 220);
        /* THE OLD READER LETS GO OF THE SOCKET before TLS takes it, so no ciphertext is read as a reply. */
        wire.socket.removeAllListeners('data');
        wire.socket.removeAllListeners('close');
        wire.socket.removeAllListeners('error');
        /* An error on the bare socket now surfaces on the TLS one wrapped round it; this only keeps it from being unhandled. */
        wire.socket.on('error', () => undefined);
        wire.socket.setTimeout(0);
        wire = wireOf(await upgraded(wire.socket as Socket));
        wire.write(`EHLO ${me}`);
        offered = await expect(wire, 'EHLO', is2);
      }

      if (config.user !== '') {
        const credential = Buffer.from(`\0${config.user}\0${config.password}`, 'utf8').toString('base64');
        wire.write(`AUTH PLAIN ${credential}`);
        const signed = await wire.reply();
        /* THE ONE STAGE WHOSE REFUSAL HAS ITS OWN SENTENCE, because it is the one the operator fixes in the URL. */
        if (signed.code !== 235) throw new Error(`the mail server refused the username and password in BRAINDOG_SMTP_URL (${String(signed.code)})`);
      }
      return wire;
    } catch (e) {
      wire.socket.end();
      throw e;
    }
  };
}

/** Who a `notify.email` goes to: one address or a list, or `null` when it names nobody a mail can go to. */
const recipients = (v: unknown): string[] | null => {
  const list = typeof v === 'string' ? [v] : Array.isArray(v) ? v : [];
  return list.length > 0 && list.every((a): a is string => typeof a === 'string' && a.trim() !== '') ? list : null;
};

/**
 * The `notify.email` half of the deliverer: the payload the kernel queued (`to`, `subject`, `text`), sent as it is.
 *
 * IT THROWS ON FAILURE AND DECIDES NO RETRIES, as every deliverer here does: the record's ladder retries a 4xx and a
 * dropped connection the same way, and a dead letter names the stage for the owner.
 */
export function mailedNotices(send: SendLetter, fault?: MailFault): (job: OutboxRow) => Promise<void> {
  return async (job) => {
    let payload: { to?: unknown; subject?: unknown; text?: unknown };
    try {
      payload = JSON.parse(job.payload) as typeof payload;
    } catch {
      throw new Error('a notify.email payload this host cannot read');
    }
    const to = recipients(payload.to);
    const subject = typeof payload.subject === 'string' ? payload.subject : '';
    if (!to || subject === '') throw new Error('a notify.email needs a recipient and a subject');
    if (to.length > MOST_RECIPIENTS)
      throw new Error(`a notify.email goes to at most ${String(MOST_RECIPIENTS)} addresses, and this one names ${String(to.length)}`);
    /* ONLY THE SEND ITSELF IS TOLD TO HEALTH (RH14): a payload this host cannot read is the queue's fault, not the mail
       server's, and its dead letter already says so. A summary that goes out clears a standing fault, as a sign-in mail
       does. AND AN ADDRESS THE SERVER REFUSED IS NOT THE SERVER'S FAULT (RJ7): one member whose mailbox answers 550 every
       night raised it and the owner's digest a minute later cleared it, so Health said whichever ran last. That refusal
       is the job's own dead letter, and the fault is left as it stood. */
    const what = missedWhat(payload);
    let sent: Sent | void;
    try {
      sent = await send({ to, subject, text: typeof payload.text === 'string' ? payload.text : '' });
    } catch (e) {
      const raw = e instanceof Error ? e.message : 'the mail server did not take it';
      const why = withoutAddresses(raw);
      if (fault && !addressRefused(raw)) tellRecord(() => fault.failed(`a summary mail was not sent: ${why}`));
      /* ONE PERSON'S MAILBOX REFUSED, AND NOBODY ELSE TO SEND TO: that person missed it, said on Health by name. */
      else if (fault?.missed && to.length === 1) tellRecord(() => fault.missed!(to, what));
      /* THROWN ON WITHOUT ITS ADDRESSES, so the dead letter the outbox keeps names nobody either. */
      throw new Error(why);
    }
    /* SENT, AND SOME MEMBERS MISSED IT (review k, RK5): the server took the others and refused their mailboxes. Before,
       this cleared Health and nobody heard that Mia never got the week's summary. */
    const refused = sent ? sent.refused : [];
    if (fault) tellRecord(() => fault.sent(to.filter((a) => !refused.includes(a)), what));
    if (fault?.missed && refused.length > 0) tellRecord(() => fault.missed!(refused, what));
  };
}

/** What a member missed, in the words Health says it with: the summary by its name, or a notice. */
function missedWhat(payload: { subject?: unknown; because?: unknown }): string {
  const subject = typeof payload.subject === 'string' ? payload.subject.replace(/\s+/gu, ' ').trim() : '';
  if (typeof payload.because === 'string' && payload.because.startsWith('digest.') && subject !== '')
    return `the summary "${subject.length > 60 ? `${subject.slice(0, 59).trimEnd()}…` : subject}"`;
  return 'a notice';
}

/**
 * The letters sign-in sends, in the words the Worker's `mail.ts` uses for the same kinds, as text.
 *
 * `link` IS EMPTY FOR A NOTICE, which opens nothing: it tells a person their way in changed, so a change they did not
 * make is one they hear about.
 */
export function letterOf(kind: SignInMailKind | undefined, link: string): { subject: string; text: string } {
  const unasked = 'If you did not ask for this, you can ignore this email.';
  if (kind === 'invite.sent')
    return {
      subject: "You're invited to a BrainDog",
      text: `You were invited to join a BrainDog. Open this link to see what you can do there and join:\n\n${link}\n\nThe link works once, for this address, and ends in 24 hours. ${unasked}`,
    };
  if (kind === 'invite.prove')
    return {
      subject: 'Confirm your email to join the record',
      text: `Open this link to confirm this is your address and join the record you were invited to:\n\n${link}\n\nThe link works once. ${unasked}`,
    };
  if (kind === 'passkey.added')
    return {
      subject: 'A passkey was added to your BrainDog account',
      text: 'A new passkey can now sign in to your BrainDog account. If you did not add it, sign in and remove it in Settings, then end your other sessions.',
    };
  if (kind === 'passkey.removed')
    return {
      subject: 'A passkey was removed from your BrainDog account',
      text: 'A passkey was removed from your BrainDog account. If you did not remove it, sign in and check your passkeys and sessions in Settings.',
    };
  /* THE TWO HALVES OF CHANGING A SIGN-IN ADDRESS. The link goes to the new address, so only somebody who reads
     it can finish; the notice goes to the old one, and names no address, since it may be read by whoever holds that
     mailbox now. */
  if (kind === 'email.change')
    return {
      subject: 'Confirm your new BrainDog sign-in address',
      text: `Open this link to sign in to BrainDog with this address from now on:\n\n${link}\n\nThe link works once, for the next 24 hours, while you are signed in. ${unasked}`,
    };
  if (kind === 'email.changed')
    return {
      subject: 'Your BrainDog sign-in address changed',
      text: 'This address no longer signs in to BrainDog. The account now signs in with a new one. If this was not you, sign in with the new address and check Settings.',
    };
  return {
    subject: 'Your BrainDog sign-in link',
    text: `Open this link to sign in to BrainDog:\n\n${link}\n\nThe link works once and for a short while. ${unasked}`,
  };
}

/**
 * Where a mail that went out or failed is told to the record, so Health says it (PK4). `sent` names who it reached, so a
 * person who missed one before is cleared, and `missed` who it did not (`mailMissed` in the kernel).
 */
export type MailFault = {
  failed: (error: string) => void;
  /** `what` is what went, as `missed` says it: the next run of a summary drops the lines about its last one (RM9). */
  sent: (delivered?: readonly string[], what?: string) => void;
  missed?: (addresses: readonly string[], what: string) => void;
};

/** Tell the record, which may not be open yet or may be refused: the log line still says it. */
function tellRecord(f: () => void): void {
  try {
    f();
  } catch {
    /* Nothing to tell yet. */
  }
}

/**
 * Whether a send failed because the server refused its one address (550, 551 or 553 at `RCPT TO`, a mailbox it does not
 * have: `mailboxRefused`) rather than because the server itself is down, refusing the login, refusing to relay or out of
 * room (RJ7; review k, RK5). Health's mail fault is about the server, so a mailbox that bounces is the job's dead letter
 * and never raises or clears it.
 */
export function addressRefused(error: string): boolean {
  return /\bhas no such mailbox \(55[013]\b[^)]* at RCPT TO\)/u.test(error);
}

/** A reply's enhanced status code (RFC 3463), such as `5.1.1`, when the server gave one. */
const enhancedOf = (got: { lines: string[] }): string | null => /^([245]\.\d{1,3}\.\d{1,3})\b/u.exec(got.lines[0] ?? '')?.[1] ?? null;

/** A reply's code with its enhanced code, `550 5.7.1`, and nothing else the server said. */
const codeOf = (got: { code: number; lines: string[] }): string => `${String(got.code)}${enhancedOf(got) === null ? '' : ` ${enhancedOf(got)!}`}`;

/**
 * Whether a refusal at RCPT TO is of that one mailbox (review k, RK5): 550, 551 or 553, with the enhanced code 5.1.x of
 * a bad destination address, never 5.7.x (relay access denied, sender not authorised) nor 5.1.7/5.1.8 (the sender's
 * own address), which say the server takes no mail from this host at all. A server that gives no enhanced code is
 * read by its words: a user or mailbox it does not know, and nothing of relaying, policy or the sender.
 */
export function mailboxRefused(got: { code: number; lines: string[] }): boolean {
  if (got.code !== 550 && got.code !== 551 && got.code !== 553) return false;
  const enhanced = enhancedOf(got);
  if (enhanced !== null) return /^5\.1\.\d+$/u.test(enhanced) && enhanced !== '5.1.7' && enhanced !== '5.1.8';
  const said = got.lines.join(' ');
  return /\b(?:no such|unknown|user|mailbox|recipient)\b/iu.test(said) && !/relay|denied|authori[sz]|permitted|sender|policy|spam|block/iu.test(said);
}

/**
 * A mail server's refusal with every address in it taken out (RH14). The raw text is kept on Health and printed in the
 * log, and a server's `550 <someone@example.com> no such user` names who the mail was for.
 */
export function withoutAddresses(error: string): string {
  return error.replace(/<?[^\s<>"'(),;:]+@[^\s<>"'(),;:]+>?/gu, 'an address');
}

/**
 * What the auth door calls to mail a person: called and not awaited, so a known and an unknown address answer in the same
 * time, and it never throws. A send that fails is said in one line that names the kind and never the address or the link,
 * AND RAISED ON HEALTH (`fault`, PK4): it was the server log alone, where neither the person waiting for the link nor the
 * owner looked. The next mail that goes out clears it.
 */
export function authMail(send: SendLetter, say: (line: string) => void, fault?: MailFault): (to: string, link: string, kind?: SignInMailKind) => void {
  return (to, link, kind) => {
    const letter = letterOf(kind, link);
    void send({ to, ...letter }).then(
      () => fault && tellRecord(fault.sent),
      (e: unknown) => {
        const raw = e instanceof Error ? e.message : 'the mail server did not take it';
        const why = withoutAddresses(raw);
        say(`braindog · a ${kind ?? 'sign-in'} mail was not sent: ${why}`);
        /* AN ADDRESS THE SERVER REFUSED IS SAID IN THE LOG AND NOT ON HEALTH (RJ7): the server is working. */
        if (fault && !addressRefused(raw)) tellRecord(() => fault.failed(`a ${kind ?? 'sign-in'} mail was not sent: ${why}`));
      },
    );
  };
}

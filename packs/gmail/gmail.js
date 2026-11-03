/**
 * Who you are in touch with, and what in your mail needs you, from the mail your Gmail sends in. Runs every hour and
 * reads only this BrainDog.
 *
 * WHAT IT READS. The mails the Gmail door wrote into Mail since it last looked, the other mails of their threads, the
 * mail you sent and the bills and receipts of the last two weeks, and your People and Organisations.
 *
 * WHO IS MET (1.2.0). Nobody is added to People for being in your mail, as Connect Google adds nobody for being in your
 * contacts (`meetContact` in `packages/kernel/src/people.ts`, the same rule):
 *   1. One of your own addresses (one your own person holds), or a sender under your own full name, is you. Nobody is
 *      added, and no question is asked about it.
 *   2. Somebody already in People, by any address they answer to, is linked to the mail, and their Last in touch moves
 *      to the mail's day, never back.
 *   3. Somebody new is added only when they are of use: in the last two weeks you wrote to them and they wrote to you as
 *      a person, or you both wrote in one thread. They are added with a line saying so.
 *   4. Everyone else is left out, with nothing kept. A shared inbox or a machine (info@, support@, admin@, billing@,
 *      no-reply@, notifications@, a bounce, a bot) is an organisation speaking and never a person, and a newsletter, a
 *      list or a notification is nobody. A display name that is only an address is no name: a person with no other is
 *      named by the first half of their address, as the record names them.
 * An organisation is met by its domain only with a person of use from it, and never for a mail service anybody can sign
 * up to (gmail.com, outlook.com and the like). Being named elsewhere in the record, or a small meeting together, also
 * makes somebody of use to Connect Google; this script cannot read the rest of the record or your calendar, so it leaves
 * those to it.
 *
 * WHAT IS ASKED IN NEEDS YOU (1.2.0) is decided once, when a mail is first looked at, and written as `ask`, which the
 * add-on's rules turn into a question:
 *   - A REPLY only for a mail a person wrote to you directly (you are on To, not only on Cc or a list), that you have not
 *     answered since, that is not a machine's (a list, a no-reply address, a receipt, a calendar), not an invitation or
 *     its update, and that asks you something: a question or a request. A forward with nothing asked by whoever
 *     forwarded it is for your information. ONE QUESTION A THREAD: a newer mail in a thread whose question still waits
 *     joins it, and a thread asks again only after you replied or answered.
 *   - A BILL OR A RECEIPT once for each order or invoice, with the amount first. Two mails with the same order or
 *     invoice number, or the same amount within ten days from one sender or a payment service (a PayPal receipt and the
 *     invoice it pays), are one.
 *   - A DATE only for a person's mail that names a day, never for an invitation or a mail about an event already on
 *     your calendar (the Calendar add-on asks about those), and once a thread.
 *   - MANY AT ONCE: the first look at your mail, or any hour that would ask more than five questions, asks one question
 *     in their place, such as "12 mails may need you". Each of them is on the Mail page.
 * What a mail looks like (a bill, a receipt, a date) is said here too: a bill needs "invoice" in its subject, or bill
 * words with an amount or a sender known to send bills; a receipt needs receipt or order words with the same; a
 * newsletter is never any of them. Gmail updating a mail later never changes it, and "Not a bill" clears it.
 *
 * IT NEVER TOUCHES GMAIL, and it never answers, files or deletes a mail. Only you act on what it asks.
 */

/*
 * WHO SOMEBODY IS, READ AS THE RECORD READS IT, from `packages/kernel/src/identity-keys.ts`: an address is one person by
 * its key (lower case, and Gmail's dots and +tags folded), and a domain is one organisation by the domain it registered
 * (`mail.marlow.co.uk` is `marlow.co.uk`). The lists are the kernel's own, copied, because a script imports nothing.
 */
const PUBLIC_MAIL = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'outlook.fr', 'outlook.de', 'outlook.es', 'outlook.it', 'outlook.sa',
  'outlook.co.uk', 'outlook.com.au', 'hotmail.com', 'hotmail.co.uk', 'hotmail.fr', 'hotmail.de', 'hotmail.it',
  'hotmail.es', 'hotmail.ca', 'hotmail.com.br', 'live.com', 'live.co.uk', 'live.fr', 'live.de', 'live.it', 'live.nl',
  'live.ca', 'live.ie', 'live.com.au', 'msn.com', 'passport.com', 'windowslive.com', 'icloud.com', 'me.com',
  'mac.com', 'privaterelay.appleid.com', 'yahoo.com', 'yahoo.co.uk', 'yahoo.com.eg', 'yahoo.fr', 'yahoo.de',
  'yahoo.es', 'yahoo.it', 'yahoo.ca', 'yahoo.ie', 'yahoo.in', 'yahoo.co.in', 'yahoo.co.jp', 'yahoo.com.au',
  'yahoo.co.nz', 'yahoo.com.br', 'yahoo.com.mx', 'yahoo.com.ar', 'yahoo.com.sg', 'yahoo.com.hk', 'yahoo.gr',
  'ymail.com', 'rocketmail.com', 'aol.com', 'aim.com', 'duck.com', 'proton.me', 'protonmail.com', 'protonmail.ch',
  'pm.me', 'tutanota.com', 'tutanota.de', 'tuta.io', 'tutamail.com', 'keemail.me', 'fastmail.com', 'fastmail.fm',
  'hey.com', 'mailbox.org', 'posteo.de', 'posteo.net', 'runbox.com', 'hushmail.com', 'zoho.com', 'zohomail.com',
  'zoho.eu', 'zoho.in', 'mail.com', 'email.com', 'usa.com', 'inbox.com', 'lycos.com', 'gmx.com', 'gmx.de', 'gmx.net',
  'gmx.at', 'gmx.ch', 'gmx.co.uk', 'gmx.fr', 'gmx.us', 'btinternet.com', 'btopenworld.com', 'sky.com',
  'virginmedia.com', 'ntlworld.com', 'blueyonder.co.uk', 'talktalk.net', 'tiscali.co.uk', 'comcast.net',
  'verizon.net', 'att.net', 'sbcglobal.net', 'bellsouth.net', 'cox.net', 'charter.net', 'earthlink.net',
  'optonline.net', 'rogers.com', 'shaw.ca', 'sympatico.ca', 'bigpond.com', 'bigpond.net.au', 'optusnet.com.au',
  'xtra.co.nz', 'orange.fr', 'wanadoo.fr', 'free.fr', 'sfr.fr', 'laposte.net', 'web.de', 't-online.de', 'freenet.de',
  'libero.it', 'virgilio.it', 'tin.it', 'alice.it', 'link.net', 'tedata.net.eg', 'yandex.com', 'yandex.ru',
  'yandex.ua', 'yandex.by', 'yandex.kz', 'ya.ru', 'mail.ru', 'inbox.ru', 'list.ru', 'bk.ru', 'rambler.ru', 'ukr.net',
  'seznam.cz', 'wp.pl', 'o2.pl', 'onet.pl', 'interia.pl', 'qq.com', 'foxmail.com', '163.com', '126.com', 'yeah.net',
  'sina.com', 'sohu.com', 'aliyun.com', 'naver.com', 'daum.net', 'hanmail.net', 'rediffmail.com', 'maktoob.com',
  'users.noreply.github.com', 'users.noreply.gitlab.com',
]);
const PLATFORMS = new Set([
  'github.io', 'gitlab.io', 'vercel.app', 'netlify.app', 'pages.dev', 'workers.dev', 'herokuapp.com', 'web.app',
  'firebaseapp.com', 'appspot.com', 'azurewebsites.net', 'fly.dev', 'onrender.com', 'up.railway.app', 'railway.app',
  'glitch.me', 'surge.sh', 'ngrok.io', 'ngrok-free.app', 'replit.app', 'repl.co', 'deno.dev', 'carrd.co',
]);
const SECOND_LEVEL = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'ltd.uk', 'plc.uk', 'me.uk', 'net.uk', 'sch.uk', 'nhs.uk', 'police.uk',
  'com.eg', 'edu.eg', 'gov.eg', 'org.eg', 'net.eg', 'sci.eg', 'eun.eg', 'com.au', 'net.au', 'org.au', 'edu.au',
  'gov.au', 'asn.au', 'id.au', 'co.nz', 'org.nz', 'ac.nz', 'govt.nz', 'net.nz', 'co.za', 'org.za', 'ac.za', 'gov.za',
  'net.za', 'co.jp', 'ne.jp', 'or.jp', 'ac.jp', 'go.jp', 'co.in', 'net.in', 'org.in', 'gov.in', 'ac.in', 'edu.in',
  'firm.in', 'gen.in', 'ind.in', 'com.br', 'net.br', 'org.br', 'gov.br', 'edu.br', 'com.mx', 'com.ar', 'com.co',
  'com.pe', 'com.ve', 'com.ec', 'com.uy', 'com.py', 'com.bo', 'com.do', 'com.gt', 'com.pa', 'com.tr', 'gov.tr',
  'edu.tr', 'org.tr', 'net.tr', 'gen.tr', 'com.sa', 'gov.sa', 'edu.sa', 'org.sa', 'net.sa', 'med.sa', 'co.ae',
  'net.ae', 'org.ae', 'gov.ae', 'ac.ae', 'com.qa', 'gov.qa', 'edu.qa', 'org.qa', 'com.kw', 'edu.kw', 'gov.kw',
  'com.bh', 'com.om', 'co.om', 'com.jo', 'gov.jo', 'edu.jo', 'com.lb', 'org.lb', 'edu.lb', 'com.ly', 'com.sy',
  'com.iq', 'com.ps', 'com.ye', 'com.sd', 'com.tn', 'com.dz', 'co.ma', 'ac.ma', 'gov.ma', 'ac.ir', 'co.ir', 'co.il',
  'ac.il', 'org.il', 'gov.il', 'com.ng', 'gov.ng', 'edu.ng', 'org.ng', 'co.ke', 'or.ke', 'ac.ke', 'co.tz', 'co.ug',
  'co.zw', 'co.bw', 'com.cn', 'net.cn', 'org.cn', 'gov.cn', 'edu.cn', 'ac.cn', 'com.hk', 'edu.hk', 'gov.hk',
  'org.hk', 'net.hk', 'com.tw', 'com.sg', 'edu.sg', 'gov.sg', 'org.sg', 'net.sg', 'com.my', 'edu.my', 'gov.my',
  'org.my', 'net.my', 'co.kr', 'ac.kr', 'go.kr', 'or.kr', 'ne.kr', 'co.th', 'in.th', 'ac.th', 'go.th', 'co.id',
  'ac.id', 'or.id', 'go.id', 'web.id', 'com.vn', 'com.ph', 'com.pk', 'edu.pk', 'gov.pk', 'org.pk', 'net.pk',
  'com.bd', 'edu.bd', 'com.np', 'com.lk', 'com.af', 'com.ua', 'co.at', 'or.at', 'ac.at', 'com.pl', 'net.pl',
  'org.pl', 'co.hu', 'com.gr', 'com.cy', 'com.mt', 'com.es', 'org.es', 'ae.org',
]);
const NOT_REGISTERED = /(?:^|\.)(?:local|localhost|localdomain|internal|lan|home|arpa|invalid|corp)$/u;

/* A SHARED INBOX OR A MACHINE, from the same file: a function, not a person, so it never becomes one. */
const ROLE_LOCALS = new Set([
  'info', 'support', 'hello', 'hi', 'contact', 'contactus', 'team', 'billing', 'invoice', 'invoices', 'accounts',
  'accounting', 'sales', 'admin', 'help', 'helpdesk', 'office', 'notifications', 'notification', 'notify', 'alerts',
  'alert', 'noreply', 'no-reply', 'no_reply', 'donotreply', 'do-not-reply', 'do_not_reply', 'mailer-daemon',
  'postmaster', 'newsletter', 'news', 'marketing', 'receipts', 'receipt', 'orders', 'order', 'security', 'service',
  'services', 'care', 'customercare', 'customerservice', 'customersupport', 'techsupport', 'feedback', 'jobs',
  'careers', 'hr', 'press', 'payments', 'bounce', 'bounces', 'updates', 'digest', 'reply', 'mail', 'email',
  'webmaster', 'hostmaster', 'abuse', 'privacy', 'legal', 'statements', 'estatements', 'banking', 'onlinebanking',
  'ebanking', 'enquiries', 'enquiry', 'inquiries', 'inquiry', 'reservations', 'reservation', 'booking', 'bookings',
  'shop', 'store', 'events', 'partners', 'partnerships', 'community', 'membership', 'members', 'finance',
  'procurement', 'purchasing', 'compliance', 'operations', 'reception', 'frontdesk', 'general', 'mailbox', 'inbox',
  'investors', 'developers', 'engineering', 'devops', 'welcome', 'account', 'subscriptions', 'messages', 'verify',
  'verification', 'kyc',
]);
const ROLE_JOINERS = new Set(['customer', 'customers', 'client', 'clients', 'team', 'desk', 'dept', 'department', 'group', 'centre', 'center']);
const MACHINE = /(?:^|[._+-])(?:no[._-]?reply|do[._-]?not[._-]?reply|notifications?|notify|mailer|daemon|bounces?|bots?|robot|automated|alerts?|postmaster)(?=[._+\-\d]|$)/u;
const MACHINE_LOCALS = new Set([
  'root', 'ubuntu', 'runner', 'ec2-user', 'centos', 'debian', 'vagrant', 'jenkins', 'git', 'www-data', 'nobody',
  'github-actions', 'actions-user', 'dependabot', 'renovate', 'mergify', 'greenkeeper', 'buildbot', 'ci', 'build',
  'builder', 'deploy', 'deployer', 'automation', 'gitlab-runner', 'circleci', 'codecov', 'cursoragent', 'copilot',
  'codex', 'aider', 'devin-ai-integration',
]);
const BOT_NAME = /\[bot\]$|(?:^|[\s_-])bot$|github-actions|dependabot|greenkeeper|snyk-bot|semantic-release|pre-commit-ci|imgbot|allcontributors|mergify|^renovate$/iu;
const GITHUB_PRIVATE = /^(?:\d+\+)?([a-z0-9](?:[a-z0-9_-]{0,38})(?:\[bot\])?)@users\.noreply\.github\.com$/u;

/** An address as People keys it, `email:<address>`, or `null` when it is no address. */
export function emailKey(raw) {
  const m = /^([^@\s<>"]+)@([^@\s<>"]+\.[^@\s<>".]+)$/u.exec(String(raw ?? '').trim().toLowerCase());
  if (!m) return null;
  const local = m[1];
  const domain = m[2].replace(/\.$/u, '');
  if (domain === 'gmail.com' || domain === 'googlemail.com') return `email:${local.replace(/\+.*$/u, '').replace(/\./gu, '')}@gmail.com`;
  return `email:${local}@${domain}`;
}

/** The domain an organisation registered, from a domain, an address or a web address, or `null` for nobody's. */
export function registrable(raw) {
  let s = String(raw ?? '').trim().toLowerCase();
  const at = s.lastIndexOf('@');
  if (at >= 0 && !s.includes('/')) s = s.slice(at + 1);
  const host = s.replace(/^[a-z][a-z0-9+.-]*:\/\//u, '').replace(/[/?#].*$/u, '').replace(/:\d+$/u, '').replace(/\.$/u, '').replace(/^www\./u, '');
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/u.test(host) || /\.\d+$/u.test(host) || NOT_REGISTERED.test(host)) return null;
  if (SECOND_LEVEL.has(host) || PLATFORMS.has(host)) return null;
  const labels = host.split('.');
  let domain = labels.slice(-2).join('.');
  for (let i = 1; i < labels.length - 1; i++) {
    const suffix = labels.slice(i).join('.');
    if (SECOND_LEVEL.has(suffix) || PLATFORMS.has(suffix)) {
      domain = labels.slice(i - 1).join('.');
      break;
    }
  }
  return PUBLIC_MAIL.has(domain) || PUBLIC_MAIL.has(host) ? null : domain;
}

/**
 * Whether an address is a shared inbox or a machine, an organisation speaking and never a person (`isOrganisationAddress`
 * in the kernel): `info@`, `support2@`, `customer.service@`, `no-reply@`, `notifications+x@`, `bounce-…@`, a bot.
 * GitHub's private address is a person, unless its login is a bot's.
 */
export function isOrganisationAddress(address) {
  const m = /^([^@\s<>"]+)@([^@\s<>"]+\.[^@\s<>".]+)$/u.exec(String(address ?? '').trim().toLowerCase());
  if (!m) return false;
  const login = GITHUB_PRIVATE.exec(`${m[1]}@${m[2]}`)?.[1] ?? null;
  if (login !== null) return BOT_NAME.test(login) || MACHINE_LOCALS.has(login);
  const local = m[1];
  const bare = local.replace(/\+.*$/u, '');
  if (ROLE_LOCALS.has(bare) || ROLE_LOCALS.has(bare.replace(/\d+$/u, ''))) return true;
  const parts = bare.split(/[._-]/u).filter(Boolean);
  if (parts.length > 1 && parts.some((p) => ROLE_LOCALS.has(p)) && parts.every((p) => ROLE_LOCALS.has(p) || ROLE_JOINERS.has(p))) return true;
  return MACHINE.test(bare) || /\[bot\]$/u.test(local) || MACHINE_LOCALS.has(bare) || BOT_NAME.test(bare);
}

/**
 * The name a mail gives somebody, or `null`: a display name with any address in it taken out, so `ada@x.com` or
 * `ada@x.com <ada@x.com>` names nobody (`nameOnly` in the kernel).
 */
export function nameIn(raw) {
  const said = String(raw ?? '').replace(/[^\s<>()[\]"',;:]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/giu, ' ').replace(/<\s*>|\(\s*\)|\[\s*\]/gu, ' ').replace(/\s+/gu, ' ').trim();
  return said === '' ? null : said;
}

/** A name as it compares: lower case, letters and digits, one space between words. */
const nameKey = (s) => String(s ?? '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** The keys a row holds in its `keys` (and a person's `handles`), written `kind:value`, of the kind asked. */
function keysIn(fields, kind, read) {
  const out = [];
  for (const list of [fields.keys, fields.handles]) {
    if (!Array.isArray(list)) continue;
    for (const k of list) {
      const m = typeof k === 'string' ? /^([a-z][a-z0-9.-]*):(.+)$/iu.exec(k.trim()) : null;
      if (m && m[1].toLowerCase() === kind) {
        const key = read(m[2]);
        if (key !== null) out.push(key);
      }
    }
  }
  return out;
}

/* AT MOST THIS MANY MAILS A RUN, so a first hour after a long gap is spread over the next ones. */
const MOST = 200;
/* WHAT "LATELY" IS: the two weeks the door keeps, for being of use and for one order's two mails. */
const WINDOW_DAYS = 14;
const SAME_ORDER_DAYS = 10;
/* MORE QUESTIONS THAN THIS IN ONE HOUR ARE ASKED AS ONE. */
const FLOOD = 5;

const BILLERS = /(^|\.)(stripe\.com|paypal\.com|paddle\.com|apple\.com|google\.com|microsoft\.com|amazon\.[a-z.]+|aws\.amazon\.com|adobe\.com|netflix\.com|spotify\.com|uber\.com|airbnb\.com|github\.com|vercel\.com|cloudflare\.com|digitalocean\.com|heroku\.com|godaddy\.com|namecheap\.com|squarespace\.com|shopify\.com|wix\.com|notion\.so|figma\.com|slack\.com|zoom\.us|dropbox\.com|atlassian\.com|openai\.com|anthropic\.com|xero\.com|intuit\.com|quickbooks\.com|freshbooks\.com|waveapps\.com|chargebee\.com|recurly\.com|gocardless\.com|wise\.com|revolut\.com|vodafone\.[a-z.]+|etisalat\.[a-z.]+|orange\.[a-z.]+)$/i;
const BILLING_SENDER = /^(billing|invoices?|receipts?|payments?|accounts?|statements?|orders?)[@+.-]/i;
const AMOUNT = /([$€£¥₹]\s?\d[\d,]*(\.\d{1,2})?|\b(usd|eur|gbp|egp|aed|sar|cad|aud|inr|jpy|chf)\s?\d[\d,]*(\.\d{1,2})?|\d[\d,]*(\.\d{1,2})?\s?(usd|eur|gbp|egp|aed|sar|cad|aud|inr|jpy|chf)\b)/i;
/* WHO TAKES A PAYMENT FOR SOMEBODY ELSE: their receipt and the seller's invoice are one purchase. */
const PAYERS = /(^|\.)(paypal\.com|stripe\.com|paddle\.com|wise\.com|revolut\.com|squareup\.com|square\.com|venmo\.com|cash\.app|payoneer\.com|apple\.com|google\.com|fawry\.com|paymob\.com|instapay\.eg)$/i;

/** Whether a mail reads as a newsletter by its sender or its words, for a script that does not say `list`. */
export function looksLikeNewsletter(text, address) {
  return /^(news|newsletters?|marketing|promo(tions)?|offers|deals|digest|weekly|editor|community)[@+.-]/i.test(String(address ?? '')) ||
    /\b(newsletter|unsubscribe|weekly digest|this week in|% off|flash sale|webinar)\b/i.test(String(text ?? ''));
}

/*
 * A CALENDAR'S OWN MAIL: an invitation, its update, an answer to one, or a cancelling. Google's come from the organiser
 * with Google Calendar as the sender, so the subject and the words are what a script without the headers can read;
 * Connect Google reads the headers, and says `event` (as Gmail's guess) for one, or for a mail about an event your
 * calendar already holds.
 */
const INVITE_SUBJECT = /^(?:(?:updated |new )?invitation(?: with note)?|accepted|declined|tentatively accepted|tentative|maybe|cancel+ed(?: event)?|event cancel+ed|updated event|new event|proposed new time)\s*(?:\([^)]*\))?\s*:/i;
const INVITE_WORDS = /\b(invite\.ics|invitation from google calendar|you have been invited (?:to|by)|has invited you to|join with google meet|view all guest info|reply for \S+@|this event has been (?:changed|updated|cancel+ed)|calendar-notification@google\.com)\b/i;

/** Whether a mail is a calendar's: an invitation, its update or an answer to one. */
export function isInvite(subject, snippet, address) {
  return INVITE_SUBJECT.test(String(subject ?? '').trim()) || INVITE_WORDS.test(String(snippet ?? '')) || /^calendar-(?:notification|server)@google\.com$/i.test(String(address ?? '').trim());
}

/* A DAY OR A TIME NAMED IN WORDS: a weekday, a month and a day, a date in figures, tomorrow, next week, or 3pm. */
const DAY_NAMED = /\b(mon|tues?|wed(nes)?|thu(rs?)?|fri|sat(ur)?|sun)(day)?\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b|\b\d{1,2}(st|nd|rd|th)?\s+(of\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\b|\b\d{1,2}[/.-]\d{1,2}([/.-]\d{2,4})?\b|\b(tomorrow|tonight|next week|this week|end of (the )?(day|week|month))\b|\b\d{1,2}(:\d{2})?\s?(am|pm)\b/i;

/** What a received mail looks like: `bill`, `receipt`, `date` or `none`. `hint` is what the script in Google sent. */
export function kindOf(subject, snippet, address, hint) {
  const s = String(subject ?? '');
  const n = String(snippet ?? '');
  const text = `${s} ${n}`;
  const from = String(address ?? '').toLowerCase();
  /* A NEWSLETTER IS NONE OF THEM, AND SO IS A CALENDAR'S MAIL (`event`): the Calendar add-on has the event. */
  if (hint === 'list' || hint === 'event' || looksLikeNewsletter(text, from)) return 'none';
  const known = BILLERS.test(from.split('@')[1] ?? '') || BILLING_SENDER.test(from);
  const amount = AMOUNT.test(text);
  if (/\binvoice\b/i.test(s) || (/\binvoice\b/i.test(n) && (amount || known))) return 'bill';
  if (/\b(amount due|payment due|due date|pay by|your bill|bill is ready|new bill|statement is ready|renewal notice|payment failed)\b/i.test(text) && (amount || known)) return 'bill';
  if (/\b(receipt|order confirm\w*|your order|order (no|number|#)|payment received|thanks for your (order|purchase|payment)|we received your payment)\b/i.test(text) && (amount || known)) return 'receipt';
  /* A DATE NAMES A DAY, and an invitation is the calendar's, never a date to put on it. */
  if (isInvite(s, n, from)) return 'none';
  if (/\b(invitation|invite|meeting|appointment|booking|reservation|interview|deadline|rsvp)\b/i.test(text) && DAY_NAMED.test(text)) return 'date';
  return 'none';
}

/** The first amount a mail names, as written (`$49.00`), and as it compares (`USD 49.00`), or `null`. */
export function amountOf(text) {
  const m = AMOUNT.exec(String(text ?? ''));
  if (!m) return null;
  const said = m[0].trim();
  const symbol = { $: 'USD', '€': 'EUR', '£': 'GBP', '¥': 'JPY', '₹': 'INR' }[said[0]];
  const code = symbol ?? (/[a-z]{3}/i.exec(said)?.[0] ?? '').toUpperCase();
  const figure = Number((/\d[\d,]*(\.\d{1,2})?/u.exec(said)?.[0] ?? '').replace(/,/gu, ''));
  if (!Number.isFinite(figure) || figure <= 0) return null;
  return { said, key: `${code} ${figure.toFixed(2)}` };
}

/** An order, invoice or receipt number a mail names, upper case, or `null`: `Order #1042`, `Invoice INV-2026-07`. */
export function refOf(text) {
  const re = /\b(?:order|invoice|inv|receipt|bill|transaction|confirmation|booking|reference|ref)\b\.?\s*(?:no\.?|number|num|id|code)?\s*[:#]?\s*#?\s*([a-z0-9][a-z0-9-]{3,})/giu;
  for (const m of String(text ?? '').matchAll(re)) {
    const ref = m[1].replace(/-+$/u, '').toUpperCase();
    if (/\d/u.test(ref)) return ref;
  }
  return null;
}

/*
 * WHAT A PERSON WROTE THEMSELVES, before the mail they reply to or forward: Gmail's snippet is the start of the text, so
 * a reply's own words come before "On … wrote:" and a forward's before "Forwarded message".
 */
const QUOTED = /-{2,}\s*forwarded message\s*-{2,}|begin forwarded message:|-{2,}\s*original message\s*-{2,}|\bon\s.{4,80}?\swrote:|\bfrom:\s.+?\bsent:\s/iu;
export const ownWords = (snippet) => {
  const s = String(snippet ?? '');
  const m = QUOTED.exec(s);
  return (m ? s.slice(0, m.index) : s).trim();
};
const FORWARD = /^\s*(?:fwd?|fw|tr|wg|rv)\s*:/iu;
const REPLY = /^\s*(?:re|aw|sv|antw)\s*:/iu;
/* A QUESTION OR A REQUEST, in English or Arabic. */
const ASKS = /[?؟]|\b(can|could|would|will|shall|should|do|did|does|are|is|have|has) (you|we|u)\b|\b(any chance|please|pls|plz|kindly|let me know|lmk|get back to me|your thoughts|thoughts on|what do you think|wdyt|need you to|need your|waiting (for|on) (you|your)|when can|when are|when will|how about|can i|may i|asap|approve|sign off|confirm)\b|(ممكن|من فضلك|لو سمحت|محتاج|ياريت|يا ريت|رأيك|تقدر)/iu;

/** Whether a mail asks something of you: a question or a request in its own words, a forward's included. */
export function asksSomething(subject, snippet) {
  const mine = ownWords(snippet);
  /* A FORWARD'S SUBJECT IS THE MAIL IT FORWARDS, and a reply's is the thread's first: only a new subject is theirs now. */
  const head = FORWARD.test(String(subject ?? '')) || REPLY.test(String(subject ?? '')) ? '' : String(subject ?? '');
  return ASKS.test(`${head} ${mine}`);
}

/**
 * Every row of a list that matches `where`, oldest first, up to `most`. A script's list answers a page of 50 and takes
 * no `limit` (1.1.0 asked for one, and every run was refused before it read a row), so it pages by row number.
 */
async function every(ctx, list, where, most = 5000) {
  const out = [];
  let from = 1;
  for (;;) {
    const clause = { field: 'seq', gte: from };
    const page = await ctx.record.list(list, where ? { all: [where, clause] } : clause, { order: 'seq' });
    out.push(...page);
    if (page.length < 50 || out.length >= most) return out.slice(0, most);
    from = page[page.length - 1].seq + 1;
  }
}

/** Every row whose `field` is one of `values`, a few dozen values a page. */
async function everyIn(ctx, list, field, values, also) {
  const out = [];
  const all = [...new Set(values)].filter((v) => typeof v === 'string' && v !== '');
  for (let i = 0; i < all.length; i += 40) {
    const clause = { field, in: all.slice(i, i + 40) };
    out.push(...(await every(ctx, list, also ? { all: [clause, also] } : clause, 2000)));
  }
  return out;
}

const spoken = (list, row) => `${list}#${row.seq}`;
const lower = (v) => (typeof v === 'string' ? v.trim().toLowerCase() : '');
const dayOf = (f) => (typeof f.day === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(f.day) ? f.day : String(f.at ?? '').slice(0, 10));
const atOf = (f) => String(f.at ?? f.day ?? '');
const daysApart = (a, b) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;
const dayBefore = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);

/**
 * The day of an instant in a zone, `YYYY-MM-DD`, or `null` when it cannot be said, and then the day Gmail sent is kept.
 * The script in Google sends the day in the zone it was set up with, so this only mends one sent in another.
 */
export function dayIn(iso, tz) {
  const at = new Date(String(iso ?? ''));
  if (Number.isNaN(at.getTime()) || typeof Intl === 'undefined') return null;
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
    return /^\d{4}-\d{2}-\d{2}$/u.test(parts) ? parts : null;
  } catch {
    return null;
  }
}

/** An organisation's name from its domain: `marlow-studio.co.uk` is Marlow Studio. */
export function orgName(domain) {
  const parts = String(domain).split('.');
  const second = new Set(['co', 'com', 'org', 'net', 'ac', 'gov', 'edu']);
  let stem = parts.length > 2 && second.has(parts[parts.length - 2]) ? parts[parts.length - 3] : parts[parts.length - 2] ?? parts[0];
  stem = String(stem ?? '').replace(/[-_]+/gu, ' ').trim();
  return stem.replace(/\b\w/gu, (c) => c.toUpperCase()) || domain;
}

/** "3 receipts", "1 bill": a count and its word. */
const counted = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const joined = (parts) => (parts.length < 2 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`);

/**
 * The one question in place of many: how many mails, and what kinds, with where to find them.
 * `12 mails may need you: 7 waiting on your reply, 3 receipts and 2 bills. They are on the Mail page.`
 */
export function manySaid(asks) {
  const n = (k) => asks.filter((a) => a === k).length;
  const parts = [
    n('reply') > 0 ? `${n('reply')} waiting on your reply` : '',
    n('bill') > 0 ? counted(n('bill'), 'bill', 'bills') : '',
    n('receipt') > 0 ? counted(n('receipt'), 'receipt', 'receipts') : '',
    n('date') > 0 ? `${n('date')} with a date` : '',
  ].filter(Boolean);
  return `${counted(asks.length, 'mail', 'mails')} may need you: ${joined(parts)}. They are on the Mail page.`;
}

export default async function run(ctx) {
  const tz = ctx.tz || 'UTC';
  const today = typeof ctx.today === 'function' ? ctx.today() : String(ctx.now()).slice(0, 10);
  const from = dayBefore(today, WINDOW_DAYS);

  /* "LEAVE THEM" ON A QUESTION ASKED IN PLACE OF MANY leaves each of them: they come off the Mail page's lists. */
  let left = 0;
  for (const many of await ctx.record.list('gmail_mail', { all: [{ field: 'ask', is: 'many' }, { field: 'answered', is: true }] }, { order: 'seq' })) {
    const batch = many.fields.batch;
    if (typeof batch !== 'string' || batch === '') continue;
    for (const row of await every(ctx, 'gmail_mail', { field: 'batch', is: batch }, 500))
      if (row.id !== many.id && row.fields.answered !== true) {
        ctx.update(spoken('gmail_mail', row), { answered: true, wants: false });
        left++;
      }
    ctx.update(spoken('gmail_mail', many), { batch: null, wants: false });
  }

  const mail = await every(ctx, 'gmail_mail', { none: [{ field: 'met', is: true }] }, MOST);
  /* NO NEW MAIL IS NOTHING TO DO, and says nothing, so an hour with no mail leaves no line. */
  if (mail.length === 0) return left > 0 ? { looked: 0, left } : { looked: 0 };
  mail.sort((a, b) => (atOf(a.fields) < atOf(b.fields) ? -1 : atOf(a.fields) > atOf(b.fields) ? 1 : a.seq - b.seq));
  const fresh = new Set(mail.map((r) => r.id));

  /* THE FIRST LOOK AT A MAILBOX: no mail was ever looked at before. */
  const first = (await ctx.record.list('gmail_mail', { field: 'met', is: true }, { order: 'seq' })).length === 0;

  /* EACH NEW MAIL'S THREAD AS IT STANDS, older mails and new, so a thread asks once and only while its last word is theirs. */
  const threads = new Map();
  for (const row of await everyIn(ctx, 'gmail_mail', 'thread', mail.map((r) => r.fields.thread))) {
    const t = row.fields.thread;
    if (!threads.has(t)) threads.set(t, []);
    if (!threads.get(t).some((r) => r.id === row.id)) threads.get(t).push(row);
  }
  for (const row of mail) {
    const t = typeof row.fields.thread === 'string' && row.fields.thread !== '' ? row.fields.thread : `mail:${row.id}`;
    if (!threads.has(t)) threads.set(t, []);
    if (!threads.get(t).some((r) => r.id === row.id)) threads.get(t).push(row);
  }
  const threadOf = (row) => threads.get(typeof row.fields.thread === 'string' && row.fields.thread !== '' ? row.fields.thread : `mail:${row.id}`) ?? [row];

  /* THE BILLS AND RECEIPTS OF THE LAST TWO WEEKS, for one order's second mail. Read only when a new one is money. */
  const kinds = new Map(mail.map((row) => [row.id, row.fields.direction === 'sent' ? 'none' : kindOf(row.fields.subject, row.fields.snippet, row.fields.address, row.fields.hint ?? row.fields.kind)]));
  const money = [...kinds.values()].some((k) => k === 'bill' || k === 'receipt')
    ? (await every(ctx, 'gmail_mail', { all: [{ field: 'kind', in: ['bill', 'receipt'] }, { field: 'day', gte: dayBefore(today, WINDOW_DAYS + SAME_ORDER_DAYS) }] }, 2000)).filter((r) => !fresh.has(r.id))
    : [];

  /* PEOPLE AND ORGANISATIONS ARE READ ONLY WHEN A MAIL NEEDS THEM: an hour of newsletters reads neither. */
  const needs = mail.some((row) => (row.fields.person === true || row.fields.direction === 'sent') && emailKey(row.fields.address) !== null);
  const people = needs ? await every(ctx, 'people') : [];
  const orgs = needs ? await every(ctx, 'organisations') : [];
  /* EVERY KEY A ROW HOLDS, TO THE ROW THAT ANSWERS TO IT: a merged row's keys answer to the row it was folded into, as
     the record's do, and a key whose row this run cannot find is still taken, so nothing is written under it. */
  const holders = (rows, own) => {
    const byId = new Map(rows.map((r) => [r.id, r]));
    const live = (r) => {
      let at = r;
      for (let hop = 0; hop < 4 && at && typeof at.fields.merged_into === 'string' && at.fields.merged_into !== ''; hop++) at = byId.get(at.fields.merged_into);
      return at ?? null;
    };
    const out = new Map();
    for (const r of rows) for (const key of own(r)) if (!out.has(key) || out.get(key) === null) out.set(key, live(r));
    return out;
  };
  const keysOfPerson = (p) => [emailKey(p.fields.email), ...keysIn(p.fields, 'email', emailKey)].filter((k) => k !== null);
  const byEmail = holders(people, keysOfPerson);
  const byDomain = holders(orgs, (o) => [registrable(o.fields.domain), ...keysIn(o.fields, 'domain', registrable)].filter((k) => k !== null));
  /* YOU: every address your own person holds, and your full name. */
  const selves = people.filter((p) => p.fields.self === true && (typeof p.fields.merged_into !== 'string' || p.fields.merged_into === ''));
  const mine = new Set(selves.flatMap(keysOfPerson));
  const myNames = new Set(selves.flatMap((p) => [p.fields.name, ...(Array.isArray(p.fields.aliases) ? p.fields.aliases : [])]).map(nameKey).filter((n) => n.includes(' ')));
  const isMe = (key, name) => (key !== null && mine.has(key)) || (name !== null && myNames.has(nameKey(name)));

  /* WHO YOU WERE IN TOUCH WITH LATELY, for whether somebody new is of use: the mail you sent of the last two weeks (to
     whom, and in which threads), and the mail each newcomer sent you as a person. Read only when there is a newcomer. */
  const newcomers = mail.filter((row) => {
    const key = emailKey(row.fields.address);
    return key !== null && (row.fields.person === true || row.fields.direction === 'sent') && !byEmail.has(key) && !isOrganisationAddress(row.fields.address);
  });
  const sentTo = new Map();
  const sentIn = new Set();
  const heardFrom = new Map();
  if (newcomers.length > 0) {
    const sent = await every(ctx, 'gmail_mail', { all: [{ field: 'direction', is: 'sent' }, { field: 'day', gte: from }] }, 3000);
    const heard = await everyIn(ctx, 'gmail_mail', 'address', newcomers.map((r) => lower(r.fields.address)), { field: 'day', gte: from });
    for (const row of [...sent, ...heard, ...mail]) {
      const f = row.fields;
      const key = emailKey(f.address);
      const day = dayOf(f);
      if (day < from) continue;
      if (f.direction === 'sent') {
        if (key !== null && (sentTo.get(key) ?? '') < day) sentTo.set(key, day);
        if (typeof f.thread === 'string' && f.thread !== '') sentIn.add(f.thread);
      } else if (f.person === true && key !== null) {
        if (!heardFrom.has(key)) heardFrom.set(key, []);
        heardFrom.get(key).push({ day, thread: f.thread });
      }
    }
  }
  /** Whether somebody new is of use, and the last day you were in touch: both of you wrote lately, or in one thread. */
  const ofUse = (key) => {
    const heard = heardFrom.get(key) ?? [];
    if (heard.length === 0) return null;
    const sent = sentTo.get(key);
    const thread = heard.some((h) => typeof h.thread === 'string' && sentIn.has(h.thread));
    if (sent === undefined && !thread) return null;
    return heard.reduce((d, h) => (h.day > d ? h.day : d), sent ?? '');
  };

  const metNow = new Set();
  const orgNow = new Set();
  /* ONE UPDATE A PERSON A RUN, however many of their mails came in, and EVERY UPDATE IS LAST WRITER WINS: each sets only
     the fields this script owns. */
  const owed = new Map();
  const patches = new Map(mail.map((row) => [row.id, {}]));
  let met = 0;
  let orgsMet = 0;
  let linked = 0;
  let waiting = 0;
  let skipped = 0;

  /* ── WHO ─────────────────────────────────────────────────────────────── */
  const waits = new Set();
  for (const row of mail) {
    const f = row.fields;
    const patch = patches.get(row.id);
    /* THE DAY IN YOUR CLOCK, OR THE DAY GMAIL SENT when this host cannot say one (a sandbox with no zones). */
    const mended = dayIn(f.at, tz);
    if (mended !== null && mended !== f.day) patch.day = mended;
    const day = mended ?? (typeof f.day === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(f.day) ? f.day : null);
    const kind = kinds.get(row.id);
    if (kind !== (f.kind ?? 'none')) patch.kind = kind;
    const address = lower(f.address);
    const key = emailKey(address);
    const counts = (f.person === true || f.direction === 'sent') && key !== null && address.length <= 254 && !/@users\.noreply\.git(hub|lab)\.com$/u.test(address) && !isOrganisationAddress(address);
    if (!counts || isMe(key, nameIn(f.name))) continue;
    const person = byEmail.get(key);
    /* HELD BY A ROW THIS RUN CANNOT SEE: nobody is met under it. */
    if (person === null) continue;
    const domain = registrable(address);
    const org = domain === null ? null : byDomain.get(domain) ?? null;
    const meetOrg = () => {
      if (domain !== null && !byDomain.has(domain) && !orgNow.has(domain)) {
        ctx.write('organisations', { name: orgName(domain), domain, tags: ['gmail'] });
        orgNow.add(domain);
        orgsMet++;
      }
    };
    if (person === undefined) {
      const touched = ofUse(key);
      if (touched === null) {
        skipped++;
        continue;
      }
      /* MET NOW, LINKED NEXT HOUR: a row written in this run has no id to point at until it is kept, so the mail waits. */
      if (!metNow.has(key)) {
        const name = (nameIn(f.name) ?? address.split('@')[0]).slice(0, 120);
        ctx.write('people', {
          name,
          email: address,
          ...(touched ? { in_touch: touched } : {}),
          ...(org ? { org: org.id } : {}),
          met: [`${today} · Gmail, a mail thread you both wrote in`],
          tags: ['gmail'],
        });
        metNow.add(key);
        met++;
        meetOrg();
      }
      waits.add(row.id);
      waiting++;
      continue;
    }
    meetOrg();
    const pp = owed.get(person.id) ?? {};
    const was = pp.in_touch ?? (typeof person.fields.in_touch === 'string' ? person.fields.in_touch : '');
    if (day !== null && day > was) pp.in_touch = day;
    if (org && (person.fields.org === null || person.fields.org === undefined || person.fields.org === '')) pp.org = org.id;
    owed.set(person.id, pp);
    patch.who = person.id;
    linked++;
  }

  /* ── WHAT IS ASKED ───────────────────────────────────────────────────── */
  /** Whether a received mail wants a reply from you, by the rule at the top. */
  const wantsReply = (row) => {
    const f = row.fields;
    if (f.direction === 'sent' || f.person !== true || f.needs_reply !== true || f.answered === true) return false;
    const address = lower(f.address);
    if (isOrganisationAddress(address) || isMe(emailKey(address), nameIn(f.name))) return false;
    if (f.hint === 'event' || f.hint === 'list') return false;
    if (isInvite(f.subject, f.snippet, address) || looksLikeNewsletter(`${f.subject ?? ''} ${f.snippet ?? ''}`, address)) return false;
    const kind = kinds.get(row.id) ?? f.kind;
    if (kind === 'bill' || kind === 'receipt') return false;
    return asksSomething(f.subject, f.snippet);
  };
  /** Whether you wrote in a thread after a mail came in. */
  const answeredAfter = (rows, row) => rows.some((r) => r.fields.direction === 'sent' && atOf(r.fields) > atOf(row.fields));
  /** The question a thread already holds open from an earlier look: its row, while nobody replied or answered it. */
  const openIn = (rows) =>
    rows.find((r) => !fresh.has(r.id) && r.fields.wants === true && r.fields.answered !== true && r.fields.needs_reply === true && !answeredAfter(rows, r)) ?? null;

  const asks = new Map();
  const set = (row, ask, more = {}) => Object.assign(patches.get(row.id), { ask, ...more });

  /* REPLIES, A THREAD AT A TIME: the newest mail that asks, unanswered, carries the question, and the rest join it. */
  const looked = new Set();
  for (const row of mail) {
    const rows = threadOf(row);
    const key = typeof row.fields.thread === 'string' ? row.fields.thread : row.id;
    if (looked.has(key)) continue;
    looked.add(key);
    const askers = rows.filter((r) => fresh.has(r.id) && !waits.has(r.id) && wantsReply(r) && !answeredAfter(rows, r));
    if (askers.length === 0) continue;
    const open = openIn(rows);
    const carrier = open === null ? askers[askers.length - 1] : null;
    for (const r of askers) {
      if (r === carrier) {
        set(r, 'reply', { wants: true });
        asks.set(r.id, 'reply');
      } else set(r, 'joined', { wants: false });
    }
  }

  /* BILLS AND RECEIPTS, ONE AN ORDER: the same number, or the same amount within days from one sender or a payer. */
  const purchases = [...money];
  for (const row of mail) {
    const kind = kinds.get(row.id);
    if ((kind !== 'bill' && kind !== 'receipt') || waits.has(row.id)) continue;
    const f = row.fields;
    const text = `${f.subject ?? ''} ${f.snippet ?? ''}`;
    const amount = amountOf(text);
    const ref = refOf(text);
    const patch = patches.get(row.id);
    if (amount) patch.amount = amount.said;
    if (ref) patch.ref = ref;
    const domain = registrable(f.address) ?? lower(f.address).split('@')[1] ?? '';
    const day = dayOf(f);
    const same = purchases.find((p) => {
      const pf = { ...p.fields, ...(patches.get(p.id) ?? {}) };
      const words = `${pf.subject ?? ''} ${pf.snippet ?? ''}`;
      const other = registrable(pf.address) ?? lower(pf.address).split('@')[1] ?? '';
      /* ONE SELLER, OR A PAYER TAKING THE MONEY FOR IT: a short number two shops both use is two orders. */
      const linked = other === domain || PAYERS.test(domain) || PAYERS.test(other);
      if (ref !== null && (typeof pf.ref === 'string' ? pf.ref.toUpperCase() : refOf(words)) === ref && (linked || ref.length >= 8)) return true;
      const theirs = typeof pf.amount === 'string' ? amountOf(pf.amount) : amountOf(words);
      return Boolean(amount && theirs && theirs.key === amount.key && daysApart(dayOf(pf), day) <= SAME_ORDER_DAYS && linked);
    });
    purchases.push(row);
    if (same !== undefined) {
      set(row, 'joined');
      continue;
    }
    const who = nameIn(f.name) ?? (registrable(f.address) ? orgName(registrable(f.address)) : lower(f.address));
    const word = kind === 'bill' ? 'bill' : 'receipt';
    set(row, kind, { says: amount ? `${amount.said} ${word} from ${who}` : `A ${word} from ${who}` });
    asks.set(row.id, kind);
  }

  /* DATES, ONE A THREAD, from a person, and never one a reply question already covers. */
  for (const row of mail) {
    if (kinds.get(row.id) !== 'date' || waits.has(row.id) || 'ask' in patches.get(row.id) || row.fields.person !== true || row.fields.hint === 'event') continue;
    if (isOrganisationAddress(row.fields.address) || isMe(emailKey(row.fields.address), nameIn(row.fields.name))) continue;
    const rows = threadOf(row);
    const asked = (r) => patches.get(r.id)?.ask ?? r.fields.ask;
    const taken = rows.some((r) => r.id !== row.id && ['date', 'reply', 'held', 'many'].includes(asked(r)));
    if (taken) set(row, 'joined');
    else {
      set(row, 'date');
      asks.set(row.id, 'date');
    }
  }

  /* MANY AT ONCE ARE ASKED AS ONE: the first look, or more than FLOOD in an hour. The newest carries the question. */
  let grouped = 0;
  if (asks.size > FLOOD || (first && asks.size > 1)) {
    const ids = [...asks.keys()];
    const newest = mail.filter((r) => asks.has(r.id)).pop();
    const batch = `many:${newest.fields.message ?? newest.id}`;
    for (const id of ids) Object.assign(patches.get(id), { ask: 'held', batch });
    Object.assign(patches.get(newest.id), { ask: 'many', batch, says: manySaid([...asks.values()]) });
    grouped = ids.length;
  }

  /* ── WRITTEN ─────────────────────────────────────────────────────────── */
  for (const row of mail) {
    const patch = patches.get(row.id);
    /* A MAIL WHOSE PERSON WAS MET NOW IS LOOKED AT AGAIN NEXT HOUR, linked then, and what it asks is decided then. */
    if (waits.has(row.id)) {
      if (Object.keys(patch).length > 0) ctx.update(spoken('gmail_mail', row), patch);
      continue;
    }
    ctx.update(spoken('gmail_mail', row), { ask: 'none', ...patch, met: true });
  }
  for (const p of people) {
    const pp = owed.get(p.id);
    if (pp && Object.keys(pp).length > 0) ctx.update(spoken('people', p), pp);
  }

  const said = asks.size === 0 ? 'asked nothing' : grouped > 0 ? `asked about ${grouped} mails as one question` : `asked about ${asks.size} ${asks.size === 1 ? 'mail' : 'mails'}`;
  ctx.log(
    `Looked at ${mail.length} mails: met ${met} people and ${orgsMet} organisations, linked ${linked} mails, left out ${skipped} not of use, ${said}${waiting > 0 ? `, ${waiting} wait for their person to be kept` : ''}${left > 0 ? `, left ${left}` : ''}.`,
  );
  return { looked: mail.length, met, orgs: orgsMet, linked, skipped, asked: asks.size, grouped };
}

/**
 * Who you are in touch with, from the mail your Gmail sends in. Runs every hour and reads only this BrainDog.
 *
 * WHAT IT READS. The mails the Gmail door wrote into Mail since it last looked, and your People and Organisations.
 *
 * WHAT IT WRITES. For a mail from a person (not a newsletter, a no-reply address or a notification), and for one you
 * sent: the person is met in People by their address if they are new, and their Last in touch moves to the mail's day
 * when that is later. Their organisation is met by the address's domain, unless it is a mail service anybody can sign
 * up to (gmail.com, outlook.com and the like), and a person with no organisation yet is put with it. The mail is then
 * linked to the person and marked as met, so it is looked at once. A mail's day is set in your own clock.
 *
 * WHAT A MAIL LOOKS LIKE IS SAID HERE, ONCE, when it is first looked at (1.1.0), and the script in Google only hints.
 * A bill needs "invoice" in its subject, or bill words with an amount in a currency or a sender known to send bills
 * (a biller's domain, or an address such as billing@). A receipt needs receipt or order words with the same. A
 * newsletter (the script says `list`, or the sender or words say so) is never a bill, a receipt or a date. Gmail
 * updating a mail later never changes it, and "Not a bill" in Needs you clears it.
 *
 * AN HOUR WITH NO NEW MAIL READS ONE PAGE AND WRITES NOTHING (1.1.1). 1.1.0 asked its list for a `limit`, which a
 * script's list does not take, so every run was refused before it read a row, an empty Mail list included.
 *
 * IT NEVER TOUCHES GMAIL, and it never answers, files or deletes a mail. What needs a reply, a bill, a receipt or a date
 * is asked about in Needs you by the add-on's rules, and only you act on it.
 */

/*
 * WHO SOMEBODY IS, READ AS THE RECORD READS IT (1.1.1), from `packages/kernel/src/identity-keys.ts`: an address is one
 * person by its key (lower case, and Gmail's dots and +tags folded), and a domain is one organisation by the domain it
 * registered (`mail.marlow.co.uk` is `marlow.co.uk`). People refuses a second row under a key one already holds, and a
 * refused write is the whole run refused, so 1.1.0, matching addresses as written, would have stopped on the first
 * `Ada.Lovelace@gmail.com` beside an `ada.lovelace@gmail.com`, or the first `mail.` subdomain of a known organisation.
 * The lists are the kernel's own, copied, because a script imports nothing.
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

const BILLERS = /(^|\.)(stripe\.com|paypal\.com|paddle\.com|apple\.com|google\.com|microsoft\.com|amazon\.[a-z.]+|aws\.amazon\.com|adobe\.com|netflix\.com|spotify\.com|uber\.com|airbnb\.com|github\.com|vercel\.com|cloudflare\.com|digitalocean\.com|heroku\.com|godaddy\.com|namecheap\.com|squarespace\.com|shopify\.com|wix\.com|notion\.so|figma\.com|slack\.com|zoom\.us|dropbox\.com|atlassian\.com|openai\.com|anthropic\.com|xero\.com|intuit\.com|quickbooks\.com|freshbooks\.com|waveapps\.com|chargebee\.com|recurly\.com|gocardless\.com|wise\.com|revolut\.com|vodafone\.[a-z.]+|etisalat\.[a-z.]+|orange\.[a-z.]+)$/i;
const BILLING_SENDER = /^(billing|invoices?|receipts?|payments?|accounts?|statements?|orders?)[@+.-]/i;
const AMOUNT = /([$€£¥₹]\s?\d[\d,]*(\.\d{1,2})?|\b(usd|eur|gbp|egp|aed|sar|cad|aud|inr|jpy|chf)\s?\d[\d,]*(\.\d{1,2})?|\d[\d,]*(\.\d{1,2})?\s?(usd|eur|gbp|egp|aed|sar|cad|aud|inr|jpy|chf)\b)/i;

/** Whether a mail reads as a newsletter by its sender or its words, for a script that does not say `list`. */
export function looksLikeNewsletter(text, address) {
  return /^(news|newsletters?|marketing|promo(tions)?|offers|deals|digest|weekly|editor|community)[@+.-]/i.test(String(address ?? '')) ||
    /\b(newsletter|unsubscribe|weekly digest|this week in|% off|flash sale|webinar)\b/i.test(String(text ?? ''));
}

/** What a received mail looks like: `bill`, `receipt`, `date` or `none`. `hint` is what the script in Google sent. */
export function kindOf(subject, snippet, address, hint) {
  const s = String(subject ?? '');
  const n = String(snippet ?? '');
  const text = `${s} ${n}`;
  const from = String(address ?? '').toLowerCase();
  if (hint === 'list' || looksLikeNewsletter(text, from)) return 'none';
  const known = BILLERS.test(from.split('@')[1] ?? '') || BILLING_SENDER.test(from);
  const amount = AMOUNT.test(text);
  if (/\binvoice\b/i.test(s) || (/\binvoice\b/i.test(n) && (amount || known))) return 'bill';
  if (/\b(amount due|payment due|due date|pay by|your bill|bill is ready|new bill|statement is ready|renewal notice|payment failed)\b/i.test(text) && (amount || known)) return 'bill';
  if (/\b(receipt|order confirm\w*|your order|order (no|number|#)|payment received|thanks for your (order|purchase|payment)|we received your payment)\b/i.test(text) && (amount || known)) return 'receipt';
  if (/\b(invitation|invite|meeting|appointment|booking|reservation|interview|deadline|rsvp)\b/i.test(text)) return 'date';
  return 'none';
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

const spoken = (list, row) => `${list}#${row.seq}`;
const lower = (v) => (typeof v === 'string' ? v.trim().toLowerCase() : '');

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

export default async function run(ctx) {
  const tz = ctx.tz || 'UTC';
  const mail = await every(ctx, 'gmail_mail', { none: [{ field: 'met', is: true }] }, MOST);
  /* NO MAIL YET IS NOTHING TO DO, and says nothing, so an hour with no mail leaves no line. */
  if (mail.length === 0) return { looked: 0 };

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
  const byEmail = holders(people, (p) => [emailKey(p.fields.email), ...keysIn(p.fields, 'email', emailKey)].filter((k) => k !== null));
  const byDomain = holders(orgs, (o) => [registrable(o.fields.domain), ...keysIn(o.fields, 'domain', registrable)].filter((k) => k !== null));

  const metNow = new Set();
  const orgNow = new Set();
  /* ONE UPDATE A PERSON A RUN, however many of their mails came in, so no update is refused for a version it already moved.
     AND EVERY UPDATE IS LAST WRITER WINS (1.1.1): each one sets only the fields this script owns (day, kind, who, met,
     Last in touch, organisation), and one refused for a version the door or a person moved meanwhile took the whole
     run with it. */
  const owed = new Map();
  let met = 0;
  let orgsMet = 0;
  let linked = 0;
  let waiting = 0;

  for (const row of mail) {
    const f = row.fields;
    const patch = {};
    /* THE DAY IN YOUR CLOCK, OR THE DAY GMAIL SENT when this host cannot say one (a sandbox with no zones), so Last in
       touch still moves. 1.1.0 moved nothing where the zone could not be read. */
    const mended = dayIn(f.at, tz);
    if (mended !== null && mended !== f.day) patch.day = mended;
    const day = mended ?? (typeof f.day === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(f.day) ? f.day : null);
    const kind = f.direction === 'sent' ? 'none' : kindOf(f.subject, f.snippet, f.address, f.hint ?? f.kind);
    if (kind !== (f.kind ?? 'none')) patch.kind = kind;
    const address = lower(f.address);
    const key = emailKey(address);
    const counts = (f.person === true || f.direction === 'sent') && key !== null && address.length <= 254 && !/@users\.noreply\.git(hub|lab)\.com$/u.test(address);
    if (!counts) {
      ctx.update(spoken('gmail_mail', row), { ...patch, met: true });
      continue;
    }
    const domain = registrable(address);
    const org = domain === null ? null : byDomain.get(domain) ?? null;
    if (domain !== null && !byDomain.has(domain) && !orgNow.has(domain)) {
      ctx.write('organisations', { name: orgName(domain), domain, tags: ['gmail'] });
      orgNow.add(domain);
      orgsMet++;
    }
    const person = byEmail.get(key);
    if (person === null) {
      /* HELD BY A ROW THIS RUN CANNOT SEE: nobody is met under it, and the mail is looked at once. */
      ctx.update(spoken('gmail_mail', row), { ...patch, met: true });
      continue;
    }
    if (person === undefined) {
      /* MET NOW, LINKED NEXT HOUR: a row written in this run has no id to point at until it is kept. */
      if (!metNow.has(key)) {
        const name = (typeof f.name === 'string' && f.name.trim() !== '' && !f.name.includes('@') ? f.name.trim() : address).slice(0, 120);
        ctx.write('people', { name, email: address, ...(day ? { in_touch: day } : {}), ...(org ? { org: org.id } : {}), tags: ['gmail'] });
        metNow.add(key);
        met++;
      }
      if (Object.keys(patch).length > 0) ctx.update(spoken('gmail_mail', row), patch);
      waiting++;
      continue;
    }
    const pp = owed.get(person.id) ?? {};
    const was = pp.in_touch ?? (typeof person.fields.in_touch === 'string' ? person.fields.in_touch : '');
    if (day !== null && day > was) pp.in_touch = day;
    if (org && (person.fields.org === null || person.fields.org === undefined || person.fields.org === '')) pp.org = org.id;
    owed.set(person.id, pp);
    ctx.update(spoken('gmail_mail', row), { ...patch, who: person.id, met: true });
    linked++;
  }

  for (const p of people) {
    const pp = owed.get(p.id);
    if (pp && Object.keys(pp).length > 0) ctx.update(spoken('people', p), pp);
  }

  ctx.log(`Looked at ${mail.length} mails: met ${met} people and ${orgsMet} organisations, linked ${linked} mails${waiting > 0 ? `, ${waiting} wait for their person to be kept` : ''}.`);
  return { looked: mail.length, met, orgs: orgsMet, linked };
}

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
 * IT NEVER TOUCHES GMAIL, and it never answers, files or deletes a mail. What needs a reply, a bill, a receipt or a date
 * is asked about in Needs you by the add-on's rules, and only you act on it.
 */

const FREE_MAIL = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'yahoo.com', 'ymail.com',
  'icloud.com', 'me.com', 'mac.com', 'aol.com', 'proton.me', 'protonmail.com', 'pm.me', 'gmx.com', 'gmx.net',
  'mail.com', 'zoho.com', 'yandex.com', 'hey.com', 'fastmail.com',
]);
/* AT MOST THIS MANY MAILS A RUN, so a first hour after a long gap is spread over the next ones. */
const MOST = 200;

async function every(ctx, list, where) {
  const out = [];
  let from = 1;
  for (;;) {
    const clause = { field: 'seq', gte: from };
    const page = await ctx.record.list(list, where ? { all: [where, clause] } : clause, { order: 'seq' });
    out.push(...page);
    if (page.length < 50 || out.length >= 5000) return out;
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
  const mail = (await ctx.record.list('gmail_mail', { none: [{ field: 'met', is: true }] }, { order: 'seq', limit: MOST })).slice(0, MOST);
  if (mail.length === 0) return { looked: 0 };

  const people = await every(ctx, 'people');
  const orgs = await every(ctx, 'organisations');
  const byEmail = new Map();
  for (const p of people) if (p.fields.merged_into == null && lower(p.fields.email) !== '') byEmail.set(lower(p.fields.email), p);
  const byDomain = new Map();
  for (const o of orgs) if (o.fields.merged_into == null && lower(o.fields.domain) !== '') byDomain.set(lower(o.fields.domain), o);

  const metNow = new Set();
  const orgNow = new Set();
  /* ONE UPDATE A PERSON A RUN, however many of their mails came in, so no update is refused for a version it already moved. */
  const owed = new Map();
  let met = 0;
  let orgsMet = 0;
  let linked = 0;
  let waiting = 0;

  for (const row of mail) {
    const f = row.fields;
    const patch = {};
    const day = dayIn(f.at, tz);
    if (day !== null && day !== f.day) patch.day = day;
    const address = lower(f.address);
    const counts = (f.person === true || f.direction === 'sent') && address.includes('@');
    if (!counts) {
      ctx.update(spoken('gmail_mail', row), { ...patch, met: true }, row.version);
      continue;
    }
    const domain = address.split('@')[1] ?? '';
    const org = FREE_MAIL.has(domain) ? null : byDomain.get(domain) ?? null;
    if (!FREE_MAIL.has(domain) && org === null && domain !== '' && !orgNow.has(domain)) {
      ctx.write('organisations', { name: orgName(domain), domain, tags: ['gmail'] });
      orgNow.add(domain);
      orgsMet++;
    }
    const person = byEmail.get(address);
    if (!person) {
      /* MET NOW, LINKED NEXT HOUR: a row written in this run has no id to point at until it is kept. */
      if (!metNow.has(address)) {
        const name = typeof f.name === 'string' && f.name.trim() !== '' && !f.name.includes('@') ? f.name.trim() : address;
        ctx.write('people', { name, email: address, ...(day ? { in_touch: day } : {}), ...(org ? { org: org.id } : {}), tags: ['gmail'] });
        metNow.add(address);
        met++;
      }
      if (Object.keys(patch).length > 0) ctx.update(spoken('gmail_mail', row), patch, row.version);
      waiting++;
      continue;
    }
    const pp = owed.get(person.id) ?? {};
    const was = pp.in_touch ?? (typeof person.fields.in_touch === 'string' ? person.fields.in_touch : '');
    if (day !== null && day > was) pp.in_touch = day;
    if (org && (person.fields.org === null || person.fields.org === undefined || person.fields.org === '')) pp.org = org.id;
    owed.set(person.id, pp);
    ctx.update(spoken('gmail_mail', row), { ...patch, who: person.id, met: true }, row.version);
    linked++;
  }

  for (const p of people) {
    const pp = owed.get(p.id);
    if (pp && Object.keys(pp).length > 0) ctx.update(spoken('people', p), pp, p.version);
  }

  ctx.log(`Looked at ${mail.length} mails: met ${met} people and ${orgsMet} organisations, linked ${linked} mails${waiting > 0 ? `, ${waiting} wait for their person to be kept` : ''}.`);
  return { looked: mail.length, met, orgs: orgsMet, linked };
}

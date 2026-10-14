/**
 * The drill's first five steps: a stranger's sign-up, over HTTP, against any host (LCH-A03 job 1,
 * `loop/scope/area-launch-a.md:365-418`; "a test sign-up passed", H.572).
 *
 * EACH STEP IS A NAMED RESULT WITH THE WORDS SEEN, `{ name, pass, said }`, and a step that cannot run says why and
 * `skipped: true`, so a red is always one thing that went wrong and never a step that had nothing to do. A step that
 * needs what an earlier one made (the letter, the session) skips when it is not there, which is how a broken sender
 * turns `mail` red by itself and leaves the rest saying they had no letter to open.
 *
 * NOTHING A STEP SAYS HOLDS A VALUE. Not the address it signed up with, the invite code, the mailed link, the session
 * cookie or an agent token: every sentence passes `hide`, which takes out each of them and any address at all.
 *
 * THE MAIL PORT is how the letter is read: in tests the Cloud harness's captured letters (`capturedMail`); on a live host
 * the canary's Inbox, read with an agent key the environment names (`inboxMail`); with neither, `noMail`, and `mail`
 * says "skipped: no inbox key".
 *
 * NOT A BROWSER. The scope's drill drives the proof area's browser; this one asks the same doors the sign-up page asks
 * (`apps/web/src/lib/signup.ts`), in the same order, so it is green on the harness before it ever meets a page.
 */

import { randomBytes } from 'node:crypto';

/** The note a drill's invite code carries, so the sweep finds the drill's own records and nothing else. */
export const NOTE = 'drill';

/** The sentence a drill signs up with: an invented stranger's, and nothing of anybody's. */
export const SENTENCE = 'I run a small ceramics workshop and lose track of kiln bookings. Answer: the firing schedule.';

/** How long the letter may take to arrive, the scope's sixty seconds. */
export const MAIL_MOST_MS = 60_000;

/** Placeholders a page should never print: `{{x}}`, `}}`, or a single-brace name such as `{name}`. */
const BRACES = /\{\{|\}\}|\{[A-Za-z_][\w.]*\}/u;

/** Any address at all, taken out of a sentence. */
const ADDRESS = /[^\s@"'<>()]+@[^\s@"'<>()]+\.[a-z]{2,}/giu;

/** A new drill: what it asks with, how it reads mail, and the state each step leaves for the next. */
export function drill({
  host,
  publicHost = new URL(host).hostname,
  address = null,
  slug = `drill-${Date.now().toString(36)}-${randomBytes(2).toString('hex')}`,
  said = SENTENCE,
  code = null,
  mail = noMail('no inbox key'),
  sender = null,
  support = null,
  ip = null,
  waitMs = MAIL_MOST_MS,
  quietMs = 5_000,
  send = fetch,
} = {}) {
  if (!host) throw new Error('A drill needs a host to ask.');
  return { host: new URL(host).origin, publicHost, address, slug, said, code, mail, sender, support, ip, waitMs, quietMs, send, mode: null, mark: null, asked: false, link: null, cookie: null, made: null, bearer: null, strikes: 0, secrets: [] };
}

/** `text` with every value of the drill's taken out, and any address. */
export function hide(d, text) {
  let out = String(text ?? '');
  for (const v of [d.address, d.code, d.cookie, d.bearer, d.link?.token, d.link?.href, ...d.secrets]) if (typeof v === 'string' && v.length >= 4) out = out.split(v).join('…');
  return out.replace(ADDRESS, 'an address').replace(/#(verify|magic|code|claim)=[^\s"'&]+/gu, '#$1=…').replace(/Bearer\s+\S+/gu, 'Bearer …');
}

export const ok = (d, name, said) => ({ name, pass: true, said: hide(d, said) });
export const red = (d, name, said) => ({ name, pass: false, said: hide(d, said) });
export const skip = (d, name, why) => ({ name, pass: true, skipped: true, said: hide(d, `skipped: ${why}`) });

/** A refusal's own sentence, or the status, for a line. */
export const fixOf = (a) => a?.said?.refusal?.fix ?? (a?.status === 429 ? `429, try again in ${a?.said?.retryAfter ?? 'a while'} seconds` : `it answered ${a?.status ?? 'nothing'}`);

/**
 * One request to the host: `{ status, said, cookie, type, text }`. A POST says it came from the host's own origin, as the
 * page's would. `cookie` is the session the answer set, if any. A host that did not answer is status 0, never the error's
 * own text, which could quote the request.
 */
export async function ask(d, path, { method = 'POST', body, cookie = d.cookie, bearer = null, headers = {}, raw = null, type = 'application/json' } = {}) {
  const h = { accept: 'application/json', ...headers };
  if (method !== 'GET') Object.assign(h, { origin: d.host, 'content-type': type });
  if (cookie) h.cookie = cookie;
  if (bearer) h.authorization = `Bearer ${bearer}`;
  if (d.ip) h['cf-connecting-ip'] = d.ip;
  try {
    const res = await d.send(`${d.host}${path}`, { method, headers: h, body: method === 'GET' ? undefined : (raw ?? JSON.stringify(body ?? {})), redirect: 'manual', signal: AbortSignal.timeout(120_000) });
    const set = (typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : []).map((c) => c.split(';')[0]).find((c) => /^(__Host-)?bd_s=./u.test(c));
    const text = await res.text();
    let said = null;
    try {
      said = JSON.parse(text);
    } catch {
      said = null;
    }
    return { status: res.status, said, cookie: set ?? null, type: res.headers.get('content-type') ?? '', text };
  } catch {
    return { status: 0, said: { ok: false, refusal: { fix: `the host did not answer ${path}` } }, cookie: null, type: '', text: '' };
  }
}

/** A record's method, as the app calls it: `/app/<slug>/api/<method>`. */
export const api = (d, method, body = {}, opts = {}) => ask(d, `/app/${d.made?.slug ?? d.slug}/api/${method}`, { body, ...opts });

/* ---- The mail port: `{ kind, mark(), next(mark, { to, ms }) }`, a letter being `{ from, subject, text, html }`. ---- */

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/** No way to read mail: every step that waits on a letter says `why`. */
export const noMail = (why) => ({ kind: 'none', why, mark: async () => null, next: async () => null });

/**
 * The letters a Cloud harness captured (`startCloud().letters`, the `EMAIL` binding's `send` kept). `mark` is how many
 * there were; `next` the first one after it to `to`, waited for up to `ms`.
 */
export function capturedMail(letters, { every = 10 } = {}) {
  const shape = (l) => ({ from: String(l?.from?.email ?? l?.from ?? ''), to: String(l?.to ?? ''), subject: String(l?.subject ?? ''), text: String(l?.text ?? ''), html: String(l?.html ?? '') });
  return {
    kind: 'captured',
    mark: async () => letters.length,
    next: async (mark, { to = null, ms = MAIL_MOST_MS } = {}) => {
      const until = Date.now() + ms;
      for (;;) {
        const found = letters.slice(mark ?? 0).map(shape).find((l) => to === null || l.to.toLowerCase() === to.toLowerCase());
        if (found) return found;
        if (Date.now() >= until) return null;
        await pause(every);
      }
    },
  };
}

/**
 * The canary's Inbox, read with an agent key (`inbox`, as any agent reads it). A letter to the canary's mail door is a
 * row there; the one after `mark` whose words hold a BrainDog link is the drill's. `to` is not asked: every letter at
 * the door is to the door.
 */
export function inboxMail({ origin, slug, key, send = fetch, every = 3_000 }) {
  const read = async () => {
    const out = [];
    for (const state of ['untriaged', 'review']) {
      const res = await send(`${new URL(origin).origin}/app/${slug}/api/inbox`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: JSON.stringify({ state, limit: 50 }),
        redirect: 'error',
        signal: AbortSignal.timeout(60_000),
      }).catch(() => null);
      const said = res ? await res.json().catch(() => null) : null;
      if (said?.ok === true) out.push(...(said.value?.arrivals ?? []));
    }
    return out;
  };
  const shape = (a) => {
    let j = null;
    try {
      j = JSON.parse(String(a?.body ?? ''));
    } catch {
      j = null;
    }
    const text = String(j?.text ?? a?.text ?? a?.body ?? '');
    return { from: String(j?.from?.email ?? j?.from ?? a?.from ?? a?.sender ?? ''), to: '', subject: String(j?.subject ?? a?.subject ?? a?.title ?? ''), text, html: String(j?.html ?? '') };
  };
  return {
    kind: 'inbox',
    mark: async () => new Set((await read()).map((a) => a.id)),
    next: async (mark, { ms = MAIL_MOST_MS } = {}) => {
      const until = Date.now() + ms;
      for (;;) {
        const found = (await read()).filter((a) => !mark?.has(a.id)).map(shape).find((l) => /\/app\/sign(up|in)#(verify|magic)=/u.test(`${l.text} ${l.html}`));
        if (found) return found;
        if (Date.now() >= until) return null;
        await pause(every);
      }
    },
  };
}

/** The BrainDog link a letter carries, `#verify=` or `#magic=`: `{ href, host, kind, token }`, or null. */
export function linkIn(letter, kind = 'verify') {
  const hrefs = [...String(letter?.html ?? '').matchAll(/\shref="([^"]*)"/gu)].map((m) => (m[1] ?? '').replace(/&#39;/gu, "'").replace(/&amp;/gu, '&'));
  const all = [...hrefs, ...(String(letter?.text ?? '').match(/https?:\/\/\S+/gu) ?? [])];
  const href = all.find((h) => h.includes(`#${kind}=`));
  if (!href) return null;
  const token = new RegExp(`#${kind}=([^\\s&]+)`, 'u').exec(href)?.[1] ?? '';
  let host = '';
  try {
    host = new URL(href).hostname;
  } catch {
    host = '';
  }
  return token === '' ? null : { href, host, kind, token };
}

/** Every string an answer holds, for the braces check: the words a page draws, never the JSON around them. */
const wordsOf = (v, out = []) => {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) for (const x of v) wordsOf(x, out);
  else if (v && typeof v === 'object') for (const x of Object.values(v)) wordsOf(x, out);
  return out;
};

/** The first placeholder any of `answers` prints, or null. */
export const bracesIn = (...answers) => wordsOf(answers).find((s) => BRACES.test(s)) ?? null;

/* ---- The steps. ---- */

/** `shut`: on a host that signs up by invitation, a start with no code is refused at the code and mails nothing. */
export async function shut(d) {
  const named = await ask(d, `/auth/signup/name?slug=${encodeURIComponent(d.slug)}`, { method: 'GET', cookie: null });
  d.mode = named.said?.value?.mode ?? null;
  if (d.mode === 'open') return skip(d, 'shut', 'sign-up here is open to anybody, so there is no shut door to try.');
  if (d.mode === 'closed') return ok(d, 'shut', 'sign-up here is closed, so every start is refused.');
  if (d.mode !== 'invite') return red(d, 'shut', `the host did not say who may sign up: ${fixOf(named)}.`);
  if (!d.address) return skip(d, 'shut', 'no mail door is named to sign up with.');
  const mark = await d.mail.mark();
  const none = await ask(d, '/auth/signup/start', { body: { email: d.address, slug: d.slug }, cookie: null });
  if (none.status !== 403 || none.said?.refusal?.at !== 'code') return red(d, 'shut', `a start with no code answered ${none.status}, where it must be refused at the code: ${fixOf(none)}.`);
  if (d.mail.kind === 'captured' && (await d.mail.next(mark, { to: d.address, ms: 50 })) !== null) return red(d, 'shut', 'a start with no code was refused, and a letter went out anyway.');
  return ok(d, 'shut', `a start with no code was refused: “${fixOf(none)}”`);
}

/** `signup`: a start with the invite code (by invitation) and the drill's sentence, answered as every address is. */
export async function signup(d) {
  if (!d.address) return skip(d, 'signup', 'no mail door is named to sign up with.');
  if (d.mode === null) {
    const named = await ask(d, `/auth/signup/name?slug=${encodeURIComponent(d.slug)}`, { method: 'GET', cookie: null });
    d.mode = named.said?.value?.mode ?? null;
  }
  if (d.mode === 'closed') return red(d, 'signup', 'sign-up here is closed, so no stranger can make a record.');
  if (d.mode === 'invite' && !d.code) return skip(d, 'signup', 'sign-up here is by invitation and no invite code is named.');
  d.mark = await d.mail.mark();
  const body = { email: d.address, slug: d.slug, tz: 'UTC', said: d.said, ...(d.mode === 'invite' ? { code: d.code } : {}) };
  const out = await ask(d, '/auth/signup/start', { body, cookie: null });
  if (out.status !== 200 || out.said?.ok !== true) return red(d, 'signup', `the start answered ${out.status}: ${fixOf(out)}.`);
  d.asked = true;
  return ok(d, 'signup', `asked for a record${d.mode === 'invite' ? ' with an invite code' : ''} and a sentence of ${d.said.length} characters; the host answered as it answers every address.`);
}

/** `mail`: the letter arrives in time, from the host's sender, its link on the public host, its footer naming support. */
export async function mail(d) {
  if (d.mail.kind === 'none') return skip(d, 'mail', d.mail.why);
  if (!d.asked) return skip(d, 'mail', 'nothing was asked to be mailed.');
  const t0 = Date.now();
  const letter = await d.mail.next(d.mark, { to: d.address, ms: d.waitMs });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  if (letter === null) return red(d, 'mail', `no letter came within ${Math.round(d.waitMs / 1000)} seconds.`);
  const link = linkIn(letter, 'verify');
  if (link === null) return red(d, 'mail', `the letter “${letter.subject}” came in ${secs} seconds and holds no link to finish signing up.`);
  d.link = link;
  const wrong = [];
  if (link.host !== d.publicHost) wrong.push('its link is not on the public host');
  if (d.sender && letter.from.toLowerCase() !== d.sender.toLowerCase()) wrong.push('it is not from the host’s own sender');
  if (d.support && !`${letter.text} ${letter.html}`.includes(d.support)) wrong.push('its footer does not name the support address');
  if (wrong.length) return red(d, 'mail', `the letter “${letter.subject}” came in ${secs} seconds, but ${wrong.join(', and ')}.`);
  return ok(d, 'mail', `the letter “${letter.subject}” came in ${secs} seconds${d.sender ? ', from the host’s own sender' : ''}, its link on the public host${d.support ? ', its footer naming the support address' : ''}.`);
}

/**
 * `verify-build`: the link spent signs the stranger in, a Free record is made and opened, it is on Free, its Home
 * answers, and no page prints braces.
 */
export async function verifyBuild(d) {
  if (!d.link) return skip(d, 'verify-build', 'there is no letter to open.');
  const v = await ask(d, '/auth/signup/verify', { body: { token: d.link.token }, cookie: null });
  if (v.status !== 200 || v.said?.ok !== true || !v.cookie) return red(d, 'verify-build', `the link signed nobody in: ${fixOf(v)}.`);
  d.cookie = v.cookie;
  const made = await ask(d, '/account/billing/checkout', { body: { slug: v.said.value?.slug ?? d.slug, plan: 'free', tz: 'UTC' } });
  if (made.said?.ok !== true || typeof made.said.value?.slug !== 'string') return red(d, 'verify-build', `no Free record was made: ${fixOf(made)}.`);
  d.made = { slug: made.said.value.slug, at: Date.now() };
  const opened = await ask(d, '/auth/switch', { body: { slug: d.made.slug } });
  if (opened.said?.ok !== true) return red(d, 'verify-build', `the new record would not open: ${fixOf(opened)}.`);
  if (opened.cookie) d.cookie = opened.cookie;
  const billing = await ask(d, '/account/billing', { method: 'GET' });
  const mine = (billing.said?.value?.records ?? []).find((r) => r?.slug === d.made.slug);
  if (mine?.plan !== 'free') return red(d, 'verify-build', `the new record is not on Free: it reads ${mine?.plan ?? 'no plan'}.`);
  const boot = await api(d, 'boot');
  if (boot.said?.ok !== true) return red(d, 'verify-build', `the record's Home did not answer: ${fixOf(boot)}.`);
  const pages = await api(d, 'pages');
  if (pages.said?.ok !== true || !Array.isArray(pages.said.value)) return red(d, 'verify-build', `the record's pages did not answer: ${fixOf(pages)}.`);
  const census = await api(d, 'pagesCensus');
  const unresolved = census.said?.ok === true ? Number(census.said.value?.totals?.unresolved ?? 0) : null;
  const home = pages.said.value.find((p) => p?.slug === 'home');
  const homePage = home ? await api(d, 'page', { slug: 'home' }) : null;
  if (homePage && homePage.said?.ok !== true) return red(d, 'verify-build', `the record's Home page did not answer: ${fixOf(homePage)}.`);
  /* THE SHELL, WHERE THE HOST SERVES ONE: its words, outside its scripts and styles. A host that serves only its API says so. */
  const shell = await ask(d, `/app/${d.made.slug}/`, { method: 'GET' });
  const shellWords = shell.type.includes('text/html') ? shell.text.replace(/<(script|style)[\s\S]*?<\/\1>/giu, ' ').replace(/<[^>]+>/gu, ' ') : '';
  const printed = bracesIn(pages.said.value, homePage?.said?.value ?? null, shellWords);
  if (unresolved !== 0 || printed !== null) return red(d, 'verify-build', `a page prints braces: ${printed !== null ? `“${printed.slice(0, 80)}”` : `${unresolved ?? 'an unknown number of'} placeholders name nothing`}.`);
  const n = pages.said.value.length;
  return ok(d, 'verify-build', `the link signed the stranger in, a Free record was made and opened, its Home answered${n === 0 ? ' with its first board (no pages yet)' : ` with ${n} pages`}, and no page prints braces.`);
}

/** `link-once`: the same link again is refused. */
export async function linkOnce(d) {
  if (!d.link) return skip(d, 'link-once', 'there is no letter to open.');
  const again = await ask(d, '/auth/signup/verify', { body: { token: d.link.token }, cookie: null });
  if (again.said?.ok === true || again.status < 400) return red(d, 'link-once', `the same link opened a second time (${again.status}).`);
  /* A SPENT LINK IS A WRONG SIGN-IN FROM THIS ADDRESS, and the lock counts it: `lockout` starts from here. */
  if (again.status === 401) d.strikes++;
  return ok(d, 'link-once', `the same link again was refused: “${fixOf(again)}”`);
}

/** The first five, in order, by name. */
export const STEPS = { shut, signup, mail, 'verify-build': verifyBuild, 'link-once': linkOnce };

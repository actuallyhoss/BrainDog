/**
 * Use case 6, step 4, walked where sign-up lives: "Keep it", the mailed link, on the Worker as it ships, in one process
 * (`apps/worker/test/cloud-harness.ts`: `src/index.ts` bundled, a real Directory, real record objects, and a mail sink).
 *
 * WHY HERE. The self-host has no sign-up (`apps/selfhost/src/shell.ts`), so `first-run.mjs` opens her record through the
 * owner door and step 4 says "not walked: self-host". The hosted service's own doors are the ones a stranger meets, and
 * the harness runs them with nothing faked: `/auth/signup/start` with what she said, the letter read from the sink, the
 * proof spent at `/auth/signup/verify`, the free record made at `/account/billing/checkout`, opened at `/auth/switch`.
 *
 * THE BROWSER'S CALLS, NOT HAND-MADE ONES: `startSignup`, `verifySignup`, `checkout` and `openOwned` from the sign-up
 * page's own `lib/signup.ts`, and the link read back with its own `arrivalOf`, so a page that stopped packing `said`
 * is red here too.
 *
 * WHAT SHE SAID RIDES IN THE LINK AND NOWHERE ELSE (link-carry-45). After the walk every table of the Directory's and of
 * every record's, and every line the Worker wrote, is read for her sentence; one hit is red, and names where.
 *
 * THE PASSKEY IS SAID, NEVER FAKED: making one needs a person and a screen (WebAuthn), so the line says "passkey: screen
 * only" and nothing here pretends to have made one.
 *
 * Two halves, as `first-run.mjs` keeps them: `judge` is pure and answers `{ id, pass, saw }` from what the walk saw;
 * `keepIt` is the driver that gathers it.
 */

import { arrivalOf, checkout, openOwned, startSignup, verifySignup } from '../../../apps/web/src/lib/signup.ts';
import { apiBase, BASE } from '../../../apps/web/src/lib/at.ts';
import { propose } from '../../../apps/web/src/lib/start/propose.ts';
import { createClient } from '../../../packages/client/src/index.ts';
import { cloud, ORIGIN } from '../../../apps/worker/test/cloud-harness.ts';

/** The address letters come from, as a host sets `AUTH_MAIL_FROM`. */
const FROM = 'hello@people.braindog.test';

/** What the line says of the passkey, always: the walk has no screen to make one on. */
export const PASSKEY = 'passkey: screen only';

/** How many words in a row are hers alone: a copy cut short, as a log line cuts one, still holds a run this long. */
const RUN = 6;

/**
 * The parts of a sentence long enough to be hers alone, each as typed and as a link carries it, so a copy kept
 * anywhere is found whether it was stored plain, packed or encoded (once, twice, or as a form encodes it, `+` for a
 * space). A part is each of her sentences and every run of six words, so a copy cut short is found too.
 */
export function tracesOf(sentence) {
  const parts = sentence
    .split(/(?<=[.!?])\s+/u)
    .map((s) => s.trim())
    .filter((s) => s.length >= 20);
  const words = sentence.trim().split(/\s+/u);
  const runs = words.slice(0, Math.max(0, words.length - RUN + 1)).map((_, i) => words.slice(i, i + RUN).join(' ')).filter((s) => s.length >= 20);
  const all = parts.length + runs.length > 0 ? [...parts, ...runs] : [sentence.trim()];
  const forms = (p) => [p, encodeURIComponent(p), encodeURIComponent(encodeURIComponent(p)), new URLSearchParams({ s: p }).toString().slice(2), JSON.stringify(p).slice(1, -1)];
  return [...new Set(all.flatMap(forms))];
}

/** Where in `places` (`[{ where, text }]`) any trace of `sentence` is found, by place name. */
export function foundIn(places, sentence) {
  const traces = tracesOf(sentence);
  return places.filter((p) => traces.some((t) => p.text.includes(t))).map((p) => p.where);
}

/**
 * Step 4 on the hosted service, judged. `seen` is what `keepIt` gathered:
 * `started` (`{ ok, why? }`), `link` (the new record's link the letter held, or `null`), `carried` (the sentence read
 * back off that link), `verified` and `made` and `opened` (each `{ ok, why? }`), `name` (the record the session opened,
 * by its name), `kept` (where the sentence was found after the walk).
 */
export function judge(seen, person, title) {
  const missing = [];
  if (!seen.started.ok) missing.push(`sign-up was refused: ${seen.started.why}`);
  else if (seen.link === null) missing.push('no letter with a new record\'s link reached the mailbox');
  else if (seen.carried === null) missing.push('the link carried no sentence, so a phone that opens it starts from nothing');
  else if (seen.carried !== person.said.trim()) missing.push(`the link carried "${seen.carried}", not her sentence`);
  if (seen.link !== null && !seen.verified.ok) missing.push(`the link was refused: ${seen.verified.why}`);
  else if (seen.verified.ok && !seen.made.ok) missing.push(`the free record was not made: ${seen.made.why}`);
  else if (seen.made.ok && !seen.opened.ok) missing.push(`the new record did not open: ${seen.opened.why}`);
  else if (seen.opened.ok && seen.name !== title) missing.push(`the session opened ${seen.name === null ? 'no record' : `"${seen.name}"`}, not "${title}"`);
  if (seen.kept.length > 0) missing.push(`her sentence was kept in ${seen.kept.join(', ')}`);
  if (missing.length > 0) return { id: 'keep', pass: false, saw: `${missing.join('; ')}; ${PASSKEY}` };
  return {
    id: 'keep',
    pass: true,
    saw: `the mailed link carried her sentence and opened "${seen.name}", signed in; the sentence is in no Directory table, no record and no log line; ${PASSKEY}`,
  };
}

/* ── the walk ─────────────────────────────────────────────────────────────────────────────────────────── */

/** A cell as text: bytes read as UTF-8, so a sentence kept in a BLOB column is found as one kept in a TEXT column. */
const cell = (_k, v) => (v instanceof Uint8Array ? new TextDecoder().decode(v) : typeof v === 'bigint' ? String(v) : v);

/** Every table of one SQL storage as places to look in, one a table: `<who> <table>`. */
function tablesOf(storage, who) {
  const names = storage.sql.exec("SELECT name FROM sqlite_master WHERE type = 'table'").toArray();
  return names.map(({ name }) => ({ where: `${who} ${name}`, text: JSON.stringify(storage.sql.exec(`SELECT * FROM "${name}"`).toArray(), cell) }));
}

/**
 * A tab on the hosted service: the sign-up page's `Io` and a record client, both through the Worker's own `fetch`, with
 * the session cookie it was given and the `Origin` a browser sends on a write. `wrap` may stand between them.
 */
function tabOn(c, wrap) {
  let cookie = null;
  const raw = async (url, init = {}) => {
    const path = String(url).startsWith(ORIGIN) ? String(url).slice(ORIGIN.length) : String(url);
    const headers = new Headers(init.headers);
    const method = (init.method ?? 'GET').toUpperCase();
    const res = await c.ask(path, { ...init, method, headers, ...(cookie !== null ? { cookie } : {}) });
    for (const set of res.headers.getSetCookie()) {
      const kept = /^((?:__Host-)?bd_s=[^;]*)/u.exec(set)?.[1];
      if (kept) cookie = kept.endsWith('=') ? null : kept;
    }
    return res;
  };
  const io = wrap(raw, c);
  return { web: { fetch: io }, client: (base) => createClient({ base, fetch: io }) };
}

/** The name the sign-up page sends at the start: its reading of her sentence (`propose`), the name heard in it. */
const heardName = (person) => propose(person.said, { zone: person.zone ?? null, locale: person.locale ?? 'en' }).name ?? '';

/** A sign-up answer as `{ ok, why? }`, in the page's own words where it has them. */
const told = (out) => (out.ok ? { ok: true } : { ok: false, why: out.fix ?? out.kind });

/** The letters the sink holds, waited for: the letter goes inside `waitUntil`, which nothing waits on. */
async function lettersFor(sent, to, at) {
  for (let i = 0; i < 50; i++) {
    const mine = sent.slice(at).filter((m) => m.to === to);
    if (mine.length > 0) return mine;
    await new Promise((r) => setTimeout(r, 10));
  }
  return [];
}

/**
 * Walk step 4 for `person` on a fresh hosted service and answer `{ id: 'keep', pass, saw, seen }`.
 *
 * `title` is the record's name she was shown at step 2 (`Mariam's Candles` for Mariam), the name the record must open
 * under. `name` is what the page sends as `name` at the start, by default as the page sends it
 * (`routes/signup/+page.svelte` `send`: `read.name`, the name heard in her sentence), so a page that names the record
 * after her and not after what she was shown is red here.
 * `wrap(fetch, harness)` answers the fetch the tab uses: the test's way to break one door and see the line go red.
 * Every line the Worker writes while the walk runs is held back and read for her sentence, then let go.
 */
export async function keepIt(person, { title = person.expect?.heard?.title ?? person.name, name = heardName(person), wrap = (f) => f } = {}) {
  const sent = [];
  /* A KEY STORE BOUND, AS PRODUCTION BINDS ONE: a fresh key of the walk's own, never a host's. */
  const KEK = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex');
  const mail = { send: async (m) => (sent.push(m), { messageId: `m${sent.length}` }) };
  const c = await cloud({ SIGNUP: 'open', AUTH_MAIL_FROM: FROM, EMAIL: mail, KEK });
  const lines = [];
  const kept = { log: console.log, error: console.error, warn: console.warn, info: console.info, debug: console.debug };
  const hold = (...a) => void lines.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x) ?? String(x))).join(' '));
  Object.assign(console, { log: hold, error: hold, warn: hold, info: hold, debug: hold });
  const seen = { started: { ok: false }, link: null, carried: null, verified: { ok: false }, made: { ok: false }, opened: { ok: false }, name: null, kept: [] };
  try {
    const t = tabOn(c, wrap);
    const draft = { said: person.said, currency: null, usecase: null };
    seen.started = told(await startSignup({ email: person.email, slug: person.slug, name, tz: person.zone, said: draft }, t.web));
    if (seen.started.ok) {
      const letters = await lettersFor(sent, person.email, 0);
      seen.link = letters.map((m) => /https:\/\/\S+#verify=\S+/u.exec(String(m.text ?? ''))?.[0]).find(Boolean) ?? null;
    }
    if (seen.link !== null) {
      /* THE PAGE'S OWN READING OF THE LINK: the proof and, after it, what was said, unpacked. */
      const arrived = arrivalOf(new URL(seen.link).hash, () => {});
      seen.carried = arrived.said?.said?.trim() ?? null;
      const verified = arrived.kind === 'verify' ? await verifySignup(arrived.token, t.web) : { ok: false, kind: 'refused', fix: 'the link held no proof' };
      seen.verified = told(verified);
      if (verified.ok) {
        const v = verified.value;
        const made = await checkout({ slug: v.slug, name: v.name, tz: v.tz, plan: 'free' }, t.web);
        seen.made = told(made);
        if (made.ok) {
          const opened = await openOwned(v.slug, t.web);
          seen.opened = told(opened);
          if (opened.ok) {
            const boot = await t.client(apiBase({ origin: ORIGIN, pathname: `${BASE}/${v.slug}/` })).boot();
            seen.name = boot.ok ? (boot.value.record?.name ?? null) : null;
            if (!boot.ok) seen.opened = { ok: false, why: `boot was refused: ${boot.refusal?.fix ?? 'no answer'}` };
          }
        }
      }
    }
  } finally {
    Object.assign(console, kept);
  }
  /* AFTER THE WALK, EVERY PLACE A COPY COULD BE KEPT. */
  const places = [
    ...tablesOf(c.dirStorage, 'the Directory\'s'),
    ...[...c.storages.values()].flatMap((s) => tablesOf(s, 'the record\'s')),
    ...[...c.blobs.held.entries()].map(([key, o]) => ({ where: `the bucket's ${key}`, text: new TextDecoder().decode(o.bytes) })),
    ...lines.map((text, i) => ({ where: `log line ${i + 1}`, text })),
    ...c.log.map((text) => ({ where: 'the harness log', text })),
  ];
  seen.kept = [...new Set(foundIn(places, person.said))];
  return { ...judge(seen, person, title), seen };
}

/**
 * `first-run.mjs`'s step 4 with this walk laid in: on a host that has no sign-up its line is "not walked: self-host"
 * (`kept.pass === null`), and the hosted service's walk answers in its place, the self-host's build said after it.
 * A line already green or red is left as it is.
 */
export function joined(kept, hosted) {
  if (kept.pass !== null) return kept;
  const built = kept.saw.replace(/^sign-up not walked: self-host; opened through the owner door, /u, '');
  return { id: 'keep', pass: hosted.pass, saw: `on the hosted service, ${hosted.saw}; on the self-host, ${built}` };
}

/** `node tools/people/expect/keep-it.mjs [person.json]`: Mariam by default, one line, and exit 1 when it is red. */
if (import.meta.url === `file://${process.argv[1]}`) {
  const { readFileSync } = await import('node:fs');
  const file = process.argv[2] ?? new URL('../mariam.json', import.meta.url).pathname;
  const { lineOf } = await import('./first-run.mjs');
  const r = await keepIt(JSON.parse(readFileSync(file, 'utf8')));
  console.log(lineOf(r, process.stdout.isTTY));
  process.exitCode = r.pass === true ? 0 : 1;
}

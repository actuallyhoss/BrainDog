/**
 * The walk: one made-up person signs up the way a stranger does, uses the record, and the walk says in `verdict.json`
 * whether what they were shown is what their file expects.
 *
 *   node tools/usecase-walks/walk.mjs <person> --base https://<the host> --address <a test mailbox> --link-file <path>
 *
 * WHAT IT DOES, IN ORDER. It signs up at the host's public address with the person's sentence and an address nobody has
 * used, through the sign-up page's own calls (`apps/web/src/lib/signup.ts`, as `tools/people/expect/keep-it.mjs` does).
 * It accepts the proposal with the page's own build (`routes/signup/build.ts` `accepting`), takes every page of the rail
 * at 390 and 1440, makes a key as Settings, Agents makes one (`lib/record/settings-write.ts` `mintAgent`), ages the
 * record a week and takes the pages, ages it to three months and takes them again (`age.mjs`), does the person's acts
 * on the screen, writes `verdict.json`, and deletes the record as Settings deletes one (`deleteRecordNow`).
 *
 * PEOPLE LIVE IN `tools/people`. This folder keeps only the runner, `age.mjs` and their tests ("One kit", section 3).
 * A person's `walk` holds what this file reads: `pages` beside the rail, `week` and `quarter` for `age.mjs`, `acts`,
 * and `expect`, the list the verdict answers line by line.
 *
 * NO BROWSER AND NO READER OF ITS OWN. The pages are opened with the proof area's `openPage` and `readiness`
 * (`tools/gates/lib.mjs`) and counted with the look's `rawIn` (`tools/look/capture.mjs`). What needs eyes goes to the
 * look's reading agent as `reader.json`, read against `tools/look/rubric.md`.
 *
 * TWO HALVES, as `tools/people/expect/first-run.mjs` keeps them: `judge` is pure and answers one line from what was
 * seen, and `walk` is the driver that gathers it. The doors and the browser are handed in, so the kit's own test
 * (`walk.test.mjs`) walks with neither.
 *
 * A RECORD LEFT BEHIND FAILS THE RUN, whatever the lines say: the walk makes a real record on a real host, and one it
 * cannot show is gone is said by name and exits 1.
 */

/** The widths every page is taken at: the phone and the laptop. */
export const WIDTHS = [390, 1440];

/** The three times the pages are taken, in order. */
export const STAGES = ['day 0', 'a week', 'three months'];

/** The words a page prints when it could not draw what it was asked for. */
const BROKEN = /\b(something went wrong|could not (be )?(read|load|reach|draw)|try again|not found|no answer)\b/iu;

const pattern = (source) => new RegExp(source, 'iu');
const short = (s, most = 200) => (s.length > most ? `${s.slice(0, most - 1).trimEnd()}…` : s);

/** The line of `text` that holds the character at `index`, as a person reads it. */
function lineAt(text, index) {
  const from = text.lastIndexOf('\n', index - 1) + 1;
  const to = text.indexOf('\n', index);
  return short(text.slice(from, to === -1 ? text.length : to).trim());
}

/** Where a picture was taken, in words: "Billing at 390 on day 0". */
const whereOf = (p) => `${p.name} at ${p.width}${p.stage ? ` on ${p.stage === 'day 0' ? 'day 0' : `the record aged ${p.stage}`}` : ''}`;

/** A screen that settled into something a person can read: not stuck, and not the app's own refusal. */
const drew = (p) => p.state !== null && p.state !== undefined && p.state !== 'refused';

const pass = (line, quote, where) => ({ id: line.id, says: line.says, pass: true, quote, where });
const fail = (line, quote, where = null) => ({ id: line.id, says: line.says, pass: false, quote, where });

/** The pictures a line is about: the page it names by its address, at the stage it names when it names one. */
const picturesOf = (line, seen) => seen.pages.filter((p) => p.path === line.path && (line.stage === undefined || p.stage === line.stage));

/**
 * One line of a person's list, answered from what the walk saw: `{ id, says, pass, quote, where }`. `quote` is the
 * words on the screen that met the line, or what was there in their place.
 *
 * THE KINDS. `says`: a page holds the words (`match`), on every picture of it, and before any of `before` when the
 * line says which comes first. `draws`: a page settled, holds the words, and prints none of the words of a page that
 * failed. `opens`: every page of the rail settled, with no error of its own. `act`: after the person's act the screen
 * said the words, in `sentences` sentences, and none of `never`. `never`: no picture prints a slot never filled, a
 * machine's instant, a bare id, or a word the person never said (`words`).
 *
 * A LINE THE WALK NEVER REACHED IS RED, never skipped: a list nobody could check has not been met.
 */
export function judge(line, seen) {
  if (line.kind === 'says' || line.kind === 'draws') {
    const pictures = picturesOf(line, seen);
    if (pictures.length === 0) return fail(line, `${line.on} was never opened`);
    const want = pattern(line.match);
    let first = null;
    for (const p of pictures) {
      if (!drew(p)) return fail(line, p.state === 'refused' ? 'the page was refused' : 'the page never settled', whereOf(p));
      const broken = line.kind === 'draws' ? BROKEN.exec(p.text) : null;
      if (broken) return fail(line, lineAt(p.text, broken.index), whereOf(p));
      const found = want.exec(p.text);
      if (!found) return fail(line, `the page does not say it. It starts: "${short(p.text.trim().replace(/\s*\n\s*/gu, ' / '), 120)}"`, whereOf(p));
      for (const b of line.before ?? []) {
        const other = pattern(b).exec(p.text);
        if (other && other.index < found.index) return fail(line, `"${lineAt(p.text, other.index)}" comes before "${lineAt(p.text, found.index)}"`, whereOf(p));
      }
      if (line.chart === true && !(p.drawings > 0)) return fail(line, `"${lineAt(p.text, found.index)}", and no chart is drawn`, whereOf(p));
      first ??= { quote: lineAt(p.text, found.index), where: whereOf(p) };
    }
    return pass(line, first.quote, pictures.length === 1 ? first.where : `${first.where}, and ${pictures.length - 1} more pictures of it`);
  }
  if (line.kind === 'opens') {
    const rail = seen.pages.filter((p) => p.rail === true);
    if (rail.length === 0) return fail(line, 'the rail showed no page to open');
    for (const p of rail) {
      if (!drew(p)) return fail(line, p.state === 'refused' ? 'the page was refused' : 'the page never settled', whereOf(p));
      const thrown = (p.errors ?? []).find((e) => e.kind === 'uncaught');
      if (thrown) return fail(line, short(thrown.text), whereOf(p));
    }
    const names = [...new Set(rail.map((p) => p.name))];
    return pass(line, names.join(', '), `${rail.length} pictures, every one settled`);
  }
  if (line.kind === 'act') {
    const act = seen.acts.find((a) => a.id === line.act);
    if (!act) return fail(line, 'the walk never got as far as doing it');
    if (act.why) return fail(line, act.why, act.name);
    const want = pattern(line.match);
    const said = act.said.find((s) => want.test(s));
    if (said === undefined) return fail(line, act.said.length === 0 ? 'the screen said nothing new' : `the screen said "${short(act.said.join(' / '))}"`, act.name);
    const sentences = said.split(/(?<=[.!?])\s+/u).filter((s) => s.trim() !== '').length;
    if (line.sentences !== undefined && sentences !== line.sentences) return fail(line, `"${short(said)}" is ${sentences} sentences, not ${line.sentences}`, act.name);
    for (const n of line.never ?? []) if (pattern(n).test(said)) return fail(line, `"${short(said)}"`, act.name);
    return pass(line, short(said), act.name);
  }
  if (line.kind === 'never') {
    if (seen.pages.length === 0) return fail(line, 'no page was opened');
    for (const p of seen.pages) {
      const raw = Object.entries(p.raw ?? {})[0];
      if (raw) return fail(line, raw[1].e.join(', '), whereOf(p));
      /* A word she never said is looked for on her own pages, the rail's: Settings may say "invoice" of its own bill. */
      for (const w of p.rail === true ? (line.words ?? []) : []) {
        const found = pattern(`\\b(?:${w})\\b`).exec(p.text);
        if (found) return fail(line, lineAt(p.text, found.index), whereOf(p));
      }
    }
    return pass(line, 'nothing of the kind', `${seen.pages.length} pictures`);
  }
  return fail(line, `the walk has no way to check a line of kind "${line.kind}"`);
}

/**
 * The whole verdict: every line of the person's list answered, each step of the walk, and whether the record it made
 * is gone. `colour` is green only when every line and every step passed and the record was deleted.
 */
export function verdictOf({ person, origin, seen, steps, record, started, closed }) {
  const lines = (person.walk?.expect ?? []).map((line) => judge(line, seen));
  const left = record.made === true && record.deleted !== true;
  const red = lines.some((l) => !l.pass) || steps.some((s) => !s.ok) || lines.length === 0 || left;
  return {
    person: person.name,
    host: origin,
    started,
    closed,
    colour: red ? 'red' : 'green',
    record: { name: record.name ?? null, made: record.made === true, deleted: record.deleted === true, ...(left ? { left: record.why ?? 'the record the walk made is still there' } : {}) },
    lines,
    steps,
    pictures: seen.pages.length + seen.acts.filter((a) => a.image).length,
  };
}

/** Whether a run failed: a red verdict, or a record left behind, said apart because it needs somebody's hands. */
export const failed = (verdict) => verdict.colour !== 'green' || (verdict.record.made && !verdict.record.deleted);

/** A verdict as lines a person reads: one a line of the list, then the steps that failed, then the record. */
export function linesOf(verdict) {
  const out = verdict.lines.map((l) => `${l.pass ? 'green' : 'red'}. ${l.says}: ${l.quote}${l.where ? ` (${l.where})` : ''}`);
  for (const s of verdict.steps.filter((x) => !x.ok)) out.push(`red. ${s.step}: ${s.saw}`);
  if (verdict.record.made && !verdict.record.deleted) out.push(`red. ${verdict.record.name ?? 'The record'} was left behind: ${verdict.record.left}. Delete it in Settings.`);
  out.push(`${verdict.person} on ${verdict.host}: ${verdict.colour}`);
  return out;
}

/**
 * The person as this run signs them up: a new address and a new record name, so a walk never meets the record or the
 * free allowance of the walk before it. `address` is a mailbox somebody can read; the stamp goes in after a plus.
 */
export function fresh(person, address, at = Date.now()) {
  const stamp = at.toString(36);
  const [box, domain] = (address ?? person.email).split('@');
  return { ...person, email: `${box.replace(/\+.*$/u, '')}+w${stamp}@${domain}`, slug: `${person.slug.slice(0, 40 - stamp.length - 1)}-${stamp}` };
}

/* ── the doors, as a browser tab reaches them ─────────────────────────────────────────────────────────── */

/**
 * A tab at `origin`: every request carries the session cookie it was given and, on a write, the `Origin` the host
 * checks. `tools/people/expect/first-run.mjs` has the same tab; this one also hands the cookie to the browser that
 * takes the pictures, and takes the `fetch` it sends with.
 */
export function tab(origin, send = fetch) {
  let cookie = null;
  const io = async (url, init = {}) => {
    const method = (init.method ?? 'GET').toUpperCase();
    const headers = new Headers(init.headers);
    if (cookie !== null) headers.set('cookie', cookie);
    if (method !== 'GET' && method !== 'HEAD') headers.set('origin', origin);
    const res = await send(String(url), { ...init, method, headers });
    for (const c of res.headers.getSetCookie()) {
      const kept = /^((?:__Host-)?bd_s=[^;]*)/u.exec(c)?.[1];
      if (kept) cookie = kept.endsWith('=') ? null : kept;
    }
    return res;
  };
  return { io, web: { fetch: (path, init) => io(`${origin}${path}`, init) }, cookie: () => cookie };
}

const whyOf = (out) => out?.fix ?? out?.refusal?.fix ?? out?.kind ?? out?.code ?? 'no answer';

/**
 * The real doors of a host at `host.origin`: the sign-up page's calls, the build the page makes, the two Settings
 * writes, and `age.mjs`. `host.sink.linkFor(address)` answers the mailed link, and `host.fetch` is how it is reached.
 * Each door answers `{ ok, why? }` and keeps what the next one needs. The key never leaves this closure.
 */
export async function realDoors(host) {
  const web = '../../apps/web/src';
  const [signup, at, proposing, question, building, accepting, build, write, deciding, client, firstRun, people, ageing] = await Promise.all([
    import(`${web}/lib/signup.ts`),
    import(`${web}/lib/at.ts`),
    import(`${web}/lib/start/propose.ts`),
    import(`${web}/lib/start/question.ts`),
    import(`${web}/routes/start/building.ts`),
    import(`${web}/routes/start/accept.ts`),
    import(`${web}/routes/signup/build.ts`),
    import(`${web}/lib/record/settings-write.ts`),
    import(`${web}/lib/record/decide-write.ts`),
    import('../../packages/client/src/index.ts'),
    import(`${web}/lib/first-run.ts`),
    import('../people/expect/first-run.mjs'),
    import('./age.mjs'),
  ]);
  const t = tab(host.origin, host.fetch ?? fetch);
  const now = host.now ?? (() => Date.now());
  const held = { person: null, proposal: null, base: null, key: null, reading: null, env: null };
  const record = () => client.createClient({ base: held.base, fetch: t.io });
  return {
    cookie: () => t.cookie(),
    async signUp(person) {
      held.person = person;
      held.env = building.browserCurrencyEnv(person.locale, person.languages, person.zone);
      held.reading = async (said) => proposing.propose(said, { zone: person.zone, locale: person.locale, currency: building.zoneCurrency(person.zone) });
      held.proposal = await held.reading(person.said);
      const draft = { said: person.said, currency: null, usecase: null };
      const started = await signup.startSignup({ email: person.email, slug: person.slug, name: build.nameSent(held.proposal), tz: person.zone, said: draft }, t.web);
      if (!started.ok) return { ok: false, why: `sign-up was refused: ${whyOf(started)}` };
      const link = host.sink ? await host.sink.linkFor(person.email) : null;
      if (!link) return { ok: false, why: 'no link reached the mailbox' };
      const arrived = signup.arrivalOf(new URL(link).hash, () => {});
      if (arrived?.kind !== 'verify') return { ok: false, why: "the mail held a sign-in link, not a new record's, so this address already has an account" };
      const verified = await signup.verifySignup(arrived.token, t.web);
      if (!verified.ok) return { ok: false, why: `the link was refused: ${whyOf(verified)}` };
      const v = verified.value;
      /* NO PLAN AND NO CARD: the free record is made there and then, under the name the person was shown. */
      const made = await signup.checkout({ slug: v.slug, name: build.titleSent(held.proposal, v.name), tz: v.tz, plan: 'free' }, t.web);
      if (!made.ok) return { ok: false, why: `the free record was not made: ${whyOf(made)}` };
      held.base = at.apiBase({ origin: host.origin, pathname: `${at.BASE}/${v.slug}/` });
      const opened = await signup.openOwned(v.slug, t.web);
      if (!opened.ok) return { ok: false, made: true, slug: v.slug, why: `the new record did not open: ${whyOf(opened)}` };
      const boot = await record().boot();
      /* NOTHING IS WRITTEN TO A RECORD THIS WALK DID NOT JUST MAKE (`first-run.mjs` `notMine`). */
      const other = people.notMine(boot.ok ? boot.value : null, { ...person, slug: v.slug });
      if (other !== null) return { ok: false, made: true, slug: v.slug, why: other };
      return { ok: true, made: true, slug: v.slug, name: boot.value.record?.name ?? v.slug };
    },
    async accept() {
      const p = held.person;
      const asked = question.oneQuestion(held.proposal, p.said, held.env);
      const extra = { amend: firstRun.NO_AMEND, reply: asked === null ? null : { about: asked.about, value: p.answer } };
      const today = new Date(now()).toISOString().slice(0, 10);
      const asking = await build.accepting({ said: p.said, currency: null, usecase: null }, extra, held.reading, { device: held.env, today, email: p.email, nav: [], locale: p.locale });
      if (asking === null) return { ok: false, why: 'nothing was built from the sentence' };
      const made = await accepting.accept(record(), asking);
      return made.failed.length === 0 ? { ok: true } : { ok: false, why: made.failed.map((f) => `${f.said}: ${f.why}`).join('; ') };
    },
    async key() {
      const out = await write.mintAgent(held.base, { label: 'Walk', inbox: false, days: 1 }, t.io);
      if (!out.ok) return { ok: false, why: whyOf(out) };
      held.key = out.value.bearer;
      return { ok: true };
    },
    async age(stage, say) {
      if (held.key === null) return { ok: false, written: 0, why: 'there is no key to write with' };
      const keyed = client.createClient({ base: host.origin, token: held.key, ...(host.fetch ? { fetch: host.fetch } : {}) });
      /* THE RECORD ASKS ABOUT AN AGENT'S FIRST CHANGES, and the person says yes on Decide, by the page's own write. */
      const decide = async (asked) => {
        const out = await deciding.answerQuestion(held.base, asked.id, 'accept', undefined, t.io);
        return out.from === 'written' ? { ok: true } : { ok: false, why: out.fix ?? 'the answer was not kept' };
      };
      return ageing.age(keyed, ageing.plan(held.person, stage, now()), { say, decide });
    },
    async erase(slug) {
      const out = await write.deleteRecordNow(held.base, slug, t.io);
      return out.ok ? { ok: true } : { ok: false, why: whyOf(out) };
    },
    /** Whether the record is still among the ones this person owns: `true`, `false`, or `null` when nobody would say. */
    async left(slug) {
      const out = await signup.billing(t.web);
      return out.ok ? out.value.records.some((r) => r.slug === slug) : null;
    },
  };
}

/* ── the walk ─────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * Walk `person` and answer the verdict. `doors` are the host's (`realDoors`), `seer` is the browser (`lookSeer`), `out`
 * is the folder the pictures and `verdict.json` go in, and `say` hears each step as it ends.
 *
 * THE WALK KEEPS GOING after a step fails wherever it can, so one run names everything that is wrong, and it always
 * reaches the end: whatever happened, the record it made is deleted and then looked for.
 */
export async function walk(person, { origin, doors, seer, out = null, say = () => {}, now = () => Date.now() }) {
  const started = new Date(now()).toISOString();
  const seen = { pages: [], acts: [] };
  const steps = [];
  const record = { made: false, deleted: false, name: null, slug: null };
  const step = (name, r, good) => {
    const s = { step: name, ok: r.ok === true, saw: r.ok === true ? good : (r.why ?? 'it did not work') };
    steps.push(s);
    say(s);
    return s.ok;
  };
  /* Every page the rail shows now and every page the person's file names beside it, at both widths. */
  const take = async (stage) => {
    const rail = (await seer.rail()).map((p) => ({ ...p, rail: true }));
    const beside = (person.walk?.pages ?? []).filter((p) => !rail.some((r) => r.path === p.path));
    for (const page of [...rail, ...beside]) for (const width of WIDTHS) seen.pages.push({ ...(await seer.see(page, width, stage)), name: page.name, path: page.path, rail: page.rail === true, width, stage });
    return { ok: rail.length > 0, why: 'the rail showed no page to open', pages: rail.length + beside.length };
  };
  let opened = false;
  try {
    const signed = await doors.signUp(person);
    Object.assign(record, { made: signed.made === true, slug: signed.slug ?? null, name: signed.name ?? signed.slug ?? null });
    if (step('Sign up with no plan and no card', signed, `${record.name} was made and opened`)) {
      const built = step('Accept the proposal', await doors.accept(), 'everything it proposed was made');
      await seer.open({ origin, slug: record.slug, cookie: doors.cookie(), out });
      opened = true;
      const first = await take(STAGES[0]);
      step('Take every page on day 0', first, `${first.pages} pages at ${WIDTHS.join(' and ')}`);
      if (built && step('Make a key in Settings, Agents', await doors.key(), 'a key for one day')) {
        for (const [stage, spec] of [[STAGES[1], 'week'], [STAGES[2], 'quarter']]) {
          const aged = await doors.age(spec, say);
          if (!step(`Age the record ${stage}`, aged, `${aged.written} entries written${aged.asked > 0 ? `, ${aged.asked} of them after a yes on Decide` : ''}`)) continue;
          const taken = await take(stage);
          step(`Take every page aged ${stage}`, taken, `${taken.pages} pages at ${WIDTHS.join(' and ')}`);
        }
      }
      for (const act of person.walk?.acts ?? []) seen.acts.push({ ...(await seer.act(act, { address: fresh(person, person.email, now() + 1).email })), id: act.id, name: act.name });
    }
  } catch (e) {
    step('Finish the walk', { ok: false, why: `it stopped: ${String(e?.message ?? e).split('\n')[0]}` }, '');
  } finally {
    if (opened) await seer.close().catch(() => {});
    if (record.made) {
      const erased = await doors.erase(record.slug).catch((e) => ({ ok: false, why: String(e?.message ?? e).split('\n')[0] }));
      const left = await doors.left(record.slug).catch(() => null);
      record.deleted = left === false;
      if (left !== false) record.why = erased.ok ? (left === null ? 'the host would not say whether it is gone' : 'it was deleted and is still listed') : `deleting it was refused: ${erased.why}`;
      step('Delete the record in Settings', { ok: record.deleted, why: record.why }, `${record.name} is gone`);
    }
  }
  const verdict = verdictOf({ person, origin, seen, steps, record, started, closed: new Date(now()).toISOString() });
  if (out !== null) {
    const { mkdirSync, writeFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, 'verdict.json'), `${JSON.stringify(verdict, null, 2)}\n`);
    /* FOR THE LOOK'S READING AGENT: the person's list and every picture, to be read against the look's rubric. */
    const pictures = [...seen.pages.map((p) => ({ of: whereOf(p), image: p.image ?? null })), ...seen.acts.map((a) => ({ of: a.name, image: a.image ?? null }))].filter((p) => p.image !== null);
    writeFileSync(join(out, 'reader.json'), `${JSON.stringify({ person: person.name, who: person.who, rubric: 'tools/look/rubric.md', list: (person.walk?.expect ?? []).map((l) => l.says), pictures }, null, 2)}\n`);
  }
  return verdict;
}

/* ── the browser, borrowed ────────────────────────────────────────────────────────────────────────────── */

/**
 * The proof area's browser, pointed at a signed-in record: `openPage` and `readiness` from `tools/gates/lib.mjs`, the
 * look's `rawIn`, and Chromium as the gates launch it. A page opens under the record's own name (`/<name>/...`)
 * with the tab's session, on the real clock.
 */
export async function lookSeer() {
  const { join, resolve, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const { mkdirSync } = await import('node:fs');
  const { chromium } = await import('@playwright/test');
  const gates = await import('../gates/lib.mjs');
  const { rawIn } = await import('../look/capture.mjs');
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const ready = gates.readiness('walk', gates.budget('ready').settleTimeoutMs, join(root, 'apps', 'web', 'build'));
  const settleMs = gates.budget('layout').settleMs;
  let browser = null;
  let at = null;
  const fileOf = (words) => `${words.toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '')}.png`;
  const open = async (path, width) => {
    const [name, ...value] = at.cookie.split('=');
    return gates.openPage(browser, `${at.app}${path}`, { width, touch: width < 600, clock: null, ready, cookies: { [name]: value.join('=') } });
  };
  const textOf = (page) => page.evaluate(() => document.body.innerText).catch(() => '');
  return {
    async open({ origin, slug, cookie, out }) {
      if (cookie === null) throw new Error('the tab holds no session, so no page would open signed in');
      at = { app: `${origin}${gates.APP_BASE}/${slug}`, cookie, out };
      if (out !== null) mkdirSync(out, { recursive: true });
      browser = await chromium.launch();
    },
    /** The pages the rail shows at the laptop's width: each link's words and its address inside the record. */
    async rail() {
      const opened = await open('/', WIDTHS[1]);
      try {
        const links = await opened.page.evaluate(() => [...document.querySelectorAll('.rail-slot a[href]')].map((a) => ({ name: (a.getAttribute('aria-label') ?? a.textContent ?? '').trim().replace(/\s+/gu, ' '), href: new URL(a.href).pathname })));
        const inside = new URL(at.app).pathname;
        const pages = links.filter((l) => l.name !== '' && l.href.startsWith(inside)).map((l) => ({ name: l.name, path: l.href.slice(inside.length) || '/' }));
        return pages.filter((p, i) => pages.findIndex((q) => q.path === p.path) === i);
      } finally {
        await opened.context.close();
      }
    },
    async see(page, width, stage) {
      const opened = await open(page.path, width);
      try {
        await opened.page.waitForTimeout(settleMs);
        const facts = await opened.page.evaluate(() => {
          const main = document.querySelector('main') ?? document.body;
          return { text: main.innerText, drawings: main.querySelectorAll('svg[role="img"], canvas, figure svg').length };
        }).catch(() => ({ text: '', drawings: 0 }));
        const image = at.out === null ? null : fileOf(`${stage} ${page.name} ${width}`);
        if (image !== null) await opened.page.screenshot({ path: join(at.out, image), fullPage: true });
        return { state: opened.state, text: facts.text, drawings: facts.drawings, errors: [...opened.errors], failed: [...opened.failed], raw: rawIn(facts.text), image };
      } finally {
        await opened.context.close();
      }
    },
    /** One act on the screen: type into the field the file names, press Enter, and read what the screen then says that it did not say before. */
    async act(act, values) {
      const opened = await open(act.path, WIDTHS[1]);
      try {
        const before = new Set((await textOf(opened.page)).split('\n').map((s) => s.trim()));
        const field = opened.page.locator(`#${act.into}`);
        if ((await field.count()) === 0) return { said: [], image: null, why: `the page has no ${act.field} to type into` };
        await field.fill(act.type.replace('{address}', values.address));
        await field.press('Enter');
        await opened.page.waitForTimeout(Math.max(settleMs, 1_500));
        const said = (await textOf(opened.page)).split('\n').map((s) => s.trim()).filter((s) => s !== '' && !before.has(s));
        const image = at.out === null ? null : fileOf(`act ${act.name}`);
        if (image !== null) await opened.page.screenshot({ path: join(at.out, image), fullPage: true });
        return { said, image };
      } finally {
        await opened.context.close();
      }
    },
    async close() {
      await browser?.close();
    },
  };
}

/* ── the command ──────────────────────────────────────────────────────────────────────────────────────── */

/** `--flag value` pairs and the one bare word, the person. A flag this command does not take is refused by name. */
export function parse(args) {
  const takes = new Set(['--base', '--address', '--link-file', '--out']);
  const out = { person: null };
  for (let i = 0; i < args.length; i++) {
    if (takes.has(args[i])) out[args[i].slice(2)] = args[++i];
    else if (args[i].startsWith('--')) throw new Error(`walk takes --base, --address, --link-file and --out, not ${args[i]}.`);
    else if (out.person === null) out.person = args[i];
    else throw new Error(`walk takes one person, and was given ${out.person} and ${args[i]}.`);
  }
  for (const need of ['person', 'base', 'address', 'link-file']) if (!out[need]) throw new Error(`walk needs ${need === 'person' ? 'a person, such as free' : `--${need}`}.`);
  return out;
}

/*
 * `node tools/usecase-walks/walk.mjs free --base https://<the host> --address <a mailbox you read> --link-file <path>`.
 * The walk asks for the sign-up link, then waits up to five minutes for whoever reads that mailbox to put the link in
 * the file (`tools/people/expect/first-run.mjs` `deployed`). Red, or a record left behind, exits 1.
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  const { readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  let asked;
  try {
    asked = parse(process.argv.slice(2));
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }
  const file = asked.person.endsWith('.json') ? asked.person : new URL(`../people/${asked.person}.json`, import.meta.url).pathname;
  const person = fresh(JSON.parse(readFileSync(file, 'utf8')), asked.address);
  const { deployed } = await import('../people/expect/first-run.mjs');
  const host = deployed(asked.base, asked['link-file']);
  /* Scratch lives outside the repository unless somebody says where. */
  const out = asked.out ?? join(tmpdir(), 'braindog-loop', 'walks', `${person.slug}`);
  console.log(`${person.name} signs up at ${host.origin} as ${person.email}. Put the mailed link in ${asked['link-file']}.`);
  const verdict = await walk(person, { origin: host.origin, doors: await realDoors(host), seer: await lookSeer(), out, say: (s) => s.step && console.log(`  ${s.ok ? 'done' : 'failed'}: ${s.step}. ${s.saw}`) });
  for (const line of linesOf(verdict)) console.log(line);
  console.log(`The verdict and ${verdict.pictures} pictures are in ${out}`);
  process.exit(failed(verdict) ? 1 : 0);
}

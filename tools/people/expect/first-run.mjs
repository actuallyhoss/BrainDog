/**
 * Use case 6, walked: the seven steps of the onboarding target (his word of 9 October, `loop/progress/planner-45.md`
 * "The onboarding target"), for one person, through the doors a browser uses, each said as one line, green or red with
 * what it saw.
 *
 * THE DOORS ARE THE BROWSER'S, NOT THE RECORD'S INSIDES. The rules reading is the web's own (`lib/start/propose.ts` and
 * `question.ts`, imported, as the sign-up page runs them on the device). Everything after it is HTTP to the host: the
 * sign-up under `/auth/signup/*`, with the link read from the mail sink; the build through the web's own `accept`, the
 * press "Make it mine" makes; the card's `capture` and its one Undo; `boot`, which Today is drawn from; and, the clock
 * moved fifteen days, Orders read on three weeks and the pen's offer for her pattern. Nothing reaches into the file.
 *
 * TWO HALVES, AS `loop/scope/area-usecases-b.md` USE-B01 ASKS. `expect.*` are pure: each takes what the walk saw and
 * answers `{ id, pass, saw }`, so the proof area's rig can hand them a snapshot of its own. `walk` is the thin driver
 * that gathers what they read, on a fresh self-host (`selfHost`) or on any host a caller hands in.
 *
 * THE SELF-HOST HAS NO SIGN-UP. Its `/auth/signup/*` answers that sign-up is the hosted service's (`on: 'worker'` in
 * `packages/host/src/auth.ts`), so there the record is opened the way its owner opens it, the server key at
 * `/auth/token`, and step 4 says "sign-up not walked: self-host". The walk on production waits for his deploy word.
 */

import { firstRun } from '../../../apps/web/src/lib/first-run.ts';
import { words as signupWords } from '../../../apps/web/src/routes/signup/words.ts';
import { propose } from '../../../apps/web/src/lib/start/propose.ts';
import { answer, oneQuestion } from '../../../apps/web/src/lib/start/question.ts';
import { browserCurrencyEnv, currencyChoices } from '../../../apps/web/src/routes/start/building.ts';
import { accept } from '../../../apps/web/src/routes/start/accept.ts';
import { caseOf, keepsCurrency } from '../../../apps/web/src/routes/start/preview.ts';
import { INSTALL_ORDER } from '../../../apps/web/src/lib/shape.ts';
import { tellRead } from '../../../apps/web/src/lib/tell/read.ts';
import { countWord, showTell, wantMore } from '../../../apps/web/src/lib/home/first-today.ts';
import { checkout, openOwned, startSignup, verifySignup } from '../../../apps/web/src/lib/signup.ts';
import { apiBase, BASE } from '../../../apps/web/src/lib/at.ts';
import { createClient } from '../../../packages/client/src/index.ts';

export const DAY_MS = 86_400_000;

/** The seven steps, in the mockup's order, by the words a person reads on each. */
export const STEPS = [
  { n: 1, id: 'who', name: 'Who are you?' },
  { n: 2, id: 'heard', name: 'Her words light up' },
  { n: 3, id: 'question', name: 'One question' },
  { n: 4, id: 'keep', name: 'Keep it' },
  { n: 5, id: 'tell', name: 'Tell it one real thing' },
  { n: 6, id: 'today', name: 'Her first Today' },
  { n: 7, id: 'offer', name: 'A page for her pattern' },
];

/** Words the first run never says (USE-B01): a tour, a checklist, a progress count. */
const NEVER = /\b(tour|checklist|getting started)\b|\b\d+ of \d+\b/iu;

/** Every string a words object holds, functions called with a stand-in, so a check reads the copy as drawn. */
export function copyOf(obj) {
  const out = [];
  for (const v of Object.values(obj ?? {})) {
    if (typeof v === 'string') out.push(v);
    else if (Array.isArray(v)) out.push(...v.filter((x) => typeof x === 'string'));
    else if (typeof v === 'function') {
      try {
        const said = v(1, 'Orders', 1);
        if (typeof said === 'string') out.push(said);
      } catch {
        /* a function that needs more than a stand-in says nothing here */
      }
    }
  }
  return out;
}

const pass = (id, saw) => ({ id, pass: true, saw });
const fail = (id, saw) => ({ id, pass: false, saw });

/* ── the pure checks, one a step ──────────────────────────────────────────────────────────────────────── */

export const expect = {
  /**
   * Step 1. The first screen asks "Who are you?", offers the person's starting point among the five, and makes the three
   * promises: free with no card, nothing saved until it is kept, and theirs to export or move. `seen.copy` is every
   * sentence the sign-up screen draws; `seen.question` and `seen.chips` are its heading and chips.
   */
  who(seen, person) {
    const missing = [];
    if (seen.question !== person.expect.who.question) missing.push(`the question reads "${seen.question}"`);
    const chips = seen.chips ?? [];
    if (!chips.includes(person.chip)) missing.push(`no "${person.chip}" among ${chips.length} starting points`);
    if (chips.length !== person.expect.who.chips) missing.push(`${chips.length} starting points, not ${person.expect.who.chips}`);
    const text = (seen.copy ?? []).join('\n');
    for (const p of person.expect.who.promises) if (!new RegExp(p.match, 'iu').test(text)) missing.push(`no promise "${p.says}"`);
    const never = (seen.copy ?? []).find((s) => NEVER.test(s));
    if (never !== undefined) missing.push(`it says "${never}"`);
    return missing.length === 0
      ? pass('who', `"${seen.question}", ${chips.length} starting points with "${person.chip}", ${person.expect.who.promises.length} promises`)
      : fail('who', missing.join('; '));
  },

  /**
   * Step 2. Her words light up, each mapped to a place, the place Today first, her name as "you", the record titled
   * from what she said, and no sample entry. `seen.proposal` is the rules reading of `person.said`.
   */
  heard(seen, person) {
    const p = seen.proposal;
    const want = person.expect.heard;
    const missing = [];
    if (p.usecase !== want.usecase) missing.push(`read as ${p.usecase ?? 'nothing'}, not ${want.usecase}`);
    const you = p.heard.find((h) => h.you === true);
    if (!you || you.phrase !== person.name) missing.push(`her name is not "you" (heard ${you?.phrase ?? 'no name'})`);
    const unlit = p.heard.filter((h) => !Array.isArray(h.at) || person.said.slice(h.at[0], h.at[1]) !== h.phrase);
    if (unlit.length > 0) missing.push(`${unlit.length} heard words not lit where she typed them ("${unlit[0].phrase}")`);
    for (const phrase of want.lit) if (!p.heard.some((h) => h.phrase === phrase)) missing.push(`"${phrase}" not lit`);
    if (p.title !== want.title) missing.push(`titled ${p.title === null ? 'nothing' : `"${p.title}"`}, not "${want.title}"`);
    const places = p.places.map((x) => x.name);
    if (places[0] !== 'Today') missing.push(`the first place is ${places[0] ?? 'none'}, not Today`);
    for (const name of want.places) if (!places.includes(name)) missing.push(`no ${name} among the places`);
    if (p.rows.length > 0) missing.push(`${p.rows.length} entries made from the sentence before anything is kept`);
    return missing.length === 0
      ? pass('heard', `${p.heard.length} phrases lit, "${you.phrase}" is you, "${p.title}", places ${places.join(', ')}, no sample entries`)
      : fail('heard', missing.join('; '));
  },

  /**
   * Step 3. Exactly one question it could not guess, its answers each saying what they mean, and the line that it is the
   * only one. `seen.asked` is the question, `seen.after` the proposal answered, `seen.again` what is asked after it.
   */
  question(seen, person) {
    const q = seen.asked;
    const want = person.expect.question;
    if (q === null) return fail('question', 'no question was asked');
    const missing = [];
    if (q.about !== want.about) missing.push(`it asked about ${q.about}, not ${want.about}`);
    if (q.choices.length !== want.choices) missing.push(`${q.choices.length} answers, not ${want.choices}`);
    const bare = q.choices.filter((c) => typeof c.means !== 'string' || c.means === '');
    if (bare.length > 0) missing.push(`"${bare[0].label}" says nothing of what it means`);
    if (!/only question/iu.test(q.only ?? '')) missing.push('it does not say it is the only question');
    if (seen.after?.answers?.[want.about] !== person.answer) missing.push(`"${person.answer}" was not kept as the answer`);
    if (seen.again !== null) missing.push(`a second question followed: "${seen.again.question}"`);
    return missing.length === 0
      ? pass('question', `"${q.question}", ${q.choices.length} answers each saying what it means; she answered ${person.answer}, and nothing more was asked`)
      : fail('question', missing.join('; '));
  },

  /**
   * Step 4. Keep it: the mailed link spent and the record made, then the build she saw kept. `seen.door` is how the
   * record was opened: `signup` (walked), `self-host` (the owner door, sign-up not walked) or `refused`, with `seen.why`.
   * `seen.failed` is what `accept` could not make, `seen.lists` the lists `boot` holds after, `seen.people` People's names,
   * `seen.examples` how many entries carry the tag `example`. A build that fails is red wherever the record came from.
   */
  keep(seen, person) {
    const want = person.expect.keep;
    const missing = [];
    if (seen.door === 'refused') missing.push(`sign-up refused: ${seen.why}`);
    if (seen.failed.length > 0) missing.push(`the build said "${seen.failed[0].said}" (${seen.failed[0].why})`);
    for (const id of want.lists) if (!seen.lists.includes(id)) missing.push(`no ${id} on the record`);
    if (seen.people.length !== 1 || seen.people[0] !== person.name) missing.push(`People holds ${seen.people.length === 0 ? 'nobody' : seen.people.join(', ')}, not her alone`);
    if (seen.examples > 0) missing.push(`${seen.examples} entries tagged example`);
    if (seen.currency !== want.currency) missing.push(`the record's currency is ${seen.currency ?? 'none'}, not ${want.currency}`);
    if (missing.length > 0) return fail('keep', missing.join('; '));
    const built = `built ${want.lists.join(', ')}, People holds ${person.name} alone, in ${seen.currency}`;
    if (seen.door === 'self-host') return { id: 'keep', pass: null, saw: `sign-up not walked: self-host; opened through the owner door, ${built}` };
    return pass('keep', `the mailed link made "${seen.title}", ${built}`);
  },

  /**
   * Step 5. One real thing: previewed as several entries across lists, nothing added until the press, all added under
   * one batch, and one Undo takes every one back. `seen.preview` is `tellRead`'s answer; `seen.counts` are the lists'
   * counts before the preview, after it, after the press and after the Undo; `seen.made` and `seen.batch` the capture's;
   * `seen.kept` the entries it made still there after the Undo.
   */
  tell(seen, person) {
    const want = person.expect.tell;
    const rows = seen.preview?.rows ?? [];
    const missing = [];
    const lists = rows.map((r) => r.register);
    if (lists.join(',') !== want.lists.join(',')) missing.push(`the preview is ${lists.join(', ') || 'empty'}, not ${want.lists.join(', ')}`);
    const needs = rows.filter((r) => r.missing.length > 0);
    if (needs.length > 0) missing.push(`"${needs[0].said}" needs ${needs[0].missing.join(' and ')}, so Add is held`);
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    if (!same(seen.counts.before, seen.counts.previewed)) missing.push('something was written before the press');
    if (seen.refused) missing.push(`the press was refused: ${seen.refused}`);
    else {
      if (typeof seen.batch !== 'string' || seen.batch === '') missing.push('the press answered no batch, so no one Undo');
      if ((seen.made ?? []).length !== rows.length - needs.length) missing.push(`${(seen.made ?? []).length} added of ${rows.length - needs.length}`);
      const grew = Object.entries(seen.counts.added ?? {}).reduce((n, [id, c]) => n + c - (seen.counts.before[id] ?? 0), 0);
      if (grew !== (seen.made ?? []).length) missing.push(`the press answered ${(seen.made ?? []).length} added, but the lists grew by ${grew}`);
      if ((seen.kept ?? []).length > 0) missing.push(`the one Undo left "${seen.kept[0].title}" in ${seen.kept[0].register}`);
      const more = Object.entries(seen.counts.undone ?? {}).filter(([id, c]) => c !== (seen.counts.before[id] ?? 0));
      if (more.length > 0) missing.push(`after the one Undo, ${more.map(([id, c]) => `${id} holds ${c}, was ${seen.counts.before[id] ?? 0}`).join(', ')}`);
      if (seen.undoRefused) missing.push(`the Undo was refused: ${seen.undoRefused}`);
    }
    return missing.length === 0
      ? pass('tell', `${rows.map((r) => r.said).join(' / ')}; nothing added before the press, ${countWord(seen.made.length)} added as one, and one Undo took all ${countWord(seen.made.length)} back`)
      : fail('tell', missing.join('; '));
  },

  /**
   * Step 6. Her first Today, from `boot`: the card to tell it one thing gone once she has, the next steps in the order
   * her answer puts them, a Hide that hides them, and no offer drawn from use on her first day.
   */
  today(seen, person) {
    const want = person.expect.today;
    const missing = [];
    if (!seen.ok) return fail('today', `boot was refused: ${seen.why}`);
    if (seen.tellShown) missing.push('the card to tell it one thing is still up after she told it');
    const first = seen.steps[0];
    const firstSaid = first ? (first.kind === 'source' ? first.source.name : first.agent.name) : null;
    if (!first || first.kind !== want.first) missing.push(`the first next step is ${firstSaid ?? 'none'}, not the ${want.first} her answer puts first`);
    if (seen.hiddenSteps.length > 0) missing.push(`Hide left ${seen.hiddenSteps.length} next steps up`);
    for (const id of want.lists) if (!seen.lists.includes(id)) missing.push(`no ${id} in boot`);
    if (seen.offers.length > 0) missing.push(`offered "${seen.offers[0].title}" on her first day`);
    return missing.length === 0
      ? pass('today', `the card gone, next steps "${seen.steps.map((s) => (s.kind === 'source' ? s.source.name : s.agent.name)).join('", "')}", Hide hides them, no offer on day 0`)
      : fail('today', missing.join('; '));
  },

  /**
   * Step 7. Later, Slash offers a page for her pattern: nothing on day 13, then on day 15, with Orders read on three
   * weeks and four orders due this week, the pen holds `week:orders`, saying why in her own list's words.
   */
  offer(seen, person) {
    const want = person.expect.offer;
    const missing = [];
    const early = seen.early.filter((x) => x.id === want.id);
    if (early.length > 0) missing.push(`offered on day ${seen.earlyDay}, before day 14`);
    const late = seen.late.find((x) => x.id === want.id);
    if (!late) missing.push(`nothing for Orders on day ${seen.lateDay} (the pen held ${seen.late.map((x) => x.id).join(', ') || 'nothing'}, Orders read on ${seen.weeks} weeks, ${seen.thisWeek} due this week)`);
    else if (!/\S/u.test(late.why ?? '') || /\brows?\b/u.test(late.why)) missing.push(`its why says "${late.why}"`);
    return missing.length === 0
      ? pass('offer', `nothing on day ${seen.earlyDay}; on day ${seen.lateDay}, "${late.title}": ${late.why}`)
      : fail('offer', missing.join('; '));
  },
};

/* ── the browser's doors ──────────────────────────────────────────────────────────────────────────────── */

/**
 * A tab at `origin`: every request carries the session cookie it was given and, on a write, the `Origin` the host checks,
 * as a browser sends them. A `Set-Cookie` with the session is kept, so a rotated cookie is the next request's.
 */
export function tab(origin) {
  let cookie = null;
  const io = async (url, init = {}) => {
    const method = (init.method ?? 'GET').toUpperCase();
    const headers = new Headers(init.headers);
    if (cookie !== null) headers.set('cookie', cookie);
    if (method !== 'GET' && method !== 'HEAD') headers.set('origin', origin);
    const res = await fetch(String(url), { ...init, method, headers });
    for (const c of res.headers.getSetCookie()) {
      const kept = /^((?:__Host-)?bd_s=[^;]+)/u.exec(c)?.[1];
      if (kept) cookie = kept;
    }
    return res;
  };
  const post = async (path, body) => {
    const res = await io(`${origin}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const raw = await res.text();
    let json = null;
    try {
      json = raw === '' ? null : JSON.parse(raw);
    } catch {
      json = null;
    }
    return { status: res.status, body: json };
  };
  /* THE SIGN-UP PAGE'S OWN CALLS (`lib/signup.ts`) take a path and an `Io`, as the page hands them `fetch`. */
  const web = { fetch: (path, init) => io(`${origin}${path}`, init) };
  return { io, post, web, signedIn: () => cookie !== null, client: (base = origin) => createClient({ base, fetch: io }) };
}

/** The value of a record answer, or `null` with why it was refused kept on `out.why`. */
const valueOf = (out) => (out?.ok ? out.value : null);
const whyOf = (out) => (out?.ok ? '' : `${out?.refusal?.code ?? 'no answer'}: ${out?.refusal?.fix ?? ''}`);

/** Each list's count, from `boot`, as Today reads them. */
const countsOf = (boot) => Object.fromEntries((boot?.registers ?? []).map((r) => [r.id, r.count]).sort(([a], [b]) => a.localeCompare(b)));

/** A list as the card reads it (`TellList`), from the record's `schema` answer, as the tab learns it. */
async function tellListOf(client, id) {
  const d = valueOf(await client.schema(id));
  if (!d || !Array.isArray(d.fields)) return null;
  return { id, name: d.name ?? id, ...(d.one ? { one: d.one } : {}), title: d.title, fields: d.fields, ...(d.state ? { state: d.state } : {}), ...(d.icon ? { icon: d.icon } : {}) };
}

/** Every live entry of a list as `{ seq, name }`, for the card's people and accounts. */
async function knownOf(client, register) {
  const page = valueOf(await client.list({ register, limit: 200 }));
  return (page?.rows ?? []).map((r) => ({ seq: r.seq, name: String(r.fields?.name ?? r.fields?.what ?? '') }));
}

/** What the card would show for `sentence` on the record as it stands, and what one press sends. */
async function readOn(client, sentence, today, boot) {
  const lists = (await Promise.all((boot.registers ?? []).map((r) => tellListOf(client, r.id)))).filter((x) => x !== null);
  const held = new Set(lists.map((l) => l.id));
  const people = held.has('people') ? await knownOf(client, 'people') : [];
  const accounts = held.has('accounts') ? await knownOf(client, 'accounts') : [];
  return tellRead(sentence, { lists, today, currency: boot.currency ?? null, people, accounts });
}

/** The day `ms` falls on, `YYYY-MM-DD`, in UTC as the record keeps it. */
const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);

/* ── the walk ─────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * Step 4's doors: sign up with the mailed link as the sign-up page does (`routes/signup/+page.svelte` `verify` and
 * `makeFree`: spend the link, make the free record with `checkout`, open it with `openOwned`, and reach it under its own
 * name), or, on a host that has no sign-up and says how its owner gets in (`host.owner`), that door. Answers how the
 * record was opened, the tab signed in to it, and the base its calls go to.
 */
async function keepIt(host, person, title) {
  const t = tab(host.origin);
  const refused = (why) => ({ t, door: 'refused', why });
  const started = await startSignup({ email: person.email, slug: person.slug, name: title, tz: person.zone }, t.web);
  if (started.ok) {
    const link = host.sink ? await host.sink.linkFor(person.email) : null;
    if (!link) return refused('no link reached the mailbox');
    const token = new URLSearchParams(new URL(link).hash.slice(1)).get('verify');
    if (!token) return refused('the mail held a sign-in link, not a new record\'s, so this address already has an account');
    const verified = await verifySignup(token, t.web);
    if (!verified.ok) return refused(`the link was refused: ${verified.fix ?? verified.kind}`);
    const made = await checkout({ slug: verified.value.slug, name: verified.value.name, tz: verified.value.tz, plan: 'free' }, t.web);
    if (!made.ok) return refused(`the free record was not made: ${made.fix ?? made.kind}`);
    const opened = await openOwned(verified.value.slug, t.web);
    if (!opened.ok) return refused(`the new record did not open: ${opened.fix ?? opened.kind}`);
    return { t, door: 'signup', base: apiBase({ origin: host.origin, pathname: `${BASE}/${verified.value.slug}/` }) };
  }
  if (!host.owner) return refused(started.fix ?? started.kind);
  const opened = await host.owner(t, person, title);
  return opened === true ? { t, door: 'self-host', base: host.origin } : refused(`the owner door: ${opened}`);
}

/**
 * NOTHING IS WRITTEN TO A RECORD THIS WALK DID NOT JUST MAKE: before the build, the record the tab is in must carry the
 * person's name and hold no entry at all. A tab that landed anywhere else is refused here, before the first write.
 */
export function notMine(boot, person) {
  if (!boot) return 'the record it opened did not answer';
  const held = (boot.registers ?? []).reduce((n, r) => n + r.count, 0);
  if (boot.record?.slug !== person.slug) return `the tab is in ${boot.record?.name ?? 'a record with no name'}, not ${person.slug}, so nothing was written to it`;
  if (held > 0) return `${boot.record.name} already holds ${countWord(held)} entries, so this walk did not just make it, and nothing was written to it`;
  return null;
}

/** One press of the card: what it would show, then what it adds. Rows the screen holds back, and any that lean on one, are not sent. */
async function press(client, preview) {
  const keep = new Map();
  const rows = [];
  preview.rows.forEach((r, i) => {
    const leans = Object.values(r.fields).some((v) => v !== null && typeof v === 'object' && '$row' in v && !keep.has(v.$row));
    if (r.missing.length > 0 || leans) return;
    keep.set(i, rows.length);
    const fields = Object.fromEntries(Object.entries(r.fields).map(([k, v]) => [k, v !== null && typeof v === 'object' && '$row' in v ? { $row: keep.get(v.$row) } : v]));
    rows.push({ register: r.register, fields });
  });
  if (rows.length === 0) return { refused: 'nothing the card could add' };
  const out = await client.capture({ rows });
  return out.ok ? { batch: out.value.batch, made: out.value.made } : { refused: whyOf(out) };
}

/**
 * Walk the seven steps for `person` on `host` and answer one result a step, in order. A step whose doors are not there
 * is red and the walk goes on where it can, so one run names every step that is broken.
 *
 * `host` is `{ origin, sink?, owner?, advance?(days), close() }`: `selfHost` makes one; a caller may hand in another.
 * `say` is told each line as it is decided.
 */
export async function walk(person, host, say = () => {}) {
  const out = [];
  const step = (r) => {
    out.push(r);
    say(r);
    return r;
  };
  const env = browserCurrencyEnv(person.locale, person.languages, person.zone);
  const today = () => dayOf(host.now());

  /* 1. Who are you? */
  step(expect.who({ question: firstRun.whoQuestion, chips: firstRun.whoChips ?? [], copy: [...copyOf(signupWords), ...copyOf(firstRun)] }, person));

  /* 2. Her words light up. */
  const proposal = propose(person.said, { zone: person.zone, locale: person.locale });
  step(expect.heard({ proposal }, person));

  /* 3. One question. */
  const asked = oneQuestion(proposal, person.said, env);
  const after = asked === null ? proposal : answer(proposal, asked.about, person.answer, person.said);
  step(expect.question({ asked, after, again: asked === null ? null : oneQuestion(after, person.said, env) }, person));

  /* 4. Keep it, and the build she saw kept. */
  let opened = await keepIt(host, person, after.title ?? person.name);
  const client = opened.t.client(opened.base);
  if (opened.door !== 'refused') {
    const why = notMine(valueOf(await client.boot()), person);
    if (why !== null) opened = { ...opened, door: 'refused', why };
  }
  let failed = [];
  if (opened.door !== 'refused') {
    /* THE SIGN-UP PAGE'S OWN BUILD (`routes/signup/+page.svelte` `build`): the use case and the ones beside it, every
       module either stands on, in install order, and the currency the page's currency step offers first. */
    const one = caseOf(after.usecase);
    const beside = one ? after.also.flatMap((id) => caseOf(id) ?? []) : [];
    const wanted = new Set([...after.modules, ...[one, ...beside].flatMap((c) => c?.modules ?? [])]);
    const modules = [...new Set([...INSTALL_ORDER, ...wanted])].filter((id) => wanted.has(id));
    const offered = currencyChoices(person.said, env).suggested ?? null;
    const made = await accept(client, {
      sentence: person.said,
      proposal: after,
      usecase: one?.usecase ?? null,
      also: beside.map((b) => b.usecase),
      modules,
      currency: modules.some(keepsCurrency) ? (after.currency ?? offered) : null,
      today: today(),
      email: person.email,
      nav: [],
      locale: person.locale,
    });
    failed = made.failed;
  }
  let boot = opened.door === 'refused' ? null : valueOf(await client.boot());
  const lists = (boot?.registers ?? []).map((r) => r.id);
  const people = opened.door === 'refused' ? [] : await knownOf(client, 'people');
  let examples = 0;
  for (const id of opened.door === 'refused' ? [] : lists) {
    const page = valueOf(await client.list({ register: id, limit: 200 }));
    examples += (page?.rows ?? []).filter((r) => JSON.stringify(r.fields?.tags ?? r.tags ?? []).includes('"example"')).length;
  }
  step(expect.keep({ door: opened.door, why: opened.why, failed, lists, people: people.map((p) => p.name), examples, currency: boot?.currency ?? null, title: boot?.record?.name }, person));
  if (!boot) {
    for (const s of STEPS.slice(4)) step(fail(s.id, `not reached: ${opened.door === 'refused' ? opened.why : 'boot was refused'}`));
    return out;
  }

  /* 5. Tell it one real thing: the preview, the press, its one Undo, then the press again, as she keeps it. */
  const counts = { before: countsOf(boot) };
  const preview = await readOn(client, person.first, today(), boot);
  counts.previewed = countsOf(valueOf(await client.boot()));
  const pressed = await press(client, preview);
  counts.added = countsOf(valueOf(await client.boot()));
  let undoRefused = null;
  if (pressed.batch) {
    const plan = await client.undo({ batch: pressed.batch, dry: true });
    const done = plan.ok ? await client.undo({ batch: pressed.batch, hash: plan.value.hash }) : plan;
    if (!done.ok) undoRefused = whyOf(done);
  }
  counts.undone = countsOf(valueOf(await client.boot()));
  /* EACH ENTRY THE PRESS MADE, LOOKED FOR BY ITS NUMBER: counts alone would pass an Undo that took back the wrong one. */
  const kept = [];
  for (const m of pressed.made ?? []) if ((await knownOf(client, m.register)).some((e) => e.seq === m.seq)) kept.push(m);
  step(expect.tell({ preview, counts, ...pressed, kept, undoRefused }, person));
  await press(client, await readOn(client, person.first, today(), valueOf(await client.boot())));

  /* 6. Her first Today, from `boot`, with this device's answer: where her orders come in. */
  boot = valueOf(await client.boot());
  const pref = { arrivesBy: person.answer };
  const bootOk = boot !== null;
  step(
    expect.today(
      {
        ok: bootOk,
        why: 'no answer',
        tellShown: bootOk && showTell(boot, pref),
        steps: bootOk ? wantMore(boot, pref) : [],
        hiddenSteps: bootOk ? wantMore(boot, { ...pref, nextStepsHidden: true }) : [],
        lists: (boot?.registers ?? []).map((r) => r.id),
        offers: (boot?.pen ?? []).filter((x) => x.id.startsWith('week:')),
      },
      person,
    ),
  );

  /* 7. Later. Orders read once a week, the orders she tells on the way, the pen read on day 13 and on day 15. */
  if (!host.advance) {
    step({ id: 'offer', pass: null, saw: 'not walked: this host keeps the real clock, so day 15 is a standing record' });
    return out;
  }
  const want = person.expect.offer;
  const readOrders = () => client.list({ register: 'orders', limit: 50 });
  let day = 0;
  const weeks = new Set();
  const read = async () => {
    await readOrders();
    const d = new Date(host.now());
    weeks.add(dayOf(host.now() - ((d.getUTCDay() + 6) % 7) * DAY_MS));
  };
  const tell = async (sentence) => press(client, await readOn(client, sentence, today(), valueOf(await client.boot())));
  const to = async (n) => {
    host.advance(n - day);
    day = n;
  };
  await read();
  let thisWeek = 0;
  let early = [];
  for (const later of person.later) {
    if (later.day > want.before && day <= want.before) {
      await to(want.before);
      early = valueOf(await client.boot())?.pen ?? [];
    }
    await to(later.day);
    for (const sentence of later.said) {
      const made = await tell(sentence);
      if (later.day === want.after) thisWeek += (made.made ?? []).filter((m) => m.register === 'orders').length;
    }
    await read();
  }
  if (day < want.after) await to(want.after);
  const late = valueOf(await client.boot())?.pen ?? [];
  step(expect.offer({ early, earlyDay: want.before, late, lateDay: want.after, weeks: weeks.size, thisWeek }, person));
  return out;
}

/* ── a fresh self-host, and the line a step prints ───────────────────────────────────────────────────── */

/**
 * A fresh self-host on its own clock, started as `packs/portfolio-bands/bands.test.ts` starts one: a new folder, a
 * loopback port, nothing sent outside, and the clock the walk moves. Mail goes to a sink the walk reads. It has no
 * sign-up, so `owner` opens the record as `braindog init` makes one and its owner signs in, with the server key.
 */
export async function selfHost(person) {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { randomBytes } = await import('node:crypto');
  const { start } = await import('../../../apps/selfhost/src/server.ts');
  const dir = mkdtempSync(join(tmpdir(), 'braindog-people-'));
  let clock = Date.parse(person.start);
  const box = [];
  const serverKey = randomBytes(32).toString('base64url');
  const running = await start({
    file: join(dir, 'record.brain'),
    directory: join(dir, 'directory.sqlite'),
    port: 0,
    host: '127.0.0.1',
    token: serverKey,
    sessionKey: new Uint8Array(randomBytes(32)),
    now: () => clock,
    pollMs: 0,
    limits: null,
    mail: (to, link, kind) => void box.push({ to, link, kind }),
    actions: { openKey: async () => null, send: async () => new Response('{}'), resolve: async () => [] },
  });
  const origin = `http://localhost:${running.server.address().port}`;
  return {
    origin,
    now: () => clock,
    advance: (days) => void (clock += days * DAY_MS),
    sink: { linkFor: async (email) => box.filter((m) => m.to === email).at(-1)?.link ?? null },
    async owner(t, who, title) {
      const person = running.directory.person$(who.email, who.name);
      if (!person.ok) return `the Directory refused ${who.name}`;
      const rec = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
      const made = await running.api.createRecord({ id: rec, slug: who.slug, name: title, tz: who.zone, locale: who.locale, owner: { id: person.value.id, email: who.email, name: who.name } });
      if (!made.ok) return whyOf(made);
      if (!running.directory.provision({ slug: who.slug, email: who.email, record: rec }).ok) return 'the Directory did not name the record';
      const signed = await t.post('/auth/token', { serverKey });
      return signed.status === 200 && t.signedIn() ? true : `${signed.status} ${signed.body?.refusal?.fix ?? ''}`;
    },
    async close() {
      await running.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** One step as one line: its number and name, green, red or not walked, and what it saw. Coloured on a terminal. */
export function lineOf(r, colour = false) {
  const s = STEPS.find((x) => x.id === r.id);
  const [word, code] = r.pass === true ? ['green', 32] : r.pass === false ? ['red', 31] : ['not walked', 33];
  const mark = colour ? `\u001b[${code}m${word}\u001b[0m` : word;
  return `${s.n}. ${s.name}: ${mark}. ${r.saw}`;
}

/**
 * A host already running at `origin`, on the real clock: production after his deploy word, or a self-host somebody
 * started. The mailed link is read from `linkFile`, which whoever reads the test mailbox writes the link into; the walk
 * waits up to five minutes for it. Day 15 is not walked here, since the clock is the real one.
 */
export function deployed(origin, linkFile) {
  return {
    origin: origin.replace(/\/+$/u, ''),
    now: () => Date.now(),
    sink: {
      async linkFor() {
        const { existsSync, readFileSync } = await import('node:fs');
        for (let i = 0; i < 300; i++) {
          const said = linkFile && existsSync(linkFile) ? readFileSync(linkFile, 'utf8').trim() : '';
          if (said !== '') return said;
          await new Promise((r) => setTimeout(r, 1_000));
        }
        return null;
      },
    },
    async close() {},
  };
}

/*
 * `node tools/people/expect/first-run.mjs [person.json]`: Mariam by default, on a fresh self-host.
 * `--base <origin> --link-file <path>`: on a host already running, the mailed link read from that file. Red exits 1.
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  const { readFileSync } = await import('node:fs');
  const args = process.argv.slice(2);
  const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
  const file = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--')) ?? new URL('../mariam.json', import.meta.url).pathname;
  const person = JSON.parse(readFileSync(file, 'utf8'));
  const base = flag('--base');
  const host = base ? deployed(base, flag('--link-file')) : await selfHost(person);
  let red = false;
  try {
    await walk(person, host, (r) => {
      if (r.pass === false) red = true;
      console.log(lineOf(r, process.stdout.isTTY === true));
    });
  } finally {
    await host.close();
  }
  process.exit(red ? 1 : 0);
}

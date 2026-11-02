#!/usr/bin/env node
/**
 * Maya Okafor's demo BrainDog, made on a host: the record directory reviewers, the demo video and anyone shown the
 * product sign in to (launch F25). She is the site's invented founder (`apps/site/src/lib/demo/maya.ts`); nobody real.
 *
 *   node apps/cli/scripts/demo-record.mjs plan
 *       what it would write for today and what those rows add up to; nothing is sent
 *   node apps/cli/scripts/demo-record.mjs make [--host https://app.brain.dog] [--slug maya-demo] [--email maya@brain.dog]
 *                                              [--reviewer review@brain.dog] [--tz America/New_York] [--again]
 *       makes the record and fills it: projects, people, three months of money, bills, plans, to-dos, news, key numbers,
 *       learnings, Today's widgets, and her three agents connected, each with a run, notes and a question for her
 *   BRAINDOG_TOKEN=<server key> node apps/cli/scripts/demo-record.mjs make --self-host --host http://127.0.0.1:8787 --reviewer none
 *       the same rows into a self-host's own record, made with `braindog init`, signed in with its server key
 *   node apps/cli/scripts/demo-record.mjs reviewer-link [--host ...] [--email review@brain.dog]
 *       a 24-hour sign-in link for the reviewer, who can read Maya's record and change nothing
 *   node apps/cli/scripts/demo-record.mjs owner-link [--host ...] [--email maya@brain.dog]
 *       a 24-hour sign-in link as Maya herself, for recording the video
 *
 * ONE SIGN-IN, THE ONE EVERY RECORD HAS. Nothing here is a second way in. The record is made the way the operator makes
 * any record (`/auth/provision`, behind `PROVISION_KEY`), which hands back a claim link; this spends that link at once,
 * as a person opening it would, and fills the record with the session it gives, which is Maya's as owner. The reviewer
 * is a member at `read`, invited from that session with the invitation every owner sends (`invite`), and comes back
 * with a claim link the operator mints for their address (`/auth/claim/mint`), which is the operator's own way to sign
 * somebody in who has no mailbox to hand. A reviewer reads every list and changes nothing, because `read` is what the
 * record holds them to, on every call.
 *
 * THE AGENTS ARE REAL KEYS ON HER RECORD. Claude, Cursor and ChatGPT each get a key at `write`, made from her session
 * as Settings makes one, and write as themselves: a run with its step, a note on a project, a learning, and the
 * questions on Needs you. A new agent stands at Ask on every kind of change, so what they would change waits for her.
 * The keys are used for this run and never printed.
 *
 * `PROVISION_KEY` comes from the environment or the keychain (`braindog-provision-key`), and is never printed. Neither
 * is a session or an agent's key. The only links printed are the ones a person is meant to open: the reviewer's
 * invitation once, and a sign-in link when one is asked for.
 *
 * RUN TWICE THE SAME DAY, IT FINISHES WHAT WAS CUT OFF: `--again` signs in to the record already made, and every row
 * carries an `op_id` from its key, so a row already written is found again, not written twice. On another day the
 * dates have moved, so make a new record (`--slug`) rather than fill an old one.
 *
 * Exit codes: 0 done, 1 a step refused (named, with the record's own sentence), 2 a bad command line or no key.
 */

import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';

import { modulesFor, useCase } from '@braindog/seed/usecases';
import { SEED_WIDGETS } from '@braindog/seed';

import { mayaRecord, todayIn } from './demo/maya-record.mjs';

const USAGE = `node apps/cli/scripts/demo-record.mjs plan | make [--host <url>] [--slug <slug>] [--email <address>] [--reviewer <address>] [--tz <zone>] [--again] [--self-host] | reviewer-link [--host <url>] [--email <address>] | owner-link [--host <url>] [--email <address>]`;
const DEFAULTS = { host: 'https://app.brain.dog', slug: 'maya-demo', email: 'maya@brain.dog', reviewer: 'review@brain.dog', tz: 'America/New_York' };
/** The modules a founder starts with, and the ones her rows need beside them. */
const ALSO = ['people', 'estate', 'work', 'agents'];

const say = (line = '') => console.log(line);
const money = (cents) => `${cents < 0 ? '-' : ''}$${(Math.abs(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

class Refused extends Error {
  constructor(step, refusal) {
    super(`${step}: ${refusal?.fix ?? refusal?.code ?? 'refused'}${refusal?.at ? ` (at ${refusal.at})` : ''}`);
    this.refusal = refusal;
  }
}

/* ── THE OPERATOR'S KEY ───────────────────────────────────────────────────────────────────────────────────────────── */

function operatorKey() {
  const env = (process.env.PROVISION_KEY ?? '').trim();
  if (env) return env;
  try {
    return execFileSync('security', ['find-generic-password', '-s', 'braindog-provision-key', '-w'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

/* ── ONE HOST ─────────────────────────────────────────────────────────────────────────────────────────────────────── */

/** A host's doors: the operator's, sign-in, and the record's API as a session or as an agent's key. */
function hostAt(url) {
  const origin = new URL(url).origin;
  /* `Origin` WITH A SESSION AND ON THE SIGN-IN DOORS, as a page sends it; never with a bearer, which no page holds. */
  const send = async (path, body, headers = {}, tries = 0) => {
    const res = await fetch(`${origin}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', ...(headers.authorization ? {} : { origin }), ...headers },
      body: JSON.stringify(body ?? {}),
      signal: AbortSignal.timeout(60_000),
    });
    /* A HOST THAT SAYS SLOW DOWN IS WAITED ON, as long as it says, and asked again: hundreds of writes in a row meet
       the same limit any client does. */
    if (res.status === 429 && tries < 20) {
      const said = Number(res.headers.get('retry-after'));
      const text = await res.text().catch(() => '');
      const inText = Number(/in (\d+) seconds?/.exec(text)?.[1]);
      const wait = Math.min(120, Number.isFinite(said) && said > 0 ? said : Number.isFinite(inText) && inText > 0 ? inText : 5);
      await new Promise((done) => setTimeout(done, wait * 1000 + 250));
      return send(path, body, headers, tries + 1);
    }
    let out = null;
    try {
      out = await res.json();
    } catch {
      out = { ok: false, refusal: { code: 'UNREADABLE', fix: `${path} answered ${res.status} with no JSON` } };
    }
    return { status: res.status, out, cookie: res.headers.getSetCookie?.() ?? [] };
  };
  return {
    origin,
    /** The operator's own route, with the key as the bearer. */
    operator: (path, body, key) => send(path, body, { authorization: `Bearer ${key}` }),
    /** Spend a claim link, as the sign-in page does, and keep the session it sets. */
    async claim(token) {
      const { status, out, cookie } = await send('/auth/magic/redeem', { claimToken: token });
      if (status !== 200 || out?.ok === false) throw new Refused('Signing in with the claim link', out?.refusal ?? { fix: `answered ${status}` });
      const kept = cookie.map((c) => c.split(';')[0]).filter((c) => /^(__Host-)?bd_s=/.test(c));
      if (kept.length === 0) throw new Refused('Signing in with the claim link', { fix: 'the host set no session' });
      return kept.join('; ');
    },
    /** A record method, as the person the session or key is. `hints` are an agent's run headers. */
    async call(method, args, as, hints = {}) {
      const headers = as.cookie ? { cookie: as.cookie } : { authorization: `Bearer ${as.bearer}` };
      for (const [k, header] of Object.entries(HINT_HEADERS)) if (hints[k]) headers[header] = hints[k];
      const { status, out } = await send(`/api/${method}`, args, headers);
      if (out?.ok === true) return out.value;
      throw new Refused(method, out?.refusal ?? { fix: `answered ${status}` });
    },
  };
}

/** The run hints an agent's calls carry (`packages/host/src/session.ts`). */
const HINT_HEADERS = { client_id: 'x-braindog-client', agent: 'x-braindog-agent', client: 'x-braindog-client-name', repo: 'x-braindog-repo' };

/** The token in a claim link, `<origin>/signin#claim=<token>`. */
const claimOf = (link) => {
  const at = String(link ?? '').indexOf('#claim=');
  return at < 0 ? null : link.slice(at + '#claim='.length);
};

/* ── WHAT ONE ROW IS SENT AS ──────────────────────────────────────────────────────────────────────────────────────── */

/** `fields` with every `{ $ref }` made the id of the row it names, which was written first. */
function resolved(fields, made) {
  const one = (v) => {
    if (v && typeof v === 'object' && !Array.isArray(v) && typeof v.$ref === 'string') {
      const row = made.get(v.$ref);
      if (!row) throw new Error(`${v.$ref} is pointed at before it was written`);
      return row.id;
    }
    return Array.isArray(v) ? v.map(one) : v;
  };
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, one(v)]));
}

/** A question or a draft a first run already left, which a second run leaves as it is. Anything else still stops. */
const already = (e) => {
  if (e instanceof Refused && /already/i.test(e.refusal?.fix ?? '')) return null;
  throw e;
};

/** A row's spoken name, `tasks#12`, which handoff and a proposal's patch take. */
const spoken = (row) => `${row.register}#${row.seq}`;

/* ── THE COMMANDS ─────────────────────────────────────────────────────────────────────────────────────────────────── */

function printPlan(plan) {
  const by = new Map();
  for (const r of plan.rows) by.set(r.register, (by.get(r.register) ?? 0) + 1);
  const f = plan.figures;
  say(`  Maya Okafor's BrainDog, for ${plan.today}: ${plan.rows.length} rows`);
  say(`    ${[...by].map(([r, n]) => `${n} ${r}`).join(', ')}`);
  say(`    ${plan.categories.length} categories (found by name or made), ${plan.widgets.length} widgets on Today, ${plan.agents.length} agents: ${plan.agents.map((a) => a.label).join(', ')}`);
  say('  What the rows add up to:');
  say(`    cash in the bank   ${money(f.cash)} (${Object.entries(f.accounts).map(([n, c]) => `${n} ${money(c)}`).join(', ')})`);
  say(`    goes out a month   ${money(f.burnPerMonth)} after what comes in, across the ledger`);
  say(`    lasts              ${f.monthsOfCash === null ? 'with nothing going out on balance' : `about ${Math.round(f.monthsOfCash)} months`}`);
  say(`    owed to her        ${money(f.owedToYou)}; late: ${f.late.map((l) => `${l.what} ${money(l.cents)}, ${l.daysLate} days`).join('; ') || 'nothing'}`);
  say(`    she owes           ${money(f.youOwe)}`);
  say(`    Tidepool last month ${money(f.tidepoolLastMonth)}; ${f.ledgerLines} ledger lines from ${f.from}`);
}

async function make(values) {
  /* A SELF-HOST HOLDS ONE RECORD, made by `braindog init`, and its owner is whoever sends its server key. */
  const selfHost = values['self-host'] === true;
  const key = selfHost ? (process.env.BRAINDOG_TOKEN ?? '').trim() : operatorKey();
  if (!key) {
    say(selfHost ? "  No BRAINDOG_TOKEN: export the self-host's server key as BRAINDOG_TOKEN. Nothing was written." : '  No PROVISION_KEY: export it, or put it in the keychain as braindog-provision-key. Nothing was made.');
    return 2;
  }
  const host = hostAt(values.host);
  let plan = mayaRecord(todayIn(values.tz));
  /* A SELF-HOST'S RECORD KEEPS THE ZONE `init` GAVE IT, so its day is read from it and the plan is made for that day:
     a bill due "today" in New York is a day late in Cairo. A record made here is made in `--tz`, so the two agree. */
  if (selfHost) {
    const zone = (await host.call('boot', {}, { bearer: key }).catch(() => null))?.zone;
    if (typeof zone === 'string' && zone !== '' && todayIn(zone) !== plan.today) plan = mayaRecord(todayIn(zone));
  }
  printPlan(plan);
  say(`\n  On ${host.origin}${selfHost ? ', the self-host\'s own record' : `, as ${values.slug} (${values.email})`}:`);

  /* 1. THE RECORD, OR THE ONE ALREADY MADE WITH --again, and a claim link for it, spent at once. */
  let claimed = null;
  if (selfHost) say('    signed in with the server key, as the owner');
  else if (values.again) {
    const { status, out } = await host.operator('/auth/claim/mint', { email: values.email }, key);
    if (status !== 200 || !out?.ok) throw new Refused('Signing in to the record already made', out?.refusal ?? { fix: `answered ${status}` });
    claimed = out.value.claim;
    say('    signed in to the record already made');
  } else {
    const { status, out } = await host.operator('/auth/provision', { slug: values.slug, email: values.email, name: plan.founder.name, tz: values.tz }, key);
    if (status !== 200 || !out?.ok) {
      const r = out?.refusal ?? { fix: `answered ${status}` };
      throw new Refused('Making the record', { ...r, fix: `${r.fix ?? r.code}${/slug|name|taken/i.test(r.fix ?? '') ? ' To finish one made today, add --again; to start over, pick another --slug.' : ''}` });
    }
    claimed = out.value.claim;
    say(`    made the record ${values.slug}`);
  }
  let owner = { bearer: key };
  if (!selfHost) {
    const token = claimOf(claimed);
    if (!token) throw new Refused('Signing in', { fix: 'the claim link had no token in it' });
    owner = { cookie: await host.claim(token) };
    say('    signed in as Maya');
  }

  /* 2. HER STARTER: the founder use case and the modules her rows need, her name, US dollars. Once only. */
  const u = useCase('founder');
  const setupBody = {
    usecase: 'founder',
    packs: { install: modulesFor(u, ALSO) },
    me: { name: plan.founder.name, email: values.email, note: 'Runs Tidepool, Ferment & Co, Northbound and Pocketlab.' },
    settings: [{ values: { home_currency: 'USD' } }],
  };
  let set;
  try {
    set = await host.call('setup', setupBody, owner);
  } catch (e) {
    if (!(e instanceof Refused) || e.refusal?.at !== 'again') throw e;
    set = await host.call('setup', { ...setupBody, again: true }, owner);
  }
  const failed = Array.isArray(set?.failed) ? set.failed : [];
  for (const f of failed) say(`    could not set up ${f.label ?? f.part}: ${f.why ?? ''}`);
  say(`    set up as a founder with ${setupBody.packs.install.join(', ')}`);

  /* A STARTER'S EXAMPLE ROWS ARE NOT HERS: cleared, so every row on the record is the plan's. */
  try {
    const ex = await host.call('examples', {}, owner);
    const n = Array.isArray(ex) ? ex.length : Number(ex?.count ?? ex?.rows ?? 0);
    if (n > 0) {
      await host.call('clearExamples', {}, owner);
      say(`    cleared ${n} example rows`);
    }
  } catch (e) {
    say(`    examples left as they were (${e.message})`);
  }

  /* 3. CATEGORIES BY NAME: the starter's where it has one, else made. */
  const made = new Map();
  const listed = await host.call('list', { register: 'categories', limit: 500 }, owner);
  const have = new Map((listed?.rows ?? listed ?? []).map((r) => [String(r.fields?.name ?? '').toLowerCase(), r]));
  let newCats = 0;
  for (const c of plan.categories) {
    const found = have.get(c.name.toLowerCase());
    if (found) made.set(`cat:${c.name}`, found);
    else {
      const { name, direction, icon, colour, budget, budget_period } = c;
      const row = await host.call('create', { register: 'categories', fields: { name, direction, icon, colour, ...(budget ? { budget, budget_period } : {}) }, op_id: `${values.slug}-cat-${name}` }, owner);
      made.set(`cat:${c.name}`, row);
      newCats += 1;
    }
  }
  say(`    categories: ${plan.categories.length - newCats} found, ${newCats} made`);

  /* 4. EVERY ROW, IN THE PLAN'S ORDER, each pointing at the rows written before it.
     A FIELD THE LIST DOES NOT DECLARE ON THIS RECORD IS LEFT OUT AND SAID, not refused: a link between two add-ons'
     lists (a bill's person, a ledger line's company) is there only where the record holds both halves of it. */
  const declared = new Map();
  for (const id of new Set(plan.rows.map((r) => r.register))) {
    const decl = await host.call('schema', { register: id }, owner);
    declared.set(id, new Set((decl?.fields ?? []).filter((f) => f.retired !== true).map((f) => f.id)));
  }
  /* PEOPLE AND ORGANISATIONS ARE ONE ROW A KEY, refused before an op_id is read, so a second run finds them by name. */
  const named = new Map();
  for (const id of ['people', 'organisations']) {
    const got = await host.call('list', { register: id, limit: 500 }, owner);
    for (const row of got?.rows ?? got ?? []) named.set(`${id}:${String(row.fields?.name ?? '').toLowerCase()}`, row);
  }
  const dropped = new Map();
  const counts = new Map();
  let register = null;
  /* THREE MONTHS OF HISTORY ARE WRITTEN WITH THE LEDGER'S PER-LINE AUTOMATIONS OFF, AND THEY ARE SWITCHED BACK ON AFTER
     (leftovers 2 Nov, 10). Each of her 143 lines started three scripts (filing it in its account's book, finding what it
     paid, and letting it replace a posted line), and a rule may start one script at most 100 times a day
     (`RULE_CALLS_PER_DAY`), so the 101st line onwards failed each of them: 116 failed runs on the day she was made, and
     the hourly look-again then failed too, about 129 a week on Health, Settings and Automations. None of the three has
     work to do on her history: her accounts are in no book, the plan links each paid bill itself (`settles`), and
     nothing is posted for a repeating line yet. Each is the rule's own switch (`setAutomation`), the one Automations
     presses, and a run cut off half way switches them back on in its `finally`. */
  const QUIET = ['entry-takes-book', 'payment-matches', 'posted-replaced'];
  const quieted = [];
  const ledgerLines = plan.rows.filter((r) => r.register === 'transactions').length;
  if (ledgerLines > 0)
    for (const rule of QUIET) {
      const off = await host.call('setAutomation', { rule, enabled: false }, owner).catch(() => null);
      if (off?.changed) quieted.push(rule);
    }
  try {
    for (const r of plan.rows) {
      if (r.register !== register) {
        if (register) say(`    ${counts.get(register)} ${register}`);
        register = r.register;
      }
      const again = named.get(`${r.register}:${String(r.fields.name ?? '').toLowerCase()}`);
      if (again) {
        made.set(r.key, again);
        counts.set(r.register, (counts.get(r.register) ?? 0) + 1);
        continue;
      }
      const has = declared.get(r.register);
      const fields = Object.fromEntries(
        Object.entries(r.fields).filter(([k]) => {
          if (has.has(k)) return true;
          dropped.set(`${r.register}.${k}`, (dropped.get(`${r.register}.${k}`) ?? 0) + 1);
          return false;
        }),
      );
      const row = await host.call('create', { register: r.register, fields: resolved(fields, made), op_id: `${values.slug}-${r.key}` }, owner).catch((e) => {
        throw new Refused(`Writing ${r.label} (${r.register})`, e.refusal ?? { fix: e.message });
      });
      made.set(r.key, row);
      counts.set(r.register, (counts.get(r.register) ?? 0) + 1);
    }
  } finally {
    for (const rule of quieted) await host.call('setAutomation', { rule, enabled: true }, owner).catch(() => say(`    could not switch ${rule} back on: switch it on in Automations`));
  }
  if (register) say(`    ${counts.get(register)} ${register}`);
  if (quieted.length > 0) say(`    wrote the history with ${quieted.length} per-line automations off, and switched them back on`);
  if (dropped.size > 0) say(`    left out, as this record's lists have no such field: ${[...dropped].map(([f, n]) => `${f} (${n})`).join(', ')}`);

  /* 5. TODAY'S WIDGETS, from the gallery, each once. A TODAY THE RECORD DOES NOT KEEP YET is drawn by the app from what
     the record holds, so its first edit sends that body as `base`, made here by the app's own code (`todayHome`), as
     Done on Today makes it. A widget is left out where Today already shows it or one like it (`alike`). */
  const gallery = new Map(SEED_WIDGETS.flatMap((g) => g.widgets).map((w) => [w.id, w]));
  const board = await host.call('arrangement', { page: 'home' }, owner).catch(() => null);
  let base = null;
  let blocks = Array.isArray(board?.body?.blocks) ? board.body.blocks : Array.isArray(board?.blocks) ? board.blocks : null;
  if (blocks === null) {
    const [{ todayHome }, { holdsOf, whileHeld, HOUSE_VOICE }] = await Promise.all([import('../../web/src/lib/home/default-home.ts'), import('../../web/src/lib/page/home-arrange.ts')]);
    const b = await host.call('boot', {}, owner);
    /* THE SHELL AS THE APP BUILDS IT FROM `boot` (`boot-live.ts`), the three parts `holdsOf` reads. The owner holds the
       record whole. */
    const shell = {
      lists: (b.registers ?? []).map((r) => ({ id: r.id, name: r.name, ...(r.kernel === true ? { kernel: true } : {}), ...(typeof r.pack === 'string' ? { pack: r.pack } : {}) })),
      pages: (b.pages ?? []).map((p) => p.slug),
      me: { person: b.me?.person ?? '', level: 'owner', owner: true, records: [], lists: null },
    };
    base = { ...whileHeld(JSON.parse(JSON.stringify(todayHome(holdsOf(shell), HOUSE_VOICE)))), page: 'home' };
    blocks = base.blocks;
  }
  const shown = new Set(blocks.flatMap((b) => [String(b.key ?? ''), String(b.heading ?? '').toLowerCase()]));
  const steps = [];
  for (const w of plan.widgets) {
    const g = gallery.get(w.gallery);
    if (!g || [g.id, ...(g.alike ?? [])].some((k) => shown.has(k)) || shown.has(String(g.block.heading ?? '').toLowerCase())) continue;
    steps.push({ add: { ...structuredClone(g.block), key: `w-${w.gallery.replace(/[^a-z0-9]/g, '').slice(0, 8)}`, size: w.size } });
  }
  if (steps.length > 0 || base !== null) {
    await host.call('boardSteps', { page: 'home', steps, ...(base ? { base } : {}) }, owner);
    say(`    Today: kept, with ${steps.length} widgets added to what it shows`);
  } else say('    Today: every widget was there');

  /* 6. HER AGENTS, each with its own key, writing as itself. */
  /* A KEY AT `write`, as a connected agent's is: its notes and learnings land, and every change it makes to a row still
     asks her first, since a new agent stands at Ask on every kind. A second run replaces the keys the first one made. */
  const keys = await host.call('listTokens', {}, owner).catch(() => []);
  for (const t of Array.isArray(keys) ? keys : (keys?.tokens ?? [])) {
    if (plan.agents.some((a) => a.label === t.label) && !t.revoked_at) await host.call('revokeToken', { id: t.id }, owner).catch(() => null);
  }
  for (const a of plan.agents) {
    const minted = await host.call('createToken', { scope: 'write', label: a.label, days: 90 }, owner);
    const agent = { bearer: minted.bearer };
    /* ITS OWN RUN, under a client id no earlier key opened, since a run answers only to the key that opened it. */
    const hints = { ...a.hints, client_id: `${a.hints.client_id}-${Date.now().toString(36)}` };
    const task = made.get(a.handoff.task);
    await host.call('handoff', { doing: a.handoff.doing, next: a.handoff.next, ...(task ? { task: spoken(task) } : {}), ...(a.handoff.done ? { done: a.handoff.done } : {}) }, agent, hints);
    for (const n of a.notes) {
      const on = made.get(n.on);
      await host.call('log', { register: on.register, seq: on.seq, note: n.note }, agent, hints);
    }
    for (const [i, l] of a.learnings.entries()) await host.call('create', { register: 'learnings', fields: l, op_id: `${values.slug}-${a.label.toLowerCase()}-learning-${i + 1}` }, agent, hints);
    for (const q of a.asks) {
      const bill = made.get(q.bill);
      const options = q.options(spoken(bill)).map((o) => (o.patches ? { ...o, patches: o.patches.map((p) => ({ ...p, version: bill.version })) } : o));
      await host.call('propose', { question: q.question, body_kind: 'options', body: { options }, cause: q.cause }, agent, hints).catch(already);
    }
    if (a.widget) {
      const g = gallery.get(a.widget.gallery);
      if (g) await host.call('propose', { question: a.widget.question, body_kind: 'widget', body: { block: structuredClone(g.block), size: a.widget.size }, cause: `widget-${a.widget.gallery}` }, agent, hints).catch(already);
    }
    if (a.handoff.state) await host.call('handoff', { state: a.handoff.state }, agent, hints);
    say(`    ${a.label}: connected, a run${a.notes.length ? `, ${a.notes.length} note` : ''}${a.learnings.length ? `, ${a.learnings.length} learning` : ''}${a.asks.length ? `, ${a.asks.length} question for her` : ''}${a.widget ? ', a widget for her to keep or throw away' : ''}`);
  }

  /* THE KEY-NUMBER OFFERS A NEW PROJECT FILES ARE ANSWERED: her key numbers are already set, so Needs you holds what her
     agents asked and what the record itself asks about renewals, and nothing about a step she has taken. */
  const open = await host.call('governance', {}, owner).catch(() => []);
  const offers = (Array.isArray(open) ? open : []).filter((q) => q.status === 'open' && String(q.cause ?? '').startsWith('kpi-kind:'));
  for (const q of offers) await host.call('decide', { id: q.id, resolved_as: 'wont-fix', reason: 'Her key numbers are already set.' }, owner).catch(() => null);
  if (offers.length > 0) say(`    answered ${offers.length} key-number offers, since her key numbers are set`);

  /* 7. THE REVIEWER, a member who reads and changes nothing. */
  if (values.reviewer) {
    const invited = await host.call('invite', { email: values.reviewer, level: 'read' }, owner);
    say(`\n  The reviewer, ${values.reviewer}, is invited to read Maya's record. Once, in a private window, open:`);
    say(`    ${host.origin}/invite#${invited.token}`);
    say(`  It asks for a name and mails a proof to ${values.reviewer}; open that mail and they are in, at read.`);
    say('  The link works once, for 24 hours. After that, a reviewer signs in with:');
    say(`    node apps/cli/scripts/demo-record.mjs reviewer-link --host ${host.origin} --email ${values.reviewer}`);
  }
  say(`\n  Done. Maya's BrainDog is at ${host.origin}.${selfHost ? '' : ` Sign in as her with: node apps/cli/scripts/demo-record.mjs owner-link --host ${host.origin}`}`);
  return 0;
}

async function link(values, who) {
  const key = operatorKey();
  if (!key) {
    say('  No PROVISION_KEY: export it, or put it in the keychain as braindog-provision-key.');
    return 2;
  }
  const host = hostAt(values.host);
  const email = values.email ?? (who === 'reviewer' ? DEFAULTS.reviewer : DEFAULTS.email);
  const { status, out } = await host.operator('/auth/claim/mint', { email }, key);
  if (status !== 200 || !out?.ok) throw new Refused(`A sign-in link for ${email}`, out?.refusal ?? { fix: `answered ${status}` });
  const until = new Date(out.value.expires).toISOString().replace('T', ' ').slice(0, 16);
  say(`  A sign-in link for ${email}${who === 'reviewer' ? ', who can read Maya\'s record and change nothing' : ', as Maya'}. It works once, until ${until} UTC:`);
  say(`    ${out.value.claim}`);
  return 0;
}

/* ── THE COMMAND LINE ─────────────────────────────────────────────────────────────────────────────────────────────── */

if (import.meta.main) {
  let parsed;
  try {
    parsed = parseArgs({
      args: process.argv.slice(2),
      allowPositionals: true,
      options: { host: { type: 'string' }, slug: { type: 'string' }, email: { type: 'string' }, reviewer: { type: 'string' }, tz: { type: 'string' }, again: { type: 'boolean' }, 'self-host': { type: 'boolean' }, help: { type: 'boolean', short: 'h' } },
    });
  } catch (e) {
    console.error(`  ${e.message}\n  ${USAGE}`);
    process.exit(2);
  }
  const [command, ...more] = parsed.positionals;
  if (parsed.values.help || !command || more.length > 0 || !['plan', 'make', 'reviewer-link', 'owner-link'].includes(command)) {
    say(USAGE);
    process.exit(parsed.values.help ? 0 : 2);
  }
  const values = { ...DEFAULTS, ...parsed.values, ...(command.endsWith('-link') ? { email: parsed.values.email } : {}) };
  if (command === 'make' && parsed.values.reviewer === undefined) values.reviewer = DEFAULTS.reviewer;
  if (values.reviewer === '' || values.reviewer === 'none') values.reviewer = null;
  try {
    if (command === 'plan') {
      printPlan(mayaRecord(todayIn(values.tz)));
      process.exitCode = 0;
    } else if (command === 'make') process.exitCode = await make(values);
    else process.exitCode = await link(values, command === 'reviewer-link' ? 'reviewer' : 'owner');
  } catch (e) {
    say(`\n  STOPPED  ${e.message}`);
    if (command === 'make') say(`  What was written stays. Run the same command again today${values['self-host'] ? '' : ' with --again'} to finish it.`);
    process.exitCode = 1;
  }
}

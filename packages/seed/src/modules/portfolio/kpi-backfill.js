/**
 * Each project's key numbers, offered from what Numbers already holds (the KPI plan of 21 October, 2.7 and K2-C), as
 * the decision, the script a host runs round it, and the declaration Portfolio's pack document carries.
 *
 * ONE QUESTION A PROJECT, AND NOTHING WRITTEN. Handed the projects, the readings and the key numbers already kept,
 * `kpiBackfill` answers one `rowset` on `kpis` per project, each row a key number he keeps by accepting it, or drops by
 * saying no. A key number is never written here: only a person's press makes one.
 *
 * AND WHAT HIS PRESS MAKES IS A DRAFT. Every row is offered with `draft: true`, so accepting the question makes the rows
 * as suggestions and tracks nothing yet: the project page shows them under Suggested, each with Keep and Not this, and
 * no form of the Numbers block counts one until he keeps it (`sources/kpis.ts` leaves drafts out).
 *
 * WHAT BECOMES A KEY NUMBER:
 *   - a series of readings, a measure with at least `FEW` of them, read as the KPI's `measure`. Its name is the
 *     reading's name with the project cut off the end ("Servers, Kiln" is Servers), the rule Revenue bands and the
 *     `kpis` list already match a measure by;
 *   - its shape (`kind`) from its unit and its name: a currency or "per month" adds up over time (flow), a % or a rate is
 *     a share, anything else is a level; which way is good from its name (churn, costs, skips and misses go down);
 *   - how often a value should arrive (`every`) from the spacing of its readings, the middle gap between two days;
 *   - at most `MOST` a project: money first, then the names a project is judged by (players, users, servers, orders,
 *     sign-ins), then the most read. Six is the project page's Numbers tile, the headline and five beside it;
 *   - and one leads the card (`headline`): the money one, else the one read most.
 *
 * WHAT IS LEFT OUT: a measure read once or twice, engineering trivia (lines of code, docs, tests, scopes, migrations),
 * a server's own figures (ms, GB, connections), example rows, and a series that repeats another of the same project
 * (Revenue beside Revenue by month): the one whose name says its period is kept.
 *
 * TWO EXCEPTIONS FOR MONEY, BECAUSE MONEY LEADS. A project with no money series whose revenue was read once (a client's
 * "Monthly revenue", 8,750 USD on 28 Sep) still gets that one as its key number: one point is a number and its date, and
 * the tile draws it so. And a project in play with no revenue reading at all, whose outlook expects money (a product's
 * base of 300 a month a year out), is offered "Monthly revenue" to type, with the outlook as its target, so the question
 * puts the outlook to him to keep or drop.
 *
 * AN OUTLOOK IS A TARGET, NEVER A KEY NUMBER. "Monthly revenue a year out: base" becomes the target of the project's
 * revenue number, due a year from the day it was said; bear and bull are said in the question, never kept. A base of
 * nought is no target.
 *
 * ASKED ONCE. Every question carries the cause `kpi-backfill:<project>`, so a second run joins the one still open, and
 * one he said no to is answered from the gate's memory and not asked again. A project that holds any key number at all,
 * kept, draft or retired, is never offered more by this. The rows say nothing that moves with time (no count, no last
 * day), so a feed that starts later does not make a declined question new.
 *
 * NOTHING OUTSIDE ITSELF IS READ BY `kpiBackfill`, AND NOTHING BUT `kpiBackfill` BY `run`: the two texts together are
 * the script (`KPI_BACKFILL_SCRIPT.source`).
 */

export function kpiBackfill(things, readings, kpis) {
  const FEW = 3;
  const MOST = 6;
  const DAY = 86_400_000;
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  /* ISO 4217'S MINOR DIGITS where they are not two, as Revenue bands holds them: the sandbox has no `Intl`. */
  const DIGITS = { JPY: 0, KRW: 0, VND: 0, CLP: 0, ISK: 0, PYG: 0, UGX: 0, RWF: 0, XAF: 0, XOF: 0, BHD: 3, KWD: 3, OMR: 3, JOD: 3, TND: 3, IQD: 3, LYD: 3 };
  const OUTLOOK = /^(.+?) a year out: (bear|base|bull)$/i;
  const TRIVIA = /\b(cpu|memory|disk|round trip|cdn temp|connections|loc|lines|tests?|tests green|docs?|gdd|uncommitted|commands|scopes|migrations|surfaces|entities|decisions|research agents|assets|card frames|rarity tiers|breeds|effort days|age days|prototype)\b/i;
  const SERVER_UNITS = /^(ms|s|kb|mb|gb|tb|conn|req\/day|writes\/day)$/i;
  const KEY = /\b(revenue|mrr|sales|orders|takings|billed|income|payers|subs|subscribers|customers|users|players|members|active|dau|wau|mau|servers|installs|sign-?ins|sign-?ups|waitlist|audience|followers|views|plays|sessions|accounts)\b/i;
  const REVENUE = /\b(revenue|mrr|takings|billed|income|sales)\b/i;
  const PERIOD = /\b(by|per|a|each) (day|week|month)\b/i;
  const DOWN = /\b(churn|costs?|spend|fails?|failures?|cancels?|cancellations?|missed|skips?|wrong|errors?|late|bugs|refunds?)\b/i;

  const money = (v) => (v && typeof v === 'object' && Number.isSafeInteger(v.amount) && typeof v.currency === 'string' && /^[A-Z]{3}$/.test(v.currency) ? v : null);
  const currencyOf = (unit) => (typeof unit === 'string' && /^[A-Z]{3}$/.test(unit.trim()) ? unit.trim() : null);
  const minor = (value, currency) => Math.round(value * 10 ** (DIGITS[currency] ?? 2));
  const dayOf = (at) => (typeof at === 'string' && /^\d{4}-\d{2}-\d{2}/.test(at) ? at.slice(0, 10) : null);
  const msOf = (day) => Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)));
  const dayWords = (day) => `${Number(day.slice(8, 10))} ${MONTHS[Number(day.slice(5, 7)) - 1]} ${day.slice(0, 4)}`;
  const yearOn = (day) => {
    const next = new Date(msOf(day));
    next.setUTCFullYear(next.getUTCFullYear() + 1);
    return next.toISOString().slice(0, 10);
  };
  const moneyWords = (m) => {
    const places = DIGITS[m.currency] ?? 2;
    const whole = Math.trunc(Math.abs(m.amount) / 10 ** places);
    const rest = Math.abs(m.amount) % 10 ** places;
    const said = String(whole).replace(/\B(?=(\d{3})+$)/g, ',');
    return `${m.currency} ${m.amount < 0 ? '-' : ''}${said}${rest === 0 ? '' : `.${String(rest).padStart(places, '0')}`}`;
  };
  const listed = (names) => (names.length > 2 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names.join(' and '));
  const seqOf = (r) => Number(String(r.spoken ?? '').split('#')[1]) || 0;

  /* A PROJECT BY ITS ROW ID OR ITS SPOKEN ONE, since a reading's link may arrive as either. */
  const projectOf = new Map();
  for (const t of things) {
    projectOf.set(t.id, t);
    if (typeof t.spoken === 'string') projectOf.set(t.spoken, t);
  }
  const keeps = new Set();
  for (const k of kpis) {
    const t = projectOf.get(k.fields.thing);
    if (t) keeps.add(t.id);
  }

  /* EACH PROJECT'S READINGS BY MEASURE, oldest written first, so the same rows always answer the same question. */
  const byProject = new Map();
  for (const r of [...readings].sort((a, b) => seqOf(a) - seqOf(b))) {
    const f = r.fields;
    if (f.source === 'example') continue;
    const t = projectOf.get(f.thing);
    const day = dayOf(f.at);
    const name = typeof f.name === 'string' ? f.name.trim() : '';
    if (!t || day === null || name === '') continue;
    const cash = money(f.amount);
    const currency = cash?.currency ?? currencyOf(f.unit);
    const value = cash ? cash.amount / 10 ** (DIGITS[cash.currency] ?? 2) : typeof f.value === 'number' && Number.isFinite(f.value) ? f.value : null;
    if (value === null) continue;
    const own = String(t.fields.name ?? '').trim();
    const bare = own !== '' && name.endsWith(`, ${own}`) ? name.slice(0, -(own.length + 2)).trim() : name;
    if (!byProject.has(t.id)) byProject.set(t.id, new Map());
    const measures = byProject.get(t.id);
    if (!measures.has(bare)) measures.set(bare, { name: bare, unit: currency ?? (typeof f.unit === 'string' && f.unit.trim() !== '' ? f.unit.trim() : null), currency, points: new Map(), first: measures.size });
    /* ONE POINT A DAY, the last written: an import that said one day twice said it once. */
    measures.get(bare).points.set(day, { day, value, minor: cash ? cash.amount : null });
  }

  const out = [];
  for (const t of [...things].sort((a, b) => seqOf(a) - seqOf(b))) {
    const lane = t.fields.lane;
    if (lane === 'retired' || keeps.has(t.id)) continue;
    const project = String(t.fields.name ?? '').trim() || 'This project';
    const measures = [...(byProject.get(t.id)?.values() ?? [])];

    /* THE OUTLOOK, by the measure it forecasts: the latest said of each case. */
    const outlooks = new Map();
    for (const m of measures) {
      const said = OUTLOOK.exec(m.name);
      if (!said) continue;
      const of = said[1].trim();
      const latest = [...m.points.values()].sort((a, b) => (a.day < b.day ? -1 : 1)).at(-1);
      if (!outlooks.has(of.toLowerCase())) outlooks.set(of.toLowerCase(), { of, currency: m.currency, cases: {} });
      const o = outlooks.get(of.toLowerCase());
      o.currency ??= m.currency;
      o.cases[said[2].toLowerCase()] = latest;
    }

    const isMoney = (m) => m.currency !== null;
    const left = (m) => OUTLOOK.test(m.name) || TRIVIA.test(m.name) || (m.unit !== null && SERVER_UNITS.test(m.unit));
    let series = measures.filter((m) => !left(m) && m.points.size >= FEW);

    /* A SERIES THAT REPEATS ANOTHER: one unit, as many days give or take a tenth, and most days the same value. */
    const repeats = (a, b) => {
      if (a.unit !== b.unit) return false;
      const [few, many] = a.points.size <= b.points.size ? [a, b] : [b, a];
      if (many.points.size > few.points.size * 1.1) return false;
      let same = 0;
      for (const [day, p] of few.points) if (many.points.get(day)?.value === p.value) same++;
      return same >= few.points.size * 0.8;
    };
    const kept = [];
    for (const m of series) {
      const twin = kept.findIndex((k) => repeats(k, m));
      if (twin < 0) kept.push(m);
      else {
        const k = kept[twin];
        const better = PERIOD.test(m.name) !== PERIOD.test(k.name) ? PERIOD.test(m.name) : m.points.size > k.points.size;
        if (better) kept[twin] = m;
      }
    }
    series = kept;

    /* MONEY FIRST, THEN WHAT A PROJECT IS JUDGED BY, THEN THE MOST READ, then the order they were first read in. */
    const score = (m) => (isMoney(m) ? 2 : 0) + (KEY.test(m.name) ? 1 : 0);
    series.sort((a, b) => score(b) - score(a) || b.points.size - a.points.size || a.first - b.first);
    const chosen = series.slice(0, MOST).map((m) => ({ m, source: 'numbers' }));

    /* THE ONE-OFF REVENUE, when no series is money: the latest revenue reading said once or twice. */
    if (!chosen.some((c) => isMoney(c.m))) {
      const once = measures.filter((m) => isMoney(m) && !left(m) && REVENUE.test(m.name) && m.points.size < FEW).sort((a, b) => b.points.size - a.points.size || a.first - b.first)[0];
      if (once) chosen.unshift({ m: once, source: 'numbers' });
    }
    if (chosen.length > MOST) chosen.length = MOST;

    /* THE OUTLOOK'S BASE AS THE TARGET of the money number it forecasts, else of the project's first money number. */
    const revenueOutlook = [...outlooks.values()].find((o) => REVENUE.test(o.of) && o.currency !== null) ?? null;
    const baseOf = (o) => {
      const base = o?.cases.base;
      if (!base || !o.currency) return null;
      const amount = base.minor ?? minor(base.value, o.currency);
      return amount > 0 ? { amount: { amount, currency: o.currency }, by: yearOn(base.day) } : null;
    };
    let target = null;
    let onlyOutlook = false;
    if (revenueOutlook && baseOf(revenueOutlook)) {
      const base = baseOf(revenueOutlook);
      const exact = chosen.find((c) => isMoney(c.m) && c.m.currency === revenueOutlook.currency && c.m.name.toLowerCase() === revenueOutlook.of.toLowerCase());
      const first = chosen.find((c) => isMoney(c.m) && c.m.currency === revenueOutlook.currency && REVENUE.test(c.m.name));
      const to = exact ?? first ?? null;
      if (to) target = { to, ...base };
      else if (!chosen.some((c) => isMoney(c.m)) && (lane === 'earning' || lane === 'building')) {
        /* NO REVENUE READ YET: the outlook's own measure, to be typed, so the outlook is put to him. */
        const typed = { m: { name: revenueOutlook.of, unit: revenueOutlook.currency, currency: revenueOutlook.currency, points: new Map(), first: -1 }, source: 'typed' };
        chosen.unshift(typed);
        if (chosen.length > MOST) chosen.length = MOST;
        target = { to: typed, ...base };
        onlyOutlook = chosen.length === 1;
      }
    }
    if (chosen.length === 0) continue;

    /* THE HEADLINE: the money one read most, else the one read most, ties to the higher rank. */
    const pool = chosen.some((c) => isMoney(c.m)) ? chosen.filter((c) => isMoney(c.m)) : chosen;
    const headline = pool.reduce((best, c) => (c.m.points.size > best.m.points.size ? c : best), pool[0]);

    const everyOf = (m) => {
      const days = [...m.points.keys()].sort();
      if (days.length < 2) return /\b(monthly|a month|per month|by month|mrr)\b/i.test(m.name) ? '1m' : null;
      const gaps = days.slice(1).map((d, i) => msOf(d) - msOf(days[i])).sort((a, b) => a - b);
      const middle = gaps[Math.floor(gaps.length / 2)];
      return middle <= DAY * 1.5 ? '1d' : middle <= DAY * 10 ? '1w' : '1m';
    };
    const kindOf = (m) => {
      if (m.unit === '%' || /\b(rate|share|churn|conversion|ratio)\b/i.test(m.name)) return 'share';
      if (/\b(monthly|recurring|mrr)\b/i.test(m.name)) return 'level';
      if (PERIOD.test(m.name) || /\b(revenue|sales|orders|takings|billed|income|new|sign-?ins|sign-?ups|sessions|plays|views|votes)\b/i.test(m.name)) return 'flow';
      return 'level';
    };
    const oftenWords = { '1d': 'daily', '1w': 'weekly', '1m': 'monthly' };

    const rows = chosen.map((c, i) => {
      const m = c.m;
      const every = c.source === 'typed' ? '1m' : everyOf(m);
      const row = {
        name: m.name,
        thing: t.id,
        measures:
          c.source === 'typed'
            ? `${m.name} as you type it, a value a month.`
            : `Read from Numbers, where ${m.name} ${every ? `arrives ${oftenWords[every]}` : 'was read once'}.`,
        source: c.source,
        measure: m.name,
        kind: kindOf(m),
        good: DOWN.test(m.name) ? 'down' : 'up',
        order: i + 1,
        headline: c === headline,
        draft: true,
      };
      if (m.unit !== null) row.unit = m.unit;
      if (every) row.every = every;
      if (target && target.to === c) {
        row.target_amount = target.amount;
        row.target_by = target.by;
      }
      return row;
    });

    /* THE QUESTION, IN NAMES AND ONE OR TWO SENTENCES, under the 280 a question is held to. */
    const names = rows.map((r) => r.name);
    const lead = headline.m.name;
    const aim = target ? `${target.to.m.name} aims for ${moneyWords(target.amount)} by ${dayWords(target.by)}, the outlook's base.` : '';
    let question;
    if (onlyOutlook) {
      const cases = revenueOutlook.cases;
      const at = (c) => (cases[c] ? moneyWords({ amount: cases[c].minor ?? minor(cases[c].value, revenueOutlook.currency), currency: revenueOutlook.currency }) : null);
      const range = [at('bear') ? `${at('bear')} at worst` : null, at('bull') ? `${at('bull')} at best` : null].filter(Boolean).join(', ');
      question = `Track ${lead} for ${project}, aiming for ${moneyWords(target.amount)} by ${dayWords(target.by)}? That is its outlook's base${range ? ` (${range})` : ''}; say no to drop it.`;
    } else {
      const rest = names.filter((n) => n !== lead);
      const shown = rest.length > 3 ? [...rest.slice(0, 2), `${rest.length - 2} more`] : rest;
      const after = shown.length === 0 ? '' : `, then ${listed(shown)}`;
      question = `Keep ${rows.length === 1 ? `${lead} as the key number` : `${rows.length} key numbers`} for ${project}? ${rows.length === 1 ? '' : `${lead} leads${after}. `}${aim}`.trim();
    }
    if (question.length > 280) question = `Keep ${rows.length === 1 ? 'one key number' : `${rows.length} key numbers`} for ${project}, led by ${lead}?`;

    out.push({
      project,
      cause: `kpi-backfill:${t.id}`,
      question,
      body_kind: 'rowset',
      body: {
        register: 'kpis',
        rows,
        why: onlyOutlook
          ? 'Its outlook is the only number it has, so the target is the outlook until a real value is typed.'
          : 'Each one is already in Numbers. Numbers read once or twice, and engineering counts, are left out.',
      },
    });
  }
  return out;
}

/**
 * The script: read the projects, the key numbers and every reading, decide, and file each project's one question.
 *
 * A SCRIPT'S LIST IS ONE PAGE OF FIFTY, IN THE LIST'S OWN ORDER, and his record holds 2,527 readings. Numbers is ordered
 * by the day a reading was true, not by its number, so "numbers below the lowest read" (`plans-from-names.js`) would
 * skip readings written later about an earlier day. So each list is read in windows of fifty numbers, which can never
 * hold more than a page, from 1 up to a bound found by doubling until nothing lies past it. A backfill from the first
 * page would offer the newest fifty readings' measures and miss the rest.
 *
 * IT FILES THROUGH `ctx.propose`, one call a question, because a run's own `ask` is one options question and cannot
 * carry rows to make (`script-run.ts` `askOf`). Each call answers the gate's words: `queued` for a question filed when
 * the run is applied, `joined` for one already waiting, `answered` for one he answered before, or a refusal (twenty
 * questions a run at most, `PROPOSALS_PER_RUN`; the next run files the rest). A host that hands no `propose` (an agent's
 * trial of the script) gets one sentence in the log and nothing filed, never a key number written in its place.
 */
export default async function run(ctx) {
  const PAGE = 50;
  const every = async (list) => {
    let bound = PAGE;
    while ((await ctx.record.list(list, { field: 'seq', gte: bound })).length > 0) bound *= 2;
    const rows = [];
    for (let from = 1; from < bound; from += PAGE) {
      const page = await ctx.record.list(list, { all: [{ field: 'seq', gte: from }, { field: 'seq', lt: from + PAGE }] });
      for (const r of page) rows.push({ id: r.id, spoken: `${list}#${r.seq}`, version: r.version, fields: r.fields });
    }
    return rows;
  };
  const things = await every('things');
  const kpis = await every('kpis');
  const readings = await every('datapoints');
  const asks = kpiBackfill(things, readings, kpis);
  if (asks.length === 0) return null;
  if (typeof ctx.propose !== 'function') {
    ctx.log(`${asks.length === 1 ? 'One project has' : `${asks.length} projects have`} key numbers to offer, and this run files no questions (a trial files none), so nothing was asked.`);
    return null;
  }

  const asked = [];
  const waiting = [];
  const answered = [];
  const refused = [];
  for (const a of asks) {
    const got = await ctx.propose({ question: a.question, body_kind: a.body_kind, body: a.body, cause: a.cause });
    /* THE GATE'S RESULT, or its value handed on bare by a host that unwraps it. */
    const filed = got && typeof got === 'object' && 'ok' in got ? (got.ok ? got.value : null) : got;
    if (filed === null || filed === undefined) refused.push(a.project);
    else if (filed.answered !== undefined) answered.push(a.project);
    else if (filed.joined && !filed.widened) waiting.push(a.project);
    else asked.push(a.project);
  }

  /* SAID IN NAMES AND COUNTS: the first three projects asked about, and how many more. */
  const names = (list) => (list.length > 3 ? `${list.slice(0, 3).join(', ')} and ${list.length - 3} more` : list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list.at(-1)}` : list.join(''));
  const said = [];
  if (asked.length > 0) said.push(`Offered key numbers for ${names(asked)}.`);
  if (waiting.length > 0) said.push(`${names(waiting)} ${waiting.length === 1 ? 'is' : 'are'} already waiting for an answer.`);
  if (answered.length > 0) said.push(`${names(answered)} ${answered.length === 1 ? 'was' : 'were'} answered before, so not asked again.`);
  if (refused.length > 0) said.push(`The record would not take the question for ${names(refused)}.`);
  ctx.log(said.join(' '));
  return { asked: asked.length, waiting: waiting.length, answered: answered.length, refused: refused.length };
}

/**
 * The script as Portfolio's pack document writes it: no egress, no keys, reading Projects, Key numbers and Numbers,
 * once a day and when a rule hands it a project. `writes` names Key numbers because the rows its questions make are
 * Key numbers, and it writes none itself.
 */
export const KPI_BACKFILL_SCRIPT = {
  script: 'kpi_backfill',
  title: 'Offer each project its key numbers from what Numbers holds',
  pack: 'portfolio',
  runs: { every: '1d', rule: true },
  egress: [],
  keys: [],
  reads: ['things', 'kpis', 'datapoints'],
  writes: ['kpis'],
  source: `${kpiBackfill.toString()}\nexport default ${run.toString()}`,
};

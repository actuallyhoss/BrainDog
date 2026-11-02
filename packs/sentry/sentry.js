/**
 * Your Sentry projects, their open issues and how many errors and people they hit, read from Sentry every hour.
 *
 * WHAT IT READS. Three things from Sentry's own API, with the token in your keys and nothing else: the organization's
 * projects, how many error events each project had in the last day and how many people they hit (Sentry's events
 * table, one request for all of them), and each project's open issues seen in the last fourteen days, newest first,
 * at most fifty a project (one request a project). Fifteen projects at most are asked about each hour, the ones linked
 * to a project of yours first, so a run never asks Sentry more than seventeen times.
 *
 * WHAT IT WRITES. One row a Sentry project in Sentry projects, with its counts and the project of yours it belongs to.
 * One row an open issue in Sentry issues, found again by Sentry's issue id, so an issue is never written twice; an issue
 * that is no longer open in Sentry is marked closed here, never deleted. And four numbers a project of yours in Numbers,
 * so they chart like any other feed: Open errors, New errors in a day, Error events in a day and People hit in a day. A
 * number is written when it moves, and at least once a day when it does not. A Sentry project not linked to one of
 * yours has its own four, named after it on Sentry ("Open errors · billing-worker").
 *
 * WHICH PROJECT A SENTRY PROJECT BELONGS TO. A new Sentry project is linked to the project of yours whose name its
 * words are, with the part it names taken off: crumb-bot, bake-health and crumb-site go to Crumb.gg, marsh-bot to
 * Marsh.gg, marlow-site to Marlow & Co. Only a single sure match is linked; one that only looks alike is put on the
 * row as Looks like for you to pick. A link you change or clear is yours and is never redone.
 *
 * WHEN IT SPEAKS UP. An issue that is new and high priority, has come back after being resolved, or is escalating
 * gets `alarm` set, once a burst. The add-on's rules ring the bell for it once it has hit at least one person (inside
 * your quiet hours nothing sounds) and, when it has hit at least as many people as the setting says, put it in Needs
 * you with a link to the issue. The alarm stays the same one while the issue keeps happening, whatever Sentry calls it
 * from hour to hour, so a burst rings once. It clears when the issue has been quiet for a day or is resolved, and only
 * then can a later turn be a new alarm. Coming back after being resolved is always a new one.
 *
 * NOTHING IS EVER WRITTEN TO SENTRY. Every request is a read.
 */

/* THE REGIONS SENTRY HOLDS AN ORGANIZATION IN, as the `region` setting names them, each the origin its API answers at. */
const REGIONS = { 'us.sentry.io': 'https://us.sentry.io', 'de.sentry.io': 'https://de.sentry.io', 'sentry.io': 'https://sentry.io' };
/* ONE REQUEST FOR THE PROJECTS AND ONE FOR THE DAY'S COUNTS, then one a project: seventeen of the twenty a run may make. */
const MOST_PROJECTS = 15;
const ISSUES_EACH = 50;
const DAY_MS = 86_400_000;
/* A NUMBER THAT HAS NOT MOVED IS STILL WRITTEN ONCE THIS LONG HAS PASSED, so a chart has a point every day. */
const RESAY_MS = 20 * 3_600_000;
/* AN ISSUE WITH NO EVENT FOR THIS LONG HAS GONE QUIET: its burst is over, and the next turn is a new alarm. */
const QUIET_MS = DAY_MS;

/* THE FOUR NUMBERS, each with the tag a page finds it by. */
export const MEASURES = [
  { key: 'unresolved', name: 'Open errors', tag: 'sentry-open', unit: 'issues' },
  { key: 'fresh', name: 'New errors in a day', tag: 'sentry-new', unit: 'issues' },
  { key: 'events', name: 'Error events in a day', tag: 'sentry-events', unit: 'events' },
  { key: 'users', name: 'People hit in a day', tag: 'sentry-users', unit: 'people' },
];

/** A name boiled down to its letters and digits, with a web ending taken off: "Crumb.gg" is `bake`, "Marsh.gg" `marsh`. */
export function stemOf(name) {
  const lower = String(name ?? '').toLowerCase().trim();
  const bare = lower.replace(/\.(gg|com|io|app|dev|net|org|co|ai|xyz|so|me)$/u, '');
  return bare.replace(/[^a-z0-9]+/gu, '');
}

/* WORDS A COMPANY'S NAME CARRIES THAT SAY NOTHING ABOUT WHICH ONE IT IS: "Marlow & Co" is Marlow. */
const NAME_NOISE = new Set(['co', 'ltd', 'limited', 'inc', 'llc', 'llp', 'plc', 'gmbh', 'corp', 'the', 'and']);
/* WHAT A SENTRY PROJECT'S SLUG ENDS IN TO SAY WHICH PART OF A PROJECT IT IS: `marlow-site` is Marlow's site. */
const SLUG_PARTS = new Set(['site', 'bot', 'health', 'api', 'web', 'www', 'server', 'worker', 'app']);

/** A project's name as words: lower case, its web ending, "& Co", "Ltd" and punctuation gone. "Marlow & Co" is `["marlow"]`. */
export function nameWords(name) {
  const lower = String(name ?? '').toLowerCase().trim().replace(/\.(gg|com|io|app|dev|net|org|co|ai|xyz|so|me)$/u, '');
  const words = lower.replace(/&/gu, ' and ').split(/[^a-z0-9]+/u).filter((w) => w !== '');
  const kept = words.filter((w) => !NAME_NOISE.has(w));
  return kept.length > 0 ? kept : words;
}

/** A slug as words, with the part it names taken off the end: `marlow-site` is `["marlow"]`, `kiln-type` `["kiln", "type"]`. */
export function slugWords(slug) {
  const words = String(slug ?? '').toLowerCase().split(/[^a-z0-9]+/u).filter((w) => w !== '');
  while (words.length > 1 && SLUG_PARTS.has(words[words.length - 1])) words.pop();
  return words;
}

/**
 * Which project of yours a Sentry project's slug points at: `{ link, maybe }`, each a project's id or `null`.
 *
 * SURE, AND LINKED, when the slug's words (its part taken off) are the name's words, or begin with them: `crumb-bot` is
 * Crumb.gg, `marlow-site` is Marlow & Co, `kiln-type` is Kiln. Exactly one project may be that sure, or the longest
 * name when one is longer than the rest (`bake` and `bakery`).
 * UNSURE, AND ONLY SUGGESTED, when the two share a first word or a word of four letters or more but neither is the
 * other (`marlow-site` and "Marlow Studio"); the add-on puts it on the row as Looks like and leaves the link to you.
 * Pure, so the rule can be read without the record around it.
 */
export function matchFor(slug, things) {
  const s = slugWords(slug);
  const whole = stemOf(slug);
  if (s.length === 0) return { link: null, maybe: null };
  const sure = [];
  const unsure = [];
  for (const t of things) {
    const w = nameWords(t.fields.name);
    const joined = w.join('');
    if (joined.length < 3) continue;
    let starts = false;
    for (let k = 1; k <= s.length && !starts; k++) starts = s.slice(0, k).join('') === joined;
    if (starts || whole === joined || whole === stemOf(t.fields.name)) {
      sure.push([t, joined.length]);
      continue;
    }
    const shared = w.filter((x) => s.includes(x) && (x.length >= 4 || x === s[0]));
    if (w[0] === s[0] || shared.length > 0) unsure.push([t, shared.length + (w[0] === s[0] ? 1 : 0)]);
  }
  const one = (hits) => {
    if (hits.length === 1) return hits[0][0].id;
    const best = [...hits].sort((a, b) => b[1] - a[1]);
    return best.length > 1 && best[0][1] > best[1][1] ? best[0][0].id : null;
  };
  const link = one(sure);
  if (link) return { link, maybe: null };
  /* SEVERAL EQUALLY SURE IS NOT SURE: the first of them is only suggested when nothing else is. */
  return { link: null, maybe: sure.length > 0 ? null : one(unsure) };
}

/** The project of yours a Sentry project's slug points at, or `null`: `matchFor`'s sure link alone. */
export function suggestFor(slug, things) {
  return matchFor(slug, things).link;
}

/**
 * Why an issue should be said out loud now, or `''`: new and high priority, back after being resolved, or escalating.
 * Sentry's `substatus` and `priority` as its issues answer them.
 */
export function alarmKind(issue) {
  if (issue.substatus === 'regressed') return 'regressed';
  if (issue.substatus === 'escalating') return 'escalating';
  if (issue.substatus === 'new' && issue.priority === 'high') return 'new';
  return '';
}

const WHY = {
  new: 'New and high priority',
  regressed: 'Back after it was resolved',
  escalating: 'Happening a lot more than usual',
};

/* WHAT THE ALARM SAYS HAPPENED, after the issue's own title, so the bell and the mail's subject read as one line:
   "Crumb.gg: Failed to send follow-up is back (121 people)". */
const NEWS = {
  new: 'is new and high priority',
  regressed: 'is back',
  escalating: 'is happening a lot more than usual',
};

/** People, counted as a person reads it: "1 person", "121 people". */
const peopleOf = (n) => (n === 1 ? '1 person' : `${n} people`);

/**
 * Why an alarm is worth a look, with its numbers: the kind, the people it hit so far and, when Sentry counted any, the
 * events in the last day. The mail under the bell says it as its reason.
 */
export function whyOf(kind, users, day) {
  const events = day > 0 ? `, ${day === 1 ? '1 event' : `${day} events`} in the last day` : '';
  return `${WHY[kind]}, ${peopleOf(users)} hit so far${events}`;
}

/** The alarm's line after the issue's title: what happened and how many it reached, "is back (121 people)". */
export function newsOf(kind, users) {
  return `${NEWS[kind]} (${peopleOf(users)})`;
}

/** The events an issue had in the last day: the sum of its hourly stats, which Sentry sends as `[[seconds, count], ...]`. */
export function eventsInDay(issue) {
  const hours = issue?.stats?.['24h'];
  if (!Array.isArray(hours)) return 0;
  let n = 0;
  for (const h of hours) if (Array.isArray(h) && typeof h[1] === 'number') n += h[1];
  return n;
}

/** Sentry's own count, which arrives as text ("214"), as a whole number. */
const whole = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
};

/** The issue's own page on Sentry, as Sentry gives it, or `null` for anything that is not a Sentry page over https. */
export function linkOf(issue) {
  const at = typeof issue?.permalink === 'string' ? issue.permalink : '';
  return /^https:\/\/[a-z0-9-]+\.sentry\.io\/issues\/\d+\/?$/u.test(at) ? at : null;
}

/** An instant as the record keeps it, so an hour where Sentry said the same moment does not count as a change. */
const instantOf = (v) => {
  const ms = Date.parse(String(v ?? ''));
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
};

/** A header's value, whatever case the host handed it in. */
const header = (headers, name) => {
  if (!headers) return null;
  for (const [k, v] of Object.entries(headers)) if (k.toLowerCase() === name) return v;
  return null;
};

/** Every row of a list that `where` lets through, fifty at a time in the order they were written. */
async function every(ctx, list, where) {
  const out = [];
  let from = 1;
  for (;;) {
    const clause = { field: 'seq', gte: from };
    const page = await ctx.record.list(list, where ? { all: [where, clause] } : clause, { order: 'seq' });
    out.push(...page);
    if (page.length < 50) return out;
    from = page[page.length - 1].seq + 1;
  }
}

const spoken = (list, row) => `${list}#${row.seq}`;

/** Only the fields that change, or `null` when nothing does, so an hour where nothing moved writes nothing. */
function changed(row, fields) {
  const patch = {};
  for (const [k, v] of Object.entries(fields)) {
    const was = row.fields[k];
    if (JSON.stringify(was === undefined ? null : was) !== JSON.stringify(v === undefined ? null : v)) patch[k] = v;
  }
  return Object.keys(patch).length === 0 ? null : patch;
}

export default async function run(ctx) {
  const config = ctx.config ?? {};
  const key = typeof config.token === 'string' ? config.token.trim() : '';
  const org = typeof config.org === 'string' ? config.org.trim().toLowerCase() : '';
  const base = REGIONS[typeof config.region === 'string' ? config.region : 'us.sentry.io'] ?? REGIONS['us.sentry.io'];
  const many = Number.isFinite(Number(config.many_users)) && Number(config.many_users) > 0 ? Math.floor(Number(config.many_users)) : 20;
  if (key === '') throw new Error('No key is named, so Sentry was not asked. Name the key that holds your Sentry token on this add-on\'s page.');
  if (org === '' || !/^[a-z0-9][a-z0-9_-]*$/u.test(org)) {
    ctx.log('Set your Sentry organization on this add-on\'s page (the part of your Sentry address before .sentry.io), and the next hour reads it.');
    return null;
  }

  const ask = async (path) => {
    const r = await ctx.fetch(base + path, { key });
    if (r.status === 401 || r.status === 403)
      throw new Error(`Sentry turned the token in "${key}" away (${r.status}), so nothing was written. Make a new one with Read on Project, Issue & Event and Organization and put it in your keys under that name.`);
    if (r.status === 404) throw new Error(`Sentry has no organization called ${org} at ${base.slice(8)}, so nothing was written. Check the organization and the region on this add-on's page.`);
    if (!r.ok) throw new Error(`Sentry answered ${r.status} at ${path.split('?')[0]}, so nothing was written this hour.`);
    return { body: await r.json(), headers: r.headers };
  };

  const nowMs = Date.parse(ctx.now());
  const projects = (await ask(`/api/0/organizations/${org}/projects/?per_page=100`)).body;
  if (!Array.isArray(projects)) throw new Error('Sentry answered the list of projects with something that is not a list, so nothing was written.');

  const things = await every(ctx, 'things');
  const held = await every(ctx, 'sentry_projects');
  const heldBySlug = new Map(held.map((r) => [String(r.fields.sentry_id ?? r.fields.slug), r]));
  const nameOf = new Map(things.map((t) => [t.id, String(t.fields.name ?? '')]));

  /* THE DAY'S COUNTS, one request for every project. A Sentry that will not answer it (an older plan, a token without
     event reads) leaves events and people blank this hour rather than stopping the issues. */
  const day = new Map();
  {
    const r = await ctx.fetch(`${base}/api/0/organizations/${org}/events/?dataset=errors&field=project&field=count()&field=count_unique(user)&statsPeriod=24h&per_page=100`, { key });
    if (r.ok) {
      const body = await r.json();
      for (const row of Array.isArray(body?.data) ? body.data : []) day.set(String(row.project), { events: whole(row['count()']), users: whole(row['count_unique(user)']) });
    } else if (r.status === 401 || r.status === 403) {
      throw new Error(`Sentry turned the token in "${key}" away (${r.status}), so nothing was written. Make a new one with Read on Project, Issue & Event and Organization and put it in your keys under that name.`);
    } else ctx.log(`Sentry would not count the day's events (${r.status}), so events and people are left as they were.`);
  }

  /* EACH SENTRY PROJECT, LINKED WHERE A NAME SAYS SO. `suggested` keeps what this add-on linked, so a link a person
     changed or cleared reads as theirs and is never redone. */
  const linked = new Map();
  const seen = [];
  for (const p of projects) {
    const id = String(p.id);
    const slug = String(p.slug ?? p.name ?? id);
    const row = heldBySlug.get(id) ?? held.find((r) => r.fields.slug === slug);
    let thing = row ? (row.fields.thing ?? null) : null;
    let maybe = row ? (row.fields.maybe ?? null) : null;
    /* MATCHED ONCE: a new row, or one an older version could not link that nobody has touched since (no link, nothing the
       add-on linked, never matched by words). After that the link is the person's, set, changed or cleared. */
    const fresh = !row || (row.fields.matched == null && row.fields.thing == null && row.fields.suggested == null);
    let match = null;
    if (fresh) {
      match = matchFor(slug, things);
      thing = match.link;
      maybe = match.maybe;
    }
    /* A LOOKS LIKE GOES ONCE A PROJECT IS PICKED, or when the project it named is gone. */
    if (thing || (maybe && !nameOf.has(maybe))) maybe = null;
    linked.set(slug, thing);
    seen.push({ id, slug, name: String(p.name ?? slug).trim() || slug, platform: p.platform ? String(p.platform) : null, row, thing, maybe, match });
  }
  const shownOf = new Map(seen.map((p) => [p.slug, p.name]));

  /* LINKED FIRST, then the rest, fifteen at most. */
  const asked = [...seen].sort((a, b) => (a.thing ? 0 : 1) - (b.thing ? 0 : 1)).slice(0, MOST_PROJECTS);
  if (seen.length > asked.length) ctx.log(`${seen.length - asked.length} Sentry projects were not asked about this hour; link the ones you care about to a project and they come first.`);

  const counts = new Map();
  /* EACH PROJECT'S SENTRY SITE, read off an issue's own link, so a project's row links to its page without a host here. */
  const siteOf = new Map();
  const found = [];
  const full = new Set();
  for (const p of asked) {
    const { body, headers } = await ask(`/api/0/organizations/${org}/issues/?project=${encodeURIComponent(p.id)}&query=${encodeURIComponent('is:unresolved')}&statsPeriod=14d&sort=date&limit=${ISSUES_EACH}`);
    const list = Array.isArray(body) ? body : [];
    const hits = Number(header(headers, 'x-hits'));
    const unresolved = Number.isFinite(hits) && hits >= list.length ? hits : list.length;
    if (list.length >= ISSUES_EACH) full.add(p.slug);
    const fresh = list.filter((i) => Date.parse(i.firstSeen) >= nowMs - DAY_MS).length;
    const d = day.get(p.slug);
    counts.set(p.slug, { unresolved, fresh, events: d ? d.events : null, users: d ? d.users : null });
    for (const i of list) {
      found.push({ issue: i, project: p });
      const link = linkOf(i);
      if (link && !siteOf.has(p.slug)) siteOf.set(p.slug, link.split('/issues/')[0]);
    }
  }

  /* THE SENTRY PROJECTS' ROWS. */
  let wrote = 0;
  for (const p of seen) {
    const c = counts.get(p.slug);
    const fields = {
      slug: p.slug,
      sentry_id: p.id,
      name: p.name,
      platform: p.platform,
      link: siteOf.has(p.slug) ? `${siteOf.get(p.slug)}/projects/${p.slug}/` : (p.row?.fields.link ?? null),
      gone: false,
      maybe: p.maybe,
      matched: 'words',
      ...(p.match && p.row ? { thing: p.thing, ...(p.thing ? { suggested: p.thing } : {}) } : {}),
      ...(c ? { unresolved: c.unresolved, new_24h: c.fresh, events_24h: c.events, users_24h: c.users, checked: ctx.now() } : {}),
    };
    if (!p.row) {
      ctx.write('sentry_projects', { ...fields, ...(p.thing ? { thing: p.thing, suggested: p.thing } : {}) });
      wrote++;
    } else {
      const patch = changed(p.row, fields);
      if (patch) {
        ctx.update(spoken('sentry_projects', p.row), patch, p.row.version);
        wrote++;
      }
    }
  }
  /* A PROJECT GONE FROM SENTRY SAYS SO, and keeps its counts as they last were. */
  const live = new Set(seen.map((p) => p.id));
  for (const r of held) if (!live.has(String(r.fields.sentry_id)) && r.fields.gone !== true) ctx.update(spoken('sentry_projects', r), { gone: true }, r.version);

  /* THE ISSUES, found again by Sentry's id. */
  const ids = found.map((f) => String(f.issue.id));
  const known = new Map();
  for (let i = 0; i < ids.length; i += 100) {
    const rows = await every(ctx, 'sentry_issues', { field: 'issue_id', in: ids.slice(i, i + 100) });
    for (const r of rows) known.set(String(r.fields.issue_id), r);
  }
  const open = await every(ctx, 'sentry_issues', { field: 'open', is: true });

  let rang = 0;
  for (const { issue, project } of found) {
    const id = String(issue.id);
    const row = known.get(id);
    const kind = alarmKind(issue);
    const users = whole(issue.userCount);
    const thing = linked.get(project.slug) ?? null;
    /* ONE ALARM A BURST (1.2.2). The rules ring once per alarm, so the alarm is what a burst is. It was made again each
       time Sentry's word for the issue moved, and an issue that went escalating, then ongoing, then escalating again in
       the same afternoon rang each time (10 bells in a day on one record). Now an alarm, once set, stays the same one
       while the issue keeps happening, and clears only when the issue has gone a day with no event or is resolved (the
       row closed below). A new alarm (the count goes up, so the rules' once-per key is new) needs a turn after that, or
       a regression, which means somebody resolved it and it came back. */
    const was = row ? String(row.fields.alarm ?? '') : '';
    const turns = row ? whole(row.fields.turns) : 0;
    const wasKind = was.split('-')[0];
    const lastMs = Date.parse(String(issue.lastSeen ?? ''));
    const quiet = Number.isFinite(lastMs) && nowMs - lastMs >= QUIET_MS;
    /* STILL IN THE BURST AN OLDER VERSION CLEARED: open here, seen within the quiet time, and alarmed before. That
       version cleared an alarm the hour Sentry's word moved off it, so the same turn is taken up again, never a new one. */
    const heldSeen = row ? Date.parse(String(row.fields.last_seen ?? '')) : NaN;
    const ongoing = !!row && row.fields.open !== false && turns > 0 && Number.isFinite(heldSeen) && nowMs - heldSeen < QUIET_MS;
    let alarm = '';
    if (quiet) alarm = '';
    else if (was !== '') alarm = kind === 'regressed' && wasKind !== 'regressed' ? `${kind}-${turns + 1}` : was;
    else if (kind !== '') alarm = ongoing ? `${kind}-${turns}` : `${kind}-${turns + 1}`;
    if (alarm !== '' && alarm !== was) rang++;
    /* WHAT THE ALARM SAYS IS WHAT IT WAS SET FOR, with today's numbers. */
    const said = alarm === '' ? '' : alarm.split('-')[0];
    const fields = {
      what: String(issue.title ?? issue.metadata?.title ?? 'An error').slice(0, 160),
      short_id: issue.shortId ? String(issue.shortId) : null,
      issue_id: id,
      project: project.slug,
      thing,
      project_name: (thing ? nameOf.get(thing) : '') || shownOf.get(project.slug) || project.slug,
      culprit: issue.culprit ? String(issue.culprit).slice(0, 300) : null,
      level: issue.level ? String(issue.level) : null,
      substatus: issue.substatus ? String(issue.substatus) : null,
      priority: issue.priority ? String(issue.priority) : null,
      events: whole(issue.count),
      events_24h: eventsInDay(issue),
      users,
      first_seen: instantOf(issue.firstSeen),
      last_seen: instantOf(issue.lastSeen),
      link: linkOf(issue),
      open: true,
      alarm: alarm === '' ? null : alarm,
      turns: alarm === '' ? turns : Math.max(turns, Number(alarm.split('-')[1]) || turns),
      why: alarm === '' || !WHY[said] ? null : whyOf(said, users, eventsInDay(issue)),
      news: alarm === '' || !NEWS[said] ? null : newsOf(said, users),
      wide: alarm !== '' && users >= many,
    };
    if (!row) {
      ctx.write('sentry_issues', fields);
      wrote++;
    } else {
      const patch = changed(row, fields);
      if (patch) {
        ctx.update(spoken('sentry_issues', row), patch, row.version);
        wrote++;
      }
    }
  }
  /* AN ISSUE NO LONGER OPEN IN SENTRY IS CLOSED HERE, for a project whose open issues were all read this hour. */
  const now = new Set(ids);
  const read = new Set(asked.map((p) => p.slug));
  let closed = 0;
  for (const r of open) {
    const slug = String(r.fields.project);
    if (!read.has(slug) || full.has(slug) || now.has(String(r.fields.issue_id))) continue;
    ctx.update(spoken('sentry_issues', r), { open: false, alarm: null, wide: false }, r.version);
    closed++;
  }

  /* THE NUMBERS, one set a project of yours, summed over its Sentry projects; an unlinked Sentry project is its own. */
  const sums = new Map();
  for (const p of asked) {
    const c = counts.get(p.slug);
    const thing = linked.get(p.slug) ?? null;
    const at = thing ?? `slug:${p.slug}`;
    const s = sums.get(at) ?? { thing, shown: thing ? null : shownOf.get(p.slug) || p.slug, unresolved: 0, fresh: 0, events: null, users: null };
    s.unresolved += c.unresolved;
    s.fresh += c.fresh;
    if (c.events !== null) s.events = (s.events ?? 0) + c.events;
    if (c.users !== null) s.users = (s.users ?? 0) + c.users;
    sums.set(at, s);
  }
  /* NUMBERS 1.0 NAMED "Open errors, marlow-site" for an unlinked project take the name and the project it has now, so a
     chart draws one line for it and not an old one beside the new for two weeks. */
  let renamed = 0;
  {
    const older = await every(ctx, 'datapoints', { all: [{ field: 'tags', has: 'sentry' }, { any: MEASURES.map((m) => ({ field: 'name', starts: `${m.name}, ` })) }, { field: 'at', gte: new Date(nowMs - 15 * DAY_MS).toISOString() }] });
    for (const r of older) {
      const at = String(r.fields.name).indexOf(', ');
      const measure = MEASURES.find((m) => m.name === String(r.fields.name).slice(0, at));
      const slug = String(r.fields.name).slice(at + 2);
      if (!measure || !shownOf.has(slug) || r.fields.thing) continue;
      const thing = linked.get(slug) ?? null;
      ctx.update(spoken('datapoints', r), thing ? { name: measure.name, thing } : { name: `${measure.name} · ${shownOf.get(slug)}` }, r.version);
      renamed++;
    }
  }
  const recent = await every(ctx, 'datapoints', { all: [{ field: 'tags', has: 'sentry' }, { field: 'at', gte: new Date(nowMs - 2 * DAY_MS).toISOString() }] });
  const latest = new Map();
  for (const r of recent) {
    const k = `${r.fields.name}|${r.fields.thing ?? ''}`;
    const had = latest.get(k);
    if (!had || Date.parse(r.fields.at) >= Date.parse(had.fields.at)) latest.set(k, r);
  }
  let said = 0;
  for (const s of sums.values()) {
    for (const m of MEASURES) {
      const value = s[m.key];
      if (value === null || value === undefined) continue;
      const name = s.thing ? m.name : `${m.name} · ${s.shown}`;
      const had = latest.get(`${name}|${s.thing ?? ''}`);
      if (had && had.fields.value === value && nowMs - Date.parse(had.fields.at) < RESAY_MS) continue;
      ctx.write('datapoints', { name, value, unit: m.unit, ...(s.thing ? { thing: s.thing } : {}), at: ctx.now(), source: 'polled', tags: ['sentry', m.tag] });
      said++;
    }
  }

  const total = [...counts.values()].reduce((n, c) => n + c.unresolved, 0);
  ctx.log(
    `Read ${asked.length} of ${seen.length} Sentry projects: ${total} open issues${rang > 0 ? `, ${rang} newly worth a look` : ''}${closed > 0 ? `, ${closed} no longer open` : ''}. Wrote ${wrote} rows and ${said} numbers${renamed > 0 ? `, and renamed ${renamed} older ones` : ''}.`,
  );
  return { projects: seen.length, asked: asked.length, open: total, alarms: rang, closed, numbers: said };
}

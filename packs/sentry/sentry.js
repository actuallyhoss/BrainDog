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
 * number is written when it moves, and at least once a day when it does not.
 *
 * WHICH PROJECT A SENTRY PROJECT BELONGS TO. A new Sentry project is linked to the project of yours whose name it
 * starts with: crumb-bot, bake-health and crumb-site go to Crumb.gg, marsh-bot to Marsh.gg. Only a single clear match is
 * linked; anything else is left for you to pick on the row. A link you change or clear is yours and is never redone.
 *
 * WHEN IT SPEAKS UP. An issue that is new and high priority, has come back after being resolved, or is escalating
 * gets `alarm` set, once each time it turns that way. The add-on's rules ring the bell for it (inside your quiet hours
 * nothing sounds) and, when it has hit at least as many people as the setting says, put it in Needs you with a link
 * to the issue. An issue that calms down clears its alarm, and if it turns again later it is a new alarm.
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

/**
 * The project of yours a Sentry project's slug points at, or `null`. The slug's first word (`bake` of `crumb-bot`) or
 * the whole slug run together must be a project's stem, or start with one at least three letters long, and exactly one
 * project may match. Pure, so the rule can be read without the record around it.
 */
export function suggestFor(slug, things) {
  const head = stemOf(String(slug).split(/[-_.]/u)[0]);
  const whole = stemOf(slug);
  const hits = things.filter((t) => {
    const stem = stemOf(t.fields.name);
    if (stem.length < 3) return false;
    return head === stem || whole === stem || whole.startsWith(stem);
  });
  /* THE LONGEST STEM WINS A TIE BETWEEN A PROJECT AND ONE WHOSE NAME IT STARTS (`bake` and `bakery`), else nothing. */
  if (hits.length === 1) return hits[0].id;
  const best = hits.map((t) => [t, stemOf(t.fields.name).length]).sort((a, b) => b[1] - a[1]);
  return best.length > 1 && best[0][1] > best[1][1] ? best[0][0].id : null;
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
    let suggested = row ? (row.fields.suggested ?? null) : null;
    if (!row) {
      suggested = suggestFor(slug, things);
      thing = suggested;
    }
    linked.set(slug, thing);
    seen.push({ id, slug, name: String(p.name ?? slug), platform: p.platform ? String(p.platform) : null, row, thing, suggested });
  }

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
    /* A NEW ALARM EACH TIME IT TURNS: the count goes up when the kind is set and was not, so the rules' once-per key is new. */
    const was = row ? String(row.fields.alarm ?? '') : '';
    const turns = row ? whole(row.fields.turns) : 0;
    const wasKind = was.split('-')[0];
    const alarm = kind === '' ? '' : wasKind === kind ? was : `${kind}-${turns + 1}`;
    if (alarm !== '' && alarm !== was) rang++;
    const fields = {
      what: String(issue.title ?? issue.metadata?.title ?? 'An error').slice(0, 160),
      short_id: issue.shortId ? String(issue.shortId) : null,
      issue_id: id,
      project: project.slug,
      thing,
      project_name: thing ? nameOf.get(thing) || project.slug : project.slug,
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
      turns: alarm !== '' && alarm !== was ? turns + 1 : turns,
      why: alarm === '' ? null : `${WHY[kind]}, ${users === 1 ? '1 person' : `${users} people`} hit so far`,
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
    const s = sums.get(at) ?? { thing, slug: thing ? null : p.slug, unresolved: 0, fresh: 0, events: null, users: null };
    s.unresolved += c.unresolved;
    s.fresh += c.fresh;
    if (c.events !== null) s.events = (s.events ?? 0) + c.events;
    if (c.users !== null) s.users = (s.users ?? 0) + c.users;
    sums.set(at, s);
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
      const name = s.thing ? m.name : `${m.name}, ${s.slug}`;
      const had = latest.get(`${name}|${s.thing ?? ''}`);
      if (had && had.fields.value === value && nowMs - Date.parse(had.fields.at) < RESAY_MS) continue;
      ctx.write('datapoints', { name, value, unit: m.unit, ...(s.thing ? { thing: s.thing } : {}), at: ctx.now(), source: 'polled', tags: ['sentry', m.tag] });
      said++;
    }
  }

  const total = [...counts.values()].reduce((n, c) => n + c.unresolved, 0);
  ctx.log(
    `Read ${asked.length} of ${seen.length} Sentry projects: ${total} open issues${rang > 0 ? `, ${rang} newly worth a look` : ''}${closed > 0 ? `, ${closed} no longer open` : ''}. Wrote ${wrote} rows and ${said} numbers.`,
  );
  return { projects: seen.length, asked: asked.length, open: total, alarms: rang, closed, numbers: said };
}

/**
 * The outside world an add-on's script asks, on 127.0.0.1: Sentry's REST paths, a calendar's iCal feed, and Stripe's and
 * Mercury's read endpoints, each in the shape the real service answers.
 *
 * WHY. A record started with `startRecord(0, { outside })` sends every scheduled request here and nowhere else
 * (`record.mjs`), so Calendar, Sentry, Stripe and Mercury can be installed on a local record, their scripts run on the
 * record's own belt with keys the record really opens, and their pages drawn with something in them, without one byte
 * leaving the machine.
 *
 * A REQUEST ARRIVES AS `/<host>/<path>`, because `record.mjs` keeps the host the script asked for in front of the path.
 * The key a script sent is checked against the stub key `KEYS` holds for that service, so a key the record failed to
 * open is a 401 here, as it would be there.
 *
 * `empty` IS AN ACCOUNT WITH NOTHING IN IT YET: no Sentry projects, a calendar with no events, a zero balance and no
 * payouts, no Mercury accounts. `setEmpty(false)` fills it. The days are around the seed's `NOW` (3 Sep 2026), since
 * that is the record's clock.
 *
 *   const outside = await startOutside();   // { base, asked, setEmpty, close }
 */

import { createServer } from 'node:http';

import { NOW } from '../../packages/seed/src/index.ts';

/** The stub keys, one a service. Not secrets: the record seals them like any other key, and only this stub reads them. */
export const KEYS = {
  sentry: { label: 'Sentry token', opens: 'us.sentry.io', value: 'sntrys_stub_internal_integration_token' },
  calendar: { label: 'Calendar link', opens: 'calendar.google.com', value: 'https://calendar.google.com/calendar/ical/studio%40the-studio.example/private-0f3c9a1e/basic.ics' },
  stripe: { label: 'stripe', opens: 'api.stripe.com', value: 'rk_test_stub_read_only_balance_payouts' },
  mercury: { label: 'Mercury (read only)', opens: 'api.mercury.com', value: 'secret-token:mercury_stub_read_only' },
};

/** The Sentry organization the stub holds. */
export const SENTRY_ORG = 'the-studio';

const H = 3_600_000;
const D = 24 * H;
const iso = (t) => new Date(t).toISOString();

/* ── Sentry ─────────────────────────────────────────────────────────────────────────────────────────── */

/* The seed's projects are Kiln, Marlow & Co, Portage and Tallow, so the slugs link by name as Sam's would. */
const PROJECTS = [
  ['4508000000000011', 'kiln-type', 'node'],
  ['4508000000000012', 'kiln-site', 'javascript-sveltekit'],
  ['4508000000000013', 'marlow-site', 'javascript-nextjs'],
  ['4508000000000014', 'portage-web', 'javascript-sveltekit'],
].map(([id, slug, platform]) => ({ id, slug, name: slug, platform, isMember: true, hasAccess: true, status: 'active', dateCreated: '2026-06-14T10:00:00.000000Z', features: [], firstEvent: '2026-06-14T10:05:00Z' }));
const P = Object.fromEntries(PROJECTS.map((p) => [p.slug, p]));

const hourly = (counts) => counts.map((c, i) => [Math.floor((NOW - (counts.length - i) * H) / 1000), c]);
const issue = (id, project, o) => ({
  id,
  shareId: null,
  shortId: `${project.slug.toUpperCase()}-${Number(id).toString(36).toUpperCase()}`,
  title: 'An error',
  culprit: null,
  permalink: `https://${SENTRY_ORG}.sentry.io/issues/${id}/`,
  level: 'error',
  status: 'unresolved',
  statusDetails: {},
  substatus: 'ongoing',
  isPublic: false,
  platform: project.platform,
  project: { id: project.id, name: project.name, slug: project.slug, platform: project.platform },
  type: 'error',
  metadata: { type: 'Error', value: '' },
  numComments: 0,
  assignedTo: null,
  issueType: 'error',
  issueCategory: 'error',
  priority: 'medium',
  isUnhandled: true,
  count: '1',
  userCount: 1,
  firstSeen: iso(NOW - 4 * D),
  lastSeen: iso(NOW - 2 * H),
  stats: { '24h': hourly(new Array(24).fill(0)) },
  ...o,
});
const ISSUES = {
  'kiln-type': [
    issue('6100000272', P['kiln-type'], { title: 'RangeError: Invalid typed array length', culprit: 'POST /licences', substatus: 'escalating', priority: 'high', count: '412', userCount: 37, firstSeen: iso(NOW - 3 * H), lastSeen: iso(NOW - 10 * 60_000), stats: { '24h': hourly([...new Array(22).fill(0), 120, 292]) } }),
    issue('6100000261', P['kiln-type'], { title: 'Error: Request failed with status code 404', culprit: 'GET /fonts/:id', count: '2', userCount: 2, firstSeen: iso(NOW - 5 * D) }),
  ],
  'kiln-site': [
    issue('6200000105', P['kiln-site'], { title: "TypeError: Cannot read properties of undefined (reading 'weight')", culprit: '/specimen', substatus: 'new', priority: 'high', count: '6', userCount: 3, firstSeen: iso(NOW - 5 * H), stats: { '24h': hourly([...new Array(21).fill(0), 2, 2, 2]) } }),
  ],
  'marlow-site': [
    issue('6300000044', P['marlow-site'], { title: 'Error: Failed to fetch dynamically imported module', culprit: '/work', level: 'warning', priority: 'low', count: '14', userCount: 9, lastSeen: iso(NOW - 7 * H) }),
  ],
};
const EVENTS = [
  { project: 'kiln-type', 'count()': 415, 'count_unique(user)': 41 },
  { project: 'kiln-site', 'count()': 6, 'count_unique(user)': 3 },
  { project: 'marlow-site', 'count()': 3, 'count_unique(user)': 2 },
];

/* THE STUB'S SENTRY, HANDED OUT SO A WALK CAN MOVE IT BETWEEN HOURS: add a project, regress an issue, resolve one. */
export const SENTRY = { projects: PROJECTS, issues: ISSUES, events: EVENTS };

function sentry(path, query, empty) {
  const org = `/api/0/organizations/${SENTRY_ORG}`;
  if (path === `${org}/projects/`) return [200, empty ? [] : PROJECTS];
  if (path === `${org}/events/`)
    return [200, { data: empty ? [] : EVENTS, meta: { fields: { project: 'string', 'count()': 'integer', 'count_unique(user)': 'integer' }, units: {}, isMetricsData: false, dataset: 'errors' } }];
  if (path === `${org}/issues/`) {
    const project = PROJECTS.find((p) => p.id === query.get('project'));
    const list = empty || project === undefined ? [] : (ISSUES[project.slug] ?? []);
    return [200, list, { 'X-Hits': String(list.length), 'X-Max-Hits': '1000' }];
  }
  return [404, { detail: 'The requested resource does not exist' }];
}

/* ── Calendar ───────────────────────────────────────────────────────────────────────────────────────── */

const stamp = (t) => iso(t).replace(/[-:]/g, '').replace(/\.\d+/, '');
const dayStamp = (t) => iso(t).slice(0, 10).replace(/-/g, '');
const at = (days, hour, minute = 0) => Date.UTC(new Date(NOW).getUTCFullYear(), new Date(NOW).getUTCMonth(), new Date(NOW).getUTCDate() + days, hour, minute);

const EVENTS_ICS = [
  { uid: 'kiln-1', what: 'Kiln licence call with Halden', start: at(0, 14), end: at(0, 14, 45), where: 'https://meet.google.com/kiln-halden' },
  { uid: 'stand-1', what: 'Studio stand-up', start: at(0, 16, 30), end: at(0, 16, 45), rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR' },
  { uid: 'marlow-1', what: 'Marlow & Co site review', start: at(1, 10), end: at(1, 11), where: 'Marlow office, 4 Harbour Row' },
  { uid: 'dentist-1', what: 'Dentist', start: at(2, 9, 15), end: at(2, 10) },
  { uid: 'portage-1', what: 'Portage: pick a sending domain', start: at(3, 13), end: at(3, 13, 30) },
  { uid: 'fair-1', what: 'Type fair, Antwerp', day: true, start: at(8, 0), end: at(10, 0) },
];

function calendar(empty) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Google Inc//Google Calendar 70.9054//EN', 'X-WR-CALNAME:Studio', 'X-WR-TIMEZONE:Europe/London'];
  if (!empty)
    for (const e of EVENTS_ICS) {
      lines.push('BEGIN:VEVENT', `UID:${e.uid}@google.com`, `DTSTAMP:${stamp(NOW - D)}`);
      if (e.day) lines.push(`DTSTART;VALUE=DATE:${dayStamp(e.start)}`, `DTEND;VALUE=DATE:${dayStamp(e.end)}`);
      else lines.push(`DTSTART:${stamp(e.start)}`, `DTEND:${stamp(e.end)}`);
      if (e.rrule) lines.push(`RRULE:${e.rrule}`);
      lines.push(`SUMMARY:${e.what}`);
      if (e.where) lines.push(`LOCATION:${e.where.replace(/,/g, '\\,')}`);
      lines.push('STATUS:CONFIRMED', 'END:VEVENT');
    }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

/* ── Stripe ─────────────────────────────────────────────────────────────────────────────────────────── */

const unix = (t) => Math.floor(t / 1000);
function stripe(path, query, empty) {
  if (path === '/v1/balance')
    return [200, {
      object: 'balance',
      livemode: false,
      available: [{ amount: empty ? 0 : 1_284_250, currency: 'gbp', source_types: { card: empty ? 0 : 1_284_250 } }],
      pending: [{ amount: empty ? 0 : 312_900, currency: 'gbp', source_types: { card: empty ? 0 : 312_900 } }],
    }];
  if (path === '/v1/payouts') {
    const status = query.get('status');
    const data =
      empty || status !== 'in_transit'
        ? []
        : [{ id: 'po_1Q0stub0001', object: 'payout', amount: 486_000, currency: 'gbp', arrival_date: unix(Date.UTC(2026, 8, 5)), created: unix(NOW - 20 * H), status: 'in_transit', method: 'standard', type: 'bank_account' }];
    return [200, { object: 'list', url: '/v1/payouts', has_more: false, data }];
  }
  return [404, { error: { type: 'invalid_request_error', message: `Unrecognized request URL (GET: ${path}).` } }];
}

/* ── Mercury ────────────────────────────────────────────────────────────────────────────────────────── */

const MERCURY_ACCOUNTS = [
  { id: 'a1b2c3d4-0000-4000-8000-00000000c001', name: 'Mercury Checking ••4021', nickname: 'Ops', status: 'active', type: 'mercury', kind: 'checking', currentBalance: 48_210.55, availableBalance: 47_900.12, routingNumber: '091311229', accountNumber: '4021' },
  { id: 'a1b2c3d4-0000-4000-8000-00000000c002', name: 'Mercury Savings ••7788', nickname: 'Reserve', status: 'active', type: 'mercury', kind: 'savings', currentBalance: 120_000, availableBalance: 120_000, routingNumber: '091311229', accountNumber: '7788' },
];
const txn = (id, days, amount, who, o = {}) => ({ id, amount, counterpartyName: who, counterpartyId: `cp-${id}`, createdAt: iso(NOW - days * D), postedAt: iso(NOW - days * D + H), status: 'sent', kind: amount < 0 ? 'externalTransfer' : 'incomingDomesticWire', bankDescription: null, note: null, ...o });
const MERCURY_TXNS = {
  'a1b2c3d4-0000-4000-8000-00000000c001': [
    txn('t-0001', 1, -1_250, 'Figma', { mercuryCategory: 'Software' }),
    txn('t-0002', 2, 6_400, 'Marlow & Co', { mercuryCategory: 'Income' }),
    txn('t-0003', 3, -89.99, 'Vercel', { mercuryCategory: 'Software' }),
    txn('t-0004', 5, -2_100, 'Studio rent', { mercuryCategory: 'Rent' }),
    txn('t-0005', 0, -45.2, 'AWS', { status: 'pending', postedAt: null, mercuryCategory: 'Software' }),
  ],
  'a1b2c3d4-0000-4000-8000-00000000c002': [txn('t-0101', 4, 2_000, 'Transfer from Ops', { kind: 'internalTransfer' })],
};
function mercury(path, empty) {
  if (path === '/api/v1/accounts') return [200, { accounts: empty ? [] : MERCURY_ACCOUNTS }];
  const m = /^\/api\/v1\/account\/([^/]+)\/transactions$/u.exec(path);
  if (m !== null) {
    const list = empty ? [] : (MERCURY_TXNS[decodeURIComponent(m[1])] ?? []);
    return [200, { total: list.length, transactions: list }];
  }
  return [404, { errors: { message: 'Not found' } }];
}

/* ── The server ─────────────────────────────────────────────────────────────────────────────────────── */

const SERVICE = (host) =>
  host.endsWith('sentry.io') ? 'sentry' : host === 'api.stripe.com' ? 'stripe' : host === 'api.mercury.com' ? 'mercury' : /^(calendar\.google\.com|outlook\.(office365|live)\.com)$/u.test(host) ? 'calendar' : null;

/**
 * Start the stub on an ephemeral port. `asked` is every request it has answered, `host path?query status`, newest last.
 */
export async function startOutside({ empty = true } = {}) {
  let holdsNothing = empty;
  const asked = [];
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const [, host = '', ...rest] = url.pathname.split('/');
    const path = `/${rest.join('/')}`;
    const service = SERVICE(host);
    const send = (status, body, headers = {}) => {
      asked.push(`${host} ${path}${url.search} ${status}`);
      const text = typeof body === 'string' ? body : JSON.stringify(body);
      res.writeHead(status, { 'content-type': typeof body === 'string' ? 'text/calendar; charset=utf-8' : 'application/json', ...headers });
      res.end(text);
    };
    if (service === null) return send(404, { detail: `The stub does not answer for ${host}.` });
    /* THE KEY THE SCRIPT SENT, as each service takes it. The calendar's key IS its address, so the path is the check. */
    const key = KEYS[service].value;
    if (service === 'calendar') {
      if (`https://${host}${path}` !== key) return send(404, 'Not Found');
      return send(200, calendar(holdsNothing));
    }
    if (req.headers.authorization !== `Bearer ${key}`) return send(401, { error: 'unauthorized' });
    const [status, body, headers] =
      service === 'sentry' ? sentry(path, url.searchParams, holdsNothing) : service === 'stripe' ? stripe(path, url.searchParams, holdsNothing) : mercury(path, holdsNothing);
    return send(status, body, headers);
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const { port } = server.address();
  return {
    base: `http://127.0.0.1:${port}`,
    asked,
    setEmpty: (v) => {
      holdsNothing = v;
    },
    close: () => new Promise((ok) => server.close(() => ok())),
  };
}

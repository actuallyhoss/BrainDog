/**
 * Your calendar's next events, from its secret address (an ICS or webcal link), into Events every hour.
 *
 * THE ADDRESS IS A SECRET, AND IT STAYS IN THE KEYS (1.1.0). It is the link a calendar gives to read it from elsewhere
 * ("Secret address in iCal format" in Google Calendar, "Publish calendar" in Outlook), and anyone who has it can read the
 * calendar, so it goes in the record's keys under a name, and the add-on's setting holds only that name (a `secret`
 * setting). The script asks the host for it by that name, `ctx.fetch(null, { address })`: the host opens the key, reads
 * `webcal://` as `https://`, sends it only if its host is one this add-on declares (Google's and Outlook's), and the
 * script never holds it. In 1.0.0 the link sat in a plain setting. Since 2.1.1 the key is optional: with none held the
 * run reads nothing and ends quietly, since Connect Google fills the same Events. (iCloud's published calendars live
 * on a hundred numbered hosts, pNN-caldav, and an add-on names each host it calls, so iCloud waits.)
 *
 * WHAT IS KEPT: the events from yesterday to sixty days ahead, a repeating event once for each time it falls in that
 * window (daily, weekly, monthly or yearly, with its interval, count, end, weekdays and the dates it skips), a moved
 * occurrence where it was moved to, and nothing cancelled. Each is one row, found again by its own key (`key`: the
 * event's id and the start of the occurrence), so an hourly run changes only what moved.
 *
 * AN EVENT THAT LEAVES THE CALENDAR is marked gone (`gone`) rather than deleted, since a script writes and never
 * deletes; every page and widget reads `gone is not true`.
 *
 * TIMES ARE THE CALENDAR'S OWN WALL CLOCK. The sandbox has no time zone database, so the zone each time is in is read
 * from the calendar file itself (its VTIMEZONE blocks, with their summer and winter rules), and every time is said in
 * the calendar's own zone (`X-WR-TIMEZONE`, else the first zone the file defines), as `day` and `time`. `starts` holds
 * the same moment as an instant. A zone the file does not define is read as the calendar's own.
 *
 * NOTHING OUTSIDE `run` IS READ: the text of this file is the script (`calendar.pack.json`).
 */

export default async function run(ctx) {
  const BACK = 1;
  const AHEAD = 60;
  const MOST = 400;
  const PAGE = 50;
  const DAY = 86400000;
  const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

  const config = ctx.config && typeof ctx.config === 'object' ? ctx.config : {};
  const label = typeof config.address === 'string' ? config.address.trim() : '';
  if (label === '') {
    ctx.log('No key is named for the calendar link, so nothing was read. Name one on this add-on\'s page and put the link in your keys under it.');
    return null;
  }
  /* THE LINK STAYS IN THE KEYS. The host opens it, holds its host to this add-on's three, and sends it; this script
     never sees it.
     NO KEY IS NOT A FAULT (2.1.1). The link is one of two ways in, beside Connect Google, so the add-on installs without
     it (`optional` on the setting). Both hosts answer a key the keychain does not hold with the same sentence, before
     anything is sent, and that one answer ends the run quietly: nothing failed, so nobody is told or asked anything. Any
     other refusal, a key that will not open or an address at a host this add-on does not declare, still fails the run. */
  let answered;
  try {
    answered = await ctx.fetch(null, { address: label });
  } catch (e) {
    if (/is not in the keychain/.test(String(e && e.message ? e.message : e))) {
      ctx.log(`No key called ${label} is in your keys, so the link was not read. Connect Google, or add the link under that name.`);
      return null;
    }
    throw e;
  }
  if (!answered.ok) throw new Error(`The calendar answered ${answered.status}, so the events stay as they were. Check the link in your keys is still the secret one.`);
  const text = await answered.text();
  if (!/BEGIN:VCALENDAR/.test(text)) throw new Error('That address did not answer a calendar, so nothing was written.');

  /* ── reading the file ── */
  const lines = text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
  const unescape = (v) => v.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
  const prop = (line) => {
    const colon = line.search(/:(?=(?:[^"]*"[^"]*")*[^"]*$)/);
    if (colon < 0) return null;
    const head = line.slice(0, colon).split(';');
    const params = {};
    for (const p of head.slice(1)) {
      const eq = p.indexOf('=');
      if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '');
    }
    return { name: head[0].toUpperCase(), params, value: line.slice(colon + 1) };
  };
  const blocks = [];
  const stack = [];
  let calName = '';
  let calZone = '';
  for (const line of lines) {
    const p = prop(line);
    if (!p) continue;
    if (p.name === 'BEGIN') {
      const b = { type: p.value.toUpperCase(), props: [], children: [] };
      if (stack.length > 0) stack[stack.length - 1].children.push(b);
      else blocks.push(b);
      stack.push(b);
    } else if (p.name === 'END') stack.pop();
    else if (stack.length > 0) stack[stack.length - 1].props.push(p);
    if (p.name === 'X-WR-CALNAME' && stack.length <= 1) calName = unescape(p.value);
    if (p.name === 'X-WR-TIMEZONE' && stack.length <= 1) calZone = p.value;
  }
  const cal = blocks.find((b) => b.type === 'VCALENDAR') || { props: [], children: [] };
  const first = (b, name) => b.props.find((p) => p.name === name);
  const all = (b, name) => b.props.filter((p) => p.name === name);

  /* ── zones from the file: each a list of rules, an offset in minutes and the yearly day it starts ── */
  const offsetOf = (v) => {
    const m = /^([+-])(\d{2})(\d{2})/.exec(v || '');
    return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
  };
  const rruleOf = (v) => Object.fromEntries(String(v || '').split(';').filter(Boolean).map((kv) => kv.split('=')).map(([k, x]) => [k.toUpperCase(), x]));
  const zones = {};
  for (const z of cal.children.filter((b) => b.type === 'VTIMEZONE')) {
    const id = (first(z, 'TZID') || {}).value;
    if (!id) continue;
    zones[id] = z.children
      .filter((c) => c.type === 'STANDARD' || c.type === 'DAYLIGHT')
      .map((c) => ({ to: offsetOf((first(c, 'TZOFFSETTO') || {}).value), start: (first(c, 'DTSTART') || {}).value || '', rule: rruleOf((first(c, 'RRULE') || {}).value) }));
  }
  if (calZone === '' || !zones[calZone]) calZone = Object.keys(zones)[0] || calZone;

  /* The day a yearly rule falls on in a year: BYMONTH and one BYDAY such as 2SU or -1SU. */
  const ruleDay = (rule, year) => {
    const month = Number(rule.BYMONTH) - 1;
    const m = /^(-?\d)?([A-Z]{2})$/.exec(rule.BYDAY || '');
    if (!(month >= 0) || !m) return null;
    const want = WEEKDAYS.indexOf(m[2]);
    const nth = m[1] ? Number(m[1]) : 1;
    if (nth > 0) {
      const d = new Date(Date.UTC(year, month, 1));
      const shift = (want - d.getUTCDay() + 7) % 7;
      return Date.UTC(year, month, 1 + shift + (nth - 1) * 7);
    }
    const last = new Date(Date.UTC(year, month + 1, 0));
    const shift = (last.getUTCDay() - want + 7) % 7;
    return Date.UTC(year, month + 1, 0 - shift + (nth + 1) * 7);
  };
  /* The offset in minutes a zone is at, at a moment given as its own wall clock in ms. */
  const offsetAt = (zone, wallMs) => {
    const rules = zones[zone];
    if (!rules || rules.length === 0) return zone === 'UTC' || zone === 'Etc/UTC' ? 0 : null;
    const year = new Date(wallMs).getUTCFullYear();
    let best = null;
    for (const r of rules) {
      const hm = /T(\d{2})(\d{2})/.exec(r.start);
      const at = hm ? (Number(hm[1]) * 60 + Number(hm[2])) * 60000 : 0;
      for (const y of [year - 1, year]) {
        const d = r.rule.FREQ === 'YEARLY' ? ruleDay(r.rule, y) : wallOf(r.start);
        if (d === null || d === undefined) continue;
        const when = r.rule.FREQ === 'YEARLY' ? d + at : d;
        if (when <= wallMs && (best === null || when > best.when)) best = { when, to: r.to };
      }
    }
    return best ? best.to : rules[0].to;
  };
  /* An ICS date or date-time as wall-clock ms (read as if UTC), and whether it is a whole day or already UTC. */
  function wallOf(v) {
    const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(v || '');
    return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] || 0), Number(m[5] || 0), Number(m[6] || 0)) : null;
  }
  /* A DATE OR DATE-TIME PROPERTY AT ONE OF ITS OCCURRENCES (`raw`, in the property's own clock: UTC when it ends in Z,
     else its zone's wall clock), said as the calendar's wall clock and as an instant. Repeating is done in the
     event's own clock, so a weekly 9:00 in Cairo stays 9:00 across the change of the clocks. */
  const timeAt = (p, raw) => {
    if (!p || raw === null) return null;
    const allDay = p.params.VALUE === 'DATE' || /^\d{8}$/.test(p.value);
    if (allDay) return { allDay: true, wall: raw, utc: null };
    const utcGiven = /Z$/.test(p.value);
    const zone = p.params.TZID || calZone;
    const off = utcGiven ? 0 : offsetAt(zone, raw);
    const utc = raw - (off === null ? (offsetAt(calZone, raw) || 0) : off) * 60000;
    const here = offsetAt(calZone, utc) || 0;
    return { allDay: false, wall: utc + here * 60000, utc };
  };
  const timeOf = (p) => (p ? timeAt(p, wallOf(p.value)) : null);

  /* ── the window and each event's occurrences in it ── */
  const today = Date.parse(`${ctx.today()}T00:00:00Z`);
  const from = today - BACK * DAY;
  const to = today + (AHEAD + 1) * DAY;
  const iso = (ms) => new Date(ms).toISOString();
  const dayOf = (ms) => iso(ms).slice(0, 10);
  const hm = (ms) => iso(ms).slice(11, 16);
  const occurrences = (start, rule, exdates) => {
    if (!rule.FREQ) return [start];
    const out = [];
    const step = Number(rule.INTERVAL) > 0 ? Number(rule.INTERVAL) : 1;
    const count = Number(rule.COUNT) > 0 ? Number(rule.COUNT) : Infinity;
    const until = rule.UNTIL ? wallOf(rule.UNTIL.slice(0, 15)) : null;
    const days = rule.BYDAY ? rule.BYDAY.split(',').map((d) => WEEKDAYS.indexOf(d.replace(/^-?\d/, ''))).filter((d) => d >= 0) : null;
    const d0 = new Date(start);
    /* A RULE WITH NO COUNT STARTS NEAR THE WINDOW, never at an event first held years ago. The period is read long, so the
       start is never past the window. */
    const period = { DAILY: DAY, WEEKLY: 7 * DAY, MONTHLY: 31 * DAY, YEARLY: 366 * DAY }[rule.FREQ] * step;
    const i0 = count === Infinity && period > 0 ? Math.max(0, Math.floor((from - DAY - start) / period) - 2) : 0;
    let n = 0;
    for (let i = i0; i < i0 + 2000 && n < count; i++) {
      let candidates;
      if (rule.FREQ === 'DAILY') candidates = [start + i * step * DAY];
      else if (rule.FREQ === 'WEEKLY') {
        const weekStart = start - ((d0.getUTCDay() - 1 + 7) % 7) * DAY + i * step * 7 * DAY;
        candidates = (days && days.length > 0 ? days : [d0.getUTCDay()]).map((w) => weekStart + ((w - 1 + 7) % 7) * DAY).filter((t) => t >= start).sort((a, b) => a - b);
      } else if (rule.FREQ === 'MONTHLY') {
        const t = Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() + i * step, d0.getUTCDate(), d0.getUTCHours(), d0.getUTCMinutes());
        candidates = new Date(t).getUTCDate() === d0.getUTCDate() ? [t] : [];
      } else if (rule.FREQ === 'YEARLY') {
        const t = Date.UTC(d0.getUTCFullYear() + i * step, d0.getUTCMonth(), d0.getUTCDate(), d0.getUTCHours(), d0.getUTCMinutes());
        candidates = new Date(t).getUTCMonth() === d0.getUTCMonth() ? [t] : [];
      } else return [start];
      for (const t of candidates) {
        if (n >= count || (until !== null && t > until + DAY)) return out;
        n += 1;
        if (!exdates.has(t)) out.push(t);
      }
      if (candidates.length > 0 && candidates[candidates.length - 1] > to + 7 * DAY) break;
    }
    return out;
  };

  const events = cal.children.filter((b) => b.type === 'VEVENT');
  const moved = new Map();
  for (const e of events) {
    const rid = first(e, 'RECURRENCE-ID');
    const uid = (first(e, 'UID') || {}).value;
    if (rid && uid) moved.set(`${uid}@${wallOf(rid.value)}`, e);
  }
  const wanted = new Map();
  /* One occurrence of an event, `raw` the start in the event's own clock. */
  const add = (e, raw, key) => {
    const startProp = first(e, 'DTSTART');
    const endProp = first(e, 'DTEND');
    const raw0 = startProp ? wallOf(startProp.value) : null;
    const s = timeAt(startProp, raw);
    if (!s || raw0 === null) return;
    const end = endProp ? timeAt(endProp, wallOf(endProp.value) === null ? null : wallOf(endProp.value) + (raw - raw0)) : null;
    const wall = s.wall;
    if (wall < from || wall >= to) return;
    if (((first(e, 'STATUS') || {}).value || '').toUpperCase() === 'CANCELLED') return;
    wanted.set(key, {
      key,
      what: unescape((first(e, 'SUMMARY') || {}).value || 'Busy'),
      day: dayOf(wall),
      time: s.allDay ? null : hm(wall),
      until: end && !end.allDay ? hm(end.wall) : null,
      all_day: s.allDay,
      starts: s.allDay ? null : iso(s.utc),
      place: unescape((first(e, 'LOCATION') || {}).value || '') || null,
      calendar: calName || null,
      gone: false,
    });
  };
  for (const e of events) {
    const uid = (first(e, 'UID') || {}).value;
    if (!uid || first(e, 'RECURRENCE-ID')) continue;
    const startProp = first(e, 'DTSTART');
    const raw = startProp ? wallOf(startProp.value) : null;
    if (raw === null) continue;
    const rule = rruleOf((first(e, 'RRULE') || {}).value);
    const exdates = new Set(all(e, 'EXDATE').flatMap((p) => p.value.split(',')).map((v) => wallOf(v)));
    for (const t of occurrences(raw, rule, exdates)) {
      if (t >= to + DAY) break;
      const swap = moved.get(`${uid}@${t}`);
      if (swap) {
        const ms = first(swap, 'DTSTART');
        if (ms) add(swap, wallOf(ms.value), `${uid}@${dayOf(t)}`);
      } else add(e, t, rule.FREQ ? `${uid}@${dayOf(t)}` : uid);
      if (wanted.size >= MOST) break;
    }
    if (wanted.size >= MOST) {
      ctx.log(`The calendar holds more than ${MOST} events in the next ${AHEAD} days, so the rest were left out.`);
      break;
    }
  }

  /* ── kept in step with Events ── */
  const held = new Map();
  let below = null;
  for (;;) {
    const parts = [{ field: 'day', gte: dayOf(from) }, ...(below === null ? [] : [{ field: 'seq', lt: below }])];
    const page = await ctx.record.list('events', { all: parts });
    for (const r of page) held.set(String(r.fields.key), r);
    if (page.length < PAGE) break;
    below = Math.min(...page.map((r) => r.seq));
  }
  let wrote = 0;
  let gone = 0;
  const same = (a, b) => (a === undefined || a === null ? b === null || b === undefined : a === b);
  for (const [key, fields] of wanted) {
    const row = held.get(key);
    if (!row) {
      ctx.write('events', Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== null)));
      wrote += 1;
      continue;
    }
    const patch = {};
    for (const [k, v] of Object.entries(fields)) if (!same(row.fields[k], v)) patch[k] = v;
    if (Object.keys(patch).length === 0) continue;
    ctx.update(`events#${row.seq}`, patch, row.version);
    wrote += 1;
  }
  for (const [key, row] of held) {
    if (wanted.has(key) || row.fields.gone === true) continue;
    ctx.update(`events#${row.seq}`, { gone: true }, row.version);
    gone += 1;
  }
  ctx.log(`${wanted.size} ${wanted.size === 1 ? 'event' : 'events'} in the next ${AHEAD} days; ${wrote} written${gone > 0 ? `, ${gone} gone from the calendar` : ''}.`);
  return { events: wanted.size, wrote, gone };
}

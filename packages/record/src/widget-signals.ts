/**
 * WHAT THE RECORD NOTICES ABOUT USE, read into widget signals S1 to S6 (widgets plan §6.1). Rules over what the record
 * already keeps, never a model, and nothing about use leaves the record (§6.4).
 *
 * - S1, a question asked again: the person's own Slash questions on three days in thirty that one widget answers.
 * - S2, a place opened often: a page opened five times on three days in fourteen, whose lead a widget shows.
 * - S3, something new: an add-on that ships widgets installed in the last fortnight, a new savings goal.
 * - S4, time: three bills due in the next seven days, a trip inside a fortnight.
 * - S5, a project opened daily, a key number pinned with no numbers widget.
 * - S6, removal: a widget on the board that has drawn nothing for three weeks, and has been on the board that long.
 *
 * WHOSE USE. S1 reads only the asking person's threads. Page opens are counted for the whole record (`observation`) and,
 * since migration 47, for each person beside it (`observation_who`). A record one person uses reads the whole record's
 * count, as it always did; a shared one reads the asking person's own (§6.4, risk 7, W8), so one person's habits never
 * suggest to another. S6 runs on a board that is the asker's own: the whole record's Today for its owner, a member's own
 * Today for that member, and never the owner's board drawn for a member. S2 and S5 wait fourteen days of use. Opens
 * through a shared link are not counted where they are written, so not here either.
 *
 * WHAT IS WEIGHED, KEPT AND BRAKED IS `design-agent.ts`'s (`widgetOffers`). Here is only the reading.
 *
 * WHAT EACH WIDGET IS NOTICED FOR IS ITS OWN DECLARATION'S (SHL-A22, 30 October): the question it answers (`asked`), the
 * pages whose lead it shows (`leads`), a row new in its list (`fresh`), a day close by (`near`) and bills piling up
 * (`due`). Before, this file held a table of page slugs and widget ids and asked two add-ons' lists by name, so the core
 * knew Goals and Trips. The one-project widget is the one whose blank is a project, and the key numbers' the one drawn
 * as the kernel's `kpis` block.
 */

import type { Sql } from '@braindog/ports';
import { WIDGETS, askedOf, type WidgetTemplate } from 'braindog-render';

import { WIDGET_YOUNG_DAYS, type WidgetSignal } from './design-agent.ts';

const DAY_MS = 86_400_000;
const dayOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** What the record holds, as the signals read it. */
export type SignalRead = {
  sql: Sql;
  nowMs: number;
  /** The person asking: their own Slash questions are S1's. `null` reads no questions. */
  person: string | null;
  /** The lists this caller reads. */
  lists: ReadonlySet<string>;
  /** The figures the record declares, by id. */
  figures: ReadonlySet<string>;
  /** The add-ons the record has installed, by id. */
  addons: ReadonlySet<string>;
  /** For each widget that declares `due`, how many of its rows fall due as it says, by widget id; absent where not read. */
  dues?: ReadonlyMap<string, number>;
  /** The board's widgets as drawn now: each one's key, what it reads, and whether it drew nothing. */
  board: readonly BoardRead[];
  /** The catalogue with the widgets the add-ons ship (`withShipped`), and each add-on's name. Absent, the core's own. */
  templates?: readonly WidgetTemplate[];
  addonName?: (id: string) => string;
};

/** One widget on the board as the signals read it. */
export type BoardRead = { key: string; heading?: string; source?: string; where?: string; metric?: string; empty: boolean };

/** Whether the record holds what a widget reads: its lists and figures. */
export function needsMet(t: WidgetTemplate, read: Pick<SignalRead, 'lists' | 'figures'>): boolean {
  return (t.needs.lists ?? []).every((l) => read.lists.has(l)) && (t.needs.figures ?? []).every((f) => read.figures.has(f));
}

/** The widget of one project: the first whose blank is a project. */
const ofProject = (templates: readonly WidgetTemplate[]): WidgetTemplate | undefined => templates.find((t) => (t.blanks ?? []).some((b) => b.id === 'project'));
const byId = (read: SignalRead, id: string): WidgetTemplate | undefined => (read.templates ?? WIDGETS).find((t) => t.id === id);
/** The list a widget's block reads, by id, or `null` for one over something the record keeps for itself. */
const listOf = (t: WidgetTemplate): string | null => (typeof t.block.source === 'string' && t.block.source.startsWith('register.') ? t.block.source.slice('register.'.length) : null);
/** A row's field as SQLite reads it out of the row's fields. Fields are checked as plain words where they are declared. */
const at = (field: string): string => `$.${field.replace(/[^a-z0-9_]/gu, '')}`;

/* ── S1: a question asked again ─────────────────────────────────────────────────────────────────────────────────── */

/** The days a question is counted over, and the days it must be asked on. */
export const ASKED_DAYS = 30;
export const ASKED_ON_DAYS = 3;
/** The most questions read: a month of a busy person's asking. */
const QUESTIONS_READ = 2000;

/** A question cut to a short quote for the reason line. */
const quoted = (text: string): string => {
  const one = text.replace(/\s+/gu, ' ').trim().replace(/[?.!]+$/u, '');
  return one.length > 60 ? `${one.slice(0, 57).trimEnd()}…` : one;
};

function askedAgain(read: SignalRead, projects: readonly string[]): WidgetSignal[] {
  if (read.person === null) return [];
  let rows: { text: string; ts: string }[] = [];
  try {
    rows = read.sql.all<{ text: string; ts: string }>(
      `SELECT t.text AS text, t.ts AS ts FROM slash_turn t JOIN slash_thread h ON h.id = t.thread WHERE h.person = ? AND t.role = 'you' AND t.ts >= ? ORDER BY t.ts DESC LIMIT ${QUESTIONS_READ}`,
      read.person,
      dayOf(read.nowMs - ASKED_DAYS * DAY_MS),
    );
  } catch {
    /* A RECORD SLASH NEVER SPOKE ON HAS NO THREADS YET: nothing asked. */
    return [];
  }
  const templates = read.templates ?? WIDGETS;
  const asks = askedOf(templates);
  /* A QUESTION NAMING A PROJECT IS ABOUT THAT PROJECT unless it asks after something else: words that only ask what the
     one-project widget already shows ("Kiln tasks") do not take it elsewhere. */
  const pulse = ofProject(templates);
  const within = new Set(pulse?.needs.lists ?? []);
  const shows = (id: string): boolean => {
    const t = templates.find((x) => x.id === id);
    return t !== undefined && (t.needs.lists ?? []).length > 0 && (t.needs.lists ?? []).every((l) => within.has(l));
  };
  const by = new Map<string, { widget: string; blank?: { id: string; value: string }; days: Set<string>; newest: string; text: string; about: string }>();
  for (const r of rows) {
    const text = String(r.text);
    const project = pulse === undefined ? undefined : projects.find((p) => p.length > 2 && new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}\\b`, 'iu').test(text));
    const hit = project !== undefined && !asks.some((a) => !shows(a.widget) && a.re.test(text)) ? { widget: pulse!.id, about: project } : asks.find((a) => a.re.test(text));
    if (hit === undefined) continue;
    const onProject = project !== undefined && hit.widget === pulse?.id;
    const key = onProject ? `${hit.widget}:${project}` : hit.widget;
    const day = String(r.ts).slice(0, 10);
    const was = by.get(key);
    if (was === undefined) by.set(key, { widget: hit.widget, ...(onProject ? { blank: { id: 'project', value: project! } } : {}), days: new Set([day]), newest: day, text, about: hit.about });
    else was.days.add(day);
  }
  const out: WidgetSignal[] = [];
  for (const g of by.values()) {
    if (g.days.size < ASKED_ON_DAYS) continue;
    const t = byId(read, g.widget);
    if (t === undefined || !needsMet(t, read)) continue;
    out.push({ signal: 'S1', widget: g.widget, ...(g.blank ? { blank: g.blank } : {}), why: `You asked “${quoted(g.text)}” on ${g.days.size} days this month.`, seen: g.newest, draws: true, asked: g.days.size });
  }
  return out;
}

/* ── S2 and S5: places opened often ─────────────────────────────────────────────────────────────────────────────── */

/** The pages whose lead a widget shows, by slug, as each widget declares them (`leads`): the first to claim a page has it. */
export function pageWidgets(templates: readonly WidgetTemplate[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const t of templates) for (const slug of t.leads ?? []) if (!out.has(slug)) out.set(slug, t.id);
  return out;
}

/** S2: opened this many times on this many days in fourteen. */
export const OPENS = { times: 5, days: 3, within: 14 } as const;
/** S5: a project's page opened on this many of the last seven days. */
export const DAILY = { days: 5, within: 7 } as const;

const slugOf = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/gu, '');

/** Where a page's opens are read from: the whole record's, or one person's (migration 47). */
type Opens = { from: 'observation' | 'observation_who'; who: string[] };
const opensOf = (who: string | null): Opens => (who === null ? { from: 'observation', who: [] } : { from: 'observation_who', who: [who] });
const andWho = (o: Opens): string => (o.who.length === 0 ? '' : ' AND who = ?');

function openedOften(read: SignalRead, pages: ReadonlyMap<string, string>, projects: readonly string[], o: Opens): WidgetSignal[] {
  const since = dayOf(read.nowMs - OPENS.within * DAY_MS);
  const rows = read.sql.all<{ subject: string; days: number; n: number; last: string }>(
    `SELECT subject, count(DISTINCT day) AS days, total(n) AS n, max(day) AS last FROM ${o.from} WHERE kind = 'page.render' AND day >= ?${andWho(o)} GROUP BY subject`,
    since,
    ...o.who,
  );
  const week = dayOf(read.nowMs - DAILY.within * DAY_MS);
  const out: WidgetSignal[] = [];
  const bySlug = new Map(projects.map((p) => [slugOf(p), p] as const));
  const templates = read.templates ?? WIDGETS;
  const leads = pageWidgets(templates);
  const pulse = ofProject(templates);
  for (const r of rows) {
    const subject = String(r.subject).replace(/^page\./u, '');
    /* S5: A PROJECT OPENED EVERY DAY, read over the last seven days alone. */
    const project = bySlug.get(subject);
    if (project !== undefined) {
      const daily = read.sql.one<{ d: number }>(`SELECT count(DISTINCT day) AS d FROM ${o.from} WHERE kind = 'page.render' AND subject = ? AND day >= ?${andWho(o)}`, r.subject, week, ...o.who)?.d ?? 0;
      if (daily >= DAILY.days && pulse !== undefined && needsMet(pulse, read))
        out.push({ signal: 'S5', widget: pulse.id, blank: { id: 'project', value: project }, why: `You open ${project} every day.`, seen: String(r.last), draws: true });
      continue;
    }
    const widget = leads.get(subject);
    if (widget === undefined || Number(r.n) < OPENS.times || Number(r.days) < OPENS.days) continue;
    const t = byId(read, widget);
    if (t === undefined || !needsMet(t, read)) continue;
    const title = pages.get(subject) ?? t.title;
    out.push({ signal: 'S2', widget, why: `You opened ${title} on ${Number(r.days)} of the last 14 days.`, seen: String(r.last), draws: true });
  }
  return out;
}

/**
 * What came with an add-on, in a line: its name and what the widget shows, the widget's own sentence (`says`) with its
 * first letter lowered, or its title where it has none. "New with Money: the cash you have now and how long it lasts."
 */
function newWith(name: string, t: { title: string; says?: string }): string {
  const says = typeof t.says === 'string' ? t.says.trim() : '';
  if (says === '') return `New with ${name}: ${t.title}.`;
  const lowered = /^[A-Z][a-z]/u.test(says) ? `${says[0]!.toLowerCase()}${says.slice(1)}` : says;
  return `New with ${name}: ${/[.!?]$/u.test(lowered) ? lowered : `${lowered}.`}`;
}

/* ── S3: something new ─────────────────────────────────────────────────────────────────────────────────────────── */

/** S3 looks back this many days for an add-on installed or a goal made. */
export const NEW_WITHIN = 14;

function somethingNew(read: SignalRead): WidgetSignal[] {
  const since = new Date(read.nowMs - NEW_WITHIN * DAY_MS).toISOString();
  const out: WidgetSignal[] = [];
  const installed = read.sql.all<{ target: string; ts: string }>(
    "SELECT target, max(ts) AS ts FROM event WHERE target GLOB 'pack:*' AND target_kind = 'pack' AND kind = 'install' AND ts >= ? GROUP BY target",
    since,
  );
  for (const e of installed) {
    const id = String(e.target).slice('pack:'.length);
    /* THE ADD-ON'S FIRST WIDGET THE RECORD CAN FILL NOW, the catalogue's or one the add-on ships itself: offering one it
       cannot draw would be an empty frame. */
    const t = (read.templates ?? WIDGETS).find((w) => w.needs.addon === id && needsMet(w, read));
    const name = read.addonName?.(id);
    if (name === undefined) continue;
    if (t === undefined) continue;
    /* SAID AS WHAT IT SHOWS, NOT AS A TEMPLATE (1 Nov): "You added People. People to get back to can sit on Today." named
       the list twice and said nothing of why. Now it is what came with the add-on and what the widget shows, in its own
       words: "New with People: who you have not been in touch with lately." */
    out.push({ signal: 'S3', widget: t.id, why: newWith(name, t), seen: String(e.ts).slice(0, 10), draws: true });
  }
  /* A ROW NEW IN A LIST A WIDGET SAYS IT NOTICES (`fresh`): a savings goal just set, said in the widget's own words. */
  for (const t of read.templates ?? WIDGETS) {
    const list = t.fresh === undefined ? null : listOf(t);
    if (list === null || !read.lists.has(list) || !needsMet(t, read)) continue;
    const row = read.sql.one<{ name: string | null; at: string }>(
      "SELECT json_extract(fields, '$.name') AS name, created_at AS at FROM entry WHERE register = ? AND deleted_at IS NULL AND created_at >= ? ORDER BY created_at DESC LIMIT 1",
      list,
      since,
    );
    if (row !== undefined)
      out.push({ signal: 'S3', widget: t.id, why: row.name ? t.fresh!.says.replace(/\{\{name\}\}/gu, row.name) : t.fresh!.unnamed, seen: String(row.at).slice(0, 10), draws: true });
  }
  return out;
}

/* ── S4: time ──────────────────────────────────────────────────────────────────────────────────────────────────── */


const SAY_COUNT = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
const counted = (n: number): string => SAY_COUNT[n] ?? n.toLocaleString('en');

function comingUp(read: SignalRead): WidgetSignal[] {
  const today = dayOf(read.nowMs);
  const out: WidgetSignal[] = [];
  for (const t of read.templates ?? WIDGETS) {
    /* BILLS PILING UP: as many rows as the widget says make a reason, counted as it says (`due`). */
    const due = read.dues?.get(t.id);
    if (t.due !== undefined && due !== undefined && due >= t.due.least && needsMet(t, read))
      out.push({ signal: 'S4', widget: t.id, why: t.due.says.replace(/\{\{count\}\}/gu, counted(due)), seen: today, draws: true });
    /* A DAY CLOSE BY: the soonest row of its list starting inside the days it says (`near`), a trip inside a fortnight. */
    const list = t.near === undefined ? null : listOf(t);
    if (list === null || !read.lists.has(list)) continue;
    const near = t.near!;
    const row = read.sql.one<{ name: string | null; from: string }>(
      `SELECT json_extract(fields, ?) AS name, json_extract(fields, ?) AS "from" FROM entry WHERE register = ? AND deleted_at IS NULL AND json_extract(fields, ?) >= ? AND json_extract(fields, ?) <= ? ORDER BY json_extract(fields, ?) LIMIT 1`,
      at(near.name ?? 'name'),
      at(near.day),
      list,
      at(near.day),
      today,
      at(near.day),
      dayOf(read.nowMs + near.within * DAY_MS),
      at(near.day),
    );
    if (row !== undefined) {
      const days = Math.max(0, Math.round((Date.parse(`${row.from}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / DAY_MS));
      out.push({ signal: 'S4', widget: t.id, why: `${row.name ?? near.unnamed} is ${days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`}.`, seen: today, draws: true });
    }
  }
  return out;
}

/* ── S5: a key number pinned ───────────────────────────────────────────────────────────────────────────────────── */

function pinned(read: SignalRead): WidgetSignal[] {
  if (!read.lists.has('kpis')) return [];
  const pin = read.sql.one<{ name: string | null; at: string }>(
    "SELECT json_extract(fields, '$.name') AS name, updated_at AS at FROM entry WHERE register = 'kpis' AND deleted_at IS NULL AND json_extract(fields, '$.today') = 'pinned' ORDER BY updated_at DESC LIMIT 1",
  );
  /* THE WIDGET DRAWN AS THE KERNEL'S KEY NUMBERS, whichever add-on brings it. */
  const t = (read.templates ?? WIDGETS).find((w) => w.block.kind === 'kpis');
  if (pin === undefined || t === undefined || !needsMet(t, read)) return [];
  return [{ signal: 'S5', widget: t.id, why: pin.name ? `You pinned ${pin.name}.` : 'You pinned a key number.', seen: String(pin.at).slice(0, 10), draws: true }];
}

/* ── S6: a widget that draws nothing ───────────────────────────────────────────────────────────────────────────── */

/** S6: drawn this many days with nothing in what it reads. */
export const EMPTY_DAYS = 21;

/**
 * SINCE WHEN A WIDGET HAS STOOD ON THE BOARD, as best the record knows it: the later of the record's birth and the day
 * the widget went on. A widget can't have been empty for three weeks on a record younger than that (E1, 31 Oct: a
 * minute-old BrainDog was asked to take Working now off Today "after three weeks").
 *
 * - A member's own Today (`home.today`) keeps no history, only when it was last arranged: that is the date read, so the
 *   question waits three weeks after any change to it rather than guess.
 * - The record's Today is `page.home`: the oldest version in the unbroken run of versions, newest back, that holds the
 *   widget's key. A widget the newest version does not hold was not put there by the record (a board handed from the
 *   screen), and is taken as put there now.
 * - No `page.home` at all: the board is the app's first one, there since the record was made.
 */
function onBoardSince(read: SignalRead, key: string, ownBoardKept: boolean): string {
  const now = new Date(read.nowMs).toISOString();
  const born = read.sql.one<{ at: string | null }>('SELECT created_at AS at FROM record WHERE singleton = 1')?.at ?? now;
  let added: string | null = null;
  if (ownBoardKept) {
    added = read.sql.one<{ at: string }>("SELECT updated_at AS at FROM pref WHERE person_id = ? AND key = 'home.today'", read.person)?.at ?? now;
  } else {
    const versions = read.sql.all<{ at: string; has: number }>(
      "SELECT created_at AS at, EXISTS (SELECT 1 FROM json_each(body, '$.blocks') WHERE json_extract(value, '$.key') = ?) AS has FROM declaration WHERE id = 'page.home' AND kind = 'page' ORDER BY version DESC",
      key,
    );
    if (versions.length > 0) {
      added = now;
      for (const v of versions) {
        if (!v.has) break;
        added = v.at;
      }
    }
  }
  return added !== null && added > born ? added : born;
}

function emptyForWeeks(read: SignalRead): WidgetSignal[] {
  const before = new Date(read.nowMs - EMPTY_DAYS * DAY_MS).toISOString();
  const ownKept = read.person !== null && read.sql.one("SELECT 1 AS y FROM pref WHERE person_id = ? AND key = 'home.today'", read.person) !== undefined;
  const out: WidgetSignal[] = [];
  for (const b of read.board) {
    if (!b.empty || typeof b.source !== 'string') continue;
    /* ON THE BOARD THREE WEEKS FIRST: an empty list on day 0 has had nothing to show for minutes, not weeks. */
    if (onBoardSince(read, b.key, ownKept) > before) continue;
    /* WHAT IT READS HAS NOT MOVED IN THREE WEEKS: a list with nothing written since, or no agent heard from since. */
    const list = b.source === 'sessions.working' ? 'session' : b.source.startsWith('register.') ? b.source.slice('register.'.length) : null;
    if (list === null || (list !== 'session' && !read.lists.has(list))) continue;
    const newest = read.sql.one<{ at: string | null }>('SELECT max(updated_at) AS at FROM entry WHERE register = ? AND deleted_at IS NULL', list)?.at ?? null;
    if (newest !== null && newest >= before) continue;
    const name = b.heading ?? 'This widget';
    out.push({ signal: 'S6', widget: 'remove', remove: b.key, why: `${name} has had nothing to show for three weeks. Take it off Today?`, seen: dayOf(read.nowMs), draws: true });
  }
  return out;
}

/* ── all of them ───────────────────────────────────────────────────────────────────────────────────────────────── */

/** Whether one person uses this record: opens are the record's, so only then do they say anything about one person. */
export const onePerson = (sql: Sql): boolean => (sql.one<{ n: number }>('SELECT count(*) AS n FROM person WHERE suspended_at IS NULL')?.n ?? 0) <= 1;

/** Whether a person keeps a Today of their own (`OWN_TODAY`, a member's), or is the record's owner, whose Today is the record's. */
export const ownBoard = (sql: Sql, person: string | null): boolean =>
  person !== null &&
  (sql.one("SELECT 1 AS y FROM pref WHERE person_id = ? AND key = 'home.today'", person) !== undefined ||
    sql.one("SELECT 1 AS y FROM member m JOIN person p ON p.id = m.person_id WHERE m.person_id = ? AND m.register = '*' AND m.level = 'owner' AND p.suspended_at IS NULL", person) !== undefined);

/** How many days the record has been used: since its first counted open, the person's own where `who` names one. */
export function daysUsed(sql: Sql, nowMs: number, who: string | null = null): number {
  const first = (who === null ? sql.one<{ d: string | null }>('SELECT min(day) AS d FROM observation') : sql.one<{ d: string | null }>('SELECT min(day) AS d FROM observation_who WHERE who = ?', who))?.d ?? null;
  return first === null ? 0 : Math.floor((Date.parse(`${dayOf(nowMs)}T12:00:00Z`) - Date.parse(`${first}T12:00:00Z`)) / DAY_MS);
}

/**
 * EVERY WIDGET SIGNAL THE RECORD HOLDS FOR THIS PERSON, unweighed. `pages` names each page by its slug, for the reason
 * line; `projects` is the projects' names, for a question or an open that names one.
 */
export function widgetSignals(read: SignalRead, pages: ReadonlyMap<string, string>, projects: readonly string[]): WidgetSignal[] {
  const alone = onePerson(read.sql);
  /* ALONE, THE WHOLE RECORD'S OPENS, as before migration 47; SHARED, THE ASKER'S OWN, and nobody's where no person asks. */
  const who = alone ? null : read.person;
  const counted = alone || who !== null;
  const opens = opensOf(who);
  const used = counted && daysUsed(read.sql, read.nowMs, who) >= WIDGET_YOUNG_DAYS;
  return [
    ...askedAgain(read, projects),
    ...somethingNew(read),
    ...comingUp(read),
    ...(used ? openedOften(read, pages, projects, opens) : []),
    ...pinned(read),
    ...(alone || ownBoard(read.sql, read.person) ? emptyForWeeks(read) : []),
  ];
}

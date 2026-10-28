/**
 * How the brain changed, as one timeline (`panel: evolution` on How the brain changed): learnings arriving, each with
 * the failure that taught it, skills taking a new version, each with its text before and after, and learnings fading,
 * marked where they fade. Newest first, grouped by the week each happened in.
 *
 * PURE, SO `node --test` CAN IMPORT IT. `EvolutionPanel.svelte` reads the rows and each changed skill's history through
 * the record's own reads (`list`, `history`) and hands them in; this decides what each line says.
 *
 * FADING IS THE RECORD'S OWN RULE (`FADED` in the agents add-on, `FADES` in `packages/record/src/index.ts`): an active
 * learning neither confirmed nor written in `FADE_DAYS` days is no longer handed to agents. A faded learning is its own
 * event on the day it faded, and one that fades inside `SOON_DAYS` carries a mark saying when.
 *
 * A SKILL'S VERSIONS ARE ITS TEXT AS THE LOG HOLDS IT (`versionsOf` in the kernel's `pages.ts`, which a skill's own page
 * draws): each change of `body`, with an unchanged repeat left out. Each pair, the one before and the one after, is one
 * event, and only pairs inside the window are drawn.
 */

export const FADE_DAYS = 90;
export const SOON_DAYS = 14;
/** How far back the timeline reads. */
export const WINDOW_DAYS = 182;

const DAY = 86_400_000;

export const evolutionWords = {
  arrived: 'Learned',
  because: 'Because',
  bearsOn: 'Bears on',
  replaces: 'Replaces an earlier learning',
  faded: 'Faded',
  fadedLine: 'No longer handed to agents. Confirm it on its page if it still holds.',
  fadesIn: (days: number) => (days <= 1 ? 'Fades tomorrow' : `Fades in ${days} days`),
  retired: { superseded: 'Replaced', reverted: 'Taken back' } as Record<string, string>,
  changed: 'Skill changed',
  version: (from: number, to: number) => `Version ${from} to ${to}`,
  before: 'Before',
  after: 'After',
  showText: 'Before and after',
  empty: 'Nothing arrived or changed in the last six months.',
  week: (start: string) => `Week of ${start}`,
} as const;

/**
 * THE TWO LISTS THE TIMELINE READS, BY WHAT EACH DECLARES AND NEVER BY ITS ID, out of `schemas`' answer (`lists`, every
 * list the reader may read): the learnings are the list whose rows fade (`fade: { field, after }`), and the skills the
 * list whose rows name the learnings behind them, a field that is a list of links to that list. A record that keeps no
 * list that fades has no timeline (`null`); one with learnings and no skills draws the learnings alone.
 */
export type EvolutionLists = { learnings: string; skills: string | null; fade: { field: string; after: string } };

export function evolutionLists(lists: unknown): EvolutionLists | null {
  if (typeof lists !== 'object' || lists === null) return null;
  type Field = { type?: unknown; of?: unknown; to?: unknown; retired?: unknown };
  type Decl = { fade?: { field?: unknown; after?: unknown }; fields?: unknown };
  const all = Object.entries(lists as Record<string, Decl>).filter(([, d]) => typeof d === 'object' && d !== null);
  const fadeOf = (d: Decl): { field: string; after: string } | null =>
    typeof d.fade?.field === 'string' && typeof d.fade.after === 'string' && /^[1-9][0-9]*d$/u.test(d.fade.after) ? { field: d.fade.field, after: d.fade.after } : null;
  const fading = all.find(([, d]) => fadeOf(d) !== null);
  if (fading === undefined) return null;
  const learnings = fading[0];
  const fieldsOf = (d: Decl): Field[] => (Array.isArray(d.fields) ? (d.fields as Field[]) : []);
  const skills = all.find(([id, d]) => id !== learnings && fieldsOf(d).some((f) => f.type === 'list' && f.of === 'ref' && f.to === learnings && f.retired !== true));
  return { learnings, skills: skills?.[0] ?? null, fade: fadeOf(fading[1])! };
}

/** One learning as the list answers it, the fields the timeline reads. */
export type LearningRow = {
  seq: number | null;
  created_at: string;
  state: string | null;
  fields: { lesson?: unknown; because?: unknown; topic?: unknown; confirmed_on?: unknown; supersedes?: unknown; state?: unknown };
};

/** One skill as the list answers it. */
export type SkillRow = { seq: number | null; fields: { name?: unknown; rev?: unknown } };

/** One line of a row's history as the record answers it. */
export type HistoryLine = { ts: string; actor?: string; kind?: string; field: string | null; to: unknown };

/** One version of a skill's text. */
export type Version = { at: string; text: string };

export type LearnedEvent = {
  kind: 'learned';
  at: string;
  key: string;
  seq: number | null;
  lesson: string;
  because: string | null;
  topic: string | null;
  replaces: boolean;
  /** `Faded`, `Fades in 9 days`, `Replaced` or `Taken back`, or `null` for a learning that stands. */
  mark: string | null;
  faded: boolean;
};
export type FadedEvent = { kind: 'faded'; at: string; key: string; seq: number | null; lesson: string };
export type ChangedEvent = { kind: 'changed'; at: string; key: string; seq: number | null; skill: string; from: number; to: number; before: string; after: string };
export type EvolutionEvent = LearnedEvent | FadedEvent | ChangedEvent;
export type EvolutionWeek = { key: string; label: string; events: EvolutionEvent[] };

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

/** A day field (`2026-10-03`) or an instant, as a time; `NaN` when it is neither. */
const timeOf = (v: unknown): number => (typeof v === 'string' ? Date.parse(v.length === 10 ? `${v}T00:00:00Z` : v) : Number.NaN);

/** When a learning fades: ninety days after it was last confirmed, or after it was written where it never was. */
export function fadesAt(row: LearningRow): number | null {
  const from = Number.isFinite(timeOf(row.fields.confirmed_on)) ? timeOf(row.fields.confirmed_on) : timeOf(row.created_at);
  return Number.isFinite(from) ? from + FADE_DAYS * DAY : null;
}

const stateOf = (row: LearningRow): string => text(row.fields.state) ?? row.state ?? 'active';

/** Each change of `field` in a row's history, oldest first, an unchanged repeat left out (the kernel's `versionsOf`). */
export function versionsOf(lines: readonly HistoryLine[], field: string): Version[] {
  const out: Version[] = [];
  for (const e of lines) {
    const to =
      e.field === null
        ? e.to !== null && typeof e.to === 'object' && !Array.isArray(e.to)
          ? (e.to as Record<string, unknown>)[field]
          : undefined
        : e.field === field
          ? e.to
          : undefined;
    if (typeof to !== 'string' || out.at(-1)?.text === to) continue;
    out.push({ at: e.ts, text: to });
  }
  return out.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

/** A learning's own events: it arrived, and, where it has, it faded. */
function learned(row: LearningRow, now: number, since: number): EvolutionEvent[] {
  const lesson = text(row.fields.lesson);
  if (lesson === null) return [];
  const out: EvolutionEvent[] = [];
  const state = stateOf(row);
  const fades = state === 'active' ? fadesAt(row) : null;
  const faded = fades !== null && fades <= now;
  const left = fades === null ? null : Math.ceil((fades - now) / DAY);
  const mark = state !== 'active' ? (evolutionWords.retired[state] ?? null) : faded ? evolutionWords.faded : left !== null && left <= SOON_DAYS ? evolutionWords.fadesIn(left) : null;
  const key = `l${row.seq ?? lesson}`;
  if (Date.parse(row.created_at) >= since)
    out.push({
      kind: 'learned',
      at: row.created_at,
      key,
      seq: row.seq,
      lesson,
      because: text(row.fields.because),
      topic: text(row.fields.topic),
      replaces: text(row.fields.supersedes) !== null,
      mark,
      faded,
    });
  if (faded && fades !== null && fades >= since) out.push({ kind: 'faded', at: new Date(fades).toISOString(), key: `${key}-faded`, seq: row.seq, lesson });
  return out;
}

/** A skill's changes: each version against the one before it, inside the window. */
function changed(skill: SkillRow, versions: readonly Version[], since: number): ChangedEvent[] {
  const name = text(skill.fields.name);
  if (name === null) return [];
  const out: ChangedEvent[] = [];
  /* THE NEWEST TEXT IS THE VERSION THE ROW SAYS, so a skill whose log begins after its first version is numbered as
     its own page numbers it, and not from one. */
  const rev = typeof skill.fields.rev === 'number' && Number.isInteger(skill.fields.rev) ? skill.fields.rev : versions.length;
  const offset = Math.max(0, rev - versions.length);
  for (let i = 1; i < versions.length; i++) {
    const after = versions[i]!;
    if (Date.parse(after.at) < since) continue;
    out.push({ kind: 'changed', at: after.at, key: `s${skill.seq ?? name}-${i}`, seq: skill.seq, skill: name, from: i + offset, to: i + 1 + offset, before: versions[i - 1]!.text, after: after.text });
  }
  return out;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The Monday a time falls in the week of, in the reader's own clock, as its key and as words. */
function weekOf(ms: number): { key: string; label: string } {
  const d = new Date(ms);
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
  const key = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
  const thisYear = monday.getFullYear() === new Date().getFullYear();
  return { key, label: evolutionWords.week(`${monday.getDate()} ${MONTHS[monday.getMonth()]}${thisYear ? '' : ` ${monday.getFullYear()}`}`) };
}

/**
 * The timeline, newest week first and newest first within a week: every learning that arrived or faded in the window,
 * and every version a skill took. `versions` is each skill's versions by its `seq`, for the skills whose history was read.
 */
export function evolution(learnings: readonly LearningRow[], skills: readonly SkillRow[], versions: ReadonlyMap<number, readonly Version[]>, now: number): EvolutionWeek[] {
  const since = now - WINDOW_DAYS * DAY;
  const events: EvolutionEvent[] = [
    ...learnings.flatMap((l) => learned(l, now, since)),
    ...skills.flatMap((s) => (s.seq === null ? [] : changed(s, versions.get(s.seq) ?? [], since))),
  ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const weeks = new Map<string, EvolutionWeek>();
  for (const e of events) {
    const w = weekOf(Date.parse(e.at));
    let week = weeks.get(w.key);
    if (!week) weeks.set(w.key, (week = { key: w.key, label: w.label, events: [] }));
    week.events.push(e);
  }
  return [...weeks.values()];
}

/** The skills worth reading the history of: those past their first version, the highest version first, at most `most`. */
export function skillsToRead(skills: readonly SkillRow[], most = 20): SkillRow[] {
  const rev = (s: SkillRow): number => (typeof s.fields.rev === 'number' ? s.fields.rev : 1);
  return skills.filter((s) => s.seq !== null && rev(s) > 1).sort((a, b) => rev(b) - rev(a)).slice(0, most);
}

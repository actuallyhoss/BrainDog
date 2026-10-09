/**
 * Day 0, as a screen shows it: the first-screen checks of USE-B01 (`loop/scope/area-usecases-b.md`, job 2), pure
 * functions over one snapshot the proof area's rig hands in. Nothing here opens a page, reads a host or waits.
 *
 * THE SNAPSHOT is what the rig saw on one screen, at one width, as one person:
 *
 * - `path`: the page's path, such as `/signup`, `/start` or `/app/laylas-studies/today`.
 * - `width`: 390 or 1440.
 * - `text`: every sentence drawn, as one string or a list of strings.
 * - `roles`: the page's accessibility tree, flattened, as `{ role, name, landmark }`, where `landmark` is the role of
 *   the nearest landmark around it (`navigation` for the rail and the More sheet, `main`, ...) or `null`.
 * - `counts`: the lists as that person reads them, keyed by the list's id or by the name the screen gives it. A value
 *   is a count, or the entries themselves as `{ name, tags }` where the rig read them.
 *
 * EACH CHECK ANSWERS `{ id, pass, saw }`: `true` or `false` with what it saw, or `null` when the snapshot does not hold
 * what the check reads (the rig is told what to hand it, the product is not blamed). `saw` is read by a person in the
 * nightly report, so it is plain words and names, never an id.
 */

import { firstRun } from '../../../apps/web/src/lib/first-run.ts';
import { words as signupWords } from '../../../apps/web/src/routes/signup/words.ts';

/** Words the first screens never say: a tour, a checklist, getting started. */
const TOUR = /\b(tour|checklist|getting started|onboarding steps?)\b/iu;

/** A count of steps: "2 of 5", "Step 3 of 4". */
const STEPS_COUNT = /\b\d+\s+of\s+\d+\b/iu;

/** Sample entries said out loud. */
const SAMPLE = /\bsample (record|data|entries|entry|rows?)\b/iu;

/** The pages of the first run, before anything is kept: sign-up and the start page. */
const FIRST_RUN = /^\/(signup|start)(\/|$|\?)/u;

/**
 * THE PRESS IS BEHIND A FIRST-RUN SCREEN that draws the making button or the made heading: `/start` and sign-up stay
 * on their path after "Make it mine" (`routes/start/Made.svelte`), so the path alone does not say which side it is.
 */
const AFTER_PRESS = new Set([firstRun.makingIt, firstRun.madeTitle, signupWords.makingNow, signupWords.madeTitle]);
const pressed = (snap) => (snap.roles ?? []).some((r) => AFTER_PRESS.has(r.name));

/** A first-run screen before the press: nothing is written yet, and nothing is in People. */
const beforePress = (snap) => FIRST_RUN.test(snap.path ?? '') && !pressed(snap);

/** Everything the person typed: her sentence, her first real thing and what she tells on later days. */
const herWords = (person) => [person?.said, person?.first, ...(person?.later ?? []).flatMap((l) => l?.said ?? [])].filter((s) => typeof s === 'string').join('\n').toLocaleLowerCase();

/** An entry she typed herself, found by its name in her own words. */
const typed = (person, entry) => typeof entry?.name === 'string' && entry.name.trim() !== '' && herWords(person).includes(entry.name.toLocaleLowerCase());

/** The places the rail always holds, with or without entries behind them. */
export const ALWAYS = ['Today', 'Decide', 'People'];

/** The unit that turns each check green when it is red, for the nightly report's line beside it. */
export const UNITS = {
  'no-tour': 'USE-B01',
  'no-count': 'USE-B07',
  'nothing-before-press': 'USE-B07',
  'people-only-them': 'USE-B06',
  'no-example': 'USE-B07',
  'rail-has-rows': 'USE-B02',
  'team-no-task': 'USE-B07',
};

const pass = (id, saw) => ({ id, pass: true, saw });
const fail = (id, saw) => ({ id, pass: false, saw });
const unseen = (id, saw) => ({ id, pass: null, saw });

/** The snapshot's text as one string. */
const textOf = (snap) => (Array.isArray(snap.text) ? snap.text.join('\n') : String(snap.text ?? ''));

/** A list's key and a name on screen, compared the way a person reads them: "Study sessions" is `study_sessions`. */
const same = (a, b) => String(a).toLocaleLowerCase().replace(/[\s_-]+/gu, ' ').trim() === String(b).toLocaleLowerCase().replace(/[\s_-]+/gu, ' ').trim();

/** How many entries a count holds, whether the rig handed a number or the entries. */
const size = (v) => (Array.isArray(v) ? v.length : Number.isFinite(v) ? v : 0);

/** The count under a list's id or its name, or `undefined` when the rig did not read that list. */
function countOf(counts, ...keys) {
  for (const [k, v] of Object.entries(counts ?? {})) if (keys.some((key) => same(k, key))) return v;
  return undefined;
}

/** The places in the rail (or the More sheet at 390): every link inside a navigation landmark. */
export const railOf = (snap) => (snap.roles ?? []).filter((r) => r.landmark === 'navigation' && (r.role === 'link' || r.role === 'tab')).map((r) => r.name);

/** The first few words around a match, for `saw`. */
function around(text, re) {
  const m = re.exec(text);
  if (!m) return '';
  return text.slice(Math.max(0, m.index - 20), m.index + m[0].length + 20).replace(/\s+/gu, ' ').trim();
}

/* ── the checks ───────────────────────────────────────────────────────────────────────────────────────── */

export const firstScreen = {
  /** No tour and no checklist: no words for one, and no sample record said out loud. */
  'no-tour'(snap) {
    const text = textOf(snap);
    if (TOUR.test(text)) return fail('no-tour', `it says "${around(text, TOUR)}"`);
    if (SAMPLE.test(text)) return fail('no-tour', `it offers sample entries: "${around(text, SAMPLE)}"`);
    return pass('no-tour', 'no tour, checklist or sample entries');
  },

  /** No count of steps: no "N of M" in the words and nothing with the role of a progress bar. */
  'no-count'(snap) {
    const text = textOf(snap);
    const bars = (snap.roles ?? []).filter((r) => r.role === 'progressbar');
    if (STEPS_COUNT.test(text)) return fail('no-count', `it counts steps: "${around(text, STEPS_COUNT)}"`);
    if (bars.length > 0) return fail('no-count', `${bars.length === 1 ? 'a progress bar' : `${bars.length} progress bars`}${bars[0].name ? ` ("${bars[0].name}")` : ''}`);
    return pass('no-count', 'no count of steps and no progress bar');
  },

  /** On sign-up and the start page nothing is written before "Make it mine": every list reads empty. */
  'nothing-before-press'(snap) {
    if (!FIRST_RUN.test(snap.path ?? '')) return unseen('nothing-before-press', `not a first-run page (${snap.path})`);
    if (pressed(snap)) return unseen('nothing-before-press', '"Make it mine" was already pressed on this screen');
    if (snap.counts === undefined) return unseen('nothing-before-press', 'the rig read no lists');
    const full = Object.entries(snap.counts).filter(([, v]) => size(v) > 0);
    if (full.length > 0) return fail('nothing-before-press', `before the press ${full.map(([k, v]) => `${k} holds ${size(v)}`).join(', ')}`);
    return pass('nothing-before-press', `${Object.keys(snap.counts).length} lists read, all empty before the press`);
  },

  /**
   * After the press, People holds the person and nobody she did not type: an entry named in her own words (Nadia, the
   * client in Mariam's first real thing) is hers. Before the press nothing is written, so People is not read yet.
   */
  'people-only-them'(snap, person) {
    if (beforePress(snap)) return unseen('people-only-them', 'before "Make it mine" nothing is in People yet');
    const people = countOf(snap.counts, 'people');
    if (people === undefined) return unseen('people-only-them', 'the rig did not read People');
    if (Array.isArray(people)) {
      const them = people.filter((p) => p?.name === person.name);
      const others = people.filter((p) => p?.name !== person.name && !typed(person, p)).map((p) => p?.name ?? 'an entry with no name');
      if (them.length === 0) return fail('people-only-them', `${person.name} is not in People${people.length > 0 ? `, it holds ${people.map((p) => p?.name ?? 'an entry with no name').join(', ')}` : ''}`);
      if (them.length > 1 || others.length > 0) return fail('people-only-them', `People holds ${them.length > 1 ? `${person.name} ${them.length} times` : others.join(', ')} beside ${person.name}`);
      return pass('people-only-them', `People holds ${person.name}${people.length > 1 ? ' and only people she typed' : ' alone'}`);
    }
    if (size(people) !== 1) return fail('people-only-them', `People holds ${size(people)}, not ${person.name} alone`);
    if (!textOf(snap).includes(person.name)) return fail('people-only-them', `People holds one, and ${person.name} is not on the screen`);
    return pass('people-only-them', `People holds one, ${person.name}`);
  },

  /** No entry carries the tag `example`. */
  'no-example'(snap) {
    const read = Object.entries(snap.counts ?? {}).filter(([, v]) => Array.isArray(v));
    if (read.length === 0) return unseen('no-example', 'the rig read no entries, only counts');
    const tagged = read.flatMap(([k, rows]) => rows.filter((r) => (r?.tags ?? []).some((t) => same(t, 'example'))).map((r) => `${r?.name ?? 'an entry'} in ${k}`));
    if (tagged.length > 0) return fail('no-example', `${tagged.length} tagged example: ${tagged.slice(0, 3).join(', ')}`);
    return pass('no-example', `${read.reduce((n, [, rows]) => n + rows.length, 0)} entries read, none tagged example`);
  },

  /**
   * The rail holds only places with entries, besides Today, Decide and People. On the first-run pages there is no rail
   * at all. A place is judged by the list of its name the rig read: the rail also draws links that are no list (New
   * list, Account, the agents at work, the pen's suggestions), and those are never blamed for being empty.
   */
  'rail-has-rows'(snap) {
    const rail = railOf(snap);
    if (FIRST_RUN.test(snap.path ?? '')) {
      return rail.length > 0 ? fail('rail-has-rows', `the first run draws a rail: ${rail.join(', ')}`) : pass('rail-has-rows', 'no rail on the first run');
    }
    if (rail.length === 0) return unseen('rail-has-rows', 'no rail or More sheet on this screen');
    const read = rail.filter((name) => !ALWAYS.some((a) => same(a, name)) && countOf(snap.counts, name) !== undefined);
    const empty = read.filter((name) => size(countOf(snap.counts, name)) === 0);
    if (empty.length > 0) return fail('rail-has-rows', `${empty.join(', ')} ${empty.length === 1 ? 'is' : 'are'} in the rail with nothing in ${empty.length === 1 ? 'it' : 'them'}`);
    if (read.length === 0) return unseen('rail-has-rows', `the rig read no list for any place in the rail (${rail.join(', ')})`);
    return pass('rail-has-rows', `${read.join(', ')} ${read.length === 1 ? 'is' : 'are'} in the rail, each with something in it`);
  },

  /**
   * A team's record holds no task on day 0 that nobody typed: the board is theirs to fill, nothing is made for them.
   * A task named in the person's own words (her first real thing) is hers. A bare count cannot say whose, so any is red.
   */
  'team-no-task'(snap, person) {
    if (person.expects !== 'team') return unseen('team-no-task', `${person.name} is not a team`);
    const tasks = countOf(snap.counts, 'tasks');
    if (tasks === undefined) return unseen('team-no-task', 'the rig did not read the tasks');
    const made = Array.isArray(tasks) ? tasks.filter((t) => !typed(person, t)).length : size(tasks);
    const word = made === 1 ? 'task' : 'tasks';
    if (made > 0) return fail('team-no-task', Array.isArray(tasks) ? `the team's record holds ${made} ${word} nobody typed` : `the team's record holds ${made} ${word}`);
    return pass('team-no-task', size(tasks) > 0 ? `the team's record holds only the ${size(tasks) === 1 ? 'task' : 'tasks'} ${person.name} typed` : "the team's record holds no task");
  },
};

/** Every check, in order, on one snapshot as one person. */
export const checkScreen = (snap, person) => Object.values(firstScreen).map((check) => check(snap, person));

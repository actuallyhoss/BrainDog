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
 *   the nearest landmark around it (`navigation` for the rail, the tab bar and the More sheet, `main`, ...) or `null`.
 *   A link may say where it goes (`href`), and a rail whose links do is judged row by row.
 * - `counts`: the lists as that person reads them, keyed by the list's id or by the name the screen gives it. A value
 *   is a count, or the entries themselves as `{ name, tags }` where the rig read them.
 * - `behind`: what each row of the rail stands on, keyed by the row's `href`: the lists its page reads (or the list
 *   itself), each under its name with how much it holds. `{}` for a page that reads no list.
 * - `places`: the rows' `href`s that are places of the record by their own declaration (a page that names its spot on
 *   the rail, `nav.place`): Money, Projects, Agents. Such a place stands on day 0 with nothing in it.
 * - `signs`: how many of the record's vital signs read red, or `null` where it holds no page they are shown on.
 * - `owner`: whether the reader owns the record, where the rig knows; left out, nothing is judged by it.
 *
 * WITH NO RIG, `screens.mjs` draws the snapshots itself: the web's own rail and Today, rendered for the server from a
 * record a walk just made (`first-run.mjs`), which is what this file's command hands in when it is given no file.
 *
 * EACH CHECK ANSWERS `{ id, pass, saw }`: `true` or `false` with what it saw, or `null` when it judged nothing. A `null`
 * is one of two things, told apart by `applies`. NOT SEEN (`applies` left out): the check is this screen's to judge and
 * the snapshot does not hold what it reads, so the rig is told what to hand it, the product is not blamed, and the
 * command leaves with 1, since a check that read nothing has proved nothing. NOT THIS SCREEN'S (`applies: false`): the
 * check has no business here (a first-run check on Today, a team's check for one person), which is no fault of
 * anybody's. `saw` is read by a person in the nightly report, so it is plain words and names, never an id.
 */

import { firstRun } from '../../../apps/web/src/lib/first-run.ts';
import { words as signupWords } from '../../../apps/web/src/routes/signup/words.ts';
import { pageWords } from '../../../apps/web/src/lib/record/page-new.ts';
import { shell as shellWords } from '../../../apps/web/src/lib/copy/shell.ts';

/** Words the first screens never say: a tour, a checklist, getting started. */
const TOUR = /\b(tour|checklist|getting started|onboarding steps?)\b/iu;

/** A count of steps: "2 of 5", "Step 3 of 4". */
const STEPS_COUNT = /\b\d+\s+of\s+\d+\b/iu;

/** Sample entries said out loud. */
const SAMPLE = /\bsample (record|data|entries|entry|rows?)\b/iu;

/** Today's line on the vital signs, in either of its two wordings (`signsLine` in `lib/home/default-home.ts`). */
export const SIGNS = /\b(?:one|\d+) vital signs? needs? a look\b/iu;

/** Today's own path: the app's front door, with or without the record's name and the word. */
const TODAY = /^\/app(\/[^/]+)?(\/today)?\/?$/u;

/** The narrowest screen that draws the rail with its names; under it the places are behind a press. */
const RAIL_FROM = 900;

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

/** The same, for the three checks that read the app's shell as drawn (`drawnScreen`). */
export const DRAWN_UNITS = {
  'pages-line': 'PGS-C30',
  'signs-line': 'PRF-A05',
  'own-lines-you': 'USE-B06',
};

const pass = (id, saw) => ({ id, pass: true, saw });
const fail = (id, saw) => ({ id, pass: false, saw });
const unseen = (id, saw) => ({ id, pass: null, saw });
/** Not this screen's to judge: nothing read, and nothing owed. */
const off = (id, saw) => ({ id, pass: null, applies: false, saw });

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

/** Everything a person can land on in the rail, a button and a box as well as a link. */
const inRail = (snap) => (snap.roles ?? []).filter((r) => r.landmark === 'navigation');

/** A place's name without the count the rail draws after it: "Orders 2" is Orders. */
const bare = (name) => String(name).replace(/\s+\d+$/u, '');

/**
 * A rail row that is a place of the record, by where its link goes: a list's own screen or a page. A name that opens
 * with an underscore is a door of the app's own (New list goes to `_new`), and no place.
 */
const PLACE = /\/(?:p|r)\/[^/?#_][^/?#]*\/?(?:[?#].*)?$/u;

/** Names joined as a sentence joins them: "Orders and Money", "Orders, Money and Clients". */
const and = (names) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`);

/** Names as a sentence lists them: "Accounts, Ledger and 4 more". */
const some = (names, most = 3) => (names.length > most ? `${names.slice(0, most).join(', ')} and ${names.length - most} more` : and(names));

/**
 * THE RAIL AS DRAWN, ROW BY ROW: every link in it that goes to a list or a page, held against what stands behind it
 * (`snap.behind`, else the list of its name in `counts`). Today, Decide and People are always there. A row whose page
 * reads lists and finds every one of them empty has nothing to show, and is red; one that reads no list has nothing to
 * be empty. A link that is no place (New list, the account, an agent at work) is known by where it goes and is left
 * alone, so a rail of only the three is read and green.
 *
 * A PLACE THE RECORD DECLARES (`snap.places`) MAY STAND EMPTY, since the audit of 22 October (U-C2): a person who asked
 * for Money, Projects and Agents found none of them on their first Today, because each waited for its first row. Such
 * a place opens on its first entry, so it is no red; a side page over nothing (Board, Cycle plan) still is.
 */
function drawnRows(snap, links) {
  const rows = new Map();
  for (const r of links) if (PLACE.test(r.href ?? '') && !ALWAYS.some((a) => same(a, bare(r.name))) && !rows.has(r.href)) rows.set(r.href, r);
  const where = Number.isFinite(snap.width) && snap.width < RAIL_FROM ? "the phone's places" : 'the rail';
  const empty = [];
  const unread = [];
  const full = [];
  const ready = [];
  const declared = new Set(snap.places ?? []);
  for (const [href, r] of rows) {
    const own = [r.name, bare(r.name)].find((n) => countOf(snap.counts, n) !== undefined);
    const reads = snap.behind?.[href] ?? (own === undefined ? undefined : { [own]: countOf(snap.counts, own) });
    /* A LIST'S ROW SAYS ITS COUNT AFTER ITS NAME: "Orders 2" is Orders, unless a list is called just that. */
    const name = Object.keys(reads ?? {}).some((k) => same(k, r.name)) ? r.name : bare(r.name);
    if (reads === undefined) unread.push(name);
    else if (Object.keys(reads).length > 0 && Object.values(reads).every((v) => size(v) === 0)) {
      if (declared.has(href)) ready.includes(name) || ready.push(name);
      else empty.push(`${name} (${some(Object.keys(reads))} ${Object.keys(reads).length === 1 ? 'holds' : 'hold'} nothing)`);
    } else if (!full.includes(name)) full.push(name);
  }
  if (empty.length > 0) return fail('rail-has-rows', `${and(empty)} ${empty.length === 1 ? 'is' : 'are'} in ${where} with nothing to show`);
  if (unread.length > 0) return unseen('rail-has-rows', `the rig did not read what stands behind ${some(unread)} in ${where}`);
  const opens = ready.length === 0 ? '' : `${and(ready)} ${ready.length === 1 ? 'opens' : 'open'} on a first entry`;
  if (full.length === 0 && ready.length === 0) return pass('rail-has-rows', `${where} ${where === 'the rail' ? 'holds' : 'hold'} no place besides ${and(ALWAYS)}`);
  if (full.length === 0) return pass('rail-has-rows', `in ${where}, ${opens}`);
  const held = `${and(full)} ${full.length === 1 ? 'is' : 'are'} in ${where}, each with something in it`;
  return pass('rail-has-rows', opens === '' ? held : `${held}, and ${opens}`);
}

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
    if (!FIRST_RUN.test(snap.path ?? '')) return off('nothing-before-press', `not a first-run page (${snap.path})`);
    if (pressed(snap)) return off('nothing-before-press', '"Make it mine" was already pressed on this screen');
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
    if (beforePress(snap)) return off('people-only-them', 'before "Make it mine" nothing is in People yet');
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
   * at all. WHERE THE LINKS SAY WHERE THEY GO (markup that was drawn), the rail is read row by row (`drawnRows`).
   * WHERE THEY DO NOT (a rig's flat tree), a place is judged by the list of its name the rig read: the rail also draws
   * links that are no list (New list, Account, the agents at work, the pen's suggestions), and those are never blamed
   * for being empty.
   */
  'rail-has-rows'(snap) {
    const rail = railOf(snap);
    if (FIRST_RUN.test(snap.path ?? '')) {
      return rail.length > 0 ? fail('rail-has-rows', `the first run draws a rail: ${rail.join(', ')}`) : pass('rail-has-rows', 'no rail on the first run');
    }
    if (rail.length === 0) return unseen('rail-has-rows', 'no rail, tab bar or More sheet on this screen');
    const links = (snap.roles ?? []).filter((r) => r.landmark === 'navigation' && (r.role === 'link' || r.role === 'tab'));
    if (links.some((r) => typeof r.href === 'string')) return drawnRows(snap, links);
    /* A LIST'S ROW SAYS ITS COUNT AFTER ITS NAME, and a screen reader hears both as the link's name. */
    const names = rail.map((name) => (countOf(snap.counts, name) === undefined ? bare(name) : name));
    const read = [...new Set(names)].filter((name) => !ALWAYS.some((a) => same(a, name)) && countOf(snap.counts, name) !== undefined);
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
    if (person.expects !== 'team') return off('team-no-task', `${person.name} is not a team`);
    const tasks = countOf(snap.counts, 'tasks');
    if (tasks === undefined) return unseen('team-no-task', 'the rig did not read the tasks');
    const made = Array.isArray(tasks) ? tasks.filter((t) => !typed(person, t)).length : size(tasks);
    const word = made === 1 ? 'task' : 'tasks';
    if (made > 0) return fail('team-no-task', Array.isArray(tasks) ? `the team's record holds ${made} ${word} nobody typed` : `the team's record holds ${made} ${word}`);
    return pass('team-no-task', size(tasks) > 0 ? `the team's record holds only the ${size(tasks) === 1 ? 'task' : 'tasks'} ${person.name} typed` : "the team's record holds no task");
  },
};

/* ── the checks that read the shell as drawn ──────────────────────────────────────────────────────────── */

/**
 * Three checks over the app's shell once it is drawn (audit 71, finding 8): the rail's line that makes a page,
 * Today's line on the vital signs, and what Today calls the reader in her own lines. Kept beside the seven and not
 * among them, since they read a rail's buttons and headings and Today's links and feed, which a snapshot of the first
 * run's words alone never holds.
 */
export const drawnScreen = {
  /**
   * The rail holds the line that makes a page exactly once, under one "Pages": the rail's own heading while the record
   * has no made page, the Pages place once it has. "New page" for whoever owns the record, "Suggest a page" for anybody
   * else. Not judged on the first run, which has no rail, under 900 wide, where the places are behind a press, nor on the
   * narrow rail.
   */
  'pages-line'(snap) {
    const rail = inRail(snap);
    if (FIRST_RUN.test(snap.path ?? '')) return off('pages-line', 'the first run has no rail');
    if (Number.isFinite(snap.width) && snap.width < RAIL_FROM) return off('pages-line', `at ${snap.width} wide the line is behind a press`);
    if (rail.length === 0) return unseen('pages-line', 'no rail on this screen');
    const lines = rail.filter((r) => r.role !== 'heading' && [pageWords.newPage, pageWords.suggestPage].some((w) => same(w, r.name)));
    const homes = rail.filter((r) => same(pageWords.section, r.role === 'heading' ? r.name : bare(r.name)) && (r.role === 'heading' || r.role === 'link'));
    /* THE NARROW RAIL draws glyphs and no heading at all, and has no room for a name to be typed: nothing to judge. */
    if (lines.length === 0 && !rail.some((r) => r.role === 'heading')) return off('pages-line', 'the narrow rail has no room for the line');
    if (lines.length === 0) return fail('pages-line', `the rail has no "${pageWords.newPage}" and no "${pageWords.suggestPage}"`);
    if (lines.length > 1) return fail('pages-line', `the rail says ${lines.map((r) => `"${r.name}"`).join(' and ')}, ${lines.length} lines where one makes a page`);
    const [line] = lines;
    if (homes.length === 0) return fail('pages-line', `"${line.name}" stands under no "${pageWords.section}"`);
    if (homes.length > 1) return fail('pages-line', `"${pageWords.section}" is in the rail ${homes.length} times`);
    const mine = same(line.name, pageWords.newPage);
    if (snap.owner === true && !mine) return fail('pages-line', `whoever owns the record is told "${line.name}", not "${pageWords.newPage}"`);
    if (snap.owner === false && mine) return fail('pages-line', `somebody who does not own the record is told "${line.name}", not "${pageWords.suggestPage}"`);
    return pass('pages-line', `"${line.name}" once, under ${homes[0].role === 'heading' ? `the rail's own "${pageWords.section}"` : `the ${pageWords.section} place`}`);
  },

  /**
   * Today says how many vital signs need a look at most once, as words that open the page they are shown on, and only
   * to whoever owns the record (audit 71, finding 5).
   *
   * AND IT SAYS SO WHEN ONE DOES (audit 73, finding 7): a Today with no line is held against how many read red
   * (`snap.signs`), so taking the line out is red for whoever owns a record with a red sign. Silence is right for
   * anybody else, on a record with no page to open, and when none is red; with the number not read, silence proves
   * nothing and is said as not seen.
   */
  'signs-line'(snap) {
    if (!TODAY.test(snap.path ?? '')) return off('signs-line', `not Today (${snap.path})`);
    const main = (snap.roles ?? []).filter((r) => r.landmark === 'main');
    if (main.length === 0) return unseen('signs-line', 'Today was not drawn on this screen');
    const said = (Array.isArray(snap.text) ? snap.text : textOf(snap).split('\n')).filter((t) => SIGNS.test(t));
    const red = (n) => (n === 1 ? 'one vital sign reads red' : `${n} vital signs read red`);
    if (said.length === 0) {
      if (snap.owner === false) return pass('signs-line', 'Today says nothing about the vital signs to somebody who does not own the record');
      if (snap.signs === null) return pass('signs-line', 'the record has no page for its vital signs, and Today says nothing about them');
      if (!Number.isFinite(snap.signs)) return unseen('signs-line', 'Today says nothing about the vital signs, and the rig did not read how many need a look');
      if (snap.signs === 0) return pass('signs-line', 'no vital sign needs a look, and Today says nothing about them');
      if (snap.owner !== true) return unseen('signs-line', `${red(snap.signs)}, and the rig did not say whether the reader owns the record`);
      return fail('signs-line', `${red(snap.signs)}, and Today does not say so`);
    }
    const line = around(said[0], SIGNS);
    if (snap.owner === false) return fail('signs-line', `somebody who does not own the record is told "${line}"`);
    if (said.length > 1) return fail('signs-line', `Today says it ${said.length} times: "${line}"`);
    if (!main.some((r) => r.role === 'link' && SIGNS.test(r.name))) return fail('signs-line', `"${line}" opens nothing`);
    if (snap.signs === null) return fail('signs-line', `Today says "${line}" on a record with no page for its vital signs`);
    const told = /\b(one|\d+) vital signs?/iu.exec(said[0])?.[1];
    const count = told === undefined ? Number.NaN : /^one$/iu.test(told) ? 1 : Number(told);
    if (Number.isFinite(snap.signs) && count !== snap.signs) return fail('signs-line', `Today says "${line}" while ${snap.signs === 0 ? 'no vital sign reads red' : red(snap.signs)}`);
    return pass('signs-line', `Today says "${line}", and the words open the page`);
  },

  /**
   * Today never calls the reader a stranger on her own record: where People holds her and nobody she did not type (a
   * client named in her own words signs nothing in), whatever a person did on it she did, so a line that says somebody
   * unnamed did it (the feed's word for a person it holds no name for, `feedSomeone`) is her own line, misnamed. Seen
   * on the first-run walk in batch 75: "Someone on this record added Nadia just now" for the owner's own entries,
   * with every check green. Judged for whoever owns the record; with anybody else in People the words may be true of
   * them, and that is not this check's to tell.
   */
  'own-lines-you'(snap, person) {
    if (!TODAY.test(snap.path ?? '')) return off('own-lines-you', `not Today (${snap.path})`);
    if (!(snap.roles ?? []).some((r) => r.landmark === 'main')) return unseen('own-lines-you', 'Today was not drawn on this screen');
    const stranger = shellWords.feedSomeone.toLocaleLowerCase();
    const said = (Array.isArray(snap.text) ? snap.text : textOf(snap).split('\n')).filter((t) => t.toLocaleLowerCase().includes(stranger));
    if (said.length === 0) return pass('own-lines-you', 'Today calls nobody a stranger on this record');
    if (snap.owner === false) return off('own-lines-you', 'the reader does not own the record, and may hold no name for whoever did it');
    const people = countOf(snap.counts, 'people');
    if (people === undefined) return unseen('own-lines-you', `Today says "${shellWords.feedSomeone}", and the rig did not read People`);
    const others = Array.isArray(people) ? people.filter((p) => p?.name !== person?.name && !typed(person, p)).length : size(people) - 1;
    if (others !== 0) return off('own-lines-you', `People holds ${size(people)}, so the words may be true of somebody else`);
    if (snap.owner !== true) return unseen('own-lines-you', `Today says "${shellWords.feedSomeone}", and the rig did not say whether the reader owns the record`);
    return fail('own-lines-you', `nobody but ${person?.name ?? 'the reader'} writes on this record, and Today says "${said[0].replace(/\s+/gu, ' ').trim().slice(0, 80)}" ${said.length === 1 ? 'once' : `${said.length} times`}`);
  },
};

/** Every check, in order, on one snapshot as one person. */
export const checkScreen = (snap, person) => Object.values(firstScreen).map((check) => check(snap, person));

/** The seven and then the three that read the shell as drawn, on one snapshot handed in. */
export const checkDrawn = (snap, person) => [...checkScreen(snap, person), ...Object.values(drawnScreen).map((check) => check(snap, person))];

/* ── run as a command ─────────────────────────────────────────────────────────────────────────────────── */

/** The checks that read only the words on a screen, so they can be judged with no screen drawn. */
const WORDS_ONLY = new Set(['no-tour', 'no-count']);

/** Every sentence a table of a page's words holds: its strings and its lists of strings. A sentence built from what
 *  the person typed (a function) is not one until a screen draws it, so it is left to the rig. */
const sentencesOf = (table) => Object.values(table).flatMap((v) => (typeof v === 'string' ? [v] : Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []));

/** The first run's own words, as the one screen this file can judge with no rig: what `/start` and sign-up can say. */
export const wordsScreen = () => ({ path: '/start', text: [...sentencesOf(firstRun), ...sentencesOf(signupWords)] });

/** A check that was this screen's to judge and read nothing. */
const unread = (r) => r.pass === null && r.applies !== false;

/** One check as one line: its name, green, red, not seen or does not apply, and what it saw. Coloured on a terminal. */
export function lineOf(r, colour = false) {
  const [word, code] = r.pass === true ? ['green', 32] : r.pass === false ? ['red', 31] : unread(r) ? ['not seen', 33] : ['does not apply', 90];
  return `${r.id}: ${colour ? `\u001b[${code}m${word}\u001b[0m` : word}. ${r.saw}`;
}

/**
 * Everything the command prints and the code it leaves with, from the screens it was handed (`null` for none) and the
 * person: a heading a screen, a line a check, and a last line that counts them and says the exit code. 1 when any
 * check is red, and 1 when a check that was a screen's to judge read nothing (audit 73, finding 7: twelve unread and a
 * code of 0 was a pass nobody had earned), said as UNCHECKED on that line. A check that does not apply to a screen is
 * counted apart and leaves the code alone. 0 only when every check that applies read something and none is red.
 *
 * WITH NO SCREEN, only the checks that read words are judged, on the first run's own words; the rest say "not seen",
 * since a list nobody read and a rail nobody drew prove nothing. Only the words were asked for, so there the code is
 * left alone and UNCHECKED says how little was read. A SCREEN HANDED IN is judged by the seven and by the three that
 * read the shell as drawn (`drawnScreen`).
 *
 * `strict` is for a caller that will not take the words alone for an answer: with no screen it leaves with 1 when
 * any check read nothing, as a screen handed in always does. Without it the words-only code is as it was.
 */
export function report(screens, person, colour = false, strict = false) {
  const out = [];
  const all = [];
  for (const snap of screens ?? [wordsScreen()]) {
    /* THE WORDS BESIDE DRAWN SCREENS (`words: true`) are judged by the two checks that read words and by nothing else:
       the screens beside them are what the rest read. A screen handed in is judged by all ten. */
    const judged =
      screens === null
        ? checkScreen(snap, person).map((r) => (WORDS_ONLY.has(r.id) ? r : unseen(r.id, 'no screen was handed in, only the words of the first run')))
        : snap.words === true
          ? checkScreen(snap, person).filter((r) => WORDS_ONLY.has(r.id))
          : checkDrawn(snap, person);
    const drew = [snap.drew, snap.moment].filter((x) => typeof x === 'string' && x !== '').join(', ');
    out.push(
      screens === null || snap.words === true
        ? `The first run's own words (${snap.text.length} sentences), as ${person.name}`
        : `${snap.path ?? 'a screen with no path'}${snap.width ? ` at ${snap.width} wide` : ''}${drew ? ` (${drew})` : ''}, as ${person.name}`,
    );
    for (const r of judged) out.push(`  ${lineOf(r, colour)}`);
    all.push(...judged);
  }
  const n = (v) => all.filter((r) => r.pass === v).length;
  const blind = all.filter(unread).length;
  const apart = n(null) - blind;
  const code = n(false) > 0 || ((screens !== null || strict) && blind > 0) ? 1 : 0;
  /* NOT SEEN IS NOT A PASS: the last line says so in a word a nightly reader cannot take for green, and names how many. */
  const unchecked = blind > 0 ? ` UNCHECKED: ${blind} of ${all.length} read nothing, which is not a pass.` : '';
  out.push(`${all.length} checks: ${n(true)} green, ${n(false)} red, ${blind} not seen${apart > 0 ? `, ${apart} that do not apply` : ''}.${unchecked} Exit code ${code}.`);
  return { lines: out, code };
}


/** What each moment of the walk is called in a screen's heading. */
const MOMENTS = { kept: 'just kept, before anything was told', told: 'after the first real thing' };

/**
 * The screens of one walk as `person`, drawn (`screens.mjs`) on a fresh self-host that is closed again: the first run's
 * own words, then Today with its rail, a list's rail and Today on a phone at each of the two moments. The walk's own steps are
 * `first-run.mjs`'s to judge and are not said here; a walk that never reached the record draws nothing, and the caller
 * is told why in `why`.
 */
export async function drawnScreens(person) {
  const { selfHost, walk } = await import('./first-run.mjs');
  const { screensOf } = await import('./screens.mjs');
  const host = await selfHost(person);
  const drawn = [];
  const steps = [];
  let broke = null;
  try {
    /* A WALK THAT THROWS PAST THE TWO MOMENTS (day 15, for a person the walk is not yet written for) has still shown
       both, so what was drawn is kept and judged; a throw before either is why nothing was drawn. */
    await walk(person, host, (r) => void steps.push(r), async (shot) => {
      for (const snap of await screensOf(shot)) drawn.push({ ...snap, moment: MOMENTS[shot.when] ?? shot.when });
    });
  } catch (e) {
    broke = e instanceof Error ? e.message : String(e);
  } finally {
    await host.close();
  }
  const red = steps.find((r) => r.pass === false);
  return { screens: [{ ...wordsScreen(), words: true }, ...drawn], why: drawn.length > 0 ? null : (broke ?? red?.saw ?? 'the walk never opened the record') };
}

/**
 * `node tools/people/expect/first-screen.mjs [screen.json] [person.json] [--as <person.json>] [--words] [--strict] [--write <file>]`.
 *
 * `screen.json` is one snapshot or a list of them, as a rig writes them. WITH NONE, the screens are drawn here: a fresh
 * self-host, the walk of `first-run.mjs`, and the web's own rail and Today rendered at its two moments (`--write` keeps
 * them as a file that can be handed back in). `--words` judges only the first run's own words, with nothing drawn and
 * no host started, and leaves with 0 however little was read unless `--strict` is given, which makes a check that
 * read nothing a 1 there too. Mariam by default; `--as` names somebody else with no screen file before it. Exit 0
 * when every check that applies to a screen read something and none is red, 1 when one is red or one read nothing, 2
 * when a file could not be read or the screens could not be drawn (said in a line, never in silence).
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  const { readFileSync, writeFileSync } = await import('node:fs');
  const args = process.argv.slice(2);
  const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
  const [screenFile, second] = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--write' && args[i - 1] !== '--as');
  const personFile = flag('--as') ?? second ?? new URL('../mariam.json', import.meta.url).pathname;
  const stop = (why) => {
    console.log(`first-screen: red. ${why}. Exit code 2.`);
    process.exit(2);
  };
  const read = (file, what) => {
    try {
      return JSON.parse(readFileSync(file, 'utf8'));
    } catch (e) {
      return stop(`${what} could not be read: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  const person = read(personFile, 'the person');
  let screens = null;
  if (screenFile !== undefined) {
    const handed = read(screenFile, 'the screen');
    screens = Array.isArray(handed) ? handed : [handed];
    if (screens.length === 0 || screens.some((s) => s === null || typeof s !== 'object')) stop('the screen file holds no snapshot');
  } else if (!args.includes('--words')) {
    try {
      const drawn = await drawnScreens(person);
      if (drawn.why !== null) stop(`no screen was drawn: ${drawn.why}`);
      screens = drawn.screens;
    } catch (e) {
      stop(`the screens could not be drawn: ${e instanceof Error ? e.message : String(e)}`);
    }
    const keep = flag('--write');
    if (keep !== undefined) writeFileSync(keep, `${JSON.stringify(screens, null, 1)}\n`);
  }
  const { lines, code } = report(screens, person, process.stdout.isTTY === true, args.includes('--strict'));
  for (const line of lines) console.log(line);
  process.exit(code);
}

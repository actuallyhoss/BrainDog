/**
 * THE THREE QUICK CHECKS OF A LOOK (cause 1): every round was green on the sample record
 * while his own showed record words, the same thing counted three ways, and numbers from 28 September drawn as today's.
 * They run on the look's pictures of whichever record it draws, and a batch is judged on their one line.
 *
 *   words   what `words.mjs` counts in each screen's visible text (ids, handles, templates, codes, paths, machine words).
 *   counts  the same thing read on two screens must be one number: projects in play, and what needs you.
 *   ages    a number whose newest reading is more than a week old must say how old on the screen.
 *   blank   a screen drawn with no name and next to nothing on it, or a project's page with no name or hero, is no
 *           screen: his project pages went blank and the look called them ready.
 *
 * NO BROWSER HERE. `pageFactsIn` is the one function that runs in the page (`page.evaluate`), and everything else takes
 * what it handed back, so each check is tried on a planted string and on clean text without drawing anything.
 *
 * HONEST ABOUT WHAT IT READ. Each check says how many places or figures it found, so a check that went blind (a class
 * renamed, a sentence reworded) shows as "read 0" rather than as a pass, and `CANNOT` says what no picture shows it.
 */

import { KIND_NAMES } from './words.mjs';

const DAY = 86_400_000;

/** A number older than this many days must say its age (the audit: "a number older than a week"). */
export const OLD_AFTER_DAYS = 7;

/** What these checks cannot see, said with every look so a green line is not read as more than it is. */
export const CANNOT = [
  'text behind a press other than the palette (a fold, a sheet, a menu): the look presses only the palette open',
  'the age of a figure with no date in the page: a KPI figure is dated by its sentence and a lines chart by its points; a plain figure, bar, ring or sparkline is not read',
  'any count but projects in play and what needs you',
];

const num = (s) => Number(String(s).replace(/,/gu, ''));
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const listOf = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);

/* ── in the page ────────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * EVERYTHING THE CHECKS NEED THAT TEXT DOES NOT HOLD, read in the page (`page.evaluate(pageFactsIn)`, so it uses nothing
 * outside itself): the needs-you badge wherever the shell draws it while it is drawn; the More sheet's sections, drawn
 * or not, since a closed dialog still holds its rows; each key number's sentence (what a screen reader is told) with
 * the words of the box it stands in; each lines chart's points; and the drawn blocks a screen reader is not told, which
 * are samples and not claims (`decor`).
 */
export function pageFactsIn() {
  const main = document.querySelector('main') ?? document.body;
  const shown = (el) => (el.checkVisibility ? el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) : true);
  const words = (s) => String(s ?? '').replace(/\s+/gu, ' ').trim();
  const badges = [...document.querySelectorAll('[aria-label]')]
    .filter(shown)
    .map((el) => el.getAttribute('aria-label') ?? '')
    .filter((label) => /^\d[\d,]*\+?\s+open questions?$/iu.test(label));
  const more = [...document.querySelectorAll('nav.more-nav h3.more-section')].map((h) => ({
    heading: words(h.textContent),
    rows: [...(h.nextElementSibling?.querySelectorAll('.more-name') ?? [])].map((n) => words(n.textContent)),
  }));
  /* THE BOX OF A FIGURE: the nearest thing around its sentence that also holds the key number's name in what is drawn. */
  const boxOf = (el, name) => {
    let box = el;
    for (let i = 0; i < 6; i += 1) {
      if (String(box.innerText ?? '').includes(name)) return box;
      if (box.parentElement === null || box.parentElement === main) break;
      box = box.parentElement;
    }
    return box;
  };
  const sentences = [...main.querySelectorAll('[aria-label]')]
    .filter(shown)
    .flatMap((el) => {
      const label = el.getAttribute('aria-label') ?? '';
      const name = /(?:^|, )([^,:]{2,80}): /u.exec(label)?.[1];
      /* A lines chart has a sentence of its own ("Day: Revenue, 1 Sep 10 to ... on 3 Sep"); it is read by its points. */
      if (name === undefined || !/ (?:on|in) /u.test(label) || el.closest('.lines') !== null) return [];
      return [{ label, box: words(boxOf(el, name).innerText).slice(0, 600) }];
    });
  const charts = [...main.querySelectorAll('.lines:not([data-single])')]
    .filter(shown)
    .map((el) => ({
      name: words(el.querySelector('.lines-key:not([data-was]) .lines-name')?.textContent) || 'a chart',
      was: [...el.querySelectorAll('.lines-key')].map((k) => k.hasAttribute('data-was')),
      rows: [...el.querySelectorAll('.lines-table tbody tr')].map((tr) => [words(tr.querySelector('th')?.textContent), ...[...tr.querySelectorAll('td')].map((td) => words(td.textContent))]),
      box: words(el.innerText).slice(0, 600),
    }));
  /* WHAT A SCREEN READER IS NOT TOLD (aria-hidden, drawn, a number and several words): a sample, never a claim. A lone
     figure ("3" in a date's corner) is left out, since it is nowhere near a sentence and would blank that figure elsewhere. */
  const decor = [...document.querySelectorAll('[aria-hidden="true"]')]
    .filter((el) => el.parentElement?.closest('[aria-hidden="true"]') === null && shown(el))
    .map((el) => String(el.innerText ?? '').trim())
    .filter((t) => /\d/u.test(t) && /\s/u.test(t));
  return { badges, more, sentences, charts, decor };
}

/**
 * WHAT THE SCREEN DREW AT ALL, read in the page as `pageFactsIn` is (`page.evaluate(drawnIn)`): whether its main has
 * a name, how many words it holds, and on a project's page whether its hero is drawn with the name in it.
 */
export function drawnIn() {
  const main = document.querySelector('main') ?? document.body;
  const shown = (el) => (el.checkVisibility ? el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) : true);
  const words = (s) => String(s ?? '').replace(/\s+/gu, ' ').trim();
  const named = (el) => shown(el) && words(el.textContent) !== '';
  return {
    heading: [...main.querySelectorAll('h1')].some(named),
    words: words(main.innerText).split(' ').filter(Boolean).length,
    project: main.querySelector('[data-project]') !== null,
    hero: [...main.querySelectorAll('section.hero h1')].some(named),
  };
}

/* ── blank screens ──────────────────────────────────────────────────────────────────────────────────────────── */

/** Fewer words than this in a screen's main, with no name over them, is a blank screen. */
export const BLANK_UNDER_WORDS = 20;

/**
 * WHY A PICTURE IS A BLANK SCREEN, or `null`: no name and fewer than `BLANK_UNDER_WORDS` words, or a project's page (the
 * page says it is one, or the look picked it as the project) with no name or no hero. `drawn` is `drawnIn`'s.
 */
export function blankOf(drawn, screen) {
  if (!drawn) return null;
  if (!drawn.heading && drawn.words < BLANK_UNDER_WORDS) return `no name and ${plural(drawn.words, 'word')}`;
  if ((drawn.project || screen === 'project') && !(drawn.heading && drawn.hero)) return drawn.heading ? 'a project page with no hero' : "a project page with no name or hero";
  return null;
}

/** Across a look: every picture of a blank screen, with how many pictures were read for it. */
export function judgeBlank(shots) {
  const read = shots.filter((s) => s.drawn);
  const blank = read.flatMap((s) => {
    const why = blankOf(s.drawn, s.screen);
    return why === null ? [] : [{ screen: s.name ?? s.screen, at: `${s.width} ${s.theme}`, why }];
  });
  return { read: read.length, blank };
}

/* ── counts ─────────────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * WHERE EACH COUNTED THING IS SAID IN WORDS, by the place's name and the shape that reads it. A reading is a number
 * and where it was read; the frame's (the badge, the More sheet) come from `pageFactsIn`. These are the product's own
 * spellings (`ProjectCards.svelte`, `today-tiles.ts` `sentenceOf`, `routes/decide/views.ts` `groupSentence`), so a
 * reworded line drops out of the reading and the place count says so.
 */
const READERS = {
  'in play': [
    ['the lane bar', /\bIn play\s+(\d[\d,]*)\b/gu],
    ['the Projects count', /^Projects\n(\d[\d,]*)\n(?=In play\b)/gmu],
    /* ON ONE LINE: a count over the lane bar ("Projects 3", then "In play 3" under it) is not a sentence saying it. */
    ['a sentence', /\b(\d[\d,]*)[  ]+(?:projects?[  ]+)?in play\b/giu],
  ],
  'need you': [
    ['the line', /\b(\d[\d,]*) needs? you\b/gu],
    ['the Needs you tile', /^Needs you\n(\d[\d,]*)$/gmu],
    ['the brief', /\b(\d[\d,]*) questions? waits? on you\b/giu],
  ],
};

/** Every count this screen says, by the thing counted: `{ 'in play': [{ at, n }], 'need you': [...] }`. */
export function countsIn(whole, frame = {}) {
  const out = Object.fromEntries(Object.keys(READERS).map((thing) => [thing, []]));
  /* A SAMPLE IS NOT A COUNT: Appearance previews a Today line ("3 need you today"), and a screen reader is not told it. */
  const text = (frame.decor ?? []).reduce((t, d) => t.split(d).join(' '), String(whole));
  for (const [thing, readers] of Object.entries(READERS))
    for (const [at, re] of readers) for (const m of text.matchAll(re)) out[thing].push({ at, n: num(m[1]) });
  /* NEEDS YOU'S OWN LINE says two groups ("8 need you: 3 about money, £7,239 in all, and 5 quick ones."), and what needs
     you is both. */
  const money = /\b(\d[\d,]*) about money\b/u.exec(text);
  const quick = /\b(\d[\d,]*) quick ones?\b/u.exec(text);
  if (money || quick) out['need you'].push({ at: 'the Needs you line', n: num(money?.[1] ?? 0) + num(quick?.[1] ?? 0) });
  for (const label of frame.badges ?? []) {
    const m = /^(\d[\d,]*)\+?\s+open questions?$/iu.exec(label);
    if (m) out['need you'].push({ at: 'the badge', n: num(m[1]) });
  }
  const projects = (frame.more ?? []).find((s) => /^projects$/iu.test(s.heading));
  if (projects) out['in play'].push({ at: 'the More sheet', n: projects.rows.length });
  return out;
}

/**
 * WHETHER THE SAME THING IS ONE NUMBER, judged within each width and theme (a phone and a laptop draw different parts,
 * and a live record moves between a look's first picture and its last). For each thing: how many readings, in how many
 * kinds of place, the numbers, and where they came from when they disagree.
 */
export function judgeCounts(shots) {
  const out = {};
  for (const thing of Object.keys(READERS)) {
    const readings = shots.flatMap((s) => (s.counts?.[thing] ?? []).map((r) => ({ ...r, screen: s.name ?? s.screen, group: `${s.width} ${s.theme}` })));
    const groups = new Map();
    for (const r of readings) groups.set(r.group, [...(groups.get(r.group) ?? []), r]);
    const spread = (rs) => [...new Set(rs.map((r) => r.n))];
    const worst = [...groups].filter(([, rs]) => spread(rs).length > 1).sort((a, b) => spread(b[1]).length - spread(a[1]).length)[0];
    const first = [...groups.values()][0];
    const seen = new Map();
    for (const r of worst?.[1] ?? []) seen.set(`${r.n}|${r.at}|${r.screen}`, { n: r.n, at: r.at, screen: r.screen });
    out[thing] = {
      read: readings.length,
      places: [...new Set(readings.map((r) => r.at))],
      agree: worst === undefined,
      values: (worst ? spread(worst[1]) : first ? spread(first) : []).sort((a, b) => b - a),
      ...(worst ? { in: worst[0], seen: [...seen.values()] } : {}),
    };
  }
  return out;
}

/* ── ages ───────────────────────────────────────────────────────────────────────────────────────────────────── */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `2026-09-02` as a reader says it: `2 Sep`. */
const daySaid = (iso) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};

/** The reader's calendar day of an instant, as a UTC midnight, so two days subtract to whole days. */
const dayOf = (ms) => {
  const d = new Date(ms);
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
};

/** A year for a date written without one: this year's, or last year's if that would be after today. */
const yearFor = (month, day, now) => {
  const year = new Date(now).getFullYear();
  return Date.UTC(year, month, day) > dayOf(now) + DAY ? year - 1 : year;
};

/** `28 Sep`, `28 Sep 2025` or `2026-09-28` as a day (UTC midnight), or `null` when it is none of them. */
export function dayFrom(label, now) {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(label);
  if (iso) return Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const m = /^(\d{1,2}) ([A-Z][a-z]{2})(?: (\d{4}))?$/u.exec(label);
  const month = m ? MONTHS.indexOf(m[2]) : -1;
  if (!m || month < 0) return null;
  return Date.UTC(m[3] ? Number(m[3]) : yearFor(month, Number(m[1]), now), month, Number(m[1]));
}

/** The last day of `Aug` or `Aug 2025`, or `null`. */
function monthEnd(label, now) {
  const m = /^([A-Z][a-z]{2})(?: (\d{4}))?$/u.exec(label);
  const month = m ? MONTHS.indexOf(m[1]) : -1;
  if (!m || month < 0) return null;
  const year = m[2] ? Number(m[2]) : yearFor(month, 1, now);
  return Date.UTC(year, month + 1, 0);
}

/**
 * A KEY NUMBER'S SENTENCE, as `kpiView` writes it for a screen reader (`packages/render/src/kpis.ts`): "Subscribers: 318
 * people on 2 Sep, Up 5.6% since 26 Aug", a card's with its own words before it. The reading it names is the day, the
 * end of the week or the end of the month it was read for, or today; `null` for a sentence that names none.
 */
export function readingOf(sentence, now) {
  const m = /(?:^|, )([^,:]{2,80}): (.{1,60}?) (?:on (\d{1,2} [A-Z][a-z]{2}(?: \d{4})?)|in the week of (\d{1,2} [A-Z][a-z]{2}(?: \d{4})?)|in ([A-Z][a-z]{2}(?: \d{4})?)|today)(?:,|$)/u.exec(sentence);
  if (!m) return null;
  const [, name, , day, week, month] = m;
  const newest = day ? dayFrom(day, now) : week ? (dayFrom(week, now) ?? NaN) + 6 * DAY : month ? monthEnd(month, now) : dayOf(now);
  if (newest === null || Number.isNaN(newest)) return null;
  return { name, newest, label: day ?? week ?? month ?? '' };
}

/** What a chart's table prints for a day with no reading: nothing, or the dash (`MISSING` in the renderer's `format.ts`). */
const MISSING = new Set(['', '\u2014', '\u2013', '-']);

/** A lines chart's newest reading: the latest day in its points that has a value on a line that is not the period before. */
export function newestIn(chart, now) {
  const current = chart.was.map((was, k) => (was ? -1 : k + 1)).filter((k) => k > 0);
  let newest = null;
  let label = '';
  for (const row of chart.rows ?? []) {
    if (!current.some((k) => !MISSING.has(row[k] ?? ''))) continue;
    const at = dayFrom(row[0] ?? '', now);
    if (at !== null && (newest === null || at > newest)) {
      newest = at;
      label = row[0];
    }
  }
  return newest === null ? null : { newest, label };
}

/** What counts as the screen saying how old a number is: a word for it, or the reading's own date drawn beside it. */
const AGE_SAID = /\b(?:today|yesterday)\b|\b\d+\s*(?:s|m|h|d|w|y|sec|min|hr|hrs|hour|day|week|month|year)s?\s+ago\b|\bnot updated\b|\bupdated\b|\bstale\b|\bas of\b|\blast (?:updated|reading|read|heard|seen|on)\b/iu;

/**
 * The dated figures a screen draws and how old each is: `{ read, unread, old }`, where `old` is every figure older than
 * `OLD_AFTER_DAYS` with whether its box says its age. `facts` is `pageFactsIn`'s; `now` is the record's own clock.
 */
export function agesOf(facts, now) {
  const today = dayOf(now);
  const figures = [];
  let unread = 0;
  for (const { label, box } of facts.sentences ?? []) {
    const r = readingOf(label, now);
    if (r) figures.push({ kind: 'number', name: r.name, newest: r.newest, said: r.label, box });
  }
  for (const chart of facts.charts ?? []) {
    const r = newestIn(chart, now);
    if (r) figures.push({ kind: 'chart', name: chart.name, newest: r.newest, said: r.label, box: chart.box });
    else unread += 1;
  }
  const old = figures
    .map((f) => ({ ...f, days: Math.floor((today - f.newest) / DAY) }))
    .filter((f) => f.days > OLD_AFTER_DAYS)
    .map((f) => ({
      kind: f.kind,
      name: f.name,
      said: f.said,
      newest: new Date(f.newest).toISOString().slice(0, 10),
      days: f.days,
      shown: AGE_SAID.test(f.box) || (f.said !== '' && new RegExp(`(?<![\\w])${escapeRe(f.said)}(?![\\w])`, 'u').test(f.box)),
    }));
  return { read: figures.length, unread, old };
}

/** Across a look: the old figures that say nothing of their age, once for each screen they are on. */
export function judgeAges(shots) {
  const flagged = new Map();
  const read = new Map();
  const unread = new Map();
  for (const s of shots) {
    /* A SCREEN IS DRAWN AT SIX SIZES AND THEMES: it holds as many figures as its fullest picture does, not six times that. */
    read.set(s.screen, Math.max(read.get(s.screen) ?? 0, s.ages?.read ?? 0));
    unread.set(s.screen, Math.max(unread.get(s.screen) ?? 0, s.ages?.unread ?? 0));
    for (const f of s.ages?.old ?? []) if (!f.shown) flagged.set(`${s.screen}|${f.name}|${f.newest}`, { screen: s.name ?? s.screen, ...f });
  }
  const sum = (m) => [...m.values()].reduce((a, b) => a + b, 0);
  return { read: sum(read), unread: sum(unread), screens: [...read.values()].filter((n) => n > 0).length, flagged: [...flagged.values()] };
}

/* ── the look's one line ────────────────────────────────────────────────────────────────────────────────────── */

/** How many raw things a picture counts. */
const rawTotal = (raw) => Object.values(raw ?? {}).reduce((n, k) => n + k.count, 0);

/** Across a look: the words found, each screen once at its worst picture. */
export function judgeWords(shots) {
  const worst = new Map();
  for (const s of shots) {
    const total = rawTotal(s.raw);
    if (total > 0 && total > (worst.get(s.screen)?.total ?? 0)) worst.set(s.screen, { screen: s.name ?? s.screen, at: `${s.width} ${s.theme}`, total, raw: s.raw });
  }
  const screens = [...worst.values()];
  const byKind = {};
  for (const s of screens) for (const [kind, k] of Object.entries(s.raw)) byKind[kind] = (byKind[kind] ?? 0) + k.count;
  return { total: screens.reduce((n, s) => n + s.total, 0), screens: screens.length, byKind, found: screens };
}

/**
 * THE LOOK'S VERDICT ON THE THREE: what each found, the one line a batch is judged on, the sentences under it for a
 * reader to start from, and whether anything was found at all (which makes the look fail, as text crossing text does).
 */
export function judge(shots) {
  const words = judgeWords(shots);
  const counts = judgeCounts(shots);
  const ages = judgeAges(shots);
  const blank = judgeBlank(shots);
  const split = Object.entries(counts).filter(([, c]) => !c.agree);
  const told = Object.entries(counts).filter(([, c]) => c.agree && c.read > 0);
  const unread = Object.entries(counts).filter(([, c]) => c.read === 0);
  const countsSaid =
    split.length > 0
      ? `counts disagree: ${split.map(([thing, c]) => `${thing} ${c.values.join('/')}`).join(', ')}`
      : told.length === 0
        ? 'counts not read'
        : `counts agree: ${told.map(([thing, c]) => `${thing} ${c.values[0]} (${plural(c.places.length, 'place')})`).join(', ')}${unread.length > 0 ? `; not read: ${unread.map(([thing]) => thing).join(', ')}` : ''}`;
  const wordsSaid = words.total === 0 ? 'words: 0' : `words: ${words.total} on ${plural(words.screens, 'screen')}`;
  const agesSaid = `old numbers without age: ${ages.flagged.length}${ages.flagged.length === 0 ? ` (read ${plural(ages.read, 'dated figure')})` : ''}`;
  /* SAID WHERE ONE IS FOUND, so a clean look's line is the one it always was. */
  const summary = [wordsSaid, countsSaid, agesSaid, ...(blank.blank.length > 0 ? [`blank screens: ${blank.blank.length}`] : [])].join('; ');

  /* THE SENTENCES UNDER IT, short: screens that read the same are one sentence, and a long list of places is a few and a count. */
  const names = (xs) => (xs.length <= 3 ? listOf(xs) : `${xs.slice(0, 2).join(', ')} and ${xs.length - 2} more`);
  const lines = [];
  const alike = new Map();
  for (const s of words.found) {
    const said = Object.entries(s.raw).map(([kind, k]) => `${KIND_NAMES[kind] ?? kind} ${k.e[0]}${k.count > 1 ? ` (${k.count})` : ''}`).join('; ');
    alike.set(said, [...(alike.get(said) ?? []), s]);
  }
  for (const [said, ss] of [...alike].slice(0, 4)) lines.push(`words on ${names(ss.map((s) => s.screen))} at ${ss[0].at}: ${said}`);
  if (alike.size > 4) lines.push(`words on ${alike.size - 4} more kinds of screen`);
  for (const [thing, c] of split) {
    const where = new Map();
    for (const r of c.seen) where.set(`${r.n} in ${r.at}`, [...(where.get(`${r.n} in ${r.at}`) ?? []), r.screen]);
    lines.push(`${thing}: ${[...where].map(([said, ss]) => `${said} (${names(ss)})`).join(', ')}, at ${c.in}`);
  }
  for (const f of ages.flagged.slice(0, 6)) lines.push(`${f.name} on ${f.screen} is from ${f.said || daySaid(f.newest)}, ${plural(f.days, 'day')} old, and says nothing of it`);
  if (ages.flagged.length > 6) lines.push(`${ages.flagged.length - 6} more old numbers without an age`);
  for (const b of blank.blank.slice(0, 6)) lines.push(`${b.screen} at ${b.at} is blank: ${b.why}`);
  if (blank.blank.length > 6) lines.push(`${blank.blank.length - 6} more blank pictures`);

  return {
    summary,
    found: words.total > 0 || split.length > 0 || ages.flagged.length > 0 || blank.blank.length > 0,
    words: { total: words.total, screens: words.screens, byKind: words.byKind },
    counts,
    ages,
    blank,
    lines,
    cannot: CANNOT,
  };
}

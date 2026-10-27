/**
 * The shape of a person file, checked with no network and no record: every field the walk reads is there and of the
 * kind it reads, so a file missing one is refused here, by name, and never turns into a red step that blames the
 * product (`expect/first-run.mjs`).
 *
 * `node tools/people/check-files.mjs [file ...]`: every `*.json` in `tools/people/` and `tools/people/people/` when no
 * file is named. One line a problem, and exit 1 when there is any.
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The five starting points (`apps/web/src/lib/first-run.ts` `STARTING_POINTS`), read as text so nothing is run. No screen
 * draws them as chips (first F6); the reading is held to understand each one.
 */
function startingPoints(root) {
  const src = readFileSync(join(root, 'apps/web/src/lib/first-run.ts'), 'utf8');
  const line = /STARTING_POINTS\s*=\s*\[([^\]]*)\]/u.exec(src)?.[1] ?? '';
  return [...line.matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/gu)].map((m) => (m[1] ?? m[2]).replace(/\\(.)/gu, '$1'));
}

const isText = (v) => typeof v === 'string' && v.trim() !== '';
const isTexts = (v) => Array.isArray(v) && v.length > 0 && v.every(isText);
const isCount = (v) => Number.isInteger(v) && v > 0;
const isPattern = (v) => {
  try {
    return new RegExp(v, 'u') instanceof RegExp;
  } catch {
    return false;
  }
};

/** Each field a person file holds, and what it must be. A dotted key is a field inside one. */
export const FIELDS = {
  id: [(v) => isText(v) && /^[a-z][a-z0-9-]*$/u.test(v), 'lower-case words joined by hyphens'],
  name: [isText, 'her first name, as she types it'],
  who: [isText, 'one sentence on who she is'],
  said: [isText, 'what she types at "Who are you?"'],
  expects: [(v) => isText(v) && /^([a-z][a-z-]*|none)$/u.test(v), 'the use case her words should read as, or none'],
  standing: [(v) => typeof v === 'boolean', 'whether a standing record uses her every night'],
  'says.plain': [isText, 'what she types, with a keyword'],
  'says.hard': [isText, 'what she types, with no keyword'],
  answers: [(v) => v !== null && typeof v === 'object' && !Array.isArray(v), 'her answers by question kind'],
  email: [(v) => isText(v) && /^[^@\s]+@[^@\s]+\.test$/u.test(v), 'an address at a test sink, ending .test'],
  slug: [(v) => isText(v) && /^[a-z0-9][a-z0-9-]{1,40}$/u.test(v), 'the record name she would pick'],
  zone: [(v) => isText(v) && v.includes('/'), 'a time zone such as Africa/Cairo'],
  locale: [isText, 'the language her browser says'],
  languages: [isTexts, "her browser's languages, first first"],
  start: [(v) => isText(v) && Number.isFinite(Date.parse(v)), 'the moment the walk starts, ISO 8601'],
  first: [isText, 'her first real thing, the sentence she tells the card'],
  later: [(v) => Array.isArray(v) && v.every((x) => isCount(x?.day) && isTexts(x?.said)), 'what she tells on later days, { day, said: [...] }'],
  'expect.who.question': [isText, 'the first heading'],
  'expect.who.chips': [isCount, 'how many starting points'],
  'expect.who.promises': [(v) => Array.isArray(v) && v.length > 0 && v.every((p) => isText(p?.says) && isText(p?.match)), 'each promise as { says, match }'],
  'expect.heard.usecase': [isText, 'the use case her words read as'],
  'expect.heard.title': [isText, 'what the record is called from her words'],
  'expect.heard.lit': [isTexts, 'the phrases that light up'],
  'expect.heard.places': [isTexts, 'the places named, Today first'],
  'expect.keep.lists': [isTexts, 'the lists the build makes'],
  'expect.keep.currency': [(v) => isText(v) && /^[A-Z]{3}$/u.test(v), "the record's currency"],
  'expect.tell.lists': [isTexts, 'the lists her first real thing previews into, in order'],
  'expect.today.first': [(v) => v === 'source' || v === 'agent', 'the kind of the first next step, source or agent'],
  'expect.today.lists': [isTexts, 'the lists Today must hold'],
  'expect.offer.id': [isText, "the pen's offer, such as week:orders"],
  'expect.offer.before': [isCount, 'a day before which nothing is offered'],
  'expect.offer.after': [isCount, 'the day the offer must be there'],
};

/**
 * WHAT A PERSON MAY SAY AND NEED NOT: a shop's money tile and its Orders sentence mean nothing for a student. Each is
 * checked only where the file holds it, and the walk checks it only then.
 */
export const MAYBE = {
  /* SOMEBODY WHO TAPS NO STARTING POINT AND IS ASKED NO QUESTION holds none of these four (Dina, on Free). */
  chip: [isText, 'the starting point she would tap'],
  answer: [isText, 'her answer to the one question'],
  'expect.question.about': [isText, 'what the one question is about'],
  'expect.question.choices': [isCount, 'how many answers it offers'],
  'expect.heard.became': [(v) => v !== null && typeof v === 'object' && !Array.isArray(v) && Object.values(v).every(isTexts), 'what each phrase becomes, { phrase: [the places it names] }'],
  'expect.today.money': [isText, 'the money tile as Today draws it, such as Paid EGP 900'],
  'expect.offer.lead': [(v) => isText(v?.says) && isText(v?.match) && isPattern(v.match), "the Orders page's sentence on that day, as { says, match }"],
};

const at = (obj, key) => key.split('.').reduce((o, k) => (o !== null && typeof o === 'object' ? o[k] : undefined), obj);

/** What is wrong with one person, one sentence each; empty when nothing is. `chips` are the five starting points. */
export function checkPerson(person, chips = []) {
  const out = [];
  if (person === null || typeof person !== 'object' || Array.isArray(person)) return ['the file is not one person'];
  for (const [key, [ok, what]] of Object.entries(FIELDS)) {
    const v = at(person, key);
    if (v === undefined) out.push(`${key} is missing: ${what}`);
    else if (!ok(v)) out.push(`${key} is not ${what}`);
  }
  for (const [key, [ok, what]] of Object.entries(MAYBE)) {
    const v = at(person, key);
    if (v !== undefined && !ok(v)) out.push(`${key} is not ${what}`);
  }
  if (out.length > 0) return out;
  if (!person.said.includes(person.name)) out.push(`said does not hold her name, ${person.name}`);
  if (person.chip !== undefined && chips.length > 0 && !chips.includes(person.chip)) out.push(`chip "${person.chip}" is not one of the starting points`);
  if (person.said !== person.says.plain) out.push('said is not says.plain');
  if (person.expect.heard.places[0] !== 'Today') out.push('expect.heard.places does not start with Today');
  for (const phrase of Object.keys(person.expect.heard.became ?? {})) if (!person.expect.heard.lit.includes(phrase)) out.push(`expect.heard.became names "${phrase}", which is not lit`);
  if (!person.later.some((l) => l.day === person.expect.offer.after)) out.push(`later holds nothing told on day ${person.expect.offer.after}`);
  if (person.expect.offer.before >= person.expect.offer.after) out.push('expect.offer.before is not before expect.offer.after');
  return out;
}

/** The person files under `dir`: its own `*.json` and those in `people/`. */
export function personFiles(dir) {
  const own = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => join(dir, f));
  const more = existsSync(join(dir, 'people')) ? readdirSync(join(dir, 'people')).filter((f) => f.endsWith('.json')).map((f) => join(dir, 'people', f)) : [];
  return [...own, ...more];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const here = dirname(fileURLToPath(import.meta.url));
  const root = join(here, '../..');
  const chips = startingPoints(root);
  /* NONE READ IS A READING GONE STALE, never a pass: with no starting points every chip would go unchecked, as it did
     once `whoChips` left `first-run.ts`. */
  if (chips.length === 0) {
    console.log('apps/web/src/lib/first-run.ts: no STARTING_POINTS read, so no chip could be checked');
    process.exit(1);
  }
  const files = process.argv.length > 2 ? process.argv.slice(2) : personFiles(here);
  let bad = 0;
  for (const file of files) {
    let person;
    try {
      person = JSON.parse(readFileSync(file, 'utf8'));
    } catch (e) {
      console.log(`${relative(root, file)}: not JSON (${e.message})`);
      bad++;
      continue;
    }
    const wrong = checkPerson(person, chips);
    for (const w of wrong) console.log(`${relative(root, file)}: ${w}`);
    if (wrong.length === 0) console.log(`${relative(root, file)}: ok`);
    bad += wrong.length;
  }
  process.exit(bad > 0 ? 1 : 0);
}

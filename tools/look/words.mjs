/**
 * What a person must never read on a screen, counted on each picture for the reader to look at first.
 *
 * ONE TABLE, `RAW`, FOR THE LOOK AND FOR THE WALKS. `rawIn(text)` counts the five kinds the table began with and
 * nothing else, so the people's walks (`tools/usecase-walks/walk.mjs`) fail on exactly what they always failed on.
 * `rawIn(text, { all: true })` counts every kind, which is what a picture of a record is judged on (`capture.mjs`),
 * and `{ slugs }` adds the addresses this record's own pages go by.
 *
 * A KIND IS NAMED FOR THE THING, a shape is held with the page lint's (`packages/render/src/lint.ts`) and the words
 * gate's (`tools/gates/words.json`) wherever one of theirs already says it, and the machine words are READ from
 * `words.json` rather than copied, so there is one list of them. A match is lifted out of the text before the next
 * kind looks, so a UUID is not also a run of hex and a date inside a path is not also a date.
 */

import { readFileSync } from 'node:fs';

/** The words gate's list, read once: the machinery's nouns for a thing, by the name each is listed under. */
const WORDS = JSON.parse(readFileSync(new URL('../gates/words.json', import.meta.url), 'utf8')).words;

/**
 * THE MACHINE WORDS, by their names in `words.json`: row, list item, entity and register as a noun. "List" is the
 * product's own word for what a person keeps (`words.json` says register is "list"), so it is not on this list: only
 * the forms that name the machinery are. `typed value` is the record lint's own phrase for a value it parses.
 */
export const MACHINE_WORDS = ['row', 'list item', 'entity', 'register'];
const machine = MACHINE_WORDS.map((name) => {
  const w = WORDS.find((x) => x.name === name);
  if (!w || w.case) throw new Error(`tools/gates/words.json has no case-blind word called ${name}, which the look counts as a machine word.`);
  return `(?:${w.shape})`;
}).join('|');

/** The small words of English: three hyphened words with none of them in are a name from the code (`bank-card-used-sms`). */
const SMALL_WORDS = new Set(['a', 'an', 'the', 'to', 'of', 'in', 'on', 'at', 'by', 'for', 'as', 'and', 'or', 'up', 'out', 'off', 'over', 'you', 'it', 'with', 'from', 'all']);

/** Every code ICU knows as a currency, so `GBP 0.00` is read and `USB 0` is not. */
const CURRENCIES = new Set(Intl.supportedValuesOf('currency'));

/** File extensions that make `some/place/name.ext` a path and not two words with a slash. */
const FILES = 'ts|tsx|js|jsx|mjs|cjs|json|jsonl|md|svelte|css|html|sql|ya?ml|toml|sh|py|brainl?|env|lock|log|png|jpe?g|gif|svg|webp|pdf|csv|txt|zip|gz|7z|sqlite';

const KINDS = {
  /* A template slot that was never filled: `{{revenue.monthly}}`, the audit's first finding on his record. */
  placeholders: { label: 'placeholder', re: /\{\{[^}\n]{1,80}\}\}/gu },
  /* A file or an address in the app, where a name goes: `~/Developer/x/NEXT.md`, `apps/web/src/Home.svelte`, `/p/sam-site`.
     Anchored on a root, a home, a dot or a known extension, and never on the middle of a web address, so "and/or" is not one. */
  paths: {
    label: 'file path',
    re: new RegExp(
      [
        String.raw`(?<![\w:/.@~-])~?/(?:Users|home|var|etc|tmp|opt|usr|srv|mnt|private)(?:/[\w.@+-]+)+`,
        String.raw`(?<![\w:/.@-])~/(?:[\w.@+-]+/)*[\w.@+-]+`,
        String.raw`(?<![\w:/.@-])\.{1,2}/(?:[\w.@+-]+/)*[\w.@+-]+`,
        String.raw`(?<![\w:/.@-])(?:[\w.@+-]+/)+[\w@+-]+\.(?:${FILES})\b`,
        String.raw`(?<![\w:/.@-])/(?:p|r|v|t|decide|packs|scripts|automations|jobs|settings)(?:/[\w.%@+-]+)+`,
        String.raw`\b[A-Za-z]:\\(?:[\w.@+ -]+\\)*[\w.@+-]+`,
      ].join('|'),
      'gu',
    ),
  },
  /* A machine instant in print: 2026-10-06T19:07:01.610Z. */
  instants: { label: 'raw time', re: /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?\b/gu },
  /* A date in the machine's order, 2026-10-06, where "6 Oct" goes (a spaced stamp, 2026-10-06 19:07:01, is read here
     too). An invoice number (2026-041) is not one. */
  dates: { label: 'raw date', re: /\b\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])\b/gu },
  /* A row's own id, a ULID: 26 characters of Crockford's alphabet. */
  ids: { label: 'raw id', re: /\b[0-9A-HJKMNP-TV-Z]{26}\b/gu },
  /* A UUID, or a run of hex with a digit and a letter in it: a commit (`8b1fe59`) or a random id. */
  hashes: {
    label: 'commit or random id',
    re: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b|\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{7,}\b/gu,
  },
  /* An address in the record's own spelling, `tools#8`, where a name belongs. */
  handles: { label: 'raw handle', re: /\b[a-z][a-z_]{2,}#\d+\b/gu },
  /* A run's handle (`S731`) or a question's (`SG185`), which a person only reads beside a name. */
  refs: { label: 'run or question handle', re: /(?<![\w#/.-])(?:S\d{2,6}|SG\d{1,6})(?![\w#-])/gu },
  /* A name from the code: three hyphened words with no small word of English in them. The page addresses of this
     record are added when they are known (`slugsOf`), because `sam-site` is two. */
  slugs: {
    label: 'slug',
    re: /(?<![\w.@/:-])[a-z][a-z0-9]*(?:-[a-z0-9]+){2,}(?![\w@/-]|\.\w)/gu,
    keep: (m) => !m.split('-').some((w) => SMALL_WORDS.has(w)),
  },
  /* A refusal's or a setting's code: UPPER_CASE with an underscore in it. */
  codes: { label: 'refusal or setting code', re: /\b[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+\b/gu },
  /* An empty amount written the machine's way, `GBP 0.00`, where "no amount" or a plain £0 goes. */
  zeros: {
    label: 'zero amount',
    re: /(?<![\p{L}\p{N}])[A-Z]{3}[\s\u00a0]?[−-]?0+(?:[.,]0+)?(?![\d.,]*[1-9])(?![%\p{L}])/gu,
    keep: (m) => CURRENCIES.has(m.slice(0, 3)),
  },
  /* A code span printed with its backticks, as an agent wrote it for a terminal. */
  ticks: { label: 'code quote', re: /`[^`\n]{1,80}`/gu },
  /* The machinery's nouns (row, list item, entity, the register), and the record lint's "typed value". */
  machine: { label: 'machine word', re: new RegExp(`${machine}|\\btyped values?\\b`, 'giu'), ctx: true },
  /* The words a stuck value prints. */
  stuck: { label: 'stuck value', re: /\b(?:undefined|NaN|null)\b|\[object Object\]/gu },
};

/** The table: kind to its shape. */
export const RAW = Object.fromEntries(Object.entries(KINDS).map(([kind, k]) => [kind, k.re]));

/** What each kind is called to a reader, for a sheet or a sentence. */
export const KIND_NAMES = Object.fromEntries(Object.entries(KINDS).map(([kind, k]) => [kind, k.label]));

/** The five kinds the table began with, which `rawIn(text)` still counts on its own. */
export const ORIGINAL = ['placeholders', 'instants', 'ids', 'handles', 'stuck'];

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

/**
 * The addresses this record's pages go by that a person would not say: a slug with a hyphen or an underscore in it
 * that is not just the page's own title written as an address (`marlow-co` for "Marlow & Co" is its name, `sam-site`
 * for "Studio site" is not). `pages` is `boot`'s.
 */
export function slugsOf(pages) {
  const bare = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/gu, '');
  const slugs = (Array.isArray(pages) ? pages : []).filter((p) => typeof p?.slug === 'string' && /[-_]/u.test(p.slug) && bare(p.slug) !== bare(p.title)).map((p) => p.slug);
  return [...new Set(slugs)];
}

/** A short stretch of the text around a match, so "rows" on its own is read with the words it stands in. */
const around = (text, at, len) => {
  const from = Math.max(0, at - 24);
  const to = Math.min(text.length, at + len + 24);
  const cut = text.slice(from, to).replace(/\s+/gu, ' ').trim();
  return `${from > 0 ? '…' : ''}${cut}${to < text.length ? '…' : ''}`;
};

/**
 * The raw things in a screen's text, each kind with how many and up to three examples. `{ all: true }` counts every
 * kind, and `{ slugs }` names this record's page addresses (`slugsOf`) as one more shape of a slug.
 */
export function rawIn(text, { all = false, slugs = [] } = {}) {
  const out = {};
  const whole = String(text);
  let rest = whole;
  for (const [kind, k] of Object.entries(KINDS)) {
    if (!all && !ORIGINAL.includes(kind)) continue;
    const shapes = [k.re, ...(kind === 'slugs' && slugs.length > 0 ? [new RegExp(`(?<![\\w-])(?:${slugs.map(escapeRe).join('|')})(?![\\w-])`, 'gu')] : [])];
    const found = [];
    const placed = new Set();
    for (const re of shapes)
      for (const m of rest.matchAll(re)) {
        const key = `${m.index}:${m[0].length}`;
        if (placed.has(key) || (k.keep !== undefined && !k.keep(m[0]))) continue;
        placed.add(key);
        found.push({ at: m.index, text: m[0] });
      }
    if (found.length === 0) continue;
    rest = lifted(rest, found);
    const e = new Set();
    for (const f of found) {
      if (e.size === 3) break;
      e.add(k.ctx ? around(whole, f.at, f.text.length) : f.text);
    }
    out[kind] = { count: found.length, e: [...e] };
  }
  return out;
}

/** The text with each found stretch blanked to spaces of its own length, in one pass, so what is left keeps its places. */
function lifted(text, found) {
  let out = '';
  let last = 0;
  for (const f of [...found].sort((a, b) => a.at - b.at)) {
    if (f.at < last) continue;
    out += text.slice(last, f.at) + ' '.repeat(f.text.length);
    last = f.at + f.text.length;
  }
  return out + text.slice(last);
}

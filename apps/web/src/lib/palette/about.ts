/**
 * What a name typed in the palette is, and where it was seen: the rules of the palette's "what it is" rows.
 *
 * PURE, SO `node --test` CAN IMPORT IT, beside `slash.ts` and for its reason: a `.svelte` file cannot be imported by a
 * test. `Palette.svelte` asks the record's `about` read for the text in the box and draws what this file
 * makes of the answer, as rows like any other result.
 *
 * ONE THING IS ONE ROW, AND TWO ARE TWO. When the name settles on one thing the record answers it as `is`, and that is
 * the row: its name, what it is, and the newest place it was seen. When two things answer to the name the record picks
 * neither, and neither does this: both are rows, in the order answered, each opening its own address.
 *
 * NOTHING IS NOT SAID. A name the record knows nothing of draws no row and no line saying so. The search under it
 * already says when nothing matched, and most of what is typed in the box is not a name.
 *
 * IN NAMES. A row says a name, a kind in a plain word, and a place as the record worded it (a list's name and a title).
 * The list's id and the number in it are in the address the row opens and nowhere a person reads.
 */

import { since } from 'braindog-render';
import type { About } from '@braindog/client';

/** The fewest characters asked about. Two letters are the start of a word, and the search already answers those. */
export const ABOUT_MIN = 3;
/** The most, as the record holds a name (`ASKED` in its `about`): past it the box holds a page, not a name. */
export const ABOUT_MOST = 200;
/** How many rows the group draws. Past three a name is a search, and the search is already in the panel. */
export const ABOUT_SHOWN = 3;
/** How long the typing rests before the record is asked, in milliseconds: one read for a word, not one a letter. */
export const ABOUT_WAIT = 250;

export const aboutWords = {
  group: 'What it is',
  /* After the kind, as in "A project, also called NB Tower". */
  also: 'also called',
  /* Before the place, as in "Seen in Notes: Kickoff". */
  seen: 'Seen in',
} as const;

type Kind = NonNullable<About['is']>['kind'];

/** What each kind is called, as the start of the row's line, and the glyph that stands for it. */
const KINDS: Record<Kind, { word: string; glyph: 'user-check' | 'globe' | 'board' | 'tag' }> = {
  person: { word: 'A person', glyph: 'user-check' },
  org: { word: 'An organisation', glyph: 'globe' },
  project: { word: 'A project', glyph: 'board' },
  thing: { word: 'A thing', glyph: 'tag' },
};

/** One row of the group, as the palette draws any result. */
export type AboutRow = {
  id: string;
  title: string;
  /** What it is and where it was seen, as the line under the title. */
  detail: string;
  /** Its address in its list, or `null` for a thing with no number there, which opens nothing. */
  href: string | null;
  group: string;
  icon: (typeof KINDS)[Kind]['glyph'];
  complete: string;
};

/**
 * The name to ask the record about, or `null` when the box holds nothing to ask.
 *
 * A NAME, AND NOTHING ELSE. `>` and `/` are commands and pages, `#` is a number in a list, a text ending in a question
 * mark is a question for Slash, and a sentence the palette will act on (`acting`: add a task, make a page, go dark) is
 * not about anything. `@` is somebody's name, so it is asked.
 */
export function asksAbout(a: { prefix: string | null; text: string; acting?: boolean }): string | null {
  if (a.prefix !== null && a.prefix !== '@') return null;
  if (a.acting === true) return null;
  const name = a.text.trim();
  if (name.length < ABOUT_MIN || name.length > ABOUT_MOST || name.endsWith('?')) return null;
  return name;
}

/** Letters and digits only, lower case: how a typed text is compared to a name. */
const key = (said: string): string => said.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** Another name it goes by that the typed text is from, when its own name is not what was typed. */
function calledBy(name: string, also: readonly string[], typed: string): string | null {
  const t = key(typed);
  if (t === '' || key(name).includes(t)) return null;
  return also.find((a) => key(a).includes(t)) ?? null;
}

function line(kind: Kind, called: string | null, place: string | null): string {
  const what = called === null ? KINDS[kind].word : `${KINDS[kind].word}, ${aboutWords.also} ${called}`;
  return place === null ? what : `${what}. ${aboutWords.seen} ${place}`;
}

const address = (register: string, seq: number | null): string | null => (seq === null ? null : `/r/${encodeURIComponent(register)}/${seq}`);

/**
 * The rows an answer draws for the text that was typed: none for no answer or an answer of nothing, one for the thing
 * meant, and otherwise each thing the name may mean, up to `ABOUT_SHOWN`.
 *
 * WITH ONE THING MEANT, THE OTHERS ARE LEFT OUT. Beside `is` the record lists rows that only hold the word somewhere,
 * and those are what the search under this group already draws.
 */
export function aboutRows(answer: About | null | undefined, typed: string, now: number = Date.now()): AboutRow[] {
  if (answer === null || answer === undefined) return [];
  const row = (a: { kind: Kind; name: string; also: readonly string[]; register: string; seq: number | null }, place: string | null): AboutRow => ({
    id: `about-${a.register}-${a.seq ?? a.name}`,
    title: a.name,
    detail: line(a.kind, calledBy(a.name, a.also, typed), place),
    href: address(a.register, a.seq),
    group: aboutWords.group,
    icon: KINDS[a.kind].glyph,
    complete: a.name,
  });
  const is = answer.is;
  if (is !== null) {
    /* THE NEWEST PLACE, whatever order they came in, with how long ago. */
    const last = [...is.seen].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))[0];
    return [row(is, last === undefined ? null : `${last.where}, ${since(last.at, now)}`)];
  }
  return answer.candidates.slice(0, ABOUT_SHOWN).map((c) => row(c, c.seen[0] ?? null));
}

/** A row as one sentence: "Northbank, a project. Seen in Notes: Kickoff, 2d ago". What a screen reader is told. */
export function sentence(row: Pick<AboutRow, 'title' | 'detail'>): string {
  return `${row.title}, ${row.detail.charAt(0).toLowerCase()}${row.detail.slice(1)}`;
}

/**
 * What a page body and an arrangement may contain, as one compact read (`loop/research-spark.md` S12).
 *
 * THE LINT WAS THE ONLY TEACHER. An agent learned a page's grammar one refusal at a time, and each try was a
 * turn. This is the same grammar said once: every key, its bounds, and one page that installs. It is a
 * reference and not a validator: the install's own lint still decides, and a test holds the block kinds here
 * to the list that lint refuses against.
 */

import type { Result } from '@braindog/ports';
import { no, ok } from '@braindog/ports';
import { KINDS } from 'braindog-render';
import { VOICE_KEYS } from '@braindog/declare';

export const GRAMMARS = ['page', 'proposals'] as const;

const PAGE = {
  declaration: { id: 'page.<slug>', kind: 'page', body: 'the page body below' },
  body: {
    page: 'the slug, lower-case letters, digits and dashes (required)',
    title: 'text (required)',
    nav: '{section: text of at most 40 bytes, order: 0 to 9999, tabs?: true}; leave it off and the page has no place on the rail. tabs: true draws every page of that section as a strip of tabs over each of them, in nav order',
    layout: '{rail: 3, 4 or 5, sticky?: true}: a main column and a side rail, the rail in twelfths; sticky keeps the rail in view. Leave it off for one column',
    for: "{register: <id>, where?}: one page per row of that list, in the list's steps order or else the order the rows were written; {{field}} in any text is that row's field, and {{spoken}} is its id, such as parts#2",
    icon: 'a glyph name, such as board',
    tone: 'good, warn, bad or info',
    requires: '["register.<id>"], 1 to 16: every register a block reads',
    blocks: '1 to 24 blocks, drawn in order',
  },
  block: {
    kind: Object.keys(KINDS),
    span: 'width in twelfths, 1 to 12, inside its area',
    area: "main or rail; rail needs the page's layout. Main is where a block sits when it says nothing",
    heading: 'the words over it; on a section, the section itself',
    empty: 'the sentence drawn when it has no rows',
    body: "a note's own prose",
    source: 'register.<id>, metric.<id>, block.<n>, forecast.runway, activity, sessions.live or actions',
    where: 'a filter, such as state is open, or a predicate tree. On a capture, what the new row is preset with: about is parts#2 presets a link',
    register: 'the list a capture adds to, or the list whose one row inputs edits',
    row: "on inputs, the row it edits by its id, such as checks#1; the list's first row when it says nothing",
    columns: '[{field, label?}], 1 to 16; on cards, as: title, figure, fact, trend, ring, who, when, mark, next (the first open step under the card, from the list whose steps: {of, done, order?} names it) or reply (a quieter line under the title, such as a second opinion)',
    order: '[{field, dir: asc or desc}], 1 to 3',
    limit: 'rows, 0 to 500',
    cells: '[{metric, label?, note?}], 1 to 6, the figures a stat draws',
    authored: '[{cells: [text], tone?}], rows written out, never beside source',
    target: 'the number a gauge draws against, 0 or more',
    fold: 'true when a section starts shut',
    box: 'true on a section: the blocks after it, up to the next section, drawn on one surface',
    lead: "true on cards: the first card two tracks wide. True on a note: the page's one opening sentence, its {{metric}} figures said in words",
    first: 'on steps, the first 1 to 50 open rows, with the rest behind a count: the short view of a path',
    range: 'true on progress: each row a band from low to high with what was spent marked on it, columns [label, spent, low, high]',
    tiles: "true on a queue: one tile per question, with its recommended option's shows ({swatch: [#rrggbb]}, {figure: text} or {file: {row, field}}). A question's body.about names what it is about, and where: about is <name> reads it",
    when: '{metric}: drawn only when that figure calls for it',
  },
  example: {
    id: 'page.reading',
    kind: 'page',
    body: {
      page: 'reading',
      title: 'Reading',
      nav: { section: 'Studies', order: 20 },
      requires: ['register.tasks'],
      blocks: [
        { kind: 'note', span: 12, body: 'What is left to read this week.' },
        {
          kind: 'table',
          span: 12,
          heading: 'Open',
          source: 'register.tasks',
          where: 'state is open',
          columns: [{ field: 'what' }],
          limit: 20,
          empty: 'Nothing is left to read.',
        },
      ],
    },
  },
  to_change_one: 'Read arrangement with page for its declaration, change the body, and propose body_kind change with {"to": that declaration}.',
};

const PROPOSALS = {
  change: '{"to":{"id":"page.<slug>","kind":"page","body":{...}}}: a page, new or changed',
  pack: '{"install":"<id from offer or updates>"}, {"enable":"<id>"} or {"disable":"<id>"}; install may carry "doc", a pack document the catalogue lacks, and never one for a pack it offers; {"file":<a .usecase.json document>} installs a shared use case and the modules it names. A pack on at an older version is updated',
  settings: '{"pack":"<id>","values":{"<setting>":<value or null for its default>}}, or {"voice":{"<key>":"<line>"}} for the use case on',
  arrange: {
    shape: '{"why":[...],"usecase"?,"alongside"?:[<usecase>],"packs"?:{"install"?,"enable"?,"disable"?},"pages"?:[<page>],"settings"?:[<settings>],"voice"?:{...}}',
    why: 'one to 12 reasons, each a sentence or {"text","at":"tasks#4"} citing a row',
    usecase: 'a use case id from offer, installed with the modules it builds on',
    alongside: 'use case ids from offer installed beside the one speaking, which keeps its voice and Home whichever way the ids sort',
    limits: 'at most 12 of each; at most 3 arrangements wait at once',
  },
  voice_keys: VOICE_KEYS,
  answered_by: 'the owner, in Decide. Nothing changes until they accept, and a pack is planned again then.',
};

export function grammarOf(name: string): Result<unknown> {
  if (name === 'page') return ok(PAGE);
  if (name === 'proposals') return ok(PROPOSALS);
  return no('ENUM_VALUE_UNKNOWN', `There is no grammar called ${name}. Ask for page or proposals.`, { at: 'grammar', allowed: GRAMMARS });
}

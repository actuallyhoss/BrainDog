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
    nav: '{section: text of at most 40 bytes, order: 0 to 9999}; leave it off and the page has no place on the rail',
    icon: 'a glyph name, such as board',
    tone: 'good, warn, bad or info',
    requires: '["register.<id>"], 1 to 16: every register a block reads',
    blocks: '1 to 24 blocks, drawn in order',
  },
  block: {
    kind: [...Object.keys(KINDS), 'block.<id> a pack declares'],
    span: 'width in twelfths, 1 to 12',
    heading: 'the words over it; on a section, the section itself',
    empty: 'the sentence drawn when it has no rows',
    body: "a note's own prose",
    source: 'register.<id>, metric.<id>, block.<n>, forecast.runway, activity, sessions.live or actions',
    where: 'a filter, such as state is open, or a predicate tree',
    columns: '[{field, label?}], 1 to 16; on cards, as: title, figure, fact, trend, ring, who, when or mark',
    order: '[{field, dir: asc or desc}], 1 to 3',
    limit: 'rows, 0 to 500',
    cells: '[{metric, label?, note?}], 1 to 6, the figures a stat draws',
    authored: '[{cells: [text], tone?}], rows written out, never beside source',
    target: 'the number a gauge draws against, 0 or more',
    fold: 'true when a section starts shut',
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
  pack: '{"install":"<id from offer or updates>"}, {"enable":"<id>"} or {"disable":"<id>"}; install may carry "doc", a pack document the catalogue lacks. A pack on at an older version is updated',
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

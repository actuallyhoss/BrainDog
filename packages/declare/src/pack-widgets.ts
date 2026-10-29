/**
 * THE WIDGETS AN ADD-ON SHIPS (widgets plan §6.5, batch W6): `widgets: [...]` in its manifest, each a template for the
 * widget sheet, never a placement. Installing the add-on puts nothing on Today; its widgets join the sheet's gallery at
 * read time (`widgetGallery` in the record) and the install says, once and quietly, that they are there to add.
 *
 * THE SHAPE IS THE CATALOGUE'S (`packages/render/src/widgets.ts`): an id, a title, a line on what it shows, its group,
 * who it is for, the block, the sizes it comes in and the one it starts at, what it needs and an example to draw before
 * the record holds any. Two spellings are read where an author would write either: `needs` as the lists and figures it
 * reads by id (`["register.<list>"]`) or as `{ lists, figures }`, and `example` as the rows it would show or as
 * `{ figures, rows }`.
 *
 * AND WHAT THE RECORD NOTICES FOR IT (SHL-A22, 30 October): every widget an add-on brings is declared here and never
 * named in the core, so what the core used to know about each one by its id is said beside it. `asked` is the words of
 * a question it answers (signal S1), `leads` the pages whose lead it shows (S2), `fresh` what it says of a row new in
 * its list (S3), `near` and `due` what it says of a day close by or bills piling up (S4), `alike` the keys of Today's
 * own tiles that show the same thing, `rows` the fields its preview reads, and `fills` the sentence said when the
 * record does not hold what it reads yet, in place of "Comes with" (an add-on every record starts with). A blank says
 * where its choices come from (`from`), a list and the field each one is named by.
 *
 * ONLY THE SHAPE IS ASKED HERE, for `readAdds`' reason: whether the block draws on a record is the record's to say, and
 * it says it in the sheet by drawing the example and what would fill it. The checks a whole block gets (a credential,
 * a key) are the same, since a widget is drawn as it is written. Kept in the manifest and so in the checksum.
 */

import type { Result } from '@braindog/ports';
import { no, ok } from '@braindog/ports';
import type { Json } from '@braindog/kernel';
import { credentialKey, credentialValue } from './credentials.ts';

/** The five sizes a widget comes in, as the board says them. */
export const PACK_WIDGET_SIZES = ['small', 'wide', 'tall', 'large', 'full'] as const;
/** The sheet's groups. An author may write one capitalised, as the sheet shows it. */
export const PACK_WIDGET_GROUPS = ['money', 'work', 'people', 'projects', 'agents', 'numbers', 'life'] as const;
/** Who a widget is for, as the sheet says it. */
export const PACK_WIDGET_FOR = ['personal', 'business', 'both'] as const;
type For = (typeof PACK_WIDGET_FOR)[number];
/** The most widgets one add-on ships, and the most example rows one widget carries. */
export const PACK_WIDGETS_MOST = 12;
const EXAMPLE_ROWS_MOST = 8;

/** One widget an add-on ships, as its manifest is kept. */
export type PackWidget = {
  id: string;
  title: string;
  says?: string;
  group?: (typeof PACK_WIDGET_GROUPS)[number];
  for?: For;
  icon?: string;
  block: Record<string, Json>;
  blanks?: PackWidgetBlank[];
  sizes: (typeof PACK_WIDGET_SIZES)[number][];
  size: (typeof PACK_WIDGET_SIZES)[number];
  needs?: string[] | { lists?: string[]; figures?: string[] };
  example?: Record<string, Json>[] | { figures?: { label: string; said: string }[]; rows?: { title: string; meta?: string }[] };
  words?: string[];
  asked?: { match: string; about: string }[];
  leads?: string[];
  alike?: string[];
  rows?: { title: string; day?: string; amount?: string; meta?: string };
  fills?: string;
  fresh?: { says: string; unnamed: string };
  near?: { day: string; within: number; unnamed: string; name?: string };
  due?: { where: string; least: number; says: string };
};

/**
 * A blank the record fills from its own things, and where it finds them: the rows of `source` that `where` lets through,
 * in `order`, each named by `field`. `until` and `starts` are the fields a choice's last and first day are read from (a
 * trip's end, which the widget leaves on, and its start, which S4 counts down to).
 */
export type PackWidgetBlank = {
  id: string;
  asks: string;
  from?: { source: string; field: string; where?: string; order?: { field: string; dir: 'asc' | 'desc' }[]; until?: string; starts?: string };
};

const KEYS = ['id', 'title', 'says', 'group', 'for', 'icon', 'kind', 'block', 'blanks', 'sizes', 'size', 'needs', 'example', 'words', 'asked', 'leads', 'alike', 'rows', 'fills', 'fresh', 'near', 'due', 'note'];
const BLANK_ID = /^[a-z][a-z_]{0,30}$/u;
const FIELD = /^[a-z][a-z0-9_]{0,62}$/u;
const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/u;
const ID = /^[a-z][a-z0-9-]{0,62}$/u;
const KIND = /^[a-z][a-z0-9-]{0,40}$/u;
const NEED = /^(register|metric)\.[a-z0-9_-]{1,63}$/u;
const LIST_ID = /^[a-z][a-z0-9_]{0,62}$/u;
const FIGURE_ID = /^[a-z0-9][a-z0-9_-]{0,62}$/u;
/** Keys a board writes on a placed widget, never a template's. */
const PLACED = ['size', 'key', 'span', 'draft', 'area'];

const isMap = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const words = (v: unknown, most: number): v is string => typeof v === 'string' && v.trim() !== '' && [...v].length <= most;
const scalar = (v: unknown): boolean => v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';

/** A pack's `widgets`, read: each checked for its shape, its group lower-cased, and nothing else changed. */
export function readPackWidgets(raw: unknown): Result<PackWidget[]> {
  if (raw === undefined) return ok([]);
  const bad = (fix: string, at: string): Result<PackWidget[]> => no('VALUE_MALFORMED', fix, { at });
  if (!Array.isArray(raw) || raw.length > PACK_WIDGETS_MOST) return bad(`widgets is a list of at most ${PACK_WIDGETS_MOST} widgets.`, 'widgets');
  const out: PackWidget[] = [];
  for (const [i, w] of raw.entries()) {
    const at = `widgets.${i}`;
    if (!isMap(w)) return bad('A widget is { id, title, block, sizes, size } with what it says, needs and an example.', at);
    const stray = Object.keys(w).find((k) => !KEYS.includes(k));
    if (stray !== undefined) return bad(`A widget takes ${KEYS.filter((k) => k !== 'note').join(', ')}, and not ${stray}.`, `${at}.${stray}`);
    if (typeof w.id !== 'string' || !ID.test(w.id)) return bad('A widget is named in lower case with hyphens, as in rain-today.', `${at}.id`);
    if (out.some((o) => o.id === w.id)) return bad(`Two widgets are both called ${w.id}.`, `${at}.id`);
    if (!words(w.title, 60)) return bad('A widget has a title of at most 60 characters, as the sheet shows it.', `${at}.title`);
    if (w.says !== undefined && !words(w.says, 200)) return bad('says is one line on what the widget shows, at most 200 characters.', `${at}.says`);
    /* A GROUP THE SHEET KNOWS IS KEPT IN ITS OWN SPELLING; ANY OTHER IS THE AUTHOR'S WORDS, and the sheet puts it under
       Life ("Made by you", as a shared widget says it, is the author's and not the installer's). */
    if (w.group !== undefined && !words(w.group, 30)) return bad(`group is one of ${PACK_WIDGET_GROUPS.join(', ')}, or a few words of your own.`, `${at}.group`);
    const known = typeof w.group === 'string' && (PACK_WIDGET_GROUPS as readonly string[]).includes(w.group.toLowerCase());
    const group = known ? (w.group as string).toLowerCase() : undefined;
    if (w.for !== undefined && !(PACK_WIDGET_FOR as readonly unknown[]).includes(w.for)) return bad(`for is one of ${PACK_WIDGET_FOR.join(', ')}.`, `${at}.for`);
    if (w.icon !== undefined && (typeof w.icon !== 'string' || !KIND.test(w.icon))) return bad('icon is the name of a glyph, as in cloud.', `${at}.icon`);

    /* THE BLOCK, as a page would say it, with none of what a board writes on a placed widget. */
    if (!isMap(w.block) || typeof w.block.kind !== 'string' || !KIND.test(w.block.kind)) return bad('A widget has a block, as a page would say it, with its kind.', `${at}.block`);
    if (w.kind !== undefined && w.kind !== w.block.kind) return bad(`kind says ${String(w.kind)} and the block is a ${w.block.kind}. Say it once, on the block.`, `${at}.kind`);
    const placed = PLACED.find((k) => k in (w.block as Record<string, unknown>));
    if (placed !== undefined) return bad(`A widget's block has no ${placed}: the board writes that when it is placed.`, `${at}.block.${placed}`);
    const secret = credentialKey(w.block as Json) ?? credentialValue(w.block as Json);
    if (secret !== null) return no('SECRET_IN_PACK', `Widget ${w.id} carries what looks like a credential at ${secret}, and a pack is a file people share.`, { at: `${at}.block` });

    if (w.blanks !== undefined) {
      const from = (f: unknown): boolean =>
        f === undefined ||
        (isMap(f) &&
          Object.keys(f).every((k) => ['source', 'field', 'where', 'order', 'until', 'starts'].includes(k)) &&
          typeof f.source === 'string' && NEED.test(f.source) && f.source.startsWith('register.') &&
          typeof f.field === 'string' && FIELD.test(f.field) &&
          (f.where === undefined || words(f.where, 300)) &&
          (f.until === undefined || (typeof f.until === 'string' && FIELD.test(f.until))) &&
          (f.starts === undefined || (typeof f.starts === 'string' && FIELD.test(f.starts))) &&
          (f.order === undefined || (Array.isArray(f.order) && f.order.length <= 3 && f.order.every((o) => isMap(o) && typeof o.field === 'string' && FIELD.test(o.field) && (o.dir === 'asc' || o.dir === 'desc')))));
      if (!Array.isArray(w.blanks) || w.blanks.some((b) => !isMap(b) || typeof b.id !== 'string' || !BLANK_ID.test(b.id) || !words(b.asks, 120) || !from(b.from)))
        return bad('blanks are { id, asks, from? }, each a thing the record fills from its own: from names the list and the field each choice is named by.', `${at}.blanks`);
    }
    if (!Array.isArray(w.sizes) || w.sizes.length === 0 || w.sizes.some((s) => !(PACK_WIDGET_SIZES as readonly unknown[]).includes(s)) || new Set(w.sizes).size !== w.sizes.length)
      return bad(`sizes are the sizes it comes in, each once: ${PACK_WIDGET_SIZES.join(', ')}.`, `${at}.sizes`);
    if (!(w.sizes as unknown[]).includes(w.size)) return bad(`size is the one it starts at, one of its sizes: ${(w.sizes as string[]).join(', ')}.`, `${at}.size`);

    if (w.needs !== undefined) {
      const listed = Array.isArray(w.needs) && w.needs.every((n) => typeof n === 'string' && NEED.test(n));
      const mapped =
        isMap(w.needs) &&
        Object.keys(w.needs).every((k) => k === 'lists' || k === 'figures') &&
        (w.needs.lists === undefined || (Array.isArray(w.needs.lists) && w.needs.lists.every((l) => typeof l === 'string' && LIST_ID.test(l)))) &&
        (w.needs.figures === undefined || (Array.isArray(w.needs.figures) && w.needs.figures.every((f) => typeof f === 'string' && FIGURE_ID.test(f))));
      if (!listed && !mapped) return bad('needs names what it reads, as ["register.<list>", "metric.<figure>"] or { lists, figures }.', `${at}.needs`);
    }

    if (w.example !== undefined) {
      const rows = Array.isArray(w.example) && w.example.length <= EXAMPLE_ROWS_MOST && w.example.every((r) => isMap(r) && Object.values(r).every(scalar));
      const said =
        isMap(w.example) &&
        Object.keys(w.example).every((k) => k === 'figures' || k === 'rows') &&
        (w.example.figures === undefined || (Array.isArray(w.example.figures) && w.example.figures.every((f) => isMap(f) && words(f.label, 60) && words(f.said, 40)))) &&
        (w.example.rows === undefined || (Array.isArray(w.example.rows) && w.example.rows.length <= EXAMPLE_ROWS_MOST && w.example.rows.every((r) => isMap(r) && words(r.title, 120))));
      if (!rows && !said) return bad(`example is the rows it would show, at most ${EXAMPLE_ROWS_MOST}, each a row of plain values, or { figures, rows }.`, `${at}.example`);
      const leak = credentialValue(w.example as Json);
      if (leak !== null) return no('SECRET_IN_PACK', `Widget ${w.id}'s example holds what looks like a credential at ${leak}.`, { at: `${at}.example` });
    }
    if (w.words !== undefined && (!Array.isArray(w.words) || w.words.length > 12 || w.words.some((x) => !words(x, 40)))) return bad('words are what a search should find it by, at most 12.', `${at}.words`);
    if (w.asked !== undefined) {
      const compiles = (m: unknown): boolean => {
        if (typeof m !== 'string' || m === '' || m.length > 300) return false;
        try {
          new RegExp(m, 'iu');
          return true;
        } catch {
          return false;
        }
      };
      if (!Array.isArray(w.asked) || w.asked.length > 4 || w.asked.some((a) => !isMap(a) || !compiles(a.match) || !words(a.about, 60)))
        return bad('asked is the questions it answers, at most 4, each { match, about }: a pattern for the words and what they are about.', `${at}.asked`);
    }
    if (w.leads !== undefined && (!Array.isArray(w.leads) || w.leads.length > 6 || w.leads.some((x) => typeof x !== 'string' || !SLUG.test(x))))
      return bad('leads are the pages whose lead it shows, by slug, at most 6.', `${at}.leads`);
    if (w.alike !== undefined && (!Array.isArray(w.alike) || w.alike.length > 6 || w.alike.some((x) => typeof x !== 'string' || !SLUG.test(x))))
      return bad("alike are the keys of Today's own tiles that show the same thing, at most 6.", `${at}.alike`);
    if (w.rows !== undefined && (!isMap(w.rows) || typeof w.rows.title !== 'string' || Object.entries(w.rows).some(([k, v]) => !['title', 'day', 'amount', 'meta'].includes(k) || typeof v !== 'string' || !FIELD.test(v))))
      return bad('rows are the fields its preview reads: { title, day?, amount?, meta? }.', `${at}.rows`);
    if (w.fills !== undefined && !words(w.fills, 120)) return bad('fills is the sentence said while the record does not hold what it reads, at most 120 characters.', `${at}.fills`);
    if (w.fresh !== undefined && (!isMap(w.fresh) || !words(w.fresh.says, 120) || !words(w.fresh.unnamed, 120) || Object.keys(w.fresh).some((k) => k !== 'says' && k !== 'unnamed')))
      return bad('fresh is { says, unnamed }: what it says of a row new in its list, with {{name}}, and what it says when the row has no name.', `${at}.fresh`);
    if (
      w.near !== undefined &&
      (!isMap(w.near) || typeof w.near.day !== 'string' || !FIELD.test(w.near.day) || typeof w.near.within !== 'number' || !Number.isInteger(w.near.within) || w.near.within < 1 || w.near.within > 60 || !words(w.near.unnamed, 60) ||
        (w.near.name !== undefined && (typeof w.near.name !== 'string' || !FIELD.test(w.near.name))))
    )
      return bad('near is { day, within, unnamed, name? }: the field a row starts on, how many days ahead counts as near, and what a row with no name is called.', `${at}.near`);
    if (w.due !== undefined && (!isMap(w.due) || !words(w.due.where, 300) || typeof w.due.least !== 'number' || !Number.isInteger(w.due.least) || w.due.least < 1 || !words(w.due.says, 120)))
      return bad('due is { where, least, says }: the rows that fall due, how many make a reason, and what it says, with {{count}}.', `${at}.due`);

    out.push({
      id: w.id,
      title: (w.title as string).trim(),
      ...(typeof w.says === 'string' ? { says: w.says.trim() } : {}),
      ...(group !== undefined ? { group: group as PackWidget['group'] & string } : {}),
      ...(w.for !== undefined ? { for: w.for as For } : {}),
      ...(typeof w.icon === 'string' ? { icon: w.icon } : {}),
      block: w.block as Record<string, Json>,
      ...(Array.isArray(w.blanks) && w.blanks.length > 0 ? { blanks: w.blanks as PackWidget['blanks'] & object } : {}),
      sizes: w.sizes as PackWidget['sizes'],
      size: w.size as PackWidget['size'],
      ...(w.needs !== undefined ? { needs: w.needs as PackWidget['needs'] & object } : {}),
      ...(w.example !== undefined ? { example: w.example as PackWidget['example'] & object } : {}),
      ...(Array.isArray(w.words) ? { words: w.words as string[] } : {}),
      ...(Array.isArray(w.asked) ? { asked: w.asked as PackWidget['asked'] & object } : {}),
      ...(Array.isArray(w.leads) ? { leads: w.leads as string[] } : {}),
      ...(Array.isArray(w.alike) ? { alike: w.alike as string[] } : {}),
      ...(isMap(w.rows) ? { rows: w.rows as PackWidget['rows'] & object } : {}),
      ...(typeof w.fills === 'string' ? { fills: w.fills } : {}),
      ...(isMap(w.fresh) ? { fresh: w.fresh as PackWidget['fresh'] & object } : {}),
      ...(isMap(w.near) ? { near: w.near as PackWidget['near'] & object } : {}),
      ...(isMap(w.due) ? { due: w.due as PackWidget['due'] & object } : {}),
    });
  }
  return ok(out);
}

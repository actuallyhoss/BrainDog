/**
 * THE WIDGETS AN ADD-ON SHIPS (widgets plan §6.5, batch W6): `widgets: [...]` in its manifest, each a template for the
 * widget sheet, never a placement. Installing the add-on puts nothing on Today; its widgets join the sheet's gallery at
 * read time (`widgetGallery` in the record) and the install says, once and quietly, that they are there to add.
 *
 * THE SHAPE IS THE CATALOGUE'S (`packages/render/src/widgets.ts`): an id, a title, a line on what it shows, its group,
 * who it is for, the block, the sizes it comes in and the one it starts at, what it needs and an example to draw before
 * the record holds any. Two spellings are read where an author would write either: `needs` as the lists and figures it
 * reads by id (`["register.weather"]`) or as `{ lists, figures }`, and `example` as the rows it would show or as
 * `{ figures, rows }`.
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
/** The most widgets one add-on ships, and the most example rows one widget carries. */
export const PACK_WIDGETS_MOST = 12;
const EXAMPLE_ROWS_MOST = 8;

/** One widget an add-on ships, as its manifest is kept. */
export type PackWidget = {
  id: string;
  title: string;
  says?: string;
  group?: (typeof PACK_WIDGET_GROUPS)[number];
  for?: 'personal' | 'business' | 'both';
  icon?: string;
  block: Record<string, Json>;
  blanks?: { id: 'project' | 'currency'; asks: string }[];
  sizes: (typeof PACK_WIDGET_SIZES)[number][];
  size: (typeof PACK_WIDGET_SIZES)[number];
  needs?: string[] | { lists?: string[]; figures?: string[] };
  example?: Record<string, Json>[] | { figures?: { label: string; said: string }[]; rows?: { title: string; meta?: string }[] };
  words?: string[];
};

const KEYS = ['id', 'title', 'says', 'group', 'for', 'icon', 'kind', 'block', 'blanks', 'sizes', 'size', 'needs', 'example', 'words', 'note'];
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
    if (typeof w.id !== 'string' || !ID.test(w.id)) return bad('A widget is named in lower case with hyphens, as in weather-today.', `${at}.id`);
    if (out.some((o) => o.id === w.id)) return bad(`Two widgets are both called ${w.id}.`, `${at}.id`);
    if (!words(w.title, 60)) return bad('A widget has a title of at most 60 characters, as the sheet shows it.', `${at}.title`);
    if (w.says !== undefined && !words(w.says, 200)) return bad('says is one line on what the widget shows, at most 200 characters.', `${at}.says`);
    /* A GROUP THE SHEET KNOWS IS KEPT IN ITS OWN SPELLING; ANY OTHER IS THE AUTHOR'S WORDS, and the sheet puts it under
       Life ("Made by you", as a shared widget says it, is the author's and not the installer's). */
    if (w.group !== undefined && !words(w.group, 30)) return bad(`group is one of ${PACK_WIDGET_GROUPS.join(', ')}, or a few words of your own.`, `${at}.group`);
    const known = typeof w.group === 'string' && (PACK_WIDGET_GROUPS as readonly string[]).includes(w.group.toLowerCase());
    const group = known ? (w.group as string).toLowerCase() : undefined;
    if (w.for !== undefined && w.for !== 'personal' && w.for !== 'business' && w.for !== 'both') return bad('for is personal, business or both.', `${at}.for`);
    if (w.icon !== undefined && (typeof w.icon !== 'string' || !KIND.test(w.icon))) return bad('icon is the name of a glyph, as in cloud.', `${at}.icon`);

    /* THE BLOCK, as a page would say it, with none of what a board writes on a placed widget. */
    if (!isMap(w.block) || typeof w.block.kind !== 'string' || !KIND.test(w.block.kind)) return bad('A widget has a block, as a page would say it, with its kind.', `${at}.block`);
    if (w.kind !== undefined && w.kind !== w.block.kind) return bad(`kind says ${String(w.kind)} and the block is a ${w.block.kind}. Say it once, on the block.`, `${at}.kind`);
    const placed = PLACED.find((k) => k in (w.block as Record<string, unknown>));
    if (placed !== undefined) return bad(`A widget's block has no ${placed}: the board writes that when it is placed.`, `${at}.block.${placed}`);
    const secret = credentialKey(w.block as Json) ?? credentialValue(w.block as Json);
    if (secret !== null) return no('SECRET_IN_PACK', `Widget ${w.id} carries what looks like a credential at ${secret}, and a pack is a file people share.`, { at: `${at}.block` });

    if (w.blanks !== undefined) {
      if (!Array.isArray(w.blanks) || w.blanks.some((b) => !isMap(b) || (b.id !== 'project' && b.id !== 'currency') || !words(b.asks, 120)))
        return bad('blanks are { id: project | currency, asks }, each a thing the record fills from its own.', `${at}.blanks`);
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
      if (!listed && !mapped) return bad('needs names what it reads, as ["register.weather", "metric.cash-now"] or { lists, figures }.', `${at}.needs`);
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

    out.push({
      id: w.id,
      title: (w.title as string).trim(),
      ...(typeof w.says === 'string' ? { says: w.says.trim() } : {}),
      ...(group !== undefined ? { group: group as PackWidget['group'] & string } : {}),
      ...(w.for !== undefined ? { for: w.for as 'personal' | 'business' | 'both' } : {}),
      ...(typeof w.icon === 'string' ? { icon: w.icon } : {}),
      block: w.block as Record<string, Json>,
      ...(Array.isArray(w.blanks) && w.blanks.length > 0 ? { blanks: w.blanks as PackWidget['blanks'] & object } : {}),
      sizes: w.sizes as PackWidget['sizes'],
      size: w.size as PackWidget['size'],
      ...(w.needs !== undefined ? { needs: w.needs as PackWidget['needs'] & object } : {}),
      ...(w.example !== undefined ? { example: w.example as PackWidget['example'] & object } : {}),
      ...(Array.isArray(w.words) ? { words: w.words as string[] } : {}),
    });
  }
  return ok(out);
}

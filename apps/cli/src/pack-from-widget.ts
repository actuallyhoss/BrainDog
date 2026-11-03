/**
 * SHARE A WIDGET AS AN ADD-ON (widgets plan §5.10, Call 16): a small add-on whose manifest carries one widget as a
 * template, made by the same code as `braindog addon new --from-page` (`pack-from-page.ts`), extended for one widget.
 *
 * THE WIDGET IS READ AS A PAGE OF ONE BLOCK, so everything an add-on from a page is held to holds here: what it reads
 * comes along or is made, his own names become settings asked at install ("Which payee?" instead of "Talabat"), a key, a
 * token and an address are dropped, and never a row of his data. Then the page is taken out again and its one block goes
 * under `widgets:` as a template with the sizes it was kept at, which is how an add-on ships widgets (Weather, Calendar).
 *
 * WHAT ANOTHER ADD-ON BRINGS IS NOT CARRIED: a widget over Money's lists names Money in `requires` and leaves the lists
 * to it. The caller says which add-ons the record has and what each brings (`provided`), as the record knows by
 * `pack_id`. PURE: no I/O and no clock.
 */

import { dogText } from '@braindog/dog';
import { no, ok, type Result } from '@braindog/ports';

import { FIRST_PARTY, firstPartyManifest } from '@braindog/seed/packs';

import { packFromPage, type FromPage, type FromPageOptions } from './pack-from-page.ts';

type Body = Record<string, unknown>;

const SIZES = ['small', 'wide', 'tall', 'large', 'full'] as const;

export type FromWidgetOptions = FromPageOptions & {
  /** The sizes it draws at, the first its starting size. Absent, it draws wide. */
  sizes?: readonly string[] | undefined;
  /** The add-ons it needs, by id and version, and the declarations each brings, by address (`register.transactions`). */
  requires?: Readonly<Record<string, string>> | undefined;
  provided?: Readonly<Record<string, readonly string[]>> | undefined;
};

const isMap = (v: unknown): v is Body => v !== null && typeof v === 'object' && !Array.isArray(v);

/** A declaration's address as a pack file writes it: `register.bills` for `{ register: 'bills' }`. */
function addressOf(d: Body): string | null {
  for (const kind of ['register', 'metric', 'script', 'rule', 'ingest'])
    if (typeof d[kind] === 'string') return `${kind}.${d[kind] as string}`;
  return null;
}

/** The lists and figures a block reads, by address, as the sheet's `needs` says them. */
function needsOf(block: Body): string[] {
  const out = new Set<string>();
  const walk = (v: unknown): void => {
    if (typeof v === 'string' && /^(register|metric)\.[a-z][a-z0-9_-]*$/u.test(v)) out.add(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (isMap(v)) {
      for (const [k, x] of Object.entries(v)) {
        if (k === 'metric' && typeof x === 'string') out.add(`metric.${x.replace(/:.*$/u, '')}`);
        else walk(x);
      }
    }
  };
  walk(block);
  return [...out];
}

/**
 * The add-on document for `id` made from one widget's block, and a sentence for each thing in it the person did not
 * write: what came along, what became a setting, what another add-on brings. Refused in `packFromPage`'s words when the
 * widget reads nothing or names what cannot be carried.
 */
export async function packFromWidget(id: string, block: Body, options: FromWidgetOptions = {}): Promise<Result<FromPage>> {
  if (!isMap(block) || typeof block.kind !== 'string') return no('VALUE_MALFORMED', 'A widget is one block, with its kind.', { at: 'block' });
  const sizes = (options.sizes ?? ['wide']).filter((s): s is (typeof SIZES)[number] => (SIZES as readonly string[]).includes(s));
  if (sizes.length === 0) return no('VALUE_MALFORMED', `A widget draws at one or more of ${SIZES.join(', ')}.`, { at: 'sizes' });
  /* WHAT A BOARD WRITES FOR ITSELF IS NOT THE WIDGET'S: its place, its size, its last day and a draft's note. */
  const { key: _key, size: _size, until: _until, draft: _draft, span: _span, ...own } = block;
  const title = options.title?.trim() || (typeof own.heading === 'string' && own.heading.trim() !== '' ? own.heading.trim() : 'A widget');

  const page = await packFromPage(id, dogText({ page: id, title, blocks: [own] } as never), { ...options, title });
  if (!page.ok) return page;
  const { file, lines } = page.value;
  const declarations = Array.isArray(file.declarations) ? (file.declarations as Body[]) : [];
  const pageAt = declarations.findIndex((d) => typeof d.page === 'string');
  const shared = pageAt >= 0 && Array.isArray(declarations[pageAt]!.blocks) ? ((declarations[pageAt]!.blocks as Body[])[0] ?? own) : own;

  /* WHAT A REQUIRED ADD-ON BRINGS STAYS WITH IT. */
  const brought = new Set(Object.values(options.provided ?? {}).flat());
  const carried = declarations.filter((d, i) => i !== pageAt && !brought.has(addressOf(d) ?? ''));
  const left = declarations.filter((d, i) => i !== pageAt && brought.has(addressOf(d) ?? ''));
  const requires = options.requires ?? {};
  /* AND WHAT WAS SAID OF IT IS TAKEN BACK: a list Money brings was neither made nor taken here. */
  const leftNames = left.map((d) => (typeof d.name === 'string' ? d.name : '')).filter((n) => n !== '');
  const about = (line: string, n: string): boolean => (line.startsWith('Made ') || line.startsWith('Took ')) && (line.includes(` ${n} `) || line.includes(` ${n},`));
  for (let i = lines.length - 1; i >= 0; i--) if (leftNames.some((n) => about(lines[i]!, n))) lines.splice(i, 1);
  if (left.length > 0)
    lines.push(`Left ${leftNames.length > 0 ? leftNames.join(', ') : left.length === 1 ? 'one thing' : `${left.length} things`} to ${Object.keys(requires).join(', ') || 'the plugins it needs'}, which already ${left.length === 1 ? 'brings it' : 'bring them'}.`);
  const said = sizes.length === 1 ? sizes[0]! : `${sizes.slice(0, -1).join(', ')} and ${sizes.at(-1)!}`;
  lines.push(`The widget draws ${said}, and whoever installs it adds it to a board from the sheet.`);

  const widget: Body = {
    id,
    title,
    group: 'Made by you',
    for: 'both',
    kind: shared.kind,
    block: shared,
    blanks: [],
    sizes,
    size: sizes[0],
    needs: needsOf(shared),
    example: [],
  };
  const reqs = isMap(file.requires) ? file.requires : {};
  const out: Body = {
    ...file,
    requires: { ...reqs, packs: { ...(isMap(reqs.packs) ? reqs.packs : {}), ...requires } },
    widgets: [widget],
    declarations: carried,
  };
  return ok({ file: out, lines });
}

/**
 * WHAT BRAINDOG'S OWN MODULES BRING, for a widget shared without a record to ask (`addon new --from-widget <file>`): each
 * module's declarations by address, and the modules the block reads from as its `requires`, at their own major. A record
 * that is asked (`braindog widget share`) passes what it holds instead.
 */
export function firstPartyFor(block: Body): { requires: Record<string, string>; provided: Record<string, string[]> } {
  const reads = new Set(needsOf(block));
  const provided: Record<string, string[]> = {};
  const requires: Record<string, string> = {};
  for (const id of FIRST_PARTY) {
    const m = firstPartyManifest(id);
    provided[id] = [...m.provides];
    if (m.provides.some((a) => reads.has(a))) requires[id] = `^${m.version.split('.')[0]}.0.0`;
  }
  return { requires, provided };
}

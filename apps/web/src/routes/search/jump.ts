/**
 * What `/search` offers before anything is typed: the places a person most often jumps to, in tiles under the field.
 *
 * FOUR KINDS, EACH FROM WHAT THE RECORD SAYS. A section's own things (each project's page, in its own colour), the
 * people the record has met, the lists it keeps with their icons, and the rows changed last. Nothing is named by its id
 * here: a thing is its title, a person their name, a list its name.
 *
 * THE PEOPLE ARE WHOEVER A LIST DECLARES `meets:` FOR, never a list called "people": the lists' own
 * declarations are asked, and the first that plays the people role is read. The same answers carry each list's
 * declared icon, so the lists tile wears the glyph the pack gave it.
 *
 * NOTHING HERE IS DRAWN EMPTY. A kind with nothing in it is left out, and the page draws the tiles that have something.
 *
 * `thingsOf` AND `listsOf` ARE PURE, so `node --test` holds them; the reads load the client lazily, as the route does.
 */

import type { IconName } from '../../lib/ui/icons.ts';

/** One place to jump to: what it is called, where it goes, and its colour or its glyph. */
export type Place = { title: string; href: string; hue?: number | undefined; icon?: IconName | undefined };

/** How many places a tile shows. */
export const PER_TILE = 6;

/** A rail entry as the shell hands it: a page, the section it sits in, and whether it is about one thing. */
type NavLike = { title: string; href: string; section: string; row?: boolean | undefined; hue?: number | undefined };

/**
 * Each section that holds pages about one thing (a project per page), by the section's name, in the rail's order, with
 * at most `most` things each. A section of views or of plain pages is not a section of things.
 */
export function thingsOf(nav: readonly NavLike[], most: number = PER_TILE): { section: string; items: Place[] }[] {
  const by = new Map<string, Place[]>();
  for (const n of nav) {
    if (n.row !== true) continue;
    const list = by.get(n.section) ?? [];
    by.set(n.section, list);
    if (list.length < most) list.push({ title: n.title, href: n.href, ...(n.hue === undefined ? {} : { hue: n.hue }) });
  }
  return [...by].map(([section, items]) => ({ section, items }));
}

/**
 * The lists that hold something, most rows first, with the glyph each declares where it was read (`icons`) and the
 * shell's own otherwise. `most` at most.
 */
export function listsOf(
  registers: readonly { id: string; name: string; count: number; icon: IconName }[],
  icons: ReadonlyMap<string, IconName>,
  most: number = PER_TILE,
): (Place & { count: number })[] {
  return registers
    .filter((r) => r.count > 0)
    .map((r, i) => ({ r, i }))
    .sort((a, b) => b.r.count - a.r.count || a.i - b.i)
    .slice(0, most)
    .map(({ r }) => ({ title: r.name, href: `/r/${encodeURIComponent(r.id)}`, icon: icons.get(r.id) ?? r.icon, count: r.count }));
}

type Said = { ok: boolean; value?: unknown };
type Client = {
  schema(register: string): Promise<Said>;
  list(args: { register: string; limit?: number; order?: { field: string; dir?: 'asc' | 'desc' }[] }): Promise<Said>;
};

/** A declared people role, as the schema answer carries it: the field each part is in. */
type Meets = { name?: string; self?: string; in_touch?: string };

/** What the lists' declarations say: each list's glyph, and the first list that plays the people role. */
export async function readDeclared(
  client: Client,
  registers: readonly { id: string }[],
  isGlyph: (name: string) => name is IconName,
): Promise<{ icons: Map<string, IconName>; people: { register: string; meets: Meets; title: string | null } | null }> {
  const answers = await Promise.all(registers.map((r) => client.schema(r.id).then((out): { id: string; out: Said } => ({ id: r.id, out }), (): { id: string; out: Said } => ({ id: r.id, out: { ok: false } }))));
  const icons = new Map<string, IconName>();
  let people: { register: string; meets: Meets; title: string | null } | null = null;
  for (const { id, out } of answers) {
    if (!out.ok || typeof out.value !== 'object' || out.value === null) continue;
    const decl = out.value as { icon?: unknown; meets?: unknown; title?: unknown };
    if (typeof decl.icon === 'string' && isGlyph(decl.icon)) icons.set(id, decl.icon);
    if (people === null && typeof decl.meets === 'object' && decl.meets !== null)
      people = { register: id, meets: decl.meets as Meets, title: typeof decl.title === 'string' ? decl.title : null };
  }
  return { icons, people };
}

/**
 * The people the record has been in touch with lately, newest first, without the person whose record it is. Asked in
 * order of the last day in touch where the role names one; a record that will not order by it is asked plainly.
 */
export async function readPeople(client: Client, role: { register: string; meets: Meets; title: string | null }, most: number = PER_TILE): Promise<Place[]> {
  const nameField = role.meets.name ?? role.title ?? 'name';
  const ask = (order?: string) =>
    client.list({ register: role.register, limit: most + 1, ...(order ? { order: [{ field: order, dir: 'desc' as const }] } : {}) });
  let out: Said = await ask(role.meets.in_touch).catch((): Said => ({ ok: false }));
  if (!out.ok && role.meets.in_touch) out = await ask().catch((): Said => ({ ok: false }));
  if (!out.ok) return [];
  const rows = ((out.value as { rows?: unknown[] } | undefined)?.rows ?? []) as { seq?: unknown; fields?: Record<string, unknown> }[];
  return rows
    .filter((r) => typeof r.seq === 'number' && !(role.meets.self && r.fields?.[role.meets.self] === true))
    .flatMap((r) => {
      const name = r.fields?.[nameField];
      return typeof name === 'string' && name.trim() !== '' ? [{ title: name.trim(), href: `/r/${encodeURIComponent(role.register)}/${r.seq as number}` }] : [];
    })
    .slice(0, most);
}

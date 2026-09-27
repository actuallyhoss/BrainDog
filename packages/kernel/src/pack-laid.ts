/**
 * What a pack laid on lists other packs own, read off the manifest its `pack` row stores: for each list id, the ids of
 * the fields its `extends` lays there.
 *
 * WHY THE RECORD HAS TO SAY IT. A list a pack extends is staged with no pack, so from then on it reads as the record's
 * own, and nothing in the list says which of its fields came from which pack. A plan asked about the pack's next
 * version therefore saw every field under an id it lays again as somebody else's, and refused a relabelled field of its
 * own as `PROVIDES_CONFLICT`, the refusal for two fields sharing an id. The manifest is where the pack said what it
 * laid, and `plan` in `@braindog/declare` reads this beside `requires` to let a pack change its own field and nobody
 * else's (`Installed.packs[].laid`).
 *
 * FIELDS AND NOT VALUES. A value laid on a closed list is only ever added, never changed in shape, so there is nothing
 * about it a later version could be refused for changing.
 *
 * NOTHING IS TRUSTED TO BE NORMALISED, for `requiresOf`'s reason in `index.ts`: a manifest written by hand, or by a build
 * older than the one reading it, may hold anything. What does not read as a list of fields with text ids is left out,
 * and a manifest that does not parse laid nothing a plan can see.
 *
 * ITS CEILING IS THE MANIFEST'S. One pass over the lists `extends` names and the fields each lays, in a manifest this
 * record already stored when it installed the pack, and `packs()` reads one manifest per `pack` row.
 */

/** Each list id a stored manifest's `extends` names, with the ids of the fields it lays there; `{}` when it lays none. */
export function laidOf(manifest: string): Record<string, string[]> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(manifest);
  } catch {
    return {};
  }
  const lays = (parsed as { extends?: unknown } | null)?.extends;
  if (lays === null || typeof lays !== 'object' || Array.isArray(lays)) return {};
  const out: Record<string, string[]> = {};
  for (const [list, body] of Object.entries(lays)) {
    const fields = (body as { fields?: unknown } | null)?.fields;
    if (!Array.isArray(fields)) continue;
    const ids = fields.flatMap((f: unknown) => {
      const id = (f as { id?: unknown } | null)?.id;
      return typeof id === 'string' ? [id] : [];
    });
    if (ids.length > 0) out[list] = ids;
  }
  return out;
}

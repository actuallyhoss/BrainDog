/**
 * Whether a field's new type stores every value its old type stored, unchanged: a widening, which is not a retype.
 *
 * MEASURED IN `loop/research-shell-seed-next.md` N2. `holdings.kind` going from a four-value `enum` to `text` was refused
 * `FIELD_TYPE_CHANGED` by the kernel and by `declare`, with the fix "Retire the field and add a new one". Every stored
 * value was already valid text, so the refusal protected nothing, and its fix would have split one column into two.
 *
 * TWO PAIRS AND NO MORE, each one checked against `coerce.ts` rather than assumed. An `enum` stores a bare string and its
 * membership is the write path's, so a `text` field reads every stored value as it is; a `list` of either stores an
 * array of those strings, so the same holds element by element. Pairs that look like widenings and are not:
 *
 *   int to decimal     `decimal` refuses more than fifteen significant digits, and an `int` holds up to 2^53 - 1
 *   text to document   `document` rewrites CRLF to LF on the way in, so a stored text is not a value it would store
 *   enum to ref        a stored word is not a row id; something has to write the ids, which is a row migration
 *
 * ONE MODULE AND NOT A LINE IN `index.ts`, so `declare`'s plan (Brief 2B) imports the same answer rather than keeping a
 * second copy that drifts, which is how `FIRST_PARTY_LISTS` and `MODULE_LISTS` came to disagree (N4).
 */

/** The parts of a field that say its type: `type`, and `of` for a list. */
export type TypeShape = { type?: unknown; of?: unknown };

/** From a stored type to the types that read all of its values back unchanged. */
const WIDER: Readonly<Record<string, readonly string[]>> = {
  enum: ['text'],
};

export function widens(from: TypeShape, to: TypeShape): boolean {
  if (typeof from.type !== 'string' || typeof to.type !== 'string') return false;
  if (from.type === 'list' || to.type === 'list') {
    if (from.type !== 'list' || to.type !== 'list') return false;
    return typeof from.of === 'string' && typeof to.of === 'string' && (WIDER[from.of]?.includes(to.of) ?? false);
  }
  return WIDER[from.type]?.includes(to.type) ?? false;
}

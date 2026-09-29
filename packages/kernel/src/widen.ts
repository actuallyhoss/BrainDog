/**
 * Whether a field's new type stores every value its old type stored, unchanged: a widening, which is not a retype.
 *
 * MEASURED. `holdings.kind` going from a four-value `enum` to `text` was refused `FIELD_TYPE_CHANGED` by the kernel and
 * by `declare`, with the fix "Retire the field and add a new one". Every stored value was already valid text, so the
 * refusal protected nothing, and its fix would have split one column into two.
 *
 * TWO PAIRS AND NO MORE, each one checked against `coerce.ts` rather than assumed. An `enum` stores a bare string and its
 * membership is the write path's, so a `text` field reads every stored value as it is; a `list` of either stores an
 * array of those strings, so the same holds element by element. Pairs that look like widenings and are not:
 *
 *   int to decimal     `decimal` refuses more than fifteen significant digits, and an `int` holds up to 2^53 - 1
 *   text to document   `document` rewrites CRLF to LF on the way in, so a stored text is not a value it would store
 *   enum to ref        a stored word is not a row id; something has to write the ids, which is a row migration
 *
 * ONE MODULE AND NOT A LINE IN `index.ts`, so `declare`'s plan imports the same answer rather than keeping a second
 * copy that drifts, which is how `FIRST_PARTY_LISTS` and `MODULE_LISTS` came to disagree.
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

/**
 * The sentences a declaration reads a list's rows through, with where each sits: a metric's `where`, a rule's `when` and
 * every `if` among an automation's steps, and a page block's `where`. Only the ones read against `register`.
 *
 * A WIDENING KEEPS EVERY STORED VALUE AND CAN STILL CHANGE WHAT A SENTENCE MEANS, which is why a reader's sentences are
 * asked separately from whether it compiles. Measured: `lane` opened from an enum to text under four installed figures:
 * every one still compiled, and three of them changed their answer, because `where` reads an enum's word by label, by
 * spaces for underscores and without case, and a text's word as it is written.
 *
 * A `where` HOLDING `{{...}}` IS LEFT OUT, for `unreadable`'s reason: it is a template's, and becomes a sentence only when a
 * row fills it. The tree form is left out too: it is compiled against stored values, so an enum refuses a label written
 * in it at install and there is nothing for a widening to change.
 *
 * `subject` IS THE LIST A RULE'S ROW COMES FROM, which the caller works out: `subjectOf` for a write, and the list the
 * door writes for an arrival (`rowRegisterOf` in `flow-lint.ts`). This file holds no declarations to look a door up in.
 */
export function sentencesOver(kind: string, body: Record<string, unknown>, register: string, subject: string | null): { at: string; where: string }[] {
  const out: { at: string; where: string }[] = [];
  const said = (at: string, where: unknown) => {
    if (typeof where === 'string' && where.trim() !== '' && !where.includes('{{')) out.push({ at, where });
  };
  if (kind === 'metric' && body.source === `register.${register}`) said('where', body.where);
  if (kind === 'rule' && subject === register) {
    said('when', body.when);
    const walk = (x: unknown, at: string): void => {
      if (Array.isArray(x)) x.forEach((step, i) => walk(step, `${at}[${i}]`));
      else if (x !== null && typeof x === 'object')
        for (const [key, v] of Object.entries(x)) {
          if (key === 'if') said(`${at}.if`, v);
          else walk(v, `${at}.${key}`);
        }
    };
    /* `then` TOO, WHEN THERE ARE NO `steps`: on the run path `then` is a flat list of steps (`flow-lint.ts`), and a
       rule written that way kept its `if` out of sight. Measured: one rule answered "then" under the enum and "else"
       under text, installed, while the same body with `steps:` was refused. */
    if (body.steps !== undefined) walk(body.steps, 'steps');
    else walk(body.then, 'then');
  }
  if (kind === 'page' && Array.isArray(body.blocks))
    body.blocks.forEach((raw, i) => {
      const block = raw as { kind?: unknown; source?: unknown; register?: unknown; where?: unknown } | null;
      if (!block || block.kind === 'diff') return;
      const list =
        typeof block.source === 'string' && block.source.startsWith('register.')
          ? block.source.slice('register.'.length)
          : block.kind === 'capture' && typeof block.register === 'string'
            ? block.register
            : undefined;
      if (list === register) said(`blocks[${i}].where`, block.where);
    });
  return out;
}

/** One test in a compiled predicate: the field it asks about, and its operator with the value it compares. */
type Leaf = Record<string, unknown> & { field?: unknown };

function leavesOn(node: unknown, fields: ReadonlySet<string>, out: Leaf[] = []): Leaf[] {
  if (Array.isArray(node)) for (const n of node) leavesOn(n, fields, out);
  else if (node !== null && typeof node === 'object') {
    const leaf = node as Leaf;
    if (typeof leaf.field === 'string') {
      if (fields.has(leaf.field)) out.push(leaf);
    } else for (const key of ['all', 'any', 'none']) leavesOn(leaf[key], fields, out);
  }
  return out;
}

/** The value a leaf compares, with its field and `via` left out, said the way the sentence would say it. */
const operand = (leaf: Leaf): string => {
  const said = Object.entries(leaf).filter(([key]) => key !== 'field' && key !== 'via').map(([, v]) => v);
  const flat = said.flat();
  return flat.every((v) => typeof v === 'string') ? flat.join(' or ') : JSON.stringify(said.length === 1 ? said[0] : said);
};

/**
 * The first word a sentence wrote about an opened field that the closed list turned into a different stored value: what
 * it was written as, and what it meant. `null` when every such word already was the stored value.
 *
 * THE SAME SENTENCE PARSED TWICE, against the list as it stands and against it with only the opened fields changed, and
 * the leaves on those fields compared in order. Nothing else differs between the two schemas, so nothing else can move.
 * A leaf that exists only one way (a different shape of tree) is a change too, and is said as the whole sentence.
 */
export function misread(closed: unknown, open: unknown, fields: ReadonlySet<string>): { field: string; written: string; stored: string } | null {
  const was = leavesOn(closed, fields);
  const now = leavesOn(open, fields);
  for (let i = 0; i < Math.max(was.length, now.length); i++) {
    const a = was[i];
    const b = now[i];
    if (a !== undefined && b !== undefined && JSON.stringify(a) === JSON.stringify(b)) continue;
    return { field: String((a ?? b)!.field), written: b === undefined ? '' : operand(b), stored: a === undefined ? '' : operand(a) };
  }
  return null;
}

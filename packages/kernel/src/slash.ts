/**
 * What a model may write into the log, and what it may never.
 *
 * `30 §3` STATES THE INVARIANT AS A QUERY: `event WHERE actor = 'slash' AND kind NOT IN
 * ('suggest','propose','predict')` is empty. `52 §5.2` makes it a gate over the `corpus` record.
 * Neither existed, and nothing in the write path stopped a `slash` event of any other kind — so the
 * one sentence this product makes about what a model can do to a record ("it proposes, and a person
 * decides") was true by convention and by nothing else.
 *
 * IT IS ENFORCED HERE RATHER THAN CHECKED LATER. A gate over a corpus tells you afterwards that a
 * build violated it; this refuses the write. The gate is still worth having when
 * `@braindog/fixtures` exists — it catches a path that bypasses this one — but a rule that only a
 * gate knows is a rule the code does not have.
 *
 * IT THROWS, AND THAT IS DELIBERATE IN A FILE WHOSE WHOLE HOUSE STYLE IS THAT A REFUSAL IS A VALUE.
 * A refusal is what the record says to a caller who asked for something they may not have. This is
 * not that: no caller can ask for it, because `slash` is not a principal any request arrives as —
 * it is an actor the record writes on its own behalf when a model's answer comes back. Reaching
 * here means a deliverer or an ack has passed the wrong actor, which is a defect in this
 * repository and not an event in somebody's business. A `Result` would be a refusal nobody is
 * listening for.
 *
 * AND ONE DECLARATION, SAID BY NAME. A model arranges a page: the look it writes is a declaration, and the
 * `declare` line of that install is signed `slash`. So the query above gains one exception and no more, a `declare`
 * whose target is a look that says it is Slash's, and `SLASH_MAY` below is where it is written.
 */

/** `30 §3`: the three kinds a model's own writing can take. */
export const SLASH_KINDS: ReadonlySet<string> = new Set(['suggest', 'propose', 'predict']);

/** The actor a model's answer is filed under. One string, in one place. */
export const SLASH = 'slash';

/**
 * What a `declare` line names: the declaration installed or retired, as the install was handed it or as the
 * `declaration` table keeps it. `body` may be the object or the JSON text of the cell, and `pack` is the add-on that
 * carries it, absent or null for one nobody's add-on owns.
 */
export type SlashWrites = { kind?: unknown; body?: unknown; pack?: unknown };

/** The body as an object, whichever of the two ways it was held, and `null` for anything that is not one. */
function bodyOf(body: unknown): Record<string, unknown> | null {
  let held = body;
  if (typeof held === 'string')
    try {
      held = JSON.parse(held) as unknown;
    } catch {
      return null;
    }
  return held !== null && typeof held === 'object' && !Array.isArray(held) ? (held as Record<string, unknown>) : null;
}

/**
 * A LOOK THAT SAYS IT IS SLASH'S, and nothing else Slash can declare. A look is an arrangement of a page that already
 * exists: it adds no page, no list, no rule, no script, and it is versioned so Undo puts back the one before. The body
 * says whose it is (`by: 'slash'`), so a model cannot sign the owner's arrangement or one an add-on came with.
 */
const slashLook = (what: SlashWrites | undefined): boolean =>
  what !== undefined && what.kind === 'look' && (what.pack === undefined || what.pack === null) && bodyOf(what.body)?.by === SLASH;

/**
 * WHAT SLASH MAY SIGN, AND WHEN. The three of `30 §3` always. `declare` only for a look that says it is Slash's. A
 * kind that is not here is refused whatever is written, so a new kind is a line in this table and not a branch in a
 * writer.
 */
const SLASH_MAY: ReadonlyMap<string, (what: SlashWrites | undefined) => boolean> = new Map([
  ...[...SLASH_KINDS].map((kind) => [kind, () => true] as const),
  ['declare', slashLook] as const,
]);

/** What was declared, said by its kind for the refusal: "a page", "a rule", and "a look" for one that is not Slash's. */
function declaredAs(what: SlashWrites | undefined): string {
  if (what === undefined || typeof what.kind !== 'string') return 'a declaration it did not name';
  if (what.pack !== undefined && what.pack !== null) return `a ${what.kind} a plugin carries`;
  return what.kind === 'look' ? 'a look that does not say it is its own' : `a ${what.kind}`;
}

/**
 * Refuse a `slash` event that Slash may not sign.
 *
 * EVERY EVENT WRITER THAT TAKES AN ACTOR FROM OUTSIDE ITSELF CALLS THIS. A writer added later is one more call.
 *
 * `what` IS THE THING WRITTEN, for a kind whose answer depends on it. Only `declare` does today: an install wrote its
 * line with a plain insert and the actor it was handed, so the first look a model wrote broke `30 §3`'s query and a
 * page signed `slash` would have been written the same way. A caller that passes no `what` is asking about the kind
 * alone, and a `declare` with nothing named is refused.
 */
export function slashMayWrite(actor: string, kind: string, what?: SlashWrites): void {
  if (actor !== SLASH) return;
  const may = SLASH_MAY.get(kind);
  if (may === undefined)
    throw new Error(
      `slash wrote ${kind}. A model suggests, proposes and predicts; everything else is a person's or BrainDog's own (30 §3).`,
    );
  if (!may(what))
    throw new Error(
      `slash wrote ${kind} of ${declaredAs(what)}. A model arranges a page with a look of its own; a page, a list, a rule, a script and a plugin are a person's to install (30 §3).`,
    );
}

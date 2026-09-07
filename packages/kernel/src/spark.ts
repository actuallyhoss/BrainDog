/**
 * What a model may write into the log, and what it may never.
 *
 * `30 §3` STATES THE INVARIANT AS A QUERY: `event WHERE actor = 'spark' AND kind NOT IN
 * ('suggest','propose','predict')` is empty. `52 §5.2` makes it a gate over the `corpus` record.
 * Neither existed, and nothing in the write path stopped a spark event of any other kind — so the
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
 * not that: no caller can ask for it, because `spark` is not a principal any request arrives as —
 * it is an actor the record writes on its own behalf when a model's answer comes back. Reaching
 * here means a deliverer or an ack has passed the wrong actor, which is a defect in this
 * repository and not an event in somebody's business. A `Result` would be a refusal nobody is
 * listening for.
 */

/** `30 §3`: the three kinds a model's own writing can take. */
export const SPARK_KINDS: ReadonlySet<string> = new Set(['suggest', 'propose', 'predict']);

/** The actor a model's answer is filed under. One string, in one place. */
export const SPARK = 'spark';

/**
 * Refuse a spark event that is not one of the three.
 *
 * EVERY EVENT WRITER THAT TAKES AN ACTOR FROM OUTSIDE ITSELF CALLS THIS. There are five, and they
 * are the five places a model's answer can reach the log: the write path, the governance writer,
 * the ingest writers and the digest's note. A sixth would be a sixth call.
 */
export function sparkMayWrite(actor: string, kind: string): void {
  if (actor === SPARK && !SPARK_KINDS.has(kind))
    throw new Error(
      `spark wrote ${kind}. A model suggests, proposes and predicts; everything else is a person's or the record's own (30 §3).`,
    );
}

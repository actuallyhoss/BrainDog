/**
 * Arranging a page: order and span, and nothing else.
 *
 * 21 §3.1 settled the vocabulary before any of this was built — *"The only authorable dimensions
 * are order and span"* — and gave the reason: spacing, type, colour, radius and density all come
 * from the theme, so **there is no ugly available, for the same reason there is no insecure
 * available. The vocabulary has no word for it.** This class is that sentence, enforced.
 *
 * ── A DRAFT, NOT A SERIES OF WRITES ─────────────────────────────────────────
 *
 * Every move edits a local draft; nothing leaves until Done. Three reasons, and the third is the
 * one that matters:
 *
 *   1. Dragging four blocks should be one line in the audit log — "rearranged the Money page" — and
 *      not four. 02 §8 makes an `edit` one event row PER CHANGED FIELD, all sharing one `batch`
 *      ULID, and the batch is what undo is a query over. A draft is the client's half of that.
 *   2. Escape has to mean escape. A mode that has already written cannot be cancelled, only
 *      compensated, and a compensating write is a second thing in the log that says the opposite of
 *      the first.
 *   3. A page declaration is written WHOLE (`setDeclaration({ body, version })`, 33 §2) — there is no
 *      patch form. So the client must hold one coherent body and send it once, against the version
 *      the page was drawn at (`page-write.ts`): a second person who arranged it meanwhile makes this
 *      write a conflict, said as the page having changed, rather than a silent overwrite.
 *
 * ── WHY ORDER IS A LIST OPERATION ───────────────────────────────────────────
 *
 * Reordering is `splice`, and that is the whole of it. There is no x, no y and no collision
 * resolution, because blocks FLOW — 21 §3.1 rejected free placement on measured evidence, and a
 * flow cannot leave a hole for the user to tidy. It also means the keyboard path is not a
 * simulation of dragging: `⌥↑` is the same `splice` the drag performs, which is what WCAG 2.5.7
 * asks for — a single-pointer alternative that is not a re-implementation.
 */

import { differs, moveAt, removeAt, setAreaAt, setSpanAt, type Area, type Slot } from './arrange.ts';

export { COLUMNS, STEPS, spanLabel, spanOf, stepsFor, type Slot } from './arrange.ts';

export class Arrangement {
  /**
   * The layout in force. `null` means "whatever the declaration says".
   *
   * It OUTLIVES the mode, and that is deliberate. An arrange mode whose Done button returns the
   * page to how it was is a mode that lied in its own toast — you moved four blocks, it said
   * "rearranged", and nothing moved. In the real client Done calls `setDeclaration`; here it keeps
   * the draft and the toast says plainly that nothing was written. Either way what you see after
   * Done is what you asked for.
   */
  slots = $state<Slot[] | null>(null);

  /** Whether the controls are showing. Separate from `slots`, because a layout can be in force
      while nobody is arranging. */
  editing = $state(false);

  /**
   * The place (an index into `slots`) of the block whose editor is open, or `null` when none is.
   *
   * HELD HERE AND NOT IN THE BAR, because the bar is drawn once per block by the page's body while the editor is one
   * sheet drawn by the arranging controls: this class is the one thing both are handed.
   */
  editAt = $state<number | null>(null);

  #declared: Slot[] = [];
  #before: Slot[] | null = null;

  /** Enter the mode. Snapshots what is in force, so Cancel has something to return to. */
  begin(declared: Slot[]) {
    this.#declared = declared.map((s) => ({ ...s }));
    this.#before = this.slots ? this.slots.map((s) => ({ ...s })) : null;
    this.slots = (this.slots ?? declared).map((s) => ({ ...s }));
    this.editing = true;
  }

  /** Leave without keeping the draft. */
  cancel() {
    this.slots = this.#before;
    this.editing = false;
    this.editAt = null;
  }

  /** Leave keeping it. Returns the undo, so the caller can put it in the toast. */
  commit(): () => void {
    const before = this.#before;
    this.editing = false;
    this.editAt = null;
    return () => {
      this.slots = before;
    };
  }

  /** True once the draft says something different from what was in force when the mode opened. */
  get dirty() {
    return this.slots ? differs(this.slots, this.#before ?? this.#declared) : true;
  }

  move(from: number, to: number) {
    if (this.slots) this.slots = moveAt(this.slots, from, to);
  }

  remove(at: number) {
    if (this.slots) this.slots = removeAt(this.slots, at);
  }

  setSpan(at: number, span: number) {
    if (this.slots) this.slots = setSpanAt(this.slots, at, span);
  }

  setArea(at: number, area: Area) {
    if (this.slots) this.slots = setAreaAt(this.slots, at, area);
  }

  /** Open the block editor on the block at place `at`. Only while arranging: the editor is part of the mode. */
  edit(at: number) {
    if (this.editing && this.slots && at >= 0 && at < this.slots.length) this.editAt = at;
  }

  /**
   * What the declaration would become. The caller writes it; this class never does.
   *
   * THE COLUMN GOES WITH THE PLACE. This mapped each slot to its block and span, so a block moved to the side rail came
   * out of the draft in no column at all, and the page wrote it back where the record already had it. A slot with no
   * `area` stays without one, which is the block left where the record holds it.
   */
  get body() {
    return (this.slots ?? []).map((s) => ({ block: s.i, span: s.span, ...(s.area ? { area: s.area } : {}) }));
  }
}

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
 *   3. A page declaration is written WHOLE (`setDeclaration({ body })`, 33 §2) — there is no patch
 *      form and, unlike `installPack`'s `planHash`, no compare-and-set token for it. So the client
 *      must hold one coherent body and send it once. `ponytail:` that gap is real and unresolved in
 *      the contract; a second person arranging the same page concurrently would silently win, and
 *      the fix is a `version` on `setDeclaration`, not anything this file can do.
 *
 * ── WHY ORDER IS A LIST OPERATION ───────────────────────────────────────────
 *
 * Reordering is `splice`, and that is the whole of it. There is no x, no y and no collision
 * resolution, because blocks FLOW — 21 §3.1 rejected free placement on measured evidence, and a
 * flow cannot leave a hole for the user to tidy. It also means the keyboard path is not a
 * simulation of dragging: `⌥↑` is the same `splice` the drag performs, which is what WCAG 2.5.7
 * asks for — a single-pointer alternative that is not a re-implementation.
 */

import { KINDS, isKind } from 'braindog-render';

/** One block's arrangement. `i` indexes the DECLARED order, so a draft can be diffed against it. */
export type Slot = { i: number; span: number };

/** 12 · 6 · 4 — full, half, third. 21 §3.1's steps, and Home Assistant's multiplier of 3. */
export const STEPS = [12, 6, 4] as const;

export const COLUMNS = 12;

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
  }

  /** Leave keeping it. Returns the undo, so the caller can put it in the toast. */
  commit(): () => void {
    const before = this.#before;
    this.editing = false;
    return () => {
      this.slots = before;
    };
  }

  /** True once the draft says something different from what was in force when the mode opened. */
  get dirty() {
    const now = this.slots;
    const was = this.#before ?? this.#declared;
    if (!now || now.length !== was.length) return true;
    return now.some((s, n) => s.i !== was[n]?.i || s.span !== was[n]?.span);
  }

  move(from: number, to: number) {
    const now = this.slots;
    if (!now) return;
    const at = Math.max(0, Math.min(now.length - 1, to));
    if (at === from) return;
    const next = [...now];
    const [held] = next.splice(from, 1);
    if (held) next.splice(at, 0, held);
    this.slots = next;
  }

  remove(at: number) {
    const now = this.slots;
    if (!now) return;
    this.slots = now.filter((_, n) => n !== at);
  }

  setSpan(at: number, span: number) {
    const now = this.slots;
    if (!now) return;
    this.slots = now.map((s, n) => (n === at ? { ...s, span } : s));
  }

  /** What the declaration would become. The caller writes it; this class never does. */
  get body() {
    return (this.slots ?? []).map((s) => ({ block: s.i, span: s.span }));
  }
}

/**
 * The narrowest span a kind survives, and the steps that are therefore offered.
 *
 * REFUSED, NOT CLAMPED. 21 §11: caps are counters, not discoveries, and a closed list's control
 * cannot express a non-member. A `Third` button that silently gives you a half is a button that has
 * taught you the wrong thing about your own page.
 */
export const stepsFor = (kind: string): number[] => {
  const floor = isKind(kind) ? KINDS[kind].minSpan : 4;
  return STEPS.filter((s) => s >= floor);
};

/**
 * `Full · Half · Third`, and `Precise` for anything else.
 *
 * Precise is INFERRED from `span % 3 !== 0`, never stored — 21 §3.1, adopting Home Assistant's
 * trick. No extra state to keep in sync, and a span a pack wrote as 5 shows its own number rather
 * than being rounded to the nearest button.
 */
export const spanLabel = (span: number): string =>
  span === 12 ? 'Full' : span === 6 ? 'Half' : span === 4 ? 'Third' : `${span}/12`;

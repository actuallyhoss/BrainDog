/**
 * One automation being drawn: the reactive half of `flow.ts`, and nothing these methods do is arithmetic.
 *
 * A DRAFT, NOT A SERIES OF WRITES, for `Arrangement`'s three reasons (`record/arrange.svelte.ts`), the third of which is
 * the one that matters here as well: a rule declaration is written WHOLE, so the canvas holds one coherent body and
 * sends it once, as a `change` for Decide, against the version it opened. Dragging six cards is one proposal, and
 * Escape leaves nothing behind because nothing was sent.
 *
 * WHERE A DRAG IS LIVES HERE AND NOT IN A CARD, because the card under the pointer is a different card from the one
 * being held, and both have to agree on it: the held card draws itself faint, the card under the pointer draws the
 * line on the edge it will land at. One `dragging` and one `over` on the draft is the only way two components see the
 * same drag.
 *
 * EVERY MOVE IS ANNOUNCED. `said` is read by a polite live region on the page: a keyboard user who presses Alt and an
 * arrow has no other way to learn that the step went into the branch rather than past it, and a refused move says why.
 */

import {
  blankDraft,
  bodyOf,
  draftOf,
  faultsOf,
  find,
  insertAt,
  landing,
  mintKey,
  moveBetween,
  nudge,
  pathOf,
  proposalOf,
  removeKey,
  replaceStep,
  sayStep,
  blankStep,
  withTrigger,
  type Body,
  type Draft,
  type ListId,
  type Moved,
  type Nudge,
  type Step,
  type Trigger,
  type Verb,
} from './flow.ts';

export type Over = { list: ListId; at: number; edge: 'before' | 'after' };

/** How many drafts back Undo reaches. A person undoing thirty drags has lost the thread; the cap keeps memory flat. */
const UNDO_DEPTH = 30;

export class FlowDraft {
  /**
   * RAW, BECAUSE EVERY CHANGE IS A NEW TREE. `flow.ts` never edits a node in place, so a deep proxy would only cost a
   * wrapper per node, and it would break the one identity check that matters: `moveBetween` hands back the SAME array
   * when it refuses, and a proxied copy is never the same array.
   */
  draft = $state.raw<Draft>(blankDraft());
  /** The card the inspector is open on, `trigger` for the trigger card, or `null` when it is closed. */
  selected = $state<string | null>(null);
  /** The card being dragged, by key. */
  dragging = $state<string | null>(null);
  /** Where it would land if let go now. */
  over = $state<Over | null>(null);
  /** The last move in words, for the page's live region. */
  said = $state('');
  /** Why the last move was refused, or '' when it was not. What a card puts in a toast after a drop or a menu press. */
  why = $state('');

  /** The version it was opened at, or `null` for a new one. What a save is drawn from. */
  version: number | null = null;
  /** State, so that `sent` quietens the button: `dirty` reads it, and a plain field would not tell anything it moved. */
  #opened = $state('');
  #undo = $state.raw<Draft[]>([]);
  /** Set when the inspector opens on a card, and spent by the first edit there. */
  #fresh = false;
  /**
   * CARDS ADDED HERE WHOSE FAULTS ARE NOT SAID YET, until the inspector has closed on them once. `blankStep` leaves every
   * required argument empty, so a card turned into a fault the moment it was added, while the sheet was still opening
   * on it to be filled (`loop/research-canvas-ux.md` 1.7). A card read from the body is never held: what an agent wrote
   * wrong is said at once.
   */
  #held = $state.raw<ReadonlySet<string>>(new Set());

  /** Open a body. `null` is a new automation, which has no version and nothing to compare against. */
  open(id: string, body: Body | null, version: number | null) {
    this.draft = body ? draftOf(id, body) : blankDraft(id);
    this.version = body ? version : null;
    this.#opened = body ? JSON.stringify(bodyOf(this.draft)) : '';
    this.#undo = [];
    this.#held = new Set();
    this.selected = null;
    this.dragging = null;
    this.over = null;
    this.said = '';
  }

  get body(): Body {
    return bodyOf(this.draft);
  }

  /** True once the body it would send differs from the one it opened. A new one is always dirty. */
  get dirty(): boolean {
    return JSON.stringify(this.body) !== this.#opened;
  }

  get faults() {
    return faultsOf(this.draft);
  }

  get path() {
    return pathOf(this.body);
  }

  get canUndo() {
    return this.#undo.length > 0;
  }

  proposal() {
    return proposalOf(this.draft, this.version);
  }

  /**
   * What was just sent becomes what it is compared against, so the button goes quiet until something changes again.
   * Left dirty, a second press filed the same change twice, and Decide showed two questions that were one decision.
   */
  sent() {
    this.#opened = JSON.stringify(this.body);
  }

  #keep() {
    this.#undo = [...this.#undo.slice(-(UNDO_DEPTH - 1)), this.draft];
  }

  undo() {
    const back = this.#undo.at(-1);
    if (!back) return;
    this.#undo = this.#undo.slice(0, -1);
    this.draft = back;
  }

  #apply(out: Moved, key: string, where: string): boolean {
    const step = find(this.draft.steps, key)?.node.step;
    this.why = out.moved ? '' : (out.why ?? '');
    if (!out.moved) {
      if (out.why) this.said = out.why;
      return false;
    }
    this.#keep();
    this.draft = { ...this.draft, steps: out.steps };
    this.said = `${step ? sayStep(step) : 'The step'}: ${where}.`;
    return true;
  }

  /** Alt and an arrow, or the card's menu. Returns whether it moved, so the caller knows to put focus back on it. */
  nudge(key: string, dir: Nudge): boolean {
    const words = { up: 'moved up', down: 'moved down', in: 'moved into the branch', out: 'moved out of the branch' };
    return this.#apply(nudge(this.draft.steps, key, dir), key, words[dir]);
  }

  /** Let go of a drag, wherever `over` says. */
  drop(): boolean {
    const key = this.dragging;
    const over = this.over;
    this.dragging = null;
    this.over = null;
    /* A PRESS ON THE HANDLE WITH NO MOVE IS NOT A REFUSAL, and must not toast whatever the last refusal said. */
    this.why = '';
    if (key === null || over === null) return false;
    const to = landing(this.draft.steps, key, over);
    return to !== null && this.#apply(moveBetween(this.draft.steps, key, to), key, 'moved');
  }

  cancelDrag() {
    this.dragging = null;
    this.over = null;
  }

  /** A new step of one kind at a gap, opened in the inspector straight away, because a blank card is not yet a step. */
  add(list: ListId, at: number, verb: Verb) {
    this.#keep();
    const key = mintKey();
    const node = verb === 'if' ? { key, step: blankStep(verb), then: [], else: [] } : { key, step: blankStep(verb) };
    this.draft = { ...this.draft, steps: insertAt(this.draft.steps, list, at, node) };
    /* NOT `select`, which would arm `#fresh`: the add is already on the undo stack, and one Undo takes back the card
       and what was typed into it together. The card the sheet was on before is released as `select` would. */
    this.#release(this.selected);
    this.#held = new Set([...this.#held, key]);
    this.selected = key;
    this.said = `${sayStep(node.step)}: added.`;
  }

  /** Whether a card's faults wait for the inspector to close on it first. */
  holds(key: string): boolean {
    return this.#held.has(key);
  }

  remove(key: string) {
    const step = find(this.draft.steps, key)?.node.step;
    this.#keep();
    this.draft = { ...this.draft, steps: removeKey(this.draft.steps, key) };
    /* RELEASED HERE AS WELL, because the sheet's Remove closes it by clearing `selected` and not through `select`.
       Held past that, a card added, removed from the sheet and brought back by Undo came back empty with its faults
       still silent, and stayed silent until somebody opened it and closed it again. */
    this.#release(key);
    if (this.selected === key) this.selected = null;
    this.said = `${step ? sayStep(step) : 'The step'}: removed.`;
  }

  /**
   * NOT KEPT FOR UNDO PER KEYSTROKE. The draft is kept once, at the first edit after the inspector opens on a card, so
   * Undo takes back what was typed there rather than one letter of it, and opening a card without changing it leaves
   * nothing on the stack for Undo to spend a press on.
   */
  #keepOnce() {
    if (!this.#fresh) return;
    this.#fresh = false;
    this.#keep();
  }

  setStep(key: string, step: Step) {
    this.#keepOnce();
    this.draft = { ...this.draft, steps: replaceStep(this.draft.steps, key, step) };
  }

  /** Through `withTrigger`, so a switch from a change to anything else takes both forms of the condition with it. */
  setTrigger(trigger: Trigger) {
    this.#keepOnce();
    this.draft = withTrigger(this.draft, trigger);
  }

  setName(name: string) {
    this.#keepOnce();
    this.draft = { ...this.draft, name };
  }

  setWhen(when: string) {
    this.#keepOnce();
    this.draft = { ...this.draft, when: when === '' ? null : when };
  }

  select(key: string | null) {
    if (this.selected !== key) this.#release(this.selected);
    this.#fresh = key !== null;
    this.selected = key;
  }

  /** The inspector has closed on this card, or moved off it, so its faults are said from now on. */
  #release(key: string | null) {
    if (key !== null && this.#held.has(key)) this.#held = new Set([...this.#held].filter((k) => k !== key));
  }
}

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
  withCondition,
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

import { keyAt, pathsOf, type TriedStep, type TryState } from './source.ts';

export type Over = { list: ListId; at: number; edge: 'before' | 'after' };

/** How one card went in the last try: its outcome, its answer as a person reads it, and the runner's sentence. */
export type Paint = { state: TryState; answer: string | null; say: string };

/** The record's own word on a body (`checkAutomation`): the card its `at` is about, or `null` for the whole body. */
export type Served = { key: string | null; say: string };

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
  /**
   * Whether this host answers Slash, which decides whether an `ask_slash` card is a fault (`faultsOf`).
   *
   * READ EACH TIME, NOT KEPT, because it was kept and the menu beside it is not. The layout forgets a refused
   * `/api/version` and asks again on the next navigation, a move from one automation to another keeps the page, and
   * `StepMenu`'s `$derived` follows the new answer: kept from the first load, the draft faulted every Ask Slash card the
   * menu had just offered (`flow.svelte.test.ts`). A function read inside `faults` is also what a `$derived` over the
   * faults tracks, so the two cannot disagree. A plain boolean is still taken, for a caller with nothing to follow.
   */
  get slash(): boolean {
    return this.#slash();
  }
  #slash: () => boolean;
  /** State, so that `sent` quietens the button: `dirty` reads it, and a plain field would not tell anything it moved. */
  #opened = $state('');
  #undo = $state.raw<Draft[]>([]);
  /** What `undo()` took off the canvas, newest last, so `redo()` can put it back; spent by `#keep()`. */
  #redo = $state.raw<Draft[]>([]);
  /** Set when the inspector opens on a card, and spent by the first edit there. */
  #fresh = false;
  /**
   * CARDS ADDED HERE WHOSE FAULTS ARE NOT SAID YET, until the inspector has closed on them once. `blankStep` leaves every
   * required argument empty, so a card turned into a fault the moment it was added, while the sheet was still opening
   * on it to be filled. A card read from the body is never held: what an agent wrote
   * wrong is said at once.
   */
  #held = $state.raw<ReadonlySet<string>>(new Set());
  /**
   * THE RECORD'S LAST WORD ON A BODY AND THE LAST TRY OF ONE, each kept with the body it was about, so an edit after
   * either hides it rather than painting a card with an answer about a flow that is gone. Both are keyed by card, since
   * the record names a step by its place and a card keeps its key through every move.
   */
  #served = $state.raw<{ body: string; fault: Served | null } | null>(null);
  #painted = $state.raw<{ body: string; by: ReadonlyMap<string, Paint> } | null>(null);
  /** The body drawn now as JSON, worked out once per edit rather than once per card that asks. */
  #drawn = $derived(JSON.stringify(bodyOf(this.draft)));

  constructor({ slash }: { slash: boolean | (() => boolean) }) {
    this.#slash = typeof slash === 'function' ? slash : () => slash;
  }

  /**
   * Open a body. `null` is a new automation, which has no version and nothing to compare against. A body with no
   * version is new as well, a duplicate drawn from another: it has steps and is still unsaved, so it opens dirty.
   */
  open(id: string, body: Body | null, version: number | null) {
    this.draft = body ? draftOf(id, body) : blankDraft(id);
    this.version = body ? version : null;
    this.#opened = body && version !== null ? JSON.stringify(bodyOf(this.draft)) : '';
    this.#undo = [];
    this.#redo = [];
    this.#held = new Set();
    this.selected = null;
    this.dragging = null;
    this.over = null;
    this.said = '';
    this.#served = null;
    this.#painted = null;
  }

  /**
   * Put an older version's body on the canvas, to be saved over the live one. The version it is drawn from stays the
   * live one, so the save is a change to what is installed now and a version that landed since is a conflict.
   */
  restore(body: Body) {
    this.#keep();
    this.draft = draftOf(this.draft.id, body);
    this.selected = null;
  }

  /**
   * The rule was turned on or off, which installed a new version. The draft takes the switch and the version, so the
   * next save is drawn from the version now live and does not put the old switch back; a draft nobody had changed
   * stays unchanged.
   */
  switched(enabled: boolean, version: number) {
    const clean = !this.dirty;
    const { enabled: _was, ...rest } = this.draft.rest;
    this.draft = { ...this.draft, rest: enabled ? rest : { ...rest, enabled: false } };
    this.version = version;
    if (clean) this.#opened = JSON.stringify(this.body);
  }

  /** Each card's place in the body a save would send, by key. */
  get paths(): Map<string, string> {
    return pathsOf(this.draft.steps, Array.isArray(this.body.steps) ? 'steps' : 'then');
  }

  /** Keep the record's word on `body` (the JSON of the body that was checked), `null` when it would install. */
  serve(body: string, fault: { say: string; at?: string | undefined } | null) {
    this.#served = { body, fault: fault === null ? null : { key: keyAt(this.paths, fault.at), say: fault.say } };
  }

  /** The record's fault on the body drawn now, or `null`: none, not asked yet, or asked about a body since changed. */
  get served(): Served | null {
    const s = this.#served;
    return s !== null && s.body === this.#drawn ? s.fault : null;
  }

  /** Paint each card with how it went in a try of `body` (the JSON of the body tried). */
  paint(body: string, steps: readonly TriedStep[], words: (step: TriedStep) => string | null) {
    const byPlace = new Map(steps.map((s) => [s.path, s]));
    const by = new Map<string, Paint>();
    for (const [key, place] of this.paths) {
      const s = byPlace.get(place);
      if (s) by.set(key, { state: s.state, answer: words(s), say: s.say });
    }
    this.#painted = { body, by };
  }

  unpaint() {
    this.#painted = null;
  }

  /** How one card went in the last try of the body drawn now, or `null`. */
  paintOf(key: string): Paint | null {
    const p = this.#painted;
    return p !== null && p.body === this.#drawn ? (p.by.get(key) ?? null) : null;
  }

  get body(): Body {
    return bodyOf(this.draft);
  }

  /** True once the body it would send differs from the one it opened. A new one is always dirty. */
  get dirty(): boolean {
    return JSON.stringify(this.body) !== this.#opened;
  }

  get faults() {
    return faultsOf(this.draft, { slash: this.slash });
  }

  get path() {
    return pathOf(this.body);
  }

  get canUndo() {
    return this.#undo.length > 0;
  }

  get canRedo() {
    return this.#redo.length > 0;
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
    this.#redo = [];
  }

  undo() {
    const back = this.#undo.at(-1);
    if (!back) return;
    this.#undo = this.#undo.slice(0, -1);
    this.#redo = [...this.#redo.slice(-(UNDO_DEPTH - 1)), this.draft];
    this.draft = back;
  }

  redo() {
    const forward = this.#redo.at(-1);
    if (!forward) return;
    this.#redo = this.#redo.slice(0, -1);
    this.#undo = [...this.#undo.slice(-(UNDO_DEPTH - 1)), this.draft];
    this.draft = forward;
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

  /** A query-builder tree has no setter of its own: `Inspector.svelte` marks the undo through this, then
      assigns `flow.draft = withCondition(...)` directly. */
  setCondition(cond: unknown) {
    this.#keepOnce();
    this.draft = withCondition(this.draft, cond);
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

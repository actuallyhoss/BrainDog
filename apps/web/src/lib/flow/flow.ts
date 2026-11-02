/**
 * The canvas's draft of one automation: a trigger, and a tree of step lists.
 *
 * AN AUTOMATION IS A `rule` THAT GREW A TRIGGER AND STEPS, NOT A KIND OF ITS OWN, so what this file reads and writes is a
 * `rule` declaration body, the same one an agent files through `propose` and the same one `flow-lint.ts` checks. There
 * is no second format for the canvas to drift from: `draftOf` reads a body, `bodyOf` writes one, and the round trip is
 * the first thing the tests hold.
 *
 * NOTHING HAS AN X OR A Y. A branch is two lists under its card and every other step sits in exactly one list, so every
 * drag, key and menu entry is one of four list operations: take a node out of one list, put it into another at an
 * index, and the two refusals that keep the tree a tree (a branch cannot go inside itself, and nothing nests past the
 * record's three). `21 §3.1` argued for flow over free placement on measured evidence, and a flow cannot leave a hole.
 *
 * PURE, for `arrange.ts`'s reason: `node --test` cannot import a `.svelte.ts` file, and the arithmetic is where a bug
 * would live. `flow.svelte.ts` is the reactive half and holds nothing these functions do not.
 */

import { notInThisBuild } from '@braindog/kernel';
import { dropIndex, moveAt } from '../record/arrange.ts';
import { REGISTERS } from '../record/held.ts';
import { singularOf } from '../voice.ts';
import { often } from '../record/actions.ts';
import { DAYS, EVERY, calendarWords, clockWords, inMonths } from './calendar.ts';
import { PATH_WORDS, chipWord, idWords } from './chips.ts';
import { learnTitles } from './plain-fail.ts';
import { OLDER, held, type ArgFrom, type FlowGrammar, type GrammarArg, type GrammarStep } from './grammar.ts';

/* ── the definition, as §3 sketches it and `rules.ts` declares it ──────────── */

/**
 * WRITTEN HERE AND NOT IMPORTED, because `@braindog/kernel` exports `RuleDecl` and not `Trigger`, `Step` or `pathOf`,
 * and the package has one entry point. The shapes are copied from `packages/kernel/src/rules.ts` and the path rule from
 * `flow-lint.ts`, and `flow.test.ts` holds this `pathOf` to the kernel's answers, measured over the same bodies.
 */
export type Trigger =
  | { written: { register: string; op?: ('create' | 'update' | 'delete')[]; fields?: string[]; from_rules?: boolean } }
  | { arrival: { ingest?: string; channel?: 'webhook' | 'email' | 'paste' | 'api' | 'pull'; state?: string[]; unverified?: boolean } }
  /* `day` IS A WEEKDAY ON A WEEK AND 1 TO 31 OR `last` ON A CLOCK OF MONTHS, and `month` counts a clock of months from
     one (`calendar.ts`). */
  /* `late` IS HOW LONG AFTER ITS TIME A TURN MAY STILL BE TAKEN (`2h`); a turn reached later is recorded as skipped with
     its sentence and not taken (contracts, clock `late:`). Absent, every turn is taken however late. */
  | { every: string; at?: string; day?: string | number; month?: string; late?: string }
  | { metric: { id: string; crosses: 'target' | { lte: number } | { gte: number } } }
  /* `about` IS THE DECLARATION THAT PUT THE QUESTION (`rule.chase`), and `option` one answer's words exactly as the
     question offers it, since a rule's `suggest` options are words whose ids are only their places. */
  | { decided: { about?: string; option?: string } }
  | { manual: true };

/** A clock trigger alone, which is what a pick of a clock builds. */
export type Clock = Extract<Trigger, { every: string }>;

/** A step as the body holds it: exactly one verb key, and for `if` its two arms. Read loosely, because agents write these. */
export type Step = Record<string, unknown>;

/** A rule body. Only the keys this file reads are named; anything else is carried through untouched. */
export type Body = Record<string, unknown>;

/* ── the grammar, as the record answers it ────────────────────────────────── */

/**
 * A VERB IS ONE THIS BUILD HAS WORDS FOR (`VERB_LABELS`), as a type. Which verbs there are is the record's grammar
 * (`grammar.ts`), never a list here: a verb the grammar holds and these words do not is drawn by its arguments and its
 * id in words, and is typed as a `Verb` all the same, since every table keyed by one answers a missing key.
 */
export type Verb = keyof typeof VERB_LABELS;

/**
 * THE GRAMMAR'S TABLES, AS FUNCTIONS OVER A GRAMMAR. They were constants copied from `flow-lint.ts` by hand, and the
 * copy lost `meet` and `run_job`. Each takes the grammar it reads, the tab's own by default (`held`), and over no
 * grammar answers nothing: no verbs, no once, a ceiling of none, so an editor over an older record offers nothing.
 */
export const verbsOf = (g: FlowGrammar | null = held()): Verb[] => (g?.steps ?? []).map((s) => s.verb as Verb);
/** The actions a rule had before steps, which the inline pass runs. The grammar's `group`. */
export const actionsOf = (g: FlowGrammar | null = held()): Verb[] => (g?.steps ?? []).filter((s) => s.group === 'action').map((s) => s.verb as Verb);
/** The verbs only a step has. */
export const flowVerbsOf = (g: FlowGrammar | null = held()): Verb[] => (g?.steps ?? []).filter((s) => s.group !== 'action').map((s) => s.verb as Verb);
/** Verbs that need `once_per` on a trigger about a row. */
export const onceOf = (g: FlowGrammar | null = held()): Verb[] => (g?.steps ?? []).filter((s) => s.once).map((s) => s.verb as Verb);
/**
 * How many branches deep a step may sit. A move that would pass it is refused here, as the record would refuse the
 * body; every other limit the record holds is said by `checkAutomation`.
 */
export const depthCeilingOf = (g: FlowGrammar | null = held()): number => g?.ceilings.depth ?? 0;
/** One step of the grammar, by its verb. */
export const grammarStep = (verb: string, g: FlowGrammar | null = held()): GrammarStep | undefined => g?.steps.find((s) => s.verb === verb);

const isObject = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x);

/**
 * The one verb a step names, or `null` for a step that names none or two.
 *
 * OVER NO GRAMMAR, BY THE STEP'S SHAPE: its one key that is not a branch's arm. Decide and the hub say steps with no
 * grammar read, and a step is exactly one verb key, so the shape alone names it.
 */
export function verbOf(step: Step, g: FlowGrammar | null = held()): Verb | null {
  const keys = g ? Object.keys(step).filter((k) => g.steps.some((s) => s.verb === k)) : Object.keys(step).filter((k) => k !== 'then' && k !== 'else');
  return keys.length === 1 ? (keys[0] as Verb) : null;
}

/* ── the tree ─────────────────────────────────────────────────────────────── */

/**
 * One card. `key` is the canvas's own and never reaches the body: a step has no id in the declaration, and two steps can
 * be identical, so a drag has to name the card it holds by something other than what the card says.
 *
 * A BRANCH HOLDS ITS ARMS BESIDE ITS STEP, not inside it, so that every list in the tree is a `Node[]` and every move is
 * the same move. `step` for a branch is `{ if: condition }` and nothing else.
 */
export type Node = { key: string; step: Step; then?: Node[]; else?: Node[]; elseKept?: true };

/**
 * A list's address: `root`, or a branch's key and an arm, `k7/then`. A string, because a drop target carries it in a
 * `data-` attribute and a pointer handler reads it back from whatever element is under the finger.
 */
export type ListId = string;
export const ROOT: ListId = 'root';
export const armOf = (key: string, arm: 'then' | 'else'): ListId => `${key}/${arm}`;

let minted = 0;
/** A fresh card key. Only unique within the tab, which is all a card key is ever compared against. */
export const mintKey = (): string => `k${(minted += 1)}`;

const isBranch = (n: Node): boolean => 'if' in n.step;

/**
 * A body's list of steps as cards. A branch's arms become lists of their own, and a missing `else` is an empty one.
 *
 * `elseKept` MARKS A BRANCH WHOSE BODY SPELLED `else:` OUT, empty or not, so `stepsOf` writes it back. An agent that
 * wrote `else: []` read its own body back on Decide without it, as a change nobody made.
 */
export function nodesOf(list: unknown): Node[] {
  if (!Array.isArray(list)) return [];
  return list.filter(isObject).map((step): Node => {
    if (!('if' in step)) return { key: mintKey(), step: { ...step } };
    const { then, else: otherwise, ...rest } = step;
    return { key: mintKey(), step: rest, then: nodesOf(then), else: nodesOf(otherwise), ...(Array.isArray(otherwise) ? { elseKept: true as const } : {}) };
  });
}

/**
 * Cards back into a body's list. An empty `else` is left out, which is how the record reads a branch with none, unless
 * the body it was read from wrote one (`elseKept`), and then it is kept as written.
 */
export function stepsOf(nodes: readonly Node[]): Step[] {
  return nodes.map((n) => {
    if (!isBranch(n)) return n.step;
    const otherwise = stepsOf(n.else ?? []);
    return { ...n.step, then: stepsOf(n.then ?? []), ...(otherwise.length > 0 || n.elseKept ? { else: otherwise } : {}) };
  });
}

/** Where a card is: its list, its index there, and how many branches it sits inside. */
export type Found = { node: Node; list: ListId; at: number; depth: number };

export function find(nodes: readonly Node[], key: string, list: ListId = ROOT, depth = 0): Found | null {
  for (const [at, node] of nodes.entries()) {
    if (node.key === key) return { node, list, at, depth };
    if (isBranch(node)) {
      const inner = find(node.then ?? [], key, armOf(node.key, 'then'), depth + 1) ?? find(node.else ?? [], key, armOf(node.key, 'else'), depth + 1);
      if (inner) return inner;
    }
  }
  return null;
}

/** The cards of one list, or `null` when the address names no list in this tree. */
export function listOf(nodes: readonly Node[], list: ListId): Node[] | null {
  if (list === ROOT) return [...nodes];
  const [key, arm] = splitList(list);
  const owner = key === null ? null : find(nodes, key);
  if (!owner || !isBranch(owner.node) || arm === null) return null;
  return [...(owner.node[arm] ?? [])];
}

function splitList(list: ListId): [string | null, 'then' | 'else' | null] {
  const cut = list.lastIndexOf('/');
  if (cut < 0) return [null, null];
  const arm = list.slice(cut + 1);
  return [list.slice(0, cut), arm === 'then' || arm === 'else' ? arm : null];
}

/** The tree with one list replaced. Every node on the way down is a new object, so an undo can keep the old tree whole. */
function mapList(nodes: readonly Node[], list: ListId, fn: (cards: Node[]) => Node[]): Node[] {
  if (list === ROOT) return fn([...nodes]);
  const [key, arm] = splitList(list);
  return nodes.map((n) => {
    if (!isBranch(n)) return n;
    if (n.key === key && arm !== null) return { ...n, [arm]: fn([...(n[arm] ?? [])]) };
    return { ...n, then: mapList(n.then ?? [], list, fn), else: mapList(n.else ?? [], list, fn) };
  });
}

/** One card added to a list, at an index clamped to the list. */
export const insertAt = (nodes: readonly Node[], list: ListId, at: number, node: Node): Node[] =>
  mapList(nodes, list, (cards) => {
    cards.splice(Math.max(0, Math.min(cards.length, at)), 0, node);
    return cards;
  });

/** One card taken out, wherever it is. A branch goes with both its arms. */
export function removeKey(nodes: readonly Node[], key: string): Node[] {
  return nodes
    .filter((n) => n.key !== key)
    .map((n) => (isBranch(n) ? { ...n, then: removeKey(n.then ?? [], key), else: removeKey(n.else ?? [], key) } : n));
}

/** One card's step replaced, wherever it is. Its arms, if it has any, stay. */
export function replaceStep(nodes: readonly Node[], key: string, step: Step): Node[] {
  return nodes.map((n) => {
    if (n.key === key) return { ...n, step };
    return isBranch(n) ? { ...n, then: replaceStep(n.then ?? [], key, step), else: replaceStep(n.else ?? [], key, step) } : n;
  });
}

/** Every card in the tree, both arms of every branch. What the record counts against its fifty. */
export const countOf = (nodes: readonly Node[]): number =>
  nodes.reduce((n, node) => n + 1 + (isBranch(node) ? countOf(node.then ?? []) + countOf(node.else ?? []) : 0), 0);

/* ── moving ───────────────────────────────────────────────────────────────── */

export type Moved = { steps: Node[]; moved: boolean; why?: string };

/** How many levels of branch a card carries inside itself: none for a step, one for a branch of steps, and so on. */
const heightOf = (n: Node): number =>
  isBranch(n) ? 1 + Math.max(0, ...(n.then ?? []).map(heightOf), ...(n.else ?? []).map(heightOf)) : 0;

/** Whether `key` is this card or anything inside its arms. */
const holds = (n: Node, key: string): boolean =>
  n.key === key || (isBranch(n) && [...(n.then ?? []), ...(n.else ?? [])].some((c) => holds(c, key)));

/** How many branches a list sits inside: none for the top, one for an arm of a top-level branch. */
function depthOfList(nodes: readonly Node[], list: ListId): number | null {
  if (list === ROOT) return 0;
  const [key] = splitList(list);
  const owner = key === null ? null : find(nodes, key);
  return owner ? owner.depth + 1 : null;
}

/**
 * One card to a list and an index: the move a drag, a key and a menu all end in.
 *
 * WITHIN ONE LIST IT IS `arrange.ts`'s `moveAt`, over the permutation of the list's indices, so a reorder here clamps
 * exactly as a page's blocks do and there is one piece of splice arithmetic in the app rather than two.
 *
 * BETWEEN TWO LISTS IT IS OUT OF ONE AND INTO THE OTHER, and `to.at` is an index in the target as it is now: the card
 * leaving its own list does not shift anything in a different one. `landing` is what turns a pointer into that index.
 *
 * TWO MOVES ARE REFUSED, AND THE TREE IS HANDED BACK AS IT WAS. A branch dropped into one of its own arms would be
 * removed from the tree and then inserted into a list that went with it, so the whole branch would vanish with no
 * error. And a branch dropped deeper than the grammar's ceiling would be refused on Decide, after the person had
 * forgotten which drag did it; the lint's sentence is said here, at the drop.
 */
export function moveBetween(nodes: readonly Node[], key: string, to: { list: ListId; at: number }): Moved {
  const from = find(nodes, key);
  const same = { steps: nodes as Node[], moved: false };
  if (!from) return same;
  const target = listOf(nodes, to.list);
  if (target === null) return same;
  const [owner] = splitList(to.list);
  if (owner !== null && holds(from.node, owner)) return { ...same, why: words.insideItself };
  const depth = depthOfList(nodes, to.list) ?? 0;
  const most = depthCeilingOf();
  if (depth + heightOf(from.node) > most) return { ...same, why: held() ? words.tooDeep(most) : OLDER };

  if (from.list === to.list) {
    const order = moveAt(target.map((_, i) => ({ i, span: 12 })), from.at, to.at);
    if (order.every((s, n) => s.i === n)) return same;
    return { steps: mapList(nodes, from.list, () => order.map((s) => target[s.i]!)), moved: true };
  }
  return { steps: insertAt(removeKey(nodes, key), to.list, to.at, from.node), moved: true };
}

/**
 * Where a drop lands, given the card under the pointer and which edge of it the pointer is nearer.
 *
 * `dropIndex` IN ONE LIST, AND THE RAW EDGE BETWEEN TWO. Within a list the held card comes out before it goes back in,
 * which is the off-by-one `arrange.ts` has a paragraph about. Across lists nothing comes out of the target, so after a
 * card is its index plus one and nothing more; using `dropIndex` there would land a card dragged from higher up the
 * page one place short in every arm below it.
 */
export function landing(nodes: readonly Node[], key: string, over: { list: ListId; at: number; edge: 'before' | 'after' }): { list: ListId; at: number } | null {
  const from = find(nodes, key);
  if (!from) return null;
  if (from.list === over.list) return { list: over.list, at: dropIndex(from.at, over.at, over.edge) };
  return { list: over.list, at: over.edge === 'after' ? over.at + 1 : over.at };
}

export type Nudge = 'up' | 'down' | 'in' | 'out';

/**
 * The keyboard's four moves, and the menu's: WCAG 2.5.7's single-pointer path, and the same `moveBetween` a drag ends in.
 *
 * UP AND DOWN STAY IN THE LIST, and say so at its ends rather than jumping into a neighbouring branch, because a key
 * that sometimes reorders and sometimes changes which arm a step is in is a key nobody can press without looking.
 * IN is the branch just above, at the end of its `then`, or failing that the branch just below, at the top of its
 * `then`: the two places a person dragging it the shortest way would put it. OUT is just after the branch it is in.
 */
export function nudge(nodes: readonly Node[], key: string, dir: Nudge): Moved {
  const from = find(nodes, key);
  const same = { steps: nodes as Node[], moved: false };
  if (!from) return same;
  const cards = listOf(nodes, from.list) ?? [];
  if (dir === 'up') return from.at === 0 ? { ...same, why: words.alreadyFirst } : moveBetween(nodes, key, { list: from.list, at: from.at - 1 });
  if (dir === 'down')
    return from.at === cards.length - 1 ? { ...same, why: words.alreadyLast } : moveBetween(nodes, key, { list: from.list, at: from.at + 1 });
  if (dir === 'in') {
    const above = cards[from.at - 1];
    if (above && isBranch(above)) return moveBetween(nodes, key, { list: armOf(above.key, 'then'), at: (above.then ?? []).length });
    const below = cards[from.at + 1];
    if (below && isBranch(below)) return moveBetween(nodes, key, { list: armOf(below.key, 'then'), at: 0 });
    return { ...same, why: words.noBranchBeside };
  }
  const [ownerKey] = splitList(from.list);
  const owner = ownerKey === null ? null : find(nodes, ownerKey);
  if (!owner) return { ...same, why: words.notInBranch };
  return moveBetween(nodes, key, { list: owner.list, at: owner.at + 1 });
}

/* ── the draft, and the body it is read from and written back to ─────────── */

/**
 * One automation as the canvas holds it.
 *
 * `rest` IS EVERY KEY THE CANVAS DOES NOT DRAW, carried through untouched: `priority`, `once_per`, `project`,
 * `enabled`, `limits`, and whatever a later build adds. A canvas that dropped the keys it did not understand would make
 * every save by a person a quiet edit of what an agent wrote.
 *
 * A `when` WRITTEN AS A TREE IS NOT IN `rest`, though the canvas cannot edit one. It was, and three things followed
 * from nothing drawing it (measured on an installed rule tagging
 * bills above 500): the trigger card said the rule started on every write; a sentence typed into "Only when" was
 * shown on the card and then lost to the tree, because `rest` is spread after it; and a switch to a clock left the tree
 * in the body with `faultsOf` silent and the record refusing on Send. Held here beside the sentence, it is drawn, it
 * gives way to what the person types, and it goes when the trigger stops being a change.
 *
 * `form` IS HOW THE BODY SPELLED ITS LIST, and it decides which path a saved body takes (see `bodyOf`).
 */
export type Draft = {
  id: string;
  name: string;
  trigger: Trigger;
  /** The condition as a `where` sentence, or `null` when none was typed. */
  when: string | null;
  /** A condition written as a tree, `{ field: amount, gt: 500 }`, or `null`. Filed only while `when` is empty. */
  whenTree: unknown;
  steps: Node[];
  form: 'then' | 'steps';
  /** Whether an inline body spelled its trigger out as `on: { written }` beside `register`, so it is written back that way. */
  spelledOn: boolean;
  rest: Body;
};

const DRAWN = new Set(['rule', 'name', 'on', 'register', 'when', 'then', 'steps']);

/** The trigger a body names, or the one it means: absent `on` is writes to its register, and no register is a button. */
export function triggerOfBody(body: Body): Trigger {
  const on = body.on;
  if (isObject(on)) {
    if (isObject(on.written) && typeof on.written.register === 'string') return { written: on.written as { register: string } };
    if (isObject(on.arrival)) return { arrival: on.arrival };
    if (typeof on.every === 'string') return on as { every: string };
    if (isObject(on.metric)) return on as Trigger;
    /* A DECISION TRIGGER KEEPS ITS OWN OBJECT, `{}` included, so a rule an agent wrote to start on any decision reads
       back as the same `decided: {}` it filed and not as a button. */
    if (isObject(on.decided)) return { decided: on.decided as { about?: string; option?: string } };
    if (on.manual === true) return { manual: true };
  }
  if (typeof body.register === 'string') return { written: { register: body.register } };
  return { manual: true };
}

export function draftOf(id: string, body: Body): Draft {
  const rest: Body = {};
  for (const [k, v] of Object.entries(body)) if (!DRAWN.has(k)) rest[k] = v;
  /* A WORD IN `on:` (`create`, the one older spelling the lint still lets through) is kept as it was, since the canvas
     cannot draw it and must not drop it. */
  if (typeof body.on === 'string') rest.on = body.on;
  return {
    id,
    name: typeof body.name === 'string' ? body.name : '',
    trigger: triggerOfBody(body),
    when: typeof body.when === 'string' ? body.when : null,
    whenTree: body.when !== undefined && body.when !== null && typeof body.when !== 'string' ? body.when : null,
    steps: nodesOf(body.steps ?? body.then),
    form: body.steps === undefined && body.then !== undefined ? 'then' : 'steps',
    spelledOn: isObject(body.on) && body.steps === undefined,
    rest,
  };
}

/** A new automation: a button that starts it, and nothing yet to do. `then`, so a plain rule saves as a plain rule. */
export const blankDraft = (id = 'automation', name = ''): Draft => ({
  id,
  name,
  trigger: { manual: true },
  when: null,
  whenTree: null,
  steps: [],
  form: 'then',
  spelledOn: false,
  rest: {},
});

/**
 * `inline` or `run`, as `flow-lint.ts` decides it, word for word. Nobody declares which; the body's shape does.
 */
export function pathOf(body: Body): 'inline' | 'run' {
  if (body.steps !== undefined) return 'run';
  if (body.on === undefined || typeof body.on === 'string') return 'inline';
  const written = (body.on as { written?: unknown }).written;
  if (!isObject(written)) return 'run';
  return written.op === undefined && written.fields === undefined && written.from_rules === undefined ? 'inline' : 'run';
}

const hasVerb = (nodes: readonly Node[], among: readonly string[]): boolean =>
  nodes.some((n) => among.some((v) => v in n.step) || (isBranch(n) && (hasVerb(n.then ?? [], among) || hasVerb(n.else ?? [], among))));

/**
 * The condition a draft files: the sentence the person typed when there is one, and the tree it was opened with only
 * when there is not. THE TYPED ONE WINS because it is the one on the screen; the card said "only when what is Rent"
 * over a body that still held `{ field: amount, gt: 500 }` while the tree came second in `bodyOf`.
 */
export function conditionOf(d: Draft): unknown {
  const typed = (d.when ?? '').trim();
  if (typed !== '') return typed;
  return d.whenTree ?? null;
}

/**
 * The draft with another trigger. THE CONDITION GOES WITH A CHANGE OF KIND, BOTH FORMS OF IT: a condition is about the
 * row a change brings or the row (or body) an arrival wrote, and a clock, a button, a figure or a decision has none, so
 * a condition carried across is one the record refuses or one that names fields the new trigger does not have.
 * `Inspector.svelte`'s `pick` once cleared the sentence and left the tree, which is how a `when:` was once
 * filed on a clock. An edit within one kind (another list, added or changed) keeps it.
 */
export function withTrigger(d: Draft, trigger: Trigger): Draft {
  const leaves = triggerKind(d.trigger) !== triggerKind(trigger);
  return leaves ? { ...d, trigger, when: null, whenTree: null } : { ...d, trigger };
}

/**
 * The draft with its condition replaced, in whichever form the editor has it: a sentence, a tree from the query
 * builder, or nothing. One form at a time, so the one on the screen is the one filed (`conditionOf`).
 */
export function withCondition(d: Draft, cond: unknown): Draft {
  if (typeof cond === 'string') return { ...d, when: cond.trim() === '' ? null : cond, whenTree: null };
  return { ...d, when: null, whenTree: cond === undefined ? null : cond };
}

/* OVER NO GRAMMAR A BODY KEEPS THE FORM IT WAS READ WITH: nothing can be added to it, so nothing moves it onto a run. */
const onlyActions = (nodes: readonly Node[], g: FlowGrammar | null): boolean =>
  nodes.every((n) => !isBranch(n) && (g === null || actionsOf(g).includes(verbOf(n.step, g) ?? ('' as Verb))));

/**
 * The body a draft saves as, which is exactly what an agent would write for the same flow.
 *
 * A RULE THAT WAS INLINE STAYS INLINE WHILE IT CAN. The record picks the path from the body's shape (`pathOf`): a
 * `register` and a `then` list run inside the write, and `steps` run after it, as a run that survives between steps.
 * Writing every save as `steps` would move every existing rule a person opened and saved onto the other path, with
 * different timing and a different history, for an edit that was one word in a note. So a body read with `then` is
 * written with `then` for as long as its trigger is a plain write and every step is an action; the first branch, wait
 * or call turns it into a run, and the editor says so on the trigger card before anything is saved.
 *
 * AND A LOUD STEP ABOUT A ROW GETS `once_per: [entry]`. The record refuses a notify, create, suggest, call or ask on a
 * written trigger without one, because it would fire on every edit of the row. Once for each row is the reading a
 * person means, it is what the seed's own rules say, and it is written into the body so Decide shows it.
 */
export function bodyOf(d: Draft, g: FlowGrammar | null = held()): Body {
  const rest: Body = { ...d.rest };
  const t = d.trigger;
  const written = 'written' in t ? t.written : null;
  const plainWrite = written !== null && written.op === undefined && written.fields === undefined && written.from_rules === undefined;
  const inline =
    plainWrite && d.form === 'then' && onlyActions(d.steps, g) && rest.project === undefined && rest.limits === undefined && rest.enabled !== false;
  if (written !== null && hasVerb(d.steps, onceOf(g)) && !(Array.isArray(rest.once_per) && rest.once_per.length > 0)) rest.once_per = ['entry'];
  const filed = conditionOf(d);
  const when = filed === null ? {} : { when: filed };
  const name = d.name.trim() === '' ? {} : { name: d.name.trim() };
  if (inline) {
    const { on: legacy, ...others } = rest;
    const on = d.spelledOn ? { on: t } : legacy === undefined ? {} : { on: legacy };
    return { rule: d.id, ...name, register: written!.register, ...on, ...when, then: stepsOf(d.steps), ...others };
  }
  const { on: _word, register: _register, ...others } = rest;
  return { rule: d.id, ...name, on: t, ...when, steps: stepsOf(d.steps), ...others };
}

/**
 * The proposal a save files: a `change` to `rule.<id>`, with the whole body, and the version it was drawn from.
 *
 * THE SAME PROPOSAL AN AGENT FILES, so the two editors are one. `packages/mcp/src/index.ts` documents this body for
 * `propose`, and Decide reads it the same way whichever of them drew it. What Decide draws of it today is thin: a rule
 * change is the word "Rule" and the id (`routes/decide/[id]/proposed.ts` `appearsOf`), with no trigger, no steps and
 * no dry run, although an earlier line here said it showed the dry run. The owner's
 * press is what installs it: the canvas never writes a declaration of its own.
 *
 * `from_version` IS 0 FOR A NEW ONE, AND NEVER LEFT OUT. This comment used to say an absent version was read as drawn
 * from nothing, and the record reads it the other way: an absent version is stamped with the one live at filing
 * (`packages/kernel/src/govern.ts` `stamp`). A member who cannot read Money sees no clocks in the list, so `freshId`
 * gave her "Gold rate" the id of the owner's hourly clock, and the owner's accept of "Add the automation Gold rate?"
 * replaced its steps with hers. A 0 is kept as written
 * (`isDrawn`), and an accept over a live version is a conflict that reopens the question instead. For an edit it is
 * the version the canvas opened, so a second change that landed in between is a conflict on Decide as well.
 */
export function proposalOf(d: Draft, fromVersion: number | null) {
  const id = `rule.${d.id}`;
  const title = d.name.trim() || d.id;
  return {
    question: fromVersion === null ? words.proposeNew(title) : words.proposeChange(title),
    body_kind: 'change' as const,
    body: {
      declaration_id: id,
      to: { id, kind: 'rule', body: bodyOf(d) },
      from_version: fromVersion ?? 0,
    },
  };
}

/** An id in the record's grammar, `[a-z][a-z0-9-]`, thirty-two at most, from whatever a person named it. */
export function idFrom(name: string): string {
  let id = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
  if (id === '') return 'automation';
  if (!/^[a-z]/u.test(id)) id = `r-${id}`;
  return id.slice(0, 32).replace(/-+$/u, '');
}

/**
 * A new automation's id, from its name, that is not one the record already has.
 *
 * A NAME TWO AUTOMATIONS SHARE WOULD BE A CHANGE TO THE FIRST. The proposal names `rule.<id>`, and a change to an id
 * that is installed is read as a new version of it. `taken` is only the automations the caller can read, though, so
 * this keeps a new one off the ids somebody could see, and `proposalOf`'s `from_version: 0` is what turns an accept
 * over one they could not see into a conflict rather than a replacement.
 */
export function freshId(name: string, taken: readonly string[]): string {
  /* `new` IS TAKEN BY THE ROUTE. `/automations/new` opens a blank draft, so a rule with that id could be filed and
     accepted and then never opened again from its own row on the list. */
  const held = [...taken, 'new'];
  const base = idFrom(name);
  if (!held.includes(base)) return base;
  for (let n = 2; ; n += 1) {
    const id = `${base.slice(0, 32 - String(n).length - 1)}-${n}`;
    if (!held.includes(id)) return id;
  }
}

/* ── editing one step's arguments ─────────────────────────────────────────── */

export const getAt = (step: unknown, path: readonly string[]): unknown =>
  path.reduce<unknown>((at, k) => (isObject(at) ? at[k] : undefined), step);

/** A copy of `step` with one argument set. A path through a value that is not an object replaces it with one. */
export function setAt<T>(step: T, path: readonly string[], value: unknown): T {
  if (path.length === 0) return value as T;
  const [head, ...tail] = path as [string, ...string[]];
  const base: Record<string, unknown> = isObject(step) ? step : {};
  return { ...base, [head]: setAt(base[head], tail, value) } as T;
}

/** A list argument as the inspector's text box holds it, one item a line, and back. Blank lines are not items. */
export const listText = (v: unknown): string => (Array.isArray(v) ? v.filter((x) => typeof x === 'string').join('\n') : '');
export const listFrom = (text: string): string[] =>
  text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

/**
 * `create`'s fields as `field: value` a line, and back. SPLIT ON THE FIRST COLON ONLY, because a value is a template
 * and may hold a time, `09:30`, or a sentence with a colon in it; a line with no colon is a field set to nothing.
 */
export const pairsText = (v: unknown): string =>
  isObject(v)
    ? Object.entries(v)
        .map(([k, x]) => `${k}: ${typeof x === 'string' ? x : JSON.stringify(x)}`)
        .join('\n')
    : '';
export function pairsFrom(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const cut = line.indexOf(':');
    const field = (cut < 0 ? line : line.slice(0, cut)).trim();
    if (field !== '') out[field] = cut < 0 ? '' : line.slice(cut + 1).trim();
  }
  return out;
}

/**
 * A chip put into a field at the caret, braces and all, and where the caret goes after it.
 *
 * CHIPS, NEVER TYPED BRACES (§6): a person picks `rate` from what the steps before can read, and the field holds
 * `{{vars.rate}}`, which is what `fill` reads at run time. Typing the braces by hand is how `{{var.rate}}` gets written
 * and quietly renders as a dash.
 */
export function withChip(value: string, start: number, end: number, chip: string): { value: string; caret: number } {
  const at = Math.max(0, Math.min(value.length, start));
  const to = Math.max(at, Math.min(value.length, end));
  const put = `{{${chip}}}`;
  return { value: value.slice(0, at) + put + value.slice(to), caret: at + put.length };
}

/* ── triggers, as the inspector offers them ───────────────────────────────── */

/** Every trigger the grammar has, in the order the inspector offers them. */
const ALL_TRIGGERS = ['written', 'arrival', 'every', 'metric', 'decided', 'manual'] as const;
export type TriggerKind = (typeof ALL_TRIGGERS)[number];

/**
 * The triggers a person can pick: every one the record installs and runs, read from the kernel's one table
 * (`capabilities.ts`, through `notInThisBuild`) rather than listed here. `metric` and `decided` were held back while the
 * lint refused them, since a choice that installs and is then refused on Decide teaches somebody the canvas cannot be
 * trusted; both run now, the table's rows say so, and this list follows the table without an edit.
 */
export const TRIGGER_KINDS: readonly TriggerKind[] = ALL_TRIGGERS.filter((k) => !notInThisBuild(false).triggers.includes(k));

export const triggerKind = (t: Trigger): string => Object.keys(t).find((k) => k !== 'at' && k !== 'day' && k !== 'month' && k !== 'late') ?? 'manual';

/**
 * A trigger of another kind, keeping the list it watched when it goes from a change to an arrival and back is moot.
 * A figure starts on crossing its own target, the one line every figure with a target already has.
 */
export function blankTrigger(kind: TriggerKind, was?: Trigger): Trigger {
  if (kind === 'written') return { written: { register: was && 'written' in was ? was.written.register : '' } };
  if (kind === 'arrival') return { arrival: {} };
  if (kind === 'every') return { every: '1h' };
  if (kind === 'metric') return { metric: { id: '', crosses: 'target' } };
  if (kind === 'decided') return { decided: {} };
  return { manual: true };
}

/** The spans a clock may run late by before a turn is skipped, offered as a choice. Absent is never skipped. */
export const LATE_SPANS = ['1h', '6h', '1d'] as const;

/** The clocks under a month, and the weekdays. Defined in `calendar.ts`, which says why. */
export { DAYS, EVERY };
export const CHANNELS = ['webhook', 'email', 'paste', 'api', 'pull'] as const;

/**
 * A clock with its time and day kept only where the record reads them: `at` on a day or a week, `day` on a week, and
 * a week given a time is given Monday, because the lint refuses a weekly time with no day.
 */
export function clockOf(every: string, at?: string, day?: string): Clock {
  const daily = every === '1d';
  const weekly = every === '1w';
  const time = (daily || weekly) && at ? { at } : {};
  const on = weekly && at ? { day: day ?? 'mon' } : {};
  return { every, ...time, ...on };
}

/* ── the step kinds, as the menu offers and the inspector edits them ──────── */

/**
 * What each verb is called where a person picks it. COPY, NOT THE GRAMMAR: which verbs are offered is the record's
 * answer, and a verb it holds that this table has no words for is offered by its id in words (`labelOf`).
 *
 * `if` IS "IF" AND NOT "ONLY IF". "Only if" is Zapier's word for a Filter, which stops the Zap, and the runner does not
 * stop: `plan` in `packages/kernel/src/flow.ts` walks the arm it took and then carries on down the parent list either
 * way. A person who picked "Only if" and added the next step under it in the main column believed that step was
 * guarded, and it ran every time.
 */
export const VERB_LABELS = {
  if: 'If',
  set_var: 'Remember a value',
  stop: 'Stop here',
  tag: 'Add a tag',
  untag: 'Take a tag off',
  set: 'Set a field',
  move: 'Move to a state',
  link: 'Link to another item',
  note: 'Add a note',
  create: 'Add items',
  meet: 'Meet a person',
  notify: 'Tell you',
  suggest: 'Suggest in Needs you',
  ask_person: 'Ask a person',
  ask_slash: 'Ask Slash',
  call: 'Call a service',
  run: 'Run a call on this item',
  script: 'Run a script',
  run_job: 'Start a job',
  wait: 'Wait',
  schedule: 'Come back later',
} as const satisfies Record<string, string>;

/** What a person calls a verb: its words here, or its id in words for one the record holds and this build does not word. */
export const labelOf = (verb: string): string => (Object.hasOwn(VERB_LABELS, verb) ? VERB_LABELS[verb as Verb] : idWords(verb));

/**
 * Verbs the record reads but refuses at install on this host, so the menu does not offer them.
 *
 * A FACT ABOUT THE HOST, NOT THE BUILD. `ask_slash` was a constant here, "not in this build", and since `eb1a131b` a
 * self-host with a model installs it: the record's `unserved` refuses the step only where the host has not said it
 * answers `infer.ask` (`slashAskAt` in `packages/kernel/src/flow-lint.ts`). So the canvas asks the flag the record
 * asks, `/api/version`'s `slash`, which the layout reads once for the tab.
 *
 * READ FROM THE KERNEL'S TABLE (`capabilities.ts`), which the lint, the runner and the agents' grammar read too, so a
 * row flipped there is offered here in the same change. Only whole verbs are menu entries; a row for one key of a step
 * (`ask_person.to`) is not.
 */
export const notYet = (slash: boolean, g: FlowGrammar | null = held()): readonly Verb[] => {
  const verbs = verbsOf(g);
  return notInThisBuild(slash).steps.filter((s): s is Verb => (verbs as readonly string[]).includes(s));
};

/** §6's five shelves, in the order the menu draws them. */
export const SHELVES = ['Check', 'Change', 'Ask', 'Call out', 'Wait'] as const;
export type Shelf = (typeof SHELVES)[number];

/**
 * Which shelf a verb sits on in the menu. COPY: where a person looks for it, not what the record holds. A verb with no
 * shelf here goes by the grammar's group, an action to Change and a step's own verb to Call out.
 *
 * SLASH AFTER A PERSON in the Ask group, where a model is: a person is the answer that works on every host, and the
 * fault on a host with none sends somebody there. The order of this table is the order within a shelf.
 */
const SHELF: Partial<Record<Verb, Shelf>> = {
  if: 'Check',
  set_var: 'Check',
  stop: 'Check',
  tag: 'Change',
  untag: 'Change',
  set: 'Change',
  move: 'Change',
  link: 'Change',
  note: 'Change',
  create: 'Change',
  meet: 'Change',
  notify: 'Ask',
  suggest: 'Ask',
  ask_person: 'Ask',
  ask_slash: 'Ask',
  call: 'Call out',
  run: 'Call out',
  script: 'Call out',
  run_job: 'Call out',
  wait: 'Wait',
  schedule: 'Wait',
};

/**
 * EVERY STEP THE GRAMMAR HOLDS, on its shelf, less what this host refuses at install. A shelf with nothing on it is
 * left out, so over an older record there is nothing to draw at all.
 */
export function stepGroups(slash: boolean, g: FlowGrammar | null = held()): readonly { label: Shelf; verbs: readonly Verb[] }[] {
  const refused = notYet(slash, g);
  const order = Object.keys(SHELF);
  const rank = (v: string) => (order.includes(v) ? order.indexOf(v) : order.length);
  const shelfOf = (s: GrammarStep): Shelf => SHELF[s.verb as Verb] ?? (s.group === 'action' ? 'Change' : 'Call out');
  const offered = (g?.steps ?? []).filter((s) => !refused.includes(s.verb as Verb));
  return SHELVES.map((label) => ({
    label,
    verbs: offered
      .filter((s) => shelfOf(s) === label)
      .map((s) => s.verb as Verb)
      .sort((a, b) => rank(a) - rank(b)),
  })).filter((shelf) => shelf.verbs.length > 0);
}

/**
 * What each step does, in one line, for the step menu's sheet on a phone, where a label alone ("Come back later",
 * "Run a call on this item") leaves a stranger guessing. Said as the runner does it (`packages/kernel/src/flow.ts`), and
 * the search in the sheet reads these words as well as the label.
 */
export const STEP_HELP: Partial<Record<Verb, string>> = {
  if: 'Take one of two ways, depending on a condition.',
  set_var: 'Keep a value under a name, for later steps to use.',
  stop: 'End the run here, and do nothing after.',
  tag: 'Put a tag on it.',
  untag: 'Take a tag off it.',
  set: 'Write a value into one of its fields.',
  move: 'Move it to another state.',
  link: 'Point one of its fields at an item in another list.',
  note: 'Write a note on it.',
  create: 'Add new items to a list.',
  meet: 'Add someone to People, or say where you met someone already there.',
  notify: 'Send you a message.',
  suggest: 'Put a question in Needs you for you to answer.',
  ask_person: 'Ask a person and wait for the answer.',
  ask_slash: 'Ask Slash a question and keep its answer.',
  call: 'Fetch from a service you declared, and keep what it answers.',
  run: 'Send it to a service you declared.',
  script: 'Start one of your scripts.',
  run_job: 'Start a job you approved, on your own machine.',
  wait: 'Pause, then carry on with the next step.',
  schedule: 'Put a reminder on it for a later day.',
};

/** The line under a verb in the menu, or none for a verb this build has no words for. */
export const helpOf = (verb: string): string => STEP_HELP[verb as Verb] ?? '';

/**
 * One argument as the inspector draws it: the grammar's argument (`name`, `required`, `from`) with this build's words.
 *
 * `text` is one line, `long` is a paragraph, `name` is an answer's name, `span` is a wait in the clock grammar,
 * `later` is a `schedule` span in the Keychain's grammar (where `m` is a month), `list` is one item a line, `pairs` is
 * `field: value` a line, and `condition` is a `where` sentence. `template` marks the ones that read `{{…}}`, which the
 * inspector offers as chips rather than asking anybody to type braces.
 *
 * `shape` is what Slash's answer has to be, picked from `SLASH_SHAPES`, and `fields` is some of the run's row's
 * fields, picked from the list's own. `when` says the argument means something only while the step holds something
 * else: `choices` is refused by the lint on an answer that is not a choice, so it is drawn only for one. `from` is
 * what the record says the value is picked from, so a picker offers names and never asks for an id.
 */
export type ArgKind = 'text' | 'long' | 'name' | 'number' | 'span' | 'later' | 'list' | 'pairs' | 'condition' | 'shape' | 'fields';
type ArgBase = {
  name: string;
  path: readonly string[];
  label: string;
  kind: ArgKind;
  template?: boolean;
  hint?: string;
  from?: ArgFrom | string;
  when?: (step: Step) => boolean;
};
/**
 * A REQUIRED ARGUMENT CARRIES THE SENTENCE ITS ABSENCE SAYS. The fault was assembled, `${verb} needs ${label}.`, and
 * said "Tell you needs say."; a label names a field, and does not also make a sentence with a verb's name in front.
 */
export type Arg = (ArgBase & { required?: false }) | (ArgBase & { required: true; missing: string });

/** The words for one argument: everything the grammar does not say. `start` is what a new step begins with. */
type ArgWords = { label: string; kind?: ArgKind; template?: true; hint?: string; missing?: string; when?: (step: Step) => boolean; start?: unknown };

/** One sentence, for every step that keeps an answer, because the reason to name it is the same each time. */
const NAME_IT = 'Name the answer, so later steps can use it.';

/**
 * The example shown wherever a condition is written in words: a branch's "Only when" and the trigger's.
 *
 * IT SHOWS A NUMBER COMPARED, because that is the test a person reaches for first. One constant, so the two fields
 * cannot drift apart again.
 */
export const CONDITION_HINT = 'amount is more than USD 500, due before today';

/**
 * THE WORDS FOR EACH ARGUMENT, by verb and by the grammar's argument name. COPY: which arguments a step has, and which
 * are required, is the grammar's. A name the record holds and this table does not word is drawn from its type and its
 * name in words (`argOf`), so `meet` and `run_job` would have had forms before a word was written for them.
 */
const ARG_WORDS: Partial<Record<Verb, Record<string, ArgWords>>> = {
  if: { if: { label: 'Only when', kind: 'condition', missing: 'Write what has to be true for this branch.', hint: CONDITION_HINT, start: '' } },
  set_var: { name: { label: 'Call it', kind: 'name', missing: 'Name the value, so later steps can use it.' }, to: { label: 'Value', template: true, start: '' } },
  tag: { tag: { label: 'Tag', missing: 'Say which tag to add.' } },
  untag: { untag: { label: 'Tag', missing: 'Say which tag to take off.' } },
  set: { field: { label: 'Field', missing: 'Say which field to set.' }, to: { label: 'To', template: true, start: '' } },
  move: { move: { label: 'To the state', missing: 'Say which state to move it to.' } },
  link: {
    field: { label: 'Field', missing: 'Say which field holds the link.' },
    'to.register': { label: 'In the list', missing: 'Say which list the other item is in.' },
    'to.by': { label: 'Matched by the field', missing: 'Say which field finds the other item.' },
    'to.value': { label: 'Equal to', missing: 'Say what that field has to be.', template: true },
  },
  note: { note: { label: 'Note', kind: 'long', missing: 'Write the note.', template: true } },
  create: {
    register: { label: 'In the list', missing: 'Say which list the new items go in.' },
    bound: { label: 'At most this many', kind: 'number', missing: 'Say how many it may add at most.', start: 1 },
    fields: { label: 'Fields', kind: 'pairs', template: true, hint: 'title: Chase the invoice', start: {} },
  },
  meet: {
    name: { label: 'Their name', template: true },
    email: { label: 'Their email', template: true },
    handle: { label: 'Their handle', template: true },
    keys: { label: 'Known by', kind: 'list', template: true, hint: 'One a line, such as bank: and the words on the statement' },
    kind: { label: 'A person or an organisation', hint: 'person' },
    org: { label: 'Their organisation', template: true },
    domain: { label: 'Their web address', template: true },
    role: { label: 'Their role', template: true },
    where: { label: 'Where you met them', kind: 'long', template: true, missing: 'Say where they were met.' },
    source: { label: 'Where this came from', template: true },
    only: { label: 'Only someone already known', hint: 'known' },
  },
  notify: { say: { label: 'Say', kind: 'long', missing: 'Say what to tell you.', template: true } },
  suggest: {
    question: { label: 'Question', kind: 'long', missing: 'Write the question to put in Needs you.', template: true },
    options: { label: 'Answers', kind: 'list', missing: 'Give at least one answer to choose from.', start: ['Yes', 'No'] },
  },
  ask_person: {
    question: { label: 'Question', kind: 'long', missing: 'Write the question to ask.', template: true },
    options: { label: 'Answers', kind: 'list', missing: 'Give at least one answer to choose from.', start: ['Yes', 'No'] },
    /* LEFT OUT, the question is the owner's to answer, as it always was. Picked from the record's members. */
    to: { label: 'Put it to' },
    as: { label: 'Keep the answer as', kind: 'name', missing: NAME_IT },
    wait: { label: 'Wait at most', kind: 'span', hint: '7d' },
  },
  ask_slash: {
    question: { label: 'Question', kind: 'long', missing: 'Write the question for Slash.', template: true },
    shape: { label: 'The answer is', kind: 'shape' },
    choices: { label: 'Slash picks one of', kind: 'list', hint: 'One a line', when: (s) => slashShape(s) === 'choice' },
    about: { label: 'Send these fields with it', kind: 'fields' },
    as: { label: 'Keep the answer as', kind: 'name', missing: NAME_IT },
  },
  call: { ingest: { label: 'The declared call', missing: 'Say which call to make.', hint: 'exchange_rate' }, as: { label: 'Keep the answer as', kind: 'name' } },
  run: { run: { label: 'The declared call', missing: 'Say which call to run on this item.' } },
  /* A SCRIPT STEP KEEPS NO ANSWER: `as:` holds the id of the job it queued (`startScript`), so it is not "the answer". */
  script: { id: { label: 'The script', missing: 'Say which script to run.' }, as: { label: 'Call its run', kind: 'name' } },
  run_job: {
    kind: { label: 'The job', missing: 'Say which job to start.' },
    args: { label: 'What it hands the job', kind: 'pairs', template: true, hint: 'week: this one', start: {} },
    as: { label: 'Call its run', kind: 'name' },
  },
  wait: { wait: { label: 'For', kind: 'span', missing: 'Say how long to wait.', hint: '2h', start: '1h' } },
  schedule: {
    in: { label: 'In', kind: 'later', missing: 'Say when to come back.', hint: '14d', start: '1d' },
    note: { label: 'Note', missing: 'Write what to come back to.', template: true },
  },
};

/** The kind an argument is drawn as when its words do not say: by the grammar's type. */
function kindOfType(type: string): ArgKind {
  if (type === 'number' || type === 'integer' || type === 'count') return 'number';
  if (type === 'list' || type.startsWith('list')) return 'list';
  if (type === 'map' || type === 'pairs' || type === 'object' || type === 'record') return 'pairs';
  if (type === 'span' || type === 'name' || type === 'condition' || type === 'long' || type === 'later' || type === 'shape' || type === 'fields') return type;
  return 'text';
}

/** Where an argument sits in a step: under the verb's key, at its dotted name, or the verb's value itself. */
export function argPath(verb: string, name: string): string[] {
  const parts = name.split('.').filter((p) => p !== '');
  /* A BRANCH'S `then` AND `else` SIT BESIDE `if` AT THE STEP'S ROOT (the kernel's names are paths from the root), so they
     are never put under the verb's key. */
  if (verb === 'if' && (parts[0] === 'then' || parts[0] === 'else')) return parts;
  if (parts[0] === verb) parts.shift();
  return [verb, ...parts];
}

/** One grammar argument, worded. */
function argOf(verb: Verb, a: GrammarArg): Arg {
  const w = ARG_WORDS[verb]?.[a.name];
  const label = w?.label ?? idWords(a.name.split('.').pop() ?? a.name);
  const base: ArgBase = {
    name: a.name,
    path: argPath(verb, a.name),
    label,
    kind: w?.kind ?? kindOfType(a.type),
    ...(w?.template ? { template: true } : {}),
    ...(w?.hint !== undefined ? { hint: w.hint } : {}),
    ...(a.from !== undefined ? { from: a.from } : {}),
    ...(w?.when ? { when: w.when } : {}),
  };
  return a.required ? { ...base, required: true, missing: w?.missing ?? notPicked(label) } : base;
}

/** The hint for a required argument this build has no sentence for. */
const notPicked = (label: string): string => `${label} is not picked yet.`;

/** A step's arguments as the inspector draws them, in the grammar's order. None for a verb the grammar does not hold. */
export const argsFor = (verb: Verb, g: FlowGrammar | null = held()): Arg[] =>
  (grammarStep(verb, g)?.args ?? []).filter((a) => !arm(verb, a.name)).map((a) => argOf(verb, a));

/**
 * A BRANCH'S `then` AND `else` ARE ITS ARMS, drawn as the cards under "If so" and "If not" and held on the card's node
 * (`nodesOf`), never as a box to fill. Read as arguments, the required `then` was looked for on the `if` step it had
 * been taken off, so every saved branch said "Then is not picked yet." in red over a rule that ran (audit 6g, AG3). A
 * branch with nothing under it is the record's to say (`checkAutomation`).
 */
const arm = (verb: Verb, name: string): boolean => verb === 'if' && (name === 'then' || name === 'else');

/**
 * `ARGS[verb]`, READ FROM THE TAB'S GRAMMAR AT EACH LOOK, for the inspector, which indexes it. It holds nothing of its
 * own: every read is `argsFor(verb)`.
 */
export const ARGS: Readonly<Record<Verb, readonly Arg[]>> = new Proxy({} as Record<Verb, readonly Arg[]>, {
  get: (_, verb) => (typeof verb === 'string' ? argsFor(verb as Verb) : undefined),
  has: (_, verb) => typeof verb === 'string' && grammarStep(verb) !== undefined,
  ownKeys: () => verbsOf(),
  getOwnPropertyDescriptor: (_, verb) =>
    typeof verb === 'string' && grammarStep(verb) !== undefined ? { enumerable: true, configurable: true, value: argsFor(verb as Verb) } : undefined,
});

/** What an argument starts as in a new step, when it has to be there: its words' start, or empty by its type. */
function startOf(verb: Verb, a: GrammarArg): unknown {
  const w = ARG_WORDS[verb]?.[a.name];
  if (w && 'start' in w) return w.start;
  const kind = w?.kind ?? kindOfType(a.type);
  if (kind === 'list') return [];
  if (kind === 'pairs') return {};
  if (kind === 'number') return 0;
  if (a.type === 'boolean' || a.type === 'true') return true;
  return '';
}

/**
 * A new step of one kind, with the arguments it needs present and empty, so the inspector has something to fill:
 * every required one, and an optional one only where its words give it a start. A step that takes nothing is `true`.
 *
 * NO EMPTY OPTIONAL NAME. A step nobody opened keeps what it was born with, and the lint refuses '' as a name where it
 * takes no `as` at all, so `{ script: { id: '' } }` is born with no `as`.
 */
export function blankStep(verb: Verb, g: FlowGrammar | null = held()): Step {
  const args = grammarStep(verb, g)?.args ?? [];
  if (args.length === 0) return { [verb]: true };
  const own = args.find((a) => argPath(verb, a.name).length === 1);
  if (own) return { [verb]: startOf(verb, own) };
  let step: Step = { [verb]: {} };
  for (const a of args) {
    const w = ARG_WORDS[verb]?.[a.name];
    if (a.required || (w && 'start' in w)) step = setAt(step, argPath(verb, a.name), startOf(verb, a));
  }
  return step;
}

/* ── what Slash answers, and what goes with the question ──────────────────── */

/** The shapes the lint takes for `ask_slash.shape` (`flow-lint.ts`, `SHAPES`), in the order the inspector draws them. */
export const SLASH_SHAPES = ['text', 'number', 'choice'] as const;
export type SlashShape = (typeof SLASH_SHAPES)[number];

export const SLASH_SHAPE_WORDS: Record<SlashShape, string> = { text: 'Words', number: 'A number', choice: 'One of a list' };

/** An `ask_slash` step's own object, or an empty one for a step written wrong, which the lint names. */
const specOf = (step: Step): Record<string, unknown> => {
  const spec = getAt(step, ['ask_slash']);
  return spec !== null && typeof spec === 'object' && !Array.isArray(spec) ? (spec as Record<string, unknown>) : {};
};

/** The shape an `ask_slash` step asks for. None written is text, as the runner reads it (`packages/kernel/src/flow.ts`). */
export function slashShape(step: Step): SlashShape {
  const s = getAt(step, ['ask_slash', 'shape']);
  return s === 'number' || s === 'choice' ? s : 'text';
}

/**
 * The step asking for another shape.
 *
 * THE CHOICES GO WITH A CHOICE. The lint refuses `choices` on an answer that is not a choice, so a step switched from
 * "One of a list" to "A number" would fault on a field the inspector no longer draws. Text is written by leaving
 * `shape` out, the runner's own default, so a step that never asked for anything else reads as it always did.
 */
export function withSlashShape(step: Step, shape: SlashShape): Step {
  const { shape: _was, choices, ...rest } = specOf(step);
  const kept = shape === 'choice' && choices !== undefined ? { choices } : {};
  return { ...step, ask_slash: { ...rest, ...(shape === 'text' ? {} : { shape }), ...kept } };
}

/** The fields an `ask_slash` step sends with its question, in the order written. */
export function slashAbout(step: Step): string[] {
  const about = getAt(step, ['ask_slash', 'about']);
  return Array.isArray(about) ? about.filter((f): f is string => typeof f === 'string') : [];
}

/** The step with `field` sent, or no longer sent. An emptied list is left out, since the lint refuses `about: []`. */
export function toggleSlashAbout(step: Step, field: string): Step {
  const had = slashAbout(step);
  const next = had.includes(field) ? had.filter((f) => f !== field) : [...had, field];
  const { about: _was, ...rest } = specOf(step);
  return { ...step, ask_slash: next.length === 0 ? rest : { ...rest, about: next } };
}

/**
 * The fields of a list that may go with a question to Slash: all but a secret or a file, or a list of either, which
 * never leave the record.
 *
 * WRITTEN HERE AND NOT IMPORTED, because `@braindog/kernel` does not export `UNSENDABLE` (`flow-lint.ts`). The lint
 * refuses such a field in `about:` all the same, so this only keeps the picker from offering what Decide would refuse.
 */
export function slashSendable(fields: readonly { id: string; type: string; of?: string }[]): string[] {
  const sealed = (t: string | undefined) => t === 'secret' || t === 'file';
  return fields.filter((f) => !sealed(f.type) && !sealed(f.of)).map((f) => f.id);
}

/* ── what a card says ─────────────────────────────────────────────────────── */

const COUNT_WORDS = ['none', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
/** A small count as a word, as a sentence says one; a larger one as its figure. */
const countWord = (n: number): string => COUNT_WORDS[n] ?? String(n);

export const words = {
  heading: 'Automations',
  newOne: 'New automation',
  untitled: 'Untitled automation',
  /* A TITLE, SO NO FULL STOP, as the design system already made Search and Decide. */
  none: 'Nothing runs on its own yet',
  noneWhy: 'An automation starts on a change, an arrival, a clock or a button, and then does its steps in order.',
  absent: 'This BrainDog does not list its automations yet',
  absentHow: 'You can still draw one and send it to Needs you.',
  steps: 'Steps',
  runs: 'Runs',
  written: 'As written',
  addStep: 'Add a step',
  addHere: 'Add a step here',
  findStep: 'Find a step',
  noStep: 'No step matches those words.',
  then: 'If so',
  otherwise: 'If not',
  /* WHERE THE COLUMN RESUMES UNDER A BRANCH, because a step there runs whichever arm was taken, and nothing on the
     canvas said so while the branch was called "Only if". `FlowList.svelte` draws it. */
  eitherWay: 'Then, either way',
  edit: 'Edit',
  remove: 'Remove',
  moveUp: 'Move up',
  moveDown: 'Move down',
  moveIn: 'Move into the branch',
  moveOut: 'Move out of the branch',
  drag: (said: string) => `Drag to move: ${said}`,
  moreFor: (said: string) => `More for: ${said}`,
  save: 'Send to Needs you',
  saving: 'Sending',
  discard: 'Discard changes',
  runNow: 'Run now',
  ran: 'It runs now. The run shows here once it has started.',
  cancel: 'Stop this run',
  cancelled: 'That run is stopped.',
  name: 'Name',
  trigger: 'Starts',
  condition: 'Only when',
  inline: 'Runs inside the change that starts it.',
  asRun: 'Runs after what starts it, one step at a time.',
  /* SAID ONLY WHEN AN EDIT IS ABOUT TO MOVE IT, by the new path. Which path a rule runs on matters to its timing and its
     history and to nobody choosing what to automate, and the two lines above were printed on the trigger card, in the
     trigger's sheet and on every row of the list. */
  pathChange: {
    inline: 'Once sent, it runs inside the change that starts it, rather than one step at a time after it.',
    run: 'Once sent, it runs after what starts it, one step at a time, rather than inside the change.',
  } as Record<'inline' | 'run', string>,
  filed: 'Sent to Needs you. It runs once you accept it there.',
  openDecide: 'Open it in Needs you',
  faults: 'Before it can be sent',
  insideItself: 'A branch cannot go inside itself.',
  /* THE CEILING IS THE GRAMMAR'S, said as a word: the copy said "three" while the number was kept beside it by hand. */
  tooDeep: (most: number) => `Branches go ${countWord(most)} deep at most, and this would make ${countWord(most + 1)}.`,
  alreadyFirst: 'It is already first here.',
  alreadyLast: 'It is already last here.',
  noBranchBeside: 'There is no branch next to it to move into.',
  notInBranch: 'It is not inside a branch.',
  proposeNew: (name: string) => `Add the automation ${name}?`,
  proposeChange: (name: string) => `Save the changes to the automation ${name}?`,
  lastRun: (at: string, state: string) => `Last run ${at}, ${state}.`,
  /* ONLY FOR ONE THE RECORD COUNTS RUNS OF. An automation that runs inside the change that starts it keeps no run, so
     the record answers no last run for it however often it has run, and all eighteen on a busy record read "Not run
     yet" while Activity listed what they had done that morning. Those say when the log last has them (`lastActed`), or
     that it has nothing from them lately (`quiet`), and this line is left for one that has a run to wait for. */
  neverRun: 'Not run yet.',
  lastActed: (at: string) => `Last ran ${at}.`,
  quiet: 'Has done nothing lately.',
  nextRun: (at: string) => `Next run ${at}.`,
  off: 'Turned off.',
  reads: 'It can read',
  chipInsert: (chip: string) => `Put ${chip} in`,
  runState: {
    pending: 'waiting to start',
    running: 'running',
    waiting: 'waiting',
    done: 'done',
    failed: 'failed',
    cancelled: 'stopped',
  } as Record<string, string>,
  noRuns: 'No runs yet',
  kinds: {
    written: 'A change',
    arrival: 'An arrival',
    every: 'A clock',
    metric: 'A figure',
    decided: 'A decision',
    manual: 'A button',
  } as Record<string, string>,
  triggerHelp: {
    written: 'Something in one list is added, changed or deleted.',
    arrival: 'Something arrives at a door: a webhook, an email, a paste.',
    every: 'On a clock, every fifteen minutes or longer.',
    metric: 'A figure crosses a line. It is read every hour.',
    decided: 'A question in Needs you is answered.',
    manual: 'Only when somebody presses Run now.',
  } as Record<string, string>,
  /* THE INSPECTOR'S OWN WORDS for the triggers and pickers the inspector adds, beside the ones above so the sheet reads one
     object. Sentence case, no full stop on a label or a button. */
  inspect: {
    figure: 'The figure',
    pickFigure: 'Pick a figure',
    crosses: 'Starts when it',
    crossTarget: 'Crosses its target',
    crossUp: 'Reaches',
    crossDown: 'Falls to',
    line: 'The line',
    lineHelp: 'In the figure’s own units. An amount of money is in its smallest unit, cents or pence.',
    about: 'A question from',
    anyQuestion: 'Any question',
    option: 'Only when the answer is',
    anyAnswer: 'Any answer',
    optionHelp: 'The answer’s words, exactly as the question offers them.',
    late: 'If it runs late',
    neverLate: 'Run it however late',
    lateBy: (span: string) => `Skip it when more than ${span} late`,
    lateHelp: 'A skipped turn is kept in the runs with the reason.',
    owner: 'The owner',
    pickScript: 'Pick a script',
    pickMember: 'Pick a person',
    newCall: 'Declare a new call',
    newCallHelp: 'A call you declare shows here once it is accepted.',
    fieldName: 'Field',
    fieldAdd: 'Add a field',
    fieldRemove: 'Take it out',
    aboutHelp: 'Slash reads only the fields picked here. A secret or a file never goes with a question.',
    aboutNone: 'Nothing to send. Only a run about one item, one a change to a list starts, has fields to go with the question.',
    asRows: 'Edit as conditions',
    asWords: 'Write it in words',
    relativeDay: 'It names a day relative to today, which conditions would fix to one date. Keep it in words.',
    notRows: 'These words cannot be drawn as conditions. Keep them in words.',
  },
} as const;

const UNITS: Record<string, [string, string]> = { m: ['minute', 'minutes'], h: ['hour', 'hours'], d: ['day', 'days'], w: ['week', 'weeks'] };

/** `2h` as a person says it. The clock grammar, where `m` is minutes. Anything else is printed as written. */
export function spanWords(span: string): string {
  const m = /^(\d+)\s*([mhdw])$/u.exec(span.trim());
  if (!m) return span;
  const n = Number(m[1]);
  const unit = UNITS[m[2]!]!;
  return `${n} ${n === 1 ? unit[0] : unit[1]}`;
}

/** A `schedule` span, in the Keychain's grammar, where `m` is a month and `y` a year. */
function laterWords(span: string): string {
  const m = /^(\d+)\s*([dwmy])$/u.exec(span.trim());
  if (!m) return span;
  const n = Number(m[1]);
  const unit = { d: ['day', 'days'], w: ['week', 'weeks'], m: ['month', 'months'], y: ['year', 'years'] }[m[2] as 'd' | 'w' | 'm' | 'y'];
  return `${n} ${n === 1 ? unit[0] : unit[1]}`;
}

/** `{{vars.rate}}` read aloud as `rate`. A card never shows braces; the inspector shows them as chips. */
export const unbrace = (text: string): string => text.replace(/\{\{\s*([^}]+?)\s*\}\}/gu, (_, path: string) => chipWord(path));

const str = (v: unknown): string => (typeof v === 'string' ? unbrace(v.trim()) : typeof v === 'number' ? String(v) : '');

/*
 * A REFERENCE IS MARKED WHILE A SENTENCE IS BUILT, AND CUT OUT AFTER. `unbrace` read `{{vars.rate}}` as `rate` and the
 * card printed it in the running text, so the sample said "Tell you: Gold is rate a gram" and "Ask you: File body as
 * spending?". Every case in `saying` keeps its words; only the value it reads is
 * marked, with two control characters no template holds, and `sayParts` splits on them.
 */
const OPEN = '\u0002';
const SHUT = '\u0003';
const MARKED = /\u0002([^\u0003]*)\u0003/gu;
const mark = (text: string): string => text.replace(/\{\{\s*([^}]+?)\s*\}\}/gu, (_, path: string) => `${OPEN}${path}${SHUT}`);
const aloud = (v: unknown): string => (typeof v === 'string' ? mark(v.trim()) : typeof v === 'number' ? String(v) : '');
const withText = (lead: string, text: string): string => (text === '' ? lead : `${lead}: ${text}`);

/* ── names, never ids ─────────────────────────────────────────────────────── */

/**
 * WHAT A PERSON CALLS A FIELD: its declared label, in the list named or else any list this tab has learnt that declares
 * it, and its id in words where none does. The canvas said "filing_rules whose match is counterparty_text" and "only
 * when filed_by is empty": the record's ids, where the lists already say "Filing rules", "Matches" and "As the bank
 * wrote it" (UI pass 20 Oct, names never ids).
 */
export function fieldName(id: string, register?: string): string {
  const own = register ? REGISTERS[register]?.fields.find((f) => f.id === id) : undefined;
  const any = own ?? Object.values(REGISTERS).map((r) => r.fields.find((f) => f.id === id)).find((f) => f !== undefined);
  const label = any?.label?.trim();
  return label ? label : id.replace(/[_-]+/gu, ' ');
}

/**
 * Every list an automation's body names (`register:` anywhere in it: the trigger, a link's target, a create), so a
 * screen can learn their declarations before it draws the sentences that name their fields.
 */
export function listsIn(body: unknown): string[] {
  const out = new Set<string>();
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) for (const x of v) walk(x);
    else if (v !== null && typeof v === 'object')
      for (const [k, x] of Object.entries(v)) {
        if (k === 'register' && typeof x === 'string' && /^[a-z][a-z0-9_]*$/u.test(x)) out.add(x);
        else walk(x);
      }
  };
  walk(body);
  return [...out];
}

/** A field's name inside a sentence: its first letter lower case, unless the name is an initialism ("VAT"). */
const fieldSaid = (id: string, register?: string): string => {
  const name = fieldName(id, register);
  return /^[A-Z][A-Z]/u.test(name) ? name : name.charAt(0).toLowerCase() + name.slice(1);
};

/**
 * A field's name as the list shows it, first letter up: what a start and its condition say (VERIFY H30), "only when
 * Account changes, Account is set and Book is empty", so a field reads as a field and never as a word of the sentence.
 */
const fieldNamed = (id: string, register?: string): string => {
  const name = fieldName(id, register);
  return name.charAt(0).toUpperCase() + name.slice(1);
};

/** One item of a list, as a sentence says it: "the filing rule". The list's own singular, else its id in words. */
const oneOf = (register: string): string => {
  const one = REGISTERS[register]?.one?.trim() || singularOf(REGISTERS[register]?.name?.trim() || register.replace(/[_-]+/gu, ' '));
  return /^[A-Z][A-Z]/u.test(one) ? one : one.charAt(0).toLowerCase() + one.slice(1);
};

/** The ids with an underscore in a condition as written ("filed_by is empty"), said as their fields' names. A
    reference in braces is left whole, for `mark` to make a chip of. */
const idsSaid = (text: string, register?: string): string =>
  text
    .split(/(\{\{[^}]*\}\})/u)
    .map((part) =>
      part.startsWith('{{')
        ? part
        : part
            /* THE FIELD EACH CLAUSE OPENS WITH, when the list declares it: "state is on" under a trigger that said
               "status changes" is the same field said two ways. */
            .replace(/(^|,\s*|\s(?:and|or)\s)([a-z][a-z0-9_]*)(?=\s)/gu, (whole, lead: string, id: string) =>
              register && REGISTERS[register]?.fields.some((f) => f.id === id) ? `${lead}${fieldNamed(id, register)}` : whole,
            )
            .replace(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/gu, (id) => fieldSaid(id, register)),
    )
    .join('');

/**
 * A reference as a card names it: `{{counterparty_text}}`, the item's own field, by its name; `{{vars.rate}}` as `rate`.
 *
 * AND A FORM BY WHAT IT STANDS FOR (audit 6g, AG3). A chip read `short:amount`, `on:due`, `ago:due` and
 * `short:amount paid so far`, and "Set chasing since to day" stood for the day the run started: now "the amount", "the
 * due day", "how long ago", "the amount less Paid so far" and "the day it ran", so a chip reads as what goes there.
 */
const refText = (path: string): string => {
  const p = path.trim();
  const said = TRIGGER_SAID[p];
  if (said !== undefined) return said;
  /* A PATH'S LAST NAME AS A FIELD IS SAID (leftovers8): "meet from_name: mail from from_domain" put the mail's own keys
     on screen. A field of the row by its label, anything else in words. */
  const named = PATH_WORDS[p];
  if (named !== undefined) return `the ${named}`;
  if (p.includes('.')) return fieldSaid(p.split('.').pop() ?? p);
  const form = /^([a-z]+):(.+)$/u.exec(p);
  if (form === null) return fieldName(p);
  const [, kind, rest] = form as unknown as [string, string, string];
  const [first = rest, less] = rest.split('-');
  const name = fieldSaid(first);
  switch (kind) {
    case 'money':
    case 'short':
      return less === undefined ? `the ${name}` : `the ${name} less ${fieldSaid(less)}`;
    case 'on':
      return /\b(?:day|date)\b/iu.test(name) ? `the ${name}` : `the ${name} day`;
    case 'ago':
      return 'how long ago';
    case 'until':
      return 'how long until then';
    case 'pct':
      return `the ${name} as a share`;
    default:
      return `the ${name}`;
  }
};

/** What a run hands every step, as a card says it. */
const TRIGGER_SAID: Readonly<Record<string, string>> = {
  'trigger.day': 'the day it ran',
  'trigger.option': 'the answer',
  'trigger.at': 'when it ran',
};
const andList = (items: readonly string[], joint = 'and'): string =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} ${joint} ${items[items.length - 1]}`;
const cap = (s: string): string => (s === '' ? s : s[0]!.toUpperCase() + s.slice(1));

/* ── conditions ───────────────────────────────────────────────────────────── */

/**
 * The tests a number is compared with, in words, and the predicate operator each writes.
 *
 * THE SENTENCE READS THESE WORDS, AND THIS COMMENT ONCE SAID IT COULD NOT. It said `packages/where/src/sentence.ts`
 * read is, before, after, empty, set, has and lacks and nothing that orders, which was true until `3187be5a` taught it
 * more than, at least, less than, at most and between, taking `is` before each or leaving it out. Those four words are
 * these four, so what a card says a leaf is, "rate is more than 70", reads back through the record as that same leaf:
 * `flow-words.test.ts` lists a real record's rows by each and holds them to one list.
 *
 * SO THE "A NUMBER" BUILDER IS A PICKER NOW, NOT THE ONLY WAY TO ASK. It still writes the leaf,
 * `{ field: rate, gt: 70 }`, because it chooses the field from the answers and fields a step can read and a tree needs
 * no name typed right, and the runner's `test` (`packages/kernel/src/flow.ts`) reads the leaf and the sentence through
 * one schema, where an answer holding a number is a decimal. Measured over `parseWhere`: over an answer
 * held as text, "rate is more than 70" is an `is` of the whole phrase and the leaf is a `gt` on a text, and both answer
 * false, so the two forms do not disagree about a run. `between` is in the sentence and not here, since the builder has
 * one value box and a range needs two.
 */
export const COMPARE = [
  { op: 'gt', said: 'is more than' },
  { op: 'gte', said: 'is at least' },
  { op: 'lt', said: 'is less than' },
  { op: 'lte', said: 'is at most' },
  { op: 'is', said: 'is' },
] as const;
export type CompareOp = (typeof COMPARE)[number]['op'];

/** A condition that is one numeric test on one field, as the builder edits it, or `null` for anything else. */
export function leafOf(cond: unknown): { field: string; op: CompareOp; value: number } | null {
  if (!isObject(cond) || typeof cond.field !== 'string') return null;
  const keys = Object.keys(cond).filter((k) => k !== 'field');
  if (keys.length !== 1) return null;
  const op = COMPARE.find((c) => c.op === keys[0]);
  const value = cond[keys[0]!];
  return op && typeof value === 'number' ? { field: cond.field, op: op.op, value } : null;
}

export const leafTo = (field: string, op: CompareOp, value: number): Record<string, unknown> => ({ field, [op]: value });

/** A condition in words: a sentence as written, a numeric leaf in the builder's words, and a tree as what it is. */
export function sayCondition(cond: unknown, register?: string): string {
  return unmark(conditionWords(cond, register));
}

/**
 * A TYPED VALUE IN A WRITTEN CONDITION BY ITS LABEL (polish-j PJ3), as a tree's leaf says one (`valueSaid`): Money's
 * chase read "Status is open or part" and "Which way is owed to me", the values as the sentence spells them, where the
 * list shows "Part paid" and "Money in". Only a clause `<field> is [not] <value> [or <value>…]` over a field of the
 * list that labels its values, and only when every value is one of them; anything else is left as written.
 */
const valuesSaid = (text: string, register?: string): string => {
  const fields = register ? REGISTERS[register]?.fields : undefined;
  if (!fields?.some((f) => f.labels !== undefined)) return text;
  return text
    .split(/(\{\{[^}]*\}\}|,\s*(?:or\s+)?|\s+and\s+)/u)
    .map((part) => {
      const m = /^(\s*)([a-z][a-z0-9_]*)(\s+is(?:\s+not)?\s+)(\S.*?)(\s*)$/u.exec(part);
      if (m === null) return part;
      const [, lead, id, verb, rest, tail] = m as unknown as [string, string, string, string, string, string];
      const labels = fields.find((f) => f.id === id)?.labels;
      if (labels === undefined) return part;
      const values = rest.split(/\s+or\s+/u).map((w) => w.trim().toLowerCase().replace(/\s+/gu, '_'));
      if (!values.every((v) => Object.hasOwn(labels, v))) return part;
      return `${lead}${id}${verb}${values.map((v) => valueSaid(id, v, register)).join(' or ')}${tail}`;
    })
    .join('');
};

function conditionWords(cond: unknown, register?: string): string {
  if (typeof cond === 'string') return mark(daysSaid(idsSaid(valuesSaid(cond.trim(), register), register)));
  const leaf = leafOf(cond);
  if (leaf) return `${fieldNamed(leaf.field, register)} ${COMPARE.find((c) => c.op === leaf.op)!.said} ${leaf.value}`;
  if (!isObject(cond)) return '';
  return treeWords(cond, register) ?? 'the condition holds';
}

/**
 * A CONDITION TREE IN WORDS (audit 6g, AG3). Any tree the builder did not make was said "the condition holds", so
 * Money's own chase, whose draft is written only "where there is none, and not on an invoice paid in part", read "If the
 * condition holds, then if the condition holds". Each leaf is its field and test, "Draft to send is empty", an enum by
 * its label, and the groups join them: `all` with and, `any` with or, `none` as not. `null` for a leaf no test here says,
 * and the whole is then the old words rather than half a sentence.
 */
function treeWords(cond: unknown, register?: string): string | null {
  if (!isObject(cond)) return null;
  const group = 'all' in cond ? 'all' : 'any' in cond ? 'any' : 'none' in cond ? 'none' : null;
  if (group !== null) {
    const kids = cond[group];
    if (!Array.isArray(kids) || kids.length === 0) return null;
    const said = kids.map((k) => treeWords(k, register));
    if (said.some((w) => w === null)) return null;
    const words = said as string[];
    if (group === 'all') return andList(words);
    if (group === 'any') return andList(words, 'or');
    /* NOT, said over the one thing it takes back: "not both A and B" for a pair, "neither A nor B" for two leaves. */
    if (words.length === 1) {
      const only = kids[0];
      if (isObject(only) && Array.isArray(only.all) && only.all.length === 2) return `not both ${words[0]}`;
      if (isObject(only) && ('all' in only || 'any' in only || 'none' in only)) return `not (${words[0]})`;
      return `not ${words[0]}`;
    }
    return words.length === 2 ? `neither ${words[0]} nor ${words[1]}` : `none of ${andList(words, 'or')}`;
  }
  if (typeof cond.field !== 'string') return null;
  const ops = Object.keys(cond).filter((k) => k !== 'field' && k !== 'via');
  if (ops.length !== 1) return null;
  const op = ops[0]!;
  const v = cond[op];
  const field = fieldNamed(cond.field, register);
  const value = (x: unknown): string => valueSaid(cond.field as string, x, register);
  switch (op) {
    case 'empty':
      return `${field} is ${v === false ? 'set' : 'empty'}`;
    case 'present':
      return `${field} is ${v === false ? 'empty' : 'set'}`;
    case 'is':
      return `${field} is ${value(v)}`;
    case 'not':
      return `${field} is not ${value(v)}`;
    case 'in':
      return Array.isArray(v) ? `${field} is ${andList(v.map(value), 'or')}` : null;
    case 'not_in':
      return Array.isArray(v) ? `${field} is not ${andList(v.map(value), 'or')}` : null;
    case 'before':
    case 'after':
      return daysSaid(`${field} ${op} ${value(v)}`);
    case 'contains':
      return `${field} contains ${value(v)}`;
    case 'starts':
      return `${field} starts with ${value(v)}`;
    case 'ends':
      return `${field} ends with ${value(v)}`;
    case 'has':
      return `${field} has ${value(v)}`;
    case 'lacks':
      return `${field} lacks ${value(v)}`;
    default: {
      const c = COMPARE.find((x) => x.op === op);
      return c && typeof v === 'number' ? `${field} ${c.said} ${v}` : null;
    }
  }
}

/** A value in a condition as the list shows it: an enum by its label, lower case unless it is a name, else as written. */
function valueSaid(fieldId: string, v: unknown, register?: string): string {
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (typeof v === 'number') return String(v);
  if (typeof v !== 'string') return '';
  const decls = register && REGISTERS[register] ? [REGISTERS[register]] : Object.values(REGISTERS);
  for (const r of decls) {
    const label = (r?.fields.find((f) => f.id === fieldId) as { labels?: Record<string, string> } | undefined)?.labels?.[v];
    if (label) return /^[A-Z][A-Z]/u.test(label) ? label : label.charAt(0).toLowerCase() + label.slice(1);
  }
  return v.replace(/_/gu, ' ');
}

const DAY_NOUN: Readonly<Record<string, string>> = { d: 'day', w: 'week', m: 'month', y: 'year' };

/**
 * A day counted from today, said: `due before -7d` is "Due more than 7 days ago", `renews before +15d` "Renews less than
 * 15 days from now", a bare `-7d` "7 days ago". A card had printed "Due before -7d" (audit 6g, AG3).
 */
function daysSaid(text: string): string {
  const span = (n: string, u: string): string => `${n} ${DAY_NOUN[u]}${n === '1' ? '' : 's'}`;
  return text
    .replace(/\bbefore -(\d+)([dwmy])\b/gu, (_, n: string, u: string) => `more than ${span(n, u)} ago`)
    .replace(/\bafter -(\d+)([dwmy])\b/gu, (_, n: string, u: string) => `in the last ${span(n, u)}`)
    .replace(/\bbefore \+(\d+)([dwmy])\b/gu, (_, n: string, u: string) => `less than ${span(n, u)} from now`)
    .replace(/\bafter \+(\d+)([dwmy])\b/gu, (_, n: string, u: string) => `more than ${span(n, u)} from now`)
    .replace(/(^|\s)-(\d+)([dwmy])\b/gu, (_, lead: string, n: string, u: string) => `${lead}${span(n, u)} ago`)
    .replace(/(^|\s)\+(\d+)([dwmy])\b/gu, (_, lead: string, n: string, u: string) => `${lead}${span(n, u)} from now`);
}

/** Words matched as they are written, for a pattern built around them. */
const escaped = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

/** A condition's clauses as one list: "Account is set, Book is empty" said "Account is set and Book is empty". */
const clausesJoined = (cond: string): string => (/\s(?:and|or)\s/u.test(cond) ? cond : cond.replace(/,\s+(?=[^,]*$)/u, ' and '));

/**
 * What starts it and what it waits for, as the trigger card says it. THE CONDITION IS SAID IN EITHER FORM: the card
 * drew only a typed sentence, so a rule that tags only bills above 500 was shown as starting on every write to bills.
 * A tree the builder can read is said in its words, "Amount is more than 500", and any other as "the condition holds",
 * which is less than it could say and is not nothing.
 *
 * ONE "only when" (VERIFY H30): the fields that must change and the condition are one list, "only when Account
 * changes, Account is set and Book is empty", where it said "only when" twice.
 */
export function sayStart(d: Draft, listSaid?: (id: string) => string, ruleSaid?: (id: string) => string): string {
  const filed = conditionOf(d);
  const cond = filed === null ? '' : clausesJoined(sayCondition(filed, 'written' in d.trigger ? (d.trigger.written.register ?? undefined) : undefined));
  if (cond === '') return sayTrigger(d.trigger, listSaid, ruleSaid);
  if ('written' in d.trigger && d.trigger.written.fields?.length) {
    const w = d.trigger.written;
    const p = writtenParts(w, listSaid);
    /* ONE FIELD, AND ONE CLAUSE SAYING WHAT IT IS SET TO, IS ONE EVENT: "When an item in Bills
       and invoices is changed, only when Status changes, Status is paid" said it three times. A delete sets nothing. */
    const set = w.fields?.length === 1 && !(w.op ?? []).includes('delete') ? new RegExp(`^${escaped(p.changes)} is (?!not |set$|empty$)([^,]+)$`, 'u').exec(cond) : null;
    if (set && !/\s(?:and|or)\s/u.test(set[1]!)) return `When an item in ${w.register ? (listSaid ?? ((id: string) => id))(w.register) : 'a list'} has its ${p.changes} set to ${set[1]}${p.rules}`;
    return `${p.said}, only when ${p.changes} changes, ${cond}${p.rules}`;
  }
  return `${sayTrigger(d.trigger, listSaid, ruleSaid)}, only when ${cond}`;
}

/** A written trigger's three parts: what is written where, the fields that must change, and whether other automations count. */
function writtenParts(w: Extract<Trigger, { written: unknown }>['written'], listSaid: (id: string) => string = (id) => id) {
  const ops = (w.op ?? []).map((o) => ({ create: 'added', update: 'changed', delete: 'deleted' })[o]);
  return {
    said: `When an item in ${w.register ? listSaid(w.register) : 'a list'} is ${ops.length > 0 ? andList(ops, 'or') : 'added or changed'}`,
    changes: andList((w.fields ?? []).map((f) => fieldNamed(f, w.register ?? undefined)), 'or'),
    rules: w.from_rules ? ', including changes other automations make' : '',
  };
}

/**
 * What starts it, in one sentence.
 *
 * `listSaid` IS WHAT A LIST IS CALLED, for a caller that knows: the hub's rows hand it the shell's names, so a row says
 * "an item in Instalments" as the rail does and never the list's id. Without it the list is said as it was written.
 */
export function sayTrigger(t: Trigger, listSaid: (id: string) => string = (id) => id, ruleSaid?: (id: string) => string): string {
  if ('written' in t) {
    const p = writtenParts(t.written, listSaid);
    return `${p.said}${p.changes ? `, only when ${p.changes} changes` : ''}${p.rules}`;
  }
  if ('arrival' in t) {
    const a = t.arrival;
    if (a.ingest) return `When something arrives at ${a.ingest}`;
    if (a.channel) return `When something arrives by ${a.channel}`;
    return 'When anything arrives';
  }
  /* A CLOCK OF MONTHS IS SAID AS THE RECORD SAYS IT, "On the last day of each month at 09:00", and not as "1mo on last
     at 09:00". One the record would refuse is said as it was written, in the words of its count. */
  if ('every' in t) {
    const said = calendarWords(t) ?? `${cap(inMonths(t.every) === null ? often(t.every) : clockWords(t.every))}${t.day ? ` on ${t.day}` : ''}${t.at ? ` at ${t.at}` : ''}`;
    return t.late ? `${said}, skipped when more than ${spanWords(t.late)} late` : said;
  }
  if ('metric' in t) {
    const c = t.metric.crosses;
    const figure = t.metric.id === '' ? 'a figure' : t.metric.id.replace(/[-_]/gu, ' ');
    return c === 'target'
      ? `When ${figure} crosses its target`
      : 'lte' in c
        ? `When ${figure} falls to ${c.lte} or below`
        : `When ${figure} reaches ${c.gte} or above`;
  }
  /* THE QUESTION IS NAMED BY THE AUTOMATION THAT PUT IT, by its name where the caller knows it ("Chase late payments",
     audit 6g AG3) and else its id without the `rule.` in words, and the answer in quotes, because it is matched as
     written. */
  if ('decided' in t) {
    const bare = t.decided.about ? t.decided.about.replace(/^[a-z]+\./u, '') : '';
    const named = bare === '' ? '' : (ruleSaid?.(bare) ?? bare.replace(/[-_]/gu, ' '));
    const about = named !== '' ? ` from ${named}` : '';
    const option = t.decided.option ? `, when the answer is "${t.decided.option}"` : '';
    return `When a question${about} is decided in Needs you${option}`;
  }
  return 'When you press Run now';
}

/** A marked sentence with its references read aloud: `{{vars.rate}}` as `rate`. */
const unmark = (text: string): string => text.replace(MARKED, (_, path: string) => refText(path));

/** One piece of a card's sentence: words, or a reference (`ref` is its whole path, `text` the name a card shows). */
export type Part = { text: string; ref?: string };

/**
 * What one step does, as words and references, so a card can draw `{{vars.rate}}` as a chip and not as a word in the
 * sentence. The texts joined are `sayStep`, character for character, so every other reader is unchanged.
 */
export function sayParts(step: Step, own = ''): Part[] {
  const whole = saying(step, own);
  const out: Part[] = [];
  let at = 0;
  for (const m of whole.matchAll(MARKED)) {
    if (m.index > at) out.push({ text: whole.slice(at, m.index) });
    const path = m[1]!;
    out.push({ text: refText(path), ref: path });
    at = m.index + m[0].length;
  }
  if (at < whole.length) out.push({ text: whole.slice(at) });
  return out;
}

/**
 * Each installed script's declared title, by its id, as far as the record has said it to this tab (`learnScripts`).
 *
 * A SCRIPT STEP IS SAID BY ITS TITLE. The canvas said "Run the script close_follow_ups", the key a person never types,
 * where the script declares what it is called. A script this tab has not heard of yet is its id in words.
 */
const SCRIPT_TITLES = new Map<string, string>();

/** Learn the titles of the scripts the record listed (`scripts`), for every step sentence drawn after. */
export function learnScripts(rows: readonly { script: string; title: string }[]): void {
  for (const r of rows) if (r.title.trim() !== '') SCRIPT_TITLES.set(r.script, r.title);
  learnTitles(rows);
}

/** What a person calls a script: its declared title when the record has said it, else its id in words. A reference (`{{vars.which}}`) is left as the reference it is. */
export const scriptName = (id: string): string => SCRIPT_TITLES.get(id) ?? (id.includes('\u0002') ? id : idWords(id));

/**
 * ONE CARD AS THE RULE'S WHOLE SENTENCE SAYS IT (audit 6g, AG3). A branch said only "if the condition holds", so the
 * sentence under a rule's title ended "if the condition holds, then if the condition holds."; it now says what happens
 * under it, "if Draft to send is empty …, write Draft to send", and a set whose words run long is said by the field it
 * writes, since the card under the sentence holds the words.
 */
export function sayInWhole(n: Node, own = ''): string {
  const lower = (t: string): string => (/^[A-Z][a-z]/u.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t);
  if (!isBranch(n)) {
    const field = str(getAt(n.step, ['set', 'field']));
    const to = str(getAt(n.step, ['set', 'to']));
    if (verbOf(n.step) === 'set' && field !== '' && to.length > 40) return `Write ${fieldSaid(field)}`;
    return sayStep(n.step, own);
  }
  const so = (n.then ?? []).map((t) => lower(sayInWhole(t, own)));
  const not = (n.else ?? []).map((t) => lower(sayInWhole(t, own)));
  return `${sayStep(n.step, own)}, ${so.length > 0 ? andList(so) : 'do nothing'}${not.length > 0 ? `, and if not, ${andList(not)}` : ''}`;
}

/** What one step does, in one line, with no braces. */
/** `own` is the title of the automation the step sits in: a script step that would only repeat it says what it does instead. */
export const sayStep = (step: Step, own = ''): string => unmark(saying(step, own));

function saying(step: Step, own = ''): string {
  const verb = verbOf(step);
  const a = verb === null ? undefined : step[verb];
  const at = (...path: string[]) => aloud(getAt(a, path));
  switch (verb) {
    case 'if': {
      const cond = conditionWords(a);
      return cond === '' ? 'If' : `If ${cond}`;
    }
    case 'set_var':
      return at('name') === '' ? 'Remember a value' : withText(`Remember ${at('name')}`, at('to'));
    case 'stop':
      return 'Stop here';
    case 'tag':
      return withText('Tag it', aloud(a));
    case 'untag':
      return withText('Take the tag off', aloud(a));
    case 'set':
      return at('field') === '' ? 'Set a field' : `Set ${fieldSaid(at('field'))} to ${at('to') || 'nothing'}`;
    case 'move':
      return aloud(a) === '' ? 'Move it to a state' : `Move it to ${aloud(a)}`;
    case 'link':
      return at('field') === ''
        ? 'Link it to another item'
        : `Link ${fieldSaid(at('field'))} to the ${at('to', 'register') ? oneOf(at('to', 'register')) : 'item'} whose ${fieldSaid(at('to', 'by'), at('to', 'register') || undefined)} is ${at('to', 'value')}`;
    case 'note':
      return withText('Add a note', aloud(a));
    case 'create': {
      const bound = Number(getAt(a, ['bound']));
      return at('register') === '' ? 'Add items' : `Add items to ${at('register')}${bound > 0 ? `, at most ${bound}` : ''}`;
    }
    case 'notify':
      return withText('Tell you', at('say'));
    case 'suggest':
      return withText('Suggest in Needs you', at('question'));
    /* "THE OWNER", NOT "YOU". The card is read by whoever opens the canvas, a member among them, and the runner opens the
       question as a suggestion in Needs you (`packages/kernel/src/flow.ts`), which is the owner's to answer. */
    case 'ask_person':
      return withText(`Ask ${at('to') || 'the owner'}`, at('question'));
    case 'ask_slash':
      return withText('Ask Slash', at('question'));
    case 'call':
      return at('ingest') === '' ? 'Call a service' : `Call ${at('ingest')}`;
    case 'run':
      return aloud(a) === '' ? 'Run a call on this item' : `Run ${aloud(a)} on this item`;
    /* NO NAME IT IS KEPT UNDER (VERIFY H30): "keeping the id of its queued run as filing" put a variable's name on
       screen. The runner queues the script and goes on (`startScript`); where its run is kept is the step's own detail. */
    case 'script':
      if (at('id') === '') return 'Run a script';
      return own.trim() !== '' && scriptName(at('id')).trim() === own.trim() ? 'Run its script' : `Run the script ${scriptName(at('id'))}`;
    case 'wait':
      return aloud(a) === '' ? 'Wait' : `Wait ${spanWords(aloud(a))}`;
    case 'schedule':
      return at('in') === '' ? 'Come back later' : withText(`Come back in ${laterWords(at('in'))}`, at('note'));
    /* WHO, BY WHAT THE STEP CALLS THEM, and never by `keys`, which are a bank's or a door's own handles on somebody. */
    case 'meet': {
      const who = at('name') || at('org') || at('email') || at('handle') || at('domain');
      const lead = who !== '' ? `Meet ${who}` : isObject(a) && a.keys !== undefined ? 'Meet the person it names' : 'Meet a person';
      return withText(lead, at('where'));
    }
    /* THE JOB BY ITS NAME IN WORDS, not its declared id (`job.weekly-notes`), and the run's handle as the person named it. */
    case 'run_job':
      return at('kind') === '' ? 'Start a job' : `Start the job ${jobName(at('kind'))}`;
    case null:
      return 'A step this build cannot draw';
    /* A VERB THE RECORD HOLDS AND THIS BUILD HAS NO WORDS FOR: its id in words and what its arguments hold. */
    default:
      return withText(labelOf(verb), argsFor(verb).map((arg) => aloud(getAt(step, arg.path))).filter((v) => v !== '').join(', '));
  }
}

/** A kind of job as a person says it: its declared id without `job.`, in words. A reference is left as it is. */
export const jobName = (kind: string): string => (kind.includes('\u0002') ? kind : idWords(kind.replace(/^job\./u, '')));

/* ── what a step may read ─────────────────────────────────────────────────── */

/** The answer a step keeps, as its name, or `null` when it keeps none. */
function keeps(step: Step): string | null {
  const verb = verbOf(step);
  if (verb === null) return null;
  if (verb === 'set_var') return str(getAt(step, ['set_var', 'name'])) || null;
  /* EVERY STEP THAT KEEPS ONE KEEPS IT UNDER `as`, a call, an ask, a script's or a job's run, so a verb the grammar adds
     with an `as` is read without a line here. */
  return str(getAt(step, [verb, 'as'])) || null;
}

/**
 * The answers a step can read: every `as` and `set_var` that certainly ran before it.
 *
 * CERTAINLY, WHICH IS WHY AN ARM'S ANSWERS STOP AT THE BRANCH. A step after a branch runs whichever arm was taken, so
 * an answer kept inside one arm may not exist when it runs, and offering it as a chip would be offering a hole.
 * Earlier steps of the list it is in, and of every list it is inside, are the ones it can count on.
 */
export const varsBefore = (nodes: readonly Node[], key: string): string[] => keepersBefore(nodes, key).map((s) => `vars.${keeps(s)}`);

/** The steps that certainly kept an answer before `key`, one per name, the first to keep it, in the order they ran. */
function keepersBefore(nodes: readonly Node[], key: string): Step[] {
  const walk = (list: readonly Node[], inherited: readonly Step[]): Step[] | null => {
    const seen = [...inherited];
    for (const n of list) {
      if (n.key === key) return seen;
      if (isBranch(n)) {
        const inner = walk(n.then ?? [], seen) ?? walk(n.else ?? [], seen);
        if (inner) return inner;
      }
      const kept = keeps(n.step);
      if (kept && !seen.some((s) => keeps(s) === kept)) seen.push(n.step);
    }
    return null;
  };
  return walk(nodes, []) ?? [];
}

/** A field a condition may name, as the query builder takes one (`lib/query/tree.ts` `QueryField`). */
export type CondField = { id: string; type: string; values?: readonly string[] };

/**
 * The answers a branch's condition may test, typed as the runner's `test` will type them (`packages/kernel/src/flow.ts`),
 * so the query builder offers each the tests that can hold.
 *
 * THE RUNNER TYPES AN ANSWER BY WHAT IT HOLDS AT RUN TIME, and the canvas has to guess before one exists. A person's
 * answer is one of the step's own options, so it is offered as a choice of them. A remembered value that is one
 * reference or one number is almost always a figure, so it is a number; any other value, a call's answer (an object)
 * and a script's queued id are text. A guess that is wrong costs a test the builder does not offer, and the words
 * ("As text") still write any sentence the record reads.
 *
 * SLASH'S ANSWER IS NO GUESS: the runner holds it to the shape its step asked for (`answerStep`), a number as a number
 * and a choice as one of the step's choices, so it is typed by that shape and is text only when it asked for words.
 */
export function answerFields(nodes: readonly Node[], key: string): CondField[] {
  return keepersBefore(nodes, key).flatMap((s): CondField[] => {
    const name = keeps(s);
    if (name === null) return [];
    const verb = verbOf(s);
    if (verb === 'ask_person') {
      const options = getAt(s, ['ask_person', 'options']);
      const values = Array.isArray(options) ? options.filter((o): o is string => typeof o === 'string' && o !== '') : [];
      return [values.length > 0 ? { id: name, type: 'enum', values } : { id: name, type: 'text' }];
    }
    if (verb === 'ask_slash') {
      const shape = slashShape(s);
      if (shape === 'number') return [{ id: name, type: 'decimal' }];
      const choices = getAt(s, ['ask_slash', 'choices']);
      const values = shape === 'choice' && Array.isArray(choices) ? choices.filter((c): c is string => typeof c === 'string' && c !== '') : [];
      return [values.length > 0 ? { id: name, type: 'enum', values } : { id: name, type: 'text' }];
    }
    if (verb === 'set_var') {
      const to = getAt(s, ['set_var', 'to']);
      const figure = typeof to === 'string' && /^\s*(?:\{\{[^}]+\}\}|-?\d+(?:\.\d+)?)\s*$/u.test(to);
      return [{ id: name, type: figure ? 'decimal' : 'text' }];
    }
    return [{ id: name, type: 'text' }];
  });
}

/**
 * Every declared call the flow names, by a `call` step or a rule's `run`, both arms of every branch, once each, in the
 * order they first appear. What the "Calls other services" lines are drawn for.
 */
export function callsIn(nodes: readonly Node[]): string[] {
  const out: string[] = [];
  const walk = (list: readonly Node[]) => {
    for (const n of list) {
      const verb = verbOf(n.step);
      const name = verb === 'call' ? getAt(n.step, ['call', 'ingest']) : verb === 'run' ? n.step.run : null;
      if (typeof name === 'string' && name.trim() !== '' && !out.includes(name.trim())) out.push(name.trim());
      if (isBranch(n)) {
        walk(n.then ?? []);
        walk(n.else ?? []);
      }
    }
  };
  walk(nodes);
  return out;
}

/** What the trigger hands a run: `trigger.row.<field>` for a row, the arrival's own keys for an arrival. */
export function triggerChips(t: Trigger, fields: readonly string[] = []): string[] {
  if ('written' in t) return fields.map((f) => `trigger.row.${f}`);
  if ('arrival' in t) return ['trigger.arrival.id', 'trigger.arrival.channel', 'trigger.arrival.body'];
  return [];
}

/* ── what is missing, said at once ─────────────────────────────────────────── */

export type Fault = { key: string | null; say: string };

const blank = (v: unknown): boolean =>
  v === undefined || v === null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0) || (typeof v === 'number' && !(v > 0));

/** The hint for a trigger's required argument, by trigger and argument name. COPY, as `ARG_WORDS` is. */
const TRIGGER_MISSING: Record<string, Record<string, string>> = {
  written: { register: 'Say which list it watches.' },
  metric: { id: 'Say which figure it watches.' },
};

/**
 * What is not picked yet in this draft, one sentence each, with the card each is about (`null` for the trigger): every
 * argument the grammar says is required and the draft leaves empty, and nothing else.
 *
 * ALL OTHER FAULTS ARE THE RECORD'S (HD.438). This was a second copy of the record's lint, and it drifted: it refused a
 * condition on an arrival after the runner learned to read one, and said a figure trigger would never start after the
 * sweep started it. An empty automation, a branch with nothing under it and a step this host cannot run are said by
 * `checkAutomation`, placed on the card its `at` names (`FlowDraft.served`), so there is one reading of a body and it is
 * the one that installs it. Over no grammar nothing is required, so nothing is said here.
 *
 * `slash` IS TAKEN AND NOT READ, for the callers that still hand it in: whether this host answers Slash is the record's
 * to say of a step now, as it says it of every other.
 */
export function faultsOf(d: Draft, opts: { slash?: boolean; grammar?: FlowGrammar | null } = {}): Fault[] {
  const g = opts.grammar === undefined ? held() : opts.grammar;
  const out: Fault[] = [];
  const kind = triggerKind(d.trigger);
  for (const a of g?.triggers.find((t) => t.id === kind)?.args ?? []) {
    if (!a.required || !blank(getAt(d.trigger, argPath(kind, a.name)))) continue;
    out.push({ key: null, say: TRIGGER_MISSING[kind]?.[a.name] ?? notPicked(idWords(a.name.split('.').pop() ?? a.name)) });
  }

  const walk = (list: readonly Node[]) => {
    for (const n of list) {
      const verb = verbOf(n.step, g);
      if (verb !== null)
        for (const arg of argsFor(verb, g)) if (arg.required && (arg.when?.(n.step) ?? true) && blank(getAt(n.step, arg.path))) out.push({ key: n.key, say: arg.missing });
      walk(n.then ?? []);
      walk(n.else ?? []);
    }
  };
  walk(d.steps);
  return out;
}

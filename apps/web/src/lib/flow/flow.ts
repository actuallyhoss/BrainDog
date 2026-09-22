/**
 * The canvas's draft of one automation: a trigger, and a tree of step lists (`loop/research-shell-automations.md` §3, §6).
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

import { dropIndex, moveAt } from '../record/arrange.ts';
import { everyMs, often } from '../record/actions.ts';

/* ── the definition, as §3 sketches it and `rules.ts` declares it ──────────── */

/**
 * WRITTEN HERE AND NOT IMPORTED, because `@braindog/kernel` exports `RuleDecl` and not `Trigger`, `Step` or `pathOf`,
 * and the package has one entry point. The shapes are copied from `packages/kernel/src/rules.ts` and the path rule from
 * `flow-lint.ts`, and `flow.test.ts` holds this `pathOf` to the kernel's answers, measured over the same bodies.
 */
export type Trigger =
  | { written: { register: string; op?: ('create' | 'update' | 'delete')[]; fields?: string[]; from_rules?: boolean } }
  | { arrival: { ingest?: string; channel?: 'webhook' | 'email' | 'paste' | 'api' | 'pull'; state?: string[]; unverified?: boolean } }
  | { every: string; at?: string; day?: string }
  | { metric: { id: string; crosses: 'target' | { lte: number } | { gte: number } } }
  | { manual: true };

/** A step as the body holds it: exactly one verb key, and for `if` its two arms. Read loosely, because agents write these. */
export type Step = Record<string, unknown>;

/** A rule body. Only the keys this file reads are named; anything else is carried through untouched. */
export type Body = Record<string, unknown>;

/** The twelve actions a rule had before steps. The inline pass has one arm for each. */
export const ACTIONS = ['tag', 'untag', 'set', 'move', 'link', 'note', 'notify', 'schedule', 'create', 'suggest', 'run', 'stop'] as const;
/** The seven verbs only a step has. */
export const FLOW_VERBS = ['if', 'set_var', 'script', 'call', 'ask_spark', 'ask_person', 'wait'] as const;
export const VERBS = [...FLOW_VERBS, ...ACTIONS] as const;
export type Verb = (typeof VERBS)[number];

/** The kernel's ceilings (`flow-lint.ts`): fifty steps over both arms of every branch, and three levels of branch. */
export const STEP_CEILING = 50;
export const DEPTH_CEILING = 3;
/** Fifteen minutes, the shortest clock the record keeps (`pull.ts` `FLOOR_MS`). */
export const FLOOR_MS = 15 * 60_000;

/** Verbs that act on a row, refused on a trigger that brings none. `flow-lint.ts` `ROW_VERBS`. */
const ROW_VERBS: readonly string[] = ['tag', 'untag', 'set', 'move', 'link', 'note', 'schedule', 'run'];
/** Triggers with no row. `flow-lint.ts` `ROWLESS`. */
const ROWLESS: readonly string[] = ['every', 'metric', 'manual'];
/** Verbs that need `once_per` on a trigger about a row. `flow-lint.ts` `ONCE`. */
const ONCE: readonly string[] = ['notify', 'create', 'suggest', 'run', 'call', 'ask_spark', 'ask_person'];
/** An answer's name. `flow-lint.ts` `NAME`, and `trigger` and `vars` are the run's own. */
const NAME = /^[a-z][a-z0-9_]{0,31}$/u;
const RESERVED: readonly string[] = ['trigger', 'vars'];
/** A day relative to today in a condition. `flow-lint.ts` `RELATIVE_DAY`, which the kernel does not export. */
const RELATIVE_DAY = /\b(?:today|yesterday|tomorrow)\b|[+-]\d+[dwmy]\b/u;

const isObject = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x);

/** The one verb a step names, or `null` for a step that names none or two. */
export function verbOf(step: Step): Verb | null {
  const named = VERBS.filter((v) => v in step);
  return named.length === 1 ? named[0]! : null;
}

/* ── the tree ─────────────────────────────────────────────────────────────── */

/**
 * One card. `key` is the canvas's own and never reaches the body: a step has no id in the declaration, and two steps can
 * be identical, so a drag has to name the card it holds by something other than what the card says.
 *
 * A BRANCH HOLDS ITS ARMS BESIDE ITS STEP, not inside it, so that every list in the tree is a `Node[]` and every move is
 * the same move. `step` for a branch is `{ if: condition }` and nothing else.
 */
export type Node = { key: string; step: Step; then?: Node[]; else?: Node[] };

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

/** A body's list of steps as cards. A branch's arms become lists of their own, and a missing `else` is an empty one. */
export function nodesOf(list: unknown): Node[] {
  if (!Array.isArray(list)) return [];
  return list.filter(isObject).map((step): Node => {
    if (!('if' in step)) return { key: mintKey(), step: { ...step } };
    const { then, else: otherwise, ...rest } = step;
    return { key: mintKey(), step: rest, then: nodesOf(then), else: nodesOf(otherwise) };
  });
}

/** Cards back into a body's list. An empty `else` is left out, which is how the record reads a branch with none. */
export function stepsOf(nodes: readonly Node[]): Step[] {
  return nodes.map((n) => {
    if (!isBranch(n)) return n.step;
    const otherwise = stepsOf(n.else ?? []);
    return { ...n.step, then: stepsOf(n.then ?? []), ...(otherwise.length > 0 ? { else: otherwise } : {}) };
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
 * error. And a branch dropped deeper than the record's three levels would be refused on Decide, after the person had
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
  if (depth + heightOf(from.node) > DEPTH_CEILING) return { ...same, why: words.tooDeep };

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
 * `enabled`, `limits`, a `when` written as a tree, and whatever a later build adds. A canvas that dropped the keys it
 * did not understand would make every save by a person a quiet edit of what an agent wrote.
 *
 * `form` IS HOW THE BODY SPELLED ITS LIST, and it decides which path a saved body takes (see `bodyOf`).
 */
export type Draft = {
  id: string;
  name: string;
  trigger: Trigger;
  /** The condition as a `where` sentence, or `null` when there is none or it was written as a tree (then it is in `rest`). */
  when: string | null;
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
    if (on.manual === true) return { manual: true };
  }
  if (typeof body.register === 'string') return { written: { register: body.register } };
  return { manual: true };
}

export function draftOf(id: string, body: Body): Draft {
  const rest: Body = {};
  for (const [k, v] of Object.entries(body)) if (!DRAWN.has(k)) rest[k] = v;
  /* A WORD IN `on:` (`create`, the one older spelling the lint still lets through) and a `when` written as a tree are
     kept as they were, since the canvas cannot draw either and must not drop them. */
  if (typeof body.on === 'string') rest.on = body.on;
  if (body.when !== undefined && typeof body.when !== 'string') rest.when = body.when;
  return {
    id,
    name: typeof body.name === 'string' ? body.name : '',
    trigger: triggerOfBody(body),
    when: typeof body.when === 'string' ? body.when : null,
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

const onlyActions = (nodes: readonly Node[]): boolean => nodes.every((n) => !isBranch(n) && (ACTIONS as readonly string[]).includes(verbOf(n.step) ?? ''));

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
export function bodyOf(d: Draft): Body {
  const rest: Body = { ...d.rest };
  const t = d.trigger;
  const written = 'written' in t ? t.written : null;
  const plainWrite = written !== null && written.op === undefined && written.fields === undefined && written.from_rules === undefined;
  const inline =
    plainWrite && d.form === 'then' && onlyActions(d.steps) && rest.project === undefined && rest.limits === undefined && rest.enabled !== false;
  if (written !== null && hasVerb(d.steps, ONCE) && !(Array.isArray(rest.once_per) && rest.once_per.length > 0)) rest.once_per = ['entry'];
  const when = d.when !== null && d.when.trim() !== '' ? { when: d.when.trim() } : {};
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
 * `propose`, and Decide shows the dry run and the calls it makes the same way whichever of them drew it. The owner's
 * press is what installs it: the canvas never writes a declaration of its own.
 *
 * `from_version` IS LEFT OUT FOR A NEW ONE, which the record reads as drawn from nothing. For an edit it is the version
 * the canvas opened, so a second change that landed in between is a conflict on Decide rather than a quiet overwrite.
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
      ...(fromVersion === null ? {} : { from_version: fromVersion }),
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
 * that is installed is read as a new version of it, so "Gold rate" drawn twice would have replaced the first on accept.
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

/**
 * The four triggers a person can pick. NOT `metric`, which the lint refuses as not in this build (nothing starts it
 * yet), and not `decided`, which is reserved: a choice that installs and is then refused on Decide teaches somebody
 * the canvas cannot be trusted. A body that already names one is still drawn and said, and `faultsOf` says why.
 */
export const TRIGGER_KINDS = ['written', 'arrival', 'every', 'manual'] as const;
export type TriggerKind = (typeof TRIGGER_KINDS)[number];

export const triggerKind = (t: Trigger): string => Object.keys(t).find((k) => k !== 'at' && k !== 'day') ?? 'manual';

/** A trigger of another kind, keeping the list it watched when it goes from a change to an arrival and back is moot. */
export function blankTrigger(kind: TriggerKind, was?: Trigger): Trigger {
  if (kind === 'written') return { written: { register: was && 'written' in was ? was.written.register : '' } };
  if (kind === 'arrival') return { arrival: {} };
  if (kind === 'every') return { every: '1h' };
  return { manual: true };
}

/** The clocks offered. The record's floor is fifteen minutes; a time of day belongs to a day or a week only. */
export const EVERY = ['15m', '1h', '6h', '1d', '1w'] as const;
export const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export const CHANNELS = ['webhook', 'email', 'paste', 'api', 'pull'] as const;

/**
 * A clock with its time and day kept only where the record reads them: `at` on a day or a week, `day` on a week, and
 * a week given a time is given Monday, because the lint refuses a weekly time with no day.
 */
export function clockOf(every: string, at?: string, day?: string): Trigger {
  const daily = every === '1d';
  const weekly = every === '1w';
  const time = (daily || weekly) && at ? { at } : {};
  const on = weekly && at ? { day: day ?? 'mon' } : {};
  return { every, ...time, ...on };
}

/* ── the step kinds, as the menu offers and the inspector edits them ──────── */

/** What each verb is called where a person picks it. */
export const VERB_LABELS: Record<Verb, string> = {
  if: 'Only if',
  set_var: 'Remember a value',
  stop: 'Stop here',
  tag: 'Add a tag',
  untag: 'Take a tag off',
  set: 'Set a field',
  move: 'Move to a state',
  link: 'Link to a row',
  note: 'Add a note',
  create: 'Add rows',
  notify: 'Tell you',
  suggest: 'Suggest on Decide',
  ask_person: 'Ask a person',
  ask_spark: 'Ask Spark',
  call: 'Call a service',
  run: 'Run a call on this row',
  script: 'Run a script',
  wait: 'Wait',
  schedule: 'Come back later',
};

/** §6's five groups, in the order the menu draws them. Every verb is in exactly one. */
export const STEP_GROUPS: readonly { label: string; verbs: readonly Verb[] }[] = [
  { label: 'Check', verbs: ['if', 'set_var', 'stop'] },
  { label: 'Change', verbs: ['tag', 'untag', 'set', 'move', 'link', 'note', 'create'] },
  { label: 'Ask', verbs: ['notify', 'suggest', 'ask_person', 'ask_spark'] },
  { label: 'Call out', verbs: ['call', 'run', 'script'] },
  { label: 'Wait', verbs: ['wait', 'schedule'] },
];

/** A new step of one kind, with the arguments it needs present and empty, so the inspector has something to fill. */
export function blankStep(verb: Verb): Step {
  switch (verb) {
    case 'if':
      return { if: '' };
    case 'set_var':
      return { set_var: { name: '', to: '' } };
    case 'stop':
      return { stop: true };
    case 'tag':
    case 'untag':
    case 'move':
    case 'note':
    case 'run':
      return { [verb]: '' };
    case 'set':
      return { set: { field: '', to: '' } };
    case 'link':
      return { link: { field: '', to: { register: '', by: '', value: '' } } };
    case 'create':
      return { create: { register: '', bound: 1, fields: {} } };
    case 'notify':
      return { notify: { say: '' } };
    case 'suggest':
      return { suggest: { question: '', options: ['Yes', 'No'] } };
    case 'ask_person':
      return { ask_person: { question: '', options: ['Yes', 'No'], as: '' } };
    case 'ask_spark':
      return { ask_spark: { question: '', as: '' } };
    case 'call':
      return { call: { ingest: '' } };
    case 'script':
      return { script: { id: '', as: '' } };
    case 'wait':
      return { wait: '1h' };
    case 'schedule':
      return { schedule: { in: '1d', note: '' } };
  }
}

/**
 * One argument as the inspector draws it.
 *
 * `text` is one line, `long` is a paragraph, `name` is an answer's name, `span` is a wait in the clock grammar,
 * `later` is a `schedule` span in the vault's grammar (where `m` is a month), `list` is one item a line, `pairs` is
 * `field: value` a line, and `condition` is a `where` sentence. `template` marks the ones that read `{{…}}`, which the
 * inspector offers as chips rather than asking anybody to type braces.
 */
export type ArgKind = 'text' | 'long' | 'name' | 'number' | 'span' | 'later' | 'list' | 'pairs' | 'condition';
export type Arg = { path: readonly string[]; label: string; kind: ArgKind; required?: boolean; template?: boolean; hint?: string };

export const ARGS: Record<Verb, readonly Arg[]> = {
  if: [{ path: ['if'], label: 'Only when', kind: 'condition', required: true, hint: 'state is open, due before today' }],
  set_var: [
    { path: ['set_var', 'name'], label: 'Call it', kind: 'name', required: true },
    { path: ['set_var', 'to'], label: 'Value', kind: 'text', template: true },
  ],
  stop: [],
  tag: [{ path: ['tag'], label: 'Tag', kind: 'text', required: true }],
  untag: [{ path: ['untag'], label: 'Tag', kind: 'text', required: true }],
  set: [
    { path: ['set', 'field'], label: 'Field', kind: 'text', required: true },
    { path: ['set', 'to'], label: 'To', kind: 'text', template: true },
  ],
  move: [{ path: ['move'], label: 'To the state', kind: 'text', required: true }],
  link: [
    { path: ['link', 'field'], label: 'Field', kind: 'text', required: true },
    { path: ['link', 'to', 'register'], label: 'In the list', kind: 'text', required: true },
    { path: ['link', 'to', 'by'], label: 'Matched by the field', kind: 'text', required: true },
    { path: ['link', 'to', 'value'], label: 'Equal to', kind: 'text', required: true, template: true },
  ],
  note: [{ path: ['note'], label: 'Note', kind: 'long', required: true, template: true }],
  create: [
    { path: ['create', 'register'], label: 'In the list', kind: 'text', required: true },
    { path: ['create', 'bound'], label: 'At most this many rows', kind: 'number', required: true },
    { path: ['create', 'fields'], label: 'Fields', kind: 'pairs', template: true, hint: 'title: Chase the invoice' },
  ],
  notify: [{ path: ['notify', 'say'], label: 'Say', kind: 'long', required: true, template: true }],
  suggest: [
    { path: ['suggest', 'question'], label: 'Question', kind: 'long', required: true, template: true },
    { path: ['suggest', 'options'], label: 'Answers', kind: 'list', required: true },
  ],
  ask_person: [
    { path: ['ask_person', 'question'], label: 'Question', kind: 'long', required: true, template: true },
    { path: ['ask_person', 'options'], label: 'Answers', kind: 'list', required: true },
    { path: ['ask_person', 'as'], label: 'Keep the answer as', kind: 'name', required: true },
    { path: ['ask_person', 'wait'], label: 'Wait at most', kind: 'span', hint: '7d' },
  ],
  ask_spark: [
    { path: ['ask_spark', 'question'], label: 'Question', kind: 'long', required: true, template: true },
    { path: ['ask_spark', 'as'], label: 'Keep the answer as', kind: 'name', required: true },
  ],
  call: [
    { path: ['call', 'ingest'], label: 'The declared call', kind: 'text', required: true, hint: 'gold_rate' },
    { path: ['call', 'as'], label: 'Keep the answer as', kind: 'name' },
  ],
  run: [{ path: ['run'], label: 'The declared call', kind: 'text', required: true }],
  script: [
    { path: ['script', 'id'], label: 'The script', kind: 'text', required: true },
    { path: ['script', 'as'], label: 'Keep the answer as', kind: 'name', required: true },
  ],
  wait: [{ path: ['wait'], label: 'For', kind: 'span', required: true, hint: '2h' }],
  schedule: [
    { path: ['schedule', 'in'], label: 'In', kind: 'later', required: true, hint: '14d' },
    { path: ['schedule', 'note'], label: 'Note', kind: 'text', required: true, template: true },
  ],
};

/* ── what a card says ─────────────────────────────────────────────────────── */

export const words = {
  heading: 'Automations',
  newOne: 'New automation',
  untitled: 'Untitled automation',
  none: 'Nothing is automated here yet.',
  noneWhy: 'An automation starts on a change, an arrival, a clock or a button, and then does its steps in order.',
  absent: 'This record does not list its automations yet. You can still draw one and send it to Decide.',
  sample: 'This is the sample record. Nothing you draw here is sent anywhere.',
  steps: 'Steps',
  runs: 'Runs',
  written: 'As written',
  addStep: 'Add a step',
  addHere: 'Add a step here',
  emptyArm: 'Nothing yet',
  then: 'Then',
  otherwise: 'Otherwise',
  edit: 'Edit',
  remove: 'Remove',
  moveUp: 'Move up',
  moveDown: 'Move down',
  moveIn: 'Move into the branch',
  moveOut: 'Move out of the branch',
  drag: (said: string) => `Drag to move: ${said}`,
  moreFor: (said: string) => `More for: ${said}`,
  save: 'Send to Decide',
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
  filed: 'Sent to Decide. It runs once you accept it there.',
  openDecide: 'Open it on Decide',
  notFiled: 'This is the sample record, so nothing was sent. On your record this goes to Decide.',
  nothingChanged: 'Nothing has changed since it was opened.',
  faults: 'Before it can be sent',
  insideItself: 'A branch cannot go inside itself.',
  tooDeep: 'Branches go three deep at most, and this would make four.',
  alreadyFirst: 'It is already first here.',
  alreadyLast: 'It is already last here.',
  noBranchBeside: 'There is no branch next to it to move into.',
  notInBranch: 'It is not inside a branch.',
  proposeNew: (name: string) => `Add the automation ${name}?`,
  proposeChange: (name: string) => `Save the changes to the automation ${name}?`,
  lastRun: (at: string, state: string) => `Last run ${at}, ${state}.`,
  neverRun: 'Not run yet.',
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
  noRuns: 'No runs yet.',
  kinds: {
    written: 'A change',
    arrival: 'An arrival',
    every: 'A clock',
    manual: 'A button',
  } as Record<string, string>,
  triggerHelp: {
    written: 'A row in one list is added, changed or deleted.',
    arrival: 'Something arrives at a door: a webhook, an email, a paste.',
    every: 'On a clock, every fifteen minutes or longer.',
    manual: 'Only when somebody presses Run now.',
  } as Record<string, string>,
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

/** A `schedule` span, in the vault's grammar, where `m` is a month and `y` a year. */
function laterWords(span: string): string {
  const m = /^(\d+)\s*([dwmy])$/u.exec(span.trim());
  if (!m) return span;
  const n = Number(m[1]);
  const unit = { d: ['day', 'days'], w: ['week', 'weeks'], m: ['month', 'months'], y: ['year', 'years'] }[m[2] as 'd' | 'w' | 'm' | 'y'];
  return `${n} ${n === 1 ? unit[0] : unit[1]}`;
}

/** `{{vars.rate}}` read aloud as `rate`. A card never shows braces; the inspector shows them as chips. */
export const unbrace = (text: string): string => text.replace(/\{\{\s*([^}]+?)\s*\}\}/gu, (_, path: string) => path.split('.').pop() ?? path);

const str = (v: unknown): string => (typeof v === 'string' ? unbrace(v.trim()) : typeof v === 'number' ? String(v) : '');
const withText = (lead: string, text: string): string => (text === '' ? lead : `${lead}: ${text}`);
const andList = (items: readonly string[], joint = 'and'): string =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} ${joint} ${items[items.length - 1]}`;
const cap = (s: string): string => (s === '' ? s : s[0]!.toUpperCase() + s.slice(1));

/* ── conditions ───────────────────────────────────────────────────────────── */

/**
 * The tests a number is compared with, in words, and the predicate operator each writes.
 *
 * THE SENTENCE GRAMMAR HAS NO WORD FOR "MORE THAN". `packages/where/src/sentence.ts` reads is, before, after, empty,
 * set, has and lacks, which is every test a list's filter needs and none a gold price does; `gt` and its three
 * siblings exist only in the structured form. So a condition about an answer that is a number is written as a leaf,
 * `{ field: rate, gt: 70 }`, which the runner's `test` reads over the run's answers exactly as it reads a sentence
 * (`packages/kernel/src/flow.ts`), and the canvas draws it back in these words.
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
export function sayCondition(cond: unknown): string {
  if (typeof cond === 'string') return unbrace(cond.trim());
  const leaf = leafOf(cond);
  if (leaf) return `${leaf.field.replace(/_/gu, ' ')} ${COMPARE.find((c) => c.op === leaf.op)!.said} ${leaf.value}`;
  return isObject(cond) ? 'the condition holds' : '';
}

/** What starts it, in one sentence. */
export function sayTrigger(t: Trigger): string {
  if ('written' in t) {
    const w = t.written;
    const ops = (w.op ?? []).map((o) => ({ create: 'added', update: 'changed', delete: 'deleted' })[o]);
    const said = `When a row in ${w.register || 'a list'} is ${ops.length > 0 ? andList(ops, 'or') : 'added or changed'}`;
    const fields = w.fields && w.fields.length > 0 ? `, and only when ${andList(w.fields.map((f) => f.replace(/_/gu, ' ')), 'or')} changes` : '';
    return `${said}${fields}${w.from_rules ? ', including changes other automations make' : ''}`;
  }
  if ('arrival' in t) {
    const a = t.arrival;
    if (a.ingest) return `When something arrives at ${a.ingest}`;
    if (a.channel) return `When something arrives by ${a.channel}`;
    return 'When anything arrives';
  }
  if ('every' in t) return `${cap(often(t.every))}${t.day ? ` on ${t.day}` : ''}${t.at ? ` at ${t.at}` : ''}`;
  if ('metric' in t) {
    const c = t.metric.crosses;
    return c === 'target'
      ? `When ${t.metric.id} crosses its target`
      : 'lte' in c
        ? `When ${t.metric.id} falls to ${c.lte} or below`
        : `When ${t.metric.id} reaches ${c.gte} or above`;
  }
  return 'When you press Run now';
}

/** What one step does, in one line, with no braces. */
export function sayStep(step: Step): string {
  const verb = verbOf(step);
  const a = verb === null ? undefined : step[verb];
  const at = (...path: string[]) => str(getAt(a, path));
  switch (verb) {
    case 'if': {
      const cond = sayCondition(a);
      return cond === '' ? 'Only if' : `Only if ${cond}`;
    }
    case 'set_var':
      return at('name') === '' ? 'Remember a value' : withText(`Remember ${at('name')}`, at('to'));
    case 'stop':
      return 'Stop here';
    case 'tag':
      return withText('Tag it', str(a));
    case 'untag':
      return withText('Take the tag off', str(a));
    case 'set':
      return at('field') === '' ? 'Set a field' : `Set ${at('field')} to ${at('to') || 'nothing'}`;
    case 'move':
      return str(a) === '' ? 'Move it to a state' : `Move it to ${str(a)}`;
    case 'link':
      return at('field') === '' ? 'Link it to a row' : `Link ${at('field')} to the ${at('to', 'register') || 'row'} whose ${at('to', 'by')} is ${at('to', 'value')}`;
    case 'note':
      return withText('Add a note', str(a));
    case 'create': {
      const bound = Number(getAt(a, ['bound']));
      return at('register') === '' ? 'Add rows' : `Add rows to ${at('register')}${bound > 0 ? `, at most ${bound}` : ''}`;
    }
    case 'notify':
      return withText('Tell you', at('say'));
    case 'suggest':
      return withText('Suggest on Decide', at('question'));
    case 'ask_person':
      return withText(`Ask ${at('to') || 'you'}`, at('question'));
    case 'ask_spark':
      return withText('Ask Spark', at('question'));
    case 'call':
      return at('ingest') === '' ? 'Call a service' : `Call ${at('ingest')}${at('as') ? `, keeping the answer as ${at('as')}` : ''}`;
    case 'run':
      return str(a) === '' ? 'Run a call on this row' : `Run ${str(a)} on this row`;
    case 'script':
      return at('id') === '' ? 'Run a script' : `Run the script ${at('id')}${at('as') ? `, keeping the answer as ${at('as')}` : ''}`;
    case 'wait':
      return str(a) === '' ? 'Wait' : `Wait ${spanWords(str(a))}`;
    case 'schedule':
      return at('in') === '' ? 'Come back later' : withText(`Come back in ${laterWords(at('in'))}`, at('note'));
    case null:
      return 'A step this build cannot draw';
  }
}

/* ── what a step may read ─────────────────────────────────────────────────── */

/** The answer a step keeps, as its name, or `null` when it keeps none. */
function keeps(step: Step): string | null {
  const verb = verbOf(step);
  if (verb === 'set_var') return str(getAt(step, ['set_var', 'name'])) || null;
  if (verb === 'call' || verb === 'script' || verb === 'ask_spark' || verb === 'ask_person') return str(getAt(step, [verb, 'as'])) || null;
  return null;
}

/**
 * The answers a step can read: every `as` and `set_var` that certainly ran before it.
 *
 * CERTAINLY, WHICH IS WHY AN ARM'S ANSWERS STOP AT THE BRANCH. A step after a branch runs whichever arm was taken, so
 * an answer kept inside one arm may not exist when it runs, and offering it as a chip would be offering a hole.
 * Earlier steps of the list it is in, and of every list it is inside, are the ones it can count on.
 */
export function varsBefore(nodes: readonly Node[], key: string): string[] {
  const walk = (list: readonly Node[], inherited: readonly string[]): string[] | null => {
    const seen = [...inherited];
    for (const n of list) {
      if (n.key === key) return seen;
      if (isBranch(n)) {
        const inner = walk(n.then ?? [], seen) ?? walk(n.else ?? [], seen);
        if (inner) return inner;
      }
      const kept = keeps(n.step);
      if (kept && !seen.includes(`vars.${kept}`)) seen.push(`vars.${kept}`);
    }
    return null;
  };
  return walk(nodes, []) ?? [];
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

/* ── what the record would refuse, said before sending ────────────────────── */

export type Fault = { key: string | null; say: string };

const blank = (v: unknown): boolean =>
  v === undefined || v === null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0) || (typeof v === 'number' && !(v > 0));

/**
 * What would stop this draft being accepted, one sentence each, with the card each is about.
 *
 * THE RECORD CHECKS AGAIN, AND ITS WORD IS FINAL. These are the refusals a person would want told before pressing the
 * button, in the lint's terms, so that the first time they hear "a clock is fifteen minutes or longer" is not on Decide.
 * Anything the canvas cannot know (whether a call is declared, whether a register exists) is left to the record.
 */
export function faultsOf(d: Draft): Fault[] {
  const out: Fault[] = [];
  const t = d.trigger;
  const kind = Object.keys(t)[0] ?? 'manual';
  const rowless = ROWLESS.includes(kind);
  if ('written' in t && t.written.register.trim() === '') out.push({ key: null, say: 'Say which list it watches.' });
  if ('every' in t) {
    const ms = everyMs(t.every);
    if (ms === null) out.push({ key: null, say: `${t.every} is not a clock. Write 15m, 1h, 1d or 1w.` });
    else if (ms < FLOOR_MS) out.push({ key: null, say: 'The shortest clock is every 15 minutes.' });
  }
  if ('metric' in t) out.push({ key: null, say: 'Nothing in this build watches a metric yet, so it would never start.' });
  if (rowless && d.when !== null && d.when.trim() !== '')
    out.push({ key: null, say: 'A clock or a button has no row for a condition to be about. Put the condition in an Only if step.' });
  /* THE TWO BELOW WERE MEASURED, NOT READ. Both bodies went through the kernel's `flowFault` and came back refused at
     `when` while this list was empty (`flow.test.ts` has the pair), so a person pressed Send and heard about it on
     Decide. The run-path one is reached from the sample's own "Chase late payments" by adding a single branch. */
  if ('arrival' in t && (d.when ?? '').trim() !== '')
    out.push({ key: null, say: 'The runner does not read a condition on an arrival yet. Narrow it by its door, or test the row in an Only if step.' });
  if ('written' in t) {
    const body = bodyOf(d);
    if (pathOf(body) === 'run' && Array.isArray(body.once_per) && body.once_per.length > 0 && RELATIVE_DAY.test(JSON.stringify(body.when ?? '')))
      out.push({
        key: null,
        say: 'The condition names a day relative to today, and only an automation that runs inside the change is read again as the days pass. Take out what makes it a run, such as a branch, a wait or a pick of added or changed, or drop the day.',
      });
  }
  if (d.steps.length === 0) out.push({ key: null, say: 'An automation does at least one step.' });
  const count = countOf(d.steps);
  if (count > STEP_CEILING) out.push({ key: null, say: `It has ${count} steps, and ${STEP_CEILING} is the most one automation holds.` });

  const walk = (list: readonly Node[], depth: number) => {
    for (const n of list) {
      const verb = verbOf(n.step);
      if (verb === null) {
        out.push({ key: n.key, say: 'This step names no verb this build reads.' });
        continue;
      }
      if (rowless && ROW_VERBS.includes(verb)) out.push({ key: n.key, say: `${sayTrigger(t)} brings no row, and "${sayStep(n.step)}" acts on one.` });
      for (const arg of ARGS[verb]) {
        const v = getAt(n.step, arg.path);
        if (arg.required && blank(v)) out.push({ key: n.key, say: `${VERB_LABELS[verb]} needs ${arg.label.toLowerCase()}.` });
        else if (arg.kind === 'name' && !blank(v) && (typeof v !== 'string' || !NAME.test(v) || RESERVED.includes(v)))
          out.push({ key: n.key, say: `${String(v)} is not a name an answer can have. Use lower-case letters, digits and underscores.` });
        else if (arg.kind === 'span' && !blank(v) && (typeof v !== 'string' || everyMs(v) === null))
          out.push({ key: n.key, say: `${String(v)} is not a span. Write 30m, 2h, 3d or 1w.` });
        else if (arg.kind === 'later' && !blank(v) && (typeof v !== 'string' || !/^\d+[dwmy]$/u.test(v.trim())))
          out.push({ key: n.key, say: `${String(v)} is not a span. Write 14d, 2w, 3m or 1y.` });
      }
      if (verb === 'if') {
        if ((n.then ?? []).length === 0) out.push({ key: n.key, say: 'A branch says what to do then.' });
        if (depth + 1 > DEPTH_CEILING) out.push({ key: n.key, say: `Branches go ${DEPTH_CEILING} deep at most.` });
        walk(n.then ?? [], depth + 1);
        walk(n.else ?? [], depth + 1);
      }
    }
  };
  walk(d.steps, 0);
  return out;
}

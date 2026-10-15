/**
 * The names an automation's body points at: the title of every list, field, person, call, script, door, figure and kind
 * of job it names, keyed by the id as the body stores it.
 *
 * "NAME ON RULE" (H.408). A card printed a list or a call by its id in words (`flow.ts`'s `idWords`), because the read
 * of one automation answered the body and nothing it names, and the editor's names map was filled from the page's own
 * data, which knows the lists the rail shows and nothing else. The record holds every one of these titles, so it says
 * them once, beside the body, and every card can read "When an item in Ledger is added" and never a stored id.
 *
 * WALKED BY THE GRAMMAR, NEVER BY A LIST OF VERBS OF ITS OWN. Each argument of each trigger and step says what it picks
 * from (`from` in `@braindog/kernel/flow-grammar`), and an argument whose type is `steps` is a branch, walked at any
 * depth: both arms of an `if`, which sit beside it at the step's root as the grammar names them. A verb added to the
 * lint is a verb here, as it is on the canvas.
 *
 * A FIELD IS KEYED `<list>.<field>`, by the list it lives on. One named directly under its step or trigger (`set.field`,
 * `written.fields`, `create.each`) is a field of the run's row; one under a nested object (`link.to.by`) is a field of
 * the list that object picks (`link.to.register`), or of the row's own list when it picks none.
 *
 * PURE: `read` is handed in, so this asks nothing of a database and the record's read holds it to the caller's sight
 * (`automation()` in `automations.ts`). An id `read` cannot name, because it is gone or out of the caller's reach, is
 * left out and never guessed: the web keeps its own words for it.
 */

import { rowRegisterOf } from '@braindog/kernel';
import { flowGrammar, type Arg, type ArgFrom } from '@braindog/kernel/flow-grammar';

type Body = Record<string, unknown>;

const isObject = (x: unknown): x is Body => x !== null && typeof x === 'object' && !Array.isArray(x);

/** What the caller can name, each `null` where it cannot: gone, never declared, or out of the caller's sight. */
export type NamesRead = {
  /** A list's name, by its id (`tasks`). */
  listTitle(list: string): string | null;
  /** A field's label, by its list and its id. */
  fieldTitle(list: string, field: string): string | null;
  /** A person's name, by the id the record holds for them. */
  personName(id: string): string | null;
  /** A declaration's title, by its id: `ingest.<id>` for a call or a door, `script.<id>`, a kind of job's `job.<id>`. */
  declarationTitle(id: string): string | null;
  /** A figure's name, by its id as a trigger names it (`cash-now`). */
  figureTitle(id: string): string | null;
  /** A door's declaration, so an arrival's run is placed on the list the door writes (`rowRegisterOf`). */
  door?(name: string): unknown;
};

/**
 * How deep a branch is walked. The lint refuses past its own ceiling (`DEPTH_CEILING`), so a body that installed is
 * never this deep; one written by hand is still read no deeper than `automations.ts`'s `BODY_DEPTH`.
 */
const WALK_DEPTH = 32;

/** A text the run fills (`{{trigger.row.owner}}`) is no id, and names nothing until a run has it. */
const filled = (v: string): boolean => v.includes('{{');

const GRAMMAR = flowGrammar();

/** The value at a dotted argument name, read from `at`. */
function valueAt(at: Body, name: string): unknown {
  let node: unknown = at;
  for (const part of name.split('.')) {
    if (!isObject(node)) return undefined;
    node = node[part];
  }
  return node;
}

/** The ids an argument holds: one text, or a list of them, holes and blanks left out. */
const idsIn = (v: unknown): string[] =>
  (Array.isArray(v) ? v : [v]).flatMap((x) => (typeof x === 'string' && x.trim() !== '' && !filled(x) ? [x.trim()] : []));

/**
 * The list a field argument lives on: the list its nested object picks, or the run's row's. See the file's note.
 */
function fieldList(arg: Arg, args: readonly Arg[], at: Body, row: string | null): string | null {
  const parts = arg.name.split('.');
  if (parts.length < 3) return row;
  const parent = parts.slice(0, -1).join('.');
  const picker = args.find((a) => a.from === 'list' && a.name.split('.').slice(0, -1).join('.') === parent);
  const picked = picker === undefined ? [] : idsIn(valueAt(at, picker.name));
  return picked[0] ?? row;
}

/** One id a body picks, with what it picks from and, for a field, the list the field lives on. */
type Visit = (from: ArgFrom, id: string, list: string | null) => void;

/**
 * Every id a body picks, in the order a card reads them: the row's own list, the trigger's arguments, then each step's,
 * branches and all. `door` places an arrival's run on the list its door writes.
 */
function eachPick(body: Body, door: ((name: string) => unknown) | undefined, visit: Visit): void {
  const row = rowRegisterOf(body as Parameters<typeof rowRegisterOf>[0], (name) => door?.(name));

  /** One set of arguments read off `at`: what each picks, and the branches it holds walked. */
  const take = (args: readonly Arg[], at: Body, depth: number): void => {
    for (const arg of args) {
      const value = valueAt(at, arg.name);
      if (value === undefined) continue;
      if (arg.type === 'steps') {
        walk(value, depth + 1);
        continue;
      }
      if (arg.from === undefined) continue;
      const list = arg.from === 'field' ? fieldList(arg, args, at, row) : null;
      for (const id of idsIn(value)) visit(arg.from, id, list);
    }
  };

  /* A STEP MAY HOLD TWO VERBS, a branch with an action beside it (`{ if, link }` in a rule's `then`), and each is read. */
  const walk = (steps: unknown, depth: number): void => {
    if (!Array.isArray(steps) || depth > WALK_DEPTH) return;
    for (const step of steps) {
      if (!isObject(step)) continue;
      for (const g of GRAMMAR.steps) if (g.verb in step) take(g.args, step, depth);
    }
  };

  /* THE ROW'S OWN LIST FIRST, however the body places it: `on.written.register`, a rule's `register` from before `on:`,
     or the list an arrival's door writes. */
  if (row !== null) visit('list', row, null);
  if (isObject(body.on)) {
    const on = body.on;
    for (const t of GRAMMAR.triggers) if (t.id in on) take(t.args, on, 0);
  }
  walk(body.then, 0);
  walk(body.steps, 0);
}

/**
 * The lists a body names by the grammar, its row's among them: the sight a read of one automation already holds, since
 * the record shows a rule only to whoever reads every list it touches.
 */
export function listsNamed(body: Body, door?: (name: string) => unknown): Set<string> {
  const out = new Set<string>();
  eachPick(body, door, (from, id) => {
    if (from === 'list') out.add(id);
  });
  return out;
}

/**
 * Every name a rule's body points at, by the id as the body holds it:
 *   - a list as `register.<id>`, a field as `<list>.<field>`, a person as `person:<id>`;
 *   - a call's or a door's ingest as `ingest.<id>`, a script as `script.<id>`, a figure as `metric.<id>`;
 *   - a kind of job as the id the step holds, `job.<id>`.
 * A body that names nothing answers `{}`.
 */
export function automationNames(body: Body, read: NamesRead): Record<string, string> {
  const out: Record<string, string> = {};
  const put = (key: string, title: string | null): void => {
    if (key in out || title === null) return;
    const said = title.trim();
    if (said !== '') out[key] = said;
  };
  eachPick(body, read.door?.bind(read), (from, id, list) => {
    switch (from) {
      case 'list':
        return put(`register.${id}`, read.listTitle(id));
      case 'field':
        return list === null ? undefined : put(`${list}.${id}`, read.fieldTitle(list, id));
      case 'person':
        return put(`person:${id}`, read.personName(id));
      case 'call':
      case 'door':
        return put(`ingest.${id}`, read.declarationTitle(`ingest.${id}`));
      case 'script':
        return put(`script.${id}`, read.declarationTitle(`script.${id}`));
      case 'figure':
        return put(`metric.${id}`, read.figureTitle(id));
      case 'job':
        return put(id, read.declarationTitle(id));
    }
  });
  return out;
}

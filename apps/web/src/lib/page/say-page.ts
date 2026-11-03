/**
 * "CHANGE ANY PAGE BY SAYING IT" (DIRECTION §45 d8, Waves 4 and 6): one line typed about the page you are on, read by
 * rules first, and turned into a draft the page draws before anything is kept.
 *
 * THE COMMON PHRASINGS ARE RULES, NOT GUESSES, so they work with no model, at once and for nothing:
 * - "move Cash ahead up", "put Bills first", "move Late below Coming up", "Projects to the bottom";
 * - "hide the forecast", "take Arrivals off", and "show the forecast again";
 * - "add a chart of spend by month", "add open tasks as a board";
 * - "rename this list to Shops", "rename Projects to Clients", "rename this page to Launch desk";
 * - "show only open ones", "only this month", "hide paid ones", "newest first", "top 5" on the page's main list.
 * A line the rules cannot read comes back `null`, and only then is the model asked (`AskPage.svelte`), as before.
 *
 * WHERE EACH IS KEPT. A move, a hide and a show are the person's own look over the page (`look.<page>`), so a page an
 * add-on wrote keeps taking its updates, and every block he moved is pinned so the engine never moves it back. A filter,
 * a new block and a new title change the page's own declaration, as the block editor does. A rename is the record's
 * `renameList`. Each draft says what it does in one plain sentence, and is drawn before it is kept.
 *
 * PURE: no runes and no `$lib`, so `say-page.test.ts` holds it in Node.
 */

import type { LiveLook } from '../record/page-live.ts';
import type { BlockBody, PageBody } from '../record/pages-live.ts';
import { askedOf, choiceIn, joined, norm, unchanged, type AskField } from './change-this.ts';
import { composeOf, type ComposeList } from './compose.ts';

/** One block as the page draws it now, in the order it is drawn, with the key the record answered. */
export type SayBlock = {
  key: string;
  kind: string;
  heading: string | null;
  /** The list it reads, by id, or `null`. */
  register: string | null;
  /** Its source as the declaration writes it, to find it in the stored body. */
  source?: string | undefined;
  drawn: boolean;
  area: 'main' | 'rail';
};

/** One of the person's lists, with what a state filter needs. */
export type SayList = ComposeList & { state?: string | undefined; done?: readonly string[] | undefined };

export type SayIn = {
  text: string;
  /** The page the look is written under (`lookPage`). */
  slug: string;
  /** The page's own declaration, as the record stores it, and the version it was read at (`null` where not said). */
  body: PageBody;
  version?: number | null | undefined;
  /** Whether the person wrote the page (no add-on signed it), which a change to its declaration needs. */
  mine: boolean;
  blocks: readonly SayBlock[];
  look: LiveLook | null;
  lists: readonly SayList[];
  /** The list the page is about, or `null`. */
  current: string | null;
  now: number;
};

/** What a line came to: a look, a page body, a rename, or which block it meant. */
export type SaidPage =
  | { do: 'look'; question: string; said: string; look: Record<string, unknown>; preview: PageBody }
  | { do: 'body'; question: string; said: string; body: PageBody }
  | { do: 'rename'; question: string; said: string; list: string; was: string; name: string }
  | { do: 'which'; said: string };

export const sayWords = {
  hint: 'Move Bills up. Hide the forecast. Add a chart of spend by month. Rename this list to Clients. Show only open ones.',
  rulesOnly: 'This BrainDog has no model set up, so only the usual changes are read: move, hide, show, add a chart, rename, and only or newest first.',
  cannot: 'That is not one I can make from a line. Try "move Bills up", "hide the forecast", "add a chart of spend by month" or "show only open ones".',
  which: (names: readonly string[]) => `Which one: ${listed(names)}? Say it with its name.`,
  notMine: 'This page came with a plugin, so its blocks stay as they are. You can still move, hide or show them.',
  moved: (name: string, where: string) => `${name} ${where}.`,
  moveQ: (name: string, where: string, page: string) => `Move ${name} ${where} on ${page}?`,
  hideQ: (name: string, page: string) => `Hide ${name} on ${page}?`,
  hidden: (name: string) => `${name} is hidden. It keeps its setup, and Show brings it back.`,
  showQ: (name: string, page: string) => `Show ${name} on ${page} again?`,
  shown: (name: string) => `${name} is shown again.`,
  addQ: (name: string, page: string) => `Add ${name} to ${page}?`,
  renameQ: (was: string, name: string) => `Call ${was} ${name}?`,
  renamed: (was: string, name: string) => `${was} will be called ${name} everywhere.`,
  titleQ: (was: string, name: string) => `Rename the page ${was} to ${name}?`,
  titled: (name: string) => `The page is called ${name}.`,
  filterQ: (said: string, name: string) => `${said.replace(/\.$/u, '')} on ${name}?`,
  undone: 'Put back as it was.',
  kept: 'Kept.',
};

const listed = (names: readonly string[]): string => (names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} or ${names.at(-1)!}`);

/** The kinds that draw a list's entries, which a filter, a sort or a count is about. */
const ROWS: ReadonlySet<string> = new Set(['table', 'todo', 'cards', 'board', 'timeline', 'feed', 'calendar', 'lanes', 'queue', 'steps', 'gallery']);

/** The words a person adds after a block's name that are not its name. */
const FILLER = /\b(?:block|section|tile|card|part|widget|bit|panel|box|one)s?$/u;

const cleanName = (s: string): string =>
  s
    .trim()
    .replace(/^["'“‘]+|["'”’.!?]+$/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();

/** A name as typed, with a capital where it began with a small letter, so "clients" reads "Clients" in the rail. */
const named = (s: string): string => {
  const t = cleanName(s);
  return t === '' ? t : t.charAt(0).toUpperCase() + t.slice(1);
};

const nameOf = (b: SayBlock, lists: readonly SayList[]): string =>
  b.heading?.trim() || lists.find((l) => l.id === b.register)?.name || b.kind.charAt(0).toUpperCase() + b.kind.slice(1);

/**
 * The block a phrase names: by its heading, else by the list it reads, the closest first. One clear best is the
 * block; two alike are `which`; none is `null`.
 */
export function blockNamed(phrase: string, blocks: readonly SayBlock[], lists: readonly SayList[]): SayBlock | { which: string[] } | null {
  const want = norm(phrase.replace(/^(?:the|my|our|that|this)\s+/iu, '')).replace(FILLER, '').trim();
  if (want === '') return null;
  const scored = blocks.map((b) => {
    const head = norm(b.heading ?? '');
    const list = norm(lists.find((l) => l.id === b.register)?.name ?? '');
    const score =
      head === want ? 100
      : list === want && head === '' ? 90
      : head.startsWith(want) || want.startsWith(head) && head.length > 2 ? 70
      : list === want ? 60
      : head.includes(want) && want.length > 2 ? 50
      : want.split(' ').filter((w) => w.length > 2).every((w) => head.split(' ').some((h) => h.startsWith(w))) && want.length > 2 ? 40
      : 0;
    return { b, score };
  });
  const best = Math.max(0, ...scored.map((s) => s.score));
  if (best === 0) return null;
  const top = scored.filter((s) => s.score === best).map((s) => s.b);
  if (top.length === 1) return top[0]!;
  return { which: [...new Set(top.map((b) => nameOf(b, lists)))] };
}

/** The person's own look as it would be written: his pins, his hides, and his order, else the page as drawn. */
function ownLook(i: SayIn, order: readonly string[], change: { hide?: readonly string[]; pin?: readonly string[]; unhide?: readonly string[] }): Record<string, unknown> {
  const his = i.look?.by === 'owner' ? i.look : null;
  const pinned = new Set([...(his?.pinned ?? []), ...(change.pin ?? [])]);
  const hide = new Set([...(his?.hide ?? []), ...(change.hide ?? [])]);
  for (const k of change.unhide ?? []) hide.delete(k);
  for (const k of change.hide ?? []) pinned.delete(k);
  const keyed = (k: string): boolean => /^[a-z][a-z0-9_-]{0,47}$/u.test(k);
  return {
    look: i.slug,
    basis: his?.basis ?? 'said',
    by: 'owner',
    ...(his?.lead ? { lead: his.lead } : {}),
    ...(order.length ? { order: order.filter(keyed) } : {}),
    ...(hide.size ? { hide: [...hide].filter(keyed) } : {}),
    ...(pinned.size ? { pinned: [...pinned].filter(keyed) } : {}),
    ...(his?.span ? { span: his.span } : {}),
    ...(his?.area ? { area: his.area } : {}),
    ...(his?.group ? { group: his.group } : {}),
  };
}

/** The stored block a drawn one is: by its key, else by its kind, source and heading where one block alone has all three. */
function storedAt(body: PageBody, b: SayBlock): number {
  const keyed = body.blocks.findIndex((x) => x.key === b.key);
  if (keyed >= 0) return keyed;
  const said = (v: unknown): string => (typeof v === 'string' ? v.trim().toLowerCase() : '');
  const alike = body.blocks.flatMap((x, n) => (x.kind === b.kind && said(x.source) === said(b.source) && said(x.heading) === said(b.heading) ? [n] : []));
  return alike.length === 1 ? alike[0]! : -1;
}

/** The stored body with its blocks in the drawn order `keys` says, the ones it does not name kept after the one before. */
function bodyInOrder(i: SayIn, keys: readonly string[]): PageBody {
  const at = new Map<number, number>();
  for (const b of i.blocks) {
    const n = storedAt(i.body, b);
    const rank = keys.indexOf(b.key);
    if (n >= 0 && rank >= 0) at.set(n, rank);
  }
  let last = -1;
  const ranked = i.body.blocks.map((block, n) => {
    const r = at.get(n);
    last = r ?? last + 0.001;
    return { block, r: r ?? last };
  });
  return { ...i.body, blocks: ranked.sort((a, b) => a.r - b.r).map((x) => x.block) };
}

/* ── the phrasings ──────────────────────────────────────────────────────── */

const MOVE_TO = /^(?:move|put|bring|shift|take|place)\s+(.+?)\s+(up|down|higher|lower|to the top|to the bottom|at the top|at the bottom|on top|first|last|to the start|to the end|to the front|to the back)$/u;
const MOVE_BY = /^(?:move|put|bring|shift|place)\s+(.+?)\s+(above|before|over|below|after|under|beneath)\s+(.+)$/u;
const SAID_FIRST = /^(.+?)\s+(first|last|to the top|to the bottom|on top|at the top|at the bottom)$/u;
const HIDE = /^(?:hide|remove|drop|take off|take away|get rid of|lose|don t show|dont show|do not show|no more|stop showing)\s+(.+?)(?:\s+(?:off|from here|from this page))?$/u;
const TAKE_OFF = /^take\s+(.+?)\s+(?:off|away)(?:\s+(?:this page|here))?$/u;
const SHOW = /^(?:show|unhide|bring back|put back|restore)\s+(.+?)(?:\s+again|\s+back)?$/u;
const RENAME_THIS = /^(?:rename|call|name|retitle)\s+(this list|the list|this|it|this page|the page)\s+(?:to\s+|as\s+)?(.+)$/u;
const RENAME_NAMED = /^(?:rename|retitle)\s+(?:the\s+)?(.+?)\s+(?:list\s+)?(?:to|as)\s+(.+)$/u;
const ADD = /^(?:add|put|show me|give me|draw|make|i want|i d like|can i have)\s+(?:me\s+)?(?:a|an|the|some)?\s*(.+)$/u;
const ADD_SHAPE = /\b(?:chart|graph|bars?|line|lines|ring|pie|gauge|calendar|board|kanban|timeline|table|heat ?map|figure|count|total|list|cards|split|trend|breakdown)\b/u;

const OPEN_WORDS = /^(?:show\s+)?(?:only|just)\s+(?:the\s+)?(open|unfinished|undone|not done|pending|active|to do|todo|outstanding|left)(?:\s+(?:ones?|rows?|items?|entries|tasks|things))?$/u;
const DONE_WORDS = /^(?:show\s+)?(?:only|just)\s+(?:the\s+)?(done|finished|closed|completed|complete)(?:\s+(?:ones?|rows?|items?|entries|tasks|things))?$/u;
const HIDE_DONE = /^(?:hide|without|no)\s+(?:the\s+)?(done|finished|closed|completed)(?:\s+(?:ones?|rows?|items?|entries|tasks|things))?$/u;

/** Where a move puts a block, said as the toast says it. */
const WHERE: Readonly<Record<string, string>> = {
  up: 'up one',
  higher: 'up one',
  down: 'down one',
  lower: 'down one',
  'to the top': 'to the top',
  'at the top': 'to the top',
  'on top': 'to the top',
  first: 'to the top',
  'to the start': 'to the top',
  'to the front': 'to the top',
  'to the bottom': 'to the bottom',
  'at the bottom': 'to the bottom',
  last: 'to the bottom',
  'to the end': 'to the bottom',
  'to the back': 'to the bottom',
};

/**
 * The line as a draft, or `null` where the rules cannot read it. `which` asks which block a name meant, where two
 * blocks answer to it alike.
 */
export function sayPage(i: SayIn): SaidPage | null {
  const t = norm(i.text)
    .replace(/^(?:please|can you|could you|would you|just|now|ok|okay)\s+/u, '')
    .replace(/\s+(?:please|thanks|thank you)$/u, '')
    .trim();
  if (t === '') return null;
  const raw = i.text.trim().replace(/^(?:please|can you|could you|would you|just|now|ok|okay)\s+/iu, '');
  const title = i.body.title || i.slug;
  const drawn = i.blocks.filter((b) => b.drawn);

  /* A RENAME FIRST: "rename this list to Shops" names nothing on the page and must not be read as a move or a hide. */
  const renameThis = RENAME_THIS.exec(t);
  if (renameThis) {
    /* THE NEW NAME AS TYPED, with its own capitals: the regex ran on the folded line, so it is cut from the raw one. */
    const name = named(raw.slice(raw.length - renameThis[2]!.length));
    if (name === '') return null;
    const what = renameThis[1]!;
    const list = i.lists.find((l) => l.id === i.current) ?? null;
    if ((what === 'this list' || what === 'the list' || ((what === 'this' || what === 'it') && list !== null)) && list !== null) {
      if (norm(list.name) === norm(name)) return null;
      return { do: 'rename', question: sayWords.renameQ(list.name, name), said: sayWords.renamed(list.name, name), list: list.id, was: list.name, name };
    }
    if (!i.mine) return { do: 'which', said: sayWords.notMine };
    if (norm(title) === norm(name)) return null;
    return { do: 'body', question: sayWords.titleQ(title, name), said: sayWords.titled(name), body: { ...i.body, title: name } };
  }
  const renameNamed = RENAME_NAMED.exec(t);
  if (renameNamed) {
    const said = norm(renameNamed[1]!);
    const name = named(raw.slice(raw.length - renameNamed[2]!.length));
    const list = i.lists.find((l) => norm(l.name) === said || norm(l.id) === said) ?? null;
    if (list !== null && name !== '' && norm(list.name) !== norm(name))
      return { do: 'rename', question: sayWords.renameQ(list.name, name), said: sayWords.renamed(list.name, name), list: list.id, was: list.name, name };
    if (norm(title) === said && name !== '' && i.mine) return { do: 'body', question: sayWords.titleQ(title, name), said: sayWords.titled(name), body: { ...i.body, title: name } };
  }

  /* A MOVE: by a word ("up", "to the top") or beside another block ("below Coming up"). */
  const by = MOVE_BY.exec(t);
  const to = by ? null : (MOVE_TO.exec(t) ?? SAID_FIRST.exec(t));
  if (by || to) {
    const which = blockNamed((by ?? to)![1]!, drawn, i.lists);
    if (which !== null && 'which' in which) return { do: 'which', said: sayWords.which(which.which) };
    const other = by ? blockNamed(by[3]!, drawn, i.lists) : null;
    if (other !== null && 'which' in other) return { do: 'which', said: sayWords.which(other.which) };
    if (which !== null && (!by || other !== null)) {
      const keys = drawn.map((b) => b.key);
      const from = keys.indexOf(which.key);
      const rest = keys.filter((k) => k !== which.key);
      let at: number;
      let where: string;
      if (by && other) {
        const there = rest.indexOf(other.key);
        if (there < 0 || other.key === which.key) return null;
        const above = ['above', 'before', 'over'].includes(by[2]!);
        at = above ? there : there + 1;
        where = `${above ? 'above' : 'below'} ${nameOf(other, i.lists)}`;
      } else {
        where = WHERE[to![2]!] ?? 'up one';
        at = where === 'to the top' ? 0 : where === 'to the bottom' ? rest.length : where === 'up one' ? Math.max(0, from - 1) : Math.min(rest.length, from + 1);
      }
      const order = [...rest.slice(0, at), which.key, ...rest.slice(at)];
      if (order.join('\n') === keys.join('\n')) return null;
      const name = nameOf(which, i.lists);
      return { do: 'look', question: sayWords.moveQ(name, where, title), said: sayWords.moved(name, where === 'up one' ? 'moved up' : where === 'down one' ? 'moved down' : `moved ${where}`), look: ownLook(i, order, { pin: order }), preview: bodyInOrder(i, order) };
    }
  }

  /* SHOW ONE AGAIN: a block his look or the engine hid, by its name. */
  const show = SHOW.exec(t);
  if (show && /\b(?:again|back)\b|^(?:unhide|bring back|put back|restore)\b/u.test(t)) {
    const hidden = i.blocks.filter((b) => (i.look?.hide ?? []).includes(b.key));
    const which = blockNamed(show[1]!, hidden, i.lists);
    if (which !== null && 'which' in which) return { do: 'which', said: sayWords.which(which.which) };
    if (which !== null) {
      const name = nameOf(which, i.lists);
      const order = i.look?.by === 'owner' ? [...i.look.order] : [];
      return { do: 'look', question: sayWords.showQ(name, title), said: sayWords.shown(name), look: ownLook(i, order, { unhide: [which.key], pin: [which.key] }), preview: i.body };
    }
  }

  /* HIDE A BLOCK, by its name. A hide that names no block may still be a filter ("hide paid ones"), read below. */
  const hide = HIDE.exec(t) ?? TAKE_OFF.exec(t);
  if (hide) {
    const which = blockNamed(hide[1]!, drawn, i.lists);
    if (which !== null && 'which' in which) return { do: 'which', said: sayWords.which(which.which) };
    if (which !== null) {
      const name = nameOf(which, i.lists);
      const at = storedAt(i.body, which);
      const preview = at < 0 ? i.body : { ...i.body, blocks: i.body.blocks.filter((_, n) => n !== at) };
      const order = i.look?.by === 'owner' ? [...i.look.order] : [];
      return { do: 'look', question: sayWords.hideQ(name, title), said: sayWords.hidden(name), look: ownLook(i, order, { hide: [which.key] }), preview };
    }
  }

  /* ADD A BLOCK: what compose draws from a line ("a chart of spend by month", "open tasks as a board"). */
  const add = ADD.exec(t);
  if (add && ADD_SHAPE.test(add[1]!)) {
    if (!i.mine) return { do: 'which', said: sayWords.notMine };
    const made = composeOf({ text: add[1]!.replace(/^(?:chart|graph)\s+(?:of|for|showing)\s+/u, ''), lists: i.lists, current: i.current, now: i.now }) ?? composeOf({ text: add[1]!, lists: i.lists, current: i.current, now: i.now });
    if (made) {
      const block = made.block as BlockBody;
      return { do: 'body', question: sayWords.addQ(made.name.toLowerCase(), title), said: made.said, body: { ...i.body, blocks: [...i.body.blocks, block] } };
    }
  }

  /* A FILTER, A SORT OR A COUNT ON THE PAGE'S MAIN LIST: the first list block it draws, the one the page is about first. */
  const main = drawn.find((b) => b.register !== null && b.register === i.current && ROWS.has(b.kind)) ?? drawn.find((b) => b.register !== null && ROWS.has(b.kind));
  if (!main) return null;
  if (!i.mine) return /^(?:show|only|just|hide|without|newest|oldest|top|first|sort|order)\b/u.test(t) ? { do: 'which', said: sayWords.notMine } : null;
  const at = storedAt(i.body, main);
  if (at < 0) return null;
  const stored = i.body.blocks[at]!;
  const list = i.lists.find((l) => l.id === main.register) ?? null;
  if (list === null) return null;
  const fields: readonly AskField[] = list.fields;
  const blockName = nameOf(main, i.lists);
  const withWhere = (where: unknown, said: string): SaidPage | null =>
    where === null ? null : { do: 'body', question: sayWords.filterQ(said, blockName), said, body: { ...i.body, blocks: i.body.blocks.map((b, n) => (n === at ? { ...b, where } : b)) } };

  /* OPEN AND DONE BY THE LIST'S OWN STATES, which no choice is called "open". */
  const state = list.state;
  const done = list.done ?? [];
  if (state && done.length > 0) {
    const ctx = { register: list.id, fields, now: i.now };
    if (OPEN_WORDS.test(t) || HIDE_DONE.test(t)) {
      const sentence = done.map((d) => `${state} is not ${norm(d)}`).join(', ');
      return withWhere(joined(stored.where, sentence, ctx), 'Only the open ones.');
    }
    if (DONE_WORDS.test(t) && done.length === 1) return withWhere(joined(stored.where, `${state} is ${norm(done[0]!)}`, ctx), `Only the ${norm(done[0]!)} ones.`);
  }
  const asked = askedOf({ text: t.replace(/^show\s+(?=only|just)/u, ''), block: stored, register: list.id, fields, kinds: [], now: i.now });
  if (asked === null) {
    /* "OPEN ONES" WHERE A CHOICE IS CALLED OPEN, read by the choice itself. */
    const one = /^(?:show\s+)?(?:only|just)\s+(?:the\s+)?(.+?)(?:\s+ones?)?$/u.exec(t);
    const hit = one ? choiceIn(one[1]!, fields) : null;
    return hit ? withWhere(joined(stored.where, `${hit.field.id} is ${norm(hit.value)}`, { register: list.id, fields, now: i.now }), `Only ${norm(hit.value)}.`) : null;
  }
  if (unchanged(stored, asked.patch)) return null;
  return { do: 'body', question: sayWords.filterQ(asked.said, blockName), said: asked.said, body: { ...i.body, blocks: i.body.blocks.map((b, n) => (n === at ? { ...b, ...asked.patch } : b)) } };
}

/**
 * One path into a parsed response, and what is wrong with a path that is not one.
 *
 * WHY IT IS HERE AND NOT IN THE PACKAGE THAT USES IT. `47 §4.3` writes this grammar for `connect`'s
 * `expect:` and `page.from:`; `43 §4.4` writes the same one for `extract`'s `read.rows:`; the record
 * reads a page's rows back with it in `applyPull`. Three readers of one grammar is one grammar, and
 * the package that already owns "how a declaration names a thing" is this one. A second copy in
 * `connect` would be a second answer to `data[-1].id`, and the day they disagreed the symptom would
 * be a connector that pages forever.
 *
 * IT IS NOT `where:`. A predicate asks a question about a row the record holds; this walks a shape a
 * stranger sent. They share a file tree and nothing else — no operators, no schema, no refusal. The
 * one thing they do share is the posture: a path that cannot be read is named, never guessed at.
 *
 * THE GRAMMAR, `47 §4.3` verbatim:
 *
 *   path  = seg { "." seg }
 *   seg   = key { index }
 *   key   = [A-Za-z_] { [A-Za-z0-9_-] }
 *   index = "[" integer "]" | "[-1]" | "[]"          ([] = every element; legal at most once)
 *
 * There is no wildcard key, no filter and no function, and that is a ceiling rather than an
 * omission: it covered every response shape of `25 §4`, and the first path that needs a function is
 * a path that needs a person to look at the provider.
 *
 * OWN PROPERTIES ONLY. `readPath(body, 'constructor.prototype')` answers `undefined`, and so does
 * every other reach into a prototype, because the object on the left is JSON a provider sent. This
 * is `Object.hasOwn` and one line, and it is the difference between a path grammar and a way to ask
 * a stranger's body what the host's `Object` looks like.
 *
 * A KEY STEP INTO A LIST IS MISSING RATHER THAN CLEVER. `rows.length` reads as `undefined`, not as a
 * count: `length` is a property of the host's array and not of anything the provider sent, and a
 * grammar that answers it has quietly grown a function.
 */

/** A parsed JSON body, as far as this file is concerned. */
export type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

/**
 * What one path reads.
 *
 * A LIST ARM BECAUSE `[]` EXISTS. Without it every caller would narrow by hand, and the one thing a
 * caller must not do is confuse "the value is a list" with "the path fanned out over a list" — the
 * second is what makes an `expect:` mean *all of them* (`47 §5.4`).
 */
export type Read = Json | undefined | (Json | undefined)[];

const KEY = String.raw`[A-Za-z_][A-Za-z0-9_-]*`;
const INDEX = String.raw`\[(?:-?\d+)?\]`;
const SEG = `${KEY}(?:${INDEX})*`;
const PATH = new RegExp(String.raw`^${SEG}(?:\.${SEG})*$`, 'u');
const STEPS = new RegExp(`(${KEY})|${INDEX}`, 'gu');

/**
 * What is wrong with a path, in words, or null when nothing is.
 *
 * FOR LINT, NOT FOR THE RUN. `declare` refuses a malformed path at install (`42`), because a path
 * that cannot be parsed is a declaration somebody mistyped and not a provider behaving badly. At run
 * time `readPath` simply answers `undefined`, the same as a path that named a key the body does not
 * have — a connector must not throw on the shape of its own declaration halfway through a page.
 */
export function pathFault(path: string): string | null {
  if (path === '') return 'an empty path';
  if (!PATH.test(path)) return `a path this grammar cannot read: "${path}"`;
  const fans = path.split('[]').length - 1;
  if (fans > 1) return `a path that fans out more than once: "${path}"`;
  return null;
}

/** Whether a path fans out, which is what makes its answer a list rather than a value. */
export const fansOut = (path: string): boolean => path.includes('[]');

/**
 * The value one path reads, `undefined` where any step is missing, and a list where `[]` was used.
 *
 * A MISSING ELEMENT STAYS IN THE LIST AS `undefined` rather than being dropped. `data[].status` over
 * three rows where one has no `status` must not read as two rows that all passed: dropping it is how
 * a check over every element silently becomes a check over the elements that happened to have the
 * field, which is the failure that looks exactly like it worked.
 */
export function readPath(json: Json | undefined, path: string): Read {
  if (pathFault(path) !== null) return undefined;
  let here: (Json | undefined)[] = [json];
  let fanned = false;

  for (const m of path.matchAll(STEPS)) {
    const token = m[0];
    const key = m[1];

    if (token === '[]') {
      /* THE FAN-OUT FLATTENS ONCE AND EVERY LATER STEP IS PER ELEMENT. `[]` is legal at most once,
         so `here` is a list from this point on and never a list of lists. A body with no list where
         one was named fans out to one missing element rather than to none: a check over every
         element of nothing must not read as a check that passed. */
      here = here.flatMap((node) => (Array.isArray(node) ? node : [undefined]));
      fanned = true;
      continue;
    }

    here = here.map((node) => {
      if (key !== undefined) {
        /* A KEY IS FOR AN OBJECT, and own properties only: the thing on the left is JSON a stranger
           sent, so `constructor` and `__proto__` are missing keys and not a way in. An array reached
           by a key is missing rather than introspected — `rows.length` is the host's property. */
        if (node === null || typeof node !== 'object' || Array.isArray(node)) return undefined;
        return Object.hasOwn(node, key) ? node[key] : undefined;
      }
      return Array.isArray(node) ? node.at(Number(token.slice(1, -1))) : undefined;
    });
  }

  return fanned ? here : here[0];
}

/**
 * `43 §4.4`'s path, to live beside `readPath` in `packages/where/src/path.ts`.
 *
 * TWO GRAMMARS IN ONE FILE, ON PURPOSE. `path.ts` opens by arguing that three readers of one grammar is one
 * grammar, and that a second copy in `connect` would be a second answer to `data[-1].id`. That argument is
 * right and this is what honouring it costs: `47 §4.3` and `43 §4.4` are not the same grammar, so the choice
 * is not "one or two" but "two where a reader can see both, or two in packages that never look at each other".
 *
 * WHERE THEY DIVERGE, AND WHY EACH DIVERGENCE IS LOAD-BEARING:
 *
 *   key charset · `47` keys are `[A-Za-z_][A-Za-z0-9_-]*`; `43` keys are anything but `.`, `[` and `]`.
 *     A connector's path names a field in a JSON body somebody designed. An extractor's path names a CSV
 *     header (`Amount (EGP)`) or an XML element carrying a namespace prefix (`atom:entry`, which `43 §5.5`
 *     requires be literal). Narrowing `43` to `47`'s charset would make the Atom case unreadable; widening
 *     `47` to `43`'s would stop `declare` catching a typo at install, which is `47`'s whole reason for
 *     having `pathFault`.
 *
 *   a missing element in a fan · `47` keeps it as `undefined`; `43` drops it.
 *     `readPath`'s comment says why: a check over every element must not quietly become a check over the
 *     elements that had the field. `selectAll` answers rows to extract from, and a row that is not there is
 *     not a row — keeping a hole would make `data[].amount` over ten rows with two gaps produce ten
 *     candidates, two of which are the absence of a candidate.
 *
 *   how many fans · `47` allows one, `43` allows one per segment.
 *     One fan keeps `Read`'s list arm one level deep, which is what lets an `expect:` mean *all of them*
 *     without nesting. `selectAll` returns a flat list either way, so the restriction buys it nothing and
 *     costs it `data[].tags[]`.
 *
 *   a malformed path · `47` reads `undefined` at run and is caught by `pathFault` at install; `43` refuses.
 *     Same posture, different door. Both say a bad path is a declaration somebody mistyped.
 *
 * NO `RegExp` HERE EVEN THOUGH THE FILE AROUND IT HAS THREE, and not because of `43 §8`'s ban — that ban is
 * scoped to `packages/extract/` and this is `where`. It is because `PATH` and `STEPS` match a declaration,
 * which is short and authored, while everything `selectAll`'s caller does next walks a stranger's body. The
 * one-index parser below is about the same length as the pattern it replaces, so the cheap thing and the
 * careful thing are the same thing.
 */

export type PathInvalid = { code: 'PATH_INVALID'; at: string; fix: string };

const bad = (at: string, fix: string): PathInvalid => ({ code: 'PATH_INVALID', at, fix });

/** `43 §10`. A path longer than this is a shape that wants a person, not a deeper walk. */
const SEGMENTS_MAX = 16;

const isDigit = (ch: string | undefined): boolean => ch !== undefined && ch >= '0' && ch <= '9';

type Segment = { key: string | null; index: 'all' | 'last' | number | null };

/**
 * One segment: a key, an index, or a key with one index after it.
 *
 * ONE INDEX PER SEGMENT, which is what `43 §4.4`'s `segment = key [ index ] | index` says and what `a[0][1]`
 * does not get. A second index is refused rather than quietly reading the first, because an author who wrote
 * it meant something the grammar cannot express and install is where they should hear that.
 */
function segment(text: string, at: string): Segment {
  const open = text.indexOf('[');
  if (open === -1) {
    if (text.length === 0) throw bad(at, 'A path segment cannot be empty. Write a.b, not a..b.');
    if (text.includes(']')) throw bad(at, 'A key cannot hold [ or ]; those are how an index is written.');
    return { key: text, index: null };
  }
  const key = text.slice(0, open);
  if (key.includes(']')) throw bad(at, 'A key cannot hold [ or ]; those are how an index is written.');
  if (text[text.length - 1] !== ']')
    throw bad(at, 'An index is written [n], [-1] or [], and ends the segment.');
  const inner = text.slice(open + 1, text.length - 1);
  if (inner.includes('[') || inner.includes(']'))
    throw bad(at, 'One index per segment: a[0][1] is not a path this grammar can read.');

  let index: Segment['index'];
  if (inner === '') index = 'all';
  else if (inner === '-1') index = 'last';
  else {
    for (const ch of inner)
      if (!isDigit(ch)) throw bad(at, 'An index is [n] for a position, [-1] for the last, or [] for every one.');
    index = Number(inner);
  }
  return { key: key === '' ? null : key, index };
}

/** The compiled path, or a refusal. An empty path is the root. */
function compile(path: string, at: string): Segment[] {
  if (path === '') return [];
  const parts = path.split('.');
  if (parts.length > SEGMENTS_MAX)
    throw bad(at, `A path reads at most ${SEGMENTS_MAX} segments deep. Read a shorter path and map the rest.`);
  return parts.map((p) => segment(p, at));
}

const isObject = (v: Json): v is { [k: string]: Json } =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Every value the path reaches, in order. Missing reaches nothing; `[]` multiplies.
 *
 * A LIST AND NOT A VALUE, because `[]` exists: `data[].amount` over ten rows is ten answers, and a function
 * returning one would have to pick, here, with nothing to pick on. `map:` needs exactly one and says so at
 * its own door (`43 §4.5`), which is where that rule belongs.
 *
 * OWN PROPERTIES ONLY, the same `Object.hasOwn` and for the same reason as `readPath`: the object on the left
 * is a body a stranger sent, so `__proto__` and `constructor` reach nothing rather than reach a function. No
 * key from a payload is ever assigned here, so there is no pollution surface at all — this is about not
 * reading the host's `Object` where a field was expected.
 */
export function selectAll(value: Json, path: string, at = 'path'): Json[] {
  let here: Json[] = [value];
  for (const seg of compile(path, at)) {
    const next: Json[] = [];
    for (const one of here) {
      let got: Json | undefined = one;
      if (seg.key !== null) got = isObject(one) && Object.hasOwn(one, seg.key) ? one[seg.key] : undefined;
      if (got === undefined) continue;
      if (seg.index === null) {
        next.push(got);
        continue;
      }
      if (!Array.isArray(got)) continue;
      if (seg.index === 'all') next.push(...got);
      else if (seg.index === 'last') {
        if (got.length > 0) next.push(got[got.length - 1]!);
      } else if (seg.index < got.length) next.push(got[seg.index]!);
    }
    here = next;
  }
  return here;
}

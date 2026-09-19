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

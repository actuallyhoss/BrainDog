/**
 * The one address check: what an add-on may point at outside the record, and what a listing may not say.
 *
 * AN ADDRESS A PAGE LOADS IS A CALL HOME. An image in a note is fetched by whoever opens the page, so its host learns
 * who opened it and when, from a file the owner approved as words. `REMOTE_ASSET` covered a theme's values and nothing
 * else (`colourFault` in the kernel's `declare.ts`), so the same address in a note, an example row or a setting's
 * default installed without a word. `addressFault` walks every string of every declaration, example row and setting,
 * and the blocks a pack adds to another pack's page, and lets an address stand only where the record already says what
 * it does with one:
 *
 * - a `link` block's written rows, where it is a place to go and nothing is fetched;
 * - an `embed` block's written rows, which the kernel's `embed` kind holds to its five players at install;
 * - a door's own address (`url`, `fetch.base`) and a digest's `webhook.url`, each a call out the owner approves by host;
 * - a script's `egress`, and in its `source` only an address on a host that `egress` names;
 * - a `url` field's default, and an example row's field that is not a document, which a row holds as words;
 * - the manifest's `homepage`.
 *
 * AND ONLY AS THE WHOLE VALUE. An allowed place holding words around an address is refused like any other, so a link's
 * address cell cannot carry an image beside the link.
 *
 * `data:` IS REFUSED EVERYWHERE, the allowed places included: it is a file inside a string, and no place takes one.
 *
 * IT JUDGES WHERE AN ADDRESS SITS AND NEVER WHAT IT IS. Whether a door's address is https, or an embed is one of the
 * five players, is the kernel's to say in its own sentence, and a second opinion here would be a second sentence.
 *
 * A LEAF: nothing of this package or the kernel is imported at run time, so the Kennel's door, the command line and the
 * install plan read one walker.
 */

import type { Refusal } from '@braindog/ports';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The kinds a declaration begins with. A copy of the kernel's `KINDS`, read only to find a raw declaration's kind. */
const KIND_KEYS = ['register', 'page', 'block', 'ingest', 'rule', 'metric', 'theme', 'digest', 'script', 'job', 'look'];

/** An http or https address with a host after it, so the words "an https:// address" are not one. */
const ADDRESS = /https?:\/\/[^\s"'<>`)\]]+/giu;
/**
 * An address with no scheme, where a page would load it: after `](`, an attribute's `=`, a stylesheet's `url(`, or the
 * colon of a reference a note defines on a line of its own (`[r]: //host/a.png`).
 */
const BARE_HOST = /(?:\]\(|=\s*["']?|\burl\(\s*["']?|^[ \t]*\[[^\]\n]+\]:)\s*(\/\/[^\s/"'<>`)\]][^\s"'<>`)\]]*)/gimu;
/** A file carried in a string: `data:image/png;base64,` and its kin. */
const DATA = /\bdata:[a-z]+\/[a-z0-9.+-]+\s*[;,]/iu;

const shown = (address: string): string => JSON.stringify(address.length > 80 ? `${address.slice(0, 80)}...` : address);

const WHERE = 'An address goes in a link block, an embed of YouTube, Vimeo, Loom, Figma or Google Maps, a door\'s url, a script\'s egress or a url field.';

const remote = (at: string, address: string): Refusal => ({
  code: 'REMOTE_ASSET',
  fix: `${at} holds the address ${shown(address)}. A plugin loads nothing from elsewhere, because whatever a page loads tells its host who opened the page. ${WHERE}`,
  at,
});

const carried = (at: string): Refusal => ({
  code: 'REMOTE_ASSET',
  fix: `${at} holds a data: address, which is a file written into a string. A plugin carries no file, in any place.`,
  at,
});

/** Every address in a string, in the order written. */
function addressesIn(text: string): string[] {
  const out = [...text.matchAll(ADDRESS)].map((m) => m[0]);
  for (const m of text.matchAll(BARE_HOST)) if (m[1] !== undefined) out.push(m[1]);
  return out;
}

/** The origin of an address, lower case, or `null` when it does not read as one. */
function originOf(address: string): string | null {
  try {
    return new URL(address).origin.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * What one walk may let stand: the places whose whole value may be an address, and for a script's `source` the origins
 * its `egress` names.
 */
type Allowed = { whole: Set<string>; source?: { at: string; origins: Set<string> }; recipe?: { ats: Set<string>; origins: Set<string> } };

/** Whether a block's written rows are being read: a page, a block, or a block added to another pack's page. */
type Walk = { allowed: Allowed; blocks: boolean; out: Refusal[] };

function judge(text: string, at: string, w: Walk): void {
  if (DATA.test(text)) {
    w.out.push(carried(at));
    return;
  }
  const found = addressesIn(text);
  if (found.length === 0) return;
  /* THE WHOLE VALUE AND NOTHING BESIDE IT, so an allowed place cannot carry a second address in its words. */
  if (w.allowed.whole.has(at) && found.length === 1 && text.trim() === found[0]) return;
  /* A DOOR'S CONNECT RECIPE: text a person copies into another service, shown as words and never loaded, so it may name
     the hosts its `connect.names` lists, which the plan shows before install, and no other. */
  const recipe = w.allowed.recipe;
  if (recipe !== undefined && recipe.ats.has(at)) {
    const stray = found.find((a) => {
      const origin = originOf(a);
      return origin === null || !recipe.origins.has(origin);
    });
    if (stray === undefined) return;
    w.out.push({
      code: 'REMOTE_ASSET',
      fix: `${at} names the address ${shown(stray)}, and its host is not one the recipe's connect.names lists. A recipe names only the hosts it says it reaches.`,
      at,
    });
    return;
  }
  const source = w.allowed.source;
  if (source !== undefined && source.at === at) {
    const stray = found.find((a) => {
      const origin = originOf(a);
      return origin === null || !source.origins.has(origin);
    });
    if (stray === undefined) return;
    w.out.push({
      code: 'REMOTE_ASSET',
      fix: `${at} names the address ${shown(stray)}, and its host is not one the script's egress lists. A script names in its source only the hosts it says it calls.`,
      at,
    });
    return;
  }
  w.out.push(remote(at, found[0] ?? ''));
}

function walk(node: unknown, at: string, w: Walk, depth = 0): void {
  /* A DOCUMENT NESTED PAST ANY DECLARATION IS `normalise`'s to refuse (`nestedPast`); this only declines to follow it. */
  if (depth > 64) return;
  if (typeof node === 'string') return judge(node, at, w);
  if (Array.isArray(node)) {
    for (const [i, v] of node.entries()) walk(v, `${at}[${i}]`, w, depth + 1);
    return;
  }
  if (!isObj(node)) return;
  /* A LINK'S ROWS ARE `{ cells: [title, address, note] }` AND AN EMBED'S `{ cells: [address, title, shape] }`. */
  if (w.blocks && (node.kind === 'link' || node.kind === 'embed') && Array.isArray(node.authored)) {
    const cell = node.kind === 'link' ? 1 : 0;
    for (const i of node.authored.keys()) w.allowed.whole.add(`${at}.authored[${i}].cells[${cell}]`);
  }
  for (const [k, v] of Object.entries(node)) walk(v, `${at}.${k}`, w, depth + 1);
}

/** One declaration as the walker reads it, from a normalised pack's `{ kind, id, body }` or a file's `{ <kind>: name }`. */
function declarationOf(d: unknown): { kind: string; id: string; body: Obj } | null {
  if (!isObj(d)) return null;
  if (typeof d.kind === 'string' && typeof d.id === 'string' && isObj(d.body)) return { kind: d.kind, id: d.id, body: d.body };
  const kind = Object.keys(d)[0] ?? '';
  if (!KIND_KEYS.includes(kind)) return null;
  return { kind, id: `${kind}.${String(d[kind])}`, body: d };
}

/** A list's fields that hold an address, by field id: `url`, and a list of them. */
function urlFields(body: Obj): Map<string, number> {
  const out = new Map<string, number>();
  for (const [i, f] of (Array.isArray(body.fields) ? body.fields : []).entries())
    if (isObj(f) && typeof f.id === 'string' && (f.type === 'url' || (f.type === 'list' && f.of === 'url'))) out.set(f.id, i);
  return out;
}

/**
 * A list's fields a row holds as plain words, by id: every field but a `document`, which a page draws as written, so an
 * address in one is an address a page loads.
 */
function plainFields(body: Obj): Set<string> {
  const out = new Set<string>();
  for (const f of Array.isArray(body.fields) ? body.fields : [])
    if (isObj(f) && typeof f.id === 'string' && f.type !== 'document' && !(f.type === 'list' && f.of === 'document')) out.add(f.id);
  return out;
}

/** The places in one declaration whose whole value may be an address, before its blocks are walked. */
function allowedIn(kind: string, id: string, body: Obj): Allowed {
  const whole = new Set<string>();
  if (kind === 'ingest') {
    whole.add(`${id}.url`);
    whole.add(`${id}.fetch.base`);
    const connect = isObj(body.connect) ? body.connect : null;
    if (connect !== null) {
      const ats = new Set<string>();
      const origins = new Set<string>();
      for (const [i, host] of (Array.isArray(connect.names) ? connect.names : []).entries()) {
        whole.add(`${id}.connect.names[${i}]`);
        const origin = typeof host === 'string' ? originOf(host) : null;
        if (origin !== null) origins.add(origin);
      }
      for (const i of (Array.isArray(connect.files) ? connect.files : []).keys()) ats.add(`${id}.connect.files[${i}].text`);
      return { whole, recipe: { ats, origins } };
    }
  }
  if (kind === 'digest') whole.add(`${id}.webhook.url`);
  if (kind === 'register') for (const i of urlFields(body).values()) whole.add(`${id}.fields[${i}].default`);
  if (kind !== 'script') return { whole };
  const origins = new Set<string>();
  for (const [i, host] of (Array.isArray(body.egress) ? body.egress : []).entries()) {
    whole.add(`${id}.egress[${i}]`);
    const origin = typeof host === 'string' ? originOf(host) : null;
    if (origin !== null) origins.add(origin);
  }
  return { whole, source: { at: `${id}.source`, origins } };
}

/**
 * Every address an add-on holds where none may be, each as `REMOTE_ASSET` naming the declaration and the key, in the
 * order the file says them. Empty for a document that is not one, which is `normalise`'s to refuse.
 *
 * `doc` IS A NORMALISED PACK OR THE FILE AS WRITTEN: the manifest's keys are read from `doc.manifest` when there is one
 * and from the document itself when there is not, so `pack check` can run it over a file `normalise` would refuse.
 */
export function addressFaults(doc: unknown): Refusal[] {
  if (!isObj(doc)) return [];
  const out: Refusal[] = [];
  const manifest = isObj(doc.manifest) ? doc.manifest : doc;

  /* A SETTING: its default, and its label and values, which are drawn as the default is. */
  if (isObj(manifest.config)) walk(manifest.config, 'config', { allowed: { whole: new Set() }, blocks: false, out });

  const registers = new Map<string, Set<string>>();
  for (const raw of Array.isArray(doc.declarations) ? doc.declarations : []) {
    const d = declarationOf(raw);
    if (d === null) continue;
    if (d.kind === 'register') registers.set(d.id.slice('register.'.length), plainFields(d.body));
    walk(d.body, d.id, { allowed: allowedIn(d.kind, d.id, d.body), blocks: d.kind === 'page' || d.kind === 'block', out });
  }

  /* WHAT IT LAYS ON OTHER PACKS' LISTS AND PAGES, which are declarations in everything but where they are written. */
  if (isObj(manifest.extends))
    for (const [list, laid] of Object.entries(manifest.extends)) {
      const whole = new Set<string>();
      if (isObj(laid)) for (const i of urlFields(laid).values()) whole.add(`extends.${list}.fields[${i}].default`);
      walk(laid, `extends.${list}`, { allowed: { whole }, blocks: false, out });
    }
  for (const [i, added] of (Array.isArray(manifest.adds) ? manifest.adds : []).entries())
    walk(added, `adds[${i}]`, { allowed: { whole: new Set() }, blocks: true, out });

  for (const [i, seed] of (Array.isArray(doc.seeds) ? doc.seeds : []).entries()) {
    if (!isObj(seed)) continue;
    const fields = typeof seed.register === 'string' ? registers.get(seed.register) : undefined;
    const whole = new Set<string>();
    /* AN EXAMPLE ROW'S ADDRESS, as the whole of a field its own list declares, or of one item of a list field: a
       bookmark or a repository, which a row holds as words and no drawer loads. Never in a document, which is drawn. */
    for (const id of fields ?? []) {
      whole.add(`seeds[${i}].fields.${id}`);
      const value = isObj(seed.fields) ? seed.fields[id] : undefined;
      if (Array.isArray(value)) for (const n of value.keys()) whole.add(`seeds[${i}].fields.${id}[${n}]`);
    }
    walk(seed.fields, `seeds[${i}].fields`, { allowed: { whole }, blocks: false, out });
    walk(seed.note, `seeds[${i}].note`, { allowed: { whole: new Set() }, blocks: false, out });
  }
  return out;
}

/** The first address an add-on holds where none may be, or `null`: what the plan, the Kennel and `pack check` refuse with. */
export function addressFault(doc: unknown): Refusal | null {
  return addressFaults(doc)[0] ?? null;
}

/** What a listing never says, and the sentence for each. The Kennel sells nothing and scores nothing. */
const UNLISTED: Record<string, string> = {
  price: 'The Kennel lists nothing for sale, and every plugin in it is free.',
  paid: 'The Kennel lists nothing for sale, and every plugin in it is free.',
  rating: 'The Kennel keeps no ratings, so a plugin is read for what it does.',
  stars: 'The Kennel keeps no ratings, so a plugin is read for what it does.',
};

/**
 * Why a manifest cannot be listed, or `null`: it says `price`, `paid`, `rating` or `stars`, refused by that name.
 *
 * `PACK_MALFORMED`, AS THE KENNEL'S OTHER REFUSALS OF A FILE'S OWN KEYS ARE (`kennel.ts`, a file with no title). Read
 * from the file as written or from a normalised pack's manifest, and in either letter case, so `Price` is not a way in.
 */
export function listingFault(manifest: unknown): Refusal | null {
  if (!isObj(manifest)) return null;
  for (const from of [manifest, isObj(manifest.manifest) ? manifest.manifest : {}])
    for (const key of Object.keys(from)) {
      const said = UNLISTED[key.toLowerCase()];
      if (said !== undefined && Object.hasOwn(UNLISTED, key.toLowerCase()))
        return { code: 'PACK_MALFORMED', fix: `This file says ${key}. ${said} Take ${key} off and submit it again.`, at: key };
    }
  return null;
}

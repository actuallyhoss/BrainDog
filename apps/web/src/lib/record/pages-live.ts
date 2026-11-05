/**
 * The page declarations a record holds, read as the record stores them.
 *
 * A ROUTE-ONLY MODULE: the client carries the route table as a value.
 *
 * WHY THIS EXISTS. `setDeclaration` installs a WHOLE page declaration body, so adding one block to a
 * page needs that page's entire current body first, and the app had no way to ask for one. The only
 * page bodies it held were the built-in sample's, which belong to a fictional studio, so a gesture
 * that bound a block onto a page would have written that studio's blocks over a real customer's
 * page. This is the missing read, and it is only the read.
 *
 * `pages` DOES NOT CARRY A BODY. The record answers it with `{ slug, title }` per page and nothing
 * else: the handler maps its list down to those two keys deliberately, because a page's register
 * list is information about what the business holds and the filter above it exists to withhold
 * exactly that. So a body comes from `page`, one call per slug, and this module is the list plus one
 * read each.
 *
 * `page` ANSWERS THE DECLARATION WITH THE RUN SPREAD ON TOP OF IT. The kernel's `BlockResult` is a
 * `PageBlock` with the answer's keys added, so every declared key survives beside `rows`, `matched`
 * and the rest. Taking the run keys back off is what turns an answer into a body, and the list of
 * them below is the kernel's own rather than a guess at it.
 *
 * A TEMPLATE IS NEVER HANDED BACK AS A BODY. A page declaring `for:` is one declaration and one page
 * per row, and `page` answers the EXPANDED page with every `{{field}}` already filled from that row.
 * That is not what the record stores, and installing it again would turn one template into a literal
 * page about one row, quietly deleting the other rows' pages. Those are named separately and kept
 * out of the bodies, so a caller cannot pick one up by accident.
 *
 * AND THERE WAS NEVER A SAMPLE HERE. When the other readers still fell back to the built-in sample,
 * this one alone would not: the sample's pages were the fictional studio's, and handing one back
 * under a real record's slug is the precise write this read exists to make unnecessary. It answered
 * `absent` for `UNREACHABLE` and `UNAUTHORIZED` instead, and every caller turned that into "the
 * record could not be reached", which was untrue of a 401: the record was reached and said to sign
 * in. With the sample gone those two codes carry no second meaning, so they are the
 * record's or the client's sentence like any other refusal.
 */

import { createClient, type ClientOptions } from '@braindog/client';
import { BLOCK_INSTALLS, defaultBlockKey } from '@braindog/kernel';

export type Fetch = NonNullable<ClientOptions['fetch']>;

export const declWords = {
  changed: 'The pages changed while they were being read.',
  /* Said about a page, not to a person yet: no screen calls this reader. It is the reason the body
     is withheld, in the terms whoever reads the answer needs. */
  expanded:
    'This page is declared once and drawn once per row, so what the record answers is an expansion of that declaration rather than the body it stores.',
} as const;

/**
 * A block declaration, as the record stores it.
 *
 * AN OPEN SHAPE, AND THAT IS THE HONEST ONE. There are two `PageBlock` types in this repository and
 * they are not the same type: the app's in `schema.ts` writes `columns` as a readonly array of
 * `{ field, label?, width?, align?, link?, as? }` and knows `authored`, `tone` and `body`, while the
 * kernel's in `pages.ts` writes `columns` as a mutable array of `{ field, label?, as? }`, declares
 * none of those three, and carries an index signature so a pack may write keys the type never
 * mentions. Neither is a description of the other. What arrives here is JSON a pack or an agent
 * wrote, checked by the record against its own allowlist and by nothing on this side, so asserting
 * it into either named type would be this module claiming a shape it never looked at. The one key
 * every block has is its `kind`.
 */
export type BlockBody = { kind: string; [key: string]: unknown };

/** A page declaration body, as the record stores it. Open for the reason `BlockBody` is. */
export type PageBody = {
  page: string;
  title: string;
  blocks: BlockBody[];
  [key: string]: unknown;
};

/** One page the record declares, with the body it holds for it and the version it holds it at (`null` when not said). */
export type DeclaredPage = { slug: string; title: string; body: PageBody; version: number | null };

/** A page whose answer is an expansion rather than a stored body, and why it is being withheld. */
export type Expanded = { slug: string; title: string; why: string };

/**
 * `absent` IS ANSWERED BY NOTHING NOW, and stays in both unions only because `bind-write.ts`,
 * `page-write.ts` and the settings screen still ask for it by name: a comparison against an arm the
 * union lacks is a compile error there, in files this change does not own. Drop it with those checks.
 */
export type Opened =
  | { from: 'live'; pages: DeclaredPage[]; expanded: Expanded[] }
  | { from: 'absent' }
  | { from: 'refused'; fix: string; code?: string };

export type OneOpened =
  | { from: 'live'; page: DeclaredPage }
  | { from: 'expanded'; expanded: Expanded }
  | { from: 'absent' }
  | { from: 'refused'; fix: string; code?: string };

/**
 * The keys the kernel writes onto a block when it runs one, which are the answer and never the
 * declaration.
 *
 * `drawn` IS IN HERE AND IS THE EASIEST ONE TO MISS. It reads like a declared key, it is listed
 * beside the declared ones, and the kernel computes it: it is the verdict on the block's `when:`,
 * decided at render against a figure read at that moment. Carrying it into a body would freeze one
 * moment's answer into the declaration, so a block that happened to be hidden when somebody read the
 * page would be declared hidden from then on.
 *
 * `values` GOES FOR THE SAME REASON ONE STEP FURTHER ON: it is every `{{path}}` the record resolved,
 * which is this record's data rather than the author's text.
 */
const RUN: ReadonlySet<string> = new Set([
  'rows', 'matched', 'readings', 'walk', 'inherited', 'scopes', 'feed', 'seen', 'history', 'values',
  'refusals', 'drawn', 'why',
]);

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/**
 * Whether a block's `key` is the one the record named it by because it declared none (`defaultBlockKey`, parted with
 * `-2` where two blocks of a page are alike). That key is the answer's: written back, it would freeze a name the
 * record works out afresh from the block's kind, source and heading, so a heading changed later would keep the old one.
 */
const keyByDefault = (answered: Record<string, unknown>): boolean => {
  const key = answered.key;
  if (typeof key !== 'string') return false;
  const named = defaultBlockKey(answered);
  return key === named || (key.startsWith(`${named}-`) && /^\d+$/u.test(key.slice(named.length + 1)));
};

/**
 * One answered block with the run taken off it, leaving the declaration underneath: only the keys a block is declared
 * with stay, since the list of what a read answers grows (`queue`, `waiting`) and a Needs you read back was refused for each.
 */
export function bodyOfBlock(answered: Record<string, unknown>): BlockBody {
  const out: Record<string, unknown> = {};
  const byDefault = keyByDefault(answered);
  for (const [key, value] of Object.entries(answered)) if (!RUN.has(key) && BLOCK_INSTALLS.has(key) && !(key === 'key' && byDefault)) out[key] = value;
  /* A BLOCK WITH NO `kind` IS NOT ONE THIS RECORD COULD HAVE STORED. It is carried as the empty
     string rather than dropped, because a body that came back malformed should stay countable
     instead of losing a block on the way through and reading as a shorter page. */
  return { ...out, kind: typeof answered.kind === 'string' ? answered.kind : '' };
}

/**
 * One answered page as a body.
 *
 * THE RECORD ANSWERS `page` WITH THE RESOLVED SLUG on the `page` key rather than with whatever the
 * declaration called the page, so that is what a body read back through it carries. It is left as
 * the record said it: this module reports what the record answered and does not reconstruct what it
 * thinks was typed.
 */
function bodyOf(slug: string, answered: Record<string, unknown>): PageBody {
  /* `read_at` AND `declared_version` ARE THE ANSWER'S, the clock it was read by and the version it was read at, and a body
     carrying them back would declare one moment's reading. So is `look`, the arrangement the page was read under, which
     is a declaration of its own (`look.<page>`) and which a page refuses as a key it does not have. And `zone`, the
     record's own zone the page was read in, which is the reading's and no key a page has. */
  const { blocks, read_at: _clock, declared_version: _version, look: _look, zone: _zone, ...rest } = answered;
  /* `page` IS THE FIRST KEY, because the record reads a declaration's kind from its first key and the answer does not keep
     the order a page was declared in: a body read back with `nav` first was refused as a declaration that begins with nav. */
  const named = { page: typeof rest.page === 'string' ? rest.page : slug, title: typeof rest.title === 'string' ? rest.title : '' };
  return { ...named, ...rest, ...named, blocks: Array.isArray(blocks) ? blocks.filter(isObject).map(bodyOfBlock) : [] };
}

/** The version `page` says the declaration is at, which a write over it carries. */
const versionOf = (answered: Record<string, unknown>): number | null =>
  Number.isInteger(answered.declared_version) ? (answered.declared_version as number) : null;

/**
 * Whether this answer is a template's expansion rather than a stored body.
 *
 * EITHER KEY IS ENOUGH. A template keeps its `for:` through the expansion, and the kernel adds
 * `param` naming the row the page was filled from. Both travel together on a record that expanded
 * one, and a body carrying either is one that was built for a row rather than stored.
 */
const isExpanded = (answered: Record<string, unknown>): boolean =>
  answered.for !== undefined || answered.param !== undefined;

/** What a failed call means here. A refusal is the record's own sentence and is never rewritten. */
function missed(out: object): { from: 'refused'; fix: string; code?: string } {
  if (!('refusal' in out)) return { from: 'refused', fix: declWords.changed };
  const { fix, code } = out.refusal as { fix: string; code?: string };
  return { from: 'refused', fix, ...(code === undefined ? {} : { code }) };
}

export type PagesReader = {
  /** Every page this record declares, with the body it stores for each. */
  read(): Promise<Opened>;
  /** One page's body, by the slug `pages` listed it under. */
  readOne(slug: string): Promise<OneOpened>;
};

/**
 * A declaration reader for one tab. `base` is the page's own origin; the app never holds a token.
 *
 * A SLUG IS READ ONCE AND KEPT, the way the other readers keep a register they walked. Reading the
 * whole list and then asking again for one page is the shape a caller that wants to change a page
 * actually has, and it should not cost that page a second call.
 */
export function pagesReader(base: string, io?: Fetch): PagesReader {
  const client = createClient({ base, ...(io ? { fetch: io } : {}) });
  const kept = new Map<string, Record<string, unknown>>();

  type Got =
    | { ok: true; value: Record<string, unknown> }
    | { ok: false; miss: { from: 'refused'; fix: string; code?: string } };

  async function answerOf(slug: string): Promise<Got> {
    const held = kept.get(slug);
    if (held) return { ok: true, value: held };
    const out = await client.page(slug);
    if (!out.ok) return { ok: false, miss: missed(out) };
    /* AN ANSWER THAT IS NOT AN OBJECT IS NOT A PAGE. The client already refuses a body it does not
       recognise, so this is the narrowing rather than a second check of the same thing. */
    if (!isObject(out.value)) return { ok: false, miss: { from: 'refused', fix: declWords.changed } };
    kept.set(slug, out.value);
    return { ok: true, value: out.value };
  }

  return {
    async read() {
      const listed = await client.pages();
      if (!listed.ok) return missed(listed);

      const pages: DeclaredPage[] = [];
      const expanded: Expanded[] = [];
      for (const row of Array.isArray(listed.value) ? listed.value.filter(isObject) : []) {
        /* A LISTED ROW WITH NO SLUG NAMES NO PAGE TO READ. `page` is asked for by its slug and there
           is nothing to send, so there is nothing this row can contribute. */
        if (typeof row.slug !== 'string' || row.slug === '') continue;
        const slug = row.slug;
        const title = typeof row.title === 'string' ? row.title : '';

        const got = await answerOf(slug);
        /* ONE PAGE'S REFUSAL STOPS THE READ. A caller asking for the bodies is going to write one
           back, and a list that quietly came up short is a list whose gaps look like pages that do
           not exist. The record's sentence says which way it actually is. */
        if (!got.ok) return got.miss;

        if (isExpanded(got.value)) {
          expanded.push({ slug, title, why: declWords.expanded });
          continue;
        }
        pages.push({ slug, title, body: bodyOf(slug, got.value), version: versionOf(got.value) });
      }
      return { from: 'live', pages, expanded };
    },

    async readOne(slug) {
      const got = await answerOf(slug);
      if (!got.ok) return got.miss;
      const title = typeof got.value.title === 'string' ? got.value.title : '';
      if (isExpanded(got.value)) return { from: 'expanded', expanded: { slug, title, why: declWords.expanded } };
      return { from: 'live', page: { slug, title, body: bodyOf(slug, got.value), version: versionOf(got.value) } };
    },
  };
}

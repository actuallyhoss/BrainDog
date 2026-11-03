/**
 * `drawn`: a small component somebody wrote, for a visual no kind fits ("Two ways to design": Draw).
 *
 * THE CODE IS DATA ON THE PAGE, `code:`, HTML with a style tag and a script, and the record never runs it. A host draws
 * it in a sandboxed frame with no network, no storage and no reach into the page around it
 * (`packages/render/src/drawn.ts`), and hands it the rows this block read and the theme's colours, nothing else.
 *
 * OVER A LIST it names the fields it is handed, `columns: [{ field }]`, one to `DRAWN_COLUMNS_MOST`, and only those
 * fields of each row go in the answer: what a component sees is what its declaration says it reads, read through this
 * reader's lens like every other block's rows. With no `source:` it reads nothing, and is a picture of its own.
 *
 * REFUSED AT INSTALL, NEVER AT THE FRAME. Its code is held to the renderer's rules, copied here for the reason
 * `kinds/embed.ts` gives of its providers (the kernel does not import the renderer): at most `DRAWN_CODE_MOST` bytes,
 * no address off the page, no network, no storage, no reach into the page around it, and not a whole document. The
 * frame's own policy stops each of them anyway; the refusal is so an author hears it in words, at install, and an
 * agent proposing one over the MCP is refused through `propose` the same way.
 *
 * A LEAF: nothing of the kernel is imported at run time, for the reason `kinds/listed.ts` gives.
 */

import type { KindModule } from './index.ts';
import { KIND_KEYS } from './keys.ts';
import { invalid, listedFault, readListed } from './listed.ts';

/** The most a component's code may hold, in bytes of UTF-8. The renderer's `DRAWN_CODE_MOST`. */
export const DRAWN_CODE_MOST = 64 * 1024;

/** The most rows a drawn block reads, and how many it reads when it says no `limit:`. The renderer's `DRAWN_ROWS_MOST`. */
export const DRAWN_ROWS_MOST = 200;

/** The most fields a drawn block is handed. */
export const DRAWN_COLUMNS_MOST = 12;

/** The heights a block may start at, in pixels: the renderer's `DRAWN_HEIGHT` least and most. */
const HEIGHT_LEAST = 48;
const HEIGHT_MOST = 1600;

/**
 * THE RENDERER'S `DRAWN_RULES`, LINE FOR LINE, with the same sentences: a component this admits and the renderer does
 * not would install and then draw as a fault, and one the renderer admits and this does not would be refused for nothing.
 */
const RULES: readonly { test: RegExp; fix: string }[] = [
  { test: /\b(?:https?|wss?|ftp|file):\/\/(?!www\.w3\.org\/)|\bjavascript:/iu, fix: 'it names an address off the page, and a drawn component reaches nothing outside itself. Write pictures inline, as data: images or SVG.' },
  { test: /(?:src|href|action|srcset|poster|data|xlink:href)\s*=\s*["']?\s*\/\//iu, fix: 'it names an address off the page, and a drawn component reaches nothing outside itself.' },
  { test: /url\(\s*["']?\s*(?!data:|#|["')])/iu, fix: 'a url() in it points somewhere other than inline data, and a drawn component loads nothing.' },
  { test: /@import\b/iu, fix: 'it imports a stylesheet, and a drawn component loads nothing. Write the styles in it.' },
  { test: /<\s*(?:link|base|meta|iframe|frame|object|embed|form|portal)\b/iu, fix: 'it holds a link, meta, frame, object or form tag, which a drawn component cannot use. Draw with HTML, SVG, CSS and a script.' },
  { test: /\bshadowroot(?:mode|clonable|delegatesfocus|serializable)\b/iu, fix: 'it opens a shadow root, and a drawn component draws in its own page. Write the markup as it is.' },
  { test: /<\s*(?:!doctype|html|head|body)\b/iu, fix: 'it is a whole document, and the host writes the head. Write what goes inside the page: the markup, a style tag and a script tag.' },
  { test: /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|importScripts|sendBeacon|RTCPeerConnection|Worker|SharedWorker)\s*\(/u, fix: 'it calls the network, and a drawn component has none. It is handed its rows as braindog.data.' },
  { test: /\bimport\s*\(|\bimport\s+[\w{*]/u, fix: 'it imports a module, and a drawn component loads nothing. Write it as one script.' },
  { test: /\b(?:localStorage|sessionStorage|indexedDB|document\.cookie|caches)\b/u, fix: 'it uses storage, and a drawn component keeps nothing. What it shows comes from braindog.data each time.' },
  { test: /\b(?:top|parent|opener)\s*\.\s*(?:location|document)\b|\bwindow\.open\s*\(/u, fix: 'it reaches for the page around it, and a drawn component cannot. To open one of its rows it calls braindog.open with the row.' },
];

const BYTES = new TextEncoder();

/** The most actions a drawn block declares. */
export const DRAWN_ACTIONS_MOST = 8;

/**
 * One action a drawn block's view may ask its host for (add-ons phase 4): add a row to a list, change a row of one, or
 * call one of its add-on's tools. Declared here and nowhere else: the host checks what the frame asks against this list,
 * against the add-on's own lists and its `uses` writes, and against the viewer's own ladder, then writes as the viewer.
 */
export const DRAWN_ACTION = /^(?:(?:create|update):register\.[a-z][a-z0-9_-]{0,31}|tool:[a-z][a-z0-9_.-]{0,63})$/u;

/**
 * What is wrong with a drawn block's `acts:`, or `null`. `acts` AND NOT `actions`, which every block already takes for the
 * buttons on its rows (`row-actions.ts`).
 */
export function drawnActionsFault(actions: unknown): string | null {
  if (actions === undefined) return null;
  if (!Array.isArray(actions) || actions.some((a) => typeof a !== 'string'))
    return 'acts: is a list of what its view may ask, such as ["create:register.films", "update:register.films"].';
  if (actions.length > DRAWN_ACTIONS_MOST) return `A drawn block declares at most ${DRAWN_ACTIONS_MOST} actions.`;
  const wrong = (actions as string[]).find((a) => !DRAWN_ACTION.test(a));
  if (wrong !== undefined) return `${JSON.stringify(wrong.slice(0, 80))} is not an action a view may ask. Write create:register.<list>, update:register.<list> or tool:<name>.`;
  return null;
}

/** The lists a drawn block's view may add rows to and change rows of, from its `acts:`. */
export function drawnWrites(actions: unknown): { creates: string[]; updates: string[] } {
  const list = Array.isArray(actions) ? actions.filter((a): a is string => typeof a === 'string' && DRAWN_ACTION.test(a)) : [];
  const of = (verb: string) => list.filter((a) => a.startsWith(`${verb}:register.`)).map((a) => a.slice(`${verb}:register.`.length));
  return { creates: of('create'), updates: of('update') };
}

/** What is wrong with a component's code, finishing "This component cannot be drawn because", or `null`. */
export function drawnCodeFault(code: string): string | null {
  if (BYTES.encode(code).length > DRAWN_CODE_MOST) return `it is longer than ${DRAWN_CODE_MOST / 1024} KB. A drawn component is one small visual; split it or draw less.`;
  for (const rule of RULES) if (rule.test.test(code)) return rule.fix;
  return null;
}

/* THE KEYS A DRAWN BLOCK DOES NOTHING WITH THAT `listedFault` DOES NOT ALREADY REFUSE: rows written out by hand are
   cells of a dialect, and a component is handed fields, so it reads a list or nothing. */
const UNREAD = ['authored', 'body', 'tone'] as const;

export const drawn: KindModule = {
  keys: KIND_KEYS.drawn,

  validate(block, ctx) {
    for (const key of UNREAD)
      if (Object.hasOwn(block, key) && block[key] !== undefined)
        return invalid(`A drawn block is its code and the list it reads, and does nothing with ${key}:. Take it off.`, key);
    const code = block.code;
    if (code === undefined) {
      /* A BARE BLOCK INSTALLS AND IS REFUSED WHEN IT IS READ, as every kind is (`kinds/listed.ts`): whether a key is
         required is not decided at install. */
      if (ctx.stage === 'read') return invalid('A drawn block is its component, written as code: (HTML, a style tag and a script), and this one has none.', 'code');
    } else {
      if (typeof code !== 'string') return invalid('code: is the component written out as text: HTML, a style tag and a script.', 'code');
      const fault = drawnCodeFault(code);
      /* THE CODE IS NOT REPEATED IN THE SENTENCE: a refusal is logged, and code somebody pasted can carry anything. */
      if (fault) return invalid(`This component cannot be drawn because ${fault}`, 'code');
    }
    const actionsFault = drawnActionsFault((block as { acts?: unknown }).acts);
    if (actionsFault !== null) return invalid(actionsFault, 'acts');
    const height = block.height;
    if (height !== undefined && !(typeof height === 'number' && Number.isInteger(height) && height >= HEIGHT_LEAST && height <= HEIGHT_MOST))
      return { code: 'OUT_OF_BOUNDS', fix: `height: is where a drawn block starts, a whole number of pixels from ${HEIGHT_LEAST} to ${HEIGHT_MOST}.`, at: 'height' };
    const limit = block.limit;
    if (limit !== undefined && !(typeof limit === 'number' && Number.isInteger(limit) && limit >= 0 && limit <= DRAWN_ROWS_MOST))
      return { code: 'OUT_OF_BOUNDS', fix: `limit: on a drawn block is at most ${DRAWN_ROWS_MOST}, and ${JSON.stringify(limit)} is not.`, at: 'limit' };
    /* NEITHER A LIST NOR ROWS IS A PICTURE OF ITS OWN, which a drawn block may be: `listedFault` is asked only over a
       source, and `stage: 'install'` so it never asks for one. */
    if (block.source === undefined) return null;
    return listedFault(
      block,
      'drawn',
      { fewest: 1, most: DRAWN_COLUMNS_MOST, said: `the fields it is handed, one to ${DRAWN_COLUMNS_MOST}, such as columns: [{ field: title }, { field: amount }]` },
      'install',
    );
  },

  read(deps, block, base) {
    if (!block.source) return base;
    const limit = block.limit === undefined ? DRAWN_ROWS_MOST : Math.max(0, Math.min(DRAWN_ROWS_MOST, Math.floor(block.limit)));
    if (limit === 0) return { ...base, matched: 0 };
    const listed = readListed(deps, block, 'drawn', { rules: (block.columns ?? []).map(() => null), limit });
    if ('refusals' in listed) return { ...base, refusals: [...base.refusals, ...listed.refusals] };
    /* ONLY THE FIELDS ITS COLUMNS NAME go in the answer, so a component is never handed more than it declared. */
    const fields = (block.columns ?? []).map((c) => c.field);
    const rows = listed.rows.map((r) => ({ ...r, fields: Object.fromEntries(fields.filter((f) => Object.hasOwn(r.fields, f)).map((f) => [f, r.fields[f]!])) }));
    return { ...base, rows, matched: listed.matched };
  },
};

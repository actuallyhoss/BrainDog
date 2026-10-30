/**
 * A PAGE'S SOURCE, CHANGED AND WRITTEN BACK.
 *
 * The source view printed the stored declaration as `.dog` text and stopped there: somebody who could read how a page
 * was built still had to describe the change to an agent, or pull the file, edit it and push it from a terminal. This is
 * the other half. The text somebody typed is read by the same parser `braindog page check` reads a file with
 * (`parseDog`, `@braindog/dog`), drawn by the record before anything is kept (`previewPage`), and written whole through
 * `setDeclaration({ body, version })`, which is the one door a page's body goes in by (33 §2).
 *
 * A REFUSAL POINTS AT A LINE. The parser says which line it could not read; the record's lint says which key it would
 * not take, as a path (`blocks[2].columns`). `lineOf` turns that path back into the line of the text that wrote it, so
 * the screen can put the sentence beside the words it is about, and the typed text is never thrown away to say it.
 *
 * PLAIN NODE, as every module under `lib/record/` a test may load: relative imports only, no runes.
 */

import { createClient, type ClientOptions } from '@braindog/client';
import { parseDog, type PageBody } from '../dog/source.ts';
import { listName } from './names.ts';
import { blockOf, type Opened } from './page-live.ts';
import { learn, refMapOf, targetsOf, type RecordRow, type RefMap } from './remote.ts';

/** Injectable so a caller can answer without a socket, as every other writer under `lib/record/` is. */
export type Fetch = NonNullable<ClientOptions['fetch']>;

/** The words this screen says. Its own, beside the page's (`lib/page/words.ts`), so no other unit's file is touched. */
export const sourceWords = {
  apply: 'Apply this page',
  /** A template makes one page for each row of its list, so the button says the change lands on all of them. */
  applyTemplate: (list: string) => `Apply to every ${list} page`,
  applying: 'Applying',
  applied: 'The page is changed.',
  putBack: 'Put back',
  puttingBack: 'Putting back',
  putBackDone: 'The page is as it was.',
  discard: 'Discard changes',
  preview: 'As it will look',
  previewing: 'Drawing the page as it will look',
  /** A host that has no `previewPage`, or no record behind it: the text can still be applied, and says so. */
  noPreview: 'The page cannot be drawn before it is applied. You can still apply it.',
  line: (n: number) => `Line ${n}`,
  /** The button beside a refusal, which selects the line it is about. */
  goToLine: (n: number) => `Go to line ${n}`,
  moved: 'This page was changed somewhere else since you opened it. Your text is kept: copy it, then open the page again.',
  unreached: 'BrainDog could not be reached.',
} as const;

/** The text read as a page's body, or the parser's sentence and the line it is about. */
export type Checked = { ok: true; body: PageBody } | { ok: false; fix: string; line: number };

/** Read typed text as a page's body, without asking the record anything. */
export function checkSource(text: string): Checked {
  const got = parseDog(text);
  return got.ok ? { ok: true, body: got.value } : { ok: false, fix: got.fix, line: got.line };
}

/** What the record drew for a body: the page, or its refusal and where, or nothing because it cannot draw one. */
export type Previewed = { from: 'live'; opened: Opened } | { from: 'refused'; fix: string; at: string | null } | { from: 'none' };

/** What writing a body did: the version it is now at, or why it was not written. */
export type Applied =
  | { from: 'written'; version: number | null }
  | { from: 'refused'; fix: string; at: string | null }
  | { from: 'moved' | 'unreachable'; fix: string };

/** A refusal the host gives when it has no such method or no record, which is nothing to say about this page. */
const UNSERVED = new Set(['ROUTE_UNKNOWN', 'NOT_IN_THIS_BUILD', 'UNREACHABLE', 'UNAUTHORIZED']);

export type SourceWriter = {
  preview(body: PageBody): Promise<Previewed>;
  apply(body: PageBody, version: number | null): Promise<Applied>;
};

/**
 * One writer for one source view.
 *
 * IT KEEPS WHAT IT LEARNT BETWEEN PREVIEWS. A preview is drawn on every pause in typing, and each one would otherwise ask
 * the record for the schema of every list the page reads and walk every list a ref points at, again. A list is learnt
 * once (`learn`, as `pageReader` and Decide's preview learn one), so a list this build does not ship is drawn rather
 * than said to be undrawable, and a ref target is walked once, so a ref draws as its row's title and not its id.
 */
export function sourceWriter(base: string, io?: Fetch): SourceWriter {
  const client = createClient({ base, ...(io ? { fetch: io } : {}) });
  const asked = new Map<string, Promise<void>>();
  const walked = new Map<string, Promise<RefMap>>();

  const walk = (target: string): Promise<RefMap> => {
    let held = walked.get(target);
    if (!held) {
      held = (async () => {
        const rows: RecordRow[] = [];
        let cursor: string | null = null;
        do {
          const page = await client.list({ register: target, limit: 500, ...(cursor === null ? {} : { cursor }) });
          if (!page.ok) break;
          rows.push(...(page.value.rows as RecordRow[]));
          cursor = page.value.cursor;
        } while (cursor !== null);
        return refMapOf(target, rows);
      })();
      walked.set(target, held);
    }
    return held;
  };

  return {
    async preview(body) {
      const out = await client.call<{ read_at?: unknown; blocks?: unknown }>('previewPage', { body });
      if (!out.ok) {
        if (!('refusal' in out)) return { from: 'none' };
        return UNSERVED.has(out.refusal.code) ? { from: 'none' } : { from: 'refused', fix: out.refusal.fix, at: out.refusal.at ?? null };
      }
      type Answered = Parameters<typeof blockOf>[0];
      const blocks = (Array.isArray(out.value.blocks) ? out.value.blocks : []) as Answered[];
      const said = typeof out.value.read_at === 'string' ? Date.parse(out.value.read_at) : Number.NaN;
      const now = Number.isFinite(said) ? said : Date.now();
      const lists = [...new Set(blocks.flatMap((b) => (!b.refusals?.length && b.source?.startsWith('register.') ? [b.source.slice('register.'.length)] : [])))];
      for (const list of lists) await learn(client.schema, list, asked);
      const refs = new Map<string, RefMap>();
      for (const target of new Set(lists.flatMap(targetsOf))) {
        await learn(client.schema, target, asked);
        refs.set(target, await walk(target));
      }
      const page = typeof body.page === 'string' ? body.page : '';
      const title = typeof body.title === 'string' ? body.title : page;
      return { from: 'live', opened: { from: 'live', now, page: { page: { page, title }, blocks: blocks.map((b) => blockOf(b, refs, now)) } } };
    },

    async apply(body, version) {
      const out = await client.call('setDeclaration', version === null ? { body } : { body, version });
      if (out.ok) {
        /* THE VERSION THE WRITE MADE, which the next Apply and Put back write against, read as `setBody` reads it
           (`page-write.ts`): the answer lists what was installed, each with its version. */
        const made = Array.isArray(out.value) ? (out.value as { version?: unknown }[]).find((d) => Number.isInteger(d?.version)) : undefined;
        return { from: 'written', version: made ? (made.version as number) : null };
      }
      if ('conflict' in out) return { from: 'moved', fix: sourceWords.moved };
      if (!('refusal' in out) || out.refusal.code === 'UNREACHABLE') return { from: 'unreachable', fix: sourceWords.unreached };
      return { from: 'refused', fix: out.refusal.fix, at: out.refusal.at ?? null };
    },
  };
}

/**
 * The list a template makes a page for each row of, by the name a person says, or `null` for a page of its own.
 *
 * `Object.hasOwn`-safe through `listName`, because the list's id is text somebody chose.
 */
export function templateList(body: PageBody): string | null {
  const f = body.for;
  if (f === null || typeof f !== 'object' || Array.isArray(f)) return null;
  const register = f.register;
  return typeof register === 'string' && register !== '' ? listName(register) : null;
}

/**
 * The line of `text` a refusal's `at` path is about, counted from one, or `null` where the path names nothing written.
 *
 * READ AGAINST THE LAYOUT `dogText` PRINTS, because that is the text the view opens with: top-level keys at the margin,
 * `blocks:` then each block opening with `  - ` and its other keys four spaces in. A path into a block
 * (`blocks[2].columns`, or `blocks.2.columns`) finds that block's key, or the block's first line where the key is not
 * written; a top-level path (`title`, `nav.section`) finds its key. A path prefixed with the declaration's id, as
 * `previewChange` prefixes one, is read from where `blocks` starts.
 */
export function lineOf(text: string, at: string | null | undefined): number | null {
  if (!at) return null;
  const lines = text.split('\n');
  const inBlocks = /(?:^|[.\s])blocks(?:\[(\d+)\]|\.(\d+))(?:\.([A-Za-z_][\w-]*))?/u.exec(at);
  if (inBlocks) {
    const n = Number.parseInt(inBlocks[1] ?? inBlocks[2] ?? '0', 10);
    const key = inBlocks[3];
    const head = lines.findIndex((l) => /^blocks:/u.test(l));
    if (head < 0) return null;
    let seen = -1;
    let start = -1;
    for (let i = head + 1; i < lines.length; i++) {
      const l = lines[i] ?? '';
      /* BACK AT THE MARGIN IS PAST THE BLOCKS: a top-level key written after them. */
      if (/^\S/u.test(l)) break;
      const opens = l.startsWith('  - ');
      if (opens) {
        seen++;
        if (seen > n) break;
        if (seen === n) start = i;
      }
      if (seen !== n || key === undefined) continue;
      const own = opens ? l.slice(4) : /^ {4}\S/u.test(l) ? l.slice(4) : null;
      if (own !== null && own.startsWith(`${key}:`)) return i + 1;
    }
    return start < 0 ? head + 1 : start + 1;
  }
  const top = /^(?:body\.)?([A-Za-z_][\w-]*)/u.exec(at)?.[1];
  if (!top) return null;
  const i = lines.findIndex((l) => l.startsWith(`${top}:`));
  return i < 0 ? null : i + 1;
}

/** Where line `n` of `text` starts and ends, as a textarea's selection counts, so the screen can select it. */
export function spanOf(text: string, n: number): { start: number; end: number } {
  const lines = text.split('\n');
  const upto = Math.max(0, Math.min(n - 1, lines.length - 1));
  let start = 0;
  for (let i = 0; i < upto; i++) start += (lines[i] ?? '').length + 1;
  return { start, end: start + (lines[upto] ?? '').length };
}

/**
 * "DRAW IT" IN MAKE A COMPONENT ("Two ways to design": Draw): a component written as code, or pasted, or
 * asked of the model, made into one `drawn` block of the page's declaration and previewed in its sandbox before it is
 * kept.
 *
 * THE SAME WAY IN AS COMPOSE. A drawn block comes back as a `Composed` (`compose.ts`), so it is handed to arranging like a
 * composed one: drawn on the page as an unsaved draft with Keep, Put on shelf and Throw away, and written only by Done,
 * through the one write every page uses, with its undo. The model's draft goes through the page sheet's Ask
 * (`AskPage.svelte`), which files a draft rather than writing, and an agent's goes through `propose`. Nothing here writes.
 *
 * THE PREVIEW READS THE ROWS THE RECORD WOULD HAND IT, through `previewPage`, which reads a body nobody installed for
 * this reader and writes nothing. So the preview is handed exactly what the block would be on the page, and code the
 * record would refuse is refused here in the record's own sentence.
 *
 * PURE BUT FOR THE ONE READ, whose fetch is handed in, so `draw.test.ts` holds it in Node.
 */

import { createClient } from '@braindog/client';
import { DRAWN_EXAMPLE, drawnData, drawnFault, type DrawnData } from 'braindog-render';

import type { Composed, ComposeList } from './compose.ts';

type Fetch = typeof fetch;

export const drawWords = {
  say: 'Say it',
  draw: 'Draw it',
  name: 'Name',
  nameField: 'What it shows',
  fields: 'What it is handed',
  code: 'The component',
  codeHint: 'HTML, a style tag and a script. It runs in a sandbox with no network, and is handed its entries as braindog.data.',
  preview: 'Preview',
  previewNone: 'Nothing to preview yet.',
  use: 'Use it',
  ask: 'Ask Slash to draw it',
  askHint: 'Say what to draw, and Slash writes the component as a draft for you to keep.',
  bad: (fix: string) => `This component cannot be drawn because ${fix}`,
  said: (name: string, list: string | null) => (list ? `${name}, drawn over ${list}.` : `${name}, drawn.`),
  untitled: 'A drawn component',
};

/** The most fields a component is handed, as the record holds it (the kernel's `DRAWN_COLUMNS_MOST`). */
export const DRAW_FIELDS_MOST = 12;

/** The fields a new component starts with: the list's title, then the next three, so it has something to draw. */
export function startFields(list: ComposeList | null): string[] {
  if (!list) return [];
  const ids = list.fields.map((f) => f.id);
  const title = list.title && ids.includes(list.title) ? [list.title] : [];
  return [...title, ...ids.filter((id) => !title.includes(id))].slice(0, 4);
}

/** The code a new component starts with: an example that draws over whatever it is handed. */
export const startCode = (): string => DRAWN_EXAMPLE;

/** One `drawn` block of the page's declaration: its name, the list it reads, the fields it is handed and its code. */
export function drawnBlock(i: { name: string; list: string | null; fields: readonly string[]; code: string }): Composed['block'] {
  const heading = i.name.trim() || drawWords.untitled;
  return {
    kind: 'drawn',
    heading,
    ...(i.list && i.fields.length > 0 ? { source: `register.${i.list}`, columns: i.fields.slice(0, DRAW_FIELDS_MOST).map((field) => ({ field })) } : {}),
    code: i.code,
  };
}

/** The draft arranging is handed, or the sentence that says why there is none. */
export function drawnDraft(i: { name: string; list: ComposeList | null; fields: readonly string[]; code: string }): Composed | { fix: string } {
  if (i.code.trim() === '') return { fix: drawWords.previewNone };
  const fault = drawnFault(i.code);
  if (fault) return { fix: drawWords.bad(fault) };
  const block = drawnBlock({ name: i.name, list: i.list?.id ?? null, fields: i.fields, code: i.code });
  const name = String(block.heading);
  return { block, list: i.list?.id ?? '', name, said: drawWords.said(name, i.list?.name ?? null) };
}

/** What a preview is handed, or the record's sentence for why it cannot be read. */
export type Previewed = { data: DrawnData } | { fix: string };

/**
 * The rows a drawn block over this list would be handed, read by the record through `previewPage`, or its refusal.
 * A block that reads no list is handed nothing, and is not sent.
 */
export async function previewRows(base: string, block: Composed['block'], listName: string | null, io?: Fetch): Promise<Previewed> {
  const source = typeof block.source === 'string' ? block.source : null;
  if (source === null) return { data: drawnData({ columns: [], rows: [] }) };
  const body = { page: 'drawn-preview', title: 'Preview', requires: [source], blocks: [block] };
  try {
    const out = await createClient({ base, ...(io ? { fetch: io } : {}) }).call<{ blocks?: unknown }>('previewPage', { body });
    if (!out.ok) return { fix: 'refusal' in out ? out.refusal.fix : drawWords.previewNone };
    const [read] = Array.isArray(out.value.blocks) ? (out.value.blocks as Record<string, unknown>[]) : [];
    if (!read) return { data: drawnData({ columns: [], rows: [] }) };
    const refused = Array.isArray(read.refusals) ? (read.refusals as { fix?: unknown }[]) : [];
    if (refused.length > 0) return { fix: String(refused[0]?.fix ?? '') };
    return { data: drawnData(read, listName ?? undefined) };
  } catch {
    return { data: drawnData({ columns: [], rows: [] }) };
  }
}

/** What the model is asked, in the page sheet's Ask: a drawn block, held to the design book's rules for one. */
export const drawAsk = (line: string): string =>
  `Draw a component for this page, as one drawn block (kind: drawn, with code: HTML, a style tag and a script, as the design book's draw rules say): ${line.trim()}`;

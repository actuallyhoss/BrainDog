/**
 * Arranging a home: Today and Decide, which their screens draw as a preview of a body nobody installed, reshaped as any
 * declared page is (DIRECTION §35: "every page is declared and dynamic, the hand-written ones included").
 *
 * THE FIRST DONE KEEPS IT. Today's body (`default-home.ts` `todayHome`) and Decide's (`views.ts` `decideHome`) are drawn
 * by the record with `previewPage` and installed nowhere, so there is nothing to arrange against until somebody commits.
 * The first Done installs the body, laid out as arranged, as the page the screen reads first: `home` for Today, which
 * Home already prefers over its own body (`voice.ts` `homeSlugOf`), and `decide` for Decide. Put back retires it and the
 * screen draws its preview again. Opening the mode makes nothing, and neither does leaving it with Cancel.
 *
 * ARRANGED BY THE BODY, NOT BY WHAT THE SCREEN DREW. Home shapes what it draws (`homeDrawn` splits what fell due into late
 * and coming, and lifts its line into the head), so a place on its screen is not a place in the body. The mode reads the
 * body again, unshaped, one block for each the body declares, and moves those.
 *
 * NOTHING HERE IS ANYBODY'S RECORD (§27): the two bodies are the ones every record draws, built from what the shell says
 * the record holds, and an installed home is arranged like any other page.
 *
 * AND NOTHING THE FIRST DONE INSTALLS IS THE ARRANGER'S OWN, or Today froze as the owner saw it on the day they arranged
 * it (`loop/research-audit-11-13.md`, finding 3). The body kept is the one any reader of the record would be drawn:
 * - ITS HEADINGS ARE THE HOUSE LINES, which the page reader says in the voice that speaks (`inVoice`), so a line changed
 *   in Settings › Words, or another use case speaking, still reaches Today once it is kept.
 * - THE LINE A TASK IS TYPED INTO IS KEPT wherever the record keeps tasks, and the reader draws it only for somebody who
 *   may add one (`heldTo`), so a member who cannot is not handed the owner's field.
 * - A FIGURE IS DRAWN WHILE THE RECORD HAS IT (`whileHeld`): the cash tile is kept with a `when:` on its own figure, so
 *   turning Money on later draws it, and turning it off takes it away.
 */

import { createClient } from '@braindog/client';
import { copy } from '../copy.ts';
import type { Holds, HomeVoice } from '../home/default-home.ts';
import type { Shell } from '../record/boot-live.ts';
import { may } from '../record/may.ts';
import type { LiveBlock, LivePageDecl } from '../record/page-live.ts';
import type { PageBody } from '../record/pages-live.ts';
import { VOICE_LINES, type VoiceKey } from '../voice.ts';
import { TASKS } from '../work/list.ts';

type Fetch = NonNullable<Parameters<typeof createClient>[0]['fetch']>;

/** The previews a screen draws, by the address it draws them at, and the page each is kept as on its first Done. */
const KEPT_AS: Readonly<Record<string, string>> = { today: 'home', decide: 'decide' };

/** The page a home arranges, and whether the record holds it yet. */
export type Kept = { id: string; installed: boolean };

/**
 * What a home drawn at `slug` arranges: the page the record holds, or the one its first Done installs. `null` for an
 * address that is neither, which has nothing to arrange.
 */
export function keptAs(slug: string, pages: readonly string[]): Kept | null {
  const as = Object.hasOwn(KEPT_AS, slug) ? KEPT_AS[slug]! : null;
  if (as !== null) return { id: as, installed: pages.includes(as) };
  return pages.includes(slug) ? { id: slug, installed: true } : null;
}

/** What Today's body is built around, read off the shell as Home reads it. */
export function holdsOf(shell: Pick<Shell, 'lists' | 'pages' | 'me'>): Holds {
  const tasks = shell.lists.some((l) => l.id === TASKS);
  return { tasks, adds: tasks && may(shell, 'append', TASKS), money: shell.pages.includes('money') };
}

/** Today's headings in the voice that speaks, as Home asks for them. */
export function voiceOf(said: (key: VoiceKey) => string): HomeVoice {
  return {
    rightNow: said('right_now'),
    needsYou: said('needs_you'),
    sinceAway: said('since_away'),
    workingNow: said('working_now'),
    comingUp: said('coming_up'),
    overdue: said('overdue'),
    nothingWaiting: said('nothing_waiting'),
    nothingDue: said('nothing_due'),
  };
}

/** A body as the record is sent it, a plain copy, so arranging it never touches the one a screen keeps. */
const plainBody = (body: unknown): PageBody => JSON.parse(JSON.stringify(body)) as PageBody;

/** Today's headings as the house says them, which a kept body carries and the reader says in the voice that speaks. */
export const HOUSE_VOICE: HomeVoice = voiceOf((key) => VOICE_LINES[key]);

/** The voice keys a kept heading may be, and the keys a kept empty line may be: the ones `todayHome` asks the voice for. */
const HEADINGS: readonly VoiceKey[] = ['right_now', 'needs_you', 'since_away', 'working_now', 'coming_up', 'overdue'];
const EMPTIES: readonly VoiceKey[] = ['nothing_waiting', 'nothing_due'];

/** The key whose house line `line` is, among `keys`, or `null`. */
const keyOf = (line: unknown, keys: readonly VoiceKey[]): VoiceKey | null =>
  typeof line === 'string' ? (keys.find((k) => VOICE_LINES[k] === line) ?? null) : null;

/**
 * THE BLOCKS IN THE VOICE THAT SPEAKS: a heading or an empty line that is a house line Today asks the voice for is said
 * the voice's way. A heading somebody wrote in words of their own is not a house line and is left as they wrote it, and
 * a block already in the voice is unchanged, so this may run on a page twice.
 */
export function inVoice<B extends { heading?: string | undefined; empty?: string | undefined }>(blocks: readonly B[], said: (key: VoiceKey) => string): B[] {
  return blocks.map((b) => {
    const h = keyOf(b.heading, HEADINGS);
    const e = keyOf(b.empty, EMPTIES);
    if (h === null && e === null) return b;
    return { ...b, ...(h !== null ? { heading: said(h) } : {}), ...(e !== null ? { empty: said(e) } : {}) };
  });
}

/**
 * THE BLOCKS AS THIS READER IS DRAWN THEM: a line to type a row into, over a list this reader may not add to, is not
 * drawn. It would only be refused on Enter. Marked not drawn and left at its place, as every block a page hides is, so
 * each write still finds its block by index.
 */
export function heldTo<B extends { kind: string; drawn: boolean; register?: string | undefined; source?: string | undefined }>(
  blocks: readonly B[],
  mayAdd: (list: string) => boolean,
): B[] {
  return blocks.map((b) => {
    if (b.kind !== 'capture' || !b.drawn) return b;
    const list = b.register ?? (b.source?.startsWith('register.') ? b.source.slice('register.'.length) : null);
    return list !== null && !mayAdd(list) ? { ...b, drawn: false } : b;
  });
}

/** Any figure at all: what a `when:` asks of a figure to say only that the record has it. */
const ANY = -Number.MAX_SAFE_INTEGER;

/**
 * A KEPT BODY'S FIGURES ARE DRAWN WHILE THE RECORD HAS THEM. A row of figures with no `when:` of its own is given one on
 * its first figure, which the record answers only where that figure is declared (`pages.ts` `drawnWhen`: a figure that
 * cannot be read does not draw the block), so the cash tile kept on a record without Money waits, unseen, for Money.
 */
export function whileHeld(body: PageBody): PageBody {
  const blocks = body.blocks.map((b) => {
    const block = b as { kind?: unknown; when?: unknown; cells?: unknown };
    if (block.kind !== 'stat' || block.when !== undefined || !Array.isArray(block.cells)) return b;
    const first = block.cells.find((c): c is { metric: string } => c !== null && typeof c === 'object' && typeof (c as { metric?: unknown }).metric === 'string');
    return first ? ({ ...b, when: { metric: first.metric, gte: ANY } } as typeof b) : b;
  });
  return { ...body, blocks };
}

/**
 * The body a preview drawn at `slug` was drawn from, as its first Done keeps it, or `null` for one this does not know.
 * Read only as the mode opens, so a screen that is never arranged loads neither builder.
 *
 * TODAY IS BUILT FOR THE RECORD, NOT FOR THE ARRANGER: in the house's words, with the line a task is typed into wherever
 * the record keeps tasks and with the cash tile whether or not Money is on yet, each drawn for whoever may see it (the
 * header of this file). What the record keeps (`holds.tasks`) still decides the work blocks, because a block over a list
 * the record does not hold is a page the record refuses.
 */
export async function previewedBody(slug: string, holds: Holds): Promise<PageBody | null> {
  if (slug === 'today') {
    const { todayHome } = await import('../home/default-home.ts');
    return whileHeld(plainBody(todayHome({ tasks: holds.tasks, adds: holds.tasks, money: true }, HOUSE_VOICE)));
  }
  if (slug === 'decide') return plainBody((await import('../../routes/decide/views.ts')).decideHome());
  return null;
}

/** A home ready to arrange: the page as the mode lays it out, its blocks unshaped, and the body a first Done installs. */
export type ToArrange = {
  page: LivePageDecl;
  blocks: LiveBlock[];
  now: number;
  /** The body the first Done installs, laid out as arranged; `null` for a page the record holds already. */
  install: PageBody | null;
};

/**
 * The home's page as the mode arranges it. An installed one is read as the record stores it, at the version it holds,
 * which the write is checked against; a preview is its body, under the id it will be kept as. Either is then drawn by
 * the record block for block, by the reader its screen uses: Decide's sources are read Decide's way (`readDecide`).
 */
export async function readToArrange(
  base: string,
  kept: Kept,
  preview: () => Promise<PageBody | null>,
  io?: Fetch,
): Promise<ToArrange | { fix: string }> {
  let body: PageBody;
  let version: number | null = null;
  if (kept.installed) {
    const { pagesReader } = await import('../record/pages-live.ts');
    const one = await pagesReader(base, io).readOne(kept.id);
    if (one.from === 'refused') return { fix: one.fix };
    if (one.from !== 'live') return { fix: copy.arrangeMoved };
    body = one.page.body;
    version = one.page.version;
  } else {
    const made = await preview();
    if (!made) return { fix: copy.recordNotReached };
    body = { ...made, page: kept.id };
  }
  const drawn = await drawnBlocks(base, body, kept.id === 'decide', io);
  if ('fix' in drawn) return drawn;
  /* ONE BLOCK FOR EACH THE BODY DECLARES, or the places would name the wrong blocks. */
  if (drawn.blocks.length !== body.blocks.length) return { fix: copy.arrangeMoved };
  const page = {
    page: kept.id,
    title: body.title,
    ...(body.layout !== undefined ? { layout: body.layout } : {}),
    ...(Array.isArray(body.requires) ? { requires: body.requires } : {}),
    ...(version !== null ? { declared_version: version } : {}),
  } as unknown as LivePageDecl;
  return { page, blocks: drawn.blocks, now: drawn.now, install: kept.installed ? null : body };
}

async function drawnBlocks(base: string, body: PageBody, decide: boolean, io?: Fetch): Promise<{ blocks: LiveBlock[]; now: number } | { fix: string }> {
  if (decide) {
    const m = await import('../../routes/decide/views.ts');
    const got = await m.readDecide(base, body as unknown as Parameters<typeof m.readDecide>[1], io);
    if (got?.from === 'live') return { blocks: got.page.blocks, now: got.now };
    return { fix: got?.from === 'refused' ? got.fix : copy.recordNotReached };
  }
  const m = await import('../../routes/decide/[id]/proposed.ts');
  const got = await m.drawnOf(body, base, io);
  if (got.from === 'live') return { blocks: got.blocks, now: got.now };
  return { fix: got.from === 'refused' ? got.fix : copy.recordNotReached };
}

/**
 * Put back, after a first Done: the page that Done installed is retired, and the screen draws its preview again. Its
 * rows are untouched, as a page holds none.
 */
export async function unkeep(base: string, id: string, io?: Fetch): Promise<{ ok: true } | { ok: false; fix: string }> {
  const out = await createClient({ base, ...(io ? { fetch: io } : {}) }).call('retireDeclaration', { id: `page.${id}` });
  if (out.ok) return { ok: true };
  return { ok: false, fix: 'refusal' in out ? out.refusal.fix : copy.recordNotReached };
}

/** The shell again after a page is kept or put back, so the screen reads the page the record now holds first. */
export async function reboot(): Promise<void> {
  (await import('../record/boot-live.ts')).forget();
  const { invalidateAll } = await import('$app/navigation');
  await invalidateAll();
}

/**
 * A PAGE'S SOURCE, SENT AS ONE QUESTION ON DECIDE, by a reader who may read the page and may not apply it.
 *
 * `setDeclaration` is the owner's (`lib/theme/save.ts`), so anybody else's edited text would end at Apply's refusal.
 * It goes the way an agent's `braindog page push` goes instead: one `change` that carries the whole declaration,
 * `{ declaration_id, to }` with `to` what `install` takes (`grammar pages`, `to_change_one`), and nothing is changed
 * until somebody who may decide accepts it. The record joins a second press on the same change to the question already
 * open, so pressing twice is one question.
 *
 * `from_version` IS THE VERSION THE TEXT WAS READ AT, which only the proposer knows, so an accept that lands after
 * somebody else changed the page is weighed against what this reader saw (`packages/kernel/src/govern.ts`).
 *
 * THE RECORD'S OWN SENTENCE IS CARRIED when it will not file the change: it names the field and the fix, and a screen
 * that said its own words instead would be guessing. Pure: the call is a parameter, so a test answers it.
 */

type Refusal = { code: string; fix: string };
type Answered = { ok: true; value: unknown } | { ok: false; refusal: Refusal } | { ok: false; conflict: unknown };

/** What the screen sends a method through: the client's own `call`, or a test's. */
export type Call = (name: string, args?: Record<string, unknown>) => Promise<Answered>;

/** A page's declaration as the kernel holds it: its id, its kind, and the body the `.dog` text is. */
export type PageDecl = { id: string; kind: string; body: Record<string, unknown> };

export type Proposed = { ok: true; question: string } | { ok: false; fix: string };

/** The words this file says for itself. */
export const proposeWords = {
  question: (title: string) => `Change the page ${title} as written?`,
  propose: 'Propose this change',
  proposing: 'Proposing…',
  onDecide: 'On Decide',
  /** Said beside the link, for a screen reader and for whoever wonders what the link is. */
  onDecideNote: 'Nothing is changed until it is accepted.',
  unreached: 'The record could not be reached, so nothing was sent. Try again.',
  conflict: 'The record changed while this was sent. Try again.',
  unnamed: 'The record did not say which question it filed. Look for it on Decide.',
} as const;

const isMap = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * The page's name as a person says it. A TEMPLATE'S TITLE IS A PATTERN (`{{name}}`), which names no page, so its own
 * name is said instead, as `braindog page push` does.
 */
export function pageTitle(decl: PageDecl): string {
  const t = decl.body.title;
  if (typeof t === 'string' && t.trim() !== '' && !t.includes('{{')) return t.trim();
  return typeof decl.body.page === 'string' && decl.body.page !== '' ? decl.body.page : decl.id.replace(/^page\./u, '');
}

/**
 * File the edited declaration as one change on Decide. `why`, when given, is the proposer's reason, kept with the
 * change as a reason list is kept on a list's question; `from` the version the text was read at.
 */
export async function proposePage(call: Call, decl: PageDecl, why?: string, from?: number | null): Promise<Proposed> {
  const said = why?.trim() ?? '';
  const body = {
    declaration_id: decl.id,
    to: { id: decl.id, kind: decl.kind, body: decl.body },
    ...(typeof from === 'number' ? { from_version: from } : {}),
    ...(said === '' ? {} : { why: [said] }),
  };
  let out: Answered;
  try {
    out = await call('propose', { question: proposeWords.question(pageTitle(decl)), body_kind: 'change', body });
  } catch {
    return { ok: false, fix: proposeWords.unreached };
  }
  if (!out.ok) return { ok: false, fix: 'refusal' in out ? out.refusal.fix : proposeWords.conflict };
  const id = isMap(out.value) ? out.value.id : undefined;
  /* A FILED QUESTION ALWAYS HAS AN ID. One without is an answer this build cannot link to, and is said so rather than
     drawn as a link to nowhere. */
  return typeof id === 'string' && id !== '' ? { ok: true, question: id } : { ok: false, fix: proposeWords.unnamed };
}

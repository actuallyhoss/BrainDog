/**
 * A decision answered inside Claude or ChatGPT, by the person's own press on its card: the `answer` tool, the grant the
 * door mints beside each decision card, and the ground the card's pictures are drawn against.
 *
 * WHY A PRESS COUNTS AND THE MODEL CANNOT PRESS. Agents suggest and the person decides (ADR-060), and the card and the
 * model share one key, the chat app's. What tells them apart is what each is shown. The model reads a tool answer's
 * text and `structuredContent`; the card is handed the answer's `_meta` too, which both apps keep from the model (MCP
 * Apps hands the view the whole result, and ChatGPT puts `_meta` on `window.openai.toolResponseMetadata`, "never shown
 * to the model"). So the door asks the record for a one-time grant beside every decision card it draws
 * (`chatAnswerMint`, INTERNAL), puts it in `_meta` under `GRANT_META`, and the card's button sends it back with the
 * option pressed. `answer` without one is refused before the record is asked, and the refusal tells the model to show
 * the person the card. The record holds the rest (`packages/record/src/methods/chat-answer.ts`): a grant names the
 * person, the key, the question, the options shown and the question's version, is spent by one press and lapses in
 * fifteen minutes, and is minted only for a key Claude or ChatGPT holds after the person signed in to it, only while the
 * owner's "Answer from inside chat apps" is on.
 *
 * `answer` IS LISTED FOR THE CARD AND HIDDEN FROM THE MODEL: `_meta.ui.visibility` is `["app"]` (MCP Apps) and
 * `openai/visibility` is `private` (ChatGPT), and `openai/widgetAccessible` lets ChatGPT's card call it. An app that
 * shows it to the model anyway shows a tool the model cannot use: it holds no grant. It is listed only to a key Claude
 * or ChatGPT holds, by a door whose record answers presses (`answersFor`), so a stdio session, a key on a machine and a
 * record without it list the tools they always did.
 */

import type { Result } from '@braindog/ports';

import { ANSWER_TOOL, GRANT_META, type DecisionCard, type Ground } from './cards.ts';
import type { McpSurface } from './index.ts';
import { movesOf, moneyLine, plain, type Moved } from './option-visual.ts';

type Answer<T = unknown> = Promise<Result<T>>;

/** What a record that answers presses adds to the door's surface (both INTERNAL, so only the door in the host has them). */
export type Answering<C> = {
  chatApp?(args: Record<string, never>, ctx: C): Answer<{ app: string }>;
  chatAnswerMint?(args: { id: string; options: string[] }, ctx: C): Answer<{ grant: string; until: string; app: string; hard: string[] }>;
  chatAnswer?(args: { grant: unknown; option: unknown }, ctx: C): Answer<{ decision: string | null; question: string; option: string; app: string; said: string }>;
};

/** Whether this door's record answers a press on a card at all. */
export const answers = <C>(surface: McpSurface<C>): boolean => {
  const s = surface as McpSurface<C> & Answering<C>;
  return typeof s.chatApp === 'function' && typeof s.chatAnswerMint === 'function' && typeof s.chatAnswer === 'function';
};

/**
 * Whether `answer` is listed to this caller: a door whose record answers presses, asked whether a chat app holds this
 * key. A key on a machine (Claude Code, Codex) is never listed it. Never throws.
 */
export async function answersFor<C>(surface: McpSurface<C>, ctx: C): Promise<boolean> {
  if (!answers(surface)) return false;
  try {
    const out = await (surface as McpSurface<C> & Answering<C>).chatApp!({}, ctx);
    return out.ok;
  } catch {
    return false;
  }
}

/** `answer` as `tools/list` lists it: for the card, and hidden from the model in both apps. */
export const ANSWER_LISTED = {
  name: ANSWER_TOOL,
  title: 'Answer from the card',
  description: 'Only the decision card calls this, when the person presses an option on it. Called without the card it answers nothing.',
  inputSchema: {
    type: 'object',
    properties: { grant: { type: 'string' }, option: { type: 'string' } },
    required: ['option'],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  _meta: { ui: { visibility: ['app'] }, 'openai/visibility': 'private', 'openai/widgetAccessible': true },
} as const;

/** What `answer` says to a call that brings no grant: the model asking. Nothing is answered, and nothing is asked of the record. */
export const SHOW_THE_CARD = {
  code: 'LEVEL_REQUIRED',
  fix: 'Only the person answers, by pressing an option on the decision card. Show them the card: call governance with the question’s id.',
  at: 'grant',
} as const;

/** A tool answer as `tools/call` renders one: the text the model reads, the JSON beside it, and `isError` on a refusal. */
export type Rendered = { isError?: true; content: { type: 'text'; text: string }[]; structuredContent: Record<string, unknown> };

const refusedAs = (refusal: Record<string, unknown>): Rendered => ({
  isError: true,
  content: [{ type: 'text', text: typeof refusal.fix === 'string' ? refusal.fix : 'Answer it in BrainDog.' }],
  structuredContent: refusal,
});

/**
 * One call of `answer`. A call with no grant is the model's, refused here before the record is asked; a call with one is
 * handed to the record, which spends it or says why not. Never throws.
 */
export async function answerCall<C>(surface: McpSurface<C>, args: Record<string, unknown>, ctx: C): Promise<Rendered> {
  const s = surface as McpSurface<C> & Answering<C>;
  if (typeof args.grant !== 'string' || args.grant === '' || typeof s.chatAnswer !== 'function') return refusedAs({ ...SHOW_THE_CARD });
  try {
    const out = await s.chatAnswer({ grant: args.grant, option: args.option }, ctx);
    if (!out.ok) return refusedAs('refusal' in out ? (out.refusal as unknown as Record<string, unknown>) : { code: 'VERSION_STALE', fix: 'The record moved while this was answered. Answer it in BrainDog.' });
    const value = out.value;
    return { content: [{ type: 'text', text: value.said }], structuredContent: value as unknown as Record<string, unknown> };
  } catch {
    return refusedAs({ code: 'INTERNAL', fix: 'This press did not reach BrainDog. Answer it in BrainDog.' });
  }
}

/**
 * A decision card with its grant, or the card as it was: the door asks the record for one grant for the question and
 * the options the card shows, and on a yes the card's buttons answer (`answerTool`), the options the record weighs as
 * hard are pressed twice, and the grant goes in `_meta` under `GRANT_META`. A record that says no (the setting off, a key
 * no chat app holds, a question that installs) leaves the card linking to BrainDog. Never throws.
 */
export async function withGrant<C>(surface: McpSurface<C>, ctx: C, id: string, card: DecisionCard): Promise<{ card: DecisionCard; meta: Record<string, unknown> }> {
  const s = surface as McpSurface<C> & Answering<C>;
  if (typeof s.chatAnswerMint !== 'function' || card.options.length === 0) return { card, meta: {} };
  try {
    const out = await s.chatAnswerMint({ id, options: card.options.map((o) => o.id) }, ctx);
    if (!out.ok) return { card, meta: {} };
    const hard = new Set(out.value.hard);
    return {
      card: { ...card, answerTool: ANSWER_TOOL, options: card.options.map((o) => ({ ...o, hard: o.hard || hard.has(o.id) })) },
      meta: { [GRANT_META]: { grant: out.value.grant, until: out.value.until } },
    };
  } catch {
    return { card, meta: {} };
  }
}

const SPOKEN = /^[a-z][a-z0-9_]*#[1-9][0-9]*$/u;

/** A row by its spoken id or its id, as the caller may read it, or null. Never throws. */
async function rowOf<C>(surface: McpSurface<C>, ctx: C, ref: unknown): Promise<Record<string, unknown> | null> {
  if (typeof ref !== 'string' || ref.trim() === '' || ref.length > 80) return null;
  try {
    const got = await surface.get({ spoken: ref.trim() }, ctx);
    const v: unknown = got.ok ? got.value : null;
    return typeof v === 'object' && v !== null && typeof (v as { fields?: unknown }).fields === 'object' ? ((v as { fields: Record<string, unknown> }).fields ?? null) : null;
  } catch {
    return null;
  }
}

const oneMove = (v: unknown): Moved | null => {
  const m = movesOf(v);
  return m.length === 1 ? m[0]! : null;
};

/**
 * What a question's pictures are drawn against, read as the web's ground is (`apps/web/src/lib/decide/ground.ts`): the
 * row the question is about, the balance of the account it sits in, the name of what it is filed under, and its own
 * figure. Each read is the caller's own `get`, so nothing is drawn from a row it may not read. The month's spend is not
 * read here: it is a list read, and the card is drawn against the balance or not at all. Never throws; a part not read
 * draws nothing that needs it.
 */
export async function groundOf<C>(surface: McpSurface<C>, ctx: C, row: Record<string, unknown>): Promise<Ground> {
  const body = typeof row.body === 'object' && row.body !== null ? (row.body as Record<string, unknown>) : {};
  const about = typeof row.about === 'string' ? row.about : typeof body.about === 'string' ? body.about : null;
  if (about === null || !SPOKEN.test(about.trim())) return {};
  const fields = await rowOf(surface, ctx, about);
  if (fields === null) return {};
  const [account, filed] = await Promise.all([rowOf(surface, ctx, fields.account), rowOf(surface, ctx, fields.category)]);
  const out: Ground = {};
  const balance = account === null ? null : oneMove(account.balance);
  if (balance !== null) out.balance = balance;
  const name = filed === null ? null : (plain(filed.name) ?? plain(filed.title));
  if (name !== null) out.listName = name;
  const figure = oneMove(fields.amount);
  if (figure !== null) out.figure = moneyLine(Math.abs(figure.amount), figure.currency);
  return out;
}

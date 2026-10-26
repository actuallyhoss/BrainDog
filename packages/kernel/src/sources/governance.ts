/**
 * `governance.open`, `governance.later` and `governance.decided`: the questions waiting on a person, the ones put off
 * and the ones answered.
 *
 * THREE NAMES IN ONE FILE because they are one thing at three moments: the open and the put off share a shape and a
 * `where`, and all three read what the record keeps of a question. None belongs to a list, so each is shown to a
 * reader of the whole record. Moved out of `pages.ts` with their answers unchanged (`sources/index.ts`).
 *
 * THE TWO SCHEMAS ARE MADE FROM THE KIT, since the kinds of body and the costs are the kernel's own lists and a module
 * imports nothing of the kernel at run time. Each read makes the one it reads with.
 */

import type { Schema } from '@braindog/where';
import { evaluate } from '@braindog/where';

import type { Entry } from '../index.ts';
import type { BlockResult, OpenFacts, PageBlock, PageDeps, QueueQuestion, SourceKit } from '../pages.ts';
import type { Also, Source } from './index.ts';

/**
 * What a queue's `where:` may ask about a question: who opened it, and what kind of thing it proposes.
 *
 * NOT THE BODY ITSELF. A proposal's body is a different shape per kind, and a predicate over it would be
 * a query language over something the record does not promise to keep stable. Who asked and what they are
 * asking for is what a page filters on.
 *
 * AND WHAT IT WOULD COST TO GET WRONG, which is a fact about the body that the record computes rather
 * than reads (`weigh.ts`). It is here because a page that wants only the expensive half — a Home that
 * draws what must be thought about, with the rest behind a count — can then say so, and because
 * without it the only way to filter to the same set is to name the body kinds one by one and keep
 * that list in step with `weigh.ts` by hand.
 */
/* AND WHAT IT IS ABOUT, when whoever opened it said (`body.about`), so a page per area draws that area's calls with
   `about is {{name}}`. It is the one word of a body read here, and it is a word the proposer chose to be filtered by. */
/* AND THE LIST THAT ROW IS ON, when `about` names a row (`obligations#4`, as a rule's question does), so a module's page
   draws its own calls with `list is obligations or transactions` and never a pattern over `about` (`listOf`). */
const openSchema = (kit: SourceKit): Schema => ({
  register: 'governance',
  fields: { who: { type: 'text' }, kind: { type: 'enum', values: kit.BODY_KINDS }, cost: { type: 'enum', values: kit.COSTS }, about: { type: 'text' }, list: { type: 'text' } },
});

/** How many questions a queue draws when a page names no `limit:`. Past this, the rest is the count. */
const QUEUE_LIMIT = 3;
/** The most it will draw, however large a `limit:` a page asks for: a queue is not a list of everything. */
const QUEUE_CEILING = 20;

/**
 * A `queue` over `governance.open`: the questions waiting on a person, and how many there are.
 *
 * THE COUNT IS OF WHAT MATCHED, NOT OF WHAT IS DRAWN, so "3 more" is three more and not the remainder of a
 * page the reader cannot see. A predicate narrows both, which is why the filter runs before the cut.
 */
function openBlock(deps: PageDeps, block: PageBlock, base: BlockResult, also: Also, kit: SourceKit): BlockResult {
  const { predicateOf, listOf, staleAt } = kit;
  const OPEN = openSchema(kit);
  if (!deps.openQuestions)
    return { ...base, refusals: also({ code: 'NOT_IN_THIS_BUILD', fix: 'This record does not read its open questions onto a page yet.', at: 'source' }) };
  if (block.order?.length)
    return { ...base, refusals: also({ code: 'DECLARATION_INVALID', fix: 'governance.open comes ranked by what each question would cost to get wrong, so it takes no order:.', at: 'order' }) };
  const said = predicateOf(block.where, OPEN, deps.ctx);
  if (said.bad.length) return { ...base, refusals: also(...said.bad) };
  const limit = Math.min(QUEUE_CEILING, Math.max(1, Math.floor(block.limit ?? QUEUE_LIMIT)));
  /* A QUESTION'S LIST IS THE ROW IT NAMES, else the list its rowset adds to or changes (`on`). */
  const admits = (q: OpenFacts): boolean => evaluate(said.predicate, { who: q.who, kind: q.kind, cost: q.cost, about: q.about, list: listOf(q.about) ?? q.rows_on ?? null }, OPEN);
  /* THE FILTER GOES TO THE RECORD, which ranks every open question it admits and cuts after. Filtered here over the
     newest twenty, an expensive question asked a month ago never reached a page with a `where:`, nor its count. */
  const read = deps.openQuestions(Math.max(limit, QUEUE_CEILING), said.predicate === undefined ? undefined : admits);
  /* AND AGAIN HERE, for a host that takes no filter: what it was handed is filtered as it always was. */
  const kept = read.questions
    .map((q) => familyOf({ ...q, list: listOf(q.about) ?? q.rows_on ?? null }))
    .filter((q) => admits({ who: q.who, kind: q.kind, cost: q.cost, about: q.about ?? null, rows_on: q.rows_on ?? null }));
  /* THE RECORD'S OWN COUNT when it answered one, over everything the filter admitted. A host that answers none: with no
     predicate, every open question; with one, what this page could see, and it says so by being smaller. */
  const matched = read.matched ?? (said.predicate === undefined && read.questions.length < read.open ? read.open : kept.length);
  const stale = read.stale ?? kept.filter((q) => staleAt(q.at, deps.ctx.nowMs)).length;
  const hardToUndo = read.hardToUndo ?? kept.filter((q) => q.cost === 'undo').length;
  return { ...base, queue: ledBy(block, kept.slice(0, limit)), matched, waiting: { stale, hardToUndo } };
}

/**
 * A question with its family as the record said it (`cause`, `alike`), or neither.
 *
 * A COUNT OF A FAMILY THAT HAS NO NAME SAYS NOTHING, so `alike` without a `cause` is left off, and so is one that is not
 * a whole number of at least one: the question itself is always one of its own family. A blank cause is no cause.
 */
function familyOf<Q extends QueueQuestion>(q: Q): Q {
  const { cause, alike, ...rest } = q;
  if (typeof cause !== 'string' || cause.trim() === '') return rest as Q;
  return { ...rest, cause, ...(typeof alike === 'number' && Number.isInteger(alike) && alike >= 1 ? { alike } : {}) } as Q;
}

/**
 * A queue's questions with the lead's carrying what was proposed and what accepting does.
 *
 * THE LEAD IS DRAWN WHOLE AND THE REST ARE ONE LINE EACH, so the line saying what a yes changes travels on the first
 * question: a queue of twenty is not twenty paragraphs nobody reads. Without `lead: true` none carries it.
 *
 * A CHANGE TO WHAT A LIST HOLDS KEEPS ITS LINE BELOW THE LEAD TOO. Its card says the line wherever it stands (the web's
 * `cardOf`), since it is the one place a change the card cannot draw from and to is said at all, and a card handed no
 * line said nothing of it. It is one sentence, and no other kind carries one down the queue.
 */
function ledBy(block: PageBlock, questions: readonly QueueQuestion[]): QueueQuestion[] {
  return questions.map((q, at) => {
    const { body_kind, does, ...rest } = q;
    if (block.lead !== true) return rest;
    if (at > 0) return q.kind === 'rowset' && does ? { ...rest, does } : rest;
    return { ...rest, body_kind: body_kind ?? q.kind, ...(does ? { does } : {}) };
  });
}

/**
 * A `queue` over `governance.later`: the questions put off whose day has not come, soonest back first, each with the
 * day it comes back and why it was put off. The same shape and the same `where` an open question has, so a page draws
 * them with the queue it draws the open ones with.
 */
function laterBlock(deps: PageDeps, block: PageBlock, base: BlockResult, also: Also, kit: SourceKit): BlockResult {
  const { predicateOf, listOf } = kit;
  const OPEN = openSchema(kit);
  if (!deps.laterQuestions)
    return { ...base, refusals: also({ code: 'NOT_IN_THIS_BUILD', fix: 'This record does not read what was put off onto a page yet.', at: 'source' }) };
  if (block.order?.length)
    return { ...base, refusals: also({ code: 'DECLARATION_INVALID', fix: 'governance.later comes soonest back first, so it takes no order:.', at: 'order' }) };
  const said = predicateOf(block.where, OPEN, deps.ctx);
  if (said.bad.length) return { ...base, refusals: also(...said.bad) };
  const limit = Math.min(QUEUE_CEILING, Math.max(1, Math.floor(block.limit ?? QUEUE_LIMIT)));
  const read = deps.laterQuestions(Math.max(limit, QUEUE_CEILING));
  const kept = read.questions
    .map((q) => familyOf({ ...q, list: listOf(q.about) ?? q.rows_on ?? null }))
    .filter((q) => evaluate(said.predicate, { who: q.who, kind: q.kind, cost: q.cost, about: q.about ?? null, list: q.list }, OPEN));
  const matched = said.predicate === undefined && read.questions.length < read.later ? read.later : kept.length;
  return { ...base, queue: ledBy(block, kept.slice(0, limit)), matched };
}

/**
 * What a `governance.decided` block's `where` and columns may name: one row an answered question. `answer` is the
 * option chosen and `answer_label` its own words; `kind` and `about` are the question's.
 */
const decidedSchema = (kit: SourceKit): Schema => ({
  register: 'governance',
  fields: {
    question: { type: 'text' },
    answer: { type: 'text' },
    answer_label: { type: 'text' },
    reason: { type: 'text' },
    who: { type: 'text' },
    at: { type: 'instant' },
    kind: { type: 'enum', values: kit.BODY_KINDS },
    about: { type: 'text' },
    list: { type: 'text' },
  },
});

/** How many answered questions a block draws unasked, and the most it reads to find them. */
const DECIDED_LIMIT = 10;
const DECIDED_READ = 200;

/**
 * A block over `governance.decided`: what was answered, latest first, one row a decision. Rows rather than a queue,
 * because nothing waits on them: a table, a timeline or a feed draws them as it draws any list's.
 */
function decidedBlock(deps: PageDeps, block: PageBlock, base: BlockResult, also: Also, kit: SourceKit): BlockResult {
  const { predicateOf, listOf } = kit;
  const DECIDED = decidedSchema(kit);
  if (!deps.decisions)
    return { ...base, refusals: also({ code: 'NOT_IN_THIS_BUILD', fix: 'This record does not read what was decided onto a page yet.', at: 'source' }) };
  if (block.order?.length)
    return { ...base, refusals: also({ code: 'DECLARATION_INVALID', fix: 'governance.decided comes latest first, so it takes no order:.', at: 'order' }) };
  const unknown = (block.columns ?? []).map((c) => c.field).filter((f) => !Object.hasOwn(DECIDED.fields, f));
  if (unknown.length)
    return {
      ...base,
      refusals: also({ code: 'FIELD_UNKNOWN', fix: `A decision has no field called ${unknown.join(', ')}.`, at: 'columns', allowed: Object.keys(DECIDED.fields) }),
    };
  const said = predicateOf(block.where, DECIDED, deps.ctx);
  if (said.bad.length) return { ...base, refusals: also(...said.bad) };
  const limit = block.limit === undefined ? DECIDED_LIMIT : Math.min(DECIDED_READ, Math.max(0, Math.floor(block.limit)));
  const read = deps.decisions(DECIDED_READ);
  const rows = read.decisions
    .map((d): Entry => ({
      id: d.id,
      register: DECIDED.register,
      seq: null,
      fields: {
        question: d.question,
        answer: d.answer,
        answer_label: d.answer_label ?? null,
        reason: d.reason,
        who: d.who,
        at: d.at,
        kind: d.kind,
        about: d.about ?? null,
        list: listOf(d.about),
      },
      state: null,
      version: 1,
      created_at: d.at,
      updated_at: d.at,
      deleted_at: null,
    }))
    .filter((e) => evaluate(said.predicate, e.fields, DECIDED));
  const matched = said.predicate === undefined && read.decisions.length < read.total ? read.total : rows.length;
  return { ...base, rows: rows.slice(0, limit), matched };
}

export const governanceOpen: Source = { whole: true, read: openBlock };
export const governanceLater: Source = { whole: true, read: laterBlock };
export const governanceDecided: Source = { whole: true, read: decidedBlock };

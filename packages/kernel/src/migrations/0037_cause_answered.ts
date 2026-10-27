/**
 * The kernel schema, migration 37: a question already answered is found by its cause.
 *
 * A DECLINE WRITES NO DECISION ROW (`govern.ts`, `resolved_as`): the question is resolved as `wont-fix` or `incorrect`
 * and that is all. So migration 31's `decision_cause` finds what he said yes to and never what he said no to, and an
 * agent that proposes again what he declined yesterday files a new question. This index finds the closed questions of
 * one cause, newest first, which is the read `propose` makes before it files and the read of open questions makes to say
 * one was asked before.
 *
 * PARTIAL, over closed questions with a cause only: an open one is migration 31's `suggestion_cause_open`, unique, and a
 * question with no cause is never looked up by one. No table and no column, so the format is still 1.
 *
 * `IF NOT EXISTS`, so a second run changes nothing.
 */

export default `
CREATE INDEX IF NOT EXISTS suggestion_cause_closed ON suggestion(cause, opened_at DESC) WHERE cause IS NOT NULL AND status <> 'open';
`;

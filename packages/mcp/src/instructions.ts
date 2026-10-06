/**
 * What every agent is told before it has called anything.
 *
 * THE FIRST 512 CHARACTERS STAND ALONE, AND HOLD THE THREE RULES THAT MATTER ON EVERY CALL. Codex and ChatGPT treat only
 * the first 512 characters of a server's instructions as the part that is always read, and Claude Code, which defers a
 * server's tools behind a search, still plans with its instructions. The ten rules this replaced put "an agent never
 * decides" at character 564 and the phone rule last, so the two that shape every answer were the two a client was
 * likeliest to drop. Now the opening says what BrainDog is and then the three: call `context` first; suggest, and let the
 * person decide in BrainDog; write short and plain for a phone. `budget.test.ts` holds the 512.
 *
 * WHAT IS LEFT AFTER THEM IS WHAT HOLDS ACROSS TOOLS: how an answer reads, the credential rule, when a learning is worth
 * keeping, and what a refusal hands back. Money, compare-and-set and the handoff's manners moved to the descriptions of
 * the tools they are about (`index.ts`), where a model reads them when it picks the tool.
 *
 * AND ONE LINE SAYS WHOM TO MEET, because the record understands the people and organisations in the work only as well
 * as agents tell it about them (DIRECTION §38): everyone worked with or told about, with an address or handle, since a
 * name alone is only noted. The opening's list of what a record holds paid for it.
 *
 * SENT ONCE A CONNECTION: in `initialize`, or in `server/discover` for a client of the stateless revision, and no longer
 * with every `tools/list`, which carried the whole text a second time in every session that asked for both.
 *
 * ONE RULE TO A LINE, PLAIN ASCII: a rule an agent can quote back is a rule it followed. The one command named,
 * `braindog keys put`, is held to the command line's own help by `apps/cli/test/stdio.test.ts`.
 */
export const INSTRUCTIONS = [
  "BrainDog is one person's record of their work, shared by every agent that works for them. Three rules hold on every call.",
  '1. Call context first. It names your run and project, the next step, what waits on the person, and the Home page.',
  '2. Suggest, and let the person decide in BrainDog. Never decide for them: put the choice to them with propose.',
  '3. Write short and plain, for a phone: say names, never ids, and one line where one will do.',
  'Reads answer in short lines; format full answers in JSON.',
  'Meet everyone you work with or are told about, with an email or handle when you have one.',
  'A credential never goes in a row, a note or a tool call. Deposit a key with the command braindog keys put <label>, which reads it from standard input.',
  'Record a learning only when a future session would otherwise get something wrong, and say the failure in because. Most sessions record none.',
  'A refusal names the field and the fix; its try is the corrected call. Never resend one unchanged.',
].join('\n');

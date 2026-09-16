/**
 * What every agent is told before it has called anything.
 *
 * `loop/research-agent-path.md` §1.4 is the text, word for word. It goes out in `initialize` and
 * again with every `tools/list`, because a client that skips the first still reads the second. One
 * rule to a line, plain ASCII: a rule an agent can quote back is a rule it followed.
 *
 * IT CARRIES WHAT EVERY TOOL WOULD OTHERWISE REPEAT. Minor units, compare-and-set, never deciding,
 * never a credential, the handoff, the refusal that teaches. A tool description says when to reach
 * for that tool; these say how to behave with all of them.
 */
export const INSTRUCTIONS = [
  "BrainDog is one person's business record, shared by every agent that works for them. Call context first: it names your session, your project, and what applies here.",
  'Money is an integer in minor units with its currency. Shift it by the decimals of that currency before saying a number (GBP 2, JPY 0, KWD 3), and never add two currencies.',
  'Writes are compare-and-set. On VERSION_STALE, re-read the row and re-apply your change to the new copy. Never resend the copy you held.',
  'An agent never decides. Lay out options with propose; the person chooses in their app. To change something you may not change yourself, such as a skill\'s text or where a key applies, propose it.',
  'A credential never goes in a row, a note or a tool call. Deposit a key with the command braindog key add, which reads it from standard input.',
  'Before you stop, call handoff with the one next step. Record each dead end in tried the moment you rule it out.',
  'Record a learning only when a future session would otherwise get something wrong, and say the failure in because. Most sessions record none.',
  'When you meet a person in the work, such as a commit author, a sender or a client, call meet.',
  'A refusal names the field and the fix. Correct the call; never retry it unchanged.',
  'Everything you write is read on a phone. Keep it short and plain.',
].join('\n');

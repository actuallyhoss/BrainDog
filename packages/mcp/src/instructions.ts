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
 *
 * ONE SENTENCE IS NOT §1.4's: "Read the Home page for what leads", on the first rule. It is what
 * the `money` tool's place is taken by (`loop/research-m3-dynamic.md` section 3, B6). That tool read
 * seven figures of one pack by id; the Home page is the one a record's own packs declare as what
 * leads (`packages/seed/src/modules/money.ts` declares money-core's, and a use case overrides it),
 * and `braindog:page/home` answers it with every block run. A record whose packs declare no Home has
 * no such page and the resource list does not offer one, so the sentence costs that record nothing
 * but its tokens. ON THE FIRST RULE AND NOT A LINE OF ITS OWN, because a line costs its newline:
 * measured by `test/budget.test.ts` on 24 September, the rules were 392 of their 400 and the
 * sentence as an eleventh line made them 401, red; appended to the line that already says where to
 * start, 400. There is nothing left under that ceiling now, and the next sentence here has to be
 * paid for by cutting one.
 */
export const INSTRUCTIONS = [
  "BrainDog is one person's record of their work, projects, money and whatever else they keep in it, shared by every agent that works for them. Call context first: it names your session, your project, and what applies here. Read the Home page for what leads.",
  'Money is an integer in minor units with its currency. Shift it by the decimals of that currency before saying a number (GBP 2, JPY 0, KWD 3), and never add two currencies.',
  'Writes are compare-and-set. On VERSION_STALE, re-read the row and re-apply your change to the new copy. Never resend the copy you held.',
  'An agent never decides. Lay out options with propose; the person chooses in their app. To change something you may not change yourself, such as a skill\'s text or where a key applies, propose it.',
  'A credential never goes in a row, a note or a tool call. Deposit a key with the command braindog keys put <label>, which reads it from standard input.',
  'Call handoff with doing once you know the task, and before you stop with the one next step. Record each dead end in tried when you rule it out.',
  'Record a learning only when a future session would otherwise get something wrong, and say the failure in because. Most sessions record none.',
  'When you meet a person in the work, such as a commit author, a sender or a client, call meet.',
  'A refusal names the field and the fix. Correct the call; never retry it unchanged.',
  'Everything you write is read on a phone. Keep it short and plain.',
].join('\n');

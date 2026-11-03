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
 * keeping, and what a refusal hands back. The learning line says WHEN, not only when not: "only if a future
 * session would otherwise get it wrong" was read as "never", and 904 runs wrote none; and it names `topic` as the
 * skill's name, which is what drafts a skill's next version at the daily look. Money, compare-and-set and the handoff's manners moved to the descriptions of
 * the tools they are about (`index.ts`), where a model reads them when it picks the tool.
 *
 * THE SECOND RULE SAYS WHEN AN AGENT DECIDES (the owner's decision of 27 October): only when the person tells it to, and
 * then with their words as `said`, which `instructions` takes with `answer` and `option`, and `create` and `update` take
 * for a change that would have asked. The record holds the rest: his switch, what no word reaches, and the words kept.
 *
 * AND ONE LINE SAYS WHOM TO MEET, because the record understands the people and organisations in the work only as well
 * as agents tell it about them: everyone worked with or told about, with an address or handle, since a
 * name alone is only noted. The opening's list of what a record holds paid for it.
 *
 * SENT ONCE A CONNECTION: in `initialize`, or in `server/discover` for a client of the stateless revision, and no longer
 * with every `tools/list`, which carried the whole text a second time in every session that asked for both.
 *
 * ONE RULE TO A LINE, PLAIN ASCII: a rule an agent can quote back is a rule it followed. The one command named,
 * `braindog keys put`, is held to the command line's own help by `apps/cli/test/stdio.test.ts`.
 */
export const INSTRUCTIONS = [
  "BrainDog is one person's record of their work, shared by their agents. Three rules hold on every call.",
  '1. Call context first: it names your run, project, next step and what waits.',
  '2. Suggest, and let the person decide in BrainDog: ask with propose; act when they tell you, passing their words as said.',
  '3. Write short and plain, for a phone: say names, never ids, and one line where one will do.',
  'Reads answer in short lines; format "full" gives JSON.',
  'Meet everyone you work with or hear of, with an email or handle.',
  'A credential never goes in a row, note or call: pipe it to braindog keys put <label> --opens <what>.',
  'After a fix, a surprise or a dead end a later session would repeat, create a learning: topic is the skill it bears on, by name; because says how it went wrong.',
  'A refusal names the field and fix; its try is the corrected call. Never resend one unchanged.',
].join('\n');

/**
 * THE PROMPTS, which a client shows a person as commands (`/braindog:start` in Claude Code) and which cost the tool list
 * nothing (agents and MCP plan §6.3): the start of a session, its end, and a decision laid out for him. Each is the
 * calls in order, said as an agent follows them, with the exact arguments, because a prompt is read once and acted on.
 */
export type Prompt = { name: string; title: string; description: string; arguments?: { name: string; description: string; required?: boolean }[] };

export const PROMPTS: readonly Prompt[] = [
  { name: 'start', title: 'Start with BrainDog', description: 'Read your briefing and what you were told, then say your plan.' },
  { name: 'wrap', title: 'Wrap up with BrainDog', description: 'Answer what you were told, leave the next step, keep a lesson only if it is needed.' },
  {
    name: 'ask',
    title: 'Ask the owner to decide',
    description: 'Lay out a decision with options for the person to make in BrainDog.',
    arguments: [{ name: 'about', description: 'What needs deciding, in a few words.' }],
  },
  /* WHAT BRAINDOG LACKS, BUILT AS AN ADD-ON (addons market plan, 3 Nov): the store first, then a file of the agent's own,
     checked until it reads, then asked. A prompt costs the tool list nothing, and a client shows it as a command. */
  {
    name: 'addon',
    title: 'Build an add-on',
    description: 'Find an add-on for what BrainDog lacks, or make one, check it, and ask the person to install it.',
    arguments: [{ name: 'want', description: 'What the person wants BrainDog to do, in a few words.' }],
  },
];

/** What each prompt says, as one message from the person: the calls in order. */
const PROMPT_TEXT: Readonly<Record<string, (args: Record<string, string>) => string>> = {
  start: () =>
    [
      'Start this session with BrainDog:',
      '1. Call context. Its first lines are what the person told you, if anything. With no folder, pass topic: what the person is working on, in a few words.',
      '2. If something was told to you, call instructions with {take:"<its id>"} before you start on it.',
      '3. Say your plan in one line with handoff {doing:"<verb first>"}, then work.',
    ].join('\n'),
  wrap: () =>
    [
      'Wrap up this session with BrainDog:',
      '1. If you took an instruction, answer it: instructions {reply:"<its id>", said:"<what you did, one line>", state:"done"}, or needs_you or declined with why.',
      '2. Call handoff with {next:"<the one next step>"}, and tried for each dead end. If you finished a task, handoff {done:"<task>", note:"<how>"}.',
      '3. If you fixed a surprise or hit a dead end a later session would repeat, create a learning with topic, the skill it bears on, and the failure in because.',
    ].join('\n'),
  addon: (a) =>
    [
      `Make BrainDog do what it lacks, as an add-on${a.want ? `: ${a.want}` : ''}.`,
      '1. Look in the store first: act, call "addons", args q set to a few words. If one fits, act, call "addon", args id, says who made it and what it asks of theirs; act, call "installPack", args id, then asks them.',
      '2. Otherwise read braindog:grammar/pack (or act, call "arrangement", args grammar "pack"), then act, call "addonNew", args id, title and fields, for a file that installs.',
      '3. Change the file to do what they asked, then act, call "addonCheck", args doc. Fix each refusal it names and check again until it says Ready.',
      '4. act, call "installPack", args doc: it asks the person on Decide, showing every list, page, host and key it would reach. Nothing installs until they say yes.',
      '5. To change it later: act, call "addon", args id and file true; edit it, raise its version, check it, and call installPack again.',
    ].join('\n'),
  ask: (a) =>
    [
      `Ask the person to decide${a.about ? `: ${a.about}` : ''}.`,
      'Call propose with question (one answerable sentence), body_kind "options" and body {"options":[{"id":"a","label":"...","because":"..."},{"id":"b","label":"...","because":"..."}]}, putting the one you would pick first.',
      'Do not act on it until they decide in BrainDog.',
    ].join('\n'),
};

/** One prompt as `prompts/get` answers it, or `null` for a name there is none of. */
export function promptOf(name: string, args: Record<string, unknown>): { description: string; messages: { role: 'user'; content: { type: 'text'; text: string } }[] } | null {
  const prompt = PROMPTS.find((p) => p.name === name);
  const say = Object.hasOwn(PROMPT_TEXT, name) ? PROMPT_TEXT[name] : undefined;
  if (prompt === undefined || say === undefined) return null;
  const given = Object.fromEntries(Object.entries(args).flatMap(([k, v]) => (typeof v === 'string' && v.trim() !== '' ? [[k, v.trim().slice(0, 200)]] : [])));
  return { description: prompt.description, messages: [{ role: 'user', content: { type: 'text', text: say(given) } }] };
}

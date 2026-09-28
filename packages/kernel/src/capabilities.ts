/**
 * What an automation can do, one row per trigger and per step: whether it installs, whether a run takes it, on which
 * hosts, and the words said where it does not (`loop/finish/defects.md` §4.2, "one capability table").
 *
 * ONE ROW, BECAUSE FOUR PLACES SAID IT AND THEY DRIFTED. What a trigger or a step could do was written into the lint
 * (`flow-lint.ts`, at install), the runner (`flow.ts`, at the run), the grammar an agent reads
 * (`packages/mcp/src/automations.ts`, whose own comment recorded one drift) and docs/07 §6.2, each by hand. A capability
 * that landed in one and not the others was refused at install while the grammar offered it, or offered while the run
 * failed it. The lint, the runner and the grammar now ask this table, so flipping a row flips all three, and docs/07
 * §6.2 names this file as where the answer is kept.
 *
 * NOTHING IS IMPORTED HERE, so any reader can take it without taking the kernel's cycle with it: `flow-lint.ts` is
 * imported by `declare.ts`, and the grammar reaches this file through `@braindog/record`, the one package `@braindog/mcp`
 * depends on.
 *
 * THE WORDS ARE THE END OF A SENTENCE, never a whole one. The lint, the host check at install (`unserved` in `index.ts`)
 * and the runner each open with their own subject ("rule.x asks ... at steps[2], and") and close with their own advice,
 * so the one fact in the middle is said the same way by all three. The grammar names the rows and not their words.
 */

/**
 * Where a capability runs. `every` is each host this build ships; `answers-slash` is a host whose record was opened with
 * `answersSlash`, because only such a host leases the `infer.ask` job the step queues (`flow.ts`'s header).
 */
export type Hosts = 'every' | 'answers-slash';

export type Capability = {
  /** A trigger's key under `on:`, or a step's verb, or `<verb>.<key>` for one key of a step. */
  name: string;
  of: 'trigger' | 'step';
  /** Whether the lint lets a body holding it install. */
  installs: boolean;
  /** Whether a run that reaches it takes it. A row that installs and does not run fails the run there with `says`. */
  runs: boolean;
  hosts: Hosts;
  /**
   * Why it does not install or run, or does not on every host, as the middle of a sentence: no capital, no full stop.
   * Empty where it installs and runs everywhere.
   */
  says: string;
};

/**
 * The table. A trigger or a step not listed here is one the lint refuses by its shape, before this is asked.
 *
 * A ROW FLIPS HERE, IN THE CHANGE THAT BUILDS WHAT IT NAMES. `call` installed and failed every run that reached it
 * until the runner learned to queue the call and park the run on its answer (`flow.ts`); `ask_person.to` was refused at
 * install until a question could be put to one member and held to them (`govern.ts`'s `decide`). A row that installs
 * and does not run is still a shape this table can hold: the run that reaches it fails with the row's sentence, after
 * taking every step before it.
 */
export const CAPABILITIES: readonly Capability[] = [
  { name: 'written', of: 'trigger', installs: true, runs: true, hosts: 'every', says: '' },
  { name: 'arrival', of: 'trigger', installs: true, runs: true, hosts: 'every', says: '' },
  { name: 'every', of: 'trigger', installs: true, runs: true, hosts: 'every', says: '' },
  { name: 'metric', of: 'trigger', installs: true, runs: true, hosts: 'every', says: '' },
  { name: 'decided', of: 'trigger', installs: true, runs: true, hosts: 'every', says: '' },
  { name: 'manual', of: 'trigger', installs: true, runs: true, hosts: 'every', says: '' },

  { name: 'if', of: 'step', installs: true, runs: true, hosts: 'every', says: '' },
  { name: 'set_var', of: 'step', installs: true, runs: true, hosts: 'every', says: '' },
  { name: 'wait', of: 'step', installs: true, runs: true, hosts: 'every', says: '' },
  { name: 'script', of: 'step', installs: true, runs: true, hosts: 'every', says: '' },
  { name: 'call', of: 'step', installs: true, runs: true, hosts: 'every', says: '' },
  {
    name: 'ask_slash',
    of: 'step',
    installs: true,
    runs: true,
    hosts: 'answers-slash',
    says: "no host in this build answers an automation's question to Slash",
  },
  { name: 'ask_person', of: 'step', installs: true, runs: true, hosts: 'every', says: '' },
  { name: 'ask_person.to', of: 'step', installs: true, runs: true, hosts: 'every', says: '' },
  { name: 'meet', of: 'step', installs: true, runs: true, hosts: 'every', says: '' },
  { name: 'run_job', of: 'step', installs: true, runs: true, hosts: 'every', says: '' },
  { name: 'tag', of: 'step', installs: true, runs: true, hosts: 'every', says: '' },
  { name: 'untag', of: 'step', installs: true, runs: true, hosts: 'every', says: '' },
  { name: 'set', of: 'step', installs: true, runs: true, hosts: 'every', says: '' },
  { name: 'move', of: 'step', installs: true, runs: true, hosts: 'every', says: '' },
  { name: 'link', of: 'step', installs: true, runs: true, hosts: 'every', says: '' },
  { name: 'note', of: 'step', installs: true, runs: true, hosts: 'every', says: '' },
  { name: 'notify', of: 'step', installs: true, runs: true, hosts: 'every', says: '' },
  { name: 'schedule', of: 'step', installs: true, runs: true, hosts: 'every', says: '' },
  { name: 'create', of: 'step', installs: true, runs: true, hosts: 'every', says: '' },
  { name: 'suggest', of: 'step', installs: true, runs: true, hosts: 'every', says: '' },
  { name: 'run', of: 'step', installs: true, runs: true, hosts: 'every', says: '' },
  { name: 'stop', of: 'step', installs: true, runs: true, hosts: 'every', says: '' },
];

/**
 * The row for one trigger, step or step key, or `undefined` for a name the table does not hold.
 *
 * `undefined` AND NOT A DEFAULT ROW, because a name missing here is a verb somebody added to the grammar and not to the
 * table, and a reader that assumed "installs and runs" for it would be the drift this file exists to end.
 */
export function capability(name: string): Capability | undefined {
  return CAPABILITIES.find((c) => c.name === name);
}

/** Whether a row serves a host, given whether that host answers Slash. */
export const serves = (c: Capability, answersSlash: boolean): boolean => c.hosts === 'every' || answersSlash;

/**
 * What does not install or does not run on a host, split as the grammar lists it: the triggers, then the steps, each in
 * the table's order. A row whose host this is not counts as one that does not install, since the lint refuses it there.
 */
export function notInThisBuild(answersSlash: boolean): { triggers: string[]; steps: string[] } {
  const out = { triggers: [] as string[], steps: [] as string[] };
  for (const c of CAPABILITIES) {
    if (c.installs && c.runs && serves(c, answersSlash)) continue;
    (c.of === 'trigger' ? out.triggers : out.steps).push(c.name);
  }
  return out;
}

/**
 * `--json`: the machine-readable half of every command, decided once.
 *
 * ONE DOCUMENT ON STDOUT AND EVERY OTHER LINE ON STDERR (`docs/48-SPEC-CLI.md` §4.5). That is the
 * whole contract, and it is the reason this is a wrapper around `AgentIo` rather than a branch in
 * each command: the split between `out` and `say` is already load-bearing everywhere in this app, so
 * the flag only has to change where `out` goes. Nothing in a command body asks whether the flag was
 * given.
 *
 * `--json` IS TAKEN OUT OF THE ARGUMENTS BEFORE A COMMAND EVER SEES IT. Every command parses with
 * `parseArgs({ strict: true })`, so the alternative was adding a `json` option to all
 * twenty-eight `parseArgs` calls in `apps/cli/src` and remembering it in the twenty-ninth. Removing
 * it in `main.ts` is the same behaviour with one site, and a command's own option list stays the
 * list of options that command actually has.
 *
 * THE VALUE IS THE READABLE ANSWER UNTIL A COMMAND HAS A REPLY TYPE WRITTEN DOWN, and that is not a
 * shrug. §4.5's first measurement is that §4.2 gives a `value` shape to nine commands and to no
 * other, so for the rest there is no specified object to print. There were 53 `io.out` call sites
 * when this was written, which matches §4.5's own count exactly. Inventing 53 ad-hoc shapes here
 * would publish a surface nobody had agreed and that the specification would then have to follow.
 * So the default `value` is `{ lines }`, the exact lines the command would have printed, and a
 * command whose answer has a real shape hands one over with `io.answer`. What a caller branches on
 * is the envelope: `ok`, the refusal codes, and the exit code, and those are right for every
 * command from the first day.
 *
 * NO TOKEN IS EVER IN THIS DOCUMENT. It carries only lines a command already wrote to stdout,
 * sentences it already wrote to stderr, refusals a host sent, and values a command handed over by
 * name. Not one of those four is a place a bearer lives: the bearer is read in `http.ts` and leaves
 * only as `Authorization`. `test/json.test.ts` asserts the whole document against a fake bearer for
 * the paths that could plausibly carry one.
 */

import { conflicted, refused, fixOf as sentenceOf, type Conflict, type Refusal, type Result } from '@braindog/ports';

/** `docs/48-SPEC-CLI.md` §4.5. The four answers, and there is no fifth. */
export type Out<T> =
  | { ok: true; value: T; version?: number }
  | { ok: false; refusals: Refusal[] }
  | { ok: false; conflict: Conflict }
  | { ok: false; error: { message: string; cause?: string } };

/** The machine-readable half of one answer: a value on success, or what the host refused with. */
export type Answer = { value?: unknown; refusal?: Refusal; conflict?: Conflict };

/**
 * Where a command hands over the machine-readable half of its answer.
 *
 * OPTIONAL ON PURPOSE. In human mode there is nobody to hand it to, and a command that never calls
 * it still gets a correct envelope from its exit code and its lines.
 */
export type Answering = (a: Answer) => void;

/** Everything `refuse` needs, so it can be called with an `AgentIo`, a `LoginIo` or a `LogoutIo` alike. */
export type Saying = { say: (line: string) => void; answer?: Answering | undefined };

/**
 * A not-ok answer, said to a person and recorded for a machine, and the exit code it earns.
 *
 * ONE HELPER RATHER THAN A PAIR OF LINES AT EACH SITE, because the pair is what goes wrong: a site
 * that says the sentence and forgets the record leaves a caller reading JSON with a message and no
 * code, which is the prose-scraping this flag exists to end.
 *
 * THE CODE IS `docs/48-SPEC-CLI.md` §4.4: 3 when the host never answered, 2 for a conflict, 1 for
 * everything the host refused. A caller may still return its own code where this command's exit
 * code was decided before this helper existed.
 */
export function refuse(io: Saying, r: Result<unknown>, sentence: string = sentenceOf(r)): number {
  io.say(sentence);
  if (refused(r)) io.answer?.({ refusal: r.refusal });
  else if (conflicted(r)) io.answer?.({ conflict: r.conflict });
  if (conflicted(r)) return 2;
  return refused(r) && r.refusal.code === 'UNREACHABLE' ? 3 : 1;
}

/**
 * `--json`, removed from the arguments and answered as a boolean.
 *
 * ONLY BEFORE A `--`. `keys exec` and `run` hand everything after the separator to a child process,
 * and a child of this command is perfectly entitled to its own `--json`. Those two take no envelope
 * of their own in any case (§4.5: their stdout belongs to the child), but the rule is applied here
 * so no later command can acquire the bug by being added to the list.
 */
export function takeJson(args: string[]): { rest: string[]; json: boolean } {
  let json = false;
  const rest: string[] = [];
  for (const [i, arg] of args.entries()) {
    if (arg === '--') {
      rest.push(...args.slice(i));
      break;
    }
    if (arg === '--json') json = true;
    else rest.push(arg);
  }
  return { rest, json };
}

export type Machine = {
  /** Replaces `io.out`: the readable answer is kept rather than printed, because stdout is the document. */
  out: (line: string) => void;
  /** Wraps `io.say`: the line still goes to stderr, and is kept in case the command ends without a refusal. */
  say: (line: string) => void;
  answer: Answering;
  /** The one document, for the exit code the command decided. */
  envelope: (code: number) => Out<unknown>;
};

/**
 * The sinks a command writes into under `--json`, and the document they add up to.
 *
 * AN UNREACHABLE HOST IS THE `error` VARIANT, NOT A REFUSAL, even though `@braindog/client` hands it
 * over wearing a refusal's shape. `UNREACHABLE` is synthesised on this machine when a fetch fails;
 * §4.4 gives it exit 3 and §4.5 gives exit 3 to `error`, and a caller that retried it as a refusal
 * would be retrying a sentence the host never said. §13 D11 is the same rule for a local failure:
 * a sentence and no invented code.
 */
export function machine(say: (line: string) => void): Machine {
  const lines: string[] = [];
  const said: string[] = [];
  const refusals: Refusal[] = [];
  let conflict: Conflict | undefined;
  let value: unknown;
  let held = false;

  return {
    out: (line) => void lines.push(line),
    say: (line) => {
      say(line);
      said.push(line);
    },
    answer: (a) => {
      if (a.refusal) refusals.push(a.refusal);
      if (a.conflict) conflict = a.conflict;
      if ('value' in a) {
        value = a.value;
        held = true;
      }
    },
    envelope: (code) => {
      if (code === 0) return { ok: true, value: held ? value : { lines } };
      if (conflict) return { ok: false, conflict };
      const sent = refusals.filter((r) => r.code !== 'UNREACHABLE');
      if (sent.length > 0) return { ok: false, refusals: sent };
      /* The sentences it printed, in order, because a local failure has no code to carry (§13 D11). */
      const message = said.join(' ') || 'The command did not finish, and said nothing about why.';
      return { ok: false, error: { message, ...(code === 3 ? { cause: 'unreachable' } : {}) } };
    },
  };
}

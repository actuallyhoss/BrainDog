/**
 * `braindog context`: the briefing on demand, for a session that has lost
 * it, an agent with no hooks, or a person at a shell.
 *
 * ONE RENDERER, NOT TWO. The start hook and this command print the same lines, from `briefingOf` in
 * `brief.ts`, under the same forty-line and three-thousand-character caps.
 *
 * IT IS A READ, AND IT OPENS NO RUN (`packages/record/src/index.ts:2810-2812`). Nothing here started and
 * nothing here resumed, so its first line carries no event word: it names the run the record already knows this
 * folder by, or says there is none yet.
 *
 * NO TOKEN IS EVER PRINTED. The bearer leaves only as `Authorization`, through `clientFor`, and every sentence
 * below is either fixed text or a host's refusal, which never carries one.
 */

import { parseArgs } from 'node:util';

import { briefingOf, placeOf, repoOf } from './brief.ts';
import { clip } from './clip.ts';
import { movedSince } from './hooks.ts';
import { positionOf } from './position.ts';
import { connect, type AgentIo } from './skills.ts';

const USAGE = 'braindog context takes --host and nothing else.';

/**
 * The first line of this command's briefing: the run this folder is, where it stands, and its project.
 *
 * A folder the record knows no run in gets the one step that opens one, rather than an empty briefing.
 */
export function headline(session: { spoken: string; state: string | null } | null, at: { repo: string | null; host: string }, place: string): string {
  const where = `${repoOf(at)} on ${at.host}`;
  if (session === null) return `BrainDog: no run in ${where} yet. Run braindog install, then start a session in this folder. ${place}`;
  const state = session.state === null ? '' : `, ${clip(session.state, 40)}`;
  return `BrainDog: ${clip(session.spoken, 40)} in ${where}${state}. ${place}`;
}

/** `braindog context [--host <host>]`, and the exit code: 0 printed, 1 refused or a local error, 3 unreachable. */
export async function context(args: string[], io: AgentIo): Promise<number> {
  let host: string | undefined;
  try {
    ({
      values: { host },
    } = parseArgs({ args, strict: true, options: { host: { type: 'string' } } }));
  } catch {
    /* Never an echo of what was typed: a token pasted in the wrong place must not come back out. */
    io.say(USAGE);
    return 1;
  }

  const at = await connect(host, io);
  if (typeof at === 'number') return at;

  const here = await positionOf(io.cwd);
  const head = headline(at.context.session, here, placeOf(at.context));
  const moved = await movedSince(io.cwd, at.context.handoff?.head ?? null, here.head);
  for (const line of briefingOf(head, at.context, moved).split('\n')) io.out(line);
  return 0;
}

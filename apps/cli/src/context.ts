/**
 * `braindog context`: the card on demand, for a session that has lost
 * it, an agent with no hooks, or a person at a shell.
 *
 * ONE RENDERER, NOT TWO. The start hook and this command print the same card, from `briefingOf` in `brief.ts`, under
 * the same 1,500 characters, or the record's own card when its context carries one.
 *
 * IT IS A READ, AND IT OPENS NO RUN (`packages/record/src/index.ts:2810-2812`). Nothing here started and
 * nothing here resumed, so its first line carries no event word: it names the caller's run, or says there is none yet.
 * When a question waits, a second read says whose it is and how many wait in all (`whoDecides`), and that opens none
 * either.
 *
 * A RUN THAT HAS ENDED IS NOT WHERE THE CALLER STARTS. The folder remembers the last session started in it, which may
 * be another session's or one long finished (`ownRun` in `hooks.ts`). When the run it remembered comes back neither
 * active nor idle, the context is asked again without it, so the card names where the caller really stands and that
 * run's own next step can be the one it is handed.
 *
 * NO TOKEN IS EVER PRINTED. The bearer leaves only as `Authorization`, through `clientFor`, and every sentence
 * below is either fixed text or a host's refusal, which never carries one.
 */

import { parseArgs } from 'node:util';

import { briefingOf, cardOf, firstLine, fitLines, live, placeOf, type Where } from './brief.ts';
import { clip } from './clip.ts';
import { aheadCard, asCaller, asksWaiting, deviceName, movedSince, whoDecides, withoutRun } from './hooks.ts';
import { budgetOf, clientFor } from './http.ts';
import { aheadHeader, hostSessionOf, positionOf } from './position.ts';
import { connect, type AgentIo } from './skills.ts';

const USAGE = 'braindog context takes --host and nothing else.';

/**
 * The first line of this command's card: the caller's run, its project, and the app and machine it runs on.
 *
 * A RUN IS NAMED WITH ITS STATE ONLY WHEN THAT STATE HAS ENDED IT, which a caller that set the ended one aside never
 * sees. A folder the record knows no run in says so rather than naming one.
 */
export function headline(session: { spoken: string; state: string | null } | null, at: Where, place: string): string {
  const run = session === null ? 'no run here yet' : live(session.state) ? `run ${clip(session.spoken, 16)}` : `run ${clip(session.spoken, 16)}, ${clip(session.state ?? '', 40)}`;
  return firstLine(run, place, at);
}

/** Whether this process runs inside Claude Code, which its shell and its subagents say. */
const inClaudeCode = (env: AgentIo['env']): boolean => Boolean(env.CLAUDECODE) || hostSessionOf(env) !== null;

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

  const caller = asCaller(io);
  let asked: AgentIo = caller.io;
  let at = await connect(host, asked);
  if (typeof at === 'number') return at;
  const ran = at.context.session;
  if (caller.remembered() && ran !== null && !live(ran.state)) {
    asked = { ...io, headers: async (named) => withoutRun(await io.headers(named)) };
    const again = await connect(host, asked);
    if (typeof again === 'number') return again;
    at = again;
  }

  /* THE CARD THE START HOOK PRINTS, with the commits since the handoff: the record's is read once more with
     `x-braindog-ahead` when HEAD has moved (`aheadCard`), under the same headers as the read before it. */
  const here = await positionOf(io.cwd);
  const moved = await movedSince(io.cwd, at.context.handoff?.head ?? null, here.head);
  const to = at.to;
  const ahead = aheadHeader(moved);
  const c =
    (await aheadCard(at.context, moved, async () => {
      const headers = await asked.headers(to.key);
      return clientFor(to, async () => (ahead === undefined ? headers : { ...headers, 'x-braindog-ahead': ahead }), AbortSignal.timeout(budgetOf(io.env))).context();
    })) ?? at.context;
  /* A person at a terminal cannot make a tool call, so the shell says the command; the hook's card keeps the tool's words. */
  const record = cardOf(c)?.map((l) => l.replace(/^(More\s+)call context for the full picture$/u, '$1braindog context --json')) ?? null;
  const [device, decides] = await Promise.all([record === null ? (io.device ?? deviceName(io.env, at.to.key)) : '', asksWaiting(c) ? whoDecides(at.client) : null]);
  const claude = inClaudeCode(io.env);
  let text: string;
  if (record !== null) text = fitLines(record);
  else {
    const where: Where = { repo: here.repo, host: here.host, device, agent: claude ? 'Claude Code' : null };
    text = briefingOf(headline(c.session, where, placeOf(c)), c, moved, { agent: claude ? 'claude' : null, ...decides });
  }
  for (const line of text.split('\n')) io.out(line);
  return 0;
}

/**
 * The oldest `braindog` command this door still works with, as the day of its build: `YYYY.MM.DD`.
 *
 * A DAY AND NOT A WHOLE BUILD. A build is `YYYY.MM.DD+<hash>` (`apps/cli/scripts/bundle.mjs`, `TUPLE`), and the day orders
 * two builds where the hash does not. So a command from a day before this one is behind; one built the same day is not,
 * whatever its commit, and `braindog update` still replaces it by comparing the published build exactly.
 *
 * EACH HOST ANSWERS IT AT ITS BUILD ADDRESS, `{ app, min_cli }` (`/.well-known/braindog-build`), with no credential, so
 * the command can read it at the start of a session and say in one line that it is older than this host needs; and
 * `doorHealth` counts a machine whose last build is older as `behind`.
 *
 * MOVE IT BY HAND, AND RARELY: only on the day a change lands that an older command cannot work with (a protocol revision
 * the command answers itself, a header the door starts to need, a hook script's new shape), and to that change's own day.
 * Never to today because today is a release: every machine would read behind at once and the sign would mean nothing.
 *
 * 2026.10.07 IS THE PROTOCOL FIX (`5a57ba29`): a command built before it serves the newest revision without a field that
 * revision needs, and Claude Code connects, reads the instructions and drops every tool.
 */
export const MIN_CLI = '2026.10.07';

/** The day of a build tuple (`2026.10.07+1a2b3c4`), or `null` for anything that is not one. */
export function buildDay(build: string | null | undefined): string | null {
  const day = /^(\d{4}\.\d{2}\.\d{2})\+[0-9a-f]{7,40}$/.exec(build ?? '');
  return day?.[1] ?? null;
}

/** Whether a command's build is from a day before `MIN_CLI`. A value that is not a build is not called behind. */
export const behind = (build: string | null | undefined, min = MIN_CLI): boolean => {
  const day = buildDay(build);
  return day !== null && day < min;
};

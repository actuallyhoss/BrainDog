/**
 * The computer this browser is on, as far as the one line that installs `braindog` needs to know it.
 *
 * PURE, SO `node --test` CAN IMPORT IT. The browser's `navigator` is handed in rather than read here, so
 * whatever calls this decides what it is looking at, and a test hands in a plain object.
 *
 * TWO ANSWERS, BECAUSE THERE ARE TWO INSTALLERS. `apps/site/static/cli/` publishes `install.ps1` for
 * Windows and `install.sh` for macOS and Linux (`loop/finish/agents.md` C10), and those are the only
 * lines there are to choose between. A phone is read as the second: nobody runs Claude Code on one, and
 * the person setting a computer up from their phone can switch to the other line with one press.
 */

/** Which installer: PowerShell's, or the shell script macOS and Linux both run. */
export type Os = 'windows' | 'unix';

/** Both, in the order the switch between them draws them. */
export const OSES: readonly Os[] = ['windows', 'unix'];

/**
 * The line that puts `braindog` on this computer, per installer.
 *
 * ALWAYS `brain.dog`, WHICHEVER HOST THE APP IS ON. The command is published by the site's deploy and
 * nowhere else (`loop/finish/agents.md` C10), and it is the same command for the Cloud and for a
 * self-host: `braindog setup` is handed the record's own address, which is where the host is named.
 */
export const INSTALL_LINES: Readonly<Record<Os, string>> = {
  windows: 'irm https://brain.dog/cli/install.ps1 | iex',
  unix: 'curl -fsSL https://brain.dog/cli/install.sh | sh',
};

/**
 * The installer for the computer a browser says it is on.
 *
 * `platform` FIRST AND THE USER AGENT AFTER. Both are only what the browser chooses to say, and a browser
 * that trims one usually keeps the other; either naming Windows is enough. Anything else, a browser that
 * says nothing included, is the shell script, which is the line for every other computer.
 */
export function osOf(nav: { platform?: string | undefined; userAgent?: string | undefined } | undefined): Os {
  const said = `${nav?.platform ?? ''} ${nav?.userAgent ?? ''}`;
  return /\bwin/iu.test(said) ? 'windows' : 'unix';
}

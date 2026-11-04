/**
 * THE APPROVE PAGE'S WORDS AND CELLS, pure, for `routes/connect/approve` and `CodeForm.svelte`: who is asking, said as
 * the command that was run on the machine it was run on, what it may do, and the six boxes the digits are drawn in.
 *
 * WHO IS ASKING IS READ OFF THE LABEL THE CLI SENT, because that is all a grant carries. The CLI writes
 * `<machine> · braindog-cli` for a sign-in, `<machine> · braindog-cli · export` for one operation, and
 * `<machine> · Claude Code · token` when setup makes an agent its key (`apps/cli/src/login.ts`, `setup.ts`). An agent's
 * name is said as itself; `braindog-cli` is said as the command its reach comes from. A label written some other way is
 * said as it was written, and a grant with none is a machine with no name. The machine is said as a person says it
 * (`machineSaid`): "MacBook Pro 16", never `harbour-macbook-pro-16-m4-max`.
 */
import { copy } from '../copy.ts';
import { CODE_DIGITS, normalise, reachKey, type DeviceRow } from '../record/device.ts';
import { machineSaid } from '../record/machine-name.ts';

/** The command a reach comes from, as he typed it. */
export const COMMANDS: Readonly<Record<DeviceRow['reach'], string>> = {
  login: 'braindog login',
  vault: 'braindog login',
  runner: 'braindog runner',
  export: 'braindog export',
  shape: 'braindog export',
  import: 'braindog import',
  pack: 'braindog pack',
  token: 'braindog token',
};

/** The CLI's own name in a label: said as the command, never as itself. */
const CLI = 'braindog-cli';

/** What the label's ` · ` parts say: the machine, and the agent where one was named. */
function partsOfLabel(label: string | null): { machine: string | null; agent: string | null; whole: string | null } {
  const whole = label === null || label.trim() === '' ? null : label.trim();
  if (whole === null) return { machine: null, agent: null, whole };
  const parts = whole.split(' · ').map((p) => p.trim()).filter((p) => p !== '');
  if (parts.length < 2) return { machine: null, agent: null, whole };
  const second = parts[1] ?? '';
  return { machine: parts[0] ?? null, agent: second === CLI ? null : second, whole };
}

/**
 * Who is asking, in one line: "braindog export on MacBook Pro", "Claude Code on MacBook Pro", or the label as written.
 */
export function askerOf(label: string | null, reach: DeviceRow['reach']): string {
  const { machine, agent, whole } = partsOfLabel(label);
  if (machine === null) return whole ?? copy.unnamedMachine;
  return copy.askerOn(agent ?? COMMANDS[reach] ?? CLI, machineSaid(machine));
}

/** What a grant may do, as a sentence starting with a capital: "Take one copy of your BrainDog, once, ...". */
export function canOf(reach: DeviceRow['reach'], scope: string | null): string {
  const means = copy.reachMeans[reachKey(reach, scope)] ?? reach;
  const said = `${means.charAt(0).toUpperCase()}${means.slice(1)}.`;
  /* A GRANT BOUND TO ONE REQUEST (`binds`, kept as `body:<sha256>`) says the print the terminal shows beside the code,
     so the person can see this is that request and not another asking under the same word. */
  const bound = scope !== null && /^body:[0-9a-f]{64}$/u.test(scope) ? scope.slice('body:'.length) : null;
  return bound === null ? said : `${said} ${copy.requestPrint(`${bound.slice(0, 4)} ${bound.slice(4, 8)}`)}`;
}

/** Minutes left on a waiting grant, rounded up, from the record's clock. */
export const minutesLeft = (expires: string, nowMs: number): number => Math.max(0, Math.ceil((Date.parse(expires) - nowMs) / 60_000));

/**
 * THE SIX BOXES, from what the field holds: each box's digit or `''`. Only the digits are drawn; the field itself
 * holds whatever was typed, so a refusal is said about what was typed and never about a code it was trimmed to.
 */
export function cellsOf(typed: string): string[] {
  const digits = normalise(typed);
  const shown = /^\d*$/u.test(digits) ? digits.slice(0, CODE_DIGITS) : '';
  return Array.from({ length: CODE_DIGITS }, (_, i) => shown[i] ?? '');
}

/**
 * WHAT A KEYSTROKE OR A PASTE LEAVES IN THE FIELD, and whether it completes a code to send.
 *
 * A VALUE THE SIX BOXES CANNOT HOLD IS REFUSED OUT LOUD AND NOT TAKEN: seven digits, or a letter, keeps what the field
 * held before and says why, so nothing is ever trimmed into a different code. Six digits reached from fewer is sent at
 * once; the same six held again (a refusal kept them) waits for the press.
 */
export function enteredOf(before: string, value: string): { typed: string; refused: boolean; send: boolean } {
  const digits = normalise(value);
  if (!/^\d*$/u.test(digits) || digits.length > CODE_DIGITS) return { typed: before, refused: true, send: false };
  const was = normalise(before);
  return { typed: digits, refused: false, send: digits.length === CODE_DIGITS && digits !== was };
}

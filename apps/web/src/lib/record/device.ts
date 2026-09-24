/**
 * `/settings/agents`, the address every device code points at: what the screen decides, with no runes.
 *
 * PURE, SO `node --test` CAN IMPORT IT. A `.svelte.ts` file needs the compiler, and the parts with
 * consequences are here: what counts as a code and what each answer from `deviceApprove` means to the
 * person.
 *
 * THE RECORD'S SHAPE AND NOTHING ELSE. The kernel names a grant by a handle and never by its poll id,
 * and five wrong codes leave rows `denied`. The screen draws `listDevices` and `listTokens` as they
 * come back. It also drew the sample's machines and keys, converted into those rows, until the sample
 * went on 25 September (DIRECTION 26).
 *
 * NO APPROVAL IS SIMULATED. The kernel owns the arithmetic of a wrong guess and tests it.
 */

import type { DeviceApproved, DeviceRow } from '@braindog/client';

import { BASE, slugOf } from '../at.ts';

export type { DeviceRow };

/** Six digits is a million, which is only safe beside five tries and ten minutes (`12 §6.1`). */
export const CODE_DIGITS = 6;

/** `listTokens`, as `TokenRow` in `@braindog/kernel` has it. Never the bearer. */
export type TokenRow = {
  id: string;
  person_id: string;
  scope: 'read' | 'propose' | 'write';
  label: string | null;
  created_at: string;
  last_used_at: string | null;
  last_surface: string | null;
  expires_at: string | null;
  revoked_at: string | null;
};

/**
 * A report key, as a person reads one: what its owner named it and the list it sends numbers to, or `null` for any
 * other token.
 *
 * ITS LABEL IS ITS BINDING, `report:{"register":...}` (`packages/record/src/report.ts`), because a label is fixed for a
 * token's life. Printed as it is, the settings list showed JSON where a name goes and "can read and change rows"
 * beside a key that can do neither.
 */
export function reportKeyOf(label: string | null): { name: string | null; register: string } | null {
  if (label === null || !label.startsWith('report:')) return null;
  try {
    const said = JSON.parse(label.slice('report:'.length)) as { register?: unknown; name?: unknown };
    return {
      name: typeof said.name === 'string' && said.name.trim() !== '' ? said.name : null,
      register: typeof said.register === 'string' ? said.register : '',
    };
  } catch {
    return { name: null, register: '' };
  }
}

/** `createToken`: the only copy of the bearer there will ever be. */
export type Minted = { id: string; bearer: string; scope: string; expires_at: string };

/** A refusal as the client hands one back, and only the keys read here. */
export type Refusal = { code: string; fix: string };

/**
 * The separators a code is printed with, gone, and nothing else.
 *
 * The CLI prints the code in two groups, so a paste carries a space, and a terminal or chat client may
 * have made it a non-breaking one. Anything else stays and is refused: an entry that reaches the record
 * spends a try on every waiting machine, so a paste that dragged a word along must not be sent.
 */
export const normalise = (typed: string): string => typed.replace(/[\s  -​_.‐-―-]+/gu, '');

/** What the field holds: a code to send, or which of three mistakes it is. Nothing malformed is sent. */
export type Entry =
  | { ok: true; code: string }
  | { ok: false; why: 'empty' | 'short' | 'long' | 'other'; digits: number };

export function codeOf(typed: string): Entry {
  const code = normalise(typed);
  if (/^\d+$/u.test(code) && code.length === CODE_DIGITS) return { ok: true, code };
  if (code === '') return { ok: false, why: 'empty', digits: 0 };
  if (!/^\d+$/u.test(code)) return { ok: false, why: 'other', digits: 0 };
  /* Seven digits is refused rather than trimmed: trimming would approve whichever machine the first
     six happen to match. */
  return { ok: false, why: code.length < CODE_DIGITS ? 'short' : 'long', digits: code.length };
}

/**
 * What the screen says after a press.
 *
 * `signin` IS ITS OWN KIND because it is the one refusal with a way forward on this screen: a sign-in
 * older than fifteen minutes cannot approve, and neither can no sign-in at all, and signing in is the fix
 * for both. `refused` carries the record's own sentence for anything else, a host that could not be
 * reached included. There is no `demo` kind: with no sample there is no screen a stranger approves on.
 */
export type Answer =
  | { kind: 'approved'; label: string | null; reach: DeviceRow['reach']; scope: string | null }
  | { kind: 'malformed'; why: 'empty' | 'short' | 'long' | 'other'; digits: number }
  | { kind: 'wrong' }
  | { kind: 'tries' }
  | { kind: 'expired' }
  | { kind: 'signin' }
  | { kind: 'refused'; fix: string };

export function answerOf(out: { ok: true; value: DeviceApproved } | { ok: false; refusal: Refusal }): Answer {
  if (out.ok) return { kind: 'approved', label: out.value.label, reach: out.value.reach, scope: out.value.scope };
  switch (out.refusal.code) {
    /* The kernel answers a code that matches nothing with FORBIDDEN, and says no more on purpose. */
    case 'FORBIDDEN':
      return { kind: 'wrong' };
    case 'DEVICE_CODE_TRIES':
      return { kind: 'tries' };
    case 'DEVICE_CODE_EXPIRED':
      return { kind: 'expired' };
    case 'NEEDS_BROWSER_SESSION':
      return { kind: 'signin' };
    /* The field refuses these first; a record that disagrees about the shape is still a shape mistake. */
    case 'VALUE_MALFORMED':
      return { kind: 'malformed', why: 'other', digits: 0 };
    default:
      return { kind: 'refused', fix: out.refusal.fix };
  }
}

/**
 * The key a reach's sentence is filed under. A vault grant's life depends on its scope: `*` is the
 * keys of no project and lasts seven days, one project lasts thirty.
 */
export const reachKey = (reach: DeviceRow['reach'], scope: string | null): string =>
  reach === 'vault' ? (scope === '*' ? 'vaultAll' : 'vault') : reach;

/** The rows a revoke still changes. A finished row keeps saying what it said, so it has no button. */
export const revocable = (row: DeviceRow): boolean => row.status === 'pending' || row.status === 'approved' || row.status === 'active';

/** Tokens still working. A revoked one can do nothing, so it is not something to look after. */
export const standing = (rows: readonly TokenRow[]): TokenRow[] => rows.filter((t) => t.revoked_at === null);

/**
 * The two refusals that meant there was no record here to read, as `lib/data/record.ts` decides it: a
 * static host's SPA fallback, or a Worker with no record behind it. Screens drew the sample on it.
 *
 * NEVER UNDER A SLUG. `/app/acme/…` names a record, so a 401 there is a person who must sign in and an unreachable host
 * is a host that did not answer (`research-one-domain.md` §2.4).
 *
 * KEPT ONLY WHILE SOMETHING STILL CALLS IT. The sample is going screen by screen (`loop/research-no-sample.md`), and
 * other shipped files still asked this on 25 September; wave C deletes it with the last of them.
 */
export const noRecord = (code: string, pathname: string = globalThis.location?.pathname ?? ''): boolean =>
  (code === 'UNREACHABLE' || code === 'UNAUTHORIZED') && slugOf(pathname) === null;

/**
 * The two lines a person copies after connecting an agent. NEITHER CARRIES THE BEARER: `braindog login`
 * starts its own device flow, and the MCP registration reads its bearer from the hosts file or
 * `BRAINDOG_TOKEN`, so no token lands in a shell history or in Claude Code's config (`48 §2`).
 *
 * THE LOGIN LINE NAMES THE RECORD when the screen knows it. The Cloud device flow is refused without a slug, and the line
 * printed the bare origin, so the one command this screen exists to hand over did not work where most people would paste it.
 */
export function connectLines(origin: string, slug?: string | null): { login: string; mcp: string } {
  const server = { type: 'stdio', command: 'braindog', args: ['mcp', '--agent', 'claude'] };
  return {
    login: `braindog login ${slug ? `${origin}${BASE}/${slug}` : origin}`,
    mcp: `claude mcp add-json braindog '${JSON.stringify(server)}' --scope user`,
  };
}

/** How long a token minted from this screen lasts, as `createToken` is asked for it. */
export const TOKEN_DAYS = 90;

/** The label `deviceStart` allows, and the one this screen asks for when minting. */
export const LABEL_MAX = 120;

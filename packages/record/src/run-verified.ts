/**
 * WHETHER A RUN IS THE APP IT SAYS IT IS. A run names its own app (`agent`, `client`), and nothing checked it, so any key could
 * call itself Claude Code. Two things prove it, and only they mark a run verified:
 *
 *   - ITS KEY CAME BY A CLIENT ID DOCUMENT (`cimd`): the app served the document naming it from its own host, which the
 *     door checked at sign-in (`connect/proven.ts` says "BrainDog checked that this app is claude.ai").
 *   - ITS KEY WAS MADE FOR THAT APP: `braindog setup` makes one key per agent, approved by the owner in the app with six
 *     digits, labelled "<machine> · Claude Code" (`AGENT_TITLE` in `apps/cli/src/setup.ts`), and the run says the same app.
 *
 * A machine's own login ("MacBook · braindog-cli"), a key typed by hand, or an app that registered itself (`dcr`) proves
 * nothing, so its runs read without the mark.
 */

import { agentName, machineOf } from './card.ts';

/** The app a run's own client name says, before its agent kind: `agent` is a kind of four and `claude` is two apps. */
const CLIENT_APPS: readonly (readonly [RegExp, string])[] = [
  [/^claude[\s._-]*code/u, 'Claude Code'],
  [/^(?:claude|anthropic)/u, 'Claude'],
  [/^(?:openai[\s._-]*)?codex/u, 'Codex'],
  [/^cursor/u, 'Cursor'],
];

/** The token a run spoke with, as the record lists it: its label and, when its host said so at minting, its client. */
export type RunToken = { label?: string | null; client?: { kind: string; host: string | null } } | null;

/** The app a run says it is, by name, or `null` when it says none. */
export function appOfRun(fields: Readonly<Record<string, unknown>>): string | null {
  const client = typeof fields.client === 'string' ? fields.client.trim().toLowerCase() : '';
  return CLIENT_APPS.find(([name]) => client !== '' && name.test(client))?.[1] ?? agentName(fields.agent);
}

/** True when the run's key proves the app it says it is: a checked client document, or a key made for that app. */
export function verifiedBy(fields: Readonly<Record<string, unknown>>, token: RunToken): boolean {
  if (!token) return false;
  if (token.client?.kind === 'cimd' && typeof token.client.host === 'string' && token.client.host !== '') return true;
  const app = appOfRun(fields);
  const label = typeof token.label === 'string' ? token.label : '';
  if (app === null || !label.includes(' · ')) return false;
  return label.split(' · ').at(-1)!.trim() === app;
}

/**
 * A run as a person names it, with the mark where its key proves it: "Claude Code · MacBook · verified",
 * "Claude · claude.ai · verified", "Claude Code · MacBook". The place is the machine, or the app's host for a run on none.
 */
export function runLabel(fields: Readonly<Record<string, unknown>>, token: RunToken): string {
  const app = appOfRun(fields) ?? 'An agent';
  const host = typeof fields.host === 'string' && fields.host.trim() !== '' ? machineOf(fields.host.trim()) : (token?.client?.kind === 'cimd' ? token.client.host : null);
  return [app, host, verifiedBy(fields, token) ? 'verified' : null].filter((x): x is string => typeof x === 'string' && x !== '').join(' · ');
}

/**
 * What the consent screen can say is proven about the app that asks, before the person allows it.
 *
 * THE DOOR KNOWS HOW THE APP CAME, AND THAT IS ALL IT KNOWS. An app whose client id is an `https:` address served the
 * document that names it from that host, so BrainDog checked the host; an app that registered here wrote its own name
 * and nothing about it was checked. The host answers which (`source` on `Consent` in `packages/host/src/oauth.ts`),
 * and this file says it in words, so the name the app chose for itself is never read as more than it is.
 */

import { markedOf, type MarkedAgent } from '@braindog/skin/agent-marks.ts';

/** How the app came to the door, and the host it is of: `null` for one answered on this computer. */
export type AppSource = { kind: 'cimd' | 'dcr'; host: string | null };

/** The line under the screen's sentence, and the tone it is drawn in: `good` when proven, `warn` when not. */
export type Proven = { text: string; tone: 'good' | 'warn' };

/** The host's `source` as it answered it, or `null` for anything that is not one. */
export function sourceFrom(x: unknown): AppSource | null {
  if (typeof x !== 'object' || x === null) return null;
  const s = x as { kind?: unknown; host?: unknown };
  if (s.kind !== 'cimd' && s.kind !== 'dcr') return null;
  return { kind: s.kind, host: typeof s.host === 'string' && s.host !== '' ? s.host : null };
}

/** What is proven about the app, or `null` when the host did not say how it came. */
export function provenLine(consent: { client_name: string; source?: AppSource | null }): Proven | null {
  const source = consent.source ?? null;
  if (source === null) return null;
  if (source.kind === 'dcr') return { text: 'This app named itself. BrainDog has not checked who made it.', tone: 'warn' };
  return { text: source.host === null ? 'BrainDog checked this app at its own address.' : `BrainDog checked that this app is ${source.host}.`, tone: 'good' };
}

/** The hosts each maker serves its apps' documents from, matched as the host or any name under it. */
const MAKER_HOSTS: Readonly<Record<MarkedAgent, readonly string[]>> = {
  claude: ['claude.ai', 'claude.com', 'anthropic.com'],
  codex: ['openai.com', 'chatgpt.com'],
  cursor: ['cursor.com', 'cursor.sh'],
  gemini: ['google.com'],
  copilot: ['github.com'],
  windsurf: ['windsurf.com', 'codeium.com'],
};

/**
 * The maker's mark the screen draws beside the app, or `null` for initials.
 *
 * ONLY WHERE THE MAKER VOUCHED FOR IT. The name is whatever the app chose (a registration here picks its own), so a mark
 * read off the name alone let any app wear Claude's beside "BrainDog checked". A mark is drawn for an app whose document
 * was read from that maker's own host, and every other app wears its initials.
 */
export function markFor(consent: { client_name: string; source?: AppSource | null }): MarkedAgent | null {
  const marked = markedOf(consent.client_name);
  const source = consent.source ?? null;
  if (marked === null || source === null || source.kind !== 'cimd' || source.host === null) return null;
  const host = source.host.toLowerCase();
  return MAKER_HOSTS[marked].some((d) => host === d || host.endsWith(`.${d}`)) ? marked : null;
}

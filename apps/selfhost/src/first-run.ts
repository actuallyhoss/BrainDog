/**
 * What a stranger's first start says: where to open, the one-time link that makes the owner's sign-in, and a plain line
 * for each hosted service this machine does without. None of it is an error, and none of it quotes a key.
 */

import type { Sql } from '@braindog/ports';

type Auth = (call: { flow: 'claim.mint'; email: string }) => Promise<{ status: number; mail?: { claimToken?: string } }>;

/** The link that spends once to sign the owner in; the app then offers a passkey. Valid a day, like every claim link. */
export const claimUrl = (origin: string, token: string): string => `${origin}/signin#claim=${token}`;

/**
 * The setup line, or null when there is nothing to set up: the owner already has a passkey, or sign-in is off (an open
 * loopback host needs no account). Minted again on each start until a passkey exists, so a lost terminal costs a restart.
 */
export async function setupLine(o: { dir: Sql; auth: Auth; origin: string; signInOff: string | null }): Promise<string | null> {
  if (o.signInOff === 'open') return `  open ${o.origin} on this machine; nobody signs in here.`;
  if (o.signInOff !== null) return null;
  if (o.dir.one('SELECT 1 AS x FROM dir_passkey LIMIT 1')) return null;
  const owner = o.dir.one<{ email: string }>('SELECT email FROM dir_person ORDER BY rowid LIMIT 1');
  if (!owner) return null;
  const made = await o.auth({ flow: 'claim.mint', email: owner.email });
  const token = made.mail?.claimToken;
  if (made.status !== 200 || !token) return null;
  return `  first time: open ${claimUrl(o.origin, token)} once (valid 24 hours) to sign in as ${owner.email} and add a passkey.`;
}

/** One plain line each for what is off here, from the environment as the host reads it. Mail is said by `smtpLine` when it is on. */
export function degradeLines(e: Record<string, string | undefined>, mailOn: boolean): string[] {
  const lines: string[] = [];
  const set = (n: string): boolean => (e[n] ?? '').trim() !== '';
  if (!mailOn) lines.push('  mail: off. Set BRAINDOG_SMTP_URL and BRAINDOG_MAIL_FROM to send sign-in links and notices; passkeys and the server key work without it.');
  const model = set('SLASH_FALLBACK_ENDPOINT') && set('SLASH_FALLBACK_MODEL') && set('SLASH_FALLBACK_KEY');
  lines.push(
    model
      ? '  model: this host has its own endpoint, and a key in the keychain is used first.'
      : '  model: off until you add your own key in the app (Settings, Keys). Everything else works without it.',
  );
  lines.push('  billing: off. A self-hosted BrainDog is free and counts nothing.');
  lines.push(set('TURNSTILE_SECRET') ? '  turnstile: on.' : '  turnstile: off. Sign-up is not open on a self-host, so nothing asks for it.');
  return lines;
}

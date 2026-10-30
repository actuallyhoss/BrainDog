/**
 * What a stranger's first start says: where to open, where the one-time link that makes the owner's sign-in is kept, and
 * a plain line for each hosted service this machine does without. None of it is an error, and none of it quotes a key
 * or a link.
 */

import { rmSync, writeFileSync } from 'node:fs';

import type { Sql } from '@braindog/ports';

type Auth = (call: { flow: 'claim.mint'; email: string }) => Promise<{ status: number; mail?: { claimToken?: string } }>;

/** The link that spends once to sign the owner in; the app then offers a passkey. Valid a day, like every claim link. */
export const claimUrl = (origin: string, token: string): string => `${origin}/signin#claim=${token}`;

/** Where the one-time link is kept and how the person reads it, and the terminal it may also be shown on. */
export type ClaimPlace = {
  /** `<data>/claim-link`: written at 0600 in the data folder, beside the key file, and removed once a passkey exists. */
  file: string;
  /** How the person reads that file from where they are, such as `docker compose exec braindog cat /data/claim-link`. */
  read: string;
  /** The attached terminal, when there is one and it is not a container's, whose output is its log. */
  tty?: ((line: string) => void) | undefined;
};

/**
 * The setup line, or null when there is nothing to set up: the owner already has a passkey, or sign-in is off (an open
 * loopback host needs no account). Minted again on each start until a passkey exists, so a lost link costs a restart.
 *
 * THE LINK IS NEVER IN THE LOG. It signs in as the owner, once, for a day, and it was printed whole to stdout, which in a
 * container is `docker compose logs` and whatever ships them: whoever read the log first could take the account. It is
 * written to a file only the server's user can read, and the line says where. A person at a real terminal also sees it
 * there, since nothing keeps what a terminal shows.
 */
export async function setupLine(o: { dir: Sql; auth: Auth; origin: string; signInOff: string | null } & ClaimPlace): Promise<string | null> {
  const gone = (): null => {
    rmSync(o.file, { force: true });
    return null;
  };
  if (o.signInOff === 'open') {
    rmSync(o.file, { force: true });
    return `  open ${o.origin} on this machine; nobody signs in here.`;
  }
  if (o.signInOff !== null) return gone();
  if (o.dir.one('SELECT 1 AS x FROM dir_passkey LIMIT 1')) return gone();
  const owner = o.dir.one<{ email: string }>('SELECT email FROM dir_person ORDER BY rowid LIMIT 1');
  if (!owner) return null;
  const made = await o.auth({ flow: 'claim.mint', email: owner.email });
  const token = made.mail?.claimToken;
  if (made.status !== 200 || !token) return null;
  const link = claimUrl(o.origin, token);
  if (o.tty) o.tty(`  first time: open ${link} once (valid 24 hours) to sign in as ${owner.email} and add a passkey.`);
  try {
    /* REMOVED AND MADE AGAIN rather than written over, so the mode is this one and not whatever an older file had. */
    rmSync(o.file, { force: true });
    writeFileSync(o.file, `${link}\n`, { mode: 0o600, flag: 'wx' });
  } catch (e) {
    const code = (e as { code?: string }).code ?? 'unknown';
    return o.tty
      ? `  first time: the link above is the way in; it could not also be kept in ${o.file} (${code}).`
      : `  first time: the one-time sign-in link for ${owner.email} could not be written to ${o.file} (${code}), and it is never put in the log. Make the data folder writable by the server and start it again.`;
  }
  return `  first time: a one-time sign-in link for ${owner.email} is in ${o.file} (it works once, for 24 hours). Read it with ${o.read}, open it, and add a passkey. A restart makes a new one until a passkey exists.`;
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

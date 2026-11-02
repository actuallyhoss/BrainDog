/**
 * WHETHER "WHAT SHOULD PEOPLE HERE CALL YOU?" IS ASKED (collab pass 3), said here so the shell can tell before the
 * banner's own code lands (nojump, 2 Nov): it held no room for it, so on a cold phone the banner came 150px tall a beat
 * after the page and pushed every screen down 162px. The shell now holds the banner's room while its code comes, and
 * only where it will draw.
 *
 * PURE: no rune, no `$lib`.
 */

/** The shell's fields the ask reads. */
export type NameAskShell = { refused?: unknown; stale?: unknown; me: { person: string; name?: string | null | undefined; prefs?: unknown } };

/** This device's skip, for a record too old to keep it. */
export const nameAskKey = (base: string): string => `bd_name_asked:${base}`;

function skippedHere(key: string): boolean {
  try {
    return globalThis.localStorage?.getItem(key) === '1';
  } catch {
    return false;
  }
}

/** Whether the ask is drawn for this person on this record. */
export function nameAskDue(shell: NameAskShell, base: string): boolean {
  const asked = (shell.me.prefs as Record<string, unknown> | undefined)?.['name.asked'] === true;
  return !shell.refused && !shell.stale && shell.me.person !== '' && !shell.me.name && !asked && !skippedHere(nameAskKey(base));
}

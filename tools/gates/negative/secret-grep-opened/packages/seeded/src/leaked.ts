/**
 * A keychain key opened for a scheduled action, logged when the send fails. It is called `key` here, which is on no
 * list; what makes it one is that it came from `openKey(`. The decoy is a sentence that says "opened", which is text.
 */
type Grant = { id: string; label: string };

export async function run(options: { openKey: (grant: Grant) => Promise<string | null> }, grant: Grant, url: string): Promise<void> {
  const key = await options.openKey(grant);
  if (key === null) {
    console.error(`The key "${grant.label}" was not opened, so nothing was sent.`);
    return;
  }
  console.error('send failed', { url, key });
}

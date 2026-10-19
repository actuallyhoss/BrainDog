/**
 * Who a session's recent commits were by, read from the `authors` hint (`Name <email>, Name <email>`). Pure: the
 * kernel meets each one as a person seen in that project's commits (`index.ts`). An author with no real address is
 * dropped, never given one.
 */

const ADDRESS = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/u;

/** The most authors one session can introduce, so a repository with a hundred contributors does not flood the people list. */
export const MOST_AUTHORS = 5;

export type CommitAuthor = { name?: string; email: string };

/** The authors a hint names, in order, each address once, lower-cased; bots and unreadable entries left out. */
export function commitAuthors(said: string | undefined): CommitAuthor[] {
  const out: CommitAuthor[] = [];
  /* The commits ride after the first ` || ` (`work-reads.ts`); only what comes before it is authors. */
  for (const part of (said ?? '').split(/\s*\|\|\s*/u)[0]!.split(',')) {
    const m = /^\s*(.*?)\s*<([^<>\s]+)>\s*$/u.exec(part);
    if (!m) continue;
    const email = m[2]!.toLowerCase();
    const name = m[1]!.trim();
    if (!ADDRESS.test(email) || /\[bot\]/iu.test(name) || /^(?:noreply|no-reply)@/iu.test(email)) continue;
    if (out.some((a) => a.email === email)) continue;
    out.push(name === '' ? { email } : { name, email });
    if (out.length === MOST_AUTHORS) break;
  }
  return out;
}

/**
 * What an agent says about its run, read off a request and checked.
 *
 * SEVEN HINTS, EACH WITH ITS GRAMMAR (`44 §4.2`). A value that
 * fails is dropped, never corrected and never refused: these are hints, and a call whose hint is
 * wrong is still a call the record answers. The kernel writes what reaches it into a row as given,
 * so this is the one place a stranger's text is held to a shape first.
 *
 * THE SAME CHECK FOR `_meta.session` OVER `/mcp`, where an HTTP client says in the body what the
 * command line says in headers. Both hosts call these, so a hint means the same on either.
 */

/** Each key a field of the kernel's `session` register, but `spoken`, which names the run itself. */
export type SessionHints = {
  spoken?: string | undefined;
  client_id?: string | undefined;
  host?: string | undefined;
  repo?: string | undefined;
  remote?: string | undefined;
  cwd?: string | undefined;
  agent?: string | undefined;
};

type Key = keyof SessionHints;

/* Printable ASCII only: a header value outside Latin-1 cannot be sent, and a control character in a
   folder name has no business in a row somebody reads. */
const printable = (max: number): RegExp => new RegExp(`^[\x20-\x7e]{1,${max}}$`);

/** Each hint, the header that carries it, and the shape it must have. */
export const HINTS: Readonly<Record<Key, { header: string; grammar: RegExp }>> = {
  spoken: { header: 'x-braindog-session', grammar: /^S[1-9][0-9]*$/ },
  client_id: { header: 'x-braindog-client', grammar: /^[A-Za-z0-9._:-]{1,128}$/ },
  host: { header: 'x-braindog-host', grammar: /^[A-Za-z0-9._-]{1,128}$/ },
  /* A name and never a path (`26 §5`), so never `..`. */
  repo: { header: 'x-braindog-repo', grammar: /^(?!.*\.\.)[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/ },
  remote: { header: 'x-braindog-remote', grammar: printable(256) },
  cwd: { header: 'x-braindog-cwd', grammar: printable(512) },
  /* The `agent` field's four values. Anything else would refuse the run the ladder opens. */
  agent: { header: 'x-braindog-agent', grammar: /^(?:claude|codex|cursor|other)$/ },
};

const KEYS = Object.keys(HINTS) as Key[];

/**
 * A REMOTE LOSES ITS USERINFO before it is checked. `https://name:password@host/repo.git` is how a
 * token rides in a git remote, and the kernel refuses a credential-shaped value in any text it stores,
 * so the run would not open and the write would go in unattributed. Nothing the ladder or the scope
 * resolver reads is in the userinfo: `resolveProject` drops it anyway.
 */
const TIDY: Partial<Record<Key, (value: string) => string>> = {
  remote: (value) => value.replace(/^([A-Za-z][A-Za-z0-9+.-]*:\/\/)[^/@]*@/, '$1'),
};
const tidy = (key: Key, value: string): string => TIDY[key]?.(value) ?? value;

/** The hints a request's headers carry, each checked. */
export function sessionOf(headers: Headers): SessionHints {
  const out: SessionHints = {};
  for (const key of KEYS) {
    const sent = headers.get(HINTS[key].header);
    const value = sent === null ? null : tidy(key, sent);
    if (value !== null && HINTS[key].grammar.test(value)) out[key] = value;
  }
  return out;
}

/**
 * The hints an object carries, each checked: `params._meta.session` over `/mcp`.
 *
 * `Object.hasOwn`, because every key here is the caller's, and `__proto__` must not read as a hint.
 */
export function hintsOf(said: unknown): SessionHints {
  const out: SessionHints = {};
  if (typeof said !== 'object' || said === null || Array.isArray(said)) return out;
  for (const key of KEYS) {
    const raw = Object.hasOwn(said, key) ? (said as Record<string, unknown>)[key] : undefined;
    const value = typeof raw === 'string' ? tidy(key, raw) : raw;
    if (typeof value === 'string' && HINTS[key].grammar.test(value)) out[key] = value;
  }
  return out;
}

/**
 * A context carrying these hints over the ones it had, key by key. With none, the context as it was.
 *
 * EVERY PRINCIPAL CARRIES THEM, and the record decides whose they are: a token's write runs the ladder
 * with them, and a person's ignores them, which is how a browser is never a run.
 */
export function withSession<C extends { session?: SessionHints | undefined }>(ctx: C, hints: SessionHints): C {
  if (Object.keys(hints).length === 0) return ctx;
  return { ...ctx, session: { ...ctx.session, ...hints } };
}

/* A fixture. The registry, the envelope, and the one line that reads a code off an envelope.
   The three checks a `derived:` fixture faces all resolve here, and all three pass: `clash` is
   exported once, and the code is named on a line that is more than a list of codes. Only the
   claim about the raising file is false, so the count is one. */
const WRITE = [
  'ROW_LOCKED', 'HUMAN_ONLY',
] as const;

export const clash = (version, current, actor) => ({ ok: false, conflict: { version, current, actor } });

export const codeOf = (r) => ('refusal' in r ? r.refusal.code : 'ROW_LOCKED');

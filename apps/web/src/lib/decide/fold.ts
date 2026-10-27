/**
 * A LONG LIST OF OPTIONS THAT SAY THE SAME THING: thirteen accounts, twelve of which "hold nothing yet" and each
 * of which moves the same figure. The words are said once, over the list, with how many they cover, and each row keeps
 * only its name. PURE, AND NODE LOADS IT.
 */

/** The fewest rows that say the same before it is said once. */
export const FOLD_AT = 3;

/** A field's label as plain words: the record's own field name ("Digits the bank prints") read as "the last digits the bank prints". */
export function plainField(label: string): string {
  const s = label.trim();
  const low = s.charAt(0).toLowerCase() + s.slice(1);
  return /^digits\b/u.test(low) ? `the last ${low}` : low;
}

/** The kernel's "Nothing is in its Digits the bank prints yet." said plainly; any other reason is left alone. */
export function plainReason(because: string): string {
  const m = /^Nothing is in its (.+) yet\.$/u.exec(because.trim());
  return m ? `Nothing is kept for ${plainField(m[1]!)} yet.` : because;
}

/** The reasons said by `FOLD_AT` or more rows: the reason, and how many say it. */
export function repeatedReasons(becauses: readonly string[]): Map<string, number> {
  const n = new Map<string, number>();
  for (const b of becauses) if (b.trim() !== '') n.set(b, (n.get(b) ?? 0) + 1);
  return new Map([...n].filter(([, c]) => c >= FOLD_AT));
}

/** One repeated reason as the single line over the list: "12 have nothing kept for the last digits the bank prints yet." */
export function foldedLine(because: string, count: number): string {
  const said = plainReason(because);
  const m = /^Nothing is kept for (.+) yet\.$/u.exec(said);
  return m ? `${count} have nothing kept for ${m[1]} yet.` : `${said} (${count} of them)`;
}

/** The figure a list of changes shares: "Each takes EGP 12,430.00." when `FOLD_AT` or more start from the same figure. */
export function sharedBefore(changes: readonly { what: string; before: string }[]): string | null {
  const n = new Map<string, number>();
  for (const c of changes) n.set(`${c.what}\u0000${c.before}`, (n.get(`${c.what}\u0000${c.before}`) ?? 0) + 1);
  const top = [...n].sort((a, b) => b[1] - a[1])[0];
  return top && top[1] >= FOLD_AT ? top[0].split('\u0000')[1]! : null;
}

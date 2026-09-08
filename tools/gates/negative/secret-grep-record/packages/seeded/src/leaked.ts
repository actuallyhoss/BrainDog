/**
 * The third seeded violation, and the half this gate could not see at all.
 *
 * Its own failure message opens *"A credential never goes in the record, and never in a log"* — and
 * its five sinks were all the log half: `console`, `log`, `telemetry`, `push`, `dispatch`. A
 * plaintext written INTO the record was checked by nothing, which is `12 §6`'s promise and the one
 * the vault exists to keep.
 *
 * The line below binds the unwrapped value as a parameter, which is what a real leak looks like:
 * the SQL is innocent and the variable is not. The gate reads the bound parameters only — a column
 * called `wrapped_by` and a literal `'kek'` are a schema and a label, and eight honest calls in the
 * real tree are exactly that shape.
 */
export function keep(sql: { exec: (q: string, ...args: unknown[]) => void }, plain: Uint8Array): void {
  sql.exec('INSERT INTO grant (id, ciphertext) VALUES (?, ?)', 'g_1', plain);
}

/** And the same value bound where the schema itself carries a banned word, which must not double. */
export function innocent(sql: { exec: (q: string, ...args: unknown[]) => void }, sealed: Uint8Array): void {
  sql.exec('INSERT INTO vault_key (purpose, wrapped, wrapped_by) VALUES (?, ?, ?)', 'root', sealed, 'kek');
}

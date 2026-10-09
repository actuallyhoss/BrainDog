/* A rename that rewrites what the log said, rather than writing a new line. A comment that says UPDATE event is not
   a statement, and is not read. */
export function retitle(sql: { exec: (q: string, ...a: unknown[]) => void }, id: string, title: string): void {
  sql.exec(`UPDATE event
    SET note = ? WHERE id = ?`, title, id);
}

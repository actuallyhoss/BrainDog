/**
 * The names themselves: an opened action key held as `secret`, in an error message. The decoys are the record's own
 * shape, a bearer handed to `digest(` before it is kept, and a sentence that names a bearer as a word.
 */
type Sql = { exec(query: string, ...bound: unknown[]): void };

export async function keep(sql: Sql, digest: (text: string) => Promise<string>, bearer: string, secret: string): Promise<void> {
  sql.exec('INSERT INTO token (hash) VALUES (?)', await digest(bearer));
  console.log('a bearer was kept as its hash');
  throw new Error(`the provider refused ${secret}`);
}

/**
 * The key commands' seeded violation: a key that comes back from a call to a function in the same file.
 *
 * `getOne` returns a value typed `Plaintext`, and `keys` writes it to standard output under the name `got`, which
 * is made from no branded name at all. `depositOne` is called with the value too, and its answer is logged: that
 * answer is the host's reply, not the value, because the function's return type does not name the brand. One
 * finding: the write, and neither the log nor the deposit.
 */

type Plaintext = string & { readonly brand: 'Plaintext' };

type Answer = { status: number };

async function depositOne(base: string, value: Plaintext): Promise<Answer> {
  const res = await fetch(`${base}/api/vault/deposit`, { method: 'POST', body: JSON.stringify({ value }) });
  return { status: res.status };
}

async function getOne(base: string, label: string): Promise<{ value: Plaintext } | { refused: Answer }> {
  const res = await fetch(`${base}/api/vault/open`, { method: 'POST', body: JSON.stringify({ label }) });
  const reply = (await res.json()) as Record<string, unknown>;
  return typeof reply.value === 'string' ? { value: reply.value as Plaintext } : { refused: { status: res.status } };
}

export async function keys(base: string, read: string): Promise<number> {
  const value = read.trim() as Plaintext;
  const answer = await depositOne(base, value);
  if (answer.status !== 200) console.error('the deposit failed', answer);
  const got = await getOne(base, 'Kiln deploy');
  if ('refused' in got) return 1;
  process.stdout.write(got.value);
  return 0;
}

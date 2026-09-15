/**
 * The key commands' seeded violation: the two recorded exemptions, and a sink beside them.
 *
 * `depositOne` sends the value to its host, serialised, which is the one way a deposit can leave, and `execOne`
 * hands a key read back to one command's environment. The gate names both functions as exemptions. `put` then logs
 * the bytes the value was encoded to, a name that is not `plaintext` and is made from one. One finding: the log, and
 * neither the request nor the command.
 */

type Plaintext = string & { readonly brand: 'Plaintext' };

type Spawner = (command: string, args: string[], vars: Record<string, string | undefined>) => Promise<number>;

async function depositOne(base: string, value: Plaintext): Promise<number> {
  const res = await fetch(`${base}/api/vault/deposit`, { method: 'POST', body: JSON.stringify({ value }) });
  return res.status;
}

function execOne(io: { spawn: Spawner }, key: Plaintext): Promise<number> {
  const handed = { KILN_DEPLOY: key };
  return io.spawn('deploy', [], handed);
}

export async function put(base: string, read: string, io: { spawn: Spawner }): Promise<number> {
  const value = read.trim() as Plaintext;
  const sent = new TextEncoder().encode(value);
  const status = await depositOne(base, value);
  if (status !== 200) console.error('the deposit failed', sent);
  return execOne(io, value);
}

/**
 * The key commands' seeded violation: the one function that may print a key, and a second one that does.
 *
 * `headersOne` prints a key read back as the one header a program asks for, which is how Claude Code's
 * `headersHelper` is handed it, and the gate names that function as its exemption from standard output. `show`
 * calls it, and then writes the same key to standard output itself, from a function the gate does not name. One
 * finding, and one in all: the second write, and not the first.
 */

import { writeFileSync } from 'node:fs';

type Plaintext = string & { readonly brand: 'Plaintext' };

async function getOne(base: string, credential: string): Promise<{ value: Plaintext } | { refused: number }> {
  const res = await fetch(`${base}/api/vault/open`, { method: 'POST', body: JSON.stringify({ credential }) });
  const reply = (await res.json()) as Record<string, unknown>;
  return typeof reply.value === 'string' ? { value: reply.value as Plaintext } : { refused: res.status };
}

function headersOne(header: string, value: Plaintext): number {
  const quoted = value.replace(/["\\]/g, '\\$&');
  writeFileSync(1, `{"${header}":"${quoted}"}\n`);
  return 0;
}

export async function show(base: string, credential: string): Promise<number> {
  const got = await getOne(base, credential);
  if ('refused' in got) return 1;
  headersOne('Authorization', got.value);
  process.stdout.write(`${got.value}\n`);
  return 0;
}

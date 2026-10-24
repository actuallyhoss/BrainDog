/**
 * The clients of `clients.json`, each built the way its own SDK documents, over either transport.
 *
 * NOTHING HERE SPEAKS THE PROTOCOL ITSELF. Every byte on the wire is the SDK's: its handshake, its schemas, its
 * refusals. A hand-written client agrees with whoever wrote it, which is how the tools went unlisted in a real client
 * for a week while every test of the agent door was green.
 *
 * STDIO IS THE COMMAND AN AGENT APP STARTS, `braindog mcp`, pointed at a record by the two variables a person sets.
 * `BRAINDOG_CLI_BUILT=1` is CI's word that the bundle was just built: the check then runs `apps/cli/dist/braindog.mjs`,
 * which is what ships, and is red if it is missing. Anywhere else it runs the source, because a bundle left on a desk
 * from an older build answers for code that is no longer there.
 */

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client as Client2, StreamableHTTPClientTransport as Http2 } from '@modelcontextprotocol/client';
import { StdioClientTransport as Stdio2 } from '@modelcontextprotocol/client/stdio';
import { Client as Client1 } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport as Stdio1 } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport as Http1 } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const BUILT = join(ROOT, 'apps/cli/dist/braindog.mjs');
const SOURCE = join(ROOT, 'apps/cli/src/main.ts');

/** The file `braindog mcp` runs from, and which one it is, for the log. */
export function command(env = process.env) {
  if (env.BRAINDOG_CLI_BUILT !== '1') return { file: SOURCE, built: false };
  if (!existsSync(BUILT)) throw new Error(`BRAINDOG_CLI_BUILT=1 says the command was built, and there is no ${BUILT}. Build apps/cli first.`);
  return { file: BUILT, built: true };
}

/**
 * The child's environment: this machine's own BrainDog and Claude Code settings left out, so the command reaches the
 * record it is given and no other, and no session of the person running the check is touched.
 */
export function childEnv(base, key, config) {
  const env = {};
  for (const [name, value] of Object.entries(process.env)) if (!name.startsWith('BRAINDOG_') && !name.startsWith('CLAUDE')) env[name] = value;
  /* A home of its own beside the config: `~/.braindog/started.json` is read from HOME, and the check filled his real one. */
  const home = join(dirname(config), 'home');
  return { ...env, HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: config, BRAINDOG_HOST: base, BRAINDOG_TOKEN: key };
}

const INFO = { name: 'braindog-client-checks', version: '1.0.0' };

/**
 * One SDK client, connected. `{ client, agreed, stderr }`: `agreed()` is the revision the handshake settled on, read
 * from the SDK where it says so and otherwise from what it handed the transport; `stderr()` is what the command
 * printed, for a failure's message.
 */
export async function open(spec, revision, transport, { base, key, config, cwd }) {
  const v2 = spec.package === '@modelcontextprotocol/client';
  const client = !v2
    ? new Client1(INFO, { capabilities: {} })
    : revision.negotiation === 'auto'
      ? new Client2(INFO, { capabilities: {}, versionNegotiation: { mode: 'auto' } })
      : new Client2(INFO, { capabilities: {}, supportedProtocolVersions: [revision.revision] });

  let wire;
  let printed = '';
  if (transport === 'stdio') {
    const Stdio = v2 ? Stdio2 : Stdio1;
    wire = new Stdio({ command: process.execPath, args: [command().file, 'mcp', '--agent', 'other'], env: childEnv(base, key, config), cwd, stderr: 'pipe' });
    wire.stderr?.on('data', (chunk) => (printed += chunk));
  } else {
    const Http = v2 ? Http2 : Http1;
    wire = new Http(new URL('/mcp', base), { requestInit: { headers: { authorization: `Bearer ${key}` } } });
  }

  /* THE REVISION EACH SDK HANDS ITS TRANSPORT, kept as it passes, because the 1.x client keeps it nowhere it shows. */
  let handed;
  const set = wire.setProtocolVersion?.bind(wire);
  wire.setProtocolVersion = (v) => {
    handed = v;
    set?.(v);
  };

  try {
    await client.connect(wire);
  } catch (e) {
    await client.close().catch(() => {});
    throw new Error(`${spec.name} could not connect over ${transport} at ${revision.revision}: ${e instanceof Error ? e.message : String(e)}${printed ? `\nThe command printed: ${printed.trim()}` : ''}`);
  }
  return { client, agreed: () => client.getNegotiatedProtocolVersion?.() ?? handed, stderr: () => printed };
}

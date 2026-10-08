/**
 * A REAL CLIENT'S HANDSHAKE, ON EVERY PUSH (PRF-A06).
 *
 * The official MCP client SDKs of `clients.json` greet the agent door two ways, over stdio to `braindog mcp` and over
 * HTTP to `/mcp`, of a record started as the gates start theirs (`tools/gates/record.mjs`). At each revision named
 * there each one connects, lists the tools and finds every one of `TOOLS`, compiles each tool's input schema, lists the
 * resources, pings, calls `context`, and reads the error an unknown tool gives.
 *
 * WHY THE SDK AND NOT A HAND-WRITTEN CLIENT. Until 9 October the door's tests greeted it as an old client at
 * 2025-06-18 while the server answered the newest revision without `resultType`, and the strict client a person runs
 * refused the answer: the tools did not list for a week while every test was green. The SDK's schemas are the
 * client's, so an answer it refuses here is one a person's agent refuses too.
 *
 * NOTHING HERE IS LOOSENED TO PASS. A refusal by the SDK is the finding this file exists for.
 */

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { AjvJsonSchemaValidator } from '@modelcontextprotocol/client/validators/ajv';

import { TOOLS } from '../../packages/mcp/src/index.ts';
import { VERSIONS } from '../../packages/mcp/src/rpc.ts';
import { serverKeyFor, startRecord } from '../gates/record.mjs';

import { command, open } from './connect.mjs';

const { clients } = JSON.parse(readFileSync(new URL('./clients.json', import.meta.url), 'utf8'));
const TRANSPORTS = ['stdio', 'http'];

let record;
let at;
const scratch = mkdtempSync(join(tmpdir(), 'braindog-client-checks-'));

before(async () => {
  record = await startRecord();
  at = { base: record.base, key: serverKeyFor(record.base), config: join(scratch, 'config'), cwd: scratch };
  console.log(`client-checks: braindog mcp from ${command().built ? 'the built command' : 'the source'}, the record at ${record.base}`);
});

after(async () => {
  await record?.close();
  rmSync(scratch, { recursive: true, force: true });
});

test('EVERY REVISION THE SERVER CLAIMS IS OFFERED BY A REAL CLIENT, and every client named is pinned exactly', () => {
  const offered = new Set(clients.flatMap((c) => c.revisions.map((r) => r.revision)));
  for (const v of VERSIONS) assert.ok(offered.has(v), `the server claims ${v} and no client in clients.json offers it`);
  for (const r of offered) assert.ok(VERSIONS.includes(r), `clients.json offers ${r}, which the server does not claim`);
  const pinned = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).devDependencies;
  for (const c of clients) assert.equal(pinned[c.package], c.version, `${c.package} is pinned to ${pinned[c.package]}, and clients.json says ${c.version}`);
});

for (const spec of clients)
  for (const revision of spec.revisions)
    for (const transport of TRANSPORTS)
      test(`${spec.name} ${spec.version} over ${transport} at ${revision.revision}`, async (t) => {
        const { client, agreed } = await open(spec, revision, transport, at);
        try {
          await t.test('the handshake settles on the revision offered', () => {
            assert.equal(agreed(), revision.revision);
          });

          await t.test(`the tool list holds all ${TOOLS.length} of BrainDog's tools, each schema compiling`, async () => {
            const { tools } = await client.listTools();
            const names = tools.map((tool) => tool.name);
            /* EMPTY IS RED BY ITSELF, not only against `TOOLS`: a source with no tools would otherwise agree with an empty answer. */
            assert.ok(tools.length > 0, 'the SDK read no tools at all');
            for (const tool of TOOLS) assert.ok(names.includes(tool.name), `${tool.name} is missing from the list the SDK read: ${names.join(', ')}`);
            assert.equal(tools.length, TOOLS.length, `the SDK read ${tools.length} tools: ${names.join(', ')}`);
            const ajv = new AjvJsonSchemaValidator();
            for (const tool of tools) assert.doesNotThrow(() => ajv.getValidator(tool.inputSchema), `${tool.name}'s input schema does not compile`);
          });

          await t.test('the resource list reads, and every resource has an address and a name', async () => {
            const { resources } = await client.listResources();
            assert.ok(resources.length > 0, 'the SDK read no resources');
            for (const r of resources) assert.ok(typeof r.uri === 'string' && typeof r.name === 'string', `a resource without an address or a name: ${JSON.stringify(r)}`);
          });

          /* THE 2026-07-28 REVISION HAS NO PING: the SDK refuses to send one in that era, before it reaches the wire, and a
             client asks `server/discover` instead. So the newest revision is asked that, again, and the older ones ping. */
          await t.test('a ping is answered, or server/discover where the revision has no ping', async () => {
            if (revision.revision < '2026-07-28') return void (await client.ping());
            const found = await client.discover();
            assert.ok(found.supportedVersions?.includes(revision.revision), `server/discover does not name ${revision.revision}: ${JSON.stringify(found)}`);
          });

          await t.test('context answers, and the SDK accepts the answer', async () => {
            const said = await client.callTool({ name: 'context', arguments: {} });
            const text = said.content?.find((c) => c.type === 'text')?.text ?? '';
            assert.notEqual(said.isError, true, `context answered an error: ${text}`);
            assert.ok(text.length > 0, 'context answered no text');
          });

          await t.test('an unknown tool gives an error the SDK can read', async () => {
            let said;
            try {
              said = await client.callTool({ name: 'no_such_tool', arguments: {} });
            } catch (e) {
              /* A JSON-RPC ERROR HAS A NUMBER FOR ITS CODE. The SDK's own refusals have words, and one of those here means
                 it could not read the server's answer at all, which is the failure and not the error asked for. */
              assert.equal(typeof e?.code, 'number', `the SDK could not read the answer to an unknown tool: ${e}`);
              assert.ok(String(e.message).length > 0, 'the SDK threw without a message');
              return;
            }
            assert.equal(said.isError, true, `an unknown tool was answered as a success: ${JSON.stringify(said)}`);
            assert.ok(said.content?.some((c) => c.type === 'text' && c.text.length > 0), 'the error carries no words');
          });
        } finally {
          await client.close();
        }
      });

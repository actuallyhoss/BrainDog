/**
 * The Cloud on this Mac, for the apps: the Worker's own `fetch` over a real Directory and a real record, on 8787 where
 * `vite dev` proxies `/api`, `/auth` and `/account`, with one person a day into a record. Every sign-in letter the
 * Worker sends is printed with its link and its code, because there is no mailbox to read them in.
 *
 *   node apps/apple/tools/dev.mjs          then, beside it: pnpm --filter @braindog/web dev
 *   node apps/apple/tools/build.mjs sim --server http://localhost:5183
 *
 * WHY NOT `tools/gates/record.mjs`. That is the self-host, open, with no Directory sign-in and none of the app's doors
 * (`/auth/app/*` are the Worker's), so native sign-in has nothing to sign in to there. This is the gates' `cloud`
 * variant (`apps/worker/test/cloud-serve.ts`) on a fixed port and the wall's clock, so a link and a code live as long as
 * they do in production. The person is `mina@the-studio.example`, on The Studio, set up as a solo founder.
 *
 * NOTHING HERE IS A SECRET OR LEAVES THIS PROCESS. The letters are kept in memory and printed; the last one is also
 * written to `.notes/apps-dev-letter.txt` under the main checkout (gitignored), for a script to read the code from.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { startCloud } from '../../worker/test/cloud-serve.ts';

const PERSON = 'mina@the-studio.example';
const PORT = Number(process.env.BRAINDOG_DEV_PORT ?? 8787);
const notes = join(homedir(), 'Developer', 'braindog', '.notes');

const running = await startCloud({ port: PORT });
const person = await running.provision(PERSON, { slug: 'the-studio', name: 'The Studio', tz: 'Europe/London' });

const send = async (name, body) => {
  const said = await fetch(`${running.base}/api/${name}`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: person.cookie }, body: JSON.stringify(body) })
    .then((r) => r.json())
    .catch(() => null);
  if (said?.ok !== true) throw new Error(`the Cloud refused ${name}: ${said?.refusal?.fix ?? 'it did not answer'}`);
  return said.value;
};
/* A RECORD WITH SOMETHING IN IT: the solo founder's starter, accepted as the first run's "Make it mine" does. */
const offered = await send('propose', { question: 'Set this record up for a solo founder?', body_kind: 'pack', body: { install: 'usecase-founder' } });
await send('decide', { id: offered.id, decide: { option: 'accept', reason: 'This is what the record is for.' } });

console.log(`The Cloud is on ${running.base}, as ${running.origin}. Sign in as ${PERSON}.`);
console.log('Each sign-in letter is printed here.\n');

/** The link and the six digits in a letter, read from its text. */
const partsOf = (letter) => {
  const text = JSON.stringify(letter);
  const link = /https?:\/\/[^\s"\\]+\/signin[^\s"\\]*#magic=[A-Za-z0-9_-]+/.exec(text)?.[0] ?? null;
  const code = /\b(\d{3}) ?(\d{3})\b/.exec(text.replace(/\\n/g, ' '));
  return { link, code: code ? `${code[1]}${code[2]}` : null };
};

let seen = 0;
setInterval(async () => {
  while (seen < running.letters.length) {
    const letter = running.letters[seen++];
    const { link, code } = partsOf(letter);
    const to = letter?.to ?? letter?.personalizations?.[0]?.to ?? '';
    console.log(`letter to ${JSON.stringify(to)}\n  link: ${link ?? '(none)'}\n  code: ${code ?? '(none)'}\n`);
    await mkdir(notes, { recursive: true }).catch(() => {});
    await writeFile(join(notes, 'apps-dev-letter.txt'), `${link ?? ''}\n${code ?? ''}\n`).catch(() => {});
  }
}, 300);

const stop = async () => {
  await running.close();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

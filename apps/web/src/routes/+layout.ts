/**
 * `ssr = false`: a static shell. Both hosts serve one `build/` directory unchanged and no request is
 * ever rendered on a server (50 §13 D1).
 *
 * BOTH MODULES ARE LOADED DYNAMICALLY, and that is not a trick to make a budget pass. The sample is
 * the whole synthetic record, and `boot-live.ts` carries the client's route table; either one in the
 * entry chunk pushes it over its budget, which the bundle gate would be right to report.
 *
 * ONE REQUEST. The two imports are fetched together, and then the record's `boot` is the only call
 * the shell waits on, kept for the tab once it has answered, so a navigation costs nothing here.
 */
import { redirect } from '@sveltejs/kit';

import type { Shell } from '$lib/record/boot-live.ts';

export const ssr = false;
export const prerender = false;

export async function load({ url }): Promise<Shell> {
  const [{ boot, INBOX }, live] = await Promise.all([import('$lib/record/api.ts'), import('$lib/record/boot-live.ts')]);
  const booted = await live.readBoot(url.origin);

  /* NO RECORD HERE, AND THE SAMPLE IS DRAWN EXACTLY AS BEFORE. A refusal of any other kind is the
     record's answer, so the shell draws nothing of the sample and the screen says what it said. */
  const shell =
    booted.from === 'live'
      ? live.layoutOf(booted.boot)
      : booted.from === 'sample'
        ? live.sampleShell(boot(), INBOX.length)
        : live.refusedShell();

  /* A RECORD WITH ZERO REGISTERS HAS NO LEGAL SCREEN — 19 §6, which is also why screen one has no
     skip. Every other route would draw a nav with nothing in it, an empty state for a register that
     does not exist, or a table of a schema nobody declared; the shell itself has nothing to put in
     the rail. So there is one destination, and this is what sends people to it.

     DECLARED, NOT HOLDING. The rail lists the registers with rows in them, and a live record whose
     registers are all still empty has somewhere to go that is not onboarding. A refused `boot` says
     nothing about the registers, so it sends nobody anywhere.

     `/s/<token>` IS EXEMPT because it is a capability URL: it renders one projected page, read-only,
     and must not imply there is a record behind it at all.

     `/signin` IS EXEMPT FOR THE OPPOSITE REASON. It is the screen a person opens when the record
     in front of them is not the one they want, and an empty record is the likeliest moment to
     want another: sending it to onboarding answers a question nobody asked and takes away the one
     control that could have fixed it. */
  const declared =
    booted.from === 'live' ? booted.boot.registers.length : booted.from === 'sample' ? shell.index.registers.length : null;
  const spared = url.pathname === '/start' || url.pathname === '/signin' || url.pathname === '/invite' || url.pathname.startsWith('/s/');
  if (declared === 0 && !spared) redirect(307, '/start');

  return shell;
}

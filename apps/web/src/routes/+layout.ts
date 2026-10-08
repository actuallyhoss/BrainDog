/**
 * `ssr = false`: a static shell. Both hosts serve one `build/` directory unchanged and no request is
 * ever rendered on a server (50 §13 D1).
 *
 * EVERY MODULE IS LOADED DYNAMICALLY, and that is not a trick to make a budget pass. `boot-live.ts`
 * carries the client's route table, and in the entry chunk it pushes it over its budget, which the
 * bundle gate would be right to report.
 *
 * ONE REQUEST BEFORE THE FIRST PAINT, AND IT IS `boot` (EXP-D03). It carries the voice, who is working, what waits and
 * whether a model is behind Slash, which were four more calls in turn, and `app.html` asked for it before this ran. The
 * account's list of records and an older host's model check start here and are never waited on, but by the screens that
 * list the records (Settings and the connect screen), and each is kept for the tab once it has answered.
 */
import { redirect, type LoadEvent } from '@sveltejs/kit';

import { apiBase, at, here, signInFirst } from '$lib/at.ts';
import type { Shell } from '$lib/record/boot-live.ts';

export const ssr = false;
export const prerender = false;

/** The screens that list the records, which wait for the list: Settings (Identity, Billing) and an app's consent. */
const LISTS_RECORDS = /^\/(?:settings(?:\/|$)|connect$)/u;

/**
 * WHETHER A MODEL IS BEHIND SLASH ON THIS HOST, as `boot` says it (`slash`), and asked of `/api/version` once for the tab
 * only where the host is older than that field.
 *
 * THE PALETTE'S ROW FOR Slash HANGS ON THIS AND ON NOTHING ELSE (`50 §5.5` step 5). The only place the app read the flag was
 * `/start`, asked at the moment of making a record, so a person on a host with a model had no way to ask it a question: the
 * palette had no `slash` to read. The flag is a fact about the deployment rather than about the screen, so it is kept for the
 * tab like the switcher, and a refusal is forgotten rather than kept, so the next navigation asks again.
 *
 * `@braindog/client` IS LOADED HERE, NOT IMPORTED, for the budget reason at the top of this file: `boot-live.ts` already
 * pulls it into its own chunk, and a static import would put it back in the entry.
 */
let modelHere: Promise<boolean> | null = null;
/** What it answered, once it has. */
let modelSaid: boolean | null = null;

const askModel = (origin: string, fetch: typeof globalThis.fetch): Promise<boolean> =>
  import('@braindog/client')
    .then(({ createClient }) => createClient({ base: origin, fetch }).version())
    .then(
      (v) => {
        if (!v.ok) modelHere = null;
        modelSaid = v.ok && v.value.slash === true;
        return modelSaid;
      },
      () => ((modelHere = null), false),
    );

export async function load({ url, fetch }: Pick<LoadEvent, 'url' | 'fetch'>): Promise<Shell & { slash: boolean }> {
  const [live, voice] = await Promise.all([import('$lib/record/boot-live.ts'), import('$lib/voice.svelte.ts')]);
  /* THE RECORD THE ADDRESS NAMES. `url` and not `location`: a load runs for the address being opened, and `location`
     is the page being left until the navigation lands, so a move from acme to kiln would read acme's `boot`. */
  const api = apiBase(url);
  /* Read inside the record: the address is `/app/acme/start` and every rule below is written about `/start`. */
  const inner = here(url.pathname);
  /* `/connect` too: an app's sign-in lands there, and a redirect to `/start` would strand it halfway. */
  const spared =
    inner === '/start' || inner === '/signin' || inner === '/signup' || inner === '/invite' || inner === '/connect' || inner.startsWith('/s/');
  const booted = await live.readBoot(api);

  /* AN ADDRESS THAT WILL NOT OPEN FOR A STRANGER ASKS FOR SIGN-IN (`signInFirst`), the bare `/app/` as much as
     `/app/acme/`, and `/start` with them: it is spared the redirect below and not this one. The bare address drew the
     sample business until the sample left the app. */
  const signIn = booted.from === 'refused' ? signInFirst(booted.code, url) : null;
  if (signIn) redirect(307, signIn);

  /* THE VOICE THE RECORD SPEAKS IN, as `boot` says it (`voice`): heard at once, since nothing is asked to hear it. A host
     older than the field is asked the old way, and that is not waited on: the screens catch up when it lands. Never
     past a refusal: a record that cannot say speaks in the house voice. */
  const heard = voice.listen(booted.from === 'live' ? booted.boot : null, api).catch(() => undefined);
  if (booted.from !== 'live' || Object.hasOwn(booted.boot, 'voice')) await heard;
  if (typeof document !== 'undefined') void import('$lib/theme/draw.ts').then((look) => look.draw(booted.from === 'live' ? booted.boot : null));

  /* ANY OTHER REFUSAL IS THE RECORD'S ANSWER, a host nobody reached among them (a static host's fallback page, a
     preview with no record behind it): the shell draws nothing and the screen says what it said. */
  const shell =
    booted.from === 'live'
      ? live.layoutOf(booted.boot)
      : /* THE REFUSAL IS HANDED OVER RATHER THAN REMEMBERED. `refusedShell` keeps the last one as a
           module fallback, and this call sits one `await` after `readBoot`: any `forget()` landing
           in that window (`decide-write.ts`, `inbox-write.ts`, `news-live.ts`, which Home's own
           mark reaches) nulls it, and a colleague who may not read the record would be told the
           record is empty instead. The answer is right here, so it is passed. */
        live.refusedShell({ code: booted.code, fix: booted.fix });
  /* THE RAIL SAYS THE RECORD'S NAME FOR EACH LIST, where its use case gives one. */
  if (booted.from === 'live') {
    const words = voice.labels();
    shell.index.registers = shell.index.registers.map((r) => ({ ...r, name: voice.listNamed(words, r.id, r.name) }));
    shell.lists = shell.lists.map((l) => ({ ...l, name: voice.listNamed(words, l.id, l.name) }));
  }

  /* A RECORD WITH ZERO REGISTERS HAS NO LEGAL SCREEN (19 §6), which is also why the prompt has no
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
     control that could have fixed it.

     THE KERNEL'S OWN `session` LIST IS NOT ONE OF THEM. Every record declares it at open (migration 0002), so a count
     that included it was never zero and this redirect never fired: a fresh record opened on an empty Home instead of
     the prompt. What is counted is the lists a person or a pack declared. */
  const declared = booted.from === 'live' ? booted.boot.registers.filter((r) => r.id !== 'session').length : null;
  if (declared === 0 && !spared) redirect(307, at('/start', url.pathname));

  /* AND THE RECORDS THIS PERSON CAN REACH, WHICH `boot` CANNOT ANSWER: it names the record you are
     in and no other, so the account is the only thing with the list. Asked on a live record only:
     a static host answers this with its 404 page, which would put a sentence about signing in under
     a record nobody signed in to.

     A REFUSAL IS CARRIED RATHER THAN SWALLOWED. The switcher keeps the row `boot` named and says why
     the rest are absent, in the host's own words. Saying nothing leaves a menu one row long, which
     reads as a product that holds one business.

     AND NOT WHERE NOBODY SIGNS IN. A self-host started without a key answers this 401 on every load,
     and the switcher then said "Sign in again" on a host with no sign-in. `boot` says which host this is.

     NOT WAITED ON BEFORE THE FIRST PAINT. The rail's switcher reads it when it lands (`+layout.svelte`), and this load
     carries it once it has; only the screens that list the records wait for it. AT THE ROOT, UNDER NO SLUG: the list is
     the person's, not the record's in the address. */
  if (booted.from === 'live' && live.signsIn(booted.boot)) {
    const asked = live.recordsReach(fetch, url.origin);
    const listed = live.recordsReached() ?? (LISTS_RECORDS.test(inner) ? await asked : null);
    if (listed !== null) {
      if (!listed.ok) shell.recordsRefused = listed.refusal.fix;
      else if (listed.value.length > 0) shell.me = { ...shell.me, records: listed.value };
    }
  }

  /* WHETHER A MODEL IS BEHIND SLASH, as `boot` says it. A host older than the field is asked `version` once for the tab,
     not waited on: this load says no until it has answered. A REFUSED RECORD IS NEVER `true`: there is nobody signed in
     to it to ask Slash anything. */
  const sent = booted.from === 'live' ? booted.boot.slash : false;
  const slash = typeof sent === 'boolean' ? sent : ((modelHere ??= askModel(api, fetch)), modelSaid === true);

  return { ...shell, slash };
}

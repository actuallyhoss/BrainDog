/**
 * `ssr = false`: a static shell. Both hosts serve one `build/` directory unchanged and no request is
 * ever rendered on a server (50 §13 D1).
 *
 * EVERY MODULE IS LOADED DYNAMICALLY, and that is not a trick to make a budget pass. `boot-live.ts`
 * carries the client's route table, and in the entry chunk it pushes it over its budget, which the
 * bundle gate would be right to report.
 *
 * ONE REQUEST BEFORE THE FIRST PAINT, AND IT IS `boot`. It carries the voice, who is working, what waits and
 * whether a model is behind Slash, which were four more calls in turn, and `app.html` asked for it before this ran. The
 * account's list of records and an older host's model check start here and are never waited on, but by the screens that
 * list the records (Settings and the connect screen), and each is kept for the tab once it has answered.
 */
import { redirect, type LoadEvent } from '@sveltejs/kit';

import { readingWay, setReadingWay } from '$lib/a11y/reading.ts';
import { apiBase, at, here, signInFirst } from '$lib/at.ts';
import type { Shell } from '$lib/record/boot-live.ts';
import type AppFrame from '$lib/shell/AppFrame.svelte';
import type LightFrame from '$lib/shell/LightFrame.svelte';
import { light, type FrameData } from '$lib/shell/light.ts';
/* SEE AS PUTS ITS HEADER ON THE TAB'S FETCH AS THIS LOADS, before the first `boot` is asked (`see-as.svelte.ts`). */
import { exitSeeAs, seeingAs } from '$lib/sharing/see-as.svelte.ts';
import { shellSignedOut } from '$lib/shell.ts';

/* WHICH WAY THE APP READS IS SET BEFORE ANYTHING IS DRAWN (`reading.ts`). */
if (typeof document !== 'undefined' && readingWay() === 'rtl') setReadingWay('rtl', false);

export const ssr = false;
export const prerender = false;

/* A DEVICE THAT WEARS ITS OWN COLOUR PAINTS IT AS THE APP STARTS (`accent.ts` `early`), so the first screen is drawn in
   it and never in the house colour first; the shell's restore (`AppFrame.svelte`) still says a colour it had to drop. A
   device in the house colour never loads that code (`theme/follow.ts`). The cookie is read as `app.html` reads it. */
if (typeof document !== 'undefined' && /(?:^|; )bd_pref=[^;]*%22theme%22/u.test(document.cookie)) void import('$lib/accent.ts').then((accent) => accent.early()).catch(() => null);

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

/* THE TAB'S FIRST LOAD ONLY draws from the last copy; every later load waits for `boot` as before. */
let opened = false;

/**
 * WHAT THE ROOT LAYOUT IS HANDED: the shell and, beside it, the frame it draws the screen in. The app's frame
 * (`AppFrame.svelte`) for a record's screens, or the light frame (`LightFrame.svelte`) for sign-in and sign-up
 * (`lib/shell/light.ts`). Both are loaded here and neither is imported by the layout, so the one a screen does not draw
 * is never fetched; a record's first open carries only the light frame's preload list (`vite.config.ts`), a few hundred
 * bytes in this file's chunk.
 */
export type Root = FrameData & { frame: typeof AppFrame | null; light: typeof LightFrame | null };

type Event = Pick<LoadEvent, 'url' | 'fetch'> & Partial<Pick<LoadEvent, 'depends'>>;

/**
 * THE FRAME IS ASKED FOR BEFORE ANYTHING HERE IS WAITED ON, beside `boot`, so it loads while the record answers, and the
 * first screen draws once both have. It is no longer the root layout (E14): a static import there put the whole shell
 * in front of every screen, sign-in's and sign-up's too.
 */
export async function load(event: Event): Promise<Root> {
  if (light(here(event.url.pathname))) return lightLoad(apiBase(event.url));
  /* AN INVITATION PAGE OPENED WITH NO LINK IN IT ASKS THE RECORD NOTHING (settings3, 2 Nov): its token is the fragment,
     so with none there is nothing to look at, and the shell it asked for came back 401 twice to a stranger, two
     console errors over a page that only says to open the link. `app.html` skips its early asks for it too. The
     fragment is the address's own (`location`), since a load is never handed one. */
  if (here(event.url.pathname) === '/invite' && typeof location !== 'undefined' && location.hash === '') return lightLoad(apiBase(event.url));
  const frame = import('$lib/shell/AppFrame.svelte');
  /* A LOAD THAT REDIRECTS NEVER WAITS FOR IT, so a frame that failed to load then is not an unhandled refusal. */
  frame.catch(() => undefined);
  /* TODAY'S READER'S CODE IS ASKED ONCE THE FRAME'S HAS LANDED, on the tab's first open of Today (speed6, 2 Nov), so it
     comes in while the frame mounts and not after: Home asked for it about 110 ms into that mount on a cold phone. After
     the frame's and not beside it, so it never takes the line from the frame's own code. `__bdToday` is `app.html`'s
     early ask, made only for a record's front door. */
  if (!opened && !event.url.searchParams.has('work') && (globalThis as { __bdToday?: unknown }).__bdToday) void frame.then(readerEarly, () => undefined);
  const shell = await shellOf(event);
  return { ...shell, frame: (await frame).default, light: null };
}

/** Today's reader and the code its first read takes, each asked once; Home asks the same modules and gets these. */
function readerEarly(): void {
  for (const ask of [() => import('$lib/page/PageView.svelte'), () => import('$lib/record/page-drawn.ts'), () => import('$lib/home/today-read.ts'), () => import('$lib/home/tile-code.ts'), () => import('$lib/home/handled.ts')])
    void ask().catch(() => null);
}

/**
 * SIGN-IN AND SIGN-UP ASK THE RECORD NOTHING AND LOAD NO SHELL (first hour audit, E14). A stranger there has no record to
 * read, and `boot` and `schemas` both came back 401, two console errors on every first visit; both screens ask the
 * account who is signed in themselves (`methods`). They were then handed the refused shell, which loaded the record's
 * readers (`boot-live.ts`) for a frame they no longer draw: the light frame reads nothing of the shell, and neither
 * screen reads the layout's data, so they are handed none of it.
 *
 * TYPED AS THE APP'S ANSWER, because Kit gives every page the root's type and the app's pages read the shell through it.
 * Nothing drawn on a light screen reads it: the root layout reads `frame` and `light` and nothing else there.
 *
 * A TAB THAT DREW A RECORD BEFORE COMING HERE (signing in as somebody else, or after signing out) puts the house voice
 * and the house look back, as the refused shell did; on a cold open neither was ever changed, so neither is loaded.
 * Before `opened`, so the first screen past them is still the tab's first open.
 */
async function lightLoad(api: string): Promise<Root> {
  const frame = import('$lib/shell/LightFrame.svelte');
  if (opened) {
    const voice = await import('$lib/voice.svelte.ts');
    await voice.listen(null, api).catch(() => undefined);
    if (typeof document !== 'undefined') void import('$lib/theme/draw.ts').then((look) => look.draw(null));
  }
  return { frame: null, light: (await frame).default } as unknown as Root;
}

async function shellOf({ url, fetch, depends }: Event): Promise<FrameData> {
  /* THE RECORD THE ADDRESS NAMES. `url` and not `location`: a load runs for the address being opened, and `location`
     is the page being left until the navigation lands, so a move from acme to kiln would read acme's `boot`. */
  const api = apiBase(url);
  /* Read inside the record: the address is `/acme/start` and every rule below is written about `/start`. */
  const inner = here(url.pathname);
  /* `/connect` too: an app's sign-in lands there, and a redirect to `/start` would strand it halfway. And
     `/connect/approve`, the page a terminal prints, for the same reason: a machine is waiting on it. */
  const spared =
    inner === '/start' || inner === '/signin' || inner === '/signup' || inner === '/invite' || inner === '/connect' || inner === '/connect/approve' || inner === '/s' || inner.startsWith('/s/');
  /* THE LOCAL COPY IS OPENED BEFORE ANYTHING HERE IS WAITED ON, beside `boot` (which `app.html` already asked) and never
     in front of the first paint, and its last reader verified, so the first screen's ask finds it open. */
  const first = !opened;
  opened = true;
  /* SEEN AS SOMEBODY, NOTHING KEPT IS DRAWN AND NOTHING IS KEPT: the last shell and the local copy are the owner's. */
  const seen = seeingAs() !== null;
  if (first && depends && !spared) void import('$lib/data/local-tab.ts').then((c) => c.warmLocal(api), () => undefined);
  /* THE EARLY PAGE'S WALKS' CODE IS FETCHED NOW, beside the frame's (`walks-early.ts`), and asked below. */
  const walks = first && !seen && !spared && (globalThis as { __bdPage?: unknown }).__bdPage ? import('$lib/page/walks-early.ts') : null;
  walks?.catch(() => null);
  const [live, voice] = await Promise.all([import('$lib/record/boot-live.ts'), import('$lib/voice.svelte.ts')]);
  /* THE LISTS' DECLARATIONS ARE ASKED BESIDE `boot` AND IN ONE READ (`firstOpen`): Today, its desk and its page's reader
     each learn every list, twenty-five asks on the seed that a browser sent six at a time, after `boot`, ahead of the
     page. On before any screen draws, and for the tab. */
  if (first) live.firstOpen(api);
  /* AND A PAGE OPENED BY ITS ADDRESS WALKS THE LISTS ITS REFS POINT AT FROM ITS EARLY ANSWER (`walks-early.ts`), once
     the lists' declarations are the client's (`firstOpen`): before, each would be asked of the network. */
  if (walks) void walks.then((m) => m.askPageWalks(api), () => undefined);
  depends?.('braindog:boot');
  const copies = await import('$lib/record/boot-copy.ts');
  /* ON A COLD OPEN THE SHELL IS DRAWN FROM THE LAST COPY AT ONCE, then `boot` is read behind it and this load runs again
     with the live answer (redirects and refusals included). Not on the screens that must see the record's own answer. */
  if (first) {
    const copy = depends && !spared && !seen ? copies.readCopy(api) : null;
    if (copy) {
      /* ASKED HERE AND REPLACED FROM THE SHELL (`+layout.svelte`), once this navigation has drawn. An `invalidate` from
         here could land while the first navigation was still loading: it took that navigation's place, had no page to
         go back to, and the tab drew nothing at all, on every reload with a copy kept. */
      void live.readBoot(api).catch(() => undefined);
      /* AND ITS CURRENCY IS THE RECORD'S UNTIL THE LIVE ONE SAYS AGAIN (VERIFY H45): the copy carries the home currency
         `boot` named, but only a live shell had told `homeCurrency()`, so Needs you said "£2,439 GBP" for a frame and
         every amount moved when the code went. */
      (await import('$lib/record/api.ts')).learnHome(copy.index.currency ?? null);
      return { ...copy, slash: false };
    }
  }
  const booted = await live.readBoot(api);
  /* SOMEBODY WHO MAY ONLY ADD IS REMEMBERED ON THIS DEVICE BY THE ADDRESS `app.html` ASKS `boot` AT (collab pass 3), so
     its early asks stop at `boot`: the lists, Today and the page were each a 403 on every open. A live answer forgets it. */
  if (typeof location !== 'undefined')
    try {
      const u = new URL(`${api}/api/boot`, location.href).href;
      if (booted.from === 'refused' && booted.at === 'level.append') {
        localStorage.setItem('bd_add_only', u);
        /* AND WHAT SHE WAS TOLD, so the next open draws it from `whoami` and asks no `boot` (`addOnlyAt`, collab pass 4). */
        localStorage.setItem('bd_add_only_said', JSON.stringify({ code: booted.code, fix: booted.fix, at: booted.at }));
      } else if (booted.from === 'live') {
        if (localStorage.getItem('bd_add_only') === u) {
          localStorage.removeItem('bd_add_only');
          localStorage.removeItem('bd_add_only_said');
        }
        /* AND THAT THIS DEVICE HAS SEEN THE READER READ HERE (`readsKnown`), so the next open asks `boot` at once and no
           `whoami` first. The last twelve records, newest last. */
        const reads = (localStorage.getItem('bd_reads') ?? '').split(' ').filter((r) => r !== '' && r !== u);
        localStorage.setItem('bd_reads', [...reads.slice(-11), u].join(' '));
      }
    } catch {
      /* blocked storage: the early asks go on as before */
    }
  /* A HOST NOBODY REACHED IS NO REFUSAL: the last copy and the local copy stay, since offline is when they earn their
     keep. Any refusal the record gave takes both. */
  const unreached = booted.from === 'refused' && booted.code === 'UNREACHABLE';
  /* A RECORD THAT WILL NOT BE SEEN AS THEM (they left it, or the caller is no longer an Admin) is seen as yourself again. */
  if (seen && booted.from === 'refused' && !unreached) {
    exitSeeAs();
    return new Promise<never>(() => undefined);
  }
  if (booted.from === 'refused' && !unreached) {
    copies.dropCopy();
    void import('$lib/data/local-tab.ts').then((c) => c.wipeLocal(), () => undefined);
  }
  /* OFFLINE, THE LAST READER THIS BROWSER SIGNED IS WHO THE COPY IS DRAWN FOR, or nobody (`local-mark.ts`). */
  const tabCopy = unreached && !spared ? await import('$lib/data/local-tab.ts').catch(() => null) : null;
  const reader = tabCopy ? await tabCopy.lastReader(api).catch(() => null) : null;
  void import('$lib/data/local-tab.ts').then((c) => c.offlineLocal(reader !== null), () => undefined);

  /* AN ADDRESS THAT WILL NOT OPEN FOR A STRANGER ASKS FOR SIGN-IN (`signInFirst`), the bare `/` as much as
     `/acme/`, and `/start` with them: it is spared the redirect below and not this one. The bare address drew the
     sample business until the sample left the app. */
  const signIn = booted.from === 'refused' ? signInFirst(booted.code, url) : null;
  /* IN AN APP THAT SIGNS IN ITSELF (`shellSignedOut`, `shell.ts`), native is told and the web's sign-in page is never
     drawn: the load waits for the page native loads again once he is back in, as a See as that ended does above. */
  if (signIn && shellSignedOut()) return new Promise<never>(() => undefined);
  if (signIn) redirect(307, signIn);

  /* THE VOICE THE RECORD SPEAKS IN, as `boot` says it (`voice`): heard at once, since nothing is asked to hear it. A host
     older than the field is asked the old way, and that is not waited on: the screens catch up when it lands. Never
     past a refusal: a record that cannot say speaks in the house voice. */
  const heard = voice.listen(booted.from === 'live' ? booted.boot : null, api).catch(() => undefined);
  if (booted.from !== 'live' || Object.hasOwn(booted.boot, 'voice')) await heard;
  if (typeof document !== 'undefined') void import('$lib/theme/draw.ts').then((look) => look.draw(booted.from === 'live' ? booted.boot : null));

  /* ANY OTHER REFUSAL IS THE RECORD'S ANSWER, a host nobody reached among them (a static host's fallback page, a
     preview with no record behind it): the shell draws nothing and the screen says what it said. */
  /* AND A HOST NOBODY REACHED, WITH A READER THIS BROWSER KNOWS, draws the last copy of the shell, to read only, or the
     refusal marked offline where none is kept: the screens draw what the local copy holds for that reader. */
  const kept = reader !== null ? copies.readCopy(api) : null;
  /* AND WITH NO SHELL COPY, THE RAIL IS DRAWN FROM THE LOCAL COPY'S LISTS AND PAGES, so an offline cold open has
     somewhere to go. Offline only, where nothing else will answer before it. */
  const rail = booted.from !== 'live' && reader !== null && (kept === null || kept.me.person !== reader) && tabCopy ? await tabCopy.railLocal(api, reader).catch(() => null) : null;
  const shell: Shell =
    booted.from === 'live'
      ? live.layoutOf(booted.boot)
      : reader !== null
        ? kept !== null && kept.me.person === reader
          ? { ...kept, offline: true as const }
          : { ...live.railShell(live.refusedShell({ code: booted.code, fix: booted.fix, ...(booted.at ? { at: booted.at } : {}) }), rail ?? { lists: [], pages: [] }), offline: true as const }
        : /* THE REFUSAL IS HANDED OVER RATHER THAN REMEMBERED. `refusedShell` keeps the last one as a
           module fallback, and this call sits one `await` after `readBoot`: any `forget()` landing
           in that window (`decide-write.ts`, `inbox-write.ts`, `news-live.ts`, which Home's own
           mark reaches) nulls it, and a colleague who may not read the record would be told the
           record is empty instead. The answer is right here, so it is passed. */
        live.refusedShell({ code: booted.code, fix: booted.fix, ...(booted.at ? { at: booted.at } : {}) });
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
     the prompt. What is counted is the lists a person or a pack declared.

     NOR ANY LIST THE KERNEL DECLARES (`kernel: true`, 1 Nov): the kernel came to declare `instructions` at open too, so
     a record made at the operator door (`/auth/provision`, a claim link) counted one list and opened on a bare Today
     instead of the conversation. A host older than the flag still has `session` left out by its id. */
  const declared = booted.from === 'live' ? booted.boot.registers.filter((r) => r.id !== 'session' && r.kernel !== true).length : null;
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
    const lists = LISTS_RECORDS.test(inner);
    const asked = live.recordsReach(fetch, url.origin, lists ? null : (await import('$lib/data/first-drawn.ts')).afterFirst());
    const listed = live.recordsReached() ?? (lists ? await asked : null);
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

  if (booted.from === 'live' && !seen) copies.saveCopy(api, shell);
  return { ...shell, slash };
}

<!--
  Settings as a place: the index of areas, and the one area the address names.

  ONE COMPONENT PER AREA, in `areas/`. This file used to draw every area itself, so any
  two of them could not be changed by two people at once and every style rule sat in one block
  with every other area's. It chooses an area and draws it now; each area keeps its own markup,
  state, handlers and styles, and what more than one area reads is in `settings-state.svelte.ts`.

  TWO ADDRESSES, ONE SCREEN. `/settings/<area>` is this route, and `/settings` draws this same file
  with no area in the address (its own `+page.svelte` renders it), which is the index.

  THE INDEX IS DECLARED. `/settings` is a page body drawn by the one reader, `PageView`, at every
  width: a tile for each group, its areas as links (`place.ts` `SETTINGS_INDEX`), or the record's own `settings` page
  where it holds one, which is how a person reorders, renames and leaves out areas. Once an area is open, the chooser
  beside it (`SettingsIndex.svelte`) draws the same groups in the same order; below 900px the area is the page, with a
  back link to the index.
-->
<script lang="ts">
  import { apiBase, at } from '$lib/at.ts';
  import { titleOf } from '$lib/title.ts';
  import { page } from '$app/state';
  import { goto, invalidateAll } from '$app/navigation';
  import { untrack } from 'svelte';
  import { copy } from '$lib/copy.ts';
  /* Type only, so the client's route table stays out of this chunk. */
  import type { Shell } from '$lib/record/boot-live.ts';
  import type { Opened } from '$lib/record/page-live.ts';
  import type { PageBody } from '$lib/record/pages-live.ts';
  import { may } from '$lib/record/may.ts';
  import { readUsage } from '$lib/record/actions.ts';
  import { readSnapshots } from '$lib/record/settings-write.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import PageView from '$lib/page/PageView.svelte';
  import { closed, closedAfter, drew, opened } from '../../../lib/ui/screen.svelte.ts';
  import { hostedHere } from '../billing.ts';
  import { createClient } from '@braindog/client';
  import Tile from '$lib/ui/Tile.svelte';
  import Waiting from '$lib/ui/Waiting.svelte';
  import {
    daysLeft,
    healthSaid,
    lastCopy,
    leadFault,
    nearest,
    type CopyState,
    type Engine,
    type Fault,
    type Sign,
    type UsageState,
  } from './health.ts';
  import { AREAS, DEFAULT_GROUPS, SETTINGS_INDEX, SETTINGS_PAGE, areaOf, groupsOf, labelIn, type AreaGroup } from './place.ts';
  import Menu from '$lib/ui/Menu.svelte';
  import { openSettings } from './settings-state.svelte.ts';
  import { inIosApp } from '$lib/shell.ts';
  import SettingsIndex from './SettingsIndex.svelte';
  /* THE ROWS EVERY AREA SHARES, scoped under `.settings-place` below; the file says why it is global. */
  import './settings.css';
  /* THE FORM LAYOUT EVERY AREA'S FORMS WEAR: two columns from 1100px, checkbox groups, number fields, the
     submit row at the tile's foot. */
  import '$lib/ui/forms.css';
  /* EVERY AREA TAKES `{ shell, area }`, so each arm of the chain below is the same line. Sharing alone also takes People
     here, the People area it draws first (`here`), so it names no other area itself. */
  import Appearance from './areas/Appearance.svelte';
  import SigningIn from './areas/SigningIn.svelte';
  import People from './areas/People.svelte';
  import Ingest from './areas/Ingest.svelte';
  import Keyboard from './areas/Keyboard.svelte';
  import Roles from './areas/Roles.svelte';
  import Navigation from './areas/Navigation.svelte';
  import Notifications from './areas/Notifications.svelte';
  import Backups from './areas/Backups.svelte';
  import Billing from './areas/Billing.svelte';
  import Export from './areas/Export.svelte';
  import Delete from './areas/Delete.svelte';
  import Words from './areas/Words.svelte';
  import { homeCurrency } from '$lib/record/api.ts';
  import { agentHead, nameOfSlug } from '$lib/agents/agent-page.svelte.ts';
  import { KIND_NAMES } from '$lib/agents/profile.ts';

  /**
   * THE SHELL, AND NOT THE SAMPLE.
   *
   * This whole screen read `boot()` (the in-browser sample) for who you are, what you hold and
   * what the record is called, on every record. So on a live record it said the sample's level
   * beside your address, counted the sample's records under "Records you can open", decided whose
   * row was yours in People by a sample id, and asked somebody to type the SAMPLE's slug to delete
   * a record that is not it. The layout already asked `boot` once and kept the answer, which is
   * exactly the one source every other screen reads, and every area is handed it.
   */
  const shell = $derived(page.data as unknown as Shell);

  /* WHAT MORE THAN ONE AREA READS, opened fresh for this visit to Settings and kept while the person
     moves between areas, which is how long it lasted as this page's own state. */
  openSettings(() => shell);

  /* NO AREA IS THE INDEX: `/settings` draws this file with nothing in the address. */
  /* `/settings/agents/<agent>` (G14) is this screen too: the Agents area, drawing one agent's page. */
  const agentParam = $derived((page.params as { agent?: string }).agent);
  const param = $derived(page.params.area ?? (agentParam !== undefined ? 'agents' : undefined));

  /**
   * WHETHER THIS IS AN AREA AT ALL, which nothing asked.
   *
   * `area` came straight off the param with no membership test, and every screen downstream believed
   * it: `/settings/banana` gave `<title>Banana · Settings</title>`, an `<h1>Banana</h1>`, and a
   * `no-data-yet` state reading "This area is part of the shell and is not wired in the mock-up" —
   * a page answering a nonexistent address by asserting the feature exists and is merely
   * unconfigured. `/r/nope`, `/v/nope` and `/p/nope` refuse it by naming the thing, saying it is not
   * here, and listing what is, and so does this.
   *
   * EVERY AREA THIS BUILD DRAWS, whatever the index lists: an area somebody left out of their index still opens.
   */
  const known = $derived(param === undefined ? undefined : areaOf(param));
  /* THE AREA BY ITS ID, NOT ITS ADDRESS: a moved address (`place.ts` `MOVED`) is the area that holds it now. */
  const area = $derived(known?.id ?? param);

  /* THE DESIGN BOOK MOVED TO `/design` (agents F29): its old address goes there, so a link to it still lands. */
  $effect(() => {
    if (param === 'look') void goto(at('/design'), { replaceState: true });
  });

  /* ── the index, declared ─────────────────────────────────────────────────
     THE RECORD'S OWN `settings` PAGE WHERE IT HOLDS ONE, else the house body, drawn by the record (`previewPage`) as
     Home draws Today: each block held to the reader, and nothing written. */
  const declares = $derived(shell.pages.includes(SETTINGS_PAGE));

  /** The index as the record drew it, `null` while it is out. */
  let indexGot = $state<Opened | null>(null);
  /** The record could not draw it (a refused boot, a host without `previewPage`), so the chooser's list stands in. */
  let indexDown = $state(false);
  /** The groups the chooser draws: the house order until a declared index is read, then that index's. */
  let declaredGroups = $state<readonly AreaGroup[]>(DEFAULT_GROUPS);
  /* A COLLEAGUE'S INDEX LEAVES OUT WHAT ONLY AN OWNER DOES (collab pass, 2 Nov): a contractor shared one project was shown
     Keychain, What comes in, Add-ons, Billing, Usage, Tidy up, Backups, Export and Delete, each a page of refusals.
     Their addresses still open, so a link still lands, and the record still refuses every write there. */
  const OWNERS_AREAS: ReadonlySet<string> = new Set(['ingest', 'addons', 'billing', 'tidy', 'backups', 'export', 'delete']);
  const OWNERS_PLACES: ReadonlySet<string> = new Set(['/keychain', '/usage', '/p/health']);
  const owner = $derived(Boolean((shell.me as { owner?: boolean }).owner) || shell.me.level === 'owner');
  const groups = $derived<readonly AreaGroup[]>(
    owner
      ? declaredGroups
      : declaredGroups
          .map((g) => ({ ...g, areas: g.areas.filter((a) => !OWNERS_AREAS.has(a.id)), ...(g.outside ? { outside: g.outside.filter((o) => !OWNERS_PLACES.has(o.href)) } : {}) }))
          .filter((g) => g.areas.length > 0),
  );
  let indexAsked = false;

  async function readIndex(): Promise<void> {
    indexAsked = true;
    const mark = opened();
    let out: Opened | null = null;
    try {
      if (declares) {
        const m = await import('$lib/record/page-live.ts');
        out = await m.pageReader(apiBase()).read(SETTINGS_PAGE);
      }
      /* A PAGE THE SHELL NAMED AND THE RECORD NO LONGER HOLDS is the house body again, as one never declared is. */
      if (out === null || out.from === 'missing') {
        const m = await import('../../decide/[id]/proposed.ts');
        const drawn = await m.drawnOf(SETTINGS_INDEX, apiBase());
        if (drawn.from === 'live')
          out = { from: 'live', now: drawn.now, page: { page: { page: SETTINGS_INDEX.page, title: SETTINGS_INDEX.title }, blocks: drawn.blocks } };
      }
    } catch {
      out = null;
    }
    /* A READ THAT FAILS REFUSES NOTHING: the chooser's own list is the index then, and the screen is drawn. */
    closed(true, mark);
    if (out?.from === 'live') {
      indexGot = out;
      indexDown = false;
      declaredGroups = groupsOf(out.page.blocks);
    } else indexDown = true;
  }

  /**
   * ASKED ONCE FOR THIS VISIT TO SETTINGS: on the index, always; beside an area, only where the record declares its
   * own index, since the house order is already in hand. A shell whose record refused `boot` asks nothing.
   */
  $effect(() => {
    if (indexAsked) return;
    if (shell.refused) {
      indexDown = true;
      return;
    }
    if (area === undefined || declares) untrack(() => void readIndex());
  });

  /* THIS SCREEN'S OWN WORDS: the index's one tool, and its line where the record has no health to say. */
  const words = {
    arrange: 'Reorder the areas',
    more: 'More',
    designBook: 'Design book',
    /* A RECORD NAMED FOR ITS OWNER ("Sam Rivera") read as how Sam looks; the name is used only where it names the
       BrainDog itself. */
    lead: (name: string) => `How ${/braindog/iu.test(name) ? name : 'your BrainDog'} looks and opens, who can reach it, and what it keeps.`,
  } as const;

  /**
   * ARRANGE: the index made the person's own page, at `/p/settings`, where Edit layout moves and removes its tiles,
   * How this page is built moves, renames and leaves out its areas, and Change this page asks Slash to. The house body
   * is written as their page the first time, which is a declared change like any other. Only an owner changes pages
   * (`setDeclaration` is ADMIN), so nobody else is offered it.
   */
  const mayArrange = $derived(!shell.refused && may(shell, 'owner'));
  let arranging = $state(false);

  async function arrangeIndex(): Promise<void> {
    if (arranging) return;
    arranging = true;
    try {
      if (!declares) {
        const m = await import('$lib/record/page-write.ts');
        const out = await m.setBody(apiBase(), SETTINGS_INDEX as unknown as PageBody);
        if (out.from !== 'written') {
          toasts.push(out.fix, { intent: 'warn' });
          return;
        }
        (await import('$lib/record/boot-live.ts')).forget();
        await invalidateAll();
      }
      await goto(at(`/p/${SETTINGS_PAGE}`));
    } finally {
      arranging = false;
    }
  }

  /** The name the open area is drawn under: the person's, where their index renamed it. */
  const label = $derived.by(() => {
    if (!known) return undefined;
    const named = labelIn(groups, known.id) ?? known.label;
    /* DELETE SAYS WHAT GOES: "Delete this record", where the index left its own words. The record's name read as
       its owner's ("Delete Marta"), so the name stays in the sentence under it. */
    return known.id === 'delete' && named === areaOf('delete')?.label ? copy.deleteRecord : named;
  });

  /**
   * The areas whose controls are actually kept — measured, not assumed.
   *
   * A LIST AND NOT A PREDICATE, because there is nothing on an area to ask. `pref.ts` knows which
   * KEYS persist and this file knows which area draws which control; the join between them lives
   * nowhere, so it is written here, next to the sentence it decides. The day another
   * area writes a preference this is the line that has to change, and the sentence going stale is
   * a sentence a reader can see is wrong, which is the failure that produced it.
   *
   * NAVIGATION IS NOT HERE: what it keeps is kept for the person on a record and on the device only without one, so it
   * says which of the two once, itself, and this line under it said the other.
   *
   * NOR IS APPEARANCE, for the same reason. The look is kept by the record, for the person, on every device they open
   * it on (`pref.ts` `keep`, the `look.*` keys), and on this device alone only with no record or a record that cannot
   * keep it. Its own hint says which of the three it is, read from `pref.whereKept()` after each choice settles, and
   * this line under it said "kept on this device" a screen below a hint saying "on every device you open it on".
   *
   * KEYBOARD IS, and it is true there: the character-keys switch is a cookie (`pref.write({ chars })`) and is sent nowhere.
   */
  const KEEPS = new Set(['keyboard']);

  /**
   * THIS SCREEN COMPUTES ITS CONTENT SYNCHRONOUSLY, and says so.
   *
   * `data-screen` on `<main id="main">` is what lets anything outside the page tell a drawn screen
   * from a shell that has fetched nothing. Four browser gates waited on `#main` having a child,
   * with the wait swallowed by a `catch`, which is satisfied by a page heading and means nothing
   * the day a screen fetches. `Empty` says `empty` or `refused` for the states it draws; this is
   * the other claim, and it is true of this screen today.
   *
   * IT STOPS BEING AVAILABLE WHEN IT STOPS BEING TRUE. A screen that starts fetching brackets its
   * reads with `opened()` and `closed()`, and a call still out takes the attribute away whatever
   * this line says.
   */
  /**
   * AN AREA DRAWN FROM A CHUNK OF ITS OWN IS NOT DRAWN UNTIL THE CHUNK HAS COME AND THE AREA HAS ASKED WHAT IT READS.
   * The claim below was made over the bare shell while `import()` was out, then taken back as the area's reads went, then
   * made again, and a look that waited for the mark read the screen in between as carrying none (audit 31 Oct A31,
   * Agents, People & sharing, Tidy up, Add-ons). So the chunk is held as a call out, closed a task after it lands
   * (`closedAfter`), by when the area is mounted and its own reads are out. The same module the template imports, so
   * it is fetched once.
   */
  const CHUNKS: Readonly<Record<string, () => Promise<unknown>>> = {
    people: () => import('./areas/Sharing.svelte'),
    agents: () => import('./areas/Agents.svelte'),
    addons: () => import('./areas/Addons.svelte'),
    tidy: () => import('./areas/Health.svelte'),
  };
  $effect(() => {
    const load = area === undefined ? undefined : CHUNKS[area];
    if (!load) return;
    untrack(() => {
      const at = opened();
      load().then(
        () => closedAfter(true, at),
        () => closed(true, at),
      );
    });
  });
  $effect(() => drew('ready'));

  /**
   * THE SENTENCE UNDER THE TITLE: what is broken, whether Slash's model answers, how many vital signs need a look, last
   * night's copy and the month's allowance, said on the index and on the two areas whose data the last two are, Billing
   * and Backups. The phrase that needs him is red and is words, and only when something does. `health.ts` says what the
   * answers mean, and what is broken leads.
   *
   * THE COPY AND THE MONTH ONLY WHERE THE CLOUD HOLDS THIS RECORD, which is where both answers exist: a self-host has no
   * ledger, and says nothing of them rather than half a sentence. The faults, the engine and the signs are the record's
   * own on every host. Asked once for this visit to Settings, when the first of the three is opened, and never waited
   * on: the screen is drawn without it and the sentence arrives when the record answers, so its reads hold the quiet
   * mark (the client counts them out) and not `data-screen`.
   *
   * A READ THAT FAILS SAYS NOTHING AND REFUSES NOTHING. A build without `faults`, `engineHealth` or `signs`, a refusal,
   * or a host that hands none is `null`, which `health.ts` says as nothing and never as healthy. Its reads close as fine
   * and never mark the screen refused.
   */
  /* THE INDEX ONLY (agents F13): Backups and Billing say their own state in their own tiles, and a line on two areas
     alone moved the chooser 32px lower there than on every other. */
  const SAID_ON = new Set<string | undefined>([undefined]);
  let copyLast = $state<CopyState>(null);
  let month = $state<UsageState>(null);
  let faults = $state<Fault[] | null>(null);
  let engine = $state<Engine | null>(null);
  let signs = $state<Sign[] | null>(null);
  let asked = false;

  /* ONLY THE OWNER READS FAULTS (`faults` refuses anyone else), so nobody else is asked for them or offered Details. */
  const owns = $derived(!shell.refused && may(shell, 'owner'));

  /** One read through the client's route table, its value or `null`: a refusal, a dropped call, a method not here. */
  async function valueOf<T>(read: () => Promise<{ ok: true; value: T } | { ok: false }>): Promise<T | null> {
    try {
      const out = await read();
      return out.ok ? out.value : null;
    } catch {
      return null;
    }
  }

  const recordClient = () => createClient({ base: apiBase() });

  async function readFaults(): Promise<void> {
    const out = await valueOf(() => recordClient().call<{ faults: Fault[] }>('faults'));
    faults = Array.isArray(out?.faults) ? out.faults : null;
  }

  async function readHealth(): Promise<void> {
    asked = true;
    const now = Date.now();
    const hosted = hostedHere(shell);
    const client = recordClient();
    const [copies, usage, eng, vital] = await Promise.all([
      hosted ? readSnapshots(apiBase()).catch(() => null) : null,
      hosted ? readUsage((url, init) => fetch(url, init), now, '', apiBase(page.url), undefined, homeCurrency()).catch(() => null) : null,
      valueOf(() => client.engineHealth()),
      valueOf(() => client.call<{ signs: Sign[] }>('signs')),
      owns ? readFaults() : null,
    ]);
    if (copies?.from === 'live') copyLast = lastCopy(copies.snapshots.map((c) => c.at), now);
    if (usage?.ok === true && usage.view.from === 'ledger' && usage.view.current) {
      const records = usage.view.records;
      const mine = records.find((r) => r.name === shell.index.slug) ?? (records.length === 1 ? records[0] : undefined);
      if (mine && mine.meters.length > 0) month = { resets: mine.resets, near: nearest(mine.meters), daysLeft: daysLeft(now) };
    }
    engine = eng && typeof eng === 'object' && 'health' in eng ? (eng as Engine) : null;
    signs = Array.isArray(vital?.signs) ? vital.signs : null;
  }

  $effect(() => {
    if (!SAID_ON.has(area) || shell.refused || asked) return;
    untrack(() => void readHealth());
  });

  /**
   * WHERE THE SIGNS ARE SHOWN, so the count is a link to them: the record's Health page where it holds one, and until
   * it does (the Health page is its own unit) the Settings index, where this sentence stands whole. On the index itself
   * the count is words, since a link to the page it is on goes nowhere.
   */
  const signsAt = $derived(shell.pages.includes('health') ? '/p/health' : area === undefined ? null : '/settings');

  const health = $derived(SAID_ON.has(area) ? healthSaid(copyLast, month, { faults, engine, signs, signsAt, backupsAt: '/settings/backups', inboxAt: owns ? '/inbox' : null, now: shell.now }) : null);

  /**
   * TRY AGAIN AND DETAILS, under the sentence while a fault is open. Try again queues the job behind the fault
   * the sentence names, now rather than at tonight's retry (`retryFault`, the owner's); a refusal shows the record's own
   * sentence under it. Details lists every open fault: its sentence, how often and since when, and the raw error where
   * the record hands it (the owner of a self-hosted record).
   */
  const fault = $derived(SAID_ON.has(area) ? leadFault(faults) : null);
  let retrying = $state<string | null>(null);
  let retryFix = $state('');
  let details = $state(false);

  const faultWords = {
    retry: 'Try again',
    details: 'Details',
    hide: 'Hide details',
    retried: 'Trying it again now.',
    failed: (n: number, since: string) => `${n === 1 ? 'Failed once' : `Failed ${n} times`} since ${since}.`,
  } as const;

  const dayOf = (iso: string): string => {
    const ms = Date.parse(iso);
    return Number.isFinite(ms) ? new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }) : iso;
  };

  /* A MAIL THAT DID NOT GO OUT HAS NO JOB TO QUEUE AGAIN (PK4): the next mail tries, so it is offered no Try again. */
  const retries = (cause: string): boolean => !cause.startsWith('mail#');

  async function retry(cause: string): Promise<void> {
    if (retrying !== null) return;
    retrying = cause;
    retryFix = '';
    try {
      const out = await recordClient().call<{ cause: string; queued: number }>('retryFault', { cause });
      if (!out.ok) {
        retryFix = 'refusal' in out ? out.refusal.fix : copy.recordNotReached;
        return;
      }
      toasts.push(faultWords.retried);
      await readFaults();
    } catch {
      retryFix = copy.recordNotReached;
    } finally {
      retrying = null;
    }
  }

</script>

<!-- THE HEALTH LINE (agents F13): its words in ink, an 8px dot in `--warn` while something needs a look, and one "Look"
     link at its end in the link red. -->
{#snippet healthLine()}<span class="health-dot" data-bad={health?.some((p) => p.needs) ? '' : undefined} aria-hidden="true"></span>{#each health ?? [] as part}{#if part.href}<a class="health-look tap" href={at(part.href)}>{part.text}</a>{:else}{part.text}{/if}{/each}{/snippet}

<!-- WHAT CAN BE DONE ABOUT AN OPEN FAULT, under the sentence: Try again on the one it names, and for the owner the whole
     list. A rectangle each; the list is in a tile, and a refusal is the record's own sentence. -->
{#snippet faultTools()}
  {#if fault}
    <div class="fault-tools">
      {#if retries(fault.cause)}<Button size="sm" disabled={retrying !== null} aria-busy={retrying === fault.cause} onclick={() => void retry(fault.cause)}>{faultWords.retry}</Button>{/if}
      {#if owns}
        <Button size="sm" weight="bare" aria-expanded={details} aria-controls="fault-details" onclick={() => (details = !details)}
          >{details ? faultWords.hide : faultWords.details}</Button
        >
      {/if}
    </div>
    <p class="fault-fix" role="status">{retryFix}</p>
    {#if owns && details}
      <div id="fault-details" class="fault-details">
        <Tile title={faultWords.details} count={faults?.length ?? 0}>
          <ul class="faults">
            {#each faults ?? [] as f (f.cause)}
              <li>
                <p class="fault-said">{f.said}</p>
                {#if f.why}<p class="fault-why">{f.why}</p>{/if}
                <p class="fault-when">{faultWords.failed(f.count, dayOf(f.since))}</p>
                {#if f.error}<p class="fault-error">{f.error}</p>{/if}
                {#if f.cause !== fault.cause && retries(f.cause)}
                  <Button size="sm" disabled={retrying !== null} aria-busy={retrying === f.cause} onclick={() => void retry(f.cause)}>{faultWords.retry}</Button>
                {/if}
              </li>
            {/each}
          </ul>
        </Tile>
      </div>
    {/if}
  {/if}
{/snippet}

<!-- NO SEND TO SLASH ON SETTINGS: the red sign's sentence links to Health, where it is read, and Slash is asked from the
     top bar. A split button under the title read as a setting. -->

<svelte:head><title>{agentParam !== undefined ? titleOf(agentHead.name || nameOfSlug(agentParam, KIND_NAMES), label ?? copy.settings) : titleOf(label, copy.settings)}</title></svelte:head>

{#if param === 'look'}
  <!-- On its way to `/design`. -->
{:else if area !== undefined && !known}
  <div class="gone">
    <Empty
      kind="error"
      heading
      title={copy.noSuch('settings area', area)}
      body={copy.theseExist('Settings areas', [...AREAS.values()].map((a) => ({ address: a.id, title: a.label })))}
    >
      {#snippet actions()}<Button href="/settings">{copy.settings}</Button>{/snippet}
    </Empty>
  </div>
{:else}
<!-- AN AREA'S HEAD LINKS BACK TO THE INDEX: the kicker at 1440, the back link in the phone's bar. The
     index's own head is the one word, with nowhere above it to go back to, and its one tool. -->
<!-- THE INDEX'S "⋯" (agents F28): reordering the areas, the owner's, and the design book. Nothing else sits on the
     head, so the list under it is the first thing read. -->
{#snippet indexTools()}
  {#if mayArrange || import.meta.env.DEV}
  <Menu label={words.more} align="end">
    {#snippet trigger()}<span class="head-more"><Icon name="more" size="m" /><span class="isr">{words.more}</span></span>{/snippet}
    {#if mayArrange}
      <button type="button" role="menuitem" disabled={arranging} aria-busy={arranging} onclick={() => void arrangeIndex()}
        ><Icon name="edit" size="s" />{words.arrange}</button
      >
    {/if}
    {#if import.meta.env.DEV}<a role="menuitem" href={at('/design')}><Icon name="eye" size="s" />{words.designBook}</a>{/if}
  </Menu>
  {/if}
{/snippet}
{#if known}
  <!-- EACH AREA UNDER ITS OWN GLYPH (agents F28): the sun for Appearance, the bell for Notifications. -->
  {#if agentParam !== undefined}
    <!-- ONE AGENT'S PAGE (G14): its name, under Agents, and Back goes to the list. -->
    <PageHead icon={known.icon} kicker={label ?? known.label} back="/settings/agents" title={agentHead.name || nameOfSlug(agentParam, KIND_NAMES)} />
  {:else}
    <PageHead icon={known.icon} kicker={copy.settings} back="/settings" title={label ?? known.label} sentence={health ? healthLine : undefined} below={fault ? faultTools : undefined} />
  {/if}
{:else}
  <!-- THE INDEX OPENS ON A LEAD TILE, as a declared page does: its name and Arrange ride over the top of the tile and the
       line under them is the headline. Arrange waits for the pointer or the keyboard to reach the tile. `display:
       contents`, so the sticky head still sticks. -->
  <div class="index-head">
    <PageHead
      icon="settings"
      title={copy.settings}
      sentence={health ? healthLine : words.lead(shell.refused ? '' : shell.index.name)}
      below={fault ? faultTools : undefined}
      actions={indexTools}
    />
  </div>
{/if}

{#if !known}
  <!-- THE INDEX, DRAWN BY THE ONE READER: Home's body mode, with no head of its own under this one. Where the record
       cannot draw it, the chooser's list is the index, so nobody is left on a page of nothing. -->
  <div class="settings-index">
    <!-- IN THE IPHONE APP THE INDEX IS THE CHOOSER'S LIST, in the order the record's index gives (`groups`), since the
         drawn index's Billing row is a link and the app shows the plan as a line (`SettingsIndex`). -->
    {#if indexDown || !owner || inIosApp}
      <div class="settings-place" data-index=""><SettingsIndex {groups} /></div>
    {:else}
      <PageView slug={SETTINGS_PAGE} got={indexGot} mode="home" reread={readIndex} />
    {/if}
  </div>
{:else}
<!-- `data-area` IS WHAT HIDES THE CHOOSER ON A PHONE while an area is open: there the area is the page,
     and the index is one back link away. `settings-place` is also the root every rule in
     `settings.css` is held under. -->
<div class="settings-place" data-area="">
  <div class="chooser">
    <SettingsIndex {groups} current={known.id} />
  </div>

  <div class="body">
    {#if area === 'appearance'}
      <Appearance {shell} {area} />
    {:else if area === 'keyboard'}
      <Keyboard {shell} {area} />
    {:else if area === 'navigation'}
      <Navigation {shell} {area} />
    {:else if area === 'people'}
      <!-- PEOPLE & SHARING DRAWS THE PEOPLE AREA FIRST: roles, invites and links, then every share. -->
      <!-- By `import()`, as Agents is: its lists, groups and the Share sheet's host are a chunk only somebody opening it
           waits for. -->
      {#await import('./areas/Sharing.svelte') then { default: Sharing }}
        <Sharing {shell} {area}>{#snippet here()}<People {shell} {area} />{/snippet}</Sharing>
      {/await}
    {:else if area === 'roles'}
      <Roles {shell} {area} />
    {:else if area === 'signing-in'}
      <SigningIn {shell} {area} />
    {:else if area === 'agents'}
      <!-- AGENTS BY `import()`: its tiles are the panels a page may host too (trust, Slash reads, the reader's keys), so
           drawn from both places their styles are chunks of their own, and listed here they pushed the entry script
           past its ceiling. -->
      <!-- A SKELETON AT ONCE (live check, 1 Nov): the area stood blank while its chunk came. The tiles' own shapes, bars
           and no words of any record (`Waiting`). -->
      {#await import('./areas/Agents.svelte')}
        <Tile icon="session" title={agentParam === undefined ? 'Your agents' : (agentHead.name || nameOfSlug(agentParam, KIND_NAMES))}><Waiting rows={4} /></Tile>
        {#if agentParam === undefined}<Tile icon="decide" title="Answering"><Waiting rows={3} /></Tile>{/if}
      {:then { default: Agents }}<Agents {shell} {area} />{/await}
    {:else if area === 'ingest'}
      <Ingest {shell} {area} />
    {:else if area === 'addons'}
      <!-- BY `import()`: the add-ons' list, its plan sheet and its readers are a chunk only somebody opening it waits for. -->
      {#await import('./areas/Addons.svelte') then { default: Addons }}<Addons />{/await}
    {:else if area === 'notifications'}
      <Notifications {shell} {area} />
    {:else if area === 'words'}
      <Words {shell} {area} />
    {:else if area === 'backups'}
      <Backups {shell} {area} />
    {:else if area === 'tidy'}
      <!-- BY `import()`: the record's housekeeping and its readers are a chunk only somebody opening Health waits for. -->
      {#await import('./areas/Health.svelte') then { default: Health }}<Health {shell} {area} />{/await}
    {:else if area === 'billing'}
      <Billing {shell} {area} />
    {:else if area === 'delete'}
      <Delete {shell} {area} />
    {:else if area === 'export'}
      <Export {shell} {area} />
    {/if}

    <!-- WHERE THIS AREA'S CHOICES ARE KEPT, ONLY UNDER THE AREAS IN `KEEPS`. A line about what is kept,
         drawn under an area with nothing to press or with nothing kept on this device, is a line a
         reader learns to skip on the areas where it is true. A shell with no record says so in its
         own refusal, so no footer here repeats that nothing was saved. -->
    {#if KEEPS.has(known.id)}<p class="mock">{copy.keptOnDevice}</p>{/if}
  </div>
</div>
{/if}
{/if}

<style>
  /* THE HEALTH LINE'S DOT: ink while all is well, and the late red only when something is broken (batch 6, call 6). */
  .health-dot {
    display: inline-block;
    inline-size: 8px;
    block-size: 8px;
    margin-inline-end: var(--sp-2);
    border-radius: var(--r-round);
    background: var(--ink);
    vertical-align: middle;
  }

  .health-dot[data-bad] {
    background: var(--warn-fill);
  }

  .health-look {
    color: var(--red);
    font-weight: 500;
    text-decoration: none;
  }

  @media (hover: hover) and (pointer: fine) {
    .health-look:hover {
      text-decoration: underline;
    }
  }

  /* TRY AGAIN AND DETAILS: rectangles in a row under the sentence, wrapping on a phone. */
  .fault-tools {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  /* Always in the document, so the record's refusal is announced when it arrives. Empty, it takes no room. */
  .fault-fix {
    margin: var(--sp-2) 0 0;
    max-inline-size: var(--measure);
    color: var(--red);
    font-size: var(--fs-body);
  }

  .fault-fix:empty {
    display: none;
  }

  .fault-details {
    margin-block-start: var(--sp-3);
  }

  .faults {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .faults li {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--sp-1);
  }

  .faults p {
    margin: 0;
    max-inline-size: var(--measure);
    line-height: var(--lh-body);
  }

  .fault-said {
    color: var(--ink);
  }

  /* A FAILED NIGHT'S REASON, in plain words: read, so the second ink. */
  .fault-why {
    color: var(--ink-2);
  }

  .fault-when {
    color: var(--ink-3);
    font-size: var(--fs-body);
  }

  /* THE RECORD'S RAW ERROR, the self-hosted owner's alone: it may be one long word, so it breaks anywhere. */
  .fault-error {
    color: var(--ink-2);
    font-size: var(--fs-body);
    overflow-wrap: anywhere;
  }

  .index-head {
    display: contents;
  }

  /* THE "⋯"'S NAME, said to a screen reader and not drawn. */
  .isr {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /* THE INDEX IS ONE COLUMN, the page's own, as Home's body is: its tiles carry their spans. */
  .settings-index {
    min-inline-size: 0;
    max-inline-size: var(--page-max);
    padding: var(--sp-4) var(--gutter) var(--sp-9);
  }

  /* THE INDEX'S DIVIDERS START AT THE TEXT (agents F28), past the row's well, where the link list's own padding puts the
     title; a rule through the well column reads as a table's. AND THEY END AT THE CHEVRON (VERIFY P37), the row's own
     end padding, where they ran on through the row's bleed to the tile's edge. */
  /* AND NOT THE PHONE'S STRIP AS WELL (audit 11-01, AP21): `blocks.css` draws a list's hairline as a background strip under
     each item below 640px, so on a phone every row wore that one from the well and this one from the words, a thin
     rule turning heavier halfway. This one alone. */
  .settings-index :global(.list[data-kind='link'] > .item) {
    border-block-end: 0;
    background-image: none;
  }

  .settings-index :global(.list[data-kind='link'] > .item + .item::before) {
    content: '';
    position: absolute;
    inset-block-start: 0;
    inset-inline: calc(var(--sp-3) + var(--well-l) + var(--sp-3)) var(--sp-3);
    block-size: 1px;
    background: var(--rule);
    pointer-events: none;
  }

  /* A WHOLE-WIDTH GROUP (Your data) STANDS ITS ROWS TWO TO A LINE from 1100 (G2): five rows across 1100px put each
     chevron 900px from its name. Two columns read like the four groups above it; the second row has no rule over it. */
  @media (width >= 1100px) {
    .settings-index :global(.block-slot[style*='--span: 12'] .list[data-kind='link']) {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      column-gap: var(--sp-6);
    }

    .settings-index :global(.block-slot[style*='--span: 12'] .list[data-kind='link'] > .item:nth-child(2)::before) {
      display: none;
    }
  }

  /* THE ONE IRREVERSIBLE ACT IS DATA'S LAST ROW, ITS NAME IN RED, at the rows' own rhythm: the 16 it stood apart
     by left a hole under a group of one. */
  .settings-index :global(.list[data-kind='link'] > .item > a[href$='/settings/delete']) {
    color: var(--red);
  }

  /* THE FALLBACK LIST BRINGS ITS OWN GUTTER (`.settings-place`), so the index does not add a second one round it. */
  .settings-index:has(> .settings-place) {
    padding: 0;
  }

  /* The refusal stands alone, with the index gone: there is no area to be in. */
  .gone {
    padding-block: var(--sp-6);
    padding-inline: var(--sp-5);
  }

  /* ONE COLUMN ON A PHONE, where the index and an area are each a page; the head to the first
     content is 24px. */
  .settings-place {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--sp-5);
    padding-block: var(--sp-5) var(--sp-9);
    padding-inline: var(--gutter);
  }

  /* AN AREA'S TILES SIT THE BOARD'S GAP APART, as every board's do (Look B: 12): at 24 and 32 the area read as loose
     cards on a page rather than one board. */
  .body {
    display: flex;
    flex-direction: column;
    gap: var(--inset);
    min-inline-size: 0;
  }

  /* The line under every area whose controls are kept on this device, and only under those. */
  .mock {
    color: var(--ink-3);
    font-size: var(--fs-cap);
  }

  /* FROM 900PX UP, THE INDEX BESIDE THE AREA, narrower than the rail at 200 with its rows at the meta step, so two
     columns of navigation do not take a third of the screen before the area starts. It does not stick: with its groups
     it is taller than a short window, and a sticky column taller than the window hides its own last rows until the page
     ends. */
  @media (width >= 900px) {
    .settings-place {
      grid-template-columns: 200px minmax(0, 1fr);
      column-gap: var(--sp-6);
      align-items: start;
    }

    /* THE LIST STANDING IN FOR THE INDEX HAS NO AREA BESIDE IT, so it takes the column an area would have. */
    .settings-place[data-index] {
      grid-template-columns: minmax(0, 32rem);
    }
  }

  @media (width < 900px) {
    .settings-place {
      padding-block-end: var(--sp-8);
    }

    .settings-index {
      padding: var(--sp-2) var(--gutter) var(--sp-8);
    }

    /* A PHONE IS NOT OFFERED THE KEYBOARD (`place.ts` `ONLY_WIDE`), on the declared index as on the list: its address
       still opens. The row is the link's own, so it is found by where it goes. */
    .settings-index :global(.list[data-kind='link'] > .item:has(> a[href$='/settings/keyboard'])) {
      display: none;
    }

    /* AND THE ROW BEFORE IT, THE LAST ONE DRAWN, TAKES NO RULE UNDER IT: You ended on a hairline over nothing. */
    .settings-index :global(.list[data-kind='link'] > .item:has(+ .item:last-child > a[href$='/settings/keyboard'])) {
      background-image: none;
    }

    .settings-place[data-area] .chooser {
      display: none;
    }
  }
</style>

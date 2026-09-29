<!--
  Settings as a place: the index of areas, and the one area the address names.

  ONE COMPONENT PER AREA, in `areas/`. This file used to draw every area itself, so any
  two of them could not be changed by two people at once and every style rule sat in one block
  with every other area's. It chooses an area and draws it now; each area keeps its own markup,
  state, handlers and styles, and what more than one area reads is in `settings-state.svelte.ts`.

  TWO ADDRESSES, ONE SCREEN. `/settings/<area>` is this route, and `/settings` draws this same file
  with no area in the address (its own `+page.svelte` renders it), which is the index. Below 900px
  the index is a page and each area a page with a back link to it; from 900px up the index stands
  beside the open area, and `/settings` opens the first one (`SettingsIndex.svelte`, `place.ts`).
-->
<script lang="ts">
  import { apiBase, at } from '$lib/at.ts';
  import { titleOf } from '$lib/title.ts';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { untrack } from 'svelte';
  import { copy } from '$lib/copy.ts';
  /* Type only, so the client's route table stays out of this chunk. */
  import type { Shell } from '$lib/record/boot-live.ts';
  import { readUsage } from '$lib/record/actions.ts';
  import { readSnapshots } from '$lib/record/settings-write.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import { closed, drew, opened } from '../../../lib/ui/screen.svelte.ts';
  import { hostedHere } from '../billing.ts';
  import { daysLeft, healthSaid, lastCopy, nearest, type CopyState, type UsageState } from './health.ts';
  import { openSettings } from './settings-state.svelte.ts';
  import SettingsIndex from './SettingsIndex.svelte';
  /* THE ROWS EVERY AREA SHARES, scoped under `.settings-place` below; the file says why it is global. */
  import './settings.css';
  /* EVERY AREA TAKES `{ shell, area }` AND NOTHING ELSE, so each arm of the chain below is the same line. */
  import Appearance from './areas/Appearance.svelte';
  import Identity from './areas/Identity.svelte';
  import Recovery from './areas/Recovery.svelte';
  import Sessions from './areas/Sessions.svelte';
  import People from './areas/People.svelte';
  import Agents from './areas/Agents.svelte';
  import Ingest from './areas/Ingest.svelte';
  import Keyboard from './areas/Keyboard.svelte';
  import Navigation from './areas/Navigation.svelte';
  import Notifications from './areas/Notifications.svelte';
  import Backups from './areas/Backups.svelte';
  import Billing from './areas/Billing.svelte';
  import Export from './areas/Export.svelte';
  import Delete from './areas/Delete.svelte';

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

  /**
   * THE AREAS, AND THE ONE REGISTRY OF THEM: a unit adding an area writes its row here.
   *
   * A ROW WITH A GLYPH EACH, because the index is a list of places like the app's rail, and the
   * rail has never had a row without one. A list of bare words is the hardest kind of nav to scan.
   *
   * EACH ROW NAMES ITS GROUP AND SAYS WHAT THE AREA HOLDS IN ONE LINE, because the index draws both
   * (`place.ts` has the groups and their order). The line is what a person scanning the index reads
   * to find the area, so it names what is there and never how it works. It is drawn on the phone's
   * index only, on one line beside a chevron, so it stays short enough to be read there whole rather
   * than cut. The index draws the groups in their own order, so a row's place in this list only
   * orders it inside its group.
   */
  const AREAS = [
    { id: 'appearance', label: 'Appearance', icon: 'sun', group: 'you', line: 'Colour, text size and density' },
    { id: 'identity', label: 'Identity', icon: 'people', group: 'signin', line: 'Who you are, and your records' },
    { id: 'recovery', label: 'Recovery', icon: 'key', group: 'signin', line: 'Passkeys, and getting back in' },
    { id: 'sessions', label: 'Sessions', icon: 'lock', group: 'signin', line: 'Where you are signed in' },
    { id: 'people', label: 'People & sharing', icon: 'people', group: 'sharing', line: 'Who can see this record, and invites' },
    { id: 'agents', label: 'Agents', icon: 'session', group: 'sharing', line: 'Machines and agents that work here' },
    { id: 'ingest', label: 'Ingest', icon: 'inbox', group: 'sharing', line: 'Mail and sources that feed this record' },
    { id: 'keyboard', label: 'Keyboard', icon: 'keyboard', group: 'you', line: 'Character keys and shortcuts' },
    { id: 'navigation', label: 'Navigation', icon: 'rows', group: 'you', line: 'Navigation placement and hidden pages' },
    { id: 'notifications', label: 'Notifications', icon: 'bell', group: 'you', line: 'When BrainDog interrupts you' },
    { id: 'backups', label: 'Backups', icon: 'archive', group: 'record', line: 'Copies of this record to restore from' },
    { id: 'billing', label: 'Billing', icon: 'money', group: 'record', line: 'What this record costs' },
    { id: 'export', label: 'Export', icon: 'download', group: 'record', line: 'Take a signed copy of your data' },
    /* ITS OWN ROW, AND IT WAS THE LAST SECTION OF `Export`. A person who wants a copy of their data
       clicks the row labelled Export with a download icon beside it, scrolls past the file, the
       signing key and the public key, and arrives at the one irreversible act in the product.
       `53 §5.9` says there is no rollback after step 2 of it. A destructive act reached by somebody
       looking for a backup is reached by the person least expecting it, which is the opposite of
       what the typed slug is there for. */
    { id: 'delete', label: 'Delete this record', icon: 'trash', group: 'record', line: 'Removes the record for good' },
  ] as const;

  /* NO AREA IS THE INDEX: `/settings` draws this file with nothing in the address. */
  const area = $derived(page.params.area);

  /**
   * WHETHER THIS IS AN AREA AT ALL, which nothing asked.
   *
   * `area` came straight off the param with no membership test, and every screen downstream believed
   * it: `/settings/banana` gave `<title>Banana · Settings</title>`, an `<h1>Banana</h1>`, and a
   * `no-data-yet` state reading "This area is part of the shell and is not wired in the mock-up" —
   * a page answering a nonexistent address by asserting the feature exists and is merely
   * unconfigured.
   *
   * `/r/nope`, `/v/nope` and `/p/nope` all refuse this correctly and helpfully, naming the thing,
   * saying it is not here, and listing what is. Three route families got it right and the fourth
   * invented an area. `10 §7`'s fourth rule holds on a URL as much as on a write: the refusal is
   * the teacher.
   */
  const known = $derived(area === undefined ? undefined : AREAS.find((a) => a.id === area));

  /**
   * FROM 900PX UP, `/settings` OPENS THE FIRST AREA, because there the index stands beside an area
   * and an index beside nothing is half a screen of empty page. Below 900px the index is the page,
   * and this does nothing.
   *
   * ASKED ONCE, AS THE INDEX OPENS, and not followed as the window changes: a person who narrows a
   * window on the index is still on the index, and one who widens it can pick an area from it.
   * `replaceState`, so Back returns to wherever they came from rather than to an address that
   * would open the area again.
   */
  const WIDE = '(width >= 900px)';

  $effect(() => {
    if (area === undefined && matchMedia(WIDE).matches) void goto(at(`/settings/${AREAS[0].id}`), { replaceState: true });
  });

  /**
   * The areas whose controls are actually kept — measured, not assumed.
   *
   * A LIST AND NOT A PREDICATE, because there is nothing on an area to ask. `pref.ts` knows which
   * KEYS persist and this file knows which area draws which control; the join between them lives
   * nowhere, so it is written here, next to the sentence it decides. The day another
   * area writes a preference this is the line that has to change, and the sentence going stale is
   * a sentence a reader can see is wrong, which is the failure that produced it.
   */
  const KEEPS = new Set(['appearance', 'keyboard', 'navigation']);

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
  $effect(() => drew('ready'));

  /**
   * THE SENTENCE UNDER THE TITLE: last night's copy and the month's allowance, said on
   * the index and on the two areas whose data it is, Billing and Backups. The phrase that needs him is red, and only
   * when something does. `health.ts` says what the answers mean.
   *
   * ONLY WHERE THE CLOUD HOLDS THIS RECORD, which is where both answers exist: a self-host has no ledger, and says
   * nothing here rather than half a sentence. Asked once for this visit to Settings, when the first of the three is
   * opened, and never waited on: the screen is drawn without it and the sentence arrives when the record answers.
   *
   * A READ THAT FAILS SAYS NOTHING AND REFUSES NOTHING. The sentence is a summary of two areas that each say their own
   * refusal in full, so its reads close as fine and never mark the screen refused.
   */
  const SAID_ON = new Set([undefined, 'billing', 'backups']);
  let copyLast = $state<CopyState>(null);
  let month = $state<UsageState>(null);
  let asked = false;

  async function readHealth(): Promise<void> {
    asked = true;
    const at = opened();
    const now = Date.now();
    const [copies, usage] = await Promise.all([
      readSnapshots(apiBase()).catch(() => null),
      readUsage((url, init) => fetch(url, init), now, '', apiBase(page.url)).catch(() => null),
    ]);
    closed(true, at);
    if (copies?.from === 'live') copyLast = lastCopy(copies.snapshots.map((c) => c.at), now);
    if (usage?.ok === true && usage.view.from === 'ledger' && usage.view.current) {
      const records = usage.view.records;
      const mine = records.find((r) => r.name === shell.index.slug) ?? (records.length === 1 ? records[0] : undefined);
      if (mine && mine.meters.length > 0) month = { resets: mine.resets, near: nearest(mine.meters), daysLeft: daysLeft(now) };
    }
  }

  $effect(() => {
    if (!SAID_ON.has(area) || !hostedHere(shell) || asked) return;
    untrack(() => void readHealth());
  });

  const health = $derived(SAID_ON.has(area) ? healthSaid(copyLast, month) : null);
</script>

{#snippet healthLine()}{#each health ?? [] as part}{#if part.needs}<span data-needs>{part.text}</span>{:else}{part.text}{/if}{/each}{/snippet}

<svelte:head><title>{titleOf(known?.label, copy.settings)}</title></svelte:head>

{#if area !== undefined && !known}
  <div class="gone">
    <Empty
      kind="error"
      heading
      title={copy.noSuch('settings area', area)}
      body={copy.theseExist('Settings areas', AREAS.map((a) => ({ address: a.id, title: a.label })))}
    >
      {#snippet actions()}<Button href="/settings">{copy.settings}</Button>{/snippet}
    </Empty>
  </div>
{:else}
<!-- AN AREA'S HEAD LINKS BACK TO THE INDEX: the kicker at 1440, the back link in the phone's bar. The
     index's own head is the one word, with nowhere above it to go back to. -->
{#if known}
  <PageHead icon="settings" kicker={copy.settings} back="/settings" title={known.label} sentence={health ? healthLine : undefined} />
{:else}
  <PageHead icon="settings" title={copy.settings} sentence={health ? healthLine : undefined} />
{/if}

<!-- `data-area` IS WHAT HIDES THE INDEX ON A PHONE while an area is open: there the area is the page,
     and the index is one back link away. `settings-place` is also the root every rule in
     `settings.css` is held under. -->
<div class="settings-place" data-area={known ? '' : undefined}>
  <div class="chooser">
    <SettingsIndex areas={AREAS} current={known?.id} />
  </div>

  {#if known}
  <div class="body">
    {#if area === 'appearance'}
      <Appearance {shell} {area} />
    {:else if area === 'keyboard'}
      <Keyboard {shell} {area} />
    {:else if area === 'navigation'}
      <Navigation {shell} {area} />
    {:else if area === 'people'}
      <People {shell} {area} />
    {:else if area === 'recovery'}
      <Recovery {shell} {area} />
    {:else if area === 'sessions'}
      <Sessions {shell} {area} />
    {:else if area === 'identity'}
      <Identity {shell} {area} />
    {:else if area === 'agents'}
      <Agents {shell} {area} />
    {:else if area === 'ingest'}
      <Ingest {shell} {area} />
    {:else if area === 'notifications'}
      <Notifications {shell} {area} />
    {:else if area === 'backups'}
      <Backups {shell} {area} />
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
  {/if}
</div>
{/if}

<style>
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
    max-inline-size: var(--page-max);
  }

  .body {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
    min-inline-size: 0;
  }

  /* The line under every area whose controls are kept on this device, and only under those. */
  .mock {
    color: var(--dim);
    font-size: var(--t-xs);
  }

  /* FROM 900PX UP, THE INDEX BESIDE THE AREA, at the rail's own width because it is the same kind of
     list. It does not stick: with its groups it is taller than a short window, and a sticky column
     taller than the window hides its own last rows until the page ends. */
  @media (width >= 900px) {
    .settings-place {
      grid-template-columns: var(--rail) minmax(0, 1fr);
      column-gap: var(--sp-7);
      align-items: start;
    }

    .body {
      gap: var(--sp-6);
    }
  }

  @media (width < 900px) {
    .settings-place {
      padding-block-end: var(--sp-8);
    }

    .settings-place[data-area] .chooser {
      display: none;
    }
  }
</style>

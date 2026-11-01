<!--
  The record's time zone, which "today", late and due days and the quiet hours are counted in: the owner picks it,
  everybody reads it. Drawn under Time and money beside the currency (audit 11-01, AP20), as sign-up shows the
  two as one "Time and money"; it stood under Notifications until 1 November.
-->
<script lang="ts">
  import { apiBase } from '$lib/at.ts';
  import { wrote } from '$lib/record/settings-write.ts';
  import { closed, opened } from '$lib/ui/screen.svelte.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { invalidateAll } from '$app/navigation';
  import { forget } from '$lib/record/boot-live.ts';
  import { learnZone, recordZone } from '$lib/record/zone.ts';
  import { createClient } from '@braindog/client';
  import { TONES, readerZone } from 'braindog-render';
  import IconWell from '$lib/ui/IconWell.svelte';
  import StateRow from './StateRow.svelte';

  let { owner }: { owner: boolean } = $props();

  const words = {
    zone: 'Time zone',
    zoneWhy: 'Today, late and due days, and the quiet hours are counted here.',
    zoneOwner: 'Only an owner can change it.',
    zoneDevice: (place: string) => `This device: ${place}`,
    zoneNow: (place: string) => `Time zone is now ${place}.`,
  } as const;

  let client: ReturnType<typeof createClient> | null = null;
  const clientOf = (): ReturnType<typeof createClient> => (client ??= createClient({ base: apiBase() }));

  /* ── the time zone (MC2) ─────────────────────────────────────────────── */

  /**
   * TODAY'S NAMES FOR THE PLACES THE RUNTIME STILL FILES UNDER OLD ONES (AL7). `Intl` lists Calcutta, Kiev and Saigon,
   * and hands them back for the new names too, so the value kept stays the runtime's and only the words change.
   */
  const NOW_CALLED: Readonly<Record<string, string>> = {
    'Asia/Calcutta': 'Kolkata',
    'Europe/Kiev': 'Kyiv',
    'Asia/Saigon': 'Ho Chi Minh City',
    'Asia/Rangoon': 'Yangon',
    'Asia/Katmandu': 'Kathmandu',
    'Africa/Asmera': 'Asmara',
    'Atlantic/Faeroe': 'Faroe Islands',
    'Pacific/Enderbury': 'Kanton',
    'Pacific/Ponape': 'Pohnpei',
    'Pacific/Truk': 'Chuuk',
    'America/Godthab': 'Nuuk',
    'America/Coral_Harbour': 'Atikokan',
    'America/Scoresbysund': 'Ittoqqortoormiit',
    'America/Indianapolis': 'Indianapolis, Indiana',
    'America/Louisville': 'Louisville, Kentucky',
  };
  /* A GROUP IS A CONTINENT OR AN OCEAN, said as one: "Indian" alone is no place, and Svalbard is filed in Europe. */
  const AREA_CALLED: Readonly<Record<string, string>> = { Indian: 'Indian Ocean', Atlantic: 'Atlantic Ocean', Pacific: 'Pacific Ocean', Arctic: 'Europe' };

  /**
   * "Africa/Cairo" as a person reads it: "Cairo", in the group "Africa". A zone inside a state or country says it, so
   * "America/North_Dakota/Center" is "Center, North Dakota" and never a bare "Center".
   */
  const placeOf = (tz: string): string => {
    if (tz === 'UTC') return 'UTC';
    const called = NOW_CALLED[tz];
    if (called) return called;
    const parts = tz.split('/').map((p) => p.replace(/_/g, ' '));
    return parts.length > 2 ? `${parts[parts.length - 1]}, ${parts[parts.length - 2]}` : (parts[parts.length - 1] ?? tz);
  };
  const areaOf = (tz: string): string => {
    if (!tz.includes('/')) return '';
    const area = tz.slice(0, tz.indexOf('/')).replace(/_/g, ' ');
    return AREA_CALLED[area] ?? area;
  };
  const zoneSaid = (tz: string): string => (areaOf(tz) ? `${placeOf(tz)} (${areaOf(tz)})` : placeOf(tz));

  /**
   * THE ZONES ON OFFER: the browser's own list, as the record checks a zone against the runtime's, grouped by area. The
   * zone held and this device's zone are always offered, though a runtime may file either under another name.
   */
  const device = readerZone();
  let zoneHeld = $state(recordZone());
  const zoneGroups = $derived.by(() => {
    let all: string[] = [];
    try {
      all = Intl.supportedValuesOf('timeZone');
    } catch {
      all = [];
    }
    const listed = new Set(all);
    for (const z of [zoneHeld, device]) if (z && z !== 'UTC' && !listed.has(z)) all = [...all, z].sort();
    const groups = new Map<string, string[]>();
    for (const z of all) {
      if (z === 'UTC' || !z.includes('/')) continue;
      const area = areaOf(z);
      groups.set(area, [...(groups.get(area) ?? []), z]);
    }
    return [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([area, zones]) => ({ area, zones: zones.sort((a, b) => placeOf(a).localeCompare(placeOf(b))) }));
  });
  let zoneBusy = $state(false);
  let zoneRefusal = $state('');

  /** A pick is the change, kept at once with Undo; the shell is asked again so every "today" counts in the new zone. */
  async function putZone(next: string, undoing = false, select?: HTMLSelectElement): Promise<void> {
    if (zoneBusy || next === '' || next === zoneHeld) return;
    const was = zoneHeld;
    zoneBusy = true;
    zoneRefusal = '';
    const at = opened();
    const out = wrote(await clientOf().setZone(next));
    closed(true, at);
    zoneBusy = false;
    if (!out.ok) {
      if (select) select.value = was;
      zoneRefusal = out.fix;
      return;
    }
    zoneHeld = learnZone(out.value.tz);
    if (!undoing) toasts.push(words.zoneNow(zoneSaid(zoneHeld)), { undo: () => void putZone(was, true) });
    forget();
    await invalidateAll();
  }

</script>

<!-- ONE ROW UNDER THE CURRENCY, DRAWN AS IT IS: its well, its name and its select at the row's end. -->
{#if owner}
  <div class="pick">
    <IconWell name="globe" />
    <label class="pick-label" for="zone-pick">{words.zone}</label>
    <select id="zone-pick" value={zoneHeld} disabled={zoneBusy} onchange={(e) => void putZone(e.currentTarget.value, false, e.currentTarget)}>
      {#if device && device !== zoneHeld}<option value={device}>{words.zoneDevice(zoneSaid(device))}</option>{/if}
      <option value="UTC">UTC</option>
      {#each zoneGroups as g (g.area)}
        <optgroup label={g.area}>{#each g.zones as z (z)}<option value={z}>{placeOf(z)}</option>{/each}</optgroup>
      {/each}
    </select>
  </div>
  {#if zoneRefusal}
    <p class="hint" role="alert"><span role="img" aria-label={TONES.bad.label}>{TONES.bad.glyph}</span> {zoneRefusal}</p>
  {/if}
  <p class="hint">{words.zoneWhy}</p>
{:else}
  <StateRow icon="globe" title={zoneSaid(zoneHeld)} line={`${words.zoneWhy} ${words.zoneOwner}`} />
{/if}

<style>
  /* AS WORDS' CURRENCY ROW IS DRAWN (`Words.svelte` `.pick`), so the two read as one tile's two rows. */
  .pick {
    display: grid;
    grid-template-columns: var(--well) minmax(0, 1fr) auto;
    align-items: center;
    column-gap: var(--sp-3);
    min-block-size: var(--row-h-2);
    max-inline-size: calc(var(--measure) + var(--sp-9));
  }

  .pick-label {
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 500;
  }

  .hint {
    margin: 0;
    max-inline-size: var(--measure);
    padding-inline-start: calc(var(--well) + var(--sp-3));
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lh-body);
  }

  @media (width < 520px) {
    .pick {
      grid-template-columns: var(--well) minmax(0, 1fr);
      row-gap: var(--sp-2);
    }

    .pick > select {
      grid-column: 2;
      min-block-size: var(--tap);
    }
  }
</style>

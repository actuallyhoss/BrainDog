<!--
  Settings > Notifications: when this product interrupts, the record's quiet hours, and whether this device is rung.
-->
<script lang="ts">
  import { apiBase } from '$lib/at.ts';
  import { copy } from '$lib/copy.ts';
  import { read } from '$lib/data/read.svelte.ts';
  import { wrote } from '$lib/record/settings-write.ts';
  import { closed, opened } from '$lib/ui/screen.svelte.ts';
  import { createClient } from '@braindog/client';
  import { TONES } from 'braindog-render';
  import Section from '$lib/ui/Section.svelte';
  import Button from '$lib/ui/Button.svelte';
  import ReadState from '$lib/ui/ReadState.svelte';
  import PushToggle from '$lib/ui/PushToggle.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import { ownsRecord } from '../../levels.ts';
  import type { AreaProps } from '../settings-state.svelte.ts';
  import StateRow from './StateRow.svelte';

  /* EVERY AREA TAKES THE SAME PROPS. This one reads who is asking, since only an owner moves the quiet hours. */
  let props: AreaProps = $props();
  const owner = $derived(ownsRecord(props.shell.me));

  let client: ReturnType<typeof createClient> | null = null;
  const clientOf = (): ReturnType<typeof createClient> => (client ??= createClient({ base: apiBase() }));

  /* THE RECORD'S WINDOW, READ FROM THE RECORD. It was a constant sentence here while the kernel held a constant; now the
     kernel holds a column, and every member reads it, so what this says is what the digest does. */
  const held = read(() => `quiet:${apiBase()}`, () => clientOf().quietHours());
  type Quiet = NonNullable<typeof held.value>;
  /* THE LAST ANSWER A WRITE GAVE, over the read, so the sentence moves the moment the record says it moved. */
  let answered = $state<Quiet | null>(null);
  const quiet = $derived(answered ?? held.value);
  const hours = $derived(quiet?.window ?? null);
  const on = $derived(hours !== null && hours !== 'off');
  const from = $derived(hours !== null && hours !== 'off' ? hours.from : '');
  const to = $derived(hours !== null && hours !== 'off' ? hours.to : '');

  /* ONE WRITE AT A TIME, so a double press or two quick picker changes send one change each and never race. */
  let busy = $state(false);
  let refusal = $state('');

  async function put(next: { from: string; to: string } | 'off' | null): Promise<void> {
    if (busy) return;
    busy = true;
    refusal = '';
    const at = opened();
    const out = wrote(await clientOf().setQuietHours(next));
    closed(true, at);
    busy = false;
    if (!out.ok) {
      refusal = out.fix;
      return;
    }
    answered = out.value;
  }

  /* A PICKER CLEARED BY HAND SENDS NOTHING: an empty time is not a time, and the record would only say so. */
  function pick(end: 'from' | 'to', e: Event): void {
    const typed = (e.currentTarget as HTMLInputElement).value;
    if (typed === '' || !on) return;
    void put(end === 'from' ? { from: typed, to } : { from, to: typed });
  }

  /* ON PUTS THE DEFAULT BACK rather than inventing a window: 22:00 to 08:00 is what every record started with. */
  const flip = (): void => void put(on ? 'off' : null);
</script>

<!--
  `09` SPECIFIES A COMPLETE MECHANISM WITH ONE SETTING, the record's quiet hours (`09 §5` rule 3). Everything else is
  still a constant, digests are pack declarations, and muting is turned off at the source: edit or retire the rule that
  raises it. So the facts below still REPORT, and the quiet hours are the one thing on this screen that is the record's
  and can be changed, by an owner. The last switch is Web Push for this device (W58-4), which is kept by the browser and
  the record, not a preference over what interrupts.
-->
<Section title={copy.whenWeInterrupt}>
  <p class="hint">{copy.batchByDefault}</p>
  <!-- WHAT INTERRUPTS, AS ROWS OF FACT: each rule this record holds about interrupting, with its glyph, its name and
       the one sentence that says it. Nothing here is a control, so no row carries one. -->
  <StateRow icon="alert" title={copy.urgentKinds} line={copy.urgentKindsAre} />
  <StateRow icon="clock" title={copy.interruptCap} line={copy.interruptCapIs} />
  <StateRow icon="bell" title={copy.unreadCount} line={copy.unreadCountIs} />
  <p class="hint after">{copy.muteAtSource}</p>
</Section>

<Section title={copy.quietHours}>
  {#if held.state === 'waiting' || ((held.state === 'refused' || held.state === 'offline') && answered === null)}
    <ReadState state={held.state} refusal={held.refusal} onretry={held.reread} />
  {:else if quiet !== null}
    {#if owner}
      <div class="quiet">
        <IconWell name="moon" />
        <p class="quiet-said" id="quiet-said">
          {#if on}
            <label class="quiet-word" for="quiet-from">{copy.quietHold}</label>
            <span class="quiet-pickers">
              <span class="field quiet-field">
                <input class="field-input quiet-time" id="quiet-from" type="time" value={from} disabled={busy} onchange={(e) => pick('from', e)} />
              </span>
              <label class="quiet-word" for="quiet-to">{copy.quietUntil}</label>
              <span class="field quiet-field">
                <input class="field-input quiet-time" id="quiet-to" type="time" value={to} disabled={busy} onchange={(e) => pick('to', e)} />
              </span>
            </span>
          {:else}
            {copy.quietOff}
          {/if}
        </p>
        <button
          type="button"
          class="switch"
          role="switch"
          aria-checked={on}
          aria-label={copy.quietHours}
          aria-describedby="quiet-said"
          disabled={busy}
          onclick={flip}><span class="switch-track"></span></button
        >
      </div>
      <div class="quiet-after">
        {#if refusal}
          <p class="quiet-refused" role="alert"><span role="img" aria-label={TONES.bad.label}>{TONES.bad.glyph}</span> {refusal}</p>
        {/if}
        <p class="hint">{copy.quietWhy}</p>
        {#if quiet.quiet !== null && on && (from !== '22:00' || to !== '08:00')}
          <Button weight="bare" disabled={busy} onclick={() => void put(null)}>{copy.quietDefault}</Button>
        {/if}
      </div>
    {:else}
      <StateRow icon="moon" title={on ? copy.quietHeld(from, to) : copy.quietOff} line={`${copy.quietWhy} ${copy.quietOwner}`} />
    {/if}
  {/if}
</Section>
<!-- THE ONE CONTROL ON THIS SCREEN THAT IS ABOUT THE DEVICE, NOT THE RECORD. It says whether this browser is rung when
     something interrupts. It draws nothing until the host hands it a key, so on a host without one it is not here. -->
<PushToggle />

<style>
  /* THE QUIET HOURS, AS ONE ROW: the well, the sentence with its two pickers inside it, and the switch at the row's end
     (design brief: "a switch sits beside its sentence", never 700px from it). The pickers sit inside the sentence, so it
     reads "Hold notices from 22:00 to 08:00". The row's measure is the one every settings row keeps, so the switch
     lands where the switches of the other areas land. */
  .quiet {
    display: grid;
    grid-template-columns: var(--well) minmax(0, 1fr) auto;
    align-items: center;
    column-gap: var(--sp-3);
    min-block-size: var(--row-h-2);
    padding-block: var(--sp-2);
    max-inline-size: calc(var(--measure) + var(--sp-9));
  }

  .quiet-said {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
    margin: 0;
    color: var(--ink);
    font-size: var(--t-row);
    font-weight: 500;
    line-height: var(--lh-body);
  }

  .quiet-pickers {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
  }

  .quiet-field {
    inline-size: auto;
  }

  .quiet-time {
    min-block-size: var(--ctl-h);
    font-variant-numeric: tabular-nums;
  }

  /* WHAT FOLLOWS THE ROW STARTS WHERE ITS SENTENCE STARTS. */
  .quiet-after {
    padding-inline-start: calc(var(--well) + var(--sp-3));
  }

  .quiet-refused {
    margin: 0 0 var(--sp-2);
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  .hint {
    margin: 0 0 var(--sp-3);
    max-inline-size: var(--measure);
    color: var(--dim);
    font-size: var(--t-sm);
    line-height: var(--lh-body);
  }

  .after {
    margin-block-start: var(--sp-3);
  }

  /* AT A PHONE'S WIDTH THE SENTENCE TAKES ITS OWN LINE AND THE TWO PICKERS SIT SIDE BY SIDE UNDER IT, each a full
     touch target, with the switch still at the end of the row rather than under the pickers. */
  @media (width < 520px) {
    .quiet {
      align-items: start;
    }

    .quiet-said {
      font-size: var(--t-md);
    }

    .quiet-pickers {
      flex-basis: 100%;
    }

    .quiet-time {
      min-block-size: var(--tap);
    }
  }
</style>

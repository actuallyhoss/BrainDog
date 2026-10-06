<!--
  Settings > Notifications: when this product interrupts, the rules that tell you things and which of them you muted,
  the record's quiet hours, and whether this device is rung.
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
  import { untrack } from 'svelte';
  import { forget } from '$lib/record/boot-live.ts';
  import { said } from '$lib/voice.svelte.ts';
  import { ownsRecord } from '../../levels.ts';
  import { actorOf, mutedAfter, mutedOf, tellsQuietly } from '../muted.ts';
  import type { AreaProps } from '../settings-state.svelte.ts';
  import StateRow from './StateRow.svelte';

  /* EVERY AREA TAKES THE SAME PROPS. This one reads who is asking, since only an owner moves the quiet hours. */
  let props: AreaProps = $props();
  const owner = $derived(ownsRecord(props.shell.me));

  /* This area's own words. Urgent is one line: what interrupts, by name, and not how the vault and the limits work. */
  const words = {
    notHereYet: 'Not on this record yet',
    urgentAre: 'Keys about to expire, runs held back, and anything a rule marks urgent.',
    tellers: 'Rules that tell you',
    /* WHERE A MUTED RULE'S NOTICES STOP SHOWING, BY THE NAMES THIS RECORD GIVES THEM: Today's feed, which the record now
       reads without them (`unmuted` in `packages/record`). It said "your digest", and no digest carries a rule's notices. */
    tellersWhy: (feed: string, home: string) => `Turn one off and its notices leave “${feed}” on ${home}. Only for you: anything urgent still reaches you.`,
    tells: (name: string) => `${name} tells you`,
    muted: 'Off for you',
  } as const;

  let client: ReturnType<typeof createClient> | null = null;
  const clientOf = (): ReturnType<typeof createClient> => (client ??= createClient({ base: apiBase() }));

  /* THE RECORD'S WINDOW, READ FROM THE RECORD. It was a constant sentence here while the kernel held a constant; now the
     kernel holds a column, and every member reads it, so what this says is what the digest does. */
  type Quiet = Extract<Awaited<ReturnType<ReturnType<typeof createClient>['quietHours']>>, { ok: true }>['value'];
  /* A RECORD THAT KEEPS NO QUIET HOURS HERE IS AN ANSWER, NOT A FAILURE: `NOT_IN_THIS_BUILD` says so in the record's own
     sentence, which is drawn as a row the way Backups draws a host that keeps no copies, and the screen is not refused
     for a setting this record does not have. */
  const held = read<Quiet | { unserved: string }>(
    () => `quiet:${apiBase()}`,
    async () => {
      const out = await clientOf().quietHours();
      if (!out.ok && 'refusal' in out && out.refusal.code === 'NOT_IN_THIS_BUILD') return { ok: true as const, value: { unserved: out.refusal.fix } };
      return out;
    },
  );
  /* THE LAST ANSWER A WRITE GAVE, over the read, so the sentence moves the moment the record says it moved. */
  let answered = $state<Quiet | null>(null);
  const kept = $derived(held.value !== null && 'unserved' in held.value ? null : held.value);
  const unserved = $derived(held.value !== null && 'unserved' in held.value ? held.value.unserved : null);
  const quiet = $derived(answered ?? kept);
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

  /* ── the rules that tell you ─────────────────────────────────────────────
     ONE QUIET SWITCH A RULE, AND ONLY FOR A RULE THAT TELLS YOU SOMETHING: a rule with a `notify` step that is not
     urgent, read off the automations this person may read (`lib/flow/source.ts`), each body asked for once. Off puts the
     rule in this person's `notify.muted`, through the same `setPref` Navigation writes, so its notices leave their
     digest and nobody else's; anything urgent still reaches them. A record with no such rule draws no section. */
  type Teller = { actor: string; name: string };
  let tellers = $state<Teller[]>([]);
  /** This person's muted rules: the shell's answer, then what the last switch kept. */
  let switched = $state<string[] | null>(null);
  const muted = $derived(switched ?? mutedOf((props.shell.me as { prefs?: Record<string, unknown> }).prefs?.['notify.muted']));
  let muting = $state(false);
  let muteRefusal = $state('');

  async function readTellers(): Promise<void> {
    const m = await import('$lib/flow/source.ts');
    const at = opened();
    const out = await m.openAutomations((url, init) => fetch(url, init), apiBase()).catch(() => null);
    const rows = out?.first.ok ? out.first.value.filter((r) => r.enabled) : [];
    const read = await Promise.all(
      rows.map(async (r) => {
        const one = await out!.source.automation(r.id).catch(() => null);
        return one?.ok && tellsQuietly(one.value.body) ? [{ actor: actorOf(r.id), name: r.name }] : [];
      }),
    );
    /* A READ THAT FAILS DRAWS NO SWITCH AND REFUSES NOTHING: the switches are an extra, and the rest of the area stands. */
    closed(true, at);
    tellers = read.flat();
  }

  /* ASKED ONCE FOR THIS VISIT, whatever shell comes after. */
  let toldAsked = false;
  $effect(() => {
    if (toldAsked || props.shell.refused) return;
    toldAsked = true;
    untrack(() => void readTellers());
  });

  async function mute(t: Teller): Promise<void> {
    if (muting) return;
    const was = muted;
    const next = mutedAfter(was, t.actor, was.includes(t.actor));
    muting = true;
    muteRefusal = '';
    switched = next ?? [];
    const out = await clientOf()
      .setPref('notify.muted', next)
      .catch(() => null);
    muting = false;
    if (out?.ok) {
      /* THE SHELL KEEPS THE PREFS IT BOOTED WITH, so the next screen asks the record again. */
      forget();
      return;
    }
    switched = was;
    muteRefusal = out && 'refusal' in out ? out.refusal.fix : copy.recordNotReached;
  }
</script>

<!--
  `09` SPECIFIES A COMPLETE MECHANISM WITH ONE SETTING, the record's quiet hours (`09 §5` rule 3). Everything else is
  still a constant and digests are pack declarations, so the facts below REPORT, and the quiet hours are the one thing on
  this screen that is the record's and can be changed, by an owner. A rule that tells you something has a switch of
  its own, which is this person's (`notify.muted`), not the record's. The last switch is Web Push for this device,
  which is kept by the browser and the record, not a preference over what interrupts.
-->
<Section title={copy.whenWeInterrupt}>
  <p class="hint">{copy.batchByDefault}</p>
  <!-- WHAT INTERRUPTS, AS ROWS OF FACT: each rule this record holds about interrupting, with its glyph, its name and
       the one sentence that says it. Nothing here is a control, so no row carries one. -->
  <StateRow icon="alert" title={copy.urgentKinds} line={words.urgentAre} />
  <StateRow icon="clock" title={copy.interruptCap} line={copy.interruptCapIs} />
  <StateRow icon="bell" title={copy.unreadCount} line={copy.unreadCountIs} />
</Section>

{#if tellers.length > 0}
  <Section title={words.tellers}>
    <p class="hint">{words.tellersWhy(said('since_away'), said('home'))}</p>
    {#each tellers as t (t.actor)}
      {@const tells = !muted.includes(t.actor)}
      <StateRow icon="bell" title={t.name} line={tells ? undefined : words.muted}>
        {#snippet action()}
          <button
            type="button"
            class="switch"
            role="switch"
            aria-checked={tells}
            aria-label={words.tells(t.name)}
            disabled={muting}
            onclick={() => void mute(t)}><span class="switch-track"></span></button
          >
        {/snippet}
      </StateRow>
    {/each}
    {#if muteRefusal}
      <p class="quiet-refused" role="alert"><span role="img" aria-label={TONES.bad.label}>{TONES.bad.glyph}</span> {muteRefusal}</p>
    {/if}
  </Section>
{/if}

<Section title={copy.quietHours}>
  {#if held.state === 'waiting' || ((held.state === 'refused' || held.state === 'offline') && answered === null)}
    <ReadState state={held.state} refusal={held.refusal} onretry={held.reread} />
  {:else if unserved !== null && answered === null}
    <div role="status"><StateRow icon="moon" title={words.notHereYet} line={unserved} /></div>
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
              <!-- "TO" AND ITS TIME ARE ONE PIECE, which wraps under the first time where the two will not fit side by side. -->
              <span class="quiet-to">
                <label class="quiet-word" for="quiet-to">{copy.quietUntil}</label>
                <span class="field quiet-field">
                  <input class="field-input quiet-time" id="quiet-to" type="time" value={to} disabled={busy} onchange={(e) => pick('to', e)} />
                </span>
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
     (a switch sits beside its sentence, never 700px from it). The pickers sit inside the sentence, so it
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

  .quiet-pickers,
  .quiet-to {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
  }

  .quiet-to {
    flex-wrap: nowrap;
  }

  .quiet-field {
    inline-size: auto;
  }

  /* A TIME IS NEVER CUT: "10:00 PM" and its picker's mark need nine characters, whatever the row has left. */
  .quiet-time {
    min-inline-size: 9ch;
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

  /* AT A PHONE'S WIDTH THE SENTENCE TAKES ITS OWN LINE AND THE TWO PICKERS SIT SIDE BY SIDE UNDER IT, each a full
     touch target, with the switch still at the end of the row rather than under the pickers. */
  @media (width < 520px) {
    .quiet {
      align-items: start;
    }

    .quiet-said {
      font-size: var(--t-md);
    }

    /* AT 320 THE TWO PICKERS AND "to" OUTRAN THE ROW, and squeezing them cut the times to "10:00 P": each picker keeps
       its nine characters, grows into what is left, and "to" with its time wraps under the first when both will not fit. */
    .quiet-pickers {
      display: flex;
      flex-basis: 100%;
      min-inline-size: 0;
    }

    .quiet-pickers > .quiet-field,
    .quiet-to {
      flex: 1 1 auto;
    }

    .quiet-to > .quiet-field {
      flex: 1 1 auto;
    }

    .quiet-time {
      inline-size: 100%;
      min-block-size: var(--tap);
    }
  }
</style>

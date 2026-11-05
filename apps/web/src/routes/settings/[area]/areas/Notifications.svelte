<!--
  Settings > Notifications: when this product interrupts, the rules that tell you things and which of them you muted,
  the record's quiet hours, and whether this device is rung. The time zone they are read in is under Time and money
  (`TimeZone.svelte`), beside the currency, as sign-up shows the two together.
-->
<script lang="ts">
  import { BASE, apiBase } from '$lib/at.ts';
  import { sendTest, testWords } from '$lib/ui/push.ts';
  import type { Call } from '$lib/ui/webhook-doors.ts';
  import { copy } from '$lib/copy.ts';
  import { askPush, inIosApp, isApp, macNotifications, pushNative, setMacNotifications } from '$lib/shell.ts';
  import { read } from '$lib/data/read.svelte.ts';
  import { wrote } from '$lib/record/settings-write.ts';
  import { closed, opened } from '$lib/ui/screen.svelte.ts';
  import { createClient } from '@braindog/client';
  import { TONES } from 'braindog-render';
  import Tile from '$lib/ui/Tile.svelte';
  import Button from '$lib/ui/Button.svelte';
  import ReadState from '$lib/ui/ReadState.svelte';
  import PushToggle from '$lib/ui/PushToggle.svelte';
  import { ownsRecord } from '../../levels.ts';
  import type { AreaProps } from '../settings-state.svelte.ts';
  import StateRow from './StateRow.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import SummariesTile from '$lib/agents/SummariesTile.svelte';
  import { KINDS, kindsOff, type PushKind } from '$lib/phone/kinds.ts';
  import { untrack } from 'svelte';

  /* EVERY AREA TAKES THE SAME PROPS. This one reads who is asking, since only an owner moves the quiet hours. */
  let props: AreaProps = $props();
  const owner = $derived(ownsRecord(props.shell.me));

  /* This area's own words. Urgent is one line: what interrupts, by name, and not how the Keychain and the limits work. */
  const words = {
    notHereYet: 'Not here yet',
    urgentAre: 'Keys about to expire, runs held back, and anything a rule marks urgent.',
    tellers: 'Rules that tell you',
    tellersWhere: 'Mute each one on its own page',
    openRules: 'Automations',
    /* WHAT INTERRUPTS, AS ONE SENTENCE (agents F20): three rows that looked like settings and changed nothing were three
       facts, so they are said once, as the facts they are. */
    interrupts: 'Urgent only, at most hourly: expiring keys, held runs, urgent rules.',
    mac: 'Mac notifications',
    macLine: 'New questions and handoffs, once each',
    /* WHAT THE APP'S OWN ASK SAYS WHEN IT ANSWERS (`askPush`). */
    pushGiven: 'This device is told when something interrupts you.',
    pushRefused: 'Notifications are off for BrainDog. Turn them on in the device’s Settings, under Notifications.',
    /* A SELF-HOST RINGS NO PHONE AND NO BROWSER (selfhost lane, 2 Nov): push goes out through BrainDog Cloud's keys, so this
       area drew nothing at all there and a colleague waited for a ring that never came. Said once, with where news lands. */
    /* ONE LINE (ui pass, 3 Nov): it was two, a paragraph explaining the server before saying where news waits. */
    selfPushLine: 'This server can’t ring phones or browsers. What’s for you waits in the bell and in Needs you.',
  } as const;

  /**
   * THE QUIET HOURS IN 24-HOUR TIME, ALWAYS (agents F20). A native time field draws in the browser's own language, so an
   * en-GB record read "09:00 PM" on an American browser. A select of the half hours says "21:00" everywhere; a time the
   * record holds off the half hour is offered too, so the select never shows a choice that is not the one kept.
   */
  const HALF_HOURS: readonly string[] = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 === 0 ? '00' : '30'}`);
  const timesWith = (kept: string): readonly string[] => (kept === '' || HALF_HOURS.includes(kept) ? HALF_HOURS : [...HALF_HOURS, kept].sort());

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

  /* THE "MAC NOTIFICATIONS" SWITCH: on by default in the app, off in a browser, kept on this device (`shell.ts`). */
  let mac = $state(macNotifications());
  const flipMac = (): void => {
    mac = !mac;
    setMacNotifications(mac);
  };

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
    const typed = (e.currentTarget as HTMLSelectElement).value;
    if (typed === '' || !on) return;
    void put(end === 'from' ? { from: typed, to } : { from, to: typed });
  }

  /* ON PUTS THE DEFAULT BACK rather than inventing a window: 21:00 to 08:00 is what a record holds until somebody sets one. */
  const flip = (): void => void put(on ? 'off' : null);

  /* SEND A TEST: a person proves their phone rings, on their own press, so a dead subscription is found now
     and not when a real notice never arrives. The record rings every device of theirs and says how many; a press
     inside a minute is its `RATE_LIMITED`, whose `fix` already says when the next may go.

     DRAWN ONLY WHILE THIS DEVICE IS RUNG, as `PushToggle` reads it from the registration that already exists, never
     one made by opening the screen: the toggle hands up every turn (`onchange`). */
  let rung = $state(false);
  let testing = $state(false);
  let tested = $state('');
  let testBad = $state(false);

  /* THE TOGGLE SAYS WHEN IT TURNS, so the test appears the moment the switch is on and goes, with its line, when off. */
  const turned = (v: boolean) => {
    rung = v;
    if (!v) tested = '';
  };

  /* ── WHAT RINGS: one switch per kind of push (`lib/phone/kinds.ts`), this person's own and on every phone of theirs
     (`push.off`). Drawn with the test, while this device is rung, since a switch over pushes nothing receives is a
     control that writes nothing anybody would notice. Kept at once, and put back with the record's sentence if refused. */
  /* WHERE THE SWITCHES START, read once: after that the switch is the truth, until the next visit reads `boot` again. */
  let off = $state<PushKind[]>(untrack(() => kindsOff(props.shell.me?.prefs?.['push.off'])));
  let kindLine = $state('');
  async function flipKind(kind: PushKind): Promise<void> {
    const was = off;
    off = off.includes(kind) ? off.filter((k) => k !== kind) : [...off, kind];
    kindLine = '';
    const out = await clientOf()
      .setPref('push.off', off.length === 0 ? null : off)
      .catch(() => null);
    if (out?.ok) return;
    off = was;
    kindLine = out && 'refusal' in out ? out.refusal.fix : copy.recordNotReached;
  }

  /* IN AN APP THAT ASKS ITSELF (`pushNative`, `shell.ts`): the turn-on press is the app's own notification permission,
     never the web's subscription, which a web view cannot keep. Where the app says it was given, the test and the kinds
     are drawn as they are for a rung browser; where it says nothing, the line stays as it was. */
  const native = pushNative();
  let nativeBusy = $state(false);
  let nativeLine = $state('');
  async function turnOnNative(): Promise<void> {
    if (nativeBusy) return;
    nativeBusy = true;
    const given = await askPush();
    nativeBusy = false;
    if (given === null) return;
    turned(given);
    nativeLine = given ? words.pushGiven : words.pushRefused;
  }

  async function test() {
    if (testing) return;
    testing = true;
    const out = await sendTest(clientOf().call as unknown as Call);
    tested = out.kind === 'sent' || out.kind === 'denied' || out.kind === 'failed' ? out.line : 'fix' in out ? out.fix : '';
    testBad = out.kind !== 'sent';
    testing = false;
  }
</script>

<!--
  `09` SPECIFIES A COMPLETE MECHANISM WITH ONE SETTING, the record's quiet hours (`09 §5` rule 3). Everything else is
  still a constant and digests are pack declarations, so the facts below REPORT, and the quiet hours are the one thing on
  this screen that is the record's and can be changed, by an owner. A rule that tells you something has a switch of
  its own, which is this person's (`notify.muted`), not the record's. The last switch is Web Push for this device,
  which is kept by the browser and the record, not a preference over what interrupts.
-->
<!-- THE RULES THAT TELL YOU ARE AUTOMATIONS': one row to them, where each rule's own page turns its notices off for
     you. A row under what interrupts (G6), where it stood as a tile with no heading, its line in the heading's place. -->
{#snippet toRules()}<Button weight="quiet" href="/automations">{words.openRules}</Button>{/snippet}
<!-- THE MAC APP'S OWN SWITCH, only in the Mac app: in a browser there is no Mac notification to turn on. -->
{#snippet macSwitch()}
  <button type="button" class="switch" role="switch" aria-checked={mac} aria-label={words.mac} onclick={flipMac}><span class="switch-track"></span></button>
{/snippet}
<!--
  ONE CARD OF ROWS (finish 3 Nov): what interrupts, the rules that tell you, the summaries, the quiet hours and this
  device were four cards of one fact each; they are one group, a row each, as every settings row is drawn (`StateRow`).
  No heading over it: the page is Notifications, and each row names itself.
-->
<Tile class="group">
  <StateRow icon="bell" title={copy.whenWeInterrupt} line={words.interrupts} />
  <StateRow icon="refresh" title={words.tellers} line={words.tellersWhere} action={toRules} />
  <!-- THE SUMMARY THE ROW ABOVE PROMISES: which ones this record sends, each opening its screen, or the add-on that
       sends the two a day. -->
  <div class="g-row"><SummariesTile row /></div>
  <div class="g-row">
    {#if held.state === 'waiting' || ((held.state === 'refused' || held.state === 'offline') && answered === null)}
      <ReadState state={held.state} refusal={held.refusal} onretry={held.reread} />
    {:else if unserved !== null && answered === null}
      <div role="status"><StateRow icon="moon" title={words.notHereYet} line={unserved} /></div>
    {:else if quiet !== null}
      {#if owner}
        <div class="quiet">
          <span class="quiet-icon"><IconWell name="moon" /></span>
          <span class="quiet-words">
            <span class="quiet-title">{copy.quietHours}</span>
            <span class="quiet-said" id="quiet-said">
              {#if on}
                <label class="quiet-word" for="quiet-from">{copy.quietHold}</label>
                <span class="quiet-pickers">
                  <select class="quiet-time" id="quiet-from" value={from} disabled={busy} onchange={(e) => pick('from', e)}>
                    {#each timesWith(from) as t (t)}<option value={t}>{t}</option>{/each}
                  </select>
                  <!-- "TO" AND ITS TIME ARE ONE PIECE, which wraps under the first time where the two will not fit side by side. -->
                  <span class="quiet-to">
                    <label class="quiet-word" for="quiet-to">{copy.quietUntil}</label>
                    <select class="quiet-time" id="quiet-to" value={to} disabled={busy} onchange={(e) => pick('to', e)}>
                      {#each timesWith(to) as t (t)}<option value={t}>{t}</option>{/each}
                    </select>
                  </span>
                </span>
              {:else}
                {copy.quietOff}
              {/if}
            </span>
            <span class="quiet-line">{copy.quietWhy}</span>
            {#if refusal}
              <span class="quiet-refused" role="alert"><span role="img" aria-label={TONES.bad.label}>{TONES.bad.glyph}</span> {refusal}</span>
            {/if}
            {#if quiet.quiet !== null && on && (from !== '21:00' || to !== '08:00')}
              <span><Button weight="bare" disabled={busy} onclick={() => void put(null)}>{copy.quietDefault}</Button></span>
            {/if}
          </span>
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
      {:else}
        <StateRow icon="moon" title={copy.quietHours} line={`${on ? copy.quietHeld(from, to) : copy.quietOff}. ${copy.quietWhy} ${copy.quietOwner}`} />
      {/if}
    {/if}
  </div>
  <!-- THE ONE ROW ABOUT THE DEVICE, NOT THE RECORD: whether this browser is rung when something interrupts. It draws
       nothing until the host hands it a key, so on a host without one it is not here. -->
  <div class="g-row push">
    {#if native}
      <!-- THE APP'S OWN ASK, in the web's push row's words: the permission is native's, the subscription its own. -->
      {#snippet nativeOn()}<Button weight="primary" disabled={nativeBusy} aria-busy={nativeBusy} onclick={() => void turnOnNative()}>{copy.pushTurnOn}</Button>{/snippet}
      <StateRow icon="phone" title={copy.pushTitle} line={nativeLine || copy.pushHow} action={rung ? undefined : nativeOn} />
    {:else if props.shell.host === 'self-host'}
      <StateRow icon="phone" title={copy.pushTitle} line={words.selfPushLine} />
    {:else}
      <PushToggle row host={props.shell.host} onchange={turned} />
    {/if}
    {#if rung}
      <div class="push-test">
        <Button weight="quiet" disabled={testing} onclick={() => void test()}>{testing ? testWords.pressing : testWords.send}</Button>
      </div>
    {/if}
    <!-- Always in the document: a live region inserted with its first sentence is not reliably announced. -->
    <p class="said" role="status">
      {#if rung && tested}{#if testBad}<span role="img" aria-label={TONES.bad.label}>{TONES.bad.glyph}</span> {/if}{tested}{/if}
    </p>
  </div>
  <!-- NOT IN THE IPHONE APP, whose notifications are the record's pushes (`macNotifications` in `shell.ts`). -->
  {#if isApp && !inIosApp}
    <div class="g-row"><StateRow icon="monitor" title={words.mac} line={words.macLine} action={macSwitch} /></div>
  {/if}
</Tile>
{#if rung}
  <Tile icon="phone" title={KINDS.title}>
    <p class="hint">{KINDS.how}</p>
    {#each KINDS.rows as k (k.kind)}
      {#snippet kindSwitch()}
        <button type="button" class="switch" role="switch" aria-checked={!off.includes(k.kind)} aria-label={k.title} onclick={() => void flipKind(k.kind)}><span class="switch-track"></span></button>
      {/snippet}
      <StateRow icon={k.icon} title={k.title} line={k.line} action={kindSwitch} />
    {/each}
    <p class="said" role="status" data-intent={kindLine ? 'bad' : undefined}>{kindLine}</p>
  </Tile>
{/if}

<style>
  /* THE QUIET HOURS, AS ONE ROW: the well, the sentence with its two pickers inside it, and the switch at the row's end
     (a switch sits beside its sentence, never 700px from it). The pickers sit inside the sentence, so it
     reads "Hold notices from 21:00 to 08:00". The row's measure is the one every settings row keeps, so the switch
     lands where the switches of the other areas land. */
  /* A ROW OF THE GROUP THAT IS NOT A `StateRow` (summaries, quiet hours, this device) takes the hairline a `StateRow`
     draws between two of its own, from the title's edge, with the same air each side. */
  .g-row {
    position: relative;
  }

  .g-row::before {
    content: '';
    position: absolute;
    inset-block-start: 0;
    inset-inline: calc(var(--well) + var(--sp-3)) 0;
    block-size: 1px;
    background: var(--rule);
    pointer-events: none;
  }

  .g-row:has(> :empty:only-child),
  .g-row:empty {
    display: none;
  }

  /* THE QUIET HOURS, AS ONE ROW: the well, the name, the sentence with its two pickers inside it, and the switch at the
     row's end (a switch sits beside its sentence, never 700px from it). The pickers sit inside the sentence, so it reads
     "Hold notices from 21:00 to 08:00". */
  .quiet {
    display: grid;
    grid-template-columns: var(--well) minmax(0, 1fr) auto;
    align-items: start;
    column-gap: var(--sp-3);
    min-block-size: var(--row-h-2);
    padding-block: var(--divider-space);
  }

  .quiet-icon {
    display: inline-flex;
    margin-block-start: calc((var(--lead-ui) - var(--well)) / 2);
  }

  .quiet-words {
    display: grid;
    justify-items: start;
    gap: var(--row-stack);
    min-inline-size: 0;
    max-inline-size: 75ch;
  }

  .quiet-title {
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 500;
    line-height: var(--lead-ui);
  }

  /* ITS WORDS STAND 8 UNDER THE TIME PICKERS, not 2 on their edge. */
  .quiet-line {
    margin-block-start: calc(6px * var(--dense, 1));
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  .quiet > .switch {
    align-self: center;
  }

  .quiet-said {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
    font-weight: 400;
    line-height: var(--lh-body);
  }

  /* THE LINE UNDER THE PICKERS ENDS THE TILE: its hint's 12 under it stood the tile's last line 28 off its foot. */
  .quiet-after > :last-child {
    margin-block-end: 0;
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

  /* A TIME IS NEVER CUT: "21:00" and the select's mark need eight characters, whatever the row has left. */
  @media (pointer: coarse) {
    .quiet-time.quiet-time {
      min-block-size: var(--tap);
    }
  }

  /* AT 320 THE LINE TAKES TWO: nine characters of time and the word "to" outran it by 13px. */
  @media (width < 360px) {
    .quiet-pickers.quiet-pickers {
      flex-wrap: wrap;
    }

    .quiet-pickers.quiet-pickers > .quiet-time,
    .quiet-pickers.quiet-pickers > .quiet-to {
      flex: 1 1 100%;
    }
  }

  .quiet-time {
    min-inline-size: 10ch;
    min-block-size: var(--ctl-h);
    padding: 0 var(--sp-2);
    background: var(--tile);
    border: 1px solid var(--switch-off);
    border-radius: var(--r-ctl);
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-body);
    font-variant-numeric: tabular-nums;
  }

  /* THE DEVICE'S ROW, gone where the toggle drew nothing (a host with no key) and nothing else stands in it. */
  .push:not(:has(.push-row, .state-row)) {
    display: none;
  }

  .push-test {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    margin-block: 0 var(--sp-2);
    padding-inline-start: calc(var(--well) + var(--sp-3));
  }

  .said {
    margin: 0 0 var(--sp-2);
    padding-inline-start: calc(var(--well) + var(--sp-3));
    max-inline-size: 75ch;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  .said:empty {
    margin: 0;
  }

  /* WHAT FOLLOWS THE ROW STARTS WHERE ITS SENTENCE STARTS. */
  .quiet-refused {
    margin: 0 0 var(--sp-2);
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  .hint {
    margin: 0 0 var(--sp-3);
    max-inline-size: 75ch;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  /* AT A PHONE'S WIDTH THE SENTENCE TAKES ITS OWN LINE AND THE TWO PICKERS SIT SIDE BY SIDE UNDER IT, each a full
     touch target, with the switch still at the end of the row rather than under the pickers. */
  @media (width < 520px) {
    .quiet {
      align-items: start;
    }

    /* THE SWITCH STAYS ON THE NAME'S LINE, and the sentence and its pickers take the row's width under it. */
    .quiet-words {
      grid-column: 2 / 4;
      grid-row: 1;
      justify-items: stretch;
    }

    .quiet > .switch {
      grid-column: 3;
      grid-row: 1;
      align-self: start;
    }

    .quiet-said {
      font-size: var(--fs-body);
    }

    /* AT 320 THE TWO PICKERS AND "to" OUTRAN THE ROW, and squeezing them cut the times to "10:00 P": each picker keeps
       its nine characters, grows into what is left, and "to" with its time wraps under the first when both will not fit. */
    /* ONE LINE, TWO EQUAL PICKERS: "21:00 to 08:00" read as two rows of two widths when each picker took the row. Each
       keeps nine characters, so at 320 the times are never cut. */
    .quiet-pickers {
      display: flex;
      flex-basis: 100%;
      flex-wrap: nowrap;
      min-inline-size: 0;
    }

    .quiet-pickers > .quiet-time,
    .quiet-to {
      flex: 1 1 0;
      min-inline-size: 0;
    }

    .quiet-to > .quiet-time {
      flex: 1 1 0;
    }

    .quiet-time {
      inline-size: 100%;
      min-inline-size: 9ch;
      min-block-size: var(--tap);
    }
  }
</style>

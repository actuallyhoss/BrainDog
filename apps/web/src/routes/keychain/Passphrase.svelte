<!--
  The keychain password: its switch, the honest trade it makes, and the two sheets that turn it on and off
  (`12 §6`, "The optional second factor").

  THE CONSEQUENCE SITS WITH THE SWITCH, NOT BEHIND IT. `12 §6` asks for the trade "stated in the UI rather than in a
  whitepaper" and offered "with the consequence in the same sentence as the switch", so the table is always drawn, the
  switch's own line says what the Keychain is now, and the sheet that turns it on says the forgetting sentence again beside
  the button that does it.

  THE SWITCH NEVER FLIPS BY ITSELF. Pressing it opens the sheet; it moves only when the record answers, so a refusal
  leaves it where the Keychain is. `aria-checked` is the record's answer and never the press.

  A TYPED CONFIRMATION, because this is the one act on the screen a person cannot take back by themselves: a keychain password
  typed wrong once and never again is a Keychain nobody opens. The two fields must match before the button does anything,
  and how long a keychain password must be is the host's rule, said in the host's sentence, not a second copy of it here.

  NOTHING IS KEPT. Both fields are emptied when the sheet shuts, whatever the answer was.

  ONE ROW AT THE FOOT OF THE KEYCHAIN (agents F16): the lock in its well, "Keychain password", the line that says where it stands
  and what turning it on does ("Off. Turn it on and only you can open your keys."), and the switch at the row's end.
  The trade in full, the table and what happens to backups, is a "How it works" fold under it. With no key yet there
  is nothing to lock: the row says to add one first, and has no switch and no fold.
-->
<script lang="ts">
  import Tile from '$lib/ui/Tile.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import Button from '$lib/ui/Button.svelte';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { closed, opened } from '$lib/ui/screen.svelte.ts';
  import { confirmed, turnLock, words, type Lock, type Locker } from '$lib/record/keychain.ts';
  import PassField from './PassField.svelte';

  let {
    lock,
    client,
    keys = 1,
    onask,
    onturn,
  }: {
    lock: Lock;
    client: Locker | null;
    /** How many keys the Keychain holds: with none there is nothing to lock yet. */
    keys?: number;
    /** Ask the record where the Keychain is, once, when the switch is pressed before anything said. */
    onask?: (() => Promise<Lock>) | undefined;
    /** The Keychain after a change, or after a refusal that said where it is. */
    onturn: (lock: Lock) => void;
  } = $props();

  /* NOT ASKED YET: the page asks nothing on open, so until the switch is pressed or a key door says, the row offers to
     set a keychain password and claims neither on nor off. */
  let asking = $state(false);
  const unasked = $derived(lock.state === 'reading' && !asking && onask !== undefined);
  const local = {
    /* NOT "LOCK" (AF14): the screen's own Lock now and Lock after stood above a line saying the keys had no lock. The
       password is asked before a key opens; the lock is the screen putting every value away. */
    unasked: 'Ask for a password before any key is opened.',
    /* "SET UP", NOT "SET A KEYCHAIN PASSWORD" (ui pass, 3 Nov): the row's own title, Keychain password, is right beside it. */
    set: 'Set up',
  } as const;

  const on = $derived(lock.state === 'on');
  /* ONLY A KNOWN STATE CAN BE CHANGED: a switch pressed while the record would not say which way it is would be a guess. */
  const can = $derived(client !== null && (lock.state === 'on' || lock.state === 'off'));
  /* THE LAST BRANCH READS `fix` THROUGH `in`, because eliminating all three literals of the first variant's `state`
     does not itself narrow TypeScript to the second variant across a ternary chain; `in` does. */
  const line = $derived(
    keys === 0
      ? words.lockNoKeys
      : unasked
        ? local.unasked
      : lock.state === 'on'
        ? words.lockOn
        : lock.state === 'off'
          ? words.lockOffRow
          : lock.state === 'reading'
            ? words.lockReading
            : 'fix' in lock
              ? lock.fix
              : '',
  );

  let sheet = $state<'on' | 'off' | null>(null);
  let first = $state('');
  let again = $state('');
  let busy = $state(false);
  let said = $state('');
  const matches = $derived(confirmed(first, again));

  /* THE FIRST PRESS ASKS WHERE THE KEYCHAIN IS, then opens the sheet that changes it from there: off opens Put it on, on
     moves the switch and waits for the next press, and a Keychain that cannot have one says so on the row. */
  async function ask() {
    if (!onask || asking) return;
    asking = true;
    const now = await onask();
    asking = false;
    if (now.state === 'off' && client !== null) {
      first = '';
      again = '';
      said = '';
      sheet = 'on';
    }
  }

  function press() {
    if (!can) return;
    first = '';
    again = '';
    said = '';
    sheet = on ? 'off' : 'on';
  }

  function shut() {
    sheet = null;
    first = '';
    again = '';
    said = '';
  }

  async function go(e?: SubmitEvent) {
    e?.preventDefault();
    if (sheet === null || busy || !client) return;
    if (sheet === 'on' && !matches) {
      said = words.passDiffer;
      return;
    }
    const to = sheet;
    busy = true;
    said = '';
    const at = opened();
    const out = await turnLock(client, to, first);
    closed(true, at);
    busy = false;
    if (out.lock) onturn(out.lock);
    if (!out.ok) {
      /* A REFUSAL THAT SAYS WHERE THE KEYCHAIN IS closes the sheet, because there is nothing left to do in it; any other
         keeps the typing, and says the record's sentence under it. */
      if (out.lock) {
        toasts.push(out.fix, { intent: 'warn' });
        shut();
      } else said = out.fix;
      return;
    }
    toasts.push(out.lock.state === 'on' ? words.lockedNow : words.unlockedNow, { intent: 'good' });
    shut();
  }
</script>

<Tile data-part="passphrase">
  <div class="lock-row">
    <IconWell name="lock" size="l" />
    <span class="lock-main">
      <span class="lock-title" id="lock-title">{words.lockSwitch}</span>
      <span class="lock-line" id="lock-line" role="status" data-on={on ? '' : undefined}>{line}</span>
    </span>
    {#if keys > 0 && (unasked || asking)}
      <Button weight="quiet" disabled={asking} aria-busy={asking} onclick={() => void ask()}>{local.set}</Button>
    {:else if keys > 0 && can}
      <button
        type="button"
        class="switch"
        role="switch"
        aria-checked={on}
        aria-labelledby="lock-title"
        aria-describedby="lock-line"
        disabled={!can || busy}
        onclick={press}><span class="switch-track"></span></button
      >
    {/if}
  </div>

  {#if keys > 0}
    <details class="lock-how">
      <summary class="lock-how-head tap"><Icon name="chevron" size="s" />{words.lockHow}</summary>
      <p class="lock-text">{words.lockProtects}</p>

      <!--
        THE HONESTY TABLE, `12 §6`'s two rows. At 1440 it is a table; under 640px each row is a block with its two cells
        labelled above their values, because three columns of sentences do not fit a phone and a label before every
        value is what a row of facts is on a phone. Each label is drawn only under 640px, where the column headers are
        not, so a screen reader hears one or the other and never both.
      -->
      <table class="lock-table">
        <caption class="lock-hidden">{words.tableCaption}</caption>
        <thead>
          <tr>
            <th scope="col">{words.tableState}</th>
            <th scope="col">{words.tableReads}</th>
            <th scope="col">{words.tableForget}</th>
          </tr>
        </thead>
        <tbody>
          <tr data-now={on ? undefined : ''}>
            <th scope="row">{words.rowOff} <span class="lock-note">{words.rowOffNote}</span></th>
            <td><span class="lock-label">{words.tableReads}</span>{words.offReads}</td>
            <td><span class="lock-label">{words.tableForget}</span>{words.offForget}</td>
          </tr>
          <tr data-now={on ? '' : undefined}>
            <th scope="row">{words.rowOn}</th>
            <td><span class="lock-label">{words.tableReads}</span>{words.onReads}</td>
            <td><span class="lock-label">{words.tableForget}</span><strong class="lock-strong">{words.onForget}</strong></td>
          </tr>
        </tbody>
      </table>

      <p class="reading">{words.backups}</p>
    </details>
  {/if}
</Tile>

<Sheet
  open={sheet !== null}
  title={sheet === 'off' ? words.turnOffTitle : words.turnOnTitle}
  subtitle={sheet === 'off' ? words.turnOffHint : words.turnOnHint}
  onclose={shut}
>
  <form class="lock-form" id="lock-form" onsubmit={go} novalidate>
    {#if sheet === 'on'}
      <PassField id="lock-new" label={words.passField} autocomplete="new-password" bind:value={first} />
      <PassField
        id="lock-again"
        label={words.passAgain}
        hint={words.passAgainHint}
        autocomplete="new-password"
        invalid={again !== '' && !matches}
        bind:value={again}
      />
      <p class="lock-strong">{words.passForget}</p>
      <p class="lock-text">{words.backups}</p>
    {:else}
      <PassField id="lock-old" label={words.passField} autocomplete="current-password" bind:value={first} />
    {/if}
    {#if said}<p class="lock-bad" role="status">{said}</p>{/if}
  </form>
  {#snippet footer()}
    <Button weight="quiet" onclick={shut}>{words.cancel}</Button>
    <Button weight="primary" type="submit" form="lock-form" disabled={busy || (sheet === 'on' ? !matches : first === '')}>
      {sheet === 'off' ? (busy ? words.turningOff : words.turnOff) : busy ? words.turningOn : words.turnOn}
    </Button>
  {/snippet}
</Sheet>

<style>
  /* THE ROW: the well, the name over the line that says where it stands, and the switch at the tile's own edge. */
  .lock-row {
    display: grid;
    grid-template-columns: var(--well-l) minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--sp-3);
  }

  .lock-main {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-inline-size: 0;
  }

  .lock-title {
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 500;
    line-height: 20px;
  }

  .lock-line {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: 18px;
  }

  .lock-line[data-on] {
    color: var(--ink-2);
  }

  /* HOW IT WORKS, FOLDED: a chevron that turns, lined up with the row's words. */
  .lock-how {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    padding-inline-start: calc(var(--well-l) + var(--sp-3));
  }

  .lock-how-head {
    display: flex;
    align-items: center;
    gap: var(--sp-1);
    inline-size: fit-content;
    min-block-size: var(--ctl-h-sm);
    color: var(--ink);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
    font-weight: 500;
    list-style: none;
    cursor: pointer;
  }

  .lock-how-head::-webkit-details-marker {
    display: none;
  }

  .lock-how-head :global(.icon) {
    color: var(--ink-3);
    transition: rotate var(--d-state) var(--ease-out);
  }

  .lock-how[open] > .lock-how-head :global(.icon) {
    rotate: 90deg;
  }

  .lock-how[open] > :not(summary) {
    margin-block-start: var(--sp-3);
  }

  @media (prefers-reduced-motion: reduce) {
    .lock-how-head :global(.icon) {
      transition: none;
    }
  }

  @media (width < 640px) {
    .lock-how {
      padding-inline-start: 0;
    }

    /* A BUTTON TOO WIDE FOR THE ROW'S END GOES UNDER THE WORDS, so the line is not squeezed into a column a word wide.
       The switch is narrow and stays at the end. */
    .lock-row > :global(.btn) {
      grid-column: 2 / -1;
      justify-self: start;
    }
  }

  .lock-text,
  .reading {
    margin: 0;
    max-inline-size: var(--measure);
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: 20px;
  }

  .reading {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: 18px;
  }

  .lock-strong {
    margin: 0;
    color: var(--ink);
    font-weight: 600;
  }

  .lock-bad {
    margin: 0;
    color: var(--red);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  .lock-hidden {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /* A TABLE WITH NO BOX: the tile is the surface, hairlines part the rows, and the row the Keychain is in now reads in ink
     while the other steps back to the second ink. */
  .lock-table {
    inline-size: 100%;
    border-collapse: collapse;
    font-size: var(--fs-meta);
    line-height: 18px;
    font-variant-numeric: tabular-nums;
  }

  .lock-table th,
  .lock-table td {
    padding-block: var(--sp-2);
    padding-inline: 0 var(--sp-3);
    color: var(--ink-2);
    text-align: start;
    vertical-align: top;
  }

  .lock-table thead th {
    padding-block-start: 0;
    color: var(--ink-3);
    font-weight: 500;
  }

  .lock-table tbody th {
    color: var(--ink-2);
    font-weight: 500;
    white-space: nowrap;
  }

  .lock-table tbody tr {
    border-block-start: 1px solid var(--rule);
  }

  .lock-table tbody tr[data-now] :is(th, td) {
    color: var(--ink);
  }

  .lock-note {
    color: var(--ink-3);
    font-weight: 400;
  }

  .lock-label {
    display: none;
  }

  .lock-form {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  .lock-form .lock-text {
    margin-block-start: var(--sp-2);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  /* UNDER 640PX, TWO LABELLED ROWS: each row a block, its state as the title, each cell its label above its value. */
  @media (width < 640px) {
    .lock-table,
    .lock-table tbody,
    .lock-table tr,
    .lock-table th,
    .lock-table td {
      display: block;
    }

    .lock-table thead {
      display: none;
    }

    .lock-table tbody tr {
      padding-block: var(--sp-3);
    }

    .lock-table th,
    .lock-table td {
      padding: 0;
    }

    .lock-table tbody th {
      font-size: var(--fs-body);
      white-space: normal;
    }

    .lock-table td {
      margin-block-start: var(--sp-2);
    }

    .lock-label {
      display: block;
      color: var(--ink-3);
      font-size: var(--fs-meta);
      line-height: var(--lead-meta);
    }
  }

</style>

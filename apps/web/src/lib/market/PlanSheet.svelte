<!--
  The one plan sheet. Every install and every update draws this: an add-on or a
  module from its record's `Diff`, a use case pack by pack, and "Update all" as every plan at once before the one press.

  THE WHOLE PLAN, READ BY `plan.ts`: what stops it first, in the danger colour and with its glyph, then each pack's part
  with a section per thing it does (adds, changes, takes away with the rows each keeps, hands on, the owner's edits it
  carries over, settings kept or reset, example rows, rules that make rows), every line it calls out with, and what it
  touches. Anything that stops it keeps Approve from being pressed, because the record would refuse it anyway.

  A `Sheet`: a drawer from 640px up, and below it a bottom sheet with its sections as rows and the buttons pinned in its
  footer. `extra` is a question the install asks beside the plan, a use case's voice, drawn above the buttons.

  THE LOOK: the sheet is a tile's surface, so nothing in it is a box. Each thing the plan does is a group
  with an icon well, its title and its count, and its rows under it with hairlines between them, the way a list sits on
  the ground. What stops it leads, with the danger well and its title in the danger ink: it is the one thing on the
  sheet that needs him before anything else can happen.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { estimateOf } from '../record/actions.ts';
  import Sheet from '../ui/Sheet.svelte';
  import Button from '../ui/Button.svelte';
  import CodeLine from '../ui/CodeLine.svelte';
  import IconWell from '../ui/IconWell.svelte';
  import type { IconName } from '../ui/icons.ts';
  import { sheetOf, words } from './plan.ts';
  import { REGISTERS } from '../record/held.ts';

  let {
    diff,
    nameOf,
    hosted,
    busy,
    onapprove,
    oncancel,
    extra,
    fieldOf,
    onrecheck,
    onkey,
    uses,
  }: {
    /** The record's `Diff`, a use case's `SharedPlan`, or an array of either for "Update all". */
    diff: unknown;
    /** A declaration id (`register.money`) or a pack id as the reader knows it. */
    nameOf: (id: string) => string;
    /** Whether this record counts runs against a monthly allowance (`hostedHere`). */
    hosted: boolean;
    busy: boolean;
    onapprove: () => void;
    oncancel: () => void;
    extra?: Snippet | undefined;
    /** A field by its label where the plan's own document knows it (a field an add-on lays on a list), before the record's. */
    fieldOf?: ((list: string, field: string) => string | null) | undefined;
    /**
     * Reads the plan again, while a key it sends is not there yet: every few seconds and when the window comes back, so
     * a key put in from a terminal lifts the stop with no press here. Left out, the sheet says to open it again.
     */
    onrecheck?: (() => Promise<void>) | undefined;
    /**
     * PUTS A KEY IN FROM THIS SHEET (audit 31 Oct f, AF3): its label, the value typed, and the Keychain password where it
     * has one. Answers the record's sentence on a refusal, `pass` when the Keychain wants its password, and `signin`, the
     * sign-in page that comes back here, when the sign-in is too old to open the keychain and no passkey could prove it
     * in place (RF3). Left out, the sheet offers only the terminal command.
     */
    onkey?: ((label: string, value: string, passphrase: string) => Promise<{ ok: true } | { ok: false; fix: string; pass?: boolean; signin?: string }>) | undefined;
    /**
     * WHAT IT WILL USE OF YOURS, in plain words (`asks.ts`): the lists, figures and pages it reads or changes that are not
     * its own. Approving the plan is agreeing to these; it can reach nothing else. Left out or empty, nothing is drawn.
     */
    uses?: readonly string[] | undefined;
  } = $props();

  /* WHAT IS TYPED FOR EACH MISSING KEY, never kept past the sheet: emptied as it is sent, whatever comes back (RF4), as
     the Keychain password is. A refusal asks for it again, typed afresh; a stale sign-in proved again in place is sent
     the same value by `onkey` itself, so nothing here holds it for the retry. */
  let keyValues = $state<Record<string, string>>({});
  let keySaid = $state<Record<string, string>>({});
  let keySignin = $state<Record<string, string>>({});
  let keyPass = $state('');
  let askPass = $state(false);
  let putting = $state('');
  async function putKey(e: SubmitEvent, label: string): Promise<void> {
    e.preventDefault();
    const value = keyValues[label] ?? '';
    if (!onkey || putting !== '' || value.trim() === '') return;
    putting = label;
    keySaid = { ...keySaid, [label]: '' };
    keySignin = { ...keySignin, [label]: '' };
    keyValues = { ...keyValues, [label]: '' };
    const pass = keyPass;
    keyPass = '';
    try {
      const out = await onkey(label, value, pass);
      if (out.ok) {
        askPass = false;
        await onrecheck?.();
      } else {
        if (out.pass) askPass = true;
        keySaid = { ...keySaid, [label]: out.fix };
        if (out.signin) keySignin = { ...keySignin, [label]: out.signin };
      }
    } finally {
      putting = '';
    }
  }

  /* A FIELD BY THE LABEL THE RECORD SHOWS, where the browser holds its list; `sheetOf` reads the id as words otherwise. */
  const sheet = $derived(sheetOf(diff, nameOf, (list, field) => fieldOf?.(list, field) ?? REGISTERS[list]?.fields.find((f) => f.id === field)?.label ?? null));
  const estimate = $derived(sheet ? estimateOf(sheet.callOuts, hosted) : null);
  const calls = $derived(sheet ? sheet.parts.flatMap((p) => p.calls.map((c) => ({ ...c, from: p.title }))) : []);
  const several = $derived((sheet?.parts.length ?? 0) > 1);

  let open = $state(true);

  /** How often the plan is read again while a key is missing: a terminal command takes a few seconds to type. */
  const LOOK_EVERY = 4_000;
  const waiting = $derived((sheet?.keys.length ?? 0) > 0 && onrecheck !== undefined);
  $effect(() => {
    if (!waiting || !onrecheck) return;
    const again = onrecheck;
    let reading = false;
    const look = () => {
      if (reading || document.visibilityState === 'hidden') return;
      reading = true;
      void again().finally(() => (reading = false));
    };
    const every = setInterval(look, LOOK_EVERY);
    window.addEventListener('focus', look);
    return () => {
      clearInterval(every);
      window.removeEventListener('focus', look);
    };
  });

  /** The glyph each thing a plan does is drawn with, so the sheet reads by its pictures before its words. */
  const GLYPHS: Readonly<Record<string, IconName>> = {
    adds: 'plus',
    changes: 'edit',
    retires: 'archive',
    moves: 'arrow',
    kept: 'check',
    stays: 'lock',
    extends: 'rows',
    'page-adds': 'doc',
    settings: 'settings',
    examples: 'rows',
    skills: 'skill',
    spawns: 'skill',
    interrupts: 'bell',
    worth: 'info',
    'turns-on': 'play',
  };
  const glyphOf = (key: string): IconName => GLYPHS[key] ?? 'info';
</script>

{#if sheet}
  <Sheet bind:open title={sheet.title} onclose={oncancel}>
    <div class="plan">
      {#if sheet.summary}<p class="plan-summary">{sheet.summary}</p>{/if}

      {#if sheet.stops.length + sheet.keys.length > 0}
        <section class="plan-group plan-stops" role="alert" aria-labelledby="plan-stops-h">
          <h3 class="plan-h" id="plan-stops-h"><IconWell name="alert" tone="danger" /><span class="plan-title">{words.stops}</span></h3>
          <ul class="plan-rows">
            {#each sheet.stops as stop, i (i)}<li class="plan-row"><span class="plan-text">{stop}</span></li>{/each}
            <!-- A KEY NOT IN THE KEYS YET: the sentence, the one command that puts it in, and that the sheet looks again. -->
            {#each sheet.keys as k, i (k.label)}
              <li class="plan-row plan-key">
                {#if onkey && k.command}
                  <!-- THE KEY PUT IN HERE, as the Keychain takes one (AF3): a password field, so it is not drawn while it is
                       typed, and the terminal as the second way under it. -->
                  <span class="plan-text">{words.keyHere(k.name)}</span>
                  {#if k.hint}<span class="plan-detail">{k.hint}</span>{/if}
                  <form class="plan-key-form" onsubmit={(e) => void putKey(e, k.label)} novalidate>
                    <label class="field-label" for="plan-key-{i}">{words.keyField(k.name)}</label>
                    <div class="plan-key-put">
                      <div class="field"><input class="field-input" id="plan-key-{i}" type="password" autocomplete="off" spellcheck="false" bind:value={keyValues[k.label]} /></div>
                      <Button weight="primary" type="submit" disabled={putting !== '' || (keyValues[k.label] ?? '').trim() === ''}>{putting === k.label ? words.keyAdding : words.keyAdd}</Button>
                    </div>
                    {#if askPass}
                      <label class="field-label" for="plan-key-pass-{i}">{words.keyPass}</label>
                      <div class="field"><input class="field-input" id="plan-key-pass-{i}" type="password" autocomplete="current-password" bind:value={keyPass} /></div>
                    {/if}
                    {#if keySaid[k.label]}<p class="plan-key-said" role="status">{keySaid[k.label]}</p>{/if}
                    {#if keySignin[k.label]}
                      {@const to = keySignin[k.label]!}
                      <div class="plan-key-signin"><Button weight="quiet" onclick={() => location.assign(to)}>{words.keySignIn}</Button></div>
                    {/if}
                  </form>
                  <span class="plan-detail">{words.keyTerminal}</span>
                  <CodeLine text={k.command} label={k.label} words />
                {:else}
                  <span class="plan-text">{k.line}</span>
                  {#if k.hint}<span class="plan-detail">{k.hint}</span>{/if}
                  {#if k.command}<CodeLine text={k.command} label={k.label} words />{/if}
                  <span class="plan-detail">{onrecheck ? words.keyLooking : words.keyAgain}</span>
                {/if}
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      {#each sheet.parts as part (part.key)}
        <section class="plan-part" aria-label={part.title}>
          {#if several || part.move}
            <h3 class="plan-part-h">
              {#if several}<span class="plan-part-name">{part.title}</span>{/if}
              {#if part.move}<span class="plan-move">{part.move}</span>{/if}
            </h3>
          {/if}
          {#each part.sections as s (s.key)}
            <div class="plan-group">
              <h4 class="plan-h"><IconWell name={glyphOf(s.key)} /><span class="plan-title">{s.title}</span><span class="plan-count num">{s.n ?? s.rows.length}</span></h4>
              <ul class="plan-rows">
                {#each s.rows as r, i (i)}
                  <li class="plan-row">
                    <span class="plan-text">{r.text}</span>
                    {#if r.detail}<span class="plan-detail">{r.detail}</span>{/if}
                  </li>
                {/each}
              </ul>
            </div>
          {/each}
        </section>
      {/each}

      {#if calls.length > 0}
        <section class="plan-group" aria-labelledby="plan-calls-h">
          <h3 class="plan-h" id="plan-calls-h"><IconWell name="globe" /><span class="plan-title">{words.calls}</span><span class="plan-count num">{calls.length}</span></h3>
          <ul class="plan-rows">
            {#each calls as c, i (i)}
              <li class="plan-row">
                <span class="plan-text">{c.line}{#if c.change !== 'same'}<span class="plan-change">{c.change === 'changed' ? words.callChanged : words.callNew}</span>{/if}</span>
                {#if several}<span class="plan-detail">{c.from}</span>{/if}
                {#if c.note}<span class="plan-detail">{c.note}</span>{/if}
              </li>
            {/each}
          </ul>
          {#if estimate}<p class="plan-note">{estimate}</p>{/if}
          <p class="plan-note">{words.callsNote}</p>
        </section>
      {/if}

      {#if uses && uses.length > 0}
        <section class="plan-group" aria-labelledby="plan-uses-h">
          <h3 class="plan-h" id="plan-uses-h"><IconWell name="lock" /><span class="plan-title">{words.uses}</span></h3>
          <ul class="plan-rows">
            {#each uses as line, i (i)}<li class="plan-row"><span class="plan-text">{line}</span></li>{/each}
          </ul>
          <p class="plan-note">{words.usesNote}</p>
        </section>
      {/if}

      <p class="plan-note">{words.touches}</p>

      {#if extra}<div class="plan-extra">{@render extra()}</div>{/if}
    </div>

    {#snippet footer()}
      <Button weight="primary" disabled={busy || (sheet ? sheet.stops.length + sheet.keys.length : 1) > 0} onclick={onapprove}>{sheet?.approve ?? ''}</Button>
      <Button weight="bare" disabled={busy} onclick={() => (open = false)}>{words.notNow}</Button>
    {/snippet}
  </Sheet>
{/if}

<style>
  .plan {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
    font-size: var(--fs-body);
    line-height: 20px;
  }

  .plan-summary {
    margin: 0;
    color: var(--ink-2);
  }

  /* ONE PACK'S PART OF A PLAN THAT HAS SEVERAL: its name over its groups, a hairline above every part after the first. */
  .plan-part {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
  }

  .plan-part + .plan-part {
    padding-block-start: var(--sp-4);
    border-block-start: 1px solid var(--rule);
  }

  .plan-part-h {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--sp-2);
    margin: 0;
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--fs-head);
    font-weight: 600;
    line-height: 24px;
  }

  .plan-move {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-weight: 400;
    font-variant-numeric: tabular-nums;
  }

  /* A GROUP: its heading row (a well, the title at the row size and 600, the count in the quiet ink), then its rows. */
  .plan-group {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
  }

  .plan-h {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    margin: 0 0 var(--sp-1);
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--fs-body);
    font-weight: 600;
    line-height: 20px;
  }

  .plan-title {
    min-inline-size: 0;
  }

  .plan-count {
    color: var(--ink-3);
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }

  /* WHAT STOPS IT: the danger well and the danger ink on its title. The rows stay ink, so a long refusal is read at full
     contrast rather than as a block of red. */
  .plan-stops .plan-title {
    color: var(--red);
  }

  /* THE ROWS UNDER A HEADING, set in from its edge by the well and its gap, a hairline between two. */
  .plan-rows {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    padding-inline-start: calc(var(--well) + var(--sp-3));
    list-style: none;
  }

  .plan-row {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-inline-size: 0;
    padding-block: var(--sp-2);
  }

  .plan-row + .plan-row {
    border-block-start: 1px solid var(--rule);
  }

  .plan-key {
    gap: var(--sp-2);
  }

  .plan-key-form {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  /* THE VALUE AND ITS BUTTON ON ONE LINE, the field taking what the button leaves; on a phone the button goes under. */
  .plan-key-put {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    align-items: center;
  }

  .plan-key-put .field {
    flex: 1 1 14rem;
    min-inline-size: 0;
  }

  .plan-key-said {
    margin: 0;
    color: var(--red);
    font-size: var(--fs-meta);
    line-height: 18px;
  }

  .plan-key-signin {
    display: flex;
  }

  .plan-text {
    color: var(--ink);
    overflow-wrap: anywhere;
  }

  .plan-detail {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: 18px;
    overflow-wrap: anywhere;
  }

  .plan-change {
    margin-inline-start: var(--sp-2);
    color: var(--ink-2);
    font-size: var(--fs-meta);
    font-weight: 500;
  }

  .plan-note {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: 18px;
  }

  .plan-group .plan-note {
    padding-inline-start: calc(var(--well) + var(--sp-3));
  }

  .plan-extra {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    padding-block-start: var(--sp-4);
    border-block-start: 1px solid var(--rule);
  }

  /* ON A PHONE THE ROWS TAKE THE WHOLE WIDTH: the well stays at the heading, and the words under it keep the room. */
  @media (width < 640px) {
    .plan-rows,
    .plan-group .plan-note {
      padding-inline-start: 0;
    }
  }
</style>

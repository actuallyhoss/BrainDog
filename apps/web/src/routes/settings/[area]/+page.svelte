<!--
  Settings.

  The theme control is a THREE-WAY SEGMENT, not a toggle offering the opposite. The predecessor's
  had three states and a one-way UI: once a person chose light or dark, only clearing local storage
  restored "match the system". "Match the system" must stay reachable (19 §4).

  Density switches on POINTER, never on width — a small laptop window is not a phone. Width may
  change layout; only the pointer may change size (05 §6).

  And `Character keys: off` disables the entire bare-letter namespace while leaving every modifier
  chord working. It is GitHub's checkbox, and the only shipped WCAG 2.1.4 conformance mechanism
  found across eleven precedents (19 §4).
-->
<script lang="ts">
  import { titleOf } from '$lib/title.ts';
  import { page } from '$app/state';
  import * as pref from '$lib/pref.ts';
  import { ACCENTS, apply as accentApply } from '$lib/accent.ts';
  import { copy } from '$lib/copy.ts';
  import * as clipboard from '$lib/clipboard.ts';
  import type { PageDecl } from '$lib/record/schema.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import {
    AUTH_METHODS, DEPLOYMENT, DEVICES, NOW, PACKS, PAGES, PASSKEYS, PEOPLE_ACCESS,
    REGISTERS, SIGNING_KEY, SNAPSHOTS, SNAPSHOTS_KEPT, SOURCES, TOKENS, boot, pages,
  } from '$lib/record/api.ts';
  import { LEVELS, type Level, type Person, type Device } from '$lib/record/schema.ts';
  import { CODE_DIGITS, approve } from '$lib/record/device.ts';
  import { TONES, bytes, relative, since } from 'braindog-render';

  /* THE RECORD'S OWN NAME. The Danger section named it two ways in three lines — `this record` and
     `the studio` — and one of the two was a literal. */
  const RECORD = boot().index.name;
  const me = boot().me;

  /* Bytes as a person reads them — `braindog-render`'s, and it is imported rather than written here
     because it was written here, as `(bytes / 1e6).toFixed(1)`, and printed **"0.2 MB"** for all four
     snapshots of a ninety-three-row record. Four distinct copies, four identical strings, on the one
     screen whose entire job is to say which copy is which. */

  /**
   * THE CODE-ENTRY CONTROL'S STATE, and the device rows are part of it.
   *
   * `19 §2` gives this area three things and the screen had one of them. This is the second: the
   * field a person types into after `braindog runner enroll` prints six digits and the URL that
   * lands here. Everything the typing DOES lives in `device.ts`, which is a pure module `node --test`
   * can import — the four lines here are the assignment.
   *
   * `devices` starts as the seed and is not the seed: a wrong guess spends a try on every waiting
   * row, and five deny them all. That is a change to the record, so the list this page draws has to
   * be the one the attempt handed back rather than the constant it started from.
   */
  let typed = $state('');
  /* The slug, typed to confirm — `02 §9`, and the button is disabled until it matches. Its own
     state, because a field that shared the device code's would be armed by typing six digits. */
  let typedSlug = $state('');
  let devices = $state<Device[]>([...DEVICES]);
  let said = $state<{ tone: 'good' | 'bad'; line: string } | null>(null);
  let codeField = $state<HTMLInputElement | undefined>(undefined);

  /** The row's Approve, and anything else that means *the code goes here*. */
  const focusCode = () => codeField?.focus();

  /**
   * WHICH OF THE SIX STATES CARRIES A MARK, and which colour it is.
   *
   * Written once, because it was written twice — inline on the `data-intent` and again on the glyph —
   * and both copies named two of the four states that need one. `13 §5.1`: colour never carries
   * meaning alone, so a state that earns an intent earns a glyph in the same breath, and one map is
   * how they cannot drift apart.
   */
  const DEVICE_TONE: Record<string, 'good' | 'warn' | 'bad' | undefined> = {
    pending: 'warn',
    approved: 'good',
    expired: 'warn',
    denied: 'bad',
    /* WARN AND NOT BAD, because nothing went wrong that anybody has to answer for. The request was
       closed by the record after four mistyped codes; the machine asks again and it works. `bad` is
       for a refusal somebody made. */
    locked: 'warn',
  };

  /**
   * A NEW ATTEMPT CLEARS THE LAST ANSWER, and this had to be said out loud because it was not.
   *
   * `aria-invalid` and `aria-describedby` were set on submit and cleared only by the NEXT submit, so
   * the field stayed marked invalid while somebody typed the correct code into it — announcing a
   * refusal that was about a value no longer in the box.
   */
  function retype(value: string) {
    typed = value;
    said = null;
  }

  function tryCode(e: SubmitEvent) {
    e.preventDefault();
    const attempt = approve(devices, typed, NOW);
    devices = attempt.rows;
    if (attempt.result.ok) {
      const { label, reach } = { label: attempt.result.value.label, reach: attempt.result.value.reach };
      said = { tone: 'good', line: copy.approvedNow(label, copy.reachMeans[reach] ?? reach) };
      typed = '';
      return;
    }
    /* THE REFUSAL IS THE RECORD'S OWN, `fix` and all. `30 §6`'s sentences are written to be read by
       whoever hit them, so wrapping one in a friendlier apology would be replacing the useful half.
       The field KEEPS what was typed on a refusal: six digits with one wrong is a thing to correct,
       and a box that empties itself makes you read the code off the other machine again. */
    said = { tone: 'bad', line: attempt.result.refusal.fix };
  }
  import PageHead from '$lib/ui/PageHead.svelte';
  import Section from '$lib/ui/Section.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Chip from '$lib/ui/Chip.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Empty from '$lib/ui/Empty.svelte';

  /* Twelve rows with a glyph each, because this rail's own CSS says it "IS the same thing" as the
     app's rail, and the app's rail has never had a row without one. A list of twelve bare words is
     the hardest kind of nav to scan: nothing tells you where you are except reading all of them. */
  const AREAS = [
    { id: 'appearance', label: 'Appearance', icon: 'sun' },
    { id: 'identity', label: 'Identity', icon: 'people' },
    { id: 'recovery', label: 'Recovery', icon: 'key' },
    { id: 'people', label: 'People & sharing', icon: 'people' },
    { id: 'agents', label: 'Agents', icon: 'session' },
    { id: 'ingest', label: 'Ingest', icon: 'inbox' },
    { id: 'keyboard', label: 'Keyboard', icon: 'keyboard' },
    { id: 'navigation', label: 'Navigation', icon: 'rows' },
    { id: 'notifications', label: 'Notifications', icon: 'bell' },
    { id: 'backups', label: 'Backups', icon: 'archive' },
    { id: 'billing', label: 'Billing', icon: 'money' },
    { id: 'export', label: 'Export', icon: 'download' },
  ] as const;

  const area = $derived(page.params.area ?? 'appearance');

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
  const known = $derived(AREAS.find((a) => a.id === area));

  /**
   * NINE OF TWELVE AREAS WERE UNREACHABLE ON A PHONE.
   *
   * Below 900px the rail becomes a horizontal scroller — `scrollWidth 1294` inside `clientWidth
   * 358` — and nothing ever scrolled it. `scrollLeft` was 0 on every area, so the strip always read
   * "Appearance · Identity · Recovery" and a sliver of the fourth. On `/settings/billing` the
   * heading said Billing, the strip highlighted nothing, and no partial item peeked to suggest there
   * were nine more.
   *
   * `nearest` rather than `center`: on the first three areas the current one is already in view and
   * centring would scroll the list for no reason, which reads as the page moving under you.
   * `block: 'nearest'` keeps it from scrolling the PAGE to reach a strip that is already on screen.
   */
  /**
   * The areas whose controls are actually kept — measured, not assumed.
   *
   * A LIST AND NOT A PREDICATE, because there is nothing on an area to ask. `pref.ts` knows which
   * KEYS persist and this file knows which area draws which control; the join between them lives
   * nowhere, so it is written here, next to the sentence it decides. Three today. The day a fourth
   * area writes a preference this is the line that has to change, and the sentence going stale is
   * a sentence a reader can see is wrong, which is the failure that produced it.
   */
  const KEEPS = new Set(['appearance', 'keyboard', 'navigation']);

  let rail = $state<HTMLElement | undefined>(undefined);

  /**
   * AND IT RAN ONCE, WHICH IS THE BUG THE PARAGRAPH ABOVE SAYS IT FIXED.
   *
   * The effect read `rail` and nothing else. `rail` is a stable element reference, and SvelteKit
   * does not remount `[area]/+page.svelte` when only the parameter changes — so this fired at mount
   * and never again. Measured on the deployed build, phone width, tapping Billing → Export →
   * Appearance → Ingest: `scrollLeft` 0, 0, 0, 0. Calling the same body by hand on the same page
   * moved it 0 → 497, so `scrollIntoView` was never the problem; being called was. A direct load of
   * `/settings/billing` scrolled correctly, which is exactly why this survived review — the one
   * path a person tests by hand is the one path that was a mount.
   *
   * READING `area` IS THE FIX, and it has to be read INSIDE the effect: an effect tracks what it
   * touches while it runs, and a value referenced only in the comment above it is not touched. It
   * is otherwise unused here, which is why `void` says so out loud rather than leaving the next
   * reader to delete a line that looks like nothing.
   */
  $effect(() => {
    void area;
    rail
      ?.querySelector('[aria-current="page"]')
      ?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  });

  /* SET IT AND REMEMBER IT, in one call. These were two things and the second was never written:
     every preference in this product was lost on refresh, and a setting that does not survive a
     reload is a setting somebody changes once and then stops trusting. */
  const set = (key: 'scheme' | 'text' | 'density', value: string) => pref.apply(key, value);

  /* SEEDED FROM WHAT IS REMEMBERED, so the controls show the state the page is already in rather
     than the default the state happens to start at. */
  const held = pref.read();
  let scheme = $state<'light' | 'system' | 'dark'>(held.scheme ?? 'system');
  let text = $state<'sm' | 'base' | 'md'>(held.text ?? 'base');
  let density = $state<'compact' | 'comfortable' | 'roomy'>(held.density ?? 'comfortable');
  let chars = $state(held.chars ?? true);
  /* ON UNLESS SOMEBODY SAID OTHERWISE. No document states the default; `29 §3`'s triggers are
     described as firing, so on is the only reading consistent with the section. */
  let suggestPages = $state(held.suggestPages ?? true);

  let accent = $state<string | null>(held.theme ?? null);
  let accentWrong = $state<string | null>(null);

  function pickAccent(hex: string | null) {
    const out = accentApply(hex);
    if (!out.ok) {
      /* THE FLOOR IT MISSED, NOT "THAT DID NOT WORK" — AND IN THE TERMS OF THIS SCREEN. `out.refusals`
         are the theme AUTHOR's sentences: "the pair (faint on s3) is 3.61:1 in dark, it needs 4.5:1,
         move faint further from the ground". There is no control here that moves a hue, lowers a
         chroma or knows what `s3` is, so every one of them instructed an action this person cannot
         take — which is the failure `checks.ts` names in its own comment two lines above the string.
         The code is what survives the trip; the sentence is built here, where the swatch is. */
      accentWrong = copy.accentRefused(ACCENTS.find((a) => a.hex === hex)?.name ?? String(hex), out.codes);
      return;
    }
    accentWrong = null;
    accent = hex;
    toasts.push(hex ? copy.accentSet(ACCENTS.find((a) => a.hex === hex)?.name ?? hex) : copy.accentReset);
  }

  function pickScheme(v: 'light' | 'system' | 'dark') {
    scheme = v;
    /* `system` IS AN ANSWER AND NOT AN ABSENCE, so it is written down: removing the attribute
       without recording the choice would make the next visit read a stale `dark` from the cookie. */
    pref.apply('scheme', v === 'system' ? null : v);
  }

  const pen = $derived(Object.values(pages()).filter((p) => p.placed === false));

  /**
   * Put a suggested page in the rail.
   *
   * 29 §2's three tiers are derived → proposed → placed, and *"Movement is forward-only and needs a
   * user action."* This is the user action, and two rules from §4 govern what it would write: the
   * page appends AT THE END OF ITS SECTION rather than being inserted mid-list — Microsoft's
   * Personalized Menus put items at different distances down the menu each time, and Jensen Harris
   * announced the reversal in 2006 with that as the first reason — and nothing is ever placed
   * without it, because the system never writes nav order after first install (06 §3).
   *
   * IT SAID SO IN THE COMPLETED PAST TENSE AND WROTE NOTHING. The row vanished from the pen because
   * this filtered a local array; the rail reads `boot()`, which filters on the declaration's own
   * `placed` and `nav`, neither of which this could touch. So the page was back in the pen on
   * reload and had never once been in the nav. A sentence in the past tense about a thing that did
   * not happen is the worst kind of mock, because it is the kind somebody believes — and the undo
   * on the toast made it worse, by offering to reverse it.
   */
  /* AND THE CHARACTER KEYS TOO. It is the one preference that changes what the keyboard DOES, so
     forgetting it is the one somebody notices within a minute. And *Suggest new pages*, which is the
     other switch on this surface and would otherwise be the third control in this product to move a
     tick, write nothing, and come back on. */
  $effect(() => {
    pref.write({ chars, suggestPages });
  });

  /**
   * Put a suggested page in the rail.
   *
   * IT SAID `${title} is in your nav` IN THE COMPLETED PAST TENSE and nothing of the kind happened.
   * The row vanished from this list because `promote` filtered a local array; the rail reads
   * `boot()`, which filters on the declaration's own `placed` and `nav` — neither of which this
   * could touch — so the page was back in the pen on reload and never once in the nav. A sentence
   * in the past tense about a thing that did not happen is the worst kind of mock, because it is the
   * kind somebody believes.
   */
  /**
   * WHAT `invite({ person, levels, why })` WOULD WRITE, said in the words it would write it in.
   *
   * `45 §5.6`: one method does all three. It reads the old rows, deletes every `member` row for the
   * person, re-inserts from `levels`, and appends an `access.grant` per register raised or added and
   * an `access.revoke` per register lowered or removed — each carrying `why` as its note. So
   * invitation, level change and removal are not three operations with three confirmations; they are
   * one call, and `levels: []` is the removal.
   *
   * THE MOCK SAYS THE SENTENCE THAT WOULD BE WRITTEN rather than "saved". A toast reading "Saved"
   * over a call that also revokes eleven registers is the shape of thing somebody trusts once.
   */
  const levelChange = (who: Person, to: Level | null) => {
    /* `null` IS A DESTINATION AND A STARTING POINT, and the sentence has to survive both. Taking the
       record level away is `access.revoke` on `'*'` and leaves whatever exceptions they hold; going
       the other way from nothing is a grant. Comparing `LEVELS.indexOf(null)` would have made it
       `-1`, which is below `read` and therefore always a grant — the wrong verb in the event, in
       exactly the case this control was added for. */
    const from = who.level === null ? -1 : LEVELS.indexOf(who.level);
    const into = to === null ? -1 : LEVELS.indexOf(to);
    toasts.push(
      copy.notWritten(
        to === who.level
          ? `${who.name} already reaches ${to ?? 'nothing on this record'}`
          : `${who.name} would move from ${who.level ?? 'nothing'} to ${to ?? 'nothing'} across this record, with one access.${into > from ? 'grant' : 'revoke'} per list and your reason on each`,
      ),
      { intent: 'warn' },
    );
  };

  /* A RECORD KEEPS AT LEAST ONE OWNER — `LEVEL_REQUIRED`, and its fix sentence verbatim (45 §5.6).
     The check is here rather than in the control because it is a fact about the whole list. */
  const owners = $derived(PEOPLE_ACCESS.filter((p) => p.level === 'owner' && p.since).length);
  const lastOwner = (who: Person) => who.level === 'owner' && owners <= 1;

  /**
   * AND YOU CANNOT TAKE YOUR OWN OWNERSHIP AWAY FROM THIS SCREEN.
   *
   * `lastOwner` is a fact about the RECORD — how many owners exist — and never about *you*, so with
   * a second owner present every control on your own row went live, `read` included, with no
   * confirmation. The toast would have read "You would move from owner to read across this record",
   * after which you cannot reach this screen to undo it: the one action on the surface that removes
   * your own way back.
   *
   * It is a REFUSAL WITH A ROUTE, not a wall. `45 §5.6` has one method for every level change, and
   * another owner can still do this to you — which is the point of there being more than one. What
   * is refused is doing it to yourself, alone, by pressing a segment.
   */
  const self = (who: Person) => who.id === me.person;
  /** The signed-in person's own row, which is where their name and address live. */
  const mine = $derived(PEOPLE_ACCESS.find((p) => p.id === me.person));

  function promote(decl: PageDecl) {
    toasts.push(copy.notWritten(`${decl.title} would be placed at the end of its section in your nav`), { intent: 'warn' });
  }
</script>

<svelte:head><title>{titleOf(known?.label, copy.settings)}</title></svelte:head>

{#if !known}
  <div class="gone">
    <Empty
      kind="error"
      heading
      title={copy.noSuch('settings area', area)}
      body={copy.theseExist('Settings areas', AREAS.map((a) => a.label))}
    >
      {#snippet actions()}<Button href="/settings/appearance">{copy.settings}</Button>{/snippet}
    </Empty>
  </div>
{:else}
<PageHead icon="settings" kicker={copy.settings} title={known.label} />

<div class="shell">
  <nav class="areas" bind:this={rail} aria-label={copy.settings}>
    {#each AREAS as a}
      <a class="area" href="/settings/{a.id}" aria-current={a.id === area ? 'page' : undefined}>
        <Icon name={a.icon} size="s" />
        {a.label}
      </a>
    {/each}
  </nav>

  <div class="body">
    {#if area === 'appearance'}
      <!--
        THE RECORD'S OWN COLOUR. `@braindog/theme` solves an entire coherent palette from one seed
        against every floor it defines, and until now nothing called it with anything but the house
        red — so a bakery and a type foundry looked identical. The swatches are suggestions, not the
        set: any colour that passes goes in, and one that does not says which floor it missed rather
        than being quietly approximated.
      -->
      <!--
        AND EVERY ONE OF THESE SAYS WHICH IS ON, to something that is not a stylesheet.

        Fifteen buttons on this screen — six swatches and nine segments — carried `data-on` and no
        `aria-pressed`. Measured on the deployed build: `aria-pressed` was `null` on all fifteen,
        so a screen reader heard "Light button, System button, Dark button" and could not tell
        which one the record was in. `13 §5.1` is that the meaning cannot live in the styling
        alone, and the People matrix four hundred lines down cites that rule and gets it right —
        which is the tell: the fix was known here, written down here, and applied to one group.
      -->
      <Section title={copy.accentTitle}>
        <p class="hint">{copy.accentHint}</p>
        <div class="swatches" role="group" aria-label={copy.accentTitle}>
          {#each ACCENTS as a}
            <button
              type="button"
              class="swatch"
              aria-pressed={accent === a.hex}
              data-on={accent === a.hex ? '' : undefined}
              style="--swatch:{a.hex}"
              aria-label={a.name}
              onclick={() => pickAccent(a.hex)}
            >
              {#if accent === a.hex}<Icon name="check" size="s" />{/if}
            </button>
          {/each}
          <button
            type="button"
            class="swatch swatch-off"
            aria-pressed={accent === null}
            data-on={accent === null ? '' : undefined}
            onclick={() => pickAccent(null)}
          >
            {copy.accentHouse}
          </button>
        </div>
        {#if accentWrong}<p class="wrong">{accentWrong}</p>{/if}
      </Section>

      <Section title={copy.scheme}>
        <div class="segment" role="group" aria-label={copy.scheme}>
          {#each [['light', copy.schemeLight, 'sun'], ['system', copy.schemeSystem, 'monitor'], ['dark', copy.schemeDark, 'moon']] as const as [v, label, icon]}
            <button type="button" class="seg" aria-pressed={scheme === v} data-on={scheme === v ? '' : undefined} onclick={() => pickScheme(v)}>
              <Icon name={icon} size="s" />
              {label}
            </button>
          {/each}
        </div>
      </Section>

      <Section title={copy.textSize}>
        <div class="segment" role="group" aria-label={copy.textSize}>
          {#each [['sm', copy.textSmall], ['base', copy.textNormal], ['md', copy.textLarge]] as const as [v, label]}
            <button
              type="button"
              class="seg"
              aria-pressed={text === v}
              data-on={text === v ? '' : undefined}
              onclick={() => ((text = v), set('text', v))}>{label}</button
            >
          {/each}
        </div>
      </Section>

      <Section title={copy.density}>
        <div class="segment" role="group" aria-label={copy.density}>
          {#each [['compact', copy.densityCompact], ['comfortable', copy.densityComfortable], ['roomy', copy.densityRoomy]] as const as [v, label]}
            <button
              type="button"
              class="seg"
              aria-pressed={density === v}
              data-on={density === v ? '' : undefined}
              onclick={() => ((density = v), set('density', v))}>{label}</button
            >
          {/each}
        </div>
      </Section>
    {:else if area === 'keyboard'}
      <Section title={copy.characterKeys}>
        <!-- THE SENTENCE THAT SAYS WHAT THE SWITCH DOES. It was written, and allow-listed in
             `dead-copy` as *"UNBUILT — `/settings/keyboard` is a heading and two unexplained
             buttons"* — the gate knowing, in those words, that a compound noun and two buttons were
             all a reader got. `19 §4` calls this the app's WCAG 2.1.4 conformance; a switch whose
             effect nobody states is a switch nobody turns on deliberately. -->
        <p class="hint">{copy.characterKeysHint}</p>
        <div class="segment" role="group" aria-label={copy.characterKeys}>
          <button type="button" class="seg" aria-pressed={chars} data-on={chars ? '' : undefined} onclick={() => (chars = true)}>{copy.on}</button>
          <button type="button" class="seg" aria-pressed={!chars} data-on={!chars ? '' : undefined} onclick={() => (chars = false)}>{copy.off}</button>
        </div>
      </Section>
    {:else if area === 'navigation'}
      <!--
        THE SWITCH THIS AREA WAS ADDED TO HOLD, and the area shipped without it.

        `19 §2`: *"`navigation` was missing too: it holds the *Suggest new pages* switch that `29 §4`
        places there."* `29 §4` gives its shape exactly — *"one global switch, the same shape as
        `Character keys: off`"* — so it is the same control, not a new one.

        WHAT IT TURNS OFF IS THE PROPOSING, NOT THE PAGES. `29 §2`: movement is forward-only and needs
        a user action, and *"the system never writes nav order after first install"*. So off empties
        the holding pen and stops it refilling; nothing already placed moves, and nothing is lost.
        Saying that is the whole difference between a switch somebody turns off once and a switch
        somebody is afraid of.
      -->
      <Section title={copy.suggestPages}>
        <p class="hint">{copy.suggestPagesHint}</p>
        <div class="segment" role="group" aria-label={copy.suggestPages}>
          <button type="button" class="seg" aria-pressed={suggestPages} data-on={suggestPages ? '' : undefined} onclick={() => (suggestPages = true)}>{copy.on}</button>
          <button type="button" class="seg" aria-pressed={!suggestPages} data-on={!suggestPages ? '' : undefined} onclick={() => (suggestPages = false)}>{copy.off}</button>
        </div>
        <!-- `19 §3` and `29 §4` both say this belongs to the record and not to the device, and there
             is no table in `30 §1` that could hold it — `50 §10` owns the deviation. The screen says
             which it is rather than letting somebody assume the durable one. -->
        <p class="hint">{copy.perDevice}</p>
      </Section>

      <Section title={copy.suggested} count={suggestPages ? pen.length : 0}>
        {#if !suggestPages}
          <!-- NOT `no-data-yet`, WHICH WOULD BE A LIE ABOUT THE RECORD. `19 §6` separates the five
               empty states precisely so that "nothing has happened yet" and "you turned this off"
               cannot read the same. -->
          <Empty kind="cleared" title={copy.suggestOff} body={copy.suggestOffWhy} />
        {:else if pen.length === 0}
          <Empty kind="cleared" title="Nothing waiting." />
        {:else}
          <ul class="ledger">
            {#each pen as p}
              <li>
                <div class="line">
                  <span class="seq"><Icon name="doc" size="s" /></span>
                  <span class="line-main">
                    <span class="line-title">{p.title}</span>
                    <!-- `register.people` is the requirement's own qualified id. What a reader
                         wants is which of their lists it was built from. -->
                    <span class="line-detail">
                      {copy.holdingPen} Built from your {REGISTERS[String(p.requires[0] ?? '').replace('register.', '')]?.name ?? 'rows'}.
                    </span>
                  </span>
                  <span class="line-amount"></span>
                  <span class="line-when">
                    <Button weight="quiet" onclick={() => promote(p)}>Place in nav</Button>
                  </span>
                </div>
              </li>
            {/each}
          </ul>
        {/if}
      </Section>
    {:else if area === 'people'}
      <!--
        IT WAS A LIST WITH NO CONTROLS, on the screen called People & sharing.

        You could see who had access and could not change it, could not invite anybody, and could
        not take it away — one of the five areas that were "real", and the one whose whole subject
        is a thing you do. `19 §2` names it beside `recovery` as an area an earlier draft dropped.

        `45 §5.6` HAS ONE METHOD FOR ALL THREE, which is why this is one control and not three:
        `invite({ person, levels, why })` deletes the person's `member` rows and re-inserts from
        `levels`, so a level change and a removal are the same call with a different argument.
      -->
      <Section title={copy.whoCanSee} count={PEOPLE_ACCESS.length}>
        <p class="hint">{copy.accessScope}</p>
        <!-- TWO LINES PER PERSON, and not the five-column `.line` every other ledger uses.

             The control is five buttons wide and the sentence beside it is a full clause, so in one
             row of that grid the email clipped mid-address and the sentence saying what the person
             can DO was squeezed out of existence — leaving five bare ladder words as the only
             answer to the question this screen exists for. Who they are on the first line, what they
             can do on the second, and the sentence directly under the control that sets it. -->
        <ul class="whos">
          {#each PEOPLE_ACCESS as p}
            <li class="who">
              <div class="who-head">
                <!-- NO AVATAR. `13 §2.1b` gives a frozen accent to a REGISTER ROW's identity, and
                     `20 §6` puts avatar stacks on a business record in the refused column. A glyph
                     says "person" without inventing a face for one. -->
                <Icon name="people" size="s" />
                <span class="who-name">{p.name}</span>
                <!-- THE EMAIL, because that is what the invitation is bound to (12 §3) and what
                     tells two people with one name apart. And WHEN, because access with no date is
                     a list you cannot audit. -->
                <!-- AND WHETHER THEY HAVE LOOKED. `20 §6` — *"Read marks on decisions: who has
                     seen the thing that binds them"* — is the one row of its table this screen
                     could not draw: `member.seen_at` has been in the DDL since migration 0001 and
                     `members()` returns it per person, and the browser's mirror stopped one column
                     short. So the screen said what four people MAY do and nothing about whether any
                     of them had been.

                     ONLY FOR SOMEBODY WHO HAS ACCEPTED. An invitation still out has also never been
                     looked at, and saying so twice in one line is saying nothing. -->
                <span class="who-detail">
                  {p.email} · {p.since ? copy.sinceWhen(relative(p.since, NOW)) : copy.inviteOut}{#if p.since}{' · '}{p.seen ? copy.lastLooked(since(p.seen, NOW)) : copy.neverLooked}{/if}{#if p.suspended}{' · '}{copy.suspendedSince(relative(p.suspended, NOW))}{/if}
                </span>
                <span class="who-do">
                <Button
                  weight="bare"
                  tone="bad"
                  disabled={lastOwner(p) || self(p)}
                  aria-describedby={lastOwner(p) ? 'last-owner' : self(p) ? 'own-level' : undefined}
                  onclick={() =>
                    toasts.push(
                      copy.notWritten(`Every one of ${p.name}'s access rows would be removed, with one access.revoke per list`),
                      { intent: 'bad' },
                    )}
                >{copy.removeAccess}</Button>
                </span>
              </div>
              <div class="who-level">
                <!--
                  SIX OPTIONS, AND THE SIXTH IS NOT A LEVEL.

                  `member.level` is five words and `member` is a ROW that may not exist — and
                  `members.ts` records what it cost to conflate the two. `access()` first promoted a
                  scoped level to the record-wide one, so somebody invited to one list as its owner
                  owned the record; the fix then gave a scoped-only member `read`, which hands an
                  APPENDER a record-wide read, and `append`'s point is that it does not read. `null`
                  is the answer both versions were reaching for, and a control offering five words
                  could not say it.

                  It is first, not last: it is the state somebody is in before you decide anything,
                  and reading left to right the row now says *nothing on the record, then these
                  lists* — which is the sentence "invite the bookkeeper" makes.
                -->
                <div class="segment segment-sm" role="group" aria-label={copy.levelFor(p.name)}>
                  <!-- THE SIXTH OPTION IS NOT A LEVEL, AND ONLY THE COMMENT SAID SO. It rendered as
                       the first of six identical chips with the same `aria-pressed`, inside a group
                       labelled "What <name> can do" — so a screen reader heard six equivalent levels
                       and the screen showed six equivalent chips. `13 §5.1`: the meaning cannot live
                       in the styling alone. The accessible name says what it is, and the chip is set
                       apart from the ladder beside it. -->
                  {#each [null, ...LEVELS] as level}
                    <button
                      type="button"
                      class="seg"
                      class:seg-none={level === null}
                      data-on={p.level === level ? '' : undefined}
                      aria-pressed={p.level === level ? 'true' : 'false'}
                      aria-label={level === null ? copy.noRecordLevelMeans : undefined}
                      disabled={(lastOwner(p) && level !== 'owner') || (self(p) && level !== p.level)}
                      aria-describedby={lastOwner(p) && level !== 'owner'
                        ? 'last-owner'
                        : self(p) && level !== p.level
                          ? 'own-level'
                          : undefined}
                      onclick={() => levelChange(p, level)}
                    >{level ?? copy.noRecordLevel}</button>
                  {/each}
                </div>
                <!-- WHAT THE SELECTED ONE MEANS, said once, in a sentence, under the control that
                     sets it. Five ladder words with nothing explaining them is the schema's
                     vocabulary on the screen that decides who can change somebody's business. -->
                <p class="means">{p.level === null ? copy.noRecordLevelMeans : (copy.levelMeans[p.level] ?? p.level)}</p>

                <!--
                  THE EXCEPTIONS, WHICH ARE THE MATRIX.

                  `20 §1` materialises person × register × level and `19 §2` names the absence of a
                  screen for it as the reason this area was added back. Drawing the whole grid — five
                  people down, fourteen lists across — is the shape that makes a person close the
                  page: most cells are the same value, and the same value is the record level one
                  line up.

                  So the record level is the answer and these are the EXCEPTIONS to it. Somebody with
                  none has one line and nothing else, which is almost everybody; somebody with two
                  has two, named, with what they hold on each. It is the same information and it is
                  the difference between a table nobody reads and a sentence anybody can.
                -->
                {#if p.scoped.length > 0}
                  <ul class="exceptions">
                    {#each p.scoped as ex}
                      <li>
                        <span class="ex-list">{REGISTERS[ex.register]?.name ?? ex.register}</span>
                        <!-- THE LEVEL, AND THEN WHAT IT MEANS. The cell showed the sentence alone — the
                             same sentence the record level one line up already shows — so you could
                             not see at a glance whether an exception was above or below it, which is
                             the one thing a matrix is for. The word is the comparison; the sentence
                             is what the word means. -->
                        <span class="ex-word">{ex.level}</span>
                        <span class="ex-level">{copy.levelMeans[ex.level] ?? ex.level}</span>
                        <Button
                          weight="bare"
                          tone="bad"
                          onclick={() =>
                            toasts.push(
                              copy.notWritten(
                                `${REGISTERS[ex.register]?.name ?? ex.register} would go back to ${p.level === null ? 'nothing' : p.level}, with one access.revoke naming that list`,
                              ),
                              { intent: 'bad' },
                            )}
                        >{copy.removeException}</Button>
                      </li>
                    {/each}
                  </ul>
                {/if}
                <!-- `45 §5.6` HAS ONE METHOD FOR ALL OF IT: `invite` takes the record level and the
                     register map together, so adding an exception is the same call as changing a
                     level. One control, because one call.

                     IN ITS OWN ROW, because as the next sibling after the `<ul>` it floated up beside
                     the list on a wide screen and read as belonging to the first exception. -->
                <div class="ex-add">
                <Button
                  weight="bare"
                  onclick={() =>
                    toasts.push(
                      copy.notWritten(`One list would be picked, and ${p.name} given a different level on it, which takes one invite and one access.grant naming that list`),
                      { intent: 'warn' },
                    )}
                ><Icon name="plus" size="s" />{copy.addException}</Button>
                </div>
              </div>
            </li>
          {/each}
        </ul>
        <!-- `LEVEL_REQUIRED`'s own fix sentence, and it is always on screen rather than inside the
             refusal — a disabled control whose reason arrives only after you press it is a control
             that has already wasted the press. -->
        <p class="hint" id="last-owner">{copy.lastOwner}</p>
        <!-- BESIDE THE CONTROL, NOT AFTER THE PRESS, for the reason the line above it gives. -->
        <p class="hint" id="own-level">{copy.ownLevel}</p>
      </Section>

      <Section title={copy.inviteTitle}>
        <p class="hint">{copy.inviteHow}</p>
        <div class="row-actions">
          <Button
            weight="primary"
            onclick={() =>
              toasts.push(copy.notWritten('A single-use link would be sent, bound to that one address and good for 24 hours'), { intent: 'warn' })}
          ><Icon name="plus" size="s" />{copy.invitePerson}</Button>
        </div>
      </Section>

      <!-- `53 §5.8`: the owner erases a person from here, and it is the one control on this screen
           that is not about access at all — it is `02 §10`'s cascade over sixteen stores, in one
           transaction. It says which, because "erase" without a subject is a word nobody can act on. -->
      <Section title={copy.erasePerson}>
        <div class="danger">
          <p class="danger-title">{copy.eraseWhat}</p>
          <Button
            tone="bad"
            onclick={() => toasts.push(copy.notWritten('Erasing asks which person, and on what basis, before anything is removed'), { intent: 'bad' })}
          >{copy.erasePerson}</Button>
        </div>
      </Section>
    {:else if area === 'recovery'}
      <!--
        THE WAY BACK IN, and until now a dead end that said nothing about recovery.

        `19 §2`, verbatim: "`recovery` and `people & sharing` were missing from an earlier draft —
        the first left a passkey-primary product with NO DESIGNED WAY BACK IN." This build shipped
        the area and then left it saying "This area is part of the shell and is not wired in the
        mock-up", which is the same hole with a sentence in it.

        THERE IS NO ACCOUNT-RECOVERY FLOW AND THIS SCREEN DOES NOT INVENT ONE. `grep -rn "recovery
        code"` over all fifty-four documents returns nothing: the mechanism is a second passkey, and
        the fallback is the email link. Anything else here would be a control with nothing behind it
        on the one screen where that costs somebody their record.
      -->
      <Section title={copy.passkeys} count={PASSKEYS.length}>
        <p class="hint">{copy.passkeyHow}</p>
        {#if PASSKEYS.length === 0}
          <Empty kind="no-data-yet" title={copy.noPasskeys} body={copy.noPasskeysWhy(AUTH_METHODS.magic)} />
        {:else}
          <ul class="ledger">
            {#each PASSKEYS as k}
              <li>
                <div class="line">
                  <span class="seq"><Icon name="key" size="s" /></span>
                  <span class="line-main">
                    <span class="line-title">{k.label}</span>
                    <span class="line-detail">{copy.addedWhen(relative(k.added, NOW))}</span>
                  </span>
                  <span class="line-amount"></span>
                  <span class="line-when">
                    <!-- LAST USED IS THE COLUMN THAT MATTERS. A key you have not used in a year is
                         the one on the laptop you sold. -->
                    {k.lastUsed ? copy.usedWhen(relative(k.lastUsed, NOW)) : copy.neverUsed}
                    <Button
                      weight="bare"
                      tone="bad"
                      disabled={PASSKEYS.length <= 1}
                      aria-describedby={PASSKEYS.length <= 1 ? 'last-key' : undefined}
                      onclick={() => toasts.push(copy.notWritten(`${k.label} would stop being a way into this record`), { intent: 'bad' })}
                    >{copy.remove}</Button>
                  </span>
                </div>
              </li>
            {/each}
          </ul>
          {#if PASSKEYS.length <= 1}<p class="hint" id="last-key">{copy.lastPasskey}</p>{/if}
        {/if}
        <div class="row-actions">
          <Button
            weight="primary"
            onclick={() => toasts.push(copy.notWritten('Your browser would be asked for a new passkey, and this session is what proves it is you'), { intent: 'warn' })}
          ><Icon name="plus" size="s" />{copy.addPasskey}</Button>
        </div>
      </Section>

      <!-- AND THE ONE THAT IS OFFERED ONLY WHERE IT EXISTS. `49 §5.6`: on a self-host with no SMTP
           `GET /auth/methods` answers `magic: false` "so the screen never offers it". A recovery
           screen offering a link that cannot be sent is worse than one offering nothing. -->
      {#if AUTH_METHODS.magic}
        <Section title={copy.magicLink}>
          <p class="hint">{copy.magicHow}</p>
        </Section>
      {/if}

      <Section title={copy.lockout}>
        <p class="hint">{copy.lockoutHow}</p>
      </Section>
    {:else if area === 'identity'}
      <!--
        THE DOCUMENTS SPECIFY NO SCREEN HERE, and this says what the record knows rather than
        inventing controls. `identity` is named once in `19 §2`'s inventory and elaborated nowhere —
        the only one of the twelve with no downstream section — and no route in the whole surface
        changes any `person` field, so a name or email editor would be a form with nothing behind it.

        `33 §10` is the fact that makes the area make sense at all: "Login is account-level — a
        person may hold several records — so identity lives OUTSIDE the record."
      -->
      <Section title={copy.you}>
        <ul class="facts">
          <!-- THE EMAIL, NOT THE PERSON ID. It printed `you` — the schema's own id for the signed-in
               human — while `/settings/people` one click away renders the same person as "You" with
               an address and a join date. `19 §9` bans a word the schema uses about itself, and an
               address is what an invitation binds to and what identifies you across the records
               listed below. -->
          <li><span class="fact-key">{copy.signedInAs}</span><span class="fact-value">{mine?.email ?? mine?.name ?? me.person}</span></li>
          <li><span class="fact-key">{copy.onThisRecord}</span><span class="fact-value">{copy.levelMeans[me.level] ?? me.level}</span></li>
        </ul>
        <p class="hint">{copy.identityOutside}</p>
      </Section>

      <Section title={copy.yourRecords} count={me.records.length}>
        <ul class="ledger">
          {#each me.records as r}
            <li>
              <div class="line">
                <span class="seq"><Icon name="rows" size="s" /></span>
                <span class="line-main"><span class="line-title">{r.name}</span></span>
                <span class="line-amount"><span class="means">{copy.levelMeans[r.level] ?? r.level}</span></span>
                <span class="line-when">
                  {#if r.slug === boot().index.slug}{copy.thisOne}{/if}
                </span>
              </div>
            </li>
          {/each}
        </ul>
      </Section>
    {:else if area === 'agents'}
      <!--
        `12 §6.1`, and the sentence that decides the shape of this list: "ONE ROW, TWO LIVES:
        pending → approved → active." A machine asks, you approve on a device you are already
        holding, and the same row becomes the grant. "The code is not the security. What the code
        proves is that the approver is looking at the device that asked."

        AND A DENIED ROW IS KEPT. `12 §6.1` calls *"I said no to a request I did not make"* the
        single most important line this table can produce — a denial that leaves no trace is a
        break-in attempt nobody can see afterwards.
      -->
      <!--
        THE FIELD COMES FIRST, because of who is standing here.

        Four documents make `${origin}/settings/agents` the address a machine PRINTS (`33 §10`,
        `49 §5.9`, `26 §2.3`, `53 §5`), so the person arriving is holding six digits their terminal
        just showed them and looking for the box. Putting the list first would mean scrolling past
        five rows of history to reach the one control they came for.

        A `<form>` rather than a button, so Enter submits — the whole interaction is type-six-digits-
        and-go, and a control that needs the mouse for the last step of that is a control somebody
        types into and then hunts around.
      -->
      <Section title={copy.enterCode}>
        <p class="hint">{copy.enterCodeHow}</p>
        <form class="code-form" onsubmit={tryCode}>
          <label class="code-label" for="user-code">{copy.codeLabel}</label>
          <div class="code-row">
            <div class="field field-lg">
              <!--
                PASTE IS NEVER BLOCKED, and neither is the space. `12 §3` names paste as the reason
                this field satisfies WCAG 2.2's accessible-authentication criterion for free, and
                `48 §5.2` step 3 prints the code AS TWO GROUPS — `enter  314 159` — so a field that
                refused the space would be refusing the exact string it told you to read. `normalise`
                drops everything that is not a digit and truncates nothing.

                `inputmode="numeric"` for the phone keypad, `autocomplete="one-time-code"` so a
                password manager or an OS handoff can fill it, and no `maxlength`: a seven-digit
                entry is a mistake worth refusing out loud rather than silently trimming to six.
              -->
              <input
                class="field-input code-input"
                id="user-code"
                type="text"
                inputmode="numeric"
                autocomplete="one-time-code"
                autocapitalize="off"
                spellcheck="false"
                placeholder={'0'.repeat(CODE_DIGITS)}
                bind:this={codeField}
                value={typed}
                oninput={(e) => retype((e.currentTarget as HTMLInputElement).value)}
                aria-describedby="user-code-said"
                aria-invalid={said?.tone === 'bad' ? 'true' : undefined}
              />
            </div>
            <Button weight="primary" type="submit">{copy.codeGo}</Button>
          </div>
          <!--
            `13 §7`'s `role="status"`: the answer is announced where it is read, rather than as a
            toast that has gone by the time somebody using a screen reader reaches it. Its tone is
            carried by `data-intent` AND by the word itself, because `13 §5.1` forbids colour from
            carrying meaning alone.

            THE REGION IS ALWAYS IN THE DOCUMENT, EMPTY OR NOT. It was inside `{#if said}`, so the
            element and its first sentence arrived in the same paint — and a live region inserted
            together with its content is not reliably announced by any screen reader. The region has
            to be there first for a change to be a change. It takes no space while empty.
          -->
          <p class="code-said" id="user-code-said" role="status" data-intent={said?.tone}>{said?.line ?? ''}</p>
        </form>
      </Section>

      <!-- THE COUNT IS THE ROWS BENEATH IT. This counted only the ACTIVE machines and then drew all
           four — 2 over a list of four — which is the one `Section` in the product whose number and
           list disagreed, on the screen where "how many machines can act as me" is the whole
           question. A pending request and a denial are rows you are meant to see; if the heading is
           to say `active`, it has to say so in the heading.

           AND IT COUNTS `devices`, NOT `DEVICES`. The list this page draws is the one the last
           attempt handed back: five wrong codes deny every waiting row, which changes what is on the
           screen, and a heading reading the constant would go on counting a state the record left. -->
      <Section title={copy.connected} count={devices.length}>
        <p class="hint">{copy.connectedHow}</p>
        <!-- A DESIGNED EMPTY, NOT AN EMPTY `<ul>`. Four of the twelve areas rendered a heading, a
             `0`, one sentence and nothing at all — and this is one of the two where `13 §5.2`'s
             copyable agent prompt is most obviously the right thing, because the way a machine gets
             here is a command somebody runs on it. -->
        {#if devices.length === 0}
          <Empty kind="no-data-yet" title={copy.noDevices} body={copy.noDevicesWhy} agentPrompt={copy.enrollPrompt} />
        {/if}
<ul class="whos">
          {#each devices as d}
            <li class="who" data-intent={DEVICE_TONE[d.state]}>
              <div class="who-head">
                <!-- ALL FOUR TONED STATES, and it marked two. `approved` and `expired` fell through
                     to the plain session glyph with no intent, so a request that had run out of time
                     drew identically to a connected machine — and a row LOST its mark at the moment
                     you approved it, which reads as the approval having undone something. `13 §5.1`:
                     the word is the meaning and the mark is the redundancy, so both move together. -->
                {#if DEVICE_TONE[d.state]}
                  <span class="glyph" role="img" aria-label={TONES[DEVICE_TONE[d.state]!].label}
                    >{TONES[DEVICE_TONE[d.state]!].glyph}</span>
                {:else}<Icon name="session" size="s" />{/if}
                <span class="who-name">{d.name}</span>
                <!-- `since` AND NOT `relative`. These columns are instants, and `relative()` takes a
                     DAY — it is anchored on a `YYYY-MM-DD` pattern and hands back its argument when
                     the pattern misses, so every row on this screen printed
                     `2026-09-03T11:57:00.000Z`. Truncating to the day, which is what every other
                     caller does, would render a three-minute-old request and an eleven-hour-old one
                     both as *today* — on the table whose whole decision is whether ten minutes have
                     passed. -->
                <span class="who-detail">
                  {copy.deviceState[d.state]} · {copy.overSurface(d.surface)} ·
                  {d.lastSeen ? copy.usedWhen(since(d.lastSeen, NOW)) : copy.askedWhen(since(d.at, NOW))}
                </span>
                <!--
                  WHAT IT WOULD BE ALLOWED TO DO, WHICH IS THE THING BEING DECIDED.

                  `49 §5.9` step 2.3: *"the screen said what it was about to grant before the click"*.
                  The row said what was ASKING — a name, a surface, a time — and never what approving
                  it would let it do, so Approve and Deny sat under a sentence that could not tell a
                  ten-minute one-shot export from a ninety-day bearer that runs code as you.

                  And `ua` beside it, `30 §1`'s "second free-text column the approver reads",
                  attributed rather than asserted because the column is trusted for nothing. Its
                  meaning turns on the reach: for the four operation grants it is the SUBJECT the
                  command sent — what would be exported, imported or installed.
                -->
                <span class="who-detail who-reach">
                  <!-- The separator carries its own spaces. Svelte trims the leading whitespace of a
                       block, so `…{#if d.ua} ·` rendered `for ninety days· says it is …`. -->
                  {copy.reachMeans[d.reach] ?? d.reach}{#if d.ua}{' · '}{d.reach === 'login' || d.reach === 'runner'
                      ? copy.saysItIs(d.ua)
                      : copy.aboutWhat(d.ua)}{/if}
                </span>
                <span class="who-do">
                  {#if d.state === 'pending'}
                    <!--
                      IT TAKES YOU TO THE FIELD, because there is nothing else it could honestly do.
                      `12 §6.1`: *"what the code proves is that the approver is looking at the device
                      that asked"* — so a button on the row that approved without a code would be
                      approving on the strength of the request having been made, which is the whole
                      thing the flow exists to prevent.
                      It used to push a toast DESCRIBING that, which left the screen with two Approve
                      affordances: a primary one that did nothing and explained, and the real one in
                      another section. A control that names the step it cannot take should be the
                      step.
                    -->
                    <Button weight="primary" onclick={focusCode}>{copy.approve}</Button>
                    <Button
                      weight="bare"
                      tone="bad"
                      onclick={() => toasts.push(copy.notWritten('The request would be denied, and the denial kept'), { intent: 'bad' })}
                    >{copy.deny}</Button>
                  {:else if d.state === 'active'}
                    <Button
                      weight="bare"
                      tone="bad"
                      onclick={() => toasts.push(copy.notWritten(`${d.name} would stop being able to act as you`), { intent: 'bad' })}
                    >{copy.revoke}</Button>
                  {/if}
                </span>
              </div>
            </li>
          {/each}
        </ul>
      </Section>

      <!--
        THE THIRD OF THIS AREA'S THREE THINGS, and the one with no surface anywhere in the product.

        `12 §3`: *"Every token records `last_used_at` and the surface it was used from, and the app
        lists them with a revoke button. A credential you cannot see being used is a credential you
        cannot know is stolen."* The list above is the REQUEST — who asked, and when. This is the
        RESULT, and they are not the same set: a `login` grant mints a key and is itself never a
        bearer, an operation grant makes a key that lives ten minutes, and a key can outlive the row
        that made it. Nothing on any of forty-two routes answered *what can act as me right now*.

        NEVER THE KEY ITSELF. `12 §3`'s first paragraph and this product's first promise: the record
        keeps `sha256(secret)` and the secret is shown once, at the moment it is made, on the machine
        that made it. What a list can honestly hold is what the key OPENS — a name, what it can do,
        where it was last used from, and when it stops working.
      -->
      <Section title={copy.keys} count={TOKENS.length}>
        <p class="hint">{copy.keysHow}</p>
        {#if TOKENS.length === 0}
          <Empty kind="no-data-yet" title={copy.noKeys} body={copy.noKeysWhy} />
        {/if}
        <ul class="whos">
          {#each TOKENS as t}
            <!-- THE ONE NOBODY HAS EVER USED IS THE ONE TO LOOK AT, and a list that draws it exactly
                 like the other two has buried the only row that needed the reader. `13 §5.1`: the
                 tone is carried by the words `never used` as well as by the mark. -->
            <li class="who" data-intent={t.lastUsed === null ? 'warn' : undefined}>
              <div class="who-head">
                {#if t.lastUsed === null}
                  <span class="glyph" role="img" aria-label={TONES.warn.label}>{TONES.warn.glyph}</span>
                {:else}<Icon name="session" size="s" />{/if}
                <span class="who-name">{t.label}</span>
                <span class="who-detail">
                  {copy.keyCan[t.scope] ?? t.scope} · {copy.overSurface(t.surface)}
                </span>
                <!-- `since` FOR THE INSTANT AND `relative` FOR THE DAYS, and the mixture is the
                     point rather than an inconsistency: `created` and `expires` are days and
                     `lastUsed` is an instant. This row had `relative` on all three, so it printed
                     `made 4w ago · used 2026-09-03T10:00:00.000Z · ends in 8w` — the same defect the
                     commit above it was written to fix, ninety lines further down the same block,
                     found by a review rather than by me. -->
                <span class="who-detail">
                  {copy.madeWhen(relative(t.created, NOW))} ·
                  {t.lastUsed ? copy.usedWhen(since(t.lastUsed, NOW)) : copy.neverUsed} ·
                  {copy.endsWhen(relative(t.expires, NOW))}
                </span>
                <span class="who-do">
                  <Button
                    weight="bare"
                    tone="bad"
                    onclick={() => toasts.push(copy.notWritten(`${t.label} would stop working immediately, and your own session would not`), { intent: 'bad' })}
                  >{copy.revokeKey}</Button>
                </span>
              </div>
            </li>
          {/each}
        </ul>
      </Section>
    {:else if area === 'ingest'}
      <!--
        `25 §9` DRAWS THIS SCREEN, which makes it the one settings area where inventing a control is
        least excusable. Three status words, a last-run line, a next-run line, a failure line naming
        the credential by its VAULT LABEL rather than its value, and two buttons on the paused row
        only. `47 §12` gives the composition: one row per connector, from `PullResult` via the
        receipts and the schedule row.
      -->
      <Section title={copy.sources} count={SOURCES.length}>
        <p class="hint">{copy.sourcesHow}</p>
        <!-- AND THE HINT ABOVE IS ABOUT MEMBERS OF THIS SET. "A figure fed by one of these shows a
             gap…" is a sentence about connectors, on a screen with none — so the state has to say
             there are none before that line makes sense. -->
        {#if SOURCES.length === 0}
          <Empty kind="no-data-yet" title={copy.noSources} body={copy.noSourcesWhy} agentPrompt={copy.ingestPrompt} />
        {/if}
<ul class="whos">
          {#each SOURCES as src}
            <li class="who" data-intent={src.state === 'ok' ? undefined : src.state === 'paused' ? 'bad' : 'warn'}>
              <div class="who-head">
                {#if src.state === 'ok'}<Icon name="inbox" size="s" />
                {:else}
                  {@const t = src.state === 'paused' ? 'bad' : 'warn'}
                  <span class="glyph" role="img" aria-label={TONES[t].label}>{TONES[t].glyph}</span>
                {/if}
                <span class="who-name">{src.name}</span>
                <span class="who-detail">
                  {copy.sourceState[src.state]} · {copy.lastRan(relative(src.lastAt, NOW))} ·
                  {src.nextAt ? copy.nextRun(relative(src.nextAt, NOW)) : copy.noNextRun} ·
                  {copy.pointsIn(src.points)}
                </span>
                <span class="who-do">
                  {#if src.state === 'paused'}
                    <Button
                      weight="primary"
                      onclick={() => toasts.push(copy.notWritten(`${src.error?.credential ?? src.name} would be reconnected, and the schedule started again`), { intent: 'warn' })}
                    >{copy.reconnect}</Button>
                    <Button
                      weight="bare"
                      onclick={() => toasts.push(copy.notWritten(`${src.name} would run once, now`), { intent: 'warn' })}
                    >{copy.retryNow}</Button>
                  {/if}
                </span>
              </div>
              <!-- THE SERVER'S `fix` SENTENCE, VERBATIM (13 §6), ON ITS OWN LINE SO IT WRAPS.
                   In the five-column ledger it was a `.line-detail` — one line, `overflow: hidden`,
                   ellipsis — so the sentence that says what to DO about a broken connector read
                   "Reconnect the credential — the provider rejected it; the connector is…". A `fix`
                   rendered verbatim and then cut is not rendered verbatim.

                   And the credential by the LABEL the vault indexes it under. A pull failure names
                   what to reconnect; naming the value would put a secret on a settings screen. -->
              <!-- THE CREDENTIAL NAMES WHAT TO RECONNECT, WHICH ONLY AN AUTH FAILURE HAS. The
                   suffix was unconditional, so a 429 read "The provider answered 429 three times.
                   It retries on its own. — Kestrel ingest" and pointed the reader at a credential
                   that is fine. `25 §9`'s own drawn mock names one on exactly one row — the 401 —
                   and gives the failing row its try count instead. It is right for
                   `PULL_AUTH_REJECTED` and wrong for the other six codes in the family. -->
              {#if src.error}
                <p class="who-why">
                  {src.error.fix}{#if src.error.code === 'PULL_AUTH_REJECTED'}{' · '}{src.error.credential}{/if}
                </p>
              {/if}
            </li>
          {/each}
        </ul>
        <!-- `25 §9`'s own blockquote, and it outranks the screen: "every chart fed by a stale series
             shows a gap and a stale badge. A dashboard that keeps yesterday's number on screen as if
             it were today's is the failure that actually costs somebody money." -->
        <p class="hint">{copy.staleShows}</p>
      </Section>
    {:else if area === 'notifications'}
      <!--
        `09` SPECIFIES A COMPLETE MECHANISM WITH ZERO USER-CONFIGURABLE SETTINGS. Every constant is
        hard-coded, digests are pack declarations, no kernel table holds a preference and none of the
        sixty-four methods writes one. So this screen REPORTS rather than offers — and a row of
        toggles here would be four controls that write nothing, which is the failure this whole
        session has been removing.

        Muting is turned off at the source: edit or retire the rule that raises it.
      -->
      <Section title={copy.whenWeInterrupt}>
        <p class="hint">{copy.batchByDefault}</p>
        <ul class="facts">
          <li><span class="fact-key">{copy.quietHours}</span><span class="fact-value">{copy.quietHoursAre}</span></li>
          <li><span class="fact-key">{copy.urgentKinds}</span><span class="fact-value">{copy.urgentKindsAre}</span></li>
          <li><span class="fact-key">{copy.interruptCap}</span><span class="fact-value">{copy.interruptCapIs}</span></li>
          <li><span class="fact-key">{copy.unreadCount}</span><span class="fact-value">{copy.unreadCountIs}</span></li>
        </ul>
        <p class="hint">{copy.muteAtSource}</p>
      </Section>
    {:else if area === 'backups'}
      <!--
        `53 §5.4`: "Three mechanisms, one contract: nightly, sealed, thirty kept, restorable." And
        `03 §6` on why this is not the Export area: "A snapshot is not an export: it is a full copy
        … disaster recovery, not portability."
      -->
      <!-- THE COUNT IS WHAT IS KEPT, and a night that kept nothing is not one. It read "What is kept
           · 4" over three copies and a row saying *nothing kept* — counting the failure as a backup,
           which is the same class of error as hiding it. -->
      <Section title={copy.kept} count={SNAPSHOTS.filter((s) => s.failed === null).length}>
        <!-- "The 30 newest are kept" IS A SENTENCE ABOUT A LIST THAT HAS SOME. On a record whose
             first backup has not run it describes a policy over nothing, above nothing. -->
        {#if SNAPSHOTS.length === 0}
          <Empty kind="no-data-yet" title={copy.noSnapshots} body={copy.noSnapshotsWhy} />
        {:else}
        <!-- THE POLICY IS THE HOST'S, and this sentence was Cloud's schedule and the self-host's
             retention at the same time. `53 §4`: Cloud keeps *"the 30 newest dated keys plus
             `latest`"* and runs at `17 3 * * *` UTC; `49 §5.13`: a self-host keeps 30 files and runs
             at 02:00 UTC plus `hash(slug) mod 60` minutes. It said "nightly, at 03:00. The 30 newest
             are kept" on both, which is right on neither. -->
        <p class="hint">{DEPLOYMENT.kind === 'self-host' ? copy.keptSelfHost(SNAPSHOTS_KEPT) : copy.keptCloud(SNAPSHOTS_KEPT)}</p>
        {/if}
        <ul class="ledger">
          {#each SNAPSHOTS as snap}
            <li data-intent={snap.failed ? 'bad' : undefined}>
              <div class="line">
                <span class="seq">
                  {#if snap.failed}
                    <span class="glyph" role="img" aria-label={TONES.bad.label}>{TONES.bad.glyph}</span>
                  {:else}<Icon name="archive" size="s" />{/if}
                </span>
                <span class="line-main">
                  <span class="line-title">{snap.id}</span>
                  <span class="line-detail">{relative(snap.at, NOW)}</span>
                </span>
                <!-- A NIGHT THAT PRODUCED NOTHING SAYS SO, AND SAYS WHY. `12 §8`: "A backup that
                     silently gave up is worse than none" — which is the argument for these two
                     routes existing, and the list drew four identical successes. `13 §6`: the
                     record's own `note` is rendered, not a sentence written here. -->
                <span class="line-amount">
                  <span class="means">{snap.failed ? copy.snapshotFailed : copy.rowsAndSize(snap.rows, bytes(snap.bytes))}</span>
                </span>
                <span class="line-when">
                  {#if snap.failed}<span class="why-failed">{snap.failed}</span>
                  {:else}
                    <!-- `49 §5.13`: `GET /api/snapshots/:id` streams the file with
                         `Content-Disposition: attachment`. A self-host's only way back is putting a
                         copy back by hand, so the copy has to be reachable. Cloud's prefix is not
                         served to a browser, so there is nothing to offer. -->
                    {#if DEPLOYMENT.kind === 'self-host'}
                      <Button
                        weight="bare"
                        onclick={() => toasts.push(copy.notWritten(`${snap.id} would be downloaded, sealed, as it sits on disk`), { intent: 'warn' })}
                      >{copy.download}</Button>
                    {/if}
                  {/if}
                </span>
              </div>
            </li>
          {/each}
        </ul>
        <div class="row-actions">
          <Button
            weight="primary"
            onclick={() => toasts.push(copy.notWritten('A sealed copy of the whole record would be written now, and counted against the thirty'), { intent: 'warn' })}
          >{copy.snapshotNow}</Button>
        </div>
      </Section>

      <!-- `49 §8`, and it asks for exactly this: the key "is what a self-hoster must back up
           SEPARATELY — Settings → backups says so in one line." A snapshot sealed with a key that
           is only inside the snapshot is a snapshot nobody can open. -->
      <Section title={copy.theKey}>
        <p class="hint">{copy.theKeyIs}</p>
      </Section>

      <!-- `03 §6`: "PITR is Cloud-only and this is DOCUMENTED, NOT HIDDEN." `33 §9`: a self-host
           "has no PITR and does not serve `restore`". So the fact is stated where somebody would go
           looking for the control, rather than the control being drawn and then refusing. -->
      <!--
        `03 §6`: "PITR is Cloud-only and this is DOCUMENTED, NOT HIDDEN." `33 §9`: a self-host "has no
        PITR and does not serve `restore`". So the fact is stated where somebody would go looking for
        the control, rather than the control being drawn and then refusing.

        AND ON CLOUD IT IS A CONTROL. `53 §5.5(a)` puts it here by name — *"The owner, Settings →
        backups → restore to a time — `POST /api/restore { at }`"* — and this area held the sentence
        and not the button, which is the one thing a person comes to a backups screen to do.
      -->
      <Section title={copy.restore}>
        <p class="hint">{DEPLOYMENT.kind === 'self-host' ? copy.restoreSelfHost : copy.restoreCloud}</p>
        {#if DEPLOYMENT.kind !== 'self-host'}
          <ul class="facts">
            <!-- WHAT IT COSTS, BEFORE THE PRESS. `53 §5.5`: a bookmark restore rewinds the database,
                 so every write after the chosen instant is gone — and its own rollback is another
                 point in time, valid for thirty days. `45 §5.6` makes it two phases for exactly that
                 reason. A control this destructive that says nothing until afterwards is a control
                 nobody should press. -->
            <li><span class="fact-key">{copy.restoreLoses}</span><span class="fact-value">{copy.restoreLosesWhat}</span></li>
            <li><span class="fact-key">{copy.restoreBack}</span><span class="fact-value">{copy.restoreBackHow}</span></li>
          </ul>
          <div class="row-actions">
            <Button
              onclick={() => toasts.push(copy.notWritten('A time would be picked, and the record put back to it, with every write after it gone and the audit ending there plus one restore.pitr row'), { intent: 'bad' })}
            >{copy.restoreTo}</Button>
            <!-- `53 §5.5`'s precondition: *"the owner knows the last good instant — `/audit` shows
                 every write with its time"*. The control that answers it is one link away. -->
            <Button weight="bare" href="/audit">{copy.findTheMoment}</Button>
          </div>
        {/if}
      </Section>
    {:else if area === 'billing'}
      <!--
        THERE IS NOTHING TO BILL ON A SELF-HOST, and `23 §8`'s precedent for exactly this shape is
        "one line in Settings". `53 §5.10` puts the whole ladder "in the Worker and nothing in the
        record, so the record package stays billing-agnostic"; `33 §10` holds the state in the Cloud
        Directory. The area cannot simply be removed — `50 §2.2` admits the twelve of `19 §2` with
        no per-deployment conditional and `50 §13 D2` builds one artefact for both hosts — so it
        says which deployment this is and what that means.

        `ADR-059`'s line is here because it is the promise the whole product rests on and it is TRUE
        on a self-host in the strongest possible way: "At no point is export withheld."
      -->
      <Section title={copy.billing}>
        <p class="hint">{DEPLOYMENT.kind === 'self-host' ? copy.billingSelfHost : copy.billingCloud}</p>
        <div class="row-actions">
          <Button weight="quiet" href="/settings/export"><Icon name="download" size="s" />{copy.export}</Button>
        </div>
      </Section>
    {:else if area === 'export'}
      <Section title={copy.yourData}>
        <!-- THE WHOLE CONTENT OF THIS SCREEN WAS TWO DEAD BUTTONS, on the page that carries the
             product's central promise: take your record and go. They say what they would do.

             AND ONE OF THEM DESCRIBED THE WRONG FILE. It read "written to a .dog file, LINE PER
             ROW", which welds together the two containers `03 §2.1` keeps in separate columns: a
             `.dog` is a SQLite database you open with `sqlite3` and no SDK, and a `.dogl` is the
             canonical logical dump — one JSON row per line — that the record streams out of a
             Durable Object in pages. Both are signed over the same manifest, which is why `verify`
             and `import` take either; they are not the same artefact and the sentence made `.dog`
             sound like a text format. -->
        <p class="hint">{copy.exportWhat}</p>
        <div class="row-actions">
          <Button
            onclick={() =>
              toasts.push(copy.notWritten('The whole record would be written to one .dog file, a SQLite database you can open with sqlite3'))}
          >{copy.export}</Button>
          <Button
            weight="bare"
            onclick={() =>
              toasts.push(copy.notWritten('A .dog or .dogl file would be checked against its own manifest and signature'))}
          >{copy.verifyFile}</Button>
        </div>
      </Section>

      <!-- AND THE SLICE, WHICH IS A DIFFERENT FILE FOR A DIFFERENT JOB.

           `03 §1`: the three layers are addressable independently, and that is what makes the useful
           operations cheap — "export data without origin (a clean handover), export origin without
           data (an audit), export governance alone (share a way of working — THAT IS A PACK)."

           The screen offered one button for the whole record and nothing for the other three, so the
           only exit this product appeared to have was all-or-nothing. A pack is the readable-text
           half: your lists, pages, metrics and rules without a single row of your business in it. -->
      <Section title={copy.takeAway}>
        <p class="hint">{copy.takeAwayWhat}</p>
        <div class="row-actions">
          <Button
            weight="quiet"
            onclick={() =>
              toasts.push(copy.notWritten('Your lists, pages, metrics and rules would be written as one readable pack, with none of your rows in it'))}
          >{copy.exportPack}</Button>
          <Button
            weight="bare"
            onclick={() =>
              toasts.push(copy.notWritten('The rows would be written without where each one came from, which is a clean handover'))}
          >{copy.exportRows}</Button>
        </div>
      </Section>
      <!--
        THE KEY THAT MAKES A YEAR-OLD BACKUP CHECKABLE, and this screen is where four documents put
        it. `53 §4`: *"the public half in Settings → export and at the well-known URL 03 §4 names"*.
        `53 §5.4` step 3 has the operator paste it into
        `braindog verify latest.dogl --key <the record's public key, Settings → export>`, and
        `48 §5.6` says the answer without it reads **`unpinned`** — the file's own key proves
        integrity, and origin is `--key`'s job.

        THE ONE KEY THAT BELONGS ON A SCREEN. This product's first promise is that the record indexes
        what a key opens and never the key, and that rule is about SECRETS; the whole mechanism here
        is publication. It is served to anybody who asks at `GET /.well-known/braindog-key`, which is
        the sentence beneath it.
      -->
      <Section title={copy.theSignature}>
        <p class="hint">{copy.theSignatureIs}</p>
        <ul class="facts">
          <li>
            <span class="fact-key">{copy.keyFingerprint}</span>
            <span class="fact-value mono">{SIGNING_KEY.keyId}</span>
          </li>
          <li>
            <span class="fact-key">{copy.keyPublic}</span>
            <span class="fact-value mono wrap">{SIGNING_KEY.publicKey}</span>
          </li>
        </ul>
        <div class="row-actions">
          <Button weight="bare" onclick={() => void clipboard.put(SIGNING_KEY.publicKey, copy.keyPublic, copy.keyCopied)}>{copy.copyKey}</Button>
        </div>
        <p class="hint">{copy.verifyHow}</p>
      </Section>

      <!-- `Danger` IS A ONE-WORD HEADING THAT STATES NO FACT, over a line saying `Delete this
           record` over a button saying `Delete the studio` — three lines, two of them the same
           sentence, and the two disagreeing about what the record is called. One sentence saying
           what happens, and the button that does it. -->
      <!--
        AND THE CONFIRMATION IS THE CONTROL, not a sentence about one.

        Four documents give the same flow — `02 §9` (*"an ADMIN method, browser session,
        re-authenticated, **the slug typed**"*), `33 §4`, `33 §10`, `19 §2` — and the screen was one
        button whose toast said *"Deleting a record asks you to type its name first"*. A control that
        DESCRIBES its own safeguard has not got one: the description is exactly as far as the product
        went, on the one action `53 §5.9` says has no rollback after step 2.

        The field is the gate. The button is disabled until the slug is typed, so the safeguard is a
        thing you do rather than a thing you are told about. Re-authentication is the half nothing
        specifies HOW to do — `49 §4.2`'s `authed_at` is the only lever the documents give — so the
        screen says it will be asked for rather than inventing a mechanism.
      -->
      <Section title={copy.deleteRecord(RECORD)}>
        <div class="danger">
          <p class="danger-title">{copy.deleteWhat(RECORD)}</p>
          <!-- WHAT IT COSTS, BEFORE THE FIELD. `53 §5.9`: *"Rollback: none after step 2 … by day +30
               nothing of the record remains anywhere"*, and a final snapshot exists only so that a
               same-day "wait" is answerable. -->
          <p class="danger-why">{copy.deleteCosts}</p>
          <label class="code-label" for="delete-slug">{copy.typeSlug(boot().index.slug)}</label>
          <div class="code-row">
            <div class="field field-lg">
              <input
                class="field-input"
                id="delete-slug"
                type="text"
                autocapitalize="off"
                spellcheck="false"
                autocomplete="off"
                bind:value={typedSlug}
              />
            </div>
          <Button
            tone="bad"
            disabled={typedSlug.trim() !== boot().index.slug}
            onclick={() => toasts.push(copy.notWritten(`You would be asked to sign in again, and then ${RECORD} and every copy of it would be gone`), { intent: 'bad' })}
            >{copy.deleteRecord(RECORD)}</Button
          >
          </div>
        </div>
      </Section>
    {/if}

    <!-- AND WITHOUT THE TALLY. "8 packs, 8 lists" welded a count nobody can act on to a sentence
         about the build, on all twelve areas. Both numbers are on the screens that own them.

         AND NOT THE SAME SENTENCE ON ALL TWELVE. Three areas have controls that really do persist —
         appearance writes four preferences, keyboard one, navigation one, and every one of them
         survives a reload — and this told their readers otherwise, four lines under a line saying
         the opposite. A disclaimer that is false where it matters most does not protect the mock;
         it teaches people to discount the half that works. -->
    <p class="mock">{KEEPS.has(area) ? copy.mockNoticeSome : copy.mockNotice}</p>
  </div>
</div>
{/if}

<style>
  /* The refusal stands alone, with the area rail gone: there is no area to be in. */
  .gone {
    padding: var(--sp-6) var(--sp-5);
  }

  /* A short list of stated facts, for the three areas that REPORT rather than offer. Two columns so
     the label and the value line up down the page; it wraps to one below 520px. */
  .facts {
    display: grid;
    grid-template-columns: minmax(12ch, max-content) minmax(0, 1fr);
    gap: var(--sp-2) var(--sp-4);
    margin: 0 0 var(--sp-3);
    padding: 0;
    list-style: none;
  }

  .facts li {
    display: contents;
  }

  .fact-key {
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .fact-value {
    color: var(--ink2);
  }

  @media (width < 520px) {
    .facts {
      grid-template-columns: minmax(0, 1fr);
      gap: 0 0;
    }

    .facts li {
      display: block;
      margin-block-end: var(--sp-2);
    }
  }

  .whos {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .who {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    padding: var(--sp-3);
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
  }

  .who-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--sp-2);
  }

  .who-name {
    color: var(--ink);
    font-weight: 600;
  }

  /* IT TAKES THE SLACK AND GIVES IT BACK. `1 1 24ch` rather than a fixed width: on a wide screen the
     address and the date sit on the name's line, and below about 520px the whole clause wraps
     instead of truncating an email address in the middle, which is where they stop being
     recognisable. */
  .who-detail {
    flex: 1 1 24ch;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  /* WHAT IT WOULD BE ALLOWED TO DO GETS ITS OWN LINE, at full width.

     It is the sentence the decision is made from, and as a third `1 1 24ch` clause it would have
     landed wherever the name's length happened to leave room — sometimes beside the state, sometimes
     under it, never twice the same across five rows. `100%` puts it on one line of its own, under
     the name, which is where the eye goes after reading who is asking.

     `--ink2` rather than `--dim`: the row's other clauses are context and this one is the question. */
  .who-reach {
    flex: 1 1 100%;
    color: var(--ink2);
  }

  /* The controls sit at the end of the head line and never shrink: a button that wraps its own
     label is a button somebody reads twice. */
  .who-do {
    display: flex;
    flex: none;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  /* A whole sentence, wrapping, under the row it is about. */
  .who-why {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  /* The same bar a toned row wears in a grid, on the block that replaced it. */
  .who[data-intent] {
    border-inline-start: 2px solid var(--tone);
  }

  .who-level {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2) var(--sp-3);
  }

  .means {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  /* The ladder is five words plus `nothing`, so its buttons are the narrowest segment in the
     product — and the track wraps rather than scrolling, which `controls.css` already decided for
     the same reason: five 44px segments measured 342px inside a 320px screen. */
  .segment-sm .seg {
    padding-inline: var(--sp-2);
    font-size: var(--t-sm);
  }

  /* THE EXCEPTIONS. Indented under the level they are exceptions to, because that relationship is
     the whole content of the line — a flat list beside the level reads as a second, unrelated
     answer. One row each: which list, what they hold there, and the way back. */
  .exceptions {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    margin: 0;
    padding: 0 0 0 var(--sp-3);
    border-inline-start: 2px solid var(--line);
    list-style: none;
  }

  /* ONE LAYOUT FOR EVERY ROW. `flex-wrap` made the shape depend on how long the register's name is,
     so one person's two exceptions rendered two different ways — one 64px tall with the control
     wrapped, the next 36px with the control nine pixels ABOVE its own label. A grid gives every row
     the same three columns and the same height. */
  .exceptions li {
    display: grid;
    grid-template-columns: minmax(6ch, max-content) minmax(6ch, max-content) 1fr auto;
    align-items: baseline;
    gap: var(--sp-2);
  }

  /* AND THE CONTROL DROPS TO ITS OWN LINE ON A PHONE. Two `max-content` columns, a sentence and a
     44px button do not fit in 320px — the list ran 391px wide and the row 376 — and the column that
     cannot shrink is the one holding a register's name. `13 §10`: below 640 a row becomes a card, and
     a card puts its verb underneath. */
  @media (width < 640px) {
    .exceptions li {
      grid-template-columns: minmax(0, max-content) minmax(0, max-content) 1fr;
    }

    .exceptions li :global(.btn) {
      grid-column: 1 / -1;
      justify-self: start;
    }
  }

  .ex-list {
    color: var(--ink);
    font-weight: 600;
    font-size: var(--t-sm);
  }

  /* AND IT IS SET APART FROM THE LADDER. Five rungs and a sixth thing that is not one of them,
     rendered identically, is a control whose own comment insists on a distinction the screen does
     not make. A separator rather than a colour: `13 §5.1` again. */
  .seg-none {
    margin-inline-end: var(--sp-2);
    border-inline-end: 1px solid var(--line);
    padding-inline-end: var(--sp-3);
  }

  /* The ladder word, which is what one exception is compared against another by. */
  .ex-word {
    color: var(--ink);
    font-size: var(--t-sm);
  }

  .ex-add {
    margin-block-start: var(--sp-1);
  }

  .ex-level {
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  .shell {
    display: grid;
    grid-template-columns: 200px minmax(0, 1fr);
    gap: var(--sp-5);
    padding: var(--sp-5) var(--sp-6) var(--sp-9);
    max-inline-size: 1100px;
  }

  .areas {
    display: flex;
    flex-direction: column;
    position: sticky;
    inset-block-start: calc(var(--sticky) + var(--sp-4));
  }

  /* The same row as the rail's, because it IS the same thing: a vertical list of places, one of
     which you are in. It read as a different control entirely — a grey box where the rail uses the
     accent — which teaches that "here" looks like two things. */
  /* AND THE ROWS ARE TARGETS. `min-block-size: 32px` with no pointer query — they measured 67px
     only because "People & sharing" wraps to two lines and stretches its siblings. */
  .area {
    min-block-size: var(--ctl-h);
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    padding: 0 var(--sp-3);
    border-radius: var(--r-md);
    color: var(--ink2);
    font-size: var(--t-ui);
    font-weight: 500;
    text-decoration: none;
    transition: background var(--d-state) var(--ease-out);
  }

  .area:hover {
    background: color-mix(in srgb, var(--ink) 6%, transparent);
    color: var(--ink);
  }

  .area[aria-current='page'] {
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    color: var(--accent-text);
    font-weight: 600;
  }

  .body {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
  }

  /* The hint sits above the control it explains, not beside it: a sentence in a column beside a
     row of swatches is read after the choice has been made. */
  /* THE CODE-ENTRY CONTROL.

     The field and its button sit on one line and wrap to two below about 420px, where a 44px button
     beside a field wide enough for six digits stops fitting. Nothing here sets a colour: the ring is
     `controls.css`'s, on the wrapper, and the answer's tone comes from `[data-intent]`. */
  .code-form {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    margin-block-start: var(--sp-3);
  }

  .code-label {
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  .code-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
  }

  /* SIX DIGITS AND NO MORE ROOM THAN SIX DIGITS NEED. A field stretched across the panel invites a
     sentence; one sized to its content says what belongs in it without a word. `ch` on a tabular
     face is the honest unit, and `font-variant-numeric` keeps the six from jumping about as they
     are typed — proportional digits reflow the whole field on every keystroke. */
  .code-input {
    flex: 0 1 12ch;
    font-size: var(--t-md);
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.18em;
  }

  /* A BASE64 KEY HAS NO SPACES IN IT, so it is one 43-character word and it reached 432px inside a
     400px screen. `13 §10` and the layout gate's first rule: the page body never scrolls sideways. */
  .wrap {
    overflow-wrap: anywhere;
  }

  /* THE ONE PLACE A MONOSPACE FACE IS RIGHT. `Money.svelte` argues against it for figures — a mono
     face gives the thousands separator a full character width — and a key is not a figure: it is a
     string somebody compares character by character against another screen. */
  .mono {
    font-family: ui-monospace, 'SF Mono', 'Cascadia Mono', Menlo, Consolas, monospace;
    font-size: var(--t-sm);
    letter-spacing: 0;
  }

  .code-said {
    margin: 0;
    color: var(--tone, var(--ink2));
    font-size: var(--t-sm);
  }

  .hint {
    margin: 0 0 var(--sp-3);
    max-width: var(--measure);
    color: var(--dim);
    font-size: var(--t-sm);
    line-height: var(--lh-body);
  }

  .swatches {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  /* A SWATCH IS THE COLOUR, and the tick is drawn ON it rather than beside it: a selected state
     that lives outside the thing selected is a state people read as belonging to the next one. */
  .swatch {
    display: grid;
    place-items: center;
    min-width: var(--tap);
    height: var(--tap);
    padding: 0 var(--sp-2);
    background: var(--swatch, var(--s1));
    /* THE LABEL ON A FILL, which is the token the theme solves for exactly this: a tick drawn in
       white on an ochre swatch is the one place a literal would be wrong twice over. */
    color: var(--accent-ink);
    border: 1px solid var(--line);
    border-radius: var(--r-sm);
    cursor: pointer;
  }

  .swatch[data-on] {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
  }

  .swatch-off {
    background: var(--s1);
    color: var(--ink);
    font-size: var(--t-sm);
  }

  /* A refusal a person cannot act on teaches them the control is broken, so the floor it missed is
     printed rather than a shrug. */
  .wrong {
    margin: var(--sp-3) 0 0;
    padding-inline-start: var(--sp-4);
    color: var(--danger);
    font-size: var(--t-sm);
    line-height: var(--lh-body);
  }

  /* AND THE TRACK WRAPS, which `controls.css` already decided for the register's chips and this copy
     of the pattern did not: *"the alternative hides a state with no way to know it is there"*. Six
     44px-wide options is 374px, so at 320 and 360 the level control ran off the screen — and the one
     that went first is `owner`. A second line costs nothing; a sixth option nobody can reach costs
     the whole control. */
  .segment {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 3px;
    padding: 3px;
    background: var(--sunk);
    border: 1px solid var(--line);
    border-radius: var(--r-sm);
  }

  /* `--ctl-h`, LIKE EVERY OTHER CONTROL. Nine of these on `/settings/appearance` were 28px tall on
     a phone — the screen whose own Text and Density controls are about making things easier to
     use. `05 §6`: density follows the pointer, never the width. */
  /* BOTH AXES, and this had one. `a11y.css` states the rule and the exact failure it is written
     against — *"a control grown only in height measures 38x44 and fails"* — and a short label like
     `On` or `read` measured **43 x 44**: the height was right and the width was the label. Found by
     the layout gate the day it learned to measure targets, on three settings areas at four widths. */
  .seg {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-block-size: var(--ctl-h);
    min-inline-size: var(--ctl-h);
    padding: 0 var(--sp-3);
    background: none;
    border: 0;
    border-radius: 4px;
    color: var(--dim);
    font-size: var(--t-ui);
    cursor: pointer;
    transition: background var(--d-state) var(--ease-out);
  }

  .seg:hover {
    color: var(--ink2);
  }

  .seg[data-on] {
    background: var(--s2);
    box-shadow: var(--raise);
    color: var(--ink);
  }



  /* WRAPPING, for the reason `/audit`'s segmented bar already wraps: two buttons that do not fit
     are two buttons off the edge. At 320 "Export the rows only" ended at x=406 in a 320px screen. */
  .row-actions {
    flex-wrap: wrap;
    display: flex;
    gap: var(--sp-2);
    margin-block-start: var(--sp-3);
  }

  .danger {
    padding: var(--sp-4);
    background: var(--s1);
    border: 1px solid color-mix(in srgb, var(--danger) 40%, var(--line));
    border-radius: var(--r-md);
  }

  .danger-title {
    color: var(--danger);
    font-weight: 500;
  }

  .danger :global(.btn) {
    margin-block-start: var(--sp-3);
  }

  .mock {
    color: var(--dim);
    font-size: var(--t-xs);
  }

  @media (width < 900px) {
    .shell {
      grid-template-columns: minmax(0, 1fr);
      padding: var(--sp-4) var(--sp-4) var(--sp-8);
    }

    .areas {
      position: static;
      flex-direction: row;
      overflow-x: auto;
    }
  }
</style>

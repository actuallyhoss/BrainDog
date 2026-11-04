<!--
  Settings > Appearance: how BrainDog looks to this person, in one section, and the record's own look under it.

  EVERYTHING A PERSON SETS IS SHOWN (4 Nov, the owner: "remove the dropdowns from the appearance page, make them all shown").
  Three groups in one card, beside the preview: how it reads (scheme, text size, density, colour, look, contrast), getting
  around (navigation, the phone bar), and screenshot mode. Only the record's own look stays folded under it: it is
  everybody's, and long.

  THE PERSON'S LOOK FOLLOWS THEM (`35`). Scheme, text size, density, contrast and accent are kept by the record as their
  own `look.*` prefs, so every device they open this record on looks the same; the cookie is only the first-paint copy
  (`pref.ts`). EACH RECORD KEEPS ITS OWN: a person in two records has a look in each, and the hint says "this record"
  rather than promising every device everywhere. A record too old to keep them leaves them on the device, a change the
  record has not received yet waits on this one, and the hint says which.

  ONE SECTION, FOUR CHOICES AND THE THING THEY CHANGE (calm, few controls per screen). The scheme, the
  text size, the density and the colour were four sections, the scheme drawn as three large pictures of the app, and a
  person changing how the product reads scrolled past a screen of chrome to find the next choice. They are one column of
  short choices now, beside a preview that is the app itself in small: drawn from the same tokens every screen reads, so
  every press changes it the moment it is made, in the scheme, size, room and colour chosen. It stays in view beside the
  choices as the column scrolls, from the width where it stands beside them. NO TOAST SAYS IT
  (motion F15): the whole screen already shows the change, and the control beside it is its undo. Only a refusal speaks.

  ONE WAY TO MORE CONTRAST (agents F26): the More contrast switch. "High contrast" is no longer a look beside House.

  AND THE SCHEME IS STILL A THREE-WAY CHOICE, not a toggle offering the opposite. The predecessor's had three states and
  a one-way UI: once a person chose light or dark, only clearing local storage restored "match the system". "Match the
  system" must stay reachable (19 §4).

  Density switches on POINTER, never on width: a small laptop window is not a phone. Width may
  change layout; only the pointer may change size (05 §6).
-->
<script lang="ts">
  import * as pref from '$lib/pref.ts';
  import { ACCENTS, apply as accentApply } from '$lib/accent.ts';
  import { copy } from '$lib/copy.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { keptWithUndo, type Deps } from '$lib/record/pref-write.ts';
  import { moneyInText } from '$lib/record/money.ts';
  import Tile from '$lib/ui/Tile.svelte';
  import Segmented from '$lib/ui/Segmented.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import { onMount, untrack } from 'svelte';
  import { drawn, drawSaved, lookOf, redraw } from '$lib/theme/draw.ts';
  import { follow } from '$lib/theme/follow.ts';
  import { CONTRAST, choicesOf, lookWords, previewOf, styleOf, type Look } from '$lib/theme/theme-choice.ts';
  /* THE HOUSE'S OWN SEED AND THE EDITOR'S SOLVER, both already in this screen's chunk (`LookEditor`), so the house's
     other scheme is solved here without a new export from the module every screen loads. */
  import { BRAND_RED, HOUSE_FRAME, HOUSE_SEED } from '@braindog/theme';
  import { baseOf } from '$lib/theme/look.ts';
  import LookEditor from '$lib/theme/LookEditor.svelte';
  import { takeFix } from '$lib/theme/staged.ts';
  import type { AreaProps } from '../settings-state.svelte.ts';
  import { ownsRecord } from '../../levels.ts';
  import { shot, shotNow } from '$lib/palette/customise-apply.ts';
  import StateRow from './StateRow.svelte';
  import NavPicks from './NavPicks.svelte';

  /* EVERY AREA TAKES THE SAME PROPS. The device's own choices read none of them; the record's look asks whether the
     person is the owner, whose save installs it, or a member, whose save goes to Decide. */
  let props: AreaProps = $props();
  const owner = $derived(ownsRecord(props.shell.me));

  /* THIS AREA'S OWN WORDS, the ones the copy modules do not already hold. */
  const words = {
    /* "YOURS", NOT "HOW IT LOOKS" (ui pass, 3 Nov): the card took its group's name, under a page named Appearance, over a
       fold named "How your BrainDog looks". It holds the person's own choices; the fold holds everybody's. */
    looks: 'Yours',
    /* WHERE IT IS KEPT, AT THE HEAD'S END, where it was a line of its own over the choices. Per record: the look is kept
       in each record a person opens, not once for the whole account. */
    hint: 'On all your devices',
    hintPending: 'On this device for now',
    hintDevice: 'On this device',
    /* THE PREVIEW'S SENTENCE, with its one phrase that needs the person in red, as a page's headline draws it. */
    /* THE REAL COUNT, the one the badge says, so the preview never contradicts the bar beside it. */
    said: (n: number) => (n === 0 ? 'Nothing needs you today.' : `${n} need${n === 1 ? 's' : ''} you today.`),
    light: 'Light',
    dark: 'Dark',
    houseRed: 'House red',
  };

  /* A THEME REFUSED AT INSTALL, handed over by the add-on screen's Fix and install. Taken once, so a reload of this
     screen opens as it always does. */
  const staged = takeFix();

  /* SET IT AND REMEMBER IT, in one call. These were two things and the second was never written:
     every preference in this product was lost on refresh, and a setting that does not survive a
     reload is a setting somebody changes once and then stops trusting.

     A DENSITY PICKED HERE BEATS THE RECORD'S LOOK for this person, so the look is drawn again without its row height. */
  const set = (key: 'scheme' | 'text' | 'density', value: string) => {
    const before = key === 'text' ? text : key === 'density' ? density : scheme;
    void keptWithUndo(key, before, value, writers);
  };

  /* THE RECORD'S WORD FIRST, when this screen is the first a tab opens: the root layout's `draw` adopts it behind a
     dynamic import that can land after this runs, and these controls and the hint would then be the cookie's. Once per
     person and record, so it is nothing when the layout got there first; the slug is the shell's, as `boot` named it. */
  follow(untrack(() => ({ me: props.shell.me, record: { slug: props.shell.index.slug } })));

  /* SEEDED FROM WHAT IS REMEMBERED, so the controls show the state the page is already in rather
     than the default the state happens to start at. */
  const held = pref.read();
  /* WHERE A CHOICE IS KEPT, said in the hint: the record, this device until the record hears of it, or this device when
     there is no record or it refused a key. Read again after each choice settles, so a host that refuses one, or a send
     that did not arrive, is not left claiming "every device". */
  let kept = $state(pref.whereKept());
  const settle = () => void pref.settled().then(() => (kept = pref.whereKept()));
  let scheme = $state<'light' | 'system' | 'dark'>(held.scheme ?? 'system');
  let text = $state<'sm' | 'base' | 'md'>(held.text ?? 'base');
  let density = $state<'compact' | 'comfortable' | 'roomy'>(held.density ?? 'comfortable');
  /* THE HIGH-CONTRAST PALETTE, WHICH SHIPPED AND HAD NO CONTROL. Off unless somebody said
     otherwise: it is a second palette solved against a higher floor, not a correction to a broken
     one, so the default is the palette everything else is drawn against. */
  let moreContrast = $state(held.contrast ?? false);

  let accent = $state<string | null>(held.theme ?? null);
  let accentWrong = $state<string | null>(null);

  /* EVERY CHOICE HERE IS SAID AND OFFERED BACK (`pref-write.ts`): written, then a toast with its Undo, and `shown` draws
     each value that now stands, the Undo's included. A colour this screen cannot paint is refused once, in the toast. */
  const writers: Deps = {
    apply: pref.apply,
    contrast: pref.contrast,
    accent: (hex) => {
      const out = accentApply(hex);
      if (out.ok) return { from: 'kept' };
      return { from: 'refused', fix: copy.accentRefused(ACCENTS.find((a) => a.hex === hex)?.name ?? String(hex), out.codes) };
    },
    /* ONLY A REFUSAL IS SAID (motion F15). A change the whole screen already shows is not said again, and the segment or
       swatch beside it is the way back. */
    toasts: { push: (text, opts) => (opts?.intent === 'warn' ? toasts.push(text, opts) : 0) },
    shown: (key, value) => {
      if (key === 'scheme') scheme = (value ?? 'system') as typeof scheme;
      else if (key === 'text') text = (value ?? 'base') as typeof text;
      else if (key === 'density') {
        density = (value ?? 'comfortable') as typeof density;
        redraw();
      } else if (key === 'contrast') moreContrast = value === true;
      else if (key === 'theme') {
        accentWrong = null;
        accent = value as string | null;
      }
      settle();
    },
  };

  /* A SWATCH THAT MISSES A FLOOR IS REFUSED IN THE TERMS OF THIS SCREEN (`copy.accentRefused`), never the theme
     author's sentence about pairs and chroma, which names nothing a person here can move. */
  function pickAccent(hex: string | null) {
    void keptWithUndo('theme', accent, hex, writers);
  }

  /* THE ONE PREFERENCE WHOSE ATTRIBUTE IS NOT ITS VALUE: the switch is a boolean and the attribute
     is the literal `hc`, so it has its own writer rather than a fourth key in `apply`. */
  function pickContrast(on: boolean) {
    const before = moreContrast;
    moreContrast = on;
    void keptWithUndo('contrast', before, on, writers);
  }

  /* ── the look: every one the record holds, one press each ── */

  /* WHAT `boot` SAID OF THE LOOKS, asked again here because the shell keeps neither `looks` nor the person's pick. Until
     it answers, the page's own drawn look stands in, so the preview is true from the first frame. */
  let booted = $state.raw<unknown>({ theme: drawn() });
  let picking = $state(false);
  /* THE CHOICE IS LISTED ONCE THE RECORD HAS SAID WHAT IT HOLDS, so it never marks House on a record drawn in its own. */
  let answered = $state(false);
  /* THE LOOKS BESIDE HOUSE, without High contrast: that is the switch below, the one way to more contrast. With nothing
     beside House there is no choice to draw. */
  const choices = $derived(choicesOf(booted, false).filter((c) => c.id !== CONTRAST));

  /* THE DENSITY PREVIEW DRAWS HIS OWN ROWS: the first three questions waiting on him, as Today leads with them,
     else the names of three of his lists. A made-up studio stood there before. Nothing until the record answers. */
  const previewRows = $derived.by((): string[] => {
    const b = booted as { waiting?: { question?: unknown }[]; registers?: { name?: unknown; kernel?: boolean }[] } | null;
    /* AN AMOUNT IN A QUESTION IS SAID AS EVERY SCREEN SAYS IT (`moneyInText`): the preview read "GBP 39.00" where Needs
       you reads "£39" (audit of 31 October, A20). */
    const asked = (b?.waiting ?? []).map((w) => (typeof w.question === 'string' ? moneyInText(w.question.trim()) : '')).filter((q) => q !== '');
    if (asked.length > 0) return asked.slice(0, 3);
    return (b?.registers ?? []).filter((r) => r.kernel !== true && typeof r.name === 'string').map((r) => String(r.name)).slice(0, 3);
  });
  /* ALWAYS THREE ROWS, a blank one where there is no word yet. On a phone the preview stands above the choices, and the
     rows arriving with the record grew it 188px a beat after the first frame, pushing every choice down. */
  const previewSlots = $derived([0, 1, 2].map((i) => previewRows[i] ?? ''));

  const recordBoot = async (): Promise<unknown> => {
    const [{ createClient }, { apiBase }] = await Promise.all([import('@braindog/client'), import('$lib/at.ts')]);
    const out = await createClient({ base: apiBase() })
      .boot()
      .catch(() => null);
    return out?.ok ? out.value : null;
  };

  onMount(() => {
    void recordBoot().then((b) => {
      if (b !== null) booted = b;
      answered = b !== null;
    });
  });

  /* ONE PRESS PICKS. High contrast is its switch, as it always was; any other look turns it off, since it wins over every
     look and a press that changed nothing on screen would read as broken. The pick goes through the same `keep` the
     accent's does, as `look.theme`, and the record then draws it: `boot` is asked again and its look put on the page. */
  async function pickLook(id: string) {
    if (picking) return;
    if (id === CONTRAST) return pickContrast(!moreContrast);
    if (moreContrast) pickContrast(false);
    picking = true;
    /* `look.theme` IS NOT ONE OF THE COOKIE'S FIRST-PAINT KEYS (`pref.LOOK_KEYS`): the look is the record's to draw, so the
       key is cast here rather than adding a word to the module every screen loads. */
    const kept = await pref.keep('look.theme' as pref.LookKey, id);
    settle();
    if (kept.from === 'refused') toasts.push(kept.fix);
    const fresh = await recordBoot();
    picking = false;
    if (fresh === null) return;
    booted = fresh;
    drawSaved(lookOf(fresh));
  }

  /* THE SCHEME THE PAGE IS IN, so the preview can draw the one it is not: the device's when the person said system. */
  let deviceDark = $state(typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches);
  onMount(() => {
    if (typeof matchMedia !== 'function') return;
    const q = matchMedia('(prefers-color-scheme: dark)');
    const on = () => (deviceDark = q.matches);
    q.addEventListener('change', on);
    return () => q.removeEventListener('change', on);
  });
  const inUse = $derived<'light' | 'dark'>(scheme === 'system' ? (deviceDark ? 'dark' : 'light') : scheme);

  /* THE HOUSE'S PALETTES, OR A PERSON'S OWN COLOUR'S, solved once each: a solve is the generator's whole search. */
  const solved = new Map<string, { house: Look; contrast: Look } | null>();
  const solvedFor = (hex: string | null) => {
    const key = hex ?? HOUSE_SEED.accent;
    if (!solved.has(key)) {
      const base = baseOf(key, HOUSE_SEED.neutralHue);
      solved.set(key, base && { house: base.house.schemes, contrast: base.contrast.schemes });
    }
    return solved.get(key) ?? null;
  };

  /* WHAT THE OTHER SCHEME WOULD DRAW, in the order the page stacks its sheets: a person's own colour over everything
     (`accent.ts`), High contrast over the record's look (`draw.ts`), then the record's look, then the house. */
  const other = $derived.by(() => {
    const own = solvedFor(accent);
    const fallback = own && (moreContrast ? own.contrast : own.house);
    return previewOf(accent !== null || moreContrast ? null : booted, inUse, fallback);
  });

  /* TWO PREVIEWS FROM 1280PX, LIGHT THEN DARK (agents F26): the scheme in use is the page's own tokens, and the other is
     solved. On a phone one, the scheme picked. Where the other cannot be solved truly it is not drawn. */
  const previews = $derived(
    (['light', 'dark'] as const)
      .map((s) => ({ scheme: s, style: s === inUse ? '' : other ? frameOf(s, other) : null, here: s === inUse }))
      .filter((p): p is { scheme: 'light' | 'dark'; style: string; here: boolean } => p.style !== null),
  );

  /* THE OTHER SCHEME'S FRAME BY ITS NEW NAMES (`HOUSE_FRAME`: board, tile, inks, reds), then the solved look's own
     tokens over it, and a person's own colour as the fill: the solver still speaks the older names, and a preview that
     set only those left every new-named surface in the page's scheme. */
  function frameOf(scheme: 'light' | 'dark', solved: Record<string, string>): string {
    const frame = Object.entries(HOUSE_FRAME[scheme]).filter(([, v]) => /^#[0-9A-Fa-f]{6}$/u.test(v));
    const fill = accent !== null && solved.action ? ` --red-fill: ${solved.action};` : '';
    return `${frame.map(([k, v]) => `--${k}: ${v};`).join(' ')} ${styleOf(solved)}${fill}`;
  }

  /* THE HOUSE SWATCH IS THE HOUSE'S OWN RED, whatever colour the page is drawn in now. */
  const houseHex = BRAND_RED;
  const accentName = $derived(accent === null ? words.houseRed : (ACCENTS.find((a) => a.hex === accent)?.name ?? ''));

  /* SCREENSHOT MODE, AS THIS SCREEN SHOWS IT NOW: the mark the mode puts on the page, so the switch never claims a mode the
     screen is not in. The press is the palette's and the key's (`customise-apply.ts`), kept as the person's `look.shot`. */
  let shotOn = $state(shotNow());
  function pickShot(on: boolean) {
    shotOn = on;
    void shot(on).then(() => (shotOn = shotNow()));
  }

  function pickScheme(v: 'light' | 'system' | 'dark') {
    const before = scheme;
    scheme = v;
    /* `system` IS AN ANSWER AND NOT AN ABSENCE, so it is written down: removing the attribute
       without recording the choice would make the next visit read a stale `dark` from the cookie. */
    void keptWithUndo('scheme', before, v === 'system' ? null : v, writers);
  }

  const SCHEMES = [
    ['light', copy.schemeLight, 'sun'],
    ['system', copy.schemeSystem, 'monitor'],
    ['dark', copy.schemeDark, 'moon'],
  ] as const;

  const TEXTS = [
    ['sm', copy.textSmall],
    ['base', copy.textNormal],
    ['md', copy.textLarge],
  ] as const;

  const DENSITIES = [
    ['compact', copy.densityCompact],
    ['comfortable', copy.densityComfortable],
    ['roomy', copy.densityRoomy],
  ] as const;

  /* THE PREVIEW'S ROWS, each with the glyph its kind of row carries in a list. */
  const SPECIMEN = ['doc', 'obligation', 'calendar'] as const;
</script>

<!-- ONE THING ON OR OFF IS A SWITCH at the end of the row that says what it does. It was two segments reading On and
     Off, which is a choice between two things. -->
{#snippet contrastSwitch()}
  <button
    type="button"
    class="switch"
    role="switch"
    aria-checked={moreContrast}
    aria-label={copy.contrast}
    onclick={() => pickContrast(!moreContrast)}><span class="switch-track"></span></button
  >
{/snippet}

{#snippet shotSwitch()}
  <button type="button" class="switch" role="switch" aria-checked={shotOn} aria-label={copy.shot} onclick={() => pickShot(!shotOn)}
    ><span class="switch-track"></span></button
  >
{/snippet}

<!--
  AND EVERY ONE OF THESE SAYS WHICH IS ON, to something that is not a stylesheet.

  Fifteen buttons on this screen (six swatches and nine segments) carried `data-on` and no
  `aria-pressed`. Measured on the deployed build: `aria-pressed` was `null` on all fifteen,
  so a screen reader heard "Light button, System button, Dark button" and could not tell
  which one the record was in. `13 §5.1` is that the meaning cannot live in the styling
  alone, and the People matrix cites that rule and gets it right, which is the tell: the fix
  was known, written down, and applied to one group.
-->
<Tile icon="sun" class="section" data-surface="tile" title={words.looks} meta={kept === 'record' ? words.hint : kept === 'pending' ? words.hintPending : words.hintDevice}>
  <div class="section-body looks-host">
    <div class="looks">
      <div class="choices">
        <!-- HOW IT READS: scheme, size, room, colour, look and contrast. -->
        <div class="group">
        <div class="choice">
          <span class="choice-name" id="choice-scheme">{copy.scheme}</span>
          <Segmented full role="group" aria-labelledby="choice-scheme">
            {#each SCHEMES as [v, label, icon] (v)}
              <button type="button" class="segment" aria-pressed={scheme === v} data-on={scheme === v ? '' : undefined} onclick={() => pickScheme(v)}
                ><Icon name={icon} size="s" />{label}</button
              >
            {/each}
          </Segmented>
        </div>

        <div class="choice">
          <span class="choice-name" id="choice-text">{copy.textSize}</span>
          <Segmented full role="group" aria-labelledby="choice-text">
            {#each TEXTS as [v, label] (v)}
              <button
                type="button"
                class="segment"
                aria-pressed={text === v}
                data-on={text === v ? '' : undefined}
                onclick={() => set('text', v)}><span class="aa" data-size={v} aria-hidden="true">Aa</span>{label}</button
              >
            {/each}
          </Segmented>
        </div>

        <div class="choice">
          <span class="choice-name" id="choice-density">{copy.density}</span>
          <Segmented full role="group" aria-labelledby="choice-density">
            {#each DENSITIES as [v, label] (v)}
              <button
                type="button"
                class="segment"
                aria-pressed={density === v}
                data-on={density === v ? '' : undefined}
                onclick={() => set('density', v)}
                ><span class="spacing" data-density={v} aria-hidden="true"><span></span><span></span><span></span></span>{label}</button
              >
            {/each}
          </Segmented>
        </div>

        <!--
          THE PERSON'S OWN COLOUR, over the record's look. `@braindog/theme` solves an entire coherent palette from one seed
          against every floor it defines, and until now nothing called it with anything but the house
          red, so a bakery and a type foundry looked identical. The swatches are suggestions, not the
          set: any colour that passes goes in, and one that does not says which floor it missed rather
          than being quietly approximated.
        -->
        <div class="choice">
          <span class="choice-name" id="choice-accent">{copy.accentTitle}</span>
          <span class="choice-line">{copy.accentHint}</span>
          <!-- A SWATCH PER COLOUR, HOUSE FIRST AND RED LIKE THE OTHERS: the chosen one ringed in red a gap away
               with a tick badge at its corner, and its name under the row. -->
          <div class="swatches" role="group" aria-labelledby="choice-accent">
            <button
              type="button"
              class="swatch"
              aria-pressed={accent === null}
              data-on={accent === null ? '' : undefined}
              style="--swatch:{houseHex}"
              aria-label={words.houseRed}
              onclick={() => pickAccent(null)}
            >
              {#if accent === null}<span class="tick" aria-hidden="true"><Icon name="check" size="s" /></span>{/if}
            </button>
            {#each ACCENTS as a (a.hex)}
              <button
                type="button"
                class="swatch"
                aria-pressed={accent === a.hex}
                data-on={accent === a.hex ? '' : undefined}
                style="--swatch:{a.hex}"
                aria-label={a.name}
                onclick={() => pickAccent(a.hex)}
              >
                {#if accent === a.hex}<span class="tick" aria-hidden="true"><Icon name="check" size="s" /></span>{/if}
              </button>
            {/each}
          </div>
          {#if accentName}<p class="swatch-name">{accentName}</p>{/if}
          {#if accentWrong}<p class="wrong" role="alert">{accentWrong}</p>{/if}
        </div>


        <!-- EVERY LOOK THE RECORD HOLDS, ONE PRESS EACH: House, High contrast, the record's own, one for each add-on. The
             one drawn now carries a tick as well as its fill, so the state is never colour alone. -->
        {#if answered && choices.length > 1}
          <div class="choice">
            <span class="choice-name" id="choice-look">{lookWords.title}</span>
            <span class="choice-line">{accent === null ? lookWords.line : lookWords.ownOnTop}</span>
            <div class="look-picks" role="group" aria-labelledby="choice-look">
              {#each choices as c (c.id)}
                <button
                  type="button"
                  class="look-pick"
                  aria-pressed={c.on}
                  data-on={c.on ? '' : undefined}
                  disabled={picking}
                  onclick={() => void pickLook(c.id)}>{#if c.on}<Icon name="check" size="s" />{/if}{c.name}</button
                >
              {/each}
            </div>
          </div>
        {/if}

        <!--
      THE PALETTE THAT COULD NOT BE TURNED ON.

      `packages/theme` solves a second palette against a higher contrast floor, `theme.mjs` writes
      it into `house.css` behind `html[data-theme='hc']`, and `theme.mjs --check` byte-compares it
      on every build. Nothing in `apps/web/src` ever set that attribute, so sixteen checks' worth
      of generated work was unreachable by the reader it exists for.

      WHAT WAS IN ITS WAY WAS THE ACCENT. `data-theme` carried two meanings and only one of them
      was ever read: `house.css` has four `data-theme` selectors and all four say `hc`, while
      `accent.ts` builds its palette into an adopted stylesheet and needs no attribute at all. The
      one being written was the one nothing read.

      A SWITCH AND NOT A SEGMENT, because it is one thing that is on or off, and `13 §5.1` wants
      the state said in something other than styling: `aria-checked` carries it.
    -->
        <div class="group-row">
          <StateRow icon="eye" title={copy.contrast} line={copy.contrastHint} action={contrastSwitch} />
        </div>
        </div>

        <!-- GETTING AROUND: the navigation and the phone bar. -->
        <div class="group">
          <NavPicks shell={props.shell} />
        </div>

        <!-- A DISPLAY MODE FOR A SHOULDER, not a redaction: the sentence says both halves, so nobody takes it for a lock. -->
        <div class="group group-rows">
          <StateRow icon="eye" title={copy.shot} line={copy.shotHint} action={shotSwitch} />
        </div>
      </div>

      <!--
        THE PREVIEW: the app in small, drawn from the tokens every screen reads, so it is never a picture of a choice but
        the choice itself. The mark wears the record's colour, the sentence carries its one red phrase, and the rows are a
        list drawn the way every list is drawn, at the chosen row height and text size. Shapes and sample words, never a
        control, so it is hidden from a screen reader: the choices beside it say what they are.
      -->
      <div class="previews" aria-hidden="true">
      {#each previews as p (p.scheme)}
      <div class="preview" data-other={p.here ? undefined : ''}>
        <p class="preview-name">{p.scheme === 'light' ? words.light : words.dark}</p>
        <!-- THE SCHEME IN USE IS THE PAGE'S OWN TOKENS; THE OTHER IS DRAWN FROM ITS OWN SOLVED COLOURS, the tokens the record
             would draw it in, so neither is a picture of a choice but the choice itself. -->
        <div class="pv" style={p.style}>
          <div class="pv-bar">
            <span class="pv-mark"></span>
            <span class="pv-place" data-on></span>
            <span class="pv-place"></span>
            <span class="pv-place"></span>
          </div>
          <div class="pv-tile">
            <div class="pv-head">
              <IconWell name="today" />
              <span class="pv-title">{copy.today}</span>
            </div>
            <p class="pv-said"><span class="pv-needs">{words.said(props.shell.open)}</span></p>
            <ul class="ledger ledger-lead pv-rows">
              {#each previewSlots as row, i (i)}
                <li>
                  <div class="line">
                    <span class="line-mark"><IconWell name={SPECIMEN[i % SPECIMEN.length] ?? 'doc'} size="l" /></span>
                    <span class="line-main"><span class="line-title pv-row" data-own>{row}</span></span>
                    <span class="line-amount"></span>
                    <span class="line-when"></span>
                  </div>
                </li>
              {/each}
            </ul>
          </div>
        </div>
      </div>
      {/each}
      </div>
    </div>

  </div>
</Tile>

<!--
  THE RECORD'S LOOK, which is everybody's, under the person's own choices, which are theirs alone (`21 §6`).
  The editor is its own component with its own styles, because this file's style block is the device choices'.
-->
<!-- THE FOLD'S NAME IS THE CARD'S (ui pass, 3 Nov): open, it read "How your BrainDog looks" twice, the summary over a card
     headed the same. -->
<details class="record-look">
  <summary>{copy.lookTitle}</summary>
<Tile class="section" data-surface="tile">
  <div class="section-body">
    <p class="hint">{copy.lookHint}</p>
    <LookEditor {owner} {staged} />
  </div>
</Tile>
</details>

<style>
  /* THE ONE FOLD LEFT, THE RECORD'S LOOK: one quiet line, opened by a press. Its line is a control's height (36), the words
     in its middle. */
  .record-look > summary {
    cursor: pointer;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-weight: 600;
    line-height: var(--lead-meta);
    padding-block: calc((var(--ctl-h) - var(--lead-meta)) / 2);
  }

  /* UNDER A THUMB ITS LINE IS A 44px TARGET (`--tap`), its words still one line in the middle of it. */
  @media (pointer: coarse) {
    .record-look > summary {
      box-sizing: border-box;
      min-block-size: var(--tap);
      padding-block: max(var(--sp-2), calc((var(--tap) - 1lh) / 2));
    }
  }

  .record-look {
    margin-block-start: var(--sp-4);
  }

  /* The hint sits above the control it explains, not beside it: a sentence in a column beside a
     row of swatches is read after the choice has been made. */
  .hint {
    margin: 0 0 var(--sp-3);
    max-inline-size: var(--measure);
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  /* ONE COLUMN ON A PHONE, THE PREVIEW FIRST: a person sees what they are changing before the choices that change it.
     Where the area has room the choices stand beside it, and the preview stays in view while they are pressed. */
  .looks {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--sp-6);
    margin-block-end: var(--sp-4);
  }

  .previews {
    order: -1;
    display: grid;
    gap: var(--sp-4);
  }

  /* ON A PHONE ONE PREVIEW, THE SCHEME PICKED: the other is drawn only beside it, where there is room for both. */
  .preview[data-other] {
    display: none;
  }

  /* BESIDE THE CHOICES WHERE THE AREA HAS ROOM, measured on the area and not the window (UI pass 1 Nov): at 1280 the
     window rule stood both previews beside choices squeezed to 110px, "Colour scheme", "Top bar" and "Needs you" each
     broken over two lines. The picked scheme alone from 640 of area; both from 900. */
  .looks-host {
    container-type: inline-size;
  }

  @container (width >= 640px) {
    .looks {
      grid-template-columns: minmax(18rem, 1fr) auto;
      align-items: start;
    }

    .previews {
      order: 0;
      grid-auto-flow: column;
      grid-auto-columns: 280px;
      position: sticky;
      inset-block-start: var(--page-top);
    }
  }

  @container (width >= 900px) {
    .preview[data-other] {
      display: block;
    }
  }

  /* THREE GROUPS, A HAIRLINE BETWEEN THEM: choices in a group stand a section's small step apart, and the groups twice that. */
  .choices {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
    min-inline-size: 0;
  }

  .group {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
    min-inline-size: 0;
  }

  .group + .group {
    padding-block-start: var(--sp-5);
    border-block-start: 1px solid var(--sep);
  }

  /* A SWITCH'S ROW BRINGS ITS OWN AIR (`--divider-space`, `StateRow`), so the group's gap takes that back. */
  .group-row,
  .group-rows {
    margin-block: calc(-1 * var(--divider-space));
  }

  .group + .group-rows {
    margin-block-end: calc(-1 * var(--divider-space));
    margin-block-start: 0;
    padding-block-start: var(--sp-3);
  }

  .choice {
    display: flex;
    flex-direction: column;
    align-items: start;
    gap: var(--sp-2);
  }

  .choice-name {
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 500;
    line-height: var(--lead-ui);
  }

  /* THE LINE UNDER A CHOICE'S NAME HANGS 4 UNDER IT, half the choice's gap, so name and line read as one label. */
  .choice-line {
    margin-block-start: calc(var(--sp-1) - var(--sp-2));
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  /* A CHOICE ON A PHONE IS THE COLUMN'S WIDTH, so a full segmented control shares it evenly. The density's
     three-line picture goes there, so "Comfortable" fits whole beside its two neighbours instead of scrolling. */
  @media (width < 640px) {
    .choice {
      align-items: stretch;
    }
  }

  /* THE DENSITY'S PICTURE IS DROPPED AT EVERY WIDTH: with it "Compact, Comfortable, Roomy" wrapped to two rows in the
     choices' column beside the previews. */
  .segment .spacing {
    display: none;
  }

  /* ── the segments ── */

  /* THE SEGMENTS CARRY A PICTURE OF THEIR EFFECT before their word: a glyph for the scheme, "Aa" at three sizes, three
     lines at three spacings. A segment is 44 on BOTH axes under a thumb (`controls.css`), and the picture sits on the
     word's line. */
  .segment {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--sp-2);
    min-inline-size: var(--ctl-h);
  }

  .segment :global(svg),
  .aa,
  .spacing {
    flex: none;
    color: var(--ink-3);
  }

  .segment[data-on] :global(svg),
  .segment[data-on] .aa,
  .segment[data-on] .spacing {
    color: var(--ink);
  }

  .aa {
    font-weight: 600;
    line-height: 1;
  }

  .aa[data-size='sm'] {
    font-size: var(--fs-cap);
    line-height: var(--lead-cap);
  }

  .aa[data-size='base'] {
    font-size: var(--fs-body);
  }

  .aa[data-size='md'] {
    font-size: var(--fs-head);
  }

  .spacing {
    display: inline-grid;
    align-content: center;
    inline-size: 14px;
  }

  .spacing > span {
    block-size: 1.5px;
    border-radius: 1px;
    background: currentColor;
  }

  .spacing[data-density='compact'] {
    row-gap: 2px;
  }

  .spacing[data-density='comfortable'] {
    row-gap: 3.5px;
  }

  .spacing[data-density='roomy'] {
    row-gap: calc(5px * var(--dense, 1));
  }

  /* ── the record's colour ── */

  .swatches {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-3);
    padding: var(--sp-1);
  }

  /* A SWATCH IS THE COLOUR, 32 ROUND: chosen, a 2px red ring a gap away and a 20px red tick badge at its top end
     corner, so the state is a shape and never the colour alone. 44 of target under a thumb, the colour still 32. */
  .swatch {
    position: relative;
    display: inline-grid;
    place-items: center;
    inline-size: 32px;
    block-size: 32px;
    padding: 0;
    background: var(--swatch, var(--tile-2));
    border: 0;
    border-radius: var(--r-round);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ink) 12%, transparent);
    cursor: pointer;
  }

  .swatch[data-on] {
    outline: 2px solid var(--red);
    outline-offset: 2px;
  }

  .tick {
    position: absolute;
    inset-block-start: -8px;
    inset-inline-end: -8px;
    display: inline-grid;
    place-items: center;
    inline-size: 20px;
    block-size: 20px;
    border-radius: var(--r-round);
    background: var(--red-fill);
    box-shadow: 0 0 0 2px var(--tile);
    color: var(--on-red);
  }

  .tick :global(svg) {
    inline-size: 12px;
    block-size: 12px;
  }

  .swatch-name {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  /* UNDER A THUMB THE BUTTON IS 44 SQUARE AND THE COLOUR STAYS 32 (P39): the colour, its ring
     and the chosen outline move onto a 32px disc inside, so the target is the button's own box and measures 44. */
  @media (pointer: coarse) {
    .swatches {
      gap: 0;
      padding: 0;
    }

    .swatch {
      inline-size: 44px;
      block-size: 44px;
      background: transparent;
      box-shadow: none;
    }

    .swatch[data-on]:not(:focus-visible) {
      outline: 0;
    }

    .swatch::before {
      content: '';
      position: absolute;
      inset: 6px;
      border-radius: var(--r-round);
      background: var(--swatch, var(--tile-2));
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ink) 12%, transparent);
    }

    .swatch[data-on]::before {
      outline: 2px solid var(--red);
      outline-offset: 2px;
    }

    .tick {
      inset-block-start: -2px;
      inset-inline-end: -2px;
    }
  }

  /* ── the looks ── */

  /* A LOOK IS A WORD ON A RECTANGLE (radius 8), wrapping onto a second line on a phone rather than scrolling. The one
     drawn now takes the working accent's tint AND a tick, so the state is never colour alone. */
  .look-picks {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  .look-pick {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: var(--ctl-h);
    padding-inline: var(--sp-4);
    border: 0;
    border-radius: var(--r-ctl);
    background: var(--tile-2);
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-ctl);
    font-weight: 500;
    cursor: pointer;
  }

  .look-pick[data-on] {
    outline: 2px solid var(--red);
    outline-offset: 2px;
  }

  .look-pick:disabled {
    cursor: progress;
  }

  @media (pointer: coarse) {
    .look-pick {
      min-block-size: var(--tap);
    }
  }

  /* A refusal a person cannot act on teaches them the control is broken, so the floor it missed is
     printed rather than a shrug. */
  .wrong {
    margin: var(--sp-1) 0 0;
    max-inline-size: var(--measure);
    color: var(--red);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  /* ── the preview ── */

  .preview-name {
    margin: 0 0 var(--sp-2);
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-weight: 500;
    line-height: var(--lead-meta);
  }

  /* THE BOARD WITH ONE TILE ON IT: flat, opaque, no border and no shadow. Every colour here is a role the
     look solves, so the scheme's tokens set on this element (`styleOf`) repaint all of it, words included. */
  .pv {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    padding: var(--sp-3);
    border-radius: var(--r-tile);
    background: var(--board);
    color: var(--ink);
  }

  .pv-bar {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    padding: var(--sp-2) var(--sp-3);
    border-radius: var(--r-ctl);
    background: var(--nav);
  }

  /* THE MARK WEARS THE RECORD'S COLOUR, which is where a person sees the colour they chose. */
  .pv-mark {
    inline-size: 18px;
    block-size: 14px;
    border-radius: var(--r-xs);
    background: var(--red-fill);
    transition: background var(--d-state) var(--ease-out);
  }

  .pv-place {
    inline-size: 36px;
    block-size: 6px;
    border-radius: var(--r-round);
    background: color-mix(in srgb, var(--ink) 18%, transparent);
  }

  .pv-place[data-on] {
    background: var(--ink);
  }

  .pv-tile {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    padding: var(--sp-4);
    border-radius: var(--r-tile);
    background: var(--tile);
  }

  /* THE PREVIEW'S ROWS END ITS TILE: the last row's own block padding stood its well 26 off the foot against 16 at the
     top, so the list gives that padding back. */
  .pv-rows {
    margin-block-end: calc(-1 * var(--row-pad-y));
  }

  .pv-head {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }

  .pv-title {
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 600;
  }

  /* THE SENTENCE AND THE ROWS READ `--fs-body`, the size chosen, and the rows `--row-h` through the list they sit in. */
  .pv-said {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: var(--lh-body);
    transition: font-size var(--d-state) var(--ease-out);
  }

  .pv-needs {
    color: var(--red);
    font-weight: 500;
  }

  /* ONE LINE EACH, CUT WITH AN ELLIPSIS, at every width: a phone's card lets a title wrap, and a long question wrapped
     made the preview, and every choice under it, as tall as the record's words. */
  .pv-row {
    color: var(--ink-2);
    font-size: var(--fs-body);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    transition: font-size var(--d-state) var(--ease-out);
  }

  /* A ROW WITH NO WORD YET is a quiet bar a word's height, so the row stands as tall as a filled one. */
  .pv-row:empty::before {
    content: '';
    display: inline-block;
    inline-size: 9rem;
    block-size: 0.7em;
    border-radius: var(--r-xs);
    background: var(--rule);
    vertical-align: middle;
  }
</style>

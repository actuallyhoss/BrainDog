<!--
  The first run. ONE ROW, TYPED BY HAND.

  Not pack selection, not a capture box, not a dashboard. Three properties matter and each was
  arrived at by deleting something (19 §6):

    - No pack vocabulary on screen one. The word "pack" does not appear until the user goes looking
      for a second register.
    - No model, no agent, no MCP required. Everything here works on a fresh self-host with nothing
      configured — an earlier draft made the core loop a capture field whose rows come from a model,
      which v1 does not ship and self-host does not have. A first run that depends on an absent
      component is not a first run.
    - Nothing to approve. Selecting a PACK means reading an install diff written in the language of
      metrics and nav order, and asking a brand-new user to approve four schema reviews before they
      have seen one of their own rows is worse than a tour.

  And there is no skip, because a record with zero registers has no legal screen.

  AHEAD OF ALL OF IT, "Who are you?" (`loop/research-modular.md` §2): a sentence, read without a
  model, said back, and written as the person's own People row when the first row is added.

  THEN "What's your business?" (`loop/research-modules.md` §5), turn 2: a sentence read by `shape.ts`,
  said back in two columns, and made into lists and first rows by one press. The one-row screen above
  is still here, one press away, for somebody who would rather choose (§9 ruling 11).
-->
<script lang="ts">
  import { onDestroy, tick, untrack } from 'svelte';
  import { createClient } from '@braindog/client';
  import { titleOf } from '$lib/title.ts';
  import { copy } from '$lib/copy.ts';
  import { firstRun } from '$lib/first-run.ts';
  import { INSTALL_ORDER, LEANS_ON, shape, titleOfRow, toTurnOn, type PackId, type Shape } from '$lib/shape.ts';
  import { USE_CASES, alongside, arrange, listsOf, modulesFor, pagesOf, type UseCase } from '@braindog/seed/usecases';
  import { carriedDocument, dayOf, moduleDocument, moduleManifest } from '@braindog/seed/usecases/install';
  import { linkExamples } from '@braindog/seed/usecases/links';
  import { PACKS } from '$lib/record/data.ts';
  import { REGISTERS } from '$lib/record/api.ts';
  import { choose as recordOrSample } from '$lib/record/packs.ts';
  import { methods } from '$lib/auth.ts';
  import { addKey } from '$lib/start.ts';
  import { hear, introduce, personRow, withChip, type Heard } from '$lib/who.ts';
  import { covered, silenced, typing } from '$lib/a11y/keys.svelte.ts';
  import Define from '$lib/ui/Define.svelte';
  import Mark from '$lib/ui/Mark.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import RowForm from '$lib/ui/RowForm.svelte';
  import type { IconName } from '$lib/ui/icons.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { drew } from '../../lib/ui/screen.svelte.ts';
  import * as pending from '$lib/record/pending.svelte.ts';
  import type { Fields } from '$lib/record/schema.ts';

  /* The five live in `copy.ts` with every other sentence in the product, so the scope this screen
     claims can be checked against the rest of it in one pass rather than found in a component. */
  const CHOICES = firstRun.firstChoices;

  /**
   * WHETHER THERE IS A RECORD BEHIND THIS SCREEN, AND THE SHELL IS WHAT SAYS SO.
   *
   * `data.live` is the root layout's one answer to `boot`, asked once and kept for the tab. It is
   * the same signal the list draws its waiting rows against and the shell counts them with, so
   * reading it here is what makes the screen that TAKES a row and the screen that SHOWS it one
   * record. This screen used to ask `packs` and work the answer out again from that call's own
   * refusal, which is a second answer to a question that has one.
   */
  const sampled = $derived(!page.data.live);

  let picked = $state<string | null>(null);
  /* What the generated form would refuse, bound out of it so the button can be dead while it is
     true rather than answering a press with a toast. */
  let problems = $state<string[]>([]);
  /** What the form holds, so the submit can put the row somewhere rather than describing it. */
  let taken = $state<Fields>({});
  /**
   * The sequence the pending row was given.
   *
   * IT WAS WRITTEN AND READ NOWHERE, and what that cost is one row per press. This screen does not
   * navigate away from its own outcome, so the form is still on screen with everything still in it
   * and the button still live: correcting a typo and pressing again is the ordinary thing to do,
   * and it left a second row rather than a corrected one. Holding the sequence is what lets the
   * second press mean what somebody meant by it.
   */
  let made = $state<number | null>(null);

  /** What the record did with the typed row: the sequence it got, or why it did not land. */
  type Saved = { ok: true; seq: number | null } | { ok: false; why: string };

  /**
   * What the record did with it, and `null` while the demo is holding the row instead.
   *
   * THE SEQUENCE IS HELD FOR THE REASON `made` IS HELD. This screen does not navigate away from its
   * own outcome, so the form is still on screen with everything in it and the button still live:
   * correcting a typo and pressing again is the ordinary thing to do, and on a record that press
   * has to change the row it wrote rather than leave a second one behind.
   */
  let saved = $state<Saved | null>(null);

  /** The submit is out, so Enter held down does not send the same row twice. */
  let writing = $state(false);

  /**
   * The number under each choice, and it did nothing.
   *
   * THE KEYBOARD SHEET DOCUMENTS IT — "AT THE GATE · `1–9` Highlight an option. It does not choose
   * it" — and `/decide` obeys. This screen DRAWS the badges and had no handler, so the one place the
   * hint is printed on the control it describes was the one place pressing it did nothing.
   *
   * HIGHLIGHT AND NOT CHOOSE, exactly as the sheet says. A number that committed would make a
   * mis-keyed digit the first irreversible act somebody performs, on the screen 19 §6 says has no
   * skip; a number that moves focus lets them read what they landed on and press Enter.
   */
  let lit = $state(-1);

  function key(e: KeyboardEvent) {
    if (picked !== null || e.metaKey || e.ctrlKey || e.altKey) return;
    /* THE NUMBERS NAME THE FIVE CARDS, and the cards are drawn only on the list. */
    if (!fromList) return;
    /* A DIGIT TYPED INTO "Who are you?" is part of the answer, not a jump to a choice. */
    if (typing()) return;
    /* AND NOT WHILE SOMETHING IS OPEN OVER THE PAGE. This screen draws no sheet of its own, and
       the shell's palette opens over every route: `1` to `5` moved the highlight behind it. See
       `covered`, which six route handlers needed and none of them had. */
    if (covered()) return;
    /* AND THE SWITCH, WHICH THIS SCREEN ALONE DID NOT HONOUR. `Character keys: off` is the app's
       stated WCAG 2.1.4 mechanism (`19 §4`) and `1`–`5` here are bare letters by any reading. Every
       other bare-key handler in the product asks; the first screen anybody sees did not. */
    if (silenced(e)) return;
    const n = Number(e.key);
    if (!Number.isInteger(n) || n < 1 || n > CHOICES.length) return;
    e.preventDefault();
    lit = n - 1;
    queueMicrotask(() => choices?.querySelectorAll('button')[lit]?.focus());
  }

  let choices = $state<HTMLDivElement | undefined>(undefined);

  /* ── turn 1: who are you ─────────────────────────────────────────────── */

  /* The sentence stays in memory and never in the address (`research-modules.md` §5). Component
     state survives `?add=` because that is the same route, so going Back finds the answer kept. */
  let who = $state('');
  let heard = $state<Heard | null>(null);
  /* Said back with an edit button once focus leaves the answer or Enter is pressed. While the
     field has focus it stays a field, so the screen never takes it from under somebody typing. */
  let settled = $state(false);
  let field = $state<HTMLInputElement | undefined>(undefined);
  let question = $state<HTMLHeadingElement | undefined>(undefined);
  let hearing: ReturnType<typeof setTimeout> | undefined;
  onDestroy(() => clearTimeout(hearing));

  function listen() {
    clearTimeout(hearing);
    heard = who.trim() ? hear(who) : null;
  }

  /* 250 ms, the palette's debounce for its own live region: a reader is told once per pause. */
  function typed() {
    clearTimeout(hearing);
    hearing = setTimeout(listen, 250);
  }

  function chip(words: string) {
    who = withChip(who, words);
    settled = false;
    listen();
    void tick().then(() => {
      field?.focus();
      field?.setSelectionRange(who.length, who.length);
    });
  }

  function enter(e: KeyboardEvent) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    listen();
    if (!heard) return;
    settled = true;
    void tick().then(() => question?.focus());
  }

  /* DECIDED AFTER THE DOM SETTLES, not from `relatedTarget`: pressing Edit removes the focused button,
     and judging that focusout on the spot would settle the answer straight back. */
  function leave(e: FocusEvent) {
    const box = e.currentTarget as HTMLElement;
    void tick().then(() => {
      if (box.contains(document.activeElement)) return;
      listen();
      if (heard) settled = true;
    });
  }

  /* THE CARET GOES IN ON ARRIVAL AND ON EDIT, at the end of what is there. `who` is read untracked,
     or every keystroke would put the caret back at the end. */
  $effect(() => {
    if (!field) return;
    field.focus();
    const end = untrack(() => who.length);
    field.setSelectionRange(end, end);
  });

  /* ── turn 2: what's your business ────────────────────────────────────── */

  /* In memory like turn 1's answer, never in the address. */
  let about = $state('');
  let read = $state<Shape | null>(null);
  let area = $state<HTMLTextAreaElement | undefined>(undefined);
  let reading: ReturnType<typeof setTimeout> | undefined;
  onDestroy(() => clearTimeout(reading));

  function understand() {
    clearTimeout(reading);
    read = about.trim() ? shape(about, new Date().toISOString().slice(0, 10)) : null;
  }

  /* ── what this BrainDog is for: the use case suggested (`loop/research-spark.md` §3, tier A) ── */

  /* THE SENTENCE FIRST, AND TURN 1'S WORDS WHEN IT SAYS NOTHING. "I'm a student" in turn 1 is as much an
     answer as the same words here, and the proposal's reasons are phrases of whichever one was read. */
  const arranged = $derived.by(() => {
    if (!read || read.declined === 'language') return null;
    const own = arrange(about);
    return own.pick || !heard?.bio ? { ...own, from: about } : { ...arrange(heard.bio), from: heard.bio };
  });
  /** A use case the person chose over the suggestion, by id. Kept while they keep typing. */
  let picked_use = $state<string | null>(null);
  const proposal = $derived<UseCase | null>(USE_CASES.find((u) => u.usecase === picked_use) ?? arranged?.pick ?? null);
  /** The other use cases for one person that the sentence also described, installed after the proposal: Student beside Personal. */
  const beside = $derived<UseCase[]>(arranged ? alongside(arranged, proposal) : []);

  const said_as = (u: UseCase): string => {
    const lines = Object.values(u.voice).slice(0, 3).map(firstRun.useQuoted);
    return lines.length > 0 ? firstRun.useVoice(u.tone, firstRun.shapeAnd(lines)) : firstRun.useHouseVoice;
  };

  /** The first-party packs to turn on: the use case's own, what the sentence named, and what each leans on, in order. */
  function modulesToTurnOn(now: Shape | null, person: boolean, u: UseCase | null): PackId[] {
    const heardPacks: string[] = now && now.declined === null ? toTurnOn(now, person) : person ? ['people'] : [];
    const wanted = new Set<PackId>((u ? [...modulesFor(u, heardPacks), ...beside.flatMap((b) => b.modules)] : heardPacks) as PackId[]);
    for (let grew = true; grew; ) {
      grew = false;
      for (const id of [...wanted])
        for (const needs of LEANS_ON[id] ?? [])
          if (!wanted.has(needs)) {
            wanted.add(needs);
            grew = true;
          }
    }
    return INSTALL_ORDER.filter((id) => wanted.has(id));
  }

  /* Turn 1's 250 ms, so both answers are said back on the same beat. */
  function aboutTyped() {
    clearTimeout(reading);
    reading = setTimeout(understand, 250);
  }

  function aboutChip(words: string) {
    about = withChip(about, words);
    understand();
    void tick().then(() => {
      area?.focus();
      area?.setSelectionRange(about.length, about.length);
    });
  }

  const packOf = (id: string) => PACKS.find((p) => p.id === id);

  /** A pack as the rail names it: its page's title, else its first list's name. */
  function packName(id: string): string {
    const p = packOf(id);
    if (!p) return id;
    const page = p.pages[0];
    return (page ? p.titles?.[page] : undefined) ?? REGISTERS[p.registers[0] ?? '']?.name ?? p.name;
  }

  /* A PHRASE THE USE CASE HEARD COUNTS AS HEARD, so "homework and exams" is two things heard and not "nothing here". */
  const useHeard = $derived(arranged && proposal && arranged.from === about ? (arranged.ranked.find((r) => r.usecase === proposal)?.why ?? []) : []);
  const shapeSaid = $derived(
    !read || read.declined === 'empty'
      ? ''
      : read.declined === 'language'
        ? firstRun.shapeLanguage
        : read.declined === 'unread' && useHeard.length === 0
          ? proposal
            ? ''
            : firstRun.shapeUnread
          : firstRun.shapeHeardCount((read.declined === null ? read.heard.length : 0) + useHeard.filter((w) => !(read?.heard ?? []).some((h) => w.at < h.at + h.text.length && h.at < w.at + w.text.length)).length),
  );

  /** "Your record": each list that will be on, with the rows it gets and what a row still needs. */
  const lists = $derived.by(() => {
    const now = read;
    if (!now || now.declined === 'empty' || now.declined === 'language' || (now.declined !== null && !proposal)) return [];
    const person = heard?.name ?? null;
    const own = proposal ? [proposal, ...beside].flatMap(listsOf).map((l) => ({ id: l.id, name: l.name, rows: [] as { title: string; note: string | null }[] })) : [];
    return [...own, ...modulesToTurnOn(now, person !== null, proposal).map((id) => ({
      id,
      name: packName(id),
      rows: [
        ...(id === 'people' && person ? [{ title: person, note: firstRun.shapeYou }] : []),
        ...now.rows
          .filter((r) => packOf(id)?.registers.includes(r.register))
          .map((r) => ({
            title: titleOfRow(r),
            note: r.missing.length > 0 ? firstRun.shapeNeeds(firstRun.shapeAnd(r.missing.map((m) => firstRun.shapeMissing[m] ?? m))) : null,
          })),
      ],
    }))];
  });

  type Outcome = { made: { name: string; list: string; register: string }[]; onward: { register: string; list: string } | null; on: string[]; added: string[]; absent: string[]; refused: string[]; waiting: boolean };
  let outcome = $state<Outcome | null>(null);
  let making = $state(false);
  let kept = $state<HTMLDivElement | undefined>(undefined);
  /** Rows this screen already made, by register and title, so a second press corrects or skips rather than duplicates. */
  const madeRows = new Map<string, number>();

  /**
   * Make my record: turn the lists on, write the rows the sentence filled, and meet the person.
   *
   * THE SAME SOURCE `/packs` READS, so a live record and the demo take one path. A pack that is off
   * is turned on. A first-party pack a live record does not hold is added from its own document,
   * planned and then installed with that plan's hash, in the order `toTurnOn` gives, which puts
   * every list after the ones it points at. A plan or an install that is refused is said in one
   * sentence and nothing is made in that list. The demo holds every first-party pack, so a pack it
   * lacks is only named.
   */
  async function make() {
    understand();
    const now = read;
    const u = proposal;
    if (!now || making || (now.declined !== null && !(u && now.declined === 'unread'))) return;
    making = true;
    try {
      const client = createClient({ base: location.origin });
      const chosen = await recordOrSample(client, sampled);
      const installed = chosen.first.ok ? chosen.first.value : [];
      const out: Outcome = { made: [], onward: null, on: [], added: [], absent: [], refused: [], waiting: chosen.source.sample };

      /* The lists this record holds with their pack on, so a pack is added only after what it points at. */
      const held = new Set(installed.filter((p) => p.disabled_at === null).flatMap((p) => p.registers));
      const usable = new Set<string>();
      for (const id of modulesToTurnOn(now, Boolean(heard?.name), u)) {
        const state = installed.find((p) => p.id === id);
        if (!state) {
          /* ANY OF THE SIX MODULES, the agents pack among them: a sentence that mentions agents adds it on a record. */
          const doc = chosen.source.sample ? null : moduleManifest(id);
          if (!doc) {
            out.absent.push(packName(id));
            continue;
          }
          const refused = await addPack(client, id, held, u);
          if (refused) {
            out.refused.push(refused);
            continue;
          }
          out.added.push(packName(id));
          usable.add(id);
          continue;
        }
        if (state.disabled_at !== null) {
          const on = await chosen.source.enable(id);
          if (!on.ok) {
            out.refused.push(firstRun.shapeRefused(packName(id), on.refusal.fix));
            continue;
          }
          if (on.value.changed) out.on.push(packName(id));
          for (const r of state.registers) held.add(r);
        }
        usable.add(id);
      }

      /* THE USE CASE'S OWN PACK, after the modules it builds on: its lists, its pages and its voice. A
         pack already here that is off is turned on; one that is here and on is left as it is. Then each use case the
         sentence described beside it, so the proposed one goes in first and its voice is the one the record speaks in. */
      for (const one of u ? [u, ...beside] : []) {
        const doc = carriedDocument(one, dayOf(Date.now()));
        if (!doc) continue;
        const id = String(doc.pack);
        const state = installed.find((p) => p.id === id);
        const names = listsOf(one).map((l) => l.name);
        const lacking = one.modules.filter((m) => !usable.has(m));
        if (chosen.source.sample) out.absent.push(...names);
        else if (lacking.length > 0) out.refused.push(firstRun.shapeNeedsFirst(one.title, firstRun.shapeAnd(lacking.map(packName))));
        else if (state && state.disabled_at !== null) {
          const on = await chosen.source.enable(id);
          if (!on.ok) out.refused.push(firstRun.shapeRefused(one.title, on.refusal.fix));
          else if (on.value.changed) out.on.push(...names);
        } else if (!state) {
          const planned = await client.planPack({ doc });
          const planHash = planned.ok ? ((planned.value as { diff?: { planHash?: string } }).diff?.planHash ?? '') : '';
          const done = planned.ok ? await client.call('installPack', { doc, planHash }) : planned;
          if (!done.ok) out.refused.push(firstRun.shapeNotAdded(one.title, 'refusal' in done ? done.refusal.fix : firstRun.shapeChanged));
          else {
            out.added.push(...names);
            /* A SEED CARRIES NO LINK (42 §5.2), so the examples are pointed at each other now they are in: a student's
               assignment at its course, a guide's step at its milestone (`links.ts`). A refused link is skipped. */
            await linkExamples(
              {
                rows: async (register) => {
                  const read = await client.list({ register, limit: 200 });
                  return read.ok ? (read.value.rows as { seq: number | null; fields: Record<string, unknown> }[]) : null;
                },
                link: async (register, seq, field, spoken) => (await client.update({ register, seq, patch: { [field]: spoken } })).ok,
              },
              one.usecase,
            );
          }
        }
      }

      /* The sequence each row got, by its index in the shape, so an invoice can point at its client. */
      const seqs: (number | null)[] = [];
      for (const [i, row] of (now.declined === null ? now.rows : []).entries()) {
        seqs[i] = null;
        const pack = PACKS.find((p) => p.registers.includes(row.register))?.id ?? '';
        if (row.missing.length > 0 || !usable.has(pack)) continue;
        const title = titleOfRow(row);
        const list = REGISTERS[row.register]?.name ?? row.register;
        const key = `${row.register}:${title}`;
        const had = madeRows.get(key);

        if (chosen.source.sample) {
          /* NO `party` ON THE DEMO: a waiting row cannot point at another waiting row, because the
             demo resolves a ref against the seed's rows and would print `people#-1`. */
          const fields: Fields = { ...row.fields };
          if (had === undefined || !pending.replace(row.register, had, fields)) madeRows.set(key, pending.add(row.register, fields, chosen.source.sample));
          out.made.push({ name: title, list, register: row.register });
          continue;
        }

        if (had !== undefined) {
          seqs[i] = had;
          continue;
        }
        const party = row.party === undefined ? null : (seqs[row.party] ?? null);
        const done = await client.create({ register: row.register, fields: { ...row.fields, ...(party === null ? {} : { party: `people#${party}` }) } });
        if (!done.ok) {
          out.refused.push(firstRun.shapeRefused(title, 'refusal' in done ? done.refusal.fix : ''));
          continue;
        }
        const seq = (done.value as { seq?: number | null }).seq ?? null;
        if (seq !== null) {
          madeRows.set(key, seq);
          seqs[i] = seq;
        }
        out.made.push({ name: title, list, register: row.register });
      }

      /* TURN 1'S ROW IN THE SAME PRESS, after People is on, so `remember` reads it as on. */
      await remember();
      /* THE WAY ONWARD IS THERE WHENEVER A LIST IS. It used to follow only a made row, so a sentence
         that named a client and no invoice added four lists, said "Your lists are ready." and ended
         the screen with no way into any of them. The first row made, else the first list now on in
         the order the sentence named them, so "I send invoices" opens Money and not the Projects
         list Money happened to need first. */
      const named = [...new Set([...now.packs.filter((p) => p.why.length > 0).map((p) => p.id as string), ...usable])];
      const firstOn = named.filter((id) => usable.has(id)).map((id) => packOf(id)?.registers[0]).find((r): r is string => Boolean(r));
      /* A USE CASE'S OWN FIRST LIST BEFORE A MODULE IT BUILDS ON, so a student lands on Assignments and not on People. */
      const ownFirst = u && (out.added.length > 0 || out.on.length > 0) ? listsOf(u).at(-1) : undefined;
      out.onward = out.made[0] ?? (ownFirst ? { register: ownFirst.id, list: ownFirst.name } : firstOn ? { register: firstOn, list: REGISTERS[firstOn]?.name ?? firstOn } : null);
      /* THE SHELL READS THE RECORD AGAIN, so the rail shows the new lists and pages and speaks in the new voice. */
      if (!chosen.source.sample) (await import('$lib/record/boot-live.ts')).forget();
      outcome = out;
      await tick();
      kept?.scrollIntoView({ block: 'nearest' });
    } finally {
      making = false;
    }
  }

  /**
   * Add one first-party pack to a live record: what it points at first, then its plan, then the
   * install that approves exactly that plan. Answers the sentence to show when it was not added.
   *
   * THE MANIFEST IS CHECKED HERE because the document names no pack it depends on (a record whose
   * lists came from the seed has no `pack` row for them), and the record installs a list whose fields
   * point at one it does not hold.
   */
  async function addPack(client: ReturnType<typeof createClient>, id: PackId, held: Set<string>, u: UseCase | null): Promise<string | null> {
    const manifest = moduleManifest(id);
    if (!manifest) return firstRun.shapeAbsent(packName(id));
    const lacking = manifest.requires.map((r) => r.slice('register.'.length)).filter((r) => !held.has(r));
    if (lacking.length > 0) return firstRun.shapeNeedsFirst(packName(id), firstRun.shapeAnd(lacking.map((r) => REGISTERS[r]?.name ?? r)));
    /* THE MODULE AS THIS USE CASE INSTALLS IT: its example rows or none, never the sample studio's, and a link to a
       list this record will not hold (People's "Met in" without Projects) left out (`install.ts`). */
    const holds = [...held, ...manifest.provides.flatMap((p) => (p.startsWith('register.') ? [p.slice('register.'.length)] : []))];
    const doc = moduleDocument(u, id, { today: dayOf(Date.now()), holds });
    if (!doc) return firstRun.shapeAbsent(packName(id));

    const planned = await client.planPack({ doc });
    if (!planned.ok) return firstRun.shapeNotAdded(packName(id), 'refusal' in planned ? planned.refusal.fix : firstRun.shapeChanged);
    const planHash = (planned.value as { diff?: { planHash?: string } }).diff?.planHash ?? '';
    const done = await client.call('installPack', { doc, planHash });
    if (!done.ok) return firstRun.shapeNotAdded(packName(id), 'refusal' in done ? done.refusal.fix : firstRun.shapeChanged);

    for (const p of manifest.provides) if (p.startsWith('register.')) held.add(p.slice('register.'.length));
    return null;
  }

  /**
   * Make sure the list a typed row goes into is there and on, before the row is sent.
   *
   * A FRESH RECORD HOLDS NO LISTS, so the one-row path refused its own first row with "There is no
   * register called services" while the sentence path, which adds its lists first, worked. The same
   * `addPack` the sentence path uses, with whatever the pack points at added ahead of it. Answers the
   * sentence to show when the list could not be made ready, and `null` when it is.
   */
  async function ensure(client: ReturnType<typeof createClient>, chosen: Awaited<ReturnType<typeof recordOrSample>>, register: string): Promise<string | null> {
    const installed = chosen.first.ok ? chosen.first.value : [];
    const held = new Set(installed.filter((p) => p.disabled_at === null).flatMap((p) => p.registers));
    if (held.has(register)) return null;
    const ready = async (reg: string, depth: number): Promise<string | null> => {
      if (held.has(reg)) return null;
      const id = PACKS.find((p) => p.registers.includes(reg))?.id;
      if (!id || depth > 4) return firstRun.shapeAbsent(REGISTERS[reg]?.name ?? reg);
      const state = installed.find((p) => p.id === id);
      if (state) {
        const on = await chosen.source.enable(id);
        if (!on.ok) return firstRun.shapeRefused(packName(id), on.refusal.fix);
        for (const r of state.registers) held.add(r);
        return null;
      }
      const manifest = moduleManifest(id);
      if (!manifest) return firstRun.shapeAbsent(packName(id));
      for (const need of manifest.requires) {
        const refused = await ready(need.slice('register.'.length), depth + 1);
        if (refused) return refused;
      }
      return addPack(client, id as PackId, held, null);
    };
    return ready(register, 0);
  }

  /** Which of the two ways in is on screen. In the address, so Back from the list returns to the sentence. */
  const fromList = $derived(page.url.searchParams.has('list'));

  /* ── turn 3: the person's own People row ─────────────────────────────── */

  let known = $state<{ name: string; waiting: boolean } | null>(null);
  /** The demo's waiting People row, so a second press corrects it rather than adding another. */
  let me: number | null = null;
  /** Who a live record has already met from this screen, so a second press does not meet them twice. */
  let met: string | null = null;

  /**
   * Meet the person who answered turn 1.
   *
   * THE SAME SOURCE `/packs` READS: the record when there is one, which also says whether People is
   * on, and the sample when there is not. A refusal is not drawn. The row they typed is this
   * screen's outcome, and a People row that could not be made is not a failure of it.
   */
  async function remember() {
    const now = heard;
    if (!now?.name) return;
    const client = createClient({ base: location.origin });
    const chosen = await recordOrSample(client, sampled);
    const packs = chosen.first.ok ? chosen.first.value : null;
    if (chosen.source.sample) {
      const asked = introduce(now, null, packs);
      if (!asked) return;
      const row = personRow(asked, now.bio);
      if (me === null || !pending.replace('people', me, row)) me = pending.add('people', row, chosen.source.sample);
      known = { name: asked.name, waiting: true };
      return;
    }
    const signed = await methods();
    const asked = introduce(now, signed.ok ? (signed.value.me?.email ?? null) : null, packs);
    if (!asked || met === asked.name) return;
    const out = await client.meet(asked);
    if (!out.ok) return;
    met = asked.name;
    known = { name: asked.name, waiting: false };
  }

  /* THE FORM PUTS ITS OWN CARET IN. This screen used to hold a `field` binding nothing ever bound —
     the form below is generated from the declaration, so the page cannot reach its first input — and
     the `focus()` was a no-op for its whole life. `RowForm`'s `autofocus` does it from inside, where
     the first control is. */

  /**
   * CHOOSING A CARD IS A NAVIGATION, and it was a variable.
   *
   * Both first-run screens lived at `/start` with the choice in component state, so the FIRST screen
   * of the product broke the browser two ways at once. Back from the form left `/start` entirely and
   * landed on `/` — a stranger's fully populated record, nineteen controls, on somebody's first
   * thirty seconds. Reload went to screen one and threw away the row they had typed.
   *
   * THE ADDRESS ALREADY EXISTED. `?add=<register>` is read below, honoured once per value, and
   * accepts the word on the tile as well as the register id — screen two's own cards navigate to it.
   * The five cards on screen one were the only thing that reached the form without it.
   *
   * `19 §5`'s rule decides it: what defines WHICH SCREEN YOU ARE LOOKING AT belongs in the URL. The
   * caret, the typed values and the validation stay where they are, because those are about the
   * moment rather than the place.
   */
  const choose = (key: string) => void goto(`/start?add=${key}`, { keepFocus: true });

  /**
   * `/start?add=<register>` LANDS ON THAT REGISTER'S FORM.
   *
   * Screen two's cards send people here to add a second kind of thing, and this screen ignored the
   * parameter — so every card dropped them back on the choice list they had already answered, one
   * step further back than where they pressed. A deep link that lands somewhere else is worse than
   * no deep link: they have to work out that they are in the right place and just earlier.
   *
   * ONLY A KEY THIS SCREEN OFFERS. The parameter comes from a URL, and a register the choice list
   * does not carry has no question written for it.
   */
  /**
   * AND IT TAKES THE WORD ON THE TILE, not only the register id behind it.
   *
   * THE FIVE TILES SAY *Money*, *Services*, *People*, *Projects*, *Work* and the five keys are
   * `obligations`, `services`, `people`, `things`, `tasks` — so three of the five words a person can
   * read on this screen fell through to the choice list. Nothing on the page writes the parameter,
   * so nothing was broken; it is a link somebody types or shares from what is in front of them, and
   * it worked two times in five.
   *
   * NORMALISED TO LETTERS AND DIGITS, and `the` dropped from the front, so `the-services`, `The
   * Services` and `services` are one thing. Not a fuzzy match: an exact comparison against two
   * names the screen already publishes. The second tile said *The estate* when that rule was
   * written, which is what the dropped `the` was for; `start.ts` records what the rename cost it.
   */
  /**
   * AND IT IS HONOURED ONCE PER VALUE, WHICH IS WHAT MAKES *Back* WORK.
   *
   * THE GUARD WAS `picked === null`, AND `picked` IS READ INSIDE THE EFFECT — so pressing Back set it
   * to null, the effect re-ran, saw null, and put the person straight back on the form they had just
   * left. Arriving by `?add=` meant there was no way out of that screen except the browser's own
   * back button.
   *
   * REMEMBERING THE PARAMETER instead of the state fixes both halves: the effect no longer depends
   * on `picked` at all, and a genuinely different `?add=` — an in-app navigation to another one —
   * still lands where it says.
   */
  /**
   * WHETHER THIS SCREEN HAS ALREADY ANSWERED. Reset by the effect below whenever the choice changes,
   * so going Back and picking a different list does not arrive pre-answered.
   */
  let said = $state(false);

  let honoured: string | null = null;

  /* AND IT MIRRORS THE ADDRESS BOTH WAYS, which is the half that makes Back mean anything.
     
     It only ever SET the choice, so leaving `?add=` behind — the browser's Back, or this screen's
     own — changed the URL and left the form on screen: you were at `/start`, looking at the second
     screen, with no way to the first except pressing Back again into whatever came before the
     product. An unknown key resets too, because a register the choice list does not carry has no
     question written for it and screen one is the honest landing. */
  $effect(() => {
    const asked = page.url.searchParams.get('add');
    if (asked === honoured) return;
    honoured = asked;
    picked = (asked ? addKey(asked, CHOICES) : undefined) ?? null;
    /* AND THE ANSWER GOES WITH THE QUESTION. Going Back and choosing a different list must not land
       on somebody else's outcome, which is the same bug the `picked === null` guard above had in a
       different place. */
    said = false;
    /* AND THE ROW GOES WITH IT. `made` is a sequence inside ONE register's waiting list, so carrying
       it across a change of choice would point the next press's `replace` at a row in a list nobody
       is looking at. The row already added stays where it is and keeps its own `Put back`. */
    made = null;
    /* AND THE WRITTEN ROW GOES WITH IT TOO, for the same reason one list further along: `saved`
       holds a sequence inside one register, so carrying it across a change of choice would point
       the next press's update at a row in a list nobody is looking at. The row that was written
       stays in the record, where it belongs. */
    saved = null;
  });

  const choice = $derived(CHOICES.find((c) => c.key === picked));

  /**
   * What the row is called, and the list it went to, for the sentences that say where it is.
   *
   * THE LIST IS NAMED BY THE REGISTER AND NOT BY THE TILE. Four of the five are one word either way.
   * The fifth tile says *Work* and opens a list whose head says *Tasks*, so "See Work as it comes"
   * was a button naming a place it did not go. The outcome names what the reader will see.
   */
  const thing = $derived(choice ? (firstRun.firstThing[choice.key] ?? choice.label) : '');
  const list = $derived(choice ? (REGISTERS[choice.key]?.name ?? choice.label) : '');

  /**
   * The first row.
   *
   * IT IS A WRITE NOW, WHEREVER THERE IS A RECORD TO TAKE IT. This function had no live branch at
   * all: it put the row in `pending` and said "Nothing was saved yet." whatever it was looking at.
   * So the person most likely to have a record of their own pressed the most consequential button
   * in the product, on the screen `19 §6` is written around, and was told the one true fact they
   * had typed went nowhere. It had gone nowhere, and they had to type it again somewhere else.
   *
   * THE DEMO IS UNCHANGED, AND SO IS THE ARGUMENT FOR IT. There is no record behind the sample, so
   * the row waits in `pending` and wears `Not saved` on the list, which is what that half of this
   * function has always said and is still the truth about it.
   *
   * WHICH ONE IS THE SHELL'S ANSWER, AND IT USED TO BE THIS SCREEN'S OWN. `recordOrSample` asked
   * `packs` and read "there is no record here" out of that call's refusal, while every other screen
   * reads it out of `boot`. One transient `UNREACHABLE` on either call was then enough for the
   * screen that TAKES the row and the list that DRAWS it to disagree, with nothing broken and no
   * state flipped: the row waited against the sample under a live list, which holds none of the
   * sample's rows, and the sentence below said it was at the top of a list it was not on. `sampled`
   * is the shell's one answer, so the three presses here and every screen after them read the same
   * record.
   */
  async function commit(event: SubmitEvent) {
    event.preventDefault();
    if (!choice) return;
    /* THE BUTTON IS ALREADY DISABLED WHEN THIS IS TRUE. Kept as the second door, because Enter in a
       text field submits a form whatever its button looks like. */
    if (problems.length > 0) return;
    /* AND THE SAME DOOR FOR A PRESS WHILE ONE IS IN FLIGHT, which on a record is a second row. */
    if (writing) return;
    writing = true;
    try {
      const client = createClient({ base: location.origin });
      const chosen = await recordOrSample(client, sampled);
      if (chosen.source.sample) {
        /**
         * AND THE ROW IS THE ROW THEY THEN SEE, which it was not.
         *
         * A friction pass ranked this first of the ten things costing a person the most, and the
         * measurement is the whole argument: four clicks, twenty-five keystrokes, six decisions,
         * three screens, **zero rows**. The list this screen offers to open holds thirty-eight rows
         * belonging to a fictional studio and the one thing the person typed is nowhere in it, with
         * nothing on either screen saying why.
         *
         * IT IS NOT A WRITE AND IT DOES NOT CLAIM TO BE. `pending` holds it for the life of the
         * tab, the list draws it where it will be, and it wears `Not saved` on the row: the same
         * receipt every other verb in this product leaves, so a person meets one product rather
         * than one product and one exception. The sentence under this form already says nothing was
         * saved; what changes is that the row exists to be looked at while that is true.
         */
        /* PRESSING AGAIN CORRECTS THE ROW, it does not add another. `replace` answers `false` when the
           row is no longer waiting, which is what happens after `Put back` on the list, and then this
           adds one as it did the first time rather than quietly restoring a row somebody removed. */
        /* THE FIRST PRESS DOES NOT TOAST ANY MORE, AND THE SECOND ONE DOES. Both used to, and the first
           read "the first row in Money would be written, but nothing was saved yet.": lower case, and
           drawn at y 713 to 776 on a 390px phone straight across the outcome below, whose first line
           said the same thing. That outcome IS this screen's answer, for the reason written over it, so
           a toast on top was one fact twice with one copy hiding the other. A second press moves
           nothing on the screen, because the outcome is already there, so it keeps a toast, and the
           toast says what happened: the row was changed. */
        if (made !== null && pending.replace(choice.key, made, taken)) {
          toasts.push(copy.notWritten(firstRun.rowChanged(thing, list)));
        } else {
          made = pending.add(choice.key, taken, chosen.source.sample);
        }
        saved = null;
      } else {
        const missing = await ensure(client, chosen, choice.key);
        saved = missing === null ? await write(client, choice.key) : { ok: false, why: missing };
      }
      said = true;
      void remember();
      /* THE OUTCOME IS BELOW THE FOLD ON A PHONE, and it holds the way onward. */
      await tick();
      kept?.scrollIntoView({ block: 'nearest' });
    } finally {
      writing = false;
    }
  }

  /**
   * The typed row, into the record.
   *
   * THE VALUES GO AS THE FORM HANDS THEM OVER. `RowForm` builds `taken` in the shapes the record
   * stores: an enum in the spelling its own declaration uses, money as an amount and a currency, a
   * number as a number. The first-run form asks for the title and what the register requires, and
   * none of the five tiles requires a `ref`, which is the one field type that would need another
   * row looked up before this could be sent.
   *
   * A SECOND PRESS CHANGES THE ROW IT WROTE, the way a second press on the demo corrects the row
   * `pending` is holding. Without it the ordinary act of fixing a typo and pressing again leaves
   * two rows in somebody's record on their first minute, and this screen stays put with the form
   * still filled in, which is an invitation to do exactly that.
   *
   * WHY IT DID NOT LAND IS THE RECORD'S OWN SENTENCE, read the three ways `rows-write.ts` reads
   * one: the refusal's `fix`, the calm sentence when nothing answered at all, and the raced one
   * when the record moved while this was in flight.
   */
  async function write(client: ReturnType<typeof createClient>, register: string): Promise<Saved> {
    const at = saved !== null && saved.ok ? saved.seq : null;
    const done = at === null ? await client.create({ register, fields: taken }) : await client.update({ register, seq: at, patch: taken });
    if (!done.ok)
      return { ok: false, why: 'refusal' in done ? (done.refusal.code === 'UNREACHABLE' ? copy.writeNotReached : done.refusal.fix) : copy.writeRaced };
    /* THE SECOND PRESS IS THE ONE THAT TOASTS, for the reason the demo's second press does: the
       outcome under the button is already there from the first, so nothing else on screen moves. */
    if (at !== null) toasts.push(firstRun.rowChangedSaved(thing, list), { intent: 'good' });
    return { ok: true, seq: (done.value as { seq?: number | null }).seq ?? at };
  }

  /**
   * THE COPY BUTTON WENT WITH THE COMMAND IT COPIED.
   *
   * It was worth keeping the argument that killed its predecessor, because the next person to add a
   * copy button here will need it: `navigator.clipboard?.writeText(…).catch(…)` short-circuits the
   * WHOLE chain including the `.catch`, so with no Clipboard API the expression is `undefined` and
   * the success toast fires anyway. `navigator.clipboard` is absent over plain HTTP, which is how a
   * self-host is first opened, so the environment where that lies is the one this screen exists
   * for. `clipboard.ts` exists for exactly this and reports the failure.
   */

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
</script>

<svelte:window onkeydown={key} />

<svelte:head><title>{titleOf('Start')}</title></svelte:head>

<div class="start">
  <div class="frame">
    <header class="head">
      <Mark height={34} />
      <span class="wordmark">{copy.product}</span>
    </header>

    {#if !choice}
      <div class="who" role="group" aria-labelledby="who-h" onfocusout={leave}>
        <h1 class="question step" id="who-h">{firstRun.whoQuestion}</h1>
        {#if settled && heard}
          <div class="heard">
            <p class="heard-said">{heard.name ? firstRun.gotYou(heard.name) : firstRun.gotIt}</p>
            <Button weight="bare" onclick={() => (settled = false)}>{firstRun.whoEdit}</Button>
          </div>
        {:else}
          <input
            class="who-field"
            type="text"
            autocomplete="off"
            aria-labelledby="who-h"
            placeholder={firstRun.whoPlaceholder}
            bind:this={field}
            bind:value={who}
            oninput={typed}
            onkeydown={enter}
          />
          <div class="who-chips" role="group" aria-label={firstRun.whoChipsLabel}>
            {#each firstRun.whoChips as c}
              <!-- A mouse press keeps focus in the field, so appending words never settles the answer. -->
              <button type="button" class="who-chip" onmousedown={(e) => e.preventDefault()} onclick={() => chip(c)}>{c}</button>
            {/each}
          </div>
        {/if}
        <!-- ALWAYS IN THE DOCUMENT, so a screen reader hears the change rather than a region arriving.
             Empty once settled, where the same sentence is drawn as the line above. -->
        <p class="heard-now" role="status">{#if heard && !settled}{heard.name ? firstRun.gotYou(heard.name) : firstRun.gotIt}{/if}</p>
      </div>

      {#if heard && !fromList}
      <section class="turn" aria-labelledby="shape-h">
        <h2 class="question" id="shape-h" tabindex="-1" bind:this={question}>{firstRun.shapeQuestion}</h2>
        <textarea
          class="who-field shape-field"
          rows="3"
          aria-labelledby="shape-h"
          placeholder={firstRun.shapePlaceholder}
          bind:this={area}
          bind:value={about}
          oninput={aboutTyped}
        ></textarea>
        <div class="who-chips shape-chips" role="group" aria-label={firstRun.whoChipsLabel}>
          {#each firstRun.shapeChips as c}
            <button type="button" class="who-chip" onmousedown={(e) => e.preventDefault()} onclick={() => aboutChip(c)}>{c}</button>
          {/each}
        </div>
        <!-- Always in the document, for the reason turn 1's line gives. -->
        <p class="heard-now" role="status">{shapeSaid}</p>

        {#if read && read.declined !== 'empty' && read.declined !== 'language'}
          <section class="use" aria-labelledby="use-h">
            {#if proposal}
              <h3 class="col-h" id="use-h">{firstRun.useSuggested}</h3>
              <p class="use-title">{proposal.title}</p>
              <p class="use-summary">{proposal.summary}</p>
              <ul class="use-facts">
                {#if pagesOf(proposal).length > 0}<li>{firstRun.usePages(firstRun.shapeAnd(pagesOf(proposal).map((p) => p.title)))}</li>{/if}
                {#if listsOf(proposal).length > 0}<li>{firstRun.useLists(firstRun.shapeAnd(listsOf(proposal).map((l) => l.name)))}</li>{/if}
                {#if proposal.modules.length > 0}<li>{firstRun.useBuildsOn(firstRun.shapeAnd(proposal.modules.map(packName)))}</li>{/if}
                {#if beside.length > 0}<li>{firstRun.useBeside(firstRun.shapeAnd(beside.map((b) => b.title)))}</li>{/if}
                <li>{said_as(proposal)}</li>
              </ul>
            {:else}
              <h3 class="col-h" id="use-h">{firstRun.useSuggested}</h3>
              <p class="use-summary">{firstRun.useNone}</p>
            {/if}
            <div class="who-chips use-chips" role="group" aria-label={firstRun.useChoose}>
              {#each USE_CASES as u (u.usecase)}
                <button type="button" class="who-chip" aria-pressed={proposal === u} onclick={() => (picked_use = u.usecase)}>{u.title}</button>
              {/each}
            </div>
          </section>
        {/if}

        {#if read && (read.declined === null || (read.declined === 'unread' && proposal))}
          <div class="preview">
            <section class="col" aria-labelledby="heard-col">
              <h3 class="col-h" id="heard-col">{firstRun.shapeHeard}</h3>
              <ul class="col-list">
                {#each read.declined === null ? read.heard : [] as h}
                  <li>
                    <q class="said">{h.text}</q>
                    <span class="became"><span aria-hidden="true">→</span> {h.loose ? firstRun.shapeNoCurrency : firstRun.shapeAnd(h.packs.map(packName))}</span>
                  </li>
                {/each}
                {#each useHeard.filter((w) => !(read?.declined === null ? read.heard : []).some((h) => w.at < h.at + h.text.length && h.at < w.at + w.text.length)) as w}
                  <li>
                    <q class="said">{w.text}</q>
                    <span class="became"><span aria-hidden="true">→</span> {proposal?.title}</span>
                  </li>
                {/each}
              </ul>
            </section>
            <section class="col" aria-labelledby="record-col">
              <h3 class="col-h" id="record-col">{firstRun.shapeRecord}</h3>
              <ul class="col-list">
                {#each lists as l (l.id)}
                  <li>
                    <span class="list-name">{l.name}</span>
                    {#if l.rows.length > 0}
                      <ul class="col-rows">
                        {#each l.rows as r}
                          <li>{r.title}{#if r.note}{' '}<span class="became">{r.note}</span>{/if}</li>
                        {/each}
                      </ul>
                    {/if}
                  </li>
                {/each}
              </ul>
            </section>
          </div>
        {/if}

        <div class="actions shape-actions">
          <Button weight={outcome?.onward ? 'quiet' : 'primary'} disabled={!read || (read.declined !== null && !(read.declined === 'unread' && proposal)) || making} onclick={() => void make()}>{firstRun.shapeMake}</Button>
          <Button weight="bare" onclick={() => void goto('/start?list', { keepFocus: true, noScroll: true })}>{firstRun.shapeFromList}</Button>
        </div>

        {#if outcome}
          <div class="kept" role="status" bind:this={kept}>
            {#if outcome.made.length > 0}
              {@const items = firstRun.shapeAnd(outcome.made.map((m) => firstRun.shapeIn(m.name, m.list)))}
              <p class="kept-what">{outcome.waiting ? firstRun.shapeMadeWaiting(items, copy.markNotWritten) : firstRun.shapeMade(items)}</p>
            {:else if outcome.absent.length === 0 && outcome.refused.length === 0}
              <p class="kept-what">{firstRun.shapeReady}</p>
            {/if}
            {#if known}
              <p class="kept-what">{known.waiting ? firstRun.youArePending(known.name, copy.markNotWritten) : firstRun.youAreKnown(known.name)}</p>
            {/if}
            {#if outcome.on.length > 0}<p class="kept-why">{firstRun.shapeTurnedOn(firstRun.shapeAnd(outcome.on))}</p>{/if}
            {#if outcome.added.length > 0}<p class="kept-why">{firstRun.shapeAdded(firstRun.shapeAnd(outcome.added))}</p>{/if}
            {#if outcome.absent.length > 0}<p class="kept-why">{firstRun.shapeAbsent(firstRun.shapeAnd(outcome.absent))}</p>{/if}
            {#each outcome.refused as r}<p class="kept-why">{r}</p>{/each}
            {#if outcome.waiting}<p class="kept-why">{firstRun.keptNothing} {firstRun.keptNothingWhy}</p>{/if}
            {#if outcome.onward}
              <div class="actions">
                <Button weight="primary" href={`/r/${outcome.onward.register}?first=1`}>{firstRun.seeTheList(outcome.onward.list)}</Button>
              </div>
            {/if}
          </div>
        {/if}
      </section>
      {/if}

      {#if heard && fromList}
      <div class="turn">
      <!-- SAY WHAT THIS IS BEFORE ASKING WHAT THEY WANT. The question on its own let the three
           examples under it define the product, and three examples always define it downward. -->
      <!-- A paragraph and not the `h1` it was: "Who are you?" is the page's heading now. -->
      <p class="lede">{firstRun.firstLede}</p>
      <p class="body">{firstRun.firstBody}</p>

      <h2 class="question" tabindex="-1" bind:this={question}>{firstRun.firstQuestion}</h2>

      <div class="choices" role="group" aria-label={firstRun.firstQuestion} bind:this={choices}>
        {#each CHOICES as c, i}
          <!-- The register id used to sit on the right of every row. It is the app's own vocabulary
               explained to somebody who has not agreed to learn it yet, on the one screen where
               they have the least reason to care, and it made five plain choices look like a
               schema review. The glyph does the work the id was pretending to do. -->
          <button type="button" class="choice" data-lit={lit === i ? '' : undefined} onclick={() => choose(c.key)}>
            <span class="choice-icon"><Icon name={c.icon as IconName} size="m" /></span>
            <span class="choice-main">
              <span class="choice-label">{c.label}</span>
              <span class="choice-body">{c.body}</span>
            </span>
          </button>
        {/each}
      </div>

      <!-- `row` is defined in the one sentence that already uses it, on the screen where somebody
           is about to make their first one. `19 §6`: one clause, in the sentence that needs it. -->
      <!-- THE CLAUSE GOES BESIDE THE WORD. It rendered after the whole hint, so the definition of
           *row* trailed two sentences behind the only place the word appears — `19 §6` asks for it
           "in the sentence that needs it", and the sentence that needs it is the first one. -->
      <p class="hint">{firstRun.firstRowIs} <Define noun="row" /> {firstRun.firstHint}</p>

      <div class="actions">
        <Button weight="bare" onclick={() => void goto('/start', { keepFocus: true, noScroll: true })}>{firstRun.shapeDescribe}</Button>
      </div>

      <section class="agent" aria-labelledby="agent-h">
        <h2 class="agent-h" id="agent-h"><Icon name="session" size="m" />{firstRun.agentTitle}</h2>
        <p class="agent-body">{firstRun.agentBody}</p>
        <!-- AND NOT THE COMMAND, because the address in it does not answer. `mcp.brain.dog` returns
             525: the transport is not built and the hostname is deliberately unclaimed, since
             pointing it at the Worker would answer an MCP address with the app's shell. `23 §3.1`
             is the rule, and it is the one `askBrainDog` already obeys: a capability with no model
             behind it is not there, not greyed out. A command that cannot be run is worse than an
             absent one, because somebody spends their first minute pasting it into a terminal. -->
        <p class="agent-note">{firstRun.agentNotYet}</p>
      </section>
      </div>
      {/if}
    {:else}
      <h1 class="question step">{choice.field}</h1>

      <!--
        THE ONE CONTROL THAT MATTERS COMMITS. It had no handler at all — no toast, no route, no row,
        and the input was not even bound — which is this app's own rule broken at the highest-stakes
        moment: a control that does nothing is indistinguishable from a broken one, so every action
        that cannot happen here says what it WOULD have done, once, in the toast. Sixteen other
        controls obey that; the first-run commit did not.
      -->
      <!--
        THE REGISTER'S OWN FIELDS, and not a form typed out by hand. This was one hard-coded shape
        for five different questions: a text box and a `Due` date, whatever had been chosen. So
        "What is it, and how much?" stood over a form with no amount in it — on the first screen of a
        product about money — and a person was asked when they are due.

        `first` NARROWS IT TO THE TITLE AND THE REQUIRED ONES, because 19 §6 wants "one true fact
        about their own business" in under thirty seconds and a register has eight fields. Which
        three that is comes from the declaration, so a money register asks for an amount because it
        DECLARES one, and nobody writes a second copy of the schema in markup.

        AND THEN TO THE REQUIRED ONES THE CHOICE HAS NOT ALREADY ANSWERED. `given` is
        `firstRun.firstGiven`: an invoice is owed to you and a new one is open, so Money went from
        five fields to three, and the two it dropped were the two a stranger had to read in order
        to accept them.
      -->
      <form class="form" onsubmit={commit}>
        <!-- KEYED ON THE CHOICE. Going Back and picking another register reused the component, so
             an amount typed into Money was still in the field on Projects — and now would count as
             a required field already filled. -->
        {#key choice.key}
          <RowForm
            register={choice.key}
            first
            autofocus
            label={firstRun.firstField[choice.key]}
            given={firstRun.firstGiven[choice.key]}
            bind:problems
            bind:taken
          />
        {/key}

        <!-- The same treatment as the register drawer and `/decide`: the sentence, then the dead
             button that points at it. -->
        {#if problems.length > 0}<p class="first-why" id="first-why">{problems[0]}</p>{/if}

        <div class="actions">
          <!-- ONE FILLED CONTROL. Once the row has landed the filled one is the way onward, below, and
               this steps down to a correction. -->
          <Button
            weight={said && (saved === null || saved.ok) ? 'quiet' : 'primary'}
            type="submit"
            disabled={problems.length > 0 || writing}
            aria-describedby={problems.length > 0 ? 'first-why' : undefined}>{copy.addTheRow}</Button
          >
          <!-- BACK IS A NAVIGATION TOO, so the browser's own Back and this button end up in the
               same place instead of disagreeing about where "back" is. -->
          <Button weight="bare" onclick={() => void goto('/start?list')}>{copy.goBack}</Button>
        </div>

        <!--
          WHAT HAPPENED, UNDER THE BUTTON THAT DID IT.

          This screen used to navigate to `/r/<key>?first=1` in the same tick as the toast, and the
          toast did not survive: measured on the deployed build, the sentence is in the DOM at 700ms
          with the URL still `/start`, and gone at 2,200ms with the URL changed. So the one control
          `19 §6` is written around reported nothing, and what it reported nothing about was landing
          on thirty-eight rows of a fictional studio.

          A SCREEN DOES NOT NAVIGATE AWAY FROM ITS OWN OUTCOME. The form stays where it is with
          everything still in it, which is the receipt a person can actually check, and the answer
          is a sentence they are already looking at. `role="status"` rather than `alert`: they
          pressed the button, so nothing here needs to interrupt what they were reading (13 §7).
        -->
        {#if said}
          <div class="kept" role="status" bind:this={kept}>
            <!-- WHAT HAPPENED FIRST, THEN WHY. This opened on "Nothing was saved yet." and said it
                 twice more before it said where the row was, so the one thing that had happened
                 came last. That it is not saved is now said once as a sentence and once as the name
                 of the mark the reader will find on the row. -->
            <!-- AND WHAT HAPPENED DEPENDS ON WHICH RECORD THIS IS. Every sentence below the first
                 was written about the demo, and all three of them are false of a record that has
                 just taken the row: it is saved, it is not marked, and the rows around it are the
                 person's own rather than a fictional studio's. `saved` is `null` on the demo. -->
            {#if saved === null}
              <p class="kept-what">{firstRun.rowIsThere(thing, list, copy.markNotWritten)}</p>
            {:else if saved.ok}
              <p class="kept-what">{firstRun.rowSaved(thing, list)}</p>
            {:else}
              <!-- THE RECORD'S OWN SENTENCE, WHICH IS THE ONLY ONE THAT SAYS WHAT TO DO NEXT. The
                   form is still on screen with everything in it, so a refusal a person can read is
                   a refusal they can answer by changing a field and pressing again. -->
              <p class="kept-what">{firstRun.rowNotSaved(thing, saved.why)}</p>
            {/if}
            {#if known}
              <p class="kept-what">{known.waiting ? firstRun.youArePending(known.name, copy.markNotWritten) : firstRun.youAreKnown(known.name)}</p>
            {/if}
            {#if saved === null}
              <p class="kept-why">{firstRun.keptNothing} {firstRun.keptNothingWhy}</p>
              <p class="kept-why">{firstRun.keptExamples}</p>
            {:else if saved.ok}
              <p class="kept-why">{firstRun.keptSaved}</p>
            {/if}
            <!-- AND THE WAY ONWARD IS OFFERED ONLY WHERE THERE IS A ROW AT THE END OF IT. A refused
                 row is not on that list, so sending somebody to look for it would be the screen
                 undoing the sentence above. -->
            {#if saved === null || saved.ok}
              <div class="actions">
                <Button weight="primary" href={`/r/${choice.key}?first=1`}>{firstRun.seeTheList(list)}</Button>
              </div>
            {/if}
          </div>
        {/if}
      </form>

    {/if}
  </div>
</div>

<style>
  /**
   * The outcome, set apart from the form without being an alarm.
   *
   * A HAIRLINE ABOVE IT AND NOTHING ELSE. A tinted panel would make "nothing was saved" read as a
   * failure, and it is not one: the person did the thing correctly and the build cannot keep it
   * yet. `--edge` and the ordinary ground say "this is a different part of the screen" and stop
   * there.
   */
  .kept {
    display: grid;
    gap: var(--sp-2);
    margin-block-start: var(--sp-5);
    padding-block-start: var(--sp-5);
    border-block-start: 1px solid var(--edge);
  }

  .kept-what {
    font-weight: 600;
  }

  /* ── turn 1 ───────────────────────────────────────────────────────────── */

  .who {
    display: grid;
    gap: var(--sp-3);
  }

  .who .question.step {
    margin-block-end: var(--sp-1);
  }

  /* The one control on the screen, so it is drawn at the size of a sentence rather than a form row. */
  .who-field {
    inline-size: 100%;
    padding: var(--sp-3) var(--sp-4);
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    color: var(--ink);
    font: inherit;
    font-size: var(--t-md);
  }

  .who-chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  .who-chip {
    min-block-size: 36px;
    padding-inline: var(--sp-3);
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--r-pill);
    color: var(--ink2);
    font: inherit;
    font-size: var(--t-sm);
    cursor: pointer;
    transition: background var(--d-state) var(--ease-out);
  }

  /* A FINGER NEEDS 44PX, where a mouse is fine at 36. */
  @media (pointer: coarse) {
    .who-chip {
      min-block-size: 44px;
    }
  }

  @media (hover: hover) and (pointer: fine) {
    .who-chip:hover {
      background: var(--s2);
      border-color: var(--edge);
    }
  }

  .heard {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
  }

  .heard-said {
    color: var(--ink);
    font-size: var(--t-md);
    font-weight: 600;
  }

  .heard-now {
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .turn {
    margin-block-start: var(--sp-7);
  }

  /* ── turn 2 ───────────────────────────────────────────────────────────── */

  /* ONLY WHERE IT OPENS THE TURN. Under the claim and its paragraph it needs its own space, and
     this rule took it away, so "Where do you want to start?" sat on the paragraph's last line. */
  .turn .question:first-child {
    margin-block-start: 0;
  }

  .turn .heard-now:not(:empty) {
    margin-block-start: var(--sp-2);
  }

  .shape-field {
    resize: vertical;
    line-height: var(--lh-body);
  }

  .shape-chips {
    margin-block-start: var(--sp-3);
  }

  /* ── the use case suggested ───────────────────────────────────────────── */

  .use {
    margin-block-start: var(--sp-5);
  }

  .use-title {
    color: var(--ink);
    font-size: var(--t-lg);
    font-weight: 600;
  }

  .use-summary {
    margin-block-start: var(--sp-1);
    color: var(--ink2);
    font-size: var(--t-sm);
    max-inline-size: 60ch;
  }

  .use-facts {
    display: grid;
    gap: var(--sp-1);
    margin: var(--sp-2) 0 0;
    padding: 0;
    list-style: none;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .use-chips {
    margin-block-start: var(--sp-3);
  }

  .use-chips .who-chip[aria-pressed='true'] {
    background: var(--s2);
    border-color: var(--edge);
    color: var(--ink);
  }

  /* Two columns where there is room and one on a phone, the same rule as the cards. */
  .preview {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));
    gap: var(--sp-5);
    margin-block-start: var(--sp-4);
  }

  .col {
    min-inline-size: 0;
  }

  .col-h {
    margin-block-end: var(--sp-2);
    color: var(--dim);
    font-size: var(--t-xs);
    font-weight: 600;
  }

  .col-list,
  .col-rows {
    display: grid;
    gap: var(--sp-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .col-rows {
    gap: var(--sp-1);
    margin-block-start: var(--sp-1);
    padding-inline-start: var(--sp-3);
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  .said,
  .list-name {
    color: var(--ink);
    font-weight: 600;
  }

  .became {
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .shape-actions {
    flex-wrap: wrap;
    margin-block-start: var(--sp-4);
  }

  .kept-why {
    color: var(--ink2);
    font-size: var(--t-sm);
    line-height: 1.5;
    max-inline-size: 52ch;
  }

  /* The register's own rule, said where the refusal is. Ink rather than the warn hue: nobody has
     done anything wrong yet. */
  .first-why {
    color: var(--ink2);
    font-size: var(--t-xs);
    line-height: 1.5;
  }

  /* `minmax(0, …)` and not `place-items: center`. A centred grid item sizes its track to
     `max-content`, and the one line of `nowrap` monospace in the agent card is wider than a phone —
     so the track grew to fit it and took the whole page sideways at 320 and 360. The gate caught it
     the same minute I wrote it, which is what the gate is for. */
  .start {
    display: grid;
    grid-template-columns: minmax(0, min(560px, 100%));
    justify-content: center;
    align-content: center;
    min-block-size: 100dvh;
    padding: var(--sp-5);
  }

  .frame {
    min-inline-size: 0;
  }

  .head {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-block-end: var(--sp-7);
  }

  .wordmark {
    color: var(--ink);
    font-family: var(--font-display);
    font-size: var(--t-xl);
    font-weight: 600;
    letter-spacing: -0.026em;
  }

  /* The question is the SECOND thing on the screen, under the claim, so it is a heading for the
     cards rather than the headline of the page. It was a letterspaced eyebrow in capitals, which is
     how a form labels a section; it is a sentence at a section's size now, which is how a person
     asks one. On the step after a choice it is the headline again, and `.step` puts the size back. */
  .question {
    margin-block: var(--sp-7) var(--sp-4);
    color: var(--ink);
    font-size: var(--t-lg);
    font-weight: 600;
    letter-spacing: -0.018em;
  }

  .question.step {
    margin-block: 0 var(--sp-5);
    color: var(--ink);
    font-family: var(--font-display);
    font-size: var(--t-2xl);
    font-weight: 600;
    letter-spacing: -0.028em;
    text-transform: none;
  }

  /* CARDS, AND IT WAS ONE BOXED LIST. Five rows inside a frame read as a settings panel; five cards
     you can pick up read as five ways in. Two across where there is room, one on a phone. */
  .choices {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 240px), 1fr));
    gap: var(--sp-3);
  }

  /* The claim, at the top, in the display face — the same sentence the marketing site leads with,
     because the first screen of the product and the first screen of the site should not describe
     two different things. */
  .lede {
    text-wrap: balance;
    color: var(--ink);
    font-family: var(--font-display);
    font-size: var(--t-2xl);
    font-weight: 600;
    letter-spacing: -0.022em;
    line-height: var(--lh-tight);
  }

  .body {
    margin-block-start: var(--sp-3);
    max-inline-size: 54ch;
    color: var(--dim);
    font-size: var(--t-base);
    line-height: var(--lh-body);
  }

  .choice {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: var(--sp-3);
    min-block-size: 76px;
    padding: var(--sp-4);
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--r-lg);
    color: var(--ink);
    font: inherit;
    text-align: start;
    cursor: pointer;
    transition:
      background var(--d-state) var(--ease-out),
      border-color var(--d-state) var(--ease-out),
      transform var(--d-press) var(--ease-out);
  }

  /* HIGHLIGHTED BY A NUMBER, and focus does the rest — so the ring somebody sees is the one the
     browser draws for the thing Enter would press, rather than a second convention to learn. */
  .choice[data-lit] {
    border-color: var(--accent);
  }

  @media (hover: hover) and (pointer: fine) {
    .choice:hover {
      background: var(--s2);
      border-color: var(--edge);
    }
  }

  .choice:active {
    transform: scale(var(--press-scale));
  }

  /* The number is a KEY, so it is drawn as one. A bare circled digit reads as a step in a sequence
     you have to do in order; these are five alternatives and only one gets picked. */
  /* THE FIVE NUMBER KEYS STILL WORK AND ARE NO LONGER ADVERTISED. Boxed digits beside the five
     choices were an accelerator printed on the first screen a stranger sees, and the verdict on the
     product as it stood was "as if it's some nerdy tool". They went on a phone first; they are gone
     everywhere now. The binding is untouched. */

  /* The glyph, in the accent, because it was the only colour on the screen that was missing and
     five rows of grey text is most of what made this look like a form. */
  .choice-icon {
    display: grid;
    place-items: center;
    inline-size: 40px;
    block-size: 40px;
    border-radius: var(--r-pill);
    background: var(--accent-wash);
    color: var(--accent-text);
  }

  .choice-main {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-inline-size: 0;
  }

  /* The name carries the weight and the sentence under it does the explaining. One line each was
     what made the old three read as a list of chores rather than as the parts of a business. */
  .choice-label {
    color: var(--ink);
    font-size: var(--t-md);
    font-weight: 600;
    letter-spacing: -0.012em;
  }

  .choice-body {
    color: var(--dim);
    font-size: var(--t-sm);
  }


  .form {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
  }

  /* The label and input styles that were here are `RowForm`'s now, which is the point: one control
     per declared type, drawn one way, wherever a row is written. */

  .actions {
    display: flex;
    gap: var(--sp-2);
    margin-block-start: var(--sp-2);
  }

  /* No rule above it any more. It belongs to the list it follows, and the card below now does the
     separating — a divider plus a card is two dividers. */
  .hint {
    margin-block-start: var(--sp-3);
    color: var(--dim);
    font-size: var(--t-sm);
  }

  /* ── the agent path ──────────────────────────────────────────────────── */

  /* A CARD, not a rule with text under it. Below a divider reads as a footnote — the thing you put
     after the real content — and this is the path somebody with an agent already open should take
     first. Tinted with the accent rather than the surface ladder, because it is an alternative to
     the list above it and not the next step down from it.

     AND THE TINT IS THE WASH NOW, at the one strength the product draws an accent tint at. This
     read `color-mix(in srgb, var(--accent) 7%, var(--s1))`: seven, beside `--accent-wash`'s twelve
     and the board column's ten, three strengths of one tint that nobody chose against each other.
     Measured against the `--s1` it sits on, seven per cent came out at 1.10:1 in light and 1.06 in
     dark, which is a card the eye has to be told is there; the wash is 1.18 and 1.11.

     `--accent-ground` IS THE OTHER TOKEN FOR THIS AND IT IS NOT THIS ONE. It mixes into `--bg`,
     which is the page, and this is a card standing off the page on `--s1`. Using it would have
     dropped the card back onto the ground it is meant to sit above. The base stays `--s1` and the
     wash is painted over it, so the surface behind the tint is a declared one rather than half of
     a value written here. */
  .agent {
    margin-block-start: var(--sp-6);
    padding: var(--sp-4) var(--sp-4) var(--sp-5);
    background-color: var(--s1);
    background-image: linear-gradient(var(--accent-wash), var(--accent-wash));
    border: 1px solid color-mix(in srgb, var(--accent) 22%, transparent);
    border-radius: var(--r-md);
  }

  .agent-h {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }

  .agent-h :global(svg) {
    color: var(--accent-text);
  }

  .agent-h {
    color: var(--ink);
    font-size: var(--t-md);
    font-weight: 600;
    letter-spacing: -0.012em;
  }

  .agent-body {
    margin-block-start: var(--sp-2);
    max-inline-size: 56ch;
    color: var(--dim);
    font-size: var(--t-sm);
    line-height: var(--lh-body);
  }


  .agent-note {
    margin-block-start: var(--sp-2);
    color: var(--dim);
    font-size: var(--t-xs);
  }
</style>

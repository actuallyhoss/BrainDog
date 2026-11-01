/**
 * CHANGING THE APP FROM THE PALETTE, IN WORDS (customisable on all aspects, from the app, without code).
 *
 * "Dark mode", "compact", "open on Money", "hide Inbox", "rename Money to Cash", "customise this page", "quiet hours":
 * each is a sentence somebody types at the one surface every screen has, and each used to mean a trip to a Settings
 * area and a hunt for the control. These rows apply the change where it was typed and toast an Undo.
 *
 * ADMITTED ONLY ON A TYPED MATCH, NEVER WITH NOTHING TYPED. An empty palette opens on what the record is waiting for,
 * and twenty switches under it would be the busy screen §35 asks us to cut. So a row is here only when the query names
 * it: every word typed is the start of one of the row's words, and one of them is three letters or more. A verb that
 * takes a page ("open on", "hide", "show", "rename") is a row only once a page is named after it, so "hide" alone
 * draws nothing rather than one row per page.
 *
 * AND THE STANDING RULE OF `admit.ts`: A ROW THAT CANNOT RUN IS NOT THERE. "Dark mode" is absent while the app is already
 * dark, "Hide Inbox" while Inbox is hidden, "Open on Money" while it already opens on Money.
 *
 * THIS FILE DECIDES, AND WRITES NOTHING. It answers which rows a query makes, out of what the screen holds now (`Here`),
 * so `palette.test.ts` can run every rule. The writes are the existing writers', called by `customise-apply.ts`:
 * `pref.ts` for the person's look, kept by the record with this device's first-paint copy, `navPrefs` for their nav.
 */

import { copy } from '../copy.ts';
import { terms, tokensOf } from '../record/find.ts';
import type { IconName } from '../ui/icons.ts';
import type { Kept } from '../pref.ts';

const w = copy.customise;

/** How it looks on this device now, as `pref.read()` answers it. Absent is the default. */
export type Look = {
  scheme?: 'light' | 'dark' | undefined;
  text?: 'sm' | 'base' | 'md' | undefined;
  density?: 'compact' | 'comfortable' | 'roomy' | undefined;
  /** Screenshot mode (`shot/mode.ts`), on in this tab or not. A display mode, so it is the screen's word and not the cookie's. */
  shot?: boolean | undefined;
};

/** One place a person can open on, hide or rename, by the name their nav shows and its own title. */
export type Place = {
  href: string;
  /** The name it carries in this person's nav: theirs if they gave one, else its own. */
  name: string;
  /** Its own title, which a rename back to it takes the person's name away. */
  own: string;
  icon: IconName;
  /** Whether the person's nav draws it, so hiding it takes something off the screen. */
  hide: boolean;
  /** Whether the nav draws it under a name the person can change (`nav.labels`). */
  rename: boolean;
  /** The list this place is, by id, which a rename renames everywhere through the record's `renameList`. */
  list?: string | undefined;
};

/** What the palette knows about the screen and the person when the query is read. */
export type Here = {
  look: Look;
  places: readonly Place[];
  hidden: readonly string[];
  /** The page the app opens on; `null` is Today. */
  home: string | null;
  /** Whether the screen behind the palette has a page menu to open (`ChangePage.svelte`). */
  pageMenu: boolean;
  /** Where a look change is kept now, as `pref.whereKept` answers; absent is this device, the claim that is never wrong. */
  kept?: 'record' | 'pending' | 'device';
  /** The list whose page is behind the palette, which "rename this list to Clients" names. */
  here?: Place | undefined;
};

export type LookKey = 'scheme' | 'text' | 'density';

/** What pressing the row does. The palette switches on `kind`; `customise-apply.ts` makes the write. */
export type Change =
  | { kind: 'look'; key: LookKey; value: string; name: string }
  /** Screenshot mode on or off, kept as the person's `look.shot`. */
  | { kind: 'shot'; on: boolean }
  | { kind: 'home'; href: string; name: string }
  | { kind: 'hide'; href: string; name: string }
  | { kind: 'show'; href: string; name: string }
  | { kind: 'rename'; href: string; own: string; from: string; to: string }
  /** A list renamed everywhere, by the record (`renameList`), not only in this person's nav. */
  | { kind: 'renameList'; list: string; from: string; to: string }
  /** Puts a sentence in the box and keeps the palette open, for a rename that has no new name yet. */
  | { kind: 'fill'; text: string }
  | { kind: 'page' }
  | { kind: 'go'; href: string };

export type Offer = { id: string; title: string; detail: string; icon: IconName; change: Change; complete?: string };

/** A setting with three answers, and the words that find each beside its own name. */
type LookRow = { key: LookKey; value: string; title: string; icon: IconName; also: string };

/**
 * THE LOOK, ROW BY ROW. `also` holds the words a person reaches for that the title does not say ("bigger", "theme"),
 * and no word in it is another row's title word, so "dark" and "compact" each find exactly one row.
 */
const LOOKS: readonly LookRow[] = [
  { key: 'scheme', value: 'dark', title: w.dark, icon: 'moon', also: 'scheme theme appearance colours' },
  { key: 'scheme', value: 'light', title: w.light, icon: 'sun', also: 'scheme theme appearance colours' },
  { key: 'scheme', value: 'system', title: w.system, icon: 'monitor', also: 'scheme theme appearance colours mode auto automatic' },
  { key: 'text', value: 'sm', title: w.textSm, icon: 'doc', also: 'size font smaller tiny' },
  { key: 'text', value: 'base', title: w.textBase, icon: 'doc', also: 'size font default regular medium' },
  { key: 'text', value: 'md', title: w.textMd, icon: 'doc', also: 'size font larger big bigger' },
  { key: 'density', value: 'compact', title: w.compact, icon: 'rows', also: 'density dense tight smaller' },
  { key: 'density', value: 'comfortable', title: w.comfortable, icon: 'rows', also: 'density default' },
  { key: 'density', value: 'roomy', title: w.roomy, icon: 'rows', also: 'density spacious airy looser' },
];

/** Each setting's value when nothing is kept, so the row for it is absent on a fresh device. */
const DEFAULTS: Record<LookKey, string> = { scheme: 'system', text: 'base', density: 'comfortable' };

/**
 * SCREENSHOT MODE, ONE ROW THAT SAYS WHAT A PRESS DOES: on while it is off, off while it is on. Its title and detail are
 * `copy/palette.ts`'s (`customise.shot`, `customise.shotDetail`), where the mode's own list of legible words reads them.
 */
const SHOT = {
  /* NOT "hide": "hide" alone is the verb that takes a page, and draws nothing until one is named. */
  also: 'screenshot values shoulder screen private',
};

/** The words that find the two rows that go somewhere rather than change something. */
const PAGE_ALSO = 'customize edit layout arrange change blocks';
const QUIET_ALSO = 'notifications notices mute silence disturb';

/**
 * Do these typed words name this row? Every word typed starts one of the row's words, and one of them is three letters
 * or more, so "d" and "da" draw nothing and "dar" draws Dark mode. The same prefix rule the palette filters by.
 */
export function names(query: string, words: string): boolean {
  const want = terms(query);
  if (!want || !want.some((t) => t.length >= 3)) return false;
  const has = tokensOf(words);
  return want.every((t) => has.some((tok) => tok.startsWith(t)));
}

/**
 * The places a typed name picks: the one whose name is exactly what was typed when there is one, else every place a
 * prefix of its words reaches. "open on money" opens on Money and not also on Money flow.
 */
export function placesNamed(said: string, places: readonly Place[]): Place[] {
  const want = terms(said);
  if (!want) return [];
  const key = want.join(' ');
  const exact = places.filter((p) => (terms(p.name) ?? []).join(' ') === key || (terms(p.own) ?? []).join(' ') === key);
  if (exact.length > 0) return exact;
  return places.filter((p) => {
    const has = tokensOf(`${p.name} ${p.own}`);
    return want.every((t) => has.some((tok) => tok.startsWith(t)));
  });
}

/** The verbs that take a page, each with the spellings a person types, in any case. */
const VERB = /^(open on|opens on|start on|hide|unhide|show|rename)\s+(.+)$/iu;
/** A rename that says its new name, or is about to: `rename Money to Cash`, `rename Money to`. The last ` to` splits it. */
const RENAME = /^(.+)\s+to(?:\s+(.*))?$/iu;

/**
 * The rows a query makes, in the order they are drawn. Empty for an empty query, always.
 */
export function customise(query: string, here: Here): Offer[] {
  const said = query.trim();
  if (said === '') return [];
  const out: Offer[] = [];

  /* THE PAGE VERBS FIRST: "open on money" is a sentence about Money and nothing else. */
  const verb = VERB.exec(said.replace(/\s+/gu, ' '));
  if (verb) {
    const how = (verb[1] ?? '').toLowerCase();
    /* THE REST AS IT WAS TYPED, so a new name keeps its capitals. */
    const rest = verb[2] ?? '';
    if (how === 'rename') out.push(...renames(rest, here));
    else
      for (const p of placesNamed(rest, here.places)) {
        const hidden = here.hidden.includes(p.href);
        if (how === 'hide' && p.hide && !hidden)
          out.push({ id: `cz-hide-${p.href}`, title: w.hide(p.name), detail: w.hideDetail, icon: 'eye', change: { kind: 'hide', href: p.href, name: p.name }, complete: w.hide(p.name) });
        else if ((how === 'show' || how === 'unhide') && hidden)
          out.push({ id: `cz-show-${p.href}`, title: w.show(p.name), detail: w.showDetail, icon: 'eye', change: { kind: 'show', href: p.href, name: p.name }, complete: w.show(p.name) });
        else if (how !== 'hide' && how !== 'show' && how !== 'unhide' && (here.home ?? '/') !== p.href)
          out.push({ id: `cz-home-${p.href}`, title: w.openOn(p.name), detail: w.openOnDetail, icon: 'home', change: { kind: 'home', href: p.href, name: p.name }, complete: w.openOn(p.name) });
      }
    return out;
  }

  /* EACH LOOK ROW SAYS WHERE IT WILL BE KEPT, since the record keeps the look now and "On this device" was a claim it
     outgrew: the record for a person it is following, this device for now while a change waits to be sent, else here. */
  const kept = here.kept === 'record' ? w.inRecord : here.kept === 'pending' ? w.thisDeviceNow : w.thisDevice;
  for (const row of LOOKS) {
    if ((here.look[row.key] ?? DEFAULTS[row.key]) === row.value) continue;
    if (!names(said, `${row.title} ${row.also}`)) continue;
    out.push({ id: `cz-${row.key}-${row.value}`, title: row.title, detail: kept, icon: row.icon, change: { kind: 'look', key: row.key, value: row.value, name: row.title }, complete: row.title });
  }
  if (names(said, `${w.shot} ${SHOT.also}`)) {
    const on = here.look.shot !== true;
    out.push({ id: 'cz-shot', title: w.shot, detail: on ? w.shotDetail : copy.screenshotOn, icon: 'eye', change: { kind: 'shot', on }, complete: w.shot });
  }
  if (here.pageMenu && names(said, `${w.page} ${PAGE_ALSO}`))
    out.push({ id: 'cz-page', title: w.page, detail: w.pageDetail, icon: 'grid', change: { kind: 'page' }, complete: w.page });
  if (names(said, `${w.quiet} ${QUIET_ALSO}`))
    out.push({ id: 'cz-quiet', title: w.quiet, detail: w.quietDetail, icon: 'bell', change: { kind: 'go', href: QUIET_HREF }, complete: w.quiet });
  return out;
}

/** The toast for a look change, by where the record said it was kept: the record, this device for now, or this one alone. */
export function lookSaid(kept: Kept, name: string): string {
  if (kept.from === 'kept') return w.lookKept(name);
  if (kept.from === 'pending') return w.lookPending(name);
  return w.lookSet(name);
}

/** Where quiet hours are set: one area, so the palette goes there rather than keeping a second control. */
export const QUIET_HREF = '/settings/notifications';

/**
 * "rename money to cash" renames it; "rename money" asks for the new name by writing `rename Money to ` into the box,
 * so Enter on it is a step toward the sentence and never a guess at a name.
 */
function renames(typed: string, here: Here): Offer[] {
  /* "RENAME THIS LIST TO CLIENTS" ON A LIST'S PAGE is that list, by the record's call. */
  const self = /^(?:this list|this|it)(?:\s+to(?:\s+(.*))?)?$/iu.exec(typed.trim());
  if (self && here.here?.list !== undefined) {
    const p = here.here;
    const to = (self[1] ?? '').trim().slice(0, LABEL_MOST);
    if (to === '') return [asking(p)];
    return to === p.name ? [] : [{ id: `cz-rename-${p.href}`, title: w.rename(p.name, to), detail: w.renameListDetail, icon: 'edit', change: { kind: 'renameList', list: p.list!, from: p.name, to } }];
  }
  const renamable = here.places.filter((p) => p.rename || p.list !== undefined);
  /* A PAGE WHOSE OWN NAME HOLDS " to " ("Back to work"), typed whole, is that page, and not "Back" renamed to "work". */
  const whole = terms(typed)?.join(' ') ?? '';
  const exact = renamable.filter((p) => (terms(p.name) ?? []).join(' ') === whole);
  if (exact.length > 0) return exact.map(asking);
  const split = RENAME.exec(typed);
  if (split) {
    const to = (split[2] ?? '').trim().slice(0, LABEL_MOST);
    const named = placesNamed(split[1] ?? '', renamable);
    if (named.length > 0)
      return to === ''
        ? named.map(asking)
        : named
            .filter((p) => to !== p.name)
            .map((p) => ({
              id: `cz-rename-${p.href}`,
              title: w.rename(p.name, to),
              detail: p.list !== undefined ? w.renameListDetail : w.renameDetail,
              icon: 'edit' as const,
              change: p.list !== undefined ? { kind: 'renameList' as const, list: p.list, from: p.name, to } : { kind: 'rename' as const, href: p.href, own: p.own, from: p.name, to },
            }));
  }
  /* NO " to " YET: the whole is read as the page. */
  return placesNamed(typed, renamable).map(asking);
}

const asking = (p: Place): Offer => ({
  id: `cz-name-${p.href}`,
  title: w.renameAsk(p.name),
  detail: w.renameAskDetail,
  icon: 'edit',
  change: { kind: 'fill', text: w.renameFill(p.name) },
});

/** `nav-prefs.svelte.ts`'s `LABEL_MOST`, which this file cannot import: that module holds runes and `node --test` loads this. */
const LABEL_MOST = 40;

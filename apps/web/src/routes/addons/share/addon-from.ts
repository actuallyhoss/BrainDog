/**
 * The second mode of `/packs/share`: an add-on from what a person made. The record's `exportPack` offers its own
 * things with no `declarations` (`{ offered: [{ id, kind, title }] }`), and with the ticked ones writes the file and
 * says what it would add (`{ file, text, adds, brings: [{ id, why }] }`). This file reads both answers into what the
 * screen draws: the ticks by kind, the preview's lines and the file's name.
 *
 * NAMES, NEVER IDS. A thing is said by the title the record gives it. A thing the file brings that was not offered (a
 * script a ticked page runs) is said by its own title when the answer carries one, by its handle in words when that
 * reads as one, and otherwise as "one more thing it needs": a ULID is never put in front of a person.
 *
 * DECLARATIONS ONLY. The screen sends the ticked ids and a title, never `rows`: what a person keeps stays at home.
 *
 * PLAIN NODE LOADS THIS FILE: no import.
 */

export const words = {
  modeGroup: 'What to share',
  modeUseCase: 'Your whole starter',
  modeAddon: 'A plugin',
  sentence: 'Tick what you made. It goes as its setup, never its entries.',
  cannot: 'This BrainDog cannot make a plugin yet.',
  nothing: 'Nothing of your own yet. Make a list, a page or an automation and it shows here.',
  reading: 'Reading what you made',
  picks: 'What goes in',
  title: 'What the plugin is called',
  preview: 'What it would add',
  previewNone: 'Tick something to see what it would add.',
  drafting: 'Writing the plugin',
  download: 'Download the plugin',
  downloaded: (file: string): string => `Saved as ${file}.`,
  untitledAddon: 'My plugin',
  needed: 'one more thing it needs',
  /* THE STORE: what a stranger sees of it before it is listed, and what it asks of the one who installs it. */
  oneLine: 'One line about it',
  oneLineHint: 'What it does, in a sentence. Shown on its card in the store.',
  oneLineNeeded: 'Write the one line before publishing.',
  asks: 'What it asks permission for',
  asksNothing: 'Nothing. It reads and writes only the BrainDog it is installed in.',
  asksCalls: (line: string): string => `Calls out: ${line}`,
  picture: 'Its picture is drawn from its own pages when BrainDog approves it, from made-up examples. Nothing of yours is in it.',
  publish: 'Publish to the store',
  publishing: 'Publishing',
  keeps: 'Rows, keys and anything you keep in it never go. A person who installs it is asked first, and sees what it will add.',
  /* SKILLS: the text of a skill goes with the add-on when ticked, is read by whoever reviews it, and is shown by name to
     whoever installs it, who is asked first. */
  skillsHeading: 'Skills for agents',
  skillsHint: 'A skill goes out with its steps. They are read when the plugin is reviewed, and whoever installs it is asked before their agents get it. Keep emails, links and keys out of it.',
  skillLine: (name: string, trigger: string): string => `${name}: ${trigger}`,
  givesSkill: (name: string): string => `Gives agents the skill ${name}`,
  /* A FIX OR AN UPDATE: the same form, sent as a later version of the same add-on. */
  changes: 'What changed',
  changesHint: 'A line or two. Anyone who installed it sees this when they are offered the update.',
  changesNeeded: 'Say what changed before sending an update.',
  sendingAgain: (title: string, version: string): string => `Sending ${title} again as version ${version}`,
  newInstead: 'Start a new plugin instead',
  fixAndSend: 'Fix it and send it again',
  publishUpdate: 'Publish an update',
  sendUpdate: 'Send the update',
  sendFix: 'Send the fix',
} as const;

/** The most characters of the one line, as the record holds it to. */
export const SUMMARY_MOST = 140;

/** The one line as it goes: spaces tidied, or `''` when it is empty or too long to be a line. */
export function summaryOf(raw: string): string {
  const line = raw.trim().replaceAll(/\s+/gu, ' ');
  return [...line].length > SUMMARY_MOST ? '' : line;
}

/**
 * What the file asks permission for, said one line each, from the store's own reading of it (`reach.calls_out`). An
 * add-on that calls out to nothing says so, so the person publishing and the stranger installing read the same thing.
 */
export function asksOf(reach: { calls_out?: unknown } | null | undefined): string[] {
  const calls = Array.isArray(reach?.calls_out) ? (reach.calls_out as unknown[]) : [];
  const lines = calls.flatMap((c) => {
    if (!isMap(c)) return [];
    const said = text(c.line) || text(c.host);
    return said === '' ? [] : [words.asksCalls(said)];
  });
  return lines.length === 0 ? [words.asksNothing] : lines;
}

/** The groups the ticks are drawn in, in this order; a kind the record names that is not here goes last. */
export const KINDS = ['lists', 'pages', 'figures', 'automations'] as const;
export type Kind = (typeof KINDS)[number];

const KIND_WORDS: Record<Kind, { heading: string; one: string }> = {
  lists: { heading: 'Lists', one: 'the list' },
  pages: { heading: 'Pages', one: 'the page' },
  figures: { heading: 'Figures', one: 'the figure' },
  automations: { heading: 'Automations', one: 'the automation' },
};
const OTHER = { heading: 'Other things', one: '' };

/** The query that opens this mode, so the Add-ons screen's offer links straight to it. */
export const MODE_PARAM = 'mode';
export const ADDON_MODE = 'addon';
export const addonHref = `/plugins/share?${MODE_PARAM}=${ADDON_MODE}`;
export type Mode = 'usecase' | 'addon';
export const modeOf = (search: URLSearchParams): Mode => (search.get(MODE_PARAM) === ADDON_MODE ? 'addon' : 'usecase');

/** One of the record's own things as it is offered. */
export type Offered = { id: string; kind: string; title: string };

/** `list` and `lists` are one group: the record may name a kind either way. */
export function kindOf(kind: string): Kind | null {
  const k = kind.trim().toLowerCase();
  const plural = k.endsWith('s') ? k : `${k}s`;
  return (KINDS as readonly string[]).includes(plural) ? (plural as Kind) : null;
}

const isMap = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** The record's offer, each id once, and nothing that has no name to be said by. */
export function offeredOf(value: unknown): Offered[] {
  const raw = isMap(value) && Array.isArray(value.offered) ? value.offered : [];
  const seen = new Set<string>();
  const out: Offered[] = [];
  for (const o of raw) {
    if (!isMap(o)) continue;
    const id = text(o.id);
    const title = text(o.title);
    if (id === '' || title === '' || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, kind: text(o.kind), title });
  }
  return out;
}

/** The offer in its groups, in `KINDS` order and the record's own order inside each; empty groups are left out. */
export function groupsOf(offered: readonly Offered[]): { kind: Kind | 'other'; heading: string; items: Offered[] }[] {
  const by = new Map<Kind | 'other', Offered[]>();
  for (const o of offered) {
    const k = kindOf(o.kind) ?? 'other';
    by.set(k, [...(by.get(k) ?? []), o]);
  }
  return [...KINDS, 'other' as const].flatMap((k) => {
    const items = by.get(k);
    return items ? [{ kind: k, heading: k === 'other' ? OTHER.heading : KIND_WORDS[k].heading, items }] : [];
  });
}

/** The ticked things as the record is asked for them: offered ids only, each once, in the offer's order. */
export function picked(offered: readonly Offered[], ticks: Iterable<string>): string[] {
  const on = new Set(ticks);
  return offered.filter((o) => on.has(o.id)).map((o) => o.id);
}

/** An add-on's id from its title: lower case words joined by hyphens, as a pack id is written. */
export function addonId(title: string): string {
  const id = title
    .normalize('NFKD')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, '-')
    .replaceAll(/^-+|-+$/gu, '')
    .slice(0, 40)
    .replace(/-+$/u, '');
  return id === '' ? 'my-add-on' : id;
}

/** The file an add-on is saved as: `<id>-<version>.pack.json`. */
export const fileName = (id: string, version = '1.0.0'): string => `${id}-${version}.pack.json`;

/** A skill the record keeps, as it is offered: its row number, name and the moment to reach for it. */
export type OfferedSkill = { seq: number; name: string; trigger: string };

/** The record's skills, each row number once, and nothing without a name and a moment. */
export function skillsOffered(value: unknown): OfferedSkill[] {
  const raw = isMap(value) && Array.isArray(value.skills) ? value.skills : [];
  const seen = new Set<number>();
  const out: OfferedSkill[] = [];
  for (const s of raw) {
    if (!isMap(s) || typeof s.seq !== 'number' || !Number.isInteger(s.seq) || seen.has(s.seq)) continue;
    const name = text(s.name);
    const trigger = text(s.trigger);
    if (name === '' || trigger === '') continue;
    seen.add(s.seq);
    out.push({ seq: s.seq, name, trigger });
  }
  return out;
}

/** The ticked skills as the record is asked for them: offered row numbers only, in the offer's order. */
export const skillsPicked = (offered: readonly OfferedSkill[], ticks: Iterable<number>): number[] => {
  const on = new Set(ticks);
  return offered.filter((s) => on.has(s.seq)).map((s) => s.seq);
};

/** What a fix or an update adds to the ask: the id it keeps, the note on what changed and the skills ticked. */
export type More = { id?: string | null; changes?: string; skills?: readonly number[] };

/** What the screen sends `exportPack`: the ticked ids and a title. Never rows. */
export function argsOf(offered: readonly Offered[], ticks: Iterable<string>, title: string, version = '1.0.0', summary = '', more: More = {}) {
  const line = summaryOf(summary);
  const note = (more.changes ?? '').trim().replaceAll(/\s+/gu, ' ');
  return {
    declarations: picked(offered, ticks),
    title: title.trim() || words.untitledAddon,
    version,
    ...(line === '' ? {} : { summary: line }),
    ...(more.id ? { id: more.id } : {}),
    ...(note === '' ? {} : { changes: note }),
    ...(more.skills && more.skills.length > 0 ? { skills: [...more.skills] } : {}),
  };
}

/** The record's answer once ticks are sent, or null when it is not one. */
export type Written = { file: string; text: string; adds: unknown[]; brings: { id: string; why: string; title?: string }[]; skills?: string[] };
export function writtenOf(value: unknown, fallbackFile: string): Written | null {
  if (!isMap(value) || typeof value.text !== 'string') return null;
  const brings = (Array.isArray(value.brings) ? value.brings : []).flatMap((b) =>
    isMap(b) && text(b.id) !== '' ? [{ id: text(b.id), why: text(b.why), ...(text(b.title) ? { title: text(b.title) } : {}) }] : [],
  );
  const skills = (Array.isArray(value.skills) ? value.skills : []).flatMap((s) => (typeof s === 'string' && s !== '' ? [s] : []));
  return { file: text(value.file) || fallbackFile, text: value.text, adds: Array.isArray(value.adds) ? value.adds : [], brings, ...(skills.length > 0 ? { skills } : {}) };
}

const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/iu;

/** A handle in words: "rent-reminder" reads "Rent reminder"; a ULID or a number is not a name, so null. */
function handleSaid(id: string): string | null {
  const tail = id.split(/[:/#]/u).pop() ?? '';
  if (tail === '' || ULID.test(tail) || /^\d+$/u.test(tail)) return null;
  const said = tail.replaceAll(/[-_.]+/gu, ' ').trim();
  return said === '' ? null : said.charAt(0).toUpperCase() + said.slice(1);
}

/** How one thing of the answer is said: its offered title, its own title, its handle in words, or "one more thing". */
function nameOf(id: string, offered: readonly Offered[], own?: string): string {
  return offered.find((o) => o.id === id)?.title ?? (own || handleSaid(id) || words.needed);
}

/** One line of the preview: what it says, and the reason under it for a thing brought along. */
export type Line = { text: string; detail?: string };

/**
 * The preview's lines: each thing it adds ("Adds the page Rent"), then each thing it brings because a ticked one needs
 * it ("Also brings Rent reminder", with the record's reason under it). A thing both added and brought is said once.
 */
export function previewLines(written: Pick<Written, 'adds' | 'brings'> & { skills?: readonly string[] | undefined }, offered: readonly Offered[]): Line[] {
  const said = new Set<string>();
  const lines: Line[] = [];
  for (const a of written.adds) {
    const id = typeof a === 'string' ? a : isMap(a) ? text(a.id) : '';
    if (id === '' || said.has(id)) continue;
    said.add(id);
    const known = offered.find((o) => o.id === id);
    const kind = kindOf(known?.kind ?? (isMap(a) ? text(a.kind) : ''));
    const name = nameOf(id, offered, isMap(a) ? text(a.title) : undefined);
    lines.push({ text: kind ? `Adds ${KIND_WORDS[kind].one} ${name}` : `Adds ${name}` });
  }
  for (const b of written.brings) {
    if (said.has(b.id)) continue;
    said.add(b.id);
    lines.push({ text: `Also brings ${nameOf(b.id, offered, b.title)}`, ...(b.why ? { detail: b.why } : {}) });
  }
  for (const s of written.skills ?? []) lines.push({ text: words.givesSkill(s.replaceAll('-', ' ')) });
  return lines;
}

/** A host with no `exportPack` (an older one, or one built over a record without it) says one quiet line. */
export function quietOf(refusal: { code: string } | null | undefined): string | null {
  return refusal && (refusal.code === 'ROUTE_UNKNOWN' || refusal.code === 'NOT_IN_THIS_BUILD') ? words.cannot : null;
}

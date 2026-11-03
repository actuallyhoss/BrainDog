/**
 * Add-ons made in this BrainDog, and where any add-on here came from: what the store's "Made by you" shelf, an add-on's
 * own page and Decide read off the record's `addons` and `addon` answers (`packages/record/src/methods/addons.ts`).
 *
 * THE RECORD SAYS WHERE IT CAME FROM, NEVER THE FILE. Trust is the record's word (`made-here`, `from-a-link`, `reviewed`,
 * ...), worked out from the catalogue and the pack's source. A file can call itself anything; this reads none of that.
 *
 * BRAINDOG'S OWN PARTS ARE NOT MADE BY YOU. The record holds its modules (Work, People, Money core) from the seed, with
 * no catalogue entry, so `addons {installed: true}` answers them as made here too. They are named by BrainDog as their
 * author and are left off the shelf.
 *
 * PLAIN NODE LOADS THIS FILE: no import.
 */

export type AddonTrust = 'braindog' | 'reviewed' | 'signed' | 'unreviewed' | 'made-here' | 'from-a-link';

/** One line of `addons`, with only the keys read here. */
export type AddonLine = {
  id: string;
  title: string;
  summary: string;
  by: string;
  trust: AddonTrust;
  latest: string | null;
  here?: { version: string | null; on: boolean; update?: string };
};

/** What `addon` answers for one add-on, with only the keys read here. */
export type AddonAnswer = {
  id: string;
  title?: string;
  summary?: string;
  by?: string;
  trust?: AddonTrust;
  trust_said?: string;
  /** Where a linked add-on was read from: `git:owner/repo@ref:path` or an https address. */
  from?: string;
  latest?: string | null;
  /** For an add-on from GitHub: the repository, the short commit it is pinned to and the file (lane B). */
  github?: { repo: string; commit: string; path?: string };
  here?: { version: string | null; on: boolean; may?: string[] };
};

export const madeWords = {
  shelf: 'Made by you',
  shelfNote: 'by you or your agents, here only',
  linked: 'From a link',
  onGithub: 'See its repository on GitHub',
  linkedNote: 'installed from GitHub or a file, not reviewed',
  card: (version: string | null): string => (version === null ? 'Made here' : `Made here, ${version}`),
  cardLinked: (version: string | null): string => (version === null ? 'Not reviewed' : `Not reviewed, ${version}`),
  open: 'Open',
  decide: 'Decide',
  waiting: 'Waiting on you',
  waitingLine: 'An agent made this and asks to add it. Read its plan on Decide.',
  fromLink: 'Install from GitHub or a file',
  /* WHERE IT CAME FROM, the tile on an add-on's own page. */
  origin: 'Where it came from',
  madeHere: 'Made in this BrainDog',
  madeHereShort: 'Made here',
  madeBy: (who: string): string => `Made by ${who}, in this BrainDog.`,
  madeByNobody: 'Made in this BrainDog.',
  madeHereNote: 'Only you have it. It is never updated from the store, even if the store has one with the same name.',
  fromGit: (repo: string): string => `From GitHub: ${repo}`,
  atCommit: (sha: string): string => `at ${sha}`,
  fromUrl: (host: string): string => `From a link on ${host}`,
  fromFile: 'From a file',
  notReviewed: 'Not reviewed',
  /* THE SAME SENTENCE THE RECORD AND THE PLAN SHEET SAY (`git-channel.ts` GIT_UNREVIEWED, `asks.ts`). */
  notReviewedLine: 'Not reviewed by BrainDog. Anyone can publish on GitHub. It can only do what is listed below.',
  linkUnreviewed: 'Not reviewed by BrainDog. It can only do what is listed below.',
  fromGitAt: (repo: string, commit: string): string => `From GitHub: ${repo}, commit ${commit}`,
  reviewed: 'Reviewed by BrainDog',
  braindog: 'Made by BrainDog',
  signed: 'Signed by its author, not reviewed',
  /* WHAT IT MAY DO HERE, read off what it put in this BrainDog. */
  may: 'What it may do here',
  mayNote: 'Read from what it added here, not from what it says about itself.',
  mayNothing: 'It added nothing that runs or reaches outside.',
  /* SHARE */
  share: 'Share',
  shareNote: 'It goes as its setup, never your entries.',
  download: 'Download the file',
  downloaded: (file: string): string => `Saved as ${file}.`,
  noFile: 'This BrainDog could not hand the file back.',
  github: 'Put it on GitHub',
  githubSteps: 'Save the file in a folder of its own, then from that folder run:',
  githubThen: 'Anyone can then install it from the line it prints, starting git:',
  submit: 'Submit to the store',
  submitNote: 'BrainDog reviews it before it is listed.',
  submitting: 'Sending',
  /* DECIDE */
  madeFor: (who: string): string => `Made by ${who} for you`,
  madeForLine: 'Made in this BrainDog, not reviewed by BrainDog. It can only do what is listed here, and you can turn it off or remove it later.',
  script: (title: string): string => `Read the script: ${title}`,
  calls: (hosts: readonly string[]): string => `It may call ${hosts.join(', ')}.`,
} as const;

/**
 * The trust as this screen says it: a part BrainDog wrote, held from the seed with no catalogue entry, is answered as made
 * here by the record (its source is local), and is BrainDog's.
 */
export function plainTrust(a: AddonAnswer, ours: ReadonlySet<string> = new Set()): AddonAnswer {
  return a.trust === 'made-here' && (a.by === 'BrainDog' || ours.has(a.id)) ? { ...a, trust: 'braindog' } : a;
}

/** Is this held add-on one the person or their agents made, and not BrainDog's own part held from the seed? */
export function isMadeHere(line: AddonLine, ours: ReadonlySet<string>): boolean {
  return line.trust === 'made-here' && !ours.has(line.id) && line.by !== 'BrainDog' && !line.id.startsWith('usecase-');
}

/** The made-here add-ons and the ones from a link, each in the record's order. */
export function heldMine(lines: readonly AddonLine[], ours: ReadonlySet<string>): { made: AddonLine[]; linked: AddonLine[] } {
  return {
    made: lines.filter((l) => isMadeHere(l, ours)),
    linked: lines.filter((l) => l.trust === 'from-a-link' && !ours.has(l.id)),
  };
}

/** `git:owner/repo@ref:path` read: the repo, the ref (a commit once pinned) and the file. `null` for anything else. */
export function gitOf(from: string | undefined): { repo: string; ref: string; path: string } | null {
  const m = /^git:([\w.-]+\/[\w.-]+)@([^:]+):(.+)$/u.exec(from ?? '');
  return m ? { repo: m[1]!, ref: m[2]!, path: m[3]! } : null;
}

/** A ref as it is shown: a commit cut to seven, a tag as it is. */
export const shortRef = (ref: string): string => (/^[0-9a-f]{40}$/u.test(ref) ? ref.slice(0, 7) : ref);

/** Where an add-on came from, in one line, and whether it was reviewed. */
export function originOf(a: AddonAnswer, maker: string | null): { line: string; note: string | null; badge: string; tone: 'good' | 'warn' | 'info' | null } {
  const git = gitOf(a.from);
  switch (a.trust) {
    case 'made-here':
      return { line: maker === null ? madeWords.madeByNobody : madeWords.madeBy(maker), note: madeWords.madeHereNote, badge: madeWords.madeHereShort, tone: 'info' };
    case 'from-a-link': {
      const host = (() => {
        try {
          return a.from && /^https:/u.test(a.from) ? new URL(a.from).host : null;
        } catch {
          return null;
        }
      })();
      const gh = a.github ?? (git ? { repo: git.repo, commit: shortRef(git.ref) } : null);
      const line = gh ? madeWords.fromGitAt(gh.repo, gh.commit) : host ? madeWords.fromUrl(host) : madeWords.fromFile;
      return { line, note: gh ? madeWords.notReviewedLine : madeWords.linkUnreviewed, badge: madeWords.notReviewed, tone: 'warn' };
    }
    case 'reviewed':
      return { line: a.by ? `By ${a.by}` : madeWords.reviewed, note: null, badge: madeWords.reviewed, tone: 'good' };
    case 'braindog':
      return { line: madeWords.braindog, note: null, badge: madeWords.braindog, tone: 'good' };
    case 'signed':
      return { line: a.by ? `By ${a.by}` : madeWords.signed, note: madeWords.linkUnreviewed, badge: madeWords.signed, tone: 'warn' };
    default:
      return { line: a.by ? `By ${a.by}` : madeWords.notReviewed, note: madeWords.linkUnreviewed, badge: madeWords.notReviewed, tone: 'warn' };
  }
}

/** One question as `governance` answers it, with only the keys read here. */
export type AskedRow = { id?: unknown; cause?: unknown; status?: unknown; run?: { name?: unknown } | null };

/**
 * Who asked to install it: the run named on the newest `pack` question whose cause is this add-on's install
 * (`act:installPack:<id>@<version>:<hash>`). An agent's generic name reads as "an agent" mid-sentence.
 */
export function makerOf(rows: readonly AskedRow[], id: string): string | null {
  const mine = rows.filter((r) => typeof r.cause === 'string' && (r.cause === `act:installPack:${id}` || r.cause.startsWith(`act:installPack:${id}@`)));
  const name = mine.map((r) => r.run?.name).find((n): n is string => typeof n === 'string' && n.trim() !== '');
  return name === undefined ? null : agentName(name);
}

/** "An agent" said inside a sentence. */
export const agentName = (name: string): string => (/^(An|A) /u.test(name) ? name.charAt(0).toLowerCase() + name.slice(1) : name);

/** One open question as `governance` answers it, with the keys read for an add-on waiting to be installed. */
export type OpenRow = { id?: unknown; body_kind?: unknown; cause?: unknown; question?: unknown };

/**
 * The add-ons an agent made and asked to install that wait on Decide: a `pack` question whose cause carries a file
 * (`act:installPack:<id>@<version>:<hash>`), named as the question names it ("Add Film night?" is Film night).
 */
export function waitingOf(rows: readonly OpenRow[], held: ReadonlySet<string>): { id: string; question: string; title: string; version: string | null }[] {
  return rows.flatMap((r) => {
    const m = typeof r.cause === 'string' ? /^act:installPack:([a-z0-9-]+)@([^:]*):/u.exec(r.cause) : null;
    if (r.body_kind !== 'pack' || m === null || typeof r.id !== 'string' || held.has(m[1]!)) return [];
    const q = typeof r.question === 'string' ? r.question : '';
    const title = /^Add (.+)\?$/u.exec(q)?.[1] ?? m[1]!;
    return [{ id: m[1]!, question: r.id, title, version: m[2] === '' ? null : m[2]! }];
  });
}

/**
 * The repository and short commit a `pack` question's body names for an add-on from GitHub: `git` as the record plans it
 * (`arrange.ts` `prepare`), else the `source` an agent asked with. `null` for any other question.
 */
export function gitOfBody(body: unknown): { repo: string; commit: string | null } | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as { git?: { repo?: unknown; commit?: unknown }; source?: { kind?: unknown; ref?: unknown } };
  if (b.git && typeof b.git.repo === 'string') return { repo: b.git.repo, commit: typeof b.git.commit === 'string' ? shortRef(b.git.commit) : null };
  if (b.source?.kind === 'git' && typeof b.source.ref === 'string') {
    const g = gitOf(b.source.ref.startsWith('git:') ? b.source.ref : `git:${b.source.ref}`);
    return g ? { repo: g.repo, commit: shortRef(g.ref) } : null;
  }
  return null;
}

/** The file's name when it is downloaded. */
export const fileName = (id: string, version: string | null | undefined): string => `${id}${version ? `-${version}` : ''}.pack.json`;

/** The scripts a file carries, each with its title, its source and the hosts it may call. */
export function scriptsOf(doc: unknown): { title: string; source: string; egress: string[] }[] {
  const decls = typeof doc === 'object' && doc !== null && Array.isArray((doc as { declarations?: unknown }).declarations) ? (doc as { declarations: unknown[] }).declarations : [];
  return decls.flatMap((d) => {
    if (typeof d !== 'object' || d === null) return [];
    const s = d as Record<string, unknown>;
    if (typeof s.script !== 'string' || typeof s.source !== 'string') return [];
    const egress = Array.isArray(s.egress) ? s.egress.filter((e): e is string => typeof e === 'string') : [];
    return [{ title: typeof s.title === 'string' && s.title.trim() !== '' ? s.title : s.script, source: s.source, egress }];
  });
}

/** The hosts a list of egress addresses names, each once. */
export const hostsOf = (egress: readonly string[]): string[] =>
  [
    ...new Set(
      egress.flatMap((e) => {
        try {
          return [new URL(e).host];
        } catch {
          return [];
        }
      }),
    ),
  ];

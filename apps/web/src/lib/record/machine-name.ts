/**
 * A machine as a person says it: "MacBook Pro 16", "Mac mini", "Windows PC", "Ubuntu build box", never the host name
 * it gave itself ("harbour-macbook-pro-16-m4-max", "DESKTOP-7KQ2M9R"). Every screen that names a machine says it here:
 * the Agents page, the approve page, and the profiles and machines under Settings › Agents.
 *
 * THE KIND, AND WHAT TELLS ONE APART. A host name is read for the kind of machine (`machineOf` in
 * `agents/connect.ts` reads the kind alone), its size where it says one, and the words of its own that are not a
 * person's name, a chip, a version or a serial. What stands before the kind is left out, since a Mac names itself after
 * its owner ("Maras-MacBook-Pro"); `among` brings it back where two machines would otherwise read the same.
 *
 * ONLY WHAT IS SAID. A machine stays keyed by the name its runs gave it, so the composer still aims at the right one;
 * the screen draws this beside the name and offers the name itself as the hover title.
 *
 * PURE, AND NODE LOADS IT.
 */

/** The kinds a host name says, each as its words in the name and as a person says it. */
const KINDS: readonly { words: readonly string[]; said: string; sized?: true }[] = [
  { words: ['macbook', 'pro'], said: 'MacBook Pro', sized: true },
  { words: ['macbook', 'air'], said: 'MacBook Air', sized: true },
  { words: ['mbp'], said: 'MacBook Pro', sized: true },
  { words: ['mba'], said: 'MacBook Air', sized: true },
  { words: ['macbookpro'], said: 'MacBook Pro', sized: true },
  { words: ['macbookair'], said: 'MacBook Air', sized: true },
  { words: ['macbook'], said: 'MacBook', sized: true },
  { words: ['mac', 'mini'], said: 'Mac mini' },
  { words: ['macmini'], said: 'Mac mini' },
  { words: ['mac', 'studio'], said: 'Mac Studio' },
  { words: ['macstudio'], said: 'Mac Studio' },
  { words: ['mac', 'pro'], said: 'Mac Pro' },
  { words: ['imac'], said: 'iMac' },
  { words: ['raspberry', 'pi'], said: 'Raspberry Pi' },
  { words: ['raspberrypi'], said: 'Raspberry Pi' },
];

/** The systems a Linux host name says, as they are written. */
const LINUX: Readonly<Record<string, string>> = { ubuntu: 'Ubuntu', debian: 'Debian', fedora: 'Fedora', arch: 'Arch', linux: 'Linux', nixos: 'NixOS', pop: 'Pop!_OS', mint: 'Mint' };

/** Words a host name carries that say nothing a person reads: a chip, its tier, a release, a domain. */
const NOISE = new Set(['m1', 'm2', 'm3', 'm4', 'm5', 'max', 'ultra', 'lts', 'local', 'lan', 'home', 'localdomain', 'the', 'of', 's', 'x86', 'arm64', 'amd64', 'intel']);

/** A word that is a serial or a version, never a word: digits beside letters ("7kq2m9r"), or digits alone past a size. */
const serial = (w: string): boolean => (/\d/u.test(w) && /[a-z]/u.test(w) && w.length >= 5) || /^\d{3,}$/u.test(w);

const SIZES = new Set(['13', '14', '15', '16', '17']);

const capital = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** The host name in its words, lower case, its domain dropped. */
function wordsOf(name: string): string[] {
  const host = name.trim().replace(/\.(local|lan|home|localdomain|internal)$/iu, '');
  return host
    .replace(/(?<=[a-z])'s\b/giu, '')
    .split(/[\s._-]+/u)
    .map((w) => w.toLowerCase())
    .filter((w) => w !== '');
}

/** The kind's place in the words, and how many words it spans; `null` when the name says none. */
function kindIn(words: readonly string[]): { at: number; span: number; said: string; sized: boolean } | null {
  for (let i = 0; i < words.length; i++)
    for (const k of KINDS) if (k.words.every((w, j) => words[i + j] === w)) return { at: i, span: k.words.length, said: k.said, sized: k.sized === true };
  return null;
}

/** What is left of some words once the noise, serials and versions are out, as a phrase, or `''`. */
const phrase = (words: readonly string[]): string => words.filter((w) => !NOISE.has(w) && !serial(w) && !/^\d+$/u.test(w)).join(' ');

/** One machine, as a person says it, with the words before its kind when `keep` asks for them. */
function said(name: string, keep: boolean): string {
  const words = wordsOf(name);
  if (words.length === 0) return name.trim();
  const kind = kindIn(words);
  if (kind) {
    const next = words[kind.at + kind.span];
    const size = kind.sized && next !== undefined && SIZES.has(next) ? ` ${next}` : '';
    const own = keep ? phrase(words.slice(0, kind.at)) : '';
    return own ? `${capital(own)} ${kind.said}${size}` : `${kind.said}${size}`;
  }
  /* WINDOWS NAMES ITSELF DESKTOP- OR LAPTOP- AND A SERIAL, which says the kind and nothing else. */
  const windows = words.includes('windows') || (/^(desktop|laptop|win)$/u.test(words[0]!) && words.slice(1).some(serial));
  if (windows) return words.includes('laptop') ? 'Windows laptop' : 'Windows PC';
  const system = words.find((w) => Object.hasOwn(LINUX, w));
  if (system) {
    const rest = phrase(words.filter((w) => w !== system));
    return rest ? `${LINUX[system]!} ${rest}` : `${LINUX[system]!} machine`;
  }
  const rest = phrase(words);
  return rest ? capital(rest) : name.trim();
}

/**
 * A machine as a person says it. `among` is every machine named beside it, so two that would read the same keep the
 * words their owners gave them ("Kiln MacBook Pro", "Studio MacBook Pro").
 */
export function machineSaid(name: string, among: readonly string[] = []): string {
  const short = said(name, false);
  const twin = among.some((o) => o.trim() !== name.trim() && said(o, false) === short);
  return twin ? said(name, true) : short;
}

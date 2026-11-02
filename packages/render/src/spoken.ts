/**
 * WORDS A PERSON READS, WITH NO ADDRESS OR ID IN THEM. Whoever asked a question wrote its
 * words, its answers and why each is offered, and an agent writes `alex@acme.com`, `tasks#8` or a file path into them
 * as readily as a name. Every line of the one decision card that came from somebody else is read through `spoken`.
 *
 * ITS OWN MODULE so the question card (`lib/page/queue-answer.ts`) and the card built on it (`card.ts`) read it alike,
 * with no import running in a circle. PURE, AND NODE LOADS IT.
 */


/* A MAIL ADDRESS, and one in brackets after the name it belongs to ("Alex <alex@acme.com>", "Jo (jo@x.io)"), which
   goes whole rather than reading "Jo (someone)". */
const MAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/gu;
const BRACKETED = /\s*<[^<>\s]+@[^<>\s]+>|(?<=[\p{L}.])\s*\([^()\s]+@[^()\s]+\)/gu;
/* A WEB ADDRESS is said as the site it is on; one on a machine or a local network says nothing. */
const WEB = /\bhttps?:\/\/([^\s/?#]+)[^\s]*/giu;
const LOCAL = /\b[\w-]+\.(?:local|lan|internal|home)\b(?::\d+)?/giu;
const IP = /\b\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?\b/gu;
/* A FILE PATH: from the root, the home folder or a drive, or three or more parts of a relative one. A date is no path. */
const ROOTED = /(?<=^|[\s("'\u201C\u2018])(?:(?:~|[A-Za-z]:)[\\/]|[\\/][^\s"'()\u201D\u2019\\/]+[\\/])[^\s"'()\u201D\u2019]*/gu;
const RELATIVE = /(?<=^|[\s("'\u201C\u2018])[\w.-]*[A-Za-z][\w.-]*(?:\/[\w.-]+){2,}/gu;
/* A SHORT ONE, of two parts, is a path only when the last part is a file's name: it ends in an extension that starts
   with a letter ("docs/review.md"). So "and/or", "24/7", "w/o" and "1.5/2.0" stay words. The extension is in one case,
   so a stop with no space after it ("50/50.Then") starts no file's name.
   AND IT IS TOLD FROM TWO WORDS THAT HAPPEN TO HOLD A STOP, which went with their sentence's words:
   the folder is more than one letter and holds no stop before a letter ("e.g./i.e.", "a/b.test", "Node.js/Deno.land"
   stay), and the file's name starts with two letters or is all extension ("v1/v2.beta" stays, "docs/.env" goes). */
const SHORT = /(?<=^|[\s("'\u201C\u2018])(?!\w\/)(?![\w.-]*\.[A-Za-z])[\w.-]+\/(?:[A-Za-z]{2}[\w.-]*)?\.(?:[a-z][a-z0-9]*|[A-Z][A-Z0-9]*)(?![\w\/-])/gu;
/* AN ID: a ULID, a row's handle (`tasks#8`), a commit's hash (two digits and a letter, so "defaced", "face2face" and
   "20261001" stay), a question's own (`SG14`), a person's (`p_…`) and a signer's (`agent:claude`, `rule:late`). */
const IDS = [
  /\b[0-9A-HJKMNP-TV-Z]{26}\b/gu,
  /\b[a-z][a-z0-9_-]*#\d+\b/giu,
  /\b(?=(?:[0-9a-f]*\d){2})(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}\b/gu,
  /\bSG\d+\b/gu,
  /\bp_[A-Za-z0-9]+\b/gu,
  /\b(?:agent|runner|ingest|rule|token):[\w.-]+/gu,
];
/* WHERE SOMETHING WAS TAKEN OUT, held until the words around it are read: a character no sentence holds. */
const GONE = '\u0000';
/* A WORD LEFT POINTING AT NOTHING once what it named is out: "asked by agent:claude about it" is "asked about it", and
   "asked about in" at the end is "asked". A word before a gap that the sentence goes on from keeps its place. */
const LINK = '(?:in|on|at|about|for|to|of|from|with|by|see|as|via)';
const HUNG = new RegExp(`(?:\\s+|(?<=\\())${LINK}\\s*${GONE}(?=\\s*(?:[,.;:!?…)]|$|${GONE}|\\s${LINK}\\b|\\s(?:and|or|because|so|but)\\b))`, 'giu');
const DANGLING = new RegExp(`\\s+${LINK}(?=[.!?…:]?$)`, 'iu');

/** Where a path or an id stood, marked: the stop that ended the sentence stays when the path ate it. */
const gone = (m: string): string => GONE + (/[.,;:!?]$/u.exec(m)?.[0] ?? '');

/**
 * WORDS A PERSON READS, with every address and id taken out: a mail address is someone, a web address its site, and a
 * path, a machine's address, a handle or an id goes with the word it hung from. Slash's braces and money are already
 * words by the time this reads them (`saidOf`).
 */
export function spoken(text: string): string {
  let t = text
    .replaceAll(GONE, '')
    .replace(BRACKETED, '')
    .replace(MAIL, (_m, at: number) => (at === 0 ? 'Someone' : 'someone'))
    .replace(WEB, (m, host: string) => {
      const site = host.replace(/^www\./iu, '').replace(/:\d+$/u, '');
      const local = /\.(?:local|lan|internal|home)$/iu.test(site) || /^[\d.]+$/u.test(site) || site === 'localhost';
      return local ? gone(m) : site + gone(m).slice(GONE.length);
    })
    .replace(LOCAL, gone)
    .replace(IP, gone)
    .replace(ROOTED, gone)
    .replace(RELATIVE, (m) => (/^[\d/.-]+$/u.test(m) ? m : gone(m)))
    .replace(SHORT, gone);
  t = IDS.reduce((x, re) => x.replace(re, GONE), t);
  /* A BRACKET LEFT HOLDING NOTHING goes too, the commas between what went with it, so the word before it is read
     against what follows ("changed in (a.ts, b.ts)" is "changed", not "changed in (, )"). */
  for (let was = ''; was !== t; ) [was, t] = [t, t.replace(HUNG, GONE).replace(new RegExp(`\\(\\s*(?:${GONE}[\\s,;]*)*\\)`, 'gu'), GONE)];
  /* A WORD IS LEFT HANGING ONLY WHERE SOMETHING WAS TAKEN FROM THE END: "the catalogue it came from." took nothing, and
     losing its "from" cut the sentence a person wrote (2 Nov, the Sentry install question). */
  const tookEnd = new RegExp(`${GONE}[\\s.,;:!?…]*$`, 'u').test(t);
  t = t
    .replaceAll(GONE, '')
    .replace(/[(\[]\s*[)\]]/gu, '')
    .replace(/[ \t]{2,}/gu, ' ')
    .replace(/\s+([,.;:!?…])/gu, '$1')
    .replace(/([,;:])(?=[,.;:!?])/gu, '')
    .trim();
  while (tookEnd && DANGLING.test(t)) t = t.replace(DANGLING, '');
  /* AND A STOP LEFT HANGING AT EITHER END: "Ask Jo, see tasks#8" is "Ask Jo", not "Ask Jo,". */
  return t.replace(/^[,.;:·\s]+/u, '').replace(/[,;·\s]+$/u, '').trim();
}

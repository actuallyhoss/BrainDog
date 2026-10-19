/**
 * What an import leaves in a note, and the rules that clean it: one home, so the importer cleans on the way in and the
 * web hides the same things for rows already here. Pure; it never writes a word of its own and never drops a sentence.
 */

const FENCE = /^\s*(```|~~~)/u;
const SLOT = /\{\{|\}\}/u;
/* Imported words and ids that mean nothing to a reader: a "Status in <tool>" line, an import tag, a `register#12` pointer. */
const LEFTOVER = /^status in [^:]{1,40}:|\b[a-z]+:[a-z]+:[\w-]+|\b[a-z][\w-]*#\d+\b/iu;

/** Plain words out of a line of markdown: no list or quote mark, no emphasis, a link as its text. */
export const plainLine = (line: string): string =>
  line
    .replace(/^\s*(?:[>*+-]|\d+[.)])\s+/u, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/gu, '$1')
    .replace(/[*_`]+/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();

const META_PART = /^([A-Za-z][\w ]{0,24}):(?:\s+(.*))?$/u;

/** A metadata line, "Status: building · Lane: ship · Repo: x" (plain words): two or more "Key:" labels split by a dot or a bar. */
const isMeta = (line: string): boolean => line.split(/\s+[·|]\s+/u).filter((part) => META_PART.test(part)).length >= 2;

/** The first `most` real sentences of a note, as lines; `name` is the row's own name, never repeated back to it. */
export function briefFromNote(note: string, name = '', most = 2): string[] {
  const own = name.trim().toLowerCase();
  const out: string[] = [];
  let fenced = false;
  for (const raw of note.split(/\r?\n/u)) {
    if (FENCE.test(raw)) {
      fenced = !fenced;
      continue;
    }
    if (fenced || /^\s*#{1,6}\s/u.test(raw) || SLOT.test(raw)) continue;
    const line = plainLine(raw);
    if (line === '' || line.toLowerCase() === own || LEFTOVER.test(line) || isMeta(line)) continue;
    for (const s of line.split(/(?<=[.!?])\s+/u)) {
      if (s !== '' && !SLOT.test(s) && !LEFTOVER.test(s)) out.push(s);
    }
    if (out.length >= most) break;
  }
  return out.slice(0, most);
}

/* An import's status line: "Status in <tool>: ... Kind: ...". Both halves, so a real sentence that starts alike stays. */
const STATUS_LINE = /^\s*status in [^:]{1,40}:.*\bkind:/iu;

/**
 * A project's whole note without the two things an import left in it: its status line, and a leading "# <name>" heading
 * that repeats the page's own title. Nothing else is touched, so chips fences and real prose draw as written.
 */
export function noteWithoutLeftovers(note: string, name: string): string {
  const own = name.trim().toLowerCase();
  let fenced = false;
  let first = true;
  const kept: string[] = [];
  for (const raw of note.split(/\r?\n/u)) {
    if (FENCE.test(raw)) fenced = !fenced;
    else if (!fenced) {
      if (STATUS_LINE.test(raw)) continue;
      const head = /^\s*#\s+(.+?)\s*#*\s*$/u.exec(raw);
      if (first && head && own !== '' && head[1]!.trim().toLowerCase() === own) {
        first = false;
        continue;
      }
    }
    if (raw.trim() !== '') first = false;
    kept.push(raw);
  }
  return kept.join('\n').replace(/^(?:[ \t]*\n)+/u, '');
}

/** The fields a list declares that a metadata line may fill: its text fields, and its closed lists with their values. */
export type NoteFields = { text: ReadonlySet<string>; closed: ReadonlyMap<string, ReadonlySet<string>> };

const idOf = (key: string): string => key.trim().toLowerCase().replace(/\s+/gu, '_');

/**
 * A note as it should arrive: the status line and the name heading gone, a chips block kept only when it has no
 * unfilled slot, and each "Key: value" metadata line moved into the field of that name where the list declares one
 * (a closed list only for a value it holds), otherwise dropped. A field the row already has is never overwritten.
 * `moved` is what went into fields. An empty `note` back means nothing real was left.
 */
export function cleanImportedNote(
  note: string,
  name: string,
  into: NoteFields,
  have: Readonly<Record<string, unknown>> = {},
): { note: string; moved: Record<string, string> } {
  const moved: Record<string, string> = {};
  const lines = noteWithoutLeftovers(note, name).split(/\r?\n/u);
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    if (FENCE.test(raw)) {
      let end = i + 1;
      while (end < lines.length && !FENCE.test(lines[end]!)) end++;
      const block = lines.slice(i, end + 1);
      const chips = /^\s*(?:```|~~~)\s*chips\b/iu.test(raw);
      if (chips && block.some((l) => SLOT.test(l))) {
        if ((lines[end + 1] ?? 'x').trim() === '') end++;
      } else out.push(...block);
      i = end;
      continue;
    }
    const line = plainLine(raw);
    if (line !== '' && isMeta(line)) {
      for (const part of line.split(/\s+[·|]\s+/u)) {
        const m = META_PART.exec(part);
        const id = m ? idOf(m[1]!) : '';
        const value = (m?.[2] ?? '').trim();
        const kept = have[id];
        if (value === '' || SLOT.test(value) || id in moved || (kept !== undefined && kept !== null && kept !== '')) continue;
        const values = into.closed.get(id);
        if (values) {
          const real = [...values].find((v) => v.toLowerCase() === value.toLowerCase());
          if (real !== undefined) moved[id] = real;
        } else if (into.text.has(id)) moved[id] = value;
      }
      continue;
    }
    out.push(raw);
  }
  return { note: out.join('\n').replace(/\n{3,}/gu, '\n\n').replace(/^(?:[ \t]*\n)+/u, '').trimEnd(), moved };
}

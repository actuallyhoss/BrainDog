/**
 * A door's connect recipe, as an add-on's page shows it: the steps to set a sender up somewhere else, and the text to
 * paste there with this record's address already in it.
 *
 * NOTHING HERE NAMES AN ADD-ON. A webhook ingest checked by a token in its path may carry `connect`: a title, a line on
 * what it does, its steps, the files to paste and a line after them. The page reads it from the add-on's own file, mints
 * the door's address the way Settings, Ingest does, and puts the address where a file says `BRAINDOG_ADDRESS` and the
 * reader's time zone where it says `BRAINDOG_TIMEZONE`. The address is the only copy there will be, so it lives in the
 * component's state and nowhere else, as on the doors screen.
 */

export type RecipeFile = { name: string; text: string };
export type Recipe = { ingest: string; title: string; says: string; steps: string[]; files: RecipeFile[]; after: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** The ingest id of a declaration as the add-on's file writes it (`ingest: gmail_in`) or as a record holds it (`ingest.gmail_in`). */
function ingestOf(d: Record<string, unknown>): string | null {
  if (typeof d.ingest === 'string' && d.ingest !== '') return d.ingest;
  if (typeof d.id === 'string' && d.id.startsWith('ingest.')) return d.id.slice('ingest.'.length);
  return null;
}

/** Every recipe the add-on's declarations carry, in the order written. Only a webhook door checked by its path has one. */
export function recipesIn(declarations: readonly unknown[] | null): Recipe[] {
  const out: Recipe[] = [];
  for (const raw of declarations ?? []) {
    if (!isObj(raw)) continue;
    const d = isObj(raw.body) ? raw.body : raw;
    const ingest = ingestOf(d) ?? (isObj(raw.body) ? ingestOf(raw) : null);
    if (ingest === null || d.channel !== 'webhook' || !isObj(d.connect)) continue;
    if (!isObj(d.verify) || d.verify.kind !== 'path') continue;
    const c = d.connect;
    const files = (Array.isArray(c.files) ? c.files : [])
      .filter(isObj)
      .map((f) => ({ name: text(f.name), text: typeof f.text === 'string' ? f.text : '' }))
      .filter((f) => f.name !== '' && f.text !== '');
    const steps = (Array.isArray(c.steps) ? c.steps : []).map(text).filter((s) => s !== '');
    out.push({ ingest, title: text(c.title) || 'Connect it', says: text(c.says), steps, files, after: text(c.after) });
  }
  return out;
}

/** A file with this record's address and the reader's zone put in. */
export function filled(body: string, address: string, zone: string): string {
  return body.replaceAll('BRAINDOG_ADDRESS', address).replaceAll('BRAINDOG_TIMEZONE', zone || 'Etc/UTC');
}

/** The reader's own time zone, as a browser names it, or UTC when it says none. */
export function readerZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Etc/UTC';
  } catch {
    return 'Etc/UTC';
  }
}

/**
 * WHETHER A WRITE GOES BEYOND WHAT THE PERSON SAID, read from their own sentence and from nothing a model or a row wrote.
 *
 * THE QUESTION THIS ANSWERS IS THE ONE THE MARKS LEFT OPEN. A turn that read words somebody else wrote (a feed's, an
 * agent's, a colleague's) may be carrying an order. Holding every write after such a read closes that, and costs a yes on
 * "find the Acme invoice and mark it paid" wherever agents wrote the row, which on a record agents keep is nearly always,
 * and a yes on every turn is a yes nobody reads. Reading the rows unmarked keeps those turns easy and obeys the order.
 *
 * SO THE READ IS MARKED AND THE WRITE IS WEIGHED. Words in a row can add nothing to the person's sentence, so a write the
 * sentence alone accounts for lands whatever the turn read: its row is one they named, and every value it sets is one they
 * said. Anything else waits for a yes that shows it: another row, another value, words of the model's own or a row's.
 * Tested against the obedient model in `test/slash-marks.test.ts`, with the turns it keeps easy counted there.
 *
 * NO MODEL IS ASKED AND NOTHING IS GUESSED. It compares words. A paraphrase by an honest model is held too, which costs
 * one press and only on a turn that read somebody else's words.
 *
 * A LETTER'S WORTH OF STEMMING AND NO MORE: "invoices" is "invoice", "paid" stays "paid". Generic words name nothing, so
 * "mark the task done" names no task.
 */

type Args = Record<string, unknown>;

/** A field as this file reads it: what it is called and what it takes. Structural, as `ListShape` in the kernel. */
export type HeardField = { id: string; type?: string; label?: unknown; values?: unknown };

const GENERIC = new Set([
  'a', 'an', 'and', 'or', 'but', 'the', 'to', 'of', 'on', 'in', 'at', 'for', 'by', 'with', 'from', 'as', 'is', 'are', 'be', 'was', 'were', 'it', 'its', 'this', 'that',
  'these', 'those', 'my', 'our', 'your', 'their', 'me', 'i', 'we', 'you', 'they', 'he', 'she', 'them', 'him', 'her', 'please', 'so', 'then', 'now', 'just', 'also', 'too',
  'find', 'look', 'search', 'open', 'get', 'show', 'mark', 'change', 'set', 'add', 'make', 'put', 'update', 'edit', 'move', 'rename', 'note', 'log', 'record', 'save', 'keep',
  'task', 'tasks', 'row', 'rows', 'item', 'items', 'entry', 'entries', 'thing', 'things', 'one', 'list', 'lists', 'new', 'all', 'any', 'some', 'there', 'here',
]);

/** A person's several words for what lists keep as one value. */
const SAME = [
  ['done', 'finish', 'finished', 'complete', 'completed', 'close', 'closed', 'closing'],
  ['open', 'reopen', 'reopened', 'todo'],
  ['cancel', 'cancelled', 'canceled', 'drop', 'dropped'],
  ['pause', 'paused', 'hold', 'held'],
  ['active', 'live', 'resume', 'resumed'],
];

const stem = (w: string): string => (w.length > 4 ? w.replace(/(?:'s|ies|es|s)$/u, (m) => (m === 'ies' ? 'y' : '')) : w.replace(/'s$/u, ''));

/** Every word of a text, as this file compares them. */
export const wordsOf = (said: string): string[] =>
  said
    .normalize('NFKC')
    .toLowerCase()
    .split(/[^\p{L}\p{N}']+/u)
    .map((w) => w.replace(/^'+|'+$/gu, ''))
    .filter((w) => w !== '')
    .map(stem);

/** A day a person can name in a sentence, whichever way they name it. */
const DAY_SAID =
  /\b(?:today|tonight|tomorrow|yesterday|next|this|last|week|month|year|mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:rs|rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?|jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|\d{1,4})\b/iu;

const DAY_TYPES = new Set(['day', 'date', 'datetime', 'time']);

/** What was sent with the words: the rows and runs they attached or mentioned, and the row on the page behind. */
export type Heard = { said: string; sent?: readonly string[] | undefined };

/** Words of one value none of the person's words account for, or nothing. */
const unheard = (value: unknown, words: ReadonlySet<string>, field: HeardField | undefined, said: string): string[] => {
  if (value === null || value === undefined || value === '') return [];
  if (Array.isArray(value)) return value.flatMap((v) => unheard(v, words, field, said));
  if (typeof value === 'object') return Object.values(value as Args).flatMap((v) => unheard(v, words, field, said));
  if (typeof value === 'boolean') {
    const name = wordsOf(`${field?.id ?? ''} ${typeof field?.label === 'string' ? field.label : ''}`);
    return name.some((w) => words.has(w)) ? [] : [field?.id ?? String(value)];
  }
  const text = String(value);
  if (field?.type !== undefined && DAY_TYPES.has(field.type)) return DAY_SAID.test(said) ? [] : [text];
  return wordsOf(text).filter((w) => !GENERIC.has(w) && !words.has(w) && !SAME.some((g) => g.includes(w) && g.some((o) => words.has(o))));
};

const quoted = (words: readonly string[]): string => words.slice(0, 4).join(' ');

/**
 * Why a write goes beyond what the person said, in words for their yes card, or `null` when their own sentence accounts
 * for all of it. `row` is the row a change is on, by its id and its name; a new row has none. `list` is the list's own
 * name, which names no row in it.
 */
export function beyondSaid(heard: Heard, write: { row?: { ref: string; name: string } | undefined; list?: string | undefined; values: Args; fields?: readonly HeardField[] | undefined }): string | null {
  const words = new Set(wordsOf(heard.said));
  if (write.row !== undefined) {
    const { ref, name } = write.row;
    const lower = heard.said.toLowerCase();
    const list = new Set(wordsOf(write.list ?? ''));
    const named =
      (heard.sent ?? []).includes(ref) ||
      lower.includes(ref.toLowerCase()) ||
      wordsOf(name).some((w) => !GENERIC.has(w) && !list.has(w) && w.length > 1 && words.has(w));
    if (!named) return `you did not name ${name === '' ? ref : `“${name.slice(0, 60)}”`}`;
  }
  const missing = Object.entries(write.values).flatMap(([id, v]) =>
    unheard(v, words, write.fields?.find((f) => f.id === id), heard.said),
  );
  return missing.length === 0 ? null : `you did not say “${quoted(missing)}”`;
}

const showing = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return 'nothing';
  if (typeof v === 'object') {
    const o = v as { amount?: unknown; currency?: unknown };
    return typeof o.amount === 'number' && typeof o.currency === 'string' ? `${o.amount / 100} ${o.currency}` : JSON.stringify(v);
  }
  return String(v);
};

const SHOWN_MOST = 280;

/**
 * What a held write would set, for the card that asks. A PERSON WHO DOES NOT KNOW WHAT THEY ARE SAYING YES TO IS NOT A
 * CONTROL: the card said "Change note on Pay the rent" and left out what the note would say, which is the part a row's
 * words would have written.
 */
export function valuesSaid(values: Args, fields?: readonly HeardField[]): string {
  const said = Object.entries(values).map(([id, v]) => {
    const f = fields?.find((x) => x.id === id);
    const name = typeof f?.label === 'string' && f.label.trim() !== '' ? f.label.trim().toLowerCase() : id;
    return `${name} to “${showing(v)}”`;
  });
  if (said.length === 0) return '';
  const whole = `It would set ${said.join(', ')}.`;
  return whole.length <= SHOWN_MOST ? whole : `${whole.slice(0, SHOWN_MOST - 1).trimEnd()}…`;
}

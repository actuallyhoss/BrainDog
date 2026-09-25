/**
 * An import adapter for an invented tool, Tallybook, whose export is `{ "items": [{ "id", "what", "due" }] }`: the
 * smallest adapter `braindog import` takes, so a test can hold the command to taking any adapter and not one.
 *
 * IT IMPORTS NOTHING. The importer hands an adapter what it needs from BrainDog (`tools`), so an adapter written by
 * somebody else runs from wherever it sits, with no package of this repository installed beside it.
 */

type Obj = Record<string, unknown>;

const read = (text: string): { ok: true; value: Obj } | { ok: false; fix: string } => {
  const parsed: unknown = JSON.parse(text);
  const value = parsed as Obj;
  return Array.isArray(value.items) ? { ok: true, value } : { ok: false, fix: 'A Tallybook export holds a list called items.' };
};

const plan = (exp: Obj, o: { today: string }) => ({
  key: 'tallybook:',
  taken: typeof exp.saved === 'string' ? exp.saved : null,
  rev: null,
  rows: (exp.items as Obj[]).map((item) => ({ register: 'tasks', key: `tallybook:item:${String(item.id)}`, label: String(item.what), fields: { what: item.what, by: item.due ?? o.today } })),
  asks: [],
  polls: [],
  skipped: [],
  changed: [],
});

export default { source: 'Tallybook', key: 'tallybook:', read, plan };

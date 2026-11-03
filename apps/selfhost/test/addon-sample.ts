/**
 * The sample add-on for phase 4 (add-ons market): a Films list, a page whose drawn view adds a row on a press, a second
 * drawn block that declares nothing, and a script that keeps a count in its store, asks Slash's model once and tells the
 * owner once. Used by `addon-drawn-act.test.ts` and written out as a file for the proof on a local record.
 */

export const FILM_VIEW = `<div class="films">
  <p id="count"></p>
  <button id="add" type="button">Add a film from the view</button>
  <p id="said"></p>
</div>
<style>
  .films { display: grid; gap: 8px; padding: 12px; }
  button { font: inherit; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--rule); background: var(--tile); color: var(--ink); }
</style>
<script>
  braindog.on(function () { document.getElementById('count').textContent = 'Press to add a film to your list.'; });
  document.getElementById('add').onclick = function () {
    braindog.create('films', { name: 'Picked in the view' }).then(function (answer) {
      document.getElementById('said').textContent = answer && answer.ok ? 'Added.' : (answer && answer.refusal ? answer.refusal.fix : 'Not added.');
    });
  };
</script>`;

export const FILM_SCRIPT = `export default async function run(ctx) {
  const films = await ctx.record.list('films', null);
  const runs = ((await ctx.store.get('runs')) ?? 0) + 1;
  await ctx.store.set('runs', runs);
  const pick = await ctx.ask('Pick one film to watch tonight from: ' + films.map((f) => f.fields.name).join(', '));
  const told = await ctx.notify({ title: 'Film night', body: pick.ok ? pick.text : 'Pick one from your list' });
  ctx.log('run ' + runs + ', asked ' + (pick.ok ? 'ok' : pick.refusal.code) + ', told ' + (told.ok ? 'ok' : told.refusal.code));
}`;

export function createDrawnSample(): Record<string, unknown> {
  return {
    pack: 'film-night',
    version: '0.1.0',
    title: 'Film night',
    summary: 'Films to watch, a view that adds one, and a nightly pick.',
    author: 'Made in this BrainDog',
    license: 'MIT',
    requires: { format: 1, primitives: 1, packs: {} },
    uses: [],
    declarations: [
      {
        register: 'films',
        name: 'Films',
        title: 'name',
        fields: [{ id: 'name', label: 'Name', type: 'text', required: true }],
      },
      {
        page: 'films',
        title: 'Films',
        nav: { section: 'Films', order: 50 },
        requires: ['register.films'],
        blocks: [
          /* NO SOURCE, SO IT IS DRAWN ON AN EMPTY LIST TOO: a block over a list with no rows is drawn as that list's empty state. */
          { kind: 'drawn', heading: 'Add from the view', code: FILM_VIEW, height: 160, acts: ['create:register.films'] },
          { kind: 'drawn', heading: 'A picture only', code: '<p>Just a picture.</p>', height: 48 },
          { kind: 'table', heading: 'Films', source: 'register.films', columns: [{ field: 'name' }] },
        ],
      },
      {
        script: 'film_night',
        title: 'Film night',
        runs: { every: '1d' },
        egress: [],
        keys: [],
        reads: ['films'],
        writes: [],
        notifies: true,
        model: { most_per_run: 1 },
        store: true,
        source: FILM_SCRIPT,
      },
    ],
  };
}

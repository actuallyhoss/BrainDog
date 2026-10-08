/** Runs out: the day the money runs out, beside the walk. */

export const RUNWAY: Record<string, unknown>[] = [
  {
    /* WHEN THE MONEY RUNS OUT, BESIDE THE WALK, SINCE money-core 3.11.0, at the figure's own size at the top of the
       side column. Its figure misses its target whenever it has a value, so the app draws it in the colour of a
       miss, and it is drawn only while it has one: a record whose money lasts the year has no such day, and no tile
       says so.

       THE DAY, SINCE money-core 3.12.0 (`runs-out-on`), where it was the count of days: "30 Oct" is the day the flag
       on the walk beside it stands on, and it is still right tomorrow. The days left are the line under it, in the
       place of a target nobody reads. */
    kind: 'stat',
    heading: 'Runs out',
    icon: 'alert',
    span: 12,
    area: 'rail',
    /* A MISS HERE IS THE DANGER COLOUR AND NOT A WARNING: money that runs out inside the year is the one figure on
       the page that needs the person. A host draws a missed target in the block's tone where it declares one. */
    tone: 'bad',
    cells: [{ metric: 'runs-out-on', label: 'On what is due', note: 'In {{runway-days}}' }],
    when: { metric: 'runway-days', gte: 0 },
  },
];

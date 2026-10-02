/**
 * A COUNT OF ROWS A USE CASE'S PAGE IS DRAWN ON, SINCE the calm pages of October 2nd (DIRECTION §35): a tile wears a
 * `when:` over the figure that counts its own rows, so it is never drawn over nothing. A count has no good or bad
 * number, so its target is only that it is a count. `{{it}}` in `where` is filled from a page's row, as
 * `steps-left:{{name}}` names one project's steps.
 */
export const counted = (metric: string, name: string, source: string, where?: string): Record<string, unknown> => ({
  metric,
  name,
  source,
  ...(where === undefined ? {} : { where }),
  value: { count: 'id' },
  format: 'int',
  target: { gte: 0 },
  window: '30d',
  compare: 'none',
});

/* A PLANTED ADD-ON, written the way the seed writes one: a list that says whose it is. Nothing here is a finding. */
export const DRAWERS = {
  id: 'drawers',
  name: 'Drawers',
  pack: 'till',
  fields: [
    { id: 'opened_on', type: 'day' },
    /* A link to another add-on's list is a thing a declaration says. */
    { id: 'chore', type: 'ref', to: 'tasks' },
  ],
};

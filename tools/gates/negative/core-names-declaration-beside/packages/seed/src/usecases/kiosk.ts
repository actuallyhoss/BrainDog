/* A PLANTED USE CASE. It asks for the add-on and names its list, which is what makes `drawers` a name to look for. */
export const KIOSK = {
  usecase: 'kiosk',
  version: '1.0.0',
  title: 'Kiosk',
  modules: ['till'],
  pack: {
    requires: { format: 1, primitives: 1, packs: {} },
    declarations: [{ page: 'page.kiosk', blocks: [{ kind: 'rows', register: 'drawers' }] }],
  },
};

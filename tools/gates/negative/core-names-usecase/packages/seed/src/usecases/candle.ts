/* A PLANTED USE CASE, written the way the seed writes one: the gate reads its names off this text. */
export const CANDLE = {
  usecase: 'candle',
  version: '1.0.0',
  title: 'Candle maker',
  modules: [],
  pack: {
    requires: { format: 1, primitives: 1, packs: {} },
    declarations: [
      { register: 'wicks', name: 'Wicks', title: 'what', fields: [{ id: 'what', type: 'text' }, { id: 'poured_on', type: 'day' }] },
      { metric: 'wicks-poured', name: 'Poured', source: 'wicks' },
    ],
  },
};

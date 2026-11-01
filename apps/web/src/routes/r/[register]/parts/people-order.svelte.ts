/**
 * RECENT OR A TO Z, ONE CHOICE FOR TWO PLACES (1 Nov, L3): the segmented at the head of People's groups on a laptop,
 * and on a phone the "⋯" menu's Sort, where the segmented stood on a row of its own under the toolbar. Kept on this
 * device only, as a convenience; nothing on the record changes.
 */
const ORDER_KEY = 'bd_people_order';

export type PeopleOrder = 'recent' | 'az';

const kept = (): PeopleOrder => {
  try {
    return localStorage.getItem(ORDER_KEY) === 'az' ? 'az' : 'recent';
  } catch {
    return 'recent';
  }
};

export const peopleOrder = $state<{ value: PeopleOrder }>({ value: typeof localStorage === 'undefined' ? 'recent' : kept() });

export function setPeopleOrder(o: PeopleOrder): void {
  peopleOrder.value = o;
  try {
    localStorage.setItem(ORDER_KEY, o);
  } catch {
    /* A browser that keeps nothing opens on Recent next time. */
  }
}

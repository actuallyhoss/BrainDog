/* THE FIRST DECOY, AND NOT A FINDING. Case-folded, `loadingOlder` contains `gold` (`ngOlder`), and a
   substring match reads it as one. Its parts are `loading` and `older`, and neither starts with the
   word. This comment says gold, goldRate and hsbc on purpose: a comment is not code, so a gate that
   named this file for any reason would be counting one finding more than are seeded. */
export let loadingOlder = false;

/* THE THIRD DECOY, AND NOT A FINDING. `bake` is the one word the gate matches whole, because `bakery`
   is a kind of shop a stranger names and starts with it. Matched as the others are, this line is red. */
export const shop = ['bakery', 'baker'];

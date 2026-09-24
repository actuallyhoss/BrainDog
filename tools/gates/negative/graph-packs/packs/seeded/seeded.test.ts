/* THE SAME CLIMB, AND IT MUST NOT BE NAMED. Every pack test builds a record through the core's own
   door, `../../packages/record/src/index.ts` or its like, which is a test driving the core and not the
   pack depending on it. It sits beside the script, as every pack's test does. */
import { k } from '../../packages/kernel/src/index.ts';

void k;

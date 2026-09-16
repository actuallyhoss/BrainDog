/**
 * `/v/<key>` on a live record is the page that view was saved as (`$lib/record/views.ts`). The sample draws its own.
 */
import { redirect } from '@sveltejs/kit';

import { viewMovedTo } from '$lib/record/views.ts';

export async function load({ parent, params }) {
  const moved = viewMovedTo(await parent(), params.view);
  if (moved) redirect(307, moved);
  return {};
}

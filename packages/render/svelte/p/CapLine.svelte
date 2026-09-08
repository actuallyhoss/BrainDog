<!--
  The line a list draws when it is showing less than it holds.

  IT WAS INSIDE `Table` AND EVERY OTHER LIST IN THE PRODUCT HAD NONE. A saved view is the register's
  list with a different filter and rendered every row it held; so did `/audit`, which grows with
  WRITES rather than rows and is therefore the longest list on a busy record; so did `/inbox`, which
  is where one bad ingest rule puts thousands of arrivals, and `/t/<track>`. `13 §4.3` gives the cap
  and `22 §4` gives the reason — ~27 µs a row on a desktop and ~167 µs at 4× throttle, at nine nodes a
  row, so five thousand rows is *"~833 ms of build on a mid-tier phone no matter what CSS you
  write"*.

  ONE SENTENCE, ONE FILE. Two lists saying the same fact two ways is the defect this codebase keeps
  finding, and a cap is exactly the kind of thing that gets re-worded per screen.

  `role="status"`, because it appears as a consequence of what you just typed into the filter. It is
  drawn OUTSIDE the grid and outside the scroller by every caller, for two reasons that were both
  bugs in `Table`: a `<p>` among the rows of a `role="grid"` is not a permitted child, and a line
  inside `.table-region` is invisible on a phone, where the table is `display: none` and the rows are
  cards.
-->
<script lang="ts">
  let { shown, total }: { shown: number; total: number } = $props();
</script>

{#if shown < total}
  <p class="cap-line" role="status">
    Showing {shown.toLocaleString('en')} of {total.toLocaleString('en')} — narrow the filter or export.
  </p>
{/if}

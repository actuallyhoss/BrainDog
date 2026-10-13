<!-- DECOYS, none a finding: the page's own class, id and role, and a style rule, each called by a list's name. -->
<section class="tasks" aria-labelledby="tasks-h">
  <h2 id="tasks-h">Yours</h2>
  <p class="lines" role="status">Nothing yet.</p>
</section>

<style>
  .tasks { display: grid; }
  .lines::before { content: 'tasks'; }
</style>

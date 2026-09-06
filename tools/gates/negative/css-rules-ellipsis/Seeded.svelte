<!-- The seeded violation: an ellipsis on a flex container, which does nothing and says nothing. -->
<div class="cut"><span>fenwick.example.com</span></div>

<style>
  .cut {
    display: flex;
    align-items: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>

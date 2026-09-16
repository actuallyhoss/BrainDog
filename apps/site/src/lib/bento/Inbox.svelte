<!--
  Mail, filed by a rule: Halden's reply arrives, the reply rule reads it, and the invoice it is about
  gains the line that says when it will be paid.

  Every word is the demo's: the arrival `in_8f19`, the rule `rule.reply`, and the feed line it wrote
  onto `obligations#1`. The row keeps its space from the start, so the line arriving changes nothing
  around it.
-->
<script lang="ts">
  import Face from '../Face.svelte';
  import Icon from '../Icon.svelte';
  import { site } from '../copy.ts';

  const c = site.bento.inbox;
</script>

<div class="flow" aria-hidden="true">
  <div class="mail">
    <span class="mail-glyph"><Icon name="inbox" size="s" /></span>
    <span class="mail-main">
      <span class="mail-top"><span class="from">{c.from}</span><span class="age">{c.age}</span></span>
      <span class="subject">{c.subject}</span>
      <span class="preview">{c.preview}</span>
    </span>
  </div>

  <div class="rule">
    <span class="wire"></span>
    <span class="chip"><Face name={c.rule} size="s" />{c.rule}</span>
    <span class="wire wire-2"></span>
  </div>

  <div class="row">
    <p class="row-head">
      <span class="row-title">{c.row}</span>
      <span class="amount num">{c.amount}</span>
    </p>
    <p class="party">{c.party}</p>
    <p class="line"><Face name={c.rule} size="s" /><span class="line-text">{c.line}</span></p>
  </div>
</div>

<style>
  .flow {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    inline-size: 100%;
    font-size: var(--t-sm);
  }

  .mail,
  .row {
    padding: var(--sp-3);
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    box-shadow: none;
  }

  .mail {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: var(--sp-3);
  }

  .mail-glyph {
    display: grid;
    place-items: center;
    inline-size: 26px;
    block-size: 26px;
    background: var(--hover-wash);
    border-radius: var(--r-sm);
    color: var(--ink2);
  }

  .mail-main {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-inline-size: 0;
  }

  .mail-top {
    display: flex;
    justify-content: space-between;
    gap: var(--sp-2);
    color: var(--dim);
    font-size: var(--t-xs);
  }

  .from,
  .preview,
  .row-title,
  .line-text {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .from {
    min-inline-size: 0;
  }

  .age {
    white-space: nowrap;
  }

  .subject {
    color: var(--ink);
    font-weight: 600;
  }

  .preview {
    color: var(--ink2);
    font-size: var(--t-xs);
  }

  .rule {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .wire {
    display: block;
    inline-size: 2px;
    block-size: 14px;
    background: var(--ink);
    border-radius: var(--r-pill);
    transform-origin: 50% 0;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding-block: 3px;
    padding-inline: 4px 10px;
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--r-pill);
    color: var(--ink2);
    font-size: var(--t-xs);
    font-weight: 600;
  }

  .row {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .row-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--sp-2);
  }

  .row-title {
    min-inline-size: 0;
    color: var(--ink);
    font-weight: 600;
  }

  .amount {
    color: var(--ink);
    font-weight: 600;
    white-space: nowrap;
  }

  .party {
    color: var(--dim);
    font-size: var(--t-xs);
  }

  .line {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin-block-start: var(--sp-2);
    padding: 6px;
    background: var(--hover-wash);
    border-radius: var(--r-sm);
    color: var(--ink);
    font-size: var(--t-xs);
  }

  .line-text {
    min-inline-size: 0;
  }

  @media (prefers-reduced-motion: no-preference) {
    .mail {
      animation: arrive 10s var(--ease-spring) infinite both;
    }

    .wire {
      animation: wire 10s var(--ease-out) infinite both;
    }

    .wire-2 {
      animation-name: wire-2;
    }

    .chip {
      animation: chip 10s var(--ease-spring) infinite both;
    }

    .line {
      animation: written 10s var(--ease-out) infinite both;
    }

    .flow {
      animation: reset 10s linear infinite both;
    }
  }

  @keyframes arrive {
    0% {
      opacity: 0;
      transform: translateY(-14px);
    }

    8%,
    100% {
      opacity: 1;
      transform: none;
    }
  }

  @keyframes wire {
    0%,
    14% {
      transform: scaleY(0);
    }

    20%,
    100% {
      transform: none;
    }
  }

  @keyframes wire-2 {
    0%,
    28% {
      transform: scaleY(0);
    }

    34%,
    100% {
      transform: none;
    }
  }

  @keyframes chip {
    0%,
    18% {
      opacity: 0;
      transform: scale(0.9);
    }

    26%,
    100% {
      opacity: 1;
      transform: none;
    }
  }

  @keyframes written {
    0%,
    34% {
      opacity: 0;
      transform: translateY(6px);
      background-color: var(--hover-wash);
    }

    42% {
      opacity: 1;
      transform: none;
      background-color: var(--hover-wash);
    }

    60%,
    100% {
      opacity: 1;
      transform: none;
      background-color: var(--hover-wash);
    }
  }

  @keyframes reset {
    0%,
    92% {
      opacity: 1;
    }

    100% {
      opacity: 0;
    }
  }
</style>

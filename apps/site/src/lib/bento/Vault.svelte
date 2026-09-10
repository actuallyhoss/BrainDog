<!--
  The vault in miniature: what a key opens, never the key, and an agent turned away at the door.

  The rows are the demo's `cr_01` and `cr_02`. The refusal is the rule `apps/web/src/routes/vault`
  states at its top: no agent tool returns a secret, and the whole vault surface is refused to
  agents, because a tool that reached every credential would sit in every session's prompt.
-->
<script lang="ts">
  import Face from '../Face.svelte';
  import Icon from '../Icon.svelte';
  import { site } from '../copy.ts';

  const c = site.bento.vault;
</script>

<div class="vault" aria-hidden="true">
  <div class="cred">
    <p class="cred-head">
      <span class="glyph key" data-hue="warn"><Icon name="key" size="s" /></span>
      <span class="name">{c.key.label}</span>
      <span class="stale">{c.stale}</span>
    </p>
    <dl class="props">
      <div class="prop"><dt>{c.opens}</dt><dd>{c.key.opens}</dd></div>
      <div class="prop"><dt>{c.secret}</dt><dd class="sealed"><Icon name="lock" size="s" />{c.sealed}</dd></div>
    </dl>
  </div>

  <div class="cred cred-quiet">
    <span class="glyph key" data-hue="info"><Icon name="key" size="s" /></span>
    <span class="quiet-main"><span class="name">{c.other.label}</span><span class="opens">{c.other.opens}</span></span>
  </div>

  <div class="req">
    <Face name="Claude" size="s" />
    <span class="req-text">{c.asks}</span>
    <span class="refused"><Icon name="ban" size="s" />{c.refused}</span>
  </div>
</div>

<style>
  .vault {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    inline-size: 100%;
    font-size: var(--t-sm);
  }

  .cred {
    padding: var(--sp-3);
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    box-shadow: var(--e1);
  }

  .cred-head {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }

  .key {
    inline-size: 24px;
    block-size: 24px;
    border-radius: var(--r-sm);
  }

  .name {
    min-inline-size: 0;
    color: var(--ink);
    font-weight: 600;
  }

  .stale {
    margin-inline-start: auto;
    padding-block: 1px;
    padding-inline: 8px;
    background: var(--warn-wash);
    border-radius: var(--r-pill);
    color: var(--warn);
    font-size: var(--t-xs);
    font-weight: 600;
    white-space: nowrap;
  }

  .props {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 0;
    margin-block-start: var(--sp-3);
  }

  .prop {
    display: grid;
    grid-template-columns: 7ch minmax(0, 1fr);
    align-items: center;
    gap: var(--sp-2);
  }

  .prop dt {
    color: var(--dim);
    font-size: var(--t-xs);
  }

  .prop dd {
    margin: 0;
    color: var(--ink2);
  }

  /* Where the key would be, a sealed strip that says it is not here. */
  .sealed {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    justify-self: start;
    padding-block: 2px;
    padding-inline: 8px;
    background: repeating-linear-gradient(-45deg, var(--hover-wash) 0 6px, transparent 6px 12px);
    border: 1px dashed var(--edge);
    border-radius: var(--r-sm);
    font-size: var(--t-xs);
    font-weight: 500;
  }

  .cred-quiet {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    box-shadow: none;
  }

  .quiet-main {
    display: flex;
    flex-direction: column;
    min-inline-size: 0;
  }

  .opens {
    color: var(--dim);
    font-size: var(--t-xs);
  }

  .req {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    padding-block: 6px;
    padding-inline: 6px 10px;
    background: var(--s2);
    border: 1px solid var(--line);
    border-radius: var(--r-pill);
    color: var(--ink2);
    font-size: var(--t-xs);
  }

  .req-text {
    flex: 1;
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .refused {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--danger);
    font-weight: 700;
    white-space: nowrap;
  }

  @media (prefers-reduced-motion: no-preference) {
    .req {
      animation: ask 9s var(--ease-out) infinite both;
    }

    .refused {
      animation: refuse 9s var(--ease-spring) infinite both;
    }

    .sealed {
      animation: hold 9s var(--ease-out) infinite both;
    }
  }

  @keyframes ask {
    0%,
    10% {
      opacity: 0;
      transform: translateY(10px);
    }

    20%,
    90% {
      opacity: 1;
      transform: none;
    }

    100% {
      opacity: 0;
      transform: none;
    }
  }

  @keyframes refuse {
    0%,
    28% {
      opacity: 0;
      transform: scale(0.8);
    }

    34%,
    90% {
      opacity: 1;
      transform: none;
    }

    100% {
      opacity: 0;
    }
  }

  /* The sealed strip answers the request: it lights as the refusal lands, then settles. */
  @keyframes hold {
    0%,
    26% {
      box-shadow: none;
    }

    32% {
      box-shadow: 0 0 0 4px var(--warn-wash);
    }

    44%,
    100% {
      box-shadow: none;
    }
  }
</style>

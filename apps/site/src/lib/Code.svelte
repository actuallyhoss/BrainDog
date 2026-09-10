<!--
  The code block, with the three colours code has.

  IT WAS TWENTY-ONE LINES IN ONE INK. A specification set in a monospace face and a single grey is
  a paragraph that happens to be aligned: the comments, the two verbs and the values all weigh the
  same, so the block reads as texture and the eye slides off it. It is also the one place on this
  page where colour is doing a JOB rather than decorating: which of these words is the machine's
  and which is yours is the whole question a reader has of a code block.

  THREE ROLES AND NOT SIX. Every editor theme ever shipped is a lesson in how many colours a
  reader can hold, and the answer on a marketing page is fewer than in an editor, because nobody
  is going to live here. A comment is `--dim` because it is an aside; a field name is `--info`
  because that is the note role and a key is what the record is being told to look at; a value is
  `--earn` because it is the answer. The verbs and the braces stay in the body ink, distinguished
  by weight, so the shape of the call still reads first.

  TOKENISED AT BUILD TIME, not in the browser. This site ships no JavaScript to the reader and
  this component does not change that: the whole page is prerendered to HTML on disk, so what
  arrives is spans with classes on them.
-->
<script lang="ts">
  let { code, label }: { code: string; label?: string } = $props();

  type Kind = 'comment' | 'verb' | 'key' | 'value' | 'plain';

  /**
   * One pass, four shapes: a quoted string that a colon follows is a field name, any other quoted
   * string is a value, a bare run of digits is a value, and the two words that start a call are
   * verbs. Everything else is punctuation and stays in the body ink.
   *
   * The comment case is handled a line at a time above this, because `#` inside a quoted spoken
   * id is not a comment and a regex that thinks it is would swallow half of `"obligations#4"`.
   */
  const TOKEN = /"(?:[^"\\]|\\.)*"\s*:|"(?:[^"\\]|\\.)*"|\b\d+\b|\b(?:list|update)\b/g;

  const classify = (text: string): Kind => {
    if (text.startsWith('"')) return text.trimEnd().endsWith(':') ? 'key' : 'value';
    if (/^\d+$/.test(text)) return 'value';
    return 'verb';
  };

  const parse = (line: string): { kind: Kind; text: string }[] => {
    if (line.trimStart().startsWith('#')) return [{ kind: 'comment', text: line }];
    const out: { kind: Kind; text: string }[] = [];
    let at = 0;
    for (const match of line.matchAll(TOKEN)) {
      const start = match.index ?? 0;
      if (start > at) out.push({ kind: 'plain', text: line.slice(at, start) });
      out.push({ kind: classify(match[0]), text: match[0] });
      at = start + match[0].length;
    }
    if (at < line.length) out.push({ kind: 'plain', text: line.slice(at) });
    return out;
  };

  const lines = $derived(code.split('\n').map(parse));
</script>

<!--
  NO LINE BREAKS INSIDE THE `<pre>`. Every newline in this template is a newline on the page, so
  the whole loop is one line of source. And the classes go on through `class:` directives rather
  than `class={part.kind}`, because the compiler decides which rules below are dead by reading
  the markup: a computed class name is a class name it cannot see, and the rule that paints it
  gets dropped from the bundle.
-->
<pre class="code" aria-label={label}><code>{#each lines as line, i}{#if i > 0}{'\n'}{/if}{#each line as part}<span class:comment={part.kind === 'comment'} class:verb={part.kind === 'verb'} class:key={part.kind === 'key'} class:value={part.kind === 'value'}>{part.text}</span>{/each}{/each}</code></pre>

<style>
  .code {
    margin: 0;
    padding: var(--sp-4) var(--sp-5);
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--r-lg);
    box-shadow: var(--raise);
    color: var(--ink2);
    font-family: var(--font-id);
    font-size: var(--t-sm);
    line-height: 1.8;
    overflow-x: auto;
  }

  .comment {
    color: var(--dim);
  }

  .verb {
    color: var(--ink);
    font-weight: 600;
  }

  .key {
    color: var(--info);
  }

  .value {
    color: var(--earn);
  }
</style>

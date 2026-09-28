<script>
  // Family notes board. Post from the wall or from any phone on the Wi-Fi
  // (same URL). Pinned notes also show in the Next-up strip and get read out
  // in the Alexa morning briefing.
  import { api } from '../api.js';
  import { textOn, tint } from './colour.js';

  let notes = $state([]);
  let people = $state([]);
  let body = $state('');
  let author = $state('');
  let pin = $state(true);
  let busy = $state(false);
  let error = $state('');

  async function load() {
    try {
      var r = await Promise.all([api.get('/notes'), api.get('/calendars')]);
      notes = r[0];
      people = r[1];
    } catch (e) {
      error = e.message;
    }
  }

  $effect(() => {
    load();
    var iv = setInterval(load, 60 * 1000);
    return function () {
      clearInterval(iv);
    };
  });

  async function post() {
    if (!body.trim() || busy) return;
    busy = true;
    error = '';
    try {
      await api.post('/notes', { body: body.trim(), author: author || null, pinned: pin });
      body = '';
      await load();
    } catch (e) {
      error = e.message;
    } finally {
      busy = false;
    }
  }

  async function togglePin(n) {
    try {
      await api.patch('/notes/' + n.id, { pinned: !n.pinned });
      await load();
    } catch (e) {
      error = e.message;
    }
  }

  async function remove(n) {
    if (!confirm('Remove this note?')) return;
    try {
      await api.del('/notes/' + n.id);
      await load();
    } catch (e) {
      error = e.message;
    }
  }

  function ago(iso) {
    var mins = Math.round((Date.now() - new Date(iso)) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + ' min ago';
    var h = Math.round(mins / 60);
    if (h < 24) return h + 'h ago';
    var d = Math.round(h / 24);
    return d === 1 ? 'yesterday' : d + ' days ago';
  }
</script>

{#if error}<div class="error">{error}</div>{/if}

<div class="card composer">
  <textarea
    rows="2"
    maxlength="500"
    placeholder="Leave a note for the family… e.g. PE kit is in the car"
    bind:value={body}
  ></textarea>

  <div class="from">
    <span class="from-label">From</span>
    <button
      type="button"
      class="chip"
      class:sel={!author}
      onclick={() => (author = '')}>Anyone</button
    >
    {#each people.filter((p) => p.slug !== 'family') as p (p.slug)}
      <button
        type="button"
        class="chip"
        class:sel={author === p.slug}
        style={author === p.slug
          ? 'background:' + p.colour + ';color:' + textOn(p.colour) + ';border-color:' + p.colour
          : 'border-color:' + p.colour}
        onclick={() => (author = p.slug)}>{p.label.split(' ')[0]}</button
      >
    {/each}
  </div>

  <div class="actions">
    <label class="pin">
      <input type="checkbox" bind:checked={pin} />
      <span>📌 Pin — shows on the home screen and in the morning briefing</span>
    </label>
    <button class="post" disabled={busy || !body.trim()} onclick={post}>
      {busy ? 'Posting…' : 'Post note'}
    </button>
  </div>
</div>

{#if notes.length}
  <div class="board">
    {#each notes as n (n.id)}
      <div
        class="note"
        class:pinned={n.pinned}
        style="background:{tint(n.colour, 0.22)};border-top-color:{n.colour || '#94a3b8'}"
      >
        <div class="note-body">{n.body}</div>
        <div class="note-foot">
          <span class="note-meta">
            {n.author_label ? '— ' + n.author_label.split(' ')[0] + ' · ' : ''}{ago(n.created_at)}
          </span>
          <button class="icon" class:on={n.pinned} title={n.pinned ? 'Unpin' : 'Pin'} onclick={() => togglePin(n)}
            >📌</button
          >
          <button class="icon" title="Remove" onclick={() => remove(n)}>✕</button>
        </div>
      </div>
    {/each}
  </div>
{:else}
  <div class="card empty">No notes yet. Leave the first one above.</div>
{/if}

<style>
  .composer {
    padding: 14px;
    margin-bottom: 14px;
  }
  textarea {
    width: 100%;
    padding: 12px;
    border: 1px solid var(--border);
    border-radius: 10px;
    font-family: inherit;
    font-size: 16px;
    resize: none;
    -webkit-appearance: none;
  }
  .from {
    margin: 8px -3px 0;
  }
  .from-label {
    display: inline-block;
    margin: 0 6px 0 3px;
    font-size: 13px;
    font-weight: 600;
    color: var(--text-muted);
  }
  /* inline-block + margins: no flexbox gap on Safari 10 */
  .chip {
    display: inline-block;
    margin: 3px;
    padding: 7px 12px;
    border-radius: 999px;
    border: 2px solid var(--border);
    background: #fff;
    color: var(--text);
    font-size: 14px;
    font-weight: 600;
    font-family: inherit;
  }
  .chip.sel:first-of-type {
    background: var(--header);
    color: #fff;
    border-color: var(--header);
  }
  .actions {
    display: grid;
    grid-template-columns: 1fr auto;
    grid-gap: 10px;
    align-items: center;
    margin-top: 10px;
  }
  .pin {
    font-size: 13px;
    color: var(--text-muted);
  }
  .pin input {
    width: 18px;
    height: 18px;
    vertical-align: -4px;
    margin-right: 6px;
  }
  .post {
    background: var(--header);
    color: #fff;
    padding: 11px 20px;
    border-radius: 10px;
    font-weight: 700;
    font-size: 15px;
  }
  .post:disabled {
    opacity: 0.5;
  }
  .board {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    grid-gap: 12px;
  }
  @media (max-width: 800px) {
    .board {
      grid-template-columns: repeat(2, 1fr);
    }
  }
  @media (max-width: 520px) {
    .board {
      grid-template-columns: 1fr;
    }
  }
  .note {
    position: relative;
    padding: 14px 14px 10px;
    border-radius: 10px;
    border-top: 5px solid #94a3b8;
    box-shadow: var(--shadow);
    min-height: 110px;
    -webkit-transform: rotate(-0.6deg);
    transform: rotate(-0.6deg);
  }
  .note:nth-child(2n) {
    -webkit-transform: rotate(0.7deg);
    transform: rotate(0.7deg);
  }
  .note.pinned {
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.18);
  }
  .note-body {
    font-size: 17px;
    line-height: 1.4;
    color: var(--text);
    word-wrap: break-word;
    white-space: pre-wrap;
    margin-bottom: 10px;
    /* white backing under the tint so text stays crisp on any colour */
    background: rgba(255, 255, 255, 0.55);
    border-radius: 6px;
    padding: 6px 8px;
  }
  .note-foot {
    display: grid;
    grid-template-columns: 1fr auto auto;
    align-items: center;
  }
  .note-meta {
    font-size: 12px;
    color: var(--text-muted);
    font-weight: 600;
  }
  .icon {
    font-size: 15px;
    padding: 4px 6px;
    opacity: 0.35;
  }
  .icon.on {
    opacity: 1;
  }
  .empty {
    padding: 24px;
    text-align: center;
    color: var(--text-muted);
  }
  .error {
    background: #fee2e2;
    color: #b91c1c;
    border-radius: 8px;
    padding: 8px 12px;
    margin-bottom: 8px;
    font-size: 13px;
  }
</style>

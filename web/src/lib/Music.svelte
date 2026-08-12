<script>
  import { api } from '../api.js';

  let status = $state(null);
  let players = $state([]);
  let error = $state('');
  let announceText = $state('');
  let announceTarget = $state('');

  async function load() {
    try {
      status = await api.get('/home/status');
      if (status.ok) {
        players = await api.get('/home/players');
        if (!announceTarget && players.length) announceTarget = players[0].entity_id;
      }
    } catch (e) {
      error = e.message;
    }
  }

  $effect(() => {
    load();
    const iv = setInterval(load, 20 * 1000);
    return () => clearInterval(iv);
  });

  async function cmd(player, command, body) {
    try {
      await api.post('/home/players/' + player.entity_id + '/' + command, body);
      setTimeout(load, 600);
    } catch (e) {
      error = e.message;
    }
  }

  async function announce() {
    if (!announceText.trim() || !announceTarget) return;
    try {
      await api.post('/home/announce', {
        entity_id: announceTarget,
        message: announceText.trim()
      });
      announceText = '';
    } catch (e) {
      error = e.message;
    }
  }
</script>

{#if error}<div class="error">{error}</div>{/if}

{#if !status}
  <div class="card note">Checking the house…</div>
{:else if !status.configured}
  <div class="card note">
    <div class="note-title">🏠 Home Assistant isn't linked yet</div>
    <p>
      Finish HA onboarding, create a long-lived access token, put it in
      <code>.env</code> as <code>HA_TOKEN</code>, and restart the stack.
    </p>
  </div>
{:else if !status.ok}
  <div class="card note">🏠 Home Assistant isn't responding right now.</div>
{:else if !players.length}
  <div class="card note">
    No speakers found yet — add the Sonos integration in Home Assistant and they'll appear here.
  </div>
{:else}
  <div class="players">
    {#each players as p (p.entity_id)}
      <div class="card player">
        <div class="p-name">{p.name}</div>
        {#if p.media_title}
          <div class="p-track">{p.media_title}{p.media_artist ? ' — ' + p.media_artist : ''}</div>
        {:else}
          <div class="p-track muted">{p.state}</div>
        {/if}
        <div class="controls">
          <button onclick={() => cmd(p, 'previous')}>⏮</button>
          {#if p.state === 'playing'}
            <button class="big" onclick={() => cmd(p, 'pause')}>⏸</button>
          {:else}
            <button class="big" onclick={() => cmd(p, 'play')}>▶️</button>
          {/if}
          <button onclick={() => cmd(p, 'next')}>⏭</button>
        </div>
        <div class="vol">
          <button onclick={() => cmd(p, 'volume', { volume: Math.max(0, (p.volume || 0.3) - 0.05) })}>🔉</button>
          <div class="vol-bar">
            <div class="vol-fill" style="width:{(p.volume || 0) * 100}%"></div>
          </div>
          <button onclick={() => cmd(p, 'volume', { volume: Math.min(1, (p.volume || 0.3) + 0.05) })}>🔊</button>
        </div>
      </div>
    {/each}
  </div>

  <div class="card announce">
    <div class="a-title">📢 Announce</div>
    <div class="a-row">
      <select bind:value={announceTarget}>
        {#each players as p (p.entity_id)}
          <option value={p.entity_id}>{p.name}</option>
        {/each}
      </select>
      <input placeholder="Dinner in five minutes!" bind:value={announceText} />
      <button class="send" onclick={announce}>Send</button>
    </div>
  </div>
{/if}

<style>
  .players {
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-gap: 16px;
  }
  @media (max-width: 640px) {
    .players {
      grid-template-columns: 1fr;
    }
  }
  .player {
    padding: 16px;
    text-align: center;
  }
  .p-name {
    font-size: 18px;
    font-weight: 700;
  }
  .p-track {
    font-size: 13px;
    margin: 4px 0 10px;
    min-height: 18px;
  }
  .muted {
    color: var(--text-muted);
  }
  .controls button {
    font-size: 26px;
    padding: 8px 14px;
  }
  .controls .big {
    font-size: 38px;
  }
  .vol {
    display: grid;
    grid-template-columns: auto 1fr auto;
    grid-gap: 8px;
    align-items: center;
    margin-top: 8px;
  }
  .vol button {
    font-size: 20px;
  }
  .vol-bar {
    height: 6px;
    background: var(--bg);
    border-radius: 3px;
    overflow: hidden;
  }
  .vol-fill {
    height: 100%;
    background: var(--matt);
  }
  .note {
    padding: 24px;
    text-align: center;
    color: var(--text-muted);
  }
  .note-title {
    font-size: 17px;
    font-weight: 700;
    color: var(--text);
    margin-bottom: 8px;
  }
  .note code {
    background: var(--bg);
    padding: 1px 6px;
    border-radius: 4px;
  }
  .announce {
    margin-top: 16px;
    padding: 16px;
  }
  .a-title {
    font-weight: 700;
    margin-bottom: 10px;
  }
  .a-row {
    display: grid;
    grid-template-columns: auto 1fr auto;
    grid-gap: 8px;
  }
  .a-row select,
  .a-row input {
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
    font-family: inherit;
    font-size: 15px;
    background: #fff;
    -webkit-appearance: none;
  }
  .send {
    background: var(--header);
    color: #fff;
    padding: 10px 18px;
    border-radius: 8px;
    font-weight: 600;
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

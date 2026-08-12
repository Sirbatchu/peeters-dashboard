<script>
  import { api } from '../api.js';

  let status = $state(null);
  let phones = $state([]);
  let cameras = $state([]);
  let error = $state('');
  let finding = $state('');
  let refreshing = $state('');
  // Cache-bust per camera so "refresh" actually refetches the JPEG
  let imgStamp = $state({});

  async function load() {
    try {
      status = await api.get('/home/status');
      if (status.ok) {
        [phones, cameras] = await Promise.all([
          api.get('/home/phones'),
          api.get('/home/cameras')
        ]);
      }
    } catch (e) {
      error = e.message;
    }
  }

  $effect(() => {
    load();
    const iv = setInterval(load, 60 * 1000);
    return () => clearInterval(iv);
  });

  async function findPhone(p) {
    finding = p.service;
    error = '';
    try {
      await api.post('/home/phones/' + p.service + '/find');
      setTimeout(() => (finding = ''), 4000);
    } catch (e) {
      error = e.message;
      finding = '';
    }
  }

  async function refreshCam(c) {
    refreshing = c.entity_id;
    try {
      await api.post('/home/cameras/' + c.entity_id.replace('camera.', '') + '/refresh');
      // Blink needs a moment to wake, snap and upload
      setTimeout(() => {
        imgStamp = { ...imgStamp, [c.entity_id]: Date.now() };
        refreshing = '';
      }, 6000);
    } catch (e) {
      error = e.message;
      refreshing = '';
    }
  }

  async function armAll(arm) {
    try {
      const res = await api.post('/home/cameras-arm', { arm });
      error = res.panels ? '' : 'No alarm panels found — add the Blink integration in HA first';
    } catch (e) {
      error = e.message;
    }
  }

  function imgUrl(c) {
    const stamp = imgStamp[c.entity_id] || 'initial';
    return '/api/home/cameras/' + c.entity_id.replace('camera.', '') + '/image?t=' + stamp;
  }
</script>

{#if error}<div class="error">{error}</div>{/if}

{#if !status}
  <div class="card note">Checking the house…</div>
{:else if !status.configured || !status.ok}
  <div class="card note">
    <div class="note-title">🏠 Home Assistant isn't linked yet</div>
    <p>
      Phone finder and cameras switch on once HA is set up: finish onboarding at
      <strong>http://192.168.10.6:8123</strong>, create a long-lived token, and add it to
      <code>.env</code> as <code>HA_TOKEN</code>.
    </p>
  </div>
{:else}
  <div class="card panel">
    <div class="panel-title">📱 Phone finder</div>
    {#if phones.length}
      <div class="phones">
        {#each phones as p (p.service)}
          <button class="phone" class:ringing={finding === p.service} onclick={() => findPhone(p)}>
            <span class="phone-icon">{finding === p.service ? '🔔' : '📱'}</span>
            <span>{finding === p.service ? 'Ringing…' : 'Find ' + p.name}</span>
          </button>
        {/each}
      </div>
    {:else}
      <p class="hint">
        No phones registered yet. Install the <strong>Home Assistant Companion</strong> app on each
        phone and sign into your HA — they'll appear here automatically.
      </p>
    {/if}
  </div>

  <div class="card panel">
    <div class="head-row">
      <div class="panel-title">📷 Cameras</div>
      {#if cameras.length}
        <div>
          <button class="arm" onclick={() => armAll(true)}>Arm</button>
          <button class="arm disarm" onclick={() => armAll(false)}>Disarm</button>
        </div>
      {/if}
    </div>
    {#if cameras.length}
      <div class="cams">
        {#each cameras as c (c.entity_id)}
          <div class="cam">
            <img src={imgUrl(c)} alt={c.name} />
            <div class="cam-bar">
              <span class="cam-name">{c.name}</span>
              <button class="snap" disabled={refreshing === c.entity_id} onclick={() => refreshCam(c)}>
                {refreshing === c.entity_id ? '📸 Waking…' : '📸 Fresh shot'}
              </button>
            </div>
          </div>
        {/each}
      </div>
      <p class="hint">
        Stills, not live video — Blink cameras are battery-powered, so they only wake when asked.
      </p>
    {:else}
      <p class="hint">
        No cameras yet. In Home Assistant: <strong>Settings → Devices & services → Add
        integration → Blink</strong>, sign in with your Blink account, and they'll show up here.
      </p>
    {/if}
  </div>
{/if}

<style>
  .panel {
    padding: 16px;
    margin-bottom: 16px;
  }
  .panel-title {
    font-size: 18px;
    font-weight: 700;
  }
  .head-row {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    margin-bottom: 12px;
  }
  .phones {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    grid-gap: 12px;
    margin-top: 12px;
  }
  .phone {
    display: block;
    padding: 22px 12px;
    border-radius: 14px;
    background: var(--bg);
    font-size: 18px;
    font-weight: 600;
    color: var(--text);
    text-align: center;
  }
  .phone.ringing {
    background: #fef3c7;
    color: #b45309;
    -webkit-animation: pulse 0.8s ease infinite;
    animation: pulse 0.8s ease infinite;
  }
  .phone-icon {
    display: block;
    font-size: 34px;
    margin-bottom: 6px;
  }
  .cams {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    grid-gap: 12px;
  }
  @media (max-width: 700px) {
    .cams {
      grid-template-columns: 1fr;
    }
  }
  .cam {
    border-radius: 12px;
    overflow: hidden;
    background: var(--header);
  }
  .cam img {
    width: 100%;
    display: block;
    min-height: 140px;
    background: #1e293b;
  }
  .cam-bar {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    padding: 8px 12px;
    color: #fff;
  }
  .cam-name {
    font-size: 14px;
    font-weight: 600;
  }
  .snap {
    color: #fbbf24;
    font-size: 13px;
    font-weight: 600;
  }
  .snap:disabled {
    opacity: 0.6;
  }
  .arm {
    background: #16a34a;
    color: #fff;
    border-radius: 999px;
    padding: 8px 16px;
    font-size: 13px;
    font-weight: 600;
    margin-left: 6px;
  }
  .arm.disarm {
    background: var(--text-muted);
  }
  .hint {
    font-size: 13px;
    color: var(--text-muted);
    margin-top: 10px;
    line-height: 1.5;
  }
  .hint code {
    background: var(--bg);
    padding: 1px 6px;
    border-radius: 4px;
  }
  .note {
    padding: 24px;
    text-align: center;
    color: var(--text-muted);
    line-height: 1.6;
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
  .error {
    background: #fee2e2;
    color: #b91c1c;
    border-radius: 8px;
    padding: 8px 12px;
    margin-bottom: 8px;
    font-size: 13px;
  }
</style>

<script>
  import Sky from './lib/Sky.svelte';
  import Header from './lib/Header.svelte';
  import Calendar from './lib/Calendar.svelte';
  import Kids from './lib/Kids.svelte';
  import Music from './lib/Music.svelte';
  import { api } from './api.js';

  let tab = $state('calendar');
  let weatherCode = $state(113);
  let online = $state(true);

  const TABS = [
    { id: 'calendar', label: 'Calendar', icon: '📅' },
    { id: 'kids', label: 'Kids', icon: '⭐' },
    { id: 'music', label: 'Music', icon: '🎵' }
  ];

  async function heartbeat() {
    try {
      await api.get('/health');
      online = true;
    } catch (e) {
      online = false;
    }
  }

  $effect(() => {
    heartbeat();
    const iv = setInterval(heartbeat, 30000);

    // iOS kills backgrounded standalone apps; refresh state on wake.
    const onVis = () => {
      if (!document.hidden) heartbeat();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(iv);
      document.removeEventListener('visibilitychange', onVis);
    };
  });
</script>

<Sky {weatherCode} />

<div class="shell">
  <Header bind:weatherCode />

  {#if !online}
    <div class="offline">Reconnecting to the house server…</div>
  {/if}

  <nav class="tabs">
    {#each TABS as t (t.id)}
      <button class="tab" class:active={tab === t.id} onclick={() => (tab = t.id)}>
        <span class="tab-icon">{t.icon}</span>
        <span>{t.label}</span>
      </button>
    {/each}
  </nav>

  <main>
    {#if tab === 'calendar'}
      <Calendar />
    {:else if tab === 'kids'}
      <Kids />
    {:else if tab === 'music'}
      <Music />
    {/if}
  </main>
</div>

<style>
  .shell {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    min-height: 100vh;
  }
  main {
    flex: 1;
    padding: 16px;
    max-width: 1100px;
    width: 100%;
    margin: 0 auto;
  }
  .tabs {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    grid-gap: 10px;
    padding: 12px 16px 0;
    max-width: 1100px;
    width: 100%;
    margin: 0 auto;
  }
  .tab {
    display: block;
    padding: 14px 8px;
    border-radius: var(--radius);
    background: rgba(255, 255, 255, 0.35);
    -webkit-backdrop-filter: blur(14px) saturate(1.3);
    backdrop-filter: blur(14px) saturate(1.3);
    border: 1px solid rgba(255, 255, 255, 0.4);
    color: #fff;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
    font-size: 16px;
    font-weight: 600;
    box-shadow: var(--shadow);
    -webkit-transition: background 0.25s, -webkit-transform 0.25s;
    transition: background 0.25s, transform 0.25s;
  }
  .tab.active {
    background: rgba(15, 23, 42, 0.82);
    border-color: rgba(255, 255, 255, 0.2);
    -webkit-transform: translateY(-2px);
    transform: translateY(-2px);
  }
  .tab-icon {
    display: inline-block;
    margin-right: 8px;
    font-size: 20px;
    vertical-align: -2px;
  }
  .offline {
    background: #b45309;
    color: #fff;
    text-align: center;
    padding: 8px;
    font-size: 14px;
    font-weight: 500;
  }
</style>

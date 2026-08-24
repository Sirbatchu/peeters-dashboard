<script>
  import Sky from './lib/Sky.svelte';
  import Header from './lib/Header.svelte';
  import Calendar from './lib/Calendar.svelte';
  import Kids from './lib/Kids.svelte';
  import Food from './lib/Food.svelte';
  import House from './lib/House.svelte';
  import Music from './lib/Music.svelte';
  import PhotoFrame from './lib/PhotoFrame.svelte';
  import { api } from './api.js';

  let tab = $state('calendar');
  let weatherCode = $state(113);
  let online = $state(true);
  let settings = $state({});
  let now = $state(new Date());

  const TABS = [
    { id: 'calendar', label: 'Calendar', icon: '📅' },
    { id: 'kids', label: 'Kids', icon: '⭐' },
    { id: 'food', label: 'Food', icon: '🛒' },
    { id: 'house', label: 'House', icon: '🏠' },
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

  async function loadSettings() {
    try {
      settings = await api.get('/settings');
    } catch (e) {
      /* defaults below cover it */
    }
  }

  function minsOf(hhmm, fallback) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || fallback);
    return Number(m[1]) * 60 + Number(m[2]);
  }

  // Morning countdown: school days, between morning_start and morning_leave
  let countdown = $derived.by(() => {
    const isoDay = ((now.getDay() + 6) % 7) + 1; // Mon=1
    if (!(settings.school_days || '12345').includes(String(isoDay))) return null;
    const nowMins = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
    const start = minsOf(settings.morning_start, '07:00');
    const leave = minsOf(settings.morning_leave, '08:30');
    if (nowMins < start || nowMins >= leave) return null;
    const left = leave - nowMins;
    return {
      mins: Math.floor(left),
      secs: Math.floor((left % 1) * 60),
      frac: (nowMins - start) / (leave - start),
      urgent: left <= 10,
      critical: left <= 5
    };
  });

  // Bedtime mode: dim everything between bedtime_start and bedtime_end
  let bedtime = $derived.by(() => {
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const start = minsOf(settings.bedtime_start, '19:00');
    const end = minsOf(settings.bedtime_end, '06:30');
    return start > end ? nowMins >= start || nowMins < end : nowMins >= start && nowMins < end;
  });

  $effect(() => {
    heartbeat();
    loadSettings();
    const iv = setInterval(heartbeat, 30000);
    const clock = setInterval(() => (now = new Date()), 1000);
    const st = setInterval(loadSettings, 5 * 60 * 1000);

    // iOS kills backgrounded standalone apps; refresh state on wake.
    const onVis = () => {
      if (!document.hidden) {
        heartbeat();
        loadSettings();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(iv);
      clearInterval(clock);
      clearInterval(st);
      document.removeEventListener('visibilitychange', onVis);
    };
  });
</script>

<Sky {weatherCode} />

<div class="shell" class:dimmed={bedtime}>
  <Header bind:weatherCode />

  {#if !online}
    <div class="offline">Reconnecting to the house server…</div>
  {/if}

  {#if bedtime}
    <div class="bedtime-chip">🌙 Bedtime mode — back to full brightness at {settings.bedtime_end || '06:30'}</div>
  {/if}

  {#if countdown}
    <div class="countdown" class:urgent={countdown.urgent} class:critical={countdown.critical}>
      <span class="cd-icon">🎒</span>
      <span class="cd-text">
        Leave for school in <strong>{countdown.mins}:{countdown.secs < 10 ? '0' : ''}{countdown.secs}</strong>
      </span>
      <div class="cd-bar">
        <div class="cd-fill" style="width:{countdown.frac * 100}%"></div>
      </div>
    </div>
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
    {:else if tab === 'food'}
      <Food />
    {:else if tab === 'house'}
      <House />
    {:else if tab === 'music'}
      <Music />
    {/if}
  </main>
</div>

{#if bedtime}
  <div class="night-veil"></div>
{/if}

<PhotoFrame idleMins={10} />

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
    grid-template-columns: repeat(5, 1fr);
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
  /* Landscape / short viewports (iPad 4 landscape is 1024x768).
     Compact the chrome so all six calendar rows stay on screen. */
  @media (max-height: 850px) {
    main {
      padding: 10px 12px;
    }
    .tabs {
      grid-gap: 8px;
      padding: 8px 12px 0;
    }
    .tab {
      padding: 8px 6px;
      font-size: 14px;
    }
    .tab-icon {
      font-size: 16px;
      margin-right: 5px;
    }
    .countdown {
      margin-top: 6px;
      padding: 7px 14px;
      font-size: 15px;
    }
    .countdown strong {
      font-size: 18px;
    }
    .cd-icon {
      font-size: 20px;
    }
    .bedtime-chip {
      margin-top: 6px;
      padding: 5px 14px;
      font-size: 12px;
    }
  }

  .offline {
    background: #b45309;
    color: #fff;
    text-align: center;
    padding: 8px;
    font-size: 14px;
    font-weight: 500;
  }

  /* Morning countdown banner */
  .countdown {
    max-width: 1100px;
    width: calc(100% - 32px);
    margin: 10px auto 0;
    padding: 12px 18px;
    border-radius: var(--radius);
    background: rgba(255, 255, 255, 0.85);
    -webkit-backdrop-filter: blur(14px);
    backdrop-filter: blur(14px);
    box-shadow: var(--shadow);
    display: grid;
    grid-template-columns: auto auto 1fr;
    grid-gap: 14px;
    align-items: center;
    font-size: 17px;
  }
  .countdown strong {
    font-size: 22px;
  }
  .cd-icon {
    font-size: 26px;
  }
  .cd-bar {
    height: 10px;
    background: rgba(15, 23, 42, 0.1);
    border-radius: 5px;
    overflow: hidden;
  }
  .cd-fill {
    height: 100%;
    background: #16a34a;
    border-radius: 5px;
  }
  .countdown.urgent {
    background: #fef3c7;
  }
  .countdown.urgent .cd-fill {
    background: #d97706;
  }
  .countdown.critical {
    background: #fee2e2;
    -webkit-animation: pulse 1s ease infinite;
    animation: pulse 1s ease infinite;
  }
  .countdown.critical .cd-fill {
    background: #dc2626;
  }

  /* Bedtime mode */
  .shell.dimmed {
    -webkit-filter: brightness(0.68) saturate(0.75);
    filter: brightness(0.68) saturate(0.75);
    -webkit-transition: -webkit-filter 2s ease;
    transition: filter 2s ease;
  }
  .bedtime-chip {
    max-width: 1100px;
    width: calc(100% - 32px);
    margin: 10px auto 0;
    padding: 8px 16px;
    border-radius: 999px;
    background: rgba(15, 23, 42, 0.6);
    -webkit-backdrop-filter: blur(10px);
    backdrop-filter: blur(10px);
    color: #cbd5e1;
    font-size: 13px;
    font-weight: 500;
    text-align: center;
  }
  .night-veil {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    z-index: 5;
    pointer-events: none;
    background: rgba(10, 10, 40, 0.25);
  }
</style>

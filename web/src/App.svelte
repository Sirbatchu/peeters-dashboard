<script>
  import Sky from './lib/Sky.svelte';
  import Header from './lib/Header.svelte';
  import Calendar from './lib/Calendar.svelte';
  import Kids from './lib/Kids.svelte';
  import Food from './lib/Food.svelte';
  import House from './lib/House.svelte';
  import Music from './lib/Music.svelte';
  import PhotoFrame from './lib/PhotoFrame.svelte';
  import Backdrop from './lib/Backdrop.svelte';
  import Settings from './lib/Settings.svelte';
  import NextUp from './lib/NextUp.svelte';
  import Notes from './lib/Notes.svelte';
  import { api } from './api.js';

  let tab = $state('calendar');
  let weatherCode = $state(113);
  let online = $state(true);
  let settings = $state({});
  let showSettings = $state(false);
  let now = $state(new Date());
  // Full screen: header and tabs give way to a slim bar that flips between
  // the calendar and the kids' board. Entered from the calendar's ⛶ button.
  let full = $state(false);
  const FULL_TABS = ['calendar', 'kids'];
  let isFull = $derived(full && FULL_TABS.indexOf(tab) !== -1);
  let clockStr = $derived(
    String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0')
  );

  const TABS = [
    { id: 'calendar', label: 'Calendar', icon: '📅' },
    { id: 'kids', label: 'Kids', icon: '⭐' },
    { id: 'food', label: 'Food', icon: '🛒' },
    { id: 'notes', label: 'Notes', icon: '📝' },
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
      applyRemoteDim(settings);
    } catch (e) {
      /* defaults below cover it */
    }
  }

  // "Alexa, bedtime" and the morning briefing dim/brighten every screen by
  // writing settings.dim_command = {state, at}. Each screen acts on a command
  // once; a manual 🌙/☀️ tap afterwards still wins until the next command.
  let lastDimCmd = storedDimCmd();

  function storedDimCmd() {
    try {
      return Number(localStorage.getItem('dimCmdAt')) || 0;
    } catch (e) {
      return 0;
    }
  }

  function applyRemoteDim(s) {
    if (!s || !s.dim_command) return;
    var cmd;
    try {
      cmd = JSON.parse(s.dim_command);
    } catch (e) {
      return;
    }
    if (!cmd || !cmd.at || cmd.at <= lastDimCmd) return;
    var firstEver = !lastDimCmd;
    lastDimCmd = cmd.at;
    try {
      localStorage.setItem('dimCmdAt', String(cmd.at));
    } catch (e) {
      /* private mode: the in-memory copy still stops repeats */
    }
    // A screen seeing its first ever command shouldn't act on a stale one,
    // e.g. a tablet switched on in the afternoon after last night's bedtime.
    if (firstEver && Date.now() - cmd.at > 10 * 60 * 1000) return;
    setDim(cmd.state === 1);
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

  // Dim mode: toggled by hand with the 🌙 button (no automatic schedule).
  // Remembered per screen, so dimming the tablet doesn't dim the iPad.
  let dimmed = $state(savedDim());

  function savedDim() {
    try {
      return localStorage.getItem('dimmed') === '1';
    } catch (e) {
      return false;
    }
  }

  function setDim(v) {
    dimmed = v;
    try {
      localStorage.setItem('dimmed', dimmed ? '1' : '0');
    } catch (e) {
      /* private mode etc. */
    }
  }

  function toggleDim() {
    setDim(!dimmed);
  }

  $effect(() => {
    heartbeat();
    loadSettings();
    const iv = setInterval(heartbeat, 30000);
    const clock = setInterval(() => (now = new Date()), 1000);
    // Every 20s so "Alexa, bedtime" dims the screens promptly (and a
    // background picked on a phone shows up quickly). It's one tiny request.
    const st = setInterval(loadSettings, 20 * 1000);

    // Keep the wall tablet's screen on. Wake Lock is Android Chrome over
    // HTTPS only (the iPad uses Auto-Lock: Never instead), and the browser
    // drops the lock whenever the page is hidden, so re-take it on wake.
    let wakeLock = null;
    const keepAwake = () => {
      if (!navigator.wakeLock || wakeLock) return;
      navigator.wakeLock
        .request('screen')
        .then((l) => {
          wakeLock = l;
          l.addEventListener('release', () => (wakeLock = null));
        })
        .catch(() => {});
    };
    keepAwake();

    // iOS kills backgrounded standalone apps; refresh state on wake.
    const onVis = () => {
      if (!document.hidden) {
        heartbeat();
        loadSettings();
        keepAwake();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(iv);
      clearInterval(clock);
      clearInterval(st);
      document.removeEventListener('visibilitychange', onVis);
      if (wakeLock) wakeLock.release();
    };
  });
</script>

<Sky {weatherCode} />
<Backdrop {settings} />

<div class="shell" class:dimmed class:calfull={isFull}>
  <!-- Hidden rather than unmounted in full-screen so weather keeps updating. -->
  <div class="chrome">
    <Header bind:weatherCode />
    <NextUp />
  </div>

  {#if !online}
    <div class="offline">Reconnecting to the house server…</div>
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

  {#if isFull}
    <div class="fullbar">
      <div class="fb-clock">{clockStr}</div>
      <div class="fb-tabs">
        {#each TABS.filter((t) => FULL_TABS.indexOf(t.id) !== -1) as t (t.id)}
          <button class="fb-tab" class:active={tab === t.id} onclick={() => (tab = t.id)}>
            <span class="tab-icon">{t.icon}</span>{t.label}
          </button>
        {/each}
      </div>
      <div class="fb-right">
        <button class="fb-exit" onclick={() => (showSettings = true)} title="Settings">⚙️</button>
        <button class="fb-exit" class:on={dimmed} onclick={toggleDim}>{dimmed ? '☀️ Brighten' : '🌙 Dim'}</button>
        <button class="fb-exit" onclick={() => (full = false)}>✕ Exit full screen</button>
      </div>
    </div>
  {/if}

  <nav class="tabs chrome">
    {#each TABS as t (t.id)}
      <button class="tab" class:active={tab === t.id} onclick={() => (tab = t.id)}>
        <span class="tab-icon">{t.icon}</span>
        <span>{t.label}</span>
      </button>
    {/each}
    <button class="tab dim-btn" class:active={dimmed} onclick={toggleDim} title={dimmed ? 'Brighten' : 'Dim'}>
      {dimmed ? '☀️' : '🌙'}
    </button>
    <button class="tab dim-btn" onclick={() => (showSettings = true)} title="Settings">⚙️</button>
  </nav>

  <main>
    {#if tab === 'calendar'}
      <Calendar bind:full />
    {:else if tab === 'kids'}
      <Kids />
    {:else if tab === 'food'}
      <Food />
    {:else if tab === 'notes'}
      <Notes />
    {:else if tab === 'house'}
      <House />
    {:else if tab === 'music'}
      <Music />
    {/if}
  </main>
</div>

{#if dimmed}
  <div class="night-veil"></div>
{/if}

<!-- Outside .shell so the dim filter doesn't darken the panel. -->
{#if showSettings}
  <Settings {settings} onclose={() => (showSettings = false)} onsaved={(s) => (settings = s)} />
{/if}

<PhotoFrame idleMins={10} />

<style>
  .shell {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  main {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    padding: 16px;
    max-width: 1100px;
    width: 100%;
    margin: 0 auto;
  }
  .calfull .chrome {
    display: none;
  }
  .calfull main {
    max-width: none;
    padding: 8px;
  }
  .fullbar {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    padding: 8px 12px 0;
  }
  .fb-clock {
    color: #fff;
    font-size: 22px;
    font-weight: 700;
    text-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
  }
  .fb-tabs {
    background: rgba(255, 255, 255, 0.35);
    -webkit-backdrop-filter: blur(14px);
    backdrop-filter: blur(14px);
    border-radius: 999px;
    padding: 3px;
    white-space: nowrap;
  }
  .fb-tab {
    font-size: 15px;
    font-weight: 600;
    color: #fff;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
    padding: 7px 22px;
    border-radius: 999px;
  }
  .fb-tab.active {
    background: rgba(15, 23, 42, 0.82);
    text-shadow: none;
  }
  .fb-exit {
    justify-self: end;
    font-size: 13px;
    font-weight: 600;
    color: #fff;
    background: rgba(15, 23, 42, 0.55);
    padding: 7px 14px;
    border-radius: 999px;
  }
  .tabs {
    display: grid;
    grid-template-columns: repeat(6, 1fr) auto auto;
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
    .dim-btn {
      padding: 8px 12px;
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

  .dim-btn {
    padding: 14px 16px;
    font-size: 18px;
  }
  .fb-right {
    justify-self: end;
    white-space: nowrap;
  }
  .fb-right .fb-exit {
    margin-left: 6px;
  }
  .fb-exit.on {
    background: rgba(245, 158, 11, 0.85);
  }

  /* Dim mode */
  .shell.dimmed {
    -webkit-filter: brightness(0.68) saturate(0.75);
    filter: brightness(0.68) saturate(0.75);
    -webkit-transition: -webkit-filter 2s ease;
    transition: filter 2s ease;
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

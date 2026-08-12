<script>
  import { api } from '../api.js';

  let { weatherCode = $bindable(113) } = $props();

  let clock = $state('');
  let seconds = $state('');
  let dateStr = $state('');
  let weather = $state(null);

  const ICONS = [
    { min: 386, max: 395, icon: '⛈' },
    { min: 323, max: 377, icon: '🌨' },
    { min: 263, max: 321, icon: '🌧' },
    { min: 176, max: 230, icon: '🌦' },
    { min: 119, max: 143, icon: '☁️' },
    { min: 116, max: 116, icon: '⛅️' },
    { min: 113, max: 113, icon: '☀️' }
  ];

  function iconFor(code) {
    for (const i of ICONS) if (code >= i.min && code <= i.max) return i.icon;
    return '☀️';
  }

  function tick() {
    const now = new Date();
    const h = String(now.getHours());
    const m = String(now.getMinutes());
    const s = String(now.getSeconds());
    clock = (h.length < 2 ? '0' + h : h) + ':' + (m.length < 2 ? '0' + m : m);
    seconds = s.length < 2 ? '0' + s : s;
    dateStr = now.toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    });
  }

  async function loadWeather() {
    try {
      weather = await api.get('/weather');
      weatherCode = weather.code;
    } catch (e) {
      /* keep previous */
    }
  }

  function dayName(iso) {
    return new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short' });
  }

  $effect(() => {
    tick();
    loadWeather();
    const t = setInterval(tick, 1000);
    const w = setInterval(loadWeather, 15 * 60 * 1000);
    return () => {
      clearInterval(t);
      clearInterval(w);
    };
  });
</script>

<header class="float-in">
  <div class="left">
    <div class="clock">
      {clock}<span class="secs">:{seconds}</span>
    </div>
    <div class="date">{dateStr}</div>
  </div>

  <div class="brand">
    <div class="brand-name">Peeters</div>
    <div class="brand-sub">family hub</div>
  </div>

  <div class="right">
    {#if weather}
      <div class="now">
        <span class="w-icon">{iconFor(weather.code)}</span>
        <span class="temp">{weather.tempC}°</span>
      </div>
      <div class="desc">{weather.desc} · feels {weather.feelsLikeC}°</div>
      {#if weather.days && weather.days.length}
        <div class="forecast">
          {#each weather.days as d (d.date)}
            <span class="f-day">
              {dayName(d.date)} {iconFor(d.code)} {d.maxC}°
            </span>
          {/each}
        </div>
      {/if}
    {/if}
  </div>
</header>

<style>
  header {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    padding: 18px 24px 8px;
    color: #fff;
    text-shadow: 0 1px 4px rgba(0, 0, 0, 0.45);
    max-width: 1100px;
    width: 100%;
    margin: 0 auto;
  }
  .clock {
    font-size: 46px;
    font-weight: 700;
    line-height: 1;
    letter-spacing: -1px;
  }
  .secs {
    font-size: 22px;
    font-weight: 400;
    opacity: 0.75;
  }
  .date {
    font-size: 15px;
    opacity: 0.92;
    margin-top: 3px;
  }
  .brand {
    text-align: center;
    padding: 0 24px;
  }
  .brand-name {
    font-size: 26px;
    font-weight: 700;
    letter-spacing: 0.5px;
  }
  .brand-sub {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 3px;
    opacity: 0.8;
  }
  .right {
    text-align: right;
  }
  .now {
    font-size: 34px;
    font-weight: 700;
    line-height: 1;
  }
  .w-icon {
    font-size: 28px;
    margin-right: 6px;
  }
  .desc {
    font-size: 13px;
    opacity: 0.92;
    margin-top: 3px;
  }
  .forecast {
    margin-top: 6px;
  }
  .f-day {
    display: inline-block;
    font-size: 12px;
    font-weight: 600;
    background: rgba(255, 255, 255, 0.18);
    -webkit-backdrop-filter: blur(8px);
    backdrop-filter: blur(8px);
    border-radius: 999px;
    padding: 3px 10px;
    margin-left: 6px;
  }
</style>

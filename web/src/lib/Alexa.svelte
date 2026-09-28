<script>
  // Alexa: the morning briefing and "Alexa, bedtime". Settings save as you
  // change them; the API's scheduler reads them every 30 seconds.
  import { api } from '../api.js';

  const DAYS = [
    { n: '1', l: 'M' },
    { n: '2', l: 'T' },
    { n: '3', l: 'W' },
    { n: '4', l: 'T' },
    { n: '5', l: 'F' },
    { n: '6', l: 'S' },
    { n: '7', l: 'S' }
  ];

  let s = $state({});
  let devices = $state([]);
  let preview = $state('');
  let busy = $state('');
  let msg = $state('');
  let error = $state('');
  let showHow = $state(false);

  async function load() {
    try {
      var r = await Promise.all([api.get('/settings'), api.get('/alexa/devices')]);
      s = r[0];
      devices = r[1];
    } catch (e) {
      error = e.message;
    }
  }

  $effect(() => {
    load();
  });

  async function set(key, value) {
    s[key] = value;
    try {
      var body = {};
      body[key] = value;
      await api.put('/settings', body);
    } catch (e) {
      error = e.message;
    }
  }

  function toggleDay(n) {
    var days = s.briefing_days || '';
    days = days.indexOf(n) !== -1 ? days.replace(n, '') : days + n;
    set('briefing_days', days.split('').sort().join(''));
  }

  function note(text) {
    msg = text;
    setTimeout(function () {
      if (msg === text) msg = '';
    }, 5000);
  }

  async function doPreview() {
    busy = 'preview';
    error = '';
    try {
      preview = (await api.get('/briefing/preview')).text;
    } catch (e) {
      error = e.message;
    } finally {
      busy = '';
    }
  }

  async function playNow() {
    busy = 'play';
    error = '';
    try {
      var r = await api.post('/briefing/play', {});
      preview = r.text;
      note('🔊 Playing on ' + label(r.target));
    } catch (e) {
      error = e.message;
    } finally {
      busy = '';
    }
  }

  async function bedtimeNow() {
    busy = 'bed';
    error = '';
    try {
      await api.post('/bedtime', {});
      note('🌙 Bedtime started — screens dim within 20 seconds');
    } catch (e) {
      error = e.message;
    } finally {
      busy = '';
    }
  }

  function label(entity) {
    var d = devices.find(function (x) {
      return x.entity_id === entity;
    });
    return d ? d.name.replace(/ (Speak|Announce)$/, '') : entity;
  }

  // Briefing can go to one Echo (speak) or every Echo at once (House announce).
  let briefingTargets = $derived(devices.filter((d) => d.available));
  // Music needs a single real Echo, so bedtime only offers speak entities.
  let bedtimeTargets = $derived(devices.filter((d) => d.available && d.kind === 'speak'));
</script>

<div class="card panel">
  <div class="panel-title">🔊 Alexa</div>
  {#if error}<div class="error">{error}</div>{/if}
  {#if msg}<div class="ok">{msg}</div>{/if}

  <div class="section">
    <div class="sec-head">
      <div>
        <div class="sec-title">☀️ Morning briefing</div>
        <div class="sec-sub">Weather, who has what today, birthdays, dinner and pinned notes.</div>
      </div>
      <label class="switch">
        <input
          type="checkbox"
          checked={s.briefing_enabled === '1'}
          onchange={(e) => set('briefing_enabled', e.target.checked ? '1' : '0')}
        />
        <span>{s.briefing_enabled === '1' ? 'On' : 'Off'}</span>
      </label>
    </div>

    <div class="grid2">
      <label class="fld">
        <span>Time</span>
        <input
          type="time"
          value={s.briefing_time || '07:15'}
          onchange={(e) => set('briefing_time', e.target.value)}
        />
      </label>
      <label class="fld">
        <span>Echo</span>
        <select value={s.briefing_target} onchange={(e) => set('briefing_target', e.target.value)}>
          {#each briefingTargets as d (d.entity_id)}
            <option value={d.entity_id}
              >{d.name.replace(/ (Speak|Announce)$/, '')}{d.kind === 'announce' ? ' (with chime)' : ''}</option
            >
          {/each}
        </select>
      </label>
    </div>

    <div class="days">
      {#each DAYS as d (d.n)}
        <button
          class="day"
          class:on={(s.briefing_days || '').indexOf(d.n) !== -1}
          onclick={() => toggleDay(d.n)}>{d.l}</button
        >
      {/each}
    </div>

    <div class="btns">
      <button class="ghost" disabled={busy === 'preview'} onclick={doPreview}>
        {busy === 'preview' ? 'Writing…' : '👀 Preview'}
      </button>
      <button class="primary" disabled={busy === 'play'} onclick={playNow}>
        {busy === 'play' ? 'Sending…' : '▶ Play now'}
      </button>
    </div>
    {#if preview}<blockquote>{preview}</blockquote>{/if}
  </div>

  <div class="section">
    <div class="sec-title">🌙 Bedtime</div>
    <div class="sec-sub">
      Dims every screen, says goodnight, then starts wind-down music on the Echo you choose.
    </div>

    <div class="grid2">
      <label class="fld">
        <span>Echo</span>
        <select value={s.bedtime_target} onchange={(e) => set('bedtime_target', e.target.value)}>
          {#each bedtimeTargets as d (d.entity_id)}
            <option value={d.entity_id}>{d.name.replace(/ Speak$/, '')}</option>
          {/each}
        </select>
      </label>
      <label class="fld">
        <span>Music (what you'd say after "Alexa…")</span>
        <input
          value={s.bedtime_command || ''}
          placeholder="play relaxing sleep music"
          onchange={(e) => set('bedtime_command', e.target.value)}
        />
      </label>
    </div>
    <label class="fld">
      <span>Goodnight message</span>
      <input
        value={s.bedtime_message || ''}
        placeholder="Goodnight everyone. Time to wind down."
        onchange={(e) => set('bedtime_message', e.target.value)}
      />
    </label>

    <div class="btns">
      <button class="ghost" onclick={() => (showHow = !showHow)}>🗣 Set up "Alexa, bedtime"</button>
      <button class="primary" disabled={busy === 'bed'} onclick={bedtimeNow}>
        {busy === 'bed' ? 'Starting…' : '🌙 Bedtime now'}
      </button>
    </div>

    {#if showHow}
      <ol class="how">
        <li>Say <strong>"Alexa, discover devices"</strong>. It finds a light called <em>Bedtime</em>.</li>
        <li>
          That already works as <strong>"Alexa, turn on Bedtime"</strong>. To just say
          <strong>"Alexa, bedtime"</strong>: in the Alexa app, More → Routines → ＋ → When:
          <em>Voice</em> "bedtime" → Add action: <em>Smart Home → Bedtime → Power on</em>.
        </li>
      </ol>
    {/if}
  </div>
</div>

<style>
  .panel {
    padding: 16px;
    margin-bottom: 16px;
  }
  .panel-title {
    font-size: 18px;
    font-weight: 700;
    margin-bottom: 10px;
  }
  .section {
    padding: 12px 0;
    border-top: 1px solid var(--border);
  }
  .sec-head {
    display: grid;
    grid-template-columns: 1fr auto;
    grid-gap: 10px;
    align-items: center;
  }
  .sec-title {
    font-weight: 700;
    font-size: 16px;
  }
  .sec-sub {
    font-size: 13px;
    color: var(--text-muted);
    margin: 2px 0 10px;
  }
  .switch {
    font-weight: 700;
    font-size: 14px;
  }
  .switch input {
    width: 22px;
    height: 22px;
    vertical-align: -5px;
    margin-right: 6px;
  }
  .grid2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-gap: 10px;
  }
  @media (max-width: 600px) {
    .grid2 {
      grid-template-columns: 1fr;
    }
  }
  .fld {
    display: block;
    margin-bottom: 8px;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-muted);
  }
  .fld > span {
    display: block;
    margin-bottom: 3px;
  }
  .fld input,
  .fld select {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: 10px;
    font-family: inherit;
    font-size: 15px;
    background: #fff;
    color: var(--text);
    -webkit-appearance: none;
  }
  .days {
    margin: 2px 0 10px;
  }
  /* inline-block + margin: no flexbox gap on Safari 10 */
  .day {
    display: inline-block;
    width: 38px;
    height: 38px;
    margin-right: 6px;
    border-radius: 50%;
    background: var(--bg);
    color: var(--text-muted);
    font-weight: 700;
  }
  .day.on {
    background: var(--header);
    color: #fff;
  }
  .btns {
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-gap: 10px;
  }
  .primary,
  .ghost {
    padding: 12px;
    border-radius: 10px;
    font-size: 15px;
    font-weight: 700;
  }
  .primary {
    background: var(--header);
    color: #fff;
  }
  .ghost {
    background: var(--bg);
    color: var(--text);
  }
  .primary:disabled,
  .ghost:disabled {
    opacity: 0.6;
  }
  blockquote {
    margin: 10px 0 0;
    padding: 10px 12px;
    border-left: 4px solid var(--header);
    background: var(--bg);
    border-radius: 6px;
    font-size: 14px;
    line-height: 1.5;
  }
  .how {
    margin: 10px 0 0 18px;
    font-size: 14px;
    line-height: 1.55;
  }
  .how li {
    margin-bottom: 6px;
  }
  .ok {
    background: #dcfce7;
    color: #166534;
    border-radius: 8px;
    padding: 8px 12px;
    margin-bottom: 8px;
    font-size: 14px;
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

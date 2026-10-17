<script>
  // Settings panel, opened from the ⚙️ button. Edits the school-run
  // settings stored on the Mini, so every screen (tablet and iPad) follows.
  import { api } from '../api.js';
  import {
    CELEBRATIONS,
    TIMER_ALARMS,
    play,
    unlock,
    kidSound,
    timerSound,
    soundsOn
  } from '../sounds.js';

  let { settings = {}, onclose, onsaved } = $props();

  const DAYS = [
    { n: '1', label: 'Mon' },
    { n: '2', label: 'Tue' },
    { n: '3', label: 'Wed' },
    { n: '4', label: 'Thu' },
    { n: '5', label: 'Fri' },
    { n: '6', label: 'Sat' },
    { n: '7', label: 'Sun' }
  ];

  // The form starts from the values saved when the panel opened; later
  // background refreshes must not overwrite what's being typed.
  // svelte-ignore state_referenced_locally
  let leave = $state(settings.morning_leave || '08:30');
  // svelte-ignore state_referenced_locally
  let start = $state(settings.morning_start || '07:00');
  // svelte-ignore state_referenced_locally
  let days = $state(settings.school_days || '12345');
  // Plain copy, so the 20-second settings refresh can't reset choices.
  // svelte-ignore state_referenced_locally
  const opened = { ...settings };
  let soundOn = $state(soundsOn(opened));
  // svelte-ignore state_referenced_locally
  let timerSnd = $state(timerSound(opened));
  // svelte-ignore state_referenced_locally
  let remindAt = $state(opened.reminder_time || '18:00');
  // svelte-ignore state_referenced_locally
  let remindOn = $state(opened.reminder_enabled !== '0');
  let reminders = $state([]);
  let rLabel = $state('');
  let rEmoji = $state('');
  let rDay = $state(1);
  let rRepeat = $state('1'); // '1' = every week, else the first date (every other week)
  let rError = $state('');
  let kids = $state([]);
  let kidSnds = $state({}); // slug -> celebration id
  let busy = $state(false);
  let error = $state('');

  $effect(() => {
    api
      .get('/kids')
      .then((k) => {
        const picks = {};
        k.forEach((kid) => (picks[kid.slug] = kidSound(opened, kid.slug)));
        kidSnds = picks;
        kids = k;
      })
      .catch(() => {
        /* sound choices just won't show */
      });
  });

  const WEEKDAYS = [
    { n: 1, label: 'Monday' },
    { n: 2, label: 'Tuesday' },
    { n: 3, label: 'Wednesday' },
    { n: 4, label: 'Thursday' },
    { n: 5, label: 'Friday' },
    { n: 6, label: 'Saturday' },
    { n: 7, label: 'Sunday' }
  ];

  function loadReminders() {
    api
      .get('/reminders')
      .then((r) => (reminders = r))
      .catch(() => {});
  }

  $effect(() => {
    loadReminders();
  });

  // The next two dates on the chosen weekday, as YYYY-MM-DD, so "every
  // other week" is just a choice of which one comes first.
  function nextTwo(wd) {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    while (((d.getDay() + 6) % 7) + 1 !== wd) d.setDate(d.getDate() + 1);
    const out = [];
    for (let i = 0; i < 2; i++) {
      out.push(
        d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
      );
      d.setDate(d.getDate() + 7);
    }
    return out;
  }

  function niceDate(ds) {
    if (!ds) return '';
    return new Date(ds + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  }

  function repeatText(r) {
    return r.every_weeks === 2 ? 'every other ' + r.day_name : 'every ' + r.day_name;
  }

  async function addReminder() {
    rError = '';
    if (!rLabel.trim()) return (rError = 'Say what to remember, e.g. PE kit');
    try {
      await api.post('/reminders', {
        label: rLabel.trim(),
        emoji: rEmoji.trim(),
        weekday: Number(rDay),
        every_weeks: rRepeat === '1' ? 1 : 2,
        anchor: rRepeat === '1' ? null : rRepeat
      });
      rLabel = '';
      rEmoji = '';
      rRepeat = '1';
      loadReminders();
    } catch (e) {
      rError = e.message;
    }
  }

  async function removeReminder(r) {
    if (!confirm('Stop reminding about "' + r.label + '"?')) return;
    try {
      await api.del('/reminders/' + r.id);
      loadReminders();
    } catch (e) {
      rError = e.message;
    }
  }

  function test(id) {
    unlock();
    play(id);
  }

  function toggleDay(n) {
    days = days.indexOf(n) === -1
      ? (days + n).split('').sort().join('')
      : days.replace(n, '');
  }

  async function save() {
    if (busy) return;
    error = '';
    if (!leave || !start) {
      error = 'Pick both times';
      return;
    }
    if (start >= leave) {
      error = 'The countdown has to start before the leave time';
      return;
    }
    busy = true;
    try {
      const saved = await api.put('/settings', {
        morning_leave: leave,
        morning_start: start,
        school_days: days,
        sounds_on: soundOn ? '1' : '0',
        reminder_enabled: remindOn ? '1' : '0',
        reminder_time: remindAt,
        sound_timer: timerSnd,
        ...Object.fromEntries(Object.keys(kidSnds).map((slug) => ['sound_' + slug, kidSnds[slug]]))
      });
      onsaved(saved);
      onclose();
    } catch (e) {
      error = e.message;
    } finally {
      busy = false;
    }
  }
</script>

<div
  class="overlay"
  onclick={onclose}
  onkeydown={(e) => e.key === 'Escape' && onclose()}
  role="presentation"
>
  <div
    class="modal card"
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => e.stopPropagation()}
    role="dialog"
    tabindex="-1"
  >
    <div class="head">
      <div class="title">⚙️ Settings</div>
      <button class="close" onclick={onclose}>✕</button>
    </div>

    <div class="section">🎒 School run</div>

    <label class="fld">
      <span>Leave for school at</span>
      <input type="time" bind:value={leave} />
    </label>

    <label class="fld">
      <span>Start the countdown at</span>
      <input type="time" bind:value={start} />
    </label>

    <div class="fld">
      <span>School days</span>
      <div class="days">
        {#each DAYS as d (d.n)}
          <button class="day" class:on={days.indexOf(d.n) !== -1} onclick={() => toggleDay(d.n)}>
            {d.label}
          </button>
        {/each}
      </div>
    </div>

    <div class="section">🔔 Reminders</div>
    <p class="note">
      Shown on the Next-up strip from midday the day before, said by Alexa the evening before
      and again in the morning briefing.
    </p>

    {#each reminders as r (r.id)}
      <div class="rem">
        <span class="rem-emoji">{r.emoji}</span>
        <span class="rem-body">
          <span class="rem-label">{r.label}</span>
          <span class="rem-meta">{repeatText(r)} · next {niceDate(r.next)}</span>
        </span>
        <button class="rem-del" onclick={() => removeReminder(r)} aria-label="Remove">🗑</button>
      </div>
    {/each}

    <div class="rem-add">
      <input class="rem-e" placeholder="🔔" maxlength="4" bind:value={rEmoji} />
      <input class="rem-l" placeholder="e.g. PE kit" maxlength="60" bind:value={rLabel} />
    </div>
    <div class="rem-add2">
      <select bind:value={rDay} onchange={() => (rRepeat = '1')}>
        {#each WEEKDAYS as d (d.n)}<option value={d.n}>{d.label}</option>{/each}
      </select>
      <select bind:value={rRepeat}>
        <option value="1">Every week</option>
        {#each nextTwo(Number(rDay)) as ds (ds)}
          <option value={ds}>Every other week, from {niceDate(ds)}</option>
        {/each}
      </select>
      <button class="test" onclick={addReminder}>＋ Add</button>
    </div>
    {#if rError}<div class="error">{rError}</div>{/if}

    <label class="toggle">
      <input type="checkbox" bind:checked={remindOn} />
      <span>Alexa says them the evening before</span>
    </label>
    {#if remindOn}
      <label class="fld">
        <span>Evening reminder at</span>
        <input type="time" bind:value={remindAt} />
      </label>
    {/if}

    <div class="section">🔊 Sounds</div>

    <label class="toggle">
      <input type="checkbox" bind:checked={soundOn} />
      <span>Play sounds on this dashboard</span>
    </label>

    <div class="fld">
      <span>Timer finished</span>
      <div class="snd">
        <select bind:value={timerSnd}>
          {#each TIMER_ALARMS as a (a.id)}<option value={a.id}>{a.label}</option>{/each}
        </select>
        <button class="test" onclick={() => test(timerSnd)}>▶ Test</button>
      </div>
    </div>

    {#each kids as kid (kid.slug)}
      <div class="fld">
        <span>{kid.name} finishes their jobs</span>
        <div class="snd">
          <select bind:value={kidSnds[kid.slug]}>
            {#each CELEBRATIONS as c (c.id)}<option value={c.id}>{c.label}</option>{/each}
          </select>
          <button class="test" onclick={() => test(kidSnds[kid.slug])}>▶ Test</button>
        </div>
      </div>
    {/each}

    <div class="try">
      <div class="try-title">Try them all</div>
      <div class="try-grid">
        {#each CELEBRATIONS.concat(TIMER_ALARMS) as c (c.id)}
          <button class="try-btn" onclick={() => test(c.id)}>{c.label}</button>
        {/each}
      </div>
    </div>

    {#if error}<div class="error">{error}</div>{/if}

    <button class="primary" disabled={busy} onclick={save}>{busy ? 'Saving…' : 'Save'}</button>
    <p class="hint">Saved on the house server, so every screen uses the same settings.</p>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    background: rgba(15, 23, 42, 0.55);
    z-index: 60;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
  }
  .modal {
    width: 100%;
    max-width: 440px;
    max-height: 90vh;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    padding: 18px;
  }
  .head {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    margin-bottom: 8px;
  }
  .title {
    font-size: 19px;
    font-weight: 700;
  }
  .close {
    font-size: 18px;
    color: var(--text-muted);
    padding: 4px 8px;
  }
  .section {
    font-size: 14px;
    font-weight: 700;
    color: var(--text-muted);
    margin: 6px 0 10px;
  }
  .fld {
    display: block;
    margin-bottom: 14px;
  }
  .fld > span {
    display: block;
    font-size: 14px;
    font-weight: 600;
    margin-bottom: 5px;
  }
  .fld input {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: 10px;
    font-family: inherit;
    font-size: 18px;
    background: #fff;
    -webkit-appearance: none;
  }
  .days {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    grid-gap: 6px;
  }
  .day {
    padding: 10px 0;
    border-radius: 10px;
    background: var(--bg);
    border: 1px solid var(--border);
    font-size: 13px;
    font-weight: 600;
    color: var(--text-muted);
  }
  .day.on {
    background: var(--header);
    border-color: var(--header);
    color: #fff;
  }
  .note {
    font-size: 12px;
    color: var(--text-muted);
    margin: -4px 0 10px;
  }
  .rem {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    grid-gap: 10px;
    align-items: center;
    background: var(--bg);
    border-radius: 10px;
    padding: 8px 10px;
    margin-bottom: 6px;
  }
  .rem-emoji {
    font-size: 22px;
  }
  .rem-label {
    display: block;
    font-weight: 600;
  }
  .rem-meta {
    display: block;
    font-size: 12px;
    color: var(--text-muted);
  }
  .rem-del {
    font-size: 16px;
    padding: 4px 6px;
  }
  .rem-add,
  .rem-add2 {
    display: grid;
    grid-gap: 8px;
    margin-top: 8px;
  }
  .rem-add {
    grid-template-columns: 56px minmax(0, 1fr);
  }
  .rem-add2 {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.6fr) auto;
    margin-bottom: 12px;
  }
  .rem-add input,
  .rem-add2 select {
    width: 100%;
    padding: 10px;
    border: 1px solid var(--border);
    border-radius: 10px;
    font-family: inherit;
    font-size: 15px;
    background: #fff;
  }
  .rem-e {
    text-align: center;
  }
  .toggle {
    display: grid;
    grid-template-columns: auto 1fr;
    grid-gap: 10px;
    align-items: center;
    font-size: 14px;
    font-weight: 600;
    margin-bottom: 14px;
  }
  .toggle input {
    width: 22px;
    height: 22px;
  }
  .snd {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-gap: 8px;
  }
  .snd select {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: 10px;
    font-family: inherit;
    font-size: 16px;
    background: #fff;
  }
  .test {
    padding: 0 14px;
    border-radius: 10px;
    background: var(--bg);
    border: 1px solid var(--border);
    font-size: 14px;
    font-weight: 600;
  }
  .try {
    margin-bottom: 14px;
  }
  .try-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-muted);
    margin-bottom: 6px;
  }
  .try-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-gap: 6px;
  }
  .try-btn {
    padding: 9px 6px;
    border-radius: 10px;
    background: var(--bg);
    border: 1px solid var(--border);
    font-size: 13px;
    text-align: left;
  }
  .error {
    background: #fee2e2;
    color: #b91c1c;
    border-radius: 8px;
    padding: 8px 12px;
    margin-bottom: 8px;
    font-size: 13px;
  }
  .primary {
    display: block;
    width: 100%;
    background: var(--header);
    color: #fff;
    padding: 13px;
    border-radius: 10px;
    font-size: 16px;
    font-weight: 600;
  }
  .primary:disabled {
    opacity: 0.6;
  }
  .hint {
    margin-top: 10px;
    font-size: 12px;
    color: var(--text-muted);
    text-align: center;
  }
</style>

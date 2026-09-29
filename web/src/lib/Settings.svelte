<script>
  // Settings panel, opened from the ⚙️ button. Edits the school-run
  // settings stored on the Mini, so every screen (tablet and iPad) follows.
  import { api } from '../api.js';

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
  let busy = $state(false);
  let error = $state('');

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
        school_days: days
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

    {#if error}<div class="error">{error}</div>{/if}

    <button class="primary" disabled={busy} onclick={save}>{busy ? 'Saving…' : 'Save'}</button>
    <p class="hint">Saved on the house server, so every screen uses the same times.</p>
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

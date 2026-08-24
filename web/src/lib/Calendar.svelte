<script>
  import { api } from '../api.js';

  let events = $state([]);
  let calendars = $state([]);
  let birthdays = $state([]);
  let cursor = $state(new Date());
  let selected = $state(null); // day cell tapped
  let showForm = $state(false); // add-event modal
  let invitesEnabled = $state(false);
  let form = $state(blankForm());
  let busy = $state(false);
  let error = $state('');

  const REPEATS = [
    { value: '', label: 'Does not repeat' },
    { value: 'daily', label: 'Daily' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'fortnightly', label: 'Every 2 weeks' },
    { value: 'monthly', label: 'Monthly' },
    { value: 'yearly', label: 'Yearly' }
  ];

  function blankForm(date) {
    return {
      title: '',
      calendar: 'family',
      date: date || ymd(new Date()),
      time: '10:00',
      location: '',
      emails: '',
      repeat: '',
      until: ''
    };
  }

  function openForm(date) {
    form = blankForm(date);
    selected = null;
    showForm = true;
  }

  const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  async function load() {
    try {
      const [evs, cals, bds, inv] = await Promise.all([
        api.get('/events'),
        api.get('/calendars'),
        api.get('/birthdays'),
        api.get('/invites/status')
      ]);
      events = evs;
      calendars = cals;
      birthdays = bds;
      invitesEnabled = inv.enabled;
    } catch (e) {
      error = e.message;
    }
  }

  $effect(() => {
    load();
    const iv = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(iv);
  });

  function ymd(d) {
    return (
      d.getFullYear() +
      '-' +
      String(d.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(d.getDate()).padStart(2, '0')
    );
  }

  let grid = $derived.by(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const startOffset = (first.getDay() + 6) % 7; // Monday-first
    const cells = [];
    const todayStr = ymd(new Date());
    for (let i = 0; i < 42; i++) {
      const d = new Date(cursor.getFullYear(), cursor.getMonth(), 1 - startOffset + i);
      const key = ymd(d);
      const dayEvents = events.filter((e) => {
        const s = ymd(new Date(e.starts_at));
        const en = ymd(new Date(e.ends_at));
        return key >= s && key <= en;
      });
      const bds = birthdays.filter(
        (b) => b.month === d.getMonth() + 1 && b.day === d.getDate()
      );
      cells.push({
        date: d,
        key,
        inMonth: d.getMonth() === cursor.getMonth(),
        isToday: key === todayStr,
        events: dayEvents,
        birthdays: bds
      });
    }
    return cells;
  });

  let monthLabel = $derived(
    cursor.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  );

  function move(delta) {
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1);
  }

  function openDay(cell) {
    selected = cell;
    showForm = false;
  }

  async function createEvent() {
    if (!form.title.trim() || busy) return;
    busy = true;
    error = '';
    try {
      const starts = form.date + 'T' + form.time + ':00';
      // "fortnightly" is weekly with interval 2 under the hood
      const freq = form.repeat === 'fortnightly' ? 'weekly' : form.repeat || null;
      const created = await api.post('/events', {
        title: form.title.trim(),
        calendar: form.calendar,
        location: form.location.trim() || null,
        starts_at: new Date(starts).toISOString(),
        ends_at: new Date(new Date(starts).getTime() + 3600000).toISOString(),
        recur_freq: freq,
        recur_interval: form.repeat === 'fortnightly' ? 2 : 1,
        recur_until: form.repeat && form.until ? form.until : null
      });
      const emails = form.emails.split(/[,;\s]+/).filter(Boolean);
      if (emails.length && invitesEnabled) {
        await api.post('/events/' + created.id + '/invite', { emails });
      }
      showForm = false;
      await load();
    } catch (e) {
      error = e.message;
    } finally {
      busy = false;
    }
  }

  async function removeEvent(ev) {
    const label = ev.recur_freq
      ? 'Delete "' + ev.title + '" and all its repeats?'
      : 'Delete "' + ev.title + '"?';
    if (!confirm(label)) return;
    try {
      await api.del('/events/' + ev.id);
      selected = null;
      await load();
    } catch (e) {
      error = e.message;
    }
  }
</script>

<div class="card cal">
  <div class="cal-head">
    <button class="nav" onclick={() => move(-1)}>‹</button>
    <div class="month">{monthLabel}</div>
    <button class="nav" onclick={() => move(1)}>›</button>
    <button class="add" onclick={() => openForm()}>＋ Add event</button>
  </div>

  {#if error}<div class="error">{error}</div>{/if}

  <div class="daynames">
    {#each DAY_NAMES as d (d)}<div class="dayname">{d}</div>{/each}
  </div>

  <div class="grid">
    {#each grid as cell (cell.key)}
      <button
        class="cell"
        class:dim={!cell.inMonth}
        class:today={cell.isToday}
        onclick={() => openDay(cell)}
      >
        <div class="daynum">{cell.date.getDate()}</div>
        {#each cell.birthdays.slice(0, 1) as b (b.id)}
          <div class="pill bday">🎂 {b.name}</div>
        {/each}
        {#each cell.events.slice(0, 3) as ev (ev.id + cell.key)}
          <div class="pill" style="background:{ev.colour}">{ev.recur_freq ? '↻ ' : ''}{ev.title}</div>
        {/each}
        {#if cell.events.length > 3}
          <div class="more">+{cell.events.length - 3} more</div>
        {/if}
      </button>
    {/each}
  </div>
</div>

{#if selected}
  <div
    class="overlay"
    onclick={() => (selected = null)}
    onkeydown={(e) => e.key === 'Escape' && (selected = null)}
    role="presentation"
  >
    <div
      class="modal card"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
      role="dialog"
      tabindex="-1"
    >
      <div class="modal-head">
        <div class="modal-title">
          {selected.date.toLocaleDateString('en-GB', {
            weekday: 'long',
            day: 'numeric',
            month: 'long'
          })}
        </div>
        <button class="close" onclick={() => (selected = null)}>✕</button>
      </div>

      {#each selected.birthdays as b (b.id)}
        <div class="ev">
          <div class="ev-dot" style="background:var(--bday)"></div>
          <div class="ev-body">
            <div class="ev-title">🎂 {b.name}'s birthday</div>
            {#if b.birth_year}
              <div class="ev-meta">turning {selected.date.getFullYear() - b.birth_year}</div>
            {/if}
          </div>
        </div>
      {/each}

      {#each selected.events as ev (ev.id)}
        <div class="ev">
          <div class="ev-dot" style="background:{ev.colour}"></div>
          <div class="ev-body">
            <div class="ev-title">{ev.title}</div>
            <div class="ev-meta">
              {ev.all_day
                ? 'All day'
                : new Date(ev.starts_at).toLocaleTimeString('en-GB', {
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
              {ev.location ? ' · ' + ev.location : ''} · {ev.calendar_label}
            </div>
          </div>
          <button class="del" onclick={() => removeEvent(ev)}>🗑</button>
        </div>
      {/each}

      {#if !selected.events.length && !selected.birthdays.length}
        <div class="empty">Nothing on this day</div>
      {/if}

      <button class="primary" onclick={() => openForm(selected.key)}>＋ Add event this day</button>
    </div>
  </div>
{/if}

{#if showForm}
  <div
    class="overlay"
    onclick={() => (showForm = false)}
    onkeydown={(e) => e.key === 'Escape' && (showForm = false)}
    role="presentation"
  >
    <div
      class="modal card"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
      role="dialog"
      tabindex="-1"
    >
      <div class="modal-head">
        <div class="modal-title">New event</div>
        <button class="close" onclick={() => (showForm = false)}>✕</button>
      </div>

      <div class="form">
        <input placeholder="What's happening?" bind:value={form.title} />
        <div class="row">
          <input type="date" bind:value={form.date} />
          <input type="time" bind:value={form.time} />
        </div>
        <div class="row">
          <select bind:value={form.calendar}>
            {#each calendars as c (c.slug)}
              <option value={c.slug}>{c.label}</option>
            {/each}
          </select>
          <select bind:value={form.repeat}>
            {#each REPEATS as r (r.value)}
              <option value={r.value}>{r.label}</option>
            {/each}
          </select>
        </div>
        {#if form.repeat}
          <label class="until">
            <span>Repeats until (optional)</span>
            <input type="date" bind:value={form.until} min={form.date} />
          </label>
        {/if}
        <input placeholder="Location (optional)" bind:value={form.location} />
        {#if invitesEnabled}
          <input placeholder="Invite emails, comma separated (optional)" bind:value={form.emails} />
        {/if}
        <button class="primary" disabled={busy || !form.title.trim()} onclick={createEvent}>
          {busy ? 'Saving…' : 'Add event'}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .cal {
    padding: 14px;
    height: 100%;
    display: flex;
    flex-direction: column;
  }
  .cal-head {
    display: grid;
    grid-template-columns: auto 1fr auto auto;
    align-items: center;
    margin-bottom: 10px;
  }
  .add {
    background: var(--header);
    color: #fff;
    font-size: 14px;
    font-weight: 600;
    padding: 10px 16px;
    border-radius: 999px;
    margin-left: 10px;
  }
  .until {
    display: block;
    margin-top: 8px;
    font-size: 13px;
    color: var(--text-muted);
  }
  .until input {
    margin-top: 4px;
  }
  .month {
    text-align: center;
    font-size: 20px;
    font-weight: 600;
  }
  .nav {
    font-size: 26px;
    padding: 4px 16px;
    color: var(--text-muted);
  }
  .daynames,
  .grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    grid-gap: 4px;
  }
  .grid {
    /* Six week rows dividing whatever height is left. minmax(0,1fr) lets
       them shrink below content height instead of overflowing the screen. */
    grid-template-rows: repeat(6, minmax(0, 1fr));
    flex: 1 1 auto;
    min-height: 0;
  }
  .dayname {
    text-align: center;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-muted);
    padding: 4px 0;
  }
  .cell {
    min-height: 0;
    background: var(--bg);
    border-radius: 8px;
    padding: 4px;
    text-align: left;
    vertical-align: top;
    overflow: hidden;
    border: 2px solid transparent;
  }
  .cell.dim {
    opacity: 0.45;
  }
  .cell.today {
    border-color: var(--today-ring);
  }
  .daynum {
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 2px;
  }
  /* Landscape / short viewports — trim the grid so all six rows fit. */
  @media (max-height: 850px) {
    .card {
      padding: 10px;
    }
    .cal-head {
      margin-bottom: 6px;
    }
    .month {
      font-size: 18px;
    }
    .nav {
      font-size: 22px;
      padding: 2px 12px;
    }
    .add {
      padding: 8px 14px;
      font-size: 13px;
    }
    .dayname {
      padding: 2px 0;
      font-size: 11px;
    }
    .cell {
      min-height: 0;
    }
  }

  .pill {
    font-size: 10px;
    color: #fff;
    border-radius: 4px;
    padding: 1px 4px;
    margin-bottom: 2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .pill.bday {
    background: var(--bday);
  }
  .more {
    font-size: 10px;
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

  .overlay {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    background: rgba(15, 23, 42, 0.55);
    z-index: 50;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
  }
  .modal {
    width: 100%;
    max-width: 460px;
    max-height: 80vh;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    padding: 16px;
  }
  .modal-head {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    margin-bottom: 12px;
  }
  .modal-title {
    font-size: 17px;
    font-weight: 600;
  }
  .close {
    font-size: 18px;
    color: var(--text-muted);
    padding: 4px 8px;
  }
  .ev {
    display: grid;
    grid-template-columns: auto 1fr auto;
    grid-gap: 10px;
    align-items: center;
    padding: 8px 0;
    border-bottom: 1px solid var(--border);
  }
  .ev-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
  }
  .ev-title {
    font-weight: 500;
  }
  .ev-meta {
    font-size: 12px;
    color: var(--text-muted);
  }
  .del {
    font-size: 16px;
    padding: 6px;
  }
  .empty {
    color: var(--text-muted);
    text-align: center;
    padding: 16px 0;
  }
  .form input,
  .form select {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
    font-family: inherit;
    font-size: 15px;
    margin-top: 8px;
    background: #fff;
    -webkit-appearance: none;
  }
  .form .row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-gap: 8px;
  }
  .form .row select,
  .form .row input {
    margin-top: 8px;
  }
  .primary {
    display: block;
    width: 100%;
    margin-top: 12px;
    background: var(--header);
    color: #fff;
    padding: 12px;
    border-radius: 8px;
    font-size: 15px;
    font-weight: 600;
  }
  .primary:disabled {
    opacity: 0.6;
  }
</style>

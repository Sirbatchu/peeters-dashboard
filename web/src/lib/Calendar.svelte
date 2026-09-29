<script>
  import { api } from '../api.js';

  // full: calendar takes the whole screen (App hides the header and tabs)
  let { full = $bindable(false) } = $props();

  const VIEWS = [
    { id: 'week', label: 'Week' },
    { id: 'month', label: 'Month' },
    { id: 'year', label: 'Year' }
  ];
  let view = $state(savedView());
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

  /**
   * Readable text on any calendar colour. Waverly's pink and Jamie-Lee's
   * baby blue are far too light for the white text the darker colours use,
   * and hard-coding per person would break the moment a colour changes.
   */
  function textOn(hex) {
    var h = String(hex || '').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    if (h.length !== 6) return '#ffffff';
    var r = parseInt(h.slice(0, 2), 16);
    var g = parseInt(h.slice(2, 4), 16);
    var b = parseInt(h.slice(4, 6), 16);
    // Perceived brightness (ITU-R BT.601)
    return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#1e293b' : '#ffffff';
  }

  function blankForm(date) {
    var d = date || ymd(new Date());
    return {
      title: '',
      calendar: 'family',
      date: d,
      time: '10:00',
      endDate: d,
      endTime: '11:00',
      allDay: false,
      location: '',
      emails: '',
      repeat: '',
      until: ''
    };
  }

  // null while creating; the event being changed while editing.
  let editing = $state(null);

  function openForm(date) {
    editing = null;
    form = blankForm(date);
    selected = null;
    showForm = true;
  }

  /** Open the form pre-filled from an existing event. */
  function openEdit(ev) {
    // For a repeat, load the series' own dates, not this occurrence's.
    var s = new Date(ev.series_starts_at || ev.starts_at);
    var e = new Date(ev.series_ends_at || ev.ends_at);
    var hhmm = function (d) {
      return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    };
    editing = ev;
    form = {
      title: ev.title,
      calendar: ev.calendar,
      date: ymd(s),
      time: hhmm(s),
      endDate: ymd(e),
      endTime: hhmm(e),
      allDay: !!ev.all_day,
      location: ev.location || '',
      emails: '',
      repeat:
        ev.recur_freq === 'weekly' && ev.recur_interval === 2
          ? 'fortnightly'
          : ev.recur_freq || '',
      until: ev.recur_until || ''
    };
    selected = null;
    showForm = true;
  }

  const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  // Remembered per device so the wall tablet comes back on its chosen view.
  function savedView() {
    try {
      var v = localStorage.getItem('calView');
      if (v === 'week' || v === 'month' || v === 'year') return v;
    } catch (e) {
      /* private mode etc. */
    }
    return 'month';
  }

  function setView(v) {
    // Jumping into week view from the current month lands on this week,
    // not the week of the 1st.
    var today = new Date();
    if (
      v === 'week' &&
      cursor.getFullYear() === today.getFullYear() &&
      cursor.getMonth() === today.getMonth()
    ) {
      cursor = today;
    }
    view = v;
    try {
      localStorage.setItem('calView', v);
    } catch (e) {
      /* ignore */
    }
  }

  function addDays(d, n) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  }

  function mondayOf(d) {
    return addDays(d, -((d.getDay() + 6) % 7));
  }

  // The date span the current view shows; events are fetched for exactly
  // this window, so any month or year can be browsed, not just ~1 year ahead.
  let range = $derived.by(() => {
    if (view === 'week') {
      var ws = mondayOf(cursor);
      return { start: ws, end: addDays(ws, 7) };
    }
    if (view === 'year') {
      return {
        start: new Date(cursor.getFullYear(), 0, 1),
        end: new Date(cursor.getFullYear() + 1, 0, 1)
      };
    }
    var ms = mondayOf(new Date(cursor.getFullYear(), cursor.getMonth(), 1));
    return { start: ms, end: addDays(ms, 42) };
  });

  var loadSeq = 0;

  async function load() {
    var seq = ++loadSeq;
    var r = range;
    try {
      const [evs, cals, bds, inv] = await Promise.all([
        api.get(
          '/events?start=' +
            encodeURIComponent(r.start.toISOString()) +
            '&end=' +
            encodeURIComponent(r.end.toISOString())
        ),
        api.get('/calendars'),
        api.get('/birthdays'),
        api.get('/invites/status')
      ]);
      if (seq !== loadSeq) return; // a newer range was requested meanwhile
      error = '';
      events = evs;
      calendars = cals;
      birthdays = bds;
      invitesEnabled = inv.enabled;
    } catch (e) {
      error = e.message;
    }
  }

  $effect(() => {
    range; // re-fetch whenever the visible window moves
    load();
    const iv = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(iv);
  });

  // Re-fit whenever the viewport changes or the rendered cells change.
  $effect(() => {
    grid; // re-run when the view, period or events change
    full;
    var raf = requestAnimationFrame(fitGrid);
    var onResize = function () { setTimeout(fitGrid, 120); };
    // Slow re-fit catches layout shifts we do not get an event for,
    // e.g. the bedtime chip appearing at 19:00.
    var poll = setInterval(fitGrid, 15000);
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return function () {
      cancelAnimationFrame(raf);
      clearInterval(poll);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
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

  // Day key -> events on that day, built once per fetch. A year view has
  // 500+ cells, so filtering the whole event list per cell is too slow on
  // the old iPad.
  let byDay = $derived.by(() => {
    var map = {};
    events.forEach(function (e) {
      var d = new Date(e.starts_at);
      d = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      var last = ymd(new Date(e.ends_at));
      for (var i = 0; i < 400; i++) {
        var k = ymd(d);
        if (k > last) break;
        (map[k] = map[k] || []).push(e);
        d = addDays(d, 1);
      }
    });
    return map;
  });

  function dayCell(d, month, todayStr) {
    var key = ymd(d);
    return {
      date: d,
      key: key,
      inMonth: month == null || d.getMonth() === month,
      isToday: key === todayStr,
      events: byDay[key] || [],
      birthdays: birthdays.filter(function (b) {
        return b.month === d.getMonth() + 1 && b.day === d.getDate();
      })
    };
  }

  function monthCells(year, month, todayStr) {
    var start = mondayOf(new Date(year, month, 1));
    var cells = [];
    for (var i = 0; i < 42; i++) cells.push(dayCell(addDays(start, i), month, todayStr));
    return cells;
  }

  // month: 42 day cells; week: 7; year: 12 mini-months of 42 cells each.
  let grid = $derived.by(() => {
    var todayStr = ymd(new Date());
    if (view === 'week') {
      var ws = mondayOf(cursor);
      var days = [];
      for (var i = 0; i < 7; i++) days.push(dayCell(addDays(ws, i), null, todayStr));
      return days;
    }
    if (view === 'year') {
      var months = [];
      for (var m = 0; m < 12; m++) {
        months.push({
          month: m,
          label: new Date(cursor.getFullYear(), m, 1).toLocaleDateString('en-GB', { month: 'long' }),
          cells: monthCells(cursor.getFullYear(), m, todayStr)
        });
      }
      return months;
    }
    return monthCells(cursor.getFullYear(), cursor.getMonth(), todayStr);
  });

  let periodLabel = $derived.by(() => {
    if (view === 'year') return String(cursor.getFullYear());
    if (view === 'week') {
      var ws = mondayOf(cursor);
      var we = addDays(ws, 6);
      var a = ws.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      var b = we.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
      return a + ' – ' + b;
    }
    return cursor.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  });

  function move(delta) {
    if (view === 'week') cursor = addDays(cursor, 7 * delta);
    else if (view === 'year') cursor = new Date(cursor.getFullYear() + delta, cursor.getMonth(), 1);
    else cursor = new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1);
  }

  function goToday() {
    cursor = new Date();
  }

  function openMonth(m) {
    cursor = new Date(cursor.getFullYear(), m, 1);
    setView('month');
  }

  function timeOf(ev) {
    return new Date(ev.starts_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }

  /**
   * Size the six week rows from the space actually left below the grid.
   * Measuring getBoundingClientRect().top means we never have to model the
   * header/tabs/chip heights - which is what got this wrong on the iPad,
   * where the chrome renders taller than on desktop.
   */
  let gridEl = $state(null);
  let miniRow = $state(16); // day-row height inside the year view's mini-months

  function fitGrid() {
    if (!gridEl) return;
    var top = gridEl.getBoundingClientRect().top;
    var avail = window.innerHeight - top - 18; // 18px breathing room at the bottom
    // month: 6 week rows, 4px gaps; week: one tall row; year: 3 rows of months
    var rows = view === 'month' ? 6 : view === 'year' ? 3 : 1;
    var gap = view === 'year' ? 10 : 4;
    var h = Math.floor((avail - (rows - 1) * gap) / rows);
    var floor = view === 'year' ? 120 : 34; // never collapse to unreadable
    if (h < floor) h = floor;
    gridEl.style.gridAutoRows = h + 'px';
    if (view === 'year') {
      // month title (18) + day letters (13) + padding (12), then 6 rows
      var r = Math.floor((h - 43) / 6);
      miniRow = r < 12 ? 12 : r;
    }
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
      // All-day events span whole days; timed ones use the chosen times.
      const endDay = form.endDate || form.date;
      const starts = new Date(
        form.allDay ? form.date + 'T00:00:00' : form.date + 'T' + form.time + ':00'
      );
      const ends = new Date(
        form.allDay ? endDay + 'T23:59:59' : endDay + 'T' + (form.endTime || form.time) + ':00'
      );
      if (ends < starts) {
        error = 'The end must be after the start';
        busy = false;
        return;
      }
      // "fortnightly" is weekly with interval 2 under the hood
      const freq = form.repeat === 'fortnightly' ? 'weekly' : form.repeat || null;
      const payload = {
        title: form.title.trim(),
        calendar: form.calendar,
        location: form.location.trim() || null,
        all_day: form.allDay,
        starts_at: starts.toISOString(),
        ends_at: ends.toISOString(),
        recur_freq: freq,
        recur_interval: form.repeat === 'fortnightly' ? 2 : 1,
        recur_until: form.repeat && form.until ? form.until : null
      };

      const saved = editing
        ? await api.patch('/events/' + editing.id, payload)
        : await api.post('/events', payload);

      const emails = form.emails.split(/[,;\s]+/).filter(Boolean);
      if (emails.length && invitesEnabled) {
        await api.post('/events/' + saved.id + '/invite', { emails });
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
    <div class="month">{periodLabel}</div>
    <button class="nav" onclick={() => move(1)}>›</button>
    <div class="views">
      {#each VIEWS as v (v.id)}
        <button class="view" class:on={view === v.id} onclick={() => setView(v.id)}>{v.label}</button>
      {/each}
    </div>
    <button class="today-btn" onclick={goToday}>Today</button>
    {#if !full}
      <button class="full-btn" onclick={() => (full = true)} title="Full screen">⛶</button>
    {/if}
    <button class="add" onclick={() => openForm()}>＋ Add event</button>
  </div>

  {#if error}<div class="error">{error}</div>{/if}

  {#if view === 'year'}
    <div class="year" bind:this={gridEl}>
      {#each grid as mo (mo.month)}
        <div class="mini">
          <button class="mini-title" onclick={() => openMonth(mo.month)}>{mo.label}</button>
          <div class="mini-grid">
            {#each DAY_NAMES as d (d)}<div class="mini-dn">{d.charAt(0)}</div>{/each}
          </div>
          <div class="mini-grid" style="grid-auto-rows:{miniRow}px">
            {#each mo.cells as cell (cell.key)}
              {#if cell.inMonth}
                <button
                  class="mini-day"
                  class:today={cell.isToday}
                  class:busy={cell.events.length || cell.birthdays.length}
                  onclick={() => openDay(cell)}
                >
                  {cell.date.getDate()}
                  {#if cell.events.length || cell.birthdays.length}
                    <span class="dots">
                      {#if cell.birthdays.length}<span class="dot" style="background:var(--bday)"></span>{/if}
                      {#each cell.events.slice(0, 3) as ev (ev.id + cell.key)}
                        <span class="dot" style="background:{ev.colour}"></span>
                      {/each}
                    </span>
                  {/if}
                </button>
              {:else}
                <span></span>
              {/if}
            {/each}
          </div>
        </div>
      {/each}
    </div>
  {:else}
    <div class="daynames">
      {#each DAY_NAMES as d (d)}<div class="dayname">{d}</div>{/each}
    </div>

    {#if view === 'week'}
      <div class="grid" bind:this={gridEl}>
        {#each grid as cell (cell.key)}
          <button class="cell wk" class:today={cell.isToday} onclick={() => openDay(cell)}>
            <div class="cell-in">
            <div class="daynum">{cell.date.getDate()} {cell.date.toLocaleDateString('en-GB', { month: 'short' })}</div>
            {#each cell.birthdays as b (b.id)}
              <div class="pill bday">🎂 {b.name}</div>
            {/each}
            {#each cell.events as ev (ev.id + cell.key)}
              <div class="wk-ev" style="border-left-color:{ev.colour}">
                <div class="wk-time">{ev.all_day ? 'All day' : timeOf(ev)}</div>
                <div class="wk-title">{ev.recur_freq ? '↻ ' : ''}{ev.title}</div>
                {#if ev.location}<div class="wk-loc">{ev.location}</div>{/if}
              </div>
            {/each}
            </div>
          </button>
        {/each}
      </div>
    {:else}
      <div class="grid" bind:this={gridEl}>
        {#each grid as cell (cell.key)}
          <button
            class="cell"
            class:dim={!cell.inMonth}
            class:today={cell.isToday}
            onclick={() => openDay(cell)}
          >
            <div class="cell-in">
            <div class="daynum">{cell.date.getDate()}</div>
            {#each cell.birthdays.slice(0, 1) as b (b.id)}
              <div class="pill bday">🎂 {b.name}</div>
            {/each}
            {#each cell.events.slice(0, 3) as ev (ev.id + cell.key)}
              <div class="pill" style="background:{ev.colour};color:{textOn(ev.colour)}">{ev.recur_freq ? '↻ ' : ''}{ev.title}</div>
            {/each}
            {#if cell.events.length > 3}
              <div class="more">+{cell.events.length - 3} more</div>
            {/if}
            </div>
          </button>
        {/each}
      </div>
    {/if}
  {/if}
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
          <button class="edit" onclick={() => openEdit(ev)} title="Edit">✎</button>
          <button class="del" onclick={() => removeEvent(ev)} title="Delete">🗑</button>
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
        <div class="modal-title">{editing ? 'Edit event' : 'New event'}</div>
        <button class="close" onclick={() => (showForm = false)}>✕</button>
      </div>

      <div class="form">
        <input placeholder="What's happening?" bind:value={form.title} />
        <label class="fld">
          <span>Starts</span>
          <span class="pair">
            <input type="date" bind:value={form.date} />
            {#if !form.allDay}<input type="time" bind:value={form.time} />{/if}
          </span>
        </label>
        <label class="fld">
          <span>Ends</span>
          <span class="pair">
            <input type="date" bind:value={form.endDate} min={form.date} />
            {#if !form.allDay}<input type="time" bind:value={form.endTime} />{/if}
          </span>
        </label>
        <label class="allday">
          <input type="checkbox" bind:checked={form.allDay} />
          <span>All day / no set times</span>
        </label>
        <label class="fld">
          <span>Who's it for?</span>
          <span class="who">
            {#each calendars as c (c.slug)}
              <button
                type="button"
                class="chip"
                class:sel={form.calendar === c.slug}
                style={form.calendar === c.slug
                  ? 'background:' + c.colour + ';color:' + textOn(c.colour) + ';border-color:' + c.colour
                  : 'border-color:' + c.colour}
                onclick={() => (form.calendar = c.slug)}
              >
                <span class="dot" style="background:{c.colour}"></span>{c.label}
              </button>
            {/each}
          </span>
        </label>
        <div class="row">
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
          {busy ? 'Saving…' : editing ? 'Save changes' : 'Add event'}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .cal {
    padding: 14px;
  }
  .cal-head {
    display: grid;
    grid-template-columns: auto 1fr auto auto auto auto auto;
    align-items: center;
    margin-bottom: 10px;
  }
  .views {
    background: var(--bg);
    border-radius: 999px;
    padding: 3px;
    margin-left: 10px;
    white-space: nowrap;
  }
  .view {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-muted);
    padding: 7px 14px;
    border-radius: 999px;
  }
  .view.on {
    background: var(--header);
    color: #fff;
  }
  .today-btn,
  .full-btn {
    font-size: 13px;
    font-weight: 600;
    padding: 8px 12px;
    margin-left: 8px;
    border-radius: 999px;
    background: var(--bg);
    color: var(--text);
  }
  .full-btn {
    font-size: 16px;
    padding: 6px 12px;
  }

  /* Chrome vertically centres whatever is inside a <button>, and Safari 10
     cannot flex a button, so the cell content is pinned to the top-left
     with an absolutely positioned inner box instead. */
  .cell {
    position: relative;
  }
  .cell-in {
    position: absolute;
    top: 3px;
    right: 3px;
    bottom: 3px;
    left: 3px;
    overflow: hidden;
  }
  /* Week view: one tall column per day, events listed with times. */
  .cell.wk .cell-in {
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }
  .wk-ev {
    background: #fff;
    border-left: 4px solid;
    border-radius: 4px;
    padding: 3px 5px;
    margin-bottom: 4px;
  }
  .wk-time {
    font-size: 10px;
    font-weight: 600;
    color: var(--text-muted);
  }
  .wk-title {
    font-size: 12px;
    font-weight: 500;
    line-height: 1.25;
    word-wrap: break-word;
  }
  .wk-loc {
    font-size: 10px;
    color: var(--text-muted);
  }

  /* Year view: 4 x 3 mini-months. Row heights are set in JS (fitGrid). */
  .year {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    grid-gap: 10px;
    grid-auto-rows: 180px;
  }
  .mini {
    background: var(--bg);
    border-radius: 8px;
    padding: 6px;
    overflow: hidden;
  }
  .mini-title {
    display: block;
    width: 100%;
    height: 18px;
    font-size: 13px;
    font-weight: 600;
    text-align: left;
  }
  .mini-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
  }
  .mini-dn {
    height: 13px;
    font-size: 9px;
    font-weight: 600;
    text-align: center;
    color: var(--text-muted);
  }
  .mini-day {
    position: relative;
    font-size: 11px;
    text-align: center;
    border-radius: 4px;
    border: 1px solid transparent;
  }
  .mini-day.busy {
    font-weight: 700;
  }
  .mini-day.today {
    border-color: var(--today-ring);
  }
  .dots {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 1px;
    line-height: 0;
    text-align: center;
  }
  .dot {
    display: inline-block;
    width: 4px;
    height: 4px;
    margin: 0 1px;
    border-radius: 50%;
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
  .fld {
    display: block;
    margin-bottom: 8px;
    font-size: 13px;
    color: var(--text-muted);
  }
  .fld > span:first-child {
    display: block;
    margin-bottom: 3px;
    font-weight: 600;
  }
  .pair {
    display: grid;
    grid-template-columns: 1fr auto;
    grid-gap: 8px;
  }
  .allday {
    display: block;
    margin-bottom: 10px;
    font-size: 14px;
    color: var(--text);
  }
  .allday input {
    width: 20px;
    height: 20px;
    vertical-align: -4px;
    margin-right: 6px;
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
  /* Row height is set in JS by fitGrid() from the real measured space.
     Safari 10 mis-handles both fr rows and flex-shrink on grid children,
     so explicit px is the only reliable option on the iPad. */
  .grid {
    grid-auto-rows: 76px;
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
    .view {
      padding: 5px 11px;
      font-size: 12px;
    }
    .today-btn {
      padding: 6px 10px;
      font-size: 12px;
    }
    .full-btn {
      padding: 4px 10px;
    }
    .dayname {
      padding: 2px 0;
      font-size: 11px;
    }
    /* Fallback if JS sizing has not run yet. */
    .grid {
      grid-auto-rows: 56px;
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
  .del,
  .edit {
    font-size: 16px;
    padding: 6px 8px;
  }
  .edit {
    color: var(--text-muted);
  }

  /* Who's-it-for colour chips */
  .who {
    display: -webkit-box;
    display: flex;
    -webkit-box-orient: horizontal;
    -webkit-box-lines: multiple;
    flex-wrap: wrap;
    margin: -3px;
  }
  .chip {
    margin: 3px;
    padding: 8px 12px;
    border-radius: 999px;
    border: 2px solid var(--border);
    background: #fff;
    color: var(--text);
    font-size: 14px;
    font-weight: 600;
    font-family: inherit;
  }
  .chip .dot {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    margin-right: 6px;
    vertical-align: 0;
  }
  .chip.sel .dot {
    display: none;
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

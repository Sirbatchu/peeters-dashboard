<script>
  // Birthdays: feed the Next-up countdown, the calendar and the Alexa
  // briefing. Year is optional; with it we can say how old they'll be.
  import { api } from '../api.js';

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  let list = $state([]);
  let name = $state('');
  let day = $state('');
  let month = $state('');
  let year = $state('');
  let error = $state('');

  async function load() {
    try {
      list = await api.get('/birthdays');
    } catch (e) {
      error = e.message;
    }
  }

  $effect(() => {
    load();
  });

  // Soonest first, from today.
  let sorted = $derived.by(() => {
    var t = new Date();
    var today = Date.UTC(t.getFullYear(), t.getMonth(), t.getDate());
    return list
      .map(function (b) {
        var y = t.getFullYear();
        var next = Date.UTC(y, b.month - 1, b.day);
        if (next < today) next = Date.UTC(++y, b.month - 1, b.day);
        return Object.assign({}, b, {
          days: Math.round((next - today) / 864e5),
          turning: b.birth_year ? y - b.birth_year : null
        });
      })
      .sort(function (a, b) {
        return a.days - b.days;
      });
  });

  async function add() {
    error = '';
    var d = Number(day);
    var m = Number(month);
    var y = year ? Number(year) : null;
    if (!name.trim() || !d || !m) {
      error = 'Add a name and pick the day and month';
      return;
    }
    if (d < 1 || d > 31) {
      error = 'Day must be 1–31';
      return;
    }
    if (y && (y < 1900 || y > new Date().getFullYear())) {
      error = 'That year looks wrong';
      return;
    }
    try {
      await api.post('/birthdays', { name: name.trim(), day: d, month: m, birth_year: y });
      name = '';
      day = '';
      month = '';
      year = '';
      await load();
    } catch (e) {
      error = e.message;
    }
  }

  async function remove(b) {
    if (!confirm('Remove ' + b.name + "'s birthday?")) return;
    try {
      await api.del('/birthdays/' + b.id);
      await load();
    } catch (e) {
      error = e.message;
    }
  }

  function inDays(n) {
    if (n === 0) return 'Today! 🎉';
    if (n === 1) return 'Tomorrow';
    return 'in ' + n + ' days';
  }
</script>

<div class="card panel">
  <div class="panel-title">🎂 Birthdays</div>
  {#if error}<div class="error">{error}</div>{/if}

  <div class="add">
    <input class="b-name" placeholder="Name" bind:value={name} />
    <input class="b-day" type="number" min="1" max="31" placeholder="Day" bind:value={day} />
    <select class="b-month" bind:value={month}>
      <option value="">Month</option>
      {#each MONTHS as mo, i (mo)}<option value={String(i + 1)}>{mo}</option>{/each}
    </select>
    <input class="b-year" type="number" placeholder="Year (optional)" bind:value={year} />
    <button class="b-add" onclick={add}>Add</button>
  </div>

  {#if sorted.length}
    {#each sorted as b (b.id)}
      <div class="row" class:today={b.days === 0}>
        <span class="who">{b.name}</span>
        <span class="date">{b.day} {MONTHS[b.month - 1]}</span>
        <span class="when">{inDays(b.days)}{b.turning ? ' · turning ' + b.turning : ''}</span>
        <button class="x" title="Remove" onclick={() => remove(b)}>✕</button>
      </div>
    {/each}
  {:else}
    <p class="hint">
      Add the family's birthdays. They count down in the Next-up strip from a month out, show on
      the calendar, and Alexa mentions them in the morning briefing.
    </p>
  {/if}
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
  .add {
    display: grid;
    grid-template-columns: 2fr 70px 90px 1.2fr auto;
    grid-gap: 8px;
    margin-bottom: 10px;
  }
  @media (max-width: 640px) {
    .add {
      grid-template-columns: 1fr 1fr;
    }
    .b-name,
    .b-add {
      grid-column: span 2;
    }
  }
  .add input,
  .add select {
    width: 100%;
    padding: 10px;
    border: 1px solid var(--border);
    border-radius: 10px;
    font-family: inherit;
    font-size: 15px;
    background: #fff;
    color: var(--text);
    -webkit-appearance: none;
  }
  .b-add {
    background: var(--header);
    color: #fff;
    padding: 10px 18px;
    border-radius: 10px;
    font-weight: 700;
  }
  .row {
    display: grid;
    grid-template-columns: 1fr 80px 1.3fr auto;
    grid-gap: 8px;
    align-items: center;
    padding: 9px 4px;
    border-bottom: 1px solid var(--border);
    font-size: 15px;
  }
  .row.today {
    background: #fce7f3;
    border-radius: 8px;
  }
  .who {
    font-weight: 700;
  }
  .date {
    color: var(--text-muted);
  }
  .when {
    font-weight: 600;
  }
  .x {
    color: var(--text-muted);
    padding: 4px 8px;
  }
  .hint {
    font-size: 13px;
    color: var(--text-muted);
    line-height: 1.5;
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

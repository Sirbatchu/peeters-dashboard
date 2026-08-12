<script>
  import { api } from '../api.js';

  let items = $state([]);
  let meals = $state([]);
  let newItem = $state('');
  let error = $state('');
  let editingDay = $state(null);
  let mealTitle = $state('');

  async function load() {
    try {
      const [s, m] = await Promise.all([api.get('/shopping'), api.get('/meals')]);
      items = s;
      meals = m;
    } catch (e) {
      error = e.message;
    }
  }

  $effect(() => {
    load();
    const iv = setInterval(load, 60 * 1000);
    return () => clearInterval(iv);
  });

  async function add() {
    const label = newItem.trim();
    if (!label) return;
    newItem = '';
    try {
      await api.post('/shopping', { label });
      await load();
    } catch (e) {
      error = e.message;
    }
  }

  async function tick(item) {
    item.ticked_at = item.ticked_at ? null : 'now'; // optimistic
    try {
      await api.post('/shopping/' + item.id + '/tick');
      await load();
    } catch (e) {
      error = e.message;
      load();
    }
  }

  async function clearTicked() {
    try {
      await api.post('/shopping/clear-ticked');
      await load();
    } catch (e) {
      error = e.message;
    }
  }

  // Next 7 days for the meal planner strip
  let week = $derived.by(() => {
    const out = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(Date.now() + i * 864e5);
      const key =
        d.getFullYear() +
        '-' +
        String(d.getMonth() + 1).padStart(2, '0') +
        '-' +
        String(d.getDate()).padStart(2, '0');
      out.push({
        key,
        label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString('en-GB', { weekday: 'long' }),
        meal: meals.find((m) => m.day === key) || null
      });
    }
    return out;
  });

  function editMeal(day) {
    editingDay = day.key;
    mealTitle = day.meal ? day.meal.title : '';
  }

  async function saveMeal() {
    try {
      await api.put('/meals/' + editingDay, { title: mealTitle });
      editingDay = null;
      await load();
    } catch (e) {
      error = e.message;
    }
  }

  let ticked = $derived(items.filter((i) => i.ticked_at));
  let unticked = $derived(items.filter((i) => !i.ticked_at));
</script>

{#if error}<div class="error">{error}</div>{/if}

<div class="cols">
  <div class="card panel">
    <div class="panel-title">🛒 Shopping list</div>
    <div class="add-row">
      <input
        placeholder="Add something…"
        bind:value={newItem}
        onkeydown={(e) => e.key === 'Enter' && add()}
      />
      <button class="add-btn" onclick={add}>Add</button>
    </div>

    {#each unticked as item (item.id)}
      <button class="s-item" onclick={() => tick(item)}>
        <span class="box"></span>
        <span class="s-label">{item.label}</span>
      </button>
    {/each}

    {#if ticked.length}
      <div class="got-head">
        <span>In the trolley ({ticked.length})</span>
        <button class="clear" onclick={clearTicked}>Clear</button>
      </div>
      {#each ticked as item (item.id)}
        <button class="s-item done" onclick={() => tick(item)}>
          <span class="box">✓</span>
          <span class="s-label">{item.label}</span>
        </button>
      {/each}
    {/if}

    {#if !items.length}
      <div class="empty">List's empty — nice.</div>
    {/if}
  </div>

  <div class="card panel">
    <div class="panel-title">🍽️ What's for dinner</div>
    {#each week as day (day.key)}
      <div class="meal-row">
        <div class="meal-day">{day.label}</div>
        {#if editingDay === day.key}
          <input
            class="meal-input"
            placeholder="e.g. Spag bol"
            bind:value={mealTitle}
            onkeydown={(e) => e.key === 'Enter' && saveMeal()}
          />
          <button class="save" onclick={saveMeal}>✓</button>
        {:else}
          <button class="meal-value" class:unset={!day.meal} onclick={() => editMeal(day)}>
            {day.meal ? (day.meal.emoji || '🍽️') + ' ' + day.meal.title : 'tap to plan'}
          </button>
        {/if}
      </div>
    {/each}
  </div>
</div>

<style>
  .cols {
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-gap: 16px;
  }
  @media (max-width: 700px) {
    .cols {
      grid-template-columns: 1fr;
    }
  }
  .panel {
    padding: 16px;
  }
  .panel-title {
    font-size: 18px;
    font-weight: 700;
    margin-bottom: 12px;
  }
  .add-row {
    display: grid;
    grid-template-columns: 1fr auto;
    grid-gap: 8px;
    margin-bottom: 12px;
  }
  .add-row input {
    padding: 12px;
    border: 1px solid var(--border);
    border-radius: 10px;
    font-family: inherit;
    font-size: 16px;
    background: #fff;
    -webkit-appearance: none;
  }
  .add-btn {
    background: var(--header);
    color: #fff;
    padding: 12px 20px;
    border-radius: 10px;
    font-weight: 600;
  }
  .s-item {
    display: grid;
    grid-template-columns: auto 1fr;
    grid-gap: 10px;
    align-items: center;
    width: 100%;
    padding: 11px 8px;
    border-radius: 10px;
    font-size: 16px;
    text-align: left;
    color: var(--text);
  }
  .s-item .box {
    width: 26px;
    height: 26px;
    border-radius: 8px;
    border: 2px solid var(--border);
    background: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    color: #16a34a;
  }
  .s-item.done {
    opacity: 0.55;
  }
  .s-item.done .s-label {
    text-decoration: line-through;
  }
  .got-head {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    font-size: 13px;
    font-weight: 600;
    color: var(--text-muted);
    margin-top: 12px;
    padding-top: 10px;
    border-top: 1px solid var(--border);
  }
  .clear {
    color: #b91c1c;
    font-size: 13px;
    font-weight: 600;
  }
  .empty {
    color: var(--text-muted);
    text-align: center;
    padding: 20px 0;
  }
  .meal-row {
    display: grid;
    grid-template-columns: 110px 1fr auto;
    grid-gap: 8px;
    align-items: center;
    padding: 7px 0;
    border-bottom: 1px solid var(--border);
  }
  .meal-day {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-muted);
  }
  .meal-value {
    text-align: left;
    font-size: 16px;
    padding: 8px;
    border-radius: 8px;
    color: var(--text);
  }
  .meal-value.unset {
    color: var(--text-muted);
    font-style: italic;
    font-size: 14px;
  }
  .meal-input {
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: 8px;
    font-family: inherit;
    font-size: 15px;
    -webkit-appearance: none;
  }
  .save {
    background: #16a34a;
    color: #fff;
    border-radius: 8px;
    padding: 8px 14px;
    font-weight: 700;
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

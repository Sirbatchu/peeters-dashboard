<script>
  import { api } from '../api.js';

  let items = $state([]);
  let meals = $state([]);
  let recipes = $state([]);
  let newItem = $state('');
  let error = $state('');
  let flash = $state('');
  let editingDay = $state(null);
  let mealTitle = $state('');
  // Recipe editor: null = closed, otherwise the form (id absent = new).
  let rForm = $state(null);

  async function load() {
    try {
      const [s, m, r] = await Promise.all([
        api.get('/shopping'),
        api.get('/meals'),
        api.get('/recipes')
      ]);
      items = s;
      meals = m;
      recipes = r;
    } catch (e) {
      error = e.message;
    }
  }

  function say(msg) {
    flash = msg;
    setTimeout(function () {
      if (flash === msg) flash = '';
    }, 4000);
  }

  function shopMsg(r) {
    if (!r.meals) return 'No planned meals with a recipe yet — link a meal to a recipe first.';
    if (!r.added.length) return 'Everything is already on the list 👍';
    return (
      '🛒 Added ' +
      r.added.length +
      ' item' +
      (r.added.length === 1 ? '' : 's') +
      (r.skipped.length ? ' (' + r.skipped.length + ' already on the list)' : '')
    );
  }

  async function shopDay(day) {
    try {
      say(shopMsg(await api.post('/meals/shop', { day: day.key })));
      await load();
    } catch (e) {
      error = e.message;
    }
  }

  async function shopWeek() {
    try {
      say(shopMsg(await api.post('/meals/shop', { days: 7 })));
      await load();
    } catch (e) {
      error = e.message;
    }
  }

  function newRecipe() {
    rForm = { title: '', emoji: '🍽️', ingredients: '' };
  }

  function editRecipe(r) {
    rForm = { id: r.id, title: r.title, emoji: r.emoji, ingredients: (r.ingredients || []).join('\n') };
  }

  async function saveRecipe() {
    if (!rForm || !rForm.title.trim()) return;
    var body = {
      title: rForm.title.trim(),
      emoji: rForm.emoji || '🍽️',
      ingredients: rForm.ingredients.split(/\r?\n/)
    };
    try {
      if (rForm.id) await api.put('/recipes/' + rForm.id, body);
      else await api.post('/recipes', body);
      rForm = null;
      await load();
    } catch (e) {
      error = e.message;
    }
  }

  async function deleteRecipe() {
    if (!rForm || !rForm.id || !confirm('Delete the "' + rForm.title + '" recipe?')) return;
    try {
      await api.del('/recipes/' + rForm.id);
      rForm = null;
      await load();
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

  // Typed text that matches a saved recipe links to it, so its ingredients
  // can go on the shopping list.
  async function saveMeal(recipe) {
    var r =
      recipe ||
      recipes.find(function (x) {
        return x.title.toLowerCase() === mealTitle.trim().toLowerCase();
      });
    try {
      await api.put(
        '/meals/' + editingDay,
        r ? { recipe_id: r.id } : { title: mealTitle }
      );
      editingDay = null;
      await load();
    } catch (e) {
      error = e.message;
    }
  }

  function hasIngredients(meal) {
    return !!(meal && meal.recipe_id && meal.ingredients && meal.ingredients.length);
  }

  let ticked = $derived(items.filter((i) => i.ticked_at));
  let unticked = $derived(items.filter((i) => !i.ticked_at));
</script>

{#if error}<div class="error">{error}</div>{/if}
{#if flash}<div class="flash">{flash}</div>{/if}

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
    <div class="panel-head">
      <div class="panel-title">🍽️ What's for dinner</div>
      <button class="week-shop" onclick={shopWeek} title="Add this week's ingredients to the shopping list"
        >🛒 Shop the week</button
      >
    </div>
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
          <button class="save" onclick={() => saveMeal()}>✓</button>
        {:else}
          <button class="meal-value" class:unset={!day.meal} onclick={() => editMeal(day)}>
            {day.meal ? (day.meal.emoji || '🍽️') + ' ' + day.meal.title : 'tap to plan'}
          </button>
          {#if hasIngredients(day.meal)}
            <button class="day-shop" title="Add ingredients to the shopping list" onclick={() => shopDay(day)}
              >🛒</button
            >
          {:else}
            <span></span>
          {/if}
        {/if}
      </div>
      {#if editingDay === day.key && recipes.length}
        <div class="pick">
          <span class="pick-label">Or pick a recipe:</span>
          {#each recipes as r (r.id)}
            <button class="rchip" onclick={() => saveMeal(r)}>{r.emoji} {r.title}</button>
          {/each}
        </div>
      {/if}
    {/each}
  </div>
</div>

<div class="card panel recipes">
  <div class="panel-head">
    <div class="panel-title">📖 Recipes</div>
    {#if !rForm}<button class="add-btn" onclick={newRecipe}>＋ New recipe</button>{/if}
  </div>

  {#if rForm}
    <div class="rform">
      <div class="rform-top">
        <input class="r-emoji" maxlength="4" bind:value={rForm.emoji} aria-label="Emoji" />
        <input class="r-title" placeholder="Recipe name, e.g. Spag bol" bind:value={rForm.title} />
      </div>
      <textarea
        rows="6"
        placeholder={'Ingredients, one per line\nMince\nSpaghetti\nChopped tomatoes'}
        bind:value={rForm.ingredients}
      ></textarea>
      <div class="rform-actions">
        {#if rForm.id}<button class="r-del" onclick={deleteRecipe}>Delete</button>{:else}<span></span>{/if}
        <button class="r-cancel" onclick={() => (rForm = null)}>Cancel</button>
        <button class="save" disabled={!rForm.title.trim()} onclick={saveRecipe}>Save recipe</button>
      </div>
    </div>
  {:else if recipes.length}
    <div class="rlist">
      {#each recipes as r (r.id)}
        <button class="ritem" onclick={() => editRecipe(r)}>
          <span class="ritem-title">{r.emoji} {r.title}</span>
          <span class="ritem-meta">{(r.ingredients || []).length} ingredients</span>
        </button>
      {/each}
    </div>
  {:else}
    <p class="empty">
      Save your regular dinners with their ingredients. Then plan a night with one tap, and 🛒 puts
      everything you need on the shopping list.
    </p>
  {/if}
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

  /* ── Meals -> shopping, recipes ── */
  .panel-head {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    margin-bottom: 12px;
  }
  .panel-head .panel-title {
    margin-bottom: 0;
  }
  .week-shop {
    background: var(--bg);
    color: var(--text);
    border-radius: 999px;
    padding: 8px 14px;
    font-size: 13px;
    font-weight: 600;
  }
  .day-shop {
    font-size: 18px;
    padding: 6px 8px;
    border-radius: 8px;
    background: var(--bg);
  }
  .pick {
    padding: 4px 0 10px 118px;
    border-bottom: 1px solid var(--border);
  }
  .pick-label {
    display: block;
    font-size: 12px;
    color: var(--text-muted);
    margin-bottom: 4px;
  }
  /* inline-block + margin: Safari 10 has no flexbox gap */
  .rchip {
    display: inline-block;
    margin: 0 6px 6px 0;
    padding: 6px 12px;
    border-radius: 999px;
    background: var(--bg);
    border: 1px solid var(--border);
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
  }
  .recipes {
    margin-top: 16px;
  }
  .rlist {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    grid-gap: 8px;
  }
  @media (max-width: 700px) {
    .rlist {
      grid-template-columns: 1fr;
    }
    .pick {
      padding-left: 0;
    }
  }
  .ritem {
    display: block;
    width: 100%;
    text-align: left;
    padding: 12px;
    border-radius: 10px;
    background: var(--bg);
    color: var(--text);
  }
  .ritem-title {
    display: block;
    font-size: 15px;
    font-weight: 600;
  }
  .ritem-meta {
    display: block;
    font-size: 12px;
    color: var(--text-muted);
    margin-top: 2px;
  }
  .rform-top {
    display: grid;
    grid-template-columns: 60px 1fr;
    grid-gap: 8px;
    margin-bottom: 8px;
  }
  .rform input,
  .rform textarea {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: 10px;
    font-family: inherit;
    font-size: 16px;
    background: #fff;
    -webkit-appearance: none;
  }
  .r-emoji {
    text-align: center;
  }
  .rform textarea {
    resize: vertical;
  }
  .rform-actions {
    display: grid;
    grid-template-columns: 1fr auto auto;
    grid-gap: 8px;
    align-items: center;
    margin-top: 10px;
  }
  .r-del {
    color: #b91c1c;
    font-weight: 600;
    font-size: 14px;
    text-align: left;
  }
  .r-cancel {
    color: var(--text-muted);
    font-weight: 600;
    font-size: 14px;
    padding: 8px 12px;
  }
  .save:disabled {
    opacity: 0.5;
  }
  .flash {
    background: #dcfce7;
    color: #166534;
    border-radius: 8px;
    padding: 8px 12px;
    margin-bottom: 8px;
    font-size: 14px;
    font-weight: 600;
  }
</style>

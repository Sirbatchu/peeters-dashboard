<script>
  import { api } from '../api.js';

  let kids = $state([]);
  let rewards = $state([]);
  let celebrating = $state(null); // kid slug mid-celebration
  let error = $state('');

  async function load() {
    try {
      const [k, r] = await Promise.all([api.get('/kids'), api.get('/rewards')]);
      kids = k;
      rewards = r.filter((rw) => !rw.claimed_at);
    } catch (e) {
      error = e.message;
    }
  }

  $effect(() => {
    load();
    const iv = setInterval(load, 60 * 1000);
    return () => clearInterval(iv);
  });

  async function tick(kid, item, evt) {
    // Optimistic flip so the tap feels instant on old hardware.
    item.done = !item.done;
    kid.done += item.done ? 1 : -1;

    if (item.done) confettiAt(evt.clientX, evt.clientY);

    try {
      const fresh = await api.post('/kids/' + kid.slug + '/tick', { item_id: item.id });
      kid.items = fresh.items;
      kid.done = fresh.done;
      kid.total = fresh.total;
      kid.complete = fresh.complete;
      kid.streak = fresh.streak;
      if (fresh.complete && fresh.justTicked) {
        celebrating = kid.slug;
        bigConfetti();
        setTimeout(() => (celebrating = null), 3500);
        load(); // refresh star totals
      }
    } catch (e) {
      error = e.message;
      load(); // resync after failure
    }
  }

  function confettiAt(cx, cy) {
    const colours = ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#ff922b', '#cc5de8', '#f06595'];
    for (let i = 0; i < 22; i++) {
      const dot = document.createElement('div');
      const size = 5 + Math.random() * 6;
      const angle = (i / 22) * Math.PI * 2 + Math.random() * 0.4;
      const dist = 35 + Math.random() * 65;
      const tx = Math.cos(angle) * dist;
      const ty = Math.sin(angle) * dist - 20;
      dot.style.cssText =
        'position:fixed;width:' + size + 'px;height:' + size + 'px;' +
        'left:' + cx + 'px;top:' + cy + 'px;border-radius:50%;pointer-events:none;z-index:99;' +
        'background:' + colours[i % colours.length] + ';' +
        '-webkit-transition:all .7s ease-out;transition:all .7s ease-out;opacity:1;';
      document.body.appendChild(dot);
      requestAnimationFrame(() => {
        dot.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(.4)';
        dot.style.webkitTransform = 'translate(' + tx + 'px,' + ty + 'px) scale(.4)';
        dot.style.opacity = '0';
      });
      setTimeout(() => dot.remove(), 800);
    }
  }

  function bigConfetti() {
    const w = window.innerWidth;
    for (let i = 0; i < 5; i++) {
      setTimeout(
        () => confettiAt(Math.random() * w, 80 + Math.random() * 180),
        i * 250
      );
    }
  }
</script>

{#if error}<div class="error">{error}</div>{/if}

<div class="board">
  {#each kids as kid (kid.slug)}
    <div class="card kid" style="border-top: 6px solid {kid.colour}">
      <div class="kid-head">
        <div class="ring-wrap" class:pulse={kid.complete}>
          <svg viewBox="0 0 72 72" class="ring">
            <circle cx="36" cy="36" r="31" fill="rgba(255,255,255,.6)" stroke="var(--border)" stroke-width="5" />
            <circle
              cx="36"
              cy="36"
              r="31"
              fill="none"
              stroke={kid.colour}
              stroke-width="5"
              stroke-linecap="round"
              stroke-dasharray="194.8"
              stroke-dashoffset={194.8 * (1 - (kid.total ? kid.done / kid.total : 0))}
              transform="rotate(-90 36 36)"
              style="-webkit-transition: stroke-dashoffset .5s ease; transition: stroke-dashoffset .5s ease"
            />
          </svg>
          <div class="ring-emoji">{kid.emoji}</div>
        </div>
        <div>
          <div class="kid-name">{kid.name}</div>
          <div class="kid-stats">
            <span class="stat stars">⭐ {kid.stars}</span>
            {#if kid.streak > 1}<span class="stat streak">🔥 {kid.streak} day streak</span>{/if}
          </div>
        </div>
        <div class="progress" class:full={kid.complete}>
          {kid.done}<span class="of">/{kid.total}</span>
        </div>
      </div>

      {#each kid.items as item (item.id)}
        <button class="item" class:done={item.done} onclick={(e) => tick(kid, item, e)}>
          <span class="box">{item.done ? '✓' : ''}</span>
          <span class="item-emoji">{item.emoji}</span>
          <span class="label">{item.label}</span>
        </button>
      {/each}

      {#if celebrating === kid.slug}
        <div class="congrats">🎉 Amazing job today, {kid.name}!</div>
      {:else if kid.complete}
        <div class="congrats subtle">🌟 All done today!</div>
      {/if}
    </div>
  {/each}
</div>

{#if rewards.length}
  <div class="card rewards">
    <div class="rewards-title">🎁 Saving up for</div>
    <div class="rewards-grid">
      {#each rewards as r (r.id)}
        <div class="reward">
          <div class="reward-emoji">{r.emoji}</div>
          <div class="reward-label">{r.label}</div>
          <div class="reward-cost">⭐ {r.cost}</div>
        </div>
      {/each}
    </div>
  </div>
{/if}

<style>
  .board {
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-gap: 16px;
  }
  @media (max-width: 640px) {
    .board {
      grid-template-columns: 1fr;
    }
  }
  .kid {
    padding: 16px;
  }
  .kid-head {
    display: grid;
    grid-template-columns: auto 1fr auto;
    grid-gap: 12px;
    align-items: center;
    margin-bottom: 10px;
  }
  .ring-wrap {
    position: relative;
    width: 64px;
    height: 64px;
  }
  .ring-wrap.pulse {
    -webkit-animation: pulse 1.6s ease infinite;
    animation: pulse 1.6s ease infinite;
  }
  .ring {
    width: 64px;
    height: 64px;
    display: block;
  }
  .ring-emoji {
    position: absolute;
    top: 0;
    left: 0;
    width: 64px;
    height: 64px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 30px;
  }
  .kid-name {
    font-size: 24px;
    font-weight: 700;
    letter-spacing: -0.3px;
  }
  .kid-stats .stat {
    display: inline-block;
    font-size: 13px;
    font-weight: 600;
    border-radius: 999px;
    padding: 2px 10px;
    margin-right: 6px;
    margin-top: 4px;
  }
  .stat.stars {
    background: #fef3c7;
    color: #b45309;
  }
  .stat.streak {
    background: #ffedd5;
    color: #c2410c;
  }
  .progress {
    font-size: 26px;
    font-weight: 700;
    color: var(--text-muted);
  }
  .progress .of {
    font-size: 15px;
    font-weight: 500;
    opacity: 0.7;
  }
  .progress.full {
    color: #16a34a;
  }
  .item {
    display: grid;
    grid-template-columns: auto auto 1fr;
    grid-gap: 10px;
    align-items: center;
    width: 100%;
    padding: 12px 10px;
    border-radius: 10px;
    text-align: left;
    font-size: 17px;
    color: var(--text);
    background: var(--bg);
    margin-bottom: 8px;
  }
  .item.done {
    background: #dcfce7;
    color: #15803d;
  }
  .item.done .label {
    text-decoration: line-through;
    opacity: 0.75;
  }
  .box {
    width: 30px;
    height: 30px;
    border-radius: 8px;
    border: 2px solid var(--border);
    background: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    font-weight: 700;
    color: #16a34a;
  }
  .item.done .box {
    border-color: #16a34a;
    background: #f0fdf4;
  }
  .item-emoji {
    font-size: 20px;
  }
  .congrats {
    text-align: center;
    font-size: 18px;
    font-weight: 700;
    color: #d97706;
    padding: 12px 0 4px;
  }
  .congrats.subtle {
    color: #16a34a;
    font-size: 15px;
  }
  .rewards {
    margin-top: 16px;
    padding: 16px;
  }
  .rewards-title {
    font-weight: 700;
    margin-bottom: 10px;
  }
  .rewards-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    grid-gap: 10px;
  }
  .reward {
    background: var(--bg);
    border-radius: 10px;
    padding: 12px;
    text-align: center;
  }
  .reward-emoji {
    font-size: 28px;
  }
  .reward-label {
    font-size: 14px;
    font-weight: 600;
    margin: 4px 0 2px;
  }
  .reward-cost {
    font-size: 13px;
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
</style>

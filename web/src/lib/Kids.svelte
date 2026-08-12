<script>
  import { api } from '../api.js';

  let kids = $state([]);
  let rewards = $state([]);
  let history = $state({}); // slug -> [{day, points}]
  let celebrating = $state(null); // kid slug mid-celebration
  let error = $state('');

  // Chore timer
  const CHORES = [
    { label: 'Tidy-up race', emoji: '🧸', mins: 10 },
    { label: 'Get dressed', emoji: '👕', mins: 5 },
    { label: 'Teeth', emoji: '🪥', mins: 2 },
    { label: 'Quiet time', emoji: '📚', mins: 20 }
  ];
  let timer = $state(null); // {label, emoji, total, left}
  let timerHandle = null;

  // Reward claiming
  let claiming = $state(null); // reward being claimed
  let claimKid = $state('');
  let claimPin = $state('');
  let claimError = $state('');

  async function load() {
    try {
      const [k, r] = await Promise.all([api.get('/kids'), api.get('/rewards')]);
      kids = k;
      rewards = r.filter((rw) => !rw.claimed_at);
      const hists = await Promise.all(
        k.map((kid) => api.get('/kids/' + kid.slug + '/history?days=14'))
      );
      const h = {};
      k.forEach((kid, i) => (h[kid.slug] = hists[i]));
      history = h;
    } catch (e) {
      error = e.message;
    }
  }

  // Last 14 days, zero-filled, for the mini chart
  function chartDays(slug) {
    const rows = history[slug] || [];
    const out = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 864e5);
      const key =
        d.getFullYear() +
        '-' +
        String(d.getMonth() + 1).padStart(2, '0') +
        '-' +
        String(d.getDate()).padStart(2, '0');
      const row = rows.find((r) => r.day === key);
      out.push({ key, points: row ? row.points : 0, completed: row ? row.completed : false });
    }
    return out;
  }

  function startTimer(chore) {
    stopTimer();
    timer = { ...chore, total: chore.mins * 60, left: chore.mins * 60 };
    timerHandle = setInterval(() => {
      if (!timer) return;
      timer.left -= 1;
      if (timer.left <= 0) {
        stopTimer(true);
      }
    }, 1000);
  }

  function stopTimer(finished) {
    if (timerHandle) clearInterval(timerHandle);
    timerHandle = null;
    if (finished) {
      bigConfetti();
      timer = { ...timer, left: 0, finished: true };
      setTimeout(() => (timer = null), 5000);
    } else {
      timer = null;
    }
  }

  function fmtTime(s) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m + ':' + (sec < 10 ? '0' : '') + sec;
  }

  function openClaim(reward) {
    claiming = reward;
    claimKid = reward.kid_slug || (kids[0] && kids[0].slug) || '';
    claimPin = '';
    claimError = '';
  }

  async function confirmClaim() {
    try {
      await api.post('/rewards/' + claiming.id + '/claim', {
        kid_slug: claimKid,
        pin: claimPin
      });
      claiming = null;
      bigConfetti();
      await load();
    } catch (e) {
      claimError = e.message;
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

      <!-- 14-day star history -->
      <div class="chart">
        {#each chartDays(kid.slug) as d (d.key)}
          <div class="chart-col">
            <div
              class="chart-bar"
              class:hit={d.completed}
              style="height:{Math.min(d.points, 10) * 10}%;background:{kid.colour}"
            ></div>
          </div>
        {/each}
      </div>
      <div class="chart-label">last 14 days</div>
    </div>
  {/each}
</div>

<!-- Chore timers -->
<div class="card timers">
  <div class="t-title">⏱ Beat the clock</div>
  {#if timer}
    <div class="t-active" class:t-done={timer.finished}>
      <div class="t-emoji">{timer.emoji}</div>
      <div class="t-name">{timer.finished ? '🎉 ' + timer.label + ' — done!' : timer.label}</div>
      <div class="t-clock">{timer.finished ? '⭐' : fmtTime(timer.left)}</div>
      <div class="t-bar">
        <div
          class="t-fill"
          class:urgent={!timer.finished && timer.left / timer.total < 0.25}
          style="width:{(timer.left / timer.total) * 100}%"
        ></div>
      </div>
      {#if !timer.finished}
        <button class="t-stop" onclick={() => stopTimer(false)}>Stop</button>
      {/if}
    </div>
  {:else}
    <div class="t-grid">
      {#each CHORES as chore (chore.label)}
        <button class="t-preset" onclick={() => startTimer(chore)}>
          <span class="t-preset-emoji">{chore.emoji}</span>
          <span>{chore.label}</span>
          <span class="t-mins">{chore.mins} min</span>
        </button>
      {/each}
    </div>
  {/if}
</div>

{#if rewards.length}
  <div class="card rewards">
    <div class="rewards-title">🎁 Saving up for <span class="rewards-hint">tap to claim</span></div>
    <div class="rewards-grid">
      {#each rewards as r (r.id)}
        <button class="reward" onclick={() => openClaim(r)}>
          <div class="reward-emoji">{r.emoji}</div>
          <div class="reward-label">{r.label}</div>
          <div class="reward-cost">⭐ {r.cost}</div>
        </button>
      {/each}
    </div>
  </div>
{/if}

{#if claiming}
  <div
    class="overlay"
    onclick={() => (claiming = null)}
    onkeydown={(e) => e.key === 'Escape' && (claiming = null)}
    role="presentation"
  >
    <div
      class="modal card"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
      role="dialog"
      tabindex="-1"
    >
      <div class="claim-head">{claiming.emoji} Claim "{claiming.label}"</div>
      <div class="claim-cost">costs ⭐ {claiming.cost}</div>

      <div class="claim-kids">
        {#each kids as kid (kid.slug)}
          <button
            class="claim-kid"
            class:sel={claimKid === kid.slug}
            style={claimKid === kid.slug ? 'border-color:' + kid.colour : ''}
            onclick={() => (claimKid = kid.slug)}
          >
            {kid.emoji} {kid.name}
            <span class="claim-bal">⭐ {kid.stars}</span>
          </button>
        {/each}
      </div>

      <input
        class="pin"
        type="password"
        inputmode="numeric"
        placeholder="Parent PIN"
        bind:value={claimPin}
        onkeydown={(e) => e.key === 'Enter' && confirmClaim()}
      />
      {#if claimError}<div class="claim-err">{claimError}</div>{/if}
      <button class="claim-go" onclick={confirmClaim}>Claim it! 🎉</button>
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

  /* Star history chart */
  .chart {
    display: grid;
    grid-template-columns: repeat(14, 1fr);
    grid-gap: 3px;
    height: 46px;
    align-items: end;
    margin-top: 12px;
    padding-top: 10px;
    border-top: 1px solid var(--border);
  }
  .chart-col {
    height: 100%;
    display: flex;
    align-items: flex-end;
  }
  .chart-bar {
    width: 100%;
    min-height: 3px;
    border-radius: 3px 3px 0 0;
    opacity: 0.45;
  }
  .chart-bar.hit {
    opacity: 1;
  }
  .chart-label {
    font-size: 11px;
    color: var(--text-muted);
    text-align: right;
    margin-top: 2px;
  }

  /* Chore timers */
  .timers {
    margin-top: 16px;
    padding: 16px;
  }
  .t-title {
    font-weight: 700;
    margin-bottom: 12px;
  }
  .t-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    grid-gap: 10px;
  }
  @media (max-width: 700px) {
    .t-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }
  .t-preset {
    display: block;
    background: var(--bg);
    border-radius: 12px;
    padding: 14px 8px;
    text-align: center;
    font-size: 15px;
    font-weight: 600;
    color: var(--text);
  }
  .t-preset-emoji {
    display: block;
    font-size: 28px;
    margin-bottom: 4px;
  }
  .t-mins {
    display: block;
    font-size: 12px;
    color: var(--text-muted);
    margin-top: 2px;
  }
  .t-active {
    text-align: center;
    padding: 8px 0;
  }
  .t-emoji {
    font-size: 44px;
  }
  .t-name {
    font-size: 20px;
    font-weight: 700;
    margin: 4px 0;
  }
  .t-clock {
    font-size: 56px;
    font-weight: 700;
    letter-spacing: 2px;
    line-height: 1.1;
  }
  .t-bar {
    height: 14px;
    background: var(--bg);
    border-radius: 7px;
    overflow: hidden;
    margin: 12px auto;
    max-width: 480px;
  }
  .t-fill {
    height: 100%;
    background: #16a34a;
    border-radius: 7px;
    -webkit-transition: width 1s linear;
    transition: width 1s linear;
  }
  .t-fill.urgent {
    background: #dc2626;
  }
  .t-stop {
    color: var(--text-muted);
    font-size: 14px;
    font-weight: 600;
    padding: 8px 20px;
  }
  .t-done .t-name {
    color: #d97706;
  }

  /* Reward claiming */
  .rewards-hint {
    font-size: 12px;
    font-weight: 500;
    color: var(--text-muted);
    margin-left: 8px;
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
    max-width: 420px;
    padding: 20px;
    text-align: center;
  }
  .claim-head {
    font-size: 20px;
    font-weight: 700;
  }
  .claim-cost {
    color: var(--text-muted);
    margin: 4px 0 14px;
  }
  .claim-kids {
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-gap: 10px;
    margin-bottom: 12px;
  }
  .claim-kid {
    padding: 14px 8px;
    border-radius: 12px;
    background: var(--bg);
    border: 3px solid transparent;
    font-size: 16px;
    font-weight: 600;
    color: var(--text);
  }
  .claim-kid.sel {
    background: #fff;
  }
  .claim-bal {
    display: block;
    font-size: 13px;
    color: var(--text-muted);
    margin-top: 2px;
  }
  .pin {
    width: 100%;
    padding: 12px;
    border: 1px solid var(--border);
    border-radius: 10px;
    font-family: inherit;
    font-size: 18px;
    text-align: center;
    letter-spacing: 6px;
    -webkit-appearance: none;
  }
  .claim-err {
    color: #b91c1c;
    font-size: 13px;
    margin-top: 8px;
  }
  .claim-go {
    display: block;
    width: 100%;
    margin-top: 12px;
    background: var(--header);
    color: #fff;
    padding: 14px;
    border-radius: 10px;
    font-size: 16px;
    font-weight: 700;
  }
</style>

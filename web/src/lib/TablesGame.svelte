<script>
  // Times-tables quick-fire: 60 seconds, big number pad, answers check
  // themselves once enough digits are typed. Each kid's chosen tables are
  // remembered in settings (tables_<slug>); the API works out the stars.
  import { api } from '../api.js';
  import { play, unlock, kidSound, soundsOn } from '../sounds.js';

  let { kid, settings = {}, onclose, ondone } = $props();

  const ROUND_SECS = 60;
  const ALL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  // svelte-ignore state_referenced_locally
  let chosen = $state(parseTables(settings['tables_' + kid.slug]));
  let phase = $state('ready'); // ready | play | done
  let stats = $state(null); // {best, today_stars, per_star, daily_cap}
  let q = $state(null); // {a, b, answer}
  let typed = $state('');
  let flash = $state(''); // 'right' | 'wrong'
  let reveal = $state(''); // correct answer shown after a miss
  let correct = $state(0);
  let wrong = $state(0);
  let left = $state(ROUND_SECS);
  let result = $state(null);
  let error = $state('');
  let busy = false; // between an answer and the next question
  let missed = []; // facts to ask again this round
  let endsAt = 0;
  let ticker = null;

  function parseTables(v) {
    const nums = String(v || '2,5,10')
      .split(',')
      .map(Number)
      .filter((n) => n >= 1 && n <= 12);
    return nums.length ? nums : [2, 5, 10];
  }

  $effect(() => {
    api
      .get('/kids/' + kid.slug + '/tables')
      .then((s) => (stats = s))
      .catch(() => {});
    return () => clearInterval(ticker);
  });

  function toggleTable(n) {
    if (chosen.indexOf(n) !== -1) {
      if (chosen.length > 1) chosen = chosen.filter((x) => x !== n);
    } else {
      chosen = chosen.concat(n).sort((a, b) => a - b);
    }
  }

  function nextQuestion() {
    let a, b;
    // Every so often, ask one they got wrong again.
    if (missed.length && Math.random() < 0.4) {
      const m = missed.shift();
      a = m.a;
      b = m.b;
    } else {
      do {
        a = chosen[Math.floor(Math.random() * chosen.length)];
        b = 1 + Math.floor(Math.random() * 12);
      } while (q && ((q.a === a && q.b === b) || (q.a === b && q.b === a)));
      // Mix up the order: 7 × 3 as well as 3 × 7.
      if (Math.random() < 0.5) {
        const t = a;
        a = b;
        b = t;
      }
    }
    q = { a, b, answer: a * b };
    typed = '';
  }

  function start() {
    unlock();
    // Remember this kid's tables for next time (and on other screens).
    api.put('/settings', { ['tables_' + kid.slug]: chosen.join(',') }).catch(() => {});
    correct = 0;
    wrong = 0;
    missed = [];
    result = null;
    error = '';
    q = null;
    nextQuestion();
    phase = 'play';
    if (soundsOn(settings)) play('go');
    endsAt = Date.now() + ROUND_SECS * 1000;
    left = ROUND_SECS;
    clearInterval(ticker);
    ticker = setInterval(() => {
      left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      if (left <= 0) finish();
    }, 200);
  }

  function press(d) {
    if (phase !== 'play' || busy) return;
    if (typed.length >= 3) return;
    typed += d;
    if (typed.length >= String(q.answer).length) check();
  }

  function back() {
    if (!busy) typed = typed.slice(0, -1);
  }

  function check() {
    busy = true;
    const ok = Number(typed) === q.answer;
    if (ok) {
      correct++;
      flash = 'right';
      if (soundsOn(settings)) play('right');
      setTimeout(() => {
        flash = '';
        busy = false;
        if (phase === 'play') nextQuestion();
      }, 250);
    } else {
      wrong++;
      flash = 'wrong';
      reveal = q.a + ' × ' + q.b + ' = ' + q.answer;
      missed.push({ a: q.a, b: q.b });
      if (soundsOn(settings)) play('wrong');
      setTimeout(() => {
        flash = '';
        reveal = '';
        busy = false;
        if (phase === 'play') nextQuestion();
      }, 1400);
    }
  }

  async function finish() {
    if (phase !== 'play') return; // the clock and Stop can both land here
    clearInterval(ticker);
    phase = 'done';
    try {
      result = await api.post('/kids/' + kid.slug + '/tables', {
        correct,
        wrong,
        tables: chosen.join(',')
      });
      stats = result;
      if (result.new_best && soundsOn(settings)) play(kidSound(settings, kid.slug));
      else if (result.stars && soundsOn(settings)) play('levelup');
      if (ondone) ondone(result);
    } catch (e) {
      error = e.message;
    }
  }

  function quit() {
    clearInterval(ticker);
    onclose();
  }

  // Physical keyboards too (handy when testing on a laptop).
  function onKey(e) {
    if (phase !== 'play') return;
    if (e.key >= '0' && e.key <= '9') press(e.key);
    else if (e.key === 'Backspace') back();
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="tg-overlay" role="dialog" aria-label="Times tables">
  <div class="tg card" style="border-top: 6px solid {kid.colour}">
    <div class="tg-head">
      <div class="tg-title">🧮 {kid.name}'s times tables</div>
      <button class="tg-close" onclick={quit} aria-label="Close">✕</button>
    </div>

    {#if phase === 'ready'}
      <div class="tg-label">Which tables?</div>
      <div class="tg-tables">
        {#each ALL as n (n)}
          <button
            class="tg-t"
            class:on={chosen.indexOf(n) !== -1}
            style={chosen.indexOf(n) !== -1 ? 'background:' + kid.colour + ';border-color:' + kid.colour : ''}
            onclick={() => toggleTable(n)}>{n}×</button
          >
        {/each}
      </div>
      <p class="tg-rules">
        Answer as many as you can in {ROUND_SECS} seconds.
        Every {stats ? stats.per_star : 5} right = ⭐
        {#if stats}
          <br />Best: <strong>{stats.best}</strong> · Stars from tables today:
          <strong>{stats.today_stars} / {stats.daily_cap}</strong>
        {/if}
      </p>
      <button class="tg-go" style="background:{kid.colour}" onclick={start}>Go! 🚀</button>
    {:else if phase === 'play'}
      <div class="tg-bar"><div class="tg-fill" class:urgent={left <= 10} style="width:{(left / ROUND_SECS) * 100}%"></div></div>
      <div class="tg-status">
        <span>⏱ {left}s</span>
        <span>✅ {correct}</span>
        <span>❌ {wrong}</span>
      </div>
      <div class="tg-q" class:right={flash === 'right'} class:wrong={flash === 'wrong'}>
        {#if reveal}
          <span class="tg-reveal">{reveal}</span>
        {:else}
          {q.a} × {q.b} = <span class="tg-ans">{typed || '?'}</span>
        {/if}
      </div>
      <div class="tg-pad">
        {#each ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as d (d)}
          <button class="tg-key" onclick={() => press(d)}>{d}</button>
        {/each}
        <button class="tg-key tg-del" onclick={back} aria-label="Delete">⌫</button>
        <button class="tg-key" onclick={() => press('0')}>0</button>
        <button class="tg-key tg-stop" onclick={finish}>Stop</button>
      </div>
    {:else}
      <div class="tg-done">
        <div class="tg-big">{correct}</div>
        <div class="tg-sub">right{wrong ? ' · ' + wrong + ' to practise' : ''}</div>
        {#if result}
          {#if result.new_best}<div class="tg-best">🏆 New best score!</div>{/if}
          {#if result.stars}
            <div class="tg-stars">+{result.stars} ⭐</div>
          {:else if result.today_stars >= result.daily_cap}
            <div class="tg-note">That's all the table stars for today — great practice though!</div>
          {:else}
            <div class="tg-note">Get {result.per_star} right to earn a star</div>
          {/if}
        {:else if error}
          <div class="tg-err">{error}</div>
        {:else}
          <div class="tg-note">Saving…</div>
        {/if}
        <div class="tg-again">
          <button class="tg-go" style="background:{kid.colour}" onclick={() => (phase = 'ready')}>Play again</button>
          <button class="tg-go tg-quit" onclick={quit}>Done</button>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .tg-overlay {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    background: rgba(15, 23, 42, 0.6);
    z-index: 70;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 14px;
  }
  .tg {
    width: 100%;
    max-width: 560px;
    max-height: 96vh;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    padding: 16px 18px 18px;
    text-align: center;
  }
  .tg-head {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    margin-bottom: 10px;
  }
  .tg-title {
    font-size: 20px;
    font-weight: 700;
    text-align: left;
  }
  .tg-close {
    font-size: 20px;
    color: var(--text-muted);
    padding: 4px 8px;
  }
  .tg-label {
    font-weight: 600;
    margin-bottom: 8px;
  }
  .tg-tables {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    grid-gap: 8px;
  }
  .tg-t {
    padding: 12px 0;
    border-radius: 12px;
    border: 2px solid var(--border);
    background: var(--bg);
    font-size: 18px;
    font-weight: 700;
    color: var(--text-muted);
  }
  .tg-t.on {
    color: #fff;
  }
  .tg-rules {
    margin: 14px 0;
    color: var(--text-muted);
    font-size: 15px;
    line-height: 1.5;
  }
  .tg-go {
    display: inline-block;
    min-width: 180px;
    padding: 14px 24px;
    border-radius: 14px;
    color: #fff;
    font-size: 20px;
    font-weight: 700;
  }
  .tg-again .tg-go {
    min-width: 0;
    width: 100%;
  }
  .tg-quit {
    background: var(--header);
  }
  .tg-bar {
    height: 10px;
    border-radius: 999px;
    background: var(--bg);
    overflow: hidden;
  }
  .tg-fill {
    height: 100%;
    background: #22c55e;
    -webkit-transition: width 0.2s linear;
    transition: width 0.2s linear;
  }
  .tg-fill.urgent {
    background: #ef4444;
  }
  .tg-status {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    font-size: 17px;
    font-weight: 600;
    margin: 8px 0;
  }
  .tg-q {
    font-size: 54px;
    font-weight: 800;
    padding: 14px 0;
    border-radius: 16px;
    background: var(--bg);
    margin-bottom: 12px;
    letter-spacing: -1px;
  }
  .tg-q.right {
    background: #dcfce7;
    color: #15803d;
  }
  .tg-q.wrong {
    background: #fee2e2;
    color: #b91c1c;
  }
  .tg-ans {
    display: inline-block;
    min-width: 1.6em;
    border-bottom: 4px solid currentColor;
  }
  .tg-reveal {
    font-size: 44px;
  }
  .tg-pad {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    grid-gap: 10px;
  }
  .tg-key {
    padding: 14px 0;
    font-size: 30px;
    font-weight: 700;
    border-radius: 14px;
    background: #fff;
    border: 2px solid var(--border);
    color: var(--text);
  }
  .tg-key:active {
    background: #e2e8f0;
  }
  .tg-del,
  .tg-stop {
    font-size: 20px;
    color: var(--text-muted);
  }
  .tg-big {
    font-size: 80px;
    font-weight: 800;
    line-height: 1;
    margin-top: 6px;
  }
  .tg-sub {
    color: var(--text-muted);
    font-size: 17px;
  }
  .tg-best {
    margin-top: 10px;
    font-size: 22px;
    font-weight: 700;
    color: #b45309;
  }
  .tg-stars {
    margin-top: 10px;
    font-size: 30px;
    font-weight: 800;
    color: #b45309;
  }
  .tg-note {
    margin-top: 10px;
    color: var(--text-muted);
  }
  .tg-err {
    margin-top: 10px;
    color: #b91c1c;
  }
  .tg-again {
    margin-top: 18px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-gap: 10px;
  }
  /* Short landscape screens: keep the pad on screen without scrolling. */
  @media (max-height: 850px) {
    .tg-q {
      font-size: 44px;
      padding: 8px 0;
      margin-bottom: 8px;
    }
    .tg-key {
      padding: 9px 0;
      font-size: 26px;
    }
  }
</style>

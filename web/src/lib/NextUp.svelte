<script>
  // "Next up": the next few events with live countdowns, upcoming birthdays
  // and pinned family notes, in one glanceable row under the header.
  import { api } from '../api.js';

  let data = $state({ events: [], birthdays: [], notes: [] });
  let now = $state(new Date());

  async function load() {
    try {
      data = await api.get('/upcoming');
    } catch (e) {
      /* keep the last good strip; the offline banner covers outages */
    }
  }

  $effect(() => {
    load();
    var poll = setInterval(load, 60 * 1000);
    // Countdowns tick without refetching.
    var tick = setInterval(function () {
      now = new Date();
    }, 30 * 1000);
    return function () {
      clearInterval(poll);
      clearInterval(tick);
    };
  });

  function localDay(d) {
    return Math.round(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 864e5);
  }

  function hhmm(d) {
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function when(e) {
    var s = new Date(e.starts_at);
    var en = new Date(e.ends_at);
    if (s <= now && en >= now) return e.all_day ? 'Today' : 'Now';
    var mins = Math.round((s - now) / 60000);
    var days = localDay(s) - localDay(now);
    if (!e.all_day && days === 0 && mins < 60) return 'in ' + Math.max(mins, 1) + ' min';
    if (!e.all_day && days === 0 && mins < 180) {
      var h = Math.floor(mins / 60);
      var m = mins % 60;
      return 'in ' + h + 'h' + (m ? ' ' + m + 'm' : '');
    }
    var t = e.all_day ? '' : ' ' + hhmm(s);
    if (days === 0) return 'Today' + t;
    if (days === 1) return 'Tomorrow' + t;
    if (days < 7) return s.toLocaleDateString('en-GB', { weekday: 'short' }) + t;
    return s.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + t;
  }

  function soon(e) {
    var mins = (new Date(e.starts_at) - now) / 60000;
    return !e.all_day && mins <= 30;
  }

  function bdayWhen(b) {
    if (b.days === 0) return 'today! 🎉';
    if (b.days === 1) return 'tomorrow';
    return 'in ' + b.days + ' days';
  }

  let empty = $derived(!data.events.length && !data.birthdays.length && !data.notes.length);
</script>

{#if !empty}
  <div class="nextup">
    <div class="rail">
      <span class="label">Next up</span>

      {#each data.events as e (e.id + e.starts_at)}
        <span class="chip ev" class:soon={soon(e)} style="border-left-color:{e.colour}">
          <span class="when">{when(e)}</span>
          <span class="title">{e.title}</span>
          {#if e.calendar !== 'family'}<span class="who" style="color:{e.colour}">{e.who.split(' ')[0]}</span>{/if}
        </span>
      {/each}

      {#each data.birthdays as b (b.id)}
        <span class="chip bday" class:today={b.days === 0}>
          🎂 <span class="title">{b.name}</span>
          <span class="when">{bdayWhen(b)}{b.turning ? ' · ' + b.turning : ''}</span>
        </span>
      {/each}

      {#each data.notes as n (n.id)}
        <span class="chip note" style="border-left-color:{n.colour || '#94a3b8'}">
          📝 <span class="title">{n.body}</span>
        </span>
      {/each}
    </div>
  </div>
{/if}

<style>
  .nextup {
    max-width: 1100px;
    width: calc(100% - 32px);
    margin: 4px auto 0;
  }
  .rail {
    white-space: nowrap;
    overflow-x: auto;
    overflow-y: hidden;
    -webkit-overflow-scrolling: touch;
    padding-bottom: 2px;
  }
  .label {
    display: inline-block;
    vertical-align: middle;
    margin-right: 8px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.85);
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
  }
  /* inline-block + margin: flexbox gap does not exist on the iPad's Safari 10 */
  .chip {
    display: inline-block;
    vertical-align: middle;
    margin-right: 8px;
    padding: 6px 12px;
    border-radius: 999px;
    border-left: 4px solid transparent;
    background: rgba(255, 255, 255, 0.82);
    -webkit-backdrop-filter: blur(12px);
    backdrop-filter: blur(12px);
    box-shadow: var(--shadow);
    font-size: 14px;
    color: var(--text);
    max-width: 340px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .when {
    font-weight: 700;
    margin-right: 6px;
  }
  .title {
    font-weight: 500;
  }
  .who {
    margin-left: 6px;
    font-weight: 700;
    font-size: 12px;
  }
  .chip.soon {
    background: #fef3c7;
  }
  .chip.bday .when {
    margin: 0 0 0 6px;
    font-weight: 600;
    color: var(--text-muted);
  }
  .chip.bday.today {
    background: #fce7f3;
  }
  .chip.bday.today .when {
    color: #be185d;
  }
  @media (max-height: 850px) {
    .chip {
      padding: 4px 10px;
      font-size: 13px;
    }
  }
</style>

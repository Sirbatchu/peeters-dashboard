<script>
  // Phone page at /photos: add background photos from the camera roll and
  // choose what the dashboard shows. Open it by scanning the QR code on the
  // House tab, or bookmark http://192.168.10.6/photos on your home screen.
  import { api } from '../api.js';

  let photos = $state([]);
  let settings = $state({});
  let uploading = $state(0); // photos still to go
  let error = $state('');
  let saved = $state('');

  const MODES = [
    { id: 'sky', label: '🌤 Animated sky', hint: 'The weather sky, no photo' },
    { id: 'photo', label: '🖼 One photo', hint: 'Tap a photo below to choose it' },
    { id: 'slideshow', label: '🔁 Slideshow', hint: 'Every photo in turn' }
  ];
  const INTERVALS = [
    { mins: '5', label: 'Every 5 min' },
    { mins: '15', label: 'Every 15 min' },
    { mins: '60', label: 'Every hour' },
    { mins: '1440', label: 'Once a day' }
  ];

  let mode = $derived(settings.background_mode || 'sky');

  async function load() {
    try {
      [photos, settings] = await Promise.all([api.get('/backgrounds'), api.get('/settings')]);
    } catch (e) {
      error = e.message;
    }
  }

  $effect(() => {
    load();
  });

  async function save(patch) {
    error = '';
    try {
      settings = await api.put('/settings', patch);
      saved = 'Saved — the dashboard updates within a minute';
      setTimeout(() => (saved = ''), 3000);
    } catch (e) {
      error = e.message;
    }
  }

  // Shrink to at most 2560px on the long side as JPEG before uploading:
  // phone photos are 5-15MB and the tablet only needs a screenful.
  function shrink(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const max = 2560;
        const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * scale);
        c.height = Math.round(img.naturalHeight * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not read ' + file.name))), 'image/jpeg', 0.85);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error(file.name + " isn't a format this browser can open (try JPEG)"));
      };
      img.src = url;
    });
  }

  async function upload(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = ''; // allow picking the same photo again
    if (!files.length) return;
    error = '';
    uploading = files.length;
    let last = null;
    for (const f of files) {
      try {
        const blob = await shrink(f);
        const res = await fetch('/api/backgrounds', {
          method: 'POST',
          headers: { 'Content-Type': 'image/jpeg' },
          body: blob
        });
        if (!res.ok) throw new Error('Upload failed (' + res.status + ')');
        last = (await res.json()).name;
      } catch (err) {
        error = err.message;
      }
      uploading--;
    }
    await load();
    // First photo ever, or a single pick: show it straight away.
    if (last && (mode === 'sky' || files.length === 1) && mode !== 'slideshow') {
      await save({ background_mode: 'photo', background_photo: last });
    }
  }

  function choose(name) {
    save({ background_mode: 'photo', background_photo: name });
  }

  async function remove(name) {
    if (!confirm('Delete this photo?')) return;
    try {
      await api.del('/backgrounds/' + encodeURIComponent(name));
      await load();
    } catch (e) {
      error = e.message;
    }
  }
</script>

<div class="page">
  <h1>Dashboard background</h1>
  <p class="sub">Pick photos from your phone and choose what the kitchen screen shows.</p>

  <label class="add" class:busy={uploading}>
    <input type="file" accept="image/*" multiple onchange={upload} disabled={uploading > 0} />
    {uploading ? 'Uploading… ' + uploading + ' left' : '📷 Add photos'}
  </label>

  {#if error}<div class="msg err">{error}</div>{/if}
  {#if saved}<div class="msg ok">{saved}</div>{/if}

  <div class="modes">
    {#each MODES as m (m.id)}
      <button
        class="mode"
        class:on={mode === m.id}
        disabled={m.id !== 'sky' && !photos.length}
        onclick={() => save(m.id === 'photo' && !settings.background_photo && photos.length
          ? { background_mode: 'photo', background_photo: photos[0] }
          : { background_mode: m.id })}
      >
        <span class="mode-label">{m.label}</span>
        <span class="mode-hint">{m.hint}</span>
      </button>
    {/each}
  </div>

  {#if mode === 'slideshow'}
    <select value={settings.background_mins || '15'} onchange={(e) => save({ background_mins: e.target.value })}>
      {#each INTERVALS as i (i.mins)}<option value={i.mins}>{i.label}</option>{/each}
    </select>
  {/if}

  {#if photos.length}
    <div class="grid">
      {#each photos as p (p)}
        <div class="thumb" class:chosen={mode === 'photo' && settings.background_photo === p}>
          <button class="pick" onclick={() => choose(p)} style="background-image:url('/api/backgrounds/{p}')">
            {#if mode === 'photo' && settings.background_photo === p}<span class="tick">✓ On screen</span>{/if}
          </button>
          <button class="del" onclick={() => remove(p)} aria-label="Delete photo">🗑</button>
        </div>
      {/each}
    </div>
  {:else}
    <p class="empty">No photos yet — tap <strong>Add photos</strong> to pick some from your camera roll.</p>
  {/if}

  <a class="back" href="/">← Back to the dashboard</a>
</div>

<style>
  .page {
    min-height: 100%;
    background: var(--bg);
    padding: 20px 16px 40px;
    max-width: 720px;
    margin: 0 auto;
  }
  h1 {
    font-size: 24px;
    font-weight: 700;
  }
  .sub {
    color: var(--text-muted);
    margin: 4px 0 16px;
  }
  .add {
    display: block;
    text-align: center;
    background: var(--header);
    color: #fff;
    font-size: 18px;
    font-weight: 600;
    padding: 16px;
    border-radius: 14px;
    cursor: pointer;
  }
  .add.busy {
    opacity: 0.7;
  }
  .add input {
    display: none;
  }
  .msg {
    margin-top: 12px;
    padding: 10px 12px;
    border-radius: 10px;
    font-size: 14px;
  }
  .err {
    background: #fee2e2;
    color: #b91c1c;
  }
  .ok {
    background: #dcfce7;
    color: #166534;
  }
  .modes {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    grid-gap: 8px;
    margin-top: 16px;
  }
  .mode {
    display: block;
    background: #fff;
    border: 2px solid var(--border);
    border-radius: 12px;
    padding: 10px 6px;
    text-align: center;
  }
  .mode.on {
    border-color: var(--header);
    background: #e2e8f0;
  }
  .mode:disabled {
    opacity: 0.4;
  }
  .mode-label {
    display: block;
    font-weight: 600;
    font-size: 14px;
  }
  .mode-hint {
    display: block;
    font-size: 11px;
    color: var(--text-muted);
    margin-top: 2px;
  }
  select {
    display: block;
    width: 100%;
    margin-top: 10px;
    padding: 10px 12px;
    font-family: inherit;
    font-size: 15px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: #fff;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    grid-gap: 8px;
    margin-top: 16px;
  }
  .thumb {
    position: relative;
    border-radius: 10px;
    overflow: hidden;
    border: 3px solid transparent;
  }
  .thumb.chosen {
    border-color: var(--today-ring);
  }
  .pick {
    display: block;
    width: 100%;
    height: 110px;
    background-size: cover;
    background-position: center;
    background-color: #cbd5e1;
  }
  .tick {
    display: inline-block;
    margin-top: 80px;
    background: rgba(15, 23, 42, 0.8);
    color: #fff;
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 999px;
  }
  .del {
    position: absolute;
    top: 4px;
    right: 4px;
    background: rgba(255, 255, 255, 0.85);
    border-radius: 50%;
    width: 30px;
    height: 30px;
    font-size: 14px;
  }
  .empty {
    color: var(--text-muted);
    text-align: center;
    padding: 30px 0;
  }
  .back {
    display: block;
    text-align: center;
    margin-top: 24px;
    color: var(--text-muted);
  }
</style>

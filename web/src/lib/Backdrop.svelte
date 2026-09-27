<script>
  // Photo background, drawn over the animated sky. Settings decide the mode:
  //   sky       - nothing here, the Sky canvas shows through
  //   photo     - one chosen photo (background_photo)
  //   slideshow - every uploaded photo in turn, every background_mins
  // Photos are uploaded from a phone at /photos.
  import { api } from '../api.js';

  let { settings = {} } = $props();

  let photos = $state([]);
  let index = $state(0);

  let mode = $derived(settings.background_mode || 'sky');

  $effect(() => {
    if (mode !== 'slideshow') return;
    var load = function () {
      api
        .get('/backgrounds')
        .then(function (list) {
          photos = list;
          if (index >= list.length) index = 0;
        })
        .catch(function () {});
    };
    load();
    var mins = Number(settings.background_mins) || 15;
    var next = setInterval(function () {
      if (photos.length) index = (index + 1) % photos.length;
    }, mins * 60 * 1000);
    var refresh = setInterval(load, 5 * 60 * 1000); // pick up new uploads
    return function () {
      clearInterval(next);
      clearInterval(refresh);
    };
  });

  let current = $derived(
    mode === 'photo' ? settings.background_photo || '' : mode === 'slideshow' ? photos[index] || '' : ''
  );
</script>

{#if current}
  {#key current}
    <div class="bg" style="background-image:url('/api/backgrounds/{encodeURIComponent(current)}')"></div>
  {/key}
  <!-- Darkens the photo a touch so the white tab labels and clock stay legible. -->
  <div class="shade"></div>
{/if}

<style>
  /* background-size rather than <img object-fit> — works on the iPad's Safari 10. */
  .bg,
  .shade {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    z-index: 0;
    pointer-events: none;
  }
  .bg {
    background-color: #0f172a;
    background-position: center;
    background-size: cover;
    background-repeat: no-repeat;
    -webkit-animation: bgIn 1.5s ease;
    animation: bgIn 1.5s ease;
  }
  .shade {
    background: -webkit-linear-gradient(top, rgba(15, 23, 42, 0.45), rgba(15, 23, 42, 0.1) 30%, rgba(15, 23, 42, 0.2));
    background: linear-gradient(to bottom, rgba(15, 23, 42, 0.45), rgba(15, 23, 42, 0.1) 30%, rgba(15, 23, 42, 0.2));
  }
  @-webkit-keyframes bgIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
  @keyframes bgIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
</style>

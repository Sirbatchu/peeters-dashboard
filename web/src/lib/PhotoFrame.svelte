<script>
  // Idle slideshow: kicks in after `idleMins` of no touching, cycles photos
  // from the Mini. Any tap returns to the dashboard.
  import { api } from '../api.js';

  let { idleMins = 10 } = $props();

  let photos = $state([]);
  let active = $state(false);
  let index = $state(0);

  $effect(() => {
    let idleTimer;
    let cycler;

    const arm = () => {
      clearTimeout(idleTimer);
      if (active) return;
      idleTimer = setTimeout(async () => {
        try {
          photos = await api.get('/photos');
        } catch (e) {
          photos = [];
        }
        if (photos.length) {
          index = 0;
          active = true;
          cycler = setInterval(() => {
            index = (index + 1) % photos.length;
          }, 12000);
        } else {
          arm(); // nothing to show; keep waiting quietly
        }
      }, idleMins * 60 * 1000);
    };

    const wake = () => {
      if (active) {
        active = false;
        clearInterval(cycler);
      }
      arm();
    };

    window.addEventListener('touchstart', wake);
    window.addEventListener('mousedown', wake);
    arm();

    return () => {
      clearTimeout(idleTimer);
      clearInterval(cycler);
      window.removeEventListener('touchstart', wake);
      window.removeEventListener('mousedown', wake);
    };
  });
</script>

{#if active && photos.length}
  <div class="frame">
    <img src={'/api/photos/' + encodeURIComponent(photos[index])} alt="" />
  </div>
{/if}

<style>
  .frame {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    z-index: 200;
    background: #000;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .frame img {
    max-width: 100%;
    max-height: 100%;
    -webkit-animation: fadeIn 1.2s ease;
    animation: fadeIn 1.2s ease;
  }
  @-webkit-keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
</style>

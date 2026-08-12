<script>
  // Port of the sky canvas from the original index.html — time-of-day
  // gradient plus weather-driven stars/sun/moon/clouds/rain/snow/birds.
  let { weatherCode = 113 } = $props();

  let canvas = $state(null);

  const PERIOD_COLOURS = {
    night: ['#060818', '#0d1b4b', '#16213e'],
    dawn: ['#2c3e6b', '#b06a55', '#f5c78e'],
    morning: ['#7ec8f2', '#aedcf7', '#dff1fc'],
    midday: ['#4aa3e8', '#8ec9f0', '#cfe8fa'],
    afternoon: ['#5b9fd4', '#a3cbe8', '#e8d5b5'],
    dusk: ['#41295a', '#a24b5e', '#f0a35e']
  };

  function period() {
    const h = new Date().getHours() + new Date().getMinutes() / 60;
    if (h >= 21 || h < 5) return 'night';
    if (h < 7) return 'dawn';
    if (h < 12) return 'morning';
    if (h < 15) return 'midday';
    if (h < 19) return 'afternoon';
    return 'dusk';
  }

  function skyColours(p, code) {
    const rainy = code >= 263 && code <= 395 && !(code >= 323 && code <= 338);
    const snowy = (code >= 323 && code <= 338) || code === 227 || code === 230;
    if (rainy) return ['#1c2e40', '#2c4a62', '#4a6a8a'];
    if (snowy) return ['#8fa8b8', '#c8dce8', '#e8f4f8'];
    return PERIOD_COLOURS[p];
  }

  $effect(() => {
    const ctx = canvas.getContext('2d');
    let raf;
    let stars = [],
      birds = [],
      clouds = [],
      rain = [],
      snow = [];

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    stars = Array.from({ length: 110 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height * 0.75,
      r: Math.random() * 1.5 + 0.3,
      phase: Math.random() * Math.PI * 2,
      speed: Math.random() * 0.025 + 0.008
    }));
    birds = Array.from({ length: 5 }, (_, i) => ({
      x: -80 - i * 220,
      y: 65 + i * 30 + Math.random() * 15,
      speed: 1.3 + Math.random() * 0.9,
      wing: Math.random() * Math.PI * 2,
      size: 7 + Math.random() * 5
    }));
    clouds = Array.from({ length: 7 }, () => ({
      x: Math.random() * canvas.width,
      y: 30 + Math.random() * 200,
      w: 90 + Math.random() * 160,
      h: 38 + Math.random() * 28,
      speed: 0.12 + Math.random() * 0.22,
      op: 0.55 + Math.random() * 0.4
    }));
    rain = Array.from({ length: 90 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      len: 11 + Math.random() * 14,
      speed: 9 + Math.random() * 7,
      op: 0.25 + Math.random() * 0.45
    }));
    snow = Array.from({ length: 65 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: 1.2 + Math.random() * 3,
      speed: 0.4 + Math.random() * 1.3,
      drift: Math.random() * Math.PI * 2,
      driftSpeed: 0.01 + Math.random() * 0.02
    }));

    let frame = 0;

    function draw() {
      frame++;
      const p = period();
      const code = weatherCode;
      const colours = skyColours(p, code);
      const stops = colours
        .map((c, i) => c + ' ' + Math.round((i / (colours.length - 1)) * 100) + '%')
        .join(', ');
      document.documentElement.style.background = 'linear-gradient(to bottom, ' + stops + ')';

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const rainy = code >= 263 && code <= 395 && !(code >= 323 && code <= 338);
      const snowy = (code >= 323 && code <= 338) || code === 227 || code === 230;
      const cloudy = code >= 116;

      if (p === 'night') {
        for (const s of stars) {
          s.phase += s.speed;
          ctx.globalAlpha = 0.35 + Math.abs(Math.sin(s.phase)) * 0.65;
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        // moon
        ctx.fillStyle = '#f5f3ce';
        ctx.beginPath();
        ctx.arc(canvas.width - 130, 110, 38, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = colours[0];
        ctx.beginPath();
        ctx.arc(canvas.width - 116, 100, 34, 0, Math.PI * 2);
        ctx.fill();
      } else if (!rainy && !snowy) {
        // sun
        const sunY = { dawn: 220, morning: 140, midday: 90, afternoon: 130, dusk: 230 }[p] || 140;
        const g = ctx.createRadialGradient(
          canvas.width - 150, sunY, 10, canvas.width - 150, sunY, 90
        );
        g.addColorStop(0, 'rgba(255,236,160,0.95)');
        g.addColorStop(1, 'rgba(255,236,160,0)');
        ctx.fillStyle = g;
        ctx.fillRect(canvas.width - 260, sunY - 110, 220, 220);
        ctx.fillStyle = '#ffe9a0';
        ctx.beginPath();
        ctx.arc(canvas.width - 150, sunY, 34, 0, Math.PI * 2);
        ctx.fill();
      }

      if (cloudy || rainy || snowy) {
        for (const c of clouds) {
          c.x += c.speed;
          if (c.x - c.w > canvas.width) c.x = -c.w;
          ctx.globalAlpha = c.op * (rainy ? 0.9 : 0.75);
          ctx.fillStyle = rainy ? '#5a7185' : '#ffffff';
          ctx.beginPath();
          ctx.ellipse(c.x, c.y, c.w / 2, c.h / 2, 0, 0, Math.PI * 2);
          ctx.ellipse(c.x - c.w / 4, c.y + 6, c.w / 3, c.h / 2.4, 0, 0, Math.PI * 2);
          ctx.ellipse(c.x + c.w / 4, c.y + 4, c.w / 3, c.h / 2.6, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      if (rainy) {
        ctx.strokeStyle = 'rgba(174,214,241,0.7)';
        ctx.lineWidth = 1.4;
        for (const d of rain) {
          d.y += d.speed;
          d.x -= d.speed * 0.18;
          if (d.y > canvas.height) {
            d.y = -20;
            d.x = Math.random() * (canvas.width + 100);
          }
          ctx.globalAlpha = d.op;
          ctx.beginPath();
          ctx.moveTo(d.x, d.y);
          ctx.lineTo(d.x - d.len * 0.18, d.y + d.len);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      if (snowy) {
        ctx.fillStyle = '#fff';
        for (const s of snow) {
          s.drift += s.driftSpeed;
          s.y += s.speed;
          s.x += Math.sin(s.drift) * 0.6;
          if (s.y > canvas.height) {
            s.y = -10;
            s.x = Math.random() * canvas.width;
          }
          ctx.globalAlpha = 0.65 + Math.sin(s.drift) * 0.3;
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      if (p !== 'night' && !rainy && !snowy) {
        ctx.strokeStyle = 'rgba(30,41,59,0.55)';
        ctx.lineWidth = 2;
        for (const b of birds) {
          b.x += b.speed;
          b.wing += 0.18;
          if (b.x > canvas.width + 100) b.x = -100 - Math.random() * 300;
          const flap = Math.sin(b.wing) * b.size * 0.6;
          ctx.beginPath();
          ctx.moveTo(b.x - b.size, b.y + flap);
          ctx.quadraticCurveTo(b.x - b.size / 2, b.y - b.size / 2, b.x, b.y);
          ctx.quadraticCurveTo(b.x + b.size / 2, b.y - b.size / 2, b.x + b.size, b.y + flap);
          ctx.stroke();
        }
      }

      raf = requestAnimationFrame(draw);
    }
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  });
</script>

<canvas bind:this={canvas} class="sky"></canvas>

<style>
  .sky {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    z-index: 0;
    pointer-events: none;
  }
</style>

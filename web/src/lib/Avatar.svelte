<script>
  // A kid's picture in the progress ring. Some emojis have an animated
  // version (🤖 a dancing robot, ⚡ Pikachu, 🦊 Eevee); anything else
  // shows as-is.
  // Change a kid's emoji in the kids table to switch.
  let { emoji = '⭐', size = 52 } = $props();
</script>

{#if emoji === '🤖'}
  <svg class="av robot" viewBox="0 0 64 64" width={size} height={size} aria-label="Robot">
    <g class="rb-dance">
      <g class="rb-leg rb-leg-l">
        <rect x="24" y="47" width="5" height="9" rx="2" fill="#64748b" />
        <rect x="21" y="55" width="9" height="4" rx="2" fill="#334155" />
      </g>
      <g class="rb-leg rb-leg-r">
        <rect x="35" y="47" width="5" height="9" rx="2" fill="#64748b" />
        <rect x="34" y="55" width="9" height="4" rx="2" fill="#334155" />
      </g>
      <g class="rb-arm rb-arm-l">
        <line x1="21" y1="34" x2="11" y2="41" stroke="#64748b" stroke-width="4" stroke-linecap="round" />
        <circle cx="10" cy="42" r="3" fill="#f59e0b" />
      </g>
      <g class="rb-arm rb-arm-r">
        <line x1="43" y1="34" x2="53" y2="41" stroke="#64748b" stroke-width="4" stroke-linecap="round" />
        <circle cx="54" cy="42" r="3" fill="#f59e0b" />
      </g>
      <rect x="20" y="31" width="24" height="18" rx="5" fill="#3b82f6" stroke="#1e40af" stroke-width="1.5" />
      <circle class="rb-heart" cx="32" cy="40" r="3.2" fill="#facc15" />
      <line x1="32" y1="11" x2="32" y2="4" stroke="#475569" stroke-width="2" />
      <circle class="rb-light" cx="32" cy="4" r="2.8" fill="#ef4444" />
      <rect x="17" y="10" width="30" height="21" rx="6" fill="#cbd5e1" stroke="#475569" stroke-width="1.5" />
      <g class="rb-eyes">
        <circle cx="26" cy="19" r="3.4" fill="#06b6d4" />
        <circle cx="38" cy="19" r="3.4" fill="#06b6d4" />
        <circle cx="27" cy="18" r="1" fill="#fff" />
        <circle cx="39" cy="18" r="1" fill="#fff" />
      </g>
      <path d="M26 25 Q32 29 38 25" stroke="#475569" stroke-width="2" fill="none" stroke-linecap="round" />
    </g>
  </svg>
{:else if emoji === '⚡'}
  <svg class="av pika" viewBox="0 0 64 64" width={size} height={size} aria-label="Pikachu">
    <g class="pk-hop">
      <g class="pk-tail">
        <path
          d="M44 46 L52 38 L48 36 L58 24 L50 24 L55 13 L42 28 L47 30 L40 40 Z"
          fill="#facc15"
          stroke="#a16207"
          stroke-width="1.2"
          stroke-linejoin="round"
        />
        <path d="M44 46 L40 40 L43.5 37 L47 41 Z" fill="#92400e" />
      </g>
      <g class="pk-ear pk-ear-l">
        <path d="M19 24 L8 3 L28 18 Z" fill="#facc15" stroke="#a16207" stroke-width="1.2" stroke-linejoin="round" />
        <path d="M8 3 L10.8 8.3 L13 6.8 Z" fill="#1f2937" stroke="#1f2937" stroke-width="1.6" stroke-linejoin="round" />
      </g>
      <g class="pk-ear pk-ear-r">
        <path d="M45 24 L56 3 L36 18 Z" fill="#facc15" stroke="#a16207" stroke-width="1.2" stroke-linejoin="round" />
        <path d="M56 3 L53.2 8.3 L51 6.8 Z" fill="#1f2937" stroke="#1f2937" stroke-width="1.6" stroke-linejoin="round" />
      </g>
      <ellipse cx="32" cy="36" rx="18" ry="16" fill="#fde047" stroke="#a16207" stroke-width="1.2" />
      <g class="pk-eyes">
        <circle cx="24.5" cy="32" r="3.3" fill="#1f2937" />
        <circle cx="39.5" cy="32" r="3.3" fill="#1f2937" />
        <circle cx="25.5" cy="30.8" r="1.2" fill="#fff" />
        <circle cx="40.5" cy="30.8" r="1.2" fill="#fff" />
      </g>
      <ellipse cx="32" cy="36.2" rx="1" ry="0.7" fill="#1f2937" />
      <path d="M28 39 Q30 41.5 32 39 Q34 41.5 36 39" stroke="#1f2937" stroke-width="1.3" fill="none" stroke-linecap="round" />
      <circle class="pk-cheek" cx="19.5" cy="39" r="3.8" fill="#ef4444" />
      <circle class="pk-cheek" cx="44.5" cy="39" r="3.8" fill="#ef4444" />
      <path class="pk-zap pk-zap-l" d="M12 34 L9 38 L12 38 L8 44" stroke="#f59e0b" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round" />
      <path class="pk-zap pk-zap-r" d="M52 34 L55 38 L52 38 L56 44" stroke="#f59e0b" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round" />
    </g>
  </svg>
{:else if emoji === '🦊'}
  <svg class="av eevee" viewBox="0 0 64 64" width={size} height={size} aria-label="Eevee">
    <g class="ev-sway">
      <g class="ev-tail">
        <path
          d="M45 50 Q56 48 59 38 Q60 30 55 26 Q56 34 50 38 Q46 41 43 46 Z"
          fill="#b8763a"
          stroke="#7c4a1e"
          stroke-width="1.2"
          stroke-linejoin="round"
        />
        <path d="M55 26 Q60 30 59 38 Q57 34 53 33 Q56 30 55 26 Z" fill="#fdf3dc" />
      </g>
      <g class="ev-ear ev-ear-l">
        <path d="M23 27 Q9 18 6 2 Q19 6 29 21 Z" fill="#b8763a" stroke="#7c4a1e" stroke-width="1.2" stroke-linejoin="round" />
        <path d="M21 23 Q12 16 10 7 Q18 11 25 20 Z" fill="#6b3e1f" />
      </g>
      <g class="ev-ear ev-ear-r">
        <path d="M41 27 Q55 18 58 2 Q45 6 35 21 Z" fill="#b8763a" stroke="#7c4a1e" stroke-width="1.2" stroke-linejoin="round" />
        <path d="M43 23 Q52 16 54 7 Q46 11 39 20 Z" fill="#6b3e1f" />
      </g>
      <path
        class="ev-mane"
        d="M17 43 Q12 53 21 55 Q22 61 29 58 Q32 63 35 58 Q42 61 43 55 Q52 53 47 43 Z"
        fill="#fdf3dc"
        stroke="#d6b98a"
        stroke-width="1.2"
        stroke-linejoin="round"
      />
      <ellipse cx="32" cy="36" rx="15.5" ry="13.5" fill="#b8763a" stroke="#7c4a1e" stroke-width="1.2" />
      <path d="M28 24 Q32 21 36 24 Q32 26 28 24 Z" fill="#9a5f2c" />
      <g class="ev-eyes">
        <circle cx="25.5" cy="35" r="3.6" fill="#3b1f0e" />
        <circle cx="38.5" cy="35" r="3.6" fill="#3b1f0e" />
        <circle cx="26.7" cy="33.6" r="1.3" fill="#fff" />
        <circle cx="39.7" cy="33.6" r="1.3" fill="#fff" />
      </g>
      <ellipse cx="32" cy="39.6" rx="1.2" ry="0.8" fill="#3b1f0e" />
      <path d="M29.5 41.5 Q31 43.2 32 41.5 Q33 43.2 34.5 41.5" stroke="#3b1f0e" stroke-width="1.2" fill="none" stroke-linecap="round" />
    </g>
  </svg>
{:else}
  <span class="av-emoji" style="font-size:{Math.round(size * 0.58)}px">{emoji}</span>
{/if}

<style>
  .av {
    display: block;
    overflow: visible;
  }
  .av-emoji {
    line-height: 1;
  }
  /* SVG parts rotate around points given in viewBox units (px). */

  /* ── Robot: sways side to side, arms pump, legs step, light blinks ── */
  .rb-dance {
    -webkit-transform-origin: 32px 58px;
    transform-origin: 32px 58px;
    -webkit-animation: rb-sway 1.2s ease-in-out infinite;
    animation: rb-sway 1.2s ease-in-out infinite;
  }
  .rb-arm-l {
    -webkit-transform-origin: 21px 34px;
    transform-origin: 21px 34px;
    -webkit-animation: rb-arm-l 0.6s ease-in-out infinite alternate;
    animation: rb-arm-l 0.6s ease-in-out infinite alternate;
  }
  .rb-arm-r {
    -webkit-transform-origin: 43px 34px;
    transform-origin: 43px 34px;
    -webkit-animation: rb-arm-r 0.6s ease-in-out infinite alternate;
    animation: rb-arm-r 0.6s ease-in-out infinite alternate;
  }
  .rb-leg-l {
    -webkit-animation: rb-step 0.6s ease-in-out infinite alternate;
    animation: rb-step 0.6s ease-in-out infinite alternate;
  }
  .rb-leg-r {
    -webkit-animation: rb-step 0.6s ease-in-out -0.6s infinite alternate;
    animation: rb-step 0.6s ease-in-out -0.6s infinite alternate;
  }
  .rb-light {
    -webkit-animation: rb-blink 0.6s steps(1) infinite;
    animation: rb-blink 0.6s steps(1) infinite;
  }
  .rb-eyes {
    -webkit-transform-origin: 32px 19px;
    transform-origin: 32px 19px;
    -webkit-animation: blink 3.5s infinite;
    animation: blink 3.5s infinite;
  }
  @-webkit-keyframes rb-sway {
    0%, 100% { -webkit-transform: rotate(-8deg); }
    50% { -webkit-transform: rotate(8deg) translateY(-1px); }
  }
  @keyframes rb-sway {
    0%, 100% { transform: rotate(-8deg); }
    50% { transform: rotate(8deg) translateY(-1px); }
  }
  @-webkit-keyframes rb-arm-l {
    from { -webkit-transform: rotate(10deg); }
    to { -webkit-transform: rotate(75deg); }
  }
  @keyframes rb-arm-l {
    from { transform: rotate(10deg); }
    to { transform: rotate(75deg); }
  }
  @-webkit-keyframes rb-arm-r {
    from { -webkit-transform: rotate(-75deg); }
    to { -webkit-transform: rotate(-10deg); }
  }
  @keyframes rb-arm-r {
    from { transform: rotate(-75deg); }
    to { transform: rotate(-10deg); }
  }
  @-webkit-keyframes rb-step {
    from { -webkit-transform: translateY(0); }
    to { -webkit-transform: translateY(-3px); }
  }
  @keyframes rb-step {
    from { transform: translateY(0); }
    to { transform: translateY(-3px); }
  }
  @-webkit-keyframes rb-blink {
    0% { fill: #ef4444; }
    50% { fill: #facc15; }
  }
  @keyframes rb-blink {
    0% { fill: #ef4444; }
    50% { fill: #facc15; }
  }

  /* ── Pikachu: hops, ears twitch, tail wags, cheeks spark ── */
  .pk-hop {
    -webkit-transform-origin: 32px 52px;
    transform-origin: 32px 52px;
    -webkit-animation: pk-hop 1.6s ease-in-out infinite;
    animation: pk-hop 1.6s ease-in-out infinite;
  }
  .pk-tail {
    -webkit-transform-origin: 44px 46px;
    transform-origin: 44px 46px;
    -webkit-animation: pk-wag 0.8s ease-in-out infinite alternate;
    animation: pk-wag 0.8s ease-in-out infinite alternate;
  }
  .pk-ear-l {
    -webkit-transform-origin: 22px 22px;
    transform-origin: 22px 22px;
    -webkit-animation: pk-ear-l 2.4s ease-in-out infinite;
    animation: pk-ear-l 2.4s ease-in-out infinite;
  }
  .pk-ear-r {
    -webkit-transform-origin: 42px 22px;
    transform-origin: 42px 22px;
    -webkit-animation: pk-ear-r 2.4s ease-in-out 0.3s infinite;
    animation: pk-ear-r 2.4s ease-in-out 0.3s infinite;
  }
  .pk-eyes {
    -webkit-transform-origin: 32px 32px;
    transform-origin: 32px 32px;
    -webkit-animation: blink 4s infinite;
    animation: blink 4s infinite;
  }
  .pk-zap {
    opacity: 0;
    -webkit-animation: pk-zap 1.6s infinite;
    animation: pk-zap 1.6s infinite;
  }
  .pk-zap-r {
    -webkit-animation-delay: 0.8s;
    animation-delay: 0.8s;
  }
  @-webkit-keyframes pk-hop {
    0%, 55%, 100% { -webkit-transform: translateY(0) rotate(0); }
    20% { -webkit-transform: translateY(-4px) rotate(-5deg); }
    38% { -webkit-transform: translateY(0) rotate(4deg); }
  }
  @keyframes pk-hop {
    0%, 55%, 100% { transform: translateY(0) rotate(0); }
    20% { transform: translateY(-4px) rotate(-5deg); }
    38% { transform: translateY(0) rotate(4deg); }
  }
  @-webkit-keyframes pk-wag {
    from { -webkit-transform: rotate(-8deg); }
    to { -webkit-transform: rotate(10deg); }
  }
  @keyframes pk-wag {
    from { transform: rotate(-8deg); }
    to { transform: rotate(10deg); }
  }
  @-webkit-keyframes pk-ear-l {
    0%, 70%, 100% { -webkit-transform: rotate(0); }
    78% { -webkit-transform: rotate(-12deg); }
    86% { -webkit-transform: rotate(4deg); }
  }
  @keyframes pk-ear-l {
    0%, 70%, 100% { transform: rotate(0); }
    78% { transform: rotate(-12deg); }
    86% { transform: rotate(4deg); }
  }
  @-webkit-keyframes pk-ear-r {
    0%, 70%, 100% { -webkit-transform: rotate(0); }
    78% { -webkit-transform: rotate(12deg); }
    86% { -webkit-transform: rotate(-4deg); }
  }
  @keyframes pk-ear-r {
    0%, 70%, 100% { transform: rotate(0); }
    78% { transform: rotate(12deg); }
    86% { transform: rotate(-4deg); }
  }
  @-webkit-keyframes pk-zap {
    0%, 30%, 100% { opacity: 0; }
    10%, 20% { opacity: 1; }
  }
  @keyframes pk-zap {
    0%, 30%, 100% { opacity: 0; }
    10%, 20% { opacity: 1; }
  }

  /* ── Eevee: tilts its head, flicks its ears, wags its fluffy tail ── */
  .ev-sway {
    -webkit-transform-origin: 32px 56px;
    transform-origin: 32px 56px;
    -webkit-animation: ev-sway 3s ease-in-out infinite;
    animation: ev-sway 3s ease-in-out infinite;
  }
  .ev-tail {
    -webkit-transform-origin: 45px 50px;
    transform-origin: 45px 50px;
    -webkit-animation: pk-wag 0.7s ease-in-out infinite alternate;
    animation: pk-wag 0.7s ease-in-out infinite alternate;
  }
  .ev-ear-l {
    -webkit-transform-origin: 26px 24px;
    transform-origin: 26px 24px;
    -webkit-animation: pk-ear-l 2.8s ease-in-out infinite;
    animation: pk-ear-l 2.8s ease-in-out infinite;
  }
  .ev-ear-r {
    -webkit-transform-origin: 38px 24px;
    transform-origin: 38px 24px;
    -webkit-animation: pk-ear-r 2.8s ease-in-out 1.2s infinite;
    animation: pk-ear-r 2.8s ease-in-out 1.2s infinite;
  }
  .ev-eyes {
    -webkit-transform-origin: 32px 35px;
    transform-origin: 32px 35px;
    -webkit-animation: blink 3.8s infinite;
    animation: blink 3.8s infinite;
  }
  @-webkit-keyframes ev-sway {
    0%, 100% { -webkit-transform: rotate(-6deg); }
    50% { -webkit-transform: rotate(6deg) translateY(-1px); }
  }
  @keyframes ev-sway {
    0%, 100% { transform: rotate(-6deg); }
    50% { transform: rotate(6deg) translateY(-1px); }
  }

  @-webkit-keyframes blink {
    0%, 92%, 100% { -webkit-transform: scaleY(1); }
    96% { -webkit-transform: scaleY(0.1); }
  }
  @keyframes blink {
    0%, 92%, 100% { transform: scaleY(1); }
    96% { transform: scaleY(0.1); }
  }
</style>

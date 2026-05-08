<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';

const GLYPHS = '01░▒▓│┃┊┋╱╲┄┈⏤■▪◾◆◇✦✧※†‡¦¬'.split('');
const BOOT_LINES = [
  '> stormdestroyer.boot init',
  '[OK] core.subsystem online',
  '[OK] linking weather.dsp …',
  '[ ] frequency band 124 hz : tuning',
  '[OK] charge accumulator @ 87%',
  '[OK] handshake with cumulonimbus.7',
  '... preparing payload',
  '> awaiting input',
];

const stageRef  = ref(null);
const canvasRef = ref(null);

const w       = ref(window.innerWidth);
const h0      = ref(window.innerHeight);
const px      = ref(w.value / 2);
const py      = ref(h0.value / 2);
const inside  = ref(false);

const bolts   = ref([]);
const keyEcho = ref([]);
const flash   = ref(0);
const bootIdx = ref(0);
const audioOn = ref(false);
const tickSec = ref(0);

let drops = [];
let raf, bootTimer, tickTimer, off;

function resize() {
  w.value  = window.innerWidth;
  h0.value = window.innerHeight;
  const c = canvasRef.value;
  if (c) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width  = w.value  * dpr;
    c.height = h0.value * dpr;
    c.style.width  = w.value  + 'px';
    c.style.height = h0.value + 'px';
    c.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  seedDrops();
}
function seedDrops() {
  const cols = Math.max(20, Math.floor(w.value / 14));
  drops = [];
  for (let i = 0; i < cols; i++) {
    drops.push({
      x: i * 14 + 8,
      y: Math.random() * h0.value,
      v: 60 + Math.random() * 220,
      ch: GLYPHS[Math.floor(Math.random() * GLYPHS.length)],
      alpha: 0.3 + Math.random() * 0.6,
    });
  }
}
function onMove(e)  { px.value = e.clientX; py.value = e.clientY; inside.value = true; }
function onLeave()  { inside.value = false; }
function onDown(e)  {
  if (e.target?.closest?.('.sound-toggle, a')) return;
  summonBolt(e.clientX, e.clientY);
}
function onTouch(e) {
  if (!e.touches.length) return;
  const t = e.touches[0];
  px.value = t.clientX; py.value = t.clientY; inside.value = true;
  if (e.type === 'touchstart') {
    if (e.target?.closest?.('.sound-toggle, a')) return;
    e.preventDefault();
    summonBolt(t.clientX, t.clientY);
  }
}
function onKey(e) {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key.length === 1) {
    const id = Math.random();
    keyEcho.value = [...keyEcho.value.slice(-12), { id, ch: e.key.toUpperCase() }];
    setTimeout(() => { keyEcho.value = keyEcho.value.filter(k => k.id !== id); }, 900);
    summonBolt(px.value + (Math.random() - 0.5) * 60, inside.value ? py.value : 80);
  }
}
function summonBolt(x) {
  const points = [[x, 0]];
  let cx = x, cy = 0;
  while (cy < h0.value) {
    cy += 18 + Math.random() * 30;
    cx += (Math.random() - 0.5) * 60;
    points.push([cx, cy]);
  }
  const id = Math.random();
  bolts.value = [...bolts.value.slice(-5), { id, points, t: Date.now() }];
  flash.value = 1;
  setTimeout(() => { flash.value = 0; }, 80);
  setTimeout(() => { bolts.value = bolts.value.filter(b => b.id !== id); }, 600);
  if (window.SDAudio?.isEnabled()) {
    window.SDAudio.thunder(0, 0.95);
  }
}
function toggleSound() {
  if (!window.SDAudio) return;
  window.SDAudio.setEnabled(!window.SDAudio.isEnabled());
}
function boltPath(points) {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ');
}
function startRender() {
  const c = canvasRef.value;
  if (!c) return;
  const ctx = c.getContext('2d');
  let last = performance.now();
  const step = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    ctx.fillStyle = 'rgba(7,7,10,0.22)';
    ctx.fillRect(0, 0, w.value, h0.value);
    ctx.font = '14px "JetBrains Mono", ui-monospace, monospace';
    ctx.textBaseline = 'top';
    for (let i = 0; i < drops.length; i++) {
      const d = drops[i];
      d.y += d.v * dt;
      if (d.y > h0.value + 12) {
        d.y = -12;
        d.v = 60 + Math.random() * 220;
        d.ch = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
        d.alpha = 0.3 + Math.random() * 0.6;
      }
      const dx = px.value - d.x, dy = py.value - d.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const reveal = inside.value ? Math.max(0, 1 - dist / 200) : 0;
      const a = d.alpha * (1 - reveal);
      if (a < 0.02) continue;
      ctx.fillStyle = `rgba(255,80,120,${a * 0.18})`;  ctx.fillText(d.ch, d.x - 1.5, d.y);
      ctx.fillStyle = `rgba(80,200,255,${a * 0.18})`;  ctx.fillText(d.ch, d.x + 1.5, d.y);
      const tip = i % 12 === Math.floor(now / 200) % 12;
      ctx.fillStyle = tip ? `rgba(201,255,58,${a})` : `rgba(180,180,180,${a * 0.85})`;
      ctx.fillText(d.ch, d.x, d.y);
      if (Math.random() < 0.005) d.ch = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
    }
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
}

onMounted(() => {
  resize();
  startRender();
  bootTimer = setInterval(() => {
    if (bootIdx.value < BOOT_LINES.length) bootIdx.value++;
    else clearInterval(bootTimer);
  }, 360);
  tickTimer = setInterval(() => { tickSec.value = (tickSec.value + 1) % 9999; }, 1000);
  window.addEventListener('resize', resize);
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseleave', onLeave);
  window.addEventListener('mousedown', onDown);
  window.addEventListener('keydown', onKey);
  window.addEventListener('touchstart', onTouch, { passive: false });
  window.addEventListener('touchmove',  onTouch, { passive: false });
  if (window.SDAudio) off = window.SDAudio.onChange(v => { audioOn.value = v; });
});
onBeforeUnmount(() => {
  cancelAnimationFrame(raf);
  clearInterval(bootTimer);
  clearInterval(tickTimer);
  window.removeEventListener('resize', resize);
  window.removeEventListener('mousemove', onMove);
  window.removeEventListener('mouseleave', onLeave);
  window.removeEventListener('mousedown', onDown);
  window.removeEventListener('keydown', onKey);
  window.removeEventListener('touchstart', onTouch);
  window.removeEventListener('touchmove',  onTouch);
  off?.();
});

const wordmarkSize = computed(() => {
  const base = Math.min(w.value / 13.5, h0.value / 4.5);
  return Math.max(48, Math.min(220, base));
});
const revealCx = computed(() => (px.value / w.value).toFixed(4));
const revealCy = computed(() => (py.value / h0.value).toFixed(4));
const tickStr  = computed(() => String(tickSec.value).padStart(4, '0'));
</script>

<template>
  <div class="stage" ref="stageRef">
    <canvas ref="canvasRef"></canvas>

    <svg class="wordmark layer" :viewBox="`0 0 ${w} ${h0}`" :width="w" :height="h0"
         style="mix-blend-mode: screen;" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <defs>
        <radialGradient id="sd-reveal" :cx="revealCx" :cy="revealCy" r="0.22">
          <stop offset="0%" stop-color="#fff" stop-opacity="1" />
          <stop offset="100%" stop-color="#fff" stop-opacity="0" />
        </radialGradient>
        <mask id="sd-mask">
          <rect :width="w" :height="h0" :fill="inside ? 'url(#sd-reveal)' : '#000'" />
        </mask>
      </defs>
      <g mask="url(#sd-mask)">
        <text :x="w/2" :y="h0/2" text-anchor="middle" dominant-baseline="middle"
              :style="{ fontSize: wordmarkSize + 'px', fill: '#c9ff3a' }">STORMDESTROYER</text>
      </g>
    </svg>

    <svg class="wordmark layer" :viewBox="`0 0 ${w} ${h0}`" :width="w" :height="h0"
         preserveAspectRatio="xMidYMid meet" aria-label="STORMDESTROYER">
      <text :x="w/2" :y="h0/2" text-anchor="middle" dominant-baseline="middle"
            :style="{ fontSize: wordmarkSize + 'px', fill: 'rgba(232,230,224,0.04)' }">STORMDESTROYER</text>
    </svg>

    <svg class="layer" :viewBox="`0 0 ${w} ${h0}`" :width="w" :height="h0">
      <g v-for="b in bolts" :key="b.id" :opacity="Math.max(0, 1 - (Date.now() - b.t)/600)">
        <path :d="boltPath(b.points)" stroke="#c9ff3a" stroke-width="6"   fill="none" opacity="0.18" />
        <path :d="boltPath(b.points)" stroke="#c9ff3a" stroke-width="2.5" fill="none" opacity="0.5" />
        <path :d="boltPath(b.points)" stroke="#fff"    stroke-width="1"   fill="none" />
      </g>
    </svg>

    <div class="layer flash" :style="{ opacity: flash * 0.18 }"></div>
    <div class="layer scanlines"></div>
    <div class="layer vignette"></div>

    <svg v-if="inside" class="layer" :viewBox="`0 0 ${w} ${h0}`" :width="w" :height="h0">
      <circle :cx="px" :cy="py" r="160" fill="rgba(201,255,58,0.04)" />
      <circle :cx="px" :cy="py" r="80"  fill="none" stroke="rgba(201,255,58,0.4)" stroke-width="0.5" stroke-dasharray="3 3" />
      <circle :cx="px" :cy="py" r="3"   fill="#c9ff3a" />
    </svg>

    <div class="boot">
      <div v-for="(line, i) in BOOT_LINES.slice(0, bootIdx)" :key="i"
           :class="{ ok: line.startsWith('[OK]'), prompt: line.startsWith('>') }">
        {{ line }}
      </div>
      <div v-if="bootIdx >= BOOT_LINES.length" class="prompt">
        ▌<span style="animation: blink 1s steps(2) infinite;">_</span>
      </div>
    </div>

    <div class="meta">
      <div>SD-TERMINAL · v0.0.1</div>
      <div class="live">● rec ─ {{ tickStr }}</div>
      <div>type. lightning.</div>
    </div>

    <div class="caption">
      <div class="caption-inner">
        <span class="arrow">►</span>
        type any key to summon
      </div>
    </div>

    <div class="key-echo">{{ keyEcho.map(k => k.ch).join(' ') }}</div>

    <button class="sound-toggle" :class="{ on: audioOn }" @click="toggleSound" :aria-pressed="audioOn">
      <span class="dot"></span>
      <span>{{ audioOn ? 'SOUND  ON' : 'SOUND  OFF' }}</span>
    </button>

    <div class="footer">
      <div>STORMDESTROYER · MMXXVI</div>
      <div>soon.</div>
    </div>
  </div>
</template>

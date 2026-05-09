<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue';

const PLAYLIST_URL = 'https://soundcloud.com/user-691786494/sets/stormdestroyer';
const SC_WIDGET_SRC = `https://w.soundcloud.com/player/?url=${encodeURIComponent(PLAYLIST_URL)}&visual=false&hide_related=true&show_comments=false&show_user=false&show_reposts=false&show_teaser=false&buying=false&sharing=false&liking=false&download=false&show_artwork=false&auto_play=false`;

const LS_SOUND_ON = 'sd:sound:on';
const LS_MUSIC_PLAYING = 'sd:music:wasPlaying';
const lsRead = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsWrite = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

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

const playing = ref(false);
const trackTitle = ref('');
const trackArtist = ref('');
const trackText = computed(() => {
  const t = trackTitle.value;
  const a = trackArtist.value;
  if (t && a) return `${t} · ${a}`;
  return t || a || 'loading…';
});
const titleEl = ref(null);
const iframeRef = ref(null);
const shouldScroll = ref(false);
const marqueeDistance = ref('100%');
const marqueeDuration = ref('14s');

let widget = null;
let widgetReady = false;
let pendingAutoPlay = lsRead(LS_MUSIC_PLAYING) === '1';
let muteByMaster = false; // true when widget.pause() is triggered by sound-off (not user)
let drops = [];
let litPixels = [];
let particles = [];
const WORDMARK_HOVER_RADIUS = 140;
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
  buildLitPixels();
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

// Render the wordmark to an offscreen canvas at current size and sample lit pixels
// at a coarse grid. Used as spawn points for shedding particles on hover.
async function buildLitPixels() {
  if (reducedMotion()) { litPixels = []; return; }
  const W = w.value, H = h0.value;
  if (!W || !H) { litPixels = []; return; }
  const fontSpec = `bold ${wordmarkSize.value}px "JetBrains Mono", ui-monospace, monospace`;
  if (document.fonts && !document.fonts.check(fontSpec)) {
    try { await document.fonts.ready; } catch {}
  }
  const off = document.createElement('canvas');
  off.width = W; off.height = H;
  const c = off.getContext('2d');
  c.font = fontSpec;
  try { c.letterSpacing = `${wordmarkSize.value * 0.04}px`; } catch {}
  c.fillStyle = '#fff';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText('STORMDESTROYER', W / 2, H / 2);
  const data = c.getImageData(0, 0, W, H).data;
  const pixels = [];
  const grid = 5;
  for (let y = 0; y < H; y += grid) {
    for (let x = 0; x < W; x += grid) {
      const i = (y * W + x) * 4;
      if (data[i + 3] > 180) pixels.push({ x, y });
    }
  }
  litPixels = pixels;
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
  if (!reducedMotion()) {
    flash.value = 1;
    setTimeout(() => { flash.value = 0; }, 80);
  }
  setTimeout(() => { bolts.value = bolts.value.filter(b => b.id !== id); }, 600);
  if (window.SDAudio?.isEnabled()) {
    window.SDAudio.thunder(0, 0.95);
  }
}
function toggleSound() {
  if (!window.SDAudio) return;
  window.SDAudio.setEnabled(!window.SDAudio.isEnabled());
}

function ensureSCApi() {
  return new Promise((resolve) => {
    if (window.SC && window.SC.Widget) return resolve();
    const t0 = Date.now();
    const check = () => {
      if (window.SC && window.SC.Widget) return resolve();
      if (Date.now() - t0 > 5000) return resolve(); // give up after 5s
      setTimeout(check, 60);
    };
    check();
  });
}

async function initWidget() {
  await ensureSCApi();
  if (!window.SC?.Widget || !iframeRef.value) return;
  widget = window.SC.Widget(iframeRef.value);
  const E = window.SC.Widget.Events;
  widget.bind(E.READY, () => {
    widgetReady = true;
    updateTrackInfo();
    if (pendingAutoPlay && audioOn.value) {
      try { widget.play(); } catch {}
    }
    pendingAutoPlay = false;
  });
  widget.bind(E.PLAY, () => {
    playing.value = true;
    lsWrite(LS_MUSIC_PLAYING, '1');
    updateTrackInfo();
  });
  widget.bind(E.PAUSE, () => {
    playing.value = false;
    if (!muteByMaster) lsWrite(LS_MUSIC_PLAYING, '0');
    muteByMaster = false;
  });
  widget.bind(E.FINISH, () => {
    // SC widget auto-advances mid-playlist on its own. We only intervene at
    // the end to loop back to the first track.
    if (!widget) return;
    widget.getCurrentSoundIndex((curIdx) => {
      widget.getSounds((sounds) => {
        if (!sounds || sounds.length === 0) return;
        if (curIdx >= sounds.length - 1) {
          widget.skip(0);
          setTimeout(() => { try { widget.play(); } catch {} }, 150);
        }
      });
    });
  });
}

function updateTrackInfo() {
  if (!widget) return;
  widget.getCurrentSound((sound) => {
    if (!sound) return;
    trackTitle.value = sound.title || '';
    trackArtist.value = sound.user?.username || sound.publisher_metadata?.artist || '';
    nextTick(() => measureTitle());
  });
}

function measureTitle() {
  const span = titleEl.value;
  if (!span) return;
  const textW = span.scrollWidth;
  if (!textW) return;
  const gap = 32;
  const totalDist = textW + gap;
  const speed = 28; // px per second
  shouldScroll.value = true; // always scroll, even when text fits
  marqueeDistance.value = `${totalDist}px`;
  marqueeDuration.value = `${Math.max(7, totalDist / speed)}s`;
}

function togglePlay() {
  if (!widget || !widgetReady) return;
  widget.toggle();
}
function nextTrack() {
  if (!widget || !widgetReady) return;
  widget.next();
}
function prevTrack() {
  if (!widget || !widgetReady) return;
  widget.prev();
}
function boltPath(points) {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ');
}
function startRender() {
  const c = canvasRef.value;
  if (!c) return;
  if (reducedMotion()) return; // skip the rain RAF loop entirely
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

    // Wordmark shedding: spawn particles from lit letter pixels near cursor
    if (inside.value && litPixels.length > 0) {
      const r2 = WORDMARK_HOVER_RADIUS * WORDMARK_HOVER_RADIUS;
      let spawned = 0;
      for (let attempt = 0; attempt < 12 && spawned < 3; attempt++) {
        const cand = litPixels[Math.floor(Math.random() * litPixels.length)];
        const ddx = cand.x - px.value;
        const ddy = cand.y - py.value;
        if (ddx * ddx + ddy * ddy < r2) {
          particles.push({
            x: cand.x + (Math.random() - 0.5) * 3,
            y: cand.y + (Math.random() - 0.5) * 3,
            vx: (Math.random() - 0.5) * 35,
            vy: 20 + Math.random() * 60,
            age: 0,
            life: 1.4 + Math.random() * 0.8,
          });
          spawned++;
        }
      }
    }

    // Update + render falling particles
    const grav = 520;
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.vy += grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.age += dt;
      if (p.age >= p.life || p.y > h0.value + 20) {
        particles.splice(i, 1);
        continue;
      }
      const a = Math.max(0, 1 - p.age / p.life);
      ctx.fillStyle = `rgba(201, 255, 58, ${a * 0.22})`;
      ctx.fillRect(p.x - 1.5, p.y - 1.5, 7, 7);
      ctx.fillStyle = `rgba(201, 255, 58, ${a * 0.95})`;
      ctx.fillRect(p.x, p.y, 4, 4);
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
  if (window.SDAudio) {
    off = window.SDAudio.onChange(v => { audioOn.value = v; });
    if (lsRead(LS_SOUND_ON) === '1') window.SDAudio.setEnabled(true);
  }
  nextTick(() => initWidget());
});

watch(audioOn, (on) => {
  lsWrite(LS_SOUND_ON, on ? '1' : '0');
  if (!on && playing.value && widget) {
    muteByMaster = true;
    try { widget.pause(); } catch {}
  }
  if (on) nextTick(() => measureTitle());
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

    <svg v-if="inside" class="layer cursor-layer" :viewBox="`0 0 ${w} ${h0}`" :width="w" :height="h0">
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

    <div class="key-echo">{{ keyEcho.map(k => k.ch).join(' ') }}</div>

    <div class="sound-toggle" :class="{ on: audioOn, expanded: audioOn }">
      <button class="sound-btn" @click="toggleSound" :aria-pressed="audioOn">
        <span class="dot"></span>
        <span>{{ audioOn ? 'SOUND  ON' : 'SOUND  OFF' }}</span>
      </button>

      <div class="player" v-if="audioOn">
        <span class="divider" aria-hidden="true"></span>
        <button class="ctrl" @click="prevTrack" aria-label="Previous track" title="Previous">⏮</button>
        <button class="ctrl ctrl-play" @click="togglePlay" :aria-label="playing ? 'Pause' : 'Play'" :title="playing ? 'Pause' : 'Play'">
          <span v-if="playing">⏸</span>
          <span v-else>▶</span>
        </button>
        <button class="ctrl" @click="nextTrack" aria-label="Next track" title="Next">⏭</button>
        <span class="divider" aria-hidden="true"></span>
        <div class="eq" :class="{ playing }" aria-hidden="true">
          <span></span><span></span><span></span><span></span>
        </div>
        <div class="track-title">
          <div class="track-title-inner" :class="{ scrolling: shouldScroll }"
               :style="{ '--marquee-distance': marqueeDistance, '--marquee-duration': marqueeDuration }">
            <span ref="titleEl">{{ trackText }}</span>
            <span aria-hidden="true">{{ trackText }}</span>
          </div>
        </div>
      </div>

      <iframe ref="iframeRef" class="sc-iframe" allow="autoplay" :src="SC_WIDGET_SRC"
              aria-hidden="true" tabindex="-1" title="SoundCloud player"></iframe>
    </div>

    <div class="footer">
      <div>STORMDESTROYER · MMXXVI · SOON.</div>
    </div>
  </div>
</template>

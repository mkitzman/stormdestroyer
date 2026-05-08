// audio.jsx — tiny Web Audio engine for Stormdestroyer concepts.
// One shared AudioContext, lazy-init on first user gesture, exposed via window.SDAudio.
// Each concept calls a primitive (kick, sub, hat, stab, drone, pluck, thunder, tick).

(function () {
  let ctx = null;
  let master = null;
  let comp = null;
  let analyser = null;
  let enabled = false;
  let listeners = new Set();
  let droneNode = null;

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.knee.value = 8;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.25;
    master = ctx.createGain();
    master.gain.value = 0;
    analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    comp.connect(master).connect(analyser).connect(ctx.destination);
    return ctx;
  }

  function setEnabled(v) {
    ensure();
    enabled = !!v;
    if (ctx.state === 'suspended') ctx.resume();
    const t = ctx.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.linearRampToValueAtTime(enabled ? 0.7 : 0, t + 0.15);
    listeners.forEach((cb) => cb(enabled));
  }

  function isEnabled() { return enabled; }
  function onChange(cb) { listeners.add(cb); return () => listeners.delete(cb); }

  // ── primitives ──────────────────────────────────────────────────
  function kick(t = 0, vel = 1) {
    if (!enabled) return;
    ensure();
    const now = ctx.currentTime + t;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(36, now + 0.18);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.95 * vel, now + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
    osc.connect(g).connect(comp);
    osc.start(now); osc.stop(now + 0.5);
    // click layer
    const c = ctx.createOscillator();
    const cg = ctx.createGain();
    c.type = 'triangle';
    c.frequency.setValueAtTime(2200, now);
    c.frequency.exponentialRampToValueAtTime(800, now + 0.02);
    cg.gain.setValueAtTime(0.25 * vel, now);
    cg.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);
    c.connect(cg).connect(comp);
    c.start(now); c.stop(now + 0.06);
  }

  function sub(t = 0, hz = 55, dur = 0.6, vel = 1) {
    if (!enabled) return;
    ensure();
    const now = ctx.currentTime + t;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(hz, now);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.6 * vel, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o.connect(g).connect(comp);
    o.start(now); o.stop(now + dur + 0.05);
  }

  function hat(t = 0, vel = 1, open = false) {
    if (!enabled) return;
    ensure();
    const now = ctx.currentTime + t;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7000;
    const g = ctx.createGain();
    const dur = open ? 0.18 : 0.045;
    g.gain.setValueAtTime(0.18 * vel, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    src.connect(hp).connect(g).connect(comp);
    src.start(now); src.stop(now + dur + 0.02);
  }

  // chord stab — minor 7 deep house
  function stab(t = 0, root = 220, vel = 1) {
    if (!enabled) return;
    ensure();
    const now = ctx.currentTime + t;
    const ratios = [1, 1.1892, 1.4983, 1.7818]; // 1, m3, p5, m7
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2400, now);
    lp.frequency.exponentialRampToValueAtTime(500, now + 0.35);
    lp.Q.value = 4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.18 * vel, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
    ratios.forEach((r) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = root * r;
      o.connect(lp);
      o.start(now); o.stop(now + 0.4);
    });
    lp.connect(g).connect(comp);
  }

  function pluck(t = 0, hz = 660, vel = 1) {
    if (!enabled) return;
    ensure();
    const now = ctx.currentTime + t;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(hz, now);
    o.frequency.exponentialRampToValueAtTime(hz * 0.98, now + 0.18);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.18 * vel, now + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    o.connect(g).connect(comp);
    o.start(now); o.stop(now + 0.2);
  }

  function tick(t = 0, vel = 0.4) {
    if (!enabled) return;
    ensure();
    const now = ctx.currentTime + t;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'square';
    o.frequency.value = 1800;
    g.gain.setValueAtTime(0.05 * vel, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.012);
    o.connect(g).connect(comp);
    o.start(now); o.stop(now + 0.02);
  }

  // Lightning strike: 4 layered noise voices designed to sound like real thunder.
  // (1) CRACK   – bright HF snap of superheated air at the bolt
  // (2) BOOM    – mid-band pressure punch right after the strike
  // (3) RUMBLE  – long low-pass tail with 3-4 random amplitude swells (rolling thunder)
  // (4) ECHO    – delayed, low-passed copy of the rumble for "rolling across the sky" feel
  function thunder(t = 0, vel = 1) {
    if (!enabled) return;
    ensure();
    const now = ctx.currentTime + t;
    const sr = ctx.sampleRate;
    const noise = (dur) => {
      const buf = ctx.createBuffer(1, Math.max(1, Math.floor(sr * dur)), sr);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      return buf;
    };

    // (1) CRACK — one dominant strike + faint rip tails for tearing texture
    const crackHp = ctx.createBiquadFilter();
    crackHp.type = 'highpass';
    crackHp.frequency.value = 1200;
    const crackPeak1 = ctx.createBiquadFilter();
    crackPeak1.type = 'peaking';
    crackPeak1.frequency.value = 7000; // piercing top-end
    crackPeak1.Q.value = 0.9;
    crackPeak1.gain.value = 12;
    const crackPeak2 = ctx.createBiquadFilter();
    crackPeak2.type = 'peaking';
    crackPeak2.frequency.value = 3200; // rip/tear band
    crackPeak2.Q.value = 1.0;
    crackPeak2.gain.value = 6;
    crackHp.connect(crackPeak1).connect(crackPeak2).connect(comp);

    // MAIN CRACK — long, dominant, instant attack
    const mainDur = 0.12;
    const mainSrc = ctx.createBufferSource();
    mainSrc.buffer = noise(mainDur);
    const mainG = ctx.createGain();
    mainG.gain.setValueAtTime(0.95 * vel, now); // no attack ramp — strike is instant
    mainG.gain.exponentialRampToValueAtTime(0.3 * vel, now + 0.015);
    mainG.gain.exponentialRampToValueAtTime(0.0001, now + mainDur);
    mainSrc.connect(mainG).connect(crackHp);
    mainSrc.start(now); mainSrc.stop(now + mainDur + 0.01);

    // RIP TAILS — 1-2 quiet trailing micro-bursts for tearing texture
    const tails = 1 + Math.floor(Math.random() * 2);
    for (let i = 1; i <= tails; i++) {
      const start = now + 0.04 + Math.random() * 0.05 + (i - 1) * 0.035;
      const dur = 0.025 + Math.random() * 0.02;
      const ts = ctx.createBufferSource();
      ts.buffer = noise(dur);
      const tg = ctx.createGain();
      const peak = Math.max(0.05, (0.3 - i * 0.08)) * vel;
      tg.gain.setValueAtTime(peak, start);
      tg.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      ts.connect(tg).connect(crackHp);
      ts.start(start); ts.stop(start + dur + 0.01);
    }

    // (2) BOOM — mid-band pressure punch
    const boomDur = 0.5;
    const boomSrc = ctx.createBufferSource();
    boomSrc.buffer = noise(boomDur);
    const boomBp = ctx.createBiquadFilter();
    boomBp.type = 'bandpass';
    boomBp.frequency.setValueAtTime(260, now);
    boomBp.frequency.exponentialRampToValueAtTime(90, now + boomDur);
    boomBp.Q.value = 0.9;
    const boomG = ctx.createGain();
    boomG.gain.setValueAtTime(0.0001, now);
    boomG.gain.exponentialRampToValueAtTime(0.75 * vel, now + 0.025);
    boomG.gain.exponentialRampToValueAtTime(0.0001, now + boomDur);
    boomSrc.connect(boomBp).connect(boomG).connect(comp);
    boomSrc.start(now); boomSrc.stop(now + boomDur);

    // (3) RUMBLE — long low tail with rolling amplitude swells
    const rumbleDur = 3.8;
    const rumbleSrc = ctx.createBufferSource();
    rumbleSrc.buffer = noise(rumbleDur);
    const rumbleLp = ctx.createBiquadFilter();
    rumbleLp.type = 'lowpass';
    rumbleLp.frequency.setValueAtTime(450, now);
    rumbleLp.frequency.exponentialRampToValueAtTime(50, now + rumbleDur);
    rumbleLp.Q.value = 1.0;
    const rumbleG = ctx.createGain();
    rumbleG.gain.setValueAtTime(0.0001, now);
    rumbleG.gain.exponentialRampToValueAtTime(0.55 * vel, now + 0.15);
    const rolls = 3 + Math.floor(Math.random() * 2);
    for (let i = 1; i <= rolls; i++) {
      const center = (rumbleDur / (rolls + 1)) * i + (Math.random() - 0.5) * 0.3;
      const dip = Math.max(0.001, (0.18 - i * 0.03) * vel);
      const peak = Math.max(0.001, (0.5 - i * 0.09) * vel);
      rumbleG.gain.exponentialRampToValueAtTime(dip, now + Math.max(0.2, center - 0.18));
      rumbleG.gain.exponentialRampToValueAtTime(peak, now + center);
    }
    rumbleG.gain.exponentialRampToValueAtTime(0.0001, now + rumbleDur);
    rumbleSrc.connect(rumbleLp).connect(rumbleG).connect(comp);
    rumbleSrc.start(now); rumbleSrc.stop(now + rumbleDur);

    // (4) ECHO — delayed low-passed copy of the post-envelope rumble
    const echoDelay = ctx.createDelay(1.0);
    echoDelay.delayTime.value = 0.32 + Math.random() * 0.25;
    const echoLp = ctx.createBiquadFilter();
    echoLp.type = 'lowpass';
    echoLp.frequency.value = 280;
    const echoG = ctx.createGain();
    echoG.gain.value = 0.4 * vel;
    rumbleG.connect(echoDelay).connect(echoLp).connect(echoG).connect(comp);
  }

  // continuous drone — used by chrome concept
  function startDrone(rootHz = 55) {
    if (!enabled) return;
    ensure();
    if (droneNode) return;
    const now = ctx.currentTime;
    const a = ctx.createOscillator();
    const b = ctx.createOscillator();
    const c = ctx.createOscillator();
    a.type = 'sawtooth'; b.type = 'sawtooth'; c.type = 'sine';
    a.frequency.value = rootHz;
    b.frequency.value = rootHz * 1.005;
    c.frequency.value = rootHz * 0.5;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 600;
    lp.Q.value = 3;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.07, now + 1.2);
    a.connect(lp); b.connect(lp); c.connect(lp);
    lp.connect(g).connect(comp);
    a.start(); b.start(); c.start();
    droneNode = { a, b, c, g, lp };
  }
  function stopDrone() {
    if (!droneNode || !ctx) return;
    const now = ctx.currentTime;
    droneNode.g.gain.cancelScheduledValues(now);
    droneNode.g.gain.linearRampToValueAtTime(0, now + 0.4);
    droneNode.a.stop(now + 0.5);
    droneNode.b.stop(now + 0.5);
    droneNode.c.stop(now + 0.5);
    droneNode = null;
  }
  function setDroneFilter(hz) {
    if (!droneNode || !ctx) return;
    const now = ctx.currentTime;
    droneNode.lp.frequency.cancelScheduledValues(now);
    droneNode.lp.frequency.linearRampToValueAtTime(hz, now + 0.05);
  }

  function getAnalyser() { ensure(); return analyser; }
  function getCtx() { ensure(); return ctx; }

  window.SDAudio = {
    setEnabled, isEnabled, onChange,
    kick, sub, hat, stab, pluck, tick, thunder,
    startDrone, stopDrone, setDroneFilter,
    getAnalyser, getCtx,
  };
})();

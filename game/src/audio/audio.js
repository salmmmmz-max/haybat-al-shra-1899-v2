/**
 * Audio (ARCHITECTURE §9) — one WebAudio engine: generated files (music, sfx) + procedural beds, steps, heartbeat,
 * plucked notes and UI ticks. EVENT-DRIVEN: gameplay only emits its documented events; chapters and the director may
 * also call the API directly (music, one-off sfx, ambience overrides).
 *
 *   audio.unlock() · setVolumes({ master, music, sfx, voice }) · suspend() / resume() · unlocked
 *   audio.music(id | null, { fade = 2 })           looped, 2 s self-crossfade at the seam
 *   audio.sfx(id, { volume = 1, rate = 1, pan?, at?: {x,z} })
 *   audio.loop(id, { volume = 1, rate = 1, fade = 0.4 }) → { setVolume(v, t = 0.3), stop(t = 0.4) }
 *   audio.ambience({ wind, storm, fire, night })   0..1 overrides (null → automatic from weather / fires / sky)
 *   audio.step(surface, weight) · heartbeat(bpm | 0) · duck(db, seconds) · note(i, volume = 1) · ui(kind) · thump(volume)
 *   audio.level → RMS of the master bus (dev/tests)
 * Every call is safe before unlock and with missing buffers (silent no-op). Nothing here allocates per frame; nodes are
 * created per sound event only.
 */
import { clamp, clamp01 } from '../core/math.js';

const FILES = ['music_march', 'music_night', 'music_haya', 'sfx_camel', 'sfx_calf', 'sfx_howl', 'sfx_snarl', 'sfx_shot', 'sfx_water',
  'sfx_torch', 'sfx_qata', 'sfx_thunder', 'sfx_pulley', 'sfx_drum', 'sfx_gust', 'sfx_rain'];
/** Hijaz on D — the plucked star / clue notes */
const SCALE = [293.66, 311.13, 369.99, 392.0, 440.0, 466.16, 523.25, 587.33];
const MAX_VOICES = 14;

function silentWavUrl() {
  const n = 4000, b = new Uint8Array(44 + n), dv = new DataView(b.buffer);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) b[o + i] = s.charCodeAt(i); };
  w(0, 'RIFF'); dv.setUint32(4, 36 + n, true); w(8, 'WAVEfmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, 8000, true); dv.setUint32(28, 8000, true); dv.setUint16(32, 1, true); dv.setUint16(34, 8, true); w(36, 'data'); dv.setUint32(40, n, true);
  b.fill(128, 44);
  return URL.createObjectURL(new Blob([b], { type: 'audio/wav' }));
}

export function createAudio(G) {
  /** @type {AudioContext|null} */
  let ctx = null;
  let unlocked = false, suspendedByApp = false, keepAlive = null;
  let master, limiter, musicBus, sfxBus, ambBus, duckNode, analyser, analyserBuf;
  let noise = null, fadeIn = null, fadeOut = null;
  const vol = { master: 0.9, music: 0.7, sfx: 1, voice: 1 };
  const buffers = new Map();           // id → AudioBuffer | null (failed) ; absent = not decoded yet
  const decoding = new Set();
  let voices = 0;

  // music
  let track = null;                    // { id, buffer, gain, nextAt, dur, x, wanted }
  let wantedMusic = null, wantedFade = 2;
  // beds
  const bed = { wind: null, whistle: null, storm: null, fire: null, crackle: null, chirp: null, focus: null };
  const manual = { wind: null, storm: null, fire: null, night: null };
  const cur = { wind: -1, storm: -1, fire: -1, night: -1, focus: -1 };
  let bedClock = 0, lfo = 0, nextChirp = 2, nextCrackle = 0;
  // heartbeat / duck
  let bpm = 0, nextBeat = 0, duckUntil = Infinity, duckDb = 0, steadyOn = false, thirstBeat = false;
  let noteIx = 0, paused = false;
  let seed = 12345;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

  const now = () => (ctx ? ctx.currentTime : 0);
  const live = () => !!ctx && ctx.state === 'running';

  function build() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try { ctx = new AC({ latencyHint: 'interactive' }); } catch { try { ctx = new AC(); } catch { ctx = null; return false; } }
    master = ctx.createGain(); master.gain.value = vol.master;
    limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -9; limiter.knee.value = 8; limiter.ratio.value = 6; limiter.attack.value = 0.004; limiter.release.value = 0.18;
    master.connect(limiter); limiter.connect(ctx.destination);
    analyser = ctx.createAnalyser(); analyser.fftSize = 512; analyserBuf = new Float32Array(analyser.fftSize); master.connect(analyser);
    duckNode = ctx.createGain(); duckNode.connect(master);
    musicBus = ctx.createGain(); musicBus.gain.value = vol.music; musicBus.connect(duckNode);
    ambBus = ctx.createGain(); ambBus.gain.value = vol.sfx * 0.9; ambBus.connect(duckNode);
    sfxBus = ctx.createGain(); sfxBus.gain.value = vol.sfx; sfxBus.connect(master);

    // shared 2 s noise buffer (deterministic)
    const len = Math.floor(ctx.sampleRate * 2);
    noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = rnd() * 2 - 1;
    // equal-power fade curves
    fadeIn = new Float32Array(64); fadeOut = new Float32Array(64);
    for (let i = 0; i < 64; i++) { const k = i / 63; fadeIn[i] = Math.sin(k * Math.PI / 2); fadeOut[i] = Math.cos(k * Math.PI / 2); }

    const noiseBed = (type, freq, q) => {
      const src = ctx.createBufferSource(); src.buffer = noise; src.loop = true; src.playbackRate.value = 0.9 + rnd() * 0.2;
      const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(f); f.connect(g); g.connect(ambBus); src.start(0, rnd() * 1.5);
      return { src, f, g };
    };
    bed.wind = noiseBed('bandpass', 520, 0.55);
    bed.whistle = noiseBed('bandpass', 1500, 7);
    bed.storm = noiseBed('lowpass', 240, 0.4);
    bed.fire = noiseBed('lowpass', 900, 0.3);
    bed.crackle = noiseBed('highpass', 2400, 0.7);
    // night: a faint insect chirp (pulsed sine) — the desert night is nearly silent
    const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = 4300;
    const cg = ctx.createGain(); cg.gain.value = 0; osc.connect(cg); cg.connect(ambBus); osc.start();
    bed.chirp = { src: osc, g: cg };
    // الفراسة focus pad: two soft detuned sines
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(); o1.type = 'sine'; o2.type = 'sine'; o1.frequency.value = 110; o2.frequency.value = 164.6;
    const fg = ctx.createGain(); fg.gain.value = 0; o1.connect(fg); o2.connect(fg); fg.connect(ambBus); o1.start(); o2.start();
    bed.focus = { src: o1, g: fg };
    return true;
  }

  function decode(id) {
    if (!ctx || buffers.has(id) || decoding.has(id)) return;
    const data = G.assets.audioData(id);
    if (!data) return;                       // not loaded (yet)
    decoding.add(id);
    const done = buf => { decoding.delete(id); buffers.set(id, buf || null); };
    try {
      const p = ctx.decodeAudioData(data.slice(0), b => done(b), () => done(null));
      if (p && p.catch) p.catch(() => done(null));
    } catch { done(null); }
  }
  function decodeAll() { for (const id of FILES) decode(id); }
  function buffer(id) { const b = buffers.get(id); if (b === undefined) decode(id); return b || null; }

  // ---------------------------------------------------------------------------------------------------- spatial
  const sp = { gain: 1, pan: 0 };
  function spatial(at, panOverride) {
    sp.gain = 1; sp.pan = panOverride || 0;
    if (!at) return sp;
    const c = G.camera.position, dx = at.x - c.x, dz = at.z - c.z, d = Math.hypot(dx, dz);
    const yaw = (G.actors && G.actors.cam && G.actors.cam.yaw) || 0;
    const rx = -Math.cos(yaw), rz = Math.sin(yaw);                       // camera right (core/math.js convention)
    sp.pan = clamp(((dx * rx + dz * rz) / Math.max(d, 1)) * 0.85, -1, 1);
    sp.gain = 1 / (1 + Math.pow(d / 14, 1.5));
    return sp;
  }
  function out(gainValue, pan) {
    const g = ctx.createGain(); g.gain.value = gainValue;
    if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(sfxBus); } else g.connect(sfxBus);
    return g;
  }

  // ---------------------------------------------------------------------------------------------------- files
  function sfx(id, o = {}) {
    if (!live()) return;
    const buf = buffer(id);
    if (!buf || voices >= MAX_VOICES) return;
    const s = spatial(o.at, o.pan);
    const v = (o.volume === undefined ? 1 : o.volume) * s.gain;
    if (v < 0.004) return;
    const src = ctx.createBufferSource(); src.buffer = buf; src.playbackRate.value = o.rate || 1;
    src.connect(out(v, s.pan));
    voices++; src.onended = () => { voices--; };
    src.start();
  }
  function loop(id, o = {}) {
    const h = { setVolume() {}, stop() {} };
    if (!live()) return h;
    const buf = buffer(id);
    if (!buf) return h;
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true; src.playbackRate.value = o.rate || 1;
    const g = ctx.createGain(); g.gain.value = 0; src.connect(g); g.connect(ambBus);
    g.gain.setTargetAtTime(o.volume === undefined ? 1 : o.volume, now(), (o.fade === undefined ? 0.4 : o.fade) / 3 + 0.01);
    src.start();
    let stopped = false;
    h.setVolume = (v, t = 0.3) => { if (!stopped) g.gain.setTargetAtTime(v, now(), t / 3 + 0.01); };
    h.stop = (t = 0.4) => { if (stopped) return; stopped = true; g.gain.setTargetAtTime(0, now(), t / 3 + 0.01); try { src.stop(now() + t + 0.2); } catch { /* already stopped */ } };
    return h;
  }

  function scheduleMusicVoice(tr, when, first, fade) {
    const src = ctx.createBufferSource(); src.buffer = tr.buffer;
    const g = ctx.createGain(); src.connect(g); g.connect(tr.gain);
    const x = tr.x, end = when + tr.dur;
    if (first) g.gain.setValueAtTime(1, when);                             // the track gain performs the first fade-in
    else { g.gain.setValueAtTime(0, when); g.gain.setValueCurveAtTime(fadeIn, when, x); }
    g.gain.setValueCurveAtTime(fadeOut, end - x, x);
    src.start(when); src.stop(end + 0.05);
    tr.nextAt = end - x;
    void fade;
  }
  function startMusic(id, fade) {
    const t = now();
    if (track) {
      const old = track; track = null;
      old.gain.gain.cancelScheduledValues(t); old.gain.gain.setTargetAtTime(0, t, Math.max(0.05, fade / 3));
      old.dead = t + fade + 1;
      dying.push(old);
    }
    if (!id) return;
    const buf = buffer(id);
    if (!buf) return;                                                       // will be retried from update() once decoded
    const tr = { id, buffer: buf, gain: ctx.createGain(), nextAt: 0, dur: buf.duration, x: Math.min(2, buf.duration / 4), dead: 0 };
    tr.gain.gain.value = 0; tr.gain.connect(musicBus);
    tr.gain.gain.setTargetAtTime(1, t, Math.max(0.05, fade / 3));
    scheduleMusicVoice(tr, t + 0.05, true, fade);
    track = tr;
  }
  const dying = [];

  // ---------------------------------------------------------------------------------------------------- procedural
  function burst(type, freq, q, dur, gainValue, pan, attack = 0.005) {
    if (!live() || voices >= MAX_VOICES || gainValue < 0.003) return;
    const t = now();
    const src = ctx.createBufferSource(); src.buffer = noise;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = out(1, pan);
    const e = ctx.createGain(); e.gain.setValueAtTime(0.0001, t); e.gain.linearRampToValueAtTime(gainValue, t + attack); e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(e); e.connect(g);
    voices++; src.onended = () => { voices--; };
    src.start(t, rnd() * 1.6, dur + 0.05);
  }
  function tone(freq, dur, gainValue, type = 'sine', slideTo = 0, pan = 0, bus = null) {
    if (!live() || gainValue < 0.003) return;
    const t = now();
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const e = ctx.createGain(); e.gain.setValueAtTime(0.0001, t); e.gain.linearRampToValueAtTime(gainValue, t + 0.006); e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(e); e.connect(bus || out(1, pan));
    o.start(t); o.stop(t + dur + 0.05);
  }
  function step(surface, weight = 1, pan = 0) {
    const w = clamp(weight, 0.2, 1.6), j = 0.9 + rnd() * 0.2;
    if (surface === 'gravel') { burst('bandpass', 2700 * j, 1.1, 0.06, 0.2 * w, pan); burst('bandpass', 3400 * j, 1.4, 0.05, 0.09 * w, pan, 0.02); }
    else if (surface === 'soft') burst('lowpass', 620 * j, 0.5, 0.17, 0.2 * w, pan, 0.012);
    else if (surface === 'camel') burst('lowpass', 430 * j, 0.6, 0.15, 0.3 * w, pan, 0.008);
    else burst('lowpass', 1050 * j, 0.5, 0.11, 0.2 * w, pan);
  }
  function thump(volume = 1) { tone(70, 0.22, 0.5 * volume, 'sine', 38); burst('lowpass', 300, 0.5, 0.18, 0.25 * volume); }
  function exhale(volume = 1) { burst('bandpass', 950, 0.7, 0.55, 0.11 * volume, 0, 0.09); }
  function note(i, volume = 1) {
    if (!live()) return;
    const k = ((i % 16) + 16) % 16, f = SCALE[k % 8] * (k >= 8 ? 2 : 1);
    tone(f, 1.4, 0.16 * volume, 'triangle');
    tone(f * 2, 0.5, 0.05 * volume, 'sine');
  }
  function ui(kind) {
    if (kind === 'confirm') { tone(587.33, 0.12, 0.09, 'triangle'); note(4, 0.5); }
    else if (kind === 'back') tone(440, 0.14, 0.07, 'triangle', 330);
    else if (kind === 'tick') tone(1500, 0.03, 0.03, 'sine', 900);
    else tone(1100, 0.05, 0.06, 'sine', 620);
  }
  function scheduleHeart(t) {
    const hit = (when, f, a) => {
      const o = ctx.createOscillator(); o.frequency.setValueAtTime(f, when); o.frequency.exponentialRampToValueAtTime(f * 0.6, when + 0.12);
      const e = ctx.createGain(); e.gain.setValueAtTime(0.0001, when); e.gain.linearRampToValueAtTime(a, when + 0.012); e.gain.exponentialRampToValueAtTime(0.0001, when + 0.16);
      o.connect(e); e.connect(sfxBus); o.start(when); o.stop(when + 0.2);
    };
    hit(t, 62, 0.42); hit(t + Math.min(0.2, 13 / bpm), 50, 0.3);
  }

  function setBed(name, node, value, scale, tc = 0.5) {
    const v = clamp01(value);
    if (Math.abs(v - cur[name]) < 0.01) return v;
    cur[name] = v;
    node.g.gain.setTargetAtTime(v * scale, now(), tc);
    return v;
  }
  function updateBeds(dt) {
    bedClock -= dt;
    if (bedClock > 0) return;
    bedClock = 0.15; lfo += 0.15;
    const W = G.world || {}, weather = W.weather, sky = W.sky;
    let wind = 0.12, storm = 0, fire = 0, night = 0;
    if (weather && weather.wind) wind = 0.1 + 0.75 * clamp01(weather.wind.strength || 0);
    if (weather && weather.visibility < 400) storm = clamp01(1 - (weather.visibility - 12) / 70);
    if (weather && weather.gusting) { wind = 1; storm = Math.max(storm, 0.6); }
    if (sky && sky.uniforms && sky.uniforms.uNight) night = clamp01(sky.uniforms.uNight.value);
    const fires = W.props && W.props.fires;
    if (fires && fires.length) {
      const c = G.camera.position; let best = 1e9;
      for (let i = 0; i < fires.length; i++) { const f = fires[i]; if (!f || !f.lit || !f.position) continue; const d = Math.hypot(f.position.x - c.x, f.position.z - c.z); if (d < best) best = d; }
      fire = Math.pow(clamp01(1 - best / 20), 1.6);
    }
    if (manual.wind !== null) wind = manual.wind;
    if (manual.storm !== null) storm = manual.storm;
    if (manual.fire !== null) fire = manual.fire;
    if (manual.night !== null) night = manual.night;
    const title = G.state.mode === 'title' || G.state.mode === 'boot' || G.state.mode === 'loading';
    if (title) { storm = 0; fire = 0; }

    setBed('wind', bed.wind, wind * (1 - 0.35 * storm), 0.2);
    bed.wind.f.frequency.setTargetAtTime(380 + 420 * wind + 120 * Math.sin(lfo * 0.31) + 60 * Math.sin(lfo * 0.83), now(), 0.4);
    bed.whistle.g.gain.setTargetAtTime(clamp01(storm * 0.9 + (wind > 0.8 ? 0.2 : 0)) * 0.035 * (0.6 + 0.4 * Math.sin(lfo * 0.57)), now(), 0.5);
    bed.whistle.f.frequency.setTargetAtTime(1300 + 500 * Math.sin(lfo * 0.21), now(), 0.6);
    setBed('storm', bed.storm, storm, 0.5);
    setBed('fire', bed.fire, fire, 0.1, 0.4);
    // crackles: short random pops whose rate and loudness follow the fire level
    nextCrackle -= 0.15;
    if (fire > 0.03 && nextCrackle <= 0) {
      nextCrackle = 0.05 + rnd() * 0.35;
      const t = now(), a = fire * (0.05 + rnd() * 0.16), g = bed.crackle.g.gain;
      g.cancelScheduledValues(t); g.setValueAtTime(a, t); g.exponentialRampToValueAtTime(0.0001, t + 0.03 + rnd() * 0.05);
    }
    // sparse night chirps (never during a storm)
    nextChirp -= 0.15;
    if (night > 0.5 && storm < 0.1 && nextChirp <= 0) {
      nextChirp = 2.5 + rnd() * 5;
      const t = now(), g = bed.chirp.g.gain, a = 0.006 * night;
      for (let k = 0; k < 3; k++) { const s = t + k * 0.07; g.setValueAtTime(0.0001, s); g.linearRampToValueAtTime(a, s + 0.012); g.linearRampToValueAtTime(0.0001, s + 0.05); }
    }
    const fz = (G.sys && G.sys.firasa && G.sys.firasa.amount) || 0;
    setBed('focus', bed.focus, fz, 0.035, 0.25);
  }

  // ---------------------------------------------------------------------------------------------------- API
  const A = {
    runWhenPaused: true,
    get unlocked() { return unlocked; },
    get level() {
      if (!live()) return 0;
      analyser.getFloatTimeDomainData(analyserBuf);
      let s = 0; for (let i = 0; i < analyserBuf.length; i++) s += analyserBuf[i] * analyserBuf[i];
      return Math.sqrt(s / analyserBuf.length);
    },
    get state() { return ctx ? ctx.state : 'none'; },
    unlock() {
      if (!ctx && !build()) return;
      if (ctx.state !== 'running' && !suspendedByApp) { const p = ctx.resume(); if (p && p.catch) p.catch(() => {}); }
      if (!keepAlive) {
        // iOS: a playing <audio> element moves the page to the "playback" session, so WebAudio is audible with the ring switch off
        try {
          keepAlive = document.createElement('audio');
          keepAlive.setAttribute('playsinline', ''); keepAlive.setAttribute('x-webkit-airplay', 'deny');
          keepAlive.loop = true; keepAlive.preload = 'auto'; keepAlive.src = silentWavUrl();
          const p = keepAlive.play(); if (p && p.catch) p.catch(() => {});
        } catch { keepAlive = null; }
      }
      if (!unlocked) { unlocked = true; decodeAll(); G.events.emit('audio:unlocked'); }
    },
    setVolumes(v = {}) {
      for (const k of ['master', 'music', 'sfx', 'voice']) if (typeof v[k] === 'number') vol[k] = clamp01(v[k]);
      if (!ctx) return;
      const t = now();
      master.gain.setTargetAtTime(vol.master * (paused ? 0.35 : 1), t, 0.05);
      musicBus.gain.setTargetAtTime(vol.music, t, 0.05);
      sfxBus.gain.setTargetAtTime(vol.sfx, t, 0.05);
      ambBus.gain.setTargetAtTime(vol.sfx * 0.9, t, 0.05);
    },
    suspend() { suspendedByApp = true; if (ctx && ctx.state === 'running') { const p = ctx.suspend(); if (p && p.catch) p.catch(() => {}); } if (keepAlive) { try { keepAlive.pause(); } catch { /* ignore */ } } },
    resume() {
      suspendedByApp = false;
      if (!ctx || !unlocked) return;
      if (ctx.state !== 'running') { const p = ctx.resume(); if (p && p.catch) p.catch(() => {}); }
      if (keepAlive) { const p = keepAlive.play(); if (p && p.catch) p.catch(() => {}); }
    },
    music(id, o = {}) { wantedMusic = id || null; wantedFade = o.fade === undefined ? 2 : o.fade; if (live() && (!track || track.id !== wantedMusic)) startMusic(wantedMusic, wantedFade); },
    sfx, loop,
    ambience(o = {}) { for (const k of ['wind', 'storm', 'fire', 'night']) if (k in o) manual[k] = o[k] === null || o[k] === undefined ? null : clamp01(o[k]); bedClock = 0; },
    step, thump, exhale, note, ui,
    heartbeat(v) { const b = v ? clamp(v, 40, 140) : 0; if (b && !bpm && ctx) nextBeat = now() + 0.05; bpm = b; },
    duck(db, seconds) {
      duckDb = Math.min(0, db || 0);
      if (!ctx) return;
      duckNode.gain.setTargetAtTime(Math.pow(10, duckDb / 20), now(), 0.12);
      duckUntil = duckDb < 0 && seconds !== Infinity && seconds !== undefined ? now() + seconds : Infinity;
    },
    update(dt) {
      if (!ctx) return;
      // iOS may park the context ("interrupted") after a call or app switch
      if (unlocked && !suspendedByApp && ctx.state !== 'running' && (G.time.frame & 63) === 0) { const p = ctx.resume(); if (p && p.catch) p.catch(() => {}); }
      if (!live()) return;
      const t = now();
      if ((G.time.frame & 127) === 0) decodeAll();
      // music: late start (buffer decoded after the request) + seam scheduling
      // reconcile with the request made while the context was suspended — including a request for silence (C01)
      if ((track ? track.id : null) !== wantedMusic && (track || wantedMusic)) startMusic(wantedMusic, wantedFade);
      if (track && track.nextAt - t < 1.0) scheduleMusicVoice(track, Math.max(track.nextAt, t + 0.02), false, 0);
      for (let i = dying.length - 1; i >= 0; i--) if (t > dying[i].dead) { try { dying[i].gain.disconnect(); } catch { /* ignore */ } dying.splice(i, 1); }
      if (duckUntil !== Infinity && t >= duckUntil) { duckUntil = Infinity; duckDb = 0; duckNode.gain.setTargetAtTime(1, t, 0.3); }
      if (bpm > 0) { let guard = 0; while (nextBeat < t + 0.2 && guard++ < 4) { scheduleHeart(Math.max(nextBeat, t + 0.01)); nextBeat += 60 / bpm; } }
      updateBeds(Math.min(dt || 0.016, 0.1));
    },
  };

  // ---------------------------------------------------------------------------------------------------- events
  const on = (name, fn) => G.events.on(name, e => { try { fn(e || {}); } catch (err) { console.warn('[audio]', name, err); } });
  on('audio:unlocked', () => { A.setVolumes(G.save.settings); });
  on('settings:changed', () => A.setVolumes(G.save.settings));
  on('level:loaded', () => decodeAll());
  on('pause', e => { paused = !!e.paused; A.setVolumes({}); });
  on('player:step', e => {
    if (e.camel) step('camel', e.run ? 1.1 : 0.85);
    else step(e.surface || 'sand', e.run ? 1 : 0.7, e.foot === 'L' ? -0.08 : 0.08);
  });
  on('player:swing', e => sfx('sfx_torch', { volume: 0.8, at: e }));
  on('player:mounted', () => sfx('sfx_camel', { volume: 0.7 }));
  on('player:dismounted', () => sfx('sfx_camel', { volume: 0.5, rate: 0.92 }));
  on('player:knockdown', () => { thump(1); burst('lowpass', 800, 0.5, 0.6, 0.2, 0, 0.05); });
  on('weather:gustWarn', () => sfx('sfx_gust', { volume: 0.3, rate: 0.82 }));
  on('weather:gust', e => sfx('sfx_gust', { volume: 0.7 + 0.3 * clamp01(e.strength || 1) }));
  on('wolf:telegraph', e => sfx('sfx_snarl', { volume: 0.85, rate: 0.9, at: e }));
  on('wolf:repelled', e => { sfx('sfx_snarl', { volume: 0.6, rate: 1.5, at: e }); sfx('sfx_torch', { volume: 0.6 }); });
  on('wolf:bite', e => { sfx('sfx_snarl', { volume: 1, rate: 1.12, at: e }); thump(0.7); });
  on('steady:start', () => { steadyOn = true; A.duck(-9, Infinity); A.heartbeat(60); });
  on('steady:progress', e => { if (steadyOn) bpm = 60 + 36 * clamp01(e.p || 0); });
  on('steady:stage', () => tone(110, 0.5, 0.1, 'sine', 82));
  on('steady:end', e => {
    steadyOn = false; A.duck(0, 0); A.heartbeat(thirstBeat ? 72 : 0);
    if (e.ok) { sfx('sfx_drum', { volume: 0.9 }); exhale(1); } else thump(0.6);
  });
  on('survival:drink', () => sfx('sfx_water', { volume: 0.9 }));
  on('survival:level', e => { if (e.step === 40) exhale(0.8); else if (e.step === 30) { exhale(1); } else if (e.step === 15) { thirstBeat = true; if (!steadyOn) A.heartbeat(72); } });
  on('survival:changed', () => { const s = G.sys && G.sys.survival; if (thirstBeat && s && s.thirst > 15) { thirstBeat = false; if (!steadyOn) A.heartbeat(0); } });
  on('survival:collapse', () => { thump(1); sfx('sfx_drum', { volume: 0.6, rate: 0.7 }); });
  on('firasa:seen', () => note(noteIx++ % 8, 0.7));
  on('firasa:ping', e => {
    const yaw = (G.actors.cam && G.actors.cam.yaw) || 0, b = ((e.bearing || 0) * Math.PI) / 180;
    tone(1320, 0.18, 0.07, 'sine', 990, clamp(Math.sin(b - (Math.PI - yaw)), -1, 1) * 0.8);
  });
  on('stars:found', () => note(noteIx++, 1));
  on('beat:start', () => { noteIx = 0; if (!steadyOn && bpm && !thirstBeat) A.heartbeat(0); });
  on('beat:fail', () => sfx('sfx_drum', { volume: 0.7, rate: 0.7 }));
  on('card:show', () => sfx('sfx_drum', { volume: 0.45, rate: 0.85 }));
  on('choice:made', () => ui('confirm'));
  on('hint:show', () => ui('tick'));
  on('dialogue:line', () => tone(700, 0.04, 0.018, 'sine', 520));
  on('objective:done', () => { note(2, 0.45); });
  on('state:mode', e => { if (e.mode === 'title') { A.heartbeat(0); steadyOn = false; thirstBeat = false; A.duck(0, 0); } });
  return A;
}

/**
 * Quality tiers + dynamic resolution.
 *   quality.tier ('low'|'medium'|'high') · quality.isMobile · quality.scale (0.6..1 in 0.1 steps) · quality.pixelRatio
 *   quality.set(tier | 'auto') · quality.pick(lo, mid, hi) · quality.freeze(bool)
 * pixelRatio = min(devicePixelRatio, CAP[tier], sqrt(MAXPX[tier] / (cssW·cssH))) · scale
 * Dynamic scale works on 1 s MEDIANS of the frame interval, relative to the display's own refresh (so it can recover
 * under vsync): step down 0.1 after 2 slow seconds; step up 0.1 after 5 good seconds, with a growing back-off for a
 * level that proved too heavy. Emits 'quality:changed' {tier}.
 */
const CAP = { low: 1.25, medium: 1.75, high: 2 };
const MAXPX = { low: 0.9e6, medium: 1.6e6, high: 3.2e6 };

export function createQuality(G) {
  const ua = navigator.userAgent || '';
  const isIOS = /iPhone|iPad|iPod/i.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua));
  const isAndroid = /Android/i.test(ua);
  const isMobile = isIOS || isAndroid || /Mobile/i.test(ua);
  const auto = () => (isIOS ? 'medium' : isAndroid ? ((navigator.deviceMemory || 4) <= 3 ? 'low' : 'medium') : isMobile ? 'medium' : 'high');
  let tier = auto(), scale = 1, frozen = false, pixelRatio = 1;
  // frame statistics
  const win = new Float32Array(120); let wn = 0, wt = 0;
  let refresh = 1000 / 60, slowS = 0, goodS = 0, ema = 16.7;
  const blockedUntil = {}; const backoff = {}; let clock = 0;

  function applyPixelRatio() {
    const w = (G.stage && G.stage.w) || window.innerWidth, h = (G.stage && G.stage.h) || window.innerHeight;
    pixelRatio = Math.min(window.devicePixelRatio || 1, CAP[tier], Math.sqrt(MAXPX[tier] / Math.max(1, w * h))) * scale;
    G.renderer.setPixelRatio(pixelRatio);
  }
  function set(t) {
    tier = (t === 'auto' || !CAP[t]) ? auto() : t;
    scale = 1; slowS = goodS = 0;
    applyPixelRatio();
    G.events.emit('quality:changed', { tier });
  }
  function median() { const a = Array.from(win.subarray(0, wn)).sort((x, y) => x - y); return a[a.length >> 1] || 16.7; }
  /** Called by the loop with the raw frame time in ms. */
  function onFrame(ms) {
    ema += (ms - ema) * 0.05;
    if (frozen) return;
    if (wn < win.length) win[wn++] = ms;
    wt += ms; clock += ms / 1000;
    if (wt < 1000) return;
    const med = median(); wn = 0; wt = 0;
    // the display's own cadence: the smallest median seen, snapped to common rates, never faster than 60 Hz target
    const snapped = med < 9.5 ? 8.33 : med < 13 ? 11.1 : med < 20 ? 16.7 : 33.3;
    if (snapped < refresh) refresh = snapped;
    const target = Math.max(refresh, 16.7);
    if (med > target * 1.3) { slowS++; goodS = 0; } else if (med < target * 1.12) { goodS++; slowS = 0; } else { slowS = 0; goodS = 0; }
    if (slowS >= 2 && scale > 0.6) {
      const key = scale.toFixed(1);
      backoff[key] = Math.min(240, (backoff[key] || 15) * 2); blockedUntil[key] = clock + backoff[key];
      scale = Math.max(0.6, +(scale - 0.1).toFixed(1)); slowS = 0; applyPixelRatio();
    } else if (goodS >= 5 && scale < 1) {
      const up = +(scale + 0.1).toFixed(1);
      if (clock >= (blockedUntil[up.toFixed(1)] || 0)) { scale = up; applyPixelRatio(); }
      goodS = 0;
    }
  }
  return {
    get tier() { return tier; },
    get scale() { return scale; },
    get pixelRatio() { return pixelRatio; },
    get frameMs() { return ema; },
    isMobile, isIOS,
    set, onFrame, applyPixelRatio,
    /** tests / harness: keep resolution fixed */
    freeze(v = true) { frozen = v; },
    /** tier → value helper */
    pick: (lo, mid, hi) => (tier === 'low' ? lo : tier === 'medium' ? mid : hi),
  };
}

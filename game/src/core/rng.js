/** Seeded RNG (mulberry32). Gameplay randomness must come from here so runs are reproducible. */
function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/**
 * @param {number|string} seed
 * @returns {{next():number, range(a:number,b:number):number, int(a:number,b:number):number, pick<T>(arr:T[]):T, chance(p:number):boolean, fork(label:string):any, seed:number}}
 */
export function makeRng(seed) {
  let s = (typeof seed === 'string' ? hashStr(seed) : (seed >>> 0)) || 0x9e3779b9;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const api = {
    seed: s,
    next,
    range: (a, b) => a + (b - a) * next(),
    /** integer in [a, b] inclusive */
    int: (a, b) => a + Math.floor(next() * (b - a + 1)),
    pick: arr => arr[Math.floor(next() * arr.length)],
    chance: p => next() < p,
    /** independent stream derived from this seed + label (does not advance this stream) */
    fork: label => makeRng((api.seed ^ hashStr(String(label))) >>> 0),
  };
  return api;
}

/**
 * Authored trails for الفراسة.
 *   tracks.add({ id, points:[{x,z}], kind, fresh = 1, spacing, gaps: [[i0,i1]], hidden = false, reveal: metres })
 *     → { reveal(), hide(), progressOf(pos) → 0..1, distanceTo(pos) → m, end, remove() }
 * Renders through decals.trail (one decal trail per continuous run between gaps), registers a `track` clue every ~12 m along
 * fresh trails, and — when `reveal` metres is given — shows prints by distance to the hero every tick (never by a timer):
 * radius = reveal · (firasa.amount > 0.5 ? 1 : 0.35).
 * Pure helper (unit tests): projectOnPolyline / buildPolyline.
 */
export const CLUE_SPACING = 12;
const _r = { t: 0, d: 0 };

/** Pure: arrays for a polyline. */
export function buildPolyline(points) {
  const n = points.length, xs = new Float32Array(n), zs = new Float32Array(n), cum = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    xs[i] = points[i].x; zs[i] = points[i].z;
    if (i) cum[i] = cum[i - 1] + Math.hypot(xs[i] - xs[i - 1], zs[i] - zs[i - 1]);
  }
  return { xs, zs, cum, n, length: n ? cum[n - 1] : 0 };
}

/** Pure, allocation-free: nearest point of the polyline to (px, pz). Writes `out.t` (0..1 by arc length) and `out.d` (metres). */
export function projectOnPolyline(P, px, pz, out = _r) {
  const { xs, zs, cum, n, length } = P;
  if (n === 0) { out.t = 0; out.d = Infinity; return out; }
  let bd = Infinity, bs = 0;
  if (n === 1) { bd = Math.hypot(px - xs[0], pz - zs[0]); }
  for (let i = 0; i < n - 1; i++) {
    const ax = xs[i], az = zs[i], bx = xs[i + 1] - ax, bz = zs[i + 1] - az;
    const l2 = bx * bx + bz * bz;
    let u = l2 > 1e-9 ? ((px - ax) * bx + (pz - az) * bz) / l2 : 0;
    u = u < 0 ? 0 : u > 1 ? 1 : u;
    const dx = px - ax - bx * u, dz = pz - az - bz * u, d2 = dx * dx + dz * dz;
    if (d2 < bd * bd || bd === Infinity) { bd = Math.sqrt(d2); bs = cum[i] + u * (cum[i + 1] - cum[i]); }
  }
  out.d = bd; out.t = length > 0 ? bs / length : 0;
  return out;
}

export function createTracks(G) {
  const list = [];
  const T = {
    get all() { return list; },
    add(o) {
      const kind = o.kind || 'camel', fresh = o.fresh === undefined ? 1 : o.fresh, gaps = o.gaps || [];
      const pts = o.points, P = buildPolyline(pts);
      const inGap = i => gaps.some(g => i >= g[0] && i <= g[1]);
      const segs = []; let run = [];
      pts.forEach((p, i) => { if (inGap(i)) { if (run.length > 1) segs.push(run); run = []; } else run.push(p); });
      if (run.length > 1) segs.push(run);
      const opts = { fresh };
      if (o.spacing) opts.spacing = o.spacing;
      const decals = segs.map(s => G.world.decals.trail(s, kind, opts));
      let hidden = !!o.hidden;
      const setVisible = b => decals.forEach(d => d.setVisible && d.setVisible(b));
      setVisible(!hidden);

      // firasa clues along the fresh, printed parts
      const clues = [];
      if (fresh > 0 && G.sys.firasa) {
        let n = 0;
        for (const s of segs) {
          let acc = CLUE_SPACING * 0.5;
          for (let i = 0; i < s.length - 1; i++) {
            const a = s[i], b = s[i + 1], l = Math.hypot(b.x - a.x, b.z - a.z);
            while (acc <= l && l > 0) {
              const u = acc / l;
              clues.push(G.sys.firasa.addClue({ id: `${o.id}#${n++}`, at: { x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u }, type: 'track', radius: 30, group: o.id }));
              acc += CLUE_SPACING;
            }
            acc -= l;
          }
        }
      }
      const h = {
        id: o.id, points: pts, kind, end: pts[pts.length - 1], length: P.length,
        get hidden() { return hidden; },
        reveal() { hidden = false; setVisible(true); },
        hide() { hidden = true; setVisible(false); },
        progressOf(pos) { return projectOnPolyline(P, pos.x, pos.z, _r).t; },
        distanceTo(pos) { return projectOnPolyline(P, pos.x, pos.z, _r).d; },
        remove() {
          for (const d of decals) d.remove && d.remove();
          for (const c of clues) c.remove();
          clues.length = 0; decals.length = 0;
          const i = list.indexOf(h); if (i >= 0) list.splice(i, 1);
        },
        _reveal: o.reveal > 0 ? o.reveal : 0, _decals: decals,
      };
      list.push(h);
      const sc = G.scope;
      if (sc && sc !== G.rootScope && sc !== G.levelScope && !sc.closed) sc.own(h);
      return h;
    },
    clear() { for (let i = list.length - 1; i >= 0; i--) list[i].remove(); },
    onLevelUnload() { T.clear(); },
    update() {
      if (!list.length) return;
      const pl = G.actors.player, fa = G.sys.firasa ? G.sys.firasa.amount : 0;
      for (let i = 0; i < list.length; i++) {
        const h = list[i]; if (!h._reveal || h.hidden) continue;
        const r = h._reveal * (fa > 0.5 ? 1 : 0.35);
        for (let k = 0; k < h._decals.length; k++) { const d = h._decals[k]; if (d.setReveal) d.setReveal(pl.pos, r); }
      }
    },
  };
  return T;
}

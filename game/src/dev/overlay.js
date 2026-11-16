/** Dev overlay (?dev=1): fps, frame ms, draw calls, triangles, textures, resolution scale, chapter/beat, player position. */
export function createOverlay(G) {
  const el = document.createElement('pre');
  el.style.cssText = 'position:fixed;left:6px;bottom:6px;margin:0;padding:4px 6px;background:#000a;color:#9f9;font:11px/1.35 monospace;z-index:99;pointer-events:none;direction:ltr;text-align:left;white-space:pre';
  document.body.appendChild(el);
  let acc = 0, frames = 0, fps = 0, worst = 0;
  const stats = { fps: 0, ms: 0, calls: 0, tris: 0 };
  return {
    stats, runWhenPaused: true,
    update(dt) {
      acc += dt; frames++; worst = Math.max(worst, dt * 1000);
      if (acc < 0.5) return;
      fps = frames / acc; const info = G.renderer.info;
      stats.fps = fps; stats.ms = G.quality.frameMs; stats.calls = info.render.calls; stats.tris = info.render.triangles;
      const p = G.actors.player.pos;
      el.textContent = `${fps.toFixed(0)} fps  ${G.quality.frameMs.toFixed(1)} ms (worst ${worst.toFixed(0)})\n` +
        `calls ${info.render.calls}  tris ${(info.render.triangles / 1000).toFixed(1)}k  tex ${info.memory.textures}  geo ${info.memory.geometries}\n` +
        `q ${G.quality.tier} x${G.quality.scale.toFixed(2)}  ${G.state.mode}  ch${G.state.chapter} ${G.state.beat || ''}\n` +
        `pos ${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}  scope ${G.scope.label} (${G.scope.pending})`;
      acc = 0; frames = 0; worst = 0;
    },
  };
}

/**
 * Stage — the game is always laid out in LANDSCAPE. On a touch device held in portrait (e.g. iPhone rotation lock) the
 * #stage element is sized as landscape and rotated 90°, so the player just holds the phone sideways.
 *   G.stage.w, G.stage.h      stage size in CSS px (w ≥ h on touch devices)
 *   G.stage.rotated           true while the stage is drawn rotated
 *   G.stage.toLocal(clientX, clientY, out) → out {x, y}   viewport → stage coordinates
 *   G.stage.delta(dx, dy, out) → out {x, y}               viewport delta → stage delta
 * CSS variables on #stage: --sw, --sh (px) and --sa-t/-r/-b/-l (safe-area insets mapped to the stage's orientation).
 * Emits 'resize' { w, h, rotated }.
 */
export function createStage(G) {
  const el = document.getElementById('stage') || document.body;
  const touch = (navigator.maxTouchPoints || 0) > 0 && !(G.opts && G.opts.noRotate);
  const S = {
    el, w: 1, h: 1, rotated: false,
    toLocal(cx, cy, out) { if (S.rotated) { out.x = cy; out.y = S.h - cx; } else { out.x = cx; out.y = cy; } return out; },
    delta(dx, dy, out) { if (S.rotated) { out.x = dy; out.y = -dx; } else { out.x = dx; out.y = dy; } return out; },
    layout,
  };
  function layout() {
    const vv = window.visualViewport;
    const vw = Math.max(1, Math.round(vv ? vv.width : window.innerWidth)), vh = Math.max(1, Math.round(vv ? vv.height : window.innerHeight));
    const rot = touch && vh > vw * 1.05;
    S.rotated = rot; S.w = rot ? vh : vw; S.h = rot ? vw : vh;
    if (el.classList) {
      el.classList.toggle('rot', rot);
      el.style.width = S.w + 'px'; el.style.height = S.h + 'px';
      el.style.setProperty('--sw', S.w + 'px'); el.style.setProperty('--sh', S.h + 'px');
    }
    G.renderer.setSize(S.w, S.h, false);
    G.camera.aspect = S.w / S.h; G.camera.updateProjectionMatrix();
    if (G.quality) G.quality.applyPixelRatio();
    G.events.emit('resize', { w: S.w, h: S.h, rotated: rot });
  }
  window.addEventListener('resize', layout);
  window.addEventListener('orientationchange', () => setTimeout(layout, 150));
  if (window.visualViewport) window.visualViewport.addEventListener('resize', layout);
  return S;
}

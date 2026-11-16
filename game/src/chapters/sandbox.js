/**
 * Sandbox chapter — a tiny end-to-end slice used to exercise the kernel (level load, beats, dialogue, interact, steady,
 * mount, objective). Not part of the shipped story; replaced in chapters/index.js by ch1…ch5.
 */
import { SANDBOX_TEXT, SANDBOX_CARDS } from '../content/sandbox.ar.js';

export default {
  id: 'sandbox', index: 0, assets: 'sandbox',
  level: {
    id: 'sandbox', seed: 7,
    terrain: { duneAmp: 8, duneScale: 120, windDeg: 250, flats: [{ x: 0, z: 0, r: 40, fall: 30 }], soft: [], gravel: [] },
    sky: 'morning', wind: { deg: 250, strength: 0.3 },
    pois: { camp: { x: 0, z: 0 }, well: { x: 12, z: 8 }, pen: { x: -14, z: 10 } },
    props: [
      { model: 'tent', at: 'camp', dx: -6, dz: -8, yaw: 0.4 },
      { model: 'well', at: 'well' },
      { model: 'campfire', at: 'camp', dx: 2, dz: -2 },
      { model: 'acacia', at: 'camp', dx: 16, dz: -14 },
      { model: 'waterskins', at: 'camp', dx: -1, dz: -6 },
      { model: 'camelsit', at: 'pen', dx: 4, dz: 2, yaw: 1.2 },
    ],
    fires: [{ id: 'camp', at: 'camp', dx: 2, dz: -2, lit: true }],
    scatter: [{ kind: 'shrub', count: 60, at: 'camp', r: 160, avoid: ['camp'] }],
    spawn: { at: 'camp', dx: 0, dz: 4, yaw: 0 },
    bounds: { x: 0, z: 0, r: 300 },
  },
  setup(G, L) {
    Object.assign(G.story.text, SANDBOX_TEXT); Object.assign(G.story.cards, SANDBOX_CARDS);
    const well = L.poi('well'), pen = L.poi('pen');
    G.actors.npcs.spawn('mani', 'mani', { x: well.x - 2, z: well.z + 1.5, yaw: 2.4 }).lookAtPlayer(true);
    G.actors.npcs.spawn('fuhaid', 'fuhaid', { x: 3, z: 8, yaw: 3 });
    G.actors.npcs.spawn('moudi', 'moudi', { x: -5, z: -4, yaw: 0.5 });
    G.actors.camels.spawn('wadha', { x: pen.x, z: pen.z, yaw: 0.6 });
  },
  beats: [
    {
      id: 'sb_talk',
      enter(G, L, ctx) { if (ctx.resumed) { const c = L.poi('camp'); G.actors.player.teleport(c.x, c.z + 4, 0); } },
      async run(G, L, d) {
        const mani = G.actors.npcs.get('mani');
        d.objective('sb.obj.talk', { at: mani.actor.root });
        let used = false;
        d.own(G.sys.interact.add({ id: 'mani', at: mani.actor.root, label: 'sb.label.talk', onUse: () => { used = true; } }));
        await d.until(() => used);
        d.objectiveDone();
        await d.say('mani', 'يا ولدي… الصحرا ما تعطي أسرارها إلا لمن يعرف يقراها.');
        await d.say('dhari', 'سَمّ يا جدّي.');
      },
    },
    {
      id: 'sb_mount',
      enter(G, L, ctx) { if (ctx.resumed) { const c = L.poi('well'); G.actors.player.teleport(c.x - 3, c.z + 3, 0); } },
      async run(G, L, d) {
        const wadha = G.actors.camels.get('wadha');
        d.objective('sb.obj.mount', { at: wadha.root });
        await d.near(wadha.root, 4);
        const ok = await G.sys.steady.hold({ target: wadha.head, seconds: 2, labelKey: 'steady.hold' });
        if (!ok) { await d.wait(0.5); }
        await G.actors.player.mount(wadha);
        d.objectiveDone();
        await d.wait(G.state.fastText ? 0.1 : 6);
        await G.actors.player.dismount();
        await d.card('sb_end');
      },
    },
  ],
};

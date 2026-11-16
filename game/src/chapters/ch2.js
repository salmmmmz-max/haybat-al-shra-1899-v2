/**
 * Chapter 2 «المسير» — L2 «الجال», harsh noon → sandstorm → dusk.
 * Teaches: leading, the sip, the storm; exam = bringing فهيد back.
 * Beats: c2_march · c2_ration · c2_wall · c2_storm · c2_return · c2_dusk   (DESIGN §5, SCRIPT §Ch2)
 * Staging, routines and places live in ch2-lib.js.
 * Water (DESIGN §4, rule in systems/survival.js): the قربة is locked (toast «water.locked.c2») until the c2_ration decision; the choice moves
 * the single sip to its recipient — «اشرب» drinks it now (+35), «فهيد» / «جدّك» take it (sips = 0). The only later sip is the giver's reward at c2_dusk.
 */
import { LEVELS } from './levels.js';
import { toast, prompt, hud, use, pause, yawTo } from './kit.js';
import { dist, clamp01, DEG } from '../core/math.js';
import {
  S, pts, stage, npc, cam, seatOf, swallow, above, sip, gustBrace, faceShots, lostWatch, callRipple, RING_R, goal, warpBot,
} from './ch2-lib.js';

const EAST = 90 * DEG, WEST = -90 * DEG;
const NAMES = ['mani', 'moudi', 'misfer', 'fuhaid'];

/** bot helper: walk a route; hold the button for a gust brace; open the eye now and then */
function routeBot(G, bot, wps, state) {
  const sr = G.sys.steady.activeRequest, pl = G.actors.player.pos;
  if (sr && sr.kind === 'brace') { G.input.feed({ move: { x: 0, y: 0 }, hold: ['interact'] }); return true; }
  while (state.i < wps.length - 1 && dist(pl.x, pl.z, wps[state.i].x, wps[state.i].z) < 4) state.i++;
  bot.steer(wps[state.i], 0.75);
  G.input.feed({ hold: G.time.now % 6 < 1.5 ? ['firasa'] : [] });
  return true;
}

/** the authored line of فهيد's prints from the last-seen spot to the bush, with its two gaps (indices into the points) */
function fuhaidPath(P) {
  const way = [P.lastSeen, P.gap1, P.gap2, P.bush], pts_ = [], cum = [], gc = [];
  let s = 0;
  for (let i = 0; i < way.length - 1; i++) {
    const a = way[i], b = way[i + 1], l = dist(a.x, a.z, b.x, b.z), n = Math.max(1, Math.ceil(l));
    for (let k = 0; k < n; k++) { pts_.push({ x: a.x + (b.x - a.x) * k / n, z: a.z + (b.z - a.z) * k / n }); cum.push(s + l * k / n); }
    s += l; gc.push(s);
  }
  pts_.push({ x: P.bush.x, z: P.bush.z }); cum.push(s);
  const range = (c, h) => { let a = -1, b = -1; cum.forEach((v, i) => { if (v >= c - h && a < 0) a = i; if (v <= c + h) b = i; }); return [a, b, c - h, c + h]; };
  const g1 = range(gc[0], 7.5), g2 = range(gc[1], 7.5);
  return { points: pts_, gaps: [[g1[0], g1[1]], [g2[0], g2[1]]], g1: [g1[2], g1[3]], g2: [g2[2], g2[3]], length: s };
}

export default {
  id: 'ch2', index: 2, assets: 'ch2', level: LEVELS.jal, sky: 'noon', lst: undefined,
  survival: { thirst: 55, sips: 1, drain: true },

  setup(G, L) {
    S.G = G; S.first = true; S.softTime = 0; S.ready = Promise.resolve(); S.lastBounds = -99;
    const P = pts(L), props = G.world.props;
    props.rockOutcrop(P.rock.x, P.rock.z, { r: 9.5, h: 7.5, seed: 3 });     // the shade rock «الجال»
    props.cairn(P.cairn.x, P.cairn.z, { h: 2.6 });                          // the رجم of event 1 (seeds the ch4 cairns)
    props.spawn('acacia', { x: P.bush.x + 1.6, z: P.bush.z - 0.4, scale: 0.6 });   // the ghada bush فهيد hides behind
    const T = G.story.text; if (T['steady.brace'] === undefined) T['steady.brace'] = T['c2_wall.label.brace'];   // steady.js labels the brace button 'steady.brace' (not in the UI strings)
    L.own(G.events.on('state:mode', e => { if (e && e.mode === 'title') S.first = true; }));   // a new run from the title shows the card again
    L.own(G.events.on('chapter:end', () => { S.first = true; }));
    L.own(G.events.on('survival:denied', e => { if (e && e.key) toast(G, e.key, 4); }));       // the locked قربة explains itself
    // the turn-back line ('c2.bounds') is shown by the director on player:bounds
    // thirst toasts at 40 / 30 / 15 come from the director (survival:level)
  },

  beats: [
    // ------------------------------------------------------------------------------------------------ 1 · march
    {
      id: 'c2_march',
      enter(G, L, ctx) { stage(G, L, 'c2_march', ctx.resumed); },
      async run(G, L, d) {
        const P = pts(L), pl = G.actors.player, wadha = cam(G, 'wadha'), C = G.actors.caravan, T = G.world.terrain;
        await d.wrap(S.ready);
        d.own(pl.limit('lead', { speed: 2.4, run: false }));                 // lead pace fixed, no trot while leading
        if (S.first) { S.first = false; await d.card('c2'); await d.talk('c2_march.lead'); }
        S.softTime = 0;
        C.follow(true);
        if ('pitch' in G.actors.cam) G.actors.cam.pitch = 24 * DEG;          // look down over the string: the caravan must not hide the lead
        goal(d, 'c2_march.obj', { at: P.shade });
        prompt(G, 'c2_march.prompt.lead'); d.onEnd(() => prompt(G, null));

        // firasa shows the cairn and the edges of the firm corridor between the two soft patches
        const fa = G.sys.firasa;
        fa.addClue({ id: 'cairn', at: P.cairn, type: 'sign', radius: 60 });
        [[-3.7, -159.6], [-2, -150], [-3.7, -140.4], [15.4, -140.2], [14, -132], [15.4, -123.8]].forEach(([x, z], i) => fa.addClue({ id: 'edge' + i, at: { x, z }, type: 'sign', radius: 45, ping: false }));

        // the quiet teaching: prompts by distance
        d.spawn(async d2 => {
          const away = () => dist(pl.pos.x, pl.pos.z, P.start.x, P.start.z);
          await d2.until(() => away() > 12); prompt(G, null);
          await d2.until(() => away() > 20);
          hud(G, { eye: true, water: true, strip: false }); prompt(G, 'c2_march.prompt.water'); await d2.wait(5); prompt(G, null);
        });
        // the three authored events, ~70 m apart
        d.spawn(async d2 => {
          await d2.near(P.cairn, 42); d.bark('c2_march.bark.1');
          await d2.near(P.fork, 46); toast(G, 'c2_march.toast.fork', 4);
          await d2.until(() => pl.pos.z > P.qata.z - 20);
          const f = G.world.props.flock({ from: { x: pl.pos.x + 8, z: pl.pos.z - 70 }, to: { x: pl.pos.x - 10, z: pl.pos.z + 160 }, count: 16, height: 17, speed: 15 });
          if (f) { d.own(f); G.audio.sfx('sfx_qata', { at: { x: pl.pos.x, z: pl.pos.z - 20 } }); d.bark('c2_march.bark.3'); await f.pass(); }
        });
        // soft sand: the line stretches, مسفر calls out; time in soft sand decides his remark at the shade
        d.spawn(async d2 => {
          let run = 0, cool = 0, barked = false, was = false;
          await d2.task(dt => {
            const soft = T.softAt(wadha.pos.x, wadha.pos.z) > 0.5; cool -= dt;
            if (soft) { S.softTime += dt; run += dt; was = true; if (run >= 2 && !barked && cool <= 0) { barked = true; cool = 12; d.bark('c2_march.bark.2'); } }
            else { if (was && run >= 2) toast(G, 'c2_march.toast.firm', 3.8); was = false; run = 0; barked = false; }
            return undefined;
          });
        });

        await d.near(P.shade, 10);
        d.objectiveDone();
      },
      bot(G, bot) {
        const P = pts(G.sys.director.level);
        if (!this._st) this._st = { i: 0 };
        const wps = [{ x: 0, z: -250 }, { x: 4, z: -168 }, { x: 6, z: -140 }, { x: 4, z: -108 }, { x: 0, z: -80 }, P.shade];
        if (G.actors.player.pos.z < -285 && this._st.i > 0) this._st.i = 0;
        return routeBot(G, bot, wps, this._st);
      },
    },

    // ------------------------------------------------------------------------------------------------ 2 · ration
    {
      id: 'c2_ration',
      enter(G, L, ctx) { stage(G, L, 'c2_ration', ctx.resumed); },
      async run(G, L, d) {
        const P = pts(L), pl = G.actors.player, C = G.actors.caravan, wadha = cam(G, 'wadha');
        await d.wrap(S.ready);
        d.own(pl.limit('lead', { speed: 2.4, run: false }));                 // still leading: the pace stays fixed until the camels kneel
        // 1 · into the shade, kneel الوضحا (the scripted dismount)
        goal(d, 'c2_ration.obj', { at: P.shade });
        await use(G, d, { id: 'kneel', at: P.shade, label: 'c2_ration.label.kneel', radius: 7, mountedOk: true });
        d.objectiveDone();
        C.halt();
        if (pl.mounted) await d.wrap(pl.dismount());
        await d.talk(S.softTime >= 6 ? 'c2_ration.arrive.soft' : 'c2_ration.arrive.firm');

        // 2 · the string kneels in the ring, the family sits round the fire
        swallow(C.kneelAll({ ring: { x: P.ring.x, z: P.ring.z, r: RING_R } }));
        d.spawn(async d2 => { await wadha.goTo(P.wadhaRest.x, P.wadhaRest.z, { speed: 2.2, stop: 0.8 }); wadha.pose('kneel', { duration: 1.4 }); });
        let seated = 0;
        for (const id of NAMES) {
          const n = npc(G, id), q = seatOf(L, id), yaw = yawTo(q, P.fire);
          if (n.riding && n.unride) n.unride();
          if (id !== 'fuhaid' && n.lookAtPlayer) n.lookAtPlayer(true);
          if (G.state.fastText) { n.place(q.x, q.z, yaw); n.play('sit'); seated++; }
          else d.spawn(async d2 => { await n.goTo(q.x, q.z, { speed: 2.6, stop: 0.3 }); await d2.wait(0.8); n.place(q.x, q.z, yaw); n.play('sit'); seated++; });   // the npc's own stand-still easing would otherwise re-play the walk/idle clip over the sit
        }
        goal(d, 'c2_ration.obj', { at: P.fire });                              // the view eases onto the circle round the fire
        await d.near(P.fire, 5.5);
        await d.until(() => seated >= NAMES.length, { timeout: 14 });          // «once everyone is seated»
        d.objectiveDone();
        await d.talk('c2_ration.share');

        // 3 · the single sip
        const v = await d.choice('c2_ration.ask', [
          { key: 'c2_ration.choice.self', value: 'self', confirm: true },
          { key: 'c2_ration.choice.child', value: 'child', confirm: true },
          { key: 'c2_ration.choice.elder', value: 'elder', confirm: true },
        ]);
        d.flag('ration', v);
        const sv = G.sys.survival;
        sv.lockDrink(false);
        if (v === 'self') await sip(G, d, 'c2_ration.prompt.drink');            // sip() returns at once when there is no sip left to drink
        else sv.set({ sips: 0 });                                               // the sip now belongs to فهيد / the Sheikh: not Dhari's any more
        // the consequence shot sits on the narrator line of the block; the camera is released at the next voice
        const who = v === 'self' ? () => pl.actor : () => npc(G, v === 'child' ? 'fuhaid' : 'mani').actor;
        let shot = false, freed = false;
        d.onEnd(G.events.on('dialogue:line', e => {
          if (!shot && e.who === 'narrator') { shot = true; swallow(G.actors.cam.cine(faceShots(who(), 2.4))); }
          else if (shot && !freed && e.who !== 'narrator') { freed = true; G.actors.cam.release({ duration: 1 }); }
        }));
        await d.talk('c2_ration.' + v);
        if (!freed) G.actors.cam.release({ duration: 1 });
        await pause(G, d, 1);
      },
      bot: G => warpBot(G),
    },

    // ------------------------------------------------------------------------------------------------ 3 · wall
    {
      id: 'c2_wall',
      enter(G, L, ctx) { stage(G, L, 'c2_wall', ctx.resumed); },
      async run(G, L, d) {
        const P = pts(L), pl = G.actors.player, C = G.actors.caravan, wadha = cam(G, 'wadha'), sky = G.world.sky, W = G.world.weather;
        await d.wrap(S.ready);
        // the sky yellows while he speaks; everyone is on their feet
        swallow(sky.setPreset('storm', { duration: 16 })); W.setWind(90, 0.6); W.storm(0.7, { duration: 16 }); W.setDust(0.7, { duration: 16 });
        NAMES.forEach(id => { const n = npc(G, id); if (n) n.play('idle'); });
        await d.talk('c2_wall.sky');

        // 1 · the camels rise and fight the rope; الوضحا kneels at once (echo of ch1)
        swallow(C.riseAll()); if (wadha.kneeling) wadha.pose('rise', { duration: 1.2 });
        d.spawn(async d2 => {
          let k = 0;
          for (;;) {
            await d2.wait(1.3);
            const m = C.members; if (!m.length) continue;
            const c = m[k++ % m.length]; c.pose(k % 2 ? 'shake' : 'raiseHead', { duration: 1.2 });
            G.audio.sfx('sfx_camel', { at: c.pos, volume: 0.5, rate: 0.9 + 0.1 * (k % 3) });
          }
        });
        goal(d, 'c2_wall.obj', { at: wadha.root });
        await use(G, d, { id: 'kneel', at: wadha.root, label: 'c2_wall.label.kneel', radius: 3.4 });
        d.objectiveDone();
        wadha.pose('kneel', { duration: 1.2 }); toast(G, 'c2_wall.toast.wadha', 4);
        await pause(G, d, 2.5);

        // 2 · the first gust, taught: the Sheikh's line, then the warning (it repeats until braced once)
        d.bark('c2_wall.bark.1');
        await d.wait(1.0);
        goal(d, 'c2_wall.brace.obj', { at: wadha.root, mark: 'never' });
        prompt(G, 'c2_wall.prompt.brace'); d.onEnd(() => prompt(G, null));
        let ok = false;
        while (!ok) { ok = await gustBrace(G, d, { warn: 2.5, missKey: 'c2_wall.brace.hint1' }); if (!ok) await d.wait(2); }
        prompt(G, null); d.objectiveDone();
        toast(G, 'c2_wall.toast.braced', 4);
        swallow(C.kneelAll({ ring: { x: P.ring.x, z: P.ring.z, r: RING_R } }));        // the string is coaxed down into the ring
        await pause(G, d, 1.2);

        // 3 · الحوار bolts downwind, فهيد runs after it
        const fu = npc(G, 'fuhaid'), hw = cam(G, 'hwar'), last = P.lastSeen;
        fu.stop(); fu.place(last.x - 2, last.z + 2, EAST); fu.play('idle');
        hw.stop(); hw.place(last.x - 4, last.z - 3, EAST);
        swallow(W.gust({ warn: 0.4, strength: 1, duration: 1.6 }));
        swallow(hw.flee({ x: last.x - 12, z: last.z }, 70));
        d.spawn(async d2 => { await d2.wait(0.6); G.audio.sfx('sfx_calf', { at: hw.pos }); await fu.goTo(last.x + 12, last.z - 1, { speed: 4.2, stop: 0.6 }); });
        await d.cine([
          { pos: above(G, last.x - 20, 3.2, last.z - 11), look: () => fu.actor.pos, dur: 0.02, cut: true },    // from the north side: clear of the waterskins' tripod and the Sheikh
          { pos: above(G, last.x - 14, 2.6, last.z - 12), look: () => fu.actor.pos, dur: 3.6 },
        ]);
        G.actors.cam.release({ duration: 1 });
        await d.talk('c2_wall.fuhaid');

        // 4 · hold two seconds on his small figure and the first prints before the dust takes him
        pl.teleport(last.x - 5, last.z, EAST); pl.actor.faceTo(last.x + 20, last.z, 20);
        fu.stop(); fu.place(last.x + 18, last.z - 1, EAST); fu.play('run');
        d.own(G.sys.tracks.add({ id: 'fuhaid0', points: [{ x: last.x, z: last.z }, { x: last.x + 16, z: last.z - 0.5 }], kind: 'child', fresh: 1 }));
        W.storm(0.85, { duration: 2.4 });
        await d.cine([
          { pos: [pl.pos.x - 4.4, pl.pos.y + 2.4, pl.pos.z + 1.2], look: [last.x + 16, pl.pos.y + 1.2, last.z], dur: 0.02, cut: true },
          { pos: [pl.pos.x - 1.4, pl.pos.y + 2.0, pl.pos.z + 0.9], look: [last.x + 18, pl.pos.y + 1.2, last.z], dur: 2.4 },
        ]);
        // he runs on and ends up crouched at the bush
        const bush = P.bush;
        fu.place(bush.x + 3.2, bush.z + 0.8, WEST); fu.play('kneel');
        hw.place(bush.x + 4.6, bush.z + 1.8, WEST); if (hw.pose) hw.pose('kneel', { duration: 0.01 });
        G.actors.cam.release({ duration: 1 });
      },
      bot: G => warpBot(G),
    },

    // ------------------------------------------------------------------------------------------------ 4 · storm (out)
    {
      id: 'c2_storm',
      enter(G, L, ctx) { stage(G, L, 'c2_storm', ctx.resumed); },
      async run(G, L, d) {
        const P = pts(L), pl = G.actors.player, W = G.world.weather, sky = G.world.sky, bush = P.bush;
        const self = G.state.flags.ration === 'self';
        await d.wrap(S.ready);
        swallow(sky.setPreset('storm', { duration: 5 })); W.setWind(90, 0.9); W.storm(1, { duration: 5 }); W.setDust(0.8, { duration: 5 });
        G.sys.survival.rate('storm', -0.07); d.onEnd(() => G.sys.survival.rate('storm', null));
        const fu = npc(G, 'fuhaid'), hw = cam(G, 'hwar');

        // his prints, revealed by distance; two gaps of ~17 m are bridged by his call
        const path = fuhaidPath(P);
        const trk = G.sys.tracks.add({ id: 'fuhaid', points: path.points, kind: 'child', fresh: 1, gaps: path.gaps, reveal: 14 });
        const progress = () => trk.progressOf(pl.pos) * trk.length;
        goal(d, 'c2_storm.obj', { at: bush });
        toast(G, 'c2_storm.toast.call', 3.8);

        const call = { gap: false, arrow: false, range: self ? 60 : 90 };
        callRipple(G, d, bush, call);
        lostWatch(G, d, bush, call, { calfAt: bush });
        let done = false;
        d.spawn(async d2 => {
          let cur = 0, first = true, beep = 0;
          await d2.task(dt => {
            const s = progress();
            const g = s > path.g1[0] - 2 && s < path.g1[1] + 1 ? 1 : s > path.g2[0] - 2 && s < path.g2[1] + 1 ? 2 : 0;
            call.gap = g > 0;
            if (g && g !== cur) {
              cur = g;
              toast(G, 'c2_storm.toast.call', 3.6);
              d.spawn(async d3 => { await d3.wait(1.8); toast(G, self ? 'c2_storm.toast.answer.hoarse' : 'c2_storm.toast.answer', 3.8); });
              if (first) { first = false; prompt(G, 'c2_storm.prompt.voice'); d.spawn(async d3 => { await d3.wait(7); prompt(G, null); }); }
            } else if (!g && cur) cur = 0;
            beep -= dt;
            if (call.gap && beep <= 0 && !done) { beep = 3.2; G.audio.sfx('sfx_calf', { at: bush, volume: self ? 0.35 : 0.7 }); }
            return undefined;
          });
        });
        // two teaching gusts, 2.5 s warning, by distance (never by a free timer)
        d.spawn(async d2 => {
          for (const at_ of [8, 36]) {
            await d2.until(() => progress() >= at_ || done);
            if (done || dist(pl.pos.x, pl.pos.z, bush.x, bush.z) < 14) return;
            await gustBrace(G, d2, { warn: 2.5, missKey: 'c2_return.fail.knock' });
          }
        });

        await d.near(bush, 8);
        done = true; call.gap = false; call.arrow = false; call.refresh();
        d.objectiveDone();
        fu.play('idle');
        await d.first({ run: fu.goTo(pl.pos.x, pl.pos.z, { speed: 3.4, stop: 1.3 }), t: d.wait(7) });
        hw.pose('rise', { duration: 1.2 });
        await d.talk('c2_storm.found');
        fu.follow(pl, { dist: 1.5, speed: 2.4 });
      },
      bot(G, bot) {
        const P = pts(G.sys.director.level), path = fuhaidPath(P);
        if (!this._st) this._st = { i: 0 };
        const wps = path.points.filter((p, i) => i % 6 === 0).concat([P.bush]);
        if (dist(G.actors.player.pos.x, G.actors.player.pos.z, P.lastSeen.x, P.lastSeen.z) < 6 && this._st.i > 2) this._st.i = 0;
        return routeBot(G, bot, wps, this._st);
      },
    },

    // ------------------------------------------------------------------------------------------------ 5 · return (back)
    {
      id: 'c2_return',
      enter(G, L, ctx) { stage(G, L, 'c2_return', ctx.resumed); },
      async run(G, L, d) {
        const P = pts(L), pl = G.actors.player, W = G.world.weather, home = P.home, bush = P.bush;
        const giver = G.state.flags.ration !== 'self';
        await d.wrap(S.ready);
        W.setWind(90, 0.9); W.storm(1, { duration: 0 });
        const fu = npc(G, 'fuhaid'), hw = cam(G, 'hwar'), mo = npc(G, 'moudi'), sheikh = npc(G, 'mani');
        // he holds Dhari's sash and walks his path; الحوار behind him
        if (fu.followTrail && !fu.followTrail._stub) fu.followTrail(pl, { behind: 1.5 }); else fu.follow(pl, { dist: 1.5, speed: 2.4 });
        if (hw.kneeling) hw.pose('rise', { duration: 1 });
        hw.follow(fu, { dist: 2.4, speed: 2.4 });
        d.own(pl.limit('headwind', { speedMul: 0.8 }));
        G.sys.survival.rate('storm', -0.07); d.onEnd(() => G.sys.survival.rate('storm', null));
        // the camp: the fire is lit (stage), موضي waits at the east edge, the Sheikh calls
        mo.place(P.moudi.x, P.moudi.z, EAST); mo.play('idle');
        sheikh.stop(); sheikh.play('idle');
        const D0 = dist(bush.x, bush.z, home.x, home.z), toHome = () => dist(pl.pos.x, pl.pos.z, home.x, home.z);
        goal(d, 'c2_return.obj', { at: home });

        const call = { gap: true, arrow: false, range: 999 };
        callRipple(G, d, home, call);
        lostWatch(G, d, home, call, { calfAt: { x: 0, z: P.fire.z } });

        // visibility opens 12 → 25 m over the last 30 m
        d.spawn(async d2 => {
          let near = false;
          await d2.task(() => {
            const k = clamp01((30 - toHome()) / 30);
            W.storm(1 - 0.026 * k, { duration: 0 });
            if (k > 0.02 && !near) { near = true; toast(G, 'c2_return.toast.near', 3.8); }
            return undefined;
          });
        });
        // the giver's thirst line (crossing 30 here, or already below it)
        if (giver) {
          let shown = false;
          const once = () => { if (!shown) { shown = true; toast(G, 'c2_return.toast.thirst', 4); } };
          d.onEnd(G.events.on('survival:level', e => { if (e.step === 30) once(); }));
          d.spawn(async d2 => { await d2.wait(14); if (G.sys.survival.thirst <= 30) once(); });
        }
        // five scripted gusts, 9–12 s apart, by distance; bracing shields فهيد
        let shields = 0;
        d.spawn(async d2 => {
          let last = -99;
          for (let k = 0; k < 5; k++) {
            await d2.until(() => D0 - toHome() >= 8 + 13 * k && G.time.now - last >= 9);
            if (toHome() < 8) return;
            const ok = await gustBrace(G, d2, { warn: 2.5, missKey: 'c2_return.fail.knock', shield: fu });
            last = G.time.now;
            if (ok && shields < 2) { shields++; toast(G, 'c2_return.toast.shield', 3.8); }
            if (ok && k === 0) { await d2.wait(2.5); d.bark('c2_return.bark.1'); }
            if (k === 1) { await d2.wait(3); d.bark('c2_return.bark.2'); G.audio.sfx('sfx_drum', { at: home, volume: 0.5 }); }
          }
        });
        await d.near(home, 5);
        d.objectiveDone();
      },
      bot(G, bot) {
        const P = pts(G.sys.director.level);
        if (!this._st) this._st = { i: 0 };
        const wps = [{ x: P.bush.x - 30, z: P.bush.z + 2 }, { x: P.bush.x - 60, z: P.bush.z + 3 }, P.home];
        if (dist(G.actors.player.pos.x, G.actors.player.pos.z, P.bush.x, P.bush.z) < 6 && this._st.i > 1) this._st.i = 0;
        return routeBot(G, bot, wps, this._st);
      },
    },

    // ------------------------------------------------------------------------------------------------ 6 · dusk
    {
      id: 'c2_dusk',
      enter(G, L, ctx) { stage(G, L, 'c2_dusk', ctx.resumed); },
      async run(G, L, d) {
        const P = pts(L), pl = G.actors.player, W = G.world.weather, sky = G.world.sky;
        await d.wrap(S.ready);
        const giver = G.state.flags.ration !== 'self';
        const mo = npc(G, 'moudi'), fu = npc(G, 'fuhaid');
        // the storm passes: golden light
        swallow(sky.setPreset('dusk', { duration: 12 })); W.storm(0, { duration: 12 }); W.setDust(0.15, { duration: 12 }); W.setWind(90, 0.2);
        G.audio.music('music_march', { fade: 3 });
        mo.place(P.moudi.x, P.moudi.z, EAST);
        goal(d, 'c2_dusk.obj', { at: P.moudi });
        await d.near(P.moudi, 3.6);
        d.objectiveDone();
        mo.actor.faceTo(pl.pos.x, pl.pos.z, 6);
        swallow(fu.goTo(P.moudi.x + 0.9, P.moudi.z + 0.4, { speed: 3.6, stop: 0.5 }));
        await d.talk('c2_dusk.back');
        if (giver) {
          if (G.sys.survival.sips < 1) G.sys.survival.set({ sips: 1 });
          await d.talk('c2_dusk.sip');
          await sip(G, d, 'c2_dusk.prompt.drink');
        }
        await pause(G, d, 1);
        // the camp at golden hour: a slow wide shot under the closing card
        const f = P.fire;
        swallow(G.actors.cam.cine([
          { pos: above(G, f.x + 15, 3.4, f.z + 11), look: above(G, f.x, 2.2, f.z - 1), dur: 0.02, cut: true },
          { pos: above(G, f.x + 11, 3.0, f.z + 9), look: above(G, f.x - 1, 2.6, f.z - 2), dur: 6 },
        ]));
        hud(G, { eye: false, water: false, strip: false });                       // the closing card stands alone
        await d.card('c2_end');
        G.actors.cam.release({ duration: 0.5 });
      },
      bot: G => warpBot(G),
    },
  ],
};

/**
 * Builds the context object `G` (ARCHITECTURE §2) and wires every module in the canonical order.
 * Modules are plain factories `createX(G)`; this file is the only place that knows them all.
 */
import * as THREE from 'three';
import { createEvents } from './events.js';
import { createInput } from './input.js';
import { createAssets } from './assets.js';
import { createSave } from './save.js';
import { createQuality } from './quality.js';
import { createLoop, ORDER } from './loop.js';
import { createScope } from './scope.js';
import { createNet } from './net.js';
import { createStage } from './stage.js';
import { createShade } from './shade.js';
import { createLod } from './lod.js';
import { makeRng } from './rng.js';
import { makeT } from './strings.js';

import { STORY } from '../content/story.ar.js';
import { UI_STRINGS } from '../ui/strings.ui.ar.js';

import { createTerrain } from '../world/terrain.js';
import { createSky } from '../world/sky.js';
import { createWeather } from '../world/weather.js';
import { createProps } from '../world/props.js';
import { createDecals } from '../world/decals.js';
import { createLevel } from '../world/level.js';

import { createPlayer } from '../actors/player.js';
import { createCam } from '../actors/camera.js';
import { createNpcs } from '../actors/npc.js';
import { createCamels } from '../actors/camels.js';
import { createCaravan } from '../actors/caravan.js';
import { createWolves } from '../actors/wolves.js';

import { createInteract } from '../systems/interact.js';
import { createFirasa } from '../systems/firasa.js';
import { createSteady } from '../systems/steady.js';
import { createSurvival } from '../systems/survival.js';
import { createObjectives } from '../systems/objectives.js';
import { createStars } from '../systems/stars.js';
import { createTracks } from '../systems/tracks.js';
import { createDirector } from '../systems/director.js';

import { createAudio } from '../audio/audio.js';
import { createUI } from '../ui/ui.js';
import { fillContractStubs } from '../dev/stubfill.js';

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{test?:boolean, dev?:boolean, seed?:number}} opts
 */
export function createGame(canvas, opts = {}) {
  /** @type {any} */
  const G = { canvas, opts };
  G.events = createEvents();
  G.time = { now: 0, dt: 1 / 60, frame: 0, scale: 1 };
  G.state = { mode: 'boot', chapter: 0, beat: null, flags: {}, fastText: !!opts.test };
  G.shade = createShade();
  G.story = STORY;
  G.t = makeT(STORY, UI_STRINGS);
  G.rng = makeRng(opts.seed || 1899);
  G.vrng = makeRng('visual');
  G.rootScope = createScope('root');
  G.levelScope = G.rootScope;
  G.scope = G.rootScope;

  G.save = createSave(G); G.save.load();
  G.state.flags = G.save.data.flags;

  // --- renderer -------------------------------------------------------------------------------
  const mobileUA = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: !mobileUA, alpha: false, stencil: false, depth: true,
    powerPreference: 'high-performance', preserveDrawingBuffer: !!opts.test,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;          // palette colours are authored; lights are tuned to stay ≤ 1
  renderer.shadowMap.enabled = false;
  renderer.info.autoReset = true;
  G.renderer = renderer;
  G.scene = new THREE.Scene();
  G.camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.2, 2600);
  G.camera.position.set(0, 3, -6);
  G.scene.add(G.camera);

  G.quality = createQuality(G);
  G.input = createInput(G);
  G.assets = createAssets(G);
  G.loop = createLoop(G);
  G.net = createNet(G);

  G.stage = createStage(G);
  G.lod = createLod(G);
  /** re-layout the stage (size, rotation, pixel ratio) */
  G.resize = () => G.stage.layout();

  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); G.loop.stop(); G.save.commit(); G.events.emit('gl:lost'); });
  canvas.addEventListener('webglcontextrestored', () => { G.events.emit('gl:restored'); if (!opts.test) G.loop.start(); });

  /** Change the high-level mode; emits state:mode. */
  G.setMode = mode => { if (G.state.mode === mode) return; G.state.mode = mode; G.events.emit('state:mode', { mode }); };
  /** Pause / resume gameplay time. */
  G.setPaused = on => { G.time.scale = on ? 0 : 1; G.events.emit('pause', { paused: !!on }); };

  // --- modules (order matters only for construction dependencies) ----------------------------
  G.audio = createAudio(G);
  G.world = {};
  G.world.sky = createSky(G);
  G.world.terrain = createTerrain(G);
  G.world.weather = createWeather(G);
  G.world.decals = createDecals(G);
  G.world.props = createProps(G);
  G.world.level = createLevel(G);

  G.actors = {};
  G.actors.camels = createCamels(G);
  G.actors.player = createPlayer(G);
  G.actors.cam = createCam(G);
  G.actors.npcs = createNpcs(G);
  G.actors.caravan = createCaravan(G);
  G.actors.wolves = createWolves(G);

  G.sys = {};
  G.sys.interact = createInteract(G);
  G.sys.firasa = createFirasa(G);
  G.sys.steady = createSteady(G);
  G.sys.survival = createSurvival(G);
  G.sys.objectives = createObjectives(G);
  G.sys.stars = createStars(G);
  G.sys.tracks = createTracks(G);
  G.sys.director = createDirector(G);

  G.ui = createUI(G);
  fillContractStubs(G);            // any contract API a module lacks becomes a marked no-op (never overrides real code)

  const L = G.loop;
  L.add(G.sys.director, ORDER.director);
  L.add(G.actors.player, ORDER.player);
  L.add(G.actors.npcs, ORDER.npcs);
  L.add(G.actors.camels, ORDER.camels);
  L.add(G.actors.caravan, ORDER.caravan);
  L.add(G.actors.wolves, ORDER.wolves);
  L.add(G.sys.interact, ORDER.interact);
  L.add(G.sys.firasa, ORDER.firasa);
  L.add(G.sys.steady, ORDER.steady);
  L.add(G.sys.survival, ORDER.survival);
  L.add(G.sys.objectives, ORDER.objectives);
  L.add(G.sys.stars, ORDER.stars);
  L.add(G.sys.tracks, ORDER.tracks);
  L.add(G.world.weather, ORDER.weather);
  L.add(G.world.sky, ORDER.sky);
  L.add(G.world.props, ORDER.props);
  L.add(G.world.decals, ORDER.decals);
  L.add(G.world.terrain, ORDER.terrain);
  L.add(G.actors.cam, ORDER.cam);
  L.add(G.lod, ORDER.cam + 1);
  L.add(G.audio, ORDER.audio);
  L.add(G.ui, ORDER.ui);

  G.quality.set(G.save.settings.quality);
  G.stage.layout();
  return G;
}

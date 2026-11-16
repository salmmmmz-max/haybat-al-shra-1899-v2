/**
 * The three terrains of the journey (LevelDef: world/level.js). +X east, +Z south (north = −Z); the journey goes south.
 * Chapters read places only through L.poi(name) — every authored position lives here.
 */
const CAMP_PROPS = [
  { model: 'tent', at: 'camp', dx: -19, dz: -9, yaw: 1.0 }, { model: 'tent', at: 'camp', dx: -7, dz: -20, yaw: 0.35 },
  { model: 'tent', at: 'camp', dx: 9, dz: -21, yaw: -0.3 }, { model: 'tent', at: 'camp', dx: 22, dz: -10, yaw: -0.95 },
];

export const LEVELS = {
  /** L1 «المراح» — ch1: the camp by the dying well, the trail south-east, the gravel flat, the green patch. */
  camp: {
    id: 'L1', seed: 1101,
    terrain: { duneAmp: 7, duneScale: 110, windDeg: 250,
      flats: [{ x: 0, z: 2, r: 40, fall: 34 }, { x: 72, z: 98, r: 24, fall: 28 }, { x: 98, z: 196, r: 14, fall: 26 }],
      soft: [], gravel: [{ x: 72, z: 98, r: 33 }], ridges: [{ x1: 10, z1: 62, x2: 92, z2: 46, h: 7, w: 26 }] },
    sky: 'dawn', wind: { deg: 250, strength: 0.25 }, dust: 0.25,
    pois: {
      camp: { x: 0, z: 0 }, fire: { x: 0, z: -6 }, spawn: { x: -13, z: 5 }, well: { x: 8, z: 6 }, pen: { x: 4, z: 19 }, gate: { x: 6, z: 24 },
      oldEnd: { x: -44, z: 42 },                       // the old (decoy) trail runs west from the gate
      ridge: { x: 34, z: 56 }, break: { x: 58, z: 84 },  // the fresh trail climbs the ridge and breaks at the gravel flat
      gravel: { x: 72, z: 98 }, twig: { x: 66, z: 97 }, dung: { x: 83, z: 108 }, resume: { x: 90, z: 114 }, wolfprint: { x: 96, z: 150 },
      green: { x: 98, z: 196 },                          // الوضحا grazes here
      rideTop: { x: 40, z: 54 },                         // the ridge crest that reveals the camp on the ride home
    },
    props: [
      ...CAMP_PROPS, { model: 'well', at: 'well' }, { model: 'campfire', at: 'fire' }, { model: 'waterskins', at: 'well', dx: 4, dz: -3, yaw: 0.6 },
      { model: 'acacia', at: 'pen', dx: 5, dz: 4 }, { model: 'camelsit', at: 'pen', dx: -11, dz: 2, yaw: 1.3 }, { model: 'camelsit', at: 'pen', dx: -14, dz: -5, yaw: 0.7 },
      { model: 'camelsit', at: 'pen', dx: -9, dz: 8, yaw: 2.0 }, { model: 'acacia', at: 'green', dx: 7, dz: 5, scale: 0.8 },
    ],
    fires: [{ id: 'camp', at: 'fire', lit: true, size: 0.8 }],
    scatter: [
      { kind: 'shrub', count: 90, x: 50, z: 100, r: 230, avoid: ['camp', 'gravel'] }, { kind: 'grass', count: 110, x: 50, z: 100, r: 220, avoid: ['camp'] },
      { kind: 'rock', count: 26, at: 'gravel', r: 34 }, { kind: 'pebble', count: 160, at: 'gravel', r: 32 },
      { kind: 'greenpatch', count: 46, at: 'green', r: 13 }, { kind: 'shrub', count: 8, at: 'green', r: 16 },
    ],
    spawn: { at: 'spawn', yaw: Math.PI / 2 },
    bounds: { x: 45, z: 95, r: 250 },
  },

  /** L2 «الجال» — ch2: the march south to the shade rock, the storm; ch3: the night camp at the rock. */
  jal: {
    id: 'L2', seed: 2202,
    terrain: { duneAmp: 10, duneScale: 150, windDeg: 85,
      flats: [{ x: 0, z: -290, r: 16, fall: 30 }, { x: 0, z: -8, r: 36, fall: 42 }, { x: 88, z: -20, r: 9, fall: 18 }],
      soft: [{ x: -30, z: -150, r: 28 }, { x: 38, z: -132, r: 24 }], gravel: [{ x: 0, z: -4, r: 46 }], ridges: [] },
    sky: 'noon', wind: { deg: 90, strength: 0.35 }, dust: 0.35,
    pois: {
      start: { x: 0, z: -290 }, cairn: { x: -16, z: -216 }, fork: { x: 4, z: -168 }, firm: { x: 6, z: -140 }, afterFork: { x: 4, z: -108 }, qata: { x: 0, z: -80 },
      rock: { x: 0, z: 10 }, camp: { x: 0, z: -12 }, fire: { x: 0, z: -16 }, ring: { x: -8, z: -8 },   // kneeling camels ring west of the fire
      lastSeen: { x: 12, z: -14 }, gap1: { x: 34, z: -16 }, gap2: { x: 62, z: -22 }, bush: { x: 88, z: -20 },   // فهيد's way east in the storm
      north: { x: 0, z: -40 },                           // the dark side the wolves come from
    },
    props: [{ model: 'acacia', at: 'rock', dx: -20, dz: -6, scale: 0.9 }, { model: 'waterskins', at: 'camp', dx: 7, dz: 6, yaw: 1 }],
    fires: [{ id: 'camp', at: 'fire', lit: false, size: 1 }],
    scatter: [
      { kind: 'shrub', count: 80, x: 20, z: -140, r: 300, avoid: ['camp'] }, { kind: 'grass', count: 90, x: 20, z: -140, r: 300, avoid: ['camp'] },
      { kind: 'rock', count: 30, at: 'rock', r: 44 }, { kind: 'pebble', count: 140, at: 'camp', r: 40 }, { kind: 'shrub', count: 5, at: 'bush', r: 5 },
    ],
    spawn: { at: 'start', yaw: 0 },
    bounds: { x: 20, z: -140, r: 330 },
  },

  /** L3 «أم الحيا» — ch4: the stranger, the search by cairns; ch5: the ridge, the basin, the well. */
  haya: {
    id: 'L3', seed: 3303,
    terrain: { duneAmp: 12, duneScale: 170, windDeg: 240,
      flats: [{ x: 0, z: -320, r: 22, fall: 36 }, { x: 4, z: -262, r: 12, fall: 24 }, { x: 0, z: 246, r: 38, fall: 44, y: -6 }],
      soft: [], gravel: [{ x: 0, z: 246, r: 55 }], ridges: [{ x1: -110, z1: 178, x2: 110, z2: 178, h: 11, w: 34 }] },
    sky: 'morning', wind: { deg: 240, strength: 0.3 }, dust: 0.3,
    pois: {
      start: { x: 0, z: -330 }, stranger: { x: 14, z: -302 }, acacia: { x: 4, z: -262 },
      cairn1: { x: -24, z: -176 }, cairn2: { x: 28, z: -40 }, bones: { x: 108, z: -22 }, cairn3: { x: -30, z: 60 }, cairn4: { x: 10, z: 148 },
      crest: { x: 0, z: 178 }, pile: { x: 10, z: 186 }, foot: { x: 0, z: 194 }, shot1: { x: 0, z: 214 }, shot2: { x: 0, z: 230 },
      fire: { x: 0, z: 242 }, thamer: { x: 0, z: 246 }, well: { x: 7, z: 254 },
    },
    props: [
      { model: 'acacia', at: 'acacia', dx: 3, dz: 2 }, { model: 'well', at: 'well' }, { model: 'acacia', at: 'well', dx: 12, dz: 6 }, { model: 'acacia', at: 'well', dx: -16, dz: 4, scale: 0.85 },
      { model: 'tent', at: 'well', dx: -24, dz: 14, yaw: 0.7 }, { model: 'camelsit', at: 'well', dx: 16, dz: -8, yaw: 2.2 }, { model: 'camelsit', at: 'well', dx: 20, dz: -3, yaw: 2.6 },
    ],
    fires: [{ id: 'well', at: 'fire', lit: true, size: 1.1 }],
    scatter: [
      { kind: 'shrub', count: 90, x: 0, z: -40, r: 380, avoid: ['fire'] }, { kind: 'grass', count: 90, x: 0, z: -40, r: 380, avoid: ['fire'] },
      { kind: 'rock', count: 24, at: 'well', r: 50 }, { kind: 'pebble', count: 150, at: 'well', r: 46 }, { kind: 'greenpatch', count: 30, at: 'well', r: 22 },
    ],
    spawn: { at: 'start', yaw: 0 },
    bounds: { x: 0, z: -40, r: 400 },
  },
};

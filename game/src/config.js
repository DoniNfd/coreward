// COREWARD — every constant the game is tuned by, in one place: the field,
// the palette, the warden, the core, the three Hollow kinds, the waves, the
// pickups and the combo. The simulation (world.js) and the drawing
// (render.js) both read from here, so the game can be rebalanced by editing
// this file alone.

/** The logical field, in pixels. The canvas is exactly this size and CSS scales it. */
export const FIELD = { width: 1280, height: 720 };

/** The fixed simulation step, in seconds: the world always advances in 60ths. */
export const STEP = 1 / 60;

/** The last living star, fixed at the centre of the field. */
export const CORE = {
  x: FIELD.width / 2,
  y: FIELD.height / 2,
  radius: 30,
  maxIntegrity: 100,
  /** Enemies must stay outside this ring or they latch on and drain. */
  latchRadius: 44,
};

/** The warden, the player's ship. */
export const PLAYER = {
  radius: 12,
  speed: 268,
  acceleration: 2400,
  maxHull: 100,
  fireInterval: 0.145,
  bulletSpeed: 580,
  bulletRadius: 4,
  /** Seconds of invulnerability after taking a hit, so one swarm cannot stun-lock. */
  graceSeconds: 0.7,
};

/** The three kinds of Hollow, keyed by the names world.js spawns them under. */
export const ENEMIES = {
  drifter: {
    radius: 13, hp: 1, speedMin: 44, speedMax: 68, score: 50,
    coreDamage: 6, hullDamage: 10, dropChance: 0.04,
  },
  weaver: {
    radius: 11, hp: 1, speedMin: 96, speedMax: 128, score: 80,
    coreDamage: 8, hullDamage: 12, dropChance: 0.05,
  },
  bulwark: {
    radius: 26, hp: 6, speedMin: 28, speedMax: 34, score: 150,
    coreDamage: 14, hullDamage: 20, dropChance: 0.35,
  },
};

/** Waves: how the Hollow arrives, and when dawn breaks. */
export const WAVES = {
  total: 10,
  baseCount: 6,
  perWave: 3,
  spawnInterval: 0.72,
  betweenSeconds: 2.6,
  /** Every wave divisible by this is a surge: faster spawns, mostly weavers. */
  surgeEvery: 5,
};

/** The nova blast, the warden's panic button. */
export const NOVA = {
  radius: 196,
  startCharges: 2,
  maxCharges: 3,
  /** Kills inside the blast score at this fraction, so it is a rescue, not a farm. */
  scoreFraction: 0.5,
};

/** Pickups dropped by the fallen. */
export const PICKUPS = {
  radius: 13,
  lifetime: 9,
  overchargeSeconds: 8,
  repairHull: 22,
  repairCore: 12,
  kinds: ['overcharge', 'repair', 'nova'],
};

/** The combo: chained kills inside the window raise the score multiplier. */
export const COMBO = {
  windowSeconds: 2.2,
  killsPerStep: 6,
  maxMultiplier: 8,
};

/** The palette. Canvas gradients are built from these stops in render.js. */
export const COLORS = {
  void: '#070812',
  voidDeep: '#04040a',
  nebulaViolet: 'rgba(109, 40, 217, 0.55)',
  nebulaTeal: 'rgba(14, 165, 183, 0.42)',
  nebulaEmber: 'rgba(245, 158, 11, 0.30)',
  starDim: '#8fb8d8',
  starBright: '#eaf7ff',
  coreHeart: '#fff3c4',
  coreMid: '#ffd166',
  coreEdge: '#ff9a3c',
  coreRing: '#57f7e0',
  hull: '#e8f6ff',
  hullAccent: '#4de3ff',
  flame: '#ffb347',
  bullet: '#aefcff',
  drifter: '#b388ff',
  drifterEye: '#ff4d6d',
  weaver: '#4de3ff',
  weaverFin: '#ff4dd2',
  bulwark: '#ff7847',
  bulwarkPlate: '#ffd166',
  text: '#d9f6ff',
  textDim: '#7fa8bf',
  danger: '#ff5470',
  heal: '#5df2a6',
  gold: '#ffd166',
};

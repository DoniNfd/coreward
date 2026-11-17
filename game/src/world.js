// COREWARD — the simulation. Everything that moves, collides, scores or
// breaks lives here and nowhere else: this file never touches the DOM, the
// canvas or the clock, so a world can be stepped headlessly (the screenshot
// scenes and the smoke test both do exactly that) and a seed always replays
// the same game.
//
// The loop it models: the Hollow streams in from the field's edge in waves
// and makes for the core at the centre. The warden — the player's ship —
// shoots them down. A Hollow that reaches the core latches on and drains it;
// one that reaches the warden tears at its hull. Clear wave 10 and dawn
// breaks (a win); lose the core or the hull and the light goes out.

import { COMBO, CORE, ENEMIES, FIELD, NOVA, PICKUPS, PLAYER, WAVES } from './config.js';
import { createRng, edgePoint, range } from './random.js';

/** The phases a run passes through, in order (won and lost are terminal). */
export const PHASE_INTRO = 'intro';
export const PHASE_ACTIVE = 'active';
export const PHASE_BETWEEN = 'between';
export const PHASE_WON = 'won';
export const PHASE_LOST = 'lost';

const TAU = Math.PI * 2;

function distance(ax, ay, bx, by) {
  return Math.hypot(bx - ax, by - ay);
}

function makeEnemy(state, kind, x, y) {
  const spec = ENEMIES[kind];
  return {
    kind,
    x, y,
    vx: 0, vy: 0,
    hp: spec.hp,
    maxHp: spec.hp,
    radius: spec.radius,
    speed: range(state.rng, spec.speedMin, spec.speedMax),
    wobblePhase: range(state.rng, 0, TAU),
    angle: range(state.rng, 0, TAU),
    spin: range(state.rng, -1.4, 1.4),
    flash: 0,
    dead: false,
  };
}

/** The shuffled list of Hollow kinds a wave sends, hardest waves mixed hotter. */
function buildWaveQueue(state, wave) {
  const total = WAVES.baseCount + WAVES.perWave * wave;
  const surge = wave % WAVES.surgeEvery === 0;
  const bulwarks = wave >= 3 ? Math.floor(total / 6) : 0;
  const weaverShare = surge ? 0.6 : wave >= 2 ? 0.35 : 0;
  const weavers = Math.floor((total - bulwarks) * weaverShare);
  const queue = [];
  for (let i = 0; i < bulwarks; i += 1) queue.push('bulwark');
  for (let i = 0; i < weavers; i += 1) queue.push('weaver');
  while (queue.length < total) queue.push('drifter');
  for (let i = queue.length - 1; i > 0; i -= 1) {
    const j = Math.floor(state.rng() * (i + 1));
    [queue[i], queue[j]] = [queue[j], queue[i]];
  }
  return queue;
}

function startWave(state, wave) {
  state.wave = wave;
  state.spawnQueue = buildWaveQueue(state, wave);
  state.spawnTimer = 0;
  state.phase = PHASE_INTRO;
  state.phaseTimer = 1.6;
  state.banner = wave % WAVES.surgeEvery === 0
    ? { title: `WAVE ${wave} — SURGE`, sub: 'The Hollow comes all at once. Hold the light.' }
    : { title: `WAVE ${wave}`, sub: wave === 1 ? 'They are coming for the core. Do not let them touch it.' : '' };
  state.events.push('wave');
}

/** Creates a fresh world. `seed` drives every random draw the game will make. */
export function createWorld(seed) {
  const state = {
    rng: createRng(seed),
    time: 0,
    wave: 0,
    phase: PHASE_INTRO,
    phaseTimer: 0,
    spawnQueue: [],
    spawnTimer: 0,
    player: {
      x: CORE.x, y: CORE.y + 168,
      vx: 0, vy: 0,
      angle: -Math.PI / 2,
      hull: PLAYER.maxHull,
      fireTimer: 0,
      grace: 0,
      thrust: 0,
    },
    core: { integrity: CORE.maxIntegrity, pulseHit: 0 },
    enemies: [],
    bullets: [],
    particles: [],
    floaters: [],
    pickups: [],
    shockwaves: [],
    score: 0,
    kills: 0,
    combo: { chain: 0, timer: 0, multiplier: 1 },
    novaCharges: NOVA.startCharges,
    overchargeTimer: 0,
    trauma: 0,
    hitStop: 0,
    banner: { title: '', sub: '' },
    stats: { shotsFired: 0, shotsHit: 0, novasUsed: 0, peakMultiplier: 1 },
    events: [],
  };
  startWave(state, 1);
  return state;
}

/** How many Hollow are still to come this wave, for the HUD. */
export function enemiesRemaining(state) {
  return state.spawnQueue.length + state.enemies.length;
}

function burst(state, x, y, count, color, speed, size, life) {
  for (let i = 0; i < count; i += 1) {
    const angle = state.rng() * TAU;
    const velocity = range(state.rng, speed * 0.25, speed);
    state.particles.push({
      x, y,
      vx: Math.cos(angle) * velocity,
      vy: Math.sin(angle) * velocity,
      life: range(state.rng, life * 0.4, life),
      maxLife: life,
      size: range(state.rng, size * 0.5, size),
      color,
      drag: 2.4,
    });
  }
}

function floater(state, x, y, text, color, size = 15) {
  state.floaters.push({ x, y, life: 0.9, maxLife: 0.9, text, color, size });
}

function explode(state, enemy, color) {
  const count = enemy.kind === 'bulwark' ? 30 : 14;
  burst(state, enemy.x, enemy.y, count, color, enemy.kind === 'bulwark' ? 260 : 200, 3.2, 0.7);
  state.shockwaves.push({
    x: enemy.x, y: enemy.y, radius: 6, maxRadius: enemy.radius * 2.6,
    life: 0.28, maxLife: 0.28, color,
  });
}

function killEnemy(state, enemy, scored) {
  enemy.dead = true;
  const spec = ENEMIES[enemy.kind];
  const color = enemy.kind === 'drifter' ? '#b388ff' : enemy.kind === 'weaver' ? '#4de3ff' : '#ff7847';
  explode(state, enemy, color);
  state.events.push('boom');
  if (scored) {
    state.combo.chain += 1;
    state.combo.timer = COMBO.windowSeconds;
    state.combo.multiplier = Math.min(COMBO.maxMultiplier, 1 + Math.floor(state.combo.chain / COMBO.killsPerStep));
    state.stats.peakMultiplier = Math.max(state.stats.peakMultiplier, state.combo.multiplier);
    const gained = Math.round(spec.score * state.combo.multiplier);
    state.score += gained;
    state.kills += 1;
    floater(state, enemy.x, enemy.y - enemy.radius, `+${gained}`, '#d9f6ff');
  }
  if (enemy.kind === 'bulwark') {
    state.hitStop = Math.max(state.hitStop, 0.045);
    state.trauma = Math.min(1, state.trauma + 0.3);
    for (const sign of [-1, 1]) {
      const child = makeEnemy(state, 'drifter', enemy.x + sign * 14, enemy.y + sign * 6);
      child.vx = sign * 90;
      child.vy = -sign * 40;
      state.enemies.push(child);
    }
  }
  if (state.rng() < spec.dropChance) dropPickup(state, enemy.x, enemy.y);
}

function dropPickup(state, x, y) {
  const kind = PICKUPS.kinds[Math.floor(state.rng() * PICKUPS.kinds.length)];
  state.pickups.push({
    kind, x, y,
    vx: range(state.rng, -24, 24),
    vy: range(state.rng, -24, 24),
    age: 0,
  });
}

function fireNova(state) {
  if (state.novaCharges <= 0 || state.phase === PHASE_WON || state.phase === PHASE_LOST) return;
  state.novaCharges -= 1;
  state.stats.novasUsed += 1;
  state.events.push('nova');
  state.trauma = Math.min(1, state.trauma + 0.55);
  state.shockwaves.push({
    x: state.player.x, y: state.player.y, radius: 12, maxRadius: NOVA.radius,
    life: 0.45, maxLife: 0.45, color: '#aefcff',
  });
  burst(state, state.player.x, state.player.y, 42, '#aefcff', 340, 3, 0.8);
  // A snapshot: a dying bulwark splits into drifters mid-blast, and the nova
  // has already swept the space they appear in — they survive it.
  for (const enemy of [...state.enemies]) {
    if (!enemy.dead && distance(state.player.x, state.player.y, enemy.x, enemy.y) <= NOVA.radius + enemy.radius) {
      const before = state.score;
      killEnemy(state, enemy, true);
      // Nova kills pay at a fraction: trim the difference back off.
      state.score = before + Math.round((state.score - before) * NOVA.scoreFraction);
    }
  }
}

function stepPlayer(state, input, dt) {
  const player = state.player;
  const length = Math.hypot(input.move.x, input.move.y) || 1;
  const targetVx = (input.move.x / length) * PLAYER.speed * Math.min(1, Math.hypot(input.move.x, input.move.y));
  const targetVy = (input.move.y / length) * PLAYER.speed * Math.min(1, Math.hypot(input.move.x, input.move.y));
  const blend = Math.min(1, PLAYER.acceleration * dt / PLAYER.speed);
  player.vx += (targetVx - player.vx) * blend;
  player.vy += (targetVy - player.vy) * blend;
  player.x += player.vx * dt;
  player.y += player.vy * dt;
  player.thrust = Math.min(1, Math.hypot(player.vx, player.vy) / PLAYER.speed);

  // Keep the warden inside the field and out of the star itself.
  player.x = Math.max(PLAYER.radius, Math.min(FIELD.width - PLAYER.radius, player.x));
  player.y = Math.max(PLAYER.radius, Math.min(FIELD.height - PLAYER.radius, player.y));
  const coreDistance = distance(player.x, player.y, CORE.x, CORE.y);
  const minCoreDistance = CORE.radius + PLAYER.radius + 4;
  if (coreDistance < minCoreDistance && coreDistance > 0.001) {
    const push = minCoreDistance / coreDistance;
    player.x = CORE.x + (player.x - CORE.x) * push;
    player.y = CORE.y + (player.y - CORE.y) * push;
  }

  player.angle = Math.atan2(input.aim.y - player.y, input.aim.x - player.x);
  player.grace = Math.max(0, player.grace - dt);
  player.fireTimer -= dt;

  if (input.firing && player.fireTimer <= 0 && state.phase === PHASE_ACTIVE) {
    player.fireTimer = PLAYER.fireInterval;
    const angles = state.overchargeTimer > 0 ? [-0.11, 0, 0.11] : [0];
    for (const offset of angles) {
      const angle = player.angle + offset;
      state.bullets.push({
        x: player.x + Math.cos(player.angle) * (PLAYER.radius + 6),
        y: player.y + Math.sin(player.angle) * (PLAYER.radius + 6),
        vx: Math.cos(angle) * PLAYER.bulletSpeed,
        vy: Math.sin(angle) * PLAYER.bulletSpeed,
        life: 1.1,
        dead: false,
      });
      state.stats.shotsFired += 1;
    }
    state.events.push('shoot');
    // A little engine-kick of sparks from the muzzle.
    burst(state, player.x + Math.cos(player.angle) * 18, player.y + Math.sin(player.angle) * 18, 1, '#aefcff', 60, 1.6, 0.18);
  }
  if (input.nova) fireNova(state);
}

function stepEnemies(state, dt) {
  for (const enemy of state.enemies) {
    if (enemy.dead) continue;
    const spec = ENEMIES[enemy.kind];
    const toCore = Math.atan2(CORE.y - enemy.y, CORE.x - enemy.x);
    let heading = toCore;
    if (enemy.kind === 'drifter') {
      heading = toCore + Math.sin(state.time * 2.1 + enemy.wobblePhase) * 0.45;
    } else if (enemy.kind === 'weaver') {
      // Weavers are hunters: far out they make for the core like the rest,
      // but a warden within reach is worth more to the Hollow than the
      // light is, and they turn for the ship, weaving hard as they come.
      const player = state.player;
      const playerGap = distance(enemy.x, enemy.y, player.x, player.y);
      const hunt = playerGap < 280 ? Math.atan2(player.y - enemy.y, player.x - enemy.x) : toCore;
      heading = hunt + Math.sin(state.time * 5.2 + enemy.wobblePhase) * 0.85;
    }
    enemy.vx += (Math.cos(heading) * enemy.speed - enemy.vx) * Math.min(1, dt * 2.2);
    enemy.vy += (Math.sin(heading) * enemy.speed - enemy.vy) * Math.min(1, dt * 2.2);
    enemy.x += enemy.vx * dt;
    enemy.y += enemy.vy * dt;
    enemy.angle += enemy.spin * dt;
    enemy.flash = Math.max(0, enemy.flash - dt);

    // Reaching the core: latch, drain, die.
    if (distance(enemy.x, enemy.y, CORE.x, CORE.y) < CORE.latchRadius) {
      enemy.dead = true;
      state.core.integrity -= spec.coreDamage;
      state.core.pulseHit = 1;
      state.trauma = Math.min(1, state.trauma + 0.22);
      burst(state, enemy.x, enemy.y, 16, '#ff5470', 220, 3, 0.6);
      state.events.push('corehit');
      if (state.core.integrity <= 0) {
        state.core.integrity = 0;
        state.phase = PHASE_LOST;
        state.events.push('over');
        burst(state, CORE.x, CORE.y, 90, '#ffd166', 420, 4, 1.4);
        state.shockwaves.push({ x: CORE.x, y: CORE.y, radius: 10, maxRadius: 340, life: 0.9, maxLife: 0.9, color: '#ffd166' });
      }
      continue;
    }

    // Reaching the warden: tear the hull, die trying.
    const player = state.player;
    if (player.grace <= 0 && distance(enemy.x, enemy.y, player.x, player.y) < enemy.radius + PLAYER.radius) {
      enemy.dead = true;
      player.hull -= spec.hullDamage;
      player.grace = PLAYER.graceSeconds;
      state.trauma = Math.min(1, state.trauma + 0.38);
      burst(state, enemy.x, enemy.y, 20, '#ff5470', 260, 3.2, 0.7);
      state.events.push('hit');
      if (player.hull <= 0) {
        player.hull = 0;
        state.phase = PHASE_LOST;
        state.events.push('over');
        burst(state, player.x, player.y, 80, '#4de3ff', 400, 4, 1.3);
        state.shockwaves.push({ x: player.x, y: player.y, radius: 10, maxRadius: 300, life: 0.8, maxLife: 0.8, color: '#4de3ff' });
      }
    }
  }
  state.enemies = state.enemies.filter((enemy) => !enemy.dead);
}

function stepBullets(state, dt) {
  for (const bullet of state.bullets) {
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    bullet.life -= dt;
    if (bullet.life <= 0 || bullet.x < -20 || bullet.x > FIELD.width + 20 || bullet.y < -20 || bullet.y > FIELD.height + 20) {
      bullet.dead = true;
      continue;
    }
    for (const enemy of state.enemies) {
      if (enemy.dead) continue;
      if (distance(bullet.x, bullet.y, enemy.x, enemy.y) < enemy.radius + PLAYER.bulletRadius) {
        bullet.dead = true;
        state.stats.shotsHit += 1;
        enemy.hp -= 1;
        enemy.flash = 0.09;
        burst(state, bullet.x, bullet.y, 3, '#aefcff', 140, 2, 0.3);
        if (enemy.hp <= 0) killEnemy(state, enemy, true);
        break;
      }
    }
  }
  state.bullets = state.bullets.filter((bullet) => !bullet.dead);
  state.enemies = state.enemies.filter((enemy) => !enemy.dead);
}

function stepPickups(state, dt) {
  const player = state.player;
  for (const pickup of state.pickups) {
    pickup.age += dt;
    const gap = distance(pickup.x, pickup.y, player.x, player.y);
    if (gap < 110) {
      pickup.vx += ((player.x - pickup.x) / gap) * 320 * dt;
      pickup.vy += ((player.y - pickup.y) / gap) * 320 * dt;
    }
    pickup.vx *= 1 - 1.6 * dt;
    pickup.vy *= 1 - 1.6 * dt;
    pickup.x += pickup.vx * dt;
    pickup.y += pickup.vy * dt;
    if (gap < PICKUPS.radius + PLAYER.radius + 4) {
      pickup.age = PICKUPS.lifetime + 1;
      applyPickup(state, pickup.kind);
    }
  }
  state.pickups = state.pickups.filter((pickup) => pickup.age <= PICKUPS.lifetime);
}

function applyPickup(state, kind) {
  const player = state.player;
  state.events.push('pickup');
  if (kind === 'overcharge') {
    state.overchargeTimer = PICKUPS.overchargeSeconds;
    floater(state, player.x, player.y - 26, 'OVERCHARGE', '#ffd166', 17);
  } else if (kind === 'repair') {
    player.hull = Math.min(PLAYER.maxHull, player.hull + PICKUPS.repairHull);
    state.core.integrity = Math.min(CORE.maxIntegrity, state.core.integrity + PICKUPS.repairCore);
    floater(state, player.x, player.y - 26, 'RESTORED', '#5df2a6', 17);
  } else {
    state.novaCharges = Math.min(NOVA.maxCharges, state.novaCharges + 1);
    floater(state, player.x, player.y - 26, '+1 NOVA', '#aefcff', 17);
  }
  burst(state, player.x, player.y, 16, '#5df2a6', 180, 2.6, 0.5);
}

function stepEffects(state, dt) {
  for (const particle of state.particles) {
    particle.life -= dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vx *= 1 - particle.drag * dt;
    particle.vy *= 1 - particle.drag * dt;
  }
  state.particles = state.particles.filter((particle) => particle.life > 0);
  for (const floaterItem of state.floaters) {
    floaterItem.life -= dt;
    floaterItem.y -= 34 * dt;
  }
  state.floaters = state.floaters.filter((item) => item.life > 0);
  for (const wave of state.shockwaves) {
    wave.life -= dt;
    wave.radius += (wave.maxRadius - wave.radius) * Math.min(1, dt * 9);
  }
  state.shockwaves = state.shockwaves.filter((wave) => wave.life > 0);
}

/**
 * Advances the world one fixed step. `input` is { move: {x, y}, aim: {x, y},
 * firing, nova } with move's sides in [-1, 1]; main.js builds it from the
 * keyboard and mouse, shots.js builds it from an autopilot.
 */
export function stepWorld(state, input, dt) {
  state.events.length = 0;
  if (state.hitStop > 0) {
    state.hitStop -= dt;
    return;
  }
  state.time += dt;
  state.trauma = Math.max(0, state.trauma - dt * 1.5);
  state.core.pulseHit = Math.max(0, state.core.pulseHit - dt * 2.4);
  state.overchargeTimer = Math.max(0, state.overchargeTimer - dt);
  if (state.combo.timer > 0) {
    state.combo.timer -= dt;
    if (state.combo.timer <= 0) {
      state.combo.chain = 0;
      state.combo.multiplier = 1;
    }
  }

  if (state.phase === PHASE_INTRO) {
    state.phaseTimer -= dt;
    if (state.phaseTimer <= 0) state.phase = PHASE_ACTIVE;
  } else if (state.phase === PHASE_BETWEEN) {
    state.phaseTimer -= dt;
    if (state.phaseTimer <= 0) startWave(state, state.wave + 1);
  } else if (state.phase === PHASE_ACTIVE) {
    if (state.spawnQueue.length > 0) {
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0) {
        const surge = state.wave % WAVES.surgeEvery === 0;
        // The trickle tightens as the waves rise: the late game is a crowd.
        const tightening = Math.max(0.62, 1 - state.wave * 0.04);
        state.spawnTimer = WAVES.spawnInterval * tightening * (surge ? 0.55 : 1);
        const kind = state.spawnQueue.shift();
        const point = edgePoint(state.rng, FIELD.width, FIELD.height);
        state.enemies.push(makeEnemy(state, kind, point.x, point.y));
      }
    } else if (state.enemies.length === 0) {
      // The wave is cleared: a breath, a bonus, a nova charge back.
      state.score += 150 * state.wave;
      state.novaCharges = Math.min(NOVA.maxCharges, state.novaCharges + 1);
      floater(state, CORE.x, CORE.y - 64, `WAVE ${state.wave} HELD  +${150 * state.wave}`, '#ffd166', 19);
      if (state.wave >= WAVES.total) {
        state.phase = PHASE_WON;
        state.events.push('win');
      } else {
        state.phase = PHASE_BETWEEN;
        state.phaseTimer = WAVES.betweenSeconds;
      }
    }
  }

  const terminal = state.phase === PHASE_WON || state.phase === PHASE_LOST;
  if (!terminal) {
    stepPlayer(state, input, dt);
    stepEnemies(state, dt);
    stepBullets(state, dt);
    stepPickups(state, dt);
  }
  stepEffects(state, dt);
}

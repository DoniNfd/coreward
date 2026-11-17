// COREWARD — everything the player sees. render.js reads the world that
// world.js steps and draws it: a nebula field and its last star, the warden,
// the three Hollow kinds, the shots and sparks between them, the HUD, and
// the title, pause, game-over and dawn screens. It never changes the world.
//
// The look, in one paragraph: deep violet-and-teal space, a warm golden core
// at the centre of everything, cyan for the warden and magenta-orange for
// the Hollow, additive glows for anything that burns, and clean letterspaced
// capitals for every word on screen.

import { COLORS, COMBO, CORE, FIELD, NOVA, PLAYER, WAVES } from './config.js';
import { PHASE_ACTIVE, PHASE_BETWEEN, PHASE_INTRO, PHASE_LOST, PHASE_WON } from './world.js';
import { createRng } from './random.js';

/** The screens main.js can ask for; the world underneath keeps its own phase. */
export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSE = 'pause';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

const TAU = Math.PI * 2;
const FONT = '"Segoe UI", system-ui, -apple-system, sans-serif';

/** The starfield: three depths of stars, fixed by a seed so every load matches. */
function makeStars() {
  const rng = createRng(0xc0ffee);
  const layers = [];
  const counts = [90, 60, 34];
  const depths = [0.012, 0.03, 0.06];
  for (let layer = 0; layer < 3; layer += 1) {
    const stars = [];
    for (let i = 0; i < counts[layer]; i += 1) {
      stars.push({
        x: rng() * FIELD.width,
        y: rng() * FIELD.height,
        size: 0.7 + rng() * (layer * 0.7 + 0.9),
        phase: rng() * TAU,
        speed: 0.6 + rng() * 1.8,
      });
    }
    layers.push({ stars, depth: depths[layer] });
  }
  return layers;
}

/** The nebula backdrop, painted once to an offscreen canvas: gradients, no images. */
function paintBackdrop() {
  const canvas = document.createElement('canvas');
  canvas.width = FIELD.width;
  canvas.height = FIELD.height;
  const ctx = canvas.getContext('2d');
  const base = ctx.createLinearGradient(0, 0, 0, FIELD.height);
  base.addColorStop(0, '#0a0a1e');
  base.addColorStop(0.55, COLORS.void);
  base.addColorStop(1, '#050510');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);

  const blobs = [
    { x: 240, y: 130, r: 420, color: COLORS.nebulaViolet },
    { x: 1080, y: 560, r: 460, color: COLORS.nebulaTeal },
    { x: 980, y: 110, r: 300, color: COLORS.nebulaEmber },
    { x: 180, y: 610, r: 320, color: 'rgba(30, 64, 175, 0.40)' },
    { x: 640, y: 360, r: 300, color: 'rgba(255, 154, 60, 0.10)' },
  ];
  ctx.globalCompositeOperation = 'lighter';
  for (const blob of blobs) {
    const gradient = ctx.createRadialGradient(blob.x, blob.y, 0, blob.x, blob.y, blob.r);
    gradient.addColorStop(0, blob.color);
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(blob.x - blob.r, blob.y - blob.r, blob.r * 2, blob.r * 2);
  }
  ctx.globalCompositeOperation = 'source-over';

  const vignette = ctx.createRadialGradient(640, 360, 320, 640, 360, 780);
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(1, 'rgba(0, 0, 0, 0.5)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  return canvas;
}

function text(ctx, value, x, y, { size = 16, weight = 700, color = COLORS.text, align = 'center', spacing = 0, alpha = 1 } = {}) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  try {
    ctx.letterSpacing = `${spacing}px`;
  } catch {
    // Older engines draw without letterspacing; the words still read.
  }
  ctx.fillStyle = color;
  ctx.fillText(value, x, y);
  ctx.restore();
}

function bar(ctx, x, y, width, height, fraction, goodColor, label, value) {
  ctx.save();
  ctx.fillStyle = 'rgba(6, 12, 24, 0.72)';
  ctx.strokeStyle = 'rgba(140, 200, 230, 0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 4);
  ctx.fill();
  ctx.stroke();
  const hue = fraction > 0.5 ? goodColor : fraction > 0.25 ? COLORS.gold : COLORS.danger;
  ctx.fillStyle = hue;
  ctx.beginPath();
  ctx.roundRect(x + 2, y + 2, Math.max(0, (width - 4) * fraction), height - 4, 3);
  ctx.fill();
  ctx.restore();
  text(ctx, label, x, y - 11, { size: 11, color: COLORS.textDim, align: 'left', spacing: 2 });
  text(ctx, value, x + width, y - 11, { size: 11, color: COLORS.text, align: 'right', spacing: 1 });
}

function drawCore(ctx, state) {
  const pulse = 1 + Math.sin(state.time * 2.2) * 0.03 + state.core.pulseHit * 0.1;
  const radius = CORE.radius * pulse;
  ctx.save();
  ctx.translate(CORE.x, CORE.y);

  const glow = ctx.createRadialGradient(0, 0, radius * 0.4, 0, 0, radius * 4.4);
  glow.addColorStop(0, 'rgba(255, 190, 80, 0.5)');
  glow.addColorStop(0.5, 'rgba(255, 140, 50, 0.16)');
  glow.addColorStop(1, 'rgba(255, 120, 40, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 4.4, 0, TAU);
  ctx.fill();

  // Corona arcs, turning slowly against each other.
  ctx.strokeStyle = 'rgba(255, 190, 90, 0.5)';
  ctx.lineWidth = 2;
  for (const [ringRadius, dash, speed, offset] of [[1.35, 14, 0.24, 0], [1.62, 8, -0.17, 2.1], [1.9, 22, 0.1, 4.0]]) {
    ctx.save();
    ctx.rotate(state.time * speed + offset);
    ctx.setLineDash([dash, dash * 0.7]);
    ctx.beginPath();
    ctx.arc(0, 0, radius * ringRadius, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
  ctx.setLineDash([]);

  const body = ctx.createRadialGradient(-radius * 0.3, -radius * 0.3, radius * 0.1, 0, 0, radius);
  body.addColorStop(0, COLORS.coreHeart);
  body.addColorStop(0.55, COLORS.coreMid);
  body.addColorStop(1, COLORS.coreEdge);
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, TAU);
  ctx.fill();

  // Embers: sparks the star sheds, rising and guttering out. Each one's
  // place is a pure function of its index and the time, so the frame is the
  // same whenever it is taken and no state is kept for them here.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 14; i += 1) {
    const seedA = Math.sin(i * 127.1) * 43758.5453;
    const seedB = Math.sin(i * 311.7) * 12543.1234;
    const frac = (state.time * (0.05 + (seedA - Math.floor(seedA)) * 0.08) + (seedB - Math.floor(seedB))) % 1;
    const angle = (seedA - Math.floor(seedA)) * TAU + state.time * 0.12;
    const orbit = radius * (1.25 + (seedB - Math.floor(seedB)) * 0.9);
    const ex = Math.cos(angle) * orbit;
    const ey = Math.sin(angle) * orbit - frac * 74;
    ctx.globalAlpha = (1 - frac) * 0.75;
    ctx.fillStyle = frac < 0.5 ? '#ffd166' : '#ff9a3c';
    ctx.beginPath();
    ctx.arc(ex, ey, 1.4 + (1 - frac) * 1.6, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
  ctx.globalAlpha = 1;

  if (state.core.pulseHit > 0) {
    ctx.strokeStyle = `rgba(255, 84, 112, ${state.core.pulseHit * 0.8})`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, radius + 6, 0, TAU);
    ctx.stroke();
  }

  // The integrity ring: what is left of the light.
  const fraction = state.core.integrity / CORE.maxIntegrity;
  ctx.strokeStyle = 'rgba(20, 40, 55, 0.8)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(0, 0, radius + 13, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = fraction > 0.5 ? COLORS.coreRing : fraction > 0.25 ? COLORS.gold : COLORS.danger;
  ctx.beginPath();
  ctx.arc(0, 0, radius + 13, -Math.PI / 2, -Math.PI / 2 + fraction * TAU);
  ctx.stroke();
  ctx.restore();
}

function drawShip(ctx, state) {
  const player = state.player;
  if (state.phase === PHASE_LOST && player.hull <= 0) return;
  // The pool of light she carries with her through the dark.
  const pool = ctx.createRadialGradient(player.x, player.y, 4, player.x, player.y, 58);
  pool.addColorStop(0, 'rgba(120, 230, 255, 0.13)');
  pool.addColorStop(1, 'rgba(120, 230, 255, 0)');
  ctx.fillStyle = pool;
  ctx.beginPath();
  ctx.arc(player.x, player.y, 58, 0, TAU);
  ctx.fill();
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.rotate(player.angle);

  // Engine flame, longer the faster she flies.
  const flicker = 0.8 + Math.sin(state.time * 42) * 0.2;
  const flameLength = (10 + player.thrust * 16) * flicker;
  const flame = ctx.createLinearGradient(-PLAYER.radius, 0, -PLAYER.radius - flameLength, 0);
  flame.addColorStop(0, 'rgba(160, 240, 255, 0.9)');
  flame.addColorStop(0.4, 'rgba(255, 179, 71, 0.75)');
  flame.addColorStop(1, 'rgba(255, 120, 60, 0)');
  ctx.fillStyle = flame;
  ctx.beginPath();
  ctx.moveTo(-PLAYER.radius + 2, -4.5);
  ctx.lineTo(-PLAYER.radius - flameLength, 0);
  ctx.lineTo(-PLAYER.radius + 2, 4.5);
  ctx.closePath();
  ctx.fill();

  // The dart: a sleek arrow with swept wings and a cyan spine.
  const body = ctx.createLinearGradient(-PLAYER.radius, 0, PLAYER.radius + 6, 0);
  body.addColorStop(0, '#7d99b8');
  body.addColorStop(0.55, COLORS.hull);
  body.addColorStop(1, '#ffffff');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(PLAYER.radius + 7, 0);
  ctx.lineTo(-PLAYER.radius + 3, -6);
  ctx.lineTo(-PLAYER.radius - 4, -13);
  ctx.lineTo(-PLAYER.radius - 1, -3);
  ctx.lineTo(-PLAYER.radius - 1, 3);
  ctx.lineTo(-PLAYER.radius - 4, 13);
  ctx.lineTo(-PLAYER.radius + 3, 6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = COLORS.hullAccent;
  ctx.beginPath();
  ctx.moveTo(PLAYER.radius + 2, 0);
  ctx.lineTo(-PLAYER.radius + 2, -2.6);
  ctx.lineTo(-PLAYER.radius + 2, 2.6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#0b2436';
  ctx.beginPath();
  ctx.arc(4, 0, 3.1, 0, TAU);
  ctx.fill();
  ctx.restore();

  // The grace shield, a soap-bubble ring while she cannot be hurt.
  if (player.grace > 0.15) {
    ctx.save();
    ctx.strokeStyle = `rgba(120, 240, 255, ${0.25 + 0.35 * Math.abs(Math.sin(state.time * 10))})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(player.x, player.y, PLAYER.radius + 9, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
}

function drawEnemy(ctx, state, enemy) {
  ctx.save();
  ctx.translate(enemy.x, enemy.y);
  if (enemy.kind === 'drifter') {
    ctx.rotate(enemy.angle);
    ctx.fillStyle = '#2a1650';
    ctx.strokeStyle = COLORS.drifter;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    const points = 7;
    for (let i = 0; i < points; i += 1) {
      const a = (i / points) * TAU;
      const r = enemy.radius * (i % 2 === 0 ? 1 : 0.68);
      if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = COLORS.drifterEye;
    ctx.beginPath();
    ctx.arc(0, 0, 3.4, 0, TAU);
    ctx.fill();
  } else if (enemy.kind === 'weaver') {
    const heading = Math.atan2(enemy.vy, enemy.vx);
    // A fading wake of ghosts behind the dart.
    for (let i = 3; i >= 1; i -= 1) {
      ctx.save();
      ctx.globalAlpha = 0.07 * i;
      ctx.translate(-Math.cos(heading) * i * 9, -Math.sin(heading) * i * 9);
      ctx.rotate(heading);
      ctx.fillStyle = COLORS.weaver;
      ctx.beginPath();
      ctx.moveTo(enemy.radius, 0);
      ctx.lineTo(-enemy.radius, -5);
      ctx.lineTo(-enemy.radius, 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.rotate(heading);
    ctx.fillStyle = COLORS.weaverFin;
    ctx.beginPath();
    ctx.moveTo(-2, 0);
    ctx.lineTo(-enemy.radius - 3, -10);
    ctx.lineTo(-enemy.radius + 3, 0);
    ctx.lineTo(-enemy.radius - 3, 10);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = COLORS.weaver;
    ctx.beginPath();
    ctx.moveTo(enemy.radius + 3, 0);
    ctx.lineTo(-enemy.radius, -5.5);
    ctx.lineTo(-enemy.radius, 5.5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(2, 0, 2.4, 0, TAU);
    ctx.fill();
  } else {
    // Bulwark: plated hexagon, a turning heart, pips for its remaining hull.
    ctx.rotate(enemy.angle * 0.4);
    ctx.fillStyle = '#4a1e08';
    ctx.strokeStyle = COLORS.bulwark;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * TAU;
      if (i === 0) ctx.moveTo(Math.cos(a) * enemy.radius, Math.sin(a) * enemy.radius);
      else ctx.lineTo(Math.cos(a) * enemy.radius, Math.sin(a) * enemy.radius);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.rotate(-enemy.angle * 0.9);
    ctx.fillStyle = COLORS.bulwarkPlate;
    ctx.beginPath();
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * TAU;
      const r = enemy.radius * 0.52;
      if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff3c4';
    ctx.beginPath();
    ctx.arc(0, 0, 4.4, 0, TAU);
    ctx.fill();
    ctx.rotate(enemy.angle * 0.5);
    ctx.fillStyle = 'rgba(255, 209, 102, 0.9)';
    for (let i = 0; i < enemy.maxHp; i += 1) {
      if (i >= enemy.hp) continue;
      const a = (i / enemy.maxHp) * TAU - Math.PI / 2;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * (enemy.radius + 7), Math.sin(a) * (enemy.radius + 7), 2.2, 0, TAU);
      ctx.fill();
    }
  }
  if (enemy.flash > 0) {
    ctx.globalAlpha = (enemy.flash / 0.09) * 0.75;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, enemy.radius, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function drawPickup(ctx, state, pickup) {
  const bob = Math.sin(state.time * 3 + pickup.x) * 3;
  const blink = pickup.age > 6.5 && Math.sin(state.time * 14) > 0;
  ctx.save();
  ctx.translate(pickup.x, pickup.y + bob);
  ctx.globalAlpha = blink ? 0.35 : 1;
  const colors = { overcharge: COLORS.gold, repair: COLORS.heal, nova: COLORS.bullet };
  const color = colors[pickup.kind];
  const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, 26);
  glow.addColorStop(0, color);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha *= 0.5;
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, 26, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = blink ? 0.35 : 1;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, 12, 0, TAU);
  ctx.stroke();
  ctx.fillStyle = color;
  if (pickup.kind === 'overcharge') {
    ctx.beginPath();
    ctx.moveTo(2, -8);
    ctx.lineTo(-4.5, 1.5);
    ctx.lineTo(-0.5, 1.5);
    ctx.lineTo(-2, 8);
    ctx.lineTo(4.5, -1.5);
    ctx.lineTo(0.5, -1.5);
    ctx.closePath();
    ctx.fill();
  } else if (pickup.kind === 'repair') {
    ctx.fillRect(-2.2, -7.5, 4.4, 15);
    ctx.fillRect(-7.5, -2.2, 15, 4.4);
  } else {
    ctx.beginPath();
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * TAU;
      const r = i % 2 === 0 ? 8.5 : 3.4;
      if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawWorld(ctx, state, stars, backdrop) {
  ctx.drawImage(backdrop, 0, 0);
  // Starfield with a whisper of parallax against the warden's position.
  const px = (state.player.x - CORE.x) / CORE.x;
  const py = (state.player.y - CORE.y) / CORE.y;
  for (const layer of stars) {
    for (const star of layer.stars) {
      const twinkle = 0.55 + 0.45 * Math.sin(state.time * star.speed + star.phase);
      ctx.globalAlpha = twinkle * 0.85;
      ctx.fillStyle = star.size > 1.9 ? COLORS.starBright : COLORS.starDim;
      ctx.beginPath();
      ctx.arc(star.x - px * layer.depth * 300, star.y - py * layer.depth * 300, star.size, 0, TAU);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  for (const pickup of state.pickups) drawPickup(ctx, state, pickup);
  drawCore(ctx, state);
  for (const enemy of state.enemies) drawEnemy(ctx, state, enemy);

  // Bullets burn additive: a wide coloured pass under a white-hot core pass.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (const bullet of state.bullets) {
    ctx.strokeStyle = 'rgba(77, 227, 255, 0.55)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(bullet.x - bullet.vx * 0.024, bullet.y - bullet.vy * 0.024);
    ctx.lineTo(bullet.x, bullet.y);
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bullet.x - bullet.vx * 0.014, bullet.y - bullet.vy * 0.014);
    ctx.lineTo(bullet.x, bullet.y);
    ctx.stroke();
  }
  for (const particle of state.particles) {
    ctx.globalAlpha = Math.max(0, particle.life / particle.maxLife);
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.size, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
  ctx.globalAlpha = 1;

  for (const wave of state.shockwaves) {
    ctx.save();
    ctx.globalAlpha = (wave.life / wave.maxLife) * 0.8;
    ctx.strokeStyle = wave.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(wave.x, wave.y, wave.radius, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  drawShip(ctx, state);

  for (const item of state.floaters) {
    text(ctx, item.text, item.x, item.y, {
      size: item.size, color: item.color, alpha: Math.min(1, item.life / item.maxLife * 1.6),
    });
  }
}

function drawHud(ctx, state, remaining) {
  const pad = 26;
  text(ctx, 'SCORE', pad, 30, { size: 11, color: COLORS.textDim, align: 'left', spacing: 3 });
  text(ctx, String(state.score).padStart(6, '0'), pad, 56, { size: 30, color: COLORS.text, align: 'left', spacing: 1 });

  if (state.combo.multiplier > 1) {
    const comboWidth = 118;
    ctx.save();
    ctx.fillStyle = 'rgba(255, 209, 102, 0.16)';
    ctx.strokeStyle = 'rgba(255, 209, 102, 0.65)';
    ctx.beginPath();
    ctx.roundRect(pad, 76, comboWidth, 22, 11);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    text(ctx, `COMBO ×${state.combo.multiplier}`, pad + comboWidth / 2, 88, { size: 13, color: COLORS.gold, spacing: 1 });
    ctx.fillStyle = 'rgba(255, 209, 102, 0.75)';
    ctx.fillRect(pad, 102, comboWidth * (state.combo.timer / COMBO.windowSeconds), 3);
  }
  if (state.overchargeTimer > 0) {
    text(ctx, `OVERCHARGE ${state.overchargeTimer.toFixed(1)}`, pad, 122, { size: 12, color: COLORS.gold, align: 'left', spacing: 2 });
  }

  text(ctx, `WAVE ${Math.max(1, state.wave)} / ${WAVES.total}`, FIELD.width / 2, 34, { size: 15, spacing: 4 });
  text(ctx, remaining > 0 ? `${remaining} HOSTILE${remaining === 1 ? '' : 'S'} INBOUND` : 'FIELD CLEAR', FIELD.width / 2, 56, {
    size: 11, color: remaining > 0 ? COLORS.textDim : COLORS.heal, spacing: 2,
  });

  bar(ctx, pad, FIELD.height - 34, 230, 13, state.player.hull / PLAYER.maxHull, COLORS.heal, 'HULL', `${Math.ceil(state.player.hull)}`);
  bar(ctx, FIELD.width - pad - 230, FIELD.height - 34, 230, 13, state.core.integrity / CORE.maxIntegrity, COLORS.coreRing, 'CORE', `${Math.ceil(state.core.integrity)}`);

  // Nova pips, bottom centre.
  for (let i = 0; i < NOVA.maxCharges; i += 1) {
    const x = FIELD.width / 2 + (i - (NOVA.maxCharges - 1) / 2) * 26;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, FIELD.height - 28, 8, 0, TAU);
    if (i < state.novaCharges) {
      ctx.fillStyle = COLORS.bullet;
      ctx.shadowColor = COLORS.bullet;
      ctx.shadowBlur = 10;
      ctx.fill();
    } else {
      ctx.strokeStyle = 'rgba(140, 200, 230, 0.4)';
      ctx.stroke();
    }
    ctx.restore();
  }
  text(ctx, 'NOVA — E / RIGHT CLICK', FIELD.width / 2, FIELD.height - 52, { size: 10, color: COLORS.textDim, spacing: 2 });

  if (state.core.integrity <= 30 && state.phase !== PHASE_LOST) {
    const blink = 0.5 + 0.5 * Math.sin(state.time * 6);
    text(ctx, '⚠ CORE FAILING ⚠', FIELD.width / 2, 92, { size: 15, color: COLORS.danger, spacing: 3, alpha: 0.4 + blink * 0.6 });
  }

  // The wave banner, while the phase is introducing or resting.
  if (state.phase === PHASE_INTRO && state.banner.title) {
    const fade = Math.min(1, state.phaseTimer / 0.5, (1.6 - state.phaseTimer) / 0.3 + 0.4);
    text(ctx, state.banner.title, FIELD.width / 2, 210, { size: 44, spacing: 8, alpha: Math.max(0, Math.min(1, fade)) });
    if (state.banner.sub) {
      text(ctx, state.banner.sub, FIELD.width / 2, 248, { size: 15, weight: 400, color: COLORS.textDim, spacing: 1, alpha: Math.max(0, Math.min(1, fade)) });
    }
  }
}

function statsRows(ctx, state, best) {
  const accuracy = state.stats.shotsFired > 0 ? Math.round((state.stats.shotsHit / state.stats.shotsFired) * 100) : 0;
  const rows = [
    ['SCORE', String(state.score)],
    ['BEST', String(Math.max(best, state.score))],
    ['WAVE REACHED', `${state.wave} / ${WAVES.total}`],
    ['HOLLOW DOWN', String(state.kills)],
    ['ACCURACY', `${accuracy}%`],
    ['PEAK COMBO', `×${state.stats.peakMultiplier}`],
  ];
  let y = 356;
  for (const [label, value] of rows) {
    text(ctx, label, FIELD.width / 2 - 130, y, { size: 14, color: COLORS.textDim, align: 'right', spacing: 2 });
    text(ctx, value, FIELD.width / 2 - 110, y, { size: 16, color: COLORS.text, align: 'left', spacing: 1 });
    y += 30;
  }
  return y;
}

function veil(ctx, tint) {
  const gradient = ctx.createLinearGradient(0, 0, 0, FIELD.height);
  gradient.addColorStop(0, 'rgba(4, 4, 12, 0.55)');
  gradient.addColorStop(0.5, tint);
  gradient.addColorStop(1, 'rgba(4, 4, 12, 0.78)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);
}

function drawTitle(ctx, state, best) {
  veil(ctx, 'rgba(20, 8, 44, 0.35)');
  const gradient = ctx.createLinearGradient(FIELD.width / 2 - 260, 0, FIELD.width / 2 + 260, 0);
  gradient.addColorStop(0, '#4de3ff');
  gradient.addColorStop(0.5, '#eaf7ff');
  gradient.addColorStop(1, '#ffd166');
  ctx.save();
  ctx.font = `800 96px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  try {
    ctx.letterSpacing = '14px';
  } catch { /* letterspacing is a garnish */ }
  ctx.shadowColor = 'rgba(77, 227, 255, 0.55)';
  ctx.shadowBlur = 34;
  ctx.fillStyle = gradient;
  ctx.fillText('COREWARD', FIELD.width / 2, 168);
  ctx.restore();
  text(ctx, 'LAST LIGHT OF THE HOLLOW STAR', FIELD.width / 2, 232, { size: 17, color: COLORS.gold, spacing: 6 });

  text(ctx, 'The last star is going out. The Hollow is coming to finish it.', FIELD.width / 2, 300, { size: 16, weight: 400, color: COLORS.text });
  text(ctx, 'You are its warden. Hold ten waves, and dawn breaks.', FIELD.width / 2, 326, { size: 16, weight: 400, color: COLORS.text });

  const left = FIELD.width / 2 - 210;
  const controls = [
    ['MOVE', 'WASD / ARROW KEYS'],
    ['AIM', 'MOUSE'],
    ['FIRE', 'HOLD CLICK / SPACE'],
    ['NOVA BLAST', 'E / RIGHT CLICK'],
    ['PAUSE', 'P / ESC'],
  ];
  let y = 392;
  for (const [action, keys] of controls) {
    text(ctx, action, left, y, { size: 13, color: COLORS.textDim, align: 'left', spacing: 2 });
    text(ctx, keys, left + 130, y, { size: 13, color: COLORS.text, align: 'left', spacing: 1 });
    y += 26;
  }

  const pulse = 0.65 + 0.35 * Math.sin(state.time * 3.2);
  text(ctx, 'CLICK OR PRESS ENTER TO BEGIN', FIELD.width / 2, 566, { size: 18, color: COLORS.heal, spacing: 3, alpha: pulse });
  if (best > 0) text(ctx, `BEST SCORE ${best}`, FIELD.width / 2, 606, { size: 13, color: COLORS.textDim, spacing: 2 });
  text(ctx, 'AN ORIGINAL GAME IN A SINGLE PAGE OF CODE — NO NETWORK, NO TRACKING, ONLY THE LIGHT', FIELD.width / 2, 676, { size: 10, color: COLORS.textDim, spacing: 2 });
}

function drawEndScreen(ctx, state, best, won) {
  veil(ctx, won ? 'rgba(60, 38, 4, 0.4)' : 'rgba(52, 6, 18, 0.42)');
  if (won) {
    text(ctx, 'DAWN BREAKS', FIELD.width / 2, 190, { size: 64, color: COLORS.gold, spacing: 10 });
    text(ctx, 'Ten waves held. The Hollow recedes, and the star endures.', FIELD.width / 2, 248, { size: 17, weight: 400 });
  } else {
    text(ctx, 'THE LIGHT GOES OUT', FIELD.width / 2, 190, { size: 56, color: COLORS.danger, spacing: 8 });
    text(ctx, state.core.integrity <= 0 ? 'The core was drained. The dark keeps what it took.' : 'The warden fell, and no one was left to guard the flame.', FIELD.width / 2, 248, { size: 17, weight: 400 });
  }
  const y = statsRows(ctx, state, best);
  const pulse = 0.65 + 0.35 * Math.sin(state.time * 3.2);
  text(ctx, 'PRESS R TO REKINDLE', FIELD.width / 2, y + 26, { size: 17, color: COLORS.heal, spacing: 3, alpha: pulse });
}

/** Creates the renderer bound to a canvas: pre-paints the backdrop, seeds the stars. */
export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const backdrop = paintBackdrop();
  const stars = makeStars();

  /**
   * Draws one frame. `view` is { screen, best, remaining }: the screen
   * main.js is showing, the best score to quote, and the hostiles count the
   * HUD reports (world.js computes it; it is passed in to keep this file
   * free of simulation questions).
   */
  function draw(state, view) {
    ctx.clearRect(0, 0, FIELD.width, FIELD.height);
    ctx.save();
    if (state.trauma > 0) {
      const strength = state.trauma * state.trauma * 15;
      ctx.translate(Math.sin(state.time * 91) * strength, Math.cos(state.time * 113) * strength * 0.8);
    }
    drawWorld(ctx, state, stars, backdrop);
    ctx.restore();

    if (view.screen === SCREEN_PLAY || view.screen === SCREEN_PAUSE) drawHud(ctx, state, view.remaining);
    if (view.screen === SCREEN_TITLE) drawTitle(ctx, state, view.best);
    if (view.screen === SCREEN_PAUSE) {
      veil(ctx, 'rgba(4, 6, 16, 0.5)');
      text(ctx, 'PAUSED', FIELD.width / 2, 330, { size: 44, spacing: 10 });
      text(ctx, 'P / ESC TO RESUME', FIELD.width / 2, 380, { size: 14, color: COLORS.textDim, spacing: 3 });
    }
    if (view.screen === SCREEN_OVER) drawEndScreen(ctx, state, view.best, false);
    if (view.screen === SCREEN_WIN) drawEndScreen(ctx, state, view.best, true);
  }

  return { draw };
}

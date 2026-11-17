// COREWARD — the staged screenshot scenes behind ?shot=title|play|frenzy|end.
//
// Each scene is honest: it builds a fresh world from the scene's seed and
// plays the real rules forward with an autopilot at the controls, then
// hands the world to the renderer as it stands. The action scenes play
// inside a time window and stop at the first moment that shows the game
// well — a crowd of Hollow on screen, sparks in the air — the way a player
// would choose which frame of a session to share. Nothing is placed by
// hand and nothing is drawn that the game does not draw in play; the same
// seed always stages the same frame, so the screenshots in the entry are
// renders of the game itself, reproducible by anyone who opens
// game/?shot=play&seed=7 in a browser.

import { CORE, STEP } from './config.js';
import { createWorld, stepWorld, PHASE_LOST } from './world.js';

/**
 * The autopilot: a steady, unspectacular warden. It guards the lane between
 * the core and whichever Hollow is closest to the light, keeps its distance
 * from anything that might touch it, fires when a target is in reach, and
 * spends a nova when the swarm closes in. It also flies the title screen's
 * attract mode.
 */
export function pilotInput(state) {
  const player = state.player;
  let target = null;
  let targetCoreGap = Infinity;
  let nearest = null;
  let nearestGap = Infinity;
  let crowding = 0;
  for (const enemy of state.enemies) {
    const coreGap = Math.hypot(enemy.x - CORE.x, enemy.y - CORE.y);
    if (coreGap < targetCoreGap) {
      targetCoreGap = coreGap;
      target = enemy;
    }
    const gap = Math.hypot(enemy.x - player.x, enemy.y - player.y);
    if (gap < nearestGap) {
      nearestGap = gap;
      nearest = enemy;
    }
    if (gap < 175) crowding += 1;
  }

  let moveX = 0;
  let moveY = 0;
  if (target) {
    // Stand on the core's side of the target, two hundred pixels out from it.
    const away = Math.atan2(target.y - CORE.y, target.x - CORE.x);
    const postX = CORE.x + Math.cos(away) * Math.max(120, targetCoreGap - 150);
    const postY = CORE.y + Math.sin(away) * Math.max(120, targetCoreGap - 150);
    moveX = postX - player.x;
    moveY = postY - player.y;
  } else {
    // Nothing inbound: hold a slow patrol circle around the core.
    const patrol = state.time * 0.35;
    moveX = CORE.x + Math.cos(patrol) * 190 - player.x;
    moveY = CORE.y + Math.sin(patrol) * 190 - player.y;
  }
  if (nearest && nearestGap < 74) {
    moveX = player.x - nearest.x;
    moveY = player.y - nearest.y;
  }
  const length = Math.hypot(moveX, moveY);
  if (length > 26) {
    moveX /= length;
    moveY /= length;
  } else {
    moveX = 0;
    moveY = 0;
  }

  return {
    move: { x: moveX, y: moveY },
    aim: target ? { x: target.x, y: target.y } : { x: player.x + 1, y: player.y },
    firing: Boolean(target) && nearestGap < 620,
    nova: crowding >= 6 && state.novaCharges > 0,
  };
}

/** The controls of a warden who has given up: the end scene's pilot. */
function surrenderInput(state) {
  return {
    move: { x: 0, y: 0 },
    aim: { x: state.player.x + 1, y: state.player.y },
    firing: false,
    nova: false,
  };
}

function playForward(world, seconds, inputFor) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    stepWorld(world, inputFor(world), STEP);
    if (world.phase === PHASE_LOST) break;
  }
  return world;
}

/**
 * Plays a scene's window: at least minSeconds in, then stops at the first
 * frame `ready` approves of, and never runs past maxSeconds. The frame it
 * stops on is an ordinary frame of the run — the staging is in the choosing,
 * not in the drawing. `watch`, when given, sees every step, ready or not.
 */
function playUntil(world, inputFor, { minSeconds, maxSeconds, ready, watch }) {
  const minSteps = Math.round(minSeconds / STEP);
  const maxSteps = Math.round(maxSeconds / STEP);
  for (let i = 0; i < maxSteps; i += 1) {
    stepWorld(world, inputFor(world), STEP);
    if (watch) watch(world);
    if (world.phase === PHASE_LOST) break;
    if (i >= minSteps && ready(world)) break;
  }
  return world;
}

/**
 * Watches a run for recent violence: freshAction() reports whether the
 * score moved within the last `windowSteps` steps — a kill just happened,
 * so the frame has the sparks and floaters of it.
 */
function actionWatcher(windowSteps = 80) {
  let lastScore = null;
  let stepsSinceKill = Infinity;
  return {
    watch(world) {
      if (lastScore === null || world.score > lastScore) stepsSinceKill = 0;
      else stepsSinceKill += 1;
      lastScore = world.score;
    },
    freshAction() {
      return stepsSinceKill <= windowSteps;
    },
  };
}

/** The four scenes, by the name the URL and shots.json call them. */
export const SHOT_SCENES = {
  /** The title screen, with an attract-mode game already alive behind it. */
  title(seed) {
    const world = playUntil(createWorld(seed), pilotInput, {
      minSeconds: 6, maxSeconds: 16,
      ready: (w) => w.enemies.length >= 3,
    });
    return { screen: 'title', world };
  },
  /** Honest mid-game play: wave two or three, the warden working a crowd. */
  play(seed) {
    const action = actionWatcher();
    const world = playUntil(createWorld(seed), pilotInput, {
      minSeconds: 13, maxSeconds: 40,
      watch: action.watch,
      ready: (w) => w.enemies.length >= 4 && action.freshAction(),
    });
    return { screen: 'play', world };
  },
  /** The thick of it: a later wave, a bulwark on the field, sparks in the air. */
  frenzy(seed) {
    const action = actionWatcher();
    const world = playUntil(createWorld(seed), pilotInput, {
      minSeconds: 55, maxSeconds: 130,
      watch: action.watch,
      ready: (w) => w.wave >= 4 && w.enemies.length >= 6
        && (w.enemies.some((e) => e.kind === 'bulwark') || action.freshAction()),
    });
    return { screen: 'play', world };
  },
  /** The end: an unguarded core, drained — the game-over screen and its stats. */
  end(seed) {
    const world = playForward(createWorld(seed), 150, surrenderInput);
    return { screen: 'over', world };
  },
};

/** Builds the scene a ?shot= name asks for, or null when the name is unknown. */
export function buildShotScene(name, seed) {
  const scene = SHOT_SCENES[name];
  return scene ? scene(seed) : null;
}

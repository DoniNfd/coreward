// COREWARD — the boot and the loop. main.js owns the page: it builds the
// input, the renderer and the sound, runs the world at a fixed 60 steps a
// second however the display refreshes, and moves between the screens —
// title (with the game alive behind it, flown by the autopilot), play,
// pause, and the two ends of a run, dawn and dark.
//
// It is also where the screenshot scenes enter: a URL of the form
// ?shot=play&seed=7 stages the named scene from shots.js and holds it,
// frozen, for the picture to be taken. window.__corewardShot names the
// staged scene once its first frame is on the canvas.

import { STEP } from './config.js';
import { createAudio } from './audio.js';
import { createInput } from './input.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSE, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';
import { buildShotScene, pilotInput } from './shots.js';
import { createWorld, enemiesRemaining, stepWorld, PHASE_LOST, PHASE_WON } from './world.js';

const BEST_KEY = 'coreward.best';

function loadBest() {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

function saveBest(score) {
  try {
    localStorage.setItem(BEST_KEY, String(score));
  } catch {
    // Private modes forget; the game does not mind.
  }
}

function boot() {
  const canvas = document.getElementById('game');
  const renderer = canvas && canvas.getContext('2d') ? createRenderer(canvas) : null;
  if (!canvas || !renderer) {
    const fallback = document.getElementById('fallback');
    if (fallback) fallback.hidden = false;
    return;
  }

  const input = createInput(canvas);
  const audio = createAudio();
  let best = loadBest();

  // — The screenshot stage: build the scene, hold it, say when it is ready.
  const params = new URLSearchParams(window.location.search);
  const shotName = params.get('shot');
  if (shotName) {
    const seed = Number(params.get('seed')) || 1;
    const scene = buildShotScene(shotName, seed);
    if (scene) {
      renderer.draw(scene.world, { screen: scene.screen, best, remaining: enemiesRemaining(scene.world) });
      window.__corewardShot = shotName;
      return;
    }
  }

  // — The living game.
  let screen = SCREEN_TITLE;
  let world = createWorld((Date.now() % 100000) + 7);
  let accumulator = 0;
  let lastTime = performance.now();

  function startRun() {
    world = createWorld((Date.now() ^ 0x9e3779b9) >>> 0);
    screen = SCREEN_PLAY;
    audio.unlock();
  }

  function deviceInput() {
    return {
      move: input.moveAxis(),
      aim: { x: input.mouse.x, y: input.mouse.y },
      firing: input.firing(),
      nova: input.pressed('nova'),
    };
  }

  function stepOnce() {
    if (screen === SCREEN_TITLE) {
      stepWorld(world, pilotInput(world), STEP);
      if (world.phase === PHASE_LOST || world.phase === PHASE_WON) {
        world = createWorld((Date.now() % 100000) + 11);
      }
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    stepWorld(world, deviceInput(), STEP);
    for (const event of world.events) audio.play(event);
    if (world.phase === PHASE_LOST || world.phase === PHASE_WON) {
      if (world.score > best) {
        best = world.score;
        saveBest(best);
      }
      screen = world.phase === PHASE_WON ? SCREEN_WIN : SCREEN_OVER;
    }
  }

  function frame(now) {
    const elapsed = Math.min(0.1, (now - lastTime) / 1000);
    lastTime = now;

    if (screen === SCREEN_PLAY || screen === SCREEN_TITLE) {
      if (input.pressed('confirm') && screen === SCREEN_TITLE) startRun();
      else if (input.pressed('pause') && screen === SCREEN_PLAY) screen = SCREEN_PAUSE;
      else {
        accumulator += elapsed;
        while (accumulator >= STEP) {
          stepOnce();
          accumulator -= STEP;
          if (screen !== SCREEN_PLAY && screen !== SCREEN_TITLE) {
            accumulator = 0;
            break;
          }
        }
      }
    } else if (screen === SCREEN_PAUSE) {
      if (input.pressed('pause')) screen = SCREEN_PLAY;
    } else if (screen === SCREEN_OVER || screen === SCREEN_WIN) {
      // The world still breathes behind the end screen: sparks settle, the
      // core (or its ashes) keeps its slow pulse.
      accumulator += elapsed;
      while (accumulator >= STEP) {
        stepWorld(world, { move: { x: 0, y: 0 }, aim: { x: world.player.x + 1, y: world.player.y }, firing: false, nova: false }, STEP);
        accumulator -= STEP;
      }
      if (input.pressed('restart') || input.pressed('confirm')) startRun();
    }

    renderer.draw(world, { screen, best, remaining: enemiesRemaining(world) });
    requestAnimationFrame(frame);
  }

  window.addEventListener('keydown', () => audio.unlock(), { once: true });
  requestAnimationFrame(frame);
}

boot();

// COREWARD — keyboard and mouse state, gathered from the page and read by
// main.js once a frame. Movement and firing are level-triggered (held keys),
// the nova, pause and restart are edge-triggered: `pressed` reports a key's
// first frame down and clears itself when read, so one tap fires one nova.

const MOVE_KEYS = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
};

const ACTION_KEYS = {
  Space: 'fire',
  KeyE: 'nova',
  KeyP: 'pause', Escape: 'pause',
  KeyR: 'restart',
  Enter: 'confirm',
};

/** Creates the input state and binds it to the canvas and window. */
export function createInput(canvas) {
  const held = new Set();
  const edges = new Set();
  const mouse = { x: 0, y: 0, down: false, rightDown: false };

  function toField(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  window.addEventListener('keydown', (event) => {
    if (MOVE_KEYS[event.code] || ACTION_KEYS[event.code]) event.preventDefault();
    if (!event.repeat) {
      held.add(event.code);
      const action = ACTION_KEYS[event.code];
      if (action) edges.add(action);
    }
  });
  window.addEventListener('keyup', (event) => held.delete(event.code));
  window.addEventListener('blur', () => {
    held.clear();
    mouse.down = false;
    mouse.rightDown = false;
  });

  canvas.addEventListener('pointermove', (event) => Object.assign(mouse, toField(event)));
  canvas.addEventListener('pointerdown', (event) => {
    Object.assign(mouse, toField(event));
    if (event.button === 0) {
      mouse.down = true;
      edges.add('confirm');
    }
    if (event.button === 2) {
      mouse.rightDown = true;
      edges.add('nova');
    }
  });
  window.addEventListener('pointerup', (event) => {
    if (event.button === 0) mouse.down = false;
    if (event.button === 2) mouse.rightDown = false;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    mouse,
    /** The movement axis the held keys ask for, each side in [-1, 1]. */
    moveAxis() {
      let x = 0;
      let y = 0;
      for (const code of held) {
        const direction = MOVE_KEYS[code];
        if (direction === 'left') x -= 1;
        if (direction === 'right') x += 1;
        if (direction === 'up') y -= 1;
        if (direction === 'down') y += 1;
      }
      return { x, y };
    },
    /** Whether firing is held: the mouse button or Space. */
    firing() {
      return mouse.down || held.has('Space');
    },
    /** Reads an edge-triggered action: true once per fresh press. */
    pressed(action) {
      if (!edges.has(action)) return false;
      edges.delete(action);
      return true;
    },
  };
}

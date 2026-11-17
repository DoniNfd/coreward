// COREWARD — a small seeded random number generator (mulberry32).
//
// The simulation draws every random number from one of these, never from
// Math.random, so a world built from a seed always plays out the same way:
// the screenshot scenes in shots.js rely on that, and so does any replay.

/** Returns a function that yields the seed's stream of numbers in [0, 1). */
export function createRng(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A random float in [min, max) drawn from the stream. */
export function range(rng, min, max) {
  return min + rng() * (max - min);
}

/** A random integer in [min, max] drawn from the stream. */
export function intRange(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

/** A random point on the field's edge, where the Hollow comes in. */
export function edgePoint(rng, width, height, margin = 24) {
  const side = Math.floor(rng() * 4);
  if (side === 0) return { x: rng() * width, y: -margin };
  if (side === 1) return { x: width + margin, y: rng() * height };
  if (side === 2) return { x: rng() * width, y: height + margin };
  return { x: -margin, y: rng() * height };
}

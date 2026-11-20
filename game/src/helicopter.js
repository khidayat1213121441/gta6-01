// Police helicopter: at 3+ wanted stars an air unit joins the chase. It
// circles above the player with a visible searchlight; it never lands and
// never rams — it watches, and its spotlight keeps the heat from decaying
// while it is overhead. Pure state here; render.js draws the mesh + cone.
import { distance } from './world.js';

export function createHelicopter() {
  return { active: false, x: 0, z: 0, angle: 0, height: 230, phase: 0 };
}

export function ensureHelicopter(state) {
  if (!state.heli) state.heli = createHelicopter();
  return state.heli;
}

export function updateHelicopter(state, dt) {
  const heli = ensureHelicopter(state);
  const player = state.player;
  if (state.wanted.stars >= 3) {
    if (!heli.active) {
      heli.active = true;
      heli.phase = (state.time * 0.7) % (Math.PI * 2);
      const a = heli.phase + Math.PI / 2;
      heli.x = player.x + Math.sin(a) * 320;
      heli.z = player.z + Math.cos(a) * 320;
      state.events.push({ type: 'message', text: 'AIR-1 is overhead. The spotlight is on you.' });
    }
    heli.phase += dt * 0.45;
    const tx = player.x + Math.sin(heli.phase) * 260;
    const tz = player.z + Math.cos(heli.phase) * 260;
    const k = 1 - Math.pow(0.02, dt);
    heli.x += (tx - heli.x) * k;
    heli.z += (tz - heli.z) * k;
    heli.angle = Math.atan2(player.x - heli.x, player.z - heli.z);
    state.wanted.heliSpot = true;
  } else if (heli.active) {
    heli.active = false;
    state.wanted.heliSpot = false;
    state.events.push({ type: 'message', text: 'AIR-1 is standing down.' });
  }
  return heli;
}

/** Distance in metres from the player (10 world units = 1 m). */
export function heliDistance(state) {
  const heli = ensureHelicopter(state);
  if (!heli.active) return null;
  return Math.round(distance(heli.x, heli.z, state.player.x, state.player.z) / 10);
}

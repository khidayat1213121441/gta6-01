// Combat: punch and pistol, on foot and drive-by from a car. Bullets fly
// on the ground plane and hit peds, cars and buildings; crimes raise the
// wanted level. Particles and sound are triggered through state.events.
import { PLAYER } from './config.js';
import { collideCircle, distance } from './world.js';
import { addHeat } from './police.js';
import { scarePeds } from './traffic.js';
import { removeCar } from './vehicles.js';

export function tryPunch(state) {
  const player = state.player;
  if (player.inCar || player.punchCooldown > 0) return false;
  player.punchCooldown = PLAYER.punchCooldown;
  const px = player.x + Math.sin(player.angle) * 22;
  const pz = player.z + Math.cos(player.angle) * 22;
  let hitAnything = false;
  for (const ped of state.peds) {
    if (ped.dead) continue;
    const d = distance(px, pz, ped.x, ped.z);
    if (d > PLAYER.punchRange) continue;
    const toPed = Math.atan2(ped.x - player.x, ped.z - player.z);
    let diff = Math.abs(toPed - player.angle);
    if (diff > Math.PI) diff = Math.PI * 2 - diff;
    if (diff > PLAYER.punchArc) continue;
    hitAnything = true;
    if (ped.kind === 'cop') {
      addHeat(state, 12, 'assaulted an officer');
      ped.dead = true;
      ped.deadTimer = 4;
    } else {
      ped.dead = true;
      ped.deadTimer = 4;
      addHeat(state, 8, 'assault');
    }
    state.events.push({ type: 'punch-hit', x: ped.x, z: ped.z });
    scarePeds(state, player.x, player.z, 200);
  }
  return hitAnything;
}

export function fireBullet(state, angle) {
  const player = state.player;
  if (player.shootCooldown > 0) return false;
  player.shootCooldown = PLAYER.shootCooldown;
  const ox = player.x + Math.sin(angle) * 24;
  const oz = player.z + Math.cos(angle) * 24;
  state.bullets.push({
    x: ox, z: oz,
    vx: Math.sin(angle) * PLAYER.bulletSpeed,
    vz: Math.cos(angle) * PLAYER.bulletSpeed,
    travelled: 0,
  });
  state.gunfireTimer = 1.2;
  state.events.push({ type: 'shot', x: ox, z: oz });
  scarePeds(state, player.x, player.z, 260);
  return true;
}

export function updateBullets(state, dt) {
  const player = state.player;
  for (let i = state.bullets.length - 1; i >= 0; i -= 1) {
    const b = state.bullets[i];
    const nx = b.x + b.vx * dt;
    const nz = b.z + b.vz * dt;
    const step = Math.hypot(b.vx * dt, b.vz * dt);
    b.travelled += step;
    let dead = b.travelled > PLAYER.bulletRange;
    // Buildings stop bullets.
    const resolved = collideCircle(state.city, nx, nz, 2);
    if (resolved.hit) {
      dead = true;
      state.events.push({ type: 'spark', x: nx, z: nz });
    }
    b.x = resolved.x;
    b.z = resolved.z;
    // Peds.
    if (!dead) {
      for (const ped of state.peds) {
        if (ped.dead) continue;
        if (distance(b.x, b.z, ped.x, ped.z) < 14) {
          dead = true;
          ped.dead = true;
          ped.deadTimer = 5;
          addHeat(state, ped.kind === 'cop' ? 22 : 12, ped.kind === 'cop' ? 'shot an officer' : 'shooting');
          state.events.push({ type: 'ped-down', x: ped.x, z: ped.z });
          break;
        }
      }
    }
    // Cars (not the player's own).
    if (!dead) {
      for (const car of state.cars) {
        if (car === player.inCar) continue;
        const dx = b.x - car.x;
        const dz = b.z - car.z;
        const along = Math.abs(dx * Math.sin(car.angle) + dz * Math.cos(car.angle));
        const across = Math.abs(dx * Math.cos(car.angle) - dz * Math.sin(car.angle));
        if (along < car.length / 2 && across < car.width / 2 + 4) {
          dead = true;
          car.health -= PLAYER.bulletDamage;
          state.events.push({ type: 'spark', x: b.x, z: b.z });
          if (car.kind === 'police') {
            addHeat(state, 10, 'shot a police car');
            // Cruisers can be disabled: three hits wreck one, buying time.
            // The wanted system spawns a replacement, so this is a breather,
            // not a permanent escape.
            if (car.health <= 0) {
              state.events.push({ type: 'car-wrecked', x: car.x, z: car.z });
              removeCar(state, car);
            }
          } else if (car.health <= 0) {
            state.events.push({ type: 'car-wrecked', x: car.x, z: car.z });
            car.kind = 'parked';
            car.speed = 0;
          }
          break;
        }
      }
    }
    if (dead) state.bullets.splice(i, 1);
  }
}

export function spawnParticles(state, x, z, count, color) {
  for (let i = 0; i < count; i += 1) {
    const angle = state.rng() * Math.PI * 2;
    const speed = 40 + state.rng() * 120;
    state.particles.push({
      x, z,
      vx: Math.sin(angle) * speed,
      vz: Math.cos(angle) * speed,
      life: 0.5 + state.rng() * 0.4,
      maxLife: 0.9,
      color,
      size: 2 + state.rng() * 3,
    });
  }
}

export function updateParticles(state, dt) {
  for (let i = state.particles.length - 1; i >= 0; i -= 1) {
    const p = state.particles[i];
    p.life -= dt;
    p.x += p.vx * dt;
    p.z += p.vz * dt;
    p.vx *= 0.92;
    p.vz *= 0.92;
    if (p.life <= 0) state.particles.splice(i, 1);
  }
}

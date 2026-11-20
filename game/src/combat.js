// Combat: punch and guns, on foot and drive-by from a car. Bullets fly
// on the ground plane and hit peds, cars and buildings; crimes raise the
// wanted level. Particles and sound are triggered through state.events.
// Four weapon slots: fists are always owned, the pistol comes free, the
// SMG and shotgun are bought at Rico's Garage (shop.js) or picked up.
import { PLAYER } from './config.js';
import { collideCircle, distance } from './world.js';
import { addHeat } from './police.js';
import { scarePeds } from './traffic.js';
import { removeCar } from './vehicles.js';

export const WEAPONS = [
  { id: 'fists', slot: 1, name: 'FISTS', damage: 25, cooldown: 0.35, range: 40, price: 0, pellets: 1, spread: 0 },
  { id: 'pistol', slot: 2, name: 'PISTOL', damage: 34, cooldown: 0.28, range: 560, price: 0, pellets: 1, spread: 0 },
  { id: 'smg', slot: 3, name: 'SMG', damage: 16, cooldown: 0.09, range: 480, price: 400, pellets: 1, spread: 0.03 },
  { id: 'shotgun', slot: 4, name: 'SHOTGUN', damage: 26, cooldown: 0.7, range: 300, price: 600, pellets: 5, spread: 0.09 },
];

export function weaponById(id) {
  return WEAPONS.find((w) => w.id === id) || WEAPONS[0];
}

export function ensureWeapons(player) {
  if (!player.weapons) player.weapons = { owned: ['fists', 'pistol'], current: 'pistol' };
  if (!player.weapons.owned.includes('fists')) player.weapons.owned.unshift('fists');
  if (!player.weapons.owned.includes(player.weapons.current)) player.weapons.current = 'pistol';
  return player.weapons;
}

export function currentWeapon(player) {
  return weaponById(ensureWeapons(player).current);
}

/** Select an owned weapon. Returns true on success. */
export function selectWeapon(state, id) {
  const player = state.player;
  const w = ensureWeapons(player);
  if (!w.owned.includes(id)) return false;
  if (w.current === id) return true;
  w.current = id;
  state.events.push({ type: 'message', text: `${weaponById(id).name} out.` });
  return true;
}

/** Cycle to the next owned weapon (Q key). */
export function cycleWeapon(state) {
  const w = ensureWeapons(state.player);
  const owned = WEAPONS.filter((x) => w.owned.includes(x.id));
  const i = owned.findIndex((x) => x.id === w.current);
  selectWeapon(state, owned[(i + 1) % owned.length].id);
}

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
  const weapon = currentWeapon(player);
  if (weapon.id === 'fists') return tryPunch(state);
  if (player.shootCooldown > 0) return false;
  player.shootCooldown = weapon.cooldown;
  const ox = player.x + Math.sin(angle) * 24;
  const oz = player.z + Math.cos(angle) * 24;
  for (let p = 0; p < weapon.pellets; p += 1) {
    const spread = (p - (weapon.pellets - 1) / 2) * weapon.spread;
    const a = angle + spread;
    state.bullets.push({
      x: ox, z: oz,
      vx: Math.sin(a) * PLAYER.bulletSpeed,
      vz: Math.cos(a) * PLAYER.bulletSpeed,
      travelled: 0,
      damage: weapon.damage,
      range: weapon.range,
    });
  }
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
    let dead = b.travelled > (b.range || PLAYER.bulletRange);
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
          car.health -= (b.damage || PLAYER.bulletDamage);
          state.events.push({ type: 'spark', x: b.x, z: b.z });
          if (car.kind === 'police') {
            addHeat(state, 10, 'shot a police car');
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

export function maybeDriftDust(state, move, dt) {
  const player = state.player;
  if (!player.inCar) return;
  const car = player.inCar;
  const speed = Math.abs(car.speed);
  const drifting = speed > 220 && Math.abs(move.x) > 0.4;
  const hardBrake = speed > 220 && move.y > 0.3; // S while moving fast
  if (!drifting && !hardBrake) return;
  state.dustTimer = (state.dustTimer || 0) - dt;
  if (state.dustTimer > 0) return;
  state.dustTimer = 0.09;
  const bx = car.x - Math.sin(car.angle) * (car.length / 2 - 4);
  const bz = car.z - Math.cos(car.angle) * (car.length / 2 - 4);
  spawnParticles(state, bx, bz, 2, 0xc9b18a);
}

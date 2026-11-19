// The wanted system and the police who answer it. Stars 1–5: police cars
// spawn off-screen and chase the player (ramming the car, or closing in on
// foot), foot cops spawn nearby and try to arrest. Heat decays only when no
// cop can see the player; at 0 stars the chase ends.
import { CITY, WANTED } from './config.js';
import { collideCircle, distance, nearestRoadPoint, roadCenter } from './world.js';
import { driveCar, removeCar, spawnPoliceCar } from './vehicles.js';

const { pitch, road } = CITY;

/** Heading for driving along `axis` ('v' = +z, 'h' = +x) in direction `dir`. */
function axisAngle(axis, dir) {
  if (axis === 'v') return dir > 0 ? 0 : Math.PI;
  return dir > 0 ? Math.PI / 2 : -Math.PI / 2;
}

export function createWanted() {
  return { stars: 0, heat: 0, unseen: 0, arrestTimer: 0 };
}

export function addHeat(state, amount, reason) {
  const wanted = state.wanted;
  wanted.heat = Math.min(100, wanted.heat + amount);
  const stars = wanted.heat <= 0 ? 0
    : wanted.heat < 20 ? 1
    : wanted.heat < 40 ? 2
    : wanted.heat < 60 ? 3
    : wanted.heat < 85 ? 4 : 5;
  if (stars > wanted.stars) {
    wanted.stars = stars;
    state.events.push({ type: 'wanted-up', stars, reason });
  } else {
    wanted.stars = stars;
  }
  wanted.unseen = 0;
}

function copCountFor(stars) {
  return Math.min(WANTED.maxCopCars, stars + 1);
}

function spawnCopCar(state) {
  const player = state.player;
  // Most cruisers join the chase from behind the player's direction of
  // travel (a chase, not a roadblock); a quarter still cut across.
  let angle;
  if (state.rng() < 0.75) {
    angle = player.angle + Math.PI + (state.rng() - 0.5) * 3.5;
  } else {
    angle = state.rng() * Math.PI * 2;
  }
  const dist = 700 + state.rng() * 300;
  const x = Math.max(60, Math.min(state.city.size - 60, player.x + Math.sin(angle) * dist));
  const z = Math.max(60, Math.min(state.city.size - 60, player.z + Math.cos(angle) * dist));
  // Spawn on the road network, not inside a block: a cruiser dropped
  // in the middle of a building can never drive out to the player.
  const rp = nearestRoadPoint(x, z);
  const car = spawnPoliceCar(state, rp.x, rp.z);
  const vertical = Math.abs(rp.x - x) <= Math.abs(rp.z - z);
  if (vertical) {
    car.road = 'v';
    car.dir = player.z >= rp.z ? 1 : -1;
  } else {
    car.road = 'h';
    car.dir = player.x >= rp.x ? 1 : -1;
  }
  car.angle = axisAngle(car.road, car.dir);
  car.turnAt = -1;
  car.sirenPhase = state.rng() * Math.PI * 2;
  return car;
}

// Drive one step along the road grid toward the player. The cruiser keeps
// to its current road until an intersection, where it turns onto the cross
// road only if that lands it closer to the player (one-block lookahead).
function driveCopRoad(state, car, dt) {
  const player = state.player;
  let onV = car.road === 'v';
  let pos = onV ? car.z : car.x;
  const fixed = onV ? car.x : car.z;
  const playerPos = onV ? player.z : player.x;
  const playerFixed = onV ? player.x : player.z;
  // At an intersection, decide whether turning helps.
  const nearest = Math.round((pos - road / 2) / pitch) * pitch + road / 2;
  if (Math.abs(pos - nearest) < 10 && car.turnAt !== nearest) {
    car.turnAt = nearest;
    const dir = playerPos >= pos ? 1 : -1;
    const turnDir = playerFixed >= fixed ? 1 : -1;
    const dContinue = Math.hypot(fixed - playerFixed, pos + dir * pitch - playerPos);
    const dTurn = Math.hypot(fixed + turnDir * pitch - playerFixed, pos - playerPos);
    if (dTurn < dContinue - 4) {
      car.road = onV ? 'h' : 'v';
      car.dir = turnDir;
      // Snap onto the cross road centreline, like traffic does.
      if (onV) car.z = nearest;
      else car.x = nearest;
      onV = car.road === 'v';
      pos = onV ? car.z : car.x;
    }
  }
  const dir = (onV ? player.z : player.x) >= pos ? 1 : -1;
  car.dir = dir;
  const wantAngle = axisAngle(car.road, dir);
  let diff = wantAngle - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const steer = Math.max(-1, Math.min(1, diff * 2.2));
  driveCar(state, car, 1, steer, dt);
  // Pull back to the lane centreline so the cruiser stays on its road.
  const center = roadCenter(Math.round(((onV ? car.x : car.z) - road / 2) / pitch));
  const offset = (onV ? car.x : car.z) - center;
  if (onV) car.x -= offset * 0.03;
  else car.z -= offset * 0.03;
}

function spawnFootCop(state) {
  const player = state.player;
  const angle = state.rng() * Math.PI * 2;
  const dist = 220 + state.rng() * 120;
  const x = Math.max(30, Math.min(state.city.size - 30, player.x + Math.sin(angle) * dist));
  const z = Math.max(30, Math.min(state.city.size - 30, player.z + Math.cos(angle) * dist));
  state.peds.push({
    x, z,
    angle: 0, speed: WANTED.copFootSpeed,
    color: 0x1c3a6e, kind: 'cop',
    state: 'chase', targetX: x, targetZ: z,
    fleeTimer: 0, dead: false, deadTimer: 0,
  });
}

export function updatePolice(state, dt) {
  const wanted = state.wanted;
  const player = state.player;

  // How close is the nearest cop? That decides whether heat can decay.
  let nearestCop = Infinity;
  for (const car of state.cars) {
    if (car.kind === 'police') nearestCop = Math.min(nearestCop, distance(car.x, car.z, player.x, player.z));
  }
  for (const ped of state.peds) {
    if (ped.kind === 'cop' && !ped.dead) nearestCop = Math.min(nearestCop, distance(ped.x, ped.z, player.x, player.z));
  }
  const seen = nearestCop < 520;

  if (wanted.stars > 0) {
    if (seen) wanted.unseen = 0;
    else {
      wanted.unseen += dt;
      if (wanted.unseen > WANTED.decayUnseenSeconds) {
        wanted.unseen = 0;
        wanted.heat = Math.max(0, wanted.heat - 30);
        addHeat(state, 0);
        if (wanted.stars === 0) state.events.push({ type: 'wanted-clear' });
      }
    }

    // Keep the right number of police cars on the road.
    const copCars = state.cars.filter((c) => c.kind === 'police');
    if (copCars.length < copCountFor(wanted.stars) && state.rng() < 0.1) spawnCopCar(state);
    // Too far away? Despawn and respawn closer (keeps the chase fair).
    for (const car of copCars) {
      if (distance(car.x, car.z, player.x, player.z) > 1400) removeCar(state, car);
    }
    // Foot cops only when the player is on foot.
    const footCops = state.peds.filter((p) => p.kind === 'cop' && !p.dead);
    if (!player.inCar && footCops.length < Math.min(3, wanted.stars) && state.rng() < 0.03) {
      spawnFootCop(state);
    }
  }

  // --- police cars chase and ram ---
  // Cruisers drive the road grid toward the player (driveCopRoad) instead
  // of beelining through buildings, which wedged them against walls
  // forever. Inside 130 units they switch to a direct run at the player
  // for the ram. On foot the player outruns a cruiser through the alleys:
  // cop speed is capped below run speed so losing them on foot is possible.
  for (const car of state.cars) {
    if (car.kind !== 'police') continue;
    car.sirenPhase += dt * 6;
    car.ramCd = Math.max(0, (car.ramCd || 0) - dt);
    const dx = player.x - car.x;
    const dz = player.z - car.z;
    const dist = Math.hypot(dx, dz) || 1;
    const fullSpeed = Math.min(WANTED.copCarSpeed, 240 + wanted.stars * 45);
    const speed = player.inCar ? fullSpeed : Math.min(fullSpeed, 200);
    if (dist < 130) {
      const targetAngle = Math.atan2(dx, dz);
      let diff = targetAngle - car.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const steer = Math.max(-1, Math.min(1, diff * 2.2));
      const throttle = dist > 60 ? 1 : 0.4;
      // Temporarily raise the cap for the chase by driving at full throttle;
      // driveCar's own cap still applies, cops just hold top speed longer.
      driveCar(state, car, throttle, steer, dt);
    } else {
      driveCopRoad(state, car, dt);
    }
    if (car.speed > speed) car.speed = speed;
    // Ram: one discrete hit per cruiser per second, not a continuous hose —
    // a cop glued to the player used to melt a car in seconds. The hit
    // also knocks the cruiser back so it has to re-acquire.
    if (dist < 46 && car.ramCd <= 0) {
      car.ramCd = 1.2;
      if (player.inCar) {
        player.inCar.health -= 5;
        if (player.inCar.health <= 0) {
          state.events.push({ type: 'car-wrecked' });
          player.inCar.health = 0;
        }
      } else if (player.invulnerable <= 0) {
        player.health -= 6;
      }
      car.speed *= 0.5;
    }
  }

  // --- foot cops chase and arrest ---
  for (const ped of state.peds) {
    if (ped.kind !== 'cop' || ped.dead) continue;
    const dx = player.x - ped.x;
    const dz = player.z - ped.z;
    const dist = Math.hypot(dx, dz) || 1;
    ped.angle = Math.atan2(dx, dz);
    if (!player.inCar && dist < 30) {
      // Close in slowly: the arrest timer is the player's warning.
      wanted.arrestTimer += dt;
      if (wanted.arrestTimer >= WANTED.arrestSeconds) {
        wanted.arrestTimer = 0;
        state.events.push({ type: 'busted' });
      }
    } else {
      wanted.arrestTimer = Math.max(0, wanted.arrestTimer - dt * 2);
    }
    if (dist > 14) {
      // If a building has the cop pinned (it barely moved for a while),
      // step sideways around it instead of pushing at the wall forever.
      // Only when genuinely stuck — a fleeing player outrunning the cop
      // is not a stuck cop.
      ped.sampleT = (ped.sampleT || 0) + dt;
      if (ped.sampleT >= 0.5) {
        ped.sampleT = 0;
        if (ped.lastX !== undefined) {
          const moved = Math.hypot(ped.x - ped.lastX, ped.z - ped.lastZ);
          if (moved < 10 && dist > 40) {
            ped.sideT = 0.9;
            ped.sideDir = state.rng() < 0.5 ? 1 : -1;
          }
        }
        ped.lastX = ped.x;
        ped.lastZ = ped.z;
      }
      let mx;
      let mz;
      if (ped.sideT > 0) {
        ped.sideT -= dt;
        mx = (-dz / dist) * (ped.sideDir || 1);
        mz = (dx / dist) * (ped.sideDir || 1);
      } else {
        mx = dx / dist;
        mz = dz / dist;
      }
      const nx = ped.x + mx * ped.speed * dt;
      const nz = ped.z + mz * ped.speed * dt;
      const resolved = collideCircle(state.city, nx, nz, 10);
      ped.x = resolved.x;
      ped.z = resolved.z;
    }
  }
}

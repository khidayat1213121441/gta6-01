// Traffic and pedestrians: road-following AI on the ground plane.
// Traffic cars drive along a road centreline and turn at intersections;
// pedestrians stroll the sidewalks and flee from gunfire and speeding cars.
import { CITY, PEDS, TRAFFIC } from './config.js';
import { collideCircle, distance, roadCenter } from './world.js';
import { driveCar, makeCar, separateCars, spawnParkedCar } from './vehicles.js';
import { randomInt, randomPick } from './random.js';

const PED_COLORS = [0xe8e0d0, 0x3a6fd2, 0xd23b2e, 0x2ed2a2, 0xe0a53a, 0x8a2be2, 0x5a6a7d, 0xf2c94c];
const { pitch, size } = CITY;

function spawnTrafficCar(state, rng) {
  const vertical = rng() < 0.5;
  const roadIndex = randomInt(rng, 0, 39);
  const along = 60 + rng() * (size - 120);
  const center = roadCenter(roadIndex);
  const lane = rng() < 0.5 ? -11 : 11;
  const x = vertical ? center + lane : along;
  const z = vertical ? along : center + lane;
  const angle = vertical ? (lane < 0 ? 0 : Math.PI) : (lane < 0 ? Math.PI / 2 : -Math.PI / 2);
  const car = makeCar(state, x, z, angle, 'traffic', Math.floor(rng() * 8));
  car.road = vertical ? 'v' : 'h';
  car.dir = lane < 0 ? 1 : -1;
  car.cruise = TRAFFIC.speed + (rng() - 0.5) * TRAFFIC.speedJitter;
  car.speed = car.cruise;
  return car;
}

function spawnPed(state, rng, nearX, nearZ) {
  let x;
  let z;
  if (nearX !== undefined) {
    x = nearX + (rng() - 0.5) * 300;
    z = nearZ + (rng() - 0.5) * 300;
  } else {
    x = rng() * size;
    z = rng() * size;
  }
  x = Math.max(30, Math.min(size - 30, x));
  z = Math.max(30, Math.min(size - 30, z));
  const ped = {
    x, z,
    angle: rng() * Math.PI * 2,
    speed: PEDS.walkSpeed * (0.7 + rng() * 0.6),
    color: randomPick(rng, PED_COLORS),
    kind: 'ped',
    state: 'walk',
    targetX: x,
    targetZ: z,
    fleeTimer: 0,
    dead: false,
    deadTimer: 0,
  };
  state.peds.push(ped);
  return ped;
}

/** Fill the world around the player with traffic and pedestrians. */
export function populateTraffic(state, rng) {
  for (let i = 0; i < TRAFFIC.count; i += 1) spawnTrafficCar(state, rng);
  for (let i = 0; i < 6; i += 1) spawnParkedCar(state, rng);
  for (let i = 0; i < PEDS.count; i += 1) {
    spawnPed(state, rng, state.player.x, state.player.z);
  }
}

function pickPedTarget(ped, rng) {
  // Walk along the nearest road's sidewalk, in a random direction.
  const ix = Math.round((ped.x - 24) / pitch);
  const iz = Math.round((ped.z - 24) / pitch);
  const cx = roadCenter(Math.max(0, Math.min(39, ix)));
  const cz = roadCenter(Math.max(0, Math.min(39, iz)));
  const vertical = Math.abs(ped.x - cx) < Math.abs(ped.z - cz);
  const dir = rng() < 0.5 ? -1 : 1;
  const dist = 120 + rng() * 320;
  if (vertical) {
    ped.targetX = cx + (rng() < 0.5 ? -30 : 30);
    ped.targetZ = ped.z + dir * dist;
  } else {
    ped.targetX = ped.x + dir * dist;
    ped.targetZ = cz + (rng() < 0.5 ? -30 : 30);
  }
}

export function updateTraffic(state, dt) {
  const rng = state.rng;
  const player = state.player;

  // --- traffic cars: follow their road, turn at intersections ---
  for (const car of state.cars) {
    if (car.kind !== 'traffic') continue;
    // Slow for the car ahead on the same road.
    let ahead = null;
    for (const other of state.cars) {
      if (other === car) continue;
      const dx = other.x - car.x;
      const dz = other.z - car.z;
      const forward = dx * Math.sin(car.angle) + dz * Math.cos(car.angle);
      const side = Math.abs(dx * Math.cos(car.angle) - dz * Math.sin(car.angle));
      if (forward > 0 && forward < 90 && side < 30) {
        if (!ahead || forward < ahead) ahead = forward;
      }
    }
    let throttle = car.speed < (car.cruise || 130) ? 0.6 : -0.1;
    if (ahead !== null) throttle = ahead < 45 ? -0.5 : 0.1;
    // At an intersection, sometimes turn.
    const onV = car.road === 'v';
    const pos = onV ? car.z : car.x;
    const nearest = Math.round((pos - 24) / pitch) * pitch + 24;
    if (Math.abs(pos - nearest) < 6 && car.turnAt !== nearest) {
      car.turnAt = nearest;
      if (rng() < 0.3) {
        car.road = onV ? 'h' : 'v';
        const turn = rng() < 0.5 ? 1 : -1;
        const targetAngle = onV
          ? (turn > 0 ? Math.PI / 2 : -Math.PI / 2)
          : (turn > 0 ? Math.PI : 0);
        // Snap the car onto the new road centreline.
        if (onV) car.z = nearest;
        else car.x = nearest;
        car.angle = targetAngle;
        car.dir = turn;
      }
    }
    const steer = 0;
    driveCar(state, car, throttle, steer, dt);
    // Keep traffic on its road: gentle pull back to the lane.
    const center = roadCenter(Math.round(((onV ? car.x : car.z) - 24) / pitch));
    const offset = (onV ? car.x : car.z) - center;
    const lane = car.dir > 0 ? -11 : 11;
    const correction = (lane - offset) * 0.02;
    if (onV) car.x += correction;
    else car.z += correction;
  }
  separateCars(state);

  // --- pedestrians ---
  let alive = 0;
  for (const ped of state.peds) {
    if (ped.dead) {
      ped.deadTimer -= dt;
      continue;
    }
    // Foot cops are driven by police.js, not the pedestrian AI: the walker
    // logic would drag them toward random sidewalk targets mid-chase and
    // they would never close in to arrest.
    if (ped.kind === 'cop') continue;
    alive += 1;
    const dPlayer = distance(ped.x, ped.z, player.x, player.z);
    if (ped.state === 'flee') {
      ped.fleeTimer -= dt;
      if (ped.fleeTimer <= 0) ped.state = 'walk';
    } else if (dPlayer < 90 && (state.wanted.stars >= 1 || state.gunfireTimer > 0)) {
      ped.state = 'flee';
      ped.fleeTimer = 2 + rng() * 2;
    }
    let tx;
    let tz;
    if (ped.state === 'flee') {
      tx = ped.x + (ped.x - player.x);
      tz = ped.z + (ped.z - player.z);
    } else {
      if (distance(ped.x, ped.z, ped.targetX, ped.targetZ) < 12) pickPedTarget(ped, rng);
      tx = ped.targetX;
      tz = ped.targetZ;
    }
    const dx = tx - ped.x;
    const dz = tz - ped.z;
    const d = Math.hypot(dx, dz) || 1;
    const speed = ped.state === 'flee' ? ped.speed * 2.4 : ped.speed;
    ped.angle = Math.atan2(dx, dz);
    const nx = ped.x + (dx / d) * speed * dt;
    const nz = ped.z + (dz / d) * speed * dt;
    const resolved = collideCircle(state.city, nx, nz, 10);
    ped.x = resolved.x;
    ped.z = resolved.z;
  }
  // Top up pedestrians near the player so the streets stay alive.
  if (alive < PEDS.count && rng() < 0.05) {
    spawnPed(state, rng, player.x, player.z);
  }
  // Remove long-dead peds.
  state.peds = state.peds.filter((ped) => !ped.dead || ped.deadTimer > 0);
}

export function scarePeds(state, x, z, radius) {
  for (const ped of state.peds) {
    if (!ped.dead && distance(ped.x, ped.z, x, z) < radius) {
      ped.state = 'flee';
      ped.fleeTimer = 2.5;
    }
  }
}

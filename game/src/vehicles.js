// Cars: spawning, arcade driving physics and damage. A car is plain data
// (x/z on the ground plane, angle, speed); render.js builds the 3D mesh
// from it. Driving is deliberately arcade: throttle, steering that bites
// harder the faster you go, and a hard stop against buildings.
import { CAR } from './config.js';
import { collideCircle, distance } from './world.js';

const MODELS = [
  { name: 'Solmar Sedan', color: 0xd23b2e, length: 54, width: 26 },
  { name: 'Beach Coupe', color: 0x2e7fd2, length: 52, width: 25 },
  { name: 'Barrio Pickup', color: 0xe0a53a, length: 58, width: 27 },
  { name: 'Downtown Sport', color: 0x8a2be2, length: 50, width: 25 },
  { name: 'Marina Cabrio', color: 0x2ed2a2, length: 52, width: 25 },
  { name: 'City Taxi', color: 0xf2c94c, length: 54, width: 26 },
  { name: 'Harbor Van', color: 0xd8d8d8, length: 62, width: 28 },
  { name: 'Night Cruiser', color: 0x1c2733, length: 56, width: 26 },
];

let nextId = 1;

export function makeCar(state, x, z, angle, kind, modelIndex) {
  const model = MODELS[modelIndex % MODELS.length];
  const car = {
    id: nextId,
    x, z, angle,
    speed: 0,
    color: model.color,
    model: model.name,
    length: model.length,
    width: model.width,
    kind, // 'player' | 'traffic' | 'police' | 'parked'
    health: CAR.healthMax,
    sirenPhase: 0,
    road: 'v',
    dir: 1,
    turnAt: 0,
    targetX: x,
    targetZ: z,
  };
  nextId += 1;
  state.cars.push(car);
  return car;
}

/** A parked car on a roadside, ready to steal. */
export function spawnParkedCar(state, rng) {
  const vertical = rng() < 0.5;
  const roadIndex = Math.floor(rng() * 40);
  const along = 100 + rng() * (state.city.size - 200);
  const center = roadIndex * 144 + 24;
  const side = rng() < 0.5 ? -1 : 1;
  const angle = vertical ? (rng() < 0.5 ? 0 : Math.PI) : (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
  const x = vertical ? center + side * 14 : along;
  const z = vertical ? along : center + side * 14;
  return makeCar(state, x, z, angle, 'parked', Math.floor(rng() * 8));
}

export function spawnPoliceCar(state, x, z) {
  const car = makeCar(state, x, z, 0, 'police', 0);
  car.color = 0xe8e8e8; // white Solmar PD cruiser, light bar does the talking
  car.length = 56;
  car.width = 27;
  return car;
}

/**
 * One step of arcade driving. Returns true when the car hit something hard
 * (building or world edge) this step.
 */
export function driveCar(state, car, throttle, steer, dt) {
  const accel = throttle > 0 ? CAR.accel : CAR.reverseAccel;
  car.speed += throttle * accel * dt;
  if (throttle === 0) {
    const drag = Math.min(Math.abs(car.speed), 240 * dt);
    car.speed -= Math.sign(car.speed) * drag;
  }
  const maxF = car.speed >= 0 ? CAR.maxSpeed : CAR.maxReverse;
  car.speed = Math.max(-CAR.maxReverse, Math.min(CAR.maxSpeed, car.speed));
  if (Math.abs(car.speed) > maxF) car.speed = Math.sign(car.speed) * maxF;
  const steerAuthority = Math.min(1, Math.abs(car.speed) / 120);
  car.angle += steer * CAR.turnRate * steerAuthority * dt * Math.sign(car.speed || 1);

  const nx = car.x + Math.sin(car.angle) * car.speed * dt;
  const nz = car.z + Math.cos(car.angle) * car.speed * dt;
  const resolved = collideCircle(state.city, nx, nz, car.width / 2 + 4);
  const hit = resolved.hit;
  if (hit) {
    const impact = Math.abs(car.speed);
    car.speed *= -0.25;
    // quarter of the car's health.
    const finale = state.mission && (state.mission.index === 4 || state.mission.index === 5 || state.mission.index === 7) && !state.mission.done;
    if (impact > 180) car.health -= (impact - 180) * 0.05 * (finale ? 0.5 : 1);
  }
  car.x = resolved.x;
  car.z = resolved.z;
  return hit;
}

/** Soft push-apart between two cars so traffic does not overlap. */
export function separateCars(state) {
  const cars = state.cars;
  for (let i = 0; i < cars.length; i += 1) {
    for (let j = i + 1; j < cars.length; j += 1) {
      const a = cars[i];
      const b = cars[j];
      const d = distance(a.x, a.z, b.x, b.z);
      const min = (a.length + b.length) / 4;
      if (d > 0.01 && d < min) {
        const push = (min - d) / 2;
        const nx = (b.x - a.x) / d;
        const nz = (b.z - a.z) / d;
        a.x -= nx * push;
        a.z -= nz * push;
        b.x += nx * push;
        b.z += nz * push;
        if (a.kind === 'traffic' || b.kind === 'traffic') {
          a.speed *= 0.9;
          b.speed *= 0.9;
        }
      }
    }
  }
}

export function nearestCar(state, x, z, maxDist, kinds) {
  let best = null;
  let bestD = maxDist;
  for (const car of state.cars) {
    if (kinds && !kinds.includes(car.kind)) continue;
    const d = distance(x, z, car.x, car.z);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}

export function removeCar(state, car) {
  const index = state.cars.indexOf(car);
  if (index !== -1) state.cars.splice(index, 1);
}

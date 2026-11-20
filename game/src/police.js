// The wanted system and the police who answer it. Stars 1–5: police cars
// spawn off-screen and chase the player (ramming the car, or closing in on
// foot), foot cops spawn nearby and try to arrest. Heat decays only when no
// cop can see the player; at 0 stars the chase ends.
import { CITY, WANTED } from './config.js';
import { collideCircle, distance, nearestRoadPoint, roadCenter } from './world.js';
import { driveCar, removeCar, spawnPoliceCar } from './vehicles.js';
import { updateHelicopter } from './helicopter.js';

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

function copCountForMission(state, stars) {
  const n = copCountFor(stars);
  if (state.mission.index === 5 && !state.mission.done) return Math.min(n, 4);
  if (state.mission.index === 7 && !state.mission.done) return Math.min(n, 3);
  return n;
}

function spawnCopCar(state) {
  const player = state.player;
  let angle;
  if (state.rng() < 0.75) {
    angle = player.angle + Math.PI + (state.rng() - 0.5) * 3.5;
  } else {
    angle = state.rng() * Math.PI * 2;
  }
  const dist = 700 + state.rng() * 300;
  const x = Math.max(60, Math.min(state.city.size - 60, player.x + Math.sin(angle) * dist));
  const z = Math.max(60, Math.min(state.city.size - 60, player.z + Math.cos(angle) * dist));
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

function driveCopRoad(state, car, dt) {
  const player = state.player;
  let onV = car.road === 'v';
  let pos = onV ? car.z : car.x;
  const fixed = onV ? car.x : car.z;
  const playerPos = onV ? player.z : player.x;
  const playerFixed = onV ? player.x : player.z;
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

function spawnRoadblock(state) {
  const player = state.player;
  const ahead = nearestRoadPoint(
    player.x + Math.sin(player.angle) * 480,
    player.z + Math.cos(player.angle) * 480,
  );
  const across = Math.abs(Math.sin(player.angle)) >= Math.abs(Math.cos(player.angle)) ? 'v' : 'h';
  const cars = [];
  for (const offset of [-22, 22]) {
    const x = across === 'v' ? ahead.x + offset : ahead.x;
    const z = across === 'v' ? ahead.z : ahead.z + offset;
    const car = spawnPoliceCar(state, x, z);
    car.angle = across === 'v' ? Math.PI / 2 : 0; // parked across the road
    car.speed = 0;
    car.roadblock = true;
    car.ramCd = 0;
    cars.push(car);
  }
  state.roadblocks.push({ x: ahead.x, z: ahead.z, cars });
  state.events.push({ type: 'message', text: 'Roadblock ahead — Solmar PD is boxing you in.' });
}

function updateRoadblocks(state, dt) {
  if (!state.roadblocks) state.roadblocks = [];
  const player = state.player;
  if (state.wanted.stars >= 4) {
    state.roadblockTimer = Math.max(0, (state.roadblockTimer || 0) - dt);
    const live = state.roadblocks.filter((rb) => distance(rb.x, rb.z, player.x, player.z) < 1200);
    if (live.length === 0 && state.roadblockTimer <= 0 && state.rng() < 0.05) {
      spawnRoadblock(state);
      state.roadblockTimer = 8;
    }
  } else if (state.roadblocks.length > 0) {
    for (const rb of state.roadblocks) for (const car of rb.cars) removeCar(state, car);
    state.roadblocks = [];
  }
  // Prune roadblocks left far behind.
  state.roadblocks = state.roadblocks.filter((rb) => {
    if (distance(rb.x, rb.z, player.x, player.z) > 1400) {
      for (const car of rb.cars) removeCar(state, car);
      return false;
    }
    return true;
  });
}

/** Live police units for the HUD dispatch panel: callsign, role, metres. */
export function dispatchUnits(state) {
  const player = state.player;
  const units = [];
  const m = (d) => Math.max(1, Math.round(d / 10));
  if (state.heli && state.heli.active) {
    units.push({ callsign: 'AIR-1', role: 'SPOTLIGHT', dist: m(distance(state.heli.x, state.heli.z, player.x, player.z)) });
  }
  for (const rb of state.roadblocks || []) {
    units.push({ callsign: 'RB-1', role: 'ROADBLOCK', dist: m(distance(rb.x, rb.z, player.x, player.z)) });
  }
  const cruisers = state.cars
    .filter((c) => c.kind === 'police' && !c.roadblock)
    .map((c) => ({ car: c, d: distance(c.x, c.z, player.x, player.z) }))
    .sort((a, b) => a.d - b.d);
  cruisers.forEach(({ car, d }, i) => {
    units.push({ callsign: `PD-${i + 1}`, role: d < 150 ? 'RAMMING' : 'CLOSING IN', dist: m(d) });
  });
  return units.slice(0, 5);
}

export function updatePolice(state, dt) {
  const wanted = state.wanted;
  const player = state.player;

  updateHelicopter(state, dt);
  updateRoadblocks(state, dt);

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
      wanted.unseen += dt * (wanted.heliSpot ? 0.5 : 1);
      if (wanted.unseen > WANTED.decayUnseenSeconds) {
        wanted.unseen = 0;
        wanted.heat = Math.max(0, wanted.heat - 30);
        addHeat(state, 0);
        if (wanted.stars === 0) state.events.push({ type: 'wanted-clear' });
      }
    }

    const copCars = state.cars.filter((c) => c.kind === 'police' && !c.roadblock);
    if (copCars.length < copCountForMission(state, wanted.stars) && state.rng() < 0.1) spawnCopCar(state);
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
  for (const car of state.cars) {
    if (car.kind !== 'police') continue;
    car.sirenPhase += dt * 6;
    car.ramCd = Math.max(0, (car.ramCd || 0) - dt);
    if (car.roadblock) {
      const rdx = player.x - car.x;
      const rdz = player.z - car.z;
      const rdist = Math.hypot(rdx, rdz) || 1;
      if (rdist < 46 && car.ramCd <= 0) {
        car.ramCd = 1.5;
        if (player.inCar) {
          player.inCar.health -= 6;
          player.inCar.speed *= 0.35;
          if (player.inCar.health <= 0) {
            state.events.push({ type: 'car-wrecked' });
            player.inCar.health = 0;
          }
        } else if (player.invulnerable <= 0) {
          player.health -= 6;
        }
        state.events.push({ type: 'ram', x: car.x, z: car.z });
      }
      continue;
    }
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
      driveCar(state, car, throttle, steer, dt);
    } else {
      driveCopRoad(state, car, dt);
    }
    if (car.speed > speed) car.speed = speed;
    if (dist < 46 && car.ramCd <= 0) {
      // how many cruisers glue on at once.
      const finale = (state.mission.index === 4 || state.mission.index === 5 || state.mission.index === 7) && !state.mission.done;
      car.ramCd = finale ? 1.8 : 1.2;
      if (player.inCar) {
        player.inCar.health -= finale ? 3 : 5;
        if (player.inCar.health <= 0) {
          state.events.push({ type: 'car-wrecked' });
          player.inCar.health = 0;
        }
      } else if (player.invulnerable <= 0) {
        // Armor soaks the ram first.
        let dmg = 6;
        const armor = player.armor || 0;
        if (armor > 0) {
          const soaked = Math.min(armor, dmg);
          player.armor = armor - soaked;
          dmg -= soaked;
        }
        player.health -= dmg;
      }
      car.speed *= 0.5;
      state.events.push({ type: 'ram', x: car.x, z: car.z });
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
      wanted.arrestTimer += dt;
      if (wanted.arrestTimer >= WANTED.arrestSeconds) {
        wanted.arrestTimer = 0;
        state.events.push({ type: 'busted' });
      }
    } else {
      wanted.arrestTimer = Math.max(0, wanted.arrestTimer - dt * 2);
    }
    if (dist > 14) {
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

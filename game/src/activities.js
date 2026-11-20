// Side activities: taxi fares in free roam, hidden packages, saving
// at the garage, and the street race — a checkpoint loop around downtown.
// Fares appear once the cab mission is done (or from the start in free
// roam); a fare pays on delivery. Packages pay on pickup and count toward
// package missions (3 and 7) while they run.
import { PACKAGE_REWARD, RACE_REWARD, TAXI_FARE_MAX, TAXI_FARE_MIN } from './config.js';
import { distance, randomRoadPoint, roadCenter } from './world.js';
import { addRespect, currentMission } from './missions.js';

/** Four checkpoints: a loop around downtown, starting east of the garage
 * (far enough from the mission-1 spawn that it never starts by accident). */
export function raceCheckpoints() {
  return [
    { x: roadCenter(24), z: roadCenter(27) },
    { x: roadCenter(24), z: roadCenter(20) },
    { x: roadCenter(20), z: roadCenter(20) },
    { x: roadCenter(20), z: roadCenter(27) },
  ];
}

export function createRace() {
  return { active: false, idx: 0, timer: 0, best: 0, checkpoints: raceCheckpoints(), target: null };
}

function newFare(state) {
  const rng = state.rng;
  const pickup = randomRoadPoint(rng);
  const dest = randomRoadPoint(rng);
  state.taxi = {
    active: true,
    hasPassenger: false,
    px: pickup.x, pz: pickup.z,
    dx: dest.x, dz: dest.z,
    fare: TAXI_FARE_MIN + Math.floor(rng() * (TAXI_FARE_MAX - TAXI_FARE_MIN)),
    fareTimer: 0,
  };
  state.events.push({ type: 'message', text: 'Taxi fare nearby — pick up the passenger.' });
}

export function updateActivities(state, dt) {
  const player = state.player;

  // --- hidden packages ---
  for (const pkg of state.city.packages) {
    if (pkg.taken) continue;
    if (distance(player.x, player.z, pkg.x, pkg.z) < 42) {
      pkg.taken = true;
      player.cash += PACKAGE_REWARD;
      state.stats.packages += 1;
      const def = currentMission(state);
      if (def && def.packages && !state.mission.done) state.mission.count += 1;
      state.events.push({ type: 'package', reward: PACKAGE_REWARD, x: pkg.x, z: pkg.z });
    }
  }

  // --- taxi fares (free roam only; mission 2 runs its own fare) ---
  if (state.mission.index !== 1) {
    if (!state.taxi || !state.taxi.active) {
      state.taxi = state.taxi || { active: false, hasPassenger: false, px: 0, pz: 0, dx: 0, dz: 0, fare: 0, fareTimer: 0 };
      state.taxi.fareTimer += dt;
      if (state.taxi.fareTimer > 14 && state.rng() < 0.02) newFare(state);
    } else if (!state.taxi.hasPassenger) {
      if (player.inCar && distance(player.x, player.z, state.taxi.px, state.taxi.pz) < 80) {
        state.taxi.hasPassenger = true;
        state.events.push({ type: 'message', text: 'Passenger aboard. Follow the marker.' });
      }
    } else if (distance(player.x, player.z, state.taxi.dx, state.taxi.dz) < 90) {
      if (Number.isFinite(state.taxi.fare) && state.taxi.fare > 0) {
        player.cash += state.taxi.fare;
        state.stats.fares += 1;
        state.events.push({ type: 'fare-paid', reward: state.taxi.fare });
      }
      state.taxi.active = false;
      state.taxi.fareTimer = 0;
    }
  }

  // --- street race: drive through the start line by the garage ---
  if (!state.race) state.race = createRace();
  const race = state.race;
  if (!race.active) {
    race.target = race.checkpoints[0];
    if (player.inCar && distance(player.x, player.z, race.checkpoints[0].x, race.checkpoints[0].z) < 70) {
      race.active = true;
      race.idx = 1;
      race.timer = 0;
      race.target = race.checkpoints[1];
      state.events.push({ type: 'message', text: 'Street race! Hit all 3 checkpoints — fastest lap wins the pot.' });
    }
  } else {
    race.timer += dt;
    if (!player.inCar) {
      race.active = false;
      race.target = race.checkpoints[0];
      state.events.push({ type: 'message', text: 'Race abandoned — you left the car.' });
    } else if (distance(player.x, player.z, race.checkpoints[race.idx].x, race.checkpoints[race.idx].z) < 80) {
      race.idx += 1;
      if (race.idx >= race.checkpoints.length) {
        race.active = false;
        race.target = race.checkpoints[0];
        player.cash += RACE_REWARD;
        addRespect(state, 40);
        if (!race.best || race.timer < race.best) race.best = race.timer;
        state.events.push({ type: 'message', text: `Race won in ${race.timer.toFixed(1)}s — +$${RACE_REWARD} and +40 respect.` });
      } else {
        race.target = race.checkpoints[race.idx];
        state.events.push({ type: 'message', text: `Checkpoint ${race.idx}/${race.checkpoints.length - 1} — keep it pinned.` });
      }
    }
  }

  // --- garage save: drive into the garage marker to save progress ---
  const garage = state.city.landmarks.garage;
  if (distance(player.x, player.z, garage.x, garage.z) < 80) {
    state.saveTimer = (state.saveTimer || 0) + dt;
    if (state.saveTimer > 1.2) {
      state.saveTimer = 0;
      state.events.push({ type: 'save' });
    }
  } else {
    state.saveTimer = 0;
  }
}
